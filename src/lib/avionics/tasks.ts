/**
 * Avionics Lab training tasks (ids are stored in TrainingState.avionicsTasks).
 *
 * Each task has a live `check(snapshot, memory)` evaluated every frame by the Avionics Lab.
 * A task completes when its check passes continuously for ~2 seconds.
 * `memory` is a small per-task scratch object kept by the evaluator so a task can require a
 * sequence (e.g. "VS climb with ALTS armed" THEN "ALT captured").
 */
import { norm180 } from "@/lib/geo";
import type { SimEngine } from "@/sim/engine";
import type { SimSnapshot } from "@/sim/types";
import { applyPreset } from "./scenarios";

export type AvionicsCategory = "pfd" | "mfd" | "gps" | "nav" | "autopilot" | "radios" | "steam";

export const AVIONICS_CATEGORY_LABELS: Record<AvionicsCategory, string> = {
  pfd: "Flight display",
  mfd: "Multi-function display",
  gps: "GPS navigator",
  nav: "Radio navigation",
  autopilot: "Autopilot",
  radios: "Radios & transponder",
  steam: "Steam gauges",
};

export interface TaskMemory {
  saw?: boolean | undefined;
  t0?: number | undefined;
  alt0?: number | undefined;
}

export type LabDisplay = "glass" | "sixpack" | "nav" | "gps" | "autopilot";

export interface AvionicsTask {
  id: string;
  title: string;
  description: string;
  category: AvionicsCategory;
  /** Step-by-step instructions shown while the task is selected. */
  instructions: string[];
  /** Live completion check (must hold for ~2 s). */
  check: (snap: SimSnapshot, mem?: TaskMemory) => boolean;
  /** What this teaches and why it matters. */
  explain: string;
  /** Optional one-line live status for the current task. */
  status?: (snap: SimSnapshot) => string;
  /** Optional scenario set-up (reposition / inject a failure). */
  setup?: { label: string; run: (engine: SimEngine) => void };
  /** Display tab that suits the task best. */
  display?: LabDisplay;
}

const on = (s: SimSnapshot) => s.ap.fd || s.ap.engaged;
const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;
const angNear = (a: number, b: number, tol: number) => Math.abs(norm180(a - b)) <= tol;
const r0 = (n: number) => Math.round(n);

export const AVIONICS_TASKS: AvionicsTask[] = [
  {
    id: "baro-set",
    title: "Set the altimeter",
    description: "Set the Kollsman window / BARO to the local altimeter setting.",
    category: "steam",
    display: "sixpack",
    instructions: [
      "Read the local altimeter setting shown in the status line (in real life: ATIS or ATC).",
      "Turn the altimeter knob (bottom-left of the altimeter) or the BARO knob on the radio stack.",
      "Stop when the Kollsman window matches the local setting (±0.02 inHg).",
    ],
    check: (s) => near(s.radios.altimeterInHg, s.weather.qnhInHg, 0.02),
    status: (s) =>
      `Kollsman ${s.radios.altimeterInHg.toFixed(2)} · local altimeter ${s.weather.qnhInHg.toFixed(2)} inHg · indicated ${r0(s.indicated.altFt)} ft`,
    explain:
      "The altimeter measures pressure, not height. Each 0.01 inHg is about 10 ft. Flying from high to low pressure with the old setting makes the altimeter read too high — you are lower than you think ('high to low, look out below').",
    setup: {
      label: "Mis-set altimeter to 29.92",
      run: (e) => e.setRadios({ altimeterInHg: 29.92 }),
    },
  },
  {
    id: "hdg-mode",
    title: "Heading bug & HDG mode",
    description: "Set the heading bug to 270° and let HDG mode turn the aircraft.",
    category: "autopilot",
    display: "autopilot",
    instructions: [
      "Turn the HDG knob until the cyan heading bug reads 270°.",
      "Press HDG (and AP to let the autopilot fly it, or follow the flight director by hand).",
      "Watch the PFD: 'HDG' in green = active. The aircraft turns at about standard rate and rolls out on 270°.",
    ],
    check: (s) =>
      on(s) &&
      s.ap.lateral === "HDG" &&
      angNear(s.radios.hdgBug, 270, 2) &&
      angNear(s.indicated.headingMag, 270, 5),
    status: (s) =>
      `Bug ${String(s.radios.hdgBug).padStart(3, "0")}° · heading ${String(r0(s.indicated.headingMag)).padStart(3, "0")}° · lateral ${on(s) ? s.ap.lateral : "OFF"}`,
    explain:
      "HDG mode flies to the heading bug. It is the most-used lateral mode: ATC vectors ('fly heading 270'), intercepting courses and holding a heading while you program the GPS. The bank is limited to roughly a standard-rate turn.",
  },
  {
    id: "alt-hold",
    title: "Engage altitude hold",
    description: "Engage the autopilot and hold your current altitude with ALT.",
    category: "autopilot",
    display: "autopilot",
    instructions: [
      "Press AP to engage the autopilot (FD comes on automatically).",
      "Press ALT. The PFD shows 'ALT' in green.",
      "Confirm the altitude stays steady and the VSI shows close to zero.",
    ],
    check: (s) => s.ap.engaged && s.ap.vertical === "ALT" && Math.abs(s.indicated.vsFpm) < 150,
    status: (s) =>
      `AP ${s.ap.engaged ? "ON" : "OFF"} · vertical ${on(s) ? s.ap.vertical : "—"} · VS ${r0(s.indicated.vsFpm)} fpm`,
    explain:
      "ALT holds the altitude at the moment you press it (it does not climb to the selected altitude). Always confirm the green annunciation — pressing a button is not the same as the mode being active.",
  },
  {
    id: "vs-climb",
    title: "VS climb & altitude capture",
    description: "Climb 1,000 ft at 500 fpm and let ALTS capture the selected altitude.",
    category: "autopilot",
    display: "glass",
    instructions: [
      "Set the selected altitude (ALT knob) 1,000 ft above you — cyan above the altitude tape.",
      "Engage AP and press VS. Use UP until the VS target reads +500 fpm. Add climb power.",
      "Check the PFD: 'VS' green, 'ALTS' white (armed).",
      "Wait for the capture: ALTS → ALT in green. Reduce power to cruise once level.",
    ],
    check: (s, m = {}) => {
      if (
        s.ap.vertical === "VS" &&
        s.ap.verticalArmed === "ALTS" &&
        s.radios.vsBug >= 300 &&
        s.radios.altBug >= s.indicated.altFt + 400
      )
        m.saw = true;
      return (
        !!m.saw && s.ap.vertical === "ALT" && near(s.indicated.altFt, s.radios.altBug, 100) && on(s)
      );
    },
    status: (s) =>
      `Selected ${s.radios.altBug} ft · alt ${r0(s.indicated.altFt)} · ${on(s) ? s.ap.vertical : "—"} ${s.ap.verticalArmed ?? ""} · VS target ${s.radios.vsBug}`,
    explain:
      "Vertical speed mode climbs or descends at a fixed rate. It does NOT protect airspeed: a high VS target with low power slows the aircraft toward a stall. ALTS (armed) captures the selected altitude — forget to set it and VS keeps climbing.",
  },
  {
    id: "flc-climb",
    title: "FLC climb",
    description:
      "Climb with Flight Level Change at a constant airspeed and capture the selected altitude.",
    category: "autopilot",
    display: "glass",
    instructions: [
      "Set the selected altitude at least 1,000 ft above you.",
      "Set climb power (throttle full).",
      "Engage AP and press FLC. The IAS bug syncs to your speed — use DN/UP to set about Vy.",
      "The AP pitches to hold the speed; the extra power makes it climb. ALTS captures the altitude.",
    ],
    check: (s, m = {}) => {
      if (
        s.ap.vertical === "FLC" &&
        s.ap.verticalArmed === "ALTS" &&
        s.radios.altBug >= s.indicated.altFt + 400
      )
        m.saw = true;
      return (
        !!m.saw && s.ap.vertical === "ALT" && near(s.indicated.altFt, s.radios.altBug, 100) && on(s)
      );
    },
    status: (s) =>
      `IAS ${r0(s.indicated.iasKt)} / bug ${s.radios.iasBug} kt · alt ${r0(s.indicated.altFt)} → ${s.radios.altBug} · ${on(s) ? s.ap.vertical : "—"} ${s.ap.verticalArmed ?? ""}`,
    explain:
      "FLC holds airspeed with pitch, so you can never stall or overspeed in the climb: power determines whether you climb or descend. It's the preferred mode for large altitude changes.",
  },
  {
    id: "fd-handfly",
    title: "Hand-fly the flight director",
    description: "With the AP off, follow the magenta command bars through a turn.",
    category: "pfd",
    display: "glass",
    instructions: [
      "Make sure AP is OFF. Press FD, then HDG.",
      "Turn the heading bug 60° away from your heading.",
      "Fly the yellow aircraft symbol into the magenta command bars (keyboard A/D for roll, W/S for pitch, or the yoke pad).",
      "Keep the symbol tucked into the bars during the turn.",
    ],
    check: (s) =>
      s.ap.fd &&
      !s.ap.engaged &&
      s.ap.lateral === "HDG" &&
      !angNear(s.radios.hdgBug, s.indicated.headingMag, 10) &&
      Math.abs(s.ap.fdBank) > 5 &&
      Math.abs(s.indicated.bank - s.ap.fdBank) < 4 &&
      Math.abs(s.indicated.pitch - s.ap.fdPitch) < 2.5,
    status: (s) =>
      `FD bank ${r0(s.ap.fdBank)}° / yours ${r0(s.indicated.bank)}° · FD pitch ${s.ap.fdPitch.toFixed(1)}° / yours ${s.indicated.pitch.toFixed(1)}°`,
    explain:
      "The flight director computes the attitude needed to fly the selected modes. The autopilot simply flies those bars; you can too. Following the FD while hand-flying is how many pilots fly departures and approaches.",
  },
  {
    id: "tune-oak",
    title: "Tune & identify OAK VOR",
    description: "Tune NAV1 to Oakland VORTAC 116.80 and identify it.",
    category: "radios",
    display: "nav",
    instructions: [
      "On NAV1, turn the outer knob to 116 and the inner knob to .80 (standby, cyan).",
      "Press ⇄ to swap it to active.",
      "Identify: the ident 'OAK' and its Morse code (--- .- -.-) appear next to the frequency.",
    ],
    check: (s) =>
      near(s.radios.nav1.active, 116.8, 0.004) && s.nav.nav1.valid && s.nav.nav1.ident === "OAK",
    status: (s) =>
      `NAV1 active ${s.radios.nav1.active.toFixed(2)} · standby ${s.radios.nav1.standby.toFixed(2)} · ident ${s.nav.nav1.valid ? s.nav.nav1.ident : "none"}`,
    explain:
      "Always tune in the standby window and swap — that way you never lose the station you are using. Identifying the Morse code confirms you have the right station and that it is not in test or maintenance.",
  },
  {
    id: "com-tower",
    title: "Tune Oakland Tower",
    description: "Put Oakland Tower 118.30 in COM1 active.",
    category: "radios",
    display: "nav",
    instructions: [
      "Find the frequency: GPS → WPT page → KOAK (or the NRST page).",
      "Tune COM1 standby to 118.300 (or press COM1 next to the TWR frequency on the GPS).",
      "Swap it to active.",
    ],
    check: (s) => near(s.radios.com1.active, 118.3, 0.004),
    status: (s) => `COM1 ${s.radios.com1.active.toFixed(3)} ⇄ ${s.radios.com1.standby.toFixed(3)}`,
    explain:
      "Loading frequencies from the GPS database avoids typing errors. The standby/active flip-flop lets you go back to the previous frequency instantly if nobody answers.",
  },
  {
    id: "cdi-center",
    title: "Centre the CDI with a TO flag",
    description: "Turn the OBS until the needle centres with a TO indication on OAK.",
    category: "nav",
    display: "nav",
    instructions: [
      "Tune and identify OAK (116.80) on NAV1.",
      "Turn the NAV1 OBS knob until the needle is centred and the flag shows TO (push the OBS knob to do it instantly).",
      "The course under the index is the course TO the station; your radial is its reciprocal.",
    ],
    check: (s) =>
      s.nav.nav1.valid &&
      s.nav.nav1.kind === "VOR" &&
      s.nav.nav1.ident === "OAK" &&
      Math.abs(s.nav.nav1.cdiDots) < 0.4 &&
      s.nav.nav1.toFrom === "TO",
    status: (s) =>
      s.nav.nav1.valid
        ? `OBS ${r0(s.radios.nav1.obs)}° · needle ${s.nav.nav1.cdiDots.toFixed(1)} dots · ${s.nav.nav1.toFrom} · you are on R-${String(r0(s.nav.nav1.radial)).padStart(3, "0")}`
        : "NAV1 not receiving a VOR",
    explain:
      "A centred needle with a TO flag means the OBS course leads directly to the station. With a FROM flag, the OBS shows the radial you are on. Each dot is 2°.",
  },
  {
    id: "vor-track",
    title: "Intercept & track a VOR course",
    description: "Track the OAK 330° course inbound with the autopilot in NAV mode.",
    category: "nav",
    display: "glass",
    instructions: [
      "Tune OAK on NAV1, set the NAV1 OBS (CRS) to 330°.",
      "Press CDI on the PFD (or the GPS) until the HSI shows VOR1 in green.",
      "Set the heading bug for a 30° intercept, press HDG, then NAV (white = armed), and AP.",
      "When the needle comes alive the AP captures: 'VOR' turns green and it tracks the course.",
    ],
    check: (s) =>
      s.radios.cdiSource === "NAV1" &&
      s.nav.nav1.ident === "OAK" &&
      s.nav.nav1.valid &&
      angNear(s.radios.nav1.obs, 330, 3) &&
      s.ap.lateral === "NAV" &&
      s.ap.engaged &&
      Math.abs(s.nav.nav1.cdiDots) < 0.6,
    status: (s) =>
      `CDI ${s.radios.cdiSource} · OBS ${r0(s.radios.nav1.obs)}° · needle ${s.nav.nav1.cdiDots.toFixed(1)} · lateral ${on(s) ? s.ap.lateral : "—"} ${s.ap.lateralArmed ?? ""}`,
    explain:
      "NAV mode tracks whatever the CDI shows. If the CDI is on GPS, NAV follows the magenta line, not your VOR — always check the source label. The autopilot automatically corrects for wind once established.",
  },
  {
    id: "dme-5",
    title: "Find the 5 DME fix",
    description: "Fly inbound to OAK and arrive 5 nm (DME) from the station.",
    category: "nav",
    display: "nav",
    instructions: [
      "Tune OAK on NAV1 (it is a VORTAC, so DME is available).",
      "Watch the DME readout: distance, groundspeed and time to station.",
      "Be at 5.0 DME (±0.5).",
    ],
    check: (s) =>
      s.nav.nav1.ident === "OAK" &&
      s.nav.nav1.dmeValid &&
      s.nav.nav1.dmeNm > 4.5 &&
      s.nav.nav1.dmeNm < 5.5,
    status: (s) =>
      s.nav.nav1.dmeValid
        ? `DME ${s.nav.nav1.dmeNm.toFixed(1)} nm from ${s.nav.nav1.ident}`
        : "No DME on NAV1",
    explain:
      "DME measures slant range, so at altitude directly over the station it shows your height (4,000 ft ≈ 0.7 nm). Combined with a radial, DME defines fixes used in arrivals and approaches.",
  },
  {
    id: "gps-direct",
    title: "GPS direct-to KHAF",
    description: "Go direct to Half Moon Bay on the GPS and let the autopilot fly it.",
    category: "gps",
    display: "gps",
    instructions: [
      "Press D→ on the TX-750, type KHAF and ACTIVATE.",
      "Make sure the CDI shows GPS (magenta).",
      "Engage AP and press NAV — 'GPS' green on the PFD.",
      "The aircraft turns onto the magenta line to KHAF.",
    ],
    check: (s) =>
      s.gps.directTo?.id === "KHAF" &&
      s.radios.cdiSource === "GPS" &&
      s.ap.lateral === "NAV" &&
      on(s) &&
      Math.abs(s.nav.gps.cdiDots) < 1,
    status: (s) =>
      `D→ ${s.gps.directTo?.id ?? "none"} · CDI ${s.radios.cdiSource} · lateral ${on(s) ? s.ap.lateral : "—"} · XTK ${s.nav.gps.xtkNm.toFixed(2)} nm`,
    explain:
      "Direct-to draws a new magenta course from your present position to the waypoint. It's the quickest way to comply with 'proceed direct'. Remember the autopilot only follows it in NAV mode with the CDI on GPS.",
  },
  {
    id: "fpl-3",
    title: "Build a 3-waypoint flight plan",
    description: "Create a flight plan with at least three waypoints on the GPS.",
    category: "gps",
    display: "gps",
    instructions: [
      "Open FPL on the TX-750.",
      "Type identifiers to add waypoints, for example OAK → OSI → KHAF.",
      "Use ↑/↓ to reorder, ✕ to delete, ACT to activate a leg.",
      "Check the active leg (magenta) on the map.",
    ],
    check: (s) => s.gps.flightPlan.length >= 3,
    status: (s) =>
      `${s.gps.flightPlan.length} waypoint(s): ${s.gps.flightPlan.map((w) => w.id).join(" → ") || "—"}`,
    explain:
      "The flight plan is a list of legs flown in order; the GPS sequences automatically to the next leg. Reviewing each leg's course and distance before departure catches typing errors.",
  },
  {
    id: "rnav-apr",
    title: "Load an RNAV approach & arm APR",
    description: "Load a training RNAV approach and arm the approach mode.",
    category: "gps",
    display: "gps",
    instructions: [
      "On the TX-750, open PROC. Choose an airport and press RNAV on a runway.",
      "Keep the CDI on GPS.",
      "Press APR on the autopilot: the GPS lateral mode arms (white) together with the glidepath (GP).",
    ],
    check: (s) =>
      s.gps.approach?.kind === "RNAV" &&
      s.radios.cdiSource === "GPS" &&
      on(s) &&
      (s.ap.lateralArmed === "LOC" || s.ap.lateral === "APR"),
    status: (s) =>
      `${s.gps.approach?.label ?? "No approach loaded"} · lateral ${on(s) ? s.ap.lateral : "—"} ${s.ap.lateralArmed ?? ""}`,
    explain:
      "The simulator builds a simple IAF → IF → FAF → runway training procedure from runway geometry (NOT the published approach). In APR, the GPS CDI scales down to 0.3 nm and vertical guidance appears near the FAF.",
  },
  {
    id: "ils-load",
    title: "Load an ILS & arm APR",
    description: "Load the ILS 28R at KSFO, tune it, set VLOC and arm APR.",
    category: "gps",
    display: "gps",
    instructions: [
      "TX-750 → PROC → KSFO → ILS on runway 28R. NAV1 is tuned to the localizer and the course is set automatically.",
      "Press the CDI button until the source is VLOC/LOC1 (green).",
      "Press APR: 'LOC' and 'GS' arm (white).",
    ],
    check: (s) =>
      s.gps.approach?.kind === "ILS" &&
      s.nav.nav1.kind === "ILS" &&
      s.radios.cdiSource === "NAV1" &&
      on(s) &&
      (s.ap.lateralArmed === "LOC" || s.ap.lateral === "APR"),
    status: (s) =>
      `${s.gps.approach?.label ?? "No approach"} · NAV1 ${s.radios.nav1.active.toFixed(2)} ${s.nav.nav1.kind} · CDI ${s.radios.cdiSource} · ${on(s) ? `${s.ap.lateral} ${s.ap.lateralArmed ?? ""}` : "AP/FD off"}`,
    explain:
      "An ILS is flown on the NAV radio, not the GPS: the CDI must be switched to VLOC. Forgetting this is a classic error — the autopilot would keep flying GPS guidance.",
  },
  {
    id: "ils-capture",
    title: "Capture the localizer & glideslope",
    description: "Let the autopilot capture LOC and GS and fly the ILS.",
    category: "autopilot",
    display: "glass",
    instructions: [
      "Use 'Set up' to start on a 10 nm final for ILS 28R (or fly there yourself).",
      "CDI on NAV1 (LOC1). Press APR and AP. Keep ~90 kt.",
      "LOC captures first (green), then GS when the diamond centres.",
      "Keep both needles within one dot; reduce power to hold approach speed on the glideslope.",
    ],
    check: (s) =>
      s.ap.lateral === "APR" &&
      s.ap.vertical === "GS" &&
      s.nav.nav1.kind === "ILS" &&
      s.nav.nav1.valid &&
      Math.abs(s.nav.nav1.cdiDots) < 1 &&
      Math.abs(s.nav.nav1.gsDots) < 1,
    status: (s) =>
      `LOC ${s.nav.nav1.cdiDots.toFixed(1)} · GS ${s.nav.nav1.gsValid ? s.nav.nav1.gsDots.toFixed(1) : "—"} dots · ${on(s) ? `${s.ap.lateral}/${s.ap.vertical}` : "AP/FD off"} · ${r0(s.indicated.iasKt)} kt`,
    setup: { label: "Reposition: 10 nm final ILS 28R", run: (e) => applyPreset(e, "ils28r") },
    explain:
      "Intercept the glideslope from below — it comes down to you. The localizer is about four times more sensitive than a VOR, so small corrections only. The GS diamond above centre means 'fly up'.",
  },
  {
    id: "squawk",
    title: "Squawk 4521 with altitude",
    description: "Set transponder code 4521 and mode ALT.",
    category: "radios",
    display: "nav",
    instructions: [
      "Type 4 5 2 1 on the transponder keypad (digits 0–7 only).",
      "Select ALT so ATC sees your altitude (Mode C/S).",
      "Press IDENT only if ATC asks you to.",
    ],
    check: (s) => s.radios.transponder.code === "4521" && s.radios.transponder.mode === "ALT",
    status: (s) => `Squawk ${s.radios.transponder.code} ${s.radios.transponder.mode}`,
    explain:
      "Transponder codes are octal (0–7), so 8 and 9 do not exist. ALT mode adds your pressure altitude. Avoid passing through 7500/7600/7700 when changing codes.",
  },
  {
    id: "adf-ndb",
    title: "Tune the training NDB",
    description: "Tune the ADF to the 350 kHz training NDB 'TXB' and read the bearing.",
    category: "nav",
    display: "nav",
    instructions: [
      "Tune the ADF to 350 kHz (outer knob = tens, inner = units).",
      "Identify TXB.",
      "Magnetic bearing to the station = magnetic heading + relative bearing (the ADF readout shows both).",
    ],
    check: (s) => s.nav.adf.valid && s.nav.adf.ident === "TXB",
    status: (s) =>
      s.nav.adf.valid
        ? `${s.nav.adf.ident}: relative ${r0(s.nav.adf.relBearing)}° → magnetic ${String(r0((s.indicated.headingMag + s.nav.adf.relBearing) % 360)).padStart(3, "0")}°`
        : `ADF ${s.radios.adfKhz} kHz · no signal`,
    explain:
      "On a fixed-card ADF the needle shows RELATIVE bearing: 0° = straight ahead. Add your magnetic heading to get the magnetic bearing to the station. (TXB is a simulated training NDB.)",
  },
  {
    id: "partial-panel",
    title: "Partial panel recovery",
    description:
      "After a vacuum / AHRS failure, hold wings level and altitude for 30 s with the remaining instruments.",
    category: "steam",
    display: "sixpack",
    instructions: [
      "Use 'Set up' to fail the vacuum pump (steam) or the AHRS (glass). The AP disconnects.",
      "Cover the failed attitude/heading indicators. Bank: turn coordinator (wings level = no turn). Pitch: altimeter, VSI and airspeed.",
      "Glass aircraft: use the standby attitude indicator and the magnetic compass.",
      "Hold wings level and within 300 ft of your altitude for 30 seconds.",
    ],
    check: (s, m = {}) => {
      const failed = s.failures.vacuum || s.failures.ahrs;
      if (!failed) {
        m.t0 = undefined;
        return false;
      }
      if (m.t0 === undefined) {
        m.t0 = s.aircraft.simTimeSec;
        m.alt0 = s.aircraft.altMslFt;
      }
      return (
        !s.ap.engaged &&
        Math.abs(s.aircraft.bank) < 6 &&
        Math.abs(s.aircraft.vsFpm) < 300 &&
        Math.abs(s.aircraft.altMslFt - (m.alt0 ?? s.aircraft.altMslFt)) < 300 &&
        s.aircraft.simTimeSec - m.t0 >= 30
      );
    },
    status: (s) =>
      `${s.failures.vacuum || s.failures.ahrs ? "FAILURE ACTIVE" : "No failure yet"} · bank ${r0(s.aircraft.bank)}° · VS ${r0(s.aircraft.vsFpm)} fpm · TC ${s.indicated.turnRate.toFixed(1)}°/s`,
    setup: {
      label: "Fail vacuum / AHRS",
      run: (e) => {
        e.apDisconnect("AP disconnect");
        e.setFailure(e.perf.avionics === "steam" ? "vacuum" : "ahrs", true);
      },
    },
    explain:
      "A failed gyro often gives no warning flag: the attitude indicator slowly tilts and looks believable. Cross-checking (does the turn coordinator agree? is the altimeter changing?) is how you catch it. Then cover it and fly by the instruments that still work.",
  },
  {
    id: "pitot-block",
    title: "Identify a pitot blockage",
    description: "Recognise a blocked pitot tube from the airspeed behaviour and apply pitot heat.",
    category: "steam",
    display: "sixpack",
    instructions: [
      "Use 'Set up' to block the pitot tube (as if by ice).",
      "Climb or descend 600 ft and watch the airspeed: it behaves like an altimeter (rises in a climb).",
      "Turn PITOT HEAT on (switch panel). Fly by attitude and power settings — not the ASI.",
    ],
    check: (s) =>
      s.failures.pitot &&
      s.controls.pitotHeat &&
      Math.abs(s.indicated.iasKt - s.aircraft.iasKt) > 8,
    status: (s) =>
      `ASI ${r0(s.indicated.iasKt)} kt vs actual ${r0(s.aircraft.iasKt)} kt · pitot heat ${s.controls.pitotHeat ? "ON" : "OFF"}`,
    setup: { label: "Block the pitot tube", run: (e) => e.setFailure("pitot", true) },
    explain:
      "With the pitot tube and its drain blocked, the air trapped in the system keeps its pressure; as static pressure falls in a climb the ASI shows MORE speed. Pilots have stalled aircraft following that false reading. Pitch + power = performance.",
  },
];

export function getAvionicsTask(id: string): AvionicsTask | undefined {
  return AVIONICS_TASKS.find((t) => t.id === id);
}
