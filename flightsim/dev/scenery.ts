/**
 * Developer page for the scenery module (runways, markings, lights, PAPI, beacon, windsock).
 *
 *   /dev/scenery.html?apt=KSFO&rwy=28R&kind=runway|final|air&nm=1.5&time=21&vis=10&wind=270@12&quality=high
 *
 *   apt, rwy   airport ident and runway end           kind   runway (default) / final / air
 *   nm         distance of a "final" start, nm        off    feet above (+) or below (−) the 3° path
 *   time       local solar time, hours (12 = noon)    vis    visibility, statute miles
 *   wind       "direction@knots" (direction FROM)     quality low / medium / high
 *   clean=1    hide the read-out and buttons          buildings=0|1
 *   pause=1    freeze the aircraft where it starts    nightlights=1  show the (very bright) city-lights layer
 *   nohmr=1    do not reload when source files change (scripted screenshot sessions)
 *   glyphs=01L,23C,45R,67,89   show the painted numerals for those runway names
 *
 * In the console / scripted checks: sim, rt, world, scenery, setTime(h), setWind(dir, kt),
 * lookFrom({ lat, lon, altFt }, { lat, lon, altFt }, fovDeg?), chase(), startFinal(nm, offFt),
 * endPoint(endId, alongFt, rightFt) → a point relative to a runway end.
 */
import { BoxGeometry, Cartesian3, Color, ColorGeometryInstanceAttribute, GeometryInstance, Math as CesiumMath, Matrix3, Matrix4, PerInstanceColorAppearance, PerspectiveFrustum, Primitive } from "cesium";
import { Runtime } from "@/app/runtime";
import { CG_HEIGHT_FT } from "@/core/defaults";
import { FT_PER_NM, destination } from "@/core/math";
import type { Sim, SimModule } from "@/core/sim";
import { findRunwayEnd } from "@/core/spawn";
import { utcForLocalSolarHours, localSolarHours } from "@/core/sun";
import type { Quality, SpawnKind } from "@/core/types";
import { basicAircraft, basicKeyboard } from "@/dev/basic";
import { createScenery } from "@/scenery";
import { designatorSheet } from "@/scenery/textures";
import { aircraftMatrix, ecef, type World } from "@/world/world";

const q = new URLSearchParams(location.search);
const hud = document.getElementById("hud")!;
// nohmr=1: do not reload the page when source files change (long scripted screenshot sessions).
if (q.get("nohmr") && import.meta.hot) {
  import.meta.hot.on("vite:beforeFullReload", () => {
    throw new Error("(page reload skipped: nohmr=1)");
  });
}
if (q.get("clean")) document.body.classList.add("clean");

const rt = await Runtime.create({
  container: document.getElementById("view")!,
  creditContainer: document.getElementById("credits")!,
  onProgress: (m) => (hud.textContent = m),
});
const { sim, world } = rt;

if (q.get("quality")) {
  sim.settings.quality = q.get("quality") as Quality;
  world.setQuality(sim.settings.quality);
}
if (q.get("buildings")) sim.settings.buildings = q.get("buildings") === "1";

// ---------------------------------------------------------------- camera: chase by default, or a fixed look-at for inspections
interface Geo {
  lat: number;
  lon: number;
  altFt: number;
}
let fixedView: { from: Geo; to: Geo } | null = null;
let chaseDistance = Number(q.get("dist") ?? 22);
let chaseHeight = Number(q.get("height") ?? 5);

function devCamera(w: World): SimModule {
  const m = new Matrix4();
  const rot = new Matrix3();
  const pos = new Cartesian3();
  const dir = new Cartesian3();
  const up = new Cartesian3();
  const local = new Cartesian3();
  const target = new Cartesian3();
  return {
    name: "dev-camera",
    frame(s: Sim) {
      if (fixedView) {
        ecef(fixedView.from.lat, fixedView.from.lon, fixedView.from.altFt, pos);
        ecef(fixedView.to.lat, fixedView.to.lon, fixedView.to.altFt, target);
        Cartesian3.normalize(Cartesian3.subtract(target, pos, dir), dir);
        Cartesian3.normalize(pos, up);
        w.camera.setView({ destination: pos, orientation: { direction: dir, up } });
        return;
      }
      const st = s.state;
      aircraftMatrix(st.lat, st.lon, st.altMslFt, st.headingTrue, 0, 0, m);
      Matrix4.multiplyByPoint(m, Cartesian3.fromElements(-chaseDistance, 0, chaseHeight, local), pos);
      Matrix4.getMatrix3(m, rot);
      Matrix3.multiplyByVector(rot, Cartesian3.normalize(Cartesian3.fromElements(chaseDistance, 0, -chaseHeight * 0.6, local), local), dir);
      Matrix3.multiplyByVector(rot, Cartesian3.UNIT_Z, up);
      w.camera.setView({ destination: pos, orientation: { direction: dir, up } });
    },
  };
}

/** Three small dark blocks where the wheels touch the ground, so "do the wheels sit ON the runway?" can be checked by eye. */
function devWheels(w: World): SimModule {
  const mk = (x: number, y: number) =>
    new Primitive({
      geometryInstances: new GeometryInstance({
        geometry: BoxGeometry.fromDimensions({ dimensions: new Cartesian3(0.42, 0.16, 0.42), vertexFormat: PerInstanceColorAppearance.VERTEX_FORMAT }),
        modelMatrix: Matrix4.fromTranslation(new Cartesian3(x, y, 0.21)),
        attributes: { color: ColorGeometryInstanceAttribute.fromColor(Color.fromCssColorString("#16161a")) },
      }),
      appearance: new PerInstanceColorAppearance({ flat: false, translucent: false }),
      asynchronous: false,
    });
  // nose wheel ahead, main wheels 1.27 m either side (Cessna 172-like track of about 2.5 m)
  const parts = [mk(1.2, 0), mk(-0.45, 1.27), mk(-0.45, -1.27)];
  for (const p of parts) w.scene.primitives.add(p);
  const m = new Matrix4();
  return {
    name: "dev-wheels",
    frame(s: Sim) {
      const st = s.state;
      aircraftMatrix(st.lat, st.lon, st.altMslFt - CG_HEIGHT_FT, st.headingTrue, st.pitch, st.roll, m);
      for (const p of parts) p.modelMatrix = m;
    },
    dispose() {
      for (const p of parts) w.scene.primitives.remove(p);
    },
  };
}

sim.use(basicKeyboard());
const scenery = sim.use(createScenery(world));
sim.use(basicAircraft(world));
sim.use(devWheels(world));
sim.use(devCamera(world));
sim.events.on("message", (m) => console.log("[message]", m.text));
sim.events.on("crash", (c) => console.log("[crash]", c.reason));

// ---------------------------------------------------------------- environment from the URL
const setTime = (hours: number) => {
  const lon = sim.lastSpawn?.lon ?? sim.data.getAirport(apt)?.lon ?? 0;
  sim.env.utcMs = utcForLocalSolarHours(sim.env.utcMs, lon, hours);
};
const setWind = (dirTrue: number, kt: number) => {
  sim.env.wind = [{ altFtMsl: 0, dirTrue, kt }];
};
const apt = q.get("apt") ?? "KSFO";
if (q.get("vis")) sim.env.visibilitySm = Number(q.get("vis"));
if (q.get("wind")) {
  const [d, k] = q.get("wind")!.split("@").map(Number);
  setWind(d ?? 270, k ?? 0);
}
if (q.get("time")) setTime(Number(q.get("time")));

// ---------------------------------------------------------------- starting positions
/** A point relative to a runway end: `alongFt` in the landing direction from the pavement end (negative = out on the approach), `rightFt` to the right. */
function endPoint(endId: string, alongFt: number, rightFt = 0, ident = sim.lastSpawn?.airportIdent ?? apt) {
  const ap = sim.data.getAirport(ident);
  const pick = ap ? findRunwayEnd(ap, endId) : null;
  if (!pick) return null;
  const end = pick.runway.ends[pick.endIndex];
  const a = destination(end.lat, end.lon, end.headingTrue, alongFt / FT_PER_NM);
  const p = destination(a.lat, a.lon, end.headingTrue + 90, rightFt / FT_PER_NM);
  return { ...p, headingTrue: end.headingTrue, elevFt: sim.elevation.groundFt(end.lat, end.lon) ?? end.elevFt ?? ap?.elevFt ?? 0, displacedFt: end.displacedFt };
}

/** Start on final `nm` from the threshold, `offFt` above (+) or below (−) the 3° path. */
async function startFinal(nm: number, offFt = 0, endId = sim.lastSpawn?.runwayEndId ?? q.get("rwy") ?? "", ident = sim.lastSpawn?.airportIdent ?? apt) {
  if (!offFt) return sim.spawn({ kind: "final", airportIdent: ident, runwayEndId: endId || undefined, finalNm: nm });
  const first = await sim.spawn({ kind: "final", airportIdent: ident, runwayEndId: endId || undefined, finalNm: nm });
  return sim.spawn({ kind: "air", lat: first.lat, lon: first.lon, altFtMsl: first.altFtMsl + offFt, headingTrue: first.headingTrue, kias: 65 });
}

const lookFrom = (from: Geo, to: Geo, fovDeg?: number) => {
  fixedView = { from, to };
  if (fovDeg && world.camera.frustum instanceof PerspectiveFrustum) world.camera.frustum.fov = CesiumMath.toRadians(fovDeg);
};
const chase = (distance = 22, height = 5) => {
  fixedView = null;
  chaseDistance = distance;
  chaseHeight = height;
  if (world.camera.frustum instanceof PerspectiveFrustum) world.camera.frustum.fov = CesiumMath.toRadians(60);
};

hud.textContent = "Loading terrain…";
const kind = (q.get("kind") as SpawnKind) ?? "runway";
if (kind === "final") await startFinal(Number(q.get("nm") ?? 1.5), Number(q.get("off") ?? 0), q.get("rwy") ?? "", apt);
else await sim.spawn({ kind, airportIdent: apt, runwayEndId: q.get("rwy") ?? undefined });
if (q.get("time")) setTime(Number(q.get("time")));
if (q.get("pause")) sim.setPaused(true);
// The NASA city-lights layer is far too bright close to the ground (the sky module tunes it in the app);
// it is hidden here so the runway lights can be judged against a dark landscape. nightlights=1 shows it.
if (!q.get("nightlights")) world.nightLayer.show = false;
rt.start();
Object.assign(window, { rt, sim, world, scenery, setTime, setWind, lookFrom, chase, startFinal, endPoint });

// glyphs=01L,23C,45R,…  shows the painted numerals for those designators (left: paint, right: distance field)
if (q.get("glyphs")) {
  const sheet = designatorSheet(q.get("glyphs")!.split(","));
  sheet.style.cssText = "position:fixed;right:8px;top:8px;height:70vh;border:1px solid #567;image-rendering:pixelated";
  document.body.appendChild(sheet);
}

// ---------------------------------------------------------------- buttons
const bar = document.getElementById("bar")!;
const button = (label: string, fn: () => void) => {
  const b = document.createElement("button");
  b.textContent = label;
  b.onclick = () => {
    fn();
    b.blur();
  };
  bar.appendChild(b);
};
button("Day", () => setTime(12));
button("Dusk", () => setTime(18.9));
button("Night", () => setTime(23));
button("On runway", () => void sim.spawn({ kind: "runway", airportIdent: sim.lastSpawn?.airportIdent ?? apt, runwayEndId: sim.lastSpawn?.runwayEndId ?? undefined }));
button("Final 1.5 nm", () => void startFinal(1.5));
button("Final 5 nm", () => void startFinal(5));
button("Too high (+250 ft)", () => void startFinal(1.5, 250));
button("Too low (−200 ft)", () => void startFinal(1.5, -200));
button("Wind calm", () => setWind(270, 0));
button("Wind 270 at 7", () => setWind(270, 7));
button("Wind 180 at 20", () => setWind(180, 20));
button("Visibility 30 / 3 / 1", () => (sim.env.visibilitySm = sim.env.visibilitySm > 10 ? 3 : sim.env.visibilitySm > 2 ? 1 : 30));
button("Quality", () => {
  const next: Quality = sim.settings.quality === "low" ? "medium" : sim.settings.quality === "medium" ? "high" : "low";
  sim.settings.quality = next;
  world.setQuality(next);
});
button("Landing light", () => (sim.controls.lights.landing = !sim.controls.lights.landing));
button("Chase / wide chase", () => (chaseDistance > 30 ? chase() : chase(60, 18)));

setInterval(() => {
  const s = sim.state;
  const st = scenery.stats;
  const papi = scenery.papiReport();
  hud.textContent =
    `${sim.lastSpawn?.airportIdent ?? ""} ${sim.lastSpawn?.runwayEndId ?? ""}   ${rt.fps.toFixed(0)} fps  tiles ${world.tilesLoaded ? "ok" : "loading"} (${rt.elevation.pendingTiles})  quality ${sim.settings.quality}\n` +
    `KCAS ${s.kcas.toFixed(0)}  ALT ${s.altMslFt.toFixed(0)}  AGL ${s.aglFt.toFixed(0)}  VS ${s.vsFpm.toFixed(0)}  HDG ${s.headingTrue.toFixed(0)}T  ${s.onGround ? "ON GROUND" : "AIRBORNE"}${s.crash ? "  CRASH: " + s.crash.reason : ""}\n` +
    `scenery: ${st.airports} airports (+${st.pending} pending)  ${st.runways} runways  ${st.lights} lights  ${st.windsocks} windsocks  buildings ${st.buildings} in ${st.buildingTiles} tiles\n` +
    `scenery frame ${st.lastFrameMs.toFixed(2)} ms  worst ${st.worstFrameMs.toFixed(1)} ms  worst build step ${st.worstStepMs.toFixed(1)} ms   light level ${st.lightLevel.toFixed(2)}   local solar time ${localSolarHours(sim.env.utcMs, s.lon).toFixed(1)} h\n` +
    `wind ${sim.env.wind[0]?.dirTrue.toFixed(0)}° at ${sim.env.wind[0]?.kt.toFixed(0)} kt   visibility ${sim.env.visibilitySm} sm\n` +
    (papi ? `PAPI ${papi.airportIdent} ${papi.runwayEndId}: ${papi.angleDeg.toFixed(2)}°  ${papi.pattern}  (${papi.meaning}; W = white, R = red, runway side last)  ${papi.distanceNm.toFixed(1)} nm` : "PAPI: none in view");
}, 250);
