/**
 * Checkride stages 1–6: preflight preparation, documents, aircraft knowledge, weather,
 * flight planning and the oral examination.
 */
import { useMemo, useState } from "react";
import { Calculator, CheckCircle2, CloudSun, FileWarning, XCircle } from "lucide-react";
import {
  AIRCRAFT_DOCS,
  aircraftQuestions,
  angleDiff,
  applicantItems,
  eligibilityQuestions,
  maintenanceScenario,
  planningScenario,
  selectScore,
  solvePlan,
  weatherScenario,
  type MxStatus,
} from "@/lib/checkride/content";
import { Meter, Notice, Pill } from "@/components/app/page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { OralExamSession, type OralSessionResult } from "@/components/oral/OralExamSession";
import { cn } from "@/lib/utils";
import { QuestionSet, SelectAllList, StageFrame, StageResult, questionScore, useToggleSet, type StageProps } from "./shared";

function useAnswers(n: number) {
  const [answers, setAnswers] = useState<(number | null)[]>(() => Array.from({ length: n }, () => null));
  const set = (i: number, c: number) => setAnswers((a) => a.map((v, j) => (j === i ? c : v)));
  return [answers, set] as const;
}

function SubmitBar({ onSubmit, disabled, hint }: { onSubmit: () => void; disabled?: boolean; hint?: string | undefined }) {
  return (
    <div className="mt-5 flex flex-wrap items-center gap-3 border-t pt-4">
      <Button onClick={onSubmit} disabled={disabled}>
        Submit for grading
      </Button>
      {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
    </div>
  );
}

// ───────────── 1 · Preflight preparation ─────────────

export function PreflightPrepStage({ track, stage, onComplete }: StageProps) {
  const items = useMemo(() => applicantItems(track.key), [track.key]);
  const questions = useMemo(() => eligibilityQuestions(track.key), [track.key]);
  const [sel, toggle] = useToggleSet();
  const [answers, setAnswer] = useAnswers(questions.length);
  const [revealed, setRevealed] = useState(false);

  const s1 = selectScore(items, sel);
  const qs = questionScore(questions, answers);
  const score = Math.round(0.5 * s1 + 0.5 * qs.score);
  const notes = [
    ...items.filter((i) => i.correct && !sel.has(i.id)).map((i) => `Did not present: ${i.label}.`),
    ...items.filter((i) => !i.correct && sel.has(i.id)).map((i) => `Unnecessary item listed: ${i.label}.`),
    ...qs.missed.map((m) => `Eligibility: ${m.prompt}`),
  ];

  return (
    <StageFrame stage={stage}>
      <p className="mb-3 text-sm">
        The examiner asks: <span className="italic">"Before we start, show me everything you've brought for the practical test."</span> Select every item you must present.
      </p>
      <SelectAllList items={items} selected={sel} onToggle={toggle} revealed={revealed} />
      <h3 className="mb-2 mt-6 text-sm font-semibold">Eligibility questions</h3>
      <QuestionSet questions={questions} answers={answers} onAnswer={setAnswer} revealed={revealed} />
      {!revealed ? (
        <SubmitBar onSubmit={() => setRevealed(true)} disabled={answers.some((a) => a === null)} hint="Answer every eligibility question to submit." />
      ) : (
        <StageResult score={score} notes={notes.length ? notes : ["All required items presented and eligibility confirmed."]} onContinue={() => onComplete(score, notes.length ? notes : ["All required items presented and eligibility confirmed."])} />
      )}
    </StageFrame>
  );
}

// ───────────── 2 · Document inspection ─────────────

const MX_OPTIONS: { id: MxStatus; label: string }[] = [
  { id: "current", label: "Current" },
  { id: "expired", label: "Expired / overdue" },
  { id: "not-required", label: "Not required today" },
];

export function DocumentsStage({ attempt, track, stage, onComplete }: StageProps) {
  const scenario = useMemo(() => maintenanceScenario(attempt.id, attempt.date, track.ifr), [attempt.id, attempt.date, track.ifr]);
  const [docs, toggleDoc] = useToggleSet();
  const [marks, setMarks] = useState<Record<string, MxStatus>>({});
  const [airworthy, setAirworthy] = useState<"yes" | "no" | null>(null);
  const [revealed, setRevealed] = useState(false);

  const truthAirworthy = scenario.records.every((r) => !r.accept.includes("expired") || r.accept.includes("current"));
  const docScore = selectScore(AIRCRAFT_DOCS, docs);
  const recCorrect = scenario.records.filter((r) => {
    const m = marks[r.id];
    return m !== undefined && r.accept.includes(m);
  }).length;
  const recScore = Math.round((recCorrect / scenario.records.length) * 100);
  const decisionScore = airworthy === (truthAirworthy ? "yes" : "no") ? 100 : 0;
  const score = Math.round(0.3 * docScore + 0.5 * recScore + 0.2 * decisionScore);
  const notes = [
    ...AIRCRAFT_DOCS.filter((d) => d.correct && !docs.has(d.id)).map((d) => `Missed required document: ${d.label}.`),
    ...AIRCRAFT_DOCS.filter((d) => !d.correct && docs.has(d.id)).map((d) => `Listed a document not required on board: ${d.label}.`),
    ...scenario.records.filter((r) => !r.accept.includes(marks[r.id] ?? ("" as MxStatus))).map((r) => `Maintenance record misjudged — ${r.item}: ${r.why}`),
    decisionScore ? `Correctly determined the airplane is ${truthAirworthy ? "airworthy" : "NOT airworthy"} for the checkride.` : `Incorrect airworthiness determination — the airplane is ${truthAirworthy ? "airworthy" : "not airworthy"}.`,
  ];
  const complete = Object.keys(marks).length === scenario.records.length && airworthy !== null;

  return (
    <StageFrame stage={stage}>
      <h3 className="mb-1 text-sm font-semibold">A · Required aircraft documents</h3>
      <p className="mb-2 text-xs text-muted-foreground">Which documents must be on board the airplane for this domestic flight? Select all that apply.</p>
      <SelectAllList items={AIRCRAFT_DOCS} selected={docs} onToggle={toggleDoc} revealed={revealed} />

      <h3 className="mb-1 mt-6 flex items-center gap-1.5 text-sm font-semibold">
        <FileWarning className="size-4 text-caution" /> B · Maintenance records
      </h3>
      <p className="mb-3 text-xs text-muted-foreground">
        {scenario.intro} The planned flight includes a cross-country leg beyond 50 NM, so the ELT exemption for local training flights does not apply.{" "}
        {track.ifr ? "This is an IFR checkride in controlled airspace." : "This is a VFR checkride."}
      </p>
      <div className="grid gap-2">
        {scenario.records.map((r) => {
          const m = marks[r.id];
          const ok = m !== undefined && r.accept.includes(m);
          return (
            <div key={r.id} className={cn("rounded-md border px-3 py-2.5", revealed && (ok ? "border-ok/40" : "border-warning/50"))}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{r.item}</p>
                  <p className="font-mono text-[12px] text-cyan">{r.entry}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">{r.rule}</p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-1" role="radiogroup" aria-label={`${r.item} status`}>
                  {MX_OPTIONS.map((o) => (
                    <button
                      key={o.id}
                      type="button"
                      role="radio"
                      aria-checked={m === o.id}
                      disabled={revealed}
                      onClick={() => setMarks((prev) => ({ ...prev, [r.id]: o.id }))}
                      className={cn(
                        "rounded border px-2 py-1 text-[11px] font-medium",
                        m === o.id ? "border-primary bg-primary/15 text-foreground" : "text-muted-foreground hover:bg-accent",
                        revealed && r.accept.includes(o.id) && "border-ok/60 text-ok",
                      )}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>
              {revealed ? (
                <p className="mt-1.5 flex items-start gap-1 text-xs text-foreground/85">
                  {ok ? <CheckCircle2 className="mt-px size-3.5 shrink-0 text-ok" /> : <XCircle className="mt-px size-3.5 shrink-0 text-warning" />} {r.why}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>

      <h3 className="mb-2 mt-6 text-sm font-semibold">C · Can the checkride be flown in this airplane today?</h3>
      <div className="flex flex-wrap gap-2">
        {(["yes", "no"] as const).map((v) => (
          <button
            key={v}
            type="button"
            disabled={revealed}
            onClick={() => setAirworthy(v)}
            className={cn("rounded-md border px-4 py-2 text-sm font-medium", airworthy === v ? "border-primary bg-primary/15" : "hover:bg-accent", revealed && (v === "yes") === truthAirworthy && "border-ok/60 text-ok")}
          >
            {v === "yes" ? "Yes — airworthy" : "No — not airworthy"}
          </button>
        ))}
      </div>

      {!revealed ? (
        <SubmitBar onSubmit={() => setRevealed(true)} disabled={!complete} hint={complete ? undefined : "Classify every record and make the airworthiness decision."} />
      ) : (
        <StageResult score={score} notes={notes} onContinue={() => onComplete(score, notes)} />
      )}
    </StageFrame>
  );
}

// ───────────── 3 · Aircraft knowledge ─────────────

export function AircraftKnowledgeStage({ attempt, track, stage, onComplete }: StageProps) {
  const questions = useMemo(() => aircraftQuestions(track.key, attempt.id), [track.key, attempt.id]);
  const [answers, setAnswer] = useAnswers(questions.length);
  const [revealed, setRevealed] = useState(false);
  const { score, missed } = questionScore(questions, answers);
  const notes = missed.length ? missed.map((m) => `Review (${m.subject}): ${m.prompt}`) : ["All systems questions answered correctly."];
  return (
    <StageFrame stage={stage}>
      <p className="mb-3 text-sm">
        The examiner asks about the systems and instruments of the airplane you'll fly{track.ifr ? ", focusing on equipment used for IFR" : ""}.
      </p>
      <QuestionSet questions={questions} answers={answers} onAnswer={setAnswer} revealed={revealed} />
      {!revealed ? (
        <SubmitBar onSubmit={() => setRevealed(true)} disabled={answers.some((a) => a === null)} hint="Answer all questions to submit." />
      ) : (
        <StageResult score={score} notes={notes} onContinue={() => onComplete(score, notes)} />
      )}
    </StageFrame>
  );
}

// ───────────── 4 · Weather ─────────────

export function WeatherStage({ track, stage, onComplete }: StageProps) {
  const wx = useMemo(() => weatherScenario(track.key), [track.key]);
  const [answers, setAnswer] = useAnswers(wx.questions.length);
  const [decision, setDecision] = useState<string | null>(null);
  const [reasons, toggleReason] = useToggleSet();
  const [revealed, setRevealed] = useState(false);

  const decode = questionScore(wx.questions, answers);
  const decisionOk = decision === wx.correctDecision;
  const reasonScore = selectScore(wx.reasons, reasons);
  const score = Math.round(0.5 * decode.score + 0.3 * (decisionOk ? 100 : 0) + 0.2 * reasonScore);
  const notes = [
    ...decode.missed.map((m) => `Decoding: ${m.prompt}`),
    decisionOk ? `Sound go/no-go decision: ${wx.decisions.find((d) => d.id === decision)?.label}.` : `Go/no-go decision not supported by the weather. ${wx.decisionWhy}`,
    ...(reasonScore < 100 ? [`Justification incomplete (${reasonScore}%) — ${wx.reasons.filter((r) => r.correct && !reasons.has(r.id)).map((r) => r.label).join("; ") || "included an incorrect reason"}.`] : []),
  ];

  return (
    <StageFrame stage={stage}>
      <p className="mb-3 flex gap-2 text-sm">
        <CloudSun className="mt-0.5 size-4 shrink-0 text-primary" /> {wx.intro}
      </p>
      <div className="mb-5 grid gap-2">
        {wx.reports.map((r) => (
          <div key={r.label} className="avionics-screen px-3 py-2">
            <div className="label-caps text-[10px]">{r.label}</div>
            <pre className="whitespace-pre-wrap break-words font-mono text-[12.5px] leading-relaxed text-cyan">{r.text}</pre>
          </div>
        ))}
      </div>
      <h3 className="mb-2 text-sm font-semibold">A · Decode</h3>
      <QuestionSet questions={wx.questions} answers={answers} onAnswer={setAnswer} revealed={revealed} />
      <h3 className="mb-2 mt-6 text-sm font-semibold">B · Your decision</h3>
      <div className="grid gap-1.5">
        {wx.decisions.map((d) => (
          <button
            key={d.id}
            type="button"
            disabled={revealed}
            onClick={() => setDecision(d.id)}
            className={cn(
              "rounded-md border px-3 py-2.5 text-left text-sm",
              decision === d.id ? "border-primary bg-primary/10" : "hover:bg-accent/40",
              revealed && d.id === wx.correctDecision && "border-ok/60 bg-ok/10",
              revealed && decision === d.id && d.id !== wx.correctDecision && "border-warning/60 bg-warning/10",
            )}
          >
            {d.label}
          </button>
        ))}
      </div>
      {revealed ? <Notice className="mt-2" title="Examiner's view:">{wx.decisionWhy}</Notice> : null}
      <h3 className="mb-2 mt-6 text-sm font-semibold">C · Justify it — select every reason that applies</h3>
      <SelectAllList items={wx.reasons} selected={reasons} onToggle={toggleReason} revealed={revealed} />
      {!revealed ? (
        <SubmitBar onSubmit={() => setRevealed(true)} disabled={answers.some((a) => a === null) || !decision} hint="Decode all reports and choose a decision." />
      ) : (
        <StageResult score={score} notes={notes} onContinue={() => onComplete(score, notes)} />
      )}
    </StageFrame>
  );
}

// ───────────── 5 · Flight planning ─────────────

const PLAN_FIELDS = [
  { id: "th", label: "True heading", unit: "°", tol: 3 },
  { id: "mh", label: "Magnetic heading", unit: "°", tol: 3 },
  { id: "gs", label: "Groundspeed", unit: "kt", tol: 4 },
  { id: "ete", label: "Time en route", unit: "min", tol: 3 },
  { id: "fuel", label: "Fuel required incl. reserve", unit: "gal", tol: 1 },
] as const;

export function PlanningStage({ track, stage, onComplete }: StageProps) {
  const p = useMemo(() => planningScenario(track.key), [track.key]);
  const sol = useMemo(() => solvePlan(p), [p]);
  const [vals, setVals] = useState<Record<string, string>>({});
  const [revealed, setRevealed] = useState(false);

  const expected: Record<string, number> = { th: sol.trueHeading, mh: sol.magHeading, gs: sol.groundspeed, ete: sol.eteMin, fuel: sol.fuelGal };
  const results = PLAN_FIELDS.map((f) => {
    const v = Number(vals[f.id]);
    const exp = expected[f.id] ?? 0;
    const err = f.id === "th" || f.id === "mh" ? angleDiff(v, exp) : Math.abs(v - exp);
    return { ...f, v, exp, ok: vals[f.id] !== undefined && vals[f.id] !== "" && Number.isFinite(v) && err <= f.tol };
  });
  const score = Math.round((results.filter((r) => r.ok).length / results.length) * 100);
  const notes = results.filter((r) => !r.ok).map((r) => `${r.label}: you entered ${Number.isFinite(r.v) && vals[r.id] ? r.v : "—"}, expected ≈ ${r.exp.toFixed(r.id === "fuel" ? 1 : 0)} ${r.unit} (±${r.tol}).`);
  const varLabel = `${Math.abs(p.variationDeg)}°${p.variationDeg >= 0 ? "E" : "W"}`;
  const filled = PLAN_FIELDS.every((f) => vals[f.id] !== undefined && vals[f.id] !== "");

  return (
    <StageFrame stage={stage}>
      <p className="mb-3 flex gap-2 text-sm">
        <Calculator className="mt-0.5 size-4 shrink-0 text-primary" /> {p.intro} Use an E6B, flight computer or the wind-triangle formulas. Tolerances: headings ±3°, groundspeed ±4 kt, time ±3 min, fuel ±1 gal.
      </p>
      <div className="avionics-screen mb-5 grid grid-cols-2 gap-x-6 gap-y-1.5 px-4 py-3 font-mono text-[13px] sm:grid-cols-4">
        {[
          ["True course", `${String(p.trueCourse).padStart(3, "0")}°`],
          ["Distance", `${p.distanceNm} NM`],
          ["TAS", `${p.tas} kt`],
          ["Wind (true)", `${String(p.windDir).padStart(3, "0")}° / ${p.windKt} kt`],
          ["Variation", varLabel],
          ["Fuel burn", `${p.gph} GPH`],
          ["Reserve", `${p.reserveMin} min`],
        ].map(([k, v]) => (
          <div key={k}>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{k}</div>
            <div className="text-cyan">{v}</div>
          </div>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {results.map((r) => (
          <label key={r.id} className="block">
            <span className="label-caps text-[10px]">
              {r.label} ({r.unit})
            </span>
            <Input
              inputMode="decimal"
              value={vals[r.id] ?? ""}
              disabled={revealed}
              onChange={(e) => setVals((v) => ({ ...v, [r.id]: e.target.value.replace(/[^0-9.]/g, "") }))}
              className={cn("mt-1 font-mono", revealed && (r.ok ? "border-ok/60" : "border-warning/60"))}
              aria-label={r.label}
            />
            {revealed ? (
              <span className={cn("mt-1 block font-mono text-[11px]", r.ok ? "text-ok" : "text-warning")}>
                ≈ {r.exp.toFixed(r.id === "fuel" ? 1 : 0)} {r.unit}
              </span>
            ) : null}
          </label>
        ))}
      </div>
      {revealed ? (
        <div className="mt-4 rounded-md border bg-muted/30 p-3 text-xs leading-relaxed text-foreground/85">
          <p className="mb-1 font-semibold text-foreground">Worked solution</p>
          <p>
            Wind angle = wind direction − true course = {p.windDir}° − {p.trueCourse}°. Crosswind = {p.windKt} × sin(angle) ≈ {(p.windKt * Math.sin(((p.windDir - p.trueCourse) * Math.PI) / 180)).toFixed(1)} kt; WCA = arcsin(crosswind ÷ TAS) ≈ {sol.wca.toFixed(1)}° ({sol.wca >= 0 ? "right" : "left"}).
          </p>
          <p>
            True heading = {p.trueCourse}° {sol.wca >= 0 ? "+" : "−"} {Math.abs(sol.wca).toFixed(1)}° ≈ {sol.trueHeading.toFixed(0)}°. Magnetic heading = TH {p.variationDeg >= 0 ? "−" : "+"} {Math.abs(p.variationDeg)}° ({varLabel}; east is least, west is best) ≈ {sol.magHeading.toFixed(0)}°.
          </p>
          <p>
            Groundspeed = TAS × cos(WCA) − wind × cos(angle) ≈ {sol.groundspeed.toFixed(0)} kt. ETE = {p.distanceNm} ÷ {sol.groundspeed.toFixed(1)} × 60 ≈ {sol.eteMin.toFixed(0)} min.
          </p>
          <p>
            Fuel = ({sol.eteMin.toFixed(1)} + {p.reserveMin}) min ÷ 60 × {p.gph} GPH ≈ {sol.fuelGal.toFixed(1)} gal ({p.reserveLabel}). Real planning also adds taxi and climb fuel.
          </p>
        </div>
      ) : null}
      {!revealed ? (
        <SubmitBar onSubmit={() => setRevealed(true)} disabled={!filled} hint={filled ? undefined : "Fill in every field."} />
      ) : (
        <StageResult score={score} notes={notes.length ? notes : ["All planning computations within tolerance."]} onContinue={() => onComplete(score, notes.length ? notes : ["All planning computations within tolerance."])} />
      )}
    </StageFrame>
  );
}

// ───────────── 6 · Oral ─────────────

export function OralStage({ track, stage, onComplete }: StageProps) {
  const [result, setResult] = useState<OralSessionResult | null>(null);
  const notes = result
    ? [
        `Oral score ${result.score}/100 across ${result.items.length} scenario questions.`,
        ...result.byTopic.filter((t) => t.score < 70).map((t) => `Review ${t.topic} (${t.score}).`),
      ]
    : [];
  return (
    <StageFrame stage={stage} aside={<Pill tone="caution">No hints</Pill>}>
      {!result ? (
        <>
          <p className="mb-3 text-sm text-muted-foreground">Six scenario-based examiner questions. Answer by typing or speaking; the examiner will follow up on incomplete answers.</p>
          <OralExamSession level="checkride" trackId={track.trackId} count={6} showReport={false} onComplete={setResult} />
        </>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            {result.byTopic.map((t) => (
              <Meter key={t.topic} value={t.score} label={t.topic} />
            ))}
          </div>
          <StageResult score={result.score} notes={notes} onContinue={() => onComplete(result.score, notes)} />
        </>
      )}
    </StageFrame>
  );
}
