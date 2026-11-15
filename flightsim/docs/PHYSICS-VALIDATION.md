# Flight-model validation — TeachX Flight Simulator

This page is **written by an automated test** (`tests/physics/validation.test.ts`). To regenerate it:

```bash
cd flightsim && npx vitest run tests/physics/validation.test.ts
```

The test flies the real simulator (the same JSBSim flight model the browser loads, in
`public/jsbsim/`) with a scripted test pilot, measures each quantity, and compares it with
Cessna 172P *Pilot's Operating Handbook*-class figures. The raw numbers are in
`docs/physics-validation.json`.

**Read this first.** The simulator is a learning aid, not an approved training device. The
"published" figures below are the handbook-class reference values listed in the project's
validation brief (2,400 lb, sea level, standard day unless noted); they are for education only —
always use the handbook of the real aircraft you fly. A "pass" means the simulation is inside the
accepted range, not that it is certified to behave like the aircraft.

Result of the last run: **66 of 66 checks passed.**

Unless a row says otherwise: 2,400 lb (maximum weight), flaps up, standard atmosphere, no wind.
"KIAS" (what the airspeed indicator shows) is converted to the calibrated airspeed the flight model
works in with the handbook's airspeed-calibration table (`src/physics/constants.ts`).

## 1. Performance against handbook-class figures

| Quantity | Published | Simulated | Accepted range | Result | How it was measured |
| --- | --- | --- | --- | --- | --- |
| Stall speed, flaps up, power idle | 51 KCAS (44 KIAS) | 51.1 KCAS | 48.0 to 54.0 KCAS | pass | idle power, slow down 1 kt per second with the elevator until the yoke is fully back or the nose drops; lowest calibrated airspeed |
| Stall speed, flaps 30°, power idle | 46 KCAS (33 KIAS) | 46.3 KCAS | 43.0 to 49.0 KCAS | pass | idle power, slow down 1 kt per second with the elevator until the yoke is fully back or the nose drops; lowest calibrated airspeed |
| Stall speed at 1,900 lb, flaps up | 45.5 KCAS (2,400 lb value × √ of the weight ratio) | 46.2 KCAS | 43.5 to 47.5 KCAS | pass | same manoeuvre at 1,900 lb, compared with the square-root-of-weight rule |
| Rate of climb, sea level, 76 KIAS | 700 ft/min | 713 ft/min | 620 to 780 ft/min | pass | full throttle, constant indicated airspeed, height gained over 30 s centred on the altitude; mixture rich |
| Rate of climb, 6,000 ft, 73 KIAS | about 485 ft/min | 450 ft/min | 405 to 565 ft/min | pass | full throttle, constant indicated airspeed, height gained over 30 s centred on the altitude; mixture leaned for most power, as the handbook asks above 3,000 ft |
| Rate of climb, 12,000 ft, 70 KIAS | small (service ceiling 13,000 ft) | 202 ft/min | 0 to 250 ft/min | pass | full throttle, constant indicated airspeed, height gained over 30 s centred on the altitude; mixture leaned for most power |
| Rate of climb, sea level, at 1,900 lb | clearly better than at 2,400 lb | 1055 ft/min | 863 to 1500 ft/min | pass | full throttle, constant indicated airspeed, height gained over 30 s centred on the altitude; 500 lb lighter |
| Glide ratio, 65 KIAS, propeller windmilling | 9.1 to 1 (1.5 nm per 1,000 ft) | 9.19 to 1 | 8.10 to 10.10 to 1 | pass | throttle closed, constant 65 KIAS for 60 s in still air: distance flown divided by height lost |
| Static rpm, full throttle, brakes held | 2300 to 2420 rpm | 2360 rpm | 2300 to 2420 rpm | pass | on the runway, brakes held, full throttle, mixture rich, 12 s |
| Power at full throttle and 2700 rpm, sea level | 160 bhp (rated) | 162 bhp | 152 to 168 bhp | pass | full throttle; the pilot adjusts the airspeed until the fixed-pitch propeller turns 2700 rpm |
| Cruise speed, 8,000 ft, about 75 % power | 118 to 121 KTAS | 119 KTAS | 118 to 121 KTAS | pass | level at 8,000 ft, full throttle, mixture leaned to peak exhaust temperature (the handbook's recommended lean), 70 s to settle |
| Cruise fuel flow, 8,000 ft, leaned | about 8.4 gal/h | 8.31 gal/h | 7.40 to 9.40 gal/h | pass | level at 8,000 ft, full throttle, mixture leaned to peak exhaust temperature (the handbook's recommended lean), 70 s to settle |
| Cruise power, 8,000 ft, full throttle | about 75 % of 160 bhp | 72.7 % | 68.0 to 80.0 % | pass | level at 8,000 ft, full throttle, mixture leaned to peak exhaust temperature (the handbook's recommended lean), 70 s to settle |
| Cruise rpm, 8,000 ft, full throttle | about 2550 to 2600 rpm | 2614 rpm | 2500 to 2700 rpm | pass | level at 8,000 ft, full throttle, mixture leaned to peak exhaust temperature (the handbook's recommended lean), 70 s to settle |
| Maximum level speed, sea level | 123 kt | 126 kt | 118 to 128 kt | pass | level flight at sea-level density, full throttle but not above the 2700 rpm red line, 70 s to settle |
| Take-off ground roll | 890 ft | 904 ft | 740 to 1040 ft | pass | flaps 10°, brakes held, full throttle, release; nose up at 51 KIAS; climb at 56 KIAS; paved, level, no wind |
| Take-off distance to clear 50 ft | 1625 ft | 1699 ft | 1375 to 1875 ft | pass | flaps 10°, brakes held, full throttle, release; nose up at 51 KIAS; climb at 56 KIAS; paved, level, no wind |
| Lift-off speed | 51 to 56 KIAS | 53.9 KIAS | 50.0 to 57.0 KIAS | pass | calibrated airspeed when the wheels leave the runway, converted with the flaps-10 calibration table |
| Landing ground roll, maximum braking | 540 ft | 497 ft | 390 to 690 ft | pass | flaps 30°, power off, 61 KIAS at 50 ft, flare, then full braking with the yoke held back |
| Touchdown speed in that landing | about 50 kt | 46.8 KCAS | 42.0 to 53.0 KCAS | pass | flaps 30°, power off, 61 KIAS at 50 ft, flare, then full braking with the yoke held back |
| Landing distance from 50 ft | 1280 ft | 1204 ft | 1000 to 1560 ft | pass | flaps 30°, power off, 61 KIAS at 50 ft, flare, then full braking with the yoke held back |

## 2. Handling qualities

There are no handbook numbers for most of these; the "expected" column says what a pilot of the real
aircraft would expect to see, and the accepted range is what the tests enforce.

| Quantity | Expected | Simulated | Accepted range | Result | How it was measured |
| --- | --- | --- | --- | --- | --- |
| Hands-off cruise: largest bank in 60 s | within 5° | 0.05 ° | 0.00 to 5.00 ° | pass | 2000 lb, 3000 ft, 100 KIAS, trimmed, then hands and feet off for 60 s |
| Hands-off cruise: largest heading change in 60 s | within 5° | 0.12 ° | 0.00 to 5.00 ° | pass | 2000 lb, 3000 ft, 100 KIAS, trimmed, then hands and feet off for 60 s |
| Vy climb: right rudder needed to centre the ball | clearly needed | 12.0 % of travel | 6.0 to 35.0 % of travel | pass | full-power climb at 76 KIAS, 2,400 lb; coordinated, average rudder held |
| Vy climb: heading change 15 s after letting go | to the left | -89.3 ° | -170.0 to -10.0 ° | pass | full-power climb at 76 KIAS, 2,400 lb; trimmed, then hands and feet off (negative = left) |
| Vy climb: bank 15 s after letting go | left wing down | -38.7 ° | -75.0 to -5.0 ° | pass | full-power climb at 76 KIAS, 2,400 lb; trimmed, then hands and feet off (negative = left) |
| Vy climb: sideslip with feet on the floor | ball out to the right | 2.68 ° | 0.80 to 8.00 ° | pass | full-power climb at 76 KIAS, 2,400 lb; wings held level with aileron, no rudder |
| Take-off: largest rudder used to stay on the centreline | right rudder, most at lift-off | 19.8 % of travel | 8.0 to 60.0 % of travel | pass | calm-wind handbook take-off flown by the test pilot |
| Angle of attack at maximum lift, flaps up | 16° (constants.ts) | 16.0 ° | 15.0 to 17.0 ° | pass | 2,100 lb (two people, full fuel), idle, 1 kt/s, yoke then held fully back for 2 s with the ailerons untouched |
| Angle of attack at maximum lift, flaps 30° | 14° (constants.ts) | 14.0 ° | 13.0 to 15.0 ° | pass | 2,100 lb (two people, full fuel), idle, 1 kt/s, yoke then held fully back for 2 s with the ailerons untouched |
| Stall: how far the nose drops with the yoke held back | a clear nose-drop | 10.6 ° | 5.0 to 40.0 ° | pass | 2,100 lb (two people, full fuel), idle, 1 kt/s, yoke then held fully back for 2 s with the ailerons untouched |
| Stall, coordinated: bank reached in those 2 s | wings stay nearly level | 12.5 ° | 0.0 to 25.0 ° | pass | 2,100 lb (two people, full fuel), idle, 1 kt/s, yoke then held fully back for 2 s with the ailerons untouched |
| Stall recovery: time until the wing flies again | immediate | 0.33 s | 0.00 to 1.50 s | pass | back-pressure released; time until the angle of attack is below 12° |
| Power-on stall, feet on the floor: bank after 2 s | left wing drops | -114 ° | -180 to -20 ° | pass | full throttle, no rudder at all, yoke held back 2 s after the break (negative = left) |
| Skidding stall, right rudder: bank after 2 s | right wing drops | 38.9 ° | 15.0 to 180.0 ° | pass | idle; 60 % right rudder put in at the break, yoke held back 2 s |
| Skidding stall, left rudder: bank after 2 s | left wing drops | -20.2 ° | -180.0 to -15.0 ° | pass | idle; 60 % left rudder put in at the break, yoke held back 2 s |
| Spin left: rate of turn | sustained, roughly 2 to 3 s per turn | 140 °/s | 70 to 240 °/s | pass | 2,100 lb, idle; at the stall full aft yoke and full rudder held 16 s; averages over the last 6 s |
| Spin left: angle of attack | well beyond the stall | 38.1 ° | 25.0 to 55.0 ° | pass | 2,100 lb, idle; at the stall full aft yoke and full rudder held 16 s; averages over the last 6 s |
| Spin left: airspeed | low and steady | 67.8 KCAS | 45.0 to 85.0 KCAS | pass | 2,100 lb, idle; at the stall full aft yoke and full rudder held 16 s; averages over the last 6 s |
| Spin left: airspeed wander | roughly steady | 1.3 kt | 0.0 to 10.0 kt | pass | highest minus lowest calibrated airspeed over the last 6 s |
| Spin left: rate of descent | high | 7615 ft/min | 4500 to 10000 ft/min | pass | 2,100 lb, idle; at the stall full aft yoke and full rudder held 16 s; averages over the last 6 s |
| Spin left: turns to stop after recovery controls | within about 1½ turns | 0.27 turns | 0.00 to 1.50 turns | pass | power idle, ailerons neutral, full opposite rudder, yoke forward; until rotation has stopped |
| Spin right: rate of turn | sustained, roughly 2 to 3 s per turn | 157 °/s | 70 to 240 °/s | pass | 2,100 lb, idle; at the stall full aft yoke and full rudder held 16 s; averages over the last 6 s |
| Spin right: angle of attack | well beyond the stall | 37.2 ° | 25.0 to 55.0 ° | pass | 2,100 lb, idle; at the stall full aft yoke and full rudder held 16 s; averages over the last 6 s |
| Spin right: airspeed | low and steady | 68.9 KCAS | 45.0 to 85.0 KCAS | pass | 2,100 lb, idle; at the stall full aft yoke and full rudder held 16 s; averages over the last 6 s |
| Spin right: airspeed wander | roughly steady | 3.4 kt | 0.0 to 10.0 kt | pass | highest minus lowest calibrated airspeed over the last 6 s |
| Spin right: rate of descent | high | 7742 ft/min | 4500 to 10000 ft/min | pass | 2,100 lb, idle; at the stall full aft yoke and full rudder held 16 s; averages over the last 6 s |
| Spin right: turns to stop after recovery controls | within about 1½ turns | 0.32 turns | 0.00 to 1.50 turns | pass | power idle, ailerons neutral, full opposite rudder, yoke forward; until rotation has stopped |
| Spin right: turns to stop after simply letting go | stops by itself | 0.74 turns | 0.00 to 2.50 turns | pass | all controls released instead of the standard recovery |
| Ground effect: float distance 2 ft above the runway | longer than out of ground effect | 133 % of free-air | 115 to 170 % of free-air | pass | throttle closed, level, distance to slow from 68 to 58 KCAS, compared with the same far from the ground |
| Ground effect: lift/drag ratio 2 ft above the runway | better (less induced drag) | 1.41 × free-air | 1.15 to 1.80 × free-air | pass | ratio of aerodynamic lift to drag passing 63 KCAS in that manoeuvre |
| Ground effect one wingspan up (36 ft) | almost none | 100 % of free-air | 97 to 106 % of free-air | pass | same manoeuvre with the wheels 36 ft above the surface |
| Crosswind take-off (15 kt): furthest from the centreline on the runway | stays on the centreline | 5.6 ft | 0.0 to 20.0 ft | pass | worse of wind from the left and from the right; aileron into wind, rudder to keep straight |
| Crosswind take-off with feet on the floor: heading swing on the runway | weathervanes into the wind | 57.4 ° | 15.0 to 180.0 ° | pass | same wind, rudder not used |
| Crosswind landing (15 kt): sideways drift angle at touchdown | small | 1.6 ° | 0.0 to 6.0 ° | pass | crab on the approach, wing-low for the last 150 ft; worse of left and right wind |
| Crosswind landing (15 kt): furthest from the centreline in the roll-out | stays on the runway | 46.1 ft | 0.0 to 75.0 ft | pass | same landings, from touchdown to stop |
| Crosswind landing with no correction: drift angle at touchdown | large (drifts off the centreline) | 17.2 ° | 8.0 to 40.0 ° | pass | wings level, feet still, heading down the runway |
| Flap travel time per 10° | about 3 s | 3.00 s | 2.60 to 3.40 s | pass | time from moving the handle one notch until the flaps arrive |
| Flaps 30° at 70 KIAS: extra power to hold level | much more than flaps up | 59.4 hp | 20.0 to 90.0 hp | pass | level flight at 70 KIAS, flaps 30° against flaps up |
| Flaps 30° at 70 KIAS: change of trim | nose-down trim needed | -41.1 % of trim travel | -60.0 to -5.0 % of trim travel | pass | trim position for hands-off level flight, flaps 30° against flaps up (the trim wheel runs from −100 to +100) |
| Trim position for 60 KIAS, level | inside the trim range | 36.7 % nose-up | 5.0 to 90.0 % nose-up | pass | level flight at 2,400 lb; trim wound until no yoke force is needed |
| Trim position for 120 KIAS, level | inside the trim range | -22.3 % nose-up | -90.0 to -5.0 % nose-up | pass | level flight at 2,400 lb; trim wound until no yoke force is needed |
| Engine start: cranking time | about 1 to 3 s | 2.55 s | 0.80 to 3.20 s | pass | parked, mixture rich, magnetos both, starter held until the engine runs |
| Idle rpm after start, throttle 10 % | about 600 to 1000 rpm | 823 rpm | 550 to 1050 rpm | pass | 8 s after releasing the starter |
| Magneto check at 1700 rpm: drop on one magneto | about 50 to 150 rpm | 94.0 rpm | 50.0 to 150.0 rpm | pass | 1700 rpm on both magnetos, then one magneto only |
| Power lost with powerLoss = 0.1 (for example carburettor ice) | about 10 % | 10.1 % | 6.0 to 14.0 % | pass | static full-throttle power with and without the 10 % loss requested by the systems module |

## 3. What these numbers do not show

See `docs/notes/physics.md` for the full, honest list. In short: the stall and spin behaviour is
built from textbook aerodynamics and tuned to feel right, not matched to flight-test data; engine
temperatures are JSBSim's simple model; and the left-turning tendencies are physically reasoned
estimates sized so that the rudder needed in the climb and on the take-off roll is plausible.
