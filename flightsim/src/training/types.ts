/**
 * The Tests mode: scored exercises inside the simulator (preflight, failures, weather, flying
 * skills). A test sets the situation up (airport, weather, where to start), may make things go
 * wrong on the way (failures, a "go around" call), watches what the pilot does against a list of
 * objectives, and ends with a score and a debrief.
 */
import type { Sim } from "@/core/sim";
import type { SpawnKind } from "@/core/types";
import type { Runway } from "@/data/world-data";

export type TestCategory = "preflight" | "failures" | "weather" | "skills";

/** What a pilot can report with the "Report a problem" button. */
export type FailureKind = "engine" | "carbIce" | "alternator" | "vacuum" | "pitot" | "staticPort" | "radio";

export const FAILURE_LABELS: Record<FailureKind, string> = {
  engine: "Engine failure (no power)",
  carbIce: "Partial power loss / carburettor ice",
  alternator: "Electrical: alternator not charging",
  vacuum: "Vacuum system (attitude & heading indicators)",
  pitot: "Airspeed indicator (pitot tube blocked)",
  staticPort: "Altimeter / vertical speed (static port blocked)",
  radio: "Radios not working",
};

export interface TouchdownRecord {
  t: number;
  vsFpm: number;
  kcas: number;
  rollDeg: number;
  pitchDeg: number;
  driftDeg: number;
  lat: number;
  lon: number;
  headingTrue: number;
}

/** Everything objectives may look at while a test runs. */
export interface TestContext {
  readonly sim: Sim;
  /** Simulated seconds since the test started. */
  t: number;
  liftoffAt: number | null;
  touchdowns: TouchdownRecord[];
  /** Stalls so far, with the time each began. */
  stalls: number[];
  stallRecoveries: { t: number; altitudeLostFt: number }[];
  /** Named moments (simulated seconds since the start), e.g. "failure", "goAroundCall". */
  marks: Record<string, number>;
  /** Problems the pilot has reported, in order. */
  reports: { kind: FailureKind; t: number }[];
  /** The runway the test is built around. */
  runway: Runway | null;
  runwayEnd: 0 | 1 | null;
  /** Scratch values a test may keep between steps. */
  memo: Record<string, number>;
  /** A number 0…1 drawn once per attempt, so that e.g. the moment of a failure varies. */
  rand: number;
}

export type ObjectiveStatus = "pending" | "pass" | "fail";

export interface Objective {
  readonly id: string;
  readonly label: string;
  /** Points this objective is worth. */
  readonly weight: number;
  /** Failing it fails the whole test, whatever the score. */
  readonly critical: boolean;
  status: ObjectiveStatus;
  /** Plain-language explanation of the result (also while pending). */
  detail: string;
  update(ctx: TestContext, dt: number): void;
  /** The test is over: decide anything still pending. */
  finish(ctx: TestContext): void;
}

/** Something that happens during a test, once, when its condition first becomes true. */
export interface TestEvent {
  when(ctx: TestContext): boolean;
  run(ctx: TestContext): void;
}

export interface FlightSetup {
  airport: string;
  /** Runway end, e.g. "25R". */
  runway: string;
  /** "runway": lined up on the runway; "final": on final approach; "air": in the air (see `air`). */
  kind: Extract<SpawnKind, "runway" | "final" | "air">;
  /** "final": distance from the threshold, nm. */
  finalNm?: number;
  /** "air": height above the airport, ft; speed, KIAS; distance before the runway threshold, nm (along the final approach; 0 = over the threshold). */
  air?: { heightFt: number; kias: number; nmBefore: number };
  engineRunning?: boolean;
  /** Weather preset id (src/weather/presets.ts). */
  weather: string;
  /** Local solar time, hours (default: midday). */
  hours?: number;
}

export interface FlightTest {
  setup: FlightSetup;
  /** The test ends by itself after this long (simulated seconds). */
  timeLimitSec: number;
  /** Adjust the cockpit after the aircraft has been placed (switches, lights, flaps). */
  prepare?(sim: Sim, ctx: TestContext): void;
  events?(): TestEvent[];
  objectives(): Objective[];
  /** A reason to end the test now, or null to carry on. */
  done?(ctx: TestContext): string | null;
}

export interface TestDef {
  id: string;
  category: TestCategory;
  title: string;
  /** One sentence for the list. */
  summary: string;
  /** What will happen and what to do, in plain words (shown before the start and during the test). */
  briefing: string[];
  /** Typical duration, minutes. */
  minutes: number;
  /** Tips shown in the debrief. */
  tips: string[];
  /** A flying test… */
  flight?: FlightTest;
  /** …or the walk-around inspection (no flying). */
  walkaround?: true;
}

export interface TestResult {
  id: string;
  title: string;
  /** 0…100 */
  score: number;
  passed: boolean;
  /** Epoch ms. */
  at: number;
  durationSec: number;
  endedBecause: string;
  objectives: { label: string; status: ObjectiveStatus; detail: string; weight: number; critical: boolean }[];
}

/** The score needed to pass (and every critical objective must pass). */
export const PASS_SCORE = 80;
