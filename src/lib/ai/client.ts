/**
 * Client-side AI entry point used by AI ATC, the AI Instructor and the Oral Examiner.
 *
 * Contract (do not change the signatures — several features depend on them):
 *   aiChat(req)      -> { ok: true, text, provider } | { ok: false, reason }
 *   getAiStatus()    -> which providers are available
 *
 * When ok === false, callers MUST fall back to their scripted/rubric logic, so every feature
 * works without any AI configured.
 *
 * Routing (Settings → AI provider, `settings.ai.provider`):
 *   "scripted"      never calls a model
 *   "cloud"         server → Lovable AI Gateway (LOVABLE_API_KEY stays on the server)
 *   "local-server"  server → OpenAI-compatible endpoint from LOCAL_AI_BASE_URL
 *   "local-browser" browser → the user's own OpenAI-compatible URL (e.g. Ollama on localhost), no key
 *   "auto"          server (cloud, then local-server) → local-browser if reachable → ok:false
 */
import { getState } from "@/lib/store";
import { aiChatFn, aiStatusFn } from "./ai.functions";
import { guardedSystem, stripReasoning } from "./guardrails";

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
  cloud: boolean;
  localServer: boolean;
  localBrowser: boolean;
  active: "cloud" | "local-server" | "local-browser" | "scripted";
}

export const AI_PROVIDER_LABEL: Record<string, string> = {
  cloud: "Lovable AI (cloud)",
  "local-server": "Local model (server)",
  "local-browser": "Local model (this browser)",
  scripted: "Scripted training mode",
};

const CLIENT_TIMEOUT_MS = 25_000;
const STATUS_TTL_MS = 60_000;
const PROBE_TTL_MS = 5 * 60_000;

function aiSettings() {
  return getState().settings.ai;
}

function withTimeout<T>(p: (signal: AbortSignal) => Promise<T>, ms: number): Promise<T> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  return p(ctrl.signal).finally(() => clearTimeout(t));
}

function trimMessages(messages: AiMessage[]): AiMessage[] {
  const clean = messages
    .filter((m) => m.content.trim())
    .map((m) => ({ role: m.role, content: m.content.slice(0, 8000) }));
  return clean.slice(-40);
}

// ---------- server status cache ----------

let serverStatus: { at: number; cloud: boolean; localServer: boolean } | null = null;

async function fetchServerStatus(): Promise<{ cloud: boolean; localServer: boolean }> {
  if (serverStatus && Date.now() - serverStatus.at < STATUS_TTL_MS) return serverStatus;
  try {
    const s = await withTimeout((signal) => aiStatusFn({ signal }), 8000);
    serverStatus = { at: Date.now(), cloud: !!s.cloud, localServer: !!s.localServer };
  } catch {
    serverStatus = { at: Date.now(), cloud: false, localServer: false };
  }
  return serverStatus;
}

// ---------- local browser provider ----------

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
    return { ok: false, reason: "The local browser model is only available in the browser." };
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
        reason: `Local model returned HTTP ${res.status}. Check the model name in Settings.`,
      };
    const data = (await res.json()) as { choices?: { message?: { content?: unknown } }[] };
    const content = data.choices?.[0]?.message?.content;
    const text = typeof content === "string" ? stripReasoning(content) : "";
    if (!text) return { ok: false, reason: "The local model returned an empty response." };
    probe = { at: Date.now(), url: base, ok: true };
    return { ok: true, text, provider: "local-browser" };
  } catch (e) {
    probe = { at: Date.now(), url: base, ok: false };
    const aborted = e instanceof Error && e.name === "AbortError";
    return {
      ok: false,
      reason: aborted
        ? "The local model timed out."
        : "Couldn't reach the local model. Is it running, and does it allow this site (CORS)? For Ollama set OLLAMA_ORIGINS to include this site's address.",
    };
  }
}

// ---------- server provider ----------

async function serverChat(
  req: AiChatRequest,
  provider: "auto" | "cloud" | "local-server",
): Promise<AiChatResult> {
  try {
    const r = await withTimeout(
      (signal) =>
        aiChatFn({
          data: {
            service: req.service,
            system: req.system.slice(0, 24000),
            messages: trimMessages(req.messages),
            ...(req.temperature !== undefined
              ? { temperature: Math.max(0, Math.min(1.5, req.temperature)) }
              : {}),
            ...(req.json !== undefined ? { json: req.json } : {}),
            provider,
          },
          signal,
        }),
      CLIENT_TIMEOUT_MS,
    );
    if (r.ok) return { ok: true, text: r.text, provider: r.provider };
    if (r.code === "not-configured" && serverStatus)
      serverStatus = { ...serverStatus, at: Date.now(), cloud: false, localServer: false };
    return { ok: false, reason: r.reason };
  } catch (e) {
    const aborted = e instanceof Error && e.name === "AbortError";
    return {
      ok: false,
      reason: aborted
        ? "The AI service timed out — continuing in scripted mode."
        : "The AI service is unreachable — continuing in scripted mode.",
    };
  }
}

export async function aiChat(req: AiChatRequest): Promise<AiChatResult> {
  if (!req.messages.length) return { ok: false, reason: "Nothing to send." };
  const ai = aiSettings();
  switch (ai.provider) {
    case "scripted":
      return { ok: false, reason: "Scripted training mode is selected in Settings." };
    case "local-browser":
      return browserChat(req, ai.localBrowserUrl, ai.localBrowserModel);
    case "cloud":
    case "local-server":
      return serverChat(req, ai.provider);
    case "auto":
    default: {
      const s = await fetchServerStatus();
      let serverResult: AiChatResult | null = null;
      if (s.cloud || s.localServer) {
        serverResult = await serverChat(req, "auto");
        if (serverResult.ok) return serverResult;
      }
      if (await probeBrowser(ai.localBrowserUrl)) {
        const b = await browserChat(req, ai.localBrowserUrl, ai.localBrowserModel);
        if (b.ok) return b;
      }
      return (
        serverResult ?? {
          ok: false,
          reason: "No AI provider is configured — using scripted training mode.",
        }
      );
    }
  }
}

export async function getAiStatus(): Promise<AiStatus> {
  const ai = aiSettings();
  const s = await fetchServerStatus();
  const localBrowser =
    ai.provider === "local-browser" || ai.provider === "auto"
      ? await probeBrowser(ai.localBrowserUrl)
      : false;
  let active: AiStatus["active"] = "scripted";
  switch (ai.provider) {
    case "cloud":
      active = s.cloud ? "cloud" : "scripted";
      break;
    case "local-server":
      active = s.localServer ? "local-server" : "scripted";
      break;
    case "local-browser":
      active = localBrowser ? "local-browser" : "scripted";
      break;
    case "auto":
      active = s.cloud
        ? "cloud"
        : s.localServer
          ? "local-server"
          : localBrowser
            ? "local-browser"
            : "scripted";
      break;
    default:
      active = "scripted";
  }
  return { cloud: s.cloud, localServer: s.localServer, localBrowser, active };
}

/** Forget cached status (call after the user changes AI settings). */
export function clearAiStatusCache() {
  serverStatus = null;
  probe = null;
}
