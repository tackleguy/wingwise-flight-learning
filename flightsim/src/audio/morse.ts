/**
 * Morse code for navigation-station identifiers (pure logic, no audio).
 *
 * A VOR or ILS identifies itself by sending its two- to four-letter identifier in Morse code as
 * a tone of about 1020 Hz, slowly (about 7 words per minute), every ten seconds or so. Pilots
 * listen to it to make sure they tuned the right station and that it is working.
 *
 * Standard timing ("PARIS" standard): one unit = 1.2 / words-per-minute seconds;
 * dot = 1 unit, dash = 3, gap inside a letter = 1, gap between letters = 3, gap between words = 7.
 */

/** International Morse code, letters and digits ("." = dot, "-" = dash). */
export const MORSE: Readonly<Record<string, string>> = {
  A: ".-",
  B: "-...",
  C: "-.-.",
  D: "-..",
  E: ".",
  F: "..-.",
  G: "--.",
  H: "....",
  I: "..",
  J: ".---",
  K: "-.-",
  L: ".-..",
  M: "--",
  N: "-.",
  O: "---",
  P: ".--.",
  Q: "--.-",
  R: ".-.",
  S: "...",
  T: "-",
  U: "..-",
  V: "...-",
  W: ".--",
  X: "-..-",
  Y: "-.--",
  Z: "--..",
  "0": "-----",
  "1": ".----",
  "2": "..---",
  "3": "...--",
  "4": "....-",
  "5": ".....",
  "6": "-....",
  "7": "--...",
  "8": "---..",
  "9": "----.",
};

export const IDENT_TONE_HZ = 1020;
export const IDENT_WPM = 7;
/** A station repeats its identifier about this often, seconds. */
export const IDENT_REPEAT_SEC = 10;

/** Length of one Morse unit (a dot), seconds. */
export const morseUnitSec = (wpm = IDENT_WPM): number => 1.2 / wpm;

/** Dots and dashes of a text, letters separated by spaces and words by " / " (unknown characters are skipped). */
export function morseText(text: string): string {
  return text
    .toUpperCase()
    .trim()
    .split(/\s+/)
    .map((word) =>
      [...word]
        .map((ch) => MORSE[ch])
        .filter((code): code is string => code !== undefined)
        .join(" "),
    )
    .filter((w) => w.length > 0)
    .join(" / ");
}

export interface MorseTone {
  /** Seconds from the start of the identifier. */
  start: number;
  end: number;
}

export interface MorseSchedule {
  tones: MorseTone[];
  /** From the start of the first tone to the end of the last, seconds. */
  durationSec: number;
  unitSec: number;
}

/** When the tone is on, for one sending of `text` at `wpm` words per minute. */
export function morseSchedule(text: string, wpm = IDENT_WPM): MorseSchedule {
  const unit = morseUnitSec(wpm);
  const tones: MorseTone[] = [];
  let t = 0; // in units
  let end = 0;
  const words = text.toUpperCase().trim().split(/\s+/);
  let firstWord = true;
  for (const word of words) {
    let firstLetter = true;
    let any = false;
    for (const ch of word) {
      const code = MORSE[ch];
      if (!code) continue;
      if (firstLetter) {
        if (!firstWord) t += 7 - 3; // word gap (the letter gap of 3 was already added)
      }
      firstLetter = false;
      any = true;
      for (let i = 0; i < code.length; i++) {
        const len = code[i] === "-" ? 3 : 1;
        tones.push({ start: t * unit, end: (t + len) * unit });
        end = t + len;
        t += len + 1; // gap inside a letter
      }
      t += 3 - 1; // letter gap (1 was already added after the last element)
    }
    if (any) firstWord = false;
  }
  return { tones, durationSec: end * unit, unitSec: unit };
}

/** Length of one repeat cycle: every 10 s, or longer for an unusually long identifier (at least 2.5 s of silence). */
export const identCycleSec = (durationSec: number): number => Math.max(IDENT_REPEAT_SEC, durationSec + 2.5);

/**
 * Turn measured tone bursts back into text (used by the self-test to prove that the rendered
 * sound really is the identifier). `unitSec` is the dot length the sender used.
 */
export function decodeMorse(bursts: readonly MorseTone[], unitSec: number): string {
  const reverse = new Map<string, string>();
  for (const [ch, code] of Object.entries(MORSE)) reverse.set(code, ch);
  let out = "";
  let code = "";
  const flush = () => {
    if (code) out += reverse.get(code) ?? "?";
    code = "";
  };
  for (let i = 0; i < bursts.length; i++) {
    const b = bursts[i]!;
    const prev = bursts[i - 1];
    if (prev) {
      const gap = (b.start - prev.end) / unitSec;
      if (gap > 5) {
        flush();
        out += " ";
      } else if (gap > 2) flush();
    }
    code += (b.end - b.start) / unitSec > 2 ? "-" : ".";
  }
  flush();
  return out;
}
