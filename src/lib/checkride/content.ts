/**
 * Virtual checkride content: stage structure per track, ACS-style references, and the material
 * used by each stage. Simulated training only — not an FAA practical test.
 */
import type { QuizQuestion } from "@/lib/content/types";
import { QUESTION_BANK } from "@/lib/exams/bank";
import { q, TF } from "@/lib/exams/bank/helpers";
import type { CheckrideTrackDef, CheckrideTrackKey, PlanningScenario, SelectItem, StageDef, StageId, WeatherScenario } from "./types";

// ───────────── Seeded randomness (stable per attempt) ─────────────

export function seedFrom(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function rng(seed: number): () => number {
  let a = seed || 1;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(arr: readonly T[], n: number, rand: () => number): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const t = a[i]!;
    a[i] = a[j]!;
    a[j] = t;
  }
  return a.slice(0, n);
}

// ───────────── Stages & ACS references ─────────────

const STAGE_BASE: { id: StageId; name: string; summary: string }[] = [
  { id: "preflight-prep", name: "Preflight Preparation", summary: "Present the required documents and confirm eligibility for the practical test." },
  { id: "documents", name: "Document Inspection", summary: "Identify the required aircraft documents and inspect the maintenance records for missing or expired items." },
  { id: "aircraft-knowledge", name: "Aircraft Knowledge", summary: "Systems and instruments questions about the airplane you'll fly." },
  { id: "weather", name: "Weather Briefing", summary: "Decode the reports, then make and justify a go/no-go decision." },
  { id: "planning", name: "Flight Planning", summary: "Compute heading, groundspeed, time en route and fuel for the planned leg." },
  { id: "oral", name: "Oral Examination", summary: "Scenario-based questions from the examiner, graded against ACS knowledge elements." },
  { id: "walkaround", name: "Preflight Inspection", summary: "Walk around the airplane and find every discrepancy before flight." },
  { id: "maneuvers", name: "Flight Maneuvers", summary: "Fly the checkride profile in the simulator; your flight is scored automatically." },
  { id: "navigation", name: "Navigation", summary: "Orientation, tracking and diversion questions." },
  { id: "radio", name: "Radio Communications", summary: "Complete the checkride radio scenario in the ATC simulator." },
  { id: "emergency", name: "Emergency Operations", summary: "Emergency decision-making, with an optional engine-failure simulator flight." },
  { id: "postflight", name: "Postflight & Debrief", summary: "Secure the airplane and complete a structured self-debrief." },
];

const ACS: Record<CheckrideTrackKey, Record<StageId, string>> = {
  private: {
    "preflight-prep": "PA.I.A Pilot Qualifications",
    documents: "PA.I.B Airworthiness Requirements",
    "aircraft-knowledge": "PA.I.G Operation of Systems",
    weather: "PA.I.C Weather Information",
    planning: "PA.I.D Cross-Country Flight Planning",
    oral: "PA.I.E National Airspace System; PA.I.H Human Factors",
    walkaround: "PA.II.A Preflight Assessment",
    maneuvers: "PA.V.A Steep Turns; PA.VII.A Slow Flight; PA.IV.B Normal Approach and Landing",
    navigation: "PA.VI.B Navigation Systems and Radar Services; PA.VI.C Diversion",
    radio: "PA.III.A Communications, Light Signals, and Runway Lighting Systems",
    emergency: "PA.IX.A Emergency Descent; PA.IX.B Emergency Approach and Landing (Simulated)",
    postflight: "PA.XII.A After Landing, Parking and Securing",
  },
  instrument: {
    "preflight-prep": "IR.I.A Pilot Qualifications",
    documents: "IR.II.B Aircraft Flight Instruments and Navigation Equipment",
    "aircraft-knowledge": "IR.II.A Aircraft Systems Related to IFR Operations",
    weather: "IR.I.B Weather Information",
    planning: "IR.I.C Cross-Country Flight Planning",
    oral: "IR.I / IR.II Knowledge and Risk Management Elements",
    walkaround: "IR.II.C Instrument Flight Deck Check",
    maneuvers: "IR.VI.B Precision Approach; IR.VI.C Missed Approach",
    navigation: "IR.V.A Intercepting and Tracking Navigational Systems and DME Arcs; IR.III.B Holding Procedures",
    radio: "IR.III.A Compliance with Air Traffic Control Clearances",
    emergency: "IR.VII.A Loss of Communications; IR.VII.C Approach with Loss of Primary Flight Instrument Indicators",
    postflight: "IR.VIII.A Checking Instruments and Equipment",
  },
  commercial: {
    "preflight-prep": "CA.I.A Pilot Qualifications",
    documents: "CA.I.B Airworthiness Requirements",
    "aircraft-knowledge": "CA.I.G Operation of Systems",
    weather: "CA.I.C Weather Information",
    planning: "CA.I.D Cross-Country Flight Planning",
    oral: "CA.I.E National Airspace System; CA.I.H Human Factors",
    walkaround: "CA.II.A Preflight Assessment",
    maneuvers: "CA.V.A Steep Turns; CA.VIII.A Maneuvering During Slow Flight; CA.IV.B Normal Approach and Landing",
    navigation: "CA.VII.B Navigation Systems and Radar Services; CA.VII.C Diversion",
    radio: "CA.III.A Communications, Light Signals, and Runway Lighting Systems",
    emergency: "CA.IX.A Emergency Descent; CA.IX.B Emergency Approach and Landing (Simulated)",
    postflight: "CA.XII.A After Landing, Parking and Securing",
  },
};

function stagesFor(key: CheckrideTrackKey): StageDef[] {
  return STAGE_BASE.map((s, i) => ({ ...s, number: i + 1, acsRef: ACS[key][s.id] }));
}

export const CHECKRIDE_TRACKS: CheckrideTrackDef[] = [
  {
    key: "private",
    trackId: "private",
    title: "Private Pilot Checkride",
    certificate: "Private Pilot — Airplane Single-Engine Land",
    description: "The full private pilot practical test flow: documents and eligibility, a scenario-based oral, a preflight inspection, and the flight portion in the simulator — graded against the Private Pilot ACS areas.",
    simScenario: "checkride-private",
    atcScenario: "class-d-entry",
    ifr: false,
    stages: stagesFor("private"),
  },
  {
    key: "instrument",
    trackId: "instrument",
    title: "Instrument Rating Checkride",
    certificate: "Instrument Rating — Airplane",
    description: "IFR eligibility and equipment inspections, IFR weather and planning, an instrument oral, and a precision approach with missed approach in the simulator — graded against the Instrument Rating ACS.",
    simScenario: "checkride-instrument",
    atcScenario: "ifr-departure-clearance",
    ifr: true,
    stages: stagesFor("instrument"),
  },
  {
    key: "commercial",
    trackId: "commercial",
    title: "Commercial Pilot Checkride",
    certificate: "Commercial Pilot — Airplane Single-Engine Land",
    description: "Commercial-level knowledge of privileges, systems and performance, plus the flight portion in the simulator — graded against the Commercial Pilot ACS areas.",
    simScenario: "checkride-private",
    atcScenario: "class-d-entry",
    ifr: false,
    stages: stagesFor("commercial"),
  },
];

export function trackDef(key: string): CheckrideTrackDef | undefined {
  return CHECKRIDE_TRACKS.find((t) => t.key === key || t.trackId === key);
}

export const PASS_SCORE = 70;

// ───────────── Scoring helpers ─────────────

/** Select-all-that-apply score: (correct picks − wrong picks) ÷ total correct, floored at 0. */
export function selectScore(items: SelectItem[], selected: ReadonlySet<string>): number {
  const totalCorrect = items.filter((i) => i.correct).length || 1;
  let good = 0;
  let bad = 0;
  for (const i of items) {
    if (selected.has(i.id)) {
      if (i.correct) good++;
      else bad++;
    }
  }
  return Math.max(0, Math.round(((good - bad) / totalCorrect) * 100));
}

// ───────────── Stage 1: Preflight preparation ─────────────

export function applicantItems(key: CheckrideTrackKey): SelectItem[] {
  const base: SelectItem[] = [
    { id: "cert", label: key === "private" ? "Student pilot certificate" : "Pilot certificate (private or higher)", correct: true, why: "The applicant must hold the prerequisite certificate (61.103/61.123/61.65)." },
    { id: "medical", label: "Medical certificate (or BasicMed, where allowed)", correct: true, why: "Required to act as PIC during the flight portion (61.23). Commercial applicants typically hold a second-class medical to use the certificate's privileges." },
    { id: "id", label: "Government-issued photo identification", correct: true, why: "The examiner must verify identity (61.3(a)(2))." },
    { id: "logbook", label: "Logbook with required endorsements and aeronautical experience", correct: true, why: "Shows the experience requirements and the instructor's 61.39 recommendation." },
    { id: "ktr", label: "Airman Knowledge Test Report (passing, within 24 calendar months)", correct: true, why: "61.39(a)(1) requires a passed knowledge test within the preceding 24 calendar months." },
    { id: "iacra", label: "Completed application (FAA Form 8710-1 in IACRA)", correct: true, why: "The application is completed in IACRA and signed by the recommending instructor." },
    { id: "aircraft-docs", label: "Aircraft documents and maintenance records for the checkride airplane", correct: true, why: "The examiner verifies the airplane is airworthy and appropriately equipped (61.45)." },
    { id: "insurance", label: "Proof of aircraft insurance", correct: false, why: "Insurance is often required by the owner or examiner, but it is not an FAA requirement for the practical test." },
    { id: "diploma", label: "A flight school graduation certificate", correct: false, why: "Only Part 141 graduates use a graduation certificate in lieu of some requirements; it is not required for a Part 61 applicant." },
    { id: "bill-of-sale", label: "The aircraft bill of sale", correct: false, why: "Ownership documents are not part of the practical test." },
  ];
  return base;
}

export function eligibilityQuestions(key: CheckrideTrackKey): QuizQuestion[] {
  if (key === "instrument")
    return [
      q("cr-el-i1", "Regulations", "mc", "How much cross-country flight time as PIC must an instrument rating applicant have logged?", ["20 hours", "40 hours", "50 hours", "100 hours"], 2, "61.65(d)(1): at least 50 hours of cross-country time as PIC, of which at least 10 hours must be in airplanes for an airplane instrument rating.", { ref: "14 CFR 61.65(d)" }),
      q("cr-el-i2", "Regulations", "mc", "How much actual or simulated instrument time is required?", ["15 hours", "30 hours", "40 hours, including 15 hours from an authorized instructor", "50 hours"], 2, "61.65(d)(2): 40 hours of actual or simulated instrument time, including 15 hours of instrument training from an authorized instructor in the aircraft category.", { ref: "14 CFR 61.65(d)" }),
      q("cr-el-i3", "Regulations", "mc", "The instrument knowledge test must have been passed within the preceding", ["6 calendar months", "12 calendar months", "24 calendar months", "36 calendar months"], 2, "61.39(a)(1): within the 24-calendar-month period preceding the month the applicant completes the practical test.", { ref: "14 CFR 61.39" }),
    ];
  if (key === "commercial")
    return [
      q("cr-el-c1", "Regulations", "mc", "What is the minimum age for a commercial pilot certificate?", ["16", "17", "18", "21"], 2, "61.123(a): at least 18 years of age.", { ref: "14 CFR 61.123" }),
      q("cr-el-c2", "Regulations", "mc", "Under Part 61, how much total flight time must a commercial pilot (airplane) applicant have?", ["190 hours", "200 hours", "250 hours", "300 hours"], 2, "61.129(a): at least 250 hours of flight time. 190 hours applies to some Part 141 programs.", { ref: "14 CFR 61.129" }),
      q("cr-el-c3", "Regulations", "mc", "How much instrument training must the commercial applicant (airplane) have received?", ["3 hours", "5 hours", "10 hours", "15 hours"], 2, "61.129(a)(3)(i): 10 hours of instrument training using a view-limiting device, including attitude instrument flying, partial panel, recovery from unusual attitudes and intercepting and tracking navigation systems.", { ref: "14 CFR 61.129(a)(3)" }),
    ];
  return [
    q("cr-el-p1", "Regulations", "mc", "What is the minimum age to be issued a private pilot certificate (airplane)?", ["16", "17", "18", "21"], 1, "61.103(a): 17 years of age (16 for glider or balloon ratings).", { ref: "14 CFR 61.103" }),
    q("cr-el-p2", "Regulations", "mc", "The private pilot knowledge test must have been passed within the preceding", ["6 calendar months", "12 calendar months", "24 calendar months", "36 calendar months"], 2, "61.39(a)(1): within the 24 calendar months preceding the month of the practical test.", { ref: "14 CFR 61.39" }),
    q("cr-el-p3", "Regulations", "mc", "What is the minimum total flight time for a private pilot certificate (airplane) under Part 61?", ["35 hours", "40 hours", "50 hours", "60 hours"], 1, "61.109(a): at least 40 hours, including 20 hours of flight training and 10 hours of solo flight. Part 141 programs may allow 35.", { ref: "14 CFR 61.109" }),
  ];
}

// ───────────── Stage 2: Document inspection ─────────────

export const AIRCRAFT_DOCS: SelectItem[] = [
  { id: "aw", label: "Airworthiness certificate (displayed)", correct: true, why: "91.203(a)(1),(b) — must be on board and displayed at the cabin or cockpit entrance." },
  { id: "reg", label: "Certificate of aircraft registration", correct: true, why: "91.203(a)(2)." },
  { id: "oplim", label: "Operating limitations — approved AFM/POH, placards and markings", correct: true, why: "91.9." },
  { id: "wb", label: "Current weight and balance data for this airplane", correct: true, why: "Part of the approved flight manual/operating limitations for the specific airplane." },
  { id: "radio", label: "Radio station license", correct: false, why: "Only required for international flights." },
  { id: "mx", label: "Airframe and engine maintenance logbooks", correct: false, why: "They must be available for inspection, but are not required to be carried on board." },
  { id: "ins", label: "Insurance policy", correct: false, why: "Not an FAA requirement to be on board." },
  { id: "pilot-log", label: "The pilot's personal logbook", correct: false, why: "Not required on board (except a student pilot's solo cross-country endorsements)." },
];

export type MxStatus = "current" | "expired" | "not-required";

export interface MxRecord {
  id: string;
  item: string;
  rule: string;
  entry: string;
  accept: MxStatus[];
  why: string;
}

function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, Math.min(d.getDate(), 28));
}
function endOfCalendarMonth(d: Date, months: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + months + 1, 0);
}
function fmt(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
function daysAgo(today: Date, n: number): Date {
  return new Date(today.getFullYear(), today.getMonth(), today.getDate() - n);
}

/**
 * Maintenance-record scenario for the checkride airplane, generated from the attempt start date and
 * a per-attempt seed so it is identical when the applicant resumes.
 */
export function maintenanceScenario(attemptId: string, startIso: string, ifr: boolean): { intro: string; records: MxRecord[] } {
  const rand = rng(seedFrom(`${attemptId}:mx`));
  const today = new Date(startIso);
  const flags = {
    annual: rand() < 0.35,
    hundred: rand() < 0.45,
    eltInsp: rand() < 0.3,
    eltBatt: rand() < 0.3,
    xpdr: rand() < 0.35,
    ad: rand() < 0.3,
    pitot: rand() < 0.45,
    vor: rand() < 0.5,
  };
  const discrepancyKeys = (Object.keys(flags) as (keyof typeof flags)[]).filter((k) => (ifr ? true : k !== "pitot" && k !== "vor"));
  const count = discrepancyKeys.filter((k) => flags[k]).length;
  if (count < 2) {
    for (const k of pick(discrepancyKeys.filter((k) => !flags[k]), 2 - count, rand)) flags[k] = true;
  }

  const tachNow = 4915.1;
  const records: MxRecord[] = [];

  const annualDate = flags.annual ? addMonths(today, -13) : addMonths(today, -10);
  const annualValid = endOfCalendarMonth(annualDate, 12);
  records.push({
    id: "annual",
    item: "Annual inspection",
    rule: "14 CFR 91.409(a) — within the preceding 12 calendar months",
    entry: `Annual inspection completed ${fmt(annualDate)} at tach 4,712.0 — signed by IA.`,
    accept: [today > annualValid ? "expired" : "current"],
    why: `Valid through the end of the 12th calendar month: ${fmt(annualValid)}. ${today > annualValid ? "It has expired — the airplane is not airworthy." : "It is current."}`,
  });

  const last100 = 4812.6;
  const tach100 = flags.hundred ? tachNow : 4889.4;
  const since = tach100 - last100;
  records.push({
    id: "hundred",
    item: "100-hour inspection",
    rule: "14 CFR 91.409(b) — required because the airplane is used for flight instruction for hire and rental",
    entry: `100-hour inspection at tach ${last100.toFixed(1)}. Current tach: ${tach100.toFixed(1)}.`,
    accept: [since > 100 ? "expired" : "current"],
    why: `${since.toFixed(1)} hours since the last 100-hour. ${since > 100 ? "It is overdue. The 10-hour allowance only applies to reach a place where the inspection can be done — not to fly a checkride." : "It is current."}`,
  });

  const eltDate = flags.eltInsp ? addMonths(today, -13) : addMonths(today, -6);
  const eltValid = endOfCalendarMonth(eltDate, 12);
  records.push({
    id: "elt",
    item: "ELT inspection",
    rule: "14 CFR 91.207(d) — inspected within the preceding 12 calendar months",
    entry: `ELT inspection per 91.207(d) completed ${fmt(eltDate)}.`,
    accept: [today > eltValid ? "expired" : "current"],
    why: `Valid through ${fmt(eltValid)}. ${today > eltValid ? "Expired." : "Current."}`,
  });

  const battDue = flags.eltBatt ? addMonths(today, -2) : addMonths(today, 14);
  records.push({
    id: "elt-batt",
    item: "ELT battery",
    rule: "14 CFR 91.207(c) — replace after 1 cumulative hour of use or 50% of useful life",
    entry: `ELT battery replacement date (marked on battery and in records): ${fmt(battDue)}.`,
    accept: [today > battDue ? "expired" : "current"],
    why: today > battDue ? "The battery replacement date has passed — the ELT is not legal until it is replaced." : "The battery is within its replacement date.",
  });

  const xpdrDate = flags.xpdr ? addMonths(today, -25) : addMonths(today, -20);
  const xpdrValid = endOfCalendarMonth(xpdrDate, 24);
  records.push({
    id: "xpdr",
    item: "Transponder test",
    rule: "14 CFR 91.413 — tested within the preceding 24 calendar months",
    entry: `Transponder and encoder test per 91.413 completed ${fmt(xpdrDate)}.`,
    accept: [today > xpdrValid ? "expired" : "current"],
    why: `Valid through ${fmt(xpdrValid)}. ${today > xpdrValid ? "Expired — the transponder may not be used." : "Current."}`,
  });

  const adLast = flags.ad ? 4790.0 : 4850.0;
  const adDue = adLast + 100;
  records.push({
    id: "ad",
    item: "Recurring AD (seat rail inspection, every 100 hours)",
    rule: "14 CFR 91.403 / 39.7 — compliance with applicable ADs",
    entry: `Recurring AD seat-rail inspection last complied with at tach ${adLast.toFixed(1)}; next due at tach ${adDue.toFixed(1)}. Current tach: ${tach100.toFixed(1)}.`,
    accept: [tach100 > adDue ? "expired" : "current"],
    why: tach100 > adDue ? "The recurring AD is overdue — the airplane is unairworthy until it is complied with." : "The AD is complied with and not yet due.",
  });

  const pitotDate = ifr ? (flags.pitot ? addMonths(today, -26) : addMonths(today, -22)) : addMonths(today, -27);
  const pitotValid = endOfCalendarMonth(pitotDate, 24);
  records.push({
    id: "pitot",
    item: "Altimeter, static system & encoder check",
    rule: "14 CFR 91.411 — within 24 calendar months for IFR in controlled airspace",
    entry: `Altimeter/static system test per 91.411 completed ${fmt(pitotDate)}.`,
    accept: ifr ? [today > pitotValid ? "expired" : "current"] : today > pitotValid ? ["not-required"] : ["current", "not-required"],
    why: ifr
      ? `Valid through ${fmt(pitotValid)}. ${today > pitotValid ? "Expired — the airplane can't be flown IFR in controlled airspace." : "Current for IFR."}`
      : `Valid through ${fmt(pitotValid)}. 91.411 applies only to IFR in controlled airspace, so it is not required for this VFR checkride.`,
  });

  const vorDate = ifr ? (flags.vor ? daysAgo(today, 41) : daysAgo(today, 12)) : daysAgo(today, 52);
  records.push({
    id: "vor",
    item: "VOR operational check",
    rule: "14 CFR 91.171 — within the preceding 30 days for IFR use",
    entry: `VOR check (VOT, error +2°) logged ${fmt(vorDate)} with signature.`,
    accept: ifr ? [flags.vor ? "expired" : "current"] : ["not-required"],
    why: ifr
      ? flags.vor
        ? "More than 30 days old — the VOR may not be used for IFR navigation until checked."
        : "Within 30 days and within the ±4° VOT tolerance."
      : "The 30-day VOR check is only required to use the VOR under IFR, so it is not required for this VFR flight.",
  });

  return {
    intro: `The examiner hands you the maintenance records for the checkride airplane (a flight-school rental used for instruction). Today is ${fmt(today)}. Classify each item.`,
    records,
  };
}

// ───────────── Stage 3: Aircraft knowledge ─────────────

export function aircraftQuestions(key: CheckrideTrackKey, attemptId: string): QuizQuestion[] {
  const rand = rng(seedFrom(`${attemptId}:sys`));
  const pool =
    key === "instrument"
      ? QUESTION_BANK.filter((x) => (x.id.startsWith("ira-") && (x.subject === "Flight Instruments" || x.subject === "Navigation" || x.id === "ira-016")) || (x.id.startsWith("par-") && x.subject === "Flight Instruments"))
      : key === "commercial"
        ? QUESTION_BANK.filter((x) => (x.id.startsWith("cax-") && (x.subject === "Aircraft Systems" || x.subject === "Aerodynamics")) || (x.id.startsWith("par-") && x.subject === "Aircraft Systems"))
        : QUESTION_BANK.filter((x) => x.id.startsWith("par-") && (x.subject === "Aircraft Systems" || x.subject === "Flight Instruments"));
  return pick(pool, 6, rand);
}

// ───────────── Stage 4: Weather ─────────────

export function weatherScenario(key: CheckrideTrackKey): WeatherScenario {
  if (key === "instrument") {
    return {
      intro: "IFR flight from Hartford (KBDL) to Albany (KALB) in an IFR-equipped C172, cruising at 6,000 ft. ETA at KALB 1930Z. Planned alternate: Stewart (KSWF), which has an ILS and standard alternate minimums. You are instrument current.",
      reports: [
        { label: "Departure", text: "METAR KBDL 141751Z 04012KT 2SM -RA BR OVC006 08/07 A2988" },
        { label: "Destination", text: "TAF KALB 141730Z 1418/1518 05010KT 3SM -RA BR OVC008\n  FM150000 06008KT 1SM BR OVC003" },
        { label: "Alternate", text: "TAF KSWF 141730Z 1418/1518 03012KT 4SM -RA BR OVC009" },
        { label: "Freezing level / aloft", text: "Freezing level along route 8,000–9,000 ft MSL. FB at 6,000 ft: 0618+02. No icing AIRMETs or SIGMETs below 9,000 ft." },
      ],
      questions: [
        q("cr-wx-i1", "Weather Services", "weather", "What is the ceiling at KBDL?", ["200 ft", "600 ft", "2,000 ft", "6,000 ft"], 1, "OVC006 = overcast at 600 ft AGL — the ceiling. Visibility is 2 SM in light rain and mist.", { ref: "AC 00-45H" }),
        q("cr-wx-i2", "IFR Procedures", "weather", "Is an alternate required for KALB?", ["No — KALB has an ILS", "Yes — the forecast ceiling within 1 hour of the ETA is below 2,000 ft", "No — the visibility is at least 3 SM", "Only at night"], 1, "91.169: the 1-2-3 rule requires at least 2,000 ft and 3 SM from 1 hour before to 1 hour after ETA. OVC008 fails the ceiling test.", { ref: "14 CFR 91.169" }),
        q("cr-wx-i3", "IFR Procedures", "weather", "Does KSWF qualify as an alternate?", ["No — alternates need 2,000 ft and 3 SM", "Yes — OVC009 and 4 SM meet the 600-2 standard precision alternate minimums", "No — 800-2 is required for an ILS", "Only if KALB is below minimums"], 1, "For an airport with a precision approach and standard alternate minimums, the forecast at the ETA must be at least 600 ft and 2 SM.", { ref: "14 CFR 91.169(c)" }),
      ],
      decisions: [
        { id: "go", label: "Go — file IFR with KSWF as the alternate" },
        { id: "go-no-alt", label: "Go — no alternate needed" },
        { id: "no-go", label: "No-go — conditions are below takeoff minimums" },
      ],
      correctDecision: "go",
      decisionWhy: "Destination and alternate forecasts support the flight for a current instrument pilot in an IFR-equipped airplane, the cruise altitude is below the freezing level with no icing advisories, and Part 91 has no takeoff minimums. Plan to arrive before the 0000Z deterioration at KALB and brief the alternate.",
      reasons: [
        { id: "alt-req", label: "An alternate is required because KALB's forecast ceiling is below 2,000 ft", correct: true, why: "1-2-3 rule." },
        { id: "alt-ok", label: "KSWF's forecast meets the 600-2 alternate minimums", correct: true, why: "OVC009, 4 SM." },
        { id: "ice", label: "Planned altitude is below the freezing level, with no icing advisories", correct: true, why: "In cloud at +2 °C, structural icing is not expected." },
        { id: "eta", label: "The ETA (1930Z) is before KALB's forecast drop to 1 SM/OVC003", correct: true, why: "FM150000 begins after arrival — keep a margin." },
        { id: "takeoff-mins", label: "KBDL is below Part 91 takeoff minimums", correct: false, why: "Part 91 operators have no takeoff minimums (91.175(f) applies to Parts 121/125/129/135), though low takeoff conditions add risk." },
        { id: "ils-no-alt", label: "No alternate is needed because KALB has an ILS", correct: false, why: "An ILS doesn't waive the 1-2-3 rule." },
      ],
    };
  }
  return {
    intro: `VFR cross-country from Fort Collins (KFNL) to Cheyenne (KCYS) in a ${key === "commercial" ? "complex single" : "C172"} with one passenger. Planned departure 2030Z, ETA KCYS 2115Z.`,
    reports: [
      { label: "Departure", text: "METAR KFNL 141953Z 18008KT 10SM SCT060 22/08 A3004" },
      { label: "Destination", text: "TAF KCYS 141720Z 1418/1518 21012KT P6SM SCT080\n  FM142100 27025G38KT 3SM TSRA BKN040CB\n  FM150200 31012KT P6SM SKC" },
      { label: "Advisories", text: "Convective SIGMET 23C valid until 2255Z: AREA TS MOV FROM 25025KT, TOPS FL400, covering southeast Wyoming." },
    ],
    questions: [
      q("cr-wx-v1", "Weather Services", "weather", "What is the ceiling at KFNL?", ["600 ft", "6,000 ft", "No ceiling is reported (scattered layer only)", "8,000 ft"], 2, "SCT060 is a scattered layer — not a ceiling. A ceiling requires BKN, OVC or VV.", { ref: "AC 00-45H" }),
        q("cr-wx-v2", "Weather Services", "weather", "What wind is forecast at KCYS from 2100Z?", ["210° at 12 kt", "270° at 25 kt gusting 38 kt", "310° at 12 kt", "250° at 25 kt"], 1, "FM142100 27025G38KT = 270° at 25 kt, gusts 38 kt, with 3 SM in thunderstorms and moderate rain.", { ref: "AC 00-45H" }),
      q("cr-wx-v3", "Weather Services", "weather", "When is KCYS weather forecast to improve?", ["2100Z on the 14th", "0200Z on the 15th", "1800Z on the 15th", "It is not forecast to improve"], 1, "FM150200: 310° at 12 kt, P6SM, sky clear from 0200Z on the 15th.", { ref: "AC 00-45H" }),
    ],
    decisions: [
      { id: "go", label: "Go as planned" },
      { id: "go-divert", label: "Go, and divert if the storms look bad" },
      { id: "no-go", label: "No-go / delay until after the storms pass" },
    ],
    correctDecision: "no-go",
    decisionWhy: "Thunderstorms with gusts to 38 kt are forecast at the destination exactly at the ETA, and a Convective SIGMET covers the area. Departure weather being fine doesn't change that. Delay until the storms clear (after 0200Z, which also means a night flight to plan for) or plan for tomorrow.",
    reasons: [
      { id: "ts", label: "Thunderstorms are forecast at KCYS at the ETA", correct: true, why: "FM142100 TSRA BKN040CB." },
      { id: "gust", label: "Gusts to 38 kt exceed the airplane's demonstrated crosswind and sensible personal minimums", correct: true, why: "A 13-knot gust factor at 38 kt is beyond typical light-airplane capability." },
      { id: "sigmet", label: "A Convective SIGMET covers the destination area", correct: true, why: "Convective SIGMETs imply severe turbulence, icing and low-level wind shear." },
      { id: "dep-ifr", label: "KFNL is below VFR minimums", correct: false, why: "KFNL is 10 SM with a scattered layer — VFR." },
      { id: "icing", label: "Structural icing is forecast along the route", correct: false, why: "Nothing in the briefing indicates icing; the issue is convection." },
    ],
  };
}

// ───────────── Stage 5: Flight planning ─────────────

export function planningScenario(key: CheckrideTrackKey): PlanningScenario {
  if (key === "instrument")
    return { intro: "First leg of the IFR flight plan.", trueCourse: 248, distanceNm: 142, tas: 135, windDir: 290, windKt: 30, variationDeg: -14, gph: 10.5, reserveMin: 45, reserveLabel: "45-minute IFR reserve (no alternate for this leg)" };
  if (key === "commercial")
    return { intro: "Day VFR cross-country leg in the complex single.", trueCourse: 172, distanceNm: 186, tas: 148, windDir: 230, windKt: 24, variationDeg: 3, gph: 13.2, reserveMin: 30, reserveLabel: "30-minute day VFR reserve" };
  return { intro: "Day VFR cross-country leg in the C172.", trueCourse: 65, distanceNm: 98, tas: 112, windDir: 330, windKt: 18, variationDeg: 9, gph: 8.4, reserveMin: 30, reserveLabel: "30-minute day VFR reserve" };
}

export interface PlanSolution {
  wca: number;
  trueHeading: number;
  magHeading: number;
  groundspeed: number;
  eteMin: number;
  fuelGal: number;
}

const norm360 = (d: number) => ((d % 360) + 360) % 360;

export function solvePlan(p: PlanningScenario): PlanSolution {
  const rel = ((p.windDir - p.trueCourse) * Math.PI) / 180;
  const wcaRad = Math.asin((p.windKt * Math.sin(rel)) / p.tas);
  const wca = (wcaRad * 180) / Math.PI;
  const trueHeading = norm360(p.trueCourse + wca);
  const magHeading = norm360(trueHeading - p.variationDeg);
  const groundspeed = p.tas * Math.cos(wcaRad) - p.windKt * Math.cos(rel);
  const eteMin = (p.distanceNm / groundspeed) * 60;
  const fuelGal = ((eteMin + p.reserveMin) / 60) * p.gph;
  return { wca, trueHeading, magHeading, groundspeed, eteMin, fuelGal };
}

export function angleDiff(a: number, b: number): number {
  const d = Math.abs(norm360(a) - norm360(b));
  return Math.min(d, 360 - d);
}

// ───────────── Stage 7: Walk-around ─────────────

export interface WalkZone {
  id: string;
  name: string;
  normal: string;
  discrepancy: string;
  correction: string;
}

export const WALK_ZONES: WalkZone[] = [
  { id: "prop", name: "Propeller & spinner", normal: "Blades are smooth with no nicks or cracks; spinner secure; no oil streaks from the hub.", discrepancy: "A nick about 1/8 inch deep on the leading edge of one blade, near the tip.", correction: "Prop nicks concentrate stress and can lead to blade failure — a mechanic must evaluate and dress it before flight." },
  { id: "cowl", name: "Engine air inlet & cowling", normal: "Air filter clean, inlets clear, cowling fasteners secure.", discrepancy: "Twigs and straw from a bird's nest are visible behind the cowling inlet.", correction: "A nest can block cooling airflow and catch fire — it must be removed and the engine compartment inspected." },
  { id: "oil", name: "Engine oil", normal: "Dipstick reads 7 quarts (POH: minimum 5 for flight, capacity 8); cap and dipstick secure.", discrepancy: "Dipstick reads 4 quarts — below the POH minimum of 5 quarts for flight.", correction: "Add the approved oil to at least the POH minimum (most pilots fill to 6–7) and check for leaks." },
  { id: "windshield", name: "Windshield", normal: "Clean, no cracks or crazing.", discrepancy: "A crack runs across the pilot's side of the windshield.", correction: "A cracked windshield must be evaluated by maintenance; it can fail under pressure loads or birdstrike." },
  { id: "nose-gear", name: "Nose gear & tire", normal: "Strut extension normal, shimmy damper secure, tire properly inflated.", discrepancy: "The nose strut is fully compressed and hydraulic fluid is dripping from the seal.", correction: "A flat, leaking strut needs servicing before flight to protect the propeller and nose gear." },
  { id: "pitot", name: "Pitot tube", normal: "Cover removed, opening clear; pitot heat checked warm.", discrepancy: "The pitot tube opening is plugged by a mud-dauber (wasp) nest.", correction: "A blocked pitot tube means no airspeed indication — it must be cleaned by maintenance before flight." },
  { id: "left-wing", name: "Left wing & aileron", normal: "Leading edge smooth; aileron moves freely; hinges and cotter pins secure.", discrepancy: "One aileron hinge pin is missing its cotter pin.", correction: "Missing safety hardware on a flight control is an airworthiness item — a mechanic must replace it." },
  { id: "left-fuel", name: "Left fuel tank & sump", normal: "Tank visually full; sample is blue, clear, with no water or sediment; cap secure.", discrepancy: "The left sump sample shows water; after four more samples there is still water and sediment.", correction: "Persistent contamination means the fuel system must be drained and inspected; do not fly." },
  { id: "fuel-vent", name: "Fuel vent", normal: "Vent tube clear and correctly oriented.", discrepancy: "The fuel vent tube is blocked by insect debris.", correction: "A blocked vent can starve the engine of fuel and collapse a tank — clear it before flight." },
  { id: "right-wing", name: "Right wing & aileron", normal: "Leading edge smooth; aileron moves freely; no loose rivets.", discrepancy: "A dent with a small crack in the leading-edge skin near the strut attach point.", correction: "Structural damage near an attach point must be inspected by a mechanic before flight." },
  { id: "right-fuel", name: "Right fuel tank & sump", normal: "Tank visually full; sample clean and blue; cap secure.", discrepancy: "The right tank is visually almost empty even though the gauge reads 1/2.", correction: "Never rely on the gauge alone — refuel to the planned quantity and write up the gauge." },
  { id: "main-gear", name: "Main gear, tires & brakes", normal: "Tires inflated with tread visible, brake lines dry, no fluid leaks.", discrepancy: "The left main tire is worn through to the cord on a flat spot.", correction: "A tire showing cord must be replaced before flight." },
  { id: "static", name: "Static port", normal: "Static port clean and unobstructed.", discrepancy: "The static port is covered with tape left from a recent wash.", correction: "A blocked static port disables the altimeter and VSI and corrupts airspeed — remove the tape." },
  { id: "empennage", name: "Empennage, elevator & trim tab", normal: "Surfaces move freely, trim tab secure, no cracks; rudder cables intact.", discrepancy: "The elevator trim tab has excessive free play — the actuator rod is loose.", correction: "Trim tab flutter can cause structural failure — maintenance must correct it before flight." },
  { id: "cabin", name: "Cabin, controls & documents", normal: "ARROW documents aboard, seat rails and locks secure, control lock removed, fuel selector BOTH.", discrepancy: "The control lock is still installed in the yoke.", correction: "Attempting a takeoff with the control lock installed has caused fatal accidents — remove it and verify free and correct control movement." },
];

export function walkaroundPlan(attemptId: string): Set<string> {
  const rand = rng(seedFrom(`${attemptId}:walk`));
  return new Set(pick(WALK_ZONES.map((z) => z.id), 4, rand));
}

// ───────────── Stage 9: Navigation ─────────────

export function navigationQuestions(key: CheckrideTrackKey): QuizQuestion[] {
  if (key === "instrument")
    return [
      q("cr-nav-i1", "Navigation", "scenario", "Where are you relative to the course, and which way should you turn to re-intercept?", ["Left (north) of course — turn right", "Right (south) of course — turn left", "On course", "Cannot be determined without a FROM flag"], 1, "With the CDI deflected left, the course is to your left. Heading 090 with the course to the left means you are south (right) of the course — turn left toward the needle to re-intercept.", { ref: "IFH Ch. 9", ctx: "HSI: course 090°, TO indication, CDI deflected two dots LEFT. Heading 090°." }),
      q("cr-nav-i2", "IFR Procedures", "scenario", "Which holding entry is recommended?", ["Direct", "Teardrop", "Parallel"], 2, "Inbound course 320°, LEFT turns. For a left-hand pattern, headings from 70° to 180° right of the inbound course call for a parallel entry. 060° is 100° right of 320° → parallel: cross the fix, turn right to the 140° outbound heading on the non-holding side, then turn right back to the inbound course.", { ref: "AIM 5-3-8", ctx: "\"Hold southeast of the XYZ VOR on the 140 radial, left turns.\" You are approaching the VOR on a heading of 060°." }),
      q("cr-nav-i3", "Navigation", "mc", "Flying a 10-DME arc, the DME reads 10.6 and is increasing. You should", ["turn away from the station", "hold the heading; the arc will correct itself", "turn toward the station (about 10–20° inward) to return to the arc", "climb to reduce slant-range error"], 2, "An increasing DME means you're drifting outside the arc. Turn toward the station to return, then resume small heading changes (roughly 10° every 10° of radial change) to stay on the arc.", { ref: "IFH Ch. 9" }),
      q("cr-nav-i4", "Navigation", "mc", "Before flying a non-WAAS GPS approach, you must", ["check that the database is less than 90 days old", "verify that RAIM is predicted to be available for the approach at your ETA", "obtain a VOR check within 30 days", "request a contact approach"], 1, "Non-WAAS GPS approaches rely on RAIM for integrity; check predicted RAIM before departure (and monitor in flight). The navigation database must also be current for approaches.", { ref: "AIM 1-1-17" }),
      q("cr-nav-i5", "IFR Procedures", "calc", "An ODP requires a 300 ft/NM climb gradient. At a 90-knot groundspeed, what climb rate do you need?", ["300 fpm", "450 fpm", "540 fpm", "600 fpm"], 1, "Climb rate = gradient × groundspeed ÷ 60 = 300 × 90 ÷ 60 = 450 fpm.", { ref: "TPP Climb Table" }),
    ];
  return [
    q("cr-nav-v1", "Navigation", "scenario", "Where are you relative to the station?", ["Northeast, on the 060° radial", "Southwest, on the 240° radial", "Northwest, on the 330° radial", "Southeast, on the 150° radial"], 1, "A centered CDI with a FROM indication means you're on the radial shown in the OBS: the 240° radial, southwest of the station.", { ref: "PHAK Ch. 16", ctx: "VOR tuned and identified. OBS 240°, FROM indication, CDI centered." }),
    q("cr-nav-v2", "Navigation", "calc", "The examiner asks you to divert to an airport 18 NM away. Your groundspeed is about 105 kt. Approximately how long will it take?", ["About 6 minutes", "About 10 minutes", "About 15 minutes", "About 18 minutes"], 1, "105 kt ≈ 1.75 NM per minute. 18 ÷ 1.75 ≈ 10 minutes. Turn toward the airport first, then compute.", { ref: "PHAK Ch. 16" }),
    q("cr-nav-v3", "Navigation", "calc", "30 NM after departure you're 3 NM left of course. How many degrees must you turn right just to parallel the course?", ["3°", "6°", "10°", "12°"], 1, "60:1 rule: 3 ÷ 30 × 60 = 6° to parallel. To converge on the destination, add the angle based on the remaining distance.", { ref: "PHAK Ch. 16" }),
    q("cr-nav-v4", "Navigation", "mc", "If your GPS fails mid-flight, the best backup navigation method is to", ["turn around immediately", "continue with pilotage and dead reckoning from your nav log, cross-checked with VOR radials", "climb until GPS reception returns", "follow a highway regardless of direction"], 1, "A complete nav log with headings, times and checkpoints lets you continue by pilotage and dead reckoning — the reason the ACS still requires them.", { ref: "Private Pilot ACS PA.VI.A" }),
    q("cr-nav-v5", "Radio & ATC", "mc", "VFR radar advisories ('flight following') provide", ["separation from all other aircraft", "traffic advisories workload permitting — you remain responsible for see-and-avoid, terrain and VFR weather minimums", "clearance into Class B airspace", "a guarantee of terrain clearance"], 1, "Flight following is an additional service, workload permitting. It does not relieve the pilot of see-and-avoid or provide a Class B clearance.", { ref: "AIM Ch. 4, Sec. 1 (Radar Traffic Information Service)" }),
  ];
}

// ───────────── Stage 11: Emergency ─────────────

export function emergencyQuestions(key: CheckrideTrackKey): QuizQuestion[] {
  if (key === "instrument")
    return [
      q("cr-em-i1", "IFR Procedures", "scenario", "You are holding at the clearance limit (an initial approach fix) with an EFC of 1420Z when two-way radio communication fails in IMC. Your ETA as filed is 1410Z. When should you begin the approach?", ["Immediately", "At 1410Z, the filed ETA", "At 1420Z, the EFC time", "After holding for 30 minutes"], 2, "91.185(c)(3): when the clearance limit is a fix from which an approach begins, commence descent and the approach as close as possible to the EFC if one was received; otherwise at the ETA.", { ref: "14 CFR 91.185" }),
      q("cr-em-i2", "Emergency Procedures", "scenario", "On the approach, the attitude indicator fails. What is the best action?", ["Continue using the failed instrument with extra care", "Cover it, fly partial panel, inform ATC, and request a no-gyro or nonprecision approach to the best available weather", "Climb to VFR on top regardless of tops", "Immediately descend below the MDA"], 1, "Covering the failed instrument prevents misleading cues. Inform ATC (91.187) and choose the simplest approach available, ideally to better weather.", { ref: "Instrument Rating ACS IR.VII.C" }),
      q("cr-em-i3", "Emergency Procedures", "scenario", "In IMC, the alternator fails (low-voltage light, discharge). What should you do?", ["Continue to the destination 2 hours away", "Shed electrical load, inform ATC, and plan an approach to the nearest suitable airport while the battery lasts", "Turn off all radios immediately and continue", "Squawk 7500"], 1, "The battery has limited capacity — conserve it and get on the ground at a nearby airport while you still have nav/comm and lights.", { ref: "IFH Ch. 10" }),
      q("cr-em-i4", "Instrument Approaches", "mc", "On an ILS, the localizer flags OFF after passing the FAF. You should", ["continue descending to DA using the glideslope only", "execute the missed approach", "descend to the MDA", "switch to the MSA and continue"], 1, "Loss of required guidance inside the FAF requires a missed approach (or, as appropriate, follow ATC instructions).", { ref: "AIM 5-4-21" }),
    ];
  return [
    q("cr-em-v1", "Emergency Procedures", "scenario", "Cruising at 4,500 ft, oil pressure is dropping and oil temperature rising. An airport is 12 NM away. What should you do?", ["Continue to the destination 60 NM away", "Reduce power, prepare for a possible engine failure, and divert to the nearest suitable airport, declaring an emergency as needed", "Climb to 10,000 ft to cool the engine", "Shut the engine down immediately"], 1, "Low pressure with rising temperature suggests oil loss and impending engine failure. Get to the nearest suitable airport while you still have power, keeping a landing site within glide distance.", { ref: "AFH (Emergency Procedures)" }),
    q("cr-em-v2", "Emergency Procedures", "scenario", "At 300 ft AGL after takeoff, the engine loses most of its power. What's the best action?", ["Turn back to the runway", "Lower the nose to maintain best glide and land generally straight ahead", "Hold the nose up and troubleshoot", "Extend full flaps and climb"], 1, "At low altitude, maintaining airspeed and landing ahead is the safest option; turning back often results in a stall/spin.", { ref: "AFH (Emergency Procedures)" }),
    q("cr-em-v3", "Emergency Procedures", "mc", "During an emergency descent (for example, smoke in the cabin), the recommended technique is to", ["reduce power, bank about 30–45° to maintain positive load factor and clear the area, and descend at the maximum allowable airspeed for the configuration", "pitch steeply nose-down with wings level", "extend full flaps and slow to VSO", "spiral down at idle with the airspeed near stall"], 0, "The ACS emergency descent: idle power, 30–45° of bank, and the POH emergency-descent airspeed (not exceeding VNE, VLE or VFE as applicable) while maintaining orientation and clearing.", { ref: "Private Pilot ACS PA.IX.A" }),
    q("cr-em-v4", "Emergency Procedures", "tf", "If you smell an electrical fire, the first action in most POHs is to turn the master switch OFF.", TF, 0, "True. Removing electrical power stops the source of the fire; then close vents, use the extinguisher if needed, and land as soon as possible.", { ref: "POH Section 3" }),
  ];
}

// ───────────── Stage 12: Postflight ─────────────

export const POSTFLIGHT_ITEMS: SelectItem[] = [
  { id: "shutdown", label: "Shut down with the mixture to idle cutoff, then magnetos OFF and key removed", correct: true, why: "Shutting down with the mixture clears fuel from the cylinders; removing the key prevents accidental starts." },
  { id: "master", label: "Avionics and master switch OFF", correct: true, why: "Prevents battery drain." },
  { id: "lock", label: "Install the control lock", correct: true, why: "Protects the control surfaces from wind damage." },
  { id: "tie", label: "Chock and tie down the airplane (wings and tail)", correct: true, why: "Wind can move or damage an unsecured airplane." },
  { id: "pitot-cover", label: "Install the pitot cover", correct: true, why: "Prevents insects and debris from blocking the pitot tube." },
  { id: "squawks", label: "Record Hobbs/tach times and write up any discrepancies for maintenance", correct: true, why: "Lets maintenance correct problems and the next pilot know the airplane's status." },
  { id: "master-on", label: "Leave the master switch on for a few minutes so the avionics cool down", correct: false, why: "This drains the battery and is not a procedure in any trainer POH." },
  { id: "mags-first", label: "Shut down by switching the magnetos off with the mixture rich", correct: false, why: "This leaves unburned fuel in the cylinders; use the mixture to stop the engine." },
  { id: "tail-only", label: "Only the tail needs to be tied down", correct: false, why: "Wings and tail should be secured." },
];
