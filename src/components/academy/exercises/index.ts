/**
 * Registry of graded interactive exercises. Lesson content references exercises by id
 * (`{ type: "exercise", id: "metar-decode" }`); `getExercise(id)` returns the component or null.
 */
import type { ComponentType } from "react";
import {
  FuelPlanningExercise,
  WeightBalanceExercise,
  WindCorrectionExercise,
  XcCalcExercise,
} from "./calc";
import { AirspaceIdentifyExercise, LandmarksExercise, SectionalSymbolsExercise } from "./charts";
import { HoldingEntryExercise, InstrumentScanExercise, VorOrientationExercise } from "./ifr";
import { LightGunSignalsExercise, RadioPhraseologyExercise } from "./radio";
import { MetarDecodeExercise, TafDecodeExercise } from "./weather";

export const EXERCISES: Record<string, { title: string; component: ComponentType }> = {
  "metar-decode": { title: "Decode a METAR", component: MetarDecodeExercise },
  "taf-decode": { title: "Read a TAF", component: TafDecodeExercise },
  "airspace-identify": {
    title: "Identify airspace on a sectional",
    component: AirspaceIdentifyExercise,
  },
  "sectional-symbols": { title: "Sectional chart symbols", component: SectionalSymbolsExercise },
  "xc-calc": { title: "Cross-country navigation log", component: XcCalcExercise },
  "wind-correction": { title: "Wind correction angle", component: WindCorrectionExercise },
  "fuel-planning": { title: "VFR fuel planning", component: FuelPlanningExercise },
  landmarks: { title: "Pilotage: match the landmark", component: LandmarksExercise },
  "weight-balance": { title: "Weight & balance", component: WeightBalanceExercise },
  "holding-entry": { title: "Holding pattern entries", component: HoldingEntryExercise },
  "vor-orientation": { title: "VOR orientation", component: VorOrientationExercise },
  "instrument-scan": {
    title: "Primary & supporting instruments",
    component: InstrumentScanExercise,
  },
  "light-gun-signals": { title: "ATC light gun signals", component: LightGunSignalsExercise },
  "radio-phraseology": { title: "Radio phraseology", component: RadioPhraseologyExercise },
};

export function getExercise(id: string): { title: string; component: ComponentType } | null {
  return EXERCISES[id] ?? null;
}
