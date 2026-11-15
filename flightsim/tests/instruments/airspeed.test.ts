import { describe, expect, it } from "vitest";
import { createInstruments, kcasToKias, kiasToKcas } from "@/instruments";
import { cruise, makeRig } from "./pilot";

/** The calibration table from the project brief (C172P-class POH values). */
const TABLE: { flaps: number; kias: number[]; kcas: number[] }[] = [
  { flaps: 0, kias: [50, 60, 70, 80, 90, 100, 110, 120, 130, 140, 150, 160], kcas: [56, 62, 70, 78, 87, 97, 107, 117, 127, 137, 147, 157] },
  { flaps: 10, kias: [40, 50, 60, 70, 80, 85], kcas: [49, 55, 62, 70, 79, 83] },
  { flaps: 30, kias: [40, 50, 60, 70, 80, 85], kcas: [47, 53, 61, 70, 80, 84] },
];

describe("airspeed calibration (KCAS ↔ KIAS)", () => {
  it("reproduces every point of the published table", () => {
    for (const row of TABLE) {
      row.kias.forEach((kias, i) => {
        const kcas = row.kcas[i]!;
        expect(kcasToKias(kcas, row.flaps)).toBeCloseTo(kias, 9);
        expect(kiasToKcas(kias, row.flaps)).toBeCloseTo(kcas, 6);
      });
    }
  });

  it("gives the published stall speeds", () => {
    expect(kcasToKias(51, 0)).toBeCloseTo(44, 9); // clean: 44 KIAS = 51 KCAS
    expect(kcasToKias(46, 30)).toBeCloseTo(33, 9); // flaps 30: 33 KIAS = 46 KCAS
    expect(kiasToKcas(44, 0)).toBeCloseTo(51, 6);
    expect(kiasToKcas(33, 30)).toBeCloseTo(46, 6);
  });

  it("always rises with speed, and the two functions undo each other", () => {
    for (const flaps of [0, 4, 10, 17, 20, 30]) {
      let previous = -1;
      for (let kcas = 0.5; kcas <= 220; kcas += 0.5) {
        const kias = kcasToKias(kcas, flaps);
        expect(kias).toBeGreaterThan(previous);
        previous = kias;
        expect(kiasToKcas(kias, flaps)).toBeCloseTo(kcas, 6);
      }
      for (let kias = 1; kias <= 200; kias += 1.5) expect(kcasToKias(kiasToKcas(kias, flaps), flaps)).toBeCloseTo(kias, 6);
    }
    expect(kcasToKias(0, 0)).toBe(0);
    expect(kiasToKcas(0, 30)).toBe(0);
    expect(kcasToKias(-5, 0)).toBe(0);
  });

  it("interpolates between flap settings", () => {
    // flaps 20 is half way between the flaps-10 and flaps-30 columns
    expect(kcasToKias(61, 20)).toBeCloseTo((kcasToKias(61, 10) + kcasToKias(61, 30)) / 2, 9);
    // flaps 5 is half way between flaps up and flaps 10
    expect(kcasToKias(55, 5)).toBeCloseTo((kcasToKias(55, 0) + kcasToKias(55, 10)) / 2, 9);
    // out-of-range flap angles are treated as the nearest end
    expect(kcasToKias(70, -3)).toBe(kcasToKias(70, 0));
    expect(kcasToKias(70, 45)).toBe(kcasToKias(70, 30));
  });

  it("is also available on the module object", () => {
    const inst = createInstruments();
    expect(inst.name).toBe("instruments");
    expect(inst.kcasToKias(97, 0)).toBeCloseTo(100, 9);
    expect(inst.kiasToKcas(100, 0)).toBeCloseTo(97, 6);
  });
});

describe("airspeed indicator in flight", () => {
  it("matches the calibration table within 1 kt at several speeds and flap settings", async () => {
    const cases: { flapIndex: number; flaps: number; kcas: number; kias: number }[] = [
      { flapIndex: 0, flaps: 0, kcas: 70, kias: 70 },
      { flapIndex: 0, flaps: 0, kcas: 87, kias: 90 },
      { flapIndex: 0, flaps: 0, kcas: 107, kias: 110 },
      { flapIndex: 0, flaps: 0, kcas: 62, kias: 60 },
      { flapIndex: 1, flaps: 10, kcas: 62, kias: 60 },
      { flapIndex: 1, flaps: 10, kcas: 79, kias: 80 },
      { flapIndex: 3, flaps: 30, kcas: 61, kias: 60 },
      { flapIndex: 3, flaps: 30, kcas: 53, kias: 50 },
    ];
    for (const k of cases) {
      const { sim, pilot } = await makeRig(cruise(360, 40, -100, { kias: Math.max(65, k.kcas) }));
      const s = sim.state;
      sim.controls.flapIndex = k.flapIndex;
      pilot.fly(60, { altFt: 3500, bankDeg: 0, kcas: k.kcas });
      // the robot pilot is holding the target speed …
      expect(Math.abs(s.kcas - k.kcas), `holding ${k.kcas} KCAS with flaps ${k.flaps}`).toBeLessThan(0.6);
      expect(Math.abs(s.flapsDeg - k.flaps)).toBeLessThan(0.2);
      // … and the indicator shows the table value
      expect(Math.abs(s.ind.ias - k.kias), `flaps ${k.flaps}: ${k.kcas} KCAS should show ${k.kias} KIAS, shows ${s.ind.ias.toFixed(1)}`).toBeLessThan(1);
      expect(Math.abs(s.ind.ias - kcasToKias(s.kcas, s.flapsDeg))).toBeLessThan(0.3);
    }
  });

  it("rests at zero when standing still and comes alive on the take-off roll", async () => {
    const { sim } = await makeRig({ kind: "runway", airportIdent: "KSFO", runwayEndId: "28R" }, { elevM: 4 });
    const s = sim.state;
    sim.advance(3);
    expect(s.ind.ias).toBe(0);
    sim.controls.parkingBrake = false;
    sim.controls.throttle = 1;
    let aliveAtKcas = 0;
    let readingAt15 = -1;
    let readingAt45 = -1;
    for (let t = 0; t < 40 && s.kcas < 50; t += 0.05) {
      sim.controls.rudder = Math.max(-1, Math.min(1, (298 - s.headingTrue) * 0.08 - s.yawRate * 0.05));
      sim.advance(0.05);
      if (!aliveAtKcas && s.ind.ias > 5) aliveAtKcas = s.kcas;
      if (readingAt15 < 0 && s.kcas >= 15) readingAt15 = s.ind.ias;
      if (readingAt45 < 0 && s.kcas >= 45) readingAt45 = s.ind.ias;
    }
    expect(s.crash).toBeNull();
    // nothing below about 20 kt, "airspeed alive" somewhere between 20 and 35 kt
    expect(readingAt15).toBe(0);
    expect(aliveAtKcas).toBeGreaterThan(20);
    expect(aliveAtKcas).toBeLessThan(35);
    // from there on it follows the calibration (a little behind while accelerating)
    expect(readingAt45).toBeGreaterThan(kcasToKias(45, 0) - 3);
    expect(readingAt45).toBeLessThan(kcasToKias(45, 0) + 0.5);
  });
});
