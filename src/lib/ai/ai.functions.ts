/**
 * Server functions for AI. Safe to import anywhere: the build replaces the handlers with RPC
 * stubs in the browser bundle, so keys in providers.server.ts never reach the client.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { runServerChat, serverAiStatus } from "./providers.server";

const aiChatInput = z.object({
  service: z.enum(["atc", "instructor", "oral", "scenario", "evaluate"]),
  system: z.string().max(24000),
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(8000) }))
    .min(1)
    .max(60),
  temperature: z.number().min(0).max(1.5).optional(),
  json: z.boolean().optional(),
  provider: z.enum(["auto", "cloud", "local-server"]),
});

export const aiChatFn = createServerFn({ method: "POST" })
  .validator(aiChatInput)
  .handler(async ({ data }) => runServerChat(data));

/** Which server-side providers are configured (booleans only — never keys). */
export const aiStatusFn = createServerFn({ method: "GET" }).handler(async () => serverAiStatus());
