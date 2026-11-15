/**
 * Makes a written message sound right when a speech synthesiser reads it: units are spelled out,
 * runway numbers and headings are read digit by digit the way pilots say them, and symbols a
 * synthesiser trips over are replaced. Pure text in, text out.
 *
 *   "Runway 28R, heading 090, 65 kt, 500 fpm"  →  "Runway two eight right, heading zero nine zero, 65 knots, 500 feet per minute"
 */

const DIGITS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
const spellDigits = (digits: string): string => [...digits].map((d) => DIGITS[Number(d)] ?? d).join(" ");
const SIDES: Record<string, string> = { L: "left", R: "right", C: "center" };

const SPEEDS: Record<string, string> = {
  s0: "V S zero",
  so: "V S zero",
  s1: "V S one",
  s: "V S",
  r: "V R",
  x: "V X",
  y: "V Y",
  fe: "V F E",
  a: "V A",
  no: "V N O",
  ne: "V N E",
  g: "V G",
};

/** [pattern after a number, singular, plural] */
const UNITS: [RegExp, string, string][] = [
  [/(\d)\s*(?:kts?|KIAS|KCAS|KTAS)\b/g, "knot", "knots"],
  [/(\d)\s*(?:fpm|ft\/min)\b/g, "foot per minute", "feet per minute"],
  [/(\d)\s*ft\b/g, "foot", "feet"],
  [/(\d)\s*(?:nm|NM)\b/g, "nautical mile", "nautical miles"],
  [/(\d)\s*(?:sm|SM)\b/g, "statute mile", "statute miles"],
  [/(\d)\s*in\s?Hg\b/gi, "inch of mercury", "inches of mercury"],
  [/(\d)\s*(?:gph|GPH)\b/g, "gallon per hour", "gallons per hour"],
  [/(\d)\s*gal\b/g, "gallon", "gallons"],
  [/(\d)\s*lbs?\b/g, "pound", "pounds"],
  [/(\d)\s*hp\b/gi, "horsepower", "horsepower"],
  [/(\d)\s*(?:hPa|mb)\b/g, "hectopascal", "hectopascals"],
];

/** Rewrite a message for the speech synthesiser. */
export function speakable(text: string): string {
  let s = text;
  s = s.replace(/[→➜➔⇒]/g, " to ");
  s = s.replace(/&/g, " and ");
  // runway designators: "runway 28R" → "runway two eight right"
  s = s.replace(/\b(runway|rwy)\s*(\d{1,2})\s?([LRC])?(?![A-Za-z0-9])/gi, (_m, word: string, num: string, side?: string) => {
    const w = word[0] === "R" ? "Runway" : "runway";
    return `${w} ${spellDigits(num)}${side ? ` ${SIDES[side.toUpperCase()] ?? side}` : ""}`;
  });
  // three-digit headings / courses / radials: "heading 090" → "heading zero nine zero"
  s = s.replace(/\b(heading|course|radial|bearing|track)\s+(?:of\s+)?(\d{3})(?!\d)/gi, (_m, word: string, num: string) => `${word} ${spellDigits(num)}`);
  // temperatures and angles
  s = s.replace(/(\d)\s*°\s*C\b/g, "$1 degrees Celsius");
  s = s.replace(/(\d)\s*°\s*F\b/g, "$1 degrees Fahrenheit");
  s = s.replace(/(\d)\s*°/g, "$1 degrees");
  s = s.replace(/°/g, " degrees ");
  // units after a number ("1 foot", "500 feet")
  for (const [re, one, many] of UNITS) {
    s = s.replace(re, (m: string, digit: string, offset: number, whole: string) => {
      // is the whole number exactly 1?
      let i = offset;
      while (i > 0 && /[\d.,]/.test(whole[i - 1]!)) i--;
      const number = whole.slice(i, offset + 1).replace(/,/g, "");
      void m;
      return `${digit} ${Number(number) === 1 ? one : many}`;
    });
  }
  // reference speeds: "Vy" → "V Y"
  s = s.replace(/\bV(s0|so|s1|fe|no|ne|s|r|x|y|a|g)\b/g, (m: string, code: string) => SPEEDS[code] ?? m);
  s = s.replace(/\bAGL\b/g, "above the ground");
  s = s.replace(/\bMSL\b/g, "above sea level");
  s = s.replace(/\b(NAV|COM)\s?([12])\b/g, (_m, r: string, n: string) => `${r === "NAV" ? "nav" : "com"} ${n}`);
  // dashes and slashes become short pauses / words
  s = s.replace(/\s*[—–]\s*/g, ", ");
  s = s.replace(/\s+\/\s+/g, ", ");
  s = s.replace(/[*_#`~|<>]/g, " ");
  return s.replace(/\s+/g, " ").replace(/\s+([,.;!?])/g, "$1").trim();
}
