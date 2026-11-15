/**
 * Small signal-analysis toolbox used to CHECK the synthesised sound (self-test and unit tests):
 * levels, a Fourier transform, peak finding and tone-burst detection. Plain arithmetic — no
 * browser audio — so it also runs in Node. The simulator does not need this file to make sound.
 */

export type Samples = Float32Array | Float64Array | readonly number[];

export const toDb = (amplitude: number): number => 20 * Math.log10(Math.max(amplitude, 1e-12));

/** Largest absolute sample and root-mean-square level of samples [from, to). */
export function levels(x: Samples, from = 0, to = x.length): { peak: number; rms: number } {
  let peak = 0;
  let sum = 0;
  const a = Math.max(0, from);
  const b = Math.min(x.length, to);
  for (let i = a; i < b; i++) {
    const v = x[i]!;
    const m = Math.abs(v);
    if (m > peak) peak = m;
    sum += v * v;
  }
  return { peak, rms: b > a ? Math.sqrt(sum / (b - a)) : 0 };
}

/** Largest jump between neighbouring samples (a click or "zipper" shows up as an unusually large one). */
export function maxStep(x: Samples, from = 0, to = x.length): number {
  let m = 0;
  for (let i = Math.max(1, from); i < Math.min(x.length, to); i++) m = Math.max(m, Math.abs(x[i]! - x[i - 1]!));
  return m;
}

/** In-place radix-2 fast Fourier transform (length must be a power of two). */
export function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  if (n !== im.length || (n & (n - 1)) !== 0) throw new Error("fft: length must be a power of two");
  // bit-reversal ordering
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i]!;
      re[i] = re[j]!;
      re[j] = tr;
      const ti = im[i]!;
      im[i] = im[j]!;
      im[j] = ti;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k;
        const b = a + len / 2;
        const xr = re[b]! * cr - im[b]! * ci;
        const xi = re[b]! * ci + im[b]! * cr;
        re[b] = re[a]! - xr;
        im[b] = im[a]! - xi;
        re[a] = re[a]! + xr;
        im[a] = im[a]! + xi;
        const nr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = nr;
      }
    }
  }
}

export interface Spectrum {
  /** Amplitude per frequency bin (a steady sine of amplitude A reads about A at its bin). */
  mag: Float64Array;
  sampleRate: number;
  fftSize: number;
  /** Width of one bin, Hz. */
  binHz: number;
}

/**
 * Amplitude spectrum of `fftSize` samples starting at `offset` (Hann window; scaled so a steady
 * sine of amplitude A shows a peak of about A).
 */
export function spectrum(x: Samples, sampleRate: number, fftSize: number, offset = 0): Spectrum {
  const re = new Float64Array(fftSize);
  const im = new Float64Array(fftSize);
  for (let i = 0; i < fftSize; i++) {
    const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / fftSize);
    re[i] = (x[offset + i] ?? 0) * w;
  }
  fft(re, im);
  const mag = new Float64Array(fftSize / 2);
  // Hann window: coherent gain 0.5; a sine splits its energy between +f and −f → factor 2 / (N · 0.5)
  const scale = 4 / fftSize;
  for (let i = 0; i < mag.length; i++) mag[i] = Math.hypot(re[i]!, im[i]!) * scale;
  return { mag, sampleRate, fftSize, binHz: sampleRate / fftSize };
}

export interface SpectralPeak {
  hz: number;
  /** Level in dB relative to full scale (0 dB = a sine that just reaches ±1). */
  db: number;
}

/** The strongest separate peaks of a spectrum between `minHz` and `maxHz`, strongest first. */
export function findPeaks(s: Spectrum, opts: { count?: number; minHz?: number; maxHz?: number; minDb?: number; minSeparationHz?: number } = {}): SpectralPeak[] {
  const { count = 8, minHz = 10, maxHz = s.sampleRate / 2, minDb = -90, minSeparationHz = 4 } = opts;
  const lo = Math.max(2, Math.floor(minHz / s.binHz));
  const hi = Math.min(s.mag.length - 2, Math.ceil(maxHz / s.binHz));
  const found: SpectralPeak[] = [];
  for (let i = lo; i <= hi; i++) {
    const m = s.mag[i]!;
    if (m <= s.mag[i - 1]! || m < s.mag[i + 1]!) continue;
    const db = toDb(m);
    if (db < minDb) continue;
    // refine the frequency with a parabola through the three bins (in dB)
    const a = toDb(s.mag[i - 1]!);
    const c = toDb(s.mag[i + 1]!);
    const denom = a - 2 * db + c;
    const shift = denom !== 0 ? (0.5 * (a - c)) / denom : 0;
    found.push({ hz: (i + shift) * s.binHz, db: db - 0.25 * (a - c) * shift });
  }
  found.sort((p, q) => q.db - p.db);
  const out: SpectralPeak[] = [];
  for (const p of found) {
    if (out.some((o) => Math.abs(o.hz - p.hz) < minSeparationHz)) continue;
    out.push(p);
    if (out.length >= count) break;
  }
  return out;
}

/** The strongest peak within ±`tolerance` (a fraction, e.g. 0.05 = 5 %) of `hz`, or null. */
export function peakNear(s: Spectrum, hz: number, tolerance = 0.05): SpectralPeak | null {
  const peaks = findPeaks(s, { count: 1, minHz: hz * (1 - tolerance), maxHz: hz * (1 + tolerance), minDb: -140, minSeparationHz: 0 });
  return peaks[0] ?? null;
}

/** RMS level of everything between two frequencies. */
export function bandRms(s: Spectrum, loHz: number, hiHz: number): number {
  const lo = Math.max(1, Math.floor(loHz / s.binHz));
  const hi = Math.min(s.mag.length - 1, Math.ceil(hiHz / s.binHz));
  let sum = 0;
  // each bin holds amplitude A of a sine → power A²/2; the Hann window spreads power over 1.5 bins
  for (let i = lo; i <= hi; i++) sum += (s.mag[i]! * s.mag[i]!) / 2 / 1.5;
  return Math.sqrt(sum);
}

/** "Centre of gravity" of the spectrum between two frequencies, Hz — a simple measure of brightness. */
export function spectralCentroid(s: Spectrum, loHz = 20, hiHz = 8000): number {
  const lo = Math.max(1, Math.floor(loHz / s.binHz));
  const hi = Math.min(s.mag.length - 1, Math.ceil(hiHz / s.binHz));
  let num = 0;
  let den = 0;
  for (let i = lo; i <= hi; i++) {
    const p = s.mag[i]! * s.mag[i]!;
    num += p * i * s.binHz;
    den += p;
  }
  return den > 0 ? num / den : 0;
}

/**
 * Loudness of one frequency over time (Goertzel filter on consecutive blocks): returns one
 * amplitude per block of `blockSec` seconds.
 */
export function toneEnvelope(x: Samples, sampleRate: number, hz: number, blockSec = 0.01): Float64Array {
  const block = Math.max(8, Math.round(blockSec * sampleRate));
  const blocks = Math.floor(x.length / block);
  const out = new Float64Array(blocks);
  const coeff = 2 * Math.cos((2 * Math.PI * hz) / sampleRate);
  for (let b = 0; b < blocks; b++) {
    let s1 = 0;
    let s2 = 0;
    for (let i = 0; i < block; i++) {
      const s0 = x[b * block + i]! + coeff * s1 - s2;
      s2 = s1;
      s1 = s0;
    }
    const power = s1 * s1 + s2 * s2 - coeff * s1 * s2;
    out[b] = (2 * Math.sqrt(Math.max(0, power))) / block;
  }
  return out;
}

/** Start and end times (seconds) of the bursts of one tone — e.g. the dots and dashes of Morse code. */
export function toneBursts(x: Samples, sampleRate: number, hz: number, blockSec = 0.01): { start: number; end: number; level: number }[] {
  const env = toneEnvelope(x, sampleRate, hz, blockSec);
  let max = 0;
  for (const v of env) if (v > max) max = v;
  const threshold = max * 0.5;
  const out: { start: number; end: number; level: number }[] = [];
  if (max <= 1e-6) return out;
  const block = Math.max(8, Math.round(blockSec * sampleRate)) / sampleRate;
  let start = -1;
  for (let i = 0; i <= env.length; i++) {
    const on = i < env.length && env[i]! >= threshold;
    if (on && start < 0) start = i;
    else if (!on && start >= 0) {
      out.push({ start: start * block, end: i * block, level: max });
      start = -1;
    }
  }
  return out;
}

/** Seconds until the sound has died away for good: the end of the last 10 ms block louder than `floorDb`. */
export function soundLengthSec(x: Samples, sampleRate: number, floorDb = -60): number {
  const block = Math.max(1, Math.round(0.01 * sampleRate));
  const floor = Math.pow(10, floorDb / 20);
  let last = 0;
  for (let b = 0; b * block < x.length; b++) {
    const { peak } = levels(x, b * block, (b + 1) * block);
    if (peak > floor) last = Math.min(x.length, (b + 1) * block);
  }
  return last / sampleRate;
}
