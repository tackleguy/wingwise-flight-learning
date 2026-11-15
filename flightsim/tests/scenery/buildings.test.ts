import { describe, expect, it } from "vitest";
import { BUILDING_BUDGET, BUILDING_ZOOM, latOfTileY, lonOfTileX, ringArea, selectFootprints, simplifyRing, tileX, tileY, tilesAround, type Footprint } from "@/scenery/buildings-math";

describe("buildings: tiles and footprint selection", () => {
  it("converts between latitude/longitude and map tiles", () => {
    const lat = 37.6155;
    const lon = -122.39;
    const x = tileX(lon);
    const y = tileY(lat);
    expect(Math.floor(x)).toBe(2621); // zoom 14 tile over San Francisco airport
    expect(Math.floor(y)).toBe(6341);
    expect(lonOfTileX(x)).toBeCloseTo(lon, 9);
    expect(latOfTileY(y)).toBeCloseTo(lat, 9);
    expect(BUILDING_ZOOM).toBe(14);
  });

  it("asks only for the few tiles near the aircraft, nearest first", () => {
    const near = tilesAround(37.6155, -122.39, 2000);
    expect(near.length).toBeGreaterThanOrEqual(4);
    expect(near.length).toBeLessThanOrEqual(9);
    expect(near[0]!.distM).toBe(0); // the tile the aircraft is over
    expect(near[0]!.x).toBe(2621);
    for (let i = 1; i < near.length; i++) expect(near[i]!.distM).toBeGreaterThanOrEqual(near[i - 1]!.distM);
    expect(tilesAround(37.6155, -122.39, 3000).length).toBeLessThanOrEqual(16);
    expect(tilesAround(0, 0, 10).length).toBeLessThanOrEqual(4);
  });

  it("has no buildings at low quality and a bigger budget at high quality", () => {
    expect(BUILDING_BUDGET.low).toBeNull();
    expect(BUILDING_BUDGET.high!.points).toBeGreaterThan(BUILDING_BUDGET.medium!.points);
    expect(BUILDING_BUDGET.high!.radiusM).toBeLessThanOrEqual(3000);
  });

  it("removes repeated and collinear outline points but keeps the corners", () => {
    const square = [
      { x: 0, y: 0 },
      { x: 5, y: 0.01 }, // on the edge
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 10, y: 10 }, // repeated
      { x: 0, y: 10 },
      { x: 0, y: 0 }, // closing point
    ];
    const s = simplifyRing(square, 0.5);
    expect(s.length).toBe(4);
    expect(Math.abs(ringArea(s))).toBeCloseTo(100, 6);
    // an L shape keeps all six corners
    const l = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 4 },
      { x: 4, y: 4 },
      { x: 4, y: 10 },
      { x: 0, y: 10 },
    ];
    expect(simplifyRing(l, 0.5).length).toBe(6);
  });

  it("keeps the biggest buildings when a tile has more than the budget allows", () => {
    const box = (n: number, areaM2: number, heightM: number): Footprint => ({ ring: Array.from({ length: n }, (_, i) => ({ x: i, y: i * i })), heightM, baseM: 0, areaM2 });
    const all = [box(4, 50, 5), box(4, 5000, 12), box(8, 900, 30), box(4, 80, 6), box(6, 300, 8)];
    const chosen = selectFootprints(all, 18);
    expect(chosen.map((f) => f.areaM2)).toEqual([5000, 900, 300]);
    expect(chosen.reduce((n, f) => n + f.ring.length, 0)).toBeLessThanOrEqual(18);
    expect(selectFootprints(all, 1000).length).toBe(5);
    expect(selectFootprints(all, 3).length).toBe(0);
  });
});
