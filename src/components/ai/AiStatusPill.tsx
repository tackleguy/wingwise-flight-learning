/**
 * Local AI status + controls. All AI on TeachX runs locally (on this device, or on the user's
 * own model server). Shows which is active and lets the user turn the on-device model on.
 */
import { useCallback, useEffect, useState } from "react";
import { Cpu, Loader2, Power, ScrollText, Server, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  AI_PROVIDER_LABEL,
  autoStartOnDeviceAi,
  clearAiStatusCache,
  enableOnDeviceAi,
  getAiStatus,
  type AiStatus,
} from "@/lib/ai/client";
import { MODEL_DOWNLOAD_LABEL, MODEL_LABEL } from "@/lib/ai/local-model-id";
import { stopLocalModel, useLocalModel } from "@/lib/ai/local-model";
import { useStore } from "@/lib/store";

export function useAiStatus() {
  const provider = useStore((s) => s.settings.ai.provider);
  const url = useStore((s) => s.settings.ai.localBrowserUrl);
  const local = useLocalModel();
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
  // Quietly restart the on-device model if the user enabled it before and it is cached.
  useEffect(() => {
    void autoStartOnDeviceAi();
  }, []);
  useEffect(() => {
    let alive = true;
    getAiStatus()
      .then((s) => alive && setStatus(s))
      .catch(
        () =>
          alive &&
          setStatus({ onDevice: "off", webgpu: false, localBrowser: false, active: "scripted" }),
      )
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [provider, url, local.status]);
  return { status, loading, refresh, aiAvailable: !!status && status.active !== "scripted" };
}

/** Status chip plus (for on-device AI) a compact turn-on / progress / stop control. */
export function AiStatusPill({
  status,
  loading,
  using,
}: {
  status: AiStatus | null;
  loading: boolean;
  using?: "ai" | "scripted" | null;
}) {
  const provider = useStore((s) => s.settings.ai.provider);
  const local = useLocalModel();

  if (
    provider === "on-device" &&
    (local.status === "loading" ||
      local.status === "off" ||
      local.status === "error" ||
      local.status === "unsupported")
  ) {
    if (local.status === "loading") {
      const pct = Math.round(local.progress * 100);
      return (
        <span
          className={cn(CHIP, "border-primary/30 text-primary")}
          title={local.message}
          role="status"
        >
          <Loader2 className="size-3 animate-spin" /> AI loading {pct}%
          <span className="h-1 w-10 overflow-hidden rounded-full bg-primary/15" aria-hidden>
            <span className="block h-full bg-primary" style={{ width: `${pct}%` }} />
          </span>
        </span>
      );
    }
    if (local.status === "unsupported")
      return (
        <span
          className={cn(CHIP, "text-muted-foreground")}
          title="This browser lacks WebGPU, so the built-in scripted mode is used."
        >
          <ScrollText className="size-3" /> Scripted · no WebGPU
        </span>
      );
    const err = local.status === "error";
    return (
      <span
        className={cn(CHIP, "pr-0.5 text-muted-foreground")}
        title={err ? local.message : undefined}
      >
        <ScrollText className="size-3" /> Scripted
        <button
          type="button"
          onClick={() => void enableOnDeviceAi()}
          title={`Downloads ${MODEL_LABEL} (${MODEL_DOWNLOAD_LABEL}, one time) and runs it on this device. Nothing is sent to a server.${err && local.message ? `\nLast error: ${local.message}` : ""}`}
          className={cn(
            "ml-0.5 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 font-semibold hover:bg-primary/15",
            err ? "text-warning" : "text-primary",
          )}
        >
          <Power className="size-3" /> {err ? "Retry AI" : "Turn on AI"}
        </button>
      </span>
    );
  }

  if (loading)
    return (
      <span className={cn(CHIP, "text-muted-foreground")}>
        <Loader2 className="size-3 animate-spin" /> Checking AI…
      </span>
    );
  const active = status?.active ?? "scripted";
  if (active === "scripted" || using === "scripted")
    return (
      <span className={cn(CHIP, "text-muted-foreground")}>
        <ScrollText className="size-3" />{" "}
        {using === "scripted" && active !== "scripted" ? "Scripted fallback" : "Scripted"}
      </span>
    );
  return (
    <span className={cn(CHIP, "border-ok/30 text-ok", active === "on-device" && "pr-0.5")}>
      {active === "on-device" ? <Cpu className="size-3" /> : <Server className="size-3" />}{" "}
      {AI_PROVIDER_LABEL[active] ?? active}
      {active === "on-device" && local.status === "thinking" ? " · thinking" : ""}
      {active === "on-device" ? (
        <button
          type="button"
          onClick={stopLocalModel}
          className="ml-0.5 rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          title="Stop the on-device model and free GPU memory"
          aria-label="Stop on-device AI"
        >
          <X className="size-3" />
        </button>
      ) : null}
    </span>
  );
}

const CHIP =
  "inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap";
