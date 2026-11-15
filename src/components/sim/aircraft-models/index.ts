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
import { buildA320, buildB738 } from "./airliners";
import { buildC152, buildC172, buildJ3 } from "./highwing";
import { AirframeKit, QUALITY, type Palette } from "./kit";
import { buildBE36, buildDA40, buildPA28, buildSR20, buildSR22 } from "./lowwing";
import { buildBE350, buildBE58, buildPA34 } from "./twins";
import type { AircraftModel, BuildAircraftOptions } from "./types";

export type {
  AircraftModel,
  AircraftModelState,
  AircraftModelParts,
  AircraftModelLights,
  AircraftModelDimensions,
  AircraftModelFeatures,
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
  pa28: {
    pal: {
      base: GA_WHITE,
      wing: GA_WHITE,
      accent: "#203a72",
      spinner: "#203a72",
      gear: "#d9dcdf",
      propTip: "#f2f2f2",
    },
    build: buildPA28,
  },
  da40: {
    pal: {
      base: "#f7f8f8",
      wing: "#f7f8f8",
      accent: "#2b4c7e",
      spinner: "#f7f8f8",
      gear: "#f7f8f8",
      propTip: "#f2f2f2",
    },
    build: buildDA40,
  },
  be36: {
    pal: {
      base: GA_WHITE,
      wing: GA_WHITE,
      accent: "#7a1f2b",
      spinner: "#d5d9de",
      spinnerMetal: 0.8,
      gear: "#c8ccd1",
      propTip: "#f2f2f2",
    },
    build: buildBE36,
  },
  sr20: {
    pal: {
      base: "#f6f7f7",
      wing: "#f6f7f7",
      accent: "#2c6e9b",
      spinner: "#f6f7f7",
      gear: "#f6f7f7",
      propTip: "#f2f2f2",
    },
    build: buildSR20,
  },
  sr22: {
    pal: {
      base: "#f6f7f7",
      wing: "#f6f7f7",
      accent: "#3d4651",
      spinner: "#3d4651",
      gear: "#f6f7f7",
      propTip: "#f2f2f2",
    },
    build: buildSR22,
  },
  pa34: {
    pal: {
      base: GA_WHITE,
      wing: GA_WHITE,
      accent: "#13315c",
      spinner: "#d5d9de",
      spinnerMetal: 0.8,
      gear: "#c8ccd1",
      propTip: "#f2f2f2",
    },
    build: buildPA34,
  },
  be58: {
    pal: {
      base: GA_WHITE,
      wing: GA_WHITE,
      accent: "#264653",
      spinner: "#d5d9de",
      spinnerMetal: 0.8,
      gear: "#c8ccd1",
      propTip: "#f2f2f2",
    },
    build: buildBE58,
  },
  be350: {
    pal: {
      base: "#f5f6f7",
      wing: "#f5f6f7",
      accent: "#1f2a44",
      spinner: "#d0d5db",
      spinnerMetal: 0.85,
      gear: "#b9bec5",
      propTip: "#f0f0f0",
    },
    build: buildBE350,
  },
  b738: {
    pal: {
      base: "#f7f8fa",
      wing: "#c9ced5",
      accent: "#1b3a6b",
      spinner: "#cfd4da",
      gear: "#b8bdc4",
      metal: "#d4d8de",
      propTip: "#f0f0f0",
    },
    build: buildB738,
  },
  a320: {
    pal: {
      base: "#f7f8fa",
      wing: "#c9ced5",
      accent: "#14532d",
      spinner: "#cfd4da",
      gear: "#b8bdc4",
      metal: "#d4d8de",
      propTip: "#f0f0f0",
    },
    build: buildA320,
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
