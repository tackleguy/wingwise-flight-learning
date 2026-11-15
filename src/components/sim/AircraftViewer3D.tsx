/**
 * Orbit viewer for the procedural aircraft models (studio lighting + soft ground shadow).
 *
 * SSR-safe: renders a lightweight placeholder on the server. three.js, the model builders and
 * WebGL are loaded lazily in an effect, only once the viewer scrolls into view, and rendering
 * pauses while it is off-screen. Horizontal drags orbit, vertical swipes still scroll the page on
 * touch screens, and wheel-zoom only engages after the user clicks into the viewer.
 */
import { Pause, Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type * as THREE_NS from "three";
import type { OrbitControls as OrbitControlsT } from "three/examples/jsm/controls/OrbitControls.js";

import { cn } from "@/lib/utils";

import type { AircraftModel, AircraftModelState } from "./aircraft-models";

type ThreeLib = typeof THREE_NS;
type ViewName = "34" | "side" | "top" | "front";

const VIEWS: { id: ViewName; label: string }[] = [
  { id: "34", label: "3/4" },
  { id: "side", label: "Side" },
  { id: "top", label: "Top" },
  { id: "front", label: "Front" },
];

interface Props {
  perfId: string;
  className?: string;
  autoRotate?: boolean;
}

interface ViewerApi {
  setView(v: ViewName): void;
  setDemo(on: boolean): void;
  setAutoRotate(on: boolean): void;
  dispose(): void;
}

export function AircraftViewer3D({ perfId, className, autoRotate = true }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<ViewerApi | null>(null);
  const autoRef = useRef(autoRotate);
  autoRef.current = autoRotate;
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [demo, setDemo] = useState(false);
  const [caption, setCaption] = useState<string | null>(null);
  const [view, setView] = useState<ViewName>("34");
  const [label, setLabel] = useState("");

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;
    let api: ViewerApi | null = null;
    setStatus("idle");
    setDemo(false);
    setCaption(null);
    setView("34");
    const start = async () => {
      setStatus("loading");
      try {
        const [THREE, controlsMod, envMod, models] = await Promise.all([
          import("three"),
          import("three/examples/jsm/controls/OrbitControls.js"),
          import("three/examples/jsm/environments/RoomEnvironment.js"),
          import("./aircraft-models"),
        ]);
        if (cancelled) return;
        const model = models.buildAircraftModel(perfId, {
          quality: window.matchMedia("(max-width: 640px)").matches ? "medium" : "high",
        });
        api = createViewer(host, THREE, controlsMod.OrbitControls, envMod.RoomEnvironment, model, {
          autoRotate: autoRef.current,
          onCaption: (c) => {
            if (!cancelled) setCaption(c);
          },
        });
        apiRef.current = api;
        setLabel(model.label);
        setStatus("ready");
      } catch {
        if (!cancelled) setStatus("error");
      }
    };
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          io.disconnect();
          void start();
        }
      },
      { rootMargin: "200px" },
    );
    io.observe(host);
    return () => {
      cancelled = true;
      io.disconnect();
      api?.dispose();
      apiRef.current = null;
    };
  }, [perfId]);

  useEffect(() => {
    apiRef.current?.setAutoRotate(autoRotate && !demo);
  }, [autoRotate, demo, status]);

  const pickView = (v: ViewName) => {
    setView(v);
    apiRef.current?.setView(v);
  };
  const toggleDemo = () => {
    const next = !demo;
    setDemo(next);
    apiRef.current?.setDemo(next);
    if (!next) setCaption(null);
  };

  return (
    <div
      className={cn(
        "relative isolate overflow-hidden rounded-lg border",
        "bg-[radial-gradient(ellipse_at_50%_35%,oklch(0.3_0.03_250),oklch(0.17_0.02_258)_70%)]",
        className,
      )}
    >
      <div
        ref={hostRef}
        className="absolute inset-0"
        role="img"
        aria-label={
          label ? `Interactive 3D model: ${label}. Drag sideways to rotate.` : "3D aircraft model"
        }
      />
      {status !== "ready" ? (
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-xs text-muted-foreground">
          {status === "error" ? "3D view isn't available on this device." : "Loading 3D model…"}
        </div>
      ) : null}
      {status === "ready" ? (
        <>
          <div className="absolute top-2 right-2 flex gap-0.5 rounded-md bg-background/70 p-0.5 backdrop-blur">
            {VIEWS.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => pickView(v.id)}
                aria-pressed={view === v.id}
                className={cn(
                  "rounded px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground",
                  view === v.id && "bg-muted text-foreground",
                )}
              >
                {v.label}
              </button>
            ))}
          </div>
          <div className="absolute bottom-2 left-2 flex max-w-[calc(100%-1rem)] items-center gap-2">
            <button
              type="button"
              onClick={toggleDemo}
              aria-pressed={demo}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-background/70 px-2 py-1 text-[11px] font-medium text-foreground backdrop-blur hover:bg-background/90"
            >
              {demo ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
              {demo ? "Stop" : "Move the controls"}
            </button>
            {demo && caption ? (
              <span
                className="truncate rounded-md bg-background/70 px-2 py-1 text-[11px] text-foreground backdrop-blur"
                aria-live="polite"
              >
                {caption}
              </span>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}

// -----------------------------------------------------------------------------------------------
// imperative three.js viewer
// -----------------------------------------------------------------------------------------------

interface DemoStep {
  caption: string;
  dur: number;
  apply(s: AircraftModelState, k: number): void;
}

function demoSteps(m: AircraftModel): DemoStep[] {
  const f = m.features;
  const tail = f.stabilator ? "stabilator" : "elevator";
  const steps: DemoStep[] = [
    {
      caption: "Roll right — right aileron up, left aileron down",
      dur: 2.6,
      apply: (s, k) => (s.aileron = k),
    },
    {
      caption: "Roll left — left aileron up, right aileron down",
      dur: 2.6,
      apply: (s, k) => (s.aileron = -k),
    },
    {
      caption: `Pitch up — ${tail} trailing edge rises (pull)`,
      dur: 2.6,
      apply: (s, k) => (s.elevator = k),
    },
    {
      caption: `Pitch down — ${tail} trailing edge lowers (push)`,
      dur: 2.6,
      apply: (s, k) => (s.elevator = -k),
    },
    {
      caption: "Yaw right — right pedal, rudder trailing edge right",
      dur: 2.6,
      apply: (s, k) => (s.rudder = k),
    },
    {
      caption: "Yaw left — left pedal, rudder trailing edge left",
      dur: 2.6,
      apply: (s, k) => (s.rudder = -k),
    },
  ];
  if (f.flapMaxDeg > 0) {
    steps.push({
      caption: `Flaps extend (to ${f.flapMaxDeg}°) — more lift and drag for landing`,
      dur: 3.6,
      apply: (s, k) => (s.flapsDeg = f.flapMaxDeg * k),
    });
  }
  if (f.retractableGear) {
    steps.push({
      caption: "Landing gear retracts after take-off, extends for landing",
      dur: 4.5,
      apply: (s, k) => (s.gearPosition = 1 - k),
    });
  }
  steps.push({
    caption: f.jet
      ? "Engines spool up — fans turning"
      : "Engine running — propeller turning (position, beacon and strobe lights on)",
    dur: 4,
    apply: (s, k) => {
      s.rpm = f.jet ? 22 + k * 40 : 120 + k * 900;
    },
  });
  return steps;
}

function createViewer(
  host: HTMLElement,
  THREE: ThreeLib,
  OrbitControls: typeof OrbitControlsT,
  RoomEnvironment: new () => THREE_NS.Scene,
  model: AircraftModel,
  opts: { autoRotate: boolean; onCaption: (c: string | null) => void },
): ViewerApi {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(host.clientWidth, host.clientHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setClearColor(0x000000, 0);
  const canvas = renderer.domElement;
  canvas.style.display = "block";
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  host.appendChild(canvas);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new RoomEnvironment();
  const envTex = pmrem.fromScene(envScene, 0.04).texture;
  scene.environment = envTex;
  scene.environmentIntensity = 0.55;

  const hemi = new THREE.HemisphereLight(0xdfe8ff, 0x2a3140, 0.55);
  const key = new THREE.DirectionalLight(0xffffff, 2.3);
  const fill = new THREE.DirectionalLight(0x9fb4ff, 0.55);
  scene.add(hemi, key, fill, key.target);

  // place the model: parked attitude, wheels on the ground, centred
  const g = model.group;
  g.rotation.x = (model.groundPitchDeg * Math.PI) / 180;
  scene.add(g);
  g.updateMatrixWorld(true);
  const box = meshBox(THREE, g);
  g.position.set(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);
  g.updateMatrixWorld(true);
  const bb = meshBox(THREE, g);
  const size = bb.getSize(new THREE.Vector3());
  const center = bb.getCenter(new THREE.Vector3());
  const radius = Math.max(0.5, size.length() / 2);
  g.traverse((o) => {
    const mesh = o as THREE_NS.Mesh;
    if (mesh.isMesh) {
      const m = mesh.material as THREE_NS.Material;
      if (!m.transparent) mesh.castShadow = true;
    }
  });

  key.position.set(center.x + radius * 1.2, radius * 2.2, center.z - radius * 0.9);
  key.target.position.copy(center).setY(0);
  key.castShadow = true;
  const sc = key.shadow.camera;
  sc.left = sc.bottom = -radius * 1.1;
  sc.right = sc.top = radius * 1.1;
  sc.near = 0.1;
  sc.far = radius * 6;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.02;
  key.shadow.radius = 4;
  fill.position.set(center.x - radius, radius * 0.8, center.z + radius);

  // ground: shadow catcher + soft contact gradient
  const groundR = Math.max(size.x, size.z) * 0.85;
  const groundGeo = new THREE.CircleGeometry(groundR, 64).rotateX(-Math.PI / 2);
  const shadowMat = new THREE.ShadowMaterial({ opacity: 0.38 });
  const ground = new THREE.Mesh(groundGeo, shadowMat);
  ground.receiveShadow = true;
  ground.position.set(center.x, 0, center.z);
  const glowCanvas = document.createElement("canvas");
  glowCanvas.width = glowCanvas.height = 128;
  const gctx = glowCanvas.getContext("2d");
  if (gctx) {
    const grad = gctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, "rgba(160,190,230,0.16)");
    grad.addColorStop(0.6, "rgba(160,190,230,0.06)");
    grad.addColorStop(1, "rgba(160,190,230,0)");
    gctx.fillStyle = grad;
    gctx.fillRect(0, 0, 128, 128);
  }
  const floorTex = new THREE.CanvasTexture(glowCanvas);
  floorTex.colorSpace = THREE.SRGBColorSpace;
  const floorMat = new THREE.MeshBasicMaterial({
    map: floorTex,
    transparent: true,
    depthWrite: false,
  });
  const floor = new THREE.Mesh(groundGeo, floorMat);
  floor.position.set(center.x, -0.002, center.z);
  floor.renderOrder = -1;
  scene.add(floor, ground);

  // camera + controls
  const camera = new THREE.PerspectiveCamera(32, 1, 0.05, radius * 40);
  const controls = new OrbitControls(camera, canvas);
  canvas.style.touchAction = "pan-y"; // vertical swipes keep scrolling the page
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enablePan = false;
  controls.enableZoom = false;
  controls.autoRotate = opts.autoRotate;
  controls.autoRotateSpeed = 0.9;
  controls.maxPolarAngle = Math.PI * 0.49;
  controls.target.copy(center);
  const engageZoom = () => (controls.enableZoom = true);
  const releaseZoom = () => (controls.enableZoom = false);
  canvas.addEventListener("pointerdown", engageZoom);
  canvas.addEventListener("pointerleave", releaseZoom);

  const dirs: Record<ViewName, THREE_NS.Vector3> = {
    "34": new THREE.Vector3(0.7, 0.36, -0.62).normalize(),
    side: new THREE.Vector3(1, 0.06, 0).normalize(),
    top: new THREE.Vector3(0, 1, 0.002).normalize(),
    front: new THREE.Vector3(0, 0.1, -1).normalize(),
  };
  let fitDist = 1;
  const fit = () => {
    const w = Math.max(1, host.clientWidth);
    const h = Math.max(1, host.clientHeight);
    camera.aspect = w / h;
    const vfov = (camera.fov * Math.PI) / 180;
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * camera.aspect);
    fitDist = (radius * 0.92) / Math.sin(Math.min(vfov, hfov) / 2);
    camera.updateProjectionMatrix();
    controls.minDistance = fitDist * 0.35;
    controls.maxDistance = fitDist * 2.2;
  };
  fit();
  camera.position.copy(center).addScaledVector(dirs["34"], fitDist);
  camera.lookAt(center);

  // camera transition
  let fly: { from: THREE_NS.Vector3; to: THREE_NS.Vector3; t: number } | null = null;
  const setView = (v: ViewName) => {
    if (v === "top") controls.maxPolarAngle = Math.PI * 0.49;
    const dist = camera.position.distanceTo(controls.target) || fitDist;
    fly = {
      from: camera.position.clone(),
      to: center.clone().addScaledVector(dirs[v], Math.max(dist, fitDist * 0.9)),
      t: 0,
    };
    controls.autoRotate = false;
  };

  // demo / animation state
  const steps = demoSteps(model);
  let demoOn = false;
  let demoT = 0;
  let stepIdx = -1;
  let wantAutoRotate = opts.autoRotate;
  const st: AircraftModelState = {
    elevator: 0,
    aileron: 0,
    rudder: 0,
    flapsDeg: 0,
    gearPosition: 1,
    rpm: 0,
    lights: { nav: false, beacon: false, strobe: false, landing: false, taxi: false },
    t: 0,
    dt: 0,
  };
  model.update(st);

  // render loop, paused while off-screen or hidden
  let raf = 0;
  let visible = true;
  let last = performance.now();
  const clock = { t: 0 };
  const loop = (now: number) => {
    raf = 0;
    if (!visible || document.hidden) return;
    raf = requestAnimationFrame(loop);
    const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
    last = now;
    clock.t += dt;
    if (fly) {
      fly.t = Math.min(1, fly.t + dt / 0.6);
      const e = fly.t < 0.5 ? 2 * fly.t * fly.t : 1 - Math.pow(-2 * fly.t + 2, 2) / 2;
      camera.position.lerpVectors(fly.from, fly.to, e);
      if (fly.t >= 1) fly = null;
    }
    // reset inputs, then apply the active demo step
    st.elevator = st.aileron = st.rudder = st.flapsDeg = st.rpm = 0;
    st.gearPosition = 1;
    if (demoOn && steps.length) {
      demoT += dt;
      let acc = 0;
      let idx = 0;
      const total = steps.reduce((a, s) => a + s.dur, 0);
      const tt = demoT % total;
      while (idx < steps.length - 1 && tt > acc + (steps[idx]?.dur ?? 0)) {
        acc += steps[idx]?.dur ?? 0;
        idx++;
      }
      const step = steps[idx];
      if (step) {
        const p = Math.min(1, (tt - acc) / step.dur);
        const k = Math.sin(Math.PI * p);
        step.apply(st, Math.min(1, k * 1.25));
        if (idx !== stepIdx) {
          stepIdx = idx;
          opts.onCaption(step.caption);
        }
      }
    }
    const lightsOn = demoOn;
    st.lights.nav = st.lights.beacon = st.lights.strobe = lightsOn;
    st.t = clock.t;
    st.dt = dt;
    model.update(st);
    controls.update(dt);
    renderer.render(scene, camera);
  };
  const kick = () => {
    if (!raf && visible && !document.hidden) {
      last = performance.now();
      raf = requestAnimationFrame(loop);
    }
  };
  kick();

  const io = new IntersectionObserver((entries) => {
    visible = entries.some((e) => e.isIntersecting);
    kick();
  });
  io.observe(host);
  const onVis = () => kick();
  document.addEventListener("visibilitychange", onVis);
  const ro = new ResizeObserver(() => {
    renderer.setSize(host.clientWidth, host.clientHeight);
    fit();
    kick();
  });
  ro.observe(host);

  return {
    setView,
    setDemo(on) {
      demoOn = on;
      demoT = 0;
      stepIdx = -1;
      controls.autoRotate = on ? false : wantAutoRotate;
      if (!on) opts.onCaption(null);
    },
    setAutoRotate(on) {
      wantAutoRotate = on;
      controls.autoRotate = on && !demoOn && !fly;
    },
    dispose() {
      cancelAnimationFrame(raf);
      io.disconnect();
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      canvas.removeEventListener("pointerdown", engageZoom);
      canvas.removeEventListener("pointerleave", releaseZoom);
      controls.dispose();
      model.dispose();
      groundGeo.dispose();
      shadowMat.dispose();
      floorMat.dispose();
      floorTex.dispose();
      envTex.dispose();
      pmrem.dispose();
      envScene.traverse((o) => {
        const mesh = o as THREE_NS.Mesh;
        if (mesh.isMesh) {
          mesh.geometry.dispose();
          const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          for (const m of mats) m.dispose();
        }
      });
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    },
  };
}

function meshBox(THREE: ThreeLib, root: THREE_NS.Object3D) {
  const b = new THREE.Box3();
  const tmp = new THREE.Box3();
  root.traverseVisible((o) => {
    const mesh = o as THREE_NS.Mesh;
    if (!mesh.isMesh) return;
    const m = mesh.material as THREE_NS.Material;
    if (m.transparent) return;
    tmp.setFromObject(mesh, true);
    b.union(tmp);
  });
  return b;
}
