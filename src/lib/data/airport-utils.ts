/** Helpers on top of the educational airport dataset (search, nearest, IFR capability). */
import { bearingDeg, distanceNm, norm360 } from "@/lib/geo";
import { AIRPORTS, NAVAIDS, getAirport, getNavaid } from "./airports";
import type { Airport, Navaid } from "./types";

export function isIfrCapable(a: Airport): boolean {
  return (
    a.runways.some((r) => r.ends.some((e) => e.ils)) ||
    a.procedures.some((p) => /ILS|RNAV|GPS|VOR|LOC/i.test(p))
  );
}

export function hasIls(a: Airport): boolean {
  return a.runways.some((r) => r.ends.some((e) => e.ils));
}

export function longestRunwayFt(a: Airport): number {
  return a.runways.reduce((m, r) => Math.max(m, r.lengthFt), 0);
}

export interface NearbyResult<T> {
  item: T;
  distNm: number;
  /** True bearing from the reference point TO the item. */
  brgTrue: number;
}

export function nearestAirports(
  lat: number,
  lon: number,
  opts: { limit?: number; maxNm?: number; exclude?: string[] } = {},
): NearbyResult<Airport>[] {
  const ex = new Set(opts.exclude ?? []);
  return AIRPORTS.filter((a) => !ex.has(a.icao))
    .map((a) => ({
      item: a,
      distNm: distanceNm(lat, lon, a.lat, a.lon),
      brgTrue: bearingDeg(lat, lon, a.lat, a.lon),
    }))
    .filter((r) => (opts.maxNm === undefined ? true : r.distNm <= opts.maxNm))
    .sort((a, b) => a.distNm - b.distNm)
    .slice(0, opts.limit ?? 5);
}

export function nearbyNavaids(lat: number, lon: number, maxNm = 60): NearbyResult<Navaid>[] {
  return NAVAIDS.map((n) => ({
    item: n,
    distNm: distanceNm(lat, lon, n.lat, n.lon),
    brgTrue: bearingDeg(lat, lon, n.lat, n.lon),
  }))
    .filter((r) => r.distNm <= maxNm)
    .sort((a, b) => a.distNm - b.distNm);
}

/** A resolvable route point: airport, navaid or "lat,lon". */
export interface RoutePoint {
  id: string;
  name: string;
  kind: "airport" | "navaid" | "coord";
  lat: number;
  lon: number;
  magVar: number;
}

export function resolvePoint(id: string): RoutePoint | undefined {
  const k = id.trim().toUpperCase();
  if (!k) return undefined;
  const coord = /^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/.exec(k);
  if (coord) {
    const lat = Number(coord[1]);
    const lon = Number(coord[2]);
    if (Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
      const near = nearestAirports(lat, lon, { limit: 1 })[0];
      return {
        id: `${lat.toFixed(3)},${lon.toFixed(3)}`,
        name: "User waypoint",
        kind: "coord",
        lat,
        lon,
        magVar: near?.item.magVar ?? 0,
      };
    }
  }
  const ap = getAirport(k) ?? (k.length === 3 ? getAirport(`K${k}`) : undefined);
  // Prefer a navaid when the identifier is exactly a navaid id and not an airport ICAO.
  const nv = getNavaid(k);
  if (ap && (ap.icao === k || !nv))
    return {
      id: ap.icao,
      name: ap.name,
      kind: "airport",
      lat: ap.lat,
      lon: ap.lon,
      magVar: ap.magVar,
    };
  if (nv)
    return {
      id: nv.id,
      name: `${nv.name} ${nv.type}`,
      kind: "navaid",
      lat: nv.lat,
      lon: nv.lon,
      magVar: nv.magVar,
    };
  if (ap)
    return {
      id: ap.icao,
      name: ap.name,
      kind: "airport",
      lat: ap.lat,
      lon: ap.lon,
      magVar: ap.magVar,
    };
  return undefined;
}

export function toMagnetic(trueDeg: number, magVar: number): number {
  return norm360(trueDeg - magVar);
}

export function fmtHdg(d: number): string {
  if (!Number.isFinite(d)) return "—";
  const v = Math.round(norm360(d));
  return String(v === 0 ? 360 : v).padStart(3, "0");
}
