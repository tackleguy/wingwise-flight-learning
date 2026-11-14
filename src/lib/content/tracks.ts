/**
 * Certification tracks: FAA certificates, ratings, endorsements and additional training
 * pathways, mapped onto TeachX ground modules, exams, simulator scenarios and ATC practice.
 *
 * Requirement summaries are paraphrased from 14 CFR Part 61/91 for study purposes. Always check
 * the current eCFR text and ACS. Completing TeachX training does not grant any FAA certificate,
 * rating, endorsement or loggable flight time.
 */
import type { TrackId, TrainingState } from "@/lib/store";
import { getModule } from "./index";

export type TrackKind = "certificate" | "rating" | "endorsement" | "pathway";

export interface ModuleRef {
  course: "vfr" | "ifr";
  moduleId: string;
}

export interface Requirement {
  label: string;
  detail: string;
  ref?: string;
}

export interface Track {
  id: TrackId;
  title: string;
  /** Short name for chips, e.g. "PPL". */
  short: string;
  kind: TrackKind;
  summary: string;
  /** Tracks normally completed first. */
  prerequisites: TrackId[];
  eligibility: Requirement[];
  experience: Requirement[];
  testing: Requirement[];
  privileges: string[];
  knowledgeAreas: string[];
  groundModules: ModuleRef[];
  examIds: string[];
  simScenarios: string[];
  oralTopics: string[];
  scenarioEvaluations: string[];
  atcScenarios: string[];
  references: string[];
}

/* ------------------------------------------------------------------------------------------ */
/* Lookup tables used by track pages                                                           */
/* ------------------------------------------------------------------------------------------ */

export const EXAM_INFO: Record<string, { title: string; kind: "written" | "topic" }> = {
  par: { title: "Private Pilot Airplane (PAR)", kind: "written" },
  ira: { title: "Instrument Rating Airplane (IRA)", kind: "written" },
  cax: { title: "Commercial Pilot Airplane (CAX)", kind: "written" },
  atm: { title: "ATP Multiengine Airplane (ATM)", kind: "written" },
  fia: { title: "Flight Instructor Airplane (FIA)", kind: "written" },
  foi: { title: "Fundamentals of Instructing (FOI)", kind: "written" },
  fii: { title: "Flight Instructor Instrument Airplane (FII)", kind: "written" },
  regs: { title: "Regulations", kind: "topic" },
  weather: { title: "Weather", kind: "topic" },
  systems: { title: "Aircraft Systems", kind: "topic" },
  navigation: { title: "Navigation", kind: "topic" },
  aero: { title: "Aerodynamics", kind: "topic" },
  performance: { title: "Performance & Weight/Balance", kind: "topic" },
  "human-factors": { title: "Human Factors & ADM", kind: "topic" },
  "atc-comms": { title: "ATC Communications", kind: "topic" },
};

export const SIM_SCENARIOS: Record<string, string> = {
  "free-flight": "Free flight",
  "vfr-pattern": "Traffic pattern",
  "vfr-takeoff-climb": "Takeoff & climb",
  "vfr-turns-climbs": "Turns, climbs & descents",
  "vfr-slow-flight": "Slow flight",
  "vfr-stall": "Power-on / power-off stalls",
  "vfr-ground-ref": "Ground reference maneuvers",
  "vfr-xc": "VFR cross-country",
  "vfr-landing": "Normal & crosswind landings",
  "ifr-ils": "ILS approach",
  "ifr-rnav": "RNAV (GPS) approach",
  "ifr-hold": "Holding pattern",
  "ifr-vor-intercept": "VOR intercept & tracking",
  "ifr-dme-arc": "DME arc",
  "ifr-missed": "Missed approach",
  "ifr-departure": "IFR departure",
  "emg-engine-failure": "Engine failure",
  "emg-electrical": "Electrical failure",
  "emg-vacuum": "Vacuum failure (partial panel)",
  "emg-radio": "Radio failure",
  "emg-weather": "Inadvertent IMC / weather",
  "checkride-private": "Private pilot mock checkride",
  "checkride-instrument": "Instrument mock checkride",
};

export const ATC_SCENARIOS: Record<string, string> = {
  taxi: "Taxi clearance",
  takeoff: "Takeoff clearance",
  departure: "Departure",
  "flight-following": "VFR flight following",
  "freq-change": "Frequency change",
  "traffic-advisory": "Traffic advisories",
  "class-d-entry": "Class D entry",
  landing: "Landing clearance",
  "go-around": "Go-around",
  "ifr-clearance-request": "IFR clearance request",
  "ifr-departure-clearance": "IFR departure clearance",
  "instrument-approach": "Instrument approach",
  "established-final": "Established on final",
  "freq-change-request": "Frequency change request",
  emergency: "Emergency",
};

export const KIND_LABEL: Record<TrackKind, string> = {
  certificate: "Certificate",
  rating: "Rating",
  endorsement: "Endorsement",
  pathway: "Training pathway",
};

const vfr = (...ids: string[]): ModuleRef[] => ids.map((moduleId) => ({ course: "vfr", moduleId }));
const ifr = (...ids: string[]): ModuleRef[] => ids.map((moduleId) => ({ course: "ifr", moduleId }));
const ALL_VFR = vfr(
  "principles",
  "systems",
  "controls",
  "aerodynamics",
  "regulations",
  "airspace",
  "weather",
  "charts",
  "pilotage",
  "dead-reckoning",
  "radio",
  "airport-ops",
  "traffic-patterns",
  "takeoffs-landings",
  "cross-country",
  "emergencies",
  "night",
  "adm",
);
const ALL_IFR = ifr(
  "fundamentals",
  "regulations",
  "weather",
  "navigation",
  "approaches",
  "planning",
  "emergencies",
);

/* ------------------------------------------------------------------------------------------ */
/* Tracks                                                                                      */
/* ------------------------------------------------------------------------------------------ */

export const TRACKS: Track[] = [
  {
    id: "student",
    title: "Student Pilot",
    short: "Student",
    kind: "certificate",
    summary:
      "The starting point. A student pilot certificate plus instructor endorsements allows you to fly solo — no passengers — while you train toward a pilot certificate.",
    prerequisites: [],
    eligibility: [
      {
        label: "Age",
        detail: "At least 16 years old (14 for glider or balloon).",
        ref: "14 CFR 61.83",
      },
      {
        label: "Language",
        detail: "Able to read, speak, write and understand English.",
        ref: "61.83",
      },
      {
        label: "Application",
        detail:
          "Apply through IACRA with a CFI, designated examiner, FSDO or certification representative. Certificates issued since April 2016 do not expire.",
        ref: "61.85",
      },
      {
        label: "Medical",
        detail:
          "At least a third-class medical certificate before exercising solo privileges (BasicMed requires having held a medical certificate after July 14, 2006).",
        ref: "61.23",
      },
    ],
    experience: [
      {
        label: "Pre-solo knowledge test",
        detail:
          "Written test given and graded by your instructor on Part 61/91 rules, local airspace and airport procedures, and the aircraft; missed items reviewed to 100%.",
        ref: "61.87(b)",
      },
      {
        label: "Pre-solo flight training",
        detail:
          "Training in the listed maneuvers — ground operations, takeoffs and landings, traffic patterns, stalls, emergencies, go-arounds and more.",
        ref: "61.87(c),(d)",
      },
      {
        label: "Solo endorsement",
        detail:
          "Instructor endorsements on the student certificate/logbook for the make and model; solo endorsement valid for 90 days.",
        ref: "61.87(n)",
      },
      {
        label: "Solo cross-country",
        detail:
          "Separate training, endorsements and a reviewed flight plan for each solo cross-country.",
        ref: "61.93",
      },
      {
        label: "Class B airspace",
        detail:
          "Specific ground and flight training plus an endorsement to operate solo in Class B or at a Class B primary airport.",
        ref: "61.95",
      },
    ],
    testing: [
      {
        label: "No FAA test",
        detail:
          "There is no FAA knowledge or practical test for the student certificate itself; the pre-solo test is given by your instructor.",
        ref: "61.87",
      },
    ],
    privileges: [
      "Solo flight (sole occupant) when properly endorsed",
      "No passengers, no compensation or hire, not in furtherance of a business",
      "Not with flight or surface visibility below 3 SM by day or 5 SM at night, or without visual reference to the surface (61.89)",
    ],
    knowledgeAreas: [
      "Aircraft controls & systems",
      "Basic aerodynamics",
      "Pre-solo regulations (61.87, 61.89, Part 91)",
      "Airport operations & traffic patterns",
      "Radio communication",
      "Emergency procedures",
      "Local airspace",
    ],
    groundModules: vfr(
      "principles",
      "controls",
      "systems",
      "regulations",
      "airport-ops",
      "traffic-patterns",
      "takeoffs-landings",
      "radio",
      "emergencies",
    ),
    examIds: ["regs", "aero", "systems", "atc-comms"],
    simScenarios: [
      "free-flight",
      "vfr-takeoff-climb",
      "vfr-turns-climbs",
      "vfr-slow-flight",
      "vfr-stall",
      "vfr-pattern",
      "vfr-landing",
      "emg-engine-failure",
    ],
    oralTopics: [
      "Student pilot limitations (61.89)",
      "Solo endorsements and their validity",
      "Right-of-way rules (91.113)",
      "Light gun signals",
      "Traffic pattern entry and departure",
      "Engine failure after takeoff",
    ],
    scenarioEvaluations: [
      "During your first solo the tower instructs you to extend downwind for traffic. What do you do and say?",
      "Your solo endorsement is dated 92 days ago. The weather is perfect. May you fly solo today?",
      "On the takeoff roll the airspeed indicator reads zero. What do you do?",
    ],
    atcScenarios: ["taxi", "takeoff", "landing", "go-around"],
    references: [
      "14 CFR 61.83–61.95",
      "Airplane Flying Handbook (FAA-H-8083-3)",
      "Pilot's Handbook of Aeronautical Knowledge (FAA-H-8083-25)",
    ],
  },
  {
    id: "private",
    title: "Private Pilot",
    short: "PPL",
    kind: "certificate",
    summary:
      "Fly as pilot in command with passengers, day and night, in VFR conditions anywhere in the United States. Not for compensation, but you may share operating expenses.",
    prerequisites: ["student"],
    eligibility: [
      {
        label: "Age",
        detail: "At least 17 years old (16 for glider or balloon).",
        ref: "61.103(a)",
      },
      { label: "Language", detail: "Read, speak, write and understand English.", ref: "61.103(c)" },
      {
        label: "Certificate",
        detail: "Hold a U.S. student, sport or recreational pilot certificate.",
        ref: "61.103(i)",
      },
      {
        label: "Endorsements",
        detail:
          "Instructor endorsements for the knowledge test (61.105 areas) and the practical test (61.107 areas).",
        ref: "61.103(d),(f)",
      },
      {
        label: "Medical",
        detail: "Third-class medical certificate or BasicMed to act as PIC.",
        ref: "61.23, Part 68",
      },
    ],
    experience: [
      {
        label: "Total time",
        detail:
          "At least 40 hours of flight time, including at least 20 hours of flight training from an authorized instructor and 10 hours of solo flight.",
        ref: "61.109(a)",
      },
      {
        label: "Cross-country training",
        detail: "3 hours of cross-country flight training in a single-engine airplane.",
        ref: "61.109(a)(1)",
      },
      {
        label: "Night training",
        detail:
          "3 hours of night training including one cross-country of over 100 NM total distance and 10 takeoffs and landings to a full stop, each involving a flight in the traffic pattern.",
        ref: "61.109(a)(2)",
      },
      {
        label: "Instrument training",
        detail:
          "3 hours of training on control and maneuvering solely by reference to instruments.",
        ref: "61.109(a)(3)",
      },
      {
        label: "Checkride preparation",
        detail:
          "3 hours of training in preparation for the practical test within the preceding 2 calendar months.",
        ref: "61.109(a)(4)",
      },
      {
        label: "Solo",
        detail:
          "5 hours of solo cross-country; one solo cross-country of at least 150 NM total distance with full-stop landings at three points and one segment over 50 NM straight-line; three full-stop takeoffs and landings at an airport with an operating control tower.",
        ref: "61.109(a)(5)",
      },
    ],
    testing: [
      {
        label: "Knowledge test (PAR)",
        detail: "60 questions, 2.5 hours, 70% to pass. Results are valid for 24 calendar months.",
        ref: "61.35, 61.39",
      },
      {
        label: "Practical test",
        detail: "Oral and flight test with an examiner to the Private Pilot – Airplane ACS.",
        ref: "FAA-S-ACS-6",
      },
    ],
    privileges: [
      "Act as pilot in command and carry passengers (61.113)",
      "Share operating expenses pro rata with passengers (61.113(c))",
      "Not for compensation or hire, with limited exceptions (61.113(b))",
      "Night privileges (a certificate issued under the 61.110 exceptions carries a 'night flying prohibited' limitation)",
    ],
    knowledgeAreas: [
      "Aerodynamics and aircraft performance",
      "Aircraft systems and instruments",
      "14 CFR Parts 61, 91 and NTSB 830",
      "Airspace and weather minimums",
      "Weather theory, reports and forecasts",
      "Navigation: pilotage, dead reckoning, VOR, GPS",
      "Weight and balance",
      "Aeromedical factors and ADM",
      "Radio communications and ATC",
      "Emergency procedures",
    ],
    groundModules: ALL_VFR,
    examIds: [
      "par",
      "regs",
      "weather",
      "aero",
      "navigation",
      "performance",
      "systems",
      "human-factors",
      "atc-comms",
    ],
    simScenarios: [
      "vfr-takeoff-climb",
      "vfr-turns-climbs",
      "vfr-slow-flight",
      "vfr-stall",
      "vfr-ground-ref",
      "vfr-pattern",
      "vfr-landing",
      "vfr-xc",
      "emg-engine-failure",
      "emg-electrical",
      "emg-weather",
      "checkride-private",
    ],
    oralTopics: [
      "Pilot qualifications, currency and documents",
      "Airworthiness: ARROW, required inspections (AV1ATE), 91.205 equipment",
      "Weather information and go/no-go decisions",
      "Cross-country planning, fuel requirements and VFR cruising altitudes",
      "National airspace system and VFR minimums",
      "Performance, limitations and weight & balance",
      "Aircraft systems",
      "Aeromedical factors and risk management",
    ],
    scenarioEvaluations: [
      "You planned a cross-country with a 1,200-ft overcast forecast to lift by noon. At 11:30 it is 1,500 broken. Walk through your go/no-go decision.",
      "En route at 4,500 ft, the oil pressure needle drops into the yellow while oil temperature rises. What are your options?",
      "Your passenger is a friend who offers to pay for the whole flight. What may you accept?",
      "Density altitude at your departure airport is 7,800 ft. How does this change your plan?",
    ],
    atcScenarios: [
      "taxi",
      "takeoff",
      "departure",
      "flight-following",
      "freq-change",
      "traffic-advisory",
      "class-d-entry",
      "landing",
      "go-around",
      "emergency",
    ],
    references: [
      "14 CFR 61.102–61.117",
      "Private Pilot ACS (FAA-S-ACS-6)",
      "PHAK (FAA-H-8083-25)",
      "AIM",
    ],
  },
  {
    id: "instrument",
    title: "Instrument Rating",
    short: "IR",
    kind: "rating",
    summary:
      "Fly under instrument flight rules — in clouds and low visibility — using instruments, ATC clearances and instrument approach procedures. The single biggest safety upgrade for a private pilot.",
    prerequisites: ["private"],
    eligibility: [
      {
        label: "Certificate",
        detail:
          "Hold at least a private pilot certificate (or apply for it concurrently) with the appropriate category rating.",
        ref: "61.65(a)(1)",
      },
      {
        label: "Language",
        detail: "Read, speak, write and understand English.",
        ref: "61.65(a)(2)",
      },
      {
        label: "Endorsements",
        detail: "Instructor endorsements for the knowledge test and for the practical test.",
        ref: "61.65(a)(3),(a)(6)",
      },
    ],
    experience: [
      {
        label: "Cross-country PIC",
        detail:
          "At least 50 hours of cross-country flight time as pilot in command, of which at least 10 hours must be in airplanes.",
        ref: "61.65(d)(1)",
      },
      {
        label: "Instrument time",
        detail:
          "40 hours of actual or simulated instrument time, of which 15 hours must be instrument training from an authorized instructor (CFII). Some may be completed in approved simulators or training devices within the limits of 61.65(i).",
        ref: "61.65(d)(2)",
      },
      {
        label: "IFR cross-country",
        detail:
          "With an instructor, under IFR on an IFR flight plan: at least 250 NM along airways or ATC-directed routing, an instrument approach at each airport, and three different kinds of approaches using navigation systems.",
        ref: "61.65(d)(2)(ii)",
      },
      {
        label: "Checkride preparation",
        detail:
          "3 hours of instrument training in preparation for the practical test within the preceding 2 calendar months.",
        ref: "61.65(d)(2)(iii)",
      },
    ],
    testing: [
      {
        label: "Knowledge test (IRA)",
        detail: "60 questions, 2.5 hours, 70% to pass.",
        ref: "61.65(a)(4)",
      },
      {
        label: "Practical test",
        detail:
          "Instrument Rating – Airplane ACS: procedures, holds, approaches (precision and non-precision), missed approach, partial panel, and emergencies.",
        ref: "FAA-S-ACS-8",
      },
    ],
    privileges: [
      "Act as PIC under IFR or in weather conditions less than VFR minimums (61.3(e))",
      "Required for Class A airspace and for most commercial operations",
      "Currency: 6 approaches, holding, and intercepting/tracking courses within the preceding 6 calendar months, or an instrument proficiency check (61.57(c),(d))",
    ],
    knowledgeAreas: [
      "IFR regulations (Part 91 subpart B, 61.57)",
      "Instrument flying & attitude instrument scan",
      "Navigation systems: VOR, ILS, GPS/RNAV",
      "IFR charts: en route, SID, STAR, approach plates",
      "Holding procedures",
      "IFR weather, icing and thunderstorm avoidance",
      "ATC clearances and lost-communication procedures (91.185)",
      "IFR flight planning, alternates (91.167, 91.169)",
      "Aeromedical factors and spatial disorientation",
    ],
    groundModules: [...ALL_IFR, ...vfr("weather", "adm")],
    examIds: ["ira", "regs", "weather", "navigation", "atc-comms", "human-factors"],
    simScenarios: [
      "ifr-departure",
      "ifr-vor-intercept",
      "ifr-hold",
      "ifr-dme-arc",
      "ifr-ils",
      "ifr-rnav",
      "ifr-missed",
      "emg-vacuum",
      "emg-radio",
      "emg-electrical",
      "checkride-instrument",
    ],
    oralTopics: [
      "IFR currency and proficiency",
      "Required equipment and inspections for IFR (91.205(d), 91.411, 91.413, 91.171)",
      "IFR alternate requirements (1-2-3 rule)",
      "Lost communications procedures (91.185)",
      "Approach charts: minimums, MAP, visual descent point",
      "Holding entries and timing",
      "Icing and convective weather",
      "Partial-panel operations",
    ],
    scenarioEvaluations: [
      "Your destination forecast is 1,500 ft overcast and 4 SM from one hour before to one hour after arrival. Do you need an alternate?",
      "You lose two-way radio communication in IMC on a vectored heading. What route and altitude do you fly?",
      "At the decision altitude on an ILS you see the approach lights but not the runway. May you continue, and how far?",
      "Your attitude indicator slowly tumbles in IMC. How do you recognize and handle it?",
    ],
    atcScenarios: [
      "ifr-clearance-request",
      "ifr-departure-clearance",
      "departure",
      "freq-change-request",
      "instrument-approach",
      "established-final",
      "go-around",
      "emergency",
    ],
    references: [
      "14 CFR 61.65, 61.57, 91.167–91.187",
      "Instrument Rating ACS (FAA-S-ACS-8)",
      "Instrument Flying Handbook (FAA-H-8083-15)",
      "Instrument Procedures Handbook (FAA-H-8083-16)",
    ],
  },
  {
    id: "commercial",
    title: "Commercial Pilot",
    short: "CPL",
    kind: "certificate",
    summary:
      "Fly for compensation or hire within the limits of Part 61 and the operating rules that apply — the gateway to flying as a career.",
    prerequisites: ["private", "instrument"],
    eligibility: [
      { label: "Age", detail: "At least 18 years old.", ref: "61.123(a)" },
      { label: "Language", detail: "Read, speak, write and understand English.", ref: "61.123(b)" },
      {
        label: "Certificate",
        detail: "Hold at least a private pilot certificate.",
        ref: "61.123(h)",
      },
      {
        label: "Medical",
        detail: "Second-class medical certificate to exercise commercial privileges.",
        ref: "61.23(a)(2)",
      },
    ],
    experience: [
      {
        label: "Total time",
        detail:
          "250 hours of flight time, including 100 hours in powered aircraft (50 in airplanes).",
        ref: "61.129(a)",
      },
      {
        label: "Pilot in command",
        detail:
          "100 hours as PIC, including 50 hours in airplanes and 50 hours of cross-country (10 in airplanes).",
        ref: "61.129(a)(2)",
      },
      {
        label: "Training",
        detail:
          "20 hours of training including 10 hours of instrument training (5 in a single-engine airplane), 10 hours in a complex, turbine-powered or technically advanced airplane, a 2-hour day and a 2-hour night cross-country each over 100 NM straight-line, and 3 hours of checkride preparation.",
        ref: "61.129(a)(3)",
      },
      {
        label: "Solo / PIC with instructor",
        detail:
          "10 hours including one cross-country of at least 300 NM total with landings at three points, one at least 250 NM straight-line from the original departure point, and 5 hours of night VFR with 10 takeoffs and landings at a towered airport.",
        ref: "61.129(a)(4)",
      },
    ],
    testing: [
      {
        label: "Knowledge test (CAX)",
        detail: "100 questions, 3 hours, 70% to pass.",
        ref: "61.125",
      },
      {
        label: "Practical test",
        detail:
          "Commercial Pilot – Airplane ACS, including chandelles, lazy eights, steep spirals, eights-on-pylons and power-off 180° accuracy approach and landing.",
        ref: "FAA-S-ACS-7",
      },
    ],
    privileges: [
      "Act as PIC of an aircraft carrying persons or property for compensation or hire, subject to the applicable operating rules (61.133)",
      "Without an instrument rating: no carrying passengers for hire in airplanes on cross-countries over 50 NM or at night (61.133(b))",
    ],
    knowledgeAreas: [
      "Advanced aerodynamics and performance",
      "Complex and TAA systems",
      "Commercial regulations (61.133, Part 119 applicability)",
      "Commercial maneuvers",
      "High-altitude operations and oxygen",
      "Weather for professional operations",
      "Crew resource and risk management",
    ],
    groundModules: [
      ...vfr(
        "aerodynamics",
        "systems",
        "regulations",
        "weather",
        "cross-country",
        "emergencies",
        "night",
        "adm",
      ),
      ...ifr("weather", "planning"),
    ],
    examIds: ["cax", "aero", "performance", "systems", "regs", "weather"],
    simScenarios: [
      "vfr-takeoff-climb",
      "vfr-stall",
      "vfr-ground-ref",
      "vfr-xc",
      "vfr-landing",
      "emg-engine-failure",
      "emg-electrical",
      "emg-weather",
      "ifr-ils",
    ],
    oralTopics: [
      "Commercial privileges and limitations (61.133)",
      "Holding out and common carriage",
      "Complex and high-performance systems",
      "Commercial maneuvers: purpose and aerodynamics",
      "Supplemental oxygen requirements (91.211)",
      "Aircraft inspections required for hire (100-hour)",
    ],
    scenarioEvaluations: [
      "A local business asks you to fly its manager to a meeting in your rented airplane for $300. Is this legal under Part 91?",
      "You hold a commercial certificate without an instrument rating. May you fly paying passengers 40 NM at night?",
      "During a power-off 180 the airplane is clearly going to land short. What do you do?",
    ],
    atcScenarios: [
      "departure",
      "flight-following",
      "freq-change",
      "class-d-entry",
      "landing",
      "go-around",
      "emergency",
    ],
    references: [
      "14 CFR 61.121–61.133",
      "Commercial Pilot ACS (FAA-S-ACS-7)",
      "Airplane Flying Handbook (FAA-H-8083-3)",
    ],
  },
  {
    id: "atp",
    title: "Airline Transport Pilot",
    short: "ATP",
    kind: "certificate",
    summary:
      "The highest pilot certificate, required to act as pilot in command — and, since 2013, as first officer — in Part 121 airline operations.",
    prerequisites: ["commercial", "instrument", "multi-engine"],
    eligibility: [
      {
        label: "Age",
        detail: "At least 23 years old (21 for an ATP with restricted privileges under 61.160).",
        ref: "61.153(a)",
      },
      {
        label: "Character & language",
        detail: "Of good moral character; read, speak, write and understand English.",
        ref: "61.153(b),(c)",
      },
      {
        label: "Certificate",
        detail:
          "Commercial pilot certificate with an instrument rating (or qualifying foreign/military licence).",
        ref: "61.153(d)",
      },
      {
        label: "Training program",
        detail:
          "Complete the ATP Certification Training Program (ATP CTP) before taking the multiengine knowledge test.",
        ref: "61.156",
      },
      {
        label: "Medical",
        detail: "First-class medical certificate to exercise ATP privileges.",
        ref: "61.23(a)(1)",
      },
    ],
    experience: [
      { label: "Total time", detail: "1,500 hours total flight time.", ref: "61.159(a)" },
      {
        label: "Breakdown",
        detail:
          "500 hours cross-country, 100 hours night, 50 hours in the class of airplane, 75 hours instrument (actual or simulated; limited simulator credit), 250 hours PIC including 100 cross-country and 25 night.",
        ref: "61.159(a)",
      },
      {
        label: "Restricted ATP",
        detail:
          "Reduced minimums (e.g. 750 hours for former military pilots, 1,000 with an aviation bachelor's degree, 1,250 with an aviation associate degree) under specified conditions.",
        ref: "61.160",
      },
    ],
    testing: [
      {
        label: "Knowledge test (ATM)",
        detail:
          "Airline Transport Pilot Multiengine knowledge test, taken after completing the ATP CTP.",
        ref: "61.155",
      },
      {
        label: "Practical test",
        detail: "ATP and type rating ACS, normally completed in a full flight simulator.",
        ref: "61.157",
      },
    ],
    privileges: [
      "Act as PIC in Part 121 air carrier operations (with type rating as required)",
      "Instruct other pilots in air transportation service in aircraft for which rated (61.167)",
    ],
    knowledgeAreas: [
      "Transport-category aerodynamics and high-altitude operations",
      "Air carrier regulations (Parts 117, 121, 135)",
      "Advanced meteorology, icing and windshear",
      "Crew resource management and leadership",
      "Performance, weight and balance for transport aircraft",
      "Automation management",
    ],
    groundModules: [...ALL_IFR, ...vfr("aerodynamics", "weather", "adm")],
    examIds: ["atm", "weather", "performance", "human-factors", "regs"],
    simScenarios: [
      "ifr-departure",
      "ifr-ils",
      "ifr-rnav",
      "ifr-hold",
      "ifr-missed",
      "emg-engine-failure",
      "emg-electrical",
      "checkride-instrument",
    ],
    oralTopics: [
      "Flight and duty limits (Part 117)",
      "Windshear recognition and recovery",
      "Crew resource management",
      "Stabilized approach criteria",
      "Takeoff performance and V-speeds",
      "High-altitude aerodynamics",
    ],
    scenarioEvaluations: [
      "On a 3-mile final the first officer calls '15 knots fast, sink 1,200'. What do you do?",
      "Windshear warning on the takeoff roll at 100 kt, V1 is 130 kt. What is the correct action?",
    ],
    atcScenarios: [
      "ifr-clearance-request",
      "ifr-departure-clearance",
      "departure",
      "freq-change-request",
      "instrument-approach",
      "established-final",
      "go-around",
      "emergency",
    ],
    references: ["14 CFR 61.151–61.167", "ATP ACS", "Advisory Circular 61-138 (ATP CTP)"],
  },
  {
    id: "multi-engine",
    title: "Multi-Engine Rating",
    short: "AMEL",
    kind: "rating",
    summary:
      "Add the airplane multiengine land class rating to fly twins — focused on engine-failure handling, Vmc and single-engine performance.",
    prerequisites: ["private"],
    eligibility: [
      {
        label: "Certificate",
        detail:
          "Hold a pilot certificate with an airplane category rating (the class rating is added at that certificate level).",
        ref: "61.63(c)",
      },
    ],
    experience: [
      {
        label: "Training",
        detail:
          "Ground and flight training from an authorized instructor in the areas of operation for a multiengine class rating.",
        ref: "61.63(c)(1)",
      },
      {
        label: "Endorsement",
        detail: "Logbook endorsement certifying proficiency for the practical test.",
        ref: "61.63(c)(2)",
      },
      {
        label: "Centerline thrust",
        detail:
          "A test in a centerline-thrust airplane results in a 'limited to centerline thrust' limitation.",
        ref: "61.63(c)",
      },
    ],
    testing: [
      {
        label: "No knowledge test",
        detail: "Adding a class rating does not require a knowledge test.",
        ref: "61.63(c)(3)",
      },
      {
        label: "Practical test",
        detail:
          "Multiengine areas of operation of the applicable ACS: Vmc demonstration, engine failure during takeoff and in flight, one-engine-inoperative approach and landing.",
      },
    ],
    privileges: ["Act as PIC of multiengine airplanes at the privileges of your pilot certificate"],
    knowledgeAreas: [
      "Vmc and the factors that affect it",
      "Critical engine (P-factor, accelerated slipstream, spiraling slipstream, torque)",
      "Blue line (Vyse) and red line (Vmc)",
      "Single-engine service ceiling and climb performance",
      "Identify–verify–feather procedures",
      "Accelerate-stop and accelerate-go distances",
    ],
    groundModules: vfr("aerodynamics", "systems", "emergencies", "adm"),
    examIds: ["aero", "performance", "systems"],
    simScenarios: ["vfr-takeoff-climb", "vfr-landing", "emg-engine-failure", "ifr-ils"],
    oralTopics: [
      "Vmc certification conditions (Part 23)",
      "Why the left engine is critical on most conventional twins",
      "Zero sideslip and bank into the good engine",
      "Propeller feathering and unfeathering",
      "Single-engine approach planning",
    ],
    scenarioEvaluations: [
      "An engine fails just after liftoff with the gear still down and the runway behind you. What do you do?",
      "Below Vyse at a high-density-altitude airport you lose an engine. Which way do you bank and why?",
    ],
    atcScenarios: ["takeoff", "departure", "landing", "emergency"],
    references: ["14 CFR 61.63", "Airplane Flying Handbook — Transition to Multiengine Airplanes"],
  },
  {
    id: "seaplane",
    title: "Seaplane Rating",
    short: "ASES",
    kind: "rating",
    summary:
      "Add the airplane single-engine sea class rating to operate floatplanes and amphibians on water.",
    prerequisites: ["private"],
    eligibility: [
      {
        label: "Certificate",
        detail: "Hold a pilot certificate with an airplane category rating.",
        ref: "61.63(c)",
      },
    ],
    experience: [
      {
        label: "Training",
        detail:
          "Ground and flight training from an authorized instructor in the seaplane areas of operation.",
        ref: "61.63(c)(1)",
      },
      {
        label: "Endorsement",
        detail: "Instructor endorsement certifying readiness for the practical test.",
        ref: "61.63(c)(2)",
      },
    ],
    testing: [
      {
        label: "No knowledge test",
        detail: "Not required for an additional class rating.",
        ref: "61.63(c)(3)",
      },
      {
        label: "Practical test",
        detail:
          "Seaplane areas of operation: water taxi (idle, plow, step), sailing, docking, glassy-water and rough-water takeoffs and landings, confined-area operations.",
      },
    ],
    privileges: [
      "Act as PIC of single-engine seaplanes at the privileges of your pilot certificate",
    ],
    knowledgeAreas: [
      "Water right-of-way rules (91.115)",
      "Hydrodynamics and float design",
      "Glassy-water and rough-water techniques",
      "Wind and current effects, sailing",
      "Seaplane base and water landing area selection",
      "Water rescue and egress",
    ],
    groundModules: vfr("regulations", "weather", "takeoffs-landings", "emergencies", "adm"),
    examIds: ["regs", "performance"],
    simScenarios: ["vfr-takeoff-climb", "vfr-landing", "vfr-pattern"],
    oralTopics: [
      "91.115 right-of-way on water",
      "Step taxi and plow turns",
      "Glassy-water landing technique",
      "Weight & balance with floats",
    ],
    scenarioEvaluations: [
      "You must land on a glassy lake with no shoreline references. Describe your technique.",
      "The wind is pushing you toward a dock at 10 knots. How do you approach it?",
    ],
    atcScenarios: ["takeoff", "landing"],
    references: [
      "14 CFR 61.63",
      "Seaplane, Skiplane, and Float/Ski Equipped Helicopter Operations Handbook (FAA-H-8083-23)",
    ],
  },
  {
    id: "tailwheel",
    title: "Tailwheel Endorsement",
    short: "TW",
    kind: "endorsement",
    summary:
      "A one-time instructor endorsement required to act as pilot in command of a tailwheel (conventional gear) airplane.",
    prerequisites: ["private"],
    eligibility: [
      {
        label: "Who needs it",
        detail:
          "Anyone acting as PIC of a tailwheel airplane, unless they logged PIC time in one before April 15, 1991.",
        ref: "61.31(i)",
      },
    ],
    experience: [
      {
        label: "Flight training",
        detail:
          "Training from an authorized instructor in normal and crosswind takeoffs and landings, wheel landings (unless the manufacturer recommends against them) and go-around procedures.",
        ref: "61.31(i)(1)",
      },
      {
        label: "Endorsement",
        detail: "One-time logbook endorsement certifying proficiency.",
        ref: "61.31(i)(2)",
      },
    ],
    testing: [
      {
        label: "No FAA test",
        detail: "No knowledge or practical test — the instructor endorsement is the requirement.",
      },
    ],
    privileges: [
      "Act as PIC of tailwheel airplanes for which you hold the category and class rating",
    ],
    knowledgeAreas: [
      "Ground loop causes and prevention",
      "Directional control on the ground",
      "Three-point and wheel landings",
      "Crosswind technique",
      "P-factor and gyroscopic precession on takeoff",
    ],
    groundModules: vfr("aerodynamics", "controls", "takeoffs-landings", "traffic-patterns"),
    examIds: ["aero", "performance"],
    simScenarios: ["vfr-takeoff-climb", "vfr-pattern", "vfr-landing"],
    oralTopics: [
      "Why tailwheel airplanes ground-loop",
      "Gyroscopic precession when raising the tail",
      "Three-point vs wheel landings",
      "Taxiing in strong wind",
    ],
    scenarioEvaluations: [
      "The airplane begins to swerve left after touchdown. What do you do?",
      "Gusty 15-knot crosswind: three-point or wheel landing, and why?",
    ],
    atcScenarios: ["taxi", "takeoff", "landing"],
    references: ["14 CFR 61.31(i)", "Airplane Flying Handbook — Transition to Tailwheel Airplanes"],
  },
  {
    id: "high-performance",
    title: "High-Performance Endorsement",
    short: "HP",
    kind: "endorsement",
    summary:
      "A one-time endorsement to act as pilot in command of an airplane with an engine of more than 200 horsepower.",
    prerequisites: ["private"],
    eligibility: [
      {
        label: "Who needs it",
        detail:
          "Anyone acting as PIC of an airplane with an engine of more than 200 hp, unless they logged PIC time in one before August 4, 1997.",
        ref: "61.31(f)",
      },
    ],
    experience: [
      {
        label: "Training",
        detail:
          "Ground and flight training from an authorized instructor in a high-performance airplane, simulator or training device representative of one.",
        ref: "61.31(f)(1)",
      },
      {
        label: "Endorsement",
        detail: "One-time logbook endorsement certifying proficiency.",
        ref: "61.31(f)(1)(ii)",
      },
    ],
    testing: [
      {
        label: "No FAA test",
        detail: "No knowledge or practical test — instructor training and endorsement only.",
      },
    ],
    privileges: ["Act as PIC of airplanes with engines of more than 200 horsepower"],
    knowledgeAreas: [
      "Constant-speed propellers and manifold pressure",
      "Engine leaning and temperature management",
      "Cowl flaps",
      "Fuel injection and hot starts",
      "Higher speeds: planning descents and pattern entries",
    ],
    groundModules: vfr("systems", "aerodynamics", "takeoffs-landings", "emergencies"),
    examIds: ["systems", "performance"],
    simScenarios: ["vfr-takeoff-climb", "vfr-xc", "vfr-landing", "emg-engine-failure"],
    oralTopics: [
      "Power changes with a constant-speed propeller",
      "Shock cooling",
      "Leaning with EGT/CHT",
      "Torque and P-factor in high-power airplanes",
    ],
    scenarioEvaluations: [
      'Your manifold pressure is 25" and RPM 2,500. To reduce power, which lever do you move first?',
    ],
    atcScenarios: ["departure", "flight-following", "landing"],
    references: ["14 CFR 61.31(f)", "PHAK — Aircraft Systems"],
  },
  {
    id: "complex",
    title: "Complex Endorsement",
    short: "CX",
    kind: "endorsement",
    summary:
      "A one-time endorsement to act as pilot in command of an airplane with retractable gear, flaps and a controllable-pitch propeller.",
    prerequisites: ["private"],
    eligibility: [
      {
        label: "Who needs it",
        detail:
          "Anyone acting as PIC of a complex airplane (retractable gear, flaps and controllable-pitch propeller or FADEC; for seaplanes, flaps and controllable-pitch propeller), unless they logged PIC time in one before August 4, 1997.",
        ref: "61.31(e), 61.1",
      },
    ],
    experience: [
      {
        label: "Training",
        detail:
          "Ground and flight training from an authorized instructor in a complex airplane, simulator or training device.",
        ref: "61.31(e)(1)",
      },
      {
        label: "Endorsement",
        detail: "One-time logbook endorsement certifying proficiency.",
        ref: "61.31(e)(1)(ii)",
      },
    ],
    testing: [
      {
        label: "No FAA test",
        detail: "No knowledge or practical test — instructor training and endorsement only.",
      },
    ],
    privileges: ["Act as PIC of complex airplanes"],
    knowledgeAreas: [
      "Retractable landing gear systems and emergency extension",
      "Gear warning systems and GUMPS checks",
      "Constant-speed propeller operation",
      "Flap and gear speed limits (VLE, VLO, VFE)",
    ],
    groundModules: vfr("systems", "takeoffs-landings", "traffic-patterns", "emergencies"),
    examIds: ["systems", "performance"],
    simScenarios: ["vfr-pattern", "vfr-landing", "emg-electrical", "emg-engine-failure"],
    oralTopics: [
      "VLE vs VLO",
      "Emergency gear extension procedure",
      "Gear-up landing prevention",
      "Propeller governor operation",
    ],
    scenarioEvaluations: [
      "On downwind the gear-down light does not illuminate. What steps do you take?",
    ],
    atcScenarios: ["landing", "go-around", "emergency"],
    references: [
      "14 CFR 61.31(e)",
      "PHAK — Aircraft Systems",
      "Airplane Flying Handbook — Transition to Complex Airplanes",
    ],
  },
  {
    id: "high-altitude",
    title: "High-Altitude Endorsement",
    short: "HA",
    kind: "endorsement",
    summary:
      "A one-time endorsement for pressurized aircraft with a service ceiling or maximum operating altitude above 25,000 ft MSL.",
    prerequisites: ["private", "instrument"],
    eligibility: [
      {
        label: "Who needs it",
        detail:
          "Anyone acting as PIC of a pressurized aircraft with a service ceiling or maximum operating altitude (whichever is lower) above 25,000 ft MSL.",
        ref: "61.31(g)",
      },
    ],
    experience: [
      {
        label: "Ground training",
        detail:
          "High-altitude aerodynamics and meteorology; respiration; hypoxia and other high-altitude sickness; time of useful consciousness; effects of prolonged oxygen use; gas expansion and bubble formation; decompression.",
        ref: "61.31(g)(1)",
      },
      {
        label: "Flight training",
        detail:
          "In a pressurized aircraft or representative simulator: normal cruise above 25,000 ft, simulated rapid decompression procedures (without actually depressurizing) and emergency descent.",
        ref: "61.31(g)(2)",
      },
      { label: "Endorsement", detail: "One-time logbook endorsement.", ref: "61.31(g)" },
    ],
    testing: [
      {
        label: "No FAA test",
        detail: "No knowledge or practical test — instructor training and endorsement only.",
      },
    ],
    privileges: ["Act as PIC of high-altitude pressurized aircraft"],
    knowledgeAreas: [
      "Hypoxia types and symptoms",
      "Time of useful consciousness",
      "Supplemental oxygen rules (91.211)",
      "Pressurization systems",
      "Rapid decompression and emergency descent",
      "Jet stream, clear air turbulence and high-altitude weather",
    ],
    groundModules: [...vfr("systems", "weather", "adm"), ...ifr("weather", "emergencies")],
    examIds: ["human-factors", "weather", "systems"],
    simScenarios: ["ifr-departure", "emg-electrical", "emg-weather"],
    oralTopics: [
      "Hypoxic, hypemic, stagnant and histotoxic hypoxia",
      "Oxygen requirements above 12,500, 14,000 and 15,000 ft (91.211)",
      "Decompression sickness after scuba diving",
      "Emergency descent procedure",
    ],
    scenarioEvaluations: [
      "At FL250 the cabin altitude warning sounds and your fingertips tingle. What are your first three actions?",
    ],
    atcScenarios: ["departure", "freq-change-request", "emergency"],
    references: ["14 CFR 61.31(g), 91.211", "PHAK — Aeromedical Factors"],
  },
  {
    id: "cfi",
    title: "Certificated Flight Instructor",
    short: "CFI",
    kind: "certificate",
    summary:
      "Teach others to fly and give the training and endorsements required for student, private and commercial pilots.",
    prerequisites: ["commercial", "instrument"],
    eligibility: [
      {
        label: "Age & language",
        detail: "At least 18 years old; read, speak, write and understand English.",
        ref: "61.183(a),(b)",
      },
      {
        label: "Certificate",
        detail:
          "Commercial or ATP certificate with the category and class rating; for airplane, an instrument rating.",
        ref: "61.183(c)",
      },
      {
        label: "Spin training",
        detail:
          "Logbook endorsement for flight training in stall awareness, spin entry, spins and spin recovery.",
        ref: "61.183(i)",
      },
      {
        label: "Medical",
        detail:
          "A CFI who is not acting as PIC or required crew does not need a medical certificate.",
        ref: "61.23(b)(5)",
      },
    ],
    experience: [
      {
        label: "Ground training",
        detail:
          "Training in the fundamentals of instructing and the aeronautical knowledge areas, with endorsements.",
        ref: "61.185",
      },
      {
        label: "Flight proficiency",
        detail:
          "Flight training and endorsement in the areas of operation, including teaching them from the right seat.",
        ref: "61.187",
      },
    ],
    testing: [
      {
        label: "Knowledge tests",
        detail:
          "Fundamentals of Instructing (FOI) — unless exempt under 61.183(d) — and Flight Instructor Airplane (FIA).",
        ref: "61.183(d),(e)",
      },
      {
        label: "Practical test",
        detail:
          "Flight Instructor – Airplane practical test: explaining and demonstrating maneuvers, lesson planning, and analysing student errors.",
      },
    ],
    privileges: [
      "Give training and endorsements within the limits of 61.193 and 61.195",
      "Renewal and recent-experience rules in 61.197–61.199 apply",
    ],
    knowledgeAreas: [
      "Fundamentals of instructing: learning theory, the teaching process, assessment",
      "Human behavior and effective communication",
      "Lesson plans and scenario-based training",
      "Instructor responsibilities and endorsements (AC 61-65)",
      "Technical subject areas at commercial level",
      "Spin awareness and recovery",
    ],
    groundModules: ALL_VFR,
    examIds: ["foi", "fia", "aero", "regs"],
    simScenarios: [
      "vfr-slow-flight",
      "vfr-stall",
      "vfr-ground-ref",
      "vfr-landing",
      "emg-engine-failure",
      "checkride-private",
    ],
    oralTopics: [
      "Laws of learning and levels of learning",
      "Common student errors and how to correct them",
      "Required endorsements (AC 61-65)",
      "Teaching the aerodynamics of a stall and spin",
      "Instructor liability and 61.195 limitations",
    ],
    scenarioEvaluations: [
      "Your student consistently flares too high. How do you diagnose and correct the problem?",
      "A student asks for a solo cross-country endorsement but the forecast is marginal. How do you handle it?",
    ],
    atcScenarios: ["taxi", "class-d-entry", "landing", "go-around"],
    references: [
      "14 CFR 61.181–61.199",
      "Aviation Instructor's Handbook (FAA-H-8083-9)",
      "AC 61-65 (Certification: Pilots and Flight and Ground Instructors)",
    ],
  },
  {
    id: "cfii",
    title: "Instrument Flight Instructor (CFII)",
    short: "CFII",
    kind: "rating",
    summary:
      "Add an instrument rating to a flight instructor certificate to give instrument training and instrument proficiency checks.",
    prerequisites: ["cfi", "instrument"],
    eligibility: [
      {
        label: "Pilot certificate",
        detail:
          "Hold an instrument rating on your pilot certificate appropriate to the instructor rating sought.",
        ref: "61.183(c)",
      },
      {
        label: "Endorsements",
        detail:
          "Ground and flight training endorsements for the instrument instructor knowledge and practical tests.",
        ref: "61.185, 61.187",
      },
    ],
    experience: [
      {
        label: "Training",
        detail:
          "Instrument instructor ground training and flight proficiency training in the instrument areas of operation, taught from the instructor's seat.",
        ref: "61.187",
      },
    ],
    testing: [
      {
        label: "Knowledge test (FII)",
        detail:
          "Flight Instructor Instrument – Airplane knowledge test (FOI also required if you do not already hold a flight instructor certificate or exemption).",
        ref: "61.183",
      },
      {
        label: "Practical test",
        detail: "Flight Instructor Instrument – Airplane practical test.",
      },
    ],
    privileges: [
      "Give instrument training toward the instrument rating",
      "Conduct instrument proficiency checks (61.57(d))",
    ],
    knowledgeAreas: [
      "Teaching attitude instrument flying",
      "Partial-panel and unusual-attitude instruction",
      "Instrument procedures and charting",
      "Instrument proficiency checks",
      "Use of simulators and ATDs in training",
    ],
    groundModules: [...ALL_IFR],
    examIds: ["fii", "ira", "navigation", "weather"],
    simScenarios: [
      "ifr-vor-intercept",
      "ifr-hold",
      "ifr-ils",
      "ifr-rnav",
      "ifr-missed",
      "emg-vacuum",
      "checkride-instrument",
    ],
    oralTopics: [
      "Teaching the instrument scan",
      "Common instrument student errors (fixation, omission, emphasis)",
      "IPC content and standards",
      "Logging simulated instrument time and safety pilots",
    ],
    scenarioEvaluations: [
      "Your instrument student keeps chasing the CDI on the localizer. How do you teach the correction?",
    ],
    atcScenarios: [
      "ifr-clearance-request",
      "ifr-departure-clearance",
      "instrument-approach",
      "established-final",
    ],
    references: [
      "14 CFR 61.183–61.195",
      "Instrument Flying Handbook (FAA-H-8083-15)",
      "Aviation Instructor's Handbook (FAA-H-8083-9)",
    ],
  },
  {
    id: "night",
    title: "Night Flying",
    short: "Night",
    kind: "pathway",
    summary:
      "Training pathway for safe night operations: vision, illusions, lighting, equipment, currency and planning. Night flight is part of the private pilot certificate, not a separate rating.",
    prerequisites: ["student"],
    eligibility: [
      {
        label: "Certificate privileges",
        detail:
          "Private pilots earn night privileges through the 61.109 night training. Only the narrow exceptions of 61.110 allow a certificate to be issued without it, carrying a 'night flying prohibited' limitation.",
        ref: "61.109, 61.110",
      },
    ],
    experience: [
      {
        label: "Passenger currency",
        detail:
          "To carry passengers at night: three takeoffs and three landings to a full stop within the preceding 90 days, during the period from 1 hour after sunset to 1 hour before sunrise.",
        ref: "61.57(b)",
      },
      {
        label: "Logging night",
        detail:
          "Night is the time between the end of evening civil twilight and the beginning of morning civil twilight.",
        ref: "14 CFR 1.1",
      },
    ],
    testing: [
      { label: "No separate test", detail: "Night tasks are part of the Private Pilot ACS." },
    ],
    privileges: [
      "Position lights required from sunset to sunrise (91.209)",
      "VFR fuel reserve of 45 minutes at night (91.151)",
      "Additional night equipment required by 91.205(c)",
    ],
    knowledgeAreas: [
      "Night vision: rods and cones, dark adaptation, off-center viewing",
      "Night illusions: black-hole approach, autokinesis, false horizon",
      "Aircraft and airport lighting",
      "Night equipment and lighting regulations",
      "Night weather and terrain avoidance",
      "Night emergencies",
    ],
    groundModules: vfr("night", "airport-ops", "weather", "emergencies", "adm"),
    examIds: ["human-factors", "regs"],
    simScenarios: ["vfr-pattern", "vfr-landing", "vfr-xc", "emg-electrical"],
    oralTopics: [
      "Night currency vs night experience",
      "91.205(c) night equipment",
      "Pilot-controlled lighting",
      "Black-hole approach illusion",
      "Interpreting other aircraft's position lights",
    ],
    scenarioEvaluations: [
      "On a dark night you see a red light on your left and a white light, both steady and not changing position. What does this tell you?",
      "Your alternator fails at night 20 NM from home. What do you do?",
    ],
    atcScenarios: ["takeoff", "landing", "traffic-advisory", "emergency"],
    references: [
      "14 CFR 61.57(b), 91.151, 91.205(c), 91.209",
      "PHAK — Aeromedical Factors",
      "Airplane Flying Handbook — Night Operations",
    ],
  },
  {
    id: "cross-country",
    title: "Cross-Country Flying",
    short: "XC",
    kind: "pathway",
    summary:
      "Plan and fly navigation flights confidently: preflight action, charts, pilotage, dead reckoning, electronic navigation, fuel planning, flight following and diversions.",
    prerequisites: ["student"],
    eligibility: [
      {
        label: "Definition",
        detail:
          "For private pilot aeronautical experience, cross-country time must include a landing more than 50 NM straight-line from the original departure point.",
        ref: "61.1",
      },
    ],
    experience: [
      {
        label: "Preflight action",
        detail:
          "Become familiar with all available information: weather, fuel requirements, alternatives, known traffic delays, runway lengths and performance data.",
        ref: "91.103",
      },
      {
        label: "Cruising altitudes",
        detail:
          "VFR above 3,000 ft AGL: odd thousands + 500 ft for magnetic courses 0–179°, even thousands + 500 ft for 180–359°.",
        ref: "91.159",
      },
    ],
    testing: [
      {
        label: "Part of private ACS",
        detail:
          "Pilotage and dead reckoning, navigation systems and diversion are Private Pilot ACS tasks.",
      },
    ],
    privileges: ["Applies to all certificates"],
    knowledgeAreas: [
      "Sectional charts and symbology",
      "Pilotage and dead reckoning",
      "E6B and wind triangle",
      "VOR and GPS navigation",
      "Fuel planning and reserves",
      "VFR flight plans and flight following",
      "Diversion and lost procedures",
    ],
    groundModules: vfr(
      "charts",
      "pilotage",
      "dead-reckoning",
      "weather",
      "airspace",
      "cross-country",
      "radio",
    ),
    examIds: ["navigation", "weather", "performance"],
    simScenarios: ["vfr-xc", "vfr-pattern", "emg-weather"],
    oralTopics: [
      "91.103 preflight action",
      "Selecting checkpoints",
      "Lost procedures (climb, communicate, confess, comply, conserve)",
      "Diversion technique",
      "VFR flight plan opening and closing",
    ],
    scenarioEvaluations: [
      "Halfway to your destination the ceiling is lowering ahead. Plan a diversion now.",
      "You cannot identify your next checkpoint. What do you do?",
    ],
    atcScenarios: [
      "departure",
      "flight-following",
      "freq-change",
      "traffic-advisory",
      "class-d-entry",
    ],
    references: [
      "14 CFR 91.103, 91.151, 91.159",
      "PHAK — Navigation",
      "FAA Aeronautical Chart User's Guide",
    ],
  },
  {
    id: "emergency",
    title: "Emergency Procedures",
    short: "EMG",
    kind: "pathway",
    summary:
      "Recognize, prioritize and manage abnormal and emergency situations: engine failure, fire, electrical and vacuum failures, lost communications and inadvertent IMC.",
    prerequisites: ["student"],
    eligibility: [
      {
        label: "PIC authority",
        detail:
          "In an in-flight emergency requiring immediate action, the PIC may deviate from any rule to the extent required to meet that emergency.",
        ref: "91.3(b)",
      },
    ],
    experience: [
      {
        label: "Squawk & frequency",
        detail:
          "Squawk 7700 for emergency, 7600 for lost communications; 121.5 MHz is the emergency frequency.",
        ref: "AIM 6-2, 6-3",
      },
      {
        label: "Reporting",
        detail: "Certain accidents and incidents must be reported to the NTSB immediately.",
        ref: "49 CFR 830",
      },
    ],
    testing: [
      { label: "All practical tests", detail: "Emergency operations are evaluated on every ACS." },
    ],
    privileges: ["Applies to all certificates"],
    knowledgeAreas: [
      "Engine failure: airspeed, best field, checklist, declare, execute",
      "Fire in flight and on the ground",
      "Electrical and vacuum system failures",
      "Lost communications (VFR and IFR 91.185)",
      "Inadvertent IMC: 180° turn",
      "Emergency landing site selection",
      "ELT and survival equipment",
    ],
    groundModules: [...vfr("emergencies", "systems", "adm"), ...ifr("emergencies")],
    examIds: ["systems", "human-factors", "regs"],
    simScenarios: [
      "emg-engine-failure",
      "emg-electrical",
      "emg-vacuum",
      "emg-radio",
      "emg-weather",
    ],
    oralTopics: [
      "Best glide speed and why it matters",
      "Partial panel indications",
      "Declaring an emergency and what happens next",
      "When to land as soon as possible vs practicable",
      "Carburetor ice recognition",
    ],
    scenarioEvaluations: [
      "Engine failure at 600 ft AGL after takeoff. Turn back or land ahead?",
      "Smoke in the cabin with an electrical smell. What are your first actions?",
    ],
    atcScenarios: ["emergency", "go-around", "traffic-advisory"],
    references: [
      "14 CFR 91.3, 91.185",
      "AIM chapter 6",
      "Airplane Flying Handbook — Emergency Procedures",
    ],
  },
  {
    id: "mountain",
    title: "Mountain Flying",
    short: "MTN",
    kind: "pathway",
    summary:
      "Operate safely in mountainous terrain: density altitude, mountain winds, ridge and canyon technique, and conservative go/no-go decisions.",
    prerequisites: ["private"],
    eligibility: [
      {
        label: "No FAA rating",
        detail:
          "Mountain flying has no FAA certificate or endorsement; training from an experienced mountain instructor is strongly recommended.",
      },
    ],
    experience: [
      {
        label: "IFR minimum altitude",
        detail:
          "In designated mountainous areas, IFR minimum altitude is 2,000 ft above the highest obstacle within 4 NM of the course.",
        ref: "91.177",
      },
      {
        label: "Oxygen",
        detail:
          "Required crew oxygen above 12,500 ft MSL after 30 minutes and at all times above 14,000 ft MSL.",
        ref: "91.211",
      },
    ],
    testing: [{ label: "No test", detail: "Proficiency is demonstrated to your instructor." }],
    privileges: ["Applies to all certificates"],
    knowledgeAreas: [
      "Density altitude and performance planning",
      "Mountain wave, rotors and downdrafts",
      "Ridge crossing at a 45° angle with adequate clearance",
      "Canyon flying: fly one side, never enter a canyon you cannot turn around in",
      "Mountain weather and visibility",
      "Survival equipment and flight plans",
    ],
    groundModules: vfr("aerodynamics", "weather", "takeoffs-landings", "cross-country", "adm"),
    examIds: ["performance", "weather", "human-factors"],
    simScenarios: ["vfr-takeoff-climb", "vfr-xc", "emg-weather", "emg-engine-failure"],
    oralTopics: [
      "Computing takeoff distance at high density altitude",
      "Recognizing mountain wave (lenticular clouds)",
      "Approaching a ridge in strong winds",
      "Escape routes in canyons",
    ],
    scenarioEvaluations: [
      "The density altitude is 9,000 ft and the POH says your climb rate will be 300 fpm. The departure path has rising terrain. Go or no-go?",
    ],
    atcScenarios: ["flight-following", "traffic-advisory", "emergency"],
    references: [
      "14 CFR 91.177, 91.211",
      "PHAK — Aircraft Performance",
      "AIM chapter 7 (mountain flying)",
    ],
  },
  {
    id: "adm",
    title: "Aeronautical Decision-Making",
    short: "ADM",
    kind: "pathway",
    summary:
      "The most important safety skill: perceive hazards, assess risk and act. Covers PAVE, IMSAFE, 3P, DECIDE, hazardous attitudes, single-pilot resource management and personal minimums.",
    prerequisites: [],
    eligibility: [
      {
        label: "Everyone",
        detail: "Risk management is evaluated on every ACS and is part of every flight.",
      },
    ],
    experience: [
      {
        label: "Personal minimums",
        detail:
          "Develop written personal minimums for weather, wind, currency and fatigue — and stick to them.",
      },
      {
        label: "Fitness",
        detail:
          "No person may act as a crewmember within 8 hours after drinking alcohol, while under the influence, or with a blood alcohol concentration of 0.04 or more.",
        ref: "91.17",
      },
    ],
    testing: [
      { label: "All ACS", detail: "Risk management elements appear in every area of operation." },
    ],
    privileges: ["Applies to all certificates"],
    knowledgeAreas: [
      "PAVE: Pilot, Aircraft, enVironment, External pressures",
      "IMSAFE personal checklist",
      "3P model: Perceive, Process, Perform",
      "DECIDE model",
      "Five hazardous attitudes and their antidotes",
      "Single-pilot resource management and automation management",
      "Fatigue, stress and spatial disorientation",
    ],
    groundModules: vfr("adm", "weather", "emergencies"),
    examIds: ["human-factors"],
    simScenarios: ["emg-weather", "emg-engine-failure", "vfr-xc"],
    oralTopics: [
      "The five hazardous attitudes and antidotes",
      "Get-there-itis and external pressures",
      "Using a flight risk assessment tool",
      "IMSAFE before every flight",
    ],
    scenarioEvaluations: [
      "You promised to bring your family home for a wedding; weather is at your personal minimums. How do you decide?",
      "A passenger pressures you to 'just go, everyone else is flying today'. Which hazardous attitude is at play?",
    ],
    atcScenarios: ["flight-following", "emergency"],
    references: [
      "Risk Management Handbook (FAA-H-8083-2)",
      "PHAK — Aeronautical Decision-Making",
      "14 CFR 91.17",
    ],
  },
];

/** Main certificate ladder shown on the training hub. */
export const CERTIFICATE_PATH: TrackId[] = [
  "student",
  "private",
  "instrument",
  "commercial",
  "atp",
];

export function getTrack(id: string): Track | undefined {
  return TRACKS.find((t) => t.id === id);
}

/* ------------------------------------------------------------------------------------------ */
/* Progress                                                                                    */
/* ------------------------------------------------------------------------------------------ */

export interface ProgressPart {
  done: number;
  total: number;
  /** 0–100 */
  pct: number;
}

export interface TrackProgress {
  /** Overall weighted progress, 0–100. */
  pct: number;
  parts: {
    lessons: ProgressPart;
    quizzes: ProgressPart;
    exams: ProgressPart & { items: { examId: string; best: number | null; passed: boolean }[] };
    sims: ProgressPart & { items: { scenarioId: string; best: number | null }[] };
    atc: ProgressPart & { items: { scenarioId: string; best: number | null }[] };
  };
}

const PASS = 70;
const pctOf = (done: number, total: number) => (total ? Math.round((done / total) * 100) : 0);

/** Compute real progress for a track from the training record. */
export function trackProgress(state: TrainingState, track: Track): TrackProgress {
  // Ground lessons & module exams
  let lessonsDone = 0;
  let lessonsTotal = 0;
  let quizPassed = 0;
  let quizTotal = 0;
  for (const ref of track.groundModules) {
    const mod = getModule(ref.course, ref.moduleId);
    if (!mod) continue;
    lessonsTotal += mod.lessons.length;
    lessonsDone += mod.lessons.filter((l) => !!state.lessons[l.id]).length;
    if (mod.quiz.length) {
      quizTotal += 1;
      const passed = state.quizzes.some(
        (q) =>
          q.final &&
          q.course === ref.course &&
          q.moduleId === ref.moduleId &&
          q.total > 0 &&
          (q.score / q.total) * 100 >= PASS,
      );
      if (passed) quizPassed += 1;
    }
  }

  // Exams — credit = best score (passing counts as complete)
  const examItems = track.examIds.map((examId) => {
    const scores = state.exams.filter((e) => e.examId === examId).map((e) => e.scorePct);
    const best = scores.length ? Math.max(...scores) : null;
    return { examId, best, passed: best !== null && best >= PASS };
  });
  const examCredit = examItems.reduce(
    (s, e) => s + (e.passed ? 1 : e.best !== null ? (e.best / 100) * 0.7 : 0),
    0,
  );

  // Simulator scenarios
  const simItems = track.simScenarios.map((scenarioId) => {
    const scores = state.flights.filter((f) => f.scenarioId === scenarioId).map((f) => f.score);
    return { scenarioId, best: scores.length ? Math.max(...scores) : null };
  });
  const simCredit = simItems.reduce(
    (s, x) => s + (x.best === null ? 0 : x.best >= PASS ? 1 : 0.5),
    0,
  );

  // ATC scenarios
  const atcItems = track.atcScenarios.map((scenarioId) => {
    const scores = state.atcSessions.filter((a) => a.scenarioId === scenarioId).map((a) => a.score);
    return { scenarioId, best: scores.length ? Math.max(...scores) : null };
  });
  const atcCredit = atcItems.reduce(
    (s, x) => s + (x.best === null ? 0 : x.best >= PASS ? 1 : 0.5),
    0,
  );

  const parts: TrackProgress["parts"] = {
    lessons: { done: lessonsDone, total: lessonsTotal, pct: pctOf(lessonsDone, lessonsTotal) },
    quizzes: { done: quizPassed, total: quizTotal, pct: pctOf(quizPassed, quizTotal) },
    exams: {
      done: examItems.filter((e) => e.passed).length,
      total: examItems.length,
      pct: Math.round(pctOf(examCredit, examItems.length)),
      items: examItems,
    },
    sims: {
      done: simItems.filter((x) => x.best !== null && x.best >= PASS).length,
      total: simItems.length,
      pct: Math.round(pctOf(simCredit, simItems.length)),
      items: simItems,
    },
    atc: {
      done: atcItems.filter((x) => x.best !== null && x.best >= PASS).length,
      total: atcItems.length,
      pct: Math.round(pctOf(atcCredit, atcItems.length)),
      items: atcItems,
    },
  };

  const weights: [ProgressPart, number][] = [
    [parts.lessons, 35],
    [parts.quizzes, 15],
    [parts.exams, 20],
    [parts.sims, 20],
    [parts.atc, 10],
  ];
  const active = weights.filter(([p]) => p.total > 0);
  const wSum = active.reduce((s, [, w]) => s + w, 0);
  const pct = wSum ? Math.round(active.reduce((s, [p, w]) => s + p.pct * w, 0) / wSum) : 0;
  return { pct, parts };
}
