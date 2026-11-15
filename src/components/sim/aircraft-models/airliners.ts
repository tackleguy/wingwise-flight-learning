/**
 * Narrow-body twin-jet airliners: Boeing 737-800 and Airbus A320 — representative shapes from
 * public dimensions with a generic, airline-neutral livery (no airline or manufacturer marks).
 * Design coordinates: z aft from the nose tip, y up from the fuselage centre line, metres.
 */
import { beaconDome, oleo, tipLenses } from "./common";
import { blade, revolve, type MovableDef, type PlanStation, type Station, tube } from "./geometry";
import type { AirframeKit, Limits } from "./kit";
import type { LiveryPainter, P2 } from "./livery";
import type { V3 } from "./math";

interface Surf {
  root: V3;
  stations: PlanStation[];
}

interface AirlinerSpec {
  id: string;
  label: string;
  reg: string;
  dims: { lengthM: number; spanM: number; heightM: number };
  fuselage: Station[];
  fairing: Station[];
  wing: Surf & {
    flaps: [number, number][];
    aileron: [number, number];
  };
  limits: Limits;
  htail: Surf & { elevator: [number, number] };
  vtail: Surf;
  dorsal: Surf;
  engine: {
    x: number;
    y: number;
    /** Inlet lip z. */
    z: number;
    /** Max nacelle radius. */
    r: number;
    len: number;
    /** Flattened lower lip (737 NG style), 0..0.2. */
    flatten: number;
    pylonTop: number;
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
  };
  windows: {
    z0: number;
    z1: number;
    pitch: number;
    y: number;
    w: number;
    h: number;
    skip: [number, number][];
  };
  livery: (p: LiveryPainter) => void;
  regAt: [number, number, number];
  cg: V3;
}

export function buildAirliner(kit: AirframeKit, sp: AirlinerSpec) {
  const q = kit.q;
  kit.limits = sp.limits;
  const fus = kit.body(sp.fuselage, "livery", { noseCap: 0.02, tailCap: 0.02, ringsScale: 1.6 });
  kit.body(sp.fairing, "paint", { ringsScale: 0.5, noseCap: 0.05, tailCap: 0.05 });

  const movables: MovableDef[] = sp.wing.flaps.map(([from, to], i) => ({
    key: `flap${i}`,
    from,
    to,
    cut: 0.75,
    pivot: 0.72,
    drop: 0.09,
  }));
  movables.push({ key: "aileron", from: sp.wing.aileron[0], to: sp.wing.aileron[1], cut: 0.77 });
  const wing = kit.surface(
    { root: sp.wing.root, mirror: true, stations: sp.wing.stations, movables },
    "paint",
  );
  kit.surface(
    {
      root: sp.htail.root,
      mirror: true,
      stations: sp.htail.stations,
      movables: [
        { key: "elevator", from: sp.htail.elevator[0], to: sp.htail.elevator[1], cut: 0.7 },
      ],
    },
    "paint",
  );
  const finTopS = sp.vtail.stations[sp.vtail.stations.length - 1]?.s ?? 1;
  const fin = kit.surface(
    {
      root: sp.vtail.root,
      roll: 90,
      stations: sp.vtail.stations,
      movables: [{ key: "rudder", from: 0.15, to: finTopS - 0.2, cut: 0.7 }],
    },
    "livery",
  );
  kit.surface({ ...sp.dorsal, roll: 90 }, "livery");

  // engines: revolved nacelle (cowl, lip, inlet duct), fan, core, plug and a pylon
  const e = sp.engine;
  const seg = Math.max(18, q.seg + 8);
  const R = e.r;
  const L = e.len;
  const flat = (th: number, z: number) => {
    const s = Math.sin(th);
    if (s >= 0) return 1;
    // flatten the lower lip only; fade out before the fan face
    const fade = Math.max(0, 1 - Math.max(0, z - e.z) / (L * 0.25));
    return 1 - e.flatten * Math.pow(-s, 3) * fade;
  };
  for (const side of [1, -1]) {
    const cx = side * e.x;
    const z0 = e.z;
    const o = { segments: seg, cx, cy: e.y, rScale: flat };
    // outer cowl (walked nose → tail so the solid is on the right of the profile)
    kit.add(
      revolve(
        [
          [R * 0.92, z0 + L * 0.015],
          [R * 0.97, z0 + L * 0.07],
          [R * 1.0, z0 + L * 0.22],
          [R * 0.99, z0 + L * 0.42],
          [R * 0.93, z0 + L * 0.58],
          [R * 0.84, z0 + L * 0.66],
        ],
        o,
      ),
      "paint",
    );
    // polished inlet lip (inner → outer)
    kit.add(
      revolve(
        [
          [R * 0.8, z0 + L * 0.03],
          [R * 0.83, z0 + L * 0.008],
          [R * 0.88, z0],
          [R * 0.92, z0 + L * 0.015],
        ],
        o,
      ),
      "metal",
    );
    // bypass duct and inlet duct (dark), walked tail → nose along the inner wall
    kit.add(
      revolve(
        [
          [R * 0.84, z0 + L * 0.66],
          [R * 0.82, z0 + L * 0.655],
          [R * 0.8, z0 + L * 0.5],
          [R * 0.78, z0 + L * 0.3],
          [R * 0.78, z0 + L * 0.2],
          [R * 0.8, z0 + L * 0.03],
        ],
        o,
      ),
      "intake",
    );
    // core cowl and exhaust plug
    kit.add(
      revolve(
        [
          [0, z0 + L * 0.6],
          [R * 0.6, z0 + L * 0.6],
          [R * 0.62, z0 + L * 0.66],
          [R * 0.56, z0 + L * 0.86],
          [R * 0.46, z0 + L * 0.98],
        ],
        { segments: seg, cx, cy: e.y },
      ),
      "engine",
    );
    kit.add(
      revolve(
        [
          [0, z0 + L * 0.97],
          [R * 0.34, z0 + L * 0.98],
          [R * 0.28, z0 + L * 1.02],
          [R * 0.12, z0 + L * 1.08],
          [0, z0 + L * 1.12],
        ],
        { segments: seg, cx, cy: e.y },
      ),
      "exhaust",
    );
    // fan face
    kit.prop({
      at: [cx, e.y, z0 + L * 0.3],
      blades: q.seg > 20 ? 22 : 16,
      diameter: R * 1.54,
      dir: -1,
      chord: R * 0.32,
      pitch: 3.2,
      spinnerLen: R * 0.62,
      spinnerR: R * 0.3,
      spinnerBack: 0.2,
      bluntness: 0.9,
      fan: true,
    });
    kit.add(
      revolve(
        [
          [0, z0 + L * 0.34],
          [R * 0.79, z0 + L * 0.34],
        ],
        { segments: seg, cx, cy: e.y },
      ),
      "intake",
    );
    // pylon: thin fairing from the nacelle top to the wing underside, running past the TE
    const zA = z0 + L * 0.12;
    const zB = z0 + L * 1.2;
    const topY = e.pylonTop;
    const nacTop = e.y + R * 0.92;
    kit.body(
      [
        { z: zA, hw: 0.04, top: nacTop + 0.15, bot: nacTop - 0.1, nt: 2.5 },
        { z: zA + 0.6, hw: 0.2, top: topY - 0.05, bot: nacTop - 0.15, nt: 3.2 },
        { z: (zA + zB) / 2, hw: 0.22, top: topY + 0.1, bot: nacTop - 0.1, nt: 3.2 },
        { z: zB - 0.6, hw: 0.18, top: topY + 0.25, bot: e.y - R * 0.1, nt: 3 },
        { z: zB + 0.9, hw: 0.04, top: topY + 0.32, bot: topY - 0.1, nt: 2.4 },
      ],
      "paint",
      { cx, radial: 12, ringsScale: 0.3, noseCap: 0.02, tailCap: 0.02 },
    );
  }

  // gear: twin-wheel mains folding inboard, twin-wheel nose folding forward
  const g = sp.gear;
  for (const side of [1, -1]) {
    const pivot: V3 = [side * g.mainX, g.mainTop, g.mainZ - 0.2];
    const c: V3 = [side * g.mainX, g.groundY + g.mainTire / 2, g.mainZ];
    kit.gearLeg(pivot, [0, 0, 1], side * -86, (leg) => {
      oleo(leg, pivot, [c[0], c[1] + 0.25, c[2]], 0.3, 10);
      leg.add(
        tube([c[0] - 0.5, c[1], c[2]], [c[0] + 0.5, c[1], c[2]], 0.16, 0.16, { seg: 8 }),
        "gear",
      );
      leg.wheel([c[0] - 0.43, c[1], c[2]], g.mainTire, 0.4);
      leg.wheel([c[0] + 0.43, c[1], c[2]], g.mainTire, 0.4);
      // side brace
      leg.add(
        tube(
          [c[0] - side * 1.2, g.mainTop + 0.1, c[2] + 0.1],
          [c[0], (g.mainTop + c[1]) / 2 + 0.2, c[2]],
          0.12,
          0.1,
          { seg: 6 },
        ),
        "gear",
      );
    });
  }
  const np: V3 = [0, g.noseTop, g.noseZ - 0.15];
  const nc: V3 = [0, g.groundY + g.noseTire / 2, g.noseZ];
  kit.gearLeg(np, [1, 0, 0], 95, (leg) => {
    oleo(leg, np, [0, nc[1] + 0.15, nc[2]], 0.2, 10);
    leg.add(tube([-0.32, nc[1], nc[2]], [0.32, nc[1], nc[2]], 0.1, 0.1, { seg: 6 }), "gear");
    leg.wheel([-0.26, nc[1], nc[2]], g.noseTire, 0.22);
    leg.wheel([0.26, nc[1], nc[2]], g.noseTire, 0.22);
  });

  // lights
  const semiBase = sp.wing.stations.find((s) => (s.dh ?? 0) > 30)?.s ?? wing.span;
  const navP = wing.point(semiBase - 0.15, 0.3, 0);
  const navL: V3 = [-navP[0] - 0.06, navP[1], navP[2]];
  const navR: V3 = [navP[0] + 0.06, navP[1], navP[2]];
  tipLenses(kit, navL, navR, 0.08);
  const roof = sp.fuselage.reduce((a, s) => (s.top > a.top ? s : a));
  const topBeacon: V3 = [0, roof.top + 0.02, sp.wing.root[2] + 2];
  const belly: V3 = [0, sp.fairing[2]?.bot ?? -2, sp.wing.root[2] + 4];
  beaconDome(kit, topBeacon, 0.12);
  const tailEnd = sp.fuselage[sp.fuselage.length - 1];
  const lampW = wing.point(3.2, 0.02, 0);
  kit.lights({
    navL,
    navR,
    beacons: [
      [0, topBeacon[1] + 0.12, topBeacon[2]],
      [0, belly[1] - 0.1, belly[2]],
    ],
    strobes: [
      [navL[0], navL[1], navL[2] + 0.4],
      [navR[0], navR[1], navR[2] + 0.4],
      [0, tailEnd ? (tailEnd.top + tailEnd.bot) / 2 : 1, (tailEnd?.z ?? 38) + 0.1],
    ],
    landing: { pos: [-lampW[0], lampW[1], lampW[2] - 0.05], dir: [0, -0.06, -1] },
    size: 2.4,
    doubleStrobe: true,
  });

  // antennas
  kit.add(blade([0, roof.top - 0.02, 8], 0.35, 0.3, 0.15, 0.03), "metal");
  kit.add(blade([0, roof.top - 0.02, 21], 0.3, 0.25, 0.12, 0.03), "metal");
  kit.add(blade([0, -1.95, 9.5], -0.3, 0.25, 0.1, 0.03), "metal");
  void fin;

  kit.livery((p) => {
    sp.livery(p);
    const w = sp.windows;
    for (let z = w.z0; z <= w.z1 + 1e-6; z += w.pitch) {
      if (w.skip.some(([a, b]) => z >= a && z <= b)) continue;
      p.window(z - w.w / 2, w.y - w.h / 2, z + w.w / 2, w.y + w.h / 2, w.w * 0.42);
    }
  });
  kit.registration(sp.reg, fus, sp.regAt[0], sp.regAt[1], sp.regAt[2], "#1b1f24");
  kit.setCg(sp.cg);
  return { id: sp.id, label: sp.label, dims: sp.dims };
}

const S = (z: number, hw: number, top: number, bot: number, nt = 2, nb = 2.1): Station => ({
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

// ---------------------------------------------------------------------------------------------
// Boeing 737-800 (blended winglets, flattened nacelle lips)
// ---------------------------------------------------------------------------------------------

const B738: AirlinerSpec = {
  id: "b738",
  label: "Boeing 737-800 (representative, generic livery)",
  reg: "SR-738",
  dims: { lengthM: 39.47, spanM: 35.79, heightM: 12.55 },
  fuselage: [
    S(0.0, 0.1, -0.3, -0.48),
    S(0.3, 0.55, 0.05, -0.95),
    S(0.9, 0.95, 0.42, -1.32),
    S(1.8, 1.33, 0.9, -1.62),
    S(2.8, 1.62, 1.4, -1.8),
    S(3.8, 1.78, 1.78, -1.9),
    S(5.0, 1.86, 1.98, -1.95),
    S(6.5, 1.88, 2.03, -1.97),
    S(28.0, 1.88, 2.03, -1.97),
    S(30.5, 1.8, 2.02, -1.7),
    S(33.0, 1.55, 1.98, -1.05),
    S(35.5, 1.1, 1.85, -0.25),
    S(37.6, 0.62, 1.65, 0.4),
    S(39.0, 0.25, 1.3, 0.85),
    S(39.47, 0.12, 1.12, 0.92),
  ],
  fairing: [
    S(12.4, 1.3, -1.05, -1.9, 2.4, 3),
    S(13.6, 2.05, -0.75, -2.12, 2.6, 3),
    S(15.6, 2.32, -0.6, -2.24, 2.8, 3.2),
    S(19.6, 2.32, -0.55, -2.24, 2.8, 3.2),
    S(21.8, 1.98, -0.65, -2.1, 2.6, 3),
    S(23.6, 1.15, -0.95, -1.95, 2.4, 2.6),
  ],
  wing: {
    root: [0, -1.35, 13.3],
    stations: [
      { s: 0, le: 0, c: 7.0, t: 0.15, cam: 0.015, tw: 2.5, dh: 6 },
      { s: 1.88, le: 0.96, c: 6.04, t: 0.145, cam: 0.015, tw: 2.2, dh: 6 },
      { s: 5.6, le: 2.85, c: 4.15, t: 0.13, cam: 0.015, tw: 1, dh: 6 },
      { s: 16.6, le: 8.45, c: 1.38, t: 0.105, cam: 0.01, tw: -1.5, dh: 6 },
      { s: 17.1, le: 8.72, c: 1.24, t: 0.1, cam: 0.01, tw: -1.5, dh: 30 },
      { s: 17.5, le: 9.0, c: 1.08, t: 0.095, cam: 0, tw: -1, dh: 76 },
      { s: 19.6, le: 10.55, c: 0.55, t: 0.08, cam: 0, tw: 0 },
    ],
    flaps: [
      [1.95, 5.5],
      [6.2, 11.9],
    ],
    aileron: [12.05, 15.9],
  },
  limits: { aileron: [20, 15], elevator: [20, 15], rudder: 22, flapMax: 40 },
  htail: {
    root: [0, 0.75, 33.1],
    stations: [
      { s: 0, le: 0, c: 3.9, t: 0.1, dh: 7 },
      { s: 7.0, le: 4.9, c: 1.2, t: 0.09, dh: 7 },
      { s: 7.17, le: 5.08, c: 1.05, t: 0.08 },
    ],
    elevator: [1.1, 7.0],
  },
  vtail: {
    root: [0, 1.65, 31.3],
    stations: [
      { s: 0, le: 0, c: 6.3, t: 0.11 },
      { s: 7.4, le: 5.85, c: 1.82, t: 0.1 },
      { s: 7.55, le: 6.02, c: 1.6, t: 0.08 },
    ],
  },
  dorsal: {
    root: [0, 1.92, 28.2],
    stations: [
      { s: 0, le: 0, c: 3.6, t: 0.05 },
      { s: 0.55, le: 3.3, c: 0.6, t: 0.05 },
    ],
  },
  engine: { x: 4.9, y: -2.12, z: 12.2, r: 1.0, len: 4.6, flatten: 0.16, pylonTop: -1.05 },
  gear: {
    mainX: 2.86,
    mainZ: 17.9,
    mainTop: -1.55,
    noseZ: 2.4,
    noseTop: -1.75,
    groundY: -3.4,
    mainTire: 1.13,
    noseTire: 0.69,
  },
  windows: {
    z0: 6.6,
    z1: 27.4,
    pitch: 0.508,
    y: 0.62,
    w: 0.24,
    h: 0.34,
    skip: [
      [15.5, 15.75],
      [16.55, 16.8],
    ],
  },
  livery: (p) => {
    // grey belly and a sweeping blue belly band
    p.band(
      pts(0, -0.75, 10, -0.9, 28, -0.9, 34, -0.2, 39.6, 0.7),
      pts(0, -2.5, 39.6, -2.5),
      "#c9ced6",
    );
    p.band(
      pts(0.2, -0.38, 8, -0.48, 26, -0.48, 33, 0.25, 39.6, 1.2),
      pts(0.2, -0.75, 8, -0.9, 26, -0.9, 33, -0.2, 39.6, 0.7),
      "#1b3a6b",
      true,
    );
    p.band(
      pts(3, -0.3, 8, -0.38, 26, -0.38, 33, 0.35, 39.6, 1.3),
      pts(3, -0.38, 8, -0.48, 26, -0.48, 33, 0.25, 39.6, 1.2),
      "#2bb3c0",
      true,
    );
    // fin artwork (abstract geometric shapes)
    p.fill(pts(31.0, 2.5, 40.0, 2.5, 40.0, 9.4, 37.2, 9.4), "#1b3a6b");
    p.fill(pts(33.5, 3.4, 40.0, 6.4, 40.0, 7.3, 35.2, 5.6), "#2bb3c0");
    // cockpit windows
    p.glass(pts(1.95, 0.98, 2.62, 0.98, 2.62, 1.48, 2.2, 1.35), 0.04);
    p.glass(pts(2.72, 0.98, 3.4, 0.98, 3.36, 1.62, 2.72, 1.52), 0.05);
    p.glass(pts(3.5, 0.98, 4.0, 0.98, 3.95, 1.66, 3.5, 1.66), 0.07);
    // doors
    p.door(4.4, -1.05, 5.25, 0.98, 0.12, 0.02);
    p.door(31.4, -1.0, 32.15, 0.98, 0.12, 0.02);
    p.door(15.48, 0.18, 15.98, 1.0, 0.08, 0.02);
    p.door(16.53, 0.18, 17.03, 1.0, 0.08, 0.02);
    p.door(7.2, -1.75, 8.4, -0.85, 0.06, 0.02);
    p.door(25.6, -1.6, 26.7, -0.7, 0.06, 0.02);
  },
  regAt: [29.6, 0.5, 0.42],
  cg: [0, -0.8, 17.1],
};

// ---------------------------------------------------------------------------------------------
// Airbus A320 (sharklets, round nacelles)
// ---------------------------------------------------------------------------------------------

const A320: AirlinerSpec = {
  id: "a320",
  label: "Airbus A320 (representative, generic livery)",
  reg: "SR-320",
  dims: { lengthM: 37.57, spanM: 35.8, heightM: 11.76 },
  fuselage: [
    S(0.0, 0.12, -0.32, -0.58),
    S(0.35, 0.62, 0.15, -1.08),
    S(1.0, 1.05, 0.62, -1.45),
    S(1.9, 1.45, 1.15, -1.75),
    S(2.9, 1.76, 1.62, -1.94),
    S(4.0, 1.92, 1.96, -2.04),
    S(5.4, 1.975, 2.07, -2.07),
    S(23.5, 1.975, 2.07, -2.07),
    S(26.0, 1.9, 2.05, -1.8),
    S(28.6, 1.62, 2.0, -1.1),
    S(31.2, 1.15, 1.85, -0.25),
    S(33.6, 0.68, 1.62, 0.45),
    S(35.8, 0.32, 1.3, 0.9),
    S(37.2, 0.14, 1.12, 1.0),
    S(37.57, 0.06, 1.06, 1.02),
  ],
  fairing: [
    S(10.6, 1.35, -1.15, -2.0, 2.4, 3),
    S(11.8, 2.15, -0.85, -2.25, 2.6, 3),
    S(13.8, 2.42, -0.7, -2.36, 2.8, 3.2),
    S(17.8, 2.42, -0.65, -2.36, 2.8, 3.2),
    S(20.0, 2.05, -0.75, -2.2, 2.6, 3),
    S(21.8, 1.2, -1.05, -2.06, 2.4, 2.6),
  ],
  wing: {
    root: [0, -1.45, 11.6],
    stations: [
      { s: 0, le: 0, c: 6.6, t: 0.15, cam: 0.015, tw: 2.5, dh: 5.1 },
      { s: 1.98, le: 0.95, c: 5.65, t: 0.145, cam: 0.015, tw: 2.2, dh: 5.1 },
      { s: 6.3, le: 3.0, c: 3.6, t: 0.125, cam: 0.015, tw: 1, dh: 5.1 },
      { s: 16.6, le: 8.25, c: 1.55, t: 0.105, cam: 0.01, tw: -1.5, dh: 5.1 },
      { s: 17.05, le: 8.47, c: 1.45, t: 0.1, cam: 0.01, tw: -1.5, dh: 30 },
      { s: 17.45, le: 8.8, c: 1.18, t: 0.095, cam: 0, tw: -1, dh: 70 },
      { s: 19.3, le: 10.3, c: 0.42, t: 0.08, cam: 0, tw: 0 },
    ],
    flaps: [
      [2.05, 6.2],
      [6.6, 11.9],
    ],
    aileron: [12.2, 16.2],
  },
  limits: { aileron: [25, 25], elevator: [30, 17], rudder: 25, flapMax: 40 },
  htail: {
    root: [0, 0.9, 30.4],
    stations: [
      { s: 0, le: 0, c: 3.6, t: 0.1, dh: 6 },
      { s: 6.05, le: 3.85, c: 1.2, t: 0.09, dh: 6 },
      { s: 6.22, le: 4.02, c: 1.05, t: 0.08 },
    ],
    elevator: [1.0, 6.1],
  },
  vtail: {
    root: [0, 1.75, 29.25],
    stations: [
      { s: 0, le: 0, c: 5.95, t: 0.11 },
      { s: 5.75, le: 4.95, c: 1.95, t: 0.1 },
      { s: 5.9, le: 5.12, c: 1.72, t: 0.08 },
    ],
  },
  dorsal: {
    root: [0, 2.0, 26.4],
    stations: [
      { s: 0, le: 0, c: 3.4, t: 0.05 },
      { s: 0.45, le: 3.1, c: 0.6, t: 0.05 },
    ],
  },
  engine: { x: 5.75, y: -2.6, z: 11.0, r: 1.05, len: 4.4, flatten: 0, pylonTop: -1.2 },
  gear: {
    mainX: 3.8,
    mainZ: 17.7,
    mainTop: -1.6,
    noseZ: 5.07,
    noseTop: -1.85,
    groundY: -4.15,
    mainTire: 1.17,
    noseTire: 0.76,
  },
  windows: {
    z0: 6.9,
    z1: 27.2,
    pitch: 0.533,
    y: 0.68,
    w: 0.24,
    h: 0.34,
    skip: [
      [14.4, 14.65],
      [15.45, 15.7],
    ],
  },
  livery: (p) => {
    p.band(
      pts(0, -0.8, 10, -1.0, 24, -1.0, 30, -0.3, 37.7, 0.85),
      pts(0, -2.6, 37.7, -2.6),
      "#cfd4da",
    );
    p.band(
      pts(0.3, -0.42, 8, -0.55, 23, -0.55, 30, 0.2, 37.7, 1.25),
      pts(0.3, -0.8, 8, -1.0, 23, -1.0, 30, -0.3, 37.7, 0.85),
      "#14532d",
      true,
    );
    p.band(
      pts(2.5, -0.34, 8, -0.45, 23, -0.45, 30, 0.3, 37.7, 1.35),
      pts(2.5, -0.42, 8, -0.55, 23, -0.55, 30, 0.2, 37.7, 1.25),
      "#e9b949",
      true,
    );
    p.fill(pts(29.0, 2.6, 38.0, 2.6, 38.0, 7.8, 35.2, 7.8), "#14532d");
    p.fill(pts(30.8, 3.0, 38.0, 4.6, 38.0, 5.4, 32.4, 4.1), "#e9b949");
    // cockpit windows (blunter nose, deeper side panes)
    p.glass(pts(2.0, 1.05, 2.72, 1.05, 2.72, 1.55, 2.28, 1.42), 0.04);
    p.glass(pts(2.82, 1.05, 3.55, 1.05, 3.48, 1.72, 2.82, 1.6), 0.05);
    p.glass(pts(3.65, 1.08, 4.1, 1.08, 4.06, 1.74, 3.65, 1.74), 0.07);
    p.door(4.7, -1.1, 5.5, 1.05, 0.12, 0.02);
    p.door(30.0, -1.0, 30.8, 1.05, 0.12, 0.02);
    p.door(14.33, 0.22, 14.83, 1.05, 0.08, 0.02);
    p.door(15.38, 0.22, 15.88, 1.05, 0.08, 0.02);
    p.door(7.5, -1.85, 8.75, -0.95, 0.06, 0.02);
    p.door(24.0, -1.75, 25.2, -0.85, 0.06, 0.02);
  },
  regAt: [28.0, 0.55, 0.42],
  cg: [0, -0.8, 15.4],
};

export const buildB738 = (kit: AirframeKit) => buildAirliner(kit, B738);
export const buildA320 = (kit: AirframeKit) => buildAirliner(kit, A320);
