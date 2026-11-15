/** Small math helpers for the procedural aircraft builders (no three.js dependency). */

export type V3 = [number, number, number];

export const DEG = Math.PI / 180;

export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smoothstep = (a: number, b: number, v: number) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

export const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const len = (a: V3) => Math.hypot(a[0], a[1], a[2]);
export const norm = (a: V3): V3 => {
  const l = len(a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
export const mix3 = (a: V3, b: V3, t: number): V3 => [
  lerp(a[0], b[0], t),
  lerp(a[1], b[1], t),
  lerp(a[2], b[2], t),
];

/** Signed power: sign(v)·|v|^p. */
export const spow = (v: number, p: number) => Math.sign(v) * Math.pow(Math.abs(v), p);

/**
 * Monotone piecewise-cubic (Fritsch–Carlson) interpolant. Never overshoots between stations,
 * which keeps lofted fuselages free of bumps.
 */
export function pchip(xs: readonly number[], ys: readonly number[]): (x: number) => number {
  const n = xs.length;
  if (n === 0) return () => 0;
  if (n === 1) {
    const y0 = ys[0] ?? 0;
    return () => y0;
  }
  const h: number[] = [];
  const d: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    const hi = (xs[i + 1] ?? 0) - (xs[i] ?? 0);
    h.push(hi);
    d.push(hi !== 0 ? ((ys[i + 1] ?? 0) - (ys[i] ?? 0)) / hi : 0);
  }
  const m: number[] = new Array<number>(n).fill(0);
  m[0] = d[0] ?? 0;
  m[n - 1] = d[n - 2] ?? 0;
  for (let i = 1; i < n - 1; i++) {
    const d0 = d[i - 1] ?? 0;
    const d1 = d[i] ?? 0;
    if (d0 * d1 <= 0) {
      m[i] = 0;
    } else {
      const h0 = h[i - 1] ?? 1;
      const h1 = h[i] ?? 1;
      const w1 = 2 * h1 + h0;
      const w2 = h1 + 2 * h0;
      m[i] = (w1 + w2) / (w1 / d0 + w2 / d1);
    }
  }
  return (x: number) => {
    if (x <= (xs[0] ?? 0)) return ys[0] ?? 0;
    if (x >= (xs[n - 1] ?? 0)) return ys[n - 1] ?? 0;
    let i = 0;
    while (i < n - 2 && x > (xs[i + 1] ?? 0)) i++;
    const x0 = xs[i] ?? 0;
    const hh = h[i] ?? 1;
    const t = (x - x0) / hh;
    const t2 = t * t;
    const t3 = t2 * t;
    const y0 = ys[i] ?? 0;
    const y1 = ys[i + 1] ?? 0;
    return (
      (2 * t3 - 3 * t2 + 1) * y0 +
      (t3 - 2 * t2 + t) * hh * (m[i] ?? 0) +
      (-2 * t3 + 3 * t2) * y1 +
      (t3 - t2) * hh * (m[i + 1] ?? 0)
    );
  };
}

/** Piecewise-linear interpolation over sorted xs. */
export function plin(xs: readonly number[], ys: readonly number[], x: number): number {
  const n = xs.length;
  if (n === 0) return 0;
  if (x <= (xs[0] ?? 0)) return ys[0] ?? 0;
  for (let i = 0; i < n - 1; i++) {
    const x0 = xs[i] ?? 0;
    const x1 = xs[i + 1] ?? 0;
    if (x <= x1) {
      const t = x1 > x0 ? (x - x0) / (x1 - x0) : 0;
      return lerp(ys[i] ?? 0, ys[i + 1] ?? 0, t);
    }
  }
  return ys[n - 1] ?? 0;
}

/**
 * Four-digit-style airfoil (textbook NACA thickness polynomial, closed trailing edge).
 * Returns [camber line y, half thickness] at chord fraction x, both as fractions of chord.
 */
export function airfoil(x: number, t: number, camber = 0, camberPos = 0.4): [number, number] {
  const xc = clamp(x, 0, 1);
  const yt =
    5 *
    t *
    (0.2969 * Math.sqrt(xc) -
      0.126 * xc -
      0.3516 * xc * xc +
      0.2843 * xc * xc * xc -
      0.1036 * xc * xc * xc * xc);
  let yc = 0;
  if (camber > 0) {
    const p = camberPos;
    yc =
      xc < p
        ? (camber / (p * p)) * (2 * p * xc - xc * xc)
        : (camber / ((1 - p) * (1 - p))) * (1 - 2 * p + 2 * p * xc - xc * xc);
  }
  return [yc, Math.max(0, yt)];
}
