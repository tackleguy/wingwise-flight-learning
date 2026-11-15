/**
 * Camera arithmetic that does not need the 3D engine (so it can be tested in Node):
 * field-of-view rules, look limits, smoothing, the "where does the tower stand" choice, and the
 * small prediction that keeps the picture smooth between physics steps.
 */
import { D2R, FT_PER_NM, M_PER_FT, R2D, angleDiff, clamp, destination, distanceNm, localOffsetM, norm360 } from "@/core/math";
import type { SimState } from "@/core/types";
import type { Airport, Runway, WorldData } from "@/data/world-data";
import type { TowerSite } from "./api";

/** Physics step of the simulator core, seconds. */
export const PHYSICS_DT = 1 / 120;

// ---------------------------------------------------------------- field of view

/**
 * Vertical field of view (degrees) that gives the wanted horizontal field of view on a screen of
 * this shape, kept inside sensible limits so tall phone screens and very wide monitors both work.
 */
export function verticalFovDeg(horizontalFovDeg: number, aspect: number, minV = 38, maxV = 82): number {
  const v = 2 * Math.atan(Math.tan((horizontalFovDeg * D2R) / 2) / Math.max(0.2, aspect)) * R2D;
  return clamp(v, Math.min(minV, maxV), maxV);
}

/** CesiumJS wants the field of view of the LONGER screen side, in radians. */
export function cesiumFovRad(verticalDeg: number, aspect: number): number {
  const v = verticalDeg * D2R;
  return aspect <= 1 ? v : 2 * Math.atan(Math.tan(v / 2) * aspect);
}

/**
 * Off-centre projection: where the camera's line of sight lands on the screen, as a normalised
 * height (+1 = top edge, 0 = centre, −1 = bottom edge), for a wanted fraction from the top.
 */
export const axisNdcForFraction = (fractionFromTop: number) => 1 - 2 * fractionFromTop;

/**
 * Screen position (fraction of the height from the top) of a direction `elevationDeg` above (+)
 * or below (−) the camera's line of sight, for an off-centre projection.
 */
export function screenFractionOfElevation(elevationDeg: number, verticalFov: number, axisNdc: number): number {
  const ndc = axisNdc + Math.tan(elevationDeg * D2R) / Math.tan((verticalFov * D2R) / 2);
  return (1 - ndc) / 2;
}

// ---------------------------------------------------------------- smoothing

/** Move `current` toward `target` with time constant `tau` seconds (frame-rate independent). */
export function approach(current: number, target: number, dt: number, tau: number): number {
  if (tau <= 0 || dt <= 0) return dt <= 0 ? current : target;
  return current + (target - current) * (1 - Math.exp(-dt / tau));
}

/** Same for a heading in degrees (takes the short way round). */
export function approachAngle(current: number, target: number, dt: number, tau: number): number {
  return norm360(current + angleDiff(target, current) * (tau <= 0 ? 1 : 1 - Math.exp(-Math.max(0, dt) / tau)));
}

/** Ease in and out, 0…1. */
export const smootherstep = (t: number) => {
  const x = clamp(t, 0, 1);
  return x * x * x * (x * (x * 6 - 15) + 10);
};

// ---------------------------------------------------------------- head look

export const LOOK_LIMITS = { yaw: 150, pitchUp: 60, pitchDown: 40 } as const;

export function clampLook(yawDeg: number, pitchDeg: number): { yaw: number; pitch: number } {
  return { yaw: clamp(yawDeg, -LOOK_LIMITS.yaw, LOOK_LIMITS.yaw), pitch: clamp(pitchDeg, -LOOK_LIMITS.pitchDown, LOOK_LIMITS.pitchUp) };
}

// ---------------------------------------------------------------- smooth motion between physics steps

export interface RenderPose {
  lat: number;
  lon: number;
  altMslFt: number;
  headingTrue: number;
  pitch: number;
  roll: number;
}

/**
 * The physics advances in fixed 1/120 s steps, the screen in frames of varying length — so the
 * newest physics state is up to one step older than "now", by a different amount every frame.
 * Drawn as it is, the world would move in slightly uneven steps (a visible judder near the
 * ground). This keeps track of that leftover time so the aircraft and the camera can be drawn
 * where they are NOW (see `predictPose`).
 */
export class StepLead {
  private lead = 0;
  private lastSimTime = Number.NaN;

  /** Call once per drawn frame. Returns the time to predict ahead, seconds (0 … one physics step). */
  update(simTime: number, dtReal: number, timeScale: number, running: boolean): number {
    const advanced = simTime - this.lastSimTime;
    this.lastSimTime = simTime;
    if (!running || !Number.isFinite(advanced) || advanced < 0 || dtReal > 0.2) {
      // paused, just respawned, or a long stall (the core drops time then): nothing to predict
      this.lead = 0;
      return 0;
    }
    this.lead = clamp(this.lead + dtReal * timeScale - advanced, 0, PHYSICS_DT);
    return this.lead;
  }

  reset(): void {
    this.lead = 0;
    this.lastSimTime = Number.NaN;
  }
}

/** Where the aircraft is `lead` seconds after the latest physics state (straight-line prediction). */
export function predictPose(s: SimState, lead: number, out: RenderPose): RenderPose {
  const nmPerSec = lead / 3600;
  out.lat = s.lat + (s.vNorthKt * nmPerSec) / 60;
  out.lon = s.lon + (s.vEastKt * nmPerSec) / 60 / Math.max(0.05, Math.cos(s.lat * D2R));
  out.altMslFt = s.altMslFt + (s.vsFpm / 60) * lead;
  const cr = Math.cos(s.roll * D2R);
  const sr = Math.sin(s.roll * D2R);
  out.headingTrue = s.headingTrue + s.turnRate * lead;
  out.pitch = s.pitch + (s.pitchRate * cr - s.yawRate * sr) * lead;
  out.roll = s.roll + s.rollRate * lead;
  return out;
}

// ---------------------------------------------------------------- tower position

const TOWER_HEIGHT_AGL_FT = 80;
/** Sideways distances from the runway centreline tried in turn, metres (+ = the side of the airport reference point). */
const TOWER_OFFSETS_M = [180, -180, 280, -280, 110, -110];
const CLEAR_OF_OTHER_RUNWAYS_M = 75;
/** On long runways the tower stands at most this far along from the threshold in use, metres. */
const TOWER_MAX_FROM_THRESHOLD_M = 800;

/** Distance from a point to a runway's centreline segment, metres. */
function distanceToRunwayM(lat: number, lon: number, rw: Runway): number {
  const a = rw.ends[0];
  const b = rw.ends[1];
  const p = localOffsetM(a.lat, a.lon, lat, lon);
  const q = localOffsetM(a.lat, a.lon, b.lat, b.lon);
  const len2 = q.east * q.east + q.north * q.north || 1;
  const t = clamp((p.east * q.east + p.north * q.north) / len2, 0, 1);
  return Math.hypot(p.east - q.east * t, p.north - q.north * t);
}

function longestRunway(airport: Airport): Runway | null {
  let best: Runway | null = null;
  for (const rw of airport.runways) if (!best || rw.lengthFt > best.lengthFt) best = rw;
  return best;
}

/**
 * Choose where the tower camera stands for an aircraft at (lat, lon).
 * The open airport data (OurAirports) has no control-tower positions, so the point is invented:
 * beside the middle of the runway in use (or the longest runway of the nearest airport), on the
 * side where the airport reference point is, clear of the airport's other runways.
 */
export function pickTowerSite(data: WorldData, lat: number, lon: number, preferred?: { airportIdent?: string | null; runwayEndId?: string | null } | null, maxNm = 40): TowerSite | null {
  let airport: Airport | undefined;
  if (preferred?.airportIdent) {
    const a = data.getAirport(preferred.airportIdent);
    if (a && a.runways.length && distanceNm(lat, lon, a.lat, a.lon) < 12) airport = a;
  }
  if (!airport) {
    const near = data.nearestAirport(lat, lon, { withRunwaysOnly: true, maxNm });
    if (near) airport = data.airportByIndex(near.index);
  }
  if (!airport) return null;
  let runway: Runway | null = null;
  if (preferred?.runwayEndId && preferred.airportIdent && airport.ident === data.getAirport(preferred.airportIdent)?.ident) {
    const want = preferred.runwayEndId.trim().toUpperCase();
    runway = airport.runways.find((r) => r.ends[0].id.toUpperCase() === want || r.ends[1].id.toUpperCase() === want) ?? null;
  }
  runway ??= longestRunway(airport);
  if (!runway) return null;

  const a = runway.ends[0];
  const b = runway.ends[1];
  // Beside the middle of the runway — but on a long runway a light aircraft is down and stopped long before the
  // middle, so stay within TOWER_MAX_FROM_THRESHOLD_M of the end in use (when it is known).
  let t = 0.5;
  const lengthM = runway.lengthFt * M_PER_FT;
  if (preferred?.runwayEndId && lengthM > 2 * TOWER_MAX_FROM_THRESHOLD_M) {
    const want = preferred.runwayEndId.trim().toUpperCase();
    if (a.id.toUpperCase() === want) t = TOWER_MAX_FROM_THRESHOLD_M / lengthM;
    else if (b.id.toUpperCase() === want) t = 1 - TOWER_MAX_FROM_THRESHOLD_M / lengthM;
  }
  const midLat = a.lat + (b.lat - a.lat) * t;
  const midLon = a.lon + angleDiff(b.lon, a.lon) * t;
  const hdg = a.headingTrue;
  // which side of the runway is the airport reference point on? (+1 = right of the direction of end 0)
  const arp = localOffsetM(midLat, midLon, airport.lat, airport.lon);
  const cross = arp.east * Math.cos(hdg * D2R) - arp.north * Math.sin(hdg * D2R);
  const arpSide = Math.abs(cross) < 30 ? 1 : Math.sign(cross);
  let chosen: { lat: number; lon: number } | null = null;
  for (const off of TOWER_OFFSETS_M) {
    const side = Math.sign(off) * arpSide;
    const p = destination(midLat, midLon, norm360(hdg + 90 * side), (Math.abs(off) + (runway.widthFt * M_PER_FT) / 2) / (FT_PER_NM * M_PER_FT));
    let clear = true;
    for (const other of airport.runways) {
      if (other.index !== runway.index && distanceToRunwayM(p.lat, p.lon, other) < CLEAR_OF_OTHER_RUNWAYS_M) {
        clear = false;
        break;
      }
    }
    if (clear) {
      chosen = p;
      break;
    }
    chosen ??= p;
  }
  if (!chosen) return null;
  return {
    lat: chosen.lat,
    lon: chosen.lon,
    heightAglFt: TOWER_HEIGHT_AGL_FT,
    airportIdent: airport.ident,
    airportName: airport.name,
    runwayName: runway.name,
    fallbackElevFt: airport.elevFt ?? a.elevFt ?? 0,
    synthetic: true,
  };
}

/** A plain observer on the ground beside the aircraft, for when no airport is anywhere near. */
export function observerSite(lat: number, lon: number, headingTrue: number, fallbackElevFt: number): TowerSite {
  const p = destination(lat, lon, norm360(headingTrue + 60), 500 / (FT_PER_NM * M_PER_FT));
  return { lat: p.lat, lon: p.lon, heightAglFt: 30, airportIdent: null, airportName: "", runwayName: "", fallbackElevFt, synthetic: true };
}

/**
 * Field of view (horizontal, degrees) that keeps an object of `sizeM` at `distanceM` at about
 * `screenShare` of the screen width.
 */
export function autoZoomFovDeg(distanceM: number, sizeM: number, screenShare: number, minDeg: number, maxDeg: number): number {
  const fov = 2 * Math.atan(sizeM / screenShare / 2 / Math.max(1, distanceM)) * R2D;
  return clamp(fov, minDeg, maxDeg);
}

// ---------------------------------------------------------------- landing gear

/** How far a wheel may be pushed up (+) or hang down (−) from where the model was built, metres. */
export const GEAR_TRAVEL = { up: 0.16, down: 0.1 } as const;

/**
 * Where a wheel should be drawn: `heightM` is how far the lowest point of the tyre would be above (+) or
 * below (−) the ground if the gear were rigid. Near the ground the wheel is moved so the tyre just touches
 * (the leg gives, like the real spring steel and oleo strut); in the air it hangs a little lower.
 * Returns the upward shift of the wheel relative to the airframe, metres.
 */
export function gearShiftM(heightM: number, hangM: number): number {
  if (heightM > hangM) return -hangM; // clear of the ground: fully extended
  return clamp(-heightM, -GEAR_TRAVEL.down, GEAR_TRAVEL.up);
}
