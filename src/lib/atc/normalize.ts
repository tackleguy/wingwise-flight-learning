/**
 * Pilot transmission parser.
 *
 * Normalizes typed or speech-recognized radio calls so they can be checked against
 * expected phraseology:
 *   - phonetic alphabet -> letters ("tango x-ray" -> "t x")
 *   - spoken numbers -> digits ("niner", "tree", "fife", "fower", "twenty five")
 *   - "point"/"decimal" -> "." and digit runs merged ("one two one point six" -> "121.6")
 *   - "3,500" -> "3500", "take off" -> "takeoff", "pan-pan" -> "pan pan"
 * Then exposes readers for altitudes, headings, runways, frequencies, squawk codes,
 * altimeter settings, ATIS letters and callsigns.
 */
import type { CallsignInfo } from "./types";
import { usRunway } from "./phrase";

const PHONETIC_TO_LETTER: Record<string, string> = {
  alpha: "a",
  alfa: "a",
  bravo: "b",
  charlie: "c",
  delta: "d",
  echo: "e",
  foxtrot: "f",
  golf: "g",
  hotel: "h",
  india: "i",
  juliet: "j",
  juliett: "j",
  kilo: "k",
  lima: "l",
  mike: "m",
  november: "n",
  oscar: "o",
  papa: "p",
  quebec: "q",
  romeo: "r",
  sierra: "s",
  tango: "t",
  uniform: "u",
  victor: "v",
  whiskey: "w",
  whisky: "w",
  xray: "x",
  yankee: "y",
  zulu: "z",
};

const DIGIT_WORDS: Record<string, string> = {
  zero: "0",
  one: "1",
  two: "2",
  three: "3",
  tree: "3",
  four: "4",
  fower: "4",
  five: "5",
  fife: "5",
  six: "6",
  seven: "7",
  eight: "8",
  ait: "8",
  nine: "9",
  niner: "9",
};
const TEENS: Record<string, string> = {
  ten: "10",
  eleven: "11",
  twelve: "12",
  thirteen: "13",
  fourteen: "14",
  fifteen: "15",
  sixteen: "16",
  seventeen: "17",
  eighteen: "18",
  nineteen: "19",
};
const TENS: Record<string, number> = {
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
};

export interface ParsedTransmission {
  raw: string;
  /** Canonical token stream. */
  tokens: string[];
  /** Canonical text: tokens joined by single spaces. */
  canon: string;
  /** Only [a-z0-9] — used to find callsigns regardless of spacing. */
  squashed: string;
  wordCount: number;
}

const isNum = (t: string | undefined): t is string => !!t && /^\d+(\.\d+)?$/.test(t);
const isInt = (t: string | undefined): t is string => !!t && /^\d+$/.test(t);

function preclean(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/x[\s-]?ray/g, "xray")
    .replace(/pan[\s-]?pan/g, "pan pan")
    .replace(/take[\s-]off/g, "takeoff")
    .replace(/o\s?clock/g, "oclock")
    .replace(/(\d),(\d{3})/g, "$1$2")
    .replace(/(\d)\.(\d)/g, "$1DOT$2")
    .replace(/\//g, " slash ")
    .replace(/[^a-z0-9DOT\s]/gi, " ")
    .replace(/DOT/g, ".");
}

export function canonicalTokens(raw: string): string[] {
  const words = preclean(raw).split(/\s+/).filter(Boolean);
  const out: string[] = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i] ?? "";
    // split "28l" -> "28" "l" (runway designators)
    const rw = /^(\d{1,2})([lrc])$/.exec(w);
    if (rw) {
      out.push(rw[1] ?? "", rw[2] ?? "");
      continue;
    }
    if (w in PHONETIC_TO_LETTER) {
      out.push(PHONETIC_TO_LETTER[w] ?? w);
      continue;
    }
    if (w in DIGIT_WORDS) {
      out.push(DIGIT_WORDS[w] ?? w);
      continue;
    }
    if (w in TEENS) {
      out.push(TEENS[w] ?? w);
      continue;
    }
    if (w in TENS) {
      const base = TENS[w] ?? 0;
      const next = words[i + 1];
      if (next && next in DIGIT_WORDS && next !== "zero") {
        out.push(String(base + Number(DIGIT_WORDS[next])));
        i++;
      } else out.push(String(base));
      continue;
    }
    if (w === "point" || w === "decimal") {
      out.push(".");
      continue;
    }
    if (w === "centre") {
      out.push("center");
      continue;
    }
    out.push(w);
  }
  // merge digit runs ("1" "2" "1" "." "6" -> "121.6")
  const merged: string[] = [];
  for (let i = 0; i < out.length; i++) {
    const t = out[i] ?? "";
    if (/^\d$/.test(t)) {
      let run = t;
      while (/^\d$/.test(out[i + 1] ?? "")) {
        run += out[i + 1];
        i++;
      }
      merged.push(run);
      continue;
    }
    merged.push(t);
  }
  const final: string[] = [];
  for (let i = 0; i < merged.length; i++) {
    const t = merged[i] ?? "";
    if (t === "." && isInt(final[final.length - 1]) && isInt(merged[i + 1])) {
      final[final.length - 1] = `${final[final.length - 1]}.${merged[i + 1]}`;
      i++;
      continue;
    }
    if (t === ".") continue;
    final.push(t);
  }
  return final;
}

export function parseTransmission(raw: string): ParsedTransmission {
  const tokens = canonicalTokens(raw);
  const canon = tokens.join(" ");
  return {
    raw,
    tokens,
    canon,
    squashed: canon.replace(/[^a-z0-9]/g, ""),
    wordCount: raw.trim().split(/\s+/).filter(Boolean).length,
  };
}

/** Normalize a phrase pattern the same way pilot text is normalized. */
export function canonPhrase(s: string): string {
  return canonicalTokens(s).join(" ");
}

export function hasPhrase(p: ParsedTransmission, phrase: string): boolean {
  const pat = canonPhrase(phrase);
  if (!pat) return false;
  return ` ${p.canon} `.includes(` ${pat} `);
}

export function hasAny(p: ParsedTransmission, phrases: string[]): boolean {
  return phrases.some((x) => hasPhrase(p, x));
}

export function countPhrase(p: ParsedTransmission, phrase: string): number {
  const pat = ` ${canonPhrase(phrase)} `;
  const hay = ` ${p.canon} `;
  let n = 0;
  let idx = hay.indexOf(pat);
  while (idx >= 0) {
    n++;
    idx = hay.indexOf(pat, idx + pat.length - 1);
  }
  return n;
}

// ---------- readers ----------

const NOT_ALT_PREV = new Set([
  "squawk",
  "code",
  "altimeter",
  "squawking",
  "transponder",
  "frequency",
  "contact",
]);

/** All altitudes mentioned, in feet. */
export function readAltitudes(p: ParsedTransmission): number[] {
  const t = p.tokens;
  const out: number[] = [];
  const used = new Set<number>();
  for (let i = 0; i < t.length; i++) {
    if (used.has(i)) continue;
    if (t[i] === "flight" && t[i + 1] === "level" && isInt(t[i + 2])) {
      out.push(Number(t[i + 2]) * 100);
      used.add(i + 2);
      continue;
    }
    const n = t[i];
    if (!isInt(n)) continue;
    if (t[i + 1] === "thousand") {
      let v = Number(n) * 1000;
      used.add(i);
      if (isInt(t[i + 2]) && t[i + 3] === "hundred") {
        v += Number(t[i + 2]) * 100;
        used.add(i + 2);
      } else if (isInt(t[i + 2]) && Number(t[i + 2]) < 1000 && Number(t[i + 2]) % 100 === 0) {
        v += Number(t[i + 2]);
        used.add(i + 2);
      }
      out.push(v);
      continue;
    }
    if (t[i + 1] === "hundred") {
      out.push(Number(n) * 100);
      used.add(i);
      continue;
    }
    const v = Number(n);
    const prev = t[i - 1] ?? "";
    if (v >= 500 && v <= 45000 && v % 100 === 0 && !NOT_ALT_PREV.has(prev)) out.push(v);
  }
  return out;
}

export interface HeadingRead {
  deg: number;
  turn: "left" | "right" | null;
}

export function readHeadings(p: ParsedTransmission): HeadingRead[] {
  const t = p.tokens;
  const out: HeadingRead[] = [];
  for (let i = 0; i < t.length; i++) {
    if (t[i] !== "heading") continue;
    const n = t[i + 1];
    if (!isInt(n)) continue;
    const v = Number(n);
    if (v < 0 || v > 360) continue;
    let turn: HeadingRead["turn"] = null;
    for (let j = Math.max(0, i - 3); j < i; j++) {
      if (t[j] === "left" || t[j] === "l") turn = "left";
      if (t[j] === "right" || t[j] === "r") turn = "right";
    }
    out.push({ deg: v === 0 ? 360 : v, turn });
  }
  return out;
}

const SIDE: Record<string, string> = { left: "L", l: "L", right: "R", r: "R", center: "C", c: "C" };
/** Words that mean "left/right" belongs to a turn or pattern, not to the runway designator. */
const NOT_SIDE_NEXT = new Set([
  "downwind",
  "base",
  "traffic",
  "turn",
  "heading",
  "crosswind",
  "pattern",
  "closed",
  "departure",
  "hand",
  "side",
  "break",
  "180",
  "360",
]);
function sideAt(t: string[], i: number): string {
  const s = SIDE[t[i] ?? ""] ?? "";
  if (!s) return "";
  return NOT_SIDE_NEXT.has(t[i + 1] ?? "") ? "" : s;
}

/** Runway ids mentioned after "runway" (US style, e.g. "28R", "4L"). */
export function readRunways(p: ParsedTransmission): string[] {
  const t = p.tokens;
  const out: string[] = [];
  for (let i = 0; i < t.length; i++) {
    if (t[i] !== "runway" && t[i] !== "rwy" && t[i] !== "runways") continue;
    const n = t[i + 1];
    if (!isInt(n)) continue;
    const v = Number(n);
    if (v < 1 || v > 36) continue;
    out.push(`${v}${sideAt(t, i + 2)}`);
  }
  return out;
}

/** Bare runway numbers anywhere (fallback when "runway" was omitted). */
export function mentionsRunwayNumber(p: ParsedTransmission, id: string): boolean {
  const m = /^(\d{1,2})([LRC]?)$/.exec(usRunway(id));
  if (!m) return false;
  const t = p.tokens;
  for (let i = 0; i < t.length; i++) {
    if (isInt(t[i]) && Number(t[i]) === Number(m[1])) {
      if (!m[2]) return true;
      if (sideAt(t, i + 1) === m[2]) return true;
    }
  }
  return false;
}

const FREQ_PREV = new Set([
  "contact",
  "frequency",
  "on",
  "to",
  "departure",
  "approach",
  "ground",
  "tower",
  "center",
  "radio",
  "clearance",
  "monitor",
  "at",
]);

export function readFrequencies(p: ParsedTransmission): number[] {
  const t = p.tokens;
  const out: number[] = [];
  for (let i = 0; i < t.length; i++) {
    const n = t[i];
    if (!isNum(n)) continue;
    if (n.includes(".")) {
      const v = Number(n);
      if (v >= 108 && v < 137) out.push(v);
      continue;
    }
    if (
      n.length >= 4 &&
      n.length <= 6 &&
      n.startsWith("1") &&
      (FREQ_PREV.has(t[i - 1] ?? "") || i === t.length - 1 || /^[a-z]{3,}$/.test(t[i + 1] ?? ""))
    ) {
      const v = Number(`${n.slice(0, 3)}.${n.slice(3)}`);
      if (v >= 118 && v < 137) out.push(v);
    }
    if (n.length === 3 && Number(n) >= 118 && Number(n) <= 136 && FREQ_PREV.has(t[i - 1] ?? ""))
      out.push(Number(n));
  }
  return out;
}

export function readSquawks(p: ParsedTransmission): string[] {
  const t = p.tokens;
  const out: string[] = [];
  for (let i = 0; i < t.length; i++) {
    const k = t[i];
    if (k !== "squawk" && k !== "code" && k !== "squawking" && k !== "transponder") continue;
    const n = t[i + 1] === "code" ? t[i + 2] : t[i + 1];
    if (n === "vfr") out.push("1200");
    if (isInt(n) && /^[0-7]{4}$/.test(n)) out.push(n);
  }
  return out;
}

export function containsNumber(p: ParsedTransmission, value: string): boolean {
  return p.tokens.includes(value);
}

export function readAltimeters(p: ParsedTransmission): number[] {
  const t = p.tokens;
  const out: number[] = [];
  for (let i = 0; i < t.length; i++) {
    const n = t[i];
    if (!isNum(n)) continue;
    if (/^(2[89]|3[01])\.\d{2}$/.test(n)) out.push(Number(n));
    else if (
      /^(2[89]|3[01])\d{2}$/.test(n) &&
      (t[i - 1] === "altimeter" || t[i - 2] === "altimeter")
    )
      out.push(Number(n) / 100);
  }
  return out;
}

/** ATIS letters reported ("with information alpha", "have bravo"). */
export function readAtisLetters(p: ParsedTransmission): string[] {
  const t = p.tokens;
  const out: string[] = [];
  for (let i = 0; i < t.length; i++) {
    const k = t[i];
    if (k === "information" || k === "info" || k === "atis" || k === "have" || k === "numbers") {
      const n = t[i + 1];
      if (n && /^[a-z]$/.test(n)) out.push(n.toUpperCase());
    }
  }
  return out;
}

export interface CallsignUse {
  form: "full" | "abbrev" | "none";
  position: "start" | "end" | "middle" | "none";
}

export function readCallsign(p: ParsedTransmission, cs: CallsignInfo): CallsignUse {
  const sq = p.squashed;
  let best: { idx: number; len: number; form: "full" | "abbrev" } | null = null;
  for (const f of cs.fullForms) {
    const idx = sq.indexOf(f);
    if (idx >= 0 && (!best || idx < best.idx)) best = { idx, len: f.length, form: "full" };
  }
  if (!best) {
    // "172TX" without the N prefix still identifies the aircraft
    const body = cs.full.toLowerCase().slice(1);
    if (cs.full.startsWith("N") && body.length >= 3) {
      const idx = sq.indexOf(body);
      if (idx >= 0) best = { idx, len: body.length, form: "full" };
    }
  }
  if (!best) {
    for (const f of cs.abbrevForms) {
      const idx = sq.indexOf(f);
      if (idx >= 0 && (!best || idx < best.idx)) best = { idx, len: f.length, form: "abbrev" };
    }
  }
  if (!best) return { form: "none", position: "none" };
  const len = sq.length || 1;
  const end = best.idx + best.len;
  const position = best.idx / len < 0.38 ? "start" : len - end <= 3 ? "end" : "middle";
  // also accept callsign repeated at the end
  if (position !== "end") {
    const tail = sq.slice(Math.max(0, len - best.len - 3));
    if (tail.includes(sq.slice(best.idx, end)) && position === "middle")
      return { form: best.form, position: "end" };
  }
  return { form: best.form, position };
}
