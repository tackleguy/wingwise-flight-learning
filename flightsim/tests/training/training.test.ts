/**
 * The Tests mode: scoring, the walk-around grading, the failure effects, and several tests flown
 * end to end by the scripted test pilot (real simulator core, real JSBSim, flat ground).
 */
import { describe, expect, it } from "vitest";
import type { Sim } from "@/core/sim";
import { createInstruments } from "@/instruments";
import { createFailureEffects } from "@/systems/failures";
import { TESTS, createTraining, getTest, gradeInspection, makeInspection, correctDecision, prepareTestFlight, scoreObjectives, type TrainingModule } from "@/training";
import { objective, runwayPosition } from "@/training/objectives";
import { createWeather } from "@/weather";
import { makeSim, worldData } from "../helpers";
import { TestPilot } from "../physics/lab";

const DT = 1 / 30;
const wrap = (d: number) => ((d + 540) % 360) - 180;

async function start(id: string): Promise<{ sim: Sim; training: TrainingModule }> {
  const sim = makeSim(0);
  const weather = sim.use(createWeather());
  sim.use(createInstruments());
  sim.use(createFailureEffects());
  const training = sim.use(createTraining());
  const def = getTest(id)!;
  await prepareTestFlight(sim, weather, null, def);
  training.begin(def, sim, 0.5);
  return { sim, training };
}

/** Fly until the test ends (or `max` seconds), calling `each` before every pilot step. */
function flyTest(sim: Sim, training: TrainingModule, pilot: TestPilot, max: number, each?: (t: number) => void): void {
  for (let t = 0; t < max && !training.active?.result; t += DT) {
    each?.(t);
    pilot.update(sim, DT);
    sim.advance(DT);
  }
}

const statusOf = (training: TrainingModule, id: string) => training.active?.objectives.find((o) => o.id === id)?.status;
const summary = (training: TrainingModule) => training.active?.objectives.map((o) => `${o.id}: ${o.status} — ${o.detail}`).join("\n");

describe("tests catalog", () => {
  it("has tests in every category, each with a briefing and either a flight or the walk-around", () => {
    for (const cat of ["preflight", "failures", "weather", "skills"] as const) expect(TESTS.filter((t) => t.category === cat).length).toBeGreaterThan(0);
    for (const t of TESTS) {
      expect(t.briefing.length, t.id).toBeGreaterThan(0);
      expect(!!t.flight !== !!t.walkaround, t.id).toBe(true);
      if (t.flight) expect(t.flight.objectives().length, t.id).toBeGreaterThan(1);
    }
    expect(new Set(TESTS.map((t) => t.id)).size).toBe(TESTS.length);
  });

  it("every flying test's airport and runway exist with surveyed positions", () => {
    const d = worldData();
    for (const t of TESTS.filter((x) => x.flight)) {
      const st = t.flight!.setup;
      const apt = d.getAirport(st.airport);
      expect(apt, t.id).toBeDefined();
      const rw = apt!.runways.find((r) => r.ends.some((e) => e.id === st.runway));
      expect(rw, `${t.id} ${st.runway}`).toBeDefined();
      expect(rw!.estimated, t.id).toBe(false);
    }
  });
});

describe("scoring", () => {
  it("is the share of points; a failed critical objective fails the test", () => {
    const mk = (w: number, ok: boolean, critical = false) => {
      const o = objective("x", "x", w, { critical });
      o.status = ok ? "pass" : "fail";
      return o;
    };
    expect(scoreObjectives([mk(3, true), mk(1, false)])).toEqual({ score: 75, passed: false });
    expect(scoreObjectives([mk(4, true), mk(1, false)])).toEqual({ score: 80, passed: true });
    const r = scoreObjectives([mk(9, true), mk(1, true), mk(0, false, true)]);
    expect(r.passed).toBe(false);
    expect(r.score).toBeLessThan(80);
  });

  it("ending a test early fails the unfinished parts with a clear reason", async () => {
    const { sim, training } = await start("engine-failure-after-takeoff");
    for (let t = 0; t < 2; t += DT) sim.advance(DT);
    training.report("engine"); // before anything has failed: does not count
    const r = training.end("You ended the test.")!;
    expect(r.passed).toBe(false);
    const detail = (label: string) => r.objectives.find((o) => o.label.startsWith(label))!.detail;
    expect(detail("Lower the nose")).toBe("That part of the test never started.");
    expect(detail("Recognise the problem")).toBe("The test ended before the problem happened.");
    expect(r.objectives.every((o) => o.status !== "pending")).toBe(true);
  });

  it("knows where a point is on a runway", () => {
    const apt = worldData().getAirport("KLVK")!;
    const rw = apt.runways.find((r) => r.ends.some((e) => e.id === "25R"))!;
    const i = rw.ends.findIndex((e) => e.id === "25R") as 0 | 1;
    const end = rw.ends[i];
    const mid = runwayPosition(rw, i, (end.lat + rw.ends[1 - i]!.lat) / 2, (end.lon + rw.ends[1 - i]!.lon) / 2);
    expect(mid.onRunway).toBe(true);
    expect(Math.abs(mid.alongFt - rw.lengthFt / 2)).toBeLessThan(60);
    expect(Math.abs(mid.rightFt)).toBeLessThan(10);
    expect(runwayPosition(rw, i, end.lat + 0.01, end.lon).onRunway).toBe(false);
  });
});

describe("walk-around inspection", () => {
  it("plants 0–3 problems and grades a perfect inspection 100", () => {
    let seed = 7;
    const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    for (let k = 0; k < 40; k++) {
      const items = makeInspection(rand);
      const problems = items.filter((i) => i.problem);
      expect(problems.length).toBeLessThanOrEqual(3);
      const marks = Object.fromEntries(items.map((i) => [i.id, i.problem ? "problem" : "ok"] as const));
      const r = gradeInspection(items, marks, correctDecision(items));
      expect(r.score).toBe(100);
      expect(r.passed).toBe(true);
    }
  });

  it("missing a grounding problem fails, whatever else is right", () => {
    const items = makeInspection(() => 0.99); // three problems
    const grounding = items.find((i) => i.problem?.grounding) ?? items.find((i) => i.problem)!;
    if (!grounding.problem!.grounding) grounding.problem!.grounding = true;
    const marks = Object.fromEntries(items.map((i) => [i.id, i.problem && i !== grounding ? "problem" : "ok"] as const));
    const r = gradeInspection(items, marks, "fix-then-go");
    expect(r.passed).toBe(false);
  });
});

describe("failure effects", () => {
  it("an alternator failure runs the battery down and lights LOW VOLTS", async () => {
    const { sim } = await start("alternator-failure");
    const y = sim.state.sys;
    sim.advance(2);
    expect(y.busVolts).toBe(28);
    y.failures.alternator = true;
    const pct0 = y.batteryPct;
    sim.advance(60);
    expect(y.alternatorOnline).toBe(false);
    expect(y.busVolts).toBeLessThan(24.5);
    expect(y.batteryAmps!).toBeLessThan(-20); // radios, lights and pitot heat on
    expect(y.batteryPct).toBeLessThan(pct0);
    expect(sim.state.sys.engineRunning).toBe(true); // the magnetos keep the engine running
  });

  it("an engine failure stops the engine; a new start clears it", async () => {
    const { sim } = await start("steep-turn");
    sim.state.sys.failures.engine = true;
    sim.advance(5);
    expect(sim.state.sys.engineRunning).toBe(false);
    await sim.spawn({ kind: "runway", airportIdent: "KLVK", runwayEndId: "25R" });
    expect(sim.state.sys.failures.engine).toBe(false);
    sim.advance(2);
    expect(sim.state.sys.engineRunning).toBe(true);
  });
});

describe("tests flown by the test pilot", () => {
  it("steep turn: a well-flown turn passes", async () => {
    const { sim, training } = await start("steep-turn");
    const s = sim.state;
    const alt = s.altMslFt;
    const pilot = new TestPilot({ altFt: alt, bankDeg: 45, throttleForKcas: s.kcas, maxPitchDeg: 15 });
    let turned = 0;
    let last = s.headingTrue;
    flyTest(sim, training, pilot, 200, () => {
      turned += wrap(s.headingTrue - last); // a right turn: the heading increases
      last = s.headingTrue;
      if (turned > 348) pilot.t.bankDeg = 0; // start rolling out a little before the entry heading, as pilots do
    });
    const r = training.active!.result!;
    expect(r, summary(training)).toBeTruthy();
    expect(statusOf(training, "steep-turn"), summary(training)).toBe("pass");
    expect(r.passed, summary(training)).toBe(true);
  }, 120000);

  it("engine failure after take-off: nose down, straight ahead, land — passes", async () => {
    const { sim, training } = await start("engine-failure-after-takeoff");
    const s = sim.state;
    const c = sim.controls;
    const hdg = s.headingTrue;
    c.throttle = 1;
    const pilot = new TestPilot({ pitchDeg: 0, headingDeg: hdg, rudder: "heading" });
    let reported = false;
    flyTest(sim, training, pilot, 400, () => {
      const ctx = training.active!.ctx;
      if (ctx.marks.failure === undefined) {
        if (s.kcas > 55) pilot.t = { kcas: 75, headingDeg: hdg, rudder: "ball" };
      } else {
        if (!reported) {
          training.report("engine");
          reported = true;
          // first reflex: nose down (then hold the glide speed)
          pilot.t = { pitchDeg: -4, headingDeg: hdg, rudder: "ball", pitchRateLimit: 8 };
        }
        if (ctx.t - ctx.marks.failure > 4 && s.aglFt > 25 && pilot.t.pitchDeg !== undefined) pilot.t = { kcas: 65, headingDeg: hdg, rudder: "ball", minPitchDeg: -12 };
        if (s.aglFt < 25 && !s.onGround) pilot.t = { vsFpm: -150, headingDeg: hdg, rudder: "ball", maxPitchDeg: 10 };
        if (s.onGround) {
          pilot.t = { pitchDeg: 0, aileron: 0, rudder: "none" };
          c.brakeLeft = c.brakeRight = 1;
        }
      }
    });
    const r = training.active!.result!;
    expect(training.active!.ctx.marks.failure, "the engine failed").toBeDefined();
    expect(statusOf(training, "glide-speed"), summary(training)).toBe("pass");
    expect(statusOf(training, "no-turn-back"), summary(training)).toBe("pass");
    expect(statusOf(training, "report-engine"), summary(training)).toBe("pass");
    expect(statusOf(training, "no-stall"), summary(training)).toBe("pass");
    expect(r.passed, summary(training)).toBe(true);
  }, 120000);

  it("carburettor ice: rpm drops, carb heat melts it, the test passes", async () => {
    const { sim, training } = await start("carb-ice");
    const s = sim.state;
    const pilot = new TestPilot({ altFt: s.altMslFt, headingDeg: s.headingTrue });
    let rpmBefore = 0;
    let rpmLowest = 9999;
    flyTest(sim, training, pilot, 340, () => {
      const ctx = training.active!.ctx;
      if (ctx.t > 12 && ctx.t < 14) rpmBefore = s.rpm;
      if (ctx.marks.failure !== undefined) {
        rpmLowest = Math.min(rpmLowest, s.rpm);
        if (ctx.t - ctx.marks.failure > 10 && !sim.controls.carbHeat) {
          sim.controls.carbHeat = true;
          training.report("carbIce");
        }
      }
    });
    expect(rpmBefore - rpmLowest, "the ice cost rpm").toBeGreaterThan(80);
    expect(training.active!.ctx.marks.cleared, "the ice melted").toBeDefined();
    expect(training.active!.result!.passed, summary(training)).toBe(true);
  }, 120000);

  it("alternator failure: report it and shed the load — passes", async () => {
    const { sim, training } = await start("alternator-failure");
    const s = sim.state;
    const c = sim.controls;
    const pilot = new TestPilot({ altFt: s.altMslFt, headingDeg: s.headingTrue });
    flyTest(sim, training, pilot, 400, () => {
      const ctx = training.active!.ctx;
      if (ctx.marks.failure !== undefined && ctx.t - ctx.marks.failure > 15 && !ctx.reports.length) {
        training.report("alternator");
        c.lights.landing = c.lights.taxi = c.lights.strobe = false;
        c.pitotHeat = false;
      }
    });
    expect(training.active!.result!.passed, summary(training)).toBe(true);
  }, 120000);

  it("pitot icing: pitot heat clears the blocked tube", async () => {
    const { sim, training } = await start("pitot-icing");
    const s = sim.state;
    const pilot = new TestPilot({ altFt: s.altMslFt, headingDeg: s.headingTrue });
    flyTest(sim, training, pilot, 400, () => {
      const ctx = training.active!.ctx;
      if (ctx.marks.failure !== undefined && ctx.t - ctx.marks.failure > 10 && !sim.controls.pitotHeat) {
        sim.controls.pitotHeat = true;
        training.report("pitot");
      }
    });
    expect(s.sys.failures.pitot).toBe(false);
    expect(training.active!.result!.passed, summary(training)).toBe(true);
  }, 120000);

  it("radio failure: report it and squawk 7600 — passes", async () => {
    const { sim, training } = await start("radio-failure");
    const s = sim.state;
    const pilot = new TestPilot({ altFt: s.altMslFt, headingDeg: s.headingTrue });
    flyTest(sim, training, pilot, 300, () => {
      const ctx = training.active!.ctx;
      if (ctx.marks.failure !== undefined && ctx.t - ctx.marks.failure > 5 && !ctx.reports.length) {
        expect(s.sys.avionicsPowered).toBe(false);
        training.report("radio");
        sim.controls.xpdr.code = "7600";
      }
    });
    expect(training.active!.result!.passed, summary(training)).toBe(true);
  }, 120000);

  it("engine start and before-take-off check: a by-the-book start scores 100", async () => {
    const { sim, training } = await start("start-and-before-takeoff");
    const s = sim.state;
    const c = sim.controls;
    expect(s.sys.engineRunning).toBe(false);
    const pilot = new TestPilot({ elevator: 0, aileron: 0, rudder: "none" });
    const steps: [number, () => void][] = [
      [1, () => ((c.masterBattery = c.masterAlternator = true), (c.lights.beacon = true), (c.fuelSelector = "both"), (c.mixture = 1), (c.throttle = 0.1))],
      [2, () => (c.ignition = 4)],
      [6, () => ((c.ignition = 3), (c.avionicsMaster = true))],
      [8, () => (pilot.t = { elevator: 0, aileron: 0, rudder: "none", throttleForRpm: 1700 })],
      [16, () => (c.ignition = 1)],
      [19, () => (c.ignition = 3)],
      [21, () => (c.ignition = 2)],
      [24, () => (c.ignition = 3)],
      [26, () => (c.carbHeat = true)],
      [29, () => (c.carbHeat = false)],
      [31, () => ((pilot.t = { elevator: 0, aileron: 0, rudder: "none" }), (c.throttle = 0.1))],
      [33, () => ((c.flapIndex = 0), (c.trim = 0), (c.xpdr.mode = "ALT"), (c.altimeterInHg = Math.round(sim.env.qnhInHg * 100) / 100), (c.lights.landing = c.lights.strobe = true))],
      [36, () => ((c.parkingBrake = false), (c.throttle = 1), (pilot.t = { pitchDeg: 0, headingDeg: s.headingTrue, rudder: "heading" }))],
    ];
    let next = 0;
    const hdg = s.headingTrue;
    flyTest(sim, training, pilot, 500, () => {
      const t = training.active!.ctx.t;
      while (next < steps.length && t >= steps[next]![0]) steps[next++]![1]();
      if (next >= steps.length && s.kcas > 55) pilot.t = { kcas: 75, headingDeg: hdg, rudder: "ball" };
    });
    const r = training.active!.result!;
    expect(r.score, summary(training)).toBe(100);
    expect(r.passed).toBe(true);
  }, 120000);

  it("go-around in fog: power, climb, flaps — passes", async () => {
    const { sim, training } = await start("go-around-fog");
    const s = sim.state;
    const c = sim.controls;
    const hdg = s.headingTrue;
    const pilot = new TestPilot({ vsFpm: -450, throttleForKcas: 65, headingDeg: hdg });
    flyTest(sim, training, pilot, 300, () => {
      const ctx = training.active!.ctx;
      const call = ctx.marks.call;
      if (call === undefined) return;
      const since = ctx.t - call;
      if (since < 0.1) {
        c.throttle = 1;
        c.carbHeat = false;
        pilot.t = { kcas: 62, headingDeg: hdg, maxPitchDeg: 12 };
      }
      if (since > 3) c.flapIndex = Math.min(c.flapIndex, 2);
      if (s.aglFt > 400) c.flapIndex = Math.min(c.flapIndex, 1);
      if (s.aglFt > 600) c.flapIndex = 0;
    });
    expect(training.active!.ctx.marks.call).toBeDefined();
    expect(training.active!.result!.passed, summary(training)).toBe(true);
  }, 120000);

  it("hot & high: lean for best power, take off and climb — passes", async () => {
    const { sim, training } = await start("hot-high-takeoff");
    const s = sim.state;
    const c = sim.controls;
    const hdg = s.headingTrue;
    const pilot = new TestPilot({ pitchDeg: 0, headingDeg: hdg, rudder: "heading" });
    c.throttle = 1;
    sim.advance(2);
    c.mixture = 0.65; // best power at this density altitude
    sim.advance(3);
    c.parkingBrake = false;
    flyTest(sim, training, pilot, 400, () => {
      if (s.kcas > 55) pilot.t = { kcas: 72, headingDeg: hdg, rudder: "ball" };
    });
    expect(training.active!.result!.passed, summary(training)).toBe(true);
  }, 120000);

  it("power-off stall: stall and recover — passes", async () => {
    const { sim, training } = await start("power-off-stall");
    const s = sim.state;
    const c = sim.controls;
    const alt = s.altMslFt;
    const hdg = s.headingTrue;
    c.throttle = 0;
    const pilot = new TestPilot({ altFt: alt, headingDeg: hdg, maxPitchDeg: 25 });
    let phase = 0;
    flyTest(sim, training, pilot, 280, () => {
      const ctx = training.active!.ctx;
      if (phase === 0 && ctx.stalls.length) {
        phase = 1;
        c.throttle = 1;
        pilot.t = { pitchDeg: -2, headingDeg: hdg };
      }
      if (phase === 1 && s.kcas > 62) {
        phase = 2;
        pilot.t = { vsFpm: 400, headingDeg: hdg, maxPitchDeg: 10, pitchRateLimit: 2 };
      }
    });
    expect(training.active!.ctx.stalls.length).toBeGreaterThan(0);
    expect(training.active!.result!.passed, summary(training)).toBe(true);
  }, 120000);
});

describe("every flying test starts cleanly", () => {
  it.each(TESTS.filter((t) => t.flight).map((t) => [t.id] as const))("%s", async (id) => {
    const { sim, training } = await start(id);
    const s = sim.state;
    const def = getTest(id)!;
    const st = def.flight!.setup;
    expect(sim.aircraft.id).toBe("c172p");
    expect(training.active!.ctx.runway, "runway found").not.toBeNull();
    if (st.kind === "air") {
      expect(s.onGround).toBe(false);
      // (the tests' ground is flat at sea level; the height is set above the airport's real elevation)
      const elev = sim.data.getAirport(st.airport)!.elevFt ?? 0;
      expect(Math.abs(s.altMslFt - elev - st.air!.heightFt)).toBeLessThan(150);
    } else if (st.kind === "final") expect(s.onGround).toBe(false);
    else expect(s.onGround).toBe(true);
    const pilot = new TestPilot(st.kind === "runway" ? { elevator: 0, aileron: 0, rudder: "none" } : { altFt: s.altMslFt, headingDeg: s.headingTrue });
    flyTest(sim, training, pilot, 20);
    expect(s.crash, s.crash?.reason).toBeNull();
    const r = training.end("Test of the test.");
    expect(r).toBeTruthy();
    expect(r!.objectives.length).toBeGreaterThan(1);
    expect(r!.score).toBeGreaterThanOrEqual(0);
    expect(r!.score).toBeLessThanOrEqual(100);
  }, 60000);
});
