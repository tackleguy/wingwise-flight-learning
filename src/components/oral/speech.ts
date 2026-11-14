/**
 * Browser speech helpers for the oral examiner: Web Speech API recognition (voice answers) and
 * speechSynthesis (examiner voice). Everything is feature-detected and SSR-safe.
 */
import { useCallback, useEffect, useRef, useState } from "react";

interface RecognitionAlternative {
  transcript: string;
}
interface RecognitionResult {
  readonly isFinal: boolean;
  readonly length: number;
  [index: number]: RecognitionAlternative;
}
interface RecognitionEvent {
  readonly resultIndex: number;
  readonly results: { readonly length: number; [index: number]: RecognitionResult };
}
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: RecognitionEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}
type RecognitionCtor = new () => Recognition;

function getRecognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/**
 * Voice input. `onFinal` receives each finalized phrase; `interim` holds the in-progress phrase.
 */
export function useSpeechInput(onFinal: (text: string) => void) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);
  const recRef = useRef<Recognition | null>(null);
  const onFinalRef = useRef(onFinal);
  onFinalRef.current = onFinal;

  useEffect(() => {
    setSupported(!!getRecognitionCtor());
    return () => {
      recRef.current?.abort();
      recRef.current = null;
    };
  }, []);

  const stop = useCallback(() => {
    recRef.current?.stop();
  }, []);

  const start = useCallback(() => {
    const Ctor = getRecognitionCtor();
    if (!Ctor) {
      setSupported(false);
      return;
    }
    setError(null);
    try {
      const rec = new Ctor();
      rec.lang = "en-US";
      rec.continuous = true;
      rec.interimResults = true;
      rec.onresult = (e) => {
        let live = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const r = e.results[i];
          const alt = r?.[0];
          if (!r || !alt) continue;
          if (r.isFinal) onFinalRef.current(alt.transcript.trim());
          else live += alt.transcript;
        }
        setInterim(live);
      };
      rec.onerror = (e) => {
        setError(
          e.error === "not-allowed" || e.error === "service-not-allowed"
            ? "Microphone permission was denied. Allow microphone access in your browser, or type your answer."
            : e.error === "no-speech"
              ? "No speech detected — try again or type your answer."
              : `Voice input error (${e.error}). You can type your answer instead.`,
        );
      };
      rec.onend = () => {
        setListening(false);
        setInterim("");
        recRef.current = null;
      };
      recRef.current = rec;
      rec.start();
      setListening(true);
    } catch {
      setError("Voice input could not start. You can type your answer instead.");
      setListening(false);
    }
  }, []);

  return { supported, listening, interim, error, start, stop };
}

export function speechSynthesisSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "speechSynthesis" in window &&
    typeof SpeechSynthesisUtterance !== "undefined"
  );
}

export function speak(
  text: string,
  opts: { rate?: number; volume?: number; voiceName?: string } = {},
) {
  if (!speechSynthesisSupported()) return;
  const synth = window.speechSynthesis;
  synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.rate = opts.rate ?? 1;
  u.volume = opts.volume ?? 1;
  u.lang = "en-US";
  if (opts.voiceName) {
    const v = synth.getVoices().find((x) => x.name === opts.voiceName);
    if (v) u.voice = v;
  }
  synth.speak(u);
}

export function stopSpeaking() {
  if (speechSynthesisSupported()) window.speechSynthesis.cancel();
}
