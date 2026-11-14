/** Shared building blocks for graded academy exercises. */
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { CheckCircle2, RefreshCw, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Holds a randomly generated exercise item. Generation runs on the client after mount so the
 * server render and the first client render match (no hydration mismatch from Math.random).
 */
export function useGenerated<T>(generate: () => T) {
  const [item, setItem] = useState<T | null>(null);
  const [round, setRound] = useState(0);
  useEffect(() => {
    setItem(generate());
    // generate is expected to be a stable module-level function
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const next = useCallback(() => {
    setItem(generate());
    setRound((r) => r + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return { item, next, round };
}

export function useScore() {
  const [score, setScore] = useState({ correct: 0, total: 0 });
  const record = useCallback((ok: boolean) => setScore((s) => ({ correct: s.correct + (ok ? 1 : 0), total: s.total + 1 })), []);
  return { score, record };
}

export function ExerciseFrame({
  children,
  score,
  onNext,
  nextLabel = "Try another",
  instructions,
  footer,
}: {
  children: ReactNode;
  score?: { correct: number; total: number } | undefined;
  onNext?: (() => void) | undefined;
  nextLabel?: string;
  instructions?: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="space-y-3">
      {instructions || score ? (
        <div className="flex flex-wrap items-start justify-between gap-2">
          {instructions ? <p className="max-w-2xl text-xs leading-relaxed text-muted-foreground">{instructions}</p> : <span />}
          {score && score.total > 0 ? (
            <span className="rounded border bg-muted px-2 py-0.5 font-mono text-[11px] tabular">
              Score {score.correct}/{score.total}
            </span>
          ) : null}
        </div>
      ) : null}
      {children}
      {onNext || footer ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
          <div className="text-[11px] text-muted-foreground">{footer}</div>
          {onNext ? (
            <Button size="sm" variant="outline" onClick={onNext}>
              <RefreshCw className="size-3.5" />
              {nextLabel}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function Loading() {
  return <div className="h-40 animate-pulse rounded-md bg-muted/40" aria-label="Loading exercise" />;
}

export function Feedback({ ok, title, children }: { ok: boolean; title?: string; children?: ReactNode }) {
  return (
    <div className={cn("flex gap-2 rounded-md border p-3 text-xs leading-relaxed animate-fade-up", ok ? "border-ok/30 bg-ok/5" : "border-warning/30 bg-warning/5")}>
      {ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-ok" /> : <XCircle className="mt-0.5 size-4 shrink-0 text-warning" />}
      <div className="min-w-0">
        <p className={cn("font-semibold", ok ? "text-ok" : "text-warning")}>{title ?? (ok ? "Correct" : "Not quite")}</p>
        {children ? <div className="mt-0.5 text-foreground/85">{children}</div> : null}
      </div>
    </div>
  );
}

/** Numeric/text field with right/wrong state. */
export function AnswerField({
  label,
  value,
  onChange,
  suffix,
  status,
  placeholder,
  inputMode = "decimal",
  hint,
  className,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  suffix?: string;
  status?: boolean | null | undefined;
  placeholder?: string;
  inputMode?: "decimal" | "numeric" | "text";
  hint?: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-1 block text-[11px] font-medium text-muted-foreground">{label}</span>
      <div
        className={cn(
          "flex items-center rounded-md border bg-panel focus-within:ring-1 focus-within:ring-ring",
          status === true && "border-ok/60",
          status === false && "border-warning/70",
        )}
      >
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          inputMode={inputMode}
          placeholder={placeholder}
          className="h-9 w-full min-w-0 bg-transparent px-2.5 font-mono text-sm tabular outline-none placeholder:text-muted-foreground/50"
        />
        {suffix ? <span className="pr-2.5 text-[11px] text-muted-foreground">{suffix}</span> : null}
        {status === true ? <CheckCircle2 className="mr-2 size-4 shrink-0 text-ok" /> : status === false ? <XCircle className="mr-2 size-4 shrink-0 text-warning" /> : null}
      </div>
      {hint ? <span className="mt-1 block text-[10px] text-muted-foreground">{hint}</span> : null}
    </label>
  );
}

/** Multiple-choice list with reveal state. */
export function Choices({
  choices,
  selected,
  answer,
  revealed,
  onSelect,
  columns = 1,
}: {
  choices: string[];
  selected: number | null;
  answer: number;
  revealed: boolean;
  onSelect: (i: number) => void;
  columns?: 1 | 2;
}) {
  return (
    <div className={cn("grid gap-1.5", columns === 2 && "sm:grid-cols-2")}>
      {choices.map((c, i) => {
        const isAns = i === answer;
        const isSel = i === selected;
        return (
          <button
            key={`${i}-${c}`}
            type="button"
            disabled={revealed}
            onClick={() => onSelect(i)}
            className={cn(
              "flex items-start gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors",
              !revealed && "hover:border-primary/60 hover:bg-accent/40",
              !revealed && isSel && "border-primary bg-primary/10",
              revealed && isAns && "border-ok/60 bg-ok/10",
              revealed && isSel && !isAns && "border-warning/60 bg-warning/10",
              revealed && !isAns && !isSel && "opacity-60",
            )}
          >
            <span className="mt-px font-mono text-[11px] text-muted-foreground">{String.fromCharCode(65 + i)}</span>
            <span className="min-w-0 flex-1">{c}</span>
            {revealed && isAns ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-ok" /> : null}
            {revealed && isSel && !isAns ? <XCircle className="mt-0.5 size-4 shrink-0 text-warning" /> : null}
          </button>
        );
      })}
    </div>
  );
}

/** Parse "1 1/2", "1.5", "3/4", "M1/4" into a number (or null). */
export function parseLooseNumber(raw: string): number | null {
  const s = raw.trim().toUpperCase().replace(/SM$/, "").replace(/^[PM]/, "").replace(/,/g, "").trim();
  if (!s) return null;
  const mixed = /^(\d+)\s+(\d+)\/(\d+)$/.exec(s);
  if (mixed) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
  const frac = /^(\d+)\/(\d+)$/.exec(s);
  if (frac && Number(frac[2]) !== 0) return Number(frac[1]) / Number(frac[2]);
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export const within = (v: number | null, target: number, tol: number) => v !== null && Math.abs(v - target) <= tol;

/** Heading comparison with wrap-around. */
export const headingWithin = (v: number | null, target: number, tol: number) => {
  if (v === null) return false;
  const d = Math.abs((((v - target) % 360) + 540) % 360 - 180);
  return d <= tol;
};

/** Small "educational chart" label required on all chart graphics. */
export function ChartDisclaimer({ className }: { className?: string }) {
  return <p className={cn("text-[10px] font-semibold tracking-wide text-caution uppercase", className)}>Educational chart — not for navigation</p>;
}
