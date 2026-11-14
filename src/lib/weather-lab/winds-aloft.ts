/**
 * Winds and temperatures aloft forecast (FB) decoder — AC 00-45.
 *
 * Rules:
 *  - Groups are DDSS (no temperature), DDSS±TT (to 24,000 ft) or DDSSTT (30,000 ft and above,
 *    where temperatures are always negative and the minus sign is omitted).
 *  - DD = direction in tens of degrees TRUE, SS = speed in knots.
 *  - 9900 = light and variable (less than 5 kt).
 *  - Speeds 100–199 kt: 50 is added to the direction code (DD 51–86) and 100 subtracted from the
 *    speed. To decode: if DD is 51–86, direction = (DD − 50) × 10 and speed = SS + 100.
 *    7799 = 199 kt or more.
 *  - No winds are forecast within 1,500 ft of station elevation; no temperature at 3,000 ft or
 *    within 2,500 ft of station elevation.
 */

export interface FbDecoded {
  raw: string;
  altitudeFt: number | null;
  ok: boolean;
  error?: string;
  lightVariable: boolean;
  direction: number | null;
  speedKt: number | null;
  speedAtLeast?: boolean;
  tempC: number | null;
  steps: string[];
}

export const FB_LEVELS = [3000, 6000, 9000, 12000, 18000, 24000, 30000, 34000, 39000];

export function decodeFbGroup(raw: string, altitudeFt: number | null): FbDecoded {
  const g = raw.trim().toUpperCase();
  const steps: string[] = [];
  const base: FbDecoded = { raw: g, altitudeFt, ok: false, lightVariable: false, direction: null, speedKt: null, tempC: null, steps };
  if (!g) return { ...base, error: "Blank — no wind forecast for this level (within 1,500 ft of the station elevation)." };
  const m = /^(\d{2})(\d{2})(?:([+-])(\d{2})|(\d{2}))?$/.exec(g);
  if (!m) return { ...base, error: "Expected DDSS, DDSS±TT or DDSSTT (e.g. 2745, 2745-02, 731960)." };
  const dd = Number(m[1]);
  const ss = Number(m[2]);
  let tempC: number | null = null;
  if (m[3] && m[4]) {
    tempC = (m[3] === "-" ? -1 : 1) * Number(m[4]);
    steps.push(`Temperature group "${m[3]}${m[4]}" = ${tempC}°C.`);
    if (altitudeFt !== null && altitudeFt > 24000) steps.push("Note: above 24,000 ft the sign is normally omitted — this group includes one.");
  } else if (m[5]) {
    const plain = Number(m[5]);
    if (altitudeFt !== null && altitudeFt <= 24000) {
      steps.push(`At ${altitudeFt.toLocaleString()} ft temperatures carry a sign; six digits without a sign are expected only above 24,000 ft. Treating it as negative.`);
    } else {
      steps.push(`Six digits without a sign: above 24,000 ft temperatures are always below zero, so "${m[5]}" = −${plain}°C.`);
    }
    tempC = -plain;
  } else if (altitudeFt === 3000) {
    steps.push("No temperature is forecast for the 3,000-ft level.");
  }

  if (dd === 99 && ss === 0) {
    steps.unshift("9900 = light and variable (less than 5 kt).");
    return { ...base, ok: true, lightVariable: true, tempC, steps };
  }
  if (dd === 77 && ss === 99) {
    steps.unshift("7799 = speed 199 kt or greater (direction 270°: 77 − 50 = 27).");
    return { ...base, ok: true, direction: 270, speedKt: 199, speedAtLeast: true, tempC, steps };
  }
  let dir: number;
  let spd: number;
  if (dd >= 51 && dd <= 86) {
    dir = (dd - 50) * 10;
    spd = ss + 100;
    steps.unshift(
      `Direction code ${m[1]} is 51–86, so the wind is 100 kt or more: subtract 50 from the direction (${dd} − 50 = ${dd - 50} → ${dir}°) and add 100 to the speed (${ss} + 100 = ${spd} kt).`,
    );
  } else if (dd >= 1 && dd <= 36) {
    dir = dd * 10;
    spd = ss;
    steps.unshift(`Direction ${m[1]} × 10 = ${dir}° true; speed ${spd} kt.`);
  } else {
    return { ...base, error: `Direction code ${m[1]} is not valid (01–36, 51–86 or 99).`, tempC, steps };
  }
  return { ...base, ok: true, direction: dir === 0 ? 360 : dir, speedKt: spd, tempC, steps };
}

export interface FbLine {
  station: string;
  cells: (FbDecoded & { level: number })[];
}

/** Decode a station line such as "SFO 2714 2725+04 2737-01 2744-06 2761-18 2768-30 760043 761552 760963". */
export function decodeFbLine(line: string, levels = FB_LEVELS): FbLine | { error: string } {
  const toks = line.trim().toUpperCase().split(/\s+/).filter(Boolean);
  if (toks.length < 2) return { error: "Paste a station line: identifier followed by one group per level." };
  const station = toks[0] ?? "";
  if (!/^[A-Z]{3,4}$/.test(station)) return { error: `"${station}" is not a station identifier.` };
  const groups = toks.slice(1);
  // When fewer groups than levels are given, the missing ones are the LOW levels (blank because
  // they are within 1,500 ft of a high-elevation station). Align groups to the HIGHEST levels.
  const offset = Math.max(0, levels.length - groups.length);
  const cells = levels.map((level, i) => {
    const g = i >= offset ? (groups[i - offset] ?? "") : "";
    return { ...decodeFbGroup(g, level), level };
  });
  return { station, cells };
}

export const FB_EXAMPLE = "SFO 2714 2725+04 2737-01 2744-06 2761-18 2768-30 760043 761552 760963";
export const FB_EXAMPLE_HIGH = "DEN      2321-04 2434-11 2545-23 2557-35 750143 751051 249959";
