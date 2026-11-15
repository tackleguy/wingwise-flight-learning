/**
 * Small seeded random-number helpers. Every "random" imperfection of the instruments (gyro drift,
 * fuel-gauge error, where a tumbled gyro ends up) comes from here, so the same flight always gives
 * the same indications.
 */

/** mulberry32: a tiny, well-known public-domain 32-bit generator. Returns numbers in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Mix several numbers into one 32-bit seed (order matters). */
export function hashSeed(...values: number[]): number {
  let h = 0x811c9dc5;
  for (const v of values) {
    const n = Number.isFinite(v) ? Math.round(v) : 0;
    h ^= n & 0xffff;
    h = Math.imul(h, 0x01000193);
    h ^= (n >>> 16) & 0xffff;
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Uniform number in [lo, hi). */
export const randRange = (rng: () => number, lo: number, hi: number) => lo + (hi - lo) * rng();

/** Random sign: −1 or +1. */
export const randSign = (rng: () => number) => (rng() < 0.5 ? -1 : 1);
