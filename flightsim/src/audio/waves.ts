/**
 * Raw material for the synthesiser, as plain arrays (no browser audio here, so it runs in Node):
 * the harmonic recipes of the repeating waveforms and the random "noise" tables.
 *
 * A repeating waveform is described the way the Web Audio API wants it for `createPeriodicWave`:
 *   x(t) = Σ real[k]·cos(2π·k·t) + imag[k]·sin(2π·k·t)      (k = 1…N, index 0 unused)
 *
 * Everything here is original and generated from formulas; nothing is sampled from a recording.
 */

export interface WaveCoeffs {
  real: Float32Array;
  imag: Float32Array;
}

const coeffs = (harmonics: number): WaveCoeffs => ({ real: new Float32Array(harmonics + 1), imag: new Float32Array(harmonics + 1) });

/** Small seeded random generator (xorshift, 32 bit) so every run produces the same tables. Returns 0 ≤ x < 1. */
export function seededRandom(seed: number): () => number {
  let s = seed | 0 || 0x9e3779b9;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------- engine

export const EXHAUST_HARMONICS = 40;
/** How quickly the exhaust harmonics die away with their number (e-folding). */
const EXHAUST_ROLLOFF = 30;

/**
 * Exhaust pulses, all cylinders alike: a sawtooth-like pulse train (each harmonic m has strength
 * 1/m, slightly irregular), played at the firing frequency. Not normalised: harmonic 1 ≈ 1.
 */
export function exhaustWave(): WaveCoeffs {
  const w = coeffs(EXHAUST_HARMONICS);
  const rnd = seededRandom(11);
  for (let m = 1; m <= EXHAUST_HARMONICS; m++) w.imag[m] = (1 / m) * Math.exp(-m / EXHAUST_ROLLOFF) * (0.85 + 0.3 * rnd());
  return w;
}

/** How much stronger / weaker than average each cylinder's exhaust pulse is (sums to zero). */
export const CYLINDER_LEVEL: readonly number[] = [0.3, -0.2, 0.1, -0.2];
/** How early / late each cylinder fires, as a fraction of the two-revolution cycle. */
export const CYLINDER_TIMING: readonly number[] = [0, 0.007, -0.005, 0.004];
export const BURBLE_HARMONICS = 96;

/**
 * What uneven cylinders add: the difference between four slightly different pulses per engine
 * cycle and four identical ones. Played at the cycle frequency (firing frequency / 4), it puts
 * tones between the firing harmonics — the lumpy "lope" of a four-cylinder at idle.
 * Same scale as `exhaustWave` (so equal gains give the full unevenness above).
 */
export function burbleWave(): WaveCoeffs {
  const w = coeffs(BURBLE_HARMONICS);
  for (let n = 1; n <= BURBLE_HARMONICS; n++) {
    let re = 0;
    let im = 0;
    for (let k = 0; k < 4; k++) {
      const a = 1 + (CYLINDER_LEVEL[k] ?? 0);
      const phase = 2 * Math.PI * n * (k / 4 + (CYLINDER_TIMING[k] ?? 0));
      im += a * Math.cos(phase);
      re -= a * Math.sin(phase);
    }
    if (n % 4 === 0) im -= 4; // the even part is already played by the exhaust wave
    const tilt = (1 / n) * Math.exp(-n / 4 / EXHAUST_ROLLOFF);
    w.real[n] = re * tilt;
    w.imag[n] = im * tilt;
  }
  return w;
}

/** Width of the gating pulse as a fraction of its period. */
export const PULSE_WIDTH = 0.3;
/** Average value of the gating pulse (removed from the wave; add it back as the gain's resting value). */
export const PULSE_DC = PULSE_WIDTH / 2;
export const PULSE_HARMONICS = 20;

/**
 * A smooth bump (raised cosine, height 1, `PULSE_WIDTH` of the period wide) once per period,
 * with its average removed. Used to switch noise on in time with each exhaust pulse or each
 * compression stroke. Not normalised.
 */
export function pulseWave(): WaveCoeffs {
  const w = coeffs(PULSE_HARMONICS);
  const steps = 2048;
  for (let n = 1; n <= PULSE_HARMONICS; n++) {
    let sum = 0;
    for (let i = 0; i < steps; i++) {
      const t = ((i + 0.5) / steps - 0.5) * PULSE_WIDTH; // across the bump, centred on 0
      sum += 0.5 * (1 + Math.cos((2 * Math.PI * t) / PULSE_WIDTH)) * Math.cos(2 * Math.PI * n * t);
    }
    w.real[n] = (2 * sum * PULSE_WIDTH) / steps;
  }
  return w;
}

export const PROP_HARMONICS = 14;

/** Propeller blade-pass tone: softer than the exhaust (harmonic n has strength n^-1.5). Normalised by the browser. */
export function propWave(): WaveCoeffs {
  const w = coeffs(PROP_HARMONICS);
  for (let n = 1; n <= PROP_HARMONICS; n++) w.imag[n] = Math.pow(n, -1.5);
  return w;
}

export const REED_HARMONICS = 16;

/** The stall horn's reed: a bright, buzzy wave rich in harmonics (odd ones a little stronger). Normalised by the browser. */
export function reedWave(): WaveCoeffs {
  const w = coeffs(REED_HARMONICS);
  const rnd = seededRandom(73);
  for (let n = 1; n <= REED_HARMONICS; n++) {
    const a = Math.pow(n, -0.75) * (n % 2 === 1 ? 1 : 0.7);
    const phase = n === 1 ? 0 : rnd() * 2 * Math.PI;
    w.real[n] = a * Math.sin(phase);
    w.imag[n] = a * Math.cos(phase);
  }
  return w;
}

// ---------------------------------------------------------------- noise and control tables

/** White noise, −1…1. */
export function fillWhiteNoise(a: Float32Array, seed: number): void {
  const rnd = seededRandom(seed);
  for (let i = 0; i < a.length; i++) a[i] = rnd() * 2 - 1;
}

/**
 * A slowly wandering random value, −1…1: random points `knotsPerSec` times a second joined by
 * smooth curves. The end joins the start, so it can loop without a jump.
 */
export function fillSmoothRandom(a: Float32Array, sampleRate: number, knotsPerSec: number, seed: number): void {
  const rnd = seededRandom(seed);
  const knots = Math.max(2, Math.round((a.length / sampleRate) * knotsPerSec));
  const values = new Float32Array(knots + 1);
  for (let i = 0; i < knots; i++) values[i] = rnd() * 2 - 1;
  values[knots] = values[0]!;
  for (let i = 0; i < a.length; i++) {
    const x = (i / a.length) * knots;
    const k = Math.min(knots - 1, Math.floor(x));
    const f = x - k;
    const s = 0.5 - 0.5 * Math.cos(Math.PI * f);
    a[i] = values[k]! * (1 - s) + values[k + 1]! * s;
  }
}

/**
 * Misfires: 0 most of the time, with smooth-edged bumps up to 1 lasting 0.05–0.22 s at random
 * intervals of 0.12–0.8 s. Subtracted from the engine's loudness when it stumbles.
 */
export function fillDropouts(a: Float32Array, sampleRate: number, seed: number): void {
  const rnd = seededRandom(seed);
  a.fill(0);
  const edge = Math.max(1, Math.round(0.015 * sampleRate));
  let i = Math.round(0.1 * sampleRate);
  while (i < a.length) {
    const len = Math.round((0.05 + 0.17 * rnd()) * sampleRate);
    const depth = 0.55 + 0.45 * rnd();
    if (i + len + edge >= a.length) break; // keep the loop point silent
    for (let j = 0; j < len; j++) {
      const rise = Math.min(1, j / edge, (len - 1 - j) / edge);
      a[i + j] = depth * (0.5 - 0.5 * Math.cos(Math.PI * Math.max(0, rise)));
    }
    i += len + Math.round((0.12 + 0.68 * rnd()) * sampleRate);
  }
}

/**
 * Pops: 0 most of the time, with short bursts (2 ms rise, 25–60 ms fall) of random strength at
 * random intervals of 0.08–0.5 s. Used as the loudness of a noise source.
 */
export function fillPops(a: Float32Array, sampleRate: number, seed: number): void {
  const rnd = seededRandom(seed);
  a.fill(0);
  const rise = Math.max(1, Math.round(0.002 * sampleRate));
  let i = Math.round(0.05 * sampleRate);
  while (i < a.length) {
    const fall = (0.025 + 0.035 * rnd()) * sampleRate;
    const len = Math.round(fall * 4);
    const amp = 0.3 + 0.7 * rnd();
    if (i + len >= a.length) break;
    for (let j = 0; j < len; j++) a[i + j] = amp * Math.min(1, j / rise) * Math.exp(-Math.max(0, j - rise) / (fall / 2));
    i += len + Math.round((0.08 + 0.42 * rnd()) * sampleRate);
  }
}

/** Evaluate a wave recipe at phase `t` (0…1) — for tests and plots. */
export function evalWave(w: WaveCoeffs, t: number): number {
  let x = 0;
  for (let k = 1; k < w.real.length; k++) x += w.real[k]! * Math.cos(2 * Math.PI * k * t) + w.imag[k]! * Math.sin(2 * Math.PI * k * t);
  return x;
}
