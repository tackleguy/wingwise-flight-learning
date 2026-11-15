# Instruments module — notes

Owner files: `src/instruments/**`, `tests/instruments/**`, this file.
Logic only: it works out what every cockpit instrument **indicates** (`sim.state.ind`); the panel
module draws it. Nothing here is approved training data — it is a learning aid.

## 1. What was built

`createInstruments(options?)` returns a `SimModule` named `"instruments"`. Every physics step
(120 per second, in `postStep`) it turns the true state into indicated values, modelling each
instrument the way the real one works so that the real errors appear by themselves instead of
being painted on.

| file | contents |
| --- | --- |
| `index.ts` | public exports: `createInstruments`, `kcasToKias`, `kiasToKcas`, `compassDeviation`, `INSTRUMENT_LIMITS`, types |
| `api.ts` | `InstrumentsApi`, `InstrumentOptions`, `InstrumentStatus` |
| `instruments.ts` | the module: wiring, spawn stabilisation, power/suction sources, `dg-align` command, hour-meter storage |
| `kinematics.ts` | shared per-step motion: body axes, airframe rotation, "apparent gravity" (gravity minus acceleration) |
| `airspeed.ts` | KCAS ↔ KIAS calibration table, pitot pressure ↔ airspeed, needle rest behaviour |
| `pitot-static.ts` | airspeed indicator, altimeter, vertical speed indicator and the two air lines with blockages |
| `gyros.ts` | attitude indicator, heading indicator, turn coordinator, slip ball |
| `compass.ts` | magnetic compass (floating, pendulous card in the dipping magnetic field) |
| `gauges.ts` | tachometer, hour meter, fuel, oil temperature/pressure, EGT, suction, ammeter, OAT |
| `rng.ts` | seeded random numbers |

### How each instrument is modelled (and which real errors a student can see)

- **Airspeed indicator** — a gauge of (pitot line − static line) pressure. Calibrated airspeed is
  converted to impact pressure and back, then to KIAS through the POH position-error table from
  the brief (flaps 0 / 10 / 30, interpolated by flap angle; the two published stall speeds are
  extra points; straight line to zero below them; last correction kept above the table).
  The needle rests on its stop below about 19 kt and "comes alive" by 28 kt. Lag 0.25 s.
  - *Blocked pitot (ram hole and drain)*: the pressure in the pitot line stays trapped, so the
    indicator behaves like an altimeter — higher as you climb, lower as you descend.
  - *Blocked static port*: reads low above the altitude of the blockage, high below it.
- **Altimeter** — `indicatedAltitudeFt(static line, Kollsman setting)` from `core/math.ts`, plus a
  0.2 s lag and a little mechanism friction (2 ft with the engine running, 8 ft with it stopped).
  The Kollsman knob acts directly and at once. Static blockage freezes it. Temperature error comes
  from the truth atmosphere (nothing added here). Setting accepted from 27.5 to 31.5 inHg (same
  range as the panel knob).
- **Vertical speed indicator** — pressure difference across a calibrated leak (2.2 s) plus needle
  lag (0.5 s): several seconds behind, stops at ±2,000 fpm, small brief wrong-way kick on an
  abrupt pitch change, returns to zero with a blocked static port.
- **Attitude indicator** — vacuum gyro whose spin axis is tracked as a direction in space. It is
  rigid, and pulled toward *apparent* gravity by its erecting vanes at 3° per minute (less inside
  1.5° of error). That alone gives: slight nose-up after acceleration, small pitch/bank errors after
  180° of turn that cancel after 360° or wash out in level flight. Gimbal stops at 62° pitch / 102°
  bank: beyond them it whirls for a few seconds and is left tens of degrees off, then re-erects at
  the same slow 3°/min. Rotor speed follows suction (75 s time constant up, 150 s down); with no
  suction there is no erection and the gyro wanders off faster and faster — error about 1° after one
  minute, 4° after two, 9° after three, 20° after four. A stopped gyro lies lopsided and is carried
  with the airframe; after engine start it wobbles, erects and settles in one to two minutes.
- **Heading indicator** — vacuum gyro with a horizontal axis that remembers a direction in space;
  it never seeks north. Drift = Earth rotation (15.04°/h × sin latitude, reading falls in the
  northern hemisphere, rises in the southern) + travel around the Earth (east-west speed × tan
  latitude) + this gyro's own drift (1–3.5°/h either way, fixed per flight). The pilot's knob
  (`controls.dgAdjustDeg`) turns the card. Real gimbal geometry: zero error in level flight and on
  indicated N/E/S/W, up to about 1.3° in a standard-rate turn and 4° at 30° of bank in between, gone
  when the wings are level (can be switched off, see options). Tumbles when its inner gimbal passes
  55° (bank on east/west indications, pitch on north/south ones) and is then simply wrong until
  reset. Without suction it runs down, wanders, and finally the card stops following turns.
- **Magnetic compass** — a magnetised card hanging like a pendulum in liquid. The card hangs square
  to *apparent* gravity; its magnets follow whatever part of the Earth's field lies in the plane of
  the card. Because the field dips steeply (67° over the central USA), a tilted card is pulled
  round. Result, with no error formulas: northerly turning error (lags or first goes the wrong way
  from north, leads from south — UNOS), acceleration error on east/west (ANDS), both reversed in
  the southern hemisphere, nothing at the magnetic equator, sluggish near the magnetic poles. Plus
  card inertia and liquid damping (swings and settles in a few seconds), a little drag from liquid
  swirl in sustained turns, jamming when the cabin is more than 18° from the apparent vertical, and
  a fixed deviation of at most 1.8° (`compassDeviation`). Declination comes from `state.magVar`;
  dip and field strength from the World Magnetic Model through a new helper in `core/magvar.ts`.
- **Turn coordinator** — electric rate gyro canted 30°: senses yaw rate × cos 30° + roll rate ×
  sin 30°, calibrated so that a level, coordinated 3°/s turn at about 100 kt reads 1.0. Second-order
  needle (about half a second of lag), stops at ±2.2. Sensitivity follows rotor speed: spins up in
  about 15 s; without electrical power the flag shows at once and the needle fades over about a
  minute.
- **Slip ball** — rolls to where apparent gravity points: position = −atan(ny / nz) / 10°, with
  inertia and fluid damping; ±1 is the end of the tube. `+` = ball to the right = step on the right
  rudder.
- **Tachometer** 0.3 s lag (mechanical). **Hour meter** counts while the engine runs and belongs to
  the aircraft: it is not reset by a reposition and is remembered in the browser
  (`localStorage` key `teachx.sim.hobbs`). **Fuel gauges** electric, 5 s damping, a per-flight
  calibration error of up to about ±2 gal that is zero at empty, fuel slosh with lateral/fore-aft
  acceleration (largest with half-full tanks), needle falls to E without power. **Oil temperature**
  electric (6 s, rests at the bottom of the scale, 75 °F, when cold or unpowered). **Oil pressure**
  mechanical (0.6 s). **EGT** thermocouple (2.5 s, no power needed). **Suction gauge** 0.5 s.
  **Ammeter**: battery current from the systems module if it writes `sys.batteryAmps`, otherwise an
  estimate (small charge with the alternator on line, extra charge after a start, discharge equal to
  the switched-on loads without it). **Clock** = UTC seconds since midnight from `sim.env.utcMs`
  (kept current while paused). **OAT** 25 s lag and about +1 °C ram rise at 100 kt.

### Spawn behaviour

Engine running or any airborne start: gyros at speed, attitude indicator erect, heading indicator
set to the compass, compass settled, VSI already showing the present rate. Cold start on the ramp:
gyros stopped, flags showing, horizon lopsided, heading indicator showing an arbitrary heading.

## 2. Public API

```ts
import { createInstruments, kcasToKias, kiasToKcas, compassDeviation, INSTRUMENT_LIMITS } from "@/instruments";

createInstruments(options?: InstrumentOptions): InstrumentsApi

interface InstrumentOptions { seed?: number; dgGimbalError?: boolean }

interface InstrumentsApi extends SimModule {
  readonly name: "instruments";
  alignHeadingIndicator(): void;                         // also on the "dg-align" command
  kcasToKias(kcas: number, flapsDeg: number): number;
  kiasToKcas(kias: number, flapsDeg: number): number;
  compassDeviation(magneticHeadingDeg: number): number;  // compass − magnetic, degrees
  readonly status: InstrumentStatus;                     // gyro speeds, tumbling, compass jammed, suction, power
}
```

Hooks used: `onSpawn`, `postStep`, `frame` (clock while paused, hour-meter saving), `dispose`.
It writes only `sim.state.ind` — and `sim.controls.dgAdjustDeg` when `alignHeadingIndicator()` is
called (that is the pilot's knob).

## 3. Decisions and why

- **Mechanism first.** The compass and the gyros are small physical models driven by "apparent
  gravity" (gravity minus the aircraft's acceleration, obtained by differentiating ground velocity).
  One quantity therefore explains the slip ball, the compass errors, the attitude-indicator errors
  and the fuel slosh consistently, and nothing has to be special-cased per manoeuvre.
- **Table below the published range.** The brief asks for 44 KIAS = 51 KCAS and 33 KIAS = 46 KCAS;
  below those the curves run straight to zero. That is an assumption (nothing is published) chosen
  because it is continuous and exactly invertible.
- **Flags.** Real vacuum instruments of this age have no warning flag. `attFlag`/`dgFlag` are true
  while spinning up (below 70 % rotor speed) and, for a gyro that was running, only once it has
  fallen below 45 % — about two minutes after a total suction loss — so the failure stays
  insidious, as the brief asks. A tumbled gyro raises no flag (the real one does not either).
- **Suction → rotor speed.** Full speed from 3.8 inHg up, speed ∝ √suction below. This keeps the
  gyros healthy at idle whatever idle suction the systems module reports.
- **Without a systems module** (as in the tests): suction is estimated from engine speed (5 inHg
  from 1,000 rpm, falling to zero at 150 rpm), electrical power is taken as available, and the
  ammeter is estimated. `failures.vacuum`, `.pitot`, `.staticPort` are always honoured.
- **With a systems module**: `sys.vacuumInHg` and `sys.busVolts` (> 9 V = powered) are used;
  `failures.vacuum` additionally forces zero suction here, so the gyros fail even if the systems
  module only sets the flag.
- **Airborne start with the engine off**: gyros start at speed (they coast for minutes and a
  windmilling propeller keeps turning the pump).
- **Heading indicator knob.** `dgMag` = gyro heading + `dgAdjustDeg` exactly in level flight. The
  knob really rotates the gyro reference, so the gimbal error stays tied to the *indicated* heading
  as in the real instrument.
- **Hour meter persists** across repositions and browser sessions — it is the aircraft's meter.
- **Seed.** Imperfections are derived from `options.seed` (default 1) and the spawn position,
  heading and altitude: the same start always behaves the same. Pass a different seed (for example
  a day number) for variety.
- **Fuel gauges "accurate at empty".** Light-aircraft fuel gauges are only required to read zero
  when the usable fuel is gone (14 CFR 23.1337(b)(1) as it applied to these aircraft); anywhere
  else they are approximate. The model's calibration error is therefore zero at empty by
  construction and up to about ±2 gal elsewhere. The size and shape of that error are invented.
- **Safety net.** If any model ever produced a non-number the instruments re-stabilise themselves
  rather than freezing the panel (never triggered in testing).

## 4. Outside sources

| source | licence | how it is used |
| --- | --- | --- |
| World Magnetic Model via the `geomagnetism` npm package (already a project dependency) — https://github.com/naturalatlas/geomagnetism ; model by NOAA/NCEI and the British Geological Survey | package Apache-2.0; WMM public domain | dip angle and field strength for the compass (`magneticField` helper) |
| Airspeed calibration table and stall speeds | values supplied in the project brief (Cessna 172P-class POH figures); facts, educational reference only | `airspeed.ts` |
| `mulberry32` random generator by Tommy Ettinger — https://gist.github.com/tommyettinger/46a874533244883189143505d203312c | public domain | re-typed from the published algorithm in `rng.ts` |
| FNV-1a hash constants — http://www.isthe.com/chongo/tech/comp/fnv/ | public domain | mixing the seed in `rng.ts` |
| Standard-atmosphere and pitot (impact pressure) formulas | textbook physics, no copyright | `airspeed.ts`, `core/math.ts` |
| General behaviour of the instruments and their errors as described in the FAA *Pilot's Handbook of Aeronautical Knowledge* (FAA-H-8083-25) and *Instrument Flying Handbook* (FAA-H-8083-15) | US Government works, public domain | background knowledge only — written from memory, no text or figures copied, and not consulted online during this work |

No code or data from FlightGear or any GPL source was used. No new npm packages.
Time constants, erection rate, drift sizes and gauge errors are my estimates of typical values for
older instruments, not measurements of a particular instrument.

## 5. What was verified, and how

Commands (run in `flightsim/`):

```
npx tsc --noEmit                    # no errors in src/instruments, tests/instruments or src/core
npx vitest run tests/instruments    # 6 files, 53 tests, all pass (about 14 s on an idle machine, 45 s when it was busy)
npx vitest run tests/core.test.ts tests/sun.test.ts   # still pass after the shared-file additions
```

The tests use `makeSim` (real JSBSim in Node) and a small robot pilot (`tests/instruments/pilot.ts`)
that flies real manoeuvres through `sim.controls` using the true state. Measured results:

- **Airspeed**: every table point reproduced; functions invert each other to 1e-6 for all flap
  angles. In flight: flaps 0 at 70.0 / 87.0 / 107.0 / 62.0 KCAS shows 70.0 / 90.0 / 110.0 / 60.0;
  flaps 10 at 61.9 / 79.0 shows 59.9 / 80.0; flaps 30 at 60.9 / 53.2 shows 59.9 / 50.3.
  Take-off roll: zero until 26 KCAS, then alive.
- **Altimeter**: at a 1,500 ft field with QNH 30.31 and 28 °C it reads 1,504 ft (the instrument is
  4.4 ft above the wheels); +0.01 inHg = +9.2 ft; +1.00 inHg = +903 ft. Lag in a 600 fpm climb < 8 ft.
- **VSI**: after a pull-up to a 1,080 fpm climb it shows 299 at 2 s, 767 at 4 s, 954 at 6 s,
  1,015 at 8 s, 1,044 at 10 s. Wrong-way kick about −40 fpm for half a second. Pegs at −2,000.
- **Turn coordinator**: 0.97 at a true 2.92°/s; flag at once on power loss, needle 0.90 after 2 s,
  0.30 after 30 s, 0.03 after 90 s while still turning at standard rate.
- **Ball**: right rudder with wings level (sideslip −6°, ny +0.07) → ball left (−0.4); left rudder →
  right; right wing low held with left rudder → ball right; coordinated turn → 0.00.
- **Compass** (16° bank, right turn, 40°N 100°W, dip 67°): from north the reading swings 29° the
  wrong way within 5 s while the aircraft turns 12° right, and the error is −41° after 12 s; from
  south the reading runs 39° ahead in the first 5 s and is still +21° ahead after 12 s. At 35°S
  149°E the two cases are reversed (from north it runs 40° ahead; from south it swings 28° the
  wrong way, −37° after 12 s). On the magnetic equator (12°S 77°W) the error after 12 s is −1.5°. Accelerating 80 → 92 kt heading east: −15°
  (toward north); decelerating: +15°; reversed in the south (+18° / −12°); within 2° on the magnetic
  equator; under 5° on a north heading. After rolling out of a turn it overshoots once and is
  within 2.5° ten seconds later. Straight and level it equals magnetic heading + deviation within
  0.6° on six headings.
- **Heading indicator**: 15 minutes level at 40°N: −2.70° (Earth rate −2.42°, own drift −1.17°/h);
  Sydney (34°S) parked 15 min: +1.57°; Singapore (1°N): −0.39°. `alignHeadingIndicator()` and the
  `dg-align` command bring it to the compass within 0.01°. Gimbal error up to 3.95° at 30° of bank,
  1.29° in a standard-rate turn, gone when level. Tumbles in a steep rolling manoeuvre and stays
  wrong (147° in the test) until aligned again.
- **Attitude indicator**: error after 180° at standard rate 1.84° pitch / −0.36° roll, after 360°
  0.2° / 0.3°; under 0.5° 75 s after rolling out; never above 2.5° through turns, a 30° bank turn,
  climb and descent. Take-off roll to 55 kt: 0.77° too nose-up. Tumbled at 102.1° of bank and at
  62.1° of pitch; 38° wrong after recovery, 35° a minute later. Vacuum failure: 0.2° after 30 s,
  0.9° after 60 s, 4° after 2 min, 9° after 3 min, 20° after 4 min, 30° after 5 min; flag appears at
  120 s after the failure, when the error is 3.6°. Low suction (0.3 inHg) reported by a stand-in
  systems module topples it as well (flag on, more than 8° wrong after 5 min).
- **Cold start**: horizon lopsided (−13° / +19°), flags on, nothing moves; after engine start it is
  within 1° after 66 s and the flags clear after 91 s.
- **Blockages**: pitot blocked at 3,500 ft showing 93 KIAS, 90 KCAS held: 133 KIAS at 3,940 ft,
  24 KIAS at 3,150 ft. Static blocked at 3,500 ft: at 3,775 ft climbing 490 fpm the altimeter still
  says 3,499, the VSI 0, the ASI 44; at 3,150 ft the ASI says 126.
- **Gauges**: tachometer within 15 rpm steady and behind after a throttle chop; hour meter +0.100 h
  per 6 min of engine running and unchanged by repositioning; empty tank reads 0.00, an 18 gal tank
  17.9; needles fall to E without power and take several seconds to return; ammeter (estimate, no
  systems module) +1.5 A with the alternator, −21.5 A on battery with the landing light on; it
  follows `sys.batteryAmps` when a systems module writes it.
- **Determinism**: two identical flights (turbulence, failure, aerobatics) give byte-identical
  `ind`; another seed differs.
- **Robustness**: 10 simulated minutes (72,000 steps) of random full-travel controls, flap, knob
  and failure changes in turbulence, including re-spawns after crashes: no non-number and no value
  out of range.
- **Cost**: 1.5 µs per physics step (measured over 600,000 calls), about 0.2 ms per simulated second.
- **Browser**: loaded into `dev/slice.html` in headless Chrome through the dev server on port 5323
  (dynamic import), flew a take-off to 300 ft: no console errors, all values finite, `dg-align`
  worked, hour meter written to `localStorage`. (This module draws nothing, so there is no
  instrument screenshot to judge.)

## 6. Known limitations — what is still unrealistic

- All time constants, the erection rate, drift sizes and gauge errors are typical-value estimates.
- Attitude indicator: the erection is modelled as a direct pull toward apparent gravity; real
  pendulous vanes act through precession with their own phase, so the *size* and washing-out of the
  turn error are right but the exact split between pitch and bank error at each point of a turn may
  differ from a particular instrument. The Earth's rotation is ignored for this gyro (in reality the
  erection hides it). Tumbling is stylised: a short random whirl, then left well off. No caging knob
  and no miniature-aircraft adjustment.
- Heading indicator: the spin axis is assumed to stay level; no latitude compensation nut (real
  ones are often adjusted for one latitude, which would cancel most of the Earth-rate drift there).
- Compass: a pendulum plus one rotation, first-order liquid swirl; fixed deviation that does not
  change with electrical loads; the compass is assumed to sit at the centre of gravity.
- Airspeed: position error depends only on KCAS and flap angle (really it depends on angle of
  attack, so weight, load factor and sideslip matter). Only the "everything blocked" pitot failure
  exists (with the drain open the real indicator would fall to zero). No pitot icing: the pitot
  heat switch has no effect here. No alternate static source.
- Altimeter and airspeed indicator have no scale error; a blocked line is perfectly sealed.
- Turn coordinator calibration is exact only near 100 kt (calculated, not flown: a true
  standard-rate turn would read about 0.985 at 120 kt and 1.013 at 80 kt).
- Fuel gauge error model and sender positions (inboard end of each tank) are assumptions.
- EGT is given in °F although the real gauge has no numbers; oil temperature cannot show below 75 °F.
- The vacuum-gyro flags do not exist on the real instruments.
- Without a systems module, suction, power and ammeter are estimates.

## 7. Shared-file changes (all additive)

- `src/core/magvar.ts`: appended `interface MagneticField` and `magneticField(lat, lon)` (dip and
  field strength, cached per 0.1°, same model object as `magneticVariation`). Appended to the end
  of the file with a shell append rather than the Edit tool; nothing existing was touched.
- `src/core/types.ts`: one optional field `SystemsState.batteryAmps?: number` (battery current for
  the ammeter). Optional, so `defaults.ts` did not need a change.
- `InstrumentState` was **not** changed.

## 8. For the integrator

- `sim.use(createInstruments())` **after** the systems module (so `state.sys` is fresh in the same
  step) — order relative to other modules does not matter.
- Systems module contract as read here: `sys.vacuumInHg` (about 4.5–5.4 normal, lower at idle, 0
  stopped), `sys.busVolts` (> 9 = electric instruments powered), `sys.alternatorOnline`, optional
  `sys.batteryAmps`, `sys.failures.{vacuum,pitot,staticPort}`, `sys.engineRunning`.
- Panel: `ind.ball` ±1 = end of tube (10° of tilt); `ind.turnRate` ±1 = standard rate, stops at
  ±2.2; `ind.fuel*Gal` 0–26; `ind.oilTempF` 75–250; `ind.attRoll` + = right wing down.
- Scoring should use truth values; `inst.status` and `INSTRUMENT_LIMITS` are there for explanation
  texts ("your attitude indicator tumbled because…").
- `tests/instruments/pilot.ts` (robot pilot, `makeRig`, `stubSystems`) may be useful to other tests.

## 9. Ideas not done

- Pitot icing in visible moisture below freezing unless pitot heat is on; "drain open" pitot
  blockage; alternate static source with its small reading error.
- Latitude nut option for the heading indicator; caging knob for the attitude indicator.
- Position error from angle of attack instead of speed.
- Small fixed scale errors per instrument; an altimeter that sticks until tapped; needle shake from
  engine vibration.
- Deviation that changes with electrical load; a printed compass correction card for the panel.
- Hour meter driven by an oil-pressure switch; unusable fuel on the gauges.

## 10. Three failing tests fixed (November 2026)

Three instrument tests had been failing (before and after the FlightGear-physics change). In all three
the **instrument model was right and the test was wrong**: the robot test pilot
(`tests/instruments/pilot.ts`) did not fly the manoeuvre the test describes. No instrument code,
limit or test threshold was changed; no test was skipped.

| test | what went wrong | fix |
| --- | --- | --- |
| compass: no acceleration error heading north (worst error must stay under 5°; was 5.95°) | When the throttle was closed the aircraft yawed and skidded right with the wings level. The robot's rudder caught up too slowly. Sideways acceleration tips the floating compass card just as a turn does, and heading north over the USA (67° of dip) that is northerly turning error — a real compass does the same. A copy of the compass with the dip removed stayed within 0.3°, which proves it was turning error and not acceleration error. | The robot keeps the ball centred three times more firmly (as a pilot does when changing power). Now 3.0°. |
| ball: slip with right wing low and left rudder (bank must exceed 4°; was 3.2°) | The ball was already correct (0.64 toward the low wing). The robot was asked for 10° of bank but stopped at 3.2°: its bank hold only pushed in proportion to the error, so against the crossed rudder it settled short. | The robot keeps adding aileron while the bank stays short, only while the bank is steady. Slip now at 10.1° bank, ball 0.67. The two skids before it are now really flown wings-level, as the test says. |
| attitude indicator tumbles past its bank limit (was: never tumbled) | The gimbal limit is 102° (real older instruments: about 100–110°). The robot held "nose level" by pulling the yoke even when nearly upside down, which drags the nose toward the ground (pitch fell to −58°) and stopped the roll at 100.6° — short of the stop. | New robot option `elevator` (hold the yoke still). The test rolls on with the yoke at neutral, like an aileron roll. Tumbles at 102.8°, is 22.8° wrong after recovery and 3.1° better a minute later (erection about 3° per minute). |

Verified with `npx vitest run` in `flightsim/`: 29 files, 408 of 408 tests pass; `npx tsc --noEmit`
clean. Diagnostics were done with temporary scripts that were deleted afterwards.
