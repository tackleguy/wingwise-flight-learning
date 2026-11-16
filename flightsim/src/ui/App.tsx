/**
 * SkyReady Flight Simulator — the app shell: start screen (aircraft, airport search, where to start,
 * weather, time of day), the 3D world with the cockpit panel, and a small in-flight toolbar.
 */
import { useEffect, useRef, useState } from "react";
import { AIRCRAFT_LIST, getAircraft, type AircraftId } from "@/aircraft/catalog";
import { Runtime } from "@/app/runtime";
import type { SpawnKind } from "@/core/types";
import type { AirportSummary } from "@/data/world-data";
import { basicKeyboard } from "@/dev/basic";
import { createInstruments } from "@/instruments";
import { CockpitPanel, ExplainCard, type InstrumentId } from "@/panel";
import { createScenery } from "@/scenery";
import { createSky, type Sky } from "@/sky";
import { createFailureEffects } from "@/systems/failures";
import { PREFIX as STORAGE_PREFIX } from "@/core/storage";
import { RESULTS_KEY, createTraining, getTest, makeInspection, prepareTestFlight, type InspectionItem, type StoredResult, type TestDef, type TestResult, type TrainingModule } from "@/training";
import { Debrief } from "@/training/ui/Debrief";
import { TestHud } from "@/training/ui/TestHud";
import { TestsMenu } from "@/training/ui/TestsMenu";
import { Walkaround } from "@/training/ui/Walkaround";
import { createViews, type ViewsModule } from "@/views";
import { createWeather, type WeatherApi } from "@/weather";
import { ATTRIBUTION } from "@/world/world";

interface Mods {
  rt: Runtime;
  weather: WeatherApi;
  sky: Sky;
  views: ViewsModule;
  training: TrainingModule;
}

const STARTS: { kind: SpawnKind; label: string }[] = [
  { kind: "runway", label: "On the runway" },
  { kind: "final", label: "Short final" },
  { kind: "air", label: "In the air" },
  { kind: "ramp", label: "Parked, engine off" },
];
const TIMES: { label: string; hours: number | null }[] = [
  { label: "Right now", hours: null },
  { label: "Morning", hours: 8 },
  { label: "Midday", hours: 12 },
  { label: "Sunset", hours: 18.5 },
  { label: "Night", hours: 23 },
];
const DISCLAIMER = "A learning aid — NOT an FAA-approved training device. Time in this simulator cannot be logged.";
const KEYS: [string, string][] = [
  ["Arrow keys", "Yoke: pitch (up/down) and roll (left/right)"],
  ["A / D", "Rudder left / right (also steers on the ground)"],
  ["W / S", "Throttle up / down"],
  ["F / Shift+F", "Flaps: down one notch / up one notch"],
  ["G", "Landing gear up / down (aircraft with retractable gear)"],
  ["B", "Parking brake on / off"],
  ["Space", "Wheel brakes (hold)"],
  ["V", "Next view (cockpit, chase, tower, free)"],
  ["Mouse drag / wheel", "Look around / zoom"],
  ["P", "Pause"],
  ["R", "Reset to short final"],
  ["M", "Menu (pick another airport)"],
];
const btn = "rounded-md bg-slate-800/85 px-3 py-1.5 text-sm font-medium text-slate-100 hover:bg-slate-700 active:bg-slate-600";

export function App() {
  const worldEl = useRef<HTMLDivElement>(null);
  const mods = useRef<Mods | null>(null);
  const [status, setStatus] = useState("Loading…");
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [menu, setMenu] = useState(true);
  const [flying, setFlying] = useState(false);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState(() => new URLSearchParams(location.search).get("apt") ?? "");
  const [results, setResults] = useState<AirportSummary[]>([]);
  const [airport, setAirport] = useState<AirportSummary | null>(null);
  const [kind, setKind] = useState<SpawnKind>("runway");
  const [wx, setWx] = useState("real");
  const [time, setTime] = useState(0);
  const [toast, setToast] = useState("");
  const [help, setHelp] = useState(false);
  const [credits, setCredits] = useState(false);
  const [explain, setExplain] = useState(false);
  const [card, setCard] = useState<InstrumentId | null>(null);
  const [paused, setPaused] = useState(false);
  const [hud, setHud] = useState("");
  /** Aircraft chosen in the menu, and the one actually flying (the panel is rebuilt when it changes). */
  const [aircraftId, setAircraftId] = useState<AircraftId>("c172p");
  const [flownId, setFlownId] = useState<AircraftId>("c172p");
  // Tests mode
  const [tab, setTab] = useState<"fly" | "tests">(() => (new URLSearchParams(location.search).get("tab") === "tests" ? "tests" : "fly"));
  const [result, setResult] = useState<TestResult | null>(null);
  const [walk, setWalk] = useState<InspectionItem[] | null>(null);
  const [scores, setScores] = useState<Record<string, StoredResult>>({});

  // ---- create the simulator once
  useEffect(() => {
    let dead = false;
    let created: Runtime | null = null;
    const offs: (() => void)[] = [];
    (async () => {
      try {
        const rt = await Runtime.create({ container: worldEl.current!, onProgress: (m) => !dead && setStatus(m) });
        created = rt;
        if (dead) return rt.destroy();
        const { sim, world } = rt;
        const weather = sim.use(createWeather());
        sim.use(createInstruments());
        const sky = sim.use(createSky(world));
        sim.use(createScenery(world));
        const views = sim.use(createViews(world));
        sim.use(basicKeyboard());
        // Electrical system (battery, alternator, buses) and what injected failures do (see src/systems/failures.ts).
        sim.use(createFailureEffects());
        // Tests mode: scored exercises (src/training)
        const training = sim.use(createTraining());
        setScores(training.results());
        // The website merges the scores saved in the pilot's account into this device's list
        // (from another page or tab of the same site): show them as soon as they arrive.
        const onStorage = (e: StorageEvent) => {
          if (e.key === null || e.key === STORAGE_PREFIX + RESULTS_KEY) setScores(training.results());
        };
        window.addEventListener("storage", onStorage);
        offs.push(() => window.removeEventListener("storage", onStorage));
        offs.push(
          training.onResult((r) => {
            setScores(training.results());
            setResult(r);
            if (r.id !== "walkaround") sim.setPaused(true);
          }),
        );
        offs.push(views.attach(worldEl.current!));
        offs.push(sim.events.on("message", (m) => setToast(m.text)));
        offs.push(sim.events.on("pause", (p) => setPaused(p.paused)));
        offs.push(sim.events.on("crash", () => setToast("The aircraft was damaged. Press R to restart on short final, or M for the menu.")));
        offs.push(sim.events.on("stall", () => setToast("STALL — lower the nose, add full power, level the wings.")));
        mods.current = { rt, weather, sky, views, training };
        (window as unknown as { skyready: unknown }).skyready = { rt, sim, world, weather, sky, views };
        const apt = sim.data.getAirport(new URLSearchParams(location.search).get("apt") ?? "KPAO");
        if (apt) setAirport(apt);
        // ?aircraft=<id> picks an aircraft from a link; otherwise the one flown last time
        const fromUrl = new URLSearchParams(location.search).get("aircraft");
        setAircraftId(getAircraft(fromUrl ?? sim.aircraft.id).id);
        setReady(true);
        setStatus("");
      } catch (e) {
        console.error(e);
        if (!dead) setError("The simulator could not start in this browser. It needs WebGL (3D graphics) switched on. " + String(e));
      }
    })();
    return () => {
      dead = true;
      offs.forEach((f) => f());
      created?.destroy();
      mods.current = null;
    };
  }, []);

  // ---- the walk-around covers the whole screen: pause the flight and stop drawing the 3D world meanwhile
  const walking = walk !== null;
  useEffect(() => {
    const m = mods.current;
    if (!walking || !m) return;
    m.rt.sim.setPaused(true);
    m.rt.stop();
    return () => {
      if (flying) m.rt.start();
    };
  }, [walking, flying]);

  // ---- airport search
  useEffect(() => {
    const m = mods.current;
    if (!ready || !m) return;
    setResults(query.trim().length >= 2 ? m.rt.sim.data.searchAirports(query, 8) : []);
  }, [query, ready]);

  // ---- read-outs a few times a second
  useEffect(() => {
    if (!flying) return;
    const id = setInterval(() => {
      const m = mods.current;
      if (!m) return;
      const s = m.rt.sim.state;
      const ac = m.rt.sim.aircraft;
      const gear = ac.retractableGear ? ` · gear ${s.gearPosNorm > 0.98 ? "down" : s.gearPosNorm < 0.02 ? "up" : "moving"}` : "";
      setHud(`${ac.shortName} · ${Math.round(s.kcas)} kt · ${Math.round(s.altMslFt)} ft${gear} · view: ${m.views.mode}`);
    }, 300);
    return () => clearInterval(id);
  }, [flying]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(""), 7000);
    return () => clearTimeout(id);
  }, [toast]);

  const reset = () => {
    const m = mods.current;
    if (m && flying) void m.rt.sim.resetToShortFinal().catch((e) => setToast(String(e)));
  };

  // ---- extra keys
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const m = mods.current;
      if (!m || !flying || menu || e.repeat || (e.target as HTMLElement)?.tagName === "INPUT") return;
      if (e.code === "KeyV") m.views.next();
      else if (e.code === "KeyR") reset();
      else if (e.code === "KeyM") setMenu(true);
      else if (e.code === "KeyH") setHelp((h) => !h);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const fly = async () => {
    const m = mods.current;
    if (!m || !airport || busy) return;
    setBusy(true);
    try {
      const { sim } = m.rt;
      m.training.clear();
      setResult(null);
      sim.setAircraft(aircraftId);
      if (wx === "real") {
        setStatus("Getting the real weather…");
        const r = await m.weather.loadRealWeather(airport.lat, airport.lon, airport.ident);
        setToast(r.message);
      } else m.weather.applyPreset(wx);
      setStatus("Loading the terrain…");
      await sim.spawn({ kind, airportIdent: airport.ident });
      const hours = TIMES[time]?.hours;
      if (hours != null) m.sky.setLocalSolarTime(hours);
      m.views.setMode("cockpit");
      sim.setPaused(false);
      m.rt.start();
      setFlownId(sim.aircraft.id);
      setFlying(true);
      setMenu(false);
    } catch (e) {
      console.error(e);
      setToast("Could not start there: " + String(e));
    } finally {
      setStatus("");
      setBusy(false);
    }
  };

  /** Start a test: the walk-around opens its inspection; flying tests place the aircraft and begin. */
  const startTest = async (def: TestDef) => {
    const md = mods.current;
    if (!md || busy) return;
    setResult(null);
    md.training.clear();
    if (def.walkaround) {
      setWalk(makeInspection());
      setMenu(false);
      return;
    }
    setBusy(true);
    try {
      setStatus("Preparing the test…");
      await prepareTestFlight(md.rt.sim, md.weather, md.sky, def);
      md.training.begin(def, md.rt.sim);
      md.views.setMode("cockpit");
      md.rt.sim.setPaused(false);
      md.rt.start();
      setAircraftId("c172p");
      setFlownId("c172p");
      setFlying(true);
      setMenu(false);
      setToast(`Test started: ${def.title}. The test panel is at the top.`);
    } catch (e) {
      console.error(e);
      setToast("Could not start the test: " + String(e));
    } finally {
      setStatus("");
      setBusy(false);
    }
  };

  const m = mods.current;
  return (
    <div className="fixed inset-0 overflow-hidden bg-slate-950 text-slate-100 select-none">
      <div ref={worldEl} className="absolute inset-0" />

      {flying && m && (
        <>
          <CockpitPanel key={flownId} sim={m.rt.sim} explainMode={explain} onExplain={setCard} onCoverage={(f) => m.views.setCockpitHorizonFraction(f > 0 ? Math.max(0.2, (1 - f) * 0.62) : 0.5)} />
          <div className="absolute left-2 top-2 z-20 flex flex-wrap items-center gap-1.5">
            <button className={btn} onClick={() => setMenu(true)}>Menu</button>
            <button className={btn} onClick={() => m.views.next()}>View</button>
            <button className={btn} onClick={() => m.rt.sim.setPaused(!m.rt.sim.paused)}>{paused ? "Resume" : "Pause"}</button>
            <button className={btn} onClick={reset}>Short final</button>
            <button className={`${btn} ${explain ? "!bg-sky-600" : ""}`} onClick={() => setExplain((x) => !x)}>Explain</button>
            <button className={btn} onClick={() => setHelp(true)}>Keys</button>
            <span className="rounded-md bg-slate-900/70 px-2 py-1 text-xs tabular-nums text-slate-200">{hud}</span>
          </div>
          <TestHud training={m.training} />
          {explain && !card && <div className="absolute left-1/2 top-14 z-20 -translate-x-1/2 rounded-md bg-sky-700/90 px-3 py-1.5 text-sm">Tap any instrument to have it explained.</div>}
          {paused && <div className="absolute left-1/2 top-1/3 z-20 -translate-x-1/2 rounded-lg bg-slate-900/85 px-5 py-3 text-lg font-semibold">Paused — press P to continue</div>}
          {card && <ExplainCard id={card} sim={m.rt.sim} onClose={() => setCard(null)} />}
        </>
      )}

      {toast && !menu && <div className="absolute right-2 top-2 z-30 max-w-sm rounded-md bg-slate-900/90 px-3 py-2 text-sm shadow-lg">{toast}</div>}

      {menu && (
        <div className="absolute inset-0 z-40 grid place-items-center overflow-y-auto bg-slate-950/80 p-4 select-text">
          <div className="w-full max-w-xl rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl">
            <h1 className="flex items-center gap-2.5 text-2xl font-semibold">
              <img src="./favicon.svg" alt="" width={32} height={32} className="shrink-0" />
              SkyReady Flight Simulator
            </h1>
            <p className="mt-1 text-sm text-slate-300">Fly ten aircraft — from a Cessna trainer to an airliner — with FlightGear's flight physics, from any airport in the world. Free, in your browser.</p>
            <p className="mt-3 rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">{DISCLAIMER}</p>

            {error ? (
              <p className="mt-4 text-sm text-red-300">{error}</p>
            ) : !ready ? (
              <p className="mt-4 text-sm text-slate-300">{status}</p>
            ) : (
              <>
                <div className="mt-4 grid grid-cols-2 gap-1 rounded-lg bg-slate-800 p-1" role="tablist">
                  {(["fly", "tests"] as const).map((k) => (
                    <button key={k} role="tab" aria-selected={tab === k} data-tab={k} className={`min-h-10 rounded-md text-sm font-semibold ${tab === k ? "bg-sky-600" : "hover:bg-slate-700"}`} onClick={() => setTab(k)}>
                      {k === "fly" ? "Free flight" : "Tests"}
                    </button>
                  ))}
                </div>
                {tab === "tests" ? (
                  <>
                    <TestsMenu results={scores} busy={busy} onStart={(d) => void startTest(d)} />
                    {busy && <p className="mt-2 text-sm text-slate-300">{status}</p>}
                    <div className="mt-4 flex flex-wrap gap-2">
                      {flying && <button className={btn} onClick={() => setMenu(false)}>Back to flight</button>}
                      <button className={btn} onClick={() => setHelp(true)}>Controls</button>
                    </div>
                  </>
                ) : (
                <>
                <label className="mt-4 block text-sm font-medium">Aircraft</label>
                <div className="mt-1 grid grid-cols-2 gap-1.5 sm:grid-cols-5" role="radiogroup" aria-label="Aircraft">
                  {AIRCRAFT_LIST.map((a) => (
                    <button
                      key={a.id}
                      role="radio"
                      aria-checked={aircraftId === a.id}
                      data-aircraft={a.id}
                      className={`min-h-11 rounded-md px-2 py-1.5 text-left text-xs leading-tight ${aircraftId === a.id ? "bg-sky-600" : "bg-slate-800 hover:bg-slate-700"}`}
                      onClick={() => setAircraftId(a.id)}
                    >
                      <span className="block text-sm font-semibold">{a.shortName}</span>
                      <span className="block text-slate-300">{a.category}</span>
                    </button>
                  ))}
                </div>
                {(() => {
                  const a = getAircraft(aircraftId);
                  return (
                    <div className="mt-1.5 rounded-md bg-slate-800/60 px-3 py-2 text-sm">
                      <p><b>{a.name}.</b> {a.blurb}</p>
                      <p className="mt-1 text-slate-300"><b>Take-off:</b> {a.tips}</p>
                      <p className="mt-1 text-xs text-slate-400">{a.realism}</p>
                    </div>
                  );
                })()}

                <label className="mt-4 block text-sm font-medium">Airport</label>
                <input
                  className="mt-1 w-full rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-sm outline-none focus:border-sky-400"
                  placeholder="Search by name, city or code (e.g. Heathrow, KSFO)"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                {results.length > 0 && (
                  <ul className="mt-1 max-h-44 overflow-y-auto rounded-md border border-slate-700 bg-slate-800 text-sm">
                    {results.map((a) => (
                      <li key={a.ident}>
                        <button className="block w-full px-3 py-1.5 text-left hover:bg-slate-700" onClick={() => { setAirport(a); setQuery(""); }}>
                          <b>{a.ident}</b> — {a.name}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="mt-1 text-sm text-sky-300">{airport ? `Selected: ${airport.ident} — ${airport.name}` : "No airport selected yet."}</p>

                <label className="mt-3 block text-sm font-medium">Start</label>
                <div className="mt-1 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                  {STARTS.map((s) => (
                    <button key={s.kind} className={`rounded-md px-2 py-2 text-sm ${kind === s.kind ? "bg-sky-600" : "bg-slate-800 hover:bg-slate-700"}`} onClick={() => setKind(s.kind)}>{s.label}</button>
                  ))}
                </div>

                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium">Weather</label>
                    <select className="mt-1 w-full rounded-md border border-slate-600 bg-slate-800 px-2 py-2 text-sm" value={wx} onChange={(e) => setWx(e.target.value)}>
                      <option value="real">Real weather now</option>
                      {m?.weather.presets().map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium">Time of day</label>
                    <select className="mt-1 w-full rounded-md border border-slate-600 bg-slate-800 px-2 py-2 text-sm" value={time} onChange={(e) => setTime(Number(e.target.value))}>
                      {TIMES.map((t, i) => <option key={t.label} value={i}>{t.label}</option>)}
                    </select>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <button className="rounded-md bg-emerald-600 px-5 py-2 font-semibold hover:bg-emerald-500 disabled:opacity-50" disabled={!airport || busy} onClick={() => void fly()}>{busy ? status || "Starting…" : "Fly"}</button>
                  {flying && <button className={btn} onClick={() => setMenu(false)}>Back to flight</button>}
                  <button className={btn} onClick={() => setHelp(true)}>Controls</button>
                  <button className={btn} onClick={() => setCredits(true)}>Credits</button>
                </div>
                </>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {walk && m && (
        <Walkaround
          items={walk}
          onDone={(r) => {
            setWalk(null);
            m.training.record(r);
          }}
          onCancel={() => {
            setWalk(null);
            setTab("tests");
            setMenu(true);
          }}
        />
      )}

      {result && m && (
        <Debrief
          result={result}
          def={getTest(result.id)}
          onRetry={() => {
            const d = getTest(result.id);
            setResult(null);
            if (d) void startTest(d);
          }}
          onTests={() => {
            setResult(null);
            m.training.clear();
            setTab("tests");
            setMenu(true);
          }}
          onClose={
            flying && result.id !== "walkaround"
              ? () => {
                  setResult(null);
                  m.training.clear();
                  m.rt.sim.setPaused(false);
                }
              : null
          }
        />
      )}

      {(help || credits) && (
        <div className="absolute inset-0 z-50 grid place-items-center overflow-y-auto bg-slate-950/80 p-4 select-text" onClick={() => { setHelp(false); setCredits(false); }}>
          <div className="w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 p-5 text-sm" onClick={(e) => e.stopPropagation()}>
            {help ? (
              <>
                <h2 className="text-lg font-semibold">Controls</h2>
                <table className="mt-2 w-full"><tbody>
                  {KEYS.map(([k, d]) => <tr key={k} className="border-t border-slate-800"><td className="py-1 pr-3 font-mono text-sky-300">{k}</td><td className="py-1">{d}</td></tr>)}
                </tbody></table>
                <p className="mt-2 text-slate-300">Take-off in the {getAircraft(m?.rt.sim.aircraft.id).name}: {getAircraft(m?.rt.sim.aircraft.id).tips}</p>
                <p className="mt-1 text-slate-400">The parking brake is B. Aircraft with a constant-speed propeller keep the propeller lever fully forward; the throttle moves all engines together.</p>
              </>
            ) : (
              <>
                <h2 className="text-lg font-semibold">SkyReady Flight Simulator — credits</h2>
                <p className="mt-2 text-amber-200">{DISCLAIMER}</p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-slate-300">
                  <li>Flight physics: JSBSim (LGPL-2.1) as built into FlightGear 2024.2 (gitlab.com/flightgear/flightgear), compiled to WebAssembly; flight models from JSBSim's aircraft collection (the Cessna 172P tuned by SkyReady; Cessna 310 and F-16 files are GPL)</li>
                  <li>Aircraft 3D models: FlightGear hangars (FGData and FGAddon), GPL — authors and licences in public/models/fg/CREDITS.md</li>
                  <li>3D globe: CesiumJS (Apache-2.0)</li>
                  <li>{ATTRIBUTION.terrain}</li>
                  <li dangerouslySetInnerHTML={{ __html: `Imagery: ${ATTRIBUTION.sentinel}; ${ATTRIBUTION.blueMarble}; ${ATTRIBUTION.usgs}; ${ATTRIBUTION.nightLights}` }} />
                  <li>Airports, runways and navaids: OurAirports (public domain)</li>
                  <li>Weather: aviationweather.gov (NOAA), api.weather.gov, Open-Meteo (CC BY 4.0)</li>
                  <li>Magnetic variation: NOAA World Magnetic Model</li>
                </ul>
                <p className="mt-2 text-slate-400">Full list with licences: CREDITS.md in the project.</p>
              </>
            )}
            <button className={`${btn} mt-3`} onClick={() => { setHelp(false); setCredits(false); }}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
