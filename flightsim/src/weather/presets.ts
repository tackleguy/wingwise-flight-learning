/**
 * Ready-made weather situations. Each one is written relative to the airport and runway in use:
 * wind directions are relative to the runway heading (so "crosswind 10 kt" really is a 10 kt
 * crosswind on whatever runway the student uses), cloud heights are above the airport, and the
 * temperature is given as a difference from the standard atmosphere at the airport's elevation
 * (so "cold" is cold at a mountain airport and at a sea-level airport alike).
 */
import { clamp, isaTempC, norm360 } from "@/core/math";
import type { CloudCover, CloudLayer } from "@/core/types";
import type { WeatherPreset } from "./api";
import { buildWindLayers, type EnvWeather } from "./convert";

export interface PresetDef extends WeatherPreset {
  /** Wind direction relative to the runway heading, degrees: 0 = straight down the runway (a pure headwind), −90 = straight across from the left, +90 = from the right. */
  windRelDeg: number;
  /** Mean surface wind, kt. */
  windKt: number;
  /** How far gust peaks rise above the mean wind, kt (0 = steady). */
  gustKt: number;
  turbulence: number;
  visibilitySm: number;
  clouds: { cover: CloudCover; baseFtAgl: number; topFtAgl: number }[];
  precipitation: "none" | "rain" | "snow";
  /** Temperature at the airport relative to the standard atmosphere there, °C. */
  isaDevC: number;
  /** Temperature minus dew point, °C. */
  spreadC: number;
  qnhInHg: number;
  /** Estimate stronger, veered winds above the ground (false: no wind at any height). */
  windsAloft: boolean;
  /** 0..1 strength of the rising and sinking air under the cumulus clouds, whatever the time of day: 0 = smooth air (most presets), 1 = the "thermals" preset. */
  thermals: number;
}

export const PRESETS: readonly PresetDef[] = [
  {
    id: "calm-clear",
    name: "Calm and clear",
    description: "No wind, no cloud, standard pressure (29.92). The easiest weather there is — start here.",
    windRelDeg: 0,
    windKt: 0,
    gustKt: 0,
    turbulence: 0,
    visibilitySm: 30,
    clouds: [],
    precipitation: "none",
    isaDevC: 0,
    spreadC: 8,
    qnhInHg: 29.92,
    windsAloft: false,
    thermals: 0,
  },
  {
    id: "light-breeze",
    name: "Light breeze, a few clouds",
    description: "A gentle 6-knot wind almost straight down the runway and a few fair-weather clouds at 4,500 ft. A typical pleasant training day.",
    windRelDeg: -20,
    windKt: 6,
    gustKt: 0,
    turbulence: 0,
    visibilitySm: 25,
    clouds: [{ cover: "FEW", baseFtAgl: 4500, topFtAgl: 6500 }],
    precipitation: "none",
    isaDevC: 3,
    spreadC: 10,
    qnhInHg: 30.02,
    windsAloft: true,
    thermals: 0,
  },
  {
    id: "crosswind-10",
    name: "Steady crosswind 10 kt",
    description: "A steady 10-knot wind blowing straight across the runway from the left, no gusts. For practising crosswind take-offs and landings; it is within the 15 knots this aircraft has been demonstrated in.",
    windRelDeg: -90,
    windKt: 10,
    gustKt: 0,
    turbulence: 0,
    visibilitySm: 20,
    clouds: [{ cover: "FEW", baseFtAgl: 5000, topFtAgl: 7000 }],
    precipitation: "none",
    isaDevC: 2,
    spreadC: 9,
    qnhInHg: 30.0,
    windsAloft: true,
    thermals: 0,
  },
  {
    id: "gusty-crosswind",
    name: "Gusty crosswind 15 gusting 25",
    description:
      "A 15-knot wind straight across the runway from the right — the most this aircraft has been demonstrated in — with gusts to 25, which is beyond it. Very demanding: good for practising go-arounds and for seeing why a pilot waits for better weather.",
    windRelDeg: 90,
    windKt: 15,
    gustKt: 10,
    turbulence: 0.15,
    visibilitySm: 15,
    clouds: [{ cover: "SCT", baseFtAgl: 4500, topFtAgl: 7500 }],
    precipitation: "none",
    isaDevC: 4,
    spreadC: 9,
    qnhInHg: 29.8,
    windsAloft: true,
    thermals: 0,
  },
  {
    id: "mvfr-haze",
    name: "Marginal VFR - haze and low scattered cloud",
    description: "Hazy, 4 miles visibility and scattered cloud 1,500 ft above the airport. Still legal for visual flying in most places, but the horizon is vague and other aircraft are hard to see — this is what \"marginal VFR\" means.",
    windRelDeg: -30,
    windKt: 5,
    gustKt: 0,
    turbulence: 0,
    visibilitySm: 4,
    clouds: [{ cover: "SCT", baseFtAgl: 1500, topFtAgl: 2600 }],
    precipitation: "none",
    isaDevC: 6,
    spreadC: 3,
    qnhInHg: 29.95,
    windsAloft: true,
    thermals: 0,
  },
  {
    id: "overcast-rain",
    name: "Overcast 1500 ft, light rain",
    description: "A solid cloud layer 1,500 ft above the airport, light rain and 5 miles visibility. You can just fly the traffic pattern underneath it — a lesson in how little room low cloud leaves.",
    windRelDeg: 20,
    windKt: 8,
    gustKt: 0,
    turbulence: 0.05,
    visibilitySm: 5,
    clouds: [{ cover: "OVC", baseFtAgl: 1500, topFtAgl: 4500 }],
    precipitation: "rain",
    isaDevC: -4,
    spreadC: 1.5,
    qnhInHg: 29.62,
    windsAloft: true,
    thermals: 0,
  },
  {
    id: "lifr-fog",
    name: "Low IFR - fog 1/2 mile, overcast 300 ft",
    description:
      "Fog: half a mile visibility and solid cloud 300 ft above the ground. This is far beyond a student pilot's privileges (and below the limits of most instrument approaches) — it is here so you can see for yourself why nobody flies visually in it.",
    windRelDeg: 0,
    windKt: 3,
    gustKt: 0,
    turbulence: 0,
    visibilitySm: 0.5,
    clouds: [{ cover: "OVC", baseFtAgl: 300, topFtAgl: 1500 }],
    precipitation: "none",
    isaDevC: -6,
    spreadC: 0,
    qnhInHg: 30.12,
    windsAloft: true,
    thermals: 0,
  },
  {
    id: "thermals",
    name: "Turbulent afternoon thermals",
    description: "A hot summer afternoon: air rises under the puffy cumulus clouds and sinks between them, so the ride is bumpy and the altitude wanders. Practise holding a steady attitude instead of chasing the needles.",
    windRelDeg: -30,
    windKt: 8,
    gustKt: 5,
    turbulence: 0.35,
    visibilitySm: 25,
    clouds: [{ cover: "SCT", baseFtAgl: 4500, topFtAgl: 8000 }],
    precipitation: "none",
    isaDevC: 12,
    spreadC: 12,
    qnhInHg: 29.9,
    windsAloft: true,
    thermals: 1,
  },
  {
    id: "winter-high",
    name: "Winter day - cold, high pressure",
    description:
      "Cold, dense air under high pressure (altimeter 30.50). The engine and wings work better than on a standard day, so the aircraft takes off shorter and climbs faster. In very cold air an altimeter reads a little higher than the aircraft really is.",
    windRelDeg: -20,
    windKt: 5,
    gustKt: 0,
    turbulence: 0,
    visibilitySm: 35,
    clouds: [],
    precipitation: "none",
    isaDevC: -20,
    spreadC: 6,
    qnhInHg: 30.5,
    windsAloft: true,
    thermals: 0,
  },
  {
    id: "hot-high",
    name: "Hot and high",
    description:
      "A very hot day with low pressure: thin air. Expect a much longer take-off roll and a weak climb — worse the higher the airport is (this is \"density altitude\"). Try it at a mountain airport to feel the full effect.",
    windRelDeg: -20,
    windKt: 6,
    gustKt: 0,
    turbulence: 0.1,
    visibilitySm: 30,
    clouds: [{ cover: "FEW", baseFtAgl: 8000, topFtAgl: 10000 }],
    precipitation: "none",
    isaDevC: 22,
    spreadC: 22,
    qnhInHg: 29.72,
    windsAloft: true,
    thermals: 0,
  },
  {
    id: "headwind-20",
    name: "Strong headwind 20 kt",
    description: "A strong, steady wind straight down the runway. On final the ground goes by slowly and the approach looks steep; the wind fades in the last few hundred feet (the wind gradient), so watch the airspeed.",
    windRelDeg: 0,
    windKt: 20,
    gustKt: 0,
    turbulence: 0.05,
    visibilitySm: 20,
    clouds: [{ cover: "SCT", baseFtAgl: 5000, topFtAgl: 7500 }],
    precipitation: "none",
    isaDevC: 0,
    spreadC: 8,
    qnhInHg: 29.85,
    windsAloft: true,
    thermals: 0,
  },
];

export function findPreset(id: string): PresetDef | undefined {
  return PRESETS.find((p) => p.id === id);
}

/** Where a preset is "hung": the runway it is turned to and the airport it sits on. */
export interface PresetAnchor {
  /** True heading of the runway in use (or of the aircraft when no runway is known). */
  headingTrue: number;
  /** Airport elevation, ft. */
  elevFt: number;
  /** Latitude (for the hemisphere: which way the wind turns with height). */
  lat: number;
}

/** The weather of a preset at a given airport and runway. */
export function presetWeather(def: PresetDef, anchor: PresetAnchor): EnvWeather {
  const elev = anchor.elevFt;
  const tempC = clamp(Math.round(isaTempC(elev) + def.isaDevC), -50, 45);
  const clouds: CloudLayer[] = def.clouds.map((c) => ({ cover: c.cover, baseFtMsl: Math.round(elev + c.baseFtAgl), topFtMsl: Math.round(elev + c.topFtAgl) }));
  return {
    wind: buildWindLayers({
      surfaceDirTrue: norm360(anchor.headingTrue + def.windRelDeg),
      surfaceKt: def.windKt,
      stationElevFt: elev,
      southern: anchor.lat < 0,
      estimateAloft: def.windsAloft,
    }),
    gustKt: def.gustKt,
    turbulence: def.turbulence,
    visibilitySm: def.visibilitySm,
    clouds,
    precipitation: def.precipitation,
    tempC,
    dewpointC: tempC - def.spreadC,
    qnhInHg: def.qnhInHg,
    stationElevFt: elev,
    source: "preset",
    stationId: undefined,
    rawReport: undefined,
    observedAtMs: undefined,
  };
}
