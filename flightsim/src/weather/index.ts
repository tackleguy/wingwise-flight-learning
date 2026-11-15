/**
 * Weather module: real-world weather (airport reports and model data, no keys needed), ready-made
 * presets, custom weather from sliders, and the moving air — wind profile with ground friction,
 * gusts, turbulence and gentle thermals. Logic and data only; the sky module draws the weather.
 *
 *   const weather = sim.use(createWeather());
 *   weather.applyPreset("crosswind-10");
 *   const result = await weather.loadRealWeather(lat, lon, "KSFO");   // never throws
 */
export { createWeather } from "./weather";
export type { CustomWeather, FetchLike, FlightCategory, RealWeatherResult, RunwayWind, WeatherApi, WeatherOptions, WeatherPreset } from "./api";
export { parseMetar, parseWeatherGroup, metarTimeMs } from "./metar";
export type { MetarCloud, MetarCloudCover, MetarWeather, MetarWind, ParsedMetar } from "./metar";
export { DEMONSTRATED_CROSSWIND_KT, ceilingFtAgl, describeWeather, fieldDensityAltitudeFt, flightCategoryOf, runwayWind } from "./describe";
export { PRESETS } from "./presets";
export { ANEMOMETER_HEIGHT_FT, frictionFactor } from "./dynamics";
export type { WindStatus } from "./dynamics";
