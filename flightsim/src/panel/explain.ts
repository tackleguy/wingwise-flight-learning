/**
 * "Explain this instrument": plain-language teaching text for every instrument and control on
 * the panel, written for a beginner, for a Cessna 172P-class trainer.
 *
 * Original text. Numbers are typical handbook-class values for this aircraft type and are for
 * learning only — the pilot's operating handbook of the real aircraft always wins.
 *
 * `reading(sim)` interprets what the instrument shows RIGHT NOW. It only looks at what the pilot
 * can see: the indicated values (state.ind), the receivers (state.nav), the systems (state.sys)
 * and the control positions — plus the actual flap angle for the flap indicator.
 */
import { AIRCRAFT } from "@/core/defaults";
import { norm180, norm360 } from "@/core/math";
import type { Sim } from "@/core/sim";
import { LOW_FUEL_GAL, LOW_VACUUM_INHG, LOW_VOLTS, annunciatorStates } from "./engine";
import type { InstrumentId } from "./ids";
import { formatFreq } from "./radio";

export interface InstrumentExplanation {
  id: InstrumentId;
  /** Name shown as the card title. */
  title: string;
  /** Which family it belongs to (shown as a small tag). */
  group: "Flight instrument" | "Engine gauge" | "System gauge" | "Radio / navigation" | "Switch" | "Engine control" | "Flight control";
  /** One or two sentences: what it shows or does. */
  what: string;
  /** How to read or use it, point by point. */
  howToRead: string[];
  /** The present indication or position, interpreted in plain words. */
  reading: (sim: Sim) => string;
  /** How it works inside. */
  howItWorks: string;
  /** Typical errors and limitations. */
  errors: string[];
  /** What it does when it fails, and how to notice. */
  failure: string;
  /** One practical tip. */
  tip: string;
}

// ---------------------------------------------------------------- small helpers for the live readings

const V = AIRCRAFT.v;
const r0 = (n: number) => Math.round(Number.isFinite(n) ? n : 0);
const hdg3 = (deg: number) => {
  const h = r0(norm360(deg)) % 360;
  return String(h === 0 ? 360 : h).padStart(3, "0") + "°";
};
const POINTS = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"];
const compassPoint = (deg: number) => POINTS[Math.round(norm360(deg) / 45) % 8]!;
const feet = (n: number) => `${(Math.round(n / 10) * 10).toLocaleString("en-US")} ft`;
const near = (a: number, b: number, tol = 2.5) => Math.abs(a - b) <= tol;
const powered = (sim: Sim) => sim.state.sys.busVolts > 10;
const gal = (n: number) => `${Math.max(0, n).toFixed(n < 9.95 ? 1 : 0)} gal`;

function airspeedReading(sim: Sim): string {
  const ias = sim.state.ind.ias;
  const k = r0(ias);
  if (ias < 20) return "The needle is resting near the top: the instrument needs roughly 30 to 40 knots of airflow before it reads reliably. That is normal when standing still or taxiing.";
  let s = `You are indicating ${k} knots — `;
  if (ias >= V.ne) s += `at or beyond the red line (VNE ${V.ne}). Reduce power and ease the nose up gently: the aeroplane is not approved for this speed.`;
  else if (ias > V.no) s += `in the yellow caution range (${V.no}–${V.ne}). Fly here only in smooth air and with gentle control movements.`;
  else if (near(ias, V.y)) s += `that is VY (${V.y}), your best rate-of-climb speed: the most height gained per minute.`;
  else if (near(ias, V.glide)) s += `that is the best glide speed (${V.glide}) and also a normal approach speed.`;
  else if (near(ias, V.x)) s += `that is VX (${V.x}), the best angle-of-climb speed: the most height gained per distance, for clearing obstacles.`;
  else if (near(ias, V.r, 2)) s += `about rotation speed (${V.r}): on the take-off roll this is where you ease the nose wheel off.`;
  else if (near(ias, V.a)) s += `about VA (${V.a}), the manoeuvring speed at maximum weight: slow to this or below in rough air.`;
  else if (ias < V.s0) s += `below the bottom of the white arc (${V.s0}). In flight the wing would be stalled, even with full flaps.`;
  else if (ias < V.s1) s += `in the white arc only, below the flaps-up stalling speed (${V.s1}). The aeroplane can fly this slowly only with the flaps down.`;
  else if (ias <= V.fe) s += `inside both the green and the white arc: normal flight, and slow enough to use the flaps.`;
  else s += `in the green arc: normal flight, but above the white arc, so too fast for flaps (limit ${V.fe}).`;
  if (sim.controls.flapIndex > 0 && ias > V.fe && ias < V.ne) s += ` Careful: the flap lever is down and you are above the flap limit of ${V.fe} knots — slow down or raise the flaps.`;
  return s;
}

function attitudeReading(sim: Sim): string {
  const { attPitch: p, attRoll: r, attFlag } = sim.state.ind;
  if (attFlag) return "The GYRO flag is showing: the gyro is not spinning fast enough (no suction), so do not trust the picture. Check the suction gauge.";
  const pitch = Math.abs(p) < 1 ? "the nose on the horizon" : `the nose ${r0(Math.abs(p))}° ${p > 0 ? "above" : "below"} the horizon`;
  const b = Math.abs(r);
  let bank: string;
  if (b < 2) bank = "wings level";
  else {
    const kind = b < 20 ? "a shallow bank" : b <= 45 ? "a medium bank" : b <= 60 ? "a steep bank" : "a very steep bank, beyond normal training manoeuvres";
    bank = `${r0(b)}° of bank to the ${r > 0 ? "right" : "left"} (${kind})`;
  }
  return `It shows ${pitch} and ${bank}.`;
}

function altimeterReading(sim: Sim): string {
  const alt = sim.state.ind.alt;
  const set = sim.controls.altimeterInHg.toFixed(2);
  const a = Math.abs(alt);
  const th = Math.floor(a / 1000);
  const hund = (a % 1000) / 100;
  const hands = `Short hand ${hund < 0.5 ? `on ${th % 10}` : `between ${th % 10} and ${(th + 1) % 10}`}, long hand on ${(Math.round(hund * 2) / 2).toString().replace(/^0\.5$/, "½").replace(/\.5$/, "½")}.`;
  if (alt < -20) return `It reads ${feet(a)} BELOW zero with ${set} inHg set — usually a sign that the pressure setting is wrong.`;
  return `It reads about ${feet(alt)} with ${set} inHg set in the window. ${hands}${alt >= 10000 ? " You are above 10,000 ft: the thin hand with the triangle has moved past 1 and the striped flag is hidden." : ""}`;
}

function turnReading(sim: Sim): string {
  const { turnRate: t, ball, turnFlag } = sim.state.ind;
  if (turnFlag || !powered(sim)) return "The red flag is showing: the instrument has no electrical power, so the little aeroplane is not telling you anything. The ball still works — it needs no power.";
  const dps = Math.abs(t) * 3;
  const turn = Math.abs(t) < 0.12 ? "You are not turning." : `You are turning ${t > 0 ? "right" : "left"} at about ${dps.toFixed(dps < 10 ? 1 : 0)}° per second${near(Math.abs(t), 1, 0.15) ? " — a standard-rate turn, a full circle in two minutes" : Math.abs(t) > 1.15 ? " — faster than standard rate" : " — less than standard rate"}.`;
  const b = Math.abs(ball) < 0.15 ? "The ball is centred: the flight is coordinated." : `The ball is out to the ${ball > 0 ? "right" : "left"}: press the ${ball > 0 ? "right" : "left"} rudder pedal to bring it back ("step on the ball").`;
  return `${turn} ${b}`;
}

function headingReading(sim: Sim): string {
  const { dgMag, dgFlag, compassMag } = sim.state.ind;
  if (dgFlag) return "The OFF flag is showing: the gyro is not up to speed (no suction). Use the magnetic compass.";
  const diff = norm180(dgMag - compassMag);
  const bug = norm180(sim.controls.headingBugMag - dgMag);
  let s = `It shows ${hdg3(dgMag)} — roughly ${compassPoint(dgMag)}. `;
  s += Math.abs(diff) <= 3 ? `The magnetic compass reads ${hdg3(compassMag)}, so the two agree.` : `The magnetic compass reads ${hdg3(compassMag)}: they differ by ${r0(Math.abs(diff))}°. If you are flying straight, level and at a steady speed, re-align the heading indicator; in a turn or while speeding up or slowing down the compass is the one that is wrong.`;
  s += ` The heading bug is on ${hdg3(sim.controls.headingBugMag)}${Math.abs(bug) < 3 ? " — right where you are pointing." : `, ${r0(Math.abs(bug))}° to your ${bug > 0 ? "right" : "left"}.`}`;
  return s;
}

function vsiReading(sim: Sim): string {
  const vs = sim.state.ind.vs;
  const n = Math.round(Math.abs(vs) / 50) * 50;
  if (Math.abs(vs) < 75) return "The needle is on zero: you are holding altitude (within about 50 feet per minute).";
  if (vs > 0) return `Climbing at about ${n} feet per minute${n >= 400 && n <= 800 ? " — a normal climb for this aeroplane" : n > 1000 ? " — more than this aeroplane can sustain for long; you are trading speed for height" : ""}.`;
  return `Descending at about ${n} feet per minute${n > 1000 ? " — a steep descent; near the ground this is far too much" : n >= 350 && n <= 600 ? " — a normal approach descent" : ""}.`;
}

function tachReading(sim: Sim): string {
  const rpm = sim.state.ind.tachRpm;
  const n = Math.round(rpm / 10) * 10;
  if (rpm < 50) return "Zero: the engine is stopped.";
  let s = `${n.toLocaleString("en-US")} rpm — `;
  if (rpm > AIRCRAFT.maxRpm + 20) s += "over the red line. Pull the throttle back; with a fixed-pitch propeller this happens easily in a dive.";
  else if (rpm >= 2100) s += "in the green arc: normal cruise and climb power.";
  else if (rpm >= 1000) s += "below the green arc: taxi, run-up or descent power. (The magneto check is done at 1,700 rpm.)";
  else if (rpm >= 450) s += "idling.";
  else s += "barely turning: cranking on the starter or windmilling.";
  return s;
}

function fuelReading(sim: Sim): string {
  if (!powered(sim)) return "The master switch is off, so the gauges have no power and both needles rest below E. That says nothing about how much fuel is in the tanks.";
  const { fuelLeftGal: l, fuelRightGal: r } = sim.state.ind;
  const total = Math.max(0, l) + Math.max(0, r);
  let s = `Left tank about ${gal(l)}, right tank about ${gal(r)}: ${gal(total)} in all — roughly ${(total / 8).toFixed(1)} hours at a typical cruise burn of 8 gallons an hour, before any reserve.`;
  if (l < LOW_FUEL_GAL || r < LOW_FUEL_GAL) s += " A tank is below 5 gallons: plan to land soon.";
  return s;
}

function oilTempReading(sim: Sim): string {
  if (!powered(sim)) return "No electrical power: this gauge is electric, so the needle rests at the bottom whatever the real temperature is.";
  const t = sim.state.ind.oilTempF;
  const n = Math.round(t / 5) * 5;
  if (t >= 245) return `About ${n} °F — at or above the red line. Reduce power, richen the mixture, lower the nose for more cooling airflow, and land as soon as practical.`;
  if (t >= 225) return `About ${n} °F — in the green but near the top. Watch it: more airspeed and a richer mixture help.`;
  if (t >= 100) return `About ${n} °F — in the green arc: normal.`;
  return `About ${n} °F — below the green arc: the oil is still cold. Let the engine warm up before using high power.`;
}

function oilPressReading(sim: Sim): string {
  const p = sim.state.ind.oilPressPsi;
  const n = r0(p);
  const running = sim.state.ind.tachRpm > 300;
  if (!running) return `${n} psi with the engine stopped — normal: there is no pressure until the engine turns.`;
  if (p < 25) return `${n} psi — below the red line with the engine running. This is serious: reduce power and prepare to land at once.`;
  if (p < 60) return `${n} psi — below the green arc. Acceptable only at idle with hot oil; at cruise power it would be a warning sign.`;
  if (p <= 90) return `${n} psi — in the green arc: normal.`;
  if (p < 115) return `${n} psi — above the green arc: normal for a short while with cold oil.`;
  return `${n} psi — at the upper red line. Reduce rpm until the oil warms up.`;
}

function egtReading(sim: Sim): string {
  const e = sim.state.ind.egtF;
  const m = sim.controls.mixture;
  const mix = m > 0.97 ? "The mixture is fully rich" : m < 0.05 ? "The mixture is at idle cut-off" : `The mixture knob is about ${r0((1 - m) * 100)} % of the way out (leaned)`;
  return `The needle is at roughly ${Math.round(e / 25) * 25} °F. ${mix}. The number itself matters little: what you look for is the highest point the needle reaches as you lean slowly.`;
}

function ammeterReading(sim: Sim): string {
  if (!powered(sim)) return "The master switch is off: no current is flowing and the needle rests on zero.";
  const a = sim.state.ind.ammeterA;
  const n = r0(Math.abs(a));
  if (a > 1.5) return `About +${n} amperes: the alternator is charging the battery. A high charge just after start is normal; it should fall toward zero.`;
  if (a < -1.5) return `About −${n} amperes: the battery is being drained. Normal with the engine stopped; in flight it means the alternator is not working.`;
  return "Close to zero: the alternator is carrying the load and the battery is charged. Normal.";
}

function suctionReading(sim: Sim): string {
  const s = sim.state.ind.suctionInHg;
  if (s < 0.5) return "Zero: the vacuum pump is not turning (engine stopped) or has failed. The attitude and heading indicators cannot be trusted.";
  if (s < 4.5) return `About ${s.toFixed(1)} inHg — below the green arc. Normal at idle; at cruise rpm it means a weak pump, and the gyros will be unreliable.`;
  if (s <= 5.4) return `About ${s.toFixed(1)} inHg — in the green arc: the gyros are getting the airflow they need.`;
  return `About ${s.toFixed(1)} inHg — above the green arc. Too much suction wears the gyros; in a real aircraft the regulator needs attention.`;
}

function clockReading(sim: Sim): string {
  const { clockUtcSec, oatC, alt } = sim.state.ind;
  const s = Math.floor(((clockUtcSec % 86400) + 86400) % 86400);
  const hh = String(Math.floor(s / 3600)).padStart(2, "0");
  const mm = String(Math.floor(s / 60) % 60).padStart(2, "0");
  const isa = 15 - (2 * alt) / 1000;
  const d = r0(oatC - isa);
  let t = `It is ${hh}:${mm} UTC. Outside air temperature ${r0(oatC)} °C (${r0(oatC * 1.8 + 32)} °F). The standard temperature for ${feet(Math.max(0, alt))} is ${r0(isa)} °C, so today is ${d === 0 ? "exactly standard" : `${Math.abs(d)} °C ${d > 0 ? "warmer" : "colder"} than standard`}`;
  t += d > 5 ? " — the air is thinner than the altimeter suggests, so expect a longer take-off run and a slower climb." : ".";
  if (oatC <= 2) t += " At or near freezing: any visible moisture means ice.";
  return t;
}

function annunciatorReading(sim: Sim): string {
  const { ind, sys } = sim.state;
  const p = powered(sim);
  const on = annunciatorStates(ind, sys, p);
  const names = ["LOW VOLTS (the alternator is not charging — normal until the engine is running)", "LOW VACUUM (not enough suction for the gyros — normal until the engine is running)", "L FUEL LOW", "R FUEL LOW", "STALL (simulator aid: lower the nose and add power)"];
  const lit = names.filter((_, i) => on[i]);
  if (!p && !sys.stallHorn) return "The master switch is off, so the lights have no power and cannot warn you of anything.";
  if (lit.length === 0) return "No warning lights are on.";
  return `Lit now: ${lit.join("; ")}.`;
}

function comReading(sim: Sim): string {
  const c = sim.controls.com1;
  if (!sim.state.sys.avionicsPowered) return "The display is dark: the radio has no power. Switch on the master switch (BAT) and the avionics master.";
  const st = sim.state.nav.com1;
  let s = `Active ${formatFreq("com", c.active)}, standby ${formatFreq("com", c.standby)}.`;
  if (st) s += st.inRange ? ` The active frequency belongs to ${st.station}${st.airportIdent ? ` (${st.airportIdent})` : ""}, which is within range.` : ` The active frequency belongs to ${st.station}${st.airportIdent ? ` (${st.airportIdent})` : ""}, but it is out of range from here.`;
  if (Math.abs(c.active - 121.5) < 0.001) s += " 121.500 is the international emergency frequency.";
  return s;
}

function navReading(sim: Sim): string {
  const c = sim.controls.nav1;
  if (!sim.state.sys.avionicsPowered) return "The display is dark: the radio has no power. Switch on the master switch (BAT) and the avionics master.";
  const v = sim.state.nav.nav1;
  let s = `Active ${formatFreq("nav", c.active)}, standby ${formatFreq("nav", c.standby)}. `;
  s += v.valid
    ? `Receiving ${v.ident || "a station"}${v.name ? ` (${v.name})` : ""}: you are on its ${hdg3(v.radialMag)} radial, so the station is ${compassPoint(v.bearingToMag)} of you, on a magnetic bearing of ${hdg3(v.bearingToMag)}.`
    : "No usable signal on the active frequency: too far away, too low, or no station on that frequency.";
  return s;
}

function dmeReading(sim: Sim): string {
  if (!sim.state.sys.avionicsPowered) return "Dark: no avionics power.";
  const v = sim.state.nav.nav1;
  if (!v.valid) return "Dashes: NAV 1 is not receiving a station.";
  if (v.dmeNm === null) return `Receiving ${v.ident || "the station"}, but it has no distance-measuring equipment, so the distance stays dashed.`;
  const gs = v.dmeGsKt;
  let s = `Receiving ${v.ident || "the station"}, ${v.dmeNm.toFixed(1)} nautical miles away (straight-line distance)`;
  if (gs !== null && gs > 20) s += `, and the distance is changing at ${r0(gs)} knots — if you are flying straight at it, about ${r0((v.dmeNm / gs) * 60)} minutes away`;
  return s + ".";
}

function xpdrReading(sim: Sim): string {
  const x = sim.controls.xpdr;
  if (!sim.state.sys.avionicsPowered) return "Dark: no avionics power, so it cannot reply to radar.";
  const special: Record<string, string> = {
    "1200": "the VFR code in the USA",
    "7000": "the VFR code in much of Europe",
    "7500": "the code for unlawful interference (hijack)",
    "7600": "the code for radio failure",
    "7700": "the general EMERGENCY code",
  };
  const what = special[x.code] ? ` — ${special[x.code]}` : "";
  if (x.mode === "OFF") return `Switched off (code ${x.code} is set${what}). Radar will not see a reply.`;
  if (x.mode === "STBY") return `Standby: warmed up but not replying. Code ${x.code} is set${what}.`;
  if (x.mode === "ON") return `Replying with code ${x.code}${what}, but without altitude. ALT is the normal setting in flight.`;
  return `Replying with code ${x.code}${what} and your pressure altitude — the normal setting in flight.`;
}

function vorReading(sim: Sim): string {
  const v = sim.state.nav.nav1;
  const obs = sim.controls.obs1;
  if (!sim.state.sys.avionicsPowered) return "The striped flag is showing because the NAV radio has no power.";
  if (!v.valid || v.flag === "OFF") return `Course ${hdg3(obs)} is selected, but the striped flag is showing: no usable signal. Ignore the needle.`;
  const d = v.cdiDots;
  const side = d > 0 ? "right" : "left";
  let s = `Course ${hdg3(obs)} selected, flag ${v.flag}. `;
  if (Math.abs(d) < 0.3) s += `The needle is centred: you are on the line that ${v.flag === "TO" ? `leads to the station on a course of ${hdg3(obs)}` : `is the ${hdg3(obs)} radial, leading away from the station`}.`;
  else if (Math.abs(d) >= 4.9) s += `The needle is hard over to the ${side}: the course line is 10° or more to the ${side}.`;
  else s += `The needle is ${Math.abs(d).toFixed(1)} dots to the ${side}: the course line is about ${r0(Math.abs(d) * 2)}° to your ${side}.`;
  const off = Math.abs(norm180(sim.state.ind.dgMag - obs));
  if (off > 100) s += ` Careful: your heading (${hdg3(sim.state.ind.dgMag)}) is roughly opposite to the selected course, so the needle works backwards ("reverse sensing"). Fly a heading near the course, or select the opposite course.`;
  return s;
}

function masterReading(sim: Sim): string {
  const c = sim.controls;
  const v = sim.state.sys.busVolts;
  if (!c.masterBattery) return "Both halves OFF: the electrical system is dead. Radios, flaps, fuel gauges, lights and the turn coordinator do not work. The engine does not care — its magnetos make their own sparks.";
  if (!c.masterAlternator) return `BAT on, ALT off: everything is running from the battery alone (about ${v.toFixed(1)} volts). Fine for a short check on the ground; in flight the battery would be flat in roughly half an hour.`;
  return `Both halves ON. The system is at about ${v.toFixed(1)} volts — ${v >= LOW_VOLTS ? "the alternator is charging: normal" : "below 24.5, so the alternator is not charging (normal until the engine is running)"}.`;
}

function avionicsReading(sim: Sim): string {
  const c = sim.controls;
  if (!c.avionicsMaster) return "OFF: the radios and the transponder are dark. This is correct for starting and stopping the engine.";
  return sim.state.sys.avionicsPowered ? "ON: the radios have power." : "ON, but the radios are still dark because the master switch (BAT) is off.";
}

function lightsReading(sim: Sim): string {
  const l = sim.controls.lights;
  const on = [l.beacon && "beacon", l.landing && "landing light", l.taxi && "taxi light", l.nav && "navigation lights", l.strobe && "strobes"].filter(Boolean) as string[];
  const list = on.length ? `Switched on: ${on.join(", ")}.` : "All the outside lights are switched off.";
  return powered(sim) ? list : `${list} But the master switch is off, so none of them can light.`;
}

function panelLightReading(sim: Sim): string {
  const p = r0(sim.controls.lights.panel * 100);
  const s = p <= 2 ? "The dimmer is fully off." : `The dimmer is at about ${p} %.`;
  return powered(sim) ? `${s} By day you will see no difference; at night this is what makes the instruments readable.` : `${s} But the master switch is off, so the panel lights have no power.`;
}

function pitotReading(sim: Sim): string {
  const on = sim.controls.pitotHeat;
  const oat = sim.state.ind.oatC;
  if (on) return powered(sim) ? `ON: the pitot tube is being heated. Outside air temperature ${r0(oat)} °C.` : "The switch is ON, but the master switch is off, so the heater has no power.";
  return `OFF. Outside air temperature ${r0(oat)} °C${oat <= 5 ? " — cold enough for ice: switch it on before entering cloud, rain or snow." : " — too warm for the pitot tube to ice up."}`;
}

function ignitionReading(sim: Sim): string {
  const names = ["OFF", "R (right magneto only)", "L (left magneto only)", "BOTH", "START"];
  const i = sim.controls.ignition;
  const sys = sim.state.sys;
  let s = `The key is on ${names[i] ?? "BOTH"}. `;
  if (sys.cranking || i === 4) s += "The starter is turning the engine.";
  else if (sys.engineRunning) s += i === 3 ? "The engine is running on both magnetos — normal." : i === 0 ? "The engine is running down." : "The engine is running on one magneto: expect slightly lower rpm. Return to BOTH after the check.";
  else s += `The engine is stopped${sys.engineStopReason ? `: ${sys.engineStopReason}` : "."}`;
  return s;
}

function throttleReading(sim: Sim): string {
  const t = sim.controls.throttle;
  const pos = t > 0.98 ? "fully in: full throttle" : t < 0.02 ? "fully out: idle" : `about ${r0(t * 100)} % open`;
  return `The throttle is ${pos}. The tachometer shows ${(Math.round(sim.state.ind.tachRpm / 10) * 10).toLocaleString("en-US")} rpm.`;
}

function mixtureReading(sim: Sim): string {
  const m = sim.controls.mixture;
  if (m > 0.97) return "Fully in: full rich — the setting for starting, take-off, climb and landing at low elevations.";
  if (m < 0.05) return "Fully out: idle cut-off. No fuel reaches the engine; this is how it is shut down.";
  return `Pulled out about ${r0((1 - m) * 100)} %: leaned. Right for cruise if you set it with the EGT gauge or by ear; push it in again before adding full power low down.`;
}

function carbHeatReading(sim: Sim): string {
  const oat = sim.state.ind.oatC;
  const risk = oat >= -5 && oat <= 21 ? ` At ${r0(oat)} °C outside, carburettor ice is possible if the air is humid.` : "";
  return sim.controls.carbHeat ? `Pulled out: HOT air is going to the carburettor. Expect slightly lower rpm; push it in again before you need full power.${risk}` : `Pushed in: cold (normal).${risk}`;
}

function flapReading(sim: Sim): string {
  const i = sim.controls.flapIndex;
  const lever = AIRCRAFT.flapDetentsDeg[i] ?? 0;
  const actual = sim.state.flapsDeg;
  const ias = sim.state.ind.ias;
  let s = `The lever is at ${lever === 0 ? "UP" : `${lever}°`}`;
  s += Math.abs(actual - lever) > 1.5 ? ` and the flaps are still travelling (now at about ${r0(actual)}°).` : lever === 0 ? " and the flaps are up." : ` and the flaps are at ${r0(actual)}°.`;
  if (!powered(sim)) s += " The master switch is off: the electric flap motor cannot move them.";
  if (ias > V.fe) s += ` You are indicating ${r0(ias)} knots, above the flap limit of ${V.fe}: ${lever > 0 ? "slow down or raise them" : "slow down before lowering them"}.`;
  return s;
}

function trimReading(sim: Sim): string {
  const t = sim.controls.trim;
  if (Math.abs(t) < 0.03) return "The pointer is on the take-off mark.";
  return `The trim is ${r0(Math.abs(t) * 100)} % of the way toward nose ${t > 0 ? "UP" : "DOWN"} from the take-off mark.`;
}

function fuelSelectorReading(sim: Sim): string {
  const sel = sim.controls.fuelSelector;
  const { fuelLeftGal: l, fuelRightGal: r } = sim.state.ind;
  const have = powered(sim) ? ` The gauges show about ${gal(l)} left and ${gal(r)} right.` : "";
  if (sel === "off") return `OFF: no fuel can reach the engine. It will stop within moments (or cannot be started).${have}`;
  if (sel === "both") return `BOTH: the engine draws from both tanks — the setting for take-off, landing and normal flight.${have}`;
  const side = sel === "left" ? "LEFT" : "RIGHT";
  const low = powered(sim) && (sel === "left" ? l : r) < 2 ? " That tank is almost empty: select BOTH now." : " Remember to go back to BOTH for landing.";
  return `${side}: the engine draws from the ${sel} tank only.${have}${low}`;
}

function parkBrakeReading(sim: Sim): string {
  if (!sim.controls.parkingBrake) return "Released.";
  return sim.state.ind.ias > 25 ? "SET — while the aeroplane is moving fast. Release it!" : "SET: the wheel brakes are held on. Release it before you taxi or take off.";
}

// ---------------------------------------------------------------- the content

export const EXPLAIN: Record<InstrumentId, InstrumentExplanation> = {
  airspeed: {
    id: "airspeed",
    title: "Airspeed indicator",
    group: "Flight instrument",
    what: "Shows how fast the aeroplane is moving through the air, in knots (nautical miles per hour). This is indicated airspeed — the speed the wing actually feels — and it is the number every take-off, climb, approach and stall speed in the handbook is written in.",
    howToRead: [
      "Read the number under the tip of the needle. The scale is stretched at low speed, where a few knots matter most.",
      `White arc (${V.s0}–${V.fe} knots): the range in which the flaps may be used. Its lower end is the stalling speed with full flaps (VS0), its upper end the maximum flap speed (VFE).`,
      `Green arc (${V.s1}–${V.no}): normal operating range. Its lower end is the stalling speed with flaps up (VS1), its upper end the maximum structural cruising speed (VNO).`,
      `Yellow arc (${V.no}–${V.ne}): caution range — smooth air only.`,
      `Red line (${V.ne}): never-exceed speed (VNE).`,
      `Speeds worth memorising that are NOT marked: rotate about ${V.r}, best angle of climb VX ${V.x}, best rate of climb VY ${V.y}, best glide ${V.glide}, normal approach about ${V.approach}, manoeuvring speed VA ${V.a} at maximum weight.`,
    ],
    reading: airspeedReading,
    howItWorks:
      "It is a pitot-static instrument. The pitot tube under the left wing faces the airflow and catches the \"ram\" pressure; the static port on the side of the fuselage senses the pressure of the still air. Inside the case a thin metal capsule is fed with pitot pressure while the case around it is at static pressure. The faster you fly, the more the capsule swells, and a linkage turns the needle.",
    errors: [
      "It measures air pressure, not speed over the ground. With a 20-knot headwind your ground speed is 20 knots less than it shows.",
      "Higher up, or on a hot day, the thinner air makes it read lower than your true airspeed — roughly 2 % for every 1,000 ft. The wing still stalls at the same INDICATED speed, which is why pilots fly indicated numbers.",
      "Position error: at low speed and a high nose attitude the airflow around the pitot tube and static port is disturbed, so indicated and calibrated airspeed differ by a few knots. The handbook has a correction table.",
      "Unreliable below about 40 knots.",
    ],
    failure:
      "A blocked pitot tube (ice, insects, a forgotten cover): if only the opening is blocked the reading falls to zero; if the drain hole is blocked too, the pressure is trapped and the instrument behaves like an altimeter — it reads higher as you climb and lower as you descend, whatever your real speed. A blocked static port makes it read too low above the height where the blockage happened and too high below it. You notice by cross-checking: a known power setting and nose attitude always give about the same speed. Pitot heat prevents the ice case.",
    tip: "Set the nose attitude and the power, then check the airspeed — don't chase the needle. On every take-off roll say \"airspeed alive\" as soon as the needle moves; if it does not move, stop.",
  },

  attitude: {
    id: "attitude",
    title: "Attitude indicator (artificial horizon)",
    group: "Flight instrument",
    what: "A picture of the horizon. It shows at a glance whether the nose is above or below the horizon (pitch) and whether the wings are banked — the only instrument that shows both directly. When you cannot see the real horizon, this is the centre of your scan.",
    howToRead: [
      "The orange bars and dot are your aeroplane, seen from behind. Blue is sky, brown is ground, the white line between them is the horizon.",
      "Pitch: there is a line every 5°, numbered at 10, 20 and 30. Dot above the horizon line = nose up.",
      "Bank: read the scale at the top against the fixed orange triangle. The marks are at 10°, 20°, 30°, 60° and 90°. The white triangle on the moving ring always points at the sky.",
      "In a right bank the horizon tilts so that the ground comes up on the right and your right wing bar dips into the brown — exactly what you would see through the windscreen.",
    ],
    reading: attitudeReading,
    howItWorks:
      "Inside is a gyroscope spinning about a vertical axis at well over 10,000 rpm, driven by air that the engine-driven vacuum pump sucks through the case. A spinning gyroscope stays fixed in space (\"rigidity\"), so the aeroplane rotates around it, and the horizon card — linked to the gyro — stays lined up with the real horizon. Small pendulum-operated vanes slowly pull the gyro back to true vertical.",
    errors: [
      "It needs suction (about 4.5–5.4 inHg) and a few minutes after engine start to spin up and settle.",
      "Small temporary errors: speeding up makes it show a slightly higher nose than is true, slowing down a lower one, and after a long turn it can be a few degrees out in pitch and bank for a minute or so.",
      "Older instruments \"tumble\" (go wild) beyond roughly 100° of bank or 60° of pitch.",
      "It shows attitude, not performance: with the nose level you can still be climbing or sinking. Cross-check the altimeter, VSI and airspeed.",
    ],
    failure:
      "If the vacuum pump fails the gyro does not stop at once: it runs down over a few minutes and the horizon slowly leans and sinks — dangerous, because it still looks believable. The clues are the suction gauge falling toward zero (and the LOW VACUUM light on this panel), the heading indicator drifting, and disagreement with the turn coordinator, which is electric and keeps working. Cover the failed instrument and fly \"partial panel\" on the turn coordinator, airspeed, altimeter and compass.",
    tip: "Set pitch and bank here, then confirm with the other instruments: the attitude indicator is the hub of the scan, not the whole scan. And check the suction gauge during every engine run-up.",
  },

  altimeter: {
    id: "altimeter",
    title: "Altimeter",
    group: "Flight instrument",
    what: "Shows your altitude: your height above mean sea level, in feet, once it is set to the local air pressure. It does NOT show your height above the ground — for that, subtract the height of the terrain below you.",
    howToRead: [
      "Read it like a clock with three hands, smallest unit last: the thin hand with the triangle at the rim counts tens of thousands of feet, the short fat hand counts thousands, the long hand counts hundreds. Each small tick is 20 ft.",
      "Example: short hand between 3 and 4, long hand on 4½ → 3,450 ft.",
      "The little window on the right (the Kollsman window) shows the pressure the altimeter is set to, in inches of mercury. Turn the knob at the lower left until it matches the altimeter setting from the weather report or the tower. On the ground it should then read the airfield elevation to within about 75 ft.",
      "The striped flag is visible whenever you are below 10,000 ft.",
    ],
    reading: altimeterReading,
    howItWorks:
      "It is a sensitive barometer. A stack of sealed metal capsules with most of the air removed sits in a case connected to the static port. As you climb, the outside pressure falls, the capsules expand, and gears turn the hands. Turning the knob shifts the starting point, so the reading is measured from the pressure you have set.",
    errors: [
      "Wrong setting: 0.01 inHg is about 10 ft, a whole inch about 1,000 ft. Flying toward lower pressure without resetting leaves you LOWER than it shows: \"high to low, look out below\".",
      "Temperature: in air colder than standard you are lower than indicated (about 4 % for every 10 °C), in warm air higher. \"Hot to cold, look out below.\"",
      "A little lag and friction; nothing a pilot needs to correct for in a trainer.",
      "Easy to misread by 1,000 or 10,000 ft. Say the reading aloud.",
    ],
    failure:
      "If the static port is blocked (ice, water, tape left on after washing) the altimeter freezes at the altitude where it happened and the VSI sits on zero. Suspect it when the altitude does not change although the nose attitude and power say you are climbing or descending. Real aircraft have an alternate static source in the cabin for this.",
    tip: "Set the altimeter before every take-off and again whenever you are given a new setting. Before take-off it should show the airfield's elevation within 75 feet — if not, find out why.",
  },

  "turn-coordinator": {
    id: "turn-coordinator",
    title: "Turn coordinator",
    group: "Flight instrument",
    what: "Two instruments in one. The little aeroplane shows how fast your heading is changing (rate of turn). The ball in the curved glass tube shows whether the turn is balanced, or whether the aeroplane is slipping or skidding sideways.",
    howToRead: [
      "Wings of the little aeroplane on the upper marks: not turning. A wing tip on the lower mark (L or R): a \"standard-rate\" turn of 3° per second — a full circle in 2 minutes, hence \"2 MIN\".",
      "It does NOT show the bank angle, and it gives no pitch information. At 100 knots a standard-rate turn needs about 15° of bank; the faster you fly, the more bank it takes.",
      "Ball in the middle: coordinated flight. Ball out to one side: press the rudder pedal on that side — \"step on the ball\".",
    ],
    reading: turnReading,
    howItWorks:
      "The turn part is an electric gyroscope mounted at a slant (about 30°), so it feels both yawing and rolling. When the aeroplane turns, the gyro pushes sideways against a spring (\"precession\") and tilts the little aeroplane. Because it runs on electricity, it keeps working when the vacuum pump fails. The ball is simply a heavy ball in a curved tube of fluid: gravity and the turning force together push it to wherever \"down\" is felt.",
    errors: [
      "It shows rate of turn, not bank: the same wing position means a different bank angle at a different airspeed.",
      "The little aeroplane also reacts to rolling, so let it settle before you read the turn rate.",
      "In bumpy air both the aeroplane symbol and the ball swing about — read the average.",
      "It needs electricity: no power, no indication.",
    ],
    failure:
      "If it loses electrical power (master switch off, a tripped circuit breaker, or the motor fails) the red flag appears and the little aeroplane stays level even in a turn. The ball needs no power and keeps working. After a vacuum failure this instrument, the compass and the clock are how you turn: standard rate for a counted number of seconds.",
    tip: "For a timed turn, divide the heading change by 3 to get the seconds at standard rate: 90° takes 30 seconds, 180° takes one minute.",
  },

  heading: {
    id: "heading",
    title: "Heading indicator (directional gyro)",
    group: "Flight instrument",
    what: "Shows the direction the nose is pointing, in degrees magnetic. It is steady and easy to read in turns and bumps, when the magnetic compass swings about — but it only knows what you tell it, so it has to be set to the compass.",
    howToRead: [
      "Read the number under the white pointer at the top and add a zero: 3 = 030°, 12 = 120°, 33 = 330°. N, E, S and W are 360°, 090°, 180° and 270°. The small ticks are 5° apart.",
      "The orange aeroplane in the middle is you; the card turns underneath it.",
      "The orange marker on the rim is the heading bug: park it on the heading you want to fly, as a reminder (right-hand knob, HDG).",
      "The left-hand knob (PUSH) turns the card to set it. Do this in straight, level flight at a steady speed, reading the magnetic compass.",
      "The ALIGN button does the same in one click. It is a simulator shortcut — a real aeroplane has only the knob.",
    ],
    reading: headingReading,
    howItWorks:
      "A gyroscope spinning about a horizontal axis, driven by the vacuum system. Rigidity in space keeps the gyro pointing the same way while the aeroplane turns around it, and gears turn the compass card. It has no magnet and no sense of north of its own.",
    errors: [
      "Drift: friction and the Earth's own rotation make it wander — typically a few degrees every 15 minutes. Check it against the compass about every 15 minutes and reset it.",
      "It copies whatever you set: if you align it while turning, climbing or changing speed, you copy the compass's errors into it.",
      "It needs suction, and a few minutes after engine start to spin up.",
      "Older instruments tumble beyond about 55° of pitch or bank.",
    ],
    failure:
      "After a vacuum failure the gyro slows down and the card drifts steadily or turns slowly on its own while the suction gauge reads low. It fails together with the attitude indicator. Cross-check it against the magnetic compass in steady flight; once you know it has failed, cover it and navigate by compass and timed turns.",
    tip: "Make \"heading indicator to compass\" part of your before-take-off and cruise checks. Lined up on the runway it should match the runway number: runway 28 means about 280°.",
  },

  vsi: {
    id: "vsi",
    title: "Vertical speed indicator (VSI)",
    group: "Flight instrument",
    what: "Shows how fast you are climbing or descending, in feet per minute. It also shows the trend the moment the altitude starts to change, before the altimeter has moved much.",
    howToRead: [
      "Needle horizontal, pointing at 0 on the left: level flight. Needle above zero: climbing. Below: descending.",
      "The numbers are hundreds of feet per minute: 5 = 500 ft/min. The scale is spread out up to 1,000 ft/min and squeezed beyond.",
      "A normal climb in this aeroplane is roughly 500–700 ft/min; a normal approach descent about 400–500 ft/min.",
    ],
    reading: vsiReading,
    howItWorks:
      "A capsule inside the case is connected straight to the static port; the case around it is connected to the same port only through a tiny calibrated hole. When you climb or descend, the pressure inside the capsule changes at once but the case lags behind. The pressure difference — which depends on how fast the altitude is changing — moves the needle. In level flight the two equalise and the needle returns to zero.",
    errors: [
      "Lag: after a change it needs about 6 to 9 seconds to show the true rate. The first movement shows the trend correctly; the number comes later.",
      "A sudden pitch change can make it flick briefly the wrong way.",
      "In turbulence it jumps around: use the average.",
      "It may sit slightly off zero on the ground. Note the error and allow for it.",
    ],
    failure:
      "With a blocked static port it stays on zero whatever you do. It is not a required instrument for visual flying, and the altimeter plus a watch give the same information: 100 ft in 12 seconds is 500 ft/min.",
    tip: "Don't chase it. Set the nose attitude and power for the climb or descent you want, wait a few seconds, then make one small correction.",
  },

  compass: {
    id: "compass",
    title: "Magnetic compass",
    group: "Flight instrument",
    what: "The only direction instrument that needs no power at all. It always works — which is why every other heading instrument is checked against it — but it is only accurate in steady, straight and level flight.",
    howToRead: [
      "Read the number under the vertical white line (the lubber line) and add a zero: 3 = 030°, 33 = 330°.",
      "It looks as if it is written backwards: bigger numbers are to the LEFT. That is because you are looking at the back of the card. To turn to a number you can see on the left of the window, turn RIGHT.",
      "Read it only with the wings level and the speed steady.",
    ],
    reading: (sim) => `It reads about ${hdg3(sim.state.ind.compassMag)} — roughly ${compassPoint(sim.state.ind.compassMag)}. Trust it only if you are flying straight, level and at a steady speed.`,
    howItWorks:
      "Magnets are fixed under a light card that floats on a pivot in a bowl of clear fluid, which damps the swinging. The magnets line up with the Earth's magnetic field and the aeroplane turns around the card. Small adjustable magnets in the case cancel most of the aircraft's own magnetism.",
    errors: [
      "Variation: magnetic north is not true north. The difference is printed on charts and changes from place to place (this simulator uses the real-world value for wherever you are).",
      "Deviation: the aircraft's own metal and electrics pull it a few degrees off. A real cockpit has a small correction card next to the compass.",
      "Turning errors (northern hemisphere): on northerly headings the compass lags behind a turn, and may even start by moving the wrong way; on southerly headings it runs ahead of the turn. So when turning to north, roll out before the compass gets there, and when turning to south, roll out after it has gone past. In the southern hemisphere it is the other way round.",
      "Acceleration errors on easterly and westerly headings (northern hemisphere): speeding up makes it swing toward north, slowing down toward south.",
      "It swings and bounces in turbulence.",
    ],
    failure:
      "It almost never fails outright. The fluid can leak (bubbles appear, the card sticks or swings wildly), and magnetic objects or electrical equipment nearby can pull it off. It is your back-up when the gyro instruments fail: make timed standard-rate turns and read it only when everything is steady.",
    tip: "Use the compass to set the heading indicator, then fly by the heading indicator. The compass is most honest in smooth air, wings level, at constant speed.",
  },

  tachometer: {
    id: "tachometer",
    title: "Tachometer",
    group: "Engine gauge",
    what: "Shows how fast the engine — and with it the propeller — is turning, in revolutions per minute (rpm). With a fixed-pitch propeller like this one, rpm is your power gauge.",
    howToRead: [
      "The numbers are hundreds of rpm: 25 = 2,500 rpm.",
      "Green arc (2,100–2,700): normal operating range. Red line (2,700): maximum. (On the real aeroplane the top of the green arc is stepped according to altitude.)",
      "Typical values: idle about 600–800; magneto check at 1,700; cruise about 2,300–2,500; full throttle standing still only about 2,300–2,400 — it rises as the aeroplane gains speed.",
      "The small window counts engine hours.",
    ],
    reading: tachReading,
    howItWorks:
      "In this class of aircraft it is mechanical: a flexible cable from the engine spins a magnet inside the instrument, and the magnet drags the needle round against a spring, like the speedometer of an old car. It needs no electricity. The hour meter is geared to the same cable.",
    errors: [
      "With a fixed-pitch propeller the rpm changes with airspeed: in a dive it rises with the throttle untouched, in a climb it falls. Watch the red line in a descent.",
      "Mechanical tachometers can be 50–100 rpm out, and the needle may quiver.",
      "A slow fall in rpm in level flight with the throttle untouched is the classic first sign of carburettor ice.",
    ],
    failure:
      "A broken cable makes the needle drop to zero while the engine carries on normally — the sound, the vibration and the airspeed tell you the engine is fine. Set power by ear and by throttle position.",
    tip: "During the run-up at 1,700 rpm, switch to each magneto in turn: the drop should be no more than about 125 rpm, with no more than 50 rpm difference between the two. Carburettor heat should also give a small drop.",
  },

  "fuel-quantity": {
    id: "fuel-quantity",
    title: "Fuel quantity gauges",
    group: "Engine gauge",
    what: "Two gauges in one case showing how much fuel is in the left and the right wing tank, from E (empty) to F (full).",
    howToRead: [
      "Left needle = left tank, right needle = right tank. F is about 20 US gallons of usable fuel a side in this trainer; the middle mark is about half.",
      "The red line at E means no usable fuel.",
      "The L FUEL LOW and R FUEL LOW lights come on below about 5 gallons in that tank.",
      "The engine burns roughly 8 gallons an hour in cruise, so each full tank is about two and a half hours.",
    ],
    reading: fuelReading,
    howItWorks:
      "A float in each tank moves a variable resistor, as in the fuel gauge of an old car; the gauge is an electric meter that reads the resistance. No electricity, no reading.",
    errors: [
      "Notoriously inaccurate: aircraft fuel gauges are only required to read correctly at empty. Sloshing fuel, turns, climbs and sloping ground all move the float.",
      "Even with the selector on BOTH the tanks rarely drain evenly.",
      "They show how much is in the tank, not whether it can reach the engine — check the fuel selector.",
    ],
    failure:
      "With the master switch off, or if a sender or its wiring fails, the needle drops to the bottom of the scale or sticks. That is why pilots never rely on the gauges alone: they look into the tanks before flight and keep track of fuel by time.",
    tip: "Know your fuel by the clock: gallons on board at take-off divided by gallons per hour gives hours in the tanks. Plan to land with at least 30 minutes left by day and 45 by night — more is better.",
  },

  "oil-temp": {
    id: "oil-temp",
    title: "Oil temperature gauge",
    group: "Engine gauge",
    what: "The left half of the OIL gauge: how hot the engine oil is. It is the best overall sign of how hard the engine is working and how well it is being cooled.",
    howToRead: [
      "Needle in the green arc (about 100–245 °F): normal. The red line at the top (245 °F) is the maximum.",
      "It moves slowly — over minutes, not seconds.",
      "After a cold start the needle is below the green; let the engine warm up before using high power.",
    ],
    reading: oilTempReading,
    howItWorks:
      "An electrical sensor whose resistance changes with temperature sits in the oil flow; the gauge is an electric meter. It needs electrical power.",
    errors: ["Slow to respond.", "It measures the oil at one place, not the temperature of the cylinders.", "Without electrical power the needle rests at the bottom of the scale."],
    failure:
      "High oil temperature with normal pressure: you are climbing too slowly or too steeply (not enough cooling air), the mixture is too lean, or the oil level is low — lower the nose to gain speed, richen the mixture, reduce power. High temperature WITH falling oil pressure means the engine is running out of oil: land as soon as possible. A needle that suddenly drops to the bottom while everything else is normal is usually the gauge or its wiring.",
    tip: "Read oil temperature and oil pressure together on every scan of the engine gauges: \"both in the green\".",
  },

  "oil-pressure": {
    id: "oil-pressure",
    title: "Oil pressure gauge",
    group: "Engine gauge",
    what: "The right half of the OIL gauge: the pressure with which the pump pushes oil to the engine's bearings. The engine cannot survive for long without it — this is the most important engine gauge.",
    howToRead: [
      "Green arc (60–90 psi): normal in flight.",
      "Lower red line (25 psi): the minimum, acceptable only at idle with hot oil.",
      "Upper red line (115 psi): the maximum, seen briefly with cold oil.",
      "After starting, the needle must come up within about 30 seconds (about a minute in very cold weather). If it does not, stop the engine.",
    ],
    reading: oilPressReading,
    howItWorks:
      "A small oil line runs from the engine to the gauge, where the pressure tries to straighten a curved metal tube (a Bourdon tube) that moves the needle. It is purely mechanical and works without electricity.",
    errors: ["It varies with oil temperature and rpm: lower at idle with hot oil, higher when the oil is cold.", "The needle may quiver slightly."],
    failure:
      "Low or falling oil pressure together with rising oil temperature is a real loss of oil: reduce power and land at the nearest suitable place, ready for the engine to stop. Low pressure with normal temperature may be a faulty gauge or valve — still land as soon as practical and have it checked. With no oil pressure at all, expect the engine to seize within minutes.",
    tip: "Make \"oil pressure rising\" the first thing you check and say after every engine start.",
  },

  egt: {
    id: "egt",
    title: "Exhaust gas temperature (EGT) gauge",
    group: "Engine gauge",
    what: "Shows how hot the gas leaving the engine is. It has one job: helping you set the mixture (lean the engine) accurately.",
    howToRead: [
      "It is a relative gauge: the numbers do not matter, only how the needle moves. Each small mark here is 50 °F (a real one usually has 25 °F marks).",
      "As you slowly pull the mixture out from full rich, the needle climbs to a peak and then falls again as the mixture becomes too lean.",
      "Find the peak, then push the mixture in a little: about 50 °F on the rich side of the peak is the usual recommended cruise setting at 75 % power or less.",
    ],
    reading: egtReading,
    howItWorks:
      "A thermocouple — two different metals joined together — is fitted in the exhaust pipe. Heat makes it generate a tiny voltage that drives the meter directly, so it needs no power from the aircraft.",
    errors: [
      "It measures at one point in the exhaust, not every cylinder.",
      "It reacts within seconds, not instantly: lean slowly and wait.",
      "The peak moves with altitude and power, so find it again after every change.",
    ],
    failure:
      "A broken probe or wire makes the needle drop to the bottom. The engine is unaffected. Lean by the older method instead: pull the mixture out until the engine just runs rough or the rpm drops, then push it in until it runs smoothly.",
    tip: "Above about 3,000 ft, lean in cruise: it saves fuel and keeps the spark plugs clean. Mixture rich again before descending into the circuit and for any go-around at low altitude.",
  },

  ammeter: {
    id: "ammeter",
    title: "Ammeter",
    group: "System gauge",
    what: "Shows whether the battery is being charged or drained, in amperes.",
    howToRead: [
      "Needle right of zero (+): the alternator is charging the battery. Normal just after starting; then it settles close to zero.",
      "Needle left of zero (−): the battery is supplying the aircraft. Normal only with the engine stopped or at very low rpm.",
      "A steady discharge in flight means the alternator is not working.",
    ],
    reading: ammeterReading,
    howItWorks:
      "It measures the electric current flowing into or out of the battery. The engine-driven alternator (28 volts, 60 amperes) supplies everything while the engine runs; the 24-volt battery starts the engine and is the reserve.",
    errors: [
      "At idle the alternator may not keep up with a heavy load such as the landing light and pitot heat, giving a small discharge on the ground.",
      "It does not show voltage. The LOW VOLTS light does that: it comes on when the system falls below about 24.5 volts.",
    ],
    failure:
      "Alternator failure: the needle shows a discharge and the LOW VOLTS light comes on. The battery alone may last about half an hour — less with many things switched on. Switch the ALT half of the master switch off and on once to try a reset. If that does not work, switch off everything you do not need, expect to lose the radios, flaps and turn coordinator eventually, and land as soon as practical. The engine keeps running: its magnetos need no battery.",
    tip: "Glance at the ammeter after every engine start and after switching on a big load: it should swing toward charge and settle.",
  },

  suction: {
    id: "suction",
    title: "Suction (vacuum) gauge",
    group: "System gauge",
    what: "Shows the suction made by the engine-driven vacuum pump, in inches of mercury. That airflow spins the gyroscopes of the attitude indicator and the heading indicator.",
    howToRead: [
      "Green arc (about 4.5–5.4 inHg): normal.",
      "Below the green the gyros turn too slowly and become unreliable. At zero they are running down.",
      "At idle it may read a little low; check it at 1,700 rpm during the run-up.",
    ],
    reading: suctionReading,
    howItWorks: "A small pressure gauge connected to the vacuum line. The pump is bolted to the engine: no engine, no suction.",
    errors: ["It reads low at idle.", "It tells you about the air supply, not about the gyros themselves: a gyro can fail with normal suction."],
    failure:
      "A failed pump — they can break without warning — makes the needle fall to zero; on this panel the LOW VACUUM light comes on too. The attitude and heading indicators then fade over a few minutes. In cloud that is an emergency: fly by the turn coordinator, airspeed, altimeter, VSI and compass.",
    tip: "Include the suction gauge in the run-up check and in your cruise checks — especially before flying at night or anywhere near cloud.",
  },

  clock: {
    id: "clock",
    title: "Clock and outside air temperature",
    group: "System gauge",
    what: "A digital clock showing UTC (\"Zulu\" time), with the outside air temperature (OAT) underneath.",
    howToRead: [
      "UTC is the same everywhere in the world. Flight plans, weather reports and air traffic control all use it.",
      "OAT is shown in °C (large) and °F (small). The standard temperature is 15 °C at sea level and falls about 2 °C for every 1,000 ft.",
      "Visible moisture (cloud, rain) with the OAT near or below freezing means ice on the airframe. Carburettor ice is possible from about −5 °C to +20 °C in humid air, especially at low power.",
    ],
    reading: clockReading,
    howItWorks: "A quartz clock on a circuit that stays live with the master switch off, and a temperature probe in the outside airflow.",
    errors: [
      "The probe reads slightly high at speed, because the air is compressed and warmed where it strikes the probe — only about a degree in a light trainer.",
      "The display has no light of its own: at night it needs the panel lights.",
    ],
    failure: "If it goes blank, use your watch. Time matters: fuel planning, navigation legs and timed turns all depend on a clock, which is why one is required equipment for instrument flight.",
    tip: "Note the time of take-off and of every tank change. Time is the most reliable fuel gauge you have.",
  },

  annunciators: {
    id: "annunciators",
    title: "Warning lights (annunciators)",
    group: "System gauge",
    what: "Each light comes on to draw your eye to a problem that a small gauge might not.",
    howToRead: [
      `LOW VOLTS (red): the electrical system is below about ${LOW_VOLTS} volts — the alternator is not charging. Normal before engine start; in flight it means alternator failure: check the ammeter.`,
      `LOW VACUUM (amber): suction below about ${LOW_VACUUM_INHG} inHg — the attitude and heading indicators will become unreliable. Normal with the engine stopped.`,
      `L FUEL LOW / R FUEL LOW (amber): less than about ${LOW_FUEL_GAL} gallons shown for that tank.`,
      "STALL — SIM AID (red): the wing is close to the stall. A real Cessna 172 has no such light, only a horn; the light is here because you may be flying without sound.",
      "All of them need electrical power, except the stall light in this simulator.",
    ],
    reading: annunciatorReading,
    howItWorks:
      "Simple pressure, voltage and fuel-level switches each close a circuit to a lamp. The real aeroplane's stall warning is a small reed horn fed from an opening in the wing's leading edge; it sounds when the airflow there reverses, a few knots before the stall, and needs no electricity.",
    errors: [
      "A light tells you THAT something is wrong, not how badly. Always look at the matching gauge.",
      "They can flicker at idle or when fuel sloshes in turbulence.",
      "The values at which they come on are typical ones chosen for this simulator; this exact set of lights is found on newer aircraft than the 172P.",
    ],
    failure: "A burnt-out bulb gives no warning at all. That is why real panels have a press-to-test button, and why the gauges stay part of your scan.",
    tip: "Treat every warning light as a question: which gauge confirms it, and what does the checklist say?",
  },

  com1: {
    id: "com1",
    title: "COM 1 — communication radio",
    group: "Radio / navigation",
    what: "The radio for talking to air traffic control and other aircraft, and for listening to recorded weather broadcasts.",
    howToRead: [
      "Left number: the ACTIVE frequency — the one you hear and transmit on. Right number: the STANDBY frequency you are getting ready.",
      "The large outer knob (or the MHz buttons) changes the whole megahertz, 118 to 136. The small inner knob (or the kHz buttons) changes the part after the decimal point in steps of 25 kHz (.000, .025, .050 …).",
      "To turn a knob: drag it, roll the mouse wheel over it, click its right or left half, or press and hold a button.",
      "The ⇄ button swaps standby and active. Set the next frequency in standby while still using the active one, then swap.",
      "Worth knowing: 121.500 is the emergency frequency; 122.800 is a common advisory frequency at small US airfields without a control tower.",
    ],
    reading: comReading,
    howItWorks:
      "A VHF radio working between 118 and 137 MHz. VHF travels in straight lines (\"line of sight\"): the higher you are, the farther you can hear and be heard — roughly 1.2 times the square root of your height in feet, in nautical miles (about 40 nm at 1,000 ft).",
    errors: [
      "Line of sight only: hills and the curve of the Earth block it. Low down and far away, expect silence.",
      "Only one station can transmit at a time; two at once block each other.",
      "This simulator does not connect you to real air traffic control.",
    ],
    failure:
      "No sound: check the volume, the frequency and that the avionics master is on, then go back to the previous frequency. After a real radio failure in controlled airspace you set the transponder to 7600 and follow the lost-communication procedure; at an airfield, the tower can signal with a light.",
    tip: "Put the next frequency in standby as soon as you know it — and listen before you speak.",
  },

  nav1: {
    id: "nav1",
    title: "NAV 1 — navigation receiver",
    group: "Radio / navigation",
    what: "Receives ground stations called VORs and drives the VOR indicator, which shows where you are in relation to the station.",
    howToRead: [
      "Tune it exactly like the COM radio: left number active, right number standby, ⇄ swaps them. NAV frequencies run from 108.00 to 117.95 MHz in steps of 0.05.",
      "Always identify a station before trusting it: press ID to listen to its Morse code and compare the letters with the chart. The decoded letters also appear in the readout below the radio, as on some modern sets.",
      "Then choose a course with the OBS knob on the VOR indicator.",
    ],
    reading: navReading,
    howItWorks:
      "A VOR station sends two signals whose timing difference depends on the direction from the station — like a lighthouse with a rotating beam plus a flash every time the beam passes north. The receiver measures that difference and so knows which \"radial\" (magnetic bearing FROM the station) you are on, whichever way your nose is pointing.",
    errors: [
      "Line of sight, like all VHF: at low altitude the useful range may be only 25–40 nm.",
      "Accuracy is a few degrees at best: a receiver check allows an error of 4° on the ground and 6° in the air.",
      "Directly above the station is a \"cone of confusion\" where the needle and flag swing about. Hold your heading and wait.",
      "This simulator's receiver understands VOR stations only, not ILS landing aids.",
    ],
    failure:
      "If the signal is lost the striped flag appears on the VOR indicator and the needle goes to the middle. A centred needle with a flag means \"no information\", not \"on course\". Check the frequency, identify again, climb if you can, and fall back on map reading and the compass.",
    tip: "Tune – Identify – Twist: tune the frequency, identify the Morse code, then twist the OBS.",
  },

  dme: {
    id: "dme",
    title: "Station ident and DME readout",
    group: "Radio / navigation",
    what: "A readout for NAV 1: the station's identifier, your distance from it in nautical miles (DME, distance measuring equipment) and how fast that distance is changing, in knots.",
    howToRead: [
      "The letters are the station's identifier — compare them with the chart. Dashes mean nothing is being received.",
      "NM is the straight-line (\"slant\") distance from the aircraft to the station.",
      "KT is how fast you are closing on, or leaving, the station. It equals your ground speed only when you fly straight toward or away from it.",
      "The ID button lets you listen to the station's Morse code.",
      "Many VORs have no DME: the distance then stays dashed.",
    ],
    reading: dmeReading,
    howItWorks: "The aircraft sends a pair of radio pulses, the ground station answers after a fixed delay, and the set measures the time for the round trip and turns it into distance.",
    errors: [
      "Slant range: directly above the station at 6,000 ft it reads 1.0 nm, not zero. The error only matters close in and high up.",
      "The speed is wrong whenever you are not flying straight to or from the station — passing abeam it reads close to zero.",
      "Line of sight, like the VOR itself.",
    ],
    failure: "Dashes, or a distance that stops changing. Cross-check with a second radial or with the map.",
    tip: "A radial and a distance together fix your position with a single station: \"on the 090 radial at 12 miles\".",
  },

  transponder: {
    id: "transponder",
    title: "Transponder",
    group: "Radio / navigation",
    what: "Answers air traffic radar. Each time the radar beam sweeps past, it replies with the four-digit code you have set (the \"squawk\") and, in ALT mode, your altitude — so the controller can see who you are and how high.",
    howToRead: [
      "Code: four digits, each from 0 to 7. Tap the top half of a digit to raise it and the bottom half to lower it, or roll the mouse wheel over it.",
      "1200 is the code for visual flight in the USA (7000 in much of Europe). Air traffic control may give you another one.",
      "Never set these by accident: 7500 unlawful interference (hijack), 7600 radio failure, 7700 emergency.",
      "Mode: OFF; STBY (warmed up, not replying); ON (replies with the code only); ALT (code and altitude — the normal setting in flight).",
    ],
    reading: xpdrReading,
    howItWorks:
      "A receiver and transmitter in one box. Ground radar sends a question on 1030 MHz; the transponder answers on 1090 MHz with the code and, in ALT mode, the altitude from an encoder that is always referenced to standard pressure (29.92 inHg), in 100-ft steps.",
    errors: [
      "The altitude it sends is pressure altitude, not what your altimeter shows; the controller's computer corrects it.",
      "Radar is line of sight: low down or behind hills you may not be seen.",
      "In this simulator the code and mode matter for procedures and lessons; no real radar is listening.",
    ],
    failure: "If it fails, the controller simply stops seeing your code or altitude and will tell you. You may be asked to stay out of airspace where a transponder is required.",
    tip: "When changing code, set the digits in an order that does not pass through 7500, 7600 or 7700 on the way.",
  },

  vor1: {
    id: "vor1",
    title: "VOR indicator (course deviation indicator)",
    group: "Radio / navigation",
    what: "Shows where the course you have selected to or from the tuned VOR station lies: to your left, to your right, or right where you are.",
    howToRead: [
      "Turn the OBS knob until the course you want is under the orange triangle at the top.",
      "The needle shows where that course line is. Needle to the right → the line is to your right → fly right to meet it. Needle centred → you are on the line.",
      "Each dot is 2° off course; the needle against the stop means 10° or more.",
      "The small triangle: ▲ (TO) means the selected course would take you TO the station; ▼ (FROM) means it leads away from it.",
      "Red and white stripes: no usable signal — ignore the needle.",
      "\"Where am I?\" Turn the OBS until the needle centres with FROM: the number at the top is the radial you are on. \"How do I get there?\" Centre it with TO: the number at the top is the course to the station.",
    ],
    reading: vorReading,
    howItWorks:
      "It only compares two numbers: the radial you are on (from the NAV receiver) and the course you have selected. It knows nothing about your heading — the picture is the same whichever way the nose points.",
    errors: [
      "Reverse sensing: if you fly roughly opposite to the selected course, steering toward the needle takes you AWAY from the line.",
      "Near the station the lines are close together and the needle becomes very lively; far away it is sluggish — 30 nm out, one dot is a whole nautical mile.",
      "Passing over the station the needle swings and the flag flips from TO to FROM.",
      "In a crosswind you must point the nose a little into the wind to keep the needle centred.",
    ],
    failure:
      "Signal lost, or the radio without power: the striped flag shows and the needle sits in the middle. A needle that is stuck WITHOUT a flag is more dangerous. Test it: turning the OBS 10° either way should send the needle to the edge of the scale.",
    tip: "To fly to a station: centre the needle with a TO flag, turn onto that heading, then keep the needle centred with small heading changes. Change the heading and wait — don't chase the needle.",
  },

  "master-switch": {
    id: "master-switch",
    title: "Master switch",
    group: "Switch",
    what: "The split red switch controls the whole electrical system. The right half (BAT) connects the battery. The left half (ALT) switches on the alternator so that it generates electricity.",
    howToRead: [
      "Both halves up (ON) is normal for everything from before engine start to shutdown.",
      "BAT alone: battery power only — for a brief check of lights or radios on the ground with the engine stopped. It drains the battery.",
      "ALT cannot be on without BAT: switching BAT off takes ALT with it.",
      "The engine does not need the master switch to keep running: its magnetos make their own sparks.",
    ],
    reading: masterReading,
    howItWorks:
      "BAT closes a heavy relay that joins the 24-volt battery to the main electrical bus. ALT energises the alternator, which is driven by the engine and produces about 28 volts — enough to run everything and recharge the battery.",
    errors: ["Leaving the master on after shutdown flattens the battery within hours.", "A few items, such as the clock, stay powered even with the master off."],
    failure:
      "If the alternator fails, the LOW VOLTS light comes on and the ammeter shows a discharge. The usual drill: ALT half off, then on again once, to reset it. Still failed? ALT off, switch off what you do not need, land as soon as practical. If you ever smell burning or see electrical smoke: master OFF — the engine keeps running.",
    tip: "Master ON is among the first checklist items and master OFF among the last. Look back at the red switch as you leave the aircraft.",
  },

  "avionics-master": {
    id: "avionics-master",
    title: "Avionics master switch",
    group: "Switch",
    what: "One switch that powers all the radios and navigation sets (COM, NAV, DME readout, transponder).",
    howToRead: ["OFF for starting and stopping the engine; ON once the engine is running smoothly.", "It does nothing unless the master switch (BAT) is on."],
    reading: avionicsReading,
    howItWorks: "A switch between the main electrical bus and a separate \"avionics bus\" that feeds the radios.",
    errors: ["It has nothing to do with the engine gauges, lights or flaps — those are on the main bus."],
    failure:
      "If every radio goes dark at once, suspect this switch, its circuit breaker, or the whole electrical system (check the ammeter and the LOW VOLTS light). If only one set is dead, it is that set's own breaker or fault.",
    tip: "Radios off before starting or stopping the engine: the starter causes voltage spikes that delicate electronics do not like.",
  },

  lights: {
    id: "lights",
    title: "Exterior light switches",
    group: "Switch",
    what: "Switches for the lights on the outside of the aeroplane: beacon, landing light, taxi light, navigation lights and strobes.",
    howToRead: [
      "BEACON (flashing red, on top of the fin): on whenever the engine is running — it warns people on the ground.",
      "NAV (red on the left wing tip, green on the right, white on the tail): required from sunset to sunrise. They show other pilots which way you are heading.",
      "STROBE (bright white flashes at the wing tips): on from entering the runway until you have left it after landing. Off in cloud, and on the ground near other people, whom they dazzle.",
      "LAND (landing light): for take-off and landing, and any time you want to be seen — near an airfield, for example.",
      "TAXI: lights the ground just ahead when taxiing at night.",
    ],
    reading: lightsReading,
    howItWorks: "Each switch feeds its lamp from the main electrical bus through a circuit breaker.",
    errors: [
      "Lights use current — the landing light is one of the biggest loads. After an alternator failure, switch off what you do not need.",
      "Lights help others to see you. They are no substitute for looking out.",
    ],
    failure: "A failed lamp is normally found on the walk-round before a night flight: check every light then. A tripped circuit breaker may be reset once after it has cooled; if it trips again, leave it.",
    tip: "A memory aid when lining up: \"lights, camera, action\" — landing light and strobes on, transponder to ALT, then take-off power.",
  },

  "panel-lights": {
    id: "panel-lights",
    title: "Panel light dimmer",
    group: "Switch",
    what: "Sets the brightness of the instrument lighting.",
    howToRead: [
      "Turn it right for brighter, fully left for off. Drag the knob, roll the mouse wheel over it, or click its right or left half.",
      "By day it makes no visible difference.",
      "At night you cannot read the instruments without it — try it and see.",
    ],
    reading: panelLightReading,
    howItWorks: "A variable resistor controlling small lamps that shine on, or through, the instrument faces.",
    errors: [
      "Brighter is not better: bright panel lights spoil your night vision for looking outside. Use the dimmest setting at which you can still read the instruments.",
      "Your eyes need about half an hour to adapt fully to the dark, and a bright light undoes it in seconds.",
      "It needs electrical power.",
    ],
    failure: "If the panel lights fail at night, fly the aeroplane first, then get your torch (flashlight) out. That is why a torch is essential on every night flight; many pilots carry two.",
    tip: "Set the lighting before take-off, not during it.",
  },

  "pitot-heat": {
    id: "pitot-heat",
    title: "Pitot heat switch",
    group: "Switch",
    what: "Switches on an electric heater inside the pitot tube so that ice cannot block it. The pitot tube feeds the airspeed indicator.",
    howToRead: [
      "ON before flying into visible moisture (cloud, rain, snow) when the outside temperature is about +5 °C or colder.",
      "Otherwise OFF. On the ground use it only briefly: without cooling airflow the tube becomes very hot.",
    ],
    reading: pitotReading,
    howItWorks: "A heating element inside the pitot tube, fed from the main electrical bus. It draws a large current.",
    errors: [
      "It protects only the pitot tube — not the static port, the wings or the propeller. This aeroplane is not approved for flight in icing conditions.",
      "It needs electrical power.",
    ],
    failure: "If the pitot tube ices up anyway, the airspeed indicator becomes wrong (see the airspeed indicator's own explanation). Fly known nose attitudes and power settings, get out of the icing conditions, and do not chase the airspeed.",
    tip: "On the walk-round, take the pitot cover off — and before a flight where you may need the heater, check that it works.",
  },

  ignition: {
    id: "ignition",
    title: "Ignition key (magnetos and starter)",
    group: "Switch",
    what: "The key switch for the engine's two ignition systems (magnetos) and for the starter: OFF, R, L, BOTH and START.",
    howToRead: [
      "BOTH: normal for all flight — both magnetos working, two spark plugs firing in every cylinder.",
      "R or L: only that magneto. Used for the magneto check during the run-up, nothing else.",
      "START: spring-loaded. Press and hold it to turn the engine with the starter, and let go when the engine fires; the key springs back to BOTH.",
      "OFF: both magnetos switched off; the engine stops.",
      "Here: tap a position name, or tap the right or left half of the key to turn it one step.",
    ],
    reading: ignitionReading,
    howItWorks:
      "Each magneto is a small generator driven by the engine that makes its own high-voltage sparks, so the engine keeps running with a flat battery or with the master switch off. The key switches a magneto off by short-circuiting (\"grounding\") it. START also closes the starter relay — and the starter does need the battery.",
    errors: [
      "On one magneto the engine gives slightly less power: that is the rpm drop you look for in the run-up check.",
      "If a wire to the switch breaks, that magneto stays live even with the key OFF. Always treat a propeller as if it could fire.",
    ],
    failure:
      "A magneto that fails in flight gives a small rpm drop or rough running; the other one keeps the engine going. If the engine runs rough, try L and R separately — it may be smooth on the good one. NO drop at all during the run-up check is also a fault: it means a magneto cannot be switched off.",
    tip: "Starting: mixture rich, throttle open about a centimetre, master on, look around and call \"Clear prop!\", then hold START. Let go the moment the engine fires and check that the oil pressure comes up.",
  },

  throttle: {
    id: "throttle",
    title: "Throttle",
    group: "Engine control",
    what: "The black knob. It sets engine power by opening or closing a valve in the carburettor that lets more or less fuel-air mixture into the engine.",
    howToRead: [
      "Push in for more power, pull out for less. Fully in is full throttle; fully out is idle.",
      "Read the result on the tachometer.",
      "Drag the knob up or down, roll the mouse wheel over it, or use your throttle keys or lever.",
    ],
    reading: throttleReading,
    howItWorks: "A cable from the knob turns the throttle valve (a flat disc) in the carburettor's air passage. More air through the carburettor draws more fuel with it.",
    errors: [
      "With a fixed-pitch propeller, the rpm you get for a given throttle position changes with airspeed and altitude.",
      "Full throttle gives less power the higher you are, because the air is thinner — roughly 3 % less for every 1,000 ft.",
      "Move it smoothly: about two seconds from idle to full.",
    ],
    failure:
      "If the cable breaks or the linkage jams, the power stays where it is. You can still stop the engine with the mixture. Stuck at high power: fly to an airfield, then shut the engine down with the mixture when you are sure of reaching the runway.",
    tip: "Pitch plus power equals performance. On the approach, think of the throttle as controlling your rate of descent and the elevator as controlling your airspeed.",
  },

  mixture: {
    id: "mixture",
    title: "Mixture control",
    group: "Engine control",
    what: "The red knob. It sets how much fuel is mixed with the air going into the engine.",
    howToRead: [
      "Fully in = full rich: the most fuel. Used for starting, take-off, climb and landing at low elevations.",
      "Pulling it out \"leans\" the mixture (less fuel). Higher up the air is thinner, so the same fuel flow would be too rich: lean in cruise, and for take-off from high airfields (above about 3,000 ft).",
      "Fully out = idle cut-off: no fuel. This is the normal way to stop the engine.",
      "Lean with the EGT gauge, or by ear: pull it out slowly until the rpm peaks and just starts to fall or the engine roughens, then push it in a little.",
    ],
    reading: mixtureReading,
    howItWorks:
      "A valve in the carburettor that restricts the fuel. The engine burns cleanly at about 15 parts of air to 1 part of fuel by weight; richer mixtures run cooler, leaner ones use less fuel — until they are too lean to burn.",
    errors: [
      "Too rich: wasted fuel, fouled spark plugs, rough running and less power at altitude.",
      "Too lean at high power: overheating and possible damage. Too lean at any power: the engine stops.",
      "The right setting changes with altitude and power — lean again after every change.",
    ],
    failure:
      "If the engine stops or runs rough, \"mixture rich\" is one of the first things to do from memory: a mixture left lean during a descent is a classic cause. If the mixture cable breaks, the engine carries on at the last setting.",
    tip: "Red knob = fuel. Before landing: mixture rich (unless the airfield is high). To shut down: mixture to cut-off, then magnetos off, then master off.",
  },

  "carb-heat": {
    id: "carb-heat",
    title: "Carburettor heat",
    group: "Engine control",
    what: "Sends hot air from around the exhaust into the carburettor to melt ice there, or to stop it forming.",
    howToRead: [
      "Pushed in = cold (off), the normal position. Pulled out = hot (on). Use all of it or none.",
      "Use it whenever you suspect ice — an unexplained fall in rpm, or rough running — and before reducing power below the green arc for a descent or approach.",
      "When you pull it, the rpm drops by about 50–100 because hot air is thinner. If there WAS ice, the rpm then rises again as it melts, perhaps after half a minute of rough running. Leave it on until then.",
      "Push it in again for take-off, go-around and climb: full power needs cold, dense air.",
    ],
    reading: carbHeatReading,
    howItWorks:
      "Inside the carburettor the air speeds up and the fuel evaporates, and both cool it — by as much as 20–30 °C. Moisture in the air can then freeze onto the throttle valve even on a warm day and slowly choke the engine. Carburettor heat feeds the engine air that has been warmed by the exhaust instead.",
    errors: [
      "Hot air costs power (about a tenth) and makes the mixture richer.",
      "The hot air is not filtered: avoid using it on dusty ground.",
      "Half-heat can make things worse in very cold air by warming it into the icing range.",
      "Ice is most likely between about −5 °C and +20 °C in humid air, and at low power.",
    ],
    failure:
      "If the engine is losing power and carburettor heat makes no difference, think of the other causes: mixture, fuel selector, magnetos. If the control cable breaks, the heat usually stays as it was.",
    tip: "Carburettor ice gives no warning light. A slow, unexplained loss of rpm is the clue — apply FULL carburettor heat and wait.",
  },

  flaps: {
    id: "flaps",
    title: "Flap lever and position indicator",
    group: "Flight control",
    what: "Flaps are the hinged panels on the back of the wing, next to the fuselage. Lowering them lets the wing make its lift at a lower speed, and adds drag — for slower, steeper approaches.",
    howToRead: [
      "Lever positions: UP, 10°, 20° and 30° (full). The flaps are electric and take a few seconds to move; the narrow indicator on the right shows where they really are.",
      `Use them only below ${V.fe} knots — the top of the white arc on the airspeed indicator.`,
      "Typical use: up or 10° for take-off; 10° on the downwind leg, 20° on base, 30° on final approach.",
      "Lowering flaps makes the nose rise and the aeroplane \"balloon\" for a moment. Hold the nose attitude and re-trim.",
      "Tap a position or drag the lever.",
    ],
    reading: flapReading,
    howItWorks: "An electric motor turns a screw jack that moves both flaps together. They slide back and down on tracks, making the wing more curved and a little larger.",
    errors: [
      "More flap means more drag and a steeper approach at the same speed. The last 10° is nearly all drag.",
      "They need electrical power. No power, no flaps: be ready to land without them — a faster, flatter approach and a longer landing roll.",
      "On a go-around with full flap the aeroplane climbs poorly: go to 20° at once, then raise the rest in stages as the speed builds.",
    ],
    failure:
      "If the motor or the electrics fail, the flaps stay where they are, and the indicator tells you where that is. A landing without flaps uses about 65–70 knots on the approach and needs more runway.",
    tip: "Never raise the flaps close to the ground at low speed — the wing loses lift at once. After take-off, wait for a safe height and at least 60 knots.",
  },

  trim: {
    id: "trim",
    title: "Elevator trim wheel",
    group: "Flight control",
    what: "Sets the speed the aeroplane will hold by itself, so that you do not have to keep pushing or pulling on the control column.",
    howToRead: [
      "Roll the wheel down for nose up, up for nose down. The pointer beside it moves toward UP or DN. (Drag the wheel or roll the mouse wheel over it.)",
      "The mark in the middle (T/O) is the take-off setting. It is on the before-take-off checklist.",
      "Trim only to take away pressure: first hold the nose attitude you want with the control column, then roll the trim until you can relax your hand and nothing changes.",
    ],
    reading: trimReading,
    howItWorks: "The wheel moves a small hinged tab on the back edge of the elevator. The tab deflects one way, the airflow pushes the whole elevator the other way and holds it there for you.",
    errors: [
      "An aeroplane is trimmed for an airspeed, not for a nose attitude: change the power and it will climb or descend at about the same speed.",
      "Every change of speed, power or flap needs a new trim setting.",
      "Flying with the trim wheel instead of the control column leads to chasing the nose up and down: it responds with a delay.",
    ],
    failure:
      "If the trim is stuck or set wrongly you can still fly, but you must hold a steady push or pull — tiring, never impossible in this aeroplane. Taking off with the trim far from the T/O mark gives a surprising pull at lift-off: hold the nose attitude firmly and re-trim.",
    tip: "Attitude, power, trim — in that order, every time. A well-trimmed aeroplane leaves your attention free for looking outside.",
  },

  "fuel-selector": {
    id: "fuel-selector",
    title: "Fuel selector",
    group: "Engine control",
    what: "The valve that chooses which wing tank feeds the engine: LEFT, RIGHT, BOTH — or OFF.",
    howToRead: [
      "BOTH for take-off and landing (it is required then) and normally for the whole flight.",
      "LEFT or RIGHT may be used in level cruise to even out the tanks when one is draining faster.",
      "OFF shuts the fuel off: for an engine fire, or before a forced landing.",
      "Tap or drag toward the position you want.",
    ],
    reading: fuelSelectorReading,
    howItWorks: "In this high-wing aeroplane the fuel simply runs downhill from the wing tanks through the selector valve and a strainer to the carburettor. There is no fuel pump to fail.",
    errors: [
      "Even on BOTH the tanks may drain unevenly, especially if the aeroplane is flown slightly out of balance (ball not centred).",
      "On a single tank with little fuel in it, a steep or unbalanced manoeuvre can uncover the tank outlet.",
      "After changing the selector it takes a moment for the effect to show.",
    ],
    failure:
      "If the engine stops with fuel on board, the selector is one of the items to check from memory: \"fuel selector BOTH\". An engine that stops because one tank ran dry normally restarts within seconds once a tank with fuel in it is selected.",
    tip: "Include the fuel selector in every pre-landing check: \"fuel on BOTH\".",
  },

  "parking-brake": {
    id: "parking-brake",
    title: "Parking brake",
    group: "Flight control",
    what: "Holds the wheel brakes on, so the aeroplane stays put without your feet on the pedals.",
    howToRead: [
      "Handle pulled out and SET showing: the brakes are held. Pushed in: released. Tap it to change.",
      "Set it for starting the engine and for the run-up. Release it before taxiing — and above all before take-off.",
      "In the real aeroplane you press the tops of the rudder pedals, pull the handle and turn it to lock.",
    ],
    reading: parkBrakeReading,
    howItWorks: "The brakes are hydraulic discs on the two main wheels, worked separately by the tops of the left and right rudder pedals. The parking brake simply traps the hydraulic pressure in the lines.",
    errors: [
      "It is no substitute for wheel chocks or tie-down ropes: the pressure can leak away.",
      "Hot brakes can seize if the parking brake is left on after heavy braking.",
      "At high engine power the brakes may not hold the aeroplane on a slippery surface.",
    ],
    failure:
      "A soft or sinking pedal means a hydraulic leak or air in the system; you may have braking on one side only. Land on the longest runway available, into the wind, and steer carefully with rudder and the good brake.",
    tip: "If the aeroplane will not move at normal taxi power, or the take-off roll feels sluggish, check the parking brake first.",
  },
};
