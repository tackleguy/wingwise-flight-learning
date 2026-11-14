/**
 * Oral exam simulator — data model.
 * Examiner-style questions with a weighted keyword rubric, a model answer and follow-ups.
 */

export type OralLevel = "beginner" | "standard" | "advanced" | "checkride";

/** Certificate perspective a question is written for. */
export type OralTrack = "private" | "instrument" | "commercial";

export type OralTopic =
  | "Aircraft Systems"
  | "Regulations"
  | "Weather"
  | "Navigation"
  | "Performance"
  | "Weight & Balance"
  | "Aeromedical"
  | "Emergency Procedures"
  | "Cross-Country Planning"
  | "Risk Management"
  | "Airspace"
  | "Flight Planning"
  | "Commercial Operations"
  | "Maneuvers"
  | "IFR Regulations"
  | "IFR Procedures"
  | "Instrument Approaches"
  | "IFR Weather"
  | "IFR Emergencies";

export interface RubricConcept {
  id: string;
  /** Short name shown as "missing: ..." */
  label: string;
  /** Alternatives; any one matching counts. Lowercase words; a trailing * matches any word ending. */
  keywords: string[];
  weight: number;
}

export interface FollowUp {
  question: string;
  /** Concept ids this follow-up probes. */
  targets: string[];
}

export interface OralQuestion {
  id: string;
  topic: OralTopic;
  tracks: OralTrack[];
  /** 1 = basic, 2 = standard, 3 = advanced */
  difficulty: 1 | 2 | 3;
  question: string;
  /** Optional scenario framing, used in checkride-level sessions. */
  scenario?: string;
  hint: string;
  concepts: RubricConcept[];
  modelAnswer: string;
  followUps: FollowUp[];
  reference?: string;
}
