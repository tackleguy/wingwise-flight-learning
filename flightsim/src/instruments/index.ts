/**
 * Instruments module: works out what every cockpit instrument INDICATES (`sim.state.ind`),
 * including the lag and the errors of the real mechanical instruments. Logic only — the panel
 * module draws the result.
 */
export { createInstruments } from "./instruments";
export type { InstrumentOptions, InstrumentStatus, InstrumentsApi } from "./api";
export { kcasToKias, kiasToKcas } from "./airspeed";
export { compassDeviation } from "./compass";

import { COMPASS_TILT_LIMIT_DEG } from "./compass";
import { AI_PITCH_LIMIT_DEG, AI_ROLL_LIMIT_DEG, BALL_FULL_SCALE_DEG, DG_GIMBAL_LIMIT_DEG, SUCTION_FULL_INHG } from "./gyros";
import { VSI_LIMIT_FPM } from "./pitot-static";

/** Key numbers of the instrument models, for explanation texts and lessons (read-only). */
export const INSTRUMENT_LIMITS = {
  /** The attitude indicator tumbles beyond this pitch / bank, degrees. */
  attitudePitchDeg: AI_PITCH_LIMIT_DEG,
  attitudeBankDeg: AI_ROLL_LIMIT_DEG,
  /** The heading indicator tumbles when its inner gimbal is tilted beyond this (pitch or bank of about this much), degrees. */
  headingGyroDeg: DG_GIMBAL_LIMIT_DEG,
  /** The compass card jams when the cabin is tilted more than this from the apparent vertical, degrees. */
  compassTiltDeg: COMPASS_TILT_LIMIT_DEG,
  /** The vertical speed indicator stops at ± this, ft/min. */
  vsiFpm: VSI_LIMIT_FPM,
  /** Tilt of "apparent down" that puts the slip ball at the end of its tube (`ind.ball` = ±1), degrees. */
  ballFullScaleDeg: BALL_FULL_SCALE_DEG,
  /** Suction at and above which the vacuum gyros run at full speed, inHg. */
  suctionForFullGyroSpeedInHg: SUCTION_FULL_INHG,
} as const;
