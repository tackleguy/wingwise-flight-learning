/**
 * Stylized EDUCATIONAL chart of the San Francisco Bay Area built from the TeachX airport/navaid
 * dataset. Airspace shapes are simplified rings, coastline is coarse, and the restricted area,
 * MOA, obstacles and GPS waypoints are FICTIONAL examples for symbol training.
 * NOT FOR NAVIGATION.
 */
import { AIRPORTS, NAVAIDS } from "@/lib/data/airports";
import type { Airport, Navaid } from "@/lib/data/types";

export const CHART_BOUNDS = { minLat: 36.45, maxLat: 38.3, minLon: -123.15, maxLon: -121.0 };
export const LAT0 = 37.4;
export const LON0 = -122.1;
const K = Math.cos((LAT0 * Math.PI) / 180);

/** Project lat/lon to chart units (nautical miles, x east, y south). */
export function proj(lat: number, lon: number) {
  return { x: (lon - LON0) * 60 * K, y: -(lat - LAT0) * 60 };
}
export function unproj(x: number, y: number) {
  return { lat: LAT0 - y / 60, lon: LON0 + x / (60 * K) };
}

const inBounds = (lat: number, lon: number) =>
  lat >= CHART_BOUNDS.minLat &&
  lat <= CHART_BOUNDS.maxLat &&
  lon >= CHART_BOUNDS.minLon &&
  lon <= CHART_BOUNDS.maxLon;

export const CHART_AIRPORTS: Airport[] = AIRPORTS.filter((a) => inBounds(a.lat, a.lon));
export const CHART_NAVAIDS: Navaid[] = NAVAIDS.filter((n) => inBounds(n.lat, n.lon));

export interface AirspaceRing {
  id: string;
  cls: "B" | "C" | "D";
  airport: string;
  lat: number;
  lon: number;
  rings: { rNm: number; label: string }[];
}

export const AIRSPACE: AirspaceRing[] = CHART_AIRPORTS.filter((a) => a.towered).map((a) => {
  if (a.airspace === "B")
    return {
      id: `B-${a.icao}`,
      cls: "B" as const,
      airport: a.icao,
      lat: a.lat,
      lon: a.lon,
      rings: [
        { rNm: 7, label: "100\nSFC" },
        { rNm: 15, label: "100\n15" },
        { rNm: 20, label: "100\n30" },
        { rNm: 30, label: "100\n60" },
      ],
    };
  if (a.airspace === "C")
    return {
      id: `C-${a.icao}`,
      cls: "C" as const,
      airport: a.icao,
      lat: a.lat,
      lon: a.lon,
      rings: [
        { rNm: 5, label: "40\nSFC" },
        { rNm: 10, label: "40\n15" },
      ],
    };
  const top = Math.round((a.elevationFt + 2500) / 100);
  return {
    id: `D-${a.icao}`,
    cls: "D" as const,
    airport: a.icao,
    lat: a.lat,
    lon: a.lon,
    rings: [{ rNm: 4.3, label: `[${top}]` }],
  };
});

export interface SpecialArea {
  id: string;
  kind: "restricted" | "moa";
  name: string;
  note: string;
  pts: [number, number][];
}

export const SPECIAL_AREAS: SpecialArea[] = [
  {
    id: "R-EDU1",
    kind: "restricted",
    name: "R-EDU1 (fictional)",
    note: "SFC–8,000 MSL, active 0700–1800 local Mon–Fri (example). Entry prohibited when active without controlling-agency permission.",
    pts: [
      [37.95, -121.55],
      [37.95, -121.38],
      [37.82, -121.38],
      [37.82, -121.55],
    ],
  },
  {
    id: "MOA-EDU",
    kind: "moa",
    name: "TEACH MOA (fictional)",
    note: "7,000 MSL to but not including FL180 (example). VFR flight permitted — contact the controlling agency / FSS and exercise extreme caution when active.",
    pts: [
      [37.05, -121.45],
      [37.15, -121.15],
      [36.85, -121.08],
      [36.75, -121.35],
    ],
  },
];

export interface PointFeature {
  id: string;
  kind: "obstacle" | "checkpoint" | "waypoint";
  name: string;
  lat: number;
  lon: number;
  note: string;
}

export const POINT_FEATURES: PointFeature[] = [
  {
    id: "obs1",
    kind: "obstacle",
    name: "1811 (977)",
    lat: 37.755,
    lon: -122.453,
    note: "Illustrative tall tower: top 1,811 ft MSL, 977 ft AGL (lighted).",
  },
  {
    id: "obs2",
    kind: "obstacle",
    name: "1549 (1203)",
    lat: 37.66,
    lon: -121.95,
    note: "Fictional obstacle: top 1,549 ft MSL, 1,203 ft AGL.",
  },
  {
    id: "obs3",
    kind: "obstacle",
    name: "2312 (412)",
    lat: 37.27,
    lon: -122.08,
    note: "Fictional antenna on a ridge: 2,312 ft MSL, 412 ft AGL.",
  },
  {
    id: "cp1",
    kind: "checkpoint",
    name: "Golden Gate Bridge",
    lat: 37.8199,
    lon: -122.4783,
    note: "VFR checkpoint (approximate position).",
  },
  {
    id: "cp2",
    kind: "checkpoint",
    name: "San Mateo Bridge",
    lat: 37.585,
    lon: -122.2,
    note: "VFR checkpoint (approximate position).",
  },
  {
    id: "cp3",
    kind: "checkpoint",
    name: "Dumbarton Bridge",
    lat: 37.505,
    lon: -122.115,
    note: "VFR checkpoint (approximate position).",
  },
  {
    id: "cp4",
    kind: "checkpoint",
    name: "Stanford Stadium",
    lat: 37.4346,
    lon: -122.1609,
    note: "VFR checkpoint (approximate position).",
  },
  {
    id: "cp5",
    kind: "checkpoint",
    name: "Coyote Hills",
    lat: 37.555,
    lon: -122.09,
    note: "VFR checkpoint (approximate position).",
  },
  {
    id: "wp1",
    kind: "waypoint",
    name: "TEACH",
    lat: 37.2,
    lon: -122.3,
    note: "Fictional GPS waypoint (four-pointed star symbol).",
  },
  {
    id: "wp2",
    kind: "waypoint",
    name: "XCTRY",
    lat: 37.0,
    lon: -121.75,
    note: "Fictional GPS waypoint.",
  },
  {
    id: "wp3",
    kind: "waypoint",
    name: "PILOT",
    lat: 37.95,
    lon: -122.75,
    note: "Fictional GPS waypoint.",
  },
];

/** Coarse Pacific coastline (north → south). */
export const COAST: [number, number][] = [
  [38.3, -123.05],
  [38.12, -122.96],
  [38.0, -123.02],
  [37.99, -122.82],
  [37.9, -122.68],
  [37.83, -122.53],
  [37.81, -122.48],
  [37.78, -122.51],
  [37.7, -122.5],
  [37.6, -122.5],
  [37.5, -122.48],
  [37.35, -122.4],
  [37.25, -122.41],
  [37.11, -122.33],
  [36.96, -122.02],
  [36.95, -121.9],
  [36.8, -121.79],
  [36.65, -121.82],
  [36.6, -121.89],
  [36.64, -121.93],
  [36.55, -121.93],
  [36.45, -121.93],
];

/** Coarse San Francisco Bay outline (water polygon). */
export const BAY: [number, number][] = [
  [37.81, -122.48],
  [37.8, -122.4],
  [37.73, -122.37],
  [37.62, -122.37],
  [37.57, -122.28],
  [37.5, -122.21],
  [37.46, -122.11],
  [37.43, -121.98],
  [37.52, -122.05],
  [37.63, -122.15],
  [37.72, -122.23],
  [37.77, -122.28],
  [37.83, -122.3],
  [37.92, -122.38],
  [38.03, -122.4],
  [38.06, -122.22],
  [38.1, -122.3],
  [38.07, -122.5],
  [37.95, -122.5],
  [37.86, -122.48],
  [37.83, -122.48],
];

export type ChartFeatureKind =
  | "airport-towered"
  | "airport-nontowered"
  | "vor"
  | "vortac"
  | "vordme"
  | "class-b"
  | "class-c"
  | "class-d"
  | "restricted"
  | "moa"
  | "obstacle"
  | "checkpoint"
  | "waypoint";

export const FEATURE_LABEL: Record<ChartFeatureKind, string> = {
  "airport-towered": "Airport with a control tower (blue symbol)",
  "airport-nontowered": "Non-towered airport (magenta symbol)",
  vor: "VOR",
  vortac: "VORTAC",
  vordme: "VOR-DME",
  "class-b": "Class B airspace boundary (solid blue)",
  "class-c": "Class C airspace boundary (solid magenta)",
  "class-d": "Class D airspace boundary (dashed blue)",
  restricted: "Restricted area",
  moa: "Military Operations Area (MOA)",
  obstacle: "Obstacle (height MSL and AGL)",
  checkpoint: "VFR checkpoint",
  waypoint: "GPS / RNAV waypoint",
};

export interface PracticeTarget {
  kind: ChartFeatureKind;
  lat: number;
  lon: number;
  /** Radius (nm) of the highlight. */
  r: number;
  name: string;
}

export function practiceTargets(): PracticeTarget[] {
  const out: PracticeTarget[] = [];
  for (const a of CHART_AIRPORTS)
    out.push({
      kind: a.towered ? "airport-towered" : "airport-nontowered",
      lat: a.lat,
      lon: a.lon,
      r: 2.2,
      name: a.icao,
    });
  for (const n of CHART_NAVAIDS)
    out.push({
      kind: n.type === "VORTAC" ? "vortac" : n.type === "VOR-DME" ? "vordme" : "vor",
      lat: n.lat,
      lon: n.lon,
      r: 2.2,
      name: n.id,
    });
  for (const s of AIRSPACE) {
    const outer = s.rings[s.rings.length - 1];
    if (!outer) continue;
    // Highlight a point on the outer ring (north-east side).
    const b = (45 * Math.PI) / 180;
    out.push({
      kind: s.cls === "B" ? "class-b" : s.cls === "C" ? "class-c" : "class-d",
      lat: s.lat + (outer.rNm * Math.cos(b)) / 60,
      lon: s.lon + (outer.rNm * Math.sin(b)) / (60 * K),
      r: 2,
      name: s.airport,
    });
  }
  for (const a of SPECIAL_AREAS) {
    const c = a.pts.reduce(
      (acc, p) => ({ lat: acc.lat + p[0] / a.pts.length, lon: acc.lon + p[1] / a.pts.length }),
      { lat: 0, lon: 0 },
    );
    out.push({
      kind: a.kind === "restricted" ? "restricted" : "moa",
      lat: c.lat,
      lon: c.lon,
      r: 4,
      name: a.name,
    });
  }
  for (const p of POINT_FEATURES)
    out.push({ kind: p.kind, lat: p.lat, lon: p.lon, r: 1.8, name: p.name });
  return out;
}
