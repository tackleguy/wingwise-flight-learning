import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import {
  Activity,
  ArrowRight,
  Award,
  BookOpen,
  ClipboardCheck,
  Clock,
  Compass,
  FileCheck2,
  Gauge,
  GraduationCap,
  Lightbulb,
  Plane,
  PlaneLanding,
  PlaneTakeoff,
  Radio,
  Target,
  Trophy,
} from "lucide-react";
import { Page, Panel, Meter, Stat, EmptyState, Pill, Notice, formatDate, formatDuration, formatDateTime } from "@/components/app/page";
import { useHydrated, useStore, type TrainingState } from "@/lib/store";
import { computeMetrics } from "@/lib/metrics";
import { allLessons, moduleLink } from "@/lib/content";
import { ACHIEVEMENTS } from "@/lib/achievements";
import { SCENARIOS } from "@/sim/scenarios";
import { getPerf } from "@/lib/data/aircraft-perf";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Pilot Dashboard — TeachX Flight Training" },
      { name: "description", content: "Your flight training at a glance: proficiency, simulated flights, lessons, exam readiness and quick-start training." },
      { property: "og:title", content: "TeachX — Flight Simulator & Pilot Training Platform" },
      { property: "og:description", content: "3D flight simulator, avionics lab, AI ATC, ground school, practice exams and mock checkrides." },
    ],
  }),
  component: Dashboard,
});

const QUICK = [
  { to: "/simulator", search: { scenario: "free-flight" }, label: "Start Free Flight", desc: "Any aircraft, airport & weather", icon: Plane, tone: "primary" },
  { to: "/simulator", search: { scenario: "vfr-pattern" }, label: "Start VFR Flight", desc: "Traffic pattern & landing", icon: PlaneTakeoff, tone: "ok" },
  { to: "/simulator", search: { scenario: "ifr-ils" }, label: "Start IFR Flight", desc: "ILS approach in IMC", icon: PlaneLanding, tone: "magenta" },
  { to: "/atc", search: {}, label: "Practice ATC", desc: "Radio calls & readbacks", icon: Radio, tone: "cyan" },
  { to: "/avionics", search: {}, label: "Open Avionics Lab", desc: "PFD, GPS & autopilot", icon: Gauge, tone: "primary" },
  { to: "/practice-tests", search: {}, label: "Take a Practice Exam", desc: "Graded with explanations", icon: FileCheck2, tone: "caution" },
  { to: "/checkrides", search: {}, label: "Start a Checkride", desc: "Full mock practical test", icon: ClipboardCheck, tone: "ok" },
] as const;

const toneCls: Record<string, string> = {
  primary: "text-primary border-primary/30 bg-primary/10",
  ok: "text-ok border-ok/30 bg-ok/10",
  magenta: "text-magenta border-magenta/30 bg-magenta/10",
  cyan: "text-cyan border-cyan/30 bg-cyan/10",
  caution: "text-caution border-caution/30 bg-caution/10",
};

interface Rec {
  title: string;
  why: string;
  to: string;
  search?: Record<string, string>;
  icon: typeof Plane;
}

function recommendations(state: TrainingState, m: ReturnType<typeof computeMetrics>): Rec[] {
  const recs: Rec[] = [];
  const goalIfr = state.profile?.goal === "instrument" || state.profile?.goal === "cfii";
  const course = goalIfr ? "ifr" : "vfr";
  const next = allLessons(course).find((l) => !state.lessons[l.lesson.id]);
  if (next) recs.push({ title: `Continue: ${next.lesson.title}`, why: `${next.module.title} — next lesson in the ${course.toUpperCase()} ground school.`, to: moduleLink(course, next.module.id), icon: BookOpen });
  // weakest subject
  const agg: Record<string, { c: number; t: number }> = {};
  for (const e of state.exams.slice(0, 10)) for (const [k, v] of Object.entries(e.bySubject)) {
    const a = (agg[k] ??= { c: 0, t: 0 });
    a.c += v.correct;
    a.t += v.total;
  }
  const weakest = Object.entries(agg).filter(([, v]) => v.t >= 3).sort((a, b) => a[1].c / a[1].t - b[1].c / b[1].t)[0];
  if (weakest && weakest[1].c / weakest[1].t < 0.75) recs.push({ title: `Review ${weakest[0]}`, why: `Only ${Math.round((weakest[1].c / weakest[1].t) * 100)}% correct on recent exams.`, to: "/practice-tests", icon: Target });
  const flown = new Set(state.flights.map((f) => f.scenarioId));
  const nextSim = SCENARIOS.find((s) => s.category === (goalIfr ? "ifr" : "vfr") && !flown.has(s.id));
  if (nextSim) recs.push({ title: `Fly: ${nextSim.title}`, why: nextSim.summary, to: "/simulator", search: { scenario: nextSim.id }, icon: PlaneTakeoff });
  if (state.atcSessions.length < 3) recs.push({ title: "Practise radio communications", why: "Build confidence with readbacks before your next simulated flight.", to: "/atc", icon: Radio });
  if (m.avionicsProficiency < 50) recs.push({ title: "Work through the Avionics Lab", why: "Learn the autopilot modes, GPS and HSI that the simulator uses.", to: "/avionics", icon: Gauge });
  if (m.writtenReadiness < 70 && state.lessons && Object.keys(state.lessons).length > 6) recs.push({ title: goalIfr ? "Instrument (IRA) practice exam" : "Private Pilot (PAR) practice exam", why: "Measure your written-exam readiness under timed conditions.", to: goalIfr ? "/exam/ira" : "/exam/par", icon: FileCheck2 });
  return recs.slice(0, 5);
}

function Dashboard() {
  const hydrated = useHydrated();
  const state = useStore((s) => s);
  const m = useMemo(() => computeMetrics(state), [state]);
  const recs = useMemo(() => recommendations(state, m), [state, m]);
  const profile = state.profile;
  const upcoming = useMemo(() => {
    const course = profile?.goal === "instrument" ? "ifr" : "vfr";
    return allLessons(course).filter((l) => !state.lessons[l.lesson.id]).slice(0, 4);
  }, [state.lessons, profile?.goal]);
  const unlocked = ACHIEVEMENTS.filter((a) => state.achievements[a.id]);
  const hour = new Date().getHours();
  const greet = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <Page>
      {/* Header */}
      <div className="mb-6 grid gap-4 lg:grid-cols-[1fr_380px]">
        <div className="panel relative overflow-hidden p-5">
          <div className="pointer-events-none absolute inset-0 grid-backdrop opacity-60" />
          <div className="relative">
            <p className="label-caps text-primary">Pilot dashboard</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">
              {hydrated && profile ? `${greet}, ${profile.name.split(" ")[0]}` : "Welcome to TeachX Flight Training"}
            </h1>
            <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">
              {profile
                ? `Callsign ${profile.callsign} · Home ${profile.homeAirport} · Training goal: ${profile.goal.replace("-", " ")}`
                : "A complete simulated training environment: 3D flight simulator, functional avionics, ATC practice, ground school, practice exams and mock checkrides."}
            </p>
            {!profile && hydrated ? (
              <div className="mt-4 flex flex-wrap gap-2">
                <Link to="/onboarding" className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
                  Create pilot profile & take the assessment <ArrowRight className="size-4" />
                </Link>
                <Link to="/simulator" search={{ scenario: "free-flight" }} className="inline-flex items-center gap-1.5 rounded-md border px-4 py-2 text-sm font-semibold hover:bg-accent">
                  Just fly <Plane className="size-4" />
                </Link>
              </div>
            ) : null}
          </div>
        </div>
        <div className="panel p-5">
          <div className="flex items-center justify-between">
            <span className="label-caps">Training level</span>
            <GraduationCap className="size-4 text-primary" />
          </div>
          <p className="mt-2 text-xl font-bold">{m.trainingLevel.label}</p>
          <p className="text-xs text-muted-foreground">Next: {m.trainingLevel.nextLabel}</p>
          <Meter className="mt-3" value={m.trainingLevel.pct} label="Progress to next level" />
          <p className="mt-3 text-[11px] leading-snug text-muted-foreground">Levels track your progress on this platform only — they are not FAA certificates or ratings.</p>
        </div>
      </div>

      {/* Stats */}
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Sim flight time" value={formatDuration(m.simHours * 3600)} sub="Simulated — not loggable" icon={Clock} tone="primary" />
        <Stat label="Lessons completed" value={`${m.lessonsDone}/${m.lessonsTotal}`} sub="VFR + IFR ground school" icon={BookOpen} />
        <Stat label="Sim flights" value={m.flights} sub={`${m.landings} landings`} icon={PlaneTakeoff} />
        <Stat label="Achievements" value={`${unlocked.length}/${ACHIEVEMENTS.length}`} sub="Training milestones" icon={Award} tone="caution" />
      </div>

      {/* Quick start */}
      <section className="mb-6">
        <div className="mb-3 flex items-end justify-between">
          <h2 className="text-base font-semibold">Quick start</h2>
          <span className="text-xs text-muted-foreground">Jump straight into training</span>
        </div>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 xl:grid-cols-7">
          {QUICK.map((q) => (
            <Link key={q.label} to={q.to} search={q.search} className="panel group flex flex-col gap-2 p-3 transition hover:border-primary/60 hover:bg-accent/40">
              <span className={cn("grid size-9 place-items-center rounded-md border", toneCls[q.tone])}>
                <q.icon className="size-4.5" />
              </span>
              <span className="text-sm leading-tight font-semibold">{q.label}</span>
              <span className="text-[11px] leading-snug text-muted-foreground">{q.desc}</span>
            </Link>
          ))}
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Proficiency */}
        <Panel title="Proficiency" actions={<Link to="/progress" className="text-xs text-primary hover:underline">Statistics →</Link>}>
          <div className="space-y-3.5">
            <Meter value={m.vfrProficiency} label="VFR proficiency" />
            <Meter value={m.ifrProficiency} label="IFR proficiency" />
            <Meter value={m.atcScore} label="ATC communications" />
            <Meter value={m.avionicsProficiency} label="Avionics" />
            <Meter value={m.writtenReadiness} label="Written exam readiness" />
            <Meter value={m.oralScore} label="Oral exam" />
          </div>
          <p className="mt-4 text-[11px] text-muted-foreground">Calculated from your actual lessons, quizzes, simulator scores, ATC sessions and exams. 0% means no data yet.</p>
        </Panel>

        {/* Recommendations */}
        <Panel title={<span className="inline-flex items-center gap-1.5"><Lightbulb className="size-3.5" /> Recommended next</span>} className="lg:col-span-2">
          {recs.length ? (
            <ul className="divide-y">
              {recs.map((r) => (
                <li key={r.title}>
                  <Link to={r.to} search={r.search ?? {}} className="group flex items-center gap-3 py-2.5">
                    <span className="grid size-8 shrink-0 place-items-center rounded-md border bg-muted text-primary">
                      <r.icon className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold group-hover:text-primary">{r.title}</span>
                      <span className="block truncate text-xs text-muted-foreground">{r.why}</span>
                    </span>
                    <ArrowRight className="size-4 text-muted-foreground group-hover:text-primary" />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">You're on top of everything — try a checkride.</p>
          )}
        </Panel>

        {/* Recent flights */}
        <Panel title="Recent flights" className="lg:col-span-2" actions={<Link to="/logbook" className="text-xs text-primary hover:underline">Logbook →</Link>}>
          {state.flights.length ? (
            <div className="-mx-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="label-caps text-left">
                    <th className="px-4 py-1.5 font-semibold">Date</th>
                    <th className="px-2 py-1.5 font-semibold">Scenario</th>
                    <th className="px-2 py-1.5 font-semibold">Aircraft</th>
                    <th className="px-2 py-1.5 font-semibold">Route</th>
                    <th className="px-2 py-1.5 font-semibold">Time</th>
                    <th className="px-4 py-1.5 text-right font-semibold">Score</th>
                  </tr>
                </thead>
                <tbody>
                  {state.flights.slice(0, 5).map((f) => (
                    <tr key={f.id} className="border-t">
                      <td className="px-4 py-2 whitespace-nowrap text-muted-foreground">{formatDate(f.date)}</td>
                      <td className="px-2 py-2">
                        <span className="font-medium">{f.scenarioTitle}</span> <Pill tone={f.rules === "IFR" ? "magenta" : "ok"}>{f.rules}</Pill>
                      </td>
                      <td className="px-2 py-2 font-mono text-xs">{getPerf(f.aircraftId).shortName}</td>
                      <td className="px-2 py-2 font-mono text-xs whitespace-nowrap">{f.departure} → {f.destination}</td>
                      <td className="px-2 py-2 font-mono text-xs">{formatDuration(f.durationSec)}</td>
                      <td className={cn("px-4 py-2 text-right font-mono font-semibold", f.score >= 75 ? "text-ok" : f.score >= 60 ? "text-primary" : "text-caution")}>{f.score}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState icon={PlaneTakeoff} title="No simulated flights yet" description="Fly a scenario — every flight is scored and saved here." action={{ to: "/simulator", label: "Open the simulator" }} />
          )}
        </Panel>

        {/* Upcoming lessons */}
        <Panel title="Upcoming lessons" actions={<Link to={profile?.goal === "instrument" ? "/ifr" : "/vfr"} className="text-xs text-primary hover:underline">Academy →</Link>}>
          {upcoming.length ? (
            <ul className="space-y-2">
              {upcoming.map(({ module, lesson, course }) => (
                <li key={lesson.id}>
                  <Link to="/academy/$course/$module" params={{ course: course.id, module: module.id }} className="group flex items-start gap-2.5 rounded-md border p-2.5 hover:border-primary/50">
                    <span className="grid size-7 shrink-0 place-items-center rounded bg-muted font-mono text-[11px] font-semibold text-primary">{module.number}</span>
                    <span className="min-w-0">
                      <span className="block text-sm font-medium group-hover:text-primary">{lesson.title}</span>
                      <span className="block text-[11px] text-muted-foreground">{course.id.toUpperCase()} · {module.title} · {lesson.minutes} min</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">All lessons in this course complete.</p>
          )}
        </Panel>

        {/* Recent exams */}
        <Panel title="Recent examination results" className="lg:col-span-2" actions={<Link to="/practice-tests" className="text-xs text-primary hover:underline">Test center →</Link>}>
          {state.exams.length ? (
            <ul className="divide-y">
              {state.exams.slice(0, 5).map((e) => (
                <li key={e.id} className="flex items-center gap-3 py-2">
                  <span className={cn("w-14 font-mono text-lg font-semibold", e.passed ? "text-ok" : "text-caution")}>{Math.round(e.scorePct)}%</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{e.title}</span>
                    <span className="block text-[11px] text-muted-foreground">{formatDateTime(e.date)} · {e.correct}/{e.total} correct · {e.mode === "timed" ? "timed" : "study mode"}</span>
                  </span>
                  <Pill tone={e.passed ? "ok" : "caution"}>{e.passed ? "Pass" : "Below 70%"}</Pill>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={FileCheck2} title="No exams taken yet" description="Unofficial practice tests modelled on FAA knowledge test areas." action={{ to: "/written-exams", label: "Browse written exams" }} />
          )}
        </Panel>

        {/* Achievements & certificates */}
        <Panel title="Certificates & achievements" actions={<Link to="/achievements" className="text-xs text-primary hover:underline">All →</Link>}>
          {state.checkrides.filter((c) => c.completed && c.passed).map((c) => (
            <div key={c.id} className="mb-2 flex items-center gap-2 rounded-md border border-ok/30 bg-ok/5 p-2.5">
              <Trophy className="size-4 text-ok" />
              <span className="text-sm"><span className="font-semibold">{c.title}</span> — training completion</span>
            </div>
          ))}
          {unlocked.length ? (
            <ul className="grid grid-cols-1 gap-1.5">
              {unlocked.slice(0, 5).map((a) => (
                <li key={a.id} className="flex items-center gap-2 text-sm">
                  <Award className="size-4 text-caution" /> <span className="font-medium">{a.title}</span>
                  <span className="ml-auto text-[11px] text-muted-foreground">{formatDate(state.achievements[a.id]!)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Complete your first simulated flight to unlock “First Successful Flight”.</p>
          )}
          <Notice className="mt-3">Training completions on TeachX are not FAA certificates, ratings or endorsements.</Notice>
        </Panel>

        {/* Activity */}
        <Panel title={<span className="inline-flex items-center gap-1.5"><Activity className="size-3.5" /> Recent activity</span>} className="lg:col-span-3">
          {state.activity.length ? (
            <ol className="grid gap-x-6 gap-y-1.5 md:grid-cols-2">
              {state.activity.slice(0, 10).map((a) => (
                <li key={a.id} className="flex items-start gap-2 text-sm">
                  <Compass className="mt-0.5 size-3.5 shrink-0 text-primary" />
                  {a.link ? (
                    <Link to={a.link} className="min-w-0 flex-1 truncate hover:text-primary">{a.text}</Link>
                  ) : (
                    <span className="min-w-0 flex-1 truncate">{a.text}</span>
                  )}
                  <span className="shrink-0 text-[11px] text-muted-foreground">{formatDateTime(a.date)}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-muted-foreground">Your lessons, flights, exams and radio practice will appear here.</p>
          )}
        </Panel>
      </div>
    </Page>
  );
}
