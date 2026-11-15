/**
 * Flight dynamics: JSBSim — the open-source flight model used by the FlightGear simulator —
 * compiled to WebAssembly (public/jsbsim/, built by flightsim/jsbsim/build.sh from the tuned
 * Cessna 172P data files in flightsim/jsbsim/; see README.md and CHANGES.md there).
 *
 * JSBSim is © the JSBSim developers, LGPL-2.1. It is shipped as a separate, replaceable module.
 * This file is TeachX's thin adapter: it converts TeachX conventions to JSBSim properties.
 *
 * Useful extra properties of the tuned aircraft (read with `getProperty`):
 *   aero/stall-hyst-norm                 1 while the wing is deeply stalled (set above 26° angle of attack, cleared below 12°)
 *   aero/function/slipstream-immersion   0.1…1, how much of the fin is in the propeller slipstream
 *   aero/function/engine-torque-ftlb     engine torque (drives the left-turning tendencies)
 *   fcs/steer-pos-deg[0]                 nose-wheel steering angle (rudder pedals, plus differential brake at taxi speed)
 * Related modules: ./constants.ts (stall angles, airspeed calibration), ./weight-balance.ts.
 *
 *   TeachX elevator + = pull (nose up)   → fcs/elevator-cmd-norm   − = nose up
 *   TeachX aileron  + = roll right       → fcs/aileron-cmd-norm    + = roll right
 *   TeachX rudder   + = yaw right        → fcs/rudder-cmd-norm     − = yaw right
 *   TeachX trim     + = nose up          → fcs/pitch-trim-cmd-norm − = nose up
 * (verified by flight tests in tests/physics.)
 */
import { getAircraft, type Aircraft } from "@/aircraft/catalog";
import { FPS_PER_KT, KT_PER_FPS, LB_PER_GAL_AVGAS, R2D } from "@/core/math";

interface FdmHandle {
  loadModel(name: string): boolean;
  setInitial(lat: number, lon: number, altFt: number, onGround: boolean, terrainFt: number, headingDeg: number, kcas: number, pitchDeg: number): void;
  runIC(): boolean;
  setDt(dt: number): void;
  run(steps: number): boolean;
  /** Present in the flight simulator's own build (flightsim/jsbsim/wrapper.cpp); absent in older builds. */
  startEngines?(throttle: number, mixture: number): boolean;
  /** FlightGear-engine build only: number of engines, and a trim that is safe for governed propellers. */
  numEngines?(): number;
  trim?(mode: number): boolean;
  bind(path: string, create: boolean): number;
  get(handle: number): number;
  set(handle: number, value: number): void;
  readAll(ptr: number, count: number): void;
  getByName(path: string): number;
  setByName(path: string, value: number): void;
  lastError(): string;
  delete(): void;
}

export interface JsbsimModule {
  Fdm: new () => FdmHandle;
  HEAPF64: Float64Array;
  _malloc(bytes: number): number;
  _free(ptr: number): void;
}

let modulePromise: Promise<JsbsimModule> | null = null;

/** Load (once) the JSBSim WebAssembly module. In the browser the URL defaults to ./jsbsim/jsbsim.mjs. */
export function loadJsbsim(url?: string): Promise<JsbsimModule> {
  if (!modulePromise) {
    modulePromise = (async () => {
      const resolved = url ?? new URL(`${import.meta.env.BASE_URL}jsbsim/jsbsim.mjs`, document.baseURI).href;
      const mod = (await import(/* @vite-ignore */ resolved)) as { default: (opts?: Record<string, unknown>) => Promise<JsbsimModule> };
      const base = new URL(resolved);
      const locateFile = (file: string) => {
        const u = new URL(file, base);
        return u.protocol === "file:" ? decodeURIComponent(u.pathname) : u.href;
      };
      return mod.default({ print: () => {}, printErr: () => {}, locateFile });
    })().catch((e: unknown) => {
      modulePromise = null;
      throw e;
    });
  }
  return modulePromise;
}

export interface FdmInit {
  /** Which aircraft (default: the Cessna 172P). */
  aircraft?: Aircraft;
  lat: number;
  lon: number;
  /** ft MSL when airborne (ignored on the ground). */
  altMslFt: number;
  onGround: boolean;
  terrainFt: number;
  headingTrue: number;
  /** Calibrated airspeed for airborne starts, kt. */
  kcas: number;
  pitchDeg?: number;
  engineRunning: boolean;
  fuelLeftGal: number;
  fuelRightGal: number;
  /** Cabin loading, lb: [pilot, front passenger, rear-left, rear-right, baggage]. */
  payloadLb?: [number, number, number, number, number];
  /** Flight-path angle for airborne starts, degrees (negative = descending). */
  gammaDeg?: number;
  /** Flap position at the start, 0..1 of full travel. */
  flapNorm?: number;
  /** Wind at the start: direction it blows FROM (true degrees) and speed (kt). Used for airborne starts so the airspeed is right from the first moment. */
  windDirTrue?: number;
  windKt?: number;
  /** Sea-level pressure for the model atmosphere, inHg, and temperature offset from standard, °C. */
  seaLevelPressureInHg?: number;
  isaDeviationC?: number;
}

/** Commands sent to the flight model each step (after the systems module has applied switch logic). */
export interface FdmInputs {
  elevator: number;
  aileron: number;
  rudder: number;
  trim: number;
  throttle: number;
  mixture: number;
  /** Flap handle position, 0..1 of full travel. */
  flapNorm: number;
  brakeLeft: number;
  brakeRight: number;
  /** 0 off, 1 right, 2 left, 3 both */
  magnetos: 0 | 1 | 2 | 3;
  starter: boolean;
  /**
   * Fraction of engine power lost to carburettor ice / carburettor heat / a simulated partial failure:
   * 0 = full power available, 1 = no power. (Implemented by the physics adapter.)
   */
  powerLoss: number;
  /** Fuel can reach the engine from each tank (selector / failures). */
  feedLeft: boolean;
  feedRight: boolean;
  terrainFt: number;
  /** Wind velocity components the air is moving TOWARD, ft/s. */
  windNorthFps: number;
  windEastFps: number;
  windDownFps: number;
  /** 0..1 turbulence intensity. */
  turbulence: number;
  /** Temperature offset from the standard atmosphere, °C. */
  isaDeviationC: number;
  /** Sea-level pressure of the model atmosphere, inHg (see `modelSeaLevelPressureInHg` in core/sim.ts). */
  qnhInHg: number;
  /** Landing-gear lever (aircraft with retractable gear only): true = down. Missing = down. */
  gearDown?: boolean;
}

/** Raw truth values read back from JSBSim (already in TeachX units and signs). */
export interface FdmOutputs {
  lat: number;
  lon: number;
  altMslFt: number;
  aglFt: number;
  pitch: number;
  roll: number;
  headingTrue: number;
  rollRate: number;
  pitchRate: number;
  yawRate: number;
  turnRate: number;
  kcas: number;
  ktas: number;
  gsKt: number;
  vNorthKt: number;
  vEastKt: number;
  vsFpm: number;
  alphaDeg: number;
  betaDeg: number;
  nz: number;
  ny: number;
  mach: number;
  flapsDeg: number;
  wowNose: boolean;
  wowLeft: boolean;
  wowRight: boolean;
  rpm: number;
  engineRunning: boolean;
  fuelFlowGph: number;
  oilPressPsi: number;
  oilTempF: number;
  egtF: number;
  manifoldInHg: number;
  powerHp: number;
  thrustLb: number;
  fuelLeftGal: number;
  fuelRightGal: number;
  weightLb: number;
  cgIn: number;
  staticPressurePsf: number;
  oatR: number;
  elevatorRad: number;
  aileronLeftRad: number;
  aileronRightRad: number;
  rudderRad: number;
  stallHyst: number;
  simTime: number;
  chtF: number;
  /** Jets and turboprops: N1 (fan / gas-generator speed) in percent (0 for piston engines). */
  n1Pct: number;
  /** Landing gear: 1 down, 0 up (always 1 for fixed gear). */
  gearPosNorm: number;
}

const READ = [
  "position/lat-geod-deg",
  "position/long-gc-deg",
  "position/h-sl-ft",
  "position/h-agl-ft",
  "attitude/theta-deg",
  "attitude/phi-deg",
  "attitude/psi-deg",
  "velocities/p-rad_sec",
  "velocities/q-rad_sec",
  "velocities/r-rad_sec",
  "velocities/psidot-rad_sec",
  "velocities/vc-kts",
  "velocities/vtrue-kts",
  "velocities/vg-fps",
  "velocities/v-north-fps",
  "velocities/v-east-fps",
  "velocities/h-dot-fps",
  "aero/alpha-deg",
  "aero/beta-deg",
  "accelerations/n-pilot-z-norm",
  "accelerations/n-pilot-y-norm",
  "velocities/mach",
  "fcs/flap-pos-deg",
  "gear/unit[0]/WOW",
  "gear/unit[1]/WOW",
  "gear/unit[2]/WOW",
  "propulsion/engine/engine-rpm",
  "propulsion/engine/set-running",
  "propulsion/engine/fuel-flow-rate-pps",
  "propulsion/engine/oil-pressure-psi",
  "propulsion/engine/oil-temperature-degF",
  "propulsion/engine/egt-degF",
  "propulsion/engine/map-inhg",
  "propulsion/engine/power-hp",
  "propulsion/engine/thrust-lbs",
  "propulsion/tank[0]/contents-lbs",
  "propulsion/tank[1]/contents-lbs",
  "inertia/weight-lbs",
  "inertia/cg-x-in",
  "atmosphere/P-psf",
  "atmosphere/T-R",
  "fcs/elevator-pos-rad",
  "fcs/left-aileron-pos-rad",
  "fcs/right-aileron-pos-rad",
  "fcs/rudder-pos-rad",
  "aero/stall-hyst-norm",
  "simulation/sim-time-sec",
  "propulsion/engine/cht-degF",
  // (added for the other aircraft of the hangar; read for all, used where meaningful)
  "propulsion/engine/n1",
  "gear/gear-pos-norm",
  "propulsion/engine/propeller-rpm",
] as const;

const WRITE = [
  "fcs/elevator-cmd-norm",
  "fcs/aileron-cmd-norm",
  "fcs/rudder-cmd-norm",
  "fcs/pitch-trim-cmd-norm",
  "fcs/throttle-cmd-norm",
  "fcs/mixture-cmd-norm",
  "fcs/flap-cmd-norm",
  "fcs/left-brake-cmd-norm",
  "fcs/right-brake-cmd-norm",
  "fcs/center-brake-cmd-norm",
  "propulsion/magneto_cmd",
  "propulsion/starter_cmd",
  "propulsion/tank[0]/priority",
  "propulsion/tank[1]/priority",
  "position/terrain-elevation-asl-ft",
  "atmosphere/wind-north-fps",
  "atmosphere/wind-east-fps",
  "atmosphere/wind-down-fps",
  "atmosphere/turb-type",
  "atmosphere/turbulence/milspec/windspeed_at_20ft_AGL-fps",
  "atmosphere/turbulence/milspec/severity",
  "atmosphere/delta-T",
  "atmosphere/P-sl-psf",
  "propulsion/engine/volumetric-efficiency",
  // (added for the other aircraft of the hangar; only written for them)
  "fcs/steer-cmd-norm",
  "gear/gear-cmd-norm",
  "propulsion/cutoff_cmd",
] as const;
type WritePath = (typeof WRITE)[number];
/** Positions in READ (= bind handles, they are bound first) that are checked for NaN after every step. */
const HEALTH_HANDLES = [READ.indexOf("position/lat-geod-deg"), READ.indexOf("position/h-sl-ft"), READ.indexOf("attitude/theta-deg"), READ.indexOf("velocities/vc-kts"), READ.indexOf("propulsion/engine/power-hp")];

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
const PSF_PER_INHG = 70.7262;

/** A finite number, or `fallback` when the value is NaN / infinite / not a number. */
const fin = (v: number, fallback: number) => (Number.isFinite(v) ? v : fallback);
/** Largest wind component passed to the flight model, ft/s (about 150 kt). */
const MAX_WIND_FPS = 250;

/**
 * How `FdmInputs.powerLoss` is turned into engine behaviour.
 *
 * Carburettor ice, carburettor heat and most "partial power" failures all do the same thing to a
 * piston engine: less air (and with it less fuel) gets into the cylinders. JSBSim's piston engine
 * has one number for exactly that — its volumetric efficiency ("how well the cylinders fill") — so
 * the adapter scales it. Air flow, fuel flow, manifold pressure and exhaust temperature all follow
 * naturally, and on the fixed-pitch propeller the rpm drops as it does in the real aircraft.
 *
 * Part of the engine's power always goes into its own friction, so removing x % of the air removes
 * a little more than x % of the power that reaches the propeller. The curve below corrects for that
 * at high power (so powerLoss 0.1 ≈ 10 % less shaft power at full throttle) and reaches zero air
 * flow — a dead, windmilling engine — at powerLoss 1.
 */
export function airflowFractionForPowerLoss(powerLoss: number): number {
  const l = Number.isFinite(powerLoss) ? clamp(powerLoss, 0, 1) : 0;
  return clamp(1 - l * (POWER_LOSS_SHAFT_SHARE + (1 - POWER_LOSS_SHAFT_SHARE) * l * l * l), 0, 1);
}
/** Below this share of normal air flow the engine cannot run at all: the adapter then also cuts the fuel. */
const MIN_AIRFLOW_FRACTION = 0.05;
/** Share of the power made in the cylinders that reaches the propeller at full throttle (the rest is friction). */
const POWER_LOSS_SHAFT_SHARE = 0.63;

/** One JSBSim aircraft instance (any aircraft of the hangar). Create a new one for every (re)spawn. */
export class FlightModel {
  /** Physics step, seconds. The simulator always advances in whole steps of this size. */
  static readonly DT = 1 / 120;
  private readonly m: JsbsimModule;
  private readonly fdm: FdmHandle;
  private readonly writeHandles = new Map<WritePath, number>();
  private readonly buf: number;
  private disposed = false;
  /** Throttle and pitch-trim positions (TeachX conventions) for steady hands-off flight, found for airborne starts. */
  initialTrim: { throttle: number; trim: number } | null = null;
  private readonly out: FdmOutputs;
  /** The engine's normal volumetric efficiency (cylinder filling), read from the engine file at creation. */
  private readonly baseVolumetricEfficiency: number;
  /** The aircraft being flown. */
  readonly aircraft: Aircraft;
  /** The original Cessna 172P path (tuned, validated, unchanged) or the generic path for the other aircraft. */
  private readonly trainer: boolean;
  /** Handles of throttle / mixture / propeller lever for every engine (index 0 = the first engine). */
  private readonly engineHandles: { throttle: number; mixture: number; advance: number }[] = [];
  /** FlightGear-only inputs copied every step: [destination handle, source handle]. */
  private readonly mirrorHandles: [number, number][] = [];

  private constructor(m: JsbsimModule, fdm: FdmHandle, ac: Aircraft) {
    this.m = m;
    this.fdm = fdm;
    this.aircraft = ac;
    this.trainer = ac.id === "c172p";
    for (const p of READ) fdm.bind(p, true);
    for (const p of WRITE) this.writeHandles.set(p, fdm.bind(p, true));
    if (!this.trainer) {
      const n = Math.max(1, ac.engines);
      for (let i = 0; i < n; i++) {
        this.engineHandles.push({
          throttle: fdm.bind(`fcs/throttle-cmd-norm[${i}]`, true),
          mixture: fdm.bind(`fcs/mixture-cmd-norm[${i}]`, true),
          advance: fdm.bind(`fcs/advance-cmd-norm[${i}]`, true),
        });
      }
      for (const [dst, src] of ac.fgMirror) this.mirrorHandles.push([fdm.bind(dst, true), fdm.bind(src, true)]);
    }
    this.buf = m._malloc(READ.length * 8);
    this.out = {} as FdmOutputs;
    const ve = fdm.getByName("propulsion/engine/volumetric-efficiency");
    this.baseVolumetricEfficiency = Number.isFinite(ve) && ve > 0 ? ve : 0.85;
  }

  static async create(init: FdmInit, moduleUrl?: string): Promise<FlightModel> {
    const m = await loadJsbsim(moduleUrl);
    return FlightModel.createSync(m, init);
  }

  /** Synchronous creation once the module is loaded (used for instant repositioning). */
  static createSync(m: JsbsimModule, init: FdmInit): FlightModel {
    const ac = init.aircraft ?? getAircraft("c172p");
    if (ac.id !== "c172p") return FlightModel.createOther(m, init, ac);
    const fdm = new m.Fdm();
    if (!fdm.loadModel("c172p")) {
      const err = fdm.lastError();
      fdm.delete();
      throw new Error(`JSBSim could not load the aircraft: ${err || "unknown error"}`);
    }
    fdm.setByName("position/terrain-elevation-asl-ft", init.terrainFt);
    // Ground starts place the reference point a few feet above the runway so the aircraft settles on its gear.
    fdm.setInitial(init.lat, init.lon, init.onGround ? 4.5 : init.altMslFt, init.onGround, init.terrainFt, init.headingTrue, init.onGround ? 0 : init.kcas, init.onGround ? 0 : (init.pitchDeg ?? 0));
    const payload = init.payloadLb ?? [170, 0, 0, 0, 0];
    payload.forEach((lb, i) => fdm.setByName(`inertia/pointmass-weight-lbs[${i}]`, Math.max(0, lb)));
    fdm.setByName("propulsion/tank[0]/contents-lbs", Math.max(0, init.fuelLeftGal) * LB_PER_GAL_AVGAS);
    fdm.setByName("propulsion/tank[1]/contents-lbs", Math.max(0, init.fuelRightGal) * LB_PER_GAL_AVGAS);
    if (!init.onGround && init.gammaDeg) fdm.setByName("ic/gamma-deg", init.gammaDeg);
    const flap = clamp(init.flapNorm ?? 0, 0, 1);
    fdm.setByName("fcs/flap-cmd-norm", flap);
    fdm.setByName("fcs/flap-pos-norm", flap);
    fdm.setByName("fcs/flap-pos-deg", flap * 30);
    if (init.isaDeviationC !== undefined) fdm.setByName("atmosphere/delta-T", init.isaDeviationC * 1.8);
    if (init.seaLevelPressureInHg !== undefined) fdm.setByName("atmosphere/P-sl-psf", init.seaLevelPressureInHg * PSF_PER_INHG);
    if (!fdm.runIC()) {
      const err = fdm.lastError();
      fdm.delete();
      throw new Error(`JSBSim could not start at that position: ${err || "unknown error"}`);
    }
    fdm.setDt(FlightModel.DT);
    const startEngine = () => {
      if (!init.engineRunning) return;
      fdm.setByName("fcs/mixture-cmd-norm", 1);
      fdm.setByName("propulsion/magneto_cmd", 3);
      // On the ground the engine should be idling from the first moment (JSBSim's own instant start
      // settles at full throttle, so the engine would begin at high rpm and wind down).
      if (init.onGround && fdm.startEngines) {
        if (fdm.startEngines(0, 1)) {
          fdm.setByName("fcs/throttle-cmd-norm", 0);
          return;
        }
      }
      fdm.setByName("propulsion/set-running", -1);
    };
    startEngine();
    let initialTrim: { throttle: number; trim: number } | null = null;
    if (!init.onGround) {
      // 1) Trim for steady hands-off flight in still air (JSBSim solves for pitch, throttle and pitch trim).
      try {
        fdm.setByName("fcs/throttle-cmd-norm", 0.5);
        fdm.setByName("simulation/do_simple_trim", 0);
        const throttle = fdm.getByName("fcs/throttle-cmd-norm");
        const trim = fdm.getByName("fcs/pitch-trim-cmd-norm");
        if (Number.isFinite(throttle) && Number.isFinite(trim)) initialTrim = { throttle, trim: -trim };
      } catch {
        initialTrim = null;
      }
      // 2) Add the wind: keep the motion through the AIR exactly as trimmed and shift the motion over
      //    the GROUND by the wind. (JSBSim's own initial-wind options use the opposite sign to its
      //    run-time wind, so the wind is applied here instead.)
      const windKt = init.windKt ?? 0;
      if (windKt > 0.1) {
        const dir = ((init.windDirTrue ?? 0) * Math.PI) / 180;
        const toNorth = -windKt * FPS_PER_KT * Math.cos(dir);
        const toEast = -windKt * FPS_PER_KT * Math.sin(dir);
        const vn = fdm.getByName("velocities/v-north-fps");
        const ve = fdm.getByName("velocities/v-east-fps");
        const vd = fdm.getByName("velocities/v-down-fps");
        fdm.setByName("ic/theta-deg", fdm.getByName("attitude/theta-deg"));
        fdm.setByName("ic/phi-deg", fdm.getByName("attitude/phi-deg"));
        fdm.setByName("ic/psi-true-deg", fdm.getByName("attitude/psi-deg"));
        fdm.setByName("ic/vn-fps", vn + toNorth);
        fdm.setByName("ic/ve-fps", ve + toEast);
        fdm.setByName("ic/vd-fps", vd);
        if (!fdm.runIC()) {
          const err = fdm.lastError();
          fdm.delete();
          throw new Error(`JSBSim could not start with that wind: ${err || "unknown error"}`);
        }
        fdm.setDt(FlightModel.DT);
        // (The engine keeps running at its trimmed speed through this re-initialisation — do not restart it.)
        fdm.setByName("atmosphere/wind-north-fps", toNorth);
        fdm.setByName("atmosphere/wind-east-fps", toEast);
        if (initialTrim) {
          fdm.setByName("fcs/throttle-cmd-norm", initialTrim.throttle);
          fdm.setByName("fcs/pitch-trim-cmd-norm", -initialTrim.trim);
        }

      }
    }
    const model = new FlightModel(m, fdm, ac);
    model.initialTrim = initialTrim;
    return model;
  }

  /**
   * Creation for every aircraft except the tuned Cessna 172P. Same steps, adapted to engines that
   * are not a fixed-pitch piston: all engines move together, governed propellers are kept at full
   * fine pitch, engines that cannot be started instantly are started with the starter (behind the
   * scenes), and if JSBSim's trim cannot balance the aircraft it is flown level for a few seconds
   * and the pitch trim is set to what held it there.
   */
  private static createOther(m: JsbsimModule, init: FdmInit, ac: Aircraft): FlightModel {
    const fdm = new m.Fdm();
    if (!fdm.loadModel(ac.jsbsim)) {
      const err = fdm.lastError();
      fdm.delete();
      throw new Error(`JSBSim could not load the ${ac.name}: ${err || "unknown error"}`);
    }
    fdm.setByName("position/terrain-elevation-asl-ft", init.terrainFt);
    fdm.setInitial(init.lat, init.lon, init.onGround ? ac.groundStartAglFt : init.altMslFt, init.onGround, init.terrainFt, init.headingTrue, init.onGround ? 0 : init.kcas, init.onGround ? 0 : (init.pitchDeg ?? 0));
    if (!init.onGround && init.gammaDeg) fdm.setByName("ic/gamma-deg", init.gammaDeg);
    const flap = clamp(init.flapNorm ?? 0, 0, 1);
    fdm.setByName("fcs/flap-cmd-norm", flap);
    fdm.setByName("fcs/flap-pos-norm", flap);
    fdm.setByName("fcs/flap-pos-deg", flap * ac.flapMaxDeg);
    if (ac.retractableGear) fdm.setByName("gear/gear-cmd-norm", init.onGround ? 1 : 0);
    if (init.isaDeviationC !== undefined) fdm.setByName("atmosphere/delta-T", init.isaDeviationC * 1.8);
    if (init.seaLevelPressureInHg !== undefined) fdm.setByName("atmosphere/P-sl-psf", init.seaLevelPressureInHg * PSF_PER_INHG);
    if (!fdm.runIC()) {
      const err = fdm.lastError();
      fdm.delete();
      throw new Error(`JSBSim could not start at that position: ${err || "unknown error"}`);
    }
    fdm.setDt(FlightModel.DT);
    if (ac.retractableGear && !init.onGround) {
      fdm.setByName("gear/gear-cmd-norm", 0);
      fdm.setByName("gear/gear-pos-norm", 0);
    }
    const model = new FlightModel(m, fdm, ac);
    const n = model.engineHandles.length;
    for (const e of model.engineHandles) {
      fdm.set(e.mixture, 1);
      fdm.set(e.advance, 1);
    }
    fdm.setByName("propulsion/magneto_cmd", 3);
    const throttle = init.onGround ? 0 : ac.cruiseThrottle;
    if (init.engineRunning && !model.startEnginesSafely(throttle, init.onGround)) {
      model.dispose();
      throw new Error(`The engine of the ${ac.name} could not be started.`);
    }
    if (!init.onGround) {
      // Let propeller governors and engine regulators settle, then trim for hands-off flight.
      model.runSteps(120 * 2);
      for (const [d, sIdx] of model.mirrorHandles) fdm.set(d, fdm.get(sIdx));
      let trimmed = false;
      try {
        trimmed = fdm.trim ? fdm.trim(0) : (fdm.setByName("simulation/do_simple_trim", 0), true);
      } catch {
        trimmed = false;
      }
      if (trimmed) {
        const thr = fdm.getByName("fcs/throttle-cmd-norm");
        const trim = fdm.getByName("fcs/pitch-trim-cmd-norm");
        if (Number.isFinite(thr) && Number.isFinite(trim)) model.initialTrim = { throttle: thr, trim: -trim };
      } else {
        // JSBSim could not balance this aircraft (the trim also resets it to the starting point and
        // may stop the engine): restart the engine and fly it level behind the scenes for 8 s.
        if (init.engineRunning) model.startEnginesSafely(throttle, false);
        for (let i = 0; i < n; i++) fdm.set(model.engineHandles[i]!.throttle, throttle);
        fdm.setByName("fcs/pitch-trim-cmd-norm", 0);
        let sum = 0;
        let count = 0;
        for (let k = 0; k < 120 * 8; k++) {
          const vs = fdm.getByName("velocities/h-dot-fps");
          const q = fdm.getByName("velocities/q-rad_sec");
          const th = fdm.getByName("attitude/theta-deg");
          const roll = fdm.getByName("attitude/phi-deg");
          const p = fdm.getByName("velocities/p-rad_sec");
          const prev = fdm.getByName("fcs/elevator-cmd-norm");
          // JSBSim elevator command: negative = nose up
          const cmd = clamp(fin(prev + vs * 0.0006 + q * 0.08 + Math.max(0, Math.abs(th) - 15) * Math.sign(th) * 0.002, 0), -1, 1);
          fdm.setByName("fcs/elevator-cmd-norm", cmd);
          fdm.setByName("fcs/aileron-cmd-norm", clamp(fin(-roll * 0.05 - p * 0.5, 0), -1, 1));
          model.runSteps(1);
          if (k >= 120 * 5) {
            sum += cmd;
            count++;
          }
        }
        const elev = count ? sum / count : 0;
        fdm.setByName("fcs/elevator-cmd-norm", 0);
        fdm.setByName("fcs/aileron-cmd-norm", 0);
        fdm.setByName("fcs/pitch-trim-cmd-norm", clamp(elev, -1, 1));
        model.initialTrim = { throttle, trim: clamp(-elev, -1, 1) };
      }
      // Wind: the air starts moving (the c172p path re-initialises instead; that would reset the
      // engine regulators of some of these aircraft, so here the wind simply starts blowing).
      const windKt = init.windKt ?? 0;
      if (windKt > 0.1) {
        const dir = ((init.windDirTrue ?? 0) * Math.PI) / 180;
        fdm.setByName("atmosphere/wind-north-fps", -windKt * FPS_PER_KT * Math.cos(dir));
        fdm.setByName("atmosphere/wind-east-fps", -windKt * FPS_PER_KT * Math.sin(dir));
      }
    }
    return model;
  }

  /** Run physics steps during set-up (copies the FlightGear-only inputs first, like `step`). */
  private runSteps(n: number): boolean {
    for (let i = 0; i < n; i++) {
      for (const [d, sIdx] of this.mirrorHandles) this.fdm.set(d, this.fdm.get(sIdx));
      if (!this.fdm.run(1)) return false;
    }
    return true;
  }

  private allEnginesRunning(): boolean {
    const n = Math.max(1, this.aircraft.engines);
    for (let i = 0; i < n; i++) if (!(this.fdm.getByName(`propulsion/engine[${i}]/set-running`) > 0.5)) return false;
    return true;
  }

  /**
   * Start every engine and leave it running at `throttle`: JSBSim's instant start first; engines
   * that do not run after it are started with the starter like a pilot would (up to 10 s of
   * simulated time, brakes on when on the ground). Returns false if an engine would not start.
   */
  private startEnginesSafely(throttle: number, onGround: boolean): boolean {
    const fdm = this.fdm;
    if (fdm.startEngines) fdm.startEngines(throttle, 1);
    else fdm.setByName("propulsion/set-running", -1);
    for (const e of this.engineHandles) fdm.set(e.throttle, throttle);
    if (this.allEnginesRunning()) return true;
    if (onGround) {
      fdm.setByName("fcs/left-brake-cmd-norm", 1);
      fdm.setByName("fcs/right-brake-cmd-norm", 1);
    }
    for (const e of this.engineHandles) fdm.set(e.throttle, 0.25);
    fdm.setByName("propulsion/magneto_cmd", 3);
    fdm.setByName("propulsion/starter_cmd", 1);
    for (let t = 0; t < 10 && !this.allEnginesRunning(); t += 0.25) this.runSteps(30);
    fdm.setByName("propulsion/starter_cmd", 0);
    for (const e of this.engineHandles) fdm.set(e.throttle, throttle);
    if (onGround) {
      this.runSteps(120 * 2);
      fdm.setByName("fcs/left-brake-cmd-norm", 0);
      fdm.setByName("fcs/right-brake-cmd-norm", 0);
    }
    return this.allEnginesRunning();
  }

  private w(path: WritePath, v: number) {
    const h = this.writeHandles.get(path);
    if (h !== undefined && h >= 0) this.fdm.set(h, v);
  }

  setInputs(i: FdmInputs) {
    if (!this.trainer) {
      this.setInputsOther(i);
      return;
    }
    // Every number is checked first: a NaN or infinity from a misbehaving input device or module must
    // never reach the flight model (it would poison the whole state). `fin` replaces such a value.
    this.w("fcs/elevator-cmd-norm", -clamp(fin(i.elevator, 0), -1, 1));
    this.w("fcs/aileron-cmd-norm", clamp(fin(i.aileron, 0), -1, 1));
    this.w("fcs/rudder-cmd-norm", -clamp(fin(i.rudder, 0), -1, 1));
    this.w("fcs/pitch-trim-cmd-norm", -clamp(fin(i.trim, 0), -1, 1));
    this.w("fcs/throttle-cmd-norm", clamp(fin(i.throttle, 0), 0, 1));
    this.w("fcs/mixture-cmd-norm", clamp(fin(i.mixture, 1), 0, 1));
    this.w("fcs/flap-cmd-norm", clamp(fin(i.flapNorm, 0), 0, 1));
    this.w("fcs/left-brake-cmd-norm", clamp(fin(i.brakeLeft, 0), 0, 1));
    this.w("fcs/right-brake-cmd-norm", clamp(fin(i.brakeRight, 0), 0, 1));
    this.w("fcs/center-brake-cmd-norm", 0);
    this.w("propulsion/magneto_cmd", i.magnetos === 1 || i.magnetos === 2 || i.magnetos === 3 ? i.magnetos : 0);
    this.w("propulsion/starter_cmd", i.starter ? 1 : 0);
    this.w("propulsion/tank[0]/priority", i.feedLeft ? 1 : 0);
    this.w("propulsion/tank[1]/priority", i.feedRight ? 1 : 0);
    if (Number.isFinite(i.terrainFt)) this.w("position/terrain-elevation-asl-ft", i.terrainFt);
    this.w("atmosphere/wind-north-fps", clamp(fin(i.windNorthFps, 0), -MAX_WIND_FPS, MAX_WIND_FPS));
    this.w("atmosphere/wind-east-fps", clamp(fin(i.windEastFps, 0), -MAX_WIND_FPS, MAX_WIND_FPS));
    this.w("atmosphere/wind-down-fps", clamp(fin(i.windDownFps, 0), -MAX_WIND_FPS, MAX_WIND_FPS));
    const turb = clamp(fin(i.turbulence, 0), 0, 1);
    this.w("atmosphere/turb-type", turb > 0.001 ? 3 : 0);
    this.w("atmosphere/turbulence/milspec/windspeed_at_20ft_AGL-fps", turb * 45 * FPS_PER_KT * 0.5);
    this.w("atmosphere/turbulence/milspec/severity", Math.round(turb * 6));
    this.w("atmosphere/delta-T", clamp(fin(i.isaDeviationC, 0), -60, 60) * 1.8);
    this.w("atmosphere/P-sl-psf", clamp(fin(i.qnhInHg, 29.92126), 25, 33) * PSF_PER_INHG);
    // Partial power loss (carburettor ice / heat / failures): less air into the cylinders.
    // JSBSim divides by the air flow, so it is never set to exactly zero; a total loss also cuts the fuel.
    const air = airflowFractionForPowerLoss(i.powerLoss);
    this.w("propulsion/engine/volumetric-efficiency", this.baseVolumetricEfficiency * Math.max(MIN_AIRFLOW_FRACTION, air));
    if (air < MIN_AIRFLOW_FRACTION) this.w("fcs/mixture-cmd-norm", 0);
  }

  /** Inputs for every aircraft except the Cessna 172P (same conventions; see `setInputs`). */
  private setInputsOther(i: FdmInputs) {
    const ac = this.aircraft;
    const fdm = this.fdm;
    const rudder = clamp(fin(i.rudder, 0), -1, 1);
    this.w("fcs/elevator-cmd-norm", -clamp(fin(i.elevator, 0), -1, 1));
    this.w("fcs/aileron-cmd-norm", clamp(fin(i.aileron, 0), -1, 1));
    this.w("fcs/rudder-cmd-norm", -rudder);
    // Nose / tail wheel steering follows the rudder pedals (FlightGear does the same for these aircraft).
    this.w("fcs/steer-cmd-norm", rudder);
    this.w("fcs/pitch-trim-cmd-norm", -clamp(fin(i.trim, 0), -1, 1));
    const throttle = clamp(fin(i.throttle, 0), 0, 1);
    let mixture = clamp(fin(i.mixture, 1), 0, 1);
    if (ac.engine === "piston") {
      // Partial power loss: same idea as for the Cessna (less air into the cylinders).
      const air = airflowFractionForPowerLoss(i.powerLoss);
      this.w("propulsion/engine/volumetric-efficiency", this.baseVolumetricEfficiency * Math.max(MIN_AIRFLOW_FRACTION, air));
      if (air < MIN_AIRFLOW_FRACTION) mixture = 0;
    } else {
      // Turbines: the mixture lever stands for the fuel condition lever (fully back = fuel cut off).
      this.w("propulsion/cutoff_cmd", mixture < 0.5 ? 1 : 0);
    }
    for (const e of this.engineHandles) {
      fdm.set(e.throttle, throttle);
      fdm.set(e.mixture, mixture);
      fdm.set(e.advance, 1);
    }
    this.w("fcs/flap-cmd-norm", clamp(fin(i.flapNorm, 0), 0, 1));
    this.w("fcs/left-brake-cmd-norm", clamp(fin(i.brakeLeft, 0), 0, 1));
    this.w("fcs/right-brake-cmd-norm", clamp(fin(i.brakeRight, 0), 0, 1));
    this.w("fcs/center-brake-cmd-norm", 0);
    this.w("propulsion/magneto_cmd", i.magnetos === 1 || i.magnetos === 2 || i.magnetos === 3 ? i.magnetos : 0);
    this.w("propulsion/starter_cmd", i.starter ? 1 : 0);
    if (ac.retractableGear) this.w("gear/gear-cmd-norm", i.gearDown === false ? 0 : 1);
    if (Number.isFinite(i.terrainFt)) this.w("position/terrain-elevation-asl-ft", i.terrainFt);
    this.w("atmosphere/wind-north-fps", clamp(fin(i.windNorthFps, 0), -MAX_WIND_FPS, MAX_WIND_FPS));
    this.w("atmosphere/wind-east-fps", clamp(fin(i.windEastFps, 0), -MAX_WIND_FPS, MAX_WIND_FPS));
    this.w("atmosphere/wind-down-fps", clamp(fin(i.windDownFps, 0), -MAX_WIND_FPS, MAX_WIND_FPS));
    const turb = clamp(fin(i.turbulence, 0), 0, 1);
    this.w("atmosphere/turb-type", turb > 0.001 ? 3 : 0);
    this.w("atmosphere/turbulence/milspec/windspeed_at_20ft_AGL-fps", turb * 45 * FPS_PER_KT * 0.5);
    this.w("atmosphere/turbulence/milspec/severity", Math.round(turb * 6));
    this.w("atmosphere/delta-T", clamp(fin(i.isaDeviationC, 0), -60, 60) * 1.8);
    this.w("atmosphere/P-sl-psf", clamp(fin(i.qnhInHg, 29.92126), 25, 33) * PSF_PER_INHG);
  }

  /** Advance by whole physics steps. Returns false if the model failed (NaN / terminated). */
  step(steps = 1): boolean {
    if (this.disposed) return false;
    if (this.mirrorHandles.length) {
      // FlightGear-only inputs are refreshed before every single step (as FlightGear does every frame).
      for (let k = Math.max(1, Math.round(steps)); k > 0; k--) {
        for (const [d, sIdx] of this.mirrorHandles) this.fdm.set(d, this.fdm.get(sIdx));
        if (!this.fdm.run(1)) return false;
      }
      for (const h of HEALTH_HANDLES) if (!Number.isFinite(this.fdm.get(h))) return false;
      return true;
    }
    if (!this.fdm.run(Math.max(1, Math.round(steps)))) return false;
    // `read()` hides NaN (it reports 0 instead) so that nothing downstream can be poisoned; here the raw
    // numbers are checked so that a numerical failure is reported instead of silently flying on zeros.
    for (const h of HEALTH_HANDLES) if (!Number.isFinite(this.fdm.get(h))) return false;
    return true;
  }

  /** Read the current truth values. The returned object is reused between calls. */
  read(): FdmOutputs {
    this.fdm.readAll(this.buf, READ.length);
    const h = this.m.HEAPF64;
    const o = this.buf / 8;
    const v = (i: number) => {
      const x = h[o + i] ?? 0;
      return Number.isFinite(x) ? x : 0;
    };
    const out = this.out;
    out.lat = v(0);
    out.lon = v(1);
    out.altMslFt = v(2);
    out.aglFt = v(3);
    out.pitch = v(4);
    out.roll = v(5);
    out.headingTrue = ((v(6) % 360) + 360) % 360;
    out.rollRate = v(7) * R2D;
    out.pitchRate = v(8) * R2D;
    out.yawRate = v(9) * R2D;
    out.turnRate = v(10) * R2D;
    out.kcas = Math.max(0, v(11));
    out.ktas = Math.max(0, v(12));
    out.gsKt = v(13) * KT_PER_FPS;
    out.vNorthKt = v(14) * KT_PER_FPS;
    out.vEastKt = v(15) * KT_PER_FPS;
    out.vsFpm = v(16) * 60;
    out.alphaDeg = v(17);
    out.betaDeg = v(18);
    out.nz = -v(19);
    out.ny = v(20);
    out.mach = v(21);
    out.flapsDeg = v(22);
    out.wowNose = v(23) > 0.5;
    out.wowLeft = v(24) > 0.5;
    out.wowRight = v(25) > 0.5;
    out.rpm = v(26);
    out.engineRunning = v(27) > 0.5;
    out.fuelFlowGph = (v(28) * 3600) / LB_PER_GAL_AVGAS;
    out.oilPressPsi = v(29);
    out.oilTempF = v(30);
    out.egtF = v(31);
    out.manifoldInHg = v(32);
    out.powerHp = v(33);
    out.thrustLb = v(34);
    out.fuelLeftGal = v(35) / LB_PER_GAL_AVGAS;
    out.fuelRightGal = v(36) / LB_PER_GAL_AVGAS;
    out.weightLb = v(37);
    out.cgIn = v(38);
    out.staticPressurePsf = v(39);
    out.oatR = v(40);
    out.elevatorRad = v(41);
    out.aileronLeftRad = v(42);
    out.aileronRightRad = v(43);
    out.rudderRad = v(44);
    out.stallHyst = v(45);
    out.simTime = v(46);
    out.chtF = v(47);
    out.n1Pct = 0;
    out.gearPosNorm = 1;
    if (!this.trainer) {
      const ac = this.aircraft;
      if (ac.engine !== "piston") {
        // Jets and turboprops: the engine gauge shows fan / gas-generator speed (N1, Ng) in percent.
        out.n1Pct = v(48);
        out.rpm = out.n1Pct;
      }
      if (ac.retractableGear) out.gearPosNorm = clamp(v(49), 0, 1);
      if (ac.rightAileronFromLeft) out.aileronRightRad = -out.aileronLeftRad;
    }
    return out;
  }

  /** Escape hatch for systems/tests: read or write any JSBSim property by name. */
  getProperty(path: string): number {
    return this.fdm.getByName(path);
  }
  setProperty(path: string, value: number): void {
    this.fdm.setByName(path, value);
  }

  /** Instantly start or stop the engine (lessons / instructor actions). */
  setEngineRunning(on: boolean) {
    if (on && !this.trainer) {
      const throttle = clamp(fin(this.fdm.getByName("fcs/throttle-cmd-norm"), 0), 0, 1);
      this.startEnginesSafely(throttle, false);
      return;
    }
    if (on && this.fdm.startEngines) {
      // settle at the present throttle (JSBSim's own instant start settles at full throttle)
      const throttle = clamp(fin(this.fdm.getByName("fcs/throttle-cmd-norm"), 0), 0, 1);
      if (this.fdm.startEngines(throttle, 1)) return;
    }
    this.fdm.setByName("propulsion/set-running", on ? -1 : 0);
    if (!on) this.fdm.setByName("propulsion/engine/set-running", 0);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.m._free(this.buf);
    this.fdm.delete();
  }
}
