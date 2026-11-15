import { describe, expect, it } from "vitest";
import { M_PER_FT } from "@/core/math";
import { findRunwayEnd } from "@/core/spawn";
import type { Quality } from "@/core/types";
import { axisPoint, runwayAxis } from "@/scenery/geo";
import { runwayLayout } from "@/scenery/layout";
import { COLOR, EDGE_SPACING_M, LIGHT_TYPE, PAPI_ANGLES_DEG, PAPI_FROM_THRESHOLD_M, cautionZoneM, papiMeaning, papiPattern, papiWhiteCount, runwayLights } from "@/scenery/lights-layout";
import { buildPriority, elevationAngleDeg, lightLevel } from "@/scenery/lod";
import { sockExtension } from "@/scenery/windsock-math";
import { makeSim, worldData } from "../helpers";

const FT = M_PER_FT;
const data = worldData();
const lightsOf = (ident: string, endId: string, quality: Quality = "medium") => {
  const ap = data.getAirport(ident)!;
  const pick = findRunwayEnd(ap, endId)!;
  const ax = runwayAxis(pick.runway);
  const layout = runwayLayout(pick.runway, ax.lengthM, ap.size);
  return { ap, rw: pick.runway, endIndex: pick.endIndex, ax, layout, ...runwayLights(pick.runway, layout, ax.lengthM, ap.size, quality) };
};

describe("PAPI logic", () => {
  it("shows the standard patterns for a 3 degree approach", () => {
    expect(papiPattern(3.0)).toBe("WWRR"); // on path: two white (far from the runway), two red (next to it)
    expect(papiPattern(3.6)).toBe("WWWW"); // too high
    expect(papiPattern(3.3)).toBe("WWWR"); // slightly high
    expect(papiPattern(2.7)).toBe("WRRR"); // slightly low
    expect(papiPattern(2.4)).toBe("RRRR"); // too low
    expect(PAPI_ANGLES_DEG.map((a) => +a.toFixed(2))).toEqual([2.5, 2.83, 3.17, 3.5]);
    expect([0, 1, 2, 3, 4].map(papiMeaning)).toEqual(["too low", "slightly low", "on path", "slightly high", "too high"]);
    expect(papiWhiteCount(3)).toBe(2);
  });

  it("puts four units on the left of the runway, about 1,000 ft past the threshold, highest angle nearest the runway", () => {
    const r = lightsOf("KSFO", "28R");
    const units = r.lights.filter((l) => l.type === LIGHT_TYPE.papi);
    expect(units.length).toBe(8); // four at each end
    const hw = r.layout.widthM / 2;
    // end index 1 (28R) is at the t = length end; its landing direction is −t, so "left" is +s
    const mine = units.filter((u) => (r.endIndex === 1 ? u.s > 0 : u.s < 0)).sort((a, b) => Math.abs(a.s) - Math.abs(b.s));
    expect(mine.length).toBe(4);
    expect(Math.abs(mine[0]!.s) - hw).toBeCloseTo(15, 3);
    expect(mine.map((u) => +u.param.toFixed(2))).toEqual([3.5, 3.17, 2.83, 2.5]);
    const threshold = r.ax.lengthM - r.layout.ends[1].displacedM;
    expect(threshold - mine[0]!.t).toBeCloseTo(PAPI_FROM_THRESHOLD_M, 1);
    expect(PAPI_FROM_THRESHOLD_M / FT).toBeGreaterThan(900);
    expect(PAPI_FROM_THRESHOLD_M / FT).toBeLessThan(1000);
    // 30 ft apart, in order along the row
    expect(Math.abs(mine[1]!.s) - Math.abs(mine[0]!.s)).toBeCloseTo(9, 6);
    expect(mine.map((u) => Math.abs(u.row))).toEqual([1.5, 0.5, 0.5, 1.5]);
    expect(Math.sign(mine[0]!.row)).toBe(-Math.sign(mine[3]!.row));
    for (const u of mine) {
      expect(u.day).toBe(1);
      expect(u.colorA).toBe(COLOR.papiWhite);
      expect(u.colorB).toBe(COLOR.papiRed);
    }
  });

  it("agrees with the simulator's own 3 degree final: a 'final' start shows two white, two red", async () => {
    const sim = makeSim(4);
    // (closer than about 0.8 nm the simulator starts at its 300 ft minimum height, which is above the 3 degree path)
    for (const nm of [1, 1.5, 4]) {
      await sim.spawn({ kind: "final", airportIdent: "KSFO", runwayEndId: "28R", finalNm: nm });
      const r = lightsOf("KSFO", "28R");
      const site = r.papis.find((p) => p.endId === "28R")!;
      const p = axisPoint(r.ax, site.s, site.t);
      const s = sim.state;
      // flat test terrain at 4 m; the units stand 0.6 m above the runway
      const angle = elevationAngleDeg(p.lat, p.lon, 4 + 0.6, s.lat, s.lon, s.altMslFt * FT);
      expect(angle).toBeGreaterThan(2.84);
      expect(angle).toBeLessThan(3.16);
      expect(papiPattern(angle)).toBe("WWRR");
      // 250 ft higher at 1.5 nm is "too high", 200 ft lower is "too low"
      if (nm === 1.5) {
        expect(papiPattern(elevationAngleDeg(p.lat, p.lon, 4.6, s.lat, s.lon, (s.altMslFt + 250) * FT))).toBe("WWWW");
        expect(papiPattern(elevationAngleDeg(p.lat, p.lon, 4.6, s.lat, s.lon, (s.altMslFt - 200) * FT))).toBe("RRRR");
      }
    }
  });
});

describe("runway lights layout", () => {
  it("lights nothing on an unlighted runway", () => {
    const ap = data.getAirport("KBOS")!;
    const rw = ap.runways.find((r) => !r.lighted)!;
    const ax = runwayAxis(rw);
    const r = runwayLights(rw, runwayLayout(rw, ax.lengthM, ap.size), ax.lengthM, ap.size, "high");
    expect(r.lights.length).toBe(0);
    expect(r.papis.length).toBe(0);
  });

  it("spaces edge lights at most 200 ft apart on both sides, 10 ft outside the pavement", () => {
    const r = lightsOf("KSFO", "28R");
    const edgeS = r.layout.widthM / 2 + 3;
    const edge = r.lights.filter((l) => Math.abs(Math.abs(l.s) - edgeS) < 0.01 && l.h === 0.35 && l.intensity === 1);
    const left = edge.filter((l) => l.s < 0).sort((a, b) => a.t - b.t);
    const right = edge.filter((l) => l.s > 0);
    expect(left.length).toBe(right.length);
    expect(left.length).toBeGreaterThanOrEqual(Math.ceil(r.ax.lengthM / EDGE_SPACING_M));
    expect(left[0]!.t).toBeCloseTo(0, 6);
    expect(left[left.length - 1]!.t).toBeCloseTo(r.ax.lengthM, 6);
    for (let i = 1; i < left.length; i++) expect(left[i]!.t - left[i - 1]!.t).toBeLessThanOrEqual(EDGE_SPACING_M + 1e-6);
  });

  it("turns the last 2,000 ft amber in the direction of travel, and marks the displaced part red on approach", () => {
    const r = lightsOf("KSFO", "28R");
    const len = r.ax.lengthM;
    const caution = cautionZoneM(len);
    expect(caution).toBeCloseTo(2000 * FT, 6);
    expect(cautionZoneM(1000)).toBe(500); // short runway: half its length
    const edgeS = r.layout.widthM / 2 + 3;
    const edge = r.lights.filter((l) => Math.abs(l.s + edgeS) < 0.01 && l.h === 0.35 && l.intensity === 1).sort((a, b) => a.t - b.t);
    // what a pilot rolling from A toward B sees (viewer on the −t side of the light) is colour A for "sided" lights with dirT = −1
    const seenFromA = (l: (typeof edge)[number]) => (l.type === LIGHT_TYPE.sided ? (l.dirT < 0 ? l.colorA : l.colorB) : l.colorA);
    const seenFromB = (l: (typeof edge)[number]) => (l.type === LIGHT_TYPE.sided ? (l.dirT < 0 ? l.colorB : l.colorA) : l.colorA);
    const dispB = r.layout.ends[1].displacedM; // 28R end is displaced by 300 ft
    expect(dispB).toBeGreaterThan(80);
    for (const l of edge) {
      const nearB = l.t > len - caution - 0.5;
      const nearA = l.t < caution + 0.5;
      expect(seenFromA(l)).toBe(nearB ? COLOR.amber : COLOR.white);
      // rolling from B toward A: amber near A; and in front of the displaced 28R threshold the lights show red to an approaching pilot
      const inDisplaced = l.t > len - dispB + 1;
      expect(seenFromB(l)).toBe(inDisplaced ? COLOR.red : nearA ? COLOR.amber : COLOR.white);
    }
  });

  it("shows green threshold lights to the approach and red end lights to the runway", () => {
    const r = lightsOf("KOAK", "30"); // 12/30: no displaced thresholds
    const row = r.lights.filter((l) => l.type === LIGHT_TYPE.sided && l.colorA === COLOR.green);
    expect(row.length).toBeGreaterThanOrEqual(16); // a row at each end
    for (const l of row) {
      expect(l.colorB).toBe(COLOR.red);
      // end A lights sit just before t = 0 and face −t (toward the approach); end B lights face +t
      if (l.t < 0) expect(l.dirT).toBe(-1);
      else {
        expect(l.t).toBeGreaterThan(r.ax.lengthM);
        expect(l.dirT).toBe(1);
      }
    }
  });

  it("adds approach lights only at medium and large airports, and more lights at higher quality", () => {
    const low = lightsOf("KSFO", "28R", "low").lights.length;
    const medium = lightsOf("KSFO", "28R", "medium").lights.length;
    const high = lightsOf("KSFO", "28R", "high").lights.length;
    expect(low).toBeGreaterThan(100);
    expect(medium).toBeGreaterThan(low);
    expect(high).toBeGreaterThan(medium);
    expect(high).toBeLessThan(1500);
    const approach = (r: ReturnType<typeof lightsOf>) => r.lights.filter((l) => l.onGround).length;
    expect(approach(lightsOf("KSFO", "28R", "medium"))).toBeGreaterThan(50);
    expect(approach(lightsOf("KSFO", "28R", "low"))).toBe(0);
    expect(approach(lightsOf("KPAO", "31", "high"))).toBe(0); // small airport
    // approach lights are out on the approach, never on the pavement
    for (const l of lightsOf("KSFO", "28R", "high").lights.filter((x) => x.onGround)) expect(l.t < -8 || l.t > lightsOf("KSFO", "28R").ax.lengthM + 8).toBe(true);
  });
});

describe("scenery level-of-detail rules", () => {
  it("switches runway lights on at night and in poor visibility", () => {
    expect(lightLevel(0, 30)).toBe(1); // night
    expect(lightLevel(1, 30)).toBe(0); // clear day
    expect(lightLevel(0.5, 30)).toBeGreaterThan(0.3); // dusk
    expect(lightLevel(0.5, 30)).toBeLessThan(1);
    expect(lightLevel(1, 1)).toBeGreaterThan(0.8); // day, 1 mile visibility
    expect(lightLevel(1, 10)).toBe(0);
  });

  it("builds the start airport first, then near airports, favouring those ahead", () => {
    expect(buildPriority(9, 0, 0, 100, true)).toBeLessThan(buildPriority(1, 0, 0, 100, false));
    expect(buildPriority(2, 0, 0, 100, false)).toBeLessThan(buildPriority(6, 0, 0, 100, false));
    expect(buildPriority(6, 10, 0, 100, false)).toBeLessThan(buildPriority(5, 180, 0, 100, false)); // ahead beats slightly nearer behind
    expect(buildPriority(6, 10, 0, 0, false)).toBe(6); // standing still: no "ahead"
  });

  it("extends the windsock fully at 15 knots", () => {
    expect(sockExtension(0)).toBe(0);
    expect(sockExtension(7.5)).toBeCloseTo(0.5, 6);
    expect(sockExtension(15)).toBe(1);
    expect(sockExtension(30)).toBe(1);
  });
});
