import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Award, BookOpen, Clock, ListChecks, RotateCcw, XCircle } from "lucide-react";
import type { QuizQuestion } from "@/lib/content/types";
import type { GradeResult } from "@/lib/exams/analytics";
import { lessonFor } from "@/lib/exams/catalog";
import { formatDuration } from "@/components/app/page";
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
  const [view, setView] = useState<"review" | "subjects">("review");
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
  const recommend = subjects.filter((s) => s.pct < 80);

  const list = questions
    .map((q, i) => ({ q, i }))
    .filter(({ q, i }) =>
      filter === "all" ? true : filter === "flagged" ? flags[i] : answers[i] !== q.answer,
    );

  const tabBtn = (active: boolean) =>
    cn(
      "rounded px-2.5 py-1 font-medium",
      active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
    );

  return (
    <div className="mx-auto max-w-4xl animate-fade-up">
      {/* Score: one block, no nested stat cards. */}
      <div className="mb-8 border-b pb-6">
        <p className="text-xs text-muted-foreground">{title}</p>
        <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <span
            className={cn(
              "font-mono text-5xl font-bold tabular",
              passed ? "text-ok" : "text-warning",
            )}
          >
            {pct}%
          </span>
          <span
            className={cn(
              "flex items-center gap-1.5 text-lg font-semibold",
              passed ? "text-ok" : "text-warning",
            )}
          >
            {passed ? <Award className="size-5" /> : <XCircle className="size-5" />}
            {passed ? "Pass" : "Below passing"}
          </span>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          <span className="text-ok">{result.correct} correct</span> ·{" "}
          <span className={result.incorrect ? "text-warning" : ""}>
            {result.incorrect} incorrect
          </span>
          {result.unanswered ? (
            <>
              {" "}
              · <span className="text-caution">{result.unanswered} unanswered</span>
            </>
          ) : null}{" "}
          · <Clock className="inline size-3.5 align-[-2px]" /> {formatDuration(timeUsedSec)}
          {timeLimitSec ? ` of ${formatDuration(timeLimitSec)}` : ""}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Pass mark {passPct}% · {mode === "study" ? "Study mode (answers revealed)" : "Timed mode"}
          {autoSubmitted ? " · Auto-submitted when time expired" : ""}
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
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

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex rounded-md border p-0.5 text-xs">
          <button
            type="button"
            onClick={() => setView("review")}
            className={tabBtn(view === "review")}
          >
            Question review
          </button>
          <button
            type="button"
            onClick={() => setView("subjects")}
            className={tabBtn(view === "subjects")}
          >
            By subject
          </button>
        </div>
        {view === "review" ? (
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
                  "rounded px-2.5 py-1",
                  filter === k ? "bg-accent text-foreground" : "text-muted-foreground",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {view === "review" ? (
        list.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
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
        )
      ) : (
        <div className="grid gap-8 md:grid-cols-[1.4fr_1fr]">
          <div>
            <SubjectChart data={subjects} passPct={passPct} />
            <table className="mt-3 w-full text-xs">
              <caption className="sr-only">Score by subject, weakest first</caption>
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
          </div>
          <div>
            <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
              <BookOpen className="size-4 text-primary" /> Recommended study
            </h3>
            {recommend.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Every subject scored 80% or better. Try a harder exam or the full written test.
              </p>
            ) : (
              <ul className="divide-y border-y">
                {recommend.map((s) => {
                  const l = lessonFor(s.subject);
                  return l ? (
                    <li key={s.subject}>
                      <Link
                        to={l.to}
                        className="group flex items-center justify-between gap-2 py-2 text-sm"
                      >
                        <span>
                          <span className="block text-xs text-muted-foreground">
                            {s.subject} · {Math.round(s.pct)}%
                          </span>
                          <span className="group-hover:text-primary">{l.label}</span>
                        </span>
                        <ArrowRight className="size-4 shrink-0 text-muted-foreground group-hover:text-primary" />
                      </Link>
                    </li>
                  ) : null;
                })}
              </ul>
            )}
          </div>
        </div>
      )}

      <p className="mt-8 text-xs text-muted-foreground">
        Unofficial study material — original SkyReady questions, not actual FAA knowledge test
        questions.
      </p>
    </div>
  );
}
