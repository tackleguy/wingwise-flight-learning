# Tests mode — notes

Owner files: `src/training/**`, `src/systems/failures.ts`, `tests/training/**`, this file.
Scored exercises inside the World Flight Simulator: open the start screen, pick the **Tests** tab
(or open the simulator with `?tab=tests`). A learning aid only — not an FAA-approved training
device, and a pass here is not a sign-off by an instructor.

## 1. What was built

16 tests in four groups, all in the Cessna 172P (the only aircraft whose numbers are checked
against a handbook):

| group | tests |
| --- | --- |
| Preflight | walk-around inspection (find planted problems, decide go / fix / no-go); engine start, run-up and before-take-off check (every switch is checked) |
| Failures & emergencies | engine failure after take-off; engine failure at 2,000 ft — glide to the runway; carburettor ice; vacuum failure in cloud; alternator failure; pitot icing; radio failure |
| Weather | crosswind landing; gusty landing; go-around in fog; turbulence; hot & high take-off (lean the mixture) |
| Skills | steep turn (45°, 360°); power-off stall and recovery |

Each test has a briefing, a time limit, scored **objectives** (each worth points; some are
**essential**), and ends with a **debrief** (what passed, what failed and why, tips). Pass mark:
80 % and every essential objective passed. The best score, pass and number of attempts are kept
in the browser (`localStorage`, key `skyready.sim.tests`); every finished attempt also goes to
`skyready.sim.testsOutbox`, which the website uploads to the pilot's account when they are signed
in (`src/lib/sim-tests-sync.ts` in the site; table `sim_test_results`, see the site's
`docs/ARCHITECTURE.md` → Persistence). The account's scores are merged back, so they show on any
device.

| file | contents |
| --- | --- |
| `src/training/types.ts` | `TestDef`, `FlightTest`, `FlightSetup`, `Objective`, `TestContext`, `TestEvent`, `TestResult`, `FailureKind` + labels, `PASS_SCORE` |
| `src/training/objectives.ts` | objective building blocks: `within`, `atMark`, `band`, `never`, `reportFailure`, `climbTo`, touchdown checks, `landOnRunway`, `stopOnRunway`, `steepTurn`, `stallRecovery`, `noCrash`, `noStall`; `runwayPosition` |
| `src/training/catalog.ts` | the 16 tests (`TESTS`, `getTest`, `CATEGORY_LABELS`) |
| `src/training/runner.ts` | `createTraining()` (sim module "training": runs events, updates objectives, ends and scores, stores results); `prepareTestFlight()` (aircraft, weather, position, time of day); `scoreObjectives()` |
| `src/training/walkaround.ts` | the 21 Cessna walk-around items, `makeInspection`, `correctDecision`, `gradeInspection` |
| `src/training/ui/` | `TestsMenu` (list + briefing), `TestHud` (panel while flying: objectives, clock, Report a problem, End test), `Debrief`, `Walkaround` |
| `src/systems/failures.ts` | `createFailureEffects()`: what each failure does to the aircraft, carburettor ice build-up, and the electrical system (battery, alternator, bus volts) |

### How a flying test runs

1. `prepareTestFlight` puts the Cessna where the test starts (on the runway, on final, or in the
   air), applies the weather preset and sets the time of day.
2. `training.begin` starts watching. Each physics step it fires the test's **events** (e.g. "the
   engine stops somewhere between 400 and 700 ft", "the tower calls go-around at 400 ft") and
   updates every objective. Events set named moments (`ctx.marks`) that objectives measure from.
3. The test ends when the time is up, the aircraft is damaged, the test's own end condition is met
   (usually "stopped after landing"), the pilot presses **End test**, or the aircraft is moved.
   Anything still undecided is then failed with a reason ("That part of the test never started.").
4. The pilot reports problems with **Report a problem**; a report only counts after the problem
   actually happened.

### What each failure does (`src/systems/failures.ts`)

- **Engine**: no power at all. **Carburettor ice**: power fades over about 90 s while carb heat
  is off and melts in about 30 s with it on (carb heat itself costs a little power).
- **Alternator**: the bus runs on the battery (35 Ah) — the ammeter shows a discharge, LOW VOLTS
  lights, and the radios die when the battery is flat. Shedding load makes it last longer.
- **Vacuum**: suction drops to zero; the attitude and heading indicators spin down and slowly
  drift (instruments module).
- **Pitot / static port**: blocked lines, so airspeed / altimeter / VSI read wrong (instruments
  module). Pitot heat clears pitot ice after 20 s in the pitot-icing test.
- **Radio**: the radios stay dark.

## 2. Decisions

- **Only the Cessna 172P.** The objectives use real numbers (best glide 65 kt, stall speeds,
  run-up rpm drop); only this aircraft's flight model is checked against a handbook.
- **Objectives are judged from the true state where the instrument could lie** (e.g. the crash and
  touchdown checks), and from the *indicated* airspeed where the pilot is expected to fly by it.
- **Essential objectives** (no crash; finding a grounding problem on the walk-around; the right
  no-go decision) cap the score below the pass mark when failed, whatever else went well.
- **The walk-around is text, not 3D.** The FlightGear model has no detail for oil dipsticks,
  fuel samples or hinge brackets; a described inspection teaches the same decisions honestly.
- **While the walk-around is open the flight is paused and the 3D world is not drawn** (the sheet
  covers the screen; there is nothing to see and the plane must not fly unattended).

## 3. Outside sources

No new outside code or data. The procedures follow the general FAA guidance every student
learns (Airplane Flying Handbook, FAA-H-8083-3C; Airman Certification Standards for the private
pilot, FAA-S-ACS-6C) and the Cessna 172 handbook numbers already used by the simulator; nothing is
copied from them.

## 4. Verified

- `npx vitest run tests/training` — 34 tests: catalog validity (airports and runways exist and
  are surveyed), scoring, runway geometry, walk-around grading, failure effects (alternator,
  engine), early end, and **ten tests flown end to end by the scripted test pilot**
  (`tests/physics/lab.ts`): each passes when flown by the book. A smoke test starts every flying
  test and checks the aircraft is where the test says.
- Full suite `npx vitest run`: all pass.
- Headless Chrome (`?tab=tests`): list → briefing → test panel → report menu → End test →
  debrief → walk-around → submit → debrief, with no console errors.

## 5. Limitations (what is still unrealistic)

- The walk-around is described, not seen. The decisions are scored, not the order you walk.
- Failures are simplified: e.g. carb ice builds at a fixed rate and does not depend on humidity
  and temperature yet.
- Objectives judge numbers, not airmanship: they cannot see where you look or whether you used
  the checklist.
- No instructor voice or ATC beyond short text calls.

## 6. Ideas not done

- Random failures in free flight ("surprise me").
- Tests for the other aircraft (needs their handbook numbers checked first).
- A replay of the flight with the moments each objective was judged.
