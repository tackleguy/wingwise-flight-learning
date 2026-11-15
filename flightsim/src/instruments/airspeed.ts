/**
 * Airspeed calibration: what the airspeed indicator SHOWS (KIAS) for a given calibrated airspeed
 * (KCAS), and back.
 *
 * The difference is "position error": the static ports and pitot tube sit in air that is disturbed
 * by the aircraft, most of all at high angles of attack (slow flight) and with flaps down. The
 * numbers are the Cessna 172P-class airspeed-calibration table as given in the project brief
 * (educational reference values, not approved data):
 *
 *   flaps up   KIAS 50 60 70 80 90 100 110 120 130 140 150 160
 *              KCAS 56 62 70 78 87  97 107 117 127 137 147 157
 *   flaps 10°  KIAS 40 50 60 70 80 85      KCAS 49 55 62 70 79 83
 *   flaps 30°  KIAS 40 50 60 70 80 85      KCAS 47 53 61 70 80 84
 *
 * plus the two published stall speeds as extra points (44 KIAS = 51 KCAS clean, 33 KIAS = 46 KCAS
 * with flaps 30°). Below the lowest published point each curve runs in a straight line to zero
 * (an assumption — nothing is published there), which keeps the curve continuous, always rising
 * and therefore exactly invertible. Above the highest published point the last correction is kept.
 */
import { STD_INHG, clamp } from "@/core/math";

type Curve = { readonly kcas: readonly number[]; readonly kias: readonly number[] };

const FLAPS_UP: Curve = {
  kcas: [0, 51, 56, 62, 70, 78, 87, 97, 107, 117, 127, 137, 147, 157],
  kias: [0, 44, 50, 60, 70, 80, 90, 100, 110, 120, 130, 140, 150, 160],
};
const FLAPS_10: Curve = {
  kcas: [0, 49, 55, 62, 70, 79, 83],
  kias: [0, 40, 50, 60, 70, 80, 85],
};
const FLAPS_30: Curve = {
  kcas: [0, 46, 47, 53, 61, 70, 80, 84],
  kias: [0, 33, 40, 50, 60, 70, 80, 85],
};

/** Piecewise-linear y(x); beyond the last point the last offset (y − x) is kept. */
function evaluate(xs: readonly number[], ys: readonly number[], x: number): number {
  const n = xs.length;
  const xLast = xs[n - 1] ?? 0;
  const yLast = ys[n - 1] ?? 0;
  if (x >= xLast) return yLast + (x - xLast);
  if (x <= 0) return 0;
  for (let i = 1; i < n; i++) {
    const x1 = xs[i] ?? 0;
    if (x <= x1) {
      const x0 = xs[i - 1] ?? 0;
      const y0 = ys[i - 1] ?? 0;
      const y1 = ys[i] ?? 0;
      return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
    }
  }
  return yLast;
}

/**
 * Indicated airspeed (KIAS) for a calibrated airspeed (KCAS) and flap angle (degrees, 0–30).
 * Between the published flap settings (0°, 10°, 30°) the correction is interpolated by flap angle.
 */
export function kcasToKias(kcas: number, flapsDeg: number): number {
  if (!(kcas > 0)) return 0;
  const f = clamp(Number.isFinite(flapsDeg) ? flapsDeg : 0, 0, 30);
  if (f <= 0) return evaluate(FLAPS_UP.kcas, FLAPS_UP.kias, kcas);
  const mid = evaluate(FLAPS_10.kcas, FLAPS_10.kias, kcas);
  if (f <= 10) {
    const up = evaluate(FLAPS_UP.kcas, FLAPS_UP.kias, kcas);
    return up + ((mid - up) * f) / 10;
  }
  const full = evaluate(FLAPS_30.kcas, FLAPS_30.kias, kcas);
  return mid + ((full - mid) * (f - 10)) / 20;
}

/** Calibrated airspeed (KCAS) for an indicated airspeed (KIAS) and flap angle — the exact inverse of `kcasToKias`. */
export function kiasToKcas(kias: number, flapsDeg: number): number {
  if (!(kias > 0)) return 0;
  // Every curve rises all the way, so a simple bisection finds the one matching speed.
  let lo = 0;
  let hi = Math.max(200, kias + 40);
  for (let i = 0; i < 60; i++) {
    const mid = 0.5 * (lo + hi);
    if (kcasToKias(mid, flapsDeg) < kias) lo = mid;
    else hi = mid;
  }
  return 0.5 * (lo + hi);
}

// ---------------------------------------------------------------- pitot pressure ↔ airspeed

/** Speed of sound at sea level in the standard atmosphere, kt. */
const A0_KT = 661.4786;

/**
 * Impact pressure (pitot pressure minus static pressure), inHg, for a calibrated airspeed. This is
 * the definition of calibrated airspeed: the airspeed indicator is a pressure gauge with a scale
 * drawn for sea-level standard air.
 */
export function impactPressureInHg(kcas: number): number {
  const m = Math.max(0, kcas) / A0_KT;
  return STD_INHG * (Math.pow(1 + 0.2 * m * m, 3.5) - 1);
}

/** Calibrated airspeed, kt, for an impact pressure, inHg (inverse of `impactPressureInHg`). */
export function kcasFromImpactPressure(qcInHg: number): number {
  if (!(qcInHg > 0)) return 0;
  return A0_KT * Math.sqrt(5 * (Math.pow(qcInHg / STD_INHG + 1, 2 / 7) - 1));
}

/**
 * Low-speed behaviour of the needle. A real airspeed indicator does not register the first knots:
 * the needle sits on its stop until the pressure overcomes the spring and friction (about 20 kt)
 * and then "comes alive" quickly — the "airspeed alive" call on the take-off roll.
 */
export function needleFromKias(kias: number): number {
  if (kias >= NEEDLE_FULL_KT) return kias;
  if (kias <= NEEDLE_REST_KT) return 0;
  const t = (kias - NEEDLE_REST_KT) / (NEEDLE_FULL_KT - NEEDLE_REST_KT);
  return kias * t * t * (3 - 2 * t);
}
const NEEDLE_REST_KT = 19;
const NEEDLE_FULL_KT = 28;
