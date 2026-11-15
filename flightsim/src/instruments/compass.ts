/**
 * The magnetic compass ("whiskey compass"): a magnetised card floating in liquid, hanging from a
 * pivot like a pendulum.
 *
 * The model follows the real mechanism instead of applying error formulas:
 *
 *  1. The card hangs level with respect to APPARENT gravity (gravity minus the aircraft's
 *     acceleration). In a coordinated turn the card therefore banks with the aircraft; while
 *     speeding up it tips nose-down, while slowing it tips nose-up.
 *  2. The card's magnets line up with whatever part of the Earth's magnetic field lies in the
 *     plane of the card. The field does not run level: away from the magnetic equator it dips
 *     steeply into the ground (about 60–70° over the USA and Europe, pointing down toward north).
 *     While the card is level only the level part of the field matters and the compass is correct.
 *     When the card tilts, part of the strong vertical field comes into its plane and pulls the
 *     north-seeking end toward the low side.
 *
 * Those two facts produce the textbook errors by themselves:
 *   - northerly turning error (northern hemisphere): rolling into a turn from north the compass
 *     first shows a turn the WRONG way and then lags; from south it leads ("UNOS": Undershoot
 *     North, Overshoot South);
 *   - acceleration error on easterly/westerly headings ("ANDS": Accelerate North, Decelerate South);
 *   - both reverse in the southern hemisphere and vanish at the magnetic equator.
 * On top of that the card has inertia and swings in its liquid, is dragged a little by the liquid
 * swirling in a turn, and jams against the case if the aircraft is tilted too far.
 *
 * The compass is only accurate in straight, level, unaccelerated flight.
 */
import { D2R, R2D, norm360 } from "@/core/math";
import type { Kinematics } from "./kinematics";

/** Horizontal field strength at which the card has its nominal swing period, nT (typical mid-latitude value). */
const H_REF_NT = 24000;
/** Card swinging round to north: natural frequency (rad/s, about a 3.5 s period) and damping ratio in the liquid. */
const CARD_FREQ = 1.8;
const CARD_DAMPING = 0.5;
/** Pendulum swing of the card assembly (tilt): natural frequency, rad/s, and damping ratio. */
const TILT_FREQ = 5;
const TILT_DAMPING = 0.45;
/** The liquid picks up the rotation of the case in a sustained turn with this time constant, s … */
const SWIRL_TIME_S = 3;
/** … and this fraction of the card's damping acts relative to the swirling liquid. */
const SWIRL_COUPLING = 0.6;
/** The card can tilt this far inside the bowl before it touches and drags, degrees. */
export const COMPASS_TILT_LIMIT_DEG = 18;
const TILT_LIMIT_COS = Math.cos(COMPASS_TILT_LIMIT_DEG * D2R);
const TILT_LIMIT_SIN = Math.sin(COMPASS_TILT_LIMIT_DEG * D2R);
const DRAG_RATE = 6; // 1/s — how firmly a touching card is dragged round with the case

/**
 * Deviation: the small error left over from the aircraft's own magnetism after the compass has been
 * "swung" (adjusted). Fixed for this aircraft; this is what a compass correction card lists.
 * Returns compass reading minus magnetic heading, degrees (at most about 1.8°).
 */
export function compassDeviation(magneticHeadingDeg: number): number {
  const h = magneticHeadingDeg * D2R;
  return 0.3 + 1.2 * Math.sin(h) - 0.8 * Math.cos(h);
}

export class MagneticCompass {
  /** Card "up" direction (normal of the card), NED unit vector, and its rate of change. */
  private nN = 0;
  private nE = 0;
  private nD = -1;
  private vN = 0;
  private vE = 0;
  private vD = 0;
  /** Direction of the card's north mark, NED unit vector lying in the card plane. */
  private cN = 1;
  private cE = 0;
  private cD = 0;
  /** Spin of the card about its own normal, rad/s (+ = anticlockwise seen from above), and of the liquid. */
  private w = 0;
  private wFluid = 0;
  /** Local magnetic field, NED, nanotesla. */
  private bN = H_REF_NT;
  private bE = 0;
  private bD = 0;
  /** Compass reading, degrees. */
  reading = 0;
  /** True while the card is jammed against the bowl (aircraft tilted too far for the compass). */
  dragging = false;

  /** Set the local field: declination (east +), dip (down +) in degrees and horizontal strength in nT. */
  setField(declDeg: number, inclDeg: number, horizNt: number): void {
    const h = Math.max(500, horizNt);
    const incl = Math.max(-89, Math.min(89, inclDeg));
    this.bN = h * Math.cos(declDeg * D2R);
    this.bE = h * Math.sin(declDeg * D2R);
    this.bD = h * Math.tan(incl * D2R);
  }

  /** Let the card come to rest for the current attitude (used at spawn): level and pointing at magnetic north. */
  settle(k: Kinematics): void {
    this.nN = 0;
    this.nE = 0;
    this.nD = -1;
    this.vN = this.vE = this.vD = 0;
    this.w = 0;
    this.wFluid = 0;
    const h = Math.hypot(this.bN, this.bE) || 1;
    this.cN = this.bN / h;
    this.cE = this.bE / h;
    this.cD = 0;
    this.dragging = false;
    this.readOut(k);
  }

  step(dt: number, k: Kinematics): void {
    // ---- 1. where the card wants to hang: square to apparent gravity, but only as far as the bowl allows
    const gMag = Math.hypot(k.gN, k.gE, k.gD);
    let tN = this.nN;
    let tE = this.nE;
    let tD = this.nD;
    if (gMag > 1.5) {
      tN = -k.gN / gMag;
      tE = -k.gE / gMag;
      tD = -k.gD / gMag;
    }
    // body "up" is −z
    const uN = -k.zN;
    const uE = -k.zE;
    const uD = -k.zD;
    const cosTilt = tN * uN + tE * uE + tD * uD;
    this.dragging = cosTilt < TILT_LIMIT_COS;
    if (this.dragging) {
      let pN = tN - cosTilt * uN;
      let pE = tE - cosTilt * uE;
      let pD = tD - cosTilt * uD;
      const pm = Math.hypot(pN, pE, pD);
      if (pm > 1e-9) {
        pN /= pm;
        pE /= pm;
        pD /= pm;
        tN = uN * TILT_LIMIT_COS + pN * TILT_LIMIT_SIN;
        tE = uE * TILT_LIMIT_COS + pE * TILT_LIMIT_SIN;
        tD = uD * TILT_LIMIT_COS + pD * TILT_LIMIT_SIN;
      } else {
        tN = uN;
        tE = uE;
        tD = uD;
      }
    }

    // ---- 2. pendulum swing of the card toward that position (damped by the liquid)
    const stiff = this.dragging ? 4 : 1; // a card resting on the bowl follows the case firmly
    const kp = TILT_FREQ * TILT_FREQ * stiff;
    const kd = 2 * TILT_DAMPING * TILT_FREQ * stiff;
    this.vN += (kp * (tN - this.nN) - kd * this.vN) * dt;
    this.vE += (kp * (tE - this.nE) - kd * this.vE) * dt;
    this.vD += (kp * (tD - this.nD) - kd * this.vD) * dt;
    let nN = this.nN + this.vN * dt;
    let nE = this.nE + this.vE * dt;
    let nD = this.nD + this.vD * dt;
    const nm = Math.hypot(nN, nE, nD) || 1;
    nN /= nm;
    nE /= nm;
    nD /= nm;
    // keep the tilt velocity tangent to the unit sphere
    const vAlong = this.vN * nN + this.vE * nE + this.vD * nD;
    this.vN -= vAlong * nN;
    this.vE -= vAlong * nE;
    this.vD -= vAlong * nD;
    this.nN = nN;
    this.nE = nE;
    this.nD = nD;

    // ---- 3. carry the north mark along with the tilting card (no twist), keeping it in the card plane
    let cN = this.cN;
    let cE = this.cE;
    let cD = this.cD;
    const cAlong = cN * nN + cE * nE + cD * nD;
    cN -= cAlong * nN;
    cE -= cAlong * nE;
    cD -= cAlong * nD;
    let cm = Math.hypot(cN, cE, cD);
    if (cm < 1e-9) {
      // degenerate (cannot happen in normal use): pick any direction in the plane
      cN = nD;
      cE = 0;
      cD = -nN;
      cm = Math.hypot(cN, cE, cD) || 1;
    }
    cN /= cm;
    cE /= cm;
    cD /= cm;

    // ---- 4. magnetic pull: toward the part of the field that lies in the card plane
    const bAlong = this.bN * nN + this.bE * nE + this.bD * nD;
    const pN = this.bN - bAlong * nN;
    const pE = this.bE - bAlong * nE;
    const pD = this.bD - bAlong * nD;
    // (c × p) · n = |p| sin(angle from the north mark to the in-plane field, anticlockwise from above)
    const crossN = cE * pD - cD * pE;
    const crossE = cD * pN - cN * pD;
    const crossD = cN * pE - cE * pN;
    const pullSin = (crossN * nN + crossE * nE + crossD * nD) / H_REF_NT;

    // ---- 5. the liquid: it damps the card, and in a sustained turn it starts to swirl with the case
    const caseSpin = k.wN * nN + k.wE * nE + k.wD * nD;
    this.wFluid += ((caseSpin - this.wFluid) * dt) / SWIRL_TIME_S;
    let acc = CARD_FREQ * CARD_FREQ * pullSin - 2 * CARD_DAMPING * CARD_FREQ * (this.w - SWIRL_COUPLING * this.wFluid);
    if (this.dragging) acc -= DRAG_RATE * (this.w - caseSpin);
    this.w += acc * dt;
    if (Math.abs(this.w) < 1e-9 && Math.abs(pullSin) < 1e-9) this.w = 0;
    if (Math.abs(this.wFluid) < 1e-9 && Math.abs(caseSpin) < 1e-9) this.wFluid = 0;
    const a = this.w * dt;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    // rotate the north mark about the card normal: c·cos + (n × c)·sin
    const rN = nE * cD - nD * cE;
    const rE = nD * cN - nN * cD;
    const rD = nN * cE - nE * cN;
    this.cN = cN * ca + rN * sa;
    this.cE = cE * ca + rE * sa;
    this.cD = cD * ca + rD * sa;

    this.readOut(k);
  }

  /** Read the card against the lubber line (the aircraft's nose), then add the fixed deviation. */
  private readOut(k: Kinematics): void {
    const nN = this.nN;
    const nE = this.nE;
    const nD = this.nD;
    const along = k.xN * nN + k.xE * nE + k.xD * nD;
    const xN = k.xN - along * nN;
    const xE = k.xE - along * nE;
    const xD = k.xD - along * nD;
    // heading = angle from the north mark to the nose, clockwise seen from above (about "down" = −n)
    const crossN = this.cE * xD - this.cD * xE;
    const crossE = this.cD * xN - this.cN * xD;
    const crossD = this.cN * xE - this.cE * xN;
    const sin = -(crossN * nN + crossE * nE + crossD * nD);
    const cos = this.cN * xN + this.cE * xE + this.cD * xD;
    if (sin === 0 && cos === 0) return; // nose exactly along the card normal: keep the last reading
    const magnetic = Math.atan2(sin, cos) * R2D;
    this.reading = norm360(magnetic + compassDeviation(magnetic));
  }
}
