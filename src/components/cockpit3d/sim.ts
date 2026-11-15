/**
 * Helpers that create a SimEngine configured for a cockpit (perf id + steam/glass override).
 *
 *   const engine = useCockpitSim(meta);              // parked on a runway, engine running
 *   const engine = useCockpitSim(meta, { airborne: true });
 *   <CockpitViewer definition={def} engine={engine} />
 */
import { useEffect } from "react";
import { getScenario } from "@/sim/scenarios";
import { labSimOptions } from "@/lib/avionics/scenarios";
import type { SimOptions } from "@/sim/engine";
import { useCreateSim } from "@/sim/react";
import type { SimEngine } from "@/sim/engine";
import type { CockpitMeta } from "./types";

export interface CockpitSimConfig {
  /** Start in cruise (4,000 ft near OAK) instead of lined up on a runway. Default false. */
  airborne?: boolean;
  /** Departure airport for the parked start (default KPAO). */
  airport?: string;
  /** Weather preset key (see WEATHER_PRESETS). */
  weatherKey?: string;
  timeOfDay?: number;
}

/** Apply a cockpit's perf id and panel override to any SimOptions. */
export function withCockpitPanel(
  meta: Pick<CockpitMeta, "perfId" | "panel">,
  opts: SimOptions,
): SimOptions {
  return { ...opts, perfId: meta.perfId, panel: meta.panel };
}

/** Sim options for a cockpit: parked (runway, engine running, parking brake set) or airborne. */
export function cockpitSimOptions(
  meta: Pick<CockpitMeta, "perfId" | "panel">,
  cfg: CockpitSimConfig = {},
): SimOptions {
  if (cfg.airborne) {
    const o = labSimOptions(meta.perfId, cfg.weatherKey ?? "cavu");
    if (cfg.timeOfDay !== undefined) o.weather = { ...o.weather, timeOfDay: cfg.timeOfDay };
    return withCockpitPanel(meta, o);
  }
  const scenario = getScenario("free-flight");
  if (!scenario) {
    return withCockpitPanel(meta, labSimOptions(meta.perfId, cfg.weatherKey ?? "cavu"));
  }
  const built = scenario.build({
    aircraftId: meta.perfId,
    airport: cfg.airport ?? "KPAO",
    weatherKey: cfg.weatherKey ?? "cavu",
    timeOfDay: cfg.timeOfDay ?? 13,
  });
  return withCockpitPanel(meta, built.options);
}

/**
 * Create & run a SimEngine for a cockpit (client only; null during SSR / loading).
 * The parked start sets the parking brake so the aircraft stays put while you explore.
 */
export function useCockpitSim(
  meta: Pick<CockpitMeta, "id" | "perfId" | "panel"> | null | undefined,
  cfg: CockpitSimConfig = {},
): SimEngine | null {
  const key = meta ? `${meta.id}:${meta.perfId}:${meta.panel}` : "";
  const engine = useCreateSim(
    () => cockpitSimOptions(meta ?? { perfId: "c172", panel: "steam" }, cfg),
    [key, cfg.airborne, cfg.airport, cfg.weatherKey, cfg.timeOfDay],
  );
  const airborne = cfg.airborne ?? false;
  useEffect(() => {
    // Once, right after creation: hold the aircraft on the runway while exploring.
    if (engine && !airborne) engine.setControls({ parkingBrake: true, throttle: 0 });
  }, [engine, airborne]);
  return engine;
}
