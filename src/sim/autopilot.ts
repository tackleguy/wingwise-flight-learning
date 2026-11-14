/**
 * Autopilot / flight director.
 *
 * Lateral modes:  ROL (wings level / hold bank), HDG (heading bug), NAV (track the CDI source:
 *                 GPS, VOR or LOC), APR (approach: LOC or GPS + vertical guidance).
 * Vertical modes: PIT (hold pitch), ALT (hold altitude), VS (hold vertical speed),
 *                 FLC (flight level change — hold airspeed with pitch, power sets climb/descent),
 *                 GS (follow ILS glideslope or GPS glidepath).
 * Armed: ALTS (capture the selected altitude), NAV/LOC, GS.
 *
 * The flight director computes command bars (fdPitch/fdBank). When the AP is engaged, those
 * commands drive the elevator and ailerons through simple PID loops.
 */
import { clamp, norm180, norm360 } from "@/lib/geo";
import type { AircraftState, AutopilotState, NavOutputs, Radios } from "./types";

export const INITIAL_AP: AutopilotState = {
  engaged: false,
  fd: false,
  yd: false,
  lateral: "ROL",
  vertical: "PIT",
  lateralArmed: null,
  verticalArmed: null,
  approachCaptured: false,
  targetPitch: 0,
  fdPitch: 0,
  fdBank: 0,
  annunciation: "",
};

export interface ApInternal {
  elevInt: number;
  vsInt: number;
  /** Altitude captured in ALT mode */
  holdAlt: number;
  /** Bank held in ROL mode */
  rolBank: number;
}

export const INITIAL_AP_INTERNAL: ApInternal = { elevInt: 0, vsInt: 0, holdAlt: 0, rolBank: 0 };

function bankLimit(tasKt: number) {
  // Standard-rate bank ≈ TAS/10 + 7, limited to 25°.
  return clamp(tasKt / 10 + 7, 10, 25);
}

/** Desired true track for the active nav source; null when no valid guidance. */
function navGuidance(
  nav: NavOutputs,
  radios: Radios,
  magVar: number,
): { desired: number; dots: number } | null {
  const h = nav.hsi;
  if (h.toFrom === "OFF") return null;
  const courseTrue = norm360(h.course + magVar);
  const gain = h.source === "GPS" ? 14 : h.label === "LOC" ? 12 : 14;
  return { desired: norm360(courseTrue + clamp(h.cdiDots * gain, -45, 45)), dots: h.cdiDots };
}

/** Advance AP state & compute FD commands. Returns control surface commands when engaged. */
export function autopilotStep(
  ap: AutopilotState,
  int: ApInternal,
  ac: AircraftState,
  indicatedAlt: number,
  radios: Radios,
  nav: NavOutputs,
  magVar: number,
  dt: number,
): { ap: AutopilotState; int: ApInternal; elevator: number; aileron: number } {
  const a: AutopilotState = { ...ap };
  const i: ApInternal = { ...int };
  if (!a.fd && !a.engaged) return { ap: a, int: i, elevator: 0, aileron: 0 };

  // ---------------- lateral
  const limit = bankLimit(ac.tasKt);
  let bankCmd = 0;
  const guidance = navGuidance(nav, radios, magVar);

  // Arm → capture transitions
  if (
    a.lateralArmed &&
    guidance &&
    Math.abs(guidance.dots) < (a.lateralArmed === "LOC" ? 2.2 : 2)
  ) {
    if (a.lateralArmed === "NAV") a.lateral = "NAV";
    else {
      a.lateral = "APR";
      a.approachCaptured = true;
    }
    a.lateralArmed = null;
  }

  switch (a.lateral) {
    case "ROL":
      bankCmd = Math.abs(i.rolBank) < 6 ? 0 : clamp(i.rolBank, -limit, limit);
      break;
    case "HDG": {
      const hdgTrue = norm360(radios.hdgBug + magVar);
      bankCmd = clamp(norm180(hdgTrue - ac.heading) * 1.4, -limit, limit);
      break;
    }
    case "NAV":
    case "APR": {
      if (guidance) {
        bankCmd = clamp(norm180(guidance.desired - ac.track) * 1.3, -limit, limit);
      } else {
        bankCmd = 0;
      }
      break;
    }
  }
  // While NAV/LOC is armed but not captured, keep flying the heading bug.
  if (a.lateralArmed && a.lateral === "HDG") {
    const hdgTrue = norm360(radios.hdgBug + magVar);
    bankCmd = clamp(norm180(hdgTrue - ac.heading) * 1.4, -limit, limit);
  }

  // ---------------- vertical
  const altErr = radios.altBug - indicatedAlt;
  if (a.verticalArmed === "ALTS" && a.vertical !== "ALT" && a.vertical !== "GS") {
    const window = Math.max(60, Math.abs(ac.vsFpm) / 8);
    if (Math.abs(altErr) < window) {
      a.vertical = "ALT";
      a.verticalArmed = null;
      i.holdAlt = radios.altBug;
      a.annunciation = "ALT CAPTURE";
    }
  }
  if (
    a.verticalArmed === "GS" &&
    nav.hsi.gsValid &&
    Math.abs(nav.hsi.gsDots) < 0.5 &&
    a.lateral === "APR"
  ) {
    a.vertical = "GS";
    a.verticalArmed = null;
    a.annunciation = "GS CAPTURE";
  }

  let vsCmd: number | null = null;
  let pitchCmd = a.targetPitch;
  switch (a.vertical) {
    case "PIT":
      pitchCmd = a.targetPitch;
      break;
    case "ALT":
      vsCmd = clamp((i.holdAlt - indicatedAlt) * 2.5, -800, 800);
      break;
    case "VS":
      vsCmd = radios.vsBug;
      break;
    case "FLC": {
      // Too fast → raise the nose; too slow → lower it.
      a.targetPitch = clamp(a.targetPitch + (ac.iasKt - radios.iasBug) * 0.08 * dt, -12, 15);
      pitchCmd = a.targetPitch;
      break;
    }
    case "GS": {
      const nominal = -ac.gsKt * 101.27 * Math.tan((3 * Math.PI) / 180);
      vsCmd = nominal + nav.hsi.gsDots * 220;
      break;
    }
  }
  if (vsCmd !== null) {
    // Feed-forward: the flight-path angle that produces the commanded VS, plus the current
    // angle of attack, gives the pitch attitude; a small integral trims out the remaining error.
    const vFpm = Math.max(ac.tasKt, 40) * 101.27;
    const gammaCmd = (Math.asin(clamp(vsCmd / vFpm, -0.5, 0.5)) * 180) / Math.PI;
    i.vsInt = clamp(i.vsInt + (vsCmd - ac.vsFpm) * 0.00025 * dt, -4, 4);
    pitchCmd = clamp(gammaCmd + ac.aoaDeg + i.vsInt, -12, 15);
    a.targetPitch = pitchCmd;
  } else {
    i.vsInt = 0;
  }

  a.fdPitch = clamp(pitchCmd, -15, 20);
  a.fdBank = bankCmd;

  if (!a.engaged) return { ap: a, int: i, elevator: 0, aileron: 0 };

  // ---------------- servos
  const pitchErr = a.fdPitch - ac.pitch;
  i.elevInt = clamp(i.elevInt + pitchErr * 0.02 * dt * 60, -0.8, 0.8);
  const elevator = clamp(pitchErr * 0.09 - ac.pitchRate * 0.05 + i.elevInt * 0.25, -0.8, 0.8);
  const aileron = clamp((a.fdBank - ac.bank) * 0.05 - ac.rollRate * 0.03, -0.7, 0.7);
  return { ap: a, int: i, elevator, aileron };
}
