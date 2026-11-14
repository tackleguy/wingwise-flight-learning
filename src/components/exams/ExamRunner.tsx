/**
 * Full exam runner: intro → active (timed or study) → review & submit → results.
 * Records the attempt with actions.recordExam exactly once on submission.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useBlocker } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Flag,
  Grid3x3,
  Keyboard,
  Play,
} from "lucide-react";
import type { QuizQuestion } from "@/lib/content/types";
import { actions } from "@/lib/store";
import { buildExam, examPool, SECONDS_PER_QUESTION, type ExamDef } from "@/lib/exams/catalog";
import { gradeExam, type GradeResult } from "@/lib/exams/analytics";
import { Notice, formatDuration } from "@/components/app/page";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { QuestionCard } from "./QuestionCard";
import { ExamResults } from "./ExamResults";

type Phase = "intro" | "active" | "review" | "results";

export interface ExamRunnerProps {
  def: ExamDef;
  /** Title recorded with the attempt. */
  title: string;
  mode: "timed" | "study";
  count?: number | undefined;
  subjects?: string[] | undefined;
  /** Restrict to these question ids (review of missed questions). */
  onlyIds?: string[] | undefined;
  backTo: string;
  backLabel: string;
}

function timeLimitFor(def: ExamDef, n: number): number {
  if (def.category === "custom" || n !== def.questionCount) {
    if (def.category === "custom") return Math.max(5 * 60, n * SECONDS_PER_QUESTION);
    return Math.max(5 * 60, Math.round((def.timeLimitMin * 60 * n) / def.questionCount / 60) * 60);
  }
  return def.timeLimitMin * 60;
}

export function ExamRunner({
  def,
  title,
  mode,
  count,
  subjects,
  onlyIds,
  backTo,
  backLabel,
}: ExamRunnerProps) {
  const poolCount = useMemo(() => {
    let pool = examPool(def, subjects);
    if (onlyIds) {
      const s = new Set(onlyIds);
      pool = pool.filter((q) => s.has(q.id));
    }
    return pool.length;
  }, [def, subjects, onlyIds]);
  const plannedCount = Math.min(count ?? (onlyIds ? poolCount : def.questionCount), poolCount);
  const timed = mode === "timed";

  const [phase, setPhase] = useState<Phase>("intro");
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [answers, setAnswers] = useState<(number | null)[]>([]);
  const [flags, setFlags] = useState<boolean[]>([]);
  const [revealed, setRevealed] = useState<boolean[]>([]);
  const [idx, setIdx] = useState(0);
  const [startedAt, setStartedAt] = useState(0);
  const [now, setNow] = useState(0);
  const [limitSec, setLimitSec] = useState(0);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [showNav, setShowNav] = useState(false);
  const [result, setResult] = useState<{
    grade: GradeResult;
    timeUsedSec: number;
    auto: boolean;
  } | null>(null);
  const submittedRef = useRef(false);

  const inProgress = phase === "active" || phase === "review";

  const start = useCallback(() => {
    const qs = buildExam(def, {
      shuffleQuestions: true,
      shuffleAnswers: true,
      count: plannedCount,
      ...(subjects ? { subjects } : {}),
      ...(onlyIds ? { onlyIds } : {}),
    });
    setQuestions(qs);
    setAnswers(qs.map(() => null));
    setFlags(qs.map(() => false));
    setRevealed(qs.map(() => false));
    setIdx(0);
    setLimitSec(timeLimitFor(def, qs.length));
    const t = Date.now();
    setStartedAt(t);
    setNow(t);
    setResult(null);
    submittedRef.current = false;
    setPhase("active");
    if (typeof window !== "undefined") window.scrollTo({ top: 0 });
  }, [def, plannedCount, subjects, onlyIds]);

  const elapsedSec = inProgress ? Math.max(0, Math.floor((now - startedAt) / 1000)) : 0;
  const remainingSec = timed ? Math.max(0, limitSec - elapsedSec) : null;

  const submit = useCallback(
    (auto: boolean) => {
      if (submittedRef.current || questions.length === 0) return;
      submittedRef.current = true;
      const grade = gradeExam(questions, answers);
      const used = Math.floor((Date.now() - startedAt) / 1000);
      const timeUsedSec = timed ? Math.min(limitSec, used) : used;
      actions.recordExam({
        examId: def.id,
        title,
        mode,
        correct: grade.correct,
        incorrect: grade.incorrect,
        unanswered: grade.unanswered,
        total: grade.total,
        scorePct: grade.scorePct,
        passed: grade.scorePct >= def.passPct,
        timeUsedSec,
        bySubject: grade.bySubject,
        missedQuestionIds: grade.missedQuestionIds,
      });
      setResult({ grade, timeUsedSec, auto });
      setConfirmOpen(false);
      setPhase("results");
      if (typeof window !== "undefined") window.scrollTo({ top: 0 });
    },
    [questions, answers, startedAt, timed, limitSec, def, title, mode],
  );

  // Clock
  useEffect(() => {
    if (!inProgress) return;
    const t = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(t);
  }, [inProgress]);

  // Auto-submit when time expires
  useEffect(() => {
    if (inProgress && timed && remainingSec === 0) submit(true);
  }, [inProgress, timed, remainingSec, submit]);

  // Guard against leaving mid-exam (in-app navigation + tab close/reload)
  const blocker = useBlocker({
    shouldBlockFn: () => true,
    disabled: !inProgress,
    enableBeforeUnload: () => inProgress,
    withResolver: true,
  });

  const select = useCallback(
    (choice: number) => {
      if (phase !== "active") return;
      const q = questions[idx];
      if (!q || choice >= q.choices.length) return;
      if (!timed && revealed[idx]) return; // study mode: locked once revealed
      setAnswers((a) => a.map((v, i) => (i === idx ? choice : v)));
      if (!timed) setRevealed((r) => r.map((v, i) => (i === idx ? true : v)));
    },
    [phase, questions, idx, timed, revealed],
  );
  const go = useCallback(
    (i: number) => setIdx(Math.max(0, Math.min(questions.length - 1, i))),
    [questions.length],
  );
  const toggleFlag = useCallback(
    () => setFlags((f) => f.map((v, i) => (i === idx ? !v : v))),
    [idx],
  );

  // Keyboard shortcuts
  useEffect(() => {
    if (phase !== "active") return;
    const onKey = (e: KeyboardEvent) => {
      if (confirmOpen || blocker.status === "blocked") return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable))
        return;
      const k = e.key.toLowerCase();
      if (["1", "2", "3", "4"].includes(k)) {
        select(Number(k) - 1);
        e.preventDefault();
      } else if (["a", "b", "c", "d"].includes(k)) {
        select(k.charCodeAt(0) - 97);
        e.preventDefault();
      } else if (k === "arrowright") {
        if (idx < questions.length - 1) go(idx + 1);
        else setPhase("review");
        e.preventDefault();
      } else if (k === "arrowleft") {
        go(idx - 1);
        e.preventDefault();
      } else if (k === "f") {
        toggleFlag();
        e.preventDefault();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, confirmOpen, blocker.status, select, go, idx, questions.length, toggleFlag]);

  const answeredCount = answers.filter((a) => a !== null).length;
  const unansweredIdx = answers.map((a, i) => (a === null ? i : -1)).filter((i) => i >= 0);
  const flaggedIdx = flags.map((f, i) => (f ? i : -1)).filter((i) => i >= 0);

  const leaveDialog = (
    <AlertDialog open={blocker.status === "blocked"}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Leave this exam?</AlertDialogTitle>
          <AlertDialogDescription>
            Your exam is still in progress. If you leave now, your answers will be lost and this
            attempt will not be recorded.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => blocker.reset?.()}>Stay in exam</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={() => blocker.proceed?.()}
          >
            Leave and discard
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  // ───────────── Intro ─────────────
  if (phase === "intro") {
    const introLimit = timeLimitFor(def, plannedCount);
    return (
      <div className="mx-auto max-w-2xl animate-fade-up py-4">
        <p className="text-xs text-muted-foreground">
          <span className="font-mono text-primary">{def.code}</span> ·{" "}
          {timed ? "Timed mode" : "Study mode"}
          {onlyIds ? " · Missed-question review" : ""}
        </p>
        <h2 className="mt-2 text-2xl font-bold tracking-tight">{title}</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {onlyIds
            ? "Questions you missed in recent attempts, in a new random order."
            : def.description}
        </p>
        <p className="mt-5 font-mono text-sm tabular">
          {plannedCount} questions · {timed ? `${Math.round(introLimit / 60)} min` : "untimed"} ·{" "}
          {def.passPct}% to pass
        </p>
        <ul className="mt-4 list-disc space-y-1.5 pl-5 text-sm text-foreground/85 marker:text-muted-foreground">
          {timed ? (
            <>
              <li>The timer starts when you begin and submits automatically at zero.</li>
              <li>Flag questions to revisit; results and explanations appear at the end.</li>
            </>
          ) : (
            <li>Untimed. The correct answer and explanation appear as soon as you answer.</li>
          )}
          <li>Questions and choices are shuffled. Unanswered questions count as incorrect.</li>
        </ul>
        <div className="mt-8 flex flex-wrap items-center gap-2">
          {plannedCount > 0 ? (
            <Button size="lg" onClick={start}>
              <Play /> Begin {timed ? "timed exam" : "study session"}
            </Button>
          ) : (
            <p className="text-sm text-caution">
              No questions match this selection. Go back and choose different subjects.
            </p>
          )}
          <Link
            to={backTo}
            className="inline-flex h-10 items-center rounded-md px-4 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            {backLabel}
          </Link>
        </div>
        <Notice
          className="mt-8"
          tone="caution"
          title="Unofficial study material — not an FAA test."
        >
          These are original TeachX practice questions written from FAA publications — not actual
          FAA knowledge test questions. Always verify against current regulations and handbooks.
        </Notice>
      </div>
    );
  }

  // ───────────── Results ─────────────
  if (phase === "results" && result) {
    return (
      <ExamResults
        title={title}
        mode={mode}
        passPct={def.passPct}
        questions={questions}
        answers={answers}
        flags={flags}
        result={result.grade}
        timeUsedSec={result.timeUsedSec}
        timeLimitSec={timed ? limitSec : null}
        autoSubmitted={result.auto}
        onRetake={start}
        backTo={backTo}
        backLabel={backLabel}
      />
    );
  }

  const q = questions[idx];
  const timeTone =
    remainingSec === null
      ? "text-foreground"
      : remainingSec <= 60
        ? "text-warning animate-annunciator"
        : remainingSec <= 300
          ? "text-caution"
          : "text-foreground";

  const header = (
    <div className="sticky top-12 z-20 -mx-4 mb-6 border-b bg-background/95 px-4 py-2 backdrop-blur sm:-mx-6 sm:px-6">
      <div className="mx-auto flex max-w-3xl items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{title}</p>
          <p className="font-mono text-xs text-muted-foreground tabular">
            {answeredCount}/{questions.length} answered
          </p>
        </div>
        <div
          className={cn(
            "flex items-center gap-1.5 font-mono text-base font-semibold tabular",
            timeTone,
          )}
          aria-live="off"
        >
          <Clock className="size-4" />
          {remainingSec === null ? formatDuration(elapsedSec) : formatDuration(remainingSec)}
        </div>
        {phase === "active" ? (
          <Button
            variant="outline"
            size="sm"
            className="hidden sm:inline-flex"
            onClick={() => setPhase("review")}
          >
            <ClipboardCheck /> Review & submit
          </Button>
        ) : null}
      </div>
      <div className="mx-auto mt-2 h-0.5 max-w-3xl overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{ width: `${questions.length ? (answeredCount / questions.length) * 100 : 0}%` }}
        />
      </div>
    </div>
  );

  const navigator = (
    <div>
      <div className="grid grid-cols-8 gap-1.5 sm:grid-cols-12">
        {questions.map((qq, i) => {
          const a = answers[i];
          const studyState = !timed && revealed[i] ? (a === qq.answer ? "ok" : "bad") : null;
          return (
            <button
              key={qq.id}
              type="button"
              onClick={() => {
                go(i);
                setPhase("active");
                setShowNav(false);
              }}
              aria-label={`Question ${i + 1}${a !== null ? ", answered" : ", unanswered"}${flags[i] ? ", flagged" : ""}`}
              className={cn(
                "relative flex h-8 items-center justify-center rounded border font-mono text-xs tabular transition-colors",
                studyState === "ok" && "border-ok/50 bg-ok/15 text-ok",
                studyState === "bad" && "border-warning/50 bg-warning/15 text-warning",
                !studyState && a !== null && "border-primary/50 bg-primary/20 text-foreground",
                !studyState && a === null && "border-border bg-background/40 text-muted-foreground",
                phase === "active" &&
                  i === idx &&
                  "ring-2 ring-primary ring-offset-1 ring-offset-background",
              )}
            >
              {i + 1}
              {flags[i] ? (
                <span className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-caution" />
              ) : null}
            </button>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="size-2.5 rounded-sm border border-primary/50 bg-primary/20" /> Answered
        </span>
        <span className="flex items-center gap-1">
          <span className="size-2.5 rounded-sm border bg-background/40" /> Unanswered
        </span>
        <span className="flex items-center gap-1">
          <span className="size-2 rounded-full bg-caution" /> Flagged
        </span>
        {!timed ? (
          <span className="flex items-center gap-1">
            <span className="size-2.5 rounded-sm bg-ok/40" /> Correct /{" "}
            <span className="size-2.5 rounded-sm bg-warning/40" /> Incorrect
          </span>
        ) : null}
        <span className="ml-auto hidden items-center gap-1 sm:flex">
          <Keyboard className="size-3" /> 1–4 / A–D answer · ← → move · F flag
        </span>
      </div>
    </div>
  );

  // ───────────── Review & submit ─────────────
  if (phase === "review") {
    return (
      <div>
        {leaveDialog}
        {header}
        <div className="mx-auto max-w-3xl animate-fade-up">
          <h2 className="text-xl font-bold tracking-tight">Review &amp; submit</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            <span className="text-ok">{answeredCount} answered</span> ·{" "}
            <span className={unansweredIdx.length ? "text-caution" : ""}>
              {unansweredIdx.length} unanswered
            </span>{" "}
            ·{" "}
            <span className={flaggedIdx.length ? "text-caution" : ""}>
              {flaggedIdx.length} flagged
            </span>
          </p>
          {unansweredIdx.length > 0 ? (
            <div className="mt-4">
              <p className="mb-2 flex items-center gap-1.5 text-sm font-medium text-caution">
                <AlertTriangle className="size-4" /> Unanswered questions (count as incorrect)
              </p>
              <div className="flex flex-wrap gap-1.5">
                {unansweredIdx.map((i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => {
                      go(i);
                      setPhase("active");
                    }}
                    className="rounded border border-caution/40 bg-caution/10 px-2 py-1 font-mono text-xs text-caution hover:bg-caution/20"
                  >
                    Q{i + 1}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <p className="mt-4 flex items-center gap-1.5 text-sm text-ok">
              <CheckCircle2 className="size-4" /> All questions answered.
            </p>
          )}
          {flaggedIdx.length > 0 ? (
            <div className="mt-4">
              <p className="mb-2 flex items-center gap-1.5 text-sm font-medium">
                <Flag className="size-4 text-caution" /> Flagged for review
              </p>
              <div className="flex flex-wrap gap-1.5">
                {flaggedIdx.map((i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => {
                      go(i);
                      setPhase("active");
                    }}
                    className="rounded border px-2 py-1 font-mono text-xs hover:bg-accent"
                  >
                    Q{i + 1}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          <div className="mt-6 border-t pt-4">
            <p className="mb-2 text-xs text-muted-foreground">All questions</p>
            {navigator}
          </div>
          <div className="mt-6 flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setPhase("active")}>
              <ArrowLeft /> Return to exam
            </Button>
            <Button onClick={() => setConfirmOpen(true)}>
              <ClipboardCheck /> Submit exam
            </Button>
          </div>
        </div>
        <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Submit your exam?</AlertDialogTitle>
              <AlertDialogDescription>
                {unansweredIdx.length > 0
                  ? `You have ${unansweredIdx.length} unanswered question${unansweredIdx.length > 1 ? "s" : ""}, which will be scored as incorrect. `
                  : "All questions are answered. "}
                {flaggedIdx.length > 0
                  ? `${flaggedIdx.length} question${flaggedIdx.length > 1 ? "s are" : " is"} still flagged. `
                  : ""}
                You can't change answers after submitting.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep working</AlertDialogCancel>
              <AlertDialogAction onClick={() => submit(false)}>
                Submit and see results
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  }

  // ───────────── Active question ─────────────
  if (!q) return null;
  const isLast = idx === questions.length - 1;
  return (
    <div>
      {leaveDialog}
      {header}
      <div className="mx-auto min-w-0 max-w-3xl">
        <QuestionCard
          key={q.id + idx}
          q={q}
          number={idx + 1}
          total={questions.length}
          selected={answers[idx] ?? null}
          onSelect={!timed && revealed[idx] ? undefined : select}
          reveal={!timed && (revealed[idx] ?? false)}
          flagged={flags[idx] ?? false}
        />

        {/* Action bar — sticky on phones */}
        <div className="sticky bottom-0 z-10 -mx-4 mt-6 border-t bg-background/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0 sm:py-0 sm:backdrop-blur-none">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => go(idx - 1)}
              disabled={idx === 0}
              aria-label="Previous question"
            >
              <ArrowLeft /> <span className="hidden sm:inline">Previous</span>
            </Button>
            <Button
              variant={flags[idx] ? "secondary" : "ghost"}
              onClick={toggleFlag}
              aria-pressed={flags[idx] ?? false}
              className={cn(flags[idx] && "text-caution")}
            >
              <Flag /> <span className="hidden sm:inline">{flags[idx] ? "Flagged" : "Flag"}</span>
            </Button>
            <Button variant="ghost" onClick={() => setShowNav((s) => !s)} aria-expanded={showNav}>
              <Grid3x3 /> <span className="hidden sm:inline">Questions</span>
            </Button>
            <div className="flex-1" />
            {isLast ? (
              <Button onClick={() => setPhase("review")}>
                <ClipboardCheck /> Review & submit
              </Button>
            ) : (
              <Button onClick={() => go(idx + 1)}>
                Next <ArrowRight />
              </Button>
            )}
          </div>
          {showNav ? (
            <div className="mt-3 rounded-md border bg-card p-3">
              {navigator}
              <Button
                variant="outline"
                size="sm"
                className="mt-3 w-full sm:hidden"
                onClick={() => setPhase("review")}
              >
                <ClipboardCheck /> Review & submit
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
