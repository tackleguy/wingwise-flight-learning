/** Weight and balance: the TypeScript module agrees with the flight model, and loading changes how the aircraft flies. */
import { describe, expect, it } from "vitest";
import {
  CG_AFT_LIMIT_IN,
  CG_ENVELOPE,
  EMPTY_ARM_IN,
  EMPTY_WEIGHT_LB,
  MAX_GROSS_WEIGHT_LB,
  STATIONS,
  computeWeightBalance,
  forwardLimitIn,
  type Loading,
} from "@/physics/weight-balance";
import { AIRCRAFT } from "@/core/defaults";
import { lab } from "./lab";
import { elevatorPerG, stall, steadyClimb, trimPoint } from "./measure";

const loadings: { name: string; l: Loading }[] = [
  { name: "pilot only, full fuel", l: { fuelLeftGal: 20, fuelRightGal: 20, payloadLb: [170, 0, 0, 0, 0] } },
  { name: "two in front, full fuel", l: { fuelLeftGal: 20, fuelRightGal: 20, payloadLb: [170, 170, 0, 0, 0] } },
  { name: "four people, half fuel", l: { fuelLeftGal: 10, fuelRightGal: 10, payloadLb: [180, 160, 150, 140, 40] } },
  { name: "heavy and aft", l: { fuelLeftGal: 20, fuelRightGal: 20, payloadLb: [150, 0, 190, 190, 120] } },
  { name: "uneven fuel", l: { fuelLeftGal: 5, fuelRightGal: 18, payloadLb: [200, 120, 0, 90, 15] } },
  { name: "empty seats, no fuel", l: { fuelLeftGal: 0, fuelRightGal: 0, payloadLb: [0, 0, 0, 0, 0] } },
];

describe("weight and balance module", () => {
  it("matches the weight and centre of gravity reported by the flight model", async () => {
    for (const { name, l } of loadings) {
      const sim = await lab();
      Object.assign(sim.loading, { fuelLeftGal: l.fuelLeftGal, fuelRightGal: l.fuelRightGal, payloadLb: [...l.payloadLb] });
      await sim.spawn({ kind: "ramp", airportIdent: "KSFO" });
      const wb = computeWeightBalance(l);
      expect(Math.abs(sim.state.weightLb - wb.weightLb), `${name}: weight`).toBeLessThan(1);
      expect(Math.abs(sim.state.cgIn - wb.cgIn), `${name}: centre of gravity`).toBeLessThan(0.5);
      const lateral = sim.fdm!.getProperty("inertia/cg-y-in");
      expect(Math.abs(lateral - wb.lateralCgIn), `${name}: lateral balance`).toBeLessThan(0.3);
      sim.dispose();
    }
  });

  it("uses the same empty weight as the rest of the app", () => {
    expect(EMPTY_WEIGHT_LB).toBe(AIRCRAFT.emptyWeightLb);
    expect(MAX_GROSS_WEIGHT_LB).toBe(AIRCRAFT.maxGrossLb);
    const empty = computeWeightBalance({ fuelLeftGal: 0, fuelRightGal: 0, payloadLb: [0, 0, 0, 0, 0] });
    expect(empty.weightLb).toBe(EMPTY_WEIGHT_LB);
    expect(empty.cgIn).toBeCloseTo(EMPTY_ARM_IN, 6);
    expect(STATIONS).toHaveLength(7);
  });

  it("adds up a handbook-style loading problem", () => {
    // two front seats 340 lb, rear seats 340 lb, baggage 26 lb, 40 gal of fuel
    const wb = computeWeightBalance({ fuelLeftGal: 20, fuelRightGal: 20, payloadLb: [170, 170, 170, 170, 26] });
    expect(wb.weightLb).toBeCloseTo(2400, 6);
    const moment = 1454 * 39.6 + 340 * 37 + 340 * 73 + 26 * 95 + 240 * 48;
    expect(wb.momentLbIn).toBeCloseTo(moment, 3);
    expect(wb.cgIn).toBeCloseTo(moment / 2400, 6);
    expect(wb.withinEnvelope).toBe(true);
    expect(wb.problems).toHaveLength(0);
    expect(wb.items[0]!.id).toBe("empty");
    expect(wb.items.reduce((a, i) => a + i.weightLb, 0)).toBeCloseTo(wb.weightLb, 6);
  });

  it("knows the normal-category envelope", () => {
    expect(forwardLimitIn(1600)).toBe(35);
    expect(forwardLimitIn(1950)).toBe(35);
    expect(forwardLimitIn(2400)).toBeCloseTo(39.5, 9);
    expect(forwardLimitIn(2175)).toBeCloseTo(37.25, 9);
    expect(CG_AFT_LIMIT_IN).toBe(47.3);
    expect(CG_ENVELOPE.map((p) => p.cgIn)).toEqual([35, 35, 39.5, 47.3, 47.3]);
    expect(Math.max(...CG_ENVELOPE.map((p) => p.weightLb))).toBe(2400);

    const over = computeWeightBalance({ fuelLeftGal: 20, fuelRightGal: 20, payloadLb: [200, 200, 200, 200, 120] });
    expect(over.withinEnvelope).toBe(false);
    expect(over.overweightLb).toBeCloseTo(over.weightLb - 2400, 6);
    expect(over.problems.join(" ")).toMatch(/Overweight/);

    const aft = computeWeightBalance({ fuelLeftGal: 3, fuelRightGal: 3, payloadLb: [120, 0, 200, 200, 120] });
    expect(aft.cgIn).toBeGreaterThan(CG_AFT_LIMIT_IN);
    expect(aft.withinEnvelope).toBe(false);
    expect(aft.problems.join(" ")).toMatch(/too far aft/);

    const baggage = computeWeightBalance({ fuelLeftGal: 10, fuelRightGal: 10, payloadLb: [170, 0, 0, 0, 150] });
    expect(baggage.withinEnvelope).toBe(false);
    expect(baggage.items.find((i) => i.id === "baggage")!.overLimit).toBe(true);

    // typical training loads are inside
    expect(computeWeightBalance({ fuelLeftGal: 20, fuelRightGal: 20, payloadLb: [170, 0, 0, 0, 0] }).withinEnvelope).toBe(true);
    expect(computeWeightBalance({ fuelLeftGal: 20, fuelRightGal: 20, payloadLb: [170, 170, 0, 0, 0] }).withinEnvelope).toBe(true);
  });
});

describe("loading changes how the aircraft flies", () => {
  const forward: [number, number, number, number, number] = [200, 200, 0, 0, 0];
  const aft: [number, number, number, number, number] = [170, 0, 170, 170, 100];

  it("an aft centre of gravity makes the aircraft lighter and less stable in pitch", async () => {
    const f = await elevatorPerG({ payloadLb: forward });
    const a = await elevatorPerG({ payloadLb: aft });
    expect(f.cgIn).toBeLessThan(41);
    expect(a.cgIn).toBeGreaterThan(46.5);
    expect(a.cgIn).toBeLessThanOrEqual(CG_AFT_LIMIT_IN + 0.5);
    // less elevator per g at aft CG (the yoke is "lighter"), but still positive: the aircraft stays stable inside the envelope
    expect(a.degPerG).toBeGreaterThan(1.5);
    expect(a.degPerG).toBeLessThan(f.degPerG * 0.9);
    // and the trim moves less between slow and fast flight (weaker speed stability)
    const fSlow = await trimPoint(70, { payloadLb: forward });
    const fFast = await trimPoint(110, { payloadLb: forward });
    const aSlow = await trimPoint(70, { payloadLb: aft });
    const aFast = await trimPoint(110, { payloadLb: aft });
    const fRange = fSlow.elevatorDeg - fFast.elevatorDeg;
    const aRange = aSlow.elevatorDeg - aFast.elevatorDeg;
    expect(fRange).toBeGreaterThan(0);
    expect(aRange).toBeGreaterThan(0);
    expect(aRange).toBeLessThan(fRange * 0.9);
  });

  it("a forward centre of gravity needs more up-elevator to stall and stalls a little faster for the same weight", async () => {
    const fwd = await stall({ payloadLb: [215, 215, 0, 0, 0], fuelGalPerTank: 20 }); // 2124 lb, CG about 40 in
    const back = await stall({ payloadLb: [100, 0, 150, 150, 30], fuelGalPerTank: 20 }); // 2124 lb, CG about 46 in
    expect(Math.abs(fwd.weightLb - back.weightLb)).toBeLessThan(5);
    expect(back.cgIn - fwd.cgIn).toBeGreaterThan(4);
    expect(fwd.elevatorAtStall).toBeGreaterThan(back.elevatorAtStall + 0.1);
    expect(fwd.kcas).toBeGreaterThan(back.kcas);
    expect(fwd.kcas - back.kcas).toBeLessThan(4);
  });

  it("overloading visibly hurts the climb", async () => {
    const sl = { seaLevelAtFt: 2500 };
    const gross = await steadyClimb(0, 76, sl);
    const over = await steadyClimb(0, 76, { ...sl, weightLb: 2700 });
    expect(over.weightLb).toBeGreaterThan(2690);
    expect(gross.fpm - over.fpm).toBeGreaterThan(100);
    const overStall = await stall({ weightLb: 2700 });
    const grossStall = await stall();
    expect(overStall.kcas).toBeGreaterThan(grossStall.kcas + 2);
  });
});
