/**
 * Registry of interactive lesson diagrams. Lesson content references diagrams by id
 * (`{ type: "diagram", id: "four-forces" }`); `getDiagram(id)` returns the component or null.
 */
import type { ComponentType } from "react";
import { AirfoilAoaDiagram, FourForcesDiagram, LoadFactorDiagram, StallAoaDiagram } from "./aero";
import { AirspaceClassesDiagram } from "./airspace";
import { LightGunDiagram, RunwayMarkingsDiagram, TrafficPatternDiagram } from "./airport";
import { PitotStaticDiagram, SixPackDiagram } from "./instruments";
import { HoldingPatternDiagram, HsiDiagram, IlsDiagram, VorCdiDiagram, WindTriangleDiagram } from "./navigation";
import { DensityAltitudeDiagram } from "./performance";

export const DIAGRAMS: Record<string, { title: string; component: ComponentType }> = {
  "four-forces": { title: "Four forces of flight", component: FourForcesDiagram },
  "airfoil-aoa": { title: "Airfoil & angle of attack", component: AirfoilAoaDiagram },
  "stall-aoa": { title: "Lift curve & critical angle of attack", component: StallAoaDiagram },
  "airspace-classes": { title: "Airspace classes", component: AirspaceClassesDiagram },
  "traffic-pattern": { title: "Traffic pattern", component: TrafficPatternDiagram },
  "six-pack": { title: "The six basic instruments", component: SixPackDiagram },
  "pitot-static": { title: "Pitot-static system failures", component: PitotStaticDiagram },
  "vor-cdi": { title: "VOR & course deviation indicator", component: VorCdiDiagram },
  hsi: { title: "Horizontal situation indicator", component: HsiDiagram },
  ils: { title: "ILS localizer & glideslope", component: IlsDiagram },
  "holding-pattern": { title: "Holding pattern entries", component: HoldingPatternDiagram },
  "wind-triangle": { title: "Wind triangle", component: WindTriangleDiagram },
  "load-factor": { title: "Load factor & stall speed in turns", component: LoadFactorDiagram },
  "runway-markings": { title: "Runway markings", component: RunwayMarkingsDiagram },
  "density-altitude": { title: "Density altitude calculator", component: DensityAltitudeDiagram },
  "light-gun": { title: "ATC light gun signals", component: LightGunDiagram },
};

export function getDiagram(id: string): { title: string; component: ComponentType } | null {
  return DIAGRAMS[id] ?? null;
}

export { CdiIndicator } from "./navigation";
export * from "./gauges";
