import { useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowRight,
  BookOpenCheck,
  ClipboardList,
  FileCheck2,
  GraduationCap,
  History,
  ListChecks,
  Play,
  Shuffle,
  Target,
  Timer,
} from "lucide-react";
import {
  EmptyState,
  Meter,
  Notice,
  Page,
  PageHeader,
  Panel,
  Pill,
  Section,
  Stat,
  formatDate,
  formatDuration,
} from "@/components/app/page";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  EXAM_SUBJECTS,
  QUESTION_BANK,
  TOPIC_EXAMS,
  lessonFor,
  type ExamSubject,
} from "@/lib/exams/catalog";
import { recentMissedIds, weakestSubjects } from "@/lib/exams/analytics";
import { useHydrated, useStore } from "@/lib/store";
import { HistoryTable } from "@/components/exams/HistoryTable";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/practice-tests")({
  head: () => ({
    meta: [
      { title: "Practice Test Center — TeachX" },
      {
        name: "description",
        content:
          "Topic practice tests, a custom quiz builder, study mode with explanations, missed-question review and score history. Unofficial study material — not FAA test questions.",
      },
    ],
  }),
  component: PracticeTests,
});

const SUBJECT_COUNTS: Record<string, number> = QUESTION_BANK.reduce<Record<string, number>>(
  (acc, q) => {
    acc[q.subject] = (acc[q.subject] ?? 0) + 1;
    return acc;
  },
  {},
);

const SUBJECT_GROUPS: { label: string; subjects: ExamSubject[] }[] = [
  {
    label: "Rules & airspace",
    subjects: ["Regulations", "Airspace", "Radio & ATC", "Airport Operations"],
  },
  { label: "Weather", subjects: ["Weather", "Weather Services"] },
  {
    label: "Airplane",
    subjects: [
      "Aerodynamics",
      "Aircraft Systems",
      "Flight Instruments",
      "Performance",
      "Weight & Balance",
    ],
  },
  { label: "Navigation", subjects: ["Navigation", "Charts"] },
  {
    label: "Pilot & safety",
    subjects: ["Human Factors", "ADM", "Emergency Procedures", "Night Operations"],
  },
  {
    label: "Instrument & instructor",
    subjects: ["IFR Procedures", "Instrument Approaches", "Fundamentals of Instructing"],
  },
];

const COUNT_OPTIONS = [10, 20, 30, 50];

function PracticeTests() {
  const hydrated = useHydrated();
  const exams = useStore((s) => s.exams);
  const missed = useMemo(() => recentMissedIds(exams), [exams]);
  const weak = useMemo(() => weakestSubjects(exams, 5), [exams]);
  const [showAll, setShowAll] = useState(false);

  const avg = exams.length ? exams.reduce((a, e) => a + e.scorePct, 0) / exams.length : 0;
  const best = exams.reduce((a, e) => Math.max(a, e.scorePct), 0);
  const passes = exams.filter((e) => e.passed).length;

  return (
    <Page>
      <PageHeader
        eyebrow="Test"
        title="Practice Test Center"
        icon={BookOpenCheck}
        description="Sharpen one subject at a time, build your own quiz, review what you missed, and track your scores. Every question includes a full explanation and reference."
        actions={
          <Link
            to="/written-exams"
            className="inline-flex h-9 items-center gap-2 rounded-md border border-input bg-background px-4 text-sm font-medium hover:bg-accent"
          >
            <FileCheck2 className="size-4" /> Full written exams
          </Link>
        }
      />

      <Notice
        tone="caution"
        title="Unofficial study material — not actual FAA knowledge test questions."
        className="mb-6"
      >
        TeachX questions are original, written from 14 CFR, the AIM and FAA handbooks to teach the
        same knowledge areas. Regulations change — verify against current publications.
      </Notice>

      <div className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Attempts"
          value={hydrated ? exams.length : "—"}
          sub={hydrated ? `${passes} at or above 70%` : "Loading…"}
          icon={ClipboardList}
        />
        <Stat
          label="Average score"
          value={hydrated && exams.length ? `${Math.round(avg)}%` : "—"}
          tone={exams.length ? (avg >= 70 ? "ok" : "caution") : "default"}
          icon={Target}
        />
        <Stat
          label="Best score"
          value={hydrated && exams.length ? `${Math.round(best)}%` : "—"}
          tone={best >= 70 ? "ok" : "default"}
          icon={GraduationCap}
        />
        <Stat
          label="Question bank"
          value={QUESTION_BANK.length}
          sub={`${EXAM_SUBJECTS.length} subjects · 7 certificate levels`}
          icon={ListChecks}
        />
      </div>

      <Section
        title="Topic practice tests"
        description="15–25 questions on one area. Take them timed for exam conditions or in study mode to learn as you go."
      >
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {TOPIC_EXAMS.map((e) => {
            const mine = exams.filter((a) => a.examId === e.id);
            const last = mine[0];
            const bestPct = mine.reduce((a, x) => Math.max(a, x.scorePct), 0);
            return (
              <div key={e.id} className="panel flex flex-col p-4">
                <div className="flex items-center justify-between gap-2">
                  <Pill tone="primary">{e.code}</Pill>
                  <span className="font-mono text-[11px] text-muted-foreground tabular">
                    {e.questionCount} q · {e.timeLimitMin} min
                  </span>
                </div>
                <h3 className="mt-2 font-semibold leading-snug">{e.title}</h3>
                <p className="mt-1 flex-1 text-xs leading-relaxed text-muted-foreground">
                  {e.description}
                </p>
                <div className="mt-3 min-h-9">
                  {hydrated && last ? (
                    <Meter
                      value={bestPct}
                      label={`Best ${Math.round(bestPct)}% · last ${Math.round(last.scorePct)}%`}
                    />
                  ) : (
                    <p className="text-[11px] text-muted-foreground">Not attempted yet</p>
                  )}
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <Link
                    to="/exam/$examId"
                    params={{ examId: e.id }}
                    search={{ mode: "timed" }}
                    className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
                  >
                    <Timer className="size-3.5" /> Timed
                  </Link>
                  <Link
                    to="/exam/$examId"
                    params={{ examId: e.id }}
                    search={{ mode: "study" }}
                    className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-input px-3 text-xs font-semibold hover:bg-accent"
                  >
                    <BookOpenCheck className="size-3.5" /> Study
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      </Section>

      <div className="mb-8 grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <CustomQuizBuilder />
        <div className="grid content-start gap-4">
          <Panel title="Study mode vs timed mode">
            <div className="grid gap-3 text-sm">
              <div className="flex gap-2.5">
                <BookOpenCheck className="mt-0.5 size-4 shrink-0 text-cyan" />
                <p>
                  <span className="font-semibold">Study mode</span> is untimed. As soon as you
                  answer, you see whether you were right, the correct answer, and why the tempting
                  wrong answer is wrong — with the regulation or handbook reference.
                </p>
              </div>
              <div className="flex gap-2.5">
                <Timer className="mt-0.5 size-4 shrink-0 text-caution" />
                <p>
                  <span className="font-semibold">Timed mode</span> simulates test conditions: a
                  countdown, flagging, a review screen before submitting, and explanations only at
                  the end. Use it to check readiness.
                </p>
              </div>
              <p className="text-xs text-muted-foreground">
                Both modes shuffle questions and answer choices on every attempt, and both are saved
                to your history.
              </p>
            </div>
          </Panel>
          <Panel title="Review missed questions">
            {!hydrated ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : missed.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Questions you miss in any practice test or written exam are collected here for
                focused review.
              </p>
            ) : (
              <>
                <p className="text-sm">
                  <span className="font-mono text-2xl font-semibold text-caution tabular">
                    {missed.length}
                  </span>{" "}
                  <span className="text-muted-foreground">
                    question{missed.length > 1 ? "s" : ""} missed in your last{" "}
                    {Math.min(10, exams.length)} attempts.
                  </span>
                </p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <Link
                    to="/exam/$examId"
                    params={{ examId: "custom" }}
                    search={{ mode: "study", review: "missed" }}
                    className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
                  >
                    <BookOpenCheck className="size-3.5" /> Study them
                  </Link>
                  <Link
                    to="/exam/$examId"
                    params={{ examId: "custom" }}
                    search={{ mode: "timed", review: "missed" }}
                    className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-input px-3 text-xs font-semibold hover:bg-accent"
                  >
                    <Timer className="size-3.5" /> Timed retest
                  </Link>
                </div>
              </>
            )}
          </Panel>
          <Panel title="Weakest subjects">
            {!hydrated ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : weak.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Complete a few tests (at least 3 questions per subject) to see where to focus.
              </p>
            ) : (
              <ul className="grid gap-3">
                {weak.map((s) => {
                  const l = lessonFor(s.subject);
                  return (
                    <li key={s.subject}>
                      <Meter value={s.pct} label={`${s.subject} · ${s.correct}/${s.total}`} />
                      {l ? (
                        <Link
                          to={l.to}
                          className="mt-1 inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
                        >
                          {l.label} <ArrowRight className="size-3" />
                        </Link>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>
        </div>
      </div>

      <Section
        title="Attempt history"
        description="All practice tests and written exams, newest first."
        actions={
          exams.length > 10 ? (
            <Button variant="ghost" size="sm" onClick={() => setShowAll((s) => !s)}>
              {showAll ? "Show recent" : `Show all ${exams.length}`}
            </Button>
          ) : undefined
        }
      >
        {!hydrated ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : exams.length === 0 ? (
          <EmptyState
            icon={History}
            title="No attempts yet"
            description="Start with a topic test in study mode, then take it timed when you feel ready."
          />
        ) : (
          <HistoryTable rows={showAll ? exams : exams.slice(0, 10)} />
        )}
      </Section>
    </Page>
  );
}

function CustomQuizBuilder() {
  const navigate = useNavigate();
  const [selected, setSelected] = useState<Set<ExamSubject>>(
    () => new Set<ExamSubject>(["Regulations", "Airspace", "Weather"]),
  );
  const [count, setCount] = useState(20);
  const [mode, setMode] = useState<"timed" | "study">("study");

  const available = [...selected].reduce((a, s) => a + (SUBJECT_COUNTS[s] ?? 0), 0);
  const effective = Math.min(count, available);

  const toggle = (s: ExamSubject) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });

  const start = () => {
    if (effective < 1) return;
    void navigate({
      to: "/exam/$examId",
      params: { examId: "custom" },
      search: { mode, count: effective, subjects: [...selected].join(",") },
    });
  };

  return (
    <Panel
      title={
        <span className="flex items-center gap-1.5">
          <Shuffle className="size-3.5" /> Custom quiz builder
        </span>
      }
      actions={
        <div className="flex gap-1">
          <button
            type="button"
            className="rounded px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
            onClick={() => setSelected(new Set(EXAM_SUBJECTS))}
          >
            All
          </button>
          <button
            type="button"
            className="rounded px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
            onClick={() => setSelected(new Set())}
          >
            None
          </button>
        </div>
      }
    >
      <p className="label-caps mb-2">1 · Subjects</p>
      <div className="grid gap-4 sm:grid-cols-2">
        {SUBJECT_GROUPS.map((g) => (
          <fieldset key={g.label}>
            <legend className="mb-1.5 text-xs font-semibold text-muted-foreground">
              {g.label}
            </legend>
            <div className="grid gap-1">
              {g.subjects.map((s) => {
                const id = `subj-${s.replace(/[^a-z]/gi, "")}`;
                return (
                  <label
                    key={s}
                    htmlFor={id}
                    className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-accent/40"
                  >
                    <Checkbox id={id} checked={selected.has(s)} onCheckedChange={() => toggle(s)} />
                    <span className="flex-1">{s}</span>
                    <span className="font-mono text-[11px] text-muted-foreground tabular">
                      {SUBJECT_COUNTS[s] ?? 0}
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        ))}
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div>
          <p className="label-caps mb-2">2 · Number of questions</p>
          <div className="flex flex-wrap gap-1.5">
            {COUNT_OPTIONS.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setCount(n)}
                className={cn(
                  "h-8 min-w-12 rounded-md border px-3 font-mono text-sm tabular",
                  count === n
                    ? "border-primary bg-primary/15 text-foreground"
                    : "text-muted-foreground hover:bg-accent",
                )}
              >
                {n}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            {available} questions available
            {available < count && available > 0 ? ` — quiz will use all ${available}` : ""}.
          </p>
        </div>
        <div>
          <p className="label-caps mb-2">3 · Mode</p>
          <div className="flex rounded-md border p-0.5">
            {(["study", "timed"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={cn(
                  "flex flex-1 items-center justify-center gap-1.5 rounded py-1.5 text-sm font-medium",
                  mode === m
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {m === "study" ? (
                  <BookOpenCheck className="size-3.5" />
                ) : (
                  <Timer className="size-3.5" />
                )}
                {m === "study" ? "Study" : "Timed"}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            {mode === "timed"
              ? `About ${Math.max(5, Math.round((effective * 90) / 60))} minutes (90 s per question).`
              : "Untimed, with explanations after each answer."}
          </p>
        </div>
      </div>

      <div className="mt-5 flex items-center justify-between gap-3 border-t pt-4">
        <p className="text-xs text-muted-foreground">
          {selected.size} subject{selected.size === 1 ? "" : "s"} · {effective} question
          {effective === 1 ? "" : "s"}
        </p>
        <Button onClick={start} disabled={effective < 1}>
          <Play /> Start quiz
        </Button>
      </div>
    </Panel>
  );
}
