/**
 * Decides how a runway LOOKS from the open data: which surface it gets and which painted markings,
 * with every dimension worked out here (no drawing, no CesiumJS — unit-tested in Node).
 *
 * The marking layout follows the standard pattern pilots learn (threshold stripes, runway numbers,
 * dashed centreline, aiming point, touchdown-zone bars, side stripes, displaced-threshold arrows),
 * simplified: sizes are the common ones for a 150 ft wide runway and are scaled down for narrower
 * runways. It is a faithful picture, not a survey of the real paint at each airport.
 */
import type { AirportSize, Runway, SurfaceType } from "@/data/world-data";
import { M_PER_FT, clamp } from "@/core/math";

const FT = M_PER_FT;

/** Surface looks the shader knows (the number is passed to the shader). */
export const SURFACE_LOOK = { asphalt: 0, concrete: 1, grass: 2, gravel: 3, dirt: 4, snow: 5, unknown: 6 } as const;
export type SurfaceLook = keyof typeof SURFACE_LOOK;

export function surfaceLook(surface: SurfaceType): SurfaceLook {
  switch (surface) {
    case "asphalt":
    case "concrete":
    case "grass":
    case "gravel":
    case "dirt":
    case "snow":
      return surface;
    default:
      return "unknown";
  }
}

/** Runway designator split into the number and the side letter, e.g. "28R" → 28 + R. */
export interface Designator {
  /** Characters painted as the big number (kept exactly as published, e.g. "09"). May be letters for odd names such as "NE". */
  number: string;
  /** "L", "C", "R" (or another single suffix letter); "" when there is none. */
  letter: string;
}

export function parseDesignator(id: string): Designator {
  const clean = id.trim().toUpperCase().replace(/[^0-9A-Z]/g, "");
  const m = /^(\d{1,2})([A-Z]?)/.exec(clean);
  if (m) return { number: m[1]!, letter: m[2] ?? "" };
  // Names like "H16L" (a digit group after a prefix) or pure compass names "N", "SW".
  const inner = /(\d{1,2})([LCR]?)/.exec(clean);
  if (inner) return { number: inner[1]!, letter: inner[2] ?? "" };
  return { number: clean.slice(0, 2), letter: "" };
}

/** Painted markings of one runway end. All distances are metres measured from the PAVEMENT END. */
export interface EndMarks {
  id: string;
  /** The characters actually painted, e.g. "9L" for "09L" at a US airport. Also the key of the number texture. */
  paintId: string;
  designator: Designator;
  /** Start of the landing threshold (0 unless displaced). */
  displacedM: number;
  /** White arrows along the centreline of the displaced part, leading to the threshold bar. */
  arrows: boolean;
  /** Solid bar across the runway at a displaced threshold: [start, end]; start = end when absent. */
  barStartM: number;
  barEndM: number;
  /** Threshold stripes ("piano keys"): [start, end] and how many on each side of the centreline (0 = none). */
  stripeStartM: number;
  stripeEndM: number;
  stripesPerSide: number;
  /** Runway number (and letter): where its texture zone starts, its length along the runway and half its width. 0 length = none. */
  desigStartM: number;
  desigLengthM: number;
  desigHalfWidthM: number;
  /** Where the painted characters really end (used to start the centreline). */
  desigEndM: number;
  /** The dashed centreline begins here. */
  centrelineStartM: number;
  /** Aiming point blocks: [start, end]; start = end = 0 when absent. */
  aimStartM: number;
  aimEndM: number;
  /** Touchdown-zone bar groups are painted every 500 ft from the threshold up to this distance from the threshold (0 = none). */
  tdzMaxFromThresholdM: number;
}

export interface RunwayLayout {
  widthM: number;
  lengthM: number;
  look: SurfaceLook;
  /** Any paint at all. */
  marked: boolean;
  /** Width of the dashed centreline (0 = none). */
  centrelineWidthM: number;
  /** Side stripes: inner and outer distance from the centreline (0, 0 = none). */
  sideInnerM: number;
  sideOuterM: number;
  /** Scale of sideways marking dimensions relative to a 150 ft wide runway (≤ 1). */
  lateralScale: number;
  /** Scale of the number/letter size relative to the full 60 ft tall characters. */
  glyphScale: number;
  /** 0…1 how much tyre rubber is deposited in the touchdown zones. */
  rubber: number;
  ends: [EndMarks, EndMarks];
}

// Standard dimensions (feet) for a 150 ft wide runway.
export const MARK = {
  centreStripeFt: 120,
  centreGapFt: 80,
  thresholdStripeLenFt: 150,
  thresholdStripeFromThresholdFt: 20,
  thresholdStripeWidthFt: 5.75,
  thresholdBarFt: 10,
  glyphHeightFt: 60,
  glyphGapFt: 20,
  glyphZoneWidthFt: 80,
  glyphZoneLengthFt: 160,
  aimFromThresholdFt: 1020,
  aimLengthFt: 150,
  aimInnerFt: 36,
  aimWidthFt: 30,
  tdzSpacingFt: 500,
  tdzBarLengthFt: 75,
  tdzBarWidthFt: 6,
  tdzBarGapFt: 5,
  sideStripeFt: 3,
  arrowPeriodFt: 200,
  arrowLengthFt: 120,
  arrowHeadFt: 45,
} as const;

/** Usable pavement width in metres (the data sometimes has 0 or absurd values). */
export function runwayWidthM(rw: Runway): number {
  let ft = rw.widthFt;
  if (!(ft >= 15)) ft = rw.lengthFt > 5000 ? 150 : rw.lengthFt > 2500 ? 75 : 50;
  const maxFt = rw.paved ? 300 : 500;
  return clamp(ft, 15, maxFt) * FT;
}

/** How many threshold stripes fit on each side of the centreline (standard: 4/6/8/12/16 in total for 60/75/100/150/200 ft). */
export function thresholdStripesPerSide(widthFt: number): number {
  return Math.max(0, Math.min(8, Math.floor((widthFt / 2 - 2.9) / (2 * MARK.thresholdStripeWidthFt))));
}

/**
 * What is painted for a designator. In the United States runway numbers are painted (and spoken)
 * without a leading zero — "9L", not "09L"; almost everywhere else the zero is kept.
 */
export function paintedDesignator(id: string, country: string): Designator {
  const d = parseDesignator(id);
  if (country === "US" && /^0\d$/.test(d.number)) return { number: d.number.slice(1), letter: d.letter };
  return d;
}

export function runwayLayout(rw: Runway, lengthM: number, airportSize: AirportSize, country = ""): RunwayLayout {
  const widthM = runwayWidthM(rw);
  const widthFt = widthM / FT;
  const lengthFt = lengthM / FT;
  const look = surfaceLook(rw.surface);
  const paved = rw.paved;
  const pavedLooking = paved || (look === "unknown" && widthFt >= 40 && (rw.lighted || lengthFt >= 3000));

  // What gets painted (short, narrow paved strips: numbers and centreline only).
  const numbers = pavedLooking && lengthFt >= 800 && widthFt >= 25;
  const stripes = paved && lengthFt >= 3000 && widthFt >= 60;
  const aiming = stripes && lengthFt >= 4200;
  const tdz = aiming && lengthFt > 6000 && widthFt >= 100;
  const side = paved && widthFt >= 100 && lengthFt >= 4200;

  const lateralScale = clamp(widthFt / 150, 0.4, 1);
  const glyphScale = clamp(widthFt / 150, 0.3, 1);
  const centrelineWidthM = !numbers ? 0 : (tdz ? 3 : stripes ? 1.5 : 1) * FT;
  const sideOuterM = side ? widthM / 2 - 0.45 : 0;
  const sideInnerM = side ? sideOuterM - MARK.sideStripeFt * FT : 0;

  const half = lengthM / 2;
  const makeEnd = (index: 0 | 1): EndMarks => {
    const end = rw.ends[index];
    // A displaced threshold can never be past the middle of the runway (bad data protection).
    const displacedM = pavedLooking ? clamp(end.displacedFt * FT, 0, half - 60 * FT) : 0;
    const displaced = displacedM >= 15;
    const d0 = displaced ? displacedM : 0;
    const designator = paintedDesignator(end.id, country);
    const m: EndMarks = {
      id: end.id,
      paintId: designator.number + designator.letter,
      designator,
      displacedM: d0,
      arrows: displaced && numbers,
      barStartM: d0,
      barEndM: d0,
      stripeStartM: 0,
      stripeEndM: 0,
      stripesPerSide: 0,
      desigStartM: 0,
      desigLengthM: 0,
      desigHalfWidthM: 0,
      desigEndM: 0,
      centrelineStartM: 0,
      aimStartM: 0,
      aimEndM: 0,
      tdzMaxFromThresholdM: 0,
    };
    if (!numbers) return m;
    let cursor = d0;
    if (displaced) {
      m.barEndM = d0 + MARK.thresholdBarFt * FT;
      cursor = m.barEndM;
    }
    if (stripes) {
      m.stripeStartM = cursor + MARK.thresholdStripeFromThresholdFt * FT;
      m.stripeEndM = m.stripeStartM + MARK.thresholdStripeLenFt * FT;
      m.stripesPerSide = thresholdStripesPerSide(widthFt);
      cursor = m.stripeEndM + 40 * FT;
    } else {
      cursor += 30 * FT * Math.max(0.5, glyphScale);
    }
    const glyphH = MARK.glyphHeightFt * FT * glyphScale;
    const glyphGap = MARK.glyphGapFt * FT * glyphScale;
    m.desigStartM = cursor;
    m.desigLengthM = MARK.glyphZoneLengthFt * FT * glyphScale;
    m.desigHalfWidthM = (MARK.glyphZoneWidthFt * FT * glyphScale) / 2;
    m.desigEndM = cursor + (m.designator.letter ? 2 * glyphH + glyphGap : glyphH);
    m.centrelineStartM = m.desigEndM + 40 * FT * Math.max(0.5, glyphScale);
    // Everything must stay on this end's half of the runway.
    if (m.desigEndM > half - 5) {
      m.desigLengthM = 0;
      m.desigEndM = m.desigStartM;
      m.centrelineStartM = Math.min(m.desigStartM, half);
    }
    if (aiming) {
      const a0 = d0 + MARK.aimFromThresholdFt * FT;
      const a1 = a0 + MARK.aimLengthFt * FT;
      if (a1 < half - 30) {
        m.aimStartM = a0;
        m.aimEndM = a1;
      }
    }
    if (tdz) {
      // Groups at 500, 1500, 2000, 2500 and 3000 ft from the threshold (1000 ft is the aiming point);
      // none within 900 ft of the middle of the runway.
      const limit = half - d0 - 900 * FT;
      let last = 0;
      for (const k of [1, 3, 4, 5, 6]) if (k * MARK.tdzSpacingFt * FT + MARK.tdzBarLengthFt * FT <= limit) last = k;
      m.tdzMaxFromThresholdM = last ? last * MARK.tdzSpacingFt * FT + MARK.tdzBarLengthFt * FT + 1 : 0;
    }
    return m;
  };

  const sizeFactor = airportSize === "large" ? 1 : airportSize === "medium" ? 0.75 : 0.45;
  const rubber = pavedLooking ? clamp((lengthFt - 2000) / 5000, 0.12, 1) * sizeFactor : 0;

  return {
    widthM,
    lengthM,
    look,
    marked: numbers,
    centrelineWidthM,
    sideInnerM,
    sideOuterM,
    lateralScale,
    glyphScale,
    rubber,
    ends: [makeEnd(0), makeEnd(1)],
  };
}
