import { describe, expect, it } from "vitest";
import { SteamInstruments, calibratedAirspeedKt, type InstrumentInputs } from "./instruments";
import { SimEngine } from "./engine";
import { WEATHER_PRESETS } from "./environment";

const base: InstrumentInputs = {
  pitch: 0,
  bank: 0,
  headingMag: 0,
  rollRate: 0,
  turnRate: 0,
  slip: 0,
  tasKt: 100,
  onGround: false,
  vacuumPower: 1,
  electricPower: 1,
  dipDeg: 61,
};

function run(inst: SteamInstruments, sec: number, i: Partial<InstrumentInputs>, vs = 0) {
  for (let t = 0; t < sec; t += 1 / 60) inst.update(1 / 60, { ...base, ...i }, vs);
}

describe("steam instruments (FlightGear-style behaviour)", () => {
  it("attitude indicator tracks bank with good vacuum", () => {
    const s = new SteamInstruments();
    s.reset(base);
    run(s, 3, { bank: 30 });
    expect(Math.abs(s.aiRoll - 30)).toBeLessThan(1);
  });

  it("after vacuum loss the gyro winds down and the AI stops following", () => {
    const s = new SteamInstruments();
    s.reset(base);
    run(s, 120, { vacuumPower: 0 });
    expect(s.aiGyro.spin).toBeLessThan(0.4);
    run(s, 10, { vacuumPower: 0, bank: 30 });
    expect(Math.abs(s.aiRoll)).toBeLessThan(15); // shows well under half of a real 30° bank
  });

  it("compass shows northerly turning error (turns the wrong way initially)", () => {
    const s = new SteamInstruments();
    s.reset(base);
    run(s, 4, { bank: 20, headingMag: 0 });
    // banking right while heading north: compass initially swings toward WEST (>180)
    expect(s.compass).toBeGreaterThan(300);
  });

  it("compass shows acceleration error heading east (accelerate → north)", () => {
    const s = new SteamInstruments();
    s.reset({ ...base, headingMag: 90 });
    for (let t = 0; t < 3; t += 1 / 60)
      s.update(1 / 60, { ...base, headingMag: 90, tasKt: 100 + t * 20 }, 0);
    expect(s.compass).toBeLessThan(88);
  });

  it("heading indicator precesses and can be re-synced to the compass", () => {
    const s = new SteamInstruments();
    s.reset(base);
    run(s, 900, {});
    const drift = Math.abs(((s.headingIndicator + 540) % 360) - 180);
    expect(drift).toBeGreaterThan(2);
    s.syncHeadingIndicator();
    expect(Math.abs(((s.headingIndicator - s.compass + 540) % 360) - 180)).toBeLessThan(0.5);
  });

  it("mechanical VSI lags the actual climb", () => {
    const s = new SteamInstruments();
    s.reset(base);
    run(s, 1, {}, 1000);
    expect(s.vsi).toBeGreaterThan(100);
    expect(s.vsi).toBeLessThan(600);
  });

  it("calibrated airspeed ≈ EAS slow, below TAS at altitude", () => {
    expect(Math.abs(calibratedAirspeedKt(100, 661.47, 1) - 100)).toBeLessThan(0.5);
    const cas = calibratedAirspeedKt(450, 576, 0.235); // ~FL350
    expect(cas).toBeGreaterThan(240);
    expect(cas).toBeLessThan(280);
  });

  it("engine failure in a steam aircraft eventually affects the vacuum gyros", () => {
    const sim = new SimEngine({
      perfId: "pa28",
      magVar: 13,
      weather: { ...WEATHER_PRESETS["cavu"]!.weather, timeOfDay: 12 },
      start: {
        lat: 37.6,
        lon: -122.3,
        altMslFt: 5000,
        heading: 90,
        iasKt: 100,
        onGround: false,
        groundElevFt: 0,
        engineRunning: true,
      },
    });
    sim.setFailure("engine", true);
    for (let t = 0; t < 30; t += 0.1) sim.advance(0.1);
    expect(sim.getSnapshot().aircraft.vacuumInHg).toBeLessThan(1);
  });
});
