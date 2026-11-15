/**
 * The moving air: what the wind actually does at the aircraft, 120 times a second.
 *
 *  - mean wind from the weather's wind layers, following the terrain near the ground;
 *  - ground friction: below the height where airports measure the wind (10 m / 33 ft) it is
 *    weaker — about 80 % of the reported wind at the height of the wing on the runway;
 *  - gusts: smooth, random-looking surges and lulls whose peaks reach the reported gust speed,
 *    with small swings in direction, strongest near the ground;
 *  - turbulence: extra bumpiness in strong, gusty surface wind near the ground and inside cloud;
 *  - gentle thermals (rising and sinking air) under cumulus cloud on warm, sunny days.
 *
 * Everything is deterministic (the same seed and the same flight give the same air) and written
 * to run without creating objects in the per-step path.
 */
import { COVER_THRESHOLD, cloudShape } from "@/core/clouds";
import { CG_HEIGHT_FT } from "@/core/defaults";
import { D2R, FPS_PER_KT, R2D, clamp, norm360, smoothstep } from "@/core/math";
import type { Sim } from "@/core/sim";
import { sunPosition } from "@/core/sun";
import type { WindLayer } from "@/core/types";

// ---------------------------------------------------------------- ground friction

/** Height at which airports measure the surface wind (10 m), ft. */
export const ANEMOMETER_HEIGHT_FT = 33;
/** Height of the wing above the wheels of the trainer, ft: where most of the wind is felt. */
export const WING_ABOVE_WHEELS_FT = 7;
/** Exponent of the power-law wind profile over open, flat country. */
export const FRICTION_EXPONENT = 1 / 7;

/**
 * Share of the reported surface wind felt by the aircraft when its wheels are `wheelsAglFt`
 * above the ground: 1 at and above 33 ft (26 ft under the wheels), about 0.91 with the wheels
 * 10 ft up, about 0.80 standing on the runway.
 */
export function frictionFactor(wheelsAglFt: number): number {
  const h = Math.max(0, wheelsAglFt) + WING_ABOVE_WHEELS_FT;
  if (h >= ANEMOMETER_HEIGHT_FT) return 1;
  return Math.pow(h / ANEMOMETER_HEIGHT_FT, FRICTION_EXPONENT);
}

/** Gusts and direction swings fade with height: full strength up to 500 ft above the ground, 40 % above 3,000 ft. */
export function gustHeightFactor(aglFt: number): number {
  return 1 - 0.6 * smoothstep(500, 3000, aglFt);
}

// ---------------------------------------------------------------- wind layers (allocation-free)

/**
 * Mean wind from the layers at an altitude, as "from" components in knots (n = from the north,
 * e = from the east). Same interpolation as the core's `windAt`, written into `out`.
 */
export function layerWindInto(layers: readonly WindLayer[], altFtMsl: number, out: { n: number; e: number }): void {
  const first = layers[0];
  if (!first) {
    out.n = 0;
    out.e = 0;
    return;
  }
  let lo = first;
  let hi = first;
  for (let i = 0; i < layers.length; i++) {
    const l = layers[i]!;
    if (l.altFtMsl <= altFtMsl) lo = l;
    if (l.altFtMsl >= altFtMsl) {
      hi = l;
      break;
    }
    hi = l;
  }
  if (lo === hi || hi.altFtMsl <= lo.altFtMsl) {
    out.n = lo.kt * Math.cos(lo.dirTrue * D2R);
    out.e = lo.kt * Math.sin(lo.dirTrue * D2R);
    return;
  }
  const t = clamp((altFtMsl - lo.altFtMsl) / (hi.altFtMsl - lo.altFtMsl), 0, 1);
  out.n = lo.kt * Math.cos(lo.dirTrue * D2R) * (1 - t) + hi.kt * Math.cos(hi.dirTrue * D2R) * t;
  out.e = lo.kt * Math.sin(lo.dirTrue * D2R) * (1 - t) + hi.kt * Math.sin(hi.dirTrue * D2R) * t;
}

/**
 * How far below the aircraft's altitude (its centre of gravity) the wind layers are read, ft: the
 * surface layer is the wind at anemometer height, so it must apply when the WING is 33 ft up —
 * wheels 26 ft above the ground, centre of gravity 30.4 ft.
 */
export const SURFACE_REFERENCE_FT = ANEMOMETER_HEIGHT_FT - WING_ABOVE_WHEELS_FT + CG_HEIGHT_FT;

/**
 * Altitude at which the wind layers are read. The layers are tied to the weather station's
 * elevation; near the ground the profile follows the terrain instead (the "surface wind" is the
 * wind at the surface wherever you are — also at an airport higher or lower than the station),
 * and well above the ground the true altitude is used.
 */
export function effectiveWindAltitudeFt(altMslFt: number, aglFt: number, groundElevFt: number, stationElevFt: number): number {
  const offset = groundElevFt - stationElevFt;
  if (offset === 0) return altMslFt - SURFACE_REFERENCE_FT;
  const span = Math.max(3000, 2 * Math.abs(offset));
  return altMslFt - SURFACE_REFERENCE_FT - offset * (1 - smoothstep(1000, 1000 + span, aglFt));
}

// ---------------------------------------------------------------- gusts

/** Periods (seconds) and weights of the sine waves that are added up to make the gust pattern. */
const GUST_PERIODS = [37, 21, 12.7, 7.9, 4.9, 3.1];
const GUST_WEIGHTS = [0.24, 0.22, 0.19, 0.15, 0.12, 0.08];
const SWING_PERIODS = [53, 29, 17, 8.3];
const SWING_WEIGHTS = [0.4, 0.3, 0.2, 0.1];
// Shaping constants, tuned numerically (10-minute samples, 40 seeds): mean 0, highest peak 0.93–1.01.
const GUST_GAIN = 1.4;
const GUST_KNEE = 0.7;
const GUST_SOFT = 0.32;
const GUST_LULL = 0.6;
const GUST_BIAS = 0.067;

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A smooth, repeatable "random" gust pattern: a sum of slow sine waves (periods 3 to 37 s) with
 * random phases, shaped so that surges are sharper and higher than lulls are deep — the way an
 * anemometer trace looks. Band-limited by construction: nothing faster than a 3-second gust.
 */
export class GustPattern {
  private readonly gustPhase = new Float64Array(GUST_PERIODS.length);
  private readonly swingPhase = new Float64Array(SWING_PERIODS.length);

  constructor(seed = 1) {
    this.reseed(seed);
  }

  reseed(seed: number): void {
    const rnd = mulberry32(seed);
    for (let i = 0; i < this.gustPhase.length; i++) this.gustPhase[i] = rnd() * 2 * Math.PI;
    for (let i = 0; i < this.swingPhase.length; i++) this.swingPhase[i] = rnd() * 2 * Math.PI;
  }

  /**
   * Speed deviation at time `t` (seconds) as a share of the gust increment: long-run mean 0,
   * peaks close to +1 a few times in ten minutes, lulls down to about −0.8.
   */
  speed(t: number): number {
    let x = 0;
    for (let i = 0; i < GUST_PERIODS.length; i++) x += GUST_WEIGHTS[i]! * Math.sin((2 * Math.PI * t) / GUST_PERIODS[i]! + this.gustPhase[i]!);
    x *= GUST_GAIN;
    if (x > GUST_KNEE) x = GUST_KNEE + GUST_SOFT * Math.tanh((x - GUST_KNEE) / GUST_SOFT);
    else if (x < 0) x *= GUST_LULL;
    return (x - GUST_BIAS) / (1 - GUST_BIAS);
  }

  /** Direction deviation at time `t`, −1 … +1 (to be multiplied by the swing half-width). */
  swing(t: number): number {
    let x = 0;
    for (let i = 0; i < SWING_PERIODS.length; i++) x += SWING_WEIGHTS[i]! * Math.sin((2 * Math.PI * t) / SWING_PERIODS[i]! + this.swingPhase[i]!);
    return x;
  }
}

/** Half-width of the direction swings that go with gusts of a given increment, degrees. */
export function gustSwingDeg(gustKt: number): number {
  return gustKt > 0 ? clamp(4 + 0.8 * gustKt, 0, 15) : 0;
}

// ---------------------------------------------------------------- the per-step engine

/** A sudden change of the wind larger than this in one step (kt) is a "cut" (new weather, new place) and is eased in. */
const JUMP_KT = 1;
/** Time constant with which a cut is eased in, seconds (95 % done after three times this). */
export const EASE_SECONDS = 4;
/** Scale of the thermals, ft/s (8 ft/s = 480 ft/min): the lift under the middle of a cloud is this times (1 − mean), the sink between clouds this times the mean. */
const THERMAL_MAX_FPS = 8;
/** How far the lift reaches beyond (below) and builds up inside (above) the cloud's edge, in cloud-shape units: wide enough that there are no walls of air. */
const THERMAL_EDGE_BELOW = 0.12;
const THERMAL_EDGE_ABOVE = 0.2;
/** Average of the "under a cloud" value over the whole sky for FEW and SCT (measured over the shared cloud field), so rising and sinking air balance. */
const THERMAL_MEAN_FEW = 0.13;
const THERMAL_MEAN_SCT = 0.33;

/** Live numbers of the wind engine (for tests, the instructor and debugging). Updated in place every step. */
export interface WindStatus {
  /** Mean wind at the aircraft before gusts and ground friction, kt and degrees true. */
  meanKt: number;
  meanDirTrue: number;
  /** Gust deviation applied right now, kt (+ = stronger than the mean). */
  gustNowKt: number;
  /** Direction deviation applied right now, degrees. */
  swingNowDeg: number;
  /** Ground-friction factor applied (1 = none). */
  friction: number;
  /** Turbulence sent to the flight model, 0..1. */
  turbulence: number;
  /** Rising (+) or sinking (−) air from thermals, ft/min. */
  thermalFpm: number;
  /** 0..1 strength of the thermals in the current weather (0 = none). */
  thermalStrength: number;
}

export class WindDynamics {
  /** Extra slow wander of the wind direction, degrees (variable wind of a real report). */
  dirSwingDeg = 0;
  /** Small natural variation of a real "steady" wind, kt. */
  naturalKt = 0;
  /** 0..1 thunderstorm / towering cumulus about: rough air inside cloud. */
  convective = 0;
  /**
   * Thermal strength 0..1 fixed by a preset (0 = a preset that wants smooth air, 1 = the "thermals"
   * preset, whatever the time of day). null = work it out from the weather: cumulus, warmth and sun.
   */
  thermalOverride: number | null = null;

  readonly status: WindStatus = { meanKt: 0, meanDirTrue: 0, gustNowKt: 0, swingNowDeg: 0, friction: 1, turbulence: 0, thermalFpm: 0, thermalStrength: 0 };

  private readonly pattern: GustPattern;
  private readonly seed: number;
  private readonly w = { n: 0, e: 0 };
  private primed = false;
  private prevRawN = 0;
  private prevRawE = 0;
  private offN = 0;
  private offE = 0;
  private slowCount = 0;
  private cumulusIndex = -1;
  private thermalStrength = 0;

  constructor(seed = 1) {
    this.seed = seed;
    this.pattern = new GustPattern(seed);
  }

  /** Call after every reposition: the same gust sequence starts again and the wind continues smoothly from what the flight model was started with. */
  reset(): void {
    this.pattern.reseed(this.seed);
    this.primed = false;
    this.offN = this.offE = 0;
    this.slowCount = 0;
  }

  /** Forget the special behaviour that came with a real report or a preset. */
  clearExtras(): void {
    this.dirSwingDeg = 0;
    this.naturalKt = 0;
    this.convective = 0;
    this.thermalOverride = null;
  }

  /** Slow-changing things, once a second: is there cumulus to put thermals under, and is the sun heating the ground? */
  private slow(sim: Sim): void {
    const env = sim.env;
    this.cumulusIndex = -1;
    for (let i = 0; i < env.clouds.length; i++) {
      const c = env.clouds[i]!;
      const baseAgl = c.baseFtMsl - env.stationElevFt;
      if ((c.cover === "FEW" || c.cover === "SCT") && baseAgl >= 1200 && baseAgl <= 9000) {
        this.cumulusIndex = i;
        break;
      }
    }
    let strength = 0;
    if (this.cumulusIndex >= 0) {
      if (this.thermalOverride !== null) strength = clamp(this.thermalOverride, 0, 1);
      else {
        const warm = clamp((env.tempC - 12) / 12, 0, 1);
        const sun = clamp(sunPosition(env.utcMs, sim.state.lat, sim.state.lon).elevationDeg / 35, 0, 1);
        strength = warm * sun;
      }
    }
    this.thermalStrength = strength;
    this.status.thermalStrength = strength;
  }

  /** One physics step: refine the wind, vertical air and turbulence in `sim.fdmIn`. */
  step(sim: Sim, dt: number): void {
    const env = sim.env;
    const s = sim.state;
    const f = sim.fdmIn;
    const st = this.status;
    const w = this.w;
    if (this.slowCount-- <= 0) {
      this.slowCount = 119;
      this.slow(sim);
    }
    const agl = s.aglFt;

    // ---- mean wind from the layers
    layerWindInto(env.wind, effectiveWindAltitudeFt(s.altMslFt, agl, s.groundElevFt, env.stationElevFt), w);
    const mean = Math.hypot(w.n, w.e);
    let un: number;
    let ue: number;
    if (mean > 0.01) {
      un = w.n / mean;
      ue = w.e / mean;
    } else {
      const d = (env.wind[0]?.dirTrue ?? 0) * D2R;
      un = Math.cos(d);
      ue = Math.sin(d);
    }
    st.meanKt = mean;
    st.meanDirTrue = mean > 0.01 ? norm360(Math.atan2(w.e, w.n) * R2D) : 0;

    // ---- gusts and direction swings
    const t = s.time;
    const gh = gustHeightFactor(agl);
    const amp = Math.max(env.gustKt > 0 ? env.gustKt * gh : 0, this.naturalKt);
    let speed = mean;
    st.gustNowKt = 0;
    if (amp > 0) {
      const dev = amp * this.pattern.speed(t);
      speed = Math.max(0, mean + dev);
      st.gustNowKt = speed - mean;
    }
    const swing = Math.max(this.dirSwingDeg, gustSwingDeg(env.gustKt)) * gh;
    st.swingNowDeg = 0;
    if (swing > 0 && speed > 0.01) {
      const a = swing * this.pattern.swing(t);
      st.swingNowDeg = a;
      const ca = Math.cos(a * D2R);
      const sa = Math.sin(a * D2R);
      const rn = un * ca - ue * sa;
      ue = un * sa + ue * ca;
      un = rn;
    }

    // ---- ground friction
    const friction = frictionFactor(agl);
    st.friction = friction;
    speed *= friction;
    const rawN = un * speed;
    const rawE = ue * speed;

    // ---- no sudden jumps: continue from the wind the flight model had, ease any cut in over a few seconds
    if (!this.primed) {
      this.primed = true;
      this.offN = -f.windNorthFps / FPS_PER_KT - rawN;
      this.offE = -f.windEastFps / FPS_PER_KT - rawE;
    } else if (Math.abs(rawN - this.prevRawN) + Math.abs(rawE - this.prevRawE) > JUMP_KT) {
      this.offN += this.prevRawN - rawN;
      this.offE += this.prevRawE - rawE;
    }
    this.prevRawN = rawN;
    this.prevRawE = rawE;
    const keep = 1 - dt / EASE_SECONDS;
    this.offN *= keep;
    this.offE *= keep;
    if (Math.abs(this.offN) + Math.abs(this.offE) < 0.005) this.offN = this.offE = 0;
    f.windNorthFps = -(rawN + this.offN) * FPS_PER_KT;
    f.windEastFps = -(rawE + this.offE) * FPS_PER_KT;

    // ---- thermals: rising air under the cumulus, sinking air between
    let lift = 0;
    let thermalProfile = 0;
    if (this.thermalStrength > 0.02 && this.cumulusIndex >= 0 && agl > 100) {
      const layer = env.clouds[this.cumulusIndex];
      if (layer) {
        const x = s.lon * 111320 * Math.cos(s.lat * D2R); // same field coordinates as core/clouds.ts cloudFieldXY
        const y = s.lat * 110540;
        const thr = COVER_THRESHOLD[layer.cover];
        const under = smoothstep(thr - THERMAL_EDGE_BELOW, thr + THERMAL_EDGE_ABOVE, cloudShape(x, y, this.cumulusIndex));
        thermalProfile = smoothstep(100, 1500, agl) * (1 - smoothstep(layer.baseFtMsl + 0.7 * (layer.topFtMsl - layer.baseFtMsl), layer.topFtMsl + 500, s.altMslFt));
        lift = THERMAL_MAX_FPS * this.thermalStrength * (under - (layer.cover === "FEW" ? THERMAL_MEAN_FEW : THERMAL_MEAN_SCT)) * thermalProfile;
      }
    }
    f.windDownFps = lift === 0 ? 0 : -lift;
    st.thermalFpm = lift * 60;

    // ---- turbulence
    const low = 1 - smoothstep(300, 2500, agl);
    const surfaceKt = env.wind[0]?.kt ?? 0;
    let turb = env.turbulence;
    turb += clamp((surfaceKt + 0.5 * env.gustKt - 12) / 60, 0, 0.3) * low; // strong wind tumbling over the ground
    turb += clamp(env.gustKt / 50, 0, 0.3) * low; // gusty air is rough air
    turb += 0.2 * this.thermalStrength * thermalProfile;
    if (s.inCloud > 0.01) {
      let rough = 0.05;
      for (let i = 0; i < env.clouds.length; i++) {
        const c = env.clouds[i]!;
        if (s.altMslFt >= c.baseFtMsl - 150 && s.altMslFt <= c.topFtMsl + 150) {
          rough = Math.max(rough, c.cover === "FEW" || c.cover === "SCT" ? 0.25 : c.cover === "BKN" ? 0.12 : 0.05);
        }
      }
      turb += s.inCloud * (rough + 0.35 * this.convective);
    }
    turb = clamp(turb, 0, 1);
    f.turbulence = turb;
    st.turbulence = turb;
  }
}
