/**
 * What the 3D view needs to know about each aircraft's model: which file, where the pilot's eyes
 * are, how big it is, where its lights are, which propeller nodes spin.
 *
 * Every aircraft uses its FlightGear 3D model (converted by scripts/fg-aircraft/convert.py, numbers
 * in src/aircraft/fg-models.gen.ts). If a model is missing, the view falls back to the original
 * TeachX trainer model so that the simulator still works.
 *
 * Frames: the generated FlightGear numbers are glTF (x LEFT, y up, z nose); everything exported
 * here is in the aircraft frame used by aircraftMatrix() ("frame A": x nose, y LEFT, z up).
 */
import { FG_MODELS, type FgModelMeta } from "@/aircraft/fg-models.gen";
import { TRAINER_META } from "./trainer-meta";

type V3 = [number, number, number];
export type LightKey = keyof typeof TRAINER_META.lights;

export interface VisualSpec {
  /** Aircraft id this spec was made for. */
  id: string;
  /** Model file (relative to the site). */
  url: string;
  /** A converted FlightGear model (generic shading, no cockpit interior) — false for the TeachX trainer. */
  fg: boolean;
  /** Pilot's eye point. */
  eye: V3;
  spanM: number;
  lengthM: number;
  /** Positions of the aircraft lights. */
  lights: Record<LightKey, V3>;
  /** Spinning propeller nodes: [spin node, blades node, blurred-disc node]. */
  propellers: { spin: string; blades: string; disc: string }[];
  /** The model has a node for the retractable landing gear. */
  gearNode: boolean;
}

const fromGltf = (p: readonly number[]): V3 => [p[2] ?? 0, p[0] ?? 0, p[1] ?? 0];

/** Light positions estimated from the model's size (FlightGear models do not carry them). */
function lightsFromBounds(m: FgModelMeta): Record<LightKey, V3> {
  const [lo, hi] = m.bounds; // glTF: x left, y up, z nose
  const tipY = (lo[1] + hi[1]) * 0.25; // a little below mid-height: wing level of most aircraft
  const left: V3 = [-0.1 * m.lengthM, hi[0] - 0.05, tipY];
  const right: V3 = [-0.1 * m.lengthM, lo[0] + 0.05, tipY];
  const nose = hi[2];
  return {
    beacon: [lo[2] + 0.12 * m.lengthM, 0, hi[1] - 0.05],
    navLeft: left,
    navRight: right,
    strobeLeft: [left[0] - 0.15, left[1], left[2]],
    strobeRight: [right[0] - 0.15, right[1], right[2]],
    tail: [lo[2] + 0.02, 0, lo[1] + 0.55 * (hi[1] - lo[1])],
    landing: [nose * 0.7, 0.15, lo[1] * 0.25],
    taxi: [nose * 0.7, -0.15, lo[1] * 0.25],
  };
}

const TRAINER: Omit<VisualSpec, "id"> = {
  url: TRAINER_META.url,
  fg: false,
  eye: [...TRAINER_META.eye],
  spanM: TRAINER_META.spanM,
  lengthM: TRAINER_META.lengthM,
  lights: Object.fromEntries(Object.entries(TRAINER_META.lights).map(([k, v]) => [k, [...v]])) as Record<LightKey, V3>,
  propellers: [{ spin: "propeller", blades: "propeller_blades", disc: "propeller_disc" }],
  gearNode: false,
};

export function visualSpecFor(id: string): VisualSpec {
  const m = (FG_MODELS as Record<string, FgModelMeta | undefined>)[id];
  if (!m || !m.url) return { id, ...TRAINER };
  const props = m.propellers.map((p, i) => {
    const sfx = i === 0 ? "" : `_${i + 1}`;
    return { spin: p.node, blades: `propeller_blades${sfx}`, disc: `propeller_disc${sfx}` };
  });
  return {
    id,
    url: m.url,
    fg: true,
    eye: fromGltf(m.eye),
    spanM: m.spanM,
    lengthM: m.lengthM,
    lights: lightsFromBounds(m),
    propellers: props,
    gearNode: m.parts.includes("gear_retract"),
  };
}
