/**
 * Procedural aircraft models — original, representative 3D airframes for the simulator and
 * the aircraft library. Built entirely in code from public dimensions (no imported meshes).
 *
 *   const model = buildAircraftModel("c172", { quality: "medium" });
 *   scene.add(model.group);
 *   // every frame
 *   model.update({ elevator, aileron, rudder, flapsDeg, gearPosition, rpm, lights, t, dt });
 *   // on unmount
 *   model.dispose();
 */
import { buildC152, buildC172, buildJ3 } from "./highwing";
import { AirframeKit, QUALITY, type Palette } from "./kit";
import type { AircraftModel, BuildAircraftOptions } from "./types";

export type {
  AircraftModel,
  AircraftModelState,
  AircraftModelParts,
  AircraftModelLights,
  AircraftModelDimensions,
  BuildAircraftOptions,
  ModelQuality,
} from "./types";

type Meta = Parameters<AirframeKit["finalize"]>[0];

interface Entry {
  pal: Palette;
  build: (kit: AirframeKit) => Meta;
}

const GA_WHITE = "#f4f5f2";

const REGISTRY: Record<string, Entry> = {
  c152: {
    pal: {
      base: GA_WHITE,
      wing: GA_WHITE,
      accent: "#9b2226",
      spinner: "#9b2226",
      gear: "#e9ebe7",
      propTip: "#f2f2f2",
    },
    build: buildC152,
  },
  c172: {
    pal: {
      base: GA_WHITE,
      wing: GA_WHITE,
      accent: "#1d3557",
      spinner: "#1d3557",
      gear: "#e9ebe7",
      propTip: "#f2f2f2",
    },
    build: buildC172,
  },
  j3: {
    pal: {
      base: "#f2c018",
      wing: "#f2c018",
      accent: "#141414",
      spinner: "#2a2a2a",
      gear: "#f2c018",
      propTip: "#f2c018",
      propBlade: "#7a4a22",
    },
    build: buildJ3,
  },
};

/** Ids with a dedicated model. Others fall back to the generic trainer (c172). */
export const AIRCRAFT_MODEL_IDS = Object.keys(REGISTRY);

export function hasAircraftModel(id: string): boolean {
  return id in REGISTRY;
}

/**
 * Build an original procedural 3D model for a simulator aircraft id
 * (c152, c172, pa28, da40, be36, sr20, sr22, pa34, be58, be350, b738, a320, j3).
 * Must be called in the browser (uses canvas for the livery); safe to call inside effects.
 */
export function buildAircraftModel(perfId: string, opts: BuildAircraftOptions = {}): AircraftModel {
  const quality = opts.quality ?? "medium";
  const entry = REGISTRY[perfId] ?? REGISTRY["c172"];
  if (!entry) throw new Error("aircraft model registry is empty");
  const kit = new AirframeKit(quality, entry.pal, QUALITY[quality]);
  const meta = entry.build(kit);
  return kit.finalize(meta);
}
