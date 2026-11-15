/**
 * Cockpit 3D — the authoring contract.
 *
 * A cockpit is a `CockpitDefinition`: metadata + tours + a `build()` function that returns a
 * three.js scene graph (`CockpitBuild`) with interactive hotspots and live instrument screens.
 * `CockpitViewer` renders a definition against a running `SimEngine`.
 *
 * Coordinate frame (metres): x = right, y = up, −z = forward (toward the nose).
 * Origin = left-seat pilot design eye point. See README.md in this folder.
 *
 * All content is an original, simplified, educational representation — never an approved
 * panel layout or a Pilot's Operating Handbook.
 */
import type * as THREE from "three";
import type { SimEngine } from "@/sim/engine";
import type { SimSnapshot } from "@/sim/types";

export type CockpitEra = "vintage" | "classic" | "glass" | "airliner";

export type HotspotCategory =
  | "flight-controls"
  | "engine"
  | "fuel"
  | "electrical"
  | "flight-instruments"
  | "navigation"
  | "radios"
  | "autopilot"
  | "lighting"
  | "safety"
  | "airframe";

export type ControlBinding =
  | {
      kind: "toggle";
      get(s: SimSnapshot): boolean;
      set(e: SimEngine, on: boolean): void;
    }
  | {
      kind: "lever";
      /** 0..1 */
      get(s: SimSnapshot): number;
      set(e: SimEngine, v: number): void;
      /** local-space drag direction & travel (m) of the moving part */
      axis: THREE.Vector3;
      travel: number;
      moving: THREE.Object3D;
      /** Values (0..1) the lever snaps to, e.g. flap detents. */
      detents?: number[];
      /**
       * Optional: the lever pivots instead of sliding. `moving` is rotated about this local
       * axis by `value * angle` radians (the drag direction is still taken from `axis`).
       */
      arc?: { axis: THREE.Vector3; angle: number };
    }
  | {
      kind: "rotary";
      positions: string[];
      get(s: SimSnapshot): number;
      set(e: SimEngine, index: number): void;
      /** Rotated about its local z axis (the knob faces +z): rotation.z = base − index·step. */
      moving: THREE.Object3D;
      /** radians per position */
      step: number;
    }
  | { kind: "button"; press(e: SimEngine): void }
  | { kind: "knob"; turn(e: SimEngine, dir: 1 | -1): void };

export interface Hotspot {
  id: string;
  label: string;
  category: HotspotCategory;
  /** What it is (one or two sentences). */
  what: string;
  /** How a pilot uses it. */
  how: string;
  tip?: string;
  /** Raycast target (its descendants count). Highlighting tints its visible meshes. */
  object: THREE.Object3D;
  control?: ControlBinding;
}

export type ScreenComponent =
  | "pfd"
  | "mfd"
  | "sixpack"
  | "asi"
  | "ai"
  | "alt"
  | "tc"
  | "hi"
  | "vsi"
  | "compass"
  | "vor1"
  | "vor2"
  | "hsi"
  | "adf"
  | "dme"
  | "ils"
  | "radios"
  | "com-nav"
  | "xpdr"
  | "autopilot"
  | "engine"
  | "annunciators"
  | "gps"
  | "switches";

export interface InstrumentScreen {
  id: string;
  component: ScreenComponent;
  /** Centre of the screen face, in `parent` space (default: the build root). */
  position: THREE.Vector3;
  /** Orientation; the screen faces its local +z (toward the pilot when unrotated). */
  rotation: THREE.Euler;
  widthM: number;
  heightM: number;
  /** DOM pixel width the component is rendered at (height derived from aspect) */
  pixelWidth: number;
  hotspotId?: string;
  /** Object the pose is relative to (must be inside the build root). Default: root. */
  parent?: THREE.Object3D;
  /** Visible window shape. Default: "circle" for round gauges, "rect" otherwise. */
  shape?: "rect" | "circle";
  /**
   * How the component is fitted into the window. "contain" (default) scales the component
   * down (never up) so its natural height fits; "none" renders it at pixelWidth and clips.
   */
  fit?: "contain" | "none";
  /** Hide the component's own caption/frame chrome (default true). */
  bare?: boolean;
  /** Optional component props. */
  options?: ScreenOptions;
}

export interface ScreenOptions {
  /** PFD: hide the soft-key row (use 3D softkeys instead). */
  hideSoftKeys?: boolean;
  /** MFD */
  initialPage?: "MAP" | "NRST" | "FPL" | "SYS";
  hideEngineStrip?: boolean;
  /** Engine gauges layout. */
  layout?: "strip" | "panel";
  /** Annunciators: only show active alerts. */
  activeOnly?: boolean;
  /** Radios: which sections. */
  sections?: ("com" | "nav" | "adf" | "xpdr" | "baro")[];
  /** CSS background behind the component (default "#050607"). */
  background?: string;
}

export interface TourStep {
  hotspotId: string;
  text: string;
  /** optional live check for interactive flows (e.g. master switch ON) */
  check?: (s: SimSnapshot) => boolean;
}

export interface CockpitTour {
  id: string;
  title: string;
  summary: string;
  steps: TourStep[];
}

export interface CockpitMeta {
  id: string;
  name: string;
  era: CockpitEra;
  years: string;
  represents: string;
  /** TeachX perf id driving live instruments */
  perfId: string;
  /** force steam or glass instrument behaviour regardless of perf */
  panel: "steam" | "glass";
  summary: string;
  aircraftIds: string[];
}

export interface CockpitBuild {
  root: THREE.Group;
  hotspots: Hotspot[];
  screens: InstrumentScreen[];
  eye: { position: THREE.Vector3; target: THREE.Vector3 };
  /** Optional camera pose for the "inspect" (orbit) view. Default: 0.8 m behind the target. */
  inspect?: { position: THREE.Vector3; target: THREE.Vector3 };
  /** Eye height above the ground while parked (m) — places the outside ground plane. Default 1.4. */
  eyeHeightM?: number;
  animate?(s: SimSnapshot, dt: number): void;
  dispose?(): void;
}

export interface CockpitDefinition extends CockpitMeta {
  tours: CockpitTour[];
  build(): CockpitBuild;
}
