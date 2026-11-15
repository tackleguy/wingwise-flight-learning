/**
 * Motion of the aircraft as the instruments feel it, worked out once per physics step and shared
 * by the gyros, the compass and the fuel gauges.
 *
 * Everything is expressed in the local north / east / down frame ("NED"), which is treated as
 * fixed in space (the slow turning of the Earth is added separately where it matters — the
 * heading indicator).
 *
 *  - body axes: where the nose (x), right wing (y) and floor (z) point;
 *  - angular velocity of the airframe;
 *  - "apparent gravity": real gravity minus the aircraft's acceleration. This is the direction a
 *    plumb line, the slip ball, the fuel in the tanks, the compass card and the erecting vanes of
 *    the attitude gyro all take for "down". In steady straight flight it IS down; in a turn or
 *    while speeding up it is not — which is the root of most classic instrument errors.
 */
import { D2R, FPS_PER_KT } from "@/core/math";
import type { SimState } from "@/core/types";

export const G0_FPS2 = 32.174;
const ACCEL_FILTER_S = 0.05;
const MAX_ACCEL_FPS2 = 6 * G0_FPS2;

export class Kinematics {
  // body axes in NED (unit vectors)
  xN = 1;
  xE = 0;
  xD = 0;
  yN = 0;
  yE = 1;
  yD = 0;
  zN = 0;
  zE = 0;
  zD = 1;
  /** Angular velocity of the airframe in NED, rad/s. */
  wN = 0;
  wE = 0;
  wD = 0;
  /** Apparent gravity (gravity minus acceleration) in NED, ft/s². */
  gN = 0;
  gE = 0;
  gD = G0_FPS2;
  /** Apparent gravity resolved along the body axes, in g: forward, right, down (1 = normal weight). */
  bodyX = 0;
  bodyY = 0;
  bodyZ = 1;

  private pvN = 0;
  private pvE = 0;
  private pvD = 0;
  private aN = 0;
  private aE = 0;
  private aD = 0;

  /** Body axes for the current attitude (no history involved). */
  setAxes(s: SimState): void {
    const psi = s.headingTrue * D2R;
    const th = s.pitch * D2R;
    const ph = s.roll * D2R;
    const cps = Math.cos(psi);
    const sps = Math.sin(psi);
    const cth = Math.cos(th);
    const sth = Math.sin(th);
    const cph = Math.cos(ph);
    const sph = Math.sin(ph);
    this.xN = cth * cps;
    this.xE = cth * sps;
    this.xD = -sth;
    this.yN = sph * sth * cps - cph * sps;
    this.yE = sph * sth * sps + cph * cps;
    this.yD = sph * cth;
    this.zN = cph * sth * cps + sph * sps;
    this.zE = cph * sth * sps - sph * cps;
    this.zD = cph * cth;
  }

  /** Forget the motion history (after a reposition): the aircraft is taken to be unaccelerated. */
  reset(s: SimState): void {
    this.setAxes(s);
    this.pvN = s.vNorthKt * FPS_PER_KT;
    this.pvE = s.vEastKt * FPS_PER_KT;
    this.pvD = -s.vsFpm / 60;
    this.aN = this.aE = this.aD = 0;
    this.wN = this.wE = this.wD = 0;
    this.gN = 0;
    this.gE = 0;
    this.gD = G0_FPS2;
    this.resolveBody();
  }

  update(s: SimState, dt: number): void {
    this.setAxes(s);
    const p = s.rollRate * D2R;
    const q = s.pitchRate * D2R;
    const r = s.yawRate * D2R;
    this.wN = p * this.xN + q * this.yN + r * this.zN;
    this.wE = p * this.xE + q * this.yE + r * this.zE;
    this.wD = p * this.xD + q * this.yD + r * this.zD;

    // Acceleration over the ground = change of velocity per second (lightly smoothed).
    const vN = s.vNorthKt * FPS_PER_KT;
    const vE = s.vEastKt * FPS_PER_KT;
    const vD = -s.vsFpm / 60;
    if (dt > 0) {
      const k = dt / (ACCEL_FILTER_S + dt);
      this.aN += (limit((vN - this.pvN) / dt) - this.aN) * k;
      this.aE += (limit((vE - this.pvE) / dt) - this.aE) * k;
      this.aD += (limit((vD - this.pvD) / dt) - this.aD) * k;
    }
    if (Math.abs(this.aN) < 1e-9) this.aN = 0;
    if (Math.abs(this.aE) < 1e-9) this.aE = 0;
    if (Math.abs(this.aD) < 1e-9) this.aD = 0;
    this.pvN = vN;
    this.pvE = vE;
    this.pvD = vD;
    this.gN = -this.aN;
    this.gE = -this.aE;
    this.gD = G0_FPS2 - this.aD;
    this.resolveBody();
  }

  private resolveBody(): void {
    this.bodyX = (this.gN * this.xN + this.gE * this.xE + this.gD * this.xD) / G0_FPS2;
    this.bodyY = (this.gN * this.yN + this.gE * this.yE + this.gD * this.yD) / G0_FPS2;
    this.bodyZ = (this.gN * this.zN + this.gE * this.zE + this.gD * this.zD) / G0_FPS2;
  }
}

function limit(a: number): number {
  if (!Number.isFinite(a)) return 0;
  return a > MAX_ACCEL_FPS2 ? MAX_ACCEL_FPS2 : a < -MAX_ACCEL_FPS2 ? -MAX_ACCEL_FPS2 : a;
}
