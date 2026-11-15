/**
 * The three pressure instruments: airspeed indicator, altimeter and vertical speed indicator.
 *
 * They share two air lines:
 *   - the STATIC line (ports on the fuselage side) carries the outside air pressure to all three;
 *   - the PITOT line (tube under the wing, facing forward) carries outside pressure PLUS the ram
 *     pressure of the airflow to the airspeed indicator only.
 *
 * Blockages are modelled by trapping the pressure that was in the line when it blocked — exactly
 * what happens in the aircraft — and the classic symptoms follow by themselves:
 *   - pitot tube AND its drain blocked (e.g. ice): the airspeed indicator now compares a trapped
 *     pressure with the changing static pressure, so it behaves like an altimeter: it reads
 *     higher as you climb and lower as you descend, whatever the real speed;
 *   - static port blocked: the altimeter freezes, the vertical speed indicator returns to zero and
 *     the airspeed indicator reads too low above the altitude of the blockage, too high below it.
 */
import { STD_INHG, clamp, indicatedAltitudeFt, pressureAltitudeFt } from "@/core/math";
import type { SimState } from "@/core/types";
import { impactPressureInHg, kcasFromImpactPressure, kcasToKias, needleFromKias } from "./airspeed";

const ASI_LAG_S = 0.25;
const ASI_MAX_KT = 220;
const ALT_LAG_S = 0.2;
/** Friction in the altimeter mechanism, ft: the needles do not follow the last few feet of a change. Engine vibration shakes most of it out. */
const ALT_FRICTION_RUNNING_FT = 2;
const ALT_FRICTION_STOPPED_FT = 8;
const ALT_MIN_FT = -1000;
const ALT_MAX_FT = 30000;
const KOLLSMAN_MIN_INHG = 27.5;
const KOLLSMAN_MAX_INHG = 31.5;
/** The VSI case fills/empties through a calibrated leak with this time constant, s … */
const VSI_LEAK_S = 2.2;
/** … and the needle mechanism adds a little more. Together: about 6–9 s to settle on a new rate. */
const VSI_NEEDLE_S = 0.5;
export const VSI_LIMIT_FPM = 2000;
/** Brief wrong-way kick when the nose is moved abruptly, fpm per (°/s) of sudden pitch rate. */
const VSI_KICK_GAIN = 12;

export class PitotStatic {
  /** Top of the airspeed dial of the aircraft being flown, kt (the needle stops there). */
  asiMaxKt = ASI_MAX_KT;
  /** Apply the Cessna 172P's published airspeed calibration (position error); other aircraft read calibrated airspeed. */
  calibrated = true;
  private kias(kcas: number, flapsDeg: number): number {
    return this.calibrated ? kcasToKias(kcas, flapsDeg) : Math.max(0, kcas);
  }

  ias = 0;
  alt = 0;
  vs = 0;
  /** Pressures actually present in the two lines, inHg. */
  private staticLine = STD_INHG;
  private pitotLine = STD_INHG;
  /** Pressure altitude the altimeter mechanism has followed to (after friction and lag), ft. */
  private altMech = 0;
  /** Pressure altitude "inside the VSI case" (lags behind through the leak), ft. */
  private vsiCase = 0;
  private kickFast = 0;
  private kickSlow = 0;

  reset(s: SimState, kollsmanInHg: number): void {
    this.staticLine = s.staticPressureInHg;
    this.pitotLine = s.staticPressureInHg + impactPressureInHg(s.kcas);
    const hp = pressureAltitudeFt(this.staticLine);
    this.altMech = hp;
    // Start the VSI case where it would be in the present steady climb or descent, so the needle is already settled.
    const vsNow = s.onGround ? 0 : clamp(s.vsFpm, -VSI_LIMIT_FPM, VSI_LIMIT_FPM);
    this.vsiCase = hp - (vsNow / 60) * VSI_LEAK_S;
    this.vs = vsNow;
    this.kickFast = this.kickSlow = s.pitchRate;
    this.ias = needleFromKias(this.kias(s.kcas, s.flapsDeg));
    this.alt = this.indicated(kollsmanInHg);
  }

  private indicated(kollsmanInHg: number): number {
    const setting = clamp(Number.isFinite(kollsmanInHg) ? kollsmanInHg : STD_INHG, KOLLSMAN_MIN_INHG, KOLLSMAN_MAX_INHG);
    // Pressure altitude from the static line, corrected by the Kollsman setting (1 inHg ≈ 1,000 ft),
    // plus whatever the mechanism has not yet followed (friction, lag).
    const exact = indicatedAltitudeFt(this.staticLine, setting);
    const lagFt = this.altMech - pressureAltitudeFt(this.staticLine);
    return clamp(exact + lagFt, ALT_MIN_FT, ALT_MAX_FT);
  }

  step(dt: number, s: SimState, kollsmanInHg: number, pitotBlocked: boolean, staticBlocked: boolean, engineRunning: boolean): void {
    // ---- the air lines
    const ps = s.staticPressureInHg;
    const total = ps + impactPressureInHg(s.kcas);
    if (!staticBlocked) this.staticLine = ps; // open: follows the outside pressure
    if (!pitotBlocked) this.pitotLine = total; // open: outside pressure + ram pressure
    // (when blocked the last value simply stays trapped)

    // ---- airspeed indicator: a gauge of (pitot line − static line), scale drawn in knots
    const sensedKcas = kcasFromImpactPressure(this.pitotLine - this.staticLine);
    const needle = Math.min(this.asiMaxKt, needleFromKias(this.kias(sensedKcas, s.flapsDeg)));
    this.ias += ((needle - this.ias) * dt) / (ASI_LAG_S + dt);
    if (this.ias < 1e-3 && needle === 0) this.ias = 0;

    // ---- altimeter: an aneroid capsule measuring the static line
    const hp = pressureAltitudeFt(this.staticLine);
    const friction = engineRunning ? ALT_FRICTION_RUNNING_FT : ALT_FRICTION_STOPPED_FT;
    let want = this.altMech;
    if (hp - want > friction) want = hp - friction;
    else if (want - hp > friction) want = hp + friction;
    this.altMech += ((want - this.altMech) * dt) / (ALT_LAG_S + dt);
    this.alt = this.indicated(kollsmanInHg);

    // ---- vertical speed indicator: pressure difference across a calibrated leak
    this.vsiCase += ((hp - this.vsiCase) * dt) / VSI_LEAK_S;
    let raw = ((hp - this.vsiCase) / VSI_LEAK_S) * 60;
    // abrupt pitch changes disturb the airflow over the static ports for a moment
    this.kickFast += ((s.pitchRate - this.kickFast) * dt) / (0.15 + dt);
    this.kickSlow += ((s.pitchRate - this.kickSlow) * dt) / (1.2 + dt);
    if (!staticBlocked && !s.onGround) raw -= VSI_KICK_GAIN * clamp(this.kickFast - this.kickSlow, -12, 12);
    raw = clamp(raw, -VSI_LIMIT_FPM, VSI_LIMIT_FPM);
    this.vs += ((raw - this.vs) * dt) / (VSI_NEEDLE_S + dt);
    if (Math.abs(this.vs) < 1e-3 && Math.abs(raw) < 1e-3) this.vs = 0;
  }
}
