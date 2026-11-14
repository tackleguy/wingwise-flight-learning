/**
 * Achievements — training milestones computed from the real training record.
 *
 * store.ts dynamically imports this module and calls evaluateAchievements() after every state
 * change. evaluateAchievements() is idempotent: it only unlocks achievements that are not yet in
 * state.achievements, and unlockAchievement() is a no-op for ids already unlocked, so the
 * re-evaluation triggered by an unlock finds nothing new and stops (no loop).
 */
import { AVIONICS_TASKS } from "@/lib/avionics/tasks";
import { COURSES } from "@/lib/content";
import type { Module } from "@/lib/content/types";
import { isWrittenExam, streaks } from "@/lib/metrics";
import { actions, getState, type TrainingState } from "@/lib/store";

export type AchievementCategory =
  "Flight" | "Radio" | "Ground School" | "Exams" | "Instrument" | "Avionics" | "Consistency";

export interface Achievement {
  id: string;
  title: string;
  description: string;
  /** lucide-react icon name */
  icon: string;
  category: AchievementCategory;
  check: (s: TrainingState) => boolean;
  progress?: (s: TrainingState) => { current: number; target: number };
}

/* ------------------------------- helpers ------------------------------- */

function course(id: string) {
  try {
    return COURSES.find((c) => c.id === id);
  } catch {
    return undefined;
  }
}

function findModule(courseId: string, ids: string[], titleRe?: RegExp): Module | undefined {
  const c = course(courseId);
  if (!c) return undefined;
  return (
    c.modules.find((m) => ids.includes(m.id)) ??
    (titleRe ? c.modules.find((m) => titleRe.test(m.title) || titleRe.test(m.id)) : undefined)
  );
}

function moduleLessonsDone(
  s: TrainingState,
  m: Module | undefined,
): { done: number; total: number } {
  if (!m) return { done: 0, total: 1 };
  return {
    done: m.lessons.filter((l) => s.lessons[l.id]).length,
    total: Math.max(1, m.lessons.length),
  };
}

function bestModuleQuizPct(
  s: TrainingState,
  courseId: string,
  moduleId: string | undefined,
): number {
  if (!moduleId) return 0;
  return Math.max(
    0,
    ...s.quizzes
      .filter((q) => q.course === courseId && q.moduleId === moduleId && q.total > 0)
      .map((q) => (q.score / q.total) * 100),
  );
}

function courseLessons(s: TrainingState, courseId: string) {
  const c = course(courseId);
  const ids = c ? c.modules.flatMap((m) => m.lessons.map((l) => l.id)) : [];
  return { done: ids.filter((id) => s.lessons[id]).length, total: ids.length };
}

const flightsWith = (s: TrainingState, pred: (f: TrainingState["flights"][number]) => boolean) =>
  s.flights.filter(pred);
const bestScenario = (s: TrainingState, id: string) =>
  Math.max(0, ...s.flights.filter((f) => f.scenarioId === id).map((f) => f.score));
const count = (current: number, target: number) => ({ current: Math.min(current, target), target });

function ifrFundamentals() {
  return (
    findModule(
      "ifr",
      ["fundamentals", "ifr-fundamentals", "instrument-fundamentals", "basics"],
      /fundamental/i,
    ) ?? course("ifr")?.modules[0]
  );
}
function vfrNavModules(): Module[] {
  const c = course("vfr");
  if (!c) return [];
  const out = c.modules.filter((m) => ["pilotage", "dead-reckoning"].includes(m.id));
  return out.length
    ? out
    : c.modules.filter((m) => /pilotage|dead[- ]reckoning/i.test(`${m.id} ${m.title}`));
}

function atcTop5(s: TrainingState) {
  return [...s.atcSessions].sort((a, b) => b.score - a.score).slice(0, 5);
}

/* ------------------------------- catalogue ------------------------------- */

export const ACHIEVEMENTS: Achievement[] = [
  {
    id: "first-flight",
    title: "First Successful Flight",
    description: "Complete a simulator flight with a score of 60 or higher.",
    icon: "PlaneTakeoff",
    category: "Flight",
    check: (s) => s.flights.some((f) => f.score >= 60),
    progress: (s) => count(Math.max(0, ...s.flights.map((f) => f.score)), 60),
  },
  {
    id: "first-landing",
    title: "First Successful Landing",
    description: "Log a flight with at least one landing and a landing objective met.",
    icon: "PlaneLanding",
    category: "Flight",
    check: (s) =>
      s.flights.some(
        (f) =>
          f.landings >= 1 &&
          f.objectives.some((o) => o.met && /land|touchdown|flare/i.test(o.text)),
      ),
  },
  {
    id: "first-xc",
    title: "First Cross-Country",
    description: "Fly the VFR cross-country scenario with a score of 70 or higher.",
    icon: "Map",
    category: "Flight",
    check: (s) => bestScenario(s, "vfr-xc") >= 70,
    progress: (s) => count(Math.round(bestScenario(s, "vfr-xc")), 70),
  },
  {
    id: "landings-25",
    title: "Landing Practice",
    description: "Log 25 simulated landings.",
    icon: "Repeat",
    category: "Flight",
    check: (s) => s.flights.reduce((n, f) => n + f.landings, 0) >= 25,
    progress: (s) =>
      count(
        s.flights.reduce((n, f) => n + f.landings, 0),
        25,
      ),
  },
  {
    id: "sim-10h",
    title: "Ten Hours in the Sim",
    description: "Accumulate 10 hours of simulated flight time (not loggable time).",
    icon: "Clock",
    category: "Flight",
    check: (s) => s.flights.reduce((n, f) => n + f.durationSec, 0) >= 36000,
    progress: (s) => count(Math.floor(s.flights.reduce((n, f) => n + f.durationSec, 0) / 3600), 10),
  },
  {
    id: "night-flyer",
    title: "Night Flyer",
    description: "Complete a night flight with a landing and a score of 70 or higher.",
    icon: "Moon",
    category: "Flight",
    check: (s) => s.flights.some((f) => f.night && f.landings >= 1 && f.score >= 70),
  },
  {
    id: "emergency-ready",
    title: "Emergency Ready",
    description: "Score 70+ on three different emergency scenarios.",
    icon: "Siren",
    category: "Flight",
    check: (s) =>
      new Set(
        flightsWith(s, (f) => f.scenarioId.startsWith("emg-") && f.score >= 70).map(
          (f) => f.scenarioId,
        ),
      ).size >= 3,
    progress: (s) =>
      count(
        new Set(
          flightsWith(s, (f) => f.scenarioId.startsWith("emg-") && f.score >= 70).map(
            (f) => f.scenarioId,
          ),
        ).size,
        3,
      ),
  },
  {
    id: "vfr-navigation",
    title: "VFR Navigation",
    description:
      "Complete the Pilotage and Dead Reckoning modules and fly a VFR cross-country scoring 70+.",
    icon: "Compass",
    category: "Ground School",
    check: (s) => {
      const mods = vfrNavModules();
      if (mods.length === 0) return false;
      const lessonsDone = mods.every(
        (m) => m.lessons.length > 0 && m.lessons.every((l) => s.lessons[l.id]),
      );
      return lessonsDone && bestScenario(s, "vfr-xc") >= 70;
    },
    progress: (s) => {
      const mods = vfrNavModules();
      const total = mods.reduce((n, m) => n + m.lessons.length, 0) + 1;
      const done =
        mods.reduce((n, m) => n + m.lessons.filter((l) => s.lessons[l.id]).length, 0) +
        (bestScenario(s, "vfr-xc") >= 70 ? 1 : 0);
      return count(done, total);
    },
  },
  {
    id: "vfr-graduate",
    title: "Ground School Graduate — VFR",
    description: "Complete every lesson in the VFR ground school.",
    icon: "GraduationCap",
    category: "Ground School",
    check: (s) => {
      const c = courseLessons(s, "vfr");
      return c.total > 0 && c.done >= c.total;
    },
    progress: (s) => {
      const c = courseLessons(s, "vfr");
      return count(c.done, Math.max(1, c.total));
    },
  },
  {
    id: "ifr-fundamentals",
    title: "IFR Fundamentals",
    description: "Complete every lesson in the IFR fundamentals module and score 80%+ on its quiz.",
    icon: "Gauge",
    category: "Instrument",
    check: (s) => {
      const m = ifrFundamentals();
      if (!m || m.lessons.length === 0) return false;
      return m.lessons.every((l) => s.lessons[l.id]) && bestModuleQuizPct(s, "ifr", m.id) >= 80;
    },
    progress: (s) => {
      const m = ifrFundamentals();
      const l = moduleLessonsDone(s, m);
      return count(l.done + (m && bestModuleQuizPct(s, "ifr", m.id) >= 80 ? 1 : 0), l.total + 1);
    },
  },
  {
    id: "ifr-graduate",
    title: "Ground School Graduate — IFR",
    description: "Complete every lesson in the IFR ground school.",
    icon: "BookOpenCheck",
    category: "Instrument",
    check: (s) => {
      const c = courseLessons(s, "ifr");
      return c.total > 0 && c.done >= c.total;
    },
    progress: (s) => {
      const c = courseLessons(s, "ifr");
      return count(c.done, Math.max(1, c.total));
    },
  },
  {
    id: "instrument-approach",
    title: "Instrument Approach",
    description: "Fly the ILS approach scenario with a score of 80 or higher.",
    icon: "Crosshair",
    category: "Instrument",
    check: (s) => bestScenario(s, "ifr-ils") >= 80,
    progress: (s) => count(Math.round(bestScenario(s, "ifr-ils")), 80),
  },
  {
    id: "holding-pro",
    title: "Holding Pattern Pro",
    description: "Fly the holding scenario with a score of 80 or higher.",
    icon: "RotateCw",
    category: "Instrument",
    check: (s) => bestScenario(s, "ifr-hold") >= 80,
    progress: (s) => count(Math.round(bestScenario(s, "ifr-hold")), 80),
  },
  {
    id: "radio-beginner",
    title: "Radio Communications Beginner",
    description: "Complete your first ATC session with a score of 60 or higher.",
    icon: "Radio",
    category: "Radio",
    check: (s) => s.atcSessions.some((a) => a.score >= 60),
    progress: (s) => count(Math.round(Math.max(0, ...s.atcSessions.map((a) => a.score))), 60),
  },
  {
    id: "atc-proficiency",
    title: "ATC Proficiency",
    description:
      "Five ATC sessions averaging 80+ (your best five), including at least one advanced or checkride-level session scoring 80+.",
    icon: "Headphones",
    category: "Radio",
    check: (s) => {
      const top = atcTop5(s);
      if (top.length < 5) return false;
      const mean = top.reduce((n, a) => n + a.score, 0) / 5;
      return (
        mean >= 80 &&
        s.atcSessions.some(
          (a) => (a.difficulty === "advanced" || a.difficulty === "checkride") && a.score >= 80,
        )
      );
    },
    progress: (s) => count(atcTop5(s).filter((a) => a.score >= 80).length, 5),
  },
  {
    id: "avionics-expert",
    title: "Avionics Expert",
    description: "Complete every Avionics Lab task.",
    icon: "Cpu",
    category: "Avionics",
    check: (s) => AVIONICS_TASKS.length > 0 && AVIONICS_TASKS.every((t) => s.avionicsTasks[t.id]),
    progress: (s) =>
      count(
        AVIONICS_TASKS.filter((t) => s.avionicsTasks[t.id]).length,
        Math.max(1, AVIONICS_TASKS.length),
      ),
  },
  {
    id: "written-ready",
    title: "Written Exam Ready",
    description: "Score 80%+ on a full written knowledge exam in timed mode.",
    icon: "FileCheck2",
    category: "Exams",
    check: (s) =>
      s.exams.some((e) => isWrittenExam(e.examId) && e.mode === "timed" && e.scorePct >= 80),
    progress: (s) =>
      count(
        Math.round(
          Math.max(
            0,
            ...s.exams
              .filter((e) => isWrittenExam(e.examId) && e.mode === "timed")
              .map((e) => e.scorePct),
          ),
        ),
        80,
      ),
  },
  {
    id: "perfect-score",
    title: "Perfect Score",
    description: "Answer every question correctly on any practice test or exam (10+ questions).",
    icon: "Sparkles",
    category: "Exams",
    check: (s) => s.exams.some((e) => e.total >= 10 && e.correct === e.total),
  },
  {
    id: "weather-wise",
    title: "Weather Wise",
    description: "Score 80%+ on a full Weather Lab decision-scenario session (8+ scenarios).",
    icon: "CloudSun",
    category: "Ground School",
    check: (s) =>
      s.quizzes.some(
        (q) =>
          q.course === "weather" &&
          q.moduleId === "decisions" &&
          q.total >= 8 &&
          q.score / q.total >= 0.8,
      ),
    progress: (s) => {
      const best = Math.max(
        0,
        ...s.quizzes
          .filter((q) => q.course === "weather" && q.moduleId === "decisions" && q.total >= 8)
          .map((q) => Math.round((q.score / q.total) * 100)),
      );
      return count(best, 80);
    },
  },
  {
    id: "oral-pass",
    title: "Oral Exam Pass",
    description: "Score 70%+ on an oral exam at standard level or higher.",
    icon: "Mic",
    category: "Exams",
    check: (s) => s.orals.some((o) => o.level !== "beginner" && o.score >= 70),
    progress: (s) =>
      count(
        Math.round(
          Math.max(0, ...s.orals.filter((o) => o.level !== "beginner").map((o) => o.score)),
        ),
        70,
      ),
  },
  {
    id: "mock-checkride",
    title: "Mock Checkride Completed",
    description: "Complete every stage of a mock checkride.",
    icon: "ClipboardCheck",
    category: "Exams",
    check: (s) => s.checkrides.some((c) => c.completed),
  },
  {
    id: "checkride-pass",
    title: "Checkride Passed",
    description: "Complete a mock checkride with a satisfactory result.",
    icon: "Award",
    category: "Exams",
    check: (s) => s.checkrides.some((c) => c.completed && c.passed),
  },
  {
    id: "flight-planner",
    title: "Flight Planner",
    description: "Save your first flight plan.",
    icon: "Route",
    category: "Ground School",
    check: (s) => s.flightPlans.length > 0,
  },
  {
    id: "streak-3",
    title: "On a Roll",
    description: "Train on 3 consecutive days.",
    icon: "Flame",
    category: "Consistency",
    check: (s) => streaks(s).longest >= 3,
    progress: (s) => count(streaks(s).longest, 3),
  },
  {
    id: "streak-7",
    title: "Seven-Day Streak",
    description: "Train on 7 consecutive days.",
    icon: "CalendarCheck",
    category: "Consistency",
    check: (s) => streaks(s).longest >= 7,
    progress: (s) => count(streaks(s).longest, 7),
  },
];

/* ------------------------------- evaluation ------------------------------- */

let evaluating = false;

function safeCheck(a: Achievement, s: TrainingState): boolean {
  try {
    return a.check(s);
  } catch {
    return false;
  }
}

export function achievementProgress(
  a: Achievement,
  s: TrainingState,
): { current: number; target: number } | null {
  if (!a.progress) return null;
  try {
    return a.progress(s);
  } catch {
    return null;
  }
}

/** Unlock any newly met achievements. Safe to call repeatedly. */
export function evaluateAchievements(): string[] {
  if (evaluating) return [];
  evaluating = true;
  try {
    const s = getState();
    const newly = ACHIEVEMENTS.filter((a) => !s.achievements[a.id] && safeCheck(a, s));
    if (newly.length === 0) return [];
    for (const a of newly) actions.unlockAchievement(a.id, a.title);
    if (typeof window !== "undefined" && getState().settings.notifications.achievementToasts) {
      void import("sonner")
        .then(({ toast }) => {
          if (newly.length > 3) {
            toast.success(`${newly.length} achievements unlocked`, {
              description: newly.map((a) => a.title).join(" · "),
            });
          } else {
            for (const a of newly)
              toast.success(`Achievement unlocked: ${a.title}`, { description: a.description });
          }
        })
        .catch(() => {
          /* toasts are optional */
        });
    }
    return newly.map((a) => a.id);
  } finally {
    evaluating = false;
  }
}
