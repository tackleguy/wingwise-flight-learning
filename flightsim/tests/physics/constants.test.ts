/** The exported constants and the adapter's sign conventions (what other modules rely on). */
import { describe, expect, it } from "vitest";
import { AIRCRAFT } from "@/core/defaults";
import {
  AIRSPEED_CALIBRATION,
  AIRSPEED_CAL_FLAPS_10,
  AIRSPEED_CAL_FLAPS_30,
  AIRSPEED_CAL_FLAPS_UP,
  ALPHA_STALL_CLEAN_DEG,
  ALPHA_STALL_FLAPS10_DEG,
  ALPHA_STALL_FLAPS20_DEG,
  ALPHA_STALL_FLAPS30_DEG,
  FLAP_RATE_DEG_PER_SEC,
  alphaStallDeg,
  kcasToKias,
  kiasToKcas,
} from "@/physics/constants";
import { TestPilot, airborne, fly, lab } from "./lab";
import { stall } from "./measure";

describe("airspeed calibration tables", () => {
  it("reproduce the handbook-class table points exactly", () => {
    expect(AIRSPEED_CAL_FLAPS_UP.kias).toEqual([50, 60, 70, 80, 90, 100, 110, 120, 130, 140, 150, 160]);
    expect(AIRSPEED_CAL_FLAPS_UP.kcas).toEqual([56, 62, 70, 78, 87, 97, 107, 117, 127, 137, 147, 157]);
    expect(AIRSPEED_CAL_FLAPS_10.kias).toEqual([40, 50, 60, 70, 80, 85]);
    expect(AIRSPEED_CAL_FLAPS_10.kcas).toEqual([49, 55, 62, 70, 79, 83]);
    expect(AIRSPEED_CAL_FLAPS_30.kias).toEqual([40, 50, 60, 70, 80, 85]);
    expect(AIRSPEED_CAL_FLAPS_30.kcas).toEqual([47, 53, 61, 70, 80, 84]);
    for (const t of AIRSPEED_CALIBRATION) {
      t.kias.forEach((kias, i) => {
        expect(kiasToKcas(kias, t.flapsDeg)).toBeCloseTo(t.kcas[i]!, 9);
        expect(kcasToKias(t.kcas[i]!, t.flapsDeg)).toBeCloseTo(kias, 9);
      });
    }
  });

  it("convert both ways consistently and smoothly between and beyond the points", () => {
    for (const flaps of [0, 5, 10, 20, 30]) {
      let prev = -1;
      for (let kias = 0; kias <= 175; kias += 2.5) {
        const kcas = kiasToKcas(kias, flaps);
        expect(kcas).toBeGreaterThanOrEqual(prev); // never goes backwards
        prev = kcas;
        if (flaps === 0 || flaps === 10 || flaps === 30) expect(kcasToKias(kcas, flaps)).toBeCloseTo(kias, 6);
        else expect(Math.abs(kcasToKias(kcas, flaps) - kias)).toBeLessThan(1.5); // blended tables: close, not exact
      }
    }
    expect(kiasToKcas(0)).toBe(0);
    expect(kiasToKcas(76)).toBeCloseTo(74.8, 6); // Vy
    expect(kiasToKcas(65)).toBeCloseTo(66, 6); // best glide
    expect(kiasToKcas(60, 20)).toBeCloseTo(61.5, 6); // halfway between the flaps-10 and flaps-30 tables
    // the published stall speeds, indicated and calibrated, agree with the tables to within a knot or two
    expect(Math.abs(kcasToKias(51, 0) - AIRCRAFT.v.s1)).toBeLessThan(3);
    expect(Math.abs(kcasToKias(46, 30) - AIRCRAFT.v.s0)).toBeLessThan(6.5); // far below the table: the handbook value is an extrapolation
  });
});

describe("stall angles of attack", () => {
  it("are consistent with each other and with the flap-rate constant", () => {
    expect(ALPHA_STALL_CLEAN_DEG).toBeGreaterThan(ALPHA_STALL_FLAPS10_DEG);
    expect(ALPHA_STALL_FLAPS10_DEG).toBeGreaterThan(ALPHA_STALL_FLAPS20_DEG);
    expect(ALPHA_STALL_FLAPS20_DEG).toBeGreaterThan(ALPHA_STALL_FLAPS30_DEG);
    expect(alphaStallDeg(0)).toBe(ALPHA_STALL_CLEAN_DEG);
    expect(alphaStallDeg(30)).toBe(ALPHA_STALL_FLAPS30_DEG);
    expect(alphaStallDeg(15)).toBeCloseTo((ALPHA_STALL_FLAPS10_DEG + ALPHA_STALL_FLAPS20_DEG) / 2, 9);
    expect(alphaStallDeg(-5)).toBe(ALPHA_STALL_CLEAN_DEG);
    expect(alphaStallDeg(45)).toBe(ALPHA_STALL_FLAPS30_DEG);
    expect(FLAP_RATE_DEG_PER_SEC).toBeCloseTo(10 / 3, 9);
  });

  it("match the angle of attack at maximum lift measured in the flight model for every flap setting", async () => {
    const expected = [ALPHA_STALL_CLEAN_DEG, ALPHA_STALL_FLAPS10_DEG, ALPHA_STALL_FLAPS20_DEG, ALPHA_STALL_FLAPS30_DEG];
    for (let fi = 0; fi < 4; fi++) {
      const r = await stall({ flapIndex: fi });
      expect(Math.abs(r.alphaAtClMaxDeg - expected[fi]!), `flaps ${fi * 10}: measured ${r.alphaAtClMaxDeg.toFixed(2)}°`).toBeLessThan(0.7);
    }
  });
});

describe("adapter sign conventions (TeachX: + = pull / roll right / yaw right / nose-up trim)", () => {
  async function cruise() {
    const sim = await lab({ weightLb: 2000 });
    await airborne(sim, 4000, 100);
    fly(sim, 10, new TestPilot({ altFt: 4000, rudder: "ball" }));
    const c = sim.controls;
    c.elevator = c.aileron = c.rudder = 0;
    return sim;
  }

  it("elevator +: nose up, and the elevator surface moves trailing-edge up", async () => {
    const sim = await cruise();
    const p0 = sim.state.pitch;
    const e0 = sim.state.surfaces.elevatorDeg;
    sim.controls.elevator = 0.3;
    sim.advance(1);
    expect(sim.state.pitch).toBeGreaterThan(p0 + 3);
    expect(sim.state.pitchRate).toBeGreaterThan(0);
    expect(sim.state.surfaces.elevatorDeg).toBeGreaterThan(e0 + 5);
    expect(sim.state.nz).toBeGreaterThan(1.1);
    sim.dispose();
  });

  it("aileron +: rolls right; left aileron down, right aileron up", async () => {
    const sim = await cruise();
    sim.controls.aileron = 0.5;
    sim.advance(1);
    expect(sim.state.roll).toBeGreaterThan(8);
    expect(sim.state.rollRate).toBeGreaterThan(5);
    expect(sim.state.surfaces.aileronLeftDeg).toBeGreaterThan(3);
    expect(sim.state.surfaces.aileronRightDeg).toBeLessThan(-3);
    sim.dispose();
  });

  it("rudder +: yaws right (and then rolls right through the dihedral effect)", async () => {
    const sim = await cruise();
    const h0 = sim.state.headingTrue;
    sim.controls.rudder = 0.5;
    sim.advance(1);
    expect(sim.state.yawRate).toBeGreaterThan(1);
    expect(sim.state.surfaces.rudderDeg).toBeGreaterThan(5);
    expect(sim.state.ny).toBeGreaterThan(0.02); // sideways force toward the right wing: the ball goes left
    sim.advance(3);
    expect(((sim.state.headingTrue - h0 + 540) % 360) - 180).toBeGreaterThan(3);
    expect(sim.state.roll).toBeGreaterThan(3);
    sim.dispose();
  });

  it("trim +: nose-up trim (the aircraft settles at a lower speed)", async () => {
    const sim = await cruise();
    const k0 = sim.state.kcas;
    sim.controls.trim += 0.15;
    const wings = new TestPilot({ elevator: 0, headingDeg: 360, rudder: "ball" });
    fly(sim, 4, wings);
    expect(sim.state.pitchRate + sim.state.pitch).toBeGreaterThan(0);
    let sum = 0;
    let n = 0;
    fly(sim, 60, wings, () => {
      sum += sim.state.kcas;
      n++;
    });
    expect(sum / n).toBeLessThan(k0 - 5);
    sim.dispose();
  });

  it("on the ground the rudder pedals steer the nose wheel and the toe brakes turn the aircraft", async () => {
    const taxi = async (set: (c: Awaited<ReturnType<typeof lab>>["controls"]) => void) => {
      const sim = await lab();
      await sim.spawn({ kind: "runway", airportIdent: "KSFO", runwayEndId: "28R" });
      const c = sim.controls;
      c.parkingBrake = false;
      c.throttle = 0.35;
      const h0 = sim.state.headingTrue;
      sim.advance(3);
      set(c);
      sim.advance(4);
      const d = ((sim.state.headingTrue - h0 + 540) % 360) - 180;
      sim.dispose();
      return d;
    };
    expect(await taxi((c) => void (c.rudder = 0.5))).toBeGreaterThan(8);
    expect(await taxi((c) => void (c.rudder = -0.5))).toBeLessThan(-8);
    // a brake held on one side swings the aircraft that way (the nose wheel swivels at taxi speed)
    const rightBrake = await taxi((c) => void (c.brakeRight = 0.6));
    const leftBrake = await taxi((c) => void (c.brakeLeft = 0.6));
    expect(rightBrake).toBeGreaterThan(3);
    expect(leftBrake).toBeLessThan(-3);
  });

  it("flap handle positions give 0, 10, 20 and 30 degrees", async () => {
    const sim = await lab();
    await airborne(sim, 4000, 75);
    const pilot = new TestPilot({ kcas: 72, rudder: "ball" });
    for (let i = 0; i < AIRCRAFT.flapDetentsDeg.length; i++) {
      sim.controls.flapIndex = i;
      fly(sim, 11, pilot);
      expect(sim.state.flapsDeg).toBeCloseTo(AIRCRAFT.flapDetentsDeg[i]!, 3);
    }
    sim.dispose();
  });
});
