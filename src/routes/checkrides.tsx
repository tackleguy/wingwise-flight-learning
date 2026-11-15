import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleDashed,
  ClipboardCheck,
  FileSearch,
  Play,
  XCircle,
} from "lucide-react";
import { EmptyState, Meter, Notice, Page, PageHeader, formatDate } from "@/components/app/page";
import { Button } from "@/components/ui/button";
import {
  actions,
  uid,
  useHydrated,
  useStore,
  type CheckrideAttempt,
  type CheckrideStageResult,
} from "@/lib/store";
import { CHECKRIDE_TRACKS, PASS_SCORE, trackDef } from "@/lib/checkride/content";
import type { CheckrideTrackDef, StageDef, StageId } from "@/lib/checkride/types";
import type { StageProps } from "@/components/checkride/shared";
import {
  AircraftKnowledgeStage,
  DocumentsStage,
  OralStage,
  PlanningStage,
  PreflightPrepStage,
  WeatherStage,
} from "@/components/checkride/stages-a";
import {
  EmergencyStage,
  ManeuversStage,
  NavigationStage,
  PostflightStage,
  RadioStage,
} from "@/components/checkride/stages-b";
import { WalkaroundStage } from "@/components/checkride/WalkAround";
import { CheckrideReport } from "@/components/checkride/CheckrideReport";
import { cn } from "@/lib/utils";

interface CheckrideSearch {
  attempt?: string;
}

export const Route = createFileRoute("/checkrides")({
  validateSearch: (search: Record<string, unknown>): CheckrideSearch => {
    const a = search["attempt"];
    return typeof a === "string" && a.length > 0 && a.length < 100 ? { attempt: a } : {};
  },
  head: () => ({
    meta: [
      { title: "Virtual Checkrides — SkyReady" },
      {
        name: "description",
        content:
          "Simulated Private, Instrument and Commercial checkrides: 12 stages from document inspection and oral exam to simulator maneuvers, with ACS-referenced grading and a printable report. Not an FAA practical test.",
      },
    ],
  }),
  component: CheckridesPage,
});

const STAGE_COMPONENTS: Record<StageId, (p: StageProps) => React.JSX.Element> = {
  "preflight-prep": PreflightPrepStage,
  documents: DocumentsStage,
  "aircraft-knowledge": AircraftKnowledgeStage,
  weather: WeatherStage,
  planning: PlanningStage,
  oral: OralStage,
  walkaround: WalkaroundStage,
  maneuvers: ManeuversStage,
  navigation: NavigationStage,
  radio: RadioStage,
  emergency: EmergencyStage,
  postflight: PostflightStage,
};

function CheckridesPage() {
  const search = Route.useSearch();
  const hydrated = useHydrated();
  const checkrides = useStore((s) => s.checkrides);

  if (search.attempt) {
    if (!hydrated) {
      return (
        <Page>
          <p className="py-16 text-center text-sm text-muted-foreground">Loading your checkride…</p>
        </Page>
      );
    }
    const attempt = checkrides.find((c) => c.id === search.attempt);
    const track = attempt ? trackDef(attempt.trackId) : undefined;
    if (!attempt || !track) {
      return (
        <Page>
          <EmptyState
            icon={FileSearch}
            title="Checkride not found"
            description="This checkride attempt isn't in your training record on this device."
            action={{ to: "/checkrides", label: "Back to Virtual Checkrides" }}
          />
        </Page>
      );
    }
    return <AttemptView key={attempt.id} attempt={attempt} track={track} />;
  }

  return <CheckrideHome />;
}

function SimNotice() {
  return (
    <Notice
      tone="caution"
      title="Simulated checkride — not an FAA practical test."
      className="mb-6"
    >
      SkyReady checkrides are training exercises modeled on the FAA Airman Certification Standards.
      They are not administered by an examiner, do not grant any certificate or rating, and do not
      satisfy any FAA requirement.
    </Notice>
  );
}

function CheckrideHome() {
  const navigate = useNavigate();
  const hydrated = useHydrated();
  const checkrides = useStore((s) => s.checkrides);
  const goal = useStore((s) => s.profile?.goal);

  const start = (t: CheckrideTrackDef) => {
    const now = new Date().toISOString();
    const attempt: CheckrideAttempt = {
      id: uid(),
      date: now,
      trackId: t.trackId,
      title: t.title,
      stages: t.stages.map((s) => ({
        id: s.id,
        name: s.name,
        score: 0,
        status: "incomplete",
        notes: [],
        acsRef: s.acsRef,
      })),
      overall: 0,
      passed: false,
      completed: false,
    };
    actions.saveCheckride(attempt);
    void navigate({ to: "/checkrides", search: { attempt: attempt.id } });
  };

  const stageNames = CHECKRIDE_TRACKS[0]?.stages ?? [];

  return (
    <Page className="max-w-5xl">
      <PageHeader
        eyebrow="Test"
        title="Virtual Checkrides"
        icon={ClipboardCheck}
        description="A mock practical test in 12 stages — from documents and the oral to the flight in the simulator and a debrief, each graded against ACS-style standards."
      />
      <SimNotice />

      <ul className="mb-10 divide-y border-y">
        {CHECKRIDE_TRACKS.map((t) => {
          const recommended = goal === t.trackId;
          return (
            <li
              key={t.key}
              className="flex flex-col gap-3 py-5 sm:flex-row sm:items-center sm:gap-6"
            >
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-baseline gap-x-2">
                  <span className="text-lg font-semibold">{t.title}</span>
                  <span className="text-xs text-muted-foreground">
                    {t.ifr ? "IFR" : "VFR"} · {t.certificate}
                  </span>
                  {recommended ? (
                    <span className="text-xs font-medium text-primary">· Your goal</span>
                  ) : null}
                </p>
                <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{t.description}</p>
              </div>
              <Button
                className="shrink-0 self-start sm:self-center"
                variant={recommended ? "default" : "outline"}
                onClick={() => start(t)}
              >
                <Play /> Begin
              </Button>
            </li>
          );
        })}
      </ul>

      {hydrated && checkrides.length > 0 ? (
        <section className="mb-10">
          <h2 className="mb-2 text-sm font-semibold">Your attempts</h2>
          <ul className="divide-y border-y">
            {checkrides.slice(0, 10).map((c) => {
              const done = c.stages.filter((s) => s.status !== "incomplete").length;
              return (
                <li key={c.id}>
                  <Link
                    to="/checkrides"
                    search={{ attempt: c.id }}
                    className="group flex items-center gap-3 py-2.5"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium group-hover:text-primary">
                        {c.title}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {formatDate(c.date)} · {done}/{c.stages.length} stages
                      </p>
                    </div>
                    <span
                      className={cn(
                        "text-xs",
                        c.completed ? (c.passed ? "text-ok" : "text-warning") : "text-caution",
                      )}
                    >
                      {c.completed ? (c.passed ? "Satisfactory" : "Unsatisfactory") : "In progress"}
                    </span>
                    <span className="w-10 text-right font-mono text-sm tabular">
                      {done ? Math.round(c.overall) : "—"}
                    </span>
                    <ChevronRight className="size-4 text-muted-foreground" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <details className="group text-sm">
        <summary className="flex cursor-pointer list-none items-center gap-1.5 font-medium text-muted-foreground select-none hover:text-foreground [&::-webkit-details-marker]:hidden">
          <ChevronRight className="size-4 transition-transform group-open:rotate-90" />
          The 12 stages &amp; how grading works
        </summary>
        <div className="mt-3 grid gap-6 pl-5 md:grid-cols-2">
          <ol className="grid grid-cols-1 gap-y-1 text-muted-foreground sm:grid-cols-2 sm:gap-x-4">
            {stageNames.map((s) => (
              <li key={s.id}>
                <span className="font-mono text-xs">{s.number}.</span> {s.name}
              </li>
            ))}
          </ol>
          <ul className="list-disc space-y-1.5 pl-4 text-foreground/85 marker:text-muted-foreground">
            <li>Each stage is scored 0–100 and is satisfactory at {PASS_SCORE} or above.</li>
            <li>Like a real practical test, you pass only if every stage is satisfactory.</li>
            <li>The flight and radio stages use your linked simulator flight and ATC session.</li>
            <li>Progress saves after every stage, so you can leave and come back.</li>
            <li>The final report lists ACS references and debrief notes, and can be printed.</li>
          </ul>
        </div>
      </details>
    </Page>
  );
}

function StageStatusIcon({ s }: { s: CheckrideStageResult }) {
  if (s.status === "satisfactory") return <CheckCircle2 className="size-4 shrink-0 text-ok" />;
  if (s.status === "unsatisfactory") return <XCircle className="size-4 shrink-0 text-warning" />;
  return <CircleDashed className="size-4 shrink-0 text-muted-foreground" />;
}

function AttemptView({ attempt, track }: { attempt: CheckrideAttempt; track: CheckrideTrackDef }) {
  const [viewing, setViewing] = useState<string | null>(null);
  const currentIdx = attempt.stages.findIndex((s) => s.status === "incomplete");
  const current = currentIdx >= 0 ? track.stages[currentIdx] : undefined;
  const doneCount = attempt.stages.filter((s) => s.status !== "incomplete").length;
  const viewed = viewing
    ? attempt.stages.find((s) => s.id === viewing && s.status !== "incomplete")
    : undefined;

  const save = (stageId: string, update: (s: CheckrideStageResult) => CheckrideStageResult) => {
    const stages = attempt.stages.map((s) => (s.id === stageId ? update(s) : s));
    const graded = stages.filter((s) => s.status !== "incomplete");
    const completed = graded.length === stages.length;
    actions.saveCheckride({
      ...attempt,
      stages,
      overall: graded.length ? graded.reduce((a, s) => a + s.score, 0) / graded.length : 0,
      passed: completed && stages.every((s) => s.status === "satisfactory"),
      completed,
    });
  };

  const onComplete = (stage: StageDef) => (score: number, notes: string[]) => {
    const sc = Math.max(0, Math.min(100, Math.round(score)));
    save(stage.id, (s) => ({
      ...s,
      score: sc,
      status: sc >= PASS_SCORE ? "satisfactory" : "unsatisfactory",
      notes,
      acsRef: stage.acsRef,
    }));
    setViewing(null);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const onSaveProgress = (stage: StageDef) => (notes: string[]) =>
    save(stage.id, (s) => ({ ...s, notes }));

  const StageComp = current ? STAGE_COMPONENTS[current.id] : null;
  const stageList = (
    <ol className="grid gap-0.5">
      {attempt.stages.map((s, i) => {
        const isCurrent = i === currentIdx;
        const clickable = s.status !== "incomplete";
        return (
          <li key={s.id}>
            <button
              type="button"
              disabled={!clickable}
              onClick={() => setViewing(s.id)}
              className={cn(
                "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs",
                isCurrent && "bg-primary/10 font-semibold text-foreground",
                clickable && "hover:bg-accent/50",
                !clickable && !isCurrent && "text-muted-foreground",
                viewing === s.id && "bg-accent/60",
              )}
            >
              <span className="w-4 font-mono text-[10px] text-muted-foreground">{i + 1}</span>
              <StageStatusIcon s={s} />
              <span className="flex-1 truncate">{s.name}</span>
              {clickable ? <span className="font-mono tabular">{Math.round(s.score)}</span> : null}
            </button>
          </li>
        );
      })}
    </ol>
  );
  const saved = current ? attempt.stages[currentIdx] : undefined;

  return (
    <Page className="max-w-6xl">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Link
          to="/checkrides"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Virtual Checkrides
        </Link>
        <span className="text-muted-foreground/40">/</span>
        <h1 className="text-lg font-bold tracking-tight">{track.title}</h1>
        <span className="ml-auto text-xs text-muted-foreground">
          Simulated · not an FAA practical test
        </span>
      </div>

      <div className="grid gap-6 lg:grid-cols-[240px_1fr] xl:gap-10">
        <aside className="lg:sticky lg:top-16 lg:self-start">
          <details className="group rounded-md border lg:hidden">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 text-sm select-none [&::-webkit-details-marker]:hidden">
              <span className="min-w-0 truncate">
                <span className="text-muted-foreground">
                  Stage {Math.min(doneCount + 1, attempt.stages.length)} of {attempt.stages.length}{" "}
                  ·
                </span>{" "}
                <span className="font-medium">{current?.name ?? "Report"}</span>
              </span>
              <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
            </summary>
            <div className="border-t p-1.5">{stageList}</div>
          </details>
          <nav className="hidden lg:block" aria-label="Stages">
            <Meter
              value={(doneCount / attempt.stages.length) * 100}
              label={`${doneCount} of ${attempt.stages.length} graded`}
              className="mb-3 px-2"
            />
            {stageList}
            <p className="mt-3 px-2 text-[11px] text-muted-foreground">
              Progress saves after every stage.
            </p>
          </nav>
        </aside>

        <div className="min-w-0">
          {viewed ? (
            <div className="mb-6 rounded-md border p-4 animate-fade-up">
              <div className="flex flex-wrap items-center gap-2">
                <StageStatusIcon s={viewed} />
                <h2 className="font-semibold">{viewed.name}</h2>
                <span className="font-mono text-sm tabular">{Math.round(viewed.score)}/100</span>
                <span
                  className={cn(
                    "text-xs capitalize",
                    viewed.status === "satisfactory" ? "text-ok" : "text-warning",
                  )}
                >
                  {viewed.status}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-auto"
                  onClick={() => setViewing(null)}
                >
                  Close
                </Button>
              </div>
              <p className="mt-1 font-mono text-[11px] text-cyan">{viewed.acsRef}</p>
              <ul className="mt-2 grid gap-1 text-sm text-foreground/85">
                {viewed.notes.map((n, i) => (
                  <li key={i}>• {n}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {current && StageComp && saved ? (
            <StageComp
              key={`${attempt.id}:${current.id}`}
              attempt={attempt}
              track={track}
              stage={current}
              saved={saved}
              onComplete={onComplete(current)}
              onSaveProgress={onSaveProgress(current)}
            />
          ) : (
            <CheckrideReport attempt={attempt} track={track} />
          )}
        </div>
      </div>
    </Page>
  );
}
