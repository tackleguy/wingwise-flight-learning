import { describe, expect, it } from "vitest";
import { daylight, sunPosition, utcForLocalSolarHours } from "@/core/sun";
import { COVER_FRACTION, cloudDensityAt, cloudFieldXY, layerDensity } from "@/core/clouds";
import { defaultEnvironment } from "@/core/defaults";

describe("sun and clouds", () => {
  it("puts the sun high at local noon and below the horizon at midnight", () => {
    const noon = utcForLocalSolarHours(Date.UTC(2026, 5, 21), -122, 12);
    const p = sunPosition(noon, 37.6, -122);
    expect(p.elevationDeg).toBeGreaterThan(70);
    expect(Math.abs(p.azimuthDeg - 180)).toBeLessThan(15);
    const night = sunPosition(utcForLocalSolarHours(noon, -122, 0), 37.6, -122);
    expect(night.elevationDeg).toBeLessThan(-20);
    expect(daylight(night.elevationDeg)).toBe(0);
    expect(daylight(p.elevationDeg)).toBe(1);
    const morning = sunPosition(utcForLocalSolarHours(noon, -122, 8), 37.6, -122);
    expect(morning.azimuthDeg).toBeLessThan(120);
  });

  it("fills roughly the right share of the sky for each cloud cover", () => {
    for (const cover of ["FEW", "SCT", "BKN", "OVC"] as const) {
      const layer = { cover, baseFtMsl: 3000, topFtMsl: 5000 };
      let hits = 0;
      const n = 4000;
      for (let i = 0; i < n; i++) if (layerDensity(layer, 0, i * 733.1, (i * 1291.7) % 90000, 3400) > 0.3) hits++;
      expect(Math.abs(hits / n - COVER_FRACTION[cover])).toBeLessThan(0.12);
    }
    const env = defaultEnvironment();
    env.clouds = [{ cover: "OVC", baseFtMsl: 2000, topFtMsl: 3000 }];
    expect(cloudDensityAt(env, 40, -100, 2500)).toBeGreaterThan(0.95);
    expect(cloudDensityAt(env, 40, -100, 1500)).toBe(0);
    expect(cloudDensityAt(env, 40, -100, 3500)).toBe(0);
    expect(cloudFieldXY(0, 1).x).toBeCloseTo(111320, 0);
  });
});
