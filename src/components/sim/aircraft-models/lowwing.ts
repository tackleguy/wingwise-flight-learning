/**
 * Low-wing single-engine piston aircraft: Piper PA-28-181 Archer, Diamond DA40, Beechcraft G36
 * Bonanza, Cirrus SR20 / SR22 — representative shapes from public dimensions, not manufacturer
 * drawings. Design coordinates: z aft from the cowl face, y up from the thrust line, metres.
 */
import { beaconDome, exhaust, inlet, oleo, tipLenses, wheelPant } from "./common";
import { blade, tube, type PlanStation, type Station, box } from "./geometry";
import type { AirframeKit, Limits, PropDef } from "./kit";
import type { LiveryPainter, P2 } from "./livery";
import type { V3 } from "./math";

interface Surf {
  root: V3;
  stations: PlanStation[];
}

export interface LowSingleSpec {
  id: string;
  label: string;
  reg: string;
  dims: { lengthM: number; spanM: number; heightM: number };
  fuselage: Station[];
  wing: Surf & { flap: [number, number, number]; aileron: [number, number, number] };
  limits: Limits;
  htail: Surf & { stabilator?: boolean; elevatorCut: number };
  vtail: Surf & { rudderCut: number };
  dorsal?: Surf;
  ventral?: Surf;
  prop: Omit<PropDef, "at"> & { z: number };
  inlets: [number, number, number, number][];
  gear: {
    retract: boolean;
    track: number;
    mainZ: number;
    noseZ: number;
    groundY: number;
    mainTire: number;
    noseTire: number;
    pants: boolean;
    /** Spring (composite / steel) main legs instead of oleo struts. */
    spring?: boolean;
    /** y where the nose leg meets the cowl. */
    noseTop: number;
  };
  landing: "nose" | "wing";
  livery: (p: LiveryPainter) => void;
  regAt: [number, number, number];
  cg: V3;
  /** Extra details (antennas, hatches, steps). */
  extras?: (kit: AirframeKit) => void;
}

const S = (
  z: number,
  hw: number,
  top: number,
  bot: number,
  nt = 2.5,
  nb = nt,
  m?: number,
): Station => ({ z, hw, top, bot, nt, nb, ...(m !== undefined ? { m } : {}) });

export function buildLowSingle(kit: AirframeKit, sp: LowSingleSpec) {
  const q = kit.q;
  kit.limits = sp.limits;
  const fus = kit.body(sp.fuselage, "livery", { tailCap: 0.02, noseCap: 0.015 });

  const wing = kit.surface(
    {
      root: sp.wing.root,
      mirror: true,
      stations: sp.wing.stations,
      movables: [
        {
          key: "flap",
          from: sp.wing.flap[0],
          to: sp.wing.flap[1],
          cut: sp.wing.flap[2],
          pivot: sp.wing.flap[2] + 0.02,
          drop: 0.035,
        },
        {
          key: "aileron",
          from: sp.wing.aileron[0],
          to: sp.wing.aileron[1],
          cut: sp.wing.aileron[2],
        },
      ],
    },
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
        : [{ key: "elevator", from: 0.1, to: hSemi - 0.03, cut: sp.htail.elevatorCut }],
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
  if (sp.ventral) kit.surface({ ...sp.ventral, roll: -90 }, "livery");

  // engine
  kit.prop({ ...sp.prop, at: [0, 0, sp.prop.z] });
  for (const [x, y, rx, ry] of sp.inlets) inlet(kit, [x, y, -0.004], rx, ry, q.seg);
  const fw = sp.fuselage.find((s) => s.z > 0.9) ?? sp.fuselage[3];
  if (fw) {
    exhaust(
      kit,
      [fw.hw * 0.4, fw.bot + 0.06, fw.z - 0.2],
      [fw.hw * 0.45, fw.bot - 0.05, fw.z],
      0.05,
    );
  }

  // gear
  const g = sp.gear;
  const mainC = (side: number): V3 => [side * g.track * 0.5, g.groundY + g.mainTire / 2, g.mainZ];
  const noseC: V3 = [0, g.groundY + g.noseTire / 2, g.noseZ];
  const sAttach = g.track * 0.5;
  const wingUnder = (side: number): V3 => {
    // lower surface near the main spar at the gear station
    let best = wing.point(sAttach, 0.3, -1);
    const target = mainC(1)[2];
    for (let xc = 0.05; xc <= 0.9; xc += 0.05) {
      const p = wing.point(sAttach, xc, -1);
      if (Math.abs(p[2] - target) < Math.abs(best[2] - target)) best = p;
    }
    return [side * best[0], best[1] + 0.03, best[2]];
  };
  const radial = Math.max(10, q.radial - 8);
  if (!g.retract) {
    kit.fixed((leg) => {
      for (const side of [1, -1]) {
        const c = mainC(side);
        const top = wingUnder(side);
        if (g.spring) {
          leg.add(
            tube(top, [c[0] - side * 0.06, c[1] + 0.1, c[2]], 0.12, 0.08, { ratio: 0.35, seg: 8 }),
            "paint",
          );
        } else {
          oleo(leg, top, [c[0], c[1] + 0.12, c[2]], 0.07, 8);
        }
        leg.wheel(c, g.mainTire, 0.15);
        if (g.pants) {
          wheelPant(leg, [c[0], c[1] + 0.02, c[2] - 0.02], {
            len: g.mainTire * 1.95,
            hw: 0.12,
            top: g.mainTire * 0.52,
            bot: -g.mainTire * 0.42,
            radial,
          });
        }
      }
      oleo(leg, [0, g.noseTop, noseC[2] - 0.05], [0, noseC[1] + 0.09, noseC[2]], 0.07, 8);
      leg.wheel(noseC, g.noseTire, 0.13);
      if (g.pants) {
        wheelPant(leg, [0, noseC[1] + 0.02, noseC[2] - 0.02], {
          len: g.noseTire * 1.9,
          hw: 0.1,
          top: g.noseTire * 0.52,
          bot: -g.noseTire * 0.4,
          radial,
        });
      }
    });
  } else {
    for (const side of [1, -1]) {
      const c = mainC(side);
      const top = wingUnder(side);
      kit.gearLeg(top, [0, 0, 1], side * -88, (leg) => {
        oleo(leg, top, [c[0], c[1] + 0.12, c[2]], 0.08, 8);
        leg.wheel(c, g.mainTire, 0.16);
        // strut door, flush with the wing when retracted
        leg.add(
          box(
            [c[0] + side * 0.12, (top[1] + c[1]) / 2 + 0.05, c[2]],
            [0.012, top[1] - c[1] - 0.05, 0.3],
          ),
          "paint",
        );
      });
    }
    const pivot: V3 = [0, g.noseTop, noseC[2]];
    kit.gearLeg(pivot, [1, 0, 0], -90, (leg) => {
      oleo(leg, pivot, [0, noseC[1] + 0.09, noseC[2]], 0.07, 8);
      leg.wheel(noseC, g.noseTire, 0.13);
    });
  }

  // lights
  const tip = wing.point(semi, 0.2, 0);
  const tipL: V3 = [-tip[0] - 0.02, tip[1], tip[2]];
  const tipR: V3 = [tip[0] + 0.02, tip[1], tip[2]];
  tipLenses(kit, tipL, tipR, 0.035);
  const finTop = fin.point(finTopS, 0.4, 0);
  const tee = sp.htail.root[1] > sp.vtail.root[1] + 0.3;
  const beacon: V3 = tee ? [0, sp.htail.root[1] + 0.06, sp.htail.root[2] + 0.2] : finTop;
  beaconDome(kit, [beacon[0], beacon[1] + 0.005, beacon[2]], 0.045);
  let lamp: V3;
  if (sp.landing === "nose") lamp = [0, -0.16, -0.01];
  else {
    const w = wing.point(semi * 0.4, 0.01, 0);
    lamp = [-w[0], w[1], w[2] - 0.02];
  }
  kit.lights({
    navL: tipL,
    navR: tipR,
    beacons: [[0, beacon[1] + 0.05, beacon[2]]],
    strobes: [
      [tipL[0], tipL[1], tipL[2] + 0.15],
      [tipR[0], tipR[1], tipR[2] + 0.15],
    ],
    landing: { pos: lamp, dir: [0, -0.07, -1] },
    size: 1,
  });

  // antennas
  const roofZ = sp.fuselage.reduce((a, s) => (s.top > a.top ? s : a)).z;
  const roofY = Math.max(...sp.fuselage.map((s) => s.top));
  kit.add(blade([0, roofY - 0.01, roofZ + 0.5], 0.2, 0.09, 0.08), "dark");
  kit.add(blade([0, roofY - 0.04, roofZ + 1.0], 0.16, 0.08, 0.06), "dark");
  sp.extras?.(kit);

  kit.livery(sp.livery);
  kit.registration(sp.reg, fus, sp.regAt[0], sp.regAt[1], sp.regAt[2], "#1b1f24");
  kit.setCg(sp.cg);
  return { id: sp.id, label: sp.label, dims: sp.dims };
}

const pts = (...a: number[]): P2[] => {
  const out: P2[] = [];
  for (let i = 0; i < a.length - 1; i += 2) out.push([a[i] ?? 0, a[i + 1] ?? 0]);
  return out;
};

// ---------------------------------------------------------------------------------------------
// Piper PA-28-181 Archer
// ---------------------------------------------------------------------------------------------

export const PA28: LowSingleSpec = {
  id: "pa28",
  label: "Piper PA-28-181 Archer (representative)",
  reg: "SR-P28",
  dims: { lengthM: 7.25, spanM: 10.8, heightM: 2.22 },
  fuselage: [
    S(0.0, 0.24, 0.2, -0.25, 2.3),
    S(0.1, 0.33, 0.26, -0.34, 2.5),
    S(0.4, 0.43, 0.3, -0.44, 2.8),
    S(0.95, 0.52, 0.33, -0.5, 3.0),
    S(1.35, 0.57, 0.35, -0.52, 3.0),
    S(1.55, 0.59, 0.46, -0.53, 3.0),
    S(1.9, 0.6, 0.68, -0.53, 3.2, 3.0),
    S(2.2, 0.6, 0.76, -0.53, 3.4, 3.0),
    S(3.1, 0.58, 0.76, -0.52, 3.4, 3.0),
    S(3.7, 0.52, 0.62, -0.47, 3.0, 2.8),
    S(4.4, 0.4, 0.44, -0.38, 2.8),
    S(5.4, 0.25, 0.32, -0.22, 2.5),
    S(6.3, 0.13, 0.24, -0.06, 2.3),
    S(6.8, 0.04, 0.2, 0.05, 2.1),
  ],
  wing: {
    root: [0, -0.45, 1.6],
    stations: [
      { s: 0, le: 0, c: 1.68, t: 0.15, cam: 0.02, tw: 2, dh: 7 },
      { s: 2.45, le: 0, c: 1.68, t: 0.15, cam: 0.02, tw: 2, dh: 7 },
      { s: 5.3, le: 0.24, c: 1.18, t: 0.12, cam: 0.02, tw: -1, dh: 7 },
      { s: 5.4, le: 0.3, c: 1.05, t: 0.09, cam: 0.01, tw: -1 },
    ],
    flap: [0.62, 2.9, 0.76],
    aileron: [2.95, 5.22, 0.76],
  },
  limits: { aileron: [25, 13], elevator: [18, 3], rudder: 27, flapMax: 40 },
  htail: {
    root: [0, 0.1, 6.0],
    stabilator: true,
    elevatorCut: 0,
    stations: [
      { s: 0, le: 0, c: 0.78, t: 0.1 },
      { s: 1.9, le: 0, c: 0.78, t: 0.1 },
      { s: 1.96, le: 0.04, c: 0.7, t: 0.08 },
    ],
  },
  vtail: {
    root: [0, 0.2, 5.52],
    rudderCut: 0.56,
    stations: [
      { s: 0, le: 0, c: 1.38, t: 0.09 },
      { s: 0.78, le: 0.72, c: 0.64, t: 0.085 },
      { s: 0.82, le: 0.78, c: 0.56, t: 0.07 },
    ],
  },
  dorsal: {
    root: [0, 0.27, 4.7],
    stations: [
      { s: 0, le: 0, c: 0.95, t: 0.06 },
      { s: 0.18, le: 0.8, c: 0.2, t: 0.06 },
    ],
  },
  prop: {
    z: -0.125,
    blades: 2,
    diameter: 1.93,
    dir: -1,
    chord: 0.15,
    pitch: 1.5,
    spinnerLen: 0.38,
    spinnerR: 0.17,
    bluntness: 0.75,
  },
  inlets: [
    [0.17, 0.0, 0.08, 0.08],
    [-0.17, 0.0, 0.08, 0.08],
  ],
  gear: {
    retract: false,
    track: 3.05,
    mainZ: 2.35,
    noseZ: 0.42,
    groundY: -1.2,
    mainTire: 0.44,
    noseTire: 0.38,
    pants: true,
    noseTop: -0.4,
  },
  landing: "nose",
  livery: (p) => {
    p.band(pts(0, -0.32, 2.5, -0.34, 5, -0.2, 6.9, 0.02), pts(0, -0.9, 6.9, -0.9), "#e7eaee");
    p.band(
      pts(-0.1, 0.04, 1.5, 0.05, 3.4, 0.08, 5.0, 0.14, 6.9, 0.2),
      pts(-0.1, -0.1, 1.5, -0.1, 3.4, -0.08, 5.0, 0.0, 6.9, 0.07),
      "#203a72",
    );
    p.band(
      pts(-0.1, -0.12, 1.5, -0.12, 3.4, -0.1, 5.0, -0.02, 6.9, 0.05),
      pts(-0.1, -0.16, 1.5, -0.16, 3.4, -0.14, 5.0, -0.06, 6.9, 0.01),
      "#c0392b",
    );
    p.fill(pts(6.0, 0.55, 7.2, 0.62, 7.2, 0.78, 6.15, 0.7), "#203a72");
    p.glass(pts(1.4, 0.34, 1.98, 0.38, 2.12, 0.86, 1.3, 0.86), false);
    p.glass(pts(2.02, 0.2, 2.78, 0.2, 2.78, 0.66, 2.14, 0.66));
    p.glass(pts(2.86, 0.22, 3.4, 0.26, 3.5, 0.62, 2.86, 0.66));
    p.glass(pts(3.58, 0.3, 3.86, 0.34, 3.62, 0.58));
    p.door(2.0, -0.45, 2.82, 0.74, 0.05);
    p.line(pts(1.33, -0.52, 1.33, 0.36), 0.01);
  },
  regAt: [4.75, 0.06, 0.2],
  cg: [0, -0.05, 2.1],
};

// ---------------------------------------------------------------------------------------------
// Diamond DA40 (T-tail, slender composite)
// ---------------------------------------------------------------------------------------------

export const DA40: LowSingleSpec = {
  id: "da40",
  label: "Diamond DA40 (representative)",
  reg: "SR-D40",
  dims: { lengthM: 8.06, spanM: 11.94, heightM: 1.97 },
  fuselage: [
    S(0.0, 0.21, 0.17, -0.23, 2.3),
    S(0.12, 0.3, 0.23, -0.31, 2.4),
    S(0.5, 0.4, 0.27, -0.39, 2.5),
    S(1.0, 0.48, 0.29, -0.44, 2.6),
    S(1.38, 0.53, 0.31, -0.46, 2.6),
    S(1.7, 0.56, 0.44, -0.47, 2.4, 2.6),
    S(2.1, 0.58, 0.57, -0.47, 2.2, 2.6),
    S(2.6, 0.58, 0.62, -0.46, 2.2, 2.6),
    S(3.05, 0.55, 0.57, -0.44, 2.2, 2.5),
    S(3.55, 0.46, 0.43, -0.36, 2.2, 2.4),
    S(4.2, 0.3, 0.28, -0.24, 2.2),
    S(5.2, 0.17, 0.18, -0.12, 2.1),
    S(6.4, 0.11, 0.15, -0.05, 2.1),
    S(7.4, 0.07, 0.13, 0.0, 2.1),
    S(7.62, 0.03, 0.11, 0.04, 2.0),
  ],
  wing: {
    root: [0, -0.4, 1.78],
    stations: [
      { s: 0, le: 0, c: 1.45, t: 0.15, cam: 0.02, tw: 1, dh: 5 },
      { s: 0.6, le: 0.01, c: 1.42, t: 0.15, cam: 0.02, tw: 1, dh: 5 },
      { s: 5.7, le: 0.3, c: 0.84, t: 0.13, cam: 0.02, tw: -1, dh: 5 },
      { s: 5.8, le: 0.34, c: 0.79, t: 0.12, cam: 0.015, tw: -1, dh: 50 },
      { s: 5.97, le: 0.46, c: 0.56, t: 0.08, cam: 0.0, tw: 0 },
    ],
    flap: [0.6, 2.95, 0.76],
    aileron: [3.0, 5.6, 0.76],
  },
  limits: { aileron: [23, 17], elevator: [16, 13], rudder: 30, flapMax: 42 },
  htail: {
    root: [0, 0.8, 6.86],
    elevatorCut: 0.55,
    stations: [
      { s: 0, le: 0, c: 0.86, t: 0.1 },
      { s: 1.55, le: 0.22, c: 0.58, t: 0.09 },
      { s: 1.6, le: 0.26, c: 0.52, t: 0.07 },
    ],
  },
  vtail: {
    root: [0, 0.1, 6.25],
    rudderCut: 0.6,
    stations: [
      { s: 0, le: 0, c: 1.4, t: 0.12 },
      { s: 0.7, le: 0.5, c: 0.95, t: 0.11 },
      { s: 0.74, le: 0.54, c: 0.9, t: 0.1 },
    ],
  },
  ventral: {
    root: [0, -0.02, 6.7],
    stations: [
      { s: 0, le: 0, c: 0.85, t: 0.08 },
      { s: 0.22, le: 0.32, c: 0.48, t: 0.07 },
    ],
  },
  dorsal: {
    root: [0, 0.14, 5.6],
    stations: [
      { s: 0, le: 0, c: 0.8, t: 0.06 },
      { s: 0.12, le: 0.65, c: 0.2, t: 0.06 },
    ],
  },
  prop: {
    z: -0.12,
    blades: 3,
    diameter: 1.88,
    dir: -1,
    chord: 0.14,
    pitch: 1.55,
    spinnerLen: 0.4,
    spinnerR: 0.17,
    bluntness: 0.7,
  },
  inlets: [
    [0.15, 0.0, 0.065, 0.065],
    [-0.15, 0.0, 0.065, 0.065],
  ],
  gear: {
    retract: false,
    track: 2.97,
    mainZ: 2.5,
    noseZ: 0.78,
    groundY: -1.16,
    mainTire: 0.42,
    noseTire: 0.36,
    pants: true,
    spring: true,
    noseTop: -0.38,
  },
  landing: "wing",
  livery: (p) => {
    p.band(
      pts(-0.1, -0.06, 1.6, -0.1, 3.5, -0.08, 5.0, 0.0, 7.7, 0.07),
      pts(-0.1, -0.15, 1.6, -0.2, 3.5, -0.19, 5.0, -0.08, 7.7, 0.0),
      "#2b4c7e",
    );
    p.band(
      pts(3.2, 0.1, 4.6, 0.12, 6.0, 0.12),
      pts(3.2, 0.07, 4.6, 0.08, 6.0, 0.09),
      "#9aa7b8",
      false,
    );
    p.fill(pts(6.3, 0.5, 7.8, 0.6, 7.8, 0.82, 6.62, 0.82), "#2b4c7e");
    // bubble canopy (front, tip-up) and rear window
    p.glass(pts(1.42, 0.3, 2.78, 0.18, 2.78, 0.9, 1.3, 0.9), 0.03);
    p.glass(pts(2.86, 0.18, 3.4, 0.2, 3.62, 0.48, 3.62, 0.9, 2.86, 0.9), 0.06);
    p.line(pts(1.38, -0.46, 1.38, 0.31), 0.01);
    p.door(2.86, -0.2, 3.5, 0.17, 0.04);
  },
  regAt: [5.0, 0.03, 0.17],
  cg: [0, -0.05, 2.2],
};

// ---------------------------------------------------------------------------------------------
// Beechcraft G36 Bonanza (retractable, conventional tail)
// ---------------------------------------------------------------------------------------------

export const BE36: LowSingleSpec = {
  id: "be36",
  label: "Beechcraft G36 Bonanza (representative)",
  reg: "SR-B36",
  dims: { lengthM: 8.38, spanM: 10.21, heightM: 2.62 },
  fuselage: [
    S(0.0, 0.22, 0.2, -0.26, 2.2),
    S(0.12, 0.32, 0.27, -0.35, 2.4),
    S(0.5, 0.45, 0.34, -0.46, 2.7),
    S(1.1, 0.55, 0.38, -0.53, 3.0),
    S(1.55, 0.6, 0.4, -0.55, 3.0),
    S(1.8, 0.62, 0.55, -0.56, 3.0),
    S(2.2, 0.63, 0.74, -0.56, 3.0),
    S(2.5, 0.63, 0.8, -0.56, 3.2, 3.0),
    S(3.9, 0.62, 0.8, -0.54, 3.2, 3.0),
    S(4.6, 0.53, 0.68, -0.46, 3.0, 2.8),
    S(5.4, 0.38, 0.52, -0.33, 2.6),
    S(6.5, 0.22, 0.36, -0.16, 2.4),
    S(7.4, 0.1, 0.27, -0.02, 2.2),
    S(7.7, 0.04, 0.24, 0.06, 2.0),
  ],
  wing: {
    root: [0, -0.38, 1.9],
    stations: [
      { s: 0, le: 0, c: 2.13, t: 0.165, cam: 0.015, tw: 3, dh: 6 },
      { s: 0.65, le: 0.03, c: 2.07, t: 0.16, cam: 0.015, tw: 3, dh: 6 },
      { s: 5.02, le: 0.38, c: 1.16, t: 0.12, cam: 0.015, tw: 0, dh: 6 },
      { s: 5.11, le: 0.45, c: 1.02, t: 0.09, cam: 0.01, tw: 0 },
    ],
    flap: [0.66, 2.75, 0.74],
    aileron: [2.8, 4.95, 0.76],
  },
  limits: { aileron: [20, 20], elevator: [23, 17], rudder: 25, flapMax: 30 },
  htail: {
    root: [0, 0.22, 6.5],
    elevatorCut: 0.6,
    stations: [
      { s: 0, le: 0, c: 1.2, t: 0.09, dh: 4 },
      { s: 1.8, le: 0.28, c: 0.72, t: 0.085, dh: 4 },
      { s: 1.85, le: 0.33, c: 0.64, t: 0.07 },
    ],
  },
  vtail: {
    root: [0, 0.3, 6.25],
    rudderCut: 0.6,
    stations: [
      { s: 0, le: 0, c: 1.66, t: 0.1 },
      { s: 1.02, le: 0.95, c: 0.76, t: 0.09 },
      { s: 1.07, le: 1.02, c: 0.66, t: 0.07 },
    ],
  },
  dorsal: {
    root: [0, 0.4, 5.15],
    stations: [
      { s: 0, le: 0, c: 1.35, t: 0.06 },
      { s: 0.24, le: 1.2, c: 0.3, t: 0.06 },
    ],
  },
  prop: {
    z: -0.14,
    blades: 3,
    diameter: 2.03,
    dir: -1,
    chord: 0.16,
    pitch: 1.9,
    spinnerLen: 0.46,
    spinnerR: 0.19,
    bluntness: 0.75,
  },
  inlets: [
    [0.17, 0.02, 0.075, 0.07],
    [-0.17, 0.02, 0.075, 0.07],
  ],
  gear: {
    retract: true,
    track: 2.92,
    mainZ: 2.6,
    noseZ: 0.55,
    groundY: -1.26,
    mainTire: 0.48,
    noseTire: 0.38,
    pants: false,
    noseTop: -0.45,
  },
  landing: "wing",
  livery: (p) => {
    p.band(pts(0, -0.36, 3, -0.4, 5.5, -0.26, 7.8, 0.04), pts(0, -0.9, 7.8, -0.9), "#dfe3e8");
    p.band(
      pts(-0.1, 0.0, 1.8, -0.02, 4.0, 0.0, 6.0, 0.12, 7.9, 0.22),
      pts(-0.1, -0.16, 1.8, -0.2, 4.0, -0.18, 6.0, -0.04, 7.9, 0.08),
      "#7a1f2b",
    );
    p.band(
      pts(-0.1, 0.06, 1.8, 0.04, 4.0, 0.06, 6.0, 0.18, 7.9, 0.28),
      pts(-0.1, 0.025, 1.8, 0.005, 4.0, 0.025, 6.0, 0.145, 7.9, 0.245),
      "#c9a227",
    );
    p.fill(pts(6.45, 0.7, 8.1, 0.86, 8.1, 1.06, 6.7, 0.92), "#7a1f2b");
    p.glass(pts(1.6, 0.38, 2.2, 0.4, 2.36, 0.9, 1.5, 0.9), false);
    p.glass(pts(2.26, 0.22, 2.95, 0.22, 2.95, 0.7, 2.38, 0.7));
    p.glass(pts(3.05, 0.24, 3.65, 0.24, 3.65, 0.7, 3.05, 0.7));
    p.glass(pts(3.75, 0.25, 4.3, 0.28, 4.4, 0.64, 3.75, 0.7));
    p.door(2.22, -0.46, 3.0, 0.77, 0.05);
    p.door(3.72, -0.44, 4.45, 0.75, 0.05);
    p.line(pts(1.53, -0.55, 1.53, 0.4), 0.01);
  },
  regAt: [5.65, 0.1, 0.2],
  cg: [0, -0.05, 2.45],
};

// ---------------------------------------------------------------------------------------------
// Cirrus SR20 / SR22 (composite, fixed gear, parachute hatch)
// ---------------------------------------------------------------------------------------------

function cirrus(id: "sr20" | "sr22"): LowSingleSpec {
  const sr22 = id === "sr22";
  const main = sr22 ? "#3d4651" : "#2c6e9b";
  const accent = sr22 ? "#d9822b" : "#9fb6c9";
  return {
    id,
    label: sr22 ? "Cirrus SR22 (representative)" : "Cirrus SR20 (representative)",
    reg: sr22 ? "SR-S22" : "SR-S20",
    dims: { lengthM: 7.92, spanM: 11.68, heightM: 2.71 },
    fuselage: [
      S(0.0, 0.21, 0.19, -0.25, 2.2),
      S(0.12, 0.31, 0.27, -0.34, 2.4),
      S(0.55, 0.45, 0.33, -0.45, 2.6),
      S(1.1, 0.55, 0.38, -0.52, 2.8),
      S(1.45, 0.59, 0.4, -0.54, 2.8),
      S(1.78, 0.62, 0.6, -0.56, 2.8),
      S(2.2, 0.63, 0.82, -0.56, 2.8),
      S(2.6, 0.63, 0.88, -0.55, 2.8),
      S(3.4, 0.61, 0.86, -0.52, 2.8),
      S(4.0, 0.52, 0.74, -0.44, 2.6),
      S(4.8, 0.38, 0.55, -0.3, 2.4),
      S(5.9, 0.22, 0.38, -0.12, 2.3),
      S(6.9, 0.11, 0.28, 0.02, 2.2),
      S(7.25, 0.04, 0.25, 0.08, 2.0),
    ],
    wing: {
      root: [0, -0.4, 1.95],
      stations: [
        { s: 0, le: 0, c: 1.6, t: 0.15, cam: 0.02, tw: 2, dh: 4.5 },
        { s: 0.64, le: 0.02, c: 1.55, t: 0.15, cam: 0.02, tw: 2, dh: 4.5 },
        { s: 3.38, le: 0.13, c: 1.12, t: 0.14, cam: 0.02, tw: 0.5, dh: 4.5 },
        { s: 3.42, le: 0.08, c: 1.18, t: 0.145, cam: 0.025, tw: 0.5, dh: 4.5 },
        { s: 5.75, le: 0.2, c: 0.8, t: 0.12, cam: 0.02, tw: -1, dh: 4.5 },
        { s: 5.84, le: 0.25, c: 0.7, t: 0.09, cam: 0.01, tw: -1 },
      ],
      flap: [0.64, 3.2, 0.76],
      aileron: [3.45, 5.7, 0.77],
    },
    limits: { aileron: [13, 10], elevator: [25, 20], rudder: 20, flapMax: 32 },
    htail: {
      root: [0, 0.28, 6.15],
      elevatorCut: 0.6,
      stations: [
        { s: 0, le: 0, c: 1.02, t: 0.1, dh: 2 },
        { s: 1.93, le: 0.2, c: 0.66, t: 0.09, dh: 2 },
        { s: 1.98, le: 0.24, c: 0.58, t: 0.07 },
      ],
    },
    vtail: {
      root: [0, 0.3, 5.95],
      rudderCut: 0.6,
      stations: [
        { s: 0, le: 0, c: 1.55, t: 0.1 },
        { s: 1.16, le: 0.9, c: 0.68, t: 0.09 },
        { s: 1.21, le: 0.95, c: 0.6, t: 0.07 },
      ],
    },
    dorsal: {
      root: [0, 0.45, 4.55],
      stations: [
        { s: 0, le: 0, c: 1.6, t: 0.07 },
        { s: 0.34, le: 1.44, c: 0.36, t: 0.07 },
      ],
    },
    prop: {
      z: -0.14,
      blades: 3,
      diameter: sr22 ? 1.98 : 1.88,
      dir: -1,
      chord: 0.15,
      pitch: sr22 ? 2.0 : 1.75,
      spinnerLen: 0.46,
      spinnerR: 0.19,
      bluntness: 0.7,
    },
    inlets: [
      [0.16, -0.02, 0.07, 0.06],
      [-0.16, -0.02, 0.07, 0.06],
    ],
    gear: {
      retract: false,
      track: 3.0,
      mainZ: 2.72,
      noseZ: 0.7,
      groundY: -1.2,
      mainTire: 0.42,
      noseTire: 0.36,
      pants: true,
      spring: true,
      noseTop: -0.4,
    },
    landing: "wing",
    livery: (p) => {
      p.band(
        pts(-0.1, -0.08, 1.6, -0.12, 3.6, -0.1, 5.4, 0.04, 7.4, 0.2),
        pts(-0.1, -0.24, 1.6, -0.28, 3.6, -0.28, 5.4, -0.12, 7.4, 0.08),
        main,
        true,
      );
      p.band(
        pts(1.0, -0.04, 3.6, -0.05, 5.4, 0.09, 7.4, 0.25),
        pts(1.0, -0.07, 3.6, -0.08, 5.4, 0.06, 7.4, 0.22),
        accent,
        true,
      );
      p.fill(pts(6.2, 0.75, 7.6, 0.9, 7.6, 1.22, 6.55, 1.1), main);
      p.glass(pts(1.5, 0.38, 2.12, 0.42, 2.32, 0.96, 1.4, 0.96), false);
      p.glass(pts(2.2, 0.24, 3.15, 0.24, 3.05, 0.8, 2.36, 0.82), 0.08);
      p.glass(pts(3.25, 0.28, 3.85, 0.36, 3.75, 0.72, 3.25, 0.8), 0.08);
      p.door(2.16, -0.44, 3.2, 0.86, 0.08);
      p.line(pts(1.43, -0.54, 1.43, 0.4), 0.01);
      // parachute (CAPS) hatch cover behind the cabin, on top
      p.line(
        pts(3.98, 0.69, 3.98, 0.95, 4.5, 0.95, 4.5, 0.61, 3.98, 0.69),
        0.014,
        "rgba(30,30,30,0.55)",
      );
    },
    regAt: [5.55, 0.1, 0.2],
    cg: [0, -0.05, 2.45],
  };
}

export const SR20 = cirrus("sr20");
export const SR22 = cirrus("sr22");

export const buildPA28 = (kit: AirframeKit) => buildLowSingle(kit, PA28);
export const buildDA40 = (kit: AirframeKit) => buildLowSingle(kit, DA40);
export const buildBE36 = (kit: AirframeKit) => buildLowSingle(kit, BE36);
export const buildSR20 = (kit: AirframeKit) => buildLowSingle(kit, SR20);
export const buildSR22 = (kit: AirframeKit) => buildLowSingle(kit, SR22);
