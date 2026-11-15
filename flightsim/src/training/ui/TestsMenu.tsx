/**
 * The "Tests" tab of the start screen: tests grouped by category with the best score so far,
 * and the briefing of the chosen test with its Start button.
 */
import { useState } from "react";
import { CATEGORY_LABELS, TESTS } from "../catalog";
import type { StoredResult } from "../runner";
import type { TestDef } from "../types";
import { PASS_SCORE } from "../types";

const CATEGORY_ORDER: TestDef["category"][] = ["preflight", "failures", "weather", "skills"];

export function ScoreBadge({ r }: { r: StoredResult | undefined }) {
  if (!r) return <span className="rounded bg-slate-700/70 px-1.5 py-0.5 text-[11px] text-slate-300">not tried</span>;
  return (
    <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${r.passed ? "bg-emerald-600/80 text-white" : "bg-amber-600/80 text-white"}`}>
      best {r.best}%{r.passed ? " ✓" : ""}
    </span>
  );
}

export function TestsMenu({ results, busy, onStart }: { results: Record<string, StoredResult>; busy: boolean; onStart: (def: TestDef) => void }) {
  const [chosen, setChosen] = useState<TestDef | null>(null);

  if (chosen) {
    const r = results[chosen.id];
    return (
      <div className="mt-3" data-test-briefing={chosen.id}>
        <button className="text-sm text-sky-300 hover:underline" onClick={() => setChosen(null)}>
          ← All tests
        </button>
        <h2 className="mt-1 text-lg font-semibold">{chosen.title}</h2>
        <p className="text-sm text-slate-300">
          {CATEGORY_LABELS[chosen.category]} · about {chosen.minutes} min · {chosen.flight ? "Cessna 172" : "on the ground"} <ScoreBadge r={r} />
        </p>
        <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm leading-snug text-slate-100">
          {chosen.briefing.map((b, i) => (
            <li key={i}>{b}</li>
          ))}
        </ol>
        <p className="mt-2 text-xs text-slate-400">
          You pass with {PASS_SCORE}% or more, as long as nothing marked essential goes wrong. Press P to pause at any time; "Report a problem" and "End test" are on the test panel while you fly.
        </p>
        <button className="mt-3 rounded-md bg-emerald-600 px-5 py-2 font-semibold hover:bg-emerald-500 disabled:opacity-50" disabled={busy} onClick={() => onStart(chosen)}>
          {busy ? "Preparing…" : chosen.walkaround ? "Begin the inspection" : "Start test"}
        </button>
      </div>
    );
  }

  return (
    <div className="mt-3 space-y-3">
      <p className="text-sm text-slate-300">Scored exercises: find problems before flight, handle failures, fly in difficult weather, and practise the manoeuvres of a flight test. Each one ends with a debrief.</p>
      {CATEGORY_ORDER.map((cat) => (
        <section key={cat}>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">{CATEGORY_LABELS[cat]}</h3>
          <ul className="mt-1 space-y-1">
            {TESTS.filter((t) => t.category === cat).map((t) => (
              <li key={t.id}>
                <button data-test-id={t.id} className="flex min-h-11 w-full items-start gap-2 rounded-md bg-slate-800 px-3 py-2 text-left hover:bg-slate-700" onClick={() => setChosen(t)}>
                  <span className="flex-1">
                    <span className="block text-sm font-semibold">{t.title}</span>
                    <span className="block text-xs leading-snug text-slate-300">{t.summary}</span>
                  </span>
                  <ScoreBadge r={results[t.id]} />
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
