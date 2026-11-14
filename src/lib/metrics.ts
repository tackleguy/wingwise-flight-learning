/**
 * Training metrics derived ONLY from the learner's real training record (TrainingState).
 * Every proficiency is 0–100 and is 0 when there is no data for it. No values are invented.
 *
 * Formulas (all clamped to 0–100):
 *
 *  VFR proficiency  = 40% × VFR lesson completion (lessons done / lessons in the VFR course)
 *                   + 30% × average over ALL VFR modules of the best quiz score for that module
 *                         (modules never attempted count as 0)
 *                   + 30% × average score of the last 5 VFR simulator flights (kind "vfr")
 *  IFR proficiency  = same formula with the IFR course and IFR flights (kind "ifr").
 *  ATC score        = recency-weighted average of the last 5 ATC sessions (weights 5,4,3,2,1 —
 *                     most recent heaviest).
 *  Avionics         = 70% × avionics lab task completion (tasks done / AVIONICS_TASKS.length)
 *                   + 30% × average score of the last 5 avionics-kind sim flights.
 *  Written readiness= recency-weighted average (5,4,3,2,1) of the last 5 attempts on full written
 *                     knowledge exams (par, ira, cax, atm, foi, fia, fii). Study-mode attempts
 *                     carry half weight because they are untimed/open-feedback.
 *  Oral score       = recency-weighted average of the last 5 oral exam attempts.
 *  Checkride score  = recency-weighted average of the last 3 COMPLETED mock checkrides.
 *
 * Training level ladder: see TRAINING_LADDER below. A level is reached when all of its
 * requirements (and those of all previous levels) are met; `pct` is the progress toward the next
 * level (mean of the next level's requirement progress values).
 */
import { AVIONICS_TASKS } from "@/lib/avionics/tasks";
import { COURSES, allLessons, lessonCount } from "@/lib/content";
import type { ExamAttempt, FlightLog, TrainingState } from "@/lib/store";

export const WRITTEN_EXAM_IDS = ["par", "ira", "cax", "atm", "foi", "fia", "fii"] as const;

export const WRITTEN_EXAM_NAMES: Record<string, string> = {
  par: "Private Pilot Airplane (PAR)",
  ira: "Instrument Rating Airplane (IRA)",
  cax: "Commercial Pilot Airplane (CAX)",
  atm: "Airline Transport Pilot Multi-engine (ATM)",
  foi: "Fundamentals of Instructing (FOI)",
  fia: "Flight Instructor Airplane (FIA)",
  fii: "Flight Instructor Instrument (FII)",
};

export function isWrittenExam(examId: string): boolean {
  return (WRITTEN_EXAM_IDS as readonly string[]).includes(examId);
}

const clamp100 = (v: number) => (Number.isFinite(v) ? Math.max(0, Math.min(100, v)) : 0);
const pct = (score: number, total: number) => (total > 0 ? (score / total) * 100 : 0);

/** Sort newest first (ISO dates). */
function newestFirst<T extends { date: string }>(arr: readonly T[]): T[] {
  return [...arr].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

/** Recency-weighted mean: values must be newest-first; weights n, n-1, … 1. */
export function recencyWeighted(values: { v: number; w?: number }[], n = 5): number {
  const xs = values.slice(0, n);
  if (xs.length === 0) return 0;
  let num = 0;
  let den = 0;
  xs.forEach((x, i) => {
    const w = (xs.length - i) * (x.w ?? 1);
    num += x.v * w;
    den += w;
  });
  return den > 0 ? num / den : 0;
}

function avg(xs: number[]): number {
  return xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0;
}

/** Safe wrappers around the content index (content may still be loading/empty). */
function safeLessonIds(courseId?: string): string[] {
  try {
    return allLessons(courseId).map((l) => l.lesson.id);
  } catch {
    return [];
  }
}
function safeLessonCount(courseId?: string): number {
  try {
    return lessonCount(courseId);
  } catch {
    return 0;
  }
}

export function courseLessonProgress(
  state: TrainingState,
  courseId: string,
): { done: number; total: number; pct: number } {
  const ids = safeLessonIds(courseId);
  const total = ids.length || safeLessonCount(courseId);
  const done = ids.filter((id) => state.lessons[id]).length;
  return { done, total, pct: total > 0 ? (done / total) * 100 : 0 };
}

/** Best quiz % per module for a course; returns average across all modules (unattempted = 0). */
export function moduleQuizAverage(state: TrainingState, courseId: string): number {
  const course = COURSES.find((c) => c.id === courseId);
  const quizzes = state.quizzes.filter((q) => q.course === courseId);
  const best = new Map<string, number>();
  for (const q of quizzes)
    best.set(q.moduleId, Math.max(best.get(q.moduleId) ?? 0, pct(q.score, q.total)));
  if (course && course.modules.length) return avg(course.modules.map((m) => best.get(m.id) ?? 0));
  return best.size ? avg([...best.values()]) : 0;
}

function lastFlightsAvg(flights: FlightLog[], kind: FlightLog["kind"], n = 5): number {
  const xs = newestFirst(flights.filter((f) => f.kind === kind)).slice(0, n);
  return avg(xs.map((f) => f.score));
}

function courseProficiency(state: TrainingState, courseId: "vfr" | "ifr"): number {
  const lessons = courseLessonProgress(state, courseId).pct;
  const quiz = moduleQuizAverage(state, courseId);
  const flights = lastFlightsAvg(state.flights, courseId);
  return clamp100(0.4 * lessons + 0.3 * quiz + 0.3 * flights);
}

export function writtenAttempts(state: TrainingState): ExamAttempt[] {
  return newestFirst(state.exams.filter((e) => isWrittenExam(e.examId)));
}

/** Current consecutive-day streak (days with any recorded training activity). */
export function activityDays(state: TrainingState): Map<string, number> {
  const m = new Map<string, number>();
  const add = (iso: string) => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return;
    const k = dayKey(d);
    m.set(k, (m.get(k) ?? 0) + 1);
  };
  for (const a of state.activity) if (a.kind !== "achievement" && a.kind !== "account") add(a.date);
  // Records older than the 200-item activity window still count.
  for (const iso of Object.values(state.lessons)) add(iso);
  for (const x of state.quizzes) add(x.date);
  for (const x of state.exams) add(x.date);
  for (const x of state.flights) add(x.date);
  for (const x of state.atcSessions) add(x.date);
  for (const x of state.orals) add(x.date);
  for (const x of state.checkrides) add(x.date);
  for (const iso of Object.values(state.avionicsTasks)) add(iso);
  return m;
}

export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Longest and current streaks of consecutive active days. */
export function streaks(
  state: TrainingState,
  now = new Date(),
): { current: number; longest: number } {
  const days = activityDays(state);
  if (days.size === 0) return { current: 0, longest: 0 };
  const sorted = [...days.keys()].sort();
  let longest = 1;
  let run = 1;
  for (let i = 1; i < sorted.length; i++) {
    const prev = new Date(`${sorted[i - 1]}T12:00:00`);
    const cur = new Date(`${sorted[i]}T12:00:00`);
    const diff = Math.round((cur.getTime() - prev.getTime()) / 86400000);
    run = diff === 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
  }
  // Current streak: counting back from today (or yesterday if nothing yet today).
  let current = 0;
  const d = new Date(now);
  if (!days.has(dayKey(d))) d.setDate(d.getDate() - 1);
  while (days.has(dayKey(d))) {
    current++;
    d.setDate(d.getDate() - 1);
  }
  return { current, longest };
}

/* --------------------------- Training level ladder --------------------------- */

export interface LadderRequirement {
  label: string;
  /** 0–1 */
  progress: (s: TrainingState, m: BaseMetrics) => number;
}

export interface LadderLevel {
  label: string;
  description: string;
  requirements: LadderRequirement[];
}

type BaseMetrics = Omit<Metrics, "trainingLevel">;

const bestExam = (s: TrainingState, id: string) =>
  Math.max(0, ...s.exams.filter((e) => e.examId === id).map((e) => e.scorePct));
const ratio = (v: number, target: number) => Math.max(0, Math.min(1, target > 0 ? v / target : 0));

export const TRAINING_LADDER: LadderLevel[] = [
  { label: "Ground Student", description: "Getting started with ground school.", requirements: [] },
  {
    label: "Pre-Solo",
    description: "Building basic knowledge and first simulator flights.",
    requirements: [
      { label: "Complete 5 lessons", progress: (_s, m) => ratio(m.lessonsDone, 5) },
      {
        label: "Fly a simulator flight scoring 60+",
        progress: (s) => (s.flights.some((f) => f.score >= 60) ? 1 : 0),
      },
    ],
  },
  {
    label: "Student Pilot",
    description: "Comfortable with basic maneuvers and landings.",
    requirements: [
      { label: "VFR proficiency 25%", progress: (_s, m) => ratio(m.vfrProficiency, 25) },
      { label: "Log 5 simulated landings", progress: (_s, m) => ratio(m.landings, 5) },
      {
        label: "First ATC session scoring 60+",
        progress: (s) => (s.atcSessions.some((a) => a.score >= 60) ? 1 : 0),
      },
    ],
  },
  {
    label: "Cross-Country",
    description: "Navigating between airports.",
    requirements: [
      { label: "VFR proficiency 45%", progress: (_s, m) => ratio(m.vfrProficiency, 45) },
      {
        label: "VFR cross-country flight scoring 70+",
        progress: (s) =>
          s.flights.some((f) => f.scenarioId === "vfr-xc" && f.score >= 70) ? 1 : 0,
      },
      { label: "Save a flight plan", progress: (s) => (s.flightPlans.length > 0 ? 1 : 0) },
    ],
  },
  {
    label: "Private Candidate",
    description: "Ready to prepare for the private pilot knowledge test and checkride.",
    requirements: [
      { label: "VFR proficiency 70%", progress: (_s, m) => ratio(m.vfrProficiency, 70) },
      { label: "Private written (PAR) 70%+", progress: (s) => ratio(bestExam(s, "par"), 70) },
      { label: "ATC score 70%", progress: (_s, m) => ratio(m.atcScore, 70) },
    ],
  },
  {
    label: "Instrument Student",
    description: "Learning to fly by reference to instruments.",
    requirements: [
      { label: "IFR proficiency 25%", progress: (_s, m) => ratio(m.ifrProficiency, 25) },
      {
        label: "Fly an IFR scenario scoring 60+",
        progress: (s) => (s.flights.some((f) => f.kind === "ifr" && f.score >= 60) ? 1 : 0),
      },
    ],
  },
  {
    label: "Instrument Candidate",
    description: "Ready to prepare for the instrument knowledge test and checkride.",
    requirements: [
      { label: "IFR proficiency 70%", progress: (_s, m) => ratio(m.ifrProficiency, 70) },
      { label: "Instrument written (IRA) 70%+", progress: (s) => ratio(bestExam(s, "ira"), 70) },
      {
        label: "ILS approach flown scoring 80+",
        progress: (s) =>
          s.flights.some((f) => f.scenarioId === "ifr-ils" && f.score >= 80) ? 1 : 0,
      },
    ],
  },
  {
    label: "Commercial Candidate",
    description: "Advanced knowledge and consistent performance.",
    requirements: [
      { label: "Commercial written (CAX) 70%+", progress: (s) => ratio(bestExam(s, "cax"), 70) },
      {
        label: "Pass a mock checkride",
        progress: (s) => (s.checkrides.some((c) => c.completed && c.passed) ? 1 : 0),
      },
      { label: "10 simulated hours", progress: (_s, m) => ratio(m.simHours, 10) },
    ],
  },
];

export interface Metrics {
  simHours: number;
  flights: number;
  landings: number;
  lessonsDone: number;
  lessonsTotal: number;
  vfrProficiency: number;
  ifrProficiency: number;
  atcScore: number;
  avionicsProficiency: number;
  writtenReadiness: number;
  oralScore: number;
  checkrideScore: number;
  trainingLevel: { label: string; level: number; nextLabel: string; pct: number };
}

export function computeMetrics(state: TrainingState): Metrics {
  const allIds = safeLessonIds();
  const lessonsTotal = allIds.length || safeLessonCount();
  const lessonsDone = allIds.length
    ? allIds.filter((id) => state.lessons[id]).length
    : Object.keys(state.lessons).length;

  const atc = newestFirst(state.atcSessions).map((a) => ({ v: a.score }));
  const avionicsDone = AVIONICS_TASKS.filter((t) => state.avionicsTasks[t.id]).length;
  const avionicsCompletion =
    AVIONICS_TASKS.length > 0 ? (avionicsDone / AVIONICS_TASKS.length) * 100 : 0;
  const written = writtenAttempts(state).map((e) => ({
    v: e.scorePct,
    w: e.mode === "study" ? 0.5 : 1,
  }));
  const orals = newestFirst(state.orals).map((o) => ({ v: o.score }));
  const rides = newestFirst(state.checkrides.filter((c) => c.completed)).map((c) => ({
    v: c.overall,
  }));

  const base: BaseMetrics = {
    simHours: state.flights.reduce((s, f) => s + f.durationSec, 0) / 3600,
    flights: state.flights.length,
    landings: state.flights.reduce((s, f) => s + f.landings, 0),
    lessonsDone,
    lessonsTotal,
    vfrProficiency: Math.round(courseProficiency(state, "vfr")),
    ifrProficiency: Math.round(courseProficiency(state, "ifr")),
    atcScore: Math.round(clamp100(recencyWeighted(atc, 5))),
    avionicsProficiency: Math.round(
      clamp100(0.7 * avionicsCompletion + 0.3 * lastFlightsAvg(state.flights, "avionics")),
    ),
    writtenReadiness: Math.round(clamp100(recencyWeighted(written, 5))),
    oralScore: Math.round(clamp100(recencyWeighted(orals, 5))),
    checkrideScore: Math.round(clamp100(recencyWeighted(rides, 3))),
  };

  return { ...base, trainingLevel: trainingLevel(state, base) };
}

export function ladderProgress(state: TrainingState, base: BaseMetrics) {
  return TRAINING_LADDER.map((lvl) => {
    const reqs = lvl.requirements.map((r) => ({
      label: r.label,
      progress: safeProgress(() => r.progress(state, base)),
    }));
    return { ...lvl, reqs, met: reqs.every((r) => r.progress >= 1) };
  });
}

function safeProgress(fn: () => number): number {
  try {
    const v = fn();
    return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0;
  } catch {
    return 0;
  }
}

function trainingLevel(state: TrainingState, base: BaseMetrics): Metrics["trainingLevel"] {
  const lp = ladderProgress(state, base);
  let level = 0;
  for (let i = 1; i < lp.length; i++) {
    if (lp[i]?.met) level = i;
    else break;
  }
  const cur = lp[level];
  const next = lp[level + 1];
  const p = next ? avg(next.reqs.map((r) => r.progress)) * 100 : 100;
  return {
    label: cur?.label ?? "Ground Student",
    level,
    nextLabel: next?.label ?? "Top level reached",
    pct: Math.round(p),
  };
}

/** Aggregate exam performance by subject across all exam attempts. */
export function subjectStrengths(
  state: TrainingState,
): { subject: string; correct: number; total: number; pct: number; attempts: number }[] {
  const m = new Map<string, { correct: number; total: number; attempts: number }>();
  for (const e of state.exams) {
    for (const [subject, v] of Object.entries(e.bySubject)) {
      const cur = m.get(subject) ?? { correct: 0, total: 0, attempts: 0 };
      cur.correct += v.correct;
      cur.total += v.total;
      cur.attempts += 1;
      m.set(subject, cur);
    }
  }
  return [...m.entries()]
    .map(([subject, v]) => ({ subject, ...v, pct: v.total > 0 ? (v.correct / v.total) * 100 : 0 }))
    .sort((a, b) => a.pct - b.pct);
}
