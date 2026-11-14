/** Geodesy helpers (spherical earth — adequate for training/simulation purposes). */

export const EARTH_RADIUS_NM = 3440.065;
export const FT_PER_NM = 6076.12;
export const KT_TO_FPS = 1.68781;
const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;

export const toRad = (d: number) => d * D2R;
export const toDeg = (r: number) => r * R2D;

/** Normalize to [0, 360). */
export function norm360(d: number): number {
  const r = d % 360;
  return r < 0 ? r + 360 : r;
}

/** Normalize to (-180, 180]. */
export function norm180(d: number): number {
  let r = norm360(d);
  if (r > 180) r -= 360;
  return r;
}

/** Great-circle distance in nautical miles. */
export function distanceNm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const p1 = toRad(lat1);
  const p2 = toRad(lat2);
  const dp = p2 - p1;
  const dl = toRad(lon2 - lon1);
  const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * EARTH_RADIUS_NM * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Initial true bearing from point 1 to point 2, degrees. */
export function bearingDeg(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const p1 = toRad(lat1);
  const p2 = toRad(lat2);
  const dl = toRad(lon2 - lon1);
  const y = Math.sin(dl) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  return norm360(toDeg(Math.atan2(y, x)));
}

/** Point reached travelling distanceNm along true bearing from origin. */
export function destinationPoint(lat: number, lon: number, brgDeg: number, distNm: number) {
  const d = distNm / EARTH_RADIUS_NM;
  const b = toRad(brgDeg);
  const p1 = toRad(lat);
  const l1 = toRad(lon);
  const p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(b));
  const l2 =
    l1 +
    Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * Math.sin(p2));
  return { lat: toDeg(p2), lon: ((toDeg(l2) + 540) % 360) - 180 };
}

/**
 * Local flat-earth offset (east/north, feet) of a point relative to an origin.
 * Accurate to well under 1% within ~50 nm, which is fine for the 3D scene.
 */
export function localOffsetFt(originLat: number, originLon: number, lat: number, lon: number) {
  const north = (lat - originLat) * 60 * FT_PER_NM;
  const east = (lon - originLon) * 60 * FT_PER_NM * Math.cos(toRad(originLat));
  return { east, north };
}

/** Cross-track distance (nm, + right of course) from a great-circle path start→end. */
export function crossTrackNm(
  startLat: number,
  startLon: number,
  endLat: number,
  endLon: number,
  lat: number,
  lon: number,
): number {
  const d13 = distanceNm(startLat, startLon, lat, lon) / EARTH_RADIUS_NM;
  const t13 = toRad(bearingDeg(startLat, startLon, lat, lon));
  const t12 = toRad(bearingDeg(startLat, startLon, endLat, endLon));
  return Math.asin(Math.sin(d13) * Math.sin(t13 - t12)) * EARTH_RADIUS_NM;
}

/** Signed smallest difference a − b in degrees, in (-180, 180]. */
export function angleDiff(a: number, b: number): number {
  return norm180(a - b);
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Wind triangle: returns wind correction angle, true heading and groundspeed. */
export function windTriangle(trueCourse: number, tas: number, windFromDeg: number, windKt: number) {
  if (tas <= 0) return { wca: 0, heading: trueCourse, groundspeed: 0 };
  const wAngle = toRad(windFromDeg - trueCourse);
  const sinWca = (windKt * Math.sin(wAngle)) / tas;
  if (Math.abs(sinWca) > 1) return { wca: NaN, heading: NaN, groundspeed: NaN };
  const wca = toDeg(Math.asin(sinWca));
  const groundspeed = tas * Math.cos(toRad(wca)) - windKt * Math.cos(wAngle);
  return { wca, heading: norm360(trueCourse + wca), groundspeed };
}

/** Head/crosswind components for a runway (positive headwind, positive = wind from right). */
export function windComponents(runwayHeading: number, windFromDeg: number, windKt: number) {
  const a = toRad(windFromDeg - runwayHeading);
  return { headwind: windKt * Math.cos(a), crosswind: windKt * Math.sin(a) };
}

export function formatFreq(mhz: number): string {
  return mhz.toFixed(Math.round(mhz * 1000) % 10 === 0 ? 2 : 3);
}

export function formatLatLon(lat: number, lon: number): string {
  const f = (v: number, p: string, n: string) => {
    const a = Math.abs(v);
    const d = Math.floor(a);
    const m = (a - d) * 60;
    return `${v >= 0 ? p : n}${d}°${m.toFixed(2).padStart(5, "0")}'`;
  };
  return `${f(lat, "N", "S")} ${f(lon, "E", "W")}`;
}
