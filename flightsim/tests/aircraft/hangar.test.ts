/**
 * The hangar: every one of the ten aircraft must load in FlightGear's flight-dynamics engine, stand
 * still on the runway with the engine running, take off and climb under a simple test pilot, fly
 * hands-off after an "in the air" start, and start on short final — all through the real simulator
 * core (the same code the browser runs), on flat ground at San Francisco International.
 */
import { describe, expect, it } from "vitest";
import { AIRCRAFT_LIST, getAircraft } from "@/aircraft/catalog";
import type { Sim } from "@/core/sim";
import { makeSim } from "../helpers";

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const wrap = (d: number) => ((d + 540) % 360) - 180;
const finite = (sim: Sim) => [sim.state.lat, sim.state.lon, sim.state.altMslFt, sim.state.pitch, sim.state.roll, sim.state.kcas].every(Number.isFinite);

async function start(id: string, kind: "runway" | "air" | "final") {
  const sim = makeSim(0);
  sim.setAircraft(id);
  await sim.spawn({ kind, airportIdent: "KSFO", runwayEndId: kind === "air" ? undefined : "28R" });
  return sim;
}

/** A very simple pilot: wings level, straight along `headingTrue`; rotate to `pitchDeg` above `vr` knots. */
function pilot(sim: Sim, headingTrue: number, vr: number, pitchDeg: number, tailwheel: boolean) {
  const s = sim.state;
  const c = sim.controls;
  const err = wrap(headingTrue - s.headingTrue);
  c.rudder = clamp(err * 0.12 - s.yawRate * 0.035, -1, 1);
  c.aileron = clamp(-s.roll * 0.05 - s.rollRate * 0.01, -1, 1);
  if (s.kcas >= vr) c.elevator = clamp((pitchDeg - s.pitch) * 0.1 - s.pitchRate * 0.02, -1, 1);
  else if (tailwheel) c.elevator = clamp((0 - s.pitch) * 0.08, -0.6, 0.3);
  else c.elevator = 0;
}

describe.each(AIRCRAFT_LIST.map((a) => [a.id, a.name] as const))("%s (%s)", (id) => {
  const ac = getAircraft(id);

  it("stands still on the runway with the engine running", async () => {
    const sim = await start(id, "runway");
    expect(sim.aircraft.id).toBe(id);
    sim.controls.parkingBrake = true;
    sim.advance(10);
    const s = sim.state;
    expect(s.crash, s.crash?.reason).toBeNull();
    expect(finite(sim)).toBe(true);
    expect(s.onGround).toBe(true);
    expect(s.sys.engineRunning).toBe(true);
    expect(Math.abs(s.gsKt)).toBeLessThan(3);
    expect(Math.abs(s.roll)).toBeLessThan(3);
    // the centre of gravity sits about where the catalog says it does (struts settled)
    expect(Math.abs(s.altMslFt - s.groundElevFt - ac.cgHeightFt)).toBeLessThan(0.8);
  });

  it("takes off and climbs", async () => {
    const sim = await start(id, "runway");
    const s = sim.state;
    const c = sim.controls;
    const hdg = s.headingTrue;
    c.parkingBrake = false;
    if (id === "A320") c.flapIndex = 1;
    c.throttle = 1;
    let liftoffKt = 0;
    for (let t = 0; t < 120 && !s.crash; t += 0.05) {
      pilot(sim, hdg, ac.v.r, ac.id === "A320" || ac.id === "f16" ? 10 : 8, ac.tailwheel);
      sim.advance(0.05);
      if (!liftoffKt && s.aglFt > 20) liftoffKt = s.kcas;
      if (liftoffKt && s.aglFt > 200) break;
    }
    expect(s.crash, s.crash?.reason).toBeNull();
    expect(liftoffKt, "lifted off").toBeGreaterThan(0);
    expect(s.aglFt).toBeGreaterThan(150);
    // stayed close to the runway heading
    expect(Math.abs(wrap(s.headingTrue - hdg))).toBeLessThan(15);
    if (ac.retractableGear) {
      c.gearDown = false;
      sim.advance(12);
      expect(s.gearPosNorm).toBeLessThan(0.1);
    }
  });

  it("flies hands-off after an 'in the air' start", async () => {
    const sim = await start(id, "air");
    const s = sim.state;
    expect(s.onGround).toBe(false);
    expect(s.sys.engineRunning).toBe(true);
    const alt0 = s.altMslFt;
    for (let t = 0; t < 30; t += 0.05) {
      sim.controls.aileron = clamp(-s.roll * 0.05 - s.rollRate * 0.01, -1, 1); // wings level only
      sim.advance(0.05);
    }
    expect(s.crash, s.crash?.reason).toBeNull();
    expect(finite(sim)).toBe(true);
    expect(Math.abs(s.altMslFt - alt0), "height change in 30 s").toBeLessThan(1500);
    expect(s.kcas).toBeGreaterThan(ac.v.s1);
    expect(s.sys.engineRunning).toBe(true);
  });

  it("starts on short final", async () => {
    const sim = await start(id, "final");
    sim.advance(3);
    const s = sim.state;
    expect(s.crash, s.crash?.reason).toBeNull();
    expect(s.onGround).toBe(false);
    expect(s.kcas).toBeGreaterThan(ac.v.s0 * 0.9);
  });
});
