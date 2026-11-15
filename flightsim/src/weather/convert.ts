/**
 * From an observation (a parsed METAR, a National Weather Service observation or Open-Meteo model
 * data) to the simulator's `Environment`: wind layers from the ground up, cloud layers with
 * believable tops, visibility, precipitation, temperature and altimeter setting.
 *
 * Things a report does not contain are ESTIMATED here and listed in `notes` so the user interface
 * can say so: cloud tops, winds above the ground (unless model winds aloft were fetched), and the
 * true visibility when the report only says "10 miles or more".
 */
import { INHG_PER_HPA, clamp, isaTempC, norm180, norm360 } from "@/core/math";
import type { CloudCover, CloudLayer, Environment, WindLayer } from "@/core/types";
import type { ParsedMetar } from "./metar";

// ---------------------------------------------------------------- the common observation

export interface ObsCloud {
  cover: CloudCover;
  /** Height of the base above the station, ft. */
  baseFtAgl: number;
  /** Thunderstorm cloud (CB) or towering cumulus (TCU). */
  type: "CB" | "TCU" | null;
  /** The sky is hidden by fog / snow from the ground up (a METAR "VV" group). */
  obscured: boolean;
}

export interface ObsWind {
  /** Degrees true; null = variable / not given. */
  dirTrue: number | null;
  kt: number;
  /** Peak gust SPEED, kt; null = none. */
  gustKt: number | null;
  varFrom: number | null;
  varTo: number | null;
}

/** One weather observation, whatever service it came from. null = "the source did not say". */
export interface Observation {
  source: "metar" | "nws" | "open-meteo";
  stationId: string | null;
  stationName: string | null;
  lat: number | null;
  lon: number | null;
  elevFt: number | null;
  observedAtMs: number | null;
  /** Raw report text (METAR) when there is one. */
  raw: string | null;
  wind: ObsWind | null;
  visibilitySm: number | null;
  /** The source only knows "at least this far" (10SM, 9999, CAVOK …). */
  visibilityOrMore: boolean;
  clouds: ObsCloud[];
  precipitation: "none" | "rain" | "snow";
  thunderstorm: boolean;
  tempC: number | null;
  dewpointC: number | null;
  qnhInHg: number | null;
}

/** Surface wind from a weather model, used when a station did not report wind. */
export interface ModelWind {
  dirTrue: number;
  kt: number;
  /** Peak gust speed, kt. */
  gustKt: number | null;
}

const RAIN = new Set(["RA", "DZ", "GR", "GS", "UP"]);
const SNOW = new Set(["SN", "SG", "PL", "IC"]);

/** Rain / snow / none and thunderstorm from present-weather groups (already parsed). */
export function precipitationFromWeather(weather: ParsedMetar["weather"], tempC: number | null): { precipitation: Observation["precipitation"]; thunderstorm: boolean } {
  let rain = false;
  let snow = false;
  let thunderstorm = false;
  for (const w of weather) {
    if (w.descriptors.includes("TS")) thunderstorm = true;
    if (w.vicinity) continue; // in the vicinity: not falling at the airport
    if (w.descriptors.includes("DR")) continue; // low drifting snow / sand stays below eye level
    for (const p of w.phenomena) {
      if (RAIN.has(p)) rain = true;
      else if (SNOW.has(p)) snow = true;
    }
  }
  let precipitation: Observation["precipitation"] = "none";
  if (rain && snow) precipitation = tempC !== null && tempC <= 1 ? "snow" : "rain";
  else if (snow) precipitation = "snow";
  else if (rain) precipitation = "rain";
  return { precipitation, thunderstorm };
}

export interface MetarExtra {
  source?: Observation["source"];
  stationName?: string | null;
  lat?: number | null;
  lon?: number | null;
  elevFt?: number | null;
  observedAtMs?: number | null;
}

/** A parsed METAR as a common observation. Station position and elevation are not in the text: pass them in `extra`. */
export function metarToObservation(m: ParsedMetar, extra: MetarExtra = {}): Observation {
  const clouds: ObsCloud[] = [];
  for (const c of m.clouds) {
    if (c.cover === "VV") {
      // Vertical visibility: the sky is hidden; how far up one can see into the murk. Not measured → assume 100 ft.
      clouds.push({ cover: "OVC", baseFtAgl: c.baseFtAgl ?? 100, type: null, obscured: true });
    } else if (c.baseFtAgl !== null) {
      clouds.push({ cover: c.cover, baseFtAgl: c.baseFtAgl, type: c.type, obscured: false });
    }
  }
  const { precipitation, thunderstorm } = precipitationFromWeather(m.weather, m.tempC);
  let vis = m.visibilitySm;
  if (vis !== null && m.visibilityLessThan) vis *= 0.75; // "M1/4SM": less than a quarter mile
  return {
    source: extra.source ?? "metar",
    stationId: m.station,
    stationName: extra.stationName ?? null,
    lat: extra.lat ?? null,
    lon: extra.lon ?? null,
    elevFt: extra.elevFt ?? null,
    observedAtMs: extra.observedAtMs ?? null,
    raw: m.raw || null,
    wind: m.wind ? { dirTrue: m.wind.dirTrue, kt: m.wind.kt, gustKt: m.wind.gustKt, varFrom: m.wind.varFrom, varTo: m.wind.varTo } : null,
    visibilitySm: vis,
    visibilityOrMore: m.visibilityOrMore,
    clouds,
    precipitation,
    thunderstorm: thunderstorm || m.clouds.some((c) => c.type === "CB"),
    tempC: m.tempC,
    dewpointC: m.dewpointC,
    qnhInHg: m.altimeterInHg,
  };
}

// ---------------------------------------------------------------- wind layers

/**
 * How the wind grows with height through the lowest part of the atmosphere, relative to the
 * reported surface wind. That wind is measured 10 m (33 ft) above the ground, and the surface
 * layer of `Environment.wind` stands for the air at that height; `aboveFt` is the height above it.
 * Gains follow the one-seventh power law for open country, ((aboveFt + 33) / 33)^(1/7), at 100 and
 * 300 ft, then ease toward the "gradient" wind above the friction layer. `turn` is the share of
 * the total change of direction reached at that height.
 */
export const BOUNDARY_STEPS: readonly { aboveFt: number; gain: number; turn: number }[] = [
  { aboveFt: 100, gain: 1.22, turn: 0.05 },
  { aboveFt: 300, gain: 1.39, turn: 0.15 },
  { aboveFt: 1000, gain: 1.55, turn: 0.5 },
];
/** Height above the station where the estimated wind is free of ground friction, ft. */
export const GRADIENT_AGL_FT = 2000;
/** Estimated veer of the wind from the surface to the gradient level, degrees (clockwise in the northern hemisphere, anticlockwise in the southern). */
export const GRADIENT_TURN_DEG = 25;

const SYNTH_ALOFT: readonly { aglFt: number; gain: number; addKt: number; turnDeg: number }[] = [
  { aglFt: GRADIENT_AGL_FT, gain: 1.67, addKt: 2, turnDeg: GRADIENT_TURN_DEG },
  { aglFt: 5000, gain: 1.85, addKt: 5, turnDeg: 28 },
  { aglFt: 10000, gain: 2.2, addKt: 9, turnDeg: 30 },
];

export interface WindProfileInput {
  /** Reported surface wind direction, degrees true (null = variable / unknown). */
  surfaceDirTrue: number | null;
  surfaceKt: number;
  stationElevFt: number;
  /** Southern hemisphere: the wind backs (turns anticlockwise) with height instead of veering. */
  southern?: boolean;
  /** Real winds aloft (altitudes MSL), any order. Levels closer than 1,500 ft to the ground are ignored. */
  aloft?: readonly WindLayer[] | null;
  /** false = the same wind at every height above the friction layer steps (used by "calm" presets). Default true. */
  estimateAloft?: boolean;
  /** Direction to use when the surface direction is unknown and there is no wind aloft to infer it from. */
  fallbackDirTrue?: number;
}

/**
 * Wind layers for `Environment.wind`: the reported surface wind at station elevation, the
 * friction-layer steps above it, then the winds aloft (real when given, estimated otherwise).
 * Always sorted by altitude, at least one layer.
 */
export function buildWindLayers(input: WindProfileInput): WindLayer[] {
  const elev = input.stationElevFt;
  const v0 = Math.max(0, input.surfaceKt);
  const turnSign = input.southern ? -1 : 1;
  const real = (input.aloft ?? [])
    .filter((l) => Number.isFinite(l.altFtMsl + l.dirTrue + l.kt) && l.altFtMsl >= elev + 1500 && l.kt >= 0)
    .map((l) => ({ altFtMsl: l.altFtMsl, dirTrue: norm360(l.dirTrue), kt: l.kt }))
    .sort((a, b) => a.altFtMsl - b.altFtMsl);
  const lowestReal = real[0];

  let d0 = input.surfaceDirTrue;
  if (d0 === null || !Number.isFinite(d0)) d0 = lowestReal ? lowestReal.dirTrue - turnSign * GRADIENT_TURN_DEG : (input.fallbackDirTrue ?? 270);
  d0 = norm360(d0);

  const layers: WindLayer[] = [{ altFtMsl: elev, dirTrue: v0 > 0 ? d0 : 0, kt: v0 }];
  if (input.estimateAloft === false && !lowestReal) return layers;

  // the first layer above the friction layer: real if we have one, estimated otherwise
  const aloft: WindLayer[] = lowestReal
    ? real
    : SYNTH_ALOFT.map((s) => ({ altFtMsl: elev + s.aglFt, dirTrue: norm360(d0 + turnSign * s.turnDeg), kt: v0 * s.gain + s.addKt }));
  const top = aloft[0]!;
  const topAgl = top.altFtMsl - elev;
  const totalTurn = v0 > 0 ? norm180(top.dirTrue - d0) : 0;
  const cap = Math.max(v0, top.kt);
  for (const step of BOUNDARY_STEPS) {
    if (step.aboveFt > topAgl - 400) break;
    const share = lowestReal ? clamp(step.aboveFt / topAgl, 0, 1) : step.turn;
    layers.push({
      altFtMsl: elev + step.aboveFt,
      dirTrue: v0 > 0 ? norm360(d0 + totalTurn * share) : top.dirTrue,
      kt: Math.min(v0 * step.gain, cap),
    });
  }
  for (const l of aloft) layers.push({ altFtMsl: l.altFtMsl, dirTrue: l.dirTrue, kt: l.kt });
  return layers;
}

// ---------------------------------------------------------------- clouds

const COVER_RANK: Record<CloudCover, number> = { FEW: 1, SCT: 2, BKN: 3, OVC: 4 };
/** The sky module draws at most this many layers. */
export const MAX_CLOUD_LAYERS = 4;

/**
 * Believable thickness for a reported cloud layer, ft. Reports give only the base.
 * Low FEW / SCT are treated as cumulus (heaped cloud): 1,500 ft thick in dry air to 4,000 ft in
 * moist air; BKN / OVC as stratus (layer cloud): 1,000 to 3,000 ft, thickest when it rains.
 * Thunderstorm cloud (CB) and towering cumulus (TCU) are much deeper; patchy middle and high cloud is thin.
 * `spreadC` = temperature minus dew point at the ground (small = moist air).
 */
export function cloudThicknessFt(cloud: ObsCloud, spreadC: number, precipitation: Observation["precipitation"]): number {
  const moist = clamp(1 - (spreadC - 3) / 12, 0, 1); // 1 at a 3 °C spread or less … 0 at 15 °C or more
  if (cloud.obscured) return 1200;
  if (cloud.type === "CB") return 9000;
  if (cloud.type === "TCU") return 6000;
  if (cloud.cover === "FEW" || cloud.cover === "SCT") {
    if (cloud.baseFtAgl >= 8000) return 1200; // middle and high cloud in patches: thin
    if (cloud.baseFtAgl < 1500 && spreadC <= 3) return 800; // ragged low stratus in mist
    return 1500 + 2500 * moist;
  }
  if (cloud.baseFtAgl >= 15000) return 1500;
  if (precipitation !== "none") return 3000;
  return 1000 + 2000 * (0.25 + 0.6 * moist);
}

/** Cloud layers for `Environment.clouds` (bases and tops MSL), lowest first, at most four. */
export function buildCloudLayers(clouds: readonly ObsCloud[], stationElevFt: number, spreadC: number, precipitation: Observation["precipitation"]): CloudLayer[] {
  let list = clouds.filter((c) => Number.isFinite(c.baseFtAgl) && c.baseFtAgl >= 0).sort((a, b) => a.baseFtAgl - b.baseFtAgl);
  // one layer per height: keep the denser report
  list = list.filter((c, i) => {
    const prev = list[i - 1];
    return !prev || c.baseFtAgl - prev.baseFtAgl >= 100 || COVER_RANK[c.cover] > COVER_RANK[prev.cover];
  });
  while (list.length > MAX_CLOUD_LAYERS) {
    // drop the least significant layer (thinnest cover; among equals the highest)
    let drop = 0;
    for (let i = 1; i < list.length; i++) if (COVER_RANK[list[i]!.cover] <= COVER_RANK[list[drop]!.cover]) drop = i;
    list.splice(drop, 1);
  }
  const out: CloudLayer[] = [];
  for (let i = 0; i < list.length; i++) {
    const c = list[i]!;
    let thickness = cloudThicknessFt(c, spreadC, precipitation);
    const next = list[i + 1];
    if (next) thickness = Math.max(300, Math.min(thickness, next.baseFtAgl - c.baseFtAgl - 200));
    const base = stationElevFt + c.baseFtAgl;
    out.push({ cover: c.cover, baseFtMsl: Math.round(base), topFtMsl: Math.round(base + thickness) });
  }
  return out;
}

// ---------------------------------------------------------------- visibility

/** Best visibility the simulator shows, statute miles. */
export const MAX_VISIBILITY_SM = 40;

/**
 * Reports stop at "10 miles or more" (or 10 km). The real visibility on a dry day is usually far
 * better, so it is estimated from how moist the air is: the bigger the gap between temperature
 * and dew point, the clearer the air. An estimate — labelled as such in the notes.
 */
export function estimateVisibilitySm(reportedSm: number, orMore: boolean, spreadC: number, precipitation: Observation["precipitation"]): number {
  if (!orMore) return clamp(reportedSm, 0.05, MAX_VISIBILITY_SM);
  const base = Math.max(reportedSm, 7);
  if (precipitation !== "none") return base;
  return clamp(base + Math.max(0, spreadC - 2) * 2.5, base, MAX_VISIBILITY_SM);
}

// ---------------------------------------------------------------- everything together

/** The `Environment` fields the weather module writes (everything except the clock). */
export type EnvWeather = Omit<Environment, "utcMs" | "timeRunning">;

export interface WeatherBuild {
  env: EnvWeather;
  /** Half-width of the slow wander of the wind direction, degrees (variable sector / VRB / natural). */
  dirSwingDeg: number;
  /** Small natural variation of a "steady" real wind, kt. */
  naturalKt: number;
  /** 0..1: thunderstorm / towering cloud around — rough air inside cloud. */
  convective: number;
  /** Plain-language notes about what had to be estimated. */
  notes: string[];
}

export interface BuildContext {
  /** Elevation to use when the observation has none (the airport's), ft. */
  fallbackElevFt: number;
  /** Latitude, for the hemisphere (which way the wind turns with height). */
  lat: number;
  /** Real winds aloft (MSL) when they could be fetched. */
  aloft?: readonly WindLayer[] | null;
  /** Model surface wind, used only when the station reported no wind. */
  modelWind?: ModelWind | null;
  /** Surface wind direction in force before, used for a variable wind when nothing better is known. */
  previousSurfaceDirTrue?: number;
}

/** Convert an observation into the simulator's weather. */
export function buildWeather(obs: Observation, ctx: BuildContext): WeatherBuild {
  const notes: string[] = [];
  const elevFt = obs.elevFt !== null && Number.isFinite(obs.elevFt) ? obs.elevFt : ctx.fallbackElevFt;

  // ---- temperature, dew point, pressure
  let tempC = obs.tempC;
  if (tempC === null || !Number.isFinite(tempC)) {
    tempC = Math.round(isaTempC(elevFt));
    notes.push("The temperature was not reported; a standard-atmosphere value is used.");
  }
  let dewpointC = obs.dewpointC;
  if (dewpointC === null || !Number.isFinite(dewpointC)) dewpointC = tempC - 5;
  dewpointC = Math.min(dewpointC, tempC);
  const spread = tempC - dewpointC;
  let qnhInHg = obs.qnhInHg;
  if (qnhInHg === null || !Number.isFinite(qnhInHg) || qnhInHg < 25 || qnhInHg > 32.5) {
    qnhInHg = 29.92;
    notes.push("The altimeter setting was not reported; standard pressure (29.92) is used.");
  }

  // ---- surface wind
  let wind = obs.wind;
  if (!wind && ctx.modelWind) {
    wind = { dirTrue: ctx.modelWind.dirTrue, kt: ctx.modelWind.kt, gustKt: ctx.modelWind.gustKt, varFrom: null, varTo: null };
    notes.push("The station did not report wind; the surface wind comes from the Open-Meteo weather model.");
  } else if (!wind) {
    wind = { dirTrue: null, kt: 0, gustKt: null, varFrom: null, varTo: null };
    notes.push("The station did not report wind; calm is assumed.");
  }
  let dir = wind.dirTrue;
  let dirSwingDeg = 0;
  if (wind.varFrom !== null && wind.varTo !== null) {
    const width = norm360(wind.varTo - wind.varFrom);
    if (dir === null) dir = norm360(wind.varFrom + width / 2);
    dirSwingDeg = clamp(width / 2, 0, 60);
  } else if (dir === null && wind.kt > 0) {
    dirSwingDeg = 60; // "variable": light wind wandering around the compass
  }
  const hasAloft = !!ctx.aloft && ctx.aloft.some((l) => l.altFtMsl >= elevFt + 1500);
  const layers = buildWindLayers({
    surfaceDirTrue: dir,
    surfaceKt: wind.kt,
    stationElevFt: elevFt,
    southern: ctx.lat < 0,
    aloft: ctx.aloft,
    fallbackDirTrue: ctx.previousSurfaceDirTrue,
  });
  notes.push(hasAloft ? "Winds above the ground come from the Open-Meteo forecast model." : "Winds above the ground are estimated from the surface wind.");
  const gustExcess = wind.gustKt !== null && wind.gustKt > wind.kt ? wind.gustKt - wind.kt : 0;
  // a real wind is never perfectly steady: a few degrees and a knot or two of slow variation
  dirSwingDeg = Math.max(dirSwingDeg, wind.kt > 0 ? 5 : 0);

  // ---- sky, visibility, precipitation
  const clouds = buildCloudLayers(obs.clouds, elevFt, spread, obs.precipitation);
  let visibilitySm: number;
  if (obs.visibilitySm === null || !Number.isFinite(obs.visibilitySm)) {
    visibilitySm = estimateVisibilitySm(10, true, spread, obs.precipitation);
    notes.push("The visibility was not reported; it is estimated from the humidity.");
  } else {
    visibilitySm = estimateVisibilitySm(obs.visibilitySm, obs.visibilityOrMore, spread, obs.precipitation);
  }

  const convective = obs.thunderstorm ? 1 : obs.clouds.some((c) => c.type === "TCU") ? 0.5 : 0;
  const env: EnvWeather = {
    wind: layers,
    gustKt: gustExcess,
    turbulence: obs.thunderstorm ? 0.45 : convective > 0 ? 0.2 : 0,
    visibilitySm,
    clouds,
    precipitation: obs.precipitation,
    tempC,
    dewpointC,
    qnhInHg,
    stationElevFt: elevFt,
    source: obs.source,
    stationId: obs.stationId ?? undefined,
    rawReport: obs.raw ?? undefined,
    observedAtMs: obs.observedAtMs ?? undefined,
  };
  return { env, dirSwingDeg, naturalKt: Math.min(2.5, 0.12 * wind.kt), convective, notes };
}

/** Altimeter setting in inHg from hectopascals. */
export const hpaToInHg = (hpa: number) => hpa * INHG_PER_HPA;
