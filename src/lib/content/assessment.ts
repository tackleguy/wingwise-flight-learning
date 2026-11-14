/**
 * Initial knowledge assessment used during onboarding. Fifteen questions in ascending
 * difficulty across aerodynamics, regulations, weather, navigation, instruments and IFR.
 * `scoreAssessment` turns answers into an AssessmentResult (level + recommended track).
 */
import type { AssessmentResult, TrackId } from "@/lib/store";
import type { QuizQuestion } from "./types";

export const ASSESSMENT_QUESTIONS: QuizQuestion[] = [
  {
    id: "assess.1",
    subject: "Aerodynamics",
    kind: "mc",
    prompt: "Which of the four forces of flight directly opposes thrust?",
    choices: ["Lift", "Weight", "Drag", "Torque"],
    answer: 2,
    explanation:
      "Drag is the rearward, retarding force that acts parallel to the relative wind and opposes thrust. Lift opposes weight.",
    reference: "PHAK — Aerodynamics of Flight",
  },
  {
    id: "assess.2",
    subject: "Flight Instruments",
    kind: "mc",
    prompt: "Which of these instruments works using only static pressure?",
    choices: ["Airspeed indicator", "Altimeter", "Attitude indicator", "Turn coordinator"],
    answer: 1,
    explanation:
      "The altimeter (and VSI) use static pressure only. The airspeed indicator needs both pitot and static pressure; the attitude indicator and turn coordinator are gyroscopic.",
    reference: "PHAK — Flight Instruments",
  },
  {
    id: "assess.3",
    subject: "Regulations",
    kind: "mc",
    prompt: "What is the minimum age to be issued a private pilot certificate for airplanes?",
    choices: ["16", "17", "18", "21"],
    answer: 1,
    explanation:
      "14 CFR 61.103: at least 17 years old (16 for a glider or balloon rating). You may solo as a student pilot at 16.",
    reference: "14 CFR 61.103",
  },
  {
    id: "assess.4",
    subject: "Weather",
    kind: "weather",
    context: "KDEN 141753Z 27012KT 10SM BKN015 OVC040 08/02 A2998",
    prompt: "In this METAR, what does BKN015 mean?",
    choices: [
      "Broken clouds at 1,500 ft AGL",
      "Broken clouds at 15,000 ft MSL",
      "Visibility 1.5 miles in mist",
      "Wind gusting to 15 knots",
    ],
    answer: 0,
    explanation:
      "Cloud heights in a METAR are in hundreds of feet above ground level: BKN015 = broken layer (5/8–7/8 coverage) at 1,500 ft AGL. A broken layer is a ceiling.",
    reference: "AIM 7-1; AC 00-45",
  },
  {
    id: "assess.5",
    subject: "Navigation",
    kind: "mc",
    prompt: "Runway 27 is aligned closest to which magnetic heading?",
    choices: ["027°", "127°", "270°", "207°"],
    answer: 2,
    explanation:
      "Runway numbers are the magnetic heading rounded to the nearest 10° with the last zero dropped: runway 27 ≈ 270° magnetic.",
    reference: "AIM 2-3-3",
  },
  {
    id: "assess.6",
    subject: "Aerodynamics",
    kind: "mc",
    prompt: "An airplane wing stalls when…",
    choices: [
      "Airspeed drops below the published stall speed",
      "The critical angle of attack is exceeded",
      "The nose is raised above the horizon",
      "Engine power is reduced to idle",
    ],
    answer: 1,
    explanation:
      "A stall occurs whenever the critical angle of attack is exceeded — at any airspeed, attitude or power setting. Published stall speeds apply only to specific conditions (weight, configuration, 1 G).",
    reference: "PHAK — Aerodynamics of Flight",
  },
  {
    id: "assess.7",
    subject: "Airspace",
    kind: "mc",
    prompt: "What is required before a VFR aircraft enters Class D airspace?",
    choices: [
      "An explicit ATC clearance",
      "Two-way radio communication established with the tower",
      "A Mode C transponder and ADS-B Out",
      "An instrument rating",
    ],
    answer: 1,
    explanation:
      "14 CFR 91.129: two-way radio communication must be established before entering Class D. An explicit clearance is required for Class B, not Class D.",
    reference: "14 CFR 91.129",
  },
  {
    id: "assess.8",
    subject: "Regulations",
    kind: "mc",
    prompt:
      "For a VFR flight in an airplane during the day, the minimum fuel reserve after reaching the first point of intended landing is…",
    choices: ["20 minutes", "30 minutes", "45 minutes", "1 hour"],
    answer: 1,
    explanation:
      "14 CFR 91.151: 30 minutes at normal cruising speed by day, 45 minutes at night. (IFR requires 45 minutes after the alternate under 91.167.)",
    reference: "14 CFR 91.151",
  },
  {
    id: "assess.9",
    subject: "Weather",
    kind: "scenario",
    context:
      "Evening METAR: wind calm, sky clear, temperature 15 °C, dewpoint 14 °C, temperature falling.",
    prompt: "What weather should you expect overnight?",
    choices: [
      "Thunderstorms",
      "Fog or very low clouds",
      "Strong gusty winds",
      "Improving visibility",
    ],
    answer: 1,
    explanation:
      "A temperature/dewpoint spread of 1 °C with calm wind, clear skies and nighttime cooling is the classic setup for radiation fog.",
    reference: "Aviation Weather Handbook (FAA-H-8083-28)",
  },
  {
    id: "assess.10",
    subject: "Navigation",
    kind: "calc",
    prompt: "Your true course is 090°. Magnetic variation is 10° E. What is your magnetic course?",
    choices: ["080°", "100°", "090°", "270°"],
    answer: 0,
    explanation:
      "East is least, west is best: subtract easterly variation. 090° − 10° = 080° magnetic.",
    reference: "PHAK — Navigation",
  },
  {
    id: "assess.11",
    subject: "Aerodynamics",
    kind: "calc",
    prompt: "What is the load factor in a level, coordinated 60° bank turn?",
    choices: ["1.0 G", "1.4 G", "2.0 G", "3.8 G"],
    answer: 2,
    explanation:
      "Load factor = 1 / cos(bank). cos 60° = 0.5, so n = 2.0 G. Stall speed rises by √2 — about 41%.",
    reference: "PHAK — Aerodynamics of Flight",
  },
  {
    id: "assess.12",
    subject: "Flight Instruments",
    kind: "scenario",
    prompt:
      "The static port becomes completely blocked by ice during a climb. What will the altimeter show?",
    choices: [
      "It will continue to show the correct altitude",
      "It will remain at the altitude where the blockage occurred",
      "It will drop to zero",
      "It will indicate a rapid descent",
    ],
    answer: 1,
    explanation:
      "With static pressure trapped, the altimeter freezes at the altitude where the blockage occurred and the VSI reads zero. The airspeed indicator will read low in the climb.",
    reference: "PHAK — Flight Instruments",
  },
  {
    id: "assess.13",
    subject: "IFR Procedures",
    kind: "mc",
    prompt:
      "To act as PIC under IFR, within the preceding 6 calendar months you must have performed at least…",
    choices: [
      "Three instrument approaches and three landings",
      "Six instrument approaches, holding procedures and tasks, and intercepting and tracking courses",
      "Six hours of simulated instrument time",
      "An instrument proficiency check, every time",
    ],
    answer: 1,
    explanation:
      "14 CFR 61.57(c): six instrument approaches, holding procedures and tasks, and intercepting and tracking courses through the use of navigational electronic systems within the preceding 6 calendar months — or an IPC.",
    reference: "14 CFR 61.57(c)",
  },
  {
    id: "assess.14",
    subject: "IFR Procedures",
    kind: "scenario",
    prompt:
      "Your destination has an instrument approach. Which forecast (1 hour before to 1 hour after your ETA) allows you to file IFR without an alternate?",
    choices: [
      "Ceiling 1,800 ft, visibility 5 SM",
      "Ceiling 2,500 ft, visibility 2 SM",
      "Ceiling 2,500 ft, visibility 4 SM",
      "Ceiling 1,000 ft, visibility 3 SM",
    ],
    answer: 2,
    explanation:
      '14 CFR 91.169 "1-2-3 rule": no alternate is needed if, from 1 hour before to 1 hour after ETA, the ceiling will be at least 2,000 ft above airport elevation and visibility at least 3 SM.',
    reference: "14 CFR 91.169",
  },
  {
    id: "assess.15",
    subject: "IFR Procedures",
    kind: "scenario",
    prompt:
      "In IMC you lose two-way radio communication while on your assigned route. Which altitude should you fly for each route segment?",
    choices: [
      "The last assigned altitude only",
      "The highest of: last assigned altitude, the MEA, or the altitude ATC told you to expect",
      "The lowest safe altitude to break out of the clouds",
      "Any VFR cruising altitude",
    ],
    answer: 1,
    explanation:
      "14 CFR 91.185(c)(2): fly the highest of the altitude assigned in the last clearance, the minimum altitude for IFR operations (e.g. MEA), or the altitude ATC advised you to expect.",
    reference: "14 CFR 91.185",
  },
];

/** Subjects treated as instrument (IFR) knowledge when recommending a track. */
const IFR_SUBJECTS = new Set(["IFR Procedures"]);

export const LEVEL_TEXT: Record<AssessmentResult["level"], string> = {
  beginner:
    "You are at the start of your journey. Begin with the VFR ground school and the Private Pilot track.",
  intermediate:
    "You have a solid base of private-pilot knowledge. Fill the gaps shown below, then build toward your next certificate or rating.",
  advanced:
    "You show strong aeronautical knowledge. Focus on advanced material and preparation for your next certificate or rating.",
};

/**
 * Score assessment answers (index per question, null = skipped).
 *   0–6 correct → beginner, 7–11 → intermediate, 12–15 → advanced.
 * Recommended track: beginners and intermediates without IFR knowledge → private;
 * intermediate/advanced with IFR knowledge → instrument; near-perfect including all IFR → commercial.
 */
export function scoreAssessment(answers: (number | null)[]): AssessmentResult {
  const byCategory: Record<string, { correct: number; total: number }> = {};
  let score = 0;
  let ifrCorrect = 0;
  let ifrTotal = 0;
  ASSESSMENT_QUESTIONS.forEach((q, i) => {
    const ok = answers[i] === q.answer;
    const cat = byCategory[q.subject] ?? { correct: 0, total: 0 };
    cat.total += 1;
    if (ok) cat.correct += 1;
    byCategory[q.subject] = cat;
    if (ok) score += 1;
    if (IFR_SUBJECTS.has(q.subject)) {
      ifrTotal += 1;
      if (ok) ifrCorrect += 1;
    }
  });
  const total = ASSESSMENT_QUESTIONS.length;
  const level: AssessmentResult["level"] =
    score >= 12 ? "advanced" : score >= 7 ? "intermediate" : "beginner";
  let recommendedTrack: TrackId = "private";
  if (level === "advanced")
    recommendedTrack = ifrCorrect === ifrTotal && score >= 14 ? "commercial" : "instrument";
  else if (level === "intermediate" && ifrCorrect >= 2) recommendedTrack = "instrument";
  return { date: new Date().toISOString(), score, total, byCategory, recommendedTrack, level };
}
