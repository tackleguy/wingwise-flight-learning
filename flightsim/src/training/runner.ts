/**
 * The Tests mode engine (`sim.use(createTraining())`, module name "training").
 *
 * `prepareTestFlight` puts the aircraft where a test starts (Cessna 172P, weather, position, time);
 * `begin` then starts watching: it runs the test's events (failures, calls from the tower), updates
 * the objectives every physics step, ends the test (time limit, crash, the test's own end
 * condition, or the pilot) and scores it. Results are remembered in the browser.
 */
import type { Sim, SimModule } from "@/core/sim";
import { destination } from "@/core/math";
import { loadJson, saveJson } from "@/core/storage";
import type { SpawnRequest } from "@/core/types";
import type { Sky } from "@/sky";
import type { WeatherApi } from "@/weather";
import type { FailureKind, Objective, TestContext, TestDef, TestEvent, TestResult } from "./types";
import { PASS_SCORE } from "./types";

export interface ActiveRun {
  def: TestDef;
  ctx: TestContext;
  objectives: Objective[];
  /** Set when the test has ended. */
  result: TestResult | null;
}

export interface StoredResult {
  best: number;
  passed: boolean;
  attempts: number;
  last: TestResult;
}

export interface TrainingModule extends SimModule {
  readonly name: "training";
  /** The test running (or just finished), or null in free flight. */
  readonly active: ActiveRun | null;
  /** Start watching a test; call after `prepareTestFlight` has placed the aircraft. `rand` fixes the attempt's random number (tests). */
  begin(def: TestDef, sim: Sim, rand?: number): void;
  /** The pilot reports a problem. */
  report(kind: FailureKind): void;
  /** End the running test now (the pilot pressed "End test", or similar). */
  end(reason: string): TestResult | null;
  /** Leave the test (back to free flight); failures stay until the next start. */
  clear(): void;
  /** Store a result scored elsewhere (the walk-around inspection). */
  record(result: TestResult): void;
  results(): Record<string, StoredResult>;
  /** Called when a test ends. Returns the function that unsubscribes. */
  onResult(fn: (r: TestResult) => void): () => void;
}

/** Best score, pass and attempts per test (key `skyready.sim.tests`). */
export const RESULTS_KEY = "tests";
/**
 * Every finished attempt that the website has not uploaded to the pilot's account yet (key
 * `skyready.sim.testsOutbox`). The website (src/lib/sim-tests-sync.ts in the site) empties it.
 */
export const OUTBOX_KEY = "testsOutbox";
const OUTBOX_MAX = 200;

/** Score: share of the objectives' points earned; passed when ≥ PASS_SCORE and every critical objective passed. */
export function scoreObjectives(objectives: readonly Objective[]): { score: number; passed: boolean } {
  const total = objectives.reduce((a, o) => a + o.weight, 0);
  const got = objectives.reduce((a, o) => a + (o.status === "pass" ? o.weight : 0), 0);
  const score = total > 0 ? Math.round((100 * got) / total) : objectives.every((o) => o.status === "pass") ? 100 : 0;
  const criticalOk = objectives.every((o) => !o.critical || o.status === "pass");
  return { score: criticalOk ? score : Math.min(score, PASS_SCORE - 1), passed: criticalOk && score >= PASS_SCORE };
}

export function createTraining(): TrainingModule {
  let run: ActiveRun | null = null;
  let events: TestEvent[] = [];
  let fired: boolean[] = [];
  let offs: (() => void)[] = [];
  let simRef: Sim | null = null;
  const listeners = new Set<(r: TestResult) => void>();

  const detach = () => {
    for (const off of offs) off();
    offs = [];
  };

  const store = (r: TestResult) => {
    const all = loadJson<Record<string, StoredResult>>(RESULTS_KEY, {});
    const prev = all[r.id];
    all[r.id] = { best: Math.max(prev?.best ?? 0, r.score), passed: (prev?.passed ?? false) || r.passed, attempts: (prev?.attempts ?? 0) + 1, last: r };
    saveJson(RESULTS_KEY, all);
    const outbox = loadJson<TestResult[]>(OUTBOX_KEY, []);
    saveJson(OUTBOX_KEY, [...(Array.isArray(outbox) ? outbox : []), r].slice(-OUTBOX_MAX));
    for (const fn of [...listeners]) fn(r);
  };

  const api: TrainingModule = {
    name: "training",
    get active() {
      return run;
    },

    begin(def, sim, rand) {
      detach();
      simRef = sim;
      const f = def.flight;
      if (!f) throw new Error(`"${def.title}" is not a flying test.`);
      const apt = sim.data.getAirport(f.setup.airport);
      let runway = null;
      let runwayEnd: 0 | 1 | null = null;
      for (const rw of apt?.runways ?? []) {
        const i = rw.ends.findIndex((e) => e.id === f.setup.runway);
        if (i >= 0) {
          runway = rw;
          runwayEnd = i as 0 | 1;
        }
      }
      const ctx: TestContext = { sim, t: 0, liftoffAt: null, touchdowns: [], stalls: [], stallRecoveries: [], marks: {}, reports: [], runway, runwayEnd, memo: {}, rand: rand ?? Math.random() };
      run = { def, ctx, objectives: f.objectives(), result: null };
      events = f.events?.() ?? [];
      fired = events.map(() => false);
      f.prepare?.(sim, ctx);
      offs.push(
        sim.events.on("liftoff", () => {
          if (run && !run.result && ctx.liftoffAt === null) ctx.liftoffAt = ctx.t;
        }),
        sim.events.on("touchdown", (td) => {
          if (run && !run.result) ctx.touchdowns.push({ t: ctx.t, vsFpm: td.vsFpm, kcas: td.kcas, rollDeg: td.rollDeg, pitchDeg: td.pitchDeg, driftDeg: td.driftDeg, lat: td.lat, lon: td.lon, headingTrue: td.headingTrue });
        }),
        sim.events.on("stall", () => {
          if (run && !run.result) ctx.stalls.push(ctx.t);
        }),
        sim.events.on("stallRecovered", (e) => {
          if (run && !run.result) ctx.stallRecoveries.push({ t: ctx.t, altitudeLostFt: e.altitudeLostFt });
        }),
        sim.events.on("spawn", () => {
          if (run && !run.result) api.end("The aircraft was moved, so the test was stopped.");
        }),
      );
    },

    report(kind) {
      if (!run || run.result) return;
      run.ctx.reports.push({ kind, t: run.ctx.t });
      run.ctx.sim.message("Problem reported.", "info");
    },

    end(reason) {
      if (!run || run.result) return run?.result ?? null;
      const { ctx, objectives, def } = run;
      for (const o of objectives) o.update(ctx, 0);
      for (const o of objectives) o.finish(ctx);
      const { score, passed } = scoreObjectives(objectives);
      run.result = {
        id: def.id,
        title: def.title,
        score,
        passed,
        at: Date.now(),
        durationSec: Math.round(ctx.t),
        endedBecause: reason,
        objectives: objectives.map((o) => ({ label: o.label, status: o.status, detail: o.detail, weight: o.weight, critical: o.critical })),
      };
      detach();
      store(run.result);
      return run.result;
    },

    clear() {
      detach();
      run = null;
    },

    record(result) {
      store(result);
    },

    results() {
      return loadJson<Record<string, StoredResult>>(RESULTS_KEY, {});
    },

    onResult(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },

    postStep(sim, dt) {
      if (!run || run.result || sim !== simRef) return;
      const { ctx, objectives, def } = run;
      ctx.t += dt;
      for (let i = 0; i < events.length; i++) {
        if (fired[i]) continue;
        if (events[i]!.when(ctx)) {
          fired[i] = true;
          events[i]!.run(ctx);
        }
      }
      for (const o of objectives) o.update(ctx, dt);
      if (sim.state.crash) return void api.end(`The aircraft was damaged: ${sim.state.crash.reason}`);
      const why = def.flight?.done?.(ctx);
      if (why) return void api.end(why);
      if (ctx.t >= (def.flight?.timeLimitSec ?? Infinity)) api.end("Time is up.");
    },

    dispose() {
      detach();
      listeners.clear();
      run = null;
    },
  };
  return api;
}

/**
 * Put the aircraft where a flying test starts: the Cessna 172P, the test's weather, position and
 * time of day. Async because the terrain there may need loading.
 */
export async function prepareTestFlight(sim: Sim, weather: WeatherApi, sky: Sky | null, def: TestDef): Promise<void> {
  const f = def.flight;
  if (!f) throw new Error(`"${def.title}" is not a flying test.`);
  const st = f.setup;
  sim.setAircraft("c172p");
  weather.applyPreset(st.weather);
  const apt = sim.data.getAirport(st.airport);
  if (!apt) throw new Error(`The airport ${st.airport} is not in the database.`);
  let req: SpawnRequest;
  if (st.kind === "air") {
    const a = st.air ?? { heightFt: 3000, kias: 100, nmBefore: 5 };
    const end = apt.runways.flatMap((r) => r.ends).find((e) => e.id === st.runway);
    const hdg = end?.headingTrue ?? 0;
    const from = end ?? { lat: apt.lat, lon: apt.lon };
    const p = destination(from.lat, from.lon, hdg + 180, a.nmBefore);
    req = { kind: "air", airportIdent: st.airport, lat: p.lat, lon: p.lon, headingTrue: hdg, altFtMsl: (apt.elevFt ?? 0) + a.heightFt, kias: a.kias, engineRunning: st.engineRunning ?? true };
  } else {
    req = { kind: st.kind, airportIdent: st.airport, runwayEndId: st.runway, finalNm: st.finalNm, engineRunning: st.engineRunning };
  }
  await sim.spawn(req);
  if (sky) sky.setLocalSolarTime(st.hours ?? 12);
}
