/**
 * Plays radio traffic in order: waits a natural delay, shows the line in the transcript,
 * speaks it (or simulates air time when speech is off), and tracks whether the frequency is
 * busy (so a pilot keying the mic mid-transmission is "stepping on" someone).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { RadioLine } from "./types";
import { estimateSpeechMs, speak, stopSpeaking } from "./speech";

export type QueueItem =
  | { kind: "atc" | "traffic"; station: string; text: string; spoken?: string; delayMs?: number; pitch?: number; mhz?: number }
  | { kind: "system"; text: string; tone?: RadioLine["tone"] }
  | { kind: "call"; fn: () => void };

export interface RadioQueueOptions {
  speech: boolean;
  rate: number;
  volume: number;
  voiceName: string;
}

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    if (signal.aborted) return resolve();
    const t = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(t);
      resolve();
    });
  });

let lineSeq = 0;
const lineId = () => `l${Date.now().toString(36)}${(lineSeq++).toString(36)}`;

export function useRadioQueue(opts: RadioQueueOptions) {
  const [lines, setLines] = useState<RadioLine[]>([]);
  const linesRef = useRef<RadioLine[]>([]);
  const [receiving, setReceiving] = useState<{ station: string; from: "atc" | "traffic" } | null>(null);
  const [active, setActive] = useState(false);
  const queue = useRef<QueueItem[]>([]);
  const running = useRef(false);
  const gen = useRef(0);
  const startedAt = useRef<number>(0);
  const lastAtcEnd = useRef<number | null>(null);
  const transmitting = useRef(false);
  const abort = useRef<AbortController>(new AbortController());
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const append = useCallback((l: Omit<RadioLine, "id" | "t">) => {
    if (!startedAt.current) startedAt.current = Date.now();
    const line: RadioLine = { ...l, id: lineId(), t: Date.now() - startedAt.current };
    linesRef.current = [...linesRef.current, line];
    setLines(linesRef.current);
  }, []);

  const run = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    setActive(true);
    const g = gen.current;
    const signal = abort.current.signal;
    while (queue.current.length && g === gen.current) {
      const it = queue.current.shift();
      if (!it) break;
      if (it.kind === "call") {
        it.fn();
        continue;
      }
      if (it.kind === "system") {
        append({ from: "system", text: it.text, ...(it.tone ? { tone: it.tone } : {}) });
        continue;
      }
      if (it.delayMs) await sleep(it.delayMs, signal);
      if (g !== gen.current) break;
      transmitting.current = true;
      setReceiving({ station: it.station, from: it.kind });
      append({ from: it.kind, station: it.station, text: it.text, ...(it.mhz ? { mhz: it.mhz } : {}) });
      const o = optsRef.current;
      if (o.speech && o.volume > 0) {
        await speak(it.spoken ?? it.text, {
          rate: o.rate * (it.kind === "traffic" ? 1.12 : 1),
          volume: o.volume,
          voiceName: o.voiceName,
          pitch: it.pitch ?? 1,
          radio: true,
          signal,
        });
      } else {
        await sleep(Math.round(estimateSpeechMs(it.text, o.rate) * 0.55), signal);
      }
      transmitting.current = false;
      setReceiving(null);
      if (it.kind === "atc") lastAtcEnd.current = Date.now();
      await sleep(200, signal);
    }
    running.current = false;
    if (g === gen.current) setActive(false);
  }, [append]);

  const push = useCallback(
    (items: QueueItem[]) => {
      queue.current.push(...items);
      void run();
    },
    [run],
  );

  const addPilot = useCallback((text: string, station?: string, mhz?: number) => append({ from: "pilot", text, ...(station ? { station } : {}), ...(mhz ? { mhz } : {}) }), [append]);
  const addSystem = useCallback((text: string, tone?: RadioLine["tone"]) => append({ from: "system", text, ...(tone ? { tone } : {}) }), [append]);

  const reset = useCallback(() => {
    gen.current += 1;
    abort.current.abort();
    abort.current = new AbortController();
    queue.current = [];
    running.current = false;
    transmitting.current = false;
    lastAtcEnd.current = null;
    startedAt.current = Date.now();
    stopSpeaking();
    linesRef.current = [];
    setLines([]);
    setReceiving(null);
    setActive(false);
  }, []);

  /** Stop audio and pending transmissions but keep the transcript. */
  const halt = useCallback(() => {
    gen.current += 1;
    abort.current.abort();
    abort.current = new AbortController();
    queue.current = [];
    running.current = false;
    transmitting.current = false;
    stopSpeaking();
    setReceiving(null);
    setActive(false);
  }, []);

  useEffect(
    () => () => {
      gen.current += 1;
      abort.current.abort();
      stopSpeaking();
    },
    [],
  );

  return {
    lines,
    receiving,
    /** Queue still has pending items (ATC about to reply). */
    active,
    push,
    addPilot,
    addSystem,
    reset,
    halt,
    /** True while ATC or other traffic is transmitting right now. */
    isBusy: () => transmitting.current,
    /** Epoch ms when the last ATC transmission ended (null if none yet). */
    lastAtcEnd: () => lastAtcEnd.current,
    startedAt: () => startedAt.current,
    /** Synchronous snapshot of the transcript (includes lines not yet rendered). */
    getLines: () => linesRef.current,
  };
}
