/**
 * Aircraft Library — descriptive, educational information for every aircraft modelled in the
 * simulator. Numeric performance values are NOT duplicated here: they are derived from
 * AIRCRAFT_PERF (src/lib/data/aircraft-perf.ts) so the library, the planner and the flight
 * model always agree.
 *
 * All descriptions are generalised for a representative model/variant. They are training
 * material, not a substitute for the Pilot's Operating Handbook / Airplane Flight Manual.
 */
import { AIRCRAFT_PERF, getPerf } from "./aircraft-perf";
import type { AircraftCategory, AircraftPerf } from "./types";

export interface SystemInfo {
  summary: string;
  details: string[];
}

export interface SilhouetteSpec {
  lengthFt: number;
  heightFt: number;
  wing: "high" | "low";
  tail: "conventional" | "t-tail";
  /** Engine installation, drives the silhouette drawing. */
  engines: "nose" | "wing-prop" | "wing-jet";
  fuselageWidthFt: number;
  rootChordFt: number;
  tipChordFt: number;
  /** Leading-edge sweep, degrees. */
  sweepDeg: number;
  /** Wing root leading edge position as a fraction of length from the nose. */
  wingPos: number;
  hstabSpanFt: number;
  finHeightFt: number;
  strut?: boolean;
  bubbleCanopy?: boolean;
}

export interface TrainingLink {
  scenario: string;
  label: string;
  why: string;
}

export interface AircraftInfo {
  id: string;
  name: string;
  manufacturer: string;
  /** Representative variant the simulator models. */
  variant: string;
  categories: AircraftCategory[];
  role: string;
  firstFlight: string;
  seats: number;
  overview: string[];
  cockpit: { layout: string; instruments: string[] };
  engine: SystemInfo;
  fuel: SystemInfo;
  electrical: SystemInfo;
  gear: SystemInfo;
  controls: SystemInfo;
  /** Additional operating limitations / notes beyond the V-speeds. */
  limitations: string[];
  training: TrainingLink[];
  silhouette: SilhouetteSpec;
}

export const CATEGORY_LABELS: Record<AircraftCategory, string> = {
  "single-piston": "Single-engine piston",
  "multi-piston": "Multi-engine piston",
  "high-performance": "High-performance",
  turboprop: "Turboprop",
  business: "Business aviation",
  airliner: "Airliner",
};

export const SIMULATION_ASSUMPTIONS =
  "Simulation assumptions: every number on this page is a rounded educational approximation for a representative variant, tuned for SkyReady's simplified flight model. Weights, speeds, fuel capacities and system details vary by model year, serial number and installed equipment. This is NOT Pilot's Operating Handbook (POH) or Airplane Flight Manual (AFM) data — always use the approved documents for the specific aircraft you fly.";

export const AIRCRAFT: AircraftInfo[] = [
  {
    id: "c152",
    name: "Cessna 152",
    manufacturer: "Cessna Aircraft Company",
    variant: "Cessna 152 (O-235-L2C, 110 hp)",
    categories: ["single-piston"],
    role: "Primary trainer",
    firstFlight: "1977",
    seats: 2,
    overview: [
      "The Cessna 152 is a two-seat, high-wing, fixed-gear trainer that taught a generation of pilots to fly. It is light, forgiving and inexpensive to operate, and its slow approach speeds give students time to think in the traffic pattern.",
      "Its small useful load is the main operational limitation: with two adults and full fuel it is often at or above maximum gross weight, so weight-and-balance calculations are a real part of every flight rather than a formality.",
    ],
    cockpit: {
      layout:
        "Classic analog 'six-pack' arranged in the standard T: airspeed indicator, attitude indicator and altimeter across the top row; turn coordinator, heading indicator and vertical speed indicator below. Engine gauges (tachometer, oil pressure/temperature, fuel quantity, ammeter) are on the right side of the panel. A single NAV/COM with a VOR indicator and a transponder are typical.",
      instruments: [
        "Airspeed indicator (pitot-static)",
        "Attitude indicator (vacuum-driven gyro)",
        "Altimeter with Kollsman window (pitot-static)",
        "Turn coordinator (electric gyro)",
        "Heading indicator (vacuum-driven gyro)",
        "Vertical speed indicator (static)",
        "Magnetic compass",
        "Tachometer, oil pressure & temperature, fuel quantity, ammeter, suction gauge",
        "Carburetor heat control and mixture/throttle push-pull knobs",
      ],
    },
    engine: {
      summary:
        "Lycoming O-235-L2C, four-cylinder, horizontally opposed, air-cooled, carbureted, 110 hp at 2,550 rpm, driving a fixed-pitch propeller.",
      details: [
        "Carbureted engine: carburetor icing is possible even on warm, humid days. Carburetor heat is applied when the RPM drops unexpectedly and routinely before power reductions for descent.",
        "Fixed-pitch propeller: power is set and read directly with the tachometer (RPM).",
        "Dual magneto ignition (left and right) independent of the electrical system; checked during the run-up for a drop within limits.",
        "Mixture is leaned for altitude and for best power on run-up at high-density-altitude airports.",
      ],
    },
    fuel: {
      summary:
        "Two aluminium wing tanks, gravity-fed through a simple ON/OFF fuel shutoff valve. Standard tanks hold about 26 gal total (≈24.5 gal usable).",
      details: [
        "High-wing gravity feed: no fuel selector between tanks and no engine-driven/electric boost pump is needed in normal operation.",
        "Fuel is sampled from each wing tank sump and the fuel strainer before the first flight of the day to check for water and correct grade (100LL, blue).",
        "Fuel quantity gauges are only reliable when the airplane is level; always visually check the tanks during preflight.",
      ],
    },
    electrical: {
      summary:
        "28-volt DC system on most C152s, powered by an engine-driven alternator with a 24-volt battery; circuit breakers protect individual circuits.",
      details: [
        "The master switch is split: BAT (battery contactor) and ALT (alternator field). The ALT side can be turned off to isolate a malfunctioning alternator.",
        "The engine keeps running if electrical power is lost — the magnetos are self-powered. Radios, lights, flaps and the turn coordinator would eventually fail.",
        "An ammeter (or low-voltage light) indicates charging; a discharge indication in flight means load shedding and landing as soon as practical.",
      ],
    },
    gear: {
      summary:
        "Fixed tricycle landing gear with tubular spring-steel main gear legs and an air/oil (oleo) shock strut on the steerable nose gear.",
      details: [
        "Nosewheel steering through the rudder pedals; toe brakes on the left (and usually right) pedals provide differential braking.",
        "Nose strut inflation should be checked on preflight — a flat strut can cause shimmy and reduces propeller clearance.",
      ],
    },
    controls: {
      summary:
        "Conventional cable-operated ailerons, elevator and rudder; electrically actuated single-slotted flaps (0°–30°); manual elevator trim wheel.",
      details: [
        "Flap extension changes pitch attitude noticeably; re-trim after each flap setting.",
        "The aircraft is approved for intentional spins in the utility category (check the POH weight/CG and entry procedure).",
      ],
    },
    limitations: [
      "Utility category approved for spins and limited aerobatics within specified weights; normal category load factor limit +3.8 g / −1.52 g.",
      "Maximum demonstrated crosswind component about 12 kt (not a limitation, but a useful personal-minimum reference).",
      "No flight into known icing.",
    ],
    training: [
      {
        scenario: "vfr-pattern",
        label: "Traffic pattern work",
        why: "Low approach speeds make the C152 ideal for learning the pattern and landings.",
      },
      {
        scenario: "vfr-slow-flight",
        label: "Slow flight",
        why: "Pronounced pitch/power coupling and clear stall cues.",
      },
      {
        scenario: "vfr-stall",
        label: "Power-on/off stalls",
        why: "Benign stall characteristics with a strong buffet.",
      },
      {
        scenario: "vfr-ground-ref",
        label: "Ground reference maneuvers",
        why: "Slow ground speed makes wind drift obvious.",
      },
    ],
    silhouette: {
      lengthFt: 24.1,
      heightFt: 8.5,
      wing: "high",
      tail: "conventional",
      engines: "nose",
      fuselageWidthFt: 3.6,
      rootChordFt: 5.3,
      tipChordFt: 4.0,
      sweepDeg: 0,
      wingPos: 0.27,
      hstabSpanFt: 10,
      finHeightFt: 4.2,
      strut: true,
    },
  },
  {
    id: "c172",
    name: "Cessna 172S Skyhawk",
    manufacturer: "Cessna Aircraft Company (Textron Aviation)",
    variant: "Cessna 172S with Garmin G1000 NXi (IO-360-L2A, 180 hp)",
    categories: ["single-piston"],
    role: "Primary & instrument trainer",
    firstFlight: "1955 (172S: 1998)",
    seats: 4,
    overview: [
      "The Skyhawk is the most-produced aircraft in history and the default airplane in SkyReady. It is stable, predictable and capable of real cross-country flights, which is why it is used for everything from first lessons to the instrument rating.",
      "The 172S has a fuel-injected 180-hp engine and, in modern examples, a Garmin G1000 NXi integrated flight deck with an optional GFC 700 autopilot — making it the standard aircraft for learning glass-cockpit and instrument procedures.",
    ],
    cockpit: {
      layout:
        "Two Garmin G1000 NXi displays: a Primary Flight Display (PFD) in front of the pilot and a Multi-Function Display (MFD) in the center. The PFD shows attitude, airspeed tape, altitude tape, vertical speed, an HSI and annunciations; the MFD shows the moving map, engine indication system (EIS), flight plan and nearest airports. Standby airspeed, attitude and altimeter instruments sit below or beside the displays. The GFC 700 autopilot controller is in the center stack.",
      instruments: [
        "PFD: attitude, airspeed and altitude tapes, VSI, HSI with CDI, altimeter setting, transponder status",
        "MFD: moving map, EIS (RPM, fuel flow, oil temp/pressure, EGT, CHT, fuel quantity, volts/amps)",
        "Standby attitude indicator (electric, with standby battery)",
        "Standby airspeed indicator and altimeter",
        "Magnetic compass",
        "GFC 700 autopilot mode controller (HDG, NAV, APR, ALT, VS, FLC)",
        "Audio panel and dual NAV/COM, GPS/WAAS",
      ],
    },
    engine: {
      summary:
        "Lycoming IO-360-L2A, four-cylinder, fuel-injected, 180 hp at 2,700 rpm with a fixed-pitch propeller.",
      details: [
        "Fuel injection eliminates carburetor ice but makes hot starts more difficult (vapor in the lines).",
        "Mixture is leaned using the EGT/fuel-flow display on the EIS; at full power below 3,000 ft density altitude the mixture is normally full rich.",
        "An electric auxiliary fuel pump is used for priming and as a backup to the engine-driven pump.",
        "Engine-driven vacuum pump is not installed on G1000 aircraft — all primary flight instruments are electric (AHRS/ADC).",
      ],
    },
    fuel: {
      summary:
        "Two integral wing tanks totalling about 56 gal (53 gal usable), with a LEFT/BOTH/RIGHT/OFF fuel selector and a fuel shutoff valve.",
      details: [
        "Takeoff and landing on BOTH. The tanks are vented and interconnected; a fuel return line routes excess fuel to the tanks.",
        "13 sump drains on most 172S airplanes (wing, fuel selector and strainer) — check for water and contamination before flight.",
        "Fuel quantity and fuel flow are shown on the MFD EIS; the G1000 can compute fuel remaining from totalizer data, but the totalizer only knows what you tell it about the starting fuel.",
      ],
    },
    electrical: {
      summary:
        "28-volt DC system with a 60-ampere alternator, a main 24-volt battery and a standby battery for the essential bus / standby attitude indicator.",
      details: [
        "Avionics master switch(es) control power to the avionics buses; the essential bus continues to power the PFD if the alternator fails.",
        "An alternator failure triggers a LOW VOLTS annunciation; load shedding (reversionary mode, MFD off) extends battery life for the remaining flight.",
        "Because the flight instruments are electric, an electrical failure in IMC is an emergency — the standby battery is the last line of defence.",
      ],
    },
    gear: {
      summary:
        "Fixed tricycle gear with tubular spring-steel main legs, an oleo nose strut, and nosewheel steering through the rudder pedals.",
      details: [
        "Hydraulic single-disc brakes on each main wheel, operated by toe brakes.",
        "The nosewheel centers automatically when the strut extends after takeoff.",
      ],
    },
    controls: {
      summary:
        "Cable-operated primary controls; electric single-slotted Fowler flaps 0°/10°/20°/30°; manual elevator trim wheel (electric trim with the autopilot).",
      details: [
        "Flaps 10° may be used for short- and soft-field takeoffs.",
        "Flap extension is limited to 10° above 110 KIAS on many 172S airplanes (the white arc tops out at Vfe for full flaps) — check the POH placard.",
      ],
    },
    limitations: [
      "Normal category load factor +3.8 g / −1.52 g (flaps up); utility category +4.4 g at reduced weight.",
      "Maximum demonstrated crosswind component 15 kt.",
      "Not approved for flight into known icing.",
    ],
    training: [
      {
        scenario: "vfr-takeoff-climb",
        label: "Normal takeoff and climb",
        why: "Standard trainer handling for learning Vx/Vy climbs.",
      },
      {
        scenario: "vfr-xc",
        label: "VFR cross-country",
        why: "Enough range and payload for realistic cross-country practice.",
      },
      {
        scenario: "ifr-ils",
        label: "ILS approach",
        why: "G1000 HSI and autopilot are the modern instrument-training standard.",
      },
      {
        scenario: "ifr-hold",
        label: "Holding pattern",
        why: "Practice entries and timing with a stable airplane.",
      },
      {
        scenario: "emg-engine-failure",
        label: "Engine failure",
        why: "Best-glide 68 KIAS and a predictable glide.",
      },
      {
        scenario: "checkride-private",
        label: "Private pilot mock checkride",
        why: "The most common checkride aircraft.",
      },
    ],
    silhouette: {
      lengthFt: 27.2,
      heightFt: 8.9,
      wing: "high",
      tail: "conventional",
      engines: "nose",
      fuselageWidthFt: 3.9,
      rootChordFt: 5.3,
      tipChordFt: 3.7,
      sweepDeg: 0,
      wingPos: 0.29,
      hstabSpanFt: 11.3,
      finHeightFt: 4.6,
      strut: true,
    },
  },
  {
    id: "pa28",
    name: "Piper PA-28-181 Archer",
    manufacturer: "Piper Aircraft",
    variant: "PA-28-181 Archer (O-360-A4M, 180 hp, analog panel)",
    categories: ["single-piston"],
    role: "Primary & cross-country trainer",
    firstFlight: "1960 (Archer: 1972)",
    seats: 4,
    overview: [
      "The Archer is Piper's four-seat, low-wing counterpart to the Skyhawk. Its semi-tapered wing gives gentle stall behavior, and its wide stance and trailing-link-free oleo gear make it comfortable on landing.",
      "Low-wing operation teaches different habits: a single door on the right side, fuel tank switching from a LEFT/RIGHT selector, a stabilator instead of an elevator, and more pronounced ground effect in the flare.",
    ],
    cockpit: {
      layout:
        "Traditional analog six-pack in the standard T with engine gauges in a cluster to the right. Throttle, propeller (none — fixed pitch) and mixture levers are in a center quadrant; the manual flap handle (a 'Johnson bar') sits between the front seats. Many Archers have a Garmin GNS 430/530 or GTN navigator.",
      instruments: [
        "Six-pack: airspeed, attitude (vacuum), altimeter, turn coordinator, heading indicator (vacuum), VSI",
        "VOR/LOC/GS indicator or HSI",
        "Engine cluster: oil temp/pressure, fuel pressure, fuel quantity (L/R), ammeter, vacuum",
        "Tachometer",
        "Carburetor heat lever, primer",
      ],
    },
    engine: {
      summary:
        "Lycoming O-360-A4M, four-cylinder, carbureted, 180 hp at 2,700 rpm with a fixed-pitch propeller.",
      details: [
        "Carbureted — carburetor heat is part of the descent and before-landing checks.",
        "An electric fuel pump is ON for takeoff, landing and tank switching because the low wing places the tanks below the engine.",
        "Dual magnetos; impulse coupling on the left magneto aids starting.",
      ],
    },
    fuel: {
      summary:
        "Two 25-gal wing tanks (≈48 gal usable) selected individually: LEFT, RIGHT or OFF. There is no BOTH position.",
      details: [
        "Fuel must be managed actively — switch tanks about every 30–60 minutes to keep the load balanced, with the electric fuel pump ON during the switch.",
        "Engine-driven fuel pump plus an electric auxiliary pump; a fuel pressure gauge confirms delivery.",
        "Running a tank dry is a classic cause of power loss; the emergency checklist starts with 'fuel selector — switch tanks, fuel pump ON'.",
      ],
    },
    electrical: {
      summary:
        "14- or 28-volt DC system depending on year, with an engine-driven alternator, a battery and circuit breakers on the lower right panel.",
      details: [
        "Split master switch (BAT/ALT) on most models.",
        "The vacuum system (not electrical) powers the attitude and heading indicators — an alternator failure leaves the primary gyros working; a vacuum failure does not affect the radios.",
      ],
    },
    gear: {
      summary:
        "Fixed tricycle gear with oleo-pneumatic struts on all three legs and nosewheel steering through the rudder pedals.",
      details: [
        "Toe brakes plus a hand brake lever that doubles as the parking brake.",
        "Strut extension should be checked during preflight on all three legs.",
      ],
    },
    controls: {
      summary:
        "Cable-operated ailerons and rudder; an all-moving stabilator with an anti-servo tab; manually operated flaps 0°/10°/25°/40°.",
      details: [
        "The stabilator's anti-servo tab moves in the same direction as the trailing edge to add control feel and acts as the trim tab.",
        "Manual flaps respond instantly — useful during a go-around, but retract them in stages to avoid a sudden sink.",
      ],
    },
    limitations: [
      "Normal category +3.8 g / −1.52 g; utility category at reduced weight.",
      "Maximum demonstrated crosswind about 17 kt.",
      "No flight into known icing.",
    ],
    training: [
      {
        scenario: "vfr-landing",
        label: "Landing practice",
        why: "Strong ground effect teaches a patient flare.",
      },
      {
        scenario: "vfr-xc",
        label: "VFR cross-country",
        why: "Practice active fuel tank management en route.",
      },
      {
        scenario: "emg-engine-failure",
        label: "Engine failure",
        why: "Rehearse 'fuel selector — switch tanks, fuel pump ON'.",
      },
      {
        scenario: "ifr-vor-intercept",
        label: "VOR intercepts",
        why: "Classic analog CDI navigation.",
      },
    ],
    silhouette: {
      lengthFt: 24,
      heightFt: 7.3,
      wing: "low",
      tail: "conventional",
      engines: "nose",
      fuselageWidthFt: 3.9,
      rootChordFt: 5.6,
      tipChordFt: 3.9,
      sweepDeg: 2,
      wingPos: 0.3,
      hstabSpanFt: 12.9,
      finHeightFt: 4.2,
    },
  },
  {
    id: "da40",
    name: "Diamond DA40 Diamond Star",
    manufacturer: "Diamond Aircraft Industries",
    variant: "DA40 180 with Garmin G1000 (IO-360-M1A, 180 hp)",
    categories: ["single-piston"],
    role: "Glass-cockpit trainer & tourer",
    firstFlight: "1997",
    seats: 4,
    overview: [
      "The DA40 is an all-composite, low-wing four-seater with a long, efficient wing and a T-tail. It cruises noticeably faster than a Skyhawk on the same horsepower thanks to low drag.",
      "Its excellent visibility under a large forward-hinged canopy, gentle stall and modern G1000 avionics make it a popular choice for academies preparing pilots for airline careers.",
    ],
    cockpit: {
      layout:
        "Garmin G1000 PFD and MFD side by side, with backup airspeed, attitude and altimeter. A center console carries the throttle, mixture, fuel selector (on the floor between the seats) and electric flap switch (UP / T/O / LDG). Control sticks rather than yokes.",
      instruments: [
        "G1000 PFD with HSI and synthetic annunciations",
        "G1000 MFD with EIS and moving map",
        "Backup attitude (with emergency battery), airspeed and altimeter",
        "Magnetic compass",
        "Optional GFC 700 or KAP 140 autopilot",
      ],
    },
    engine: {
      summary:
        "Lycoming IO-360-M1A, four-cylinder, fuel-injected, 180 hp, driving a constant-speed propeller (MT or Hartzell).",
      details: [
        "Constant-speed propeller: the throttle sets manifold pressure and the propeller lever sets RPM — teaches power management before moving to complex aircraft.",
        "Electric fuel pump ON for takeoff and landing.",
        "Low-drag airframe: plan descents early because the airplane is slow to lose speed.",
      ],
    },
    fuel: {
      summary:
        "Two wing tanks (standard ≈41 gal usable; long-range tanks ≈50 gal) with a LEFT / RIGHT / OFF selector.",
      details: [
        "Like other low-wing aircraft, tanks are switched in flight to balance the load.",
        "Fuel quantity is measured by capacitive probes and also checked with a calibrated dipstick before flight.",
      ],
    },
    electrical: {
      summary:
        "28-volt DC system with an alternator, main battery and an emergency battery that powers the standby attitude indicator and flood light.",
      details: [
        "Essential bus switch sheds non-essential loads in an alternator failure.",
        "The composite structure requires a dedicated lightning-protection mesh; avoid thunderstorms (as in any light aircraft).",
      ],
    },
    gear: {
      summary:
        "Fixed tricycle gear with a free-castering nosewheel; directional control on the ground is by differential braking and rudder.",
      details: [
        "Free-castering nose gear requires practice: use rudder at speed and brakes gently at low speed.",
        "Wheel fairings reduce drag; check tire condition through the fairing openings.",
      ],
    },
    controls: {
      summary:
        "Push-rod and cable controls operated by control sticks; electric flaps with three positions (UP 0°, T/O ≈20°, LDG ≈42°); T-tail elevator with electric trim.",
      details: [
        "T-tail: the elevator sits above the propeller slipstream, so power changes cause smaller pitch changes than in a conventional tail.",
        "Long wing provides good glide performance (best glide ≈73 KIAS at max weight).",
      ],
    },
    limitations: [
      "Normal and utility category; check the AFM for approved maneuvers.",
      "Maximum demonstrated crosswind 20 kt.",
      "Composite airframe: paint must be white (or approved light colors) to limit structural temperature.",
    ],
    training: [
      {
        scenario: "vfr-stall",
        label: "Stall recognition",
        why: "Gentle, well-mannered stalls with clear warning.",
      },
      {
        scenario: "ifr-rnav",
        label: "RNAV (GPS) approach",
        why: "G1000 with WAAS LPV approaches.",
      },
      {
        scenario: "vfr-landing",
        label: "Landings",
        why: "Practice directional control with a castering nosewheel.",
      },
    ],
    silhouette: {
      lengthFt: 26.4,
      heightFt: 6.5,
      wing: "low",
      tail: "t-tail",
      engines: "nose",
      fuselageWidthFt: 3.9,
      rootChordFt: 4.6,
      tipChordFt: 2.8,
      sweepDeg: 1,
      wingPos: 0.33,
      hstabSpanFt: 10.5,
      finHeightFt: 4.3,
      bubbleCanopy: true,
    },
  },
  {
    id: "be36",
    name: "Beechcraft G36 Bonanza",
    manufacturer: "Beechcraft (Textron Aviation)",
    variant: "G36 Bonanza (IO-550-B, 300 hp)",
    categories: ["single-piston", "high-performance"],
    role: "High-performance complex single",
    firstFlight: "1947 (A36: 1968; G36: 2005)",
    seats: 6,
    overview: [
      "The Bonanza has the longest continuous production run of any aircraft. The straight-tail A36/G36 is a six-seat, retractable-gear, constant-speed-propeller airplane — a classic 'complex and high-performance' step-up aircraft.",
      "It requires both a high-performance endorsement (more than 200 hp) and a complex endorsement (retractable gear, flaps and a controllable-pitch propeller) under 14 CFR 61.31. Its speed rewards planning well ahead of the airplane.",
    ],
    cockpit: {
      layout:
        "Garmin G1000 NXi PFD and MFD with standby instruments and a GFC 700 autopilot. Throttle, propeller and mixture levers are in a center quadrant. The landing gear selector is to the left of the power quadrant, separated from the flap switch to prevent confusion.",
      instruments: [
        "G1000 NXi PFD / MFD with EIS showing manifold pressure, RPM and fuel flow",
        "Gear position lights (three green) and gear-unsafe light",
        "Standby attitude, airspeed and altimeter",
        "GFC 700 autopilot with yaw damper option",
      ],
    },
    engine: {
      summary:
        "Continental IO-550-B, six-cylinder, fuel-injected, 300 hp at 2,700 rpm, with a three-blade constant-speed propeller.",
      details: [
        "Power is set with manifold pressure (throttle) and RPM (propeller) — 'mixture, prop, throttle' forward to increase power; 'throttle, prop, mixture' back to reduce.",
        "Lean using EGT/fuel flow; at high power avoid operating near peak EGT.",
        "Shock-cooling: reduce power gradually in descent.",
      ],
    },
    fuel: {
      summary:
        "Two wing tanks with ≈74 gal usable, selected LEFT or RIGHT (or OFF) on the floor selector.",
      details: [
        "Auxiliary fuel pump for priming, vapor suppression and engine-driven pump failure.",
        "Tank switching is a normal en-route task; fuel totalizer helps track remaining fuel.",
      ],
    },
    electrical: {
      summary:
        "28-volt DC system; G36 typically has a main alternator plus a standby alternator, with a 24-volt battery.",
      details: [
        "Landing gear and flaps are electrically actuated — an electrical failure affects gear extension, which then requires the manual extension handcrank.",
        "Load-shedding procedures keep the PFD and essential radios powered.",
      ],
    },
    gear: {
      summary:
        "Electrically actuated retractable tricycle gear with an emergency manual extension handcrank; gear warning horn tied to throttle position and flaps.",
      details: [
        "Gear extension speed (Vle/Vlo) must be respected; the gear can be used as a speed brake below that speed.",
        "GUMPS check (Gas, Undercarriage, Mixture, Propeller, Seatbelts/Switches) before every landing.",
        "Squat switch prevents retraction on the ground.",
      ],
    },
    controls: {
      summary:
        "Conventional cable controls with a rudder–aileron interconnect spring; electric flaps 0°/12°/30°; electric pitch trim.",
      details: [
        "Light, well-harmonised ailerons; the airplane accelerates quickly in a descent — watch the yellow arc.",
        "The interconnect makes coordinated turns with less rudder input, but crosswind landings require deliberate rudder.",
      ],
    },
    limitations: [
      "Requires high-performance and complex endorsements (14 CFR 61.31(e)–(f)).",
      "Normal category load factor +4.4 g / −1.76 g (flaps up).",
      "Maximum demonstrated crosswind about 17 kt.",
    ],
    training: [
      {
        scenario: "vfr-pattern",
        label: "Complex aircraft pattern",
        why: "GUMPS checks and gear extension in the pattern.",
      },
      {
        scenario: "ifr-ils",
        label: "ILS at higher speed",
        why: "Faster approach speeds demand early stabilization.",
      },
      {
        scenario: "emg-electrical",
        label: "Electrical failure",
        why: "Manual gear extension decision-making.",
      },
    ],
    silhouette: {
      lengthFt: 27.5,
      heightFt: 8.6,
      wing: "low",
      tail: "conventional",
      engines: "nose",
      fuselageWidthFt: 4.2,
      rootChordFt: 7.0,
      tipChordFt: 3.8,
      sweepDeg: 4,
      wingPos: 0.3,
      hstabSpanFt: 12.1,
      finHeightFt: 4.6,
    },
  },
  {
    id: "sr20",
    name: "Cirrus SR20",
    manufacturer: "Cirrus Aircraft",
    variant: "SR20 (200 hp generation) with Cirrus Perspective",
    categories: ["single-piston"],
    role: "Modern glass-cockpit trainer & tourer",
    firstFlight: "1995 (certified 1998)",
    seats: 4,
    overview: [
      "The SR20 is a composite, fixed-gear four/five-seater known for introducing a whole-airframe ballistic parachute — the Cirrus Airframe Parachute System (CAPS) — as standard equipment.",
      "It is widely used by flight schools and airline academies because it combines fixed-gear simplicity with cruise speeds above 150 KTAS, side-stick controls and a large Perspective flight deck. Earlier generations used a 200-hp Lycoming IO-360-ES; the current G6 uses a 215-hp IO-390. SkyReady models a 200-hp variant.",
    ],
    cockpit: {
      layout:
        "Two large Cirrus Perspective (Garmin-based) displays — PFD on the left, MFD in the center — with a keyboard controller and autopilot mode panel in the center console. Single-lever power control (no separate propeller lever) and side-sticks instead of yokes. The red CAPS activation handle is in the ceiling above the front seats.",
      instruments: [
        "Perspective PFD with synthetic vision and HSI",
        "Perspective MFD with engine page and moving map",
        "Standby airspeed, attitude and altimeter (or electronic standby)",
        "CAPS activation T-handle",
        "Garmin autopilot with Electronic Stability & Protection (ESP)",
      ],
    },
    engine: {
      summary:
        "Lycoming IO-360-ES, four-cylinder, fuel-injected, 200 hp, with a constant-speed propeller governed automatically by the single power lever.",
      details: [
        "Single-lever power control coordinates propeller RPM with throttle position.",
        "Mixture is still pilot-controlled; lean in cruise using fuel flow/EGT.",
        "Boost pump ON for takeoff and landing.",
      ],
    },
    fuel: {
      summary:
        "Two integral composite wing tanks, ≈56 gal usable, with a LEFT / RIGHT / OFF selector.",
      details: [
        "Switch tanks to keep the fuel imbalance within limits (check the POH limit, typically about 10 gal).",
        "Fuel quantity on the MFD engine page plus a dipstick check before flight.",
      ],
    },
    electrical: {
      summary:
        "Dual 28-volt alternators and dual batteries feeding main and essential buses — high redundancy for the electric flight deck.",
      details: [
        "If one alternator fails, the second can carry essential loads.",
        "Annunciations for low volts / alternator failure appear on the PFD's crew alerting system.",
      ],
    },
    gear: {
      summary:
        "Fixed tricycle gear with a free-castering nosewheel; steering with differential braking.",
      details: [
        "Gentle use of brakes at low speed prevents overheating.",
        "Wheel fairings reduce drag.",
      ],
    },
    controls: {
      summary:
        "Side-stick controls with spring cartridges and electric trim on the stick; electric flaps 0% / 50% / 100% (≈0°/16°/32°); rudder–aileron interconnect.",
      details: [
        "The 'flap 50%' setting is used for normal and short-field takeoffs.",
        "CAPS is a primary emergency option for loss of control, mid-air collision, structural failure or engine failure over hostile terrain (follow the POH altitude guidance).",
      ],
    },
    limitations: [
      "CAPS deployment maximum demonstrated speed (Vpd) about 135–140 KIAS, varies by model.",
      "Spins are prohibited; spin recovery is via CAPS.",
      "Maximum demonstrated crosswind 20 kt.",
    ],
    training: [
      {
        scenario: "ifr-rnav",
        label: "RNAV (GPS) approach",
        why: "Perspective flight deck with LPV approaches.",
      },
      {
        scenario: "vfr-xc",
        label: "VFR cross-country",
        why: "Fast enough to show why planning matters.",
      },
      {
        scenario: "emg-engine-failure",
        label: "Engine failure & CAPS decision",
        why: "Glide vs. parachute decision-making.",
      },
    ],
    silhouette: {
      lengthFt: 26,
      heightFt: 8.9,
      wing: "low",
      tail: "conventional",
      engines: "nose",
      fuselageWidthFt: 4.1,
      rootChordFt: 5.0,
      tipChordFt: 2.6,
      sweepDeg: 2,
      wingPos: 0.33,
      hstabSpanFt: 13.0,
      finHeightFt: 4.8,
    },
  },
  {
    id: "sr22",
    name: "Cirrus SR22",
    manufacturer: "Cirrus Aircraft",
    variant: "SR22 (IO-550-N, 310 hp) with Cirrus Perspective+",
    categories: ["single-piston", "high-performance"],
    role: "High-performance single",
    firstFlight: "2000",
    seats: 5,
    overview: [
      "The SR22 is the best-selling high-performance piston airplane of the 21st century. It shares the SR20's layout and CAPS parachute, but a 310-hp Continental and larger fuel capacity give cruise speeds around 180 KTAS.",
      "It is a high-performance aircraft (more than 200 hp) but not 'complex' because its landing gear is fixed — so 14 CFR 61.31(f) requires a high-performance endorsement, but not a complex endorsement, to act as pilot in command.",
    ],
    cockpit: {
      layout:
        "Cirrus Perspective+ flight deck (two 10–12-inch displays), keyboard and autopilot controller, side-sticks and single power lever. CAPS handle overhead. Optional flight-into-known-icing (FIKI) TKS system controls on the panel.",
      instruments: [
        "Perspective+ PFD with synthetic vision, flight director and HSI",
        "MFD with engine monitoring, maps, charts and checklists",
        "Standby instruments",
        "Autopilot with ESP and Level button (one-push wings level)",
        "CAPS activation T-handle",
      ],
    },
    engine: {
      summary:
        "Continental IO-550-N, six-cylinder, fuel-injected, 310 hp at 2,700 rpm (turbocharged SR22T variant also exists).",
      details: [
        "Single-lever power control; mixture managed by the pilot (lean-of-peak operation is common with the engine monitor).",
        "High fuel flows at takeoff (≈27–30 gal/h) — fuel planning matters.",
      ],
    },
    fuel: {
      summary: "Two wing tanks, ≈92 gal usable, LEFT / RIGHT / OFF selector.",
      details: [
        "Tank switching on a regular schedule to manage imbalance.",
        "Fuel totalizer on the MFD.",
      ],
    },
    electrical: {
      summary: "Dual alternators and dual batteries, main and essential buses.",
      details: [
        "Redundant power for the all-electric flight deck.",
        "Crew alerting system messages guide load shedding.",
      ],
    },
    gear: {
      summary:
        "Fixed tricycle gear with a free-castering nosewheel, steered with differential braking.",
      details: ["Higher landing speeds than trainers: stabilize the approach early."],
    },
    controls: {
      summary:
        "Side-stick controls, electric flaps 0%/50%/100%, electric trim, rudder–aileron interconnect.",
      details: [
        "Heavier wing loading makes the SR22 ride better in turbulence but demands energy management on approach.",
      ],
    },
    limitations: [
      "Requires a high-performance endorsement (14 CFR 61.31(f)).",
      "CAPS deployment speed and altitude guidance per POH.",
      "Spins prohibited.",
    ],
    training: [
      { scenario: "ifr-ils", label: "ILS approach", why: "Higher-speed instrument approaches." },
      {
        scenario: "ifr-hold",
        label: "Holds at higher speed",
        why: "Larger holding pattern, speed reduction planning.",
      },
      {
        scenario: "emg-weather",
        label: "Inadvertent IMC",
        why: "Use of autopilot and Level button.",
      },
    ],
    silhouette: {
      lengthFt: 26,
      heightFt: 8.9,
      wing: "low",
      tail: "conventional",
      engines: "nose",
      fuselageWidthFt: 4.1,
      rootChordFt: 5.0,
      tipChordFt: 2.6,
      sweepDeg: 2,
      wingPos: 0.33,
      hstabSpanFt: 13.0,
      finHeightFt: 4.8,
    },
  },
  {
    id: "pa34",
    name: "Piper PA-34-220T Seneca V",
    manufacturer: "Piper Aircraft",
    variant: "Seneca V (2 × TSIO-360-RB / LTSIO-360-RB, 220 hp, turbocharged)",
    categories: ["multi-piston", "high-performance"],
    role: "Multi-engine trainer",
    firstFlight: "1971 (Seneca V: 1997)",
    seats: 6,
    overview: [
      "The Seneca is one of the most common multi-engine trainers. Its counter-rotating, turbocharged engines eliminate the 'critical engine' (both propellers turn toward the fuselage on the downstroke), which improves single-engine controllability.",
      "Multi-engine training focuses on engine-failure recognition and the drill 'mixture, props, throttles forward — flaps up, gear up — identify (dead foot, dead engine), verify, feather' while holding blue-line speed (Vyse) and never flying slower than red-line Vmc.",
    ],
    cockpit: {
      layout:
        "G1000 (or Avidyne/analog in older models) with dual engine instruments: manifold pressure, RPM, fuel flow, EGT/CHT for each engine. A quadrant with two throttles (black), two propeller levers (blue) and two mixture levers (red). Cowl-flap controls, gear selector and electric flap switch on the panel.",
      instruments: [
        "PFD/MFD (or six-pack + HSI)",
        "Dual engine instruments (MP, RPM, FF, CHT, EGT, oil)",
        "Gear position lights and hydraulic pump indication",
        "Autopilot with flight director",
        "Propeller synchronizer",
      ],
    },
    engine: {
      summary:
        "Two Continental TSIO-360-RB (left) and LTSIO-360-RB (right, counter-rotating), turbocharged, 220 hp each, with three-blade full-feathering propellers.",
      details: [
        "Counter-rotating propellers: no critical engine.",
        "Turbocharging maintains sea-level manifold pressure to high altitude; watch for overboost and manage cowl flaps.",
        "Full-feathering props reduce windmilling drag after an engine failure; feathering is prevented below ~800 rpm by centrifugal latch pins on shutdown.",
      ],
    },
    fuel: {
      summary:
        "Two fuel systems (one per wing) with ≈122 gal usable total; each engine normally feeds from its own side with an ON / OFF / X-FEED selector for crossfeed.",
      details: [
        "Crossfeed lets a single operating engine use fuel from the opposite wing — used for balance on long single-engine operations, never for takeoff or landing.",
        "Electric boost pumps on each side for priming and backup.",
      ],
    },
    electrical: {
      summary:
        "28-volt DC system with an alternator on each engine and a battery; either alternator can carry the essential load.",
      details: [
        "Loss of one engine also removes its alternator — monitor loads.",
        "Overvoltage protection on each alternator.",
      ],
    },
    gear: {
      summary:
        "Retractable tricycle gear operated by an electrically driven hydraulic pump; emergency free-fall extension.",
      details: [
        "Gear warning horn and gear-unsafe light.",
        "Emergency extension allows the gear to free-fall and lock by gravity and airflow.",
      ],
    },
    controls: {
      summary:
        "Cable-operated ailerons, rudder and stabilator; electric flaps 0°/10°/25°/40°; rudder trim and stabilator trim.",
      details: [
        "Rudder trim is essential in single-engine flight to relieve rudder pressure.",
        "Bank up to 5° toward the operating engine reduces sideslip and improves single-engine climb.",
      ],
    },
    limitations: [
      "Requires a multi-engine class rating; high-performance endorsement.",
      "Vmc (red radial) is the minimum control speed with the critical engine inoperative — never fly slower than Vmc with asymmetric thrust.",
      "Vyse (blue line) is the best single-engine rate-of-climb speed. SkyReady uses the model's Vy as an approximation of Vyse.",
      "Single-engine service ceiling is much lower than the all-engine ceiling.",
    ],
    training: [
      {
        scenario: "emg-engine-failure",
        label: "Engine failure in a twin",
        why: "Identify, verify, feather; maintain blue line.",
      },
      {
        scenario: "ifr-ils",
        label: "Single-engine ILS",
        why: "Asymmetric thrust management on approach.",
      },
      {
        scenario: "ifr-missed",
        label: "Missed approach",
        why: "Go-around power and configuration in a twin.",
      },
    ],
    silhouette: {
      lengthFt: 28.6,
      heightFt: 9.9,
      wing: "low",
      tail: "conventional",
      engines: "wing-prop",
      fuselageWidthFt: 4.2,
      rootChordFt: 5.6,
      tipChordFt: 4.2,
      sweepDeg: 2,
      wingPos: 0.32,
      hstabSpanFt: 13.6,
      finHeightFt: 5.2,
    },
  },
  {
    id: "be58",
    name: "Beechcraft Baron G58",
    manufacturer: "Beechcraft (Textron Aviation)",
    variant: "Baron G58 (2 × IO-550-C, 300 hp)",
    categories: ["multi-piston", "high-performance"],
    role: "High-performance piston twin",
    firstFlight: "1960 (G58: 2005)",
    seats: 6,
    overview: [
      "The Baron is a fast, solidly built piston twin used for multi-engine training, charter and personal transportation. It cruises at about 200 KTAS on two 300-hp engines.",
      "Unlike the Seneca, the Baron's propellers both rotate clockwise (viewed from behind), so the left engine is the critical engine: its failure produces the greatest yaw and roll tendency (P-factor, accelerated slipstream, spiraling slipstream and torque).",
    ],
    cockpit: {
      layout:
        "Garmin G1000 NXi with dual engine indications, GFC 700 autopilot with yaw damper, and a classic power quadrant: throttles, propellers, mixtures. Gear and flap controls separated on the lower panel.",
      instruments: [
        "G1000 NXi PFD / MFD",
        "Engine indications for both engines",
        "Gear position lights",
        "GFC 700 autopilot with yaw damper",
        "Standby instruments",
      ],
    },
    engine: {
      summary:
        "Two Continental IO-550-C, six-cylinder, fuel-injected, 300 hp each, with three-blade full-feathering propellers.",
      details: [
        "Left engine is critical (both propellers turn the same direction).",
        "Power changes and synchronization of propellers to reduce noise and vibration.",
      ],
    },
    fuel: {
      summary: "Wing tanks with ≈194 gal usable; each engine's selector has ON / OFF / CROSSFEED.",
      details: ["Crossfeed for single-engine operation.", "Fuel totalizer per engine."],
    },
    electrical: {
      summary: "28-volt DC, two alternators (one per engine), battery and standby battery.",
      details: [
        "Electrically actuated gear and flaps — manual gear extension available.",
        "Load-shed procedures after an engine (and alternator) loss.",
      ],
    },
    gear: {
      summary: "Electrically actuated retractable tricycle gear with emergency manual extension.",
      details: [
        "Gear warning horn tied to throttle position.",
        "Gear extended speed (Vle) is a useful drag device on descent.",
      ],
    },
    controls: {
      summary:
        "Conventional cable controls, electric flaps (approach ≈15°, full ≈30°), aileron, rudder and elevator trim.",
      details: ["Rudder trim is used to center the ball in single-engine flight."],
    },
    limitations: [
      "Multi-engine class rating; high-performance and complex endorsements.",
      "Vmc red radial and Vyse blue line on the airspeed indicator.",
      "Maximum demonstrated crosswind ≈ 22 kt.",
    ],
    training: [
      {
        scenario: "emg-engine-failure",
        label: "Critical-engine failure",
        why: "Left-engine failure demands prompt rudder.",
      },
      {
        scenario: "ifr-departure",
        label: "IFR departure",
        why: "Fast climb-out and procedure compliance.",
      },
      { scenario: "ifr-dme-arc", label: "DME arc", why: "Higher speed arcs with lead turns." },
    ],
    silhouette: {
      lengthFt: 29.8,
      heightFt: 9.8,
      wing: "low",
      tail: "conventional",
      engines: "wing-prop",
      fuselageWidthFt: 4.3,
      rootChordFt: 7.0,
      tipChordFt: 3.9,
      sweepDeg: 4,
      wingPos: 0.3,
      hstabSpanFt: 15.9,
      finHeightFt: 5.0,
    },
  },
  {
    id: "be350",
    name: "Beechcraft King Air 350",
    manufacturer: "Beechcraft (Textron Aviation)",
    variant: "King Air 350 (2 × PT6A-60A, 1,050 shp)",
    categories: ["turboprop", "business"],
    role: "Twin turboprop business & utility aircraft",
    firstFlight: "1988",
    seats: 11,
    overview: [
      "The King Air 350 is a pressurized twin turboprop that serves as a corporate aircraft, air ambulance and military/utility platform. It is certified for single-pilot operation under Part 23 commuter category.",
      "Turboprop operations introduce new concepts: engine limits expressed as torque, ITT (inter-turbine temperature) and Ng/Np; propeller beta and reverse range; autofeather; and planning at flight levels in the high-altitude airspace system.",
    ],
    cockpit: {
      layout:
        "Collins Pro Line 21 or Pro Line Fusion integrated avionics with large-format PFDs and MFD, flight management system (FMS), dual-channel autopilot with yaw damper, and an overhead/annunciator panel. Power quadrant with power levers (including beta/reverse), propeller levers and condition levers.",
      instruments: [
        "Two PFDs and an MFD (Pro Line 21 / Fusion)",
        "Engine indications: torque, ITT, Ng, Np (prop RPM), fuel flow, oil",
        "FMS with VNAV",
        "Pressurization controller and cabin altitude/differential indicator",
        "Annunciator panel (warning, caution, advisory)",
        "Standby attitude, airspeed and altimeter",
      ],
    },
    engine: {
      summary:
        "Two Pratt & Whitney Canada PT6A-60A free-turbine turboprops, flat-rated to 1,050 shp each, driving four-blade, full-feathering, reversible propellers.",
      details: [
        "Free-turbine design: the gas generator (Ng) and power turbine/propeller (Np) are not mechanically connected.",
        "Starting is monitored for hot starts — ITT limits during start must be respected.",
        "Autofeather automatically feathers a failed engine's propeller during takeoff and landing when armed.",
        "Ice protection: engine inlet anti-ice, propeller de-ice boots, wing and tail pneumatic de-ice boots — approved for flight into known icing.",
      ],
    },
    fuel: {
      summary:
        "Jet-A in nacelle and wing tanks per side (≈539 gal usable), engine-driven high-pressure pumps, electric boost pumps and crossfeed.",
      details: [
        "Fuel is burned in pounds, not gallons, in turbine operations (Jet-A ≈ 6.7 lb/gal).",
        "Anti-ice additive (or fuel heating) prevents fuel icing at altitude.",
      ],
    },
    electrical: {
      summary:
        "28-volt DC system powered by two engine-driven starter-generators and a battery; inverters supply AC for some avionics and instruments.",
      details: [
        "The starter-generator acts as starter motor on the ground and as generator in flight.",
        "Bus ties and load-shed logic preserve essential power after a generator failure.",
      ],
    },
    gear: {
      summary:
        "Retractable tricycle gear (dual main wheels) actuated by an electro-hydraulic power pack, with an emergency hand pump.",
      details: [
        "Gear warning logic tied to power lever position and flap setting.",
        "Propeller beta/reverse used on rollout reduces brake wear.",
      ],
    },
    controls: {
      summary:
        "Cable-operated primary controls, T-tail, electric flaps (approach and down), electric trim, yaw damper and rudder boost to reduce engine-out pedal forces.",
      details: [
        "Rudder boost senses bleed-air pressure differential and helps the pilot counter yaw after an engine failure.",
        "T-tail keeps the horizontal tail out of the propeller wash.",
      ],
    },
    limitations: [
      "Requires a multi-engine rating and, because maximum takeoff weight exceeds 12,500 lb, a BE-300 type rating (14 CFR 61.31(a)).",
      "Maximum operating altitude 35,000 ft; RVSM-capable variants for flight levels.",
      "Vmo/Mmo replaces Vne on turbine aircraft; SkyReady uses the model's Vne value as a stand-in.",
    ],
    training: [
      {
        scenario: "ifr-departure",
        label: "IFR departure",
        why: "High climb rates and altitude constraints.",
      },
      {
        scenario: "ifr-hold",
        label: "Holding at 200+ kt",
        why: "Speed limits in holding (14 CFR 91.117 / AIM).",
      },
      {
        scenario: "emg-engine-failure",
        label: "Engine failure with autofeather",
        why: "Turboprop engine-failure procedures.",
      },
    ],
    silhouette: {
      lengthFt: 46.7,
      heightFt: 14.3,
      wing: "low",
      tail: "t-tail",
      engines: "wing-prop",
      fuselageWidthFt: 5.6,
      rootChordFt: 7.8,
      tipChordFt: 3.4,
      sweepDeg: 4,
      wingPos: 0.36,
      hstabSpanFt: 18.4,
      finHeightFt: 8.0,
    },
  },
  {
    id: "b738",
    name: "Boeing 737-800",
    manufacturer: "Boeing Commercial Airplanes",
    variant: "737-800 (Next Generation, CFM56-7B26/27)",
    categories: ["airliner"],
    role: "Narrow-body airliner",
    firstFlight: "1997 (737 NG)",
    seats: 189,
    overview: [
      "The 737-800 is the most widely operated member of the 737 Next Generation family, typically seating 160–189 passengers. It is flown by a two-pilot crew under Part 121 and requires a B737 type rating.",
      "Transport-category operations shift the emphasis from stick-and-rudder skills to automation management, crew coordination, standard operating procedures and energy management with a heavy, swept-wing jet.",
    ],
    cockpit: {
      layout:
        "Six Common Display System (CDS) LCD screens: captain and first officer PFD and ND outboard, upper engine display (EICAS-style N1/EGT) and lower display in the center. The Mode Control Panel (MCP) on the glareshield controls the autopilot/autothrottle; two FMS CDUs on the pedestal. Overhead panel holds electrical, hydraulic, fuel, air-conditioning/pressurization and anti-ice systems.",
      instruments: [
        "PFD (attitude, speed tape with barber pole Vmo/Mmo, altitude tape, FMA)",
        "Navigation Display (map, VOR, approach modes)",
        "Upper and lower engine displays (N1, EGT, N2, fuel flow, oil)",
        "Mode Control Panel (LNAV, VNAV, HDG SEL, LVL CHG, V/S, APP)",
        "Flight Management Computer via CDU",
        "Integrated standby flight display (ISFD)",
      ],
    },
    engine: {
      summary:
        "Two CFM International CFM56-7B high-bypass turbofans, about 26,000–27,300 lbf takeoff thrust each.",
      details: [
        "Thrust is set by N1 (fan speed) targets computed by the FMC; the autothrottle maintains speed or thrust modes.",
        "Thrust reversers (cascade type) are used on landing rollout.",
        "Engine bleed air supplies pressurization, air conditioning and anti-ice.",
      ],
    },
    fuel: {
      summary:
        "Three tanks — left main, right main and center — with ≈6,875 US gal (≈46,000 lb) capacity. Center tank fuel is used first.",
      details: [
        "Two AC-powered boost pumps per tank; crossfeed valve to balance mains.",
        "Fuel is planned and loaded in kilograms or pounds; the FMC tracks fuel predictions.",
      ],
    },
    electrical: {
      summary:
        "115 V AC 400 Hz from two engine-driven integrated drive generators (IDGs) and an APU generator; 28 V DC via transformer-rectifier units; battery and standby power.",
      details: [
        "Standby bus powers essential instruments if both generators fail.",
        "The APU can supply electrical power and bleed air on the ground and in flight (within limits).",
      ],
    },
    gear: {
      summary:
        "Hydraulically actuated retractable tricycle gear (two-wheel main and nose gear) with manual gear extension, anti-skid and autobrakes.",
      details: [
        "Main gear retracts inboard into wheel wells without doors (the wheels form part of the fuselage contour).",
        "Autobrake settings 1/2/3/MAX and RTO.",
      ],
    },
    controls: {
      summary:
        "Hydraulically powered ailerons, elevators and rudder (systems A, B and standby), with manual reversion for ailerons and elevators; spoilers/speedbrakes; leading-edge slats/Krueger flaps and triple-slotted trailing-edge flaps.",
      details: [
        "Flap positions 1, 2, 5, 10, 15, 25, 30, 40 (SkyReady models a subset).",
        "Stabilizer trim with main electric, autopilot and manual trim wheels.",
      ],
    },
    limitations: [
      "B737 type rating and a two-pilot crew are required.",
      "Vmo 340 KIAS / Mmo 0.82; maximum operating altitude 41,000 ft.",
      "Turbine aircraft display a barber pole (Vmo/Mmo) rather than colored airspeed arcs — the arc graphic here is a teaching aid built from the model's reference speeds.",
    ],
    training: [
      {
        scenario: "ifr-ils",
        label: "ILS approach",
        why: "Stabilized approach criteria at 1,000 ft.",
      },
      { scenario: "ifr-departure", label: "IFR departure", why: "SID compliance with automation." },
      { scenario: "free-flight", label: "Free flight", why: "Explore jet energy management." },
    ],
    silhouette: {
      lengthFt: 129.5,
      heightFt: 41.2,
      wing: "low",
      tail: "conventional",
      engines: "wing-jet",
      fuselageWidthFt: 12.3,
      rootChordFt: 24,
      tipChordFt: 4.5,
      sweepDeg: 28,
      wingPos: 0.36,
      hstabSpanFt: 47,
      finHeightFt: 22,
    },
  },
  {
    id: "a320",
    name: "Airbus A320",
    manufacturer: "Airbus",
    variant: "A320ceo (CFM56-5B / IAE V2500)",
    categories: ["airliner"],
    role: "Narrow-body airliner",
    firstFlight: "1987",
    seats: 180,
    overview: [
      "The A320 introduced digital fly-by-wire flight controls and side-sticks to civil airliners. Its flight-control laws provide envelope protection (bank, pitch, high angle-of-attack and overspeed) in Normal Law.",
      "Airbus philosophy relies on ECAM (Electronic Centralised Aircraft Monitor) for system failures and on autothrust that keeps the thrust levers in fixed detents (CL, FLX/MCT, TOGA) rather than moving them.",
    ],
    cockpit: {
      layout:
        "Six identical display units: PFD and ND for each pilot and two ECAM displays (Engine/Warning Display upper, System Display lower) in the center. The Flight Control Unit (FCU) on the glareshield, MCDUs on the pedestal, side-sticks outboard of each pilot, and an overhead panel arranged by system with 'lights-out' philosophy.",
      instruments: [
        "PFD with Flight Mode Annunciator (FMA) and speed tape (VLS, alpha prot, Vmax)",
        "Navigation Display (ARC, ROSE, PLAN)",
        "E/WD and SD ECAM displays",
        "Flight Control Unit (SPD/HDG/ALT/VS knobs: managed vs. selected)",
        "MCDU (FMGS)",
        "Integrated standby instrument system (ISIS)",
      ],
    },
    engine: {
      summary:
        "Two high-bypass turbofans — CFM56-5B or IAE V2500-A5 — around 27,000 lbf each, controlled by FADEC.",
      details: [
        "FADEC (Full Authority Digital Engine Control) manages start, thrust and protections.",
        "Thrust lever detents: TOGA, FLX/MCT, CL (climb), IDLE; autothrust is active between IDLE and CL.",
      ],
    },
    fuel: {
      summary:
        "Wing tanks (inner and outer cells) and a center tank, ≈6,400 US gal (≈19,000 kg) usable, with automatic transfer logic.",
      details: [
        "Outer-cell fuel transfers to the inner cells to provide wing bending relief.",
        "Fuel-used and FOB monitored on ECAM; the FMGS computes predictions.",
      ],
    },
    electrical: {
      summary:
        "115 V AC 400 Hz from two IDGs and the APU generator; DC via TRs; a Ram Air Turbine (RAT) drives an emergency generator if all AC is lost.",
      details: [
        "Batteries and static inverter for emergency electrical configuration.",
        "ECAM electrical page shows bus status.",
      ],
    },
    gear: {
      summary:
        "Hydraulic retractable tricycle gear (two-wheel main and nose) with gravity extension crank, anti-skid and autobrake LO/MED/MAX.",
      details: ["Brake temperature monitoring on ECAM WHEEL page."],
    },
    controls: {
      summary:
        "Fly-by-wire with side-sticks; flight-control computers (ELACs, SECs, FACs) drive hydraulically powered surfaces from Green, Blue and Yellow systems.",
      details: [
        "Normal Law: protections against excessive bank, pitch, angle of attack (alpha floor) and overspeed.",
        "Degraded laws (Alternate, Direct) remove protections after multiple failures; mechanical backup via rudder and trim.",
        "Flap/slat configuration lever positions 0, 1, 1+F, 2, 3, FULL.",
      ],
    },
    limitations: [
      "A320 type rating and a two-pilot crew are required.",
      "Vmo 350 KIAS / Mmo 0.82; maximum operating altitude ≈39,800 ft.",
      "Airbus speed tapes show VLS and Vmax rather than colored arcs — the dial on this page is a teaching aid.",
    ],
    training: [
      {
        scenario: "ifr-ils",
        label: "ILS approach",
        why: "Managed vs. selected guidance concepts.",
      },
      { scenario: "ifr-rnav", label: "RNAV approach", why: "FMS-based approach navigation." },
      {
        scenario: "free-flight",
        label: "Free flight",
        why: "Explore airliner handling in the simplified model.",
      },
    ],
    silhouette: {
      lengthFt: 123.3,
      heightFt: 38.6,
      wing: "low",
      tail: "conventional",
      engines: "wing-jet",
      fuselageWidthFt: 13,
      rootChordFt: 22,
      tipChordFt: 5,
      sweepDeg: 27,
      wingPos: 0.37,
      hstabSpanFt: 41,
      finHeightFt: 20,
    },
  },
];

export function getAircraft(id: string): AircraftInfo | undefined {
  return AIRCRAFT.find((a) => a.id === id);
}

export function perfFor(info: AircraftInfo): AircraftPerf {
  return getPerf(info.id);
}

export interface SpecRow {
  label: string;
  value: string;
  note?: string;
}

const n = (v: number, d = 0) =>
  v.toLocaleString("en-US", { maximumFractionDigits: d, minimumFractionDigits: d });

/** Endurance (hours) at cruise burn with all usable fuel. */
export function enduranceHr(p: AircraftPerf): number {
  return p.fuelBurnCruiseGph > 0 ? p.usableFuelGal / p.fuelBurnCruiseGph : 0;
}

/** Still-air range (nm) at cruise with a 45-minute reserve. */
export function rangeNm(p: AircraftPerf, reserveMin = 45): number {
  const hrs = Math.max(0, enduranceHr(p) - reserveMin / 60);
  return hrs * p.cruiseKtas;
}

/** Performance specification table, derived from AIRCRAFT_PERF so numbers stay consistent. */
export function perfSpecs(p: AircraftPerf): SpecRow[] {
  const power =
    p.powerType === "jet"
      ? `${p.engines} × ${n(p.thrustLbfPerEngine)} lbf thrust`
      : `${p.engines} × ${n(p.hpPerEngine)} ${p.powerType === "turboprop" ? "shp" : "hp"}${p.turbocharged ? " (turbocharged)" : ""}`;
  const totalPower =
    p.powerType === "jet" ? p.engines * p.thrustLbfPerEngine : p.engines * p.hpPerEngine;
  const rows: SpecRow[] = [
    { label: "Powerplant", value: power },
    {
      label: "Power type",
      value:
        p.powerType === "jet" ? "Turbofan" : p.powerType === "turboprop" ? "Turboprop" : "Piston",
    },
    { label: "Max gross weight", value: `${n(p.maxGrossLb)} lb` },
    { label: "Empty weight", value: `${n(p.emptyWeightLb)} lb` },
    {
      label: "Useful load",
      value: `${n(p.maxGrossLb - p.emptyWeightLb)} lb`,
      note: "Max gross − empty",
    },
    { label: "Wing span", value: `${n(p.wingSpanFt, 1)} ft` },
    { label: "Wing area", value: `${n(p.wingAreaSqFt, 0)} sq ft` },
    {
      label: "Wing loading",
      value: `${n(p.maxGrossLb / p.wingAreaSqFt, 1)} lb/sq ft`,
      note: "At max gross",
    },
    p.powerType === "jet"
      ? { label: "Thrust-to-weight", value: n(totalPower / p.maxGrossLb, 2), note: "At max gross" }
      : {
          label: "Power loading",
          value: `${n(p.maxGrossLb / totalPower, 1)} lb/hp`,
          note: "At max gross",
        },
    {
      label: "Cruise speed",
      value: `${n(p.cruiseKtas)} KTAS`,
      note: `Typical at ${n(p.cruiseAltFt)} ft`,
    },
    { label: "Service ceiling", value: `${n(p.serviceCeilingFt)} ft` },
    {
      label: "Usable fuel",
      value: `${n(p.usableFuelGal, p.usableFuelGal < 100 ? 1 : 0)} gal ${p.fuelType}`,
    },
    { label: "Fuel burn (cruise)", value: `${n(p.fuelBurnCruiseGph, 1)} gal/h` },
    { label: "Fuel burn (full power)", value: `${n(p.fuelBurnFullGph, 1)} gal/h` },
    {
      label: "Endurance",
      value: `${n(enduranceHr(p), 1)} h`,
      note: "All usable fuel at cruise burn, no reserve",
    },
    {
      label: "Range (45-min reserve)",
      value: `${n(rangeNm(p))} nm`,
      note: "Still air, cruise speed — no climb/descent allowance",
    },
    { label: "Flap settings", value: p.flapDetents.map((d) => `${d}°`).join(" / ") },
    { label: "Landing gear", value: p.retractableGear ? "Retractable" : "Fixed" },
    {
      label: "Avionics (as simulated)",
      value: {
        steam: "Analog six-pack",
        g1000: "Garmin G1000-style PFD/MFD",
        perspective: "Cirrus Perspective-style",
        airliner: "Airliner EFIS",
      }[p.avionics],
    },
  ];
  return rows;
}

export interface VSpeedRow {
  key: string;
  label: string;
  kias: number;
  meaning: string;
}

/** Operational limitations / V-speeds from the perf model. */
export function vSpeeds(p: AircraftPerf): VSpeedRow[] {
  const v = p.v;
  const rows: VSpeedRow[] = [
    {
      key: "Vso",
      label: "Vso",
      kias: v.so,
      meaning: "Stall speed in landing configuration (bottom of white arc)",
    },
    {
      key: "Vs1",
      label: "Vs1",
      kias: v.s1,
      meaning: "Stall speed in a specified (clean) configuration (bottom of green arc)",
    },
    { key: "Vr", label: "Vr", kias: v.r, meaning: "Rotation speed" },
    {
      key: "Vx",
      label: "Vx",
      kias: v.x,
      meaning: "Best angle of climb (most altitude per distance)",
    },
    { key: "Vy", label: "Vy", kias: v.y, meaning: "Best rate of climb (most altitude per time)" },
    { key: "Vg", label: "Vglide", kias: v.g, meaning: "Best glide speed (max weight)" },
    {
      key: "Vref",
      label: "Vref",
      kias: v.ref,
      meaning: "Reference landing approach speed (simulator target)",
    },
    {
      key: "Vfe",
      label: "Vfe",
      kias: v.fe,
      meaning: "Maximum flap extended speed (top of white arc)",
    },
    {
      key: "Va",
      label: "Va",
      kias: v.a,
      meaning: "Design maneuvering speed (max gross) — decreases at lower weights",
    },
    {
      key: "Vno",
      label: "Vno",
      kias: v.no,
      meaning: "Maximum structural cruising speed (top of green arc) — smooth air only above",
    },
    {
      key: "Vne",
      label: p.powerType === "piston" ? "Vne" : "Vmo (approx.)",
      kias: v.ne,
      meaning:
        p.powerType === "piston"
          ? "Never-exceed speed (red line)"
          : "Maximum operating speed (turbine aircraft use Vmo/Mmo)",
    },
  ];
  if (v.le !== undefined)
    rows.push({
      key: "Vle",
      label: "Vle",
      kias: v.le,
      meaning: "Maximum landing gear extended speed",
    });
  if (v.mc !== undefined)
    rows.push({
      key: "Vmc",
      label: "Vmc",
      kias: v.mc,
      meaning: "Minimum control speed, critical engine inoperative (red radial)",
    });
  if (p.engines > 1 && p.powerType !== "jet")
    rows.push({
      key: "Vyse",
      label: "Vyse (≈Vy)",
      kias: v.y,
      meaning: "Best single-engine rate of climb (blue line) — approximated by Vy in this model",
    });
  return rows.sort((a, b) => a.kias - b.kias);
}

export const ALL_AIRCRAFT_IDS = AIRCRAFT_PERF.map((p) => p.id);
