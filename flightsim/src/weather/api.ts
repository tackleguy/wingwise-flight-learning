/**
 * Public contract of the weather module: real-world weather, ready-made presets, custom weather
 * from sliders, and the moving air itself (wind profile, gusts, turbulence, thermals).
 *
 * The weather NUMBERS live in `sim.env` (`Environment` in core/types.ts) — this module writes
 * them. What the weather LOOKS like is drawn by the sky module, which only reads `sim.env`.
 */
import type { Sim, SimModule } from "@/core/sim";
import type { CloudCover, Environment } from "@/core/types";
import type { WindStatus } from "./dynamics";

/** A ready-made weather situation the student can pick from a list. */
export interface WeatherPreset {
  id: string;
  name: string;
  /** One or two plain sentences: what it is and what it is good for. */
  description: string;
}

/**
 * Values from the "custom weather" sliders. Every field is optional: omitted fields keep their
 * current value.
 */
export interface CustomWeather {
  /** Direction the surface wind blows FROM, degrees true (absolute, not relative to a runway). */
  windDirTrue?: number;
  /** Mean surface wind speed, kt (what an airport reports, measured 10 m / 33 ft above the ground). */
  windKt?: number;
  /**
   * How far the gust peaks rise ABOVE the mean wind, kt — the same meaning as `Environment.gustKt`
   * (0 = steady). A report of "15 gusting 25" is `windKt: 15, gustKt: 10`.
   */
  gustKt?: number;
  /** 0 none … 1 severe. */
  turbulence?: number;
  visibilitySm?: number;
  /** One cloud layer ("CLR" removes all cloud). Giving any cloud field replaces the layers by this single layer. */
  cloudCover?: CloudCover | "CLR";
  /** Height of the cloud base above the airport (the weather station), ft. */
  cloudBaseFtAgl?: number;
  /** Height of the cloud top above the airport, ft (default: a believable thickness for the cloud type). */
  cloudTopFtAgl?: number;
  /** Temperature and dew point at the airport, °C. */
  tempC?: number;
  dewpointC?: number;
  /** Altimeter setting (QNH), inches of mercury. */
  qnhInHg?: number;
  precipitation?: "none" | "rain" | "snow";
}

/** What `loadRealWeather` found (it never throws). */
export interface RealWeatherResult {
  /** True when real weather was found and applied. False: the weather was left as it was. */
  ok: boolean;
  /** Where the applied weather came from ("metar" = an airport report from aviationweather.gov). When `ok` is false: the source of the weather that is still in force. */
  source: Environment["source"];
  stationId?: string;
  /** Distance from the requested position to the reporting station, nm. */
  distanceNm?: number;
  /** The raw report text (METAR), when the source has one. */
  raw?: string;
  /** Age of the observation, minutes. */
  ageMinutes?: number;
  /** Plain-language explanation for the student (where the weather came from, how old it is, or why it failed). */
  message: string;
}

/** Headwind / crosswind on a runway. */
export interface RunwayWind {
  /** + = headwind, − = tailwind, kt. */
  headwindKt: number;
  /** Always ≥ 0, kt. `fromLeft` tells the side. */
  crosswindKt: number;
  /** True when the crosswind comes from the pilot's left on that runway heading. */
  fromLeft: boolean;
}

export type FlightCategory = "VFR" | "MVFR" | "IFR" | "LIFR";

export interface WeatherApi extends SimModule {
  readonly name: "weather";
  presets(): WeatherPreset[];
  /**
   * Apply a ready-made weather situation. Wind directions of presets are relative to the runway
   * in use (when one is known), so "crosswind 10 kt" really is a 10 kt crosswind there; the preset
   * is turned to the new runway automatically at every later spawn until other weather is chosen.
   * Unknown ids are ignored.
   */
  applyPreset(id: string): void;
  /** Fetch the latest real weather nearest a position (or for an airport) and apply it. Never throws; on failure keeps the current weather and explains in message. */
  loadRealWeather(lat: number, lon: number, airportIdent?: string): Promise<RealWeatherResult>;
  /** Apply custom values from the sliders; omitted fields keep their current value. Marks env.source 'custom'. */
  setCustom(patch: CustomWeather): void;
  /** Mean wind (no gust) at an altitude. */
  windAt(altFtMsl: number): { dirTrue: number; kt: number };
  /** Crosswind and headwind components for a runway heading (true degrees), kt. */
  components(runwayHeadingTrue: number): RunwayWind;
  /** Plain-language summary of the current weather for a beginner, and the flight category (VFR / MVFR / IFR / LIFR). */
  describe(): string;
  flightCategory(): FlightCategory;
  /** Notified whenever the weather changes (UI refresh). */
  subscribe(fn: () => void): () => void;

  // ---- extras (not required by the contract, but handy for the UI, lessons and tests)

  /**
   * Bind the module to a simulator before its first hook runs (optional — the first `frame`,
   * `beforeSpawn`, `onSpawn` or `preStep` call binds it automatically). Weather chosen before the
   * module is bound is kept and written to `sim.env` when it binds.
   */
  attach(sim: Sim): void;
  /** Id of the preset in force, or null when the weather is custom / real / changed since. */
  activePresetId(): string | null;
  /** The weather this module is working on: `sim.env` once bound to a simulator. */
  readonly env: Environment;
  /**
   * Live numbers of the wind engine at the aircraft (mean wind, gust and friction applied right now,
   * turbulence, thermal lift). The same object is updated in place every physics step — read it, do not keep copies.
   */
  readonly windStatus: Readonly<WindStatus>;
}

/** A minimal `fetch` (the browser's, or a test double). */
export type FetchLike = (input: string, init?: { headers?: Record<string, string>; signal?: AbortSignal }) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}>;

/** Optional settings for `createWeather` (all have sensible defaults; tests inject doubles). */
export interface WeatherOptions {
  /** Seed for the gusts. The same seed and the same flight give the same gusts. Default 1. */
  seed?: number;
  /** Bind to this simulator immediately (otherwise the first hook binds it). */
  sim?: Sim;
  /** Replacement for the global `fetch` (tests). */
  fetch?: FetchLike;
  /** Replacement for `Date.now` (tests). */
  now?: () => number;
  /**
   * URL of the same-origin relay to aviationweather.gov. Default: `api/metar` next to the page
   * (present only when the site is deployed on Vercel). `null` = never try the relay.
   */
  relayUrl?: string | null;
  /** Time allowed per weather source, ms. Default 6000. */
  timeoutMs?: number;
  /** Persist fetched weather in localStorage for ten minutes. Default true. */
  persist?: boolean;
}
