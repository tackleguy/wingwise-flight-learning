/**
 * Crash physics — what the aircraft does after it hits the ground.
 *
 * When the simulator decides the aircraft has crashed (src/core/sim.ts), the flight model (JSBSim)
 * stops and this rigid-body simulation takes over from that moment: same position, attitude, speed
 * and rotation. The physics engine is Rapier (https://rapier.rs, Apache-2.0), open source and
 * compiled to WebAssembly; it is downloaded only when needed (see `loadRapier`).
 *
 * The airframe is a few boxes — fuselage, wings, tail, landing gear — measured from the aircraft's
 * own 3D model (`crash` in src/aircraft/fg-models.gen.ts). They start as one rigid body. A piece
 * breaks off when the ground pushes on it harder than it can take (STRENGTH below), then tumbles
 * and slides on its own. The ground is a height grid made from the same terrain data the flight
 * model uses (runways included).
 *
 * Frames: physics P = metres, X east, Y up, Z south, origin on the ground at the crash point.
 * Body B = x forward, y right, z down (aircraft convention), origin at the centre of gravity.
 * Model G (glTF, the 3D model's) = x left, y up, z nose.
 */
import type RapierModule from "@dimforge/rapier3d-compat";

type Rapier = typeof RapierModule;
type RBody = RapierModule.RigidBody;
type V3 = [number, number, number];
/** 3×3 matrix, row-major. */
type M3 = number[];

const D2R = Math.PI / 180;
const M_PER_FT = 0.3048;
const M_PER_KT = 1852 / 3600;
const M_PER_DEG_LAT = 111_120;
/** Physics step, s. */
const H = 1 / 120;
const G = 9.81;

// ---------------------------------------------------------------- loading the engine

let loading: Promise<Rapier> | null = null;

/** Download and start Rapier once (about 0.8 MB compressed). */
export function loadRapier(): Promise<Rapier> {
  loading ??= import("@dimforge/rapier3d-compat")
    .then(async (mod) => {
      const R = ((mod as unknown as { default?: Rapier }).default ?? mod) as Rapier;
      // The compat build hands its embedded WebAssembly over the old way and warns about it: noise.
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
      loading = null; // try again next time
      throw err;
    });
  return loading;
}

// ---------------------------------------------------------------- airframe

export type PartName = "body" | "wing_left" | "wing_right" | "tail" | "gear_left" | "gear_right" | "gear_nose" | "gear_tail" | "gear";

export interface AirframePart {
  name: PartName;
  /** Nodes of the 3D model that belong to this piece. */
  nodes: string[];
  /** Collision box, model (glTF) frame, metres from the centre of gravity. */
  min: V3;
  max: V3;
}

export interface Airframe {
  massKg: number;
  parts: AirframePart[];
  /** Landing gear down (retractable gear that is up has nothing to touch the ground with). */
  gearDown: boolean;
}

/**
 * How hard a piece can be pushed before it breaks: the impulse it takes within about a tenth of a
 * second, as a change of speed of the whole aircraft (m/s). Resting on a piece is far below these;
 * a very hard landing (about 1,000 ft/min, 5 m/s) breaks the landing gear; a cartwheel tears off a
 * wing. The fuselage does not break apart.
 */
export const STRENGTH: Record<PartName, number> = {
  body: Number.POSITIVE_INFINITY,
  wing_left: 3.2,
  wing_right: 3.2,
  tail: 2.2,
  gear_left: 2.6,
  gear_right: 2.6,
  gear_nose: 2.0,
  gear_tail: 1.6,
  gear: 2.6,
};
/**
 * A violent blow to the fuselage also tears pieces off by their own weight (inertia): a piece breaks
 * when this share of the fuselage's push exceeds its strength (a 25 g impact folds the wings).
 */
const INERTIAL_SHARE = 0.35;
/** Share of the aircraft's mass in each piece (normalised over the pieces the model has). */
const MASS_SHARE: Record<PartName, number> = { body: 0.62, wing_left: 0.12, wing_right: 0.12, tail: 0.05, gear_left: 0.025, gear_right: 0.025, gear_nose: 0.01, gear_tail: 0.005, gear: 0.06 };
/** Friction against the ground. Wheels roll, so the gear slides easily (a box cannot roll). */
const FRICTION: Record<PartName, number> = { body: 0.55, wing_left: 0.5, wing_right: 0.5, tail: 0.5, gear_left: 0.12, gear_right: 0.12, gear_nose: 0.12, gear_tail: 0.12, gear: 0.12 };
const TERRAIN_FRICTION = 0.7;
const RESTITUTION = 0.05;
/** Collision groups: the ground collides with everything; pieces of the aircraft only with the ground. */
const GROUP_GROUND = (0x0001 << 16) | 0xffff;
const GROUP_AIRCRAFT = (0x0002 << 16) | 0x0001;

export interface WreckStart {
  lat: number;
  lon: number;
  altMslFt: number;
  /** Ground elevation at the crash point, ft (used where the terrain is not loaded). */
  groundElevFt: number;
  headingTrue: number;
  pitch: number;
  roll: number;
  vNorthKt: number;
  vEastKt: number;
  vsFpm: number;
  /** Body rates, deg/s. */
  rollRate: number;
  pitchRate: number;
  yawRate: number;
  /** Pieces already broken by what caused the crash (e.g. the landing gear on a very hard landing). */
  broken?: PartName[];
}

export interface PartView {
  name: PartName;
  nodes: string[];
  /** Broken off and moving on its own. */
  detached: boolean;
  /** Not to be drawn (left the simulated area, or retractable gear torn off). */
  hidden: boolean;
  /** Pose relative to the fuselage in the model (glTF) frame, column-major 4×4; identity while attached. */
  delta: Float64Array;
}

export interface Impact {
  lat: number;
  lon: number;
  altMslFt: number;
  /** 0…1 (1 = a violent blow). */
  strength: number;
  part: PartName;
  /** A piece broke off in this impact. */
  broke: boolean;
}

export interface WreckPose {
  lat: number;
  lon: number;
  altMslFt: number;
  headingTrue: number;
  pitch: number;
  roll: number;
  vNorthKt: number;
  vEastKt: number;
  vsFpm: number;
  speedKt: number;
  /** Body rates, deg/s. */
  rollRate: number;
  pitchRate: number;
  yawRate: number;
}

// ---------------------------------------------------------------- small maths

/** Body (x fwd, y right, z down) → north-east-down, from heading / pitch / roll (degrees). */
function attitudeMatrix(hdg: number, pitch: number, roll: number): M3 {
  const [cp, sp] = [Math.cos(pitch * D2R), Math.sin(pitch * D2R)];
  const [cr, sr] = [Math.cos(roll * D2R), Math.sin(roll * D2R)];
  const [ch, sh] = [Math.cos(hdg * D2R), Math.sin(hdg * D2R)];
  return [cp * ch, sr * sp * ch - cr * sh, cr * sp * ch + sr * sh, cp * sh, sr * sp * sh + cr * ch, cr * sp * sh - sr * ch, -sp, sr * cp, cr * cp];
}

/** Body → physics frame: rows (east, up, south) = (NED row 1, −row 2, −row 0). */
function bodyToP(R: M3): M3 {
  return [R[3]!, R[4]!, R[5]!, -R[6]!, -R[7]!, -R[8]!, -R[0]!, -R[1]!, -R[2]!];
}

function quatFromMatrix(m: M3): { x: number; y: number; z: number; w: number } {
  const [m00, m01, m02, m10, m11, m12, m20, m21, m22] = m as [number, number, number, number, number, number, number, number, number];
  const tr = m00 + m11 + m22;
  let x: number, y: number, z: number, w: number;
  if (tr > 0) {
    const s = Math.sqrt(tr + 1) * 2;
    w = 0.25 * s;
    x = (m21 - m12) / s;
    y = (m02 - m20) / s;
    z = (m10 - m01) / s;
  } else if (m00 > m11 && m00 > m22) {
    const s = Math.sqrt(1 + m00 - m11 - m22) * 2;
    w = (m21 - m12) / s;
    x = 0.25 * s;
    y = (m01 + m10) / s;
    z = (m02 + m20) / s;
  } else if (m11 > m22) {
    const s = Math.sqrt(1 + m11 - m00 - m22) * 2;
    w = (m02 - m20) / s;
    x = (m01 + m10) / s;
    y = 0.25 * s;
    z = (m12 + m21) / s;
  } else {
    const s = Math.sqrt(1 + m22 - m00 - m11) * 2;
    w = (m10 - m01) / s;
    x = (m02 + m20) / s;
    y = (m12 + m21) / s;
    z = 0.25 * s;
  }
  const n = Math.hypot(x, y, z, w) || 1;
  return { x: x / n, y: y / n, z: z / n, w: w / n };
}

function matrixFromQuat(q: { x: number; y: number; z: number; w: number }, out: M3 = new Array(9)): M3 {
  const { x, y, z, w } = q;
  out[0] = 1 - 2 * (y * y + z * z);
  out[1] = 2 * (x * y - z * w);
  out[2] = 2 * (x * z + y * w);
  out[3] = 2 * (x * y + z * w);
  out[4] = 1 - 2 * (x * x + z * z);
  out[5] = 2 * (y * z - x * w);
  out[6] = 2 * (x * z - y * w);
  out[7] = 2 * (y * z + x * w);
  out[8] = 1 - 2 * (x * x + y * y);
  return out;
}

const mul3 = (m: M3, v: V3): V3 => [m[0]! * v[0] + m[1]! * v[1] + m[2]! * v[2], m[3]! * v[0] + m[4]! * v[1] + m[5]! * v[2], m[6]! * v[0] + m[7]! * v[1] + m[8]! * v[2]];
const mulT3 = (m: M3, v: V3): V3 => [m[0]! * v[0] + m[3]! * v[1] + m[6]! * v[2], m[1]! * v[0] + m[4]! * v[1] + m[7]! * v[2], m[2]! * v[0] + m[5]! * v[1] + m[8]! * v[2]];

/** Model (glTF) point → body frame: x_B = z_G, y_B = −x_G, z_B = −y_G. */
const gltfToBody = (p: V3): V3 => [p[2], -p[0], -p[1]];

// ---------------------------------------------------------------- the wreck

interface PartState {
  view: PartView;
  spec: AirframePart;
  /** Centre and half size of the box, body frame. */
  centre: V3;
  half: V3;
  mass: number;
  collider: RapierModule.Collider | null;
  /** Its own body once broken off (else it rides on the fuselage). */
  body: RBody | null;
  /** Recent ground impulse, N·s (decays with a 0.1 s time constant). */
  recent: number;
  /** Highest `recent` so far (tests and tuning). */
  peak: number;
  /** Where this piece's mass sits (body frame); the fuselage's is placed so the whole aircraft balances at its real centre of gravity. */
  massCentre: V3;
  /** Points on its collision shape, body frame. */
  probes: V3[];
  stepImpulse: number;
  lastImpactAt: number;
}

const IDENTITY = (): Float64Array => {
  const a = new Float64Array(16);
  a[0] = a[5] = a[10] = a[15] = 1;
  return a;
};

export class Wreck {
  readonly parts: PartView[];
  /** Simulated time since the crash, s. */
  time = 0;
  /** Everything has come to rest (or left the simulated area). */
  settled = false;

  private readonly world: RapierModule.World;
  private readonly queue: RapierModule.EventQueue;
  private readonly main: RBody;
  private readonly states: PartState[];
  private readonly byCollider = new Map<number, PartState>();
  private readonly massKg: number;
  private readonly lat0: number;
  private readonly lon0: number;
  private readonly h0: number;
  private readonly mPerDegLon: number;
  /** Height grid: centre (x, z), size, cells per side, heights (column-major, x columns). */
  private readonly grid: { cx: number; cz: number; size: number; n: number; h: Float32Array };
  private acc = 0;
  private quietFor = 0;
  private impacts: Impact[] = [];
  private readonly toBreak = new Set<PartState>();
  private disposed = false;

  private constructor(R: Rapier, airframe: Airframe, s: WreckStart, groundFt: (lat: number, lon: number) => number | null) {
    this.rapier = R;
    this.massKg = Math.max(100, airframe.massKg);
    this.lat0 = s.lat;
    this.lon0 = s.lon;
    this.mPerDegLon = M_PER_DEG_LAT * Math.cos(s.lat * D2R);
    this.h0 = (groundFt(s.lat, s.lon) ?? s.groundElevFt) * M_PER_FT;
    this.world = new R.World({ x: 0, y: -G, z: 0 });
    this.world.timestep = H;
    this.queue = new R.EventQueue(true);

    // ---- motion at the moment of the crash, physics frame
    const vEast = s.vEastKt * M_PER_KT;
    const vSouth = -s.vNorthKt * M_PER_KT;
    const vUp = (s.vsFpm * M_PER_FT) / 60;
    const Rb = bodyToP(attitudeMatrix(s.headingTrue, s.pitch, s.roll));
    const w = mul3(Rb, [s.rollRate * D2R, s.pitchRate * D2R, s.yawRate * D2R]);

    // ---- the ground: a height grid around the crash, reaching further in the direction of travel
    const vh = Math.hypot(vEast, vSouth);
    const size = Math.min(900, Math.max(240, 120 + vh * 6));
    const n = 160;
    const ahead = vh > 1 ? size / 2 - 60 : 0;
    const cx = vh > 1 ? (vEast / vh) * ahead : 0;
    const cz = vh > 1 ? (vSouth / vh) * ahead : 0;
    const heights = new Float32Array((n + 1) * (n + 1));
    const d = size / n;
    for (let c = 0; c <= n; c++) {
      const x = cx - size / 2 + c * d;
      for (let r = 0; r <= n; r++) {
        const z = cz - size / 2 + r * d;
        const g = groundFt(this.lat0 - z / M_PER_DEG_LAT, this.lon0 + x / this.mPerDegLon);
        heights[c * (n + 1) + r] = g === null || !Number.isFinite(g) ? 0 : g * M_PER_FT - this.h0;
      }
    }
    this.grid = { cx, cz, size, n, h: heights };
    this.world.createCollider(
      // (FIX_INTERNAL_EDGES: no false bumps where the grid's triangles meet)
      R.ColliderDesc.heightfield(n, n, heights, { x: size, y: 1, z: size }, R.HeightFieldFlags.FIX_INTERNAL_EDGES)
        .setTranslation(cx, 0, cz)
        .setFriction(TERRAIN_FRICTION)
        .setRestitution(RESTITUTION)
        .setCollisionGroups(GROUP_GROUND),
    );

    // ---- the airframe: one body, a box per piece
    const p0: V3 = [(s.lon - this.lon0) * this.mPerDegLon, s.altMslFt * M_PER_FT - this.h0, -(s.lat - this.lat0) * M_PER_DEG_LAT];
    this.main = this.world.createRigidBody(
      R.RigidBodyDesc.dynamic()
        .setTranslation(p0[0], p0[1], p0[2])
        .setRotation(quatFromMatrix(Rb))
        .setLinvel(vEast, vUp, vSouth)
        .setAngvel({ x: w[0], y: w[1], z: w[2] })
        .setLinearDamping(0.05)
        .setAngularDamping(0.35)
        .setCcdEnabled(true),
    );
    const present = airframe.parts.filter((p) => p.name !== "gear" || airframe.gearDown);
    const shareSum = present.reduce((a, p) => a + MASS_SHARE[p.name], 0) || 1;
    this.states = [];
    for (const spec of airframe.parts) {
      const a = gltfToBody(spec.min);
      const b = gltfToBody(spec.max);
      const centre: V3 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
      const half: V3 = [Math.max(0.05, Math.abs(b[0] - a[0]) / 2), Math.max(0.05, Math.abs(b[1] - a[1]) / 2), Math.max(0.05, Math.abs(b[2] - a[2]) / 2)];
      const view: PartView = { name: spec.name, nodes: spec.nodes, detached: false, hidden: false, delta: IDENTITY() };
      const st: PartState = { view, spec, centre, half, mass: (this.massKg * MASS_SHARE[spec.name]) / shareSum, collider: null, body: null, recent: 0, peak: 0, massCentre: centre, probes: probePoints(spec.name, centre, half), stepImpulse: 0, lastImpactAt: -1 };
      this.states.push(st);
    }
    // The pieces' masses sit at their box centres, except the fuselage's (engine, cabin, fuel, people):
    // it goes where the whole aircraft balances at the flight model's centre of gravity (the origin).
    const fus = this.states.find((p) => p.spec.name === "body");
    if (fus) {
      const others = this.states.filter((p) => p !== fus && present.includes(p.spec));
      const m = [0, 1, 2].map((i) => -others.reduce((a, p) => a + p.mass * p.centre[i]!, 0) / fus.mass) as V3;
      // …but not outside the fuselage box
      fus.massCentre = [0, 1, 2].map((i) => Math.min(fus.centre[i]! + fus.half[i]!, Math.max(fus.centre[i]! - fus.half[i]!, m[i]!))) as V3;
    }
    for (const st of this.states) {
      if (!present.includes(st.spec)) continue; // retractable gear that is up
      st.collider = this.world.createCollider(this.colliderDesc(R, st), this.main);
      this.byCollider.set(st.collider.handle, st);
    }
    this.parts = this.states.map((p) => p.view);

    // ---- start just touching the ground (the flight model may have sunk a little into it)
    let pen = 0;
    for (const st of this.states) {
      if (!st.collider) continue;
      for (const pb of st.probes) {
        const pw = mul3(Rb, pb);
        pen = Math.max(pen, this.groundAt(p0[0] + pw[0], p0[2] + pw[2]) - (p0[1] + pw[1]));
      }
    }
    if (pen > 0.02) this.main.setTranslation({ x: p0[0], y: p0[1] + pen - 0.01, z: p0[2] }, true);

    // ---- pieces the crash itself broke
    for (const name of s.broken ?? []) {
      const st = this.states.find((p) => p.spec.name === name);
      if (st?.collider) this.breakOff(st);
    }
  }

  private readonly rapier: Rapier;

  /** Build the crash simulation. `groundFt` gives the ground elevation (ft) or null where unknown. */
  static create(R: Rapier, airframe: Airframe, start: WreckStart, groundFt: (lat: number, lon: number) => number | null): Wreck {
    return new Wreck(R, airframe, start, groundFt);
  }

  private colliderDesc(R: Rapier, st: PartState): RapierModule.ColliderDesc {
    const [hx, hy, hz] = st.half;
    const k = st.mass / 3; // solid box: I = m (b² + c²) / 3 with half sizes
    const name = st.spec.name;
    let desc: RapierModule.ColliderDesc | null = null;
    const threshold = 0.02 * this.massKg * G;
    if (name === "body") desc = fuselageHull(R, st.half);
    else if (name.startsWith("gear_")) {
      // a wheel: a ball at the bottom of the gear leg (slides smoothly instead of catching an edge)
      const r = Math.max(0.08, Math.min(0.35, hx, hz, hy));
      desc = R.ColliderDesc.ball(r).setTranslation(st.centre[0], st.centre[1], st.centre[2] + hz - r);
      // (centre z + half height is the bottom of the leg: body z points down)
      return withMass(desc, st, { x: 0, y: 0, z: -(hz - r) }, k, R).setContactForceEventThreshold(threshold);
    } else if (name === "gear") desc = R.ColliderDesc.roundCuboid(Math.max(0.01, hx - 0.1), Math.max(0.01, hy - 0.1), Math.max(0.01, hz - 0.1), 0.1);
    return withMass(desc ?? R.ColliderDesc.cuboid(hx, hy, hz), st, null, k, R).setContactForceEventThreshold(threshold);
  }

  /** Ground height (physics frame, m) under a point, from the grid. */
  groundAt(x: number, z: number): number {
    const { cx, cz, size, n, h } = this.grid;
    const d = size / n;
    const fx = Math.min(n - 1e-6, Math.max(0, (x - (cx - size / 2)) / d));
    const fz = Math.min(n - 1e-6, Math.max(0, (z - (cz - size / 2)) / d));
    const c = Math.floor(fx);
    const r = Math.floor(fz);
    const u = fx - c;
    const v = fz - r;
    const at = (cc: number, rr: number) => h[cc * (n + 1) + rr]!;
    return (at(c, r) * (1 - u) + at(c + 1, r) * u) * (1 - v) + (at(c, r + 1) * (1 - u) + at(c + 1, r + 1) * u) * v;
  }

  /** The piece leaves the fuselage: same place and motion, now its own body. */
  private breakOff(st: PartState): void {
    if (!st.collider || st.body || st.spec.name === "body") return;
    const R = this.rapier;
    const t = this.main.translation();
    const q = this.main.rotation();
    const v = this.main.linvel(); // velocity of the centre of mass
    const w = this.main.angvel();
    const com = this.main.worldCom();
    this.byCollider.delete(st.collider.handle);
    this.world.removeCollider(st.collider, true);
    st.collider = null;
    if (st.spec.name === "gear") {
      // retractable gear: torn away under the aircraft (drawn as gone)
      st.view.hidden = true;
      st.view.detached = true;
      return;
    }
    // velocity of the piece = velocity of the centre of mass + rotation × lever arm from it
    const c = mul3(matrixFromQuat(q), st.centre);
    const arm: V3 = [t.x + c[0] - com.x, t.y + c[1] - com.y, t.z + c[2] - com.z];
    const body = this.world.createRigidBody(
      R.RigidBodyDesc.dynamic()
        .setTranslation(t.x, t.y, t.z)
        .setRotation(q)
        .setLinvel(v.x + w.y * arm[2] - w.z * arm[1], v.y + w.z * arm[0] - w.x * arm[2], v.z + w.x * arm[1] - w.y * arm[0])
        .setAngvel(w)
        .setLinearDamping(0.08)
        .setAngularDamping(0.3)
        .setCcdEnabled(true),
    );
    st.collider = this.world.createCollider(this.colliderDesc(R, st), body);
    this.byCollider.set(st.collider.handle, st);
    st.body = body;
    st.view.detached = true;
  }

  /** Advance by `dt` seconds of real time (fixed 1/120 s physics steps). */
  step(dt: number): void {
    if (this.settled || this.disposed) return;
    this.acc += Math.min(dt, 0.25);
    let k = 0;
    while (this.acc >= H && k < 30) {
      this.substep();
      this.acc -= H;
      k++;
      if (this.settled) break;
    }
    if (k === 30) this.acc = 0;
    this.updateDeltas();
  }

  private substep(): void {
    for (const st of this.states) st.stepImpulse = 0;
    this.world.step(this.queue);
    this.queue.drainContactForceEvents((e) => {
      const st = this.byCollider.get(e.collider1()) ?? this.byCollider.get(e.collider2());
      if (st) st.stepImpulse += e.totalForceMagnitude() * H;
    });
    this.time += H;
    const decay = Math.exp(-H / 0.1);
    const fus = this.states.find((p) => p.spec.name === "body");
    const shock = fus ? (fus.recent * decay + fus.stepImpulse) * INERTIAL_SHARE : 0;
    for (const st of this.states) {
      st.recent = st.recent * decay + st.stepImpulse;
      if (st.recent > st.peak) st.peak = st.recent;
      const dv = st.stepImpulse / this.massKg;
      const limit = STRENGTH[st.spec.name] * this.massKg;
      const breaks = !st.body && st.collider !== null && (st.recent > limit || shock > limit);
      if (breaks) this.toBreak.add(st);
      if ((dv > 0.35 || breaks) && this.time - st.lastImpactAt > 0.25) {
        st.lastImpactAt = this.time;
        this.impacts.push({ ...this.placeOf(st), strength: Math.min(1, dv / 4), part: st.spec.name, broke: breaks });
      }
    }
    for (const st of this.toBreak) this.breakOff(st);
    this.toBreak.clear();

    // ---- pieces that leave the simulated ground are dropped; the end when all is still
    const { cx, cz, size } = this.grid;
    const inside = (p: { x: number; z: number }, m: number) => Math.abs(p.x - cx) < size / 2 - m && Math.abs(p.z - cz) < size / 2 - m;
    let moving = false;
    for (const st of this.states) {
      const b = st.body;
      if (!b || st.view.hidden) continue;
      const p = b.translation();
      if (!inside(p, 2) || p.y < -200) {
        this.world.removeRigidBody(b);
        st.body = null;
        st.collider = null;
        st.view.hidden = true;
        continue;
      }
      if (this.isMoving(b)) moving = true;
    }
    const pm = this.main.translation();
    if (!inside(pm, 8)) {
      this.settled = true;
      return;
    }
    if (this.isMoving(this.main)) moving = true;
    this.quietFor = moving ? 0 : this.quietFor + H;
    if (this.quietFor > 1.2 || this.time > 30) this.settled = true;
  }

  private isMoving(b: RBody): boolean {
    if (b.isSleeping()) return false;
    const v = b.linvel();
    const w = b.angvel();
    return Math.hypot(v.x, v.y, v.z) > 0.25 || Math.hypot(w.x, w.y, w.z) > 0.25;
  }

  /** Where a piece is now (for dust and sounds). */
  private placeOf(st: PartState): { lat: number; lon: number; altMslFt: number } {
    const b = st.body ?? this.main;
    const t = b.translation();
    const p = mul3(matrixFromQuat(b.rotation()), st.centre);
    const x = t.x + p[0];
    const z = t.z + p[2];
    return { lat: this.lat0 - z / M_PER_DEG_LAT, lon: this.lon0 + x / this.mPerDegLon, altMslFt: (this.groundAt(x, z) + this.h0) / M_PER_FT };
  }

  /** Pose of each broken-off piece relative to the fuselage, in the model frame. */
  private updateDeltas(): void {
    const Rm = matrixFromQuat(this.main.rotation());
    const tm = this.main.translation();
    for (const st of this.states) {
      if (!st.body) continue;
      const Rp = matrixFromQuat(st.body.rotation());
      const tp = st.body.translation();
      // relative rotation (body frame) = Rmᵀ·Rp, relative position = Rmᵀ·(tp − tm)
      const rel: number[] = new Array(9);
      for (let i = 0; i < 3; i++)
        for (let j = 0; j < 3; j++) rel[i * 3 + j] = Rm[i]! * Rp[j]! + Rm[3 + i]! * Rp[3 + j]! + Rm[6 + i]! * Rp[6 + j]!;
      const dt = mulT3(Rm, [tp.x - tm.x, tp.y - tm.y, tp.z - tm.z]);
      // body → model frame: G = Gm·B with Gm rows (0,−1,0), (0,0,−1), (1,0,0)
      const g = (i: number, j: number) => {
        // (Gm · rel · Gmᵀ)[i][j]
        const gi = GM[i]!;
        const gj = GM[j]!;
        let sum = 0;
        for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) sum += gi[a]! * rel[a * 3 + b]! * gj[b]!;
        return sum;
      };
      const tG = [-dt[1], -dt[2], dt[0]];
      const m = st.view.delta;
      for (let c = 0; c < 3; c++) for (let r = 0; r < 3; r++) m[c * 4 + r] = g(r, c);
      m[3] = m[7] = m[11] = 0;
      m[12] = tG[0]!;
      m[13] = tG[1]!;
      m[14] = tG[2]!;
      m[15] = 1;
    }
  }

  /** Where the fuselage is and how it moves. */
  pose(): WreckPose {
    const t = this.main.translation();
    const Rp = matrixFromQuat(this.main.rotation());
    // physics rows (east, up, south) → NED rows (north = −south, east, down = −up)
    const R: M3 = [-Rp[6]!, -Rp[7]!, -Rp[8]!, Rp[0]!, Rp[1]!, Rp[2]!, -Rp[3]!, -Rp[4]!, -Rp[5]!];
    const pitch = Math.asin(Math.max(-1, Math.min(1, -R[6]!))) / D2R;
    const roll = Math.atan2(R[7]!, R[8]!) / D2R;
    const hdg = ((Math.atan2(R[3]!, R[0]!) / D2R) + 360) % 360;
    const v = this.main.linvel();
    const w = this.main.angvel();
    const wb = mulT3(Rp, [w.x, w.y, w.z]);
    return {
      lat: this.lat0 - t.z / M_PER_DEG_LAT,
      lon: this.lon0 + t.x / this.mPerDegLon,
      altMslFt: (t.y + this.h0) / M_PER_FT,
      headingTrue: hdg,
      pitch,
      roll,
      vNorthKt: -v.z / M_PER_KT,
      vEastKt: v.x / M_PER_KT,
      vsFpm: (v.y / M_PER_FT) * 60,
      speedKt: Math.hypot(v.x, v.y, v.z) / M_PER_KT,
      rollRate: wb[0] / D2R,
      pitchRate: wb[1] / D2R,
      yawRate: wb[2] / D2R,
    };
  }

  /** Lowest point of the fuselage box above the ground, m (negative = in the ground). For tests. */
  clearanceM(name: PartName = "body"): number {
    const st = this.states.find((p) => p.spec.name === name);
    if (!st) return Number.NaN;
    const b = st.body ?? this.main;
    const t = b.translation();
    const Rm = matrixFromQuat(b.rotation());
    let best = Number.POSITIVE_INFINITY;
    for (const pb of st.probes) {
      const pw = mul3(Rm, pb);
      best = Math.min(best, t.y + pw[1] - this.groundAt(t.x + pw[0], t.z + pw[2]));
    }
    return best;
  }

  /** The hardest push each piece has had, as a change of speed of the whole aircraft (m/s; compare STRENGTH). */
  peaks(): Partial<Record<PartName, number>> {
    return Object.fromEntries(this.states.map((p) => [p.spec.name, Math.round((p.peak / this.massKg) * 100) / 100]));
  }

  /** Impacts since the last call (for dust and sounds). */
  drainImpacts(): Impact[] {
    const out = this.impacts;
    this.impacts = [];
    return out;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.queue.free();
    this.world.free();
  }
}


/** Mass, centre of mass and inertia of a piece; collision events on. */
function withMass(desc: RapierModule.ColliderDesc, st: PartState, comShift: { x: number; y: number; z: number } | null, k: number, R: Rapier): RapierModule.ColliderDesc {
  const [hx, hy, hz] = st.half;
  if (!comShift) desc.setTranslation(st.centre[0], st.centre[1], st.centre[2]);
  const shift = comShift ?? { x: 0, y: 0, z: 0 };
  return desc
    .setMassProperties(
      st.mass,
      { x: st.massCentre[0] - st.centre[0] + shift.x, y: st.massCentre[1] - st.centre[1] + shift.y, z: st.massCentre[2] - st.centre[2] + shift.z },
      { x: k * (hy * hy + hz * hz), y: k * (hx * hx + hz * hz), z: k * (hx * hx + hy * hy) },
      { x: 0, y: 0, z: 0, w: 1 },
    )
    .setFriction(FRICTION[st.spec.name])
    .setRestitution(RESTITUTION)
    .setCollisionGroups(GROUP_AIRCRAFT)
    .setActiveEvents(R.ActiveEvents.CONTACT_FORCE_EVENTS);
}

/**
 * The fuselage: its box, but tapering towards the tail (narrower, and the bottom rising to about half
 * the height) and a little rounded at the nose — the shape every aircraft fuselage roughly has.
 * Points are relative to the box centre, body frame (x forward, y right, z down).
 */
function fuselagePoints(half: V3): V3[] {
  const [hl, hw, hh] = half;
  const pts: V3[] = [];
  const section = (x: number, w: number, top: number, bottom: number) => {
    for (const y of [-w, w]) for (const z of [top, bottom]) pts.push([x, y, z]);
  };
  section(hl, 0.75 * hw, -0.8 * hh, 0.8 * hh); // nose
  section(0.5 * hl, hw, -hh, hh); // cabin
  section(-0.1 * hl, hw, -hh, hh);
  section(-hl, 0.35 * hw, -hh, -0.1 * hh); // tail cone: narrow, bottom raised
  return pts;
}

function fuselageHull(R: Rapier, half: V3): RapierModule.ColliderDesc | null {
  return R.ColliderDesc.convexHull(new Float32Array(fuselagePoints(half).flat()));
}

/** Points on a piece's collision shape (body frame) for ground checks. */
function probePoints(name: PartName, centre: V3, half: V3): V3[] {
  const add = (p: V3): V3 => [centre[0] + p[0], centre[1] + p[1], centre[2] + p[2]];
  if (name === "body") return fuselagePoints(half).map(add);
  if (name.startsWith("gear_")) {
    const r = Math.max(0.08, Math.min(0.35, half[0], half[2], half[1]));
    return [add([0, 0, half[2]]), add([r, 0, half[2] - r]), add([-r, 0, half[2] - r]), add([0, r, half[2] - r]), add([0, -r, half[2] - r])];
  }
  const pts: V3[] = [];
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) pts.push(add([sx * half[0], sy * half[1], sz * half[2]]));
  return pts;
}

/** Rows of the body → model (glTF) rotation. */
const GM: V3[] = [
  [0, -1, 0],
  [0, 0, -1],
  [1, 0, 0],
];
