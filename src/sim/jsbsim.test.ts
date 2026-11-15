// @vitest-environment node
import { describe, expect, it } from "vitest";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { JsbsimFdm, type JsbsimInputs } from "./jsbsim";

const URL_ = pathToFileURL(path.resolve(__dirname, "../../public/jsbsim/jsbsim.mjs")).href;

const base: JsbsimInputs = {
  elevator: 0, aileron: 0, rudder: 0, trim: 0, throttle: 1, mixture: 1, flapNorm: 0, gearDown: true,
  brakeLeft: 0, brakeRight: 0, magnetos: true, starter: false, cutoff: false, fuelOn: true,
  terrainFt: 13, windNorthFps: 0, windEastFps: 0, windDownFps: 0, deltaTR: 0,
};

async function takeoff(perfId: string, vr: number) {
  const fdm = await JsbsimFdm.create(perfId, { lat: 37.6, lon: -122.38, altMslFt: 13, onGround: true, terrainFt: 13, headingTrue: 280, kcas: 0, pitchDeg: 0 }, URL_);
  expect(fdm).not.toBeNull();
  const f = fdm!;
  f.setRunning();
  let liftoffKt = 0;
  let s = f.read();
  for (let t = 0; t < 60; t += 0.25) {
    const hdgErr = ((s.heading - 280 + 540) % 360) - 180;
    const pitchTarget = s.kcas > vr || s.aglFt > 15 ? 8 : 0;
    f.setInputs({ ...base, rudder: Math.max(-1, Math.min(1, -hdgErr * 0.15)), aileron: Math.max(-1, Math.min(1, -s.bank * 0.05)), elevator: Math.max(-1, Math.min(1, (pitchTarget - s.pitch) * 0.08)) });
    f.step(30);
    s = f.read();
    if (!liftoffKt && !s.onGround && s.aglFt > 10) liftoffKt = s.kcas;
  }
  f.dispose();
  return { liftoffKt, s };
}

describe("JSBSim (FlightGear flight dynamics) in WebAssembly", () => {
  it("C172 takes off, holds runway heading and climbs", async () => {
    const { liftoffKt, s } = await takeoff("c172", 55);
    expect(liftoffKt).toBeGreaterThan(45);
    expect(liftoffKt).toBeLessThan(75);
    expect(s.vsFpm).toBeGreaterThan(400);
    expect(Math.abs((((s.heading - 280) + 540) % 360) - 180)).toBeLessThan(25);
    expect(s.rpm).toBeGreaterThan(2200);
  }, 60000);

  it("PA-28 takes off (main-gear steering data fix applied)", async () => {
    const { liftoffKt, s } = await takeoff("pa28", 60);
    expect(liftoffKt).toBeGreaterThan(50);
    expect(s.aglFt).toBeGreaterThan(100);
  }, 60000);

  it("returns null for aircraft without a JSBSim model", async () => {
    expect(await JsbsimFdm.create("sr22", { lat: 0, lon: 0, altMslFt: 0, onGround: true, terrainFt: 0, headingTrue: 0, kcas: 0, pitchDeg: 0 }, URL_)).toBeNull();
  });
});
