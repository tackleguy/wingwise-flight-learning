/**
 * Pure dial geometry: how a value maps to a needle angle on each instrument face.
 * Angles are degrees CLOCKWISE FROM 12 O'CLOCK (0 = up, 90 = right), the way a pilot reads a dial.
 * Kept free of React/DOM so the scales can be unit-tested (tests/panel).
 */
import { D2R, clamp, norm360 } from "@/core/math";

export type Table = readonly (readonly [number, number])[];

/** Piecewise-linear lookup, clamped at both ends. */
export function interpTable(table: Table, x: number): number {
  const first = table[0]!;
  const last = table[table.length - 1]!;
  if (x <= first[0]) return first[1];
  if (x >= last[0]) return last[1];
  for (let i = 1; i < table.length; i++) {
    const b = table[i]!;
    if (x <= b[0]) {
      const a = table[i - 1]!;
      return a[1] + ((b[1] - a[1]) * (x - a[0])) / (b[0] - a[0]);
    }
  }
  return last[1];
}

/** Point on a dial: radius r, angle a (clockwise from 12 o'clock), centre (cx, cy). */
export function polar(r: number, a: number, cx = 100, cy = 100): [number, number] {
  const t = a * D2R;
  return [cx + r * Math.sin(t), cy - r * Math.cos(t)];
}

const f2 = (n: number) => (Math.round(n * 100) / 100).toString();

/** SVG path of a circular arc from angle a0 clockwise to a1 (a1 > a0, both clockwise from 12 o'clock). */
export function arcPath(r: number, a0: number, a1: number, cx = 100, cy = 100): string {
  const [x0, y0] = polar(r, a0, cx, cy);
  const [x1, y1] = polar(r, a1, cx, cy);
  const large = a1 - a0 > 180 ? 1 : 0;
  return `M${f2(x0)} ${f2(y0)}A${r} ${r} 0 ${large} 1 ${f2(x1)} ${f2(y1)}`;
}

// ---------------------------------------------------------------- airspeed indicator

/**
 * Airspeed scale (KIAS → angle). Like the real instrument it is not linear: the low speeds are
 * spread out (where precision matters for approach and stall) and the high speeds are compressed.
 * Below 40 kt a real airspeed indicator barely moves, so the needle only creeps off its rest.
 */
export const ASI_TABLE: Table = [
  [0, 0],
  [20, 8],
  [40, 32],
  [50, 55],
  [60, 80],
  [70, 106],
  [80, 132],
  [90, 157],
  [100, 181],
  [110, 204],
  [120, 226],
  [130, 246],
  [140, 264],
  [150, 281],
  [160, 297],
  [170, 311],
  [180, 324],
  [190, 337],
  [200, 349],
  [210, 356],
];
export const asiAngle = (kias: number) => interpTable(ASI_TABLE, Number.isFinite(kias) ? kias : 0);

// ---------------------------------------------------------------- altimeter

/** The three altimeter pointers: one turn per 1,000 ft, per 10,000 ft and per 100,000 ft. */
export function altimeterAngles(altFt: number): { hundreds: number; thousands: number; tenThousands: number } {
  const a = Number.isFinite(altFt) ? altFt : 0;
  return { hundreds: norm360(a * 0.36), thousands: norm360(a * 0.036), tenThousands: norm360(a * 0.0036) };
}

// ---------------------------------------------------------------- vertical speed indicator

/** Needle deflection from the 9 o'clock zero for |fpm| (non-linear, as on the real dial). */
export const VSI_TABLE: Table = [
  [0, 0],
  [500, 52],
  [1000, 92],
  [1500, 130],
  [2000, 165],
  [2150, 172],
];
/** Zero is at 9 o'clock (270°); a climb moves the needle clockwise (up), a descent anticlockwise (down). */
export function vsiAngle(fpm: number): number {
  const v = Number.isFinite(fpm) ? fpm : 0;
  const d = interpTable(VSI_TABLE, Math.abs(v));
  return norm360(270 + (v >= 0 ? d : -d));
}

// ---------------------------------------------------------------- tachometer

export const TACH_START_DEG = 225;
export const TACH_SWEEP_DEG = 270;
export const TACH_MAX_RPM = 3500;
/** 0 rpm at 7:30, 3,500 rpm at 4:30 (may exceed 360 — fine for a rotate() transform). */
export const tachAngle = (rpm: number) => TACH_START_DEG + (clamp(Number.isFinite(rpm) ? rpm : 0, 0, TACH_MAX_RPM) / TACH_MAX_RPM) * TACH_SWEEP_DEG;

// ---------------------------------------------------------------- turn coordinator

/** Rotation of the miniature aircraft at a standard-rate turn (3° per second). */
export const TC_STANDARD_RATE_DEG = 20;
/** Miniature aircraft rotation: + = right wing down (clockwise). `rate` is in standard-rate units. */
export const turnCoordinatorAngle = (rate: number) => clamp(Number.isFinite(rate) ? rate : 0, -2.1, 2.1) * TC_STANDARD_RATE_DEG;
/** Position of the ball along its curved tube, degrees around the tube's centre of curvature (+ = right). */
export const BALL_MAX_DEG = 11.5;
export const ballAngle = (ball: number) => clamp(Number.isFinite(ball) ? ball : 0, -1, 1) * BALL_MAX_DEG;

// ---------------------------------------------------------------- attitude indicator

/** Dial units the horizon moves per degree of pitch (dial is 200 units across). */
export const ATT_UNITS_PER_DEG = 2.3;
/**
 * Transform of the horizon card. In a RIGHT bank (roll +) the pilot sees the horizon rotate
 * ANTICLOCKWISE (it rises on the right-hand side, the right wing points at the ground), so the
 * card rotates by −roll. Nose up (pitch +) moves the horizon DOWN, perpendicular to itself.
 */
export function attitudeTransform(pitchDeg: number, rollDeg: number): { rotate: number; shift: number } {
  const p = clamp(Number.isFinite(pitchDeg) ? pitchDeg : 0, -90, 90);
  const r = Number.isFinite(rollDeg) ? rollDeg : 0;
  return { rotate: -r, shift: p * ATT_UNITS_PER_DEG };
}

// ---------------------------------------------------------------- heading indicator / VOR card

/** Rotation of a compass card so that `headingDeg` sits under the fixed index at the top. */
export const cardRotation = (headingDeg: number) => -norm360(Number.isFinite(headingDeg) ? headingDeg : 0);

/** Sideways offset (dial units) of the CDI needle at the dot row. + dots = needle to the RIGHT. */
export const CDI_UNITS_PER_DOT = 10.5;
export const cdiOffset = (dots: number) => clamp(Number.isFinite(dots) ? dots : 0, -5.5, 5.5) * CDI_UNITS_PER_DOT;

// ---------------------------------------------------------------- magnetic compass

/** Strip units per degree on the magnetic compass card. */
export const COMPASS_UNITS_PER_DEG = 1.5;
/**
 * Where a heading mark is drawn on the compass window, relative to the lubber line.
 * A real compass is read from BEHIND the card, so larger headings appear to the LEFT:
 * flying north you see 33 … N … 3 written right-to-left as "3  N  33" (30° on the left, 330° on the right).
 */
export function compassMarkX(markDeg: number, compassDeg: number): number {
  let d = norm360(markDeg - compassDeg);
  if (d > 180) d -= 360;
  return -d * COMPASS_UNITS_PER_DEG;
}

// ---------------------------------------------------------------- small gauges

/** Generic linear gauge: value → angle between a0 (at v0) and a1 (at v1), clamped with a little overshoot. */
export function linearAngle(v: number, v0: number, v1: number, a0: number, a1: number, overshoot = 0.04): number {
  const t = clamp(((Number.isFinite(v) ? v : v0) - v0) / (v1 - v0), -overshoot, 1 + overshoot);
  return a0 + (a1 - a0) * t;
}

/** Gallons shown as "F" on each fuel gauge (the tank's usable fuel in this trainer: 20 US gal a side). */
export const FUEL_FULL_GAL = 20;
