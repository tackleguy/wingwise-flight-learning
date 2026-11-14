/**
 * AI provider status (client-only): which provider is active, or scripted fallback.
 */
import { useCallback, useEffect, useState } from "react";
import { Bot, Cpu, Loader2, ScrollText } from "lucide-react";
import { Pill } from "@/components/app/page";
import { AI_PROVIDER_LABEL, clearAiStatusCache, getAiStatus, type AiStatus } from "@/lib/ai/client";
import { useStore } from "@/lib/store";

export function useAiStatus() {
  const provider = useStore((s) => s.settings.ai.provider);
  const url = useStore((s) => s.settings.ai.localBrowserUrl);
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    setLoading(true);
    clearAiStatusCache();
    try {
      setStatus(await getAiStatus());
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    getAiStatus()
      .then((s) => alive && setStatus(s))
      .catch(() => alive && setStatus({ cloud: false, localServer: false, localBrowser: false, active: "scripted" }))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [provider, url]);
  return { status, loading, refresh, aiAvailable: !!status && status.active !== "scripted" };
}

export function AiStatusPill({ status, loading, using }: { status: AiStatus | null; loading: boolean; using?: "ai" | "scripted" | null }) {
  if (loading)
    return (
      <Pill>
        <Loader2 className="size-3 animate-spin" /> Checking AI…
      </Pill>
    );
  const active = status?.active ?? "scripted";
  if (active === "scripted" || using === "scripted")
    return (
      <Pill tone="caution">
        <ScrollText className="size-3" /> {using === "scripted" && active !== "scripted" ? "Scripted fallback" : "Scripted mode"}
      </Pill>
    );
  return (
    <Pill tone="ok">
      {active === "cloud" ? <Bot className="size-3" /> : <Cpu className="size-3" />} {AI_PROVIDER_LABEL[active] ?? active}
    </Pill>
  );
}
