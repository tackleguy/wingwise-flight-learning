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
 * NOTE: initial stub — the AI integration replaces the implementation below.
 */

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

export type AiChatResult = { ok: true; text: string; provider: string } | { ok: false; reason: string };

export interface AiStatus {
  cloud: boolean;
  localServer: boolean;
  localBrowser: boolean;
  active: "cloud" | "local-server" | "local-browser" | "scripted";
}

export async function aiChat(_req: AiChatRequest): Promise<AiChatResult> {
  return { ok: false, reason: "AI provider not configured — using scripted training mode." };
}

export async function getAiStatus(): Promise<AiStatus> {
  return { cloud: false, localServer: false, localBrowser: false, active: "scripted" };
}
