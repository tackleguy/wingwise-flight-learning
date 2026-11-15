import { describe, expect, it } from "vitest";
import { createInstruments } from "@/instruments";
import { makeSim } from "../helpers";
import { cruise, makeRig, stubSystems } from "./pilot";

describe("engine gauges", () => {
  it("tachometer, oil, EGT and suction follow the engine (with a little lag)", async () => {
    const { sim, pilot } = await makeRig(cruise(360));
    const s = sim.state;
    const i = s.ind;
    pilot.fly(20, { altFt: 3500, bankDeg: 0, kcas: 100 });
    expect(s.rpm).toBeGreaterThan(1800);
    expect(Math.abs(i.tachRpm - s.rpm)).toBeLessThan(15);
    expect(Math.abs(i.oilPressPsi - s.oilPressPsi)).toBeLessThan(2);
    expect(Math.abs(i.oilTempF - s.oilTempF)).toBeLessThan(4);
    expect(Math.abs(i.egtF - s.egtF)).toBeLessThan(40);
    expect(i.suctionInHg).toBeGreaterThan(4.4);
    expect(i.suctionInHg).toBeLessThan(5.5);
    expect(Math.abs(i.oatC - s.oatC)).toBeLessThan(2.5);
    expect(i.oatC).toBeGreaterThan(s.oatC); // the probe reads slightly warm in the airflow

    // close the throttle: the tachometer needle is a moment behind the engine
    const rpmBefore = s.rpm;
    sim.controls.throttle = 0;
    sim.advance(0.6);
    expect(s.rpm).toBeLessThan(rpmBefore - 40); // the engine is slowing down …
    expect(i.tachRpm).toBeGreaterThan(s.rpm + 3); // … and the needle has not quite caught up
    expect(i.tachRpm).toBeLessThan(rpmBefore);
    pilot.fly(8, { altFt: 3500, bankDeg: 0, throttle: 0 });
    expect(Math.abs(i.tachRpm - s.rpm)).toBeLessThan(25);
  });

  it("hour meter runs only while the engine runs, and is not reset by a reposition", async () => {
    const sim = makeSim(4);
    sim.use(createInstruments());
    await sim.spawn({ kind: "ramp", airportIdent: "KSFO", runwayEndId: "28R" });
    const s = sim.state;
    sim.advance(60);
    expect(s.sys.engineRunning).toBe(false);
    expect(s.ind.hobbs).toBe(0);

    await sim.spawn({ kind: "runway", airportIdent: "KSFO", runwayEndId: "28R" });
    sim.advance(360); // six minutes = 0.1 hour
    expect(s.sys.engineRunning).toBe(true);
    expect(s.ind.hobbs).toBeGreaterThan(0.0995);
    expect(s.ind.hobbs).toBeLessThan(0.1005);

    await sim.spawn(cruise(90));
    expect(s.ind.hobbs).toBeGreaterThan(0.0995); // carried over
    sim.advance(36);
    expect(s.ind.hobbs).toBeGreaterThan(0.1095);
  });

  it("fuel gauges: roughly right when full, accurate at empty, slow, and dead without electricity", async () => {
    const sim = makeSim(4);
    sim.use(createInstruments());
    const power = stubSystems(sim);
    sim.loading.fuelLeftGal = 0;
    sim.loading.fuelRightGal = 18;
    await sim.spawn({ kind: "runway", airportIdent: "KSFO", runwayEndId: "28R" });
    const s = sim.state;
    const i = s.ind;
    sim.advance(20);
    expect(s.fuelLeftGal).toBeLessThan(0.05);
    // the one thing a light-aircraft fuel gauge must get right: empty reads empty
    expect(i.fuelLeftGal).toBeLessThan(0.3);
    // a partly full tank is only shown approximately
    expect(Math.abs(i.fuelRightGal - s.fuelRightGal)).toBeLessThan(2.5);
    expect(Math.abs(i.fuelRightGal - s.fuelRightGal)).toBeGreaterThan(0.05);

    // master switch off: both needles fall to E
    const shown = i.fuelRightGal;
    power.busVolts = 0;
    sim.advance(6);
    expect(i.fuelRightGal).toBeLessThan(0.1);
    expect(i.oilTempF).toBeLessThan(80); // the electric oil temperature gauge drops to the bottom of its scale too
    expect(i.oilPressPsi).toBeGreaterThan(15); // the oil PRESSURE gauge is mechanical and keeps working
    expect(i.tachRpm).toBeGreaterThan(400); // so does the tachometer

    // power back: the heavily damped needle takes several seconds to come up again
    power.busVolts = 28;
    sim.advance(1);
    expect(i.fuelRightGal).toBeLessThan(shown * 0.35);
    sim.advance(30);
    expect(Math.abs(i.fuelRightGal - shown)).toBeLessThan(0.3);
  });

  it("fuel gauges wander in unbalanced flight although the fuel on board hardly changes", async () => {
    // half-full tanks: that is when the fuel has the most room to move
    const { sim, pilot } = await makeRig(cruise(360), { setup: (sm) => Object.assign(sm.loading, { fuelLeftGal: 11, fuelRightGal: 11 }) });
    const s = sim.state;
    pilot.fly(30, { altFt: 3500, bankDeg: 0, kcas: 100 });
    expect(Math.abs(s.ind.fuelLeftGal - s.fuelLeftGal)).toBeLessThan(2.5);
    const left = s.ind.fuelLeftGal;
    const right = s.ind.fuelRightGal;
    // a long skid with right rudder: the fuel runs toward the left wing tips/roots
    pilot.fly(30, { altFt: 3500, bankDeg: 0, rudder: 0.4 });
    const dLeft = s.ind.fuelLeftGal - left;
    const dRight = s.ind.fuelRightGal - right;
    expect(Math.abs(s.fuelLeftGal - 11)).toBeLessThan(0.3); // the fuel on board has hardly changed
    expect(Math.abs(dLeft)).toBeGreaterThan(0.3);
    expect(Math.abs(dRight)).toBeGreaterThan(0.3);
    expect(Math.sign(dLeft)).toBe(-Math.sign(dRight)); // one reads higher, the other lower
    expect(Math.abs(dLeft)).toBeLessThan(3);
  });

  it("ammeter: charging with the alternator, discharging without it", async () => {
    const { sim } = await makeRig({ kind: "runway", airportIdent: "KSFO", runwayEndId: "28R" }, { elevM: 4 });
    const s = sim.state;
    sim.advance(10);
    expect(s.ind.ammeterA).toBeGreaterThan(0.5); // alternator on line: a small charge
    expect(s.ind.ammeterA).toBeLessThan(10);
    sim.controls.masterAlternator = false;
    sim.controls.lights.landing = true;
    sim.advance(5);
    expect(s.ind.ammeterA).toBeLessThan(-10); // the battery is carrying the load
    sim.controls.masterBattery = false;
    sim.advance(5);
    expect(Math.abs(s.ind.ammeterA)).toBeLessThan(0.2);
  });

  it("ammeter shows the battery current reported by a systems module when there is one", async () => {
    const { sim } = await makeRig({ kind: "runway", airportIdent: "KSFO", runwayEndId: "28R" }, { elevM: 4 });
    const power = stubSystems(sim);
    power.batteryAmps = -17;
    sim.advance(5);
    expect(sim.state.ind.ammeterA).toBeCloseTo(-17, 0);
    power.batteryAmps = 6;
    sim.advance(5);
    expect(sim.state.ind.ammeterA).toBeCloseTo(6, 0);
  });

  it("clock shows UTC seconds since midnight, also while paused", async () => {
    const { sim, inst } = await makeRig(cruise(360));
    const s = sim.state;
    sim.env.utcMs = Date.UTC(2026, 5, 21, 19, 0, 0);
    sim.advance(0.1);
    expect(s.ind.clockUtcSec).toBe(19 * 3600);
    sim.env.utcMs = Date.UTC(2026, 0, 1, 23, 59, 50) + 250;
    sim.setPaused(true);
    inst.frame?.(sim, 0.016);
    expect(s.ind.clockUtcSec).toBeCloseTo(86390.25, 6);
  });
});
