/**
 * Shared types for the simulated ATC engine (scripted scenarios + AI practice).
 * Everything here is for TRAINING ONLY — never real air traffic control.
 */
import type { Airport } from "@/lib/data/types";

export type Station =
  | "Clearance Delivery"
  | "Ground"
  | "Tower"
  | "Departure"
  | "Approach"
  | "Center"
  | "Flight Service"
  | "CTAF";

/** Facility keys used by scenario steps (resolved to real airport frequencies where available). */
export type FacilityKey =
  "clearance" | "ground" | "tower" | "departure" | "approach" | "center" | "fss" | "ctaf";

export interface Facility {
  key: FacilityKey;
  station: Station;
  /** Radio call name, e.g. "Palo Alto Ground", "NorCal Departure". */
  name: string;
  mhz: number;
  /** True when the frequency is a simulated stand-in (not present in the airport dataset). */
  simulated: boolean;
  /** Short note, e.g. "Clearance via Ground at this airport". */
  note?: string;
}

export type Difficulty = "beginner" | "intermediate" | "advanced" | "checkride";
export type Personality = "instructor" | "professional" | "busy" | "examiner";

export const DIFFICULTIES: { id: Difficulty; label: string; description: string }[] = [
  {
    id: "beginner",
    label: "Beginner",
    description:
      "Slow controller, hints, 'say it for me' examples, mistakes explained immediately.",
  },
  {
    id: "intermediate",
    label: "Intermediate",
    description: "Realistic pace, limited hints, only critical errors flagged during the session.",
  },
  {
    id: "advanced",
    label: "Advanced",
    description:
      "Unexpected changes: runway changes, amended altitudes, traffic, frequency changes, weather.",
  },
  {
    id: "checkride",
    label: "Checkride",
    description: "No hints and no explanations until the final report — like a practical test.",
  },
];

export const PERSONALITIES: { id: Personality; label: string; description: string }[] = [
  {
    id: "instructor",
    label: "Friendly instructor",
    description: "Patient, slower delivery, a little extra courtesy.",
  },
  {
    id: "professional",
    label: "Standard professional",
    description: "By-the-book FAA phraseology at a normal pace.",
  },
  {
    id: "busy",
    label: "Busy tower",
    description:
      "Terse and fast, with other traffic on frequency — watch for blocked transmissions.",
  },
  {
    id: "examiner",
    label: "Strict examiner",
    description: "Precise, unforgiving scoring of phraseology and readbacks.",
  },
];

export type ScenarioPhase = "ground" | "departure" | "enroute" | "arrival" | "ifr" | "emergency";

export const PHASES: { id: ScenarioPhase; label: string }[] = [
  { id: "ground", label: "Ground" },
  { id: "departure", label: "Departure" },
  { id: "enroute", label: "En route" },
  { id: "arrival", label: "Arrival" },
  { id: "ifr", label: "IFR" },
  { id: "emergency", label: "Emergency" },
];

export type ScenarioId =
  | "taxi"
  | "takeoff"
  | "departure"
  | "flight-following"
  | "freq-change"
  | "traffic-advisory"
  | "class-d-entry"
  | "landing"
  | "go-around"
  | "ifr-clearance-request"
  | "ifr-departure-clearance"
  | "instrument-approach"
  | "established-final"
  | "freq-change-request"
  | "emergency";

export interface Phrase {
  /** Written form shown in the transcript. */
  text: string;
  /** Form read aloud by text-to-speech (phonetic letters, digit-by-digit numbers, "niner"). */
  spoken: string;
}

export interface CallsignInfo {
  /** Written full callsign, e.g. "N172TX". */
  full: string;
  /** Written abbreviated callsign, e.g. "N2TX". Equal to `full` when abbreviation is not allowed. */
  abbrev: string;
  fullSpoken: string;
  abbrevSpoken: string;
  canAbbreviate: boolean;
  /** Lowercase compact forms accepted in pilot transmissions. */
  fullForms: string[];
  abbrevForms: string[];
}

export interface Clearance {
  /** C — clearance limit, e.g. "the Monterey airport". */
  limit: string;
  /** R — route, e.g. "radar vectors SNS, then as filed". */
  route: string;
  /** A — initial altitude (ft). */
  altitude: number;
  /** A — expected altitude (ft) and when. */
  expectAltitude: number;
  expectMinutes: number;
  /** F — departure frequency. */
  departureMhz: number;
  /** T — transponder code. */
  squawk: string;
}

export interface AircraftInfo {
  id: string;
  shortName: string;
  /** Word used in place of "November" (e.g. "Skyhawk"). */
  typeWord: string;
  /** How a pilot describes the type to ATC ("Cessna 172"). */
  spokenType: string;
  icaoType: string;
  /** Equipment suffix (FAA domestic), e.g. "G" for GNSS. */
  equip: string;
  /** Words accepted as the type in pilot transmissions. */
  typeKeywords: string[];
}

export interface RunwayInfo {
  /** US style, no leading zero: "28R", "4L", "31". */
  id: string;
  /** Dataset id (may include leading zero): "04L". */
  dataId: string;
  magHeading: number;
  pattern: "left" | "right";
  ils: { freq: number; ident: string } | null;
}

export interface AtisInfo {
  letter: string;
  zuluTime: string;
  windDirMag: number;
  windKt: number;
  visibilitySm: number;
  sky: string;
  tempC: number;
  dewC: number;
  altimeter: number;
  phrase: Phrase;
}

export interface ScenarioContext {
  airport: Airport;
  /** Spoken short airport name, e.g. "Palo Alto". */
  airportName: string;
  aircraft: AircraftInfo;
  cs: CallsignInfo;
  /** Facilities on which ATC has already used the abbreviated callsign (pilot may then abbreviate). */
  abbrevBy: Partial<Record<FacilityKey, boolean>>;
  runway: RunwayInfo;
  /** Alternate runway used for "runway change" curveballs. */
  altRunway: RunwayInfo | null;
  atis: AtisInfo;
  atisFreq: number | null;
  facilities: Partial<Record<FacilityKey, Facility>>;
  taxiRoute: string[];
  parking: string;
  patternAltitude: number;
  squawk: string;
  destination: { icao: string; name: string; bearing: number; distanceNm: number };
  vfrCruise: number;
  ifrInitial: number;
  ifrCruise: number;
  departureHeading: number;
  /** Narrative position, e.g. "10 miles north of Palo Alto". */
  position: string;
  positionDir: string;
  positionMiles: number;
  altitude: number;
  heading: number;
  clearance: Clearance | null;
  traffic: string[];
  emergency: { kind: "distress" | "urgency"; nature: string; souls: number; fuelMinutes: number };
  /** Approach name used in IFR arrival scenarios, e.g. "ILS runway 10R". */
  approachName: string;
  interceptAltitude: number;
  /** Flags noted from the pilot's transmissions (e.g. souls/fuel already reported). */
  reported: Record<string, boolean>;
  rules: "VFR" | "IFR";
}

export type Category =
  | "phraseology"
  | "readback"
  | "identification"
  | "runway"
  | "altitude"
  | "heading"
  | "frequency"
  | "awareness"
  | "timing";

export const CATEGORY_LABEL: Record<Category, string> = {
  phraseology: "Phraseology",
  readback: "Readback accuracy",
  identification: "Aircraft identification",
  runway: "Runway identification",
  altitude: "Altitude readback",
  heading: "Heading readback",
  frequency: "Frequency management",
  awareness: "Situational awareness",
  timing: "Communication timing",
};

export const CATEGORY_ORDER: Category[] = [
  "phraseology",
  "readback",
  "identification",
  "runway",
  "altitude",
  "heading",
  "frequency",
  "awareness",
  "timing",
];

export type Severity = "critical" | "major" | "minor";

export const SEVERITY_WEIGHT: Record<Severity, number> = { critical: 30, major: 15, minor: 6 };

export interface EvalItem {
  label: string;
  categories: Category[];
  ok: boolean;
  severity: Severity;
  /** Explanation of the mistake (or confirmation when ok). */
  message: string;
  /** Correct phraseology fragment, e.g. "hold short runway 31". */
  correct?: string;
}

export interface TransmissionEval {
  id: string;
  stepId: string;
  stepTitle: string;
  station: string;
  text: string;
  attempt: number;
  /** 0–100 */
  score: number;
  items: EvalItem[];
  delaySec: number | null;
  /** Correct example for this transmission. */
  example: string;
  /** Short verdict. */
  summary: string;
  at: number;
}

export interface SessionReport {
  score: number;
  /** label -> 0..100 (only categories that were exercised). */
  breakdown: Record<string, number>;
  categories: { key: Category; label: string; score: number; checks: number }[];
  feedback: string[];
  strengths: string[];
  transmissions: TransmissionEval[];
  grade: "Excellent" | "Proficient" | "Needs practice" | "Unsatisfactory";
}

/** A line in the radio transcript. */
export interface RadioLine {
  id: string;
  from: "pilot" | "atc" | "traffic" | "system";
  station?: string;
  text: string;
  /** Milliseconds since session start. */
  t: number;
  tone?: "info" | "ok" | "caution" | "warning";
  mhz?: number;
}
