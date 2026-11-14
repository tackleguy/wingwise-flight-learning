/**
 * Measurable flight objectives. Each objective is a small state machine fed with every
 * simulator snapshot and event, producing a live status and a final 0–1 score.
 */
import { distanceNm, bearingDeg, norm180, FT_PER_NM, clamp } from "@/lib/geo";
import type { Airport, RunwayEnd } from "@/lib/data/types";
import type { SimEvent, SimSnapshot } from "./types";

export interface ObjectiveStatus {
  /** 0..1 */
  score: number;
  met: boolean;
  /** true when the objective can no longer change */
  done: boolean;
  detail: string;
}

export interface Objective {
  id: string;
  text: string;
  /** Relative weight in the scenario score */
  weight: number;
  update(s: SimSnapshot, dt: number): void;
  event(e: SimEvent, s: SimSnapshot): void;
  status(): ObjectiveStatus;
}

type Pred = (s: SimSnapshot) => boolean;

/**
 * Hold a parameter within tolerance while `active` is true. Score = fraction of active time
 * within tolerance (requires at least `minSec` of active time to count as met).
 */
export function holdWithin(o: {
  id: string;
  text: string;
  weight?: number;
  active: Pred;
  deviation: (s: SimSnapshot) => number;
  tol: number;
  minSec: number;
  unit: string;
  passFraction?: number;
}): Objective {
  let activeT = 0;
  let goodT = 0;
  let worst = 0;
  return {
    id: o.id,
    text: o.text,
    weight: o.weight ?? 1,
    update(s, dt) {
      if (s.aircraft.crashed || !o.active(s)) return;
      activeT += dt;
      const d = Math.abs(o.deviation(s));
      worst = Math.max(worst, d);
      if (d <= o.tol) goodT += dt;
    },
    event() {},
    status() {
      const frac = activeT > 0 ? goodT / activeT : 0;
      const enough = activeT >= o.minSec;
      const pass = o.passFraction ?? 0.8;
      return {
        score: enough ? clamp(frac / pass, 0, 1) : (activeT / o.minSec) * frac * 0.6,
        met: enough && frac >= pass,
        done: false,
        detail: activeT < 1 ? "Not yet attempted" : `${Math.round(frac * 100)}% within ±${o.tol} ${o.unit} over ${Math.round(activeT)} s (worst ${Math.round(worst)} ${o.unit})${enough ? "" : ` — need ${o.minSec} s`}`,
      };
    },
  };
}

/** Achieve a condition at least once (optionally sustained for `sustainSec`). */
export function reach(o: { id: string; text: string; weight?: number; cond: Pred; sustainSec?: number; detail?: string }): Objective {
  let t = 0;
  let met = false;
  return {
    id: o.id,
    text: o.text,
    weight: o.weight ?? 1,
    update(s, dt) {
      if (met || s.aircraft.crashed) return;
      if (o.cond(s)) {
        t += dt;
        if (t >= (o.sustainSec ?? 0)) met = true;
      } else t = 0;
    },
    event() {},
    status() {
      return { score: met ? 1 : 0, met, done: met, detail: met ? "Achieved" : o.detail ?? "Not yet achieved" };
    },
  };
}

/** Never let a bad condition happen. */
export function avoid(o: { id: string; text: string; weight?: number; bad: Pred; describe: (s: SimSnapshot) => string; graceSec?: number }): Objective {
  let violated = "";
  let t = 0;
  let elapsed = 0;
  return {
    id: o.id,
    text: o.text,
    weight: o.weight ?? 1,
    update(s, dt) {
      elapsed += dt;
      if (violated) return;
      if (elapsed < (o.graceSec ?? 0)) return;
      if (o.bad(s)) {
        t += dt;
        if (t > 0.6) violated = o.describe(s);
      } else t = 0;
    },
    event(e) {
      if (!violated && e.type === "crash") violated = e.message;
    },
    status() {
      return { score: violated ? 0 : 1, met: !violated, done: !!violated, detail: violated || "No exceedance" };
    },
  };
}

export interface LandingTarget {
  airport: Airport;
  /** Restrict to a specific runway end id; otherwise any runway at the airport. */
  endId?: string;
}

function runwayFrame(lat: number, lon: number, end: RunwayEnd) {
  const d = distanceNm(end.threshold.lat, end.threshold.lon, lat, lon) * FT_PER_NM;
  const b = bearingDeg(end.threshold.lat, end.threshold.lon, lat, lon);
  const rel = (norm180(b - end.trueHeading) * Math.PI) / 180;
  return { along: d * Math.cos(rel), lateral: d * Math.sin(rel) };
}

/** Find the runway the aircraft is on (or over), with along-track & lateral position (ft). */
export function locateOnRunway(airport: Airport, lat: number, lon: number, headingTrue: number) {
  let best: { end: RunwayEnd; along: number; lateral: number; lengthFt: number; widthFt: number } | null = null;
  for (const r of airport.runways) {
    for (const end of r.ends) {
      if (Math.abs(norm180(headingTrue - end.trueHeading)) > 60) continue;
      const f = runwayFrame(lat, lon, end);
      if (f.along < -500 || f.along > r.lengthFt + 500) continue;
      if (!best || Math.abs(f.lateral) < Math.abs(best.lateral)) best = { end, along: f.along, lateral: f.lateral, lengthFt: r.lengthFt, widthFt: r.widthFt };
    }
  }
  return best;
}

/**
 * Landing quality: touchdown on the runway (within width), in the first third, with a
 * gentle sink rate and wings level, then a full stop on the runway.
 */
export function landing(o: { id: string; text: string; weight?: number; target: LandingTarget; requireStop?: boolean }): Objective {
  let touchdown: null | { vs: number; along: number; lateral: number; bank: number; onRunway: boolean; endId: string; length: number; width: number; slip: number } = null;
  let stopped = false;
  let crashed = "";
  return {
    id: o.id,
    text: o.text,
    weight: o.weight ?? 2,
    update(s) {
      if (touchdown && !stopped && s.aircraft.onGround && s.aircraft.gsKt < 3) stopped = true;
    },
    event(e, s) {
      if (e.type === "crash") crashed = e.message;
      if (e.type !== "touchdown" || touchdown) return;
      const ap = o.target.airport;
      const loc = locateOnRunway(ap, s.aircraft.lat, s.aircraft.lon, s.aircraft.heading);
      const wantEnd = o.target.endId;
      const onRunway = !!loc && Math.abs(loc.lateral) <= loc.widthFt / 2 + 5 && loc.along >= -50 && loc.along <= loc.lengthFt && (!wantEnd || loc.end.id === wantEnd);
      touchdown = {
        vs: Number(e.data?.["vs"] ?? 0),
        along: loc?.along ?? 0,
        lateral: loc?.lateral ?? 999,
        bank: Number(e.data?.["bank"] ?? 0),
        onRunway,
        endId: loc?.end.id ?? "—",
        length: loc?.lengthFt ?? 0,
        width: loc?.widthFt ?? 0,
        slip: Number(e.data?.["slip"] ?? 0),
      };
    },
    status() {
      if (crashed) return { score: 0, met: false, done: true, detail: crashed };
      if (!touchdown) return { score: 0, met: false, done: false, detail: "Awaiting touchdown" };
      const t = touchdown;
      if (!t.onRunway) return { score: 0.15, met: false, done: true, detail: `Touched down off the ${o.target.endId ? `assigned runway ${o.target.endId}` : "runway"} (lateral ${Math.round(t.lateral)} ft)` };
      let score = 1;
      const notes: string[] = [`RWY ${t.endId}`, `${Math.round(t.vs)} fpm`];
      if (t.vs < -600) score -= 0.4;
      else if (t.vs < -400) score -= 0.2;
      const zone = t.length > 0 ? t.along / t.length : 0;
      notes.push(`${Math.round(t.along)} ft past threshold`);
      if (zone > 0.33) score -= 0.25;
      notes.push(`${Math.abs(Math.round(t.lateral))} ft ${t.lateral >= 0 ? "right" : "left"} of centerline`);
      if (Math.abs(t.lateral) > t.width / 4) score -= 0.15;
      if (Math.abs(t.bank) > 5) score -= 0.1;
      if (o.requireStop !== false && !stopped) {
        return { score: Math.max(0, score - 0.15), met: false, done: false, detail: `${notes.join(" · ")} — bring the aircraft to a full stop` };
      }
      return { score: Math.max(0, score), met: score >= 0.7, done: true, detail: notes.join(" · ") };
    },
  };
}

/** Accumulate heading change while a condition holds (e.g. steep turn ≥ 40° bank). */
export function turnThrough(o: { id: string; text: string; weight?: number; degrees: number; while: Pred; altTolFt?: number; label: string }): Objective {
  let accum = 0;
  let lastHdg: number | null = null;
  let entryAlt: number | null = null;
  let altDevMax = 0;
  let best = 0;
  return {
    id: o.id,
    text: o.text,
    weight: o.weight ?? 1,
    update(s) {
      if (s.aircraft.crashed) return;
      if (o.while(s)) {
        if (entryAlt === null) entryAlt = s.indicated.altFt;
        if (lastHdg !== null) accum += Math.abs(norm180(s.aircraft.heading - lastHdg));
        lastHdg = s.aircraft.heading;
        altDevMax = Math.max(altDevMax, Math.abs(s.indicated.altFt - entryAlt));
        if (o.altTolFt !== undefined && altDevMax > o.altTolFt * 2.5) {
          // Busted badly — restart the attempt.
          best = Math.max(best, accum >= o.degrees ? 0.4 : 0);
          accum = 0;
          entryAlt = s.indicated.altFt;
          altDevMax = 0;
        }
      } else {
        if (accum >= o.degrees) {
          const altOk = o.altTolFt === undefined || altDevMax <= o.altTolFt;
          best = Math.max(best, altOk ? 1 : 0.6);
        }
        accum = 0;
        lastHdg = null;
        entryAlt = null;
        altDevMax = 0;
      }
    },
    event() {},
    status() {
      const inProgress = accum > 0 ? ` (in progress: ${Math.round(accum)}°${o.altTolFt !== undefined ? `, alt dev ${Math.round(altDevMax)} ft` : ""})` : "";
      if (best >= 1) return { score: 1, met: true, done: true, detail: `Completed ${o.degrees}° ${o.label}` };
      if (accum >= o.degrees) {
        const altOk = o.altTolFt === undefined || altDevMax <= o.altTolFt;
        return { score: altOk ? 1 : 0.6, met: altOk, done: false, detail: `${o.degrees}° complete${altOk ? "" : ` but altitude deviated ${Math.round(altDevMax)} ft`} — roll out` };
      }
      return { score: best, met: false, done: false, detail: best > 0 ? `Completed with altitude deviation (±${o.altTolFt} ft required)${inProgress}` : `Not yet completed${inProgress}` };
    },
  };
}

/** Stall recognition & recovery: altitude lost between stall warning and positive climb. */
export function stallRecovery(o: { id: string; text: string; weight?: number; maxLossFt: number }): Objective {
  let phase: "idle" | "stalling" | "done" = "idle";
  let entryAlt = 0;
  let minAlt = 0;
  let sawStall = false;
  let loss = 0;
  return {
    id: o.id,
    text: o.text,
    weight: o.weight ?? 2,
    update(s) {
      const a = s.aircraft;
      if (phase === "idle" && a.stallWarning && !a.onGround) {
        phase = "stalling";
        entryAlt = a.altMslFt;
        minAlt = a.altMslFt;
      }
      if (phase === "stalling") {
        if (a.stalled) sawStall = true;
        minAlt = Math.min(minAlt, a.altMslFt);
        if (!a.stallWarning && a.vsFpm > 100 && a.iasKt > 0) {
          loss = entryAlt - minAlt;
          phase = "done";
        }
      }
    },
    event() {},
    status() {
      if (phase === "idle") return { score: 0, met: false, done: false, detail: "Slow down until the stall warning sounds, then recover" };
      if (phase === "stalling") return { score: 0.3, met: false, done: false, detail: `${sawStall ? "Stalled" : "Stall warning"} — reduce AoA, full power, level wings, climb` };
      const ok = loss <= o.maxLossFt;
      return { score: ok ? 1 : clamp(1 - (loss - o.maxLossFt) / 600, 0.2, 0.8), met: ok, done: true, detail: `Recovered with ${Math.round(loss)} ft altitude loss${sawStall ? " (full stall)" : " (at the warning)"}` };
    },
  };
}

/** Count passages over a fix (within radius). */
export function fixPassages(o: { id: string; text: string; weight?: number; lat: number; lon: number; count: number; radiusNm?: number }): Objective {
  let inside = false;
  let n = 0;
  return {
    id: o.id,
    text: o.text,
    weight: o.weight ?? 1,
    update(s) {
      const d = distanceNm(s.aircraft.lat, s.aircraft.lon, o.lat, o.lon);
      const r = o.radiusNm ?? 0.7;
      if (!inside && d < r) {
        inside = true;
        n++;
      } else if (inside && d > r * 1.6) inside = false;
    },
    event() {},
    status() {
      const met = n >= o.count;
      return { score: clamp(n / o.count, 0, 1), met, done: met, detail: `${n}/${o.count} fix crossings` };
    },
  };
}

/** Respond within a time window after a trigger becomes true. */
export function respondWithin(o: { id: string; text: string; weight?: number; trigger: Pred; response: Pred; withinSec: number }): Objective {
  let triggeredAt: number | null = null;
  let respondedAfter: number | null = null;
  let t = 0;
  return {
    id: o.id,
    text: o.text,
    weight: o.weight ?? 1,
    update(s, dt) {
      t += dt;
      if (triggeredAt === null && o.trigger(s)) triggeredAt = t;
      if (triggeredAt !== null && respondedAfter === null && o.response(s)) respondedAfter = t - triggeredAt;
    },
    event() {},
    status() {
      if (triggeredAt === null) return { score: 0, met: false, done: false, detail: "Waiting for the situation to develop" };
      if (respondedAfter === null) {
        const late = t - triggeredAt > o.withinSec;
        return { score: 0, met: false, done: late, detail: late ? `No correct response within ${o.withinSec} s` : `Respond within ${o.withinSec} s (${Math.round(o.withinSec - (t - triggeredAt))} s left)` };
      }
      const ok = respondedAfter <= o.withinSec;
      return { score: ok ? 1 : 0.5, met: ok, done: true, detail: `Responded after ${Math.round(respondedAfter)} s` };
    },
  };
}
