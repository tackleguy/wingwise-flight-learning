/**
 * The instructor's voice: a queue in front of the browser's speech synthesis.
 *
 * Rules
 *  - Ordinary lines wait their turn. A line that has waited too long is dropped (coaching such as
 *    "a little more right rudder" is useless ten seconds late), only the newest few are kept, and
 *    the same sentence is not repeated within a few seconds.
 *  - A priority line (a warning) is spoken next and cuts off an ordinary line that is being spoken.
 *    It never cuts off another priority line — that one finishes first.
 *  - pause() freezes the voice (simulator paused); resume() carries on. A line requested WHILE
 *    paused (a debrief, an explanation) replaces whatever was frozen and is spoken straight away.
 *
 * The browser objects are passed in (`SpeechBackend`), so the logic is tested in Node with fakes
 * and everything is silent and harmless where speech synthesis does not exist.
 */

export interface VoiceLike {
  readonly name: string;
  readonly lang: string;
  readonly localService?: boolean;
  readonly default?: boolean;
}

export interface UtteranceLike {
  text: string;
  lang: string;
  rate: number;
  pitch: number;
  volume: number;
  voice: unknown;
  onend: ((ev: unknown) => void) | null;
  onerror: ((ev: unknown) => void) | null;
}

export interface SynthLike {
  speak(utterance: UtteranceLike): void;
  cancel(): void;
  pause(): void;
  resume(): void;
  getVoices(): readonly VoiceLike[];
  addEventListener?(type: "voiceschanged", listener: () => void): void;
  removeEventListener?(type: "voiceschanged", listener: () => void): void;
}

export interface SpeechBackend {
  synth: SynthLike;
  createUtterance(text: string): UtteranceLike;
}

/** The browser's speech synthesis, or null where there is none (Node, old browsers). */
export function browserSpeechBackend(): SpeechBackend | null {
  try {
    const g = globalThis as { speechSynthesis?: SpeechSynthesis; SpeechSynthesisUtterance?: typeof SpeechSynthesisUtterance };
    const synth = g.speechSynthesis;
    const Utterance = g.SpeechSynthesisUtterance;
    if (!synth || typeof Utterance !== "function" || typeof synth.speak !== "function") return null;
    return { synth: synth as unknown as SynthLike, createUtterance: (text) => new Utterance(text) as unknown as UtteranceLike };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- choosing a voice

/** Joke and effect voices some systems ship (mostly macOS), and very robotic ones: never pick these if anything else exists. */
const POOR_VOICES =
  /albert|bad news|bahh|bells|boing|bubbles|cellos|good news|jester|organ|superstar|trinoids|whisper|wobble|zarvox|deranged|hysterical|\bfred\b|junior|ralph|kathy|princess|bruce|agnes|vicki|eddy|flo\b|grandma|grandpa|reed|rocko|sandy|shelley|espeak/i;
/** Voices known to be clear and calm on common systems. */
const GOOD_VOICES = /samantha|\bava\b|allison|susan|zoe|karen|moira|daniel|serena|\bkate\b|aria|jenny|libby|sonia|zira|hazel|siri|\bmark\b|david/i;
const BEST_VOICES = /natural|neural|enhanced|premium/i;

/** Higher = better for a calm, clear instructor. Non-English voices score −Infinity. */
export function voiceScore(v: VoiceLike): number {
  const lang = (v.lang || "").replace("_", "-").toLowerCase();
  if (!lang.startsWith("en")) return -Infinity;
  let score = lang.startsWith("en-us") ? 30 : lang.startsWith("en-gb") ? 28 : /^en-(au|ca|ie|nz)/.test(lang) ? 20 : 15;
  if (BEST_VOICES.test(v.name)) score += 12;
  if (/google/i.test(v.name)) score += 8;
  if (GOOD_VOICES.test(v.name)) score += 6;
  if (v.localService) score += 2; // works offline
  if (v.default) score += 1;
  if (POOR_VOICES.test(v.name)) score -= 40;
  return score;
}

/**
 * Pick the instructor's voice: the one named `preferred` if the browser has it, otherwise the
 * best-scoring English voice (US or British first). Null when there is no English voice — the
 * browser's default voice is then used.
 */
export function pickVoice<V extends VoiceLike>(voices: readonly V[], preferred?: string | null): V | null {
  if (preferred) {
    const exact = voices.find((v) => v.name === preferred);
    if (exact) return exact;
  }
  let best: V | null = null;
  let bestScore = -Infinity;
  for (const v of voices) {
    const s = voiceScore(v);
    if (s > bestScore) {
      best = v;
      bestScore = s;
    }
  }
  return best;
}

// ---------------------------------------------------------------- text helpers

/** Split a long text into sentence-sized pieces (browsers cut off very long utterances). */
export function splitForSpeech(text: string, maxLen = 200): string[] {
  const sentences: string[] = [];
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    const next = text[i + 1];
    // a sentence ends at . ! ? ; followed by a space or the end ("1.5" and "118.30" stay whole)
    if ((ch === "." || ch === "!" || ch === "?" || ch === ";") && (next === undefined || next === " ")) {
      const piece = text.slice(start, i + 1).trim();
      if (piece) sentences.push(piece);
      start = i + 1;
    }
  }
  const rest = text.slice(start).trim();
  if (rest) sentences.push(rest);

  const out: string[] = [];
  const push = (s: string) => {
    // a single over-long sentence: break at commas, then at spaces
    while (s.length > maxLen) {
      let cut = s.lastIndexOf(", ", maxLen);
      if (cut < maxLen * 0.4) cut = s.lastIndexOf(" ", maxLen);
      if (cut <= 0) cut = maxLen;
      out.push(s.slice(0, cut + 1).trim());
      s = s.slice(cut + 1).trim();
    }
    if (s) out.push(s);
  };
  let cur = "";
  for (const s of sentences) {
    if (cur && cur.length + 1 + s.length > maxLen) {
      push(cur);
      cur = s;
    } else cur = cur ? `${cur} ${s}` : s;
  }
  if (cur) push(cur);
  return out;
}

/** Rough speaking time of a text at a speech rate (about 150 words a minute at rate 1), seconds. */
export function estimateSpeechSec(text: string, rate = 1): number {
  const words = text.split(/\s+/).filter(Boolean).length;
  return (0.6 + words * 0.4 + text.length * 0.012) / Math.max(0.3, rate);
}

// ---------------------------------------------------------------- the queue

export interface SayOptions {
  /** Speak next, cutting off an ordinary line. */
  priority?: boolean;
  /** Seconds this line may wait in the queue before it is dropped as out of date. */
  maxWaitSec?: number;
}

export interface SpeechQueueOptions {
  /** Clock, seconds (default: performance.now). */
  now?: () => number;
  /** Speaking speed; 1 = the voice's normal speed. Slightly slower is clearer for instruction. */
  rate?: number;
  pitch?: number;
  lang?: string;
  /** Ordinary lines kept waiting at most (older ones are dropped). */
  maxQueued?: number;
  /** An ordinary line that waited longer than this is dropped, seconds. */
  staleSec?: number;
  /** …and a priority line that waited longer than this, seconds. */
  priorityStaleSec?: number;
  /** The same ordinary sentence is not spoken again sooner than this, seconds. */
  repeatGapSec?: number;
  /** …and the same priority sentence not sooner than this, seconds. */
  priorityRepeatGapSec?: number;
  /** Silence between two lines, seconds. */
  gapSec?: number;
  /** Text clean-up applied just before speaking (units, runway numbers…). */
  prepare?: (text: string) => string;
  preferredVoice?: string | null;
}

interface Item {
  text: string;
  chunks: string[];
  next: number;
  priority: boolean;
  queuedAt: number;
  staleSec: number;
}

interface Current {
  item: Item;
  utterance: UtteranceLike;
  token: number;
  startedAt: number;
  limitSec: number;
}

const defaultNow = (): number => (typeof performance !== "undefined" ? performance.now() : Date.now()) / 1000;
/** Browsers can swallow a speak() that follows a cancel() immediately; wait this long, seconds. */
const CANCEL_SETTLE_SEC = 0.12;

export class SpeechQueue {
  /** Lines dropped because they waited too long / because the queue was full / as repeats (for tests and debugging). */
  readonly stats = { spoken: 0, stale: 0, overflow: 0, repeats: 0, interrupted: 0, timedOut: 0 };
  /** 0..1, applied to every new line. */
  volume = 1;

  private readonly backend: SpeechBackend | null;
  private readonly now: () => number;
  private readonly o: Required<Omit<SpeechQueueOptions, "now" | "prepare" | "preferredVoice">>;
  private readonly prepare: (text: string) => string;
  private queue: Item[] = [];
  private current: Current | null = null;
  private token = 0;
  private notBefore = 0;
  private held = false;
  private heldAt = 0;
  private _enabled = true;
  private readonly recent = new Map<string, number>();
  private preferred: string | null;
  private voiceCache: VoiceLike | null = null;
  private voicesKnown = false;
  private readonly onVoices = () => {
    this.voicesKnown = false;
  };

  constructor(backend: SpeechBackend | null, opts: SpeechQueueOptions = {}) {
    this.backend = backend;
    this.now = opts.now ?? defaultNow;
    this.prepare = opts.prepare ?? ((t) => t);
    this.preferred = opts.preferredVoice ?? null;
    this.o = {
      rate: opts.rate ?? 0.92,
      pitch: opts.pitch ?? 1,
      lang: opts.lang ?? "en-US",
      maxQueued: opts.maxQueued ?? 3,
      staleSec: opts.staleSec ?? 7,
      priorityStaleSec: opts.priorityStaleSec ?? 30,
      repeatGapSec: opts.repeatGapSec ?? 10,
      priorityRepeatGapSec: opts.priorityRepeatGapSec ?? 3,
      gapSec: opts.gapSec ?? 0.3,
    };
    try {
      backend?.synth.addEventListener?.("voiceschanged", this.onVoices);
    } catch {
      /* optional */
    }
  }

  /** False when there is no speech synthesis: everything below then does nothing. */
  get available(): boolean {
    return this.backend !== null;
  }

  get enabled(): boolean {
    return this._enabled;
  }

  /** Switch the voice on or off (settings, mute). Switching off stops and forgets everything. */
  set enabled(on: boolean) {
    if (on === this._enabled) return;
    this._enabled = on;
    if (!on) this.stop();
  }

  /** True while a line is being spoken (not while frozen by pause). */
  get speaking(): boolean {
    return this.current !== null && !this.held;
  }

  /** True while the current line is a priority line. */
  get speakingPriority(): boolean {
    return this.current !== null && this.current.item.priority;
  }

  /** Lines waiting. */
  get pending(): number {
    return this.queue.length;
  }

  get paused(): boolean {
    return this.held;
  }

  /** Queue a line. Returns false when it was not accepted (speech off, empty, or a repeat). */
  say(text: string, opts: SayOptions = {}): boolean {
    const clean = text.replace(/\s+/g, " ").trim();
    if (!clean || !this.backend || !this._enabled) return false;
    const now = this.now();
    const priority = opts.priority === true;

    if (this.current?.item.text === clean || this.queue.some((q) => q.text === clean)) {
      this.stats.repeats++;
      return false;
    }
    const last = this.recent.get(clean);
    if (last !== undefined && now - last < (priority ? this.o.priorityRepeatGapSec : this.o.repeatGapSec)) {
      this.stats.repeats++;
      return false;
    }
    if (this.held) {
      // The simulator is paused and someone asks for a new line: whatever was frozen is out of date.
      this.clear();
      this.held = false;
      try {
        this.backend.synth.resume();
      } catch {
        /* ignore */
      }
    }

    const spoken = this.prepare(clean);
    const chunks = splitForSpeech(spoken);
    if (chunks.length === 0) return false;
    const item: Item = { text: clean, chunks, next: 0, priority, queuedAt: now, staleSec: opts.maxWaitSec ?? (priority ? this.o.priorityStaleSec : this.o.staleSec) };

    if (priority) {
      const cur = this.current;
      if (cur && !cur.item.priority) {
        // cut off the ordinary line (and forget the rest of it)
        this.queue = this.queue.filter((q) => q !== cur.item);
        this.stats.interrupted++;
        this.cancelCurrent();
      }
      let i = 0;
      while (i < this.queue.length && this.queue[i]!.priority) i++;
      this.queue.splice(i, 0, item);
    } else {
      this.queue.push(item);
      let ordinary = 0;
      for (const q of this.queue) if (!q.priority && q.next === 0) ordinary++;
      while (ordinary > this.o.maxQueued) {
        const idx = this.queue.findIndex((q) => !q.priority && q.next === 0);
        if (idx < 0) break;
        this.queue.splice(idx, 1);
        this.stats.overflow++;
        ordinary--;
      }
    }
    this.update();
    return true;
  }

  /** Call regularly (every frame): starts the next line, drops out-of-date ones, recovers from a stuck browser. */
  update(): void {
    const backend = this.backend;
    if (!backend || this.held) return;
    const now = this.now();
    const cur = this.current;
    if (cur) {
      if (now - cur.startedAt <= cur.limitSec) return;
      // The browser never reported the end of the line (a known fault with long lines): move on.
      this.stats.timedOut++;
      this.cancelCurrent();
    }
    if (now < this.notBefore) return;
    for (;;) {
      const head = this.queue[0];
      if (!head) return;
      if (head.next === 0 && now - head.queuedAt > head.staleSec) {
        this.queue.shift();
        this.stats.stale++;
        continue;
      }
      const chunk = head.chunks[head.next++]!;
      if (head.next >= head.chunks.length) this.queue.shift();
      this.start(backend, head, chunk, now);
      return;
    }
  }

  /** Freeze the voice (simulator paused). */
  pause(): void {
    if (this.held || !this.backend) return;
    this.held = true;
    this.heldAt = this.now();
    if (this.current) {
      try {
        this.backend.synth.pause();
      } catch {
        /* ignore */
      }
    }
  }

  /** Carry on after pause(). Waiting lines do not count the paused time as waiting. */
  resume(): void {
    if (!this.held || !this.backend) return;
    this.held = false;
    const waited = this.now() - this.heldAt;
    if (this.current) this.current.startedAt += waited;
    for (const q of this.queue) q.queuedAt += waited;
    try {
      this.backend.synth.resume();
    } catch {
      /* ignore */
    }
    this.update();
  }

  /** Stop talking and forget every waiting line. */
  stop(): void {
    if (!this.backend) return;
    this.clear();
    if (this.held) {
      try {
        this.backend.synth.resume(); // a paused browser voice would otherwise swallow the next line
      } catch {
        /* ignore */
      }
    }
  }

  /** Forget waiting ordinary lines (e.g. after the aircraft was repositioned); priority lines stay. */
  dropOrdinary(): void {
    this.queue = this.queue.filter((q) => q.priority);
    if (this.current && !this.current.item.priority) this.cancelCurrent();
  }

  /** Name of the voice in use (null = the browser's default). */
  get voiceName(): string | null {
    return this.voice()?.name ?? null;
  }

  /** English voices on offer, best first. */
  listVoices(): VoiceLike[] {
    if (!this.backend) return [];
    try {
      return [...this.backend.synth.getVoices()].filter((v) => voiceScore(v) > -Infinity).sort((a, b) => voiceScore(b) - voiceScore(a));
    } catch {
      return [];
    }
  }

  setPreferredVoice(name: string | null): void {
    this.preferred = name;
    this.voicesKnown = false;
  }

  dispose(): void {
    this.stop();
    try {
      this.backend?.synth.removeEventListener?.("voiceschanged", this.onVoices);
    } catch {
      /* optional */
    }
  }

  // ---------------------------------------------------------------- internals

  private voice(): VoiceLike | null {
    if (!this.backend) return null;
    if (!this.voicesKnown) {
      try {
        const voices = this.backend.synth.getVoices();
        // Browsers load the list a moment after the page: keep asking until it is there.
        if (voices.length > 0) {
          this.voiceCache = pickVoice(voices, this.preferred);
          this.voicesKnown = true;
        }
      } catch {
        this.voiceCache = null;
      }
    }
    return this.voiceCache;
  }

  private start(backend: SpeechBackend, item: Item, chunk: string, now: number): void {
    let u: UtteranceLike;
    try {
      u = backend.createUtterance(chunk);
    } catch {
      return;
    }
    const voice = this.voice();
    u.rate = this.o.rate;
    u.pitch = this.o.pitch;
    u.volume = Math.min(1, Math.max(0, this.volume));
    u.lang = voice?.lang || this.o.lang;
    if (voice) u.voice = voice;
    const token = ++this.token;
    const done = () => {
      if (this.current?.token !== token) return; // a line that was cut off reports late: ignore
      this.current = null;
      this.notBefore = this.now() + this.o.gapSec;
    };
    u.onend = done;
    u.onerror = done;
    // Keep a reference to the utterance until it ends: some browsers lose the "end" event otherwise.
    this.current = { item, utterance: u, token, startedAt: now, limitSec: estimateSpeechSec(chunk, this.o.rate) * 1.8 + 4 };
    this.recent.set(item.text, now);
    if (this.recent.size > 40) {
      for (const [k, t] of this.recent) if (now - t > 60) this.recent.delete(k);
    }
    this.stats.spoken++;
    try {
      backend.synth.speak(u);
    } catch {
      this.current = null;
    }
  }

  private cancelCurrent(): void {
    if (this.current) this.notBefore = this.now() + CANCEL_SETTLE_SEC;
    this.current = null;
    this.token++;
    try {
      this.backend?.synth.cancel();
    } catch {
      /* ignore */
    }
  }

  private clear(): void {
    this.queue = [];
    this.cancelCurrent();
  }
}
