/**
 * Flight-model constants that other modules need (instruments, panel, training, systems).
 *
 * The airspeed-calibration tables are Cessna 172P "Pilot's Operating Handbook"-class values
 * (normal static source). They are educational reference numbers, not approved data — always use
 * the handbook of the real aircraft.
 *
 * The stall angles of attack are measured from SkyReady's own tuned flight model by the tests in
 * tests/physics (see docs/PHYSICS-VALIDATION.md); they are properties of the simulation.
 */

/**
 * Angle of attack (body axis, degrees) at which the simulated aircraft reaches maximum lift, flaps up.
 * This is where the stall begins: beyond it lift falls and the nose drops. A stall warning should
 * sound a few degrees (5 to 10 kt) earlier.
 */
export const ALPHA_STALL_CLEAN_DEG = 16.0;
/** Angle of attack (degrees) at maximum lift with flaps 30°. */
export const ALPHA_STALL_FLAPS30_DEG = 14.0;
/** Angle of attack (degrees) at maximum lift with flaps 10° and 20° (same source). */
export const ALPHA_STALL_FLAPS10_DEG = 15.5;
export const ALPHA_STALL_FLAPS20_DEG = 14.3;
/**
 * Beyond this angle of attack the simulated wing is "deeply" stalled: the airflow stays separated
 * (little lift, a lot of drag) until the angle of attack has been brought back below
 * `ALPHA_REATTACH_DEG`. Spins live in this region.
 */
export const ALPHA_DEEP_STALL_DEG = 26.0;
export const ALPHA_REATTACH_DEG = 12.0;

/** Angle of attack at maximum lift for any flap angle (linear between the measured detents). */
export function alphaStallDeg(flapsDeg: number): number {
  const pts: readonly (readonly [number, number])[] = [
    [0, ALPHA_STALL_CLEAN_DEG],
    [10, ALPHA_STALL_FLAPS10_DEG],
    [20, ALPHA_STALL_FLAPS20_DEG],
    [30, ALPHA_STALL_FLAPS30_DEG],
  ];
  return interp(pts, flapsDeg);
}

/** One row of an airspeed-calibration table: what the airspeed indicator shows vs. calibrated airspeed. */
export interface AirspeedCalibration {
  flapsDeg: number;
  kias: readonly number[];
  kcas: readonly number[];
}

/** KIAS → KCAS, flaps up (normal static source). */
export const AIRSPEED_CAL_FLAPS_UP: AirspeedCalibration = {
  flapsDeg: 0,
  kias: [50, 60, 70, 80, 90, 100, 110, 120, 130, 140, 150, 160],
  kcas: [56, 62, 70, 78, 87, 97, 107, 117, 127, 137, 147, 157],
};
/** KIAS → KCAS, flaps 10°. */
export const AIRSPEED_CAL_FLAPS_10: AirspeedCalibration = {
  flapsDeg: 10,
  kias: [40, 50, 60, 70, 80, 85],
  kcas: [49, 55, 62, 70, 79, 83],
};
/** KIAS → KCAS, flaps 30°. */
export const AIRSPEED_CAL_FLAPS_30: AirspeedCalibration = {
  flapsDeg: 30,
  kias: [40, 50, 60, 70, 80, 85],
  kcas: [47, 53, 61, 70, 80, 84],
};
export const AIRSPEED_CALIBRATION: readonly AirspeedCalibration[] = [AIRSPEED_CAL_FLAPS_UP, AIRSPEED_CAL_FLAPS_10, AIRSPEED_CAL_FLAPS_30];

function interp(pts: readonly (readonly [number, number])[], x: number): number {
  const first = pts[0]!;
  const last = pts[pts.length - 1]!;
  if (x <= first[0]) return first[1];
  if (x >= last[0]) return last[1];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    if (x <= b[0]) return a[1] + ((b[1] - a[1]) * (x - a[0])) / (b[0] - a[0]);
  }
  return last[1];
}

/** Piecewise-linear table lookup that keeps the slope of the end segments outside the table. */
function lookup(xs: readonly number[], ys: readonly number[], x: number): number {
  const n = xs.length;
  let i = 1;
  while (i < n - 1 && x > xs[i]!) i++;
  const x0 = xs[i - 1]!;
  const x1 = xs[i]!;
  const y0 = ys[i - 1]!;
  const y1 = ys[i]!;
  return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
}

function calFor(table: AirspeedCalibration, v: number, toKcas: boolean): number {
  const from = toKcas ? table.kias : table.kcas;
  const to = toKcas ? table.kcas : table.kias;
  // Below the table the position error is unknown: fade it out linearly so 0 maps to 0.
  const lo = from[0]!;
  if (v < lo) return (v / lo) * to[0]!;
  return lookup(from, to, v);
}

function blend(flapsDeg: number, f: (t: AirspeedCalibration) => number): number {
  const up = f(AIRSPEED_CAL_FLAPS_UP);
  if (flapsDeg <= 0) return up;
  const f10 = f(AIRSPEED_CAL_FLAPS_10);
  if (flapsDeg <= 10) return up + ((f10 - up) * flapsDeg) / 10;
  const f30 = f(AIRSPEED_CAL_FLAPS_30);
  if (flapsDeg >= 30) return f30;
  return f10 + ((f30 - f10) * (flapsDeg - 10)) / 20;
}

/**
 * Calibrated airspeed (what the flight model computes) for an indicated airspeed, kt.
 * Between flap detents the tables are blended linearly; flaps 20° is halfway between 10° and 30°.
 */
export function kiasToKcas(kias: number, flapsDeg = 0): number {
  return blend(flapsDeg, (t) => calFor(t, kias, true));
}

/** Indicated airspeed (what the airspeed indicator shows) for a calibrated airspeed, kt. */
export function kcasToKias(kcas: number, flapsDeg = 0): number {
  return blend(flapsDeg, (t) => calFor(t, kcas, false));
}

/** Wing span, ft (ground effect is felt within about one span of the ground). */
export const WING_SPAN_FT = 35.8;
/** Wing area, sq ft. */
export const WING_AREA_SQFT = 174;
/** Flap motor speed, degrees per second (10° takes about 3 s). */
export const FLAP_RATE_DEG_PER_SEC = 10 / 3;
/** Rated engine power, brake horsepower at 2700 rpm, sea level. */
export const RATED_POWER_HP = 160;
