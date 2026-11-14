import { useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight, BookOpenCheck, FileCheck2, History, Play, Timer } from "lucide-react";
import { EmptyState, Meter, Notice, Page, PageHeader } from "@/components/app/page";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

type PracticeTab = "topics" | "custom" | "history";

function PracticeTests() {
  const hydrated = useHydrated();
  const exams = useStore((s) => s.exams);
  const missed = useMemo(() => recentMissedIds(exams), [exams]);
  const weak = useMemo(() => weakestSubjects(exams, 5), [exams]);
  const [showAll, setShowAll] = useState(false);
  const [tab, setTab] = useState<PracticeTab>("topics");

  const avg = exams.length ? exams.reduce((a, e) => a + e.scorePct, 0) / exams.length : 0;
  const best = exams.reduce((a, e) => Math.max(a, e.scorePct), 0);
  const passes = exams.filter((e) => e.passed).length;

  return (
    <Page className="max-w-6xl">
      <PageHeader
        eyebrow="Test"
        title="Practice Test Center"
        icon={BookOpenCheck}
        description="Practise one subject at a time or build your own quiz. Every question has an explanation and reference."
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
        className="-mt-2 mb-4"
      >
        TeachX questions are original, written from 14 CFR, the AIM and FAA handbooks to teach the
        same knowledge areas. Regulations change — verify against current publications.
      </Notice>

      {/* One quiet summary line instead of four stat cards. */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 text-sm text-muted-foreground">
        <p>
          {hydrated && exams.length ? (
            <>
              <span className="font-mono text-foreground tabular">{exams.length}</span> attempts ·{" "}
              {passes} passed · avg{" "}
              <span className={cn("font-mono tabular", avg >= 70 ? "text-ok" : "text-caution")}>
                {Math.round(avg)}%
              </span>{" "}
              · best <span className="font-mono text-foreground tabular">{Math.round(best)}%</span>
            </>
          ) : (
            <>
              {QUESTION_BANK.length} questions across {EXAM_SUBJECTS.length} subjects
            </>
          )}
        </p>
        {hydrated && missed.length > 0 ? (
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>
              <span className="font-mono text-caution tabular">{missed.length}</span> recently
              missed:
            </span>
            <Link
              to="/exam/$examId"
              params={{ examId: "custom" }}
              search={{ mode: "study", review: "missed" }}
              className="font-medium text-primary hover:underline"
            >
              Study them
            </Link>
            <Link
              to="/exam/$examId"
              params={{ examId: "custom" }}
              search={{ mode: "timed", review: "missed" }}
              className="font-medium text-primary hover:underline"
            >
              Timed retest
            </Link>
          </p>
        ) : null}
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as PracticeTab)}>
        <div className="-mx-4 mb-5 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <TabsList>
            <TabsTrigger value="topics">Topic tests</TabsTrigger>
            <TabsTrigger value="custom">Custom quiz</TabsTrigger>
            <TabsTrigger value="history">
              History
              {hydrated && exams.length ? (
                <span className="ml-1 font-mono text-[10px] text-muted-foreground">
                  {exams.length}
                </span>
              ) : null}
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="topics">
          <p className="mb-3 text-xs text-muted-foreground">
            <span className="text-foreground/85">Study</span> is untimed with explanations after
            each answer. <span className="text-foreground/85">Timed</span> simulates test
            conditions; explanations come at the end.
          </p>
          <ul className="divide-y border-y">
            {TOPIC_EXAMS.map((e) => {
              const mine = exams.filter((a) => a.examId === e.id);
              const last = mine[0];
              const bestPct = mine.reduce((a, x) => Math.max(a, x.scorePct), 0);
              return (
                <li
                  key={e.id}
                  className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:gap-4"
                >
                  <div className="min-w-0 flex-1">
                    <p className="flex items-baseline gap-2">
                      <span className="w-11 shrink-0 font-mono text-[11px] text-muted-foreground">
                        {e.code}
                      </span>
                      <span className="font-medium">{e.title}</span>
                    </p>
                    <p
                      className="truncate pl-13 text-xs text-muted-foreground"
                      title={e.description}
                    >
                      {e.questionCount} questions · {e.timeLimitMin} min
                      <span className="hidden md:inline"> · {e.description}</span>
                    </p>
                  </div>
                  <div className="flex items-center gap-3 pl-13 sm:pl-0">
                    <span className="w-24 text-xs sm:text-right">
                      {hydrated && last ? (
                        <span
                          className={cn(
                            "font-mono tabular",
                            bestPct >= 70 ? "text-ok" : "text-caution",
                          )}
                          title={`Last ${Math.round(last.scorePct)}%`}
                        >
                          Best {Math.round(bestPct)}%
                        </span>
                      ) : (
                        <span className="text-muted-foreground">Not taken</span>
                      )}
                    </span>
                    <Link
                      to="/exam/$examId"
                      params={{ examId: e.id }}
                      search={{ mode: "study" }}
                      className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-input px-3 text-xs font-medium hover:bg-accent"
                    >
                      <BookOpenCheck className="size-3.5" /> Study
                    </Link>
                    <Link
                      to="/exam/$examId"
                      params={{ examId: e.id }}
                      search={{ mode: "timed" }}
                      className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md px-3 text-xs font-medium text-primary hover:bg-primary/10"
                    >
                      <Timer className="size-3.5" /> Timed
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        </TabsContent>

        <TabsContent value="custom">
          <CustomQuizBuilder />
        </TabsContent>

        <TabsContent value="history">
          {!hydrated ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : exams.length === 0 ? (
            <EmptyState
              icon={History}
              title="No attempts yet"
              description="Start with a topic test in study mode, then take it timed when you feel ready."
            />
          ) : (
            <div className="space-y-8">
              {weak.length ? (
                <section>
                  <h3 className="mb-3 text-sm font-semibold">Weakest subjects</h3>
                  <ul className="grid gap-x-8 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
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
                </section>
              ) : null}
              <section>
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold">All attempts</h3>
                  {exams.length > 10 ? (
                    <Button variant="ghost" size="sm" onClick={() => setShowAll((v) => !v)}>
                      {showAll ? "Show recent" : `Show all ${exams.length}`}
                    </Button>
                  ) : null}
                </div>
                <HistoryTable rows={showAll ? exams : exams.slice(0, 10)} />
              </section>
            </div>
          )}
        </TabsContent>
      </Tabs>
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
    <div className="max-w-3xl">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">Subjects</p>
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
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div>
          <p className="mb-2 text-sm font-semibold">Questions</p>
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
          <p className="mb-2 text-sm font-semibold">Mode</p>
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

      <div className="mt-6 flex items-center justify-between gap-3 border-t pt-4">
        <p className="text-xs text-muted-foreground">
          {selected.size} subject{selected.size === 1 ? "" : "s"} · {effective} question
          {effective === 1 ? "" : "s"}
        </p>
        <Button onClick={start} disabled={effective < 1}>
          <Play /> Start quiz
        </Button>
      </div>
    </div>
  );
}
