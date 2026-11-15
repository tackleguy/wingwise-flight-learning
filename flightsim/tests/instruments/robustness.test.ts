import { describe, expect, it } from "vitest";
import { INSTRUMENT_LIMITS, createInstruments } from "@/instruments";
import type { InstrumentState } from "@/core/types";
import { makeSim } from "../helpers";
import { cruise, makeRig } from "./pilot";

const numbersOf = (ind: InstrumentState) => Object.entries(ind).filter(([, v]) => typeof v === "number") as [string, number][];

describe("instruments: determinism and robustness", () => {
  it("the same flight gives exactly the same indications", async () => {
    const fly = async (seed: number) => {
      const { sim, pilot } = await makeRig(cruise(30), { seed, setup: (s) => (s.env.turbulence = 0.3) });
      const s = sim.state;
      pilot.fly(20, { altFt: 3500, bankDeg: 20, kcas: 95 });
      s.sys.failures.vacuum = true;
      pilot.fly(120, { altFt: 3500, bankDeg: -25, kcas: 105 });
      pilot.fly(10, { pitchDeg: 20, bankDeg: 110, rudder: 0.5 });
      pilot.fly(30, { pitchDeg: 0, bankDeg: 0 });
      return JSON.stringify(s.ind);
    };
    const a = await fly(1);
    const b = await fly(1);
    const c = await fly(2);
    expect(b).toBe(a);
    expect(c).not.toBe(a); // a different seed gives a different (equally plausible) set of imperfections
  });

  it("survives 10 minutes of aerobatic nonsense, failures and knob twiddling without a single bad number", async () => {
    const start = cruise(360, 40, -100, { altFtMsl: 12000, kias: 110 });
    const { sim, inst } = await makeRig(start, { setup: (s) => (s.env.turbulence = 0.5) });
    const s = sim.state;
    const c = sim.controls;
    const dt = 1 / 120;
    let seed = 987654321;
    const rnd = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
    const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
    const bad: string[] = [];
    let steps = 0;
    let maxRoll = 0;
    let maxPitch = 0;
    let attTumbles = 0;
    let dgTumbles = 0;
    let wasAtt = false;
    let wasDg = false;
    let respawns = 0;
    const step = () => {
      sim.advance(dt);
      steps++;
      maxRoll = Math.max(maxRoll, Math.abs(s.roll));
      maxPitch = Math.max(maxPitch, Math.abs(s.pitch));
      if (inst.status.attitudeTumbling && !wasAtt) attTumbles++;
      wasAtt = inst.status.attitudeTumbling;
      if (inst.status.headingTumbling && !wasDg) dgTumbles++;
      wasDg = inst.status.headingTumbling;
      const i = s.ind;
      const sum = i.ias + i.alt + i.vs + i.attPitch + i.attRoll + i.dgMag + i.compassMag + i.turnRate + i.ball + i.tachRpm + i.hobbs + i.fuelLeftGal + i.fuelRightGal + i.oilTempF + i.oilPressPsi + i.egtF + i.suctionInHg + i.ammeterA + i.clockUtcSec + i.oatC;
      const inRange =
        i.ias >= 0 && i.dgMag >= 0 && i.dgMag < 360 && i.compassMag >= 0 && i.compassMag < 360 && Math.abs(i.ball) <= 1 && Math.abs(i.turnRate) <= 2.2001 &&
        Math.abs(i.vs) <= 2000.001 && Math.abs(i.attPitch) <= 90.001 && Math.abs(i.attRoll) <= 180.001 && i.fuelLeftGal >= 0 && i.fuelRightGal >= 0;
      if ((!Number.isFinite(sum) || !inRange) && bad.length < 5) bad.push(`t=${s.time.toFixed(2)} ${JSON.stringify(i)}`);
    };

    while (steps < 600 * 120) {
      if (s.crash) {
        // flew into the ground while fooling around: start again at altitude (the instruments must cope with that too)
        respawns++;
        await sim.spawn(start);
        continue;
      }
      if (s.altMslFt > 7000) {
        // nonsense: random full-travel control inputs, switches, knobs and failures for a few seconds
        c.elevator = rnd() * 2 - 1;
        c.aileron = rnd() * 2 - 1;
        c.rudder = rnd() * 2 - 1;
        c.throttle = rnd();
        c.flapIndex = Math.floor(rnd() * 4);
        c.altimeterInHg = 27 + rnd() * 5;
        c.dgAdjustDeg += (rnd() - 0.5) * 400;
        s.sys.failures.vacuum = rnd() < 0.3;
        s.sys.failures.pitot = rnd() < 0.3;
        s.sys.failures.staticPort = rnd() < 0.3;
        if (rnd() < 0.2) inst.alignHeadingIndicator();
        const hold = 0.3 + rnd() * 2.5;
        for (let t = 0; t < hold && !s.crash; t += dt) step();
      } else {
        // recover (unstall first, then level the wings, then raise the nose) and climb back up
        c.flapIndex = 0;
        for (let t = 0; t < 400 && !s.crash && s.altMslFt < 9500 && steps < 600 * 120; t += dt) {
          const stalled = s.alphaDeg > 13 || s.kcas < 58;
          const upright = Math.abs(s.roll) < 70;
          c.throttle = s.kcas > 125 ? 0 : 1;
          c.rudder = clamp(-s.yawRate * 0.03, -1, 1);
          c.aileron = stalled ? 0 : clamp(-s.roll * 0.06 - s.rollRate * 0.025, -1, 1);
          c.elevator = stalled ? -0.35 : upright ? clamp(((s.kcas > 85 ? 9 : 2) - s.pitch) * 0.08 - s.pitchRate * 0.03, -0.4, 0.5) : 0;
          step();
        }
      }
    }
    expect(bad).toEqual([]);
    expect(steps).toBe(600 * 120);
    // it really was nonsense: far past the gimbal limits of both gyros, several tumbles
    expect(maxRoll).toBeGreaterThan(110);
    expect(maxPitch).toBeGreaterThan(62);
    expect(attTumbles).toBeGreaterThan(1);
    expect(dgTumbles).toBeGreaterThan(1);
    expect(respawns).toBeLessThan(20);
    for (const [name, v] of numbersOf(s.ind)) expect(Number.isFinite(v), name).toBe(true);
  });

  it("can be added to a simulator that is already flying", async () => {
    const sim = makeSim(0);
    sim.env.wind = [{ altFtMsl: 0, dirTrue: 0, kt: 0 }];
    await sim.spawn(cruise(120));
    sim.advance(5);
    const inst = sim.use(createInstruments());
    const s = sim.state;
    expect(Math.abs(s.ind.alt - s.altMslFt)).toBeLessThan(15);
    expect(Math.abs(s.ind.ias - inst.kcasToKias(s.kcas, 0))).toBeLessThan(0.5);
    expect(Math.abs(s.ind.attRoll - s.roll)).toBeLessThan(0.1);
    sim.advance(2);
    expect(Math.abs(s.ind.attRoll - s.roll)).toBeLessThan(0.3);
    expect(Math.abs(s.ind.vs - s.vsFpm)).toBeLessThan(150);
  });

  it("publishes its key limits for explanation texts", () => {
    expect(INSTRUMENT_LIMITS.attitudeBankDeg).toBeGreaterThan(95);
    expect(INSTRUMENT_LIMITS.attitudeBankDeg).toBeLessThan(115);
    expect(INSTRUMENT_LIMITS.attitudePitchDeg).toBeGreaterThan(55);
    expect(INSTRUMENT_LIMITS.attitudePitchDeg).toBeLessThan(75);
    expect(INSTRUMENT_LIMITS.headingGyroDeg).toBe(55);
    expect(INSTRUMENT_LIMITS.vsiFpm).toBe(2000);
  });

  it("stops listening after dispose()", async () => {
    const { sim, inst } = await makeRig(cruise(360));
    sim.controls.dgAdjustDeg = 40;
    sim.advance(0.1);
    inst.dispose?.();
    sim.events.emit("command", { id: "dg-align" });
    expect(sim.controls.dgAdjustDeg).toBe(40);
    inst.alignHeadingIndicator(); // harmless no-op once disposed
    expect(sim.controls.dgAdjustDeg).toBe(40);
  });
});
