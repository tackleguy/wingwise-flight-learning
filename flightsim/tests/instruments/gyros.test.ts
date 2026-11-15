import { describe, expect, it } from "vitest";
import { trueToMag } from "@/core/magvar";
import { createInstruments } from "@/instruments";
import { makeSim } from "../helpers";
import { cruise, makeRig, norm180, stubSystems } from "./pilot";

describe("turn coordinator", () => {
  it("reads about 1.0 in a standard-rate turn, either way", async () => {
    const { sim, pilot } = await makeRig(cruise(360));
    const s = sim.state;
    pilot.fly(10, { altFt: 3500, bankDeg: 0, kcas: 100 });
    expect(Math.abs(s.ind.turnRate)).toBeLessThan(0.1);

    pilot.fly(25, { altFt: 3500, bankDeg: 16.1, kcas: 100 });
    expect(Math.abs(s.turnRate - 3)).toBeLessThan(0.2); // the aircraft really is turning at 3°/s
    expect(s.ind.turnRate).toBeGreaterThan(0.93);
    expect(s.ind.turnRate).toBeLessThan(1.07);
    expect(Math.abs(s.ind.ball)).toBeLessThan(0.08); // coordinated: ball centred
    expect(s.ind.turnFlag).toBe(false);

    pilot.fly(30, { altFt: 3500, bankDeg: -16.1, kcas: 100 });
    expect(Math.abs(s.turnRate + 3)).toBeLessThan(0.2);
    expect(s.ind.turnRate).toBeLessThan(-0.93);
    expect(s.ind.turnRate).toBeGreaterThan(-1.07);

    // half standard rate reads about half
    pilot.fly(25, { altFt: 3500, bankDeg: 8.2, kcas: 100 });
    expect(s.ind.turnRate / (s.turnRate / 3)).toBeGreaterThan(0.9);
    expect(s.ind.turnRate / (s.turnRate / 3)).toBeLessThan(1.1);
  });

  it("responds to roll as well as yaw (canted gyro), with about half a second of lag", async () => {
    const { sim, pilot } = await makeRig(cruise(360));
    const s = sim.state;
    pilot.fly(10, { altFt: 3500, bankDeg: 0, kcas: 100 });
    const hdg0 = s.headingTrue;
    // roll briskly to the right: the little aeroplane banks right before the heading has changed much
    let peak = 0;
    pilot.fly(0.8, { altFt: 3500, bankDeg: 25, kcas: 100 }, () => (peak = Math.max(peak, s.ind.turnRate)));
    expect(Math.abs(norm180(s.headingTrue - hdg0))).toBeLessThan(2);
    expect(peak).toBeGreaterThan(0.5);

    // the needle lags the real motion a little: right after the roll starts it has not caught up yet
    const { sim: sim2, pilot: pilot2 } = await makeRig(cruise(360));
    pilot2.fly(10, { altFt: 3500, bankDeg: 0, kcas: 100 });
    pilot2.fly(0.15, { altFt: 3500, bankDeg: 25, kcas: 100 });
    const felt = (sim2.state.yawRate * Math.cos(Math.PI / 6) + sim2.state.rollRate * Math.sin(Math.PI / 6)) / 2.5;
    expect(felt).toBeGreaterThan(0.5);
    expect(sim2.state.ind.turnRate).toBeLessThan(felt * 0.5);
  });

  it("runs down and shows its flag without electrical power", async () => {
    const { sim, pilot } = await makeRig(cruise(360), { setup: (s) => void 0 });
    const power = stubSystems(sim);
    const s = sim.state;
    pilot.fly(25, { altFt: 3500, bankDeg: 16.1, kcas: 100 });
    expect(s.ind.turnFlag).toBe(false);
    expect(s.ind.turnRate).toBeGreaterThan(0.9);

    power.busVolts = 0; // master switch off / battery flat
    pilot.fly(2, { altFt: 3500, bankDeg: 16.1, kcas: 100 });
    expect(s.ind.turnFlag).toBe(true);
    expect(s.ind.turnRate).toBeGreaterThan(0.7); // the rotor is still spinning: it keeps working for a while
    pilot.fly(90, { altFt: 3500, bankDeg: 16.1, kcas: 100 });
    expect(Math.abs(s.turnRate - 3)).toBeLessThan(0.2);
    expect(s.ind.turnRate).toBeLessThan(0.1); // run down: shows no turn although turning at standard rate

    power.busVolts = 28;
    pilot.fly(30, { altFt: 3500, bankDeg: 16.1, kcas: 100 });
    expect(s.ind.turnFlag).toBe(false);
    expect(s.ind.turnRate).toBeGreaterThan(0.9);
  });
});

describe("inclinometer (the ball)", () => {
  it("goes to the outside of a skid and the low side of a slip: 'step on the ball'", async () => {
    const { sim, pilot } = await makeRig(cruise(360));
    const s = sim.state;
    pilot.fly(12, { altFt: 3500, bankDeg: 0, kcas: 100 });
    expect(Math.abs(s.ind.ball)).toBeLessThan(0.05);

    // Skid: wings level, RIGHT rudder. The nose yaws right, the aircraft is pushed toward the right
    // wing, the ball is left behind on the LEFT → the pilot should press the LEFT pedal (less right rudder).
    pilot.fly(6, { altFt: 3500, bankDeg: 0, rudder: 0.4 });
    expect(s.betaDeg).toBeLessThan(-2); // nose is right of the airflow
    expect(s.ny).toBeGreaterThan(0.03);
    expect(s.ind.ball).toBeLessThan(-0.15);

    // and the mirror image with LEFT rudder: ball to the right
    pilot.fly(8, { altFt: 3500, bankDeg: 0, rudder: -0.4 });
    expect(s.betaDeg).toBeGreaterThan(2);
    expect(s.ind.ball).toBeGreaterThan(0.15);

    // Slip: right wing low held with left rudder — the ball falls to the low (right) side.
    pilot.fly(4, { altFt: 3500, bankDeg: 0 });
    pilot.fly(8, { altFt: 3500, bankDeg: 10, rudder: -0.35 });
    expect(s.roll).toBeGreaterThan(4);
    expect(s.ind.ball).toBeGreaterThan(0.15);

    // feet back to work: centred again
    pilot.fly(10, { altFt: 3500, bankDeg: 0 });
    expect(Math.abs(s.ind.ball)).toBeLessThan(0.06);
    expect(Math.abs(s.ind.ball)).toBeLessThanOrEqual(1);
  });
});

describe("attitude indicator", () => {
  it("stays within about 2° of the truth in normal manoeuvring, and the turn error washes out", async () => {
    const { sim, pilot } = await makeRig(cruise(360));
    const s = sim.state;
    let worstPitch = 0;
    let worstRoll = 0;
    const watch = () => {
      worstPitch = Math.max(worstPitch, Math.abs(s.ind.attPitch - s.pitch));
      worstRoll = Math.max(worstRoll, Math.abs(s.ind.attRoll - s.roll));
    };
    pilot.fly(15, { altFt: 3500, bankDeg: 0, kcas: 100 }, watch);
    expect(worstPitch).toBeLessThan(0.3);
    expect(worstRoll).toBeLessThan(0.3);

    // 180° at standard rate: the classic case for the small turn error
    pilot.fly(60, { altFt: 3500, bankDeg: 16.1, kcas: 100 }, watch);
    const after180 = Math.hypot(s.ind.attPitch - s.pitch, s.ind.attRoll - s.roll);
    expect(after180).toBeGreaterThan(0.8); // the error is really there …
    expect(after180).toBeLessThan(2.5); // … and small
    // roll out and fly straight: the gyro erects itself again within a minute or so
    pilot.fly(75, { altFt: 3500, bankDeg: 0, kcas: 100 }, watch);
    expect(Math.hypot(s.ind.attPitch - s.pitch, s.ind.attRoll - s.roll)).toBeLessThan(0.5);

    // a full 360° turn: the error built up in the first half cancels in the second half
    pilot.fly(120, { altFt: 3500, bankDeg: -16.1, kcas: 100 }, watch);
    expect(Math.hypot(s.ind.attPitch - s.pitch, s.ind.attRoll - s.roll)).toBeLessThan(0.8);

    // steeper turn, climb and descent
    pilot.fly(30, { altFt: 3500, bankDeg: 30, kcas: 100 }, watch);
    pilot.fly(20, { altFt: 3500, bankDeg: 0, kcas: 100 }, watch);
    pilot.fly(40, { vsFpm: 500, bankDeg: 0, kcas: 85 }, watch);
    pilot.fly(40, { vsFpm: -500, bankDeg: 0, kcas: 95 }, watch);
    expect(worstPitch).toBeLessThan(2.5);
    expect(worstRoll).toBeLessThan(2.5);
    expect(s.ind.attFlag).toBe(false);
  });

  it("shows slightly too much nose-up after accelerating (take-off roll)", async () => {
    const { sim } = await makeRig({ kind: "runway", airportIdent: "KSFO", runwayEndId: "28R" }, { elevM: 4 });
    const s = sim.state;
    sim.advance(3);
    expect(Math.abs(s.ind.attPitch - s.pitch)).toBeLessThan(0.2);
    sim.controls.parkingBrake = false;
    sim.controls.throttle = 1;
    for (let t = 0; t < 40 && s.kcas < 55; t += 0.05) {
      sim.controls.rudder = Math.max(-1, Math.min(1, (298 - s.headingTrue) * 0.08 - s.yawRate * 0.05));
      sim.advance(0.05);
    }
    const err = s.ind.attPitch - s.pitch;
    expect(err).toBeGreaterThan(0.3);
    expect(err).toBeLessThan(2);
    expect(Math.abs(s.ind.attRoll - s.roll)).toBeLessThan(0.5);
  });

  it("tumbles beyond its gimbal limits and then re-erects only slowly", async () => {
    const { sim, pilot, inst } = await makeRig(cruise(360, 40, -100, { altFtMsl: 7000, kias: 110 }));
    const s = sim.state;
    pilot.fly(10, { altFt: 7000, bankDeg: 0 });
    // 80° of bank is inside the limit (about 100°): no tumble
    pilot.fly(4, { bankDeg: 80, pitchDeg: 0, rudder: 0 });
    expect(inst.status.attitudeTumbling).toBe(false);
    expect(Math.abs(s.ind.attRoll - s.roll)).toBeLessThan(3);

    // roll on past 100°
    let tumbled = false;
    let rollWhenTumbled = 0;
    pilot.fly(5, { bankDeg: 125, pitchDeg: 0, rudder: 0 }, () => {
      if (!tumbled && inst.status.attitudeTumbling) {
        tumbled = true;
        rollWhenTumbled = s.roll;
      }
    });
    expect(tumbled).toBe(true);
    expect(rollWhenTumbled).toBeGreaterThan(95);
    expect(rollWhenTumbled).toBeLessThan(112);

    // recover to straight and level: the instrument no longer agrees with the horizon
    pilot.fly(20, { bankDeg: 0, pitchDeg: 2, rudder: 0, throttle: 0.4 });
    pilot.syncPitch();
    pilot.fly(10, { altFt: s.altMslFt, bankDeg: 0, kcas: 100 });
    expect(inst.status.attitudeTumbling).toBe(false);
    const errAfter = Math.hypot(s.ind.attPitch - s.pitch, s.ind.attRoll - s.roll);
    expect(errAfter).toBeGreaterThan(10);

    // one minute later it has improved by only a few degrees (about 3° per minute)
    pilot.fly(60, { altFt: s.altMslFt, bankDeg: 0, kcas: 100 });
    const errLater = Math.hypot(s.ind.attPitch - s.pitch, s.ind.attRoll - s.roll);
    expect(errLater).toBeLessThan(errAfter - 1.5);
    expect(errLater).toBeGreaterThan(errAfter - 6);

    // a new start (reposition) gives a freshly erected gyro
    await sim.spawn(cruise(90));
    expect(Math.abs(s.ind.attRoll - s.roll)).toBeLessThan(0.1);
    expect(Math.abs(s.ind.attPitch - s.pitch)).toBeLessThan(0.1);
  });

  it("tumbles in a steep pitch-up as well (limit about 60°)", async () => {
    const { sim, pilot, inst } = await makeRig(cruise(360, 40, -100, { altFtMsl: 7000, kias: 130 }));
    const s = sim.state;
    let pitchWhenTumbled = 0;
    pilot.fly(8, { pitchDeg: 80, bankDeg: 0, rudder: 0, throttle: 1 }, () => {
      if (!pitchWhenTumbled && inst.status.attitudeTumbling) pitchWhenTumbled = s.pitch;
    });
    expect(pitchWhenTumbled).toBeGreaterThan(57);
    expect(pitchWhenTumbled).toBeLessThan(70);
  });

  it("topples slowly and insidiously when the vacuum fails", async () => {
    const { sim, pilot, inst } = await makeRig(cruise(360));
    const s = sim.state;
    const err = () => Math.hypot(s.ind.attPitch - s.pitch, s.ind.attRoll - s.roll);
    pilot.fly(15, { altFt: 3500, headingTrue: 360, kcas: 100 });
    expect(s.ind.suctionInHg).toBeGreaterThan(4.3);
    expect(err()).toBeLessThan(0.3);

    s.sys.failures.vacuum = true;
    pilot.fly(30, { altFt: 3500, headingTrue: 360, kcas: 100 });
    // half a minute later: the suction gauge is at zero, but the horizon still looks perfectly normal
    expect(s.ind.suctionInHg).toBeLessThan(0.2);
    expect(err()).toBeLessThan(1.5);
    expect(s.ind.attFlag).toBe(false);

    pilot.fly(60, { altFt: 3500, headingTrue: 360, kcas: 100 });
    // a minute and a half: the horizon has started to lean, still without any flag
    expect(err()).toBeGreaterThan(0.8);
    expect(err()).toBeLessThan(5);
    expect(s.ind.attFlag).toBe(false);

    pilot.fly(90, { altFt: 3500, headingTrue: 360, kcas: 100 });
    // three minutes after the failure: clearly wrong, while the aircraft is still straight and level
    expect(Math.abs(s.roll)).toBeLessThan(3);
    expect(err()).toBeGreaterThan(4);
    expect(inst.status.attitudeGyroSpeed).toBeLessThan(0.45);
    expect(s.ind.attFlag).toBe(true);

    pilot.fly(120, { altFt: 3500, headingTrue: 360, kcas: 100 });
    // five minutes: useless
    expect(err()).toBeGreaterThan(20);
    // the heading indicator has lost its gyro too
    expect(s.ind.dgFlag).toBe(true);
    expect(Math.abs(norm180(s.ind.dgMag - trueToMag(s.headingTrue, s.magVar)))).toBeGreaterThan(8);
    // the electric turn coordinator and the pressure instruments are unaffected
    expect(s.ind.turnFlag).toBe(false);
    expect(Math.abs(s.ind.alt - s.altMslFt)).toBeLessThan(25);
  });

  it("topples with low suction reported by the systems module too", async () => {
    const { sim, pilot } = await makeRig(cruise(360));
    const sys = stubSystems(sim, { vacuumInHg: 5 });
    const s = sim.state;
    const err = () => Math.hypot(s.ind.attPitch - s.pitch, s.ind.attRoll - s.roll);
    pilot.fly(60, { altFt: 3500, headingTrue: 360, kcas: 100 });
    expect(err()).toBeLessThan(0.3);
    expect(s.ind.suctionInHg).toBeCloseTo(5, 1);
    sys.vacuumInHg = 0.3; // failing pump
    pilot.fly(300, { altFt: 3500, headingTrue: 360, kcas: 100 });
    expect(s.ind.suctionInHg).toBeLessThan(0.5);
    expect(s.ind.attFlag).toBe(true);
    expect(err()).toBeGreaterThan(8);
  });
});

describe("heading indicator (directional gyro)", () => {
  it("drifts a few degrees in 15 minutes and is put right by aligning it with the compass", async () => {
    const { sim, pilot, inst } = await makeRig(cruise(360)); // 40° north
    const s = sim.state;
    const c = sim.controls;
    const dgError = () => norm180(s.ind.dgMag - trueToMag(s.headingTrue, s.magVar));
    pilot.fly(10, { altFt: 3500, headingTrue: 360, kcas: 100 });
    const start = dgError();
    expect(Math.abs(start)).toBeLessThan(2.5); // set to the compass at the start (compass deviation is up to 2°)

    pilot.fly(900, { altFt: 3500, headingTrue: 360, kcas: 100 });
    const drift = dgError() - start;
    // Earth rate alone is 15°/h × sin 40° = 9.6°/h = 2.4° in 15 min (reading falls in the northern
    // hemisphere); this gyro's own drift adds or removes up to about 0.9°.
    expect(drift).toBeLessThan(-1.2);
    expect(drift).toBeGreaterThan(-4.5);
    expect(Math.abs(inst.status.headingGyroDriftDegPerHr)).toBeGreaterThanOrEqual(1);
    expect(Math.abs(inst.status.headingGyroDriftDegPerHr)).toBeLessThanOrEqual(3.5);
    expect(s.ind.dgFlag).toBe(false);

    // straight, level, unaccelerated: the compass is trustworthy, so align to it
    expect(c.dgAdjustDeg).toBe(0);
    inst.alignHeadingIndicator();
    expect(Math.abs(norm180(s.ind.dgMag - s.ind.compassMag))).toBeLessThan(0.01);
    expect(Math.abs(c.dgAdjustDeg + drift)).toBeLessThan(1.5); // the knob was turned back by about the drift
    sim.advance(1);
    expect(Math.abs(norm180(s.ind.dgMag - s.ind.compassMag))).toBeLessThan(0.2);
    expect(Math.abs(dgError())).toBeLessThan(2.5);
  });

  it("is aligned by the 'dg-align' command and follows the knob", async () => {
    const { sim, pilot } = await makeRig(cruise(135));
    const s = sim.state;
    const c = sim.controls;
    pilot.fly(5, { altFt: 3500, headingTrue: 135, kcas: 100 });
    const before = s.ind.dgMag;
    c.dgAdjustDeg += 25; // the pilot twists the knob 25° — the card follows
    sim.advance(0.1);
    expect(norm180(s.ind.dgMag - before)).toBeCloseTo(25, 0);
    sim.events.emit("command", { id: "dg-align" });
    expect(Math.abs(norm180(s.ind.dgMag - s.ind.compassMag))).toBeLessThan(0.01);
    sim.advance(1);
    expect(Math.abs(norm180(s.ind.dgMag - s.ind.compassMag))).toBeLessThan(0.3);
  });

  it("drifts the other way in the southern hemisphere and hardly at all on the equator", async () => {
    const run = async (airport: string) => {
      const { sim } = await makeRig({ kind: "runway", airportIdent: airport }, { elevM: 5 });
      const s = sim.state;
      sim.advance(2);
      const start = norm180(s.ind.dgMag - trueToMag(s.headingTrue, s.magVar));
      sim.advance(900); // 15 minutes parked on the runway, engine idling
      expect(s.ind.dgFlag).toBe(false);
      return { lat: s.lat, drift: norm180(s.ind.dgMag - trueToMag(s.headingTrue, s.magVar)) - start };
    };
    const sydney = await run("YSSY"); // 34° south
    expect(sydney.lat).toBeLessThan(-30);
    expect(sydney.drift).toBeGreaterThan(1.0);
    expect(sydney.drift).toBeLessThan(3.2);
    const singapore = await run("WSSS"); // 1° north
    expect(Math.abs(singapore.lat)).toBeLessThan(3);
    expect(Math.abs(singapore.drift)).toBeLessThan(1.1);
  });

  it("shows a small gimbal error only while banked, never in level flight", async () => {
    const { sim, pilot } = await makeRig(cruise(45));
    const s = sim.state;
    const dgError = () => norm180(s.ind.dgMag - trueToMag(s.headingTrue, s.magVar));
    pilot.fly(8, { altFt: 3500, bankDeg: 0, kcas: 100 });
    const level = dgError();
    let worst = 0;
    pilot.fly(30, { altFt: 3500, bankDeg: 30, kcas: 100 }, () => (worst = Math.max(worst, Math.abs(dgError() - level))));
    expect(worst).toBeGreaterThan(2); // about 4° at 30° of bank on in-between headings
    expect(worst).toBeLessThan(6);
    pilot.fly(15, { altFt: 3500, bankDeg: 0, kcas: 100 });
    expect(Math.abs(dgError() - level)).toBeLessThan(0.6); // gone again when level (apart from a little drift)
  });

  it("tumbles in steep manoeuvres and is then wrong until it is reset", async () => {
    const { sim, pilot, inst } = await makeRig(cruise(360, 40, -100, { altFtMsl: 7000, kias: 110 }));
    const s = sim.state;
    const dgError = () => norm180(s.ind.dgMag - trueToMag(s.headingTrue, s.magVar));
    pilot.fly(8, { altFt: 7000, bankDeg: 0 });
    let tumbled = false;
    pilot.fly(8, { bankDeg: 100, pitchDeg: 0, rudder: 0 }, () => (tumbled ||= inst.status.headingTumbling));
    expect(tumbled).toBe(true);
    pilot.fly(20, { bankDeg: 0, pitchDeg: 2, rudder: 0, throttle: 0.4 });
    pilot.syncPitch();
    pilot.fly(15, { altFt: s.altMslFt, bankDeg: 0, kcas: 100 });
    expect(inst.status.headingTumbling).toBe(false);
    expect(Math.abs(dgError())).toBeGreaterThan(10);
    // let the speed settle first: the compass is only right in straight, level, UNACCELERATED flight
    pilot.fly(60, { altFt: s.altMslFt, bankDeg: 0, kcas: 100 });
    expect(Math.abs(dgError())).toBeGreaterThan(10); // a tumbled heading indicator does not recover by itself
    inst.alignHeadingIndicator();
    sim.advance(0.5);
    expect(Math.abs(dgError())).toBeLessThan(3);
  });
});

describe("cold start", () => {
  it("has the gyros run down and flagged, then erects within a few minutes of engine start", async () => {
    const sim = makeSim(4);
    const inst = sim.use(createInstruments());
    await sim.spawn({ kind: "ramp", airportIdent: "KSFO", runwayEndId: "28R" });
    const s = sim.state;
    const err = () => Math.hypot(s.ind.attPitch - s.pitch, s.ind.attRoll - s.roll);
    sim.advance(5);
    expect(s.sys.engineRunning).toBe(false);
    expect(s.ind.attFlag).toBe(true);
    expect(s.ind.dgFlag).toBe(true);
    expect(inst.status.attitudeGyroSpeed).toBe(0);
    expect(err()).toBeGreaterThan(5); // horizon lying lopsided
    expect(s.ind.suctionInHg).toBe(0);
    expect(s.ind.tachRpm).toBe(0);
    const frozen = s.ind.attRoll;
    sim.advance(20);
    expect(s.ind.attRoll).toBeCloseTo(frozen, 4); // nothing moves without suction

    // start the engine the way a pilot does
    const c = sim.controls;
    c.masterBattery = c.masterAlternator = true;
    c.mixture = 1;
    c.throttle = 0.15;
    c.ignition = 4;
    sim.advance(4);
    c.ignition = 3;
    sim.advance(6);
    expect(s.sys.engineRunning).toBe(true);
    expect(s.ind.attFlag).toBe(true); // still spinning up

    sim.advance(180);
    expect(s.ind.attFlag).toBe(false);
    expect(s.ind.dgFlag).toBe(false);
    expect(inst.status.attitudeGyroSpeed).toBeGreaterThan(0.85);
    expect(err()).toBeLessThan(0.5);
    // the heading indicator has no idea where north is until the pilot sets it
    inst.alignHeadingIndicator();
    expect(Math.abs(norm180(s.ind.dgMag - s.ind.compassMag))).toBeLessThan(0.01);
  });

  it("starts with the gyros up to speed, erect and aligned when the engine is already running", async () => {
    for (const req of [{ kind: "runway", airportIdent: "KSFO", runwayEndId: "28R" } as const, { kind: "final", airportIdent: "KSFO", runwayEndId: "28R" } as const, cruise(200)]) {
      const { sim } = await makeRig(req, { elevM: 4 });
      const s = sim.state;
      expect(s.ind.attFlag).toBe(false);
      expect(s.ind.dgFlag).toBe(false);
      expect(s.ind.turnFlag).toBe(false);
      expect(Math.abs(s.ind.attPitch - s.pitch)).toBeLessThan(0.05);
      expect(Math.abs(s.ind.attRoll - s.roll)).toBeLessThan(0.05);
      expect(Math.abs(norm180(s.ind.dgMag - s.ind.compassMag))).toBeLessThan(0.05);
      expect(Math.abs(norm180(s.ind.compassMag - trueToMag(s.headingTrue, s.magVar)))).toBeLessThan(2.1);
    }
  });
});
