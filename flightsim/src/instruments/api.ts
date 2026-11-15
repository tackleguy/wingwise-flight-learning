import type { SimModule } from "@/core/sim";

/** Optional settings for `createInstruments`. */
export interface InstrumentOptions {
  /**
   * Seed for the small random imperfections (gyro drift, fuel-gauge error, where a tumbled gyro
   * ends up). The same seed and the same flight always give the same indications. Default 1.
   */
  seed?: number;
  /**
   * Model the heading indicator's "gimbal error": in a bank or climb on headings between the
   * cardinal points the card of a real directional gyro is off by a few degrees (about 1° in a
   * standard-rate turn, 4° at 30° of bank) and comes back when the wings are level. Default true.
   */
  dgGimbalError?: boolean;
}

/**
 * Details that are not shown on any gauge but help the "explain this instrument" texts, lessons
 * and tests. Read-only; the same object is updated in place every physics step.
 */
export interface InstrumentStatus {
  /** Rotor speeds, 0 (stopped) … 1 (normal). */
  attitudeGyroSpeed: number;
  headingGyroSpeed: number;
  turnGyroSpeed: number;
  /** A gimbal is against its stop and the gyro is whirling. */
  attitudeTumbling: boolean;
  headingTumbling: boolean;
  /** The compass card is jammed against its bowl (aircraft tilted more than about 18° from the apparent vertical). */
  compassDragging: boolean;
  /** Mechanical drift of this flight's heading indicator, degrees per hour (the Earth-rotation drift comes on top). */
  headingGyroDriftDegPerHr: number;
  /** Suction the gyros are getting, inHg, and whether the electric instruments have power. */
  suctionInHg: number;
  electricalPower: boolean;
}

export interface InstrumentsApi extends SimModule {
  readonly name: "instruments";
  /** Set the heading indicator to agree with the magnetic compass right now (what the pilot does with the knob). Also triggered by the 'dg-align' command. */
  alignHeadingIndicator(): void;
  /** Indicated airspeed for a calibrated airspeed and flap angle, and the inverse (POH calibration). */
  kcasToKias(kcas: number, flapsDeg: number): number;
  kiasToKcas(kias: number, flapsDeg: number): number;
  /** Fixed compass deviation (compass reading minus magnetic heading, degrees) — what a compass correction card would list. */
  compassDeviation(magneticHeadingDeg: number): number;
  /** Extra read-only details (gyro speeds, tumbling, …) for explanations, lessons and tests. */
  readonly status: InstrumentStatus;
}
