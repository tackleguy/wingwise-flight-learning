/**
 * Time-stamped radio transcript (pilot / ATC / other traffic / system notes).
 */
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import type { RadioLine } from "@/lib/atc/types";

function stamp(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export function AtcTranscript({
  lines,
  pilotLabel = "You",
  receiving,
  className,
  emptyText = "Radio is quiet. Tune the right frequency and make your call.",
  autoScroll = true,
}: {
  lines: RadioLine[];
  pilotLabel?: string;
  receiving?: { station: string; from?: "atc" | "traffic" } | null;
  className?: string;
  emptyText?: string;
  autoScroll?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!autoScroll) return;
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines.length, autoScroll]);

  return (
    <div ref={ref} className={cn("avionics-screen overflow-y-auto p-3 font-mono text-[13px] leading-relaxed", className)} aria-live="polite" aria-label="Radio transcript">
      {lines.length === 0 ? <p className="py-6 text-center font-sans text-xs text-muted-foreground">{emptyText}</p> : null}
      <ul className="space-y-2">
        {lines.map((l) => (
          <li key={l.id} className="flex gap-2">
            <span className="mt-0.5 shrink-0 text-[10px] text-muted-foreground/70 tabular">{stamp(l.t)}</span>
            {l.from === "system" ? (
              <div
                className={cn(
                  "min-w-0 flex-1 rounded border px-2 py-1 font-sans text-xs whitespace-pre-line",
                  l.tone === "warning"
                    ? "border-warning/30 bg-warning/5 text-warning"
                    : l.tone === "caution"
                      ? "border-caution/30 bg-caution/5 text-foreground/90"
                      : l.tone === "ok"
                        ? "border-ok/30 bg-ok/5 text-ok"
                        : "border-primary/20 bg-primary/5 text-foreground/80",
                )}
              >
                {l.text}
              </div>
            ) : (
              <div className="min-w-0 flex-1">
                <span
                  className={cn(
                    "mr-1.5 text-[10px] font-bold tracking-wide uppercase",
                    l.from === "pilot" ? "text-primary" : l.from === "atc" ? "text-ok" : "text-muted-foreground",
                  )}
                >
                  {l.from === "pilot" ? pilotLabel : l.station ?? "ATC"}
                  {l.from === "traffic" ? " · other traffic" : ""}
                </span>
                <span className={cn(l.from === "pilot" ? "text-foreground" : l.from === "atc" ? "text-ok/95" : "text-muted-foreground italic")}>{l.text}</span>
              </div>
            )}
          </li>
        ))}
      </ul>
      {receiving ? (
        <div className="mt-2 flex items-center gap-2 font-sans text-[11px] text-ok">
          <span className="size-2 animate-annunciator rounded-full bg-ok" /> {receiving.station} transmitting…
        </div>
      ) : null}
    </div>
  );
}
