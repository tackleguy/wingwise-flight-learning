/** The walk-around inspection: every item as found, OK / PROBLEM for each, then the go / no-go decision. */
import { useMemo, useState } from "react";
import { AREAS, DECISIONS, gradeInspection, type Decision, type InspectionItem } from "../walkaround";
import type { TestResult } from "../types";

export function Walkaround({ items, onDone, onCancel }: { items: InspectionItem[]; onDone: (r: TestResult) => void; onCancel: () => void }) {
  const [marks, setMarks] = useState<Record<string, "ok" | "problem" | undefined>>({});
  const [decision, setDecision] = useState<Decision | null>(null);
  const byArea = useMemo(() => AREAS.map((a) => [a, items.filter((i) => i.area === a)] as const), [items]);
  const checked = items.filter((i) => marks[i.id]).length;
  const mark = (id: string, v: "ok" | "problem") => setMarks((m) => ({ ...m, [id]: v }));
  return (
    <div className="absolute inset-0 z-50 overflow-y-auto bg-slate-950 p-3 select-text sm:p-6" data-walkaround="1">
      <div className="mx-auto w-full max-w-2xl rounded-2xl border border-slate-700 bg-slate-900 p-4 text-sm shadow-2xl">
        <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">Test · Preflight</div>
        <h2 className="text-xl font-semibold">Walk-around inspection — Cessna 172</h2>
        <p className="mt-1 text-slate-300">Read what you find at each item and mark it OK or PROBLEM. Then decide whether the aircraft may fly.</p>
        {byArea.map(([area, list]) => (
          <section key={area} className="mt-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-sky-300">{area}</h3>
            <ul className="mt-1 space-y-1.5">
              {list.map((i) => (
                <li key={i.id} className="rounded-md bg-slate-800/80 p-2" data-item={i.id}>
                  <div className="font-medium">{i.name}</div>
                  <div className="text-slate-300">
                    <span className="text-slate-400">You find: </span>
                    {i.seen}
                  </div>
                  <div className="mt-1.5 flex gap-1.5">
                    <button aria-pressed={marks[i.id] === "ok"} data-mark="ok" className={`min-h-10 flex-1 rounded px-3 py-1 font-medium ${marks[i.id] === "ok" ? "bg-emerald-600" : "bg-slate-700 hover:bg-slate-600"}`} onClick={() => mark(i.id, "ok")}>
                      OK
                    </button>
                    <button aria-pressed={marks[i.id] === "problem"} data-mark="problem" className={`min-h-10 flex-1 rounded px-3 py-1 font-medium ${marks[i.id] === "problem" ? "bg-red-600" : "bg-slate-700 hover:bg-slate-600"}`} onClick={() => mark(i.id, "problem")}>
                      PROBLEM
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}
        <section className="mt-5">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-sky-300">Your decision</h3>
          <div className="mt-1 grid gap-1.5" role="radiogroup">
            {DECISIONS.map((d) => (
              <button key={d.id} role="radio" aria-checked={decision === d.id} data-decision={d.id} className={`min-h-11 rounded-md px-3 py-2 text-left ${decision === d.id ? "bg-sky-600" : "bg-slate-800 hover:bg-slate-700"}`} onClick={() => setDecision(d.id)}>
                {d.label}
              </button>
            ))}
          </div>
        </section>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button className="min-h-11 rounded-md bg-emerald-600 px-5 py-2 font-semibold hover:bg-emerald-500 disabled:opacity-50" disabled={!decision} onClick={() => onDone(gradeInspection(items, marks, decision))}>
            Submit the inspection
          </button>
          <button className="min-h-11 rounded-md bg-slate-800 px-4 py-2 hover:bg-slate-700" onClick={onCancel}>
            Cancel
          </button>
          <span className="text-xs text-slate-400">
            {checked} of {items.length} items checked{decision ? "" : " · choose a decision to submit"}
          </span>
        </div>
      </div>
    </div>
  );
}
