/**
 * Developer page for the views module: the aircraft model and the four cameras.
 *
 *   /dev/views.html?apt=KSFO&rwy=28R&kind=runway&view=chase&time=12
 *
 * URL parameters
 *   apt, rwy, kind   where to start (kind: runway | final | air | ramp)
 *   view             cockpit | chase | tower | free
 *   time             local solar time in hours (12 = noon, 21 = night)
 *   lights=1         switch all aircraft lights on
 *   panel=1          show a grey block where the 2D instrument panel will sit, and a red line at the requested horizon height
 *   hud=0            hide the text overlay (for screenshots)
 *   quality          low | medium | high
 * Mouse: drag to look, wheel to zoom, double-click to reset. Keys: see the bottom line of the overlay.
 */
import { Runtime } from "@/app/runtime";
import { utcForLocalSolarHours } from "@/core/sun";
import type { SpawnKind } from "@/core/types";
import { basicKeyboard } from "@/dev/basic";
import { createViews, type ViewMode } from "@/views";

const q = new URLSearchParams(location.search);
const hud = document.getElementById("hud")!;
const viewEl = document.getElementById("view")!;
const rt = await Runtime.create({ container: viewEl, creditContainer: document.getElementById("credits")!, onProgress: (m) => (hud.textContent = m) });
const { sim, world } = rt;
const views = sim.use(createViews(world));
sim.use(basicKeyboard());
views.attach(viewEl);
views.setMode((q.get("view") as ViewMode) ?? "chase");
sim.events.on("message", (m) => console.log("[message]", m.text));
sim.events.on("crash", (c) => console.log("[crash]", c.reason));
sim.events.on("touchdown", (t) => console.log("[touchdown]", Math.round(t.vsFpm), "fpm"));

if (q.get("lights")) Object.assign(sim.controls.lights, { beacon: true, nav: true, strobe: true, landing: true, taxi: true });
hud.textContent = "Loading terrain…";
await sim.spawn({ kind: (q.get("kind") as SpawnKind) ?? "runway", airportIdent: q.get("apt") ?? "KSFO", runwayEndId: q.get("rwy") ?? undefined });
if (q.get("time")) sim.env.utcMs = utcForLocalSolarHours(sim.env.utcMs, sim.state.lon, Number(q.get("time")));
if (q.get("quality")) world.setQuality(q.get("quality") as "low" | "medium" | "high");
if (q.get("hud") === "0") {
  hud.style.display = "none";
  document.getElementById("bar")!.style.display = "none";
}
if (q.get("panel")) {
  document.getElementById("panelmock")!.style.display = "block";
  const line = document.getElementById("horizonline")!;
  line.style.display = "block";
  line.style.top = `${33}%`;
}
rt.start();
const setTime = (hours: number) => (sim.env.utcMs = utcForLocalSolarHours(sim.env.utcMs, sim.state.lon, hours));
const setLights = (on: boolean) => Object.assign(sim.controls.lights, { beacon: on, nav: on, strobe: on, landing: on, taxi: on });
Object.assign(window, { rt, sim, world, views, setTime, setLights });

// view buttons
const bar = document.getElementById("bar")!;
const buttons: Record<string, HTMLButtonElement> = {};
const add = (label: string, fn: () => void) => {
  const b = document.createElement("button");
  b.textContent = label;
  b.addEventListener("click", fn);
  bar.appendChild(b);
  return b;
};
for (const m of ["cockpit", "chase", "tower", "free"] as ViewMode[]) buttons[m] = add(m[0]!.toUpperCase() + m.slice(1), () => sim.events.emit("command", { id: `view-${m}` as "view-cockpit" }));
add("Next view", () => sim.events.emit("command", { id: "view-next" }));
add("Reset look", () => sim.events.emit("command", { id: "view-reset" }));
add("Fly-by", () => views.flyby());
add("Lights", () => {
  const l = sim.controls.lights;
  const on = !(l.nav && l.strobe && l.landing);
  Object.assign(l, { beacon: true, nav: on, strobe: on, landing: on, taxi: on });
});
add("Noon", () => setTime(12));
add("Dusk", () => setTime(19.4));
add("Night", () => setTime(23));
add("Short final", () => void sim.resetToShortFinal());
const sync = () => {
  for (const [m, b] of Object.entries(buttons)) b.classList.toggle("on", views.mode === m);
};
views.subscribe(sync);
sync();

// keys for the views (the real input module will send the same commands)
window.addEventListener("keydown", (e) => {
  if (e.code === "KeyV") sim.events.emit("command", { id: "view-next" });
  else if (e.code === "Digit1") sim.events.emit("command", { id: "view-cockpit" });
  else if (e.code === "Digit2") sim.events.emit("command", { id: "view-chase" });
  else if (e.code === "Digit3") sim.events.emit("command", { id: "view-tower" });
  else if (e.code === "Digit4") sim.events.emit("command", { id: "view-free" });
  else if (e.code === "KeyR") sim.events.emit("command", { id: "view-reset" });
  else if (e.code === "KeyI") views.look(0, 5);
  else if (e.code === "KeyK") views.look(0, -5);
  else if (e.code === "KeyJ") views.look(-10, 0);
  else if (e.code === "KeyL") views.look(10, 0);
});

setInterval(() => {
  const s = sim.state;
  const c = sim.controls;
  hud.textContent =
    `${sim.lastSpawn?.airportIdent ?? ""} ${sim.lastSpawn?.runwayEndId ?? ""}   view: ${views.mode}${views.mode === "free" && views.freeStay ? " (parked)" : ""}   model ${views.ready ? "ready" : "loading"}   ${rt.fps.toFixed(0)} fps  tiles ${world.tilesLoaded ? "ok" : "loading"}\n` +
    `KCAS ${s.kcas.toFixed(0)}  ALT ${s.altMslFt.toFixed(0)}  AGL ${s.aglFt.toFixed(0)}  VS ${s.vsFpm.toFixed(0)}  HDG ${s.headingTrue.toFixed(0)}T  pitch ${s.pitch.toFixed(1)}  roll ${s.roll.toFixed(1)}\n` +
    `RPM ${s.rpm.toFixed(0)}  flaps ${s.flapsDeg.toFixed(0)}  thr ${(c.throttle * 100).toFixed(0)}%  ${c.parkingBrake ? "PARK BRAKE (B)" : ""}  ${s.onGround ? "ON GROUND" : "AIRBORNE"} ${s.stalled ? "STALL" : ""} ${s.crash ? "CRASH: " + s.crash.reason : ""}${sim.paused ? "  PAUSED" : ""}\n` +
    (views.mode === "tower" && views.tower ? `tower: ${views.tower.airportIdent ?? "observer"} ${views.tower.runwayName} (position is made up — the open data has no tower positions)\n` : "") +
    `arrows = yoke  A/D = rudder  W/S = throttle  F = flaps  B = park brake  P = pause  |  V = next view  1-4 = views  drag = look  wheel = zoom  R = reset`;
}, 200);
