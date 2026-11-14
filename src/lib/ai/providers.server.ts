/**
 * SERVER-ONLY AI providers. Keys are read from environment variables per request and are
 * never sent to the browser.
 *
 * Environment variables (set them as Secrets in Lovable / your host — never in the repo):
 *   LOVABLE_API_KEY     Lovable AI Gateway key (provided automatically when Lovable AI is enabled)
 *   LOVABLE_AI_MODEL    optional, default "google/gemini-2.5-flash"
 *   LOCAL_AI_BASE_URL   optional OpenAI-compatible endpoint reachable FROM THE SERVER,
 *                       e.g. https://my-ollama.example.com/v1 (Ollama, LM Studio, vLLM …)
 *   LOCAL_AI_MODEL      model name for that endpoint, e.g. "llama3.1"
 *   LOCAL_AI_API_KEY    optional bearer token for that endpoint
 */
import { getRequestHeader } from "@tanstack/react-start/server";
import type { AiMessage, AiService } from "./client";
import { guardedSystem, stripReasoning } from "./guardrails";

export type ServerProviderId = "cloud" | "local-server";

interface ProviderConfig {
  id: ServerProviderId;
  label: string;
  baseUrl: string;
  model: string;
  apiKey: string | null;
}

const LOVABLE_GATEWAY = "https://ai.gateway.lovable.dev/v1";
const DEFAULT_CLOUD_MODEL = "google/gemini-2.5-flash";

function env(name: string): string | undefined {
  // Read per request (edge runtimes inject env at request time).
  const v = typeof process !== "undefined" ? process.env[name] : undefined;
  return v && v.trim() ? v.trim() : undefined;
}

export function cloudConfig(): ProviderConfig | null {
  const key = env("LOVABLE_API_KEY");
  if (!key) return null;
  return { id: "cloud", label: "Lovable AI", baseUrl: LOVABLE_GATEWAY, model: env("LOVABLE_AI_MODEL") ?? DEFAULT_CLOUD_MODEL, apiKey: key };
}

export function localServerConfig(): ProviderConfig | null {
  const base = env("LOCAL_AI_BASE_URL");
  if (!base || !/^https?:\/\//i.test(base)) return null;
  return { id: "local-server", label: "Local model (server)", baseUrl: base.replace(/\/+$/, ""), model: env("LOCAL_AI_MODEL") ?? "llama3.1", apiKey: env("LOCAL_AI_API_KEY") ?? null };
}

export function serverAiStatus() {
  return { cloud: !!cloudConfig(), localServer: !!localServerConfig() };
}

export type ProviderResult = { ok: true; text: string; provider: ServerProviderId } | { ok: false; reason: string; code: "not-configured" | "rate-limit" | "credits" | "auth" | "timeout" | "error" | "bad-response" };

async function callChat(cfg: ProviderConfig, req: { service: AiService; system: string; messages: AiMessage[]; temperature?: number | undefined; json?: boolean | undefined }, timeoutMs: number): Promise<ProviderResult> {
  const messages = [{ role: "system", content: guardedSystem(req.service, req.system, req.json) }, ...req.messages.map((m) => ({ role: m.role, content: m.content }))];
  const body: Record<string, unknown> = { model: cfg.model, messages, temperature: req.temperature ?? 0.4, stream: false };
  if (req.json) body["response_format"] = { type: "json_object" };

  const attempt = async (payload: Record<string, unknown>) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      return await fetch(`${cfg.baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {}) },
        body: JSON.stringify(payload),
        signal: ctrl.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  };

  try {
    let res = await attempt(body);
    // Some OpenAI-compatible servers reject response_format — retry once without it.
    if (res.status === 400 && req.json) {
      const { response_format: _rf, ...rest } = body;
      res = await attempt(rest);
    }
    if (res.status === 429) return { ok: false, code: "rate-limit", reason: "The AI service is busy (rate limited). Please wait a moment and try again — scripted mode is used meanwhile." };
    if (res.status === 402) return { ok: false, code: "credits", reason: "AI credits are exhausted for this workspace. Add credits in Lovable (Settings → Workspace → Usage) — scripted mode is used meanwhile." };
    if (res.status === 401 || res.status === 403) return { ok: false, code: "auth", reason: `${cfg.label} rejected the server's credentials. Check the configured key.` };
    if (!res.ok) return { ok: false, code: "error", reason: `${cfg.label} returned an error (HTTP ${res.status}).` };
    const data = (await res.json()) as { choices?: { message?: { content?: unknown } }[] };
    const content = data.choices?.[0]?.message?.content;
    const text = typeof content === "string" ? stripReasoning(content) : "";
    if (!text) return { ok: false, code: "bad-response", reason: `${cfg.label} returned an empty response.` };
    return { ok: true, text: text.slice(0, 16000), provider: cfg.id };
  } catch (e) {
    const aborted = e instanceof Error && (e.name === "AbortError" || /abort/i.test(e.message));
    return aborted ? { ok: false, code: "timeout", reason: `${cfg.label} timed out.` } : { ok: false, code: "error", reason: `${cfg.label} could not be reached.` };
  }
}

// ---- light abuse protection: per-client sliding window (per server instance) ----
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 30;
const hits = new Map<string, number[]>();

function clientKey(): string {
  try {
    return getRequestHeader("cf-connecting-ip") ?? getRequestHeader("x-forwarded-for")?.split(",")[0]?.trim() ?? "anon";
  } catch {
    return "anon";
  }
}

function rateLimited(): boolean {
  const k = clientKey();
  const now = Date.now();
  const list = (hits.get(k) ?? []).filter((t) => now - t < WINDOW_MS);
  list.push(now);
  hits.set(k, list);
  if (hits.size > 5000) hits.clear();
  return list.length > MAX_PER_WINDOW;
}

export async function runServerChat(req: {
  service: AiService;
  system: string;
  messages: AiMessage[];
  temperature?: number | undefined;
  json?: boolean | undefined;
  provider: "auto" | "cloud" | "local-server";
}): Promise<ProviderResult> {
  if (rateLimited()) return { ok: false, code: "rate-limit", reason: "Too many AI requests from this device — please slow down for a minute." };
  const order: ProviderConfig[] = [];
  const cloud = cloudConfig();
  const local = localServerConfig();
  if (req.provider === "cloud" || req.provider === "auto") if (cloud) order.push(cloud);
  if (req.provider === "local-server" || req.provider === "auto") if (local) order.push(local);
  if (!order.length) {
    const which = req.provider === "cloud" ? "Lovable AI (LOVABLE_API_KEY)" : req.provider === "local-server" ? "a server-side local model (LOCAL_AI_BASE_URL)" : "an AI provider";
    return { ok: false, code: "not-configured", reason: `The server has no ${which} configured — using scripted training mode.` };
  }
  const deadline = Date.now() + 23_000;
  let last: ProviderResult = { ok: false, code: "error", reason: "No provider responded." };
  for (const cfg of order) {
    const remaining = deadline - Date.now();
    if (remaining < 3000) break;
    last = await callChat(cfg, req, remaining);
    if (last.ok) return last;
    // Credits/rate limits on the cloud: fall through to the local server if configured.
  }
  return last;
}
