/**
 * The "what should it sound like" rules, as plain numbers — no browser audio in this file, so it
 * can be tested in Node. The audio graph (graph.ts) only applies these numbers.
 *
 * The aircraft is a Cessna 172P-class trainer: a four-cylinder, four-stroke, direct-drive piston
 * engine turning a two-blade propeller.
 *
 *   firing frequency      = rpm / 60 × (cylinders / 2)   four-stroke: each cylinder fires every 2nd turn
 *   blade-pass frequency  = rpm / 60 × blades
 *
 * For this engine both are rpm / 30: 2400 rpm → 80 Hz, 700 rpm → 23 Hz. That shared tone (and its
 * harmonics) is the drone a pilot hears; uneven cylinders add weaker tones at half and quarter of it.
 *
 * All gains here are relative (0 = silent, about 1 = full); they are approximations tuned by
 * measurement of the rendered sound, not recordings of a real aircraft.
 */
import { clamp, lerp, smoothstep } from "@/core/math";

export const CYLINDERS = 4;
export const PROP_BLADES = 2;
/** Rated power used to turn horsepower into "how hard is the engine working" (0..1). */
export const RATED_HP = 160;
export const MAX_RPM = 2700;
/** Oscillators are never set below this (a stopped engine is silenced by its gain, not by 0 Hz). */
export const MIN_HZ = 1;

/** Combustion events per second: a four-stroke cylinder fires once every two revolutions. */
export const firingHz = (rpm: number, cylinders = CYLINDERS): number => (Math.max(0, rpm) / 60) * (cylinders / 2);
/** Propeller blades passing a point per second. */
export const bladePassHz = (rpm: number, blades = PROP_BLADES): number => (Math.max(0, rpm) / 60) * blades;
/** Complete four-stroke cycles (two revolutions) per second — the true repeat rate of an engine whose cylinders are not identical. */
export const engineCycleHz = (rpm: number): number => Math.max(0, rpm) / 120;

/** How hard the engine is working, 0 (idling / windmilling) … about 1 (rated power). */
export function engineLoad(powerHp: number, manifoldInHg: number, rpm: number): number {
  if (Number.isFinite(powerHp) && powerHp !== 0) return clamp(powerHp / RATED_HP, 0, 1.15);
  // No power figure available: estimate from manifold pressure (throttle opening) and rpm.
  if (!Number.isFinite(manifoldInHg) || !Number.isFinite(rpm)) return 0;
  const map = clamp((manifoldInHg - 8) / 20.5, 0, 1);
  return clamp(map * clamp(rpm / MAX_RPM, 0, 1.1), 0, 1.15);
}

export interface EngineSoundInput {
  rpm: number;
  /** 0 = no combustion (stopped, windmilling, cranking) … 1 = firing normally. The caller eases this over time. */
  combustion: number;
  powerHp: number;
  manifoldInHg: number;
  kcas: number;
  /** 0 = healthy … 1 = about to quit (carburettor ice, failing engine). */
  distress: number;
  /** 0..1 starter motor engaged (eased by the caller). */
  starter: number;
}

export interface EngineSoundParams {
  /** Hz of the exhaust tone (firing frequency). */
  firingHz: number;
  /** Hz of the uneven-cylinder tone (firing frequency / 4 for four cylinders). */
  cycleHz: number;
  /** Hz of the propeller tone. */
  bladeHz: number;
  /** 0..1 how hard the engine works (for display / tests). */
  load: number;
  /** Even exhaust pulses: the firing frequency and its harmonics. */
  exhaustGain: number;
  /** Cylinder-to-cylinder differences: tones between the firing harmonics (the "lope" at idle). */
  burbleGain: number;
  /** Noise bursts in time with the exhaust pulses (rasp under power, chuffing when turning without firing). */
  crackleGain: number;
  /** Irregular soft pops (closed throttle at speed, a sick engine). */
  popGain: number;
  /** Bass boost of the exhaust under load, dB. */
  bassDb: number;
  /** Low-pass cut-off of the exhaust path, Hz (opens up under power). */
  exhaustCutoffHz: number;
  propToneGain: number;
  /** Low-pass on the propeller tone: more harmonics (buzz) at high rpm. */
  propCutoffHz: number;
  /** Broadband propeller "whoosh". */
  propNoiseGain: number;
  propNoiseHz: number;
  /** Depth of the slow random loudness wobble, 0..1. */
  roughness: number;
  /** Depth of the random pitch wobble, cents. */
  jitterCents: number;
  /** 0..1 depth of misfire drop-outs. */
  stumble: number;
  /** Starter motor: level 0..1, whine pitch (Hz) and compression-stroke rhythm (Hz). */
  starterGain: number;
  starterHz: number;
  crankHz: number;
}

export function emptyEngineParams(): EngineSoundParams {
  return {
    firingHz: MIN_HZ,
    cycleHz: MIN_HZ,
    bladeHz: MIN_HZ,
    load: 0,
    exhaustGain: 0,
    burbleGain: 0,
    crackleGain: 0,
    popGain: 0,
    bassDb: 0,
    exhaustCutoffHz: 500,
    propToneGain: 0,
    propCutoffHz: 60,
    propNoiseGain: 0,
    propNoiseHz: 300,
    roughness: 0,
    jitterCents: 0,
    stumble: 0,
    starterGain: 0,
    starterHz: 200,
    crankHz: 4,
  };
}

/** Turn the engine's state into sound settings. Allocation-free when `out` is given. */
export function engineSoundParams(inp: EngineSoundInput, out: EngineSoundParams = emptyEngineParams()): EngineSoundParams {
  const rpm = Number.isFinite(inp.rpm) ? Math.max(0, inp.rpm) : 0;
  const rpmN = clamp(rpm / MAX_RPM, 0, 1.15);
  const c = clamp(inp.combustion, 0, 1);
  const distress = clamp(inp.distress, 0, 1);
  const load = engineLoad(inp.powerHp, inp.manifoldInHg, rpm);
  const kcas = Number.isFinite(inp.kcas) ? Math.max(0, inp.kcas) : 0;
  /** 0 when the propeller is (nearly) stopped: nothing turns, nothing sounds. */
  const turning = smoothstep(15, 120, rpm);
  const loadCurve = Math.pow(load, 0.7);

  out.firingHz = Math.max(MIN_HZ, firingHz(rpm));
  out.cycleHz = Math.max(MIN_HZ / 4, engineCycleHz(rpm));
  out.bladeHz = Math.max(MIN_HZ, bladePassHz(rpm));
  out.load = load;

  // Exhaust: louder under power and with rpm; still clearly there at idle.
  out.exhaustGain = c * turning * (0.2 + 0.8 * loadCurve) * (0.5 + 0.5 * Math.min(1, rpmN));
  // Uneven cylinders are most obvious at idle (the lope) and when the engine is sick.
  const lump = lerp(0.85, 0.3, smoothstep(600, 2200, rpm)) + 0.5 * distress;
  out.burbleGain = out.exhaustGain * lump;
  // Throttle closed at speed (a glide with the engine idling): the exhaust goes light and pops now and then.
  const overrun = c * smoothstep(900, 1400, rpm) * (1 - smoothstep(0.02, 0.1, load));
  // Turning without firing (starter, shutdown, windmilling): soft compression chuffs, fading at windmill speeds.
  const motoring = (1 - c) * smoothstep(25, 250, rpm) * (1 - 0.7 * smoothstep(500, 1200, rpm)) * 0.1;
  out.crackleGain = c * turning * (0.1 + 0.5 * load) * (0.6 + 0.4 * Math.min(1, rpmN)) + motoring;
  out.popGain = overrun * 0.35 + c * turning * distress * 0.3;
  out.bassDb = 8 * Math.min(1, load) - 2;
  out.exhaustCutoffHz = 450 + 1300 * Math.pow(Math.min(1, load), 0.8) + 300 * Math.min(1, rpmN);

  // Propeller: grows steeply with rpm; a propeller that is driven by the airflow instead of the engine is quiet.
  const thrust = 0.25 + 0.75 * Math.sqrt(Math.min(1, load));
  out.propToneGain = Math.pow(rpmN, 2.2) * thrust;
  out.propCutoffHz = Math.max(40, out.bladeHz * (1.5 + 5 * rpmN * rpmN * rpmN));
  out.propNoiseGain = rpmN * rpmN * (0.55 + 0.45 * clamp(kcas / 120, 0, 1.4)) * (0.5 + 0.5 * thrust);
  out.propNoiseHz = 260 + 900 * Math.min(1, rpmN);

  out.roughness = clamp(0.05 + 0.1 * (1 - Math.min(1, rpmN)) + 0.45 * distress, 0, 0.7);
  out.jitterCents = 3 + 12 * (1 - Math.min(1, rpmN)) + 30 * distress;
  out.stumble = distress * c;

  out.starterGain = clamp(inp.starter, 0, 1);
  out.starterHz = 190 + 1.3 * clamp(rpm, 0, 260);
  out.crankHz = (clamp(rpm, 90, 210) / 60) * 2;
  return out;
}

// ---------------------------------------------------------------- engine distress

/**
 * 0 = healthy … 1 = about to quit. Carburettor ice makes the engine run rough well before it
 * stops; a failing engine stumbles; a large unexplained power loss does too. (Carburettor heat on
 * its own costs only a little power and must not sound like a failure.)
 */
export function engineDistress(carbIce: number, engineFailing: boolean, powerLoss: number): number {
  const ice = Number.isFinite(carbIce) ? smoothstep(0.2, 0.85, carbIce) * 0.85 : 0;
  const loss = Number.isFinite(powerLoss) ? smoothstep(0.3, 0.8, powerLoss) * 0.8 : 0;
  return clamp(Math.max(ice, loss, engineFailing ? 1 : 0), 0, 1);
}

// ---------------------------------------------------------------- airflow

export interface WindSoundParams {
  /** Broadband rush of air past the cabin. */
  hissGain: number;
  hissHz: number;
  /** Low rumble / buffet (flaps out, slipping). */
  buffetGain: number;
  buffetHz: number;
}

export const emptyWindParams = (): WindSoundParams => ({ hissGain: 0, hissHz: 500, buffetGain: 0, buffetHz: 120 });

/** Airflow noise: rises roughly with the square of airspeed (dynamic pressure); more with flaps out or in a slip. */
export function windSoundParams(kcas: number, flapsDeg: number, betaDeg: number, out: WindSoundParams = emptyWindParams()): WindSoundParams {
  const v = clamp(Number.isFinite(kcas) ? kcas : 0, 0, 220);
  const q = (v / 100) * (v / 100);
  const flap = clamp((Number.isFinite(flapsDeg) ? flapsDeg : 0) / 30, 0, 1);
  const slip = clamp(Math.abs(Number.isFinite(betaDeg) ? betaDeg : 0) / 15, 0, 1);
  const fade = smoothstep(8, 30, v); // nothing to hear at taxi speed
  out.hissGain = fade * Math.min(2.2, Math.pow(q, 0.85)) * (1 + 0.3 * flap + 0.5 * slip);
  out.hissHz = 420 + 8 * v + 250 * slip;
  out.buffetGain = fade * Math.min(2, q) * (0.2 + 1.0 * flap + 0.5 * slip);
  out.buffetHz = 110 + 0.9 * v;
  return out;
}

// ---------------------------------------------------------------- stall warning horn

/** Angle of attack at which the horn starts when no systems module provides `sys.stallHorn`, degrees. */
export const HORN_ONSET_ALPHA_DEG = 13;
/** Angle of attack of the stall itself in the core's stall detector, degrees. */
export const STALL_ALPHA_DEG = 16;

/** Stand-in for `sys.stallHorn` when the systems module is absent: horn above 13° angle of attack while flying. */
export const stallHornFallback = (alphaDeg: number, onGround: boolean, aglFt: number, kcas: number): boolean =>
  !onGround && aglFt > 3 && kcas > 20 && alphaDeg > HORN_ONSET_ALPHA_DEG;

/**
 * Loudness of the horn, 0..1. The real horn is a reed blown by suction at a hole in the wing's
 * leading edge: it starts as a soft moan a few knots before the stall and gets louder and a
 * little higher as the stall approaches.
 */
export function stallHornLevel(on: boolean, alphaDeg: number): number {
  if (!on) return 0;
  const a = Number.isFinite(alphaDeg) ? alphaDeg : STALL_ALPHA_DEG;
  return 0.35 + 0.65 * smoothstep(HORN_ONSET_ALPHA_DEG - 0.5, STALL_ALPHA_DEG, a);
}

/** Pitch of the horn's reed for a loudness level, Hz (approximate — not measured from a real horn). */
export const stallHornHz = (level: number): number => 440 + 45 * clamp(level, 0, 1);

// ---------------------------------------------------------------- ground

export interface RumbleParams {
  gain: number;
  hz: number;
}

/** Wheels rolling on the runway: a low rumble that grows with ground speed. */
export function groundRumble(onGround: boolean, gsKt: number, out: RumbleParams = { gain: 0, hz: 80 }): RumbleParams {
  const gs = clamp(Number.isFinite(gsKt) ? gsKt : 0, 0, 120);
  out.gain = onGround ? smoothstep(1, 12, gs) * Math.min(1.3, Math.pow(gs / 55, 0.8)) : 0;
  out.hz = 70 + 2.2 * gs;
  return out;
}

/**
 * How hard a touchdown sounds: 0.25 (a greaser) … 1.6 (very hard), from the sink rate at touchdown
 * (ft/min, negative = descending), and how much the tyres chirp (they spin up from rest at speed).
 */
export function touchdownSound(vsFpm: number, kcas: number): { thump: number; chirp: number } {
  const sink = Math.abs(Number.isFinite(vsFpm) ? vsFpm : 0);
  return { thump: clamp(sink / 450, 0.25, 1.6), chirp: smoothstep(15, 45, Number.isFinite(kcas) ? kcas : 0) };
}

// ---------------------------------------------------------------- volume

/** Slider position (0..1) → gain. Squared so the slider feels even to the ear. */
export const volumeCurve = (v: number): number => {
  const x = clamp(Number.isFinite(v) ? v : 0, 0, 1);
  return x * x;
};
