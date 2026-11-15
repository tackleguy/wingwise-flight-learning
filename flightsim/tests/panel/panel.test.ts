/**
 * Panel module tests: dial geometry (does each needle point at the right number?), radio tuning
 * rules, lighting, layouts, the explain content, and a render of the whole panel to markup.
 * Real JSBSim through tests/helpers.ts; no network, no browser.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it } from "vitest";
import { AIRCRAFT } from "@/core/defaults";
import type { Sim } from "@/core/sim";
import { CockpitPanel, EXPLAIN, ExplainCard, INSTRUMENT_IDS, PANEL_HEIGHT_FRACTION, isInstrumentId, panelHeightFraction, panelLayout, panelStubInstruments } from "@/panel";
import { annunciatorStates, suctionAngle } from "@/panel/engine";
import { altimeterAngles, asiAngle, attitudeTransform, ballAngle, cardRotation, cdiOffset, compassMarkX, polar, tachAngle, turnCoordinatorAngle, vsiAngle } from "@/panel/geometry";
import { luminance, panelLighting } from "@/panel/lighting";
import { cleanSquawk, flipFlop, formatFreq, normalizeFreq, stepSquawkDigit, tune } from "@/panel/radio";
import { makeSim } from "../helpers";

describe("dial geometry (angles clockwise from 12 o'clock)", () => {
  it("airspeed: the scale is monotonic and 100 kt is at the bottom of the dial", () => {
    let prev = -1;
    for (let k = 0; k <= 210; k += 1) {
      const a = asiAngle(k);
      expect(a).toBeGreaterThanOrEqual(prev);
      prev = a;
    }
    expect(asiAngle(100)).toBeCloseTo(181, 5);
    expect(asiAngle(40)).toBeCloseTo(32, 5); // about 1 o'clock
    expect(asiAngle(60)).toBeGreaterThan(70); // about 3 o'clock
    expect(asiAngle(60)).toBeLessThan(95);
    expect(asiAngle(200)).toBeLessThan(352); // never wraps past the top
    expect(asiAngle(210)).toBeLessThan(360);
    expect(asiAngle(Number.NaN)).toBe(0);
    // the low speeds are spread out, the high speeds compressed (as on the real instrument)
    expect(asiAngle(70) - asiAngle(60)).toBeGreaterThan(asiAngle(170) - asiAngle(160));
    // the coloured arcs follow the aircraft's published speeds
    const v = AIRCRAFT.v;
    expect([v.s0, v.fe, v.s1, v.no, v.ne]).toEqual([33, 85, 44, 127, 158]);
    expect(asiAngle(v.s0)).toBeLessThan(asiAngle(v.s1));
  });

  it("altimeter: 3,450 ft on the three pointers", () => {
    const a = altimeterAngles(3450);
    expect(a.hundreds).toBeCloseTo(162, 5); // long hand on 4.5 (each number is 36°)
    expect(a.thousands).toBeCloseTo(124.2, 5); // short hand between 3 and 4
    expect(a.tenThousands).toBeCloseTo(12.42, 5); // thin hand a third of the way to 1
    expect(a.hundreds / 36).toBeCloseTo(4.5, 5);
    expect(a.thousands / 36).toBeCloseTo(3.45, 5);
    const b = altimeterAngles(12450);
    expect(b.thousands / 36).toBeCloseTo(2.45, 5);
    expect(b.tenThousands / 36).toBeCloseTo(1.245, 5);
    expect(altimeterAngles(-100).hundreds).toBeCloseTo(324, 5); // below zero the hand backs up to 9
  });

  it("vertical speed: zero at 9 o'clock, climb above it, descent below it, non-linear", () => {
    expect(vsiAngle(0)).toBe(270);
    const up = vsiAngle(500);
    const down = vsiAngle(-500);
    expect(polar(80, up)[1]).toBeLessThan(100); // needle tip above the centre line (SVG y grows downward)
    expect(polar(80, down)[1]).toBeGreaterThan(100);
    expect(up - 270).toBeCloseTo(270 - down, 5); // symmetric
    expect(up - 270).toBeGreaterThan(vsiAngle(2000) - vsiAngle(1500)); // the first 500 fpm is wider than the last
    expect(Math.abs(polar(80, vsiAngle(1000))[0] - 100)).toBeLessThan(5); // 1,000 fpm up is near 12 o'clock
    expect(vsiAngle(5000)).toBe(vsiAngle(2150)); // pegged
    expect(vsiAngle(2000)).toBeLessThan(90); // stops before 3 o'clock
    expect(vsiAngle(-2000)).toBeGreaterThan(90);
  });

  it("attitude: a right bank turns the horizon anticlockwise, nose up moves it down", () => {
    const t = attitudeTransform(5, 30);
    expect(t.rotate).toBe(-30);
    expect(t.shift).toBeGreaterThan(0);
    // where the horizon line is, 50 units right of centre, for a 30° right bank and level pitch:
    // rotate (50, 0) by -30° (SVG rotate is clockwise-positive, y down) -> the right side is HIGHER (smaller y)
    const rad = (attitudeTransform(0, 30).rotate * Math.PI) / 180;
    const yRight = 50 * Math.sin(rad);
    expect(yRight).toBeLessThan(0);
    expect(attitudeTransform(0, -30).rotate).toBe(30);
    expect(attitudeTransform(-10, 0).shift).toBeLessThan(0);
  });

  it("turn coordinator: standard rate puts the wing on the mark, ball follows its sign", () => {
    expect(turnCoordinatorAngle(1)).toBe(20);
    expect(turnCoordinatorAngle(-1)).toBe(-20);
    expect(turnCoordinatorAngle(10)).toBeLessThan(45);
    expect(ballAngle(0.5)).toBeGreaterThan(0);
    expect(ballAngle(-3)).toBe(-ballAngle(3));
  });

  it("heading card, compass card and CDI needle move the right way", () => {
    expect(cardRotation(45)).toBe(-45); // the card turns anticlockwise so 045 comes under the top index
    // magnetic compass flying north: 030 is drawn LEFT of the lubber line, 330 right of it
    expect(compassMarkX(30, 0)).toBeLessThan(0);
    expect(compassMarkX(330, 0)).toBeGreaterThan(0);
    expect(compassMarkX(45, 45)).toBeCloseTo(0, 9);
    expect(compassMarkX(10, 350)).toBeLessThan(0); // works across north
    expect(cdiOffset(2)).toBeGreaterThan(0); // + dots = needle right
    expect(cdiOffset(-2)).toBe(-cdiOffset(2));
    expect(cdiOffset(99)).toBe(cdiOffset(5.5));
  });

  it("tachometer and suction scales", () => {
    expect(tachAngle(0)).toBe(225);
    expect(tachAngle(3500)).toBe(495);
    expect(tachAngle(1750) % 360).toBe(0); // half scale at 12 o'clock
    expect(tachAngle(2700)).toBeGreaterThan(tachAngle(2100));
    expect(suctionAngle(5)).toBeCloseTo(0, 5); // 5 inHg straight up, inside the green arc 4.5–5.4
    expect(suctionAngle(0)).toBeLessThan(suctionAngle(3));
  });
});

describe("radio tuning", () => {
  it("COM: 118.000–136.975 in 25 kHz steps, each knob wraps on its own", () => {
    expect(tune("com", 118.0, "khz", 1)).toBe(118.025);
    expect(tune("com", 136.975, "khz", 1)).toBe(136.0);
    expect(tune("com", 136.0, "khz", -1)).toBe(136.975);
    expect(tune("com", 136.975, "mhz", 1)).toBe(118.975);
    expect(tune("com", 118.5, "mhz", -1)).toBe(136.5);
    expect(tune("com", 121.5, "mhz", 3)).toBe(124.5);
    let f = 118.0;
    const seen = new Set<number>();
    for (let i = 0; i < 40; i++) {
      seen.add(f);
      f = tune("com", f, "khz", 1);
    }
    expect(seen.size).toBe(40);
    expect(f).toBe(118.0);
    for (let m = 118; m <= 136; m++) for (let k = 0; k < 1000; k += 25) expect(tune("com", m + k / 1000, "khz", 0)).toBe((m * 1000 + k) / 1000);
  });

  it("NAV: 108.00–117.95 in 50 kHz steps", () => {
    expect(tune("nav", 108.0, "khz", 1)).toBe(108.05);
    expect(tune("nav", 117.95, "khz", 1)).toBe(117.0);
    expect(tune("nav", 117.95, "mhz", 1)).toBe(108.95);
    expect(tune("nav", 108.0, "mhz", -1)).toBe(117.0);
    expect(normalizeFreq("nav", 200)).toBe(117.95);
    expect(normalizeFreq("nav", 1)).toBe(108.0);
    expect(normalizeFreq("nav", 110.02)).toBe(110.0);
    expect(normalizeFreq("com", Number.NaN)).toBe(118.0);
  });

  it("formats, flip-flops and squawks", () => {
    expect(formatFreq("com", 122.8)).toBe("122.800");
    expect(formatFreq("nav", 110)).toBe("110.00");
    const r = { active: 122.8, standby: 121.5 };
    flipFlop(r);
    expect(r).toEqual({ active: 121.5, standby: 122.8 });
    expect(cleanSquawk("12")).toBe("0012");
    expect(cleanSquawk("9812x")).toBe("0012"); // 9 and 8 are not valid transponder digits
    expect(stepSquawkDigit("1200", 0, 1)).toBe("2200");
    expect(stepSquawkDigit("7200", 0, 1)).toBe("0200");
    expect(stepSquawkDigit("1200", 3, -1)).toBe("1207");
  });
});

describe("panel lighting", () => {
  const mk = (day: number, dim: number, powered = true) => luminance(panelLighting(day, dim, powered).vars["--tx-mk"]!);
  it("day: plain white markings whatever the dimmer does", () => {
    expect(mk(1, 0)).toBeGreaterThan(0.9);
    expect(mk(1, 1)).toBeCloseTo(mk(1, 0), 2);
  });
  it("night without panel lights is hard to read; with them the markings glow warm", () => {
    expect(mk(0, 0)).toBeLessThan(0.13);
    expect(mk(0, 0)).toBeGreaterThan(0.04); // dark, not invisible
    expect(mk(0, 0.6)).toBeGreaterThan(0.5);
    expect(mk(0, 1)).toBeGreaterThan(mk(0, 0.3));
    const warm = /rgb\((\d+) (\d+) (\d+)\)/.exec(panelLighting(0, 1, true).vars["--tx-mk"]!)!;
    expect(Number(warm[1])).toBeGreaterThan(Number(warm[3]) + 40); // more red than blue
  });
  it("the lamps need electricity", () => {
    expect(mk(0, 1, false)).toBeCloseTo(mk(0, 0), 5);
    expect(panelLighting(0, 1, false).glow).toBe(0);
  });
  it("only reports a new key when the picture changes", () => {
    expect(panelLighting(0.5, 0.5, true).key).toBe(panelLighting(0.5, 0.5, true).key);
    expect(panelLighting(0, 0.5, true).key).not.toBe(panelLighting(0, 0.9, true).key);
  });
});

describe("layouts", () => {
  it("desktop: everything visible, about 41 % of the height", () => {
    for (const [w, h] of [
      [1280, 720],
      [1920, 1080],
      [1366, 768],
      [2560, 1440],
    ] as const) {
      const m = panelLayout(w, h);
      expect(m.mode).toBe("wide");
      expect(m.fraction).toBeGreaterThan(0.38);
      expect(m.fraction).toBeLessThanOrEqual(0.44);
      expect(m.dialPx).toBeGreaterThan(120);
    }
    expect(panelLayout(1280, 720).fraction).toBeCloseTo(PANEL_HEIGHT_FRACTION.wide, 1);
    expect(panelLayout(2560, 1080).fraction).toBeLessThanOrEqual(0.44); // ultra-wide: limited by height
  });

  it("compact screens keep every six-pack dial at 96 px or more", () => {
    const screens: [number, number][] = [
      [1024, 768],
      [1180, 820],
      [820, 1180],
      [768, 1024],
      [844, 390],
      [932, 430],
      [667, 375],
      [390, 844],
      [360, 640],
      [412, 915],
      [800, 600],
    ];
    for (const [w, h] of screens) {
      for (const drawerOpen of [undefined, true, false]) {
        const m = panelLayout(w, h, { drawerOpen });
        expect(m.mode).not.toBe("wide");
        expect(m.dialPx, `${w}x${h} ${String(drawerOpen)}`).toBeGreaterThanOrEqual(96);
        expect(m.heightPx).toBeLessThanOrEqual(h);
        expect(m.fraction).toBeGreaterThan(0.15);
      }
    }
  });

  it("drawer: landscape toggles between the strip and the side-by-side layout; portrait stacks", () => {
    expect(panelLayout(844, 390).mode).toBe("row"); // phones start with the low-profile strip
    expect(panelLayout(844, 390, { drawerOpen: true }).mode).toBe("side");
    expect(panelLayout(1024, 768).mode).toBe("side"); // tablets start open
    expect(panelLayout(1024, 768, { drawerOpen: false }).mode).toBe("row");
    expect(panelLayout(390, 844).mode).toBe("stack");
    expect(panelLayout(390, 844).drawerOpen).toBe(false);
    expect(panelLayout(820, 1180).drawerOpen).toBe(true);
    const closed = panelLayout(390, 844, { drawerOpen: false });
    const open = panelLayout(390, 844, { drawerOpen: true });
    expect(open.heightPx).toBeGreaterThan(closed.heightPx + 150);
    expect(panelLayout(844, 390).fraction).toBeLessThanOrEqual(0.43);
  });

  it("panelHeightFraction is what the views module needs", () => {
    expect(panelHeightFraction(1280, 720)).toBeCloseTo(292 / 720, 5);
    expect(panelHeightFraction(1280, 720, { hidden: true })).toBe(0);
    expect(panelHeightFraction(0, 0)).toBeGreaterThan(0); // never NaN
  });
});

describe("warning lights", () => {
  const ind = { suctionInHg: 5, fuelLeftGal: 12, fuelRightGal: 12 };
  it("stay dark when all is well", () => {
    expect(annunciatorStates(ind, { busVolts: 28, stallHorn: false }, true)).toEqual([false, false, false, false, false]);
  });
  it("low volts below 24.5 V, low vacuum, low fuel below 5 gal, each on its own lamp", () => {
    expect(annunciatorStates(ind, { busVolts: 24, stallHorn: false }, true)[0]).toBe(true);
    expect(annunciatorStates({ ...ind, suctionInHg: 2 }, { busVolts: 28, stallHorn: false }, true)[1]).toBe(true);
    expect(annunciatorStates({ ...ind, fuelLeftGal: 4.9 }, { busVolts: 28, stallHorn: false }, true)).toEqual([false, false, true, false, false]);
    expect(annunciatorStates({ ...ind, fuelRightGal: 0 }, { busVolts: 28, stallHorn: false }, true)[3]).toBe(true);
  });
  it("need electricity — except the stall light, which is a simulator aid", () => {
    expect(annunciatorStates({ suctionInHg: 0, fuelLeftGal: 0, fuelRightGal: 0 }, { busVolts: 0, stallHorn: true }, false)).toEqual([false, false, false, false, true]);
  });
});

describe("explain content", () => {
  let sim: Sim;
  beforeAll(async () => {
    sim = makeSim(0);
    sim.use(panelStubInstruments());
    await sim.spawn({ kind: "air", lat: 37.6, lon: -122.3, altFtMsl: 3500, headingTrue: 90, kias: 100 });
    sim.advance(3);
  });

  it("covers every instrument and control with real text", () => {
    expect(Object.keys(EXPLAIN).sort()).toEqual([...INSTRUMENT_IDS].sort());
    for (const id of INSTRUMENT_IDS) {
      const x = EXPLAIN[id];
      expect(x.id).toBe(id);
      expect(x.title.length, id).toBeGreaterThan(3);
      expect(x.what.length, id).toBeGreaterThan(40);
      expect(x.howToRead.length, id).toBeGreaterThanOrEqual(2);
      expect(x.howItWorks.length, id).toBeGreaterThan(50);
      expect(x.errors.length, id).toBeGreaterThanOrEqual(1);
      expect(x.failure.length, id).toBeGreaterThan(60);
      expect(x.tip.length, id).toBeGreaterThan(20);
      for (const t of [x.what, x.howItWorks, x.failure, x.tip, ...x.howToRead, ...x.errors]) expect(t.trim(), id).toBe(t);
    }
    expect(isInstrumentId("airspeed")).toBe(true);
    expect(isInstrumentId("nonsense")).toBe(false);
  });

  it("interprets the present reading of every instrument in flight", () => {
    for (const id of INSTRUMENT_IDS) {
      const text = EXPLAIN[id].reading(sim);
      expect(text.length, id).toBeGreaterThan(8);
      expect(text, id).not.toMatch(/NaN|undefined|null|Infinity/);
    }
  });

  it("the stub stands in for the instruments module (truth copied to the indications)", () => {
    const s = sim.state;
    expect(s.ind.ias).toBeCloseTo(s.kcas, 5);
    expect(Math.abs(s.ind.alt - s.altMslFt)).toBeLessThan(60);
    expect(s.sys.busVolts).toBeGreaterThan(24.5);
    expect(s.sys.avionicsPowered).toBe(true);
    expect(s.ind.suctionInHg).toBeGreaterThan(4);
    // and the needle then points where a pilot expects: about 100 kt is at the bottom of the dial
    expect(Math.abs(asiAngle(s.ind.ias) - 181)).toBeLessThan(25);
  });

  it("explains specific situations in plain words", () => {
    const ind = sim.state.ind;
    const c = sim.controls;
    const keep = { ...ind };
    const say = (id: (typeof INSTRUMENT_IDS)[number]) => EXPLAIN[id].reading(sim);
    ind.ias = 76;
    expect(say("airspeed")).toMatch(/76 knots.*VY.*best rate-of-climb/);
    ind.ias = 65;
    expect(say("airspeed")).toMatch(/best glide/);
    ind.ias = 140;
    expect(say("airspeed")).toMatch(/yellow caution range/);
    ind.ias = 165;
    expect(say("airspeed")).toMatch(/red line/);
    ind.ias = 5;
    expect(say("airspeed")).toMatch(/resting/);
    ind.ias = 100;
    c.flapIndex = 2;
    expect(say("airspeed")).toMatch(/above the flap limit/);
    expect(say("flaps")).toMatch(/above the flap limit of 85/);
    c.flapIndex = 0;

    ind.alt = 3450;
    c.altimeterInHg = 29.92;
    expect(say("altimeter")).toMatch(/3,450 ft with 29\.92 inHg.*between 3 and 4.*long hand on 4½/);

    ind.attPitch = 5;
    ind.attRoll = 30;
    expect(say("attitude")).toMatch(/5° above the horizon.*30° of bank to the right.*medium/);
    ind.attRoll = -10;
    expect(say("attitude")).toMatch(/to the left.*shallow/);

    ind.turnRate = 1;
    ind.ball = 0.6;
    expect(say("turn-coordinator")).toMatch(/turning right.*standard-rate.*ball is out to the right.*right rudder/);

    ind.dgMag = 45;
    ind.compassMag = 47;
    c.headingBugMag = 120;
    expect(say("heading")).toMatch(/045°.*north-east.*agree.*bug is on 120°, 75° to your right/);
    ind.compassMag = 60;
    expect(say("heading")).toMatch(/differ by 15°/);

    ind.vs = 520;
    expect(say("vsi")).toMatch(/Climbing at about 500 feet per minute/);
    ind.vs = -20;
    expect(say("vsi")).toMatch(/holding altitude/);

    const nav = sim.state.nav.nav1;
    const keepNav = { ...nav };
    Object.assign(nav, { valid: true, flag: "TO", cdiDots: 2, ident: "SFO", name: "San Francisco", radialMag: 100, bearingToMag: 280, dmeNm: 12.4, dmeGsKt: 98 });
    c.obs1 = 90;
    ind.dgMag = 85;
    expect(say("vor1")).toMatch(/Course 090° selected, flag TO.*2\.0 dots to the right.*about 4° to your right/);
    expect(say("vor1")).not.toMatch(/reverse sensing/);
    ind.dgMag = 270;
    expect(say("vor1")).toMatch(/reverse sensing/);
    expect(say("dme")).toMatch(/SFO, 12\.4 nautical miles.*98 knots.*about 8 minutes/);
    expect(say("nav1")).toMatch(/Receiving SFO.*100° radial/);
    nav.flag = "OFF";
    nav.valid = false;
    expect(say("vor1")).toMatch(/striped flag.*Ignore the needle/);
    Object.assign(nav, keepNav);

    c.xpdr.code = "7700";
    c.xpdr.mode = "ALT";
    expect(say("transponder")).toMatch(/7700.*EMERGENCY/);
    c.xpdr.code = "1200";

    c.masterBattery = c.masterAlternator = false;
    sim.state.sys.busVolts = 0;
    expect(say("master-switch")).toMatch(/Both halves OFF/);
    expect(say("fuel-quantity")).toMatch(/no power/);
    expect(say("turn-coordinator")).toMatch(/red flag/);
    c.masterBattery = c.masterAlternator = true;
    sim.state.sys.busVolts = 28;

    c.ignition = 3;
    expect(say("ignition")).toMatch(/BOTH/);
    c.fuelSelector = "off";
    expect(say("fuel-selector")).toMatch(/OFF: no fuel can reach the engine/);
    c.fuelSelector = "both";
    Object.assign(ind, keep);
  });
});

describe("rendering", () => {
  const ids = (html: string) => new Set([...html.matchAll(/data-instrument="([^"]+)"/g)].map((m) => m[1]!));
  const ctls = (html: string) => new Set([...html.matchAll(/data-ctl="([^"]+)"/g)].map((m) => m[1]!));
  let sim: Sim;
  beforeAll(() => {
    sim = makeSim(0);
  });

  it("the wide layout draws every instrument and control exactly once", () => {
    const html = renderToStaticMarkup(createElement(CockpitPanel, { sim, viewport: { width: 1280, height: 720 } }));
    expect(html).toContain('data-layout="wide"');
    expect([...ids(html)].sort()).toEqual([...INSTRUMENT_IDS].sort());
    for (const id of INSTRUMENT_IDS) {
      if (id === "lights") continue; // five separate switches
      expect(html.split(`data-instrument="${id}"`).length - 1, id).toBe(1);
    }
    expect(html.split('data-instrument="lights"').length - 1).toBe(5);
    const c = ctls(html);
    for (const need of ["baro-knob", "dg-knob", "hdg-bug-knob", "dg-align", "obs1-knob", "com1-flip", "com1-mhz-knob", "com1-khz-knob", "nav1-flip", "nav1-ident", "xpdr-alt", "master-bat", "master-alt", "avionics-master", "ignition-start", "throttle", "mixture", "carb-heat", "flap-lever", "trim-wheel", "fuel-selector", "parking-brake", "panel-dimmer", "light-beacon", "pitot-heat", "panel-hide", "explain-toggle"]) expect(c.has(need), need).toBe(true);
    // authentic markings are really in the drawing
    for (const text of ["AIRSPEED", "KNOTS", "TURN COORDINATOR", "NO PITCH INFORMATION", "2 MIN", "VERTICAL", "IN HG", "RPM", "SUCTION", "SIM AID", "STANDBY", "MAGNETOS", "WING FLAPS"]) expect(html, text).toContain(text);
  });

  it("compact layouts: six-pack, compass and warning lights always; the rest on pages", () => {
    const always = ["airspeed", "attitude", "altimeter", "turn-coordinator", "heading", "vsi", "compass", "annunciators"];
    const cases: [number, number, boolean | undefined, string, boolean][] = [
      [1024, 768, undefined, "side", true],
      [844, 390, undefined, "row", false],
      [390, 844, undefined, "stack", false],
      [820, 1180, undefined, "stack", true],
    ];
    for (const [width, height, , mode, all] of cases) {
      const html = renderToStaticMarkup(createElement(CockpitPanel, { sim, viewport: { width, height } }));
      expect(html).toContain(`data-layout="${mode}"`);
      const got = ids(html);
      for (const id of always) expect(got.has(id), `${mode} ${id}`).toBe(true);
      if (all) expect([...got].sort()).toEqual([...INSTRUMENT_IDS].sort());
      else expect(got.size).toBe(always.length);
      expect(html).toContain('data-tab="engine"');
    }
  });

  it("hidden: only the small tab to bring it back", () => {
    const html = renderToStaticMarkup(createElement(CockpitPanel, { sim, defaultHidden: true, viewport: { width: 1280, height: 720 } }));
    expect(html).toContain('data-ctl="panel-show"');
    expect(ids(html).size).toBe(0);
  });

  it("the explain card renders the teaching text and the live reading", () => {
    sim.state.ind.ias = 76;
    const html = renderToStaticMarkup(createElement(ExplainCard, { id: "airspeed", sim, onClose: () => undefined }));
    expect(html).toContain("Airspeed indicator");
    expect(html).toContain("best rate-of-climb");
    expect(html).toContain("How it works");
    expect(html).toContain("not an approved training device");
  });
});
