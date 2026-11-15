#!/usr/bin/env node
/**
 * Builds the SkyReady trainer aircraft model:  public/models/trainer.glb  (+ src/views/trainer-meta.ts)
 *
 *   node scripts/build-aircraft.mjs
 *
 * ORIGINAL WORK. Everything here is generated from numbers typed into this file: a four-seat,
 * high-wing, single-engine, fixed-tricycle-gear trainer in the class of a Cessna 172. Overall
 * proportions follow the publicly known dimensions of that class of aircraft (about 8.3 m long,
 * 11 m span, NACA 2412 wing section — the NACA 4-digit formulas are public domain). No drawings,
 * meshes or textures from any other product were used; nothing comes from FlightGear.
 *
 * `three` (MIT, devDependency) is used for vector / quaternion maths only. The binary glTF (GLB)
 * container and the PNG textures are written directly from typed arrays — no canvas, no DOM.
 *
 * AUTHORING FRAME ("A"): metres, origin at the centre of gravity, +x = nose, +y = LEFT wing,
 * +z = up — the same local axes as aircraftMatrix() in src/world/world.ts.
 * Shapes are typed in "station" numbers because that is how aircraft are described:
 *   Xa = metres AFT of the firewall,  zg = metres above the bottom of the main wheels with the
 *   fuselage level.   x = CG_XA − Xa,   z = zg − CG_ZG.
 * glTF FRAME: +Z nose, +Y up, +X left wing  (x_gltf, y_gltf, z_gltf) = (y_A, z_A, x_A).
 * CesiumJS turns that into +X nose / +Y left / +Z up, i.e. exactly frame A.
 *
 * GROUND CONTACT: the flight model (JSBSim c172p) rests on its wheels with the centre of gravity
 * 1.335 m above the ground and the nose 2.52° up (measured in tests/views). The wheels are placed
 * so that in exactly that attitude all three tyres touch the ground.
 *
 * NODES (see NODE DOCS at the bottom; also written to src/views/trainer-meta.ts):
 *   every moving part is its own node whose LOCAL +X AXIS IS ITS HINGE / SPIN AXIS.
 */
import * as THREE from "three";
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_GLB = path.join(ROOT, "public/models/trainer.glb");
const OUT_META = path.join(ROOT, "src/views/trainer-meta.ts");

// ====================================================================== reference numbers

const CG_XA = 1.07; // centre of gravity, metres aft of the firewall (JSBSim: about 42 in with one pilot and 40 gal)
const STATIC_PITCH_DEG = 2.52; // nose-up attitude of the flight model at rest on its wheels
const STATIC_CG_HEIGHT = 1.335; // m, CG above the ground at rest (CG_HEIGHT_FT 4.36 ft = 1.329 m, measured 1.340 m)
const MAIN_XA = 1.478; // main wheel axle (JSBSim 58.2 in)
const NOSE_XA = -0.173; // nose wheel axle (JSBSim −6.8 in)
const sinP = Math.sin((STATIC_PITCH_DEG * Math.PI) / 180);
const cosP = Math.cos((STATIC_PITCH_DEG * Math.PI) / 180);
/** Body-frame z of a tyre's lowest point so that it touches the ground in the static attitude. */
const contactZ = (xa) => (-STATIC_CG_HEIGHT - (CG_XA - xa) * sinP) / cosP;
const CG_ZG = -contactZ(MAIN_XA); // zg = 0 is the bottom of the main tyres (fuselage level)
const NOSE_CONTACT_ZG = contactZ(NOSE_XA) + CG_ZG; // nose tyre bottom (a few cm lower: the aircraft sits nose-up)

const THRUST_ZG = 1.17;
const PROP_XA = -0.95;
const PROP_RADIUS = 0.9525; // 75 in propeller
const WING = { rootY: 0.55, breakY: 2.5, tipY: 5.35, capY: 5.5, rootChord: 1.63, tipChord: 1.13, leXa: 0.63, leSweep: 0.2, zq: 2.048, dihedralDeg: 1.73, twistRoot: 1.5, twistTip: -1.5, flapY0: 0.62, flapY1: 2.47, flapHinge: 0.7, ailY0: 2.53, ailY1: 5.27, ailHinge: 0.76 };
const HSTAB = { halfSpan: 1.725, rootLe: 5.3, rootChord: 1.32, tipLe: 5.62, tipChord: 0.8, hingeXa: 6.12, zg: 1.56, elevY0: 0.1 };
const FIN = { zRoot: 1.56, zTip: 2.9, hinge: [[6.06, 1.36], [6.66, 2.9]], te: [[6.64, 1.36], [7.06, 2.9]], le: [[1.56, 4.3], [1.7, 4.3], [1.8, 5.1], [1.88, 5.4], [2.9, 6.34]] };
const GLARE = { lipXa: 0.49, lipZg: 1.65 };
/** Pilot's eye (left seat), frame A is filled in below. */
const EYE = { xa: 1.04, y: 0.24, zg: 1.78 };

const D2R = Math.PI / 180;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (e0, e1, x) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};
/** Station coordinates → frame A. */
const A = (xa, y, zg) => [CG_XA - xa, y, zg - CG_ZG];
const vsub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const vadd = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const vscale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const vdot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const vcross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const vlen = (a) => Math.hypot(a[0], a[1], a[2]);
const vnorm = (a) => {
  const l = vlen(a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
const vlerp = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

/** Monotone cubic interpolation (Fritsch–Carlson) through knots [[x, y], …]; no overshoot. */
function pchip(knots) {
  const n = knots.length;
  const xs = knots.map((k) => k[0]);
  const ys = knots.map((k) => k[1]);
  if (n === 2) return (x) => lerp(ys[0], ys[1], clamp((x - xs[0]) / (xs[1] - xs[0]), 0, 1));
  const h = [];
  const d = [];
  for (let i = 0; i < n - 1; i++) {
    h.push(xs[i + 1] - xs[i]);
    d.push((ys[i + 1] - ys[i]) / h[i]);
  }
  const m = new Array(n).fill(0);
  m[0] = d[0];
  m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) {
    if (d[i - 1] * d[i] <= 0) m[i] = 0;
    else {
      const w1 = 2 * h[i] + h[i - 1];
      const w2 = h[i] + 2 * h[i - 1];
      m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i]);
    }
  }
  return (x) => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0;
    while (i < n - 2 && x > xs[i + 1]) i++;
    const t = (x - xs[i]) / h[i];
    const t2 = t * t;
    const t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h[i] * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h[i] * m[i + 1];
  };
}
/** Piecewise pchip with sharp corners at the listed x values. */
function pchipCorners(knots, corners) {
  const pieces = [];
  let cur = [];
  for (const k of knots) {
    cur.push(k);
    if (corners.includes(k[0]) && cur.length > 1) {
      pieces.push(cur);
      cur = [k];
    }
  }
  if (cur.length > 1) pieces.push(cur);
  const fns = pieces.map((p) => ({ x0: p[0][0], x1: p[p.length - 1][0], f: pchip(p) }));
  return (x) => {
    for (const p of fns) if (x <= p.x1) return p.f(Math.max(x, p.x0));
    return fns[fns.length - 1].f(x);
  };
}
/** Linear interpolation through sorted knots. */
function linear(knots) {
  return (x) => {
    if (x <= knots[0][0]) return knots[0][1];
    for (let i = 0; i < knots.length - 1; i++) {
      if (x <= knots[i + 1][0]) return lerp(knots[i][1], knots[i + 1][1], (x - knots[i][0]) / (knots[i + 1][0] - knots[i][0]));
    }
    return knots[knots.length - 1][1];
  };
}

// ====================================================================== texture atlas layout

const ATLAS_W = 2048;
const ATLAS_H = 1024;
const REG = {
  F: { x: 8, y: 8, w: 2032, h: 628 }, // fuselage, unwrapped (u along the body, v around it)
  W: { x: 0, y: 656, w: 1024, h: 368 }, // wing, seen from above (both wings share it)
  V: { x: 1040, y: 656, w: 612, h: 332 }, // fin + rudder, seen from the side
  H: { x: 1668, y: 656, w: 352, h: 280 }, // tailplane, seen from above
};
const W_MAP = { y0: 0.5, y1: 5.56, xa0: 0.55, xa1: 2.35 };
const V_MAP = { xa0: 4.1, xa1: 7.16, zg0: 1.3, zg1: 2.96 };
const H_MAP = { y0: 0, y1: 1.76, xa0: 5.25, xa1: 6.65 };
const uvRegion = (reg, s, t) => [(reg.x + s * reg.w) / ATLAS_W, (reg.y + t * reg.h) / ATLAS_H];
const uvWing = (xa, y) => uvRegion(REG.W, (Math.abs(y) - W_MAP.y0) / (W_MAP.y1 - W_MAP.y0), (xa - W_MAP.xa0) / (W_MAP.xa1 - W_MAP.xa0));
const uvFin = (xa, zg) => uvRegion(REG.V, (xa - V_MAP.xa0) / (V_MAP.xa1 - V_MAP.xa0), 1 - (zg - V_MAP.zg0) / (V_MAP.zg1 - V_MAP.zg0));
const uvStab = (xa, y) => uvRegion(REG.H, (Math.abs(y) - H_MAP.y0) / (H_MAP.y1 - H_MAP.y0), (xa - H_MAP.xa0) / (H_MAP.xa1 - H_MAP.xa0));

/** Paint colours (sRGB 0–255) and surface finish (roughness, metallic). */
const COL = {
  white: [243, 244, 245],
  navy: [17, 44, 88],
  sky: [56, 161, 230], // the SkyReady accent colour
  glass: [16, 22, 31],
  seal: [12, 12, 14],
  line: [168, 173, 180],
  inlet: [10, 10, 11],
};
const SWATCHES = {
  white: { c: COL.white, r: 0.36, m: 0 },
  navy: { c: COL.navy, r: 0.36, m: 0 },
  sky: { c: COL.sky, r: 0.36, m: 0 },
  tyre: { c: [24, 24, 26], r: 0.92, m: 0 },
  rim: { c: [176, 180, 186], r: 0.42, m: 0.55 },
  steel: { c: [150, 154, 160], r: 0.35, m: 0.7 },
  chrome: { c: [214, 218, 224], r: 0.16, m: 0.9 },
  spinner: { c: [228, 231, 235], r: 0.22, m: 0.6 },
  prop: { c: [26, 26, 29], r: 0.48, m: 0.1 },
  proptip: { c: [236, 236, 232], r: 0.45, m: 0 },
  exhaust: { c: [70, 62, 56], r: 0.6, m: 0.7 },
  dark: { c: [28, 29, 32], r: 0.7, m: 0 },
  lensRed: { c: [150, 14, 14], r: 0.12, m: 0 },
  lensGreen: { c: [10, 120, 52], r: 0.12, m: 0 },
  lensClear: { c: [226, 230, 232], r: 0.08, m: 0.1 },
  grey: { c: [120, 124, 130], r: 0.6, m: 0 },
};
const SW_SIZE = 32;
const swatchNames = Object.keys(SWATCHES);
const swatchRect = (name) => {
  const i = swatchNames.indexOf(name);
  if (i < 0) throw new Error("unknown swatch " + name);
  return { x: 1668 + (i % 11) * SW_SIZE, y: 944 + Math.floor(i / 11) * SW_SIZE, w: SW_SIZE, h: SW_SIZE };
};
const uvSwatch = (name) => {
  const r = swatchRect(name);
  return [(r.x + r.w / 2) / ATLAS_W, (r.y + r.h / 2) / ATLAS_H];
};

/**
 * "Kinds" tell the simulator's shader what a surface is. They are stored as a whole number added
 * to the texture U coordinate (the texture repeats, so the colour lookup is unchanged).
 */
const KIND = { exterior: 0, interior: 1, propDisc: 2, beacon: 3, navLeft: 4, navRight: 5, tail: 6, strobe: 7, landing: 8, taxi: 9 };

// ====================================================================== mesh container

class Mesh {
  constructor() {
    this.pos = [];
    this.nrm = [];
    this.uv = [];
    this.idx = [];
  }
  get count() {
    return this.pos.length / 3;
  }
  get triangles() {
    return this.idx.length / 3;
  }
  vert(p, n, uv) {
    this.pos.push(p[0], p[1], p[2]);
    this.nrm.push(n[0], n[1], n[2]);
    this.uv.push(uv[0], uv[1]);
    return this.count - 1;
  }
  add(other) {
    const o = this.count;
    for (const v of other.pos) this.pos.push(v);
    for (const v of other.nrm) this.nrm.push(v);
    for (const v of other.uv) this.uv.push(v);
    for (const i of other.idx) this.idx.push(i + o);
    return this;
  }
  /** Mirror image across the aircraft's plane of symmetry (left ↔ right). */
  mirrored() {
    const m = new Mesh();
    for (let i = 0; i < this.pos.length; i += 3) {
      m.pos.push(this.pos[i], -this.pos[i + 1], this.pos[i + 2]);
      m.nrm.push(this.nrm[i], -this.nrm[i + 1], this.nrm[i + 2]);
    }
    m.uv = this.uv.slice();
    for (let i = 0; i < this.idx.length; i += 3) m.idx.push(this.idx[i], this.idx[i + 2], this.idx[i + 1]);
    return m;
  }
  /** Add a whole number to every U coordinate (see KIND). */
  kind(k) {
    for (let i = 0; i < this.uv.length; i += 2) this.uv[i] += k;
    return this;
  }
  /**
   * A surface through a grid of points P[i][j]. Smooth normals come from the neighbouring faces.
   *   closed: the last column repeats the first (a tube) — their normals are merged.
   *   outward(p) → a direction the normal at p should roughly agree with (decides the facing).
   * rows0..rows1 lets one smooth surface be emitted in several pieces (for separate nodes).
   */
  static gridData(P, { closed = false, outward }) {
    const ni = P.length;
    const nj = P[0].length;
    const acc = P.map((row) => row.map(() => [0, 0, 0]));
    const addN = (i, j, n) => {
      const a = acc[i][j];
      a[0] += n[0];
      a[1] += n[1];
      a[2] += n[2];
    };
    for (let i = 0; i < ni - 1; i++) {
      for (let j = 0; j < nj - 1; j++) {
        const a = P[i][j];
        const b = P[i + 1][j];
        const c = P[i + 1][j + 1];
        const d = P[i][j + 1];
        const n1 = vcross(vsub(b, a), vsub(c, a));
        const n2 = vcross(vsub(c, a), vsub(d, a));
        addN(i, j, n1);
        addN(i + 1, j, n1);
        addN(i + 1, j + 1, n1);
        addN(i, j, n2);
        addN(i + 1, j + 1, n2);
        addN(i, j + 1, n2);
      }
    }
    for (let i = 0; i < ni; i++) {
      if (closed) {
        const s = vadd(acc[i][0], acc[i][nj - 1]);
        acc[i][0] = s;
        acc[i][nj - 1] = s.slice();
      }
      // a row squeezed into one point (a pole): share one normal
      let spread = 0;
      for (let j = 1; j < nj; j++) spread = Math.max(spread, vlen(vsub(P[i][j], P[i][0])));
      if (spread < 1e-7) {
        let s = [0, 0, 0];
        for (let j = 0; j < nj; j++) s = vadd(s, acc[i][j]);
        for (let j = 0; j < nj; j++) acc[i][j] = s.slice();
      }
    }
    // facing
    let vote = 0;
    for (let i = 0; i < ni; i++) for (let j = 0; j < nj; j++) vote += vdot(acc[i][j], outward(P[i][j]));
    const flip = vote < 0;
    const N = acc.map((row) => row.map((n) => (flip ? vscale(vnorm(n), -1) : vnorm(n))));
    return { P, N, flip, ni, nj };
  }
  addGrid(g, uvFn, rows0 = 0, rows1 = g.ni - 1) {
    const base = this.count;
    const nj = g.nj;
    for (let i = rows0; i <= rows1; i++) for (let j = 0; j < nj; j++) this.vert(g.P[i][j], g.N[i][j], uvFn(i, j, g.P[i][j]));
    for (let i = 0; i < rows1 - rows0; i++) {
      for (let j = 0; j < nj - 1; j++) {
        const a = base + i * nj + j;
        const b = base + (i + 1) * nj + j;
        const c = base + (i + 1) * nj + j + 1;
        const d = base + i * nj + j + 1;
        if (g.flip) this.idx.push(a, c, b, a, d, c);
        else this.idx.push(a, b, c, a, c, d);
      }
    }
    return this;
  }
  grid(P, uvFn, opts) {
    return this.addGrid(Mesh.gridData(P, opts), uvFn);
  }
  /** Flat cap: a fan from the centroid of a loop of points; `normal` decides the facing. */
  fan(loop, normal, uvFn) {
    let c = [0, 0, 0];
    for (const p of loop) c = vadd(c, p);
    c = vscale(c, 1 / loop.length);
    const n = vnorm(normal);
    const ci = this.vert(c, n, uvFn(c));
    const first = this.count;
    for (const p of loop) this.vert(p, n, uvFn(p));
    for (let k = 0; k < loop.length; k++) {
      const a = first + k;
      const b = first + ((k + 1) % loop.length);
      const fn = vcross(vsub(loop[k], c), vsub(loop[(k + 1) % loop.length], c));
      if (vdot(fn, n) >= 0) this.idx.push(ci, a, b);
      else this.idx.push(ci, b, a);
    }
    return this;
  }
  /** Round tube / cone along a path of points with a radius at each point (closed ends optional). */
  tube(path, radii, uvFn, { segs = 10, caps = true } = {}) {
    const P = [];
    let prevN = null;
    for (let i = 0; i < path.length; i++) {
      const t = vnorm(vsub(path[Math.min(i + 1, path.length - 1)], path[Math.max(i - 1, 0)]));
      let n = prevN ? vsub(prevN, vscale(t, vdot(prevN, t))) : vcross(t, Math.abs(t[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0]);
      n = vnorm(n);
      prevN = n;
      const b = vcross(t, n);
      const row = [];
      for (let j = 0; j <= segs; j++) {
        const a = (j / segs) * Math.PI * 2;
        row.push(vadd(path[i], vadd(vscale(n, Math.cos(a) * radii[i]), vscale(b, Math.sin(a) * radii[i]))));
      }
      P.push(row);
    }
    const centre = (p) => {
      let best = path[0];
      let bd = Infinity;
      for (const q of path) {
        const d = vlen(vsub(p, q));
        if (d < bd) {
          bd = d;
          best = q;
        }
      }
      return vsub(p, best);
    };
    this.grid(P, uvFn, { closed: true, outward: centre });
    if (caps) {
      if (radii[0] > 1e-4) this.fan(P[0].slice(0, segs), vsub(path[0], path[1]), uvFn);
      const L = path.length - 1;
      if (radii[L] > 1e-4) this.fan(P[L].slice(0, segs), vsub(path[L], path[L - 1]), uvFn);
    }
    return this;
  }
  /** Solid of revolution: profile [[along, radius], …] around an axis through `origin`. */
  lathe(origin, axis, profile, uvFn, { segs = 20 } = {}) {
    const t = vnorm(axis);
    const n = vnorm(vcross(t, Math.abs(t[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0]));
    const b = vcross(t, n);
    const P = profile.map(([s, r]) => {
      const row = [];
      const c = vadd(origin, vscale(t, s));
      for (let j = 0; j <= segs; j++) {
        const a = (j / segs) * Math.PI * 2;
        row.push(vadd(c, vadd(vscale(n, Math.cos(a) * r), vscale(b, Math.sin(a) * r))));
      }
      return row;
    });
    const mid = profile.reduce((s, p) => s + p[0], 0) / profile.length;
    const c0 = vadd(origin, vscale(t, mid));
    return this.grid(P, uvFn, { closed: true, outward: (p) => vsub(p, c0) });
  }
  /** Box from 8 corner points (4 bottom, 4 top, same order), flat shaded. */
  box(lo, hi, uvFn) {
    const faces = [
      [lo[0], lo[1], lo[2], lo[3]],
      [hi[0], hi[1], hi[2], hi[3]],
      [lo[0], lo[1], hi[1], hi[0]],
      [lo[1], lo[2], hi[2], hi[1]],
      [lo[2], lo[3], hi[3], hi[2]],
      [lo[3], lo[0], hi[0], hi[3]],
    ];
    let c = [0, 0, 0];
    for (const p of [...lo, ...hi]) c = vadd(c, p);
    c = vscale(c, 1 / 8);
    for (const f of faces) {
      let fc = [0, 0, 0];
      for (const p of f) fc = vadd(fc, p);
      fc = vscale(fc, 0.25);
      this.fan(f, vsub(fc, c), uvFn);
    }
    return this;
  }
}

// ====================================================================== fuselage loft

/** Cross-sections of the fuselage: [Xa, bottom, top, height of widest point, half width, upper roundness, lower roundness]. */
const FUS_KNOTS = [
  [-0.895, 1.03, 1.31, 1.17, 0.14, 2.0, 2.0],
  [-0.885, 0.93, 1.42, 1.175, 0.33, 2.4, 2.4],
  [-0.862, 0.875, 1.47, 1.18, 0.415, 2.6, 2.6],
  [-0.8, 0.835, 1.505, 1.18, 0.462, 2.8, 2.8],
  [-0.6, 0.8, 1.545, 1.18, 0.495, 3.0, 3.0],
  [-0.3, 0.765, 1.585, 1.18, 0.52, 3.2, 3.2],
  [0.0, 0.74, 1.615, 1.19, 0.54, 3.4, 3.4],
  [0.12, 0.725, 1.635, 1.19, 0.545, 3.4, 3.5],
  [0.42, 0.685, 1.905, 1.215, 0.553, 3.8, 3.55],
  [0.7, 0.645, 2.125, 1.24, 0.56, 4.2, 3.6],
  [0.95, 0.625, 2.17, 1.27, 0.56, 4.4, 3.6],
  [1.7, 0.62, 2.17, 1.28, 0.555, 4.4, 3.6],
  [2.26, 0.65, 2.1, 1.28, 0.53, 4.0, 3.5],
  [2.75, 0.73, 1.975, 1.3, 0.48, 3.6, 3.4],
  [3.2, 0.81, 1.845, 1.33, 0.42, 3.2, 3.2],
  [4.0, 0.975, 1.725, 1.37, 0.315, 2.8, 2.8],
  [5.0, 1.17, 1.65, 1.42, 0.195, 2.6, 2.6],
  [5.8, 1.315, 1.605, 1.465, 0.1, 2.4, 2.4],
  [6.05, 1.36, 1.59, 1.478, 0.055, 2.2, 2.2],
];
const FUS_X0 = FUS_KNOTS[0][0];
const FUS_X1 = FUS_KNOTS[FUS_KNOTS.length - 1][0];
const WS_BASE = 0.12; // windshield base (sharp change of slope in the top line)
const WS_TOP = 0.7;
const CABIN_END = 3.2;
const fusCol = (c) => FUS_KNOTS.map((k) => [k[0], k[c]]);
const FUS = {
  zB: pchip(fusCol(1)),
  zT: pchipCorners(fusCol(2), [WS_BASE, WS_TOP]),
  zMid: pchip(fusCol(3)),
  w: pchip(fusCol(4)),
  nU: pchip(fusCol(5)),
  nL: pchip(fusCol(6)),
};
const fusSection = (xa) => ({ zB: FUS.zB(xa), zT: FUS.zT(xa), zMid: FUS.zMid(xa), w: FUS.w(xa), nU: FUS.nU(xa), nL: FUS.nL(xa) });
/** Inside surface of the cabin (what the pilot sees): a little smaller, with a flat ceiling under the wing. */
function cabinSection(xa) {
  const s = fusSection(xa);
  const box = smoothstep(0.5, 0.95, xa) * (1 - smoothstep(2.2, 2.7, xa));
  const top = s.zT - 0.03;
  const ceiling = 2.0;
  return { zB: s.zB + 0.035, zT: top > ceiling ? ceiling + (top - ceiling) * 0.08 : top, zMid: s.zMid, w: s.w - 0.027, nU: lerp(s.nU, 7.5, box), nL: s.nL };
}

const HALF_SEGS = 23;
/** One half of a cross-section (bottom centre → left side → top centre) as HALF_SEGS+1 points [y, zg], evenly spaced along the outline. */
function halfRing(s, n = HALF_SEGS) {
  const M = 360;
  const pts = [];
  for (let m = 0; m <= M; m++) {
    const t = Math.PI * (1 - m / M);
    const sn = Math.sin(t);
    const cs = Math.cos(t);
    const up = cs >= 0;
    const e = 2 / (up ? s.nU : s.nL);
    const y = s.w * Math.pow(Math.abs(sn), e);
    const z = up ? s.zMid + (s.zT - s.zMid) * Math.pow(cs, e) : s.zMid - (s.zMid - s.zB) * Math.pow(-cs, e);
    pts.push([y, z]);
  }
  const cum = [0];
  for (let m = 1; m <= M; m++) cum.push(cum[m - 1] + Math.hypot(pts[m][0] - pts[m - 1][0], pts[m][1] - pts[m - 1][1]));
  const out = [];
  let k = 0;
  for (let j = 0; j <= n; j++) {
    const target = (j / n) * cum[M];
    while (k < M - 1 && cum[k + 1] < target) k++;
    const f = cum[k + 1] > cum[k] ? (target - cum[k]) / (cum[k + 1] - cum[k]) : 0;
    out.push([lerp(pts[k][0], pts[k + 1][0], f), lerp(pts[k][1], pts[k + 1][1], f)]);
  }
  out[0][0] = 0;
  out[n][0] = 0;
  return out;
}
/** Full ring in frame A: bottom → left side → top → right side → bottom (2·HALF_SEGS+1 points, seam at the bottom). */
function ringA(xa, s) {
  const h = halfRing(s);
  const row = [];
  for (let j = 0; j <= HALF_SEGS; j++) row.push(A(xa, h[j][0], h[j][1]));
  for (let j = HALF_SEGS - 1; j >= 0; j--) row.push(A(xa, -h[j][0], h[j][1]));
  return row;
}
/** Station list: every knot plus extra rings so no gap is wider than `maxGap`, and tight rings at slope changes. */
function stations(x0, x1, knots, maxGap, extra = []) {
  const set = new Set();
  for (const k of knots) if (k >= x0 - 1e-9 && k <= x1 + 1e-9) set.add(+k.toFixed(4));
  for (const e of extra) if (e >= x0 && e <= x1) set.add(+e.toFixed(4));
  set.add(+x0.toFixed(4));
  set.add(+x1.toFixed(4));
  const base = [...set].sort((a, b) => a - b);
  const out = [];
  for (let i = 0; i < base.length - 1; i++) {
    const n = Math.max(1, Math.ceil((base[i + 1] - base[i]) / maxGap - 1e-6));
    for (let k = 0; k < n; k++) out.push(+(base[i] + ((base[i + 1] - base[i]) * k) / n).toFixed(5));
  }
  out.push(base[base.length - 1]);
  return out;
}
/** A lofted body with a texture parameter u that follows the surface (so steep parts such as the nose get their share of pixels). */
function loft(xs, sectionFn) {
  const P = xs.map((xa) => ringA(xa, sectionFn(xa)));
  const u = [0];
  for (let i = 1; i < P.length; i++) {
    let d = 0;
    for (let j = 0; j < P[i].length; j++) d += vlen(vsub(P[i][j], P[i - 1][j]));
    u.push(u[i - 1] + d / P[i].length);
  }
  const total = u[u.length - 1];
  return { xs, P, u: u.map((v) => v / total), nj: P[0].length };
}

const fusXs = stations(FUS_X0, FUS_X1, FUS_KNOTS.map((k) => k[0]), 0.13, [WS_BASE - 0.03, WS_BASE + 0.03, WS_TOP - 0.04, WS_TOP + 0.05, 0.02, CABIN_END]);
const fusLoft = loft(fusXs, fusSection);
const cabXs = stations(WS_BASE, CABIN_END, FUS_KNOTS.map((k) => k[0]), 0.11, [WS_BASE + 0.03, 0.45, 0.52, 0.6, WS_TOP - 0.04, WS_TOP + 0.05]);
const cabLoft = loft(cabXs, cabinSection);

// ====================================================================== paint (procedural textures)

/** Smooth maximum: joins straight edges with rounded corners of roughly radius k. */
const smax = (a, b, k) => {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.max(a, b) + h * h * k * 0.25;
};
/** Signed distance (m, + = outside) to the half-plane left of the directed line p→q, in a 2D drawing. */
const edge = (px, py, qx, qy) => {
  const dx = qx - px;
  const dy = qy - py;
  const l = Math.hypot(dx, dy);
  return (x, y) => ((x - px) * dy - (y - py) * dx) / l;
};
const segDist = (x, y, ax, ay, bx, by) => {
  const dx = bx - ax;
  const dy = by - ay;
  const t = clamp(((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1), 0, 1);
  return Math.hypot(x - ax - dx * t, y - ay - dy * t);
};

// Windows, drawn in side view (Xa to the right, zg up). Each returns metres outside (+) / inside (−).
const SILL = 1.52;
const WIN_TOP = 1.965;
const R_WIN = 0.035;
const wsLower = edge(0.41, 1.535, 0.14, 1.625);
const wsPost = edge(0.705, 1.985, 0.41, 1.535);
function windshield(xa, zg, top) {
  let d = WS_BASE + 0.025 - xa;
  d = smax(d, -wsLower(xa, zg), R_WIN);
  d = smax(d, -wsPost(xa, zg), R_WIN);
  d = smax(d, xa - top, R_WIN);
  return d;
}
const sw1Front = edge(0.762, WIN_TOP, 0.452, SILL);
function sideWindow1(xa, zg) {
  let d = SILL - zg;
  d = smax(d, zg - WIN_TOP, R_WIN);
  d = smax(d, xa - 1.62, R_WIN);
  d = smax(d, sw1Front(xa, zg), R_WIN);
  return d;
}
const sw2Rear = edge(2.52, SILL, 2.24, WIN_TOP);
function sideWindow2(xa, zg) {
  let d = SILL - zg;
  d = smax(d, zg - WIN_TOP, R_WIN);
  d = smax(d, 1.7 - xa, R_WIN);
  d = smax(d, sw2Rear(xa, zg), R_WIN);
  return d;
}
const rwLower = edge(2.34, 2.02, 3.08, 1.715);
function rearWindow(xa, zg) {
  let d = 2.37 - xa;
  d = smax(d, xa - 3.06, R_WIN);
  d = smax(d, rwLower(xa, zg), R_WIN);
  return d;
}
/** `wsTop`: where the windshield ends at the top (outside: the wing leading edge; inside: where the ceiling starts). */
const windowDist = (xa, zg, wsTop = WS_TOP - 0.012) => Math.min(windshield(xa, zg, wsTop), sideWindow1(xa, zg), sideWindow2(xa, zg), rearWindow(xa, zg));

// The livery stripe: a navy band with a sky-blue pinstripe under it, sweeping up over the fin.
const swoosh = pchip([
  [-0.9, 1.19],
  [1.0, 1.14],
  [2.4, 1.14],
  [4.0, 1.19],
  [5.0, 1.33],
  [5.6, 1.56],
  [6.2, 1.95],
  [6.7, 2.4],
  [7.2, 2.95],
]);
/** 0 none, 1 navy band, 2 sky-blue pinstripe. */
function stripeAt(xa, zg) {
  const d = zg - swoosh(xa);
  const widen = 1 + 2.4 * smoothstep(4.9, 6.9, xa);
  const hb = 0.075 * smoothstep(-0.87, -0.2, xa) * widen;
  if (hb < 0.004) return 0;
  if (Math.abs(d) < hb) return 1;
  const gap = 0.032 * widen;
  const thin = 0.042 * Math.min(widen, 2.2) * smoothstep(-0.8, -0.1, xa);
  if (d < -hb - gap && d > -hb - gap - thin) return 2;
  return 0;
}

// Registration-style marking, block letters drawn as strokes in a 0.6 × 1 box.
const GLYPHS = {
  S: [[[0.58, 0.85], [0.48, 0.96], [0.3, 1], [0.12, 0.96], [0.03, 0.84], [0.05, 0.68], [0.18, 0.57], [0.42, 0.45], [0.55, 0.33], [0.57, 0.16], [0.48, 0.04], [0.3, 0], [0.12, 0.04], [0.02, 0.15]]],
  R: [[[0, 0], [0, 1], [0.38, 1], [0.53, 0.94], [0.6, 0.79], [0.53, 0.63], [0.38, 0.56], [0, 0.56]], [[0.3, 0.56], [0.6, 0]]],
  T: [[[0, 1], [0.6, 1]], [[0.3, 1], [0.3, 0]]],
  X: [[[0, 0], [0.6, 1]], [[0, 1], [0.6, 0]]],
  "-": [[[0.1, 0.5], [0.5, 0.5]]],
  1: [[[0.12, 0.78], [0.34, 1], [0.34, 0]], [[0.1, 0], [0.58, 0]]],
  7: [[[0, 1], [0.6, 1], [0.24, 0]]],
  2: [[[0.02, 0.76], [0.08, 0.91], [0.2, 1], [0.4, 1], [0.53, 0.92], [0.6, 0.76], [0.56, 0.6], [0.0, 0.0], [0.6, 0.0]]],
};
const REG_TEXT = "SR-172"; // SR = SkyReady (fictional mark)
const TEXT = { xa0: 3.34, zg0: 1.345, h: 0.215, adv: 0.76, stroke: 0.15 };
const TEXT_LEN = TEXT.h * (TEXT.adv * (REG_TEXT.length - 1) + 0.6);
/** True where the registration is painted. `s` runs along the text in the reading direction, metres. */
function textAt(s, zg) {
  const v = (zg - TEXT.zg0) / TEXT.h;
  if (v < -0.1 || v > 1.1 || s < -0.05 || s > TEXT_LEN + 0.05) return false;
  const k = clamp(Math.floor(s / (TEXT.h * TEXT.adv)), 0, REG_TEXT.length - 1);
  for (let c = Math.max(0, k - 1); c <= Math.min(REG_TEXT.length - 1, k + 1); c++) {
    const gx = s / TEXT.h - c * TEXT.adv;
    for (const stroke of GLYPHS[REG_TEXT[c]]) {
      for (let i = 0; i < stroke.length - 1; i++) {
        if (segDist(gx, v, stroke[i][0], stroke[i][1], stroke[i + 1][0], stroke[i + 1][1]) < TEXT.stroke / 2) return true;
      }
    }
  }
  return false;
}

const FINISH = { paint: 0.36, glass: 0.07, seal: 0.75, matte: 0.9 };
/** Exterior paint of the fuselage at a point of its surface → [r, g, b, roughness, metallic]. */
function paintFuselage(xa, y, zg) {
  // windows first (they cover everything)
  const wd = windowDist(xa, zg);
  if (wd < 0) return [...COL.glass, FINISH.glass, 0];
  if (wd < 0.011) return [...COL.seal, FINISH.seal, 0];
  // engine air inlets on the nose bowl, either side of the spinner
  if (xa < -0.83) {
    const ay = Math.abs(y);
    const e = ((ay - 0.245) / 0.115) ** 2 + ((zg - 1.275) / 0.06) ** 2;
    if (e < 1) return [...COL.inlet, FINISH.matte, 0];
    const e2 = (y / 0.1) ** 2 + ((zg - 0.955) / 0.035) ** 2; // carburettor air intake under the spinner
    if (e2 < 1 && xa < -0.85) return [...COL.inlet, FINISH.matte, 0];
  }
  let col = COL.white;
  const st = stripeAt(xa, zg);
  if (st === 1) col = COL.navy;
  else if (st === 2) col = COL.sky;
  // registration on both sides, reading left to right for someone looking at that side
  if (xa > TEXT.xa0 - 0.1 && xa < TEXT.xa0 + TEXT_LEN + 0.1 && Math.abs(y) > 0.05) {
    const s = y > 0 ? xa - TEXT.xa0 : TEXT.xa0 + TEXT_LEN - xa;
    if (textAt(s, zg)) col = COL.navy;
  }
  // thin panel lines: doors, cowling joint, baggage door (left side only)
  if (col === COL.white) {
    let ld = Math.abs(xa - 0.0);
    if (zg < SILL + 0.02 && zg > 0.86) ld = Math.min(ld, segDist(xa, zg, 0.385, 1.5, 0.36, 0.86), segDist(xa, zg, 1.66, 0.86, 1.66, 1.5));
    if (xa > 0.36 && xa < 1.66) ld = Math.min(ld, Math.abs(zg - 0.86) + (Math.abs(y) < 0.3 ? 1 : 0));
    if (y > 0.1) {
      ld = Math.min(ld, segDist(xa, zg, 2.42, 0.99, 2.86, 0.99), segDist(xa, zg, 2.42, 1.42, 2.86, 1.42), segDist(xa, zg, 2.42, 0.99, 2.42, 1.42), segDist(xa, zg, 2.86, 0.99, 2.86, 1.42));
    }
    if (ld < 0.0035) col = COL.line;
  }
  return [...col, FINISH.paint, 0];
}

const INT_COL = { trim: [148, 150, 148], head: [196, 197, 192], panel: [112, 124, 138], arm: [66, 72, 80], floor: [58, 60, 64], rubber: [20, 20, 22] };
/**
 * Inside of the cabin → [r, g, b, alpha]. The alpha channel is a DISTANCE to the edge of the nearest window
 * (128 = exactly on the edge, less = inside the opening): the material cuts everything below one half away,
 * and because distances blend smoothly between pixels the window edges stay crisp even right next to the eye.
 */
function paintCabin(xa, y, zg) {
  const wd = windowDist(xa, zg, 0.555);
  const alpha = clamp(0.5 + wd / 0.08, 0, 1) * 255;
  if (wd < 0.009) return [...INT_COL.rubber, alpha];
  if (zg > 1.985 && xa > 0.5 && xa < 2.5) return [...INT_COL.head, alpha];
  if (zg < 0.75) return [...INT_COL.floor, alpha];
  if (zg < SILL - 0.03) return [...(zg > 1.2 && zg < 1.27 ? INT_COL.arm : INT_COL.panel), alpha];
  return [...INT_COL.trim, alpha];
}
function paintWing(xa, ay) {
  if (ay > 5.12) return [...COL.navy, FINISH.paint, 0];
  if (ay > 5.0 && ay < 5.06) return [...COL.sky, FINISH.paint, 0];
  return [...COL.white, FINISH.paint, 0];
}
function paintStab(xa, ay) {
  if (ay > 1.56) return [...COL.navy, FINISH.paint, 0];
  if (ay > 1.475 && ay < 1.515) return [...COL.sky, FINISH.paint, 0];
  return [...COL.white, FINISH.paint, 0];
}
function paintFin(xa, zg) {
  const st = stripeAt(xa, zg);
  return [...(st === 1 ? COL.navy : st === 2 ? COL.sky : COL.white), FINISH.paint, 0];
}

/** Position on a lofted body for texture coordinates (s along, t around), exactly as the triangles interpolate it. */
function loftPoint(L, s, t) {
  const u = L.u;
  let i = 0;
  let lo = 0;
  let hi = u.length - 1;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (u[m] <= s) lo = m;
    else hi = m;
  }
  i = lo;
  const fu = clamp((s - u[i]) / (u[i + 1] - u[i]), 0, 1);
  const nseg = L.nj - 1;
  let tj = (((t % 1) + 1) % 1) * nseg;
  let j = Math.floor(tj);
  if (j >= nseg) j = nseg - 1;
  const fv = tj - j;
  const a = L.P[i][j];
  const b = L.P[i + 1][j];
  const c = L.P[i][j + 1];
  const d = L.P[i + 1][j + 1];
  const x = (a[0] * (1 - fu) + b[0] * fu) * (1 - fv) + (c[0] * (1 - fu) + d[0] * fu) * fv;
  const y = (a[1] * (1 - fu) + b[1] * fu) * (1 - fv) + (c[1] * (1 - fu) + d[1] * fu) * fv;
  const z = (a[2] * (1 - fu) + b[2] * fu) * (1 - fv) + (c[2] * (1 - fu) + d[2] * fu) * fv;
  return [CG_XA - x, y, z + CG_ZG]; // back to station numbers
}

const SS = 3; // supersampling (anti-aliasing) per axis, used only where a texel straddles an edge
function paintRegion(img, reg, channels, sample) {
  const W = img.w;
  const same = (a, b) => {
    for (let c = 0; c < channels; c++) if (a[c] !== b[c]) return false;
    return true;
  };
  for (let py = reg.y - 6; py < reg.y + reg.h + 6; py++) {
    if (py < 0 || py >= img.h) continue;
    for (let px = reg.x - 6; px < reg.x + reg.w + 6; px++) {
      if (px < 0 || px >= W) continue;
      const at = (ox, oy) => sample((px + ox - reg.x) / reg.w, (py + oy - reg.y) / reg.h);
      const c0 = at(0.5, 0.5);
      const o = (py * W + px) * channels;
      if (same(c0, at(0.04, 0.04)) && same(c0, at(0.96, 0.04)) && same(c0, at(0.04, 0.96)) && same(c0, at(0.96, 0.96))) {
        for (let c = 0; c < channels; c++) img.data[o + c] = c0[c];
        continue;
      }
      const acc = new Array(channels).fill(0);
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const v = at((sx + 0.5) / SS, (sy + 0.5) / SS);
          for (let c = 0; c < channels; c++) acc[c] += v[c];
        }
      }
      for (let c = 0; c < channels; c++) img.data[o + c] = acc[c] / (SS * SS);
    }
  }
}

function buildTextures() {
  // working image: r g b roughness metallic (floats)
  const img = { w: ATLAS_W, h: ATLAS_H, data: new Float32Array(ATLAS_W * ATLAS_H * 5) };
  for (let i = 0; i < ATLAS_W * ATLAS_H; i++) {
    img.data[i * 5] = COL.white[0];
    img.data[i * 5 + 1] = COL.white[1];
    img.data[i * 5 + 2] = COL.white[2];
    img.data[i * 5 + 3] = FINISH.paint;
    img.data[i * 5 + 4] = 0;
  }
  paintRegion(img, REG.F, 5, (s, t) => {
    const p = loftPoint(fusLoft, clamp(s, 0, 1), t);
    return paintFuselage(p[0], p[1], p[2]);
  });
  paintRegion(img, REG.W, 5, (s, t) => paintWing(lerp(W_MAP.xa0, W_MAP.xa1, t), lerp(W_MAP.y0, W_MAP.y1, s)));
  paintRegion(img, REG.V, 5, (s, t) => paintFin(lerp(V_MAP.xa0, V_MAP.xa1, s), lerp(V_MAP.zg0, V_MAP.zg1, 1 - t)));
  paintRegion(img, REG.H, 5, (s, t) => paintStab(lerp(H_MAP.xa0, H_MAP.xa1, t), lerp(H_MAP.y0, H_MAP.y1, s)));
  for (const name of swatchNames) {
    const r = swatchRect(name);
    const sw = SWATCHES[name];
    for (let y = r.y; y < r.y + r.h; y++) {
      for (let x = r.x; x < r.x + r.w; x++) {
        const o = (y * ATLAS_W + x) * 5;
        img.data[o] = sw.c[0];
        img.data[o + 1] = sw.c[1];
        img.data[o + 2] = sw.c[2];
        img.data[o + 3] = sw.r;
        img.data[o + 4] = sw.m;
      }
    }
  }
  const base = new Uint8Array(ATLAS_W * ATLAS_H * 3);
  for (let i = 0; i < ATLAS_W * ATLAS_H; i++) {
    base[i * 3] = Math.round(img.data[i * 5]);
    base[i * 3 + 1] = Math.round(img.data[i * 5 + 1]);
    base[i * 3 + 2] = Math.round(img.data[i * 5 + 2]);
  }
  // roughness (G) + metallic (B) at half size; R = 255 (no baked occlusion)
  const mw = ATLAS_W / 2;
  const mh = ATLAS_H / 2;
  const mr = new Uint8Array(mw * mh * 3);
  for (let y = 0; y < mh; y++) {
    for (let x = 0; x < mw; x++) {
      let r = 0;
      let m = 0;
      for (let dy = 0; dy < 2; dy++) {
        for (let dx = 0; dx < 2; dx++) {
          const o = ((y * 2 + dy) * ATLAS_W + x * 2 + dx) * 5;
          r += img.data[o + 3];
          m += img.data[o + 4];
        }
      }
      mr[(y * mw + x) * 3] = 255;
      mr[(y * mw + x) * 3 + 1] = Math.round((r / 4) * 255);
      mr[(y * mw + x) * 3 + 2] = Math.round((m / 4) * 255);
    }
  }
  // cabin interior: 1024 × 512, the unwrapped cabin in the top 448 rows, plain colours below
  const iw = 1024;
  const ih = 512;
  const interior = { w: iw, h: ih, data: new Float32Array(iw * ih * 4) };
  paintRegion(interior, INT_REG, 4, (s, t) => {
    const p = loftPoint(cabLoft, clamp(s, 0, 1), t);
    return paintCabin(p[0], p[1], p[2]);
  });
  for (const [name, c] of Object.entries(INT_SWATCH)) {
    const r = intSwatchRect(name);
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) interior.data.set([c[0], c[1], c[2], 255], (y * iw + x) * 4);
  }
  const int8 = new Uint8Array(iw * ih * 4);
  for (let i = 0; i < int8.length; i++) int8[i] = Math.round(interior.data[i]);
  return { base: encodePng(ATLAS_W, ATLAS_H, base, 3), mr: encodePng(mw, mh, mr, 3), interior: encodePng(iw, ih, int8, 4) };
}
const INT_W = 1024;
const INT_H = 512;
const INT_REG = { x: 0, y: 0, w: 1024, h: 448 };
const INT_SWATCH = { glare: [26, 27, 30], panel: [44, 46, 50], wall: [120, 123, 126], floor: INT_COL.floor, trim: INT_COL.trim };
const intSwatchNames = Object.keys(INT_SWATCH);
const intSwatchRect = (name) => ({ x: 8 + intSwatchNames.indexOf(name) * 48, y: 464, w: 40, h: 40 });
const uvInt = (name) => {
  const r = intSwatchRect(name);
  return [(r.x + r.w / 2) / INT_W + KIND.interior, (r.y + r.h / 2) / INT_H];
};

// ---------------------------------------------------------------------- PNG writer
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function encodePng(w, h, pixels, channels) {
  const stride = w * channels;
  const raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) {
    // filter 1 (Sub): store the difference from the pixel to the left — flat paint compresses to almost nothing
    raw[y * (stride + 1)] = 1;
    for (let x = 0; x < stride; x++) {
      const cur = pixels[y * stride + x];
      const left = x >= channels ? pixels[y * stride + x - channels] : 0;
      raw[y * (stride + 1) + 1 + x] = (cur - left) & 0xff;
    }
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = channels === 4 ? 6 : 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}

// ====================================================================== parts

const parts = []; // { name, mesh, material, frame?, extras?, parent? }
const empties = []; // { name, at: [x,y,z] frame A, extras }
function part(name, mesh, opts = {}) {
  parts.push({ name, mesh, material: opts.material ?? "livery", frame: opts.frame ?? null, parent: opts.parent ?? "airframe", extras: opts.extras });
}
const sw = (name) => {
  const uv = uvSwatch(name);
  return () => uv;
};
const swK = (name, kind) => {
  const uv = uvSwatch(name);
  const k = [uv[0] + kind, uv[1]];
  return () => k;
};

// ---------------------------------------------------------------------- fuselage (three pieces of one smooth surface)
{
  const g = Mesh.gridData(fusLoft.P, { closed: true, outward: (p) => [0, p[1], p[2] - (1.3 - CG_ZG)] });
  const nseg = fusLoft.nj - 1;
  const uv = (i, j) => uvRegion(REG.F, fusLoft.u[i], j / nseg);
  const iWs = fusXs.indexOf(+WS_BASE.toFixed(4));
  const iCab = fusXs.indexOf(+CABIN_END.toFixed(4));
  if (iWs < 0 || iCab < 0) throw new Error("fuselage split stations missing");
  const nose = new Mesh().addGrid(g, uv, 0, iWs);
  nose.fan(fusLoft.P[0].slice(0, nseg), [1, 0, 0], () => uvSwatch("dark"));
  // closed at the back too: from the pilot's seat you look over the glare shield at the rear edge of the cowling
  nose.fan(fusLoft.P[iWs].slice(0, nseg), [-1, 0, 0], () => uvSwatch("dark"));
  const cabin = new Mesh().addGrid(g, uv, iWs, iCab);
  const tail = new Mesh().addGrid(g, uv, iCab, fusXs.length - 1);
  tail.fan(fusLoft.P[fusXs.length - 1].slice(0, nseg), [-1, 0, 0], () => uvSwatch("white"));
  part("fuselage_nose", nose);
  part("fuselage_cabin", cabin, { parent: "cabin_exterior" });
  part("fuselage_tail", tail);
}

// ---------------------------------------------------------------------- wing sections (NACA 4-digit, public-domain formula)
function naca4(m, p, t, n) {
  const upper = [];
  const lower = [];
  for (let i = 0; i <= n; i++) {
    const x = 0.5 * (1 - Math.cos((Math.PI * i) / n));
    const yt = 5 * t * (0.2969 * Math.sqrt(x) - 0.126 * x - 0.3516 * x * x + 0.2843 * x ** 3 - 0.1036 * x ** 4);
    let yc = 0;
    let dy = 0;
    if (m > 0) {
      if (x < p) {
        yc = (m / (p * p)) * (2 * p * x - x * x);
        dy = ((2 * m) / (p * p)) * (p - x);
      } else {
        yc = (m / ((1 - p) * (1 - p))) * (1 - 2 * p + 2 * p * x - x * x);
        dy = ((2 * m) / ((1 - p) * (1 - p))) * (p - x);
      }
    }
    const th = Math.atan(dy);
    upper.push([x - yt * Math.sin(th), yc + yt * Math.cos(th)]);
    lower.push([x + yt * Math.sin(th), yc - yt * Math.cos(th)]);
  }
  return { upper, lower };
}
/** Height of a section's upper / lower surface at chord fraction x (linear lookup). */
function surfaceAt(points, x) {
  for (let i = 0; i < points.length - 1; i++) {
    if (x <= points[i + 1][0]) {
      const f = (x - points[i][0]) / (points[i + 1][0] - points[i][0] || 1);
      return lerp(points[i][1], points[i + 1][1], clamp(f, 0, 1));
    }
  }
  return points[points.length - 1][1];
}
const WING_FOIL = naca4(0.02, 0.4, 0.12, 16);
const TAIL_FOIL = naca4(0, 0.4, 0.09, 10);

const wingAt = (y) => {
  const o = clamp((y - WING.breakY) / (WING.tipY - WING.breakY), 0, 1);
  return {
    chord: lerp(WING.rootChord, WING.tipChord, o),
    le: WING.leXa + WING.leSweep * o,
    zq: WING.zq + Math.tan(WING.dihedralDeg * D2R) * y,
    twist: lerp(WING.twistRoot, WING.twistTip, clamp(y / WING.tipY, 0, 1)) * D2R,
  };
};
/** A point of the wing: chord fraction xc, height yc (fraction of chord) at span station y → frame A. */
function wingPoint(y, xc, yc, scale = 1, chordScale = 1, leShift = 0) {
  const w = wingAt(y);
  const c = w.chord * chordScale;
  const dx = (xc - 0.25) * c;
  const dz = yc * c * scale;
  const aft = dx * Math.cos(w.twist) + dz * Math.sin(w.twist);
  const up = dz * Math.cos(w.twist) - dx * Math.sin(w.twist);
  return A(w.le + leShift + 0.25 * w.chord + aft, y, w.zq + up);
}
const wingUv = (i, j, p) => uvWing(CG_XA - p[0], p[1]);

/** Closed loop of a wing section from xc0 to xc1: upper surface going forward, then lower surface going aft. */
function sectionLoop(foil, xc0, xc1) {
  const up = foil.upper.filter((p) => p[0] > xc0 + 1e-6 && p[0] < xc1 - 1e-6);
  const lo = foil.lower.filter((p) => p[0] > xc0 + 1e-6 && p[0] < xc1 - 1e-6);
  const loop = [];
  loop.push([xc1, surfaceAt(foil.upper, xc1)]);
  for (let i = up.length - 1; i >= 0; i--) loop.push(up[i]);
  if (xc0 <= 0) loop.push([0, 0]);
  else loop.push([xc0, surfaceAt(foil.upper, xc0)], [xc0, surfaceAt(foil.lower, xc0)]);
  for (const p of lo) loop.push(p);
  loop.push([xc1, surfaceAt(foil.lower, xc1)]);
  return loop;
}

/** Flat face closing the part of a full section that lies behind chord fraction `from` (the step beside a flap or aileron bay). */
function aftCap(m, foil, pointFn, y, from, normal, uvFn) {
  const up = foil.upper.filter((p) => p[0] > from + 1e-6 && p[0] < 1 - 1e-6);
  const lo = foil.lower.filter((p) => p[0] > from + 1e-6 && p[0] < 1 - 1e-6);
  const loop = [[from, surfaceAt(foil.upper, from)], ...up, [1, 0], ...lo.reverse(), [from, surfaceAt(foil.lower, from)]];
  m.fan(loop.map(([xc, yc]) => pointFn(y, xc, yc)), normal, uvFn);
}
/**
 * One piece of wing between two span stations, cut off at chord fraction `cut` (1 = full section).
 * capStart / capEnd: chord fraction from which the end face is closed (the step beside a control-surface bay), or null.
 */
function wingPiece(y0, y1, cut, capStart = null, capEnd = null) {
  const m = new Mesh();
  const loop = sectionLoop(WING_FOIL, 0, cut);
  const rows = [y0, y1].map((y) => loop.map(([xc, yc]) => wingPoint(y, xc, yc)));
  const centre = (p) => {
    const w = wingAt(Math.abs(p[1]));
    return vsub(p, A(w.le + 0.4 * w.chord, p[1], w.zq));
  };
  // skin: columns run round the section; keep the sharp trailing edge / cut corners by not closing the tube
  m.grid([rows[0], rows[1]], wingUv, { closed: false, outward: centre });
  if (cut < 0.999) {
    // rear wall of the flap / aileron bay
    const n = loop.length - 1;
    m.grid([[rows[0][0], rows[0][n]], [rows[1][0], rows[1][n]]], wingUv, { closed: false, outward: () => [-1, 0, 0] });
  }
  const capUv = (p) => uvWing(CG_XA - p[0], p[1]);
  if (capStart !== null) aftCap(m, WING_FOIL, wingPoint, y0, capStart, [0, -1, 0], capUv);
  if (capEnd !== null) aftCap(m, WING_FOIL, wingPoint, y1, capEnd, [0, 1, 0], capUv);
  return m;
}
/** Rounded wing tip. */
function wingTip() {
  const m = new Mesh();
  const loop = sectionLoop(WING_FOIL, 0, 1);
  const P = [];
  const steps = 6;
  for (let k = 0; k <= steps; k++) {
    const a = (k / steps) * (Math.PI / 2);
    const y = WING.tipY + (WING.capY - WING.tipY) * Math.sin(a);
    const thick = Math.max(0.04, Math.cos(a) ** 0.9);
    const chordScale = 1 - 0.3 * (1 - Math.cos(a));
    const w = wingAt(WING.tipY);
    P.push(loop.map(([xc, yc]) => wingPoint(y, xc, yc, thick, chordScale, 0.12 * w.chord * (1 - Math.cos(a)))));
  }
  const centre = (p) => {
    const w = wingAt(WING.tipY);
    return vsub(p, A(w.le + 0.45 * w.chord, WING.tipY - 0.3, w.zq));
  };
  m.grid(P, wingUv, { closed: false, outward: centre });
  m.fan(P[steps], [0, 1, 0], (p) => uvWing(CG_XA - p[0], p[1]));
  return m;
}

/**
 * A flap / aileron / elevator half: the rear part of a section from chord fraction `hinge` to the trailing edge,
 * with a rounded nose, lofted between two span stations.  pointFn(y, xc, yc) places a section point.
 */
function controlSurface(foil, y0, y1, hingeFn, pointFn, uvFn, gap = 0.012) {
  const m = new Mesh();
  const rows = [y0, y1].map((y) => {
    const h = hingeFn(y) + gap;
    const zu = surfaceAt(foil.upper, h + 0.03);
    const zl = surfaceAt(foil.lower, h + 0.03);
    const mid = (zu + zl) / 2;
    const half = (zu - zl) / 2;
    const noseLen = half * 0.9;
    const up = foil.upper.filter((p) => p[0] > h + noseLen + 0.01 && p[0] < 0.999);
    const lo = foil.lower.filter((p) => p[0] > h + noseLen + 0.01 && p[0] < 0.999);
    const loop = [[1, 0.0]];
    for (let i = up.length - 1; i >= 0; i--) loop.push(up[i]);
    for (let k = 0; k <= 6; k++) {
      const a = (Math.PI / 2) * (1 + (2 * k) / 6); // rounded nose: 90° (top) → 180° (front) → 270° (bottom)
      loop.push([h + noseLen * (1 + Math.cos(a)), mid + half * Math.sin(a)]);
    }
    for (const p of lo) loop.push(p);
    loop.push([1, 0.0]);
    return loop.map(([xc, yc]) => pointFn(y, xc, yc));
  });
  const mean = (row) => vscale(row.reduce((s, p) => vadd(s, p), [0, 0, 0]), 1 / row.length);
  const c0 = mean(rows[0]);
  const c1 = mean(rows[1]);
  const axis = vnorm(vsub(c1, c0));
  const outward = (p) => {
    const d = vsub(p, c0);
    return vsub(d, vscale(axis, vdot(d, axis)));
  };
  m.grid(rows, uvFn, { closed: false, outward });
  m.fan(rows[0], vscale(axis, -1), (p) => uvFn(0, 0, p));
  m.fan(rows[1], axis, (p) => uvFn(0, 0, p));
  return m;
}

/** Frame for a hinged part: origin o (frame A), hinge axis along local +X, local +Z as close to "up" as possible. */
function hingeFrame(o, axis, upHint = [0, 0, 1]) {
  const ex = vnorm(axis);
  const ez = vnorm(vsub(upHint, vscale(ex, vdot(upHint, ex))));
  const ey = vcross(ez, ex);
  return { o, ex, ey, ez };
}

// main wing panels + tips
{
  const left = new Mesh();
  const fc = WING.flapHinge - 0.012;
  const ac = WING.ailHinge - 0.012;
  left.add(wingPiece(WING.rootY, WING.flapY0, 1, null, fc));
  left.add(wingPiece(WING.flapY0, WING.flapY1, fc));
  left.add(wingPiece(WING.flapY1, WING.ailY0, 1, fc, ac));
  left.add(wingPiece(WING.ailY0, WING.breakY, ac));
  left.add(wingPiece(WING.breakY, WING.ailY1, ac));
  left.add(wingPiece(WING.ailY1, WING.tipY, 1, ac, null));
  left.add(wingTip());
  part("wing_left", left);
  part("wing_right", left.mirrored());

  // flaps: the pivot sits below the wing, so lowering the flap also moves it aft (like the real slotted flap)
  const flapPt = (y, xc, yc) => wingPoint(y, xc, yc);
  const flap = controlSurface(WING_FOIL, WING.flapY0 + 0.01, WING.flapY1 - 0.01, () => WING.flapHinge, flapPt, wingUv);
  const fp0 = vadd(wingPoint(WING.flapY0, WING.flapHinge + 0.03, -0.075), [0, 0, 0]);
  const fp1 = wingPoint(WING.flapY1, WING.flapHinge + 0.03, -0.075);
  part("flap_left", flap, { frame: hingeFrame(fp0, vsub(fp1, fp0)), extras: { hinge: "local +X", positive: "trailing edge UP; apply −flapsDeg" } });
  const m0 = [fp0[0], -fp0[1], fp0[2]];
  const m1 = [fp1[0], -fp1[1], fp1[2]];
  part("flap_right", flap.mirrored(), { frame: hingeFrame(m1, vsub(m0, m1)), extras: { hinge: "local +X", positive: "trailing edge UP; apply −flapsDeg" } });

  // ailerons: hinge at the rounded nose
  const ailA = controlSurface(WING_FOIL, WING.ailY0 + 0.01, WING.breakY, () => WING.ailHinge, flapPt, wingUv);
  const ailB = controlSurface(WING_FOIL, WING.breakY, WING.ailY1 - 0.01, () => WING.ailHinge, flapPt, wingUv);
  const ail = new Mesh().add(ailA).add(ailB);
  const hz = (surfaceAt(WING_FOIL.upper, WING.ailHinge + 0.03) + surfaceAt(WING_FOIL.lower, WING.ailHinge + 0.03)) / 2;
  const ap0 = wingPoint(WING.ailY0, WING.ailHinge + 0.035, hz);
  const ap1 = wingPoint(WING.ailY1, WING.ailHinge + 0.035, hz);
  part("aileron_left", ail, { frame: hingeFrame(ap0, vsub(ap1, ap0)), extras: { hinge: "local +X", positive: "trailing edge UP; apply −aileronLeftDeg" } });
  const n0 = [ap0[0], -ap0[1], ap0[2]];
  const n1 = [ap1[0], -ap1[1], ap1[2]];
  part("aileron_right", ail.mirrored(), { frame: hingeFrame(n1, vsub(n0, n1)), extras: { hinge: "local +X", positive: "trailing edge UP; apply −aileronRightDeg" } });
}

// ---------------------------------------------------------------------- wing struts
const STRUT = { lower: [0.92, 0.47, 0.8], upper: [1.06, 2.5, 0] };
{
  const wu = wingAt(STRUT.upper[1]);
  const top = A(STRUT.upper[0], STRUT.upper[1], wu.zq + surfaceAt(WING_FOIL.lower, 0.27) * wu.chord + 0.02);
  const bot = A(...STRUT.lower);
  STRUT.topA = top;
  STRUT.botA = bot;
  const axis = vnorm(vsub(top, bot));
  const chordDir = vnorm(vsub([-1, 0, 0], vscale(axis, vdot([-1, 0, 0], axis)))); // streamwise, pointing aft
  const thick = vcross(axis, chordDir);
  const foil = naca4(0, 0.4, 0.34, 8);
  const loop = sectionLoop(foil, 0, 1);
  const chord = 0.115;
  const rows = [bot, top].map((c) => loop.map(([xc, yc]) => vadd(c, vadd(vscale(chordDir, (xc - 0.35) * chord), vscale(thick, yc * chord)))));
  const m = new Mesh();
  const mid = vlerp(bot, top, 0.5);
  m.grid(rows, sw("white"), { closed: false, outward: (p) => vsub(p, vadd(mid, vscale(axis, vdot(vsub(p, mid), axis)))) });
  part("strut_left", m);
  part("strut_right", m.mirrored());
}

// ---------------------------------------------------------------------- tailplane + elevator
{
  const stabAt = (y) => {
    const f = clamp(y / HSTAB.halfSpan, 0, 1);
    return { le: lerp(HSTAB.rootLe, HSTAB.tipLe, f), chord: lerp(HSTAB.rootChord, HSTAB.tipChord, f) };
  };
  const stabPoint = (y, xc, yc, thick = 1) => {
    const s = stabAt(Math.min(y, HSTAB.halfSpan));
    return A(s.le + xc * s.chord, y, HSTAB.zg + yc * s.chord * thick);
  };
  const hingeFrac = (y) => {
    const s = stabAt(y);
    return (HSTAB.hingeXa - s.le) / s.chord;
  };
  const stabUv = (i, j, p) => uvStab(CG_XA - p[0], p[1]);
  const left = new Mesh();
  const centre = (p) => [p[0] - (CG_XA - 5.8), 0, p[2] - (HSTAB.zg - CG_ZG)];
  // fixed part: full section inside the elevator cut-out, cut at the hinge elsewhere
  const capUv = (p) => uvStab(CG_XA - p[0], p[1]);
  const piece = (y0, y1, full) => {
    const rows = [y0, y1].map((y) => sectionLoop(TAIL_FOIL, 0, full ? 1 : hingeFrac(y) - 0.01).map(([xc, yc]) => stabPoint(y, xc, yc)));
    const m = new Mesh();
    m.grid(rows, stabUv, { closed: false, outward: centre });
    if (!full) m.grid([[rows[0][0], rows[0][rows[0].length - 1]], [rows[1][0], rows[1][rows[1].length - 1]]], stabUv, { closed: false, outward: () => [-1, 0, 0] });
    // the centre piece is full section: close the step beside the elevator
    if (full) aftCap(m, TAIL_FOIL, stabPoint, y1, hingeFrac(y1) - 0.01, [0, 1, 0], capUv);
    return m;
  };
  left.add(piece(0, HSTAB.elevY0, true));
  left.add(piece(HSTAB.elevY0, HSTAB.halfSpan - 0.03, false));
  // rounded tip
  {
    const loop = sectionLoop(TAIL_FOIL, 0, 1);
    const P = [];
    for (let k = 0; k <= 4; k++) {
      const a = (k / 4) * (Math.PI / 2);
      const y = HSTAB.halfSpan - 0.03 + 0.03 * Math.sin(a) + (k === 0 ? 0 : 0);
      P.push(loop.map(([xc, yc]) => stabPoint(y, 0.5 + (xc - 0.5) * (1 - 0.12 * (1 - Math.cos(a))), yc, Math.max(0.05, Math.cos(a)))));
    }
    // only the part ahead of the hinge belongs to the fixed tip; keep it simple: full-chord tip cap just outboard of the elevator
    const m = new Mesh();
    m.grid(P, stabUv, { closed: false, outward: centre });
    m.fan(P[4], [0, 1, 0], capUv);
    aftCap(m, TAIL_FOIL, stabPoint, HSTAB.halfSpan - 0.03, hingeFrac(HSTAB.halfSpan - 0.03) - 0.01, [0, -1, 0], capUv);
    left.add(m);
  }
  part("stabilizer", new Mesh().add(left).add(left.mirrored()));
  const elevL = controlSurface(TAIL_FOIL, HSTAB.elevY0 + 0.01, HSTAB.halfSpan - 0.04, hingeFrac, (y, xc, yc) => stabPoint(y, xc, yc), stabUv, 0.008);
  const elev = new Mesh().add(elevL).add(elevL.mirrored());
  // the two halves are joined by a torque tube through the tail cone
  elev.tube([A(HSTAB.hingeXa + 0.02, -HSTAB.elevY0 - 0.02, HSTAB.zg), A(HSTAB.hingeXa + 0.02, HSTAB.elevY0 + 0.02, HSTAB.zg)], [0.018, 0.018], sw("white"), { segs: 8, caps: false });
  part("elevator", elev, { frame: hingeFrame(A(HSTAB.hingeXa + 0.02, 0, HSTAB.zg), [0, 1, 0]), extras: { hinge: "local +X", positive: "trailing edge UP; apply +elevatorDeg" } });
}

// ---------------------------------------------------------------------- fin + rudder
{
  const leAt = linear(FIN.le);
  const lineAt = (l, zg) => lerp(l[0][0], l[1][0], (zg - l[0][1]) / (l[1][1] - l[0][1]));
  const hingeAt = (zg) => lineAt(FIN.hinge, zg);
  const teAt = (zg) => lineAt(FIN.te, zg);
  const halfT = (zg) => lerp(0.036, 0.02, clamp((zg - 1.6) / 1.3, 0, 1));
  const shape = (s) => 0.2969 * Math.sqrt(s) - 0.126 * s - 0.3516 * s * s + 0.2843 * s ** 3 - 0.1036 * s ** 4; // thickness distribution of a NACA 00xx section
  const tk = (s) => clamp(shape(clamp(s, 0, 1)) / shape(0.3), 0, 1.02);
  const finUv = (i, j, p) => uvFin(CG_XA - p[0], p[2] + CG_ZG);
  const centre = (p) => [0, p[1], 0];

  // fixed fin: from the leading edge to the hinge line
  const zs = [1.56, 1.66, 1.7, 1.75, 1.8, 1.84, 1.88, 2.0, 2.2, 2.45, 2.7, 2.84];
  const NS = 9;
  const finRow = (zg, squash = 1, pull = 0) => {
    const le = leAt(zg) + pull;
    const te = teAt(zg);
    const h = hingeAt(zg) - 0.012;
    const row = [];
    const sMax = (h - le) / (te - le);
    for (let k = 0; k <= NS; k++) {
      const s = sMax * (1 - 0.5 * (1 - Math.cos((Math.PI * k) / NS))); // from the hinge forward to the leading edge
      row.push(A(le + s * (te - le), halfT(zg) * tk(s) * squash, zg));
    }
    for (let k = NS - 1; k >= 0; k--) {
      const s = sMax * (1 - 0.5 * (1 - Math.cos((Math.PI * k) / NS)));
      row.push(A(le + s * (te - le), -halfT(zg) * tk(s) * squash, zg));
    }
    return row;
  };
  const P = zs.map((z) => finRow(z));
  // rounded top
  for (let k = 1; k <= 4; k++) {
    const a = (k / 4) * (Math.PI / 2);
    P.push(finRow(2.84 + 0.06 * Math.sin(a), Math.max(0.06, Math.cos(a)), 0.1 * (1 - Math.cos(a))));
  }
  const fin = new Mesh();
  fin.grid(P, finUv, { closed: false, outward: centre });
  // close the rear (hinge) face
  fin.grid(P.map((r) => [r[0], r[r.length - 1]]), finUv, { closed: false, outward: () => [-1, 0, 0] });
  fin.fan(P[P.length - 1], [0, 0, 1], (p) => uvFin(CG_XA - p[0], p[2] + CG_ZG));
  part("fin", fin);

  // rudder
  const rz = [1.525, 1.6, 1.9, 2.2, 2.5, 2.75, 2.84]; // the bottom of the rudder clears the tail-light stinger
  const NR = 6;
  const rudRow = (zg, squash = 1) => {
    const le = leAt(Math.max(zg, 1.9));
    const te = teAt(zg);
    const h = hingeAt(zg);
    const half = halfT(Math.max(zg, 1.6)) * tk((hingeAt(Math.max(zg, 1.9)) - le) / (teAt(Math.max(zg, 1.9)) - le)) * squash;
    const row = [];
    row.push(A(te, 0, zg));
    for (let k = NR - 1; k >= 0; k--) row.push(A(h + ((te - h) * k) / NR, half * (1 - k / NR) + 0.0015, zg));
    for (let k = 1; k <= 5; k++) {
      const a = (k / 6) * Math.PI;
      row.push(A(h - half * 0.9 * Math.sin(a), half * Math.cos(a), zg));
    }
    for (let k = 0; k < NR; k++) row.push(A(h + ((te - h) * k) / NR, -half * (1 - k / NR) - 0.0015, zg));
    row.push(A(te, 0, zg));
    return row;
  };
  const R = rz.map((z) => rudRow(z));
  for (let k = 1; k <= 4; k++) {
    const a = (k / 4) * (Math.PI / 2);
    R.push(rudRow(2.84 + 0.06 * Math.sin(a), Math.max(0.06, Math.cos(a))));
  }
  const rud = new Mesh();
  rud.grid(R, finUv, { closed: false, outward: centre });
  rud.fan(R[0], [0, 0, -1], (p) => uvFin(CG_XA - p[0], p[2] + CG_ZG));
  rud.fan(R[R.length - 1], [0, 0, 1], (p) => uvFin(CG_XA - p[0], p[2] + CG_ZG));
  const h0 = A(FIN.hinge[0][0], 0, FIN.hinge[0][1]);
  const h1 = A(FIN.hinge[1][0], 0, FIN.hinge[1][1]);
  part("rudder", rud, { frame: hingeFrame(h0, vsub(h1, h0), [-1, 0, 0]), extras: { hinge: "local +X (points up the hinge line)", positive: "trailing edge to the RIGHT; apply +rudderDeg" } });
}

// ---------------------------------------------------------------------- wheels and landing gear
function wheel(centre, radius, width, rimR) {
  const m = new Mesh();
  const hh = (radius - rimR) / 2;
  const rc = rimR + hh;
  const prof = [];
  const n = 12;
  for (let k = 0; k <= n; k++) {
    const a = Math.PI * (-0.5 + k / n); // −90° … +90° across the tread
    prof.push([Math.sign(Math.sin(a)) * (width / 2) * Math.abs(Math.sin(a)) ** 0.75, rc + hh * Math.abs(Math.cos(a)) ** 0.75]);
  }
  const tyre = [[-width * 0.36, rimR], ...prof, [width * 0.36, rimR]];
  m.lathe(centre, [0, 1, 0], tyre, sw("tyre"), { segs: 22 });
  // rim / hub on both sides
  const hub = [
    [-width * 0.33, 0.0],
    [-width * 0.37, rimR * 0.45],
    [-width * 0.3, rimR * 0.98],
    [-width * 0.36, rimR + 0.004],
  ];
  m.lathe(centre, [0, 1, 0], hub, sw("rim"), { segs: 22 });
  m.lathe(centre, [0, 1, 0], hub.map(([s, r]) => [-s, r]), sw("rim"), { segs: 22 });
  return m;
}
{
  const R = 0.215;
  const mainC = A(MAIN_XA, 1.25, R);
  const gear = new Mesh();
  gear.add(wheel(mainC, R, 0.155, 0.095));
  // tubular spring-steel leg from the fuselage down and out to the axle
  const p0 = A(MAIN_XA - 0.02, 0.4, 0.7);
  const p1 = A(MAIN_XA - 0.01, 0.84, 0.56);
  const p2 = A(MAIN_XA, 1.165, R + 0.012);
  const pathPts = [];
  const radii = [];
  for (let k = 0; k <= 8; k++) {
    const t = k / 8;
    pathPts.push(vadd(vadd(vscale(p0, (1 - t) * (1 - t)), vscale(p1, 2 * t * (1 - t))), vscale(p2, t * t)));
    radii.push(lerp(0.034, 0.024, t));
  }
  gear.tube(pathPts, radii, sw("white"), { segs: 10 });
  gear.tube([A(MAIN_XA, 1.14, R), A(MAIN_XA, 1.25, R)], [0.02, 0.02], sw("steel"), { segs: 8 }); // axle
  gear.lathe(A(MAIN_XA, 1.165, R), [0, 1, 0], [[0, 0.0], [0, 0.075], [0.012, 0.075], [0.012, 0.0]], sw("steel"), { segs: 14 }); // brake disc
  part("gear_main_left", gear);
  part("gear_main_right", gear.mirrored());

  const RN = 0.18;
  const noseC = A(NOSE_XA, 0, NOSE_CONTACT_ZG + RN);
  const ng = new Mesh();
  ng.add(wheel(noseC, RN, 0.115, 0.075));
  const axleZg = NOSE_CONTACT_ZG + RN;
  const top = A(NOSE_XA + 0.085, 0, 0.9);
  const mid = A(NOSE_XA + 0.045, 0, 0.56);
  const forkTop = A(NOSE_XA + 0.02, 0, axleZg + RN + 0.045);
  ng.tube([top, mid], [0.04, 0.04], sw("white"), { segs: 12 }); // oleo cylinder
  ng.tube([mid, forkTop], [0.024, 0.024], sw("chrome"), { segs: 10 }); // piston
  // fork
  for (const side of [-1, 1]) {
    ng.tube([forkTop, A(NOSE_XA + 0.02, side * 0.082, axleZg + RN + 0.02), A(NOSE_XA + 0.005, side * 0.086, axleZg + 0.06), A(NOSE_XA, side * 0.086, axleZg)], [0.02, 0.018, 0.016, 0.016], sw("white"), { segs: 8 });
  }
  ng.tube([A(NOSE_XA, -0.09, axleZg), A(NOSE_XA, 0.09, axleZg)], [0.012, 0.012], sw("steel"), { segs: 8 });
  // torque link (scissor) behind the strut
  ng.tube([A(NOSE_XA + 0.09, 0, 0.58), A(NOSE_XA + 0.15, 0, 0.5), A(NOSE_XA + 0.07, 0, axleZg + RN + 0.06)], [0.011, 0.011, 0.011], sw("steel"), { segs: 6 });
  part("gear_nose", ng);
}

// ---------------------------------------------------------------------- propeller, spinner, blurred disc
{
  const hub = A(PROP_XA, 0, THRUST_ZG);
  const m = new Mesh();
  // spinner (turns with the propeller)
  const L = 0.335;
  const prof = [];
  for (let k = 0; k <= 12; k++) {
    const s = k / 12;
    prof.push([-0.06 + s * L, 0.168 * Math.pow(Math.max(0, 1 - Math.pow(s, 1.75)), 0.62)]);
  }
  m.lathe(hub, [1, 0, 0], [[-0.064, 0.0], [-0.064, 0.168], ...prof], sw("spinner"), { segs: 24 });
  // two blades with twist: coarse pitch near the hub, fine at the tips (geometric pitch about 1.35 m)
  const chordAt = pchip([[0.1, 0.085], [0.2, 0.115], [0.45, 0.152], [0.7, 0.135], [0.88, 0.098], [0.9525, 0.05]]);
  const thickAt = pchip([[0.1, 0.5], [0.2, 0.26], [0.45, 0.12], [0.9525, 0.07]]);
  const blade = (dir) => {
    const foil = naca4(0.02, 0.4, 0.12, 6);
    const loop = sectionLoop(foil, 0, 1);
    const rs = [0.1, 0.15, 0.2, 0.3, 0.42, 0.55, 0.68, 0.8, 0.875];
    const tipRs = [0.875, 0.905, 0.93, 0.945, 0.9525];
    const ring = (r, squash = 1) => {
      const beta = Math.atan(1.35 / (2 * Math.PI * Math.max(r, 0.16)));
      const c = chordAt(r) * squash;
      const t = thickAt(r) / 0.12;
      // blade axis along ±z; it moves toward −y when it points up (clockwise seen from the cockpit)
      const tang = [0, -dir, 0];
      const fwd = [1, 0, 0];
      const chordDir = vadd(vscale(tang, -Math.cos(beta)), vscale(fwd, -Math.sin(beta))); // from leading to trailing edge
      const thickDir = vadd(vscale(fwd, Math.cos(beta)), vscale(tang, -Math.sin(beta)));
      return loop.map(([xc, yc]) => vadd(vadd(hub, [0, 0, dir * r]), vadd(vscale(chordDir, (xc - 0.4) * c), vscale(thickDir, yc * c * t))));
    };
    const b = new Mesh();
    const centre = (p) => [p[0] - hub[0], p[1] - hub[1], 0];
    b.grid(rs.map((r) => ring(r)), sw("prop"), { closed: false, outward: centre });
    const tipRows = tipRs.map((r, k) => ring(r, k === tipRs.length - 1 ? 0.35 : 1));
    b.grid(tipRows, sw("proptip"), { closed: false, outward: centre });
    b.fan(tipRows[tipRows.length - 1], [0, 0, dir], sw("proptip"));
    return b;
  };
  const blades = new Mesh().add(blade(1)).add(blade(-1));
  const frame = hingeFrame(hub, [1, 0, 0]);
  part("propeller", m, { frame, extras: { spin: "local +X (points forward); turn it clockwise seen from the cockpit = positive angle" } });
  part("propeller_blades", blades, { frame, extras: { spin: "local +X; hide above about 700 rpm and show propeller_disc instead" } });
  // blurred disc: U = 2 + radius fraction, V = angle fraction (the simulator's shader draws the blur)
  const disc = new Mesh();
  const rings = [0.17, 0.3, 0.45, 0.6, 0.75, 0.88, 0.9525];
  const segs = 40;
  const DP = rings.map((r) => {
    const row = [];
    for (let j = 0; j <= segs; j++) {
      const a = (j / segs) * Math.PI * 2;
      row.push(vadd(hub, [0, Math.cos(a) * r, Math.sin(a) * r]));
    }
    return row;
  });
  disc.grid(DP, (i, j) => [KIND.propDisc + rings[i] / PROP_RADIUS * 0.999, j / segs], { closed: true, outward: () => [1, 0, 0] });
  part("propeller_disc", disc, { material: "propdisc", frame, extras: { note: "translucent disc that stands in for the blades at high rpm" } });
}

// ---------------------------------------------------------------------- light positions (frame A)
const tipW = wingAt(5.47);
const LIGHTS = {
  beacon: A(6.5, 0, 2.93),
  navLeft: A(tipW.le + 0.2, 5.495, tipW.zq + 0.012),
  navRight: A(tipW.le + 0.2, -5.495, tipW.zq + 0.012),
  strobeLeft: A(tipW.le + 0.4, 5.5, tipW.zq + 0.012),
  strobeRight: A(tipW.le + 0.4, -5.5, tipW.zq + 0.012),
  tail: A(6.165, 0, 1.47),
  landing: A(-0.893, 0.092, 1.03),
  taxi: A(-0.893, -0.092, 1.03),
};
const LIGHT_DOCS = {
  beacon: "red flashing beacon on top of the fin",
  navLeft: "red navigation light, left wing tip",
  navRight: "green navigation light, right wing tip",
  strobeLeft: "white strobe, left wing tip",
  strobeRight: "white strobe, right wing tip",
  tail: "white navigation light at the tail",
  landing: "landing light in the nose cowling (left lamp)",
  taxi: "taxi light in the nose cowling (right lamp)",
};

// ---------------------------------------------------------------------- small details
{
  const m = new Mesh();
  // exhaust pipe under the right side of the cowling
  m.tube([A(-0.3, -0.2, 0.86), A(-0.2, -0.215, 0.76), A(-0.1, -0.22, 0.69)], [0.028, 0.028, 0.028], sw("exhaust"), { segs: 10 });
  // pitot tube under the left wing
  const wy = 2.05;
  const w = wingAt(wy);
  const under = w.zq + surfaceAt(WING_FOIL.lower, 0.12) * w.chord;
  m.tube([A(w.le + 0.2, wy, under + 0.01), A(w.le + 0.2, wy, under - 0.1)], [0.012, 0.009], sw("steel"), { segs: 6 });
  m.tube([A(w.le + 0.21, wy, under - 0.1), A(w.le + 0.02, wy, under - 0.1)], [0.009, 0.007], sw("steel"), { segs: 6 });
  // radio antennas on the roof (thin swept blades)
  for (const [xa, y] of [[1.25, 0.16], [1.75, -0.16]]) {
    const z0 = 2.15;
    const lo = [A(xa, y - 0.006, z0), A(xa + 0.14, y - 0.006, z0), A(xa + 0.14, y + 0.006, z0), A(xa, y + 0.006, z0)];
    const hi = [A(xa + 0.2, y - 0.003, z0 + 0.34), A(xa + 0.26, y - 0.003, z0 + 0.34), A(xa + 0.26, y + 0.003, z0 + 0.34), A(xa + 0.2, y + 0.003, z0 + 0.34)];
    m.box(lo, hi, sw("white"));
  }
  // tail tie-down / stinger with the white tail light housing
  m.tube([A(5.98, 0, 1.47), A(6.15, 0, 1.47)], [0.034, 0.022], sw("white"), { segs: 8 });
  part("details", m);

  // light lenses (the simulator's shader makes them glow when the light is on)
  const lens = new Mesh();
  const blob = (c, r, swName, kind, squash = [1, 1, 1]) => {
    const P = [];
    for (let i = 0; i <= 6; i++) {
      const row = [];
      const a = (i / 6) * Math.PI;
      for (let j = 0; j <= 10; j++) {
        const b = (j / 10) * Math.PI * 2;
        row.push(vadd(c, [Math.cos(a) * r * squash[0], Math.sin(a) * Math.cos(b) * r * squash[1], Math.sin(a) * Math.sin(b) * r * squash[2]]));
      }
      P.push(row);
    }
    lens.grid(P, swK(swName, kind), { closed: true, outward: (p) => vsub(p, c) });
  };
  blob(LIGHTS.beacon, 0.04, "lensRed", KIND.beacon, [1, 1, 1.2]);
  blob(LIGHTS.navLeft, 0.045, "lensRed", KIND.navLeft, [1.5, 0.6, 0.7]);
  blob(LIGHTS.navRight, 0.045, "lensGreen", KIND.navRight, [1.5, 0.6, 0.7]);
  blob(LIGHTS.strobeLeft, 0.03, "lensClear", KIND.strobe, [1.2, 0.6, 0.7]);
  blob(LIGHTS.strobeRight, 0.03, "lensClear", KIND.strobe, [1.2, 0.6, 0.7]);
  blob(LIGHTS.tail, 0.026, "lensClear", KIND.tail);
  blob(LIGHTS.landing, 0.052, "lensClear", KIND.landing, [0.35, 1, 1]);
  blob(LIGHTS.taxi, 0.052, "lensClear", KIND.taxi, [0.35, 1, 1]);
  part("light_lenses", lens);
}

// ---------------------------------------------------------------------- cockpit frame (only shown from the pilot's seat)
{
  const g = Mesh.gridData(cabLoft.P, { closed: true, outward: (p) => [0, -p[1], -(p[2] - (1.3 - CG_ZG))] });
  const nseg = cabLoft.nj - 1;
  const shell = new Mesh().addGrid(g, (i, j) => [KIND.interior + (INT_REG.x + cabLoft.u[i] * INT_REG.w) / INT_W, (INT_REG.y + (j / nseg) * INT_REG.h) / INT_H]);
  // rear cabin wall
  shell.fan(cabLoft.P[cabXs.length - 1].slice(0, nseg), [1, 0, 0], () => uvInt("wall"));
  part("cockpit_shell", shell, { material: "interior", parent: "cockpit" });

  const frame = new Mesh();
  // instrument panel bulkhead: everything below the glare shield at the panel station
  const PANEL_XA = 0.46;
  const GLARE_Z = (xa) => 1.586 + 0.024 * smoothstep(0.13, PANEL_XA, xa);
  const sec = cabinSection(PANEL_XA);
  const ring = halfRing(sec, 40);
  const topZ = GLARE_Z(PANEL_XA) - 0.004;
  const poly = [];
  for (const [y, z] of ring) if (z <= topZ) poly.push(A(PANEL_XA, y, z));
  const lastY = poly[poly.length - 1][1];
  poly.push(A(PANEL_XA, lastY, topZ));
  const right = poly.slice(1).map((p) => [p[0], -p[1], p[2]]).reverse();
  frame.fan([...poly, ...right], [-1, 0, 0], () => uvInt("panel"));
  // glare shield: the dark shelf on top of the instrument panel, slightly crowned, with a lip toward the pilot
  const halfW = (xa, zg) => {
    const s = cabinSection(xa);
    const rel = clamp((zg - s.zMid) / (s.zT - s.zMid), 0, 0.999);
    return s.w * Math.pow(1 - Math.pow(rel, s.nU), 1 / s.nU) + 0.004;
  };
  const GP = [];
  const gx = [0.135, 0.2, 0.28, 0.36, PANEL_XA, PANEL_XA + 0.03];
  for (const xa of gx) {
    const row = [];
    const z = GLARE_Z(Math.min(xa, PANEL_XA));
    const hw = halfW(Math.min(xa, PANEL_XA), z);
    for (let k = -8; k <= 8; k++) {
      const f = k / 8;
      row.push(A(xa, f * hw, z + 0.012 * (1 - f * f) + (xa > PANEL_XA ? 0.004 : 0)));
    }
    GP.push(row);
  }
  frame.grid(GP, () => uvInt("glare"), { closed: false, outward: () => [0, 0, 1] });
  // lip (front face of the shelf, facing the pilot)
  const lipTop = GP[GP.length - 1];
  {
    // remember the top of the lip straight ahead of the pilot (for the sight-line numbers in trainer-meta.ts)
    let best = lipTop[0];
    for (const p of lipTop) if (Math.abs(p[1] - EYE.y) < Math.abs(best[1] - EYE.y)) best = p;
    GLARE.lipXa = CG_XA - best[0];
    GLARE.lipZg = best[2] + CG_ZG;
  }
  frame.grid([lipTop, lipTop.map((p) => [p[0], p[1], p[2] - 0.035])], () => uvInt("glare"), { closed: false, outward: () => [-1, 0, 0] });
  part("cockpit_frame", frame, { material: "interior", parent: "cockpit" });
}

// ====================================================================== GLB writer

/** Frame A vector → glTF vector. */
const toGltf = (v) => [v[1], v[2], v[0]];

function buildGlb(textures) {
  const bin = [];
  let binLen = 0;
  const bufferViews = [];
  const accessors = [];
  const pushView = (buf, target) => {
    const pad = (4 - (binLen % 4)) % 4;
    if (pad) {
      bin.push(Buffer.alloc(pad));
      binLen += pad;
    }
    const view = { buffer: 0, byteOffset: binLen, byteLength: buf.length };
    if (target) view.target = target;
    bufferViews.push(view);
    bin.push(buf);
    binLen += buf.length;
    return bufferViews.length - 1;
  };
  const f32 = (arr) => Buffer.from(new Float32Array(arr).buffer);

  const materials = [
    {
      name: "livery",
      pbrMetallicRoughness: { baseColorTexture: { index: 0 }, metallicRoughnessTexture: { index: 1 }, metallicFactor: 1, roughnessFactor: 1 },
    },
    { name: "interior", pbrMetallicRoughness: { baseColorTexture: { index: 2 }, metallicFactor: 0, roughnessFactor: 0.85 }, alphaMode: "MASK", alphaCutoff: 0.5 },
    { name: "propdisc", pbrMetallicRoughness: { baseColorFactor: [0.08, 0.08, 0.09, 0.2], metallicFactor: 0, roughnessFactor: 0.6 }, alphaMode: "BLEND", doubleSided: true },
  ];
  const matIndex = { livery: 0, interior: 1, propdisc: 2 };

  const nodes = [];
  const meshes = [];
  const groups = { airframe: [], cabin_exterior: [], cockpit: [], lights: [] };
  const stats = { triangles: 0, vertices: 0, perNode: {} };
  let min = [Infinity, Infinity, Infinity];
  let max = [-Infinity, -Infinity, -Infinity];

  for (const p of parts) {
    const fr = p.frame ?? { o: [0, 0, 0], ex: [0, 1, 0], ey: [0, 0, 1], ez: [1, 0, 0] };
    const m = p.mesh;
    const n = m.count;
    const pos = new Float32Array(n * 3);
    const nrm = new Float32Array(n * 3);
    const lo = [Infinity, Infinity, Infinity];
    const hi = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < n; i++) {
      const a = [m.pos[i * 3], m.pos[i * 3 + 1], m.pos[i * 3 + 2]];
      for (let k = 0; k < 3; k++) {
        min[k] = Math.min(min[k], a[k]);
        max[k] = Math.max(max[k], a[k]);
      }
      const d = vsub(a, fr.o);
      const l = [vdot(d, fr.ex), vdot(d, fr.ey), vdot(d, fr.ez)];
      const nn = [m.nrm[i * 3], m.nrm[i * 3 + 1], m.nrm[i * 3 + 2]];
      const ln = vnorm([vdot(nn, fr.ex), vdot(nn, fr.ey), vdot(nn, fr.ez)]);
      for (let k = 0; k < 3; k++) {
        pos[i * 3 + k] = l[k];
        nrm[i * 3 + k] = ln[k];
        lo[k] = Math.min(lo[k], Math.fround(l[k]));
        hi[k] = Math.max(hi[k], Math.fround(l[k]));
      }
    }
    const idx = n < 65536 ? new Uint16Array(m.idx) : new Uint32Array(m.idx);
    const vPos = pushView(Buffer.from(pos.buffer), 34962);
    const vNrm = pushView(Buffer.from(nrm.buffer), 34962);
    const vUv = pushView(f32(m.uv), 34962);
    const vIdx = pushView(Buffer.from(idx.buffer), 34963);
    const aPos = accessors.push({ bufferView: vPos, componentType: 5126, count: n, type: "VEC3", min: lo, max: hi }) - 1;
    const aNrm = accessors.push({ bufferView: vNrm, componentType: 5126, count: n, type: "VEC3" }) - 1;
    const aUv = accessors.push({ bufferView: vUv, componentType: 5126, count: n, type: "VEC2" }) - 1;
    const aIdx = accessors.push({ bufferView: vIdx, componentType: n < 65536 ? 5123 : 5125, count: idx.length, type: "SCALAR" }) - 1;
    meshes.push({ name: p.name, primitives: [{ attributes: { POSITION: aPos, NORMAL: aNrm, TEXCOORD_0: aUv }, indices: aIdx, material: matIndex[p.material], mode: 4 }] });
    const node = { name: p.name, mesh: meshes.length - 1 };
    if (p.frame) {
      const bx = new THREE.Vector3(...toGltf(fr.ex));
      const by = new THREE.Vector3(...toGltf(fr.ey));
      const bz = new THREE.Vector3(...toGltf(fr.ez));
      const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(bx, by, bz));
      node.translation = toGltf(fr.o).map((v) => +v.toFixed(6));
      node.rotation = [q.x, q.y, q.z, q.w].map((v) => +v.toFixed(7));
    }
    if (p.extras) node.extras = p.extras;
    nodes.push(node);
    groups[p.parent].push(nodes.length - 1);
    stats.triangles += m.triangles;
    stats.vertices += n;
    stats.perNode[p.name] = m.triangles;
  }
  for (const e of empties) {
    nodes.push({ name: e.name, translation: toGltf(e.at).map((v) => +v.toFixed(5)), extras: e.extras });
    groups.lights.push(nodes.length - 1);
  }
  const groupIdx = {};
  for (const [name, children] of Object.entries(groups)) {
    nodes.push({ name, children });
    groupIdx[name] = nodes.length - 1;
  }
  nodes.push({
    name: "SkyReady_Trainer",
    children: Object.values(groupIdx),
    extras: {
      about: "SkyReady trainer — original procedural model built by scripts/build-aircraft.mjs. Not a model of any specific real aircraft.",
      axes: "glTF +Z nose, +Y up, +X left wing. Origin = centre of gravity. Metres.",
      movingParts: "Every moving node turns about its own local +X axis (see each node's extras).",
      registration: REG_TEXT,
    },
  });
  const rootIndex = nodes.length - 1;

  const images = [];
  const pushImage = (name, png) => {
    const view = pushView(png);
    images.push({ name, mimeType: "image/png", bufferView: view });
  };
  pushImage("livery_basecolor", textures.base);
  pushImage("livery_roughness_metallic", textures.mr);
  pushImage("cabin_interior", textures.interior);

  const gltf = {
    asset: { version: "2.0", generator: "SkyReady scripts/build-aircraft.mjs", copyright: "SkyReady — original work (procedurally generated)" },
    scene: 0,
    scenes: [{ name: "SkyReady trainer", nodes: [rootIndex] }],
    nodes,
    meshes,
    materials,
    textures: [
      { sampler: 0, source: 0 },
      { sampler: 0, source: 1 },
      { sampler: 0, source: 2 },
    ],
    images,
    samplers: [{ magFilter: 9729, minFilter: 9987, wrapS: 10497, wrapT: 10497 }],
    accessors,
    bufferViews,
    buffers: [{ byteLength: 0 }],
  };
  const padBin = (4 - (binLen % 4)) % 4;
  if (padBin) {
    bin.push(Buffer.alloc(padBin));
    binLen += padBin;
  }
  gltf.buffers[0].byteLength = binLen;
  let json = Buffer.from(JSON.stringify(gltf), "utf8");
  const padJson = (4 - (json.length % 4)) % 4;
  if (padJson) json = Buffer.concat([json, Buffer.alloc(padJson, 0x20)]);
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + json.length + 8 + binLen, 8);
  const jh = Buffer.alloc(8);
  jh.writeUInt32LE(json.length, 0);
  jh.writeUInt32LE(0x4e4f534a, 4);
  const bh = Buffer.alloc(8);
  bh.writeUInt32LE(binLen, 0);
  bh.writeUInt32LE(0x004e4942, 4);
  return { glb: Buffer.concat([header, jh, json, bh, ...bin]), stats, min, max };
}

// ====================================================================== run

console.log("Painting the textures …");
const t0 = Date.now();
const textures = buildTextures();
console.log(`  base colour ${(textures.base.length / 1024).toFixed(0)} kB, roughness ${(textures.mr.length / 1024).toFixed(0)} kB, cabin ${(textures.interior.length / 1024).toFixed(0)} kB  (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
for (const [name, at] of Object.entries(LIGHTS)) {
  const nodeName = "light_" + name.replace(/[A-Z]/g, (c) => "_" + c.toLowerCase());
  empties.push({ name: nodeName, at, extras: { light: LIGHT_DOCS[name] } });
}
const { glb, stats, min, max } = buildGlb(textures);
mkdirSync(path.dirname(OUT_GLB), { recursive: true });
writeFileSync(OUT_GLB, glb);

const r = (v) => +v.toFixed(4);
// sight-line angles from the pilot's eye, straight ahead of the left seat
const SIGHT = (() => {
  const dep = (xa, zg) => (Math.atan2(EYE.zg - zg, EYE.xa - xa) * 180) / Math.PI;
  let cowl = 90;
  for (let xa = FUS_X0 + 0.02; xa <= WS_BASE; xa += 0.02) {
    const s = fusSection(xa);
    const rel = clamp(EYE.y / s.w, 0, 0.999);
    const z = s.zMid + (s.zT - s.zMid) * Math.pow(1 - Math.pow(rel, s.nU), 1 / s.nU); // cowling surface straight ahead of the pilot
    cowl = Math.min(cowl, dep(xa, z));
  }
  return { glare: dep(GLARE.lipXa, GLARE.lipZg), cowl };
})();
const eyeA = A(EYE.xa, EYE.y, EYE.zg).map(r);
const meta = `/**
 * GENERATED by scripts/build-aircraft.mjs — do not edit by hand (run the script again instead).
 * Numbers describing public/models/trainer.glb, in the aircraft frame used by aircraftMatrix():
 * metres, origin at the centre of gravity, +x nose, +y LEFT wing, +z up.
 */
export const TRAINER_META = {
  url: "models/trainer.glb",
  registration: ${JSON.stringify(REG_TEXT)},
  /** Pilot's eye point (left seat). */
  eye: [${eyeA.join(", ")}] as [number, number, number],
  /** How the flight model sits on its wheels (used to place the tyres). */
  staticPitchDeg: ${STATIC_PITCH_DEG},
  staticCgHeightM: ${STATIC_CG_HEIGHT},
  /** Size of the model, metres. */
  lengthM: ${r(max[0] - min[0])},
  spanM: ${r(max[1] - min[1])},
  /** Box around the whole model: [min x, min y, min z], [max x, max y, max z]. */
  bounds: [[${min.map(r).join(", ")}], [${max.map(r).join(", ")}]] as [[number, number, number], [number, number, number]],
  propRadiusM: ${PROP_RADIUS},
  /** Lowest point of each tyre (body frame, fuselage level). */
  wheels: {
    nose: [${[CG_XA - NOSE_XA, 0, NOSE_CONTACT_ZG - CG_ZG].map(r).join(", ")}],
    mainLeft: [${[CG_XA - MAIN_XA, 1.25, -CG_ZG].map(r).join(", ")}],
    mainRight: [${[CG_XA - MAIN_XA, -1.25, -CG_ZG].map(r).join(", ")}],
  } as Record<"nose" | "mainLeft" | "mainRight", [number, number, number]>,
  /** Light positions. */
  lights: {
${Object.entries(LIGHTS)
  .map(([k, v]) => `    ${k}: [${v.map(r).join(", ")}],`)
  .join("\n")}
  } as Record<${Object.keys(LIGHTS)
    .map((k) => JSON.stringify(k))
    .join(" | ")}, [number, number, number]>,
  /**
   * What the pilot sees ahead with the head level, as angles BELOW the level line of sight (degrees):
   * the top of the glare shield (the dark shelf above the instruments) and the top of the engine cowling.
   */
  sight: { glareShieldDeg: ${r(SIGHT.glare)}, cowlingDeg: ${r(SIGHT.cowl)} },
  /** Where the wing strut meets the fuselage and the wing (left side). */
  strut: { bottom: [${STRUT.botA.map(r).join(", ")}], top: [${STRUT.topA.map(r).join(", ")}] },
  /** Nodes. Every moving node turns about its own local +X axis. */
  nodes: {
    propeller: "propeller",
    propellerBlades: "propeller_blades",
    propellerDisc: "propeller_disc",
    elevator: "elevator",
    rudder: "rudder",
    aileronLeft: "aileron_left",
    aileronRight: "aileron_right",
    flapLeft: "flap_left",
    flapRight: "flap_right",
    /** Hidden in the cockpit view (it would block the pilot's view). */
    cabinExterior: "cabin_exterior",
    /** Shown only in the cockpit view. */
    cockpit: "cockpit",
  },
  /** Whole numbers added to texture U that tell the shader what a surface is. */
  kinds: ${JSON.stringify(KIND)},
  triangles: ${stats.triangles},
} as const;
`;
writeFileSync(OUT_META, meta);

console.log(`Wrote ${path.relative(ROOT, OUT_GLB)}: ${(glb.length / 1024).toFixed(0)} kB, ${stats.triangles} triangles, ${stats.vertices} vertices, ${parts.length} mesh nodes`);
console.log(`  length ${(max[0] - min[0]).toFixed(2)} m (x ${min[0].toFixed(2)} … ${max[0].toFixed(2)}), span ${(max[1] - min[1]).toFixed(2)} m, z ${min[2].toFixed(3)} … ${max[2].toFixed(3)}`);
console.log(`  wheels: main tyres bottom z = ${(-CG_ZG).toFixed(4)}, nose tyre bottom z = ${(NOSE_CONTACT_ZG - CG_ZG).toFixed(4)} (body frame)`);
console.log("  triangles per node: " + Object.entries(stats.perNode).map(([k, v]) => `${k} ${v}`).join(", "));
console.log(`Wrote ${path.relative(ROOT, OUT_META)}`);
