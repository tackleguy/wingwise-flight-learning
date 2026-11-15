/**
 * Works out WHERE and HOW the aircraft starts for a spawn request:
 * on a runway, on short final, in the air, or parked beside the runway with the engine off.
 */
import type { Airport, Runway, WorldData } from "@/data/world-data";
import type { Aircraft } from "@/aircraft/catalog";
import { AIRCRAFT } from "./defaults";
import { FT_PER_NM, destination, norm360 } from "./math";
import type { Environment, SpawnRequest } from "./types";

export interface SpawnPlan {
  request: SpawnRequest;
  lat: number;
  lon: number;
  headingTrue: number;
  onGround: boolean;
  /** Airborne starts: either a fixed altitude … */
  altFtMsl: number | null;
  /** … or a height above the ground at `refLat/refLon` (e.g. the runway threshold). */
  heightAboveRefFt: number | null;
  refLat: number;
  refLon: number;
  kias: number;
  /** Flight-path angle for airborne starts, degrees (−3 on final). */
  gammaDeg: number;
  flapIndex: number;
  engineRunning: boolean;
  parkingBrake: boolean;
  airportIdent: string | null;
  runwayEndId: string | null;
  runway: Runway | null;
  endIndex: 0 | 1 | null;
  /** Published elevation to fall back on if terrain data cannot be loaded, ft. */
  fallbackElevFt: number;
  note: string;
}

/** Pick the runway end a pilot would normally use: into the wind, preferring long hard runways. */
export function bestRunwayEnd(airport: Airport, windDirTrue: number, windKt: number): { runway: Runway; endIndex: 0 | 1 } | null {
  let best: { runway: Runway; endIndex: 0 | 1 } | null = null;
  let bestScore = -Infinity;
  for (const runway of airport.runways) {
    for (const endIndex of [0, 1] as const) {
      const end = runway.ends[endIndex];
      const headwind = windKt * Math.cos(((windDirTrue - end.headingTrue) * Math.PI) / 180);
      const score = (windKt >= 3 ? headwind : 0) + runway.lengthFt / 1500 + (runway.paved ? 3 : 0) + (runway.lighted ? 0.5 : 0) - endIndex * 0.01;
      if (score > bestScore) {
        bestScore = score;
        best = { runway, endIndex };
      }
    }
  }
  return best;
}

export function findRunwayEnd(airport: Airport, endId: string): { runway: Runway; endIndex: 0 | 1 } | null {
  const want = endId.trim().toUpperCase();
  for (const runway of airport.runways) {
    for (const endIndex of [0, 1] as const) if (runway.ends[endIndex].id.toUpperCase() === want) return { runway, endIndex };
  }
  return null;
}

const surfaceWind = (env: Environment) => env.wind[0] ?? { altFtMsl: 0, dirTrue: 0, kt: 0 };

export function planSpawn(req: SpawnRequest, data: WorldData, env: Environment, aircraft?: Aircraft): SpawnPlan {
  // Speeds and flaps for the aircraft being flown (the Cessna 172P values when none is given).
  const cruiseKt = aircraft?.cruiseKt ?? 100;
  const approachKt = aircraft?.v.approach ?? AIRCRAFT.v.approach;
  const lastFlap = Math.max(0, (aircraft?.flapDetentsDeg.length ?? AIRCRAFT.flapDetentsDeg.length) - 1);
  const finalFlap = Math.min(lastFlap, aircraft?.finalFlapIndex ?? 3);
  const airport = req.airportIdent ? data.getAirport(req.airportIdent) : undefined;
  const wind = surfaceWind(env);
  const base = {
    request: req,
    gammaDeg: 0,
    flapIndex: 0,
    parkingBrake: false,
    runway: null as Runway | null,
    endIndex: null as 0 | 1 | null,
    runwayEndId: null as string | null,
    airportIdent: airport?.ident ?? null,
    note: "",
  };

  // ---- explicit position in the air
  if (req.kind === "air" && req.lat !== undefined && req.lon !== undefined) {
    return {
      ...base,
      lat: req.lat,
      lon: req.lon,
      headingTrue: norm360(req.headingTrue ?? 0),
      onGround: false,
      altFtMsl: req.altFtMsl ?? null,
      heightAboveRefFt: req.altFtMsl === undefined ? 3000 : null,
      refLat: req.lat,
      refLon: req.lon,
      kias: req.kias ?? cruiseKt,
      engineRunning: req.engineRunning ?? true,
      fallbackElevFt: 0,
    };
  }

  if (!airport) {
    // Nothing usable was given: start in the air over the equator rather than failing.
    const lat = req.lat ?? 0;
    const lon = req.lon ?? 0;
    return {
      ...base,
      lat,
      lon,
      headingTrue: norm360(req.headingTrue ?? 0),
      onGround: false,
      altFtMsl: req.altFtMsl ?? null,
      heightAboveRefFt: req.altFtMsl === undefined ? 3000 : null,
      refLat: lat,
      refLon: lon,
      kias: req.kias ?? cruiseKt,
      engineRunning: true,
      fallbackElevFt: 0,
      note: req.airportIdent ? `Airport "${req.airportIdent}" was not found — starting in the air instead.` : "",
    };
  }

  const elev = airport.elevFt ?? 0;
  const pick = (req.runwayEndId ? findRunwayEnd(airport, req.runwayEndId) : null) ?? bestRunwayEnd(airport, wind.dirTrue, wind.kt);

  // ---- in the air over the airport
  if (req.kind === "air") {
    const hdg = norm360(req.headingTrue ?? pick?.runway.ends[pick.endIndex].headingTrue ?? 0);
    return {
      ...base,
      lat: airport.lat,
      lon: airport.lon,
      headingTrue: hdg,
      onGround: false,
      altFtMsl: req.altFtMsl ?? null,
      heightAboveRefFt: req.altFtMsl === undefined ? 3000 : null,
      refLat: airport.lat,
      refLon: airport.lon,
      kias: req.kias ?? cruiseKt,
      engineRunning: req.engineRunning ?? true,
      fallbackElevFt: elev,
      runway: pick?.runway ?? null,
      endIndex: pick?.endIndex ?? null,
      runwayEndId: pick ? pick.runway.ends[pick.endIndex].id : null,
    };
  }

  // ---- airports without runway data
  if (!pick) {
    const onGround = req.kind !== "final";
    return {
      ...base,
      lat: airport.lat,
      lon: airport.lon,
      headingTrue: norm360(req.headingTrue ?? 0),
      onGround,
      altFtMsl: null,
      heightAboveRefFt: onGround ? null : 1000,
      refLat: airport.lat,
      refLon: airport.lon,
      kias: req.kias ?? (onGround ? 0 : aircraft && aircraft.id !== "c172p" ? Math.round(approachKt * 1.2) : 80),
      engineRunning: req.engineRunning ?? req.kind !== "ramp",
      parkingBrake: onGround,
      fallbackElevFt: elev,
      note: "The open airport database has no runway information for this airport, so you start at its reference point.",
    };
  }

  const { runway, endIndex } = pick;
  const end = runway.ends[endIndex];
  const common = { ...base, runway, endIndex, runwayEndId: end.id, fallbackElevFt: end.elevFt ?? elev };
  const note = runway.estimated ? "This runway's exact position is not in the open database — it is drawn in an estimated position." : "";

  if (req.kind === "final") {
    const nm = Math.max(0.3, Math.min(10, req.finalNm ?? 1.5));
    const threshold = destination(end.lat, end.lon, end.headingTrue, end.displacedFt / FT_PER_NM);
    const start = destination(threshold.lat, threshold.lon, end.headingTrue + 180, nm);
    return {
      ...common,
      lat: start.lat,
      lon: start.lon,
      headingTrue: end.headingTrue,
      onGround: false,
      altFtMsl: null,
      // 3° glide path (318 ft per nm) crossing the threshold at about 50 ft.
      heightAboveRefFt: 50 + nm * 318,
      refLat: threshold.lat,
      refLon: threshold.lon,
      kias: req.kias ?? approachKt,
      gammaDeg: -3,
      flapIndex: nm <= 3 ? finalFlap : Math.min(1, finalFlap),
      engineRunning: req.engineRunning ?? true,
      note,
    };
  }

  if (req.kind === "ramp") {
    // No parking positions exist in the open data: hold beside the runway start, engine off.
    const onRunway = destination(end.lat, end.lon, end.headingTrue, 200 / FT_PER_NM);
    const side = destination(onRunway.lat, onRunway.lon, end.headingTrue + 90, (runway.widthFt / 2 + 130) / FT_PER_NM);
    return {
      ...common,
      lat: side.lat,
      lon: side.lon,
      headingTrue: norm360(end.headingTrue - 90),
      onGround: true,
      altFtMsl: null,
      heightAboveRefFt: null,
      refLat: side.lat,
      refLon: side.lon,
      kias: 0,
      engineRunning: req.engineRunning ?? false,
      parkingBrake: true,
      note: note || "Parked beside the runway with the engine off. (The open data has no parking stands.)",
    };
  }

  // ---- lined up on the runway, ready for take-off
  const pos = destination(end.lat, end.lon, end.headingTrue, Math.min(150, runway.lengthFt * 0.05) / FT_PER_NM);
  return {
    ...common,
    lat: pos.lat,
    lon: pos.lon,
    headingTrue: end.headingTrue,
    onGround: true,
    altFtMsl: null,
    heightAboveRefFt: null,
    refLat: pos.lat,
    refLon: pos.lon,
    kias: 0,
    engineRunning: req.engineRunning ?? true,
    parkingBrake: true,
    note,
  };
}
