/**
 * AirframeKit — collects the procedural parts of one aircraft (in "design" coordinates: z aft
 * from the nose, y up, x to the right wing, metres), paints the livery, assembles meshes by
 * material, wires hinged surfaces / gear / propellers / lights and returns an AircraftModel.
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

import {
  MeshBuilder,
  liftingSurface,
  loftBody,
  bodyShape,
  type BodyShape,
  type LoftOptions,
  type Station,
  type SurfaceDef,
  type SurfaceResult,
} from "./geometry";
import {
  LiveryPainter,
  glowCanvas,
  propDiscCanvas,
  registrationCanvas,
  type LiveryBounds,
} from "./livery";
import { DEG, clamp, norm, sub, type V3 } from "./math";
import { propeller, spinner, wheel, type BladeSpec } from "./parts";
import type {
  AircraftModel,
  AircraftModelDimensions,
  AircraftModelFeatures,
  AircraftModelState,
  ModelQuality,
} from "./types";

export type MatKey =
  | "livery"
  | "paint"
  | "accent"
  | "metal"
  | "rubber"
  | "gear"
  | "glass"
  | "engine"
  | "spinner"
  | "exhaust"
  | "dark"
  | "intake"
  | "lensRed"
  | "lensGreen"
  | "lensClear";

export interface Palette {
  /** Fuselage base colour (livery canvas background). */
  base: string;
  /** Wings, stabilisers, nacelles, fairings. */
  wing: string;
  accent: string;
  spinner: string;
  /** Gear legs and struts. */
  gear: string;
  /** Bare metal / leading edges. */
  metal?: string;
  /** Prop tip band colour, CSS. */
  propTip: string;
  /** Prop blade colour (default matte black). */
  propBlade?: string;
  /** Spinner metalness (polished spinners). */
  spinnerMetal?: number;
}

export interface QualitySettings {
  radial: number;
  rings: number;
  K: number;
  seg: number;
  tex: number;
  bladeStations: number;
}

export const QUALITY: Record<ModelQuality, QualitySettings> = {
  low: { radial: 16, rings: 22, K: 6, seg: 12, tex: 1024, bladeStations: 4 },
  medium: { radial: 26, rings: 38, K: 9, seg: 18, tex: 2048, bladeStations: 6 },
  high: { radial: 36, rings: 56, K: 13, seg: 26, tex: 2048, bladeStations: 9 },
};

type Geo = MeshBuilder | THREE.BufferGeometry;
interface Part {
  geo: THREE.BufferGeometry;
  mat: MatKey;
}

type MovKind = "aileron" | "elevator" | "stabilator" | "rudder" | "flap";

interface MovDef {
  key: string;
  kind: MovKind;
  side: number;
  parts: Part[];
  a: V3;
  b: V3;
}

interface LegDef {
  parts: Part[];
  pivot: V3;
  axis: V3;
  /** Rotation (rad) about axis when fully retracted. */
  angle: number;
  hideWhenUp: boolean;
}

export interface PropDef {
  at: V3;
  blades: number;
  diameter: number;
  dir: 1 | -1;
  chord: number;
  pitch: number;
  shape?: BladeSpec["shape"];
  spinnerLen: number;
  spinnerR: number;
  /** Spinner base position behind the prop plane, fraction of spinner length. */
  spinnerBack?: number;
  bluntness?: number;
  /** Jet fan instead of a propeller. */
  fan?: boolean;
  tipBand?: number;
}

export interface LightsDef {
  navL: V3;
  navR: V3;
  beacons: V3[];
  strobes: V3[];
  landing: { pos: V3; dir: V3 };
  /** Glow size scale (1 = light aircraft). */
  size: number;
  /** Airliner-style double-flash strobes. */
  doubleStrobe?: boolean;
}

export interface Limits {
  aileron: [number, number];
  elevator: [number, number];
  rudder: number;
  flapMax: number;
}

export interface LegBuilder {
  add(g: Geo, mat: MatKey): void;
  wheel(c: V3, dia: number, width: number, opts?: { tail?: boolean; hub?: MatKey }): void;
}

const css = (c: string) => new THREE.Color(c);

export class AirframeKit {
  readonly q: QualitySettings;
  readonly pal: Palette;
  readonly quality: ModelQuality;
  limits: Limits = { aileron: [20, 15], elevator: [25, 20], rudder: 20, flapMax: 40 };
  private statics: Part[] = [];
  private movs: MovDef[] = [];
  private legs: LegDef[] = [];
  private fixedGear: Part[] = [];
  private propDefs: PropDef[] = [];
  private wheels: { y: number; z: number; tail: boolean }[] = [];
  private paintFn: ((p: LiveryPainter) => void) | null = null;
  private regs: {
    text: string;
    shape: BodyShape;
    z: number;
    y: number;
    h: number;
    color: string;
  }[] = [];
  private lightsDef: LightsDef | null = null;
  private cg: V3 = [0, 0, 0];
  /** Set by builders with a T-tail (informational). */
  tTail = false;

  constructor(quality: ModelQuality, pal: Palette, q: QualitySettings) {
    this.quality = quality;
    this.pal = pal;
    this.q = q;
  }

  // ---- building API ---------------------------------------------------------------------------

  add(g: Geo, mat: MatKey) {
    this.statics.push({ geo: toGeo(g), mat });
  }

  /** Lofted body (fuselage, nacelle, fairing). Returns its analytic shape. */
  body(
    stations: Station[],
    mat: MatKey,
    o: Partial<LoftOptions> & { ringsScale?: number } = {},
  ): BodyShape {
    const mb = loftBody(stations, {
      radial: o.radial ?? this.q.radial,
      rings: Math.round(this.q.rings * (o.ringsScale ?? 1)),
      ...(o.cx !== undefined ? { cx: o.cx } : {}),
      ...(o.cy !== undefined ? { cy: o.cy } : {}),
      ...(o.noseCap !== undefined ? { noseCap: o.noseCap } : {}),
      ...(o.tailCap !== undefined ? { tailCap: o.tailCap } : {}),
    });
    this.add(mb, mat);
    return bodyShape(stations, o.cx ?? 0, o.cy ?? 0);
  }

  /**
   * Lifting surface. Movable keys: "aileron", "elevator", "stabilator", "rudder", "flap…".
   */
  surface(def: Omit<SurfaceDef, "K"> & { K?: number }, mat: MatKey, movMat?: MatKey) {
    const res: SurfaceResult = liftingSurface({ ...def, K: def.K ?? this.q.K });
    this.add(res.fixed, mat);
    for (const m of res.moving) {
      const kind: MovKind = m.key.startsWith("flap")
        ? "flap"
        : m.key === "aileron" || m.key === "elevator" || m.key === "stabilator"
          ? m.key
          : "rudder";
      // Horizontal hinges: axis toward +x so +angle = trailing edge down.
      // Vertical hinges: axis toward +y so +angle = trailing edge to the right.
      let a = m.a;
      let b = m.b;
      const ax = sub(b, a);
      const vertical = Math.abs(ax[1]) > Math.abs(ax[0]);
      if ((vertical && ax[1] < 0) || (!vertical && ax[0] < 0)) [a, b] = [b, a];
      this.movs.push({
        key: m.key,
        kind,
        side: m.side,
        parts: [{ geo: m.mesh.toGeometry(), mat: movMat ?? mat }],
        a,
        b,
      });
    }
    return res;
  }

  /** Retractable gear leg rotating about `axis` through `pivot` by `angleDeg` when up. */
  gearLeg(
    pivot: V3,
    axis: V3,
    angleDeg: number,
    build: (leg: LegBuilder) => void,
    hideWhenUp = true,
  ) {
    const leg: LegDef = { parts: [], pivot, axis: norm(axis), angle: angleDeg * DEG, hideWhenUp };
    build(this.legBuilder(leg.parts));
    this.legs.push(leg);
  }

  fixed(build: (leg: LegBuilder) => void) {
    build(this.legBuilder(this.fixedGear));
  }

  private legBuilder(parts: Part[]): LegBuilder {
    return {
      add: (g, mat) => parts.push({ geo: toGeo(g), mat }),
      wheel: (c, dia, width, opts) => {
        const w = wheel(c, dia, width, this.q.seg);
        parts.push({ geo: w.tire, mat: "rubber" }, { geo: w.hub, mat: opts?.hub ?? "metal" });
        this.wheels.push({ y: c[1] - dia / 2, z: c[2], tail: opts?.tail ?? false });
      },
    };
  }

  prop(p: PropDef) {
    this.propDefs.push(p);
  }

  lights(l: LightsDef) {
    this.lightsDef = l;
  }

  livery(fn: (p: LiveryPainter) => void) {
    this.paintFn = fn;
  }

  /** Fictional registration mark on both sides of the body, centred at (z, y). */
  registration(text: string, shape: BodyShape, z: number, y: number, h: number, color: string) {
    this.regs.push({ text, shape, z, y, h, color });
  }

  setCg(p: V3) {
    this.cg = p;
  }

  // ---- assembly -------------------------------------------------------------------------------

  finalize(meta: {
    id: string;
    label: string;
    dims: AircraftModelDimensions;
    tailwheel?: boolean;
  }): AircraftModel {
    const features: AircraftModelFeatures = {
      retractableGear: this.legs.length > 0,
      tailwheel: !!meta.tailwheel,
      stabilator: this.movs.some((m) => m.kind === "stabilator"),
      tTail: this.tTail,
      flapMaxDeg: this.movs.some((m) => m.kind === "flap") ? this.limits.flapMax : 0,
      engines: this.propDefs.length,
      jet: this.propDefs.some((p) => p.fan),
    };
    const disposables: { dispose(): void }[] = [];
    const hasDom = typeof document !== "undefined";
    const pal = this.pal;

    // 1. livery UVs (side projection) over fuselage/fin parts
    const liveryParts = [
      ...this.statics.filter((p) => p.mat === "livery"),
      ...this.movs.flatMap((m) => m.parts.filter((p) => p.mat === "livery")),
    ];
    const bb = new THREE.Box3();
    for (const p of liveryParts) {
      p.geo.computeBoundingBox();
      if (p.geo.boundingBox) bb.union(p.geo.boundingBox);
    }
    const pad = 0.02;
    const bounds: LiveryBounds = {
      z0: bb.min.z - pad,
      z1: bb.max.z + pad,
      y0: bb.min.y - pad,
      y1: bb.max.y + pad,
    };
    for (const p of liveryParts) {
      const pos = p.geo.getAttribute("position");
      const uv = p.geo.getAttribute("uv");
      for (let i = 0; i < pos.count; i++) {
        uv.setXY(
          i,
          (pos.getZ(i) - bounds.z0) / (bounds.z1 - bounds.z0),
          (pos.getY(i) - bounds.y0) / (bounds.y1 - bounds.y0),
        );
      }
      uv.needsUpdate = true;
    }

    // 2. materials
    const mats = new Map<MatKey, THREE.Material>();
    const std = (color: string, rough: number, metal: number) =>
      new THREE.MeshStandardMaterial({ color: css(color), roughness: rough, metalness: metal });
    const makeMat = (k: MatKey): THREE.Material => {
      switch (k) {
        case "livery": {
          if (hasDom && this.paintFn) {
            const painter = new LiveryPainter(bounds, this.q.tex, pal.base);
            this.paintFn(painter);
            const map = new THREE.CanvasTexture(painter.color);
            map.colorSpace = THREE.SRGBColorSpace;
            map.anisotropy = 4;
            const pbr = new THREE.CanvasTexture(painter.pbr);
            pbr.anisotropy = 4;
            disposables.push(map, pbr);
            return new THREE.MeshStandardMaterial({
              map,
              roughnessMap: pbr,
              metalnessMap: pbr,
              roughness: 1,
              metalness: 1,
            });
          }
          return std(pal.base, 0.36, 0.05);
        }
        case "paint":
          return std(pal.wing, 0.38, 0.05);
        case "accent":
          return std(pal.accent, 0.4, 0.05);
        case "metal":
          return std(pal.metal ?? "#c3c8cf", 0.3, 0.85);
        case "rubber":
          return std("#18191b", 0.85, 0);
        case "gear":
          return std(pal.gear, 0.45, 0.2);
        case "glass":
          return std("#1a2632", 0.06, 0.55);
        case "engine":
          return std("#33373d", 0.55, 0.45);
        case "spinner":
          return std(pal.spinner, 0.22, pal.spinnerMetal ?? 0.1);
        case "exhaust":
          return std("#4a4038", 0.5, 0.7);
        case "dark":
          return std("#23272c", 0.7, 0.1);
        case "intake":
          return std("#0b0d10", 0.95, 0);
        case "lensRed":
          return new THREE.MeshStandardMaterial({
            color: css("#b3121b"),
            emissive: css("#4d0004"),
            roughness: 0.15,
            metalness: 0.1,
          });
        case "lensGreen":
          return new THREE.MeshStandardMaterial({
            color: css("#0e9a43"),
            emissive: css("#003d15"),
            roughness: 0.15,
            metalness: 0.1,
          });
        case "lensClear":
          return std("#e6edf5", 0.08, 0.3);
      }
    };
    const mat = (k: MatKey) => {
      let m = mats.get(k);
      if (!m) {
        m = makeMat(k);
        mats.set(k, m);
      }
      return m;
    };

    const group = new THREE.Group();
    group.name = `aircraft-${meta.id}`;
    const inner = new THREE.Group();
    inner.position.set(-this.cg[0], -this.cg[1], -this.cg[2]);
    group.add(inner);

    const meshFrom = (parts: Part[], parent: THREE.Object3D, receive: boolean) => {
      const byMat = new Map<MatKey, THREE.BufferGeometry[]>();
      for (const p of parts) {
        const arr = byMat.get(p.mat) ?? [];
        arr.push(p.geo);
        byMat.set(p.mat, arr);
      }
      for (const [k, geos] of byMat) {
        const merged = geos.length === 1 ? geos[0] : mergeGeometries(normalize(geos), false);
        if (!merged) continue;
        for (const g of geos) if (g !== merged) g.dispose();
        merged.computeBoundingSphere();
        const mesh = new THREE.Mesh(merged, mat(k));
        mesh.castShadow = k !== "glass";
        mesh.receiveShadow = receive;
        parent.add(mesh);
        disposables.push(merged);
      }
    };

    // 3. static structure
    meshFrom(this.statics, inner, true);

    // 4. hinged surfaces
    const X = new THREE.Vector3(1, 0, 0);
    const movObjs: { obj: THREE.Object3D; base: THREE.Quaternion; kind: MovKind; side: number }[] =
      [];
    const parts: AircraftModel["parts"] = {};
    const elevatorGroup = new THREE.Group();
    elevatorGroup.name = "elevator";
    const flapObjs: THREE.Object3D[] = [];
    for (const m of this.movs) {
      const pivot = new THREE.Object3D();
      pivot.name = `${m.key}${m.side < 0 ? "-L" : m.side > 0 ? "-R" : ""}`;
      const axis = new THREE.Vector3(...norm(sub(m.b, m.a)));
      const base = new THREE.Quaternion().setFromUnitVectors(X, axis);
      pivot.position.set(...m.a);
      pivot.quaternion.copy(base);
      pivot.updateMatrix();
      const inv = pivot.matrix.clone().invert();
      for (const p of m.parts) p.geo.applyMatrix4(inv);
      meshFrom(m.parts, pivot, true);
      movObjs.push({ obj: pivot, base, kind: m.kind, side: m.side });
      if (m.kind === "elevator" || m.kind === "stabilator") {
        elevatorGroup.add(pivot);
      } else {
        inner.add(pivot);
        if (m.kind === "aileron") {
          if (m.side < 0) parts.aileronL ??= pivot;
          else parts.aileronR ??= pivot;
        } else if (m.kind === "rudder") parts.rudder ??= pivot;
        else if (m.kind === "flap") flapObjs.push(pivot);
      }
    }
    if (elevatorGroup.children.length) {
      inner.add(elevatorGroup);
      parts.elevator = elevatorGroup;
    }
    if (flapObjs.length) parts.flaps = flapObjs;

    // 5. landing gear
    const gearGroup = new THREE.Group();
    gearGroup.name = "gear";
    meshFrom(this.fixedGear, gearGroup, false);
    const legObjs: { obj: THREE.Object3D; base: THREE.Quaternion; angle: number; hide: boolean }[] =
      [];
    for (const l of this.legs) {
      const pivot = new THREE.Object3D();
      const base = new THREE.Quaternion().setFromUnitVectors(X, new THREE.Vector3(...l.axis));
      pivot.position.set(...l.pivot);
      pivot.quaternion.copy(base);
      pivot.updateMatrix();
      const inv = pivot.matrix.clone().invert();
      for (const p of l.parts) p.geo.applyMatrix4(inv);
      meshFrom(l.parts, pivot, false);
      gearGroup.add(pivot);
      legObjs.push({ obj: pivot, base, angle: l.angle, hide: l.hideWhenUp });
    }
    inner.add(gearGroup);
    parts.gear = gearGroup;

    // 6. propellers / fans
    const tipRGB = css(pal.propTip);
    const bladeRGB = css(pal.propBlade ?? "#121213");
    const props: THREE.Object3D[] = [];
    const propRt: {
      obj: THREE.Object3D;
      dir: number;
      fan: boolean;
      blades: THREE.Object3D;
      disc: THREE.Mesh | null;
    }[] = [];
    let discMat: THREE.MeshBasicMaterial | null = null;
    let bladeMat: THREE.MeshStandardMaterial | null = null;
    let fanMat: THREE.MeshStandardMaterial | null = null;
    for (const p of this.propDefs) {
      const obj = new THREE.Object3D();
      obj.name = p.fan ? "fan" : "propeller";
      obj.position.set(...p.at);
      const R = p.diameter / 2;
      const tipBand = p.fan ? 0 : (p.tipBand ?? Math.min(0.1, 0.11 / R));
      const blade = propeller(
        {
          radius: R,
          root: p.spinnerR * 0.55,
          chord: p.chord,
          pitch: p.pitch,
          dir: p.dir,
          stations: p.fan ? 3 : this.q.bladeStations,
          K: p.fan ? 3 : Math.max(4, Math.round(this.q.K * 0.6)),
          tipBand,
          bladeColor: p.fan ? [0.22, 0.24, 0.27] : [bladeRGB.r, bladeRGB.g, bladeRGB.b],
          tipColor: [tipRGB.r, tipRGB.g, tipRGB.b],
          shape: p.shape ?? (p.fan ? "fan" : "paddle"),
        },
        p.blades,
        0.35,
      );
      const bgeo = blade.toGeometry();
      disposables.push(bgeo);
      let bm: THREE.Material;
      if (p.fan) {
        fanMat ??= new THREE.MeshStandardMaterial({
          vertexColors: true,
          roughness: 0.35,
          metalness: 0.7,
        });
        bm = fanMat;
      } else {
        bladeMat ??= new THREE.MeshStandardMaterial({
          vertexColors: true,
          roughness: 0.55,
          metalness: 0.15,
        });
        bm = bladeMat;
      }
      const bladesMesh = new THREE.Mesh(bgeo, bm);
      bladesMesh.castShadow = true;
      obj.add(bladesMesh);
      const sp = spinner(
        p.spinnerLen,
        p.spinnerR,
        this.q.seg,
        p.spinnerBack ?? 0.3,
        p.bluntness ?? 0.6,
      ).toGeometry();
      disposables.push(sp);
      const spMesh = new THREE.Mesh(sp, mat(p.fan ? "metal" : "spinner"));
      spMesh.castShadow = true;
      obj.add(spMesh);
      let disc: THREE.Mesh | null = null;
      if (!p.fan && hasDom) {
        if (!discMat) {
          const tex = new THREE.CanvasTexture(
            propDiscCanvas(
              `rgba(${Math.round(tipRGB.r * 255)},${Math.round(tipRGB.g * 255)},${Math.round(tipRGB.b * 255)},0.42)`,
              1 - tipBand,
            ),
          );
          tex.colorSpace = THREE.SRGBColorSpace;
          disposables.push(tex);
          discMat = new THREE.MeshBasicMaterial({
            map: tex,
            transparent: true,
            depthWrite: false,
            side: THREE.DoubleSide,
            opacity: 0,
          });
        }
        const dg = new THREE.RingGeometry(p.spinnerR * 0.8, R, 48, 1);
        disposables.push(dg);
        disc = new THREE.Mesh(dg, discMat);
        disc.visible = false;
        disc.renderOrder = 2;
        obj.add(disc);
      }
      inner.add(obj);
      props.push(obj);
      propRt.push({ obj, dir: p.dir, fan: !!p.fan, blades: bladesMesh, disc });
    }
    for (const m of [discMat, bladeMat, fanMat]) if (m) disposables.push(m);

    // 7. registration decals
    if (hasDom) {
      for (const r of this.regs) {
        const cv = registrationCanvas(r.text, r.color);
        const tex = new THREE.CanvasTexture(cv);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = 4;
        const w = (r.h * cv.width) / cv.height;
        const m = new THREE.MeshStandardMaterial({
          map: tex,
          transparent: true,
          roughness: 0.4,
          metalness: 0,
          polygonOffset: true,
          polygonOffsetFactor: -2,
          depthWrite: false,
        });
        disposables.push(tex, m);
        for (const side of [1, -1]) {
          const g = conformalDecal(r.shape, r.z, r.y, w, r.h, side, 8, 2);
          disposables.push(g);
          const mesh = new THREE.Mesh(g, m);
          mesh.renderOrder = 1;
          inner.add(mesh);
        }
      }
    }

    // 8. lights
    const L = this.lightsDef ?? {
      navL: [-5, 0, 0] as V3,
      navR: [5, 0, 0] as V3,
      beacons: [[0, 1, 5] as V3],
      strobes: [],
      landing: { pos: [0, 0, -1] as V3, dir: [0, -0.05, -1] as V3 },
      size: 1,
    };
    let glowTex: THREE.Texture | null = null;
    if (hasDom) {
      glowTex = new THREE.CanvasTexture(glowCanvas());
      disposables.push(glowTex);
    }
    const glowMat = (color: string) => {
      const m = new THREE.SpriteMaterial({
        color: css(color),
        ...(glowTex ? { map: glowTex } : {}),
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      disposables.push(m);
      return m;
    };
    const makeGlow = (at: V3, m: THREE.SpriteMaterial, size: number, name: string) => {
      const s = new THREE.Sprite(m);
      s.scale.setScalar(size * L.size);
      s.position.set(...at);
      s.name = name;
      s.visible = false;
      inner.add(s);
      return s;
    };
    const redM = glowMat("#ff3326");
    const greenM = glowMat("#3dff6e");
    const whiteM = glowMat("#ffffff");
    const warmM = glowMat("#fff1d6");
    const navL = makeGlow(L.navL, redM, 0.55, "nav-left");
    const navR = makeGlow(L.navR, greenM, 0.55, "nav-right");
    const beaconGroup = new THREE.Group();
    beaconGroup.name = "beacon";
    beaconGroup.visible = false;
    for (const b of L.beacons) {
      const s = makeGlow(b, redM, 0.9, "beacon-glow");
      s.visible = true;
      inner.remove(s);
      beaconGroup.add(s);
    }
    inner.add(beaconGroup);
    const strobes = L.strobes.map((s, i) => makeGlow(s, whiteM, 1.4, `strobe-${i}`));
    const landing = new THREE.SpotLight(0xfff4e0, 0, 1400, 0.3, 0.45, 2);
    landing.position.set(...L.landing.pos);
    const target = new THREE.Object3D();
    const d = norm(L.landing.dir);
    target.position.set(
      L.landing.pos[0] + d[0] * 60,
      L.landing.pos[1] + d[1] * 60,
      L.landing.pos[2] + d[2] * 60,
    );
    landing.target = target;
    landing.name = "landing-light";
    inner.add(landing, target);
    const lampGlow = makeGlow(L.landing.pos, warmM, 0.8, "landing-glow");

    // 9. ground reference
    let minY = Infinity;
    let mainZ = 0;
    let tail: { y: number; z: number } | null = null;
    for (const w of this.wheels) {
      if (w.tail) tail = { y: w.y, z: w.z };
      else if (w.y < minY) {
        minY = w.y;
        mainZ = w.z;
      }
    }
    if (!isFinite(minY)) minY = this.cg[1] - 1;
    const gearDrop = this.cg[1] - minY;
    const groundPitchDeg =
      meta.tailwheel && tail ? Math.atan2(tail.y - minY, tail.z - mainZ) / DEG : 0;

    // 10. runtime
    for (const m of mats.values()) disposables.push(m);
    const lim = this.limits;
    const cur = { e: 0, a: 0, r: 0, f: 0 };
    const tq = new THREE.Quaternion();
    const TWO_PI = Math.PI * 2;
    const doubleStrobe = !!L.doubleStrobe;

    const update = (s: AircraftModelState) => {
      const dt = clamp(s.dt, 0, 0.25);
      const k = dt > 0 ? 1 - Math.exp(-dt / 0.06) : 0;
      cur.e += (clamp(s.elevator, -1, 1) - cur.e) * k;
      cur.a += (clamp(s.aileron, -1, 1) - cur.a) * k;
      cur.r += (clamp(s.rudder, -1, 1) - cur.r) * k;
      cur.f +=
        (clamp(s.flapsDeg, 0, lim.flapMax) - cur.f) * (dt > 0 ? 1 - Math.exp(-dt / 0.15) : 0);
      const elevAng = (cur.e > 0 ? -cur.e * lim.elevator[0] : -cur.e * lim.elevator[1]) * DEG;
      for (const m of movObjs) {
        let ang = 0;
        switch (m.kind) {
          case "aileron": {
            const a = m.side < 0 ? -cur.a : cur.a; // +: this aileron trailing edge up
            ang = (a > 0 ? -a * lim.aileron[0] : -a * lim.aileron[1]) * DEG;
            break;
          }
          case "elevator":
          case "stabilator":
            ang = elevAng;
            break;
          case "rudder":
            ang = cur.r * lim.rudder * DEG;
            break;
          case "flap":
            ang = cur.f * DEG;
            break;
        }
        m.obj.quaternion.copy(m.base).multiply(tq.setFromAxisAngle(X, ang));
      }
      const g = clamp(s.gearPosition, 0, 1);
      for (const l of legObjs) {
        l.obj.quaternion.copy(l.base).multiply(tq.setFromAxisAngle(X, (1 - g) * l.angle));
        l.obj.visible = !(l.hide && g < 0.02);
      }
      for (const p of propRt) {
        let omega: number;
        if (p.fan) omega = (clamp(s.rpm, 0, 110) / 100) * TWO_PI * 2.5;
        else omega = (Math.max(0, s.rpm) / 60) * TWO_PI;
        p.obj.rotation.z = (p.obj.rotation.z + p.dir * omega * dt) % TWO_PI;
        if (p.disc) {
          const blur = clamp((s.rpm - 380) / 500, 0, 1);
          p.disc.visible = blur > 0.01;
          p.blades.visible = blur < 0.85;
          if (discMat) discMat.opacity = blur;
        }
      }
      navL.visible = s.lights.nav;
      navR.visible = s.lights.nav;
      const tb = s.t % 1;
      beaconGroup.visible = s.lights.beacon && tb < 0.12;
      const ts = s.t % (doubleStrobe ? 1.0 : 1.15);
      const flash = doubleStrobe ? ts < 0.05 || (ts > 0.13 && ts < 0.18) : ts < 0.06;
      for (const st of strobes) st.visible = s.lights.strobe && flash;
      const on = s.lights.landing || s.lights.taxi;
      landing.intensity = s.lights.landing ? 3200 * L.size : s.lights.taxi ? 1300 * L.size : 0;
      landing.angle = s.lights.landing ? 0.28 : 0.55;
      lampGlow.visible = on;
    };

    let triangles = 0;
    group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh && mesh.geometry) {
        const ix = mesh.geometry.getIndex();
        triangles += ix ? ix.count / 3 : mesh.geometry.getAttribute("position").count / 3;
      }
    });

    let disposed = false;
    const dispose = () => {
      if (disposed) return;
      disposed = true;
      for (const d of disposables) d.dispose();
      group.removeFromParent();
    };

    return {
      group,
      gearDrop,
      props,
      parts,
      lights: { navL, navR, beacon: beaconGroup, strobes, landing },
      update,
      dispose,
      id: meta.id,
      label: meta.label,
      groundPitchDeg,
      dimensions: meta.dims,
      triangles,
      features,
    };
  }
}

function toGeo(g: Geo): THREE.BufferGeometry {
  return g instanceof MeshBuilder ? g.toGeometry() : g;
}

/** Make attribute sets compatible for merging (position/normal/uv, indexed). */
function normalize(geos: THREE.BufferGeometry[]): THREE.BufferGeometry[] {
  return geos.map((g) => {
    let out = g;
    if (!out.getIndex()) {
      const n = out.getAttribute("position").count;
      const idx: number[] = [];
      for (let i = 0; i < n; i++) idx.push(i);
      out.setIndex(idx);
    }
    if (!out.getAttribute("normal")) out.computeVertexNormals();
    if (!out.getAttribute("uv")) {
      out.setAttribute(
        "uv",
        new THREE.Float32BufferAttribute(
          new Float32Array(out.getAttribute("position").count * 2),
          2,
        ),
      );
    }
    if (out.getAttribute("color")) {
      out = out.clone();
      out.deleteAttribute("color");
    }
    return out;
  });
}

/** Grid decal hugging a lofted body side (side = +1 right, −1 left), text reading nose→tail correctly. */
function conformalDecal(
  shape: BodyShape,
  zc: number,
  yc: number,
  w: number,
  h: number,
  side: number,
  nu: number,
  nv: number,
): THREE.BufferGeometry {
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (let j = 0; j <= nv; j++) {
    for (let i = 0; i <= nu; i++) {
      const u = i / nu;
      const v = j / nv;
      // right side (+x) is seen with the nose on the right → text must run tail→nose in z
      const z = side > 0 ? zc + w / 2 - u * w : zc - w / 2 + u * w;
      const y = yc - h / 2 + v * h;
      const x = shape.xAt(z, y) + 0.006;
      pos.push(side * x, y, z);
      uv.push(u, v);
    }
  }
  for (let j = 0; j < nv; j++) {
    for (let i = 0; i < nu; i++) {
      const a = j * (nu + 1) + i;
      const b = a + 1;
      const c = a + nu + 2;
      const d = a + nu + 1;
      // z runs opposite ways on the two sides, so the same winding faces outward on both
      idx.push(a, b, d, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
