/**
 * Small geodesy helpers for the scenery module (no CesiumJS here, so they can be unit-tested in
 * Node): WGS84 positions → a local east/north/up frame at an airport, and a runway's own axes.
 */
import type { Runway } from "@/data/world-data";
import { D2R, M_PER_FT, M_PER_NM, norm180 } from "@/core/math";

const WGS84_A = 6378137.0;
const WGS84_F = 1 / 298.257223563;
const WGS84_E2 = WGS84_F * (2 - WGS84_F);
/** Metres per degree of latitude used by the terrain flattening (keep identical to src/world/elevation.ts). */
export const M_PER_DEG = 60 * M_PER_NM;

/** Earth-centred position (metres) of a geodetic latitude/longitude (degrees) and height (metres). */
export function geodeticToEcef(lat: number, lon: number, hM: number, out: number[] = [0, 0, 0]): number[] {
  const la = lat * D2R;
  const lo = lon * D2R;
  const s = Math.sin(la);
  const c = Math.cos(la);
  const n = WGS84_A / Math.sqrt(1 - WGS84_E2 * s * s);
  out[0] = (n + hM) * c * Math.cos(lo);
  out[1] = (n + hM) * c * Math.sin(lo);
  out[2] = (n * (1 - WGS84_E2) + hM) * s;
  return out;
}

/** A flat east/north/up frame touching the Earth at an origin; coordinates in metres. */
export interface LocalFrame {
  lat0: number;
  lon0: number;
  h0M: number;
  origin: number[];
  east: number[];
  north: number[];
  up: number[];
}

export function makeLocalFrame(lat0: number, lon0: number, h0M: number): LocalFrame {
  const la = lat0 * D2R;
  const lo = lon0 * D2R;
  const sl = Math.sin(la);
  const cl = Math.cos(la);
  const so = Math.sin(lo);
  const co = Math.cos(lo);
  return {
    lat0,
    lon0,
    h0M,
    origin: geodeticToEcef(lat0, lon0, h0M),
    east: [-so, co, 0],
    north: [-sl * co, -sl * so, cl],
    up: [cl * co, cl * so, sl],
  };
}

const scratch = [0, 0, 0];

/** Geodetic position → local east/north/up metres, written to out[offset..offset+2]. */
export function toLocal(f: LocalFrame, lat: number, lon: number, hM: number, out: number[] | Float32Array | Float64Array, offset = 0): void {
  geodeticToEcef(lat, lon, hM, scratch);
  const dx = scratch[0]! - f.origin[0]!;
  const dy = scratch[1]! - f.origin[1]!;
  const dz = scratch[2]! - f.origin[2]!;
  out[offset] = dx * f.east[0]! + dy * f.east[1]! + dz * f.east[2]!;
  out[offset + 1] = dx * f.north[0]! + dy * f.north[1]! + dz * f.north[2]!;
  out[offset + 2] = dx * f.up[0]! + dy * f.up[1]! + dz * f.up[2]!;
}

/** The "straight up" direction at a latitude/longitude, expressed in the local frame (unit vector). */
export function localUp(f: LocalFrame, lat: number, lon: number, out: number[] = [0, 0, 0]): number[] {
  const la = lat * D2R;
  const lo = lon * D2R;
  const x = Math.cos(la) * Math.cos(lo);
  const y = Math.cos(la) * Math.sin(lo);
  const z = Math.sin(la);
  out[0] = x * f.east[0]! + y * f.east[1]! + z * f.east[2]!;
  out[1] = x * f.north[0]! + y * f.north[1]! + z * f.north[2]!;
  out[2] = x * f.up[0]! + y * f.up[1]! + z * f.up[2]!;
  return out;
}

/**
 * A runway's own coordinates: `t` metres along the centreline from end A (ends[0]) toward end B,
 * `s` metres to the RIGHT of that direction. Built from the surveyed end points, so t = lengthM is
 * exactly end B. (Flat-earth offsets — the same approximation the terrain flattening uses.)
 */
export interface RunwayAxis {
  latA: number;
  lonA: number;
  /** Distance between the two end points, metres. */
  lengthM: number;
  /** True heading from A to B, radians. */
  headingRad: number;
  /** Unit vector along the runway (east, north) and to its right. */
  alongE: number;
  alongN: number;
  rightE: number;
  rightN: number;
  /** Metres per degree of longitude at the runway. */
  mPerDegLon: number;
}

export function runwayAxis(rw: Runway): RunwayAxis {
  const [a, b] = rw.ends;
  const mPerDegLon = M_PER_DEG * Math.cos(((a.lat + b.lat) / 2) * D2R);
  const north = (b.lat - a.lat) * M_PER_DEG;
  const east = norm180(b.lon - a.lon) * mPerDegLon;
  let lengthM = Math.hypot(north, east);
  let alongE = 0;
  let alongN = 1;
  if (lengthM > 1) {
    alongE = east / lengthM;
    alongN = north / lengthM;
  } else {
    // Degenerate data: fall back to the published heading and length.
    lengthM = Math.max(30, rw.lengthFt * M_PER_FT);
    alongE = Math.sin(a.headingTrue * D2R);
    alongN = Math.cos(a.headingTrue * D2R);
  }
  return { latA: a.lat, lonA: a.lon, lengthM, headingRad: Math.atan2(alongE, alongN), alongE, alongN, rightE: alongN, rightN: -alongE, mPerDegLon };
}

/** Latitude/longitude of the point `s` metres right of the centreline and `t` metres from end A. */
export function axisPoint(ax: RunwayAxis, s: number, t: number, out: { lat: number; lon: number } = { lat: 0, lon: 0 }): { lat: number; lon: number } {
  const east = t * ax.alongE + s * ax.rightE;
  const north = t * ax.alongN + s * ax.rightN;
  out.lat = ax.latA + north / M_PER_DEG;
  out.lon = ax.lonA + east / ax.mPerDegLon;
  return out;
}

/** The reverse of axisPoint: runway coordinates of a latitude/longitude. */
export function axisCoords(ax: RunwayAxis, lat: number, lon: number, out: { s: number; t: number } = { s: 0, t: 0 }): { s: number; t: number } {
  const north = (lat - ax.latA) * M_PER_DEG;
  const east = norm180(lon - ax.lonA) * ax.mPerDegLon;
  out.t = east * ax.alongE + north * ax.alongN;
  out.s = east * ax.rightE + north * ax.rightN;
  return out;
}
