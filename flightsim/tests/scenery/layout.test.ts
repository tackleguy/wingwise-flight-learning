import { describe, expect, it } from "vitest";
import { M_PER_FT } from "@/core/math";
import { findRunwayEnd } from "@/core/spawn";
import { axisCoords, axisPoint, geodeticToEcef, makeLocalFrame, runwayAxis, toLocal } from "@/scenery/geo";
import { MARK, paintedDesignator, parseDesignator, runwayLayout, runwayWidthM, thresholdStripesPerSide } from "@/scenery/layout";
import { worldData } from "../helpers";

const FT = M_PER_FT;
const data = worldData();
const runwayOf = (ident: string, endId: string) => {
  const ap = data.getAirport(ident)!;
  const pick = findRunwayEnd(ap, endId)!;
  return { ap, rw: pick.runway, endIndex: pick.endIndex };
};

describe("scenery geometry helpers", () => {
  it("converts latitude/longitude to Earth-centred metres (WGS84)", () => {
    expect(geodeticToEcef(0, 0, 0)[0]).toBeCloseTo(6378137, 3);
    expect(geodeticToEcef(90, 0, 0)[2]).toBeCloseTo(6356752.3142, 3);
    expect(geodeticToEcef(0, 90, 100)[1]).toBeCloseTo(6378237, 3);
  });

  it("builds a flat local frame: 1 km north is 1 km along +north and 8 cm below the tangent plane", () => {
    const f = makeLocalFrame(37.6, -122.4, 5);
    const out = [0, 0, 0];
    toLocal(f, 37.6, -122.4, 5, out);
    expect(Math.hypot(...out)).toBeLessThan(1e-6);
    toLocal(f, 37.6 + 1000 / 110976, -122.4, 5, out); // ≈ 1000 m of latitude at 37.6°N
    expect(Math.abs(out[0]!)).toBeLessThan(0.01);
    expect(out[1]!).toBeGreaterThan(999);
    expect(out[1]!).toBeLessThan(1001);
    expect(out[2]!).toBeGreaterThan(-0.09);
    expect(out[2]!).toBeLessThan(-0.07);
  });

  it("gives a runway its own axes: t = length is exactly the other end", () => {
    const { rw } = runwayOf("KSFO", "28R");
    const ax = runwayAxis(rw);
    expect(Math.abs(ax.lengthM / FT - rw.lengthFt) / rw.lengthFt).toBeLessThan(0.01);
    const b = axisPoint(ax, 0, ax.lengthM);
    expect(Math.abs(b.lat - rw.ends[1].lat)).toBeLessThan(1e-7);
    expect(Math.abs(b.lon - rw.ends[1].lon)).toBeLessThan(1e-7);
    // heading from end A (10L) is about 118° true
    expect(Math.abs((ax.headingRad * 180) / Math.PI - rw.ends[0].headingTrue)).toBeLessThan(0.3);
    // a point 30 m right of the centreline, 500 m along, converts back to the same numbers
    const p = axisPoint(ax, 30, 500);
    const c = axisCoords(ax, p.lat, p.lon);
    expect(c.s).toBeCloseTo(30, 6);
    expect(c.t).toBeCloseTo(500, 6);
    // "right" really is to the right: for a runway heading ~118° (ESE), right is toward the SSW
    expect(p.lat).toBeLessThan(axisPoint(ax, 0, 500).lat);
  });
});

describe("runway markings layout", () => {
  it("splits runway designators into number and letter", () => {
    expect(parseDesignator("28R")).toEqual({ number: "28", letter: "R" });
    expect(parseDesignator("09")).toEqual({ number: "09", letter: "" });
    expect(parseDesignator("1L")).toEqual({ number: "1", letter: "L" });
    expect(parseDesignator("16C")).toEqual({ number: "16", letter: "C" });
    expect(parseDesignator("H16L")).toEqual({ number: "16", letter: "L" });
    expect(parseDesignator("NE")).toEqual({ number: "NE", letter: "" });
    expect(parseDesignator(" 04 ")).toEqual({ number: "04", letter: "" });
  });

  it("paints US runway numbers without the leading zero, and keeps it elsewhere", () => {
    expect(paintedDesignator("09L", "US")).toEqual({ number: "9", letter: "L" });
    expect(paintedDesignator("09L", "GB")).toEqual({ number: "09", letter: "L" });
    expect(paintedDesignator("10", "US")).toEqual({ number: "10", letter: "" });
    const atl = runwayOf("KATL", "09L");
    expect(runwayLayout(atl.rw, runwayAxis(atl.rw).lengthM, atl.ap.size, atl.ap.country).ends[atl.endIndex].paintId).toBe("9L");
    const lhr = runwayOf("EGLL", "09L");
    expect(runwayLayout(lhr.rw, runwayAxis(lhr.rw).lengthM, lhr.ap.size, lhr.ap.country).ends[lhr.endIndex].paintId).toBe("09L");
  });

  it("uses the standard number of threshold stripes for the runway width", () => {
    expect(thresholdStripesPerSide(60) * 2).toBe(4);
    expect(thresholdStripesPerSide(75) * 2).toBe(6);
    expect(thresholdStripesPerSide(100) * 2).toBe(8);
    expect(thresholdStripesPerSide(150) * 2).toBe(12);
    expect(thresholdStripesPerSide(200) * 2).toBe(16);
  });

  it("gives a big hub runway the full set of markings, with the displaced threshold at 28R", () => {
    const { ap, rw, endIndex } = runwayOf("KSFO", "28R");
    const ax = runwayAxis(rw);
    const l = runwayLayout(rw, ax.lengthM, ap.size);
    expect(l.look).toBe("asphalt");
    expect(l.marked).toBe(true);
    expect(l.widthM).toBeCloseTo(200 * FT, 3);
    expect(l.centrelineWidthM).toBeCloseTo(3 * FT, 3);
    expect(l.sideOuterM).toBeGreaterThan(0);
    const e = l.ends[endIndex];
    expect(e.id).toBe("28R");
    expect(e.displacedM).toBeCloseTo(300 * FT, 2);
    expect(e.arrows).toBe(true);
    expect(e.barEndM - e.barStartM).toBeCloseTo(MARK.thresholdBarFt * FT, 3);
    expect(e.stripesPerSide).toBe(8);
    expect(e.stripeEndM - e.stripeStartM).toBeCloseTo(150 * FT, 3);
    // aiming point about 1,000 ft past the THRESHOLD (not the pavement end)
    expect(e.aimStartM - e.displacedM).toBeCloseTo(1020 * FT, 2);
    expect(e.aimEndM - e.aimStartM).toBeCloseTo(150 * FT, 2);
    // touchdown-zone bars out to 3,000 ft
    expect(e.tdzMaxFromThresholdM).toBeGreaterThan(3000 * FT);
    // the number comes after the stripes, the centreline after the number
    expect(e.desigStartM).toBeGreaterThan(e.stripeEndM);
    expect(e.centrelineStartM).toBeGreaterThan(e.desigEndM);
    // the other end (10L) is not displaced
    const o = l.ends[endIndex === 0 ? 1 : 0];
    expect(o.displacedM).toBe(0);
    expect(o.arrows).toBe(false);
    expect(o.barEndM).toBe(o.barStartM);
  });

  it("paints only numbers and a centreline on a short, narrow paved strip (Palo Alto)", () => {
    const { ap, rw } = runwayOf("KPAO", "31");
    const l = runwayLayout(rw, runwayAxis(rw).lengthM, ap.size);
    expect(l.marked).toBe(true);
    expect(l.centrelineWidthM).toBeGreaterThan(0);
    for (const e of l.ends) {
      expect(e.stripesPerSide).toBe(0);
      expect(e.aimEndM).toBe(0);
      expect(e.tdzMaxFromThresholdM).toBe(0);
      expect(e.desigLengthM).toBeGreaterThan(0);
    }
    expect(l.sideOuterM).toBe(0);
  });

  it("paints nothing on grass, gravel and dirt", () => {
    let checked = 0;
    for (let i = 0; i < 4000 && checked < 300; i++) {
      const rw = data.runway(i * 7);
      if (rw.surface !== "grass" && rw.surface !== "gravel" && rw.surface !== "dirt") continue;
      const l = runwayLayout(rw, runwayAxis(rw).lengthM, "small");
      expect(l.marked).toBe(false);
      expect(l.centrelineWidthM).toBe(0);
      expect(l.rubber).toBe(0);
      checked++;
    }
    expect(checked).toBeGreaterThan(100);
  });

  it("keeps every marking on its own half of the runway for every runway in the database", () => {
    let n = 0;
    const problems: string[] = [];
    const bad = (rw: { name: string; index: number }, what: string) => {
      if (problems.length < 10) problems.push(`${rw.index} ${rw.name}: ${what}`);
    };
    const count = data.meta.counts.runways ?? 33408;
    for (let i = 0; i < count; i++) {
      const rw = data.runway(i);
      const ax = runwayAxis(rw);
      if (!(ax.lengthM > 60 && ax.lengthM < 9000)) continue;
      const l = runwayLayout(rw, ax.lengthM, "medium");
      const half = ax.lengthM / 2;
      if (!(Number.isFinite(l.widthM) && l.widthM >= 15 * FT - 1e-9)) bad(rw, "width");
      if (runwayWidthM(rw) !== l.widthM) bad(rw, "width mismatch");
      for (const e of l.ends) {
        for (const v of [e.displacedM, e.barEndM, e.stripeEndM, e.desigEndM, e.aimEndM]) if (!Number.isFinite(v) || v > half + 60) bad(rw, "marking past the middle");
        if (e.displacedM < 0) bad(rw, "negative displacement");
        if (e.desigLengthM > 0 && e.desigEndM > half) bad(rw, "number past the middle");
        if (e.aimEndM > 0 && e.aimEndM >= half) bad(rw, "aiming point past the middle");
        if (e.tdzMaxFromThresholdM > 0 && e.displacedM + e.tdzMaxFromThresholdM >= half) bad(rw, "touchdown zone past the middle");
      }
      n++;
    }
    expect(problems).toEqual([]);
    expect(n).toBeGreaterThan(30000);
  });
});
