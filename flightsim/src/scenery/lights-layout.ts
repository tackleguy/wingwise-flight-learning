/**
 * Where the airport lights go and what colour they show (no drawing, no CesiumJS — unit-tested).
 *
 * IMPORTANT (honesty): the open airport data only says whether a runway is lighted. It has no
 * positions for edge lights, approach lights, PAPIs or beacons. Everything here is a standard,
 * REPRESENTATIVE layout — good for learning what the lights mean, not a copy of the real airport.
 */
import type { AirportSize, Runway } from "@/data/world-data";
import type { Quality } from "@/core/types";
import { M_PER_FT } from "@/core/math";
import type { RunwayLayout } from "./layout";

const FT = M_PER_FT;

export const LIGHT_TYPE = {
  /** Same colour from every direction. */
  steady: 0,
  /** Colour A when the viewer is on the side `dir` points to, colour B from the other side. */
  sided: 1,
  /** PAPI unit: white above its transition angle, red below; only visible from the approach side. */
  papi: 2,
  /** Rotating airport beacon: alternating green and white flashes. */
  beacon: 3,
  /** Sequenced white flasher of an approach lighting system. */
  flash: 4,
} as const;

export type Rgba = readonly [number, number, number, number];

export const COLOR = {
  white: [255, 240, 205, 255],
  approachWhite: [255, 250, 235, 255],
  amber: [255, 170, 30, 255],
  green: [30, 255, 110, 255],
  red: [255, 35, 25, 255],
  papiWhite: [255, 252, 240, 255],
  papiRed: [255, 25, 15, 255],
  beaconGreen: [40, 255, 110, 255],
  beaconWhite: [255, 255, 245, 255],
  none: [0, 0, 0, 0],
} as const satisfies Record<string, Rgba>;

export interface LightSpec {
  /** Runway coordinates, metres: s to the right of the A→B direction, t along from end A. */
  s: number;
  t: number;
  /** Height above the runway surface (or above the ground when `onGround`), metres. */
  h: number;
  /** True for lights outside the pavement area (approach lights): they stand on the real ground. */
  onGround: boolean;
  type: number;
  colorA: Rgba;
  colorB: Rgba;
  /** Direction in runway coordinates (unit vector). "sided": where colour A is seen from. "papi": toward the approaching aircraft. */
  dirS: number;
  dirT: number;
  /** PAPI: transition angle in degrees. Beacon / flasher: phase 0…1. */
  param: number;
  /** Diameter of the glow when seen close up, metres. */
  sizeM: number;
  /** Brightness relative to a runway edge light. */
  intensity: number;
  /** 1 = also shown in daylight (the PAPI), 0 = night / low visibility only. */
  day: number;
  /** PAPI only: position of the unit in its row, in unit spacings along +s from the middle of the four (−1.5 … 1.5). */
  row: number;
}

// ---------------------------------------------------------------- PAPI

/**
 * Transition angles of the four PAPI units for a 3° approach, from the unit FARTHEST from the
 * runway to the one NEAREST it. A unit shows white when you are above its angle, red below.
 */
export const PAPI_ANGLES_DEG = [2.5, 2 + 5 / 6, 3 + 1 / 6, 3.5] as const;
/** Half-width of the pink transition between red and white, degrees. */
export const PAPI_TRANSITION_DEG = 0.03;
/** Distance of the PAPI from the landing threshold on a normal-length runway (3° path crossing the threshold at 50 ft). */
export const PAPI_FROM_THRESHOLD_M = (50 / Math.tan((3 * Math.PI) / 180)) * FT;

/** Distance of the first unit from the runway edge and between units, metres (50 ft and 30 ft). */
export const PAPI_FIRST_UNIT_M = 15;
export const PAPI_UNIT_SPACING_M = 9;

/** What the four lights show at an angle above the horizon: e.g. "WWRR" (farthest from the runway first). */
export function papiPattern(angleDeg: number): string {
  return PAPI_ANGLES_DEG.map((a) => (angleDeg > a ? "W" : "R")).join("");
}

export function papiWhiteCount(angleDeg: number): number {
  return PAPI_ANGLES_DEG.reduce((n, a) => n + (angleDeg > a ? 1 : 0), 0);
}

export function papiMeaning(whiteCount: number): string {
  return ["too low", "slightly low", "on path", "slightly high", "too high"][whiteCount] ?? "";
}

/** A PAPI installation at one runway end (for the read-out in the UI / tests). */
export interface PapiSite {
  endIndex: 0 | 1;
  endId: string;
  /** Runway coordinates of the middle of the four units. */
  s: number;
  t: number;
}

// ---------------------------------------------------------------- runway lights

export interface RunwayLights {
  lights: LightSpec[];
  papis: PapiSite[];
}

const light = (s: number, t: number, h: number, type: number, colorA: Rgba, sizeM: number, intensity: number, extra: Partial<LightSpec> = {}): LightSpec => ({
  s,
  t,
  h,
  onGround: false,
  type,
  colorA,
  colorB: COLOR.none,
  dirS: 0,
  dirT: 1,
  param: 0,
  sizeM,
  intensity,
  day: 0,
  row: 0,
  ...extra,
});

/** Length of the amber "caution zone" at the far end of the edge lights: the last 2,000 ft or half the runway, whichever is less. */
export function cautionZoneM(lengthM: number): number {
  return Math.min(2000 * FT, lengthM / 2);
}

/** Maximum spacing of runway edge lights, metres (200 ft). */
export const EDGE_SPACING_M = 200 * FT;

/** Actual spacing of the edge lights of a runway: equal gaps of at most 200 ft from end to end. */
export const edgeSpacingM = (lengthM: number) => lengthM / Math.max(2, Math.ceil(lengthM / EDGE_SPACING_M));

/**
 * All lights of one runway. Nothing is returned for unlighted runways.
 * Quality: low = edge, threshold/end lights and PAPI; medium adds approach lights; high adds
 * centreline lights and denser approach lights at large airports.
 */
export function runwayLights(rw: Runway, layout: RunwayLayout, lengthM: number, airportSize: AirportSize, quality: Quality): RunwayLights {
  const out: LightSpec[] = [];
  const papis: PapiSite[] = [];
  if (!rw.lighted || lengthM < 150) return { lights: out, papis };
  const hw = layout.widthM / 2;
  const paved = rw.paved;
  const dispA = layout.ends[0].displacedM;
  const dispB = layout.ends[1].displacedM;
  const lengthFt = lengthM / FT;

  // ---- edge lights: white, every 200 ft or less; amber in the caution zone as seen by a pilot
  //      rolling toward that end; red in front of a displaced threshold as seen on approach.
  const spacing = edgeSpacingM(lengthM);
  const n = Math.round(lengthM / spacing);
  const caution = paved && lengthFt >= 4000 ? cautionZoneM(lengthM) : 0;
  const edgeS = hw + 3;
  for (let i = 0; i <= n; i++) {
    const t = i * spacing;
    // Colour seen by a pilot looking in the A→B direction (viewer on the A side of the light) and in the B→A direction.
    let fromA: Rgba = COLOR.white;
    let fromB: Rgba = COLOR.white;
    if (caution > 0 && t > lengthM - caution - 0.5) fromA = COLOR.amber;
    if (caution > 0 && t < caution + 0.5) fromB = COLOR.amber;
    if (dispA > 0 && t < dispA - 1) fromA = COLOR.red;
    if (dispB > 0 && t > lengthM - dispB + 1) fromB = COLOR.red;
    for (const side of [-1, 1]) {
      if (fromA === fromB) out.push(light(side * edgeS, t, 0.35, LIGHT_TYPE.steady, fromA, 0.5, 1));
      else out.push(light(side * edgeS, t, 0.35, LIGHT_TYPE.sided, fromA, 0.5, 1, { colorB: fromB, dirS: 0, dirT: -1 }));
    }
  }

  // ---- threshold (green, seen on approach) and runway end (red, seen from the runway) lights
  const endRow = (endIndex: 0 | 1) => {
    const disp = endIndex === 0 ? dispA : dispB;
    // toward the approaching aircraft, in runway coordinates
    const approachT = endIndex === 0 ? -1 : 1;
    const tAt = (d: number) => (endIndex === 0 ? d : lengthM - d);
    const across: number[] = [];
    if (airportSize === "small" || hw < 13) {
      // two groups of four near the runway edges
      for (let k = 0; k < 4; k++) {
        const x = hw - k * Math.min(1.5, hw / 5);
        across.push(-x, x);
      }
    } else {
      const count = Math.max(8, Math.min(22, Math.round((2 * hw) / 3)));
      for (let k = 0; k < count; k++) across.push(-hw + (2 * hw * k) / (count - 1));
    }
    if (disp > 0) {
      // Displaced: green wing bars beside the runway at the threshold, red lights at the pavement end.
      for (let k = 0; k < 5; k++) {
        for (const side of [-1, 1]) out.push(light(side * (hw + 4.5 + k * 1.5), tAt(disp), 0.35, LIGHT_TYPE.sided, COLOR.green, 0.55, 1.4, { dirT: approachT }));
      }
      for (const x of across) out.push(light(x, tAt(-1.5), 0.3, LIGHT_TYPE.sided, COLOR.red, 0.55, 1.2, { dirT: -approachT }));
    } else {
      for (const x of across) out.push(light(x, tAt(-1.5), 0.3, LIGHT_TYPE.sided, COLOR.green, 0.55, 1.4, { colorB: COLOR.red, dirT: approachT }));
    }
  };
  endRow(0);
  endRow(1);

  // ---- PAPI: four units on the left of the runway, about 1,000 ft past the threshold (SYNTHETIC position)
  if (paved && lengthFt >= 1800) {
    for (const endIndex of [0, 1] as const) {
      const disp = endIndex === 0 ? dispA : dispB;
      const usable = lengthM - disp;
      const dist = Math.min(PAPI_FROM_THRESHOLD_M, usable * 0.28);
      const t = endIndex === 0 ? disp + dist : lengthM - disp - dist;
      const left = endIndex === 0 ? -1 : 1; // left side for the landing pilot
      const approachT = endIndex === 0 ? -1 : 1;
      for (let j = 0; j < 4; j++) {
        // j = 0 is the unit nearest the runway (highest angle)
        out.push(
          light(left * (hw + PAPI_FIRST_UNIT_M + j * PAPI_UNIT_SPACING_M), t, 0.6, LIGHT_TYPE.papi, COLOR.papiWhite, 0.6, 3, {
            colorB: COLOR.papiRed,
            dirT: approachT,
            param: PAPI_ANGLES_DEG[3 - j]!,
            day: 1,
            row: left * (j - 1.5),
          }),
        );
      }
      papis.push({ endIndex, endId: rw.ends[endIndex].id, s: left * (hw + PAPI_FIRST_UNIT_M + 1.5 * PAPI_UNIT_SPACING_M), t });
    }
  }

  // ---- approach lights (medium and large airports): a centreline row of short bars before the threshold
  if (paved && airportSize !== "small" && quality !== "low" && lengthFt >= 3500) {
    const large = airportSize === "large";
    const systemM = (large ? 2400 : 1400) * FT;
    const stationM = (large && quality === "high" ? 100 : 200) * FT;
    for (const endIndex of [0, 1] as const) {
      const disp = endIndex === 0 ? dispA : dispB;
      const approachT = endIndex === 0 ? -1 : 1;
      const tAt = (d: number) => (endIndex === 0 ? d : lengthM - d);
      const base = { onGround: true, colorB: COLOR.none, dirT: approachT, day: 0 } as const;
      const stations: number[] = [];
      for (let x = stationM; x <= systemM + 1; x += stationM) if (disp - x < -8) stations.push(x);
      for (const x of stations) {
        const t = tAt(disp - x);
        const bar = large ? [-2, -1, 0, 1, 2] : [-1.5, 0, 1.5];
        for (const s of bar) out.push(light(s, t, 1, LIGHT_TYPE.sided, COLOR.approachWhite, 0.5, 1.5, base));
        // the wide "1,000 ft bar" that tells the pilot how far the threshold is
        if (large && Math.abs(x - 1000 * FT) < stationM / 2) {
          for (let k = 0; k < 8; k++) for (const side of [-1, 1]) out.push(light(side * (4.5 + k * 1.5), t, 1, LIGHT_TYPE.sided, COLOR.approachWhite, 0.5, 1.5, base));
        }
      }
      // sequenced flashers ("the rabbit") on the outer part, running toward the threshold twice a second
      if (large) {
        const outer = stations.filter((x) => x > 1000 * FT + 1 && Math.abs((x / (200 * FT)) % 1) < 0.01);
        outer.forEach((x, i) => {
          out.push(light(0, tAt(disp - x), 1.2, LIGHT_TYPE.flash, COLOR.approachWhite, 0.9, 5, { onGround: true, dirT: approachT, param: ((outer.length - 1 - i) / Math.max(1, outer.length)) * 0.5, day: 0 }));
        });
      }
    }
  }

  // ---- centreline lights (large airports, long runways, high quality): white, then alternating
  //      red/white for the last 3,000 ft and all red for the last 1,000 ft, in the direction of travel
  if (paved && airportSize === "large" && quality === "high" && lengthFt >= 8000) {
    const step = 50 * FT;
    const colorFor = (remainingM: number, index: number): Rgba => (remainingM < 1000 * FT ? COLOR.red : remainingM < 3000 * FT && index % 2 === 0 ? COLOR.red : COLOR.white);
    let index = 0;
    for (let t = dispA + step; t < lengthM - dispB - step / 2; t += step, index++) {
      const fromA = colorFor(lengthM - t, index);
      const fromB = colorFor(t, index);
      if (fromA === fromB) out.push(light(0, t, 0.03, LIGHT_TYPE.steady, fromA, 0.3, 0.6));
      else out.push(light(0, t, 0.03, LIGHT_TYPE.sided, fromA, 0.3, 0.6, { colorB: fromB, dirT: -1 }));
    }
  }

  return { lights: out, papis };
}

/** Deterministic 0…1 number from a string (so each airport's beacon turns with its own phase). */
export function hash01(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10007) / 10007;
}

/** The airport beacon (rotating green/white) as a light at a local east/north position. */
export function beaconLight(ident: string): Omit<LightSpec, "s" | "t"> {
  return {
    h: 16,
    onGround: true,
    type: LIGHT_TYPE.beacon,
    colorA: COLOR.beaconGreen,
    colorB: COLOR.beaconWhite,
    dirS: 0,
    dirT: 1,
    param: hash01(ident),
    sizeM: 1.4,
    intensity: 6,
    day: 0,
    row: 0,
  };
}
