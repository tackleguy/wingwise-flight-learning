/**
 * Crash physics for the Scenario Simulator's 3D view.
 *
 * When the flight ends in a crash, the simple flight model stops (src/sim/engine.ts keeps how the
 * aircraft was moving in `crashMotion`). From that moment the aircraft is moved by rigid-body crash
 * physics: it keeps its speed and spin, hits, bounces, slides and tumbles, and landing gear, wings
 * and tail break off. The physics is the same as the World Flight Simulator's —
 * flightsim/src/crash/wreck.ts, using Rapier (open source, Apache-2.0, https://rapier.rs), which is
 * downloaded only when a crash happens. Pieces are the FlightGear model's own parts (the crash data
 * stored in each model file); dust, smoke and an impact thump are made here.
 *
 * Frames: the 3D view's world is x east, y up, z south (metres) — the same axes as the physics.
 */
import * as THREE from "three";
import {
  Wreck,
  type Airframe,
  type AirframePart,
  type PartName,
  type WreckPose,
} from "../../../flightsim/src/crash/wreck";
import type { CrashMotion } from "@/sim/types";
import type { FgAircraft } from "./fg-aircraft";

const M_PER_FT = 0.3048;
const LB = 0.45359237;

type Rapier = typeof import("@dimforge/rapier3d-compat");
let rapier: Promise<Rapier> | null = null;

/**
 * Download and start Rapier (browser only). The server build leaves it out completely: the
 * `import.meta.env.SSR` test is decided when the site is built, so the import disappears there.
 */
function loadPhysics(): Promise<Rapier> {
  if (import.meta.env.SSR)
    return Promise.reject(new Error("crash physics runs in the browser only"));
  rapier ??= import("@dimforge/rapier3d-compat")
    .then(async (mod) => {
      const R = ((mod as unknown as { default?: Rapier }).default ?? mod) as Rapier;
      // the compat build hands its embedded WebAssembly over the old way and warns about it: noise
      const warn = console.warn;
      console.warn = (...a: unknown[]) => {
        if (!String(a[0]).includes("deprecated parameters")) warn(...a);
      };
      try {
        await R.init();
      } finally {
        console.warn = warn;
      }
      return R;
    })
    .catch((err: unknown) => {
      rapier = null;
      throw err;
    });
  return rapier;
}

/** Pieces already broken by what caused the crash. */
function brokenBy(m: CrashMotion): PartName[] {
  if (m.structural) return ["wing_left", "wing_right"];
  if (/hard impact/i.test(m.reason))
    return ["gear_left", "gear_right", "gear_nose", "gear_tail", "gear"];
  if (/nose-first/i.test(m.reason)) return ["gear_nose"];
  return [];
}

function airframeOf(m: CrashMotion, fg: FgAircraft | null, spanM: number): Airframe {
  const massKg = Math.max(300, m.weightLb * LB);
  const parts: AirframePart[] = [];
  if (fg?.crash) {
    const k = fg.scale;
    for (const [name, p] of Object.entries(fg.crash.parts)) {
      if (!p) continue;
      parts.push({
        name: name as PartName,
        nodes: p.nodes,
        min: [p.min[0] * k, p.min[1] * k, p.min[2] * k],
        max: [p.max[0] * k, p.max[1] * k, p.max[2] * k],
      });
    }
  }
  if (!parts.length) {
    // the simple drawn shape: one box the size of the aircraft
    const len = spanM * 0.8;
    parts.push({
      name: "body",
      nodes: [],
      min: [-spanM / 2, -0.6, -len / 2],
      max: [spanM / 2, 1, len / 2],
    });
  }
  return { massKg, gearDown: m.gearDown, parts };
}

// ---------------------------------------------------------------- dust and smoke

function puffTexture(): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d");
  if (g) {
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    for (let i = 0; i <= 8; i++) {
      const r = i / 8;
      grad.addColorStop(
        r,
        `rgba(255,255,255,${(0.85 * Math.exp(-4 * r * r) * (1 - r)).toFixed(3)})`,
      );
    }
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

interface Puff {
  sprite: THREE.Sprite;
  vel: THREE.Vector3;
  age: number;
  life: number;
  size0: number;
  size1: number;
  alpha: number;
  rise: number;
}

class Puffs {
  readonly group = new THREE.Group();
  private readonly tex = puffTexture();
  private readonly live: Puff[] = [];
  private seed = 20261116;

  private rand(): number {
    this.seed ^= this.seed << 13;
    this.seed ^= this.seed >>> 17;
    this.seed ^= this.seed << 5;
    return (this.seed >>> 0) / 4294967296;
  }

  spawn(
    at: THREE.Vector3,
    vel: THREE.Vector3,
    o: { life: number; size0: number; size1: number; alpha: number; color: number; rise: number },
  ): void {
    if (this.live.length > 300) this.remove(0);
    const mat = new THREE.SpriteMaterial({
      map: this.tex,
      color: o.color,
      transparent: true,
      depthWrite: false,
      opacity: 0,
    });
    const sprite = new THREE.Sprite(mat);
    sprite.position.copy(at);
    sprite.scale.setScalar(o.size0);
    this.group.add(sprite);
    this.live.push({
      sprite,
      vel,
      age: 0,
      life: o.life,
      size0: o.size0,
      size1: o.size1,
      alpha: o.alpha,
      rise: o.rise,
    });
  }

  dust(at: THREE.Vector3, strength: number): void {
    const n = Math.round(3 + 14 * strength);
    for (let i = 0; i < n; i++) {
      const a = this.rand() * Math.PI * 2;
      const sp = (2 + 7 * strength) * (0.4 + 0.6 * this.rand());
      const shade = 0.5 + 0.12 * this.rand();
      const color = new THREE.Color(shade + 0.1, shade + 0.03, shade - 0.07).getHex();
      this.spawn(
        at.clone().setY(at.y + 0.3),
        new THREE.Vector3(Math.cos(a) * sp, (0.8 + 3 * strength) * this.rand(), Math.sin(a) * sp),
        {
          life: 1.8 + 2 * this.rand() + 1.5 * strength,
          size0: 0.8 + 1.2 * strength,
          size1: 3 + 6 * strength + 2 * this.rand(),
          alpha: 0.4 + 0.3 * strength,
          color,
          rise: 0.2,
        },
      );
    }
  }

  smoke(at: THREE.Vector3): void {
    const g = 0.16 + 0.08 * this.rand();
    this.spawn(
      at.clone().setY(at.y + 1),
      new THREE.Vector3(0.6 * (this.rand() - 0.5), 1.5 + this.rand(), 0.6 * (this.rand() - 0.5)),
      {
        life: 6 + 3 * this.rand(),
        size0: 1,
        size1: 7 + 4 * this.rand(),
        alpha: 0.32,
        color: new THREE.Color(g, g, g).getHex(),
        rise: 0.6,
      },
    );
  }

  update(dt: number): void {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const p = this.live[i]!;
      p.age += dt;
      if (p.age >= p.life) {
        this.remove(i);
        continue;
      }
      p.vel.multiplyScalar(Math.exp(-dt * 1.6));
      p.vel.y += p.rise * dt;
      p.sprite.position.addScaledVector(p.vel, dt);
      const k = p.age / p.life;
      p.sprite.scale.setScalar(p.size0 + (p.size1 - p.size0) * Math.sqrt(k));
      (p.sprite.material as THREE.SpriteMaterial).opacity =
        p.alpha * (1 - k) * Math.min(1, p.age * 8);
    }
  }

  private remove(i: number): void {
    const p = this.live[i]!;
    this.group.remove(p.sprite);
    (p.sprite.material as THREE.SpriteMaterial).dispose();
    this.live.splice(i, 1);
  }

  dispose(): void {
    while (this.live.length) this.remove(this.live.length - 1);
    this.tex.dispose();
  }
}

// ---------------------------------------------------------------- the thump

/** A short synthesised impact: a low thud and a burst of crunching noise. Silent without Web Audio. */
class Thump {
  private ctx: AudioContext | null = null;
  private noise: AudioBuffer | null = null;
  private lastAt = -1;
  private failed = false;

  play(strength: number): void {
    if (this.failed) return;
    try {
      if (!this.ctx) {
        const AC = (globalThis as unknown as { AudioContext?: typeof AudioContext }).AudioContext;
        if (!AC) {
          this.failed = true;
          return;
        }
        this.ctx = new AC();
        const sr = this.ctx.sampleRate;
        this.noise = this.ctx.createBuffer(1, sr, sr);
        const d = this.noise.getChannelData(0);
        let s = 12345;
        for (let i = 0; i < d.length; i++) {
          s = (s * 1103515245 + 12345) & 0x7fffffff;
          d[i] = (s / 0x7fffffff) * 2 - 1;
        }
      }
      const ctx = this.ctx;
      if (ctx.state === "suspended") void ctx.resume();
      const t0 = ctx.currentTime + 0.01;
      if (t0 - this.lastAt < 0.12) return;
      this.lastAt = t0;
      const k = Math.max(0.15, Math.min(1, strength)) * 0.5;
      // low thud
      const osc = ctx.createOscillator();
      osc.frequency.setValueAtTime(70, t0);
      osc.frequency.setTargetAtTime(28, t0, 0.2);
      const og = ctx.createGain();
      og.gain.setValueAtTime(0, t0);
      og.gain.linearRampToValueAtTime(0.9 * k, t0 + 0.004);
      og.gain.setTargetAtTime(0, t0 + 0.004, 0.25);
      osc.connect(og).connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + 2);
      // crunch
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      const f = ctx.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.value = 900;
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(0, t0);
      ng.gain.linearRampToValueAtTime(1.2 * k, t0 + 0.003);
      ng.gain.setTargetAtTime(0, t0 + 0.003, 0.14);
      src.connect(f).connect(ng).connect(ctx.destination);
      src.start(t0);
      src.stop(t0 + 1.2);
    } catch {
      this.failed = true;
    }
  }

  close(): void {
    void this.ctx?.close().catch(() => undefined);
    this.ctx = null;
  }
}

// ---------------------------------------------------------------- the crash scene

export class CrashScene {
  /** Dust and smoke: add this group to the scene once. */
  readonly effects: THREE.Group;
  /** The wreck has come to rest (or the crash physics could not start). */
  settled = false;
  private wreck: Wreck | null = null;
  private readonly puffs = new Puffs();
  private readonly thump = new Thump();
  private smokeLeft = 0;
  private smokeAcc = 0;
  private fg: FgAircraft | null = null;
  private readonly moved = new Set<THREE.Object3D>();
  private disposed = false;
  private onSettled: (() => void) | null = null;
  private readonly m4 = new THREE.Matrix4();
  private readonly base = new THREE.Matrix4();

  constructor(
    private readonly toWorld: (lat: number, lon: number, altFt: number) => THREE.Vector3,
  ) {
    this.effects = this.puffs.group;
  }

  /** A crash is being simulated. */
  get active(): boolean {
    return this.wreck !== null;
  }

  /**
   * Start from the engine's crash motion. `gearDropM` is how far the model's origin sits above its
   * wheels (the engine's altitude is the wheels'). Calls `onSettled` once everything has stopped.
   */
  async start(
    m: CrashMotion,
    fg: FgAircraft | null,
    gearDropM: number,
    spanM: number,
    groundFt: (lat: number, lon: number) => number,
    onSettled: () => void,
  ): Promise<void> {
    this.onSettled = onSettled;
    this.fg = fg;
    this.thump.play(0.3 + m.gsKt / 80);
    try {
      const R = await loadPhysics();
      if (this.disposed) return;
      const tr = (m.track * Math.PI) / 180;
      this.wreck = Wreck.create(
        R,
        airframeOf(m, fg, spanM),
        {
          lat: m.lat,
          lon: m.lon,
          altMslFt: m.altMslFt + gearDropM / M_PER_FT,
          groundElevFt: groundFt(m.lat, m.lon),
          headingTrue: m.heading,
          pitch: m.pitch,
          roll: m.bank,
          vNorthKt: m.gsKt * Math.cos(tr),
          vEastKt: m.gsKt * Math.sin(tr),
          vsFpm: m.vsFpm,
          rollRate: m.rollRate,
          pitchRate: m.pitchRate,
          yawRate: m.yawRate,
          broken: brokenBy(m),
        },
        groundFt,
      );
    } catch (err) {
      console.error("[SkyReady] crash physics could not start", err);
      this.finish();
    }
  }

  private finish(): void {
    if (this.settled) return;
    this.settled = true;
    this.onSettled?.();
  }

  /** Advance (not while paused) and return where the aircraft is now, or null when no wreck is running. */
  update(dt: number, paused: boolean): WreckPose | null {
    const w = this.wreck;
    if (!w) {
      this.puffs.update(paused ? 0 : dt);
      return null;
    }
    if (!paused) {
      w.step(dt);
      for (const im of w.drainImpacts()) {
        this.puffs.dust(this.toWorld(im.lat, im.lon, im.altMslFt), im.strength);
        if (im.strength > 0.12 || im.broke) this.thump.play(0.25 + im.strength);
        if (im.strength > 0.7) this.smokeLeft = Math.max(this.smokeLeft, 25);
      }
      if (w.settled) this.finish();
    }
    const pose = w.pose();
    if (!paused && this.smokeLeft > 0) {
      this.smokeLeft -= dt;
      this.smokeAcc += dt * 6 * Math.min(1, this.smokeLeft / 8 + 0.2);
      const at = this.toWorld(pose.lat, pose.lon, pose.altMslFt);
      while (this.smokeAcc >= 1) {
        this.smokeAcc -= 1;
        this.puffs.smoke(at);
      }
    }
    this.puffs.update(paused ? 0 : dt);
    this.placePieces();
    return pose;
  }

  /** Broken-off pieces: their nodes move by the piece's pose relative to the fuselage; pieces gone are hidden. */
  private placePieces(): void {
    const w = this.wreck;
    const fg = this.fg;
    if (!w || !fg) return;
    for (const p of w.parts) {
      if (!p.detached) continue;
      this.m4.fromArray(p.delta as unknown as number[]);
      // the pose is in metres of the scaled model; the nodes live in the model's own units
      this.m4.elements[12] /= fg.scale;
      this.m4.elements[13] /= fg.scale;
      this.m4.elements[14] /= fg.scale;
      for (const name of p.nodes) {
        const node = fg.model.getObjectByName(name);
        if (!node) continue;
        this.moved.add(node);
        if (p.hidden) {
          node.visible = false;
          continue;
        }
        node.matrixAutoUpdate = false;
        this.base.compose(node.position, node.quaternion, node.scale);
        node.matrix.multiplyMatrices(this.m4, this.base);
        node.matrixWorldNeedsUpdate = true;
      }
    }
  }

  /** Put the model back together (a new flight in the same view). */
  reset(): void {
    for (const node of this.moved) {
      node.matrixAutoUpdate = true;
      node.visible = true;
      node.updateMatrix();
    }
    this.moved.clear();
    this.wreck?.dispose();
    this.wreck = null;
    this.settled = false;
    this.smokeLeft = 0;
  }

  dispose(): void {
    this.disposed = true;
    this.reset();
    this.puffs.dispose();
    this.thump.close();
  }
}
