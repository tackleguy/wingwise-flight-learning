/**
 * Transmission & session evaluation for simulated ATC training.
 *
 * Each pilot transmission is parsed (see normalize.ts) and checked against the elements the
 * current step expects (callsign, station, ATIS, runway, hold short, altitude, heading,
 * frequency, squawk, phrases …) plus universal phraseology checks. Every mistake carries an
 * explanation and the correct phraseology so the report teaches, not just grades.
 *
 * References used in messages: AIM Chapter 4 (4-2 Radio Communications Phraseology,
 * 4-3-18 taxiing, 4-4-7 readbacks), Pilot/Controller Glossary, FAA JO 7110.65.
 */
import { freqEquals, formatFreqShort } from "./frequency";
import {
  countPhrase,
  hasAny,
  hasPhrase,
  mentionsRunwayNumber,
  parseTransmission,
  readAltimeters,
  readAltitudes,
  readAtisLetters,
  readCallsign,
  readFrequencies,
  readHeadings,
  readRunways,
  readSquawks,
  type ParsedTransmission,
} from "./normalize";
import { fmtAlt, PHONETIC, usRunway } from "./phrase";
import {
  CATEGORY_LABEL,
  CATEGORY_ORDER,
  SEVERITY_WEIGHT,
  type Category,
  type CallsignInfo,
  type Difficulty,
  type EvalItem,
  type Facility,
  type Personality,
  type SessionReport,
  type Severity,
  type TransmissionEval,
} from "./types";

export type StepKind = "initial" | "request" | "readback" | "report" | "acknowledge";

export type Expect =
  | { kind: "station"; facility: Facility }
  | { kind: "atis"; letter: string; severity?: Severity }
  | { kind: "runway"; runway: string; readback: boolean; severity?: Severity; say?: string }
  | { kind: "holdShort"; runway: string; say?: string }
  | {
      kind: "altitude";
      ft: number;
      readback: boolean;
      label?: string;
      severity?: Severity;
      say?: string;
      tolerance?: number;
    }
  | {
      kind: "heading";
      deg: number | "runway";
      turn?: "left" | "right";
      readback: boolean;
      severity?: Severity;
      say?: string;
      tolerance?: number;
    }
  | { kind: "frequency"; mhz: number; readback: boolean; severity?: Severity; say?: string }
  | { kind: "squawk"; code: string; severity?: Severity; say?: string }
  | { kind: "altimeter"; inHg: number; severity?: Severity }
  | {
      kind: "phrase";
      label: string;
      any: string[];
      /** When set, every phrase listed must be present (instead of any one). */
      all?: string[];
      category: Category | Category[];
      severity: Severity;
      tip: string;
      say?: string;
      /** e.g. MAYDAY must be said three times */
      repeat?: { phrase: string; times: number };
    }
  | {
      kind: "number";
      label: string;
      value: number;
      near: string[];
      category: Category;
      severity: Severity;
      tip: string;
    }
  | { kind: "maxWords"; max: number; tip: string };

export interface EvaluateInput {
  text: string;
  expects: Expect[];
  cs: CallsignInfo;
  /** ATC has already abbreviated the callsign on this facility. */
  abbreviatedAllowed: boolean;
  kind: StepKind;
  personality: Personality;
}

const cats = (c: Category | Category[]) => (Array.isArray(c) ? c : [c]);

function item(
  label: string,
  categories: Category[],
  ok: boolean,
  severity: Severity,
  message: string,
  correct?: string,
): EvalItem {
  const it: EvalItem = { label, categories, ok, severity, message };
  if (correct) it.correct = correct;
  return it;
}

function stationKeyword(f: Facility): string {
  const last = f.name.trim().split(/\s+/).pop() ?? f.station;
  return last.toLowerCase();
}

function checkExpect(p: ParsedTransmission, e: Expect, kind: StepKind): EvalItem[] {
  switch (e.kind) {
    case "station": {
      const kw = stationKeyword(e.facility);
      const idx = p.tokens.indexOf(kw);
      let lead = 0;
      while (["mayday", "pan"].includes(p.tokens[lead] ?? "")) lead++;
      const ok = idx >= 0 && idx <= lead + 6;
      const sev: Severity = kind === "initial" ? "major" : "minor";
      return [
        item(
          "Station called",
          ["phraseology"],
          ok,
          sev,
          ok
            ? `Addressed ${e.facility.name}.`
            : idx >= 0
              ? `Put the facility name first: "${e.facility.name}, <your callsign>, …" (AIM 4-2-3).`
              : `Start the call with the facility you are calling — "${e.facility.name}" — so the controller knows the call is for them (AIM 4-2-3).`,
          e.facility.name,
        ),
      ];
    }
    case "atis": {
      const letters = readAtisLetters(p);
      const ok = letters.includes(e.letter);
      const word = PHONETIC[e.letter] ?? e.letter;
      const wrong = letters.find((l) => l !== e.letter);
      return [
        item(
          "ATIS code",
          ["awareness"],
          ok,
          e.severity ?? "major",
          ok
            ? `Reported information ${word}.`
            : wrong
              ? `You reported information ${PHONETIC[wrong] ?? wrong}, but the current ATIS is ${word}. Listen to the ATIS and report the current code.`
              : `Report the ATIS code on initial contact ("with information ${word}") so the controller knows you have the current weather and runway (AIM 4-1-13).`,
          `with information ${word}`,
        ),
      ];
    }
    case "runway": {
      const rid = usRunway(e.runway);
      const read = readRunways(p);
      const exact = read.includes(rid);
      const bare = !exact && mentionsRunwayNumber(p, rid);
      const wrong = read.find((r) => r !== rid);
      const out: EvalItem[] = [];
      const categories: Category[] = e.readback ? ["runway", "readback"] : ["runway"];
      if (exact || bare) {
        out.push(
          item(
            "Runway",
            categories,
            true,
            e.severity ?? (e.readback ? "critical" : "major"),
            `Runway ${rid} identified.`,
          ),
        );
        if (bare)
          out.push(
            item(
              'Say "runway"',
              ["phraseology"],
              false,
              "minor",
              `Say the word "runway" before the number ("runway ${rid}") so it can't be confused with a heading or altitude.`,
              `runway ${rid}`,
            ),
          );
      } else {
        out.push(
          item(
            "Runway",
            categories,
            false,
            e.severity ?? (e.readback ? "critical" : "major"),
            wrong
              ? `You said runway ${wrong}, but the runway is ${rid}. A wrong-runway readback is a serious error — controllers must catch and correct it.`
              : e.readback
                ? `Runway ${rid} was not read back. Runway assignments must always be read back (AIM 4-4-7).`
                : `Include the runway ("runway ${rid}") so the controller knows exactly where you are.`,
            e.say ?? `runway ${rid}`,
          ),
        );
      }
      return out;
    }
    case "holdShort": {
      const rid = usRunway(e.runway);
      const ok =
        hasPhrase(p, "hold short") &&
        (readRunways(p).includes(rid) || mentionsRunwayNumber(p, rid));
      return [
        item(
          "Hold short readback",
          ["runway", "readback"],
          ok,
          "critical",
          ok
            ? `Hold short of runway ${rid} read back.`
            : `Hold-short instructions MUST be read back — "hold short runway ${rid}". Missing it is the classic setup for a runway incursion (AIM 4-3-18, JO 7110.65 §3-7-2).`,
          e.say ?? `hold short runway ${rid}`,
        ),
      ];
    }
    case "altitude": {
      const vals = readAltitudes(p);
      const tol = e.tolerance ?? 0;
      const ok = vals.some((v) => Math.abs(v - e.ft) <= tol);
      const wrong = vals.find((v) => Math.abs(v - e.ft) > tol);
      const label = e.label ?? (e.readback ? "Altitude readback" : "Altitude report");
      return [
        item(
          label,
          e.readback ? ["altitude", "readback"] : ["altitude", "awareness"],
          ok,
          e.severity ?? (e.readback ? "critical" : "major"),
          ok
            ? `${fmtAlt(e.ft)} ft confirmed.`
            : wrong !== undefined
              ? `You said ${fmtAlt(wrong)}, but it should be ${fmtAlt(e.ft)}. Altitude errors are among the most serious readback mistakes.`
              : e.readback
                ? `Read back the altitude (${fmtAlt(e.ft)}). Altitude assignments must always be read back (AIM 4-4-7).`
                : `State your altitude (${fmtAlt(e.ft)}) so the controller can verify your Mode C readout (AIM 5-3-1).`,
          e.say ?? fmtAlt(e.ft),
        ),
      ];
    }
    case "heading": {
      const out: EvalItem[] = [];
      const label = e.readback ? "Heading readback" : "Heading report";
      const categories: Category[] = e.readback
        ? ["heading", "readback"]
        : ["heading", "awareness"];
      if (e.deg === "runway") {
        const ok = hasPhrase(p, "runway heading");
        out.push(
          item(
            label,
            categories,
            ok,
            e.severity ?? "critical",
            ok ? "Runway heading read back." : `Read back "fly runway heading".`,
            e.say ?? "runway heading",
          ),
        );
        return out;
      }
      const hs = readHeadings(p);
      const tol = e.tolerance ?? 0;
      const match = hs.find(
        (h) => Math.abs(((h.deg - (e.deg as number) + 540) % 360) - 180) <= tol,
      );
      const want = String(e.deg).padStart(3, "0");
      if (!match) {
        const wrong = hs[0];
        out.push(
          item(
            label,
            categories,
            false,
            e.severity ?? (e.readback ? "critical" : "major"),
            wrong
              ? `You said heading ${String(wrong.deg).padStart(3, "0")}, but the assigned heading is ${want}.`
              : `Read back the heading — "${e.turn ? `${e.turn} ` : ""}heading ${want}". Headings (vectors) must be read back (AIM 4-4-7).`,
            e.say ?? `${e.turn ? `${e.turn} ` : ""}heading ${want}`,
          ),
        );
        return out;
      }
      out.push(
        item(label, categories, true, e.severity ?? "critical", `Heading ${want} confirmed.`),
      );
      if (e.turn && e.readback) {
        if (match.turn && match.turn !== e.turn)
          out.push(
            item(
              "Turn direction",
              ["heading", "readback"],
              false,
              "critical",
              `You read back a ${match.turn} turn, but ATC assigned a ${e.turn} turn. Turning the wrong way can create a conflict.`,
              `${e.turn} heading ${want}`,
            ),
          );
        else if (!match.turn)
          out.push(
            item(
              "Turn direction",
              ["heading"],
              false,
              "minor",
              `Include the direction of turn in your readback: "${e.turn} heading ${want}".`,
              `${e.turn} heading ${want}`,
            ),
          );
      }
      return out;
    }
    case "frequency": {
      const fs = readFrequencies(p);
      const ok = fs.some((f) => freqEquals(f, e.mhz));
      const want = formatFreqShort(e.mhz);
      const wrong = fs.find((f) => !freqEquals(f, e.mhz));
      return [
        item(
          e.readback ? "Frequency readback" : "Frequency",
          e.readback ? ["frequency", "readback"] : ["frequency"],
          ok,
          e.severity ?? (e.readback ? "critical" : "major"),
          ok
            ? `Frequency ${want} confirmed.`
            : wrong !== undefined
              ? `You read back ${formatFreqShort(wrong)}, but the frequency is ${want}. A wrong frequency leaves you without contact.`
              : `Read back the new frequency (${want}) so a mistake is caught before you leave the frequency.`,
          e.say ?? want,
        ),
      ];
    }
    case "squawk": {
      const ok = readSquawks(p).includes(e.code) || p.tokens.includes(e.code);
      return [
        item(
          "Squawk readback",
          ["readback"],
          ok,
          e.severity ?? "critical",
          ok
            ? `Squawk ${e.code} read back.`
            : `Read back the transponder code — "squawk ${e.code}". Transponder codes are always read back.`,
          e.say ?? `squawk ${e.code}`,
        ),
      ];
    }
    case "altimeter": {
      const ok = readAltimeters(p).some((v) => Math.abs(v - e.inHg) < 0.005);
      const want = e.inHg.toFixed(2);
      return [
        item(
          "Altimeter",
          ["readback"],
          ok,
          e.severity ?? "minor",
          ok
            ? `Altimeter ${want} read back.`
            : `Read back the altimeter setting (${want}) — it confirms you set the right value.`,
          want,
        ),
      ];
    }
    case "phrase": {
      let ok = e.all ? e.all.every((x) => hasPhrase(p, x)) : hasAny(p, e.any);
      let message = ok ? `${e.label}: ✓` : e.tip;
      let severity = e.severity;
      if (e.repeat) {
        const n = countPhrase(p, e.repeat.phrase);
        if (n > 0 && n < e.repeat.times) {
          ok = false;
          message = `Say "${e.repeat.phrase.toUpperCase()}" ${e.repeat.times === 3 ? "three times" : `${e.repeat.times} times`} at the start of the call (AIM 6-3-1).`;
          severity = "minor";
        } else if (n >= e.repeat.times) ok = true;
      }
      return [item(e.label, cats(e.category), ok, severity, message, e.say)];
    }
    case "maxWords": {
      const ok = p.wordCount <= e.max;
      return [
        item(
          "Initial call length",
          ["phraseology"],
          ok,
          "minor",
          ok ? "Short initial call." : e.tip,
        ),
      ];
    }
    case "number": {
      const t = p.tokens;
      let found: number | null = null;
      for (let i = 0; i < t.length; i++) {
        if (!/^\d+$/.test(t[i] ?? "")) continue;
        const win = t.slice(Math.max(0, i - 3), i + 4);
        if (e.near.some((k) => win.includes(k))) {
          found = Number(t[i]);
          if (found === e.value) break;
        }
      }
      const ok = found === e.value;
      return [
        item(
          e.label,
          [e.category],
          ok,
          e.severity,
          ok
            ? `${e.label}: ✓`
            : found !== null
              ? `${e.label}: you said ${found}, expected ${e.value}. ${e.tip}`
              : e.tip,
        ),
      ];
    }
  }
}

const NONSTANDARD: { any: string[]; unless?: string[]; message: string; correct?: string }[] = [
  {
    any: ["over and out"],
    message: `"Over and out" isn't used in aviation — simply end with your callsign.`,
  },
  {
    any: ["10 4", "ten four"],
    message: `Avoid CB slang like "ten-four". Use "roger" (received) or "wilco" (will comply).`,
    correct: "wilco",
  },
  {
    any: ["copy that", "copy"],
    unless: ["ready to copy", "copy the clearance"],
    message: `"Copy" isn't standard phraseology — use "roger" (received) or read the instruction back.`,
    correct: "roger",
  },
  {
    any: ["repeat"],
    message: `Say "say again" — "repeat" is not used on ATC frequencies (Pilot/Controller Glossary).`,
    correct: "say again",
  },
  {
    any: ["with you"],
    message: `Avoid "with you". On initial contact state your altitude instead, e.g. "level 4,500" (AIM 5-3-1).`,
  },
  {
    any: ["um", "uh", "erm", "uhh", "umm"],
    message: `Filler words ("um", "uh") tie up the frequency — plan the call before you key the mic.`,
  },
  {
    any: ["yes", "yeah", "yep", "nope"],
    message: `Use "affirmative" / "negative" instead of yes/no.`,
    correct: "affirmative",
  },
  {
    any: ["the active", "active runway"],
    message: `Say the runway number — "the active" is ambiguous (AIM 4-1-9).`,
  },
  {
    any: ["any traffic in the area please advise", "any traffic please advise"],
    message: `"Any traffic please advise" is not a recognized call (AIM 4-1-9) — state your position and intentions instead.`,
  },
];

function universalChecks(p: ParsedTransmission, input: EvaluateInput): EvalItem[] {
  const out: EvalItem[] = [];
  const cs = readCallsign(p, input.cs);
  const full = input.cs.full;
  const abbrev = input.cs.abbrev;
  if (cs.form === "none") {
    out.push(
      item(
        "Callsign",
        ["identification"],
        false,
        "critical",
        `No callsign. Every transmission must identify your aircraft — ${input.abbreviatedAllowed && input.cs.canAbbreviate ? `"${abbrev}" (ATC has abbreviated it)` : `"${full}"`} (AIM 4-2-3).`,
        input.abbreviatedAllowed && input.cs.canAbbreviate ? abbrev : full,
      ),
    );
  } else {
    if (cs.form === "abbrev" && !input.abbreviatedAllowed)
      out.push(
        item(
          "Callsign abbreviation",
          ["identification"],
          false,
          "minor",
          `You abbreviated your callsign to ${abbrev} before the controller did. Use the full callsign (${full}) until ATC abbreviates it (AIM 4-2-4).`,
          full,
        ),
      );
    else
      out.push(
        item(
          "Callsign",
          ["identification"],
          true,
          "critical",
          `Identified as ${cs.form === "full" ? full : abbrev}.`,
        ),
      );
    if ((input.kind === "initial" || input.kind === "request") && cs.position === "end")
      out.push(
        item(
          "Call order",
          ["phraseology"],
          false,
          "minor",
          `On an initial call use the order: who you're calling → who you are → where you are → what you want (AIM 4-2-3).`,
        ),
      );
    if (input.kind === "readback" && cs.position === "middle")
      out.push(
        item(
          "Callsign placement",
          ["identification"],
          false,
          "minor",
          `End your readback with your callsign (e.g. "…, ${input.abbreviatedAllowed ? abbrev : full}") so the controller knows who read it back.`,
        ),
      );
  }
  let ns = 0;
  for (const n of NONSTANDARD) {
    if (ns >= 3) break;
    if (hasAny(p, n.any) && !(n.unless && hasAny(p, n.unless))) {
      out.push(
        item("Non-standard phraseology", ["phraseology"], false, "minor", n.message, n.correct),
      );
      ns++;
    }
  }
  if (input.kind === "readback" && p.wordCount <= 4 && hasAny(p, ["roger", "wilco", "copy"]))
    out.push(
      item(
        "Readback vs. roger",
        ["phraseology", "readback"],
        false,
        "major",
        `"Roger" or "wilco" alone is not a readback. Read back runway assignments, hold-short instructions, altitudes, headings, frequencies and codes (AIM 4-4-7).`,
      ),
    );
  if (p.wordCount > 45)
    out.push(
      item(
        "Brevity",
        ["phraseology"],
        false,
        "minor",
        `That call was long (${p.wordCount} words). Keep transmissions concise — say only what's required (AIM 4-2-2).`,
      ),
    );
  return out;
}

export function scoreItems(items: EvalItem[], personality: Personality): number {
  let s = 100;
  for (const it of items) {
    if (it.ok) continue;
    let w = SEVERITY_WEIGHT[it.severity];
    if (personality === "examiner" && it.severity !== "critical") w *= 1.5;
    s -= w;
  }
  return Math.max(0, Math.round(s));
}

export function summarize(items: EvalItem[]): string {
  const bad = items.filter((i) => !i.ok);
  if (!bad.length) return "Clean transmission";
  const c = bad.filter((i) => i.severity === "critical").length;
  const M = bad.filter((i) => i.severity === "major").length;
  const m = bad.filter((i) => i.severity === "minor").length;
  return (
    [c ? `${c} critical` : "", M ? `${M} major` : "", m ? `${m} minor` : ""]
      .filter(Boolean)
      .join(", ") + ` issue${bad.length > 1 ? "s" : ""}`
  );
}

export function evaluateTransmission(input: EvaluateInput): {
  items: EvalItem[];
  parsed: ParsedTransmission;
} {
  const p = parseTransmission(input.text);
  const items: EvalItem[] = [];
  for (const e of input.expects) items.push(...checkExpect(p, e, input.kind));
  items.push(...universalChecks(p, input));
  return { items, parsed: p };
}

export function timingItem(
  delaySec: number | null,
  difficulty: Difficulty,
  urgent: boolean,
): EvalItem | null {
  if (delaySec === null) return null;
  const limit = urgent
    ? 6
    : difficulty === "beginner"
      ? 30
      : difficulty === "intermediate"
        ? 15
        : 10;
  if (delaySec <= limit)
    return item(
      "Response time",
      ["timing"],
      true,
      "minor",
      `Responded in ${delaySec.toFixed(1)} s.`,
    );
  const sev: Severity = urgent ? "major" : delaySec > limit * 2 ? "major" : "minor";
  return item(
    "Response time",
    ["timing"],
    false,
    sev,
    urgent
      ? `You took ${delaySec.toFixed(0)} s to respond to an urgent instruction. A go-around or traffic alert needs an immediate response — fly first, then answer briefly.`
      : `You took ${delaySec.toFixed(0)} s to respond. Controllers expect a prompt reply; a long pause leads to repeated calls and a busier frequency.`,
  );
}

export function blockedItem(): EvalItem {
  return item(
    "Stepped on transmission",
    ["timing"],
    false,
    "major",
    `You keyed the mic while someone else was transmitting, so both transmissions were blocked. Listen first and wait for a pause before you transmit (AIM 4-2-2).`,
  );
}

export function wrongFrequencyItem(expected: Facility, tunedMhz: number): EvalItem {
  return item(
    "Frequency management",
    ["frequency"],
    false,
    "critical",
    `You transmitted on ${formatFreqShort(tunedMhz)}, but ${expected.name} is on ${formatFreqShort(expected.mhz)}. Tune the frequency (flip it to ACTIVE) before you call.`,
    `${expected.name} ${formatFreqShort(expected.mhz)}`,
  );
}

export function correctFrequencyItem(f: Facility): EvalItem {
  return item(
    "Frequency management",
    ["frequency"],
    true,
    "major",
    `Transmitted on ${f.name} ${formatFreqShort(f.mhz)}.`,
  );
}

// ---------- session report ----------

export function buildReport(evals: TransmissionEval[]): SessionReport {
  const acc = new Map<Category, { pass: number; total: number; checks: number }>();
  for (const ev of evals) {
    for (const it of ev.items) {
      const w = SEVERITY_WEIGHT[it.severity];
      for (const c of it.categories) {
        const a = acc.get(c) ?? { pass: 0, total: 0, checks: 0 };
        a.total += w;
        a.checks += 1;
        if (it.ok) a.pass += w;
        acc.set(c, a);
      }
    }
  }
  const categories = CATEGORY_ORDER.filter((c) => acc.has(c)).map((c) => {
    const a = acc.get(c) ?? { pass: 0, total: 1, checks: 0 };
    return {
      key: c,
      label: CATEGORY_LABEL[c],
      score: Math.round((a.pass / Math.max(1, a.total)) * 100),
      checks: a.checks,
    };
  });
  const breakdown: Record<string, number> = {};
  for (const c of categories) breakdown[c.label] = c.score;
  const txScore = evals.length ? evals.reduce((s, e) => s + e.score, 0) / evals.length : 0;
  const catScore = categories.length
    ? categories.reduce((s, c) => s + c.score, 0) / categories.length
    : 0;
  const score = evals.length ? Math.round(txScore * 0.6 + catScore * 0.4) : 0;

  const feedback: string[] = [];
  const seen = new Set<string>();
  const ordered = [...evals].sort((a, b) => a.at - b.at);
  for (const sev of ["critical", "major", "minor"] as Severity[]) {
    for (const ev of ordered) {
      for (const it of ev.items) {
        if (it.ok || it.severity !== sev) continue;
        const key = `${it.label}|${it.message}`;
        if (seen.has(key)) continue;
        seen.add(key);
        feedback.push(
          `${ev.stepTitle}: ${it.message}${ev.example && sev !== "minor" ? ` Correct example: “${ev.example}”` : ""}`,
        );
      }
    }
  }
  const strengths = categories.filter((c) => c.score >= 90).map((c) => `${c.label}: ${c.score}%`);
  const grade: SessionReport["grade"] =
    score >= 90
      ? "Excellent"
      : score >= 75
        ? "Proficient"
        : score >= 60
          ? "Needs practice"
          : "Unsatisfactory";
  return {
    score,
    breakdown,
    categories,
    feedback: feedback.slice(0, 16),
    strengths,
    transmissions: evals,
    grade,
  };
}
