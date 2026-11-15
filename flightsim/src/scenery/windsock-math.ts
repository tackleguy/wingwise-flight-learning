/** Windsock numbers shared by the drawing code and the tests (no graphics here). */

/** Wind speed at which the sock stands straight out, knots. */
export const SOCK_FULL_KT = 15;

/** How far the windsock is blown out: 0 (calm, hanging limp) … 1 (15 kt or more, fully extended). */
export const sockExtension = (windKt: number) => Math.max(0, Math.min(1, windKt / SOCK_FULL_KT));

/** Unit vector (east, north) the sock points to for a wind FROM `dirTrue` degrees: it streams downwind. */
export function sockDirection(windFromTrue: number): { east: number; north: number } {
  const r = (windFromTrue * Math.PI) / 180;
  return { east: -Math.sin(r), north: -Math.cos(r) };
}
