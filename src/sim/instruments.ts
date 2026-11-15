/**
 * Mechanical ("steam gauge") instrument models: gyros, compass, turn coordinator and VSI.
 *
 * The instrument BEHAVIOURS here follow the well-documented physics of real instruments and the
 * models used by the open-source FlightGear simulator (https://github.com/FlightGear/flightgear,
 * src/Instrumentation) as an engineering reference: gyro spin-up/spin-down, attitude-indicator
 * tumble and re-erection, heading-indicator precession, the magnetic compass dip/turning/
 * acceleration errors and the canted turn-coordinator gyro. This is an independent TypeScript
 * implementation for SkyReady — no FlightGear source code is included.
 */
import { clamp, norm180, norm360, toDeg, toRad } from "@/lib/geo";

/** Exponential low-pass step toward `target`; `k` is the fraction moved this step (0..1). */
function lowPass(current: number, target: number, k: number) {
  return current + (target - current) * clamp(k, 0, 1);
}

/** A gyro rotor: spins up when powered, slowly winds down when power is lost. */
export class Gyro {
  /** 0 = stopped, 1 = full operating speed */
  spin = 1;
  constructor(
    /** seconds to spin up from rest at full power */
    private readonly spinUpSec: number,
    /** seconds to wind down from full speed with no power */
    private readonly spinDownSec: number,
  ) {}

  update(dt: number, power: number, serviceable = true) {
    const p = clamp(power, 0, 1);
    this.spin -= dt / this.spinDownSec;
    if (serviceable && this.spin < p)
      this.spin = Math.min(p, this.spin + dt / this.spinDownSec + (p * dt) / this.spinUpSec);
    if (!serviceable) this.spin = 0;
    this.spin = clamp(this.spin, 0, 1);
  }
}

export interface InstrumentInputs {
  pitch: number;
  bank: number;
  /** True magnetic heading the aircraft is pointing (deg) */
  headingMag: number;
  rollRate: number;
  /** Heading rate, deg/s */
  turnRate: number;
  /** Inclinometer input −1..1 */
  slip: number;
  tasKt: number;
  onGround: boolean;
  /** Engine-driven vacuum available 0..1 (0 when the pump or engine fails) */
  vacuumPower: number;
  /** Electrical bus power available 0..1 */
  electricPower: number;
  /** Local magnetic dip angle (deg, down positive). ~60° over the continental US. */
  dipDeg: number;
}

/** State of the classic six-pack + compass, updated every simulation step. */
export class SteamInstruments {
  readonly aiGyro = new Gyro(4, 180);
  readonly hiGyro = new Gyro(4, 180);
  /** Turn coordinators are usually electric. */
  readonly tcGyro = new Gyro(3, 60);

  aiPitch = 0;
  aiRoll = 0;
  /** −1..1 tumble after exceeding the gyro's attitude limits; re-erects slowly */
  tumble = 0;

  /** Heading indicator gyro heading before drift, and the accumulated precession drift */
  private hiRaw = 0;
  hiDrift = 0;

  /** Turn coordinator in standard-rate units (1 = 3°/s) */
  tcRate = 0;
  ball = 0;

  compass = 0;
  private compassRate = 0;
  private lastTas = 0;

  vsi = 0;

  reset(i: InstrumentInputs) {
    this.aiPitch = i.pitch;
    this.aiRoll = i.bank;
    this.tumble = 0;
    this.hiRaw = i.headingMag;
    this.hiDrift = 0;
    this.compass = i.headingMag;
    this.compassRate = 0;
    this.lastTas = i.tasKt;
    this.tcRate = 0;
  }

  /** Re-align the heading indicator with the magnetic compass (the "sync" / caging knob). */
  syncHeadingIndicator() {
    this.hiDrift = norm180(this.compass - this.hiRaw);
  }

  get headingIndicator() {
    return norm360(this.hiRaw + this.hiDrift);
  }

  update(dt: number, i: InstrumentInputs, vsTrueFpm: number) {
    // ---------- attitude indicator (vacuum gyro)
    this.aiGyro.update(dt, i.vacuumPower);
    const aiSpin = this.aiGyro.spin;
    // A slowing rotor follows the aircraft less and less (responsiveness ~ spin^6).
    const responsiveness = aiSpin ** 6;
    if (Math.abs(i.bank) > 100 || Math.abs(i.pitch) > 60) {
      const over = Math.max((Math.abs(i.bank) - 100) / 60, (Math.abs(i.pitch) - 60) / 30, 0);
      const t = clamp(over * over, 0, 1) * Math.sign(i.bank || 1);
      if (Math.abs(t) > Math.abs(this.tumble)) this.tumble = t;
    }
    // Re-erection takes about 5 minutes.
    const step = dt / 300;
    this.tumble = Math.abs(this.tumble) < step ? 0 : this.tumble - Math.sign(this.tumble) * step;
    const k = responsiveness * dt * 60;
    this.aiRoll = lowPass(this.aiRoll, i.bank + this.tumble * 45, k);
    this.aiPitch = lowPass(this.aiPitch, i.pitch, k);

    // ---------- heading indicator (vacuum gyro): follows heading, precesses ~15°/hour
    this.hiGyro.update(dt, i.vacuumPower);
    const hiSpin = this.hiGyro.spin;
    const target = this.hiRaw + norm180(i.headingMag - this.hiRaw);
    this.hiRaw = norm360(lowPass(this.hiRaw, target, dt * 100 * hiSpin ** 6));
    this.hiDrift = norm180(
      this.hiDrift - dt * (0.25 / 60) * (hiSpin > 0.95 ? 1 : 1 + (1 - hiSpin) * 20),
    );

    // ---------- turn coordinator (electric, canted gyro senses roll AND yaw)
    this.tcGyro.update(dt, i.electricPower);
    const tcSpin = this.tcGyro.spin;
    let rate = clamp(i.rollRate / 20 + i.turnRate / 3, -2.5, 2.5);
    const factor = 1 - (1 - tcSpin) ** 3;
    rate = -2.5 + factor * (rate + 2.5); // an unpowered TC sags to one side
    this.tcRate = lowPass(this.tcRate, rate, dt * 4);
    this.ball = lowPass(this.ball, i.slip, dt * 3);

    // ---------- magnetic compass: dip-induced turning & acceleration errors, fluid-damped swing
    const accelG = ((i.tasKt - this.lastTas) * 1.68781) / Math.max(dt, 1e-3) / 32.174;
    this.lastTas = i.tasKt;
    const phi = toRad(i.onGround ? 0 : i.bank) - 0.07 * (i.slip * 0.3);
    const theta = toRad(i.onGround ? 0 : i.pitch) - 0.07 * clamp(accelG, -1, 1);
    const psi = toRad(i.headingMag);
    const mu = toRad(i.dipDeg);
    const a =
      Math.cos(phi) * Math.sin(psi) * Math.cos(mu) -
      Math.sin(phi) * Math.cos(theta) * Math.sin(mu) -
      Math.sin(phi) * Math.sin(theta) * Math.cos(mu) * Math.cos(psi);
    const b = Math.cos(theta) * Math.cos(psi) * Math.cos(mu) - Math.sin(theta) * Math.sin(mu);
    const compassTarget = toDeg(Math.atan2(a, b));
    const err = norm180(compassTarget - this.compass);
    this.compassRate = lowPass(this.compassRate, err, dt / 5);
    this.compass = norm360(this.compass + this.compassRate * dt);

    // ---------- VSI: mechanical (calibrated-leak) VSI lags several seconds
    this.vsi = lowPass(this.vsi, vsTrueFpm, dt / 3);
  }
}

/**
 * Calibrated airspeed (kt) from true airspeed using compressible flow — what a pitot-static
 * airspeed indicator actually measures. At low speed this equals equivalent airspeed.
 */
export function calibratedAirspeedKt(
  tasKt: number,
  speedOfSoundKt: number,
  pressureRatio: number,
): number {
  if (tasKt <= 0) return 0;
  const mach = tasKt / speedOfSoundKt;
  // impact pressure / sea-level static pressure
  const qcOverP0 = pressureRatio * ((1 + 0.2 * mach * mach) ** 3.5 - 1);
  return 661.4786 * Math.sqrt(5 * ((qcOverP0 + 1) ** (2 / 7) - 1));
}
