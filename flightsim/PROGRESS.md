# Progress log (for picking the work up in a new session)

**Read first:** `ARCHITECTURE.md` (contract and rules), `DECISIONS.md`, `CREDITS.md`.

## Done
- Scaffold: Vite + React + TS app in `flightsim/`, CesiumJS assets copied by `scripts/copy-cesium.mjs`.
- World database built from OurAirports (`npm run data`): `public/data/*.json`.
- JSBSim WebAssembly module in `public/jsbsim/` + adapter `src/physics/jsbsim.ts`.
- Core: `src/core/*` (state contract, Sim loop at 120 Hz, spawn planning, magnetic variation,
  shared cloud field), terrain service with runway flattening (`src/world/elevation.ts`),
  CesiumJS world (`src/world/world.ts`), runtime loop (`src/app/runtime.ts`).
- Developer slice page `dev/slice.html` verified in headless Chrome: spawn on KSFO 28R, take-off,
  climb over real terrain/imagery. `tests/core.test.ts` (5 tests) pass.

- Tests mode (November 2026): 16 scored tests in the Cessna 172P — preflight (walk-around,
  engine start and checks), failures (engine, carb ice, vacuum, alternator, pitot, radio), weather
  (crosswind, gusts, fog go-around, turbulence, hot & high) and skills (steep turn, power-off
  stall); failure effects and an electrical system (`src/systems/failures.ts`). Start screen →
  Tests tab, or `?tab=tests`. Notes: `docs/notes/tests.md`.

## In progress
- Feature modules built in parallel (see the ownership table in `ARCHITECTURE.md`); each writes
  `docs/notes/<module>.md`.

## Next
- Training UI + app shell (start screen, menus, HUD, settings, credits).
- Integration, browser verification, performance pass.
- Root `vercel.json`, user guide, final report with physics comparison table.

## How to run
```bash
cd flightsim
npm install
npm run dev        # http://127.0.0.1:5173  (dev pages under /dev/*.html)
npm test           # physics and logic tests
npm run build      # static site in flightsim/dist
```

## Wrap-up status (2026-11-15) — connected and shipped in a reduced form

The owner asked to stop the large build-out, connect what exists and ship it.

**Wired into the app (`src/ui/App.tsx`) and checked in a browser:** core physics (JSBSim c172p),
world terrain + imagery, airports/runways/lights (scenery), sky/clouds/night (sky), weather
(real + presets), instruments with errors, cockpit panel with "explain this instrument",
views (cockpit / chase / tower / free) with the 3D aircraft, keyboard controls, start screen
(airport search; runway / short final / in the air / parked), pause, reset to short final,
controls help, credits, disclaimer.

**NOT built or not wired (helpers were stopped before finishing):**
- `training` (lessons, coaching, scoring, replay, checklists, tolerances config) — not started.
- `systems` (engine start/failures, carb ice, electrical model) — not started; `App.tsx` has a
  tiny "basic-electrics" stand-in.
- `nav` (VOR/radio tuning logic) — not started; the radio stack is drawn but does not navigate.
- `input` (mouse yoke, gamepad/joystick, touch controls) — not started; keyboard only
  (`src/dev/basic.ts`).
- `audio` — sound engine parts exist (`src/audio/*`) but there is no `index.ts`; not wired, no sound.
- Physics tuning was in progress: `jsbsim/CHANGES.md` and `jsbsim/README.md` mentioned in
  `public/jsbsim/JSBSIM-SOURCE.txt` were not written yet; `docs/PHYSICS-VALIDATION.md` is a draft.
- Custom weather sliders, graphics quality setting UI, weight & balance UI, save progress.

**Tests:** `npx vitest run` → 364 pass, 4 fail (compass acceleration-error size, slip/skid ball
size, attitude-indicator tumble, and a random-control-input robustness run that produced a
non-finite state after 66 s).

**Main SkyReady site:** a built copy of the simulator lives in the repo root `public/sim/` and is shown
at the `/flightgear` page (menu: Fly → World Flight Simulator). To refresh it after changing the
simulator: `cd flightsim && npm run build && rm -rf ../public/sim && cp -r dist ../public/sim`.
