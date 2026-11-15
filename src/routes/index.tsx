import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, type CSSProperties, type ReactNode } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Award,
  BookOpen,
  ClipboardCheck,
  FileCheck2,
  Gauge,
  Plane,
  PlaneLanding,
  PlaneTakeoff,
  Radio,
  Sparkles,
  Target,
  Trophy,
} from "lucide-react";
import { Page, formatDate, formatDuration } from "@/components/app/page";
import { FlightHero } from "@/components/brand/FlightHero";
import { useCountUp } from "@/hooks/use-count-up";
import { AIRCRAFT_PERF } from "@/lib/data/aircraft-perf";
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
  primary: "text-primary border-primary/30 bg-primary/10 shadow-[0_8px_24px_-12px_var(--primary)]",
  ok: "text-ok border-ok/30 bg-ok/10 shadow-[0_8px_24px_-12px_var(--ok)]",
  magenta: "text-magenta border-magenta/30 bg-magenta/10 shadow-[0_8px_24px_-12px_var(--magenta)]",
  cyan: "text-cyan border-cyan/30 bg-cyan/10 shadow-[0_8px_24px_-12px_var(--cyan)]",
  caution: "text-caution border-caution/30 bg-caution/10 shadow-[0_8px_24px_-12px_var(--caution)]",
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

/* ------------------------------------------------------------------------------------------ */
/* Small presentational pieces                                                                 */
/* ------------------------------------------------------------------------------------------ */

function CountUp({
  value,
  format,
}: {
  value: number;
  format?: ((n: number) => string) | undefined;
}) {
  const v = useCountUp(value);
  return <>{format ? format(v) : Math.round(v).toLocaleString()}</>;
}

/** Round SVG coordinates so server and browser render identical attribute strings. */
const r2 = (n: number) => Math.round(n * 100) / 100;

/** 270° engine-style gauge with a sweep animation. */
function RingGauge({ value, label }: { value: number; label: string }) {
  const target = Math.max(0, Math.min(100, Math.round(value)));
  const v = useCountUp(target, 1400);
  const r = 34;
  const C = 2 * Math.PI * r;
  const arc = C * 0.75;
  const color =
    target >= 80
      ? "var(--ok)"
      : target >= 60
        ? "var(--primary)"
        : target >= 35
          ? "var(--caution)"
          : "var(--warning)";
  return (
    <div className="flex flex-col items-center">
      <div className="relative size-[92px]">
        <svg viewBox="0 0 88 88" className="size-full">
          <g transform="rotate(135 44 44)">
            <circle
              cx="44"
              cy="44"
              r={r}
              fill="none"
              stroke="var(--muted)"
              strokeWidth="7"
              strokeLinecap="round"
              strokeDasharray={`${arc} ${C}`}
            />
            {v > 0.5 ? (
              <circle
                cx="44"
                cy="44"
                r={r}
                fill="none"
                stroke={color}
                strokeWidth="7"
                strokeLinecap="round"
                strokeDasharray={`${(arc * v) / 100} ${C}`}
                style={{ filter: `drop-shadow(0 0 5px ${color})` }}
              />
            ) : null}
          </g>
          {Array.from({ length: 11 }, (_, i) => {
            const a = ((135 + i * 27) * Math.PI) / 180;
            return (
              <line
                key={i}
                x1={r2(44 + Math.cos(a) * 25)}
                y1={r2(44 + Math.sin(a) * 25)}
                x2={r2(44 + Math.cos(a) * (i % 5 === 0 ? 21 : 23))}
                y2={r2(44 + Math.sin(a) * (i % 5 === 0 ? 21 : 23))}
                stroke="var(--muted-foreground)"
                strokeOpacity=".45"
                strokeWidth="1"
              />
            );
          })}
        </svg>
        <span className="absolute inset-0 grid place-items-center pt-1 font-mono text-lg font-semibold tabular">
          {Math.round(v)}
          <span className="sr-only">%</span>
        </span>
      </div>
      <span className="-mt-2 text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

function SectionTitle({
  children,
  to,
  linkLabel,
}: {
  children: ReactNode;
  to?: string;
  linkLabel?: string;
}) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-3">
      <h2 className="text-[15px] font-semibold tracking-tight">{children}</h2>
      {to ? (
        <Link
          to={to}
          className="group inline-flex items-center gap-1 text-xs font-medium text-primary"
        >
          {linkLabel}
          <ArrowRight className="size-3 transition-transform duration-300 group-hover:translate-x-0.5" />
        </Link>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------------------------------ */

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
  const returning = hydrated && !!profile;
  const next = recs[0];

  return (
    <Page>
      {/* Hero: live artificial horizon you can fly with the cursor */}
      <FlightHero className="mb-10">
        <div className="flex min-h-[560px] flex-col justify-end p-6 pt-[250px] sm:p-8 sm:pt-[250px] md:min-h-[460px] md:max-w-[56%] md:justify-center md:p-10 lg:p-12">
          {returning && profile ? (
            <>
              <p className="mb-4 inline-flex w-fit items-center gap-2 rounded-full border border-white/12 bg-white/5 px-3 py-1 text-xs font-medium text-white/85 backdrop-blur-md">
                <Award className="size-3.5 text-caution" />
                {m.trainingLevel.label}
              </p>
              <h1 className="text-[34px] leading-[1.05] font-bold tracking-[-0.035em] text-white sm:text-[44px] lg:text-[50px]">
                {greet},
                <br />
                <span className="text-brand-gradient">{profile.name.split(" ")[0]}.</span>
              </h1>
              <div className="mt-5 max-w-sm">
                <div className="mb-1.5 flex justify-between text-xs text-white/65">
                  <span>Next: {m.trainingLevel.nextLabel}</span>
                  <span className="font-mono tabular">
                    <CountUp value={m.trainingLevel.pct} />%
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="animate-grow-x h-full rounded-full bg-[linear-gradient(90deg,var(--brand-1),var(--brand-2),var(--brand-3))] shadow-[0_0_12px_var(--brand-2)]"
                    style={{ width: `${Math.max(2, m.trainingLevel.pct)}%` }}
                  />
                </div>
              </div>
              <div className="mt-6 flex flex-wrap gap-2.5">
                {next ? (
                  <Link
                    to={next.to}
                    search={next.search ?? {}}
                    className="btn-glow inline-flex h-11 max-w-full items-center gap-2 rounded-xl px-5 text-sm font-semibold"
                  >
                    <span className="truncate">{next.title}</span>
                    <ArrowRight className="size-4 shrink-0" />
                  </Link>
                ) : null}
                <Link
                  to="/simulator"
                  search={{ scenario: "free-flight" }}
                  className="btn-ghost-glass inline-flex h-11 items-center gap-2 rounded-xl px-5 text-sm font-semibold text-white"
                >
                  Fly now <Plane className="size-4" />
                </Link>
              </div>
              <dl className="mt-8 grid max-w-md grid-cols-4 gap-4">
                {[
                  {
                    k: "Sim time",
                    v: m.simHours * 3600,
                    f: (n: number) => formatDuration(n),
                  },
                  { k: "Flights", v: m.flights },
                  { k: "Lessons", v: m.lessonsDone },
                  { k: "Badges", v: unlocked.length },
                ].map((x) => (
                  <div key={x.k}>
                    <dt className="text-[10px] font-semibold tracking-[0.14em] text-white/50 uppercase">
                      {x.k}
                    </dt>
                    <dd className="mt-1 font-mono text-lg font-semibold text-white tabular">
                      <CountUp value={x.v} format={x.f} />
                    </dd>
                  </div>
                ))}
              </dl>
            </>
          ) : (
            <>
              <p className="mb-4 inline-flex w-fit items-center gap-2 rounded-full border border-white/12 bg-white/5 px-3 py-1 text-xs font-medium text-white/85 backdrop-blur-md">
                <span className="relative flex size-2">
                  <span className="animate-ping-ring absolute inline-flex size-full rounded-full bg-ok" />
                  <span className="relative inline-flex size-2 rounded-full bg-ok" />
                </span>
                Pilot training · right in your browser
              </p>
              <h1 className="text-[34px] leading-[1.05] font-bold tracking-[-0.035em] text-balance text-white sm:text-[44px] lg:text-[52px]">
                Learn to fly{" "}
                <span className="text-brand-gradient">before you leave the ground.</span>
              </h1>
              <p className="mt-4 max-w-md text-[15px] leading-relaxed text-pretty text-white/70">
                A 3D flight simulator, ground school, ATC radio practice and mock checkrides — one
                training cockpit.
              </p>
              <div className="mt-7 flex flex-wrap gap-2.5">
                <Link
                  to="/onboarding"
                  className="btn-glow inline-flex h-11 items-center gap-2 rounded-xl px-5 text-sm font-semibold"
                >
                  Get started <ArrowRight className="size-4" />
                </Link>
                <Link
                  to="/simulator"
                  search={{ scenario: "free-flight" }}
                  className="btn-ghost-glass inline-flex h-11 items-center gap-2 rounded-xl px-5 text-sm font-semibold text-white"
                >
                  Just fly <Plane className="size-4" />
                </Link>
              </div>
              <dl className="mt-8 flex flex-wrap gap-x-7 gap-y-3">
                {[
                  { v: m.lessonsTotal, k: "lessons" },
                  { v: SCENARIOS.length, k: "flight scenarios" },
                  { v: AIRCRAFT_PERF.length, k: "aircraft" },
                ].map((x) => (
                  <div key={x.k} className="flex items-baseline gap-1.5">
                    <dd className="font-display text-2xl font-semibold text-white tabular">
                      <CountUp value={x.v} />
                    </dd>
                    <dt className="text-xs text-white/55">{x.k}</dt>
                  </div>
                ))}
              </dl>
            </>
          )}
        </div>
      </FlightHero>

      {/* Quick start */}
      <section className="mb-10">
        <SectionTitle>Quick start</SectionTitle>
        <nav
          aria-label="Quick start"
          className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7"
        >
          {QUICK.map((q, i) => (
            <Link
              key={q.label}
              to={q.to}
              search={q.search}
              style={{ "--spot": `var(--${q.tone})` } as CSSProperties}
              className={cn(
                "panel spotlight lift group flex min-w-0 flex-col gap-3 rounded-xl p-4 hover:border-[color-mix(in_oklch,var(--spot)_45%,transparent)]",
                // First card is featured and wider so the 7 cards fill every grid evenly.
                i === 0 &&
                  "col-span-2 bg-[radial-gradient(ellipse_at_top_right,color-mix(in_oklch,var(--primary)_14%,transparent),transparent_65%)] sm:col-span-3 lg:col-span-2 xl:col-span-1",
              )}
            >
              <span
                className={cn(
                  "grid size-10 place-items-center rounded-xl border transition-transform duration-500 ease-[var(--ease-spring)] group-hover:-rotate-6 group-hover:scale-110",
                  toneCls[q.tone],
                )}
              >
                <q.icon className="size-[18px]" />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold">{q.label}</span>
                <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">
                  {q.desc}
                </span>
              </span>
              <ArrowUpRight className="absolute top-4 right-4 size-4 translate-x-[-4px] translate-y-[4px] text-muted-foreground opacity-0 transition-all duration-300 group-hover:translate-x-0 group-hover:translate-y-0 group-hover:text-foreground group-hover:opacity-100" />
            </Link>
          ))}
        </nav>
      </section>

      <div className="grid gap-x-10 gap-y-10 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-10">
          {/* Recommended next */}
          <section>
            <SectionTitle>Recommended next</SectionTitle>
            {recs.length ? (
              <ul className="stagger space-y-2.5">
                {recs.slice(0, 4).map((r, i) => (
                  <li key={r.title}>
                    <Link
                      to={r.to}
                      search={r.search ?? {}}
                      className="panel spotlight group flex items-center gap-3.5 rounded-xl px-4 py-3.5 transition-colors duration-300 hover:border-primary/40"
                    >
                      <span
                        className={cn(
                          "grid size-10 shrink-0 place-items-center rounded-lg border transition-transform duration-500 ease-[var(--ease-spring)] group-hover:scale-110",
                          i === 0
                            ? "border-primary/40 bg-primary/15 text-primary"
                            : "border-border bg-muted/50 text-muted-foreground group-hover:text-primary",
                        )}
                      >
                        <r.icon className="size-[18px]" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="truncate text-sm font-semibold">{r.title}</span>
                          {i === 0 ? (
                            <span className="hidden shrink-0 items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary sm:inline-flex">
                              <Sparkles className="size-3" /> Up next
                            </span>
                          ) : null}
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                          {r.why}
                        </span>
                      </span>
                      <span className="grid size-8 shrink-0 place-items-center rounded-full border bg-muted/40 text-muted-foreground transition-all duration-300 group-hover:border-primary group-hover:bg-primary group-hover:text-primary-foreground">
                        <ArrowRight className="size-3.5 transition-transform duration-300 group-hover:translate-x-0.5" />
                      </span>
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
              <SectionTitle to="/logbook" linkLabel="Logbook">
                Recent results
              </SectionTitle>
              <ul className="panel divide-y overflow-hidden rounded-xl text-sm">
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
                    <li
                      key={r.id}
                      className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-accent/25"
                    >
                      <r.icon className="size-4 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{r.title}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {formatDate(r.date)} · {r.sub}
                        </span>
                      </span>
                      <span
                        className={cn(
                          "rounded-md border px-2 py-0.5 font-mono text-sm font-semibold tabular",
                          r.score >= 75
                            ? "border-ok/30 bg-ok/10 text-ok"
                            : r.score >= 60
                              ? "border-primary/30 bg-primary/10 text-primary"
                              : "border-caution/30 bg-caution/10 text-caution",
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

        <aside className="space-y-10">
          <section>
            <SectionTitle to="/progress" linkLabel="Details">
              Proficiency
            </SectionTitle>
            <div className="panel grid grid-cols-2 gap-y-5 rounded-xl px-3 py-5">
              <RingGauge value={m.vfrProficiency} label="VFR" />
              <RingGauge value={m.ifrProficiency} label="IFR" />
              <RingGauge value={m.atcScore} label="Radio / ATC" />
              <RingGauge value={m.writtenReadiness} label="Written exam" />
            </div>
          </section>

          {upcoming.length ? (
            <section>
              <SectionTitle>Up next in ground school</SectionTitle>
              <ol className="relative space-y-1 before:absolute before:top-3 before:bottom-3 before:left-[15px] before:w-px before:bg-border">
                {upcoming.map(({ module, lesson, course }, i) => (
                  <li key={lesson.id}>
                    <Link
                      to="/academy/$course/$module"
                      params={{ course: course.id, module: module.id }}
                      className="group relative flex items-center gap-3 rounded-lg py-1.5 pr-2 transition-colors hover:bg-accent/30"
                    >
                      <span
                        className={cn(
                          "relative z-10 grid size-[31px] shrink-0 place-items-center rounded-full border bg-background font-mono text-[10px] font-semibold transition-colors",
                          i === 0
                            ? "border-primary/60 text-primary shadow-[0_0_12px_-2px_var(--primary)]"
                            : "text-muted-foreground group-hover:border-primary/40",
                        )}
                      >
                        {course.id.toUpperCase()}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium group-hover:text-primary">
                          {lesson.title}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {module.title}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ol>
            </section>
          ) : null}

          {unlocked.length || state.checkrides.some((c) => c.completed && c.passed) ? (
            <section>
              <SectionTitle to="/achievements" linkLabel="All">
                Achievements
              </SectionTitle>
              <ul className="space-y-2 text-sm">
                {state.checkrides
                  .filter((c) => c.completed && c.passed)
                  .slice(0, 2)
                  .map((c) => (
                    <li key={c.id} className="flex items-center gap-2.5">
                      <span className="grid size-7 place-items-center rounded-full bg-ok/15 text-ok">
                        <Trophy className="size-3.5" />
                      </span>
                      {c.title} (training)
                    </li>
                  ))}
                {unlocked.slice(0, 3).map((a) => (
                  <li key={a.id} className="flex items-center gap-2.5">
                    <span className="grid size-7 place-items-center rounded-full bg-caution/15 text-caution">
                      <Award className="size-3.5" />
                    </span>
                    {a.title}
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
