/**
 * End-of-session communication score report (shared by the ATC Simulator and AI ATC Practice).
 */
import { useState, type ReactNode } from "react";
import { CheckCircle2, ChevronDown, CircleAlert, Trophy, XCircle } from "lucide-react";
import { Meter, Notice, Pill } from "@/components/app/page";
import { cn } from "@/lib/utils";
import type { RadioLine, SessionReport } from "@/lib/atc/types";
import { AtcTranscript } from "./AtcTranscript";

function ScoreRing({ score }: { score: number }) {
  const r = 42;
  const c = 2 * Math.PI * r;
  const tone = score >= 90 ? "var(--ok)" : score >= 75 ? "var(--primary)" : score >= 60 ? "var(--caution)" : "var(--warning)";
  return (
    <svg viewBox="0 0 100 100" className="size-28 shrink-0" role="img" aria-label={`Score ${score} percent`}>
      <circle cx="50" cy="50" r={r} fill="none" stroke="var(--muted)" strokeWidth="8" />
      <circle cx="50" cy="50" r={r} fill="none" stroke={tone} strokeWidth="8" strokeDasharray={`${(score / 100) * c} ${c}`} strokeLinecap="round" transform="rotate(-90 50 50)" />
      <text x="50" y="54" textAnchor="middle" className="fill-foreground font-mono text-[22px] font-bold">
        {score}
      </text>
      <text x="50" y="68" textAnchor="middle" className="fill-muted-foreground text-[8px] tracking-widest uppercase">
        percent
      </text>
    </svg>
  );
}

export function AtcReport({
  report,
  title,
  subtitle,
  lines,
  pilotLabel,
  actions,
  note,
}: {
  report: SessionReport;
  title: string;
  subtitle?: ReactNode;
  lines: RadioLine[];
  pilotLabel?: string;
  actions?: ReactNode;
  note?: ReactNode;
}) {
  const [open, setOpen] = useState<string | null>(report.transmissions.find((t) => t.score < 100)?.id ?? null);
  const gradeTone = report.grade === "Excellent" ? "ok" : report.grade === "Proficient" ? "primary" : report.grade === "Needs practice" ? "caution" : "warning";
  return (
    <div className="space-y-5 animate-fade-up">
      <div className="panel flex flex-col gap-5 p-5 sm:flex-row sm:items-center">
        <ScoreRing score={report.score} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Trophy className="size-4 text-caution" />
            <span className="label-caps">Communication report</span>
            <Pill tone={gradeTone}>{report.grade}</Pill>
            <Pill tone="caution">Simulated ATC</Pill>
          </div>
          <h2 className="mt-1 text-xl font-bold tracking-tight">{title}</h2>
          {subtitle ? <div className="mt-1 text-sm text-muted-foreground">{subtitle}</div> : null}
          {actions ? <div className="mt-4 flex flex-wrap gap-2">{actions}</div> : null}
        </div>
      </div>
      {note}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
        <div className="panel p-4">
          <div className="label-caps mb-3">Score breakdown</div>
          {report.categories.length ? (
            <div className="space-y-3">
              {report.categories.map((c) => (
                <Meter key={c.key} label={`${c.label} · ${c.checks} check${c.checks === 1 ? "" : "s"}`} value={c.score} />
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No transmissions were scored.</p>
          )}
          {report.strengths.length ? (
            <div className="mt-4 border-t pt-3">
              <div className="label-caps mb-1.5">Strengths</div>
              <ul className="space-y-1 text-xs">
                {report.strengths.map((s) => (
                  <li key={s} className="flex items-center gap-1.5 text-ok">
                    <CheckCircle2 className="size-3.5" /> {s}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>

        <div className="panel p-4">
          <div className="label-caps mb-3">What to work on</div>
          {report.feedback.length ? (
            <ul className="space-y-2.5 text-sm">
              {report.feedback.map((f, i) => (
                <li key={i} className="flex gap-2">
                  <CircleAlert className="mt-0.5 size-4 shrink-0 text-caution" />
                  <span className="text-foreground/90">{f}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="flex items-center gap-2 text-sm text-ok">
              <CheckCircle2 className="size-4" /> No mistakes found — textbook radio work.
            </p>
          )}
        </div>
      </div>

      <div className="panel">
        <div className="border-b px-4 py-2.5">
          <span className="label-caps">Per-transmission feedback</span>
        </div>
        <ul className="divide-y">
          {report.transmissions.map((t) => {
            const isOpen = open === t.id;
            const bad = t.items.filter((i) => !i.ok);
            return (
              <li key={t.id}>
                <button type="button" onClick={() => setOpen(isOpen ? null : t.id)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/30" aria-expanded={isOpen}>
                  <span className={cn("w-10 shrink-0 font-mono text-sm font-bold tabular", t.score >= 90 ? "text-ok" : t.score >= 70 ? "text-primary" : t.score >= 50 ? "text-caution" : "text-warning")}>{t.score}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {t.stepTitle}
                      {t.attempt > 1 ? <span className="ml-1.5 text-xs text-muted-foreground">(attempt {t.attempt})</span> : null}
                    </span>
                    <span className="block truncate font-mono text-xs text-muted-foreground">“{t.text}”</span>
                  </span>
                  <span className="hidden text-xs text-muted-foreground sm:block">{t.summary}</span>
                  <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", isOpen && "rotate-180")} />
                </button>
                {isOpen ? (
                  <div className="space-y-3 bg-muted/20 px-4 pt-1 pb-4">
                    <div className="text-xs text-muted-foreground">
                      To {t.station}
                      {t.delaySec !== null ? ` · response time ${t.delaySec.toFixed(1)} s` : ""}
                    </div>
                    <ul className="space-y-1.5">
                      {[...bad, ...t.items.filter((i) => i.ok)].map((it, i) => (
                        <li key={i} className="flex gap-2 text-xs">
                          {it.ok ? <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-ok" /> : <XCircle className={cn("mt-0.5 size-3.5 shrink-0", it.severity === "critical" ? "text-warning" : it.severity === "major" ? "text-caution" : "text-muted-foreground")} />}
                          <span>
                            <span className="font-semibold">{it.label}</span>
                            {!it.ok ? <span className="ml-1 text-[10px] text-muted-foreground uppercase">{it.severity}</span> : null}
                            <span className="text-foreground/80"> — {it.message}</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                    {bad.length ? (
                      <Notice title="Correct phraseology:">
                        <span className="font-mono">“{t.example}”</span>
                      </Notice>
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      </div>

      <details className="panel group">
        <summary className="flex cursor-pointer items-center justify-between px-4 py-3 text-sm font-semibold">
          Full transcript
          <ChevronDown className="size-4 text-muted-foreground transition-transform group-open:rotate-180" />
        </summary>
        <div className="px-4 pb-4">
          <AtcTranscript lines={lines} {...(pilotLabel ? { pilotLabel } : {})} className="max-h-[420px]" autoScroll={false} />
        </div>
      </details>
    </div>
  );
}
