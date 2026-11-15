/**
 * The instruments module: turns the true state of the aircraft into what the panel instruments
 * show (`sim.state.ind`). Each instrument is modelled the way the real one works, so that its
 * real errors appear by themselves — see gyros.ts, compass.ts, pitot-static.ts and gauges.ts.
 *
 * Inputs: truth from `sim.state`; vacuum, electrical power and failures from `sim.state.sys`
 * (written by the systems module); the altimeter setting and the heading-indicator knob from
 * `sim.controls`. If no systems module is installed, suction is estimated from engine speed and
 * electrical power is taken to be available.
 */
import { magneticField } from "@/core/magvar";
import { norm180, norm360 } from "@/core/math";
import type { Sim } from "@/core/sim";
import { loadJson, saveJson } from "@/core/storage";
import type { SimState, SpawnResult, SystemsState } from "@/core/types";
import { kcasToKias, kiasToKcas } from "./airspeed";
import type { InstrumentOptions, InstrumentStatus, InstrumentsApi } from "./api";
import { MagneticCompass, compassDeviation } from "./compass";
import { Gauges, estimatedSuctionInHg } from "./gauges";
import { AttitudeGyro, DirectionalGyro, SlipBall, TurnCoordinator } from "./gyros";
import { Kinematics } from "./kinematics";
import { PitotStatic } from "./pitot-static";
import { hashSeed, mulberry32 } from "./rng";

const SLOW_EVERY = 12; // slow gauges run 10 times per second
const HOUSEKEEPING_EVERY = 120; // once per second: magnetic field lookup, is a systems module present?
const BUS_ALIVE_VOLTS = 9;
const HOBBS_KEY = "hobbs";
const HOBBS_SAVE_EVERY_S = 30;

/**
 * Battery current for the ammeter (A, + = charging): `sys.batteryAmps` when the systems module
 * writes it. A few other likely names are accepted too, in case the systems module chose one of them.
 */
const AMP_FIELDS = ["ammeterA", "batteryCurrentA", "ammeterAmps", "battAmps"] as const;

function batteryAmpsFrom(sys: SystemsState): number | null {
  if (typeof sys.batteryAmps === "number" && Number.isFinite(sys.batteryAmps)) return sys.batteryAmps;
  const loose = sys as unknown as Record<string, unknown>;
  for (const name of AMP_FIELDS) {
    const v = loose[name];
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return null;
}

export function createInstruments(options: InstrumentOptions = {}): InstrumentsApi {
  const baseSeed = options.seed ?? 1;
  const kin = new Kinematics();
  const attitude = new AttitudeGyro();
  const heading = new DirectionalGyro();
  heading.gimbalError = options.dgGimbalError ?? true;
  const turn = new TurnCoordinator();
  const ball = new SlipBall();
  const compass = new MagneticCompass();
  const pitotStatic = new PitotStatic();
  const gauges = new Gauges();

  const savedHobbs = loadJson<number>(HOBBS_KEY, 0);
  gauges.hobbs = typeof savedHobbs === "number" && Number.isFinite(savedHobbs) && savedHobbs > 0 ? savedHobbs : 0;
  let hobbsStored = gauges.hobbs;
  let sinceSave = 0;

  let sim: Sim | null = null;
  let unsubscribe: (() => void) | null = null;
  let hasSystems = false;
  let ready = false;
  let stepCount = 0;

  const status: InstrumentStatus = {
    attitudeGyroSpeed: 0,
    headingGyroSpeed: 0,
    turnGyroSpeed: 0,
    attitudeTumbling: false,
    headingTumbling: false,
    compassDragging: false,
    headingGyroDriftDegPerHr: 0,
    suctionInHg: 0,
    electricalPower: true,
  };

  function attach(s: Sim): void {
    if (sim === s) return;
    unsubscribe?.();
    sim = s;
    unsubscribe = s.events.on("command", (e) => {
      if (e.id === "dg-align") api.alignHeadingIndicator();
    });
  }

  /** Suction available to the vacuum gyros, inHg. */
  function suctionNow(s: SimState): number {
    if (s.sys.failures.vacuum) return 0;
    return hasSystems ? Math.max(0, s.sys.vacuumInHg) : estimatedSuctionInHg(s.rpm);
  }

  function updateField(s: SimState): void {
    const f = magneticField(s.lat, s.lon);
    // Declination comes from the core (`state.magVar`) so that the compass agrees exactly with every other magnetic value.
    compass.setField(s.magVar, f.inclDeg, f.horizNt);
  }

  function publish(s: SimState, utcMs: number): void {
    const ind = s.ind;
    ind.ias = pitotStatic.ias;
    ind.alt = pitotStatic.alt;
    ind.vs = pitotStatic.vs;
    ind.attPitch = attitude.pitch;
    ind.attRoll = attitude.roll;
    ind.attFlag = attitude.flag;
    ind.dgMag = heading.reading;
    ind.dgFlag = heading.flag;
    ind.compassMag = compass.reading;
    ind.turnRate = turn.rate;
    ind.ball = ball.pos;
    ind.turnFlag = turn.flag;
    ind.tachRpm = gauges.tachRpm;
    ind.hobbs = gauges.hobbs;
    ind.fuelLeftGal = gauges.fuelLeft.shown;
    ind.fuelRightGal = gauges.fuelRight.shown;
    ind.oilTempF = gauges.oilTempF;
    ind.oilPressPsi = gauges.oilPressPsi;
    ind.egtF = gauges.egtF;
    ind.suctionInHg = gauges.suctionInHg;
    ind.ammeterA = gauges.ammeterA;
    const daySec = (utcMs / 1000) % 86400;
    ind.clockUtcSec = daySec < 0 ? daySec + 86400 : daySec;
    ind.oatC = gauges.oatC;

    status.attitudeGyroSpeed = attitude.speed;
    status.headingGyroSpeed = heading.speed;
    status.turnGyroSpeed = turn.speed;
    status.attitudeTumbling = attitude.tumbling;
    status.headingTumbling = heading.tumbling;
    status.compassDragging = compass.dragging;
    status.headingGyroDriftDegPerHr = heading.realDriftDegPerHr;
  }

  const api: InstrumentsApi = {
    name: "instruments",
    status,

    onSpawn(s: Sim, result: SpawnResult): void {
      attach(s);
      const st = s.state;
      const c = s.controls;
      hasSystems = s.module("systems") !== undefined;
      stepCount = 0;
      // The same starting situation always gets the same "random" imperfections.
      const rng = mulberry32(hashSeed(baseSeed, result.lat * 1000, result.lon * 1000, result.headingTrue * 10, result.altFtMsl, result.onGround ? 1 : 2));
      // Gyros are up to speed if the engine is running, or if the aircraft starts in the air (they
      // were running until a moment ago and coast for minutes; a windmilling propeller still turns the pump).
      const running = st.sys.engineRunning || !result.onGround;
      // At spawn the systems module may not have caught up yet, so judge power from the switches the core has just set.
      const powered = !hasSystems || c.masterBattery;
      const suction = st.sys.failures.vacuum ? 0 : hasSystems ? Math.max(st.sys.vacuumInHg, estimatedSuctionInHg(st.rpm)) : estimatedSuctionInHg(st.rpm);

      kin.reset(st);
      updateField(st);
      compass.settle(kin);
      // Engine running: the gyros have been spinning for a while — upright and set to the compass.
      // Cold start: they are stopped, lying wherever they came to rest.
      attitude.reset(running, kin, rng);
      heading.reset(running, rng);
      if (running) heading.slaveTo(compass.reading, kin, st, c.dgAdjustDeg);
      else heading.reading = heading.read(kin, st, c.dgAdjustDeg);
      turn.reset(powered);
      ball.reset();
      pitotStatic.reset(st, c.altimeterInHg);
      gauges.reset(st, rng, powered, suction);
      status.suctionInHg = suction;
      status.electricalPower = powered;
      ready = true;
      publish(st, s.env.utcMs);
    },

    postStep(s: Sim, dt: number): void {
      if (!ready) {
        // Added to a simulator that is already flying without a spawn notification: stabilise now.
        if (!s.lastSpawn) return;
        api.onSpawn?.(s, s.lastSpawn);
      }
      const st = s.state;
      const c = s.controls;
      const sys = st.sys;
      stepCount++;
      if (stepCount % HOUSEKEEPING_EVERY === 0) {
        hasSystems = s.module("systems") !== undefined;
        updateField(st);
      }
      const suction = suctionNow(st);
      const powered = !hasSystems || sys.busVolts > BUS_ALIVE_VOLTS;
      status.suctionInHg = suction;
      status.electricalPower = powered;

      kin.update(st, dt);
      attitude.step(dt, kin, st, suction);
      heading.step(dt, kin, st, suction, c.dgAdjustDeg);
      turn.step(dt, st, powered);
      ball.step(dt, st.ny, st.nz);
      compass.step(dt, kin);
      pitotStatic.step(dt, st, c.altimeterInHg, sys.failures.pitot, sys.failures.staticPort, sys.engineRunning);
      gauges.stepFast(dt, st, kin, powered, suction);
      if (stepCount % SLOW_EVERY === 0) {
        const alternatorOnline = hasSystems ? sys.alternatorOnline : sys.engineRunning && c.masterAlternator && c.masterBattery && !sys.failures.alternator;
        gauges.stepSlow(dt * SLOW_EVERY, st, c, powered, hasSystems ? batteryAmpsFrom(sys) : null, alternatorOnline);
      }
      publish(st, s.env.utcMs);
      // Safety net: should any model ever produce a non-number, start the instruments afresh rather than freeze the panel.
      const ind = st.ind;
      const check = ind.ias + ind.alt + ind.vs + ind.attPitch + ind.attRoll + ind.dgMag + ind.compassMag + ind.turnRate + ind.ball + ind.fuelLeftGal + ind.fuelRightGal + ind.oatC;
      if (!Number.isFinite(check) && s.lastSpawn) api.onSpawn?.(s, s.lastSpawn);
    },

    frame(s: Sim, dtReal: number): void {
      // The clock keeps running while paused; everything else waits for the physics.
      if (ready) {
        const daySec = (s.env.utcMs / 1000) % 86400;
        s.state.ind.clockUtcSec = daySec < 0 ? daySec + 86400 : daySec;
      }
      // Remember the hour meter between visits (it belongs to the aircraft, like the real one).
      sinceSave += dtReal;
      if (sinceSave >= HOBBS_SAVE_EVERY_S) {
        sinceSave = 0;
        if (gauges.hobbs - hobbsStored > 0.0005) {
          hobbsStored = gauges.hobbs;
          saveJson(HOBBS_KEY, gauges.hobbs);
        }
      }
    },

    dispose(): void {
      unsubscribe?.();
      unsubscribe = null;
      if (gauges.hobbs - hobbsStored > 0.0005) saveJson(HOBBS_KEY, gauges.hobbs);
      sim = null;
      ready = false;
    },

    alignHeadingIndicator(): void {
      const s = sim;
      if (!s || !ready) return;
      const st = s.state;
      const c = s.controls;
      kin.setAxes(st);
      // Turn the knob until the card shows what the compass shows at this moment — errors and all.
      // (That is why the real procedure calls for straight, level, unaccelerated flight.)
      for (let i = 0; i < 4; i++) c.dgAdjustDeg += norm180(compass.reading - heading.read(kin, st, c.dgAdjustDeg));
      heading.reading = heading.read(kin, st, c.dgAdjustDeg);
      st.ind.dgMag = norm360(heading.reading);
    },

    kcasToKias,
    kiasToKcas,
    compassDeviation,
  };
  return api;
}
