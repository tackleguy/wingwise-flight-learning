import { useState, type ReactNode } from "react";
import { ArrowRight, CheckCircle2, ClipboardCheck, XCircle } from "lucide-react";
import type { QuizQuestion } from "@/lib/content/types";
import type { CheckrideAttempt, CheckrideStageResult } from "@/lib/store";
import type { CheckrideTrackDef, SelectItem, StageDef } from "@/lib/checkride/types";
import { PASS_SCORE } from "@/lib/checkride/content";
import { Pill } from "@/components/app/page";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { QuestionCard } from "@/components/exams/QuestionCard";
import { cn } from "@/lib/utils";

export interface StageProps {
  attempt: CheckrideAttempt;
  track: CheckrideTrackDef;
  stage: StageDef;
  saved: CheckrideStageResult;
  /** Grade the stage and move on. */
  onComplete: (score: number, notes: string[]) => void;
  /** Persist in-progress notes (e.g. when leaving for the simulator) without grading. */
  onSaveProgress: (notes: string[]) => void;
}

export function StageFrame({
  stage,
  children,
  aside,
}: {
  stage: StageDef;
  children: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <section className="panel overflow-hidden animate-fade-up">
      <header className="flex flex-wrap items-start gap-3 border-b bg-muted/20 px-4 py-3 sm:px-5">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-md border border-primary/40 bg-primary/10 font-mono text-sm font-bold text-primary">
          {stage.number}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold leading-tight">{stage.name}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{stage.summary}</p>
          <p className="mt-1 font-mono text-[10.5px] text-cyan">{stage.acsRef}</p>
        </div>
        {aside}
      </header>
      <div className="p-4 sm:p-5">{children}</div>
    </section>
  );
}

export function SelectAllList({
  items,
  selected,
  onToggle,
  revealed,
}: {
  items: SelectItem[];
  selected: ReadonlySet<string>;
  onToggle: (id: string) => void;
  revealed: boolean;
}) {
  return (
    <ul className="grid gap-1.5">
      {items.map((it) => {
        const on = selected.has(it.id);
        const right = revealed && on === it.correct;
        return (
          <li key={it.id}>
            <label
              className={cn(
                "flex cursor-pointer items-start gap-2.5 rounded-md border px-3 py-2.5 text-sm transition-colors",
                !revealed && "hover:bg-accent/40",
                !revealed && on && "border-primary/60 bg-primary/10",
                revealed && it.correct && "border-ok/40 bg-ok/5",
                revealed && !it.correct && on && "border-warning/50 bg-warning/10",
                revealed && "cursor-default",
              )}
            >
              <Checkbox
                className="mt-0.5"
                checked={on}
                disabled={revealed}
                onCheckedChange={() => onToggle(it.id)}
              />
              <span className="flex-1">
                <span className="leading-snug">{it.label}</span>
                {revealed ? (
                  <span className="mt-1 flex items-start gap-1 text-xs text-muted-foreground">
                    {right ? (
                      <CheckCircle2 className="mt-px size-3.5 shrink-0 text-ok" />
                    ) : (
                      <XCircle className="mt-px size-3.5 shrink-0 text-warning" />
                    )}
                    <span>
                      <span className="font-medium text-foreground/80">
                        {it.correct ? "Required/correct. " : "Not required. "}
                      </span>
                      {it.why}
                    </span>
                  </span>
                ) : null}
              </span>
            </label>
          </li>
        );
      })}
    </ul>
  );
}

export function useToggleSet(initial?: Iterable<string>) {
  const [set, setSet] = useState<Set<string>>(() => new Set(initial ?? []));
  const toggle = (id: string) =>
    setSet((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  return [set, toggle, setSet] as const;
}

/** A set of multiple-choice questions graded together. */
export function QuestionSet({
  questions,
  answers,
  onAnswer,
  revealed,
}: {
  questions: QuizQuestion[];
  answers: (number | null)[];
  onAnswer: (i: number, choice: number) => void;
  revealed: boolean;
}) {
  return (
    <div className="grid gap-3">
      {questions.map((qq, i) => (
        <QuestionCard
          key={qq.id}
          q={qq}
          number={i + 1}
          total={questions.length}
          selected={answers[i] ?? null}
          onSelect={revealed ? undefined : (c) => onAnswer(i, c)}
          reveal={revealed}
          compact
        />
      ))}
    </div>
  );
}

export function questionScore(
  questions: QuizQuestion[],
  answers: (number | null)[],
): { score: number; missed: QuizQuestion[] } {
  const missed = questions.filter((qq, i) => answers[i] !== qq.answer);
  return {
    score: questions.length
      ? Math.round(((questions.length - missed.length) / questions.length) * 100)
      : 0,
    missed,
  };
}

export function StageResult({
  score,
  notes,
  onContinue,
  continueLabel = "Record result & continue",
}: {
  score: number;
  notes: string[];
  onContinue: () => void;
  continueLabel?: string;
}) {
  const sat = score >= PASS_SCORE;
  return (
    <div
      className={cn(
        "mt-5 rounded-md border-l-4 bg-muted/30 px-4 py-3 animate-fade-up",
        sat ? "border-l-ok" : "border-l-warning",
      )}
    >
      <div className="flex flex-wrap items-center gap-3">
        <span
          className={cn("font-mono text-2xl font-bold tabular", sat ? "text-ok" : "text-warning")}
        >
          {score}
        </span>
        <Pill tone={sat ? "ok" : "warning"}>{sat ? "Satisfactory" : "Unsatisfactory"}</Pill>
        <span className="text-xs text-muted-foreground">Satisfactory at {PASS_SCORE} or above</span>
        <Button className="ml-auto" onClick={onContinue}>
          <ClipboardCheck /> {continueLabel} <ArrowRight />
        </Button>
      </div>
      {notes.length ? (
        <ul className="mt-2 grid gap-1 text-xs text-foreground/85">
          {notes.map((n, i) => (
            <li key={i}>• {n}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
