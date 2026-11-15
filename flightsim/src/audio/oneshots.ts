/**
 * One-shot sound effects, each built from a few short tones and noise bursts that clean up
 * after themselves. All levels are modest; nothing here is a recording.
 */
import type { SoundId } from "./api";
import type { Shared } from "./graph";

/** Everything `playOneShot` can make: the public sound ids plus the ones the simulator triggers itself. */
export type OneShotId = SoundId | "crash" | "catch";

export const ONE_SHOT_IDS: readonly OneShotId[] = ["click", "switch", "knob", "chime", "success", "fail", "flap", "touchdown", "crash", "catch"];

/** Sounds that belong to the interface rather than the aircraft: they are still heard while the simulator is paused. */
export const UI_SOUNDS: ReadonlySet<OneShotId> = new Set<OneShotId>(["click", "switch", "knob", "chime", "success", "fail", "flap"]);

let burstCounter = 0;

/** A tone with a quick attack and a smooth die-away, optionally sliding from `hz0` to `hz1`. */
function tone(ctx: BaseAudioContext, dest: AudioNode, type: OscillatorType, hz0: number, hz1: number, t0: number, peak: number, decayTau: number, attack = 0.004): void {
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(hz0, t0);
  if (hz1 !== hz0) osc.frequency.setTargetAtTime(hz1, t0, decayTau * 0.8);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(peak, t0 + attack);
  g.gain.setTargetAtTime(0, t0 + attack, decayTau);
  osc.connect(g);
  g.connect(dest);
  osc.start(t0);
  osc.stop(t0 + attack + decayTau * 9);
}

/** A burst of filtered noise with a quick attack and a smooth die-away. */
function burst(sh: Shared, dest: AudioNode, type: BiquadFilterType, hz: number, q: number, t0: number, peak: number, decayTau: number, attack = 0.001): void {
  const ctx = sh.ctx;
  const src = ctx.createBufferSource();
  src.buffer = sh.noise;
  src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = hz;
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(peak, t0 + attack);
  g.gain.setTargetAtTime(0, t0 + attack, decayTau);
  src.connect(f);
  f.connect(g);
  g.connect(dest);
  // a different stretch of the noise table each time, so repeated clicks are not identical
  burstCounter = (burstCounter + 1) % 97;
  src.start(t0, (burstCounter * 0.0371) % 3.5);
  src.stop(t0 + attack + decayTau * 9);
}

/** A soft bell-like note: a sine with a few quieter, faster-fading overtones. */
function bell(ctx: BaseAudioContext, dest: AudioNode, hz: number, t0: number, peak: number, decayTau: number): void {
  tone(ctx, dest, "sine", hz, hz, t0, peak, decayTau, 0.006);
  tone(ctx, dest, "sine", hz * 2, hz * 2, t0, peak * 0.3, decayTau * 0.6, 0.006);
  tone(ctx, dest, "sine", hz * 3.01, hz * 3.01, t0, peak * 0.12, decayTau * 0.35, 0.006);
}

/**
 * Play one sound at audio time `t0`. `intensity` scales the loudness (touchdown: 0.25 soft … 1.6
 * hard); `detail` is the tyre chirp amount for a touchdown (0..1). Returns roughly how long it lasts, seconds.
 */
export function playOneShot(sh: Shared, dest: AudioNode, id: OneShotId, t0: number, intensity = 1, detail = 1): number {
  const ctx = sh.ctx;
  const k = Math.max(0, intensity);
  switch (id) {
    case "click": // an on-screen button
      burst(sh, dest, "bandpass", 2400, 1.2, t0, 0.5 * k, 0.005);
      tone(ctx, dest, "sine", 1500, 1100, t0, 0.1 * k, 0.008, 0.001);
      return 0.08;
    case "switch": // a toggle switch: a sharp snap, a small body thump and a quieter bounce
      burst(sh, dest, "bandpass", 3200, 1.5, t0, 0.7 * k, 0.004);
      tone(ctx, dest, "sine", 190, 110, t0, 0.3 * k, 0.012, 0.001);
      burst(sh, dest, "bandpass", 2300, 1.2, t0 + 0.022, 0.3 * k, 0.005);
      return 0.12;
    case "knob": // one detent of a rotary knob
      burst(sh, dest, "bandpass", 4200, 2, t0, 0.35 * k, 0.003);
      tone(ctx, dest, "sine", 700, 500, t0, 0.07 * k, 0.006, 0.001);
      return 0.06;
    case "chime": // a message arrived
      bell(ctx, dest, 880, t0, 0.2 * k, 0.3);
      return 1.6;
    case "success": {
      // a rising major chord, one note after another
      const notes = [523.25, 659.25, 783.99, 1046.5];
      notes.forEach((hz, i) => bell(ctx, dest, hz, t0 + i * 0.11, 0.15 * k, i === notes.length - 1 ? 0.34 : 0.16));
      return 2.2;
    }
    case "fail": {
      // two soft falling notes (a minor third) — "not this time", not a buzzer
      const notes = [392.0, 329.63];
      notes.forEach((hz, i) => {
        tone(ctx, dest, "sine", hz, hz, t0 + i * 0.2, 0.2 * k, i === 1 ? 0.3 : 0.14, 0.01);
        tone(ctx, dest, "triangle", hz, hz, t0 + i * 0.2, 0.06 * k, i === 1 ? 0.2 : 0.1, 0.01);
      });
      return 2;
    }
    case "flap": // the flap lever dropping into a detent
      burst(sh, dest, "bandpass", 1500, 1, t0, 0.55 * k, 0.006);
      tone(ctx, dest, "sine", 150, 90, t0, 0.35 * k, 0.02, 0.002);
      burst(sh, dest, "bandpass", 2000, 1.2, t0 + 0.05, 0.25 * k, 0.005);
      return 0.25;
    case "touchdown": {
      // main wheels: a low thump, then the tyres chirp as they spin up (two wheels, a moment apart)
      tone(ctx, dest, "sine", 95, 42, t0, 0.45 * k, 0.07, 0.004);
      burst(sh, dest, "lowpass", 220, 0.7, t0, 1.6 * k, 0.05, 0.003);
      const chirp = Math.max(0, Math.min(1, detail)) * Math.min(1.3, 0.5 + 0.5 * k);
      if (chirp > 0.01) {
        for (const [dt, a] of [
          [0.008, 1],
          [0.07, 0.6],
        ] as const) {
          burst(sh, dest, "bandpass", 1900, 3, t0 + dt, 0.8 * chirp * a, 0.04, 0.006);
          tone(ctx, dest, "sawtooth", 1350, 950, t0 + dt, 0.035 * chirp * a, 0.04, 0.006);
        }
      }
      return 0.7;
    }
    case "crash": // a heavy thud, a crunch, and a few bits settling
      tone(ctx, dest, "sine", 70, 28, t0, 0.9 * k, 0.25, 0.004);
      burst(sh, dest, "lowpass", 500, 0.7, t0, 2.2 * k, 0.16, 0.003);
      burst(sh, dest, "bandpass", 2500, 0.7, t0, 0.5 * k, 0.07, 0.002);
      burst(sh, dest, "bandpass", 1200, 1, t0 + 0.16, 0.35 * k, 0.05);
      burst(sh, dest, "bandpass", 3000, 1.5, t0 + 0.33, 0.2 * k, 0.04);
      burst(sh, dest, "bandpass", 900, 1, t0 + 0.55, 0.15 * k, 0.06);
      return 2.5;
    case "catch": // the engine firing for the first time: a couple of hearty coughs
      burst(sh, dest, "lowpass", 350, 0.8, t0, 1.2 * k, 0.03, 0.003);
      tone(ctx, dest, "sine", 80, 50, t0, 0.3 * k, 0.05, 0.004);
      burst(sh, dest, "lowpass", 420, 0.8, t0 + 0.09, 0.9 * k, 0.03, 0.003);
      return 0.5;
  }
}
