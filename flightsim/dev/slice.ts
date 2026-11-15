/**
 * Developer page: the simulator core only (world + physics + spawn), with a placeholder aircraft,
 * a chase camera and keyboard controls.   /dev/slice.html?apt=KSFO&rwy=28R&kind=runway
 */
import { Runtime } from "@/app/runtime";
import { basicAircraft, basicChaseCamera, basicKeyboard } from "@/dev/basic";
import type { SpawnKind } from "@/core/types";

const q = new URLSearchParams(location.search);
const hud = document.getElementById("hud")!;
const rt = await Runtime.create({
  container: document.getElementById("view")!,
  creditContainer: document.getElementById("credits")!,
  onProgress: (m) => (hud.textContent = m),
});
const { sim, world } = rt;
sim.use(basicKeyboard());
sim.use(basicAircraft(world));
sim.use(basicChaseCamera(world));
sim.events.on("message", (m) => console.log("[message]", m.text));
sim.events.on("crash", (c) => console.log("[crash]", c.reason));
sim.events.on("touchdown", (t) => console.log("[touchdown]", Math.round(t.vsFpm), "fpm"));
sim.events.on("liftoff", (l) => console.log("[liftoff]", Math.round(l.kcas), "kt"));
hud.textContent = "Loading terrain…";
await sim.spawn({ kind: (q.get("kind") as SpawnKind) ?? "runway", airportIdent: q.get("apt") ?? "KSFO", runwayEndId: q.get("rwy") ?? undefined });
if (q.get("quality")) world.setQuality(q.get("quality") as "low" | "medium" | "high");
rt.start();
Object.assign(window, { rt, sim, world });

setInterval(() => {
  const s = sim.state;
  const c = sim.controls;
  hud.textContent =
    `${sim.lastSpawn?.airportIdent ?? ""} ${sim.lastSpawn?.runwayEndId ?? ""}   ${rt.fps.toFixed(0)} fps  tiles ${world.tilesLoaded ? "ok" : "loading"} (${rt.elevation.pendingTiles})\n` +
    `KCAS ${s.kcas.toFixed(0)}  ALT ${s.altMslFt.toFixed(0)}  AGL ${s.aglFt.toFixed(0)}  VS ${s.vsFpm.toFixed(0)}  HDG ${s.headingTrue.toFixed(0)}T\n` +
    `pitch ${s.pitch.toFixed(1)}  roll ${s.roll.toFixed(1)}  RPM ${s.rpm.toFixed(0)}  flaps ${s.flapsDeg.toFixed(0)}  thr ${(c.throttle * 100).toFixed(0)}%  ${c.parkingBrake ? "PARK BRAKE (B)" : ""}\n` +
    `${s.onGround ? "ON GROUND" : "AIRBORNE"}  ${s.stalled ? "STALL" : ""}  ${s.crash ? "CRASH: " + s.crash.reason : ""}${sim.paused ? "  PAUSED" : ""}\n` +
    `arrows = yoke   A/D = rudder   W/S = throttle   F = flaps   B = park brake   Space = brakes   P = pause`;
}, 200);
