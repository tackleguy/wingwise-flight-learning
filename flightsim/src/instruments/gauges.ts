/**
 * Engine and miscellaneous gauges: tachometer, hour meter, fuel quantity, oil temperature and
 * pressure, exhaust gas temperature (EGT), suction, ammeter, clock and outside air temperature.
 *
 * Which gauges need electricity follows the Cessna 172P-class arrangement:
 *   - electric (dead without bus power): fuel quantity, oil temperature, ammeter;
 *   - mechanical / self-powered: tachometer (cable), oil pressure (direct oil line), EGT
 *     (thermocouple makes its own voltage), suction gauge, outside air temperature, clock.
 */
import { clamp } from "@/core/math";
import type { ControlState, SimState } from "@/core/types";
import type { Kinematics } from "./kinematics";
import { randRange, randSign } from "./rng";

/** Fallback when no systems module is installed: suction from the engine-driven vacuum pump, inHg. */
export function estimatedSuctionInHg(rpm: number): number {
  // Regulated to about 5 inHg from roughly 1,000 rpm up; falls away toward idle; none with the engine stopped.
  const x = clamp((rpm - 150) / 850, 0, 1);
  return 5.0 * Math.pow(x, 0.7);
}

/** Fuel gauge scale ends at about a full standard tank, gallons. */
const FUEL_GAUGE_MAX_GAL = 26;
const FUEL_TANK_GAL = 21.5;
const FUEL_LAG_S = 5; // heavily damped so the needle does not dance with every slosh
const FUEL_SLOSH_FREQ = 2.4; // rad/s
const FUEL_SLOSH_DAMPING = 0.12;
const OIL_TEMP_MIN_F = 75; // the needle rests here (left end of the scale) when cold or unpowered
const OIL_TEMP_MAX_F = 250;

class FuelGauge {
  shown = 0;
  /** Calibration errors of this sender, gallons (zero at empty by construction). */
  private slopeErr = 0;
  private bowErr = 0;
  private slosh = 0;
  private sloshVel = 0;
  /** +1: fuel running toward the right wing raises this float; −1: lowers it. */
  private side: number;

  constructor(side: number) {
    this.side = side;
  }

  reset(rng: () => number, trueGal: number, powered: boolean): void {
    this.slopeErr = randSign(rng) * randRange(rng, 0.2, 1.0);
    this.bowErr = randSign(rng) * randRange(rng, 0.3, 1.3);
    this.slosh = 0;
    this.sloshVel = 0;
    this.shown = powered ? clamp(this.senderGal(trueGal, 0, 0), 0, FUEL_GAUGE_MAX_GAL) : 0;
  }

  /** What the float sender reports for the fuel really in the tank and the present tilt of the fuel surface. */
  private senderGal(trueGal: number, lateralTiltDeg: number, pitchTiltDeg: number): number {
    const x = clamp(trueGal / FUEL_TANK_GAL, 0, 1);
    // A half-full tank lets the fuel move the furthest; a full or empty one hardly at all.
    const room = Math.sin(Math.PI * x);
    const calibration = this.slopeErr * x + this.bowErr * room;
    const tilt = (this.side * 0.22 * lateralTiltDeg - 0.08 * pitchTiltDeg) * room;
    return trueGal + calibration + tilt;
  }

  step(dt: number, trueGal: number, lateralTiltDeg: number, pitchTiltDeg: number, powered: boolean): void {
    // The fuel surface overshoots and sloshes back and forth after every disturbance.
    const acc = FUEL_SLOSH_FREQ * FUEL_SLOSH_FREQ * (lateralTiltDeg - this.slosh) - 2 * FUEL_SLOSH_DAMPING * FUEL_SLOSH_FREQ * this.sloshVel;
    this.sloshVel += acc * dt;
    this.slosh = clamp(this.slosh + this.sloshVel * dt, -40, 40);
    if (Math.abs(this.slosh) < 1e-6 && Math.abs(this.sloshVel) < 1e-6 && lateralTiltDeg === 0) this.slosh = this.sloshVel = 0;
    if (!powered) {
      // No electricity: the needle falls to E.
      this.shown += ((0 - this.shown) * dt) / (0.8 + dt);
      if (this.shown < 1e-3) this.shown = 0;
      return;
    }
    const want = clamp(this.senderGal(trueGal, this.slosh, pitchTiltDeg), 0, FUEL_GAUGE_MAX_GAL);
    this.shown += ((want - this.shown) * dt) / (FUEL_LAG_S + dt);
  }
}

export class Gauges {
  tachRpm = 0;
  /** Hour meter, hours. Not reset by a reposition: it belongs to the aircraft. */
  hobbs = 0;
  oilTempF = OIL_TEMP_MIN_F;
  oilPressPsi = 0;
  egtF = 0;
  suctionInHg = 0;
  ammeterA = 0;
  oatC = 15;
  // The float senders sit at the inboard (wing-root) end of each tank.
  readonly fuelLeft = new FuelGauge(1);
  readonly fuelRight = new FuelGauge(-1);
  /** Extra charging current while the battery recovers from the engine start, A. */
  private recharge = 0;
  private wasRunning = false;

  reset(s: SimState, rng: () => number, powered: boolean, suctionInHg: number): void {
    this.tachRpm = s.rpm;
    this.oilPressPsi = clamp(s.oilPressPsi, 0, 115);
    this.oilTempF = powered ? clamp(s.oilTempF, OIL_TEMP_MIN_F, OIL_TEMP_MAX_F) : OIL_TEMP_MIN_F;
    this.egtF = Math.max(0, s.egtF);
    this.suctionInHg = suctionInHg;
    this.oatC = s.oatC + ramRiseC(s.ktas);
    this.fuelLeft.reset(rng, s.fuelLeftGal, powered);
    this.fuelRight.reset(rng, s.fuelRightGal, powered);
    this.recharge = 0;
    this.wasRunning = s.sys.engineRunning;
    this.ammeterA = 0;
  }

  /** Fast gauges — every physics step. */
  stepFast(dt: number, s: SimState, k: Kinematics, powered: boolean, suctionInHg: number): void {
    this.tachRpm += ((s.rpm - this.tachRpm) * dt) / (0.3 + dt);
    if (this.tachRpm < 0.05 && s.rpm <= 0) this.tachRpm = 0;
    this.oilPressPsi += ((clamp(s.oilPressPsi, 0, 115) - this.oilPressPsi) * dt) / (0.6 + dt);
    if (this.oilPressPsi < 1e-3 && s.oilPressPsi <= 0) this.oilPressPsi = 0;
    this.suctionInHg += ((clamp(suctionInHg, 0, 10) - this.suctionInHg) * dt) / (0.5 + dt);
    if (this.suctionInHg < 1e-4 && suctionInHg <= 0) this.suctionInHg = 0;
    if (s.sys.engineRunning) this.hobbs += dt / 3600;
    // Fuel surface tilt: sideways (the same thing that moves the slip ball) and fore-aft.
    const down = Math.max(k.bodyZ, 0.2);
    const lateral = clamp(Math.atan2(k.bodyY, down) * 57.29578, -40, 40);
    const fore = clamp(Math.atan2(k.bodyX, down) * 57.29578, -40, 40);
    this.fuelLeft.step(dt, s.fuelLeftGal, lateral, fore, powered);
    this.fuelRight.step(dt, s.fuelRightGal, lateral, fore, powered);
  }

  /** Slow gauges — a few times per second is plenty. */
  stepSlow(dt: number, s: SimState, c: ControlState, powered: boolean, systemsAmps: number | null, alternatorOnline: boolean): void {
    const oilWant = powered ? clamp(s.oilTempF, OIL_TEMP_MIN_F, OIL_TEMP_MAX_F) : OIL_TEMP_MIN_F;
    this.oilTempF += ((oilWant - this.oilTempF) * dt) / ((powered ? 6 : 1) + dt);
    this.egtF += ((Math.max(0, s.egtF) - this.egtF) * dt) / (2.5 + dt);
    // The probe sits in the airflow: it reads a little warm at speed, and it is slow.
    this.oatC += ((s.oatC + ramRiseC(s.ktas) - this.oatC) * dt) / (25 + dt);

    // ---- ammeter: current into (+) or out of (−) the battery
    let amps: number;
    if (systemsAmps !== null) {
      amps = systemsAmps;
    } else {
      const running = s.sys.engineRunning;
      if (running && !this.wasRunning) this.recharge = 18; // the starter took a lot out of the battery
      this.wasRunning = running;
      this.recharge *= Math.exp(-dt / 150);
      if (!c.masterBattery) amps = 0;
      else if (alternatorOnline) amps = 1.5 + this.recharge;
      else amps = -estimatedLoadAmps(s, c);
    }
    this.ammeterA += ((clamp(amps, -60, 60) - this.ammeterA) * dt) / (0.5 + dt);
    if (Math.abs(this.ammeterA) < 1e-3 && amps === 0) this.ammeterA = 0;
  }
}

/** Temperature rise of a probe in the airflow, °C (about 1 °C at 100 kt). */
function ramRiseC(ktas: number): number {
  return (0.8 * ktas * ktas) / 7592;
}

/**
 * Rough electrical load when no systems module provides the real figure, A. Typical values for a
 * light single with a 28-volt system; only used to make the ammeter show a believable discharge.
 */
function estimatedLoadAmps(s: SimState, c: ControlState): number {
  let a = 3; // instruments, turn coordinator, gauges
  if (c.avionicsMaster) a += 6;
  if (c.lights.beacon) a += 3.5;
  if (c.lights.nav) a += 2.5;
  if (c.lights.strobe) a += 3;
  if (c.lights.landing) a += 9;
  if (c.lights.taxi) a += 5;
  if (c.pitotHeat) a += 6;
  if (c.ignition === 4 && !s.sys.engineRunning) a += 45; // starter motor
  return a;
}
