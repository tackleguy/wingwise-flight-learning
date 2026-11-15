/**
 * Imperative three.js runtime behind <CockpitViewer>. Browser-only: imported dynamically from an
 * effect so server rendering never touches WebGL.
 *
 * Layers (bottom → top) inside the host element:
 *   1. CSS3DRenderer layer — live React avionics (DOM) placed at each InstrumentScreen pose.
 *   2. WebGL canvas (alpha, pointer-events: none) — the cockpit. A "punch-through" mesh at each
 *      screen pose writes alpha 0, so the DOM instrument shows through while nearer geometry
 *      (yokes, levers) still occludes it.
 *   3. Label overlay (pointer-events: none).
 * Pointer input is handled on the host: hotspot raycasts, lever drags, head-look / orbit.
 */
import * as THREE from "three";
import { CSS3DObject, CSS3DRenderer } from "three/examples/jsm/renderers/CSS3DRenderer.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import type { SimEngine } from "@/sim/engine";
import type { SimSnapshot } from "@/sim/types";
import type {
  CockpitBuild,
  CockpitDefinition,
  ControlBinding,
  Hotspot,
  InstrumentScreen,
} from "./types";
import { makeCanvas } from "./parts";

export type ViewMode = "seat" | "inspect";
export interface Look {
  yaw: number;
  pitch: number;
}

export interface RuntimeCallbacks {
  onSelect?: ((h: Hotspot | null) => void) | undefined;
  onHover?: ((h: Hotspot | null) => void) | undefined;
  onLookChange?: ((l: Look) => void) | undefined;
}

export interface RuntimeOptions extends RuntimeCallbacks {
  host: HTMLDivElement;
  definition: CockpitDefinition;
  engine: SimEngine;
  transparent: boolean;
  view: ViewMode;
  interactive: boolean;
  showLabels: boolean;
  look?: Look | undefined;
}

export interface ScreenMount {
  screen: InstrumentScreen;
  /** Element the React portal renders into (inside the scaled wrapper). */
  el: HTMLDivElement;
}

const ROUND = new Set(["asi", "ai", "alt", "tc", "hi", "vsi", "vor1", "vor2", "hsi", "adf", "ils"]);
const INTERACTIVE_SELECTOR =
  'button, input, select, textarea, a, [role="slider"], [role="button"], [role="spinbutton"], [tabindex]';
const HOVER_COLOR = new THREE.Color(0x38bdf8);
const SELECT_COLOR = new THREE.Color(0x60a5fa);
const PULSE_COLOR = new THREE.Color(0xf59e0b);
const STYLE_ID = "cockpit3d-styles";

function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const st = document.createElement("style");
  st.id = STYLE_ID;
  st.textContent = `
[data-cockpit-screen]{overflow:hidden;backface-visibility:hidden;-webkit-backface-visibility:hidden;contain:layout paint}
[data-cockpit-screen] > [data-cockpit-inner]{position:absolute;left:50%;top:50%;transform-origin:50% 50%}
[data-cockpit-screen][data-bare] [data-cockpit-inner] > *{border:0!important;border-radius:0!important;box-shadow:none!important;margin:0!important}
[data-cockpit-screen][data-bare] figcaption{display:none!important}
[data-cockpit-screen][data-bare] figure > div{padding:0!important;background:transparent!important;box-shadow:none!important;border-radius:9999px!important}
[data-cockpit-label]{position:absolute;left:0;top:0;pointer-events:none;white-space:nowrap;font:600 11px/1.2 Inter,system-ui,sans-serif;color:#f8fafc;background:rgba(10,12,16,.82);border:1px solid rgba(148,163,184,.35);border-radius:6px;padding:3px 7px;transform:translate(-50%,-140%);will-change:transform;opacity:0;transition:opacity .15s}
[data-cockpit-label][data-on]{opacity:1}
[data-cockpit-label][data-sel]{border-color:#60a5fa;color:#fff}
`;
  document.head.appendChild(st);
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const DEG = Math.PI / 180;

type HlState = "none" | "pulse" | "selected" | "hover";

interface HotspotRec {
  h: Hotspot;
  meshes: THREE.Mesh[];
  state: HlState;
  center: THREE.Vector3;
  label: HTMLDivElement | null;
  applyState: ((v: boolean) => void) | null;
  base: { position: THREE.Vector3; quaternion: THREE.Quaternion; rotZ: number } | null;
}

export class CockpitRuntime {
  readonly mounts: ScreenMount[] = [];
  private o: RuntimeOptions;
  private build: CockpitBuild;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private css: CSS3DRenderer;
  private orbit: OrbitControls;
  private labelLayer: HTMLDivElement;
  private cssLayer: HTMLDivElement;
  private outside: THREE.Group | null = null;
  private ground: THREE.Object3D | null = null;
  private runway: THREE.Object3D | null = null;
  private sky: THREE.Mesh | null = null;
  private sun: THREE.DirectionalLight;
  private hemi: THREE.HemisphereLight;
  private fill: THREE.PointLight;
  private recs: HotspotRec[] = [];
  private byId = new Map<string, HotspotRec>();
  private screenHotspot = new Map<THREE.Object3D, string>();
  private cssObjects: CSS3DObject[] = [];
  private punchMeshes: THREE.Mesh[] = [];
  private ownedDisposables: Array<{ dispose(): void }> = [];
  private variants: Record<Exclude<HlState, "none">, Map<THREE.Material, THREE.Material>> = {
    hover: new Map(),
    selected: new Map(),
    pulse: new Map(),
  };
  private raycaster = new THREE.Raycaster();
  private ndc = new THREE.Vector2();
  private tmpV = new THREE.Vector3();
  private tmpV2 = new THREE.Vector3();
  private raf = 0;
  private lastT = 0;
  private visible = true;
  private io: IntersectionObserver | null = null;
  private ro: ResizeObserver | null = null;
  private reducedMotion = false;
  private look: Look = { yaw: 0, pitch: 0 };
  private baseYaw = 0;
  private basePitch = 0;
  private fov = 60;
  private width = 1;
  private height = 1;
  private hoverDirty = false;
  private pointer = { x: 0, y: 0, inside: false };
  private hovered: HotspotRec | null = null;
  private selectedId: string | null = null;
  private highlightIds = new Set<string>();
  private initialHeading: number | null = null;
  private lastEnvT = -1;
  private gesture: null | {
    kind: "look" | "lever" | "orbit" | "dom";
    id: number;
    x0: number;
    y0: number;
    moved: boolean;
    rec?: HotspotRec;
    startVal?: number;
    dir?: { x: number; y: number };
    look0?: Look;
  } = null;
  private pointers = new Map<number, { x: number; y: number }>();
  private pinch0: { d: number; fov: number } | null = null;
  private disposed = false;

  constructor(o: RuntimeOptions) {
    this.o = o;
    injectStyles();
    this.reducedMotion =
      typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    const host = o.host;
    if (getComputedStyle(host).position === "static") host.style.position = "relative";
    host.style.overflow = "hidden";
    host.style.touchAction = "none";
    host.style.userSelect = "none";

    // ---- renderers
    this.css = new CSS3DRenderer();
    this.cssLayer = this.css.domElement as HTMLDivElement;
    Object.assign(this.cssLayer.style, { position: "absolute", inset: "0", zIndex: "0" });
    host.appendChild(this.cssLayer);

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.setClearColor(0x000000, 0);
    const canvas = this.renderer.domElement;
    Object.assign(canvas.style, {
      position: "absolute",
      inset: "0",
      zIndex: "1",
      pointerEvents: "none",
      display: "block",
    });
    host.appendChild(canvas);

    this.labelLayer = document.createElement("div");
    Object.assign(this.labelLayer.style, {
      position: "absolute",
      inset: "0",
      zIndex: "2",
      pointerEvents: "none",
      overflow: "hidden",
    });
    host.appendChild(this.labelLayer);

    // ---- camera & controls
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.01, 60000);
    this.orbit = new OrbitControls(this.camera, host);
    this.orbit.enableDamping = true;
    this.orbit.dampingFactor = 0.12;
    this.orbit.minDistance = 0.12;
    this.orbit.maxDistance = 3.5;
    this.orbit.zoomSpeed = 0.7;
    this.orbit.rotateSpeed = 0.6;
    this.orbit.enabled = false;

    // ---- lighting
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    this.ownedDisposables.push(envTex);
    this.scene.environment = envTex;
    this.scene.environmentIntensity = 0.42;
    this.hemi = new THREE.HemisphereLight(0xcfe6ff, 0x4a3f33, 0.9);
    this.sun = new THREE.DirectionalLight(0xfff1dc, 2.1);
    this.sun.position.set(-3, 6, -5);
    this.fill = new THREE.PointLight(0xfff4e6, 0.8, 3, 1.6);
    this.fill.position.set(0.25, 0.35, 0.35);
    const ambient = new THREE.AmbientLight(0xffffff, 0.12);
    this.scene.add(this.hemi, this.sun, this.fill, ambient);

    if (!o.transparent) this.buildOutside();

    // ---- cockpit
    this.build = o.definition.build();
    this.scene.add(this.build.root);
    this.build.root.updateMatrixWorld(true);
    this.setupScreens();
    this.setupHotspots();

    // ---- view
    const eye = this.build.eye;
    const d = this.tmpV.copy(eye.target).sub(eye.position);
    this.baseYaw = Math.atan2(d.x, -d.z) / DEG;
    this.basePitch = Math.atan2(d.y, Math.hypot(d.x, d.z)) / DEG;
    if (o.look) this.look = { ...o.look };
    this.resize();
    this.applyView(o.view, true);

    // ---- events
    host.addEventListener("pointerdown", this.onPointerDown, { capture: true });
    host.addEventListener("pointermove", this.onPointerMove);
    host.addEventListener("pointerup", this.onPointerUp);
    host.addEventListener("pointercancel", this.onPointerUp);
    host.addEventListener("pointerleave", this.onPointerLeave);
    host.addEventListener("wheel", this.onWheel, { passive: false, capture: true });
    host.addEventListener("contextmenu", this.onContextMenu);

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    this.io = new IntersectionObserver((entries) => {
      for (const e of entries) this.visible = e.isIntersecting;
    });
    this.io.observe(host);
    this.resize();
    this.lastT = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  // ======================================================================== setup

  private buildOutside() {
    const out = new THREE.Group();
    out.name = "outside";
    // sky dome (vertex-coloured gradient)
    const skyGeo = new THREE.SphereGeometry(30000, 32, 16);
    const cols: number[] = [];
    const pos = skyGeo.attributes["position"] as THREE.BufferAttribute;
    const top = new THREE.Color(0x3d78c6);
    const hor = new THREE.Color(0xc9dcef);
    const below = new THREE.Color(0x8d9aa6);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i) / 30000;
      if (y >= 0) c.copy(hor).lerp(top, Math.pow(y, 0.55));
      else c.copy(hor).lerp(below, Math.min(1, -y * 4));
      cols.push(c.r, c.g, c.b);
    }
    skyGeo.setAttribute("color", new THREE.Float32BufferAttribute(cols, 3));
    const sky = new THREE.Mesh(
      skyGeo,
      new THREE.MeshBasicMaterial({
        vertexColors: true,
        side: THREE.BackSide,
        fog: false,
        depthWrite: false,
      }),
    );
    sky.renderOrder = -10;
    this.sky = sky;
    out.add(sky);
    this.scene.background = new THREE.Color(0xc9dcef);
    this.scene.fog = new THREE.Fog(0xc9dcef, 2500, 26000);

    const world = new THREE.Group();
    world.name = "world";
    // grass ground
    const { canvas, ctx } = makeCanvas(256, 256);
    const img = ctx.createImageData(256, 256);
    let seed = 99;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < img.data.length; i += 4) {
      const v = rnd();
      img.data[i] = 70 + v * 30;
      img.data[i + 1] = 98 + v * 40;
      img.data[i + 2] = 52 + v * 18;
      img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    const grassTex = new THREE.CanvasTexture(canvas);
    grassTex.colorSpace = THREE.SRGBColorSpace;
    grassTex.wrapS = grassTex.wrapT = THREE.RepeatWrapping;
    grassTex.repeat.set(4000, 4000);
    grassTex.anisotropy = 8;
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(26000, 48).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ map: grassTex, roughness: 1, color: 0xb8c4a8 }),
    );
    world.add(ground);
    // runway with markings
    const rw = makeCanvas(128, 1024);
    const r = rw.ctx;
    r.fillStyle = "#3b3d40";
    r.fillRect(0, 0, 128, 1024);
    r.fillStyle = "#e9e9e4";
    r.fillRect(4, 0, 3, 1024);
    r.fillRect(121, 0, 3, 1024);
    for (let y = 0; y < 1024; y += 128) r.fillRect(62, y, 4, 64);
    const rwTex = new THREE.CanvasTexture(rw.canvas);
    rwTex.colorSpace = THREE.SRGBColorSpace;
    rwTex.wrapT = THREE.RepeatWrapping;
    rwTex.repeat.set(1, 40);
    rwTex.anisotropy = 8;
    const runway = new THREE.Mesh(
      new THREE.PlaneGeometry(30, 2400).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ map: rwTex, roughness: 0.9 }),
    );
    runway.position.set(0.3, 0.03, -1150);
    world.add(runway);
    this.runway = runway;
    this.ground = world;
    out.add(world);
    this.outside = out;
    this.scene.add(out);
    for (const m of [
      skyGeo,
      sky.material,
      ground.geometry,
      ground.material,
      grassTex,
      runway.geometry,
      runway.material,
      rwTex,
    ])
      this.ownedDisposables.push(m as { dispose(): void });
  }

  private setupScreens() {
    const root = this.build.root;
    const punchMat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      opacity: 0,
      transparent: false,
      blending: THREE.NoBlending,
    });
    this.ownedDisposables.push(punchMat);
    for (const sc of this.build.screens) {
      const parent = sc.parent ?? root;
      const pxW = Math.round(sc.pixelWidth);
      const pxH = Math.round((sc.pixelWidth * sc.heightM) / sc.widthM);
      const shape = sc.shape ?? (ROUND.has(sc.component) ? "circle" : "rect");
      const el = document.createElement("div");
      el.dataset["cockpitScreen"] = sc.id;
      if (sc.bare !== false) el.dataset["bare"] = "";
      el.style.width = `${pxW}px`;
      el.style.height = `${pxH}px`;
      el.style.background = sc.options?.background ?? "#050607";
      if (shape === "circle") el.style.borderRadius = "50%";
      const inner = document.createElement("div");
      inner.dataset["cockpitInner"] = "";
      inner.style.width = `${pxW}px`;
      inner.style.transform = "translate(-50%,-50%)";
      el.appendChild(inner);
      if ((sc.fit ?? "contain") === "contain") {
        const ro = new ResizeObserver(() => {
          const h = inner.offsetHeight;
          const s = h > pxH ? pxH / h : 1;
          inner.style.transform = `translate(-50%,-50%) scale(${s})`;
        });
        ro.observe(inner);
        this.ownedDisposables.push({ dispose: () => ro.disconnect() });
      }
      const obj = new CSS3DObject(el);
      obj.position.copy(sc.position);
      obj.rotation.copy(sc.rotation);
      const s = sc.widthM / pxW;
      obj.scale.set(s, s, s);
      parent.add(obj);
      this.cssObjects.push(obj);

      const geo =
        shape === "circle"
          ? new THREE.CircleGeometry(Math.min(sc.widthM, sc.heightM) / 2, 48)
          : new THREE.PlaneGeometry(sc.widthM, sc.heightM);
      this.ownedDisposables.push(geo);
      const punch = new THREE.Mesh(geo, punchMat);
      punch.name = `punch:${sc.id}`;
      punch.position.copy(sc.position);
      punch.rotation.copy(sc.rotation);
      punch.userData["punch"] = true;
      parent.add(punch);
      this.punchMeshes.push(punch);
      if (sc.hotspotId) this.screenHotspot.set(punch, sc.hotspotId);
      this.mounts.push({ screen: sc, el: inner });
    }
  }

  private setupHotspots() {
    for (const h of this.build.hotspots) {
      const meshes: THREE.Mesh[] = [];
      let applyState: ((v: boolean) => void) | null = null;
      h.object.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh && !m.userData["hitProxy"] && !m.userData["punch"]) meshes.push(m);
        const fn = o.userData["applyState"];
        if (!applyState && typeof fn === "function") applyState = fn as (v: boolean) => void;
      });
      h.object.userData["hotspotId"] = h.id;
      const box = new THREE.Box3().setFromObject(h.object);
      const center = box.isEmpty()
        ? h.object.getWorldPosition(new THREE.Vector3())
        : box.getCenter(new THREE.Vector3());
      let base: HotspotRec["base"] = null;
      const c = h.control;
      if (c && (c.kind === "lever" || c.kind === "rotary")) {
        base = {
          position: c.moving.position.clone(),
          quaternion: c.moving.quaternion.clone(),
          rotZ: c.moving.rotation.z,
        };
      }
      const rec: HotspotRec = { h, meshes, state: "none", center, label: null, applyState, base };
      this.recs.push(rec);
      this.byId.set(h.id, rec);
    }
  }

  // ======================================================================== public API

  setCallbacks(cb: RuntimeCallbacks) {
    this.o.onSelect = cb.onSelect;
    this.o.onHover = cb.onHover;
    this.o.onLookChange = cb.onLookChange;
  }

  setInteractive(on: boolean) {
    this.o.interactive = on;
  }

  setShowLabels(on: boolean) {
    this.o.showLabels = on;
  }

  setSelected(id: string | null) {
    this.selectedId = id;
  }

  setHighlights(ids: string[]) {
    this.highlightIds = new Set(ids);
  }

  setLook(l: Look) {
    if (this.gesture?.kind === "look") return;
    this.look = { yaw: clamp(l.yaw, -150, 150), pitch: clamp(l.pitch, -60, 40) };
  }

  setView(v: ViewMode) {
    if (v !== this.o.view) this.applyView(v, false);
  }

  getHotspot(id: string): Hotspot | undefined {
    return this.byId.get(id)?.h;
  }

  /** Project a hotspot's centre to host pixel coordinates (null if behind the camera). */
  projectHotspot(id: string): { x: number; y: number } | null {
    const r = this.byId.get(id);
    if (!r) return null;
    const p = this.tmpV.copy(r.center).project(this.camera);
    if (p.z > 1) return null;
    return { x: (p.x * 0.5 + 0.5) * this.width, y: (-p.y * 0.5 + 0.5) * this.height };
  }

  /** Point the seat view (or orbit) at a hotspot. */
  focusHotspot(id: string) {
    const r = this.byId.get(id);
    if (!r) return;
    if (this.o.view === "inspect") {
      // Look at it from the pilot's side so the camera stays inside the cabin.
      const t = r.center;
      const dir = this.tmpV2.copy(this.build.eye.position).sub(t);
      if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1);
      this.orbit.target.copy(t);
      this.camera.position.copy(t).add(dir.normalize().multiplyScalar(0.38));
      return;
    }
    const d = this.tmpV.copy(r.center).sub(this.build.eye.position);
    const yaw = Math.atan2(d.x, -d.z) / DEG - this.baseYaw;
    const pitch = Math.atan2(d.y, Math.hypot(d.x, d.z)) / DEG - this.basePitch;
    this.look = { yaw: clamp(yaw, -150, 150), pitch: clamp(pitch, -60, 40) };
    this.o.onLookChange?.(this.look);
  }

  // ======================================================================== view

  private applyView(v: ViewMode, initial: boolean) {
    this.o.view = v;
    const inspect = v === "inspect";
    this.orbit.enabled = inspect;
    this.build.root.traverse((o) => {
      if (o.userData["hideInInspect"]) o.visible = !inspect;
    });
    if (inspect) {
      const ip = this.build.inspect;
      const target = ip?.target ?? this.build.eye.target;
      const pos = ip?.position ?? target.clone().add(new THREE.Vector3(0, 0.08, 0.8));
      // Portrait screens: pull back so the panel width still fits.
      const aspect = this.width / Math.max(1, this.height);
      const k = aspect < 1 ? Math.min(1.35, 0.8 / aspect) : 1;
      this.orbit.target.copy(target);
      this.camera.position.copy(pos).sub(target).multiplyScalar(Math.max(1, k)).add(target);
      this.camera.fov = aspect < 1 ? 68 : 50;
      this.camera.updateProjectionMatrix();
      this.orbit.update();
    } else {
      this.camera.position.copy(this.build.eye.position);
      if (initial) this.fov = this.width / Math.max(1, this.height) < 0.9 ? 75 : 60;
      this.applySeatCamera();
    }
    this.hoverDirty = true;
  }

  private applySeatCamera() {
    const yaw = (this.baseYaw + this.look.yaw) * DEG;
    const pitch = (this.basePitch + this.look.pitch) * DEG;
    this.camera.position.copy(this.build.eye.position);
    this.camera.rotation.set(pitch, -yaw, 0, "YXZ");
    if (this.camera.fov !== this.fov) {
      this.camera.fov = this.fov;
      this.camera.updateProjectionMatrix();
    }
  }

  private resize() {
    const w = Math.max(1, this.o.host.clientWidth);
    const h = Math.max(1, this.o.host.clientHeight);
    if (w === this.width && h === this.height) return;
    this.width = w;
    this.height = h;
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = `${w}px`;
    this.renderer.domElement.style.height = `${h}px`;
    this.css.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // ======================================================================== input

  private setNdc(clientX: number, clientY: number) {
    const r = this.o.host.getBoundingClientRect();
    this.ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
  }

  private isShown(o: THREE.Object3D) {
    let p: THREE.Object3D | null = o.userData["hitProxy"] ? o.parent : o;
    while (p) {
      if (!p.visible) return false;
      p = p.parent;
    }
    return true;
  }

  private recFor(o: THREE.Object3D): HotspotRec | null {
    let p: THREE.Object3D | null = o;
    while (p) {
      const id = p.userData["hotspotId"];
      if (typeof id === "string") return this.byId.get(id) ?? null;
      const sid = this.screenHotspot.get(p);
      if (sid) return this.byId.get(sid) ?? null;
      p = p.parent;
    }
    return null;
  }

  private pick(clientX: number, clientY: number): HotspotRec | null {
    this.setNdc(clientX, clientY);
    this.camera.updateMatrixWorld();
    this.raycaster.setFromCamera(this.ndc, this.camera);
    const hits = this.raycaster.intersectObject(this.build.root, true);
    for (const hit of hits) {
      const o = hit.object;
      if (!this.isShown(o)) continue;
      const rec = this.recFor(o);
      if (rec) return rec;
      const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
      const mat = Array.isArray(m) ? m[0] : m;
      if (o.userData["punch"]) return null;
      if (mat && mat.transparent && mat.opacity < 0.35) continue; // window glass
      if (o.userData["hitProxy"]) continue;
      return null; // blocked by non-interactive geometry
    }
    return null;
  }

  private screenFromTarget(t: EventTarget | null): { sid: string; interactive: boolean } | null {
    if (!(t instanceof Element)) return null;
    const scr = t.closest<HTMLElement>("[data-cockpit-screen]");
    if (!scr) return null;
    const inter = t.closest(INTERACTIVE_SELECTOR);
    return {
      sid: scr.dataset["cockpitScreen"] ?? "",
      interactive: !!inter && scr.contains(inter),
    };
  }

  private onContextMenu = (e: MouseEvent) => {
    if (this.pick(e.clientX, e.clientY)) e.preventDefault();
  };

  private onPointerDown = (e: PointerEvent) => {
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pointers.size === 2 && this.o.view === "seat") {
      const [a, b] = [...this.pointers.values()];
      if (a && b) this.pinch0 = { d: Math.hypot(a.x - b.x, a.y - b.y), fov: this.fov };
      if (this.gesture?.kind === "look") this.gesture = null;
      return;
    }
    const scr = this.screenFromTarget(e.target);
    if (scr?.interactive) {
      // Let the DOM instrument (knob/button) handle it; keep the camera still.
      this.orbit.enabled = false;
      this.gesture = { kind: "dom", id: e.pointerId, x0: e.clientX, y0: e.clientY, moved: false };
      return;
    }
    const rec = this.o.interactive && e.button === 0 ? this.pick(e.clientX, e.clientY) : null;
    const c = rec?.h.control;
    if (rec && c?.kind === "lever") {
      this.orbit.enabled = false;
      this.gesture = {
        kind: "lever",
        id: e.pointerId,
        x0: e.clientX,
        y0: e.clientY,
        moved: false,
        rec,
        startVal: c.get(this.o.engine.getSnapshot()),
        dir: this.leverScreenDir(c),
      };
      this.o.host.setPointerCapture?.(e.pointerId);
      this.o.host.style.cursor = "grabbing";
      e.preventDefault();
      return;
    }
    if (this.o.view === "inspect") {
      this.orbit.enabled = true;
      this.gesture = { kind: "orbit", id: e.pointerId, x0: e.clientX, y0: e.clientY, moved: false };
      return;
    }
    this.gesture = {
      kind: "look",
      id: e.pointerId,
      x0: e.clientX,
      y0: e.clientY,
      moved: false,
      look0: { ...this.look },
    };
    try {
      this.o.host.setPointerCapture?.(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  private leverScreenDir(c: Extract<ControlBinding, { kind: "lever" }>) {
    const m = c.moving;
    m.updateMatrixWorld(true);
    const p0 = m.getWorldPosition(this.tmpV);
    const axisW = this.tmpV2.copy(c.axis).normalize();
    if (m.parent) axisW.transformDirection(m.parent.matrixWorld);
    const p1 = axisW.multiplyScalar(c.travel).add(p0);
    const a = p0.clone().project(this.camera);
    const b = p1.project(this.camera);
    const dx = ((b.x - a.x) / 2) * this.width;
    const dy = (-(b.y - a.y) / 2) * this.height;
    if (Math.hypot(dx, dy) < 30) return { x: 0, y: -140 }; // seen end-on: drag up = increase
    return { x: dx, y: dy };
  }

  private onPointerMove = (e: PointerEvent) => {
    const r = this.o.host.getBoundingClientRect();
    this.pointer = { x: e.clientX, y: e.clientY, inside: true };
    if (this.pointers.has(e.pointerId))
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pinch0 && this.pointers.size >= 2) {
      const [a, b] = [...this.pointers.values()];
      if (a && b) {
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        this.fov = clamp((this.pinch0.fov * this.pinch0.d) / Math.max(1, d), 30, 75);
      }
      return;
    }
    const g = this.gesture;
    if (g && g.id === e.pointerId) {
      const dx = e.clientX - g.x0;
      const dy = e.clientY - g.y0;
      if (!g.moved && Math.hypot(dx, dy) > 5) g.moved = true;
      if (g.kind === "lever" && g.rec && g.dir) {
        const c = g.rec.h.control;
        if (c?.kind === "lever") {
          const len2 = g.dir.x * g.dir.x + g.dir.y * g.dir.y;
          let v = clamp((g.startVal ?? 0) + (dx * g.dir.x + dy * g.dir.y) / len2, 0, 1);
          if (c.detents?.length) v = nearest(c.detents, v);
          c.set(this.o.engine, v);
        }
        return;
      }
      if (g.kind === "look" && g.look0) {
        const degPerPx = this.fov / Math.max(200, this.height);
        this.look = {
          yaw: clamp(g.look0.yaw - dx * degPerPx, -150, 150),
          pitch: clamp(g.look0.pitch + dy * degPerPx, -60, 40),
        };
        this.o.onLookChange?.(this.look);
        return;
      }
    }
    if (e.clientX >= r.left && e.clientY >= r.top) this.hoverDirty = true;
  };

  private onPointerUp = (e: PointerEvent) => {
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) this.pinch0 = null;
    const g = this.gesture;
    if (!g || g.id !== e.pointerId) return;
    this.gesture = null;
    try {
      this.o.host.releasePointerCapture?.(e.pointerId);
    } catch {
      /* ignore */
    }
    if (this.o.view === "inspect") this.orbit.enabled = true;
    this.hoverDirty = true;
    if (g.kind === "dom") return;
    if (g.moved) return;
    // ---- click
    const scr = this.screenFromTarget(e.target);
    let rec = this.pick(e.clientX, e.clientY);
    if (!rec && scr) {
      const sc = this.mounts.find((m) => m.screen.id === scr.sid)?.screen;
      if (sc?.hotspotId) rec = this.byId.get(sc.hotspotId) ?? null;
    }
    if (rec && this.o.interactive) this.operate(rec, e.shiftKey || e.button === 2 ? -1 : 1);
    this.o.onSelect?.(rec ? rec.h : null);
  };

  private onPointerLeave = () => {
    this.pointer.inside = false;
    this.hoverDirty = true;
  };

  private onWheel = (e: WheelEvent) => {
    const scr = this.screenFromTarget(e.target);
    if (scr?.interactive) {
      this.orbit.enableZoom = false;
      return; // knob on a DOM instrument
    }
    const rec = this.o.interactive ? this.pick(e.clientX, e.clientY) : null;
    const dir: 1 | -1 = e.deltaY < 0 ? 1 : -1;
    if (rec?.h.control) {
      const c = rec.h.control;
      if (c.kind === "knob" || c.kind === "rotary" || c.kind === "lever") {
        e.preventDefault();
        e.stopPropagation();
        this.orbit.enableZoom = false;
        if (c.kind === "knob") c.turn(this.o.engine, dir);
        else if (c.kind === "rotary") {
          const i = clamp(c.get(this.o.engine.getSnapshot()) + dir, 0, c.positions.length - 1);
          c.set(this.o.engine, i);
        } else {
          let v = clamp(c.get(this.o.engine.getSnapshot()) + dir * 0.05, 0, 1);
          if (c.detents?.length) {
            const cur = nearest(c.detents, c.get(this.o.engine.getSnapshot()));
            const i = c.detents.indexOf(cur) + dir;
            v = c.detents[clamp(i, 0, c.detents.length - 1)] ?? v;
          }
          c.set(this.o.engine, v);
        }
        return;
      }
    }
    this.orbit.enableZoom = true;
    if (this.o.view === "seat") {
      e.preventDefault();
      this.fov = clamp(this.fov + (e.deltaY > 0 ? 3 : -3), 30, 75);
    } else {
      e.preventDefault();
    }
  };

  private operate(rec: HotspotRec, dir: 1 | -1) {
    const c = rec.h.control;
    if (!c) return;
    const e = this.o.engine;
    const s = e.getSnapshot();
    switch (c.kind) {
      case "toggle":
        c.set(e, !c.get(s));
        break;
      case "rotary": {
        const n = c.positions.length;
        const i = c.get(s);
        c.set(e, dir > 0 ? (i + 1) % n : (i - 1 + n) % n);
        break;
      }
      case "button":
        c.press(e);
        break;
      case "knob":
        c.turn(e, dir);
        break;
      case "lever":
        break;
    }
  }

  // ======================================================================== frame

  private frame = (t: number) => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.frame);
    const dt = Math.min(0.1, Math.max(0, (t - this.lastT) / 1000));
    this.lastT = t;
    if (!this.visible || document.hidden) return;
    const s = this.o.engine.getSnapshot();
    try {
      this.build.animate?.(s, dt);
    } catch (err) {
      console.error("[cockpit3d] animate failed", err);
    }
    this.updateBindings(s);
    this.updateOutside(s);
    if (this.o.view === "seat") this.applySeatCamera();
    else this.orbit.update();
    if (this.hoverDirty) {
      this.hoverDirty = false;
      this.updateHover();
    }
    this.updateHighlights(t);
    this.renderer.render(this.scene, this.camera);
    this.css.render(this.scene, this.camera);
    this.updateLabels();
  };

  private updateBindings(s: SimSnapshot) {
    for (const r of this.recs) {
      const c = r.h.control;
      if (!c) continue;
      if (c.kind === "toggle") {
        r.applyState?.(c.get(s));
      } else if (c.kind === "lever" && r.base) {
        const v = clamp(c.get(s), 0, 1);
        if (c.arc) {
          c.moving.quaternion.copy(r.base.quaternion);
          c.moving.rotateOnAxis(c.arc.axis, v * c.arc.angle);
        } else {
          c.moving.position.copy(r.base.position).addScaledVector(c.axis, v * c.travel);
        }
      } else if (c.kind === "rotary" && r.base) {
        c.moving.rotation.z = r.base.rotZ - c.get(s) * c.step;
      }
    }
  }

  private updateOutside(s: SimSnapshot) {
    if (!this.outside || !this.ground) return;
    const a = s.aircraft;
    if (this.initialHeading === null) this.initialHeading = a.heading;
    this.outside.rotation.set(
      -a.pitch * DEG,
      (a.heading - this.initialHeading) * DEG,
      a.bank * DEG,
      "ZXY",
    );
    const eyeH = this.build.eyeHeightM ?? 1.4;
    this.ground.position.y = -(eyeH + Math.max(0, a.aglFt) * 0.3048);
    if (this.runway) this.runway.visible = a.onGround || a.aglFt < 150;
    // time of day (cheap; at most once per sim-second)
    const tod = s.weather.timeOfDay;
    if (Math.abs(tod - this.lastEnvT) > 0.02) {
      this.lastEnvT = tod;
      const day = clamp(Math.sin(((tod - 6) / 12) * Math.PI) * 1.6 + 0.25, 0.08, 1);
      this.sun.intensity = 2.1 * day;
      this.hemi.intensity = 0.25 + 0.65 * day;
      this.scene.environmentIntensity = 0.12 + 0.3 * day;
      this.fill.intensity = 0.8 + (1 - day) * 0.6;
      if (this.sky)
        (this.sky.material as THREE.MeshBasicMaterial).color.setScalar(0.12 + 0.88 * day);
      const bg = this.scene.background;
      if (bg instanceof THREE.Color)
        bg.setRGB(0.79 * day, 0.86 * day, 0.94 * day, THREE.SRGBColorSpace);
      if (this.scene.fog)
        this.scene.fog.color.setRGB(0.79 * day, 0.86 * day, 0.94 * day, THREE.SRGBColorSpace);
    }
  }

  private updateHover() {
    let rec: HotspotRec | null = null;
    if (this.pointer.inside && !this.gesture) {
      const el = document.elementFromPoint(this.pointer.x, this.pointer.y);
      const scr = this.screenFromTarget(el);
      if (!scr?.interactive) rec = this.pick(this.pointer.x, this.pointer.y);
      if (!rec && scr) {
        const sc = this.mounts.find((m) => m.screen.id === scr.sid)?.screen;
        if (sc?.hotspotId) rec = this.byId.get(sc.hotspotId) ?? null;
      }
    }
    if (rec !== this.hovered) {
      this.hovered = rec;
      this.o.onHover?.(rec ? rec.h : null);
    }
    if (!this.gesture) {
      const c = rec?.h.control;
      this.o.host.style.cursor =
        rec && this.o.interactive && c?.kind === "lever"
          ? "grab"
          : rec
            ? "pointer"
            : this.o.view === "seat"
              ? "grab"
              : "default";
    }
  }

  private variant(state: Exclude<HlState, "none">, m: THREE.Material): THREE.Material {
    const map = this.variants[state];
    let v = map.get(m);
    if (!v) {
      v = m.clone();
      const color =
        state === "hover" ? HOVER_COLOR : state === "selected" ? SELECT_COLOR : PULSE_COLOR;
      const sm = v as THREE.MeshStandardMaterial;
      if (sm.emissive) {
        sm.emissive = color.clone();
        sm.emissiveIntensity = state === "hover" ? 0.3 : state === "selected" ? 0.38 : 0.3;
      } else if ((v as THREE.MeshBasicMaterial).color) {
        (v as THREE.MeshBasicMaterial).color.lerp(color, 0.35);
      }
      map.set(m, v);
    }
    return v;
  }

  private updateHighlights(t: number) {
    const pulseI = this.reducedMotion ? 0.3 : 0.12 + 0.36 * (0.5 + 0.5 * Math.sin(t / 220));
    for (const v of this.variants.pulse.values()) {
      const sm = v as THREE.MeshStandardMaterial;
      if (sm.emissive) sm.emissiveIntensity = pulseI;
    }
    for (const r of this.recs) {
      const id = r.h.id;
      const want: HlState =
        this.hovered === r
          ? "hover"
          : this.selectedId === id
            ? "selected"
            : this.highlightIds.has(id)
              ? "pulse"
              : "none";
      if (want === r.state) continue;
      for (const m of r.meshes) {
        const orig =
          (m.userData["origMat"] as THREE.Material | THREE.Material[] | undefined) ?? m.material;
        if (!m.userData["origMat"]) m.userData["origMat"] = orig;
        if (want === "none") m.material = orig;
        else if (Array.isArray(orig)) m.material = orig.map((x) => this.variant(want, x));
        else m.material = this.variant(want, orig);
      }
      r.state = want;
    }
  }

  private updateLabels() {
    for (const r of this.recs) {
      const on =
        this.o.showLabels ||
        this.hovered === r ||
        this.selectedId === r.h.id ||
        this.highlightIds.has(r.h.id);
      if (!on && !r.label) continue;
      if (!r.label) {
        const el = document.createElement("div");
        el.dataset["cockpitLabel"] = r.h.id;
        el.textContent = r.h.label;
        this.labelLayer.appendChild(el);
        r.label = el;
      }
      const el = r.label;
      const p = this.tmpV.copy(r.center).project(this.camera);
      const visible = on && p.z < 1 && Math.abs(p.x) < 1.05 && Math.abs(p.y) < 1.05;
      if (visible) {
        const x = (p.x * 0.5 + 0.5) * this.width;
        const y = (-p.y * 0.5 + 0.5) * this.height;
        el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%,-140%)`;
        el.toggleAttribute("data-on", true);
      } else el.toggleAttribute("data-on", false);
      el.toggleAttribute("data-sel", this.selectedId === r.h.id);
    }
  }

  // ======================================================================== dispose

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    const host = this.o.host;
    host.removeEventListener("pointerdown", this.onPointerDown, { capture: true });
    host.removeEventListener("pointermove", this.onPointerMove);
    host.removeEventListener("pointerup", this.onPointerUp);
    host.removeEventListener("pointercancel", this.onPointerUp);
    host.removeEventListener("pointerleave", this.onPointerLeave);
    host.removeEventListener("wheel", this.onWheel, { capture: true });
    host.removeEventListener("contextmenu", this.onContextMenu);
    this.ro?.disconnect();
    this.io?.disconnect();
    this.orbit.dispose();
    try {
      this.build.dispose?.();
    } catch (err) {
      console.error("[cockpit3d] dispose failed", err);
    }
    // restore original materials so variants can be disposed safely
    for (const r of this.recs) {
      for (const m of r.meshes) {
        const orig = m.userData["origMat"] as THREE.Material | THREE.Material[] | undefined;
        if (orig) m.material = orig;
      }
      r.label?.remove();
    }
    for (const map of Object.values(this.variants)) for (const v of map.values()) v.dispose();
    for (const obj of this.cssObjects) {
      obj.element.remove();
      obj.removeFromParent();
    }
    disposeTree(this.build.root);
    this.scene.remove(this.build.root);
    for (const d of this.ownedDisposables) d.dispose();
    this.scene.environment = null;
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
    this.cssLayer.remove();
    this.labelLayer.remove();
    host.style.cursor = "";
  }
}

function nearest(list: number[], v: number) {
  let best = list[0] ?? v;
  for (const x of list) if (Math.abs(x - v) < Math.abs(best - v)) best = x;
  return best;
}

const TEXTURE_KEYS = [
  "map",
  "emissiveMap",
  "bumpMap",
  "normalMap",
  "roughnessMap",
  "metalnessMap",
  "alphaMap",
  "aoMap",
] as const;

/** Dispose every non-shared geometry, material and texture under `root`. */
export function disposeTree(root: THREE.Object3D) {
  const seen = new Set<unknown>();
  const disposeMat = (m: THREE.Material) => {
    if (seen.has(m) || m.userData["shared"]) return;
    seen.add(m);
    const rec = m as unknown as Record<string, unknown>;
    for (const k of TEXTURE_KEYS) {
      const t = rec[k];
      if (t instanceof THREE.Texture && !t.userData["shared"] && !seen.has(t)) {
        seen.add(t);
        t.dispose();
      }
    }
    m.dispose();
  };
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh && !(o as THREE.Points).isPoints && !(o as THREE.Line).isLine) return;
    const g = m.geometry;
    if (g && !seen.has(g) && !g.userData["shared"]) {
      seen.add(g);
      g.dispose();
    }
    const mat = m.material;
    if (Array.isArray(mat)) mat.forEach(disposeMat);
    else if (mat) disposeMat(mat);
    if ((o as THREE.InstancedMesh).isInstancedMesh) (o as THREE.InstancedMesh).dispose();
  });
}
