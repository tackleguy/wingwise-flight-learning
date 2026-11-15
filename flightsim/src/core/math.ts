/** Units, angles and spherical-earth helpers shared by every module. */

export const FT_PER_M = 3.280839895;
export const M_PER_FT = 0.3048;
export const FT_PER_NM = 6076.11549;
export const M_PER_NM = 1852;
export const KT_PER_FPS = 0.5924838;
export const FPS_PER_KT = 1.6878099;
export const KT_PER_MPS = 1.9438445;
export const LB_PER_GAL_AVGAS = 6.0;
export const EARTH_RADIUS_NM = 3440.065;
export const D2R = Math.PI / 180;
export const R2D = 180 / Math.PI;
export const INHG_PER_HPA = 0.0295299830714;
export const STD_INHG = 29.92126;

export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smoothstep = (e0: number, e1: number, x: number) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};

/** Normalize to [0, 360). */
export function norm360(d: number): number {
  const r = d % 360;
  return r < 0 ? r + 360 : r;
}
/** Normalize to (−180, 180]. */
export function norm180(d: number): number {
  let r = norm360(d);
  if (r > 180) r -= 360;
  return r;
}
/** Signed smallest difference a − b, degrees. */
export const angleDiff = (a: number, b: number) => norm180(a - b);

/** Great-circle distance, nm. */
export function distanceNm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const p1 = lat1 * D2R;
  const p2 = lat2 * D2R;
  const a = Math.sin((p2 - p1) / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(((lon2 - lon1) * D2R) / 2) ** 2;
  return 2 * EARTH_RADIUS_NM * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Initial true bearing from point 1 to point 2, degrees. */
export function bearingDeg(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const p1 = lat1 * D2R;
  const p2 = lat2 * D2R;
  const dl = (lon2 - lon1) * D2R;
  const y = Math.sin(dl) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  return norm360(Math.atan2(y, x) * R2D);
}

/** Point reached travelling `nm` along true bearing `brg` from (lat, lon). */
export function destination(lat: number, lon: number, brg: number, nm: number): { lat: number; lon: number } {
  const d = nm / EARTH_RADIUS_NM;
  const b = brg * D2R;
  const p1 = lat * D2R;
  const l1 = lon * D2R;
  const p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(b));
  const l2 = l1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * Math.sin(p2));
  return { lat: p2 * R2D, lon: ((l2 * R2D + 540) % 360) - 180 };
}

/** Local flat-earth offset (metres east / north) of a point relative to an origin — fine within ~50 km. */
export function localOffsetM(lat0: number, lon0: number, lat: number, lon: number): { east: number; north: number } {
  const north = (lat - lat0) * 60 * M_PER_NM;
  const east = norm180(lon - lon0) * 60 * M_PER_NM * Math.cos(lat0 * D2R);
  return { east, north };
}

/** Headwind (+) / crosswind (+ = from the right) components of a wind for a given heading. */
export function windComponents(headingTrue: number, windFromTrue: number, windKt: number) {
  const a = (windFromTrue - headingTrue) * D2R;
  return { headwind: windKt * Math.cos(a), crosswind: windKt * Math.sin(a) };
}

// ---------------------------------------------------------------- ISA atmosphere helpers

/** Pressure altitude (ft) for a static pressure (inHg), ISA troposphere. */
export function pressureAltitudeFt(staticInHg: number): number {
  return 145442.16 * (1 - Math.pow(staticInHg / STD_INHG, 0.190263));
}
/** Static pressure (inHg) at a pressure altitude (ft), ISA troposphere. */
export function pressureAtAltitudeInHg(pressureAltFt: number): number {
  return STD_INHG * Math.pow(1 - pressureAltFt / 145442.16, 5.255876);
}
/** What an altimeter indicates for a static pressure and Kollsman setting. */
export function indicatedAltitudeFt(staticInHg: number, settingInHg: number): number {
  return pressureAltitudeFt(staticInHg) - pressureAltitudeFt(settingInHg);
}
/** ISA temperature at a pressure altitude, °C. */
export const isaTempC = (pressureAltFt: number) => (pressureAltFt < 36089 ? 15 - 0.0019812 * pressureAltFt : -56.5);
/** Density altitude (ft) — rule-of-thumb form used in pilot training (120 ft per °C from ISA). */
export const densityAltitudeFt = (pressureAltFt: number, oatC: number) => pressureAltFt + 118.8 * (oatC - isaTempC(pressureAltFt));

export function formatLatLon(lat: number, lon: number): string {
  const f = (v: number, pos: string, neg: string) => {
    const a = Math.abs(v);
    const d = Math.floor(a);
    return `${v >= 0 ? pos : neg}${d}°${((a - d) * 60).toFixed(2).padStart(5, "0")}'`;
  };
  return `${f(lat, "N", "S")} ${f(lon, "E", "W")}`;
}
