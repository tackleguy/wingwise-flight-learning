/**
 * Flight-model validation: flies the shipped JSBSim model with a scripted test pilot, compares each
 * measured number with handbook-class figures, and writes docs/PHYSICS-VALIDATION.md and
 * docs/physics-validation.json (see report.ts). Every `it` asserts that its rows are inside tolerance.
 */
import { afterAll, describe, expect, it } from "vitest";
import { ALPHA_STALL_CLEAN_DEG, ALPHA_STALL_FLAPS30_DEG, kcasToKias } from "@/physics/constants";
import {
  climbHandsOff,
  cruiseHandsOff,
  engineStart,
  flapTravelSec,
  glide,
  landing,
  levelDeceleration,
  levelFlight,
  magnetoCheck,
  powerAtRpm,
  RIG_POINT,
  spin,
  stall,
  staticRunUp,
  steadyClimb,
  takeoff,
  trimPoint,
} from "./measure";
import { record, writeReport, type ValidationRow } from "./report";

/** Sea-level air is placed 2,500 ft above the ground so sea-level numbers can be measured in flight. */
const SL = { seaLevelAtFt: 2500 } as const;

const check = (r: ValidationRow) => expect(r.pass, `${r.quantity}: simulated ${r.simulated.toFixed(2)} ${r.unit}, accepted ${r.min} to ${r.max}`).toBe(true);

afterAll(() => writeReport());

describe("performance against handbook-class figures (2,400 lb, standard day)", () => {
  it("stalls at the published speeds, flaps up and flaps 30", async () => {
    const clean = await stall();
    const full = await stall({ flapIndex: 3 });
    const method = "idle power, slow down 1 kt per second with the elevator until the yoke is fully back or the nose drops; lowest calibrated airspeed";
    check(record({ group: "performance", quantity: "Stall speed, flaps up, power idle", published: "51 KCAS (44 KIAS)", simulated: clean.kcas, unit: "KCAS", min: 48, max: 54, method }));
    check(record({ group: "performance", quantity: "Stall speed, flaps 30°, power idle", published: "46 KCAS (33 KIAS)", simulated: full.kcas, unit: "KCAS", min: 43, max: 49, method }));
    // weight effect: stall speed goes with the square root of weight
    const light = await stall({ weightLb: 1900 });
    const theory = clean.kcas * Math.sqrt(light.weightLb / clean.weightLb);
    check(
      record({
        group: "performance",
        quantity: "Stall speed at 1,900 lb, flaps up",
        published: `${theory.toFixed(1)} KCAS (2,400 lb value × √ of the weight ratio)`,
        simulated: light.kcas,
        unit: "KCAS",
        min: Number((theory - 2).toFixed(1)),
        max: Number((theory + 2).toFixed(1)),
        method: "same manoeuvre at 1,900 lb, compared with the square-root-of-weight rule",
      }),
    );
  });

  it("climbs at the published rates and runs out of climb near the service ceiling", async () => {
    const method = "full throttle, constant indicated airspeed, height gained over 30 s centred on the altitude";
    const sl = await steadyClimb(0, 76, SL);
    check(record({ group: "performance", quantity: "Rate of climb, sea level, 76 KIAS", published: "700 ft/min", simulated: sl.fpm, unit: "ft/min", min: 620, max: 780, method: `${method}; mixture rich` }));
    const c6 = await steadyClimb(6000, 73, { leanForPower: true });
    check(record({ group: "performance", quantity: "Rate of climb, 6,000 ft, 73 KIAS", published: "about 485 ft/min", simulated: c6.fpm, unit: "ft/min", min: 405, max: 565, method: `${method}; mixture leaned for most power, as the handbook asks above 3,000 ft` }));
    const c12 = await steadyClimb(12000, 70, { leanForPower: true });
    check(record({ group: "performance", quantity: "Rate of climb, 12,000 ft, 70 KIAS", published: "small (service ceiling 13,000 ft)", simulated: c12.fpm, unit: "ft/min", min: 0, max: 250, method: `${method}; mixture leaned for most power` }));
    const light = await steadyClimb(0, 76, { ...SL, weightLb: 1900 });
    check(
      record({
        group: "performance",
        quantity: "Rate of climb, sea level, at 1,900 lb",
        published: "clearly better than at 2,400 lb",
        simulated: light.fpm,
        unit: "ft/min",
        min: Math.round(sl.fpm + 150),
        max: 1500,
        method: `${method}; 500 lb lighter`,
      }),
    );
    expect(sl.rpm).toBeGreaterThan(2350);
    expect(sl.rpm).toBeLessThan(2600);
  });

  it("glides about 1.5 nautical miles per 1,000 ft", async () => {
    const g = await glide(65);
    check(record({ group: "performance", quantity: "Glide ratio, 65 KIAS, propeller windmilling", published: "9.1 to 1 (1.5 nm per 1,000 ft)", simulated: g.ratio, unit: "to 1", min: 8.1, max: 10.1, digits: 2, method: "throttle closed, constant 65 KIAS for 60 s in still air: distance flown divided by height lost" }));
    expect(g.nmPer1000Ft).toBeGreaterThan(1.3);
    expect(g.nmPer1000Ft).toBeLessThan(1.7);
  });

  it("has the right engine: static rpm and rated power", async () => {
    const st = await staticRunUp();
    check(record({ group: "performance", quantity: "Static rpm, full throttle, brakes held", published: "2300 to 2420 rpm", simulated: st.rpm, unit: "rpm", min: 2300, max: 2420, method: "on the runway, brakes held, full throttle, mixture rich, 12 s" }));
    const p = await powerAtRpm(2700, 0, SL);
    expect(Math.abs(p.rpm - 2700)).toBeLessThan(15);
    check(record({ group: "performance", quantity: "Power at full throttle and 2700 rpm, sea level", published: "160 bhp (rated)", simulated: p.powerHp, unit: "bhp", min: 152, max: 168, method: "full throttle; the pilot adjusts the airspeed until the fixed-pitch propeller turns 2700 rpm" }));
  });

  it("cruises at 8,000 ft at the published speed and fuel flow", async () => {
    const c = await levelFlight(8000, { lean: "peak", startKias: 105 });
    const method = "level at 8,000 ft, full throttle, mixture leaned to peak exhaust temperature (the handbook's recommended lean), 70 s to settle";
    check(record({ group: "performance", quantity: "Cruise speed, 8,000 ft, about 75 % power", published: "118 to 121 KTAS", simulated: c.ktas, unit: "KTAS", min: 118, max: 121, method }));
    check(record({ group: "performance", quantity: "Cruise fuel flow, 8,000 ft, leaned", published: "about 8.4 gal/h", simulated: c.fuelGph, unit: "gal/h", min: 7.4, max: 9.4, digits: 2, method }));
    check(record({ group: "performance", quantity: "Cruise power, 8,000 ft, full throttle", published: "about 75 % of 160 bhp", simulated: (c.powerHp / 160) * 100, unit: "%", min: 68, max: 80, method }));
    check(record({ group: "performance", quantity: "Cruise rpm, 8,000 ft, full throttle", published: "about 2550 to 2600 rpm", simulated: c.rpm, unit: "rpm", min: 2500, max: 2700, method }));
  });

  it("reaches the published maximum level speed at sea level", async () => {
    const v = await levelFlight(0, { ...SL, rpmLimit: 2700, startKias: 118 });
    check(record({ group: "performance", quantity: "Maximum level speed, sea level", published: "123 kt", simulated: v.ktas, unit: "kt", min: 118, max: 128, method: "level flight at sea-level density, full throttle but not above the 2700 rpm red line, 70 s to settle" }));
    expect(v.rpm).toBeLessThan(2710);
  });

  it("takes off in the published distances", async () => {
    const t = await takeoff();
    expect(t.crashed).toBe(false);
    const method = "flaps 10°, brakes held, full throttle, release; nose up at 51 KIAS; climb at 56 KIAS; paved, level, no wind";
    check(record({ group: "performance", quantity: "Take-off ground roll", published: "890 ft", simulated: t.groundRollFt, unit: "ft", min: 740, max: 1040, method }));
    check(record({ group: "performance", quantity: "Take-off distance to clear 50 ft", published: "1625 ft", simulated: t.to50FtFt, unit: "ft", min: 1375, max: 1875, method }));
    check(record({ group: "performance", quantity: "Lift-off speed", published: "51 to 56 KIAS", simulated: kcasToKias(t.liftoffKcas, 10), unit: "KIAS", min: 50, max: 57, method: "calibrated airspeed when the wheels leave the runway, converted with the flaps-10 calibration table" }));
  });

  it("lands in the published ground roll", async () => {
    const l = await landing();
    expect(l.crashed).toBe(false);
    const method = "flaps 30°, power off, 61 KIAS at 50 ft, flare, then full braking with the yoke held back";
    check(record({ group: "performance", quantity: "Landing ground roll, maximum braking", published: "540 ft", simulated: l.groundRollFt, unit: "ft", min: 390, max: 690, method }));
    check(record({ group: "performance", quantity: "Touchdown speed in that landing", published: "about 50 kt", simulated: l.touchdownKcas, unit: "KCAS", min: 42, max: 53, method }));
    check(record({ group: "performance", quantity: "Landing distance from 50 ft", published: "1280 ft", simulated: l.from50FtFt, unit: "ft", min: 1000, max: 1560, method }));
    expect(l.touchdownFpm).toBeGreaterThan(-600);
  });
});

describe("handling qualities", () => {
  it("is rigged for cruise: hands-off at 100 KIAS it holds bank and heading", async () => {
    const r = await cruiseHandsOff();
    const method = `${RIG_POINT.weightLb} lb, ${RIG_POINT.altFt} ft, 100 KIAS, trimmed, then hands and feet off for 60 s`;
    check(record({ group: "handling", quantity: "Hands-off cruise: largest bank in 60 s", published: "within 5°", simulated: r.maxAbsBankDeg, unit: "°", min: 0, max: 5, digits: 2, method }));
    check(record({ group: "handling", quantity: "Hands-off cruise: largest heading change in 60 s", published: "within 5°", simulated: r.maxAbsHeadingDeg, unit: "°", min: 0, max: 5, digits: 2, method }));
    expect(Math.abs(r.rudderHeld)).toBeLessThan(0.02);
    expect(Math.abs(r.aileronHeld)).toBeLessThan(0.02);
  });

  it("turns left at full power and low speed unless the pilot holds right rudder", async () => {
    const c = await climbHandsOff();
    const method = "full-power climb at 76 KIAS, 2,400 lb";
    check(record({ group: "handling", quantity: "Vy climb: right rudder needed to centre the ball", published: "clearly needed", simulated: c.rudderForBall * 100, unit: "% of travel", min: 6, max: 35, method: `${method}; coordinated, average rudder held` }));
    check(record({ group: "handling", quantity: "Vy climb: heading change 15 s after letting go", published: "to the left", simulated: c.headingChangeDeg, unit: "°", min: -170, max: -10, method: `${method}; trimmed, then hands and feet off (negative = left)` }));
    check(record({ group: "handling", quantity: "Vy climb: bank 15 s after letting go", published: "left wing down", simulated: c.bankDeg, unit: "°", min: -75, max: -5, method: `${method}; trimmed, then hands and feet off (negative = left)` }));
    check(record({ group: "handling", quantity: "Vy climb: sideslip with feet on the floor", published: "ball out to the right", simulated: c.sideslipFeetOffDeg, unit: "°", min: 0.8, max: 8, digits: 2, method: `${method}; wings held level with aileron, no rudder` }));
    const t = await takeoff();
    check(record({ group: "handling", quantity: "Take-off: largest rudder used to stay on the centreline", published: "right rudder, most at lift-off", simulated: t.maxRudder * 100, unit: "% of travel", min: 8, max: 60, method: "calm-wind handbook take-off flown by the test pilot" }));
    expect(t.maxCentrelineErrFt).toBeLessThan(10);
  });

  it("stalls with a clear break and recovers when the back-pressure is released", async () => {
    const clean = await stall({ weightLb: 2100 });
    const full = await stall({ weightLb: 2100, flapIndex: 3 });
    const method = "2,100 lb (two people, full fuel), idle, 1 kt/s, yoke then held fully back for 2 s with the ailerons untouched";
    check(record({ group: "handling", quantity: "Angle of attack at maximum lift, flaps up", published: `${ALPHA_STALL_CLEAN_DEG}° (constants.ts)`, simulated: clean.alphaAtClMaxDeg, unit: "°", min: ALPHA_STALL_CLEAN_DEG - 1, max: ALPHA_STALL_CLEAN_DEG + 1, method }));
    check(record({ group: "handling", quantity: "Angle of attack at maximum lift, flaps 30°", published: `${ALPHA_STALL_FLAPS30_DEG}° (constants.ts)`, simulated: full.alphaAtClMaxDeg, unit: "°", min: ALPHA_STALL_FLAPS30_DEG - 1, max: ALPHA_STALL_FLAPS30_DEG + 1, method }));
    check(record({ group: "handling", quantity: "Stall: how far the nose drops with the yoke held back", published: "a clear nose-drop", simulated: clean.pitchDropDeg, unit: "°", min: 5, max: 40, method }));
    check(record({ group: "handling", quantity: "Stall, coordinated: bank reached in those 2 s", published: "wings stay nearly level", simulated: Math.abs(clean.bankAtReleaseDeg), unit: "°", min: 0, max: 25, method }));
    check(record({ group: "handling", quantity: "Stall recovery: time until the wing flies again", published: "immediate", simulated: clean.recoverySec, unit: "s", min: 0, max: 1.5, digits: 2, method: "back-pressure released; time until the angle of attack is below 12°" }));
    expect(full.recoverySec).toBeGreaterThan(0);
    expect(full.recoverySec).toBeLessThan(1.5);
  });

  it("drops a wing in power-on and uncoordinated stalls", async () => {
    const power = await stall({ weightLb: 2100, throttle: 1, rudder: "none" });
    check(record({ group: "handling", quantity: "Power-on stall, feet on the floor: bank after 2 s", published: "left wing drops", simulated: power.bankAtReleaseDeg, unit: "°", min: -180, max: -20, method: "full throttle, no rudder at all, yoke held back 2 s after the break (negative = left)" }));
    const skidR = await stall({ weightLb: 2100, rudder: 0.6 });
    const skidL = await stall({ weightLb: 2100, rudder: -0.6 });
    check(record({ group: "handling", quantity: "Skidding stall, right rudder: bank after 2 s", published: "right wing drops", simulated: skidR.bankAtReleaseDeg, unit: "°", min: 15, max: 180, method: "idle; 60 % right rudder put in at the break, yoke held back 2 s" }));
    check(record({ group: "handling", quantity: "Skidding stall, left rudder: bank after 2 s", published: "left wing drops", simulated: skidL.bankAtReleaseDeg, unit: "°", min: -180, max: -15, method: "idle; 60 % left rudder put in at the break, yoke held back 2 s" }));
  });

  it("spins when held in, and recovers with the standard recovery", async () => {
    for (const dir of [-1, 1] as const) {
      const name = dir < 0 ? "left" : "right";
      const s = await spin(dir, { weightLb: 2100 });
      expect(s.crashed).toBe(false);
      expect(s.sustained, `spin ${name} sustained`).toBe(true);
      const method = "2,100 lb, idle; at the stall full aft yoke and full rudder held 16 s; averages over the last 6 s";
      check(record({ group: "handling", quantity: `Spin ${name}: rate of turn`, published: "sustained, roughly 2 to 3 s per turn", simulated: Math.abs(s.turnRateDps), unit: "°/s", min: 70, max: 240, method }));
      check(record({ group: "handling", quantity: `Spin ${name}: angle of attack`, published: "well beyond the stall", simulated: s.alphaDeg, unit: "°", min: 25, max: 55, method }));
      check(record({ group: "handling", quantity: `Spin ${name}: airspeed`, published: "low and steady", simulated: s.kcas, unit: "KCAS", min: 45, max: 85, method }));
      check(record({ group: "handling", quantity: `Spin ${name}: airspeed wander`, published: "roughly steady", simulated: s.kcasSpread, unit: "kt", min: 0, max: 10, method: "highest minus lowest calibrated airspeed over the last 6 s" }));
      check(record({ group: "handling", quantity: `Spin ${name}: rate of descent`, published: "high", simulated: s.descentFpm, unit: "ft/min", min: 4500, max: 10000, method }));
      check(record({ group: "handling", quantity: `Spin ${name}: turns to stop after recovery controls`, published: "within about 1½ turns", simulated: s.recoveryTurns, unit: "turns", min: 0, max: 1.5, digits: 2, method: "power idle, ailerons neutral, full opposite rudder, yoke forward; until rotation has stopped" }));
      expect(s.maxG).toBeLessThan(3.8);
      expect(s.maxKcas).toBeLessThan(158);
    }
    const let_go = await spin(1, { weightLb: 2100, recovery: "release" });
    check(record({ group: "handling", quantity: "Spin right: turns to stop after simply letting go", published: "stops by itself", simulated: let_go.recoveryTurns, unit: "turns", min: 0, max: 2.5, digits: 2, method: "all controls released instead of the standard recovery" }));
  });

  it("floats in ground effect", async () => {
    const free = await levelDeceleration(null);
    const low = await levelDeceleration(2);
    const span = await levelDeceleration(36);
    check(record({ group: "handling", quantity: "Ground effect: float distance 2 ft above the runway", published: "longer than out of ground effect", simulated: (low.floatFt / free.floatFt) * 100, unit: "% of free-air", min: 115, max: 170, method: "throttle closed, level, distance to slow from 68 to 58 KCAS, compared with the same far from the ground" }));
    check(record({ group: "handling", quantity: "Ground effect: lift/drag ratio 2 ft above the runway", published: "better (less induced drag)", simulated: low.liftOverDrag / free.liftOverDrag, unit: "× free-air", min: 1.15, max: 1.8, digits: 2, method: "ratio of aerodynamic lift to drag passing 63 KCAS in that manoeuvre" }));
    check(record({ group: "handling", quantity: "Ground effect one wingspan up (36 ft)", published: "almost none", simulated: (span.floatFt / free.floatFt) * 100, unit: "% of free-air", min: 97, max: 106, method: "same manoeuvre with the wheels 36 ft above the surface" }));
  });

  it("handles a 15 kt direct crosswind with correct technique, and weathervanes without it", async () => {
    const hdg = 298; // runway 28R at KSFO, true
    const tR = await takeoff({ windFromDeg: hdg + 90, windKt: 15, crosswindAileron: true });
    const tL = await takeoff({ windFromDeg: hdg - 90, windKt: 15, crosswindAileron: true });
    expect(tR.crashed || tL.crashed).toBe(false);
    check(record({ group: "handling", quantity: "Crosswind take-off (15 kt): furthest from the centreline on the runway", published: "stays on the centreline", simulated: Math.max(tR.maxCentrelineErrFt, tL.maxCentrelineErrFt), unit: "ft", min: 0, max: 20, method: "worse of wind from the left and from the right; aileron into wind, rudder to keep straight" }));
    const tNo = await takeoff({ windFromDeg: hdg + 90, windKt: 15, useRudder: false });
    check(record({ group: "handling", quantity: "Crosswind take-off with feet on the floor: heading swing on the runway", published: "weathervanes into the wind", simulated: tNo.maxHeadingErrDeg, unit: "°", min: 15, max: 180, method: "same wind, rudder not used" }));
    const lR = await landing({ windFromDeg: hdg + 90, windKt: 15 });
    const lL = await landing({ windFromDeg: hdg - 90, windKt: 15 });
    expect(lR.crashed || lL.crashed, `${lR.crashReason} ${lL.crashReason}`).toBe(false);
    check(record({ group: "handling", quantity: "Crosswind landing (15 kt): sideways drift angle at touchdown", published: "small", simulated: Math.max(Math.abs(lR.touchdownDriftDeg), Math.abs(lL.touchdownDriftDeg)), unit: "°", min: 0, max: 6, method: "crab on the approach, wing-low for the last 150 ft; worse of left and right wind" }));
    check(record({ group: "handling", quantity: "Crosswind landing (15 kt): furthest from the centreline in the roll-out", published: "stays on the runway", simulated: Math.max(lR.maxCentrelineErrFt, lL.maxCentrelineErrFt), unit: "ft", min: 0, max: 75, method: "same landings, from touchdown to stop" }));
    const lNo = await landing({ windFromDeg: hdg + 90, windKt: 15, crosswindTechnique: false });
    check(record({ group: "handling", quantity: "Crosswind landing with no correction: drift angle at touchdown", published: "large (drifts off the centreline)", simulated: Math.abs(lNo.touchdownDriftDeg), unit: "°", min: 8, max: 40, method: "wings level, feet still, heading down the runway" }));
  });

  it("flaps add lift and drag, change the trim, and travel at about 3 s per 10°", async () => {
    const t = await flapTravelSec(0, 1);
    check(record({ group: "handling", quantity: "Flap travel time per 10°", published: "about 3 s", simulated: t, unit: "s", min: 2.6, max: 3.4, digits: 2, method: "time from moving the handle one notch until the flaps arrive" }));
    expect(await flapTravelSec(0, 3)).toBeGreaterThan(8);
    const pts = [];
    for (const fi of [0, 1, 2, 3]) pts.push(await trimPoint(70, { flapIndex: fi }));
    for (let i = 1; i < pts.length; i++) {
      expect(pts[i]!.alphaDeg, "each notch gives more lift at the same angle of attack").toBeLessThan(pts[i - 1]!.alphaDeg - 0.8);
      expect(pts[i]!.powerHp, "each notch adds drag").toBeGreaterThan(pts[i - 1]!.powerHp + 5);
      expect(pts[i]!.trim, "each notch needs nose-down trim").toBeLessThan(pts[i - 1]!.trim - 0.04);
    }
    check(record({ group: "handling", quantity: "Flaps 30° at 70 KIAS: extra power to hold level", published: "much more than flaps up", simulated: pts[3]!.powerHp - pts[0]!.powerHp, unit: "hp", min: 20, max: 90, method: "level flight at 70 KIAS, flaps 30° against flaps up" }));
    check(record({ group: "handling", quantity: "Flaps 30° at 70 KIAS: change of trim", published: "nose-down trim needed", simulated: (pts[3]!.trim - pts[0]!.trim) * 100, unit: "% of trim travel", min: -60, max: -5, method: "trim position for hands-off level flight, flaps 30° against flaps up (the trim wheel runs from −100 to +100)" }));
  });

  it("can be trimmed hands-off from 60 to 120 KIAS", async () => {
    const slow = await trimPoint(60);
    const fast = await trimPoint(120);
    check(record({ group: "handling", quantity: "Trim position for 60 KIAS, level", published: "inside the trim range", simulated: slow.trim * 100, unit: "% nose-up", min: 5, max: 90, method: "level flight at 2,400 lb; trim wound until no yoke force is needed" }));
    check(record({ group: "handling", quantity: "Trim position for 120 KIAS, level", published: "inside the trim range", simulated: fast.trim * 100, unit: "% nose-up", min: -90, max: -5, method: "level flight at 2,400 lb; trim wound until no yoke force is needed" }));
    expect(Math.abs(slow.residualElevator)).toBeLessThan(0.02);
    expect(Math.abs(fast.residualElevator)).toBeLessThan(0.02);
  });

  it("engine: starts, shows a magneto drop, and loses power when asked", async () => {
    const st = await engineStart();
    expect(st.started).toBe(true);
    check(record({ group: "handling", quantity: "Engine start: cranking time", published: "about 1 to 3 s", simulated: st.crankSec, unit: "s", min: 0.8, max: 3.2, digits: 2, method: "parked, mixture rich, magnetos both, starter held until the engine runs" }));
    check(record({ group: "handling", quantity: "Idle rpm after start, throttle 10 %", published: "about 600 to 1000 rpm", simulated: st.idleRpm, unit: "rpm", min: 550, max: 1050, method: "8 s after releasing the starter" }));
    const m = await magnetoCheck();
    check(record({ group: "handling", quantity: "Magneto check at 1700 rpm: drop on one magneto", published: "about 50 to 150 rpm", simulated: m.dropLeft, unit: "rpm", min: 50, max: 150, method: "1700 rpm on both magnetos, then one magneto only" }));
    expect(m.dropRight).toBeGreaterThan(50);
    expect(Math.abs(m.rpmAfter - m.rpmBoth)).toBeLessThan(15);
    const full = await staticRunUp();
    const iced = await staticRunUp({}, 1, 0.1);
    check(record({ group: "handling", quantity: "Power lost with powerLoss = 0.1 (for example carburettor ice)", published: "about 10 %", simulated: (1 - iced.powerHp / full.powerHp) * 100, unit: "%", min: 6, max: 14, method: "static full-throttle power with and without the 10 % loss requested by the systems module" }));
    expect(iced.rpm).toBeLessThan(full.rpm - 30);
  });
});
