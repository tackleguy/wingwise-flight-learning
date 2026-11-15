/**
 * The panel shown while a flying test runs: the objectives with their live state, the clock,
 * the briefing, "Report a problem" and "End test". It refreshes a few times a second (never per frame).
 */
import { useEffect, useState } from "react";
import type { TrainingModule } from "../runner";
import { FAILURE_LABELS, type FailureKind, type ObjectiveStatus } from "../types";

const ICON: Record<ObjectiveStatus, string> = { pending: "○", pass: "✓", fail: "✗" };
const COLOR: Record<ObjectiveStatus, string> = { pending: "text-slate-300", pass: "text-emerald-400", fail: "text-red-400" };
const btn = "min-h-9 rounded-md bg-slate-700/90 px-2.5 py-1 text-xs font-medium text-slate-100 hover:bg-slate-600";

export function TestHud({ training }: { training: TrainingModule }) {
  const [, setTick] = useState(0);
  const [open, setOpen] = useState(true);
  const [showBrief, setShowBrief] = useState(false);
  const [reporting, setReporting] = useState(false);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 400);
    return () => clearInterval(id);
  }, []);
  const run = training.active;
  if (!run || run.result) return null;
  const { def, ctx, objectives } = run;
  const left = Math.max(0, (def.flight?.timeLimitSec ?? 0) - ctx.t);
  const clock = `${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, "0")}`;
  return (
    <div data-test-hud={def.id} className="absolute left-2 right-2 top-12 z-20 max-h-[45vh] overflow-y-auto rounded-xl border border-white/15 bg-slate-950/85 p-3 text-sm text-slate-100 shadow-xl backdrop-blur select-text sm:left-auto sm:w-96">
      <div className="flex items-center gap-2">
        <span className="rounded bg-sky-600 px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide">Test</span>
        <span className="flex-1 truncate font-semibold">{def.title}</span>
        <span className="tabular-nums text-slate-300" title="Time left">
          {clock}
        </span>
        <button className={btn} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          {open ? "▴" : "▾"}
        </button>
      </div>
      {open && (
        <>
          {!reporting && (
          <ul className="mt-2 space-y-1">
            {objectives.map((o) => (
              <li key={o.id} className="flex gap-2 leading-snug" title={o.detail}>
                <span className={`w-4 shrink-0 text-center font-bold ${COLOR[o.status]}`}>{ICON[o.status]}</span>
                <span className={o.status === "fail" ? "text-red-200" : ""}>
                  {o.label}
                  {o.critical && <span className="ml-1 text-[10px] uppercase text-amber-300">essential</span>}
                </span>
              </li>
            ))}
          </ul>
          )}
          {showBrief && !reporting && (
            <ol className="mt-2 list-decimal space-y-1 rounded-md bg-slate-800/80 p-2 pl-6 text-xs leading-snug text-slate-200">
              {def.briefing.map((b, i) => (
                <li key={i}>{b}</li>
              ))}
            </ol>
          )}
          {reporting && (
            <div className="mt-2 rounded-md bg-slate-800/90 p-2" role="dialog" aria-label="Report a problem">
              <div className="mb-1 text-xs text-slate-300">What has gone wrong?</div>
              <div className="grid gap-1">
                {(Object.keys(FAILURE_LABELS) as FailureKind[]).map((k) => (
                  <button
                    key={k}
                    data-report={k}
                    className="min-h-9 rounded bg-slate-700 px-2 py-1 text-left text-xs hover:bg-slate-600"
                    onClick={() => {
                      training.report(k);
                      setReporting(false);
                    }}
                  >
                    {FAILURE_LABELS[k]}
                  </button>
                ))}
                <button className="min-h-9 rounded px-2 py-1 text-left text-xs text-slate-400 hover:bg-slate-700" onClick={() => setReporting(false)}>
                  Cancel
                </button>
              </div>
            </div>
          )}
          <div className="mt-2 flex flex-wrap gap-1.5">
            <button className={`${btn} !bg-amber-600 hover:!bg-amber-500`} onClick={() => setReporting((r) => !r)}>
              Report a problem
            </button>
            <button className={btn} onClick={() => setShowBrief((b) => !b)}>
              {showBrief ? "Hide briefing" : "Briefing"}
            </button>
            <button className={btn} onClick={() => training.end("You ended the test.")}>
              End test
            </button>
            {ctx.reports.length > 0 && <span className="self-center text-xs text-slate-400">Reported: {ctx.reports.map((r) => FAILURE_LABELS[r.kind].split(" (")[0]).join(", ")}</span>}
          </div>
        </>
      )}
    </div>
  );
}
