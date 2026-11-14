/**
 * Environment model: ISA atmosphere, wind/turbulence, and the terrain elevation function.
 * The 3D view renders terrain from the SAME `terrainElevationFt` function the flight model
 * uses for ground contact, so what you see is what you can hit.
 */
import { AIRPORTS } from "@/lib/data/airports";
import { distanceNm, norm360, toRad } from "@/lib/geo";
import type { WeatherState } from "./types";

// ---------------------------------------------------------------- atmosphere

export const G = 32.174; // ft/s²
export const RHO0 = 0.0023769; // slug/ft³

/** ISA temperature (°C) at pressure altitude. */
export function isaTempC(pressureAltFt: number): number {
  return pressureAltFt < 36089 ? 15 - 0.0019812 * pressureAltFt : -56.5;
}

export function pressureAltitude(altMslFt: number, qnhInHg: number): number {
  return altMslFt + (29.92 - qnhInHg) * 1000;
}

/** Outside air temperature (°C) at altitude given surface temperature (standard lapse). */
export function oatAt(altMslFt: number, groundElevFt: number, surfaceTempC: number): number {
  return surfaceTempC - 0.0019812 * (altMslFt - groundElevFt);
}

/** Density ratio σ = ρ/ρ0. */
export function densityRatio(pressureAltFt: number, oatC: number): number {
  const delta = Math.pow(Math.max(0.05, 1 - 6.8756e-6 * pressureAltFt), 5.2559);
  const theta = (oatC + 273.15) / 288.15;
  return delta / theta;
}

export function densityAltitude(pressureAltFt: number, oatC: number): number {
  return pressureAltFt + 120 * (oatC - isaTempC(pressureAltFt));
}

export function speedOfSoundKt(oatC: number): number {
  return 38.967854 * Math.sqrt(oatC + 273.15);
}

// ---------------------------------------------------------------- weather

export const WEATHER_PRESETS: Record<
  string,
  { label: string; description: string; weather: Omit<WeatherState, "timeOfDay"> }
> = {
  cavu: {
    label: "Clear (CAVU)",
    description: "Ceiling and visibility unlimited, light winds.",
    weather: {
      windDir: 280,
      windKt: 6,
      gustKt: 0,
      windAloftDir: 290,
      windAloftKt: 15,
      turbulence: 0,
      visibilitySm: 30,
      cloudBaseFt: null,
      cloudTopsFt: null,
      cloudCover: "CLR",
      precipitation: "none",
      tempC: 18,
      qnhInHg: 30.02,
    },
  },
  scattered: {
    label: "Scattered clouds",
    description: "VFR with scattered cumulus at 4,500 ft and a light breeze.",
    weather: {
      windDir: 300,
      windKt: 10,
      gustKt: 0,
      windAloftDir: 310,
      windAloftKt: 20,
      turbulence: 1,
      visibilitySm: 10,
      cloudBaseFt: 4500,
      cloudTopsFt: 6500,
      cloudCover: "SCT",
      precipitation: "none",
      tempC: 20,
      qnhInHg: 29.98,
    },
  },
  gusty: {
    label: "Gusty crosswind",
    description: "Strong crosswind gusting — practice crosswind technique.",
    weather: {
      windDir: 240,
      windKt: 15,
      gustKt: 24,
      windAloftDir: 250,
      windAloftKt: 30,
      turbulence: 2,
      visibilitySm: 10,
      cloudBaseFt: 5000,
      cloudTopsFt: 7000,
      cloudCover: "FEW",
      precipitation: "none",
      tempC: 16,
      qnhInHg: 29.85,
    },
  },
  mvfr: {
    label: "Marginal VFR",
    description: "Broken ceiling 2,000 ft, visibility 4 SM in haze.",
    weather: {
      windDir: 270,
      windKt: 8,
      gustKt: 0,
      windAloftDir: 280,
      windAloftKt: 18,
      turbulence: 1,
      visibilitySm: 4,
      cloudBaseFt: 2000,
      cloudTopsFt: 4500,
      cloudCover: "BKN",
      precipitation: "none",
      tempC: 14,
      qnhInHg: 29.9,
    },
  },
  ifr: {
    label: "IFR — low overcast",
    description: "Overcast 600 ft, visibility 2 SM in mist. Instrument conditions.",
    weather: {
      windDir: 290,
      windKt: 9,
      gustKt: 0,
      windAloftDir: 300,
      windAloftKt: 25,
      turbulence: 1,
      visibilitySm: 2,
      cloudBaseFt: 600,
      cloudTopsFt: 4000,
      cloudCover: "OVC",
      precipitation: "rain",
      tempC: 12,
      qnhInHg: 29.82,
    },
  },
  lifr: {
    label: "LIFR — fog",
    description: "Overcast 200 ft, visibility 1/2 SM in fog. At/below ILS minimums.",
    weather: {
      windDir: 0,
      windKt: 3,
      gustKt: 0,
      windAloftDir: 270,
      windAloftKt: 15,
      turbulence: 0,
      visibilitySm: 0.5,
      cloudBaseFt: 200,
      cloudTopsFt: 1500,
      cloudCover: "OVC",
      precipitation: "none",
      tempC: 10,
      qnhInHg: 30.05,
    },
  },
  storm: {
    label: "Rain showers & turbulence",
    description: "Moderate rain, gusty winds and moderate turbulence.",
    weather: {
      windDir: 200,
      windKt: 14,
      gustKt: 26,
      windAloftDir: 220,
      windAloftKt: 35,
      turbulence: 3,
      visibilitySm: 3,
      cloudBaseFt: 1500,
      cloudTopsFt: 20000,
      cloudCover: "BKN",
      precipitation: "rain",
      tempC: 15,
      qnhInHg: 29.62,
    },
  },
  hot: {
    label: "Hot & high",
    description: "34°C and calm — high density altitude reduces performance.",
    weather: {
      windDir: 210,
      windKt: 4,
      gustKt: 0,
      windAloftDir: 230,
      windAloftKt: 12,
      turbulence: 1,
      visibilitySm: 25,
      cloudBaseFt: null,
      cloudTopsFt: null,
      cloudCover: "CLR",
      precipitation: "none",
      tempC: 34,
      qnhInHg: 29.88,
    },
  },
};

/** Wind (from-direction true, speed) at a given height AGL; veers and strengthens with height. */
export function windAt(w: WeatherState, aglFt: number): { dir: number; kt: number } {
  const t = Math.min(1, Math.max(0, aglFt / 6000));
  // Surface friction: wind near the ground is reduced and backed.
  const dir = norm360(w.windDir + t * (((w.windAloftDir - w.windDir + 540) % 360) - 180));
  const kt = w.windKt + (w.windAloftKt - w.windKt) * t;
  return { dir, kt };
}

// Deterministic smooth noise for gusts and turbulence.
function hash(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}
export function smoothNoise(t: number, seed = 0): number {
  const i = Math.floor(t);
  const f = t - i;
  const a = hash(i + seed * 101.3);
  const b = hash(i + 1 + seed * 101.3);
  const u = f * f * (3 - 2 * f);
  return (a + (b - a) * u) * 2 - 1;
}

// ---------------------------------------------------------------- terrain

function valueNoise2(x: number, y: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const h = (a: number, b: number) => {
    const s = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453;
    return s - Math.floor(s);
  };
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = h(xi, yi);
  const b = h(xi + 1, yi);
  const c = h(xi, yi + 1);
  const d = h(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/**
 * Terrain elevation (ft MSL). Smoothly blends nearby airport elevations, then adds
 * procedural hills that fade to zero within ~3 nm of every airport so approaches are clear.
 * This is a synthetic training terrain, not real-world topography.
 */
export function terrainElevationFt(lat: number, lon: number): number {
  let wsum = 0;
  let esum = 0;
  let nearest = Infinity;
  for (const a of AIRPORTS) {
    if (Math.abs(a.lat - lat) > 1.2 || Math.abs(a.lon - lon) > 1.5) continue;
    const d = distanceNm(lat, lon, a.lat, a.lon);
    nearest = Math.min(nearest, d);
    const w = 1 / Math.pow(Math.max(d, 0.5), 2);
    wsum += w;
    esum += w * a.elevationFt;
  }
  const base = wsum > 0 ? esum / wsum : 0;
  // Hills: scale in nm; amplitude grows away from airports.
  const nx = (lon * 60 * Math.cos(toRad(lat))) / 6;
  const ny = (lat * 60) / 6;
  const n = valueNoise2(nx, ny) * 0.65 + valueNoise2(nx * 2.3, ny * 2.3) * 0.35;
  const ridge = Math.max(0, n - 0.45) / 0.55; // only the upper part of the noise forms hills
  const fade = nearest === Infinity ? 1 : Math.min(1, Math.max(0, (nearest - 3) / 5));
  return base + ridge * ridge * 2200 * fade;
}
