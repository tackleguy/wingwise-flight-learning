import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import {
  ArrowRight,
  Award,
  BookOpen,
  ClipboardCheck,
  FileCheck2,
  Gauge,
  Plane,
  PlaneLanding,
  PlaneTakeoff,
  Radio,
  Target,
  Trophy,
} from "lucide-react";
import { Page, Meter, formatDate, formatDuration } from "@/components/app/page";
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
      {
        name: "description",
        content:
          "Your flight training at a glance: proficiency, simulated flights, lessons, exam readiness and quick-start training.",
      },
      { property: "og:title", content: "TeachX — Flight Simulator & Pilot Training Platform" },
      {
        property: "og:description",
        content:
          "3D flight simulator, avionics lab, AI ATC, ground school, practice exams and mock checkrides.",
      },
    ],
  }),
  component: Dashboard,
});

const QUICK = [
  {
    to: "/simulator",
    search: { scenario: "free-flight" },
    label: "Free flight",
    desc: "Any aircraft, airport & weather",
    icon: Plane,
    tone: "primary",
  },
  {
    to: "/simulator",
    search: { scenario: "vfr-pattern" },
    label: "VFR flight",
    desc: "Traffic pattern & landing",
    icon: PlaneTakeoff,
    tone: "ok",
  },
  {
    to: "/simulator",
    search: { scenario: "ifr-ils" },
    label: "IFR flight",
    desc: "ILS approach in IMC",
    icon: PlaneLanding,
    tone: "magenta",
  },
  {
    to: "/atc",
    search: {},
    label: "Radio practice",
    desc: "Radio calls & readbacks",
    icon: Radio,
    tone: "cyan",
  },
  {
    to: "/avionics",
    search: {},
    label: "Avionics lab",
    desc: "PFD, GPS & autopilot",
    icon: Gauge,
    tone: "primary",
  },
  {
    to: "/practice-tests",
    search: {},
    label: "Practice exam",
    desc: "Graded with explanations",
    icon: FileCheck2,
    tone: "caution",
  },
  {
    to: "/checkrides",
    search: {},
    label: "Checkride",
    desc: "Full mock practical test",
    icon: ClipboardCheck,
    tone: "ok",
  },
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
  if (next)
    recs.push({
      title: `Continue: ${next.lesson.title}`,
      why: `${next.module.title} — next lesson in the ${course.toUpperCase()} ground school.`,
      to: moduleLink(course, next.module.id),
      icon: BookOpen,
    });
  // weakest subject
  const agg: Record<string, { c: number; t: number }> = {};
  for (const e of state.exams.slice(0, 10))
    for (const [k, v] of Object.entries(e.bySubject)) {
      const a = (agg[k] ??= { c: 0, t: 0 });
      a.c += v.correct;
      a.t += v.total;
    }
  const weakest = Object.entries(agg)
    .filter(([, v]) => v.t >= 3)
    .sort((a, b) => a[1].c / a[1].t - b[1].c / b[1].t)[0];
  if (weakest && weakest[1].c / weakest[1].t < 0.75)
    recs.push({
      title: `Review ${weakest[0]}`,
      why: `Only ${Math.round((weakest[1].c / weakest[1].t) * 100)}% correct on recent exams.`,
      to: "/practice-tests",
      icon: Target,
    });
  const flown = new Set(state.flights.map((f) => f.scenarioId));
  const nextSim = SCENARIOS.find(
    (s) => s.category === (goalIfr ? "ifr" : "vfr") && !flown.has(s.id),
  );
  if (nextSim)
    recs.push({
      title: `Fly: ${nextSim.title}`,
      why: nextSim.summary,
      to: "/simulator",
      search: { scenario: nextSim.id },
      icon: PlaneTakeoff,
    });
  if (state.atcSessions.length < 3)
    recs.push({
      title: "Practise radio communications",
      why: "Build confidence with readbacks before your next simulated flight.",
      to: "/atc",
      icon: Radio,
    });
  if (m.avionicsProficiency < 50)
    recs.push({
      title: "Work through the Avionics Lab",
      why: "Learn the autopilot modes, GPS and HSI that the simulator uses.",
      to: "/avionics",
      icon: Gauge,
    });
  if (m.writtenReadiness < 70 && state.lessons && Object.keys(state.lessons).length > 6)
    recs.push({
      title: goalIfr ? "Instrument (IRA) practice exam" : "Private Pilot (PAR) practice exam",
      why: "Measure your written-exam readiness under timed conditions.",
      to: goalIfr ? "/exam/ira" : "/exam/par",
      icon: FileCheck2,
    });
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
    return allLessons(course)
      .filter((l) => !state.lessons[l.lesson.id])
      .slice(0, 3);
  }, [state.lessons, profile?.goal]);
  const unlocked = ACHIEVEMENTS.filter((a) => state.achievements[a.id]);
  const hour = new Date().getHours();
  const greet = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const hasHistory = state.flights.length > 0 || state.exams.length > 0;

  return (
    <Page>
      {/* Header: greeting, level and key numbers in one place */}
      <header className="mb-8 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            {hydrated && profile ? `${greet}, ${profile.name.split(" ")[0]}` : "Welcome to TeachX"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {profile ? (
              <>
                {m.trainingLevel.label} · next: {m.trainingLevel.nextLabel}
              </>
            ) : (
              "Fly, study and practise radio calls in one simulated training environment."
            )}
          </p>
          {!profile && hydrated ? (
            <div className="mt-4 flex flex-wrap gap-2">
              <Link
                to="/onboarding"
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
              >
                Get started <ArrowRight className="size-4" />
              </Link>
              <Link
                to="/simulator"
                search={{ scenario: "free-flight" }}
                className="inline-flex items-center gap-1.5 rounded-md border px-4 py-2 text-sm font-semibold hover:bg-accent"
              >
                Just fly <Plane className="size-4" />
              </Link>
            </div>
          ) : (
            <Meter className="mt-3 max-w-sm" value={m.trainingLevel.pct} />
          )}
        </div>
        <dl className="grid grid-cols-4 gap-6 text-sm">
          {[
            { k: "Sim time", v: formatDuration(m.simHours * 3600) },
            { k: "Flights", v: String(m.flights) },
            { k: "Lessons", v: `${m.lessonsDone}/${m.lessonsTotal}` },
            { k: "Badges", v: `${unlocked.length}` },
          ].map((x) => (
            <div key={x.k}>
              <dt className="label-caps">{x.k}</dt>
              <dd className="mt-1 font-mono text-xl font-semibold tabular">{x.v}</dd>
            </div>
          ))}
        </dl>
      </header>

      {/* Quick start */}
      <nav aria-label="Quick start" className="mb-8 flex flex-wrap gap-2">
        {QUICK.map((q) => (
          <Link
            key={q.label}
            to={q.to}
            search={q.search}
            title={q.desc}
            className="inline-flex items-center gap-2 rounded-md border bg-card px-3 py-2 text-sm font-medium transition hover:border-primary/60 hover:bg-accent/40"
          >
            <q.icon className={cn("size-4", toneCls[q.tone]?.split(" ")[0])} />
            {q.label}
          </Link>
        ))}
      </nav>

      <div className="grid gap-x-10 gap-y-8 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-8">
          {/* Recommended next */}
          <section>
            <h2 className="mb-2 text-sm font-semibold">Recommended next</h2>
            {recs.length ? (
              <ul className="divide-y rounded-md border">
                {recs.slice(0, 4).map((r) => (
                  <li key={r.title}>
                    <Link
                      to={r.to}
                      search={r.search ?? {}}
                      className="group flex items-center gap-3 px-3 py-2.5 hover:bg-accent/30"
                    >
                      <r.icon className="size-4 shrink-0 text-primary" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium group-hover:text-primary">
                          {r.title}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {r.why}
                        </span>
                      </span>
                      <ArrowRight className="size-4 shrink-0 text-muted-foreground group-hover:text-primary" />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                You&apos;re on top of everything — try a checkride.
              </p>
            )}
          </section>

          {hasHistory ? (
            <section>
              <div className="mb-2 flex items-baseline justify-between">
                <h2 className="text-sm font-semibold">Recent results</h2>
                <Link to="/logbook" className="text-xs text-primary hover:underline">
                  Logbook →
                </Link>
              </div>
              <ul className="divide-y rounded-md border text-sm">
                {[
                  ...state.flights.slice(0, 4).map((f) => ({
                    id: f.id,
                    date: f.date,
                    title: f.scenarioTitle,
                    sub: `${getPerf(f.aircraftId).shortName} · ${f.departure} → ${f.destination} · ${formatDuration(f.durationSec)}`,
                    score: f.score,
                    icon: PlaneTakeoff,
                  })),
                  ...state.exams.slice(0, 4).map((e) => ({
                    id: e.id,
                    date: e.date,
                    title: e.title,
                    sub: `${e.correct}/${e.total} correct · ${e.mode === "timed" ? "timed" : "study"}`,
                    score: Math.round(e.scorePct),
                    icon: FileCheck2,
                  })),
                ]
                  .sort((x, y) => y.date.localeCompare(x.date))
                  .slice(0, 5)
                  .map((r) => (
                    <li key={r.id} className="flex items-center gap-3 px-3 py-2">
                      <r.icon className="size-4 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{r.title}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {formatDate(r.date)} · {r.sub}
                        </span>
                      </span>
                      <span
                        className={cn(
                          "font-mono font-semibold",
                          r.score >= 75
                            ? "text-ok"
                            : r.score >= 60
                              ? "text-primary"
                              : "text-caution",
                        )}
                      >
                        {r.score}
                      </span>
                    </li>
                  ))}
              </ul>
            </section>
          ) : null}
        </div>

        <aside className="space-y-8">
          <section>
            <div className="mb-3 flex items-baseline justify-between">
              <h2 className="text-sm font-semibold">Proficiency</h2>
              <Link to="/progress" className="text-xs text-primary hover:underline">
                Details →
              </Link>
            </div>
            <div className="space-y-3">
              <Meter value={m.vfrProficiency} label="VFR" />
              <Meter value={m.ifrProficiency} label="IFR" />
              <Meter value={m.atcScore} label="Radio / ATC" />
              <Meter value={m.writtenReadiness} label="Written exam" />
            </div>
          </section>

          {upcoming.length ? (
            <section>
              <h2 className="mb-2 text-sm font-semibold">Up next in ground school</h2>
              <ul className="space-y-1">
                {upcoming.map(({ module, lesson, course }) => (
                  <li key={lesson.id}>
                    <Link
                      to="/academy/$course/$module"
                      params={{ course: course.id, module: module.id }}
                      className="group flex items-baseline gap-2 rounded px-1 py-1 text-sm hover:bg-accent/30"
                    >
                      <span className="font-mono text-[11px] text-primary">
                        {course.id.toUpperCase()}
                      </span>
                      <span className="truncate group-hover:text-primary">{lesson.title}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {unlocked.length || state.checkrides.some((c) => c.completed && c.passed) ? (
            <section>
              <div className="mb-2 flex items-baseline justify-between">
                <h2 className="text-sm font-semibold">Achievements</h2>
                <Link to="/achievements" className="text-xs text-primary hover:underline">
                  All →
                </Link>
              </div>
              <ul className="space-y-1.5 text-sm">
                {state.checkrides
                  .filter((c) => c.completed && c.passed)
                  .slice(0, 2)
                  .map((c) => (
                    <li key={c.id} className="flex items-center gap-2">
                      <Trophy className="size-4 text-ok" /> {c.title} (training)
                    </li>
                  ))}
                {unlocked.slice(0, 3).map((a) => (
                  <li key={a.id} className="flex items-center gap-2">
                    <Award className="size-4 text-caution" /> {a.title}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </aside>
      </div>
    </Page>
  );
}
