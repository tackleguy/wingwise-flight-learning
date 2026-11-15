import { describe, expect, it } from "vitest";
import { makeSim } from "./helpers";

describe("simulator core", () => {
  it("spawns on a runway, standing still on its wheels", async () => {
    const sim = makeSim(4);
    const r = await sim.spawn({ kind: "runway", airportIdent: "KSFO", runwayEndId: "28R" });
    expect(r.onGround).toBe(true);
    expect(Math.abs(r.headingTrue - 298)).toBeLessThan(4);
    sim.advance(5);
    const s = sim.state;
    expect(s.onGround).toBe(true);
    expect(s.aglFt).toBeLessThan(0.5);
    expect(s.gsKt).toBeLessThan(1);
    expect(s.crash).toBeNull();
    expect(s.rpm).toBeGreaterThan(400);
    expect(Math.abs(s.magVar - 12.5)).toBeLessThan(2);
  });

  it("takes off with full throttle and a gentle pull", async () => {
    const sim = makeSim(4);
    await sim.spawn({ kind: "runway", airportIdent: "KSFO", runwayEndId: "28R" });
    let liftoffKt = 0;
    sim.events.on("liftoff", (e) => (liftoffKt = e.kcas));
    sim.controls.parkingBrake = false;
    sim.controls.throttle = 1;
    for (let t = 0; t < 60 && sim.state.aglFt < 200; t += 0.1) {
      const s = sim.state;
      // simple pilot: hold the centreline with rudder, rotate at 55 kt, hold about 8° nose up, wings level
      sim.controls.rudder = Math.max(-1, Math.min(1, (298 - s.headingTrue) * 0.08 - s.yawRate * 0.05));
      sim.controls.elevator = s.kcas > 52 ? Math.max(-0.3, Math.min(0.6, (8 - s.pitch) * 0.08 - s.pitchRate * 0.03)) : 0;
      sim.controls.aileron = Math.max(-1, Math.min(1, -s.roll * 0.05 - s.rollRate * 0.02));
      sim.advance(0.1);
    }
    expect(sim.state.crash).toBeNull();
    expect(sim.state.aglFt).toBeGreaterThan(150);
    expect(liftoffKt).toBeGreaterThan(45);
    expect(liftoffKt).toBeLessThan(75);
  });

  it("starts trimmed on short final and descends toward the runway", async () => {
    const sim = makeSim(4);
    const r = await sim.spawn({ kind: "final", airportIdent: "KSFO", runwayEndId: "28R", finalNm: 1.5 });
    expect(r.onGround).toBe(false);
    const s = sim.state;
    expect(s.aglFt).toBeGreaterThan(400);
    expect(s.aglFt).toBeLessThan(650);
    sim.advance(5);
    expect(s.kcas).toBeGreaterThan(55);
    expect(s.kcas).toBeLessThan(78);
    expect(s.vsFpm).toBeLessThan(-100);
    expect(s.vsFpm).toBeGreaterThan(-800);
    expect(s.flapsDeg).toBeGreaterThan(25);
    expect(s.crash).toBeNull();
  });

  it("applies wind the right way round (headwind reduces ground speed)", async () => {
    const sim = makeSim(0);
    sim.env.wind = [{ altFtMsl: 0, dirTrue: 270, kt: 20 }];
    await sim.spawn({ kind: "air", lat: 40, lon: -100, altFtMsl: 3000, headingTrue: 270, kias: 100 });
    sim.advance(3);
    const s = sim.state;
    expect(Math.abs(s.ktas - s.gsKt - 20)).toBeLessThan(3);
    expect(Math.abs(s.windDirTrue - 270)).toBeLessThan(1);
    expect(Math.abs(s.windKt - 20)).toBeLessThan(0.5);
    expect(Math.abs(s.kcas - 100)).toBeLessThan(4);
  });

  it("reads field elevation on the altimeter when set to the reported QNH", async () => {
    const sim = makeSim(1500 / 3.28084);
    Object.assign(sim.env, { qnhInHg: 30.31, tempC: 28, stationElevFt: 1500 });
    await sim.spawn({ kind: "runway", airportIdent: "KSFO" });
    sim.advance(2);
    const s = sim.state;
    const { indicatedAltitudeFt } = await import("@/core/math");
    const wheelsAlt = indicatedAltitudeFt(s.staticPressureInHg, 30.31) - 4.36;
    expect(Math.abs(wheelsAlt - 1500)).toBeLessThan(15);
    expect(Math.abs(s.oatC - 28)).toBeLessThan(1.5);
  });
});
