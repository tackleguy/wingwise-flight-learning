import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { BarChart3, BookOpen, CheckCircle2, Circle, Flame, Plane, Target } from "lucide-react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { EmptyState, Meter, Page, PageHeader, Panel, Section, Stat } from "@/components/app/page";
import { COURSES } from "@/lib/content";
import { WRITTEN_EXAM_NAMES, activityDays, computeMetrics, courseLessonProgress, dayKey, isWrittenExam, ladderProgress, streaks, subjectStrengths } from "@/lib/metrics";
import { useHydrated, useStore, type TrainingState } from "@/lib/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/progress")({
  head: () => ({
    meta: [
      { title: "Progress & Statistics — TeachX" },
      { name: "description", content: "Score trends, proficiency radar, lesson completion, subject strengths and training activity — computed from your real training record." },
    ],
  }),
  component: ProgressPage,
});

const C1 = "var(--color-chart-1)";
const C2 = "var(--color-chart-2)";
const AXIS = "oklch(0.68 0.025 250)";
const GRID = "oklch(1 0 0 / 0.06)";

type Pt = { t: number; v: number; label: string };

function series<T extends { date: string }>(xs: T[], v: (x: T) => number, label: (x: T) => string): Pt[] {
  return [...xs]
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .map((x) => ({ t: new Date(x.date).getTime(), v: Math.round(v(x)), label: label(x) }));
}

function ProgressPage() {
  const hydrated = useHydrated();
  const state = useStore((s) => s);
  const m = useMemo(() => computeMetrics(state), [state]);
  const ladder = useMemo(() => ladderProgress(state, m), [state, m]);
  const st = useMemo(() => streaks(state), [state]);
  const hasAny = state.flights.length + state.quizzes.length + state.exams.length + state.atcSessions.length + state.orals.length + state.checkrides.length + Object.keys(state.lessons).length > 0;

  return (
    <Page wide>
      <PageHeader
        eyebrow="Overview"
        icon={BarChart3}
        title="Progress & Statistics"
        description="Everything on this page is computed from your own training record in this browser. Proficiencies stay at 0% until you have real results for them."
      />

      {!hydrated ? null : !hasAny ? (
        <EmptyState
          icon={BarChart3}
          title="No training data yet"
          description="Complete a lesson, take a quiz, fly a simulator scenario or practice with ATC — your charts and proficiency scores will build from there."
          action={{ to: "/vfr", label: "Start VFR ground school" }}
        />
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <Stat label="Training level" value={<span className="text-lg">{m.trainingLevel.label}</span>} sub={`Level ${m.trainingLevel.level + 1} of 8`} tone="primary" />
            <Stat label="Lessons" value={`${m.lessonsDone}/${m.lessonsTotal || "—"}`} icon={BookOpen} />
            <Stat label="Sim flights" value={m.flights} sub={`${m.simHours.toFixed(1)} h simulated`} icon={Plane} />
            <Stat label="Landings" value={m.landings} />
            <Stat label="Current streak" value={`${st.current}d`} sub={`Longest ${st.longest} days`} icon={Flame} tone={st.current >= 3 ? "ok" : "default"} />
            <Stat label="Written readiness" value={`${m.writtenReadiness}%`} icon={Target} tone={m.writtenReadiness >= 80 ? "ok" : m.writtenReadiness >= 70 ? "primary" : "default"} />
          </div>

          <div className="mb-8 grid gap-4 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
            <Panel title="Proficiency radar">
              <ProficiencyRadar m={m} />
            </Panel>
            <Panel title={`Training level — ${m.trainingLevel.label}`}>
              <div className="mb-3">
                <Meter value={m.trainingLevel.pct} label={`Progress to ${m.trainingLevel.nextLabel}`} />
              </div>
              <ol className="grid gap-2 sm:grid-cols-2">
                {ladder.map((lvl, i) => {
                  const reached = i <= m.trainingLevel.level;
                  const isNext = i === m.trainingLevel.level + 1;
                  return (
                    <li key={lvl.label} className={cn("rounded-md border p-2.5", reached ? "border-ok/30 bg-ok/5" : isNext ? "border-primary/40 bg-primary/5" : "opacity-70")}>
                      <div className="flex items-center gap-2 text-sm font-semibold">
                        {reached ? <CheckCircle2 className="size-4 text-ok" /> : <Circle className="size-4 text-muted-foreground" />}
                        <span className="font-mono text-xs text-muted-foreground">{i + 1}</span> {lvl.label}
                      </div>
                      {lvl.reqs.length ? (
                        <ul className="mt-1.5 space-y-0.5 pl-6 text-[11px] text-muted-foreground">
                          {lvl.reqs.map((r) => (
                            <li key={r.label} className={cn(r.progress >= 1 && "text-ok")}>
                              {r.progress >= 1 ? "✓ " : `${Math.round(r.progress * 100)}% · `}
                              {r.label}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="mt-1 pl-6 text-[11px] text-muted-foreground">{lvl.description}</p>
                      )}
                    </li>
                  );
                })}
              </ol>
            </Panel>
          </div>

          <Section title="Score trends" description="Each point is one attempt. Hover for details.">
            <div className="grid gap-4 lg:grid-cols-2">
              <TrendChart
                title="Knowledge: quizzes & exams"
                a={{ name: "Quizzes", data: series(state.quizzes, (q) => (q.total ? (q.score / q.total) * 100 : 0), (q) => q.title) }}
                b={{ name: "Exams", data: series(state.exams, (e) => e.scorePct, (e) => `${e.title}${e.mode === "timed" ? " (timed)" : " (study)"}`) }}
                empty="Take a module quiz or practice test to see your knowledge trend."
                emptyTo="/practice-tests"
              />
              <TrendChart title="Simulator flight scores" a={{ name: "Flight score", data: series(state.flights, (f) => f.score, (f) => f.scenarioTitle) }} empty="Fly a scenario in the simulator to see your scores." emptyTo="/simulator" />
              <TrendChart title="ATC communication scores" a={{ name: "ATC score", data: series(state.atcSessions, (a) => a.score, (a) => `${a.title} (${a.difficulty})`) }} empty="Practice radio calls with the ATC simulator." emptyTo="/atc" />
              <TrendChart
                title="Oral exams & mock checkrides"
                a={{ name: "Oral", data: series(state.orals, (o) => o.score, (o) => `Oral (${o.level})`) }}
                b={{ name: "Checkride", data: series(state.checkrides.filter((c) => c.completed), (c) => c.overall, (c) => `${c.title} — ${c.passed ? "satisfactory" : "unsatisfactory"}`) }}
                empty="Try the oral exam simulator or a mock checkride."
                emptyTo="/oral-exam"
              />
            </div>
          </Section>

          <div className="mb-8 grid gap-4 lg:grid-cols-2">
            <Panel title="Lesson completion by course">
              <CourseCompletion state={state} />
            </Panel>
            <Panel title="Written exam history">
              <WrittenHistory state={state} />
            </Panel>
          </div>

          <Section title="Subject strengths" description="Aggregated from the subject breakdown of every practice test and written exam you've taken — weakest first.">
            <SubjectTable state={state} />
          </Section>

          <Section title="Training activity" description="Days with any recorded training (lessons, quizzes, exams, flights, ATC, oral, checkrides, avionics tasks) over the last 26 weeks.">
            <ActivityHeatmap state={state} />
          </Section>
        </>
      )}
    </Page>
  );
}

function ProficiencyRadar({ m }: { m: ReturnType<typeof computeMetrics> }) {
  const data = [
    { k: "VFR", v: m.vfrProficiency },
    { k: "IFR", v: m.ifrProficiency },
    { k: "ATC", v: m.atcScore },
    { k: "Avionics", v: m.avionicsProficiency },
    { k: "Written", v: m.writtenReadiness },
    { k: "Oral", v: m.oralScore },
  ];
  return (
    <div>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={data} outerRadius="72%">
            <PolarGrid stroke={GRID} />
            <PolarAngleAxis dataKey="k" tick={{ fill: AXIS, fontSize: 11 }} />
            <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
            <Radar dataKey="v" stroke={C1} strokeWidth={2} fill={C1} fillOpacity={0.2} dot={{ r: 3, fill: C1 }} isAnimationActive={false} />
            <Tooltip content={<RadarTip />} />
          </RadarChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2">
        {data.map((d) => (
          <Meter key={d.k} value={d.v} label={d.k} />
        ))}
      </div>
    </div>
  );
}

function RadarTip({ active, payload }: { active?: boolean; payload?: { payload: { k: string; v: number } }[] }) {
  const p = payload?.[0]?.payload;
  if (!active || !p) return null;
  return (
    <div className="rounded-md border bg-popover px-2.5 py-1.5 text-xs shadow">
      <span className="text-muted-foreground">{p.k}</span> <span className="font-mono font-semibold">{p.v}%</span>
    </div>
  );
}

function TrendTip({ active, payload }: { active?: boolean; payload?: { name?: string; payload: Pt }[] }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="max-w-[240px] rounded-md border bg-popover px-2.5 py-1.5 text-xs shadow">
      {payload.map((p, i) => (
        <div key={i}>
          <div className="text-muted-foreground">{new Date(p.payload.t).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</div>
          <div className="font-medium">{p.payload.label}</div>
          <div>
            {p.name}: <span className="font-mono font-semibold">{p.payload.v}%</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function TrendChart({ title, a, b, empty, emptyTo }: { title: string; a: { name: string; data: Pt[] }; b?: { name: string; data: Pt[] }; empty: string; emptyTo: string }) {
  const all = [...a.data, ...(b?.data ?? [])];
  const avg = (xs: Pt[]) => (xs.length ? Math.round(xs.reduce((s, x) => s + x.v, 0) / xs.length) : null);
  return (
    <div className="panel">
      <div className="flex items-center justify-between border-b px-4 py-2.5">
        <span className="label-caps">{title}</span>
        <span className="text-[11px] text-muted-foreground">
          {a.data.length ? `${a.name} avg ${avg(a.data)}%` : ""}
          {b && b.data.length ? ` · ${b.name} avg ${avg(b.data)}%` : ""}
        </span>
      </div>
      <div className="p-3">
        {all.length === 0 ? (
          <div className="grid h-52 place-items-center text-center text-sm text-muted-foreground">
            <div>
              {empty}
              <div className="mt-2">
                <Link to={emptyTo} className="text-primary hover:underline">
                  Go there →
                </Link>
              </div>
            </div>
          </div>
        ) : (
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
                <CartesianGrid stroke={GRID} vertical={false} />
                <XAxis
                  dataKey="t"
                  type="number"
                  scale="time"
                  domain={["dataMin", "dataMax"]}
                  tickFormatter={(t: number) => new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                  tick={{ fill: AXIS, fontSize: 10 }}
                  stroke={GRID}
                  allowDuplicatedCategory={false}
                />
                <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tick={{ fill: AXIS, fontSize: 10 }} stroke={GRID} />
                <Tooltip content={<TrendTip />} cursor={{ stroke: AXIS, strokeDasharray: "3 3" }} />
                {b ? <Legend wrapperStyle={{ fontSize: 11 }} iconType="plainline" /> : null}
                <Line data={a.data} dataKey="v" name={a.name} stroke={C1} strokeWidth={2} dot={{ r: 4, fill: C1, stroke: "var(--color-card)", strokeWidth: 2 }} activeDot={{ r: 6 }} isAnimationActive={false} />
                {b ? <Line data={b.data} dataKey="v" name={b.name} stroke={C2} strokeWidth={2} dot={{ r: 4, fill: C2, stroke: "var(--color-card)", strokeWidth: 2 }} activeDot={{ r: 6 }} isAnimationActive={false} /> : null}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}

function CourseCompletion({ state }: { state: TrainingState }) {
  const [open, setOpen] = useState<string | null>(null);
  if (COURSES.length === 0) return <p className="text-sm text-muted-foreground">Course content is loading.</p>;
  return (
    <div className="space-y-4">
      {COURSES.map((c) => {
        const p = courseLessonProgress(state, c.id);
        const isOpen = open === c.id;
        return (
          <div key={c.id}>
            <button type="button" onClick={() => setOpen(isOpen ? null : c.id)} className="w-full text-left" aria-expanded={isOpen}>
              <Meter value={p.pct} label={`${c.title} — ${p.done}/${p.total} lessons`} />
            </button>
            {isOpen ? (
              <ul className="mt-2 space-y-1.5 border-l pl-3">
                {c.modules.map((mod) => {
                  const done = mod.lessons.filter((l) => state.lessons[l.id]).length;
                  const pct = mod.lessons.length ? (done / mod.lessons.length) * 100 : 0;
                  return (
                    <li key={mod.id} className="text-xs">
                      <Link to="/academy/$course/$module" params={{ course: c.id, module: mod.id }} className="mb-0.5 flex justify-between hover:text-primary">
                        <span>
                          {mod.number}. {mod.title}
                        </span>
                        <span className="font-mono text-muted-foreground">
                          {done}/{mod.lessons.length}
                        </span>
                      </Link>
                      <div className="h-1 overflow-hidden rounded-full bg-muted">
                        <div className={cn("h-full rounded-full", pct >= 100 ? "bg-ok" : "bg-primary")} style={{ width: `${pct}%` }} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="mt-1 text-[11px] text-muted-foreground">Click to see module-by-module completion.</p>
            )}
          </div>
        );
      })}
    </div>
  );
}

function WrittenHistory({ state }: { state: TrainingState }) {
  const rows = Object.keys(WRITTEN_EXAM_NAMES)
    .map((id) => {
      const xs = state.exams.filter((e) => e.examId === id);
      return { id, name: WRITTEN_EXAM_NAMES[id] ?? id, attempts: xs.length, best: xs.length ? Math.max(...xs.map((e) => e.scorePct)) : null, last: [...xs].sort((a, b) => (a.date < b.date ? 1 : -1))[0] };
    })
    .filter((r) => r.attempts > 0);
  const other = state.exams.filter((e) => !isWrittenExam(e.examId)).length;
  if (rows.length === 0)
    return (
      <div className="text-sm text-muted-foreground">
        No full written exams yet{other ? ` (${other} topic practice test${other > 1 ? "s" : ""} taken)` : ""}.{" "}
        <Link to="/written-exams" className="text-primary hover:underline">
          Take a written exam →
        </Link>
      </div>
    );
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b text-left">
          <th className="label-caps py-1.5">Exam</th>
          <th className="label-caps py-1.5 text-right">Tries</th>
          <th className="label-caps py-1.5 text-right">Best</th>
          <th className="label-caps py-1.5 text-right">Last</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id} className="border-b last:border-0">
            <td className="py-1.5 text-xs">{r.name}</td>
            <td className="py-1.5 text-right font-mono text-xs">{r.attempts}</td>
            <td className={cn("py-1.5 text-right font-mono text-xs", (r.best ?? 0) >= 70 ? "text-ok" : "text-caution")}>{r.best !== null ? `${Math.round(r.best)}%` : "—"}</td>
            <td className="py-1.5 text-right font-mono text-xs">{r.last ? `${Math.round(r.last.scorePct)}%` : "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function SubjectTable({ state }: { state: TrainingState }) {
  const rows = useMemo(() => subjectStrengths(state), [state]);
  if (rows.length === 0)
    return <EmptyState icon={Target} title="No subject data yet" description="Practice tests and written exams break your score down by subject. Take one to see your strongest and weakest areas." action={{ to: "/practice-tests", label: "Practice tests" }} />;
  return (
    <div className="panel overflow-x-auto">
      <table className="w-full min-w-[520px] text-sm">
        <thead>
          <tr className="border-b bg-muted/40 text-left">
            <th className="label-caps px-4 py-2">Subject</th>
            <th className="label-caps px-2 py-2 text-right">Correct</th>
            <th className="label-caps w-1/3 px-2 py-2">Accuracy</th>
            <th className="label-caps px-4 py-2">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.subject} className="border-b last:border-0">
              <td className="px-4 py-2">{r.subject}</td>
              <td className="px-2 py-2 text-right font-mono text-xs">
                {r.correct}/{r.total}
              </td>
              <td className="px-2 py-2">
                <div className="flex items-center gap-2">
                  <Meter value={r.pct} className="flex-1" />
                  <span className="w-10 text-right font-mono text-xs">{Math.round(r.pct)}%</span>
                </div>
              </td>
              <td className="px-4 py-2 text-xs">
                {r.pct >= 80 ? <span className="text-ok">Strong</span> : r.pct >= 70 ? <span className="text-primary">Passing</span> : <span className="text-caution">Needs review</span>}
                {r.total < 5 ? <span className="ml-1 text-muted-foreground">(few questions)</span> : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ActivityHeatmap({ state }: { state: TrainingState }) {
  const days = useMemo(() => activityDays(state), [state]);
  const [hover, setHover] = useState<string | null>(null);
  const weeks = 26;
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const start = new Date(today);
  start.setDate(start.getDate() - (weeks - 1) * 7 - today.getDay());
  const cells: { key: string; date: Date; n: number; col: number; row: number }[] = [];
  for (let i = 0; i < weeks * 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    if (d > today) break;
    const key = dayKey(d);
    cells.push({ key, date: d, n: days.get(key) ?? 0, col: Math.floor(i / 7), row: i % 7 });
  }
  const max = Math.max(1, ...cells.map((c) => c.n));
  const level = (n: number) => (n === 0 ? 0 : Math.min(4, Math.ceil((n / max) * 4)));
  const fills = ["oklch(1 0 0 / 0.05)", "oklch(0.68 0.14 242 / 0.3)", "oklch(0.68 0.14 242 / 0.5)", "oklch(0.68 0.14 242 / 0.75)", "oklch(0.68 0.14 242)"];
  const S = 13;
  const G = 3;
  const hoverCell = cells.find((c) => c.key === hover);
  const activeDays = cells.filter((c) => c.n > 0).length;
  return (
    <div className="panel p-4">
      <div className="overflow-x-auto">
        <svg width={weeks * (S + G) + 28} height={7 * (S + G) + 18} role="img" aria-label={`Training activity heatmap: ${activeDays} active days in the last 26 weeks`}>
          {["Mon", "Wed", "Fri"].map((d, i) => (
            <text key={d} x={0} y={18 + (i * 2 + 1) * (S + G) + S - 3} fontSize={9} fill={AXIS}>
              {d}
            </text>
          ))}
          {cells
            .filter((c) => c.row === 0 && c.date.getDate() <= 7)
            .map((c) => (
              <text key={`m${c.key}`} x={28 + c.col * (S + G)} y={10} fontSize={9} fill={AXIS}>
                {c.date.toLocaleDateString(undefined, { month: "short" })}
              </text>
            ))}
          {cells.map((c) => (
            <rect
              key={c.key}
              x={28 + c.col * (S + G)}
              y={16 + c.row * (S + G)}
              width={S}
              height={S}
              rx={2}
              fill={fills[level(c.n)]}
              stroke={hover === c.key ? "white" : "none"}
              onMouseEnter={() => setHover(c.key)}
              onMouseLeave={() => setHover(null)}
            >
              <title>{`${c.date.toLocaleDateString()}: ${c.n} training item${c.n === 1 ? "" : "s"}`}</title>
            </rect>
          ))}
        </svg>
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <span>{hoverCell ? `${hoverCell.date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}: ${hoverCell.n} item${hoverCell.n === 1 ? "" : "s"}` : `${activeDays} active days in the last 26 weeks`}</span>
        <span className="flex items-center gap-1">
          Less
          {fills.map((f, i) => (
            <span key={i} className="inline-block size-3 rounded-sm" style={{ background: f }} />
          ))}
          More
        </span>
      </div>
    </div>
  );
}
