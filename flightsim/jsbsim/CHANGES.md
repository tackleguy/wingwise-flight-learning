# Changes to the JSBSim aircraft data

All aircraft files come from JSBSim's aircraft collection (the JSBSim 1.1.14 source package,
https://pypi.org/project/JSBSim/1.1.14/, which is also the release closest to FlightGear 2024.2's
copy of JSBSim). Unmodified originals of every changed file are in `upstream/`.

## Cessna 172P (`aircraft/c172p/c172p.xml`, `engine/eng_io320.xml`, `engine/prop_75in2f.xml`)

Tuned by this project against the Cessna 172P handbook — generated from `tools/c172p.template.xml`
by `tools/gen_model.py`; see `../docs/PHYSICS-VALIDATION.md` for what was changed and how it compares.

## Cessna 182 (`aircraft/c182/c182.xml`) and Piper PA-28 (`aircraft/pa28/pa28.xml`)

- `LEFT_MAIN` and `RIGHT_MAIN` gear contacts: `<max_steer>` changed from `360.0` (free-castering
  main wheels, which make the aircraft spin round on the ground) to `0.0`. Marked in the files with
  a comment. (The main SkyReady site made the same fix to its own copy of the PA-28.)

## Everything else

Unchanged: `c310`, `J3Cub`, `DHC6`, `p51d`, `A320`, `f16`, `t6texan2` and all engine, propeller and
system files. (FlightGear-only inputs that some of them read — e.g. the P-51D's manifold-pressure
regulator — are supplied by the simulator at run time instead; see `fgMirror` in
`src/aircraft/catalog.ts`.)
