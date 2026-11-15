/**
 * Views module — public contract: the aircraft 3D model and all cameras.
 * Create it with `createViews(world)` from "@/views" and register it with `sim.use(...)`.
 */
import type { SimModule } from "@/core/sim";

export type ViewMode = "cockpit" | "chase" | "tower" | "free";

export interface ViewsApi extends SimModule {
  readonly name: "views";
  readonly mode: ViewMode;
  setMode(mode: ViewMode): void;
  /** Cycle cockpit -> chase -> tower -> free. */
  next(): void;
  /** Look around / orbit: add yaw and pitch in degrees (mouse drag, touch drag, hat switch, keys). */
  look(dYawDeg: number, dPitchDeg: number): void;
  /** Zoom in (<1) or out (>1): field of view in cockpit/tower, distance in chase/free. */
  zoom(factor: number): void;
  resetLook(): void;
  /** Attach pointer handling (drag to look, wheel/pinch to zoom, double-tap to reset) to the element that shows the 3D view. Returns a detach function. */
  attach(el: HTMLElement): () => void;
  /** The cockpit panel covers the lower part of the screen: tell the view where the horizon should sit (fraction of screen height from the top, e.g. 0.3) so the outside view stays usable. */
  setCockpitHorizonFraction(fraction: number): void;
  /** True once the aircraft model has loaded. */
  readonly ready: boolean;
  /** Subscribe to mode changes (UI buttons). */
  subscribe(fn: () => void): () => void;
}

/** Where the tower camera stands. The open airport data has no tower positions, so this point is made up (synthetic). */
export interface TowerSite {
  lat: number;
  lon: number;
  /** Camera height above the ground, ft. */
  heightAglFt: number;
  /** Airport the tower belongs to, or null for a plain observer on the ground when no airport is near. */
  airportIdent: string | null;
  airportName: string;
  runwayName: string;
  /** Published airport elevation to fall back on until terrain has loaded, ft. */
  fallbackElevFt: number;
  /** Always true: the position is invented, not surveyed. */
  synthetic: true;
}

/** Extras offered by the SkyReady views module on top of the contract above. */
export interface ViewsModule extends ViewsApi {
  /**
   * Free view: false (default) = the camera orbits the aircraft; true = the camera stays where it
   * is in the world and watches the aircraft fly by.
   */
  readonly freeStay: boolean;
  setFreeStay(stay: boolean): void;
  /**
   * Switch to the free view and park the camera beside the flight path ahead of the aircraft
   * (about `secondsAhead` of flying time), so you can watch yourself fly past or land.
   */
  flyby(secondsAhead?: number): void;
  /** Where the tower camera currently stands (null until the tower view has been used). */
  readonly tower: TowerSite | null;
  /**
   * Cockpit view: how far below the horizon (degrees, head level) the top of the glare shield
   * appears — useful for lining a 2D instrument panel up with the 3D cockpit.
   */
  readonly glareShieldDepressionDeg: number;
  /**
   * Fraction of the screen height (from the top) where a direction `degBelowHorizon` below the
   * pilot's level line of sight appears in the cockpit view right now.
   */
  cockpitScreenFraction(degBelowHorizon: number): number;
  /** How long the eased move between two views takes, seconds (default 0.6; 0 = cut). */
  setTransitionSeconds(seconds: number): void;
  /** Lamp test: show the flashing lights (beacon, strobes) steadily instead of flashing — for developer pages. */
  setLampTest(on: boolean): void;
  /** Numbers describing the camera right now — for developer pages and tests, not for the app. */
  debugState(): Record<string, number | boolean | string>;
}
