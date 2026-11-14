/**
 * "Explain this instrument" content for the Avionics Lab. Plain-language, educational.
 */
export type InstrumentId =
  | "pfd"
  | "pfd-attitude"
  | "pfd-tapes"
  | "pfd-hsi"
  | "afcs"
  | "mfd"
  | "asi"
  | "ai"
  | "alt"
  | "tc"
  | "hi"
  | "vsi"
  | "compass"
  | "vor"
  | "hsi"
  | "adf"
  | "dme"
  | "ils"
  | "gps"
  | "autopilot"
  | "radios"
  | "transponder"
  | "engine"
  | "annunciators"
  | "switches";

export interface InstrumentInfo {
  title: string;
  shows: string;
  how: string;
  errors: string[];
  tip?: string;
}

export const INSTRUMENT_INFO: Record<InstrumentId, InstrumentInfo> = {
  pfd: {
    title: "Primary Flight Display (PFD)",
    shows:
      "Everything you need to control the aircraft on one screen: attitude in the centre, airspeed tape on the left, altitude and vertical speed on the right, the HSI (heading and navigation) at the bottom and the autopilot mode strip across the top.",
    how: "An AHRS (attitude & heading reference system — solid-state gyros, accelerometers and a magnetometer) provides attitude and heading. An air data computer turns pitot and static pressure into airspeed, altitude and vertical speed. GPS and the NAV radios drive the HSI.",
    errors: [
      "Fixating on one tape and losing the big picture — keep a scan going, just like with steam gauges.",
      "Confusing the cyan SELECTED values (bugs) with the white CURRENT values.",
      "Missing a red X: a red X means that data is invalid — go to the standby instruments.",
    ],
    tip: "Colour code: white = current, cyan = what you selected, magenta = GPS guidance, green = active/NAV radio, amber = caution, red = warning.",
  },
  "pfd-attitude": {
    title: "PFD attitude indicator",
    shows: "Pitch (ladder in degrees) and bank (scale at the top: 10, 20, 30, 45, 60°). The slip/skid bar under the bank pointer replaces the inclinometer ball. Magenta command bars are the flight director.",
    how: "AHRS sensors measure rotation rates and acceleration; software blends them into a stable attitude solution.",
    errors: ["Chasing the flight director without checking that the right MODE is selected.", "Stepping on the wrong rudder: step on the side the slip bar is displaced toward (like the ball)."],
  },
  "pfd-tapes": {
    title: "Airspeed & altitude tapes",
    shows:
      "Moving tapes with the current value in the black pointer box. Coloured bands on the airspeed tape: white = flap operating range, green = normal, yellow = caution (smooth air only), red line = never exceed. The magenta trend vector shows where the value will be in 6 seconds. Selected altitude (cyan) is shown above the altitude tape; the barometric setting below it.",
    how: "The air data computer measures pitot (ram) pressure and static pressure. Airspeed comes from the difference; altitude from static pressure corrected by the barometric setting.",
    errors: ["Forgetting to update the baro setting — every 0.01 inHg is 10 ft of error.", "Ignoring the trend vector, which gives early warning of a speed or altitude excursion."],
  },
  "pfd-hsi": {
    title: "Horizontal Situation Indicator (HSI)",
    shows:
      "A compass rose that rotates with heading, the cyan heading bug, the course pointer and the course deviation bar (magenta for GPS, green for VOR/LOC), TO/FROM indicator and the vertical deviation (glideslope or GPS glidepath) scale.",
    how: "Heading comes from the AHRS/magnetometer. The deviation bar shows how far you are from the selected course: each dot is 2° for a VOR, about 0.5° for a localizer and a set distance for GPS (2 nm en route, 1 nm terminal, 0.3 nm approach).",
    errors: ["Flying the wrong CDI source — check the label (GPS / VOR1 / LOC1).", "Forgetting to set the course on a VOR: the bar is meaningless until the course matches your intended radial."],
  },
  afcs: {
    title: "Autopilot mode annunciations",
    shows: "Top strip of the PFD. Green = ACTIVE mode (what the autopilot/flight director is doing now). White = ARMED mode (will activate automatically when captured). Target values follow the active vertical mode.",
    how: "The flight director computes pitch and roll commands for the selected modes; with AP engaged, servos fly those commands.",
    errors: ["Assuming a mode is active when it is only armed (white).", "Not confirming the annunciation after pressing a button — 'What's it doing now?'"],
  },
  mfd: {
    title: "Multi-Function Display (MFD)",
    shows: "Moving map with flight plan, airports, VORs, relative terrain, simulated weather and traffic, plus engine indications, nearest airports and the flight plan page.",
    how: "GPS position is placed on a database map. Terrain is coloured relative to your altitude: red = terrain within 100 ft of (or above) you, yellow = within 1,000 ft.",
    errors: ["Using the map for terrain or traffic avoidance instead of looking outside — these are awareness aids only.", "Wrong map range: zoom in for the airport, out for the big picture."],
  },
  asi: {
    title: "Airspeed indicator",
    shows: "Indicated airspeed in knots. White arc: flap operating range (Vso–Vfe). Green arc: normal operating range (Vs1–Vno). Yellow arc: caution range — smooth air only (Vno–Vne). Red line: Vne.",
    how: "Compares ram air pressure from the pitot tube with static pressure. The difference (dynamic pressure) moves the needle.",
    errors: ["Blocked pitot tube (and drain): the ASI acts like an altimeter — reads higher as you climb, lower as you descend.", "Blocked static port: reads low in a climb, high in a descent.", "Forgetting that TAS and groundspeed differ from IAS at altitude and in wind."],
  },
  ai: {
    title: "Attitude indicator",
    shows: "Pitch and bank relative to the natural horizon. The miniature aircraft is fixed; the horizon moves behind it.",
    how: "A vacuum- (or electrically-) driven gyroscope spins rapidly and keeps its orientation in space (rigidity in space).",
    errors: ["Vacuum failure: the gyro slowly spins down and the display tilts — often without a warning flag. Cross-check the turn coordinator, heading indicator and altimeter.", "Small acceleration/turn errors after long turns (precession)."],
    tip: "Partial panel: cover the failed instrument, use the turn coordinator for bank, and the altimeter/VSI/ASI for pitch.",
  },
  alt: {
    title: "Altimeter",
    shows: "Altitude above mean sea level. Long pointer = hundreds, short wide pointer = thousands, thin pointer with triangle = ten-thousands. The Kollsman window shows the barometric setting in inches of mercury.",
    how: "Sealed aneroid wafers expand as static pressure falls with height. The Kollsman setting corrects for the actual sea-level pressure.",
    errors: ["Not setting the local altimeter setting — 'high to low, look out below'.", "Misreading the three pointers by 1,000 ft.", "Blocked static port: altimeter freezes."],
    tip: "Turn the knob to set the current altimeter setting from ATIS or ATC (in the lab: the weather QNH).",
  },
  tc: {
    title: "Turn coordinator",
    shows: "Rate of turn (the miniature aircraft) and coordination (the ball). Wings on the 'L'/'R' mark = standard-rate turn, 3°/second (360° in 2 minutes).",
    how: "An electric gyro canted about 30° senses both roll and yaw rate. The ball is a simple inclinometer in a liquid-filled tube.",
    errors: ["Reading it as a bank indicator — it shows rate of turn, not bank angle.", "'Step on the ball': press the rudder on the side the ball is displaced to centre it."],
    tip: "It runs on electricity, so it still works after a vacuum failure — your main bank reference on partial panel.",
  },
  hi: {
    title: "Heading indicator (directional gyro)",
    shows: "Magnetic heading on a rotating compass card, with an adjustable heading bug used by the autopilot.",
    how: "A gyroscope keeps its orientation; the card does not suffer the compass's turning and acceleration errors, but it drifts (precession) and must be aligned with the magnetic compass about every 15 minutes.",
    errors: ["Forgetting to realign with the compass.", "Vacuum failure: the card stops or drifts — fly by the magnetic compass."],
    tip: "Push the HDG knob to sync the bug to the current heading.",
  },
  vsi: {
    title: "Vertical speed indicator",
    shows: "Rate of climb or descent in feet per minute.",
    how: "A diaphragm connected to static pressure, inside a case vented through a calibrated leak. The pressure difference while climbing or descending deflects the needle.",
    errors: ["It lags several seconds behind — use it for trend, not as the primary pitch instrument.", "Blocked static port: reads zero."],
  },
  compass: {
    title: "Magnetic compass",
    shows: "Magnetic heading from a free-floating card. It is the only heading reference independent of electrical or vacuum power.",
    how: "A magnet on a card floats in liquid and aligns itself with the Earth's magnetic field.",
    errors: [
      "Northerly turning error: turning from north the compass lags; turning from south it leads ('UNOS' — undershoot north, overshoot south).",
      "Acceleration error on east/west headings: 'ANDS' — accelerate north, decelerate south.",
      "The card reads 'backwards': higher numbers appear to the LEFT of the lubber line.",
    ],
  },
  vor: {
    title: "VOR / CDI indicator",
    shows: "The course deviation needle (CDI), the OBS (omni-bearing selector) course at the top, the TO/FROM flag and — when tuned to an ILS — the glideslope needle.",
    how: "A VOR transmits 360 radials. The receiver compares two signals to find which radial you are on and shows how far the course you selected is from it (each dot = 2°).",
    errors: ["Reverse sensing: flying with a FROM indication when heading to the station. Set the course so the flag agrees with your direction.", "Not identifying the station by its Morse code before using it.", "Near the station the needle swings and the flag may show OFF (cone of confusion)."],
    tip: "To find your radial: turn the OBS until the needle centres with a FROM flag — the course is your radial.",
  },
  hsi: {
    title: "Mechanical HSI",
    shows: "A heading indicator and a VOR/LOC/GPS indicator combined: the course arrow points along your selected course and the deviation bar shows where that course is.",
    how: "Heading from a slaved gyro; course deviation from the selected NAV source.",
    errors: ["Selecting the course on the wrong source.", "Back-course reverse sensing — not an issue with an HSI if the front course is set."],
  },
  adf: {
    title: "ADF (automatic direction finder)",
    shows: "Relative bearing to a tuned NDB (non-directional beacon): the needle points at the station. Magnetic bearing to station = magnetic heading + relative bearing.",
    how: "A loop antenna and a sense antenna determine the direction of the low/medium-frequency signal.",
    errors: ["Forgetting that the needle shows RELATIVE bearing on a fixed card.", "Thunderstorms, coastlines and night effect deflect the needle."],
    tip: "Simulator: training NDBs only (not real-world stations).",
  },
  dme: {
    title: "DME (distance measuring equipment)",
    shows: "Slant-range distance to the VOR/DME station, groundspeed toward or away from it, and time to station.",
    how: "The aircraft sends pulses; the ground station replies; the time delay gives distance.",
    errors: ["Slant range: directly over the station at altitude the DME shows your height in nm, not zero.", "DME groundspeed is only accurate when flying directly to or from the station."],
  },
  ils: {
    title: "ILS indicator",
    shows: "Localizer (lateral, vertical needle) and glideslope (vertical, horizontal needle) deviation, plus marker beacon lights (OM blue, MM amber).",
    how: "The localizer is about 4× more sensitive than a VOR (full scale ≈ 2.5°). The glideslope is a 3° path with full scale ≈ ±0.7°.",
    errors: ["Chasing the needles with large corrections — use small heading changes.", "Not setting the inbound course (harmless on a CDI, but needed for the HSI).", "Descending below the glideslope to 'catch' it — intercept from below and let it come down to you."],
  },
  gps: {
    title: "TX-750 Navigator (GPS)",
    shows: "Moving map, navigation data (DTK, TRK, DIS, ETE), flight plan, direct-to, nearest airports, airport information and approach (procedure) selection.",
    how: "Satellite position + a database of waypoints. With the CDI on GPS, the HSI shows magenta guidance and the autopilot NAV mode flies the active leg.",
    errors: ["Flying the wrong leg — check the magenta active leg.", "Forgetting to switch the CDI to VLOC for an ILS.", "'Programming while flying' — fly first, then program; use heading mode while editing."],
    tip: "Approaches here are simulator-generated TRAINING PROCEDURES, not published IAPs.",
  },
  autopilot: {
    title: "Autopilot / flight director controller",
    shows: "Mode buttons with lights: lateral (HDG, NAV, APR), vertical (ALT, VS, FLC), AP (servos), FD (command bars) and YD (yaw damper), the nose UP/DN wheel and knobs for heading, altitude and course.",
    how: "The flight director computes the attitude needed to fly the selected modes. The autopilot servos then move the controls. Armed modes (white) capture automatically.",
    errors: ["Not knowing what the autopilot will do next — always confirm the annunciations on the PFD.", "Forgetting to set the selected altitude before a climb or descent: VS/FLC will fly through it.", "Fighting the autopilot — a strong control input disconnects it."],
  },
  radios: {
    title: "Radios (COM, NAV, ADF)",
    shows: "Active and standby frequencies. Tune the standby with the knobs (outer = MHz, inner = kHz) then swap it to active.",
    how: "COM radios are for voice (118.000–136.975 MHz). NAV receivers (108.00–117.95 MHz) receive VORs and localizers. Always identify a NAV station by its Morse code.",
    errors: ["Tuning the active frequency directly and losing ATC.", "Not identifying the NAV station."],
  },
  transponder: {
    title: "Transponder",
    shows: "The 4-digit squawk code (digits 0–7 only) and the mode: STBY (off-line), ON (Mode A: code only), ALT (Mode C/S: code + altitude).",
    how: "Replies to ground radar interrogations so ATC sees your code and altitude. IDENT highlights your target on the controller's screen for ~18 s.",
    errors: ["Passing through 7500/7600/7700 when changing codes — VFR pilots should change carefully (in practice: go to STBY briefly on older units).", "Leaving the transponder in STBY after takeoff."],
    tip: "Emergency codes: 7700 emergency, 7600 radio failure, 7500 unlawful interference. 1200 = VFR (US).",
  },
  engine: {
    title: "Engine indications",
    shows: "RPM, manifold pressure (constant-speed props), fuel flow, fuel quantity, oil pressure & temperature, bus volts and ammeter.",
    how: "Sensors on the engine and electrical bus. Green arcs = normal, yellow = caution, red = limits.",
    errors: ["Not scanning the engine gauges in cruise.", "Ignoring a negative ammeter: it means the battery is discharging (alternator off-line)."],
  },
  annunciators: {
    title: "Annunciator panel",
    shows: "Warnings (red, flashing) need immediate action; cautions (amber) need attention soon.",
    how: "Each system monitors its own sensors and lights the annunciation when a limit is exceeded or a failure is detected.",
    errors: ["Silencing an alert without diagnosing it.", "Not following the checklist in the POH/AFM."],
  },
  switches: {
    title: "Switches & engine controls",
    shows: "Master (battery and alternator), avionics master, lights, pitot heat, carburetor heat, fuel selector, mixture and the starter.",
    how: "The battery master powers the bus; the alternator charges it once the engine runs. The avionics master powers the radios and displays.",
    errors: ["Starting the engine with the avionics master ON (voltage spikes).", "Forgetting pitot heat in visible moisture near freezing."],
  },
};
