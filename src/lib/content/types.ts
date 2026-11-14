/**
 * Content model for the ground-school academies (VFR, IFR) and the shared question format
 * used by quizzes, knowledge checks, practice tests and written exams.
 */

export interface QuizQuestion {
  /** Globally unique, stable id (used for progress and "missed questions" review). */
  id: string;
  prompt: string;
  /** 2–4 choices. True/false questions use ["True", "False"]. */
  choices: string[];
  /** Index into choices. */
  answer: number;
  /** Why the correct answer is correct (and why common wrong answers are wrong). */
  explanation: string;
  /** Subject tag used for "performance by subject" reporting, e.g. "Weather". */
  subject: string;
  /** Optional reference, e.g. "14 CFR 91.155" or "PHAK Ch. 12". */
  reference?: string;
  /** Optional scenario/figure text shown above the prompt (METAR, chart excerpt, etc.). */
  context?: string;
  kind?: "mc" | "tf" | "scenario" | "calc" | "chart" | "weather";
}

export type CalloutTone = "info" | "tip" | "caution" | "warning";

export type LessonBlock =
  | { type: "h"; text: string }
  | { type: "p"; text: string }
  | { type: "list"; items: string[]; ordered?: boolean }
  | { type: "callout"; tone: CalloutTone; title?: string; text: string }
  | { type: "table"; headers: string[]; rows: string[][] }
  /** Named interactive diagram component (see src/components/academy/diagrams). */
  | { type: "diagram"; id: string; caption: string }
  /** Inline knowledge check. */
  | { type: "check"; question: QuizQuestion }
  /** Named interactive exercise component. */
  | { type: "exercise"; id: string; title: string }
  /** Link into another part of the platform (simulator, avionics lab, ATC...). */
  | { type: "practice"; to: string; label: string; text: string };

export interface Lesson {
  /** Unique id, convention: `${courseId}.${moduleId}.${n}` */
  id: string;
  title: string;
  minutes: number;
  objectives: string[];
  blocks: LessonBlock[];
}

export interface Flashcard {
  id: string;
  front: string;
  back: string;
}

export interface Module {
  id: string;
  number: number;
  title: string;
  summary: string;
  lessons: Lesson[];
  flashcards: Flashcard[];
  /** Final module quiz. */
  quiz: QuizQuestion[];
  /** Related hands-on practice in other parts of the platform. */
  practice: { to: string; label: string }[];
}

export interface Course {
  id: "vfr" | "ifr";
  title: string;
  description: string;
  modules: Module[];
}
