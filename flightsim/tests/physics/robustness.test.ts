/**
 * Robustness and speed: whatever the pilot (or a broken input device) does, the flight model must
 * keep producing finite numbers, and a physics step must stay cheap.
 */
import { describe, expect, it } from "vitest";
import type { Sim } from "@/core/sim";
import { FlightModel } from "@/physics/jsbsim";
import { PILOT_DT, TestPilot, airborne, fly, lab, stateIsFinite } from "./lab";

/** Small seeded random-number generator so the fuzz test is the same every run. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function assertHealthy(sim: Sim, what: string) {
  expect(stateIsFinite(sim), `${what}: state is finite`).toBe(true);
  expect(sim.state.crash?.reason ?? "", what).not.toMatch(/unstable/);
}

describe("robustness", () => {
  it("survives ten simulated minutes of random control inputs without a NaN", async () => {
    const rand = rng(20261115);
    const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)]!;
    const stick = () => (rand() < 0.35 ? pick([-1, 1]) : rand() * 2 - 1); // often slammed to the stop
    let simulated = 0;
    let episodes = 0;
    let crashes = 0;
    let maxG = 0;
    let maxKcas = 0;
    while (simulated < 600) {
      episodes++;
      const sim = await lab({ weightLb: 1700 + rand() * 900, windFromDeg: rand() * 360, windKt: rand() < 0.5 ? rand() * 35 : 0 });
      sim.env.turbulence = rand() < 0.4 ? rand() : 0;
      if (rand() < 0.25) await sim.spawn({ kind: "runway", airportIdent: "KSFO", runwayEndId: "28R" });
      else await airborne(sim, 1500 + rand() * 7000, 55 + rand() * 95, 0, rand() * 360);
      const c = sim.controls;
      const s = sim.state;
      c.parkingBrake = false;
      let next = 0;
      let t = 0;
      const len = 30 + rand() * 60;
      while (t < len && !s.crash) {
        if (t >= next) {
          c.elevator = stick();
          c.aileron = stick();
          c.rudder = stick();
          c.trim = rand() * 2 - 1;
          c.throttle = rand() < 0.3 ? pick([0, 1]) : rand();
          c.mixture = rand() < 0.8 ? 1 : rand();
          c.flapIndex = pick([0, 0, 1, 2, 3]);
          c.brakeLeft = rand() < 0.2 ? rand() : 0;
          c.brakeRight = rand() < 0.2 ? rand() : 0;
          c.ignition = pick([3, 3, 3, 3, 1, 2, 0, 4]);
          c.fuelSelector = pick(["both", "both", "both", "left", "right", "off"] as const);
          next = t + 0.1 + rand() * 2.5;
        }
        sim.advance(PILOT_DT);
        t += PILOT_DT;
        if (!stateIsFinite(sim)) break;
        maxG = Math.max(maxG, Math.abs(s.nz));
        maxKcas = Math.max(maxKcas, s.kcas);
      }
      assertHealthy(sim, `episode ${episodes} at t=${t.toFixed(1)} s`);
      if (s.crash) crashes++;
      simulated += t;
      sim.dispose();
    }
    expect(episodes).toBeGreaterThan(5);
    // (crashing into the ground is allowed — the random pilot is a terrible pilot — numerical failure is not)
    expect(crashes).toBeLessThanOrEqual(episodes);
    expect(maxKcas).toBeLessThan(400);
    expect(Number.isFinite(maxG)).toBe(true);
  });

  it("stays finite with every control slammed to its stops at the never-exceed speed", async () => {
    const sim = await lab();
    await airborne(sim, 8000, 100);
    const c = sim.controls;
    const s = sim.state;
    c.throttle = 1;
    fly(sim, 40, new TestPilot({ pitchDeg: -25, rudder: "ball" }), () => s.kcas > 158); // dive to Vne
    expect(s.kcas).toBeGreaterThan(150);
    for (const [e, a, r] of [
      [1, 0, 0],
      [-1, 0, 0],
      [0, 1, 0],
      [0, -1, 0],
      [0, 0, 1],
      [0, 0, -1],
      [1, 1, 1],
      [-1, -1, -1],
      [1, -1, 1],
    ] as const) {
      c.elevator = e;
      c.aileron = a;
      c.rudder = r;
      sim.advance(1.5);
      assertHealthy(sim, `controls ${e}/${a}/${r} at high speed`);
    }
    sim.dispose();
  });

  it("stays finite from zero airspeed in the air: hanging nose-up, tail slides, and falling flat", async () => {
    // [pitch°, speed along the nose ft/s (negative = moving backwards), speed "downward through the floor" ft/s]
    const cases: readonly (readonly [number, number, number])[] = [
      [88, 0, 0], // hanging on the propeller, no airspeed at all
      [88, -25, 0], // already sliding backwards
      [-88, 0, 0], // pointing straight down, no airspeed
      [0, 0, 0], // level, no airspeed (dropped)
      [0, 0, 60], // falling flat: the air comes from straight below (angle of attack 90°)
      [180, 30, 0], // upside down
    ];
    for (const [theta, u, w] of cases) {
      for (const [elevator, rudder, throttle] of [
        [0, 0, 0],
        [1, 1, 1],
        [-1, -1, 0],
      ] as const) {
        const sim = await lab({ weightLb: 2000 });
        await airborne(sim, 6000, 90);
        const fdm = sim.fdm!;
        const s = sim.state;
        // put the aircraft in the unusual state through JSBSim's initial conditions
        for (const [name, v] of [
          ["ic/h-sl-ft", 6000],
          ["ic/theta-deg", theta === 180 ? 0 : theta],
          ["ic/phi-deg", theta === 180 ? 180 : 0],
          ["ic/u-fps", u],
          ["ic/v-fps", 0],
          ["ic/w-fps", w],
          ["ic/p-rad_sec", 0],
          ["ic/q-rad_sec", 0],
          ["ic/r-rad_sec", 0],
        ] as const)
          fdm.setProperty(name, v);
        fdm.setProperty("simulation/reset", 0);
        if (throttle > 0) fdm.setEngineRunning(true);
        const c = sim.controls;
        c.elevator = elevator;
        c.rudder = rudder;
        c.aileron = -rudder;
        c.throttle = throttle;
        let minKtas = 999;
        let maxAbsAlpha = 0;
        for (let i = 0; i < 240 && !s.crash; i++) {
          sim.advance(PILOT_DT);
          minKtas = Math.min(minKtas, s.ktas);
          maxAbsAlpha = Math.max(maxAbsAlpha, Math.abs(s.alphaDeg));
          if (!stateIsFinite(sim)) break;
        }
        assertHealthy(sim, `start pitch ${theta}, u ${u}, w ${w}, controls ${elevator}/${rudder}/${throttle}`);
        if (u === 0 && w === 0) expect(minKtas).toBeLessThan(3); // it really began with no airspeed
        if (u < 0) expect(maxAbsAlpha).toBeGreaterThan(150); // the air really came from behind
        if (w > 0) expect(maxAbsAlpha).toBeGreaterThan(80);
        sim.dispose();
      }
    }
  });

  it("stays finite in sustained inverted flight and in rolls with full rudder", async () => {
    const sim = await lab();
    await airborne(sim, 6000, 115);
    const c = sim.controls;
    const s = sim.state;
    c.throttle = 1;
    // roll inverted and hold it there with forward yoke
    c.aileron = 1;
    for (let i = 0; i < 300 && Math.abs(s.roll) < 170; i++) sim.advance(PILOT_DT);
    expect(Math.abs(s.roll)).toBeGreaterThan(150);
    c.aileron = 0;
    c.elevator = -0.6;
    let minNz = 9;
    for (let i = 0; i < 240; i++) {
      sim.advance(PILOT_DT);
      minNz = Math.min(minNz, s.nz);
      expect(stateIsFinite(sim)).toBe(true);
    }
    expect(minNz).toBeLessThan(0); // negative g was really flown
    c.aileron = -1;
    c.rudder = 1;
    c.elevator = 1;
    sim.advance(6);
    assertHealthy(sim, "inverted / cross-controlled");
    sim.dispose();
  });

  it("ignores NaN and infinite inputs instead of passing them to the flight model", async () => {
    const sim = await lab();
    await airborne(sim, 4000, 100);
    const s = sim.state;
    const bad = [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 1e30, -1e30];
    let i = 0;
    sim.use({
      name: "test-garbage",
      preStep: (q) => {
        const v = bad[i++ % bad.length]!;
        Object.assign(q.fdmIn, { elevator: v, aileron: v, rudder: v, trim: v, throttle: v, mixture: v, flapNorm: v, brakeLeft: v, brakeRight: v, powerLoss: v, windNorthFps: v, windEastFps: v, windDownFps: v, turbulence: v, isaDeviationC: v, qnhInHg: v });
      },
    });
    sim.advance(5);
    assertHealthy(sim, "garbage inputs");
    expect(s.kcas).toBeGreaterThan(30);
    sim.dispose();
  });

  it("stays finite standing still: engine off, no wind, and in a 70 kt gale", async () => {
    const calm = await lab();
    await calm.spawn({ kind: "ramp", airportIdent: "KSFO" });
    calm.advance(20);
    assertHealthy(calm, "parked, calm");
    expect(calm.state.gsKt).toBeLessThan(0.2);
    expect(calm.state.kcas).toBeLessThan(1);
    calm.dispose();
    const gale = await lab({ windFromDeg: 28, windKt: 70 });
    await gale.spawn({ kind: "ramp", airportIdent: "KSFO" });
    gale.advance(20);
    expect(stateIsFinite(gale)).toBe(true);
    gale.dispose();
  });
});

describe("speed", () => {
  it("a physics step takes well under a millisecond in Node", async () => {
    const sim = await lab();
    await airborne(sim, 4000, 100);
    const fdm = sim.fdm!;
    // warm up (WebAssembly tiers up, tables are touched once)
    for (let i = 0; i < 2000; i++) {
      fdm.setInputs(sim.fdmIn);
      fdm.step(1);
      fdm.read();
    }
    const n = 24000; // 200 simulated seconds
    const t0 = performance.now();
    for (let i = 0; i < n; i++) {
      fdm.setInputs(sim.fdmIn);
      fdm.step(1);
      fdm.read();
    }
    const usPerStep = ((performance.now() - t0) * 1000) / n;
    const t1 = performance.now();
    sim.advance(100);
    const usPerSimStep = ((performance.now() - t1) * 1000) / (100 / FlightModel.DT);
    console.log(`[physics] flight model: ${usPerStep.toFixed(1)} µs per step (set inputs + step + read); whole simulator core: ${usPerSimStep.toFixed(1)} µs per step; a frame at 60 fps needs 2 steps`);
    // 120 steps per second: even 400 µs per step would be under 5 % of real time
    expect(usPerStep).toBeLessThan(400);
    expect(usPerSimStep).toBeLessThan(600);
    sim.dispose();
  });
});
