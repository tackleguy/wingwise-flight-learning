/**
 * Flight-planning computations used by the Flight Planner and Navigation pages.
 * Educational: spherical-earth great-circle legs, a single wind for the whole route,
 * cruise fuel burn from the aircraft performance model.
 */
import { bearingDeg, destinationPoint, distanceNm, norm360, windTriangle } from "@/lib/geo";
import { resolvePoint, type RoutePoint } from "@/lib/data/airport-utils";
import type { AircraftPerf } from "@/lib/data/types";

export interface PlanLeg {
  from: RoutePoint;
  to: RoutePoint;
  distNm: number;
  trueCourse: number;
  magVar: number;
  magCourse: number;
  wca: number;
  trueHeading: number;
  magHeading: number;
  groundspeed: number;
  eteMin: number;
  fuelGal: number;
  /** Cumulative minutes from departure at the END of this leg. */
  cumMin: number;
  cumNm: number;
  /** ETA at the end of the leg (ISO), when a departure time was given. */
  eta?: string;
  /** Wind exceeds TAS on this leg — no solution. */
  impossible: boolean;
}

export interface PlanInput {
  points: string[];
  tas: number;
  windFrom: number;
  windKt: number;
  burnGph: number;
  departureTime?: string | undefined;
  /** Start, taxi and takeoff allowance (gal), added to the first leg's fuel. */
  taxiGal?: number;
}

export interface PlanResult {
  points: RoutePoint[];
  unresolved: string[];
  legs: PlanLeg[];
  totalNm: number;
  totalMin: number;
  totalFuel: number;
}

export function computePlan(input: PlanInput): PlanResult {
  const pts: RoutePoint[] = [];
  const unresolved: string[] = [];
  for (const id of input.points) {
    const p = resolvePoint(id);
    if (p) pts.push(p);
    else if (id.trim()) unresolved.push(id.trim().toUpperCase());
  }
  const legs: PlanLeg[] = [];
  let cumMin = 0;
  let cumNm = 0;
  const dep = input.departureTime ? new Date(input.departureTime) : undefined;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i] as RoutePoint;
    const b = pts[i + 1] as RoutePoint;
    const distNm = distanceNm(a.lat, a.lon, b.lat, b.lon);
    const tc = bearingDeg(a.lat, a.lon, b.lat, b.lon);
    const mv = (a.magVar + b.magVar) / 2;
    const w = windTriangle(tc, input.tas, input.windFrom, input.windKt);
    const impossible = !Number.isFinite(w.groundspeed) || w.groundspeed <= 0;
    const gs = impossible ? 0 : w.groundspeed;
    const eteMin = impossible ? 0 : (distNm / gs) * 60;
    let fuel = (eteMin / 60) * input.burnGph;
    if (i === 0) fuel += input.taxiGal ?? 0;
    cumMin += eteMin;
    cumNm += distNm;
    const leg: PlanLeg = {
      from: a,
      to: b,
      distNm,
      trueCourse: tc,
      magVar: mv,
      magCourse: norm360(tc - mv),
      wca: impossible ? NaN : w.wca,
      trueHeading: impossible ? NaN : w.heading,
      magHeading: impossible ? NaN : norm360(w.heading - mv),
      groundspeed: gs,
      eteMin,
      fuelGal: fuel,
      cumMin,
      cumNm,
      impossible,
    };
    if (dep && !Number.isNaN(dep.getTime())) leg.eta = new Date(dep.getTime() + cumMin * 60000).toISOString();
    legs.push(leg);
  }
  return {
    points: pts,
    unresolved,
    legs,
    totalNm: cumNm,
    totalMin: cumMin,
    totalFuel: legs.reduce((s, l) => s + l.fuelGal, 0),
  };
}

/** Point at a fraction (0–1) of total route distance. */
export function pointAlongRoute(result: PlanResult, frac: number): { lat: number; lon: number; legIndex: number; distFromStartNm: number } | undefined {
  if (result.legs.length === 0) return undefined;
  const target = Math.max(0, Math.min(1, frac)) * result.totalNm;
  let acc = 0;
  for (let i = 0; i < result.legs.length; i++) {
    const l = result.legs[i] as PlanLeg;
    if (acc + l.distNm >= target || i === result.legs.length - 1) {
      const d = Math.min(l.distNm, Math.max(0, target - acc));
      const p = destinationPoint(l.from.lat, l.from.lon, l.trueCourse, d);
      return { ...p, legIndex: i, distFromStartNm: target };
    }
    acc += l.distNm;
  }
  return undefined;
}

/* ---------------- Cruising altitude rules ---------------- */

export interface AltitudeCheck {
  ok: boolean;
  applies: boolean;
  message: string;
  suggestion?: number;
}

/**
 * VFR hemispheric rule — 14 CFR 91.159: more than 3,000 ft AGL (and below 18,000 MSL):
 * magnetic course 0–179° → odd thousands + 500; 180–359° → even thousands + 500.
 * IFR — 14 CFR 91.179: 0–179° → odd thousands; 180–359° → even thousands
 * (this odd/even convention continues through RVSM airspace up to FL410).
 */
export function checkCruiseAltitude(rules: "VFR" | "IFR", altMsl: number, magCourse: number, groundElevFt: number): AltitudeCheck {
  const east = norm360(magCourse) < 180;
  const dirText = east ? `eastbound (magnetic course ${Math.round(norm360(magCourse))}°, 0–179°)` : `westbound (magnetic course ${Math.round(norm360(magCourse))}°, 180–359°)`;
  if (rules === "VFR") {
    if (altMsl >= 18000) return { ok: false, applies: true, message: "VFR flight is not permitted in Class A airspace (18,000 ft MSL and above).", suggestion: east ? 17500 : 16500 };
    if (altMsl - groundElevFt <= 3000)
      return { ok: true, applies: false, message: `At or below 3,000 ft AGL the VFR hemispheric rule (91.159) does not apply. Any altitude that meets 91.119 minimum safe altitudes and airspace rules is acceptable.` };
    const thousands = Math.floor(altMsl / 1000);
    const hasFive = altMsl % 1000 === 500;
    const parityOk = east ? thousands % 2 === 1 : thousands % 2 === 0;
    const ok = hasFive && parityOk;
    const suggest = nearestValid(altMsl, (a) => a % 1000 === 500 && (east ? Math.floor(a / 1000) % 2 === 1 : Math.floor(a / 1000) % 2 === 0) && a - groundElevFt > 3000);
    return {
      ok,
      applies: true,
      message: ok
        ? `${altMsl.toLocaleString()} ft is correct for VFR ${dirText}: ${east ? "odd" : "even"} thousands + 500 ft (14 CFR 91.159).`
        : `VFR ${dirText} requires ${east ? "odd" : "even"} thousands + 500 ft (e.g. ${east ? "3,500 / 5,500 / 7,500" : "4,500 / 6,500 / 8,500"}). Try ${suggest.toLocaleString()} ft.`,
      suggestion: suggest,
    };
  }
  // IFR above FL410 (non-RVSM): eastbound FL450, 490…; westbound FL430, 470, 510…
  if (altMsl > 41000) {
    const fl = Math.round(altMsl / 100);
    const okHi = (a: number) => a > 41000 && a % 1000 === 0 && (east ? (a / 100 - 450) % 40 === 0 : (a / 100 - 430) % 40 === 0);
    const suggest = nearestValid(altMsl, okHi);
    return {
      ok: okHi(altMsl),
      applies: true,
      message: okHi(altMsl) ? `FL${fl} is correct for IFR ${dirText} above FL410.` : `Above FL410, IFR ${east ? "eastbound uses FL450, 490…" : "westbound uses FL430, 470, 510…"}. Try FL${Math.round(suggest / 100)}.`,
      suggestion: suggest,
    };
  }
  const thousands = altMsl / 1000;
  const whole = altMsl % 1000 === 0;
  const parityOk = east ? thousands % 2 === 1 : thousands % 2 === 0;
  const ok = whole && parityOk;
  const suggest = nearestValid(altMsl, (a) => a % 1000 === 0 && (east ? (a / 1000) % 2 === 1 : (a / 1000) % 2 === 0));
  return {
    ok,
    applies: true,
    message: ok
      ? `${altMsl.toLocaleString()} ft is correct for IFR ${dirText}: ${east ? "odd" : "even"} thousands (14 CFR 91.179). ATC may assign otherwise.`
      : `IFR ${dirText} uses ${east ? "odd" : "even"} thousands (e.g. ${east ? "5,000 / 7,000 / 9,000" : "4,000 / 6,000 / 8,000"}). Try ${suggest.toLocaleString()} ft.`,
    suggestion: suggest,
  };
}

function nearestValid(alt: number, pred: (a: number) => boolean): number {
  for (let d = 0; d <= 4000; d += 500) {
    if (pred(alt + d)) return alt + d;
    if (alt - d > 0 && pred(alt - d)) return alt - d;
  }
  return alt;
}

/* ---------------- Fuel requirements ---------------- */

export interface FuelCheck {
  requiredGal: number;
  reserveMin: number;
  reserveGal: number;
  alternateGal: number;
  tripGal: number;
  onBoardGal: number;
  marginGal: number;
  ok: boolean;
  rule: string;
  enduranceMin: number;
}

export function fuelRequirement(opts: {
  rules: "VFR" | "IFR";
  night: boolean;
  tripGal: number;
  alternateGal: number;
  burnGph: number;
  onBoardGal: number;
  alternateRequired: boolean;
}): FuelCheck {
  const reserveMin = opts.rules === "IFR" ? 45 : opts.night ? 45 : 30;
  const reserveGal = (reserveMin / 60) * opts.burnGph;
  const altGal = opts.rules === "IFR" && opts.alternateRequired ? opts.alternateGal : 0;
  const required = opts.tripGal + altGal + reserveGal;
  const rule =
    opts.rules === "IFR"
      ? `14 CFR 91.167: fuel to the destination${opts.alternateRequired ? ", then to the alternate," : ""} and then 45 minutes at normal cruise.`
      : `14 CFR 91.151: fuel to the first point of intended landing plus ${reserveMin} minutes at normal cruise (${opts.night ? "night" : "day"}).`;
  return {
    requiredGal: required,
    reserveMin,
    reserveGal,
    alternateGal: altGal,
    tripGal: opts.tripGal,
    onBoardGal: opts.onBoardGal,
    marginGal: opts.onBoardGal - required,
    ok: opts.onBoardGal >= required,
    rule,
    enduranceMin: opts.burnGph > 0 ? (opts.onBoardGal / opts.burnGph) * 60 : 0,
  };
}

export function perfDefaults(p: AircraftPerf) {
  return { tas: p.cruiseKtas, burn: p.fuelBurnCruiseGph, alt: p.cruiseAltFt, fuel: p.usableFuelGal, taxi: Math.round(p.fuelBurnFullGph * 0.1 * 10) / 10 };
}

export function fmtMin(min: number): string {
  if (!Number.isFinite(min)) return "—";
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (m === 60) return `${h + 1}:00`;
  return `${h}:${String(m).padStart(2, "0")}`;
}

export function fmtZulu(iso: string | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${String(d.getUTCHours()).padStart(2, "0")}${String(d.getUTCMinutes()).padStart(2, "0")}Z`;
}
