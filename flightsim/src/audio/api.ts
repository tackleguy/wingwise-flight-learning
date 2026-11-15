/**
 * Audio module — public contract: every sound of the simulator and the instructor's voice.
 *
 *   const audio = sim.use(createAudio());
 *   startButton.onclick = () => audio.unlock();     // browsers only allow sound after a click / key / tap
 *   audio.play("switch");
 *   audio.say("Check your airspeed.");
 *
 * All sound is made up on the spot with the Web Audio API (no recordings, no audio files), and
 * the voice is the browser's own speech synthesis. The sounds are approximations for learning —
 * do not judge a real engine by them.
 */
import type { SimModule } from "@/core/sim";
import type { EngineSoundParams, WindSoundParams } from "./model";

export type SoundId = "click" | "switch" | "knob" | "chime" | "success" | "fail" | "flap" | "touchdown";

export interface AudioApi extends SimModule {
  readonly name: "audio";
  /** Must be called from a user gesture (browsers block audio until then). Safe to call repeatedly. */
  unlock(): void;
  readonly unlocked: boolean;
  setMuted(muted: boolean): void;
  readonly muted: boolean;
  /** One-shot sound effects. */
  play(id: SoundId): void;
  /** Speak a sentence in the instructor's voice (queued; priority interrupts). Respects sim.settings.speech. */
  say(text: string, opts?: { priority?: boolean }): void;
  stopSpeech(): void;
  /** Play / stop the Morse identifier of the station tuned on NAV1 or NAV2 (the 'ident' button on the radio). */
  setIdent(radio: "nav1" | "nav2", on: boolean): void;
}

/** Options for `createAudio` (all optional). */
export interface AudioOptions {
  /**
   * Default true: the module listens for the first click / key press / touch on the page and calls
   * `unlock()` itself, so sound starts even if nothing else calls it. Set false to control it yourself.
   */
  autoUnlock?: boolean;
}

/** A voice the browser offers for the instructor (for a settings menu). */
export interface VoiceInfo {
  name: string;
  /** Language tag, e.g. "en-US". */
  lang: string;
  /** True for the voice currently used. */
  selected: boolean;
}

/** Values a developer page may force instead of reading them from the simulator (null/undefined = use the simulator). */
export interface AudioOverride {
  rpm?: number;
  running?: boolean;
  cranking?: boolean;
  powerHp?: number;
  manifoldInHg?: number;
  kcas?: number;
  flapsDeg?: number;
  betaDeg?: number;
  onGround?: boolean;
  gsKt?: number;
  carbIce?: number;
  engineFailing?: boolean;
  stallHorn?: boolean;
  alphaDeg?: number;
  flapsMoving?: boolean;
  inside?: boolean;
}

/** What the module is doing right now (developer pages and tests). */
export interface AudioDebugInfo {
  /** State of the browser's audio engine: "none" until `unlock()` created it, or when there is no Web Audio. */
  context: "none" | "suspended" | "running" | "closed" | "interrupted";
  sampleRate: number;
  webAudioAvailable: boolean;
  speechAvailable: boolean;
  voice: string | null;
  speaking: boolean;
  speechPending: number;
  muted: boolean;
  paused: boolean;
  /** 0..1 how much the engine is firing (eased). */
  combustion: number;
  /** 0..1 engine roughness from carburettor ice or a failing engine. */
  distress: number;
  starter: number;
  hornLevel: number;
  flapMotor: boolean;
  rumbleGain: number;
  inside: boolean;
  engine: EngineSoundParams;
  wind: WindSoundParams;
  ident: { nav1: boolean; nav2: boolean };
  /** Peak and RMS of the last ~40 ms of the final output (after the limiter), 0..1; null without an audio engine. */
  meter: { peak: number; rms: number } | null;
  /** One-shot sounds played so far, by name. */
  played: Record<string, number>;
}

/** Extras offered by the TeachX audio module on top of the contract above. */
export interface AudioModule extends AudioApi {
  /** False when the browser has no Web Audio (the module then stays silent and harmless). */
  readonly available: boolean;
  /** False when the browser has no speech synthesis (the instructor then stays silent; messages still show on screen). */
  readonly speechAvailable: boolean;
  /** True while the instructor is speaking. */
  readonly speaking: boolean;
  /** Whether the Morse identifier of a radio is switched on. */
  identOn(radio: "nav1" | "nav2"): boolean;
  /** English voices the browser offers (may be empty at first: browsers load the list a moment after the page). */
  voices(): VoiceInfo[];
  /** Choose the instructor's voice by name (null = let the module pick). Remembered on this device. */
  setVoice(name: string | null): void;
  /** Developer hooks — not for the app. */
  readonly debug: {
    /** Force input values (merged into the current override); null clears everything. */
    override(values: AudioOverride | null): void;
    info(): AudioDebugInfo;
    /** Play an internal one-shot that is normally triggered by the simulator. */
    trigger(id: "crash" | "catch" | "touchdown", intensity?: number): void;
  };
}
