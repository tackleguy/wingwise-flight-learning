/**
 * Flight dynamics: JSBSim — the open-source flight model used by the FlightGear simulator —
 * compiled to WebAssembly (public/jsbsim/, built by tools/jsbsim-wasm in the repository root).
 *
 * JSBSim is © the JSBSim developers, LGPL-2.1. It is shipped as a separate, replaceable module.
 * This file is TeachX's thin adapter: it converts TeachX conventions to JSBSim properties.
 *
 *   TeachX elevator + = pull (nose up)   → fcs/elevator-cmd-norm   − = nose up
 *   TeachX aileron  + = roll right       → fcs/aileron-cmd-norm    + = roll right
 *   TeachX rudder   + = yaw right        → fcs/rudder-cmd-norm     − = yaw right
 *   TeachX trim     + = nose up          → fcs/pitch-trim-cmd-norm − = nose up
 * (verified by flight tests in tests/physics.)
 */
import { FPS_PER_KT, KT_PER_FPS, LB_PER_GAL_AVGAS, R2D } from "@/core/math";

interface FdmHandle {
  loadModel(name: string): boolean;
  setInitial(lat: number, lon: number, altFt: number, onGround: boolean, terrainFt: number, headingDeg: number, kcas: number, pitchDeg: number): void;
  runIC(): boolean;
  setDt(dt: number): void;
  run(steps: number): boolean;
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
] as const;
type WritePath = (typeof WRITE)[number];

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
const PSF_PER_INHG = 70.7262;

/** One JSBSim aircraft instance (the C172P). Create a new one for every (re)spawn. */
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

  private constructor(m: JsbsimModule, fdm: FdmHandle) {
    this.m = m;
    this.fdm = fdm;
    for (const p of READ) fdm.bind(p, true);
    for (const p of WRITE) this.writeHandles.set(p, fdm.bind(p, true));
    this.buf = m._malloc(READ.length * 8);
    this.out = {} as FdmOutputs;
  }

  static async create(init: FdmInit, moduleUrl?: string): Promise<FlightModel> {
    const m = await loadJsbsim(moduleUrl);
    return FlightModel.createSync(m, init);
  }

  /** Synchronous creation once the module is loaded (used for instant repositioning). */
  static createSync(m: JsbsimModule, init: FdmInit): FlightModel {
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
    const model = new FlightModel(m, fdm);
    model.initialTrim = initialTrim;
    return model;
  }

  private w(path: WritePath, v: number) {
    const h = this.writeHandles.get(path);
    if (h !== undefined && h >= 0) this.fdm.set(h, v);
  }

  setInputs(i: FdmInputs) {
    this.w("fcs/elevator-cmd-norm", -clamp(i.elevator, -1, 1));
    this.w("fcs/aileron-cmd-norm", clamp(i.aileron, -1, 1));
    this.w("fcs/rudder-cmd-norm", -clamp(i.rudder, -1, 1));
    this.w("fcs/pitch-trim-cmd-norm", -clamp(i.trim, -1, 1));
    this.w("fcs/throttle-cmd-norm", clamp(i.throttle, 0, 1));
    this.w("fcs/mixture-cmd-norm", clamp(i.mixture, 0, 1));
    this.w("fcs/flap-cmd-norm", clamp(i.flapNorm, 0, 1));
    this.w("fcs/left-brake-cmd-norm", clamp(i.brakeLeft, 0, 1));
    this.w("fcs/right-brake-cmd-norm", clamp(i.brakeRight, 0, 1));
    this.w("fcs/center-brake-cmd-norm", 0);
    this.w("propulsion/magneto_cmd", i.magnetos);
    this.w("propulsion/starter_cmd", i.starter ? 1 : 0);
    this.w("propulsion/tank[0]/priority", i.feedLeft ? 1 : 0);
    this.w("propulsion/tank[1]/priority", i.feedRight ? 1 : 0);
    this.w("position/terrain-elevation-asl-ft", i.terrainFt);
    this.w("atmosphere/wind-north-fps", i.windNorthFps);
    this.w("atmosphere/wind-east-fps", i.windEastFps);
    this.w("atmosphere/wind-down-fps", i.windDownFps);
    const turb = clamp(i.turbulence, 0, 1);
    this.w("atmosphere/turb-type", turb > 0.001 ? 3 : 0);
    this.w("atmosphere/turbulence/milspec/windspeed_at_20ft_AGL-fps", turb * 45 * FPS_PER_KT * 0.5);
    this.w("atmosphere/turbulence/milspec/severity", Math.round(turb * 6));
    this.w("atmosphere/delta-T", i.isaDeviationC * 1.8);
    this.w("atmosphere/P-sl-psf", i.qnhInHg * PSF_PER_INHG);
  }

  /** Advance by whole physics steps. Returns false if the model failed (NaN / terminated). */
  step(steps = 1): boolean {
    if (this.disposed) return false;
    return this.fdm.run(Math.max(1, Math.round(steps)));
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
