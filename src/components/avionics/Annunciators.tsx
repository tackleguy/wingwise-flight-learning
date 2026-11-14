/**
 * Annunciator panel bound to `snapshot.alerts`: warnings flash red, cautions amber, advisories white.
 * A fixed set of common annunciators is always shown (dim when inactive) so students learn the layout.
 */
import { cn } from "@/lib/utils";
import { useSimSnapshot } from "@/sim/react";
import { ExplainButton } from "./common";

const FIXED: { text: string; match: string[] }[] = [
  { text: "STALL", match: ["STALL", "STALL WARN"] },
  { text: "OIL PRESS", match: ["OIL PRESS"] },
  { text: "LOW VOLTS", match: ["LOW VOLTS"] },
  { text: "ALT FAIL", match: ["ALT FAIL"] },
  { text: "VACUUM", match: ["VACUUM"] },
  { text: "AHRS", match: ["AHRS FAIL", "ATT FAIL"] },
  { text: "PITOT", match: ["PITOT"] },
  { text: "STATIC", match: ["STATIC"] },
  { text: "LOW FUEL", match: ["LOW FUEL"] },
  { text: "ENGINE", match: ["ENGINE OUT", "L ENG FAIL"] },
  { text: "GPS LOI", match: ["GPS LOI"] },
  { text: "COM FAIL", match: ["COM FAIL"] },
];

export interface AnnunciatorsProps {
  className?: string | undefined;
  /** Show only active alerts (no dim fixed tiles). */
  activeOnly?: boolean | undefined;
}

export function Annunciators({ className, activeOnly }: AnnunciatorsProps) {
  const s = useSimSnapshot();
  const alerts = s.alerts;
  const used = new Set<string>();
  const tiles = FIXED.map((f) => {
    const hit = alerts.find((a) => f.match.includes(a.text));
    if (hit) used.add(hit.text);
    for (const a of alerts) if (f.match.includes(a.text)) used.add(a.text);
    return { key: f.text, text: hit ? hit.text : f.text, level: hit?.level ?? null };
  });
  const extra = alerts.filter((a) => !used.has(a.text)).map((a) => ({ key: a.text, text: a.text, level: a.level }));
  const all = activeOnly ? [...tiles.filter((t) => t.level), ...extra] : [...tiles, ...extra];
  return (
    <div className={cn("relative rounded-xl border border-white/10 bg-bezel p-2", className)} role="status" aria-live="polite" aria-label="Annunciator panel">
      <div className="mb-1.5 flex items-center justify-between px-1">
        <span className="text-[10px] font-semibold tracking-[0.2em] text-white/45 uppercase">Annunciators</span>
        <ExplainButton id="annunciators" label="Annunciators" />
      </div>
      {all.length === 0 ? (
        <div className="rounded bg-black px-2 py-2 text-center font-mono text-[10px] text-white/35">NO ACTIVE ALERTS</div>
      ) : (
        <div className="grid grid-cols-3 gap-1 sm:grid-cols-4">
          {all.map((t) => (
            <div
              key={t.key}
              className={cn(
                "flex h-7 items-center justify-center rounded-[3px] border px-1 text-center font-mono text-[9.5px] leading-tight font-bold tracking-wide",
                t.level === "warning" && "animate-annunciator border-warning bg-warning text-black shadow-[0_0_12px_var(--warning)]",
                t.level === "caution" && "border-caution bg-caution text-black shadow-[0_0_10px_var(--caution)]",
                t.level === "advisory" && "border-white/60 bg-white/85 text-black",
                !t.level && "border-white/5 bg-[oklch(0.16_0.01_258)] text-white/20",
              )}
            >
              {t.text}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
