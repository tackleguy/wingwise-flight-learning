/**
 * Flight-test manoeuvres that MEASURE the simulated aircraft. Used by the physics tests and by the
 * validation report (docs/PHYSICS-VALIDATION.md). Every function flies the real Sim with the
 * scripted test pilot from lab.ts and returns plain numbers.
 */
import type { Sim } from "@/core/sim";
import { clamp, norm180 } from "@/core/math";
import { kiasToKcas } from "@/physics/constants";
import { PILOT_DT, TestPilot, airborne, fly, flyAverage, lab, mslFt, prop, type LabOptions } from "./lab";

// ---------------------------------------------------------------- engine on the ground

export interface StaticRun {
  rpm: number;
  powerHp: number;
  thrustLb: number;
  fuelGph: number;
  manifoldInHg: number;
}

/** Parked on the runway with the brakes held: full throttle, mixture rich, wait for the engine to settle. */
export async function staticRunUp(opts: LabOptions = {}, throttle = 1, powerLoss = 0): Promise<StaticRun> {
  const sim = await lab(opts);
  await sim.spawn({ kind: "runway", airportIdent: "KSFO", runwayEndId: "28R" });
  if (powerLoss > 0) sim.use({ name: "test-power-loss", preStep: (s) => void (s.fdmIn.powerLoss = powerLoss) });
  sim.controls.parkingBrake = true;
  sim.controls.throttle = throttle;
  sim.advance(12);
  const s = sim.state;
  const r = { rpm: s.rpm, powerHp: s.powerHp, thrustLb: s.thrustLb, fuelGph: s.fuelFlowGph, manifoldInHg: s.manifoldInHg };
  sim.dispose();
  return r;
}

// ---------------------------------------------------------------- climb / glide

export interface ClimbResult {
  fpm: number;
  kcas: number;
  rpm: number;
  powerHp: number;
  pitchDeg: number;
  weightLb: number;
  rudder: number;
  fuelGph: number;
  /** Pressure altitude at the middle of the measurement, ft. */
  midPressureAltFt: number;
}

/**
 * Steady climb (or descent) at a constant indicated airspeed. The rate is the altitude gained over
 * the last `measureSec` seconds, centred on `altFt`.
 */
export async function steadyClimb(
  altFt: number,
  kias: number,
  opts: LabOptions & { throttle?: number; mixture?: number; flapIndex?: number; settleSec?: number; measureSec?: number; leanForPower?: boolean; startBelowFt?: number } = {},
): Promise<ClimbResult> {
  const settle = opts.settleSec ?? 40;
  const measure = opts.measureSec ?? 30;
  let startBelow = opts.startBelowFt;
  if (startBelow === undefined) {
    // a first pass tells how fast the aircraft climbs, so the second pass can be centred on the target altitude
    const first = await steadyClimb(altFt, kias, { ...opts, startBelowFt: 500 });
    startBelow = clamp((first.fpm * (settle + measure / 2)) / 60, -3000, 3000);
  }
  const sim = await lab(opts);
  const flapIndex = opts.flapIndex ?? 0;
  const kcas = kiasToKcas(kias, flapIndex * 10);
  await airborne(sim, Math.max(altFt - startBelow, (opts.groundFt ?? 0) + 400 - (opts.seaLevelAtFt ?? 0)), kias, flapIndex);
  const c = sim.controls;
  c.throttle = opts.throttle ?? 1;
  c.mixture = opts.mixture ?? 1;
  const pilot = new TestPilot({ kcas, rudder: "ball" });
  if (opts.leanForPower) {
    fly(sim, 10, pilot);
    leanForBestPower(sim, pilot);
  }
  fly(sim, settle, pilot);
  // move to just below the target altitude if the settle phase drifted a long way
  const s = sim.state;
  const h0 = s.altMslFt;
  const t0 = s.time;
  const avg = flyAverage(sim, measure, pilot, () => ({ kcas: s.kcas, rpm: s.rpm, hp: s.powerHp, pitch: s.pitch, rudder: c.rudder, ff: s.fuelFlowGph }));
  const fpm = ((s.altMslFt - h0) / (s.time - t0)) * 60;
  const r = { fpm, kcas: avg.kcas, rpm: avg.rpm, powerHp: avg.hp, pitchDeg: avg.pitch, weightLb: s.weightLb, rudder: avg.rudder, fuelGph: avg.ff, midPressureAltFt: (h0 + s.altMslFt) / 2 - (opts.seaLevelAtFt ?? 0) };
  sim.dispose();
  return r;
}

/**
 * Engine power at a chosen rpm with the throttle wide open: the pilot lets the aircraft speed up
 * or slow down (by diving or climbing a little) until the fixed-pitch propeller turns at `rpm`.
 */
export async function powerAtRpm(rpm: number, pressureAltFt: number, opts: LabOptions = {}): Promise<{ powerHp: number; rpm: number; kcas: number; fuelGph: number; manifoldInHg: number }> {
  const sim = await lab(opts);
  await airborne(sim, pressureAltFt + 300, 118);
  const c = sim.controls;
  const s = sim.state;
  c.throttle = 1;
  let target = s.kcas;
  const pilot = new TestPilot({ kcas: target, rudder: "ball" });
  fly(sim, 45, pilot, () => {
    target = clamp(target + (rpm - s.rpm) * 0.004 * PILOT_DT, 60, 150);
    pilot.t.kcas = target;
  });
  const avg = flyAverage(sim, 8, pilot, () => {
    target = clamp(target + (rpm - s.rpm) * 0.004 * PILOT_DT, 60, 150);
    pilot.t.kcas = target;
    return { powerHp: s.powerHp, rpm: s.rpm, kcas: s.kcas, fuelGph: s.fuelFlowGph, manifoldInHg: s.manifoldInHg };
  });
  sim.dispose();
  return avg;
}

/** Lean the mixture in steps and leave it where the engine makes the most power (as a pilot does by ear / rpm). */
export function leanForBestPower(sim: Sim, pilot: TestPilot | null): number {
  const c = sim.controls;
  let best = c.mixture;
  let bestHp = -1;
  for (let m = 1; m >= 0.3; m -= 0.025) {
    c.mixture = m;
    fly(sim, 1.5, pilot);
    if (sim.state.powerHp > bestHp + 0.05) {
      bestHp = sim.state.powerHp;
      best = m;
    }
  }
  c.mixture = best;
  fly(sim, 3, pilot);
  return best;
}

/** Lean the mixture until the exhaust gas temperature peaks (the handbook's "recommended lean" method). */
export function leanToPeakEgt(sim: Sim, pilot: TestPilot | null): number {
  const c = sim.controls;
  let best = c.mixture;
  let bestEgt = -1e9;
  for (let m = 1; m >= 0.3; m -= 0.02) {
    c.mixture = m;
    fly(sim, 1.5, pilot);
    if (!sim.state.sys.engineRunning) break;
    if (sim.state.egtF > bestEgt + 0.01) {
      bestEgt = sim.state.egtF;
      best = m;
    }
  }
  c.mixture = best;
  fly(sim, 3, pilot);
  return best;
}

export interface GlideResult {
  ratio: number;
  nmPer1000Ft: number;
  sinkFpm: number;
  rpm: number;
  kcas: number;
}

/** Power-off glide: throttle closed (engine idling / windmilling), constant indicated airspeed, still air. */
export async function glide(kias: number, opts: LabOptions & { flapIndex?: number; engineOff?: boolean } = {}): Promise<GlideResult> {
  const sim = await lab(opts);
  const flapIndex = opts.flapIndex ?? 0;
  await airborne(sim, 5000, kias, flapIndex);
  const c = sim.controls;
  c.throttle = 0;
  if (opts.engineOff) c.mixture = 0;
  const pilot = new TestPilot({ kcas: kiasToKcas(kias, flapIndex * 10), rudder: "ball" });
  fly(sim, 40, pilot);
  const s = sim.state;
  const h0 = s.altMslFt;
  const d0 = s.distanceNm;
  const t0 = s.time;
  const avg = flyAverage(sim, 60, pilot, () => ({ rpm: s.rpm, kcas: s.kcas }));
  const lostFt = h0 - s.altMslFt;
  const nm = s.distanceNm - d0;
  const r = { ratio: (nm * 6076.115) / lostFt, nmPer1000Ft: nm / (lostFt / 1000), sinkFpm: (lostFt / (s.time - t0)) * 60, rpm: avg.rpm, kcas: avg.kcas };
  sim.dispose();
  return r;
}

// ---------------------------------------------------------------- level flight

export interface LevelResult {
  kcas: number;
  ktas: number;
  rpm: number;
  powerHp: number;
  fuelGph: number;
  throttle: number;
  mixture: number;
  manifoldInHg: number;
  pitchDeg: number;
  alphaDeg: number;
  elevator: number;
  rudder: number;
  aileron: number;
  egtF: number;
}

/**
 * Level flight at `altFt`. Either full throttle (limited to `rpmLimit`), a fixed throttle, or the
 * throttle needed for `rpm` / `kias`. `lean`: "peak" = lean to peak EGT, "power" = best power.
 */
export async function levelFlight(
  altFt: number,
  opts: LabOptions & { throttle?: number; rpm?: number; kias?: number; rpmLimit?: number; lean?: "peak" | "power" | "rich"; startKias?: number; settleSec?: number; flapIndex?: number } = {},
): Promise<LevelResult> {
  const sim = await lab(opts);
  const flapIndex = opts.flapIndex ?? 0;
  await airborne(sim, altFt, opts.startKias ?? opts.kias ?? 105, flapIndex);
  const c = sim.controls;
  const targets: ConstructorParameters<typeof TestPilot>[0] = { altFt: mslFt(sim, altFt), rudder: "ball" };
  if (opts.kias !== undefined) targets.throttleForKcas = kiasToKcas(opts.kias, flapIndex * 10);
  else if (opts.rpm !== undefined) targets.throttleForRpm = opts.rpm;
  else c.throttle = opts.throttle ?? 1;
  if (opts.rpmLimit !== undefined) targets.rpmLimit = opts.rpmLimit;
  const pilot = new TestPilot(targets);
  fly(sim, 25, pilot);
  if (opts.lean === "peak") leanToPeakEgt(sim, pilot);
  else if (opts.lean === "power") leanForBestPower(sim, pilot);
  fly(sim, opts.settleSec ?? 70, pilot);
  const s = sim.state;
  const avg = flyAverage(sim, 20, pilot, () => ({
    kcas: s.kcas,
    ktas: s.ktas,
    rpm: s.rpm,
    powerHp: s.powerHp,
    fuelGph: s.fuelFlowGph,
    throttle: c.throttle,
    manifoldInHg: s.manifoldInHg,
    pitchDeg: s.pitch,
    alphaDeg: s.alphaDeg,
    elevator: c.elevator,
    rudder: c.rudder,
    aileron: c.aileron,
    egtF: s.egtF,
  }));
  const r = { ...avg, mixture: c.mixture };
  sim.dispose();
  return r;
}

// ---------------------------------------------------------------- stall

export interface StallOptions extends LabOptions {
  flapIndex?: number;
  /** Throttle during the manoeuvre (default 0 = idle). */
  throttle?: number;
  /**
   * Feet: "ball" = coordinated (default); "none" = feet on the floor for the whole manoeuvre;
   * a number = that much rudder (−1…1) put in at the break (an uncoordinated, skidding stall).
   */
  rudder?: "ball" | "none" | number;
  /** Seconds the yoke is held fully back after the break (default 2). */
  holdSec?: number;
  altFt?: number;
}

export interface StallResult {
  /** Lowest calibrated airspeed reached up to the break, kt: the stall speed. */
  kcas: number;
  /** Angle of attack at maximum lift coefficient, degrees. */
  alphaAtClMaxDeg: number;
  clMax: number;
  /** Largest angle of attack reached while the yoke was held back, degrees. */
  alphaMaxDeg: number;
  pitchAtBreakDeg: number;
  /** How far the nose fell while the yoke was held fully back, degrees. */
  pitchDropDeg: number;
  /** Bank when the yoke was released, degrees (+ = right wing down), and the largest bank seen. */
  bankAtReleaseDeg: number;
  maxBankDeg: number;
  /** Yoke position when the lowest speed was reached (1 = full aft). */
  elevatorAtStall: number;
  weightLb: number;
  cgIn: number;
  altitudeLostFt: number;
  /** Seconds from releasing the back-pressure until the wing was flying again (alpha below 12°); −1 = never. */
  recoverySec: number;
  /** The stall hysteresis ("deep stall") flag was set at some point. */
  deepStall: boolean;
}

/**
 * A stall flown the way it is flown for certification and in training: power as given (default
 * idle), slow down at one knot per second with the elevator until the yoke is fully back or the
 * nose drops by itself (the "break"), hold the yoke back for `holdSec`, then release it.
 * From the first sign of the stall the ailerons are left alone (a trained pilot keeps the wings
 * level with rudder). The stall speed is the lowest calibrated airspeed reached up to the break.
 */
export async function stall(opts: StallOptions = {}): Promise<StallResult> {
  const sim = await lab(opts);
  const flapIndex = opts.flapIndex ?? 0;
  const startKcas = flapIndex >= 2 ? 66 : 72;
  await sim.spawn({ kind: "air", lat: 38.5, lon: -98, altFtMsl: opts.altFt ?? 5000, headingTrue: 360, kias: 76 });
  const c = sim.controls;
  const s = sim.state;
  c.flapIndex = flapIndex;
  c.throttle = opts.throttle ?? 0;
  const feet = opts.rudder ?? "ball";
  const pilot = new TestPilot({ kcas: startKcas, rudder: feet === "none" ? "none" : "ball", maxPitchDeg: 35 });
  fly(sim, 15, pilot);
  let target = startKcas;
  let minKcas = 999;
  let clMax = 0;
  let alphaAtClMax = 0;
  let alphaMax = 0;
  let pitchAtBreak = 0;
  let minPitch = 99;
  let elevAtStall = 0;
  let maxBank = 0;
  let broke = false;
  let deep = false;
  let tBreak = 0;
  const hStart = s.altMslFt;
  fly(sim, 120, pilot, (t) => {
    const cl = Math.sqrt(Math.max(0, prop(sim, "aero/cl-squared")));
    if (cl > clMax && s.alphaDeg > 5 && !broke) {
      clMax = cl;
      alphaAtClMax = s.alphaDeg;
    }
    if (s.alphaDeg > 12.5) pilot.t.aileron = 0; // hands off the ailerons near the stall
    if (prop(sim, "aero/stall-hyst-norm") > 0.5) deep = true;
    maxBank = Math.max(maxBank, Math.abs(s.roll));
    if (!broke) {
      target -= PILOT_DT;
      pilot.t.kcas = target;
      if (s.kcas < minKcas) {
        minKcas = s.kcas;
        elevAtStall = c.elevator;
      }
      if (c.elevator > 0.98 || (s.alphaDeg > 14 && s.pitchRate < -3) || Math.abs(s.roll) > 30) {
        broke = true;
        tBreak = t;
        pitchAtBreak = s.pitch;
        pilot.t.elevator = 1;
        pilot.t.aileron = 0;
        if (typeof feet === "number") pilot.t.rudder = feet;
      }
      return false;
    }
    alphaMax = Math.max(alphaMax, s.alphaDeg);
    minPitch = Math.min(minPitch, s.pitch);
    return t - tBreak > (opts.holdSec ?? 2);
  });
  const bankAtRelease = s.roll;
  // recover: release the back-pressure, level the wings with coordinated controls
  const rec = new TestPilot({ elevator: -0.05, bankDeg: 0, rudder: "ball" });
  let recoverySec = -1;
  fly(sim, 6, rec, (t) => {
    if (recoverySec < 0 && s.alphaDeg < 12) recoverySec = t;
    if (prop(sim, "aero/stall-hyst-norm") > 0.5) deep = true;
  });
  const r: StallResult = {
    kcas: minKcas,
    alphaAtClMaxDeg: alphaAtClMax,
    clMax,
    alphaMaxDeg: alphaMax,
    pitchAtBreakDeg: pitchAtBreak,
    pitchDropDeg: pitchAtBreak - minPitch,
    bankAtReleaseDeg: bankAtRelease,
    maxBankDeg: maxBank,
    elevatorAtStall: elevAtStall,
    weightLb: s.weightLb,
    cgIn: s.cgIn,
    altitudeLostFt: hStart - s.altMslFt,
    recoverySec,
    deepStall: deep,
  };
  sim.dispose();
  return r;
}

// ---------------------------------------------------------------- spin

export interface SpinResult {
  /** The aircraft was still stalled and rotating at the end of the spin phase. */
  sustained: boolean;
  turns: number;
  /** Averages over the last 6 s of the spin. */
  turnRateDps: number;
  alphaDeg: number;
  kcas: number;
  /** Largest minus smallest calibrated airspeed over those 6 s, kt. */
  kcasSpread: number;
  descentFpm: number;
  pitchDeg: number;
  altLostPerTurnFt: number;
  /** Recovery: turns and seconds from applying the recovery controls until the rotation has stopped. */
  recoveryTurns: number;
  recoverySec: number;
  /** Height lost from the recovery controls to level flight, ft, and the highest speed and g in the pull-out. */
  recoveryAltLostFt: number;
  maxKcas: number;
  maxG: number;
  crashed: boolean;
}

/**
 * Spin entry, spin and recovery. Power idle; slow to the stall; then yoke fully back and full
 * rudder in the direction `dir` (−1 left, +1 right), ailerons neutral, held for `holdSec`.
 * Recovery as taught: power idle, ailerons neutral, full opposite rudder, yoke forward; when the
 * rotation stops, rudder neutral and ease out of the dive. `recovery: "release"` lets go of
 * everything instead.
 */
export async function spin(dir: -1 | 1, opts: LabOptions & { holdSec?: number; decelKtPerSec?: number; recovery?: "standard" | "release"; altFt?: number } = {}): Promise<SpinResult> {
  const sim = await lab(opts);
  const alt0 = opts.altFt ?? 9000;
  await sim.spawn({ kind: "air", lat: 38.5, lon: -98, altFtMsl: alt0, headingTrue: 360, kias: 76 });
  const c = sim.controls;
  const s = sim.state;
  c.throttle = 0;
  const pilot = new TestPilot({ kcas: 70, rudder: "ball", maxPitchDeg: 30 });
  fly(sim, 10, pilot);
  let target = 70;
  const rate = opts.decelKtPerSec ?? 1;
  fly(sim, 60, pilot, () => {
    target -= PILOT_DT * rate;
    pilot.t.kcas = target;
    return s.alphaDeg > 14 || c.elevator > 0.9;
  });
  // pro-spin controls
  c.elevator = 1;
  c.rudder = dir;
  c.aileron = 0;
  const hold = opts.holdSec ?? 16;
  let turns = 0;
  let lastHdg = s.headingTrue;
  let n = 0;
  const acc = { tr: 0, a: 0, k: 0, vs: 0, pit: 0 };
  let kMin = 999;
  let kMax = 0;
  let altAt = 0;
  let turnsAt = 0;
  fly(sim, hold, null, (t) => {
    turns += norm180(s.headingTrue - lastHdg) / 360;
    lastHdg = s.headingTrue;
    if (t >= hold - 6) {
      if (n === 0) {
        altAt = s.altMslFt;
        turnsAt = turns;
      }
      acc.tr += s.turnRate;
      acc.a += s.alphaDeg;
      acc.k += s.kcas;
      acc.vs += s.vsFpm;
      acc.pit += s.pitch;
      kMin = Math.min(kMin, s.kcas);
      kMax = Math.max(kMax, s.kcas);
      n++;
    }
  });
  const m = Math.max(1, n);
  const spinTurns = turns;
  const lastTurns = Math.abs(turns - turnsAt);
  const altLostPerTurn = lastTurns > 0.2 ? (altAt - s.altMslFt) / lastTurns : Number.NaN;
  const sustained = acc.a / m > 20 && Math.abs(acc.tr / m) > 40;
  // recovery
  const hRec = s.altMslFt;
  if (opts.recovery === "release") {
    c.rudder = 0;
    c.elevator = 0;
  } else {
    c.rudder = -dir as number;
    c.elevator = -0.4;
  }
  c.aileron = 0;
  let recTurns = Number.NaN;
  let recSec = Number.NaN;
  // Count the rotation that is left as roll-and-yaw rate added up over time (the compass heading is
  // meaningless while the nose swings through the vertical during the recovery).
  let rotationDeg = 0;
  fly(sim, 15, null, (t) => {
    rotationDeg += Math.hypot(s.rollRate, s.yawRate) * PILOT_DT;
    if (Math.abs(s.yawRate) < 12 && Math.abs(s.rollRate) < 40 && s.alphaDeg < 14) {
      recTurns = rotationDeg / 360;
      recSec = t;
      return true;
    }
    return false;
  });
  // rotation stopped: neutral rudder, ease out of the dive
  c.rudder = 0;
  const out = new TestPilot({ pitchDeg: 0, bankDeg: 0, rudder: "ball", pitchRateLimit: 10 });
  let maxKcas = 0;
  let maxG = 0;
  fly(sim, 20, out, () => {
    maxKcas = Math.max(maxKcas, s.kcas);
    maxG = Math.max(maxG, s.nz);
    return s.vsFpm > -100 && Math.abs(s.pitch) < 4;
  });
  const r: SpinResult = {
    sustained,
    turns: spinTurns,
    turnRateDps: acc.tr / m,
    alphaDeg: acc.a / m,
    kcas: acc.k / m,
    kcasSpread: kMax - kMin,
    descentFpm: -acc.vs / m,
    pitchDeg: acc.pit / m,
    altLostPerTurnFt: altLostPerTurn,
    recoveryTurns: recTurns,
    recoverySec: recSec,
    recoveryAltLostFt: hRec - s.altMslFt,
    maxKcas,
    maxG,
    crashed: !!s.crash,
  };
  sim.dispose();
  return r;
}

// ---------------------------------------------------------------- hands-off behaviour

export interface HandsOffResult {
  bankDeg: number;
  headingChangeDeg: number;
  maxAbsBankDeg: number;
  maxAbsHeadingDeg: number;
  altChangeFt: number;
  kcas: number;
}

/** Stabilise with the pilot flying, then let go of everything for `seconds` and see where the aircraft goes. */
export function handsOff(sim: Sim, seconds: number): HandsOffResult {
  const s = sim.state;
  const c = sim.controls;
  c.elevator = 0;
  c.aileron = 0;
  c.rudder = 0;
  const h0 = s.headingTrue;
  const a0 = s.altMslFt;
  let maxBank = 0;
  let maxHdg = 0;
  fly(sim, seconds, null, () => {
    maxBank = Math.max(maxBank, Math.abs(s.roll));
    maxHdg = Math.max(maxHdg, Math.abs(norm180(s.headingTrue - h0)));
  });
  return { bankDeg: s.roll, headingChangeDeg: norm180(s.headingTrue - h0), maxAbsBankDeg: maxBank, maxAbsHeadingDeg: maxHdg, altChangeFt: s.altMslFt - a0, kcas: s.kcas };
}

/**
 * Find the pitch-trim setting that lets the aircraft fly hands-off at `kias` in level flight (the
 * pilot holds the speed and altitude, then winds the trim until no yoke force is needed).
 * Returns the trim position (−1…1) and leaves the aircraft trimmed with the yoke centred.
 */
export function trimHandsOff(sim: Sim, pilot: TestPilot, seconds = 40): number {
  const c = sim.controls;
  fly(sim, seconds, pilot, () => {
    // wind the trim wheel toward the yoke force being held
    c.trim = clamp(c.trim + c.elevator * 0.6 * PILOT_DT, -1, 1);
  });
  return c.trim;
}

// ---------------------------------------------------------------- take-off and landing

export interface TakeoffResult {
  groundRollFt: number;
  to50FtFt: number;
  liftoffKcas: number;
  kcasAt50Ft: number;
  maxRudder: number;
  /** Largest heading and centreline errors while the wheels were on the runway. */
  maxHeadingErrDeg: number;
  maxCentrelineErrFt: number;
  /** Largest distance from the extended centreline between lift-off and 50 ft. */
  maxAirborneCentrelineErrFt: number;
  crashed: boolean;
}

/** Distance along and across the runway from the spawn point, ft. */
export function runwayOffsetFt(sim: Sim): { along: number; cross: number } {
  const sp = sim.lastSpawn!;
  const s = sim.state;
  const north = (s.lat - sp.lat) * 60 * 6076.115;
  const east = (s.lon - sp.lon) * 60 * 6076.115 * Math.cos((sp.lat * Math.PI) / 180);
  const h = (sp.headingTrue * Math.PI) / 180;
  return { along: north * Math.cos(h) + east * Math.sin(h), cross: -north * Math.sin(h) + east * Math.cos(h) };
}

/**
 * Handbook short-field take-off: flaps 10°, brakes held, full throttle, release, lift the nose at
 * `rotateKias`, climb away at `climbKias` until 50 ft above the runway.
 */
export async function takeoff(opts: LabOptions & { flapIndex?: number; rotateKias?: number; climbKias?: number; useRudder?: boolean; crosswindAileron?: boolean } = {}): Promise<TakeoffResult> {
  const sim = await lab(opts);
  await sim.spawn({ kind: "runway", airportIdent: "KSFO", runwayEndId: "28R" });
  const s = sim.state;
  const c = sim.controls;
  const flapIndex = opts.flapIndex ?? 1;
  const flapsDeg = flapIndex * 10;
  const rotateKcas = kiasToKcas(opts.rotateKias ?? 51, flapsDeg);
  const climbKcas = kiasToKcas(opts.climbKias ?? 56, flapsDeg);
  const hdg0 = sim.lastSpawn!.headingTrue;
  c.flapIndex = flapIndex;
  c.parkingBrake = false;
  c.brakeLeft = c.brakeRight = 1;
  c.throttle = 1;
  sim.advance(8); // flaps travel, engine spools up against the brakes
  const start = runwayOffsetFt(sim).along;
  c.brakeLeft = c.brakeRight = 0;
  let liftoffAt = -1;
  let liftoffKcas = 0;
  let at50 = -1;
  let kcas50 = 0;
  let maxRudder = 0;
  let maxHdgErr = 0;
  let maxCross = 0;
  let airborneFor = 0;
  let iRud = 0;
  let lastCross = 0;
  let maxAirCross = 0;
  const climb = new TestPilot({ kcas: climbKcas, rudder: "ball", maxPitchDeg: 14 });
  let rotating = false;
  fly(sim, 90, null, () => {
    const off = runwayOffsetFt(sim);
    const hdgErr = norm180(hdg0 - s.headingTrue);
    const crossRate = (off.cross - lastCross) / PILOT_DT;
    lastCross = off.cross;
    if (s.onGround) {
      maxHdgErr = Math.max(maxHdgErr, Math.abs(hdgErr));
      maxCross = Math.max(maxCross, Math.abs(off.cross));
      airborneFor = 0;
      // keep straight with the rudder pedals (they also steer the nose wheel)
      if (opts.useRudder === false) c.rudder = 0;
      else {
        const e = hdgErr - off.cross * 0.15;
        iRud = clamp(iRud + e * 0.05 * PILOT_DT, -0.6, 0.6);
        c.rudder = clamp(e * 0.12 - s.yawRate * 0.07 + iRud, -1, 1);
      }
      // into-wind aileron during the roll, reduced as speed builds
      if (opts.crosswindAileron && opts.windKt) {
        const side = Math.sin(((opts.windFromDeg ?? 0) - hdg0) * (Math.PI / 180)); // + = wind from the right
        c.aileron = clamp(side * (1 - s.kcas / 70), -1, 1);
      } else c.aileron = clamp(-s.roll * 0.05 - s.rollRate * 0.02, -1, 1);
      if (s.kcas >= rotateKcas) rotating = true;
      c.elevator = rotating ? clamp((9 - s.pitch) * 0.1 - s.pitchRate * 0.04 + 0.1, -0.2, 0.75) : 0;
    } else {
      airborneFor += PILOT_DT;
      if (liftoffAt < 0 && airborneFor > 0.15) {
        liftoffAt = off.along - start;
        liftoffKcas = s.kcas;
        climb.reset();
      }
      if (opts.windKt) {
        // after lift-off: let the nose swing into the wind and keep the track over the runway (a crab)
        climb.t.headingDeg = undefined;
        climb.t.bankDeg = opts.useRudder === false ? 0 : clamp(-off.cross * 0.12 - crossRate * 1.2, -12, 12);
      } else climb.t.headingDeg = hdg0;
      climb.update(sim, PILOT_DT);
      maxAirCross = Math.max(maxAirCross, Math.abs(off.cross));
    }
    maxRudder = Math.max(maxRudder, Math.abs(c.rudder));
    if (at50 < 0 && s.aglFt >= 50) {
      at50 = off.along - start;
      kcas50 = s.kcas;
      return true;
    }
    return false;
  });
  const r = { groundRollFt: liftoffAt, to50FtFt: at50, liftoffKcas, kcasAt50Ft: kcas50, maxRudder, maxHeadingErrDeg: maxHdgErr, maxCentrelineErrFt: maxCross, maxAirborneCentrelineErrFt: maxAirCross, crashed: !!s.crash };
  sim.dispose();
  return r;
}

export interface LandingResult {
  touchdownKcas: number;
  touchdownFpm: number;
  groundRollFt: number;
  /** Horizontal distance from 50 ft above the runway to a full stop, ft. */
  from50FtFt: number;
  maxCentrelineErrFt: number;
  maxHeadingErrDeg: number;
  /** Heading minus track at touchdown, degrees (0 = no sideways drift). */
  touchdownDriftDeg: number;
  touchdownBankDeg: number;
  crashed: boolean;
  crashReason: string;
}

/**
 * Handbook short-field landing: flaps 30°, power off, `approachKias` at 50 ft, flare, touch down on
 * the main wheels, then hold the yoke back and brake as hard as the wheels allow until stopped.
 * With `opts.windKt` a wing-low (side-slip) crosswind technique is flown when `crosswindTechnique` is true.
 */
export async function landing(opts: LabOptions & { approachKias?: number; brake?: number; flapIndex?: number; crosswindTechnique?: boolean } = {}): Promise<LandingResult> {
  const sim = await lab(opts);
  await sim.spawn({ kind: "final", airportIdent: "KSFO", runwayEndId: "28R", finalNm: 0.8 });
  const s = sim.state;
  const c = sim.controls;
  const flapIndex = opts.flapIndex ?? 3;
  const hdg0 = sim.lastSpawn!.headingTrue;
  const sp = sim.lastSpawn!;
  const kcas = kiasToKcas(opts.approachKias ?? 61, flapIndex * 10);
  c.flapIndex = flapIndex;
  c.throttle = 0;
  const cross = () => {
    // lateral offset from the extended centreline through the spawn point, ft (+ = right of it)
    const north = (s.lat - sp.lat) * 60 * 6076.115;
    const east = (s.lon - sp.lon) * 60 * 6076.115 * Math.cos((sp.lat * Math.PI) / 180);
    const h = (hdg0 * Math.PI) / 180;
    return { cross: -north * Math.sin(h) + east * Math.cos(h), along: north * Math.cos(h) + east * Math.sin(h) };
  };
  const pilot = new TestPilot({ kcas, rudder: "ball", headingDeg: hdg0 });
  let at50 = Number.NaN;
  let touchdownAt = Number.NaN;
  let tdKcas = 0;
  let tdFpm = 0;
  let tdDrift = 0;
  let tdBank = 0;
  let maxCross = 0;
  let maxHdg = 0;
  let rolling = false;
  let lastVs = 0;
  let iRud = 0;
  let iBank = 0;
  const xw = !!opts.windKt;
  const FLARE_FT = 55;
  const LANDING_PITCH = 7.5;
  let lastCross = cross().cross;
  let pitchApp = Number.NaN;
  fly(sim, 240, null, () => {
    const o = cross();
    if (!rolling) {
      // ---- approach and flare
      if (xw && opts.crosswindTechnique !== false) {
        const crossRate = (o.cross - lastCross) / PILOT_DT; // ft/s, + = drifting right
        if (s.aglFt > 150) {
          // crab on the approach: coordinated, fly whatever heading keeps the track on the centreline
          pilot.t.headingDeg = undefined;
          pilot.t.bankDeg = clamp(-o.cross * 0.12 - crossRate * 1.2, -15, 15);
          pilot.t.rudder = "ball";
        } else {
          // wing-low for the last 150 ft: rudder points the nose down the runway, bank into the wind stops the drift
          const e = norm180(hdg0 - s.headingTrue);
          iRud = clamp(iRud + e * 0.12 * PILOT_DT, -1, 1);
          pilot.t.rudder = clamp(e * 0.1 - s.yawRate * 0.08 + iRud, -1, 1);
          iBank = clamp(iBank - (o.cross * 0.05 + crossRate * 0.3) * PILOT_DT, -10, 10);
          pilot.t.bankDeg = clamp(-o.cross * 0.25 - crossRate * 1.6 + iBank, -12, 12);
        }
      } else if (xw) {
        // no correction at all: wings level, feet still, heading down the runway
        pilot.t.headingDeg = hdg0;
      } else {
        pilot.t.headingDeg = hdg0 + clamp(-o.cross * 0.2, -10, 10);
      }
      lastCross = o.cross;
      if (s.aglFt < FLARE_FT) {
        // round out and flare: raise the nose steadily from the approach attitude to the landing attitude as the
        // runway comes up, then hold it off; the speed bleeds away and the main wheels touch first
        if (Number.isNaN(pitchApp)) pitchApp = s.pitch;
        pilot.t.kcas = undefined;
        pilot.t.pitchDeg = pitchApp + (LANDING_PITCH - pitchApp) * (1 - Math.pow(Math.max(0, s.aglFt) / FLARE_FT, 1.3));
        pilot.t.pitchRateLimit = 7;
      }
      pilot.update(sim, PILOT_DT);
      if (Number.isNaN(at50) && s.aglFt <= 50) at50 = o.along;
      if (s.onGround) {
        rolling = true;
        touchdownAt = o.along;
        tdKcas = s.kcas;
        tdFpm = lastVs;
        tdDrift = norm180(s.headingTrue - s.trackTrue);
        tdBank = s.roll;
        iRud = c.rudder;
      }
      lastVs = s.vsFpm;
    } else {
      // ---- roll-out
      c.throttle = 0;
      c.brakeLeft = c.brakeRight = opts.brake ?? 1;
      c.elevator = clamp(c.elevator + 1.5 * PILOT_DT, -1, 1); // yoke coming back: weight onto the main wheels
      const e = norm180(hdg0 - s.headingTrue) - o.cross * 0.1;
      c.rudder = clamp(e * 0.1 - s.yawRate * 0.07, -1, 1);
      if (xw && opts.crosswindTechnique !== false) {
        const side = Math.sin(((opts.windFromDeg ?? 0) - hdg0) * (Math.PI / 180));
        c.aileron = clamp(side * (1.2 - s.kcas / 80), -1, 1);
      } else c.aileron = clamp(-s.roll * 0.05, -1, 1);
      maxCross = Math.max(maxCross, Math.abs(o.cross));
      maxHdg = Math.max(maxHdg, Math.abs(norm180(hdg0 - s.headingTrue)));
      if (s.gsKt < 1.5) return true;
    }
    return false;
  });
  const end = cross().along;
  const r: LandingResult = {
    touchdownKcas: tdKcas,
    touchdownFpm: tdFpm,
    groundRollFt: end - touchdownAt,
    from50FtFt: end - at50,
    maxCentrelineErrFt: maxCross,
    maxHeadingErrDeg: maxHdg,
    touchdownDriftDeg: tdDrift,
    touchdownBankDeg: tdBank,
    crashed: !!s.crash,
    crashReason: s.crash?.reason ?? "",
  };
  sim.dispose();
  return r;
}

// ---------------------------------------------------------------- ground effect

export interface FloatResult {
  /** Seconds to slow from 68 to 58 KCAS in level flight with the throttle closed. */
  decelSec: number;
  /** Distance covered while doing so, ft. */
  floatFt: number;
  /** Angle of attack and lift/drag ratio passing 63 KCAS. */
  alphaDeg: number;
  liftOverDrag: number;
}

/**
 * Level deceleration with the throttle closed, wheels `wheelHeightFt` above a flat surface.
 * Flown at altitude; the surface under the aircraft is moved up for the flight model only, so the
 * same manoeuvre can be compared far from the ground and just above it.
 */
export async function levelDeceleration(wheelHeightFt: number | null, opts: LabOptions & { flapIndex?: number } = {}): Promise<FloatResult> {
  const sim = await lab(opts);
  const flapIndex = opts.flapIndex ?? 0;
  const alt = 2000;
  await sim.spawn({ kind: "air", lat: 38.5, lon: -98, altFtMsl: alt, headingTrue: 360, kias: 78 });
  const s = sim.state;
  const c = sim.controls;
  c.flapIndex = flapIndex;
  if (wheelHeightFt !== null) {
    const CG_HEIGHT_FT = 4.36;
    sim.use({ name: "test-surface", preStep: (q) => void (q.fdmIn.terrainFt = alt - CG_HEIGHT_FT - wheelHeightFt) });
  }
  const pilot = new TestPilot({ altFt: alt, throttleForKcas: 75, rudder: "ball" });
  fly(sim, 25, pilot);
  pilot.t.throttleForKcas = undefined;
  c.throttle = 0;
  let t68 = -1;
  let d68 = 0;
  let decelSec = -1;
  let floatFt = 0;
  let alphaDeg = 0;
  let ld = 0;
  fly(sim, 60, pilot, (t) => {
    if (t68 < 0 && s.kcas <= 68) {
      t68 = t;
      d68 = s.distanceNm;
    }
    if (alphaDeg === 0 && s.kcas <= 63) {
      alphaDeg = s.alphaDeg;
      ld = prop(sim, "forces/fwz-aero-lbs") / Math.max(1, prop(sim, "forces/fwx-aero-lbs"));
    }
    if (t68 >= 0 && s.kcas <= 58) {
      decelSec = t - t68;
      floatFt = (s.distanceNm - d68) * 6076.115;
      return true;
    }
    return false;
  });
  sim.dispose();
  return { decelSec, floatFt, alphaDeg, liftOverDrag: ld };
}

// ---------------------------------------------------------------- rigging and left-turning tendency

/**
 * The cruise condition the fixed rigging (rudder tab and wing wash-in) is set for:
 * 2,000 lb (one or two people and full fuel), 3,000 ft, 100 KIAS.
 */
export const RIG_POINT = { weightLb: 2000, altFt: 3000, kias: 100 } as const;

export interface CruiseHandsOffResult extends HandsOffResult {
  /** Rudder and aileron the pilot was holding just before letting go (fractions of full travel). */
  rudderHeld: number;
  aileronHeld: number;
  trim: number;
  rpm: number;
  powerHp: number;
}

/** Level cruise, trimmed so that no yoke force is needed, then hands and feet off for `seconds`. */
export async function cruiseHandsOff(opts: LabOptions & { altFt?: number; kias?: number; seconds?: number } = {}): Promise<CruiseHandsOffResult> {
  const altFt = opts.altFt ?? RIG_POINT.altFt;
  const kias = opts.kias ?? RIG_POINT.kias;
  const sim = await lab({ weightLb: RIG_POINT.weightLb, ...opts });
  await airborne(sim, altFt, kias);
  const pilot = new TestPilot({ altFt: mslFt(sim, altFt), throttleForKcas: kiasToKcas(kias), headingDeg: 360, rudder: "ball" });
  fly(sim, 30, pilot);
  trimHandsOff(sim, pilot, 50);
  const c = sim.controls;
  const s = sim.state;
  const held = flyAverage(sim, 10, pilot, () => ({ rud: c.rudder, ail: c.aileron, rpm: s.rpm, hp: s.powerHp }));
  const trim = c.trim;
  const r = handsOff(sim, opts.seconds ?? 60);
  sim.dispose();
  return { ...r, rudderHeld: held.rud, aileronHeld: held.ail, trim, rpm: held.rpm, powerHp: held.hp };
}

export interface ClimbHandsOffResult {
  /** Rudder (fraction of full travel, + = right) needed to keep the slip ball centred in the climb. */
  rudderForBall: number;
  aileronHeld: number;
  /** After `seconds` with hands and feet off: heading change (− = left) and bank (− = left wing down). */
  headingChangeDeg: number;
  bankDeg: number;
  /** With the wings held level by aileron but feet on the floor: sideslip and the ball's sideways force. */
  sideslipFeetOffDeg: number;
  ballFeetOffG: number;
  kcas: number;
}

/** Full-power climb at `kias` (default Vy = 76): what the feet have to do, and what happens if they do nothing. */
export async function climbHandsOff(opts: LabOptions & { kias?: number; seconds?: number; altFt?: number } = {}): Promise<ClimbHandsOffResult> {
  const kias = opts.kias ?? 76;
  const sim = await lab(opts);
  await airborne(sim, opts.altFt ?? 1500, kias);
  const c = sim.controls;
  const s = sim.state;
  c.throttle = 1;
  const kcas = kiasToKcas(kias);
  const pilot = new TestPilot({ kcas, headingDeg: 360, rudder: "ball" });
  fly(sim, 20, pilot);
  trimHandsOff(sim, pilot, 30);
  const held = flyAverage(sim, 5, pilot, () => ({ rud: c.rudder, ail: c.aileron }));
  // wings level with aileron, feet off: where does the ball go?
  const noFeet = new TestPilot({ kcas, bankDeg: 0, rudder: "none" });
  fly(sim, 12, noFeet);
  const slip = flyAverage(sim, 4, noFeet, () => ({ beta: s.betaDeg, ny: s.ny }));
  // back to coordinated, then let go of everything
  fly(sim, 12, pilot);
  const r = handsOff(sim, opts.seconds ?? 15);
  const out = { rudderForBall: held.rud, aileronHeld: held.ail, headingChangeDeg: r.headingChangeDeg, bankDeg: r.bankDeg, sideslipFeetOffDeg: slip.beta, ballFeetOffG: slip.ny, kcas: r.kcas };
  sim.dispose();
  return out;
}

// ---------------------------------------------------------------- trim, flaps, stability

export interface TrimPoint {
  /** Trim-wheel position that gives hands-off flight (−1 full nose-down … +1 full nose-up). */
  trim: number;
  /** Yoke force left over after trimming (0 = truly hands-off). */
  residualElevator: number;
  alphaDeg: number;
  powerHp: number;
  elevatorDeg: number;
  kcas: number;
  vsFpm: number;
}

/** Trim for hands-off flight at `kias`: level flight (throttle as needed) or, with `throttle` given, a climb/descent at that power. */
export async function trimPoint(kias: number, opts: LabOptions & { flapIndex?: number; throttle?: number; altFt?: number } = {}): Promise<TrimPoint> {
  const sim = await lab(opts);
  const flapIndex = opts.flapIndex ?? 0;
  const altFt = opts.altFt ?? 3000;
  await airborne(sim, altFt, Math.max(kias, 68), 0);
  const c = sim.controls;
  const s = sim.state;
  c.flapIndex = flapIndex;
  const kcas = kiasToKcas(kias, flapIndex * 10);
  const pilot = opts.throttle === undefined ? new TestPilot({ altFt: mslFt(sim, altFt), throttleForKcas: kcas, rudder: "ball" }) : new TestPilot({ kcas, rudder: "ball" });
  if (opts.throttle !== undefined) c.throttle = opts.throttle;
  fly(sim, 35, pilot);
  const trim = trimHandsOff(sim, pilot, 50);
  const avg = flyAverage(sim, 8, pilot, () => ({ el: c.elevator, a: s.alphaDeg, hp: s.powerHp, ed: s.surfaces.elevatorDeg, k: s.kcas, vs: s.vsFpm }));
  sim.dispose();
  return { trim, residualElevator: avg.el, alphaDeg: avg.a, powerHp: avg.hp, elevatorDeg: avg.ed, kcas: avg.k, vsFpm: avg.vs };
}

/** Seconds the flaps take to travel from one detent to another. */
export async function flapTravelSec(fromIndex: number, toIndex: number): Promise<number> {
  const sim = await lab();
  await airborne(sim, 3000, 75);
  const c = sim.controls;
  const s = sim.state;
  const pilot = new TestPilot({ kcas: 73, rudder: "ball" });
  c.flapIndex = fromIndex;
  fly(sim, 15, pilot);
  c.flapIndex = toIndex;
  const target = toIndex * 10;
  const t = fly(sim, 30, pilot, () => Math.abs(s.flapsDeg - target) < 0.05);
  sim.dispose();
  return t;
}

/**
 * Trimmed hands-off at 85 KIAS with the flaps up, then one notch of flap is lowered and nothing else is
 * touched: how far the aircraft balloons, and the speed it settles at.
 */
export async function flapExtensionHandsOff(toIndex: number): Promise<{ balloonFt: number; settledKias: number; pitchUpDeg: number }> {
  const sim = await lab({ weightLb: 2200 });
  await airborne(sim, 3000, 85);
  const c = sim.controls;
  const s = sim.state;
  const pilot = new TestPilot({ altFt: 3000, throttleForKcas: kiasToKcas(85), headingDeg: 360, rudder: "ball" });
  fly(sim, 30, pilot);
  trimHandsOff(sim, pilot, 40);
  c.elevator = 0;
  const wings = new TestPilot({ elevator: 0, headingDeg: 360, rudder: "ball" }); // keeps the wings level only
  fly(sim, 5, wings);
  const h0 = s.altMslFt;
  const p0 = s.pitch;
  c.flapIndex = toIndex;
  let maxAlt = h0;
  let maxPitch = p0;
  fly(sim, 12, wings, () => {
    maxAlt = Math.max(maxAlt, s.altMslFt);
    maxPitch = Math.max(maxPitch, s.pitch);
  });
  // let the long, slow speed oscillation (the phugoid) die down, then average over one more cycle
  fly(sim, 60, wings);
  const { kcasToKias } = await import("@/physics/constants");
  const avg = flyAverage(sim, 40, wings, () => ({ k: s.kcas }));
  sim.dispose();
  return { balloonFt: maxAlt - h0, settledKias: kcasToKias(avg.k, toIndex * 10), pitchUpDeg: maxPitch - p0 };
}

/**
 * How much more up-elevator a steady 45°-banked level turn (1.41 g) needs than level flight at the
 * same speed, in degrees of elevator per g: the smaller the number, the lighter and twitchier the
 * aircraft is in pitch.
 */
export async function elevatorPerG(opts: LabOptions = {}, kias = 95): Promise<{ degPerG: number; cgIn: number; weightLb: number }> {
  const sim = await lab(opts);
  await airborne(sim, 4000, kias);
  const s = sim.state;
  const kcas = kiasToKcas(kias);
  const level = new TestPilot({ altFt: 4000, throttleForKcas: kcas, bankDeg: 0, rudder: "ball" });
  fly(sim, 40, level);
  const a = flyAverage(sim, 10, level, () => ({ e: s.surfaces.elevatorDeg, g: s.nz }));
  const turn = new TestPilot({ altFt: 4000, throttleForKcas: kcas, bankDeg: 45, rudder: "ball" });
  fly(sim, 45, turn);
  const b = flyAverage(sim, 10, turn, () => ({ e: s.surfaces.elevatorDeg, g: s.nz }));
  const r = { degPerG: (b.e - a.e) / (b.g - a.g), cgIn: s.cgIn, weightLb: s.weightLb };
  sim.dispose();
  return r;
}

// ---------------------------------------------------------------- engine checks on the ground

/** Parked with the engine stopped (ramp start): seconds of cranking until the engine runs, and the rpm it settles at. */
export async function engineStart(opts: { mixture?: number; magnetos?: 0 | 1 | 2 | 3 } = {}): Promise<{ started: boolean; crankSec: number; idleRpm: number; crankRpm: number }> {
  const sim = await lab();
  await sim.spawn({ kind: "ramp", airportIdent: "KSFO" });
  const c = sim.controls;
  const s = sim.state;
  sim.advance(1);
  c.masterBattery = true;
  c.mixture = opts.mixture ?? 1;
  c.throttle = 0.1;
  const mags = opts.magnetos ?? 3;
  // the key held at START; `magnetos` lets a test crank with the ignition off
  sim.use({
    name: "test-starter",
    preStep: (q) => {
      q.fdmIn.starter = cranking;
      q.fdmIn.magnetos = mags;
    },
  });
  let cranking = true;
  let t = 0;
  let crankRpm = 0;
  while (!s.sys.engineRunning && t < 8) {
    sim.advance(0.05);
    t += 0.05;
    crankRpm = Math.max(crankRpm, s.rpm);
  }
  const started = s.sys.engineRunning;
  cranking = false;
  sim.advance(8);
  const r = { started: started && s.sys.engineRunning, crankSec: t, idleRpm: s.rpm, crankRpm };
  sim.dispose();
  return r;
}

/** The pre-take-off magneto check: set 1700 rpm, switch to one magneto, read the drop. */
export async function magnetoCheck(): Promise<{ rpmBoth: number; dropRight: number; dropLeft: number; rpmAfter: number }> {
  const sim = await lab();
  await sim.spawn({ kind: "runway", airportIdent: "KSFO", runwayEndId: "28R" });
  const c = sim.controls;
  const s = sim.state;
  c.parkingBrake = true;
  let lo = 0.3;
  let hi = 0.9;
  for (let i = 0; i < 14; i++) {
    c.throttle = (lo + hi) / 2;
    sim.advance(6);
    if (s.rpm > 1700) hi = c.throttle;
    else lo = c.throttle;
  }
  const rpmBoth = s.rpm;
  c.ignition = 1; // R
  sim.advance(6);
  const dropRight = rpmBoth - s.rpm;
  c.ignition = 3;
  sim.advance(6);
  c.ignition = 2; // L
  sim.advance(6);
  const dropLeft = rpmBoth - s.rpm;
  c.ignition = 3;
  sim.advance(6);
  const r = { rpmBoth, dropRight, dropLeft, rpmAfter: s.rpm };
  sim.dispose();
  return r;
}
