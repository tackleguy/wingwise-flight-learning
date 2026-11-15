/**
 * Developer page for the weather module — without the 3D world, so it loads fast and shows only
 * the numbers:   /dev/weather.html?apt=KSFO&rwy=28R&preset=crosswind-10&real=1&relay=<url of api/metar>
 *
 * It builds a real simulator (airport database, terrain service, JSBSim), adds the weather module
 * and lets you load real weather or a preset and see what the aircraft feels on the runway.
 * Scripted checks: window.sim, window.weather (see scripts/shot.cjs).
 */
import { Sim } from "@/core/sim";
import { loadWorldData } from "@/data/world-data";
import { createWeather } from "@/weather";
import { ElevationService } from "@/world/elevation";

const q = new URLSearchParams(location.search);
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const describeEl = $("describe");
describeEl.textContent = "Loading airports of the world…";

const data = await loadWorldData();
const elevation = new ElevationService(data);
const sim = new Sim({ data, elevation });
// ?relay=<url> points the module at a running copy of the relay function (api/metar.ts), e.g. a deployed
// site's https://…/api/metar. Without it the development server has no relay and the module does not look for one.
const relay = q.get("relay");
const weather = sim.use(createWeather(relay ? { relayUrl: relay } : {}));
Object.assign(window, { sim, weather });

const aptInput = $<HTMLInputElement>("apt");
aptInput.value = (q.get("apt") ?? "KSFO").toUpperCase();
const presetSelect = $<HTMLSelectElement>("preset");
presetSelect.append(new Option("Choose a preset…", ""));
for (const p of weather.presets()) {
  const o = new Option(p.name, p.id);
  o.title = p.description;
  presetSelect.append(o);
}

const fmt = (v: number, d = 1) => v.toFixed(d);

function refresh() {
  describeEl.textContent = weather.describe();
  const cat = weather.flightCategory();
  const catEl = $("category");
  catEl.textContent = cat;
  catEl.className = cat;
  const env = sim.env;
  const rows = ["<tr><th>height above airport</th><th>from (°T)</th><th>knots</th></tr>"];
  for (const agl of [0, 100, 300, 500, 1000, 2000, 3000, 5000, 8000, 12000]) {
    const w = weather.windAt(env.stationElevFt + agl);
    rows.push(`<tr><td>${agl === 0 ? "surface (33 ft)" : agl.toLocaleString("en-US") + " ft"}</td><td>${w.kt < 0.5 ? "–" : String(Math.round(w.dirTrue)).padStart(3, "0")}</td><td>${fmt(w.kt)}</td></tr>`);
  }
  $("profile").innerHTML = rows.join("");
  $("env").textContent = JSON.stringify(env, (_k, v: unknown) => (typeof v === "number" ? Math.round(v * 100) / 100 : v), 1);
  presetSelect.value = weather.activePresetId() ?? "";
}
weather.subscribe(refresh);

async function spawn() {
  const ident = aptInput.value.trim().toUpperCase();
  describeEl.textContent = `Going to ${ident}…`;
  await sim.spawn({ kind: "runway", airportIdent: ident, runwayEndId: q.get("rwy") ?? undefined });
  refresh();
}

async function loadReal() {
  const ident = sim.lastSpawn?.airportIdent ?? aptInput.value.trim().toUpperCase();
  const airport = data.getAirport(ident);
  $("result").textContent = "Asking the weather services…";
  const t = performance.now();
  const r = await weather.loadRealWeather(airport?.lat ?? sim.state.lat, airport?.lon ?? sim.state.lon, airport?.ident);
  $("result").textContent = `${r.message}\n\n${JSON.stringify({ ...r, message: undefined }, null, 1)}\n(${Math.round(performance.now() - t)} ms)`;
  refresh();
  return r;
}
Object.assign(window, { loadReal });

$("spawn").addEventListener("click", () => void spawn());
$("real").addEventListener("click", () => void loadReal());
presetSelect.addEventListener("change", () => presetSelect.value && weather.applyPreset(presetSelect.value));

sim.events.on("message", (m) => console.log("[message]", m.text));
if (q.get("preset")) weather.applyPreset(q.get("preset")!);
await spawn();
if (q.get("real")) await loadReal();

// physics only: no 3D world to draw
let last = performance.now();
const loop = (now: number) => {
  requestAnimationFrame(loop);
  sim.frame(Math.max(0, (now - last) / 1000));
  last = now;
};
requestAnimationFrame(loop);

setInterval(() => {
  const s = sim.state;
  const w = weather.windStatus;
  const end = sim.lastPlan?.runway && sim.lastPlan.endIndex !== null ? sim.lastPlan.runway.ends[sim.lastPlan.endIndex] : null;
  const c = end ? weather.components(end.headingTrue) : null;
  $("live").textContent =
    `${sim.lastSpawn?.airportIdent ?? "–"} runway ${end?.id ?? "–"}   ${s.onGround ? "on the ground" : `${fmt(s.aglFt, 0)} ft above the ground`}\n` +
    `wind at the aircraft   ${String(Math.round(s.windDirTrue)).padStart(3, "0")}° / ${fmt(s.windKt)} kt\n` +
    `  mean ${fmt(w.meanKt)} kt   gust now ${w.gustNowKt >= 0 ? "+" : ""}${fmt(w.gustNowKt)} kt   swing ${fmt(w.swingNowDeg)}°   ground friction ×${fmt(w.friction, 2)}\n` +
    `turbulence to the flight model ${fmt(w.turbulence, 2)}   thermals ${fmt(w.thermalFpm, 0)} ft/min (strength ${fmt(w.thermalStrength, 2)})\n` +
    (c ? `reported wind on the runway: ${fmt(Math.abs(c.headwindKt))} kt ${c.headwindKt >= 0 ? "headwind" : "tailwind"}, ${fmt(c.crosswindKt)} kt crosswind from the ${c.fromLeft ? "left" : "right"}\n` : "") +
    `outside air ${fmt(s.oatC)} °C   density altitude ${fmt(s.densityAltFt, 0)} ft   altimeter set ${sim.controls.altimeterInHg.toFixed(2)}`;
}, 250);
