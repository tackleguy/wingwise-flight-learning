/**
 * What you see and hear in a crash: dust thrown up where a piece hits the ground, smoke from a
 * badly damaged wreck, and the thump of each impact. Small and cheap: a few hundred soft sprites
 * (CesiumJS billboards sized in metres) and the simulator's own synthesised crash sound
 * (src/audio/oneshots.ts) — no recordings.
 */
import { BillboardCollection, BlendOption, Cartesian3, Color, Matrix4, Transforms, type Billboard } from "cesium";
import { daylight, sunPosition } from "@/core/sun";
import { createMaster, createShared, type MasterChain, type Shared } from "@/audio/graph";
import { playOneShot } from "@/audio/oneshots";
import type { World } from "@/world/world";

const M_PER_FT = 0.3048;
const MAX = 360;

interface Puff {
  bb: Billboard;
  pos: Cartesian3;
  vel: Cartesian3;
  age: number;
  life: number;
  size0: number;
  size1: number;
  alpha: number;
  rgb: [number, number, number];
  /** Upward drift that grows with age (smoke rises). */
  rise: number;
  up: Cartesian3;
}

function puffSprite(): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d");
  if (g) {
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    // soft all the way out (no visible rim)
    for (let i = 0; i <= 8; i++) {
      const r = i / 8;
      grad.addColorStop(r, `rgba(255,255,255,${(0.85 * Math.exp(-4 * r * r) * (1 - r)).toFixed(3)})`);
    }
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
  }
  return c;
}

/** Repeatable pseudo-random numbers (so a replayed crash looks the same). */
function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

export class CrashEffects {
  private readonly bbs: BillboardCollection;
  private readonly puffs: Puff[] = [];
  private readonly free: Billboard[] = [];
  private readonly rand = rng(20261116);
  private smokeLeft = 0;
  private smokeAcc = 0;
  private light = 1;
  private readonly enu = new Matrix4();
  private readonly color = new Color();
  private readonly v = new Cartesian3();

  constructor(private readonly world: World) {
    this.bbs = new BillboardCollection({ scene: world.scene, blendOption: BlendOption.TRANSLUCENT });
    world.scene.primitives.add(this.bbs);
    const sprite = puffSprite();
    for (let i = 0; i < MAX; i++) this.free.push(this.bbs.add({ image: sprite, show: false, sizeInMeters: true, width: 1, height: 1, position: new Cartesian3() }));
  }

  /** Light at the crash (0 night … 1 day): dust and smoke are not lit from inside. */
  setLight(utcMs: number, lat: number, lon: number): void {
    this.light = 0.18 + 0.82 * daylight(sunPosition(utcMs, lat, lon).elevationDeg);
  }

  /** Dust thrown up where something hit the ground. `strength` 0…1. */
  impact(lat: number, lon: number, altMslFt: number, strength: number): void {
    const n = Math.round(3 + 14 * strength);
    const base = Cartesian3.fromDegrees(lon, lat, altMslFt * M_PER_FT + 0.3);
    Transforms.eastNorthUpToFixedFrame(base, undefined, this.enu);
    for (let i = 0; i < n; i++) {
      const a = this.rand() * Math.PI * 2;
      const sp = (2 + 7 * strength) * (0.4 + 0.6 * this.rand());
      const vEnu = Cartesian3.fromElements(Math.cos(a) * sp, Math.sin(a) * sp, (0.8 + 3 * strength) * this.rand(), this.v);
      const shade = 0.5 + 0.12 * this.rand();
      this.spawn(base, Matrix4.multiplyByPointAsVector(this.enu, vEnu, new Cartesian3()), {
        life: 1.8 + 2 * this.rand() + 1.5 * strength,
        size0: 0.8 + 1.2 * strength,
        size1: 3 + 6 * strength + 2 * this.rand(),
        alpha: 0.4 + 0.3 * strength,
        rgb: [shade + 0.1, shade + 0.03, shade - 0.07],
        rise: 0.2,
      });
    }
    if (strength > 0.7) this.smokeLeft = Math.max(this.smokeLeft, 25);
  }

  /** Call every frame; `smokeFrom` is where smoke rises from (the fuselage), if anywhere. */
  update(dt: number, smokeFrom: { lat: number; lon: number; altMslFt: number } | null): void {
    if (dt > 0 && this.smokeLeft > 0 && smokeFrom) {
      this.smokeLeft -= dt;
      this.smokeAcc += dt * 6 * Math.min(1, this.smokeLeft / 8 + 0.2);
      const base = Cartesian3.fromDegrees(smokeFrom.lon, smokeFrom.lat, smokeFrom.altMslFt * M_PER_FT + 1);
      Transforms.eastNorthUpToFixedFrame(base, undefined, this.enu);
      while (this.smokeAcc >= 1) {
        this.smokeAcc -= 1;
        const vEnu = Cartesian3.fromElements(0.6 * (this.rand() - 0.5), 0.6 * (this.rand() - 0.5), 1.5 + this.rand(), this.v);
        const g = 0.16 + 0.08 * this.rand();
        this.spawn(base, Matrix4.multiplyByPointAsVector(this.enu, vEnu, new Cartesian3()), { life: 6 + 3 * this.rand(), size0: 1, size1: 7 + 4 * this.rand(), alpha: 0.32, rgb: [g, g, g], rise: 0.6 });
      }
    }
    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const p = this.puffs[i]!;
      p.age += dt;
      if (p.age >= p.life) {
        p.bb.show = false;
        this.free.push(p.bb);
        this.puffs.splice(i, 1);
        continue;
      }
      if (dt > 0) {
        // air drag slows the puff; smoke keeps rising
        Cartesian3.multiplyByScalar(p.vel, Math.exp(-dt * 1.6), p.vel);
        Cartesian3.add(p.vel, Cartesian3.multiplyByScalar(p.up, p.rise * dt, this.v), p.vel);
        Cartesian3.add(p.pos, Cartesian3.multiplyByScalar(p.vel, dt, this.v), p.pos);
        p.bb.position = p.pos;
      }
      const k = p.age / p.life;
      const size = p.size0 + (p.size1 - p.size0) * Math.sqrt(k);
      p.bb.width = p.bb.height = size;
      this.color.red = p.rgb[0] * this.light;
      this.color.green = p.rgb[1] * this.light;
      this.color.blue = p.rgb[2] * this.light;
      this.color.alpha = p.alpha * (1 - k) * Math.min(1, p.age * 8);
      p.bb.color = this.color;
    }
  }

  private spawn(pos: Cartesian3, vel: Cartesian3, o: { life: number; size0: number; size1: number; alpha: number; rgb: [number, number, number]; rise: number }): void {
    let bb = this.free.pop();
    if (!bb) {
      // reuse the oldest
      const old = this.puffs.shift();
      if (!old) return;
      bb = old.bb;
    }
    const up = Cartesian3.normalize(pos, new Cartesian3());
    bb.position = pos;
    bb.show = true;
    this.puffs.push({ bb, pos: Cartesian3.clone(pos), vel, age: 0, up, ...o });
  }

  /** Remove everything (a new flight). */
  clear(): void {
    for (const p of this.puffs) {
      p.bb.show = false;
      this.free.push(p.bb);
    }
    this.puffs.length = 0;
    this.smokeLeft = 0;
    this.smokeAcc = 0;
  }

  destroy(): void {
    this.clear();
    this.world.scene.primitives.remove(this.bbs);
  }
}

/** The thump of an impact, from the simulator's synthesised sounds. Silent where Web Audio is missing. */
export class CrashSounds {
  private ctx: AudioContext | null = null;
  private shared: Shared | null = null;
  private master: MasterChain | null = null;
  private lastAt = -1;
  private failed = false;

  play(intensity: number, volume: number): void {
    if (this.failed || volume <= 0) return;
    try {
      if (!this.ctx) {
        const AC = (globalThis as unknown as { AudioContext?: typeof AudioContext }).AudioContext;
        if (!AC) {
          this.failed = true;
          return;
        }
        this.ctx = new AC();
        this.shared = createShared(this.ctx);
        this.master = createMaster(this.ctx);
      }
      const ctx = this.ctx;
      if (ctx.state === "suspended") void ctx.resume();
      if (ctx.currentTime - this.lastAt < 0.12) return;
      this.lastAt = ctx.currentTime;
      this.master!.input.gain.value = volume;
      playOneShot(this.shared!, this.master!.input, "crash", ctx.currentTime + 0.01, Math.max(0.15, Math.min(1.4, intensity)));
    } catch (err) {
      this.failed = true;
      console.warn("[SkyReady] crash sound unavailable", err);
    }
  }

  close(): void {
    void this.ctx?.close().catch(() => undefined);
    this.ctx = null;
  }
}
