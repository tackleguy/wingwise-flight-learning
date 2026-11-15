/**
 * A simple robot pilot for the instrument tests. It flies the REAL flight model through
 * `sim.controls` (aileron, elevator, rudder, throttle) using the TRUE state, so the instruments
 * under test never influence the manoeuvre they are being checked against.
 */
import { createInstruments, type InstrumentsApi } from "@/instruments";
import type { Sim } from "@/core/sim";
import type { SpawnRequest } from "@/core/types";
import { makeSim } from "../helpers";

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
const norm180 = (d: number) => ((((d + 180) % 360) + 360) % 360) - 180;

export interface Targets {
  /** Bank angle to hold, degrees (+ = right). Ignored when `headingTrue` is given. */
  bankDeg?: number;
  /** True heading to turn to and hold (uses up to `maxBankDeg` of bank). */
  headingTrue?: number;
  maxBankDeg?: number;
  /** Exactly one of these three: pitch attitude, altitude or vertical speed to hold. */
  pitchDeg?: number;
  altFt?: number;
  vsFpm?: number;
  /** Rudder: a fixed deflection, or "coordinate" to keep the ball centred. Default "coordinate". */
  rudder?: number | "coordinate";
  /** Throttle: a fixed setting, or leave undefined to keep the present setting. */
  throttle?: number;
  /** Hold this calibrated airspeed with the throttle. */
  kcas?: number;
}

export class Pilot {
  private elevInt = 0;
  private pitchInt = 0;
  private rudInt = 0;
  private thrInt: number | null = null;

  constructor(readonly sim: Sim) {}

  /** Fly for `seconds`, holding the targets. `each` is called after every physics step. */
  fly(seconds: number, t: Targets, each?: (time: number) => void): void {
    const sim = this.sim;
    const s = sim.state;
    const c = sim.controls;
    const dt = 1 / 120;
    const steps = Math.round(seconds / dt);
    for (let i = 0; i < steps; i++) {
      // --- roll
      let bankCmd = t.bankDeg ?? 0;
      if (t.headingTrue !== undefined) {
        const lim = t.maxBankDeg ?? 20;
        bankCmd = clamp(norm180(t.headingTrue - s.headingTrue) * 1.2, -lim, lim);
      }
      c.aileron = clamp((bankCmd - s.roll) * 0.06 - s.rollRate * 0.025, -1, 1);

      // --- pitch
      let pitchCmd = t.pitchDeg;
      if (pitchCmd === undefined) {
        let vsCmd = t.vsFpm ?? 0;
        if (t.altFt !== undefined) vsCmd = clamp((t.altFt - s.altMslFt) * 8, -700, 700);
        const e = vsCmd - s.vsFpm;
        this.pitchInt = clamp(this.pitchInt + e * 0.0008 * dt, -12, 15);
        pitchCmd = clamp(this.pitchInt + e * 0.004, -15, 18);
      }
      const pe = pitchCmd - s.pitch;
      this.elevInt = clamp(this.elevInt + pe * 0.05 * dt, -0.8, 0.8);
      c.elevator = clamp(pe * 0.09 - s.pitchRate * 0.03 + this.elevInt, -1, 1);

      // --- rudder
      const rud = t.rudder ?? "coordinate";
      if (rud === "coordinate") {
        // ny > 0 means the airframe is being pushed toward the right wing (ball left): step on the left pedal.
        // A yaw damper (against any yaw rate other than the one a coordinated turn needs) keeps it steady.
        const yawWanted = (57.2958 * 32.174 * Math.sin((s.roll * Math.PI) / 180)) / Math.max(40, s.ktas * 1.6878);
        this.rudInt = clamp(this.rudInt - s.ny * 0.8 * dt, -0.6, 0.6);
        c.rudder = clamp(this.rudInt - s.ny * 1.0 - (s.yawRate - yawWanted) * 0.04, -1, 1);
      } else {
        c.rudder = rud;
      }

      // --- power
      if (t.kcas !== undefined) {
        this.thrInt ??= c.throttle;
        const e = t.kcas - s.kcas;
        this.thrInt = clamp(this.thrInt + e * 0.01 * dt, 0, 1);
        c.throttle = clamp(this.thrInt + e * 0.03, 0, 1);
      } else if (t.throttle !== undefined) {
        c.throttle = t.throttle;
      }

      sim.advance(dt);
      each?.(s.time);
      if (s.crash) throw new Error(`The test aircraft crashed: ${s.crash.reason}`);
    }
  }

  /** Start pitch hold from the present attitude (avoids a bump when switching targets). */
  syncPitch(): void {
    this.pitchInt = this.sim.state.pitch;
  }
}

export interface Rig {
  sim: Sim;
  inst: InstrumentsApi;
  pilot: Pilot;
}

/** A simulator with the instruments module installed, spawned and ready, plus a robot pilot. */
export async function makeRig(req: SpawnRequest, opts: { elevM?: number; seed?: number; setup?: (sim: Sim) => void } = {}): Promise<Rig> {
  const sim = makeSim(opts.elevM ?? 0);
  // Calm, standard day unless a test says otherwise.
  sim.env.wind = [{ altFtMsl: 0, dirTrue: 0, kt: 0 }];
  opts.setup?.(sim);
  const inst = sim.use(createInstruments({ seed: opts.seed ?? 1 }));
  await sim.spawn(req);
  const pilot = new Pilot(sim);
  pilot.syncPitch();
  return { sim, inst, pilot };
}

/** Cruise start: in the air, 100 kt, 3,500 ft, over the middle of the USA unless told otherwise. */
export const cruise = (headingTrue: number, lat = 40, lon = -100, extra: Partial<SpawnRequest> = {}): SpawnRequest => ({
  kind: "air",
  lat,
  lon,
  altFtMsl: 3500,
  headingTrue,
  kias: 100,
  ...extra,
});

export { norm180 };

/**
 * A stand-in for the real systems module: it only writes the electrical and vacuum values the
 * instruments read from `sim.state.sys`, so tests can switch power and suction on and off.
 */
export function stubSystems(sim: Sim, initial: { busVolts?: number; vacuumInHg?: number } = {}) {
  const values = { busVolts: initial.busVolts ?? 28, vacuumInHg: initial.vacuumInHg ?? 5, batteryAmps: undefined as number | undefined };
  const write = () => {
    const sys = sim.state.sys;
    sys.busVolts = values.busVolts;
    sys.vacuumInHg = values.vacuumInHg;
    sys.alternatorOnline = values.busVolts > 26;
    if (values.batteryAmps !== undefined) sys.batteryAmps = values.batteryAmps;
  };
  sim.use({ name: "systems", onSpawn: write, postStep: write });
  return values;
}
