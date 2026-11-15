/**
 * SimEngine — the single source of truth for a simulated flight.
 *
 *   const sim = new SimEngine({ perfId: "c172", start, weather });
 *   sim.start();                      // begins the requestAnimationFrame loop (browser only)
 *   sim.subscribe(() => sim.getSnapshot());
 *   sim.setControls({ throttle: 1 });
 *
 * Flight model (simplified, educational):
 *   - Point-mass equations along the flight path: dV/dt = (T−D)/m − g·sinγ ;
 *     dγ/dt = (L·cosφ − W·cosγ)/(m·V) ; dψ/dt = L·sinφ/(m·V·cosγ).
 *   - Lift/drag from CL(α) with flaps, stall beyond critical AoA, induced drag CL²/(π·AR·e).
 *   - Pitch is modelled as a stable aircraft that seeks the angle of attack commanded by
 *     elevator + trim (so a trimmed aircraft holds an airspeed, as real light aircraft do).
 *   - Propeller thrust from power (density-corrected), jet thrust from N1.
 *   - Ground roll with rolling friction, brakes, nosewheel steering, rotation and liftoff.
 */
import { getPerf } from "@/lib/data/aircraft-perf";
import type { AircraftPerf } from "@/lib/data/types";
import {
  clamp,
  destinationPoint,
  distanceNm,
  FT_PER_NM,
  KT_TO_FPS,
  norm180,
  norm360,
  toDeg,
  toRad,
} from "@/lib/geo";
import { autopilotStep, INITIAL_AP, INITIAL_AP_INTERNAL, type ApInternal } from "./autopilot";
import {
  densityAltitude,
  densityRatio,
  G,
  oatAt,
  pressureAltitude,
  RHO0,
  smoothNoise,
  speedOfSoundKt,
  terrainElevationFt,
  windAt,
} from "./environment";
import { computeNav, type TrainingNdb } from "./navigation";
import { calibratedAirspeedKt, SteamInstruments, type InstrumentInputs } from "./instruments";
import type {
  AircraftState,
  AutopilotState,
  Controls,
  Failures,
  GpsState,
  Indicated,
  PanelKind,
  LateralMode,
  Radios,
  SimEvent,
  SimSnapshot,
  StartState,
  VerticalMode,
  Waypoint,
  WeatherState,
} from "./types";

const CARBURETED = new Set(["c152", "pa28"]);
const SUBSTEP = 1 / 120;

export interface SimOptions {
  perfId: string;
  start: StartState;
  weather: WeatherState;
  magVar: number;
  radios?: Partial<Radios>;
  ndbs?: TrainingNdb[];
  /**
   * Force steam-gauge or glass (AHRS / air-data computer) instrument behaviour regardless of
   * `perf.avionics` — e.g. a 1970s-style steam panel driven by C172 performance numbers.
   */
  panel?: PanelKind;
}

export const DEFAULT_CONTROLS: Controls = {
  elevator: 0,
  aileron: 0,
  rudder: 0,
  throttle: 0,
  mixture: 1,
  flapIndex: 0,
  gearDown: true,
  brakes: 0,
  parkingBrake: false,
  trim: 0,
  fuelSelector: "both",
  lights: { nav: true, beacon: true, strobe: false, landing: false, taxi: false, panel: false },
  masterBattery: true,
  alternator: true,
  avionicsMaster: true,
  pitotHeat: false,
  carbHeat: false,
};

export const NO_FAILURES: Failures = {
  engine: false,
  alternator: false,
  vacuum: false,
  pitot: false,
  static: false,
  radios: false,
  gps: false,
  ahrs: false,
};

export function defaultRadios(): Radios {
  return {
    com1: { active: 118.6, standby: 121.5 },
    com2: { active: 121.5, standby: 122.75 },
    nav1: { active: 113.9, standby: 115.8, obs: 0 },
    nav2: { active: 115.8, standby: 116.8, obs: 0 },
    adfKhz: 200,
    transponder: { code: "1200", mode: "ALT" },
    cdiSource: "GPS",
    altimeterInHg: 29.92,
    hdgBug: 0,
    altBug: 3000,
    vsBug: 500,
    iasBug: 90,
  };
}

/** Wing aspect ratio. */
const aspect = (p: AircraftPerf) => (p.wingSpanFt * p.wingSpanFt) / p.wingAreaSqFt;

export class SimEngine {
  readonly perf: AircraftPerf;
  /** Effective instrument behaviour: `opts.panel` if given, otherwise derived from `perf.avionics`. */
  readonly panel: PanelKind;
  private ac: AircraftState;
  private controls: Controls;
  private radios: Radios;
  private gps: GpsState = {
    flightPlan: [],
    activeLeg: 1,
    directTo: null,
    approach: null,
    mode: "ENR",
  };
  private directFrom: Waypoint | null = null;
  private ap: AutopilotState = { ...INITIAL_AP };
  private apInt: ApInternal = { ...INITIAL_AP_INTERNAL };
  private failures: Failures = { ...NO_FAILURES };
  private weather: WeatherState;
  private magVar: number;
  private ndbs: TrainingNdb[];
  private paused = false;
  protected snapshot: SimSnapshot;
  protected listeners = new Set<() => void>();
  protected eventListeners = new Set<(e: SimEvent) => void>();
  private raf = 0;
  private lastT = 0;
  private acc = 0;
  /** Time scale (1 = real time). */
  timeScale = 1;

  // instrument memory for failures
  private frozen = { ias: 0, alt: 0, pitch: 0, bank: 0, hdg: 0, staticAlt: 0, pitotAlt: 0 };
  private inst = new SteamInstruments();
  private filteredSlip = 0;
  private filteredVsi = 0;
  private gustPhase = Math.random() * 100;
  private wasStallWarning = false;
  private overspeedNotified = false;
  private gearHornNotified = false;
  /** Actual flap angle lags commanded */
  private apDisconnectTimer = 0;
  private captureTimer = 0;
  /** Seconds of pitot heat applied while the pitot tube is blocked by ice */
  private pitotHeatT = 0;

  constructor(opts: SimOptions) {
    this.perf = getPerf(opts.perfId);
    this.panel = opts.panel ?? (this.perf.avionics === "steam" ? "steam" : "glass");
    this.weather = { ...opts.weather };
    this.magVar = opts.magVar;
    this.ndbs = opts.ndbs ?? [];
    this.controls = { ...DEFAULT_CONTROLS, lights: { ...DEFAULT_CONTROLS.lights } };
    this.radios = { ...defaultRadios(), ...(opts.radios ?? {}) };
    this.ac = this.initialAircraft(opts.start);
    this.applyStartControls(opts.start);
    this.inst.reset(this.instrumentInputs());
    this.snapshot = this.buildSnapshot();
  }

  // ---------------------------------------------------------------- setup

  private initialAircraft(s: StartState): AircraftState {
    const p = this.perf;
    const fuel = p.usableFuelGal * (s.fuelFraction ?? 0.85);
    const fuelLb = fuel * (p.fuelType === "Jet-A" ? 6.7 : 6.0);
    const weight = Math.min(p.maxGrossLb, p.emptyWeightLb + p.defaultPayloadLb + fuelLb);
    const ground = s.onGround ? s.groundElevFt : terrainElevationFt(s.lat, s.lon);
    return {
      lat: s.lat,
      lon: s.lon,
      altMslFt: s.onGround ? s.groundElevFt : s.altMslFt,
      aglFt: s.onGround ? 0 : s.altMslFt - ground,
      groundElevFt: ground,
      pitch: s.onGround ? 0 : 2,
      bank: 0,
      heading: s.heading,
      pitchRate: 0,
      rollRate: 0,
      yawRate: 0,
      turnRate: 0,
      iasKt: s.iasKt,
      tasKt: s.iasKt,
      gsKt: s.iasKt,
      vsFpm: 0,
      mach: 0,
      track: s.heading,
      flightPathDeg: 0,
      aoaDeg: 0,
      slip: 0,
      loadFactor: 1,
      onGround: s.onGround,
      stallWarning: false,
      stalled: false,
      overspeed: false,
      crashed: false,
      crashReason: "",
      engineRunning: s.engineRunning,
      engineCranking: 0,
      rpm: s.engineRunning ? (p.powerType === "jet" ? 22 : 800) : 0,
      powerFraction: 0,
      fuelFlowGph: 0,
      fuelLeftGal: fuel / 2,
      fuelRightGal: fuel / 2,
      oilPressPsi: s.engineRunning ? 60 : 0,
      oilTempF: s.engineRunning ? 160 : 70,
      manifoldInHg: 29.9,
      carbIce: 0,
      vacuumInHg: s.engineRunning ? 5 : 0,
      flapsDeg: p.flapDetents[s.flapIndex ?? 0] ?? 0,
      gearPosition: s.gearDown === false && p.retractableGear ? 0 : 1,
      busVolts: 28,
      batteryPct: 100,
      ammeterA: 0,
      oatC: this.weather.tempC,
      densityAltFt: 0,
      weightLb: weight,
      simTimeSec: 0,
      distanceNm: 0,
    };
  }

  private applyStartControls(s: StartState) {
    this.controls.flapIndex = s.flapIndex ?? 0;
    this.controls.gearDown = this.perf.retractableGear ? (s.gearDown ?? s.onGround) : true;
    this.controls.throttle = s.throttle ?? (s.onGround ? 0 : 0.65);
    this.controls.parkingBrake = s.onGround && !s.engineRunning;
    if (s.trim !== undefined) this.controls.trim = s.trim;
    else if (!s.onGround) this.controls.trim = this.trimForSpeed(s.iasKt);
    this.radios.altimeterInHg = Math.round(this.weather.qnhInHg * 100) / 100;
    this.radios.hdgBug = Math.round(norm360(s.heading - this.magVar));
    this.radios.altBug = Math.round(s.altMslFt / 100) * 100;
    this.radios.iasBug = Math.round(this.perf.v.y);
    if (!s.onGround) {
      // Settle the airborne state close to equilibrium.
      const sigma = densityRatio(
        s.altMslFt,
        oatAt(s.altMslFt, this.ac.groundElevFt, this.weather.tempC),
      );
      this.ac.tasKt = s.iasKt / Math.sqrt(sigma);
      this.ac.aoaDeg = this.equilibriumAlpha(s.iasKt);
      this.ac.pitch = this.ac.aoaDeg;
    }
  }

  /** Clean-configuration AoA (deg) for level flight at a given IAS. */
  private equilibriumAlpha(iasKt: number) {
    const p = this.perf;
    const q = 0.5 * RHO0 * (iasKt * KT_TO_FPS) ** 2;
    const cl = this.ac.weightLb / (q * p.wingAreaSqFt);
    return toDeg((cl - p.cl0 - this.flapClIncrement()) / p.clAlpha);
  }

  /** Elevator trim position that holds the given IAS hands-off. */
  trimForSpeed(iasKt: number) {
    const a = this.equilibriumAlpha(iasKt);
    return clamp((a - this.alphaTrim0()) / this.trimGainDeg(), -1, 1);
  }

  private alphaTrim0() {
    // Neutral trim ≈ cruise speed AoA.
    const p = this.perf;
    const q = 0.5 * RHO0 * (p.v.no * 0.85 * KT_TO_FPS) ** 2;
    const cl = (p.emptyWeightLb + p.defaultPayloadLb + p.usableFuelGal * 3) / (q * p.wingAreaSqFt);
    return toDeg((cl - p.cl0) / p.clAlpha);
  }
  private trimGainDeg() {
    const p = this.perf;
    const aStall = toDeg((p.clMaxClean - p.cl0) / p.clAlpha);
    return Math.max(4, aStall * 0.85 - this.alphaTrim0());
  }

  private flapFraction() {
    const max = Math.max(...this.perf.flapDetents);
    return max > 0 ? this.ac.flapsDeg / max : 0;
  }
  private flapClIncrement() {
    return this.flapFraction() * (this.perf.clMaxFull - this.perf.clMaxClean) * 0.85;
  }

  // ---------------------------------------------------------------- public API

  getSnapshot = (): SimSnapshot => this.snapshot;

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };

  onEvent(fn: (e: SimEvent) => void) {
    this.eventListeners.add(fn);
    return () => {
      this.eventListeners.delete(fn);
    };
  }

  protected emit(type: SimEvent["type"], message: string, data?: SimEvent["data"]) {
    const e: SimEvent = { t: this.ac.simTimeSec, type, message };
    if (data) e.data = data;
    this.eventListeners.forEach((l) => l(e));
  }

  start() {
    if (typeof window === "undefined" || this.raf) return;
    this.lastT = performance.now();
    const loop = (t: number) => {
      const dt = Math.max(0, Math.min(0.1, (t - this.lastT) / 1000));
      this.lastT = t;
      this.advance(dt);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  /** Advance simulation by dt seconds (also usable headless for tests). */
  advance(dt: number) {
    if (!this.paused && !this.ac.crashed) {
      this.acc += dt * this.timeScale;
      let n = 0;
      while (this.acc >= SUBSTEP && n < 40) {
        this.step(SUBSTEP);
        this.acc -= SUBSTEP;
        n++;
      }
      if (n >= 40) this.acc = 0;
    }
    this.publish();
  }

  setPaused(p: boolean) {
    this.paused = p;
    this.publish();
  }
  togglePause() {
    this.setPaused(!this.paused);
  }

  setControls(patch: Partial<Controls>) {
    this.controls = { ...this.controls, ...patch };
    if (patch.lights) this.controls.lights = { ...this.controls.lights, ...patch.lights };
    this.controls.flapIndex = clamp(
      Math.round(this.controls.flapIndex),
      0,
      this.perf.flapDetents.length - 1,
    );
    this.controls.throttle = clamp(this.controls.throttle, 0, 1);
    this.controls.mixture = clamp(this.controls.mixture, 0, 1);
    this.controls.trim = clamp(this.controls.trim, -1, 1);
    if (!this.perf.retractableGear) this.controls.gearDown = true;
    if (patch.gearDown === false && this.ac.onGround) {
      // Squat switch prevents retraction on the ground.
      this.controls.gearDown = true;
      this.emit("info", "Gear retraction inhibited on the ground (squat switch).");
    }
    // Pilot overpowering the AP disconnects it.
    if (
      this.ap.engaged &&
      ((patch.elevator !== undefined && Math.abs(patch.elevator) > 0.6) ||
        (patch.aileron !== undefined && Math.abs(patch.aileron) > 0.6))
    ) {
      this.apDisconnect("AP override");
    }
  }

  getControls() {
    return this.controls;
  }

  setRadios(patch: Partial<Radios>) {
    this.radios = { ...this.radios, ...patch };
    this.radios.hdgBug = norm360(Math.round(this.radios.hdgBug));
    this.radios.altBug = clamp(Math.round(this.radios.altBug / 100) * 100, 0, 45000);
    this.radios.vsBug = clamp(Math.round(this.radios.vsBug / 100) * 100, -3000, 3000);
    this.radios.iasBug = clamp(Math.round(this.radios.iasBug), 40, 400);
    this.radios.nav1.obs = norm360(this.radios.nav1.obs);
    this.radios.nav2.obs = norm360(this.radios.nav2.obs);
    this.publish();
  }

  swapCom(n: 1 | 2) {
    const c = n === 1 ? this.radios.com1 : this.radios.com2;
    const swapped = { active: c.standby, standby: c.active };
    this.setRadios(n === 1 ? { com1: swapped } : { com2: swapped });
  }
  swapNav(n: 1 | 2) {
    const c = n === 1 ? this.radios.nav1 : this.radios.nav2;
    const swapped = { ...c, active: c.standby, standby: c.active };
    this.setRadios(n === 1 ? { nav1: swapped } : { nav2: swapped });
  }

  setFailure(name: keyof Failures, on: boolean) {
    if (this.failures[name] === on) return;
    this.failures = { ...this.failures, [name]: on };
    if (on) {
      this.frozen = {
        ias: this.snapshot.indicated.iasKt,
        alt: this.snapshot.indicated.altFt,
        pitch: this.ac.pitch,
        bank: this.ac.bank,
        hdg: this.snapshot.indicated.headingMag,
        staticAlt: this.ac.altMslFt,
        pitotAlt: this.ac.altMslFt,
      };
      this.emit("failure", FAILURE_TEXT[name]);
    }
    if (name === "engine" && on && this.perf.engines === 1) {
      this.ac.engineRunning = false;
      this.emit("engine", "Engine failure");
    }
    this.publish();
  }
  getFailures() {
    return this.failures;
  }

  setWeather(patch: Partial<WeatherState>) {
    this.weather = { ...this.weather, ...patch };
    this.publish();
  }

  startEngine() {
    const a = this.ac;
    if (a.engineRunning || a.engineCranking > 0) return;
    if (!this.controls.masterBattery || a.batteryPct < 8) {
      this.emit("engine", "Starter: no electrical power (master/battery).");
      return;
    }
    if (this.failures.engine && this.perf.engines === 1) {
      this.emit("engine", "Engine cranks but will not start.");
      a.engineCranking = 2;
      return;
    }
    if (this.fuelAvailable() <= 0 || this.controls.fuelSelector === "off") {
      this.emit("engine", "Engine cranks but will not start — no fuel to the engine.");
      a.engineCranking = 2;
      return;
    }
    if (this.controls.mixture < 0.3 && this.perf.powerType === "piston") {
      this.emit("engine", "Engine cranks but will not start — mixture is idle cut-off.");
      a.engineCranking = 2;
      return;
    }
    a.engineCranking = this.perf.powerType === "piston" ? 1.6 : 6;
    this.emit("engine", "Starter engaged");
  }

  stopEngine() {
    if (!this.ac.engineRunning) return;
    this.ac.engineRunning = false;
    this.emit("engine", "Engine shut down");
  }

  // Autopilot ------------------------------------------------------------

  apToggle() {
    if (this.ap.engaged) {
      this.apDisconnect("AP disconnect");
      return;
    }
    if (!this.snapshot.indicated.avionicsPowered || this.failures.ahrs) {
      this.emit("info", "Autopilot unavailable — no attitude/electrical source.");
      return;
    }
    this.ap = { ...this.ap, engaged: true, fd: true, annunciation: "AP" };
    this.apInt = {
      ...this.apInt,
      elevInt: 0,
      holdAlt: this.snapshot.indicated.altFt,
      rolBank: this.ac.bank,
    };
    if (this.ap.vertical === "PIT") this.ap.targetPitch = this.ac.pitch;
    this.publish();
  }

  apDisconnect(reason = "AP disconnect") {
    if (!this.ap.engaged) return;
    this.ap = { ...this.ap, engaged: false, annunciation: reason.toUpperCase() };
    this.apDisconnectTimer = 3;
    this.emit("info", reason);
    this.publish();
  }

  fdToggle() {
    this.ap = { ...this.ap, fd: !this.ap.fd || this.ap.engaged };
    if (this.ap.fd && this.ap.vertical === "PIT") this.ap.targetPitch = this.ac.pitch;
    this.publish();
  }

  /** Press a lateral mode button (HDG/NAV/APR). Pressing an active mode returns to ROL. */
  apLateral(mode: Exclude<LateralMode, "ROL">) {
    const ap = { ...this.ap, fd: true };
    if (mode === "HDG") {
      ap.lateral = ap.lateral === "HDG" ? "ROL" : "HDG";
      ap.lateralArmed = null;
    } else if (mode === "NAV") {
      if (ap.lateral === "NAV" || ap.lateralArmed === "NAV") {
        ap.lateral = ap.lateral === "NAV" ? "ROL" : ap.lateral;
        ap.lateralArmed = null;
      } else {
        ap.lateralArmed = "NAV";
        if (ap.lateral === "ROL") ap.lateral = "HDG";
      }
    } else {
      if (ap.lateral === "APR" || ap.lateralArmed === "LOC") {
        ap.lateral = ap.lateral === "APR" ? "ROL" : ap.lateral;
        ap.lateralArmed = null;
        if (ap.verticalArmed === "GS") ap.verticalArmed = null;
      } else {
        ap.lateralArmed = "LOC";
        ap.verticalArmed = "GS";
        if (ap.lateral === "ROL") ap.lateral = "HDG";
      }
    }
    if (ap.lateral === "ROL") this.apInt.rolBank = this.ac.bank;
    this.ap = ap;
    this.publish();
  }

  /** Press a vertical mode button (ALT/VS/FLC). Pressing an active mode returns to PIT. */
  apVertical(mode: Exclude<VerticalMode, "PIT" | "GS">) {
    const ap = { ...this.ap, fd: true };
    if (ap.vertical === mode) {
      ap.vertical = "PIT";
      ap.targetPitch = this.ac.pitch;
    } else {
      ap.vertical = mode;
      if (mode === "ALT") this.apInt.holdAlt = Math.round(this.snapshot.indicated.altFt / 10) * 10;
      if (mode === "VS") this.radios.vsBug = Math.round(this.ac.vsFpm / 100) * 100;
      if (mode === "FLC") {
        this.radios.iasBug = Math.round(this.ac.iasKt);
        ap.targetPitch = this.ac.pitch;
      }
      if (mode !== "ALT") ap.verticalArmed = "ALTS";
    }
    this.ap = ap;
    this.publish();
  }

  /** Nose up/down wheel: adjusts VS target, pitch target or ALT hold. */
  apWheel(dir: 1 | -1) {
    if (this.ap.vertical === "VS") this.setRadios({ vsBug: this.radios.vsBug + dir * 100 });
    else if (this.ap.vertical === "PIT")
      this.ap = { ...this.ap, targetPitch: clamp(this.ap.targetPitch + dir * 0.5, -15, 20) };
    else if (this.ap.vertical === "FLC") this.setRadios({ iasBug: this.radios.iasBug - dir });
    else if (this.ap.vertical === "ALT") this.apInt.holdAlt += dir * 10;
    this.publish();
  }

  yawDamperToggle() {
    this.ap = { ...this.ap, yd: !this.ap.yd };
    this.publish();
  }

  // GPS ------------------------------------------------------------------

  loadFlightPlan(wps: Waypoint[]) {
    this.gps = {
      ...this.gps,
      flightPlan: wps,
      activeLeg: Math.min(1, Math.max(wps.length - 1, 0)),
      directTo: null,
    };
    this.publish();
  }

  directTo(wp: Waypoint) {
    this.gps = { ...this.gps, directTo: wp };
    this.directFrom = { id: "PPOS", lat: this.ac.lat, lon: this.ac.lon, kind: "user" };
    this.publish();
  }

  cancelDirectTo() {
    this.gps = { ...this.gps, directTo: null };
    this.directFrom = null;
    this.publish();
  }

  setActiveLeg(i: number) {
    this.gps = {
      ...this.gps,
      activeLeg: clamp(i, 1, Math.max(1, this.gps.flightPlan.length - 1)),
      directTo: null,
    };
    this.publish();
  }

  activateApproach(approach: NonNullable<GpsState["approach"]>, waypoints: Waypoint[]) {
    // Append the approach after the current enroute plan (replacing a previous approach).
    const enroute = this.gps.approach
      ? this.gps.flightPlan.filter((w) => w.kind !== "fix" && w.kind !== "runway")
      : this.gps.flightPlan;
    const fp = [...enroute.filter((w) => w.kind !== "runway"), ...waypoints];
    this.gps = {
      ...this.gps,
      flightPlan: fp,
      approach,
      activeLeg: Math.max(1, enroute.length > 0 ? enroute.length : 1),
      directTo: null,
    };
    this.publish();
  }

  /** Remove the loaded approach (and its waypoints) from the flight plan. */
  clearApproach() {
    if (!this.gps.approach) return;
    const enroute = this.gps.flightPlan.filter((w) => w.kind !== "fix" && w.kind !== "runway");
    this.gps = {
      ...this.gps,
      approach: null,
      flightPlan: enroute,
      activeLeg: Math.min(this.gps.activeLeg, Math.max(1, enroute.length - 1)),
    };
    this.publish();
  }

  getGps() {
    return this.gps;
  }

  /** Move the aircraft (e.g. scenario reset). */
  private instrumentInputs(vacuumPower = 1): InstrumentInputs {
    const a = this.ac;
    return {
      pitch: a.pitch,
      bank: a.bank,
      headingMag: norm360(a.heading - this.magVar),
      rollRate: a.rollRate,
      turnRate: a.turnRate,
      slip: a.slip,
      tasKt: a.tasKt,
      onGround: a.onGround,
      vacuumPower,
      electricPower: this.controls.masterBattery ? clamp((a.busVolts - 18) / 6, 0, 1) : 0,
      dipDeg: 61,
    };
  }

  /** Re-align the heading indicator with the magnetic compass (corrects gyro precession). */
  syncHeadingIndicator() {
    this.inst.syncHeadingIndicator();
    this.publish();
  }

  reposition(s: StartState) {
    const weight = this.ac.weightLb;
    this.ac = this.initialAircraft(s);
    this.ac.weightLb = weight;
    this.applyStartControls(s);
    this.ap = { ...INITIAL_AP };
    this.apInt = { ...INITIAL_AP_INTERNAL };
    this.failures = { ...NO_FAILURES };
    this.inst.reset(this.instrumentInputs());
    this.publish();
  }

  // ---------------------------------------------------------------- physics

  private fuelAvailable() {
    const sel = this.controls.fuelSelector;
    if (sel === "off") return 0;
    if (sel === "left") return this.ac.fuelLeftGal;
    if (sel === "right") return this.ac.fuelRightGal;
    return this.ac.fuelLeftGal + this.ac.fuelRightGal;
  }

  private step(dt: number) {
    const p = this.perf;
    const a = this.ac;
    const c = this.controls;
    const w = this.weather;
    a.simTimeSec += dt;

    // ---- environment
    a.groundElevFt = terrainElevationFt(a.lat, a.lon);
    a.aglFt = a.altMslFt - a.groundElevFt;
    const pa = pressureAltitude(a.altMslFt, w.qnhInHg);
    a.oatC = oatAt(a.altMslFt, a.groundElevFt, w.tempC);
    const sigma = densityRatio(pa, a.oatC);
    a.densityAltFt = densityAltitude(pa, a.oatC);
    const rho = RHO0 * sigma;
    const wind = windAt(w, Math.max(0, a.aglFt));
    this.gustPhase += dt;
    const gust =
      w.gustKt > w.windKt
        ? Math.max(0, smoothNoise(this.gustPhase * 0.35, 1)) * (w.gustKt - w.windKt)
        : 0;
    const windKt = a.onGround ? wind.kt + gust : wind.kt + gust;
    const windTo = toRad(wind.dir + 180);
    const wN = windKt * Math.cos(windTo); // knots toward north
    const wE = windKt * Math.sin(windTo);

    // ---- flaps & gear actuation
    const flapTarget = p.flapDetents[c.flapIndex] ?? 0;
    a.flapsDeg += clamp(flapTarget - a.flapsDeg, -3 * dt, 3 * dt);
    const powered = a.busVolts > 20;
    if (p.retractableGear && powered)
      a.gearPosition = clamp(a.gearPosition + ((c.gearDown ? 1 : -1) * dt) / 6, 0, 1);

    // ---- engine
    this.engineStep(dt, sigma, pa);

    // ---- electrical
    this.electricalStep(dt);

    // ---- pitot heat melts an iced/blocked pitot tube (~20 s)
    if (this.failures.pitot && c.pitotHeat && a.busVolts > 20) {
      this.pitotHeatT += dt;
      if (this.pitotHeatT > 20) {
        this.failures = { ...this.failures, pitot: false };
        this.pitotHeatT = 0;
        this.emit("info", "Pitot heat has cleared the blockage — airspeed indication restored.");
      }
    } else if (!this.failures.pitot) this.pitotHeatT = 0;

    // ---- autopilot
    const indicatedAltForAp = a.altMslFt + (this.radios.altimeterInHg - w.qnhInHg) * 1000;
    const apOut = autopilotStep(
      this.ap,
      this.apInt,
      a,
      indicatedAltForAp,
      this.radios,
      this.snapshot.nav,
      this.magVar,
      dt,
    );
    this.ap = apOut.ap;
    this.apInt = apOut.int;
    if (this.ap.engaged && (a.stalled || a.onGround || !powered || this.failures.ahrs))
      this.apDisconnect(a.stalled ? "AP disconnect — stall" : "AP disconnect");
    if (this.ap.annunciation.endsWith("CAPTURE")) {
      this.captureTimer += dt;
      if (this.captureTimer > 3) {
        this.ap = { ...this.ap, annunciation: this.ap.engaged ? "AP" : "" };
        this.captureTimer = 0;
      }
    } else this.captureTimer = 0;
    if (this.apDisconnectTimer > 0) {
      this.apDisconnectTimer -= dt;
      if (this.apDisconnectTimer <= 0 && !this.ap.engaged)
        this.ap = { ...this.ap, annunciation: "" };
    }
    const elevIn = this.ap.engaged ? apOut.elevator : c.elevator;
    const ailIn = this.ap.engaged ? apOut.aileron : c.aileron;

    // ---- aerodynamics
    const V = Math.max(a.tasKt * KT_TO_FPS, 1);
    const q = 0.5 * rho * V * V;
    const qRef = 0.5 * RHO0 * (p.v.s1 * KT_TO_FPS) ** 2;
    const authority = clamp(q / qRef, 0.05, 1.6);
    const S = p.wingAreaSqFt;
    const m = a.weightLb / G;
    const flapCl = this.flapClIncrement();
    const clMax = p.clMaxClean + this.flapFraction() * (p.clMaxFull - p.clMaxClean);
    const alphaStall = (clMax - p.cl0 - flapCl) / p.clAlpha; // rad
    const alpha = toRad(a.aoaDeg);
    let cl: number;
    if (alpha <= alphaStall) cl = p.cl0 + flapCl + p.clAlpha * alpha;
    else cl = Math.max(clMax * 0.62, clMax - (alpha - alphaStall) * p.clAlpha * 0.9);
    if (alpha < -0.25) cl = p.cl0 + flapCl + p.clAlpha * -0.25;
    const ar = aspect(p);
    const gearDrag = p.retractableGear ? a.gearPosition * 0.015 : 0;
    const cd =
      p.cd0 +
      this.flapFraction() * 0.045 +
      gearDrag +
      (cl * cl) / (Math.PI * ar * p.oswald) +
      (alpha > alphaStall ? 0.12 : 0);
    // Turbulence perturbs lift a little.
    const turb =
      w.turbulence > 0 && !a.onGround
        ? smoothNoise(a.simTimeSec * 1.7, 3) * 0.04 * w.turbulence
        : 0;
    // Ground effect: within ~half a wingspan of the surface, lift increases slightly.
    const groundEffect = 1 + 0.12 * clamp(1 - a.aglFt / (p.wingSpanFt * 0.5), 0, 1);
    let L = q * S * (cl + turb) * groundEffect;
    const D = q * S * cd;
    const T = this.thrust(V, sigma);

    // Stall state & warning (warning ~5–10 kt / ~2° before stall)
    a.stalled = !a.onGround && alpha > alphaStall;
    a.stallWarning = !a.onGround && alpha > alphaStall - toRad(2.2) && a.iasKt > 10;
    if (a.stallWarning && !this.wasStallWarning)
      this.emit("stall", a.stalled ? "Stall" : "Stall warning");
    this.wasStallWarning = a.stallWarning;

    if (a.onGround) {
      this.groundStep(dt, T, D, L, m, elevIn, authority, wN, wE, alphaStall);
    } else {
      // ---- rotational: pitch seeks commanded AoA
      const aT0 = this.alphaTrim0();
      const trimDeg = c.trim * this.trimGainDeg();
      const elevDeg = elevIn >= 0 ? elevIn * (toDeg(alphaStall) - aT0 + 8) : elevIn * 12;
      let alphaCmd = aT0 + trimDeg + elevDeg;
      // Power-on pitch-up tendency (propwash over tail), flaps pitch-down/balloon simplification.
      alphaCmd += (a.powerFraction - 0.55) * 1.2;
      if (a.stalled) alphaCmd -= 3; // nose drops in the stall
      const pitchRateCmd = clamp(
        (alphaCmd - a.aoaDeg) * 1.6 * Math.min(1, authority),
        -p.pitchRateDps,
        p.pitchRateDps,
      );
      a.pitchRate += (pitchRateCmd - a.pitchRate) * clamp(dt * 4, 0, 1);
      // Turning: pitch attitude must also follow the flight-path rotation; handled by γ below.
      // Roll
      let rollCmd = ailIn * p.rollRateDps * clamp(authority, 0.15, 1);
      if (a.stalled && Math.abs(c.rudder) > 0.3) rollCmd += Math.sign(c.rudder) * 25; // uncoordinated stall → wing drop
      rollCmd += c.rudder * 6 * clamp(authority, 0, 1); // secondary effect of rudder
      a.rollRate += (rollCmd - a.rollRate) * clamp(dt * 5, 0, 1);
      a.bank = norm180(a.bank + a.rollRate * dt);

      // ---- translational
      const gamma = toRad(a.flightPathDeg);
      const phi = toRad(a.bank);
      const W = a.weightLb;
      if (L > W * 3.8) L = W * 3.8; // structural sanity
      const dV = (T * Math.cos(alpha) - D) / m - G * Math.sin(gamma);
      const dGamma = (L * Math.cos(phi) + T * Math.sin(alpha) - W * Math.cos(gamma)) / (m * V);
      const dPsi = (L * Math.sin(phi)) / (m * V * Math.max(0.2, Math.cos(gamma)));
      const newV = Math.max(5, V + dV * dt);
      const newGamma = clamp(gamma + dGamma * dt, toRad(-80), toRad(80));
      // Rudder yaw (sideslip) adds a small heading rate.
      const yawRudder = (this.ap.yd ? 0 : c.rudder) * 3 * clamp(authority, 0, 1);
      const asym = this.asymmetricYaw();
      a.turnRate = toDeg(dPsi) + yawRudder + asym;
      a.heading = norm360(a.heading + a.turnRate * dt);
      // Pitch = γ + α ; integrate pitch from commanded rate plus flight-path rotation in the turn
      a.pitch = clamp(a.pitch + a.pitchRate * dt + toDeg(newGamma - gamma), -85, 85);
      a.flightPathDeg = toDeg(newGamma);
      a.aoaDeg = a.pitch - a.flightPathDeg;
      a.tasKt = newV / KT_TO_FPS;
      a.loadFactor = L / W;

      // Slip ball: adverse yaw from aileron, p-factor at high power/low speed, rudder.
      const pfactor =
        p.powerType === "jet"
          ? 0
          : a.powerFraction * clamp(1.2 - a.iasKt / (p.v.y * 1.4), 0, 1) * 0.6;
      const slipRaw = clamp(ailIn * 0.35 + pfactor - c.rudder * 0.9 - asym * 0.25, -1, 1);
      const slipTarget = this.ap.yd ? slipRaw * 0.15 : slipRaw;
      this.filteredSlip += (slipTarget - this.filteredSlip) * clamp(dt * 3, 0, 1);
      a.slip = this.filteredSlip;

      // Position update (air + wind)
      const vh = a.tasKt * Math.cos(newGamma);
      const vN = vh * Math.cos(toRad(a.heading)) + wN;
      const vE = vh * Math.sin(toRad(a.heading)) + wE;
      this.integratePosition(vN, vE, dt);
      a.vsFpm = newV * Math.sin(newGamma) * 60;
      a.altMslFt += (a.vsFpm / 60) * dt;

      // Touchdown / terrain contact
      const ground = terrainElevationFt(a.lat, a.lon);
      if (a.altMslFt <= ground) this.touchdown(ground);
    }

    // airspeeds
    // Indicated (calibrated) airspeed from impact pressure — compressibility matters for jets.
    const pressureRatio = Math.pow(Math.max(0.05, 1 - 6.8756e-6 * pa), 5.2559);
    a.iasKt = calibratedAirspeedKt(a.tasKt, speedOfSoundKt(a.oatC), pressureRatio);
    a.mach = a.tasKt / speedOfSoundKt(a.oatC);
    a.overspeed = a.iasKt > p.v.ne;
    if (a.overspeed && !this.overspeedNotified) {
      this.overspeedNotified = true;
      this.emit("overspeed", "Overspeed — exceeding VNE/VMO");
    }
    if (!a.overspeed) this.overspeedNotified = false;
    if (a.iasKt > p.v.ne * 1.15 && !a.onGround)
      this.crash("Structural failure — airspeed far beyond VNE");
    if (a.loadFactor > 5.5 && !a.onGround)
      this.crash("Structural failure — load factor limit exceeded");

    // Gear warning (retractables): low power + low altitude with gear up
    if (
      p.retractableGear &&
      !a.onGround &&
      a.gearPosition < 0.9 &&
      a.aglFt < 600 &&
      a.powerFraction < 0.3
    ) {
      if (!this.gearHornNotified) this.emit("gear-warning", "GEAR UP — landing gear not down");
      this.gearHornNotified = true;
    } else this.gearHornNotified = false;

    // Instruments: engine-driven vacuum feeds the attitude & heading gyros; the turn
    // coordinator is electric. Failures degrade them gradually, as in a real aircraft.
    const vacuumPower = a.engineRunning && !this.failures.vacuum ? clamp(a.rpm / 1100, 0, 1) : 0;
    a.vacuumInHg = 5.2 * vacuumPower;
    this.inst.update(dt, this.instrumentInputs(vacuumPower), this.failures.static ? 0 : a.vsFpm);

    // Fuel burn
    const flowGph = a.fuelFlowGph;
    const burn = (flowGph / 3600) * dt;
    if (burn > 0) {
      const sel = c.fuelSelector;
      if (sel === "left") a.fuelLeftGal = Math.max(0, a.fuelLeftGal - burn);
      else if (sel === "right") a.fuelRightGal = Math.max(0, a.fuelRightGal - burn);
      else {
        a.fuelLeftGal = Math.max(0, a.fuelLeftGal - burn / 2);
        a.fuelRightGal = Math.max(0, a.fuelRightGal - burn / 2);
      }
      a.weightLb -= burn * (p.fuelType === "Jet-A" ? 6.7 : 6);
    }
  }

  private asymmetricYaw() {
    // Twin with one engine failed: yaw toward the dead engine proportional to power on the live one.
    if (this.perf.engines < 2 || !this.failures.engine || !this.ac.engineRunning) return 0;
    const auth = clamp(this.ac.iasKt / ((this.perf.v.mc ?? 70) * 1.3), 0.2, 1);
    return -this.ac.powerFraction * 7 * (1.2 - auth * 0.6);
  }

  private integratePosition(vN: number, vE: number, dt: number) {
    const a = this.ac;
    const distNm = (Math.hypot(vN, vE) * dt) / 3600;
    if (distNm > 0) {
      const brg = norm360(toDeg(Math.atan2(vE, vN)));
      const np = destinationPoint(a.lat, a.lon, brg, distNm);
      a.lat = np.lat;
      a.lon = np.lon;
      a.track = brg;
      a.distanceNm += distNm;
    }
    a.gsKt = Math.hypot(vN, vE);
  }

  private groundStep(
    dt: number,
    T: number,
    D: number,
    L: number,
    m: number,
    elevIn: number,
    authority: number,
    wN: number,
    wE: number,
    alphaStall: number,
  ) {
    const p = this.perf;
    const a = this.ac;
    const c = this.controls;
    const W = a.weightLb;
    // Ground speed along heading (we integrate ground speed, then derive airspeed).
    const hdgRad = toRad(a.heading);
    const headwind = wN * -Math.cos(hdgRad) + wE * -Math.sin(hdgRad); // wind component opposing motion
    let gs = a.gsKt;
    const brakes = c.parkingBrake ? 1 : c.brakes;
    const normal = Math.max(0, W - L);
    const mu = 0.03 + brakes * 0.45;
    const friction = gs > 0.3 ? mu * normal : 0;
    let accel = (T - D - friction) / m; // ft/s²
    // Static friction: the aircraft stays put until thrust overcomes breakout friction.
    if (gs <= 0.3 && T - D < (0.025 + brakes * 0.45) * normal) accel = 0;
    gs = Math.max(0, gs + (accel / KT_TO_FPS) * dt);
    if (c.parkingBrake && T < normal * 0.5) gs = Math.max(0, gs - 20 * dt);

    // Steering: nosewheel + differential braking effect, reduced at speed by rudder authority.
    const steer = c.rudder * (gs < 20 ? 25 : clamp(30 - gs * 0.3, 6, 25)) * clamp(gs / 6, 0, 1);
    a.turnRate = steer;
    a.heading = norm360(a.heading + steer * dt);
    a.bank = 0;
    a.rollRate = 0;

    // Airspeed from ground speed + headwind
    a.tasKt = Math.max(0, gs + headwind);

    // Rotation: elevator can raise the nose once there is enough dynamic pressure.
    const rotateAuthority = clamp(authority * 1.6, 0, 1);
    const targetPitch = clamp(elevIn * 22 * rotateAuthority + c.trim * 3, 0, 14);
    a.pitchRate = (targetPitch - a.pitch) * 1.5;
    a.pitch = clamp(a.pitch + a.pitchRate * dt, 0, 15);
    a.aoaDeg = a.pitch;
    a.flightPathDeg = 0;
    a.vsFpm = 0;
    a.loadFactor = 1;
    if (a.pitch > 12.5 && p.powerType === "jet")
      this.emit("info", "Tail strike risk — pitch too high on the ground");

    const vN = gs * Math.cos(hdgRad);
    const vE = gs * Math.sin(hdgRad);
    this.integratePosition(vN, vE, dt);
    a.gsKt = gs;
    a.track = a.heading;
    const ground = terrainElevationFt(a.lat, a.lon);
    a.altMslFt = ground;

    // Liftoff when lift exceeds weight
    if (L > W * 1.02 && a.pitch > 2) {
      a.onGround = false;
      a.altMslFt = ground + 0.5;
      a.flightPathDeg = 1;
      a.aoaDeg = a.pitch - 1;
      this.emit("liftoff", "Liftoff", { ias: Math.round(a.iasKt) });
    }
    void alphaStall;
  }

  private touchdown(ground: number) {
    const a = this.ac;
    const p = this.perf;
    const vs = a.vsFpm;
    const data = {
      vs: Math.round(vs),
      ias: Math.round(a.iasKt),
      bank: Math.round(a.bank),
      pitch: Math.round(a.pitch),
      gear: a.gearPosition > 0.95,
      lat: a.lat,
      lon: a.lon,
      heading: Math.round(a.heading),
      slip: Math.round(a.slip * 100) / 100,
    };
    a.altMslFt = ground;
    a.onGround = true;
    if (p.retractableGear && a.gearPosition < 0.95) {
      this.crash("Gear-up landing");
      return;
    }
    if (
      vs < -1000 ||
      Math.abs(a.bank) > 15 ||
      a.pitch < -6 ||
      (a.flightPathDeg < -12 && a.iasKt > p.v.ref)
    ) {
      this.crash(
        vs < -1000
          ? `Hard impact (${Math.round(vs)} fpm)`
          : Math.abs(a.bank) > 15
            ? "Wingtip strike — excessive bank at touchdown"
            : "Nose-first impact",
      );
      return;
    }
    if (a.aglFt > 50 && a.iasKt > p.v.ne) {
      this.crash("Terrain impact");
      return;
    }
    this.emit(
      "touchdown",
      vs < -600 ? "Hard landing" : vs < -300 ? "Firm touchdown" : "Smooth touchdown",
      data,
    );
    a.vsFpm = 0;
    a.flightPathDeg = 0;
    a.bank = 0;
  }

  private crash(reason: string) {
    if (this.ac.crashed) return;
    this.ac.crashed = true;
    this.ac.crashReason = reason;
    this.ac.engineRunning = false;
    this.ac.tasKt = 0;
    this.ac.gsKt = 0;
    this.ac.vsFpm = 0;
    this.emit("crash", reason);
  }

  private thrust(V: number, sigma: number) {
    const p = this.perf;
    const a = this.ac;
    const engines = this.failures.engine && p.engines > 1 ? p.engines - 1 : p.engines;
    if (!a.engineRunning) {
      // Windmilling propeller drag
      return p.powerType === "jet" ? 0 : -0.002 * 0.5 * RHO0 * sigma * V * V * p.wingAreaSqFt * 0.6;
    }
    if (p.powerType === "jet") {
      const tMax = p.thrustLbfPerEngine * engines * Math.pow(sigma, 0.75) * (1 - 0.25 * a.mach);
      return tMax * a.powerFraction;
    }
    const hp = p.hpPerEngine * engines * a.powerFraction;
    // Propeller efficiency falls off at low airspeed (fixed-pitch props are optimised for cruise).
    const vKt = V / KT_TO_FPS;
    const eta = p.propEfficiency * (1 - Math.exp(-vKt / (0.5 * p.cruiseKtas)));
    const tProp = (eta * hp * 550) / Math.max(V, 25);
    const tStatic = hp * (p.powerType === "turboprop" ? 2.6 : 3.4);
    const tLowSpeed = tStatic * clamp(1 - vKt / (p.cruiseKtas * 1.3), 0, 1);
    return Math.min(Math.max(tProp, tLowSpeed), tStatic);
  }

  private engineStep(dt: number, sigma: number, pa: number) {
    const p = this.perf;
    const a = this.ac;
    const c = this.controls;
    if (a.engineCranking > 0) {
      a.engineCranking -= dt;
      a.rpm = p.powerType === "jet" ? Math.min(20, a.rpm + dt * 4) : 250;
      a.batteryPct = Math.max(0, a.batteryPct - dt * 0.4);
      if (a.engineCranking <= 0) {
        a.engineCranking = 0;
        const canRun =
          this.fuelAvailable() > 0 &&
          c.fuelSelector !== "off" &&
          !(this.failures.engine && p.engines === 1) &&
          (p.powerType !== "piston" || c.mixture >= 0.3);
        if (canRun) {
          a.engineRunning = true;
          this.emit("engine", "Engine started");
        } else {
          a.rpm = 0;
        }
      }
    }
    // Fuel starvation
    if (a.engineRunning && (this.fuelAvailable() <= 0.01 || c.fuelSelector === "off")) {
      a.engineRunning = false;
      this.emit("engine", "Engine stopped — fuel starvation");
    }
    if (a.engineRunning && p.powerType === "piston" && c.mixture < 0.12) {
      a.engineRunning = false;
      this.emit("engine", "Engine stopped — mixture idle cut-off");
    }

    if (!a.engineRunning) {
      a.powerFraction = 0;
      a.fuelFlowGph = 0;
      if (a.engineCranking <= 0)
        a.rpm = Math.max(0, a.rpm - dt * 600) * (p.powerType === "jet" ? 1 : 1);
      // Windmilling
      if (p.powerType !== "jet" && !a.onGround && a.iasKt > 60 && !this.failures.engine)
        a.rpm = Math.max(a.rpm, a.iasKt * 9);
      a.oilPressPsi = Math.max(0, a.oilPressPsi - dt * 30);
      a.manifoldInHg = 29.92 * Math.pow(Math.max(0.1, 1 - 6.8756e-6 * pa), 5.2559);
      return;
    }

    let densityFactor: number;
    if (p.powerType === "jet") densityFactor = 1;
    else if (p.turbocharged)
      densityFactor = pa < 15000 ? 1 : clamp((sigma - 0.13) / 0.87 / 0.63, 0, 1);
    else densityFactor = clamp((sigma - 0.13) / 0.87, 0, 1);

    // Mixture: best power when mixture ≈ ideal for altitude (full rich at sea level).
    let mixtureFactor = 1;
    if (p.powerType === "piston") {
      const ideal = clamp(1 - pa / 22000, 0.35, 1);
      const err = c.mixture - ideal;
      mixtureFactor = err >= 0 ? 1 - err * 0.35 : 1 + err * 1.8;
      mixtureFactor = clamp(mixtureFactor, 0, 1);
      // Carburettor ice
      if (CARBURETED.has(p.id)) {
        const conducive =
          this.weather.tempC > -5 &&
          this.weather.tempC < 25 &&
          c.throttle < 0.45 &&
          (this.weather.precipitation !== "none" ||
            this.weather.visibilitySm < 5 ||
            this.weather.tempC < 15);
        if (c.carbHeat) a.carbIce = Math.max(0, a.carbIce - dt * 0.05);
        else if (conducive) a.carbIce = Math.min(1, a.carbIce + dt * 0.0025);
        if (a.carbIce >= 0.98) {
          a.engineRunning = false;
          this.emit("engine", "Engine stopped — carburettor ice");
        }
        if (c.carbHeat) mixtureFactor *= 0.9; // carb heat reduces power (~100–200 RPM drop)
      }
    }
    const throttleEff = Math.max(0.04, c.throttle);
    let target = throttleEff * densityFactor * mixtureFactor * (1 - a.carbIce * 0.6);
    // Jets spool slowly
    const spool = p.powerType === "jet" ? 0.35 : p.powerType === "turboprop" ? 0.9 : 3;
    a.powerFraction += (target - a.powerFraction) * clamp(dt * spool, 0, 1);
    target = a.powerFraction;

    if (p.powerType === "jet") {
      a.rpm = 21 + target * 79; // N1 %
    } else {
      const maxRpm = p.powerType === "turboprop" ? 1700 : 2700;
      const idle = p.powerType === "turboprop" ? 1050 : 650;
      a.rpm =
        idle +
        (maxRpm - idle) * Math.pow(target, 0.6) +
        (p.powerType === "piston" ? Math.min(150, a.iasKt * 0.8) : 0);
      a.rpm = Math.min(a.rpm, maxRpm + 50);
    }
    const ambientMp = 29.92 * Math.pow(Math.max(0.1, 1 - 6.8756e-6 * pa), 5.2559);
    a.manifoldInHg = p.turbocharged ? 12 + target * 26 : ambientMp * (0.35 + 0.65 * throttleEff);
    a.fuelFlowGph =
      p.fuelBurnFullGph *
      (0.12 + 0.88 * target) *
      (p.powerType === "piston" ? clamp(0.5 + c.mixture * 0.5, 0.4, 1) : 1);
    a.oilPressPsi += (55 + target * 25 - a.oilPressPsi) * clamp(dt * 0.8, 0, 1);
    a.oilTempF += (150 + target * 60 - a.oilTempF) * clamp(dt * 0.02, 0, 1);
  }

  private electricalStep(dt: number) {
    const a = this.ac;
    const c = this.controls;
    const charging =
      c.alternator &&
      !this.failures.alternator &&
      a.engineRunning &&
      (a.rpm > 550 || this.perf.powerType === "jet") &&
      c.masterBattery;
    let load = 0;
    if (c.masterBattery) {
      load += 4;
      if (c.avionicsMaster) load += 9;
      if (c.lights.landing) load += 8;
      if (c.lights.strobe) load += 3;
      if (c.lights.taxi) load += 4;
      if (c.pitotHeat) load += 10;
    }
    if (charging) {
      a.busVolts = 28;
      a.batteryPct = Math.min(100, a.batteryPct + dt * 0.1);
      a.ammeterA = 3 + (100 - a.batteryPct) * 0.2;
    } else if (c.masterBattery) {
      a.batteryPct = Math.max(0, a.batteryPct - (load / 30) * dt * 0.15);
      a.busVolts = a.batteryPct > 2 ? 23 + a.batteryPct * 0.015 : 0;
      a.ammeterA = -load;
    } else {
      a.busVolts = 0;
      a.ammeterA = 0;
    }
  }

  // ---------------------------------------------------------------- snapshot

  private buildIndicated(): Indicated {
    const a = this.ac;
    const p = this.perf;
    const f = this.failures;
    const avionicsPowered =
      this.controls.masterBattery && this.controls.avionicsMaster && a.busVolts > 20;
    const glass = this.panel === "glass";
    let ias = a.iasKt < 20 ? 0 : a.iasKt;
    const trueIndicatedAlt = a.altMslFt + (this.radios.altimeterInHg - this.weather.qnhInHg) * 1000;
    let alt = trueIndicatedAlt;
    let vs = a.vsFpm;
    if (f.static) {
      alt = this.frozen.alt;
      vs = 0;
      // Blocked static: ASI reads low when descending below the blockage altitude, high when climbing.
      ias = Math.max(0, ias + (a.altMslFt - this.frozen.staticAlt) * 0.02);
    }
    if (f.pitot) {
      // Blocked pitot (and drain): ASI behaves like an altimeter.
      ias = Math.max(0, this.frozen.ias + (a.altMslFt - this.frozen.pitotAlt) * 0.015);
    }
    // Glass (air-data computer) VSI responds almost instantly; a mechanical VSI lags.
    this.filteredVsi += (vs - this.filteredVsi) * 0.08;
    let pitch = a.pitch;
    let bank = a.bank;
    let attitudeValid = true;
    let headingValid = true;
    let hdg = norm360(a.heading - this.magVar);
    let turnRate = a.turnRate;
    let slip = a.slip;
    let vsOut = f.static ? 0 : this.filteredVsi;
    if (glass) {
      // AHRS: accurate until it fails, then the display shows red X's.
      if (f.ahrs || !avionicsPowered) {
        attitudeValid = false;
        headingValid = false;
        pitch = this.frozen.pitch;
        bank = this.frozen.bank;
        hdg = this.frozen.hdg;
      }
      if (!avionicsPowered) turnRate = 0;
    } else {
      // Steam gauges: vacuum gyros wind down gradually after a failure — no warning flag.
      pitch = this.inst.aiPitch;
      bank = this.inst.aiRoll;
      hdg = this.inst.headingIndicator;
      attitudeValid = this.inst.aiGyro.spin > 0.2;
      headingValid = this.inst.hiGyro.spin > 0.2;
      turnRate = this.inst.tcRate * 3;
      slip = this.inst.ball;
      vsOut = f.static ? 0 : this.inst.vsi;
    }
    return {
      iasKt: Math.max(0, ias),
      altFt: alt,
      vsFpm: vsOut,
      headingMag: hdg,
      compass: this.inst.compass,
      pitch,
      bank,
      turnRate,
      slip,
      attitudeValid,
      headingValid,
      airDataValid: !(glass && !avionicsPowered),
      avionicsPowered,
    };
  }

  private buildAlerts(ind: Indicated): SimSnapshot["alerts"] {
    const a = this.ac;
    const out: SimSnapshot["alerts"] = [];
    if (a.crashed) out.push({ text: "CRASH", level: "warning" });
    if (a.stalled) out.push({ text: "STALL", level: "warning" });
    else if (a.stallWarning) out.push({ text: "STALL WARN", level: "warning" });
    if (a.overspeed) out.push({ text: "OVERSPEED", level: "warning" });
    if (!a.engineRunning && !a.onGround && !a.crashed)
      out.push({ text: "ENGINE OUT", level: "warning" });
    if (this.perf.engines > 1 && this.failures.engine)
      out.push({ text: "L ENG FAIL", level: "warning" });
    if (
      this.perf.retractableGear &&
      !a.onGround &&
      a.gearPosition < 0.9 &&
      a.aglFt < 600 &&
      a.powerFraction < 0.3
    )
      out.push({ text: "GEAR UP", level: "warning" });
    if (a.oilPressPsi < 20 && a.engineRunning) out.push({ text: "OIL PRESS", level: "warning" });
    if (a.busVolts < 25 && this.controls.masterBattery)
      out.push({ text: "LOW VOLTS", level: "caution" });
    if (this.failures.alternator) out.push({ text: "ALT FAIL", level: "caution" });
    if (this.failures.vacuum && this.panel === "steam")
      out.push({ text: "VACUUM", level: "caution" });
    if (this.failures.ahrs) out.push({ text: "AHRS FAIL", level: "caution" });
    if (this.failures.pitot) out.push({ text: "PITOT", level: "caution" });
    if (this.failures.static) out.push({ text: "STATIC", level: "caution" });
    if (this.failures.gps) out.push({ text: "GPS LOI", level: "caution" });
    if (this.failures.radios) out.push({ text: "COM FAIL", level: "caution" });
    const fuel = a.fuelLeftGal + a.fuelRightGal;
    if (fuel < this.perf.usableFuelGal * 0.1) out.push({ text: "LOW FUEL", level: "caution" });
    if (a.carbIce > 0.25) out.push({ text: "CARB ICE?", level: "caution" });
    if (this.controls.parkingBrake && a.engineRunning && this.controls.throttle > 0.5)
      out.push({ text: "PARK BRAKE", level: "caution" });
    if (!ind.attitudeValid) out.push({ text: "ATT FAIL", level: "caution" });
    return out;
  }

  private buildSnapshot(): SimSnapshot {
    const indicated = this.buildIndicated();
    const navPowered = indicated.avionicsPowered;
    const nav = computeNav(this.ac, this.radios, this.gps, this.magVar, {
      gpsFailed: this.failures.gps,
      navPowered,
      directFrom: this.directFrom,
      ndbs: this.ndbs,
    });
    // Auto-sequence the flight plan & GPS modes.
    this.sequenceGps(nav.gps.distNm);
    return {
      perfId: this.perf.id,
      aircraft: { ...this.ac },
      controls: this.controls,
      radios: this.radios,
      nav,
      gps: this.gps,
      ap: this.ap,
      failures: this.failures,
      weather: this.weather,
      indicated,
      paused: this.paused,
      alerts: this.buildAlerts(indicated),
      magVar: this.magVar,
    };
  }

  private sequenceGps(distToActive: number) {
    const g = this.gps;
    if (g.directTo) {
      return;
    }
    if (g.flightPlan.length >= 2 && g.activeLeg < g.flightPlan.length - 1) {
      const to = g.flightPlan[g.activeLeg]!;
      const next = g.flightPlan[g.activeLeg + 1]!;
      // Turn anticipation ~ 0.6 nm, or passed abeam
      const passed =
        distanceNm(this.ac.lat, this.ac.lon, next.lat, next.lon) <
        distanceNm(to.lat, to.lon, next.lat, next.lon) - 0.2;
      if (distToActive < 0.6 || (passed && distToActive < 3)) {
        this.gps = { ...g, activeLeg: g.activeLeg + 1 };
      }
    }
    // Mode: APR within 2 nm of the FAF on an approach, TERM within 30 nm of the first/last waypoint
    const fp = this.gps.flightPlan;
    let mode: GpsState["mode"] = "ENR";
    if (fp.length > 0) {
      const first = fp[0]!;
      const last = fp[fp.length - 1]!;
      const dFirst = distanceNm(this.ac.lat, this.ac.lon, first.lat, first.lon);
      const dLast = distanceNm(this.ac.lat, this.ac.lon, last.lat, last.lon);
      if (dFirst < 30 || dLast < 30) mode = "TERM";
      if (this.gps.approach) {
        const fafIdx = fp.findIndex((w) => w.label === "FAF");
        if (fafIdx >= 0 && this.gps.activeLeg >= fafIdx) mode = "APR";
        else if (fafIdx >= 0) {
          const faf = fp[fafIdx]!;
          if (distanceNm(this.ac.lat, this.ac.lon, faf.lat, faf.lon) < 2) mode = "APR";
        }
      }
    }
    if (mode !== this.gps.mode) this.gps = { ...this.gps, mode };
  }

  protected publish() {
    this.snapshot = this.buildSnapshot();
    this.listeners.forEach((l) => l());
  }

  dispose() {
    this.stop();
    this.listeners.clear();
    this.eventListeners.clear();
  }
}

const FAILURE_TEXT: Record<keyof Failures, string> = {
  engine: "Engine failure",
  alternator: "Alternator failure — battery is now the only source of power",
  vacuum: "Vacuum pump failure — attitude and heading indicators unreliable",
  pitot: "Pitot tube blocked — airspeed indication unreliable",
  static: "Static port blocked — altimeter and VSI unreliable",
  radios: "Communication radio failure",
  gps: "GPS loss of integrity",
  ahrs: "AHRS failure — use standby instruments",
};

/** Convenience: distance from the aircraft to a point in feet. */
export function distanceFt(lat1: number, lon1: number, lat2: number, lon2: number) {
  return distanceNm(lat1, lon1, lat2, lon2) * FT_PER_NM;
}
