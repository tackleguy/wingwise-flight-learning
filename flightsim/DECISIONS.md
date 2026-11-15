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
  replaceable file with its source location documented. Only JSBSim's own engine and its c172p
  aircraft data are used — **nothing was taken from FlightGear** (GPL).
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
