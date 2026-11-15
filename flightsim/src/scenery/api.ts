/**
 * Public interface of the scenery module (airports: runways with markings and lights, PAPI,
 * beacon, windsock, optional OpenStreetMap buildings).
 */
import type { SimModule } from "@/core/sim";

/** Numbers for the developer page, tests and a performance read-out. */
export interface SceneryStats {
  /** Airports whose geometry is finished and on screen. */
  airports: number;
  /** Airports waiting for terrain heights or still being built. */
  pending: number;
  runways: number;
  lights: number;
  windsocks: number;
  /** Building tiles drawn (0 when buildings are switched off). */
  buildingTiles: number;
  buildings: number;
  /** Time the module spent in its last frame() call, milliseconds. */
  lastFrameMs: number;
  /** Longest frame() call since the last resetStats(), milliseconds. */
  worstFrameMs: number;
  /** Longest single piece of airport-building work since the last resetStats(), milliseconds. */
  worstStepMs: number;
  /** Runway lights brightness 0 (off, daylight) … 1 (night). */
  lightLevel: number;
}

/** What the nearest precision approach path indicator (PAPI) shows to an observer. */
export interface PapiReport {
  airportIdent: string;
  runwayEndId: string;
  /** Angle of the observer above the horizon as seen from the PAPI, degrees. */
  angleDeg: number;
  /** The four lights from the one farthest from the runway to the one nearest it: "W" white or "R" red. */
  pattern: string;
  whiteCount: number;
  distanceNm: number;
  /** Plain-language meaning: "too high", "slightly high", "on path", "slightly low", "too low". */
  meaning: string;
}

export interface SceneryApi extends SimModule {
  readonly name: "scenery";
  /** Build airports around a position immediately (called after a spawn; also happens automatically as the aircraft moves). */
  refresh(lat: number, lon: number): void;
  /** Number of airports currently built (debug / tests). */
  readonly activeAirports: number;
  /**
   * How bright unlit runway surfaces are at night compared with daylight (default 0.3, the value
   * CesiumJS uses for the night side of the globe). Lower it if the sky module makes the night
   * landscape darker, so runways do not glow against the terrain.
   */
  nightBrightness: number;
  /** Counters and timings (debug / performance read-out). */
  readonly stats: SceneryStats;
  /** Reset the worst-frame timer in `stats`. */
  resetStats(): void;
  /**
   * What the nearest built PAPI shows from a position (default: the aircraft). Null when no PAPI is
   * built within 8 nm. PAPI positions are SYNTHETIC — see docs/notes/scenery.md.
   */
  papiReport(lat?: number, lon?: number, altFtMsl?: number): PapiReport | null;
}

/** Text the UI can show next to anything that mentions the PAPI or the airport lighting. */
export const SCENERY_SYNTHETIC_NOTE =
  "Runway lights, approach lights, the PAPI, the beacon and the windsock are placed in representative positions: the open airport data does not say where the real ones are.";

/** Attribution that must be shown when OpenStreetMap buildings are enabled. */
export const BUILDINGS_ATTRIBUTION = 'Buildings: <a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> © <a href="https://www.openmaptiles.org/" target="_blank" rel="noopener">OpenMapTiles</a> Data from <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>';
