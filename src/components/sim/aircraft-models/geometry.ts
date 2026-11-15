/**
 * Procedural geometry primitives for the aircraft models: lofted bodies (fuselages, nacelles,
 * fairings) from superellipse cross-section stations, lifting surfaces with real airfoil
 * sections and cut-out control surfaces, bodies of revolution and streamlined struts.
 *
 * Everything here is original code. Geometry is accumulated in a {@link MeshBuilder}, which
 * orients every triangle explicitly (outward normals) so meshes render correctly with
 * single-sided materials.
 */
import * as THREE from "three";

import {
  DEG,
  add,
  airfoil,
  cross,
  dot,
  lerp,
  mix3,
  norm,
  pchip,
  plin,
  scale,
  spow,
  sub,
  type V3,
} from "./math";

// ---------------------------------------------------------------------------------------------
// MeshBuilder
// ---------------------------------------------------------------------------------------------

export class MeshBuilder {
  readonly pos: number[] = [];
  readonly idx: number[] = [];
  /** Optional per-vertex colours (r,g,b 0..1). When used, every vertex must get one. */
  col: number[] | null = null;

  get vertexCount() {
    return this.pos.length / 3;
  }

  v(p: V3): number {
    this.pos.push(p[0], p[1], p[2]);
    return this.pos.length / 3 - 1;
  }

  p(i: number): V3 {
    return [this.pos[i * 3] ?? 0, this.pos[i * 3 + 1] ?? 0, this.pos[i * 3 + 2] ?? 0];
  }

  /** Adds a triangle oriented so its normal points along `out`. Degenerate triangles are skipped. */
  triOut(a: number, b: number, c: number, out: V3) {
    const pa = this.p(a);
    const n = cross(sub(this.p(b), pa), sub(this.p(c), pa));
    const d = dot(n, out);
    if (Math.abs(n[0]) + Math.abs(n[1]) + Math.abs(n[2]) < 1e-12) return;
    if (d >= 0) this.idx.push(a, b, c);
    else this.idx.push(a, c, b);
  }

  quadOut(a: number, b: number, c: number, d: number, out: V3) {
    this.triOut(a, b, c, out);
    this.triOut(a, c, d, out);
  }

  /** Adds a triangle oriented away from an interior reference point. */
  triAway(a: number, b: number, c: number, interior: V3) {
    const cen = scale(add(add(this.p(a), this.p(b)), this.p(c)), 1 / 3);
    this.triOut(a, b, c, sub(cen, interior));
  }

  append(o: MeshBuilder) {
    const base = this.vertexCount;
    for (const v of o.pos) this.pos.push(v);
    for (const i of o.idx) this.idx.push(i + base);
    if (o.col || this.col) {
      const mine = this.col ?? new Array<number>(base * 3).fill(1);
      const theirs = o.col ?? new Array<number>(o.pos.length).fill(1);
      for (const c of theirs) mine.push(c);
      this.col = mine;
    }
    return this;
  }

  map(fn: (p: V3) => V3) {
    for (let i = 0; i < this.vertexCount; i++) {
      const q = fn(this.p(i));
      this.pos[i * 3] = q[0];
      this.pos[i * 3 + 1] = q[1];
      this.pos[i * 3 + 2] = q[2];
    }
    return this;
  }

  /** Mirror copy across the x = 0 plane (left/right), with winding fixed. */
  mirrorX(): MeshBuilder {
    const m = new MeshBuilder();
    for (let i = 0; i < this.pos.length; i += 3) {
      m.pos.push(-(this.pos[i] ?? 0), this.pos[i + 1] ?? 0, this.pos[i + 2] ?? 0);
    }
    for (let i = 0; i < this.idx.length; i += 3) {
      m.idx.push(this.idx[i] ?? 0, this.idx[i + 2] ?? 0, this.idx[i + 1] ?? 0);
    }
    if (this.col) m.col = this.col.slice();
    return m;
  }

  get triangles() {
    return this.idx.length / 3;
  }

  toGeometry(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute(
      "uv",
      new THREE.Float32BufferAttribute(new Float32Array((this.pos.length / 3) * 2), 2),
    );
    if (this.col) g.setAttribute("color", new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
    g.computeVertexNormals();
    return g;
  }
}

/** Fan-triangulates a closed polygon (by index) around its centroid, facing `out`. */
export function capPolygon(mb: MeshBuilder, ring: V3[], out: V3) {
  if (ring.length < 3) return;
  let c: V3 = [0, 0, 0];
  for (const p of ring) c = add(c, p);
  c = scale(c, 1 / ring.length);
  const ci = mb.v(c);
  const ids = ring.map((p) => mb.v(p));
  for (let i = 0; i < ids.length; i++) {
    mb.triOut(ci, ids[i] ?? 0, ids[(i + 1) % ids.length] ?? 0, out);
  }
}

// ---------------------------------------------------------------------------------------------
// Lofted bodies (fuselage, nacelles, fairings, wheel pants)
// ---------------------------------------------------------------------------------------------

/**
 * One cross-section station. The section is a superellipse: half-width `hw`, extending from
 * `bot` to `top` (y). `m` (0..1) is where the widest point sits between bot and top. `nt`/`nb`
 * are the superellipse exponents of the upper/lower halves (2 = ellipse, 3–5 = boxy).
 */
export interface Station {
  z: number;
  hw: number;
  top: number;
  bot: number;
  nt?: number;
  nb?: number;
  m?: number;
}

export interface BodyShape {
  z0: number;
  z1: number;
  hw(z: number): number;
  top(z: number): number;
  bot(z: number): number;
  /** Centre line of the section (widest point). */
  mid(z: number): number;
  /** Surface point at longitudinal z and section angle θ (0 = right side, +90° = top). */
  at(z: number, theta: number): V3;
  /** |x| of the surface at (z, y), or 0 outside the section. */
  xAt(z: number, y: number): number;
}

export function bodyShape(stations: readonly Station[], cx = 0, cy = 0): BodyShape {
  const zs = stations.map((s) => s.z);
  const fHw = pchip(
    zs,
    stations.map((s) => s.hw),
  );
  const fTop = pchip(
    zs,
    stations.map((s) => s.top),
  );
  const fBot = pchip(
    zs,
    stations.map((s) => s.bot),
  );
  const fNt = pchip(
    zs,
    stations.map((s) => s.nt ?? 2),
  );
  const fNb = pchip(
    zs,
    stations.map((s) => s.nb ?? s.nt ?? 2),
  );
  const fM = pchip(
    zs,
    stations.map((s) => s.m ?? 0.5),
  );
  const z0 = zs[0] ?? 0;
  const z1 = zs[zs.length - 1] ?? 0;
  const mid = (z: number) => {
    const b = fBot(z);
    return b + (fTop(z) - b) * fM(z);
  };
  const at = (z: number, th: number): V3 => {
    const c = Math.cos(th);
    const s = Math.sin(th);
    const upper = s >= 0;
    const n = upper ? fNt(z) : fNb(z);
    const ym = mid(z);
    const hh = upper ? fTop(z) - ym : ym - fBot(z);
    return [cx + fHw(z) * spow(c, 2 / n), cy + ym + hh * spow(s, 2 / n), z];
  };
  const xAt = (z: number, y: number) => {
    const ym = mid(z);
    const upper = y >= ym;
    const hh = upper ? fTop(z) - ym : ym - fBot(z);
    if (hh <= 0) return 0;
    const n = upper ? fNt(z) : fNb(z);
    const r = Math.abs(y - cy - ym) / hh;
    if (r >= 1) return 0;
    return fHw(z) * Math.pow(1 - Math.pow(r, n), 1 / n);
  };
  return {
    z0,
    z1,
    hw: fHw,
    top: (z) => cy + fTop(z),
    bot: (z) => cy + fBot(z),
    mid: (z) => cy + mid(z),
    at,
    xAt,
  };
}

export interface LoftOptions {
  radial: number;
  rings: number;
  cx?: number;
  cy?: number;
  /** Close the front with a pole pushed forward by this distance (m). Omit to leave open. */
  noseCap?: number;
  /** Close the rear with a pole pushed aft by this distance (m). */
  tailCap?: number;
}

/** Lofts a smooth closed body through the given stations. */
export function loftBody(stations: readonly Station[], o: LoftOptions): MeshBuilder {
  const cx = o.cx ?? 0;
  const cy = o.cy ?? 0;
  const shape = bodyShape(stations, cx, cy);
  const mb = new MeshBuilder();
  const total = shape.z1 - shape.z0;
  // Sample z: keep every station exactly, subdivide intervals by length.
  const zs: number[] = [];
  for (let i = 0; i < stations.length - 1; i++) {
    const za = stations[i]?.z ?? 0;
    const zb = stations[i + 1]?.z ?? 0;
    const n = Math.max(1, Math.round((o.rings * (zb - za)) / total));
    for (let k = 0; k < n; k++) zs.push(za + ((zb - za) * k) / n);
  }
  zs.push(shape.z1);
  const N = o.radial;
  const rings: number[][] = [];
  for (const z of zs) {
    const ids: number[] = [];
    for (let j = 0; j < N; j++) {
      const th = -Math.PI / 2 + (2 * Math.PI * j) / N;
      ids.push(mb.v(shape.at(z, th)));
    }
    rings.push(ids);
  }
  for (let i = 0; i < rings.length - 1; i++) {
    const ra = rings[i] ?? [];
    const rb = rings[i + 1] ?? [];
    const za = zs[i] ?? 0;
    const zb = zs[i + 1] ?? 0;
    const cen: V3 = [cx, (shape.mid(za) + shape.mid(zb)) / 2, (za + zb) / 2];
    for (let j = 0; j < N; j++) {
      const j1 = (j + 1) % N;
      const a = ra[j] ?? 0;
      const b = ra[j1] ?? 0;
      const c = rb[j1] ?? 0;
      const d = rb[j] ?? 0;
      const q = scale(add(add(mb.p(a), mb.p(b)), add(mb.p(c), mb.p(d))), 0.25);
      const out = sub(q, [cen[0], cen[1], q[2]]);
      // Bias toward the longitudinal slope so pinched rings still orient correctly.
      mb.quadOut(a, b, c, d, out);
    }
  }
  if (o.noseCap !== undefined) {
    const r0 = rings[0] ?? [];
    const pole = mb.v([cx, shape.mid(shape.z0), shape.z0 - o.noseCap]);
    for (let j = 0; j < N; j++) {
      mb.triOut(pole, r0[j] ?? 0, r0[(j + 1) % N] ?? 0, [0, 0, -1]);
    }
  }
  if (o.tailCap !== undefined) {
    const rl = rings[rings.length - 1] ?? [];
    const pole = mb.v([cx, shape.mid(shape.z1), shape.z1 + o.tailCap]);
    for (let j = 0; j < N; j++) {
      mb.triOut(pole, rl[j] ?? 0, rl[(j + 1) % N] ?? 0, [0, 0, 1]);
    }
  }
  return mb;
}

// ---------------------------------------------------------------------------------------------
// Bodies of revolution (spinners, jet nacelles, wheels hubs)
// ---------------------------------------------------------------------------------------------

export interface RevolveOptions {
  segments: number;
  cx?: number;
  cy?: number;
  /** Radius multiplier by section angle θ (0 = right, +90° = top) and axial position z. */
  rScale?: (theta: number, z: number) => number;
}

/**
 * Revolves a profile of [radius, z] points about an axis parallel to z. Author the profile so the
 * solid is on the RIGHT when walking along it with +z to the right and +r up (e.g. a spinner goes
 * tip → base → back to the axis; an outer skin is walked nose → tail).
 */
export function revolve(profile: readonly [number, number][], o: RevolveOptions): MeshBuilder {
  const mb = new MeshBuilder();
  const cx = o.cx ?? 0;
  const cy = o.cy ?? 0;
  const N = o.segments;
  const cols: number[][] = [];
  for (const [r, z] of profile) {
    const ids: number[] = [];
    for (let j = 0; j < N; j++) {
      const th = (2 * Math.PI * j) / N;
      const rr = r * (o.rScale ? o.rScale(th, z) : 1);
      ids.push(mb.v([cx + rr * Math.cos(th), cy + rr * Math.sin(th), z]));
    }
    cols.push(ids);
  }
  for (let i = 0; i < profile.length - 1; i++) {
    const [r0, z0] = profile[i] ?? [0, 0];
    const [r1, z1] = profile[i + 1] ?? [0, 0];
    const nr = z1 - z0;
    const nz = -(r1 - r0);
    const ca = cols[i] ?? [];
    const cb = cols[i + 1] ?? [];
    for (let j = 0; j < N; j++) {
      const j1 = (j + 1) % N;
      const th = (2 * Math.PI * (j + 0.5)) / N;
      const out: V3 = [nr * Math.cos(th), nr * Math.sin(th), nz];
      mb.quadOut(ca[j] ?? 0, ca[j1] ?? 0, cb[j1] ?? 0, cb[j] ?? 0, out);
    }
  }
  return mb;
}

// ---------------------------------------------------------------------------------------------
// Lifting surfaces
// ---------------------------------------------------------------------------------------------

/** Planform station. `s` is distance along the (unrolled) span from the root. */
export interface PlanStation {
  s: number;
  /** Leading-edge offset aft of the root leading edge, m. */
  le: number;
  /** Chord, m. */
  c: number;
  /** Thickness / chord. */
  t: number;
  /** Twist, deg (+ = nose up). */
  tw?: number;
  /** Max camber / chord. */
  cam?: number;
  /** Dihedral of the panel outboard of this station, deg. */
  dh?: number;
}

export interface MovableDef {
  key: string;
  from: number;
  to: number;
  /** Chord fraction where the moving part starts (0 = all-moving surface). */
  cut: number;
  /** Chord fraction of the hinge axis (default = cut). */
  pivot?: number;
  /** Hinge axis below the camber line, as a fraction of chord (Fowler-like motion). */
  drop?: number;
}

export interface SurfaceDef {
  /** Leading edge at s = 0 (right half). */
  root: V3;
  /** Base roll, deg: 0 = horizontal wing, 90 = vertical fin, −90 = surface hanging down. */
  roll?: number;
  stations: PlanStation[];
  mirror?: boolean;
  movables?: MovableDef[];
  /** Airfoil points per surface (upper or lower). */
  K: number;
  capRoot?: boolean;
}

export interface SectionFrame {
  le: V3;
  S: V3;
  U: V3;
  D: V3;
  c: number;
  t: number;
  cam: number;
}

export interface MovingPiece {
  key: string;
  /** +1 right, −1 left, 0 centre. */
  side: number;
  mesh: MeshBuilder;
  a: V3;
  b: V3;
}

export interface SurfaceResult {
  fixed: MeshBuilder;
  moving: MovingPiece[];
  frame(s: number): SectionFrame;
  /** Point on the right-hand surface. side: +1 upper, −1 lower, 0 camber line. */
  point(s: number, xc: number, side: number): V3;
  span: number;
}

export function liftingSurface(def: SurfaceDef): SurfaceResult {
  const st = def.stations;
  const R0 = (def.roll ?? 0) * DEG;
  const Xb: V3 = [Math.cos(R0), Math.sin(R0), 0];
  const Yb: V3 = [-Math.sin(R0), Math.cos(R0), 0];
  const ss = st.map((p) => p.s);
  // cumulative 2-D positions of the stations in the (Xb, Yb) plane
  const us: number[] = [0];
  const ws: number[] = [0];
  for (let i = 0; i < st.length - 1; i++) {
    const a = st[i];
    const b = st[i + 1];
    if (!a || !b) continue;
    const ds = b.s - a.s;
    const dh = (a.dh ?? 0) * DEG;
    us.push((us[i] ?? 0) + ds * Math.cos(dh));
    ws.push((ws[i] ?? 0) + ds * Math.sin(dh));
  }
  const sMax = ss[ss.length - 1] ?? 0;
  const eps = 1e-6;

  const frame = (s: number): SectionFrame => {
    let k = 0;
    while (k < st.length - 2 && s > (ss[k + 1] ?? 0) + eps) k++;
    const a = st[k];
    const b = st[k + 1] ?? a;
    if (!a || !b) throw new Error("surface needs stations");
    const t = b.s > a.s ? (s - a.s) / (b.s - a.s) : 0;
    let dh = a.dh ?? 0;
    // At an interior kink, use the mean dihedral so the section bisects the joint.
    if (Math.abs(s - b.s) < eps && k + 1 < st.length - 1) dh = ((a.dh ?? 0) + (b.dh ?? 0)) / 2;
    else if (Math.abs(s - a.s) < eps && k > 0) dh = ((st[k - 1]?.dh ?? 0) + (a.dh ?? 0)) / 2;
    if (Math.abs(s - sMax) < eps) dh = st[st.length - 2]?.dh ?? 0;
    const u = lerp(us[k] ?? 0, us[k + 1] ?? 0, t);
    const w = lerp(ws[k] ?? 0, ws[k + 1] ?? 0, t);
    const le = add(add(def.root, add(scale(Xb, u), scale(Yb, w))), [0, 0, lerp(a.le, b.le, t)]);
    const phi = R0 + dh * DEG;
    const S: V3 = [Math.cos(phi), Math.sin(phi), 0];
    const U0: V3 = [-Math.sin(phi), Math.cos(phi), 0];
    const tau = lerp(a.tw ?? 0, b.tw ?? 0, t) * DEG;
    const D: V3 = sub(scale([0, 0, 1], Math.cos(tau)), scale(U0, Math.sin(tau)));
    const U: V3 = add(scale(U0, Math.cos(tau)), scale([0, 0, 1], Math.sin(tau)));
    return {
      le,
      S,
      U,
      D,
      c: lerp(a.c, b.c, t),
      t: lerp(a.t, b.t, t),
      cam: lerp(a.cam ?? 0, b.cam ?? 0, t),
    };
  };

  const secPoint = (f: SectionFrame, x: number, y: number): V3 =>
    add(f.le, add(scale(f.D, x * f.c), scale(f.U, y * f.c)));

  const point = (s: number, xc: number, side: number): V3 => {
    const f = frame(s);
    const [yc, yt] = airfoil(xc, f.t, f.cam);
    return secPoint(f, xc, yc + side * yt);
  };

  /** Closed-polygon ring (CCW in section coords) for chord range [x0, x1]. */
  const ringXY = (f: SectionFrame, x0: number, x1: number, K: number): [number, number][] => {
    const pts: [number, number][] = [];
    if (x0 <= 0) {
      const xs: number[] = [];
      for (let k = 0; k <= K; k++) xs.push(x1 * (1 - Math.cos((Math.PI / 2) * (k / K))));
      for (let k = K; k >= 0; k--) {
        const x = xs[k] ?? 0;
        const [yc, yt] = airfoil(x, f.t, f.cam);
        pts.push([x, yc + yt]);
      }
      for (let k = 1; k <= K; k++) {
        const x = xs[k] ?? 0;
        const [yc, yt] = airfoil(x, f.t, f.cam);
        pts.push([x, yc - yt]);
      }
    } else {
      const L = Math.max(2, Math.round(K * (1 - x0) * 0.9));
      for (let l = L; l >= 0; l--) {
        const x = x0 + ((1 - x0) * l) / L;
        const [yc, yt] = airfoil(x, f.t, f.cam);
        pts.push([x, yc + yt]);
      }
      for (let l = 0; l <= L; l++) {
        const x = x0 + ((1 - x0) * l) / L;
        const [yc, yt] = airfoil(x, f.t, f.cam);
        pts.push([x, yc - yt]);
      }
    }
    return pts;
  };

  const loftPiece = (
    sList: number[],
    x0: number,
    x1: number,
    capStart: boolean,
    capEnd: boolean,
  ): MeshBuilder => {
    const mb = new MeshBuilder();
    const frames = sList.map(frame);
    const rings2d = frames.map((f) => ringXY(f, x0, x1, def.K));
    const ids = frames.map((f, i) => (rings2d[i] ?? []).map(([x, y]) => mb.v(secPoint(f, x, y))));
    const M = rings2d[0]?.length ?? 0;
    for (let i = 0; i < frames.length - 1; i++) {
      const fa = frames[i];
      const fb = frames[i + 1];
      const ra = rings2d[i];
      const ia = ids[i];
      const ib = ids[i + 1];
      if (!fa || !fb || !ra || !ia || !ib) continue;
      for (let j = 0; j < M - 1; j++) {
        const [xa, ya] = ra[j] ?? [0, 0];
        const [xb, yb] = ra[j + 1] ?? [0, 0];
        const dx = xb - xa;
        const dy = yb - ya;
        const D = add(fa.D, fb.D);
        const U = add(fa.U, fb.U);
        const out = add(scale(D, dy), scale(U, -dx));
        mb.quadOut(ia[j] ?? 0, ia[j + 1] ?? 0, ib[j + 1] ?? 0, ib[j] ?? 0, out);
      }
      // flat face closing the ring (hinge face of a truncated main piece)
      if (x0 <= 0 && x1 < 0.999) {
        const pa = mb.p(ia[M - 1] ?? 0);
        const pb = mb.p(ia[0] ?? 0);
        const pc = mb.p(ib[0] ?? 0);
        const pd = mb.p(ib[M - 1] ?? 0);
        const q = [mb.v(pa), mb.v(pb), mb.v(pc), mb.v(pd)] as const;
        mb.quadOut(q[0], q[1], q[2], q[3], add(fa.D, fb.D));
      }
    }
    const capAt = (i: number, sign: number) => {
      const f = frames[i];
      const r = ids[i];
      if (!f || !r) return;
      capPolygon(
        mb,
        r.map((k) => mb.p(k)),
        scale(f.S, sign),
      );
    };
    if (capStart) capAt(0, -1);
    if (capEnd) capAt(frames.length - 1, 1);
    return mb;
  };

  // breakpoints
  const movables = def.movables ?? [];
  const bps = new Set<number>(ss);
  for (const m of movables) {
    bps.add(Math.max(0, Math.min(sMax, m.from)));
    bps.add(Math.max(0, Math.min(sMax, m.to)));
  }
  const sorted = [...bps].sort((a, b) => a - b);
  const breaks: number[] = [];
  for (const b of sorted) {
    if (breaks.length === 0 || b - (breaks[breaks.length - 1] ?? 0) > 1e-4) breaks.push(b);
  }
  const movableFor = (sa: number, sb: number) =>
    movables.find((m) => m.from <= sa + 1e-4 && m.to >= sb - 1e-4);

  const fixed = new MeshBuilder();
  const moving: MovingPiece[] = [];
  let i = 0;
  while (i < breaks.length - 1) {
    const mv = movableFor(breaks[i] ?? 0, breaks[i + 1] ?? 0);
    let j = i + 1;
    while (j < breaks.length - 1 && movableFor(breaks[j] ?? 0, breaks[j + 1] ?? 0) === mv) j++;
    const sList = breaks.slice(i, j + 1);
    const first = i === 0;
    if (!mv) {
      fixed.append(loftPiece(sList, 0, 1, first ? def.capRoot !== false : true, true));
    } else {
      if (mv.cut > 0.001) {
        fixed.append(loftPiece(sList, 0, mv.cut, first ? def.capRoot !== false : true, true));
      }
      // all-moving surfaces (cut 0) use the full section
      const mesh = loftPiece(sList, mv.cut > 0.001 ? mv.cut : 0, 1, true, true);
      const pv = mv.pivot ?? mv.cut;
      const hinge = (s: number): V3 => {
        const f = frame(s);
        const [yc] = airfoil(pv, f.t, f.cam);
        return secPoint(f, pv, yc - (mv.drop ?? 0));
      };
      moving.push({
        key: mv.key,
        side: def.mirror ? 1 : 0,
        mesh,
        a: hinge(sList[0] ?? 0),
        b: hinge(sList[sList.length - 1] ?? 0),
      });
    }
    i = j;
  }

  if (def.mirror) {
    fixed.append(fixed.mirrorX());
    const left = moving.map<MovingPiece>((m) => ({
      key: m.key,
      side: -1,
      mesh: m.mesh.mirrorX(),
      a: [-m.a[0], m.a[1], m.a[2]],
      b: [-m.b[0], m.b[1], m.b[2]],
    }));
    moving.push(...left);
  }

  return { fixed, moving, frame, point, span: sMax };
}

// ---------------------------------------------------------------------------------------------
// Struts, tubes and small parts
// ---------------------------------------------------------------------------------------------

export interface TubeOptions {
  seg?: number;
  /** Minor / major axis ratio of the elliptical section (1 = round). */
  ratio?: number;
  /** Direction the long axis of the section should follow (default flow, +z). */
  flow?: V3;
  caps?: boolean;
}

/** Straight tapered tube from a to b with (optionally) streamlined elliptical section. */
export function tube(a: V3, b: V3, wA: number, wB: number, o: TubeOptions = {}): MeshBuilder {
  const mb = new MeshBuilder();
  const seg = o.seg ?? 8;
  const ratio = o.ratio ?? 1;
  const dir = norm(sub(b, a));
  let flow = o.flow ?? [0, 0, 1];
  flow = sub(flow, scale(dir, dot(flow, dir)));
  if (Math.hypot(flow[0], flow[1], flow[2]) < 1e-6) {
    flow = Math.abs(dir[1]) < 0.9 ? cross(dir, [0, 1, 0]) : cross(dir, [1, 0, 0]);
  }
  const e1 = norm(flow);
  const e2 = norm(cross(dir, e1));
  const ring = (c: V3, w: number) => {
    const ids: number[] = [];
    for (let j = 0; j < seg; j++) {
      const th = (2 * Math.PI * j) / seg;
      ids.push(
        mb.v(
          add(c, add(scale(e1, (Math.cos(th) * w) / 2), scale(e2, (Math.sin(th) * w * ratio) / 2))),
        ),
      );
    }
    return ids;
  };
  const ra = ring(a, wA);
  const rb = ring(b, wB);
  const mid = mix3(a, b, 0.5);
  for (let j = 0; j < seg; j++) {
    const j1 = (j + 1) % seg;
    const q = mb.p(ra[j] ?? 0);
    const out = sub(q, add(a, scale(dir, dot(sub(q, a), dir))));
    mb.quadOut(ra[j] ?? 0, ra[j1] ?? 0, rb[j1] ?? 0, rb[j] ?? 0, out);
  }
  if (o.caps !== false) {
    capPolygon(
      mb,
      ra.map((k) => mb.p(k)),
      scale(dir, -1),
    );
    capPolygon(
      mb,
      rb.map((k) => mb.p(k)),
      dir,
    );
  }
  void mid;
  return mb;
}

/** Axis-aligned rounded-ish box (8 verts, flat shaded via separate faces). */
export function box(c: V3, size: V3): MeshBuilder {
  const mb = new MeshBuilder();
  const [hx, hy, hz] = [size[0] / 2, size[1] / 2, size[2] / 2];
  const faces: [V3, V3, V3][] = [
    [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ],
    [
      [-1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ],
    [
      [0, 1, 0],
      [1, 0, 0],
      [0, 0, 1],
    ],
    [
      [0, -1, 0],
      [1, 0, 0],
      [0, 0, 1],
    ],
    [
      [0, 0, 1],
      [1, 0, 0],
      [0, 1, 0],
    ],
    [
      [0, 0, -1],
      [1, 0, 0],
      [0, 1, 0],
    ],
  ];
  const h: V3 = [hx, hy, hz];
  for (const [n, u, v] of faces) {
    const cn = add(c, [n[0] * h[0], n[1] * h[1], n[2] * h[2]]);
    const du: V3 = [u[0] * h[0], u[1] * h[1], u[2] * h[2]];
    const dv: V3 = [v[0] * h[0], v[1] * h[1], v[2] * h[2]];
    const a = mb.v(sub(sub(cn, du), dv));
    const b = mb.v(sub(add(cn, du), dv));
    const cc = mb.v(add(add(cn, du), dv));
    const d = mb.v(add(sub(cn, du), dv));
    mb.quadOut(a, b, cc, d, n);
  }
  return mb;
}

/** Thin blade antenna / fin: a swept slab standing on point `base`. */
export function blade(base: V3, height: number, chord: number, sweep: number, thick = 0.012) {
  const mb = new MeshBuilder();
  const up = height >= 0 ? 1 : -1;
  const p0: V3 = [base[0], base[1], base[2] - chord / 2];
  const p1: V3 = [base[0], base[1], base[2] + chord / 2];
  const p2: V3 = [base[0], base[1] + height, base[2] + chord * 0.3 + sweep];
  const p3: V3 = [base[0], base[1] + height, base[2] - chord * 0.1 + sweep];
  const ids = (dx: number) => [p0, p1, p2, p3].map((p) => mb.v([p[0] + dx, p[1], p[2]]));
  const L = ids(-thick / 2);
  const R = ids(thick / 2);
  const g = (k: number, arr: number[]) => arr[k] ?? 0;
  mb.quadOut(g(0, R), g(1, R), g(2, R), g(3, R), [1, 0, 0]);
  mb.quadOut(g(0, L), g(1, L), g(2, L), g(3, L), [-1, 0, 0]);
  mb.quadOut(g(0, L), g(0, R), g(3, R), g(3, L), [0, 0, -1]);
  mb.quadOut(g(1, L), g(1, R), g(2, R), g(2, L), [0, 0, 1]);
  mb.quadOut(g(3, L), g(3, R), g(2, R), g(2, L), [0, up, 0]);
  return mb;
}

/** Piecewise-linear helper re-exported for builders. */
export { plin };
