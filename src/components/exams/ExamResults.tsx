import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Award,
  BookOpen,
  CheckCircle2,
  Clock,
  ListChecks,
  RotateCcw,
  TrendingDown,
  TrendingUp,
  XCircle,
} from "lucide-react";
import type { QuizQuestion } from "@/lib/content/types";
import type { GradeResult } from "@/lib/exams/analytics";
import { lessonFor } from "@/lib/exams/catalog";
import { Meter, Panel, Pill, Section, Stat, formatDuration } from "@/components/app/page";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { HrefLink } from "./HrefLink";
import { QuestionCard } from "./QuestionCard";
import { SubjectChart, type SubjectDatum } from "./SubjectChart";

type Filter = "all" | "missed" | "flagged";

export function ExamResults({
  title,
  mode,
  passPct,
  questions,
  answers,
  flags,
  result,
  timeUsedSec,
  timeLimitSec,
  autoSubmitted,
  onRetake,
  backTo,
  backLabel,
}: {
  title: string;
  mode: "timed" | "study";
  passPct: number;
  questions: QuizQuestion[];
  answers: (number | null)[];
  flags: boolean[];
  result: GradeResult;
  timeUsedSec: number;
  timeLimitSec: number | null;
  autoSubmitted: boolean;
  onRetake: () => void;
  backTo: string;
  backLabel: string;
}) {
  const [filter, setFilter] = useState<Filter>(
    result.missedQuestionIds.length > 0 ? "missed" : "all",
  );
  const passed = result.scorePct >= passPct;
  const pct = Math.round(result.scorePct);

  const subjects: SubjectDatum[] = useMemo(
    () =>
      Object.entries(result.bySubject)
        .map(([subject, v]) => ({
          subject,
          correct: v.correct,
          total: v.total,
          pct: v.total ? (v.correct / v.total) * 100 : 0,
        }))
        .sort((a, b) => a.pct - b.pct || b.total - a.total),
    [result],
  );
  const weakest = subjects.filter((s) => s.pct < 100).slice(0, 3);
  const strongest = [...subjects]
    .sort((a, b) => b.pct - a.pct || b.total - a.total)
    .filter((s) => s.pct >= 70)
    .slice(0, 3);
  const recommend = subjects.filter((s) => s.pct < 80);

  const list = questions
    .map((q, i) => ({ q, i }))
    .filter(({ q, i }) =>
      filter === "all" ? true : filter === "flagged" ? flags[i] : answers[i] !== q.answer,
    );

  return (
    <div className="animate-fade-up">
      {/* Score header */}
      <div
        className={cn(
          "panel mb-6 overflow-hidden border-l-4",
          passed ? "border-l-ok" : "border-l-warning",
        )}
      >
        <div className="grid gap-6 p-5 sm:p-6 md:grid-cols-[auto_1fr] md:items-center">
          <div className="flex items-center gap-5">
            <div
              className={cn(
                "flex size-24 shrink-0 flex-col items-center justify-center rounded-full border-4",
                passed ? "border-ok/70" : "border-warning/70",
              )}
            >
              <span
                className={cn(
                  "font-mono text-3xl font-bold tabular",
                  passed ? "text-ok" : "text-warning",
                )}
              >
                {pct}%
              </span>
            </div>
            <div>
              <p className="label-caps">{title}</p>
              <p
                className={cn(
                  "mt-1 flex items-center gap-2 text-xl font-bold",
                  passed ? "text-ok" : "text-warning",
                )}
              >
                {passed ? <Award className="size-5" /> : <XCircle className="size-5" />}
                {passed ? "Pass" : "Below passing"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Passing score {passPct}% ·{" "}
                {mode === "study" ? "Study mode (answers revealed)" : "Timed mode"}
                {autoSubmitted ? " · Auto-submitted when time expired" : ""}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="Correct" value={result.correct} tone="ok" icon={CheckCircle2} />
            <Stat
              label="Incorrect"
              value={result.incorrect}
              tone={result.incorrect ? "warning" : "default"}
              icon={XCircle}
            />
            <Stat
              label="Unanswered"
              value={result.unanswered}
              tone={result.unanswered ? "caution" : "default"}
              icon={ListChecks}
            />
            <Stat
              label="Time used"
              value={formatDuration(timeUsedSec)}
              sub={timeLimitSec ? `of ${formatDuration(timeLimitSec)}` : "untimed"}
              icon={Clock}
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-2 border-t bg-muted/20 px-5 py-3 sm:px-6">
          <Button onClick={onRetake}>
            <RotateCcw /> Retake (new order)
          </Button>
          {result.missedQuestionIds.length > 0 ? (
            <HrefLink
              href="/exam/custom?mode=study&review=missed"
              className="inline-flex h-9 items-center gap-2 rounded-md border border-input bg-background px-4 text-sm font-medium hover:bg-accent"
            >
              <ListChecks className="size-4" /> Practice missed questions
            </HrefLink>
          ) : null}
          <Link
            to={backTo}
            className="inline-flex h-9 items-center gap-2 rounded-md px-4 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            {backLabel} <ArrowRight className="size-4" />
          </Link>
        </div>
      </div>

      <div className="mb-8 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Panel title="Performance by subject">
          <SubjectChart data={subjects} passPct={passPct} />
          <table className="mt-3 w-full text-xs">
            <caption className="sr-only">Score by subject</caption>
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="py-1 font-medium">Subject</th>
                <th className="py-1 text-right font-medium">Correct</th>
                <th className="py-1 text-right font-medium">Score</th>
              </tr>
            </thead>
            <tbody>
              {subjects.map((s) => (
                <tr key={s.subject} className="border-t border-border/60">
                  <td className="py-1.5">{s.subject}</td>
                  <td className="py-1.5 text-right font-mono tabular">
                    {s.correct}/{s.total}
                  </td>
                  <td
                    className={cn(
                      "py-1.5 text-right font-mono tabular",
                      s.pct >= passPct ? "text-foreground" : "text-warning",
                    )}
                  >
                    {Math.round(s.pct)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
        <div className="grid content-start gap-4">
          <Panel
            title={
              <span className="flex items-center gap-1.5">
                <TrendingDown className="size-3.5" /> Weakest subjects
              </span>
            }
          >
            {weakest.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Perfect score — no weak subjects in this attempt.
              </p>
            ) : (
              <div className="grid gap-3">
                {weakest.map((s) => (
                  <Meter
                    key={s.subject}
                    value={s.pct}
                    label={`${s.subject} (${s.correct}/${s.total})`}
                  />
                ))}
              </div>
            )}
          </Panel>
          <Panel
            title={
              <span className="flex items-center gap-1.5">
                <TrendingUp className="size-3.5" /> Strongest subjects
              </span>
            }
          >
            {strongest.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No subject reached 70% in this attempt yet — keep practicing.
              </p>
            ) : (
              <div className="grid gap-3">
                {strongest.map((s) => (
                  <Meter
                    key={s.subject}
                    value={s.pct}
                    label={`${s.subject} (${s.correct}/${s.total})`}
                  />
                ))}
              </div>
            )}
          </Panel>
          <Panel
            title={
              <span className="flex items-center gap-1.5">
                <BookOpen className="size-3.5" /> Recommended study
              </span>
            }
          >
            {recommend.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Every subject scored 80% or better. Try a harder exam or the full written test.
              </p>
            ) : (
              <ul className="grid gap-1.5">
                {recommend.map((s) => {
                  const l = lessonFor(s.subject);
                  return l ? (
                    <li key={s.subject}>
                      <Link
                        to={l.to}
                        className="flex items-center justify-between gap-2 rounded-md border px-2.5 py-2 text-sm hover:border-primary/50 hover:bg-accent/40"
                      >
                        <span>
                          <span className="block text-xs text-muted-foreground">
                            {s.subject} · {Math.round(s.pct)}%
                          </span>
                          {l.label}
                        </span>
                        <ArrowRight className="size-4 shrink-0 text-primary" />
                      </Link>
                    </li>
                  ) : null;
                })}
              </ul>
            )}
          </Panel>
        </div>
      </div>

      <Section
        title="Question review"
        description="Every question with your answer, the correct answer, and the explanation."
        actions={
          <div className="flex rounded-md border p-0.5 text-xs">
            {(
              [
                ["missed", `Missed (${result.missedQuestionIds.length})`],
                ["flagged", `Flagged (${flags.filter(Boolean).length})`],
                ["all", `All (${questions.length})`],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setFilter(k)}
                className={cn(
                  "rounded px-2.5 py-1 font-medium",
                  filter === k
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        }
      >
        {list.length === 0 ? (
          <p className="rounded-md border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
            No questions in this view.
          </p>
        ) : (
          <div className="grid gap-3">
            {list.map(({ q, i }) => (
              <QuestionCard
                key={q.id + i}
                q={q}
                number={i + 1}
                total={questions.length}
                selected={answers[i] ?? null}
                reveal
                flagged={flags[i] ?? false}
                compact
              />
            ))}
          </div>
        )}
        <p className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
          <Pill>Unofficial</Pill> TeachX practice questions are original study material — not actual
          FAA knowledge test questions.
        </p>
      </Section>
    </div>
  );
}
