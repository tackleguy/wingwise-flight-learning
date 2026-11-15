# TeachX Flight Simulator — architecture and rules for contributors

Read this file completely before changing anything. It is the contract that lets several people
(and AI agents) build modules in parallel without breaking each other.

## 1. What this is

A free, browser-only flight simulator for student pilots (a learning aid — **not** an
FAA-approved training device; time in it cannot be logged). One aircraft done well: a Cessna
172P-class trainer. Whole-earth terrain and imagery, every airport from open data, real weather,
and a training mode with scored lessons. Teaching value (correct procedures, honest instruments)
matters more than pretty graphics.

Hard rules from the owner:

- **Open source / open data only.** No paid services, no API keys, no signups, no Cesium ion.
  Anything new you use (library, data, texture, sound, font) must be permissively licensed
  (MIT/BSD/Apache/ISC/CC0/CC-BY/public domain), and you must record it in your notes file
  (see §9) with licence + link so it lands in `CREDITS.md`. No GPL code or assets — in particular
  **do not copy anything from FlightGear** (GPL). JSBSim (LGPL-2.1) is used as a separate,
  replaceable WebAssembly module; its modified data files stay in the repo.
- **Everything else is original work.** Generate textures, sounds and models procedurally.
- **Honesty.** Never claim something works unless you ran it. User-facing text must not overstate
  realism. Where data is estimated or synthetic (e.g. PAPI lights, estimated runways), label it.
- **Plain language** in everything a student sees. The owner is not a programmer.
- No secrets in the repo. No personal data in requests to outside services.

## 2. Tech stack

TypeScript (strict, `noUncheckedIndexedAccess`), Vite 7, React 19, Tailwind v4, vitest 3, npm.
CesiumJS 1.147 (globe), JSBSim → WebAssembly (flight physics), `geomagnetism` (WMM).
Installed and available: `three` (devDependency — offline model authoring only, do not ship it in
the app bundle), `@mapbox/vector-tile` + `pbf` (OSM vector tiles), `lucide-react` (icons).
Do **not** add other dependencies unless truly necessary; if you must, use
`flock /tmp/teachx-npm.lock npm install <pkg>` and record licence + reason in your notes.

Path alias: `@/…` → `src/…`. The site is built with `base: "./"` — **never use absolute URLs
like `/data/x.json`**; use `import.meta.env.BASE_URL` (see `loadWorldData`, `loadJsbsim`).

## 3. Directory map and ownership

```
flightsim/
  index.html, src/main.tsx      app entry
  src/core/      types.ts (THE state contract), sim.ts (Sim + SimModule), spawn.ts, defaults.ts,
                 math.ts, magvar.ts, clouds.ts (shared cloud field), events.ts, storage.ts
  src/data/      world-data.ts — airports / runways / frequencies / navaids (OurAirports)
  src/physics/   jsbsim.ts — adapter to the JSBSim WebAssembly module          [physics]
  src/world/     world.ts (CesiumJS globe), elevation.ts (terrain for render AND physics)
  src/app/       runtime.ts — creates data + sim + world and runs the frame loop
  src/dev/       basic.ts — placeholder aircraft/camera/keyboard for dev pages
  src/systems/   engine, electrical, fuel, vacuum, failures                    [systems]
  src/instruments/ indicated values with lag and errors                        [instruments]
  src/nav/       VOR/DME/ADF/COM receivers                                     [nav]
  src/weather/   real weather, presets, custom weather, gusts                  [weather]
  src/sky/       time of day, fog, clouds, precipitation, night                [sky]
  src/scenery/   runways, markings, lights, windsock, (buildings)              [scenery]
  src/views/     cameras + aircraft 3D model                                   [views]
  src/audio/     engine/wind/warning sounds, speech                            [audio]
  src/input/     keyboard, mouse, gamepad/joystick, touch                      [input]
  src/panel/     SVG cockpit panel + "explain this instrument"                 [panel]
  src/training/  lessons, scoring, tolerances, recorder, checklists (+ ui/)    [training]
  src/ui/        app shell: start screen, menus, HUD, settings, credits        [ui]
  dev/           one developer test page per module: dev/<module>.html + .ts
  tests/         vitest tests (tests/<module>/*.test.ts), tests/helpers.ts
  scripts/       build-data.mjs, copy-cesium.mjs, shot.cjs (headless browser tool)
  public/        data/ (airport database), jsbsim/ (wasm), cesium/ (generated, git-ignored), models/
  docs/notes/    one notes file per module (decisions, credits, limitations)
```

**You own only your module's folder, your `dev/<module>.*` page, your `tests/<module>/` folder
and `docs/notes/<module>.md`.** Do not edit other modules. Shared files (`src/core/*`,
`src/world/*`, `src/app/*`, `src/data/*`, `src/physics/jsbsim.ts` unless you are [physics],
`package.json`, `vite.config.ts`, `tsconfig.json`, `ARCHITECTURE.md`): only small, **additive**
changes with the Edit tool (never rewrite the file, never rename or remove existing fields),
then run the full typecheck, and list every such change in your notes file.
Other agents are editing the tree at the same time: typecheck errors in files you do not own are
not yours to fix — ignore them. **Never run git commands that change anything** (no add / commit /
checkout / stash / reset); the orchestrator commits.

## 4. The core contract

### 4.1 Sim (`src/core/sim.ts`)

One `Sim` owns everything:

| field | meaning |
| --- | --- |
| `sim.state: SimState` | the truth about the aircraft + `ind` (instrument indications), `nav`, `sys`. Same object forever — mutate fields, never replace it. |
| `sim.controls: ControlState` | everything the pilot can move or set (yoke, throttle, switches, radios, Kollsman…). Written by input devices and the panel. |
| `sim.env: Environment` | weather and time. Written by the weather module / UI. |
| `sim.settings: Settings` | user settings; change with `sim.updateSettings(patch)` (persists to localStorage). |
| `sim.events` | typed event bus (`SimEvents` in types.ts): `spawn`, `liftoff`, `touchdown`, `crash`, `stall`, `stallRecovered`, `engineStart`, `engineStop`, `pause`, `message`, `command`, `training`. |
| `sim.fdmIn: FdmInputs` | what is sent to JSBSim on the next step. The core fills it from `controls`/`env` each step; `preStep` hooks may override fields. |
| `sim.fdm: FlightModel \| null` | the JSBSim aircraft; `getProperty(name)` / `setProperty(name, v)` reach any JSBSim property. Recreated at every spawn — never keep a reference across spawns. |
| `sim.data: WorldData`, `sim.elevation: ElevationService` | airport database, terrain heights. |
| `sim.loading` | fuel per tank and cabin load used at the next spawn (weight & balance). |
| `sim.paused` / `sim.setPaused(b)`, `sim.timeScale`, `sim.spawning` | time control. |
| `sim.spawn(req)`, `sim.resetToShortFinal(nm?)` | reposition (async: loads terrain first). `sim.lastSpawn`, `sim.lastPlan`. |
| `sim.message(text, level?, speak?)` | short message for the pilot (HUD toast / instructor voice). |
| `sim.use(module)`, `sim.module<T>(name)` | register / look up a module. |
| `sim.advance(seconds)` | run physics forward instantly (tests, tools). |

A **module** is a plain object implementing `SimModule` (all hooks optional):

```ts
interface SimModule {
  readonly name: string;                       // unique: "systems", "instruments", "nav", "weather", "sky",
                                               // "scenery", "views", "audio", "input", "training"
  onSpawn?(sim, result): void;                 // after every reposition — reset your internal state here
  preStep?(sim, dt): void;                     // fixed 1/120 s step, BEFORE physics (adjust sim.fdmIn)
  postStep?(sim, dt): void;                    // fixed step, AFTER physics (derive state)
  frame?(sim, dtReal): void;                   // once per drawn frame, also while paused
  dispose?(): void;
}
```

Physics runs on a **fixed 1/120 s step**, decoupled from the frame rate. Per step:
`controls → fdmIn defaults → modules.preStep → JSBSim → truth state → core detectors → modules.postStep`.
`preStep`/`postStep` run 120×/s: keep them allocation-free and cheap (do slow work every Nth step).
Anything visual or DOM-related belongs in `frame`. Never touch the DOM or React state from steps.

Who writes what in `SimState`: the **core** writes all truth fields; **instruments** writes
`state.ind`; **nav** writes `state.nav`; **systems** writes `state.sys` (the core only sets
`sys.engineRunning`); **weather** may refine `state.inCloud` (the core sets it from
`core/clouds.ts`). Everyone else only reads. The panel must draw `state.ind` (indicated values),
never truth values.

### 4.2 Units and signs (see the header of `types.ts`)

Aviation units: feet, knots, feet/minute, degrees, inHg, US gallons, pounds, nautical miles.
Headings/tracks are **true** unless the field name ends in `Mag` (`magnetic = true − state.magVar`,
east positive; helpers in `core/magvar.ts`). Pitch + = nose up, roll + = right wing down,
`controls.elevator` + = pull, `aileron` + = roll right, `rudder` + = yaw right, `trim` + = nose up.
`controls.ignition`: 0 OFF, 1 R, 2 L, 3 BOTH, 4 START. Wind directions are where the wind blows
**from**. `fdmIn.wind*Fps` are the velocity the air moves **toward** (north/east/down, ft/s).

### 4.3 Commands

Non-flight actions (pause, change view, open the checklist…) are sent as
`sim.events.emit("command", { id })` with `id: CommandId` (types.ts). Input devices and on-screen
buttons emit them; the module that owns the behaviour listens (views handle `view-*`, the UI
handles `menu-toggle`, `help-toggle`, `pause-toggle`, …). Add new ids to `CommandId` additively.

### 4.4 World (`src/world/world.ts`)

`World` wraps a CesiumJS `CesiumWidget` (`world.widget`, `.scene`, `.camera`, `.globe`). The
simulator renders manually once per frame (`Runtime` calls `sim.frame(dt)` then `world.render()`),
so update cameras/primitives inside your module's `frame()` hook. Helpers:
`ecef(lat, lon, altFt)` and `aircraftMatrix(lat, lon, altFt, headingDeg, pitchDeg, rollDeg)` —
local axes of that matrix: **+X nose, +Y left wing, +Z up**; a glTF model authored nose **+Z**,
up **+Y** is oriented correctly by CesiumJS with this matrix. `state.altMslFt` is the height of
the aircraft's centre of gravity; the wheels touch the ground `CG_HEIGHT_FT` (4.36 ft) below it.
Heights are metres/feet above the WGS84 ellipsoid treated as MSL. Terrain for physics and for
drawing comes from the same `ElevationService` (runways are flattened in it), so use
`sim.elevation.groundFt(lat, lon)` whenever you need the ground height (may be `null` until
loaded). Input handling of the Cesium camera is disabled — modules drive `world.camera` directly.
`World.setQuality("low"|"medium"|"high")`, `world.nightLayer`, `world.setUtc(ms)` exist already.
No Cesium ion, no `Viewer` widgets, no Cesium CSS: build UI in React.

### 4.5 Shared cloud field (`src/core/clouds.ts`)

Where clouds are is defined once (noise table + thresholds) so that "inside a cloud" (physics)
and what is drawn (graphics) agree. Use `cloudDensityAt`, `layerDensity`, `CLOUD_NOISE` (upload as
texture) rather than inventing another cloud layout.

### 4.6 Data (`src/data/world-data.ts`)

`WorldData`: `getAirport(code)`, `searchAirports(q)`, `airportsNear`, `nearestAirport`,
`runwaysNear`, `navaidsNear`, `runway(i)`, `navaid(i)`. Runways with `estimated: true` have no
surveyed position in the open data (drawn through the airport reference point) — say so in the UI.

### 4.7 Persistence

`core/storage.ts` (`loadJson`, `saveJson`, `removeKey`; keys are prefixed `teachx.sim.`). No
accounts, no server storage.

## 5. Verified facts about the flight model (JSBSim c172p)

- Adapter conventions are documented at the top of `src/physics/jsbsim.ts` (JSBSim elevator/rudder/
  pitch-trim signs are opposite to TeachX's; the adapter converts).
- Gear/contact units: 0 nose wheel, 1 left main, 2 right main, 3 nose skid, 4 tail skid,
  5 left wing tip, 6 right wing tip (`gear/unit[n]/WOW`).
- Point masses `inertia/pointmass-weight-lbs[0..4]`: pilot, co-pilot, left passenger, right
  passenger, baggage. Tanks `propulsion/tank[0|1]/contents-lbs` (left, right), 6 lb/gal.
- Missing properties: `propulsion/engine/cranking`, `propulsion/engine/running` (use
  `propulsion/engine/set-running`, starter via `propulsion/starter_cmd`, `propulsion/magneto_cmd` 0–3).
- `aero/stall-hyst-norm` is a deep-stall hysteresis flag (0.09–0.36 rad), not a stall warning.
- Airborne starts are trimmed by JSBSim (`FlightModel.initialTrim`), wind is added afterwards
  (JSBSim's initial-condition wind has the opposite sign to its run-time wind).
- The atmosphere follows `env`: `modelSeaLevelPressureInHg(env)` makes an altimeter set to
  `env.qnhInHg` read field elevation at `env.stationElevFt`; `isaDeviationC(env)` shifts temperature.
- Known at the time of writing (the [physics] task fixes/validates these): the stock engine is
  too powerful (≈200 hp static, ≈1300 fpm climb instead of ≈700), and hands-off the aircraft rolls
  slowly left (no rigging to offset engine torque).

## 6. Developer test pages

Each module gets `dev/<module>.html` + `dev/<module>.ts` (copy `dev/slice.html` / `dev/slice.ts`)
that boots `Runtime`, adds `basicAircraft`/`basicChaseCamera`/`basicKeyboard` from `@/dev/basic`
where the real module is not needed, adds YOUR module, spawns somewhere and exposes
`window.sim`, `window.rt`, `window.world` for scripted checks. Run your own dev server on YOUR port:

```bash
cd flightsim
VITE_CACHE_DIR=node_modules/.vite-<module> npx vite --port <your port> --strictPort   # run in background
node scripts/shot.cjs --url "http://127.0.0.1:<port>/dev/<module>.html?apt=KSFO" --out <png> \
     --eval "sim.advance(5); return { kcas: sim.state.kcas };" --after 8000
```

`scripts/shot.cjs` opens headless Chrome with software WebGL, prints console errors and failed
requests, runs `--eval` code in the page and saves a screenshot — **look at the screenshot** (Read
the PNG) before claiming anything visual works. Software rendering gives only a few frames per
second and the sim then runs in slow motion; use `sim.advance(seconds)` in `--eval` to move
simulated time. Stop your dev server and any Chrome you started when you are done.
Allowed outside hosts in this sandbox: s3.amazonaws.com, tiles.maps.eox.at,
gibs.earthdata.nasa.gov, basemap.nationalmap.gov, tiles.openfreemap.org, aviationweather.gov,
api.weather.gov, api.open-meteo.com, davidmegginson.github.io, npm, GitHub. Others are blocked.

Tests: `npx vitest run tests/<module>` (Node; `tests/helpers.ts` gives `makeSim(elevM)` — a real
Sim with real JSBSim and the real airport database on synthetic flat terrain, no network).
Typecheck: `npx tsc --noEmit` (whole project). Do not run `npm run build` while others work.

## 7. UI conventions (panel, input, training ui, ui shell)

React 19 function components + Tailwind v4 utility classes. Dark, calm, uncluttered; large touch
targets (≥ 44 px); works from 360 px wide phones to desktops; no layout that depends on hover.
Fast-changing values (instrument needles, HUD numbers) must be updated imperatively from a
`requestAnimationFrame`/module `frame()` hook via refs — **never** `setState` every frame.
For slow UI state use small subscription hooks (poll a few times per second). Keyboard focus must
never get trapped; flight keys must not fire while the user types in a text field.

## 8. Performance budget

Target ≥ 30 fps on a mid-range laptop at "medium" quality. Per-frame JS (all modules) < 4 ms.
No per-frame allocations in hot paths; reuse Cesium scratch objects. Create/destroy Cesium
primitives rarely (batch them); scale detail with `sim.settings.quality`.

## 9. Notes file (required)

Write `docs/notes/<module>.md` with: what you built; decisions and why; **every** outside source
used (name, licence, link, how it is used); what you verified and how (commands + results); known
limitations and **what is still unrealistic**; shared-file changes you made; ideas not done.
