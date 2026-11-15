# Decisions

Choices made while building the TeachX Flight Simulator, in plain language, newest topics last.
(Per-module details are in `docs/notes/`.)

## Where the simulator lives
- **A folder (`flightsim/`) inside the existing TeachX repository**, not a new repository. The
  build session could not create GitHub repositories, and one repository is simpler to own.
  A `vercel.json` at the repository root tells Vercel to build only this folder, so importing the
  repository into Vercel publishes the simulator and every later push goes live automatically.
- It is a **stand-alone static site** (Vite + TypeScript). The main TeachX site links to it; it can
  also be embedded in a page (it works from any sub-folder because all URLs are relative).

## 3D world
- **CesiumJS** (Apache-2.0) draws the globe. **Cesium ion is not used** (it needs an account and
  token): terrain and imagery come from keyless open sources instead.
- **Terrain: "Terrain Tiles" on AWS Open Data** (Mapzen/Tilezen terrarium tiles). One service
  feeds both the picture and the physics, so the wheels touch the ground you see.
  - The data contains the sea floor; the simulator clamps the sea to sea level, except in listed
    regions where real land is below sea level (Dead Sea, Death Valley, the Netherlands …).
  - Ground under every runway is **flattened** to a plane between the runway ends (blended into the
    surrounding terrain) because 30 m elevation data would otherwise make runways bumpy.
  - Heights above the WGS84 ellipsoid are treated as heights above sea level (the usual
    simulator simplification). The polar caps beyond 85° latitude are not drawn.
- **Imagery:** NASA Blue Marble (public domain) as the always-available base; **Sentinel-2
  cloudless 2016 by EOX** (CC BY 4.0) for detail — the 2016 edition was chosen because later
  editions are licensed non-commercial/share-alike; optional **USGS** aerial imagery over the USA
  (public domain); NASA city lights on the night side. 10 m imagery is blurry close to the
  ground — accepted; procedures matter more than scenery.
- EOX's free tile service is for non-commercial use; if TeachX becomes a business the imagery
  source must be revisited (see `CREDITS.md`).

## Flight physics
- **JSBSim compiled to WebAssembly** (the "if practical" path of the brief — it was practical).
  JSBSim is the open-source flight model used by FlightGear; it is LGPL-2.1, shipped as a separate
  replaceable file with its source location documented. (Originally only JSBSim's own release was
  used; since November 2026 the engine is FlightGear's copy of it — see "FlightGear" below.)
- Physics runs at a fixed 120 steps per second on the main thread (measured cost is far below one
  millisecond per step), independent of the graphics frame rate. Slow computers get slow motion
  rather than unstable physics.
- In-air starts are trimmed by JSBSim, then the wind is added (JSBSim's start-up wind uses the
  opposite sign to its run-time wind, so the simulator applies the wind itself).
- The altimeter setting is modelled the way the real one is defined: with the reported setting
  dialled in, the altimeter reads field elevation at the reporting station; temperature then
  produces the real-world errors away from it.

## Airports
- **OurAirports** (public domain) for airports, runways, frequencies and navaids: 48,079 airports,
  33,408 runways. Runways without surveyed end points (about 19,000, mostly small strips) are drawn
  through the airport reference point from their published heading/length and are labelled
  "estimated". Heliports, seaplane bases and closed airports are left out.
- The open data has no parking positions or taxiways, so "parked" starts are beside the runway.

## Weather
- aviationweather.gov does not allow browsers to call it directly (no CORS), so the deployed site
  uses a tiny Vercel function as a relay; fallbacks are api.weather.gov (USA) and Open-Meteo
  (worldwide, CC BY 4.0). No keys are needed for any of them.

## Earlier work that was paused
- The earlier request for 3D cockpits / "FlightGear Live" inside the main TeachX site was paused
  when the brief for this simulator arrived. The partial code is saved in the repository but its
  menu links are hidden. JSBSim is not wired into the main site's older simulator.

## FlightGear: physics and models (owner's decision, November 2026)
- The owner asked to replace the simulator with FlightGear (source code of FlightGear 2024.2
  "next") and to run it in the browser. **FlightGear as a whole cannot run in a web browser**: it
  draws with desktop OpenGL features browsers do not have, needs two more large libraries (SimGear,
  OpenSceneGraph) and gigabytes of aircraft and scenery data, and nobody has ported it to the web.
  The owner chose instead: **FlightGear's physics and FlightGear's aircraft models**.
- **Physics:** the flight-dynamics engine is now built from FlightGear's own copy of JSBSim
  (`flightgear/src/FDM/JSBSim`) by `jsbsim/build-flightgear.sh`. FlightGear normally links it with
  the full SimGear library; the small SimGear helper subset that JSBSim 1.1.14 ships (the release
  closest to FlightGear's copy) replaces it. Two bugs were fixed during the build, both exactly as
  later JSBSim releases fixed them (turbulence history shared between aircraft; a C-library
  difference under Emscripten). Result on the existing test suite: 365 of 368 pass (the old engine:
  364); the 3 failures are instrument tests that failed before the change as well.
- **Aircraft:** ten aircraft (`src/aircraft/catalog.ts`). Flight models come from JSBSim's own
  aircraft collection (designed to run outside FlightGear); FlightGear's own versions of these
  aircraft depend on FlightGear's scripting (Nasal) and property tree and do not run without it.
  The Cessna 172P keeps the TeachX-tuned model and its validated code path. Two kinds of fixes were
  needed in the bridge (`jsbsim/wrapper.cpp`, TeachX's own code): governed propellers are held at
  fine pitch while JSBSim computes an instant engine start or a trim (its half-second steps made the
  governor stall the engine), and some models read values FlightGear would supply every frame
  (the P-51D's manifold-pressure regulator) — the adapter copies them (`fgMirror`).
- **3D models:** FlightGear's hangars (c172p from FGData; the rest from FGAddon), converted to
  glTF (exterior only, textures resized) by `scripts/fg-aircraft/`. They have no cockpit interior,
  so the cockpit view shows the instrument panel with the outside view above it.
- **Honesty:** only the Cessna is tuned and checked against a handbook; the catalog says so for the
  others, and says where a model is known to be off (the A320 and F-16 need far more speed to lift
  off than the real aircraft).
- **Licences:** the physics engine stays LGPL (separate, replaceable module). The FlightGear 3D
  models and the c310/f16 flight-model files are GPL; they are separate data files shipped with
  their licence and source links (`public/models/fg/CREDITS.md`, `CREDITS.md`).
