/**
 * The weather module as a whole: flight category, the plain-language description, runway wind
 * components, custom weather from the sliders, hand-over to the simulator and wind write-back.
 */
import { describe, expect, it } from "vitest";
import { makeSim } from "../helpers";
import { defaultEnvironment } from "@/core/defaults";
import { FPS_PER_KT } from "@/core/math";
import { windAt } from "@/core/sim";
import type { CloudLayer, Environment } from "@/core/types";
import { DEMONSTRATED_CROSSWIND_KT, ceilingFtAgl, createWeather, describeWeather, fieldDensityAltitudeFt, flightCategoryOf, runwayWind } from "@/weather";

const env = (patch: Partial<Environment> = {}): Environment => ({ ...defaultEnvironment(), ...patch });
const layer = (cover: CloudLayer["cover"], baseFtMsl: number): CloudLayer => ({ cover, baseFtMsl, topFtMsl: baseFtMsl + 1500 });
const sky = (visibilitySm: number, clouds: CloudLayer[] = [], stationElevFt = 0) => env({ visibilitySm, clouds, stationElevFt });

describe("flight category (FAA definitions)", () => {
  it("VFR needs a ceiling above 3,000 ft and more than 5 miles", () => {
    expect(flightCategoryOf(sky(10))).toBe("VFR");
    expect(flightCategoryOf(sky(5.01, [layer("BKN", 3100)]))).toBe("VFR");
    expect(flightCategoryOf(sky(6, [layer("FEW", 800), layer("SCT", 1500)]))).toBe("VFR"); // few and scattered are not a ceiling
  });
  it("MVFR: ceiling 1,000 to 3,000 ft and/or visibility 3 to 5 miles", () => {
    expect(flightCategoryOf(sky(10, [layer("BKN", 3000)]))).toBe("MVFR");
    expect(flightCategoryOf(sky(10, [layer("OVC", 1000)]))).toBe("MVFR");
    expect(flightCategoryOf(sky(5))).toBe("MVFR");
    expect(flightCategoryOf(sky(3))).toBe("MVFR");
  });
  it("IFR: ceiling 500 to below 1,000 ft and/or visibility 1 to below 3 miles", () => {
    expect(flightCategoryOf(sky(10, [layer("BKN", 999)]))).toBe("IFR");
    expect(flightCategoryOf(sky(10, [layer("OVC", 500)]))).toBe("IFR");
    expect(flightCategoryOf(sky(2.99))).toBe("IFR");
    expect(flightCategoryOf(sky(1))).toBe("IFR");
  });
  it("LIFR: ceiling below 500 ft and/or visibility below 1 mile", () => {
    expect(flightCategoryOf(sky(10, [layer("OVC", 499)]))).toBe("LIFR");
    expect(flightCategoryOf(sky(0.99))).toBe("LIFR");
    expect(flightCategoryOf(sky(0.25, [layer("OVC", 200)]))).toBe("LIFR");
  });
  it("measures the ceiling above the station, not above sea level, and uses the lowest broken or overcast layer", () => {
    // Denver-like field at 5,400 ft: a layer at 7,000 ft MSL is only 1,600 ft above the ground
    const e = sky(10, [layer("SCT", 6000), layer("OVC", 9000), layer("BKN", 7000)], 5400);
    expect(ceilingFtAgl(e)).toBe(1600);
    expect(flightCategoryOf(e)).toBe("MVFR");
    expect(ceilingFtAgl(sky(10, [layer("SCT", 2000)]))).toBeNull();
  });
  it("a reported ceiling of exactly 3,000 ft is MVFR even when the station elevation is not a whole number of feet", () => {
    // Sydney: elevation 3 m = 9.84 ft; "BKN030" becomes a base of 3,010 ft MSL
    const sydney = sky(10, [layer("SCT", 1810), layer("BKN", 3010)], 9.84251968);
    expect(ceilingFtAgl(sydney)).toBe(3000);
    expect(flightCategoryOf(sydney)).toBe("MVFR");
    expect(flightCategoryOf(sky(10, [layer("BKN", 3110)], 9.84251968))).toBe("VFR");
    expect(flightCategoryOf(sky(10, [layer("OVC", 1010)], 9.84251968))).toBe("MVFR");
    expect(flightCategoryOf(sky(10, [layer("OVC", 910)], 9.84251968))).toBe("IFR");
  });
});

describe("headwind and crosswind on a runway", () => {
  const wind = (dirTrue: number, kt: number) => env({ wind: [{ altFtMsl: 0, dirTrue, kt }] });
  it("splits the reported surface wind for a runway heading", () => {
    const c = runwayWind(wind(300, 20), 270); // 30° from the right
    expect(c.headwindKt).toBeCloseTo(17.32, 2);
    expect(c.crosswindKt).toBeCloseTo(10, 5);
    expect(c.fromLeft).toBe(false);
    const l = runwayWind(wind(240, 20), 270);
    expect(l.crosswindKt).toBeCloseTo(10, 5);
    expect(l.fromLeft).toBe(true);
    expect(runwayWind(wind(90, 12), 270).headwindKt).toBeCloseTo(-12, 5); // a tailwind is a negative headwind
    expect(runwayWind(wind(350, 10), 10)).toMatchObject({ fromLeft: true }); // across north
    expect(runwayWind(wind(0, 0), 123)).toEqual({ headwindKt: 0, crosswindKt: 0, fromLeft: false });
    expect(runwayWind(env({ wind: [] }), 90)).toEqual({ headwindKt: 0, crosswindKt: 0, fromLeft: false });
  });
  it("is what the module's components() returns", () => {
    const weather = createWeather({ relayUrl: null, persist: false });
    weather.setCustom({ windDirTrue: 300, windKt: 20 });
    expect(weather.components(270).crosswindKt).toBeCloseTo(10, 5);
    expect(weather.components(270).headwindKt).toBeCloseTo(17.32, 2);
    expect(weather.components(270).fromLeft).toBe(false);
  });
});

describe("plain-language description", () => {
  const rw = { id: "27", headingTrue: 270 };
  it("says the category, sky, visibility and temperature, then the wind and the runway", () => {
    const text = describeWeather(env({ wind: [{ altFtMsl: 0, dirTrue: 300, kt: 12 }], visibilitySm: 10, clouds: [layer("SCT", 3500)], tempC: 18 }), { runway: rw });
    expect(text).toBe(
      "Good weather for visual flying (VFR): visibility 10 miles, scattered clouds at 3,500 ft above the airport, 18 °C. " +
        "Wind from the north-west (300° true) at 12 knots; on runway 27 that is a 6-knot crosswind from the right with a 10-knot headwind — within the 15 knots this aircraft has been demonstrated in.",
    );
  });
  it("compares the crosswind with the aircraft's demonstrated 15 kt, including the gusts", () => {
    expect(DEMONSTRATED_CROSSWIND_KT).toBe(15);
    const over = describeWeather(env({ wind: [{ altFtMsl: 0, dirTrue: 0, kt: 22 }] }), { runway: rw });
    expect(over).toContain("a 22-knot crosswind from the right");
    expect(over).toContain("more than the 15 knots this aircraft has been demonstrated in, and beyond what a student should attempt");
    const gusty = describeWeather(env({ wind: [{ altFtMsl: 0, dirTrue: 180, kt: 12 }], gustKt: 8 }), { runway: rw });
    expect(gusty).toContain("at 12 knots, gusting to 20");
    expect(gusty).toContain("a 12-knot crosswind from the left (up to 20 in the gusts)");
    expect(gusty).toContain("but the gusts go beyond it");
  });
  it("handles calm, a pure headwind, a tailwind, and no known runway", () => {
    expect(describeWeather(env({ wind: [{ altFtMsl: 0, dirTrue: 0, kt: 0 }] }), { runway: rw })).toContain("The wind is calm.");
    expect(describeWeather(env({ wind: [{ altFtMsl: 0, dirTrue: 270, kt: 14 }] }), { runway: rw })).toContain("on runway 27 that is a 14-knot headwind with no crosswind to speak of.");
    const tail = describeWeather(env({ wind: [{ altFtMsl: 0, dirTrue: 100, kt: 9 }] }), { runway: rw });
    expect(tail).toContain("a 9-knot tailwind");
    expect(tail).toContain("the opposite runway would be the better choice");
    const none = describeWeather(env({ wind: [{ altFtMsl: 0, dirTrue: 135, kt: 7 }] }));
    expect(none).toContain("Wind from the south-east (135° true) at 7 knots.");
    expect(none).not.toContain("runway");
    expect(describeWeather(env({ wind: [{ altFtMsl: 0, dirTrue: 2, kt: 5 }] }))).toContain("from the north (002° true)");
    expect(describeWeather(env({ wind: [{ altFtMsl: 0, dirTrue: 359.8, kt: 5 }] }))).toContain("(360° true)");
  });
  it("names poor weather for what it is", () => {
    const fog = describeWeather(env({ visibilitySm: 0.5, clouds: [layer("OVC", 300)], tempC: 8, dewpointC: 8 }));
    expect(fog).toMatch(/^Very low cloud or visibility \(LIFR\), far too poor for visual flying: visibility half a mile, overcast \(solid cloud\) at 300 ft above the airport, 8 °C\./);
    const rain = describeWeather(env({ visibilitySm: 5, clouds: [layer("FEW", 800), layer("OVC", 1500)], precipitation: "rain" }));
    expect(rain).toMatch(/^Marginal weather for visual flying \(MVFR\): visibility 5 miles in rain, a few clouds at 800 ft and overcast \(solid cloud\) at 1,500 ft above the airport/);
    expect(describeWeather(env({ visibilitySm: 2, precipitation: "snow" }))).toMatch(/^Instrument weather \(IFR\), too poor for visual flying: visibility 2 miles in snow, no clouds/);
    expect(describeWeather(env({ visibilitySm: 1.5 }))).toContain("visibility 1.5 miles");
    expect(describeWeather(env({ visibilitySm: 30 }))).toContain("visibility more than 10 miles");
    expect(describeWeather(env({ visibilitySm: 7 }))).toContain("visibility 7 miles");
    expect(describeWeather(env({ visibilitySm: 0.1 }))).toContain("less than a quarter of a mile");
  });
  it("adds a remark on thin air when it is hot or high, and on dense air when it is very cold", () => {
    // Leadville on a warm day: 9,927 ft, 22 °C
    const hot = env({ stationElevFt: 9927, tempC: 22, dewpointC: 2, qnhInHg: 30.1 });
    expect(fieldDensityAltitudeFt(hot)).toBeGreaterThan(12500);
    expect(fieldDensityAltitudeFt(hot)).toBeLessThan(13500);
    const text = describeWeather(hot);
    expect(text).toMatch(/The air is thin today: the density altitude at the airport is about 1[23],\d00 ft \(the airport itself is at 9,900 ft\), so expect a longer take-off roll and a weaker climb/);
    // sea level, 38 °C
    expect(describeWeather(env({ tempC: 38, dewpointC: 15 }))).toContain("density altitude at the airport is about 2,700 ft,");
    // a standard day at sea level: nothing to say
    expect(Math.abs(fieldDensityAltitudeFt(env()))).toBeLessThan(5);
    expect(describeWeather(env())).not.toContain("density altitude");
    expect(describeWeather(env({ tempC: -15, dewpointC: -20, qnhInHg: 30.5 }))).toContain("cold and dense");
  });
  it("is two or three sentences", () => {
    for (const e of [env(), env({ tempC: 38 }), env({ visibilitySm: 0.5, clouds: [layer("OVC", 300)] })]) {
      const sentences = describeWeather(e, { runway: rw }).split(/(?<=\.)\s+(?=[A-Z])/);
      expect(sentences.length).toBeGreaterThanOrEqual(2);
      expect(sentences.length).toBeLessThanOrEqual(3);
    }
  });
});

describe("custom weather from the sliders", () => {
  it("changes only what is given, marks the weather 'custom' and clears what belonged to a report or preset", () => {
    const weather = createWeather({ relayUrl: null, persist: false });
    weather.applyPreset("overcast-rain");
    const before = { ...weather.env, wind: [...weather.env.wind], clouds: [...weather.env.clouds] };
    let notified = 0;
    const off = weather.subscribe(() => notified++);
    weather.setCustom({ visibilitySm: 2 });
    const e = weather.env;
    expect(e.visibilitySm).toBe(2);
    expect(e.source).toBe("custom");
    expect(weather.activePresetId()).toBeNull();
    expect(e.wind).toEqual(before.wind);
    expect(e.clouds).toEqual(before.clouds);
    expect(e.tempC).toBe(before.tempC);
    expect(e.qnhInHg).toBe(before.qnhInHg);
    expect(e.precipitation).toBe("rain");
    expect(e.gustKt).toBe(0);
    expect(notified).toBe(1);
    expect(weather.flightCategory()).toBe("IFR");
    off();
    weather.setCustom({ visibilitySm: 3 });
    expect(notified).toBe(1);
  });

  it("takes the wind direction as an absolute true direction and rebuilds the winds above the ground", () => {
    const weather = createWeather({ relayUrl: null, persist: false });
    weather.setCustom({ windDirTrue: 200, windKt: 14, gustKt: 9 });
    const e = weather.env;
    expect(e.wind[0]).toEqual({ altFtMsl: 0, dirTrue: 200, kt: 14 });
    expect(e.gustKt).toBe(9);
    expect(e.wind.length).toBeGreaterThan(3);
    expect(weather.windAt(2000).kt).toBeCloseTo(14 * 1.67 + 2, 3);
    expect(weather.windAt(2000)).toEqual(windAt(e, 2000));
    // speed only: the direction stays
    weather.setCustom({ windKt: 5 });
    expect(weather.env.wind[0]).toEqual({ altFtMsl: 0, dirTrue: 200, kt: 5 });
    expect(weather.env.gustKt).toBe(9);
    // direction only (and beyond 360)
    weather.setCustom({ windDirTrue: 370 });
    expect(weather.env.wind[0]).toEqual({ altFtMsl: 0, dirTrue: 10, kt: 5 });
  });

  it("sets one cloud layer by cover, base and top above the airport; CLR removes the clouds", () => {
    const weather = createWeather({ relayUrl: null, persist: false });
    weather.setCustom({ cloudCover: "BKN", cloudBaseFtAgl: 2500, cloudTopFtAgl: 4000 });
    expect(weather.env.clouds).toEqual([{ cover: "BKN", baseFtMsl: 2500, topFtMsl: 4000 }]);
    expect(weather.flightCategory()).toBe("MVFR");
    weather.setCustom({ cloudBaseFtAgl: 800 }); // same cover, same thickness, lower
    expect(weather.env.clouds).toEqual([{ cover: "BKN", baseFtMsl: 800, topFtMsl: 2300 }]);
    expect(weather.flightCategory()).toBe("IFR");
    weather.setCustom({ cloudCover: "FEW" }); // another kind of cloud: a believable thickness for it
    expect(weather.env.clouds[0]!.cover).toBe("FEW");
    expect(weather.env.clouds[0]!.baseFtMsl).toBe(800);
    expect(weather.env.clouds[0]!.topFtMsl - 800).toBeGreaterThanOrEqual(800);
    weather.setCustom({ cloudTopFtAgl: 100 }); // a top below the base is pushed above it
    expect(weather.env.clouds[0]!.topFtMsl).toBe(1000);
    weather.setCustom({ cloudCover: "CLR" });
    expect(weather.env.clouds).toEqual([]);
    weather.setCustom({ cloudBaseFtAgl: 4000 }); // no cover known: scattered
    expect(weather.env.clouds[0]).toMatchObject({ cover: "SCT", baseFtMsl: 4000 });
  });

  it("keeps the values inside sensible limits and ignores rubbish", () => {
    const weather = createWeather({ relayUrl: null, persist: false });
    weather.setCustom({ windKt: -5, gustKt: 500, turbulence: 7, visibilitySm: -1, tempC: 200, dewpointC: 300, qnhInHg: 12 });
    const e = weather.env;
    expect(e.wind[0]!.kt).toBe(0);
    expect(e.gustKt).toBe(60);
    expect(e.turbulence).toBe(1);
    expect(e.visibilitySm).toBe(0.05);
    expect(e.tempC).toBe(55);
    expect(e.dewpointC).toBeLessThanOrEqual(e.tempC);
    expect(e.qnhInHg).toBe(27.5);
    const snapshot = JSON.stringify(e);
    weather.setCustom({ windKt: Number.NaN, tempC: Number.POSITIVE_INFINITY, precipitation: "hail" as never, cloudCover: undefined });
    expect(JSON.stringify(weather.env)).toBe(snapshot);
    weather.setCustom({ tempC: 5, dewpointC: 9, precipitation: "snow" });
    expect(weather.env.dewpointC).toBe(5); // the dew point cannot be above the temperature
    expect(weather.env.precipitation).toBe("snow");
  });

  it("means 'at the airport': temperature, pressure and cloud heights are tied to the airport the aircraft is at", async () => {
    const sim = makeSim(5431 / 3.280839895);
    const weather = sim.use(createWeather({ relayUrl: null, persist: false }));
    await sim.spawn({ kind: "runway", airportIdent: "KDEN", runwayEndId: "35L" });
    // untouched default weather is tied to sea level (15 °C there, i.e. about 4 °C at Denver)
    expect(sim.env.stationElevFt).toBe(0);
    weather.setCustom({ cloudCover: "SCT", cloudBaseFtAgl: 4000 });
    expect(sim.env.stationElevFt).toBe(5431);
    expect(sim.env.tempC).toBeCloseTo(15 - 0.0019812 * 5431, 5); // same air as before: nothing else changed
    expect(sim.env.clouds[0]!.baseFtMsl).toBe(5431 + 4000);
    expect(sim.env.wind[0]).toEqual({ altFtMsl: 5431, dirTrue: 270, kt: 5 });
    weather.setCustom({ tempC: 30 });
    expect(sim.env.tempC).toBe(30);
    sim.advance(3);
    expect(Math.abs(sim.state.oatC - 30)).toBeLessThan(1.5); // 30 °C outside the aircraft on the Denver runway
    expect(weather.describe()).toContain("density altitude");
  });
});

describe("in the simulator", () => {
  it("hands weather chosen before the simulator existed over to it, leaving the clock alone", async () => {
    const weather = createWeather({ relayUrl: null, persist: false });
    weather.applyPreset("winter-high");
    weather.setCustom({ visibilitySm: 12 });
    const chosen = { ...weather.env };
    const sim = makeSim(4);
    const utc = sim.env.utcMs;
    sim.use(weather);
    expect(sim.env.source).toBe("preset"); // not yet bound: no hook has run
    await sim.spawn({ kind: "runway", airportIdent: "KSFO", runwayEndId: "28R" });
    expect(weather.env).toBe(sim.env);
    expect(sim.env.source).toBe("custom");
    expect(sim.env.visibilitySm).toBe(12);
    expect(sim.env.qnhInHg).toBe(chosen.qnhInHg);
    expect(sim.env.tempC).toBe(chosen.tempC);
    expect(sim.env.utcMs).toBe(utc);
    expect(sim.env.stationElevFt).toBe(13); // … and tied to the airport of the first spawn
    expect(sim.controls.altimeterInHg).toBe(30.5); // the spawn already saw the chosen pressure
    expect(sim.module("weather")).toBe(weather);
  });

  it("added to a simulator that has already spawned: the preset is turned to the runway in use straight away", async () => {
    const sim = makeSim(4);
    await sim.spawn({ kind: "runway", airportIdent: "KSFO", runwayEndId: "19L" });
    const weather = createWeather({ relayUrl: null, persist: false });
    weather.applyPreset("crosswind-10"); // no runway known yet: hung on north
    expect(weather.env.wind[0]!.dirTrue).toBe(270);
    sim.use(weather); // the simulator calls onSpawn with the last spawn
    expect(weather.env).toBe(sim.env);
    expect(sim.env.wind[0]!.dirTrue).toBeCloseTo(207.7 - 90, 1);
    expect(weather.components(207.7).crosswindKt).toBeCloseTo(10, 3);
    sim.advance(30); // the wind eases in from what the flight model had; nothing breaks
    expect(sim.state.crash).toBeNull();
    expect(sim.state.windKt).toBeGreaterThan(7.8);
    expect(sim.state.windKt).toBeLessThan(8.3);
  });

  it("away from any airport a preset is hung on the aircraft's heading and the ground below", async () => {
    const sim = makeSim(1000); // flat ground at 1,000 m = 3,281 ft everywhere
    const weather = sim.use(createWeather({ relayUrl: null, persist: false }));
    weather.applyPreset("gusty-crosswind");
    await sim.spawn({ kind: "air", lat: 46, lon: 8, altFtMsl: 7000, headingTrue: 40, kias: 100 });
    expect(sim.env.stationElevFt).toBeCloseTo(3281, 0);
    expect(sim.env.wind[0]!.dirTrue).toBeCloseTo(130, 6); // from the right of a 040° heading
    expect(sim.env.clouds[0]!.baseFtMsl).toBe(Math.round(sim.env.stationElevFt + 4500));
    expect(weather.describe()).not.toContain("runway");
  });

  it("can be bound explicitly, and a second simulator is not confused with the first", () => {
    const sim = makeSim(4);
    const weather = createWeather({ relayUrl: null, persist: false, sim });
    weather.applyPreset("lifr-fog");
    expect(sim.env.visibilitySm).toBe(0.5);
    expect(weather.env).toBe(sim.env);
    weather.attach(sim);
    expect(weather.env).toBe(sim.env);
  });

  it("writes the wind it uses back so the simulator's wind read-out is the wind the aircraft is really in", async () => {
    const sim = makeSim(0);
    const weather = sim.use(createWeather({ relayUrl: null, persist: false, seed: 3 }));
    weather.setCustom({ windDirTrue: 270, windKt: 20, gustKt: 12 });
    await sim.spawn({ kind: "air", lat: 40, lon: -100, altFtMsl: 800, headingTrue: 270, kias: 100 });
    const s = sim.state;
    let checked = 0;
    for (let i = 0; i < 200; i++) {
      sim.advance(0.1);
      const usedKt = Math.hypot(sim.fdmIn.windNorthFps, sim.fdmIn.windEastFps) / FPS_PER_KT;
      expect(Math.abs(s.windKt - usedKt)).toBeLessThan(1e-6);
      checked++;
    }
    expect(checked).toBe(200);
    expect(s.crash).toBeNull();
    // it is the gusty wind, not the plain layer wind
    expect(Math.abs(weather.windStatus.gustNowKt)).toBeGreaterThan(0);
    expect(weather.windStatus.meanKt).toBeGreaterThan(20);
    expect(weather.windStatus.friction).toBe(1);
    // head-on wind: true airspeed minus ground speed is about the wind
    expect(Math.abs(s.ktas - s.gsKt - s.windKt)).toBeLessThan(6);
  });

  it("under cumulus on the 'thermals' preset the air goes up and down and the ride is bumpy", async () => {
    const sim = makeSim(0);
    const weather = sim.use(createWeather({ relayUrl: null, persist: false }));
    weather.applyPreset("thermals");
    await sim.spawn({ kind: "air", lat: 40, lon: -100, altFtMsl: 3000, headingTrue: 90, kias: 100 });
    const s = sim.state;
    let up = 0;
    let down = 0;
    let maxG = 1;
    let minG = 1;
    for (let i = 0; i < 1800 && !s.crash; i++) {
      sim.controls.aileron = Math.max(-1, Math.min(1, -s.roll * 0.04 - s.rollRate * 0.015));
      sim.controls.elevator = Math.max(-0.4, Math.min(0.4, (1 - s.pitch) * 0.04 - s.pitchRate * 0.03));
      sim.advance(0.1);
      up = Math.max(up, weather.windStatus.thermalFpm);
      down = Math.min(down, weather.windStatus.thermalFpm);
      maxG = Math.max(maxG, s.nz);
      minG = Math.min(minG, s.nz);
    }
    expect(s.crash).toBeNull();
    expect(up).toBeGreaterThan(120);
    expect(up).toBeLessThan(330);
    expect(down).toBeLessThan(-80);
    expect(down).toBeGreaterThan(-170);
    expect(sim.fdmIn.turbulence).toBeGreaterThan(0.35);
    // bumps you can feel (measured: 0.54 g to 1.54 g), nothing that breaks the aircraft
    expect(maxG).toBeGreaterThan(1.05);
    expect(maxG).toBeLessThan(3);
    expect(minG).toBeGreaterThan(-0.5);
    expect(minG).toBeLessThan(0.95);
  });

  it("stops notifying after dispose", () => {
    const weather = createWeather({ relayUrl: null, persist: false });
    let n = 0;
    weather.subscribe(() => n++);
    weather.subscribe(() => {
      throw new Error("a broken listener must not stop the others");
    });
    weather.subscribe(() => n++);
    const quiet = console.error;
    console.error = () => undefined;
    try {
      weather.applyPreset("calm-clear");
    } finally {
      console.error = quiet;
    }
    expect(n).toBe(2);
    weather.dispose?.();
    weather.applyPreset("light-breeze");
    expect(n).toBe(2);
  });
});
