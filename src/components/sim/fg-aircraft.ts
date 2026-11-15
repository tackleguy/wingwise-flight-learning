/**
 * FlightGear 3D aircraft for the Scenario Simulator's 3D view.
 *
 * The models are the FlightGear aircraft converted for the World Flight Simulator (built from
 * /flightsim and published under /sim/, so the files are at /sim/models/fg/<file>.glb; authors and
 * licences in /sim/models/fg/CREDITS.md — FlightGear aircraft are GPL). Aircraft that FlightGear's
 * hangar does not have use the closest look-alike, scaled to the real aircraft's wingspan.
 *
 * Model frame (glTF): +Z nose, +Y up, +X left wing, metres. The 3D view's aircraft frame has the
 * nose toward −Z, so the model is turned half a circle about the vertical axis.
 */
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

/** Which FlightGear model each aircraft of the Scenario Simulator uses (file name in /sim/models/fg/). */
export const FG_MODEL_FOR: Record<string, { file: string; lookalike?: string }> = {
  c152: { file: "c172p", lookalike: "the FlightGear Cessna 172, scaled to the 152's size" },
  c172: { file: "c172p" },
  pa28: { file: "pa28" },
  da40: { file: "da40" },
  sr20: { file: "sr22", lookalike: "the FlightGear Cirrus SR22 (same airframe)" },
  sr22: { file: "sr22" },
  be36: { file: "be36" },
  pa34: { file: "pa34" },
  be58: { file: "pa34", lookalike: "the FlightGear Piper Seneca (FlightGear has no Baron)" },
  be350: { file: "be350" },
  b738: { file: "b738" },
  a320: { file: "A320" },
};

export interface FgAircraft {
  /** Holds the model; add it to the aircraft group. */
  root: THREE.Group;
  /** Height of the model's origin above its wheels, metres (after scaling). */
  gearDrop: number;
  /** Wingspan of the model as drawn, metres. */
  spanM: number;
  /** Spinning propeller nodes, and the blade / blurred-disc parts under them. */
  propellers: THREE.Object3D[];
  blades: THREE.Object3D[];
  discs: THREE.Object3D[];
  /** Retractable landing gear (with doors), if the aircraft has it. */
  gear: THREE.Object3D | null;
}

const loader = new GLTFLoader();

/**
 * Load the FlightGear model for this aircraft, scaled to its real wingspan. Resolves to null when
 * there is no model for it or the file cannot be loaded (the caller keeps its simple shape).
 */
export async function loadFgAircraft(
  perfId: string,
  wingSpanM: number,
): Promise<FgAircraft | null> {
  const pick = FG_MODEL_FOR[perfId];
  if (!pick) return null;
  let gltf: { scene: THREE.Group };
  try {
    gltf = await loader.loadAsync(`/sim/models/fg/${pick.file}.glb`);
  } catch (err) {
    console.warn(`[TeachX] FlightGear model for ${perfId} not available`, err);
    return null;
  }
  const model = gltf.scene;
  model.rotation.y = Math.PI; // glTF nose +Z → the view's nose −Z
  const root = new THREE.Group();
  root.name = `fg-${pick.file}`;
  root.add(model);
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const span = Math.max(0.1, box.max.x - box.min.x);
  const scale = wingSpanM > 0 ? wingSpanM / span : 1;
  root.scale.setScalar(scale);

  const propellers: THREE.Object3D[] = [];
  const blades: THREE.Object3D[] = [];
  const discs: THREE.Object3D[] = [];
  let gear: THREE.Object3D | null = null;
  model.traverse((o) => {
    if (/^propeller(_\d+)?$/.test(o.name)) propellers.push(o);
    else if (/^propeller_blades(_\d+)?$/.test(o.name)) blades.push(o);
    else if (/^propeller_disc(_\d+)?$/.test(o.name)) discs.push(o);
    else if (o.name === "gear_retract") gear = o;
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh) mesh.frustumCulled = true;
  });
  return {
    root,
    gearDrop: -box.min.y * scale,
    spanM: span * scale,
    propellers,
    blades,
    discs,
    gear,
  };
}

/** Spin the propellers (each turns about its own local X axis) and show blades or a blur disc. */
export function animateFgAircraft(
  fg: FgAircraft,
  rpm: number,
  gearDown: boolean,
  dt: number,
): void {
  const turn = (Math.max(0, rpm) / 60) * Math.PI * 2 * dt;
  // (a real propeller turns too fast for the screen: cap the drawn speed so it does not strobe)
  const drawn = Math.min(turn, 0.9);
  for (const p of fg.propellers) p.rotateX(drawn);
  const blur = rpm > 700;
  for (const b of fg.blades) b.visible = !blur;
  for (const d of fg.discs) d.visible = blur;
  if (fg.gear) fg.gear.visible = gearDown;
}
