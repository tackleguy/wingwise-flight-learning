/**
 * Interactive preflight walk-around: a top-down airplane diagram with clickable inspection zones.
 * A few zones (chosen per attempt) contain planted discrepancies that must be found.
 */
import { useMemo, useState, type KeyboardEvent } from "react";
import { AlertTriangle, CheckCircle2, Search, XCircle } from "lucide-react";
import { WALK_ZONES, walkaroundPlan } from "@/lib/checkride/content";
import { Pill } from "@/components/app/page";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { StageFrame, StageResult, type StageProps } from "./shared";

type Mark = "ok" | "disc";

/** Hotspot geometry on a 400×440 top-down diagram (nose up; airplane's left wing on the left). */
const SPOTS: Record<string, { cx: number; cy: number; r?: number; w?: number; h?: number }> = {
  prop: { cx: 200, cy: 22, w: 96, h: 16 },
  cowl: { cx: 200, cy: 50, w: 44, h: 20 },
  oil: { cx: 200, cy: 78, r: 13 },
  "nose-gear": { cx: 200, cy: 104, r: 10 },
  windshield: { cx: 200, cy: 128, w: 40, h: 16 },
  pitot: { cx: 66, cy: 142, r: 10 },
  "left-wing": { cx: 56, cy: 168, w: 70, h: 30 },
  "left-fuel": { cx: 128, cy: 168, r: 13 },
  "fuel-vent": { cx: 150, cy: 196, r: 9 },
  "right-fuel": { cx: 272, cy: 168, r: 13 },
  "right-wing": { cx: 344, cy: 168, w: 70, h: 30 },
  cabin: { cx: 200, cy: 182, r: 15 },
  "main-gear": { cx: 200, cy: 232, w: 120, h: 16 },
  static: { cx: 178, cy: 270, r: 9 },
  empennage: { cx: 200, cy: 392, w: 150, h: 34 },
};

export function WalkaroundStage({ attempt, stage, onComplete }: StageProps) {
  const discrepancies = useMemo(() => walkaroundPlan(attempt.id), [attempt.id]);
  const [active, setActive] = useState<string | null>(null);
  const [marks, setMarks] = useState<Record<string, Mark>>({});
  const [revealed, setRevealed] = useState(false);
  const zone = WALK_ZONES.find((z) => z.id === active) ?? null;
  const inspected = Object.keys(marks).length;

  const results = WALK_ZONES.map((z) => {
    const truth: Mark = discrepancies.has(z.id) ? "disc" : "ok";
    return { z, truth, mark: marks[z.id], ok: marks[z.id] === truth };
  });
  const correct = results.filter((r) => r.ok).length;
  // Missing a real discrepancy is weighted more heavily than a false alarm.
  const missedDisc = results.filter((r) => r.truth === "disc" && r.mark !== "disc");
  const falseAlarms = results.filter((r) => r.truth === "ok" && r.mark === "disc");
  const score = Math.max(0, Math.round(100 - missedDisc.length * 20 - falseAlarms.length * 5 - results.filter((r) => r.mark === undefined && r.truth === "ok").length * 3));
  const notes = [
    ...missedDisc.map((r) => `Missed discrepancy — ${r.z.name}: ${r.z.discrepancy} ${r.z.correction}`),
    ...falseAlarms.map((r) => `Grounded a serviceable item — ${r.z.name}.`),
    ...(missedDisc.length === 0 ? [`Found all ${discrepancies.size} discrepancies.`] : []),
    `${inspected} of ${WALK_ZONES.length} areas inspected.`,
  ];

  const statusColor = (id: string) => {
    if (revealed) {
      const r = results.find((x) => x.z.id === id);
      return r?.ok ? "var(--color-ok)" : "var(--color-warning)";
    }
    const m = marks[id];
    return m === "disc" ? "var(--color-warning)" : m === "ok" ? "var(--color-ok)" : "var(--color-primary)";
  };

  return (
    <StageFrame stage={stage} aside={<Pill tone="cyan">{inspected}/{WALK_ZONES.length} inspected</Pill>}>
      <p className="mb-4 text-sm">
        Walk around the airplane. Select each area to inspect it, then decide whether it's airworthy or has a discrepancy that must be corrected before flight. There are several planted discrepancies.
      </p>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,420px)_1fr]">
        <div className="avionics-screen grid-backdrop relative mx-auto w-full max-w-[420px] p-2">
          <svg viewBox="0 0 400 440" className="h-auto w-full" role="group" aria-label="Airplane walk-around diagram">
            {/* Airframe */}
            <g fill="oklch(0.3 0.03 258)" stroke="oklch(0.55 0.03 250)" strokeWidth="1.5">
              <rect x="20" y="148" width="360" height="40" rx="6" />
              <path d="M180 36 Q200 26 220 36 L226 120 L224 330 Q200 350 176 330 L174 120 Z" />
              <rect x="125" y="376" width="150" height="30" rx="5" />
              <rect x="196" y="352" width="8" height="70" rx="3" />
              <line x1="150" y1="188" x2="182" y2="220" />
              <line x1="250" y1="188" x2="218" y2="220" />
            </g>
            <g fill="none" stroke="oklch(0.6 0.03 250)" strokeWidth="1">
              <rect x="182" y="120" width="36" height="16" rx="4" fill="oklch(0.45 0.08 230 / 0.5)" />
              <line x1="152" y1="22" x2="248" y2="22" strokeWidth="5" stroke="oklch(0.7 0.02 250)" strokeLinecap="round" />
              <circle cx="200" cy="30" r="7" fill="oklch(0.5 0.02 250)" />
              <circle cx="160" cy="232" r="7" fill="oklch(0.2 0.01 250)" />
              <circle cx="240" cy="232" r="7" fill="oklch(0.2 0.01 250)" />
              <circle cx="200" cy="104" r="5" fill="oklch(0.2 0.01 250)" />
              <line x1="62" y1="148" x2="62" y2="136" strokeWidth="3" stroke="oklch(0.75 0.02 250)" />
            </g>
            <text x="200" y="436" textAnchor="middle" fontSize="10" fill="var(--color-muted-foreground)">
              Top view · nose up
            </text>
            {/* Hotspots */}
            {WALK_ZONES.map((z) => {
              const s = SPOTS[z.id];
              if (!s) return null;
              const selected = active === z.id;
              const color = statusColor(z.id);
              const done = marks[z.id] !== undefined || revealed;
              const common = {
                fill: done ? color : "transparent",
                fillOpacity: done ? 0.22 : 0,
                stroke: color,
                strokeWidth: selected ? 2.5 : 1.5,
                strokeDasharray: done ? undefined : "4 3",
                className: "cursor-pointer transition-all hover:fill-opacity-30",
                onClick: () => setActive(z.id),
                role: "button",
                tabIndex: 0,
                "aria-label": `Inspect ${z.name}`,
                onKeyDown: (e: KeyboardEvent<SVGElement>) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setActive(z.id);
                  }
                },
              } as const;
              return s.r ? (
                <circle key={z.id} cx={s.cx} cy={s.cy} r={s.r} {...common} />
              ) : (
                <rect key={z.id} x={s.cx - (s.w ?? 20) / 2} y={s.cy - (s.h ?? 20) / 2} width={s.w} height={s.h} rx={4} {...common} />
              );
            })}
          </svg>
        </div>

        <div className="min-w-0">
          {zone ? (
            <div className="rounded-md border bg-card p-4 animate-fade-up">
              <p className="label-caps mb-1 flex items-center gap-1.5">
                <Search className="size-3" /> Inspecting
              </p>
              <h3 className="text-base font-semibold">{zone.name}</h3>
              <p className="mt-2 rounded border-l-2 border-primary/50 bg-muted/30 px-3 py-2 text-sm leading-relaxed">{discrepancies.has(zone.id) ? zone.discrepancy : zone.normal}</p>
              {!revealed ? (
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <Button variant={marks[zone.id] === "ok" ? "default" : "outline"} onClick={() => setMarks((m) => ({ ...m, [zone.id]: "ok" }))}>
                    <CheckCircle2 /> Airworthy
                  </Button>
                  <Button
                    variant={marks[zone.id] === "disc" ? "destructive" : "outline"}
                    onClick={() => setMarks((m) => ({ ...m, [zone.id]: "disc" }))}
                  >
                    <AlertTriangle /> Discrepancy — fix before flight
                  </Button>
                </div>
              ) : (
                <p className="mt-3 text-xs text-foreground/85">
                  {discrepancies.has(zone.id) ? <span className="font-semibold text-warning">Discrepancy. </span> : <span className="font-semibold text-ok">Airworthy. </span>}
                  {discrepancies.has(zone.id) ? zone.correction : "No action needed."}
                </p>
              )}
            </div>
          ) : (
            <p className="rounded-md border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">Select an area on the diagram or from the list below to inspect it.</p>
          )}

          <ul className="mt-3 grid grid-cols-1 gap-1 sm:grid-cols-2">
            {WALK_ZONES.map((z) => {
              const m = marks[z.id];
              const r = results.find((x) => x.z.id === z.id);
              return (
                <li key={z.id}>
                  <button
                    type="button"
                    onClick={() => setActive(z.id)}
                    className={cn("flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-accent/40", active === z.id && "bg-accent/50")}
                  >
                    {revealed ? (
                      r?.ok ? <CheckCircle2 className="size-3.5 shrink-0 text-ok" /> : <XCircle className="size-3.5 shrink-0 text-warning" />
                    ) : m === "disc" ? (
                      <AlertTriangle className="size-3.5 shrink-0 text-warning" />
                    ) : m === "ok" ? (
                      <CheckCircle2 className="size-3.5 shrink-0 text-ok" />
                    ) : (
                      <span className="size-3.5 shrink-0 rounded-full border border-dashed border-primary" />
                    )}
                    <span className="truncate">{z.name}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      {!revealed ? (
        <div className="mt-5 flex flex-wrap items-center gap-3 border-t pt-4">
          <Button onClick={() => setRevealed(true)} disabled={inspected === 0}>
            Complete inspection
          </Button>
          <span className="text-xs text-muted-foreground">
            {inspected < WALK_ZONES.length ? `${WALK_ZONES.length - inspected} areas not yet inspected — uninspected areas count against you.` : "All areas inspected."}
          </span>
        </div>
      ) : (
        <>
          <p className="mt-4 text-xs text-muted-foreground">
            {correct} of {WALK_ZONES.length} areas assessed correctly. Missed discrepancies cost 20 points each; false alarms 5; uninspected serviceable areas 3.
          </p>
          <StageResult score={score} notes={notes} onContinue={() => onComplete(score, notes)} />
        </>
      )}
    </StageFrame>
  );
}
