/**
 * Tailored AI service helpers. Each builds a focused system prompt and calls `aiChat` with
 * the right service id (so the server applies that service's guardrails). All return
 * `AiChatResult` (or parsed JSON) and callers must keep their scripted fallback.
 */
import { aiChat, type AiChatResult, type AiMessage } from "./client";

/** Extract and parse the first JSON object in a model response (tolerates code fences). */
export function parseJsonObject<T = Record<string, unknown>>(text: string): T | null {
  const cleaned = text.replace(/```(?:json)?/gi, "").trim();
  const start = cleaned.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < cleaned.length; i++) {
    const c = cleaned[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) {
        try {
          const v: unknown = JSON.parse(cleaned.slice(start, i + 1));
          return v && typeof v === "object" && !Array.isArray(v) ? (v as T) : null;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

// ---------------- ATC controller ----------------

export interface AtcControllerInput {
  /** Scenario state (airport, runway, frequencies, position, altitude, clearance …) */
  state: Record<string, unknown>;
  difficulty: "beginner" | "intermediate" | "advanced" | "checkride";
  personality: "instructor" | "professional" | "busy" | "examiner";
  goal: string;
  /** Conversation so far: pilot = user, controller = assistant. */
  history: AiMessage[];
}

const PERSONALITY_STYLE: Record<AtcControllerInput["personality"], string> = {
  instructor: "Patient and clear, slightly slower; occasionally adds 'good day' or brief courtesy. Still standard phraseology.",
  professional: "Standard, by-the-book FAA phraseology at normal pace.",
  busy: "Terse and fast like a busy tower/approach. Minimal words. May say 'standby' when appropriate.",
  examiner: "Precise and formal. Corrects every readback error immediately with 'negative' and the correct instruction.",
};

const DIFFICULTY_STYLE: Record<AtcControllerInput["difficulty"], string> = {
  beginner: "Keep instructions simple (one or two items per transmission). Always provide a helpful 'hint' with the exact phraseology the pilot should use next.",
  intermediate: "Realistic instructions. Provide a short 'hint' only if the pilot made an error.",
  advanced: "Realistic and occasionally add an unexpected but plausible change (runway change, amended altitude, traffic advisory, frequency change, weather update). Hints only after errors.",
  checkride: "Realistic. Set 'hint' to an empty string always. Still evaluate every pilot transmission.",
};

export function atcControllerSystem(i: Omit<AtcControllerInput, "history">): string {
  return `You are role-playing SIMULATED air traffic control for radio practice. The pilot's transmissions arrive as user messages.

SCENARIO GOAL: ${i.goal}
CONTROLLER STYLE: ${PERSONALITY_STYLE[i.personality]}
TRAINING MODE: ${DIFFICULTY_STYLE[i.difficulty]}

CURRENT SCENARIO STATE (authoritative JSON — only use runways, stations and frequencies listed here):
${JSON.stringify(i.state, null, 1)}

Rules:
- Answer as the station the pilot is tuned to ("currentStation"). If the pilot calls the wrong facility, reply as that facility would (e.g. "contact Ground on 121.6") or not at all (set transmission to "").
- Use FAA phraseology. Address the aircraft by callsign; use the abbreviated form only after you've used the full one on this frequency.
- Issue realistic, scenario-consistent instructions that move toward the goal. Read-back errors: respond "negative" with the correct instruction.
- Never put coaching in "transmission". Never claim to be real ATC.
- altitudes in feet MSL, headings 001-360, squawk 4 octal digits, frequencies only from the state.

Reply with JSON exactly in this shape:
{"station":"<station name>","transmission":"<what the controller says, or empty>","stateUpdates":{"position":"","altitude":0,"heading":0,"runway":"","frequency":0,"currentStation":"","squawk":"","clearance":{"limit":"","route":"","altitude":0,"expectAltitude":0,"departureFrequency":0,"squawk":""},"phase":""},"evaluation":{"score":0,"issues":["<specific phraseology/readback issue with the correct phrase>"]},"hint":"<what the pilot should say next, or empty>"}
Only include stateUpdates fields that changed. evaluation.score is 0-100 for the pilot's LAST transmission.`;
}

export function atcController(i: AtcControllerInput): Promise<AiChatResult> {
  return aiChat({ service: "atc", system: atcControllerSystem(i), messages: i.history, temperature: 0.3, json: true });
}

// ---------------- flight instructor ----------------

export interface InstructorInput {
  question: string;
  level: "simple" | "advanced";
  /** What the app knows about the student (goal, weak areas, last flight…). */
  context: string;
  history: AiMessage[];
}

export function flightInstructor(i: InstructorInput): Promise<AiChatResult> {
  const system = `You are TeachX's AI flight instructor (ground-school style), helping a pilot in training.
Explanation level: ${i.level === "simple" ? "SIMPLE — plain language, short paragraphs, an everyday analogy, avoid jargon or define it." : "ADVANCED — precise technical detail, regulation/AIM references, numbers, edge cases and common checkride follow-up questions."}
Student context (use it to personalise, don't repeat it back verbatim):
${i.context || "No training data yet."}
Format: Markdown with short paragraphs, **bold** key terms, and bullet or numbered lists where helpful. Keep it under ~350 words unless asked for more.
Always end with exactly this line on its own: "_Educational explanation only — consult current FAA publications, the POH/AFM and a CFI for real-world operations._"`;
  return aiChat({ service: "instructor", system, messages: [...i.history.slice(-12), { role: "user", content: i.question }], temperature: 0.4 });
}

// ---------------- oral examiner ----------------

export interface OralExaminerInput {
  certificate: string;
  level: "beginner" | "standard" | "advanced" | "checkride";
  /** Optional ACS area/topic to focus on. */
  focus?: string;
  history: AiMessage[];
}

export function oralExaminer(i: OralExaminerInput): Promise<AiChatResult> {
  const system = `You are a SIMULATED designated pilot examiner giving a practice oral exam for the ${i.certificate} (FAA ACS-based).
Difficulty: ${i.level}. ${i.focus ? `Focus area: ${i.focus}.` : "Cover a representative mix of ACS areas."}
Ask ONE question at a time. When the applicant answers, briefly grade it (satisfactory / needs work, with the key missing points) and then ask the next question — scenario-based follow-ups are encouraged.
${i.level === "checkride" ? "Do not teach during the exam; give feedback only when asked for the debrief." : "Give concise teaching points after each answer."}
This is practice only, not an official FAA evaluation.`;
  return aiChat({ service: "oral", system, messages: i.history.length ? i.history : [{ role: "user", content: "I'm ready to begin." }], temperature: 0.5 });
}

// ---------------- scenario generator ----------------

export interface GeneratedScenario {
  title: string;
  situation: string;
  questions: string[];
  teachingPoints: string[];
}

export async function scenarioGenerator(i: { topic: string; level: string; certificate?: string }): Promise<{ ok: true; scenario: GeneratedScenario; provider: string } | { ok: false; reason: string }> {
  const system = `Create ONE realistic, SIMULATED training scenario for a ${i.certificate ?? "pilot in training"} at ${i.level} level about: ${i.topic}.
Return JSON: {"title":"","situation":"<4-6 sentences, concrete numbers (weather, altitudes, fuel) where relevant>","questions":["<3-4 decision questions>"],"teachingPoints":["<3-5 key points with FAA references>"]}`;
  const r = await aiChat({ service: "scenario", system, messages: [{ role: "user", content: `Scenario topic: ${i.topic}` }], temperature: 0.8, json: true });
  if (!r.ok) return r;
  const j = parseJsonObject<Partial<GeneratedScenario>>(r.text);
  if (!j || typeof j.title !== "string" || typeof j.situation !== "string") return { ok: false, reason: "The AI returned an unexpected format." };
  const arr = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, 6) : []);
  return { ok: true, provider: r.provider, scenario: { title: j.title.slice(0, 120), situation: j.situation.slice(0, 1200), questions: arr(j.questions), teachingPoints: arr(j.teachingPoints) } };
}

// ---------------- answer evaluator ----------------

export interface AnswerEvaluation {
  /** 0–100 */
  score: number;
  feedback: string;
  missing: string[];
}

export async function answerEvaluator(i: { question: string; reference: string; answer: string; rubric?: string }): Promise<{ ok: true; evaluation: AnswerEvaluation; provider: string } | { ok: false; reason: string }> {
  const system = `Grade the student's answer to an aviation knowledge question.
Question: ${i.question}
Reference answer: ${i.reference}
${i.rubric ? `Rubric: ${i.rubric}` : "Rubric: accuracy and completeness of the key points in the reference answer; penalise incorrect statements."}
Return JSON: {"score":<0-100>,"feedback":"<2-3 sentences, specific>","missing":["<key point missing or wrong>"]}`;
  const r = await aiChat({ service: "evaluate", system, messages: [{ role: "user", content: `Student answer: ${i.answer.slice(0, 4000)}` }], temperature: 0.1, json: true });
  if (!r.ok) return r;
  const j = parseJsonObject<{ score?: unknown; feedback?: unknown; missing?: unknown }>(r.text);
  if (!j || typeof j.score !== "number") return { ok: false, reason: "The AI returned an unexpected format." };
  return {
    ok: true,
    provider: r.provider,
    evaluation: {
      score: Math.max(0, Math.min(100, Math.round(j.score))),
      feedback: typeof j.feedback === "string" ? j.feedback.slice(0, 800) : "",
      missing: Array.isArray(j.missing) ? j.missing.filter((x): x is string => typeof x === "string").slice(0, 8) : [],
    },
  };
}
