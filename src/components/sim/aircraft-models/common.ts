/** Helpers shared by the aircraft family builders. */
import * as THREE from "three";

import { MeshBuilder, bodyShape, loftBody, revolve, tube, type Station } from "./geometry";
import type { AirframeKit, LegBuilder, MatKey } from "./kit";
import type { V3 } from "./math";

/** Teardrop wheel fairing centred on a wheel. */
export function wheelPant(
  leg: LegBuilder,
  c: V3,
  o: { len: number; hw: number; top: number; bot: number; radial: number; rings?: number },
  mat: MatKey = "paint",
) {
  const L = o.len;
  const st: Station[] = [
    { z: c[2] - L * 0.45, hw: o.hw * 0.2, top: o.top * 0.25, bot: o.bot * 0.3 },
    { z: c[2] - L * 0.4, hw: o.hw * 0.68, top: o.top * 0.66, bot: o.bot * 0.72 },
    { z: c[2] - L * 0.26, hw: o.hw * 0.96, top: o.top * 0.95, bot: o.bot * 0.97 },
    { z: c[2] + L * 0.02, hw: o.hw, top: o.top, bot: o.bot },
    { z: c[2] + L * 0.3, hw: o.hw * 0.62, top: o.top * 0.7, bot: o.bot * 0.75 },
    { z: c[2] + L * 0.55, hw: o.hw * 0.1, top: o.top * 0.3, bot: o.bot * 0.1 },
  ];
  const mb = loftBody(st, {
    radial: o.radial,
    rings: o.rings ?? 10,
    cx: c[0],
    cy: c[1],
    noseCap: o.len * 0.03,
    tailCap: o.len * 0.01,
  });
  leg.add(mb, mat);
}

/** Small forward-facing dark ellipse (cowl inlet, intake mouth). */
export function inlet(kit: AirframeKit, c: V3, rx: number, ry: number, seg: number) {
  const g = new THREE.CircleGeometry(1, seg);
  g.rotateY(Math.PI);
  g.scale(rx, ry, 1);
  g.translate(c[0], c[1], c[2]);
  kit.add(g, "intake");
}

/** Exhaust stack: short tube with a dark mouth. */
export function exhaust(kit: AirframeKit, a: V3, b: V3, d: number, seg = 8) {
  kit.add(tube(a, b, d, d, { seg }), "exhaust");
}

/** Oleo strut with chrome piston and a torque-link hint. */
export function oleo(leg: LegBuilder, top: V3, axle: V3, d: number, seg: number) {
  const mid: V3 = [(top[0] + axle[0]) / 2, (top[1] + axle[1]) / 2, (top[2] + axle[2]) / 2];
  leg.add(tube(top, mid, d, d, { seg }), "gear");
  leg.add(tube(mid, axle, d * 0.62, d * 0.62, { seg }), "metal");
  // torque link
  leg.add(
    tube(
      [mid[0], mid[1] + d * 0.4, mid[2] - d * 1.2],
      [axle[0], axle[1] + d * 0.6, axle[2] - d * 1.1],
      d * 0.3,
      d * 0.3,
      { seg: 4 },
    ),
    "gear",
  );
}

/** Nav light housing lenses at the wing tips (red left, green right). */
export function tipLenses(kit: AirframeKit, l: V3, r: V3, size: number) {
  const s = new THREE.SphereGeometry(size, 10, 6);
  const sl = s.clone().translate(l[0], l[1], l[2]);
  const sr = s.clone().translate(r[0], r[1], r[2]);
  s.dispose();
  kit.add(sl, "lensRed");
  kit.add(sr, "lensGreen");
}

/** Small beacon dome. */
export function beaconDome(kit: AirframeKit, at: V3, size: number) {
  const g = new THREE.SphereGeometry(size, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  g.scale(1, 0.8, 1.6);
  g.translate(at[0], at[1], at[2]);
  kit.add(g, "lensRed");
}

/** Revolved cowl-flap / jet nozzle style ring helper (open). */
export function ring(profile: [number, number][], seg: number, cx: number, cy: number) {
  return revolve(profile, { segments: seg, cx, cy });
}

export { MeshBuilder, bodyShape };
