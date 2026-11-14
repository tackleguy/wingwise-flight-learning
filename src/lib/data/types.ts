/**
 * Shared aviation data types used by the simulator, ATC, planner and reference pages.
 */

export type LatLon = { lat: number; lon: number };

export type FrequencyType =
  | "ATIS"
  | "AWOS"
  | "CLNC"
  | "GND"
  | "TWR"
  | "CTAF"
  | "UNICOM"
  | "APP"
  | "DEP"
  | "CTR"
  | "FSS";

export interface Frequency {
  type: FrequencyType;
  mhz: number;
  name: string;
}

export interface RunwayEnd {
  /** e.g. "28R" */
  id: string;
  /** True heading of the runway in this direction, degrees. */
  trueHeading: number;
  /** Threshold position. */
  threshold: LatLon;
  /** Traffic pattern direction for this runway. */
  pattern: "left" | "right";
  /** Localizer, if this end has an ILS (simulated values — see dataset notice). */
  ils?: { freq: number; ident: string; glideslopeDeg: number };
}

export interface Runway {
  /** e.g. "10L/28R" */
  name: string;
  lengthFt: number;
  widthFt: number;
  surface: "asphalt" | "concrete" | "grass";
  ends: [RunwayEnd, RunwayEnd];
}

export type AirspaceClass = "B" | "C" | "D" | "E" | "G";

export interface Airport {
  icao: string;
  iata?: string;
  name: string;
  city: string;
  region: string;
  country: string;
  lat: number;
  lon: number;
  elevationFt: number;
  /** Magnetic variation in degrees; east positive, west negative. Magnetic = True − variation. */
  magVar: number;
  airspace: AirspaceClass;
  towered: boolean;
  frequencies: Frequency[];
  runways: Runway[];
  taxiways: string[];
  /** IDs into NAVAIDS */
  nearbyNavaids: string[];
  procedures: string[];
  notes: string[];
  /** Tags for training use. */
  training: string[];
}

export type NavaidType = "VOR" | "VOR-DME" | "VORTAC" | "NDB" | "FIX";

export interface Navaid {
  id: string;
  name: string;
  type: NavaidType;
  /** MHz for VOR, kHz for NDB. */
  freq?: number;
  lat: number;
  lon: number;
  magVar: number;
}

export type AircraftCategory =
  | "single-piston"
  | "multi-piston"
  | "high-performance"
  | "turboprop"
  | "business"
  | "airliner";

/**
 * Simplified flight-model parameters. These are EDUCATIONAL APPROXIMATIONS chosen to
 * produce believable handling; they are not approved operating data (POH/AFM).
 */
export interface AircraftPerf {
  id: string;
  shortName: string;
  powerType: "piston" | "turboprop" | "jet";
  engines: number;
  /** Rated power per engine (piston/turboprop). */
  hpPerEngine: number;
  /** Static thrust per engine for jets (lbf). */
  thrustLbfPerEngine: number;
  turbocharged: boolean;
  emptyWeightLb: number;
  maxGrossLb: number;
  defaultPayloadLb: number;
  wingAreaSqFt: number;
  wingSpanFt: number;
  /** Parasite drag coefficient, clean. */
  cd0: number;
  /** Oswald efficiency. */
  oswald: number;
  clMaxClean: number;
  clMaxFull: number;
  /** Lift-curve slope per radian (finite wing). */
  clAlpha: number;
  /** Lift coefficient at zero angle of attack (clean). */
  cl0: number;
  propEfficiency: number;
  /** Detent angles for flaps, degrees, including 0. */
  flapDetents: number[];
  retractableGear: boolean;
  /** V-speeds in KIAS. */
  v: {
    so: number;
    s1: number;
    r: number;
    x: number;
    y: number;
    a: number;
    fe: number;
    no: number;
    ne: number;
    ref: number;
    /** Best glide */
    g: number;
    /** Gear operating/extended (retractables). */
    le?: number;
    /** Vmc for twins. */
    mc?: number;
  };
  cruiseKtas: number;
  cruiseAltFt: number;
  serviceCeilingFt: number;
  usableFuelGal: number;
  fuelType: "100LL" | "Jet-A";
  /** Gallons per hour at full power (all engines). */
  fuelBurnFullGph: number;
  /** Gallons per hour at typical cruise. */
  fuelBurnCruiseGph: number;
  rollRateDps: number;
  pitchRateDps: number;
  /** Eye height above ground on the gear, ft. */
  eyeHeightFt: number;
  avionics: "steam" | "g1000" | "perspective" | "airliner";
}
