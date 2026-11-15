# Notes: FlightGear physics and the ten-aircraft hangar (November 2026)

## What was built
- **Physics engine from FlightGear.** `jsbsim/build-flightgear.sh` compiles FlightGear 2024.2's own
  copy of JSBSim (`flightgear/src/FDM/JSBSim`) to WebAssembly with the SimGear helper subset of
  JSBSim 1.1.14, the TeachX bridge (`jsbsim/wrapper.cpp`) and the ten aircraft's data files.
- **Ten aircraft** (`src/aircraft/catalog.ts`): Cessna 172P (tuned, unchanged code path), Cessna 182,
  Piper PA-28, Piper J-3 Cub, Cessna 310, DHC-6 Twin Otter, P-51D Mustang, Airbus A320, F-16,
  T-6 Texan II. Picker on the start screen (`?aircraft=<id>` also works), remembered in settings.
- **FlightGear 3D models** (`public/models/fg/`, converter in `scripts/fg-aircraft/`) shown in the
  outside views; the cockpit view shows the instrument panel with the outside world above it.
- Generalised for any aircraft: centre-of-gravity height, flap notches and lever, gear lever (G),
  stall angle, ground-strike checks (by contact-point name), airspeed dial range, engine gauge
  (rpm for pistons; N1 / Ng percent for jets and turboprops), airspeed calibration (Cessna only),
  vacuum for the gyros (engine-driven on the piston aircraft, always available with the turbines
  running), chase-camera distance and the pilot's eye point, the ground shadow's size.

## Decisions and why
- FlightGear itself cannot run in a browser (see DECISIONS.md, "FlightGear"). Its physics engine can.
- JSBSim's own aircraft files, not FlightGear's versions: FlightGear's c172p and friends depend on
  FlightGear's Nasal scripts and property tree (e.g. two engines selected by a script, damage and
  ice systems) and do not work in JSBSim alone.
- Governed (constant-speed) propellers are held at fixed pitch during JSBSim's instant engine start
  and trim (`wrapper.cpp` `holdPropellers`): those routines step the engine in half-second steps,
  at which the governor (pitch change = rpm error × time step) overshoots and stalls the engine.
- Engines that still do not start instantly are started with the starter behind the scenes (the
  P-51D needs this); aircraft JSBSim cannot trim (the P-51D, whose throttle is a manifold-pressure
  regulator that needs time to act) are flown level for 8 s behind the scenes instead.
- FlightGear-only inputs (the P-51D reads `/engines/engine/mp-inhg` and
  `/controls/engines/engine/throttle`, which FlightGear copies every frame) are copied by the
  adapter every physics step (`fgMirror`).
- Take-off trim for the P-51D (0.3), F-16 (0.3) and A320 (0.6): the take-off test showed lift-off
  speeds far too high without it.

## Verified (commands and results)
- `npx vitest run` in `flightsim/`: 405 of 408 pass. The 3 failures (compass acceleration error,
  inclinometer, attitude-indicator tumble) failed in the same way before this work, with the old engine.
- `tests/aircraft/hangar.test.ts` (40 tests): every aircraft stands still on the runway with the
  engine running, takes off and climbs above 150 ft with a simple test pilot, raises its gear (where
  it has retractable gear), flies 30 s hands-off after an "in the air" start (less than 1,500 ft
  height change), and starts on short final.
- Measured with that test pilot (lift-off speed, KCAS): C172 70, C182 72, PA-28 80, Cub 43, C310 100,
  Twin Otter 98, P-51D about 119 (with take-off trim), A320 about 186, F-16 about 200, T-6 132.
- Headless Chrome (`scripts/shot.cjs`): picked aircraft, pressed Fly, checked engine running, the
  model loaded and no console errors; looked at the screenshots (chase and cockpit views).

## Known limitations — what is still unrealistic
- Only the Cessna 172P is tuned and checked against a handbook. The others fly as JSBSim's authors
  made them: the A320 and F-16 need far more speed to lift off than the real aircraft; the P-51D's
  hands-off flight after an air start drifts (about +600 ft in 30 s).
- The instrument panel is the Cessna 172's six-pack and engine gauges for every aircraft (with the
  airspeed dial stretched and the engine gauge in percent for turbines). Fuel, oil and EGT gauges
  show the first engine / first two tanks only; jet and turboprop oil gauges read zero.
- The explanation cards' teaching text describes the Cessna 172; for the others a note says so and
  the live reading uses their numbers.
- One throttle for all engines (no asymmetric thrust, no engine-failure training on the twins).
  Mixture, carburettor heat and propeller levers are the Cessna's; the propeller lever is kept full
  forward on governed propellers; turbines use the mixture lever as the fuel cut-off.
- No cockpit interiors in the FlightGear models; light positions are estimated from the model size;
  retractable gear simply disappears when fully up (no folding animation).
- Lessons/training (when added) should stay on the Cessna 172P.

## Shared-file changes
`core/types.ts` (ControlState.gearDown; SimState.n1Pct, gearPosNorm; Settings.aircraft),
`core/defaults.ts`, `core/sim.ts` (sim.aircraft / setAircraft, CG height, strikes, stall angle),
`core/spawn.ts` (speeds and flaps per aircraft), `physics/jsbsim.ts` (createOther / setInputsOther),
`instruments/*` (calibration, needle stop, vacuum), `panel/*` (airspeed dial, engine gauge, flap
lever, explanations), `views/*` (model per aircraft, cameras), `ui/App.tsx` (picker), `dev/basic.ts`
(G key, flap notches).

## Ideas not done
- Per-aircraft instrument panels (glass cockpit for the A320/F-16, twin-engine gauges).
- Separate throttles per engine, engine failures on the twins.
- Retuning the A320 and F-16 take-off behaviour against published figures.
