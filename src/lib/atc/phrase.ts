/**
 * Phraseology builders. Every ATC message is built as a Phrase with a written form
 * (transcript) and a spoken form (text-to-speech), following FAA conventions
 * (JO 7110.65 §2-4, AIM 4-2):
 *   - numbers spoken digit by digit, "niner" for 9
 *   - altitudes in thousands/hundreds ("three thousand five hundred", "one one thousand")
 *   - flight levels "flight level one eight zero"
 *   - frequencies with "point"
 *   - letters with the ICAO phonetic alphabet
 */
import type { CallsignInfo, Phrase } from "./types";
import { formatFreqShort } from "./frequency";

export const PHONETIC: Record<string, string> = {
  A: "Alpha", B: "Bravo", C: "Charlie", D: "Delta", E: "Echo", F: "Foxtrot", G: "Golf", H: "Hotel",
  I: "India", J: "Juliett", K: "Kilo", L: "Lima", M: "Mike", N: "November", O: "Oscar", P: "Papa",
  Q: "Quebec", R: "Romeo", S: "Sierra", T: "Tango", U: "Uniform", V: "Victor", W: "Whiskey",
  X: "X-ray", Y: "Yankee", Z: "Zulu",
};

const DIGIT_WORD = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "niner"];

export type PhrasePart = string | number | Phrase | null | undefined | false;

export function isPhrase(x: unknown): x is Phrase {
  return typeof x === "object" && x !== null && "text" in x && "spoken" in x;
}

function tidy(s: string): string {
  return s
    .replace(/\s+/g, " ")
    .replace(/\s+([,.])/g, "$1")
    .replace(/,\s*,/g, ",")
    .replace(/\.\s*\./g, ".")
    .trim();
}

/** Tagged template: ph`${cs}, runway ${rwy("31")}, taxi via ${letters("Z")}.` */
export function ph(strings: TemplateStringsArray, ...vals: PhrasePart[]): Phrase {
  let text = strings[0] ?? "";
  let spoken = strings[0] ?? "";
  vals.forEach((v, i) => {
    if (v === null || v === undefined || v === false) {
      // skip
    } else if (isPhrase(v)) {
      text += v.text;
      spoken += v.spoken;
    } else {
      text += String(v);
      spoken += String(v);
    }
    const s = strings[i + 1] ?? "";
    text += s;
    spoken += s;
  });
  return { text: tidy(text), spoken: tidy(spoken) };
}

export function plain(s: string): Phrase {
  return { text: s, spoken: s };
}

export function join(parts: PhrasePart[], sep = ", "): Phrase {
  const ok = parts.filter((p): p is string | number | Phrase => p !== null && p !== undefined && p !== false && p !== "");
  return {
    text: tidy(ok.map((p) => (isPhrase(p) ? p.text : String(p))).join(sep)),
    spoken: tidy(ok.map((p) => (isPhrase(p) ? p.spoken : String(p))).join(sep)),
  };
}

export function sentence(p: Phrase): Phrase {
  const end = (s: string) => (/[.!?]$/.test(s) ? s : `${s}.`);
  return { text: end(p.text), spoken: end(p.spoken) };
}

/** Digit-by-digit: "4521" -> "four five two one"; "." -> "point". */
export function spellDigits(s: string): string {
  return s
    .split("")
    .map((c) => (c === "." ? "point" : /\d/.test(c) ? DIGIT_WORD[Number(c)] : PHONETIC[c.toUpperCase()] ?? c))
    .join(" ");
}

export function digits(s: string | number): Phrase {
  const t = String(s);
  return { text: t, spoken: spellDigits(t) };
}

/** Runway "04L" -> text "4L", spoken "four left" (US: no leading zero). */
export function usRunway(id: string): string {
  const m = /^0*(\d{1,2})([LRC]?)$/i.exec(id.trim());
  if (!m) return id.toUpperCase();
  return `${Number(m[1])}${(m[2] ?? "").toUpperCase()}`;
}

export function rwy(id: string): Phrase {
  const us = usRunway(id);
  const m = /^(\d{1,2})([LRC]?)$/.exec(us);
  if (!m) return plain(us);
  const side = m[2] === "L" ? " left" : m[2] === "R" ? " right" : m[2] === "C" ? " center" : "";
  return { text: us, spoken: `${spellDigits(m[1] ?? "")}${side}` };
}

export function fmtAlt(ft: number): string {
  if (ft >= 18000) return `FL${Math.round(ft / 100)}`;
  return ft.toLocaleString("en-US");
}

export function spokenAlt(ft: number): string {
  if (ft >= 18000) return `flight level ${spellDigits(String(Math.round(ft / 100)))}`;
  const th = Math.floor(ft / 1000);
  const hu = Math.round((ft % 1000) / 100);
  const parts: string[] = [];
  if (th > 0) parts.push(`${th >= 10 ? spellDigits(String(th)) : (DIGIT_WORD[th] ?? String(th))} thousand`);
  if (hu > 0) parts.push(`${DIGIT_WORD[hu] ?? hu} hundred`);
  if (!parts.length) return "zero";
  return parts.join(" ");
}

export function alt(ft: number): Phrase {
  return { text: fmtAlt(ft), spoken: spokenAlt(ft) };
}

export function hdg(deg: number): Phrase {
  const d = ((Math.round(deg) % 360) + 360) % 360 || 360;
  const t = String(d).padStart(3, "0");
  return { text: t, spoken: spellDigits(t) };
}

export function freq(mhz: number): Phrase {
  const t = formatFreqShort(mhz);
  return { text: t, spoken: spellDigits(t) };
}

export function altimeter(inHg: number): Phrase {
  const t = inHg.toFixed(2);
  return { text: t, spoken: spellDigits(t.replace(".", "")) };
}

export function squawk(code: string): Phrase {
  return digits(code);
}

export function letter(l: string): Phrase {
  const w = PHONETIC[l.toUpperCase()] ?? l;
  return { text: w, spoken: w };
}

/** Taxi route ["Z","A"] -> "Zulu, Alpha" */
export function route(taxiways: string[]): Phrase {
  return join(taxiways.map((t) => (t.length === 1 ? letter(t) : digits(t))), ", ");
}

export function wind(dirMag: number, kt: number): Phrase {
  if (kt < 3) return plain("wind calm");
  return ph`wind ${hdg(dirMag)} at ${kt}`;
}

export function clock(n: number): Phrase {
  return { text: `${n} o'clock`, spoken: `${n} o'clock` };
}

export function miles(n: number): Phrase {
  return { text: `${n} mile${n === 1 ? "" : "s"}`, spoken: `${n} mile${n === 1 ? "" : "s"}` };
}

/** Phonetic spelling of a callsign for TTS ("N172TX" -> "November One Seven Two Tango X-ray"). */
export function spellCallsign(cs: string): string {
  return cs
    .toUpperCase()
    .split("")
    .map((c) => (/\d/.test(c) ? cap(DIGIT_WORD[Number(c)] ?? c) : PHONETIC[c] ?? c))
    .join(" ");
}

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * FAA callsign rules (JO 7110.65 §2-4-20, AIM 4-2-4): an N-number may be abbreviated to the
 * prefix plus the last three characters ("N2TX") — but only after ATC has done so.
 */
export function makeCallsign(raw: string, typeWords: string[] = []): CallsignInfo {
  const full = (raw || "N172TX").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8) || "N172TX";
  const isN = /^N\d[0-9A-Z]{1,5}$/.test(full);
  const canAbbreviate = isN && full.length > 4;
  const abbrev = canAbbreviate ? `N${full.slice(-3)}` : full;
  const lower = full.toLowerCase();
  const tw = typeWords.map((w) => w.toLowerCase().replace(/[^a-z0-9]/g, "")).filter(Boolean);
  const fullForms = new Set<string>([lower]);
  const abbrevForms = new Set<string>();
  if (isN) {
    const body = lower.slice(1);
    for (const w of tw) fullForms.add(`${w}${body}`);
    if (canAbbreviate) {
      const last3 = lower.slice(-3);
      abbrevForms.add(`n${last3}`);
      for (const w of tw) abbrevForms.add(`${w}${last3}`);
    }
  }
  return {
    full,
    abbrev,
    fullSpoken: spellCallsign(full),
    abbrevSpoken: spellCallsign(abbrev),
    canAbbreviate,
    fullForms: [...fullForms],
    abbrevForms: [...abbrevForms],
  };
}

export function csPhrase(cs: CallsignInfo, abbreviated: boolean): Phrase {
  return abbreviated && cs.canAbbreviate ? { text: cs.abbrev, spoken: cs.abbrevSpoken } : { text: cs.full, spoken: cs.fullSpoken };
}

/** Convert an arbitrary written ATC-ish string into something TTS reads in radio style. */
export function speakify(text: string): string {
  return text
    .replace(/\bFL(\d{2,3})\b/g, (_, n: string) => `flight level ${spellDigits(n)}`)
    .replace(/\b(1[1-3]\d\.\d{1,3})\b/g, (m: string) => spellDigits(m))
    .replace(/\b([0-3]\d\.\d{2})\b/g, (m: string) => spellDigits(m.replace(".", "")))
    .replace(/\bheading (\d{3})\b/gi, (_, n: string) => `heading ${spellDigits(n)}`)
    .replace(/\bsquawk (\d{4})\b/gi, (_, n: string) => `squawk ${spellDigits(n)}`)
    .replace(/\brunway (\d{1,2})([LRC])?\b/gi, (_, n: string, s: string | undefined) => `runway ${rwy(`${n}${s ?? ""}`).spoken}`)
    .replace(/\b(\d{1,2}),?(\d)00\b/g, (_, th: string, h: string) => spokenAlt(Number(th) * 1000 + Number(h) * 100))
    .replace(/\bN(\d[0-9A-Z]{1,5})\b/g, (m: string) => spellCallsign(m));
}
