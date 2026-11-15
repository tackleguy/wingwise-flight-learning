/**
 * Developer page for the sky module: time of day, night, haze / fog, clouds and precipitation.
 *
 *   /dev/sky.html?apt=KSFO&kind=air&alt=4500&time=12&vis=30&cover=SCT&base=3000&top=6000
 *
 * URL parameters (all optional):
 *   apt, rwy, kind=runway|final|air|ramp, alt (ft MSL, air starts), hdg, kias, lat, lon
 *   time (local solar hours 0..24), date=YYYY-MM-DD
 *   vis (statute miles), precip=none|rain|snow
 *   cover=FEW|SCT|BKN|OVC, base, top (ft MSL)       first cloud layer
 *   cover2, base2, top2                             second cloud layer
 *   clouds=SCT:3000:6000,OVC:9000:11000             any number of layers (replaces the above)
 *   quality=low|medium|high, clouds3d=0|1
 *   cam=chase|cockpit|tower, look=yawDeg,pitchDeg   (cockpit/tower: look direction offset)
 *   nosky=1 (sky module off, for comparisons), pause=1, bare=1 (hide the overlays)
 *   markers=1   dark "monoliths" at 1/8, 1/4, 1/2, 1, 2, 3, 5 and 10 statute miles ahead of the start point, to judge
 *               visibility against the number; window.measureMarkers() compares their measured contrast with theory
 */
import { BoxGeometry, Cartesian2, Cartesian3, Color, ColorGeometryInstanceAttribute, GeometryInstance, Matrix3, Matrix4, PerInstanceColorAppearance, Primitive, SceneTransforms, Transforms } from "cesium";
import { Runtime } from "@/app/runtime";
import { basicAircraft, basicChaseCamera, basicKeyboard } from "@/dev/basic";
import type { Sim, SimModule } from "@/core/sim";
import { M_PER_FT, destination } from "@/core/math";
import type { CloudCover, CloudLayer, SpawnKind, SpawnRequest } from "@/core/types";
import { createSky } from "@/sky";
import { M_PER_SM, totalHazeOpticalDepth } from "@/sky/model";
import { aircraftMatrix, ecef, type World } from "@/world/world";

const q = new URLSearchParams(location.search);
const num = (key: string, fallback: number) => (q.get(key) !== null && q.get(key) !== "" && Number.isFinite(Number(q.get(key))) ? Number(q.get(key)) : fallback);
const hud = document.getElementById("hud")!;
if (q.get("bare")) document.body.classList.add("bare");

const rt = await Runtime.create({
  container: document.getElementById("view")!,
  creditContainer: document.getElementById("credits")!,
  onProgress: (m) => (hud.textContent = m),
});
const { sim, world } = rt;

// ------------------------------------------------------------------ weather from the URL (before the first frame)

const COVERS: CloudCover[] = ["FEW", "SCT", "BKN", "OVC"];
const isCover = (s: string | null): s is CloudCover => !!s && (COVERS as string[]).includes(s.toUpperCase());

function layersFromUrl(): CloudLayer[] {
  const out: CloudLayer[] = [];
  const list = q.get("clouds");
  if (list) {
    for (const part of list.split(",")) {
      const [c, b, t] = part.split(":");
      if (isCover(c ?? null)) out.push({ cover: c!.toUpperCase() as CloudCover, baseFtMsl: Number(b) || 3000, topFtMsl: Number(t) || (Number(b) || 3000) + 2000 });
    }
    return out;
  }
  if (isCover(q.get("cover"))) out.push({ cover: q.get("cover")!.toUpperCase() as CloudCover, baseFtMsl: num("base", 3000), topFtMsl: num("top", num("base", 3000) + 2500) });
  if (isCover(q.get("cover2"))) out.push({ cover: q.get("cover2")!.toUpperCase() as CloudCover, baseFtMsl: num("base2", 8000), topFtMsl: num("top2", num("base2", 8000) + 1500) });
  return out;
}

sim.env.visibilitySm = num("vis", 30);
sim.env.clouds = layersFromUrl();
const precip = q.get("precip");
sim.env.precipitation = precip === "rain" || precip === "snow" ? precip : "none";
if (q.get("quality")) {
  const quality = q.get("quality") as "low" | "medium" | "high";
  sim.settings.quality = quality; // not saved: developer page only
  world.setQuality(quality);
}
if (q.get("clouds3d")) sim.settings.clouds3d = q.get("clouds3d") !== "0";

// ------------------------------------------------------------------ modules

sim.use(basicKeyboard());
sim.use(basicAircraft(world));
sim.use(basicChaseCamera(world));
sim.use(devCamera(world, q.get("cam") ?? "chase", (q.get("look") ?? "0,0").split(",").map(Number)));
const sky = createSky(world);
if (!q.get("nosky")) sim.use(sky);
sim.events.on("message", (m) => console.log("[message]", m.text));
sim.events.on("crash", (c) => console.log("[crash]", c.reason));

/** Cockpit and tower cameras for looking at the sky from particular places (the chase view comes from basicChaseCamera). */
function devCamera(w: World, mode: string, look: number[]): SimModule & { mode: string; yaw: number; pitch: number } {
  const m = new Matrix4();
  const rot = new Matrix3();
  const pos = new Cartesian3();
  const dir = new Cartesian3();
  const up = new Cartesian3();
  const local = new Cartesian3();
  let tower: { lat: number; lon: number; altFt: number } | null = null;
  const self = {
    name: "dev-camera",
    mode,
    yaw: look[0] || 0,
    pitch: look[1] || 0,
    onSpawn() {
      tower = null;
    },
    frame(s: Sim) {
      if (self.mode === "chase") return;
      const st = s.state;
      if (self.mode === "tower") {
        // A fixed point about 600 m ahead-left of where the aircraft was spawned, 15 m above the ground.
        if (!tower) {
          const b = ((st.headingTrue - 35) * Math.PI) / 180;
          tower = { lat: st.lat + (600 * Math.cos(b)) / 110540, lon: st.lon + (600 * Math.sin(b)) / (111320 * Math.cos((st.lat * Math.PI) / 180)), altFt: st.groundElevFt + 50 };
        }
        aircraftMatrix(tower.lat, tower.lon, tower.altFt, st.headingTrue + 145 + self.yaw, self.pitch, 0, m);
      } else {
        aircraftMatrix(st.lat, st.lon, st.altMslFt + 1.5, st.headingTrue + self.yaw, self.pitch, 0, m);
      }
      Matrix4.getTranslation(m, pos);
      Matrix4.getMatrix3(m, rot);
      Matrix3.multiplyByVector(rot, Cartesian3.fromElements(1, 0, 0, local), dir);
      Matrix3.multiplyByVector(rot, Cartesian3.fromElements(0, 0, 1, local), up);
      w.camera.setView({ destination: pos, orientation: { direction: dir, up } });
    },
  };
  return self;
}

// ------------------------------------------------------------------ distance markers (visibility check)

const MARKER_SM = [0.125, 0.25, 0.5, 1, 2, 3, 5, 10];
const MARKER_GREY = 0.02;
let markerPrimitive: Primitive | null = null;
let markerPoints: { sm: number; point: Cartesian3; aglM: number }[] = [];

/** Flat-black boxes whose size grows with distance, so each one looks the same size from the start point. */
function placeMarkers(lat: number, lon: number, groundFt: number, headingTrue: number): void {
  if (markerPrimitive) world.scene.primitives.remove(markerPrimitive);
  markerPoints = [];
  const instances: GeometryInstance[] = [];
  MARKER_SM.forEach((sm, i) => {
    const d = sm * M_PER_SM;
    const side = (i % 2 === 0 ? -1 : 1) * (2.5 + i * 0.9);
    const p = destination(lat, lon, headingTrue + side, d / 1852);
    const width = 0.022 * d;
    const height = 0.07 * d;
    const base = ecef(p.lat, p.lon, groundFt);
    const frame = Transforms.eastNorthUpToFixedFrame(base);
    instances.push(
      new GeometryInstance({
        geometry: BoxGeometry.fromDimensions({ dimensions: new Cartesian3(width, width, height), vertexFormat: PerInstanceColorAppearance.VERTEX_FORMAT }),
        modelMatrix: Matrix4.multiplyByTranslation(frame, new Cartesian3(0, 0, height / 2), new Matrix4()),
        attributes: { color: ColorGeometryInstanceAttribute.fromColor(new Color(MARKER_GREY, MARKER_GREY, MARKER_GREY, 1)) },
      }),
    );
    // measuring point: on the box's axis, a quarter of the way up
    markerPoints.push({ sm, point: Matrix4.multiplyByPoint(frame, new Cartesian3(0, 0, height * 0.25), new Cartesian3()), aglM: height * 0.25 });
  });
  markerPrimitive = new Primitive({ geometryInstances: instances, appearance: new PerInstanceColorAppearance({ flat: true, translucent: false }), asynchronous: false });
  world.scene.primitives.add(markerPrimitive);
}

/**
 * For each marker: how much of its contrast against the haze is left on screen (read back from the
 * drawn picture) next to what the visibility number says it should be.
 */
function measureMarkers() {
  const scene = world.scene;
  const context = (scene as unknown as { context: { readPixels(o: object): Uint8Array; drawingBufferWidth: number; drawingBufferHeight: number } }).context;
  world.render();
  const info = sky.debug();
  const lum = (r: number, g: number, b: number) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const haze = lum(info.hazeColor[0], info.hazeColor[1], info.hazeColor[2]);
  const scaleX = context.drawingBufferWidth / scene.canvas.clientWidth;
  const scaleY = context.drawingBufferHeight / scene.canvas.clientHeight;
  const camAglM = world.camera.positionCartographic.height - sim.state.groundElevFt * M_PER_FT;
  const out: { sm: number; distanceM: number; measured: number | null; expected: number }[] = [];
  for (const m of markerPoints) {
    const w = SceneTransforms.worldToWindowCoordinates(scene, m.point, new Cartesian2());
    const distanceM = Cartesian3.distance(world.camera.positionWC, m.point);
    const expected = Math.exp(-totalHazeOpticalDepth(info.visibilitySm, distanceM, camAglM, m.aglM));
    let measured: number | null = null;
    if (w) {
      const x = Math.round(w.x * scaleX);
      const y = Math.round(context.drawingBufferHeight - w.y * scaleY);
      if (x >= 1 && y >= 1 && x < context.drawingBufferWidth - 2 && y < context.drawingBufferHeight - 2) {
        const px = context.readPixels({ x: x - 1, y: y - 1, width: 3, height: 3 });
        let l = 0;
        for (let i = 0; i < 9; i++) l += lum(px[i * 4]! / 255, px[i * 4 + 1]! / 255, px[i * 4 + 2]! / 255) / 9;
        measured = (l - haze) / (MARKER_GREY - haze);
      }
    }
    out.push({ sm: m.sm, distanceM: Math.round(distanceM), measured: measured === null ? null : Math.round(measured * 1000) / 1000, expected: Math.round(expected * 1000) / 1000 });
  }
  return out;
}
if (q.get("markers")) sim.events.on("spawn", (r) => placeMarkers(r.lat, r.lon, sim.state.groundElevFt, r.headingTrue));

// ------------------------------------------------------------------ spawn

hud.textContent = "Loading terrain…";
const apt = q.get("apt") ?? "KSFO";
const kind = (q.get("kind") as SpawnKind) ?? "runway";
const req: SpawnRequest = { kind, airportIdent: apt, runwayEndId: q.get("rwy") ?? undefined };
if (kind === "air") {
  const a = sim.data.getAirport(apt);
  req.lat = num("lat", a?.lat ?? 37.62);
  req.lon = num("lon", a?.lon ?? -122.38);
  req.altFtMsl = num("alt", 3500);
  req.headingTrue = num("hdg", 300);
  req.kias = num("kias", 100);
}
await sim.spawn(req);

// time of day and date need the aircraft's longitude, so they are applied after the spawn
if (q.get("date")) {
  const [y, mo, d] = q.get("date")!.split("-").map(Number);
  if (y && mo && d) {
    sim.env.utcMs = Date.UTC(y, mo - 1, d, 12);
    sky.setDate(y, mo, d);
  }
}
sky.setLocalSolarTime(num("time", 12));
if (q.get("pause")) sim.setPaused(true);
rt.start();
Object.assign(window, { rt, sim, world, sky, measureMarkers });

// ------------------------------------------------------------------ control strip

const strip = document.getElementById("strip")!;
function el(tag: "input", props?: Record<string, unknown>, parent?: HTMLElement): HTMLInputElement;
function el(tag: "select", props?: Record<string, unknown>, parent?: HTMLElement): HTMLSelectElement;
function el(tag: string, props?: Record<string, unknown>, parent?: HTMLElement): HTMLElement;
function el(tag: string, props: Record<string, unknown> = {}, parent: HTMLElement = strip): HTMLElement {
  const e = Object.assign(document.createElement(tag), props);
  parent.appendChild(e);
  return e;
}

function slider(label: string, min: number, max: number, step: number, get: () => number, set: (v: number) => void, fmt: (v: number) => string = (v) => String(v)) {
  const wrap = el("label", { textContent: label + " " });
  const input = el("input", { type: "range", min: String(min), max: String(max), step: String(step), value: String(get()) }, wrap);
  const out = el("output", { textContent: fmt(get()) }, wrap);
  input.addEventListener("input", () => {
    set(Number(input.value));
    out.textContent = fmt(Number(input.value));
  });
  return () => {
    input.value = String(get());
    out.textContent = fmt(get());
  };
}

function coverSelect(label: string, index: number) {
  const wrap = el("label", { textContent: label + " " });
  const sel = el("select", {}, wrap);
  for (const c of ["none", ...COVERS]) el("option", { value: c, textContent: c }, sel);
  sel.value = sim.env.clouds[index]?.cover ?? "none";
  sel.addEventListener("change", () => {
    const clouds = sim.env.clouds.slice();
    if (sel.value === "none") clouds.splice(index, 1);
    else {
      const def = index === 0 ? { baseFtMsl: 3000, topFtMsl: 5500 } : { baseFtMsl: 8000, topFtMsl: 9500 };
      while (clouds.length < index) clouds.push({ cover: "FEW", baseFtMsl: 3000, topFtMsl: 5500 });
      clouds[index] = { ...(clouds[index] ?? def), cover: sel.value as CloudCover };
    }
    sim.env.clouds = clouds;
    refreshAll();
  });
  return () => (sel.value = sim.env.clouds[index]?.cover ?? "none");
}

const layerField = (index: number, key: "baseFtMsl" | "topFtMsl", fallback: number) => ({
  get: () => sim.env.clouds[index]?.[key] ?? fallback,
  set: (v: number) => {
    const l = sim.env.clouds[index];
    if (!l) return;
    l[key] = v;
    if (l.topFtMsl < l.baseFtMsl + 200) {
      if (key === "baseFtMsl") l.topFtMsl = v + 200;
      else l.baseFtMsl = Math.max(0, v - 200);
    }
  },
});

const refreshers: (() => void)[] = [];
const refreshAll = () => refreshers.forEach((f) => f());
const ft = (v: number) => `${Math.round(v)} ft`;

refreshers.push(slider("Time", 0, 24, 0.05, () => sky.localSolarTime(), (v) => sky.setLocalSolarTime(v), (v) => `${String(Math.floor(v)).padStart(2, "0")}:${String(Math.floor((v % 1) * 60)).padStart(2, "0")}`));
refreshers.push(
  slider(
    "Visibility",
    -1.3,
    1.78,
    0.01,
    () => Math.log10(sim.env.visibilitySm),
    (v) => (sim.env.visibilitySm = Math.round(10 ** v * 100) / 100),
    (v) => `${(10 ** v).toFixed(10 ** v < 3 ? 2 : 0)} sm`,
  ),
);
refreshers.push(coverSelect("Layer 1", 0));
refreshers.push(slider("base", 0, 12000, 100, layerField(0, "baseFtMsl", 3000).get, layerField(0, "baseFtMsl", 3000).set, ft));
refreshers.push(slider("top", 200, 16000, 100, layerField(0, "topFtMsl", 5500).get, layerField(0, "topFtMsl", 5500).set, ft));
refreshers.push(coverSelect("Layer 2", 1));
refreshers.push(slider("base", 0, 20000, 100, layerField(1, "baseFtMsl", 8000).get, layerField(1, "baseFtMsl", 8000).set, ft));
refreshers.push(slider("top", 200, 24000, 100, layerField(1, "topFtMsl", 9500).get, layerField(1, "topFtMsl", 9500).set, ft));
{
  const wrap = el("label", { textContent: "Rain / snow " });
  const sel = el("select", {}, wrap);
  for (const c of ["none", "rain", "snow"]) el("option", { value: c, textContent: c }, sel);
  sel.value = sim.env.precipitation;
  sel.addEventListener("change", () => (sim.env.precipitation = sel.value as "none" | "rain" | "snow"));
  refreshers.push(() => (sel.value = sim.env.precipitation));
}
{
  const wrap = el("label", { textContent: "Quality " });
  const sel = el("select", {}, wrap);
  for (const c of ["low", "medium", "high"]) el("option", { value: c, textContent: c }, sel);
  sel.value = sim.settings.quality;
  sel.addEventListener("change", () => {
    sim.settings.quality = sel.value as "low" | "medium" | "high";
    world.setQuality(sim.settings.quality);
  });
  const wrap2 = el("label", { textContent: "3D clouds " });
  const box = el("input", { type: "checkbox", checked: sim.settings.clouds3d }, wrap2);
  box.addEventListener("change", () => (sim.settings.clouds3d = box.checked));
  const wrap3 = el("label", { textContent: "Sky effects " });
  const box3 = el("input", { type: "checkbox", checked: true }, wrap3);
  box3.addEventListener("change", () => sky.setEnabled(box3.checked));
  const wrap4 = el("label", { textContent: "View " });
  const sel4 = el("select", {}, wrap4);
  for (const c of ["chase", "cockpit", "tower"]) el("option", { value: c, textContent: c }, sel4);
  const cam = sim.module<ReturnType<typeof devCamera>>("dev-camera")!;
  sel4.value = cam.mode;
  sel4.addEventListener("change", () => (cam.mode = sel4.value));
  slider("look up", -89, 89, 1, () => cam.pitch, (v) => (cam.pitch = v), (v) => `${v}°`);
  slider("look right", -180, 180, 1, () => cam.yaw, (v) => (cam.yaw = v), (v) => `${v}°`);
}

interface Preset {
  name: string;
  time: number;
  vis: number;
  clouds: CloudLayer[];
  precip?: "none" | "rain" | "snow";
}
const presets: Preset[] = [
  { name: "Clear noon", time: 12, vis: 30, clouds: [] },
  { name: "Scattered cumulus", time: 14, vis: 20, clouds: [{ cover: "SCT", baseFtMsl: 3500, topFtMsl: 6500 }] },
  { name: "Overcast 1500", time: 11, vis: 6, clouds: [{ cover: "OVC", baseFtMsl: 1500, topFtMsl: 3500 }] },
  { name: "Fog", time: 8, vis: 0.5, clouds: [] },
  { name: "Night clear", time: 23, vis: 30, clouds: [] },
  { name: "Dusk", time: 19.4, vis: 15, clouds: [{ cover: "FEW", baseFtMsl: 5000, topFtMsl: 7000 }] },
  { name: "Rain", time: 15, vis: 4, clouds: [{ cover: "OVC", baseFtMsl: 2000, topFtMsl: 7000 }], precip: "rain" },
  { name: "Snow", time: 13, vis: 1.5, clouds: [{ cover: "OVC", baseFtMsl: 1800, topFtMsl: 6000 }], precip: "snow" },
];
for (const p of presets) {
  const b = el("button", { textContent: p.name });
  b.addEventListener("click", () => {
    sky.setLocalSolarTime(p.time);
    sim.env.visibilitySm = p.vis;
    sim.env.clouds = p.clouds.map((c) => ({ ...c }));
    sim.env.precipitation = p.precip ?? "none";
    refreshAll();
  });
}

setInterval(() => {
  const s = sim.state;
  const d = sky.debug?.();
  hud.textContent =
    `${sim.lastSpawn?.airportIdent ?? ""} ${sim.lastSpawn?.runwayEndId ?? ""}  ${rt.fps.toFixed(1)} fps  tiles ${world.tilesLoaded ? "ok" : "loading"}  ALT ${s.altMslFt.toFixed(0)} ft  AGL ${s.aglFt.toFixed(0)}  KCAS ${s.kcas.toFixed(0)}  HDG ${s.headingTrue.toFixed(0)}${sim.paused ? "  PAUSED" : ""}\n` +
    `solar time ${sky.localSolarTime().toFixed(2)} h  sun ${sky.sunElevationDeg().toFixed(1)}°  daylight ${sky.daylight().toFixed(2)}  in cloud (physics) ${s.inCloud.toFixed(2)}\n` +
    (d && d.quality
      ? `drawn: vis ${d.visibilitySm.toFixed(2)} sm  haze top scale ${d.hazeScaleHeightM.toFixed(0)} m  tile cut-off ${(d.cullDistanceM / 1000).toFixed(0)} km  overcast ${d.overcast.toFixed(2)}  precip ${d.precipIntensity.toFixed(2)}  cam in cloud ${d.cameraInCloud.toFixed(2)}\n` +
        `quality ${d.quality}: ${d.layers} layer(s), ${d.cloudSteps} steps x ${d.lightSamples} light sample(s), cloud pass at ${(d.cloudScale * 100).toFixed(0)}% size\n`
      : "") +
    `arrows = yoke   A/D = rudder   W/S = throttle   F = flaps   B = park brake   P = pause`;
}, 250);
