/** Test helpers: build a real Sim (real JSBSim, real airport database) on synthetic flat terrain, in Node. */
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import { Sim } from "@/core/sim";
import { WorldData, type RawWorldData } from "@/data/world-data";
import { ElevationService } from "@/world/elevation";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (name: string) => JSON.parse(readFileSync(path.join(root, "public/data", name), "utf8"));

let data: WorldData | null = null;
export function worldData(): WorldData {
  data ??= new WorldData({ airports: read("airports.json"), runways: read("runways.json"), frequencies: read("frequencies.json"), navaids: read("navaids.json") } as RawWorldData);
  return data;
}

export const JSBSIM_URL = pathToFileURL(path.join(root, "public/jsbsim/jsbsim.mjs")).href;

/** A simulator standing on perfectly flat ground at `elevM` metres everywhere (no network). */
export function makeSim(elevM = 0): Sim {
  const flat = async () => new Float32Array(256 * 256).fill(elevM);
  // No airport data is given to the elevation service, so runway flattening does not use published elevations.
  const elevation = new ElevationService(null, flat);
  return new Sim({ data: worldData(), elevation, jsbsimUrl: JSBSIM_URL });
}
