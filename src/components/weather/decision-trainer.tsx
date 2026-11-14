/**
 * Weather Decision Scenarios trainer — go / no-go / delay / divert with hazard identification and a
 * written justification, graded with explanatory feedback. A completed session is recorded as a
 * quiz attempt (course "weather", module "decisions") in the training record.
 */
import { useMemo, useState } from "react";
import { ArrowRight, CheckCircle2, CircleDashed, ClipboardCheck, RotateCcw, XCircle } from "lucide-react";

import { Notice, Pill } from "@/components/app/page";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { DECISION_LABEL, HAZARDS, WX_SCENARIOS, type Decision, type WxScenario } from "@/lib/weather-lab/scenarios";
import { actions } from "@/lib/store";
import { cn } from "@/lib/utils";

interface Grade {
  decisionPts: number;
  hazardPts: number;
  justPts: number;
  total: number;
  decisionVerdict: "best" | "acceptable" | "wrong";
  hit: string[];
  missed: string[];
  extra: string[];
  keywordHit: boolean;
}

interface Answer {
  decision: Decision;
  hazards: string[];
  justification: string;
  grade: Grade;
}

function grade(s: WxScenario, decision: Decision, hazards: string[], just: string): Grade {
  const decisionVerdict = decision === s.best ? "best" : s.acceptable.includes(decision) ? "acceptable" : "wrong";
  const decisionPts = decisionVerdict === "best" ? 50 : decisionVerdict === "acceptable" ? 25 : 0;
  const correct = new Set(s.hazards);
  const hit = hazards.filter((h) => correct.has(h));
  const extra = hazards.filter((h) => !correct.has(h));
  const missed = s.hazards.filter((h) => !hazards.includes(h));
  const hazardPts = correct.size === 0 ? Math.max(0, 40 - 10 * extra.length) : Math.round(40 * Math.max(0, (hit.length - 0.5 * extra.length) / correct.size));
  const text = just.toLowerCase();
  const keywordHit = s.keywords.some((k) => text.includes(k.toLowerCase()));
  const justPts = just.trim().length >= 20 ? (keywordHit ? 10 : 5) : 0;
  return { decisionPts, hazardPts, justPts, total: decisionPts + hazardPts + justPts, decisionVerdict, hit, missed, extra, keywordHit };
}

const hazardLabel = (id: string) => HAZARDS.find((h) => h.id === id)?.label ?? id;

export function DecisionTrainer() {
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [decision, setDecision] = useState<Decision | null>(null);
  const [hazards, setHazards] = useState<string[]>([]);
  const [just, setJust] = useState("");
  const [recorded, setRecorded] = useState(false);

  const s = WX_SCENARIOS[idx] as WxScenario;
  const ans = answers[s.id];
  const answeredCount = Object.keys(answers).length;
  const allDone = answeredCount === WX_SCENARIOS.length;
  const sessionScore = useMemo(() => {
    const xs = Object.values(answers);
    return { passed: xs.filter((a) => a.grade.total >= 70).length, avg: xs.length ? Math.round(xs.reduce((n, a) => n + a.grade.total, 0) / xs.length) : 0 };
  }, [answers]);

  const go = (i: number) => {
    setIdx(i);
    const next = WX_SCENARIOS[i];
    const a = next ? answers[next.id] : undefined;
    setDecision(a?.decision ?? null);
    setHazards(a?.hazards ?? []);
    setJust(a?.justification ?? "");
  };

  const submit = () => {
    if (!decision) return;
    const g = grade(s, decision, hazards, just);
    setAnswers((m) => ({ ...m, [s.id]: { decision, hazards, justification: just, grade: g } }));
  };

  const record = () => {
    if (recorded || answeredCount === 0) return;
    actions.recordQuiz(
      { course: "weather", moduleId: "decisions", title: `Weather Decision Scenarios (${answeredCount} scenario${answeredCount === 1 ? "" : "s"})`, score: sessionScore.passed, total: answeredCount, final: false },
      "/weather",
    );
    setRecorded(true);
  };

  const restart = () => {
    setAnswers({});
    setRecorded(false);
    setIdx(0);
    setDecision(null);
    setHazards([]);
    setJust("");
  };

  return (
    <div className="space-y-4">
      <Notice tone="caution" title="Simulated weather for training.">
        Every METAR, TAF, PIREP and advisory in these scenarios is invented for teaching. Never use them for a real flight — get an official briefing (1800wxbrief.com or another FAA-approved source).
      </Notice>

      <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
        <div className="space-y-2">
          <ol className="panel divide-y overflow-hidden">
            {WX_SCENARIOS.map((x, i) => {
              const a = answers[x.id];
              return (
                <li key={x.id}>
                  <button type="button" onClick={() => go(i)} className={cn("flex w-full items-start gap-2 px-3 py-2 text-left text-xs transition-colors", i === idx ? "bg-primary/10" : "hover:bg-accent/40")}>
                    {a ? a.grade.total >= 70 ? <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-ok" /> : <XCircle className="mt-0.5 size-3.5 shrink-0 text-warning" /> : <CircleDashed className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />}
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">{x.title}</span>
                      <span className="text-muted-foreground">
                        {x.rules} · {x.phase}
                        {a ? ` · ${a.grade.total}/100` : ""}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
          <div className="panel p-3 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Answered</span>
              <span className="font-mono">
                {answeredCount}/{WX_SCENARIOS.length}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Passed (≥ 70)</span>
              <span className="font-mono">{sessionScore.passed}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Average</span>
              <span className="font-mono">{sessionScore.avg}</span>
            </div>
            <div className="mt-2 flex flex-col gap-1.5">
              <Button size="sm" variant={allDone ? "default" : "outline"} disabled={recorded || answeredCount === 0} onClick={record}>
                <ClipboardCheck className="size-4" /> {recorded ? "Saved to your record" : allDone ? "Save session results" : "Finish & save session"}
              </Button>
              <Button size="sm" variant="ghost" onClick={restart} disabled={answeredCount === 0}>
                <RotateCcw className="size-4" /> Start over
              </Button>
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">A full session (all {WX_SCENARIOS.length}) with 80% passed unlocks the “Weather Wise” achievement.</p>
          </div>
        </div>

        <div className="panel min-w-0 p-4">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Pill tone={s.rules === "VFR" ? "ok" : "primary"}>{s.rules}</Pill>
            <Pill>{s.phase}</Pill>
            <span className="text-xs text-muted-foreground">
              Scenario {idx + 1} of {WX_SCENARIOS.length}
            </span>
          </div>
          <h3 className="text-lg font-semibold">{s.title}</h3>
          <dl className="mt-2 grid gap-1 text-sm">
            <div>
              <dt className="label-caps inline">Pilot & aircraft: </dt>
              <dd className="inline">{s.pilot}</dd>
            </div>
            <div>
              <dt className="label-caps inline">Flight: </dt>
              <dd className="inline">{s.flight}</dd>
            </div>
          </dl>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {s.products.map((p) => (
              <div key={p.label} className="avionics-screen p-2.5">
                <div className="label-caps mb-1">{p.label}</div>
                <pre className="font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-cyan">{p.text}</pre>
              </div>
            ))}
          </div>

          <div className="mt-4">
            <p className="label-caps mb-1.5">1 · Your decision</p>
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4" role="radiogroup" aria-label="Decision">
              {s.options.map((o) => {
                const isBest = ans && o === s.best;
                const isPicked = decision === o;
                return (
                  <button
                    key={o}
                    type="button"
                    role="radio"
                    aria-checked={isPicked}
                    disabled={!!ans}
                    onClick={() => setDecision(o)}
                    className={cn(
                      "rounded-md border px-2 py-2 text-sm font-semibold transition-colors",
                      isPicked && !ans && "border-primary/60 bg-primary/15 text-primary",
                      ans && isBest && "border-ok/50 bg-ok/10 text-ok",
                      ans && isPicked && !isBest && (s.acceptable.includes(o) ? "border-caution/50 bg-caution/10 text-caution" : "border-warning/50 bg-warning/10 text-warning"),
                      !isPicked && !ans && "hover:bg-accent/40",
                    )}
                  >
                    {DECISION_LABEL[o]}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-4">
            <p className="label-caps mb-1.5">2 · Hazards present (select all that apply)</p>
            <div className="grid gap-1 sm:grid-cols-2">
              {HAZARDS.map((h) => {
                const checked = hazards.includes(h.id);
                const correct = s.hazards.includes(h.id);
                return (
                  <label
                    key={h.id}
                    className={cn(
                      "flex cursor-pointer items-start gap-2 rounded border px-2 py-1.5 text-xs",
                      ans && correct && checked && "border-ok/40 bg-ok/5",
                      ans && correct && !checked && "border-caution/40 bg-caution/5",
                      ans && !correct && checked && "border-warning/40 bg-warning/5",
                      ans && "cursor-default",
                    )}
                  >
                    <input type="checkbox" checked={checked} disabled={!!ans} onChange={(e) => setHazards((xs) => (e.target.checked ? [...xs, h.id] : xs.filter((x) => x !== h.id)))} className="mt-0.5 accent-[var(--color-primary)]" />
                    <span className="flex-1">{h.label}</span>
                    {ans && correct ? <span className={checked ? "text-ok" : "text-caution"}>{checked ? "✓" : "missed"}</span> : null}
                    {ans && !correct && checked ? <span className="text-warning">not a factor</span> : null}
                  </label>
                );
              })}
            </div>
            {!ans ? <p className="mt-1 text-[11px] text-muted-foreground">If you see no significant hazards, leave everything unchecked.</p> : null}
          </div>

          <div className="mt-4">
            <p className="label-caps mb-1.5">3 · Justification</p>
            <Textarea value={just} onChange={(e) => setJust(e.target.value)} disabled={!!ans} rows={3} placeholder="Explain your decision in a sentence or two — cite the specific report, time, minimums or limitation that drove it." />
            {!ans ? (
              <div className="mt-2 flex items-center justify-between gap-2">
                <span className="text-[11px] text-muted-foreground">{just.trim().length < 20 ? `${20 - just.trim().length} more characters for full justification credit` : "Ready to submit"}</span>
                <Button onClick={submit} disabled={!decision}>
                  Submit decision
                </Button>
              </div>
            ) : null}
          </div>

          {ans ? (
            <div className="mt-5 space-y-3 rounded-md border bg-muted/20 p-4 animate-fade-up">
              <div className="flex flex-wrap items-center gap-3">
                <span className={cn("font-mono text-2xl font-bold", ans.grade.total >= 80 ? "text-ok" : ans.grade.total >= 70 ? "text-primary" : "text-warning")}>{ans.grade.total}/100</span>
                <span className="text-xs text-muted-foreground">
                  Decision {ans.grade.decisionPts}/50 · Hazards {ans.grade.hazardPts}/40 · Justification {ans.grade.justPts}/10
                </span>
              </div>
              <p className="text-sm">
                {ans.grade.decisionVerdict === "best" ? (
                  <span className="font-semibold text-ok">Best decision: {DECISION_LABEL[s.best]}. </span>
                ) : ans.grade.decisionVerdict === "acceptable" ? (
                  <span className="font-semibold text-caution">Acceptable, but the best choice was {DECISION_LABEL[s.best]}. </span>
                ) : (
                  <span className="font-semibold text-warning">The best choice was {DECISION_LABEL[s.best]}{s.acceptable.length ? ` (also acceptable: ${s.acceptable.map((d) => DECISION_LABEL[d]).join(", ")})` : ""}. </span>
                )}
                {s.explanation}
              </p>
              {ans.grade.missed.length || ans.grade.extra.length ? (
                <ul className="space-y-0.5 text-xs">
                  {ans.grade.missed.map((h) => (
                    <li key={h} className="text-caution">
                      Missed hazard: {hazardLabel(h)}
                    </li>
                  ))}
                  {ans.grade.extra.map((h) => (
                    <li key={h} className="text-warning">
                      Not a significant factor here: {hazardLabel(h)}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-ok">Hazard identification: spot on.</p>
              )}
              <p className="text-xs text-muted-foreground">
                Justification: {ans.grade.justPts === 10 ? "clear and specific." : ans.grade.justPts === 5 ? "consider citing the specific report element or limitation (e.g. ceiling vs. minimums, crosswind component, freezing level)." : "add a short written rationale — examiners expect you to explain your decision."}
              </p>
              <div>
                <p className="label-caps mb-1">Key points</p>
                <ul className="list-disc space-y-0.5 pl-5 text-xs">
                  {s.keyPoints.map((k) => (
                    <li key={k}>{k}</li>
                  ))}
                </ul>
              </div>
              {idx < WX_SCENARIOS.length - 1 ? (
                <Button size="sm" onClick={() => go(idx + 1)}>
                  Next scenario <ArrowRight className="size-4" />
                </Button>
              ) : !recorded ? (
                <Button size="sm" onClick={record}>
                  <ClipboardCheck className="size-4" /> Save session results
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
