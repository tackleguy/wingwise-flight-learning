/**
 * High-wing trainers: Cessna 152 / 172 style (strut-braced, tricycle, wheel pants) and a
 * vintage Piper J-3 Cub style tail-dragger. Representative shapes built from public dimensions;
 * not manufacturer drawings.
 */
import { beaconDome, exhaust, inlet, oleo, tipLenses, wheelPant } from "./common";
import { blade, tube, type Station } from "./geometry";
import { AirframeKit } from "./kit";
import type { LiveryPainter } from "./livery";
import type { V3 } from "./math";
import { cylinderHead } from "./parts";

interface CessnaVariant {
  id: "c152" | "c172";
  label: string;
  reg: string;
  /** longitudinal / width / height scale vs the 172 tables */
  zs: number;
  ws: number;
  hs: number;
  semiSpan: number;
  rootChord: number;
  tipChord: number;
  taperFrom: number;
  propDia: number;
  track: number;
  mainZ: number;
  noseZ: number;
  flapMax: number;
  hstabSemi: number;
  finH: number;
  stripe: string;
  accent: string;
}

const C172: CessnaVariant = {
  id: "c172",
  label: "Cessna 172S Skyhawk (representative)",
  reg: "SR-172",
  zs: 1,
  ws: 1,
  hs: 1,
  semiSpan: 5.52,
  rootChord: 1.63,
  tipChord: 1.13,
  taperFrom: 2.55,
  propDia: 1.93,
  track: 2.5,
  mainZ: 2.82,
  noseZ: 1.12,
  flapMax: 30,
  hstabSemi: 1.73,
  finH: 1.29,
  stripe: "#1d3557",
  accent: "#2a9d8f",
};

const C152: CessnaVariant = {
  id: "c152",
  label: "Cessna 152 (representative)",
  reg: "SR-152",
  zs: 0.885,
  ws: 0.93,
  hs: 0.95,
  semiSpan: 5.09,
  rootChord: 1.62,
  tipChord: 1.2,
  taperFrom: 2.4,
  propDia: 1.75,
  track: 2.31,
  mainZ: 2.58,
  noseZ: 1.11,
  flapMax: 30,
  hstabSemi: 1.52,
  finH: 1.22,
  stripe: "#9b2226",
  accent: "#e9a23b",
};

export function buildC152(kit: AirframeKit) {
  return buildCessna(kit, C152);
}
export function buildC172(kit: AirframeKit) {
  return buildCessna(kit, C172);
}

function buildCessna(kit: AirframeKit, v: CessnaVariant) {
  const { zs, ws, hs } = v;
  const q = kit.q;
  const Z = (z: number) => z * zs;
  const W = (x: number) => x * ws;
  const H = (y: number) => y * hs;
  kit.limits = { aileron: [20, 15], elevator: [28, 23], rudder: 17, flapMax: v.flapMax };

  // --- fuselage ---------------------------------------------------------------------------
  const S = (
    z: number,
    hw: number,
    top: number,
    bot: number,
    nt = 2.5,
    nb = nt,
    m?: number,
  ): Station => ({
    z: Z(z),
    hw: W(hw),
    top: H(top),
    bot: H(bot),
    nt,
    nb,
    ...(m !== undefined ? { m } : {}),
  });
  // the 152 cabin is shorter: compress the aft cabin a little more
  const cabinEnd = v.id === "c152" ? 3.45 : 3.7;
  const fus = kit.body(
    [
      S(0.0, 0.25, 0.22, -0.27, 2.3),
      S(0.1, 0.35, 0.29, -0.37, 2.5, 2.4),
      S(0.4, 0.44, 0.33, -0.47, 2.8, 2.6),
      S(0.9, 0.5, 0.35, -0.54, 3.0, 2.8),
      S(1.38, 0.54, 0.37, -0.57, 3.0),
      S(1.62, 0.56, 0.52, -0.58, 3.0, 3.2),
      S(1.88, 0.57, 0.66, -0.58, 3.2),
      S(2.12, 0.57, 0.77, -0.58, 3.6, 3.2),
      S(3.0, 0.56, 0.78, -0.56, 3.6, 3.0),
      S(cabinEnd, 0.52, 0.78, -0.48, 3.2, 2.8),
      S(4.3, 0.42, 0.58, -0.38, 2.6),
      S(5.2, 0.3, 0.44, -0.25, 2.4, 2.4, 0.45),
      S(6.3, 0.18, 0.31, -0.1, 2.3),
      S(7.2, 0.09, 0.24, 0.02, 2.2),
      S(7.48, 0.03, 0.21, 0.08, 2.0),
    ],
    "livery",
    { tailCap: 0.02, noseCap: 0.015 },
  );

  // --- wing (high, strut braced) -------------------------------------------------------------
  const rootLE: V3 = [0, H(0.84), Z(2.1)];
  const c0 = v.rootChord;
  const c1 = v.tipChord;
  const sp = v.semiSpan;
  const wing = kit.surface(
    {
      root: rootLE,
      mirror: true,
      stations: [
        { s: 0, le: 0, c: c0, t: 0.12, tw: 1.5, cam: 0.02, dh: 1.7 },
        { s: v.taperFrom, le: 0, c: c0, t: 0.12, tw: 1.0, cam: 0.02, dh: 1.7 },
        { s: sp - 0.12, le: (c0 - c1) * 0.25, c: c1, t: 0.12, tw: -1.5, cam: 0.02, dh: 1.7 },
        { s: sp, le: (c0 - c1) * 0.25 + 0.06, c: c1 - 0.12, t: 0.085, tw: -1.5, cam: 0.01 },
      ],
      movables: [
        { key: "flap", from: W(0.58), to: sp * 0.53, cut: 0.69, pivot: 0.72, drop: 0.06 },
        { key: "aileron", from: sp * 0.54, to: sp - 0.22, cut: 0.76 },
      ],
    },
    "paint",
  );

  // struts: fuselage lower longeron → wing front spar region
  for (const side of [1, -1]) {
    const w = wing.point(sp * 0.46, 0.27, -1);
    const a: V3 = [side * W(0.5), H(-0.4), Z(2.62)];
    const b: V3 = [side * w[0], w[1] - 0.01, w[2]];
    kit.add(tube(a, b, 0.11, 0.09, { ratio: 0.32, seg: 8 }), "paint");
    // fairing cuff at the wing end
    kit.add(
      tube(b, [b[0] * 0.98, b[1] + 0.04, b[2]], 0.13, 0.13, { ratio: 0.35, seg: 8 }),
      "paint",
    );
    // step
    kit.add(
      tube([side * W(0.52), H(-0.48), Z(2.3)], [side * W(0.72), H(-0.62), Z(2.3)], 0.025, 0.025, {
        seg: 5,
      }),
      "gear",
    );
  }

  // --- tail ------------------------------------------------------------------------------------
  kit.surface(
    {
      root: [0, H(0.13), Z(6.48)],
      mirror: true,
      stations: [
        { s: 0, le: 0, c: 1.25 * zs, t: 0.09 },
        { s: v.hstabSemi - 0.06, le: 0.22 * zs, c: 0.84 * zs, t: 0.085 },
        { s: v.hstabSemi, le: 0.28 * zs, c: 0.74 * zs, t: 0.07 },
      ],
      movables: [{ key: "elevator", from: 0.13, to: v.hstabSemi - 0.03, cut: 0.56 }],
    },
    "paint",
  );
  const finRoot: V3 = [0, H(0.18), Z(6.16)];
  const fin = kit.surface(
    {
      root: finRoot,
      roll: 90,
      stations: [
        { s: 0, le: 0, c: 1.72 * zs, t: 0.1 },
        { s: v.finH - 0.06, le: 0.95 * zs, c: 0.8 * zs, t: 0.09 },
        { s: v.finH, le: 1.04 * zs, c: 0.66 * zs, t: 0.07 },
      ],
      movables: [{ key: "rudder", from: 0, to: v.finH, cut: 0.6 }],
    },
    "livery",
  );
  // dorsal fillet, blending into the fin leading edge
  kit.surface(
    {
      root: [0, H(0.3), Z(4.9)],
      roll: 90,
      stations: [
        { s: 0, le: 0, c: 1.6 * zs, t: 0.07 },
        { s: 0.34, le: 1.5 * zs, c: 0.35 * zs, t: 0.07 },
      ],
    },
    "livery",
  );
  // tail tie-down stinger
  kit.add(tube([0, H(0.07), Z(7.35)], [0, H(0.03), Z(7.6)], 0.06, 0.03, { seg: 8 }), "paint");

  // --- engine & prop -------------------------------------------------------------------------
  kit.prop({
    at: [0, 0, -0.125],
    blades: 2,
    diameter: v.propDia,
    dir: -1,
    chord: 0.15,
    pitch: 1.45,
    spinnerLen: 0.38 * zs,
    spinnerR: 0.18 * ws,
    bluntness: 0.8,
  });
  inlet(kit, [W(0.165), H(0.04), -0.004], W(0.072), H(0.07), q.seg);
  inlet(kit, [-W(0.165), H(0.04), -0.004], W(0.072), H(0.07), q.seg);
  exhaust(kit, [W(0.16), H(-0.5), Z(1.05)], [W(0.19), H(-0.6), Z(1.25)], 0.05);

  // antennas on the cabin roof / wing centre section
  const roofTop = wing.point(0.0, 0.45, 1);
  kit.add(blade([0, roofTop[1], roofTop[2] + 0.2], 0.22, 0.1, 0.1), "dark");
  kit.add(blade([0, roofTop[1], roofTop[2] - 0.35], 0.18, 0.09, 0.08), "dark");
  // belly antenna
  kit.add(blade([0, H(-0.5), Z(4.0)], -0.18, 0.08, 0.06), "dark");

  // --- landing gear (fixed, spring steel mains, oleo nose) ----------------------------------
  const tireM = v.id === "c152" ? 0.42 : 0.44;
  const groundY = H(-1.0) - tireM / 2;
  const mainC = (side: number): V3 => [side * v.track * 0.5, groundY + tireM / 2, v.mainZ];
  const noseTire = 0.36;
  const noseC: V3 = [0, groundY + noseTire / 2, v.noseZ];
  kit.fixed((leg) => {
    for (const side of [1, -1]) {
      const c = mainC(side);
      leg.add(
        tube(
          [side * W(0.46), H(-0.53), Z(2.76)],
          [c[0] - side * 0.08, c[1] + 0.1, c[2]],
          0.075,
          0.05,
          {
            seg: 8,
          },
        ),
        "gear",
      );
      leg.wheel(c, tireM, 0.15);
      wheelPant(leg, [c[0], c[1] + 0.02, c[2] - 0.02], {
        len: 0.86,
        hw: 0.12,
        top: 0.22,
        bot: -0.18,
        radial: Math.max(10, q.radial - 6),
      });
    }
    oleo(leg, [0, H(-0.42), noseC[2] - 0.06], [0, noseC[1] + 0.08, noseC[2]], 0.075, 8);
    leg.wheel(noseC, noseTire, 0.13);
    wheelPant(leg, [0, noseC[1] + 0.02, noseC[2] - 0.02], {
      len: 0.7,
      hw: 0.1,
      top: 0.2,
      bot: -0.15,
      radial: Math.max(10, q.radial - 6),
    });
  });

  // --- lights ----------------------------------------------------------------------------------
  const tip = wing.point(sp, 0.18, 0);
  const tipL: V3 = [-tip[0] - 0.02, tip[1], tip[2]];
  const tipR: V3 = [tip[0] + 0.02, tip[1], tip[2]];
  tipLenses(kit, tipL, tipR, 0.035);
  const finTop = fin.point(v.finH, 0.35, 0);
  beaconDome(kit, [0, finTop[1] + 0.005, finTop[2]], 0.045);
  const lamp = wing.point(sp * 0.27, 0.01, 0);
  kit.lights({
    navL: tipL,
    navR: tipR,
    beacons: [[0, finTop[1] + 0.05, finTop[2]]],
    strobes: [
      [tipL[0], tipL[1], tipL[2] + 0.15],
      [tipR[0], tipR[1], tipR[2] + 0.15],
    ],
    landing: { pos: [-lamp[0], lamp[1], lamp[2] - 0.02], dir: [0, -0.07, -1] },
    size: 1,
  });

  // --- livery ----------------------------------------------------------------------------------
  kit.livery((p: LiveryPainter) => paintCessna(p, v));
  kit.registration(v.reg, fus, Z(5.35), H(0.13), 0.22, "#1b1f24");

  kit.setCg([0, H(0.05), Z(2.47)]);
  return {
    id: v.id,
    label: v.label,
    dims:
      v.id === "c172"
        ? { lengthM: 8.28, spanM: 11.0, heightM: 2.72 }
        : { lengthM: 7.34, spanM: 10.17, heightM: 2.59 },
  };
}

function paintCessna(p: LiveryPainter, v: CessnaVariant) {
  const Z = (z: number) => z * v.zs;
  const H = (y: number) => y * v.hs;
  const pt = (z: number, y: number): [number, number] => [Z(z), H(y)];
  // belly
  p.band(
    [pt(0, -0.42), pt(2.5, -0.47), pt(5, -0.24), pt(7.6, 0.06)],
    [pt(0, -0.9), pt(7.6, -0.9)],
    "#e9ecef",
  );
  // main cheat line with accent
  p.band(
    [pt(-0.1, -0.02), pt(1.4, -0.03), pt(3.2, -0.05), pt(4.8, 0.03), pt(6.3, 0.15), pt(7.7, 0.24)],
    [pt(-0.1, -0.15), pt(1.4, -0.17), pt(3.2, -0.19), pt(4.8, -0.1), pt(6.3, 0.03), pt(7.7, 0.12)],
    v.stripe,
  );
  p.band(
    [pt(-0.1, 0.035), pt(1.4, 0.025), pt(3.2, 0.005), pt(4.8, 0.085), pt(6.3, 0.2), pt(7.7, 0.29)],
    [
      pt(-0.1, 0.005),
      pt(1.4, -0.005),
      pt(3.2, -0.025),
      pt(4.8, 0.055),
      pt(6.3, 0.17),
      pt(7.7, 0.26),
    ],
    v.accent,
  );
  // fin sweep
  p.fill([pt(6.45, 0.62), pt(8.2, 0.86), pt(8.2, 1.06), pt(6.75, 0.86)], v.stripe);
  p.fill([pt(6.62, 0.95), pt(8.2, 1.13), pt(8.2, 1.19), pt(6.7, 1.02)], v.accent);
  // windows
  p.glass([pt(1.4, 0.36), pt(1.97, 0.4), pt(2.1, 0.86), pt(1.3, 0.86)], false);
  p.glass([pt(2.04, 0.18), pt(2.8, 0.18), pt(2.8, 0.73), pt(2.17, 0.73)]);
  if (v.id === "c172") {
    p.glass([pt(2.88, 0.2), pt(3.45, 0.27), pt(3.6, 0.72), pt(2.88, 0.73)]);
    p.glass([pt(3.8, 0.5), pt(4.36, 0.47), pt(4.36, 0.95), pt(3.8, 0.95)], false);
  } else {
    p.glass([pt(2.88, 0.24), pt(3.28, 0.34), pt(3.38, 0.71), pt(2.88, 0.73)]);
    p.glass([pt(3.6, 0.5), pt(4.1, 0.47), pt(4.1, 0.95), pt(3.6, 0.95)], false);
  }
  // seams: door, cowling, baggage door
  p.door(Z(2.0), H(-0.46), Z(2.84), H(0.75), 0.05);
  p.door(Z(3.25), H(-0.36), Z(3.62), H(0.08), 0.03);
  p.line([pt(1.36, -0.6), pt(1.36, 0.4)], 0.01);
  p.line([pt(0.12, 0.02), pt(1.36, 0.0)], 0.008);
}

// ===========================================================================================
// Piper J-3 Cub (vintage tail-dragger)
// ===========================================================================================

export function buildJ3(kit: AirframeKit) {
  const q = kit.q;
  kit.limits = { aileron: [24, 18], elevator: [27, 24], rudder: 24, flapMax: 0 };
  const fus = kit.body(
    [
      { z: 0.0, hw: 0.19, top: 0.17, bot: -0.21, nt: 2.2 },
      { z: 0.14, hw: 0.27, top: 0.24, bot: -0.3, nt: 2.6 },
      { z: 0.7, hw: 0.33, top: 0.27, bot: -0.38, nt: 3.0 },
      { z: 1.05, hw: 0.35, top: 0.31, bot: -0.42, nt: 3.4 },
      { z: 1.25, hw: 0.36, top: 0.45, bot: -0.44, nt: 3.8 },
      { z: 1.6, hw: 0.36, top: 0.78, bot: -0.45, nt: 4.0 },
      { z: 1.85, hw: 0.36, top: 0.88, bot: -0.45, nt: 4.2 },
      { z: 2.95, hw: 0.35, top: 0.88, bot: -0.43, nt: 4.0 },
      { z: 3.3, hw: 0.32, top: 0.68, bot: -0.39, nt: 3.6 },
      { z: 4.5, hw: 0.21, top: 0.46, bot: -0.21, nt: 3.2 },
      { z: 5.8, hw: 0.09, top: 0.3, bot: 0.0, nt: 2.8 },
      { z: 6.32, hw: 0.03, top: 0.25, bot: 0.12, nt: 2.4 },
    ],
    "livery",
    { tailCap: 0.02 },
  );
  // exposed cylinder heads (4-cylinder opposed, staggered)
  for (const [side, z] of [
    [1, 0.36],
    [1, 0.62],
    [-1, 0.46],
    [-1, 0.72],
  ] as const) {
    kit.add(cylinderHead([side * 0.31, 0.02, z], side, 0.072, 0.16, q.seg), "engine");
  }
  inlet(kit, [0, -0.04, -0.004], 0.1, 0.07, q.seg);

  const wing = kit.surface(
    {
      root: [0, 0.94, 1.66],
      mirror: true,
      stations: [
        { s: 0, le: 0, c: 1.6, t: 0.118, cam: 0.03, dh: 1 },
        { s: 5.12, le: 0, c: 1.6, t: 0.118, cam: 0.03, dh: 1 },
        { s: 5.25, le: 0.05, c: 1.5, t: 0.11, cam: 0.025, dh: 1 },
        { s: 5.33, le: 0.14, c: 1.3, t: 0.095, cam: 0.02, dh: 1 },
        { s: 5.37, le: 0.28, c: 0.98, t: 0.08, cam: 0.015 },
      ],
      movables: [{ key: "aileron", from: 2.95, to: 5.2, cut: 0.76 }],
    },
    "paint",
  );
  // lift struts (V pair) + jury struts
  for (const side of [1, -1]) {
    const f = wing.point(2.9, 0.1, -1);
    const r = wing.point(2.9, 0.68, -1);
    const a: V3 = [side * 0.34, -0.38, 1.6];
    kit.add(tube(a, [side * f[0], f[1], f[2]], 0.075, 0.06, { ratio: 0.35, seg: 7 }), "paint");
    kit.add(tube(a, [side * r[0], r[1], r[2]], 0.075, 0.06, { ratio: 0.35, seg: 7 }), "paint");
    const j = wing.point(1.7, 0.3, -1);
    const tA: V3 = [side * (0.34 + (f[0] - 0.34) * 0.5), (f[1] + -0.38) / 2, (f[2] + 1.6) / 2];
    kit.add(tube(tA, [side * j[0], j[1], j[2]], 0.025, 0.025, { seg: 5 }), "paint");
  }
  kit.surface(
    {
      root: [0, 0.27, 5.62],
      mirror: true,
      stations: [
        { s: 0, le: 0, c: 1.05, t: 0.08 },
        { s: 1.2, le: 0.08, c: 0.95, t: 0.075 },
        { s: 1.45, le: 0.24, c: 0.72, t: 0.065 },
        { s: 1.55, le: 0.42, c: 0.42, t: 0.05 },
      ],
      movables: [{ key: "elevator", from: 0.1, to: 1.53, cut: 0.52 }],
    },
    "paint",
  );
  const fin = kit.surface(
    {
      root: [0, 0.12, 5.8],
      roll: 90,
      stations: [
        { s: 0, le: 0, c: 0.92, t: 0.08 },
        { s: 0.55, le: 0.22, c: 0.8, t: 0.08 },
        { s: 0.85, le: 0.42, c: 0.62, t: 0.07 },
        { s: 0.98, le: 0.6, c: 0.36, t: 0.05 },
      ],
      movables: [{ key: "rudder", from: 0, to: 0.98, cut: 0.42 }],
    },
    "livery",
  );

  kit.prop({
    at: [0, 0, -0.07],
    blades: 2,
    diameter: 1.83,
    dir: -1,
    chord: 0.13,
    pitch: 1.1,
    spinnerLen: 0.14,
    spinnerR: 0.075,
    bluntness: 0.9,
    tipBand: 0.06,
  });

  // gear: split-axle V legs with bungee struts, big low-pressure tyres, tailwheel
  const tire = 0.52;
  const groundY = -1.27;
  kit.fixed((leg) => {
    for (const side of [1, -1]) {
      const c: V3 = [side * 0.92, groundY + tire / 2, 1.46];
      leg.add(tube([side * 0.32, -0.44, 1.15], c, 0.045, 0.04, { seg: 6 }), "gear");
      leg.add(tube([side * 0.32, -0.44, 1.85], c, 0.045, 0.04, { seg: 6 }), "gear");
      leg.add(tube([side * 0.06, -0.58, 1.46], c, 0.04, 0.04, { seg: 6 }), "gear");
      leg.add(
        tube([side * 0.36, -0.15, 1.3], [side * 0.6, -0.6, 1.4], 0.06, 0.06, { seg: 6 }),
        "paint",
      );
      leg.wheel(c, tire, 0.19, { hub: "gear" });
    }
    leg.add(tube([0, 0.06, 6.15], [0, -0.12, 6.3], 0.03, 0.025, { seg: 6 }), "dark");
    leg.wheel([0, -0.2, 6.3], 0.15, 0.05, { tail: true });
  });

  const tipL: V3 = [-5.38, 0.94 + 5.37 * 0.017, 1.9];
  const tipR: V3 = [5.38, tipL[1], 1.9];
  const finTop = fin.point(0.98, 0.3, 0);
  kit.lights({
    navL: tipL,
    navR: tipR,
    beacons: [[0, finTop[1] + 0.04, finTop[2]]],
    strobes: [],
    landing: { pos: [0, -0.1, -0.05], dir: [0, -0.05, -1] },
    size: 0.8,
  });

  kit.livery((p) => {
    // black cheat line with a pointed nose end
    p.fill(
      [
        [-0.05, 0.02],
        [1.0, 0.07],
        [3.4, 0.07],
        [6.4, 0.25],
        [6.4, 0.2],
        [3.4, -0.04],
        [1.0, -0.04],
      ],
      "#141414",
    );
    // windshield and side windows (tandem seats)
    p.glass(
      [
        [1.27, 0.44],
        [1.78, 0.5],
        [1.88, 0.95],
        [1.2, 0.95],
      ],
      false,
    );
    p.glass([
      [1.86, 0.32],
      [2.5, 0.32],
      [2.5, 0.8],
      [1.92, 0.8],
    ]);
    p.glass([
      [2.56, 0.32],
      [3.05, 0.34],
      [3.02, 0.76],
      [2.56, 0.8],
    ]);
    p.door(1.85, -0.3, 2.52, 0.83, 0.03);
    p.line(
      [
        [1.05, -0.42],
        [1.05, 0.3],
      ],
      0.01,
    );
  });
  kit.registration("SR-J3", fus, 4.3, 0.15, 0.2, "#141414");

  kit.setCg([0, 0.1, 2.05]);
  return {
    id: "j3",
    label: "Piper J-3 Cub (representative, vintage)",
    dims: { lengthM: 6.83, spanM: 10.74, heightM: 2.03 },
    tailwheel: true,
  };
}
