/**
 * The synthesiser: Web Audio node graphs for every continuous sound. Each "voice" is built once
 * from standard nodes (oscillators, noise, filters, gains) and then only has numbers applied to
 * it (from model.ts). The same code runs live (AudioContext) and in the self-test
 * (OfflineAudioContext), so what is measured is what is heard.
 *
 * Values are always changed with a short glide (`setTargetAtTime`), never by jumping, so pitch
 * and loudness follow the simulator smoothly even at low frame rates ("no zipper noise").
 */
import { IDENT_TONE_HZ, identCycleSec, morseSchedule } from "./morse";
import { MIN_HZ, stallHornHz, type EngineSoundParams, type RumbleParams, type WindSoundParams } from "./model";
import { PULSE_DC, burbleWave, exhaustWave, fillDropouts, fillPops, fillSmoothRandom, fillWhiteNoise, propWave, pulseWave, reedWave, type WaveCoeffs } from "./waves";

// ---------------------------------------------------------------- levels (tuned by measuring the rendered sound)

/** Engine (exhaust path) level before the engine volume control. */
const EXHAUST_LEVEL = 0.34;
const CRACKLE_LEVEL = 1.5;
const POP_LEVEL = 0.9;
const PROP_TONE_LEVEL = 0.2;
const PROP_NOISE_LEVEL = 0.34;
const STARTER_LEVEL = 0.16;
const WIND_HISS_LEVEL = 0.2;
const WIND_BUFFET_LEVEL = 0.3;
const HORN_LEVEL = 0.16;
const RUMBLE_LEVEL = 0.55;
const FLAP_LEVEL = 0.05;
const IDENT_LEVEL = 0.07;
const IDENT_HISS_LEVEL = 0.035;

/** Sample rate of the slow "control" tables (wobble, misfires, pops). */
const CONTROL_RATE = 8000;

// ---------------------------------------------------------------- shared material

export interface Shared {
  ctx: BaseAudioContext;
  /** 4 s of white noise. */
  noise: AudioBuffer;
  /** Random value wandering about 12 times a second (engine roughness, wheel bumps). */
  wobble: AudioBuffer;
  /** Random value wandering about twice a second (gusty airflow). */
  drift: AudioBuffer;
  /** Misfire pattern. */
  dropouts: AudioBuffer;
  /** Pop pattern. */
  pops: AudioBuffer;
  waves: { exhaust: PeriodicWave; burble: PeriodicWave; pulse: PeriodicWave; prop: PeriodicWave; reed: PeriodicWave };
}

/** Build the noise tables and waveforms every voice shares (once per audio context). */
export function createShared(ctx: BaseAudioContext): Shared {
  const sr = ctx.sampleRate;
  const noise = ctx.createBuffer(1, Math.round(sr * 4), sr);
  fillWhiteNoise(noise.getChannelData(0), 1234567);
  const control = (seconds: number, fill: (a: Float32Array, rate: number) => void): AudioBuffer => {
    let buffer: AudioBuffer;
    let rate = CONTROL_RATE;
    try {
      buffer = ctx.createBuffer(1, rate * seconds, rate);
    } catch {
      // some browsers refuse low sample rates for buffers
      rate = sr;
      buffer = ctx.createBuffer(1, Math.round(rate * seconds), rate);
    }
    fill(buffer.getChannelData(0), rate);
    return buffer;
  };
  const wave = (c: WaveCoeffs, normalize: boolean): PeriodicWave => ctx.createPeriodicWave(c.real, c.imag, { disableNormalization: !normalize });
  return {
    ctx,
    noise,
    wobble: control(9, (a, r) => fillSmoothRandom(a, r, 12, 101)),
    drift: control(13, (a, r) => fillSmoothRandom(a, r, 2, 202)),
    dropouts: control(11, (a, r) => fillDropouts(a, r, 303)),
    pops: control(7, (a, r) => fillPops(a, r, 404)),
    waves: {
      exhaust: wave(exhaustWave(), false),
      burble: wave(burbleWave(), false),
      pulse: wave(pulseWave(), false),
      prop: wave(propWave(), true),
      reed: wave(reedWave(), true),
    },
  };
}

// ---------------------------------------------------------------- small helpers

/** Glide a value to `v` (time constant `tau` seconds; 0 = set at once). */
export function glide(p: AudioParam, v: number, t: number, tau: number): void {
  if (!Number.isFinite(v)) return;
  if (tau > 0) p.setTargetAtTime(v, t, tau);
  else p.setValueAtTime(v, t);
}

/** An AudioParam that remembers its last target so unchanged values cost nothing. */
class Knob {
  private last = NaN;
  constructor(private readonly p: AudioParam) {}
  set(v: number, t: number, tau: number): void {
    if (!Number.isFinite(v)) return;
    if (Math.abs(v - this.last) <= 1e-6 + 1e-4 * Math.abs(this.last)) return;
    this.last = v;
    glide(this.p, v, t, tau);
  }
}

function looped(sh: Shared, buffer: AudioBuffer, offsetSec = 0, rate = 1): AudioBufferSourceNode {
  const src = sh.ctx.createBufferSource();
  src.buffer = buffer;
  src.loop = true;
  src.playbackRate.value = rate;
  src.start(0, offsetSec % buffer.duration);
  return src;
}

function filter(ctx: BaseAudioContext, type: BiquadFilterType, hz: number, q = 0.707, gainDb = 0): BiquadFilterNode {
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = hz;
  f.Q.value = q;
  f.gain.value = gainDb;
  return f;
}

function gain(ctx: BaseAudioContext, value: number): GainNode {
  const g = ctx.createGain();
  g.gain.value = value;
  return g;
}

function oscillator(ctx: BaseAudioContext, wave: PeriodicWave | OscillatorType, hz: number): OscillatorNode {
  const o = ctx.createOscillator();
  if (typeof wave === "string") o.type = wave as OscillatorType;
  else o.setPeriodicWave(wave);
  o.frequency.value = hz;
  o.start();
  return o;
}

/** Connect a → b → c … and return the last node. */
function chain(...nodes: AudioNode[]): AudioNode {
  for (let i = 0; i + 1 < nodes.length; i++) nodes[i]!.connect(nodes[i + 1]!);
  return nodes[nodes.length - 1]!;
}

// ---------------------------------------------------------------- master

export interface MasterChain {
  /** Connect everything here; its gain is the master volume. */
  input: GainNode;
  compressor: DynamicsCompressorNode;
  clip: WaveShaperNode;
  /** The final signal (after the limiter). */
  output: AudioNode;
}

/** Largest output the final stage can produce (so the sound can never clip, whatever is fed in). */
export const OUTPUT_CEILING = 0.6 + 0.35 * Math.tanh(0.4 / 0.35);

/** Transfer curve of the final safety stage: untouched up to 0.6, then bending smoothly towards the ceiling. */
export function softClipCurve(points = 2049): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(new ArrayBuffer(points * 4));
  for (let i = 0; i < points; i++) {
    const x = (i / (points - 1)) * 2 - 1;
    const a = Math.abs(x);
    const y = a <= 0.6 ? a : 0.6 + 0.35 * Math.tanh((a - 0.6) / 0.35);
    curve[i] = Math.sign(x) * y;
  }
  return curve;
}

/**
 * Master volume → compressor (evens out loud moments) → soft clipper (a hard guarantee that the
 * output stays below full scale) → loudspeakers.
 */
export function createMaster(ctx: BaseAudioContext, destination: AudioNode = ctx.destination): MasterChain {
  const input = gain(ctx, 1);
  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = -10;
  compressor.knee.value = 8;
  compressor.ratio.value = 8;
  compressor.attack.value = 0.003;
  compressor.release.value = 0.25;
  const clip = ctx.createWaveShaper();
  clip.curve = softClipCurve();
  clip.oversample = "none";
  chain(input, compressor, clip, destination);
  return { input, compressor, clip, output: clip };
}

// ---------------------------------------------------------------- engine and propeller

/**
 * Piston engine + propeller.
 *
 *   exhaust   pulse-train oscillator at the firing frequency  ┐
 *   burble    uneven-cylinder oscillator at firing / 4        ├→ bass shelf → two fixed resonances → low-pass → roughness / misfire gain → out
 *   crackle   noise let through in time with each pulse       │   (the fixed resonances stand for the exhaust pipe and cowling:
 *   pops      noise bursts at random moments                  ┘    the harmonics move through them as rpm changes)
 *   propeller blade-pass oscillator → tracking low-pass, plus band-passed noise pulsing at blade-pass rate → out
 */
export class EngineVoice {
  readonly out: GainNode;
  private readonly k: {
    exHz: Knob;
    buHz: Knob;
    pulseHz: Knob;
    propHz: Knob;
    bladeHz: Knob;
    ex: Knob;
    bu: Knob;
    crackle: Knob;
    pop: Knob;
    bass: Knob;
    cutoff: Knob;
    rough: Knob;
    stumble: Knob;
    jitter: Knob;
    prop: Knob;
    propCut: Knob;
    propNoise: Knob;
    propNoiseHz: Knob;
  };

  constructor(sh: Shared) {
    const ctx = sh.ctx;
    this.out = gain(ctx, 1);

    // --- exhaust sources
    const oscEx = oscillator(ctx, sh.waves.exhaust, MIN_HZ);
    const oscBu = oscillator(ctx, sh.waves.burble, MIN_HZ / 4);
    const gEx = gain(ctx, 0);
    const gBu = gain(ctx, 0);
    const sum = gain(ctx, 1);
    chain(oscEx, gEx, sum);
    chain(oscBu, gBu, sum);

    // noise gated by a bump at every exhaust pulse
    const oscPulse = oscillator(ctx, sh.waves.pulse, MIN_HZ);
    const gate = gain(ctx, PULSE_DC);
    oscPulse.connect(gate.gain);
    const gCrackle = gain(ctx, 0);
    chain(looped(sh, sh.noise, 0.3), filter(ctx, "bandpass", 650, 0.7), gate, gCrackle, sum);

    // random pops
    const popGate = gain(ctx, 0);
    looped(sh, sh.pops).connect(popGate.gain);
    const gPop = gain(ctx, 0);
    chain(looped(sh, sh.noise, 1.7, 0.93), filter(ctx, "bandpass", 240, 0.8), popGate, gPop, sum);

    // --- fixed colouring and the load-dependent tone
    const shelf = filter(ctx, "lowshelf", 170, 0.707, 0);
    const res1 = filter(ctx, "peaking", 230, 1.1, 4);
    const res2 = filter(ctx, "peaking", 520, 1.4, 3);
    const lowpass = filter(ctx, "lowpass", 500, 0.6);
    const rough = gain(ctx, 1);
    chain(sum, shelf, res1, res2, lowpass, rough, gain(ctx, EXHAUST_LEVEL), this.out);

    // slow random loudness wobble, misfire drop-outs and pitch jitter
    const wobble = looped(sh, sh.wobble);
    const roughDepth = gain(ctx, 0);
    chain(wobble, roughDepth).connect(rough.gain);
    const stumbleDepth = gain(ctx, 0);
    chain(looped(sh, sh.dropouts), stumbleDepth).connect(rough.gain);
    const jitter = gain(ctx, 0);
    chain(looped(sh, sh.wobble, 4.1, 0.77), jitter);
    jitter.connect(oscEx.detune);
    jitter.connect(oscBu.detune);
    jitter.connect(oscPulse.detune);

    // --- propeller
    const oscProp = oscillator(ctx, sh.waves.prop, MIN_HZ);
    const propLp = filter(ctx, "lowpass", 60, 0.5);
    const gProp = gain(ctx, 0);
    chain(oscProp, propLp, gProp, gain(ctx, PROP_TONE_LEVEL), this.out);
    const oscBlade = oscillator(ctx, "sine", MIN_HZ);
    const whoosh = gain(ctx, 0.65);
    chain(oscBlade, gain(ctx, 0.35)).connect(whoosh.gain);
    const propBp = filter(ctx, "bandpass", 300, 0.9);
    const gPropNoise = gain(ctx, 0);
    chain(looped(sh, sh.noise, 2.6, 1.07), propBp, whoosh, gPropNoise, gain(ctx, PROP_NOISE_LEVEL), this.out);
    jitter.connect(oscProp.detune);
    jitter.connect(oscBlade.detune);

    this.k = {
      exHz: new Knob(oscEx.frequency),
      buHz: new Knob(oscBu.frequency),
      pulseHz: new Knob(oscPulse.frequency),
      propHz: new Knob(oscProp.frequency),
      bladeHz: new Knob(oscBlade.frequency),
      ex: new Knob(gEx.gain),
      bu: new Knob(gBu.gain),
      crackle: new Knob(gCrackle.gain),
      pop: new Knob(gPop.gain),
      bass: new Knob(shelf.gain),
      cutoff: new Knob(lowpass.frequency),
      rough: new Knob(roughDepth.gain),
      stumble: new Knob(stumbleDepth.gain),
      jitter: new Knob(jitter.gain),
      prop: new Knob(gProp.gain),
      propCut: new Knob(propLp.frequency),
      propNoise: new Knob(gPropNoise.gain),
      propNoiseHz: new Knob(propBp.frequency),
    };
  }

  /** Apply sound settings at audio time `t`, gliding with time constant `tau` (0 = at once). */
  apply(p: EngineSoundParams, t: number, tau: number): void {
    const k = this.k;
    k.exHz.set(p.firingHz, t, tau);
    k.buHz.set(p.cycleHz, t, tau);
    k.pulseHz.set(p.firingHz, t, tau);
    k.propHz.set(p.bladeHz, t, tau);
    k.bladeHz.set(p.bladeHz, t, tau);
    k.ex.set(p.exhaustGain, t, tau);
    k.bu.set(p.burbleGain, t, tau);
    k.crackle.set(p.crackleGain * CRACKLE_LEVEL, t, tau);
    k.pop.set(p.popGain * POP_LEVEL, t, tau);
    k.bass.set(p.bassDb, t, tau);
    k.cutoff.set(p.exhaustCutoffHz, t, tau);
    k.rough.set(p.roughness, t, tau);
    k.stumble.set(-0.85 * p.stumble, t, tau);
    k.jitter.set(p.jitterCents, t, tau);
    k.prop.set(p.propToneGain, t, tau);
    k.propCut.set(p.propCutoffHz, t, tau);
    k.propNoise.set(p.propNoiseGain, t, tau);
    k.propNoiseHz.set(p.propNoiseHz, t, tau);
  }
}

/**
 * Starter motor: an electric whine that sags on every compression stroke, gear rattle, and a
 * soft chuff per compression.
 */
export class StarterVoice {
  readonly out: GainNode;
  private readonly level: Knob;
  private readonly motorHz: Knob;
  private readonly crankHz: Knob;
  private readonly chuffHz: Knob;

  constructor(sh: Shared) {
    const ctx = sh.ctx;
    this.out = gain(ctx, 0);
    const motor = oscillator(ctx, "sawtooth", 200);
    const body = gain(ctx, 0.75);
    chain(motor, filter(ctx, "bandpass", 1000, 0.9), body, this.out);
    chain(looped(sh, sh.noise, 0.9, 1.11), filter(ctx, "bandpass", 2600, 2), gain(ctx, 0.25), body);
    const crank = oscillator(ctx, "sine", 4);
    chain(crank, gain(ctx, 0.25)).connect(body.gain);
    chain(crank, gain(ctx, -70)).connect(motor.detune);
    const chuffOsc = oscillator(ctx, sh.waves.pulse, 4);
    const chuffGate = gain(ctx, PULSE_DC);
    chuffOsc.connect(chuffGate.gain);
    chain(looped(sh, sh.noise, 3.1, 0.9), filter(ctx, "lowpass", 180, 0.8), chuffGate, gain(ctx, 6), this.out);
    this.level = new Knob(this.out.gain);
    this.motorHz = new Knob(motor.frequency);
    this.crankHz = new Knob(crank.frequency);
    this.chuffHz = new Knob(chuffOsc.frequency);
  }

  apply(p: EngineSoundParams, t: number, tau: number): void {
    this.level.set(p.starterGain * STARTER_LEVEL, t, Math.min(tau, 0.06));
    this.motorHz.set(p.starterHz, t, tau);
    this.crankHz.set(p.crankHz, t, tau);
    this.chuffHz.set(p.crankHz, t, tau);
  }
}

// ---------------------------------------------------------------- airflow

/** Air rushing past the cabin (a broad hiss) and the low buffet of flaps or a slip. */
export class WindVoice {
  readonly out: GainNode;
  private readonly hiss: Knob;
  private readonly hissHz: Knob;
  private readonly buffet: Knob;
  private readonly buffetHz: Knob;

  constructor(sh: Shared) {
    const ctx = sh.ctx;
    this.out = gain(ctx, 1);
    const bp = filter(ctx, "bandpass", 500, 0.5);
    const breathe = gain(ctx, 1);
    chain(looped(sh, sh.drift), gain(ctx, 0.12)).connect(breathe.gain);
    const gHiss = gain(ctx, 0);
    chain(looped(sh, sh.noise, 0.05, 0.97), bp, breathe, gHiss, gain(ctx, WIND_HISS_LEVEL), this.out);
    const lp = filter(ctx, "lowpass", 120, 0.7);
    const shake = gain(ctx, 1);
    chain(looped(sh, sh.wobble, 2.2, 0.6), gain(ctx, 0.35)).connect(shake.gain);
    const gBuffet = gain(ctx, 0);
    chain(looped(sh, sh.noise, 2.05, 1.03), lp, shake, gBuffet, gain(ctx, WIND_BUFFET_LEVEL), this.out);
    this.hiss = new Knob(gHiss.gain);
    this.hissHz = new Knob(bp.frequency);
    this.buffet = new Knob(gBuffet.gain);
    this.buffetHz = new Knob(lp.frequency);
  }

  apply(p: WindSoundParams, t: number, tau: number): void {
    this.hiss.set(p.hissGain, t, tau);
    this.hissHz.set(p.hissHz, t, tau);
    this.buffet.set(p.buffetGain, t, tau);
    this.buffetHz.set(p.buffetHz, t, tau);
  }
}

// ---------------------------------------------------------------- stall warning horn

/**
 * The stall warning of a light Cessna is a reed blown by suction at the wing's leading edge: a
 * steady, nasal, slightly wavering tone. A buzzy reed wave through two fixed resonances, with a
 * little breath noise.
 */
export class HornVoice {
  readonly out: GainNode;
  private readonly level: Knob;
  private readonly hz: Knob;

  constructor(sh: Shared) {
    const ctx = sh.ctx;
    this.out = gain(ctx, 0);
    const reed = oscillator(ctx, sh.waves.reed, stallHornHz(0));
    chain(looped(sh, sh.wobble, 6.3, 1.3), gain(ctx, 9)).connect(reed.detune);
    const waver = gain(ctx, 1);
    chain(looped(sh, sh.wobble, 1.1, 0.8), gain(ctx, 0.06)).connect(waver.gain);
    chain(reed, filter(ctx, "peaking", 1500, 1.2, 7), filter(ctx, "peaking", 2900, 2, 5), filter(ctx, "lowpass", 5500, 0.7), waver, this.out);
    chain(looped(sh, sh.noise, 1.3), filter(ctx, "bandpass", 3000, 1), gain(ctx, 0.05), waver);
    this.level = new Knob(this.out.gain);
    this.hz = new Knob(reed.frequency);
  }

  /** `level` 0 (silent) … 1 (full). */
  apply(level: number, t: number, tau: number): void {
    this.level.set(level * HORN_LEVEL, t, tau);
    if (level > 0) this.hz.set(stallHornHz(level), t, Math.max(tau, 0.08));
  }
}

// ---------------------------------------------------------------- ground roll

/** Wheels on the runway: low-passed noise that shakes a little, like bumps and paving joints. */
export class RumbleVoice {
  readonly out: GainNode;
  private readonly level: Knob;
  private readonly hz: Knob;

  constructor(sh: Shared) {
    const ctx = sh.ctx;
    this.out = gain(ctx, 0);
    const lp = filter(ctx, "lowpass", 80, 0.9);
    const bumps = gain(ctx, 1);
    chain(looped(sh, sh.wobble, 5.5, 1.4), gain(ctx, 0.45)).connect(bumps.gain);
    chain(looped(sh, sh.noise, 3.3, 0.89), lp, bumps, this.out);
    this.level = new Knob(this.out.gain);
    this.hz = new Knob(lp.frequency);
  }

  apply(p: RumbleParams, t: number, tau: number): void {
    this.level.set(p.gain * RUMBLE_LEVEL, t, tau);
    this.hz.set(p.hz, t, tau);
  }
}

// ---------------------------------------------------------------- flap motor

/** The electric flap motor: a small whirr with a gear whine on top, spinning up and down quickly. */
export class FlapVoice {
  readonly out: GainNode;
  private readonly level: Knob;
  private readonly hz: Knob;
  private readonly whineHz: Knob;

  constructor(sh: Shared) {
    const ctx = sh.ctx;
    this.out = gain(ctx, 0);
    const motor = oscillator(ctx, "sawtooth", 100);
    chain(motor, filter(ctx, "bandpass", 700, 1), this.out);
    const whine = oscillator(ctx, "square", 700);
    chain(whine, filter(ctx, "bandpass", 2500, 3), gain(ctx, 0.5), this.out);
    chain(looped(sh, sh.noise, 0.6), filter(ctx, "bandpass", 1800, 1), gain(ctx, 0.5), this.out);
    this.level = new Knob(this.out.gain);
    this.hz = new Knob(motor.frequency);
    this.whineHz = new Knob(whine.frequency);
  }

  apply(moving: boolean, t: number): void {
    this.level.set(moving ? FLAP_LEVEL : 0, t, moving ? 0.04 : 0.07);
    const hz = moving ? 165 : 95;
    this.hz.set(hz, t, 0.09);
    this.whineHz.set(hz * 7.03, t, 0.09);
  }
}

// ---------------------------------------------------------------- navigation identifier (Morse)

/** Seconds a dot or dash takes to fade in and out (prevents key clicks). */
const KEY_TAU = 0.004;

/**
 * The Morse identifier of a navigation station: a 1020 Hz tone keyed as dots and dashes, heard
 * through a radio (band-limited, with a little hiss; more hiss and less tone on a weak signal).
 */
export class IdentVoice {
  readonly out: GainNode;
  private readonly key: GainNode;
  private readonly tone: Knob;
  private readonly hiss: Knob;
  private text = "";
  private nextCycleAt = 0;
  private playing = false;

  constructor(sh: Shared) {
    const ctx = sh.ctx;
    this.out = gain(ctx, 1);
    const radio = filter(ctx, "bandpass", 1100, 0.6);
    radio.connect(this.out);
    this.key = gain(ctx, 0);
    const toneLevel = gain(ctx, 0);
    chain(oscillator(ctx, "sine", IDENT_TONE_HZ), this.key, toneLevel, radio);
    const hiss = gain(ctx, 0);
    chain(looped(sh, sh.noise, 3.7, 0.95), filter(ctx, "bandpass", 1500, 0.5), hiss, radio);
    this.tone = new Knob(toneLevel.gain);
    this.hiss = new Knob(hiss.gain);
  }

  /**
   * Call every frame. `on`: the ident switch is on and the radio has power. `ident`: the
   * station's identifier, or null when no usable signal is received (then only hiss is heard).
   * `signal` 0..1. Cycles are scheduled `lookaheadSec` ahead on the audio clock.
   */
  update(on: boolean, ident: string | null, signal: number, t: number, lookaheadSec = 1.5): void {
    const text = on && ident ? ident.trim().toUpperCase() : "";
    if (text !== this.text) {
      this.silence(t);
      this.text = text;
      this.nextCycleAt = t + 0.35;
    }
    const s = Math.min(1, Math.max(0, signal));
    this.tone.set(text ? IDENT_LEVEL * (0.3 + 0.7 * s) : 0, t, 0.1);
    this.hiss.set(on ? IDENT_HISS_LEVEL * (text ? 0.25 + 0.75 * (1 - s) : 1) : 0, t, 0.1);
    if (!text) return;
    const sched = morseSchedule(text);
    if (sched.tones.length === 0) return;
    const cycle = identCycleSec(sched.durationSec);
    if (this.nextCycleAt < t - cycle) this.nextCycleAt = t + 0.1; // frames stopped for a long time: start afresh
    while (this.nextCycleAt < t + lookaheadSec) {
      const t0 = Math.max(this.nextCycleAt, t);
      for (const tone of sched.tones) {
        this.key.gain.setTargetAtTime(1, t0 + tone.start, KEY_TAU);
        this.key.gain.setTargetAtTime(0, t0 + tone.end, KEY_TAU);
      }
      this.playing = true;
      this.nextCycleAt = t0 + cycle;
    }
  }

  private silence(t: number): void {
    if (!this.playing) return;
    this.key.gain.cancelScheduledValues(t);
    this.key.gain.setTargetAtTime(0, t, KEY_TAU);
    this.playing = false;
  }
}
