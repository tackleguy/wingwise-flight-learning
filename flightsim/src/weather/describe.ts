/**
 * Weather in words a beginner understands, the FAA flight category, and the wind split into
 * headwind and crosswind for a runway.
 */
import { densityAltitudeFt, norm360, pressureAltitudeFt, windComponents } from "@/core/math";
import type { Environment } from "@/core/types";
import type { FlightCategory, RunwayWind } from "./api";

/** The strongest crosswind the trainer (Cessna 172P class) was demonstrated in during certification, kt. Not a legal limit — but a sensible one for students. */
export const DEMONSTRATED_CROSSWIND_KT = 15;

/** Height of the ceiling above the weather station, ft: the lowest BROKEN or OVERCAST layer. null = no ceiling. */
export function ceilingFtAgl(env: Pick<Environment, "clouds" | "stationElevFt">): number | null {
  let ceiling: number | null = null;
  for (const c of env.clouds) {
    if (c.cover !== "BKN" && c.cover !== "OVC") continue;
    // to the nearest foot: station elevations are not whole feet, and a reported "BKN030" must stay exactly 3,000 ft
    const agl = Math.max(0, Math.round(c.baseFtMsl - env.stationElevFt));
    if (ceiling === null || agl < ceiling) ceiling = agl;
  }
  return ceiling;
}

/**
 * Flight category as the FAA defines it:
 *   VFR   ceiling above 3,000 ft and visibility more than 5 miles
 *   MVFR  ceiling 1,000 to 3,000 ft and/or visibility 3 to 5 miles ("marginal")
 *   IFR   ceiling 500 to below 1,000 ft and/or visibility 1 to below 3 miles
 *   LIFR  ceiling below 500 ft and/or visibility below 1 mile ("low IFR")
 */
export function flightCategoryOf(env: Pick<Environment, "clouds" | "stationElevFt" | "visibilitySm">): FlightCategory {
  const ceiling = ceilingFtAgl(env) ?? Infinity;
  const vis = env.visibilitySm;
  if (ceiling < 500 || vis < 1) return "LIFR";
  if (ceiling < 1000 || vis < 3) return "IFR";
  if (ceiling <= 3000 || vis <= 5) return "MVFR";
  return "VFR";
}

/** Headwind / crosswind of the reported surface wind (lowest wind layer) on a runway heading. */
export function runwayWind(env: Pick<Environment, "wind">, runwayHeadingTrue: number): RunwayWind {
  const surface = env.wind[0];
  if (!surface || surface.kt <= 0) return { headwindKt: 0, crosswindKt: 0, fromLeft: false };
  const c = windComponents(runwayHeadingTrue, surface.dirTrue, surface.kt);
  return { headwindKt: c.headwind, crosswindKt: Math.abs(c.crosswind), fromLeft: c.crosswind < -1e-9 };
}

/** Density altitude at the weather station, ft: the altitude the aircraft "thinks" it is at, performance-wise. */
export function fieldDensityAltitudeFt(env: Pick<Environment, "qnhInHg" | "stationElevFt" | "tempC">): number {
  const pressureAlt = env.stationElevFt + pressureAltitudeFt(env.qnhInHg);
  return densityAltitudeFt(pressureAlt, env.tempC);
}

const COMPASS = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"];
export const compassWord = (dirTrue: number) => COMPASS[Math.round(norm360(dirTrue) / 45) % 8]!;

const thousands = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
const hundredsFt = (ft: number) => thousands(Math.max(100, Math.round(ft / 100) * 100));
const deg3 = (d: number) => {
  const r = Math.round(norm360(d)) % 360;
  return String(r === 0 ? 360 : r).padStart(3, "0");
};

function visibilityText(sm: number): string {
  // airport reports stop at "10 miles or more"; beyond that the exact figure is an estimate and does not matter to a pilot
  if (sm > 10.5) return "more than 10 miles";
  if (sm >= 9.5) return "10 miles";
  if (sm >= 2.75) return `${Math.round(sm)} miles`;
  if (sm >= 0.875) return `${Math.round(sm * 2) / 2} ${Math.round(sm * 2) / 2 === 1 ? "mile" : "miles"}`;
  if (sm >= 0.6) return "three quarters of a mile";
  if (sm >= 0.38) return "half a mile";
  if (sm >= 0.19) return "a quarter of a mile";
  return "less than a quarter of a mile";
}

const COVER_WORDS = { FEW: "a few clouds", SCT: "scattered clouds", BKN: "broken cloud (mostly cloudy)", OVC: "overcast (solid cloud)" } as const;

function skyText(env: Environment): string {
  if (!env.clouds.length) return "no clouds";
  const sorted = [...env.clouds].sort((a, b) => a.baseFtMsl - b.baseFtMsl);
  const lowest = sorted[0]!;
  const ceilingLayer = sorted.find((c) => c.cover === "BKN" || c.cover === "OVC");
  const agl = (c: { baseFtMsl: number }) => hundredsFt(c.baseFtMsl - env.stationElevFt);
  if (ceilingLayer && ceilingLayer !== lowest) return `${COVER_WORDS[lowest.cover]} at ${agl(lowest)} ft and ${COVER_WORDS[ceilingLayer.cover]} at ${agl(ceilingLayer)} ft above the airport`;
  return `${COVER_WORDS[lowest.cover]} at ${agl(lowest)} ft above the airport`;
}

const CATEGORY_TEXT: Record<FlightCategory, string> = {
  VFR: "Good weather for visual flying (VFR)",
  MVFR: "Marginal weather for visual flying (MVFR)",
  IFR: "Instrument weather (IFR), too poor for visual flying",
  LIFR: "Very low cloud or visibility (LIFR), far too poor for visual flying",
};

export interface DescribeContext {
  /** Runway in use, if known. */
  runway?: { id: string; headingTrue: number } | null;
}

/**
 * Two or three plain sentences about the weather: the flight category with sky and visibility,
 * the wind and what it means on the runway in use (crosswind against the aircraft's demonstrated
 * 15 kt), and a remark on aircraft performance when the air is thin (hot / high) or very dense.
 */
export function describeWeather(env: Environment, ctx: DescribeContext = {}): string {
  const out: string[] = [];
  const category = flightCategoryOf(env);

  // 1. category, visibility, sky, temperature
  const precip = env.precipitation === "rain" ? " in rain" : env.precipitation === "snow" ? " in snow" : "";
  out.push(`${CATEGORY_TEXT[category]}: visibility ${visibilityText(env.visibilitySm)}${precip}, ${skyText(env)}, ${Math.round(env.tempC)} °C.`);

  // 2. wind, and the runway
  const surface = env.wind[0];
  const kt = surface ? Math.round(surface.kt) : 0;
  const gustPeak = surface && env.gustKt >= 1 ? Math.round(surface.kt + env.gustKt) : 0;
  let wind: string;
  if (!surface || kt < 1) wind = gustPeak > 0 ? `The wind is nearly calm with gusts to ${gustPeak} knots` : "The wind is calm";
  else wind = `Wind from the ${compassWord(surface.dirTrue)} (${deg3(surface.dirTrue)}° true) at ${kt} ${kt === 1 ? "knot" : "knots"}${gustPeak > kt ? `, gusting to ${gustPeak}` : ""}`;
  const rw = ctx.runway;
  if (rw && surface && surface.kt >= 0.5) {
    const c = runwayWind(env, rw.headingTrue);
    const cross = Math.round(c.crosswindKt);
    const head = Math.round(c.headwindKt);
    const gustFactor = surface.kt > 0 ? (surface.kt + env.gustKt) / surface.kt : 1;
    const crossGust = Math.round(c.crosswindKt * gustFactor);
    const along = head >= 1 ? `a ${head}-knot headwind` : head <= -1 ? `a ${-head}-knot tailwind` : "";
    let runway: string;
    if (cross < 1) {
      runway = `on runway ${rw.id} that is ${along || "almost no wind"} with no crosswind to speak of.`;
    } else {
      const side = c.fromLeft ? "left" : "right";
      const gustBit = crossGust > cross ? ` (up to ${crossGust} in the gusts)` : "";
      const worst = Math.max(cross, crossGust);
      let verdict: string;
      if (cross > DEMONSTRATED_CROSSWIND_KT) verdict = `more than the ${DEMONSTRATED_CROSSWIND_KT} knots this aircraft has been demonstrated in, and beyond what a student should attempt`;
      else if (worst > DEMONSTRATED_CROSSWIND_KT) verdict = `within the ${DEMONSTRATED_CROSSWIND_KT} knots this aircraft has been demonstrated in, but the gusts go beyond it`;
      else verdict = `within the ${DEMONSTRATED_CROSSWIND_KT} knots this aircraft has been demonstrated in`;
      runway = `on runway ${rw.id} that is a ${cross}-knot crosswind from the ${side}${gustBit}${along ? ` with ${along}` : ""} — ${verdict}.`;
      if (head <= -5) runway += " Landing with that much tailwind uses a lot more runway; the opposite runway would be the better choice.";
    }
    wind += "; " + runway;
  } else wind += ".";
  out.push(wind);

  // 3. performance (density altitude)
  const da = fieldDensityAltitudeFt(env);
  const elev = env.stationElevFt;
  if (da - elev >= 1500 || (da >= 5000 && da - elev >= 500)) {
    out.push(
      `The air is thin today: the density altitude at the airport is about ${hundredsFt(da)} ft${elev >= 500 ? ` (the airport itself is at ${hundredsFt(elev)} ft)` : ""}, so expect a longer take-off roll and a weaker climb than usual.`,
    );
  } else if (da - elev <= -1500) {
    out.push("The air is cold and dense today, so the aircraft takes off and climbs better than on a standard day.");
  }
  return out.join(" ");
}
