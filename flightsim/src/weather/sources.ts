/**
 * Real-world weather from free services that need no key and no account:
 *
 *  1. the simulator's own relay (`api/metar`, a Vercel function) to aviationweather.gov — the
 *     official airport reports (METAR) of the whole world. The relay exists because
 *     aviationweather.gov cannot be called from a browser directly (no CORS header);
 *  2. api.weather.gov (US National Weather Service) — observations of US stations;
 *  3. Open-Meteo — weather-MODEL data for any point on Earth (CC BY 4.0). Not an airport
 *     observation; also used for the winds above the ground.
 *
 * This file has the adapters from each service's JSON to the common `Observation`, and the
 * client that tries the sources in order with a time limit, a ten-minute cache (memory +
 * localStorage) and a rule never to ask one source about one place more than once in ten minutes.
 */
import { FT_PER_M, INHG_PER_HPA, KT_PER_MPS, clamp, distanceNm } from "@/core/math";
import { loadJson, saveJson } from "@/core/storage";
import type { WindLayer } from "@/core/types";
import type { FetchLike } from "./api";
import { metarToObservation, precipitationFromWeather, type ModelWind, type ObsCloud, type Observation } from "./convert";
import { metarTimeMs, parseMetar, parseWeatherGroup, type MetarWeather } from "./metar";

const SM_PER_M = 1 / 1609.344;
const KT_PER_KMH = 1 / 1.852;
const KT_PER_MPH = 0.8689762;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const num = (v: unknown): number | null => {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return null;
};
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);

function blankObservation(source: Observation["source"]): Observation {
  return {
    source,
    stationId: null,
    stationName: null,
    lat: null,
    lon: null,
    elevFt: null,
    observedAtMs: null,
    raw: null,
    wind: null,
    visibilitySm: null,
    visibilityOrMore: false,
    clouds: [],
    precipitation: "none",
    thunderstorm: false,
    tempC: null,
    dewpointC: null,
    qnhInHg: null,
  };
}

/** True when an observation has enough in it to be worth applying. */
export function isUsable(obs: Observation | null): obs is Observation {
  return !!obs && (obs.tempC !== null || obs.wind !== null || obs.visibilitySm !== null);
}

const COVERS = new Set(["FEW", "SCT", "BKN", "OVC"]);

// ---------------------------------------------------------------- 1. relay (aviationweather.gov METAR JSON)

/**
 * The compact JSON of the relay — which has the same field names as aviationweather.gov's own
 * `metar?format=json` entries, so one entry of that API works too. The raw report text is parsed
 * with the simulator's own METAR parser; the decoded JSON fields only fill gaps.
 */
export function relayToObservation(json: unknown, nowMs: number): Observation | null {
  if (!isObj(json)) return null;
  const id = str(json.icaoId);
  if (!id) return null;
  const rawOb = str(json.rawOb);
  const parsed = rawOb ? parseMetar(rawOb) : null;
  const obsTime = num(json.obsTime);
  const elevM = num(json.elev);
  const extra = {
    source: "metar" as const,
    stationName: str(json.name),
    lat: num(json.lat),
    lon: num(json.lon),
    elevFt: elevM !== null ? elevM * FT_PER_M : null,
    observedAtMs: obsTime !== null ? obsTime * 1000 : parsed ? metarTimeMs(parsed.day, parsed.hour, parsed.minute, nowMs) : null,
  };
  const obs = parsed ? metarToObservation(parsed, extra) : { ...blankObservation("metar"), ...extra };
  obs.stationId = id.toUpperCase();
  obs.raw = rawOb;

  if (!obs.wind) {
    const wspd = num(json.wspd);
    if (wspd !== null) {
      const wdir = num(json.wdir);
      const wgst = num(json.wgst);
      obs.wind = { dirTrue: json.wdir === "VRB" || wdir === null ? null : wdir % 360, kt: wspd, gustKt: wgst !== null && wgst > wspd ? wgst : null, varFrom: null, varTo: null };
    }
  }
  if (obs.visibilitySm === null) {
    const v = json.visib;
    if (typeof v === "string" && v.endsWith("+")) {
      const base = num(v.slice(0, -1));
      if (base !== null) {
        obs.visibilitySm = base;
        obs.visibilityOrMore = true;
      }
    } else {
      const n = num(v);
      if (n !== null) {
        obs.visibilitySm = n;
        obs.visibilityOrMore = n >= 10;
      }
    }
  }
  if (obs.tempC === null) obs.tempC = num(json.temp);
  if (obs.dewpointC === null) obs.dewpointC = num(json.dewp);
  if (obs.qnhInHg === null) {
    const hpa = num(json.altim);
    if (hpa !== null && hpa > 850 && hpa < 1100) obs.qnhInHg = hpa * INHG_PER_HPA;
  }
  if (!obs.clouds.length && Array.isArray(json.clouds)) {
    for (const c of json.clouds) {
      if (!isObj(c)) continue;
      const cover = str(c.cover);
      const base = num(c.base);
      if (!cover || base === null) continue;
      if (COVERS.has(cover)) obs.clouds.push({ cover: cover as ObsCloud["cover"], baseFtAgl: base, type: null, obscured: false });
      else if (cover === "OVX") obs.clouds.push({ cover: "OVC", baseFtAgl: base, type: null, obscured: true });
    }
  }
  if (!parsed) {
    const wx = str(json.wxString);
    if (wx) {
      const groups = wx
        .split(/\s+/)
        .map(parseWeatherGroup)
        .filter((g): g is MetarWeather => g !== null);
      const r = precipitationFromWeather(groups, obs.tempC);
      obs.precipitation = r.precipitation;
      obs.thunderstorm = r.thunderstorm;
    }
  }
  return obs;
}

// ---------------------------------------------------------------- 2. api.weather.gov

function nwsValue(p: Obj, field: string): { value: number | null; unit: string } {
  const q = p[field];
  if (!isObj(q)) return { value: null, unit: "" };
  return { value: num(q.value), unit: typeof q.unitCode === "string" ? q.unitCode : "" };
}
function nwsSpeedKt(p: Obj, field: string): number | null {
  const { value, unit } = nwsValue(p, field);
  if (value === null) return null;
  if (unit.includes("km_h")) return value * KT_PER_KMH;
  if (unit.includes("m_s")) return value * KT_PER_MPS;
  if (unit.includes("mi_h")) return value * KT_PER_MPH;
  return value; // knots
}
function nwsTempC(p: Obj, field: string): number | null {
  const { value, unit } = nwsValue(p, field);
  if (value === null) return null;
  return unit.includes("degF") ? ((value - 32) * 5) / 9 : value;
}

/**
 * One observation of api.weather.gov (`/stations/{id}/observations/latest`). When the
 * observation carries the METAR text (`rawMessage`) that is parsed; otherwise the decoded fields
 * are used. A missing wind stays "not reported" (null) so the caller can fill it from a model.
 */
export function nwsToObservation(json: unknown, nowMs: number): Observation | null {
  if (!isObj(json) || !isObj(json.properties)) return null;
  const p = json.properties;
  const stationUrl = str(p.station);
  const id = str(p.stationId) ?? (stationUrl ? (stationUrl.split("/").pop() ?? null) : null);
  if (!id) return null;
  const timestamp = str(p.timestamp);
  const t = timestamp ? Date.parse(timestamp) : NaN;
  const elev = nwsValue(p, "elevation");
  const coords = isObj(json.geometry) && Array.isArray(json.geometry.coordinates) ? json.geometry.coordinates : [];
  const rawMessage = str(p.rawMessage);
  const parsed = rawMessage ? parseMetar(rawMessage) : null;
  const extra = {
    source: "nws" as const,
    stationName: str(p.stationName),
    lat: num(coords[1]),
    lon: num(coords[0]),
    elevFt: elev.value !== null ? elev.value * FT_PER_M : null,
    observedAtMs: Number.isFinite(t) ? t : parsed ? metarTimeMs(parsed.day, parsed.hour, parsed.minute, nowMs) : null,
  };
  const obs = parsed ? metarToObservation(parsed, extra) : { ...blankObservation("nws"), ...extra };
  obs.stationId = id.toUpperCase();
  obs.raw = rawMessage;

  if (!obs.wind) {
    const speed = nwsSpeedKt(p, "windSpeed");
    if (speed !== null) {
      const dir = nwsValue(p, "windDirection").value;
      const gust = nwsSpeedKt(p, "windGust");
      obs.wind = { dirTrue: dir === null ? null : ((dir % 360) + 360) % 360, kt: speed, gustKt: gust !== null && gust > speed ? gust : null, varFrom: null, varTo: null };
    }
  }
  if (obs.visibilitySm === null) {
    const v = nwsValue(p, "visibility").value;
    if (v !== null) {
      obs.visibilitySm = v * SM_PER_M;
      obs.visibilityOrMore = v >= 16000; // automatic stations stop at 10 miles
    }
  }
  if (obs.tempC === null) obs.tempC = nwsTempC(p, "temperature");
  if (obs.dewpointC === null) obs.dewpointC = nwsTempC(p, "dewpoint");
  if (obs.qnhInHg === null) {
    // "barometricPressure" of an airport station is its altimeter setting, in pascals
    const pa = nwsValue(p, "barometricPressure").value ?? nwsValue(p, "seaLevelPressure").value;
    if (pa !== null && pa > 85000 && pa < 110000) obs.qnhInHg = (pa / 100) * INHG_PER_HPA;
  }
  if (!obs.clouds.length && Array.isArray(p.cloudLayers)) {
    for (const c of p.cloudLayers) {
      if (!isObj(c)) continue;
      const amount = str(c.amount);
      const baseM = isObj(c.base) ? num(c.base.value) : null;
      if (!amount || baseM === null) continue;
      const baseFt = Math.round((baseM * FT_PER_M) / 100) * 100;
      if (COVERS.has(amount)) obs.clouds.push({ cover: amount as ObsCloud["cover"], baseFtAgl: baseFt, type: null, obscured: false });
      else if (amount === "VV") obs.clouds.push({ cover: "OVC", baseFtAgl: baseFt, type: null, obscured: true });
    }
  }
  if (!parsed && Array.isArray(p.presentWeather)) {
    const groups: MetarWeather[] = [];
    for (const w of p.presentWeather) {
      const g = isObj(w) ? parseWeatherGroup(str(w.rawString) ?? "") : null;
      if (g) groups.push(g);
    }
    const r = precipitationFromWeather(groups, obs.tempC);
    obs.precipitation = r.precipitation;
    obs.thunderstorm = r.thunderstorm;
  }
  return obs;
}

/** Station identifiers from an api.weather.gov station list, nearest first, airports (4-character ids) only. */
export function nwsAirportStations(json: unknown): string[] {
  if (!isObj(json) || !Array.isArray(json.features)) return [];
  const out: string[] = [];
  for (const f of json.features) {
    const id = isObj(f) && isObj(f.properties) ? str(f.properties.stationIdentifier) : null;
    if (id && /^[A-Z][A-Z0-9]{3}$/.test(id)) out.push(id);
  }
  return out;
}

/** Rough test for "the National Weather Service covers this point" (the 50 states, Puerto Rico / Virgin Islands, Guam). */
export function nwsCovers(lat: number, lon: number): boolean {
  if (lat >= 17 && lat <= 72 && lon >= -180 && lon <= -64) return true;
  if (lat >= 50 && lat <= 56 && lon >= 170) return true; // western Aleutians
  return lat >= 12 && lat <= 21 && lon >= 143 && lon <= 147; // Guam, Northern Marianas
}

// ---------------------------------------------------------------- 3. Open-Meteo

const OM_LEVELS = [925, 850, 700, 600] as const;
/** Standard-atmosphere heights of the pressure levels, metres (used when the model height is missing). */
const OM_STANDARD_M: Record<number, number> = { 925: 762, 850: 1457, 700: 3012, 600: 4206 };
const OM_CURRENT = "temperature_2m,dew_point_2m,wind_speed_10m,wind_direction_10m,wind_gusts_10m,pressure_msl,cloud_cover,cloud_cover_low,cloud_cover_mid,cloud_cover_high,visibility,precipitation,snowfall,weather_code";
const OM_CURRENT_WIND = "wind_speed_10m,wind_direction_10m,wind_gusts_10m";
const OM_HOURLY = OM_LEVELS.map((l) => `wind_speed_${l}hPa,wind_direction_${l}hPa,geopotential_height_${l}hPa`).join(",");

export function openMeteoUrl(lat: number, lon: number, windsOnly: boolean): string {
  return `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(2)}&longitude=${lon.toFixed(2)}&current=${windsOnly ? OM_CURRENT_WIND : OM_CURRENT}&hourly=${OM_HOURLY}&forecast_hours=1&wind_speed_unit=kn`;
}

function omSpeedFactor(units: unknown, field: string): number {
  const u = isObj(units) ? str(units[field]) : null;
  if (u === "km/h") return KT_PER_KMH;
  if (u === "m/s") return KT_PER_MPS;
  if (u === "mp/h" || u === "mph") return KT_PER_MPH;
  return 1;
}

/**
 * Model gusts are the strongest gust the model expects, usually well above what a station would
 * report. Only a clear excess counts, and it is toned down: peak = wind + 70 % of the excess,
 * the excess limited to the larger of 10 kt and the mean wind.
 */
function modelGustPeak(kt: number, gust: number | null): number | null {
  if (gust === null || gust - kt < 10) return null;
  return kt + Math.min(0.7 * (gust - kt), Math.max(10, kt));
}

/** The model's surface (10 m) wind from an Open-Meteo answer. */
export function openMeteoModelWind(json: unknown): ModelWind | null {
  if (!isObj(json) || !isObj(json.current)) return null;
  const f = omSpeedFactor(json.current_units, "wind_speed_10m");
  const kt = num(json.current.wind_speed_10m);
  const dir = num(json.current.wind_direction_10m);
  if (kt === null || dir === null) return null;
  const gust = num(json.current.wind_gusts_10m);
  return { dirTrue: ((dir % 360) + 360) % 360, kt: kt * f, gustKt: modelGustPeak(kt * f, gust !== null ? gust * omSpeedFactor(json.current_units, "wind_gusts_10m") : null) };
}

/** Winds aloft (altitudes MSL) from the pressure-level winds of an Open-Meteo answer, lowest first. */
export function openMeteoAloft(json: unknown): WindLayer[] {
  if (!isObj(json) || !isObj(json.hourly)) return [];
  const h = json.hourly;
  const first = (key: string): number | null => {
    const a = h[key];
    return Array.isArray(a) ? num(a[0]) : null;
  };
  const out: WindLayer[] = [];
  for (const level of OM_LEVELS) {
    const kt = first(`wind_speed_${level}hPa`);
    const dir = first(`wind_direction_${level}hPa`);
    if (kt === null || dir === null) continue;
    const heightM = first(`geopotential_height_${level}hPa`) ?? OM_STANDARD_M[level]!;
    out.push({ altFtMsl: Math.round(heightM * FT_PER_M), dirTrue: ((dir % 360) + 360) % 360, kt: kt * omSpeedFactor(json.hourly_units, `wind_speed_${level}hPa`) });
  }
  return out.sort((a, b) => a.altFtMsl - b.altFtMsl);
}

function coverFromPercent(pct: number | null): ObsCloud["cover"] | null {
  if (pct === null || pct < 6.25) return null;
  if (pct < 31.25) return "FEW";
  if (pct < 56.25) return "SCT";
  if (pct < 93.75) return "BKN";
  return "OVC";
}

/**
 * Open-Meteo "current" model data as an observation. This is what a weather model calculates for
 * the grid cell — not something measured at an airport. Cloud bases are not given by the service:
 * the low layer is put at the usual estimate (temperature − dew point) × 400 ft, the middle and
 * high layers at typical heights of 10,000 and 25,000 ft above the ground.
 */
export function openMeteoToObservation(json: unknown): Observation | null {
  if (!isObj(json) || !isObj(json.current)) return null;
  const c = json.current;
  const tempC = num(c.temperature_2m);
  if (tempC === null) return null;
  const obs = blankObservation("open-meteo");
  obs.lat = num(json.latitude);
  obs.lon = num(json.longitude);
  const elevM = num(json.elevation);
  obs.elevFt = elevM !== null ? elevM * FT_PER_M : null;
  const time = str(c.time);
  if (time) {
    const t = Date.parse(/[zZ]|[+-]\d\d:\d\d$/.test(time) ? time : time + "Z");
    if (Number.isFinite(t)) obs.observedAtMs = t - (num(json.utc_offset_seconds) ?? 0) * 1000;
  }
  obs.tempC = tempC;
  obs.dewpointC = num(c.dew_point_2m);
  const mw = openMeteoModelWind(json);
  if (mw) obs.wind = { dirTrue: mw.kt < 0.5 ? null : mw.dirTrue, kt: mw.kt, gustKt: mw.gustKt, varFrom: null, varTo: null };
  const hpa = num(c.pressure_msl);
  if (hpa !== null && hpa > 850 && hpa < 1100) obs.qnhInHg = hpa * INHG_PER_HPA;
  const visM = num(c.visibility);
  if (visM !== null) obs.visibilitySm = clamp(visM * SM_PER_M, 0.05, 40);

  const code = num(c.weather_code) ?? -1;
  const fog = code === 45 || code === 48;
  const snowCode = (code >= 71 && code <= 77) || code === 85 || code === 86;
  const rainCode = (code >= 51 && code <= 67) || (code >= 80 && code <= 82) || code >= 95;
  const snowfall = num(c.snowfall) ?? 0;
  const precip = num(c.precipitation) ?? 0;
  if (snowCode || snowfall > 0) obs.precipitation = "snow";
  else if (rainCode || precip >= 0.1) obs.precipitation = tempC <= 0 && !rainCode ? "snow" : "rain";
  obs.thunderstorm = code >= 95;

  const spread = Math.max(0, tempC - (obs.dewpointC ?? tempC - 5));
  const low = coverFromPercent(num(c.cloud_cover_low));
  const mid = coverFromPercent(num(c.cloud_cover_mid));
  const high = coverFromPercent(num(c.cloud_cover_high));
  if (fog) obs.clouds.push({ cover: "OVC", baseFtAgl: 100, type: null, obscured: true });
  else if (low) obs.clouds.push({ cover: low, baseFtAgl: clamp(Math.round((spread * 400) / 100) * 100, 300, 6000), type: obs.thunderstorm ? "CB" : null, obscured: false });
  if (mid) obs.clouds.push({ cover: mid, baseFtAgl: 10000, type: null, obscured: false });
  if (high) obs.clouds.push({ cover: high, baseFtAgl: 25000, type: null, obscured: false });
  if (fog && (obs.visibilitySm === null || obs.visibilitySm > 0.6)) obs.visibilitySm = 0.5;
  return obs;
}

// ---------------------------------------------------------------- the client

/** What is cached for one station / area. */
export interface RealWeatherData {
  obs: Observation;
  /** Real winds aloft (null = could not be fetched: they are then estimated). */
  aloft: WindLayer[] | null;
  /** Model surface wind (fallback when the station did not report wind). */
  modelWind: ModelWind | null;
  fetchedAtMs: number;
}

export type RealFetchResult =
  | { ok: true; data: RealWeatherData; fromCache: boolean }
  | {
      ok: false;
      /** At least one service answered (so the network works) but none had weather for this place. */
      answered: boolean;
      /** Nothing was asked because every source was already tried for this place in the last minutes. */
      throttled: boolean;
    };

export interface ClientDeps {
  fetch: FetchLike | null;
  now: () => number;
  relayUrl: string | null;
  timeoutMs: number;
  persist: boolean;
}

/** How long fetched weather is reused, and how long one source is left alone for one place after it answered. */
export const CACHE_TTL_MS = 10 * 60 * 1000;
/** After a source did not answer at all (offline, timed out) it may be tried again after this long. */
export const RETRY_AFTER_NO_ANSWER_MS = 60 * 1000;
const STORE_KEY = "weather.cache.v1";
const MAX_STORED = 16;

type SourceName = "relay" | "nws" | "open-meteo";
type Attempt = { status: "ok"; obs: Observation; extra?: unknown } | { status: "none" } | { status: "absent" } | { status: "error" };

class HttpError extends Error {}

/** Key under which weather for a place is cached: the airport when one is named, otherwise a 0.1° cell (about 6 nm). */
export function areaKey(lat: number, lon: number, ident?: string | null): string {
  if (ident && ident.trim()) return `id:${ident.trim().toUpperCase()}`;
  return `pos:${lat.toFixed(1)},${lon.toFixed(1)}`;
}

const looksLikeIcao = (ident: string | null | undefined): ident is string => !!ident && /^[A-Z][A-Z0-9]{3}$/.test(ident.trim().toUpperCase());

export class RealWeatherClient {
  private readonly memory = new Map<string, RealWeatherData>();
  private readonly attempts = new Map<string, { t: number; answered: boolean }>();
  private readonly inFlight = new Map<string, Promise<RealFetchResult>>();
  private loadedStore = false;

  constructor(private readonly deps: ClientDeps) {}

  /** Latest real weather for a place: from the cache when fresh, otherwise from the first source that has it. Never rejects. */
  load(lat: number, lon: number, ident?: string | null): Promise<RealFetchResult> {
    const key = areaKey(lat, lon, ident);
    const cached = this.cached(key);
    if (cached) return Promise.resolve({ ok: true, data: cached, fromCache: true });
    const running = this.inFlight.get(key);
    if (running) return running;
    const p = this.fetchAll(key, lat, lon, ident ?? null)
      .catch((): RealFetchResult => ({ ok: false, answered: false, throttled: false }))
      .finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, p);
    return p;
  }

  private cached(key: string): RealWeatherData | null {
    const now = this.deps.now();
    if (!this.loadedStore) {
      this.loadedStore = true;
      if (this.deps.persist) {
        const stored = loadJson<Record<string, RealWeatherData>>(STORE_KEY, {});
        for (const [k, v] of Object.entries(stored)) {
          if (isObj(v) && isObj(v.obs) && typeof v.fetchedAtMs === "number" && !this.memory.has(k)) this.memory.set(k, v);
        }
      }
    }
    const hit = this.memory.get(key);
    if (!hit) return null;
    const age = now - hit.fetchedAtMs;
    if (age < 0 || age >= CACHE_TTL_MS) {
      this.memory.delete(key);
      return null;
    }
    return hit;
  }

  private store(key: string, data: RealWeatherData): void {
    this.memory.set(key, data);
    if (!this.deps.persist) return;
    const now = this.deps.now();
    const fresh = [...this.memory.entries()].filter(([, v]) => now - v.fetchedAtMs < CACHE_TTL_MS).sort((a, b) => b[1].fetchedAtMs - a[1].fetchedAtMs);
    saveJson(STORE_KEY, Object.fromEntries(fresh.slice(0, MAX_STORED)));
  }

  private blocked(source: SourceName, key: string): boolean {
    const now = this.deps.now();
    for (const k of [`${source}|${key}`, `${source}|*`]) {
      const a = this.attempts.get(k);
      if (!a) continue;
      const age = now - a.t;
      if (age >= 0 && age < (a.answered ? CACHE_TTL_MS : RETRY_AFTER_NO_ANSWER_MS)) return true;
    }
    return false;
  }

  /** Run `work` with a time limit; a slow answer is abandoned (and the request aborted where the browser supports it). */
  private deadline<T>(ms: number, work: (signal: AbortSignal | undefined) => Promise<T>): Promise<T> {
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        controller?.abort();
        reject(new Error("timed out"));
      }, ms);
      work(controller?.signal).then(
        (v) => {
          clearTimeout(timer);
          resolve(v);
        },
        (e: unknown) => {
          clearTimeout(timer);
          reject(e instanceof Error ? e : new Error(String(e)));
        },
      );
    });
  }

  /** GET a URL as JSON. Resolves with the HTTP status and the parsed body (null when it is not JSON). Rejects only when there was no answer. */
  private async get(url: string, accept: string, signal: AbortSignal | undefined): Promise<{ status: number; body: unknown }> {
    const f = this.deps.fetch;
    if (!f) throw new Error("no fetch available");
    const res = await f(url, { headers: { Accept: accept }, signal });
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    return { status: res.status, body };
  }

  private async attempt(source: SourceName, key: string, run: (signal: AbortSignal | undefined) => Promise<Attempt>, ms = this.deps.timeoutMs): Promise<Attempt> {
    if (this.blocked(source, key)) return { status: "error" };
    const t = this.deps.now();
    try {
      const r = await this.deadline(ms, run);
      this.attempts.set(r.status === "absent" ? `${source}|*` : `${source}|${key}`, { t, answered: true });
      return r;
    } catch (e) {
      // an HTTP error is an answer (leave the service alone for a while); silence is not
      this.attempts.set(`${source}|${key}`, { t, answered: e instanceof HttpError });
      return { status: "error" };
    }
  }

  private async fetchAll(key: string, lat: number, lon: number, ident: string | null): Promise<RealFetchResult> {
    const now = this.deps.now;
    const sources: SourceName[] = [];
    if (this.deps.relayUrl) sources.push("relay");
    if (nwsCovers(lat, lon)) sources.push("nws");
    sources.push("open-meteo");
    const open = sources.filter((s) => !this.blocked(s, key));
    if (!open.length) return { ok: false, answered: false, throttled: true };

    let answered = false;
    for (const source of open) {
      let r: Attempt;
      if (source === "relay") r = await this.attempt(source, key, (signal) => this.fromRelay(lat, lon, ident, signal));
      else if (source === "nws") r = await this.attempt(source, key, (signal) => this.fromNws(lat, lon, ident, signal));
      else r = await this.attempt(source, key, (signal) => this.fromOpenMeteo(lat, lon, signal));
      if (r.status !== "error") answered = true;
      if (r.status !== "ok") continue;
      const found = r.obs;

      let aloft: WindLayer[] | null = null;
      let modelWind: ModelWind | null = null;
      if (source === "open-meteo") {
        aloft = openMeteoAloft(r.extra);
        modelWind = openMeteoModelWind(r.extra);
      } else {
        // winds above the ground (and a fallback surface wind) from the model, at the station
        const aLat = found.lat ?? lat;
        const aLon = found.lon ?? lon;
        const a = await this.attempt("open-meteo", key, async (signal) => {
          const res = await this.get(openMeteoUrl(aLat, aLon, true), "application/json", signal);
          if (res.status !== 200) throw new HttpError(`Open-Meteo answered ${res.status}`);
          return { status: "ok", obs: found, extra: res.body };
        }, Math.min(this.deps.timeoutMs, 4000));
        if (a.status === "ok") {
          aloft = openMeteoAloft(a.extra);
          modelWind = openMeteoModelWind(a.extra);
        }
      }
      const data: RealWeatherData = { obs: found, aloft: aloft && aloft.length ? aloft : null, modelWind, fetchedAtMs: now() };
      this.store(key, data);
      return { ok: true, data, fromCache: false };
    }
    return { ok: false, answered, throttled: false };
  }

  private async fromRelay(lat: number, lon: number, ident: string | null, signal: AbortSignal | undefined): Promise<Attempt> {
    const params = [`lat=${lat.toFixed(1)}`, `lon=${lon.toFixed(1)}`];
    if (looksLikeIcao(ident)) params.unshift(`ids=${ident.trim().toUpperCase()}`);
    const base = this.deps.relayUrl!;
    const res = await this.get(`${base}${base.includes("?") ? "&" : "?"}${params.join("&")}`, "application/json", signal);
    if (res.status === 200) {
      const obs = relayToObservation(res.body, this.deps.now());
      // a 200 that is not our JSON (e.g. a web page served for every unknown address): there is no relay here
      if (!obs) return { status: "absent" };
      return isUsable(obs) ? { status: "ok", obs } : { status: "none" };
    }
    // our relay answers errors with JSON { error: … }; anything else means "no relay on this server"
    if (isObj(res.body) && typeof res.body.error === "string") {
      if (res.status === 404) return { status: "none" };
      throw new HttpError(`relay answered ${res.status}`);
    }
    return { status: "absent" };
  }

  private async fromNws(lat: number, lon: number, ident: string | null, signal: AbortSignal | undefined): Promise<Attempt> {
    const accept = "application/geo+json";
    const tryStation = async (id: string): Promise<Observation | null> => {
      const res = await this.get(`https://api.weather.gov/stations/${encodeURIComponent(id)}/observations/latest`, accept, signal);
      if (res.status === 404) return null;
      if (res.status !== 200) throw new HttpError(`api.weather.gov answered ${res.status}`);
      const obs = nwsToObservation(res.body, this.deps.now());
      return isUsable(obs) ? obs : null;
    };
    const tooOld = (obs: Observation) => obs.observedAtMs !== null && this.deps.now() - obs.observedAtMs > 3 * 3600_000;

    const id = looksLikeIcao(ident) ? ident.trim().toUpperCase() : null;
    if (id && /^[KPT]/.test(id)) {
      const obs = await tryStation(id);
      if (obs && !tooOld(obs)) return { status: "ok", obs };
    }
    const point = await this.get(`https://api.weather.gov/points/${Number(lat.toFixed(2))},${Number(lon.toFixed(2))}`, accept, signal);
    if (point.status === 404) return { status: "none" }; // outside the area the service covers
    if (point.status !== 200) throw new HttpError(`api.weather.gov answered ${point.status}`);
    const stationsUrl = isObj(point.body) && isObj(point.body.properties) ? str(point.body.properties.observationStations) : null;
    if (!stationsUrl || !stationsUrl.startsWith("https://api.weather.gov/")) return { status: "none" };
    const list = await this.get(`${stationsUrl}${stationsUrl.includes("?") ? "&" : "?"}limit=12`, accept, signal);
    if (list.status !== 200) throw new HttpError(`api.weather.gov answered ${list.status}`);
    const stations = nwsAirportStations(list.body).filter((s) => s !== id);
    let stale: Observation | null = null;
    for (const s of stations.slice(0, 2)) {
      const obs = await tryStation(s);
      if (obs && !tooOld(obs)) return { status: "ok", obs };
      stale ??= obs;
    }
    return stale ? { status: "ok", obs: stale } : { status: "none" };
  }

  private async fromOpenMeteo(lat: number, lon: number, signal: AbortSignal | undefined): Promise<Attempt> {
    const res = await this.get(openMeteoUrl(lat, lon, false), "application/json", signal);
    if (res.status !== 200) throw new HttpError(`Open-Meteo answered ${res.status}`);
    const obs = openMeteoToObservation(res.body);
    return isUsable(obs) ? { status: "ok", obs, extra: res.body } : { status: "none" };
  }
}

/** Distance from a position to the observation's station, nm (null when the station position is unknown). */
export function distanceToStationNm(obs: Observation, lat: number, lon: number): number | null {
  if (obs.lat === null || obs.lon === null) return null;
  return distanceNm(lat, lon, obs.lat, obs.lon);
}
