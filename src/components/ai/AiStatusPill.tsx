/**
 * Local AI status + controls. All AI on TeachX runs locally (on this device, or on the user's
 * own model server). Shows which is active and lets the user turn the on-device model on.
 */
import { useCallback, useEffect, useState } from "react";
import { Cpu, Loader2, Power, ScrollText, Server } from "lucide-react";
import { Pill } from "@/components/app/page";
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

/** Status pill plus (for on-device AI) a turn-on button with download progress. */
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
    if (local.status === "loading")
      return (
        <span className="inline-flex flex-wrap items-center gap-2">
          <Pill tone="primary">
            <Loader2 className="size-3 animate-spin" /> Loading on-device AI ·{" "}
            {Math.round(local.progress * 100)}%
          </Pill>
          <span
            className="max-w-[260px] truncate text-[11px] text-muted-foreground"
            title={local.message}
          >
            {local.message}
          </span>
        </span>
      );
    if (local.status === "unsupported")
      return (
        <Pill tone="caution" className="normal-case">
          <ScrollText className="size-3" /> Scripted mode · this browser lacks WebGPU
        </Pill>
      );
    return (
      <span className="inline-flex flex-wrap items-center gap-2">
        <Pill tone="caution">
          <ScrollText className="size-3" /> Scripted mode
        </Pill>
        <button
          type="button"
          onClick={() => void enableOnDeviceAi()}
          title={`Downloads ${MODEL_LABEL} (${MODEL_DOWNLOAD_LABEL}, one time) and runs it on this device. Nothing is sent to a server.`}
          className="inline-flex items-center gap-1 rounded border border-primary/40 bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary hover:bg-primary/20"
        >
          <Power className="size-3" />{" "}
          {local.status === "error" ? "Retry on-device AI" : "Turn on on-device AI"}
        </button>
        {local.status === "error" ? (
          <span className="max-w-[260px] truncate text-[11px] text-warning" title={local.message}>
            {local.message}
          </span>
        ) : null}
      </span>
    );
  }

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
        <ScrollText className="size-3" />{" "}
        {using === "scripted" && active !== "scripted" ? "Scripted fallback" : "Scripted mode"}
      </Pill>
    );
  return (
    <span className="inline-flex items-center gap-2">
      <Pill tone="ok">
        {active === "on-device" ? <Cpu className="size-3" /> : <Server className="size-3" />}{" "}
        {AI_PROVIDER_LABEL[active] ?? active}
        {active === "on-device" && local.status === "thinking" ? " · thinking" : ""}
      </Pill>
      {active === "on-device" ? (
        <button
          type="button"
          onClick={stopLocalModel}
          className="text-[11px] text-muted-foreground hover:text-foreground"
          title="Stop the on-device model and free GPU memory"
        >
          Stop
        </button>
      ) : null}
    </span>
  );
}
