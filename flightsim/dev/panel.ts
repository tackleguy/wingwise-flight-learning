/**
 * Developer page for the cockpit panel.
 *
 *   /dev/panel.html?static=1            the panel alone, driven by fake animated values (fast; no 3D, no physics)
 *        &ias=100&alt=3450&vs=500&pitch=5&roll=30&hdg=45&compass=45&cdi=2&flag=TO&obs=90&bug=120
 *        &rpm=2300&turn=1&ball=0.3&baro=30.12&fuelL=4&fuelR=18&oilT=190&oilP=70&egt=1400&amp=5&suction=5
 *        &night=1&lights=0.6&power=0&avionics=0&attflag=1&dgflag=1&stall=1&ident=SFO&dme=12.4&gs=98
 *        &explain=airspeed (opens the card) or &explain=1 (explain mode only) &hidden=1 &anim=0
 *
 *   /dev/panel.html?apt=KSFO&rwy=28R&kind=runway     the panel over the 3D view with real physics and a
 *        stand-in instruments module (copies truth into state.ind — the real module replaces it in the app)
 *
 * window.sim, window.panelDev (helpers for scripted checks) and window.panelReady are exposed.
 */
import { StrictMode, createElement as h, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "@/styles.css";
import { clamp, norm360 } from "@/core/math";
import { Sim } from "@/core/sim";
import type { SpawnKind } from "@/core/types";
import { loadWorldData } from "@/data/world-data";
import { CockpitPanel, ExplainCard, isInstrumentId, panelStats, panelStubInstruments, type InstrumentId, type PanelMetrics } from "@/panel";
import { ElevationService } from "@/world/elevation";

const q = new URLSearchParams(location.search);
const isStatic = q.get("static") === "1";
const hud = document.getElementById("hud")!;
const num = (name: string): number | null => {
  const v = q.get(name);
  if (v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

interface DevState {
  coverage: number;
  metrics: PanelMetrics | null;
  explainMode: boolean;
  card: InstrumentId | null;
  commands: string[];
  messages: string[];
}
const dev: DevState = { coverage: 0, metrics: null, explainMode: false, card: null, commands: [], messages: [] };

let sim: Sim;

if (isStatic) {
  document.body.classList.add("static");
  hud.textContent = "Loading…";
  const data = await loadWorldData();
  sim = new Sim({ data, elevation: new ElevationService(null, async () => new Float32Array(256 * 256)) });
  startFake(sim);
  hud.textContent = "static panel test — fake values";
  if (q.get("hud") === "0") hud.style.display = "none";
} else {
  const { Runtime } = await import("@/app/runtime");
  const { basicAircraft, basicChaseCamera, basicKeyboard } = await import("@/dev/basic");
  const rt = await Runtime.create({ container: document.getElementById("view")!, creditContainer: document.getElementById("credits")!, onProgress: (m) => (hud.textContent = m) });
  sim = rt.sim;
  const world = rt.world;
  sim.use(basicKeyboard());
  sim.use(basicAircraft(world));
  sim.use(basicChaseCamera(world));
  // Stand-in for the instruments / systems / nav modules (stands down if the real ones are registered).
  sim.use(panelStubInstruments());
  hud.textContent = "Loading terrain…";
  await sim.spawn({ kind: (q.get("kind") as SpawnKind) ?? "runway", airportIdent: q.get("apt") ?? "KSFO", runwayEndId: q.get("rwy") ?? undefined });
  if (q.get("quality")) world.setQuality(q.get("quality") as "low" | "medium" | "high");
  if (num("night") === 1) sim.env.utcMs = Date.UTC(2026, 5, 21, 8, 0, 0); // midnight in California
  rt.start();
  Object.assign(window, { rt, world });
  setInterval(() => {
    const s = sim.state;
    hud.textContent =
      `TRUTH  kcas ${s.kcas.toFixed(0)}  alt ${s.altMslFt.toFixed(0)}  vs ${s.vsFpm.toFixed(0)}  hdgT ${s.headingTrue.toFixed(0)}  var ${s.magVar.toFixed(1)}\n` +
      `pitch ${s.pitch.toFixed(1)}  roll ${s.roll.toFixed(1)}  rpm ${s.rpm.toFixed(0)}  flaps ${s.flapsDeg.toFixed(0)}  ${rt.fps.toFixed(0)} fps\n` +
      `panel covers ${(dev.coverage * 100).toFixed(0)}% (${dev.metrics?.mode ?? "hidden"})   arrows yoke · W/S throttle · F flaps · B park brake`;
  }, 250);
}

sim.events.on("command", (e) => {
  dev.commands.push(e.id);
  if (dev.commands.length > 50) dev.commands.shift();
});
sim.events.on("message", (e) => {
  dev.messages.push(e.text);
  console.log("[message]", e.text);
});

// ---------------------------------------------------------------- React shell

function App() {
  const first = q.get("explain");
  const [explainMode, setExplainMode] = useState(first !== null);
  const [card, setCard] = useState<InstrumentId | null>(isInstrumentId(first) ? first : null);
  dev.explainMode = explainMode;
  dev.card = card;
  useEffect(
    () =>
      sim.events.on("command", (e) => {
        if (e.id !== "explain-toggle") return;
        setExplainMode((v) => {
          if (v) setCard(null);
          return !v;
        });
      }),
    [],
  );
  useEffect(() => {
    Object.assign(dev, { setCard, setExplainMode });
  }, []);
  return h(
    "div",
    { style: { position: "absolute", inset: 0 } },
    h(CockpitPanel, {
      sim,
      explainMode,
      onExplain: setCard,
      defaultHidden: q.get("hidden") === "1",
      onCoverage: (f: number, m: PanelMetrics | null) => {
        dev.coverage = f;
        dev.metrics = m;
      },
    }),
    card ? h(ExplainCard, { id: card, sim, onClose: () => setCard(null) }) : null,
  );
}

createRoot(document.getElementById("ui")!).render(h(StrictMode, null, h(App)));
Object.assign(window, { sim, panelDev: dev, panelStats });
requestAnimationFrame(() => requestAnimationFrame(() => Object.assign(window, { panelReady: true })));

// ---------------------------------------------------------------- fake values for the static mode

function startFake(s: Sim): void {
  const st = s.state;
  const c = s.controls;
  const anim = q.get("anim") !== "0";
  // start-up positions from the URL
  if (num("lights") !== null) c.lights.panel = clamp(num("lights")!, 0, 1);
  if (num("baro") !== null) c.altimeterInHg = num("baro")!;
  if (num("obs") !== null) c.obs1 = norm360(num("obs")!);
  if (num("bug") !== null) c.headingBugMag = norm360(num("bug")!);
  if (num("throttle") !== null) c.throttle = clamp(num("throttle")!, 0, 1);
  else c.throttle = 0.7;
  if (num("mixture") !== null) c.mixture = clamp(num("mixture")!, 0, 1);
  if (num("trim") !== null) c.trim = clamp(num("trim")!, -1, 1);
  if (num("flapIndex") !== null) c.flapIndex = clamp(Math.round(num("flapIndex")!), 0, 3);
  if (num("carb") === 1) c.carbHeat = true;
  if (num("pbrake") === 1) c.parkingBrake = true;
  if (num("ign") !== null) c.ignition = clamp(Math.round(num("ign")!), 0, 4) as 0 | 1 | 2 | 3 | 4;
  if (q.get("fuelsel")) c.fuelSelector = q.get("fuelsel") as typeof c.fuelSelector;
  if (q.get("xpdr")) c.xpdr.code = q.get("xpdr")!;
  if (q.get("mode")) c.xpdr.mode = q.get("mode") as typeof c.xpdr.mode;
  if (num("com") !== null) c.com1.active = num("com")!;
  if (num("nav") !== null) c.nav1.active = num("nav")!;
  if (num("power") === 0) c.masterBattery = c.masterAlternator = false;
  if (num("avionics") === 0) c.avionicsMaster = false;
  c.lights.nav = true;
  // day or night: the sun is worked out for latitude 0, longitude 0
  st.lat = 0;
  st.lon = 0;
  const night = num("night") ?? 0;
  s.env.utcMs = night >= 1 ? Date.UTC(2026, 2, 21, 0, 0, 0) : night > 0 ? Date.UTC(2026, 2, 21, 18, 4, 0) : Date.UTC(2026, 2, 21, 12, 0, 0);
  st.flapsDeg = num("flaps") ?? s.aircraft.flapDetentsDeg[c.flapIndex] ?? 0;

  const t0 = performance.now();
  let last = t0;
  const pick = (name: string, animated: number, still: number) => num(name) ?? (anim ? animated : still);
  const tick = (now: number) => {
    requestAnimationFrame(tick);
    const t = (now - t0) / 1000;
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    const ind = st.ind;
    const sys = st.sys;
    // a tiny electrical system so the switches can be tested
    const volts = num("volts");
    sys.busVolts = c.masterBattery ? (volts ?? (c.masterAlternator ? 28 : 24)) : 0;
    sys.alternatorOnline = c.masterBattery && c.masterAlternator;
    sys.avionicsPowered = c.avionicsMaster && sys.busVolts > 10;
    sys.engineRunning = true;
    sys.stallHorn = num("stall") === 1;
    // flaps travel like the real electric flaps
    const target = num("flaps") ?? s.aircraft.flapDetentsDeg[c.flapIndex] ?? 0;
    st.flapsDeg += clamp(target - st.flapsDeg, -3.3 * dt, 3.3 * dt);

    const roll = pick("roll", 25 * Math.sin(t * 0.23), 0);
    ind.ias = pick("ias", 100 + 58 * Math.sin(t * 0.31), 100);
    ind.alt = pick("alt", 3450 + 900 * Math.sin(t * 0.05), 3450);
    ind.vs = pick("vs", 900 * Math.cos(t * 0.21), 0);
    ind.attPitch = pick("pitch", 7 * Math.sin(t * 0.37), 0);
    ind.attRoll = roll;
    ind.attFlag = num("attflag") === 1;
    const hdg = norm360(pick("hdg", t * 7, 0));
    ind.dgMag = norm360(hdg + c.dgAdjustDeg);
    ind.dgFlag = num("dgflag") === 1;
    ind.compassMag = norm360(num("compass") ?? hdg);
    ind.turnRate = pick("turn", roll / 17, 0);
    ind.ball = pick("ball", 0.6 * Math.sin(t * 0.8), 0);
    ind.turnFlag = false;
    ind.tachRpm = pick("rpm", 800 + 1900 * c.throttle + 40 * Math.sin(t * 1.3), 800 + 1900 * c.throttle);
    ind.hobbs = 1234.5 + t / 3600;
    ind.fuelLeftGal = pick("fuelL", 14 - (t * 0.02) % 14, 14);
    ind.fuelRightGal = pick("fuelR", 9, 9);
    ind.oilTempF = pick("oilT", 180 + 20 * Math.sin(t * 0.1), 180);
    ind.oilPressPsi = pick("oilP", 74 + 6 * Math.sin(t * 0.17), 74);
    ind.egtF = pick("egt", 1350 + 150 * Math.sin(t * 0.13) - 200 * (c.mixture - 0.8), 1350);
    ind.suctionInHg = pick("suction", 5 + 0.2 * Math.sin(t * 0.4), 5);
    ind.ammeterA = pick("amp", sys.alternatorOnline ? 4 + 2 * Math.sin(t * 0.3) : -14, sys.alternatorOnline ? 4 : -14);
    ind.clockUtcSec = ((s.env.utcMs / 1000) % 86400) + t;
    ind.oatC = pick("oat", 15, 15);

    const v = st.nav.nav1;
    const flag = q.get("flag");
    v.valid = sys.avionicsPowered && flag !== "OFF";
    v.flag = !v.valid ? "OFF" : flag === "TO" || flag === "FROM" ? flag : Math.sin(t * 0.05) > 0 ? "TO" : "FROM";
    v.cdiDots = pick("cdi", 4.5 * Math.sin(t * 0.19), 0);
    v.ident = q.get("ident") ?? "OAK";
    v.dmeNm = num("dme") ?? (q.get("dme") === "none" ? null : 12.4 + Math.sin(t * 0.1));
    v.dmeGsKt = num("gs") ?? (v.dmeNm === null ? null : 98);
  };
  requestAnimationFrame(tick);
}
