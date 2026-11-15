/**
 * The parts of the buildings feature that need no graphics or network (unit-tested in Node):
 * which map tiles are wanted, and which building outlines of a tile are worth drawing.
 */
import { D2R, clamp } from "@/core/math";
import type { Quality } from "@/core/types";

/** Zoom level of the vector tiles used (the deepest OpenFreeMap serves). */
export const BUILDING_ZOOM = 14;
const ZOOM = BUILDING_ZOOM;

export interface BuildingBudget {
  radiusM: number;
  /** Outline points kept per tile (largest footprints first). */
  points: number;
}
/** Per quality: how far out tiles are loaded and how much of each tile is kept. null = no buildings. */
export const BUILDING_BUDGET: Record<Quality, BuildingBudget | null> = {
  low: null,
  medium: { radiusM: 2000, points: 3500 },
  high: { radiusM: 3000, points: 8000 },
};

// ---------------------------------------------------------------- tile maths (Web Mercator)

export const tileX = (lon: number, z = ZOOM) => ((lon + 180) / 360) * 2 ** z;
export const tileY = (lat: number, z = ZOOM) => {
  const s = Math.sin(clamp(lat, -85.05, 85.05) * D2R);
  return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * 2 ** z;
};
export const lonOfTileX = (x: number, z = ZOOM) => (x / 2 ** z) * 360 - 180;
export const latOfTileY = (y: number, z = ZOOM) => Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / 2 ** z))) / D2R;

/** Tiles whose area comes within `radiusM` of a point, nearest first. */
export function tilesAround(lat: number, lon: number, radiusM: number, z = ZOOM): { x: number; y: number; distM: number }[] {
  const fx = tileX(lon, z);
  const fy = tileY(lat, z);
  const tileM = (40075016.686 * Math.cos(lat * D2R)) / 2 ** z;
  const r = radiusM / tileM;
  const out: { x: number; y: number; distM: number }[] = [];
  for (let x = Math.floor(fx - r); x <= Math.floor(fx + r); x++) {
    for (let y = Math.floor(fy - r); y <= Math.floor(fy + r); y++) {
      // distance from the point to the tile's square (0 when inside)
      const dx = Math.max(x - fx, 0, fx - (x + 1));
      const dy = Math.max(y - fy, 0, fy - (y + 1));
      const d = Math.hypot(dx, dy) * tileM;
      if (d <= radiusM) out.push({ x, y, distM: d });
    }
  }
  return out.sort((a, b) => a.distM - b.distM);
}

// ---------------------------------------------------------------- footprints

export interface Footprint {
  /** Outline in tile units (0…extent), closed implicitly, without the repeated last point. */
  ring: { x: number; y: number }[];
  heightM: number;
  baseM: number;
  /** Ground area, m². */
  areaM2: number;
}

export function ringArea(ring: { x: number; y: number }[]): number {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += (ring[j]!.x - ring[i]!.x) * (ring[j]!.y + ring[i]!.y);
  return a / 2;
}

/** Remove repeated and (nearly) collinear points; returns the simplified ring (may have fewer than 3 points). */
export function simplifyRing(ring: { x: number; y: number }[], tolerance: number): { x: number; y: number }[] {
  const pts = ring.slice();
  // drop the closing point if it repeats the first
  if (pts.length > 1 && pts[0]!.x === pts[pts.length - 1]!.x && pts[0]!.y === pts[pts.length - 1]!.y) pts.pop();
  let changed = true;
  while (changed && pts.length > 3) {
    changed = false;
    for (let i = 0; i < pts.length && pts.length > 3; i++) {
      const a = pts[(i + pts.length - 1) % pts.length]!;
      const b = pts[i]!;
      const c = pts[(i + 1) % pts.length]!;
      const len = Math.hypot(c.x - a.x, c.y - a.y);
      // distance of b from the line a–c
      const dist = len < 1e-9 ? Math.hypot(b.x - a.x, b.y - a.y) : Math.abs((c.x - a.x) * (a.y - b.y) - (a.x - b.x) * (c.y - a.y)) / len;
      if (dist < tolerance) {
        pts.splice(i, 1);
        i--;
        changed = true;
      }
    }
  }
  return pts;
}

/**
 * Choose which footprints of a tile to draw: the biggest (by ground area × a height bonus) first,
 * until the point budget is used up. `unitM` is the size of one tile unit in metres.
 */
export function selectFootprints(all: Footprint[], pointBudget: number): Footprint[] {
  const sorted = all.slice().sort((a, b) => b.areaM2 * (1 + b.heightM / 20) - a.areaM2 * (1 + a.heightM / 20));
  const out: Footprint[] = [];
  let points = 0;
  for (const f of sorted) {
    if (points + f.ring.length > pointBudget) {
      if (f.ring.length > 60) continue; // a huge outline does not fit any more; smaller ones may
      break;
    }
    points += f.ring.length;
    out.push(f);
  }
  return out;
}
