import { CheckCircle2, XCircle, BookMarked, Flag } from "lucide-react";
import type { QuizQuestion } from "@/lib/content/types";
import { Pill } from "@/components/app/page";
import { cn } from "@/lib/utils";

const KIND_LABEL: Record<NonNullable<QuizQuestion["kind"]>, string> = {
  mc: "Multiple choice",
  tf: "True / False",
  scenario: "Scenario",
  calc: "Calculation",
  chart: "Chart",
  weather: "Weather report",
};

export const LETTERS = ["A", "B", "C", "D", "E"];

/** Monospace "figure" panel for METAR/TAF/chart/table context; prose panel for scenarios. */
export function QuestionContext({ q }: { q: QuizQuestion }) {
  if (!q.context) return null;
  const mono = q.kind === "weather" || q.kind === "chart" || q.kind === "calc" || /\n/.test(q.context);
  return (
    <div className={cn("mb-4", mono ? "avionics-screen px-3 py-2.5" : "rounded-md border-l-2 border-primary/60 bg-muted/40 px-3 py-2.5")}>
      <div className="label-caps mb-1 text-[10px]">{q.kind === "weather" ? "Report" : q.kind === "chart" ? "Figure" : q.kind === "calc" ? "Given" : "Scenario"}</div>
      <p className={cn("whitespace-pre-wrap break-words", mono ? "font-mono text-[12.5px] leading-relaxed text-cyan" : "text-sm leading-relaxed text-foreground/90")}>{q.context}</p>
    </div>
  );
}

export function QuestionCard({
  q,
  number,
  total,
  selected,
  onSelect,
  reveal,
  flagged,
  compact,
}: {
  q: QuizQuestion;
  number: number;
  total: number;
  selected: number | null;
  onSelect?: ((i: number) => void) | undefined;
  /** Show correct/incorrect marking and the explanation. */
  reveal: boolean;
  flagged?: boolean;
  compact?: boolean;
}) {
  const disabled = !onSelect;
  return (
    <article className={cn("panel", compact ? "p-4" : "p-4 sm:p-6")}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="font-mono text-xs text-muted-foreground tabular">
          Q{number}
          <span className="text-muted-foreground/60">/{total}</span>
        </span>
        <Pill>{q.subject}</Pill>
        {q.kind ? <Pill tone="cyan">{KIND_LABEL[q.kind]}</Pill> : null}
        {flagged ? (
          <Pill tone="caution">
            <Flag className="size-3" /> Flagged
          </Pill>
        ) : null}
        <span className="ml-auto font-mono text-[10px] text-muted-foreground/70">{q.id}</span>
      </div>
      <QuestionContext q={q} />
      <h2 className={cn("font-semibold leading-snug", compact ? "text-[15px]" : "text-base sm:text-lg")}>{q.prompt}</h2>
      <div className="mt-4 grid gap-2" role="radiogroup" aria-label="Answer choices">
        {q.choices.map((c, i) => {
          const isSel = selected === i;
          const isCorrect = i === q.answer;
          const state = reveal ? (isCorrect ? "correct" : isSel ? "wrong" : "idle") : isSel ? "selected" : "idle";
          return (
            <button
              key={i}
              type="button"
              role="radio"
              aria-checked={isSel}
              disabled={disabled}
              onClick={() => onSelect?.(i)}
              className={cn(
                "group flex w-full items-start gap-3 rounded-md border px-3 py-3 text-left text-sm transition-colors sm:py-2.5",
                !disabled && "cursor-pointer hover:border-primary/60 hover:bg-accent/40",
                disabled && "cursor-default",
                state === "selected" && "border-primary bg-primary/10",
                state === "correct" && "border-ok/60 bg-ok/10",
                state === "wrong" && "border-warning/60 bg-warning/10",
                state === "idle" && "border-border bg-background/40",
              )}
            >
              <span
                className={cn(
                  "mt-px flex size-6 shrink-0 items-center justify-center rounded border font-mono text-xs font-semibold",
                  state === "selected" && "border-primary bg-primary text-primary-foreground",
                  state === "correct" && "border-ok bg-ok text-background",
                  state === "wrong" && "border-warning bg-warning text-background",
                  state === "idle" && "border-border text-muted-foreground",
                )}
              >
                {LETTERS[i]}
              </span>
              <span className="flex-1 leading-relaxed">{c}</span>
              {reveal && isCorrect ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-ok" aria-label="Correct answer" /> : null}
              {reveal && isSel && !isCorrect ? <XCircle className="mt-0.5 size-4 shrink-0 text-warning" aria-label="Your answer" /> : null}
            </button>
          );
        })}
      </div>
      {reveal ? (
        <div className="mt-4 rounded-md border border-border bg-muted/30 p-3 animate-fade-up">
          <div className="mb-1.5 flex flex-wrap items-center gap-2">
            {selected === null ? (
              <Pill tone="caution">Not answered</Pill>
            ) : selected === q.answer ? (
              <Pill tone="ok">Correct</Pill>
            ) : (
              <Pill tone="warning">Incorrect — you chose {LETTERS[selected]}</Pill>
            )}
            <span className="text-xs text-muted-foreground">
              Correct answer: <span className="font-mono font-semibold text-foreground">{LETTERS[q.answer]}</span>
            </span>
          </div>
          <p className="text-sm leading-relaxed text-foreground/90">{q.explanation}</p>
          {q.reference ? (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
              <BookMarked className="size-3.5" /> Reference: <span className="font-mono">{q.reference}</span>
            </p>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
