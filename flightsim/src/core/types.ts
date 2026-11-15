/**
 * TeachX Flight Simulator — shared state contract.
 *
 * ONE `Sim` owns ONE `SimState`. Physics writes the "truth" part; the instrument, systems and nav
 * modules write their own sections; the panel, views, training and UI only READ it.
 *
 * Units are aviation units unless a name says otherwise: feet, knots, feet-per-minute, degrees,
 * inHg, US gallons, pounds. Headings/tracks are TRUE unless the name ends with `Mag`.
 * Sign conventions: pitch + = nose up, roll + = right wing down, elevator + = pull (nose up),
 * aileron + = roll right, rudder + = yaw right, trim + = nose up.
 */

// ---------------------------------------------------------------- aircraft constants

export interface AircraftSpec {
  id: string;
  name: string;
  /** Flap handle detents, degrees. */
  flapDetentsDeg: number[];
  /** Published reference speeds, KIAS (C172P POH-class values; educational, not approved data). */
  v: { s0: number; s1: number; r: number; x: number; y: number; glide: number; fe: number; a: number; no: number; ne: number; approach: number };
  usableFuelGal: number;
  maxGrossLb: number;
  emptyWeightLb: number;
  maxRpm: number;
  idleRpm: number;
}

// ---------------------------------------------------------------- controls (pilot inputs)

export type IgnitionPos = 0 | 1 | 2 | 3 | 4; // OFF, R, L, BOTH, START (spring-loaded back to BOTH)
export type FuelSelector = "off" | "left" | "right" | "both";

export interface RadioFreqs {
  /** MHz */
  active: number;
  standby: number;
}

/** Everything the pilot can move or set. Written by input devices and panel UI; read by systems/physics. */
export interface ControlState {
  elevator: number; // −1..1
  aileron: number; // −1..1
  rudder: number; // −1..1
  trim: number; // −1..1
  throttle: number; // 0..1
  mixture: number; // 0..1 (1 = full rich)
  carbHeat: boolean;
  flapIndex: number; // index into AircraftSpec.flapDetentsDeg
  brakeLeft: number; // 0..1
  brakeRight: number; // 0..1
  parkingBrake: boolean;
  ignition: IgnitionPos;
  masterBattery: boolean;
  masterAlternator: boolean;
  avionicsMaster: boolean;
  fuelSelector: FuelSelector;
  pitotHeat: boolean;
  lights: { beacon: boolean; nav: boolean; strobe: boolean; landing: boolean; taxi: boolean; panel: number };
  com1: RadioFreqs;
  com2: RadioFreqs;
  nav1: RadioFreqs;
  nav2: RadioFreqs;
  /** OBS (course selector) for each VOR indicator, magnetic degrees 0..359. */
  obs1: number;
  obs2: number;
  adfKhz: number;
  xpdr: { code: string; mode: "OFF" | "STBY" | "ON" | "ALT" };
  /** Kollsman window setting, inHg. */
  altimeterInHg: number;
  /** Heading bug on the heading indicator, magnetic degrees. */
  headingBugMag: number;
  /** Landing-gear lever (aircraft with retractable gear): true = down. */
  gearDown: boolean;
  /**
   * Total rotation the pilot has applied with the heading-indicator adjustment knob, degrees.
   * The instruments module adds it to the gyro heading (dgMag = gyro heading + dgAdjustDeg).
   */
  dgAdjustDeg: number;
}

// ---------------------------------------------------------------- environment (weather & time)

export type CloudCover = "FEW" | "SCT" | "BKN" | "OVC";

export interface CloudLayer {
  cover: CloudCover;
  baseFtMsl: number;
  topFtMsl: number;
}

export interface WindLayer {
  altFtMsl: number;
  /** direction the wind blows FROM, true degrees */
  dirTrue: number;
  kt: number;
}

/** Written by the weather module (and time controls); read by physics, instruments and rendering. */
export interface Environment {
  /** Simulated world time, milliseconds since the Unix epoch (UTC). Drives the sun. */
  utcMs: number;
  /** When true utcMs advances with real time; otherwise the time of day is frozen. */
  timeRunning: boolean;
  /** At least one layer (surface). Interpolated linearly by altitude; held constant above the top layer. */
  wind: WindLayer[];
  /** Peak gust speed above the mean surface wind, kt (0 = steady). */
  gustKt: number;
  /** 0 none … 1 severe */
  turbulence: number;
  visibilitySm: number;
  clouds: CloudLayer[];
  precipitation: "none" | "rain" | "snow";
  /** Temperature and dewpoint at `stationElevFt`, °C. */
  tempC: number;
  dewpointC: number;
  /** Sea-level pressure / altimeter setting, inHg. */
  qnhInHg: number;
  stationElevFt: number;
  source: "preset" | "custom" | "metar" | "nws" | "open-meteo";
  stationId?: string;
  rawReport?: string;
  observedAtMs?: number;
}

// ---------------------------------------------------------------- navigation receivers

export interface VorReceiverState {
  /** A usable signal is being received on the tuned frequency. */
  valid: boolean;
  ident: string;
  name: string;
  kind: "VOR" | "NONE";
  /** Magnetic radial the aircraft is on (bearing FROM the station), degrees. */
  radialMag: number;
  /** Magnetic bearing TO the station. */
  bearingToMag: number;
  /** CDI needle, dots: −5 (full left) … +5 (full right); + = fly right (course is to the right). 1 dot = 2°. */
  cdiDots: number;
  flag: "TO" | "FROM" | "OFF";
  /** Slant-range DME, nm (only when the station has DME). */
  dmeNm: number | null;
  dmeGsKt: number | null;
  /** 0..1 received signal strength (for audio ident volume / flag flicker). */
  signal: number;
}

export interface NavState {
  nav1: VorReceiverState;
  nav2: VorReceiverState;
  adf: { valid: boolean; ident: string; relativeBearing: number };
  /** Station/facility matching the active COM frequency, if any is in range. */
  com1: { station: string; type: string; airportIdent: string; inRange: boolean } | null;
  com2: { station: string; type: string; airportIdent: string; inRange: boolean } | null;
}

// ---------------------------------------------------------------- instruments (what the panel shows)

/**
 * INDICATED values — what the mechanical instruments in the panel display, including lag,
 * precession and errors. The panel must draw these, never the truth values.
 */
export interface InstrumentState {
  /** Airspeed indicator, KIAS. */
  ias: number;
  /** Altimeter indication for the current Kollsman setting, ft. */
  alt: number;
  /** Vertical speed indicator (lags ~6 s), fpm. */
  vs: number;
  /** Attitude indicator. `attFlag` true when the gyro is not up to speed (unreliable). */
  attPitch: number;
  attRoll: number;
  attFlag: boolean;
  /** Heading indicator (directional gyro) reading, magnetic degrees. Drifts; pilot re-aligns it to the compass. */
  dgMag: number;
  dgFlag: boolean;
  /** Magnetic compass reading with turning / acceleration errors, degrees. */
  compassMag: number;
  /** Turn coordinator: standard-rate units (±1 = 3°/s), and ball −1..1 (+ = ball right → step on right rudder). */
  turnRate: number;
  ball: number;
  turnFlag: boolean;
  tachRpm: number;
  /** Hour meter, hours. */
  hobbs: number;
  fuelLeftGal: number;
  fuelRightGal: number;
  oilTempF: number;
  oilPressPsi: number;
  egtF: number;
  suctionInHg: number;
  ammeterA: number;
  /** Clock, seconds since midnight UTC. */
  clockUtcSec: number;
  /** Outside air temperature gauge, °C. */
  oatC: number;
}

// ---------------------------------------------------------------- systems

export interface SystemsState {
  engineRunning: boolean;
  /** Starter engaged and engine turning but not yet running. */
  cranking: boolean;
  /** Human-readable reason the engine is not producing power (for the instructor / explain mode). */
  engineStopReason: string;
  busVolts: number;
  batteryPct: number;
  alternatorOnline: boolean;
  avionicsPowered: boolean;
  /**
   * Optional: current flowing into (+, charging) or out of (−, discharging) the battery, amperes.
   * When the systems module writes it, the ammeter shows it; otherwise the instruments module estimates one.
   */
  batteryAmps?: number;
  vacuumInHg: number;
  /** 0 clean … 1 fully iced carburettor */
  carbIce: number;
  /** 0..1 primer / flooding not modelled; reserved */
  stallHorn: boolean;
  /** Active failures injected by lessons or the instructor panel. */
  failures: { engine: boolean; alternator: boolean; vacuum: boolean; pitot: boolean; staticPort: boolean; radio: boolean };
}

// ---------------------------------------------------------------- truth state

export interface CrashInfo {
  reason: string;
  timeSec: number;
}

export interface SimState {
  /** Simulation time since the last (re)spawn, seconds. */
  time: number;

  // --- position & attitude (truth)
  lat: number; // degrees (geodetic)
  lon: number;
  altMslFt: number;
  aglFt: number; // height of the wheels above the ground (0 when standing on it)
  groundElevFt: number;
  headingTrue: number;
  pitch: number;
  roll: number;
  /** Body rates, deg/s. */
  rollRate: number;
  pitchRate: number;
  yawRate: number;
  /** Rate of change of heading, deg/s (+ = turning right). */
  turnRate: number;

  // --- velocities (truth)
  kcas: number;
  ktas: number;
  gsKt: number;
  trackTrue: number;
  vsFpm: number;
  vNorthKt: number;
  vEastKt: number;
  alphaDeg: number;
  betaDeg: number;
  /** Load factor, g (1 in level flight). */
  nz: number;
  /** Lateral acceleration felt by the ball, g (+ = toward the right wing). */
  ny: number;
  mach: number;

  // --- configuration & engine (truth)
  onGround: boolean;
  flapsDeg: number;
  /** Engine rpm (piston engines) or N1 / Ng in percent (jets and turboprops). */
  rpm: number;
  /** Jets and turboprops: fan / gas-generator speed N1 in percent of maximum (0 for piston engines). */
  n1Pct: number;
  /** Landing gear position: 1 down and locked, 0 up (always 1 for fixed gear). */
  gearPosNorm: number;
  manifoldInHg: number;
  fuelFlowGph: number;
  powerHp: number;
  thrustLb: number;
  /** Engine temperatures and oil pressure (truth; the gauges in `ind` lag behind these). */
  oilTempF: number;
  oilPressPsi: number;
  egtF: number;
  chtF: number;
  fuelLeftGal: number;
  fuelRightGal: number;
  weightLb: number;
  /** CG position aft of datum, inches. */
  cgIn: number;
  /**
   * Control surface positions, degrees (for animating the 3D model): elevatorDeg + = trailing edge up
   * (nose-up command); aileron*Deg + = that aileron's trailing edge down; rudderDeg + = trailing edge right (yaw right).
   */
  surfaces: { elevatorDeg: number; aileronLeftDeg: number; aileronRightDeg: number; rudderDeg: number };

  // --- environment at the aircraft (truth)
  oatC: number;
  staticPressureInHg: number;
  densityAltFt: number;
  pressureAltFt: number;
  windDirTrue: number;
  windKt: number;
  /** Magnetic variation at the aircraft, degrees, east positive. magnetic = true − magVar. */
  magVar: number;
  /** 0 = clear air … 1 = fully inside cloud (drives white-out and IMC cues). */
  inCloud: number;

  // --- status
  stalled: boolean;
  /** Distance flown since spawn, nm. */
  distanceNm: number;
  crash: CrashInfo | null;

  ind: InstrumentState;
  nav: NavState;
  sys: SystemsState;
}

// ---------------------------------------------------------------- spawning

export type SpawnKind = "runway" | "final" | "air" | "ramp";

export interface SpawnRequest {
  kind: SpawnKind;
  /** OurAirports ident (e.g. "KSFO"). Required for runway/final/ramp. */
  airportIdent?: string;
  /** Runway end id, e.g. "28R". Defaults to the end best aligned with the wind (longest runway). */
  runwayEndId?: string;
  /** For "final": distance from the threshold, nm (default 1.5 = short final). */
  finalNm?: number;
  /** For "air": explicit position. */
  lat?: number;
  lon?: number;
  altFtMsl?: number;
  headingTrue?: number;
  kias?: number;
  /** Start with the engine running (default: true except "ramp"). */
  engineRunning?: boolean;
}

export interface SpawnResult {
  request: SpawnRequest;
  airportIdent: string | null;
  runwayEndId: string | null;
  lat: number;
  lon: number;
  altFtMsl: number;
  headingTrue: number;
  onGround: boolean;
}

// ---------------------------------------------------------------- events

export interface TouchdownInfo {
  vsFpm: number;
  kcas: number;
  rollDeg: number;
  pitchDeg: number;
  /** Crab: heading minus track at touchdown, degrees. */
  driftDeg: number;
  lat: number;
  lon: number;
  headingTrue: number;
  gLoad: number;
}

/** Non-flight-control actions, sent as the `command` event by input devices and on-screen buttons. */
export type CommandId =
  | "pause-toggle"
  | "menu-toggle"
  | "help-toggle"
  | "map-toggle"
  | "checklist-toggle"
  | "explain-toggle"
  | "panel-toggle"
  | "hud-toggle"
  | "mute-toggle"
  | "view-next"
  | "view-cockpit"
  | "view-chase"
  | "view-tower"
  | "view-free"
  | "view-reset"
  | "reset-short-final"
  | "restart"
  | "dg-align"
  /** [panel] The NAV 1 "ID" button: listen (or stop listening) to the tuned station's Morse identifier. */
  | "nav1-ident-toggle";

export interface SimEvents {
  spawn: SpawnResult;
  liftoff: { kcas: number };
  touchdown: TouchdownInfo;
  crash: CrashInfo;
  stall: { kcas: number; altMslFt: number };
  stallRecovered: { altitudeLostFt: number };
  engineStart: Record<string, never>;
  engineStop: { reason: string };
  pause: { paused: boolean };
  /** Short message for the pilot (HUD toast / instructor voice). */
  message: { text: string; level: "info" | "coach" | "warn"; speak?: boolean };
  command: { id: CommandId };
  /** Free-form event channel for the training module. */
  training: { type: string; data?: unknown };
}

// ---------------------------------------------------------------- settings

export type Quality = "low" | "medium" | "high";

export interface Settings {
  quality: Quality;
  units: "us" | "metric-alt";
  hdUsImagery: boolean;
  buildings: boolean;
  clouds3d: boolean;
  masterVolume: number;
  engineVolume: number;
  speech: boolean;
  invertPitch: boolean;
  mouseYoke: boolean;
  autoRudder: boolean;
  showHud: boolean;
  controlSensitivity: number;
  /** Aircraft flown at the next start (an id from src/aircraft/catalog.ts). */
  aircraft?: string;
}
