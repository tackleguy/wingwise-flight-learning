/**
 * Browser speech for the simulated radio.
 *
 *  - Text-to-speech (controller voice) via the Web Speech API `speechSynthesis`, spoken in
 *    short radio-style chunks with a squelch click before/after.
 *  - Speech-to-text (pilot push-to-talk) via `SpeechRecognition` / `webkitSpeechRecognition`.
 *
 * Everything is feature-detected and SSR-safe: call these only from effects/event handlers.
 */
import { useEffect, useState } from "react";

// ---------- minimal SpeechRecognition typings (not in lib.dom) ----------

interface SpeechRecognitionAlternativeLike {
  transcript: string;
  confidence: number;
}
interface SpeechRecognitionResultLike {
  isFinal: boolean;
  length: number;
  [index: number]: SpeechRecognitionAlternativeLike;
}
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: { length: number; [index: number]: SpeechRecognitionResultLike };
}
interface SpeechRecognitionErrorEventLike {
  error: string;
}
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function recognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export interface SpeechSupport {
  tts: boolean;
  stt: boolean;
}

export function speechSupport(): SpeechSupport {
  if (typeof window === "undefined") return { tts: false, stt: false };
  return {
    tts: "speechSynthesis" in window && typeof SpeechSynthesisUtterance !== "undefined",
    stt: !!recognitionCtor(),
  };
}

/** React hook — false during SSR, real values after mount. */
export function useSpeechSupport(): SpeechSupport {
  const [s, setS] = useState<SpeechSupport>({ tts: false, stt: false });
  useEffect(() => setS(speechSupport()), []);
  return s;
}

export function useVoices(): SpeechSynthesisVoice[] {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  useEffect(() => {
    if (!speechSupport().tts) return;
    const load = () =>
      setVoices(
        window.speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith("en")),
      );
    load();
    window.speechSynthesis.addEventListener("voiceschanged", load);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", load);
  }, []);
  return voices;
}

// ---------- squelch / radio click ----------

let audioCtx: AudioContext | null = null;

export function playSquelch(volume = 0.5, ms = 90) {
  if (typeof window === "undefined" || volume <= 0) return;
  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    audioCtx = audioCtx ?? new Ctor();
    const ctx = audioCtx;
    if (ctx.state === "suspended") void ctx.resume();
    const len = Math.floor((ctx.sampleRate * ms) / 1000);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 1800;
    filter.Q.value = 0.7;
    const gain = ctx.createGain();
    gain.gain.value = 0.08 * volume;
    src.connect(filter).connect(gain).connect(ctx.destination);
    src.start();
  } catch {
    /* audio blocked — ignore */
  }
}

// ---------- TTS ----------

export interface SpeakOptions {
  rate?: number;
  volume?: number;
  voiceName?: string;
  pitch?: number;
  /** Squelch clicks around the transmission. */
  radio?: boolean;
  signal?: AbortSignal;
}

/** Rough duration estimate (ms) for timing when TTS is unavailable or muted. */
export function estimateSpeechMs(text: string, rate = 1): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(900, Math.round(((words / 2.9) * 1000) / Math.max(0.5, rate)));
}

export function stopSpeaking() {
  if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
}

function pickVoice(name?: string): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis.getVoices();
  if (name) {
    const v = voices.find((x) => x.name === name);
    if (v) return v;
  }
  return (
    voices.find((v) => /en-US/i.test(v.lang)) ??
    voices.find((v) => v.lang.toLowerCase().startsWith("en"))
  );
}

/**
 * Speak a transmission. Resolves when finished (or aborted). Never rejects.
 * Text is split at commas/periods so the delivery has radio-like pacing.
 */
export function speak(text: string, o: SpeakOptions = {}): Promise<void> {
  return new Promise((resolve) => {
    if (!speechSupport().tts || (o.volume ?? 1) <= 0) {
      const t = setTimeout(resolve, estimateSpeechMs(text, o.rate));
      o.signal?.addEventListener("abort", () => {
        clearTimeout(t);
        resolve();
      });
      return;
    }
    const synth = window.speechSynthesis;
    const chunks = text
      .split(/(?<=[,.;:])\s+/)
      .map((c) => c.trim())
      .filter(Boolean);
    const voice = pickVoice(o.voiceName);
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(safety);
      if (o.radio) playSquelch(o.volume ?? 0.8, 70);
      resolve();
    };
    // Some browsers never fire onend — guarantee resolution.
    const safety = setTimeout(finish, estimateSpeechMs(text, o.rate) * 1.8 + 2500);
    o.signal?.addEventListener("abort", () => {
      synth.cancel();
      finish();
    });
    if (o.radio) playSquelch(o.volume ?? 0.8, 90);
    chunks.forEach((chunk, i) => {
      const u = new SpeechSynthesisUtterance(chunk);
      u.rate = Math.max(0.5, Math.min(2, o.rate ?? 1));
      u.volume = Math.max(0, Math.min(1, o.volume ?? 1));
      u.pitch = o.pitch ?? 1;
      u.lang = "en-US";
      if (voice) u.voice = voice;
      if (i === chunks.length - 1) {
        u.onend = finish;
        u.onerror = finish;
      }
      synth.speak(u);
    });
    if (!chunks.length) finish();
  });
}

// ---------- STT ----------

export interface Recognizer {
  start(): void;
  /** Stop listening; the final transcript is delivered via onFinal. */
  stop(): void;
  abort(): void;
}

export interface RecognizerHandlers {
  onPartial?: (text: string) => void;
  onFinal: (text: string) => void;
  onError?: (message: string) => void;
}

export function createRecognizer(h: RecognizerHandlers): Recognizer | null {
  const Ctor = recognitionCtor();
  if (!Ctor) return null;
  const rec = new Ctor();
  rec.lang = "en-US";
  rec.continuous = true;
  rec.interimResults = true;
  rec.maxAlternatives = 1;
  let finalText = "";
  let interim = "";
  let stopped = false;
  let delivered = false;
  rec.onresult = (e) => {
    interim = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (!r) continue;
      const t = r[0]?.transcript ?? "";
      if (r.isFinal) finalText += `${t} `;
      else interim += t;
    }
    h.onPartial?.(`${finalText}${interim}`.trim());
  };
  rec.onerror = (e) => {
    const msg =
      e.error === "not-allowed" || e.error === "service-not-allowed"
        ? "Microphone permission was denied. Allow mic access in your browser, or type your transmission."
        : e.error === "no-speech"
          ? "No speech detected — hold the PTT and speak clearly."
          : e.error === "network"
            ? "Speech recognition needs a network connection in this browser."
            : e.error === "aborted"
              ? ""
              : `Speech recognition error: ${e.error}`;
    if (msg) h.onError?.(msg);
  };
  rec.onend = () => {
    if (delivered) return;
    delivered = true;
    if (stopped) h.onFinal(`${finalText}${interim}`.trim());
  };
  return {
    start() {
      finalText = "";
      interim = "";
      stopped = false;
      delivered = false;
      try {
        rec.start();
      } catch {
        h.onError?.("Speech recognition is already running — release the PTT and try again.");
      }
    },
    stop() {
      stopped = true;
      try {
        rec.stop();
      } catch {
        /* ignore */
      }
    },
    abort() {
      stopped = false;
      delivered = true;
      try {
        rec.abort();
      } catch {
        /* ignore */
      }
    },
  };
}
