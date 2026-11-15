/**
 * The numbers behind the sky: how visibility becomes haze, what colour the light is at each sun
 * height, how dark the ground gets at night, how hard it is raining, and the geometry the cloud
 * shader uses. Everything here is plain arithmetic (no graphics library) so it can be unit-tested,
 * and the GLSL in `shaders.ts` follows the same formulas.
 */
import { CLOUD_NOISE_SIZE, CLOUD_SCALE_1_M, CLOUD_SCALE_2_M, COVER_FRACTION, COVER_THRESHOLD, cloudFieldXY } from "@/core/clouds";
import { clamp, lerp } from "@/core/math";
import type { CloudCover, Environment } from "@/core/types";

export const M_PER_SM = 1609.344;
export const M_PER_FT = 0.3048;

// ---------------------------------------------------------------- visibility → haze

/**
 * Koschmieder's law: an object is "just visible" when its contrast against the horizon sky has
 * dropped to about 5 %. Contrast falls as exp(−β·distance), so β = −ln(0.05) / visibility ≈ 3.0 / visibility.
 */
export const KOSCHMIEDER = 2.996;

/** Visibility range the renderer accepts, statute miles. */
export const MIN_VIS_SM = 0.03;
export const MAX_VIS_SM = 120;

/** Haze extinction coefficient at the surface, per metre, for a reported visibility in statute miles. */
export function extinctionPerM(visSm: number): number {
  return KOSCHMIEDER / (clamp(visSm, MIN_VIS_SM, MAX_VIS_SM) * M_PER_SM);
}

/** Fraction of an object's contrast that survives `distanceM` of surface-level haze. */
export function contrastAt(visSm: number, distanceM: number): number {
  return Math.exp(-extinctionPerM(visSm) * distanceM);
}

const interp = (table: readonly (readonly [number, number])[], x: number): number => {
  const first = table[0]!;
  if (x <= first[0]) return first[1];
  for (let i = 1; i < table.length; i++) {
    const a = table[i - 1]!;
    const b = table[i]!;
    if (x <= b[0]) return lerp(a[1], b[1], (x - a[0]) / (b[0] - a[0]));
  }
  return table[table.length - 1]![1];
};

/** [log10(visibility sm), haze scale height m] */
const SCALE_HEIGHT: readonly (readonly [number, number])[] = [
  [Math.log10(0.125), 45],
  [Math.log10(0.25), 55],
  [Math.log10(0.5), 75],
  [Math.log10(1), 130],
  [Math.log10(2), 330],
  [Math.log10(3), 550],
  [Math.log10(5), 850],
  [Math.log10(10), 1250],
  [Math.log10(30), 1600],
  [Math.log10(100), 2000],
];

/**
 * How deep the haze layer is. Haze thins out with height as exp(−height / scaleHeight):
 * fog (below 1 mile) is a shallow dense layer you can climb out of in a few hundred feet;
 * ordinary haze reaches several thousand feet. ESTIMATED typical values — real haze layers vary.
 */
export function hazeScaleHeightM(visSm: number): number {
  return interp(SCALE_HEIGHT, Math.log10(clamp(visSm, MIN_VIS_SM, MAX_VIS_SM)));
}

/** [log10(visibility sm), depth m] */
const FOG_DEPTH: readonly (readonly [number, number])[] = [
  [Math.log10(0.125), 120],
  [Math.log10(0.25), 110],
  [Math.log10(0.5), 90],
  [Math.log10(1), 60],
  [Math.log10(2), 20],
  [Math.log10(3), 0],
];

/**
 * Depth of the layer next to the ground in which the haze has its full strength (it thins out with
 * the scale height above that). Zero for ordinary haze; fog and mist are an even layer a few
 * hundred feet deep that you climb out of. ESTIMATED typical values.
 */
export function fogDepthM(visSm: number): number {
  return interp(FOG_DEPTH, Math.log10(clamp(visSm, MIN_VIS_SM, MAX_VIS_SM)));
}

/**
 * Even on the clearest day distant things turn pale and the horizon is whitish: "clean air" haze.
 * It is always there, thins out slowly with height, and counts toward the reported visibility at
 * ground level (the weather haze is reduced by this amount, so the total still matches the number).
 */
export const CLEAN_AIR_VIS_SM = 120;
export const CLEAN_AIR_SCALE_HEIGHT_M = 3000;
export const cleanAirExtinctionPerM = KOSCHMIEDER / (CLEAN_AIR_VIS_SM * M_PER_SM);

/** Extinction of the weather haze alone at ground level, per metre (total minus clean-air haze). */
export function weatherExtinctionPerM(visSm: number): number {
  return Math.max(0, extinctionPerM(visSm) - cleanAirExtinctionPerM);
}

/**
 * Total haze optical depth along a straight sight line of `distM` metres from a camera `camAglM`
 * above the ground to a point `endAglM` above the ground, for a visibility — what the renderer draws.
 */
export function totalHazeOpticalDepth(visSm: number, distM: number, camAglM: number, endAglM: number): number {
  const scaleH = hazeScaleHeightM(visSm);
  const depth = fogDepthM(visSm);
  const weather = hazeOpticalDepth(weatherExtinctionPerM(visSm), distM, (camAglM - depth) / scaleH, (endAglM - depth) / scaleH);
  const clean = hazeOpticalDepth(cleanAirExtinctionPerM, distM, camAglM / CLEAN_AIR_SCALE_HEIGHT_M, endAglM / CLEAN_AIR_SCALE_HEIGHT_M);
  return weather + clean;
}

/**
 * Relative haze density at `x` scale heights above the reference level:
 * 1 at and below the reference, exp(−x) above it.
 */
export const hazeProfile = (x: number) => (x <= 0 ? 1 : Math.exp(-x));
const profileIntegral = (x: number) => (x <= 0 ? x : 1 - Math.exp(-Math.min(x, 80)));

/**
 * Optical depth of haze along a straight sight line of length `distM` that starts `a` scale
 * heights above the haze reference level and ends `b` scale heights above it. (Mirrors `hazeTau` in the shader.)
 */
export function hazeOpticalDepth(beta: number, distM: number, a: number, b: number): number {
  const d = b - a;
  const avg = Math.abs(d) < 1e-4 ? hazeProfile(a) : (profileIntegral(b) - profileIntegral(a)) / d;
  return beta * distM * avg;
}

/**
 * Optical depth of haze along a sight line that leaves to space (a "sky" pixel), allowing for the
 * earth's curvature. `dz` is the sine of the line's elevation angle, `a` the start height in scale heights.
 * Closed-form approximation of the Chapman grazing-incidence function (within about 6 % for dz ≥ 0).
 */
export function hazeOpticalDepthToSpace(beta: number, scaleHeightM: number, a: number, dz: number, earthRadiusM = 6371000): number {
  const kc = (1 - dz * dz) / (2 * earthRadiusM);
  return (beta * hazeProfile(a) * 2 * scaleHeightM) / (dz + Math.sqrt(dz * dz + (16 * kc * scaleHeightM) / Math.PI));
}

/**
 * How far away terrain may be dropped because haze hides it completely (less than about 0.2 %
 * of its contrast left) — even a mountain three scale heights taller than the camera.
 * `a` = camera height above the haze reference level, in scale heights.
 */
export function hazeCullDistanceM(visSm: number, a: number): number {
  const beta = Math.max(weatherExtinctionPerM(visSm), 1e-9);
  const worstCaseAverage = (hazeProfile(Math.max(a, 0)) * (1 - Math.exp(-3))) / 3;
  return clamp(6.5 / (beta * worstCaseAverage), 3000, 2.0e6);
}

// ---------------------------------------------------------------- precipitation

/**
 * `Environment` has no rain rate, so the amount drawn follows the visibility, the way observers
 * grade it: light rain rarely cuts visibility below about 7 miles, heavy rain brings it under 2;
 * snow is graded light / moderate / heavy by visibility alone. 0 = none … 1 = heavy.
 */
export function precipIntensity(kind: Environment["precipitation"], visSm: number): number {
  if (kind === "rain") return clamp(1 - 0.65 * ((clamp(visSm, 1, 7) - 1) / 6), 0.35, 1);
  if (kind === "snow") return clamp(1 - 0.65 * ((clamp(visSm, 0.5, 3) - 0.5) / 2.5), 0.35, 1);
  return 0;
}

/** Visibility that is drawn: the reported value, but never better than rain (7 sm) or snow (3 sm) allow. */
export function drawnVisibilitySm(env: Pick<Environment, "visibilitySm" | "precipitation">): number {
  let v = Number.isFinite(env.visibilitySm) ? env.visibilitySm : 10;
  if (env.precipitation === "rain") v = Math.min(v, 7);
  else if (env.precipitation === "snow") v = Math.min(v, 3);
  return clamp(v, MIN_VIS_SM, MAX_VIS_SM);
}

// ---------------------------------------------------------------- light and colour by sun height

export type Rgb = [number, number, number];

type ColourKey = readonly [number, number, number, number]; // sun elevation°, r, g, b

function colourAt(keys: readonly ColourKey[], el: number, out: Rgb): Rgb {
  const first = keys[0]!;
  if (el <= first[0]) {
    out[0] = first[1];
    out[1] = first[2];
    out[2] = first[3];
    return out;
  }
  for (let i = 1; i < keys.length; i++) {
    const a = keys[i - 1]!;
    const b = keys[i]!;
    if (el <= b[0]) {
      const t = (el - a[0]) / (b[0] - a[0]);
      out[0] = lerp(a[1], b[1], t);
      out[1] = lerp(a[2], b[2], t);
      out[2] = lerp(a[3], b[3], t);
      return out;
    }
  }
  const last = keys[keys.length - 1]!;
  out[0] = last[1];
  out[1] = last[2];
  out[2] = last[3];
  return out;
}

/** Colour of distant haze / the horizon in clear-ish air (display colour, 0..1). */
const HAZE_CLEAR: readonly ColourKey[] = [
  [-18, 0.012, 0.016, 0.03],
  [-12, 0.022, 0.03, 0.055],
  [-6, 0.13, 0.15, 0.24],
  [-3, 0.36, 0.33, 0.4],
  [0, 0.7, 0.53, 0.44],
  [3, 0.84, 0.7, 0.58],
  [8, 0.82, 0.81, 0.8],
  [20, 0.78, 0.85, 0.93],
  [90, 0.76, 0.85, 0.95],
];

/** Colour of thick haze, mist and fog (neutral grey-white by day). */
const HAZE_FOG: readonly ColourKey[] = [
  [-18, 0.014, 0.017, 0.026],
  [-12, 0.024, 0.028, 0.042],
  [-6, 0.13, 0.14, 0.19],
  [-3, 0.33, 0.32, 0.36],
  [0, 0.6, 0.53, 0.5],
  [3, 0.74, 0.69, 0.65],
  [8, 0.8, 0.8, 0.8],
  [90, 0.84, 0.86, 0.88],
];

/** Direct sunlight on clouds (0 once the sun is well below the horizon). */
const SUN_LIGHT: readonly ColourKey[] = [
  [-5, 0, 0, 0],
  [-2.5, 0.3, 0.1, 0.06],
  [0, 0.8, 0.38, 0.2],
  [3, 0.95, 0.62, 0.38],
  [8, 0.98, 0.84, 0.66],
  [18, 1.0, 0.96, 0.9],
  [90, 1.0, 0.98, 0.95],
];

/** Skylight on clouds (what shaded cloud looks like). Night keeps a faint moonlit / starlit blue-grey. */
const SKY_LIGHT: readonly ColourKey[] = [
  [-18, 0.02, 0.024, 0.036],
  [-12, 0.03, 0.036, 0.055],
  [-6, 0.11, 0.12, 0.19],
  [-3, 0.24, 0.23, 0.32],
  [0, 0.4, 0.37, 0.42],
  [5, 0.52, 0.53, 0.6],
  [15, 0.6, 0.66, 0.76],
  [90, 0.62, 0.69, 0.8],
];

/** Tint applied to the ground and everything on it (warm at low sun, cool blue in twilight). */
const SCENE_TINT: readonly ColourKey[] = [
  [-12, 0.72, 0.82, 1.0],
  [-6, 0.78, 0.84, 1.0],
  [-2, 0.96, 0.9, 0.94],
  [1, 1.0, 0.9, 0.8],
  [6, 1.0, 0.96, 0.9],
  [14, 1.0, 1.0, 1.0],
  [90, 1.0, 1.0, 1.0],
];

export interface SkyPalette {
  haze: Rgb;
  sun: Rgb;
  ambient: Rgb;
  sceneTint: Rgb;
}

export const newPalette = (): SkyPalette => ({ haze: [0, 0, 0], sun: [0, 0, 0], ambient: [0, 0, 0], sceneTint: [1, 1, 1] });

const scratchA: Rgb = [0, 0, 0];
const scratchB: Rgb = [0, 0, 0];

/**
 * Colours for a sun elevation (degrees), visibility and overcast amount (0..1 above the camera).
 * Thick haze is greyer than thin haze; an overcast removes the direct sun and greys everything.
 */
export function skyPalette(sunElevationDeg: number, visSm: number, overcast: number, out: SkyPalette): SkyPalette {
  const el = sunElevationDeg;
  const clearness = clamp((Math.log10(clamp(visSm, 0.5, 12)) - Math.log10(1.0)) / (Math.log10(12) - Math.log10(1.0)), 0, 1);
  colourAt(HAZE_CLEAR, el, scratchA);
  colourAt(HAZE_FOG, el, scratchB);
  const grey = 1 - 0.28 * overcast;
  for (let i = 0; i < 3; i++) {
    const fog = scratchB[i as 0 | 1 | 2];
    const clear = lerp(scratchA[i as 0 | 1 | 2], fog, 0.45 * overcast);
    out.haze[i as 0 | 1 | 2] = lerp(fog, clear, clearness) * grey;
  }
  colourAt(SUN_LIGHT, el, out.sun);
  colourAt(SKY_LIGHT, el, out.ambient);
  colourAt(SCENE_TINT, el, out.sceneTint);
  return out;
}

/** [sun elevation°, ground brightness 0..1] — how bright the ground looks compared with full day. */
const GROUND_BRIGHTNESS: readonly (readonly [number, number])[] = [
  [-18, 0.035],
  [-12, 0.045],
  [-9, 0.07],
  [-6, 0.16],
  [-3, 0.45],
  [0, 0.8],
  [5, 0.95],
  [10, 1],
];

/**
 * Target brightness of the ground for a sun elevation: full until the sun is low, still fairly
 * bright at sunset, falling through civil twilight (sun 0° to −6°) to a faint moonlit / starlit
 * floor — dark, but terrain is still just visible. A look tuned for training, not a photometric model.
 */
export function groundBrightness(sunElevationDeg: number): number {
  return interp(GROUND_BRIGHTNESS, sunElevationDeg);
}

export interface NightSettings {
  /** `scene.light.intensity` (2 = CesiumJS's normal sun). Below 1 it also darkens the globe. */
  lightIntensity: number;
  /** `nightAlpha` of the city-lights imagery layer. */
  nightAlpha: number;
  /** `brightness` of the city-lights imagery layer. */
  lightsBrightness: number;
}

/** How strongly city lights glow on the ground at full night (0..1 of full white). */
export const CITY_LIGHT_GAIN = 0.42;

/**
 * Settings that make CesiumJS draw the ground at `groundBrightness` and fade the city lights in at dusk.
 *
 * CesiumJS draws ground = light × ((1 − α)·day picture + α·lights picture × brightness), where
 * α = nightAlpha × nightBlend and nightBlend goes 0 → 1 as the sun sinks from 11.5° to the horizon.
 */
export function nightSettings(sunElevationDeg: number, out: NightSettings): NightSettings {
  const b = groundBrightness(sunElevationDeg);
  const nightBlend = 1 - clamp(5 * Math.sin((sunElevationDeg * Math.PI) / 180), 0, 1);
  const light = Math.min(1, 2 * b); // what the globe is multiplied by
  const alpha = clamp(1 - b / light, 0, 0.5);
  const lightsOn = clamp((2 - sunElevationDeg) / 8, 0, 1); // lights come on between sun +2° and −6°
  out.lightIntensity = clamp(2 * b, 0.07, 2);
  out.nightAlpha = nightBlend > 1e-3 ? clamp(alpha / nightBlend, 0, 1) : 0;
  const a = out.nightAlpha * nightBlend;
  out.lightsBrightness = a > 1e-3 ? clamp((CITY_LIGHT_GAIN * lightsOn * lightsOn) / (a * light), 0.02, 60) : 0.02;
  return out;
}

// ---------------------------------------------------------------- cloud layers

/** Shape threshold used for an overcast: below every possible shape value, so the layer is solid. */
export const OVC_THRESHOLD = -0.3;

export const coverThreshold = (cover: CloudCover) => (cover === "OVC" ? OVC_THRESHOLD : COVER_THRESHOLD[cover]);
export const coverFraction = (cover: CloudCover) => COVER_FRACTION[cover];

/** How much a layer of this cover blocks the sun for the ground beneath it (0..1). */
export const coverShade = (cover: CloudCover) => (cover === "OVC" ? 1 : cover === "BKN" ? 0.6 : cover === "SCT" ? 0.15 : 0);

// ---------------------------------------------------------------- cloud-field geometry for the shader

const WGS84_A = 6378137;
const WGS84_E2 = 6.69437999014e-3;

export interface FieldMapping {
  /** Field coordinates of the origin (camera) — metres, as `cloudFieldXY` gives them. */
  x0: number;
  y0: number;
  /**
   * With e, n = metres east / north of the origin along the ground:
   *   fieldX − x0 ≈ xe·e + xn·n + xee·e² + xen·e·n + xnn·n²
   *   fieldY − y0 ≈ ye·e + yn·n + yee·e² + yen·e·n + ynn·n²
   */
  xe: number;
  xn: number;
  ye: number;
  yn: number;
  xee: number;
  xen: number;
  xnn: number;
  yee: number;
  yen: number;
  ynn: number;
}

export const newFieldMapping = (): FieldMapping => ({ x0: 0, y0: 0, xe: 1, xn: 0, ye: 0, yn: 1, xee: 0, xen: 0, xnn: 0, yee: 0, yen: 0, ynn: 0 });

/** Just the origin of the mapping (cheap; call every frame). */
export function fieldOrigin(latDeg: number, lonDeg: number, out: FieldMapping): FieldMapping {
  const f = cloudFieldXY(latDeg, lonDeg);
  out.x0 = f.x;
  out.y0 = f.y;
  return out;
}

/**
 * The shader works in metres east / north of the camera. This gives it `cloudFieldXY` (the shared
 * cloud layout of `core/clouds.ts`) as a second-order expansion around the camera position, so the
 * drawn clouds sit where the flight side says they are (well under a metre within 20 km, a few
 * metres at 50 km, tens of metres at 100 km).
 *
 * The slopes of `cloudFieldXY` are measured numerically, so this keeps working if the core team
 * ever changes how the cloud layout is laid over the globe.
 */
export function fieldMapping(latDeg: number, lonDeg: number, out: FieldMapping): FieldMapping {
  fieldOrigin(latDeg, lonDeg, out);
  const la = clamp(latDeg, -85, 85);
  const lo = clamp(lonDeg, -179.9, 179.9);
  const h = 0.01; // degrees
  const k = 1 / ((h * Math.PI) / 180); // per radian
  const c0 = cloudFieldXY(la, lo);
  const pN = cloudFieldXY(la + h, lo);
  const mN = cloudFieldXY(la - h, lo);
  const pE = cloudFieldXY(la, lo + h);
  const mE = cloudFieldXY(la, lo - h);
  const pp = cloudFieldXY(la + h, lo + h);
  const pm = cloudFieldXY(la + h, lo - h);
  const mp = cloudFieldXY(la - h, lo + h);
  const mm = cloudFieldXY(la - h, lo - h);

  const lat = (la * Math.PI) / 180;
  const s = Math.sin(lat);
  const c = Math.cos(lat);
  const w = 1 - WGS84_E2 * s * s;
  const n = WGS84_A / Math.sqrt(w); // radius of curvature east–west
  const m = (WGS84_A * (1 - WGS84_E2)) / (w * Math.sqrt(w)); // radius of curvature north–south
  const tan = s / c;
  // metres east/north → latitude / longitude (radians), to second order:
  //   dLat = n/M − e²·tan/(2·M·N)        dLon = e/(N·cos) · (1 + n·tan/M)
  const quad = (f0: number, fN: number, fS: number, fE: number, fW: number, fNE: number, fNW: number, fSE: number, fSW: number) => {
    const dLat = ((fN - fS) * k) / 2;
    const dLon = ((fE - fW) * k) / 2;
    const dLatLat = (fN - 2 * f0 + fS) * k * k;
    const dLonLon = (fE - 2 * f0 + fW) * k * k;
    const dLatLon = ((fNE - fNW - fSE + fSW) * k * k) / 4;
    return {
      e: dLon / (n * c),
      n: dLat / m,
      ee: (-dLat * tan) / (2 * m * n) + (0.5 * dLonLon) / (n * c * (n * c)),
      en: (dLon * tan) / (n * m * c) + dLatLon / (m * n * c),
      nn: (0.5 * dLatLat) / (m * m),
    };
  };
  const qx = quad(c0.x, pN.x, mN.x, pE.x, mE.x, pp.x, pm.x, mp.x, mm.x);
  const qy = quad(c0.y, pN.y, mN.y, pE.y, mE.y, pp.y, pm.y, mp.y, mm.y);
  out.xe = qx.e;
  out.xn = qx.n;
  out.xee = qx.ee;
  out.xen = qx.en;
  out.xnn = qx.nn;
  out.ye = qy.e;
  out.yn = qy.n;
  out.yee = qy.ee;
  out.yen = qy.en;
  out.ynn = qy.nn;
  return out;
}

/** Field coordinates of a point `e` metres east and `n` metres north of the mapping's origin. */
export function fieldFromLocal(map: FieldMapping, e: number, n: number): { x: number; y: number } {
  return {
    x: map.x0 + map.xe * e + map.xn * n + map.xee * e * e + map.xen * e * n + map.xnn * n * n,
    y: map.y0 + map.ye * e + map.yn * n + map.yee * e * e + map.yen * e * n + map.ynn * n * n,
  };
}

const mod = (v: number, m: number) => ((v % m) + m) % m;

/**
 * Position of the camera in the noise table for one layer, wrapped into 0..256 so the shader can
 * work with small numbers: [u1, v1, u2, v2] for the two octaves (see `cloudShape` in core/clouds.ts).
 */
export function layerLatticeOrigin(map: FieldMapping, layerIndex: number, out: [number, number, number, number]): [number, number, number, number] {
  const ox = layerIndex * 37.3;
  const oy = layerIndex * 91.7;
  out[0] = mod(map.x0 / CLOUD_SCALE_1_M + ox, CLOUD_NOISE_SIZE);
  out[1] = mod(map.y0 / CLOUD_SCALE_1_M + oy, CLOUD_NOISE_SIZE);
  out[2] = mod(map.x0 / CLOUD_SCALE_2_M + oy, CLOUD_NOISE_SIZE);
  out[3] = mod(map.y0 / CLOUD_SCALE_2_M + ox, CLOUD_NOISE_SIZE);
  return out;
}

/**
 * Where a sight line is inside the shell between two heights, on a curved earth.
 * Height along the line is h(t) = camH + dz·t + kc·t² with kc = (1 − dz²) / (2·(R + camH)).
 * Returns [tEnter, tExit] in metres along the line, or null when the line misses the shell.
 * (Mirrors `slabInterval` in the shader.)
 */
export function slabInterval(camH: number, dz: number, earthRadiusM: number, baseM: number, topM: number): [number, number] | null {
  const kc = Math.max((1 - dz * dz) / (2 * (earthRadiusM + camH)), 1e-11);
  const roots = (c: number): [number, number] | null => {
    const disc = dz * dz - 4 * kc * c;
    if (disc <= 0) return null;
    const q = -0.5 * (dz + (dz >= 0 ? 1 : -1) * Math.sqrt(disc));
    const r1 = q / kc;
    const r2 = c / q;
    return r1 < r2 ? [r1, r2] : [r2, r1];
  };
  const top = roots(camH - topM);
  if (!top) return null; // never below the top
  let ta = Math.max(top[0], 0);
  let tb = top[1];
  const cB = camH - baseM;
  const bot = roots(cB);
  if (cB < 0) {
    if (!bot) return null;
    ta = Math.max(ta, bot[1]); // below the base until the far root
  } else if (bot && dz < 0 && bot[0] > 0) {
    tb = Math.min(tb, bot[0]); // dips under the base; the far re-entry is ignored
  }
  return tb > ta ? [ta, tb] : null;
}

/** Height above the ellipsoid of a point `t` metres along a sight line (same approximation as the shader). */
export function heightAlongRay(camH: number, dz: number, earthRadiusM: number, t: number): number {
  return camH + dz * t + ((1 - dz * dz) / (2 * (earthRadiusM + camH))) * t * t;
}

// ---------------------------------------------------------------- easing

/** Move `current` toward `target` with time constant `tau` seconds (frame-rate independent). */
export function ease(current: number, target: number, dt: number, tau: number): number {
  if (!(dt > 0)) return current;
  return target + (current - target) * Math.exp(-dt / tau);
}

// ---------------------------------------------------------------- time

const MS_PER_HOUR = 3600000;
const MS_PER_DAY = 86400000;

/** UTC time (ms) at which the LOCAL solar time at `lon` is `hours` on the same LOCAL solar date as `utcMs`. */
export function utcForLocalSolarTime(utcMs: number, lonDeg: number, hours: number): number {
  const offset = (lonDeg / 15) * MS_PER_HOUR;
  const dayStart = Math.floor((utcMs + offset) / MS_PER_DAY) * MS_PER_DAY;
  return dayStart + clamp(hours, 0, 24) * MS_PER_HOUR - offset;
}

/** UTC time (ms) with the same local solar time of day as `utcMs` but on the given local date. */
export function utcForLocalDate(utcMs: number, lonDeg: number, year: number, month1to12: number, day: number): number {
  const offset = (lonDeg / 15) * MS_PER_HOUR;
  const local = utcMs + offset;
  const timeOfDay = local - Math.floor(local / MS_PER_DAY) * MS_PER_DAY;
  return Date.UTC(year, month1to12 - 1, day) + timeOfDay - offset;
}
