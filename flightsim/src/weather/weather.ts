/**
 * The weather module: keeps `sim.env` (the weather numbers) — from a preset, from the custom
 * sliders or from the real world — and, 120 times a second, works out the wind, gusts,
 * turbulence and thermals the aircraft is flying through right now (see dynamics.ts).
 */
import { defaultEnvironment } from "@/core/defaults";
import { clamp, norm360 } from "@/core/math";
import { windAt as coreWindAt, type Sim } from "@/core/sim";
import type { SpawnPlan } from "@/core/spawn";
import type { CloudCover, CloudLayer, Environment } from "@/core/types";
import type { CustomWeather, FetchLike, FlightCategory, RealWeatherResult, RunwayWind, WeatherApi, WeatherOptions, WeatherPreset } from "./api";
import { buildWeather, buildWindLayers, cloudThicknessFt, type EnvWeather } from "./convert";
import { describeWeather, flightCategoryOf, runwayWind } from "./describe";
import { WindDynamics, type WindStatus } from "./dynamics";
import { PRESETS, findPreset, presetWeather, type PresetDef } from "./presets";
import { RealWeatherClient, distanceToStationNm } from "./sources";

interface Anchor {
  /** Runway (or aircraft) heading presets are turned to; null = unknown. */
  headingTrue: number | null;
  /** Airport elevation; null = unknown. */
  elevFt: number | null;
  lat: number;
  runway: { id: string; headingTrue: number } | null;
}

function defaultFetch(): FetchLike | null {
  if (typeof fetch !== "function") return null;
  return (input, init) => fetch(input, init);
}

function defaultRelayUrl(): string | null {
  if (typeof document === "undefined") return null;
  // The relay exists only on the deployed site. Vite's development server has none: do not even ask
  // (the browser would log a "404" error in its console every time).
  if (import.meta.env?.DEV) return null;
  try {
    return new URL("api/metar", document.baseURI).href;
  } catch {
    return null;
  }
}

const COVER_ORDER: readonly CloudCover[] = ["FEW", "SCT", "BKN", "OVC"];

class Weather implements WeatherApi {
  readonly name = "weather" as const;
  /** Live numbers of the wind engine (read-only; for tests, the instructor and debugging). */
  readonly windStatus: WindStatus;

  private sim: Sim | null = null;
  /** Weather chosen before a simulator is attached. */
  private readonly scratch: Environment = defaultEnvironment();
  private scratchUsed = false;
  private readonly listeners = new Set<() => void>();
  private readonly dyn: WindDynamics;
  private readonly client: RealWeatherClient;
  private readonly now: () => number;
  private preset: PresetDef | null = null;
  /** What this module last wrote: if `sim.env` no longer matches, somebody else (a lesson, a test) set the weather and it is left alone. */
  private stamp: { wind: unknown; clouds: unknown; source: string; elev: number; vis: number; temp: number; qnh: number; gust: number } | null = null;
  /** The plan the weather was last anchored to in `beforeSpawn` (so `onSpawn` does not do it twice). */
  private anchoredPlan: SpawnPlan | null = null;
  /** Counts every choice of weather by the user: a slow real-weather download must not overwrite a newer choice. */
  private choiceSeq = 0;
  /** Counts real-weather requests: when two are under way the one asked for last is the one applied. */
  private loadSeq = 0;

  constructor(opts: WeatherOptions = {}) {
    this.now = opts.now ?? (() => Date.now());
    this.dyn = new WindDynamics(opts.seed ?? 1);
    this.windStatus = this.dyn.status;
    this.client = new RealWeatherClient({
      fetch: opts.fetch ?? defaultFetch(),
      now: this.now,
      relayUrl: opts.relayUrl === undefined ? defaultRelayUrl() : opts.relayUrl,
      timeoutMs: opts.timeoutMs ?? 6000,
      persist: opts.persist ?? true,
    });
    if (opts.sim) this.attach(opts.sim);
  }

  // ------------------------------------------------------------------ binding

  get env(): Environment {
    return this.sim ? this.sim.env : this.scratch;
  }

  attach(sim: Sim): void {
    if (this.sim === sim) return;
    this.sim = sim;
    if (this.scratchUsed) {
      // weather was chosen before the simulator existed: hand it over (the clock stays the simulator's)
      const { utcMs: _utcMs, timeRunning: _timeRunning, ...weather } = this.scratch;
      this.write(weather);
      this.scratchUsed = false;
    }
  }

  private write(weather: EnvWeather): void {
    const env = this.env;
    Object.assign(env, weather);
    if (weather.stationId === undefined) delete env.stationId;
    if (weather.rawReport === undefined) delete env.rawReport;
    if (weather.observedAtMs === undefined) delete env.observedAtMs;
    if (!this.sim) this.scratchUsed = true;
    this.remember();
  }

  private remember(): void {
    const e = this.env;
    this.stamp = { wind: e.wind, clouds: e.clouds, source: e.source, elev: e.stationElevFt, vis: e.visibilitySm, temp: e.tempC, qnh: e.qnhInHg, gust: e.gustKt };
  }

  /** True while the weather is still exactly what this module last wrote. */
  private untouched(): boolean {
    const e = this.env;
    const s = this.stamp;
    return !!s && s.wind === e.wind && s.clouds === e.clouds && s.source === e.source && s.elev === e.stationElevFt && s.vis === e.visibilitySm && s.temp === e.tempC && s.qnh === e.qnhInHg && s.gust === e.gustKt;
  }

  private changed(): void {
    for (const fn of [...this.listeners]) {
      try {
        fn();
      } catch (err) {
        console.error("[TeachX] weather listener failed", err);
      }
    }
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  // ------------------------------------------------------------------ where the weather is "hung"

  private anchorFrom(plan: SpawnPlan | null): Anchor {
    const sim = this.sim;
    if (!plan) return { headingTrue: null, elevFt: null, lat: sim ? sim.state.lat : 45, runway: null };
    const end = plan.runway && plan.endIndex !== null ? plan.runway.ends[plan.endIndex] : null;
    const airport = plan.airportIdent && sim ? sim.data.getAirport(plan.airportIdent) : undefined;
    // the airport's published elevation; away from any airport, the ground under the starting point
    const elevFt = plan.airportIdent ? (airport?.elevFt ?? plan.fallbackElevFt) : sim ? sim.elevation.groundFt(plan.lat, plan.lon) : null;
    return {
      headingTrue: end ? end.headingTrue : plan.headingTrue,
      elevFt: elevFt !== null && Number.isFinite(elevFt) ? elevFt : null,
      lat: plan.lat,
      runway: end ? { id: end.id, headingTrue: end.headingTrue } : null,
    };
  }

  private currentAnchor(): Anchor {
    return this.anchorFrom(this.sim?.lastPlan ?? null);
  }

  /**
   * Move preset / custom weather to a new airport and runway. Real weather is left alone (it belongs
   * to its station), and so is weather that somebody else wrote into `sim.env` directly.
   */
  private reanchor(plan: SpawnPlan): void {
    const env = this.env;
    if (!this.untouched()) {
      this.preset = null;
      return;
    }
    const anchor = this.anchorFrom(plan);
    if (this.preset && env.source === "preset") {
      this.write(presetWeather(this.preset, { headingTrue: anchor.headingTrue ?? 0, elevFt: anchor.elevFt ?? env.stationElevFt, lat: anchor.lat }));
      this.changed();
    } else if (env.source === "custom" && anchor.elevFt !== null && Math.abs(anchor.elevFt - env.stationElevFt) > 1) {
      // custom weather follows the pilot: the same numbers, at the new airport
      this.moveStation(anchor.elevFt);
      this.changed();
    }
  }

  /** Tie the weather to another elevation: wind and cloud layers keep their heights above the ground. */
  private moveStation(elevFt: number): void {
    const env = this.env;
    const shift = elevFt - env.stationElevFt;
    for (const l of env.wind) l.altFtMsl += shift;
    for (const c of env.clouds) {
      c.baseFtMsl += shift;
      c.topFtMsl += shift;
    }
    env.stationElevFt = elevFt;
    this.remember();
  }

  // ------------------------------------------------------------------ SimModule hooks

  beforeSpawn(sim: Sim, plan: SpawnPlan): void {
    this.attach(sim);
    try {
      this.reanchor(plan);
      this.anchoredPlan = plan;
    } catch (err) {
      console.error("[TeachX] weather could not be moved to the new airport", err);
    }
  }

  onSpawn(sim: Sim): void {
    this.attach(sim);
    // (a core without the beforeSpawn hook: do it now — the wind then eases in over a few seconds)
    if (sim.lastPlan && sim.lastPlan !== this.anchoredPlan) {
      try {
        this.reanchor(sim.lastPlan);
      } catch (err) {
        console.error("[TeachX] weather could not be moved to the new airport", err);
      }
    }
    this.anchoredPlan = null;
    this.dyn.reset();
  }

  preStep(sim: Sim, dt: number): void {
    if (this.sim !== sim) this.attach(sim);
    this.dyn.step(sim, dt);
  }

  frame(sim: Sim): void {
    if (this.sim !== sim) this.attach(sim);
  }

  dispose(): void {
    this.listeners.clear();
    this.choiceSeq++;
    this.loadSeq++;
  }

  // ------------------------------------------------------------------ presets

  presets(): WeatherPreset[] {
    return PRESETS.map((p) => ({ id: p.id, name: p.name, description: p.description }));
  }

  activePresetId(): string | null {
    return this.preset && this.env.source === "preset" && this.untouched() ? this.preset.id : null;
  }

  applyPreset(id: string): void {
    const def = findPreset(id);
    if (!def) return;
    const env = this.env;
    const anchor = this.currentAnchor();
    this.choiceSeq++;
    this.preset = def;
    this.dyn.clearExtras();
    this.dyn.thermalOverride = def.thermals;
    this.write(presetWeather(def, { headingTrue: anchor.headingTrue ?? 0, elevFt: anchor.elevFt ?? env.stationElevFt, lat: anchor.lat }));
    this.changed();
  }

  // ------------------------------------------------------------------ custom weather

  setCustom(patch: CustomWeather): void {
    const env = this.env;
    const anchor = this.currentAnchor();
    const wasReal = env.source === "metar" || env.source === "nws" || env.source === "open-meteo";
    const fin = (v: number | undefined): v is number => typeof v === "number" && Number.isFinite(v);

    // The sliders mean "at the airport". If the weather so far was tied to another elevation (the
    // untouched default is tied to sea level), move the reference to the airport first, keeping the
    // same air: the temperature there follows the standard lapse of 2 °C per 1,000 ft.
    if (!wasReal && anchor.elevFt !== null && Math.abs(anchor.elevFt - env.stationElevFt) > 1) {
      const lapse = -0.0019812 * (anchor.elevFt - env.stationElevFt);
      env.tempC += lapse;
      env.dewpointC = Math.min(env.dewpointC + lapse * 0.25, env.tempC);
      this.moveStation(anchor.elevFt);
    }
    const elev = env.stationElevFt;

    if (fin(patch.tempC)) env.tempC = clamp(patch.tempC, -60, 55);
    if (fin(patch.dewpointC)) env.dewpointC = clamp(patch.dewpointC, -70, 40);
    env.dewpointC = Math.min(env.dewpointC, env.tempC);
    if (fin(patch.qnhInHg)) env.qnhInHg = clamp(patch.qnhInHg, 27.5, 31.5);
    if (fin(patch.visibilitySm)) env.visibilitySm = clamp(patch.visibilitySm, 0.05, 100);
    if (fin(patch.turbulence)) env.turbulence = clamp(patch.turbulence, 0, 1);
    if (patch.precipitation === "none" || patch.precipitation === "rain" || patch.precipitation === "snow") env.precipitation = patch.precipitation;

    if (fin(patch.windDirTrue) || fin(patch.windKt)) {
      const surface = env.wind[0];
      const kt = clamp(fin(patch.windKt) ? patch.windKt : (surface?.kt ?? 0), 0, 80);
      const dir = norm360(fin(patch.windDirTrue) ? patch.windDirTrue : (surface?.dirTrue ?? 0));
      env.wind = buildWindLayers({ surfaceDirTrue: dir, surfaceKt: kt, stationElevFt: elev, southern: anchor.lat < 0 });
    }
    if (fin(patch.gustKt)) env.gustKt = clamp(patch.gustKt, 0, 60);

    if (patch.cloudCover !== undefined || fin(patch.cloudBaseFtAgl) || fin(patch.cloudTopFtAgl)) {
      const current: CloudLayer | undefined = [...env.clouds].sort((a, b) => a.baseFtMsl - b.baseFtMsl)[0];
      const cover = patch.cloudCover ?? current?.cover ?? "SCT";
      if (cover === "CLR" || !COVER_ORDER.includes(cover)) env.clouds = [];
      else {
        const baseAgl = clamp(fin(patch.cloudBaseFtAgl) ? patch.cloudBaseFtAgl : current ? current.baseFtMsl - elev : 3500, 0, 40000);
        let topAgl: number;
        if (fin(patch.cloudTopFtAgl)) topAgl = patch.cloudTopFtAgl;
        else if (current && (patch.cloudCover === undefined || patch.cloudCover === current.cover)) topAgl = baseAgl + (current.topFtMsl - current.baseFtMsl);
        else topAgl = baseAgl + cloudThicknessFt({ cover, baseFtAgl: baseAgl, type: null, obscured: false }, env.tempC - env.dewpointC, env.precipitation);
        topAgl = clamp(topAgl, baseAgl + 200, 60000);
        env.clouds = [{ cover, baseFtMsl: Math.round(elev + baseAgl), topFtMsl: Math.round(elev + topAgl) }];
      }
    }

    this.choiceSeq++;
    env.source = "custom";
    delete env.stationId;
    delete env.rawReport;
    delete env.observedAtMs;
    this.preset = null;
    this.dyn.clearExtras();
    if (!this.sim) this.scratchUsed = true;
    this.remember();
    this.changed();
  }

  // ------------------------------------------------------------------ real weather

  async loadRealWeather(lat: number, lon: number, airportIdent?: string): Promise<RealWeatherResult> {
    const keep = " The weather was left as it was.";
    try {
      if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90) {
        return { ok: false, source: this.env.source, message: "Real weather needs a position on Earth." + keep };
      }
      lon = ((((lon + 180) % 360) + 360) % 360) - 180;
      const choice = this.choiceSeq;
      const request = ++this.loadSeq;
      const r = await this.client.load(lat, lon, airportIdent);
      if (request !== this.loadSeq) {
        return { ok: false, source: this.env.source, message: "A newer request for real weather replaced this one." };
      }
      if (!r.ok) {
        let message: string;
        if (r.throttled) message = "Real weather for this place was asked for a moment ago without success. Please try again in a minute or two.";
        else if (r.answered) message = "No real weather could be found for this place.";
        else message = "Real weather could not be loaded: the weather services did not answer (is there an internet connection?).";
        return { ok: false, source: this.env.source, message: message + keep };
      }
      if (choice !== this.choiceSeq) {
        return { ok: false, source: this.env.source, message: "Other weather was chosen while the real weather was loading, so the real weather was not applied." };
      }
      const { obs, aloft, modelWind } = r.data;
      const env = this.env;
      const airport = airportIdent && this.sim ? this.sim.data.getAirport(airportIdent) : undefined;
      const build = buildWeather(obs, {
        fallbackElevFt: airport?.elevFt ?? env.stationElevFt,
        lat,
        aloft,
        modelWind,
        previousSurfaceDirTrue: env.wind[0]?.dirTrue,
      });
      this.preset = null;
      this.dyn.clearExtras();
      this.dyn.dirSwingDeg = build.dirSwingDeg;
      this.dyn.naturalKt = build.naturalKt;
      this.dyn.convective = build.convective;
      this.write(build.env);
      this.changed();

      const now = this.now();
      const ageMinutes = obs.observedAtMs !== null ? Math.max(0, Math.round((now - obs.observedAtMs) / 60000)) : undefined;
      const distance = distanceToStationNm(obs, lat, lon);
      const ageText = ageMinutes === undefined ? "" : ageMinutes < 2 ? ", just now" : ageMinutes < 120 ? `, ${ageMinutes} minutes ago` : `, ${Math.round(ageMinutes / 60)} hours ago`;
      let message: string;
      if (obs.source === "open-meteo") {
        message =
          "No airport weather report was available for this place, so this is weather from the Open-Meteo computer forecast model for your position — an estimate, not a measurement at the airport. Cloud heights are estimated from the humidity.";
      } else {
        const who = obs.stationName ? `${obs.stationName} (${obs.stationId ?? "?"})` : (obs.stationId ?? "the nearest station");
        const far = distance !== null && distance >= 1 ? `, ${Math.round(distance)} nm away` : "";
        const via = obs.source === "nws" ? "US National Weather Service" : "aviationweather.gov";
        message = `Real weather observed at ${who}${far}${ageText} (source: ${via}).`;
        if (ageMinutes !== undefined && ageMinutes > 120) message += " This report is old — the weather may have changed since.";
        if (distance !== null && distance > 25) message += " That station is a long way from here, so the weather at your airport may differ.";
      }
      if (build.notes.length) message += " " + build.notes.join(" ");
      const result: RealWeatherResult = { ok: true, source: obs.source, message };
      if (obs.stationId) result.stationId = obs.stationId;
      if (distance !== null) result.distanceNm = distance;
      if (obs.raw) result.raw = obs.raw;
      if (ageMinutes !== undefined) result.ageMinutes = ageMinutes;
      return result;
    } catch (err) {
      console.error("[TeachX] real weather failed", err);
      return { ok: false, source: this.env.source, message: "Real weather could not be loaded because of an unexpected error." + keep };
    }
  }

  // ------------------------------------------------------------------ questions about the weather

  windAt(altFtMsl: number): { dirTrue: number; kt: number } {
    return coreWindAt(this.env, altFtMsl);
  }

  components(runwayHeadingTrue: number): RunwayWind {
    return runwayWind(this.env, runwayHeadingTrue);
  }

  describe(): string {
    return describeWeather(this.env, { runway: this.currentAnchor().runway });
  }

  flightCategory(): FlightCategory {
    return flightCategoryOf(this.env);
  }
}

/** Create the weather module. Add it to the simulator with `sim.use(createWeather())`. */
export function createWeather(options: WeatherOptions = {}): WeatherApi {
  return new Weather(options);
}
