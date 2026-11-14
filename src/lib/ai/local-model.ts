/**
 * On-device AI engine (shared by every AI feature).
 *
 * The model runs inside a Web Worker with WebLLM on the visitor's GPU (WebGPU). Model files
 * download once, only after the user explicitly turns the AI on, and are cached by the browser.
 * Nothing is sent to a server. When the model is off, unsupported or busy, callers fall back to
 * their scripted / rubric logic, so every feature keeps working.
 */
import { useSyncExternalStore } from "react";
import type { WebWorkerMLCEngine } from "@mlc-ai/web-llm";
import { MODEL_ID } from "./local-model-id";
import { localModelError } from "./model-cache";

export type LocalModelStatus = "off" | "unsupported" | "loading" | "ready" | "thinking" | "error";

export interface LocalModelState {
  status: LocalModelStatus;
  /** 0..1 while downloading / initialising */
  progress: number;
  message: string;
}

const INITIAL: LocalModelState = { status: "off", progress: 0, message: "" };

/**
 * WebLLM only ever runs in the browser. `import.meta.env.SSR` is a build-time constant, so the
 * server bundle never includes the (large) WebLLM library or the model worker.
 */
const loadWebLlm = (): Promise<typeof import("@mlc-ai/web-llm")> =>
  import.meta.env.SSR
    ? Promise.reject(new Error("On-device AI runs in the browser only."))
    : import("@mlc-ai/web-llm");

const createModelWorker = (): Worker => {
  if (import.meta.env.SSR) throw new Error("On-device AI runs in the browser only.");
  return new Worker(new URL("./model.worker.ts", import.meta.url), { type: "module" });
};

let state: LocalModelState = INITIAL;
const listeners = new Set<() => void>();
let worker: Worker | null = null;
let engine: WebWorkerMLCEngine | null = null;
let loading: Promise<boolean> | null = null;
let generation = 0;
/** Serialises requests: the engine answers one prompt at a time. */
let queue: Promise<unknown> = Promise.resolve();

function set(patch: Partial<LocalModelState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

export function getLocalModelState(): LocalModelState {
  return state;
}

export function subscribeLocalModel(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** React hook: live on-device model status. */
export function useLocalModel(): LocalModelState {
  return useSyncExternalStore(subscribeLocalModel, getLocalModelState, () => INITIAL);
}

export function webGpuAvailable(): boolean {
  return typeof navigator !== "undefined" && "gpu" in navigator;
}

/** True when the model files are already in this browser's cache (no download needed). */
export async function isModelCached(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  try {
    const { hasModelInCache } = await loadWebLlm();
    return await hasModelInCache(MODEL_ID);
  } catch {
    return false;
  }
}

function dispose() {
  generation++;
  worker?.terminate();
  worker = null;
  engine = null;
  loading = null;
}

/** Stop the model and free GPU memory. */
export function stopLocalModel() {
  dispose();
  set({ status: "off", progress: 0, message: "" });
}

/** Download (first time) and start the on-device model. Resolves true when ready. */
export function loadLocalModel(): Promise<boolean> {
  if (engine) return Promise.resolve(true);
  if (loading) return loading;
  if (typeof window === "undefined") return Promise.resolve(false);
  if (!webGpuAvailable()) {
    set({
      status: "unsupported",
      progress: 0,
      message:
        "On-device AI needs WebGPU, available in recent Chrome and Edge on desktop. Everything else works in scripted mode.",
    });
    return Promise.resolve(false);
  }
  const run = ++generation;
  set({ status: "loading", progress: 0, message: "Preparing the on-device model…" });
  loading = (async () => {
    try {
      const { CreateWebWorkerMLCEngine } = await loadWebLlm();
      if (run !== generation) return false;
      worker = createModelWorker();
      const loaded = await CreateWebWorkerMLCEngine(worker, MODEL_ID, {
        initProgressCallback: (report) => {
          if (run === generation) set({ progress: report.progress, message: report.text });
        },
      });
      if (run !== generation) return false;
      engine = loaded;
      set({ status: "ready", progress: 1, message: "Running on this device" });
      return true;
    } catch (error) {
      if (run === generation) {
        dispose();
        set({
          status: "error",
          progress: 0,
          message: localModelError(
            error,
            "The on-device AI couldn't start on this device. Everything else works in scripted mode.",
          ),
        });
      }
      return false;
    } finally {
      if (run === generation) loading = null;
    }
  })();
  return loading;
}

export interface LocalChatRequest {
  system: string;
  messages: { role: "user" | "assistant"; content: string }[];
  temperature?: number;
  json?: boolean;
  maxTokens?: number;
  timeoutMs?: number;
}

/** Run one chat completion on the on-device model. Throws a readable Error on failure. */
export function localChat(req: LocalChatRequest): Promise<string> {
  const job = queue.then(async () => {
    if (!engine) throw new Error("The on-device AI is not running.");
    const current = engine;
    const run = generation;
    set({ status: "thinking", message: "Thinking on this device…" });
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const response = await Promise.race([
        current.chat.completions.create({
          messages: [{ role: "system", content: req.system }, ...req.messages],
          temperature: req.temperature ?? 0.4,
          max_tokens: req.maxTokens ?? (req.json ? 500 : 700),
          ...(req.json ? { response_format: { type: "json_object" as const } } : {}),
        }),
        new Promise<never>((_r, reject) => {
          timer = setTimeout(() => {
            // A stuck generation blocks the queue; interrupt it.
            void current.interruptGenerate();
            reject(new Error("The on-device AI took too long to answer."));
          }, req.timeoutMs ?? 90_000);
        }),
      ]);
      const text = response.choices[0]?.message.content ?? "";
      return text.trim();
    } catch (error) {
      throw new Error(localModelError(error, "The on-device AI couldn't answer."));
    } finally {
      clearTimeout(timer);
      if (run === generation && engine) set({ status: "ready", message: "Running on this device" });
    }
  });
  queue = job.catch(() => undefined);
  return job;
}

export function localModelReady(): boolean {
  return !!engine;
}
