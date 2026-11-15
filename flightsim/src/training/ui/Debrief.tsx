/** The debrief after a test: score, pass / not yet, each objective with its explanation, and tips. */
import type { TestDef, TestResult } from "../types";
import { PASS_SCORE } from "../types";

const btn = "min-h-11 rounded-md bg-slate-800 px-4 py-2 text-sm font-medium text-slate-100 hover:bg-slate-700";

export function Debrief({ result, def, onRetry, onTests, onClose }: { result: TestResult; def: TestDef | undefined; onRetry: () => void; onTests: () => void; onClose: (() => void) | null }) {
  return (
    <div className="absolute inset-0 z-50 grid place-items-center overflow-y-auto bg-slate-950/80 p-4 select-text" data-debrief={result.id}>
      <div className="w-full max-w-xl rounded-2xl border border-slate-700 bg-slate-900 p-5 text-sm shadow-2xl">
        <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">Debrief</div>
        <h2 className="text-xl font-semibold">{result.title}</h2>
        <div className="mt-2 flex items-center gap-3">
          <div className={`grid h-16 w-16 place-items-center rounded-full text-xl font-bold ${result.passed ? "bg-emerald-600" : "bg-amber-600"}`} data-score={result.score}>
            {result.score}%
          </div>
          <div>
            <div className="text-lg font-semibold">{result.passed ? "Passed" : "Not passed yet"}</div>
            <div className="text-slate-300">
              {result.endedBecause}
              {result.durationSec > 0 && ` · ${Math.floor(result.durationSec / 60)} min ${result.durationSec % 60} s`}
            </div>
            {!result.passed && <div className="text-xs text-slate-400">You need {PASS_SCORE}% and every item marked essential.</div>}
          </div>
        </div>
        <ul className="mt-3 space-y-2">
          {result.objectives.map((o, i) => (
            <li key={i} className={`rounded-md border px-3 py-2 ${o.status === "pass" ? "border-emerald-700/60 bg-emerald-900/20" : "border-red-700/60 bg-red-900/20"}`}>
              <div className="flex items-start gap-2 font-medium">
                <span className={o.status === "pass" ? "text-emerald-400" : "text-red-400"}>{o.status === "pass" ? "✓" : "✗"}</span>
                <span className="flex-1">
                  {o.label}
                  {o.critical && <span className="ml-1 text-[10px] uppercase text-amber-300">essential</span>}
                </span>
                {o.weight > 0 && <span className="text-xs text-slate-400">{o.weight} pt</span>}
              </div>
              <div className="mt-0.5 pl-5 text-slate-300">{o.detail}</div>
            </li>
          ))}
        </ul>
        {def && def.tips.length > 0 && (
          <div className="mt-3 rounded-md bg-sky-900/30 p-3">
            <div className="text-xs font-semibold uppercase tracking-wider text-sky-300">Tips</div>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-slate-200">
              {def.tips.map((t, i) => (
                <li key={i}>{t}</li>
              ))}
            </ul>
          </div>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          <button className={`${btn} !bg-emerald-600 hover:!bg-emerald-500`} onClick={onRetry}>
            Try again
          </button>
          <button className={btn} onClick={onTests}>
            Other tests
          </button>
          {onClose && (
            <button className={btn} onClick={onClose}>
              Keep flying
            </button>
          )}
        </div>
        <p className="mt-3 text-xs text-slate-500">A learning aid, not an FAA test. Results are kept only in this browser.</p>
      </div>
    </div>
  );
}
