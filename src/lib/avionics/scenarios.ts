/**
 * Avionics Lab scenarios: aircraft choices, the starting position, reposition presets and the
 * simulated training NDBs. Positions are computed from the airport/navaid dataset.
 */
import { getPerf } from "@/lib/data/aircraft-perf";
import { getAirport, getNavaid, getRunwayEnd, magneticHeading } from "@/lib/data/airports";
import { bearingDeg, clamp, destinationPoint, norm360 } from "@/lib/geo";
import type { SimEngine, SimOptions } from "@/sim/engine";
import { WEATHER_PRESETS } from "@/sim/environment";
import type { TrainingNdb } from "@/sim/navigation";
import type { Radios, StartState } from "@/sim/types";

export const LAB_MAGVAR = 13;

export const LAB_AIRCRAFT = [
  { id: "c172", label: "Cessna 172S", panel: "Glass cockpit (G1000-style)" },
  { id: "pa28", label: "Piper PA-28-181", panel: "Steam gauges" },
  { id: "sr22", label: "Cirrus SR22", panel: "Glass cockpit (Perspective-style)" },
] as const;
export type LabAircraftId = (typeof LAB_AIRCRAFT)[number]["id"];

export const LAB_WEATHER = ["scattered", "cavu", "mvfr", "ifr", "storm", "gusty"] as const;

function sfo28r() {
  const ap = getAirport("KSFO")!;
  const re = getRunwayEnd(ap, "28R")!;
  return { ap, end: re.end };
}

/** Simulated training NDBs (not real-world stations). */
export function trainingNdbs(): TrainingNdb[] {
  const { end } = sfo28r();
  const lom = destinationPoint(end.threshold.lat, end.threshold.lon, norm360(end.trueHeading + 180), 5);
  const oak = getNavaid("OAK")!;
  const east = destinationPoint(oak.lat, oak.lon, 95, 14);
  return [
    { id: "TXB", khz: 350, lat: lom.lat, lon: lom.lon },
    { id: "TXE", khz: 278, lat: east.lat, lon: east.lon },
  ];
}

export const cruiseIas = (perfId: string) => Math.round(getPerf(perfId).v.no * 0.8);
export const approachIas = (perfId: string) => Math.round(clamp(getPerf(perfId).v.ref * 1.35, 80, 120));

export interface LabPresetBuild {
  start: StartState;
  radios?: (r: Radios) => Partial<Radios>;
  /** Leave the altimeter at 29.92 so the student must set it (baro task). */
  altimeterStd?: boolean;
}

export interface LabPreset {
  id: string;
  label: string;
  description: string;
  build: (perfId: string) => LabPresetBuild;
}

export const LAB_PRESETS: LabPreset[] = [
  {
    id: "start",
    label: "10 nm SE of OAK · 4,000 ft",
    description: "Cruising at 4,000 ft on the OAK 150° radial, heading for the Oakland VOR. Altimeter still on 29.92.",
    build: (perfId) => {
      const oak = getNavaid("OAK")!;
      const pos = destinationPoint(oak.lat, oak.lon, norm360(150 + oak.magVar), 10);
      return {
        start: { lat: pos.lat, lon: pos.lon, altMslFt: 4000, heading: bearingDeg(pos.lat, pos.lon, oak.lat, oak.lon), iasKt: cruiseIas(perfId), onGround: false, groundElevFt: 0, engineRunning: true, throttle: 0.65 },
        altimeterStd: true,
      };
    },
  },
  {
    id: "ils28r",
    label: "10 nm final ILS 28R KSFO",
    description: "Established on a 10 nm final for ILS 28R at San Francisco, 3,000 ft, NAV1 tuned 109.55 and CDI on NAV1.",
    build: (perfId) => {
      const { ap, end } = sfo28r();
      const pos = destinationPoint(end.threshold.lat, end.threshold.lon, norm360(end.trueHeading + 180), 10);
      const crs = Math.round(magneticHeading(ap, end.trueHeading));
      return {
        start: { lat: pos.lat, lon: pos.lon, altMslFt: 3000, heading: end.trueHeading, iasKt: approachIas(perfId), onGround: false, groundElevFt: 0, engineRunning: true, throttle: 0.48 },
        radios: (r) => ({ nav1: { active: end.ils!.freq, standby: r.nav1.active, obs: crs }, cdiSource: "NAV1", hdgBug: crs, altBug: 3000 }),
      };
    },
  },
  {
    id: "oak",
    label: "Over OAK VOR · 4,000 ft",
    description: "Directly over the Oakland VORTAC at 4,000 ft heading 270°. NAV1 tuned to OAK 116.80.",
    build: (perfId) => {
      const oak = getNavaid("OAK")!;
      return {
        start: { lat: oak.lat, lon: oak.lon, altMslFt: 4000, heading: norm360(270 + LAB_MAGVAR), iasKt: cruiseIas(perfId), onGround: false, groundElevFt: 0, engineRunning: true, throttle: 0.65 },
        radios: (r) => ({ nav1: { ...r.nav1, active: 116.8, standby: r.nav1.active }, hdgBug: 270, altBug: 4000 }),
      };
    },
  },
  {
    id: "coast",
    label: "Over the coast near KHAF · 3,500 ft",
    description: "3,500 ft over the coastline 8 nm north of Half Moon Bay, heading 180° — good for GPS direct-to and RNAV practice.",
    build: (perfId) => {
      const haf = getAirport("KHAF")!;
      const pos = destinationPoint(haf.lat, haf.lon, 355, 8);
      return {
        start: { lat: pos.lat, lon: pos.lon, altMslFt: 3500, heading: norm360(180 + LAB_MAGVAR), iasKt: cruiseIas(perfId), onGround: false, groundElevFt: 0, engineRunning: true, throttle: 0.65 },
      };
    },
  },
];

export function getPreset(id: string): LabPreset {
  return LAB_PRESETS.find((p) => p.id === id) ?? LAB_PRESETS[0]!;
}

/** Engine options for a new Avionics Lab flight. */
export function labSimOptions(perfId: string, weatherKey: string): SimOptions {
  const w = WEATHER_PRESETS[weatherKey] ?? WEATHER_PRESETS["scattered"]!;
  const b = getPreset("start").build(perfId);
  return { perfId, magVar: LAB_MAGVAR, start: b.start, weather: { ...w.weather, timeOfDay: 14 }, ndbs: trainingNdbs() };
}

/** Move the aircraft to a preset and apply its radio set-up. */
export function applyPreset(engine: SimEngine, presetId: string) {
  const p = getPreset(presetId);
  const b = p.build(engine.perf.id);
  engine.reposition(b.start);
  if (b.radios) engine.setRadios(b.radios(engine.getSnapshot().radios));
  if (b.altimeterStd) engine.setRadios({ altimeterInHg: 29.92 });
}
