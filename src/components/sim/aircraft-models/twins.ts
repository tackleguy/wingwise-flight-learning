/**
 * Twin-engine aircraft: Piper PA-34-220T Seneca V and Beechcraft Baron G58 (light piston twins,
 * conventional tails) and Beechcraft King Air 350 (turboprop, T-tail, winglets). Representative
 * shapes from public dimensions, not manufacturer drawings. Design coordinates: z aft from the
 * nose tip, y up from the nose centre line, metres.
 */
import { beaconDome, exhaust, inlet, oleo, tipLenses } from "./common";
import { blade, box, tube, type MovableDef, type PlanStation, type Station } from "./geometry";
import type { AirframeKit, Limits } from "./kit";
import type { LiveryPainter, P2 } from "./livery";
import type { V3 } from "./math";

interface Surf {
  root: V3;
  stations: PlanStation[];
}

interface TwinSpec {
  id: string;
  label: string;
  reg: string;
  dims: { lengthM: number; spanM: number; heightM: number };
  fuselage: Station[];
  wing: Surf & { flaps: [number, number][]; flapCut: number; aileron: [number, number, number] };
  limits: Limits;
  htail: Surf & { stabilator?: boolean; elevatorCut: number };
  vtail: Surf & { rudderCut: number };
  dorsal?: Surf;
  /** Ventral strakes (pairs), as surfaces hanging below the tail cone. */
  strakes?: Surf;
  nacelle: {
    x: number;
    y: number;
    stations: Station[];
    /** Turboprop: chin intake + exhaust stacks. */
    turbine?: boolean;
  };
  prop: {
    z: number;
    blades: number;
    diameter: number;
    chord: number;
    pitch: number;
    spinnerLen: number;
    spinnerR: number;
    shape?: "paddle" | "scimitar";
    counterRotating: boolean;
  };
  gear: {
    mainX: number;
    mainZ: number;
    mainTop: number;
    noseZ: number;
    noseTop: number;
    groundY: number;
    mainTire: number;
    noseTire: number;
    /** "inboard": mains fold toward the fuselage; "forward": into the nacelles. */
    mainRetract: "inboard" | "forward";
    noseRetract: "forward" | "aft";
    dualMains?: boolean;
  };
  livery: (p: LiveryPainter) => void;
  regAt: [number, number, number];
  cg: V3;
  lightSize?: number;
  extras?: (kit: AirframeKit) => void;
}

export function buildTwin(kit: AirframeKit, sp: TwinSpec) {
  const q = kit.q;
  kit.limits = sp.limits;
  const big = sp.dims.lengthM > 12;
  const fus = kit.body(sp.fuselage, "livery", {
    noseCap: 0.01,
    tailCap: 0.02,
    ringsScale: big ? 1.4 : 1.1,
  });

  const movables: MovableDef[] = sp.wing.flaps.map(([from, to], i) => ({
    key: `flap${i}`,
    from,
    to,
    cut: sp.wing.flapCut,
    pivot: sp.wing.flapCut + 0.02,
    drop: 0.035,
  }));
  movables.push({
    key: "aileron",
    from: sp.wing.aileron[0],
    to: sp.wing.aileron[1],
    cut: sp.wing.aileron[2],
  });
  const wing = kit.surface(
    { root: sp.wing.root, mirror: true, stations: sp.wing.stations, movables },
    "paint",
  );
  const semi = wing.span;

  const hSemi = sp.htail.stations[sp.htail.stations.length - 1]?.s ?? 1;
  kit.surface(
    {
      root: sp.htail.root,
      mirror: true,
      stations: sp.htail.stations,
      movables: sp.htail.stabilator
        ? [{ key: "stabilator", from: 0, to: hSemi, cut: 0, pivot: 0.25 }]
        : [{ key: "elevator", from: 0.1, to: hSemi - 0.04, cut: sp.htail.elevatorCut }],
    },
    "paint",
  );
  const finTopS = sp.vtail.stations[sp.vtail.stations.length - 1]?.s ?? 1;
  kit.tTail = sp.htail.root[1] > sp.vtail.root[1] + 0.3;
  const fin = kit.surface(
    {
      root: sp.vtail.root,
      roll: 90,
      stations: sp.vtail.stations,
      movables: [{ key: "rudder", from: 0, to: finTopS, cut: sp.vtail.rudderCut }],
    },
    "livery",
  );
  if (sp.dorsal) kit.surface({ ...sp.dorsal, roll: 90 }, "livery");
  if (sp.strakes) {
    for (const side of [1, -1]) {
      kit.surface(
        {
          ...sp.strakes,
          root: [side * sp.strakes.root[0], sp.strakes.root[1], sp.strakes.root[2]],
          roll: side > 0 ? -60 : -120,
        },
        "paint",
      );
    }
  }

  // nacelles, engines and propellers
  const n = sp.nacelle;
  for (const side of [1, -1]) {
    const cx = side * n.x;
    kit.body(n.stations, "paint", { cx, cy: n.y, noseCap: 0.01, tailCap: 0.02, ringsScale: 0.6 });
    const front = n.stations[0];
    if (!front) continue;
    kit.prop({
      at: [cx, n.y, sp.prop.z],
      blades: sp.prop.blades,
      diameter: sp.prop.diameter,
      dir: sp.prop.counterRotating && side > 0 ? 1 : -1,
      chord: sp.prop.chord,
      pitch: sp.prop.pitch,
      spinnerLen: sp.prop.spinnerLen,
      spinnerR: sp.prop.spinnerR,
      bluntness: 0.75,
      ...(sp.prop.shape ? { shape: sp.prop.shape } : {}),
    });
    if (n.turbine) {
      // chin intake below the spinner and twin exhaust stacks
      const st = n.stations[2] ?? front;
      inlet(kit, [cx, n.y + st.bot * 0.82, st.z - 0.42], 0.17, 0.09, q.seg);
      for (const s2 of [1, -1]) {
        const zx = (n.stations[2]?.z ?? 0) + 0.25;
        const a: V3 = [cx + s2 * (st.hw - 0.04), n.y + 0.02, zx];
        const b: V3 = [cx + s2 * (st.hw + 0.12), n.y + 0.0, zx + 0.4];
        kit.add(tube(a, b, 0.2, 0.16, { seg: 10, ratio: 0.75, flow: [0, 1, 0] }), "exhaust");
      }
    } else {
      for (const s2 of [1, -1]) {
        inlet(kit, [cx + s2 * front.hw * 0.55, n.y + 0.01, front.z - 0.004], 0.07, 0.065, q.seg);
      }
      const mid = n.stations[2] ?? front;
      exhaust(
        kit,
        [cx + side * mid.hw * 0.8, n.y + mid.bot * 0.6, mid.z + 0.5],
        [cx + side * mid.hw * 0.95, n.y + mid.bot * 0.75, mid.z + 0.8],
        0.06,
      );
    }
  }

  // retractable gear
  const g = sp.gear;
  for (const side of [1, -1]) {
    const pivot: V3 = [
      side * g.mainX,
      g.mainTop,
      g.mainZ - (g.mainRetract === "forward" ? 0.25 : 0),
    ];
    const c: V3 = [side * g.mainX, g.groundY + g.mainTire / 2, g.mainZ];
    const axis: V3 = g.mainRetract === "inboard" ? [0, 0, 1] : [1, 0, 0];
    const ang = g.mainRetract === "inboard" ? side * -88 : 92;
    kit.gearLeg(pivot, axis, ang, (leg) => {
      oleo(leg, pivot, [c[0], c[1] + 0.13, c[2]], g.dualMains ? 0.12 : 0.085, 8);
      if (g.dualMains) {
        leg.add(
          tube([c[0] - 0.2, c[1], c[2]], [c[0] + 0.2, c[1], c[2]], 0.07, 0.07, { seg: 6 }),
          "gear",
        );
        leg.wheel([c[0] - 0.16, c[1], c[2]], g.mainTire, 0.17);
        leg.wheel([c[0] + 0.16, c[1], c[2]], g.mainTire, 0.17);
      } else {
        leg.wheel(c, g.mainTire, 0.17);
        leg.add(
          box(
            [c[0] + side * 0.13, (pivot[1] + c[1]) / 2 + 0.06, c[2]],
            [0.012, pivot[1] - c[1] - 0.06, 0.32],
          ),
          "paint",
        );
      }
    });
  }
  const nosePivot: V3 = [0, g.noseTop, g.noseZ];
  const noseC: V3 = [0, g.groundY + g.noseTire / 2, g.noseZ];
  kit.gearLeg(nosePivot, [1, 0, 0], g.noseRetract === "forward" ? 92 : -92, (leg) => {
    oleo(leg, nosePivot, [0, noseC[1] + 0.1, noseC[2]], 0.08, 8);
    leg.wheel(noseC, g.noseTire, 0.14);
  });

  // lights
  const tip = wing.point(semi, 0.2, 0);
  const winglet = (sp.wing.stations[sp.wing.stations.length - 2]?.dh ?? 0) > 30;
  const navAt = winglet ? wing.point(semi * 0.955, 0.25, 0) : tip;
  const tipL: V3 = [-navAt[0] - 0.03, navAt[1], navAt[2]];
  const tipR: V3 = [navAt[0] + 0.03, navAt[1], navAt[2]];
  tipLenses(kit, tipL, tipR, big ? 0.05 : 0.035);
  const tee = sp.htail.root[1] > sp.vtail.root[1] + 0.5;
  const finTop = fin.point(finTopS, 0.4, 0);
  const beaconTop: V3 = tee ? [0, sp.htail.root[1] + 0.12, sp.htail.root[2] + 0.35] : finTop;
  beaconDome(kit, beaconTop, big ? 0.06 : 0.045);
  const belly = sp.fuselage.reduce((a, s) => (s.bot < a.bot ? s : a));
  const bellyBeacon: V3 = [0, belly.bot - 0.01, belly.z + 1];
  const lampW = wing.point(Math.min(n.x - 0.6, semi * 0.25), 0.01, 0);
  kit.lights({
    navL: tipL,
    navR: tipR,
    beacons: [[0, beaconTop[1] + 0.06, beaconTop[2]], ...(big ? [bellyBeacon] : [])],
    strobes: [
      [tipL[0], tipL[1], tipL[2] + 0.2],
      [tipR[0], tipR[1], tipR[2] + 0.2],
    ],
    landing: { pos: [-lampW[0], lampW[1], lampW[2] - 0.02], dir: [0, -0.07, -1] },
    size: sp.lightSize ?? 1,
  });
  if (big) beaconDome(kit, bellyBeacon, 0.06);

  // antennas
  const roof = sp.fuselage.reduce((a, s) => (s.top > a.top ? s : a));
  kit.add(
    blade([0, roof.top - 0.01, roof.z + 0.6], big ? 0.28 : 0.2, big ? 0.12 : 0.09, 0.08),
    "dark",
  );
  kit.add(blade([0, roof.top - 0.02, roof.z + 1.6], big ? 0.24 : 0.16, 0.08, 0.06), "dark");
  sp.extras?.(kit);

  kit.livery(sp.livery);
  kit.registration(sp.reg, fus, sp.regAt[0], sp.regAt[1], sp.regAt[2], "#1b1f24");
  kit.setCg(sp.cg);
  return { id: sp.id, label: sp.label, dims: sp.dims };
}

const S = (z: number, hw: number, top: number, bot: number, nt = 2.5, nb = nt): Station => ({
  z,
  hw,
  top,
  bot,
  nt,
  nb,
});

const pts = (...a: number[]): P2[] => {
  const out: P2[] = [];
  for (let i = 0; i < a.length - 1; i += 2) out.push([a[i] ?? 0, a[i + 1] ?? 0]);
  return out;
};

const pistonNacelle = (front: number, back: number, s = 1): Station[] => [
  S(front, 0.2 * s, 0.18 * s, -0.2 * s, 2.2),
  S(front + 0.12, 0.28 * s, 0.25 * s, -0.28 * s, 2.4),
  S(front + 0.5, 0.36 * s, 0.3 * s, -0.37 * s, 2.6),
  S(front + 1.3, 0.38 * s, 0.32 * s, -0.41 * s, 2.6),
  S(back - 1.3, 0.34 * s, 0.26 * s, -0.38 * s, 2.5),
  S(back - 0.5, 0.2 * s, 0.14 * s, -0.22 * s, 2.3),
  S(back, 0.04, 0.03, -0.05, 2.0),
];

// ---------------------------------------------------------------------------------------------
// Piper PA-34-220T Seneca V
// ---------------------------------------------------------------------------------------------

const SENECA: TwinSpec = {
  id: "pa34",
  label: "Piper PA-34-220T Seneca V (representative)",
  reg: "SR-P34",
  dims: { lengthM: 8.72, spanM: 11.86, heightM: 3.02 },
  fuselage: [
    S(0.0, 0.06, 0.06, -0.08, 2.0),
    S(0.15, 0.24, 0.17, -0.22, 2.3),
    S(0.5, 0.4, 0.27, -0.36, 2.6),
    S(1.1, 0.52, 0.34, -0.45, 2.8),
    S(1.75, 0.58, 0.38, -0.5, 3.0),
    S(2.05, 0.61, 0.55, -0.52, 3.0),
    S(2.45, 0.62, 0.78, -0.53, 3.2, 3.0),
    S(2.75, 0.62, 0.84, -0.53, 3.4, 3.0),
    S(4.3, 0.6, 0.84, -0.51, 3.4, 3.0),
    S(5.0, 0.52, 0.7, -0.44, 3.0, 2.8),
    S(5.9, 0.38, 0.52, -0.3, 2.6),
    S(7.1, 0.2, 0.34, -0.1, 2.3),
    S(8.1, 0.07, 0.24, 0.05, 2.1),
    S(8.4, 0.03, 0.21, 0.1, 2.0),
  ],
  wing: {
    root: [0, -0.42, 2.45],
    stations: [
      { s: 0, le: 0, c: 1.75, t: 0.15, cam: 0.02, tw: 2, dh: 7 },
      { s: 2.45, le: 0, c: 1.75, t: 0.15, cam: 0.02, tw: 2, dh: 7 },
      { s: 5.85, le: 0.25, c: 1.25, t: 0.12, cam: 0.02, tw: -1, dh: 7 },
      { s: 5.93, le: 0.3, c: 1.12, t: 0.09, cam: 0.01, tw: -1 },
    ],
    flaps: [
      [0.65, 1.5],
      [2.42, 3.55],
    ],
    flapCut: 0.75,
    aileron: [3.6, 5.78, 0.76],
  },
  limits: { aileron: [23, 17], elevator: [14, 4], rudder: 27, flapMax: 40 },
  htail: {
    root: [0, 0.22, 7.32],
    stabilator: true,
    elevatorCut: 0,
    stations: [
      { s: 0, le: 0, c: 0.88, t: 0.1 },
      { s: 2.0, le: 0, c: 0.88, t: 0.1 },
      { s: 2.07, le: 0.05, c: 0.78, t: 0.08 },
    ],
  },
  vtail: {
    root: [0, 0.3, 6.95],
    rudderCut: 0.58,
    stations: [
      { s: 0, le: 0, c: 1.75, t: 0.1 },
      { s: 1.36, le: 1.12, c: 0.64, t: 0.09 },
      { s: 1.42, le: 1.18, c: 0.56, t: 0.07 },
    ],
  },
  dorsal: {
    root: [0, 0.42, 5.6],
    stations: [
      { s: 0, le: 0, c: 1.5, t: 0.06 },
      { s: 0.28, le: 1.32, c: 0.3, t: 0.06 },
    ],
  },
  nacelle: { x: 1.95, y: -0.12, stations: pistonNacelle(1.1, 4.75) },
  prop: {
    z: 0.98,
    blades: 3,
    diameter: 1.93,
    chord: 0.15,
    pitch: 1.7,
    spinnerLen: 0.4,
    spinnerR: 0.17,
    counterRotating: true,
  },
  gear: {
    mainX: 1.69,
    mainZ: 3.0,
    mainTop: -0.48,
    noseZ: 0.9,
    noseTop: -0.4,
    groundY: -1.3,
    mainTire: 0.46,
    noseTire: 0.38,
    mainRetract: "inboard",
    noseRetract: "forward",
  },
  livery: (p) => {
    p.band(pts(0, -0.3, 3, -0.38, 6, -0.18, 8.5, 0.12), pts(0, -0.9, 8.5, -0.9), "#e3e7eb");
    p.band(
      pts(0.05, -0.02, 2.0, -0.04, 4.5, -0.02, 6.5, 0.14, 8.6, 0.26),
      pts(0.05, -0.16, 2.0, -0.2, 4.5, -0.18, 6.5, 0.0, 8.6, 0.12),
      "#13315c",
    );
    p.band(
      pts(0.3, -0.21, 2.0, -0.24, 4.5, -0.22, 6.5, -0.04, 8.6, 0.08),
      pts(0.3, -0.25, 2.0, -0.28, 4.5, -0.26, 6.5, -0.08, 8.6, 0.04),
      "#b23a48",
    );
    p.fill(pts(7.4, 0.8, 8.9, 0.98, 8.9, 1.2, 7.75, 1.06), "#13315c");
    p.glass(pts(1.88, 0.36, 2.45, 0.42, 2.62, 0.95, 1.8, 0.95), false);
    p.glass(pts(2.5, 0.22, 3.25, 0.22, 3.25, 0.72, 2.64, 0.72));
    p.glass(pts(3.35, 0.24, 3.95, 0.24, 3.95, 0.72, 3.35, 0.72));
    p.glass(pts(4.05, 0.26, 4.55, 0.3, 4.6, 0.66, 4.05, 0.72));
    p.door(2.46, -0.44, 3.3, 0.78, 0.05);
    p.door(4.0, -0.42, 4.75, 0.76, 0.05);
    p.door(0.75, -0.2, 1.55, 0.3, 0.05);
  },
  regAt: [6.35, 0.12, 0.2],
  cg: [0, -0.1, 3.0],
};

// ---------------------------------------------------------------------------------------------
// Beechcraft Baron G58
// ---------------------------------------------------------------------------------------------

const BARON: TwinSpec = {
  id: "be58",
  label: "Beechcraft Baron G58 (representative)",
  reg: "SR-B58",
  dims: { lengthM: 9.09, spanM: 11.53, heightM: 2.97 },
  fuselage: [
    S(0.0, 0.05, 0.04, -0.06, 2.0),
    S(0.2, 0.25, 0.17, -0.22, 2.3),
    S(0.6, 0.42, 0.28, -0.38, 2.6),
    S(1.3, 0.55, 0.36, -0.5, 2.8),
    S(1.95, 0.6, 0.4, -0.55, 3.0),
    S(2.25, 0.63, 0.58, -0.56, 3.0),
    S(2.65, 0.64, 0.78, -0.56, 3.2, 3.0),
    S(2.95, 0.64, 0.82, -0.56, 3.2, 3.0),
    S(4.4, 0.62, 0.82, -0.54, 3.2, 3.0),
    S(5.1, 0.53, 0.7, -0.46, 3.0, 2.8),
    S(6.0, 0.38, 0.53, -0.32, 2.6),
    S(7.2, 0.21, 0.36, -0.14, 2.4),
    S(8.3, 0.08, 0.26, 0.02, 2.2),
    S(8.6, 0.03, 0.23, 0.08, 2.0),
  ],
  wing: {
    root: [0, -0.4, 2.55],
    stations: [
      { s: 0, le: 0, c: 2.13, t: 0.15, cam: 0.015, tw: 3, dh: 6 },
      { s: 0.65, le: 0.03, c: 2.07, t: 0.15, cam: 0.015, tw: 3, dh: 6 },
      { s: 5.68, le: 0.42, c: 1.19, t: 0.12, cam: 0.015, tw: 0, dh: 6 },
      { s: 5.77, le: 0.48, c: 1.05, t: 0.09, cam: 0.01, tw: 0 },
    ],
    flaps: [
      [0.66, 1.6],
      [2.42, 3.3],
    ],
    flapCut: 0.74,
    aileron: [3.35, 5.6, 0.76],
  },
  limits: { aileron: [20, 20], elevator: [21, 15], rudder: 25, flapMax: 30 },
  htail: {
    root: [0, 0.26, 7.3],
    elevatorCut: 0.6,
    stations: [
      { s: 0, le: 0, c: 1.25, t: 0.09 },
      { s: 2.36, le: 0.3, c: 0.76, t: 0.085 },
      { s: 2.42, le: 0.36, c: 0.66, t: 0.07 },
    ],
  },
  vtail: {
    root: [0, 0.3, 7.05],
    rudderCut: 0.6,
    stations: [
      { s: 0, le: 0, c: 2.0, t: 0.1 },
      { s: 1.3, le: 1.24, c: 0.76, t: 0.09 },
      { s: 1.35, le: 1.3, c: 0.68, t: 0.07 },
    ],
  },
  dorsal: {
    root: [0, 0.42, 5.7],
    stations: [
      { s: 0, le: 0, c: 1.6, t: 0.06 },
      { s: 0.3, le: 1.45, c: 0.3, t: 0.06 },
    ],
  },
  nacelle: { x: 2.0, y: -0.1, stations: pistonNacelle(1.25, 5.05, 1.03) },
  prop: {
    z: 1.12,
    blades: 3,
    diameter: 1.98,
    chord: 0.15,
    pitch: 1.8,
    spinnerLen: 0.44,
    spinnerR: 0.18,
    counterRotating: false,
  },
  gear: {
    mainX: 1.72,
    mainZ: 3.25,
    mainTop: -0.45,
    noseZ: 0.95,
    noseTop: -0.4,
    groundY: -1.32,
    mainTire: 0.48,
    noseTire: 0.38,
    mainRetract: "inboard",
    noseRetract: "aft",
  },
  livery: (p) => {
    p.band(pts(0, -0.32, 3, -0.4, 6, -0.22, 8.7, 0.1), pts(0, -0.9, 8.7, -0.9), "#dde2e7");
    p.band(
      pts(0.1, 0.0, 2.2, -0.02, 4.6, 0.0, 6.6, 0.16, 8.8, 0.28),
      pts(0.1, -0.14, 2.2, -0.18, 4.6, -0.16, 6.6, 0.02, 8.8, 0.14),
      "#264653",
    );
    p.band(
      pts(0.3, 0.05, 2.2, 0.03, 4.6, 0.05, 6.6, 0.21, 8.8, 0.33),
      pts(0.3, 0.025, 2.2, 0.005, 4.6, 0.025, 6.6, 0.185, 8.8, 0.305),
      "#e9c46a",
    );
    p.fill(pts(7.5, 0.78, 9.2, 0.96, 9.2, 1.2, 7.85, 1.04), "#264653");
    p.glass(pts(2.08, 0.38, 2.6, 0.42, 2.8, 0.92, 2.0, 0.92), false);
    p.glass(pts(2.7, 0.22, 3.4, 0.22, 3.4, 0.72, 2.82, 0.72));
    p.glass(pts(3.5, 0.24, 4.1, 0.24, 4.1, 0.72, 3.5, 0.72));
    p.glass(pts(4.2, 0.26, 4.75, 0.3, 4.85, 0.66, 4.2, 0.72));
    p.door(2.66, -0.46, 3.45, 0.78, 0.05);
    p.door(4.15, -0.44, 4.95, 0.76, 0.05);
    p.door(0.8, -0.22, 1.65, 0.3, 0.05);
  },
  regAt: [6.6, 0.1, 0.2],
  cg: [0, -0.1, 3.1],
};

// ---------------------------------------------------------------------------------------------
// Beechcraft King Air 350 (turboprop, T-tail)
// ---------------------------------------------------------------------------------------------

const KINGAIR: TwinSpec = {
  id: "be350",
  label: "Beechcraft King Air 350 (representative)",
  reg: "SR-K35",
  dims: { lengthM: 14.22, spanM: 17.65, heightM: 4.37 },
  fuselage: [
    S(0.0, 0.05, 0.0, -0.12, 2.0),
    S(0.3, 0.26, 0.15, -0.3, 2.2),
    S(0.9, 0.48, 0.32, -0.5, 2.3),
    S(1.7, 0.66, 0.46, -0.66, 2.4),
    S(2.5, 0.76, 0.56, -0.74, 2.5),
    S(2.9, 0.79, 0.74, -0.76, 2.4),
    S(3.35, 0.8, 0.86, -0.77, 2.4),
    S(4.0, 0.8, 0.9, -0.78, 2.4),
    S(8.6, 0.8, 0.9, -0.78, 2.4),
    S(9.7, 0.72, 0.84, -0.68, 2.4),
    S(11.0, 0.5, 0.72, -0.4, 2.3),
    S(12.4, 0.28, 0.58, -0.08, 2.2),
    S(13.4, 0.12, 0.5, 0.15, 2.1),
    S(13.75, 0.05, 0.47, 0.25, 2.0),
  ],
  wing: {
    root: [0, -0.48, 5.0],
    stations: [
      { s: 0, le: 0, c: 2.45, t: 0.18, cam: 0.02, tw: 3, dh: 6 },
      { s: 0.8, le: 0.02, c: 2.38, t: 0.18, cam: 0.02, tw: 3, dh: 6 },
      { s: 3.5, le: 0.1, c: 2.0, t: 0.16, cam: 0.02, tw: 1.5, dh: 6 },
      { s: 8.6, le: 0.88, c: 1.02, t: 0.12, cam: 0.02, tw: -1, dh: 6 },
      { s: 8.72, le: 0.95, c: 0.95, t: 0.11, cam: 0.015, tw: -1, dh: 74 },
      { s: 9.2, le: 1.35, c: 0.52, t: 0.09, cam: 0, tw: 0 },
    ],
    flaps: [
      [0.82, 2.12],
      [3.12, 5.3],
    ],
    flapCut: 0.74,
    aileron: [5.45, 8.45, 0.76],
  },
  limits: { aileron: [16, 14], elevator: [16, 12], rudder: 25, flapMax: 35 },
  htail: {
    root: [0, 2.53, 12.86],
    elevatorCut: 0.6,
    stations: [
      { s: 0, le: 0, c: 1.38, t: 0.1 },
      { s: 2.74, le: 0.52, c: 0.82, t: 0.09 },
      { s: 2.8, le: 0.58, c: 0.72, t: 0.07 },
    ],
  },
  vtail: {
    root: [0, 0.55, 11.6],
    rudderCut: 0.62,
    stations: [
      { s: 0, le: 0, c: 2.62, t: 0.12 },
      { s: 2.0, le: 1.5, c: 1.08, t: 0.1 },
    ],
  },
  dorsal: {
    root: [0, 0.62, 10.0],
    stations: [
      { s: 0, le: 0, c: 2.0, t: 0.06 },
      { s: 0.4, le: 1.75, c: 0.4, t: 0.06 },
    ],
  },
  strakes: {
    root: [0.25, -0.12, 11.4],
    stations: [
      { s: 0, le: 0, c: 1.2, t: 0.06 },
      { s: 0.38, le: 0.5, c: 0.6, t: 0.06 },
    ],
  },
  nacelle: {
    x: 2.62,
    y: -0.3,
    turbine: true,
    stations: [
      S(2.7, 0.26, 0.24, -0.3, 2.2),
      S(2.85, 0.36, 0.32, -0.42, 2.4),
      S(3.4, 0.42, 0.4, -0.56, 2.6),
      S(4.8, 0.44, 0.42, -0.6, 2.7),
      S(6.5, 0.4, 0.36, -0.54, 2.6),
      S(7.8, 0.24, 0.22, -0.32, 2.4),
      S(8.6, 0.05, 0.05, -0.08, 2.0),
    ],
  },
  prop: {
    z: 2.55,
    blades: 4,
    diameter: 2.67,
    chord: 0.2,
    pitch: 2.6,
    spinnerLen: 0.6,
    spinnerR: 0.22,
    shape: "scimitar",
    counterRotating: false,
  },
  gear: {
    mainX: 2.62,
    mainZ: 6.35,
    mainTop: -0.82,
    noseZ: 1.8,
    noseTop: -0.62,
    groundY: -1.74,
    mainTire: 0.56,
    noseTire: 0.46,
    mainRetract: "forward",
    noseRetract: "aft",
    dualMains: true,
  },
  livery: (p) => {
    p.band(pts(0, -0.42, 4, -0.5, 9, -0.5, 12, -0.12, 14, 0.26), pts(0, -1.2, 14, -1.2), "#e5e8ec");
    p.band(
      pts(0.2, -0.16, 2.5, -0.2, 9.5, -0.2, 12.2, 0.2, 14.3, 0.5),
      pts(0.2, -0.3, 2.5, -0.36, 9.5, -0.36, 12.2, 0.04, 14.3, 0.34),
      "#1f2a44",
    );
    p.band(
      pts(0.6, -0.38, 2.5, -0.42, 9.5, -0.42, 12.2, -0.02, 14.3, 0.28),
      pts(0.6, -0.42, 2.5, -0.46, 9.5, -0.46, 12.2, -0.06, 14.3, 0.24),
      "#8d99ae",
    );
    p.fill(pts(12.0, 1.7, 14.4, 2.0, 14.4, 2.4, 12.4, 2.15), "#1f2a44");
    // cockpit
    p.glass(pts(2.5, 0.5, 3.12, 0.55, 3.3, 0.98, 2.4, 0.98), false);
    p.glass(pts(3.2, 0.36, 3.85, 0.36, 3.85, 0.72, 3.32, 0.74), 0.06);
    // cabin windows
    for (let i = 0; i < 8; i++) {
      const z = 4.45 + i * 0.62;
      p.window(z, 0.14, z + 0.36, 0.58, 0.13);
    }
    p.door(9.55, -0.62, 10.3, 0.82, 0.08);
    p.door(1.0, -0.3, 2.0, 0.3, 0.05);
  },
  regAt: [11.15, 0.2, 0.3],
  cg: [0, -0.2, 6.0],
  lightSize: 1.3,
};

export const buildPA34 = (kit: AirframeKit) => buildTwin(kit, SENECA);
export const buildBE58 = (kit: AirframeKit) => buildTwin(kit, BARON);
export const buildBE350 = (kit: AirframeKit) => buildTwin(kit, KINGAIR);
