# FlightGear aircraft → glTF converter

Turns the exterior 3D models of ten FlightGear aircraft into `public/models/fg/<id>.glb` and writes
`src/aircraft/fg-models.gen.ts` (numbers for the app) and `public/models/fg/CREDITS.md` (licences).

The models are **GPL** (FlightGear aircraft). This is a change from the "no GPL assets" rule in
`ARCHITECTURE.md` §1 and must stay clearly credited (CREDITS.md) — the decision is the owner's.

Six more aircraft without a JSBSim model (`EXTRA` in `aircraft_config.py`: da40, sr22, pa34, be350,
b738, be36) are converted the same way for the Scenario Simulator, but with origin at the centre of
the bounding box (left/right, fore/aft) and y = 0 at the bottom of the main tyres (gear down). They are
listed in `public/models/fg/extra.json` (not in `fg-models.gen.ts`) and credited in CREDITS.md.

## Files

| file | what it does |
| --- | --- |
| `fetch.py` | downloads the needed FGAddon files from SourceForge's web pages (svn is not reachable) into the cache |
| `convert.py` | reads the cache, writes the .glb files, the .ts file and CREDITS.md |
| `fgmodel.py` | AC3D reader, FlightGear model-XML reader (offsets, sub-models, animations, conditions) |
| `glb.py` | small binary glTF writer |
| `aircraft_config.py` | per-aircraft choices (variant, livery, objects to drop, wheel names, notes, credits) |
| `view.cjs` + `view.html` | headless check renders (Playwright + three.js) |

## Re-running

```sh
cd flightsim
python3 -I scripts/fg-aircraft/fetch.py c182 pa28 J3Cub c310 DHC6 p51d A320 f16 t6texan2 da40 sr22 pa34 be350 b738 be36
python3 -I scripts/fg-aircraft/convert.py                 # all sixteen (about 25 s), or: convert.py c182 p51d
node scripts/fg-aircraft/view.cjs                         # PNGs in the scratchpad fg-shots folder
python3 -I scripts/fg-aircraft/convert.py --inspect c182  # list objects, animations and what happens to them
```

- Cache folder: `$FG_CACHE` (default: the session scratchpad `…/scratchpad/fgaddon`). c172p comes from a
  local FGData checkout: `$FGDATA` (default `…/scratchpad/fgdata/repo`, branch `release/2024.1`).
- Downloaded files are untrusted data: they are only parsed (run Python with `-I`).
- `fetch.py --list <FGDir> [sub/path]` shows a remote folder, `--get <FGDir> <path>…` fetches single files,
  `--revisions` records each folder's last-change revision (used in the credits).
- `FG_OUT=/some/dir convert.py …` writes experiments elsewhere; `FG_SERVE_ROOT` lets `view.cjs` serve such a folder.

## What the converter does

1. **Load** the model XML named by the `-set.xml` (`/sim/model/path`), with `include=`, `alias=`
   (absolute and `../` relative), sub-models and their `<offsets>`. AC3D (y up) → FlightGear model frame
   (x aft, y right, z up): `(x, −z, y)`. Offsets: pitch about y, then roll about x, then heading about z,
   then translation (as in SimGear).
2. **Choose objects.** Dropped: cockpit / instruments / pilots / effects / light halos / shadows / ground
   equipment (by name, by texture name, by FG interior effects, by `skip_box`), invisible pick boxes
   (`<visible>false`), weapons / stores, and everything a `select` animation hides in the default
   configuration (conditions are evaluated with the `-set.xml` properties; rpm, gear position and
   control-surface properties count as "unknown", so blades and blurred discs both stay).
3. **Default livery** from material animations, livery files or (A320) the Nasal canvas livery list.
4. **Align.** Translation only (no rotation or scale): the average of the left/right main-tyre bottoms goes
   onto the JSBSim main BOGEY contact points; origin = JSBSim CG; output frame glTF +Z nose, +Y up, +X left.
   The other wheel's error, the main-gear track and the span are compared with JSBSim and written into
   `notes`.
5. **Moving parts.** Every rotate/spin animation on surface / propeller / gear properties (also recognised
   by animation names and alias paths, because some models use multiplayer properties) gives a node whose
   local +X is the hinge axis, oriented so that +angle = trailing edge UP (elevator, ailerons, flaps),
   rudder trailing edge to the pilot's RIGHT, propeller clockwise seen from the cockpit (axis forward).
   - Flaps that FG moves with rotate **and** translate (Fowler-type) get the single pivot that reproduces
     FG's position at full flap.
   - If a part has several hinges (inner/outer flap, swept elevator halves, centre flap) the geometry goes
     into child nodes with their exact hinges (`flap_left_1`, `elevator_left` …); turning the parent moves
     them all about one compromise axis. Turn either the parent or the children, not both.
   - Small linkages on other hinges (cables, steering, fairings that are too small) stay static.
   - `gear_retract` = everything FG animates with `gear/gear[n]/position-norm` (legs, wheels, doors).
6. **Materials.** AC3D diffuse, `trans` → alpha, `shi` → roughness, metallic 0; textures re-encoded as
   JPEG (opaque) or PNG (alpha), ≤ 1024 px (A320 2048), REPEAT wrap, texrep/texoff baked into UVs; crease
   angle smoothing; all materials double-sided (the cabins are empty); glass at least lightly tinted;
   blurred propeller discs without a usable texture drawn translucent.
7. **Write** the GLB (metadata also stored in the root node's `extras.teachx`, debug data in
   `extras.teachxDebug`), then regenerate `fg-models.gen.ts`, `extra.json` and `CREDITS.md` from all GLBs present.

Also handled: `<model><overlay>` (one shared sub-model re-targeted per engine, e.g. the Seneca's prop
discs) and material `<transparency>` animations (blurred discs fade).

## Checking

`view.cjs` renders each model with a grey plane at the JSBSim main-gear contact height, a magenta ball at
the origin (CG), yellow/cyan dots at the JSBSim main and nose/tail contacts and a green dot at the eye
point. The `deflect*` views turn elevator, rudder, ailerons and flaps +20° and also check numerically
(trailing-edge vertices) that every hinge node, children included, follows the sign convention; the
console prints `hinge directions OK` or the failing node.
