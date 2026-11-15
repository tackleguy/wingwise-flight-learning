/**
 * JSBSim flight dynamics — the physics engine used by the FlightGear simulator — running in the
 * browser as WebAssembly (built by tools/jsbsim-wasm/build.sh into public/jsbsim/).
 *
 * JSBSim is © the JSBSim developers, LGPL-2.1 (https://github.com/JSBSim-Team/jsbsim). It is
 * shipped unmodified (plus one documented data fix, see tools/jsbsim-wasm/build.sh) as a separate
 * module that is loaded at runtime, so it can be replaced as the LGPL requires.
 *
 * This file only maps TeachX conventions onto JSBSim properties:
 *   TeachX elevator + = pull (nose up)      → JSBSim fcs/elevator-cmd-norm − = nose up
 *   TeachX aileron  + = roll right          → JSBSim fcs/aileron-cmd-norm  + = roll right
 *   TeachX rudder   + = yaw right           → JSBSim fcs/rudder-cmd-norm   − = yaw right
 *   TeachX trim     + = nose up             → JSBSim fcs/pitch-trim-cmd-norm − = nose up
 * (signs verified by headless flight tests.)
 */

/** TeachX aircraft that have a matching JSBSim model shipped with TeachX. */
export const JSBSIM_MODELS: Readonly<Record<string, string>> = {
  c172: "c172p",
  pa28: "pa28",
  a320: "A320",
};

export function jsbsimModelFor(perfId: string): string | undefined {
  return JSBSIM_MODELS[perfId];
}

interface FdmHandle {
  loadModel(name: string): boolean;
  setInitial(
    lat: number,
    lon: number,
    altFt: number,
    onGround: boolean,
    terrainFt: number,
    headingDeg: number,
    kcas: number,
    pitchDeg: number,
  ): void;
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

interface JsbsimModule {
  Fdm: new () => FdmHandle;
  HEAPF64: Float64Array;
  _malloc(bytes: number): number;
  _free(ptr: number): void;
}

let modulePromise: Promise<JsbsimModule> | null = null;

/** Default location of the compiled module (served from /public). */
export const JSBSIM_MODULE_URL = "/jsbsim/jsbsim.mjs";

/** Load (once) the JSBSim WebAssembly module. Browser only unless a URL is given (tests). */
export function loadJsbsimModule(url: string = JSBSIM_MODULE_URL): Promise<JsbsimModule> {
  if (!modulePromise) {
    modulePromise = (async () => {
      const mod = (await import(/* @vite-ignore */ url)) as {
        default: (opts?: Record<string, unknown>) => Promise<JsbsimModule>;
      };
      // Resolve jsbsim.wasm / jsbsim.data next to the module itself.
      const base = typeof location !== "undefined" ? new URL(url, location.href) : new URL(url);
      const locateFile = (file: string) => {
        const u = new URL(file, base);
        // Node (tests) reads files from disk and needs a filesystem path.
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

export interface JsbsimInit {
  lat: number;
  lon: number;
  /** ft MSL when airborne; ignored on the ground */
  altMslFt: number;
  onGround: boolean;
  terrainFt: number;
  headingTrue: number;
  kcas: number;
  pitchDeg: number;
}

export interface JsbsimInputs {
  elevator: number;
  aileron: number;
  rudder: number;
  trim: number;
  throttle: number;
  mixture: number;
  /** 0..1 of the flap range */
  flapNorm: number;
  gearDown: boolean;
  brakeLeft: number;
  brakeRight: number;
  /** piston magnetos on (both) */
  magnetos: boolean;
  starter: boolean;
  /** jet fuel cutoff */
  cutoff: boolean;
  /** fuel available to the engine (selector not OFF, no failure) */
  fuelOn: boolean;
  terrainFt: number;
  /** wind velocity TOWARD north/east/down, ft/s */
  windNorthFps: number;
  windEastFps: number;
  windDownFps: number;
  /** temperature deviation from ISA, °R (= °C × 1.8) */
  deltaTR: number;
}

export interface JsbsimState {
  lat: number;
  lon: number;
  altMslFt: number;
  aglFt: number;
  pitch: number;
  bank: number;
  /** true heading */
  heading: number;
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
  alpha: number;
  beta: number;
  nz: number;
  ny: number;
  mach: number;
  flapsDeg: number;
  gearPos: number;
  onGround: boolean;
  rpm: number;
  n1: number;
  running: boolean;
  fuelFlowGph: number;
  oilPsi: number;
  oilTempF: number;
  manifoldInHg: number;
  fuelLeftLbs: number;
  fuelRightLbs: number;
  weightLbs: number;
}

// Properties read every step, in this order.
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
  "gear/gear-pos-norm",
  "gear/unit[0]/WOW",
  "gear/unit[1]/WOW",
  "gear/unit[2]/WOW",
  "propulsion/engine/engine-rpm",
  "propulsion/engine/n1",
  "propulsion/engine/set-running",
  "propulsion/engine/fuel-flow-rate-pps",
  "propulsion/engine/oil-pressure-psi",
  "propulsion/engine/oil-temperature-degF",
  "propulsion/engine/map-inhg",
  "propulsion/tank[0]/contents-lbs",
  "propulsion/tank[1]/contents-lbs",
  "inertia/weight-lbs",
] as const;

const WRITE = [
  "fcs/elevator-cmd-norm",
  "fcs/aileron-cmd-norm",
  "fcs/rudder-cmd-norm",
  "fcs/pitch-trim-cmd-norm",
  "fcs/throttle-cmd-norm",
  "fcs/throttle-cmd-norm[1]",
  "fcs/mixture-cmd-norm",
  "fcs/mixture-cmd-norm[1]",
  "fcs/advance-cmd-norm",
  "fcs/advance-cmd-norm[1]",
  "fcs/flap-cmd-norm",
  "gear/gear-cmd-norm",
  "fcs/left-brake-cmd-norm",
  "fcs/right-brake-cmd-norm",
  "fcs/center-brake-cmd-norm",
  "propulsion/magneto_cmd",
  "propulsion/starter_cmd",
  "propulsion/cutoff_cmd",
  "propulsion/tank[0]/priority",
  "propulsion/tank[1]/priority",
  "position/terrain-elevation-asl-ft",
  "atmosphere/wind-north-fps",
  "atmosphere/wind-east-fps",
  "atmosphere/wind-down-fps",
  "atmosphere/delta-T",
] as const;

const KT_PER_FPS = 1 / 1.68781;
const R2D = 180 / Math.PI;

/** One JSBSim aircraft instance. */
export class JsbsimFdm {
  readonly model: string;
  private readonly m: JsbsimModule;
  private readonly fdm: FdmHandle;
  private readonly readHandles: number[];
  private readonly writeHandles: Map<string, number> = new Map();
  private readonly buf: number;
  private disposed = false;
  readonly dt = 1 / 120;

  private constructor(m: JsbsimModule, fdm: FdmHandle, model: string) {
    this.m = m;
    this.fdm = fdm;
    this.model = model;
    this.readHandles = READ.map((p) => fdm.bind(p, true));
    for (const p of WRITE) this.writeHandles.set(p, fdm.bind(p, true));
    this.buf = m._malloc(READ.length * 8);
  }

  /** Create an aircraft at the given initial conditions; null if the model is unavailable. */
  static async create(perfId: string, init: JsbsimInit, moduleUrl?: string): Promise<JsbsimFdm | null> {
    const model = jsbsimModelFor(perfId);
    if (!model) return null;
    const m = await loadJsbsimModule(moduleUrl);
    const fdm = new m.Fdm();
    if (!fdm.loadModel(model)) {
      const err = fdm.lastError();
      fdm.delete();
      throw new Error(`JSBSim could not load ${model}: ${err || "unknown error"}`);
    }
    // On the ground, place the reference point a few feet above the runway and let it settle on
    // the gear (as JSBSim's own reset files do).
    const groundAgl = model === "A320" ? 10 : 5;
    fdm.setByName("position/terrain-elevation-asl-ft", init.terrainFt);
    fdm.setInitial(
      init.lat,
      init.lon,
      init.onGround ? groundAgl : init.altMslFt,
      init.onGround,
      init.terrainFt,
      init.headingTrue,
      init.onGround ? 0 : init.kcas,
      init.onGround ? 0 : init.pitchDeg,
    );
    if (!fdm.runIC()) {
      const err = fdm.lastError();
      fdm.delete();
      throw new Error(`JSBSim initial conditions failed: ${err || "unknown error"}`);
    }
    fdm.setDt(1 / 120);
    const inst = new JsbsimFdm(m, fdm, model);
    // Variable-pitch propellers: full forward (TeachX has no propeller lever).
    inst.write("fcs/advance-cmd-norm", 1);
    inst.write("fcs/advance-cmd-norm[1]", 1);
    return inst;
  }

  private write(path: (typeof WRITE)[number], v: number) {
    const h = this.writeHandles.get(path);
    if (h !== undefined && h >= 0) this.fdm.set(h, v);
  }

  /** Start the engine(s) instantly (used for airborne / engine-running starts). */
  setRunning() {
    this.fdm.setByName("propulsion/set-running", -1);
  }

  setInputs(i: JsbsimInputs) {
    this.write("fcs/elevator-cmd-norm", -clamp(i.elevator, -1, 1));
    this.write("fcs/aileron-cmd-norm", clamp(i.aileron, -1, 1));
    this.write("fcs/rudder-cmd-norm", -clamp(i.rudder, -1, 1));
    this.write("fcs/pitch-trim-cmd-norm", -clamp(i.trim, -1, 1));
    this.write("fcs/throttle-cmd-norm", clamp(i.throttle, 0, 1));
    this.write("fcs/throttle-cmd-norm[1]", clamp(i.throttle, 0, 1));
    this.write("fcs/mixture-cmd-norm", clamp(i.mixture, 0, 1));
    this.write("fcs/mixture-cmd-norm[1]", clamp(i.mixture, 0, 1));
    this.write("fcs/flap-cmd-norm", clamp(i.flapNorm, 0, 1));
    this.write("gear/gear-cmd-norm", i.gearDown ? 1 : 0);
    this.write("fcs/left-brake-cmd-norm", clamp(i.brakeLeft, 0, 1));
    this.write("fcs/right-brake-cmd-norm", clamp(i.brakeRight, 0, 1));
    this.write("fcs/center-brake-cmd-norm", clamp(Math.max(i.brakeLeft, i.brakeRight), 0, 1));
    this.write("propulsion/magneto_cmd", i.magnetos ? 3 : 0);
    this.write("propulsion/starter_cmd", i.starter ? 1 : 0);
    this.write("propulsion/cutoff_cmd", i.cutoff ? 1 : 0);
    this.write("propulsion/tank[0]/priority", i.fuelOn ? 1 : 0);
    this.write("propulsion/tank[1]/priority", i.fuelOn ? 1 : 0);
    this.write("position/terrain-elevation-asl-ft", i.terrainFt);
    this.write("atmosphere/wind-north-fps", i.windNorthFps);
    this.write("atmosphere/wind-east-fps", i.windEastFps);
    this.write("atmosphere/wind-down-fps", i.windDownFps);
    this.write("atmosphere/delta-T", i.deltaTR);
  }

  /** Advance by a whole number of JSBSim steps (1/120 s). Returns false on model failure. */
  step(steps: number): boolean {
    if (this.disposed) return false;
    return this.fdm.run(Math.max(1, Math.round(steps)));
  }

  read(): JsbsimState {
    this.fdm.readAll(this.buf, READ.length);
    const h = this.m.HEAPF64;
    const o = this.buf / 8;
    const v = (i: number) => {
      const x = h[o + i] ?? 0;
      return Number.isFinite(x) ? x : 0;
    };
    const fuelPps = v(30);
    return {
      lat: v(0),
      lon: v(1),
      altMslFt: v(2),
      aglFt: v(3),
      pitch: v(4),
      bank: v(5),
      heading: ((v(6) % 360) + 360) % 360,
      rollRate: v(7) * R2D,
      pitchRate: v(8) * R2D,
      yawRate: v(9) * R2D,
      turnRate: v(10) * R2D,
      kcas: Math.max(0, v(11)),
      ktas: Math.max(0, v(12)),
      gsKt: v(13) * KT_PER_FPS,
      vNorthKt: v(14) * KT_PER_FPS,
      vEastKt: v(15) * KT_PER_FPS,
      vsFpm: v(16) * 60,
      alpha: v(17),
      beta: v(18),
      nz: -v(19),
      ny: v(20),
      mach: v(21),
      flapsDeg: v(22),
      gearPos: v(23),
      onGround: v(24) > 0.5 || v(25) > 0.5 || v(26) > 0.5,
      rpm: v(27),
      n1: v(28),
      running: v(29) > 0.5,
      // lb/s → US gal/h (avgas ≈ 6.0 lb/gal, Jet-A ≈ 6.7 lb/gal)
      fuelFlowGph: (fuelPps * 3600) / (this.model === "A320" ? 6.7 : 6.0),
      oilPsi: v(31),
      oilTempF: v(32),
      manifoldInHg: v(33),
      fuelLeftLbs: v(34),
      fuelRightLbs: v(35),
      weightLbs: v(36),
    };
  }

  /** Set fuel quantities (lbs) in the two main tanks. */
  setFuel(leftLbs: number, rightLbs: number) {
    this.fdm.setByName("propulsion/tank[0]/contents-lbs", Math.max(0, leftLbs));
    this.fdm.setByName("propulsion/tank[1]/contents-lbs", Math.max(0, rightLbs));
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.m._free(this.buf);
    this.fdm.delete();
  }
}

function clamp(v: number, lo: number, hi: number) {
  return v < lo ? lo : v > hi ? hi : v;
}
