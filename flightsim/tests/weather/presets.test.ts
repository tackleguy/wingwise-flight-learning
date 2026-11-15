/**
 * Presets in a real simulator (real JSBSim, real airport database, flat synthetic terrain):
 * the intended crosswind really is a crosswind on the runway in use, at any airport.
 */
import { describe, expect, it } from "vitest";
import { makeSim } from "../helpers";
import { windAt } from "@/core/sim";
import type { Environment } from "@/core/types";
import { PRESETS, createWeather } from "@/weather";

const angle = (a: number, b: number) => ((a - b + 540) % 360) - 180;

function checkEnvironment(env: Environment, label: string) {
  expect(env.wind.length, label).toBeGreaterThanOrEqual(1);
  expect(env.wind[0]!.altFtMsl, label).toBeCloseTo(env.stationElevFt, 6);
  for (let i = 0; i < env.wind.length; i++) {
    const l = env.wind[i]!;
    expect(Number.isFinite(l.altFtMsl + l.dirTrue + l.kt), label).toBe(true);
    expect(l.kt, label).toBeGreaterThanOrEqual(0);
    expect(l.dirTrue, label).toBeGreaterThanOrEqual(0);
    expect(l.dirTrue, label).toBeLessThan(360);
    if (i > 0) expect(l.altFtMsl, label).toBeGreaterThan(env.wind[i - 1]!.altFtMsl);
  }
  expect(env.clouds.length, label).toBeLessThanOrEqual(4);
  for (const c of env.clouds) {
    expect(c.baseFtMsl, label).toBeGreaterThanOrEqual(env.stationElevFt);
    expect(c.topFtMsl, label).toBeGreaterThan(c.baseFtMsl);
  }
  expect(env.visibilitySm, label).toBeGreaterThan(0);
  expect(env.dewpointC, label).toBeLessThanOrEqual(env.tempC);
  expect(env.qnhInHg, label).toBeGreaterThan(28);
  expect(env.qnhInHg, label).toBeLessThan(31.5);
  expect(env.gustKt, label).toBeGreaterThanOrEqual(0);
  expect(env.turbulence, label).toBeGreaterThanOrEqual(0);
  expect(env.turbulence, label).toBeLessThanOrEqual(1);
}

describe("weather presets", () => {
  it("offers the ten required situations (and one more), each with a name and a plain description", () => {
    const weather = createWeather({ relayUrl: null, persist: false });
    const list = weather.presets();
    const names = list.map((p) => p.name);
    for (const required of [
      "Calm and clear",
      "Light breeze, a few clouds",
      "Steady crosswind 10 kt",
      "Gusty crosswind 15 gusting 25",
      "Marginal VFR - haze and low scattered cloud",
      "Overcast 1500 ft, light rain",
      "Low IFR - fog 1/2 mile, overcast 300 ft",
      "Turbulent afternoon thermals",
      "Winter day - cold, high pressure",
      "Hot and high",
    ]) {
      expect(names).toContain(required);
    }
    expect(new Set(list.map((p) => p.id)).size).toBe(list.length);
    for (const p of list) {
      expect(p.id).toMatch(/^[a-z0-9-]+$/);
      expect(p.description.length).toBeGreaterThan(40);
      expect(Object.keys(p).sort()).toEqual(["description", "id", "name"]);
    }
    // the fog preset is labelled as beyond a student pilot's privileges
    expect(list.find((p) => p.id === "lifr-fog")!.description).toMatch(/beyond a student pilot's privileges/);
  });

  it("every preset gives complete, consistent weather with the intended flight category", () => {
    const weather = createWeather({ relayUrl: null, persist: false });
    const expected: Record<string, string> = {
      "calm-clear": "VFR",
      "light-breeze": "VFR",
      "crosswind-10": "VFR",
      "gusty-crosswind": "VFR",
      "mvfr-haze": "MVFR",
      "overcast-rain": "MVFR",
      "lifr-fog": "LIFR",
      thermals: "VFR",
      "winter-high": "VFR",
      "hot-high": "VFR",
      "headwind-20": "VFR",
    };
    expect(PRESETS.map((p) => p.id).sort()).toEqual(Object.keys(expected).sort());
    for (const p of weather.presets()) {
      weather.applyPreset(p.id);
      const env = weather.env;
      checkEnvironment(env, p.id);
      expect(env.source).toBe("preset");
      expect(env.stationId).toBeUndefined();
      expect(env.rawReport).toBeUndefined();
      expect(weather.activePresetId()).toBe(p.id);
      expect(weather.flightCategory(), p.id).toBe(expected[p.id]);
      expect(weather.describe().length, p.id).toBeGreaterThan(60);
    }
    weather.applyPreset("calm-clear");
    expect(weather.env.wind).toEqual([{ altFtMsl: 0, dirTrue: 0, kt: 0 }]);
    expect(weather.windAt(5000).kt).toBe(0);
    expect(weather.env.qnhInHg).toBe(29.92);
    expect(weather.env.tempC).toBe(15);
    weather.applyPreset("lifr-fog");
    expect(weather.env.visibilitySm).toBe(0.5);
    expect(weather.env.clouds).toEqual([{ cover: "OVC", baseFtMsl: 300, topFtMsl: 1500 }]);
    weather.applyPreset("overcast-rain");
    expect(weather.env.precipitation).toBe("rain");
    expect(weather.env.clouds[0]).toMatchObject({ cover: "OVC", baseFtMsl: 1500 });
    weather.applyPreset("gusty-crosswind");
    expect(weather.env.wind[0]!.kt).toBe(15);
    expect(weather.env.gustKt).toBe(10); // 15 gusting 25
  });

  it("ignores an unknown preset id", () => {
    const weather = createWeather({ relayUrl: null, persist: false });
    weather.applyPreset("crosswind-10");
    const before = JSON.stringify(weather.env);
    let notified = 0;
    weather.subscribe(() => notified++);
    weather.applyPreset("does-not-exist");
    expect(JSON.stringify(weather.env)).toBe(before);
    expect(notified).toBe(0);
    expect(weather.activePresetId()).toBe("crosswind-10");
  });

  it("'Steady crosswind 10 kt' really is a 10 kt crosswind on the runway in use (KSFO 28R)", async () => {
    const sim = makeSim(4);
    const weather = sim.use(createWeather({ relayUrl: null, persist: false }));
    await sim.spawn({ kind: "runway", airportIdent: "KSFO", runwayEndId: "28R" });
    weather.applyPreset("crosswind-10");
    const heading = sim.lastSpawn!.headingTrue; // 297.9° true
    const c = weather.components(heading);
    expect(c.crosswindKt).toBeCloseTo(10, 6);
    expect(Math.abs(c.headwindKt)).toBeLessThan(1e-6);
    expect(c.fromLeft).toBe(true);
    expect(sim.env.wind[0]!.dirTrue).toBeCloseTo(207.9, 1);
    expect(sim.env.stationElevFt).toBe(13); // KSFO's published elevation
    expect(sim.env.source).toBe("preset");
    expect(weather.describe()).toContain("on runway 28R that is a 10-knot crosswind from the left");
    expect(weather.describe()).toContain("within the 15 knots this aircraft has been demonstrated in");

    // what the aircraft feels standing on the runway: about 80 % of the reported wind (ground friction), from the left
    sim.advance(25);
    const s = sim.state;
    expect(s.windKt).toBeGreaterThan(7.8);
    expect(s.windKt).toBeLessThan(8.3);
    expect(Math.abs(angle(s.windDirTrue, 207.9))).toBeLessThan(0.5);
    expect(s.crash).toBeNull();

    // the gusty one comes from the other side, 15 kt mean
    weather.applyPreset("gusty-crosswind");
    const g = weather.components(heading);
    expect(g.crosswindKt).toBeCloseTo(15, 6);
    expect(g.fromLeft).toBe(false);
    expect(weather.describe()).toContain("15-knot crosswind from the right (up to 25 in the gusts)");
    expect(weather.describe()).toContain("the gusts go beyond it");
  });

  it("turns with the runway at every new spawn — other runway, other airport, other elevation, other hemisphere", async () => {
    const sim = makeSim(4);
    const weather = sim.use(createWeather({ relayUrl: null, persist: false }));
    weather.applyPreset("crosswind-10"); // chosen on the start screen, before any airport is known
    let notified = 0;
    weather.subscribe(() => notified++);

    await sim.spawn({ kind: "runway", airportIdent: "KSFO", runwayEndId: "19L" });
    expect(notified).toBeGreaterThan(0);
    let end = sim.lastPlan!.runway!.ends[sim.lastPlan!.endIndex!]!;
    expect(end.id).toBe("19L");
    expect(weather.components(end.headingTrue).crosswindKt).toBeCloseTo(10, 6);
    expect(weather.components(end.headingTrue).fromLeft).toBe(true);
    expect(sim.env.wind[0]!.dirTrue).toBeCloseTo(207.7 - 90, 1);

    // Denver: 5,431 ft up. Same preset, hung on the new airport and runway.
    await sim.spawn({ kind: "runway", airportIdent: "KDEN", runwayEndId: "35L" });
    end = sim.lastPlan!.runway!.ends[sim.lastPlan!.endIndex!]!;
    const c = weather.components(end.headingTrue);
    expect(c.crosswindKt).toBeCloseTo(10, 6);
    expect(c.fromLeft).toBe(true);
    expect(Math.abs(c.headwindKt)).toBeLessThan(1e-6);
    expect(sim.env.stationElevFt).toBe(5431);
    expect(sim.env.wind[0]!.altFtMsl).toBe(5431);
    expect(sim.env.clouds).toEqual([{ cover: "FEW", baseFtMsl: 5431 + 5000, topFtMsl: 5431 + 7000 }]);
    expect(sim.env.tempC).toBe(6); // standard temperature at 5,431 ft is 4 °C; the preset is 2 °C warmer
    expect(sim.env.qnhInHg).toBe(30.0);
    checkEnvironment(sim.env, "KDEN");
    // northern hemisphere: the wind veers (turns clockwise) with height
    expect(angle(windAt(sim.env, 5431 + 2000).dirTrue, sim.env.wind[0]!.dirTrue)).toBeCloseTo(25, 3);

    // Sydney: southern hemisphere — the wind backs with height
    await sim.spawn({ kind: "runway", airportIdent: "YSSY", runwayEndId: "34L" });
    end = sim.lastPlan!.runway!.ends[sim.lastPlan!.endIndex!]!;
    expect(weather.components(end.headingTrue).crosswindKt).toBeCloseTo(10, 6);
    expect(sim.env.stationElevFt).toBe(21);
    expect(angle(windAt(sim.env, 21 + 2000).dirTrue, sim.env.wind[0]!.dirTrue)).toBeCloseTo(-25, 3);
    expect(weather.activePresetId()).toBe("crosswind-10");
  });

  it("is already in place when the flight model is created: an approach starts without a jump in airspeed", async () => {
    const sim = makeSim(4);
    const weather = sim.use(createWeather({ relayUrl: null, persist: false }));
    weather.applyPreset("headwind-20");
    // the preset was anchored to "north" (no runway known). Spawning on final for 28R must turn it BEFORE the aircraft is created.
    await sim.spawn({ kind: "final", airportIdent: "KSFO", runwayEndId: "28R", finalNm: 1.5 });
    const s = sim.state;
    const heading = sim.lastSpawn!.headingTrue;
    expect(weather.components(heading).headwindKt).toBeCloseTo(20, 6);
    expect(weather.components(heading).crosswindKt).toBeLessThan(1e-6);
    // at 520 ft the wind is stronger than on the ground (wind gradient) and is a headwind: low ground speed
    expect(s.aglFt).toBeGreaterThan(450);
    expect(s.windKt).toBeGreaterThan(27);
    expect(s.windKt).toBeLessThan(31);
    expect(Math.abs(angle(s.windDirTrue, heading))).toBeLessThan(12);
    const kcas0 = s.kcas;
    expect(Math.abs(kcas0 - 65)).toBeLessThan(3);
    expect(s.ktas - s.gsKt).toBeGreaterThan(24);
    let maxDeviation = 0;
    for (let i = 0; i < 50; i++) {
      sim.advance(0.1);
      maxDeviation = Math.max(maxDeviation, Math.abs(s.kcas - kcas0));
    }
    expect(maxDeviation).toBeLessThan(4); // steady air: the trimmed speed holds through the first five seconds (measured: under 1 kt)
    expect(s.crash).toBeNull();
  });

  it("the wind fades in the last few hundred feet of an approach (20 kt reported: about 28 kt at 500 ft, 16 kt on the runway)", async () => {
    const sim = makeSim(4);
    const weather = sim.use(createWeather({ relayUrl: null, persist: false }));
    weather.applyPreset("headwind-20");
    await sim.spawn({ kind: "final", airportIdent: "KSFO", runwayEndId: "28R", finalNm: 1.5 });
    const s = sim.state;
    const seen: { agl: number; kt: number }[] = [];
    for (let i = 0; i < 1500 && !s.onGround && !s.crash; i++) {
      sim.controls.aileron = Math.max(-1, Math.min(1, -s.roll * 0.05 - s.rollRate * 0.02)); // wings level, otherwise hands off
      sim.advance(0.1);
      seen.push({ agl: s.aglFt, kt: s.windKt });
    }
    const near = (agl: number) => seen.reduce((best, p) => (Math.abs(p.agl - agl) < Math.abs(best.agl - agl) ? p : best)).kt;
    expect(near(500)).toBeGreaterThan(27.5);
    expect(near(300)).toBeGreaterThan(26.5);
    expect(near(300)).toBeLessThan(near(500));
    expect(near(100)).toBeLessThan(near(300) - 2);
    expect(near(26)).toBeGreaterThan(19);
    expect(near(26)).toBeLessThan(21.5);
    expect(near(5)).toBeLessThan(18.5);
    expect(near(5) / near(300)).toBeGreaterThan(0.55);
    // the wind only ever weakens on the way down
    for (let i = 1; i < seen.length; i++) if (seen[i]!.agl < seen[i - 1]!.agl) expect(seen[i]!.kt).toBeLessThanOrEqual(seen[i - 1]!.kt + 0.05);
    expect(weather.windStatus.friction).toBeLessThan(0.85);
  });

  it("gusty crosswind on final: the start is smooth, then the wind surges and lulls around the mean", async () => {
    const sim = makeSim(4);
    const weather = sim.use(createWeather({ relayUrl: null, persist: false, seed: 7 }));
    weather.applyPreset("gusty-crosswind");
    await sim.spawn({ kind: "final", airportIdent: "KSFO", runwayEndId: "28R", finalNm: 3 });
    const s = sim.state;
    const kcas0 = s.kcas;
    const wind0 = s.windKt;
    sim.advance(0.5);
    expect(Math.abs(s.kcas - kcas0)).toBeLessThan(1.5);
    expect(Math.abs(s.windKt - wind0)).toBeLessThan(1.5);
    let min = Infinity;
    let max = -Infinity;
    let sum = 0;
    let n = 0;
    let turbulence = 0;
    for (let i = 0; i < 400 && s.aglFt > 300 && !s.crash; i++) {
      sim.controls.aileron = Math.max(-1, Math.min(1, -s.roll * 0.05 - s.rollRate * 0.02));
      sim.controls.elevator = Math.max(-0.5, Math.min(0.5, (-2 - s.pitch) * 0.05 - s.pitchRate * 0.03));
      sim.advance(0.1);
      min = Math.min(min, s.windKt);
      max = Math.max(max, s.windKt);
      sum += s.windKt;
      n++;
      turbulence = Math.max(turbulence, sim.fdmIn.turbulence);
    }
    expect(n).toBeGreaterThan(250);
    expect(s.crash).toBeNull();
    // mean wind between 500 and 1,000 ft is about 1.45 times the reported 15 kt
    expect(sum / n).toBeGreaterThan(18);
    expect(sum / n).toBeLessThan(25);
    expect(max - min).toBeGreaterThan(6); // it really gusts
    expect(min).toBeGreaterThan(8);
    expect(max).toBeLessThan(36);
    expect(turbulence).toBeGreaterThan(0.2);
    expect(turbulence).toBeLessThanOrEqual(0.6);
  });

  it("never overrides weather that something else wrote into sim.env directly (a lesson, a test)", async () => {
    const sim = makeSim(4);
    const weather = sim.use(createWeather({ relayUrl: null, persist: false }));
    weather.applyPreset("crosswind-10");
    await sim.spawn({ kind: "runway", airportIdent: "KSFO", runwayEndId: "28R" });
    expect(weather.activePresetId()).toBe("crosswind-10");
    // a lesson sets its own wind without going through the weather module
    sim.env.wind = [{ altFtMsl: 0, dirTrue: 90, kt: 7 }];
    sim.env.visibilitySm = 3;
    expect(weather.activePresetId()).toBeNull();
    await sim.spawn({ kind: "final", airportIdent: "KDEN", runwayEndId: "35L" });
    expect(sim.env.wind).toEqual([{ altFtMsl: 0, dirTrue: 90, kt: 7 }]);
    expect(sim.env.visibilitySm).toBe(3);
    expect(sim.env.stationElevFt).toBe(13);
    // the moving air still works on that weather: the aircraft is in a 7 kt wind from the east
    sim.advance(3);
    expect(sim.state.windKt).toBeGreaterThan(6.5);
    expect(sim.state.windKt).toBeLessThan(7.5);
    expect(Math.abs(angle(sim.state.windDirTrue, 90))).toBeLessThan(2);
    expect(sim.state.crash).toBeNull();
  });

  it("leaves real weather alone at a spawn (it belongs to its station) and keeps custom numbers at the new airport", async () => {
    const sim = makeSim(4);
    const weather = sim.use(createWeather({ relayUrl: null, persist: false }));
    await sim.spawn({ kind: "runway", airportIdent: "KSFO", runwayEndId: "28R" });
    weather.setCustom({ windDirTrue: 240, windKt: 12, tempC: 30, cloudCover: "BKN", cloudBaseFtAgl: 3000 });
    expect(sim.env.source).toBe("custom");
    expect(sim.env.stationElevFt).toBe(13);
    expect(sim.env.clouds[0]!.baseFtMsl).toBe(3013);
    await sim.spawn({ kind: "runway", airportIdent: "KDEN", runwayEndId: "35L" });
    expect(sim.env.source).toBe("custom");
    expect(sim.env.stationElevFt).toBe(5431);
    expect(sim.env.tempC).toBe(30); // "30 °C at the airport" travels with the pilot
    expect(sim.env.wind[0]).toEqual({ altFtMsl: 5431, dirTrue: 240, kt: 12 }); // custom wind is absolute: not turned
    expect(sim.env.clouds[0]!.baseFtMsl).toBe(5431 + 3000);
    checkEnvironment(sim.env, "custom at KDEN");

    // real weather: pretend a report for Leadville was loaded, then spawn at Denver
    Object.assign(sim.env, { source: "metar", stationId: "KLXV", stationElevFt: 9927, wind: [{ altFtMsl: 9927, dirTrue: 300, kt: 8 }], clouds: [{ cover: "SCT", baseFtMsl: 14000, topFtMsl: 16000 }] });
    const before = JSON.stringify(sim.env);
    await sim.spawn({ kind: "runway", airportIdent: "KDEN", runwayEndId: "35L" });
    expect(JSON.stringify(sim.env)).toBe(before);
  });
});
