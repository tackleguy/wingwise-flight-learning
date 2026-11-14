/**
 * Virtual checkride — data model. A checkride attempt is persisted as a CheckrideAttempt
 * (src/lib/store.ts); this module defines the static stage structure per certificate track.
 */
import type { TrackId } from "@/lib/store";
import type { QuizQuestion } from "@/lib/content/types";

export type CheckrideTrackKey = "private" | "instrument" | "commercial";

export type StageId =
  | "preflight-prep"
  | "documents"
  | "aircraft-knowledge"
  | "weather"
  | "planning"
  | "oral"
  | "walkaround"
  | "maneuvers"
  | "navigation"
  | "radio"
  | "emergency"
  | "postflight";

export interface StageDef {
  id: StageId;
  number: number;
  name: string;
  summary: string;
  /** ACS-style task references for this track. */
  acsRef: string;
}

export interface SelectItem {
  id: string;
  label: string;
  correct: boolean;
  why: string;
}

export interface WeatherScenario {
  intro: string;
  reports: { label: string; text: string }[];
  questions: QuizQuestion[];
  decisions: { id: string; label: string }[];
  correctDecision: string;
  decisionWhy: string;
  reasons: SelectItem[];
}

export interface PlanningScenario {
  intro: string;
  trueCourse: number;
  distanceNm: number;
  tas: number;
  windDir: number;
  windKt: number;
  /** Positive = east */
  variationDeg: number;
  gph: number;
  reserveMin: number;
  reserveLabel: string;
}

export interface CheckrideTrackDef {
  key: CheckrideTrackKey;
  trackId: TrackId;
  title: string;
  certificate: string;
  description: string;
  simScenario: "checkride-private" | "checkride-instrument";
  atcScenario: "class-d-entry" | "ifr-departure-clearance";
  ifr: boolean;
  stages: StageDef[];
}
