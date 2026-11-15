/**
 * Exam catalog for the Practice Test Center and Written Exams.
 *
 * Written exams mirror the STRUCTURE of the FAA airman knowledge tests (question count, time,
 * 70% passing score) but draw from SkyReady's own unofficial question bank. When the bank has fewer
 * matching questions than the FAA test length, the question count is capped at the number
 * available and the time limit is scaled proportionally.
 */
import type { QuizQuestion } from "@/lib/content/types";
import type { TrackId } from "@/lib/store";
import { QUESTION_BANK, EXAM_SUBJECTS, type ExamSubject } from "./bank";

export { QUESTION_BANK, EXAM_SUBJECTS, type ExamSubject };

export interface ExamDef {
  id: string;
  /** FAA-style test code, e.g. "PAR". */
  code: string;
  title: string;
  category: "written" | "topic" | "custom";
  description: string;
  /** Number of questions per attempt (capped at available bank questions). */
  questionCount: number;
  timeLimitMin: number;
  passPct: number;
  filter: (q: QuizQuestion) => boolean;
  recommendedFor: TrackId[];
  /** For written exams: the real FAA test structure this practice exam is modeled on. */
  faa?: { questions: number; minutes: number };
  /** Question-id prefix drawn first when the pool is larger than the exam length. */
  primaryPrefix?: string;
}

const pre =
  (...prefixes: string[]) =>
  (q: QuizQuestion) =>
    prefixes.some((p) => q.id.startsWith(`${p}-`));
const subj =
  (...subjects: ExamSubject[]) =>
  (q: QuizQuestion) =>
    (subjects as string[]).includes(q.subject);
const or =
  (...fns: ((q: QuizQuestion) => boolean)[]) =>
  (q: QuizQuestion) =>
    fns.some((f) => f(q));
const and =
  (...fns: ((q: QuizQuestion) => boolean)[]) =>
  (q: QuizQuestion) =>
    fns.every((f) => f(q));

function poolSize(filter: (q: QuizQuestion) => boolean): number {
  return QUESTION_BANK.filter(filter).length;
}

function written(
  d: Omit<ExamDef, "category" | "questionCount" | "timeLimitMin" | "passPct" | "faa"> & {
    faaQuestions: number;
    faaMinutes: number;
  },
): ExamDef {
  const available = poolSize(d.filter);
  const count = Math.min(d.faaQuestions, available);
  const minutes =
    count === d.faaQuestions
      ? d.faaMinutes
      : Math.max(15, Math.round((d.faaMinutes * count) / d.faaQuestions / 5) * 5);
  const { faaQuestions, faaMinutes, ...rest } = d;
  return {
    ...rest,
    category: "written",
    questionCount: count,
    timeLimitMin: minutes,
    passPct: 70,
    faa: { questions: faaQuestions, minutes: faaMinutes },
  };
}

function topic(
  d: Omit<ExamDef, "category" | "passPct" | "questionCount"> & { questionCount: number },
): ExamDef {
  return {
    ...d,
    category: "topic",
    passPct: 70,
    questionCount: Math.min(d.questionCount, poolSize(d.filter)),
  };
}

export const EXAMS: ExamDef[] = [
  // ───────────── Full-length written exams ─────────────
  written({
    id: "par",
    code: "PAR",
    title: "Private Pilot — Airplane",
    description:
      "Regulations, airspace, weather, aerodynamics, systems, performance, navigation, charts and ADM at the private pilot level.",
    faaQuestions: 60,
    faaMinutes: 150,
    filter: pre("par"),
    primaryPrefix: "par",
    recommendedFor: ["student", "private"],
  }),
  written({
    id: "ira",
    code: "IRA",
    title: "Instrument Rating — Airplane",
    description:
      "IFR regulations, currency, alternates, holding, approaches, IFR weather, instruments and lost-communication procedures.",
    faaQuestions: 60,
    faaMinutes: 150,
    filter: pre("ira"),
    primaryPrefix: "ira",
    recommendedFor: ["instrument"],
  }),
  written({
    id: "cax",
    code: "CAX",
    title: "Commercial Pilot — Airplane",
    description:
      "Commercial privileges and limitations, complex and multiengine systems, performance maneuvers, plus the core aeronautical knowledge shared with the private level.",
    faaQuestions: 100,
    faaMinutes: 180,
    filter: or(
      pre("cax"),
      and(
        pre("par"),
        subj(
          "Aerodynamics",
          "Aircraft Systems",
          "Performance",
          "Weight & Balance",
          "Weather",
          "Weather Services",
          "Human Factors",
          "ADM",
          "Emergency Procedures",
        ),
      ),
    ),
    primaryPrefix: "cax",
    recommendedFor: ["commercial", "complex", "high-performance", "multi-engine"],
  }),
  written({
    id: "atm",
    code: "ATM",
    title: "Airline Transport Pilot — Multiengine",
    description:
      "Part 121 operations, high-speed aerodynamics, transport-category performance, turbine systems, windshear and upset recovery, plus advanced IFR knowledge.",
    faaQuestions: 125,
    faaMinutes: 240,
    filter: or(
      pre("atm", "cax"),
      and(
        pre("ira"),
        subj(
          "IFR Procedures",
          "Instrument Approaches",
          "Weather",
          "Weather Services",
          "Regulations",
        ),
      ),
    ),
    primaryPrefix: "atm",
    recommendedFor: ["atp", "multi-engine", "high-altitude"],
  }),
  written({
    id: "foi",
    code: "FOI",
    title: "Fundamentals of Instructing",
    description:
      "Learning theory, the teaching process, assessment, instructor responsibilities and communication — required for CFI and ground instructor applicants.",
    faaQuestions: 50,
    faaMinutes: 90,
    filter: pre("foi"),
    primaryPrefix: "foi",
    recommendedFor: ["cfi", "cfii"],
  }),
  written({
    id: "fia",
    code: "FIA",
    title: "Flight Instructor — Airplane",
    description:
      "Endorsements, student pilot limitations, aeronautical experience requirements and teaching maneuvers, plus the full range of private-level knowledge a CFI must teach.",
    faaQuestions: 100,
    faaMinutes: 150,
    filter: pre("fia", "par"),
    primaryPrefix: "fia",
    recommendedFor: ["cfi"],
  }),
  written({
    id: "fii",
    code: "FII",
    title: "Flight Instructor — Instrument",
    description:
      "Instrument rating requirements, safety pilots, IPCs and teaching attitude instrument flying — plus the instrument knowledge a CFII must teach.",
    faaQuestions: 50,
    faaMinutes: 150,
    filter: pre("fii", "ira"),
    primaryPrefix: "fii",
    recommendedFor: ["cfii"],
  }),

  // ───────────── Topic practice tests ─────────────
  topic({
    id: "regs",
    code: "REG",
    title: "Regulations",
    description:
      "14 CFR Parts 1, 47, 61 and 91, NTSB 830 — currency, medical, inspections, equipment and operating rules.",
    questionCount: 25,
    timeLimitMin: 40,
    filter: subj("Regulations"),
    recommendedFor: ["student", "private", "instrument", "commercial", "cfi"],
  }),
  topic({
    id: "weather",
    code: "WX",
    title: "Weather Theory & Services",
    description:
      "Stability, fronts, fog, icing and thunderstorms, plus decoding METARs, TAFs, PIREPs, winds aloft and advisories.",
    questionCount: 25,
    timeLimitMin: 40,
    filter: subj("Weather", "Weather Services"),
    recommendedFor: ["student", "private", "instrument", "commercial"],
  }),
  topic({
    id: "systems",
    code: "SYS",
    title: "Aircraft Systems & Instruments",
    description:
      "Engines, carburetor ice, ignition, electrical, propellers, and pitot-static, gyroscopic and compass instruments.",
    questionCount: 20,
    timeLimitMin: 30,
    filter: subj("Aircraft Systems", "Flight Instruments"),
    recommendedFor: ["student", "private", "complex", "high-performance"],
  }),
  topic({
    id: "navigation",
    code: "NAV",
    title: "Navigation & Charts",
    description:
      "Wind triangles, time-speed-distance, VOR and GPS, magnetic variation, sectional symbols and airspace depiction.",
    questionCount: 20,
    timeLimitMin: 35,
    filter: subj("Navigation", "Charts"),
    recommendedFor: ["student", "private", "cross-country"],
  }),
  topic({
    id: "aero",
    code: "AERO",
    title: "Aerodynamics",
    description:
      "Angle of attack, stalls and spins, load factor, left-turning tendencies, stability, wake turbulence and high-speed flight.",
    questionCount: 20,
    timeLimitMin: 30,
    filter: subj("Aerodynamics"),
    recommendedFor: ["student", "private", "commercial"],
  }),
  topic({
    id: "performance",
    code: "PERF",
    title: "Performance & Weight and Balance",
    description:
      "Density altitude, wind components, takeoff charts, hydroplaning, CG computation and weight shift.",
    questionCount: 15,
    timeLimitMin: 35,
    filter: subj("Performance", "Weight & Balance"),
    recommendedFor: ["student", "private", "commercial", "mountain"],
  }),
  topic({
    id: "human-factors",
    code: "HF",
    title: "Human Factors, ADM & Night",
    description:
      "Hypoxia, illusions, vision, fitness for flight, hazardous attitudes, risk management models and night operations.",
    questionCount: 20,
    timeLimitMin: 30,
    filter: subj("Human Factors", "ADM", "Night Operations"),
    recommendedFor: ["student", "private", "adm", "night"],
  }),
  topic({
    id: "atc-comms",
    code: "ATC",
    title: "ATC, Airspace & Airport Operations",
    description:
      "Airspace classes and VFR minimums, radio procedures, light signals, markings, signs and lighting.",
    questionCount: 20,
    timeLimitMin: 30,
    filter: subj("Radio & ATC", "Airport Operations", "Airspace"),
    recommendedFor: ["student", "private"],
  }),
];

/** The open-ended custom quiz (subjects and count chosen by the user). */
export const CUSTOM_EXAM: ExamDef = {
  id: "custom",
  code: "CUST",
  title: "Custom Quiz",
  category: "custom",
  description: "A quiz built from the subjects you selected.",
  questionCount: 20,
  timeLimitMin: 30,
  passPct: 70,
  filter: () => true,
  recommendedFor: [],
};

export const WRITTEN_EXAMS = EXAMS.filter((e) => e.category === "written");
export const TOPIC_EXAMS = EXAMS.filter((e) => e.category === "topic");

export function getExam(id: string): ExamDef | undefined {
  if (id === "custom") return CUSTOM_EXAM;
  return EXAMS.find((e) => e.id === id);
}

/** Questions in the pool of an exam definition. */
export function examPool(def: ExamDef, subjects?: readonly string[]): QuizQuestion[] {
  return QUESTION_BANK.filter(
    (q) => def.filter(q) && (!subjects || subjects.length === 0 || subjects.includes(q.subject)),
  );
}

/** Seconds per question used to size timed custom quizzes (about 1.5 min each). */
export const SECONDS_PER_QUESTION = 90;

export function shuffle<T>(arr: readonly T[], rand: () => number = Math.random): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const t = a[i]!;
    a[i] = a[j]!;
    a[j] = t;
  }
  return a;
}

/** Reorder a question's choices and remap the answer index. True/False keeps its order. */
export function shuffleChoices(q: QuizQuestion, rand: () => number = Math.random): QuizQuestion {
  const isTf = q.choices.length === 2 && q.choices[0] === "True" && q.choices[1] === "False";
  if (isTf) return { ...q };
  const order = shuffle(
    q.choices.map((_, i) => i),
    rand,
  );
  return { ...q, choices: order.map((i) => q.choices[i]!), answer: order.indexOf(q.answer) };
}

export interface BuildOptions {
  shuffleQuestions: boolean;
  shuffleAnswers: boolean;
  /** Number of questions (defaults to def.questionCount, capped at the pool size). */
  count?: number;
  /** Restrict to these subjects. */
  subjects?: readonly string[];
  /** Restrict to these question ids (used for "review missed questions"). */
  onlyIds?: readonly string[];
}

/**
 * Build a randomized exam. Questions whose id starts with def.primaryPrefix are drawn first, so a
 * level-specific exam always contains its level's questions before shared-topic questions.
 */
export function buildExam(def: ExamDef, opts: BuildOptions): QuizQuestion[] {
  let pool = examPool(def, opts.subjects);
  if (opts.onlyIds) {
    const set = new Set(opts.onlyIds);
    pool = pool.filter((q) => set.has(q.id));
  }
  const count = Math.max(1, Math.min(opts.count ?? def.questionCount, pool.length));
  let ordered = opts.shuffleQuestions ? shuffle(pool) : pool.slice();
  if (def.primaryPrefix) {
    const p = `${def.primaryPrefix}-`;
    ordered = [
      ...ordered.filter((q) => q.id.startsWith(p)),
      ...ordered.filter((q) => !q.id.startsWith(p)),
    ];
  }
  let picked = ordered.slice(0, count);
  if (opts.shuffleQuestions) picked = shuffle(picked);
  return opts.shuffleAnswers ? picked.map((q) => shuffleChoices(q)) : picked.map((q) => ({ ...q }));
}

/** Recommended lessons and labs per subject (for results screens and weak-area summaries). */
export const SUBJECT_TO_LESSON: Record<ExamSubject, { label: string; to: string }> = {
  Regulations: { label: "VFR Academy · Regulations", to: "/academy/vfr/regulations" },
  Airspace: { label: "VFR Academy · Airspace", to: "/academy/vfr/airspace" },
  Weather: { label: "VFR Academy · Weather", to: "/academy/vfr/weather" },
  "Weather Services": { label: "Weather Lab · METAR/TAF decoding", to: "/weather" },
  Aerodynamics: { label: "VFR Academy · Aerodynamics", to: "/academy/vfr/aerodynamics" },
  "Aircraft Systems": { label: "VFR Academy · Aircraft Systems", to: "/academy/vfr/systems" },
  "Flight Instruments": { label: "Avionics Lab · Flight instruments", to: "/avionics" },
  Performance: {
    label: "VFR Academy · Takeoffs & Landings (performance)",
    to: "/academy/vfr/takeoffs-landings",
  },
  "Weight & Balance": {
    label: "VFR Academy · Cross-Country Planning (W&B)",
    to: "/academy/vfr/cross-country",
  },
  Navigation: { label: "VFR Academy · Dead Reckoning", to: "/academy/vfr/dead-reckoning" },
  Charts: { label: "VFR Academy · Charts", to: "/academy/vfr/charts" },
  "Radio & ATC": { label: "VFR Academy · Radio Communications", to: "/academy/vfr/radio" },
  "Airport Operations": {
    label: "VFR Academy · Airport Operations",
    to: "/academy/vfr/airport-ops",
  },
  "Human Factors": { label: "VFR Academy · ADM & Human Factors", to: "/academy/vfr/adm" },
  ADM: { label: "VFR Academy · Aeronautical Decision-Making", to: "/academy/vfr/adm" },
  "IFR Procedures": { label: "IFR Academy · IFR Flight Planning", to: "/academy/ifr/planning" },
  "Instrument Approaches": {
    label: "IFR Academy · Instrument Approaches",
    to: "/academy/ifr/approaches",
  },
  "Fundamentals of Instructing": { label: "AI Instructor · Teaching review", to: "/instructor" },
  "Emergency Procedures": {
    label: "VFR Academy · Emergency Procedures",
    to: "/academy/vfr/emergencies",
  },
  "Night Operations": { label: "VFR Academy · Night Operations", to: "/academy/vfr/night" },
};

export function lessonFor(subject: string): { label: string; to: string } | undefined {
  return (SUBJECT_TO_LESSON as Record<string, { label: string; to: string } | undefined>)[subject];
}
