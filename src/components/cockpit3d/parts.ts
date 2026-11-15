/**
 * Cockpit 3D parts library — original procedural geometry for building realistic-looking
 * cockpits without external models or textures.
 *
 * Conventions (see README.md):
 *  - Units are metres. Every panel-mounted part is built facing +z (toward the pilot) with its
 *    mounting face at z = 0, "up" = +y. Floor parts face +y. Place parts with .position/.rotation.
 *  - Materials, cached geometries and cached textures are SHARED (userData.shared = true) and are
 *    never disposed by the viewer. Anything else created here (unique panels, gauge faces…) is
 *    disposed automatically when the viewer unmounts.
 *  - Functions are only safe to call in the browser (they create <canvas> textures). Call them from
 *    `CockpitDefinition.build()`, never at module top level.
 */
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

// ============================================================================ caches

type WithUserData = { userData: Record<string, unknown> };

/** Mark a resource as shared (never disposed by the viewer). */
export function markShared<T extends WithUserData>(x: T): T {
  x.userData["shared"] = true;
  return x;
}

const matCache = new Map<string, THREE.Material>();
const geoCache = new Map<string, THREE.BufferGeometry>();
const texCache = new Map<string, THREE.Texture>();

function cachedMat<T extends THREE.Material>(key: string, make: () => T): T {
  let m = matCache.get(key);
  if (!m) {
    m = markShared(make());
    m.name = key;
    matCache.set(key, m);
  }
  return m as T;
}

function cachedGeo(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
  let g = geoCache.get(key);
  if (!g) {
    g = markShared(make());
    geoCache.set(key, g);
  }
  return g;
}

function cachedTex(key: string, make: () => THREE.Texture): THREE.Texture {
  let t = texCache.get(key);
  if (!t) {
    t = markShared(make());
    texCache.set(key, t);
  }
  return t;
}

const r3 = (n: number) => Math.round(n * 1e4) / 1e4;

// ============================================================================ canvas helpers

export function makeCanvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("2D canvas not available");
  return { canvas: c, ctx };
}

function canvasTexture(canvas: HTMLCanvasElement, srgb = true, repeat?: number) {
  const t = new THREE.CanvasTexture(canvas);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat, repeat);
  }
  return t;
}

/** Deterministic pseudo-random generator (so textures look the same every load). */
function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
}

export const FONT = "Inter, 'Helvetica Neue', Arial, system-ui, sans-serif";

function noiseTexture(key: string, size: number, draw: (ctx: CanvasRenderingContext2D) => void) {
  return cachedTex(key, () => {
    const { canvas, ctx } = makeCanvas(size, size);
    draw(ctx);
    return canvasTexture(canvas, true, 1);
  });
}

/** Fine paint grain (multiplies the material colour; values near white). */
export function grainTexture() {
  return noiseTexture("tex:grain", 256, (ctx) => {
    const img = ctx.createImageData(256, 256);
    const rand = rng(7);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = 228 + rand() * 27;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  });
}

function brushedTexture() {
  return noiseTexture("tex:brushed", 256, (ctx) => {
    ctx.fillStyle = "#d8d8d8";
    ctx.fillRect(0, 0, 256, 256);
    const rand = rng(11);
    for (let i = 0; i < 900; i++) {
      const y = rand() * 256;
      const v = 170 + rand() * 85;
      ctx.strokeStyle = `rgba(${v},${v},${v},0.55)`;
      ctx.lineWidth = rand() * 1.2 + 0.2;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(256, y + (rand() - 0.5) * 2);
      ctx.stroke();
    }
  });
}

function weaveTexture() {
  return noiseTexture("tex:weave", 128, (ctx) => {
    ctx.fillStyle = "#cfcfcf";
    ctx.fillRect(0, 0, 128, 128);
    for (let y = 0; y < 128; y += 4) {
      for (let x = 0; x < 128; x += 4) {
        const odd = ((x + y) / 4) % 2 === 0;
        ctx.fillStyle = odd ? "#f2f2f2" : "#a9a9a9";
        ctx.fillRect(x, y, odd ? 4 : 3, odd ? 3 : 4);
      }
    }
  });
}

function leatherTexture() {
  return noiseTexture("tex:leather", 256, (ctx) => {
    ctx.fillStyle = "#e6e6e6";
    ctx.fillRect(0, 0, 256, 256);
    const rand = rng(23);
    for (let i = 0; i < 2600; i++) {
      const v = 150 + rand() * 100;
      ctx.fillStyle = `rgba(${v},${v},${v},0.35)`;
      ctx.beginPath();
      ctx.arc(rand() * 256, rand() * 256, rand() * 3 + 0.6, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

function carpetTexture() {
  return noiseTexture("tex:carpet", 256, (ctx) => {
    const img = ctx.createImageData(256, 256);
    const rand = rng(31);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = 150 + rand() * 105;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  });
}

function screwHeadTexture() {
  return noiseTexture("tex:screw", 64, (ctx) => {
    const g = ctx.createRadialGradient(26, 24, 2, 32, 32, 32);
    g.addColorStop(0, "#f0f0f0");
    g.addColorStop(1, "#8a8a8a");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    ctx.strokeStyle = "#2a2a2a";
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(14, 32);
    ctx.lineTo(50, 32);
    ctx.moveTo(32, 14);
    ctx.lineTo(32, 50);
    ctx.stroke();
  });
}

// ============================================================================ materials

function std(p: THREE.MeshStandardMaterialParameters) {
  return new THREE.MeshStandardMaterial(p);
}

function withRepeat(t: THREE.Texture, n: number, key: string): THREE.Texture {
  // Clone so different materials can use different repeats (clones share the image).
  return cachedTex(`${key}:${n}`, () => {
    const c = t.clone();
    c.wrapS = c.wrapT = THREE.RepeatWrapping;
    c.repeat.set(n, n);
    c.needsUpdate = true;
    return c;
  });
}

/**
 * Shared materials. Each call returns the same cached instance for the same arguments.
 * Colours are hex numbers (sRGB).
 */
export const MAT = {
  /** Matte instrument-panel paint (default dark grey). */
  panelPaint: (color = 0x2b2e33, roughness = 0.82) =>
    cachedMat(`panel:${color}:${roughness}`, () =>
      std({ color, roughness, metalness: 0.05, map: withRepeat(grainTexture(), 6, "grain") }),
    ),
  /** Generic paint. */
  paint: (color: number, roughness = 0.6, metalness = 0.05) =>
    cachedMat(`paint:${color}:${roughness}:${metalness}`, () =>
      std({ color, roughness, metalness }),
    ),
  satinBlack: () =>
    cachedMat("satinBlack", () => std({ color: 0x151618, roughness: 0.55, metalness: 0.1 })),
  glossBlack: () =>
    cachedMat("glossBlack", () => std({ color: 0x0b0c0d, roughness: 0.22, metalness: 0.2 })),
  brushedMetal: (color = 0xb9bec4) =>
    cachedMat(`brushed:${color}`, () =>
      std({
        color,
        roughness: 0.38,
        metalness: 0.85,
        map: withRepeat(brushedTexture(), 2, "brushed"),
      }),
    ),
  chrome: () => cachedMat("chrome", () => std({ color: 0xe8ebef, roughness: 0.12, metalness: 1 })),
  /** Bare / painted aluminium structure (frames, tubes). */
  aluminium: (color = 0x9aa1a8) =>
    cachedMat(`alu:${color}`, () => std({ color, roughness: 0.45, metalness: 0.7 })),
  leather: (color = 0x2b211c) =>
    cachedMat(`leather:${color}`, () => {
      const t = withRepeat(leatherTexture(), 3, "leather");
      return std({ color, roughness: 0.68, metalness: 0.02, map: t, bumpMap: t, bumpScale: 0.6 });
    }),
  fabric: (color = 0x3a3f47) =>
    cachedMat(`fabric:${color}`, () => {
      const t = withRepeat(weaveTexture(), 10, "weave");
      return std({ color, roughness: 0.95, metalness: 0, map: t, bumpMap: t, bumpScale: 0.4 });
    }),
  carpet: (color = 0x2a2c30) =>
    cachedMat(`carpet:${color}`, () => {
      const t = withRepeat(carpetTexture(), 6, "carpet");
      return std({ color, roughness: 1, metalness: 0, map: t, bumpMap: t, bumpScale: 0.8 });
    }),
  rubber: () => cachedMat("rubber", () => std({ color: 0x141414, roughness: 0.92, metalness: 0 })),
  /** Moulded interior plastic (sidewalls, headliner trims). */
  plastic: (color = 0x8d8a84, roughness = 0.7) =>
    cachedMat(`plastic:${color}:${roughness}`, () =>
      std({ color, roughness, metalness: 0, map: withRepeat(grainTexture(), 4, "grain") }),
    ),
  /** Lightly tinted window glass (subtle reflection; does not occlude the outside). */
  glass: (tint = 0x9fc3d6, opacity = 0.1) =>
    cachedMat(`glass:${tint}:${opacity}`, () =>
      std({
        color: tint,
        roughness: 0.04,
        metalness: 0.1,
        transparent: true,
        opacity,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    ),
  /** Instrument cover glass. */
  gaugeGlass: () =>
    cachedMat("gaugeGlass", () =>
      std({
        color: 0xffffff,
        roughness: 0.05,
        metalness: 0.2,
        transparent: true,
        opacity: 0.08,
        depthWrite: false,
      }),
    ),
  instrumentFace: () =>
    cachedMat("instFace", () => std({ color: 0x0c0d0f, roughness: 0.75, metalness: 0 })),
  placardWhite: () =>
    cachedMat("placardWhite", () => std({ color: 0xeeeeea, roughness: 0.6, metalness: 0 })),
  /** Self-lit colour (lamps, LEDs). */
  emissive: (color: number, intensity = 1.5) =>
    cachedMat(`emis:${color}:${intensity}`, () =>
      std({ color: 0x111111, emissive: color, emissiveIntensity: intensity, roughness: 0.4 }),
    ),
  /** Varnished wood (vintage panels / trim). */
  wood: (color = 0x6b4325) =>
    cachedMat(`wood:${color}`, () =>
      std({
        color,
        roughness: 0.42,
        metalness: 0,
        map: withRepeat(brushedTexture(), 3, "brushed"),
      }),
    ),
  /** Needle / pointer white (very slightly self-lit so it reads in shadow). */
  needle: (color = 0xf4f4f0) =>
    cachedMat(`needle:${color}`, () =>
      std({ color, emissive: color, emissiveIntensity: 0.12, roughness: 0.5 }),
    ),
};

// ============================================================================ geometry helpers

/** Create a mesh. */
export function mesh(
  geo: THREE.BufferGeometry,
  mat: THREE.Material,
  name?: string,
): THREE.Mesh<THREE.BufferGeometry, THREE.Material> {
  const m = new THREE.Mesh(geo, mat);
  if (name) m.name = name;
  return m;
}

/** Set position (and optional Euler rotation in radians) in one call; returns the object. */
export function place<T extends THREE.Object3D>(
  o: T,
  x: number,
  y: number,
  z: number,
  rx = 0,
  ry = 0,
  rz = 0,
): T {
  o.position.set(x, y, z);
  o.rotation.set(rx, ry, rz);
  return o;
}

/** Group helper: `group("name", child1, child2…)`. */
export function group(name: string, ...children: THREE.Object3D[]): THREE.Group {
  const g = new THREE.Group();
  g.name = name;
  if (children.length) g.add(...children);
  return g;
}

/** Cached rounded box geometry (centred). */
export function roundedBoxGeo(w: number, h: number, d: number, radius = 0.003, segments = 2) {
  const rr = Math.min(radius, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4);
  return cachedGeo(`rbox:${r3(w)}:${r3(h)}:${r3(d)}:${r3(rr)}:${segments}`, () =>
    rr > 0.0002 ? new RoundedBoxGeometry(w, h, d, segments, rr) : new THREE.BoxGeometry(w, h, d),
  );
}

export function roundedBox(
  w: number,
  h: number,
  d: number,
  mat: THREE.Material,
  radius = 0.003,
): THREE.Mesh {
  return mesh(roundedBoxGeo(w, h, d, radius), mat);
}

/** Cached cylinder geometry, axis along +z (faces the pilot), from z = 0 to z = length. */
export function cylinderZGeo(rFront: number, rBack: number, length: number, segments = 24) {
  return cachedGeo(`cylz:${r3(rFront)}:${r3(rBack)}:${r3(length)}:${segments}`, () => {
    const g = new THREE.CylinderGeometry(rFront, rBack, length, segments);
    g.rotateX(Math.PI / 2);
    g.translate(0, 0, length / 2);
    return g;
  });
}

/** Cached cylinder along +y from y = 0 to y = length. */
export function cylinderYGeo(rTop: number, rBottom: number, length: number, segments = 20) {
  return cachedGeo(`cyly:${r3(rTop)}:${r3(rBottom)}:${r3(length)}:${segments}`, () => {
    const g = new THREE.CylinderGeometry(rTop, rBottom, length, segments);
    g.translate(0, length / 2, 0);
    return g;
  });
}

/** Lathe geometry from [radius, z] pairs, revolved around the z axis (faces +z). Cached by key. */
export function latheZGeo(key: string, profile: Array<[number, number]>, segments = 40) {
  return cachedGeo(`lathe:${key}:${segments}`, () => {
    const pts = profile.map(([r, z]) => new THREE.Vector2(r, z));
    const g = new THREE.LatheGeometry(pts, segments);
    g.rotateX(Math.PI / 2);
    return g;
  });
}

const _up = new THREE.Vector3(0, 1, 0);

/** A cylinder (rod / tube) between two points. */
export function rod(
  a: THREE.Vector3,
  b: THREE.Vector3,
  radius: number,
  mat: THREE.Material,
  segments = 12,
): THREE.Mesh {
  const len = a.distanceTo(b);
  const m = mesh(cylinderYGeo(radius, radius, len, segments), mat);
  m.position.copy(a);
  const dir = b.clone().sub(a).normalize();
  m.quaternion.setFromUnitVectors(_up, dir);
  return m;
}

/** A smooth tube through points (frames, yoke horns, grab handles). Unique geometry. */
export function tubePath(
  points: THREE.Vector3[],
  radius: number,
  mat: THREE.Material,
  opts: { segments?: number; radial?: number; closed?: boolean; tension?: number } = {},
): THREE.Mesh {
  const curve = new THREE.CatmullRomCurve3(
    points,
    opts.closed ?? false,
    "catmullrom",
    opts.tension ?? 0.5,
  );
  const geo = new THREE.TubeGeometry(
    curve,
    opts.segments ?? Math.max(16, points.length * 10),
    radius,
    opts.radial ?? 12,
    opts.closed ?? false,
  );
  return mesh(geo, mat);
}

/** Invisible, raycastable proxy box — makes small controls easier to hover/click. */
export function hitBox(w: number, h: number, d: number): THREE.Mesh {
  const m = mesh(
    cachedGeo(`hit:${r3(w)}:${r3(h)}:${r3(d)}`, () => new THREE.BoxGeometry(w, h, d)),
    cachedMat("hit", () => new THREE.MeshBasicMaterial({ visible: false })),
    "hit",
  );
  m.userData["hitProxy"] = true;
  m.visible = false;
  return m;
}

// ============================================================================ text / placards

export interface PlacardOptions {
  /** Width in metres. Height follows the text aspect unless given. */
  width?: number;
  height?: number;
  /** Text colour (CSS). */
  color?: string;
  /** Background (CSS) or null for transparent (text only). */
  background?: string | null;
  weight?: number;
  font?: string;
  align?: "center" | "left" | "right";
  /** Canvas pixels per line (quality). */
  px?: number;
  /** Border colour (CSS) for engraved plates. */
  border?: string;
  /** Self-lit text (backlit placards). */
  lit?: boolean;
}

/** Draw text lines to a canvas sized to fit. */
function textCanvas(lines: string[], o: PlacardOptions) {
  const px = o.px ?? 64;
  const font = o.font ?? FONT;
  const weight = o.weight ?? 650;
  const probe = makeCanvas(8, 8).ctx;
  probe.font = `${weight} ${px}px ${font}`;
  const textW = Math.max(...lines.map((l) => probe.measureText(l).width), px * 0.5);
  const pad = px * 0.35;
  const lineH = px * 1.12;
  const W = Math.ceil(textW + pad * 2);
  const H = Math.ceil(lineH * lines.length + pad * 1.2);
  const { canvas, ctx } = makeCanvas(W, H);
  if (o.background) {
    ctx.fillStyle = o.background;
    ctx.fillRect(0, 0, W, H);
  }
  if (o.border) {
    ctx.strokeStyle = o.border;
    ctx.lineWidth = px * 0.06;
    ctx.strokeRect(px * 0.08, px * 0.08, W - px * 0.16, H - px * 0.16);
  }
  ctx.font = `${weight} ${px}px ${font}`;
  ctx.fillStyle = o.color ?? "#ecece6";
  ctx.textBaseline = "middle";
  const align = o.align ?? "center";
  ctx.textAlign = align;
  const x = align === "center" ? W / 2 : align === "left" ? pad : W - pad;
  lines.forEach((l, i) => ctx.fillText(l, x, pad * 0.6 + lineH * (i + 0.5)));
  return canvas;
}

/**
 * Text placard (engraved label, warning plate…). A plane facing +z, centred on the origin.
 * Textures are cached by text + style; place it ~0.3 mm in front of the surface.
 */
export function placard(text: string | string[], o: PlacardOptions = {}): THREE.Mesh {
  const lines = Array.isArray(text) ? text : [text];
  const key = `plac:${lines.join("\n")}:${o.color}:${o.background}:${o.weight}:${o.font}:${o.align}:${o.px}:${o.border}`;
  const tex = cachedTex(key, () => canvasTexture(textCanvas(lines, o)));
  const img = tex.image as HTMLCanvasElement;
  const aspect = img.height / img.width;
  const w = o.width ?? (o.height ? o.height / aspect : 0.04);
  const h = o.height ?? w * aspect;
  const mat = cachedMat(`placmat:${key}:${o.lit ? 1 : 0}`, () =>
    o.lit
      ? new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false })
      : std({
          map: tex,
          transparent: !o.background,
          roughness: 0.75,
          metalness: 0,
          polygonOffset: true,
          polygonOffsetFactor: -2,
        }),
  );
  const m = mesh(
    cachedGeo(`plane:${r3(w)}:${r3(h)}`, () => new THREE.PlaneGeometry(w, h)),
    mat,
    `placard:${lines[0]}`,
  );
  m.position.z = 0.0003;
  return m;
}

// ============================================================================ fasteners

/**
 * Screw heads / rivets as one InstancedMesh (one draw call). Points are [x, y] on a surface
 * facing +z at z = 0 (or full [x, y, z]).
 */
export function screws(
  points: Array<[number, number] | [number, number, number]>,
  o: { radius?: number; style?: "phillips" | "rivet"; color?: number } = {},
): THREE.InstancedMesh {
  const r = o.radius ?? 0.0022;
  const style = o.style ?? "phillips";
  const geo =
    style === "rivet"
      ? cachedGeo(`rivet:${r3(r)}`, () => {
          const g = new THREE.SphereGeometry(r, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2);
          g.rotateX(Math.PI / 2);
          g.scale(1, 1, 0.45);
          return g;
        })
      : cylinderZGeo(r, r, r * 0.55, 14);
  const mat =
    style === "rivet"
      ? MAT.aluminium(o.color ?? 0x8f969d)
      : cachedMat(`screwMat:${o.color ?? 0}`, () =>
          std({
            color: o.color ?? 0xb7bcc2,
            roughness: 0.35,
            metalness: 0.9,
            map: screwHeadTexture(),
          }),
        );
  const im = new THREE.InstancedMesh(geo, mat, points.length);
  const m4 = new THREE.Matrix4();
  points.forEach((p, i) => {
    m4.makeRotationZ(((i * 37) % 90) * (Math.PI / 180));
    m4.setPosition(p[0], p[1], p[2] ?? 0);
    im.setMatrixAt(i, m4);
  });
  im.instanceMatrix.needsUpdate = true;
  im.computeBoundingSphere();
  im.name = "screws";
  return im;
}

/** Evenly spaced rivets between two points. */
export function rivetLine(
  from: THREE.Vector3,
  to: THREE.Vector3,
  count: number,
  radius = 0.0018,
): THREE.InstancedMesh {
  const pts: Array<[number, number, number]> = [];
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0.5 : i / (count - 1);
    pts.push([
      from.x + (to.x - from.x) * t,
      from.y + (to.y - from.y) * t,
      from.z + (to.z - from.z) * t,
    ]);
  }
  return screws(pts, { radius, style: "rivet" });
}

/** Four corner screws for a rectangle w × h (inset). */
export function cornerScrews(w: number, h: number, inset = 0.008, radius = 0.0022) {
  const x = w / 2 - inset;
  const y = h / 2 - inset;
  return screws(
    [
      [-x, y],
      [x, y],
      [-x, -y],
      [x, -y],
    ],
    { radius },
  );
}

// ============================================================================ panels

export type Cutout =
  { x: number; y: number; r: number } | { x: number; y: number; w: number; h: number; r?: number };

function roundedRectPath(
  p: THREE.Path | THREE.Shape,
  cx: number,
  cy: number,
  w: number,
  h: number,
  r: number,
) {
  const x = cx - w / 2;
  const y = cy - h / 2;
  const rr = Math.max(0.0001, Math.min(r, w / 2, h / 2));
  p.moveTo(x + rr, y);
  p.lineTo(x + w - rr, y);
  p.quadraticCurveTo(x + w, y, x + w, y + rr);
  p.lineTo(x + w, y + h - rr);
  p.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  p.lineTo(x + rr, y + h);
  p.quadraticCurveTo(x, y + h, x, y + h - rr);
  p.lineTo(x, y + rr);
  p.quadraticCurveTo(x, y, x + rr, y);
}

export interface PanelOptions {
  width: number;
  height: number;
  /** Sheet thickness (m), default 6 mm. */
  thickness?: number;
  cornerRadius?: number;
  /** Bevel size on the front edges (m). */
  bevel?: number;
  /** Instrument holes, in panel coordinates (origin = panel centre). */
  holes?: Cutout[];
  /** Arch the top edge upward by this much at the centre (m) — typical under a glareshield. */
  topArch?: number;
  /** Custom outline (overrides width/height rectangle), counter-clockwise [x, y] points. */
  outline?: Array<[number, number]>;
  material?: THREE.Material;
}

/**
 * Flat panel with instrument cut-outs (extruded, bevelled). Front face at z = 0, extends to
 * z = −thickness. Holes go all the way through, so gauges/screens behind show through.
 */
export function panelWithCutouts(o: PanelOptions): THREE.Mesh {
  const t = o.thickness ?? 0.006;
  const bevel = o.bevel ?? 0.0018;
  const shape = new THREE.Shape();
  if (o.outline && o.outline.length > 2) {
    const first = o.outline[0];
    if (first) shape.moveTo(first[0], first[1]);
    for (const p of o.outline.slice(1)) shape.lineTo(p[0], p[1]);
    shape.closePath();
  } else {
    const w = o.width;
    const h = o.height;
    const r = o.cornerRadius ?? 0.02;
    const arch = o.topArch ?? 0;
    shape.moveTo(-w / 2 + r, -h / 2);
    shape.lineTo(w / 2 - r, -h / 2);
    shape.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
    shape.lineTo(w / 2, h / 2 - r);
    shape.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2);
    if (arch > 0) shape.quadraticCurveTo(0, h / 2 + arch * 2, -w / 2 + r, h / 2);
    else shape.lineTo(-w / 2 + r, h / 2);
    shape.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r);
    shape.lineTo(-w / 2, -h / 2 + r);
    shape.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
  }
  for (const hole of o.holes ?? []) {
    const p = new THREE.Path();
    if ("r" in hole && !("w" in hole)) {
      p.absarc(hole.x, hole.y, hole.r, 0, Math.PI * 2, true);
    } else if ("w" in hole) {
      roundedRectPath(p, hole.x, hole.y, hole.w, hole.h, hole.r ?? 0.004);
    }
    shape.holes.push(p);
  }
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.0005, t - bevel * 2),
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
    curveSegments: 40,
  });
  geo.translate(0, 0, -(t - bevel));
  const m = mesh(geo, o.material ?? MAT.panelPaint(), "panel");
  return m;
}

/**
 * A rectangular sub-panel / overhead block: plate + optional title placard + corner screws.
 * Front face at z = 0.
 */
export function panelBlock(o: {
  width: number;
  height: number;
  depth?: number;
  title?: string;
  color?: number;
  screws?: boolean;
  holes?: Cutout[];
}): THREE.Group {
  const g = group(`block:${o.title ?? ""}`);
  const plate = panelWithCutouts({
    width: o.width,
    height: o.height,
    thickness: o.depth ?? 0.008,
    cornerRadius: 0.004,
    bevel: 0.0012,
    ...(o.holes ? { holes: o.holes } : {}),
    material: MAT.panelPaint(o.color ?? 0x5d6670, 0.7),
  });
  g.add(plate);
  if (o.screws !== false) g.add(cornerScrews(o.width, o.height, 0.006, 0.0018));
  if (o.title) {
    const p = placard(o.title, { width: Math.min(o.width * 0.6, o.title.length * 0.0065) });
    p.position.set(0, o.height / 2 - 0.009, 0.0003);
    g.add(p);
  }
  return g;
}

/**
 * Curved glareshield: a padded hood over the instrument panel. The rear lip faces the pilot at
 * z = 0, the shield extends forward (−z) by `depth`, top surface at y = 0.
 */
export function glareshield(o: {
  width: number;
  depth: number;
  /** Lip height (m). */
  lip?: number;
  /** How far the centre bows toward the pilot (m). */
  bow?: number;
  material?: THREE.Material;
}): THREE.Mesh {
  const lip = o.lip ?? 0.05;
  const bow = o.bow ?? 0.04;
  // Profile in (z, y): starts at the lip bottom, rolls over the top, runs forward.
  const s = new THREE.Shape();
  s.moveTo(0.012, -lip);
  s.quadraticCurveTo(0.03, -lip * 0.3, 0.02, -0.004);
  s.quadraticCurveTo(0.012, 0.006, -0.03, 0.004);
  s.lineTo(-o.depth, -0.01);
  s.lineTo(-o.depth, -0.025);
  s.lineTo(-0.035, -0.02);
  s.quadraticCurveTo(-0.004, -0.02, -0.004, -lip);
  s.closePath();
  const geo = new THREE.ExtrudeGeometry(s, {
    depth: o.width,
    bevelEnabled: true,
    bevelThickness: 0.004,
    bevelSize: 0.004,
    bevelSegments: 3,
    curveSegments: 12,
    steps: 24,
  });
  // Extrusion is along +z in shape space; map shape x→z(world), shape y→y, extrusion→x.
  const pos = geo.attributes["position"] as THREE.BufferAttribute;
  const hw = o.width / 2;
  for (let i = 0; i < pos.count; i++) {
    const sx = pos.getX(i);
    const sy = pos.getY(i);
    const ex = pos.getZ(i) - hw;
    const k = 1 - (ex / hw) * (ex / hw);
    // (x, z) swap with a sign flip keeps it a rotation (winding stays front-facing).
    pos.setXYZ(i, -ex, sy - (1 - k) * 0.01, sx + bow * k);
  }
  geo.computeVertexNormals();
  return mesh(geo, o.material ?? MAT.leather(0x1c1d1f), "glareshield");
}

// ============================================================================ gauges (3D)

export interface GaugeArc {
  from: number;
  to: number;
  color: "green" | "yellow" | "red" | "white" | "blue" | string;
}

export interface GaugeScale {
  min: number;
  max: number;
  /** Needle sweep in degrees clockwise from 12 o'clock (default −135 … +135). */
  startDeg?: number;
  endDeg?: number;
  /** Major tick spacing (in scale units). */
  major: number;
  /** Minor ticks between majors. */
  minorPerMajor?: number;
  /** Divide label values (e.g. 100 for "RPM × 100"). */
  labelDivisor?: number;
  /** Explicit label values (default every major tick). */
  labels?: number[];
  /** Custom text for labels (e.g. ["E", "½", "F"]) matched to `labels`. */
  labelText?: string[];
  arcs?: GaugeArc[];
  redlines?: number[];
  title?: string;
  units?: string;
}

const ARC_COLORS: Record<string, string> = {
  green: "#2fbf4f",
  yellow: "#f2c230",
  red: "#e8382d",
  white: "#f4f4f0",
  blue: "#3b8fe8",
};

function scaleAngle(sc: GaugeScale, v: number) {
  const a0 = sc.startDeg ?? -135;
  const a1 = sc.endDeg ?? 135;
  const t = (Math.min(sc.max, Math.max(sc.min, v)) - sc.min) / (sc.max - sc.min || 1);
  return a0 + t * (a1 - a0);
}

function drawScale(
  ctx: CanvasRenderingContext2D,
  sc: GaugeScale,
  cx: number,
  cy: number,
  R: number,
  labelR = 0.66,
) {
  const pt = (deg: number, r: number): [number, number] => {
    const a = (deg * Math.PI) / 180;
    return [cx + r * Math.sin(a), cy - r * Math.cos(a)];
  };
  const arcPath = (from: number, to: number, r: number) => {
    const a0 = ((scaleAngle(sc, from) - 90) * Math.PI) / 180;
    const a1 = ((scaleAngle(sc, to) - 90) * Math.PI) / 180;
    ctx.beginPath();
    ctx.arc(cx, cy, r, Math.min(a0, a1), Math.max(a0, a1));
  };
  for (const arc of sc.arcs ?? []) {
    ctx.strokeStyle = ARC_COLORS[arc.color] ?? arc.color;
    ctx.lineWidth = R * 0.075;
    arcPath(arc.from, arc.to, R * 0.86);
    ctx.stroke();
  }
  const span = sc.max - sc.min;
  const minor = sc.minorPerMajor ?? 4;
  const nMajor = Math.round(span / sc.major);
  ctx.strokeStyle = "#f4f4f0";
  for (let i = 0; i <= nMajor; i++) {
    const v = sc.min + i * sc.major;
    const a = scaleAngle(sc, v);
    const [x0, y0] = pt(a, R * 0.92);
    const [x1, y1] = pt(a, R * 0.76);
    ctx.lineWidth = R * 0.03;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
    if (i < nMajor) {
      for (let j = 1; j <= minor; j++) {
        const am = scaleAngle(sc, v + (j * sc.major) / (minor + 1));
        const [mx0, my0] = pt(am, R * 0.92);
        const [mx1, my1] = pt(am, R * 0.84);
        ctx.lineWidth = R * 0.014;
        ctx.beginPath();
        ctx.moveTo(mx0, my0);
        ctx.lineTo(mx1, my1);
        ctx.stroke();
      }
    }
  }
  for (const rl of sc.redlines ?? []) {
    const a = scaleAngle(sc, rl);
    const [x0, y0] = pt(a, R * 0.95);
    const [x1, y1] = pt(a, R * 0.72);
    ctx.strokeStyle = ARC_COLORS["red"] ?? "red";
    ctx.lineWidth = R * 0.04;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
  }
  const labels = sc.labels ?? Array.from({ length: nMajor + 1 }, (_, i) => sc.min + i * sc.major);
  ctx.fillStyle = "#f4f4f0";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `700 ${Math.round(R * 0.17)}px ${FONT}`;
  labels.forEach((v, i) => {
    const txt =
      sc.labelText?.[i] ??
      String(Math.round((v / (sc.labelDivisor ?? 1)) * 10) / 10).replace(/^-/, "−");
    const [x, y] = pt(scaleAngle(sc, v), R * labelR);
    ctx.fillText(txt, x, y);
  });
}

function faceBackground(ctx: CanvasRenderingContext2D, S: number) {
  const g = ctx.createRadialGradient(S / 2, S * 0.42, S * 0.05, S / 2, S / 2, S / 2);
  g.addColorStop(0, "#202327");
  g.addColorStop(1, "#08090a");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
}

/** Canvas texture for a round gauge face (cached by spec). */
export function gaugeFaceTexture(
  sc: GaugeScale | { dual: [GaugeScale, GaugeScale]; title?: string },
) {
  const key = `face:${JSON.stringify(sc)}`;
  return cachedTex(key, () => {
    const S = 512;
    const { canvas, ctx } = makeCanvas(S, S);
    faceBackground(ctx, S);
    const R = S * 0.47;
    if ("dual" in sc) {
      drawScale(ctx, sc.dual[0], S / 2, S / 2, R, 0.62);
      drawScale(ctx, sc.dual[1], S / 2, S / 2, R, 0.62);
      ctx.fillStyle = "#cfd2d4";
      ctx.font = `700 ${Math.round(R * 0.11)}px ${FONT}`;
      ctx.textAlign = "center";
      if (sc.dual[0].title) ctx.fillText(sc.dual[0].title, S * 0.33, S * 0.66);
      if (sc.dual[1].title) ctx.fillText(sc.dual[1].title, S * 0.67, S * 0.66);
      if (sc.title) {
        ctx.font = `600 ${Math.round(R * 0.1)}px ${FONT}`;
        ctx.fillText(sc.title, S / 2, S * 0.3);
      }
      ctx.font = `600 ${Math.round(R * 0.085)}px ${FONT}`;
      if (sc.dual[0].units) ctx.fillText(sc.dual[0].units, S * 0.33, S * 0.73);
      if (sc.dual[1].units) ctx.fillText(sc.dual[1].units, S * 0.67, S * 0.73);
    } else {
      drawScale(ctx, sc, S / 2, S / 2, R);
      ctx.fillStyle = "#d9dcde";
      ctx.textAlign = "center";
      ctx.font = `700 ${Math.round(R * 0.12)}px ${FONT}`;
      if (sc.title) ctx.fillText(sc.title, S / 2, S * 0.66);
      ctx.font = `600 ${Math.round(R * 0.095)}px ${FONT}`;
      if (sc.units) ctx.fillText(sc.units, S / 2, S * 0.73);
    }
    return canvasTexture(canvas);
  });
}

/** Representative gauge scales (educational; not taken from any POH). */
export const GAUGES = {
  tach: (o: { max?: number; greenFrom?: number; greenTo?: number; redline?: number } = {}) =>
    ({
      min: 0,
      max: o.max ?? 3500,
      major: 500,
      minorPerMajor: 4,
      labelDivisor: 100,
      arcs: [{ from: o.greenFrom ?? 2100, to: o.greenTo ?? 2700, color: "green" }],
      redlines: [o.redline ?? 2700],
      title: "RPM",
      units: "× 100",
      startDeg: -140,
      endDeg: 140,
    }) satisfies GaugeScale,
  manifold: () =>
    ({
      min: 10,
      max: 35,
      major: 5,
      minorPerMajor: 4,
      arcs: [{ from: 15, to: 25, color: "green" }],
      title: "MAN PRESS",
      units: "IN HG",
    }) satisfies GaugeScale,
  oilTemp: () =>
    ({
      min: 75,
      max: 250,
      major: 25,
      minorPerMajor: 0,
      labels: [100, 150, 200, 250],
      arcs: [{ from: 100, to: 245, color: "green" }],
      redlines: [245],
      title: "OIL",
      units: "°F",
      startDeg: -150,
      endDeg: -30,
    }) satisfies GaugeScale,
  oilPress: () =>
    ({
      min: 0,
      max: 120,
      major: 20,
      minorPerMajor: 0,
      labels: [0, 60, 120],
      arcs: [{ from: 60, to: 90, color: "green" }],
      redlines: [20, 115],
      title: "OIL",
      units: "PSI",
      startDeg: 150,
      endDeg: 30,
    }) satisfies GaugeScale,
  fuelQty: (capacityGal: number, side: "L" | "R" | "" = "") =>
    ({
      min: 0,
      max: capacityGal,
      major: capacityGal / 4,
      minorPerMajor: 1,
      labels: [0, capacityGal / 2, capacityGal],
      labelText: ["E", "½", "F"],
      arcs: [{ from: 0, to: capacityGal * 0.1, color: "red" }],
      title: side ? `FUEL ${side}` : "FUEL",
      units: "GAL",
      startDeg: side === "R" ? 150 : -150,
      endDeg: side === "R" ? 30 : -30,
    }) satisfies GaugeScale,
  suction: () =>
    ({
      min: 2,
      max: 7,
      major: 1,
      minorPerMajor: 1,
      arcs: [{ from: 4.5, to: 5.5, color: "green" }],
      title: "SUCTION",
      units: "IN HG",
      startDeg: -120,
      endDeg: 120,
    }) satisfies GaugeScale,
  ammeter: () =>
    ({
      min: -60,
      max: 60,
      major: 30,
      minorPerMajor: 2,
      title: "AMPERES",
      units: "− / +",
      startDeg: -60,
      endDeg: 60,
    }) satisfies GaugeScale,
  egt: () =>
    ({
      min: 0,
      max: 10,
      major: 1,
      minorPerMajor: 1,
      labels: [],
      title: "EGT",
      units: "+25°F/div",
      startDeg: -120,
      endDeg: 120,
    }) satisfies GaugeScale,
  cht: () =>
    ({
      min: 100,
      max: 500,
      major: 100,
      minorPerMajor: 1,
      arcs: [{ from: 200, to: 460, color: "green" }],
      redlines: [500],
      title: "CHT",
      units: "°F",
      startDeg: -120,
      endDeg: 120,
    }) satisfies GaugeScale,
  fuelFlow: (max = 20) =>
    ({
      min: 0,
      max,
      major: max / 4,
      minorPerMajor: 4,
      title: "FUEL FLOW",
      units: "GPH",
    }) satisfies GaugeScale,
  volts: () =>
    ({
      min: 16,
      max: 32,
      major: 4,
      minorPerMajor: 3,
      arcs: [
        { from: 24, to: 29, color: "green" },
        { from: 16, to: 24, color: "red" },
      ],
      title: "VOLTS",
      startDeg: -120,
      endDeg: 120,
    }) satisfies GaugeScale,
  n1: () =>
    ({
      min: 0,
      max: 110,
      major: 10,
      minorPerMajor: 1,
      labels: [0, 20, 40, 60, 80, 100],
      labelDivisor: 10,
      redlines: [104],
      title: "N1",
      units: "% RPM",
      startDeg: -150,
      endDeg: 120,
    }) satisfies GaugeScale,
};

export interface GaugePart {
  group: THREE.Group;
  needles: THREE.Object3D[];
  /** Set the (first) needle value in scale units. */
  set(v: number): void;
  /** Set needle i (dual gauges: 0 = left scale, 1 = right scale). */
  setAt(i: number, v: number): void;
}

function needleGeo(length: number, width: number) {
  return cachedGeo(`needle:${r3(length)}:${r3(width)}`, () => {
    const s = new THREE.Shape();
    s.moveTo(-width / 2, -length * 0.18);
    s.lineTo(width / 2, -length * 0.18);
    s.lineTo(width * 0.32, length * 0.92);
    s.lineTo(0, length);
    s.lineTo(-width * 0.32, length * 0.92);
    s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.0006, bevelEnabled: false });
    return g;
  });
}

export interface BezelOptions {
  /** Visible face radius (m); hole radius in the panel. */
  radius: number;
  style?: "steam" | "vintage" | "modern";
  glass?: boolean;
  /** Mounting screws around the bezel (default true for steam). */
  screws?: boolean;
}

/** Round bezel ring + optional cover glass. Fits a panel hole of `radius`. Front at z = 0. */
export function gaugeBezel(o: BezelOptions): THREE.Group {
  const r = o.radius;
  const style = o.style ?? "steam";
  const g = group("bezel");
  const lip = style === "vintage" ? 0.007 : 0.0045;
  const ring = mesh(
    latheZGeo(`bezel:${r3(r)}:${style}`, [
      [r - 0.0005, -0.004],
      [r - 0.001, 0.0015],
      [r + lip * 0.4, 0.003],
      [r + lip, 0.0018],
      [r + lip + 0.0008, 0],
    ]),
    style === "vintage"
      ? MAT.chrome()
      : style === "modern"
        ? MAT.satinBlack()
        : MAT.paint(0x101113, 0.5),
  );
  g.add(ring);
  if (o.glass !== false) {
    const glass = mesh(
      cachedGeo(`circ:${r3(r)}`, () => new THREE.CircleGeometry(r, 40)),
      MAT.gaugeGlass(),
      "glass",
    );
    glass.position.z = 0.0012;
    glass.renderOrder = 2;
    g.add(glass);
  }
  if (o.screws ?? style !== "modern") {
    const d = (r + lip) * 1.18;
    const k = Math.SQRT1_2 * d;
    g.add(
      screws(
        [
          [-k, k],
          [k, k],
          [-k, -k],
          [k, -k],
        ],
        { radius: 0.0021 },
      ),
    );
  }
  return g;
}

/**
 * A self-contained 3D round gauge (face texture + needle + bezel + glass). Drive it from
 * `animate`: `tach.set(s.aircraft.rpm)`. Front of the bezel at z = 0; mount it in a panel hole
 * of `radius`.
 */
export function steamGauge(
  scale: GaugeScale,
  o: { radius?: number; style?: BezelOptions["style"]; needleColor?: number } = {},
): GaugePart {
  return buildGauge({ single: scale }, o);
}

/** Two half-scales sharing one face (e.g. fuel L/R, oil temp/press). */
export function dualGauge(
  left: GaugeScale,
  right: GaugeScale,
  o: { radius?: number; style?: BezelOptions["style"]; title?: string } = {},
): GaugePart {
  return buildGauge({ dual: [left, right], ...(o.title ? { title: o.title } : {}) }, o);
}

function buildGauge(
  spec: { single: GaugeScale } | { dual: [GaugeScale, GaugeScale]; title?: string },
  o: { radius?: number; style?: BezelOptions["style"]; needleColor?: number },
): GaugePart {
  const r = o.radius ?? 0.028;
  const g = group("gauge");
  const tex = gaugeFaceTexture("single" in spec ? spec.single : spec);
  const face = mesh(
    cachedGeo(`circ:${r3(r)}`, () => new THREE.CircleGeometry(r, 40)),
    cachedMat(`facemat:${tex.uuid}`, () => std({ map: tex, roughness: 0.7, metalness: 0 })),
    "face",
  );
  face.position.z = -0.0035;
  g.add(face);
  const scales = "single" in spec ? [spec.single] : spec.dual;
  const needles: THREE.Object3D[] = [];
  const needleLen = r * ("single" in spec ? 0.82 : 0.78);
  for (let i = 0; i < scales.length; i++) {
    const pivot = new THREE.Group();
    pivot.name = `needle${i}`;
    pivot.position.z = -0.0026 + i * 0.0007;
    const n = mesh(needleGeo(needleLen, r * 0.075), MAT.needle(o.needleColor ?? 0xf4f4f0));
    pivot.add(n);
    g.add(pivot);
    needles.push(pivot);
  }
  const cap = mesh(cylinderZGeo(r * 0.11, r * 0.13, 0.0022, 20), MAT.satinBlack());
  cap.position.z = -0.0024;
  g.add(cap);
  g.add(gaugeBezel({ radius: r, style: o.style ?? "steam" }));
  const setAt = (i: number, v: number) => {
    const sc = scales[i];
    const p = needles[i];
    if (!sc || !p) return;
    p.rotation.z = (-scaleAngle(sc, v) * Math.PI) / 180;
  };
  scales.forEach((sc, i) => setAt(i, sc.min));
  return { group: g, needles, set: (v) => setAt(0, v), setAt };
}

/** Analog clock gauge (hours/minutes from seconds of day). */
export function analogClock(o: { radius?: number; style?: BezelOptions["style"] } = {}) {
  const scale: GaugeScale = {
    min: 0,
    max: 12,
    startDeg: 0,
    endDeg: 360,
    major: 1,
    minorPerMajor: 4,
    labels: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    title: "",
  };
  const part = steamGauge(scale, o);
  const r = o.radius ?? 0.028;
  const minute = new THREE.Group();
  minute.add(mesh(needleGeo(r * 0.86, r * 0.05), MAT.needle()));
  minute.position.z = -0.0018;
  part.group.add(minute);
  part.needles.push(minute);
  return {
    ...part,
    /** Seconds since midnight. */
    setTime(sec: number) {
      const h = (sec / 3600) % 12;
      part.set(h);
      minute.rotation.z = -((sec / 60) % 60) * ((Math.PI * 2) / 60);
    },
  };
}

// ============================================================================ displays

export interface DisplayBezelPart {
  group: THREE.Group;
  /** Centre & size of the visible screen in the bezel's local space (for an InstrumentScreen). */
  screen: { position: THREE.Vector3; width: number; height: number };
  /** Softkey meshes (left → right) for optional hotspots. */
  softkeys: THREE.Object3D[];
  knobs: THREE.Object3D[];
}

/**
 * Integrated-display bezel (PFD/MFD-style) with a screen opening, optional softkey row along the
 * bottom and knobs on the sides. Front at z = 0 (keys protrude toward +z).
 */
export function displayBezel(o: {
  width: number;
  height: number;
  screenWidth: number;
  screenHeight: number;
  /** Screen centre offset from bezel centre (m). */
  screenOffset?: [number, number];
  softkeys?: number;
  softkeyLabels?: string[];
  /** Knob positions [x, y] (concentric knobs). */
  knobs?: Array<[number, number]>;
  /** Small push buttons [x, y, label]. */
  buttons?: Array<[number, number, string]>;
  depth?: number;
  color?: number;
  title?: string;
}): DisplayBezelPart {
  const g = group("display");
  const [sx, sy] = o.screenOffset ?? [0, 0];
  const depth = o.depth ?? 0.03;
  const frame = panelWithCutouts({
    width: o.width,
    height: o.height,
    thickness: depth,
    cornerRadius: 0.008,
    bevel: 0.003,
    holes: [{ x: sx, y: sy, w: o.screenWidth, h: o.screenHeight, r: 0.002 }],
    material: MAT.paint(o.color ?? 0x1b1d20, 0.5, 0.15),
  });
  g.add(frame);
  // dark glass behind the opening edges (gives the screen a recessed look)
  const back = mesh(
    roundedBoxGeo(o.screenWidth + 0.004, o.screenHeight + 0.004, 0.002, 0.001),
    MAT.glossBlack(),
  );
  back.position.set(sx, sy, -0.012);
  g.add(back);
  const softkeys: THREE.Object3D[] = [];
  const n = o.softkeys ?? 0;
  if (n > 0) {
    const rowY = sy - o.screenHeight / 2 - 0.011;
    const span = o.screenWidth * 0.96;
    const kw = (span / n) * 0.72;
    const geo = roundedBoxGeo(kw, 0.0075, 0.006, 0.0015);
    const im = new THREE.InstancedMesh(geo, MAT.paint(0x2d3035, 0.55), n);
    const m4 = new THREE.Matrix4();
    for (let i = 0; i < n; i++) {
      const x = sx - span / 2 + (span / n) * (i + 0.5);
      m4.makeTranslation(x, rowY, 0.003);
      im.setMatrixAt(i, m4);
      const proxy = hitBox(kw, 0.01, 0.01);
      proxy.position.set(x, rowY, 0.004);
      proxy.name = `softkey${i}`;
      g.add(proxy);
      softkeys.push(proxy);
      const label = o.softkeyLabels?.[i];
      if (label) {
        const p = placard(label, { width: Math.min(kw * 0.9, label.length * 0.004), px: 48 });
        p.position.set(x, rowY + 0.0085, 0.0003);
        g.add(p);
      }
    }
    im.instanceMatrix.needsUpdate = true;
    im.computeBoundingSphere();
    g.add(im);
  }
  const knobs: THREE.Object3D[] = [];
  for (const [kx, ky] of o.knobs ?? []) {
    const k = rotaryKnob({ style: "concentric", radius: 0.0085 });
    k.group.position.set(kx, ky, 0);
    g.add(k.group);
    knobs.push(k.group);
  }
  for (const [bx, by, label] of o.buttons ?? []) {
    const b = pushButton({ label, width: 0.014, height: 0.008 });
    b.group.position.set(bx, by, 0);
    g.add(b.group);
  }
  if (o.title) {
    const p = placard(o.title, { width: o.title.length * 0.004, color: "#9aa0a6" });
    p.position.set(-o.width / 2 + 0.01 + o.title.length * 0.002, o.height / 2 - 0.007, 0.0003);
    g.add(p);
  }
  return {
    group: g,
    screen: {
      position: new THREE.Vector3(sx, sy, -0.004),
      width: o.screenWidth,
      height: o.screenHeight,
    },
    softkeys,
    knobs,
  };
}

// ============================================================================ switches & buttons

export interface StatePart<T> {
  group: THREE.Group;
  set(v: T): void;
}

function attachState<T>(g: THREE.Group, set: (v: T) => void) {
  g.userData["applyState"] = set;
}

/**
 * Bat-handle (or paddle) toggle switch, optionally under a hinged red guard. ON = handle up.
 * The returned group animates automatically when used as a hotspot `object` with a toggle binding.
 */
export function toggleSwitch(
  o: { guarded?: boolean; style?: "bat" | "paddle"; label?: string; labelColor?: string } = {},
): StatePart<boolean> & { lever: THREE.Object3D } {
  const g = group("toggle");
  const style = o.style ?? "bat";
  const nut = mesh(cylinderZGeo(0.0055, 0.0055, 0.0025, 6), MAT.chrome());
  const bushing = mesh(cylinderZGeo(0.0032, 0.0034, 0.006, 16), MAT.brushedMetal());
  g.add(nut, bushing);
  const lever = new THREE.Group();
  lever.position.z = 0.005;
  if (style === "bat") {
    const stem = mesh(cylinderZGeo(0.0016, 0.0024, 0.017, 12), MAT.chrome());
    const tip = mesh(
      cachedGeo("sph:0.0026", () => new THREE.SphereGeometry(0.0026, 14, 10)),
      MAT.chrome(),
    );
    tip.position.z = 0.017;
    lever.add(stem, tip);
  } else {
    const paddle = roundedBox(0.008, 0.004, 0.018, MAT.paint(0xdedbd2, 0.45), 0.0015);
    paddle.position.z = 0.009;
    lever.add(paddle);
  }
  g.add(lever);
  let guard: THREE.Group | null = null;
  if (o.guarded) {
    guard = new THREE.Group();
    guard.position.set(0, 0.012, 0.002);
    const red = MAT.paint(0xc2271d, 0.4);
    const sideL = roundedBox(0.0015, 0.026, 0.024, red, 0.0006);
    sideL.position.set(-0.007, -0.012, 0.012);
    const sideR = sideL.clone();
    sideR.position.x = 0.007;
    const top = roundedBox(0.0155, 0.0015, 0.024, red, 0.0006);
    top.position.set(0, -0.0245, 0.012);
    guard.add(sideL, sideR, top);
    g.add(guard);
  }
  if (o.label) {
    const p = placard(o.label, {
      width: Math.max(0.012, o.label.length * 0.0042),
      ...(o.labelColor ? { color: o.labelColor } : {}),
    });
    p.position.set(0, -0.017, 0.0003);
    g.add(p);
  }
  const hit = hitBox(0.016, 0.03, 0.028);
  hit.position.z = 0.012;
  g.add(hit);
  const set = (on: boolean) => {
    lever.rotation.x = on ? -0.42 : 0.42;
    if (guard) guard.rotation.x = on ? -1.25 : 0;
  };
  set(false);
  attachState(g, set);
  return { group: g, lever, set };
}

export interface RockerHalf extends StatePart<boolean> {
  rocker: THREE.Object3D;
}

/**
 * Rocker switch. `split: true` makes a two-piece master switch (e.g. "BAT" / "ALT" halves —
 * each half is its own hotspot). ON = top pressed in.
 */
export function rockerSwitch(
  o: { split?: boolean; labels?: string[]; color?: number; width?: number; height?: number } = {},
): { group: THREE.Group; halves: RockerHalf[] } {
  const g = group("rocker");
  const n = o.split ? 2 : 1;
  const w = o.width ?? 0.014 * n + 0.002;
  const h = o.height ?? 0.03;
  const frame = panelWithCutouts({
    width: w + 0.006,
    height: h + 0.006,
    thickness: 0.004,
    cornerRadius: 0.002,
    bevel: 0.001,
    holes: [{ x: 0, y: 0, w, h, r: 0.0015 }],
    material: MAT.satinBlack(),
  });
  frame.position.z = 0.004;
  g.add(frame);
  const halves: RockerHalf[] = [];
  const hw = w / n;
  for (let i = 0; i < n; i++) {
    const hg = group(`half${i}`);
    hg.position.set(-w / 2 + hw * (i + 0.5), 0, 0.003);
    const rocker = new THREE.Group();
    const body = roundedBox(
      hw - 0.0012,
      h - 0.001,
      0.007,
      MAT.paint(o.color ?? 0xb3261e, 0.45),
      0.002,
    );
    rocker.add(body);
    const label = o.labels?.[i];
    if (label) {
      const p = placard(label, { width: Math.min(hw * 0.8, label.length * 0.0042) });
      p.position.set(0, h * 0.22, 0.0038);
      rocker.add(p);
    }
    hg.add(rocker);
    const hit = hitBox(hw, h, 0.014);
    hit.position.z = 0.004;
    hg.add(hit);
    const set = (on: boolean) => {
      rocker.rotation.x = on ? -0.16 : 0.16;
    };
    set(false);
    attachState(hg, set);
    g.add(hg);
    halves.push({ group: hg, rocker, set });
  }
  return { group: g, halves };
}

/**
 * Square/round push button with a (back-lit) label, e.g. autopilot mode keys or annunciator
 * switch-lights. `setLit(true)` lights the legend.
 */
export function pushButton(o: {
  label: string;
  sublabel?: string;
  width?: number;
  height?: number;
  color?: "white" | "green" | "amber" | "blue" | "red" | "cyan";
  style?: "square" | "round" | "key";
  /** The legend can light up (unique material per button). */
  backlit?: boolean;
  capColor?: number;
}): { group: THREE.Group; cap: THREE.Object3D; setLit(on: boolean): void } {
  const w = o.width ?? 0.016;
  const h = o.height ?? (o.style === "key" ? 0.009 : 0.014);
  const g = group(`button:${o.label}`);
  const colors: Record<string, string> = {
    white: "#f1f1ea",
    green: "#47e27a",
    amber: "#ffb020",
    blue: "#5aa8ff",
    red: "#ff4a3d",
    cyan: "#5fe3ff",
  };
  const fg = colors[o.color ?? "white"] ?? "#f1f1ea";
  const lines = o.sublabel ? [o.label, o.sublabel] : [o.label];
  const key = `btnface:${lines.join("|")}:${fg}:${o.capColor ?? 0}`;
  const tex = cachedTex(key, () => {
    const S = 128;
    const aspect = h / w;
    const { canvas, ctx } = makeCanvas(S, Math.max(32, Math.round(S * aspect)));
    ctx.fillStyle = "#1d1f22";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = fg;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const longest = Math.max(...lines.map((l) => l.length));
    const fs = Math.min(canvas.height / (lines.length + 0.6), (S * 1.5) / Math.max(3, longest));
    ctx.font = `700 ${Math.round(fs)}px ${FONT}`;
    lines.forEach((l, i) =>
      ctx.fillText(l, S / 2, canvas.height / 2 + (i - (lines.length - 1) / 2) * fs * 1.05),
    );
    return canvasTexture(canvas);
  });
  const capMat = o.backlit
    ? std({
        map: tex,
        emissiveMap: tex,
        emissive: 0xffffff,
        emissiveIntensity: 0.05,
        roughness: 0.5,
        color: o.capColor ?? 0xffffff,
      })
    : cachedMat(`btnmat:${key}`, () =>
        std({
          map: tex,
          roughness: 0.5,
          color: o.capColor ?? 0xffffff,
          emissiveMap: tex,
          emissive: 0xffffff,
          emissiveIntensity: 0.12,
        }),
      );
  const capGeo =
    o.style === "round"
      ? cylinderZGeo(w / 2, w / 2, 0.006, 24)
      : roundedBoxGeo(w, h, 0.006, 0.0015);
  // Front-face texture: box/cylinder UVs map the full texture on the front face.
  const sideMat = MAT.paint(0x1d1f22, 0.5);
  const cap = new THREE.Mesh(capGeo, o.style === "round" ? [sideMat, capMat, sideMat] : capMat);
  cap.position.z = o.style === "round" ? 0 : 0.003;
  const housing = mesh(roundedBoxGeo(w + 0.003, h + 0.003, 0.003, 0.001), MAT.satinBlack());
  housing.position.z = 0.0015;
  g.add(housing, cap);
  return {
    group: g,
    cap,
    setLit(on: boolean) {
      if (o.backlit) capMat.emissiveIntensity = on ? 1.4 : 0.05;
    },
  };
}

// ============================================================================ knobs

export interface RotaryPart {
  group: THREE.Group;
  /** The part to rotate (rotation.z) — pass as `moving` in a rotary binding. */
  moving: THREE.Object3D;
}

/** Ridged knob profile (gear-like shape) extruded along z. */
function ribbedGeo(radius: number, depth: number, ribs: number, ribDepth: number) {
  return cachedGeo(`ribbed:${r3(radius)}:${r3(depth)}:${ribs}:${r3(ribDepth)}`, () => {
    const s = new THREE.Shape();
    const n = ribs * 2;
    for (let i = 0; i <= n * 4; i++) {
      const a = (i / (n * 4)) * Math.PI * 2;
      const rr = radius - ribDepth * (0.5 + 0.5 * Math.cos(a * ribs));
      const x = Math.cos(a) * rr;
      const y = Math.sin(a) * rr;
      if (i === 0) s.moveTo(x, y);
      else s.lineTo(x, y);
    }
    const g = new THREE.ExtrudeGeometry(s, {
      depth,
      bevelEnabled: true,
      bevelSize: Math.min(0.0012, radius * 0.1),
      bevelThickness: Math.min(0.0012, depth * 0.15),
      bevelSegments: 2,
    });
    return g;
  });
}

/**
 * Rotary knob. Styles: "pointer" (bar knob with white index line), "knurled" (ridged),
 * "concentric" (dual — outer and inner), "chicken-head" (classic selector).
 */
export function rotaryKnob(
  o: {
    radius?: number;
    height?: number;
    style?: "pointer" | "knurled" | "concentric" | "chicken-head";
    color?: number;
    label?: string;
  } = {},
): RotaryPart {
  const r = o.radius ?? 0.009;
  const h = o.height ?? 0.012;
  const g = group("knob");
  const moving = new THREE.Group();
  const mat = MAT.paint(o.color ?? 0x16171a, 0.5, 0.1);
  const style = o.style ?? "knurled";
  if (style === "knurled" || style === "concentric") {
    const outer = mesh(ribbedGeo(r, h * (style === "concentric" ? 0.5 : 0.85), 14, r * 0.07), mat);
    moving.add(outer);
    if (style === "concentric") {
      const inner = mesh(ribbedGeo(r * 0.6, h * 0.55, 10, r * 0.05), mat);
      inner.position.z = h * 0.5;
      moving.add(inner);
    }
    const cap = mesh(cylinderZGeo(r * 0.45, r * 0.45, 0.0008, 20), MAT.brushedMetal(0x9da2a8));
    cap.position.z = style === "concentric" ? h * 1.05 + 0.0012 : h * 0.85 + 0.0012;
    moving.add(cap);
    // index mark
    const mark = roundedBox(r * 0.12, r * 0.55, 0.0008, MAT.placardWhite(), 0.0002);
    mark.position.set(0, r * 0.6, cap.position.z - 0.0004);
    moving.add(mark);
  } else if (style === "pointer") {
    const base = mesh(cylinderZGeo(r, r * 1.05, h * 0.45, 28), mat);
    const bar = roundedBox(r * 0.55, r * 2.3, h * 0.55, mat, r * 0.2);
    bar.position.z = h * 0.45 + h * 0.27;
    const line = roundedBox(r * 0.12, r * 1.05, 0.0006, MAT.placardWhite(), 0.0002);
    line.position.set(0, r * 0.55, h + 0.0004);
    moving.add(base, bar, line);
  } else {
    // chicken-head: tapered pointer knob
    const base = mesh(cylinderZGeo(r * 0.8, r * 0.85, h * 0.5, 24), mat);
    const s = new THREE.Shape();
    s.moveTo(-r * 0.45, -r * 0.8);
    s.lineTo(r * 0.45, -r * 0.8);
    s.lineTo(r * 0.2, r * 1.7);
    s.lineTo(0, r * 1.85);
    s.lineTo(-r * 0.2, r * 1.7);
    s.closePath();
    const head = mesh(
      cachedGeo(
        `chicken:${r3(r)}:${r3(h)}`,
        () =>
          new THREE.ExtrudeGeometry(s, {
            depth: h * 0.45,
            bevelEnabled: true,
            bevelSize: 0.0008,
            bevelThickness: 0.0008,
            bevelSegments: 2,
          }),
      ),
      mat,
    );
    head.position.z = h * 0.5;
    const line = roundedBox(r * 0.12, r * 1.4, 0.0006, MAT.placardWhite(), 0.0002);
    line.position.set(0, r * 0.95, h * 0.95 + 0.0016);
    moving.add(base, head, line);
  }
  g.add(moving);
  const hit = hitBox(r * 2.6, r * 2.6, h * 1.4);
  hit.position.z = h * 0.6;
  g.add(hit);
  if (o.label) {
    const p = placard(o.label, { width: Math.max(0.012, o.label.length * 0.0042) });
    p.position.set(0, -r - 0.007, 0.0003);
    g.add(p);
  }
  return { group: g, moving };
}

/** Dial placard (round, labels around) for rotary selectors — faces +z, centred. */
export function dialPlate(
  positions: string[],
  o: { radius: number; baseDeg?: number; stepDeg?: number; background?: string; color?: string },
): THREE.Mesh {
  const key = `dial:${positions.join(",")}:${o.baseDeg}:${o.stepDeg}:${o.background}:${o.color}`;
  const tex = cachedTex(key, () => {
    const S = 512;
    const { canvas, ctx } = makeCanvas(S, S);
    ctx.fillStyle = o.background ?? "#151618";
    ctx.beginPath();
    ctx.arc(S / 2, S / 2, S / 2 - 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = o.color ?? "#ecece6";
    ctx.strokeStyle = o.color ?? "#ecece6";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const longest = Math.max(...positions.map((p) => p.length));
    ctx.font = `700 ${Math.round(Math.min(64, 220 / Math.max(3, longest)))}px ${FONT}`;
    positions.forEach((p, i) => {
      // knob rotation.z = base − i·step  → clockwise as seen by the pilot
      const deg = -(o.baseDeg ?? 0) + i * (o.stepDeg ?? 30);
      const a = (deg * Math.PI) / 180;
      const x = S / 2 + Math.sin(a) * S * 0.36;
      const y = S / 2 - Math.cos(a) * S * 0.36;
      ctx.fillText(p, x, y);
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(S / 2 + Math.sin(a) * S * 0.47, S / 2 - Math.cos(a) * S * 0.47);
      ctx.lineTo(S / 2 + Math.sin(a) * S * 0.43, S / 2 - Math.cos(a) * S * 0.43);
      ctx.stroke();
    });
    return canvasTexture(canvas);
  });
  return mesh(
    cachedGeo(`circ:${r3(o.radius)}`, () => new THREE.CircleGeometry(o.radius, 40)),
    cachedMat(`dialmat:${key}`, () =>
      std({ map: tex, roughness: 0.65, polygonOffset: true, polygonOffsetFactor: -1 }),
    ),
    "dial",
  );
}

export interface SelectorPart extends RotaryPart {
  positions: string[];
  /** radians per position */
  step: number;
}

/**
 * Rotary selector with a labelled dial (e.g. "OFF/ON/…"). Index 0 points at `baseDeg`
 * (degrees clockwise from 12 o'clock as the pilot sees it).
 */
export function rotarySelector(o: {
  positions: string[];
  stepDeg?: number;
  baseDeg?: number;
  radius?: number;
  style?: "pointer" | "chicken-head";
  color?: number;
}): SelectorPart {
  const stepDeg = o.stepDeg ?? 40;
  const baseDeg = o.baseDeg ?? -((o.positions.length - 1) * stepDeg) / 2;
  const r = o.radius ?? 0.009;
  const k = rotaryKnob({
    radius: r,
    style: o.style ?? "chicken-head",
    ...(o.color !== undefined ? { color: o.color } : {}),
  });
  const plate = dialPlate(o.positions, { radius: r * 3.2, baseDeg, stepDeg });
  plate.position.z = 0.0003;
  k.group.add(plate);
  k.moving.rotation.z = (-baseDeg * Math.PI) / 180;
  return { ...k, positions: o.positions, step: (stepDeg * Math.PI) / 180 };
}

/**
 * Magneto / ignition key switch: OFF R L BOTH START. Rotary binding: moving = key, step = 30°.
 */
export function ignitionSwitch(o: { positions?: string[] } = {}): SelectorPart {
  const positions = o.positions ?? ["OFF", "R", "L", "BOTH", "START"];
  const stepDeg = 30;
  const baseDeg = -60;
  const g = group("ignition");
  const plate = dialPlate(positions, { radius: 0.024, baseDeg, stepDeg, background: "#121314" });
  plate.position.z = 0.0003;
  const ring = mesh(
    latheZGeo("ignring", [
      [0.008, 0],
      [0.0095, 0.004],
      [0.0085, 0.006],
    ]),
    MAT.chrome(),
  );
  const barrel = mesh(cylinderZGeo(0.0075, 0.0075, 0.005, 24), MAT.brushedMetal());
  const moving = new THREE.Group();
  moving.position.z = 0.005;
  const blade = roundedBox(0.0022, 0.012, 0.012, MAT.chrome(), 0.0008);
  blade.position.z = 0.004;
  const bow = roundedBox(0.004, 0.026, 0.02, MAT.paint(0x1a1a1a, 0.45), 0.003);
  bow.position.z = 0.019;
  moving.add(blade, bow);
  moving.rotation.z = (-baseDeg * Math.PI) / 180;
  const hit = hitBox(0.03, 0.03, 0.03);
  hit.position.z = 0.012;
  g.add(plate, ring, barrel, moving, hit);
  return { group: g, moving, positions, step: (stepDeg * Math.PI) / 180 };
}

/**
 * Floor-mounted fuel selector valve (faces +y). Rotary binding: moving rotates about its local z
 * (which points up once mounted). Default positions LEFT / BOTH / RIGHT / OFF.
 */
export function fuelSelector(
  o: { positions?: string[]; stepDeg?: number; baseDeg?: number; radius?: number } = {},
): SelectorPart {
  const positions = o.positions ?? ["LEFT", "BOTH", "RIGHT", "OFF"];
  const stepDeg = o.stepDeg ?? 90;
  const baseDeg = o.baseDeg ?? -90;
  const R = o.radius ?? 0.055;
  const g = group("fuel-selector");
  const face = new THREE.Group();
  face.rotation.x = -Math.PI / 2; // local +z → world +y
  g.add(face);
  const base = mesh(cylinderZGeo(R, R * 1.05, 0.008, 40), MAT.paint(0x1c1d20, 0.6));
  base.position.z = -0.008;
  const plate = dialPlate(positions, {
    radius: R * 0.96,
    baseDeg,
    stepDeg,
    background: "#c9c4b8",
    color: "#111",
  });
  plate.position.z = 0.0004;
  face.add(base, plate);
  const moving = new THREE.Group();
  const s = new THREE.Shape();
  s.moveTo(-R * 0.16, -R * 0.35);
  s.quadraticCurveTo(0, -R * 0.5, R * 0.16, -R * 0.35);
  s.lineTo(R * 0.09, R * 0.7);
  s.lineTo(0, R * 0.82);
  s.lineTo(-R * 0.09, R * 0.7);
  s.closePath();
  const handle = mesh(
    cachedGeo(
      `fuelhandle:${r3(R)}`,
      () =>
        new THREE.ExtrudeGeometry(s, {
          depth: 0.016,
          bevelEnabled: true,
          bevelSize: 0.002,
          bevelThickness: 0.002,
          bevelSegments: 3,
        }),
    ),
    MAT.paint(0x8f1c16, 0.45),
  );
  handle.position.z = 0.002;
  const hub = mesh(cylinderZGeo(R * 0.14, R * 0.16, 0.02, 24), MAT.brushedMetal());
  moving.add(handle, hub);
  moving.rotation.z = (-baseDeg * Math.PI) / 180;
  face.add(moving);
  const hit = hitBox(R * 2, R * 2, 0.03);
  hit.position.z = 0.012;
  face.add(hit);
  return { group: g, moving, positions, step: (stepDeg * Math.PI) / 180 };
}

// ============================================================================ push-pull & levers

export interface SliderPart {
  group: THREE.Group;
  /** Moves along `axis` (local) by up to `travel` — pass to a lever binding. */
  moving: THREE.Object3D;
  axis: THREE.Vector3;
  travel: number;
}

/**
 * Push-pull control (light-aircraft style). Built in the PULLED-OUT position; value 0 = out,
 * 1 = pushed in (full throttle / full rich). Lever binding: axis (0,0,−1), travel.
 *  - throttle: large smooth black knob   - mixture: red ribbed knob   - prop: blue scalloped
 *  - carb-heat / generic: small black knob with flat face   - primer: knurled chrome plunger
 */
export function pushPullKnob(
  o: {
    style?: "throttle" | "mixture" | "prop" | "carb-heat" | "primer" | "generic";
    travel?: number;
    label?: string;
    color?: number;
  } = {},
): SliderPart {
  const style = o.style ?? "generic";
  const travel =
    o.travel ?? (style === "throttle" || style === "mixture" || style === "prop" ? 0.075 : 0.03);
  const g = group(`pushpull:${style}`);
  const bushing = mesh(
    latheZGeo("ppbushing", [
      [0.0085, 0],
      [0.0085, 0.002],
      [0.0055, 0.004],
      [0.005, 0.007],
    ]),
    MAT.chrome(),
  );
  g.add(bushing);
  const moving = new THREE.Group();
  moving.position.z = travel;
  const shaft = mesh(cylinderZGeo(0.0028, 0.0028, travel + 0.012, 14), MAT.chrome());
  shaft.position.z = -travel - 0.004;
  moving.add(shaft);
  let knob: THREE.Mesh;
  if (style === "throttle") {
    knob = mesh(
      latheZGeo("thrknob", [
        [0.0001, 0.034],
        [0.009, 0.0335],
        [0.0145, 0.03],
        [0.0165, 0.022],
        [0.0145, 0.012],
        [0.0075, 0.006],
        [0.006, 0],
      ]),
      MAT.paint(o.color ?? 0x111214, 0.35, 0.1),
    );
  } else if (style === "mixture" || style === "prop") {
    knob = mesh(
      ribbedGeo(0.0135, 0.016, style === "mixture" ? 12 : 6, style === "mixture" ? 0.0012 : 0.003),
      MAT.paint(o.color ?? (style === "mixture" ? 0xb3261e : 0x2457b5), 0.45),
    );
    knob.position.z = 0.012;
    const neck = mesh(
      cylinderZGeo(0.006, 0.006, 0.012, 16),
      MAT.paint(o.color ?? (style === "mixture" ? 0xb3261e : 0x2457b5), 0.45),
    );
    moving.add(neck);
  } else if (style === "primer") {
    knob = mesh(ribbedGeo(0.008, 0.012, 16, 0.0006), MAT.chrome());
    knob.position.z = 0.006;
  } else {
    knob = mesh(
      latheZGeo("genknob", [
        [0.0001, 0.019],
        [0.0095, 0.0185],
        [0.011, 0.016],
        [0.011, 0.008],
        [0.006, 0.004],
        [0.0045, 0],
      ]),
      MAT.paint(o.color ?? 0x15161a, 0.45),
    );
  }
  moving.add(knob);
  if (o.label) {
    const disc = placard(o.label, {
      width: style === "throttle" ? 0.022 : 0.016,
      background: null,
      weight: 800,
      px: 48,
    });
    const front =
      style === "throttle"
        ? 0.0342
        : style === "mixture" || style === "prop"
          ? 0.0295
          : style === "primer"
            ? 0.0185
            : 0.0192;
    disc.position.set(0, 0, front + 0.0004);
    moving.add(disc);
  }
  g.add(moving);
  const hit = hitBox(0.034, 0.034, 0.04);
  hit.position.z = 0.02;
  moving.add(hit);
  return { group: g, moving, axis: new THREE.Vector3(0, 0, -1), travel };
}

export interface PivotLeverPart extends SliderPart {
  arc: { axis: THREE.Vector3; angle: number };
}

/**
 * Pivoting quadrant lever (power/prop/mixture, jet thrust lever, flap or speed-brake handle).
 * Pivot at the group origin, arm points up (+y). Value 0 = fully aft (toward the pilot),
 * 1 = fully forward. Lever binding: `{ axis, travel, moving, arc }` from this part.
 */
export function quadrantLever(
  o: {
    knob?: "power" | "prop" | "mixture" | "thrust" | "flap" | "speedbrake" | "generic";
    length?: number;
    sweepDeg?: number;
    color?: number;
  } = {},
): PivotLeverPart {
  const knobKind = o.knob ?? "power";
  const L = o.length ?? (knobKind === "thrust" ? 0.2 : 0.13);
  const sweep = ((o.sweepDeg ?? 50) * Math.PI) / 180;
  const g = group(`lever:${knobKind}`);
  const moving = new THREE.Group();
  const armMat = knobKind === "thrust" ? MAT.brushedMetal(0x9ea4aa) : MAT.chrome();
  const arm = mesh(cylinderYGeo(0.0038, 0.005, L, 12), armMat);
  moving.add(arm);
  const pivotCap = mesh(cylinderZGeo(0.009, 0.009, 0.01, 20), MAT.satinBlack());
  pivotCap.rotation.y = Math.PI / 2;
  pivotCap.position.x = -0.005;
  g.add(pivotCap);
  const colors: Record<string, number> = {
    power: 0x111214,
    prop: 0x2457b5,
    mixture: 0xb3261e,
    thrust: 0x1a1b1d,
    flap: 0xe6e3da,
    speedbrake: 0x2a2c2f,
    generic: 0x1a1b1d,
  };
  const kmat = MAT.paint(o.color ?? colors[knobKind] ?? 0x1a1b1d, 0.42, 0.1);
  if (knobKind === "thrust") {
    const bar = roundedBox(0.07, 0.022, 0.03, kmat, 0.008);
    bar.position.set(0.02, L + 0.006, 0);
    const rev = roundedBox(0.03, 0.006, 0.018, MAT.paint(0x2a2c2f, 0.5), 0.002);
    rev.position.set(0, L - 0.03, 0.016);
    rev.rotation.x = 0.4;
    moving.add(bar, rev);
  } else if (knobKind === "flap") {
    // aerofoil-shaped flap handle
    const s = new THREE.Shape();
    s.moveTo(-0.02, 0);
    s.quadraticCurveTo(-0.02, 0.012, 0, 0.012);
    s.quadraticCurveTo(0.028, 0.008, 0.03, 0);
    s.quadraticCurveTo(0.028, -0.004, 0, -0.004);
    s.quadraticCurveTo(-0.02, -0.004, -0.02, 0);
    const k = mesh(
      cachedGeo("flapknob", () =>
        new THREE.ExtrudeGeometry(s, {
          depth: 0.022,
          bevelEnabled: true,
          bevelSize: 0.002,
          bevelThickness: 0.002,
          bevelSegments: 2,
        }).translate(0, 0, -0.011),
      ),
      kmat,
    );
    k.rotation.y = Math.PI / 2;
    k.position.y = L + 0.002;
    moving.add(k);
  } else if (knobKind === "speedbrake") {
    const k = roundedBox(0.03, 0.016, 0.05, kmat, 0.006);
    k.position.set(0, L + 0.004, 0.012);
    moving.add(k);
  } else {
    const kind = knobKind === "prop" ? 6 : knobKind === "mixture" ? 12 : 0;
    const k =
      kind > 0
        ? mesh(ribbedGeo(0.014, 0.024, kind, kind === 6 ? 0.003 : 0.0012), kmat)
        : mesh(
            latheZGeo("leverknob", [
              [0.0001, 0.026],
              [0.01, 0.025],
              [0.015, 0.018],
              [0.015, 0.008],
              [0.01, 0.002],
              [0.0001, 0],
            ]),
            kmat,
          );
    k.rotation.y = Math.PI / 2;
    k.position.set(-0.012, L + 0.008, 0);
    moving.add(k);
  }
  const hit = hitBox(0.05, 0.05, 0.05);
  hit.position.y = L;
  moving.add(hit);
  g.add(moving);
  moving.rotation.x = sweep / 2;
  return {
    group: g,
    moving,
    axis: new THREE.Vector3(0, 0, -1),
    travel: L * sweep,
    arc: { axis: new THREE.Vector3(1, 0, 0), angle: -sweep },
  };
}

/**
 * Throttle-quadrant housing with lever slots (pedestal or panel-mounted). Levers are added by
 * the author at the slot x positions (y = 0 is the pivot line, top surface at y = height/2).
 */
export function quadrantHousing(o: {
  width: number;
  height: number;
  depth: number;
  slots: number[];
  slotLength?: number;
  color?: number;
  labels?: string[];
}): THREE.Group {
  const g = group("quadrant");
  const sl = o.slotLength ?? o.depth * 0.75;
  const top = panelWithCutouts({
    width: o.width,
    height: o.depth,
    thickness: 0.006,
    cornerRadius: 0.01,
    holes: o.slots.map((x) => ({ x, y: 0, w: 0.012, h: sl, r: 0.006 })),
    material: MAT.panelPaint(o.color ?? 0x2b2e33),
  });
  top.rotation.x = -Math.PI / 2;
  top.position.y = o.height / 2;
  const body = roundedBox(
    o.width - 0.004,
    o.height - 0.03,
    o.depth - 0.004,
    MAT.paint(0x141517, 0.7),
    0.008,
  );
  body.position.y = -0.015;
  g.add(top, body);
  o.labels?.forEach((l, i) => {
    const x = o.slots[i];
    if (x === undefined) return;
    const p = placard(l, { width: Math.min(0.035, l.length * 0.005) });
    p.rotation.x = -Math.PI / 2;
    p.position.set(x, o.height / 2 + 0.0004, o.depth / 2 - 0.012);
    g.add(p);
  });
  return g;
}

/**
 * Small panel flap selector (light-aircraft electric flap lever) moving down a slot past
 * detent marks. Value 0 = UP (top). Lever binding: axis (0,−1,0), travel, detents.
 */
export function flapSelector(
  o: { labels?: string[]; travel?: number } = {},
): SliderPart & { detents: number[] } {
  const labels = o.labels ?? ["0°", "10°", "20°", "FULL"];
  const travel = o.travel ?? 0.05;
  const g = group("flap-selector");
  const plate = panelWithCutouts({
    width: 0.05,
    height: travel + 0.026,
    thickness: 0.003,
    cornerRadius: 0.003,
    bevel: 0.0008,
    holes: [{ x: -0.008, y: 0, w: 0.005, h: travel + 0.006, r: 0.0025 }],
    material: MAT.satinBlack(),
  });
  plate.position.z = 0.003;
  g.add(plate);
  labels.forEach((l, i) => {
    const y = travel / 2 - (travel * i) / Math.max(1, labels.length - 1);
    const p = placard(l, { width: 0.004 * Math.max(3, l.length), align: "left" });
    p.position.set(0.012, y, 0.0035);
    g.add(p);
  });
  const moving = new THREE.Group();
  moving.position.set(-0.008, travel / 2, 0);
  const stem = mesh(cylinderZGeo(0.0018, 0.0018, 0.014, 10), MAT.chrome());
  const s = new THREE.Shape();
  s.moveTo(-0.012, -0.004);
  s.lineTo(0.012, -0.004);
  s.quadraticCurveTo(0.014, 0.004, 0, 0.006);
  s.quadraticCurveTo(-0.014, 0.004, -0.012, -0.004);
  const head = mesh(
    cachedGeo(
      "flapsel-head",
      () =>
        new THREE.ExtrudeGeometry(s, {
          depth: 0.008,
          bevelEnabled: true,
          bevelSize: 0.0015,
          bevelThickness: 0.0015,
          bevelSegments: 2,
        }),
    ),
    MAT.paint(0xe6e3da, 0.45),
  );
  head.position.z = 0.012;
  const hit = hitBox(0.03, 0.016, 0.03);
  hit.position.z = 0.014;
  moving.add(stem, head, hit);
  g.add(moving);
  return {
    group: g,
    moving,
    axis: new THREE.Vector3(0, -1, 0),
    travel,
    detents: labels.map((_, i) => i / Math.max(1, labels.length - 1)),
  };
}

/**
 * Landing-gear selector with a wheel-shaped knob. Value 0 = UP (top), 1 = DOWN.
 * Lever binding: axis (0,−1,0), travel, detents [0, 1].
 */
export function gearLever(o: { travel?: number } = {}): SliderPart & { detents: number[] } {
  const travel = o.travel ?? 0.05;
  const g = group("gear-lever");
  const plate = panelWithCutouts({
    width: 0.03,
    height: travel + 0.03,
    thickness: 0.003,
    cornerRadius: 0.003,
    holes: [{ x: 0, y: 0, w: 0.006, h: travel + 0.006, r: 0.003 }],
    material: MAT.satinBlack(),
  });
  plate.position.z = 0.003;
  const up = placard("UP", { width: 0.01 });
  up.position.set(0, travel / 2 + 0.011, 0.0035);
  const dn = placard("DOWN", { width: 0.016 });
  dn.position.set(0, -travel / 2 - 0.011, 0.0035);
  g.add(plate, up, dn);
  const moving = new THREE.Group();
  moving.position.y = travel / 2;
  const stem = mesh(cylinderZGeo(0.0025, 0.0025, 0.035, 10), MAT.chrome());
  const wheel = mesh(
    cachedGeo("gearwheel", () => {
      const t = new THREE.TorusGeometry(0.011, 0.0055, 12, 28);
      return t;
    }),
    MAT.paint(0xe6e3da, 0.4),
  );
  wheel.position.z = 0.038;
  const hub = mesh(cylinderZGeo(0.006, 0.006, 0.008, 20), MAT.paint(0x1a1a1a, 0.4));
  hub.position.z = 0.034;
  const hit = hitBox(0.036, 0.036, 0.05);
  hit.position.z = 0.03;
  moving.add(stem, wheel, hub, hit);
  g.add(moving);
  return { group: g, moving, axis: new THREE.Vector3(0, -1, 0), travel, detents: [0, 1] };
}

// ============================================================================ flight controls

export interface YokePart {
  group: THREE.Group;
  /** Translates fore/aft (panel yokes) or pivots (airliner column). */
  column: THREE.Object3D;
  /** Rotates with aileron. */
  wheel: THREE.Object3D;
  /** elevator +1 = full pull, aileron +1 = full right. */
  update(elevator: number, aileron: number): void;
}

/**
 * Control yoke. Panel-mounted styles ("ram-horn", "w", "vintage") have their group origin at
 * the panel face where the shaft enters; the hub sits `shaftLength` toward the pilot (+z).
 * "airliner": the group origin is the floor pivot; the column rises (+y) and the wheel faces +z.
 */
export function yoke(
  o: {
    style?: "ram-horn" | "w" | "airliner" | "vintage";
    shaftLength?: number;
    /** fore/aft travel (m) for panel yokes */
    travel?: number;
    maxRollDeg?: number;
    color?: number;
  } = {},
): YokePart {
  const style = o.style ?? "ram-horn";
  const g = group(`yoke:${style}`);
  const column = new THREE.Group();
  const wheel = new THREE.Group();
  const grip = MAT.rubber();
  const body = MAT.paint(o.color ?? 0x232427, 0.45, 0.15);
  const maxRoll = ((o.maxRollDeg ?? 80) * Math.PI) / 180;
  const travel = o.travel ?? 0.07;
  if (style === "airliner") {
    const colH = 0.62;
    const col = mesh(cylinderYGeo(0.022, 0.03, colH, 16), MAT.paint(0x3b3f45, 0.5, 0.2));
    const boot = mesh(cylinderYGeo(0.03, 0.06, 0.12, 16), MAT.leather(0x18191b));
    g.add(boot);
    column.add(col);
    wheel.position.set(0, colH + 0.01, 0.02);
    wheel.rotation.x = -0.35;
    const hub = roundedBox(0.09, 0.07, 0.05, body, 0.012);
    wheel.add(hub);
    for (const sx of [-1, 1]) {
      const horn = tubePath(
        [
          new THREE.Vector3(sx * 0.04, 0, 0),
          new THREE.Vector3(sx * 0.12, -0.015, 0.01),
          new THREE.Vector3(sx * 0.165, 0.03, 0.012),
          new THREE.Vector3(sx * 0.16, 0.1, 0.006),
        ],
        0.016,
        grip,
        { radial: 14 },
      );
      wheel.add(horn);
      const ap = mesh(cylinderZGeo(0.006, 0.006, 0.004, 16), MAT.paint(0xb3261e, 0.4));
      ap.position.set(sx * 0.165, 0.075, 0.018);
      wheel.add(ap);
    }
    const chart = roundedBox(0.08, 0.05, 0.004, MAT.paint(0x4b4f56, 0.6), 0.004);
    chart.position.set(0, 0.03, 0.025);
    chart.rotation.x = 0.2;
    wheel.add(chart);
    column.add(wheel);
    g.add(column);
    const hit = hitBox(0.38, 0.2, 0.1);
    hit.position.y = 0.04;
    wheel.add(hit);
    return {
      group: g,
      column,
      wheel,
      update(elevator, aileron) {
        column.rotation.x = elevator * 0.16;
        wheel.rotation.z = -aileron * maxRoll;
      },
    };
  }
  const L = o.shaftLength ?? 0.2;
  const tube = mesh(cylinderZGeo(0.011, 0.011, L + travel, 18), MAT.chrome());
  tube.position.z = -travel;
  column.add(tube);
  const collar = mesh(cylinderZGeo(0.018, 0.02, 0.012, 20), MAT.satinBlack());
  g.add(collar);
  wheel.position.z = L;
  if (style === "vintage") {
    const rim = mesh(
      cachedGeo("vintage-rim", () => new THREE.TorusGeometry(0.15, 0.011, 12, 48)),
      MAT.wood(0x4a2d18),
    );
    rim.position.z = 0.02;
    wheel.add(rim);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + Math.PI / 2;
      const spoke = rod(
        new THREE.Vector3(0, 0, 0.012),
        new THREE.Vector3(Math.cos(a) * 0.145, Math.sin(a) * 0.145, 0.02),
        0.005,
        MAT.chrome(),
      );
      wheel.add(spoke);
    }
    const hubv = mesh(cylinderZGeo(0.025, 0.028, 0.025, 24), MAT.chrome());
    wheel.add(hubv);
  } else {
    const hubShape = new THREE.Shape();
    roundedRectPath(hubShape, 0, 0, 0.14, 0.06, 0.02);
    const hub = mesh(
      cachedGeo(
        `yokehub:${style}`,
        () =>
          new THREE.ExtrudeGeometry(hubShape, {
            depth: 0.03,
            bevelEnabled: true,
            bevelSize: 0.006,
            bevelThickness: 0.006,
            bevelSegments: 3,
          }),
      ),
      body,
    );
    hub.position.z = -0.005;
    wheel.add(hub);
    const name = placard(["TRAINER"], { width: 0.05, color: "#9a9fa6", weight: 700 });
    name.position.set(0, 0.008, 0.0315);
    wheel.add(name);
    for (const sx of [-1, 1]) {
      const pts =
        style === "ram-horn"
          ? [
              new THREE.Vector3(sx * 0.065, -0.005, 0.012),
              new THREE.Vector3(sx * 0.13, -0.03, 0.016),
              new THREE.Vector3(sx * 0.165, 0.0, 0.018),
              new THREE.Vector3(sx * 0.16, 0.085, 0.014),
            ]
          : [
              new THREE.Vector3(sx * 0.06, -0.01, 0.012),
              new THREE.Vector3(sx * 0.11, -0.055, 0.016),
              new THREE.Vector3(sx * 0.16, -0.035, 0.018),
              new THREE.Vector3(sx * 0.175, 0.04, 0.016),
            ];
      wheel.add(tubePath(pts, 0.0145, grip, { radial: 14 }));
      const end = mesh(
        cachedGeo("sph:0.0145", () => new THREE.SphereGeometry(0.0145, 14, 10)),
        grip,
      );
      const last = pts[pts.length - 1];
      if (last) end.position.copy(last);
      wheel.add(end);
      // push-to-talk / trim switch on the left horn, AP disconnect red button
      const btn = mesh(
        cylinderZGeo(0.0045, 0.0045, 0.004, 14),
        MAT.paint(sx < 0 ? 0x111111 : 0xb3261e, 0.4),
      );
      btn.position.set(sx * 0.15, 0.055, 0.028);
      wheel.add(btn);
    }
  }
  column.add(wheel);
  g.add(column);
  const hit = hitBox(0.36, 0.17, 0.08);
  hit.position.z = 0.02;
  wheel.add(hit);
  return {
    group: g,
    column,
    wheel,
    update(elevator, aileron) {
      column.position.z = elevator * travel * 0.5;
      wheel.rotation.z = -aileron * maxRoll;
    },
  };
}

export interface StickPart {
  group: THREE.Group;
  /** Rotates: x with elevator (pull = top toward pilot), z with aileron. */
  pivot: THREE.Object3D;
  update(elevator: number, aileron: number): void;
}

/**
 * Centre control stick (floor pivot at origin, stick rises along +y).
 * "vintage": tall stick with a round grip & leather boot (Cub-era); "modern": ergonomic grip.
 */
export function controlStick(
  o: { style?: "vintage" | "modern"; length?: number; maxDeg?: number } = {},
): StickPart {
  const style = o.style ?? "vintage";
  const L = o.length ?? (style === "vintage" ? 0.62 : 0.5);
  const max = ((o.maxDeg ?? 14) * Math.PI) / 180;
  const g = group(`stick:${style}`);
  const pivot = new THREE.Group();
  const boot = mesh(
    cylinderYGeo(0.02, 0.06, 0.09, 16),
    MAT.leather(style === "vintage" ? 0x3d2a1c : 0x18191b),
  );
  g.add(boot);
  const shaft = mesh(
    cylinderYGeo(0.011, 0.014, L, 14),
    style === "vintage" ? MAT.paint(0x2c2d2f, 0.6, 0.3) : MAT.satinBlack(),
  );
  pivot.add(shaft);
  if (style === "vintage") {
    const grip = mesh(cylinderYGeo(0.018, 0.016, 0.11, 16), MAT.rubber());
    grip.position.y = L - 0.06;
    const knob = mesh(
      cachedGeo("sph:0.02", () => new THREE.SphereGeometry(0.02, 16, 12)),
      MAT.rubber(),
    );
    knob.position.y = L + 0.05;
    pivot.add(grip, knob);
  } else {
    const grip = mesh(
      latheZGeo("modgrip", [
        [0.0001, 0.13],
        [0.016, 0.125],
        [0.022, 0.1],
        [0.02, 0.04],
        [0.016, 0],
      ]),
      MAT.rubber(),
    );
    grip.rotation.x = -Math.PI / 2;
    grip.position.y = L - 0.03;
    const trim = mesh(cylinderZGeo(0.005, 0.005, 0.004, 12), MAT.paint(0x555555, 0.4));
    trim.rotation.x = -Math.PI / 2;
    trim.position.set(0, L + 0.1, 0);
    pivot.add(grip, trim);
  }
  const hit = hitBox(0.07, L * 0.6, 0.07);
  hit.position.y = L * 0.75;
  pivot.add(hit);
  g.add(pivot);
  return {
    group: g,
    pivot,
    update(elevator, aileron) {
      pivot.rotation.x = elevator * max;
      pivot.rotation.z = -aileron * max;
    },
  };
}

/** Side-stick (console-mounted, airliner fly-by-wire style). Pivot at the group origin. */
export function sideStick(o: { maxDeg?: number } = {}): StickPart {
  const max = ((o.maxDeg ?? 16) * Math.PI) / 180;
  const g = group("sidestick");
  const boot = mesh(cylinderYGeo(0.022, 0.04, 0.03, 18), MAT.leather(0x141517));
  g.add(boot);
  const pivot = new THREE.Group();
  const grip = mesh(
    latheZGeo("sidegrip", [
      [0.0001, 0.15],
      [0.02, 0.145],
      [0.026, 0.12],
      [0.024, 0.06],
      [0.018, 0.02],
      [0.014, 0],
    ]),
    MAT.rubber(),
  );
  grip.rotation.x = -Math.PI / 2;
  grip.rotation.z = 0.15;
  const disc = mesh(cylinderZGeo(0.006, 0.006, 0.006, 14), MAT.paint(0xb3261e, 0.45));
  disc.rotation.x = -Math.PI / 2;
  disc.position.set(0.012, 0.145, -0.008);
  pivot.add(grip, disc);
  const hit = hitBox(0.06, 0.16, 0.06);
  hit.position.y = 0.08;
  pivot.add(hit);
  g.add(pivot);
  return {
    group: g,
    pivot,
    update(elevator, aileron) {
      pivot.rotation.x = elevator * max;
      pivot.rotation.z = -aileron * max;
    },
  };
}

export interface PedalsPart {
  group: THREE.Group;
  left: THREE.Object3D;
  right: THREE.Object3D;
  /** rudder +1 = right pedal forward; brakes 0..1 tilts the toe-brake pads. */
  update(rudder: number, brakes?: number): void;
}

/**
 * Rudder pedals (pair) centred at the origin, pedal faces toward the pilot (+z).
 * "hanging": pedals hang from a bar (modern light aircraft / airliners), "floor": floor-hinged,
 * "bar": vintage rudder bar with heel brakes.
 */
export function rudderPedals(
  o: {
    spacing?: number;
    style?: "hanging" | "floor" | "bar";
    toeBrakes?: boolean;
    travel?: number;
  } = {},
): PedalsPart {
  const style = o.style ?? "hanging";
  const spacing = o.spacing ?? 0.2;
  const travel = o.travel ?? 0.06;
  const g = group(`pedals:${style}`);
  const metal = MAT.aluminium(0x7d848b);
  const pedalMat = MAT.paint(0x2a2b2e, 0.6, 0.3);
  const mk = (sx: number) => {
    const p = new THREE.Group();
    p.position.x = sx * spacing * 0.5;
    if (style === "bar") {
      const plate = roundedBox(0.09, 0.04, 0.008, pedalMat, 0.004);
      plate.position.set(0, 0.03, 0);
      p.add(plate);
    } else {
      const arm = mesh(cylinderYGeo(0.007, 0.007, 0.2, 10), metal);
      arm.position.y = style === "hanging" ? -0.04 : -0.2;
      const pad = roundedBox(0.07, 0.11, 0.012, pedalMat, 0.004);
      pad.position.set(0, -0.05, 0.012);
      pad.rotation.x = -0.35;
      const toe = new THREE.Group();
      toe.position.set(0, 0.012, 0.015);
      const toePad = roundedBox(0.07, 0.04, 0.01, MAT.paint(0x3a3b3e, 0.7, 0.3), 0.003);
      toePad.position.y = 0.02;
      toe.add(toePad);
      if (o.toeBrakes !== false) p.add(toe);
      p.userData["toe"] = toe;
      p.add(arm, pad);
      // anti-slip ribs
      for (let i = 0; i < 4; i++) {
        const rib = roundedBox(0.06, 0.004, 0.004, MAT.rubber(), 0.001);
        rib.position.set(0, -0.085 + i * 0.022, 0.026 - i * 0.008);
        rib.rotation.x = -0.35;
        p.add(rib);
      }
    }
    const hit = hitBox(0.09, 0.14, 0.06);
    hit.position.set(0, -0.03, 0.02);
    p.add(hit);
    g.add(p);
    return p;
  };
  const left = mk(-1);
  const right = mk(1);
  if (style === "bar") {
    const barPivot = new THREE.Group();
    const bar = rod(
      new THREE.Vector3(-spacing * 0.6, 0, 0),
      new THREE.Vector3(spacing * 0.6, 0, 0),
      0.01,
      metal,
    );
    barPivot.add(bar);
    g.add(barPivot);
    g.userData["bar"] = barPivot;
  } else {
    const cross = rod(
      new THREE.Vector3(-spacing * 0.65, style === "hanging" ? 0.16 : -0.2, -0.01),
      new THREE.Vector3(spacing * 0.65, style === "hanging" ? 0.16 : -0.2, -0.01),
      0.009,
      metal,
    );
    g.add(cross);
  }
  const baseL = left.position.z;
  const baseR = right.position.z;
  return {
    group: g,
    left,
    right,
    update(rudder, brakes = 0) {
      left.position.z = baseL + rudder * travel * 0.5;
      right.position.z = baseR - rudder * travel * 0.5;
      const tl = left.userData["toe"] as THREE.Object3D | undefined;
      const tr = right.userData["toe"] as THREE.Object3D | undefined;
      if (tl) tl.rotation.x = -brakes * 0.35;
      if (tr) tr.rotation.x = -brakes * 0.35;
    },
  };
}

/**
 * Pitch-trim wheel (wheel axis along x, rim visible above the console) with a NOSE DN / TO /
 * NOSE UP indicator. Origin = wheel centre. `set(trim)` with −1..1 (+ = nose up).
 */
export function trimWheel(o: { radius?: number; width?: number; color?: number } = {}): {
  group: THREE.Group;
  wheel: THREE.Object3D;
  indicator: THREE.Object3D;
  set(trim: number): void;
} {
  const R = o.radius ?? 0.075;
  const W = o.width ?? 0.022;
  const g = group("trim-wheel");
  const wheel = new THREE.Group();
  const disc = mesh(
    cachedGeo(`trimdisc:${r3(R)}:${r3(W)}`, () => {
      const c = new THREE.CylinderGeometry(R, R, W, 48);
      c.rotateZ(Math.PI / 2);
      return c;
    }),
    MAT.paint(o.color ?? 0x1c1d20, 0.6),
  );
  wheel.add(disc);
  // grip ridges
  const ridgeGeo = roundedBoxGeo(W * 1.02, 0.006, 0.008, 0.002);
  const ridges = new THREE.InstancedMesh(ridgeGeo, MAT.paint(0x2c2e31, 0.6), 28);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * Math.PI * 2;
    e.set(a, 0, 0);
    q.setFromEuler(e);
    m4.compose(
      new THREE.Vector3(0, Math.cos(a) * R, Math.sin(a) * R),
      q,
      new THREE.Vector3(1, 1, 1),
    );
    ridges.setMatrixAt(i, m4);
  }
  ridges.instanceMatrix.needsUpdate = true;
  ridges.computeBoundingSphere();
  wheel.add(ridges);
  // white index stripe
  const stripe = roundedBox(W * 1.03, 0.012, 0.004, MAT.placardWhite(), 0.001);
  stripe.position.set(0, R, 0);
  wheel.add(stripe);
  g.add(wheel);
  // indicator scale beside the wheel
  const scaleGroup = new THREE.Group();
  scaleGroup.position.set(W / 2 + 0.016, R * 0.55, 0);
  scaleGroup.rotation.y = Math.PI / 2;
  const sc = placard(["NOSE", "DN", "", "TO", "", "NOSE", "UP"], {
    width: 0.022,
    background: "#131416",
    px: 40,
  });
  sc.rotation.z = 0;
  scaleGroup.add(sc);
  const indicator = roundedBox(0.012, 0.003, 0.003, MAT.paint(0xf2c230, 0.4), 0.001);
  indicator.position.z = 0.002;
  scaleGroup.add(indicator);
  g.add(scaleGroup);
  const hit = hitBox(W * 1.6, R * 2.1, R * 2.1);
  g.add(hit);
  const span = 0.045;
  return {
    group: g,
    wheel,
    indicator,
    set(trim: number) {
      wheel.rotation.x = -trim * Math.PI * 1.5;
      indicator.position.y = -trim * span * 0.5;
    },
  };
}

// ============================================================================ cabin structure

/** A seat (origin = floor centre under the seat, facing −z). Hidden in the inspect view. */
export function seat(
  o: { style?: "fabric" | "leather" | "vintage" | "airliner"; color?: number; width?: number } = {},
): THREE.Group {
  const style = o.style ?? "fabric";
  const w = o.width ?? (style === "airliner" ? 0.52 : style === "vintage" ? 0.42 : 0.46);
  const g = group(`seat:${style}`);
  g.userData["hideInInspect"] = true;
  const cover =
    style === "leather" || style === "airliner"
      ? MAT.leather(o.color ?? 0x2a2420)
      : style === "vintage"
        ? MAT.fabric(o.color ?? 0x6b5a45)
        : MAT.fabric(o.color ?? 0x3a3f47);
  const frame = MAT.aluminium(0x55595e);
  const cushion = roundedBox(w, 0.1, 0.46, cover, 0.04);
  cushion.position.set(0, 0.36, 0.02);
  cushion.rotation.x = -0.06;
  const back = roundedBox(w, style === "vintage" ? 0.5 : 0.62, 0.11, cover, 0.045);
  back.position.set(0, 0.7, 0.28);
  back.rotation.x = -0.22;
  g.add(cushion, back);
  if (style !== "vintage") {
    const head = roundedBox(w * 0.6, 0.18, 0.1, cover, 0.04);
    head.position.set(0, 1.1, 0.37);
    head.rotation.x = -0.18;
    g.add(head);
    for (const sx of [-1, 1]) {
      const bolster = roundedBox(0.06, 0.08, 0.42, cover, 0.03);
      bolster.position.set(sx * (w / 2 - 0.02), 0.42, 0.02);
      g.add(bolster);
    }
  } else {
    // tubular frame
    g.add(
      tubePath(
        [
          new THREE.Vector3(-w / 2, 0.3, -0.2),
          new THREE.Vector3(-w / 2, 0.32, 0.25),
          new THREE.Vector3(-w / 2, 0.92, 0.42),
        ],
        0.011,
        MAT.paint(0x26323a, 0.5, 0.3),
      ),
      tubePath(
        [
          new THREE.Vector3(w / 2, 0.3, -0.2),
          new THREE.Vector3(w / 2, 0.32, 0.25),
          new THREE.Vector3(w / 2, 0.92, 0.42),
        ],
        0.011,
        MAT.paint(0x26323a, 0.5, 0.3),
      ),
    );
  }
  if (style === "airliner") {
    for (const sx of [-1, 1]) {
      const arm = roundedBox(0.07, 0.05, 0.36, cover, 0.02);
      arm.position.set(sx * (w / 2 + 0.04), 0.62, 0.08);
      g.add(arm);
    }
  }
  // base / rails
  const pedestal = roundedBox(w * 0.7, 0.26, 0.36, frame, 0.01);
  pedestal.position.set(0, 0.16, 0.04);
  g.add(pedestal);
  for (const sx of [-1, 1]) {
    const rail = roundedBox(0.025, 0.02, 0.6, MAT.brushedMetal(0x8c9298), 0.004);
    rail.position.set(sx * w * 0.32, 0.01, 0.0);
    g.add(rail);
  }
  return g;
}

/** Windshield frame: A-pillars, top bow, optional centre post and optional (subtle) glass. */
export function windshieldFrame(o: {
  bottomY: number;
  topY: number;
  bottomZ: number;
  topZ: number;
  halfWidthBottom: number;
  halfWidthTop: number;
  centerPost?: boolean;
  pillarRadius?: number;
  /** Add a faint tinted glass pane (default false = open, nothing occludes the view). */
  glass?: boolean;
  material?: THREE.Material;
  /** Centre of the cabin (x) — default 0 is the pilot eye; pass the cabin centreline. */
  centerX?: number;
}): THREE.Group {
  const g = group("windshield");
  const cx = o.centerX ?? 0;
  const mat = o.material ?? MAT.paint(0x2a2c2f, 0.55, 0.2);
  const r = o.pillarRadius ?? 0.022;
  const bl = new THREE.Vector3(cx - o.halfWidthBottom, o.bottomY, o.bottomZ);
  const br = new THREE.Vector3(cx + o.halfWidthBottom, o.bottomY, o.bottomZ);
  const tl = new THREE.Vector3(cx - o.halfWidthTop, o.topY, o.topZ);
  const tr = new THREE.Vector3(cx + o.halfWidthTop, o.topY, o.topZ);
  g.add(rod(bl, tl, r, mat), rod(br, tr, r, mat));
  g.add(tubePath([tl, new THREE.Vector3(cx, o.topY + 0.02, o.topZ + 0.01), tr], r * 0.9, mat));
  if (o.centerPost) {
    g.add(
      rod(
        new THREE.Vector3(cx, o.bottomY, o.bottomZ),
        new THREE.Vector3(cx, o.topY + 0.02, o.topZ + 0.01),
        r * 0.55,
        mat,
      ),
    );
  }
  if (o.glass) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(
        [
          bl.x,
          bl.y,
          bl.z,
          br.x,
          br.y,
          br.z,
          tr.x,
          tr.y,
          tr.z,
          bl.x,
          bl.y,
          bl.z,
          tr.x,
          tr.y,
          tr.z,
          tl.x,
          tl.y,
          tl.z,
        ],
        3,
      ),
    );
    geo.computeVertexNormals();
    const glass = mesh(geo, MAT.glass(), "windshield-glass");
    glass.renderOrder = 3;
    g.add(glass);
  }
  return g;
}

/**
 * Cabin shell: floor (carpet), side walls with window openings and armrests, headliner, firewall
 * footwell and rear bulkhead. Coordinates are in cockpit space (pilot eye origin).
 */
export function cabinShell(o: {
  /** Cabin centreline x (the left-seat eye is at x = 0, so typically ≈ +0.27 for side-by-side). */
  centerX?: number;
  halfWidth: number;
  floorY: number;
  ceilingY: number;
  /** Front (firewall) z, negative; rear bulkhead z, positive. */
  frontZ: number;
  rearZ: number;
  sillY: number;
  windowTopY: number;
  windowFrontZ: number;
  windowRearZ: number;
  style?: "light-aircraft" | "vintage" | "airliner";
  wallColor?: number;
  floorColor?: number;
  ceilingColor?: number;
  /** Omit the headliner (open-cockpit look / better inspect view). */
  noHeadliner?: boolean;
}): THREE.Group {
  const style = o.style ?? "light-aircraft";
  const g = group("cabin");
  const cx = o.centerX ?? 0;
  const wallMat =
    style === "vintage"
      ? MAT.fabric(o.wallColor ?? 0x8a7a62)
      : MAT.plastic(o.wallColor ?? (style === "airliner" ? 0x9aa0a6 : 0x77736c));
  const len = o.rearZ - o.frontZ;
  const h = o.ceilingY - o.floorY;
  for (const side of [-1, 1]) {
    // wall in the (z, y) plane with a window hole
    const s = new THREE.Shape();
    s.moveTo(o.frontZ, o.floorY);
    s.lineTo(o.rearZ, o.floorY);
    s.lineTo(o.rearZ, o.ceilingY);
    s.lineTo(o.frontZ, o.ceilingY);
    s.closePath();
    const hole = new THREE.Path();
    roundedRectPath(
      hole,
      (o.windowFrontZ + o.windowRearZ) / 2,
      (o.sillY + o.windowTopY) / 2,
      o.windowRearZ - o.windowFrontZ,
      o.windowTopY - o.sillY,
      0.06,
    );
    s.holes.push(hole);
    const geo = new THREE.ExtrudeGeometry(s, {
      depth: 0.012,
      bevelEnabled: false,
      curveSegments: 10,
    });
    // shape x = z(world), shape y = y; extrusion along x(world)
    // rotateY(−90°): shape x → world z, extrusion (+z) → world −x (wall spans x ∈ [−0.012, 0]).
    geo.rotateY(-Math.PI / 2);
    const wall = mesh(geo, wallMat, `wall${side}`);
    wall.position.x = cx + side * o.halfWidth + (side > 0 ? 0 : 0.012);
    g.add(wall);
    // window trim
    const trimMat = MAT.plastic(0x4b4a47, 0.55);
    const zc = (o.windowFrontZ + o.windowRearZ) / 2;
    const wz = o.windowRearZ - o.windowFrontZ;
    const top = roundedBox(0.03, 0.025, wz, trimMat, 0.008);
    top.position.set(cx + side * (o.halfWidth - 0.01), o.windowTopY + 0.012, zc);
    const sill = roundedBox(0.05, 0.03, wz, trimMat, 0.01);
    sill.position.set(cx + side * (o.halfWidth - 0.02), o.sillY - 0.012, zc);
    g.add(top, sill);
    // armrest + door handle
    if (style !== "vintage") {
      const arm = roundedBox(0.07, 0.05, 0.38, MAT.plastic(0x5a5853, 0.6), 0.02);
      arm.position.set(cx + side * (o.halfWidth - 0.04), o.sillY - 0.14, 0.05);
      const handle = tubePath(
        [
          new THREE.Vector3(cx + side * (o.halfWidth - 0.012), o.sillY - 0.06, -0.15),
          new THREE.Vector3(cx + side * (o.halfWidth - 0.04), o.sillY - 0.06, -0.1),
          new THREE.Vector3(cx + side * (o.halfWidth - 0.012), o.sillY - 0.06, -0.05),
        ],
        0.008,
        MAT.chrome(),
      );
      g.add(arm, handle);
    }
  }
  const floor = roundedBox(o.halfWidth * 2, 0.02, len, MAT.carpet(o.floorColor ?? 0x2a2c30), 0.005);
  floor.position.set(cx, o.floorY - 0.01, (o.frontZ + o.rearZ) / 2);
  g.add(floor);
  // footwell / firewall slope
  const fw = roundedBox(
    o.halfWidth * 2,
    h * 0.5,
    0.02,
    MAT.carpet(o.floorColor ?? 0x2a2c30),
    0.005,
  );
  fw.position.set(cx, o.floorY + h * 0.22, o.frontZ + 0.08);
  fw.rotation.x = -0.6;
  g.add(fw);
  const rear = roundedBox(o.halfWidth * 2, h, 0.02, wallMat, 0.005);
  rear.position.set(cx, o.floorY + h / 2, o.rearZ);
  rear.userData["hideInInspect"] = true;
  g.add(rear);
  if (!o.noHeadliner) {
    const R = o.halfWidth * 1.4;
    const col = o.ceilingColor ?? (style === "airliner" ? 0xa7abb0 : 0x9a968e);
    const head = mesh(
      new THREE.CylinderGeometry(R, R, len - 0.25, 32, 1, true, -0.78, 1.56)
        .rotateX(Math.PI / 2)
        .rotateZ(Math.PI),
      cachedMat(`headliner:${col}`, () => {
        const t = withRepeat(weaveTexture(), 10, "weave");
        return std({ color: col, roughness: 0.95, map: t, side: THREE.DoubleSide });
      }),
      "headliner",
    );
    head.position.set(cx, o.ceilingY - R, (o.frontZ + o.rearZ) / 2 + 0.12);
    head.userData["hideInInspect"] = true;
    g.add(head);
  }
  return g;
}

// ============================================================================ misc instruments & items

/**
 * Wet (whiskey) compass: housing + floating card read against a lubber line. Mount on the
 * windshield centre post / glareshield. `set(headingDeg)`.
 */
export function wetCompass(): {
  group: THREE.Group;
  card: THREE.Object3D;
  set(heading: number): void;
} {
  const g = group("wet-compass");
  const body = roundedBox(0.07, 0.06, 0.05, MAT.paint(0x141516, 0.4), 0.012);
  body.position.z = -0.045;
  g.add(body);
  const bracket = roundedBox(0.012, 0.04, 0.03, MAT.satinBlack(), 0.003);
  bracket.position.set(0, 0.045, -0.035);
  g.add(bracket);
  const tex = cachedTex("compasscard", () => {
    const { canvas, ctx } = makeCanvas(1024, 96);
    ctx.fillStyle = "#121314";
    ctx.fillRect(0, 0, 1024, 96);
    ctx.fillStyle = "#f2f2ec";
    ctx.strokeStyle = "#f2f2ec";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (let d = 0; d < 360; d += 5) {
      // card reads increasing headings toward the left as you turn right (reversed scale)
      const x = 1024 - (d / 360) * 1024;
      ctx.lineWidth = d % 30 === 0 ? 3 : 1.5;
      ctx.beginPath();
      ctx.moveTo(x, 70);
      ctx.lineTo(x, d % 10 === 0 ? 52 : 60);
      ctx.stroke();
      if (d % 30 === 0) {
        const lab =
          d === 0 ? "N" : d === 90 ? "E" : d === 180 ? "S" : d === 270 ? "W" : String(d / 10);
        ctx.font = `700 ${lab.length === 1 && /[NESW]/.test(lab) ? 40 : 30}px ${FONT}`;
        ctx.fillText(lab, x, 28);
        if (d === 0) ctx.fillText(lab, x - 1024, 28);
      }
    }
    const t = canvasTexture(canvas);
    t.wrapS = THREE.RepeatWrapping;
    return t;
  });
  const card = new THREE.Group();
  card.position.z = -0.03;
  const drum = mesh(
    cachedGeo("compassdrum", () => new THREE.CylinderGeometry(0.024, 0.024, 0.02, 48, 1, true)),
    cachedMat("compassdrummat", () => std({ map: tex, roughness: 0.6, side: THREE.DoubleSide })),
  );
  card.add(drum);
  g.add(card);
  const lens = mesh(
    cachedGeo("plane:0.042:0.026", () => new THREE.PlaneGeometry(0.042, 0.026)),
    MAT.gaugeGlass(),
  );
  lens.position.z = -0.001;
  lens.renderOrder = 2;
  const lubber = roundedBox(0.0012, 0.026, 0.001, MAT.paint(0xff7a1a, 0.4), 0.0003);
  lubber.position.set(0, 0, -0.0015);
  const window = panelWithCutouts({
    width: 0.07,
    height: 0.06,
    thickness: 0.026,
    cornerRadius: 0.01,
    bevel: 0.001,
    holes: [{ x: 0, y: 0, w: 0.04, h: 0.024, r: 0.008 }],
    material: MAT.paint(0x141516, 0.4),
  });
  window.position.z = 0.0;
  g.add(lens, window, lubber);
  const devCard = placard(["FOR  N  30  60  E", "STEER 0  29  59  91"], {
    width: 0.05,
    background: "#e9e6dc",
    color: "#111",
    px: 36,
  });
  devCard.position.set(0, -0.04, -0.0005);
  g.add(devCard);
  const hit = hitBox(0.075, 0.1, 0.07);
  hit.position.set(0, -0.01, -0.03);
  g.add(hit);
  return {
    group: g,
    card,
    set(heading: number) {
      // Drum seen from the front: rotate so `heading` sits under the lubber line.
      card.rotation.y = (heading * Math.PI) / 180;
    },
  };
}

/**
 * A row of push-to-reset circuit breakers with one shared label strip above (one draw call for
 * the breakers + one for the labels). Origin = row centre on the panel face.
 */
export function circuitBreakerRow(o: {
  labels: string[];
  amps?: number[];
  spacing?: number;
}): THREE.Group {
  const sp = o.spacing ?? 0.024;
  const n = o.labels.length;
  const g = group("breakers");
  const geo = latheZGeo("cb", [
    [0.0055, 0],
    [0.0055, 0.002],
    [0.0038, 0.0028],
    [0.0034, 0.008],
    [0.0001, 0.0085],
  ]);
  const im = new THREE.InstancedMesh(geo, MAT.paint(0x0f0f10, 0.4), n);
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < n; i++) {
    m4.makeTranslation(-((n - 1) * sp) / 2 + i * sp, 0, 0);
    im.setMatrixAt(i, m4);
  }
  im.instanceMatrix.needsUpdate = true;
  im.computeBoundingSphere();
  g.add(im);
  const key = `cbrow:${o.labels.join("|")}:${(o.amps ?? []).join("|")}:${sp}`;
  const tex = cachedTex(key, () => {
    const cw = 96;
    const { canvas, ctx } = makeCanvas(cw * n, 64);
    ctx.fillStyle = "#ecece6";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    o.labels.forEach((l, i) => {
      const fs = Math.min(22, 150 / Math.max(4, l.length));
      ctx.font = `700 ${fs}px ${FONT}`;
      ctx.fillText(l, cw * (i + 0.5), 20);
      const a = o.amps?.[i];
      if (a !== undefined) {
        ctx.font = `600 18px ${FONT}`;
        ctx.fillText(String(a), cw * (i + 0.5), 46);
      }
    });
    return canvasTexture(canvas);
  });
  const strip = mesh(
    cachedGeo(
      `plane:${r3(sp * n)}:${r3((sp * n * 64) / (96 * n))}`,
      () => new THREE.PlaneGeometry(sp * n, (sp * n * 64) / (96 * n)),
    ),
    cachedMat(`cbmat:${key}`, () => std({ map: tex, transparent: true, roughness: 0.7 })),
  );
  strip.position.set(0, 0.012, 0.0003);
  g.add(strip);
  return g;
}

/** Hand-held fire extinguisher in a quick-release bracket (origin = bracket base, upright). */
export function fireExtinguisher(): THREE.Group {
  const g = group("extinguisher");
  const body = mesh(cylinderYGeo(0.035, 0.035, 0.26, 24), MAT.paint(0xb3261e, 0.35, 0.2));
  const top = mesh(cylinderYGeo(0.012, 0.03, 0.04, 20), MAT.chrome());
  top.position.y = 0.26;
  const handle = roundedBox(0.012, 0.012, 0.07, MAT.satinBlack(), 0.003);
  handle.position.set(0, 0.31, 0.02);
  const gauge = mesh(cylinderZGeo(0.009, 0.009, 0.004, 16), MAT.paint(0xeeeeee, 0.3));
  gauge.position.set(0, 0.285, 0.014);
  const strap = mesh(cylinderYGeo(0.037, 0.037, 0.02, 24), MAT.satinBlack());
  strap.position.y = 0.08;
  const strap2 = strap.clone();
  strap2.position.y = 0.19;
  g.add(body, top, handle, gauge, strap, strap2);
  return g;
}

/** Overhead dome / map light (origin = mount on the ceiling, light faces down). */
export function domeLight(): THREE.Group {
  const g = group("dome-light");
  const base = mesh(cylinderYGeo(0.035, 0.04, 0.012, 24), MAT.plastic(0x6a6862));
  base.position.y = -0.012;
  const lens = mesh(cylinderYGeo(0.028, 0.028, 0.004, 24), MAT.emissive(0xfff2d6, 0.25));
  lens.position.y = -0.016;
  g.add(base, lens);
  return g;
}

/**
 * Airliner-style flight-management keypad (CDU) with a static, original sample page on its
 * screen. Origin = centre of the front face. Purely visual (labels drawn on one texture).
 */
export function cdu(o: { width?: number; title?: string } = {}): THREE.Group {
  const W = o.width ?? 0.15;
  const H = W * 1.5;
  const g = group("cdu");
  const body = roundedBox(W, H, 0.03, MAT.paint(0x24272b, 0.55, 0.1), 0.006);
  body.position.z = -0.015;
  g.add(body);
  const scrW = W * 0.62;
  const scrH = W * 0.5;
  const screenTex = cachedTex(`cdu-screen:${o.title ?? ""}`, () => {
    const { canvas, ctx } = makeCanvas(512, 412);
    ctx.fillStyle = "#020403";
    ctx.fillRect(0, 0, 512, 412);
    ctx.font = `600 30px ui-monospace, Menlo, monospace`;
    ctx.textBaseline = "top";
    const lines: Array<[string, string, string]> = [
      ["#f2f2ec", "center", o.title ?? "POS INIT        1/2"],
      ["#9fe8ff", "left", " REF AIRPORT"],
      ["#f2f2ec", "left", " ----"],
      ["#9fe8ff", "left", " GATE"],
      ["#f2f2ec", "left", " -----"],
      ["#9fe8ff", "left", " UTC        GPS POS"],
      ["#f2f2ec", "left", " 1432z  N4732.1W12218.5"],
      ["#9fe8ff", "left", " SET IRS POS"],
      ["#f2f2ec", "left", " □□□°□□.□ □□□□°□□.□"],
      ["#f2f2ec", "left", " ------------------------"],
      ["#f2f2ec", "left", "<INDEX       ROUTE>"],
    ];
    lines.forEach(([c, a, t], i) => {
      ctx.fillStyle = c;
      ctx.textAlign = a as CanvasTextAlign;
      ctx.fillText(t, a === "center" ? 256 : 8, 10 + i * 36);
    });
    return canvasTexture(canvas);
  });
  const screen = mesh(
    cachedGeo(`plane:${r3(scrW)}:${r3(scrH)}`, () => new THREE.PlaneGeometry(scrW, scrH)),
    cachedMat(
      `cdu-screen-mat:${o.title ?? ""}`,
      () => new THREE.MeshBasicMaterial({ map: screenTex, toneMapped: false }),
    ),
  );
  screen.position.set(0, H / 2 - scrH / 2 - 0.012, 0.0004);
  g.add(screen);
  // line-select keys
  const lsk = new THREE.InstancedMesh(
    roundedBoxGeo(0.009, 0.006, 0.004, 0.0012),
    MAT.paint(0x3a3e43, 0.5),
    12,
  );
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < 12; i++) {
    const side = i < 6 ? -1 : 1;
    const row = i % 6;
    m4.makeTranslation(side * (scrW / 2 + 0.01), H / 2 - 0.022 - row * (scrH / 6.2), 0.002);
    lsk.setMatrixAt(i, m4);
  }
  lsk.instanceMatrix.needsUpdate = true;
  lsk.computeBoundingSphere();
  g.add(lsk);
  // keypad: function keys (2 rows × 5), alpha (6 × 5) and numeric (4 × 3)
  const keys: Array<[number, number, number, number]> = [];
  const top = H / 2 - scrH - 0.03;
  for (let r = 0; r < 2; r++)
    for (let c = 0; c < 5; c++)
      keys.push([-W * 0.4 + c * W * 0.2, top - r * 0.013, W * 0.17, 0.009]);
  const alphaTop = top - 0.032;
  for (let r = 0; r < 6; r++)
    for (let c = 0; c < 5; c++)
      keys.push([-W * 0.02 + c * W * 0.1, alphaTop - r * 0.0125, W * 0.085, 0.009]);
  for (let r = 0; r < 4; r++)
    for (let c = 0; c < 3; c++)
      keys.push([-W * 0.42 + c * W * 0.12, alphaTop - r * 0.0155, W * 0.1, 0.011]);
  const keyMesh = new THREE.InstancedMesh(
    roundedBoxGeo(1, 1, 0.005, 0.0015),
    MAT.paint(0x3a3e43, 0.5),
    keys.length,
  );
  const s = new THREE.Vector3();
  const q = new THREE.Quaternion();
  keys.forEach(([x, y, w, h], i) => {
    s.set(w, h, 1);
    m4.compose(new THREE.Vector3(x, y, 0.0025), q, s);
    keyMesh.setMatrixAt(i, m4);
  });
  keyMesh.instanceMatrix.needsUpdate = true;
  keyMesh.computeBoundingSphere();
  g.add(keyMesh);
  const labelTex = cachedTex(`cdu-keys:${W}`, () => {
    const PX = 1200;
    const { canvas, ctx } = makeCanvas(PX, Math.round(PX * 1.5));
    const toPx = (x: number, y: number): [number, number] => [
      ((x + W / 2) / W) * PX,
      ((H / 2 - y) / H) * PX * 1.5,
    ];
    ctx.fillStyle = "#eef0f2";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const fn = ["INIT", "RTE", "CLB", "CRZ", "DES", "MENU", "LEGS", "DEP", "HOLD", "PROG"];
    const alpha = "ABCDEFGHIJKLMNOPQRSTUVWXYZ /⌫".split("");
    const num = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "+/-"];
    keys.forEach(([x, y], i) => {
      const [px, py] = toPx(x, y);
      const t = i < 10 ? fn[i] : i < 40 ? alpha[i - 10] : num[i - 40];
      if (!t) return;
      ctx.font = `700 ${i < 10 ? 26 : 34}px ${FONT}`;
      ctx.fillText(t, px, py);
    });
    return canvasTexture(canvas);
  });
  const labels = mesh(
    cachedGeo(`plane:${r3(W)}:${r3(H)}`, () => new THREE.PlaneGeometry(W, H)),
    cachedMat(
      `cdu-keys-mat:${W}`,
      () =>
        new THREE.MeshBasicMaterial({
          map: labelTex,
          transparent: true,
          toneMapped: false,
          opacity: 0.9,
        }),
    ),
  );
  labels.position.z = 0.0052;
  g.add(labels);
  return g;
}

// ============================================================================ merging

/**
 * Merge every static mesh under `source` into one mesh per material (huge draw-call saving for
 * panels, walls, screws…). Returns a new Group in `source`'s local space; the original meshes'
 * unique geometries are disposed. Do NOT merge hotspot objects or anything that moves.
 * InstancedMeshes and multi-material meshes are kept as they are (moved into the result).
 */
export function mergeStatic(source: THREE.Object3D): THREE.Group {
  source.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(source.matrixWorld).invert();
  const buckets = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const keep: THREE.Object3D[] = [];
  const out = group(`${source.name || "static"}:merged`);
  source.traverse((o) => {
    if (o === source) return;
    if ((o as THREE.InstancedMesh).isInstancedMesh || (o as THREE.Mesh).isMesh) {
      const m = o as THREE.Mesh;
      if (!m.visible || m.userData["hitProxy"]) return;
      if ((o as THREE.InstancedMesh).isInstancedMesh || Array.isArray(m.material)) {
        keep.push(o);
        return;
      }
      const mat = m.material as THREE.Material;
      if (mat.transparent) {
        keep.push(o);
        return;
      }
      let geo = m.geometry.clone();
      if (geo.index) geo = geo.toNonIndexed();
      for (const name of Object.keys(geo.attributes)) {
        if (name !== "position" && name !== "normal" && name !== "uv") geo.deleteAttribute(name);
      }
      if (!geo.attributes["uv"]) {
        const n = (geo.attributes["position"] as THREE.BufferAttribute).count;
        geo.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2));
      }
      if (!geo.attributes["normal"]) geo.computeVertexNormals();
      geo.clearGroups();
      geo.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld));
      const list = buckets.get(mat) ?? [];
      list.push(geo);
      buckets.set(mat, list);
      if (!m.geometry.userData["shared"]) m.geometry.dispose();
    }
  });
  for (const [mat, geos] of buckets) {
    const merged = mergeGeometries(geos, false);
    geos.forEach((gg) => gg.dispose());
    if (merged) out.add(mesh(merged, mat, `merged:${mat.name}`));
  }
  for (const k of keep) {
    // preserve transform relative to source
    const mtx = new THREE.Matrix4().multiplyMatrices(inv, k.matrixWorld);
    k.removeFromParent();
    mtx.decompose(k.position, k.quaternion, k.scale);
    out.add(k);
  }
  return out;
}
