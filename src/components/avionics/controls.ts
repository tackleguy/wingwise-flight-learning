/**
 * Shared control logic for knobs that appear on several instruments (CRS/OBS, HDG, ALT select,
 * baro). Every function reads the LATEST snapshot from the engine, so several knob detents
 * arriving within one animation frame are all applied.
 */
import { clamp, norm360 } from "@/lib/geo";
import type { SimEngine } from "@/sim/engine";

/** Set an OBS directly. */
export function setObs(engine: SimEngine, n: 1 | 2, obs: number) {
  const r = engine.getSnapshot().radios;
  const o = norm360(Math.round(obs));
  if (n === 1) engine.setRadios({ nav1: { ...r.nav1, obs: o } });
  else engine.setRadios({ nav2: { ...r.nav2, obs: o } });
}

/** Turn the OBS of NAV1/NAV2. */
export function stepObs(engine: SimEngine, n: 1 | 2, dir: number, big = false) {
  const r = engine.getSnapshot().radios;
  setObs(engine, n, (n === 1 ? r.nav1.obs : r.nav2.obs) + dir * (big ? 10 : 1));
}

/** Turn the course (OBS) of the active CDI source. GPS course is set by the flight plan (returns false). */
export function stepCourse(engine: SimEngine, dir: number, big = false) {
  const src = engine.getSnapshot().radios.cdiSource;
  if (src === "GPS") return false;
  stepObs(engine, src === "NAV1" ? 1 : 2, dir, big);
  return true;
}

/** Centre the needle with a TO indication (course = bearing to the station / localizer course). */
export function syncObs(engine: SimEngine, n: 1 | 2) {
  const s = engine.getSnapshot();
  const rx = n === 1 ? s.nav.nav1 : s.nav.nav2;
  if (!rx.valid) return false;
  setObs(engine, n, rx.kind === "ILS" ? rx.locCourse : rx.bearingTo);
  return true;
}

/** Push CRS on the active CDI source. */
export function syncCourse(engine: SimEngine) {
  const src = engine.getSnapshot().radios.cdiSource;
  if (src === "GPS") return false;
  return syncObs(engine, src === "NAV1" ? 1 : 2);
}

export function stepHeadingBug(engine: SimEngine, dir: number, big = false) {
  engine.setRadios({ hdgBug: engine.getSnapshot().radios.hdgBug + dir * (big ? 10 : 1) });
}

export function syncHeadingBug(engine: SimEngine) {
  engine.setRadios({ hdgBug: Math.round(engine.getSnapshot().indicated.headingMag) });
}

/** ALT select: outer = 1000 ft, inner = 100 ft. */
export function stepAltBug(engine: SimEngine, dir: number, thousands: boolean) {
  engine.setRadios({ altBug: Math.max(0, engine.getSnapshot().radios.altBug + dir * (thousands ? 1000 : 100)) });
}

/** Baro (Kollsman) setting in inHg. */
export function stepBaro(engine: SimEngine, dir: number, big = false) {
  const v = engine.getSnapshot().radios.altimeterInHg + dir * (big ? 0.1 : 0.01);
  engine.setRadios({ altimeterInHg: clamp(Math.round(v * 100) / 100, 27.5, 31.5) });
}

/** Cycle the CDI source GPS → NAV1 → NAV2 → GPS. */
export function cycleCdi(engine: SimEngine) {
  const c = engine.getSnapshot().radios.cdiSource;
  engine.setRadios({ cdiSource: c === "GPS" ? "NAV1" : c === "NAV1" ? "NAV2" : "GPS" });
}
