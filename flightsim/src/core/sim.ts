/**
 * The simulator core. ONE `Sim` owns the state, the pilot controls, the weather, the flight model
 * and the list of feature modules, and advances everything on a FIXED physics time step
 * (120 steps per second) that is independent of how fast the graphics are drawn.
 *
 * Per physics step:   controls → fdmIn defaults → modules.preStep → JSBSim → truth state → modules.postStep
 * Per drawn frame:    N physics steps (as many as real time requires) → modules.frame
 */
import type { WorldData } from "@/data/world-data";
import { FlightModel, loadJsbsim, type FdmInputs, type JsbsimModule } from "@/physics/jsbsim";
import type { ElevationService } from "@/world/elevation";
import { cloudDensityAt } from "./clouds";
import { getAircraft, type Aircraft, type StrikePart } from "@/aircraft/catalog";
import { DEFAULT_SETTINGS, defaultControls, defaultEnvironment, initialState } from "./defaults";
import { EventBus } from "./events";
import { magneticVariation } from "./magvar";
import { D2R, FPS_PER_KT, R2D, clamp, densityAltitudeFt, isaTempC, norm360, pressureAltitudeFt, pressureAtAltitudeInHg } from "./math";
import { planSpawn, type SpawnPlan } from "./spawn";
import { loadJson, saveJson } from "./storage";
import type { ControlState, CrashCause, Environment, Settings, SimEvents, SimState, SpawnRequest, SpawnResult } from "./types";

/** A feature module plugged into the simulator. Every hook is optional. */
export interface SimModule {
  readonly name: string;
  /**
   * Just before every (re)positioning: the plan (airport, runway, start position) is known but the
   * flight model has not been created yet. A module may adjust `sim.env` here — the weather module
   * turns a "crosswind" preset to the new runway — so the aircraft starts in its final weather.
   */
  beforeSpawn?(sim: Sim, plan: SpawnPlan): void;
  /** After every (re)positioning of the aircraft, before the first physics step. */
  onSpawn?(sim: Sim, result: SpawnResult): void;
  /** Fixed step, BEFORE physics: may adjust `sim.fdmIn` (what is sent to the flight model). */
  preStep?(sim: Sim, dt: number): void;
  /** Fixed step, AFTER physics: derive values from the new truth state. */
  postStep?(sim: Sim, dt: number): void;
  /** Once per drawn frame, also while paused. `dtReal` is real seconds since the previous frame. */
  frame?(sim: Sim, dtReal: number): void;
  dispose?(): void;
}

const PSF_PER_INHG = 70.7262;
const MAX_STEPS_PER_FRAME = 60; // half a second of flight per drawn frame at most (slow machines run in slow motion)

/** Mean wind (no gusts) at an altitude, interpolated between the weather's wind layers. */
export function windAt(env: Environment, altFtMsl: number): { dirTrue: number; kt: number } {
  const layers = env.wind;
  const first = layers[0];
  if (!first) return { dirTrue: 0, kt: 0 };
  let lo = first;
  let hi = first;
  for (const l of layers) {
    if (l.altFtMsl <= altFtMsl) lo = l;
    if (l.altFtMsl >= altFtMsl) {
      hi = l;
      break;
    }
    hi = l;
  }
  if (lo === hi || hi.altFtMsl <= lo.altFtMsl) return { dirTrue: lo.dirTrue, kt: lo.kt };
  const t = clamp((altFtMsl - lo.altFtMsl) / (hi.altFtMsl - lo.altFtMsl), 0, 1);
  const n = lo.kt * Math.cos(lo.dirTrue * D2R) * (1 - t) + hi.kt * Math.cos(hi.dirTrue * D2R) * t;
  const e = lo.kt * Math.sin(lo.dirTrue * D2R) * (1 - t) + hi.kt * Math.sin(hi.dirTrue * D2R) * t;
  return { dirTrue: norm360(Math.atan2(e, n) * R2D), kt: Math.hypot(n, e) };
}

/** Temperature difference from the standard atmosphere, °C, for the current weather. */
export const isaDeviationC = (env: Environment) => env.tempC - isaTempC(env.stationElevFt);

/**
 * Sea-level pressure to give the flight model so that an altimeter set to the reported altimeter
 * setting (QNH) reads the field elevation at the weather station — which is how QNH is defined.
 * Away from the station, non-standard temperature produces the real-world altimeter errors.
 */
export function modelSeaLevelPressureInHg(env: Environment): number {
  const stationPressure = pressureAtAltitudeInHg(env.stationElevFt + pressureAltitudeFt(env.qnhInHg));
  const t0 = 288.15 + isaDeviationC(env);
  const ratio = Math.pow(Math.max(0.2, 1 - (0.0019812 * env.stationElevFt) / t0), 5.25588);
  return stationPressure / ratio;
}

export interface SimOptions {
  data: WorldData;
  elevation: ElevationService;
  /** URL of jsbsim.mjs (defaults to ./jsbsim/jsbsim.mjs next to the page). */
  jsbsimUrl?: string;
}

export class Sim {
  readonly state: SimState = initialState();
  readonly controls: ControlState = defaultControls();
  readonly env: Environment = defaultEnvironment();
  readonly settings: Settings = { ...DEFAULT_SETTINGS, ...loadJson<Partial<Settings>>("settings", {}) };
  readonly events = new EventBus<SimEvents>();
  readonly data: WorldData;
  readonly elevation: ElevationService;
  /** The aircraft being flown (chosen with `setAircraft`, remembered in the settings). */
  get aircraft(): Aircraft {
    // read on every physics step: look it up only when the setting changed
    let c = this.aircraftCache;
    if (!c || c.key !== this.settings.aircraft) c = this.aircraftCache = { key: this.settings.aircraft, ac: getAircraft(this.settings.aircraft) };
    return c.ac;
  }
  private aircraftCache: { key: string | undefined; ac: Aircraft } | null = null;
  /** What is sent to the flight model on the next step. Filled from `controls`/`env`, then adjusted by modules. */
  readonly fdmIn: FdmInputs = {
    elevator: 0,
    aileron: 0,
    rudder: 0,
    trim: 0,
    throttle: 0,
    mixture: 1,
    flapNorm: 0,
    brakeLeft: 0,
    brakeRight: 0,
    magnetos: 3,
    starter: false,
    powerLoss: 0,
    feedLeft: true,
    feedRight: true,
    terrainFt: 0,
    windNorthFps: 0,
    windEastFps: 0,
    windDownFps: 0,
    turbulence: 0,
    isaDeviationC: 0,
    qnhInHg: 29.92,
  };
  /** The JSBSim aircraft (null until the first spawn). Modules may read/write extra properties through it. */
  fdm: FlightModel | null = null;
  lastSpawn: SpawnResult | null = null;
  lastPlan: SpawnPlan | null = null;
  /** Weight and balance used at the next spawn: fuel per tank (US gal) and cabin load in lb [pilot, front passenger, rear-left, rear-right, baggage]. */
  readonly loading: { fuelLeftGal: number; fuelRightGal: number; payloadLb: [number, number, number, number, number] } = {
    fuelLeftGal: 20,
    fuelRightGal: 20,
    payloadLb: [170, 0, 0, 0, 0],
  };
  /** 1 = real time. */
  timeScale = 1;
  /** True while a spawn is loading terrain / creating the flight model. */
  spawning = false;

  private _paused = false;
  private readonly modules: SimModule[] = [];
  private jsb: JsbsimModule | null = null;
  private readonly jsbsimUrl?: string;
  private acc = 0;
  private terrainFt = 0;
  private terrainTarget = 0;
  private stepCount = 0;
  private airborneSec = 0;
  private groundSec = 0;
  private wasAirborne = false;
  private minVsRecent = 0;
  private lastAirKcas = 0;
  private lastTailStrikeMsg = -999;
  private stallStartAlt = 0;
  private stallMinAlt = 0;
  private magVarAt = { lat: 999, lon: 999 };
  private spawnToken = 0;

  constructor(opts: SimOptions) {
    this.data = opts.data;
    this.elevation = opts.elevation;
    this.jsbsimUrl = opts.jsbsimUrl;
  }

  // ------------------------------------------------------------------ modules

  /** Register a module. Modules run in the order they were added. */
  use<T extends SimModule>(module: T): T {
    this.modules.push(module);
    if (this.lastSpawn) module.onSpawn?.(this, this.lastSpawn);
    return module;
  }

  module<T extends SimModule = SimModule>(name: string): T | undefined {
    return this.modules.find((m) => m.name === name) as T | undefined;
  }

  // ------------------------------------------------------------------ pause / settings

  get paused(): boolean {
    return this._paused;
  }

  setPaused(paused: boolean): void {
    if (paused === this._paused) return;
    this._paused = paused;
    this.events.emit("pause", { paused });
  }

  /** Choose the aircraft for the next spawn (the current flight continues until then). */
  setAircraft(id: string): void {
    this.updateSettings({ aircraft: getAircraft(id).id });
  }

  updateSettings(patch: Partial<Settings>): void {
    Object.assign(this.settings, patch);
    saveJson("settings", this.settings);
  }

  message(text: string, level: "info" | "coach" | "warn" = "info", speak = false): void {
    this.events.emit("message", { text, level, speak });
  }

  // ------------------------------------------------------------------ spawning

  /** Preload the flight model so the first spawn is quick. */
  async preload(): Promise<void> {
    this.jsb ??= await loadJsbsim(this.jsbsimUrl);
  }

  /** Put the aircraft somewhere new: on a runway, on final, in the air, or parked. */
  async spawn(req: SpawnRequest): Promise<SpawnResult> {
    const token = ++this.spawnToken;
    this.spawning = true;
    try {
      const ac = this.aircraft;
      const plan = planSpawn(req, this.data, this.env, ac);
      await Promise.all([this.preload(), this.elevation.ensure(plan.lat, plan.lon, 1.5).catch(() => undefined)]);
      if (plan.refLat !== plan.lat || plan.refLon !== plan.lon) await this.elevation.ensure(plan.refLat, plan.refLon, 0.5).catch(() => undefined);
      if (token !== this.spawnToken) throw new Error("Superseded by a newer spawn request.");
      for (const m of this.modules) m.beforeSpawn?.(this, plan);
      const jsb = this.jsb!;

      const ground = this.elevation.groundFt(plan.lat, plan.lon) ?? plan.fallbackElevFt;
      const refGround = this.elevation.groundFt(plan.refLat, plan.refLon) ?? plan.fallbackElevFt;
      let altFtMsl = ground + ac.cgHeightFt;
      if (!plan.onGround) {
        altFtMsl = plan.altFtMsl ?? refGround + (plan.heightAboveRefFt ?? 3000);
        altFtMsl = Math.max(altFtMsl, ground + 300);
      }

      // --- controls for the new situation
      const c = this.controls;
      c.elevator = c.aileron = c.rudder = 0;
      c.trim = plan.onGround && ac.takeoffTrim ? ac.takeoffTrim : 0;
      c.flapIndex = Math.min(plan.flapIndex, ac.flapDetentsDeg.length - 1);
      c.gearDown = plan.onGround || !ac.retractableGear;
      c.throttle = plan.onGround ? 0 : 0.6;
      c.mixture = plan.engineRunning ? 1 : 0;
      c.carbHeat = false;
      c.brakeLeft = c.brakeRight = 0;
      c.parkingBrake = plan.parkingBrake;
      c.ignition = plan.engineRunning ? 3 : 0;
      c.masterBattery = c.masterAlternator = c.avionicsMaster = plan.engineRunning;
      c.fuelSelector = "both";
      c.altimeterInHg = Math.round(this.env.qnhInHg * 100) / 100;
      c.dgAdjustDeg = 0;

      // --- flight model
      this.state.altMslFt = altFtMsl;
      this.terrainFt = this.terrainTarget = ground;
      this.fillInputs();
      const fdm = FlightModel.createSync(jsb, {
        aircraft: ac,
        lat: plan.lat,
        lon: plan.lon,
        altMslFt: altFtMsl,
        onGround: plan.onGround,
        terrainFt: ground,
        headingTrue: plan.headingTrue,
        kcas: plan.kias,
        engineRunning: plan.engineRunning,
        fuelLeftGal: this.loading.fuelLeftGal,
        fuelRightGal: this.loading.fuelRightGal,
        payloadLb: this.loading.payloadLb,
        gammaDeg: plan.gammaDeg,
        flapNorm: (ac.flapDetentsDeg[c.flapIndex] ?? 0) / ac.flapMaxDeg,
        windDirTrue: windAt(this.env, altFtMsl).dirTrue,
        windKt: windAt(this.env, altFtMsl).kt,
        seaLevelPressureInHg: modelSeaLevelPressureInHg(this.env),
        isaDeviationC: isaDeviationC(this.env),
      });
      this.fdm?.dispose();
      this.fdm = fdm;
      if (!plan.onGround) {
        // Start trimmed, hands-off, at the requested speed and flight path.
        const trimmed = fdm.initialTrim;
        if (trimmed) {
          c.throttle = clamp(trimmed.throttle, 0, 1);
          c.trim = clamp(trimmed.trim, -1, 1);
        }
      }

      // --- reset bookkeeping
      const s = this.state;
      s.time = 0;
      s.distanceNm = 0;
      s.crash = null;
      s.stalled = false;
      this.acc = 0;
      this.stepCount = 0;
      this.terrainFt = this.terrainTarget = ground;
      this.airborneSec = plan.onGround ? 0 : 5;
      this.groundSec = plan.onGround ? 5 : 0;
      this.wasAirborne = !plan.onGround;
      this.minVsRecent = 0;
      this.magVarAt = { lat: 999, lon: 999 };
      // One physics step so every value (airspeed with wind, engine, gear) is valid from the first frame.
      this.fillInputs();
      fdm.setInputs(this.fdmIn);
      fdm.step(1);
      this.readTruth(0);

      const result: SpawnResult = {
        request: req,
        airportIdent: plan.airportIdent,
        runwayEndId: plan.runwayEndId,
        lat: plan.lat,
        lon: plan.lon,
        altFtMsl,
        headingTrue: plan.headingTrue,
        onGround: plan.onGround,
      };
      this.lastSpawn = result;
      this.lastPlan = plan;
      for (const m of this.modules) m.onSpawn?.(this, result);
      this.events.emit("spawn", result);
      if (plan.note) this.message(plan.note, "info");
      return result;
    } finally {
      if (token === this.spawnToken) this.spawning = false;
    }
  }

  /** Instant reset to short final for the runway in use (or the best runway of the nearest airport). */
  async resetToShortFinal(finalNm = 1.5): Promise<SpawnResult> {
    const last = this.lastSpawn;
    if (last?.airportIdent && last.runwayEndId) return this.spawn({ kind: "final", airportIdent: last.airportIdent, runwayEndId: last.runwayEndId, finalNm });
    const near = this.data.nearestAirport(this.state.lat, this.state.lon, { withRunwaysOnly: true, maxNm: 200 });
    if (near) return this.spawn({ kind: "final", airportIdent: near.ident, finalNm });
    return this.spawn({ kind: "air", lat: this.state.lat, lon: this.state.lon, headingTrue: this.state.headingTrue });
  }

  // ------------------------------------------------------------------ main loop

  /** Call once per drawn frame with the real time since the previous frame, seconds. */
  frame(dtReal: number): void {
    const dt = clamp(dtReal, 0, 0.25);
    if (this.fdm && !this._paused && !this.spawning && !this.state.crash) {
      this.acc += dt * this.timeScale;
      let steps = Math.floor(this.acc / FlightModel.DT);
      this.acc -= steps * FlightModel.DT;
      if (steps > MAX_STEPS_PER_FRAME) {
        steps = MAX_STEPS_PER_FRAME;
        this.acc = 0;
      }
      for (let i = 0; i < steps && !this.state.crash; i++) this.fixedStep();
      if (this.env.timeRunning) this.env.utcMs += dt * 1000 * this.timeScale;
    }
    for (const m of this.modules) {
      try {
        m.frame?.(this, dtReal);
      } catch (err) {
        console.error(`[SkyReady] module "${m.name}" frame() failed`, err);
      }
    }
  }

  /** Advance exactly `seconds` of simulated time (tests and tools; ignores pause). */
  advance(seconds: number): void {
    const steps = Math.round(seconds / FlightModel.DT);
    for (let i = 0; i < steps && this.fdm && !this.state.crash; i++) this.fixedStep();
  }

  private fillInputs(): void {
    const c = this.controls;
    const f = this.fdmIn;
    const env = this.env;
    f.elevator = c.elevator;
    f.aileron = c.aileron;
    f.rudder = c.rudder;
    f.trim = c.trim;
    f.throttle = c.throttle;
    f.mixture = c.mixture;
    const ac = this.aircraft;
    f.flapNorm = (ac.flapDetentsDeg[c.flapIndex] ?? 0) / ac.flapMaxDeg;
    f.gearDown = c.gearDown;
    const pb = c.parkingBrake ? 1 : 0;
    f.brakeLeft = Math.max(c.brakeLeft, pb);
    f.brakeRight = Math.max(c.brakeRight, pb);
    f.magnetos = c.ignition >= 3 ? 3 : (c.ignition as 0 | 1 | 2);
    f.starter = c.ignition === 4;
    f.powerLoss = 0;
    f.feedLeft = c.fuelSelector === "left" || c.fuelSelector === "both";
    f.feedRight = c.fuelSelector === "right" || c.fuelSelector === "both";
    f.terrainFt = this.terrainFt;
    const w = windAt(env, this.state.altMslFt);
    f.windNorthFps = -w.kt * Math.cos(w.dirTrue * D2R) * FPS_PER_KT;
    f.windEastFps = -w.kt * Math.sin(w.dirTrue * D2R) * FPS_PER_KT;
    f.windDownFps = 0;
    f.turbulence = env.turbulence;
    f.isaDeviationC = isaDeviationC(env);
    f.qnhInHg = modelSeaLevelPressureInHg(env);
  }

  private fixedStep(): void {
    const fdm = this.fdm;
    if (!fdm) return;
    const dt = FlightModel.DT;
    const s = this.state;
    this.stepCount++;

    // Ground height under the aircraft (every step near the ground, less often when high).
    if (s.aglFt < 1500 || this.stepCount % 12 === 0) {
      const g = this.elevation.groundFt(s.lat, s.lon);
      if (g !== null) this.terrainTarget = g;
    }
    if (this.stepCount % 120 === 0) this.elevation.prefetch(s.lat, s.lon);
    if (s.onGround) {
      // On the ground the surface may only move gently under the wheels (protects against data pop-in).
      const maxDelta = 8 * dt;
      this.terrainFt += clamp(this.terrainTarget - this.terrainFt, -maxDelta, maxDelta);
    } else {
      this.terrainFt = this.terrainTarget;
    }

    this.fillInputs();
    for (const m of this.modules) m.preStep?.(this, dt);
    fdm.setInputs(this.fdmIn);
    const ok = fdm.step(1);
    this.readTruth(dt);
    if (!ok || !Number.isFinite(s.lat + s.lon + s.altMslFt + s.pitch + s.roll)) {
      this.crash("The flight model became unstable.", "unstable");
      return;
    }
    this.detect(dt);
    for (const m of this.modules) m.postStep?.(this, dt);
  }

  private readTruth(dt: number): void {
    const fdm = this.fdm;
    if (!fdm) return;
    const o = fdm.read();
    const s = this.state;
    const f = this.fdmIn;
    s.time += dt;
    s.lat = o.lat;
    s.lon = o.lon;
    s.altMslFt = o.altMslFt;
    s.groundElevFt = this.terrainFt;
    s.aglFt = Math.max(0, o.altMslFt - this.terrainFt - this.aircraft.cgHeightFt);
    s.headingTrue = o.headingTrue;
    s.pitch = o.pitch;
    s.roll = o.roll;
    s.rollRate = o.rollRate;
    s.pitchRate = o.pitchRate;
    s.yawRate = o.yawRate;
    s.turnRate = o.turnRate;
    s.kcas = o.kcas;
    s.ktas = o.ktas;
    s.gsKt = o.gsKt;
    s.vNorthKt = o.vNorthKt;
    s.vEastKt = o.vEastKt;
    s.trackTrue = o.gsKt > 1 ? norm360(Math.atan2(o.vEastKt, o.vNorthKt) * R2D) : o.headingTrue;
    s.vsFpm = o.vsFpm;
    s.alphaDeg = o.alphaDeg;
    s.betaDeg = o.betaDeg;
    s.nz = o.nz;
    s.ny = o.ny;
    s.mach = o.mach;
    s.onGround = o.wowNose || o.wowLeft || o.wowRight;
    s.flapsDeg = o.flapsDeg;
    s.rpm = o.rpm;
    s.n1Pct = o.n1Pct;
    s.gearPosNorm = o.gearPosNorm;
    s.manifoldInHg = o.manifoldInHg;
    s.fuelFlowGph = o.fuelFlowGph;
    s.powerHp = o.powerHp;
    s.thrustLb = o.thrustLb;
    s.oilTempF = o.oilTempF;
    s.oilPressPsi = o.oilPressPsi;
    s.egtF = o.egtF;
    s.chtF = o.chtF;
    s.fuelLeftGal = o.fuelLeftGal;
    s.fuelRightGal = o.fuelRightGal;
    s.weightLb = o.weightLb;
    s.cgIn = o.cgIn;
    s.surfaces.elevatorDeg = -o.elevatorRad * R2D;
    s.surfaces.aileronLeftDeg = o.aileronLeftRad * R2D;
    s.surfaces.aileronRightDeg = o.aileronRightRad * R2D;
    s.surfaces.rudderDeg = -o.rudderRad * R2D;
    s.oatC = (o.oatR - 491.67) / 1.8;
    s.staticPressureInHg = o.staticPressurePsf / PSF_PER_INHG;
    s.pressureAltFt = pressureAltitudeFt(s.staticPressureInHg);
    s.densityAltFt = densityAltitudeFt(s.pressureAltFt, s.oatC);
    const wn = -f.windNorthFps;
    const we = -f.windEastFps;
    s.windKt = Math.hypot(wn, we) / FPS_PER_KT;
    s.windDirTrue = s.windKt > 0.05 ? norm360(Math.atan2(we, wn) * R2D) : 0;
    if (Math.abs(s.lat - this.magVarAt.lat) > 0.05 || Math.abs(s.lon - this.magVarAt.lon) > 0.05) {
      s.magVar = magneticVariation(s.lat, s.lon);
      this.magVarAt = { lat: s.lat, lon: s.lon };
    }
    s.distanceNm += (o.gsKt * dt) / 3600;
    s.sys.engineRunning = o.engineRunning;
    s.inCloud = this.stepCount % 6 === 0 ? cloudDensityAt(this.env, s.lat, s.lon, s.altMslFt) : s.inCloud;
  }

  private crash(reason: string, cause: CrashCause): void {
    const s = this.state;
    if (s.crash) return;
    s.crash = { reason, timeSec: s.time, cause };
    this.events.emit("crash", s.crash);
  }

  /** Lift-off, touchdown, stall and crash detection. */
  private detect(dt: number): void {
    const s = this.state;
    const fdm = this.fdm!;

    // --- flew into rising terrain
    const ac = this.aircraft;
    if (!s.onGround && this.wasAirborne && s.altMslFt - ac.cgHeightFt < this.terrainFt - 6) {
      this.crash("Flew into terrain.", "terrain");
      return;
    }

    if (s.onGround) {
      this.groundSec += dt;
      if (this.wasAirborne && this.airborneSec > 1) {
        // Touchdown: judge it by the sink rate just before the wheels touched.
        const vs = Math.min(this.minVsRecent, s.vsFpm);
        const info = {
          vsFpm: vs,
          kcas: this.lastAirKcas,
          rollDeg: s.roll,
          pitchDeg: s.pitch,
          driftDeg: ((s.headingTrue - s.trackTrue + 540) % 360) - 180,
          lat: s.lat,
          lon: s.lon,
          headingTrue: s.headingTrue,
          gLoad: s.nz,
        };
        this.events.emit("touchdown", info);
        if (vs < -1000) this.crash(`Hit the ground too hard (${Math.round(-vs)} feet per minute).`, "hard-landing");
        else if (Math.abs(s.roll) > 25) this.crash("A wing struck the ground on touchdown.", "wing-strike");
        else if (s.pitch < -12) this.crash("Landed on the nose wheel and nosed over.", "nose-over");
        else if (vs < -600) this.message(`Hard landing: ${Math.round(-vs)} feet per minute.`, "warn");
      }
      if (this.wasAirborne) {
        this.wasAirborne = false;
        this.airborneSec = 0;
      }
      // Structure touching the ground (checked ten times a second while rolling).
      if (this.stepCount % 12 === 0 && !s.crash) {
        // Which non-wheel contact points of this aircraft touch the ground (see the aircraft catalog).
        let struck: StrikePart | null = null;
        for (const st of ac.strikes) {
          if (fdm.getProperty(`gear/unit[${st.unit}]/WOW`) <= 0.5) continue;
          if (st.part === "nose" && s.gsKt <= 15) continue;
          if (st.part === "tail") {
            if (s.time - this.lastTailStrikeMsg > 10) {
              this.lastTailStrikeMsg = s.time;
              this.message("Tail strike — the tail touched the runway. Raise the nose less steeply.", "warn");
            }
            continue;
          }
          if (struck === null || st.part === "wing") struck = st.part;
        }
        if (struck === "wing") this.crash("A wing tip struck the ground.", "wing-strike");
        else if (struck === "nose") this.crash("The nose struck the ground.", "nose-strike");
        else if (struck === "engine") this.crash("An engine struck the ground.", "engine-strike");
        else if (struck === "propeller") this.crash("The propeller struck the ground.", "propeller-strike");
        else if (struck === "body") this.crash("The aircraft's body struck the ground.", "body-strike");
        else if (Math.abs(s.roll) > 40 || s.pitch < -25 || s.pitch > 40) this.crash("The aircraft overturned.", "overturn");
      }
    } else {
      this.airborneSec += dt;
      this.lastAirKcas = s.kcas;
      // remember the worst sink rate over roughly the last quarter second
      this.minVsRecent = Math.min(s.vsFpm, this.minVsRecent + 6000 * dt);
      if (!this.wasAirborne && this.airborneSec > 0.4) {
        this.wasAirborne = true;
        this.groundSec = 0;
        this.minVsRecent = s.vsFpm;
        this.events.emit("liftoff", { kcas: s.kcas });
      }
      if (!this.wasAirborne) this.minVsRecent = s.vsFpm;
    }

    // --- aerodynamic stall (critical angle of attack exceeded)
    const airborne = !s.onGround && s.aglFt > 3;
    if (!s.stalled && airborne && s.alphaDeg > ac.stallAlphaDeg && s.kcas > 15) {
      s.stalled = true;
      this.stallStartAlt = this.stallMinAlt = s.altMslFt;
      this.events.emit("stall", { kcas: s.kcas, altMslFt: s.altMslFt });
    } else if (s.stalled) {
      this.stallMinAlt = Math.min(this.stallMinAlt, s.altMslFt);
      if (!airborne || (s.alphaDeg < ac.stallAlphaDeg - 4 && s.vsFpm > -300)) {
        s.stalled = false;
        if (airborne) this.events.emit("stallRecovered", { altitudeLostFt: Math.max(0, this.stallStartAlt - this.stallMinAlt) });
      }
    }
  }

  dispose(): void {
    for (const m of this.modules) m.dispose?.();
    this.modules.length = 0;
    this.fdm?.dispose();
    this.fdm = null;
    this.events.clear();
  }
}
