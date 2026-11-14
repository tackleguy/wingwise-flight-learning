/**
 * Oral exam grading.
 *
 * Rubric grading always runs (keyword/concept coverage, weighted). When an AI provider is
 * available, the examiner's AI assessment is requested as strict JSON, validated, and BLENDED with
 * the rubric score — the AI can never move a score more than ±20 points away from the rubric, so a
 * misbehaving model can't award or deny credit on its own.
 */
import { aiChat } from "@/lib/ai/client";
import type { OralQuestion, RubricConcept } from "./types";

export function normalizeText(s: string): string {
  return (
    " " +
    s
      .toLowerCase()
      .replace(/(\d),(\d)/g, "$1$2")
      .replace(/['’]/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim() +
    " "
  );
}

const reCache = new Map<string, RegExp>();
function keywordRegex(kw: string): RegExp {
  const cached = reCache.get(kw);
  if (cached) return cached;
  const words = kw
    .toLowerCase()
    .replace(/(\d),(\d)/g, "$1$2")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9*]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .map((w) =>
      w.endsWith("*")
        ? `${w.slice(0, -1).replace(/[^a-z0-9]/g, "")}[a-z0-9]*`
        : w.replace(/[^a-z0-9]/g, ""),
    );
  const re = new RegExp(` ${words.join(" ")} `);
  reCache.set(kw, re);
  return re;
}

export function conceptHit(concept: RubricConcept, normalized: string): boolean {
  return concept.keywords.some((k) => keywordRegex(k).test(normalized));
}

const NON_ANSWER =
  /^ (i dont know|i do not know|idk|not sure|no idea|pass|skip|dunno|i forget|i forgot|unsure)( |$)/;

export function isNonAnswer(text: string): boolean {
  const n = normalizeText(text);
  const words = n.trim().split(" ").filter(Boolean).length;
  return words === 0 || (words <= 5 && NON_ANSWER.test(n));
}

export interface RubricResult {
  hits: Set<string>;
  missing: RubricConcept[];
  /** 0–1 weighted coverage */
  coverage: number;
}

export function evaluateRubric(
  q: OralQuestion,
  text: string,
  already?: ReadonlySet<string>,
): RubricResult {
  const n = normalizeText(text);
  const nonAnswer = isNonAnswer(text);
  const hits = new Set<string>(already ?? []);
  if (!nonAnswer) for (const c of q.concepts) if (conceptHit(c, n)) hits.add(c.id);
  const total = q.concepts.reduce((a, c) => a + c.weight, 0) || 1;
  const got = q.concepts.filter((c) => hits.has(c.id)).reduce((a, c) => a + c.weight, 0);
  return { hits, missing: q.concepts.filter((c) => !hits.has(c.id)), coverage: got / total };
}

/**
 * Combined score after an optional follow-up. Concepts first covered in the follow-up earn 75%
 * credit — the examiner had to prompt for them.
 */
export function rubricScore(
  q: OralQuestion,
  firstHits: ReadonlySet<string>,
  followHits?: ReadonlySet<string>,
): number {
  const total = q.concepts.reduce((a, c) => a + c.weight, 0) || 1;
  let got = 0;
  for (const c of q.concepts) {
    if (firstHits.has(c.id)) got += c.weight;
    else if (followHits?.has(c.id)) got += c.weight * 0.75;
  }
  return Math.round((got / total) * 100);
}

export type Verdict = "satisfactory" | "partial" | "unsatisfactory";

export function verdictFor(score: number): Verdict {
  return score >= 75 ? "satisfactory" : score >= 35 ? "partial" : "unsatisfactory";
}

/** Choose the authored follow-up that best targets the missing concepts. */
export function pickFollowUp(q: OralQuestion, missing: RubricConcept[]): string {
  const missingIds = new Set(missing.map((m) => m.id));
  let best: { question: string; overlap: number } | null = null;
  for (const f of q.followUps) {
    const overlap = f.targets.filter((t) => missingIds.has(t)).length;
    if (overlap > 0 && (!best || overlap > best.overlap)) best = { question: f.question, overlap };
  }
  if (best) return best.question;
  const labels = missing
    .slice()
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 2)
    .map((m) => m.label.toLowerCase());
  return `You haven't covered ${labels.join(" or ")}. Can you tell me about that?`;
}

// ───────────── AI assessment (optional) ─────────────

export interface AiAssessment {
  score: number;
  missing: string[];
  feedback: string;
  followUp: string;
  provider: string;
}

function extractJson(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1)) as unknown;
  } catch {
    return null;
  }
}

function clean(s: string, max: number): string {
  return s.replace(/\s+/g, " ").replace(/[<>]/g, "").trim().slice(0, max);
}

export function parseAiAssessment(text: string, provider: string): AiAssessment | null {
  const raw = extractJson(text);
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const scoreNum =
    typeof r["score"] === "number"
      ? r["score"]
      : typeof r["score"] === "string"
        ? Number(r["score"])
        : NaN;
  if (!Number.isFinite(scoreNum)) return null;
  const missing = Array.isArray(r["missing"])
    ? r["missing"]
        .filter((m): m is string => typeof m === "string")
        .map((m) => clean(m, 80))
        .filter(Boolean)
        .slice(0, 5)
    : [];
  const feedback = typeof r["feedback"] === "string" ? clean(r["feedback"], 500) : "";
  const fu = typeof r["followUp"] === "string" ? clean(r["followUp"], 220) : "";
  return {
    score: Math.max(0, Math.min(100, Math.round(scoreNum))),
    missing,
    feedback,
    followUp: fu.endsWith("?") && fu.length > 10 ? fu : "",
    provider,
  };
}

const AI_TIMEOUT_MS = 12_000;

export async function aiAssess(
  q: OralQuestion,
  transcript: { question: string; answer: string }[],
): Promise<AiAssessment | null> {
  const system = [
    "You are an FAA designated pilot examiner conducting a SIMULATED oral exam for training (not an official test).",
    "Grade the applicant's answer(s) to the question against the reference answer and key concepts.",
    "Be fair but rigorous; do not award credit for concepts the applicant did not state.",
    'Respond ONLY with a JSON object: {"score": <0-100 integer>, "missing": [<short concept names>], "feedback": "<1-3 sentences addressed to the applicant>", "followUp": "<one short probing question, or empty string>"}',
  ].join(" ");
  const user = [
    `QUESTION: ${q.question}`,
    q.scenario ? `SCENARIO: ${q.scenario}` : "",
    `KEY CONCEPTS: ${q.concepts.map((c) => c.label).join("; ")}`,
    `REFERENCE ANSWER: ${q.modelAnswer}`,
    ...transcript.map(
      (t, i) =>
        `${i === 0 ? "APPLICANT ANSWER" : `FOLLOW-UP "${t.question}" — APPLICANT ANSWER`}: ${t.answer.slice(0, 2000)}`,
    ),
  ]
    .filter(Boolean)
    .join("\n");
  try {
    const res = await Promise.race([
      aiChat({
        service: "oral",
        system,
        messages: [{ role: "user", content: user }],
        json: true,
        temperature: 0.2,
      }),
      new Promise<{ ok: false; reason: string }>((resolve) =>
        setTimeout(() => resolve({ ok: false, reason: "timeout" }), AI_TIMEOUT_MS),
      ),
    ]);
    if (!res.ok) return null;
    return parseAiAssessment(res.text, res.provider);
  } catch {
    return null;
  }
}

/** Blend rubric and AI scores: 60/40 weighting, bounded to ±20 of the rubric score. */
export function blendScores(rubric: number, ai: AiAssessment | null): number {
  if (!ai) return rubric;
  const blended = Math.round(0.6 * rubric + 0.4 * ai.score);
  return Math.max(0, Math.min(100, Math.max(rubric - 20, Math.min(rubric + 20, blended))));
}
