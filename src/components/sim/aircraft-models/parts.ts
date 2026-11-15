/** Reusable mechanical parts: propeller blades, spinners, fans, wheels. Original geometry. */
import * as THREE from "three";

import { MeshBuilder, capPolygon, revolve } from "./geometry";
import { DEG, add, airfoil, plin, scale, type V3 } from "./math";

export interface BladeSpec {
  /** Blade tip radius, m. */
  radius: number;
  /** Radius where the blade emerges (inside the spinner), m. */
  root: number;
  /** Max chord, m. */
  chord: number;
  /** Geometric pitch, m per revolution (sets the blade twist). */
  pitch: number;
  /** +1 = counter-clockwise seen from the cockpit, −1 = clockwise (most US engines). */
  dir: 1 | -1;
  /** Radial stations along the blade. */
  stations: number;
  /** Airfoil points per surface. */
  K: number;
  /** Painted tip band, fraction of radius (0 = none). */
  tipBand: number;
  bladeColor: [number, number, number];
  tipColor: [number, number, number];
  /** Planform: "paddle" (wide, rounded – GA), "scimitar" (turboprop), "fan" (jet fan blade). */
  shape: "paddle" | "scimitar" | "fan";
}

/** One blade along +y, rotating about z. Vertex coloured. */
export function propBlade(s: BladeSpec): MeshBuilder {
  const mb = new MeshBuilder();
  mb.col = [];
  const R = s.radius;
  const rs: number[] = [];
  for (let i = 0; i <= s.stations; i++) {
    const u = i / s.stations;
    rs.push(s.root + (R - s.root) * (1 - Math.pow(1 - u, 1.3)));
  }
  // painted tip: duplicate a station at the band edge for a crisp colour change
  const bandR = R * (1 - s.tipBand);
  if (s.tipBand > 0) {
    rs.push(bandR - 0.002, bandR + 0.002);
    rs.sort((a, b) => a - b);
  }
  const chordAt = (r: number) => {
    const u = (r - s.root) / (R - s.root);
    if (s.shape === "fan") return s.chord * plin([0, 0.5, 1], [0.75, 0.95, 1], u);
    const rootW = s.shape === "scimitar" ? 0.55 : 0.5;
    return (
      s.chord *
      plin([0, 0.12, 0.45, 0.8, 0.94, 1], [rootW, 0.85, 1, 0.88, 0.66, 0.28], u) *
      (s.shape === "scimitar" ? plin([0, 0.6, 1], [1, 1.05, 0.9], u) : 1)
    );
  };
  const sweepAt = (r: number) => {
    const u = (r - s.root) / (R - s.root);
    if (s.shape === "scimitar") return s.chord * 0.9 * Math.pow(u, 2.2);
    if (s.shape === "fan") return s.chord * 0.25 * u;
    return 0;
  };
  const thickAt = (r: number) => {
    const u = (r - s.root) / (R - s.root);
    return plin([0, 0.15, 0.5, 1], [0.32, 0.16, 0.09, 0.06], u);
  };
  const rings: number[][] = [];
  const K = s.K;
  const frames: { D: V3; U: V3 }[] = [];
  for (const r of rs) {
    const beta = Math.atan(s.pitch / (2 * Math.PI * Math.max(r, 0.05)));
    const D: V3 = [s.dir * Math.cos(beta), 0, Math.sin(beta)];
    const U: V3 = [s.dir * Math.sin(beta), 0, -Math.cos(beta)];
    frames.push({ D, U });
    const c = chordAt(r);
    const t = thickAt(r);
    // sweep the blade (scimitar) by moving the section opposite to rotation
    const off: V3 = [s.dir * sweepAt(r), r, 0];
    const tip = r >= bandR && s.tipBand > 0;
    const color = tip ? s.tipColor : s.bladeColor;
    const ids: number[] = [];
    const pts: [number, number][] = [];
    for (let k = K; k >= 0; k--) {
      const x = 1 - Math.cos((Math.PI / 2) * (k / K));
      const [yc, yt] = airfoil(x, t, 0.03);
      pts.push([x, yc + yt]);
    }
    for (let k = 1; k <= K; k++) {
      const x = 1 - Math.cos((Math.PI / 2) * (k / K));
      const [yc, yt] = airfoil(x, t, 0.03);
      pts.push([x, yc - yt]);
    }
    for (const [x, y] of pts) {
      const p = add(off, add(scale(D, (x - 0.3) * c), scale(U, y * c)));
      ids.push(mb.v(p));
      mb.col.push(color[0], color[1], color[2]);
    }
    rings.push(ids);
  }
  const ringPts = rings[0]?.length ?? 0;
  for (let i = 0; i < rings.length - 1; i++) {
    const a = rings[i] ?? [];
    const b = rings[i + 1] ?? [];
    const fa = frames[i];
    if (!fa) continue;
    for (let j = 0; j < ringPts - 1; j++) {
      // outward: compare with the section-plane normal of this ring edge
      const pa = mb.p(a[j] ?? 0);
      const pb = mb.p(a[j + 1] ?? 0);
      const e: V3 = [pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]];
      // in-plane outward normal of a CCW ring edge: rotate edge by −90° about the span (+y)
      const ed = e[0] * fa.D[0] + e[2] * fa.D[2];
      const eu = e[0] * fa.U[0] + e[2] * fa.U[2];
      const out = add(scale(fa.D, eu), scale(fa.U, -ed));
      mb.quadOut(a[j] ?? 0, a[j + 1] ?? 0, b[j + 1] ?? 0, b[j] ?? 0, out);
    }
  }
  // tip cap
  const last = rings[rings.length - 1] ?? [];
  const before = mb.vertexCount;
  capPolygon(
    mb,
    last.map((k) => mb.p(k)),
    [0, 1, 0],
  );
  const tc = s.tipBand > 0 ? s.tipColor : s.bladeColor;
  for (let i = before; i < mb.vertexCount; i++) mb.col.push(tc[0], tc[1], tc[2]);
  return mb;
}

/** All blades of a propeller / fan around z. */
export function propeller(s: BladeSpec, blades: number, phase = 0): MeshBuilder {
  const one = propBlade(s);
  const out = new MeshBuilder();
  out.col = [];
  for (let b = 0; b < blades; b++) {
    const a = phase + (b / blades) * Math.PI * 2;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const copy = new MeshBuilder();
    copy.col = one.col ? one.col.slice() : null;
    for (let i = 0; i < one.pos.length; i += 3) {
      const x = one.pos[i] ?? 0;
      const y = one.pos[i + 1] ?? 0;
      copy.pos.push(x * ca - y * sa, x * sa + y * ca, one.pos[i + 2] ?? 0);
    }
    for (const i of one.idx) copy.idx.push(i);
    out.append(copy);
  }
  return out;
}

/**
 * Spinner (ogive) along z: tip at z = −len·(1−back), base at z = len·back.
 * `bluntness` < 1 gives a fuller nose.
 */
export function spinner(len: number, r: number, seg: number, back = 0.3, bluntness = 0.6) {
  const prof: [number, number][] = [];
  const n = 9;
  const zTip = -len * (1 - back);
  for (let i = 0; i <= n; i++) {
    const s = i / n;
    const rr = r * Math.pow(1 - Math.pow(1 - s, 2), bluntness);
    prof.push([i === 0 ? 0 : rr, zTip + s * len]);
  }
  prof.push([r * 0.98, len * back + 0.004]);
  prof.push([0, len * back + 0.004]);
  return revolve(prof, { segments: seg });
}

/** Tyre (torus) + hub, axle along x, centred at `c`. */
export function wheel(c: V3, dia: number, width: number, seg: number) {
  const tubeR = width / 2;
  const R = dia / 2 - tubeR;
  const tire = new THREE.TorusGeometry(R, tubeR, Math.max(6, Math.round(seg / 2)), seg);
  tire.rotateY(Math.PI / 2);
  tire.translate(c[0], c[1], c[2]);
  const hub = new THREE.CylinderGeometry(R * 0.98, R * 0.98, width * 0.72, Math.max(8, seg), 1);
  hub.rotateZ(Math.PI / 2);
  hub.translate(c[0], c[1], c[2]);
  return { tire, hub };
}

/** Simple finned cylinder head (exposed-cylinder vintage engines). */
export function cylinderHead(c: V3, side: 1 | -1, r: number, length: number, seg: number) {
  const g = new THREE.CylinderGeometry(r, r * 0.92, length, seg, 1);
  g.rotateZ((side * Math.PI) / 2);
  g.translate(c[0] + (side * length) / 2, c[1], c[2]);
  return g;
}

export const DEG2RAD = DEG;
