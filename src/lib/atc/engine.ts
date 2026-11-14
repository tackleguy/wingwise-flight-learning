/**
 * Scripted ATC session engine (pure, UI-agnostic).
 *
 *   const { session, events } = createSession({...});
 *   const r = submitTransmission(session, { text, mhz, busy, delaySec });
 *
 * The UI plays `events` (ATC/other-traffic transmissions via TTS, system notes) and passes
 * back what the pilot transmitted, on which frequency, and when. Difficulty controls hints,
 * coaching and curveballs; personality controls pace, verbosity and background chatter.
 */
import { buildContext, facilityOf, makeRng, pick, type Rng } from "./context";
import { blockedItem, buildReport, correctFrequencyItem, evaluateTransmission, scoreItems, summarize, timingItem, wrongFrequencyItem, type Expect } from "./evaluate";
import { freqEquals, formatFreqShort } from "./frequency";
import { alt, csPhrase, freq, hdg, letter, ph, PHONETIC, rwy, speakify } from "./phrase";
import { getScenario, SCENARIOS, type ScenarioDef, type Step } from "./scenarios";
import type { Difficulty, EvalItem, Facility, Personality, Phrase, ScenarioContext, SessionReport, TransmissionEval } from "./types";

export type EngineEvent =
  | { type: "atc"; facility: Facility; phrase: Phrase; delayMs: number }
  | { type: "traffic"; label: string; phrase: Phrase; delayMs: number; pitch: number }
  | { type: "system"; text: string; tone: "info" | "ok" | "caution" | "warning"; coaching?: boolean }
  | { type: "complete" };

export interface EngineSession {
  def: ScenarioDef;
  ctx: ScenarioContext;
  steps: Step[];
  index: number;
  attempts: number;
  difficulty: Difficulty;
  personality: Personality;
  evals: TransmissionEval[];
  done: boolean;
  seed: number;
  /** Increments every engine call (keeps rng deterministic but varied). */
  tick: number;
  hintsUsed: number;
}

export interface SessionOptions {
  scenarioId: string;
  airportIcao: string;
  aircraftId: string;
  callsign: string;
  difficulty: Difficulty;
  personality: Personality;
  seed?: number;
}

const capFirst = (p: Phrase): Phrase => ({
  text: p.text.charAt(0).toUpperCase() + p.text.slice(1),
  spoken: p.spoken.charAt(0).toUpperCase() + p.spoken.slice(1),
});

function rngFor(s: EngineSession): Rng {
  return makeRng(s.seed + s.tick * 7919);
}

export const HINT_LIMIT: Record<Difficulty, number> = { beginner: Infinity, intermediate: 3, advanced: 1, checkride: 0 };

function responseDelay(personality: Personality, rng: Rng): number {
  const base = { instructor: 1500, professional: 1100, busy: 650, examiner: 1250 }[personality];
  return base + Math.round(rng() * 500);
}

function chatterChance(s: EngineSession): number {
  if (s.personality === "busy") return 0.75;
  if (s.difficulty === "advanced" || s.difficulty === "checkride") return 0.35;
  return 0;
}

const OTHER_CALLSIGNS = ["N435LR", "N8KL", "N2219K", "N731SP", "N51MW", "N964CF"];
const AIRLINES = [
  { t: "Southwest 1422", s: "Southwest one four two two" },
  { t: "United 586", s: "United five eight six" },
  { t: "Alaska 312", s: "Alaska three one two" },
  { t: "SkyWest 4471", s: "SkyWest four four seven one" },
];

function chatter(s: EngineSession, f: Facility, rng: Rng): EngineEvent[] {
  const ctx = s.ctx;
  const otherCs = pick(rng, OTHER_CALLSIGNS);
  const o = { text: otherCs, spoken: otherCs.split("").map((c) => (/\d/.test(c) ? ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "niner"][Number(c)] : PHONETIC[c] ?? c)).join(" ") };
  const al = pick(rng, AIRLINES);
  const airline = { text: al.t, spoken: al.s };
  const ev = (label: string, phrase: Phrase, delayMs: number, pitch: number): EngineEvent => ({ type: "traffic", label, phrase: { text: phrase.text, spoken: speakify(phrase.spoken) }, delayMs, pitch });
  switch (f.key) {
    case "ground":
    case "clearance":
      return [
        ev(f.name, ph`${o}, ${f.name}, runway ${rwy(ctx.runway.id)}, taxi via ${letter(ctx.taxiRoute[0] ?? "A")}.`, 500, 1),
        ev("Other aircraft", ph`Runway ${rwy(ctx.runway.id)}, taxi via ${letter(ctx.taxiRoute[0] ?? "A")}, ${o}.`, 600, 1.25),
      ];
    case "tower":
    case "ctaf":
      return pick(rng, [
        [ev(f.name, ph`${o}, runway ${rwy(ctx.runway.id)}, cleared to land.`, 500, 1), ev("Other aircraft", ph`Cleared to land runway ${rwy(ctx.runway.id)}, ${o}.`, 600, 0.85)],
        [ev(f.name, ph`${airline}, runway ${rwy(ctx.runway.id)}, cleared for takeoff.`, 500, 1), ev("Other aircraft", ph`Cleared for takeoff runway ${rwy(ctx.runway.id)}, ${airline}.`, 600, 0.8)],
      ]);
    default:
      return pick(rng, [
        [ev(f.name, ph`${airline}, contact ${facilityOf(ctx, "center").name} ${freq(facilityOf(ctx, "center").mhz)}.`, 500, 1), ev("Other aircraft", ph`Over to Center, ${airline}.`, 600, 0.8)],
        [ev(f.name, ph`${o}, traffic ten o'clock, 3 miles, northbound, altitude indicates ${alt(5500)}.`, 500, 1), ev("Other aircraft", ph`Looking, ${o}.`, 600, 1.2)],
        [ev(f.name, ph`${airline}, descend and maintain ${alt(7000)}.`, 500, 1), ev("Other aircraft", ph`Down to ${alt(7000)}, ${airline}.`, 600, 0.85)],
      ]);
  }
}

function atcEvent(s: EngineSession, f: Facility, phrase: Phrase, delayMs: number): EngineEvent {
  return { type: "atc", facility: f, phrase: capFirst({ text: phrase.text, spoken: speakify(phrase.spoken) }), delayMs };
}

/** Emit the opening of the current step (situation, chatter, ATC prompt). */
function openStep(s: EngineSession, events: EngineEvent[], firstDelay: number) {
  const step = s.steps[s.index];
  if (!step) return;
  const rng = rngFor(s);
  const f = facilityOf(s.ctx, step.facility);
  if (step.situation) events.push({ type: "system", text: step.situation(s.ctx), tone: "info" });
  if (step.prompt) {
    if (rng() < chatterChance(s)) events.push(...chatter(s, f, rng));
    const phrase = step.prompt(s.ctx);
    events.push(atcEvent(s, f, phrase, firstDelay));
    s.ctx = { ...s.ctx, abbrevBy: { ...s.ctx.abbrevBy, [step.facility]: true } };
  } else if (s.difficulty === "beginner") {
    events.push({ type: "system", text: `Your call: ${step.title}. Transmit on ${f.name} ${formatFreqShort(f.mhz)}.`, tone: "info", coaching: true });
  } else if (s.index > 0) {
    events.push({ type: "system", text: `Your call: ${step.title}.`, tone: "info" });
  }
}

export function createSession(o: SessionOptions): { session: EngineSession; events: EngineEvent[] } {
  const def = getScenario(o.scenarioId) ?? (SCENARIOS[0] as ScenarioDef);
  const seed = o.seed ?? (Date.now() % 2147483647);
  const base = buildContext({
    airportIcao: o.airportIcao,
    aircraftId: o.aircraftId,
    callsign: o.callsign,
    rules: def.rules,
    seed,
    ...(def.contextOptions?.preferIls ? { preferIls: true } : {}),
    ...(def.contextOptions?.ifrWeather ? { ifrWeather: true } : {}),
  });
  const ctx = def.init(base);
  const session: EngineSession = {
    def,
    ctx,
    steps: def.steps(ctx, o.difficulty),
    index: 0,
    attempts: 0,
    difficulty: o.difficulty,
    personality: o.personality,
    evals: [],
    done: false,
    seed,
    tick: 0,
    hintsUsed: 0,
  };
  const events: EngineEvent[] = [];
  events.push({ type: "system", text: `SIMULATED ATC — ${def.title} at ${ctx.airport.icao}. Training only, not real air traffic control.`, tone: "caution" });
  openStep(session, events, 900);
  return { session, events };
}

export function currentStep(s: EngineSession): Step | null {
  return s.done ? null : s.steps[s.index] ?? null;
}

export function expectedFacility(s: EngineSession): Facility | null {
  const st = currentStep(s);
  return st ? facilityOf(s.ctx, st.facility) : null;
}

export function stepExample(s: EngineSession): Phrase | null {
  const st = currentStep(s);
  return st ? capFirst(st.example(s.ctx)) : null;
}

export function stepHint(s: EngineSession): string {
  const st = currentStep(s);
  return st ? st.hint(s.ctx) : "";
}

/** Checklist of what the current transmission must contain (for the hints panel). */
export function stepChecklist(s: EngineSession, withValues: boolean): string[] {
  const st = currentStep(s);
  if (!st) return [];
  const ctx = s.ctx;
  const allowed = !!ctx.abbrevBy[st.facility];
  const out: string[] = [];
  const v = (label: string, value: string) => (withValues ? `${label}: ${value}` : label);
  for (const e of st.expects(ctx) as Expect[]) {
    switch (e.kind) {
      case "station":
        out.push(v("Call the facility", e.facility.name));
        break;
      case "atis":
        out.push(v("ATIS code", `information ${PHONETIC[e.letter] ?? e.letter}`));
        break;
      case "runway":
        out.push(v(e.readback ? "Read back the runway" : "Runway", `runway ${rwy(e.runway).text}`));
        break;
      case "holdShort":
        out.push(v("Read back hold short", `hold short runway ${rwy(e.runway).text}`));
        break;
      case "altitude":
        out.push(v(e.label ?? (e.readback ? "Read back the altitude" : "Altitude"), alt(e.ft).text));
        break;
      case "heading":
        out.push(v(e.readback ? "Read back the heading" : "Heading", e.deg === "runway" ? "runway heading" : `${e.turn ? `${e.turn} ` : ""}heading ${hdg(e.deg).text}`));
        break;
      case "frequency":
        out.push(v(e.readback ? "Read back the frequency" : "Frequency", formatFreqShort(e.mhz)));
        break;
      case "squawk":
        out.push(v("Read back the squawk", e.code));
        break;
      case "altimeter":
        out.push(v("Altimeter", e.inHg.toFixed(2)));
        break;
      case "phrase":
        out.push(withValues && e.say ? `${e.label}: “${e.say}”` : e.label);
        break;
      case "number":
        out.push(v(e.label, String(e.value)));
        break;
      case "maxWords":
        out.push("Keep it short");
        break;
    }
  }
  out.push(v("Your callsign", allowed && ctx.cs.canAbbreviate ? `${ctx.cs.abbrev} (ATC abbreviated it)` : ctx.cs.full));
  return out;
}

export function consumeHint(s: EngineSession): { session: EngineSession; allowed: boolean } {
  const limit = HINT_LIMIT[s.difficulty];
  if (s.hintsUsed >= limit) return { session: s, allowed: false };
  return { session: { ...s, hintsUsed: s.hintsUsed + 1 }, allowed: true };
}

export interface TransmitInput {
  text: string;
  /** Frequency the pilot transmitted on. */
  mhz: number;
  /** The frequency was busy (someone else transmitting) when the pilot keyed the mic. */
  busy: boolean;
  /** Seconds between the end of the last ATC transmission and the pilot keying the mic. */
  delaySec: number | null;
  at?: number;
}

function makeEval(s: EngineSession, step: Step, text: string, items: EvalItem[], delaySec: number | null, at: number): TransmissionEval {
  const f = facilityOf(s.ctx, step.facility);
  return {
    id: `${step.id}-${s.evals.length + 1}`,
    stepId: step.id,
    stepTitle: step.title,
    station: f.name,
    text,
    attempt: s.attempts + 1,
    score: scoreItems(items, s.personality),
    items,
    delaySec,
    example: capFirst(step.example(s.ctx)).text,
    summary: summarize(items),
    at,
  };
}

function coachingText(ev: TransmissionEval, accepted: boolean): string {
  const bad = ev.items.filter((i) => !i.ok);
  if (!bad.length) return "✓ Good transmission.";
  const lines = bad.slice(0, 4).map((i) => `• ${i.message}`);
  return `${accepted ? "Accepted, with notes:" : "Not quite:"}\n${lines.join("\n")}\nCorrect: “${ev.example}”`;
}

export function submitTransmission(s0: EngineSession, input: TransmitInput): { session: EngineSession; events: EngineEvent[]; evaluation: TransmissionEval | null } {
  const s: EngineSession = { ...s0, tick: s0.tick + 1, evals: [...s0.evals] };
  const events: EngineEvent[] = [];
  const step = currentStep(s);
  const text = input.text.trim();
  const at = input.at ?? Date.now();
  if (!step || !text) return { session: s0, events, evaluation: null };
  const rng = rngFor(s);
  const f = facilityOf(s.ctx, step.facility);
  const coach = s.difficulty === "beginner";
  const explain = s.difficulty !== "checkride";

  // 1. Wrong frequency: nobody hears you.
  if (!freqEquals(input.mhz, f.mhz)) {
    const ev = makeEval(s, step, text, [wrongFrequencyItem(f, input.mhz)], null, at);
    s.evals.push(ev);
    const known = Object.values(s.ctx.facilities).find((x) => x && freqEquals(x.mhz, input.mhz));
    events.push({
      type: "system",
      tone: "warning",
      text:
        s.difficulty === "checkride"
          ? "No response."
          : coach
            ? `No response — you transmitted on ${formatFreqShort(input.mhz)}${known ? ` (${known.name})` : ""}. This call is for ${f.name} on ${formatFreqShort(f.mhz)}: set it in STBY and press ⇆.`
            : `No response on ${formatFreqShort(input.mhz)}. Check your frequency.`,
    });
    return { session: s, events, evaluation: ev };
  }

  // 2. Blocked (stepped on someone).
  if (input.busy) {
    const ev = makeEval(s, step, text, [blockedItem()], null, at);
    s.evals.push(ev);
    events.push({
      type: "system",
      tone: "warning",
      text: explain ? "Blocked — you keyed the mic while another station was transmitting. Wait for a break, then call again." : "Your transmission was blocked (frequency busy).",
    });
    return { session: s, events, evaluation: ev };
  }

  // 3. Evaluate content.
  const allowed = !!s.ctx.abbrevBy[step.facility];
  const { items } = evaluateTransmission({ text, expects: step.expects(s.ctx), cs: s.ctx.cs, abbreviatedAllowed: allowed, kind: step.kind, personality: s.personality });
  items.push(correctFrequencyItem(f));
  const useDelay = !!step.prompt || s.attempts > 0;
  const t = timingItem(useDelay ? input.delaySec : null, s.difficulty, !!step.urgent);
  if (t) items.push(t);
  const ev = makeEval(s, step, text, items, useDelay ? input.delaySec : null, at);
  s.evals.push(ev);

  const failedCritical = items.filter((i) => !i.ok && i.severity === "critical" && !i.categories.includes("timing"));
  const delay = responseDelay(s.personality, rng);
  const cs = csPhrase(s.ctx.cs, allowed);

  if (failedCritical.length && s.attempts < 2) {
    // ATC corrects; the step stays open.
    s.attempts += 1;
    const custom = step.retryPrompt?.(s.ctx, failedCritical) ?? null;
    let correction: Phrase;
    if (custom) correction = custom;
    else if (failedCritical.some((i) => i.label === "Callsign")) correction = step.prompt ? ph`Station reading back, say callsign.` : ph`Aircraft calling ${f.name}, say again callsign.`;
    else if (step.prompt) {
      const frags = failedCritical.map((i) => i.correct).filter((x): x is string => !!x);
      correction = ph`${cs}, negative, ${frags.join(", ") || "I say again"}.`;
      if (!frags.length && step.prompt) correction = ph`${cs}, I say again: ${step.prompt(s.ctx)}`;
    } else correction = ph`${cs}, say again.`;
    events.push(atcEvent(s, f, correction, delay));
    if (coach) events.push({ type: "system", tone: "caution", text: coachingText(ev, false), coaching: true });
    else if (s.difficulty === "intermediate") events.push({ type: "system", tone: "caution", text: `Critical: ${failedCritical[0]?.message ?? ""}`, coaching: true });
    return { session: s, events, evaluation: ev };
  }

  // Accepted (or retries exhausted).
  if (failedCritical.length) {
    events.push({ type: "system", tone: "info", text: explain ? `Moving on — this exchange will be reviewed in your report.${coach ? ` Correct: “${ev.example}”` : ""}` : "Moving on." });
  } else if (coach) {
    events.push({ type: "system", tone: ev.items.some((i) => !i.ok) ? "caution" : "ok", text: coachingText(ev, true), coaching: true });
  }

  // Follow-ups for missing items (e.g. ATIS not reported).
  const notes = (step.missingNotes ?? []).filter((n) => items.some((i) => i.label === n.label && !i.ok));
  for (const n of notes) events.push(atcEvent(s, f, n.atc(s.ctx), delay));

  s.ctx = step.apply ? step.apply(s.ctx, ev) : s.ctx;
  const closing = step.closing?.(s.ctx) ?? null;
  if (closing) {
    events.push(atcEvent(s, f, closing, notes.length ? 700 : delay));
    s.ctx = { ...s.ctx, abbrevBy: { ...s.ctx.abbrevBy, [step.facility]: true } };
  }
  s.index += 1;
  s.attempts = 0;
  if (s.index >= s.steps.length) {
    s.done = true;
    events.push({ type: "system", tone: "ok", text: "Scenario complete. Generating your communication report…" });
    events.push({ type: "complete" });
  } else {
    openStep(s, events, closing || notes.length ? 1400 : delay);
  }
  return { session: s, events, evaluation: ev };
}

export function sessionReport(s: EngineSession): SessionReport {
  return buildReport(s.evals);
}

/** Facilities in the order they appear in the scenario (for the progress rail). */
export function stepFacilities(s: EngineSession): { id: string; title: string; facility: Facility; atcFirst: boolean }[] {
  return s.steps.map((st) => ({ id: st.id, title: st.title, facility: facilityOf(s.ctx, st.facility), atcFirst: !!st.prompt }));
}
