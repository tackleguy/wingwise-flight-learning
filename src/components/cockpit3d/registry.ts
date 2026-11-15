/**
 * Cockpit registry — metadata for lists (no three.js), plus lazy loading of full definitions.
 * Each definition lives in ./defs/<id>.ts and does `export default definition`.
 */
import type { CockpitDefinition, CockpitMeta } from "./types";

export const COCKPITS: CockpitMeta[] = [
  {
    id: "j3-vintage",
    name: "Vintage tandem trainer",
    era: "vintage",
    years: "1940s",
    represents: "Representative of a Piper J-3 Cub-era tandem two-seat trainer",
    perfId: "c152",
    panel: "steam",
    summary:
      "Stick, throttle and a handful of basic gauges — airspeed, altimeter, compass, tachometer and oil — the way generations of pilots first learned to fly.",
    aircraftIds: [],
  },
  {
    id: "c172-classic",
    name: "Classic steam-gauge four-seater",
    era: "classic",
    years: "1970s–1990s",
    represents: "Representative of a Cessna 172N-era panel with the standard six-pack",
    perfId: "c172",
    panel: "steam",
    summary:
      "The classic 'basic T' of analog flight instruments, nav/com radios with a CDI, push-pull throttle and mixture, and a split master switch.",
    aircraftIds: ["c152", "pa28"],
  },
  {
    id: "c172-glass",
    name: "Glass integrated flight deck",
    era: "glass",
    years: "2005+",
    represents: "Representative of a Cessna 172S with a G1000-class integrated flight deck",
    perfId: "c172",
    panel: "glass",
    summary:
      "Primary and multi-function displays replace the six-pack, with standby instruments, an integrated autopilot and engine indication on screen.",
    aircraftIds: ["c172", "da40", "be36", "sr20", "sr22", "pa34", "be58"],
  },
  {
    id: "jet-airliner",
    name: "Two-crew jet airliner",
    era: "airliner",
    years: "1990s+",
    represents: "Representative of a 737/A320-class two-crew glass flight deck",
    perfId: "b738",
    panel: "glass",
    summary:
      "Side-by-side captain and first-officer displays, a glareshield mode-control panel, overhead systems panel and a centre pedestal with thrust levers and flight-management keypads.",
    aircraftIds: ["be350", "b738", "a320"],
  },
];

export function getCockpitMeta(id: string): CockpitMeta | undefined {
  return COCKPITS.find((c) => c.id === id);
}

const loaders = import.meta.glob<{ default: CockpitDefinition }>("./defs/*.ts");

/** Load a full definition (three.js + parts) on demand. Browser-only use is recommended. */
export async function loadCockpit(id: string): Promise<CockpitDefinition | undefined> {
  if (!/^[a-z0-9-]+$/.test(id)) return undefined;
  const load = loaders[`./defs/${id}.ts`];
  if (!load) return undefined;
  try {
    const mod = await load();
    return mod.default;
  } catch (err) {
    console.error(`[cockpit3d] failed to load cockpit "${id}"`, err);
    return undefined;
  }
}

/** Best cockpit for a SkyReady aircraft perf id. */
export function cockpitForAircraft(perfId: string): string {
  switch (perfId) {
    case "c152":
    case "pa28":
      return "c172-classic";
    case "be350":
    case "b738":
    case "a320":
      return "jet-airliner";
    case "c172":
    case "da40":
    case "be36":
    case "sr20":
    case "sr22":
    case "pa34":
    case "be58":
      return "c172-glass";
    default:
      return "c172-glass";
  }
}
