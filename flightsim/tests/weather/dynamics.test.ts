/**
 * The moving air (src/weather/dynamics.ts) on its own, driven step by step with a stand-in for
 * the simulator: wind profile near the ground, gust statistics, easing, turbulence, thermals.
 */
import { describe, expect, it } from "vitest";
import { CG_HEIGHT_FT, defaultEnvironment } from "@/core/defaults";
import { FPS_PER_KT } from "@/core/math";
import { windAt, type Sim } from "@/core/sim";
import type { Environment } from "@/core/types";
import { ANEMOMETER_HEIGHT_FT, GustPattern, SURFACE_REFERENCE_FT, WindDynamics, effectiveWindAltitudeFt, frictionFactor, gustHeightFactor, gustSwingDeg } from "@/weather/dynamics";
import { PRESETS, presetWeather } from "@/weather/presets";

const DT = 1 / 120;
const preset = (id: string, elevFt = 0, headingTrue = 360): Environment => ({
  ...defaultEnvironment(),
  ...presetWeather(PRESETS.find((p) => p.id === id)!, { headingTrue, elevFt, lat: 40 }),
});

/** A stand-in simulator: just the parts the wind engine reads and writes. */
function rig(env: Environment, wheelsAglFt: number, groundElevFt = env.stationElevFt) {
  const state = { time: 0, aglFt: wheelsAglFt, altMslFt: groundElevFt + wheelsAglFt + CG_HEIGHT_FT, groundElevFt, lat: 40, lon: -100, inCloud: 0 };
  const fdmIn = { windNorthFps: 0, windEastFps: 0, windDownFps: 0, turbulence: 0 };
  const sim = { env, state, fdmIn } as unknown as Sim;
  /** What the core does before every preStep: the plain layer wind at the aircraft's altitude. */
  const coreFill = () => {
    const w = windAt(env, state.altMslFt);
    fdmIn.windNorthFps = -w.kt * Math.cos((w.dirTrue * Math.PI) / 180) * FPS_PER_KT;
    fdmIn.windEastFps = -w.kt * Math.sin((w.dirTrue * Math.PI) / 180) * FPS_PER_KT;
    fdmIn.windDownFps = 0;
    fdmIn.turbulence = env.turbulence;
  };
  const used = () => {
    const n = -fdmIn.windNorthFps / FPS_PER_KT;
    const e = -fdmIn.windEastFps / FPS_PER_KT;
    return { kt: Math.hypot(n, e), dirTrue: ((Math.atan2(e, n) * 180) / Math.PI + 360) % 360, n, e };
  };
  const setHeight = (aglFt: number) => {
    state.aglFt = aglFt;
    state.altMslFt = state.groundElevFt + aglFt + CG_HEIGHT_FT;
  };
  return { sim, state, fdmIn, coreFill, used, setHeight };
}

/** Run `seconds` of steps; returns the wind used at every step. */
function run(dyn: WindDynamics, r: ReturnType<typeof rig>, seconds: number, each?: (kt: number, dirTrue: number, i: number) => void) {
  const steps = Math.round(seconds / DT);
  for (let i = 0; i < steps; i++) {
    r.coreFill();
    dyn.step(r.sim, DT);
    r.state.time += DT;
    if (each) {
      const u = r.used();
      each(u.kt, u.dirTrue, i);
    }
  }
}

/** The settled mean wind at a height (steady weather, after the easing has died away). */
function settled(env: Environment, wheelsAglFt: number, groundElevFt?: number) {
  const r = rig(env, wheelsAglFt, groundElevFt);
  const dyn = new WindDynamics(1);
  run(dyn, r, 40);
  return { ...r.used(), status: { ...dyn.status }, fdmIn: { ...r.fdmIn } };
}

describe("ground friction", () => {
  it("leaves the wind alone from anemometer height up and weakens it below, never under 60 % at 10 ft", () => {
    expect(frictionFactor(1000)).toBe(1);
    expect(frictionFactor(ANEMOMETER_HEIGHT_FT)).toBe(1);
    expect(frictionFactor(26)).toBe(1); // wheels 26 ft up = wing at 33 ft
    expect(frictionFactor(10)).toBeCloseTo(0.909, 2);
    expect(frictionFactor(10)).toBeGreaterThan(0.6);
    expect(frictionFactor(0)).toBeCloseTo(0.801, 2);
    expect(frictionFactor(-5)).toBe(frictionFactor(0));
    let prev = 0;
    for (let h = 0; h <= 60; h += 2) {
      const f = frictionFactor(h);
      expect(f).toBeGreaterThanOrEqual(prev);
      prev = f;
    }
  });

  it("the layers are read so that the reported wind applies with the wing at anemometer height", () => {
    expect(SURFACE_REFERENCE_FT).toBeCloseTo(33 - 7 + 4.36, 5);
    // wheels 26 ft above the ground at the station: exactly the surface layer
    expect(effectiveWindAltitudeFt(100 + 26 + CG_HEIGHT_FT, 26, 100, 100)).toBeCloseTo(100, 5);
  });
});

describe("wind profile on an approach (steady 10 kt reported)", () => {
  const env = preset("crosswind-10"); // reported 10 kt from 270 at a sea-level airport
  const at = (agl: number) => settled(env, agl);

  it("is the reported wind where airports measure it, about 80 % on the runway, and stronger aloft", () => {
    expect(env.wind[0]).toEqual({ altFtMsl: 0, dirTrue: 270, kt: 10 });
    expect(at(26).kt).toBeCloseTo(10, 2); // wing at 33 ft
    expect(at(0).kt).toBeCloseTo(8.01, 1);
    expect(at(10).kt).toBeCloseTo(9.1, 1);
    expect(at(300).kt).toBeGreaterThan(13.3);
    expect(at(300).kt).toBeLessThan(14);
    expect(at(1000).kt).toBeCloseTo(15.4, 0);
    expect(at(2000).kt).toBeCloseTo(18.6, 0);
  });

  it("drops steadily through the last 300 ft — the shear a pilot feels on short final — but not below about 60 % at 10 ft", () => {
    const heights = [0, 5, 10, 20, 26, 50, 100, 150, 200, 300, 500, 1000, 2000, 3000];
    const speeds = heights.map((h) => at(h).kt);
    for (let i = 1; i < speeds.length; i++) expect(speeds[i]!).toBeGreaterThan(speeds[i - 1]! - 1e-6);
    const w300 = at(300).kt;
    expect(at(10).kt / w300).toBeGreaterThan(0.6);
    expect(at(10).kt / w300).toBeLessThan(0.72);
    expect(at(0).kt / w300).toBeGreaterThan(0.55);
    // stays close to the one-seventh power law between the ground and 300 ft
    for (const h of [0, 10, 26, 50, 100, 200, 300]) {
      const law = 10 * Math.pow((h + 7) / 33, 1 / 7);
      expect(Math.abs(at(h).kt - law)).toBeLessThan(0.35);
    }
  });

  it("veers a little with height (northern hemisphere) and keeps the reported direction near the ground", () => {
    expect(at(0).dirTrue).toBeCloseTo(270, 3);
    expect(at(26).dirTrue).toBeCloseTo(270, 3);
    const d2000 = at(2000).dirTrue;
    expect(d2000).toBeGreaterThan(290);
    expect(d2000).toBeLessThan(300);
  });

  it("follows the terrain: at an airfield 2,000 ft higher than the weather station the SURFACE wind is felt, not the wind of 2,000 ft", () => {
    const high = settled(env, 0, 2000);
    expect(high.kt).toBeCloseTo(8.01, 1);
    expect(high.dirTrue).toBeCloseTo(270, 2);
    expect(settled(env, 300, 2000).kt).toBeCloseTo(at(300).kt, 1);
    // … while far above that ground the true altitude counts again
    const up = settled(env, 9000, 2000);
    expect(up.kt).toBeCloseTo(windAt(env, 11000 + CG_HEIGHT_FT - SURFACE_REFERENCE_FT).kt, 1);
    // and a valley airfield 1,500 ft below the station also gets the surface wind
    expect(settled(env, 0, -1500).kt).toBeCloseTo(8.01, 1);
  });
});

describe("gusts (reported 15 kt gusting 25)", () => {
  const env = preset("gusty-crosswind"); // 15 kt, gust increment 10
  const stats = (seed: number, wheelsAgl = 26, seconds = 600) => {
    const r = rig(env, wheelsAgl);
    const dyn = new WindDynamics(seed);
    let sum = 0;
    let n = 0;
    let max = -Infinity;
    let min = Infinity;
    let minDir = Infinity;
    let maxDir = -Infinity;
    let maxStep = 0;
    let prev = Number.NaN;
    run(dyn, r, seconds, (kt, dir, i) => {
      if (i >= 0) {
        if (!Number.isNaN(prev)) maxStep = Math.max(maxStep, Math.abs(kt - prev));
        prev = kt;
      }
      if (i < 20 / DT) return; // let the start-up easing die away
      sum += kt;
      n++;
      max = Math.max(max, kt);
      min = Math.min(min, kt);
      minDir = Math.min(minDir, dir);
      maxDir = Math.max(maxDir, dir);
    });
    return { mean: sum / n, max, min, minDir, maxDir, maxStep };
  };

  it("has the reported wind as its mean, peaks at about the reported gust, and lulls that stay well above zero", () => {
    expect(env.gustKt).toBe(10);
    for (const seed of [1, 2, 3, 7, 42]) {
      const s = stats(seed);
      expect(Math.abs(s.mean - 15), `mean, seed ${seed}`).toBeLessThan(0.6);
      expect(s.max, `peak, seed ${seed}`).toBeGreaterThan(23.5);
      expect(s.max, `peak, seed ${seed}`).toBeLessThan(25.6);
      expect(s.min, `lull, seed ${seed}`).toBeGreaterThan(5);
      expect(s.min, `lull, seed ${seed}`).toBeLessThan(11);
    }
  });

  it("is smooth (band-limited): no jumps from one step to the next", () => {
    const s = stats(1, 26, 120);
    expect(s.maxStep).toBeLessThan(0.12); // kt per 1/120 s, i.e. under about 14 kt per second
  });

  it("swings the direction a little — within ±15 degrees — around the mean", () => {
    const s = stats(1);
    expect(gustSwingDeg(10)).toBe(12);
    expect(s.minDir).toBeGreaterThanOrEqual(90 - 12 - 0.01);
    expect(s.maxDir).toBeLessThanOrEqual(90 + 12 + 0.01);
    expect(s.maxDir - s.minDir).toBeGreaterThan(8);
    expect(gustSwingDeg(0)).toBe(0);
    expect(gustSwingDeg(40)).toBe(15);
  });

  it("is stronger near the ground than high up", () => {
    expect(gustHeightFactor(0)).toBe(1);
    expect(gustHeightFactor(500)).toBe(1);
    expect(gustHeightFactor(3000)).toBeCloseTo(0.4, 5);
    expect(gustHeightFactor(10000)).toBeCloseTo(0.4, 5);
    const low = stats(1, 100, 300);
    const high = stats(1, 6000, 300);
    const lowSwing = low.max - low.min;
    const highSwing = high.max - high.min;
    expect(highSwing).toBeLessThan(lowSwing * 0.5);
    expect(highSwing).toBeGreaterThan(lowSwing * 0.3);
  });

  it("never produces a negative wind speed, even with gusts far larger than the mean wind", () => {
    const wild: Environment = { ...defaultEnvironment(), wind: [{ altFtMsl: 0, dirTrue: 200, kt: 3 }], gustKt: 25 };
    const r = rig(wild, 26);
    const dyn = new WindDynamics(5);
    let min = Infinity;
    let max = 0;
    let badNumbers = 0;
    run(dyn, r, 600, (kt) => {
      if (!Number.isFinite(kt)) badNumbers++;
      min = Math.min(min, kt);
      max = Math.max(max, kt);
    });
    expect(badNumbers).toBe(0);
    expect(min).toBeGreaterThanOrEqual(0);
    expect(dyn.status.gustNowKt).toBeGreaterThanOrEqual(-3 - 1e-9);
    expect(max).toBeGreaterThan(24);
    expect(max).toBeLessThan(29);
  });

  it("gusts from a calm mean wind blow from the reported direction", () => {
    const calmGusty: Environment = { ...defaultEnvironment(), wind: [{ altFtMsl: 0, dirTrue: 135, kt: 0 }], gustKt: 12 };
    const r = rig(calmGusty, 26);
    const dyn = new WindDynamics(3);
    let seen = 0;
    run(dyn, r, 200, (kt, dir, i) => {
      if (i > 20 / DT && kt > 4) {
        seen++;
        expect(Math.abs(dir - 135)).toBeLessThan(16);
      }
    });
    expect(seen).toBeGreaterThan(100);
  });

  it("is repeatable: the same seed gives the same air, a reset starts the same sequence again, another seed differs", () => {
    const trace = (seed: number, resetAt?: number) => {
      const r = rig(env, 26);
      const dyn = new WindDynamics(seed);
      const out: number[] = [];
      run(dyn, r, 30, (kt, _d, i) => {
        if (i % 60 === 0) out.push(kt);
        if (resetAt !== undefined && i === resetAt) {
          dyn.reset();
          r.state.time = 0; // the simulator's clock restarts at a spawn
        }
      });
      return out;
    };
    const a = trace(11);
    expect(trace(11)).toEqual(a);
    expect(trace(12)).not.toEqual(a);
    const withReset = trace(11, 15 * 120 - 1);
    expect(withReset.slice(30)).toEqual(a.slice(0, 30)); // second half replays the first half
    const p = new GustPattern(9);
    const q = new GustPattern(9);
    for (const t of [0, 0.5, 3.3, 59, 600]) {
      expect(p.speed(t)).toBe(q.speed(t));
      expect(Math.abs(p.swing(t))).toBeLessThanOrEqual(1);
      expect(p.speed(t)).toBeLessThanOrEqual(1.02);
      expect(p.speed(t)).toBeGreaterThanOrEqual(-0.85);
    }
  });

  it("has a long-run mean of zero and peaks near one for many seeds (ten-minute samples)", () => {
    for (let seed = 1; seed <= 12; seed++) {
      const g = new GustPattern(seed);
      let sum = 0;
      let max = -9;
      let n = 0;
      for (let t = 0; t < 600; t += 0.05) {
        const v = g.speed(t);
        sum += v;
        max = Math.max(max, v);
        n++;
      }
      expect(Math.abs(sum / n)).toBeLessThan(0.012);
      expect(max).toBeGreaterThan(0.9);
      expect(max).toBeLessThanOrEqual(1.02);
    }
  });
});

describe("no sudden jumps", () => {
  it("starts from the wind the flight model was created with and eases to its own", () => {
    const env = preset("gusty-crosswind");
    const r = rig(env, 400);
    const dyn = new WindDynamics(4);
    r.coreFill();
    const core = r.used();
    dyn.step(r.sim, DT);
    const first = r.used();
    expect(Math.abs(first.n - core.n)).toBeLessThan(0.05);
    expect(Math.abs(first.e - core.e)).toBeLessThan(0.05);
  });

  it("eases a change of weather in over a few seconds instead of stepping", () => {
    const env = preset("calm-clear");
    const r = rig(env, 1000);
    const dyn = new WindDynamics(1);
    run(dyn, r, 5);
    expect(r.used().kt).toBeLessThan(0.01);
    Object.assign(env, preset("headwind-20")); // 20 kt from the north, suddenly
    let maxStep = 0;
    let prev = r.used().kt;
    const at: Record<number, number> = {};
    run(dyn, r, 30, (kt, _d, i) => {
      maxStep = Math.max(maxStep, Math.abs(kt - prev));
      prev = kt;
      if (i === 1 * 120 || i === 4 * 120 || i === 12 * 120) at[i / 120] = kt;
    });
    const target = settled(env, 1000).kt;
    expect(target).toBeGreaterThan(25);
    expect(maxStep).toBeLessThan(0.08); // under 10 kt per second
    expect(at[1]!).toBeLessThan(target * 0.3);
    expect(at[4]!).toBeGreaterThan(target * 0.55);
    expect(at[4]!).toBeLessThan(target * 0.72);
    expect(at[12]!).toBeGreaterThan(target * 0.94);
    expect(r.used().kt).toBeCloseTo(target, 1);
  });
});

describe("turbulence", () => {
  it("passes the weather's turbulence through in calm air", () => {
    expect(settled(preset("calm-clear"), 1000).fdmIn.turbulence).toBe(0);
    const env = { ...preset("calm-clear"), turbulence: 0.3 };
    expect(settled(env, 1000).fdmIn.turbulence).toBeCloseTo(0.3, 5);
    expect(settled({ ...env, turbulence: 5 }, 1000).fdmIn.turbulence).toBe(1);
  });

  it("adds mechanical turbulence in strong, gusty surface wind near the ground only", () => {
    const env = { ...preset("gusty-crosswind"), clouds: [] }; // 15G25, base turbulence 0.15 (no cumulus: no thermal bumps)
    const low = settled(env, 100).fdmIn.turbulence;
    const high = settled(env, 6000).fdmIn.turbulence;
    expect(high).toBeCloseTo(0.15, 5);
    expect(low).toBeGreaterThan(0.15 + 0.2);
    expect(low).toBeLessThan(0.6);
    // a light steady wind adds nothing
    expect(settled(preset("light-breeze"), 100).fdmIn.turbulence).toBe(0);
  });

  it("is rougher inside cumulus than inside layer cloud, and roughest near a thunderstorm", () => {
    const inCloud = (env: Environment, alt: number, convective = 0) => {
      const r = rig(env, alt);
      r.state.inCloud = 1;
      const dyn = new WindDynamics(1);
      dyn.convective = convective;
      run(dyn, r, 2);
      return r.fdmIn.turbulence;
    };
    const night = Date.UTC(2026, 5, 21, 7, 0); // no sun: no thermals to add their own bumps
    const cumulus = { ...preset("light-breeze"), utcMs: night, clouds: [{ cover: "SCT" as const, baseFtMsl: 4000, topFtMsl: 7000 }] };
    const stratus = { ...preset("light-breeze"), utcMs: night, clouds: [{ cover: "OVC" as const, baseFtMsl: 4000, topFtMsl: 7000 }] };
    expect(inCloud(cumulus, 5000)).toBeCloseTo(0.25, 5);
    expect(inCloud(stratus, 5000)).toBeCloseTo(0.05, 5);
    expect(inCloud(cumulus, 5000, 1)).toBeCloseTo(0.6, 5);
    expect(settled(cumulus, 5000).fdmIn.turbulence).toBe(0); // same place, clear air between the clouds
  });
});

describe("thermals", () => {
  /** `override`: thermal strength fixed by a preset, or null = worked out from the weather. */
  const sample = (env: Environment, agl: number, override: number | null) => {
    const r = rig(env, agl);
    const dyn = new WindDynamics(1);
    dyn.thermalOverride = override;
    const fpm: number[] = [];
    // fly a 40 km line eastward, sampling every 50 m
    for (let i = 0; i < 800; i++) {
      r.state.lon = -100 + (i * 50) / (111320 * Math.cos((40 * Math.PI) / 180));
      r.coreFill();
      dyn.step(r.sim, DT);
      r.state.time += DT;
      fpm.push(-r.fdmIn.windDownFps * 60 || 0); // (|| 0 turns "minus zero" into zero)
    }
    return { fpm, max: Math.max(...fpm), min: Math.min(...fpm), mean: fpm.reduce((a, b) => a + b, 0) / fpm.length, dyn };
  };

  it("gives gentle lift under the cumulus and sink between them, with the 'thermals' preset", () => {
    const env = preset("thermals"); // scattered cumulus based 4,500 ft
    const s = sample(env, 2500, 1);
    expect(s.max).toBeGreaterThan(150);
    expect(s.max).toBeLessThanOrEqual(480 * 0.67 + 1); // at most about 320 ft/min up …
    expect(s.min).toBeLessThan(-100);
    expect(s.min).toBeGreaterThanOrEqual(-480 * 0.33 - 1); // … and about 160 ft/min down
    expect(Math.abs(s.mean)).toBeLessThan(60); // what goes up comes down
    expect(s.dyn.status.thermalStrength).toBe(1);
    // no walls of air: over 50 m (one second of flight) the change stays under about 130 ft/min
    for (let i = 1; i < s.fpm.length; i++) expect(Math.abs(s.fpm[i]! - s.fpm[i - 1]!)).toBeLessThan(130);
    // … and the thermal bumps show up as extra turbulence under the clouds
    expect(s.dyn.status.turbulence).toBeCloseTo(0.35 + 0.2, 5);
  });

  it("leaves the last 100 ft above the ground alone and fades out above the cloud tops", () => {
    const env = preset("thermals");
    const low = sample(env, 60, 1);
    expect(low.max).toBe(0);
    expect(low.min).toBe(0);
    const mid = sample(env, 800, 1);
    const full = sample(env, 2500, 1);
    expect(mid.max).toBeLessThan(full.max);
    expect(mid.max).toBeGreaterThan(0);
    const above = sample(env, 9500, 1);
    expect(above.max).toBe(0);
    expect(above.min).toBe(0);
  });

  it("without a preset: needs cumulus, warmth and sun — none without clouds, at night or on a cold day", () => {
    const noon = Date.UTC(2026, 5, 21, 19, 0); // midday at 100° W
    const night = Date.UTC(2026, 5, 21, 7, 0);
    const warm = { ...preset("thermals"), utcMs: noon };
    const natural = sample(warm, 2500, null);
    expect(natural.max).toBeGreaterThan(150); // 27 °C, high sun, scattered cumulus
    expect(natural.dyn.status.thermalStrength).toBe(1);
    expect(sample({ ...warm, utcMs: night }, 2500, null).max).toBe(0);
    expect(sample({ ...warm, tempC: 5, dewpointC: -5 }, 2500, null).max).toBe(0);
    const mild = sample({ ...warm, tempC: 18 }, 2500, null);
    expect(mild.dyn.status.thermalStrength).toBeCloseTo(0.5, 5);
    expect(mild.max).toBeLessThan(natural.max);
    // no cumulus to put them under: none, even when a preset asks
    expect(sample({ ...warm, clouds: [] }, 2500, 1).max).toBe(0);
    expect(sample({ ...warm, clouds: [{ cover: "OVC" as const, baseFtMsl: 4500, topFtMsl: 6000 }] }, 2500, 1).max).toBe(0);
  });

  it("a preset can ask for smooth air even on a warm sunny day", () => {
    const noon = Date.UTC(2026, 5, 21, 19, 0);
    const s = sample({ ...preset("thermals"), utcMs: noon }, 2500, 0);
    expect(s.max).toBe(0);
    expect(s.min).toBe(0);
  });
});

describe("cost", () => {
  it("is cheap: a minute of simulated time (7,200 steps) takes milliseconds, not seconds", () => {
    const r = rig(preset("thermals"), 1500);
    r.state.inCloud = 0.5;
    const dyn = new WindDynamics(1);
    dyn.thermalOverride = 1;
    run(dyn, r, 20); // warm up
    r.coreFill();
    const t = performance.now();
    for (let i = 0; i < 7200; i++) {
      dyn.step(r.sim, DT);
      r.state.time += DT;
    }
    const ms = performance.now() - t;
    // Measured about 0.7 microseconds per step (5 ms per minute of flight) on an idle machine. The limit
    // only catches gross mistakes: it is far above that so a busy test machine cannot make the test fail.
    expect(ms).toBeLessThan(1000);
  });
});
