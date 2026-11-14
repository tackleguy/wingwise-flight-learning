import { describe, expect, it } from "vitest";
import { SimEngine } from "./engine";
import { WEATHER_PRESETS } from "./environment";
import { getAirport, getRunwayEnd } from "@/lib/data/airports";

const calm = { ...WEATHER_PRESETS["cavu"]!.weather, windKt: 0, windAloftKt: 0, timeOfDay: 12 };

function onRunway(perfId: string) {
  const ap = getAirport("KSFO")!;
  const re = getRunwayEnd(ap, "28R")!;
  return new SimEngine({
    perfId,
    magVar: ap.magVar,
    weather: calm,
    start: { lat: re.end.threshold.lat, lon: re.end.threshold.lon, altMslFt: ap.elevationFt, heading: re.end.trueHeading, iasKt: 0, onGround: true, groundElevFt: ap.elevationFt, engineRunning: true },
  });
}

function run(sim: SimEngine, sec: number, each?: (t: number) => void) {
  for (let t = 0; t < sec; t += 0.1) {
    sim.advance(0.1);
    each?.(t);
  }
}

describe("flight model", () => {
  it("C172 takes off, climbs and cruises believably", () => {
    const sim = onRunway("c172");
    sim.setControls({ throttle: 1, parkingBrake: false });
    let liftoffIas = 0;
    sim.onEvent((e) => {
      if (e.type === "liftoff") liftoffIas = Number(e.data?.["ias"] ?? 0);
    });
    // Rotate at ~55 KIAS, then release back pressure and trim for Vy.
    run(sim, 40, () => {
      const s = sim.getSnapshot().aircraft;
      if (s.onGround) sim.setControls({ elevator: s.iasKt > 52 ? 0.35 : 0 });
      else sim.setControls({ elevator: 0, trim: sim.trimForSpeed(74) });
    });
    const s1 = sim.getSnapshot().aircraft;
    console.log("after takeoff", { liftoffIas, ias: s1.iasKt.toFixed(0), agl: s1.aglFt.toFixed(0), vs: s1.vsFpm.toFixed(0), pitch: s1.pitch.toFixed(1), crash: s1.crashReason });
    expect(s1.onGround).toBe(false);
    expect(liftoffIas).toBeGreaterThan(40);
    expect(liftoffIas).toBeLessThan(70);
    // Climb at ~Vy: trim for 74 kt
    sim.setControls({ elevator: 0, trim: sim.trimForSpeed(74) });
    run(sim, 60);
    const s2 = sim.getSnapshot().aircraft;
    console.log("climb", { ias: s2.iasKt.toFixed(0), vs: s2.vsFpm.toFixed(0), alt: s2.altMslFt.toFixed(0), pitch: s2.pitch.toFixed(1) });
    expect(s2.vsFpm).toBeGreaterThan(400);
    expect(s2.vsFpm).toBeLessThan(1100);
    // Cruise: 70% power, trim for level
    sim.setControls({ throttle: 0.72, trim: sim.trimForSpeed(115) });
    run(sim, 120);
    const s3 = sim.getSnapshot().aircraft;
    console.log("cruise", { ias: s3.iasKt.toFixed(0), tas: s3.tasKt.toFixed(0), vs: s3.vsFpm.toFixed(0), alt: s3.altMslFt.toFixed(0), rpm: s3.rpm.toFixed(0), ff: s3.fuelFlowGph.toFixed(1) });
    expect(s3.crashed).toBe(false);
  });

  it("autopilot holds altitude and heading", () => {
    const ap = getAirport("KSFO")!;
    const sim = new SimEngine({ perfId: "c172", magVar: ap.magVar, weather: calm, start: { lat: ap.lat, lon: ap.lon, altMslFt: 4000, heading: 90, iasKt: 105, onGround: false, groundElevFt: 13, engineRunning: true, throttle: 0.9 } });
    sim.setRadios({ hdgBug: 180, altBug: 5000 });
    sim.apToggle();
    sim.apLateral("HDG");
    sim.apVertical("VS");
    sim.setRadios({ vsBug: 500 });
    run(sim, 240);
    const s = sim.getSnapshot();
    console.log("AP", { hdg: s.indicated.headingMag.toFixed(0), alt: s.indicated.altFt.toFixed(0), mode: s.ap.vertical, ias: s.aircraft.iasKt.toFixed(0), bank: s.aircraft.bank.toFixed(1) });
    expect(Math.abs(s.indicated.headingMag - 180)).toBeLessThan(5);
    expect(Math.abs(s.indicated.altFt - 5000)).toBeLessThan(120);
    expect(s.ap.vertical).toBe("ALT");
  });

  it("stalls when pulled hard at idle", () => {
    const ap = getAirport("KSFO")!;
    const sim = new SimEngine({ perfId: "c172", magVar: ap.magVar, weather: calm, start: { lat: ap.lat, lon: ap.lon, altMslFt: 5000, heading: 90, iasKt: 90, onGround: false, groundElevFt: 13, engineRunning: true, throttle: 0 } });
    sim.setControls({ throttle: 0, elevator: 1 });
    let stalled = false;
    let minIas = 999;
    run(sim, 30, () => {
      const a = sim.getSnapshot().aircraft;
      if (a.stalled) stalled = true;
      minIas = Math.min(minIas, a.iasKt);
    });
    console.log("stall", { stalled, minIas: minIas.toFixed(0) });
    expect(stalled).toBe(true);
  });

  it("737 takes off", () => {
    const sim = onRunway("b738");
    sim.setControls({ throttle: 1, flapIndex: 2 });
    run(sim, 35);
    sim.setControls({ elevator: 0.6 });
    run(sim, 15);
    const a = sim.getSnapshot().aircraft;
    console.log("737", { ias: a.iasKt.toFixed(0), agl: a.aglFt.toFixed(0), onGround: a.onGround, crash: a.crashReason });
    expect(a.onGround).toBe(false);
  });
});

import { SCENARIOS, scoreObjectives } from "./scenarios";

describe("scenarios", () => {
  for (const sc of SCENARIOS) {
    it(`builds and runs ${sc.id}`, () => {
      const b = sc.build({ aircraftId: sc.defaultAircraft });
      const sim = new SimEngine(b.options);
      b.setup?.(sim);
      sim.onEvent((e) => {
        for (const o of b.objectives) o.event(e, sim.getSnapshot());
      });
      for (let t = 0; t < 20; t += 0.1) {
        sim.advance(0.1);
        for (const o of b.objectives) o.update(sim.getSnapshot(), 0.1);
      }
      const a = sim.getSnapshot().aircraft;
      const r = scoreObjectives(b.objectives, a.crashReason);
      expect(a.crashed, `${sc.id} crashed: ${a.crashReason}`).toBe(false);
      expect(r.results.length).toBeGreaterThan(0);
      if (!b.options.start.onGround) expect(a.aglFt).toBeGreaterThan(100);
    });
  }
});
