/**
 * Flight simulation state types.
 *
 * ONE SimEngine owns ONE SimSnapshot. Every instrument (PFD, MFD, six-pack, HSI, GPS,
 * autopilot panel, 3D view, HUD) reads from the same snapshot, so all displays stay in sync.
 *
 * Instruments must display `snapshot.indicated.*` (what the instrument would show, including
 * failures such as a blocked pitot tube or failed vacuum pump) rather than `aircraft.*`
 * (the true physical state), except where there is no instrument error to model.
 */

export interface Controls {
  /** −1..1, + = pull (nose up). Includes pilot input only; trim is separate. */
  elevator: number;
  /** −1..1, + = roll right. */
  aileron: number;
  /** −1..1, + = yaw right / steer right on ground. */
  rudder: number;
  /** 0..1 */
  throttle: number;
  /** 0..1 (1 = full rich) */
  mixture: number;
  /** Index into perf.flapDetents (the commanded detent). */
  flapIndex: number;
  gearDown: boolean;
  /** 0..1 toe brakes */
  brakes: number;
  parkingBrake: boolean;
  /** −1..1 elevator trim (+ = nose up). */
  trim: number;
  fuelSelector: "both" | "left" | "right" | "off";
  lights: {
    nav: boolean;
    beacon: boolean;
    strobe: boolean;
    landing: boolean;
    taxi: boolean;
    panel: boolean;
  };
  masterBattery: boolean;
  alternator: boolean;
  avionicsMaster: boolean;
  pitotHeat: boolean;
  /** Carburetor heat / anti-ice */
  carbHeat: boolean;
}

export interface AircraftState {
  lat: number;
  lon: number;
  altMslFt: number;
  aglFt: number;
  groundElevFt: number;

  /** Attitude, degrees. Pitch + = nose up, bank + = right wing down. Heading is TRUE. */
  pitch: number;
  bank: number;
  heading: number;
  pitchRate: number;
  rollRate: number;
  yawRate: number;
  /** Rate of heading change, deg/s (+ = right). Standard rate = 3 deg/s. */
  turnRate: number;

  iasKt: number;
  tasKt: number;
  gsKt: number;
  vsFpm: number;
  mach: number;
  /** Ground track, TRUE degrees. */
  track: number;
  flightPathDeg: number;
  aoaDeg: number;
  /** Inclinometer ball −1..1 (+ = ball right → needs right rudder). */
  slip: number;
  loadFactor: number;

  onGround: boolean;
  stallWarning: boolean;
  stalled: boolean;
  overspeed: boolean;
  crashed: boolean;
  crashReason: string;

  engineRunning: boolean;
  /** Seconds remaining in the start sequence (0 = not cranking). */
  engineCranking: number;
  /** Propeller RPM (piston/turboprop) or N1 % (jet). */
  rpm: number;
  /** Fraction of rated power/thrust being produced 0..1 */
  powerFraction: number;
  fuelFlowGph: number;
  fuelLeftGal: number;
  fuelRightGal: number;
  oilPressPsi: number;
  oilTempF: number;
  manifoldInHg: number;
  carbIce: number;

  flapsDeg: number;
  /** 0 = up, 1 = down & locked */
  gearPosition: number;
  busVolts: number;
  batteryPct: number;
  ammeterA: number;
  /** Outside air temperature at aircraft, °C */
  oatC: number;
  densityAltFt: number;
  weightLb: number;

  simTimeSec: number;
  /** Distance flown, nm */
  distanceNm: number;
}

export interface ComRadio {
  active: number;
  standby: number;
}

export interface NavRadio {
  active: number;
  standby: number;
  /** Omni-bearing selector / course, magnetic degrees. */
  obs: number;
}

export interface Radios {
  com1: ComRadio;
  com2: ComRadio;
  nav1: NavRadio;
  nav2: NavRadio;
  adfKhz: number;
  transponder: { code: string; mode: "STBY" | "ON" | "ALT" };
  /** Source driving the HSI/CDI and autopilot NAV mode. */
  cdiSource: "GPS" | "NAV1" | "NAV2";
  /** Kollsman window, inHg. */
  altimeterInHg: number;
  /** Bugs */
  hdgBug: number;
  altBug: number;
  vsBug: number;
  iasBug: number;
}

export interface NavReceiverOutput {
  /** Is a station tuned & receivable? */
  valid: boolean;
  ident: string;
  kind: "VOR" | "LOC" | "ILS" | "NONE";
  freq: number;
  /** For VOR: magnetic radial the aircraft is on (FROM the station). */
  radial: number;
  /** Course deviation in dots, −2.5..+2.5. + = needle deflected RIGHT (course is to the right). */
  cdiDots: number;
  toFrom: "TO" | "FROM" | "OFF";
  /** Localizer front course (magnetic) when tuned to a LOC/ILS. */
  locCourse: number;
  gsValid: boolean;
  /** Glideslope dots −2.5..+2.5. + = needle ABOVE center (glidepath above you → fly up). */
  gsDots: number;
  dmeValid: boolean;
  dmeNm: number;
  /** Bearing to station (magnetic) */
  bearingTo: number;
}

export interface Waypoint {
  id: string;
  lat: number;
  lon: number;
  kind: "airport" | "vor" | "fix" | "user" | "runway";
  /** Optional altitude constraint (approaches) ft MSL */
  altFt?: number;
  label?: string;
}

export interface GpsState {
  flightPlan: Waypoint[];
  activeLeg: number;
  /** Direct-to target, overrides flight plan when set. */
  directTo: Waypoint | null;
  approach: null | { airport: string; runway: string; kind: "ILS" | "RNAV"; label: string };
  mode: "ENR" | "TERM" | "APR";
}

export interface GpsOutput {
  valid: boolean;
  fromId: string;
  toId: string;
  /** Desired track (magnetic) */
  dtk: number;
  /** Bearing to active waypoint (magnetic) */
  brg: number;
  distNm: number;
  /** Cross-track error, nm, + = right of course */
  xtkNm: number;
  eteMin: number;
  /** CDI dots (full scale depends on mode: ENR 2nm, TERM 1nm, APR 0.3nm). + = course is to the right. */
  cdiDots: number;
  /** Vertical deviation dots for RNAV approach glidepath (LPV), + = path above. */
  vdevDots: number;
  vdevValid: boolean;
  toFrom: "TO" | "FROM";
  /** Total remaining distance in the flight plan */
  remainingNm: number;
}

export interface NavOutputs {
  nav1: NavReceiverOutput;
  nav2: NavReceiverOutput;
  gps: GpsOutput;
  /** The selected CDI source projected for the HSI. */
  hsi: {
    source: Radios["cdiSource"];
    course: number;
    cdiDots: number;
    toFrom: "TO" | "FROM" | "OFF";
    gsDots: number;
    gsValid: boolean;
    label: string;
  };
  adf: { valid: boolean; ident: string; relBearing: number };
  marker: "OM" | "MM" | "IM" | null;
}

export type LateralMode = "ROL" | "HDG" | "NAV" | "APR";
export type VerticalMode = "PIT" | "ALT" | "VS" | "FLC" | "GS";

export interface AutopilotState {
  /** Servos engaged (AP). The flight director can be on without the AP. */
  engaged: boolean;
  fd: boolean;
  yd: boolean;
  lateral: LateralMode;
  vertical: VerticalMode;
  /** Armed modes waiting for capture */
  lateralArmed: "NAV" | "LOC" | null;
  verticalArmed: "ALTS" | "GS" | null;
  /** Captured lateral mode for APR: LOC/GPS */
  approachCaptured: boolean;
  targetPitch: number;
  /** Flight director command bars, degrees. */
  fdPitch: number;
  fdBank: number;
  /** Message line, e.g. "AP DISCONNECT" */
  annunciation: string;
}

export interface Failures {
  engine: boolean;
  /** Alternator failure: battery slowly depletes, then electrical avionics fail. */
  alternator: boolean;
  /** Vacuum pump failure: attitude & heading indicators (steam gauges) slowly tumble/freeze. */
  vacuum: boolean;
  /** Pitot tube blocked (ice): ASI acts like an altimeter. */
  pitot: boolean;
  /** Static port blocked: altimeter frozen, VSI zero, ASI errors. */
  static: boolean;
  /** Communication radios inoperative. */
  radios: boolean;
  /** GPS position lost */
  gps: boolean;
  /** PFD (AHRS) failure → glass reverts to standby instruments. */
  ahrs: boolean;
}

export interface WeatherState {
  /** Surface wind, FROM direction, true degrees, knots. */
  windDir: number;
  windKt: number;
  gustKt: number;
  /** Wind at 6000 ft AGL (wind veers & strengthens with height). */
  windAloftDir: number;
  windAloftKt: number;
  turbulence: 0 | 1 | 2 | 3;
  visibilitySm: number;
  /** Cloud base AGL ft, null for clear. */
  cloudBaseFt: number | null;
  cloudTopsFt: number | null;
  cloudCover: "CLR" | "FEW" | "SCT" | "BKN" | "OVC";
  precipitation: "none" | "rain" | "snow";
  /** Surface temperature °C */
  tempC: number;
  /** Actual sea-level pressure, inHg */
  qnhInHg: number;
  /** Local time of day in hours 0..24 */
  timeOfDay: number;
}

export interface Indicated {
  iasKt: number;
  altFt: number;
  vsFpm: number;
  /** Magnetic heading as shown on the heading indicator / HSI */
  headingMag: number;
  /** Magnetic compass (with turning/acceleration errors) */
  compass: number;
  pitch: number;
  bank: number;
  turnRate: number;
  slip: number;
  /** Is the attitude/heading source valid (false when AHRS/vacuum failed) */
  attitudeValid: boolean;
  headingValid: boolean;
  airDataValid: boolean;
  /** Electrical power to avionics available */
  avionicsPowered: boolean;
}

export interface SimEvent {
  t: number;
  type:
    | "touchdown"
    | "liftoff"
    | "stall"
    | "crash"
    | "overspeed"
    | "failure"
    | "engine"
    | "info"
    | "gear-warning";
  message: string;
  data?: Record<string, number | string | boolean>;
}

export interface SimSnapshot {
  perfId: string;
  aircraft: AircraftState;
  controls: Controls;
  radios: Radios;
  nav: NavOutputs;
  gps: GpsState;
  ap: AutopilotState;
  failures: Failures;
  weather: WeatherState;
  indicated: Indicated;
  paused: boolean;
  /** Active caution/warning annunciations, e.g. ["LOW VOLTS", "STALL"] */
  alerts: { text: string; level: "caution" | "warning" | "advisory" }[];
  /** Reference airport for local magnetic variation */
  magVar: number;
}

export interface StartState {
  lat: number;
  lon: number;
  altMslFt: number;
  heading: number;
  iasKt: number;
  onGround: boolean;
  groundElevFt: number;
  engineRunning: boolean;
  flapIndex?: number;
  gearDown?: boolean;
  throttle?: number;
  fuelFraction?: number;
  trim?: number;
}
