import { useState, type ReactNode } from "react";
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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState, Meter, Notice, Page, PageHeader } from "@/components/app/page";
import { moduleCompletion } from "@/components/academy/CourseOverview";
import { HrefLink } from "@/components/academy/PracticeLink";
import { useTrackState } from "@/components/academy/useTrackState";
import { getModule } from "@/lib/content";
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
      { title: `${loaderData?.title ?? "Training track"} — SkyReady` },
      {
        name: "description",
        content:
          loaderData?.summary ??
          "SkyReady certification track: FAA requirements, ground school, exams, simulator scenarios and ATC practice.",
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
    <dl className="divide-y border-t">
      {items.map((r) => (
        <div
          key={r.label + r.detail}
          className="grid gap-1 py-2.5 sm:grid-cols-[150px_1fr] sm:gap-3"
        >
          <dt className="text-xs font-medium text-muted-foreground sm:pt-0.5">{r.label}</dt>
          <dd className="text-sm leading-relaxed text-foreground/85">
            {r.detail}
            {r.ref ? (
              <span className="ml-1.5 font-mono text-[10px] whitespace-nowrap text-muted-foreground">
                {r.ref}
              </span>
            ) : null}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function scoreText(best: number | null, empty: string, pct = true) {
  if (best === null) return <span className="text-muted-foreground">{empty}</span>;
  const v = Math.round(best);
  return (
    <span className={cn("font-mono tabular", v >= 70 ? "text-ok" : "text-caution")}>
      {pct ? `${v}%` : v}
    </span>
  );
}

/** Plain list row used across the study plan (no boxes). */
const rowCls =
  "group flex items-center gap-3 py-2.5 text-sm transition-colors hover:text-primary [&>svg:first-child]:shrink-0";

function SubHead({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-1 flex items-baseline justify-between gap-3">
      <h3 className="text-sm font-semibold">{children}</h3>
      {action}
    </div>
  );
}

type TrackTab = "requirements" | "plan" | "oral";

function TrackPage() {
  const { track: trackId } = Route.useParams();
  const track = getTrack(trackId);
  const state = useTrackState();
  const profile = useStore((s) => s.profile);
  const [tab, setTab] = useState<TrackTab>("requirements");

  if (!track) return null;
  const prog = trackProgress(state, track);
  const isGoal = profile?.goal === track.id;
  const written = track.examIds.filter((e) => EXAM_INFO[e]?.kind === "written");
  const topics = track.examIds.filter((e) => EXAM_INFO[e]?.kind === "topic");
  const parts = (
    [
      ["lessons", prog.parts.lessons],
      ["module exams", prog.parts.quizzes],
      ["tests passed", prog.parts.exams],
      ["sim scenarios", prog.parts.sims],
      ["ATC scenarios", prog.parts.atc],
    ] as const
  ).filter(([, p]) => p.total > 0);

  return (
    <Page className="max-w-6xl">
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
                <span className="inline-flex items-center gap-1.5 px-1 text-sm font-medium text-primary">
                  <Crosshair className="size-4" /> Your goal
                </span>
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

      {/* Progress: one line, not a panel of tiles. */}
      <div className="mb-4">
        <div className="mb-2 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
          <span>
            <span className="font-mono text-lg font-semibold text-primary tabular">
              {prog.pct}%
            </span>{" "}
            <span className="text-muted-foreground">track progress</span>
          </span>
          <span className="text-xs text-muted-foreground">
            {parts.map(([label, p], i) => (
              <span key={label}>
                {i ? " · " : ""}
                <span className="font-mono text-foreground tabular">
                  {p.done}/{p.total}
                </span>{" "}
                {label}
              </span>
            ))}
          </span>
          {track.prerequisites.length ? (
            <span className="text-xs text-muted-foreground sm:ml-auto">
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
            </span>
          ) : null}
        </div>
        <Meter value={prog.pct} />
      </div>

      <Notice
        tone="caution"
        title="Not an FAA certificate, rating or endorsement."
        className="mb-6"
      >
        Completing SkyReady training does not grant any FAA certificate, rating, endorsement, or
        loggable flight time. Requirements are simplified study summaries of 14 CFR (references are
        to 14 CFR unless stated) and may omit exceptions — verify them in the current regulations
        and ACS, and train with an authorized instructor. Simulated flights are not loggable time.
      </Notice>

      <Tabs value={tab} onValueChange={(v) => setTab(v as TrackTab)}>
        <div className="-mx-4 mb-6 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <TabsList>
            <TabsTrigger value="requirements">Requirements</TabsTrigger>
            <TabsTrigger value="plan">Study plan</TabsTrigger>
            <TabsTrigger value="oral">Oral &amp; checkride</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="requirements">
          <div className="grid gap-x-12 gap-y-8 lg:grid-cols-2">
            <section>
              <SubHead>Eligibility</SubHead>
              <ReqList items={track.eligibility} />
            </section>
            <section>
              <SubHead>Aeronautical experience &amp; training</SubHead>
              <ReqList items={track.experience} />
            </section>
            <section>
              <SubHead>Knowledge &amp; practical tests</SubHead>
              <ReqList items={track.testing} />
            </section>
            <section>
              <SubHead>Privileges &amp; limitations</SubHead>
              <ul className="list-disc space-y-1.5 pt-1.5 pl-5 text-sm leading-relaxed marker:text-muted-foreground">
                {track.privileges.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </section>
            <section>
              <SubHead>Knowledge areas</SubHead>
              <p className="pt-1.5 text-sm leading-relaxed text-foreground/85">
                {track.knowledgeAreas.join(" · ")}
              </p>
            </section>
            <section>
              <SubHead>References</SubHead>
              <p className="flex gap-2 pt-1.5 text-sm leading-relaxed text-muted-foreground">
                <ScrollText className="mt-1 size-3.5 shrink-0" aria-hidden />
                <span>{track.references.join(" · ")}</span>
              </p>
            </section>
          </div>
        </TabsContent>

        <TabsContent value="plan">
          <div className="grid gap-x-12 gap-y-8 lg:grid-cols-2">
            <section>
              <SubHead>Ground school</SubHead>
              <ul className="divide-y border-t">
                {track.groundModules.map((ref) => {
                  const mod = getModule(ref.course, ref.moduleId);
                  if (!mod) return null;
                  const c = moduleCompletion(mod, state.lessons);
                  const firstOpen = mod.lessons.findIndex((l) => !state.lessons[l.id]);
                  return (
                    <li key={`${ref.course}-${ref.moduleId}`}>
                      <Link
                        to="/academy/$course/$module"
                        params={{ course: ref.course, module: ref.moduleId }}
                        search={{ lesson: firstOpen >= 0 ? firstOpen + 1 : 1 }}
                        className={rowCls}
                      >
                        <BookOpen className="size-4 text-muted-foreground" />
                        <span className="min-w-0 flex-1 truncate">{mod.title}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {ref.course.toUpperCase()} {mod.number} · {c.done}/{c.total}
                        </span>
                        <Meter value={c.pct} className="hidden w-16 shrink-0 sm:block" />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>

            <section>
              <SubHead>Exams</SubHead>
              <ul className="divide-y border-t">
                {[...written, ...topics].map((id) => {
                  const item = prog.parts.exams.items.find((e) => e.examId === id);
                  const info = EXAM_INFO[id];
                  const isWritten = info?.kind === "written";
                  return (
                    <li key={id}>
                      <Link
                        to="/exam/$examId"
                        params={{ examId: id }}
                        search={{ mode: isWritten ? "timed" : "study" }}
                        className={rowCls}
                      >
                        {isWritten ? (
                          <FileCheck2 className="size-4 text-primary" />
                        ) : (
                          <ListChecks className="size-4 text-muted-foreground" />
                        )}
                        <span className="min-w-0 flex-1 truncate">
                          {info?.title ?? id}
                          {isWritten ? (
                            <span className="ml-1.5 text-xs text-muted-foreground">
                              written exam
                            </span>
                          ) : null}
                        </span>
                        <span className="shrink-0 text-xs">
                          {scoreText(item?.best ?? null, "Not taken")}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>

            <section>
              <SubHead>Simulator scenarios</SubHead>
              <ul className="divide-y border-t">
                {prog.parts.sims.items.map((s) => (
                  <li key={s.scenarioId}>
                    <HrefLink href={`/simulator?scenario=${s.scenarioId}`} className={rowCls}>
                      <PlaneTakeoff className="size-4 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate">
                        {SIM_SCENARIOS[s.scenarioId] ?? s.scenarioId}
                      </span>
                      <span className="shrink-0 text-xs">{scoreText(s.best, "Fly", false)}</span>
                    </HrefLink>
                  </li>
                ))}
              </ul>
            </section>

            <section>
              <SubHead
                action={
                  <Link
                    to="/ai-atc"
                    className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                  >
                    <MessageSquareText className="size-3.5" /> Free-form AI ATC
                  </Link>
                }
              >
                Radio &amp; ATC practice
              </SubHead>
              <ul className="divide-y border-t">
                {prog.parts.atc.items.map((s) => (
                  <li key={s.scenarioId}>
                    <HrefLink href={`/atc?scenario=${s.scenarioId}`} className={rowCls}>
                      <Radio className="size-4 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate">
                        {ATC_SCENARIOS[s.scenarioId] ?? s.scenarioId}
                      </span>
                      <span className="shrink-0 text-xs">{scoreText(s.best, "Start")}</span>
                    </HrefLink>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </TabsContent>

        <TabsContent value="oral">
          <div className="grid gap-x-12 gap-y-8 lg:grid-cols-2">
            <section>
              <SubHead
                action={
                  <Link
                    to="/oral-exam"
                    className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                  >
                    <Mic className="size-3.5" /> Practise oral exam
                  </Link>
                }
              >
                Oral exam topics
              </SubHead>
              <ul className="list-disc space-y-1.5 pt-1.5 pl-5 text-sm leading-relaxed marker:text-muted-foreground">
                {track.oralTopics.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </section>
            <section>
              <SubHead
                action={
                  <Link
                    to="/instructor"
                    className="text-xs font-medium text-primary hover:underline"
                  >
                    Discuss with AI instructor
                  </Link>
                }
              >
                Scenario-based evaluation
              </SubHead>
              <p className="pt-1.5 text-sm text-muted-foreground">
                Think each scenario through aloud — what you would do and why.
              </p>
              <ol className="mt-2 list-decimal space-y-2 pl-5 text-sm leading-relaxed marker:text-muted-foreground">
                {track.scenarioEvaluations.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ol>
            </section>
          </div>
          <div className="mt-10 flex flex-col gap-3 border-t pt-5 sm:flex-row sm:items-center sm:justify-between">
            <p className="flex items-start gap-2.5 text-sm">
              <ClipboardCheck className="mt-0.5 size-4.5 shrink-0 text-primary" />
              <span>
                <span className="font-semibold">Mock checkride</span>{" "}
                <span className="text-muted-foreground">
                  — oral, planning and flight stages graded against ACS-style standards. Simulated,
                  not an FAA practical test.
                </span>
              </span>
            </p>
            <Link
              to="/checkrides"
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg btn-glow px-4 py-2 text-sm font-semibold text-primary-foreground"
            >
              Go to checkrides <ArrowRight className="size-4" />
            </Link>
          </div>
        </TabsContent>
      </Tabs>
    </Page>
  );
}
