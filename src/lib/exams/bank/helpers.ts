/**
 * Helpers for authoring the TeachX practice question bank.
 *
 * IMPORTANT: every question in this bank is original, unofficial study material written from
 * FAA source documents (14 CFR, AIM, PHAK, AFH, IFH, AIH, AC 00-45). None of it is taken from,
 * or represents, actual FAA knowledge-test questions.
 *
 * Id prefixes identify the certificate level a question was written for:
 *   par- private · ira- instrument · cax- commercial · atm- ATP
 *   foi- fundamentals of instructing · fia- flight instructor (airplane) · fii- CFII
 */
import type { QuizQuestion } from "@/lib/content/types";

export const EXAM_SUBJECTS = [
  "Regulations",
  "Airspace",
  "Weather",
  "Weather Services",
  "Aerodynamics",
  "Aircraft Systems",
  "Flight Instruments",
  "Performance",
  "Weight & Balance",
  "Navigation",
  "Charts",
  "Radio & ATC",
  "Airport Operations",
  "Human Factors",
  "ADM",
  "IFR Procedures",
  "Instrument Approaches",
  "Fundamentals of Instructing",
  "Emergency Procedures",
  "Night Operations",
] as const;

export type ExamSubject = (typeof EXAM_SUBJECTS)[number];

export type QuestionKind = NonNullable<QuizQuestion["kind"]>;

export const TF = ["True", "False"];

/** Build a question. `answer` is the index of the correct choice. */
export function q(
  id: string,
  subject: ExamSubject,
  kind: QuestionKind,
  prompt: string,
  choices: string[],
  answer: number,
  explanation: string,
  extra?: { ref?: string; ctx?: string },
): QuizQuestion {
  const out: QuizQuestion = { id, subject, kind, prompt, choices, answer, explanation };
  if (extra?.ref) out.reference = extra.ref;
  if (extra?.ctx) out.context = extra.ctx;
  return out;
}

/** Level prefix of a question id ("par", "ira", ...). */
export function levelOf(id: string): string {
  return id.split("-")[0] ?? "";
}
