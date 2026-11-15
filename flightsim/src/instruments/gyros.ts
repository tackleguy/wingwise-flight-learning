/**
 * The three gyroscopic instruments.
 *
 *  - Attitude indicator: suction-driven gyro with a vertical spin axis. It stays rigid in space and
 *    is slowly pulled toward "apparent gravity" by its erecting vanes — so it is right in steady
 *    flight, picks up small errors in long turns and accelerations, tumbles when a gimbal hits its
 *    stop, and slowly falls over when the suction is lost.
 *  - Heading indicator (directional gyro): suction-driven gyro with a horizontal spin axis. It
 *    does NOT know where north is. It only remembers a direction in space, and that memory drifts
 *    (the Earth turns under it; bearings are not perfect), so the pilot resets it to the compass.
 *  - Turn coordinator: electric gyro whose axis is tilted up 30° at the front, so it feels roll as
 *    well as yaw; a spring holds it, so the needle shows RATE of turn.
 *
 * All original work; the numbers are typical textbook values for older (1970s–80s) instruments.
 */
import { D2R, R2D, clamp, norm180, norm360, smoothstep } from "@/core/math";
import type { SimState } from "@/core/types";
import type { Kinematics } from "./kinematics";
import { randRange, randSign } from "./rng";

/** Suction at and above which the vacuum gyros run at full speed, inHg (the gauge's green arc is about 4.5–5.4). */
export const SUCTION_FULL_INHG = 3.8;

/** Rotor speed (0–1 of normal) a vacuum gyro settles at for a given suction. */
export function rotorTarget(suctionInHg: number): number {
  return Math.sqrt(clamp(suctionInHg / SUCTION_FULL_INHG, 0, 1));
}

const VAC_SPINUP_S = 75; // time constant; a vacuum gyro needs a few minutes to reach full speed
const VAC_SPINDOWN_S = 150; // …and coasts for many minutes when the suction is lost
/**
 * "Unreliable" flag of the vacuum gyros. A gyro that is spinning UP is flagged until it reaches 70 %
 * of normal speed; a gyro that was running is flagged only once it has fallen below 45 % — about
 * two minutes after a total loss of suction, when its error is already several degrees. (Real
 * instruments of this age have no flag at all: the pilot has to notice the suction gauge.)
 */
const VAC_FLAG_CLEAR_SPEED = 0.7;
const VAC_FLAG_SET_SPEED = 0.45;
const vacFlag = (flagged: boolean, speed: number) => (flagged ? speed < VAC_FLAG_CLEAR_SPEED : speed < VAC_FLAG_SET_SPEED);

// ================================================================= attitude indicator

/** Old-style gimbal limits: beyond these the gyro tumbles. */
export const AI_PITCH_LIMIT_DEG = 62;
export const AI_ROLL_LIMIT_DEG = 102;
/** Erection: how fast the vanes pull the gyro toward apparent gravity, °/s (3° per minute). */
const AI_ERECT_RATE = 0.05;
/** Inside this error the erection rate falls off in proportion (the vanes are only partly open). */
const AI_ERECT_LINEAR_DEG = 1.5;
const AI_ERECT_MAX_RATE = 0.5;
/** Drift of a gyro that is running down without suction, °/s at half speed. */
const AI_RUNDOWN_DRIFT = 0.06;
const AI_TUMBLE_MIN_S = 3;
const WOBBLE_BELOW_SPEED = 0.6;

export class AttitudeGyro {
  /** Direction the gyro believes is "down" (its spin axis), in NED. */
  private gN = 0;
  private gE = 0;
  private gD = 1;
  speed = 1;
  pitch = 0;
  roll = 0;
  flag = false;
  tumbling = false;
  private tumbleT = 0;
  private tumbleRate = 0;
  private axX = 0;
  private axY = 0;
  private axZ = 0;
  private driftAz = 0;
  private driftTurn = 0;
  private wobble = 0;
  private rng: () => number = () => 0.5;

  /**
   * Stabilise for a new situation. `running`: the engine (suction) has been on for a while, so the
   * gyro is at speed and upright. Otherwise it is stopped and hangs wherever it came to rest.
   */
  reset(running: boolean, k: Kinematics, rng: () => number): void {
    this.rng = rng;
    this.tumbling = false;
    this.tumbleT = 0;
    this.driftAz = randRange(rng, 0, 2 * Math.PI);
    this.driftTurn = randSign(rng) * randRange(rng, 0.004, 0.012);
    if (running) {
      this.speed = 1;
      this.gN = 0;
      this.gE = 0;
      this.gD = 1;
    } else {
      this.speed = 0;
      // A stopped gyro rests lopsided against its gimbals: a few degrees to a couple of dozen.
      this.setFromGimbals(randSign(rng) * randRange(rng, 4, 14), randSign(rng) * randRange(rng, 8, 28), k);
    }
    this.readOut(k);
    this.flag = this.speed < VAC_FLAG_CLEAR_SPEED;
  }

  /** Point the gyro so that it would display the given pitch and roll right now. */
  private setFromGimbals(pitchDeg: number, rollDeg: number, k: Kinematics): void {
    const th = pitchDeg * D2R;
    const ph = rollDeg * D2R;
    const bx = -Math.sin(th);
    const by = Math.sin(ph) * Math.cos(th);
    const bz = Math.cos(ph) * Math.cos(th);
    this.gN = bx * k.xN + by * k.yN + bz * k.zN;
    this.gE = bx * k.xE + by * k.yE + bz * k.zE;
    this.gD = bx * k.xD + by * k.yD + bz * k.zD;
  }

  private readOut(k: Kinematics): void {
    const bx = this.gN * k.xN + this.gE * k.xE + this.gD * k.xD;
    const by = this.gN * k.yN + this.gE * k.yE + this.gD * k.yD;
    const bz = this.gN * k.zN + this.gE * k.zE + this.gD * k.zD;
    this.pitch = Math.asin(clamp(-bx, -1, 1)) * R2D;
    this.roll = Math.atan2(by, bz) * R2D;
  }

  step(dt: number, k: Kinematics, s: SimState, suctionInHg: number): void {
    // --- rotor speed follows the suction
    const target = rotorTarget(suctionInHg);
    this.speed += ((target - this.speed) * dt) / (target > this.speed ? VAC_SPINUP_S : VAC_SPINDOWN_S);
    this.speed = this.speed < 1e-4 && target === 0 ? 0 : clamp(this.speed, 0, 1);
    const airflow = clamp(suctionInHg / SUCTION_FULL_INHG, 0, 1);
    // A spinning rotor resists being moved ("rigidity in space"); a stopped one is carried along by the airframe.
    const rigidity = smoothstep(0.04, 0.3, this.speed);
    let gN = this.gN;
    let gE = this.gE;
    let gD = this.gD;

    const carry = this.tumbling ? 1 : 1 - rigidity;
    if (carry > 0) {
      const f = carry * dt;
      const cN = k.wE * gD - k.wD * gE;
      const cE = k.wD * gN - k.wN * gD;
      const cD = k.wN * gE - k.wE * gN;
      gN += cN * f;
      gE += cE * f;
      gD += cD * f;
    }

    if (this.tumbling) {
      // A gimbal is against its stop: the gyro is forced and whirls about until it is released.
      this.tumbleT += dt;
      const rate = this.tumbleRate * (0.25 + Math.exp(-this.tumbleT / 1.2)) * D2R * dt;
      const aN = this.axX * k.xN + this.axY * k.yN + this.axZ * k.zN;
      const aE = this.axX * k.xE + this.axY * k.yE + this.axZ * k.zE;
      const aD = this.axX * k.xD + this.axY * k.yD + this.axZ * k.zD;
      const cN = aE * gD - aD * gE;
      const cE = aD * gN - aN * gD;
      const cD = aN * gE - aE * gN;
      gN += cN * rate;
      gE += cE * rate;
      gD += cD * rate;
      const n = Math.hypot(gN, gE, gD) || 1;
      this.gN = gN / n;
      this.gE = gE / n;
      this.gD = gD / n;
      if (this.tumbleT > AI_TUMBLE_MIN_S && Math.abs(s.pitch) < AI_PITCH_LIMIT_DEG - 10 && Math.abs(s.roll) < AI_ROLL_LIMIT_DEG - 12) {
        // Released: the gyro is left leaning well away from upright and must slowly erect again.
        this.tumbling = false;
        const rng = this.rng;
        const showPitch = clamp(s.pitch + randSign(rng) * randRange(rng, 12, 32), -(AI_PITCH_LIMIT_DEG - 4), AI_PITCH_LIMIT_DEG - 4);
        const showRoll = clamp(s.roll + randSign(rng) * randRange(rng, 20, 50), -(AI_ROLL_LIMIT_DEG - 6), AI_ROLL_LIMIT_DEG - 6);
        this.setFromGimbals(showPitch, showRoll, k);
      }
      this.readOut(k);
      this.flag = vacFlag(this.flag, this.speed);
      return;
    }

    // --- erection toward apparent gravity (pendulous vanes steering the exhaust air)
    const gMag = Math.hypot(k.gN, k.gE, k.gD);
    if (airflow > 0 && gMag > 3) {
      const dN = k.gN / gMag;
      const dE = k.gE / gMag;
      const dD = k.gD / gMag;
      const dot = dN * gN + dE * gE + dD * gD;
      let eN = dN - dot * gN;
      let eE = dE - dot * gE;
      let eD = dD - dot * gD;
      const eMag = Math.hypot(eN, eE, eD);
      if (eMag > 1e-7) {
        const errDeg = Math.atan2(eMag, dot) * R2D;
        // The same air jet moves a slow rotor faster (less angular momentum to push against).
        let rate = (AI_ERECT_RATE * Math.min(1, errDeg / AI_ERECT_LINEAR_DEG) * airflow) / Math.max(this.speed * this.speed, 0.01);
        if (rate > AI_ERECT_MAX_RATE) rate = AI_ERECT_MAX_RATE;
        const stepRad = Math.min(rate * dt, errDeg) * D2R;
        eN /= eMag;
        eE /= eMag;
        eD /= eMag;
        gN += eN * stepRad;
        gE += eE * stepRad;
        gD += eD * stepRad;
      }
    }

    // --- running down without suction: bearing friction makes the gyro wander off, faster and faster
    if (airflow < 1 && this.speed > 0.03) {
      const rate = AI_RUNDOWN_DRIFT * clamp(1 / Math.max(this.speed, 0.08) - 1, 0, 12) * (1 - airflow) * D2R * dt;
      if (rate > 0) {
        this.driftAz += this.driftTurn * dt;
        const c = Math.cos(this.driftAz);
        const sn = Math.sin(this.driftAz);
        gN += (c * k.xN + sn * k.yN) * rate;
        gE += (c * k.xE + sn * k.yE) * rate;
        gD += (c * k.xD + sn * k.yD) * rate;
      }
    }

    const n = Math.hypot(gN, gE, gD) || 1;
    this.gN = gN / n;
    this.gE = gE / n;
    this.gD = gD / n;
    this.readOut(k);
    this.flag = vacFlag(this.flag, this.speed);

    // --- gimbal stops
    if (rigidity > 0.5 && (Math.abs(this.pitch) > AI_PITCH_LIMIT_DEG || Math.abs(this.roll) > AI_ROLL_LIMIT_DEG)) {
      const rng = this.rng;
      this.tumbling = true;
      this.tumbleT = 0;
      this.tumbleRate = randSign(rng) * randRange(rng, 140, 260);
      const ax = randRange(rng, -1, 1);
      const ay = randRange(rng, -1, 1);
      const az = randRange(rng, -0.4, 0.4);
      const an = Math.hypot(ax, ay, az) || 1;
      this.axX = ax / an;
      this.axY = ay / an;
      this.axZ = az / an;
      return;
    }

    // --- a rotor that is only just turning wobbles visibly until it has gathered speed
    if (this.speed > 0.01 && this.speed < WOBBLE_BELOW_SPEED) {
      const fade = 1 - this.speed / WOBBLE_BELOW_SPEED;
      const amp = 3.5 * fade * fade * Math.min(1, this.speed / 0.05);
      this.wobble += (4 + 14 * this.speed) * dt;
      if (this.wobble > 6.283185307) this.wobble -= 6.283185307;
      this.pitch = clamp(this.pitch + amp * Math.sin(this.wobble), -90, 90);
      this.roll = norm180(this.roll + amp * Math.cos(this.wobble));
    }
  }
}

// ================================================================= heading indicator

/** Old-style gimbal limit of the directional gyro: beyond this the card spins (tumbles). */
export const DG_GIMBAL_LIMIT_DEG = 55;
/** The Earth turns 360° per sidereal day. */
const EARTH_RATE_DEG_PER_HR = 15.041;
const DG_RUNDOWN_WANDER = 0.05; // °/s at half speed
const DG_TUMBLE_MIN_S = 3.5;

export class DirectionalGyro {
  /** Direction of the spin axis reference, degrees clockwise from true north (fixed in space apart from drift). */
  private az = 0;
  speed = 1;
  /** What the card shows, degrees (the knob rotation is already included). */
  reading = 0;
  flag = false;
  tumbling = false;
  /** Real (mechanical) drift of this particular gyro, °/hour; fixed for a flight. */
  realDriftDegPerHr = 0;
  gimbalError = true;
  private tumbleT = 0;
  private tumbleRate = 0;
  private wanderSign = 1;
  private rng: () => number = () => 0.5;

  reset(running: boolean, rng: () => number): void {
    this.rng = rng;
    this.tumbling = false;
    this.tumbleT = 0;
    this.speed = running ? 1 : 0;
    // 1 to 3.5 degrees per hour either way: a healthy but not perfect gyro.
    this.realDriftDegPerHr = randSign(rng) * randRange(rng, 1, 3.5);
    this.wanderSign = randSign(rng);
    this.az = randRange(rng, 0, 360);
    this.flag = this.speed < VAC_FLAG_CLEAR_SPEED;
  }

  /** What the card would read for a given knob rotation. Also reports the inner-gimbal angle through `gimbalDeg`. */
  private gimbalDeg = 0;
  read(k: Kinematics, s: SimState, adjustDeg: number): number {
    const a = (this.az - adjustDeg) * D2R;
    const sN = Math.cos(a);
    const sE = Math.sin(a);
    const sx = sN * k.xN + sE * k.xE;
    const sy = sN * k.yN + sE * k.yE;
    const sz = sN * k.zN + sE * k.zE;
    this.gimbalDeg = Math.asin(clamp(sz, -1, 1)) * R2D;
    if (!this.gimbalError || (Math.abs(sx) < 1e-6 && Math.abs(sy) < 1e-6)) return norm360(s.headingTrue - this.az + adjustDeg);
    // The card turns about the aircraft's own vertical axis, so in a bank or climb the angle it
    // measures is not quite the heading ("gimbal error", zero on N/E/S/W indications and in level flight).
    return norm360(-Math.atan2(sy, sx) * R2D);
  }

  /** Turn the gyro itself (not the knob) so that the card reads `targetDeg` — used when stabilising at spawn. */
  slaveTo(targetDeg: number, k: Kinematics, s: SimState, adjustDeg: number): void {
    for (let i = 0; i < 4; i++) this.az = norm360(this.az - norm180(targetDeg - this.read(k, s, adjustDeg)));
    this.reading = this.read(k, s, adjustDeg);
  }

  step(dt: number, k: Kinematics, s: SimState, suctionInHg: number, adjustDeg: number): void {
    const target = rotorTarget(suctionInHg);
    this.speed += ((target - this.speed) * dt) / (target > this.speed ? VAC_SPINUP_S : VAC_SPINDOWN_S);
    this.speed = this.speed < 1e-4 && target === 0 ? 0 : clamp(this.speed, 0, 1);
    const airflow = clamp(suctionInHg / SUCTION_FULL_INHG, 0, 1);
    const rigidity = smoothstep(0.04, 0.3, this.speed);

    // --- apparent drift: the Earth (and the aircraft's travel around it) turns under the gyro
    const lat = clamp(s.lat, -89.5, 89.5) * D2R;
    const lonRateDegPerHr = s.vEastKt / (60 * Math.max(0.05, Math.cos(lat)));
    let rate = ((EARTH_RATE_DEG_PER_HR + lonRateDegPerHr) * Math.sin(lat)) / 3600;
    // --- real drift: friction and imbalance, worse as the rotor slows
    rate -= this.realDriftDegPerHr / 3600 / Math.max(this.speed, 0.15);
    if (airflow < 1 && this.speed > 0.03) rate += this.wanderSign * DG_RUNDOWN_WANDER * clamp(1 / Math.max(this.speed, 0.08) - 1, 0, 12) * (1 - airflow);
    // --- a stopped rotor is simply carried round with the aircraft (the card stops showing turns)
    rate += s.turnRate * (1 - rigidity);

    if (this.tumbling) {
      this.tumbleT += dt;
      rate += this.tumbleRate * (0.15 + Math.exp(-this.tumbleT / 1.5));
      if (this.tumbleT > DG_TUMBLE_MIN_S && Math.abs(s.pitch) < DG_GIMBAL_LIMIT_DEG - 8 && Math.abs(s.roll) < DG_GIMBAL_LIMIT_DEG - 8) this.tumbling = false;
    }
    this.az = norm360(this.az + rate * dt);
    this.reading = this.read(k, s, adjustDeg);
    this.flag = vacFlag(this.flag, this.speed);

    if (!this.tumbling && rigidity > 0.5 && Math.abs(this.gimbalDeg) > DG_GIMBAL_LIMIT_DEG) {
      this.tumbling = true;
      this.tumbleT = 0;
      this.tumbleRate = randSign(this.rng) * randRange(this.rng, 180, 320);
    }
  }
}

// ================================================================= turn coordinator

/** The gyro's sensitive axis is tilted up 30° at the front, so it responds to roll as well as yaw. */
const TC_CANT = 30 * D2R;
const TC_COS = Math.cos(TC_CANT);
const TC_SIN = Math.sin(TC_CANT);
/**
 * Calibration: the needle shows 1.0 in a level, coordinated standard-rate turn (3°/s) at about
 * 100 kt true airspeed, where the bank is about 15° and the yaw rate felt by the airframe is 3°/s × cos 15°.
 */
const TC_UNIT = 3 * TC_COS * Math.cos(15.4 * D2R);
const TC_NATURAL_FREQ = 4.5; // rad/s — gives a lag of about half a second
const TC_DAMPING = 0.75;
const TC_STOP = 2.2;
const TC_SPINUP_S = 6;
const TC_SPINDOWN_S = 25;

export class TurnCoordinator {
  speed = 1;
  rate = 0;
  flag = false;
  private vel = 0;

  reset(powered: boolean): void {
    this.speed = powered ? 1 : 0;
    this.rate = 0;
    this.vel = 0;
    this.flag = !powered;
  }

  step(dt: number, s: SimState, powered: boolean): void {
    const target = powered ? 1 : 0;
    this.speed += ((target - this.speed) * dt) / (powered ? TC_SPINUP_S : TC_SPINDOWN_S);
    this.speed = this.speed < 1e-4 && !powered ? 0 : clamp(this.speed, 0, 1);
    // Precession of the gyro against its spring: proportional to rotor speed and to the turn felt about the canted axis.
    const want = ((s.yawRate * TC_COS + s.rollRate * TC_SIN) / TC_UNIT) * this.speed;
    const acc = TC_NATURAL_FREQ * TC_NATURAL_FREQ * (want - this.rate) - 2 * TC_DAMPING * TC_NATURAL_FREQ * this.vel;
    this.vel += acc * dt;
    this.rate += this.vel * dt;
    if (Math.abs(this.rate) < 1e-6 && Math.abs(this.vel) < 1e-6 && Math.abs(want) < 1e-6) this.rate = this.vel = 0;
    if (this.rate > TC_STOP) {
      this.rate = TC_STOP;
      if (this.vel > 0) this.vel = 0;
    } else if (this.rate < -TC_STOP) {
      this.rate = -TC_STOP;
      if (this.vel < 0) this.vel = 0;
    }
    // The red flag shows whenever the instrument has no power or its rotor is still too slow to trust.
    this.flag = !powered || this.speed < 0.7;
  }
}

// ================================================================= inclinometer (the ball)

/** Tilt of apparent gravity that puts the ball at the end of the tube, degrees. */
export const BALL_FULL_SCALE_DEG = 10;
const BALL_NATURAL_FREQ = 8; // rad/s (a ball in a curved glass tube of about 14 cm radius)
const BALL_DAMPING = 0.9; // the tube is filled with damping fluid

export class SlipBall {
  pos = 0;
  private vel = 0;

  reset(): void {
    this.pos = 0;
    this.vel = 0;
  }

  /** `ny`: sideways force felt in the cabin toward the right wing, g; `nz`: load factor, g. */
  step(dt: number, ny: number, nz: number): void {
    // The ball rolls to where apparent gravity points: away from the sideways push of the airframe.
    const tiltDeg = Math.atan2(-ny, Math.max(nz, 0.05)) * R2D;
    const want = clamp(tiltDeg / BALL_FULL_SCALE_DEG, -1.3, 1.3);
    const acc = BALL_NATURAL_FREQ * BALL_NATURAL_FREQ * (want - this.pos) - 2 * BALL_DAMPING * BALL_NATURAL_FREQ * this.vel;
    this.vel += acc * dt;
    this.pos += this.vel * dt;
    if (Math.abs(this.pos) < 1e-6 && Math.abs(this.vel) < 1e-6 && Math.abs(want) < 1e-6) this.pos = this.vel = 0;
    if (this.pos > 1) {
      this.pos = 1;
      if (this.vel > 0) this.vel = 0;
    } else if (this.pos < -1) {
      this.pos = -1;
      if (this.vel < 0) this.vel = 0;
    }
  }
}
