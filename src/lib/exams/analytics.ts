/**
 * Scoring and history analytics for practice tests and written exams.
 */
import type { QuizQuestion } from "@/lib/content/types";
import type { ExamAttempt } from "@/lib/store";
import { getQuestion } from "./bank";

export interface GradeResult {
  correct: number;
  incorrect: number;
  unanswered: number;
  total: number;
  scorePct: number;
  bySubject: Record<string, { correct: number; total: number }>;
  missedQuestionIds: string[];
}

/** Grade answers (null = unanswered). Unanswered questions count as incorrect for the score. */
export function gradeExam(questions: QuizQuestion[], answers: (number | null)[]): GradeResult {
  let correct = 0;
  let incorrect = 0;
  let unanswered = 0;
  const bySubject: Record<string, { correct: number; total: number }> = {};
  const missed: string[] = [];
  questions.forEach((q, i) => {
    const a = answers[i] ?? null;
    const s = (bySubject[q.subject] ??= { correct: 0, total: 0 });
    s.total += 1;
    if (a === null) {
      unanswered += 1;
      missed.push(q.id);
    } else if (a === q.answer) {
      correct += 1;
      s.correct += 1;
    } else {
      incorrect += 1;
      missed.push(q.id);
    }
  });
  const total = questions.length;
  return {
    correct,
    incorrect,
    unanswered,
    total,
    scorePct: total ? (correct / total) * 100 : 0,
    bySubject,
    missedQuestionIds: missed,
  };
}

export interface SubjectStat {
  subject: string;
  correct: number;
  total: number;
  pct: number;
}

/** Aggregate subject performance across attempts (most recent `limit` attempts). */
export function subjectStats(exams: readonly ExamAttempt[], limit = 20): SubjectStat[] {
  const agg: Record<string, { correct: number; total: number }> = {};
  for (const e of exams.slice(0, limit)) {
    for (const [s, v] of Object.entries(e.bySubject)) {
      const a = (agg[s] ??= { correct: 0, total: 0 });
      a.correct += v.correct;
      a.total += v.total;
    }
  }
  return Object.entries(agg)
    .map(([subject, v]) => ({ subject, ...v, pct: v.total ? (v.correct / v.total) * 100 : 0 }))
    .sort((a, b) => a.pct - b.pct || b.total - a.total);
}

/** Subjects ranked weakest first, requiring a minimum sample so one question doesn't dominate. */
export function weakestSubjects(exams: readonly ExamAttempt[], n = 5, minQuestions = 3): SubjectStat[] {
  return subjectStats(exams)
    .filter((s) => s.total >= minQuestions)
    .slice(0, n);
}

/**
 * Question ids missed in the most recent attempts (newest first, de-duplicated), limited to
 * questions that still exist in the bank.
 */
export function recentMissedIds(exams: readonly ExamAttempt[], attempts = 10): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const e of exams.slice(0, attempts)) {
    for (const id of e.missedQuestionIds) {
      if (!seen.has(id) && getQuestion(id)) {
        seen.add(id);
        out.push(id);
      }
    }
  }
  return out;
}

export type ReadinessLevel = "none" | "not-ready" | "borderline" | "nearly" | "ready";

export interface Readiness {
  level: ReadinessLevel;
  label: string;
  /** Weighted estimate 0–100, null when there is no data. */
  estimate: number | null;
  attempts: number;
  detail: string;
}

/**
 * Readiness estimate for one exam: a recency-weighted average of the last three attempts
 * (weights 3/2/1). Study-mode attempts count at half weight because answers are revealed.
 */
export function readinessFor(exams: readonly ExamAttempt[], examId: string): Readiness {
  const mine = exams.filter((e) => e.examId === examId).slice(0, 3);
  if (mine.length === 0) {
    return { level: "none", label: "No data yet", estimate: null, attempts: 0, detail: "Take a practice exam to get a readiness estimate." };
  }
  const weights = [3, 2, 1];
  let sum = 0;
  let wsum = 0;
  mine.forEach((e, i) => {
    const w = (weights[i] ?? 1) * (e.mode === "study" ? 0.5 : 1);
    sum += e.scorePct * w;
    wsum += w;
  });
  const est = sum / wsum;
  const timed = mine.filter((e) => e.mode === "timed").length;
  const basis = `Based on your last ${mine.length} attempt${mine.length > 1 ? "s" : ""}${timed < mine.length ? " (study-mode attempts weighted lower)" : ""}.`;
  if (est >= 85) return { level: "ready", label: "Ready", estimate: est, attempts: mine.length, detail: `Consistently well above the 70% passing score. ${basis}` };
  if (est >= 78) return { level: "nearly", label: "Nearly ready", estimate: est, attempts: mine.length, detail: `Passing with a margin. Review weak subjects to build a buffer. ${basis}` };
  if (est >= 70) return { level: "borderline", label: "Borderline", estimate: est, attempts: mine.length, detail: `Right at the passing line — a bad day could mean a fail. ${basis}` };
  return { level: "not-ready", label: "Not yet ready", estimate: est, attempts: mine.length, detail: `Below the 70% passing score. Focus on the weakest subjects first. ${basis}` };
}

export const READINESS_TONE: Record<ReadinessLevel, "default" | "ok" | "caution" | "warning" | "primary"> = {
  none: "default",
  "not-ready": "warning",
  borderline: "caution",
  nearly: "primary",
  ready: "ok",
};
