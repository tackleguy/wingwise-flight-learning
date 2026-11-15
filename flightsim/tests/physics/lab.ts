/**
 * Flight-test helpers for the physics tests: a real Sim (real JSBSim) flown by a simple scripted
 * "test pilot" so that performance and handling can be measured the way a flight-test engineer would.
 *
 * Everything here uses `makeSim` from tests/helpers.ts. Two optional environment variables exist
 * only for tuning the flight model before it is shipped (they are NOT set in normal test runs):
 *   TEACHX_JSBSIM_URL   file URL of a trial build of jsbsim.mjs (made with jsbsim/build.sh OUT=…)
 *   TEACHX_JSBSIM_LIVE  "1" = copy the XML files from flightsim/jsbsim/ into that trial build's
 *                       in-memory file system before flying (needs a TEACHX_JSBSIM_DEV=1 build)
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Sim } from "@/core/sim";
import { clamp, norm180, pressureAtAltitudeInHg } from "@/core/math";
import { loadJsbsim } from "@/physics/jsbsim";
import { kiasToKcas } from "@/physics/constants";
import { EMPTY_WEIGHT_LB } from "@/physics/weight-balance";
import { makeSim } from "../helpers";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

interface DevModule {
  FS?: { writeFile(p: string, data: string): void };
}

const LIVE_FILES = ["aircraft/c172p/c172p.xml", "engine/eng_io320.xml", "engine/prop_75in2f.xml"] as const;
let prepared: Promise<void> | null = null;
/** XML text overrides for parameter sweeps while tuning (file name → transform). */
export const xmlPatches: Partial<Record<(typeof LIVE_FILES)[number], (xml: string) => string>> = {};

/** (Tuning only) point the simulator at a trial build and refresh its XML files from disk. */
export async function prepareModel(force = false): Promise<void> {
  const url = process.env.TEACHX_JSBSIM_URL;
  if (!url) return;
  if (!prepared || force) {
    prepared = (async () => {
      const mod = (await loadJsbsim(url)) as unknown as DevModule;
      if (process.env.TEACHX_JSBSIM_LIVE === "1") {
        if (!mod.FS) throw new Error("TEACHX_JSBSIM_LIVE needs a build made with TEACHX_JSBSIM_DEV=1");
        for (const f of LIVE_FILES) {
          let xml = readFileSync(path.join(process.env.TEACHX_JSBSIM_DATA_DIR ?? path.join(root, "jsbsim"), f), "utf8");
          const patch = xmlPatches[f];
          if (patch) xml = patch(xml);
          mod.FS.writeFile(`/jsbsim/${f}`, xml);
        }
      }
    })();
  }
  await prepared;
}

export const KSFO = { lat: 37.6188, lon: -122.375 };
/** A quiet piece of sky over flat ground used for the airborne tests. */
export const TEST_AREA = { lat: 38.5, lon: -98.0 };

export interface LabOptions {
  /** Ground elevation everywhere, ft (default 0 = sea level). */
  groundFt?: number;
  /** Gross weight to load, lb (default 2400 = maximum). */
  weightLb?: number;
  /** Fuel per tank, US gal (default 20 + 20). */
  fuelGalPerTank?: number;
  /** Explicit cabin load [pilot, front passenger, rear-left, rear-right, baggage], lb (overrides weightLb). */
  payloadLb?: [number, number, number, number, number];
  /** Wind (default calm). */
  windFromDeg?: number;
  windKt?: number;
  /**
   * Lift the whole standard atmosphere by this many feet, so that "sea level" air (29.92 inHg, 15 °C)
   * is found at this height above the (sea-level) ground. Lets sea-level performance be measured in
   * flight with room below the aircraft. Altitudes given to `airborne` are then PRESSURE altitudes.
   */
  seaLevelAtFt?: number;
}

const atmosphereShift = new WeakMap<Sim, number>();
/** Height above mean sea level at which the given standard-atmosphere (pressure) altitude is found in this lab. */
export const mslFt = (sim: Sim, pressureAltFt: number) => pressureAltFt + (atmosphereShift.get(sim) ?? 0);

/** Cabin load that brings the aircraft to `weightLb` with a typical seating order (front seats, rear seats, baggage). */
export function payloadFor(weightLb: number, fuelGalTotal: number): [number, number, number, number, number] {
  let rest = Math.max(0, weightLb - EMPTY_WEIGHT_LB - fuelGalTotal * 6);
  const take = (max: number) => {
    const v = Math.min(max, rest);
    rest -= v;
    return v;
  };
  const front = take(380);
  const rear = take(340);
  const bag = take(120);
  // anything left (only when asked for an overweight aircraft) goes on the rear seats
  return [front / 2, front / 2, rear / 2 + rest / 2, rear / 2 + rest / 2, bag];
}

/** A simulator in calm, standard-atmosphere air, loaded to the requested weight. Call `sim.spawn` next. */
export async function lab(opts: LabOptions = {}): Promise<Sim> {
  await prepareModel();
  const sim = makeSim((opts.groundFt ?? 0) / 3.280839895);
  sim.env.wind = [{ altFtMsl: 0, dirTrue: opts.windFromDeg ?? 0, kt: opts.windKt ?? 0 }];
  sim.env.tempC = 15 - 0.0019812 * (opts.groundFt ?? 0);
  sim.env.stationElevFt = opts.groundFt ?? 0;
  sim.env.qnhInHg = 29.92126;
  sim.env.turbulence = 0;
  sim.env.gustKt = 0;
  if (opts.seaLevelAtFt) {
    // the weather "station" sits at that height and reports standard sea-level pressure and temperature
    sim.env.stationElevFt = opts.seaLevelAtFt;
    sim.env.tempC = 15;
    sim.env.qnhInHg = pressureAtAltitudeInHg(-opts.seaLevelAtFt);
    atmosphereShift.set(sim, opts.seaLevelAtFt);
  }
  const fuel = opts.fuelGalPerTank ?? 20;
  sim.loading.fuelLeftGal = fuel;
  sim.loading.fuelRightGal = fuel;
  sim.loading.payloadLb = opts.payloadLb ?? payloadFor(opts.weightLb ?? 2400, fuel * 2);
  return sim;
}

/**
 * Spawn in the air, trimmed, at an indicated airspeed (converted to calibrated with the POH table).
 * `altFt` is the standard-atmosphere (pressure) altitude; see `LabOptions.seaLevelAtFt`.
 */
export async function airborne(sim: Sim, altFt: number, kias: number, flapIndex = 0, headingTrue = 360): Promise<void> {
  // The core spawns clean; for flap configurations spawn clean, then let the flaps travel.
  await sim.spawn({ kind: "air", lat: TEST_AREA.lat, lon: TEST_AREA.lon, altFtMsl: mslFt(sim, altFt), headingTrue, kias: kiasToKcas(kias, flapIndex * 10) });
  sim.controls.flapIndex = flapIndex;
}

// ---------------------------------------------------------------- the scripted test pilot

export interface PilotTargets {
  /** Hold this calibrated airspeed with pitch (climbs, glides). */
  kcas?: number;
  /** Hold this altitude with pitch (level flight). */
  altFt?: number;
  /** Hold this vertical speed with pitch. */
  vsFpm?: number;
  /** Hold this pitch attitude. */
  pitchDeg?: number;
  /** Raw elevator (−1…1) — overrides every pitch mode. */
  elevator?: number;
  /** Hold this true heading with bank (default: keep wings level). */
  headingDeg?: number;
  /** Hold this bank angle. */
  bankDeg?: number;
  /** Raw aileron — overrides the roll modes. */
  aileron?: number;
  /** "ball" = keep the slip ball centred with rudder (default), "none" = feet on the floor, or a raw value. */
  rudder?: "ball" | "none" | "heading" | number;
  /** Hold this calibrated airspeed with the throttle (only sensible together with altFt / vsFpm). */
  throttleForKcas?: number;
  /** Keep the engine at or below this rpm with the throttle (red line). */
  rpmLimit?: number;
  /** Hold this rpm with the throttle. */
  throttleForRpm?: number;
  /** How fast the pilot changes the pitch attitude, degrees per second (default 4). */
  pitchRateLimit?: number;
  /** Largest pitch attitude the pilot will use, degrees. */
  maxPitchDeg?: number;
  minPitchDeg?: number;
}

/** A simple, well-damped autopilot-like pilot. Create one per manoeuvre; change `t` between phases. */
export class TestPilot {
  t: PilotTargets;
  private iPitch = 0;
  private iElev = 0;
  private iAil = 0;
  private iRud = 0;
  private iThr: number | null = null;
  private pitchCmd: number | null = null;
  private pitchMode = -1;

  constructor(targets: PilotTargets = {}) {
    this.t = targets;
  }

  /** Forget integrators (call after a big configuration change). */
  reset(): void {
    this.iPitch = this.iElev = this.iAil = this.iRud = 0;
    this.iThr = null;
    this.pitchCmd = null;
    this.pitchMode = -1;
  }

  update(sim: Sim, dt: number): void {
    const s = sim.state;
    const c = sim.controls;
    const t = this.t;

    // ---- pitch
    if (t.elevator !== undefined) {
      c.elevator = t.elevator;
    } else {
      let pitchCmd: number | undefined = t.pitchDeg;
      const maxP = t.maxPitchDeg ?? 20;
      const minP = t.minPitchDeg ?? -20;
      const mode = t.kcas !== undefined ? 1 : t.altFt !== undefined || t.vsFpm !== undefined ? 2 : 0;
      if (mode !== this.pitchMode) {
        // start from the attitude the aircraft has now (no bump when the pilot takes over or changes task)
        this.iPitch = s.pitch;
        this.pitchMode = mode;
      }
      if (mode === 1) {
        // too fast → raise the nose
        const err = s.kcas - t.kcas!;
        this.iPitch = clamp(this.iPitch + err * 0.12 * dt, -25, 25);
        pitchCmd = clamp(err * 0.55 + this.iPitch, minP, maxP);
      } else if (mode === 2) {
        const vsCmd = t.vsFpm ?? clamp((t.altFt! - s.altMslFt) * 6, -700, 700);
        const err = vsCmd - s.vsFpm;
        this.iPitch = clamp(this.iPitch + err * 0.0022 * dt, -25, 25);
        pitchCmd = clamp(err * 0.0035 + this.iPitch, minP, maxP);
      }
      if (pitchCmd !== undefined) {
        if (this.pitchCmd === null) this.pitchCmd = s.pitch;
        // rate-limit attitude changes so the pilot is smooth
        const rate = t.pitchRateLimit ?? 4;
        this.pitchCmd += clamp(pitchCmd - this.pitchCmd, -rate * dt, rate * dt);
        const e = this.pitchCmd - s.pitch;
        this.iElev = clamp(this.iElev + e * 0.06 * dt, -1, 1);
        c.elevator = clamp(e * 0.09 - s.pitchRate * 0.035 + this.iElev, -1, 1);
      }
    }

    // ---- roll
    if (t.aileron !== undefined) {
      c.aileron = t.aileron;
    } else {
      let bankCmd = t.bankDeg ?? 0;
      if (t.headingDeg !== undefined) bankCmd = clamp(norm180(t.headingDeg - s.headingTrue) * 1.2, -20, 20);
      const e = bankCmd - s.roll;
      this.iAil = clamp(this.iAil + e * 0.01 * dt, -0.5, 0.5);
      c.aileron = clamp(e * 0.035 - s.rollRate * 0.012 + this.iAil, -1, 1);
    }

    // ---- yaw
    const r = t.rudder ?? "ball";
    if (typeof r === "number") c.rudder = r;
    else if (r === "none") c.rudder = 0;
    else if (r === "heading") {
      const e = norm180((t.headingDeg ?? s.headingTrue) - s.headingTrue);
      c.rudder = clamp(e * 0.08 - s.yawRate * 0.06, -1, 1);
    } else {
      // ball: a sideways force toward the right wing (ny > 0) throws the ball LEFT → "step on the ball" = left rudder
      this.iRud = clamp(this.iRud - s.ny * 2.5 * dt, -1, 1);
      c.rudder = clamp(-s.ny * 1.5 + this.iRud, -1, 1);
    }

    // ---- throttle
    if (t.throttleForKcas !== undefined) {
      if (this.iThr === null) this.iThr = c.throttle;
      const e = t.throttleForKcas - s.kcas;
      this.iThr = clamp(this.iThr + e * 0.012 * dt, 0, 1);
      c.throttle = clamp(this.iThr + e * 0.04, 0, 1);
    } else if (t.throttleForRpm !== undefined) {
      if (this.iThr === null) this.iThr = c.throttle;
      const e = t.throttleForRpm - s.rpm;
      this.iThr = clamp(this.iThr + e * 0.0006 * dt, 0, 1);
      c.throttle = clamp(this.iThr + e * 0.0006, 0, 1);
    }
    if (t.rpmLimit !== undefined) {
      // full throttle unless that would overspeed the engine: then hold the red line
      if (this.iThr === null) this.iThr = c.throttle;
      const e = t.rpmLimit - s.rpm;
      this.iThr = clamp(this.iThr + e * 0.0008 * dt, 0, 1);
      c.throttle = clamp(this.iThr + e * 0.0008, 0, 1);
    }
  }
}

export const PILOT_DT = 1 / 30;

/** Fly for `seconds`, letting `pilot` move the controls 30 times a second. `each` may return true to stop early. */
export function fly(sim: Sim, seconds: number, pilot: TestPilot | null, each?: (t: number) => boolean | void): number {
  let t = 0;
  while (t < seconds - 1e-9 && !sim.state.crash) {
    pilot?.update(sim, PILOT_DT);
    sim.advance(PILOT_DT);
    t += PILOT_DT;
    if (each?.(t) === true) break;
  }
  return t;
}

/** Average of a sampled quantity while flying. */
export function flyAverage<K extends string>(sim: Sim, seconds: number, pilot: TestPilot | null, sample: () => Record<K, number>): Record<K, number> {
  const sum = {} as Record<K, number>;
  let n = 0;
  fly(sim, seconds, pilot, () => {
    const v = sample();
    for (const k in v) sum[k] = (sum[k] ?? 0) + v[k];
    n++;
  });
  for (const k in sum) sum[k] /= Math.max(1, n);
  return sum;
}

export const prop = (sim: Sim, name: string) => sim.fdm!.getProperty(name);

const RAW_HEALTH = ["position/h-sl-ft", "position/lat-geod-deg", "attitude/phi-deg", "attitude/theta-deg", "velocities/vc-kts", "velocities/p-rad_sec", "velocities/q-rad_sec", "velocities/r-rad_sec", "aero/alpha-deg", "propulsion/engine/power-hp", "propulsion/engine/engine-rpm", "propulsion/engine/thrust-lbs", "accelerations/n-pilot-z-norm", "moments/l-total-lbsft", "moments/m-total-lbsft", "moments/n-total-lbsft", "forces/fbz-total-lbs"];

/** True when every number that matters is finite — in the state AND inside JSBSim (the adapter reports NaN as 0). */
export function stateIsFinite(sim: Sim): boolean {
  const s = sim.state;
  const fdm = sim.fdm;
  if (fdm) for (const p of RAW_HEALTH) if (!Number.isFinite(fdm.getProperty(p))) return false;
  const v = [s.lat, s.lon, s.altMslFt, s.pitch, s.roll, s.headingTrue, s.kcas, s.ktas, s.vsFpm, s.alphaDeg, s.betaDeg, s.nz, s.ny, s.rpm, s.rollRate, s.pitchRate, s.yawRate, s.thrustLb, s.powerHp, s.weightLb, s.cgIn, s.fuelFlowGph];
  return v.every((x) => Number.isFinite(x));
}
