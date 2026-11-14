/**
 * Avionics helpers — small, pure, backwards-compatible utilities used by the TeachX avionics
 * component library (PFD, MFD, GPS navigator, radios). Nothing here changes engine state.
 */
import { AIRPORTS, NAVAIDS } from "@/lib/data/airports";
import type { Airport, Navaid } from "@/lib/data/types";
import { bearingDeg, clamp, destinationPoint, distanceNm, norm360, toDeg, toRad } from "@/lib/geo";
import { terrainElevationFt } from "./environment";
import type { AircraftState, Waypoint } from "./types";

// ---------------------------------------------------------------- formatting

export const fmtNav = (mhz: number) => mhz.toFixed(2);
export const fmtCom = (mhz: number) => mhz.toFixed(3);
export const pad3 = (deg: number) => String(Math.round(norm360(deg)) || 360).padStart(3, "0");

/** Minutes → "h:mm" or "mm:ss". */
export function fmtEte(min: number): string {
  if (!Number.isFinite(min) || min <= 0) return "__:__";
  if (min >= 60) {
    const h = Math.floor(min / 60);
    return `${h}:${String(Math.floor(min % 60)).padStart(2, "0")}`;
  }
  const s = Math.round(min * 60);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

// ---------------------------------------------------------------- radio tuning

const mod = (n: number, m: number) => ((n % m) + m) % m;

/** NAV receivers: 108.00–117.95 MHz in 50 kHz steps. `part` = "mhz" (outer knob) or "khz" (inner knob). */
export function stepNavFreq(freq: number, part: "mhz" | "khz", dir: number): number {
  const n = Math.round(freq * 20);
  let mhz = Math.floor(n / 20);
  let k = n - mhz * 20;
  if (part === "mhz") mhz = 108 + mod(mhz - 108 + dir, 10);
  else k = mod(k + dir, 20);
  return Math.round((mhz + k / 20) * 100) / 100;
}

/** COM radios: 118.000–136.975 MHz in 25 kHz steps. */
export function stepComFreq(freq: number, part: "mhz" | "khz", dir: number): number {
  const n = Math.round(freq * 40);
  let mhz = Math.floor(n / 40);
  let k = n - mhz * 40;
  if (part === "mhz") mhz = 118 + mod(mhz - 118 + dir, 19);
  else k = mod(k + dir, 40);
  return Math.round((mhz + k / 40) * 1000) / 1000;
}

/** ADF: 190–1750 kHz. */
export function stepAdf(khz: number, step: number): number {
  return clamp(Math.round(khz + step), 190, 1750);
}

const MORSE: Record<string, string> = {
  A: ".-", B: "-...", C: "-.-.", D: "-..", E: ".", F: "..-.", G: "--.", H: "....", I: "..", J: ".---", K: "-.-", L: ".-..", M: "--",
  N: "-.", O: "---", P: ".--.", Q: "--.-", R: ".-.", S: "...", T: "-", U: "..-", V: "...-", W: ".--", X: "-..-", Y: "-.--", Z: "--..",
  "0": "-----", "1": ".----", "2": "..---", "3": "...--", "4": "....-", "5": ".....", "6": "-....", "7": "--...", "8": "---..", "9": "----.",
};

/** Morse code for a station identifier, letters separated by spaces (e.g. "OAK" → "--- .- -.-"). */
export function morse(ident: string): string {
  return ident
    .toUpperCase()
    .split("")
    .map((c) => MORSE[c] ?? "")
    .filter(Boolean)
    .join("  ");
}

// ---------------------------------------------------------------- wind

/**
 * Wind computed the way a glass cockpit does it: ground vector (GPS track & groundspeed) minus
 * air vector (heading & true airspeed). Returns FROM direction (true) and speed.
 */
export function computedWind(a: Pick<AircraftState, "heading" | "tasKt" | "track" | "gsKt" | "onGround">): { valid: boolean; fromTrue: number; kt: number } {
  if (a.onGround || a.tasKt < 30 || a.gsKt < 20) return { valid: false, fromTrue: 0, kt: 0 };
  const airN = a.tasKt * Math.cos(toRad(a.heading));
  const airE = a.tasKt * Math.sin(toRad(a.heading));
  const gN = a.gsKt * Math.cos(toRad(a.track));
  const gE = a.gsKt * Math.sin(toRad(a.track));
  const wN = gN - airN;
  const wE = gE - airE;
  const kt = Math.hypot(wN, wE);
  const toDir = norm360(toDeg(Math.atan2(wE, wN)));
  return { valid: true, fromTrue: norm360(toDir + 180), kt };
}

// ---------------------------------------------------------------- identifiers & waypoints

export function longestRunway(a: Airport) {
  return a.runways.reduce((best, r) => (r.lengthFt > best.lengthFt ? r : best), a.runways[0]!);
}

export function waypointFromAirport(a: Airport): Waypoint {
  return { id: a.icao, lat: a.lat, lon: a.lon, kind: "airport", label: a.name };
}

export function waypointFromNavaid(n: Navaid): Waypoint {
  return { id: n.id, lat: n.lat, lon: n.lon, kind: n.type === "FIX" ? "fix" : "vor", label: `${n.name} ${n.type}` };
}

export interface IdentHit {
  id: string;
  name: string;
  kind: "airport" | "navaid";
  type: string;
  lat: number;
  lon: number;
  airport?: Airport;
  navaid?: Navaid;
  distNm?: number;
}

/** Identifier/name search across AIRPORTS and NAVAIDS (prefix matches on the identifier rank first). */
export function searchIdentifiers(query: string, near?: { lat: number; lon: number }, limit = 8): IdentHit[] {
  const q = query.trim().toUpperCase();
  if (!q) return [];
  const hits: (IdentHit & { score: number })[] = [];
  for (const a of AIRPORTS) {
    const ids = [a.icao, a.iata ?? ""];
    const idx = ids.some((i) => i.startsWith(q)) ? 0 : ids.some((i) => i.includes(q)) ? 1 : a.name.toUpperCase().includes(q) || a.city.toUpperCase().includes(q) ? 2 : -1;
    if (idx < 0) continue;
    const h: IdentHit & { score: number } = { id: a.icao, name: a.name, kind: "airport", type: "APT", lat: a.lat, lon: a.lon, airport: a, score: idx };
    if (near) h.distNm = distanceNm(near.lat, near.lon, a.lat, a.lon);
    hits.push(h);
  }
  for (const n of NAVAIDS) {
    const idx = n.id.startsWith(q) ? 0 : n.id.includes(q) ? 1 : n.name.toUpperCase().includes(q) ? 2 : -1;
    if (idx < 0) continue;
    const h: IdentHit & { score: number } = { id: n.id, name: n.name, kind: "navaid", type: n.type, lat: n.lat, lon: n.lon, navaid: n, score: idx };
    if (near) h.distNm = distanceNm(near.lat, near.lon, n.lat, n.lon);
    hits.push(h);
  }
  hits.sort((x, y) => x.score - y.score || (x.distNm ?? 0) - (y.distNm ?? 0) || x.id.localeCompare(y.id));
  return hits.slice(0, limit).map(({ score: _s, ...h }) => h);
}

/** Exact identifier → waypoint (airport ICAO/IATA first, then navaid). Nearest wins for duplicate navaid ids. */
export function resolveIdentifier(id: string, near?: { lat: number; lon: number }): Waypoint | null {
  const k = id.trim().toUpperCase();
  if (!k) return null;
  const ap = AIRPORTS.find((a) => a.icao === k || a.iata === k);
  if (ap) return waypointFromAirport(ap);
  const navs = NAVAIDS.filter((n) => n.id === k);
  if (navs.length === 0) return null;
  const n = near ? navs.reduce((b, x) => (distanceNm(near.lat, near.lon, x.lat, x.lon) < distanceNm(near.lat, near.lon, b.lat, b.lon) ? x : b)) : navs[0]!;
  return waypointFromNavaid(n);
}

export function hitToWaypoint(h: IdentHit): Waypoint {
  if (h.airport) return waypointFromAirport(h.airport);
  if (h.navaid) return waypointFromNavaid(h.navaid);
  return { id: h.id, lat: h.lat, lon: h.lon, kind: "user" };
}

export interface NearestAirport {
  airport: Airport;
  distNm: number;
  /** Magnetic bearing to the airport */
  brgMag: number;
  longestFt: number;
}

export function nearestAirports(lat: number, lon: number, magVar: number, n = 8): NearestAirport[] {
  return AIRPORTS.map((a) => ({
    airport: a,
    distNm: distanceNm(lat, lon, a.lat, a.lon),
    brgMag: norm360(bearingDeg(lat, lon, a.lat, a.lon) - magVar),
    longestFt: longestRunway(a).lengthFt,
  }))
    .sort((x, y) => x.distNm - y.distNm)
    .slice(0, n);
}

/** Leg table for a flight plan: per-leg distance and magnetic desired track. */
export function legTable(fp: Waypoint[], magVar: number) {
  return fp.map((w, i) => {
    const prev = i > 0 ? fp[i - 1]! : undefined;
    return {
      wp: w,
      distNm: prev ? distanceNm(prev.lat, prev.lon, w.lat, w.lon) : 0,
      dtk: prev ? norm360(bearingDeg(prev.lat, prev.lon, w.lat, w.lon) - magVar) : 0,
    };
  });
}

// ---------------------------------------------------------------- map projection

export interface MapProjection {
  /** pixels per nm */
  scale: number;
  cx: number;
  cy: number;
  lat0: number;
  lon0: number;
  /** map rotation (deg) — track for track-up, 0 for north-up */
  rot: number;
}

/** Project lat/lon → screen px (y down) for a map centred on (lat0, lon0) at (cx, cy). */
export function project(p: MapProjection, lat: number, lon: number): { x: number; y: number } {
  const east = (lon - p.lon0) * 60 * Math.cos(toRad(p.lat0));
  const north = (lat - p.lat0) * 60;
  const x = east * p.scale;
  const y = -north * p.scale;
  const t = toRad(p.rot);
  const c = Math.cos(t);
  const s = Math.sin(t);
  return { x: p.cx + x * c + y * s, y: p.cy - x * s + y * c };
}

// ---------------------------------------------------------------- terrain grid (cached)

export interface TerrainCell {
  /** cell centre offset from the grid anchor, nm (east, north) */
  e: number;
  n: number;
  elev: number;
}
export interface TerrainGrid {
  key: string;
  anchorLat: number;
  anchorLon: number;
  cellNm: number;
  cells: TerrainCell[];
}

const CELL_STEPS = [0.25, 0.5, 1, 2, 4, 8];
const elevCache = new Map<string, number>();
const gridCache = new Map<string, TerrainGrid>();

function cachedElev(cellNm: number, i: number, j: number, latDeg: number, lonDeg: number): number {
  const k = `${cellNm}:${i}:${j}`;
  let v = elevCache.get(k);
  if (v === undefined) {
    v = terrainElevationFt((i + 0.5) * latDeg, (j + 0.5) * lonDeg);
    if (elevCache.size > 60000) elevCache.clear();
    elevCache.set(k, v);
  }
  return v;
}

/**
 * Coarse terrain elevation grid around a position, sampled from the same `terrainElevationFt`
 * the flight model uses. Cached per region so moving maps don't re-sample every frame.
 */
export function terrainGridAround(lat: number, lon: number, rangeNm: number): TerrainGrid {
  const target = rangeNm / 14;
  const cellNm = CELL_STEPS.find((c) => c >= target) ?? 8;
  const latDeg = cellNm / 60;
  // Fix longitude spacing per whole-degree latitude band so cell keys are stable.
  const lonDeg = cellNm / (60 * Math.cos(toRad(Math.round(lat))));
  const n = Math.ceil((rangeNm * 1.6) / cellNm);
  const ci = Math.floor(lat / latDeg);
  const cj = Math.floor(lon / lonDeg);
  const snap = 4;
  const i0 = Math.floor(ci / snap) * snap;
  const j0 = Math.floor(cj / snap) * snap;
  const key = `${cellNm}:${i0}:${j0}:${n}:${Math.round(lat)}`;
  const hit = gridCache.get(key);
  if (hit) return hit;
  const anchorLat = i0 * latDeg;
  const anchorLon = j0 * lonDeg;
  const cosA = Math.cos(toRad(anchorLat));
  const cells: TerrainCell[] = [];
  for (let i = i0 - n; i <= i0 + n; i++) {
    for (let j = j0 - n; j <= j0 + n; j++) {
      const elev = cachedElev(cellNm, i, j, latDeg, lonDeg);
      cells.push({ e: ((j + 0.5) * lonDeg - anchorLon) * 60 * cosA, n: ((i + 0.5) * latDeg - anchorLat) * 60, elev });
    }
  }
  const grid: TerrainGrid = { key, anchorLat, anchorLon, cellNm, cells };
  if (gridCache.size > 12) gridCache.delete(gridCache.keys().next().value as string);
  gridCache.set(key, grid);
  return grid;
}

/** Terrain colour relative to aircraft altitude: red within 100 ft, yellow within 1000 ft. */
export function terrainAlertLevel(elevFt: number, altFt: number): "red" | "yellow" | "none" {
  if (elevFt > altFt - 100) return "red";
  if (elevFt > altFt - 1000) return "yellow";
  return "none";
}

// ---------------------------------------------------------------- synthetic traffic (TIS-style)

export interface SyntheticTarget {
  id: string;
  lat: number;
  lon: number;
  /** Relative altitude, ft (+ above) */
  relAltFt: number;
  /** −1 descending, 0 level, 1 climbing */
  trend: -1 | 0 | 1;
  /** True track of the target */
  track: number;
  distNm: number;
  /** Traffic advisory: close in both distance and altitude */
  ta: boolean;
  proximate: boolean;
}

const TRAFFIC_DEF = [
  { id: "T1", r0: 3.5, r1: 2.6, w: 0.011, ph: 0.4, alt: 600, altW: 0.004, altPh: 0 },
  { id: "T2", r0: 6, r1: 3, w: -0.008, ph: 2.1, alt: -900, altW: 0.006, altPh: 1 },
  { id: "T3", r0: 2.4, r1: 1.9, w: 0.017, ph: 4.0, alt: 300, altW: 0.009, altPh: 2.5 },
  { id: "T4", r0: 9, r1: 3, w: 0.006, ph: 5.3, alt: 1800, altW: 0.003, altPh: 4 },
];

/**
 * 4 deterministic, synthetic traffic targets that orbit around the aircraft (relative positions)
 * so that TIS-style traffic symbology can be practised. Purely educational — not real traffic.
 */
export function syntheticTraffic(simTimeSec: number, lat: number, lon: number): SyntheticTarget[] {
  const t = simTimeSec;
  return TRAFFIC_DEF.map((d) => {
    const ang = d.ph + t * d.w;
    const r = d.r0 + Math.sin(t * d.w * 1.7 + d.ph) * d.r1;
    const dist = Math.max(0.3, r);
    const brg = norm360(toDeg(ang));
    const pos = destinationPoint(lat, lon, brg, dist);
    const altPhase = t * d.altW + d.altPh;
    const relAltFt = d.alt * Math.cos(altPhase);
    const dAlt = -Math.sin(altPhase) * d.alt;
    const trend: -1 | 0 | 1 = Math.abs(dAlt) < Math.abs(d.alt) * 0.3 ? 0 : dAlt > 0 ? 1 : -1;
    const track = norm360(brg + (d.w > 0 ? 90 : -90));
    const ta = dist < 2 && Math.abs(relAltFt) < 600;
    return { id: d.id, lat: pos.lat, lon: pos.lon, relAltFt, trend, track, distNm: dist, ta, proximate: dist < 6 && Math.abs(relAltFt) < 1200 };
  });
}

// ---------------------------------------------------------------- simulated precipitation cells

export interface PrecipCell {
  lat: number;
  lon: number;
  radiusNm: number;
  /** 1 light (green), 2 moderate (yellow), 3 heavy (red) */
  intensity: 1 | 2 | 3;
}

function h2(a: number, b: number) {
  const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/** Deterministic simulated precipitation cells on a 6-nm lattice around a position (educational). */
export function precipitationCells(lat: number, lon: number, rangeNm: number, turbulence: number): PrecipCell[] {
  const stepDeg = 6 / 60;
  const n = Math.min(14, Math.ceil(rangeNm / 6) + 1);
  const ci = Math.round(lat / stepDeg);
  const cj = Math.round(lon / stepDeg);
  const out: PrecipCell[] = [];
  for (let i = ci - n; i <= ci + n; i++) {
    for (let j = cj - n; j <= cj + n; j++) {
      const r = h2(i, j);
      if (r > 0.33) continue;
      const jitterLat = (h2(i + 7, j) - 0.5) * stepDeg;
      const jitterLon = (h2(i, j + 7) - 0.5) * stepDeg;
      const k = h2(i + 3, j + 5);
      const intensity: 1 | 2 | 3 = k > 0.85 - turbulence * 0.08 ? 3 : k > 0.5 - turbulence * 0.05 ? 2 : 1;
      out.push({ lat: i * stepDeg + jitterLat, lon: j * stepDeg + jitterLon, radiusNm: 1.2 + r * 7, intensity });
    }
  }
  return out;
}

// ---------------------------------------------------------------- misc

/** Rate-of-change tracker for trend vectors (call once per render with value & sim time). */
export function makeRateTracker(tau = 0.8) {
  let prevV = NaN;
  let prevT = NaN;
  let rate = 0;
  return (v: number, t: number) => {
    if (Number.isFinite(prevT) && t > prevT) {
      const dt = t - prevT;
      const r = (v - prevV) / dt;
      rate += (r - rate) * clamp(dt / tau, 0, 1);
    } else if (t < prevT) rate = 0;
    if (t !== prevT) {
      prevV = v;
      prevT = t;
    }
    return rate;
  };
}

