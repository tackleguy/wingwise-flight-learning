/** Navigation math shared by the academy diagrams and exercises. */
import { norm180, norm360 } from "@/lib/geo";

export type HoldEntry = "direct" | "teardrop" | "parallel";

/**
 * Recommended holding pattern entry (AIM 5-3-8, the "70° line" method).
 * `heading` is the aircraft's heading when it reaches the fix; `inbound` is the inbound course.
 *   Right (standard) turns: direct from −70° to +110° relative to the inbound course,
 *   teardrop from +110° to +180°, parallel from +180° to +290°.
 *   Left turns are the mirror image.
 */
export function holdingEntry(heading: number, inbound: number, rightTurns: boolean): HoldEntry {
  let rel = norm180(heading - inbound); // (-180, 180]
  if (!rightTurns) rel = -rel;
  // Boundaries are treated as belonging to the simpler entry.
  if (rel >= -70 && rel <= 110) return "direct";
  if (rel > 110 && rel <= 180) return "teardrop";
  return "parallel";
}

export const HOLD_ENTRY_TEXT: Record<HoldEntry, string> = {
  direct:
    "Direct entry — cross the fix and turn in the direction of the hold to fly the outbound leg.",
  teardrop:
    "Teardrop entry — cross the fix, turn to a heading 30° or less from the outbound course toward the holding side, fly about one minute, then turn in the direction of the hold to intercept the inbound course.",
  parallel:
    "Parallel entry — cross the fix, turn to parallel the holding course outbound on the non-holding side for about one minute, then turn back (more than 180°) toward the holding side to return to the fix or intercept the inbound course.",
};

/**
 * VOR indication for an aircraft on `radial` (bearing FROM the station) with the OBS set to `obs`.
 * Returns the TO/FROM flag and the CDI needle deflection in degrees (positive = needle right,
 * i.e. the course is to the right). Full-scale is ±10°.
 */
export function vorIndication(
  radial: number,
  obs: number,
): { flag: "TO" | "FROM"; needleDeg: number; offCourseDeg: number } {
  const diff = norm180(radial - obs);
  const from = Math.abs(diff) < 90;
  const ref = from ? obs : norm360(obs + 180);
  const err = norm180(radial - ref); // + = clockwise of the reference radial
  // FROM: clockwise of course = right of course → needle left. TO: clockwise of the reciprocal = left of course → needle right.
  const needleDeg = from ? -err : err;
  return { flag: from ? "FROM" : "TO", needleDeg, offCourseDeg: err };
}

export const pad3 = (n: number) =>
  String(Math.round(norm360(n)) === 0 ? 360 : Math.round(norm360(n))).padStart(3, "0");

/** Pressure altitude (ft) from field elevation and altimeter setting (inHg). */
export function pressureAltitude(elevationFt: number, altimeterInHg: number): number {
  return elevationFt + (29.92 - altimeterInHg) * 1000;
}

/** ISA temperature (°C) at a pressure altitude (standard lapse rate 2 °C / 1,000 ft). */
export function isaTempC(pressureAltFt: number): number {
  return 15 - (2 * pressureAltFt) / 1000;
}

/** Density altitude using the common rule: DA = PA + 120 × (OAT − ISA). */
export function densityAltitude(pressureAltFt: number, oatC: number): number {
  return pressureAltFt + 120 * (oatC - isaTempC(pressureAltFt));
}

/** Seeded-free random helpers for generators. */
export const rnd = (min: number, max: number) => min + Math.random() * (max - min);
export const rndInt = (min: number, max: number) => Math.floor(rnd(min, max + 1));
export function pick<T>(arr: readonly T[]): T {
  const v = arr[Math.floor(Math.random() * arr.length)];
  if (v === undefined) throw new Error("pick() on empty array");
  return v;
}
export function shuffle<T>(arr: readonly T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = a[i] as T;
    a[i] = a[j] as T;
    a[j] = tmp;
  }
  return a;
}
