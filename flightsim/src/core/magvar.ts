/**
 * Magnetic variation (declination) from the World Magnetic Model (WMM, public domain — NOAA/NCEI
 * and the British Geological Survey), via the open-source `geomagnetism` package (Apache-2.0).
 * East is positive:  magnetic heading = true heading − variation.
 */
import geomagnetism from "geomagnetism";

let model: ReturnType<typeof geomagnetism.model> | null = null;
const cache = new Map<number, number>();

export function magneticVariation(lat: number, lon: number): number {
  const key = Math.round(lat * 10) * 10000 + Math.round((lon + 180) * 10);
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  try {
    model ??= geomagnetism.model(new Date(), { allowOutOfBoundsModel: true });
    const decl = model.point([Math.max(-89.9, Math.min(89.9, lat)), lon]).decl;
    const v = Number.isFinite(decl) ? decl : 0;
    if (cache.size > 5000) cache.clear();
    cache.set(key, v);
    return v;
  } catch {
    return 0;
  }
}

export const trueToMag = (trueDeg: number, magVar: number) => (((trueDeg - magVar) % 360) + 360) % 360;
export const magToTrue = (magDeg: number, magVar: number) => (((magDeg + magVar) % 360) + 360) % 360;

// ---------------------------------------------------------------- full field (added by [instruments])

/** The Earth's magnetic field at a place, as the magnetic compass feels it. */
export interface MagneticField {
  /** Declination (variation), degrees, east positive — the same value as `magneticVariation`. */
  declDeg: number;
  /** Inclination ("dip"), degrees: how steeply the field points into the ground (+, northern magnetic hemisphere) or out of it (−). 0 at the magnetic equator. */
  inclDeg: number;
  /** Strength of the horizontal part of the field (the part that turns a compass), nanotesla. */
  horizNt: number;
  /** Total field strength, nanotesla. */
  totalNt: number;
}

const fieldCache = new Map<number, MagneticField>();

/**
 * Declination, dip and strength of the magnetic field (World Magnetic Model). Used by the
 * magnetic-compass model: dip is what causes the compass turning and acceleration errors.
 * Results are cached per 0.1° square. If the model cannot be evaluated a simple tilted-bar-magnet
 * estimate is returned instead.
 */
export function magneticField(lat: number, lon: number): MagneticField {
  const key = Math.round(lat * 10) * 10000 + Math.round((lon + 180) * 10);
  const hit = fieldCache.get(key);
  if (hit) return hit;
  let out: MagneticField;
  try {
    model ??= geomagnetism.model(new Date(), { allowOutOfBoundsModel: true });
    const p = model.point([Math.max(-89.9, Math.min(89.9, lat)), lon]);
    if (![p.decl, p.incl, p.h, p.f].every(Number.isFinite)) throw new Error("bad field");
    out = { declDeg: p.decl, inclDeg: p.incl, horizNt: p.h, totalNt: p.f };
  } catch {
    const latRad = (Math.max(-89.9, Math.min(89.9, lat)) * Math.PI) / 180;
    const inclDeg = (Math.atan(2 * Math.tan(latRad)) * 180) / Math.PI;
    const horizNt = 30000 * Math.cos(latRad);
    out = { declDeg: 0, inclDeg, horizNt, totalNt: horizNt / Math.max(0.02, Math.cos((inclDeg * Math.PI) / 180)) };
  }
  if (fieldCache.size > 5000) fieldCache.clear();
  fieldCache.set(key, out);
  return out;
}
