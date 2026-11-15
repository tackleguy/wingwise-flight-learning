import type * as THREE from "three";

/** Geometry / texture detail level. */
export type ModelQuality = "low" | "medium" | "high";

export interface BuildAircraftOptions {
  quality?: ModelQuality;
}

/** Per-frame inputs for {@link AircraftModel.update}. Mirrors the sim's Controls/AircraftState. */
export interface AircraftModelState {
  /** −1..1, + = pull (nose up). */
  elevator: number;
  /** −1..1, + = roll right. */
  aileron: number;
  /** −1..1, + = yaw right. */
  rudder: number;
  /** Actual flap deflection, degrees. */
  flapsDeg: number;
  /** 0 = up, 1 = down & locked. */
  gearPosition: number;
  /** Propeller RPM (piston/turboprop) or N1 % (jet). */
  rpm: number;
  lights: { nav: boolean; beacon: boolean; strobe: boolean; landing: boolean; taxi: boolean };
  /** Time, seconds (any monotonic clock). Drives beacon / strobe flash patterns. */
  t: number;
  /** Frame time step, seconds. */
  dt: number;
}

export interface AircraftModelParts {
  aileronL?: THREE.Object3D;
  aileronR?: THREE.Object3D;
  elevator?: THREE.Object3D;
  rudder?: THREE.Object3D;
  flaps?: THREE.Object3D[];
  gear?: THREE.Object3D;
  canopyGlass?: THREE.Object3D;
}

export interface AircraftModelLights {
  /** Red left wing-tip position light (glow). Visible = on. */
  navL: THREE.Object3D;
  /** Green right wing-tip position light (glow). Visible = on. */
  navR: THREE.Object3D;
  /** Red anti-collision beacon (glow). */
  beacon: THREE.Object3D;
  /** White anti-collision strobes (glows). */
  strobes: THREE.Object3D[];
  /** Landing / taxi light. Its target is a child of the model group. */
  landing: THREE.SpotLight;
}

/** Real-world reference dimensions used to build the model (metres). */
export interface AircraftModelDimensions {
  lengthM: number;
  spanM: number;
  heightM: number;
}

export interface AircraftModel {
  /** Model root. Nose toward −z, y up, x to the right wing, origin near the CG, metres. */
  group: THREE.Group;
  /** Height of the origin above the ground with the gear down (level attitude). */
  gearDrop: number;
  /** Propellers / fans. They spin about their local z axis — {@link update} already spins them. */
  props: THREE.Object3D[];
  parts: AircraftModelParts;
  lights: AircraftModelLights;
  /** Animate control surfaces, flaps, gear, propellers and lights. Allocation-free. */
  update(state: AircraftModelState): void;
  /** Free every geometry, material and texture the model created. */
  dispose(): void;
  /** Model id actually built (unknown ids fall back to a generic trainer). */
  id: string;
  /** Short descriptive name, e.g. "Cessna 172S (representative)". */
  label: string;
  /** Nose-up attitude when parked on all wheels (tailwheel aircraft), degrees. 0 for tricycle gear. */
  groundPitchDeg: number;
  dimensions: AircraftModelDimensions;
  /** Total triangle count (all meshes). */
  triangles: number;
  /** What the airframe has, so UIs can explain / demo it. */
  features: AircraftModelFeatures;
}

export interface AircraftModelFeatures {
  retractableGear: boolean;
  tailwheel: boolean;
  /** All-moving horizontal tail (stabilator) instead of an elevator. */
  stabilator: boolean;
  tTail: boolean;
  /** Max visual flap deflection, deg (0 = no flaps). */
  flapMaxDeg: number;
  engines: number;
  jet: boolean;
}
