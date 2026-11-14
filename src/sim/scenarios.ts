/**
 * Simulator training scenarios. Every scenario defines its start state, weather, failures,
 * radio/GPS setup and measurable objectives. Scenario ids are referenced across the app
 * (academy lessons, certification tracks, checkrides) — keep them stable.
 */
import {
  getAirport,
  getRunwayEnd,
  bestRunwayForWind,
  allRunwayEnds,
  magneticHeading,
  getNavaid,
} from "@/lib/data/airports";
import { getPerf } from "@/lib/data/aircraft-perf";
import type { Airport, RunwayEnd } from "@/lib/data/types";
import { bearingDeg, destinationPoint, distanceNm, norm180, norm360, FT_PER_NM } from "@/lib/geo";
import type { SimEngine, SimOptions } from "./engine";
import { WEATHER_PRESETS, terrainElevationFt } from "./environment";
import { buildTrainingApproach } from "./navigation";
import {
  avoid,
  fixPassages,
  holdWithin,
  landing,
  reach,
  respondWithin,
  stallRecovery,
  turnThrough,
  type Objective,
} from "./objectives";
import type { Failures, SimSnapshot, StartState, Waypoint, WeatherState } from "./types";

export type ScenarioCategory = "free" | "vfr" | "ifr" | "emergency" | "checkride";

export interface ScenarioConfig {
  aircraftId: string;
  airport?: string;
  destination?: string;
  weatherKey?: string;
  timeOfDay?: number;
  windDir?: number;
  windKt?: number;
  visibilitySm?: number;
}

export interface Landmark {
  label: string;
  lat: number;
  lon: number;
  heightFt: number;
  kind: "tower" | "point" | "fix";
}

export interface ScheduledFailure {
  /** Seconds after start, or a predicate */
  at: number | ((s: SimSnapshot) => boolean);
  failure?: keyof Failures;
  /** Optional weather change at the same time */
  weather?: Partial<WeatherState>;
  message: string;
}

export interface BuiltScenario {
  options: SimOptions;
  departure: Airport;
  destination: Airport | null;
  objectives: Objective[];
  landmarks: Landmark[];
  failures: ScheduledFailure[];
  setup?: (engine: SimEngine) => void;
  /** Instructions shown in the cockpit (clearance, task list) */
  instructions: string[];
  /** Ends automatically when true */
  isComplete?: (s: SimSnapshot, t: number) => boolean;
  maxDurationSec: number;
}

export interface ScenarioDef {
  id: string;
  title: string;
  category: ScenarioCategory;
  rules: "VFR" | "IFR";
  level: "beginner" | "intermediate" | "advanced";
  summary: string;
  briefing: string[];
  safety: string[];
  maneuvers: string[];
  defaultAircraft: string;
  /** Allowed aircraft ids (undefined = any) */
  aircraft?: string[];
  durationMin: number;
  build: (cfg: ScenarioConfig) => BuiltScenario;
}

// ------------------------------------------------------------------- helpers

function weatherFrom(
  key: string,
  cfg: ScenarioConfig,
  overrides?: Partial<WeatherState>,
): WeatherState {
  const preset = WEATHER_PRESETS[cfg.weatherKey ?? key] ?? WEATHER_PRESETS["cavu"]!;
  const w: WeatherState = { ...preset.weather, timeOfDay: cfg.timeOfDay ?? 13, ...overrides };
  if (cfg.windDir !== undefined) w.windDir = cfg.windDir;
  if (cfg.windKt !== undefined) {
    w.windKt = cfg.windKt;
    w.gustKt = Math.max(w.gustKt, cfg.windKt);
  }
  if (cfg.visibilitySm !== undefined) w.visibilitySm = cfg.visibilitySm;
  return w;
}

function requireAirport(icao: string): Airport {
  const a = getAirport(icao);
  if (!a) throw new Error(`Unknown airport ${icao}`);
  return a;
}

/** Choose a runway end: into the wind, long enough for the aircraft. */
function chooseEnd(ap: Airport, w: WeatherState, perfId: string, preferred?: string): RunwayEnd {
  if (preferred) {
    const r = getRunwayEnd(ap, preferred);
    if (r) return r.end;
  }
  const perf = getPerf(perfId);
  const minLen =
    perf.powerType === "jet"
      ? 7000
      : perf.powerType === "turboprop"
        ? 4000
        : perf.engines > 1
          ? 3500
          : 2000;
  const candidates = allRunwayEnds(ap).filter((r) => r.runway.lengthFt >= minLen);
  const pool = candidates.length ? candidates : allRunwayEnds(ap);
  let best = pool[0]!;
  let bestScore = -Infinity;
  for (const re of pool) {
    const head =
      Math.cos(((w.windDir - re.end.trueHeading) * Math.PI) / 180) * Math.min(1, w.windKt / 5);
    const score = head * 10 + re.runway.lengthFt / 4000;
    if (score > bestScore) {
      bestScore = score;
      best = re;
    }
  }
  return best.end;
}

function runwayStart(ap: Airport, end: RunwayEnd): StartState {
  // Line up ~150 ft down the runway.
  const p = destinationPoint(
    end.threshold.lat,
    end.threshold.lon,
    end.trueHeading,
    150 / FT_PER_NM,
  );
  return {
    lat: p.lat,
    lon: p.lon,
    altMslFt: ap.elevationFt,
    heading: end.trueHeading,
    iasKt: 0,
    onGround: true,
    groundElevFt: terrainElevationFt(p.lat, p.lon),
    engineRunning: true,
  };
}

function finalStart(
  ap: Airport,
  end: RunwayEnd,
  distNm: number,
  perfId: string,
  extraAltFt = 0,
): StartState {
  const perf = getPerf(perfId);
  const p = destinationPoint(
    end.threshold.lat,
    end.threshold.lon,
    norm360(end.trueHeading + 180),
    distNm,
  );
  const alt = ap.elevationFt + 50 + distNm * FT_PER_NM * Math.tan((3 * Math.PI) / 180) + extraAltFt;
  return {
    lat: p.lat,
    lon: p.lon,
    altMslFt: Math.round(alt),
    heading: end.trueHeading,
    iasKt: perf.v.ref + 10,
    onGround: false,
    groundElevFt: ap.elevationFt,
    engineRunning: true,
    flapIndex: Math.min(1, perf.flapDetents.length - 1),
    gearDown: true,
    throttle: perf.powerType === "jet" ? 0.45 : 0.4,
  };
}

function airStart(
  lat: number,
  lon: number,
  altMslFt: number,
  heading: number,
  iasKt: number,
  perfId: string,
  throttle?: number,
): StartState {
  const perf = getPerf(perfId);
  const st: StartState = {
    lat,
    lon,
    altMslFt,
    heading,
    iasKt,
    onGround: false,
    groundElevFt: terrainElevationFt(lat, lon),
    engineRunning: true,
    gearDown: !perf.retractableGear,
    flapIndex: 0,
  };
  st.throttle = throttle ?? (perf.powerType === "jet" ? 0.6 : 0.65);
  return st;
}

const magOf = (ap: Airport, trueHdg: number) => Math.round(magneticHeading(ap, trueHdg));
const rwyLabel = (end: RunwayEnd) => `Runway ${end.id}`;

const commonSafety = [
  "Educational simulation only — technique here is simplified. Always follow your aircraft's POH/AFM and your instructor's guidance.",
];

const noOverspeed = (id = "no-overspeed") =>
  avoid({
    id,
    text: "Stay below VNE / VMO",
    weight: 0.5,
    bad: (s) => s.aircraft.overspeed,
    describe: (s) => `Overspeed at ${Math.round(s.aircraft.iasKt)} KIAS`,
  });

const noStall = (id = "no-stall") =>
  avoid({
    id,
    text: "No inadvertent stall",
    weight: 1,
    bad: (s) => s.aircraft.stalled,
    describe: (s) => `Stalled at ${Math.round(s.aircraft.altMslFt)} ft`,
  });

function gpsPlanFor(dep: Airport, dest: Airport | null): Waypoint[] {
  const wps: Waypoint[] = [{ id: dep.icao, lat: dep.lat, lon: dep.lon, kind: "airport" }];
  if (dest && dest.icao !== dep.icao)
    wps.push({ id: dest.icao, lat: dest.lat, lon: dest.lon, kind: "airport" });
  return wps;
}

function tuneIls(engine: SimEngine, ap: Airport, end: RunwayEnd) {
  if (!end.ils) return;
  const r = engine.getSnapshot().radios;
  engine.setRadios({
    nav1: { active: end.ils.freq, standby: r.nav1.active, obs: magOf(ap, end.trueHeading) },
    cdiSource: "NAV1",
  });
}

// ------------------------------------------------------------------- scenarios

export const SCENARIOS: ScenarioDef[] = [
  // ============================== FREE FLIGHT
  {
    id: "free-flight",
    title: "Free Flight",
    category: "free",
    rules: "VFR",
    level: "beginner",
    summary: "Choose any aircraft, airport, weather and time of day and fly however you like.",
    briefing: [
      "You start lined up on the runway with the engine running. Release the parking brake (P), apply full power (Shift / +), and rotate gently at VR.",
      "If you set a destination, the GPS flight plan is loaded and the objectives include landing there.",
    ],
    safety: commonSafety,
    maneuvers: ["Takeoff", "Free flight"],
    defaultAircraft: "c172",
    durationMin: 20,
    build(cfg) {
      const dep = requireAirport(cfg.airport ?? "KPAO");
      const dest = cfg.destination ? (getAirport(cfg.destination) ?? null) : null;
      const w = weatherFrom("scattered", cfg);
      const end = chooseEnd(dep, w, cfg.aircraftId);
      const objectives: Objective[] = [
        reach({
          id: "takeoff",
          text: "Take off",
          cond: (s) => !s.aircraft.onGround && s.aircraft.aglFt > 200,
        }),
        noStall(),
        noOverspeed(),
      ];
      if (dest)
        objectives.push(
          landing({ id: "land", text: `Land at ${dest.icao}`, target: { airport: dest } }),
        );
      else
        objectives.push(
          landing({
            id: "land",
            text: `Land back at ${dep.icao}`,
            target: { airport: dep },
            weight: 1,
          }),
        );
      return {
        options: {
          perfId: cfg.aircraftId,
          start: runwayStart(dep, end),
          weather: w,
          magVar: dep.magVar,
        },
        departure: dep,
        destination: dest,
        objectives,
        landmarks: [],
        failures: [],
        instructions: [
          `Depart ${dep.icao} ${rwyLabel(end)}${dest ? ` — destination ${dest.icao}` : ""}.`,
        ],
        setup: (e) => e.loadFlightPlan(gpsPlanFor(dep, dest)),
        maxDurationSec: 3 * 3600,
      };
    },
  },

  // ============================== VFR
  {
    id: "vfr-takeoff-climb",
    title: "Normal Takeoff & Climb",
    category: "vfr",
    rules: "VFR",
    level: "beginner",
    summary: "Normal takeoff, rotate at VR, climb at VY with runway heading maintained.",
    briefing: [
      "Before takeoff: flaps up (normal takeoff), trim set for takeoff, mixture rich, parking brake released.",
      "Add full power smoothly, keep the centerline with rudder (right rudder for the left-turning tendencies).",
      "Rotate at VR with gentle back pressure, then pitch for VY (best rate of climb).",
      "Maintain runway heading until 1,500 ft AGL.",
    ],
    safety: [
      ...commonSafety,
      "Abort the takeoff if anything looks abnormal before rotation — close the throttle and brake.",
    ],
    maneuvers: ["Normal takeoff", "Climb at VY"],
    defaultAircraft: "c172",
    durationMin: 4,
    build(cfg) {
      const dep = requireAirport(cfg.airport ?? "KHWD");
      const w = weatherFrom("cavu", cfg);
      const end = chooseEnd(dep, w, cfg.aircraftId, cfg.airport ? undefined : "28L");
      const perf = getPerf(cfg.aircraftId);
      let liftoffIas = 0;
      const rotate: Objective = {
        id: "rotate",
        text: `Rotate near VR (${perf.v.r} KIAS)`,
        weight: 1,
        update() {},
        event(e) {
          if (e.type === "liftoff" && !liftoffIas) liftoffIas = Number(e.data?.["ias"] ?? 0);
        },
        status() {
          if (!liftoffIas) return { score: 0, met: false, done: false, detail: "Not airborne yet" };
          const dev = liftoffIas - perf.v.r;
          const ok = dev >= -5 && dev <= 12;
          return {
            score: ok ? 1 : 0.5,
            met: ok,
            done: true,
            detail: `Liftoff at ${liftoffIas} KIAS`,
          };
        },
      };
      return {
        options: {
          perfId: cfg.aircraftId,
          start: runwayStart(dep, end),
          weather: w,
          magVar: dep.magVar,
        },
        departure: dep,
        destination: null,
        objectives: [
          rotate,
          holdWithin({
            id: "vy",
            text: `Climb at VY ${perf.v.y} KIAS ±5`,
            active: (s) =>
              s.aircraft.aglFt > 200 && s.aircraft.aglFt < 1500 && s.aircraft.vsFpm > 100,
            deviation: (s) => s.indicated.iasKt - perf.v.y,
            tol: 5,
            minSec: 30,
            unit: "kt",
          }),
          holdWithin({
            id: "hdg",
            text: "Maintain runway heading ±10°",
            active: (s) => !s.aircraft.onGround && s.aircraft.aglFt < 1500,
            deviation: (s) => norm180(s.aircraft.track - end.trueHeading),
            tol: 10,
            minSec: 30,
            unit: "°",
          }),
          holdWithin({
            id: "coord",
            text: "Coordinated climb (ball centered)",
            weight: 0.5,
            active: (s) => !s.aircraft.onGround && s.aircraft.aglFt < 1500,
            deviation: (s) => s.aircraft.slip * 10,
            tol: 3,
            minSec: 30,
            unit: "ball/10",
          }),
          reach({
            id: "alt",
            text: "Climb to 1,500 ft AGL",
            cond: (s) => s.aircraft.aglFt >= 1500,
          }),
          noStall(),
        ],
        landmarks: [],
        failures: [],
        instructions: [
          `Cleared for takeoff ${rwyLabel(end)}, maintain runway heading, climb to ${Math.round((dep.elevationFt + 1500) / 100) * 100} ft (simulated).`,
        ],
        isComplete: (s) => s.aircraft.aglFt >= 1550,
        maxDurationSec: 600,
      };
    },
  },
  {
    id: "vfr-pattern",
    title: "Traffic Pattern & Landing",
    category: "vfr",
    rules: "VFR",
    level: "beginner",
    summary: "Fly a complete rectangular traffic pattern at pattern altitude and land.",
    briefing: [
      "Take off and climb on the upwind leg. Begin the crosswind turn within 300 ft of pattern altitude.",
      "Downwind at traffic pattern altitude (TPA, 1,000 ft AGL) about ½–1 nm from the runway.",
      "Abeam the touchdown point: carb heat (if equipped), reduce power, first notch of flaps, begin descent.",
      "Turn base when the touchdown point is ~45° behind you; turn final and stabilise at VREF + ½ gust factor.",
      "Land in the first third of the runway on the centerline and stop on the runway.",
    ],
    safety: [
      ...commonSafety,
      "Go around (full power, pitch for VY, flaps up in stages) if the approach is not stabilised by 300 ft AGL.",
    ],
    maneuvers: ["Traffic pattern", "Normal landing"],
    defaultAircraft: "c172",
    durationMin: 8,
    build(cfg) {
      const dep = requireAirport(cfg.airport ?? "KHWD");
      const w = weatherFrom("cavu", cfg, { windDir: 270, windKt: 7 });
      const end = chooseEnd(dep, w, cfg.aircraftId, cfg.airport ? undefined : "28L");
      const perf = getPerf(cfg.aircraftId);
      const tpa = dep.elevationFt + 1000;
      return {
        options: {
          perfId: cfg.aircraftId,
          start: runwayStart(dep, end),
          weather: w,
          magVar: dep.magVar,
        },
        departure: dep,
        destination: dep,
        objectives: [
          reach({
            id: "takeoff",
            text: "Take off",
            cond: (s) => !s.aircraft.onGround && s.aircraft.aglFt > 300,
          }),
          holdWithin({
            id: "tpa",
            text: `Downwind at TPA ${tpa} ft ±100`,
            weight: 1.5,
            active: (s) =>
              !s.aircraft.onGround &&
              Math.abs(norm180(s.aircraft.track - norm360(end.trueHeading + 180))) < 30 &&
              distanceNm(s.aircraft.lat, s.aircraft.lon, end.threshold.lat, end.threshold.lon) < 3,
            deviation: (s) => s.indicated.altFt - tpa,
            tol: 100,
            minSec: 20,
            unit: "ft",
          }),
          avoid({
            id: "vfe",
            text: "Flaps only below VFE",
            weight: 0.5,
            bad: (s) => s.aircraft.flapsDeg > 1 && s.indicated.iasKt > perf.v.fe + 3,
            describe: (s) =>
              `Flaps extended at ${Math.round(s.indicated.iasKt)} KIAS (VFE ${perf.v.fe})`,
          }),
          holdWithin({
            id: "final-speed",
            text: `Stabilised final at ${perf.v.ref} KIAS ±10`,
            active: (s) =>
              !s.aircraft.onGround &&
              s.aircraft.aglFt < 400 &&
              s.aircraft.aglFt > 30 &&
              Math.abs(norm180(s.aircraft.track - end.trueHeading)) < 25,
            deviation: (s) => s.indicated.iasKt - (perf.v.ref + 3),
            tol: 10,
            minSec: 10,
            unit: "kt",
          }),
          landing({
            id: "land",
            text: `Land on ${rwyLabel(end)}`,
            target: { airport: dep, endId: end.id },
          }),
          noStall(),
        ],
        landmarks: [],
        failures: [],
        instructions: [
          `Make ${end.pattern} traffic, ${rwyLabel(end)}, pattern altitude ${tpa} ft MSL. Cleared for the option (simulated).`,
        ],
        isComplete: (s, t) => t > 30 && s.aircraft.onGround && s.aircraft.gsKt < 2,
        maxDurationSec: 1500,
      };
    },
  },
  {
    id: "vfr-landing",
    title: "Stabilised Approach & Landing",
    category: "vfr",
    rules: "VFR",
    level: "beginner",
    summary: "Start on a 3 nm final, fly a stabilised approach and land in the touchdown zone.",
    briefing: [
      "You are on a 3 nm straight-in final, configured with partial flaps, on the visual glidepath.",
      "Use the PAPI lights: two white / two red = on glidepath. Pitch for airspeed, power for descent rate (and vice versa — keep both coordinated).",
      "Stabilised criteria: on speed (VREF ±10), on glidepath, descent rate under 1,000 fpm, aligned with the centerline.",
      "Flare: reduce power to idle over the threshold, gradually raise the nose to touch down on the main wheels.",
    ],
    safety: [...commonSafety, "If unstable below 500 ft AGL — go around."],
    maneuvers: ["Straight-in approach", "Normal landing"],
    defaultAircraft: "c172",
    durationMin: 3,
    build(cfg) {
      const dep = requireAirport(cfg.airport ?? "KHWD");
      const w = weatherFrom("cavu", cfg, { windDir: 290, windKt: 8 });
      const end = chooseEnd(dep, w, cfg.aircraftId, cfg.airport ? undefined : "28L");
      const perf = getPerf(cfg.aircraftId);
      return {
        options: {
          perfId: cfg.aircraftId,
          start: finalStart(dep, end, 3, cfg.aircraftId),
          weather: w,
          magVar: dep.magVar,
        },
        departure: dep,
        destination: dep,
        objectives: [
          holdWithin({
            id: "speed",
            text: `Approach speed ${perf.v.ref + 5} KIAS ±10`,
            active: (s) => !s.aircraft.onGround && s.aircraft.aglFt > 50,
            deviation: (s) => s.indicated.iasKt - (perf.v.ref + 5),
            tol: 10,
            minSec: 20,
            unit: "kt",
          }),
          holdWithin({
            id: "sink",
            text: "Descent rate below 1,000 fpm",
            active: (s) => !s.aircraft.onGround && s.aircraft.aglFt > 50,
            deviation: (s) => Math.max(0, -s.aircraft.vsFpm - 1000) / 10,
            tol: 0,
            minSec: 20,
            unit: "×10 fpm",
          }),
          holdWithin({
            id: "align",
            text: "Aligned with the runway (track ±10°)",
            active: (s) => !s.aircraft.onGround && s.aircraft.aglFt > 30,
            deviation: (s) => norm180(s.aircraft.track - end.trueHeading),
            tol: 10,
            minSec: 20,
            unit: "°",
          }),
          landing({
            id: "land",
            text: `Land in the touchdown zone of ${rwyLabel(end)}`,
            target: { airport: dep, endId: end.id },
          }),
          noStall(),
        ],
        landmarks: [],
        failures: [],
        instructions: [
          `${rwyLabel(end)}, cleared to land, wind ${Math.round(magOf(dep, w.windDir))} at ${w.windKt} (simulated).`,
        ],
        isComplete: (s, t) => t > 10 && s.aircraft.onGround && s.aircraft.gsKt < 2,
        maxDurationSec: 600,
      };
    },
  },
  {
    id: "vfr-turns-climbs",
    title: "Steep Turns, Climbs & Descents",
    category: "vfr",
    rules: "VFR",
    level: "intermediate",
    summary: "Perform 360° steep turns at 45° bank holding altitude, then a climb and descent.",
    briefing: [
      "ACS standard (private): 45° bank ±5°, altitude ±100 ft, airspeed ±10 kt, roll out on entry heading ±10°.",
      "Entry speed at or below VA. As you roll in, add back pressure (load factor is 1.41 G at 45°) and a little power.",
      "Look outside: keep the nose on the horizon. Start the rollout about 20° (half the bank angle) before the entry heading.",
      "Then climb 1,000 ft at VY and descend 1,000 ft at 500 fpm.",
    ],
    safety: [...commonSafety, "Clearing turns first — always look for traffic before maneuvering."],
    maneuvers: ["Steep turns", "Climbs", "Descents"],
    defaultAircraft: "c172",
    durationMin: 8,
    build(cfg) {
      const dep = requireAirport(cfg.airport ?? "KLVK");
      const w = weatherFrom("cavu", cfg);
      const perf = getPerf(cfg.aircraftId);
      const p = destinationPoint(dep.lat, dep.lon, 120, 6);
      const start = airStart(
        p.lat,
        p.lon,
        dep.elevationFt + 3500,
        0,
        Math.min(perf.v.a - 5, perf.cruiseKtas * 0.85),
        cfg.aircraftId,
      );
      return {
        options: { perfId: cfg.aircraftId, start, weather: w, magVar: dep.magVar },
        departure: dep,
        destination: null,
        objectives: [
          turnThrough({
            id: "steep-left",
            text: "360° steep turn LEFT (40–50° bank), altitude ±100 ft",
            weight: 1.5,
            degrees: 340,
            label: "left steep turn",
            while: (s) => s.aircraft.bank <= -38 && s.aircraft.bank >= -55,
            altTolFt: 100,
          }),
          turnThrough({
            id: "steep-right",
            text: "360° steep turn RIGHT (40–50° bank), altitude ±100 ft",
            weight: 1.5,
            degrees: 340,
            label: "right steep turn",
            while: (s) => s.aircraft.bank >= 38 && s.aircraft.bank <= 55,
            altTolFt: 100,
          }),
          holdWithin({
            id: "climb",
            text: `Climb at VY ${perf.v.y} ±5 kt`,
            active: (s) => s.aircraft.vsFpm > 300 && Math.abs(s.aircraft.bank) < 10,
            deviation: (s) => s.indicated.iasKt - perf.v.y,
            tol: 5,
            minSec: 30,
            unit: "kt",
          }),
          holdWithin({
            id: "descent",
            text: "Descend at 500 fpm ±150",
            active: (s) => s.aircraft.vsFpm < -250 && Math.abs(s.aircraft.bank) < 10,
            deviation: (s) => s.aircraft.vsFpm + 500,
            tol: 150,
            minSec: 30,
            unit: "fpm",
          }),
          noStall(),
          avoid({
            id: "va",
            text: "Stay below VA in steep turns",
            weight: 0.5,
            bad: (s) => Math.abs(s.aircraft.bank) > 35 && s.indicated.iasKt > perf.v.a + 5,
            describe: (s) =>
              `${Math.round(s.indicated.iasKt)} KIAS in a steep turn (VA ${perf.v.a})`,
          }),
        ],
        landmarks: [],
        failures: [],
        instructions: [
          "Practice area: perform clearing turns, then steep turns left and right, a 1,000 ft climb and a 1,000 ft descent.",
        ],
        maxDurationSec: 1800,
      };
    },
  },
  {
    id: "vfr-slow-flight",
    title: "Slow Flight",
    category: "vfr",
    rules: "VFR",
    level: "intermediate",
    summary:
      "Maneuver at an airspeed just above the stall warning while holding altitude and heading.",
    briefing: [
      "Reduce power, extend full flaps below VFE, and pitch to hold altitude as speed decays.",
      "Target an airspeed a few knots above where the stall warning activates (ACS: no stall warning).",
      "Power controls altitude, pitch controls airspeed in this regime (behind the power curve).",
      "Hold altitude ±100 ft, heading ±10°, airspeed +10/−0 kt for at least 60 seconds.",
    ],
    safety: [
      ...commonSafety,
      "If the stall warning sounds: lower the nose slightly and add power.",
    ],
    maneuvers: ["Slow flight"],
    defaultAircraft: "c172",
    durationMin: 5,
    build(cfg) {
      const dep = requireAirport(cfg.airport ?? "KLVK");
      const w = weatherFrom("cavu", cfg);
      const perf = getPerf(cfg.aircraftId);
      const p = destinationPoint(dep.lat, dep.lon, 140, 7);
      const start = airStart(
        p.lat,
        p.lon,
        dep.elevationFt + 3500,
        90,
        perf.v.y + 15,
        cfg.aircraftId,
        0.55,
      );
      const target = perf.v.so + 8;
      let refAlt: number | null = null;
      let refHdg: number | null = null;
      const inSlow = (s: SimSnapshot) =>
        s.aircraft.flapsDeg > 15 && s.indicated.iasKt < perf.v.s1 + 5 && !s.aircraft.onGround;
      return {
        options: { perfId: cfg.aircraftId, start, weather: w, magVar: dep.magVar },
        departure: dep,
        destination: null,
        objectives: [
          holdWithin({
            id: "slow-speed",
            text: `Slow flight airspeed ${target} KIAS (+10/−0)`,
            weight: 1.5,
            active: inSlow,
            deviation: (s) =>
              s.indicated.iasKt < target
                ? (target - s.indicated.iasKt) * 3
                : Math.max(0, s.indicated.iasKt - target - 10),
            tol: 3,
            minSec: 60,
            unit: "kt",
          }),
          holdWithin({
            id: "slow-alt",
            text: "Hold altitude ±100 ft during slow flight",
            weight: 1.5,
            active: (s) => {
              if (!inSlow(s)) {
                refAlt = null;
                return false;
              }
              if (refAlt === null) refAlt = s.indicated.altFt;
              return true;
            },
            deviation: (s) => s.indicated.altFt - (refAlt ?? s.indicated.altFt),
            tol: 100,
            minSec: 60,
            unit: "ft",
          }),
          holdWithin({
            id: "slow-hdg",
            text: "Hold heading ±10°",
            active: (s) => {
              if (!inSlow(s)) {
                refHdg = null;
                return false;
              }
              if (refHdg === null) refHdg = s.aircraft.heading;
              return true;
            },
            deviation: (s) => norm180(s.aircraft.heading - (refHdg ?? s.aircraft.heading)),
            tol: 10,
            minSec: 60,
            unit: "°",
          }),
          avoid({
            id: "no-warn",
            text: "No stall warning",
            weight: 1,
            bad: (s) => s.aircraft.stallWarning,
            describe: () => "Stall warning activated",
            graceSec: 5,
          }),
        ],
        landmarks: [],
        failures: [],
        instructions: [
          "Practice area at 3,500 ft AGL: establish slow flight in the landing configuration and hold it for one minute.",
        ],
        maxDurationSec: 1200,
      };
    },
  },
  {
    id: "vfr-stall",
    title: "Power-Off Stall Recognition & Recovery",
    category: "vfr",
    rules: "VFR",
    level: "intermediate",
    summary: "Recognise the approach to a stall and recover with minimal altitude loss.",
    briefing: [
      "A stall happens when the wing exceeds its critical angle of attack — at ANY airspeed or attitude.",
      "Set up in the landing configuration, reduce power to idle, and slowly raise the nose to hold altitude.",
      "At the stall (or the warning, as directed): REDUCE angle of attack first (forward pressure), then level the wings, add full power, and return to a climb at VY.",
      "Keep the ball centered with rudder — an uncoordinated stall can lead to a spin.",
    ],
    safety: [
      ...commonSafety,
      "In a real aircraft, practise stalls only with an instructor and at a safe altitude (recover by 1,500 ft AGL or higher).",
    ],
    maneuvers: ["Power-off stall", "Stall recovery"],
    defaultAircraft: "c172",
    durationMin: 5,
    build(cfg) {
      const dep = requireAirport(cfg.airport ?? "KLVK");
      const w = weatherFrom("cavu", cfg);
      const perf = getPerf(cfg.aircraftId);
      const p = destinationPoint(dep.lat, dep.lon, 100, 7);
      const start = airStart(
        p.lat,
        p.lon,
        dep.elevationFt + 4500,
        270,
        perf.v.y + 10,
        cfg.aircraftId,
        0.5,
      );
      return {
        options: { perfId: cfg.aircraftId, start, weather: w, magVar: dep.magVar },
        departure: dep,
        destination: null,
        objectives: [
          reach({
            id: "config",
            text: "Landing configuration (flaps extended, idle power)",
            cond: (s) => s.aircraft.flapsDeg > 9 && s.controls.throttle < 0.15,
          }),
          stallRecovery({
            id: "recovery",
            text: "Recover with less than 250 ft altitude loss",
            maxLossFt: 250,
          }),
          avoid({
            id: "spin",
            text: "Coordinated recovery (no wing drop)",
            weight: 1,
            bad: (s) => s.aircraft.stalled && Math.abs(s.aircraft.bank) > 30,
            describe: (s) =>
              `Wing dropped to ${Math.round(s.aircraft.bank)}° bank during the stall`,
          }),
          reach({
            id: "vy-after",
            text: "Return to a VY climb after recovery",
            cond: (s) =>
              s.aircraft.vsFpm > 300 &&
              Math.abs(s.indicated.iasKt - perf.v.y) < 8 &&
              s.aircraft.flapsDeg < 15,
            sustainSec: 5,
          }),
          avoid({
            id: "floor",
            text: "Stay above 1,500 ft AGL",
            weight: 1,
            bad: (s) => s.aircraft.aglFt < 1500,
            describe: (s) => `Descended to ${Math.round(s.aircraft.aglFt)} ft AGL`,
          }),
        ],
        landmarks: [],
        failures: [],
        instructions: [
          "Practice area at 4,500 ft AGL: clearing turns, configure for landing, then perform a power-off stall and recover.",
        ],
        maxDurationSec: 1200,
      };
    },
  },
  {
    id: "vfr-ground-ref",
    title: "Turns Around a Point",
    category: "vfr",
    rules: "VFR",
    level: "intermediate",
    summary: "Fly a constant-radius circle around a ground reference while correcting for wind.",
    briefing: [
      "Pick the reference (the radio tower ahead), enter downwind at 1,000 ft AGL about ¼–½ nm from it.",
      "Steepest bank when the groundspeed is highest (downwind); shallowest bank when flying directly into the wind.",
      "Hold altitude ±100 ft and keep the radius roughly constant; maximum bank 45°.",
    ],
    safety: [
      ...commonSafety,
      "Keep your eyes outside — ground reference maneuvers are flown low, so look for obstacles and traffic.",
    ],
    maneuvers: ["Turns around a point"],
    defaultAircraft: "c172",
    durationMin: 6,
    build(cfg) {
      const dep = requireAirport(cfg.airport ?? "KLVK");
      const w = weatherFrom("cavu", cfg, {
        windDir: 270,
        windKt: 12,
        windAloftDir: 280,
        windAloftKt: 16,
      });
      const perf = getPerf(cfg.aircraftId);
      const pt = destinationPoint(dep.lat, dep.lon, 60, 5);
      const startP = destinationPoint(pt.lat, pt.lon, 180, 0.5);
      const ground = terrainElevationFt(pt.lat, pt.lon);
      const alt = Math.round((ground + 1000) / 50) * 50;
      const start = airStart(startP.lat, startP.lon, alt, 90, perf.v.y + 15, cfg.aircraftId, 0.55);
      let turned = 0;
      let last: number | null = null;
      const circle: Objective = {
        id: "circle",
        text: "Complete a 360° circle around the tower (radius 0.25–0.8 nm)",
        weight: 2,
        update(s) {
          const d = distanceNm(s.aircraft.lat, s.aircraft.lon, pt.lat, pt.lon);
          const brg = bearingDeg(pt.lat, pt.lon, s.aircraft.lat, s.aircraft.lon);
          if (d >= 0.2 && d <= 0.9) {
            if (last !== null) turned += Math.abs(norm180(brg - last));
            last = brg;
          } else {
            last = null;
            if (turned < 360) turned = 0;
          }
        },
        event() {},
        status() {
          const met = turned >= 360;
          return {
            score: Math.min(1, turned / 360),
            met,
            done: met,
            detail: `${Math.round(turned)}° around the reference`,
          };
        },
      };
      return {
        options: { perfId: cfg.aircraftId, start, weather: w, magVar: dep.magVar },
        departure: dep,
        destination: null,
        objectives: [
          circle,
          holdWithin({
            id: "alt",
            text: `Hold ${alt} ft ±100 (1,000 ft AGL)`,
            weight: 1.5,
            active: (s) => distanceNm(s.aircraft.lat, s.aircraft.lon, pt.lat, pt.lon) < 1.2,
            deviation: (s) => s.indicated.altFt - alt,
            tol: 100,
            minSec: 60,
            unit: "ft",
          }),
          avoid({
            id: "bank",
            text: "Bank never more than 45°",
            weight: 1,
            bad: (s) => Math.abs(s.aircraft.bank) > 47,
            describe: (s) => `Bank ${Math.round(Math.abs(s.aircraft.bank))}°`,
          }),
          noStall(),
        ],
        landmarks: [
          {
            label: "Radio tower (reference)",
            lat: pt.lat,
            lon: pt.lon,
            heightFt: 250,
            kind: "tower",
          },
        ],
        failures: [],
        instructions: [
          `Wind ${Math.round(magOf(dep, w.windDir))}° at ${w.windKt} kt. Fly a constant-radius turn around the red-lit radio tower at ${alt} ft.`,
        ],
        maxDurationSec: 1200,
      };
    },
  },
  {
    id: "vfr-xc",
    title: "Cross-Country: KPAO → KLVK",
    category: "vfr",
    rules: "VFR",
    level: "intermediate",
    summary:
      "Short VFR cross-country using pilotage, a checkpoint and the correct VFR cruising altitude.",
    briefing: [
      "Route: Palo Alto (KPAO) → Mission Peak checkpoint → Livermore (KLVK), about 25 nm.",
      "Magnetic course is roughly east-northeast (0–179°), so the VFR cruising altitude (14 CFR 91.159) is odd thousands + 500 ft: fly 3,500 ft MSL.",
      "Cross over the Mission Peak checkpoint (marked in the 3D world), then descend to enter the pattern at Livermore.",
      "The GPS flight plan is loaded to help, but practise pilotage: compare what you see with the chart.",
    ],
    safety: [
      ...commonSafety,
      "Real cross-countries require a full preflight briefing, airspace awareness (Class B shelves around SFO!), and fuel reserves per 14 CFR 91.151.",
    ],
    maneuvers: ["Cross-country", "Pilotage", "Landing at another airport"],
    defaultAircraft: "c172",
    durationMin: 20,
    build(cfg) {
      const dep = requireAirport("KPAO");
      const dest = requireAirport("KLVK");
      const w = weatherFrom("scattered", cfg, { cloudBaseFt: 5500 });
      const end = chooseEnd(dep, w, cfg.aircraftId);
      const peak = { lat: 37.5126, lon: -121.8808 };
      return {
        options: {
          perfId: cfg.aircraftId,
          start: runwayStart(dep, end),
          weather: w,
          magVar: dep.magVar,
        },
        departure: dep,
        destination: dest,
        objectives: [
          reach({
            id: "takeoff",
            text: "Depart Palo Alto",
            cond: (s) => !s.aircraft.onGround && s.aircraft.aglFt > 300,
          }),
          reach({
            id: "checkpoint",
            text: "Cross the Mission Peak checkpoint (within 1.5 nm)",
            cond: (s) => distanceNm(s.aircraft.lat, s.aircraft.lon, peak.lat, peak.lon) < 1.5,
          }),
          holdWithin({
            id: "cruise",
            text: "Cruise at 3,500 ft MSL ±150 (VFR hemispheric rule)",
            weight: 1.5,
            active: (s) =>
              s.aircraft.aglFt > 1500 &&
              Math.abs(s.aircraft.vsFpm) < 400 &&
              distanceNm(s.aircraft.lat, s.aircraft.lon, dest.lat, dest.lon) > 6,
            deviation: (s) => s.indicated.altFt - 3500,
            tol: 150,
            minSec: 90,
            unit: "ft",
          }),
          landing({ id: "land", text: "Land at Livermore (KLVK)", target: { airport: dest } }),
          noStall(),
        ],
        landmarks: [
          {
            label: "Mission Peak (checkpoint)",
            lat: peak.lat,
            lon: peak.lon,
            heightFt: 2517,
            kind: "point",
          },
        ],
        failures: [],
        instructions: [
          "VFR to Livermore via Mission Peak at 3,500. Remain clear of the SFO Class B and the San Jose Class C (simulated).",
        ],
        setup: (e) =>
          e.loadFlightPlan([
            { id: "KPAO", lat: dep.lat, lon: dep.lon, kind: "airport" },
            { id: "MSPK", label: "Mission Peak", lat: peak.lat, lon: peak.lon, kind: "user" },
            { id: "KLVK", lat: dest.lat, lon: dest.lon, kind: "airport" },
          ]),
        isComplete: (s) =>
          s.aircraft.onGround &&
          s.aircraft.gsKt < 2 &&
          distanceNm(s.aircraft.lat, s.aircraft.lon, dest.lat, dest.lon) < 2,
        maxDurationSec: 3600,
      };
    },
  },

  // ============================== IFR
  {
    id: "ifr-ils",
    title: "ILS Approach — KSFO 28R",
    category: "ifr",
    rules: "IFR",
    level: "intermediate",
    summary:
      "Intercept the localizer, capture the glideslope and fly the ILS to decision altitude in IMC.",
    briefing: [
      "NAV1 is tuned to the ILS 28R localizer (111.7 I-GWQ) and the CDI source is NAV1. You are being vectored on a 30° intercept heading at 3,000 ft.",
      "Localizer capture: as the CDI needle comes alive, turn to the final approach course. Glideslope: when the needle centers, reduce power and pitch for ~500 fpm (≈ groundspeed × 5).",
      "Decision Altitude: 200 ft above touchdown. At DA, land only with the required visual references (14 CFR 91.175); otherwise go missed.",
      "You may use the autopilot: HDG for the intercept, APR to arm LOC/GS.",
    ],
    safety: [
      ...commonSafety,
      "The approach geometry here is simplified. Real approaches must be flown from current published charts.",
    ],
    maneuvers: ["ILS approach", "Localizer intercept", "Glideslope tracking"],
    defaultAircraft: "c172",
    durationMin: 10,
    build(cfg) {
      const ap = requireAirport("KSFO");
      const end = getRunwayEnd(ap, "28R")!.end;
      const w = weatherFrom("ifr", cfg);
      const perf = getPerf(cfg.aircraftId);
      // Start 13 nm out, 3 nm south of the extended centerline, heading 30° off the course.
      const onCourse = destinationPoint(
        end.threshold.lat,
        end.threshold.lon,
        norm360(end.trueHeading + 180),
        13,
      );
      const p = destinationPoint(onCourse.lat, onCourse.lon, norm360(end.trueHeading - 90), 2.2);
      const start = airStart(
        p.lat,
        p.lon,
        3000,
        norm360(end.trueHeading + 30),
        Math.min(perf.v.no - 10, perf.v.y + 25),
        cfg.aircraftId,
        0.55,
      );
      const daMsl = ap.elevationFt + 200;
      const established = (s: SimSnapshot) =>
        s.nav.nav1.valid && Math.abs(s.nav.nav1.cdiDots) < 1.5;
      return {
        options: { perfId: cfg.aircraftId, start, weather: w, magVar: ap.magVar },
        departure: ap,
        destination: ap,
        objectives: [
          reach({
            id: "loc",
            text: "Intercept the localizer (needle within 1 dot)",
            cond: (s) => s.nav.nav1.valid && Math.abs(s.nav.nav1.cdiDots) < 1,
            sustainSec: 5,
          }),
          holdWithin({
            id: "loc-track",
            text: "Track the localizer within ±1 dot",
            weight: 1.5,
            active: (s) => established(s) && s.aircraft.aglFt > 200 && s.nav.nav1.gsValid,
            deviation: (s) => s.nav.nav1.cdiDots,
            tol: 1,
            minSec: 60,
            unit: "dots",
          }),
          holdWithin({
            id: "gs-track",
            text: "Track the glideslope within ±1 dot",
            weight: 1.5,
            active: (s) =>
              established(s) &&
              s.aircraft.aglFt > 200 &&
              s.nav.nav1.gsValid &&
              Math.abs(s.nav.nav1.gsDots) < 2.4 &&
              distanceNm(s.aircraft.lat, s.aircraft.lon, end.threshold.lat, end.threshold.lon) < 8,
            deviation: (s) => s.nav.nav1.gsDots,
            tol: 1,
            minSec: 60,
            unit: "dots",
          }),
          holdWithin({
            id: "speed",
            text: `Stable approach speed ${perf.v.y + 10} ±10 kt`,
            weight: 0.8,
            active: (s) => established(s) && s.aircraft.aglFt > 500,
            deviation: (s) => s.indicated.iasKt - (perf.v.y + 10),
            tol: 10,
            minSec: 60,
            unit: "kt",
          }),
          avoid({
            id: "da",
            text: "Do not descend below DA without the runway in sight",
            weight: 1,
            bad: (s) =>
              s.indicated.altFt < daMsl - 50 &&
              (s.weather.cloudBaseFt ?? 99999) < 200 &&
              s.aircraft.aglFt > 20,
            describe: () => "Descended below DA in IMC",
          }),
          landing({
            id: "land",
            text: "Land on runway 28R",
            target: { airport: ap, endId: "28R" },
          }),
        ],
        landmarks: [],
        failures: [],
        instructions: [
          `Simulated clearance: "Turn left heading ${magOf(ap, norm360(end.trueHeading + 30))}, maintain 3,000 until established on the localizer, cleared ILS runway 28R approach."`,
          `DA ${daMsl} ft MSL (200 ft HAT). Missed approach: climb runway heading to 3,000 ft.`,
        ],
        setup: (e) => {
          tuneIls(e, ap, end);
          e.setRadios({ hdgBug: magOf(ap, norm360(end.trueHeading + 30)), altBug: 3000 });
          e.activateApproach(
            { airport: ap.icao, runway: "28R", kind: "ILS", label: "ILS 28R (training)" },
            buildTrainingApproach(ap, end),
          );
        },
        isComplete: (s, t) => t > 20 && s.aircraft.onGround && s.aircraft.gsKt < 2,
        maxDurationSec: 1800,
      };
    },
  },
  {
    id: "ifr-rnav",
    title: "RNAV (GPS) Approach — KLVK 25R",
    category: "ifr",
    rules: "IFR",
    level: "intermediate",
    summary: "Fly a GPS approach with LPV-style vertical guidance from the IAF to the runway.",
    briefing: [
      "The GPS has a TRAINING RNAV approach loaded (IAF → IF → FAF → RW25R). CDI source is GPS.",
      "Watch the CDI scale tighten: ENR ±2 nm → TERM ±1 nm → APR ±0.3 nm (approach mode annunciates within 2 nm of the FAF).",
      "Descend on the vertical deviation (glidepath) indicator after the FAF. LPV minimums are a Decision Altitude; LNAV minimums are an MDA.",
      "This is a simulator-generated training procedure — not the published approach.",
    ],
    safety: [...commonSafety],
    maneuvers: ["RNAV (GPS) approach", "LPV glidepath"],
    defaultAircraft: "sr22",
    durationMin: 12,
    build(cfg) {
      const ap = requireAirport("KLVK");
      const end = getRunwayEnd(ap, "25R")!.end;
      const w = weatherFrom("ifr", cfg, { cloudBaseFt: 700 });
      const perf = getPerf(cfg.aircraftId);
      const wps = buildTrainingApproach(ap, end);
      const iaf = wps[0]!;
      const p = destinationPoint(iaf.lat, iaf.lon, norm360(end.trueHeading + 180), 3);
      const start = airStart(
        p.lat,
        p.lon,
        iaf.altFt ?? 3500,
        end.trueHeading,
        Math.min(perf.v.no - 10, perf.v.y + 25),
        cfg.aircraftId,
        0.55,
      );
      const faf = wps[2]!;
      return {
        options: { perfId: cfg.aircraftId, start, weather: w, magVar: ap.magVar },
        departure: ap,
        destination: ap,
        objectives: [
          holdWithin({
            id: "xtk",
            text: "Track the GPS course within ±½ scale",
            weight: 1.5,
            active: (s) => s.nav.gps.valid && !s.aircraft.onGround && s.aircraft.aglFt > 200,
            deviation: (s) => s.nav.gps.cdiDots,
            tol: 1.25,
            minSec: 90,
            unit: "dots",
          }),
          reach({
            id: "faf",
            text: `Cross the FAF at or above ${faf.altFt} ft`,
            cond: (s) =>
              distanceNm(s.aircraft.lat, s.aircraft.lon, faf.lat, faf.lon) < 0.6 &&
              s.indicated.altFt > (faf.altFt ?? 0) - 100,
          }),
          holdWithin({
            id: "vdev",
            text: "Follow the glidepath within ±1 dot",
            weight: 1.5,
            active: (s) => s.nav.gps.vdevValid && s.gps.mode === "APR" && s.aircraft.aglFt > 250,
            deviation: (s) => s.nav.gps.vdevDots,
            tol: 1,
            minSec: 45,
            unit: "dots",
          }),
          landing({
            id: "land",
            text: "Land on runway 25R",
            target: { airport: ap, endId: "25R" },
          }),
          noStall(),
        ],
        landmarks: [],
        failures: [],
        instructions: [
          `Simulated clearance: "Cleared RNAV runway 25R approach (training procedure). Cross ${iaf.id} at or above ${iaf.altFt}."`,
        ],
        setup: (e) => {
          e.loadFlightPlan([]);
          e.activateApproach(
            { airport: ap.icao, runway: "25R", kind: "RNAV", label: "RNAV 25R (training)" },
            wps,
          );
          e.setRadios({ cdiSource: "GPS", altBug: faf.altFt ?? 3000 });
        },
        isComplete: (s, t) => t > 20 && s.aircraft.onGround && s.aircraft.gsKt < 2,
        maxDurationSec: 2400,
      };
    },
  },
  {
    id: "ifr-hold",
    title: "Holding at OAK VORTAC",
    category: "ifr",
    rules: "IFR",
    level: "advanced",
    summary:
      "Enter and fly a standard (right-turn) hold on the OAK 090° radial with 1-minute legs.",
    briefing: [
      'Simulated clearance: "Hold east of the Oakland VORTAC on the 090 radial, right turns, maintain 4,000. Expect further clearance in 10 minutes."',
      "Inbound course is 270°. NAV1 is tuned to OAK 116.8 with the OBS set to 270.",
      "Choose the entry by your heading at the fix: direct, teardrop or parallel (AIM 5-3-8). Fly 1-minute inbound legs, adjusting the outbound leg for wind.",
      "Maximum holding speed for propeller aircraft up to 6,000 ft is 200 KIAS. Complete at least two circuits.",
    ],
    safety: [...commonSafety],
    maneuvers: ["Holding pattern", "VOR tracking"],
    defaultAircraft: "c172",
    durationMin: 15,
    build(cfg) {
      const ap = requireAirport("KOAK");
      const vor = getNavaid("OAK")!;
      const w = weatherFrom("mvfr", cfg, {
        cloudBaseFt: 1500,
        cloudTopsFt: 6000,
        cloudCover: "OVC",
      });
      const perf = getPerf(cfg.aircraftId);
      const p = destinationPoint(vor.lat, vor.lon, 200, 9);
      const start = airStart(
        p.lat,
        p.lon,
        4000,
        bearingDeg(p.lat, p.lon, vor.lat, vor.lon),
        Math.min(perf.cruiseKtas * 0.85, 140),
        cfg.aircraftId,
        0.6,
      );
      // Holding side: east of the fix (bearing from fix 0–180 roughly). Protected area ~ 6 nm.
      return {
        options: { perfId: cfg.aircraftId, start, weather: w, magVar: ap.magVar },
        departure: ap,
        destination: null,
        objectives: [
          fixPassages({
            id: "passes",
            text: "Cross the holding fix 3 times (entry + 2 circuits)",
            weight: 2,
            lat: vor.lat,
            lon: vor.lon,
            count: 3,
            radiusNm: 0.8,
          }),
          holdWithin({
            id: "alt",
            text: "Maintain 4,000 ft ±100",
            weight: 1.5,
            active: (s) => distanceNm(s.aircraft.lat, s.aircraft.lon, vor.lat, vor.lon) < 7,
            deviation: (s) => s.indicated.altFt - 4000,
            tol: 100,
            minSec: 120,
            unit: "ft",
          }),
          avoid({
            id: "protected",
            text: "Remain within holding airspace (≤ 6 nm, east side)",
            weight: 1,
            graceSec: 240,
            bad: (s) => {
              const d = distanceNm(s.aircraft.lat, s.aircraft.lon, vor.lat, vor.lon);
              const b = bearingDeg(vor.lat, vor.lon, s.aircraft.lat, s.aircraft.lon);
              return d > 6 || (d > 1.5 && Math.abs(norm180(b - (90 + vor.magVar))) > 100);
            },
            describe: () => "Left the holding protected airspace",
          }),
          avoid({
            id: "speed",
            text: "Holding speed ≤ 200 KIAS",
            weight: 0.5,
            bad: (s) => s.indicated.iasKt > 200,
            describe: (s) => `${Math.round(s.indicated.iasKt)} KIAS in the hold`,
          }),
        ],
        landmarks: [
          {
            label: "OAK VORTAC (holding fix)",
            lat: vor.lat,
            lon: vor.lon,
            heightFt: 60,
            kind: "fix",
          },
        ],
        failures: [],
        instructions: [
          "Hold east of OAK on the 090 radial, right turns, maintain 4,000 (simulated). Inbound course 270°.",
        ],
        setup: (e) => {
          e.setRadios({
            nav1: { active: 116.8, standby: 115.8, obs: 270 },
            cdiSource: "NAV1",
            altBug: 4000,
          });
          e.loadFlightPlan([{ id: "OAK", lat: vor.lat, lon: vor.lon, kind: "vor" }]);
          e.directTo({ id: "OAK", lat: vor.lat, lon: vor.lon, kind: "vor" });
        },
        maxDurationSec: 2400,
      };
    },
  },
  {
    id: "ifr-vor-intercept",
    title: "VOR Radial Intercept & Tracking",
    category: "ifr",
    rules: "IFR",
    level: "intermediate",
    summary: "Intercept the SJC 330° radial outbound and track it with wind correction.",
    briefing: [
      "NAV1: San Jose VOR/DME (114.1). Set the OBS to 330 — you want to fly outbound on the 330 radial (FROM indication).",
      "Turn to an intercept heading 30–45° to the course. When the needle starts to center, turn to the course.",
      "Bracket for the wind: if the needle drifts left, turn left 10° and hold the correction once it stops moving.",
    ],
    safety: [...commonSafety],
    maneuvers: ["VOR intercept", "VOR tracking", "Wind correction"],
    defaultAircraft: "c172",
    durationMin: 10,
    build(cfg) {
      const ap = requireAirport("KSJC");
      const vor = getNavaid("SJC")!;
      const w = weatherFrom("mvfr", cfg, {
        windDir: 250,
        windKt: 15,
        windAloftDir: 260,
        windAloftKt: 22,
      });
      const perf = getPerf(cfg.aircraftId);
      const p = destinationPoint(vor.lat, vor.lon, 300 + vor.magVar, 6);
      const start = airStart(
        p.lat,
        p.lon,
        4000,
        norm360(0 + vor.magVar),
        Math.min(perf.cruiseKtas * 0.85, 140),
        cfg.aircraftId,
        0.6,
      );
      return {
        options: { perfId: cfg.aircraftId, start, weather: w, magVar: ap.magVar },
        departure: ap,
        destination: null,
        objectives: [
          reach({
            id: "obs",
            text: "Set the OBS to 330",
            cond: (s) => Math.abs(norm180(s.radios.nav1.obs - 330)) < 3,
          }),
          reach({
            id: "intercept",
            text: "Intercept the 330 radial (needle within 1 dot, FROM)",
            cond: (s) =>
              s.nav.nav1.valid &&
              s.nav.nav1.toFrom === "FROM" &&
              Math.abs(norm180(s.radios.nav1.obs - 330)) < 3 &&
              Math.abs(s.nav.nav1.cdiDots) < 1,
            sustainSec: 5,
          }),
          holdWithin({
            id: "track",
            text: "Track the radial within ±1 dot",
            weight: 2,
            active: (s) =>
              s.nav.nav1.valid &&
              Math.abs(norm180(s.radios.nav1.obs - 330)) < 3 &&
              Math.abs(norm180(s.nav.nav1.radial - 330)) < 12,
            deviation: (s) => s.nav.nav1.cdiDots,
            tol: 1,
            minSec: 120,
            unit: "dots",
          }),
          holdWithin({
            id: "alt",
            text: "Maintain 4,000 ft ±100",
            active: (s) => !s.aircraft.onGround,
            deviation: (s) => s.indicated.altFt - 4000,
            tol: 100,
            minSec: 120,
            unit: "ft",
          }),
        ],
        landmarks: [],
        failures: [],
        instructions: [
          'Simulated: "Fly heading 360, intercept the San Jose 330 radial, proceed outbound, maintain 4,000."',
        ],
        setup: (e) =>
          e.setRadios({
            nav1: { active: 114.1, standby: 113.9, obs: 0 },
            cdiSource: "NAV1",
            hdgBug: 0,
            altBug: 4000,
          }),
        maxDurationSec: 1800,
      };
    },
  },
  {
    id: "ifr-dme-arc",
    title: "DME Arc — 10 DME SJC",
    category: "ifr",
    rules: "IFR",
    level: "advanced",
    summary: "Fly a 10-nm DME arc around the San Jose VOR/DME through 60° of arc.",
    briefing: [
      "You start on the SJC 270° radial at 10 DME heading north (360°), which puts you on a clockwise arc.",
      "Technique: keep the RMI/bearing to the station on the wingtip. Turn 10° toward the station each time the bearing moves 10° behind the wingtip; DME increasing → turn in, decreasing → turn out.",
      "Maintain 10 DME ±1 nm and 4,000 ft until crossing the 330 radial.",
    ],
    safety: [...commonSafety],
    maneuvers: ["DME arc"],
    defaultAircraft: "c172",
    durationMin: 10,
    build(cfg) {
      const ap = requireAirport("KSJC");
      const vor = getNavaid("SJC")!;
      const w = weatherFrom("mvfr", cfg);
      const perf = getPerf(cfg.aircraftId);
      const p = destinationPoint(vor.lat, vor.lon, norm360(270 + vor.magVar), 10);
      const start = airStart(
        p.lat,
        p.lon,
        4000,
        norm360(0 + vor.magVar),
        Math.min(perf.cruiseKtas * 0.8, 120),
        cfg.aircraftId,
        0.55,
      );
      let arc = 0;
      let last: number | null = null;
      const arcObj: Objective = {
        id: "arc",
        text: "Fly 60° of arc (270 → 330 radial) at 10 DME ±1",
        weight: 2,
        update(s) {
          const d = distanceNm(s.aircraft.lat, s.aircraft.lon, vor.lat, vor.lon);
          const r = norm360(
            bearingDeg(vor.lat, vor.lon, s.aircraft.lat, s.aircraft.lon) - vor.magVar,
          );
          if (Math.abs(d - 10) <= 1) {
            if (last !== null) {
              const delta = norm180(r - last);
              if (delta > 0) arc += delta;
            }
            last = r;
          } else last = null;
        },
        event() {},
        status() {
          const met = arc >= 60;
          return {
            score: Math.min(1, arc / 60),
            met,
            done: met,
            detail: `${Math.round(arc)}° of arc flown within 10 ±1 DME`,
          };
        },
      };
      return {
        options: { perfId: cfg.aircraftId, start, weather: w, magVar: ap.magVar },
        departure: ap,
        destination: null,
        objectives: [
          arcObj,
          holdWithin({
            id: "dme",
            text: "Hold 10 DME ±1 nm",
            weight: 1.5,
            active: () => true,
            deviation: (s) => distanceNm(s.aircraft.lat, s.aircraft.lon, vor.lat, vor.lon) - 10,
            tol: 1,
            minSec: 120,
            unit: "nm",
          }),
          holdWithin({
            id: "alt",
            text: "Maintain 4,000 ft ±100",
            active: () => true,
            deviation: (s) => s.indicated.altFt - 4000,
            tol: 100,
            minSec: 120,
            unit: "ft",
          }),
        ],
        landmarks: [],
        failures: [],
        instructions: [
          'Simulated: "Proceed via the San Jose 10 DME arc clockwise to the 330 radial, maintain 4,000."',
        ],
        setup: (e) =>
          e.setRadios({
            nav1: { active: 114.1, standby: 113.9, obs: 330 },
            cdiSource: "NAV1",
            hdgBug: 0,
            altBug: 4000,
          }),
        isComplete: () => arc >= 60,
        maxDurationSec: 1800,
      };
    },
  },
  {
    id: "ifr-missed",
    title: "Missed Approach — ILS 28R to minimums",
    category: "ifr",
    rules: "IFR",
    level: "advanced",
    summary: "Fly the ILS in fog below minimums and execute the missed approach at DA.",
    briefing: [
      "Weather is below minimums (fog, ceiling 150 ft). Expect to go missed.",
      "At DA (213 ft MSL) without the runway environment in sight: full power, pitch for climb, positive rate → gear up (if retractable), flaps up in stages.",
      "Missed approach (training): climb straight ahead to 3,000 ft.",
    ],
    safety: [
      ...commonSafety,
      "Never descend below DA/MDA without the required visual references (14 CFR 91.175).",
    ],
    maneuvers: ["ILS approach", "Missed approach"],
    defaultAircraft: "c172",
    durationMin: 10,
    build(cfg) {
      const ap = requireAirport("KSFO");
      const end = getRunwayEnd(ap, "28R")!.end;
      const w = weatherFrom("lifr", cfg, { cloudBaseFt: 150, visibilitySm: 0.25 });
      const start = finalStart(ap, end, 7, cfg.aircraftId, 0);
      const daMsl = ap.elevationFt + 200;
      let reachedDa = false;
      return {
        options: { perfId: cfg.aircraftId, start, weather: w, magVar: ap.magVar },
        departure: ap,
        destination: null,
        objectives: [
          holdWithin({
            id: "gs",
            text: "Fly the glideslope within ±1 dot to DA",
            weight: 1,
            active: (s) => s.nav.nav1.gsValid && s.indicated.altFt > daMsl && !reachedDa,
            deviation: (s) => s.nav.nav1.gsDots,
            tol: 1,
            minSec: 45,
            unit: "dots",
          }),
          avoid({
            id: "below-da",
            text: "Never descend more than 50 ft below DA",
            weight: 2,
            bad: (s) => {
              if (s.indicated.altFt <= daMsl + 20) reachedDa = true;
              return s.indicated.altFt < daMsl - 50;
            },
            describe: (s) => `Descended to ${Math.round(s.indicated.altFt)} ft MSL (DA ${daMsl})`,
          }),
          reach({
            id: "go",
            text: "Initiate the missed approach at DA (positive climb)",
            weight: 1.5,
            cond: (s) => reachedDa && s.aircraft.vsFpm > 300,
          }),
          reach({
            id: "clean",
            text: "Clean up: flaps retracted during the climb",
            cond: (s) => reachedDa && s.aircraft.flapsDeg < 1 && s.aircraft.vsFpm > 0,
          }),
          reach({
            id: "alt",
            text: "Climb to 3,000 ft",
            cond: (s) => reachedDa && s.indicated.altFt > 2900,
          }),
        ],
        landmarks: [],
        failures: [],
        instructions: [
          `ILS 28R, DA ${daMsl} ft. Missed approach: climb straight ahead to 3,000 (training procedure).`,
        ],
        setup: (e) => {
          tuneIls(e, ap, end);
          e.setRadios({ altBug: 3000 });
          e.activateApproach(
            { airport: ap.icao, runway: "28R", kind: "ILS", label: "ILS 28R (training)" },
            buildTrainingApproach(ap, end),
          );
        },
        isComplete: (s) => reachedDa && s.indicated.altFt > 2950,
        maxDurationSec: 1200,
      };
    },
  },
  {
    id: "ifr-departure",
    title: "Instrument Departure — KSFO 28L",
    category: "ifr",
    rules: "IFR",
    level: "intermediate",
    summary:
      "Take off into low IMC and fly an assigned departure: runway heading, turn, climb to 4,000.",
    briefing: [
      'Simulated clearance: "Fly runway heading until 1,000 ft, then turn left heading 260, climb and maintain 4,000."',
      "Ceiling 600 ft — you will enter the clouds shortly after takeoff. Transition to the instruments immediately (attitude indicator first).",
      "Maintain a climb gradient of at least 200 ft/nm (standard), coordinate the turn at standard rate.",
    ],
    safety: [...commonSafety],
    maneuvers: ["Instrument takeoff", "Instrument departure"],
    defaultAircraft: "c172",
    durationMin: 8,
    build(cfg) {
      const ap = requireAirport("KSFO");
      const end = getRunwayEnd(ap, "28L")!.end;
      const w = weatherFrom("ifr", cfg);
      const hdg260True = norm360(260 + ap.magVar);
      let turned = false;
      return {
        options: {
          perfId: cfg.aircraftId,
          start: runwayStart(ap, end),
          weather: w,
          magVar: ap.magVar,
        },
        departure: ap,
        destination: null,
        objectives: [
          holdWithin({
            id: "rwy-hdg",
            text: "Runway heading ±10° until 1,000 ft",
            active: (s) => !s.aircraft.onGround && s.indicated.altFt < 1000 && !turned,
            deviation: (s) => norm180(s.aircraft.heading - end.trueHeading),
            tol: 10,
            minSec: 20,
            unit: "°",
          }),
          avoid({
            id: "early-turn",
            text: "No turn before 1,000 ft",
            weight: 0.8,
            bad: (s) =>
              !s.aircraft.onGround &&
              s.indicated.altFt < 900 &&
              Math.abs(norm180(s.aircraft.heading - end.trueHeading)) > 25,
            describe: (s) => `Turned at ${Math.round(s.indicated.altFt)} ft`,
          }),
          reach({
            id: "turn",
            text: "Turn to heading 260 after 1,000 ft",
            cond: (s) => {
              const ok =
                s.indicated.altFt > 950 && Math.abs(norm180(s.aircraft.heading - hdg260True)) < 10;
              if (ok) turned = true;
              return ok;
            },
          }),
          holdWithin({
            id: "level",
            text: "Level at 4,000 ft ±100",
            weight: 1.5,
            active: (s) => s.indicated.altFt > 3700,
            deviation: (s) => s.indicated.altFt - 4000,
            tol: 100,
            minSec: 45,
            unit: "ft",
          }),
          holdWithin({
            id: "coord",
            text: "Coordinated flight",
            weight: 0.5,
            active: (s) => !s.aircraft.onGround,
            deviation: (s) => s.aircraft.slip * 10,
            tol: 3,
            minSec: 60,
            unit: "ball/10",
          }),
          noStall(),
        ],
        landmarks: [],
        failures: [],
        instructions: [
          "Fly runway heading until 1,000, then turn left heading 260, climb and maintain 4,000 (simulated).",
        ],
        setup: (e) => e.setRadios({ hdgBug: 260, altBug: 4000 }),
        maxDurationSec: 1200,
      };
    },
  },
  {
    id: "ifr-enroute",
    title: "En-Route GPS Navigation — KSFO → KMRY",
    category: "ifr",
    rules: "IFR",
    level: "intermediate",
    summary:
      "Fly a GPS flight plan via OSI and SNS at 6,000 ft, tracking each leg and sequencing waypoints.",
    briefing: [
      "The GPS flight plan KSFO → OSI → SNS → KMRY is loaded. CDI source GPS. Use NAV mode on the autopilot or hand-fly the magenta line.",
      "Even-thousand altitudes are used westbound and odd eastbound under IFR (91.179) — this southbound-ish route (magnetic course 180–359) uses 6,000.",
      "Monitor the leg sequencing and cross-check with the OSI VOR on NAV2.",
    ],
    safety: [...commonSafety],
    maneuvers: ["En-route navigation", "GPS"],
    defaultAircraft: "c172",
    durationMin: 25,
    build(cfg) {
      const ap = requireAirport("KSFO");
      const dest = requireAirport("KMRY");
      const osi = getNavaid("OSI")!;
      const sns = getNavaid("SNS")!;
      const w = weatherFrom("mvfr", cfg, {
        cloudBaseFt: 2500,
        cloudTopsFt: 5000,
        cloudCover: "OVC",
      });
      const perf = getPerf(cfg.aircraftId);
      const p = destinationPoint(ap.lat, ap.lon, 200, 4);
      const start = airStart(
        p.lat,
        p.lon,
        6000,
        bearingDeg(p.lat, p.lon, osi.lat, osi.lon),
        Math.min(perf.cruiseKtas * 0.9, 160),
        cfg.aircraftId,
        0.7,
      );
      return {
        options: { perfId: cfg.aircraftId, start, weather: w, magVar: ap.magVar },
        departure: ap,
        destination: dest,
        objectives: [
          holdWithin({
            id: "xtk",
            text: "Stay within ±1 nm of the GPS course",
            weight: 2,
            active: (s) => s.nav.gps.valid,
            deviation: (s) => s.nav.gps.xtkNm,
            tol: 1,
            minSec: 180,
            unit: "nm",
          }),
          holdWithin({
            id: "alt",
            text: "Maintain 6,000 ft ±100",
            weight: 1.5,
            active: () => true,
            deviation: (s) => s.indicated.altFt - 6000,
            tol: 100,
            minSec: 180,
            unit: "ft",
          }),
          reach({
            id: "sns",
            text: "Cross SNS VORTAC",
            cond: (s) => distanceNm(s.aircraft.lat, s.aircraft.lon, sns.lat, sns.lon) < 1.5,
          }),
        ],
        landmarks: [],
        failures: [],
        instructions: ['Simulated: "Cleared to Monterey via OSI, SNS, direct. Maintain 6,000."'],
        setup: (e) => {
          e.loadFlightPlan([
            { id: "KSFO", lat: ap.lat, lon: ap.lon, kind: "airport" },
            { id: "OSI", lat: osi.lat, lon: osi.lon, kind: "vor" },
            { id: "SNS", lat: sns.lat, lon: sns.lon, kind: "vor" },
            { id: "KMRY", lat: dest.lat, lon: dest.lon, kind: "airport" },
          ]);
          e.setRadios({
            cdiSource: "GPS",
            altBug: 6000,
            nav2: { active: 113.9, standby: 117.3, obs: 160 },
          });
        },
        isComplete: (s) => distanceNm(s.aircraft.lat, s.aircraft.lon, sns.lat, sns.lon) < 1.5,
        maxDurationSec: 3600,
      };
    },
  },

  // ============================== EMERGENCY
  {
    id: "emg-engine-failure",
    title: "Engine Failure — Glide & Forced Landing",
    category: "emergency",
    rules: "VFR",
    level: "intermediate",
    summary: "The engine fails at 3,000 ft near Half Moon Bay. Establish best glide and land.",
    briefing: [
      "Flow: AIRSPEED (best glide, pitch for VG immediately), BEST PLACE TO LAND (Half Moon Bay is within gliding distance), CHECKLIST (fuel selector, mixture rich, carb heat, mag check / restart attempt), then communicate (121.5 / squawk 7700) if time permits.",
      "Glide ratio is roughly 9:1 for a light single — about 1.5 nm per 1,000 ft above the ground.",
      "Plan to arrive high: you can always lose altitude with flaps or a slip, but you cannot gain it back.",
    ],
    safety: [
      "In a real emergency, fly the airplane first. This training aid does not replace emergency procedures in your POH or practice with a CFI.",
    ],
    maneuvers: ["Engine failure", "Best glide", "Forced landing"],
    defaultAircraft: "c172",
    aircraft: ["c152", "c172", "pa28", "da40", "sr20", "sr22", "be36"],
    durationMin: 6,
    build(cfg) {
      const ap = requireAirport("KHAF");
      const w = weatherFrom("cavu", cfg, { windDir: 300, windKt: 8 });
      const perf = getPerf(cfg.aircraftId);
      const p = destinationPoint(ap.lat, ap.lon, 80, 3.5);
      const start = airStart(p.lat, p.lon, 3000, 180, perf.v.y + 20, cfg.aircraftId, 0.65);
      return {
        options: { perfId: cfg.aircraftId, start, weather: w, magVar: ap.magVar },
        departure: ap,
        destination: ap,
        objectives: [
          respondWithin({
            id: "vg",
            text: `Best glide ${perf.v.g} KIAS within 10 s`,
            weight: 1.5,
            trigger: (s) => !s.aircraft.engineRunning,
            response: (s) => Math.abs(s.indicated.iasKt - perf.v.g) < 6,
            withinSec: 10,
          }),
          holdWithin({
            id: "glide",
            text: `Maintain best glide ±5 kt`,
            weight: 1,
            active: (s) => !s.aircraft.engineRunning && s.aircraft.aglFt > 400,
            deviation: (s) => s.indicated.iasKt - perf.v.g,
            tol: 5,
            minSec: 40,
            unit: "kt",
          }),
          respondWithin({
            id: "7700",
            text: "Squawk 7700",
            weight: 0.5,
            trigger: (s) => !s.aircraft.engineRunning,
            response: (s) => s.radios.transponder.code === "7700",
            withinSec: 90,
          }),
          landing({ id: "land", text: "Land at Half Moon Bay (KHAF)", target: { airport: ap } }),
        ],
        landmarks: [],
        failures: [
          { at: 15, failure: "engine", message: "ENGINE FAILURE — the engine has stopped." },
        ],
        instructions: ["Cruising near Half Moon Bay at 3,000 ft. Be ready for anything."],
        setup: (e) => e.loadFlightPlan([{ id: "KHAF", lat: ap.lat, lon: ap.lon, kind: "airport" }]),
        isComplete: (s, t) => t > 20 && s.aircraft.onGround && s.aircraft.gsKt < 2,
        maxDurationSec: 1200,
      };
    },
  },
  {
    id: "emg-electrical",
    title: "Electrical Failure at Night",
    category: "emergency",
    rules: "VFR",
    level: "intermediate",
    summary:
      "The alternator fails at night. Shed electrical load and land before the battery is exhausted.",
    briefing: [
      "Indications: LOW VOLTS annunciation and a discharging ammeter.",
      "Checklist (generic): check the ALT field breaker, cycle the alternator switch once; if it stays failed, turn OFF non-essential loads (landing light, taxi light, pitot heat, extra avionics).",
      "Land as soon as practical — the battery alone powers the radios and lights for a limited time.",
    ],
    safety: [
      "Follow the electrical failure checklist in your POH. This is a simplified training scenario.",
    ],
    maneuvers: ["Electrical failure", "Night VFR", "Precautionary landing"],
    defaultAircraft: "c172",
    durationMin: 10,
    build(cfg) {
      const ap = requireAirport("KLVK");
      const w = weatherFrom("cavu", cfg, { timeOfDay: cfg.timeOfDay ?? 21.5 });
      const perf = getPerf(cfg.aircraftId);
      const p = destinationPoint(ap.lat, ap.lon, 250, 10);
      const start = airStart(
        p.lat,
        p.lon,
        3500,
        bearingDeg(p.lat, p.lon, ap.lat, ap.lon),
        perf.cruiseKtas * 0.85,
        cfg.aircraftId,
        0.65,
      );
      return {
        options: {
          perfId: cfg.aircraftId,
          start,
          weather: { ...w, timeOfDay: cfg.timeOfDay ?? 21.5 },
          magVar: ap.magVar,
        },
        departure: ap,
        destination: ap,
        objectives: [
          respondWithin({
            id: "shed",
            text: "Shed load within 60 s (landing light, taxi light, pitot heat OFF)",
            weight: 1.5,
            trigger: (s) => s.failures.alternator,
            response: (s) =>
              !s.controls.lights.landing && !s.controls.lights.taxi && !s.controls.pitotHeat,
            withinSec: 60,
          }),
          holdWithin({
            id: "alt",
            text: "Maintain altitude ±200 ft while troubleshooting",
            active: (s) => s.failures.alternator && s.aircraft.aglFt > 1500,
            deviation: (s) => s.indicated.altFt - 3500,
            tol: 200,
            minSec: 30,
            unit: "ft",
          }),
          landing({ id: "land", text: "Land at Livermore", target: { airport: ap } }),
        ],
        landmarks: [],
        failures: [
          { at: 25, failure: "alternator", message: "LOW VOLTS — the alternator has failed." },
        ],
        instructions: ["Night VFR return to Livermore at 3,500 ft (simulated)."],
        setup: (e) => {
          e.setControls({
            lights: {
              nav: true,
              beacon: true,
              strobe: true,
              landing: true,
              taxi: true,
              panel: true,
            },
            pitotHeat: true,
          });
          e.loadFlightPlan([{ id: "KLVK", lat: ap.lat, lon: ap.lon, kind: "airport" }]);
        },
        isComplete: (s, t) => t > 30 && s.aircraft.onGround && s.aircraft.gsKt < 2,
        maxDurationSec: 1800,
      };
    },
  },
  {
    id: "emg-vacuum",
    title: "Vacuum Failure in IMC (Partial Panel)",
    category: "emergency",
    rules: "IFR",
    level: "advanced",
    summary: "Your attitude and heading indicators fail in the clouds. Fly partial panel.",
    briefing: [
      "Steam-gauge aircraft: the vacuum-driven attitude indicator and heading indicator will slowly become unreliable.",
      "Recognise it early: the AI and HI disagree with the turn coordinator, altimeter, VSI and compass.",
      "Cover the failed instruments mentally. Use the turn coordinator for bank (wings level = wings on the level marks), the altimeter/VSI/airspeed for pitch, and the magnetic compass for heading (timed turns at standard rate: 3°/s).",
    ],
    safety: [
      "Partial-panel flight is an emergency. Tell ATC, ask for no-gyro vectors, and plan the simplest possible approach.",
    ],
    maneuvers: ["Partial panel", "Instrument failure"],
    defaultAircraft: "pa28",
    aircraft: ["pa28", "c152"],
    durationMin: 6,
    build(cfg) {
      const ap = requireAirport("KSJC");
      const w = weatherFrom("ifr", cfg, { cloudBaseFt: 1200, cloudTopsFt: 9000, turbulence: 1 });
      const perf = getPerf(cfg.aircraftId);
      const p = destinationPoint(ap.lat, ap.lon, 200, 12);
      const start = airStart(
        p.lat,
        p.lon,
        5000,
        norm360(330 + ap.magVar),
        perf.cruiseKtas * 0.85,
        cfg.aircraftId,
        0.65,
      );
      const hdgTrue = norm360(330 + ap.magVar);
      return {
        options: { perfId: cfg.aircraftId, start, weather: w, magVar: ap.magVar },
        departure: ap,
        destination: null,
        objectives: [
          holdWithin({
            id: "hdg",
            text: "Maintain heading 330 ±15° (use the compass)",
            weight: 1.5,
            active: (s) => s.failures.vacuum,
            deviation: (s) => norm180(s.aircraft.heading - hdgTrue),
            tol: 15,
            minSec: 120,
            unit: "°",
          }),
          holdWithin({
            id: "alt",
            text: "Maintain 5,000 ft ±200",
            weight: 1.5,
            active: (s) => s.failures.vacuum,
            deviation: (s) => s.indicated.altFt - 5000,
            tol: 200,
            minSec: 120,
            unit: "ft",
          }),
          avoid({
            id: "upset",
            text: "No unusual attitude (bank > 30° or pitch beyond ±15°)",
            weight: 1.5,
            bad: (s) =>
              s.failures.vacuum &&
              (Math.abs(s.aircraft.bank) > 30 || Math.abs(s.aircraft.pitch) > 15),
            describe: (s) =>
              `Unusual attitude: bank ${Math.round(s.aircraft.bank)}°, pitch ${Math.round(s.aircraft.pitch)}°`,
          }),
        ],
        landmarks: [],
        failures: [{ at: 40, failure: "vacuum", message: "" }], // silent: recognising the failure is part of the task
        instructions: ['Simulated: "Maintain 5,000, fly heading 330." You are in solid IMC.'],
        setup: (e) => e.setRadios({ hdgBug: 330, altBug: 5000 }),
        isComplete: (_s, t) => t > 260,
        maxDurationSec: 900,
      };
    },
  },
  {
    id: "emg-radio",
    title: "Lost Communications (IFR)",
    category: "emergency",
    rules: "IFR",
    level: "advanced",
    summary: "Two-way radio communication fails in IMC. Apply 14 CFR 91.185.",
    briefing: [
      "Squawk 7600.",
      "Route — AVE-F: Assigned, Vectored (direct to the fix you were vectored toward), Expected, Filed.",
      'Altitude — the HIGHEST of: assigned (M), MEA, or expected (E) — "MEA" memory aid.',
      "In this scenario your assigned altitude is 6,000 and you were cleared direct SNS. Continue direct SNS at 6,000.",
    ],
    safety: [
      "Real lost-comms procedures depend on the full clearance, route and approach — study 14 CFR 91.185 and AIM 6-4-1.",
    ],
    maneuvers: ["Lost communications"],
    defaultAircraft: "c172",
    durationMin: 8,
    build(cfg) {
      const ap = requireAirport("KSJC");
      const sns = getNavaid("SNS")!;
      const w = weatherFrom("ifr", cfg, { cloudBaseFt: 1500, cloudTopsFt: 9000 });
      const perf = getPerf(cfg.aircraftId);
      const p = destinationPoint(ap.lat, ap.lon, 150, 6);
      const start = airStart(
        p.lat,
        p.lon,
        6000,
        bearingDeg(p.lat, p.lon, sns.lat, sns.lon),
        perf.cruiseKtas * 0.85,
        cfg.aircraftId,
        0.68,
      );
      return {
        options: { perfId: cfg.aircraftId, start, weather: w, magVar: ap.magVar },
        departure: ap,
        destination: null,
        objectives: [
          respondWithin({
            id: "7600",
            text: "Squawk 7600 within 60 s",
            weight: 1.5,
            trigger: (s) => s.failures.radios,
            response: (s) => s.radios.transponder.code === "7600",
            withinSec: 60,
          }),
          holdWithin({
            id: "alt",
            text: "Maintain assigned 6,000 ft ±100",
            weight: 1.5,
            active: (s) => s.failures.radios,
            deviation: (s) => s.indicated.altFt - 6000,
            tol: 100,
            minSec: 120,
            unit: "ft",
          }),
          holdWithin({
            id: "route",
            text: "Continue direct SNS (±1 nm)",
            weight: 1.5,
            active: (s) => s.failures.radios && s.nav.gps.valid,
            deviation: (s) => s.nav.gps.xtkNm,
            tol: 1,
            minSec: 120,
            unit: "nm",
          }),
        ],
        landmarks: [],
        failures: [
          {
            at: 30,
            failure: "radios",
            message: "COM radios have failed — no transmit or receive.",
          },
        ],
        instructions: ['Simulated clearance: "Cleared direct Salinas, maintain 6,000."'],
        setup: (e) => {
          e.loadFlightPlan([{ id: "SNS", lat: sns.lat, lon: sns.lon, kind: "vor" }]);
          e.directTo({ id: "SNS", lat: sns.lat, lon: sns.lon, kind: "vor" });
          e.setRadios({ cdiSource: "GPS", altBug: 6000 });
        },
        isComplete: (_s, t) => t > 240,
        maxDurationSec: 1200,
      };
    },
  },
  {
    id: "emg-weather",
    title: "VFR into Deteriorating Weather",
    category: "emergency",
    rules: "VFR",
    level: "intermediate",
    summary: "Clouds lower ahead on a VFR flight. Execute a 180° turn and divert.",
    briefing: [
      "Continued VFR flight into IMC is a leading cause of fatal accidents.",
      "When visibility deteriorates: maintain control, make a standard-rate 180° turn (bank ≤ 20°) back to where the weather was good.",
      "Then divert to Hayward (KHWD) and land.",
    ],
    safety: [
      "The best decision is made on the ground: get a full weather briefing and set personal minimums.",
    ],
    maneuvers: ["180° turn", "Diversion"],
    defaultAircraft: "c172",
    durationMin: 10,
    build(cfg) {
      const ap = requireAirport("KHWD");
      const w = weatherFrom("scattered", cfg, { cloudBaseFt: 3500, visibilitySm: 10 });
      const perf = getPerf(cfg.aircraftId);
      const p = destinationPoint(ap.lat, ap.lon, 120, 8);
      const hdg = norm360(120 + 0);
      const start = airStart(p.lat, p.lon, 2500, hdg, perf.cruiseKtas * 0.85, cfg.aircraftId, 0.65);
      let triggerHdg: number | null = null;
      return {
        options: { perfId: cfg.aircraftId, start, weather: w, magVar: ap.magVar },
        departure: ap,
        destination: ap,
        objectives: [
          respondWithin({
            id: "turn",
            text: "Complete a 180° turn within 2 minutes",
            weight: 2,
            trigger: (s) => {
              const t = s.weather.visibilitySm < 3;
              if (t && triggerHdg === null) triggerHdg = s.aircraft.heading;
              return t;
            },
            response: (s) =>
              triggerHdg !== null && Math.abs(norm180(s.aircraft.heading - triggerHdg)) > 165,
            withinSec: 120,
          }),
          avoid({
            id: "bank",
            text: "Shallow bank (≤ 30°) in poor visibility",
            weight: 1,
            bad: (s) => s.weather.visibilitySm < 3 && Math.abs(s.aircraft.bank) > 30,
            describe: (s) => `Banked ${Math.round(Math.abs(s.aircraft.bank))}° in IMC`,
          }),
          holdWithin({
            id: "alt",
            text: "Maintain altitude ±200 ft in the turn",
            active: (s) => s.weather.visibilitySm < 3,
            deviation: (s) => s.indicated.altFt - 2500,
            tol: 200,
            minSec: 30,
            unit: "ft",
          }),
          landing({
            id: "land",
            text: "Divert and land at Hayward (KHWD)",
            target: { airport: ap },
          }),
        ],
        landmarks: [],
        failures: [
          {
            at: 35,
            weather: {
              visibilitySm: 1.5,
              cloudBaseFt: 1800,
              cloudCover: "OVC",
              precipitation: "rain",
            },
            message: "Visibility is dropping rapidly in rain ahead.",
          },
        ],
        instructions: ["VFR southeast-bound at 2,500 ft. Weather ahead is uncertain."],
        setup: (e) => e.loadFlightPlan([{ id: "KHWD", lat: ap.lat, lon: ap.lon, kind: "airport" }]),
        isComplete: (s, t) => t > 40 && s.aircraft.onGround && s.aircraft.gsKt < 2,
        maxDurationSec: 1800,
      };
    },
  },

  // ============================== CHECKRIDE
  {
    id: "checkride-private",
    title: "Private Pilot Checkride — Flight Portion",
    category: "checkride",
    rules: "VFR",
    level: "advanced",
    summary:
      "Takeoff, steep turns, slow flight, power-off stall and a landing — graded to ACS-style tolerances.",
    briefing: [
      'Simulated examiner: "Depart runway 25R, climb to 3,500. In the practice area, show me steep turns in both directions, slow flight, and a power-off stall. Then return for a normal landing."',
      "Tolerances (Private ACS): altitude ±100 ft, heading ±10°, airspeed ±10 kt, steep turns 45° ±5°.",
    ],
    safety: [
      ...commonSafety,
      "This is NOT an FAA practical test and does not count toward any certificate.",
    ],
    maneuvers: [
      "Normal takeoff",
      "Steep turns",
      "Slow flight",
      "Power-off stall",
      "Normal landing",
    ],
    defaultAircraft: "c172",
    aircraft: ["c152", "c172", "pa28", "da40", "sr20"],
    durationMin: 25,
    build(cfg) {
      const ap = requireAirport("KLVK");
      const w = weatherFrom("cavu", cfg, { windDir: 250, windKt: 8 });
      const end = chooseEnd(ap, w, cfg.aircraftId, "25R");
      const perf = getPerf(cfg.aircraftId);
      return {
        options: {
          perfId: cfg.aircraftId,
          start: runwayStart(ap, end),
          weather: w,
          magVar: ap.magVar,
        },
        departure: ap,
        destination: ap,
        objectives: [
          holdWithin({
            id: "vy",
            text: `Takeoff & climb at VY ${perf.v.y} ±10`,
            active: (s) =>
              s.aircraft.aglFt > 200 && s.aircraft.aglFt < 1500 && s.aircraft.vsFpm > 100,
            deviation: (s) => s.indicated.iasKt - perf.v.y,
            tol: 10,
            minSec: 30,
            unit: "kt",
          }),
          turnThrough({
            id: "steep-l",
            text: "Steep turn left (45° ±5, alt ±100)",
            weight: 1.5,
            degrees: 340,
            label: "left steep turn",
            while: (s) => s.aircraft.bank <= -40 && s.aircraft.bank >= -50,
            altTolFt: 100,
          }),
          turnThrough({
            id: "steep-r",
            text: "Steep turn right (45° ±5, alt ±100)",
            weight: 1.5,
            degrees: 340,
            label: "right steep turn",
            while: (s) => s.aircraft.bank >= 40 && s.aircraft.bank <= 50,
            altTolFt: 100,
          }),
          reach({
            id: "slow",
            text: "Slow flight for 30 s (flaps extended, no stall warning)",
            weight: 1.5,
            sustainSec: 30,
            cond: (s) =>
              s.aircraft.flapsDeg > 15 &&
              s.indicated.iasKt < perf.v.s1 + 5 &&
              !s.aircraft.stallWarning &&
              Math.abs(s.aircraft.vsFpm) < 300 &&
              s.aircraft.aglFt > 1500,
          }),
          stallRecovery({
            id: "stall",
            text: "Power-off stall recovery (< 250 ft loss)",
            maxLossFt: 250,
          }),
          landing({ id: "land", text: "Normal landing at Livermore", target: { airport: ap } }),
          noOverspeed(),
        ],
        landmarks: [],
        failures: [],
        instructions: [
          "Depart, climb to 3,500 in the practice area east of Livermore, complete the maneuvers in any order, then return and land (simulated examiner).",
        ],
        isComplete: (s, t) => t > 120 && s.aircraft.onGround && s.aircraft.gsKt < 2,
        maxDurationSec: 3600,
      };
    },
  },
  {
    id: "checkride-instrument",
    title: "Instrument Rating Checkride — Approach",
    category: "checkride",
    rules: "IFR",
    level: "advanced",
    summary: "Precision approach to DA graded to Instrument ACS tolerances, followed by a landing.",
    briefing: [
      'Simulated examiner: "Fly the ILS 28R at San Francisco. Hand-fly it — no autopilot below 1,000 ft."',
      "Tolerances (Instrument ACS): ¾-scale deflection or less on localizer and glideslope, airspeed ±10 kt, altitudes ±100 ft before the FAF.",
    ],
    safety: [
      ...commonSafety,
      "This is NOT an FAA practical test and does not count toward any rating.",
    ],
    maneuvers: ["ILS approach", "Instrument landing"],
    defaultAircraft: "c172",
    durationMin: 12,
    build(cfg) {
      const base = SCENARIOS.find((s) => s.id === "ifr-ils")!.build(cfg);
      const ap = base.departure;
      return {
        ...base,
        objectives: [
          ...base.objectives,
          avoid({
            id: "no-ap",
            text: "Hand-flown below 1,000 ft AGL (autopilot off)",
            weight: 1,
            bad: (s) => s.ap.engaged && s.aircraft.aglFt < 1000 && !s.aircraft.onGround,
            describe: () => "Autopilot engaged below 1,000 ft",
          }),
          holdWithin({
            id: "alt-before-faf",
            text: "3,000 ft ±100 until glideslope intercept",
            weight: 1,
            active: (s) => !s.nav.nav1.gsValid || s.nav.nav1.gsDots > 1.5,
            deviation: (s) => s.indicated.altFt - 3000,
            tol: 100,
            minSec: 30,
            unit: "ft",
          }),
        ],
        instructions: [...base.instructions, `Examiner: hand-fly below 1,000 ft (${ap.icao}).`],
      };
    },
  },
];

export function getScenario(id: string | undefined): ScenarioDef | undefined {
  return SCENARIOS.find((s) => s.id === id);
}

export const CATEGORY_LABEL: Record<ScenarioCategory, string> = {
  free: "Free Flight",
  vfr: "VFR Training",
  ifr: "IFR Training",
  emergency: "Emergency Training",
  checkride: "Checkride",
};

/** Combine objective statuses into a 0–100 score and feedback list. */
export function scoreObjectives(objs: Objective[], crashed: string) {
  let total = 0;
  let w = 0;
  const results = objs.map((o) => {
    const st = o.status();
    total += st.score * o.weight;
    w += o.weight;
    return { id: o.id, text: o.text, met: st.met, detail: st.detail, score: st.score };
  });
  let score = w > 0 ? (total / w) * 100 : 0;
  if (crashed) score = Math.min(score, 10);
  return { score, results };
}
