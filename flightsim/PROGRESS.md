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
