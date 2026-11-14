/**
 * TeachX practice question bank — unofficial study material, NOT actual FAA knowledge test
 * questions. See helpers.ts for the id-prefix scheme used to draw questions by certificate level.
 */
import type { QuizQuestion } from "@/lib/content/types";
import { PRIVATE_A } from "./private-a";
import { PRIVATE_B } from "./private-b";
import { INSTRUMENT } from "./instrument";
import { COMMERCIAL, ATP } from "./commercial-atp";
import { FOI, FIA, FII } from "./instructor";

export { EXAM_SUBJECTS, levelOf, type ExamSubject } from "./helpers";

export const QUESTION_BANK: QuizQuestion[] = [
  ...PRIVATE_A,
  ...PRIVATE_B,
  ...INSTRUMENT,
  ...COMMERCIAL,
  ...ATP,
  ...FOI,
  ...FIA,
  ...FII,
];

const BY_ID = new Map(QUESTION_BANK.map((q) => [q.id, q]));

export function getQuestion(id: string): QuizQuestion | undefined {
  return BY_ID.get(id);
}

/** Certificate levels encoded in question id prefixes. */
export const LEVELS = {
  par: "Private Pilot",
  ira: "Instrument Rating",
  cax: "Commercial Pilot",
  atm: "Airline Transport Pilot",
  foi: "Fundamentals of Instructing",
  fia: "Flight Instructor — Airplane",
  fii: "Flight Instructor — Instrument",
} as const;

export type LevelId = keyof typeof LEVELS;
