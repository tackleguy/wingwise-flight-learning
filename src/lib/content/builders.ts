/**
 * Small, typed builders used by the course content files. They keep the lesson data terse and
 * restrict diagram / exercise / practice ids to the components that actually exist in the UI.
 */
import type { CalloutTone, LessonBlock, QuizQuestion } from "./types";

export type DiagramId =
  | "four-forces"
  | "airfoil-aoa"
  | "stall-aoa"
  | "airspace-classes"
  | "traffic-pattern"
  | "six-pack"
  | "pitot-static"
  | "vor-cdi"
  | "hsi"
  | "ils"
  | "holding-pattern"
  | "wind-triangle"
  | "load-factor"
  | "runway-markings"
  | "density-altitude"
  | "light-gun";

export type ExerciseId =
  | "metar-decode"
  | "taf-decode"
  | "airspace-identify"
  | "sectional-symbols"
  | "xc-calc"
  | "wind-correction"
  | "fuel-planning"
  | "landmarks"
  | "weight-balance"
  | "holding-entry"
  | "vor-orientation"
  | "instrument-scan"
  | "light-gun-signals"
  | "radio-phraseology";

export type PracticePath =
  | "/simulator?scenario=vfr-pattern"
  | "/simulator?scenario=vfr-takeoff-climb"
  | "/simulator?scenario=vfr-turns-climbs"
  | "/simulator?scenario=vfr-slow-flight"
  | "/simulator?scenario=vfr-stall"
  | "/simulator?scenario=vfr-ground-ref"
  | "/simulator?scenario=vfr-xc"
  | "/simulator?scenario=vfr-landing"
  | "/simulator?scenario=ifr-ils"
  | "/simulator?scenario=ifr-rnav"
  | "/simulator?scenario=ifr-hold"
  | "/simulator?scenario=ifr-vor-intercept"
  | "/simulator?scenario=ifr-dme-arc"
  | "/simulator?scenario=ifr-missed"
  | "/simulator?scenario=ifr-departure"
  | "/simulator?scenario=emg-engine-failure"
  | "/simulator?scenario=emg-electrical"
  | "/simulator?scenario=emg-vacuum"
  | "/simulator?scenario=emg-radio"
  | "/simulator?scenario=emg-weather"
  | "/avionics"
  | "/atc"
  | "/ai-atc"
  | "/weather"
  | "/navigation"
  | "/planner"
  | "/aircraft"
  | "/airports";

export type Subject =
  | "Regulations"
  | "Airspace"
  | "Weather"
  | "Weather Services"
  | "Aerodynamics"
  | "Aircraft Systems"
  | "Flight Instruments"
  | "Performance"
  | "Weight & Balance"
  | "Navigation"
  | "Charts"
  | "Radio & ATC"
  | "Airport Operations"
  | "Human Factors"
  | "ADM"
  | "IFR Procedures"
  | "Instrument Approaches"
  | "Emergency Procedures"
  | "Night Operations";

/** A question whose subject is restricted to the reporting subject list. */
export type Q = Omit<QuizQuestion, "subject"> & { subject: Subject };

export const q = (question: Q): QuizQuestion => question;

export const h = (text: string): LessonBlock => ({ type: "h", text });
export const p = (text: string): LessonBlock => ({ type: "p", text });
export const ul = (...items: string[]): LessonBlock => ({ type: "list", items });
export const ol = (...items: string[]): LessonBlock => ({ type: "list", items, ordered: true });
export const callout = (tone: CalloutTone, title: string, text: string): LessonBlock => ({
  type: "callout",
  tone,
  title,
  text,
});
export const tip = (title: string, text: string): LessonBlock => callout("tip", title, text);
export const info = (title: string, text: string): LessonBlock => callout("info", title, text);
export const caution = (title: string, text: string): LessonBlock => callout("caution", title, text);
export const warning = (title: string, text: string): LessonBlock => callout("warning", title, text);
export const table = (headers: string[], rows: string[][]): LessonBlock => ({
  type: "table",
  headers,
  rows,
});
export const diagram = (id: DiagramId, caption: string): LessonBlock => ({
  type: "diagram",
  id,
  caption,
});
export const exercise = (id: ExerciseId, title: string): LessonBlock => ({
  type: "exercise",
  id,
  title,
});
export const practice = (to: PracticePath, label: string, text: string): LessonBlock => ({
  type: "practice",
  to,
  label,
  text,
});
export const check = (question: Q): LessonBlock => ({ type: "check", question });

/** Module-level practice link. */
export const link = (to: PracticePath, label: string): { to: string; label: string } => ({
  to,
  label,
});
