/**
 * Procedural textures (nothing is downloaded):
 *   - one small repeating noise texture that gives asphalt, concrete, grass and gravel their grain;
 *   - one texture per runway designator ("28R", "09", …) holding the painted number and letter as a
 *     signed distance field, so the edges stay sharp when the aircraft sits right on top of them.
 *
 * The numerals and letters are an original stroke design in the blocky style of runway paint
 * (60 ft tall, 20 ft wide, 5 ft strokes); they are not copied from any font.
 */
import { parseDesignator } from "./layout";
import { createTexture, type GlContext, type GlTexture } from "./gl";

// ---------------------------------------------------------------- noise

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

/** Repeating value noise: `period` random cells across the texture, smoothly interpolated. */
function valueNoise(size: number, period: number, rand: () => number): Float32Array {
  const lattice = new Float32Array(period * period);
  for (let i = 0; i < lattice.length; i++) lattice[i] = rand();
  const out = new Float32Array(size * size);
  const scale = period / size;
  for (let y = 0; y < size; y++) {
    const fy = y * scale;
    const y0 = Math.floor(fy);
    const ty = fy - y0;
    const sy = ty * ty * (3 - 2 * ty);
    const ya = (y0 % period) * period;
    const yb = ((y0 + 1) % period) * period;
    for (let x = 0; x < size; x++) {
      const fx = x * scale;
      const x0 = Math.floor(fx);
      const tx = fx - x0;
      const sx = tx * tx * (3 - 2 * tx);
      const xa = x0 % period;
      const xb = (x0 + 1) % period;
      const top = lattice[ya + xa]! + (lattice[ya + xb]! - lattice[ya + xa]!) * sx;
      const bot = lattice[yb + xa]! + (lattice[yb + xb]! - lattice[yb + xa]!) * sx;
      out[y * size + x] = top + (bot - top) * sy;
    }
  }
  return out;
}

function fbm(size: number, periods: number[], seed: number): Float32Array {
  const rand = mulberry32(seed);
  const out = new Float32Array(size * size);
  let amp = 1;
  let total = 0;
  for (const p of periods) {
    const n = valueNoise(size, p, rand);
    for (let i = 0; i < out.length; i++) out[i]! += n[i]! * amp;
    total += amp;
    amp *= 0.55;
  }
  // Stretch to use the full 0…1 range (mean 0.5).
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < out.length; i++) {
    out[i]! /= total;
    lo = Math.min(lo, out[i]!);
    hi = Math.max(hi, out[i]!);
  }
  for (let i = 0; i < out.length; i++) out[i] = (out[i]! - lo) / (hi - lo);
  return out;
}

export const NOISE_SIZE = 256;

/** RGBA bytes: R fine grain, G medium blotches, B large soft patches, A a second medium pattern (streaks). */
export function noisePixels(): Uint8Array {
  const n = NOISE_SIZE;
  const fine = fbm(n, [128, 64, 32], 11);
  const medium = fbm(n, [16, 32, 64], 23);
  const large = fbm(n, [4, 8, 16], 37);
  const streak = fbm(n, [8, 16, 32, 64], 51);
  const px = new Uint8Array(n * n * 4);
  for (let i = 0; i < n * n; i++) {
    px[i * 4] = Math.round(fine[i]! * 255);
    px[i * 4 + 1] = Math.round(medium[i]! * 255);
    px[i * 4 + 2] = Math.round(large[i]! * 255);
    px[i * 4 + 3] = Math.round(streak[i]! * 255);
  }
  return px;
}

// ---------------------------------------------------------------- runway numerals

type Stroke = number[][];
interface Glyph {
  /** Width of the character box, ft. */
  width: number;
  /** Polylines in a box `width` × 60 ft, y up. A stroke whose last point equals its first is closed. */
  strokes: Stroke[];
}

const SIX: Stroke = [
  [17.5, 48],
  [17.5, 52.5],
  [12.5, 57.5],
  [7.5, 57.5],
  [2.5, 52.5],
  [2.5, 7.5],
  [7.5, 2.5],
  [12.5, 2.5],
  [17.5, 7.5],
  [17.5, 27.5],
  [12.5, 32.5],
  [2.5, 32.5],
];

const GLYPHS: Record<string, Glyph> = {
  "0": { width: 20, strokes: [[[7.5, 2.5], [12.5, 2.5], [17.5, 7.5], [17.5, 52.5], [12.5, 57.5], [7.5, 57.5], [2.5, 52.5], [2.5, 7.5], [7.5, 2.5]]] },
  "1": { width: 14, strokes: [[[2, 45], [8.5, 57], [8.5, 0]]] },
  "2": { width: 20, strokes: [[[2.5, 47], [2.5, 52.5], [7.5, 57.5], [12.5, 57.5], [17.5, 52.5], [17.5, 38], [2.5, 11], [2.5, 2.5], [20, 2.5]]] },
  "3": {
    width: 20,
    strokes: [
      [[2.5, 48], [2.5, 52.5], [7.5, 57.5], [12.5, 57.5], [17.5, 52.5], [17.5, 36.5], [13, 32], [7, 32]],
      [[13, 32], [17.5, 27.5], [17.5, 7.5], [12.5, 2.5], [7.5, 2.5], [2.5, 7.5], [2.5, 12]],
    ],
  },
  "4": {
    width: 20,
    strokes: [
      [[14.5, 0], [14.5, 60]],
      [[13.5, 58], [2.5, 22], [2.5, 17.5], [20, 17.5]],
    ],
  },
  "5": { width: 20, strokes: [[[20, 57.5], [2.5, 57.5], [2.5, 34], [12.5, 34], [17.5, 29], [17.5, 7.5], [12.5, 2.5], [7.5, 2.5], [2.5, 7.5], [2.5, 12]]] },
  "6": { width: 20, strokes: [SIX] },
  "7": { width: 20, strokes: [[[0, 57.5], [17.5, 57.5], [17.5, 51], [7, 0]]] },
  "8": {
    width: 20,
    strokes: [
      [[7.5, 57.5], [12.5, 57.5], [17.5, 52.5], [17.5, 36], [13.5, 32], [6.5, 32], [2.5, 36], [2.5, 52.5], [7.5, 57.5]],
      [[6.5, 32], [13.5, 32], [17.5, 28], [17.5, 7.5], [12.5, 2.5], [7.5, 2.5], [2.5, 7.5], [2.5, 28], [6.5, 32]],
    ],
  },
  "9": { width: 20, strokes: [SIX.map(([x, y]) => [20 - x!, 60 - y!])] },
  L: { width: 20, strokes: [[[2.5, 60], [2.5, 2.5], [18.5, 2.5]]] },
  C: { width: 20, strokes: [[[17.5, 45], [17.5, 52.5], [12.5, 57.5], [7.5, 57.5], [2.5, 52.5], [2.5, 7.5], [7.5, 2.5], [12.5, 2.5], [17.5, 7.5], [17.5, 15]]] },
  R: {
    width: 20,
    strokes: [
      [[2.5, 0], [2.5, 57.5], [12.5, 57.5], [17.5, 52.5], [17.5, 37], [12.5, 32], [2.5, 32]],
      [[9.5, 32], [17.5, 0]],
    ],
  },
  A: { width: 20, strokes: [[[2.5, 0], [2.5, 44], [10, 57.5], [17.5, 44], [17.5, 0]], [[2.5, 24], [17.5, 24]]] },
  B: {
    width: 20,
    strokes: [
      [[2.5, 2.5], [12.5, 2.5], [17.5, 7.5], [17.5, 27], [12.5, 32], [2.5, 32]],
      [[12.5, 32], [17.5, 37], [17.5, 52.5], [12.5, 57.5], [2.5, 57.5], [2.5, 2.5]],
    ],
  },
  D: { width: 20, strokes: [[[2.5, 2.5], [12.5, 2.5], [17.5, 7.5], [17.5, 52.5], [12.5, 57.5], [2.5, 57.5], [2.5, 2.5]]] },
  E: { width: 20, strokes: [[[18.5, 57.5], [2.5, 57.5], [2.5, 2.5], [18.5, 2.5]], [[2.5, 31], [14, 31]]] },
  G: { width: 20, strokes: [[[17.5, 45], [17.5, 52.5], [12.5, 57.5], [7.5, 57.5], [2.5, 52.5], [2.5, 7.5], [7.5, 2.5], [12.5, 2.5], [17.5, 7.5], [17.5, 27], [10, 27]]] },
  H: { width: 20, strokes: [[[2.5, 0], [2.5, 60]], [[17.5, 0], [17.5, 60]], [[2.5, 30], [17.5, 30]]] },
  N: { width: 20, strokes: [[[2.5, 0], [2.5, 57.5], [17.5, 2.5], [17.5, 60]]] },
  S: { width: 20, strokes: [[[17.5, 48], [17.5, 52.5], [12.5, 57.5], [7.5, 57.5], [2.5, 52.5], [2.5, 37], [7.5, 32], [12.5, 32], [17.5, 27], [17.5, 7.5], [12.5, 2.5], [7.5, 2.5], [2.5, 7.5], [2.5, 12]]] },
  T: { width: 20, strokes: [[[0, 57.5], [20, 57.5]], [[10, 57.5], [10, 0]]] },
  U: { width: 20, strokes: [[[2.5, 60], [2.5, 7.5], [7.5, 2.5], [12.5, 2.5], [17.5, 7.5], [17.5, 60]]] },
  W: { width: 22, strokes: [[[2, 60], [6, 2.5], [11, 40], [16, 2.5], [20, 60]]] },
  X: { width: 20, strokes: [[[2.5, 60], [17.5, 0]], [[17.5, 60], [2.5, 0]]] },
};

/** Texture size and the ground area it covers at full size (feet): 80 ft across, 160 ft along the runway. */
export const DESIG_TEX_W = 128;
export const DESIG_TEX_H = 256;
const ZONE_W_FT = 80;
const ZONE_H_FT = 160;
const GLYPH_H_FT = 60;
const GLYPH_GAP_FT = 20;
const STROKE_FT = 5;
const DIGIT_SPACING_FT = 14;
/** Distance range stored in the texture, in texels either side of the edge. */
export const SDF_RANGE_TEXELS = 6;

/** Where the characters of a designator go inside the 80 × 160 ft zone (y = 0 is the edge nearest the threshold). */
export function designatorPlacement(id: string): { char: string; x: number; y: number; scaleX: number }[] {
  const { number, letter } = parseDesignator(id);
  const out: { char: string; x: number; y: number; scaleX: number }[] = [];
  const row = (text: string, y: number) => {
    const chars = [...text].filter((c) => GLYPHS[c]);
    if (!chars.length) return;
    const total = chars.reduce((w, c) => w + GLYPHS[c]!.width, 0) + DIGIT_SPACING_FT * (chars.length - 1);
    const scaleX = Math.min(1, (ZONE_W_FT - 8) / total);
    let x = (ZONE_W_FT - total * scaleX) / 2;
    for (const c of chars) {
      out.push({ char: c, x, y, scaleX });
      x += (GLYPHS[c]!.width + DIGIT_SPACING_FT) * scaleX;
    }
  };
  if (letter) {
    row(letter, 0);
    row(number, GLYPH_H_FT + GLYPH_GAP_FT);
  } else row(number, 0);
  return out;
}

/** One-dimensional squared distance transform (Felzenszwalb & Huttenlocher 2012), in place along a line of the grid. */
function edt1d(grid: Float32Array, offset: number, step: number, n: number, f: Float32Array, v: Uint16Array, z: Float32Array): void {
  for (let q = 0; q < n; q++) f[q] = grid[offset + q * step]!;
  let k = 0;
  v[0] = 0;
  z[0] = -1e20;
  z[1] = 1e20;
  for (let q = 1; q < n; q++) {
    let s: number;
    do {
      const r = v[k]!;
      s = (f[q]! - f[r]! + q * q - r * r) / (2 * (q - r));
    } while (s <= z[k]! && --k > -1);
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = 1e20;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1]! < q) k++;
    const r = v[k]!;
    grid[offset + q * step] = f[r]! + (q - r) * (q - r);
  }
}

function edt2d(grid: Float32Array, w: number, h: number): void {
  const n = Math.max(w, h);
  const f = new Float32Array(n);
  const v = new Uint16Array(n);
  const z = new Float32Array(n + 1);
  for (let x = 0; x < w; x++) edt1d(grid, x, w, h, f, v, z);
  for (let y = 0; y < h; y++) edt1d(grid, y * w, 1, w, f, v, z);
}

/**
 * Turn a coverage image (0…1 per texel, row 0 = v 0) into RGBA bytes: R = coverage,
 * G = signed distance to the paint edge (128 = on the edge, brighter = inside).
 */
export function coverageToSdf(coverage: Float32Array, w: number, h: number): Uint8Array {
  const INF = 1e20;
  const outer = new Float32Array(w * h);
  const inner = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const a = coverage[i]!;
    // Partly covered texels sit close to the edge: start them a fraction of a texel away from it.
    outer[i] = a >= 1 ? 0 : a <= 0 ? INF : Math.max(0, 0.5 - a) ** 2;
    inner[i] = a >= 1 ? INF : a <= 0 ? 0 : Math.max(0, a - 0.5) ** 2;
  }
  edt2d(outer, w, h);
  edt2d(inner, w, h);
  const px = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const d = Math.sqrt(inner[i]!) - Math.sqrt(outer[i]!); // + inside the paint
    px[i * 4] = Math.round(coverage[i]! * 255);
    px[i * 4 + 1] = Math.max(0, Math.min(255, Math.round(128 + (d / SDF_RANGE_TEXELS) * 127)));
    px[i * 4 + 2] = 0;
    px[i * 4 + 3] = 255;
  }
  return px;
}

/** Paint a designator with Canvas 2D and return its coverage (row 0 = the edge nearest the threshold). */
function drawDesignator(id: string): Float32Array {
  const ss = 2; // supersampling
  const cw = DESIG_TEX_W * ss;
  const ch = DESIG_TEX_H * ss;
  const canvas = document.createElement("canvas");
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, cw, ch);
  ctx.strokeStyle = "#fff";
  ctx.lineJoin = "miter";
  ctx.miterLimit = 2;
  ctx.lineCap = "butt";
  const k = cw / ZONE_W_FT; // pixels per foot
  ctx.lineWidth = STROKE_FT * k;
  for (const p of designatorPlacement(id)) {
    const g = GLYPHS[p.char]!;
    for (const stroke of g.strokes) {
      ctx.beginPath();
      const first = stroke[0]!;
      const last = stroke[stroke.length - 1]!;
      const closed = stroke.length > 2 && first[0] === last[0] && first[1] === last[1];
      const pts = closed ? stroke.slice(0, -1) : stroke;
      pts.forEach(([x, y], i) => {
        // canvas y runs downward: the bottom row of the canvas is nearest the threshold
        const cx = (p.x + x! * p.scaleX) * k;
        const cy = ch - (p.y + y!) * k;
        if (i === 0) ctx.moveTo(cx, cy);
        else ctx.lineTo(cx, cy);
      });
      if (closed) ctx.closePath();
      ctx.stroke();
    }
  }
  const img = ctx.getImageData(0, 0, cw, ch).data;
  const cov = new Float32Array(DESIG_TEX_W * DESIG_TEX_H);
  for (let y = 0; y < DESIG_TEX_H; y++) {
    for (let x = 0; x < DESIG_TEX_W; x++) {
      let sum = 0;
      for (let dy = 0; dy < ss; dy++) for (let dx = 0; dx < ss; dx++) sum += img[((ch - 1 - (y * ss + dy)) * cw + x * ss + dx) * 4]!;
      cov[y * DESIG_TEX_W + x] = sum / (255 * ss * ss);
    }
  }
  return cov;
}

/**
 * A picture of several designators side by side (developer page: check every numeral by eye).
 * Left half of each cell: the paint coverage; right half: the distance field cut at its edge.
 */
export function designatorSheet(ids: string[]): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = ids.length * DESIG_TEX_W * 2;
  canvas.height = DESIG_TEX_H;
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(canvas.width, canvas.height);
  ids.forEach((id, k) => {
    const px = coverageToSdf(drawDesignator(id.trim().toUpperCase()), DESIG_TEX_W, DESIG_TEX_H);
    for (let y = 0; y < DESIG_TEX_H; y++) {
      for (let x = 0; x < DESIG_TEX_W; x++) {
        const src = (y * DESIG_TEX_W + x) * 4;
        // row 0 of the texture is nearest the threshold: draw it at the bottom, as the pilot sees it
        const row = (DESIG_TEX_H - 1 - y) * canvas.width;
        const a = (row + k * DESIG_TEX_W * 2 + x) * 4;
        const b = a + DESIG_TEX_W * 4;
        const cov = px[src]!;
        const cut = px[src + 1]! >= 128 ? 255 : 30;
        img.data[a] = img.data[a + 1] = img.data[a + 2] = Math.max(30, cov);
        img.data[b] = img.data[b + 1] = cut;
        img.data[b + 2] = Math.max(60, cut);
        img.data[a + 3] = img.data[b + 3] = 255;
      }
    }
  });
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/** Shared GPU textures of the module, created on demand and kept (they are small). */
export class TextureCache {
  private noise: GlTexture | null = null;
  private blank: GlTexture | null = null;
  private readonly designators = new Map<string, GlTexture>();

  constructor(private readonly context: GlContext) {}

  noiseTexture(): GlTexture {
    this.noise ??= createTexture(this.context, { width: NOISE_SIZE, height: NOISE_SIZE, pixels: noisePixels(), repeat: true });
    return this.noise;
  }

  /** A 2×2 "no paint" texture for runway ends without a number. */
  blankTexture(): GlTexture {
    this.blank ??= createTexture(this.context, { width: 2, height: 2, pixels: new Uint8Array([0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255]), repeat: false });
    return this.blank;
  }

  hasDesignator(id: string): boolean {
    return this.designators.has(id.trim().toUpperCase());
  }

  designatorTexture(id: string): GlTexture {
    const key = id.trim().toUpperCase();
    let tex = this.designators.get(key);
    if (!tex) {
      const pixels = coverageToSdf(drawDesignator(key), DESIG_TEX_W, DESIG_TEX_H);
      tex = createTexture(this.context, { width: DESIG_TEX_W, height: DESIG_TEX_H, pixels, repeat: false });
      this.designators.set(key, tex);
    }
    return tex;
  }

  get designatorCount(): number {
    return this.designators.size;
  }

  destroy(): void {
    this.noise?.destroy();
    this.blank?.destroy();
    for (const t of this.designators.values()) t.destroy();
    this.designators.clear();
    this.noise = this.blank = null;
  }
}
