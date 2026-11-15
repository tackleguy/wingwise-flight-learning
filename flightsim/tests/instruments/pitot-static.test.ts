import { describe, expect, it } from "vitest";
import { indicatedAltitudeFt } from "@/core/math";
import type { InstrumentsApi } from "@/instruments";
import { cruise, makeRig } from "./pilot";

const CG_HEIGHT_FT = 4.36; // the altimeter sits about this far above the wheels

describe("altimeter", () => {
  it("reads field elevation with the reported setting, and about 10 ft per 0.01 inHg", async () => {
    const { sim } = await makeRig(
      { kind: "runway", airportIdent: "KSFO" },
      { elevM: 1500 / 3.28084, setup: (s) => Object.assign(s.env, { qnhInHg: 30.31, tempC: 28, stationElevFt: 1500 }) },
    );
    const s = sim.state;
    const c = sim.controls;
    sim.advance(3);
    expect(c.altimeterInHg).toBeCloseTo(30.31, 2);
    expect(Math.abs(s.ind.alt - (1500 + CG_HEIGHT_FT))).toBeLessThan(15);

    // one click of the knob (0.01 inHg) is worth about 10 ft; the needles follow the knob at once
    const before = s.ind.alt;
    c.altimeterInHg += 0.01;
    sim.advance(0.5);
    const perClick = s.ind.alt - before;
    expect(perClick).toBeGreaterThan(8);
    expect(perClick).toBeLessThan(11);

    c.altimeterInHg = 30.31 + 0.1;
    sim.advance(0.5);
    expect(s.ind.alt - before).toBeGreaterThan(85);
    expect(s.ind.alt - before).toBeLessThan(100);

    // 1 inHg of setting error is roughly 1,000 ft; a setting that is too LOW makes the altimeter read too LOW
    c.altimeterInHg = 29.31;
    sim.advance(0.5);
    expect(before - s.ind.alt).toBeGreaterThan(850);
    expect(before - s.ind.alt).toBeLessThan(1050);
  });

  it("follows a climb closely (small lag, a few feet of friction)", async () => {
    const { sim, pilot } = await makeRig(cruise(360));
    const s = sim.state;
    const exact = () => indicatedAltitudeFt(s.staticPressureInHg, sim.controls.altimeterInHg);
    pilot.fly(15, { altFt: 3500, bankDeg: 0, kcas: 100 });
    expect(Math.abs(s.ind.alt - exact())).toBeLessThan(3);
    expect(Math.abs(s.ind.alt - 3500)).toBeLessThan(10);
    let worst = 0;
    pilot.fly(40, { vsFpm: 600, bankDeg: 0, kcas: 90 }, () => (worst = Math.max(worst, Math.abs(s.ind.alt - exact()))));
    expect(s.altMslFt).toBeGreaterThan(3750);
    // at 600 fpm (10 ft/s) a 0.2 s lag is 2 ft, plus about 2 ft of friction
    expect(worst).toBeLessThan(8);
    expect(worst).toBeGreaterThan(1);
  });
});

describe("vertical speed indicator", () => {
  it("lags: reads low right after a climb starts and settles within about 10 s", async () => {
    const { sim, pilot } = await makeRig(cruise(360));
    const s = sim.state;
    pilot.fly(15, { altFt: 3500, bankDeg: 0, kcas: 100 });
    expect(Math.abs(s.ind.vs)).toBeLessThan(40);

    // pitch up into a climb and keep it going
    pilot.fly(2.5, { pitchDeg: 6, bankDeg: 0, throttle: 1 });
    const earlyTrue = s.vsFpm;
    const earlyShown = s.ind.vs;
    expect(earlyTrue).toBeGreaterThan(600);
    expect(earlyShown).toBeLessThan(earlyTrue * 0.6); // well behind the real climb rate
    expect(earlyShown).toBeGreaterThan(0); // but moving the right way

    pilot.fly(8.5, { pitchDeg: 6, bankDeg: 0, throttle: 1 });
    // 11 s after the pull-up the needle has caught up to within about 8 % of the real rate
    expect(Math.abs(s.ind.vs - s.vsFpm)).toBeLessThan(Math.max(60, Math.abs(s.vsFpm) * 0.08));
  });

  it("kicks briefly the wrong way when the nose is pulled up abruptly", async () => {
    const { sim, pilot } = await makeRig(cruise(360));
    const s = sim.state;
    pilot.fly(15, { altFt: 3500, bankDeg: 0, kcas: 100 });
    let lowest = 0;
    let trueVsThen = 0;
    pilot.fly(1.0, { pitchDeg: 8, bankDeg: 0, throttle: 1 }, () => {
      if (s.ind.vs < lowest) {
        lowest = s.ind.vs;
        trueVsThen = s.vsFpm;
      }
    });
    expect(lowest).toBeLessThan(-10); // shows a small descent for a moment …
    expect(lowest).toBeGreaterThan(-150);
    expect(trueVsThen).toBeGreaterThan(50); // … while the aircraft is already going up
    pilot.fly(3, { pitchDeg: 8, bankDeg: 0, throttle: 1 });
    expect(s.ind.vs).toBeGreaterThan(300);
  });

  it("stops at ±2,000 fpm", async () => {
    const { sim, pilot } = await makeRig(cruise(360, 40, -100, { altFtMsl: 9000 }));
    const s = sim.state;
    pilot.fly(14, { pitchDeg: -30, bankDeg: 0, throttle: 0 });
    expect(s.vsFpm).toBeLessThan(-3000);
    expect(s.ind.vs).toBeGreaterThanOrEqual(-2000);
    expect(s.ind.vs).toBeLessThan(-1900);
  });
});

describe("blocked pitot tube (ram air and drain both blocked)", () => {
  it("makes the airspeed indicator behave like an altimeter", async () => {
    const { sim, pilot } = await makeRig(cruise(360));
    const s = sim.state;
    pilot.fly(50, { altFt: 3500, bankDeg: 0, kcas: 90 });
    const iasBefore = s.ind.ias;
    expect(Math.abs(s.kcas - 90)).toBeLessThan(1);
    expect(Math.abs(iasBefore - 93)).toBeLessThan(1.5); // 90 KCAS shows about 93 KIAS

    s.sys.failures.pitot = true;
    // climb 400 ft at a steady 90 KCAS: the indicated speed rises although the real speed does not change
    pilot.fly(60, { vsFpm: 500, bankDeg: 0, kcas: 90 });
    expect(Math.abs(s.kcas - 90)).toBeLessThan(1.5);
    expect(s.altMslFt).toBeGreaterThan(3850);
    const iasHigh = s.ind.ias;
    expect(iasHigh).toBeGreaterThan(iasBefore + 20);

    // descend below the altitude of the blockage: now it reads LOWER than before, still at a real 90 KCAS
    pilot.fly(110, { vsFpm: -500, bankDeg: 0, kcas: 90 });
    expect(Math.abs(s.kcas - 90)).toBeLessThan(1.5);
    expect(s.altMslFt).toBeLessThan(3350);
    expect(s.ind.ias).toBeLessThan(iasBefore - 8);
    // the altimeter and VSI are not affected by a pitot blockage
    expect(Math.abs(s.ind.alt - s.altMslFt)).toBeLessThan(25);
    expect(Math.abs(s.ind.vs - s.vsFpm)).toBeLessThan(80);

    // clearing the blockage brings the airspeed indicator back
    s.sys.failures.pitot = false;
    pilot.fly(3, { vsFpm: -500, bankDeg: 0, kcas: 90 });
    expect(Math.abs(s.ind.ias - sim.module<InstrumentsApi>("instruments")!.kcasToKias(s.kcas, 0))).toBeLessThan(1);
  });
});

describe("blocked static port", () => {
  it("freezes the altimeter, zeroes the VSI and makes the airspeed indicator read low above / high below", async () => {
    const { sim, pilot } = await makeRig(cruise(360));
    const s = sim.state;
    pilot.fly(50, { altFt: 3500, bankDeg: 0, kcas: 90 });
    const altBefore = s.ind.alt;
    const iasBefore = s.ind.ias;
    expect(Math.abs(s.kcas - 90)).toBeLessThan(1);

    s.sys.failures.staticPort = true;
    pilot.fly(40, { vsFpm: 500, bankDeg: 0, kcas: 90 });
    expect(s.altMslFt).toBeGreaterThan(3700);
    expect(s.vsFpm).toBeGreaterThan(400);
    expect(Math.abs(s.ind.alt - altBefore)).toBeLessThan(3); // frozen
    expect(Math.abs(s.ind.vs)).toBeLessThan(25); // back at zero although really climbing
    expect(s.ind.ias).toBeLessThan(iasBefore - 15); // reads low above the blockage altitude
    expect(Math.abs(s.kcas - 90)).toBeLessThan(1.5);

    pilot.fly(90, { vsFpm: -500, bankDeg: 0, kcas: 90 });
    expect(s.altMslFt).toBeLessThan(3300);
    expect(Math.abs(s.ind.alt - altBefore)).toBeLessThan(3);
    expect(Math.abs(s.ind.vs)).toBeLessThan(25);
    expect(s.ind.ias).toBeGreaterThan(iasBefore + 8); // reads high below it

    // unblocked: everything catches up again
    s.sys.failures.staticPort = false;
    pilot.fly(20, { vsFpm: 0, bankDeg: 0, kcas: 90 });
    expect(Math.abs(s.ind.alt - s.altMslFt)).toBeLessThan(25);
    expect(Math.abs(s.ind.ias - sim.module<InstrumentsApi>("instruments")!.kcasToKias(s.kcas, 0))).toBeLessThan(1);
  });
});
