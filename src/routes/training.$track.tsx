import { useState } from "react";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  ClipboardCheck,
  Crosshair,
  FileCheck2,
  GraduationCap,
  ListChecks,
  MessageSquareText,
  Mic,
  PlaneTakeoff,
  Radio,
  ScrollText,
  ShieldAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  EmptyState,
  Meter,
  Notice,
  Page,
  PageHeader,
  Panel,
  Pill,
  Section,
} from "@/components/app/page";
import { moduleCompletion } from "@/components/academy/CourseOverview";
import { HrefLink } from "@/components/academy/PracticeLink";
import { useTrackState } from "@/components/academy/useTrackState";
import { getCourse, getModule } from "@/lib/content";
import {
  ATC_SCENARIOS,
  EXAM_INFO,
  getTrack,
  KIND_LABEL,
  SIM_SCENARIOS,
  trackProgress,
  type Requirement,
} from "@/lib/content/tracks";
import { actions, useStore } from "@/lib/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/training/$track")({
  loader: ({ params }) => {
    const t = getTrack(params.track);
    if (!t) throw notFound();
    return { title: t.title, summary: t.summary };
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: `${loaderData?.title ?? "Training track"} — TeachX` },
      {
        name: "description",
        content:
          loaderData?.summary ??
          "TeachX certification track: FAA requirements, ground school, exams, simulator scenarios and ATC practice.",
      },
    ],
  }),
  notFoundComponent: () => (
    <Page>
      <EmptyState
        icon={GraduationCap}
        title="Track not found"
        description="That certification track does not exist."
        action={{ to: "/training", label: "All training tracks" }}
      />
    </Page>
  ),
  component: TrackPage,
});

function ReqList({ items }: { items: Requirement[] }) {
  return (
    <dl className="divide-y">
      {items.map((r) => (
        <div
          key={r.label + r.detail}
          className="grid gap-1 py-2.5 first:pt-0 last:pb-0 sm:grid-cols-[150px_1fr] sm:gap-3"
        >
          <dt className="text-xs font-semibold">{r.label}</dt>
          <dd className="text-sm leading-relaxed text-foreground/85">
            {r.detail}
            {r.ref ? (
              <span className="ml-1.5 font-mono text-[10px] whitespace-nowrap text-primary">
                {r.ref}
              </span>
            ) : null}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function scoreTone(best: number | null) {
  return best === null ? "default" : best >= 70 ? "ok" : "caution";
}

function TrackPage() {
  const { track: trackId } = Route.useParams();
  const track = getTrack(trackId);
  const state = useTrackState();
  const profile = useStore((s) => s.profile);
  const [showEval, setShowEval] = useState(false);

  if (!track) return null;
  const prog = trackProgress(state, track);
  const isGoal = profile?.goal === track.id;
  const written = track.examIds.filter((e) => EXAM_INFO[e]?.kind === "written");
  const topics = track.examIds.filter((e) => EXAM_INFO[e]?.kind === "topic");

  return (
    <Page>
      <PageHeader
        eyebrow={KIND_LABEL[track.kind]}
        title={track.title}
        description={track.summary}
        actions={
          <>
            <Link
              to="/training"
              className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm hover:bg-accent"
            >
              <ArrowLeft className="size-4" />
              All tracks
            </Link>
            {profile ? (
              isGoal ? (
                <Pill tone="primary" className="px-2.5 py-1.5 text-xs">
                  <Crosshair className="size-3.5" /> Your goal
                </Pill>
              ) : (
                <Button size="sm" onClick={() => actions.updateProfile({ goal: track.id })}>
                  <Crosshair className="size-4" />
                  Set as my goal
                </Button>
              )
            ) : null}
          </>
        }
      />

      <div className="mb-6 flex gap-3 rounded-md border border-warning/40 bg-warning/5 px-4 py-3">
        <ShieldAlert className="mt-0.5 size-5 shrink-0 text-warning" />
        <div className="text-sm leading-relaxed">
          <p className="font-semibold text-warning">
            Not an FAA certificate, rating or endorsement
          </p>
          <p className="text-foreground/85">
            Completing TeachX training does not grant any FAA certificate, rating, endorsement, or
            loggable flight time. Requirements below are study summaries of 14 CFR — verify them in
            the current regulations and ACS, and train with an authorized instructor.
          </p>
        </div>
      </div>

      {/* Progress */}
      <div className="panel mb-8 grid gap-5 p-5 md:grid-cols-[220px_1fr]">
        <div>
          <p className="label-caps">TeachX track progress</p>
          <p className="mt-1 font-mono text-4xl font-bold text-primary tabular">{prog.pct}%</p>
          <Meter value={prog.pct} className="mt-2" />
          {track.prerequisites.length ? (
            <p className="mt-3 text-xs text-muted-foreground">
              Normally after:{" "}
              {track.prerequisites.map((p, i) => {
                const pt = getTrack(p);
                return (
                  <span key={p}>
                    {i ? ", " : ""}
                    <Link
                      to="/training/$track"
                      params={{ track: p }}
                      className="text-primary hover:underline"
                    >
                      {pt?.title ?? p}
                    </Link>
                  </span>
                );
              })}
            </p>
          ) : null}
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(
            [
              ["Ground school lessons", prog.parts.lessons, BookOpen],
              ["Module exams passed", prog.parts.quizzes, GraduationCap],
              ["Written & topic tests passed", prog.parts.exams, FileCheck2],
              ["Simulator scenarios ≥ 70%", prog.parts.sims, PlaneTakeoff],
              ["ATC scenarios ≥ 70%", prog.parts.atc, Radio],
            ] as const
          ).map(([label, p, Icon]) =>
            p.total > 0 ? (
              <div key={label} className="rounded-md border bg-muted/20 px-3 py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Icon className="size-3.5" />
                    {label}
                  </span>
                  <span className="font-mono text-xs font-semibold tabular">
                    {p.done}/{p.total}
                  </span>
                </div>
                <Meter value={p.pct} className="mt-2" />
              </div>
            ) : null,
          )}
        </div>
      </div>

      {/* Requirements */}
      <div className="mb-8 grid gap-4 lg:grid-cols-2">
        <Panel title="Eligibility">
          <ReqList items={track.eligibility} />
        </Panel>
        <Panel title="Aeronautical experience & training">
          <ReqList items={track.experience} />
        </Panel>
        <Panel title="Knowledge & practical tests">
          <ReqList items={track.testing} />
        </Panel>
        <Panel title="Privileges & limitations">
          <ul className="space-y-2 text-sm leading-relaxed">
            {track.privileges.map((p) => (
              <li key={p} className="flex gap-2">
                <span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" />
                <span>{p}</span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <Section title="Knowledge areas">
        <div className="flex flex-wrap gap-1.5">
          {track.knowledgeAreas.map((k) => (
            <span key={k} className="rounded-md border bg-card px-2.5 py-1 text-xs">
              {k}
            </span>
          ))}
        </div>
      </Section>

      {/* Ground school */}
      <Section title="Ground school" description="TeachX academy modules that cover this track.">
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {track.groundModules.map((ref) => {
            const mod = getModule(ref.course, ref.moduleId);
            const course = getCourse(ref.course);
            if (!mod) return null;
            const c = moduleCompletion(mod, state.lessons);
            const firstOpen = mod.lessons.findIndex((l) => !state.lessons[l.id]);
            return (
              <Link
                key={`${ref.course}-${ref.moduleId}`}
                to="/academy/$course/$module"
                params={{ course: ref.course, module: ref.moduleId }}
                search={{ lesson: firstOpen >= 0 ? firstOpen + 1 : 1 }}
                className="panel flex flex-col gap-2 p-3 transition-colors hover:border-primary/50"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium">{mod.title}</span>
                  <Pill tone={ref.course === "ifr" ? "magenta" : "cyan"}>
                    {ref.course.toUpperCase()}
                  </Pill>
                </div>
                <span className="text-[11px] text-muted-foreground">
                  {course?.title ?? ""} · Module {mod.number} · {c.done}/{c.total} lessons
                </span>
                <Meter value={c.pct} />
              </Link>
            );
          })}
        </div>
      </Section>

      {/* Exams */}
      <Section
        title="Exams"
        description="Written-exam simulations and topic practice tests. 70% is the passing standard."
      >
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {[...written, ...topics].map((id) => {
            const item = prog.parts.exams.items.find((e) => e.examId === id);
            const info = EXAM_INFO[id];
            const best = item?.best ?? null;
            return (
              <Link
                key={id}
                to="/exam/$examId"
                params={{ examId: id }}
                search={{ mode: info?.kind === "written" ? "timed" : "study" }}
                className="panel flex items-center gap-3 p-3 transition-colors hover:border-primary/50"
              >
                <span
                  className={cn(
                    "flex size-9 shrink-0 items-center justify-center rounded-md",
                    info?.kind === "written"
                      ? "bg-primary/15 text-primary"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {info?.kind === "written" ? (
                    <FileCheck2 className="size-4" />
                  ) : (
                    <ListChecks className="size-4" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{info?.title ?? id}</span>
                  <span className="text-[11px] text-muted-foreground">
                    {info?.kind === "written"
                      ? "FAA-style written exam simulation"
                      : "Topic practice test"}
                  </span>
                </span>
                <Pill tone={scoreTone(best)}>
                  {best === null ? "Not taken" : `Best ${Math.round(best)}%`}
                </Pill>
              </Link>
            );
          })}
        </div>
      </Section>

      {/* Simulator */}
      <Section
        title="Simulator scenarios"
        description="Fly these in the TeachX simulator. Simulated flights are not loggable time."
      >
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {prog.parts.sims.items.map((s) => (
            <HrefLink
              key={s.scenarioId}
              href={`/simulator?scenario=${s.scenarioId}`}
              className="panel flex items-center gap-3 p-3 transition-colors hover:border-primary/50"
            >
              <PlaneTakeoff className="size-4 shrink-0 text-primary" />
              <span className="min-w-0 flex-1 truncate text-sm">
                {SIM_SCENARIOS[s.scenarioId] ?? s.scenarioId}
              </span>
              <Pill tone={scoreTone(s.best)}>
                {s.best === null ? "Fly" : `${Math.round(s.best)}`}
              </Pill>
            </HrefLink>
          ))}
        </div>
      </Section>

      {/* ATC */}
      <Section
        title="Radio & ATC practice"
        description="Scripted scenarios in the ATC simulator, or free-form practice with the AI controller."
      >
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {prog.parts.atc.items.map((s) => (
            <HrefLink
              key={s.scenarioId}
              href={`/atc?scenario=${s.scenarioId}`}
              className="panel flex items-center gap-3 p-3 transition-colors hover:border-primary/50"
            >
              <Radio className="size-4 shrink-0 text-primary" />
              <span className="min-w-0 flex-1 truncate text-sm">
                {ATC_SCENARIOS[s.scenarioId] ?? s.scenarioId}
              </span>
              <Pill tone={scoreTone(s.best)}>
                {s.best === null ? "Start" : `${Math.round(s.best)}%`}
              </Pill>
            </HrefLink>
          ))}
          <Link
            to="/ai-atc"
            className="panel flex items-center gap-3 border-dashed p-3 transition-colors hover:border-primary/50"
          >
            <MessageSquareText className="size-4 shrink-0 text-primary" />
            <span className="flex-1 text-sm">Free-form AI ATC</span>
            <ArrowRight className="size-4 text-muted-foreground" />
          </Link>
        </div>
      </Section>

      {/* Oral & checkride */}
      <div className="mb-8 grid gap-4 lg:grid-cols-2">
        <Panel
          title="Oral exam topics"
          actions={
            <Link
              to="/oral-exam"
              className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
            >
              <Mic className="size-3.5" /> Practise oral exam
            </Link>
          }
        >
          <ul className="space-y-1.5 text-sm">
            {track.oralTopics.map((t) => (
              <li key={t} className="flex gap-2">
                <span className="mt-2 size-1.5 shrink-0 rounded-full bg-cyan" />
                <span>{t}</span>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel
          title="Scenario-based evaluation"
          actions={
            <button
              type="button"
              onClick={() => setShowEval((v) => !v)}
              className="text-xs font-semibold text-primary hover:underline"
            >
              {showEval ? "Hide" : "Show"} prompts
            </button>
          }
        >
          <p className="text-sm leading-relaxed text-muted-foreground">
            Examiners use realistic scenarios to test judgment, not memorization. Think each one
            through aloud — what you would do and why — then compare with your instructor or the AI
            instructor.
          </p>
          {showEval ? (
            <ol className="mt-3 space-y-2">
              {track.scenarioEvaluations.map((s, i) => (
                <li key={s} className="rounded-md border bg-muted/20 p-2.5 text-sm">
                  <span className="mr-1.5 font-mono text-xs text-muted-foreground">{i + 1}.</span>
                  {s}
                </li>
              ))}
            </ol>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              to="/instructor"
              className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs hover:bg-accent"
            >
              Discuss with AI instructor
            </Link>
          </div>
        </Panel>
      </div>

      <div className="panel mb-8 flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <ClipboardCheck className="mt-0.5 size-5 shrink-0 text-primary" />
          <div>
            <p className="font-semibold">Mock checkride</p>
            <p className="text-sm text-muted-foreground">
              Oral, planning and flight stages graded against ACS-style standards. Simulated — not
              an FAA practical test.
            </p>
          </div>
        </div>
        <Link
          to="/checkrides"
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
        >
          Go to checkrides <ArrowRight className="size-4" />
        </Link>
      </div>

      <Section title="References">
        <ul className="flex flex-wrap gap-1.5">
          {track.references.map((r) => (
            <li
              key={r}
              className="flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs text-muted-foreground"
            >
              <ScrollText className="size-3" />
              {r}
            </li>
          ))}
        </ul>
      </Section>

      <Notice>
        Regulation references are to 14 CFR unless stated. Summaries are simplified for study and
        may omit exceptions.
      </Notice>
    </Page>
  );
}
