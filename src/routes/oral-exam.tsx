import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ArrowLeft, CheckCircle2, ClipboardCheck, History, Lightbulb, MessageSquareText, Mic, Play, Sparkles, UserRound } from "lucide-react";
import { Notice, Page, PageHeader, Panel, Pill, Section, formatDate } from "@/components/app/page";
import { Button } from "@/components/ui/button";
import { OralExamSession, type OralSessionResult } from "@/components/oral/OralExamSession";
import { LEVELS, ORAL_QUESTIONS, trackToOral, type OralLevel, type OralTrack } from "@/lib/oral";
import { actions, useHydrated, useStore } from "@/lib/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/oral-exam")({
  head: () => ({
    meta: [
      { title: "Oral Exam Simulator — TeachX" },
      {
        name: "description",
        content: "Practice the checkride oral with a simulated examiner: typed or spoken answers, rubric grading with follow-up questions, model answers and a full examination report.",
      },
    ],
  }),
  component: OralExamPage,
});

const TRACKS: { id: OralTrack; label: string; sub: string }[] = [
  { id: "private", label: "Private Pilot", sub: "Airplane single-engine land" },
  { id: "instrument", label: "Instrument Rating", sub: "IFR procedures, approaches, IFR weather" },
  { id: "commercial", label: "Commercial Pilot", sub: "Commercial privileges, complex systems, maneuvers" },
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
      <Page className="max-w-5xl">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => setRunning(false)}>
            <ArrowLeft /> Oral exam setup
          </Button>
          <span className="text-sm font-semibold">
            {TRACKS.find((t) => t.id === track)?.label} · {LEVELS[level].label} oral
          </span>
          <Pill tone="caution" className="ml-auto">
            Simulated — not an FAA practical test
          </Pill>
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

  return (
    <Page>
      <PageHeader
        eyebrow="Test"
        title="Oral Exam Simulator"
        icon={MessageSquareText}
        description="Sit across the table from a simulated examiner. Answer by typing or speaking; the examiner checks your answer against the key concepts, follows up when something is missing, and explains what a complete answer looks like."
      />
      <Notice tone="caution" title="Simulated, unofficial oral exam." className="mb-6">
        TeachX's examiner is a training tool built from FAA publications and the ACS. It is not a designated pilot examiner, its scores are estimates, and it does not satisfy any FAA requirement.
      </Notice>

      <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <div className="grid content-start gap-4">
          <Panel title="1 · Certificate or rating">
            <div className="grid gap-2 sm:grid-cols-3">
              {TRACKS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTrack(t.id)}
                  className={cn("rounded-md border px-3 py-2.5 text-left transition-colors", track === t.id ? "border-primary bg-primary/10" : "hover:bg-accent/40")}
                  aria-pressed={track === t.id}
                >
                  <span className="block text-sm font-semibold">{t.label}</span>
                  <span className="block text-[11px] text-muted-foreground">{t.sub}</span>
                </button>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">{trackQuestionCount} examiner questions available for this track.</p>
          </Panel>

          <Panel title="2 · Session level">
            <div className="grid gap-2 sm:grid-cols-2">
              {LEVEL_ORDER.map((l) => {
                const info = LEVELS[l];
                return (
                  <button
                    key={l}
                    type="button"
                    onClick={() => setLevel(l)}
                    className={cn("rounded-md border px-3 py-3 text-left transition-colors", level === l ? "border-primary bg-primary/10" : "hover:bg-accent/40")}
                    aria-pressed={level === l}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold">{info.label}</span>
                      <span className="font-mono text-[11px] text-muted-foreground">{info.count} q</span>
                    </span>
                    <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">{info.description}</span>
                    {info.hints ? (
                      <span className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-caution">
                        <Lightbulb className="size-3" /> Hints available
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </Panel>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              size="lg"
              onClick={() => {
                setSession((s) => s + 1);
                setRunning(true);
              }}
            >
              <Play /> Begin oral exam
            </Button>
            <span className="text-xs text-muted-foreground">Your session is saved to your training record when it finishes.</span>
          </div>
        </div>

        <div className="grid content-start gap-4">
          <Panel title="How the examiner grades">
            <ul className="grid gap-2.5 text-sm text-foreground/85">
              <li className="flex gap-2"><ClipboardCheck className="mt-0.5 size-4 shrink-0 text-primary" /> Every question has a rubric of weighted key concepts. Your answer is scored 0–100 on how many you cover.</li>
              <li className="flex gap-2"><UserRound className="mt-0.5 size-4 shrink-0 text-primary" /> A partially correct answer gets a follow-up, just like a real examiner probing. Concepts you add after prompting earn partial credit.</li>
              <li className="flex gap-2"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" /> Incorrect or incomplete answers are explained with a model answer and reference.</li>
              <li className="flex gap-2"><Sparkles className="mt-0.5 size-4 shrink-0 text-magenta" /> If an AI provider is configured in Settings, its assessment is blended with the rubric (never more than ±20 points). Without AI, rubric grading works fully offline.</li>
              <li className="flex gap-2"><Mic className="mt-0.5 size-4 shrink-0 text-primary" /> Answer by voice in browsers that support speech recognition, and turn on the examiner's voice to practice listening.</li>
            </ul>
          </Panel>
          <Panel title={<span className="flex items-center gap-1.5"><History className="size-3.5" /> Recent oral sessions</span>}>
            {!hydrated ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : orals.length === 0 ? (
              <p className="text-sm text-muted-foreground">No sessions yet. Start with Beginner or Standard.</p>
            ) : (
              <ul className="grid gap-1.5">
                {orals.slice(0, 8).map((o) => (
                  <li key={o.id} className="flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-sm">
                    <span>
                      <span className="block font-medium capitalize">
                        {o.trackId} · {LEVELS[o.level].label}
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        {formatDate(o.date)} · {o.items.length} questions
                      </span>
                    </span>
                    <span className={cn("font-mono text-base font-semibold tabular", o.score >= 70 ? "text-ok" : "text-warning")}>{Math.round(o.score)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>

      <Section className="mt-8" title="Topics covered" description="The examiner draws from these areas, weighted toward the track you choose.">
        <div className="flex flex-wrap gap-1.5">
          {Array.from(new Set(ORAL_QUESTIONS.filter((q) => q.tracks.includes(track)).map((q) => q.topic))).map((t) => (
            <Pill key={t}>{t}</Pill>
          ))}
        </div>
      </Section>
    </Page>
  );
}
