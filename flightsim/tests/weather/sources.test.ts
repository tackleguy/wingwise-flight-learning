/**
 * Adapters from each weather service's JSON to the common observation, checked against REAL
 * answers saved on 15 Nov 2026 (tests/weather/fixtures; fetched once with curl, see docs/notes/weather.md).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildWeather } from "@/weather/convert";
import { areaKey, isUsable, nwsAirportStations, nwsCovers, nwsToObservation, openMeteoAloft, openMeteoModelWind, openMeteoToObservation, openMeteoUrl, relayToObservation } from "@/weather/sources";

const fixtures = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");
const load = (name: string): unknown => JSON.parse(readFileSync(path.join(fixtures, name), "utf8"));
const awc = (file: string, id: string) => (load(file) as { icaoId: string }[]).find((e) => e.icaoId === id);
const NOW = Date.UTC(2026, 10, 15, 3, 20);
const FT_PER_M = 3.280839895;

describe("relay / aviationweather.gov METAR JSON", () => {
  it("KSFO (query by station id)", () => {
    const o = relayToObservation((load("awc-metar-ids-ksfo.json") as unknown[])[0], NOW)!;
    expect(o.source).toBe("metar");
    expect(o.stationId).toBe("KSFO");
    expect(o.stationName).toBe("San Francisco Intl, CA, US");
    expect(o.lat).toBeCloseTo(37.6196, 4);
    expect(o.lon).toBeCloseTo(-122.3656, 4);
    expect(o.elevFt).toBeCloseTo(2 * FT_PER_M, 3);
    expect(o.observedAtMs).toBe(1794711360 * 1000);
    expect(o.raw).toMatch(/^METAR KSFO 150256Z/);
    expect(o.wind).toEqual({ dirTrue: 0, kt: 0, gustKt: null, varFrom: null, varTo: null });
    expect(o.visibilitySm).toBe(10);
    expect(o.visibilityOrMore).toBe(true);
    expect(o.clouds.map((c) => `${c.cover}${c.baseFtAgl}`)).toEqual(["BKN18000", "BKN20000"]);
    expect(o.tempC).toBe(16);
    expect(o.dewpointC).toBe(11);
    expect(o.qnhInHg).toBeCloseTo(29.98, 3);
    expect(isUsable(o)).toBe(true);
  });

  it("every station of a real bounding-box answer converts to believable weather", () => {
    const list = load("awc-metar-bbox-sfo.json") as unknown[];
    expect(list.length).toBe(16);
    for (const e of list) {
      const o = relayToObservation(e, NOW);
      expect(isUsable(o)).toBe(true);
      const { env } = buildWeather(o!, { fallbackElevFt: 0, lat: 37.6 });
      expect(env.qnhInHg).toBeGreaterThan(29.9);
      expect(env.qnhInHg).toBeLessThan(30.1);
      expect(env.tempC).toBeGreaterThan(5);
      expect(env.tempC).toBeLessThan(25);
      expect(env.wind.length).toBeGreaterThanOrEqual(1);
      expect(env.visibilitySm).toBeGreaterThanOrEqual(6);
      for (const c of env.clouds) expect(c.topFtMsl).toBeGreaterThan(c.baseFtMsl);
    }
  });

  it("falls back to the decoded fields when the report text is missing or unreadable", () => {
    const entry = { ...(awc("awc-metar-misc.json", "PABR") as object), rawOb: "" };
    const o = relayToObservation(entry, NOW)!;
    expect(o.raw).toBeNull();
    expect(o.wind).toEqual({ dirTrue: 70, kt: 27, gustKt: 36, varFrom: null, varTo: null });
    expect(o.visibilitySm).toBe(1.25);
    expect(o.clouds).toEqual([{ cover: "OVC", baseFtAgl: 1300, type: null, obscured: false }]);
    expect(o.precipitation).toBe("snow"); // from wxString "-SN BR"
    expect(o.tempC).toBeCloseTo(-11.7, 5);
    expect(o.qnhInHg).toBeCloseTo(29.86, 2);
    const vv = relayToObservation({ ...(awc("awc-metar-misc.json", "KHVR") as object), rawOb: null }, NOW)!;
    expect(vv.clouds).toEqual([{ cover: "OVC", baseFtAgl: 200, type: null, obscured: true }]); // "OVX"
    const capped = relayToObservation({ icaoId: "EGLL", visib: "6+", wdir: "VRB", wspd: 3 }, NOW)!;
    expect(capped.visibilitySm).toBe(6);
    expect(capped.visibilityOrMore).toBe(true);
    expect(capped.wind).toMatchObject({ dirTrue: null, kt: 3 });
  });

  it("rejects things that are not a station report", () => {
    for (const bad of [null, undefined, 42, "<!doctype html>", [], {}, { error: "no-station" }, { icaoId: 7 }]) expect(relayToObservation(bad, NOW)).toBeNull();
    expect(isUsable(relayToObservation({ icaoId: "KXXX" }, NOW))).toBe(false);
  });
});

describe("api.weather.gov observations", () => {
  it("KHAF: carries the METAR text, which is parsed", () => {
    const o = nwsToObservation(load("nws-obs-khaf.json"), NOW)!;
    expect(o.source).toBe("nws");
    expect(o.stationId).toBe("KHAF");
    expect(o.stationName).toBe("Half Moon Bay Airport");
    expect(o.raw).toBe("KHAF 150235Z AUTO 00000KT 6SM BR SCT003 SCT013 SCT024 14/13 A2998 RMK AO2");
    expect(o.observedAtMs).toBe(Date.UTC(2026, 10, 15, 2, 35));
    expect(o.elevFt).toBeCloseTo(20 * FT_PER_M, 3);
    expect(o.wind).toMatchObject({ kt: 0 });
    expect(o.visibilitySm).toBe(6);
    expect(o.clouds.map((c) => `${c.cover}${c.baseFtAgl}`)).toEqual(["SCT300", "SCT1300", "SCT2400"]);
    expect(o.qnhInHg).toBe(29.98);
  });

  it("PABR: no text; km/h to knots, gust, snow, pascals to inches", () => {
    const o = nwsToObservation(load("nws-obs-pabr.json"), NOW)!;
    expect(o.raw).toBeNull();
    expect(o.wind!.dirTrue).toBe(60);
    expect(o.wind!.kt).toBeCloseTo(28, 1); // 51.84 km/h
    expect(o.wind!.gustKt).toBeCloseTo(36, 1); // 66.672 km/h
    expect(o.visibilitySm).toBeCloseTo(1.25, 2); // 2,011.68 m
    expect(o.visibilityOrMore).toBe(false);
    expect(o.clouds).toEqual([{ cover: "OVC", baseFtAgl: 1300, type: null, obscured: false }]); // 396.24 m
    expect(o.precipitation).toBe("snow");
    expect(o.tempC).toBe(-12);
    expect(o.dewpointC).toBe(-14);
    expect(o.qnhInHg).toBeCloseTo(29.86, 2); // 101,117.57 Pa
    expect(o.observedAtMs).toBe(Date.UTC(2026, 10, 15, 2, 50));
  });

  it("KHVR: fog with vertical visibility; KJFK: ten miles 'or more'", () => {
    const o = nwsToObservation(load("nws-obs-khvr.json"), NOW)!;
    expect(o.visibilitySm).toBeCloseTo(0.25, 3);
    expect(o.clouds).toEqual([{ cover: "OVC", baseFtAgl: 200, type: null, obscured: true }]);
    expect(o.elevFt).toBeCloseTo(792 * FT_PER_M, 2);
    const j = nwsToObservation(load("nws-obs-kjfk.json"), NOW)!;
    expect(j.visibilitySm).toBe(10);
    expect(j.visibilityOrMore).toBe(true);
    expect(j.wind!.kt).toBeCloseTo(12, 1);
    expect(j.clouds.map((c) => `${c.cover}${c.baseFtAgl}`)).toEqual(["BKN3600", "BKN10000"]);
  });

  it("KSFO: a five-minute observation without wind stays 'wind not reported' (the caller fills it in); KDEN: no pressure", () => {
    const o = nwsToObservation(load("nws-obs-ksfo.json"), NOW)!;
    expect(o.wind).toBeNull();
    expect(o.tempC).toBe(16);
    expect(o.qnhInHg).toBeCloseTo(29.98, 2);
    expect(o.clouds).toEqual([{ cover: "FEW", baseFtAgl: 2000, type: null, obscured: false }]);
    expect(isUsable(o)).toBe(true);
    const filled = buildWeather(o, { fallbackElevFt: 0, lat: 37.6, modelWind: { dirTrue: 250, kt: 6, gustKt: null } });
    expect(filled.env.wind[0]).toMatchObject({ dirTrue: 250, kt: 6 });
    expect(filled.env.source).toBe("nws");
    const d = nwsToObservation(load("nws-obs-kden.json"), NOW)!;
    expect(d.qnhInHg).toBeNull();
    expect(buildWeather(d, { fallbackElevFt: 0, lat: 39.8 }).env.qnhInHg).toBe(29.92);
  });

  it("picks airport stations from a station list, nearest first", () => {
    expect(nwsAirportStations(load("nws-stations-ksfo.json"))).toEqual(["KSFO", "KHAF", "KOAK"]); // SFOC1 and OAMC1 are not airports
    expect(nwsAirportStations(load("nws-points-outside-usa-404.json"))).toEqual([]);
    expect(nwsAirportStations(null)).toEqual([]);
  });

  it("the points answer names the station list; error answers convert to nothing", () => {
    const p = load("nws-points-ksfo.json") as { properties: { observationStations: string } };
    expect(p.properties.observationStations).toBe("https://api.weather.gov/gridpoints/MTR/85,98/stations");
    expect(nwsToObservation(load("nws-points-outside-usa-404.json"), NOW)).toBeNull();
    expect(nwsToObservation({ properties: {} }, NOW)).toBeNull();
  });

  it("knows roughly where the service has data", () => {
    expect(nwsCovers(37.6, -122.4)).toBe(true); // San Francisco
    expect(nwsCovers(61.2, -150)).toBe(true); // Anchorage
    expect(nwsCovers(21.3, -157.9)).toBe(true); // Honolulu
    expect(nwsCovers(18.4, -66)).toBe(true); // San Juan
    expect(nwsCovers(51.5, -0.5)).toBe(false); // London
    expect(nwsCovers(-33.9, 151.2)).toBe(false); // Sydney
    expect(nwsCovers(35.5, 139.8)).toBe(false); // Tokyo
  });
});

describe("Open-Meteo model data", () => {
  it("London: units, pressure, time, a high overcast only", () => {
    const j = load("open-meteo-egll.json");
    const o = openMeteoToObservation(j)!;
    expect(o.source).toBe("open-meteo");
    expect(o.stationId).toBeNull();
    expect(o.raw).toBeNull();
    expect(o.elevFt).toBeCloseTo(27 * FT_PER_M, 3);
    expect(o.observedAtMs).toBe(Date.UTC(2026, 10, 15, 3, 15));
    expect(o.tempC).toBe(1.6);
    expect(o.dewpointC).toBe(0.7);
    expect(o.wind).toMatchObject({ dirTrue: 123, kt: 3.1, gustKt: null });
    expect(o.qnhInHg).toBeCloseTo(1003.6 * 0.0295299830714, 3);
    expect(o.visibilitySm).toBeCloseTo(8460 / 1609.344, 3);
    expect(o.clouds).toEqual([{ cover: "BKN", baseFtAgl: 25000, type: null, obscured: false }]);
    expect(o.precipitation).toBe("none");
    const env = buildWeather(o, { fallbackElevFt: 0, lat: 51.5, aloft: openMeteoAloft(j) }).env;
    expect(env.source).toBe("open-meteo");
    expect(env.stationId).toBeUndefined();
    expect(env.rawReport).toBeUndefined();
  });

  it("winds aloft: pressure levels become altitudes above sea level", () => {
    const aloft = openMeteoAloft(load("open-meteo-egll.json"));
    expect(aloft).toEqual([
      { altFtMsl: 2205, dirTrue: 198, kt: 17.2 },
      { altFtMsl: 4462, dirTrue: 188, kt: 18 },
      { altFtMsl: 9564, dirTrue: 213, kt: 20.1 },
      { altFtMsl: 13481, dirTrue: 219, kt: 21.2 },
    ]);
    expect(openMeteoAloft({})).toEqual([]);
    expect(openMeteoAloft({ hourly: { wind_speed_850hPa: [10], wind_direction_850hPa: [270] } })).toEqual([{ altFtMsl: 4780, dirTrue: 270, kt: 10 }]); // standard height when none given
  });

  it("Leadville (9,900 ft): elevation from the service; levels below the ground are dropped when the layers are built", () => {
    const j = load("open-meteo-klxv.json");
    const o = openMeteoToObservation(j)!;
    expect(o.elevFt).toBeCloseTo(9895, 0);
    const env = buildWeather(o, { fallbackElevFt: 0, lat: 39.2, aloft: openMeteoAloft(j) }).env;
    expect(env.stationElevFt).toBeCloseTo(9895, 0);
    expect(env.wind[0]!.altFtMsl).toBeCloseTo(9895, 0);
    expect(env.wind.every((l) => l.altFtMsl >= 9895)).toBe(true);
    expect(env.wind[env.wind.length - 1]).toEqual({ altFtMsl: 13947, dirTrue: 320, kt: 8.6 });
    expect(env.clouds[0]!.baseFtMsl).toBe(19895); // a middle-level layer, 10,000 ft above the ground
  });

  it("Utqiagvik and Sydney: low cloud base from the dew-point spread, model gusts toned down", () => {
    const b = openMeteoToObservation(load("open-meteo-pabr.json"))!;
    expect(b.clouds[0]).toEqual({ cover: "BKN", baseFtAgl: 800, type: null, obscured: false }); // spread 2 °C × 400 ft
    expect(b.wind!.kt).toBe(25.3);
    expect(b.wind!.gustKt).toBeCloseTo(25.3 + 0.7 * (36.2 - 25.3), 5);
    const s = openMeteoToObservation(load("open-meteo-yssy.json"))!;
    expect(s.lat).toBeLessThan(0);
    expect(s.clouds[0]).toMatchObject({ cover: "OVC", baseFtAgl: 2300 });
    // model: 10.7 kt gusting 27.4 — far more than a station would report; limited to +10.7
    expect(s.wind!.gustKt).toBeCloseTo(21.4, 5);
    expect(openMeteoModelWind(load("open-meteo-yssy.json"))).toEqual({ dirTrue: 156, kt: 10.7, gustKt: s.wind!.gustKt });
  });

  it("Rome: a rain-shower weather code means rain", () => {
    const o = openMeteoToObservation(load("open-meteo-lirf.json"))!;
    expect(o.precipitation).toBe("rain");
    expect(o.thunderstorm).toBe(false);
    expect(o.clouds.map((c) => c.cover)).toEqual(["BKN", "OVC", "OVC"]);
  });

  it("interprets weather codes for snow, fog and thunderstorms", () => {
    const base = { latitude: 60, longitude: 10, elevation: 100, current: { time: "2026-01-10T12:00", temperature_2m: -3, dew_point_2m: -4, wind_speed_10m: 5, wind_direction_10m: 90, pressure_msl: 1000, visibility: 2000 } };
    const withCode = (code: number, extra: object = {}) => openMeteoToObservation({ ...base, current: { ...base.current, weather_code: code, ...extra } })!;
    expect(withCode(73).precipitation).toBe("snow");
    expect(withCode(3, { snowfall: 0.2 }).precipitation).toBe("snow");
    expect(withCode(3, { precipitation: 0.4 }).precipitation).toBe("snow"); // unspecified precipitation below freezing
    expect(withCode(61, { temperature_2m: 8 }).precipitation).toBe("rain");
    const fog = withCode(45, { visibility: 300 });
    expect(fog.clouds[0]).toEqual({ cover: "OVC", baseFtAgl: 100, type: null, obscured: true });
    expect(fog.visibilitySm).toBeCloseTo(0.186, 3);
    const storm = withCode(95, { temperature_2m: 22, dew_point_2m: 18, cloud_cover_low: 60 });
    expect(storm.thunderstorm).toBe(true);
    expect(storm.precipitation).toBe("rain");
    expect(storm.clouds[0]).toMatchObject({ type: "CB" });
  });

  it("converts other wind units when the service says it used them", () => {
    const j = { current_units: { wind_speed_10m: "km/h", wind_gusts_10m: "km/h" }, current: { temperature_2m: 10, wind_speed_10m: 18.52, wind_direction_10m: 270, wind_gusts_10m: 55.56 } };
    const w = openMeteoModelWind(j)!;
    expect(w.kt).toBeCloseTo(10, 5);
    expect(w.gustKt).toBeCloseTo(10 + Math.min(0.7 * 20, 10), 5);
  });

  it("an error answer or nonsense converts to nothing", () => {
    expect(openMeteoToObservation(load("open-meteo-error-400.json"))).toBeNull();
    expect(openMeteoToObservation(null)).toBeNull();
    expect(openMeteoToObservation({ current: {} })).toBeNull();
    expect(openMeteoModelWind({ current: {} })).toBeNull();
  });

  it("asks for knots, the current hour only, and rounds the position", () => {
    const url = openMeteoUrl(37.61961, -122.36558, false);
    expect(url).toContain("latitude=37.62&longitude=-122.37");
    expect(url).toContain("wind_speed_unit=kn");
    expect(url).toContain("forecast_hours=1");
    expect(url).toContain("current=temperature_2m,dew_point_2m,wind_speed_10m,wind_direction_10m,wind_gusts_10m,pressure_msl,cloud_cover,cloud_cover_low,cloud_cover_mid,cloud_cover_high,visibility,precipitation,snowfall,weather_code");
    expect(url).toContain("wind_speed_850hPa,wind_direction_850hPa,geopotential_height_850hPa");
    expect(openMeteoUrl(1, 2, true)).toContain("current=wind_speed_10m,wind_direction_10m,wind_gusts_10m&");
  });
});

describe("cache keys", () => {
  it("one key per airport, or per 0.1-degree cell without one", () => {
    expect(areaKey(37.6196, -122.3656, "ksfo")).toBe("id:KSFO");
    expect(areaKey(37.6196, -122.3656)).toBe("pos:37.6,-122.4");
    expect(areaKey(37.64, -122.41, "  ")).toBe("pos:37.6,-122.4");
  });
});
