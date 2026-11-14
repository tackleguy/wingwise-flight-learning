import { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, CheckCircle2, RotateCcw, Send, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState, formatDateTime, Meter, Pill } from "@/components/app/page";
import type { Module, QuizQuestion } from "@/lib/content/types";
import { actions, useStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { Segmented } from "./diagrams/controls";
import { Choices } from "./exercises/shared";

const PASS_PCT = 70;

function QuestionCard({
  q,
  n,
  total,
  selected,
  onSelect,
}: {
  q: QuizQuestion;
  n: number;
  total: number;
  selected: number | null;
  onSelect: (i: number) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <span className="font-mono">
          Question {n} of {total}
        </span>
        <span>{q.subject}</span>
      </div>
      {q.context ? (
        <pre className="avionics-screen overflow-x-auto p-2.5 font-mono text-xs whitespace-pre-wrap text-ok">
          {q.context}
        </pre>
      ) : null}
      <p className="text-[15px] font-medium leading-relaxed">{q.prompt}</p>
      <Choices
        choices={q.choices}
        selected={selected}
        answer={q.answer}
        revealed={false}
        onSelect={onSelect}
      />
    </div>
  );
}

export function ModuleQuiz({
  courseId,
  mod,
  link,
}: {
  courseId: string;
  mod: Module;
  link: string;
}) {
  const questions = mod.quiz;
  const [mode, setMode] = useState<"single" | "all">("single");
  const [answers, setAnswers] = useState<(number | null)[]>(() => questions.map(() => null));
  const [idx, setIdx] = useState(0);
  const [result, setResult] = useState<{ score: number; total: number } | null>(null);
  const [showAll, setShowAll] = useState(false);
  const allQuizzes = useStore((s) => s.quizzes);
  const history = useMemo(
    () =>
      allQuizzes
        .filter((a) => a.final && a.course === courseId && a.moduleId === mod.id)
        .slice(0, 5),
    [allQuizzes, courseId, mod.id],
  );
  const best = history.length
    ? Math.max(
        ...allQuizzes
          .filter((a) => a.final && a.course === courseId && a.moduleId === mod.id)
          .map((a) => Math.round((a.score / a.total) * 100)),
      )
    : null;

  if (!questions.length) return <EmptyState title="No exam for this module yet" />;

  const answered = answers.filter((a) => a !== null).length;
  const setAnswer = (i: number, c: number) => setAnswers((a) => a.map((v, j) => (j === i ? c : v)));

  const submit = () => {
    const score = questions.reduce((s, q, i) => s + (answers[i] === q.answer ? 1 : 0), 0);
    const total = questions.length;
    setResult({ score, total });
    actions.recordQuiz(
      { course: courseId, moduleId: mod.id, title: mod.title, score, total, final: true },
      link,
    );
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const retake = () => {
    setAnswers(questions.map(() => null));
    setIdx(0);
    setResult(null);
    setShowAll(false);
  };

  if (result) {
    const pct = Math.round((result.score / result.total) * 100);
    const pass = pct >= PASS_PCT;
    return (
      <div className="space-y-5">
        <div className="flex flex-col gap-4 border-b pb-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs text-muted-foreground">Module exam result</p>
            <p
              className={cn(
                "mt-1 font-mono text-4xl font-bold tabular",
                pass ? "text-ok" : "text-caution",
              )}
            >
              {pct}%
            </p>
            <p className="text-sm text-muted-foreground">
              {result.score} of {result.total} correct ·{" "}
              {pass ? "Passed" : `Below the ${PASS_PCT}% passing standard`}
              {best !== null ? ` · best ${Math.max(best, pct)}%` : ""}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={retake}>
              <RotateCcw className="size-4" />
              Retake exam
            </Button>
          </div>
        </div>
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">Review</h3>
          <Button size="sm" variant="ghost" onClick={() => setShowAll((v) => !v)}>
            {showAll ? "Hide explanations for correct answers" : "Show all explanations"}
          </Button>
        </div>
        <ol className="divide-y border-y">
          {questions.map((q, i) => {
            const a = answers[i] ?? null;
            const ok = a === q.answer;
            return (
              <li key={q.id} className="py-3.5">
                <div className="flex gap-2">
                  {ok ? (
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-ok" />
                  ) : (
                    <XCircle className="mt-0.5 size-4 shrink-0 text-warning" />
                  )}
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <p className="text-sm font-medium">
                      <span className="mr-1 font-mono text-xs text-muted-foreground">{i + 1}.</span>
                      {q.prompt}
                    </p>
                    {!ok ? (
                      <p className="text-xs">
                        <span className="text-muted-foreground">Your answer: </span>
                        <span className="text-warning">
                          {a === null ? "Not answered" : q.choices[a]}
                        </span>
                      </p>
                    ) : null}
                    <p className="text-xs">
                      <span className="text-muted-foreground">Correct answer: </span>
                      <span className="text-ok">{q.choices[q.answer]}</span>
                    </p>
                    {!ok || showAll ? (
                      <p className="rounded bg-muted/40 px-2.5 py-2 text-xs leading-relaxed text-foreground/85">
                        {q.explanation}
                        {q.reference ? (
                          <span className="mt-1 block text-[10px] text-muted-foreground">
                            Ref: {q.reference}
                          </span>
                        ) : null}
                      </p>
                    ) : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    );
  }

  const q = questions[idx];

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-xs text-muted-foreground">
          {questions.length} questions · pass mark {PASS_PCT}%
          {best !== null ? ` · your best ${best}%` : ""}
        </div>
        <Segmented
          value={mode}
          onChange={setMode}
          options={[
            { value: "single", label: "One at a time" },
            { value: "all", label: "All questions" },
          ]}
        />
      </div>
      <Meter
        value={(answered / questions.length) * 100}
        label={`${answered} of ${questions.length} answered`}
      />

      {mode === "single" && q ? (
        <div className="pt-2">
          <QuestionCard
            q={q}
            n={idx + 1}
            total={questions.length}
            selected={answers[idx] ?? null}
            onSelect={(c) => setAnswer(idx, c)}
          />
          <div className="mt-5 flex items-center justify-between gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={idx === 0}
              onClick={() => setIdx((i) => i - 1)}
            >
              <ArrowLeft className="size-4" />
              Previous
            </Button>
            <div className="hidden gap-1 sm:flex">
              {questions.map((qq, i) => (
                <button
                  key={qq.id}
                  type="button"
                  onClick={() => setIdx(i)}
                  aria-label={`Question ${i + 1}`}
                  className={cn(
                    "size-2.5 rounded-full",
                    i === idx
                      ? "bg-primary"
                      : answers[i] !== null
                        ? "bg-primary/40"
                        : "bg-muted-foreground/25",
                  )}
                />
              ))}
            </div>
            {idx < questions.length - 1 ? (
              <Button size="sm" onClick={() => setIdx((i) => i + 1)}>
                Next
                <ArrowRight className="size-4" />
              </Button>
            ) : (
              <Button size="sm" onClick={submit}>
                <Send className="size-4" />
                Submit exam
              </Button>
            )}
          </div>
        </div>
      ) : (
        <div className="divide-y">
          {questions.map((qq, i) => (
            <div key={qq.id} className="py-5 first:pt-2">
              <QuestionCard
                q={qq}
                n={i + 1}
                total={questions.length}
                selected={answers[i] ?? null}
                onSelect={(c) => setAnswer(i, c)}
              />
            </div>
          ))}
          <div className="flex items-center justify-end gap-3 pt-4">
            {answered < questions.length ? (
              <span className="text-xs text-caution">
                {questions.length - answered} unanswered — they will be marked wrong
              </span>
            ) : null}
            <Button onClick={submit}>
              <Send className="size-4" />
              Submit exam
            </Button>
          </div>
        </div>
      )}
      {mode === "single" && idx === questions.length - 1 && answered < questions.length ? (
        <p className="text-right text-xs text-caution">
          {questions.length - answered} unanswered — they will be marked wrong
        </p>
      ) : null}

      {history.length ? (
        <details className="pt-2 text-xs">
          <summary className="cursor-pointer text-muted-foreground select-none hover:text-foreground">
            Previous attempts ({history.length})
          </summary>
          <ul className="mt-2 divide-y border-y">
            {history.map((h) => {
              const pct = Math.round((h.score / h.total) * 100);
              return (
                <li key={h.id} className="flex items-center justify-between py-1.5">
                  <span className="text-muted-foreground">{formatDateTime(h.date)}</span>
                  <span className="flex items-center gap-2 font-mono">
                    {h.score}/{h.total}
                    <Pill tone={pct >= PASS_PCT ? "ok" : "caution"}>{pct}%</Pill>
                  </span>
                </li>
              );
            })}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
