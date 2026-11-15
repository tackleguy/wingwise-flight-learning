/**
 * ONE definition of where the clouds are, shared by the flight side ("am I inside a cloud?")
 * and the graphics (what is drawn), so the two always agree.
 *
 * Each weather cloud layer (FEW / SCT / BKN / OVC, base, top) is turned into a field using a
 * fixed 256×256 table of random numbers ("noise"). The same table can be uploaded to the GPU as
 * a texture, so a shader can reproduce exactly the same clouds.
 *
 * Field coordinates are metres: x = east, y = north (see `cloudFieldXY`).
 */
import type { CloudCover, CloudLayer, Environment } from "./types";

export const CLOUD_NOISE_SIZE = 256;
/** Size of one noise cell for the two octaves, metres. */
export const CLOUD_SCALE_1_M = 1800;
export const CLOUD_SCALE_2_M = 620;
export const CLOUD_OCTAVE_1 = 0.65;
export const CLOUD_OCTAVE_2 = 0.35;

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The noise table, values 0..255, row-major (index = y * 256 + x). Upload as an R8 texture with REPEAT wrapping. */
export const CLOUD_NOISE: Uint8Array = (() => {
  const rnd = mulberry32(172);
  const t = new Uint8Array(CLOUD_NOISE_SIZE * CLOUD_NOISE_SIZE);
  for (let i = 0; i < t.length; i++) t[i] = Math.floor(rnd() * 256);
  return t;
})();

const N = CLOUD_NOISE_SIZE;
const at = (ix: number, iy: number) => CLOUD_NOISE[(((iy % N) + N) % N) * N + (((ix % N) + N) % N)]! / 255;
const fade = (t: number) => t * t * (3 - 2 * t);

/** Smooth value noise 0..1 at lattice coordinates (one unit = one table cell). */
export function valueNoise(u: number, v: number): number {
  const ix = Math.floor(u);
  const iy = Math.floor(v);
  const fx = fade(u - ix);
  const fy = fade(v - iy);
  const a = at(ix, iy);
  const b = at(ix + 1, iy);
  const c = at(ix, iy + 1);
  const d = at(ix + 1, iy + 1);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}

/** The cloud "shape" value 0..1 at a field position, for a layer (each layer uses a shifted copy of the table). */
export function cloudShape(xM: number, yM: number, layerIndex: number): number {
  const ox = layerIndex * 37.3;
  const oy = layerIndex * 91.7;
  return CLOUD_OCTAVE_1 * valueNoise(xM / CLOUD_SCALE_1_M + ox, yM / CLOUD_SCALE_1_M + oy) + CLOUD_OCTAVE_2 * valueNoise(xM / CLOUD_SCALE_2_M + oy, yM / CLOUD_SCALE_2_M + ox);
}

/** Fraction of the sky each cover class fills (oktas: FEW 1–2, SCT 3–4, BKN 5–7, OVC 8). */
export const COVER_FRACTION: Record<CloudCover, number> = { FEW: 0.18, SCT: 0.42, BKN: 0.75, OVC: 1 };

/** Shape values above the threshold are cloud. Calibrated once so each class fills its fraction of the sky. */
export const COVER_THRESHOLD: Record<CloudCover, number> = (() => {
  const samples: number[] = [];
  const rnd = mulberry32(9);
  for (let i = 0; i < 20000; i++) samples.push(cloudShape(rnd() * 4e5, rnd() * 4e5, 0));
  samples.sort((a, b) => a - b);
  const q = (fraction: number) => samples[Math.min(samples.length - 1, Math.max(0, Math.floor((1 - fraction) * samples.length)))]!;
  return { FEW: q(COVER_FRACTION.FEW), SCT: q(COVER_FRACTION.SCT), BKN: q(COVER_FRACTION.BKN), OVC: -1 };
})();

/** Width of the soft cloud edge in shape units. */
export const CLOUD_EDGE = 0.07;

const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/** Field coordinates (metres east, metres north) of a geographic position. */
export function cloudFieldXY(lat: number, lon: number): { x: number; y: number } {
  return { x: lon * 111320 * Math.cos((lat * Math.PI) / 180), y: lat * 110540 };
}

/** Cloud density 0..1 of ONE layer at a field position and altitude. */
export function layerDensity(layer: CloudLayer, layerIndex: number, xM: number, yM: number, altFtMsl: number): number {
  const thickness = Math.max(200, layer.topFtMsl - layer.baseFtMsl);
  if (altFtMsl < layer.baseFtMsl - 100 || altFtMsl > layer.baseFtMsl + thickness + 100) return 0;
  let horizontal = 1;
  let localTop = layer.baseFtMsl + thickness;
  if (layer.cover !== "OVC") {
    const shape = cloudShape(xM, yM, layerIndex);
    const thr = COVER_THRESHOLD[layer.cover];
    horizontal = smooth(thr, thr + CLOUD_EDGE, shape);
    if (horizontal <= 0) return 0;
    // puffy tops: taller toward the middle of each cloud
    localTop = layer.baseFtMsl + thickness * (0.35 + 0.65 * smooth(thr, thr + 0.2, shape));
  }
  const vertical = smooth(layer.baseFtMsl - 60, layer.baseFtMsl + 90, altFtMsl) * (1 - smooth(localTop - 120, localTop + 60, altFtMsl));
  return horizontal * vertical;
}

/** Cloud density 0..1 at a position for the current weather (0 = clear air, 1 = solid cloud). */
export function cloudDensityAt(env: Environment, lat: number, lon: number, altFtMsl: number): number {
  if (!env.clouds.length) return 0;
  const { x, y } = cloudFieldXY(lat, lon);
  let d = 0;
  for (let i = 0; i < env.clouds.length; i++) d = Math.max(d, layerDensity(env.clouds[i]!, i, x, y, altFtMsl));
  return d;
}
