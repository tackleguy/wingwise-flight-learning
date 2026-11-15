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
