/**
 * Level-of-detail rules and other small decisions of the scenery module that need no graphics
 * (unit-tested in Node).
 */
import { R2D, angleDiff, clamp, smoothstep } from "@/core/math";
import type { Quality } from "@/core/types";
import { makeLocalFrame, toLocal } from "./geo";

/** Airports nearer than this are built … */
export const BUILD_RADIUS_NM = 12;
/** … and thrown away again beyond this. */
export const DISPOSE_RADIUS_NM = 16;
/** Most runways kept on screen at once, per quality level. */
export const RUNWAY_CAP: Record<Quality, number> = { low: 30, medium: 50, high: 80 };

/**
 * How bright the runway lights are, 0 (off) … 1 (fully on), for a daylight level
 * (0 night … 1 day, from core/sun.ts) and the visibility in statute miles.
 * On at night and dusk; by day only when the visibility is poor (below about 3 to 6 miles).
 */
export function lightLevel(daylight01: number, visibilitySm: number): number {
  const night = 1 - smoothstep(0.3, 0.85, daylight01);
  const murk = 0.85 * (1 - smoothstep(3, 6, visibilitySm));
  return clamp(Math.max(night, murk), 0, 1);
}

/** Order in which waiting airports are built (lower = sooner): nearest first; the start airport and airports ahead come earlier. */
export function buildPriority(distNm: number, bearingToTrue: number, trackTrue: number, gsKt: number, isStartAirport: boolean): number {
  let score = distNm;
  if (isStartAirport) score -= 100;
  if (gsKt > 30 && Math.abs(angleDiff(bearingToTrue, trackTrue)) < 35) score -= 3;
  return score;
}

const scratch = [0, 0, 0];

/** Angle of an observer above the horizon as seen from a point on the ground (e.g. a PAPI), degrees. */
export function elevationAngleDeg(fromLat: number, fromLon: number, fromHM: number, lat: number, lon: number, hM: number): number {
  toLocal(makeLocalFrame(fromLat, fromLon, fromHM), lat, lon, hM, scratch);
  return Math.atan2(scratch[2]!, Math.hypot(scratch[0]!, scratch[1]!)) * R2D;
}
