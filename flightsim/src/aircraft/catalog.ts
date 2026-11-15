/**
 * The hangar: the ten aircraft the simulator offers.
 *
 * Every aircraft flies with FlightGear's flight-dynamics engine (JSBSim, built from the FlightGear
 * source code — see flightsim/jsbsim/build-flightgear.sh) and looks like the FlightGear aircraft of
 * the same type (3D models converted from FlightGear's hangars — see public/models/fg/CREDITS.md).
 *
 * The flight models are JSBSim's own aircraft files (flightsim/jsbsim/aircraft/<jsbsim>/). Only the
 * Cessna 172P has been tuned and checked against its handbook by this project; the other nine fly
 * as their authors made them. Speeds below are rounded, typical published figures for the type
 * (KIAS) — for learning only, never a substitute for the real aircraft's flight manual.
 *
 * Numbers marked "measured" were read from the flight-model files or measured with the flight
 * model itself (flightsim/scripts/aircraft-check.mjs prints them again).
 */
import { AIRCRAFT } from "@/core/defaults";
import type { AircraftSpec } from "@/core/types";

export type AircraftId = "c172p" | "c182" | "pa28" | "J3Cub" | "c310" | "DHC6" | "p51d" | "A320" | "f16" | "t6texan2";
export type EngineKind = "piston" | "turboprop" | "jet";
/** What part of the airframe a non-wheel contact point is (decides the crash message). */
export type StrikePart = "wing" | "nose" | "tail" | "engine" | "body" | "propeller";

export interface Aircraft extends AircraftSpec {
  id: AircraftId;
  /** Short name for buttons, e.g. "Cessna 182". */
  shortName: string;
  /** Kind of aircraft, in plain words, e.g. "Trainer". */
  category: string;
  /** One or two sentences for the aircraft picker. */
  blurb: string;
  /** How to take off, in plain words. */
  tips: string;
  /** JSBSim model name (folder in flightsim/jsbsim/aircraft). */
  jsbsim: string;
  engines: number;
  engine: EngineKind;
  /** Height of the centre of gravity above the ground when standing on the wheels (measured, struts compressed), ft. */
  cgHeightFt: number;
  /** Height of the centre of gravity used to place the aircraft for a ground start (struts extended, plus a little), ft. */
  groundStartAglFt: number;
  /** Flap angle of the flight model at full flap (flapNorm = degrees / flapMaxDeg). */
  flapMaxDeg: number;
  /** Flap notch used for a start on short final. */
  finalFlapIndex: number;
  /** Typical cruise speed, KIAS (used for "in the air" starts). */
  cruiseKt: number;
  /** Throttle for "in the air" starts before trimming. */
  cruiseThrottle: number;
  /** Highest speed on the airspeed indicator, kt. */
  asiMaxKt: number;
  /** Angle of attack above which the simulator calls a stall, degrees. */
  stallAlphaDeg: number;
  retractableGear: boolean;
  tailwheel: boolean;
  /** Constant-speed (governed) propeller: the propeller lever is kept full forward. */
  constantSpeedProp: boolean;
  /** Ground-contact points that are not wheels: JSBSim gear unit number and what it is. */
  strikes: { unit: number; part: StrikePart }[];
  /**
   * FlightGear-only inputs some flight models read (FlightGear copies these every frame from the
   * flight model): [property to write, JSBSim property to copy it from].
   */
  fgMirror: [string, string][];
  /** The model has no right-aileron output: draw the right aileron as the mirror of the left one. */
  rightAileronFromLeft?: boolean;
  /** Nose-up pitch trim (0..1) set for take-off. */
  takeoffTrim?: number;
  /** How much to trust the flight model, in plain words. */
  realism: string;
}

const C172P: Aircraft = {
  ...AIRCRAFT,
  id: "c172p",
  name: "Cessna 172P Skyhawk",
  shortName: "Cessna 172",
  category: "Trainer",
  blurb: "The classic four-seat training aircraft. Gentle, stable and forgiving — the best place to start.",
  tips: "Release the parking brake (B), full throttle (hold W), keep straight with A / D and gently pull back at about 55 knots.",
  jsbsim: "c172p",
  engines: 1,
  engine: "piston",
  cgHeightFt: 4.36,
  groundStartAglFt: 4.5,
  flapMaxDeg: 30,
  finalFlapIndex: 3,
  cruiseKt: 100,
  cruiseThrottle: 0.6,
  asiMaxKt: 200,
  stallAlphaDeg: 16,
  retractableGear: false,
  tailwheel: false,
  constantSpeedProp: false,
  strikes: [
    { unit: 3, part: "nose" },
    { unit: 5, part: "wing" },
    { unit: 6, part: "wing" },
  ],
  fgMirror: [],
  realism: "Tuned and checked against the Cessna 172P handbook by this project.",
};

export const AIRCRAFT_LIST: readonly Aircraft[] = [
  C172P,
  {
    id: "c182",
    name: "Cessna 182 Skylane",
    shortName: "Cessna 182",
    category: "High-performance single",
    blurb: "A bigger, faster Cessna with a 230 hp engine and a constant-speed propeller.",
    tips: "Same as the 172, but it pulls harder: lift off at about 60 knots.",
    jsbsim: "c182",
    engines: 1,
    engine: "piston",
    flapDetentsDeg: [0, 10, 20, 30],
    v: { s0: 50, s1: 56, r: 60, x: 63, y: 80, glide: 70, fe: 95, a: 112, no: 143, ne: 175, approach: 70 },
    usableFuelGal: 75,
    maxGrossLb: 2950,
    emptyWeightLb: 1717,
    maxRpm: 2400,
    idleRpm: 700,
    cgHeightFt: 4.63,
    groundStartAglFt: 5.0,
    flapMaxDeg: 30,
    finalFlapIndex: 3,
    cruiseKt: 125,
    cruiseThrottle: 0.75,
    asiMaxKt: 200,
    stallAlphaDeg: 16,
    retractableGear: false,
    tailwheel: false,
    constantSpeedProp: true,
    strikes: [
      { unit: 3, part: "tail" },
      { unit: 4, part: "wing" },
      { unit: 5, part: "wing" },
    ],
    fgMirror: [],
    rightAileronFromLeft: true,
    realism: "JSBSim's Cessna 182 as its authors made it (not tuned by this project).",
  },
  {
    id: "pa28",
    name: "Piper PA-28 Cherokee",
    shortName: "Piper Cherokee",
    category: "Trainer",
    blurb: "A low-wing four-seat trainer. Feels a little heavier on the controls than the Cessna.",
    tips: "Full throttle, keep straight, and rotate at about 60 knots.",
    jsbsim: "pa28",
    engines: 1,
    engine: "piston",
    flapDetentsDeg: [0, 15, 25, 40],
    v: { s0: 49, s1: 55, r: 60, x: 64, y: 76, glide: 73, fe: 100, a: 113, no: 126, ne: 160, approach: 70 },
    usableFuelGal: 48,
    maxGrossLb: 2400,
    emptyWeightLb: 1225,
    maxRpm: 2700,
    idleRpm: 700,
    cgHeightFt: 3.51,
    groundStartAglFt: 4.5,
    flapMaxDeg: 40,
    finalFlapIndex: 3,
    cruiseKt: 110,
    cruiseThrottle: 0.75,
    asiMaxKt: 200,
    stallAlphaDeg: 16,
    retractableGear: false,
    tailwheel: false,
    constantSpeedProp: true,
    strikes: [
      { unit: 3, part: "tail" },
      { unit: 4, part: "tail" },
      { unit: 5, part: "tail" },
      { unit: 6, part: "wing" },
      { unit: 7, part: "wing" },
      { unit: 8, part: "nose" },
    ],
    fgMirror: [],
    realism: "JSBSim's PA-28 as its authors made it, except that the main wheels no longer swivel freely (a fix this project also made on the main SkyReady site).",
  },
  {
    id: "J3Cub",
    name: "Piper J-3 Cub",
    shortName: "Piper Cub",
    category: "Tailwheel classic",
    blurb: "A light, slow 1930s two-seater with the third wheel under the tail. Fun, and a real test of rudder skill.",
    tips: "Full throttle, push the stick slightly forward to raise the tail, keep it straight with lots of rudder, and it flies itself off at about 40 knots.",
    jsbsim: "J3Cub",
    engines: 1,
    engine: "piston",
    flapDetentsDeg: [0],
    v: { s0: 33, s1: 33, r: 40, x: 39, y: 48, glide: 48, fe: 33, a: 65, no: 74, ne: 106, approach: 50 },
    usableFuelGal: 12,
    maxGrossLb: 1220,
    emptyWeightLb: 680,
    maxRpm: 2300,
    idleRpm: 550,
    cgHeightFt: 3.77,
    groundStartAglFt: 4.8,
    flapMaxDeg: 1,
    finalFlapIndex: 0,
    cruiseKt: 65,
    cruiseThrottle: 0.75,
    asiMaxKt: 140,
    stallAlphaDeg: 16,
    retractableGear: false,
    tailwheel: true,
    constantSpeedProp: false,
    strikes: [
      { unit: 3, part: "wing" },
      { unit: 4, part: "wing" },
    ],
    fgMirror: [],
    realism: "JSBSim's J-3 Cub as its authors made it (not tuned by this project).",
  },
  {
    id: "c310",
    name: "Cessna 310",
    shortName: "Cessna 310",
    category: "Light twin",
    blurb: "A fast six-seat twin with two 260 hp engines and retractable landing gear.",
    tips: "Full throttle (both engines move together), rotate at about 90 knots, then raise the gear with G once you are climbing.",
    jsbsim: "c310",
    engines: 2,
    engine: "piston",
    flapDetentsDeg: [0, 15, 25, 45],
    v: { s0: 64, s1: 73, r: 90, x: 92, y: 106, glide: 110, fe: 139, a: 147, no: 182, ne: 223, approach: 95 },
    usableFuelGal: 102,
    maxGrossLb: 5500,
    emptyWeightLb: 3200,
    maxRpm: 2700,
    idleRpm: 700,
    cgHeightFt: 3.32,
    groundStartAglFt: 3.6,
    flapMaxDeg: 45,
    finalFlapIndex: 2,
    cruiseKt: 160,
    cruiseThrottle: 0.75,
    asiMaxKt: 260,
    stallAlphaDeg: 16,
    retractableGear: true,
    tailwheel: false,
    constantSpeedProp: true,
    strikes: [
      { unit: 3, part: "tail" },
      { unit: 4, part: "nose" },
      { unit: 5, part: "body" },
      { unit: 6, part: "body" },
      { unit: 7, part: "body" },
      { unit: 8, part: "wing" },
      { unit: 9, part: "wing" },
    ],
    fgMirror: [],
    realism: "JSBSim's Cessna 310 as its authors made it (not tuned by this project). Its flight-model file is GPL-licensed.",
  },
  {
    id: "DHC6",
    name: "de Havilland Canada DHC-6 Twin Otter",
    shortName: "Twin Otter",
    category: "Turboprop commuter",
    blurb: "A rugged 19-seat twin turboprop that flies to short, rough airstrips all over the world.",
    tips: "Full power, rotate at about 75 knots. The engines take a moment to spool up.",
    jsbsim: "DHC6",
    engines: 2,
    engine: "turboprop",
    flapDetentsDeg: [0, 10, 20, 30, 40],
    v: { s0: 58, s1: 68, r: 75, x: 80, y: 100, glide: 100, fe: 103, a: 141, no: 150, ne: 170, approach: 85 },
    usableFuelGal: 378,
    maxGrossLb: 12500,
    emptyWeightLb: 7415,
    // turboprop: the engine gauge shows gas-generator speed (Ng / N1) in percent
    maxRpm: 100,
    idleRpm: 60,
    cgHeightFt: 8.35,
    groundStartAglFt: 8.9,
    flapMaxDeg: 40,
    finalFlapIndex: 3,
    cruiseKt: 140,
    cruiseThrottle: 0.8,
    asiMaxKt: 220,
    stallAlphaDeg: 15,
    retractableGear: false,
    tailwheel: false,
    constantSpeedProp: true,
    strikes: [],
    fgMirror: [],
    realism: "JSBSim's Twin Otter as its authors made it (not tuned by this project).",
  },
  {
    id: "p51d",
    name: "North American P-51D Mustang",
    shortName: "P-51 Mustang",
    category: "Warbird",
    blurb: "The famous World War II fighter: a 1,490 hp Merlin engine, a huge four-blade propeller and a tailwheel.",
    tips: "Add power SLOWLY — the propeller pulls hard to the left, so hold right rudder. Raise the tail gently, lift off at about 110–120 knots, then gear up with G.",
    jsbsim: "p51d",
    engines: 1,
    engine: "piston",
    flapDetentsDeg: [0, 10, 20, 30, 40, 47],
    v: { s0: 87, s1: 95, r: 110, x: 120, y: 150, glide: 150, fe: 143, a: 250, no: 300, ne: 440, approach: 120 },
    usableFuelGal: 269,
    maxGrossLb: 11600,
    emptyWeightLb: 7635,
    maxRpm: 3000,
    idleRpm: 800,
    cgHeightFt: 5.93,
    groundStartAglFt: 7.0,
    flapMaxDeg: 47,
    finalFlapIndex: 3,
    cruiseKt: 230,
    cruiseThrottle: 0.6,
    asiMaxKt: 450,
    stallAlphaDeg: 17,
    retractableGear: true,
    tailwheel: true,
    constantSpeedProp: true,
    strikes: [
      { unit: 3, part: "wing" },
      { unit: 4, part: "wing" },
      { unit: 5, part: "tail" },
      { unit: 6, part: "tail" },
      { unit: 7, part: "nose" },
      { unit: 8, part: "nose" },
      { unit: 9, part: "body" },
      { unit: 10, part: "body" },
      { unit: 11, part: "body" },
      { unit: 12, part: "propeller" },
      { unit: 13, part: "propeller" },
      { unit: 14, part: "propeller" },
      { unit: 15, part: "propeller" },
    ],
    // The Mustang's automatic manifold-pressure regulator reads FlightGear's throttle lever and
    // manifold-pressure gauge, which FlightGear itself would copy from the flight model every frame.
    fgMirror: [
      ["/engines/engine/mp-inhg", "propulsion/engine/map-inhg"],
      ["/controls/engines/engine/throttle", "fcs/throttle-cmd-norm"],
    ],
    takeoffTrim: 0.3,
    realism: "JSBSim's P-51D as its authors made it (not tuned by this project).",
  },
  {
    id: "A320",
    name: "Airbus A320",
    shortName: "Airbus A320",
    category: "Airliner",
    blurb: "A 150-seat twin-jet airliner. Big, heavy and slow to respond — plan everything early.",
    tips: "Set flaps one notch (F), full thrust, and start pulling at about 150 knots. Keep pulling: this flight model leaves the ground at about 180 knots (a real A320 at about 145). Gear up with G when climbing.",
    jsbsim: "A320",
    engines: 2,
    engine: "jet",
    flapDetentsDeg: [0, 10, 15, 25, 40],
    v: { s0: 115, s1: 140, r: 145, x: 160, y: 210, glide: 210, fe: 177, a: 250, no: 300, ne: 350, approach: 135 },
    usableFuelGal: 6400,
    maxGrossLb: 162000,
    emptyWeightLb: 93000,
    maxRpm: 100,
    idleRpm: 20,
    cgHeightFt: 8.42,
    groundStartAglFt: 8.8,
    flapMaxDeg: 40,
    finalFlapIndex: 4,
    cruiseKt: 250,
    cruiseThrottle: 0.6,
    asiMaxKt: 400,
    stallAlphaDeg: 14,
    retractableGear: true,
    tailwheel: false,
    constantSpeedProp: false,
    strikes: [
      { unit: 3, part: "tail" },
      { unit: 4, part: "engine" },
      { unit: 5, part: "engine" },
      { unit: 6, part: "wing" },
      { unit: 7, part: "wing" },
      { unit: 8, part: "nose" },
      { unit: 9, part: "nose" },
      { unit: 10, part: "tail" },
      { unit: 11, part: "tail" },
    ],
    fgMirror: [],
    takeoffTrim: 0.6,
    realism: "JSBSim's A320 as its authors made it (not tuned by this project). It needs much more speed than the real aircraft to lift off. No fly-by-wire protections, no autopilot.",
  },
  {
    id: "f16",
    name: "General Dynamics F-16 Fighting Falcon",
    shortName: "F-16",
    category: "Jet fighter",
    blurb: "A supersonic fighter with an afterburner and fly-by-wire controls. Very fast, very agile.",
    tips: "Full throttle lights the afterburner — it accelerates very quickly. Pull back from about 150 knots; this flight model lifts off at about 200 knots. Raise the gear (G) straight away.",
    jsbsim: "f16",
    engines: 1,
    engine: "jet",
    flapDetentsDeg: [0],
    v: { s0: 120, s1: 140, r: 150, x: 250, y: 330, glide: 210, fe: 120, a: 400, no: 600, ne: 800, approach: 150 },
    usableFuelGal: 1072,
    maxGrossLb: 42300,
    emptyWeightLb: 18900,
    maxRpm: 100,
    idleRpm: 30,
    cgHeightFt: 5.45,
    groundStartAglFt: 5.9,
    flapMaxDeg: 1,
    finalFlapIndex: 0,
    cruiseKt: 350,
    cruiseThrottle: 0.3,
    asiMaxKt: 800,
    stallAlphaDeg: 32,
    retractableGear: true,
    tailwheel: false,
    constantSpeedProp: false,
    strikes: [
      { unit: 3, part: "wing" },
      { unit: 4, part: "wing" },
      { unit: 5, part: "tail" },
      { unit: 6, part: "tail" },
      { unit: 7, part: "tail" },
      { unit: 8, part: "body" },
      { unit: 9, part: "nose" },
    ],
    fgMirror: [],
    takeoffTrim: 0.3,
    realism: "JSBSim's F-16 as its authors made it (not tuned by this project). Its flight-model file is GPL-licensed.",
  },
  {
    id: "t6texan2",
    name: "Beechcraft T-6 Texan II",
    shortName: "T-6 Texan II",
    category: "Military trainer",
    blurb: "The turboprop trainer that new military pilots learn on: 1,100 shaft horsepower and tandem seats.",
    tips: "Full power, rotate at about 85–90 knots, gear up with G once climbing.",
    jsbsim: "t6texan2",
    engines: 1,
    engine: "turboprop",
    flapDetentsDeg: [0, 15, 30],
    v: { s0: 70, s1: 80, r: 88, x: 120, y: 140, glide: 125, fe: 150, a: 200, no: 250, ne: 316, approach: 100 },
    usableFuelGal: 162,
    maxGrossLb: 6500,
    emptyWeightLb: 4700,
    // turboprop: the engine gauge shows gas-generator speed (Ng / N1) in percent
    maxRpm: 100,
    idleRpm: 60,
    cgHeightFt: 6.06,
    groundStartAglFt: 7.0,
    flapMaxDeg: 30,
    finalFlapIndex: 2,
    cruiseKt: 200,
    cruiseThrottle: 0.6,
    asiMaxKt: 350,
    stallAlphaDeg: 18,
    retractableGear: true,
    tailwheel: false,
    constantSpeedProp: false,
    strikes: [],
    fgMirror: [],
    realism: "JSBSim's T-6 Texan II as its authors made it (not tuned by this project).",
  },
];

export const DEFAULT_AIRCRAFT_ID: AircraftId = "c172p";

/** The aircraft with this id (the Cessna 172P for anything unknown). */
export function getAircraft(id: string | undefined | null): Aircraft {
  return AIRCRAFT_LIST.find((a) => a.id === id) ?? C172P;
}
