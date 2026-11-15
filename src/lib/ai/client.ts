/**
 * Client entry point used by AI ATC, the AI Instructor and the Oral Examiner.
 *
 * ALL AI ON SKYREADY IS LOCAL — nothing is sent to a cloud AI service and no API keys exist.
 *
 * Contract (do not change the signatures — several features depend on them):
 *   aiChat(req)      -> { ok: true, text, provider } | { ok: false, reason }
 *   getAiStatus()    -> which local provider is active
 *
 * When ok === false, callers MUST fall back to their scripted/rubric logic, so every feature
 * works without any AI.
 *
 * Providers (Settings → AI, `settings.ai.provider`):
 *   "on-device"     model runs in this browser on the GPU via WebLLM (default; explicit one-time download)
 *   "local-browser" the user's own OpenAI-compatible server on their computer (e.g. Ollama), no key
 *   "scripted"      never calls a model
 */
import { actions, getState } from "@/lib/store";
import { guardedSystem, stripReasoning } from "./guardrails";
import {
  getLocalModelState,
  isModelCached,
  loadLocalModel,
  localChat,
  localModelReady,
  webGpuAvailable,
  type LocalModelStatus,
} from "./local-model";

export type AiService = "atc" | "instructor" | "oral" | "scenario" | "evaluate";

export interface AiMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AiChatRequest {
  service: AiService;
  system: string;
  messages: AiMessage[];
  temperature?: number;
  /** Ask the model for strict JSON output (callers still validate). */
  json?: boolean;
}

export type AiChatResult =
  { ok: true; text: string; provider: string } | { ok: false; reason: string };

export interface AiStatus {
  /** On-device (WebLLM) model state */
  onDevice: LocalModelStatus;
  /** Browser supports WebGPU */
  webgpu: boolean;
  /** User's own local model server reachable (only checked when selected) */
  localBrowser: boolean;
  active: "on-device" | "local-browser" | "scripted";
}

export const AI_PROVIDER_LABEL: Record<string, string> = {
  "on-device": "On-device AI",
  "local-browser": "Your local model server",
  scripted: "Scripted training mode",
};

const CLIENT_TIMEOUT_MS = 30_000;
const PROBE_TTL_MS = 5 * 60_000;

function aiSettings() {
  return getState().settings.ai;
}

function withTimeout<T>(p: (signal: AbortSignal) => Promise<T>, ms: number): Promise<T> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  return p(ctrl.signal).finally(() => clearTimeout(t));
}

function trimMessages(messages: AiMessage[], max = 40, chars = 8000): AiMessage[] {
  return messages
    .filter((m) => m.content.trim())
    .map((m) => ({ role: m.role, content: m.content.slice(0, chars) }))
    .slice(-max);
}

// ---------- on-device (WebLLM) ----------

/** Turn the on-device AI on (downloads once, then cached) and remember the choice. */
export async function enableOnDeviceAi(): Promise<boolean> {
  const ok = await loadLocalModel();
  if (ok && !aiSettings().onDeviceEnabled)
    actions.updateSettings((s) => ({ ...s, ai: { ...s.ai, onDeviceEnabled: true } }));
  return ok;
}

let autoStartTried = false;

/** If the user enabled on-device AI before and the files are cached, start it quietly. */
export async function autoStartOnDeviceAi(): Promise<void> {
  const ai = aiSettings();
  if (autoStartTried || ai.provider !== "on-device" || !ai.onDeviceEnabled || localModelReady())
    return;
  autoStartTried = true;
  if (webGpuAvailable() && (await isModelCached())) await loadLocalModel();
}

async function onDeviceChat(req: AiChatRequest): Promise<AiChatResult> {
  if (!localModelReady()) {
    const st = getLocalModelState().status;
    if (st === "loading")
      return {
        ok: false,
        reason: "The on-device AI is still loading — scripted mode is answering for now.",
      };
    if (aiSettings().onDeviceEnabled && webGpuAvailable() && (await isModelCached())) {
      if (!(await loadLocalModel()))
        return {
          ok: false,
          reason: getLocalModelState().message || "The on-device AI couldn't start.",
        };
    } else {
      return {
        ok: false,
        reason: webGpuAvailable()
          ? "On-device AI is off — turn it on to use AI. Scripted mode is answering."
          : "This browser doesn't support WebGPU, so on-device AI can't run here. Scripted mode is answering.",
      };
    }
  }
  try {
    // Small on-device models have short context windows: keep the prompt compact.
    const text = await localChat({
      system: guardedSystem(req.service, req.system.slice(0, 6000), req.json),
      messages: trimMessages(req.messages, 12, 2000),
      temperature: req.temperature ?? 0.4,
      json: !!req.json,
      timeoutMs: 90_000,
    });
    const clean = stripReasoning(text);
    if (!clean) return { ok: false, reason: "The on-device AI returned an empty answer." };
    return { ok: true, text: clean, provider: "on-device" };
  } catch (e) {
    return {
      ok: false,
      reason: e instanceof Error ? e.message : "The on-device AI couldn't answer.",
    };
  }
}

// ---------- user's own local model server (e.g. Ollama) ----------

let probe: { at: number; url: string; ok: boolean } | null = null;

function browserBase(url: string) {
  return url.trim().replace(/\/+$/, "");
}

async function probeBrowser(url: string): Promise<boolean> {
  if (typeof window === "undefined" || !/^https?:\/\//i.test(url.trim())) return false;
  const base = browserBase(url);
  if (probe && probe.url === base && Date.now() - probe.at < PROBE_TTL_MS) return probe.ok;
  let ok = false;
  try {
    const res = await withTimeout((signal) => fetch(`${base}/models`, { signal }), 2500);
    ok = res.ok;
  } catch {
    ok = false;
  }
  probe = { at: Date.now(), url: base, ok };
  return ok;
}

async function browserChat(req: AiChatRequest, url: string, model: string): Promise<AiChatResult> {
  if (typeof window === "undefined")
    return { ok: false, reason: "Your local model server is only reachable from the browser." };
  if (!/^https?:\/\//i.test(url.trim()))
    return {
      ok: false,
      reason: "Set a valid local model URL in Settings (e.g. http://localhost:11434/v1).",
    };
  const base = browserBase(url);
  const body: Record<string, unknown> = {
    model: model || "llama3.1",
    messages: [
      { role: "system", content: guardedSystem(req.service, req.system, req.json) },
      ...trimMessages(req.messages),
    ],
    temperature: req.temperature ?? 0.4,
    stream: false,
  };
  if (req.json) body["response_format"] = { type: "json_object" };
  try {
    const post = (payload: Record<string, unknown>) =>
      withTimeout(
        (signal) =>
          fetch(`${base}/chat/completions`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
            signal,
          }),
        CLIENT_TIMEOUT_MS,
      );
    let res = await post(body);
    if (res.status === 400 && req.json) {
      const { response_format: _rf, ...rest } = body;
      res = await post(rest);
    }
    if (!res.ok)
      return {
        ok: false,
        reason: `Your local model server returned HTTP ${res.status}. Check the model name in Settings.`,
      };
    const data = (await res.json()) as { choices?: { message?: { content?: unknown } }[] };
    const content = data.choices?.[0]?.message?.content;
    const text = typeof content === "string" ? stripReasoning(content) : "";
    if (!text) return { ok: false, reason: "Your local model returned an empty response." };
    probe = { at: Date.now(), url: base, ok: true };
    return { ok: true, text, provider: "local-browser" };
  } catch (e) {
    probe = { at: Date.now(), url: base, ok: false };
    const aborted = e instanceof Error && e.name === "AbortError";
    return {
      ok: false,
      reason: aborted
        ? "Your local model timed out."
        : "Couldn't reach your local model server. Is it running, and does it allow this site (CORS)? For Ollama set OLLAMA_ORIGINS to include this site's address.",
    };
  }
}

// ---------- public API ----------

export async function aiChat(req: AiChatRequest): Promise<AiChatResult> {
  if (!req.messages.length) return { ok: false, reason: "Nothing to send." };
  const ai = aiSettings();
  switch (ai.provider) {
    case "scripted":
      return { ok: false, reason: "Scripted training mode is selected in Settings." };
    case "local-browser":
      return browserChat(req, ai.localBrowserUrl, ai.localBrowserModel);
    case "on-device":
    default:
      return onDeviceChat(req);
  }
}

export async function getAiStatus(): Promise<AiStatus> {
  const ai = aiSettings();
  const onDevice = getLocalModelState().status;
  const webgpu = webGpuAvailable();
  const localBrowser =
    ai.provider === "local-browser" ? await probeBrowser(ai.localBrowserUrl) : false;
  let active: AiStatus["active"] = "scripted";
  if (ai.provider === "on-device" && localModelReady()) active = "on-device";
  if (ai.provider === "local-browser" && localBrowser) active = "local-browser";
  return { onDevice, webgpu, localBrowser, active };
}

/** Forget the cached reachability check for the user's own local model server. */
export function clearAiStatusCache() {
  probe = null;
}
