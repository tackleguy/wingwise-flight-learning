/**
 * Small graded multiple-choice exercise used by the planner, navigation and weather pages.
 * Each question is checked individually and explains the answer.
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { CheckCircle2, RotateCcw, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface McQuestion {
  id: string;
  prompt: ReactNode;
  context?: ReactNode;
  choices: string[];
  answer: number;
  explanation: ReactNode;
}

export function McQuiz({
  questions,
  onComplete,
  resetKey,
  compact,
}: {
  questions: McQuestion[];
  onComplete?: (correct: number, total: number) => void;
  /** Changing this resets the quiz. */
  resetKey?: string;
  compact?: boolean;
}) {
  const [sel, setSel] = useState<Record<string, number>>({});
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [reported, setReported] = useState(false);

  useEffect(() => {
    setSel({});
    setChecked({});
    setReported(false);
  }, [resetKey]);

  const done = questions.length > 0 && questions.every((q) => checked[q.id]);
  const correct = useMemo(() => questions.filter((q) => checked[q.id] && sel[q.id] === q.answer).length, [questions, checked, sel]);

  useEffect(() => {
    if (done && !reported) {
      setReported(true);
      onComplete?.(correct, questions.length);
    }
  }, [done, reported, correct, questions.length, onComplete]);

  return (
    <div className="space-y-4">
      {questions.map((q, qi) => {
        const isChecked = !!checked[q.id];
        const s = sel[q.id];
        const right = isChecked && s === q.answer;
        return (
          <div key={q.id} className={cn("rounded-md border p-3", isChecked && (right ? "border-ok/40" : "border-warning/40"))}>
            <div className="mb-2 flex gap-2 text-sm font-medium">
              <span className="font-mono text-muted-foreground">{qi + 1}.</span>
              <div className="min-w-0 flex-1">{q.prompt}</div>
            </div>
            {q.context ? <div className="mb-2 overflow-x-auto rounded bg-panel px-3 py-2 font-mono text-xs leading-relaxed whitespace-pre-wrap text-cyan">{q.context}</div> : null}
            <div className={cn("grid gap-1.5", compact ? "sm:grid-cols-2" : "")} role="radiogroup">
              {q.choices.map((c, ci) => {
                const picked = s === ci;
                const showRight = isChecked && ci === q.answer;
                const showWrong = isChecked && picked && ci !== q.answer;
                return (
                  <button
                    key={ci}
                    type="button"
                    role="radio"
                    aria-checked={picked}
                    disabled={isChecked}
                    onClick={() => setSel((m) => ({ ...m, [q.id]: ci }))}
                    className={cn(
                      "flex items-start gap-2 rounded border px-2.5 py-1.5 text-left text-sm transition-colors",
                      picked && !isChecked && "border-primary/60 bg-primary/10",
                      showRight && "border-ok/50 bg-ok/10",
                      showWrong && "border-warning/50 bg-warning/10",
                      !picked && !isChecked && "hover:bg-accent/40",
                      isChecked && !showRight && !showWrong && "opacity-60",
                    )}
                  >
                    <span className="mt-0.5 font-mono text-xs text-muted-foreground">{String.fromCharCode(65 + ci)}</span>
                    <span className="flex-1">{c}</span>
                    {showRight ? <CheckCircle2 className="size-4 shrink-0 text-ok" /> : null}
                    {showWrong ? <XCircle className="size-4 shrink-0 text-warning" /> : null}
                  </button>
                );
              })}
            </div>
            {isChecked ? (
              <div className="mt-2 text-xs leading-relaxed text-muted-foreground">
                <span className={cn("font-semibold", right ? "text-ok" : "text-warning")}>{right ? "Correct. " : "Not quite. "}</span>
                {q.explanation}
              </div>
            ) : (
              <Button size="sm" variant="outline" className="mt-2" disabled={s === undefined} onClick={() => setChecked((m) => ({ ...m, [q.id]: true }))}>
                Check answer
              </Button>
            )}
          </div>
        );
      })}
      <div className="flex items-center justify-between gap-3 rounded-md border bg-muted/30 px-3 py-2 text-sm">
        <span>
          Score: <span className="font-mono font-semibold">{correct}</span> / {questions.length}
          {done ? <span className={cn("ml-2 font-semibold", correct / questions.length >= 0.8 ? "text-ok" : "text-caution")}>{Math.round((correct / questions.length) * 100)}%</span> : <span className="ml-2 text-muted-foreground">({Object.keys(checked).length} answered)</span>}
        </span>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setSel({});
            setChecked({});
            setReported(false);
          }}
        >
          <RotateCcw className="size-3.5" /> Reset
        </Button>
      </div>
    </div>
  );
}
