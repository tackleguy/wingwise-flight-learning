import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ArrowLeft, ChevronRight, History, Lightbulb, MessageSquareText, Play } from "lucide-react";
import { Notice, Page, PageHeader, formatDate } from "@/components/app/page";
import { AiStatusPill, useAiStatus } from "@/components/ai/AiStatusPill";

function OralAiPill() {
  const { status, loading } = useAiStatus();
  return <AiStatusPill status={status} loading={loading} />;
}
import { Button } from "@/components/ui/button";
import { OralExamSession, type OralSessionResult } from "@/components/oral/OralExamSession";
import { LEVELS, ORAL_QUESTIONS, trackToOral, type OralLevel, type OralTrack } from "@/lib/oral";
import { actions, useHydrated, useStore } from "@/lib/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/oral-exam")({
  head: () => ({
    meta: [
      { title: "Oral Exam Simulator — SkyReady" },
      {
        name: "description",
        content:
          "Practice the checkride oral with a simulated examiner: typed or spoken answers, rubric grading with follow-up questions, model answers and a full examination report.",
      },
    ],
  }),
  component: OralExamPage,
});

const TRACKS: { id: OralTrack; label: string; sub: string }[] = [
  { id: "private", label: "Private Pilot", sub: "Airplane single-engine land" },
  { id: "instrument", label: "Instrument Rating", sub: "IFR procedures, approaches, IFR weather" },
  {
    id: "commercial",
    label: "Commercial Pilot",
    sub: "Commercial privileges, complex systems, maneuvers",
  },
];

const LEVEL_ORDER: OralLevel[] = ["beginner", "standard", "advanced", "checkride"];

function OralExamPage() {
  const hydrated = useHydrated();
  const goal = useStore((s) => s.profile?.goal);
  const orals = useStore((s) => s.orals);
  const [track, setTrack] = useState<OralTrack>("private");
  const [level, setLevel] = useState<OralLevel>("standard");
  const [session, setSession] = useState(0);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (goal) setTrack(trackToOral(goal));
  }, [goal]);

  const onComplete = (r: OralSessionResult) => {
    actions.recordOral({ level: r.level, trackId: r.trackId, score: r.score, items: r.items });
  };

  if (running) {
    return (
      <Page className="max-w-4xl">
        <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1">
          <Button variant="ghost" size="sm" onClick={() => setRunning(false)}>
            <ArrowLeft /> Setup
          </Button>
          <span className="text-sm font-semibold">
            {TRACKS.find((t) => t.id === track)?.label} · {LEVELS[level].label} oral
          </span>
          <span className="ml-auto text-xs text-muted-foreground">
            Simulated — not an FAA practical test
          </span>
        </div>
        <OralExamSession
          key={session}
          level={level}
          trackId={track}
          onComplete={onComplete}
          onRestart={() => {
            setRunning(false);
          }}
        />
      </Page>
    );
  }

  const trackQuestionCount = ORAL_QUESTIONS.filter((q) => q.tracks.includes(track)).length;
  const topics = Array.from(
    new Set(ORAL_QUESTIONS.filter((q) => q.tracks.includes(track)).map((q) => q.topic)),
  );

  return (
    <Page className="max-w-4xl">
      <PageHeader
        eyebrow="Test"
        title="Oral Exam Simulator"
        icon={MessageSquareText}
        description="Answer a simulated examiner by typing or speaking. It follows up when something is missing and shows what a complete answer looks like."
        actions={<OralAiPill />}
      />
      <Notice tone="caution" title="Simulated, unofficial oral exam." className="-mt-2 mb-6">
        SkyReady's examiner is a training tool built from FAA publications and the ACS. It is not a
        designated pilot examiner, its scores are estimates, and it does not satisfy any FAA
        requirement.
      </Notice>

      <section className="mb-6">
        <h2 className="mb-2 text-sm font-semibold">Certificate or rating</h2>
        <div className="inline-flex flex-wrap rounded-md border p-0.5">
          {TRACKS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTrack(t.id)}
              title={t.sub}
              className={cn(
                "rounded px-3 py-1.5 text-sm font-medium transition-colors",
                track === t.id
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
              aria-pressed={track === t.id}
            >
              {t.label}
            </button>
          ))}
        </div>
      </section>

      <section className="mb-8">
        <h2 className="mb-2 text-sm font-semibold">Level</h2>
        <div className="grid gap-px overflow-hidden rounded-md border bg-border sm:grid-cols-2">
          {LEVEL_ORDER.map((l) => {
            const info = LEVELS[l];
            return (
              <button
                key={l}
                type="button"
                onClick={() => setLevel(l)}
                className={cn(
                  "bg-background px-3.5 py-3 text-left transition-colors",
                  level === l ? "bg-primary/10" : "hover:bg-accent/40",
                )}
                aria-pressed={level === l}
              >
                <span className="flex items-center gap-2">
                  <span
                    className={cn(
                      "size-3.5 shrink-0 rounded-full border",
                      level === l ? "border-4 border-primary" : "border-muted-foreground/50",
                    )}
                    aria-hidden
                  />
                  <span className="text-sm font-semibold">{info.label}</span>
                  <span className="ml-auto font-mono text-[11px] text-muted-foreground">
                    {info.count} q
                  </span>
                </span>
                <span className="mt-1 block pl-5.5 text-xs leading-relaxed text-muted-foreground">
                  {info.description}
                  {info.hints ? (
                    <span className="ml-1 inline-flex items-center gap-0.5 text-caution">
                      <Lightbulb className="size-3" /> Hints
                    </span>
                  ) : null}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <div className="mb-10 flex flex-wrap items-center gap-3">
        <Button
          size="lg"
          onClick={() => {
            setSession((s) => s + 1);
            setRunning(true);
          }}
        >
          <Play /> Begin oral exam
        </Button>
        <span className="text-xs text-muted-foreground">
          {trackQuestionCount} questions in this track · saved to your training record
        </span>
      </div>

      {hydrated && orals.length > 0 ? (
        <section className="mb-8">
          <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
            <History className="size-4 text-muted-foreground" /> Recent sessions
          </h2>
          <ul className="divide-y border-y">
            {orals.slice(0, 8).map((o) => (
              <li key={o.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                <span>
                  <span className="font-medium capitalize">
                    {o.trackId} · {LEVELS[o.level].label}
                  </span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    {formatDate(o.date)} · {o.items.length} questions
                  </span>
                </span>
                <span
                  className={cn(
                    "font-mono font-semibold tabular",
                    o.score >= 70 ? "text-ok" : "text-warning",
                  )}
                >
                  {Math.round(o.score)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <details className="group text-sm">
        <summary className="flex cursor-pointer list-none items-center gap-1.5 font-medium text-muted-foreground select-none hover:text-foreground [&::-webkit-details-marker]:hidden">
          <ChevronRight className="size-4 transition-transform group-open:rotate-90" />
          How grading works &amp; topics covered
        </summary>
        <div className="mt-3 space-y-4 pl-5">
          <ul className="list-disc space-y-1.5 pl-4 text-foreground/85 marker:text-muted-foreground">
            <li>
              Every question has a rubric of weighted key concepts; your answer is scored 0–100 on
              how many you cover.
            </li>
            <li>
              A partial answer gets a follow-up, like a real examiner probing. Concepts added after
              prompting earn partial credit.
            </li>
            <li>
              Incorrect or incomplete answers are explained with a model answer and reference.
            </li>
            <li>
              With the on-device AI (or your own local model) on, its assessment is blended with the
              rubric (never more than ±20 points). Without AI, rubric grading works fully offline.
            </li>
            <li>
              Answer by voice where the browser supports speech recognition, and turn on the
              examiner&apos;s voice to practise listening.
            </li>
          </ul>
          <p className="text-xs leading-relaxed text-muted-foreground">
            <span className="font-medium text-foreground/80">Topics:</span> {topics.join(" · ")}
          </p>
        </div>
      </details>
    </Page>
  );
}
