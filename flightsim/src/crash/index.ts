/**
 * Crash module (`sim.use(createCrash(world))`, name "crash"; register it BEFORE the views module).
 *
 * When the simulator decides the aircraft has crashed it stops the flight model; from then on this
 * module moves the aircraft with rigid-body crash physics (./wreck.ts, Rapier): the aircraft keeps
 * its speed and spin, hits, bounces, slides and tumbles; landing gear, wings and tail can break off
 * and go their own way. It writes the fuselage's position and attitude into `sim.state` every frame
 * (so the camera and the 3D model follow), publishes the broken-off pieces for the views module
 * (`parts`), raises dust, smoke and impact sounds, and emits `crashSettled` when everything has come
 * to rest. A new start (spawn) clears it all.
 */
import { FG_MODELS } from "@/aircraft/fg-models.gen";
import type { Sim, SimModule } from "@/core/sim";
import type { CrashCause, CrashInfo, SpawnResult } from "@/core/types";
import type { World } from "@/world/world";
import { CrashEffects, CrashSounds } from "./effects";
import { Wreck, loadRapier, type Airframe, type AirframePart, type PartName, type PartView, type WreckStart } from "./wreck";

export type { PartName, PartView } from "./wreck";

const LB = 0.45359237;

export interface CrashModule extends SimModule {
  readonly name: "crash";
  /** The pieces of the aircraft while a crash is being simulated (null otherwise). */
  readonly parts: readonly PartView[] | null;
  /** A crash is being simulated or has been. */
  readonly active: boolean;
  /** The wreck has come to rest. */
  readonly settled: boolean;
  /** Resolves when the crash simulation of the current crash has been built (tests). */
  whenReady(): Promise<void>;
}

/** Pieces already broken by what caused the crash. */
function brokenBy(cause: CrashCause | undefined): PartName[] {
  if (cause === "hard-landing") return ["gear_left", "gear_right", "gear_nose", "gear_tail", "gear"];
  if (cause === "nose-over") return ["gear_nose"];
  return [];
}

/** The aircraft's pieces from its 3D model's crash data; a single box when the model has none. */
function airframeOf(sim: Sim): Airframe {
  const meta = (FG_MODELS as Record<string, (typeof FG_MODELS)[keyof typeof FG_MODELS] | undefined>)[sim.aircraft.id];
  const massKg = (sim.state.weightLb > 100 ? sim.state.weightLb : 2300) * LB;
  const gearDown = sim.state.gearPosNorm > 0.5;
  if (meta?.crash) {
    const parts: AirframePart[] = [];
    for (const [name, p] of Object.entries(meta.crash.parts as Record<string, (AirframePart & { parent?: string; retractable?: boolean }) | undefined>)) {
      if (!p) continue;
      parts.push({ name, nodes: p.nodes, min: p.min, max: p.max, ...(p.parent ? { parent: p.parent } : {}), ...(p.retractable ? { retractable: true } : {}) });
    }
    return { massKg, gearDown, parts };
  }
  const b = meta?.bounds ?? [
    [-5, -1.3, -4],
    [5, 1.3, 2],
  ];
  return { massKg, gearDown, parts: [{ name: "body", nodes: [], min: b[0] as [number, number, number], max: b[1] as [number, number, number] }] };
}

export function createCrash(world: World | null): CrashModule {
  let simRef: Sim | null = null;
  let off: (() => void) | null = null;
  let wreck: Wreck | null = null;
  let token = 0;
  let active = false;
  let settled = false;
  let ready: Promise<void> = Promise.resolve();
  const effects = world ? new CrashEffects(world) : null;
  const sounds = typeof window !== "undefined" ? new CrashSounds() : null;
  let preloadTimer: ReturnType<typeof setTimeout> | null = null;

  const finish = (sim: Sim) => {
    if (settled) return;
    settled = true;
    const piecesOff = wreck ? wreck.parts.filter((p) => p.detached).length : 0;
    sim.events.emit("crashSettled", { timeSec: sim.state.time, piecesOff });
  };

  const begin = (sim: Sim, info: CrashInfo) => {
    const t = ++token;
    wreck?.dispose();
    wreck = null;
    active = true;
    settled = false;
    const s = sim.state;
    const speedKt = Math.hypot(s.vNorthKt, s.vEastKt, s.vsFpm / 101.27);
    sounds?.play(0.3 + speedKt / 80, sim.settings.masterVolume);
    // A flight model that went numerically wrong has no state worth continuing from.
    if (info.cause === "unstable" || ![s.lat, s.lon, s.altMslFt, s.pitch, s.roll, s.headingTrue].every(Number.isFinite)) {
      finish(sim);
      return;
    }
    const start: WreckStart = {
      lat: s.lat,
      lon: s.lon,
      altMslFt: s.altMslFt,
      groundElevFt: s.groundElevFt,
      headingTrue: s.headingTrue,
      pitch: s.pitch,
      roll: s.roll,
      vNorthKt: s.vNorthKt,
      vEastKt: s.vEastKt,
      vsFpm: s.vsFpm,
      rollRate: s.rollRate,
      pitchRate: s.pitchRate,
      yawRate: s.yawRate,
      broken: brokenBy(info.cause),
    };
    const airframe = airframeOf(sim);
    ready = loadRapier()
      .then((R) => {
        if (t !== token) return;
        wreck = Wreck.create(R, airframe, start, (lat, lon) => sim.elevation.groundFt(lat, lon));
      })
      .catch((err: unknown) => {
        console.error("[SkyReady] crash physics could not start; the aircraft stays where it hit", err);
        if (t === token) finish(sim);
      });
  };

  const api: CrashModule = {
    name: "crash",
    get parts() {
      return wreck ? wreck.parts : null;
    },
    get active() {
      return active;
    },
    get settled() {
      return settled;
    },
    whenReady() {
      return ready;
    },

    onSpawn(sim: Sim, _r: SpawnResult) {
      if (simRef !== sim) {
        off?.();
        simRef = sim;
        off = sim.events.on("crash", (info) => begin(sim, info));
      }
      token++;
      wreck?.dispose();
      wreck = null;
      active = false;
      settled = false;
      effects?.clear();
      // fetch the physics engine in the background, so it is there before it is needed
      if (typeof window !== "undefined" && !preloadTimer) preloadTimer = setTimeout(() => void loadRapier().catch(() => undefined), 4000);
    },

    frame(sim: Sim, dt: number) {
      if (sim !== simRef) return;
      const w = wreck;
      let smokeFrom: { lat: number; lon: number; altMslFt: number } | null = null;
      if (w && !sim.paused) {
        w.step(dt);
        const p = w.pose();
        const s = sim.state;
        s.lat = p.lat;
        s.lon = p.lon;
        s.altMslFt = p.altMslFt;
        s.headingTrue = p.headingTrue;
        s.pitch = p.pitch;
        s.roll = p.roll;
        s.rollRate = p.rollRate;
        s.pitchRate = p.pitchRate;
        s.yawRate = p.yawRate;
        s.vNorthKt = p.vNorthKt;
        s.vEastKt = p.vEastKt;
        s.vsFpm = p.vsFpm;
        s.gsKt = Math.hypot(p.vNorthKt, p.vEastKt);
        if (s.gsKt > 1) s.trackTrue = (Math.atan2(p.vEastKt, p.vNorthKt) * (180 / Math.PI) + 360) % 360;
        s.kcas = s.ktas = p.speedKt;
        s.onGround = true;
        // the propeller (or fan) stops
        const k = Math.exp(-dt / 0.35);
        s.rpm *= k;
        s.n1Pct *= k;
        s.powerHp = 0;
        s.thrustLb = 0;
        const g = sim.elevation.groundFt(p.lat, p.lon);
        if (g !== null) s.groundElevFt = g;
        s.aglFt = Math.max(0, s.altMslFt - sim.aircraft.cgHeightFt - s.groundElevFt);
        for (const im of w.drainImpacts()) {
          effects?.impact(im.lat, im.lon, im.altMslFt, im.strength);
          if (im.strength > 0.12 || im.broke) sounds?.play(0.25 + im.strength, sim.settings.masterVolume);
        }
        if (w.settled) finish(sim);
        smokeFrom = { lat: p.lat, lon: p.lon, altMslFt: p.altMslFt };
      } else if (w) smokeFrom = w.pose();
      if (effects) {
        if (active) effects.setLight(sim.env.utcMs, sim.state.lat, sim.state.lon);
        effects.update(sim.paused ? 0 : dt, smokeFrom);
      }
    },

    dispose() {
      off?.();
      off = null;
      token++;
      wreck?.dispose();
      wreck = null;
      effects?.destroy();
      sounds?.close();
      if (preloadTimer) clearTimeout(preloadTimer);
      simRef = null;
    },
  };
  return api;
}
