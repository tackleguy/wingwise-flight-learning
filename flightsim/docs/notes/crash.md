# Crash physics — notes

Owner files: `src/crash/**`, `tests/crash/**`, the crash split in `scripts/fg-aircraft/convert.py`
(`split_airframe`), this file. A learning aid only — the crash behaviour is made to look and feel
believable, it is not engineering data.

## 1. What was built

Before, a crash froze the aircraft where it hit. Now the moment the simulator decides it is a crash
(the rules in `src/core/sim.ts`: too hard a touchdown, a wing tip or the nose touching, flying into
terrain…), the flight model stops and a rigid-body simulation takes over from exactly that state:
position, attitude, speed and rotation. The aircraft hits, bounces, slides and tumbles; landing gear,
wings and tail break off and go their own way; dust flies up where pieces hit, a badly damaged wreck
smokes, every impact thumps. The camera goes outside to watch (it comes back to your view on the
next start). When everything has stopped, `crashSettled` is emitted and the pilot is told to press
R. In Tests mode the debrief waits for the wreck to come to rest (at most 12 s).

| file | contents |
| --- | --- |
| `src/crash/wreck.ts` | `Wreck`: the Rapier world — terrain height grid, the airframe as one body with a shape per piece, breaking pieces off, impacts, coming to rest; `loadRapier()` |
| `src/crash/index.ts` | `createCrash(world)`: the sim module "crash" — starts the wreck on the `crash` event, moves `sim.state` with it every frame, publishes `parts` for the views, dust/smoke/sound, `crashSettled` |
| `src/crash/effects.ts` | `CrashEffects` (dust and smoke: CesiumJS billboards sized in metres), `CrashSounds` (the synthesised crash sound of `src/audio/oneshots.ts`) |
| `src/views/aircraft.ts` | `applyCrash()`: moves the nodes of each broken-off piece by its pose relative to the fuselage; hides torn-off retractable gear; resets on a new start |
| `src/views/cameras.ts`, `index.ts` | `watchCrash()` — outside orbit, 24° above, 3.2 wingspans back |
| `scripts/fg-aircraft/convert.py` | `split_airframe()`: splits each 3D model into `body`, `wing_left`, `wing_right`, `tail`, `gear_*` nodes and writes `crash` (nodes + collision box of each piece) into `src/aircraft/fg-models.gen.ts` |

### How the wreck is modelled

- **Engine:** Rapier 3D 0.19.3 (`@dimforge/rapier3d-compat`, Apache-2.0), WebAssembly, fixed
  1/120 s steps, continuous collision detection on (fast pieces cannot pass through the ground).
- **Ground:** a 161 × 161 height grid from the same elevation data the flight model uses (runways
  flattened), 240–900 m across depending on speed, reaching further in the direction of travel.
  Internal-edge fix on (no false bumps where triangles meet). Friction 0.7.
- **Airframe:** one rigid body with a shape per piece, sizes from the 3D model (area-weighted, so
  struts and aerials do not stretch them): fuselage = its box tapering to a raised, narrow tail cone;
  wings and tail = boxes; fixed landing gear = a ball at the bottom of each leg (slides smoothly;
  friction 0.12 because wheels roll); retractable gear = one rounded box (none when the gear is up).
  Mass = the flight model's weight, shared fuselage 62 %, wings 12 % each, tail 5 %, gear 6 %; the
  fuselage's share is placed so the whole aircraft balances at the flight model's centre of gravity.
- **Breaking:** each piece has a strength — the ground impulse it takes within about 0.1 s, as a
  change of speed of the whole aircraft: main gear 2.6 m/s, nose gear 2.0, tail wheel 1.6, wings 3.2,
  tail 2.2; the fuselage does not break. A violent blow to the fuselage also tears pieces off by
  their own inertia (35 % of the fuselage's push counts against each piece). A crash caused by a very
  hard touchdown starts with the landing gear already broken; a nose-over with the nose wheel broken.
  A broken piece becomes its own body with the velocity it had (centre-of-mass velocity + rotation ×
  lever arm). Pieces of the aircraft collide with the ground only, not with each other.
- **The end:** when nothing has moved faster than 0.25 m/s (or 0.25 rad/s) for 1.2 s, after 30 s,
  or when the fuselage reaches the edge of the simulated ground.

## 2. Decisions

See `DECISIONS.md` → "Crash physics". In short: Rapier (maintained, CCD, small enough, Apache-2.0)
over cannon-es (no CCD, unmaintained), ammo.js and Jolt (bigger); JSBSim keeps deciding *when* it
is a crash; pieces come from each 3D model automatically; nothing gory.

## 3. Outside sources

| what | licence | link | how used |
| --- | --- | --- | --- |
| Rapier 3D (`@dimforge/rapier3d-compat` 0.19.3) | Apache-2.0 | https://rapier.rs | the physics engine, bundled as a separate chunk loaded on demand |

No other outside code or data (dust, smoke and sound are made here).

## 4. Verified

- `npx vitest run tests/crash` — 9 tests with the real engine: the pose given is the pose read back;
  an aircraft on its wheels stays standing and nothing breaks; a 300 ft/min touchdown breaks nothing;
  1,500 ft/min breaks a main leg and the aircraft comes down on its fuselage or a wing, slides
  15–250 m, ends neither in the ground nor floating; gear broken by the crash comes off at once; a
  wing tip touching at taxi speed does not tear the wing off; an 80 kt dive breaks the aircraft apart
  with nothing ending up in the ground; an A320 gear-up landing slides on its belly; and the whole
  chain in the simulator (JSBSim flies into the ground → crash module → at rest → a new start resets).
- Headless Chrome on the real app: a dive near KLVK — wings, tail and wheels break off, dust,
  the outside camera keeps the wreck in the middle, "come to rest" after about 11 s; no errors.
- The split of all ten World Flight Simulator models checked by eye (coloured, pulled apart:
  `node scripts/fg-aircraft/view.cjs --views=parts`).

## 5. Limitations (what is still unrealistic)

- Pieces are boxes (and balls for wheels): they slide and tumble like boxes. The fuselage never
  breaks, nothing bends or crumples, there is no fire.
- No aerodynamics after the crash: a wreck thrown back into the air flies like a stone.
- Pieces do not collide with each other (only with the ground), and not with buildings or trees.
- Strengths are tuned for a believable picture, not taken from the aircraft's structure.
- On a computer without a graphics chip (software rendering) the crash plays in slow motion.

## 6. Ideas not done

- Damage short of a crash (a bent propeller after a prop strike, a damaged nose gear you can still
  taxi on).
- Pieces hitting buildings and trees; skid marks.
- The same crash physics in the Scenario Simulator (three.js).
