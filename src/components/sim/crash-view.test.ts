/**
 * Crash physics in the Scenario Simulator: the engine keeps how the aircraft was moving when it
 * crashed, and the crash scene (shared physics: flightsim/src/crash/wreck.ts) carries on from there
 * with the pieces of the real 3D model file.
 */
import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { getAirport, getRunwayEnd } from "@/lib/data/airports";
import { SimEngine } from "@/sim/engine";
import { WEATHER_PRESETS, terrainElevationFt } from "@/sim/environment";
import { CrashScene } from "./crash-view";
import type { FgAircraft, FgCrashMeta } from "./fg-aircraft";

// jsdom has no 2D canvas: the dust sprite's texture is simply blank here
beforeAll(() => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
});

const calm = { ...WEATHER_PRESETS["cavu"]!.weather, windKt: 0, windAloftKt: 0, timeOfDay: 12 };

/** The crash pieces stored in the model file the Scenario Simulator loads. */
function crashMetaOf(file: string): FgCrashMeta {
  const b = readFileSync(`public/sim/models/fg/${file}.glb`);
  const n = b.readUInt32LE(12);
  const j = JSON.parse(b.subarray(20, 20 + n).toString("utf8")) as {
    scenes: { nodes: number[] }[];
    nodes: { extras?: { teachx?: { crash?: FgCrashMeta } } }[];
  };
  return j.nodes[j.scenes[0]!.nodes[0]!]!.extras!.teachx!.crash!;
}

/** Run the flight until it crashes, then the crash scene until the wreck is at rest. */
async function crashAndSettle(sim: SimEngine, fg: FgAircraft | null) {
  for (let t = 0; t < 60 && !sim.getSnapshot().aircraft.crashed; t += 0.05) sim.advance(0.05);
  const m = sim.crashMotion;
  expect(m).not.toBeNull();
  const origin = { lat: m!.lat, lon: m!.lon };
  const toWorld = (lat: number, lon: number, altFt: number) =>
    new THREE.Vector3(
      (lon - origin.lon) * 111120 * Math.cos((origin.lat * Math.PI) / 180),
      altFt * 0.3048,
      -(lat - origin.lat) * 111120,
    );
  const scene = new CrashScene(toWorld);
  let settledCalls = 0;
  await scene.start(m!, fg, fg ? 1.3 : 0, 11, terrainElevationFt, () => settledCalls++);
  expect(scene.active).toBe(true);
  let pose = scene.update(0, false);
  for (let i = 0; i < 45 * 30 && !scene.settled; i++) pose = scene.update(1 / 30, false);
  return { m: m!, scene, pose: pose!, settledCalls };
}

describe("Scenario Simulator crash physics", () => {
  it("the engine keeps the motion at the moment of a crash (before it zeroes the speeds)", () => {
    const ap = getAirport("KSFO")!;
    const re = getRunwayEnd(ap, "28R")!;
    const sim = new SimEngine({
      perfId: "c172",
      magVar: ap.magVar,
      weather: calm,
      start: {
        lat: re.end.threshold.lat,
        lon: re.end.threshold.lon,
        altMslFt: ap.elevationFt + 300,
        heading: re.end.trueHeading,
        iasKt: 95,
        onGround: false,
        groundElevFt: ap.elevationFt,
        engineRunning: true,
      },
    });
    sim.setControls({ elevator: -1, throttle: 1 }); // nose hard down
    for (let t = 0; t < 60 && !sim.getSnapshot().aircraft.crashed; t += 0.05) sim.advance(0.05);
    const a = sim.getSnapshot().aircraft;
    expect(a.crashed).toBe(true);
    expect(a.gsKt).toBe(0); // the engine stops the aircraft…
    expect(sim.crashMotion!.gsKt).toBeGreaterThan(50); // …but remembers how fast it was going
    expect(sim.crashMotion!.vsFpm).toBeLessThan(-500);
    expect(sim.crashMotion!.reason).toBe(a.crashReason);
  });

  it("a dive into the ground: the Cessna breaks apart, moves on and comes to rest on the ground", async () => {
    const ap = getAirport("KSFO")!;
    const re = getRunwayEnd(ap, "28R")!;
    const sim = new SimEngine({
      perfId: "c172",
      magVar: ap.magVar,
      weather: calm,
      start: {
        lat: re.end.threshold.lat,
        lon: re.end.threshold.lon,
        altMslFt: ap.elevationFt + 300,
        heading: re.end.trueHeading,
        iasKt: 95,
        onGround: false,
        groundElevFt: ap.elevationFt,
        engineRunning: true,
      },
    });
    sim.setControls({ elevator: -1, throttle: 1 });
    const fg = {
      model: new THREE.Group(),
      scale: 11 / 11.32,
      crash: crashMetaOf("c172p"),
    } as unknown as FgAircraft;
    const { m, scene, pose, settledCalls } = await crashAndSettle(sim, fg);
    expect(scene.settled).toBe(true);
    expect(settledCalls).toBe(1);
    const ground = terrainElevationFt(pose.lat, pose.lon);
    expect(pose.altMslFt - ground).toBeGreaterThan(-1);
    expect(pose.altMslFt - ground).toBeLessThan(12);
    const movedM = Math.hypot(
      (pose.lat - m.lat) * 111120,
      (pose.lon - m.lon) * 111120 * Math.cos((m.lat * Math.PI) / 180),
    );
    expect(movedM).toBeGreaterThan(3);
    scene.dispose();
  });

  it("works without a model file too (the simple drawn shape: one box)", async () => {
    const ap = getAirport("KSFO")!;
    const re = getRunwayEnd(ap, "28R")!;
    const sim = new SimEngine({
      perfId: "c172",
      magVar: ap.magVar,
      weather: calm,
      start: {
        lat: re.end.threshold.lat,
        lon: re.end.threshold.lon,
        altMslFt: ap.elevationFt + 200,
        heading: re.end.trueHeading,
        iasKt: 90,
        onGround: false,
        groundElevFt: ap.elevationFt,
        engineRunning: true,
      },
    });
    sim.setControls({ elevator: -1 });
    const { scene, pose } = await crashAndSettle(sim, null);
    expect(scene.settled).toBe(true);
    expect(Number.isFinite(pose.lat + pose.lon + pose.altMslFt + pose.pitch + pose.roll)).toBe(
      true,
    );
    scene.dispose();
  });
});
