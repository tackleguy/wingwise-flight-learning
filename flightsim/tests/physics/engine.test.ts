/** Engine and fuel system behaviour of the flight model (starter, magnetos, mixture, tanks, fuel burn, power loss). */
import { describe, expect, it } from "vitest";
import { airflowFractionForPowerLoss } from "@/physics/jsbsim";
import { TestPilot, airborne, fly, flyAverage, lab } from "./lab";
import { engineStart, leanToPeakEgt, magnetoCheck, staticRunUp } from "./measure";

async function onRunway() {
  const sim = await lab();
  await sim.spawn({ kind: "runway", airportIdent: "KSFO", runwayEndId: "28R" });
  sim.controls.parkingBrake = true;
  return sim;
}

describe("engine start and stop", () => {
  it("idles from the first moment when put on the runway with the engine running", async () => {
    const sim = await onRunway();
    const s = sim.state;
    expect(s.sys.engineRunning).toBe(true);
    expect(s.rpm).toBeGreaterThan(550);
    expect(s.rpm).toBeLessThan(900);
    sim.advance(10);
    expect(s.rpm).toBeGreaterThan(600);
    expect(s.rpm).toBeLessThan(800);
    expect(s.gsKt).toBeLessThan(0.5);
    expect(s.oilPressPsi).toBeGreaterThan(10);
    sim.dispose();
  });

  it("starts in 1 to 3 s of cranking with mixture rich and magnetos on", async () => {
    const r = await engineStart();
    expect(r.started).toBe(true);
    expect(r.crankSec).toBeGreaterThan(0.8);
    expect(r.crankSec).toBeLessThan(3.2);
    expect(r.idleRpm).toBeGreaterThan(550);
    expect(r.idleRpm).toBeLessThan(1050);
  });

  it("does not start with the mixture at idle cut-off, or with the magnetos off", async () => {
    const noFuel = await engineStart({ mixture: 0 });
    expect(noFuel.started).toBe(false);
    expect(noFuel.crankRpm).toBeGreaterThan(100); // the starter does turn the propeller
    expect(noFuel.idleRpm).toBeLessThan(5); // and it stops again when the starter is released
    const noSpark = await engineStart({ magnetos: 0 });
    expect(noSpark.started).toBe(false);
  });

  it("stops when the mixture is pulled to idle cut-off", async () => {
    const sim = await onRunway();
    const s = sim.state;
    sim.controls.throttle = 0.25;
    sim.advance(6);
    expect(s.sys.engineRunning).toBe(true);
    sim.controls.mixture = 0;
    sim.advance(1);
    expect(s.sys.engineRunning).toBe(false);
    expect(s.fuelFlowGph).toBeLessThan(0.01);
    sim.advance(8);
    expect(s.rpm).toBeLessThan(5);
    sim.dispose();
  });

  it("stops when the magnetos are switched off", async () => {
    const sim = await onRunway();
    sim.controls.throttle = 0.25;
    sim.advance(5);
    sim.controls.ignition = 0;
    sim.advance(8);
    expect(sim.state.sys.engineRunning).toBe(false);
    expect(sim.state.rpm).toBeLessThan(5);
    sim.dispose();
  });

  it("keeps windmilling in a glide after the engine is shut down, and restarts when fuel is restored", async () => {
    const sim = await lab();
    await airborne(sim, 5000, 70);
    const s = sim.state;
    const pilot = new TestPilot({ kcas: 68, rudder: "ball" });
    sim.controls.throttle = 0.3;
    sim.controls.mixture = 0;
    fly(sim, 20, pilot);
    expect(s.sys.engineRunning).toBe(false);
    expect(s.powerHp).toBeLessThan(0);
    expect(s.rpm).toBeGreaterThan(500); // the airflow keeps the propeller turning
    expect(s.thrustLb).toBeLessThan(0); // and it drags
    sim.controls.mixture = 1;
    fly(sim, 4, pilot);
    expect(s.sys.engineRunning).toBe(true);
    expect(s.powerHp).toBeGreaterThan(5);
    sim.dispose();
  });
});

describe("fuel", () => {
  it("stops the engine when the fuel selector is OFF and when the selected tank is empty", async () => {
    const sim = await onRunway();
    const s = sim.state;
    sim.controls.throttle = 0.4;
    sim.advance(5);
    sim.controls.fuelSelector = "off";
    sim.advance(3);
    expect(s.sys.engineRunning).toBe(false);
    sim.dispose();

    const sim2 = await lab({ fuelGalPerTank: 10 });
    sim2.loading.fuelLeftGal = 0; // left tank empty, right tank has fuel
    await sim2.spawn({ kind: "runway", airportIdent: "KSFO", runwayEndId: "28R" });
    sim2.controls.parkingBrake = true;
    sim2.controls.throttle = 0.4;
    sim2.controls.fuelSelector = "both";
    sim2.advance(5);
    expect(sim2.state.sys.engineRunning).toBe(true); // BOTH: runs on the right tank
    sim2.controls.fuelSelector = "left";
    sim2.advance(3);
    expect(sim2.state.sys.engineRunning).toBe(false); // LEFT: nothing there
    sim2.controls.fuelSelector = "right";
    sim2.controls.ignition = 4;
    sim2.advance(4);
    sim2.controls.ignition = 3;
    sim2.advance(2);
    expect(sim2.state.sys.engineRunning).toBe(true);
    sim2.dispose();
  });

  it("burns fuel from the tanks at the indicated rate, and the aircraft gets lighter", async () => {
    const sim = await lab({ weightLb: 2300 });
    await airborne(sim, 4000, 105);
    const s = sim.state;
    const pilot = new TestPilot({ altFt: 4000, rudder: "ball" });
    sim.controls.throttle = 0.9;
    fly(sim, 20, pilot);
    const w0 = s.weightLb;
    const f0 = s.fuelLeftGal + s.fuelRightGal;
    const avg = flyAverage(sim, 360, pilot, () => ({ gph: s.fuelFlowGph }));
    const burned = f0 - (s.fuelLeftGal + s.fuelRightGal);
    expect(burned).toBeGreaterThan(0.5);
    expect(Math.abs(burned - avg.gph * 0.1)).toBeLessThan(0.03); // 6 minutes = 0.1 h
    expect(Math.abs(w0 - s.weightLb - burned * 6)).toBeLessThan(0.2); // 6 lb per gallon
    expect(Math.abs(s.fuelLeftGal - s.fuelRightGal)).toBeLessThan(0.05); // BOTH feeds evenly
    sim.dispose();
  });

  it("feeds only from the selected tank", async () => {
    const sim = await lab();
    await airborne(sim, 4000, 100);
    const s = sim.state;
    const pilot = new TestPilot({ altFt: 4000, rudder: "ball" });
    sim.controls.fuelSelector = "left";
    const l0 = s.fuelLeftGal;
    const r0 = s.fuelRightGal;
    fly(sim, 120, pilot);
    expect(l0 - s.fuelLeftGal).toBeGreaterThan(0.15);
    expect(Math.abs(r0 - s.fuelRightGal)).toBeLessThan(0.001);
    expect(s.sys.engineRunning).toBe(true);
    sim.dispose();
  });
});

describe("mixture and magnetos", () => {
  it("leaning at altitude reduces fuel flow and (from full rich) gives power back", async () => {
    const sim = await lab();
    await airborne(sim, 8000, 100);
    const s = sim.state;
    const c = sim.controls;
    const pilot = new TestPilot({ altFt: 8000, rudder: "ball" });
    c.throttle = 1;
    c.mixture = 1;
    fly(sim, 30, pilot);
    const rich = flyAverage(sim, 5, pilot, () => ({ gph: s.fuelFlowGph, hp: s.powerHp, egt: s.egtF, rpm: s.rpm }));
    const m = leanToPeakEgt(sim, pilot);
    fly(sim, 20, pilot);
    const lean = flyAverage(sim, 5, pilot, () => ({ gph: s.fuelFlowGph, hp: s.powerHp, egt: s.egtF, rpm: s.rpm }));
    expect(m).toBeLessThan(0.8);
    expect(m).toBeGreaterThan(0.4);
    expect(lean.gph).toBeLessThan(rich.gph * 0.75); // a quarter or more less fuel
    expect(lean.hp).toBeGreaterThan(rich.hp); // full rich at 8,000 ft is far too rich
    expect(lean.egt).toBeGreaterThan(rich.egt + 50); // exhaust gas temperature rises to its peak
    // leaning much further makes the engine lose power and finally stop
    c.mixture = m * 0.82;
    fly(sim, 6, pilot);
    expect(s.powerHp).toBeLessThan(lean.hp * 0.9);
    c.mixture = m * 0.6;
    fly(sim, 6, pilot);
    expect(s.sys.engineRunning).toBe(false);
    sim.dispose();
  });

  it("shows a 50 to 150 rpm drop on each single magneto at 1700 rpm", async () => {
    const m = await magnetoCheck();
    expect(Math.abs(m.rpmBoth - 1700)).toBeLessThan(15);
    for (const d of [m.dropLeft, m.dropRight]) {
      expect(d).toBeGreaterThan(50);
      expect(d).toBeLessThan(150);
    }
    expect(Math.abs(m.rpmAfter - m.rpmBoth)).toBeLessThan(15);
  });
});

describe("FdmInputs.powerLoss (carburettor ice, carburettor heat, partial failures)", () => {
  it("removes about the requested share of full-throttle power, smoothly, and all of it at 1", async () => {
    const base = await staticRunUp();
    let last = base;
    for (const loss of [0.1, 0.2, 0.3, 0.5, 0.7]) {
      const r = await staticRunUp({}, 1, loss);
      const lost = 1 - r.powerHp / base.powerHp;
      expect(Math.abs(lost - loss), `powerLoss ${loss} removed ${(lost * 100).toFixed(1)} %`).toBeLessThan(0.06);
      expect(r.rpm).toBeLessThan(last.rpm - 20); // the fixed-pitch propeller slows down: the pilot sees an rpm drop
      expect(r.fuelGph).toBeLessThan(last.fuelGph);
      last = r;
    }
    const dead = await staticRunUp({}, 1, 1);
    expect(dead.powerHp).toBeLessThan(1);
    expect(dead.powerHp).toBeGreaterThan(-5);
    expect(dead.rpm).toBeLessThan(5);
    expect(dead.fuelGph).toBe(0);
  });

  it("a total loss in flight leaves a windmilling, healthy engine that comes back when the loss is cleared", async () => {
    const sim = await lab();
    await airborne(sim, 5000, 90);
    const s = sim.state;
    const pilot = new TestPilot({ kcas: 70, rudder: "ball" });
    let loss = 1;
    sim.use({ name: "test-total-loss", preStep: (q) => void (q.fdmIn.powerLoss = loss) });
    fly(sim, 20, pilot);
    expect(Number.isFinite(sim.fdm!.getProperty("propulsion/engine/power-hp"))).toBe(true);
    expect(s.sys.engineRunning).toBe(false);
    expect(s.powerHp).toBeLessThan(0.5);
    expect(s.rpm).toBeGreaterThan(400); // windmilling
    expect(s.crash).toBeNull();
    loss = 0;
    fly(sim, 5, pilot);
    expect(s.sys.engineRunning).toBe(true);
    sim.dispose();
  });

  it("the air-flow curve is monotonic from 1 to 0", () => {
    let prev = 1.0001;
    for (let l = 0; l <= 1.0001; l += 0.05) {
      const f = airflowFractionForPowerLoss(l);
      expect(f).toBeLessThan(prev);
      expect(f).toBeGreaterThanOrEqual(0);
      prev = f;
    }
    expect(airflowFractionForPowerLoss(0)).toBe(1);
    expect(airflowFractionForPowerLoss(1)).toBe(0);
    expect(airflowFractionForPowerLoss(-3)).toBe(1);
    expect(airflowFractionForPowerLoss(Number.NaN)).toBe(1);
  });

  it("in flight a 20 % loss costs rpm and speed, and clearing it restores them", async () => {
    const sim = await lab();
    await airborne(sim, 3000, 100);
    const s = sim.state;
    const pilot = new TestPilot({ altFt: 3000, rudder: "ball" });
    let loss = 0;
    sim.use({ name: "test-ice", preStep: (q) => void (q.fdmIn.powerLoss = loss) });
    sim.controls.throttle = 0.8;
    fly(sim, 60, pilot);
    const before = { rpm: s.rpm, kcas: s.kcas };
    loss = 0.2;
    fly(sim, 60, pilot);
    expect(s.rpm).toBeLessThan(before.rpm - 60);
    expect(s.kcas).toBeLessThan(before.kcas - 3);
    expect(s.sys.engineRunning).toBe(true);
    loss = 0;
    fly(sim, 90, pilot);
    expect(Math.abs(s.rpm - before.rpm)).toBeLessThan(30);
    expect(Math.abs(s.kcas - before.kcas)).toBeLessThan(2);
    sim.dispose();
  });
});
