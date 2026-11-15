/**
 * Building blocks for test objectives. Each returns an `Objective` that watches the flight and
 * ends as "pass" or "fail" with a plain-language explanation.
 */
import type { Sim } from "@/core/sim";
import type { ControlState, SimState } from "@/core/types";
import type { Runway } from "@/data/world-data";
import { D2R, FT_PER_NM } from "@/core/math";
import type { FailureKind, Objective, ObjectiveStatus, TestContext } from "./types";
import { FAILURE_LABELS } from "./types";

interface Impl {
  critical?: boolean;
  /** Called every physics step while the objective is still pending. */
  update?(o: Mutable, ctx: TestContext, dt: number): void;
  /** Called once when the test ends while the objective is still pending; may leave it pending → it fails. */
  finish?(o: Mutable, ctx: TestContext): void;
  /** Text shown while pending. */
  pending?: string;
}
interface Mutable {
  status: ObjectiveStatus;
  detail: string;
  pass(detail: string): void;
  fail(detail: string): void;
}

export function objective(id: string, label: string, weight: number, impl: Impl): Objective {
  const o: Objective & Mutable = {
    id,
    label,
    weight,
    critical: impl.critical ?? false,
    status: "pending",
    detail: impl.pending ?? "",
    pass(detail: string) {
      if (o.status !== "pending") return;
      o.status = "pass";
      o.detail = detail;
    },
    fail(detail: string) {
      if (o.status !== "pending") return;
      o.status = "fail";
      o.detail = detail;
    },
    update(ctx, dt) {
      if (o.status === "pending") impl.update?.(o, ctx, dt);
    },
    finish(ctx) {
      if (o.status === "pending") impl.finish?.(o, ctx);
      if (o.status === "pending") o.fail(o.detail || "Not completed before the test ended.");
    },
  };
  return o;
}

// ---------------------------------------------------------------- helpers

/** Indicated airspeed (what the pilot sees), kt. */
export const ias = (sim: Sim) => (Number.isFinite(sim.state.ind.ias) && sim.state.ind.ias > 0 ? sim.state.ind.ias : sim.state.kcas);
const r0 = (n: number) => Math.round(n);
const wrap = (d: number) => ((d + 540) % 360) - 180;
/** Time since a named moment, or null before it happened. */
export const since = (ctx: TestContext, mark: string) => (ctx.marks[mark] === undefined ? null : ctx.t - ctx.marks[mark]!);
/** Touchdowns after a named moment (all of them when `mark` is undefined). */
export const touchdownsAfter = (ctx: TestContext, mark?: string) => (mark === undefined ? ctx.touchdowns : ctx.marks[mark] === undefined ? [] : ctx.touchdowns.filter((t) => t.t >= ctx.marks[mark]!));

/** Where a point is relative to a runway landing from end `endIndex`: feet along from that end and to the right of the centreline. */
export function runwayPosition(rw: Runway, endIndex: 0 | 1, lat: number, lon: number): { alongFt: number; rightFt: number; onRunway: boolean } {
  const end = rw.ends[endIndex];
  const ftPerDegLat = FT_PER_NM * 60;
  const dn = (lat - end.lat) * ftPerDegLat;
  const de = (lon - end.lon) * ftPerDegLat * Math.cos(end.lat * D2R);
  const h = end.headingTrue * D2R;
  const alongFt = dn * Math.cos(h) + de * Math.sin(h);
  const rightFt = -dn * Math.sin(h) + de * Math.cos(h);
  const onRunway = alongFt >= -20 && alongFt <= rw.lengthFt + 20 && Math.abs(rightFt) <= rw.widthFt / 2 + 3;
  return { alongFt, rightFt, onRunway };
}

/** On any runway of the given list (either direction)? */
export function onAnyRunway(runways: readonly Runway[], lat: number, lon: number): boolean {
  return runways.some((rw) => runwayPosition(rw, 0, lat, lon).onRunway);
}

// ---------------------------------------------------------------- general

export function noCrash(): Objective {
  return objective("no-crash", "Bring the aircraft through undamaged", 0, {
    critical: true,
    pending: "So far so good.",
    update(o, ctx) {
      const c = ctx.sim.state.crash;
      if (c) o.fail(c.reason);
    },
    finish(o, ctx) {
      if (!ctx.sim.state.crash) o.pass("No damage.");
    },
  });
}

export function noStall(weight = 1, afterMark?: string): Objective {
  return objective("no-stall", "Do not stall", weight, {
    pending: "No stall so far.",
    update(o, ctx) {
      const from = afterMark === undefined ? 0 : ctx.marks[afterMark];
      if (from !== undefined && ctx.stalls.some((t) => t >= from)) o.fail("The wing stalled. Watch the airspeed and lower the nose before it gets that slow.");
    },
    finish(o) {
      o.pass("No stall.");
    },
  });
}

/** A condition that must become true within `withinSec` of a named moment (or of the start). */
export function within(id: string, label: string, weight: number, mark: string | null, withinSec: number, check: (sim: Sim, ctx: TestContext) => boolean, okText: (sec: number) => string, lateText: string): Objective {
  return objective(id, label, weight, {
    pending: "Waiting…",
    update(o, ctx) {
      const s = mark === null ? ctx.t : since(ctx, mark);
      if (s === null) return;
      if (check(ctx.sim, ctx)) o.pass(okText(s));
      else if (s > withinSec) o.fail(lateText);
    },
    finish(o, ctx) {
      if (mark !== null && ctx.marks[mark] === undefined) o.fail("That part of the test never started.");
      else o.fail("Not done before the test ended.");
    },
  });
}

/** Checked once, at the moment a named moment happens. */
export function atMark(id: string, label: string, weight: number, mark: string, check: (sim: Sim, ctx: TestContext) => boolean, okText: string, badText: string, missingText = "That moment never came."): Objective {
  return objective(id, label, weight, {
    pending: "Checked later.",
    update(o, ctx) {
      if (ctx.marks[mark] === undefined) return;
      if (check(ctx.sim, ctx)) o.pass(okText);
      else o.fail(badText);
    },
    finish(o) {
      o.fail(missingText);
    },
  });
}

/**
 * Keep a value inside a range for a share of the time, while `active` is true (default: always
 * after `afterMark`). `grace` seconds after the mark are not counted.
 */
export function band(opts: {
  id: string;
  label: string;
  weight: number;
  afterMark?: string;
  graceSec?: number;
  active?: (ctx: TestContext) => boolean;
  value: (sim: Sim, ctx: TestContext) => number;
  lo: number | ((ctx: TestContext) => number);
  hi: number | ((ctx: TestContext) => number);
  share: number;
  unit: string;
  minSeconds?: number;
}): Objective {
  let inside = 0;
  let total = 0;
  const text = () => `In range ${r0((inside / Math.max(total, 1e-6)) * 100)} % of the time (needed ${r0(opts.share * 100)} %).`;
  return objective(opts.id, opts.label, opts.weight, {
    pending: "Not started yet.",
    update(o, ctx, dt) {
      if (opts.afterMark !== undefined) {
        const s = since(ctx, opts.afterMark);
        if (s === null || s < (opts.graceSec ?? 0)) return;
      }
      if (opts.active && !opts.active(ctx)) return;
      const lo = typeof opts.lo === "function" ? opts.lo(ctx) : opts.lo;
      const hi = typeof opts.hi === "function" ? opts.hi(ctx) : opts.hi;
      const v = opts.value(ctx.sim, ctx);
      total += dt;
      if (v >= lo && v <= hi) inside += dt;
      o.detail = text();
    },
    finish(o) {
      if (total < (opts.minSeconds ?? 5)) return o.fail("There was not enough flying to judge this.");
      if (inside / total >= opts.share) o.pass(text());
      else o.fail(text());
    },
  });
}

/** A value must never go past a limit while active. */
export function never(id: string, label: string, weight: number, afterMark: string | null, bad: (sim: Sim, ctx: TestContext) => string | null, okText: string, active?: (ctx: TestContext) => boolean): Objective {
  return objective(id, label, weight, {
    pending: "So far so good.",
    update(o, ctx) {
      if (afterMark !== null && ctx.marks[afterMark] === undefined) return;
      if (active && !active(ctx)) return;
      const why = bad(ctx.sim, ctx);
      if (why) o.fail(why);
    },
    finish(o, ctx) {
      if (afterMark !== null && ctx.marks[afterMark] === undefined) return o.fail("That part of the test never started.");
      o.pass(okText);
    },
  });
}

/** Report the right failure with the "Report a problem" button within `withinSec` of it happening. */
export function reportFailure(kind: FailureKind, withinSec: number, weight = 1, mark = "failure"): Objective {
  const want = FAILURE_LABELS[kind];
  return objective(`report-${kind}`, `Recognise the problem and report it ("${want}")`, weight, {
    pending: "Not reported yet.",
    update(o, ctx) {
      const at = ctx.marks[mark];
      if (at === undefined) return;
      const right = ctx.reports.find((r) => r.kind === kind && r.t >= at);
      if (right) {
        const sec = r0(right.t - at);
        if (sec <= withinSec) o.pass(`Reported correctly ${sec} s after it happened.`);
        else o.fail(`Reported correctly, but only after ${sec} s (needed within ${withinSec} s).`);
      } else if (ctx.t - at > withinSec) {
        const wrong = ctx.reports.filter((r) => r.t >= at && r.kind !== kind);
        o.fail(wrong.length ? `You reported "${FAILURE_LABELS[wrong[0]!.kind]}" — the problem was: ${want}.` : `Not reported within ${withinSec} s. The problem was: ${want}.`);
      }
    },
    finish(o, ctx) {
      const at = ctx.marks[mark];
      if (at === undefined) return o.fail("The test ended before the problem happened.");
      const wrong = ctx.reports.filter((r) => r.t >= at && r.kind !== kind);
      o.fail(wrong.length ? `You reported "${FAILURE_LABELS[wrong[0]!.kind]}" — the problem was: ${want}.` : `Not reported before the test ended. The problem was: ${want}.`);
    },
  });
}

// ---------------------------------------------------------------- take-off and landing

export function climbTo(aglFt: number, weight = 2): Objective {
  return objective("climb", `Take off and climb to ${aglFt} ft above the ground`, weight, {
    pending: "Not there yet.",
    update(o, ctx) {
      const s = ctx.sim.state;
      if (ctx.liftoffAt !== null && !s.onGround && s.aglFt >= aglFt) o.pass(`Reached ${aglFt} ft above the ground ${r0(ctx.t - ctx.liftoffAt)} s after lift-off.`);
    },
    finish(o) {
      o.fail(`Did not reach ${aglFt} ft above the ground.`);
    },
  });
}

/** Judged at the first touchdown after `afterMark` (any touchdown when undefined). */
export function atTouchdown(id: string, label: string, weight: number, judge: (td: TestContext["touchdowns"][number], ctx: TestContext) => { ok: boolean; text: string }, afterMark?: string, notLanded = "You did not land."): Objective {
  return objective(id, label, weight, {
    pending: "Judged at touchdown.",
    update(o, ctx) {
      const td = touchdownsAfter(ctx, afterMark)[0];
      if (!td) return;
      const r = judge(td, ctx);
      if (r.ok) o.pass(r.text);
      else o.fail(r.text);
    },
    finish(o) {
      o.fail(notLanded);
    },
  });
}

export const gentleTouchdown = (maxFpm = 600, weight = 1, afterMark?: string) =>
  atTouchdown(
    "touchdown-gentle",
    `Touch down gently (slower than ${maxFpm} ft/min down)`,
    weight,
    (td) => ({ ok: td.vsFpm > -maxFpm, text: `Touched down at ${r0(-td.vsFpm)} ft/min.${td.vsFpm <= -maxFpm ? " Too firm: hold the nose off longer and let it settle." : ""}` }),
    afterMark,
  );

export const wingsLevelTouchdown = (maxDeg = 10, weight = 1, afterMark?: string) =>
  atTouchdown("touchdown-wings", `Wings nearly level at touchdown (within ${maxDeg}°)`, weight, (td) => ({ ok: Math.abs(td.rollDeg) <= maxDeg, text: `Bank at touchdown ${r0(Math.abs(td.rollDeg))}°.` }), afterMark);

export const noDriftTouchdown = (maxDeg = 5, weight = 1, afterMark?: string) =>
  atTouchdown(
    "touchdown-drift",
    `Touch down without drifting sideways (within ${maxDeg}°)`,
    weight,
    (td) => ({ ok: Math.abs(td.driftDeg) <= maxDeg, text: `The aircraft was moving ${r0(Math.abs(td.driftDeg))}° sideways to where its nose pointed.${Math.abs(td.driftDeg) > maxDeg ? " Lower the wing into the wind and hold the nose straight with the rudder." : ""}` }),
    afterMark,
  );

/** Land on the test's runway, within `maxOffFt` of the centreline. */
export function landOnRunway(maxOffFt = 30, weight = 2, afterMark?: string): Objective {
  return atTouchdown(
    "touchdown-runway",
    `Land on the runway, near the centre line (within ${maxOffFt} ft)`,
    weight,
    (td, ctx) => {
      if (!ctx.runway || ctx.runwayEnd === null) return { ok: true, text: "No runway to judge against." };
      const p = runwayPosition(ctx.runway, ctx.runwayEnd, td.lat, td.lon);
      if (!p.onRunway) return { ok: false, text: p.alongFt < 0 ? "You touched down before the runway." : p.alongFt > ctx.runway.lengthFt ? "You touched down past the end of the runway." : "You touched down beside the runway." };
      const off = Math.abs(p.rightFt);
      return { ok: off <= maxOffFt, text: `Touched down ${r0(p.alongFt)} ft along the runway, ${r0(off)} ft ${p.rightFt >= 0 ? "right" : "left"} of the centre line.` };
    },
    afterMark,
  );
}

/** After landing, stop on the runway. */
export function stopOnRunway(weight = 1): Objective {
  return objective("stop", "Stop on the runway", weight, {
    pending: "After touchdown.",
    update(o, ctx) {
      const s = ctx.sim.state;
      if (!ctx.touchdowns.length || !s.onGround) return;
      if (s.gsKt < 3) {
        if (!ctx.runway || ctx.runwayEnd === null) return o.pass("Stopped.");
        const p = runwayPosition(ctx.runway, ctx.runwayEnd, s.lat, s.lon);
        if (p.onRunway) o.pass(`Stopped ${r0(ctx.runway.lengthFt - p.alongFt)} ft before the end of the runway.`);
        else o.fail("You stopped off the runway.");
      }
    },
    finish(o) {
      o.fail("You did not come to a stop on the runway.");
    },
  });
}

// ---------------------------------------------------------------- cockpit checks

export type ControlCheck = (c: ControlState, s: SimState, sim: Sim) => boolean;

// ---------------------------------------------------------------- manoeuvres

/**
 * Steep turn: a full 360° turn at 45° of bank (40–50° allowed), holding the entry altitude
 * (±100 ft) and speed (±10 kt), rolling out within 10° of the entry heading.
 */
export function steepTurn(weight = 4): Objective {
  let entered = false;
  let dir = 1;
  let entryHdg = 0;
  let entryAlt = 0;
  let entryIas = 0;
  let lastHdg = 0;
  let turned = 0;
  let inBank = 0;
  let total = 0;
  let maxAltDev = 0;
  let maxIasDev = 0;
  return objective("steep-turn", "Fly a 360° steep turn at 45° of bank, holding altitude (±100 ft) and speed (±10 kt)", weight, {
    pending: "Roll into the turn when ready.",
    update(o, ctx, dt) {
      const s = ctx.sim.state;
      const bank = Math.abs(s.roll);
      if (!entered) {
        if (bank >= 30) {
          entered = true;
          dir = s.roll >= 0 ? 1 : -1; // right bank: the heading increases
          entryHdg = lastHdg = s.headingTrue;
          entryAlt = s.altMslFt;
          entryIas = ias(ctx.sim);
        }
        return;
      }
      // turning in the direction of the turn only (small wobbles cancel out)
      turned += dir * wrap(s.headingTrue - lastHdg);
      lastHdg = s.headingTrue;
      total += dt;
      if (bank >= 40 && bank <= 50) inBank += dt;
      maxAltDev = Math.max(maxAltDev, Math.abs(s.altMslFt - entryAlt));
      maxIasDev = Math.max(maxIasDev, Math.abs(ias(ctx.sim) - entryIas));
      o.detail = `Turned ${r0(turned)}° so far; altitude ${r0(s.altMslFt - entryAlt)} ft from entry.`;
      // judged when the wings come level again
      if (bank < 5 && turned > 90) {
        ctx.memo.turnDone = 1;
        if (turned < 300) return o.fail(`You rolled out after only ${r0(turned)}° — a steep turn is a full circle.`);
        const rollOut = Math.abs(wrap(s.headingTrue - entryHdg));
        const problems: string[] = [];
        if (inBank / Math.max(total, 1e-6) < 0.6) problems.push(`the bank was between 40° and 50° only ${r0((inBank / total) * 100)} % of the turn`);
        if (maxAltDev > 100) problems.push(`the altitude wandered by up to ${r0(maxAltDev)} ft`);
        if (maxIasDev > 10) problems.push(`the speed changed by up to ${r0(maxIasDev)} kt`);
        if (rollOut > 10) problems.push(`you rolled out ${r0(rollOut)}° ${turned > 360 ? "past" : "short of"} the entry heading`);
        if (problems.length) o.fail(`Turn completed, but ${problems.join(", ")}.`);
        else o.pass(`Well flown: altitude within ${r0(maxAltDev)} ft, speed within ${r0(maxIasDev)} kt, rolled out ${r0(rollOut)}° from the entry heading.`);
      }
    },
    finish(o) {
      o.fail(entered ? "The turn was not completed (roll out after a full circle)." : "You did not roll into a steep turn (at least 30° of bank).");
    },
  });
}

/** Power-off stall: let it stall, then recover losing less than `maxLossFt`, without a second stall. */
export function stallRecovery(maxLossFt = 300, weight = 3): Objective {
  return objective("stall-recovery", `Recover from the stall losing less than ${maxLossFt} ft`, weight, {
    pending: "Waiting for the stall.",
    update(o, ctx) {
      const rec = ctx.stallRecoveries[0];
      if (!rec) {
        if (ctx.stalls.length) o.detail = "Stalled — recover: nose down, full power, level the wings.";
        return;
      }
      if (ctx.stalls.length > 1 && ctx.stalls[1]! < rec.t + 15) return o.fail("A second stall followed the recovery — ease the nose up more gently after the first one.");
      if (ctx.t - rec.t < 15) return; // watch for a secondary stall first
      if (rec.altitudeLostFt <= maxLossFt) o.pass(`Recovered, losing ${r0(rec.altitudeLostFt)} ft.`);
      else o.fail(`Recovered, but lost ${r0(rec.altitudeLostFt)} ft. Lower the nose promptly and add full power at the first sign of the stall.`);
    },
    finish(o, ctx) {
      o.fail(ctx.stalls.length ? "The aircraft never recovered from the stall." : "The aircraft did not stall.");
    },
  });
}

export { wrap as wrapDeg, r0 as round0 };
