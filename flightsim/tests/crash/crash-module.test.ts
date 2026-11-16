/**
 * The crash module in the real simulator: the flight model flies the Cessna into the ground, the
 * crash physics takes over from there and brings the wreck to rest.
 */
import { describe, expect, it } from "vitest";
import { createCrash } from "@/crash";
import { makeSim } from "../helpers";

describe("crash module", () => {
  it("takes over after a crash, moves the aircraft on, and reports when the wreck is at rest", async () => {
    const sim = makeSim(0);
    const crash = sim.use(createCrash(null));
    const apt = sim.data.getAirport("KLVK")!;
    // 150 ft above the ground, 80 kt, then the nose is pushed hard down
    await sim.spawn({ kind: "air", airportIdent: "KLVK", lat: apt.lat, lon: apt.lon, headingTrue: 250, altFtMsl: 150, kias: 80, engineRunning: true });
    let settledEvents = 0;
    sim.events.on("crashSettled", () => settledEvents++);
    sim.controls.elevator = 1;
    sim.controls.throttle = 1;
    for (let t = 0; t < 30 && !sim.state.crash; t += 0.1) {
      sim.controls.elevator = sim.state.pitch > -30 ? 1 : 0;
      sim.advance(0.1);
    }
    expect(sim.state.crash).not.toBeNull();
    expect(crash.active).toBe(true);
    const at = { lat: sim.state.lat, lon: sim.state.lon };
    await crash.whenReady();
    expect(crash.parts).not.toBeNull();

    for (let i = 0; i < 40 * 30 && !crash.settled; i++) sim.frame(1 / 30);
    expect(crash.settled).toBe(true);
    expect(settledEvents).toBe(1);
    const s = sim.state;
    // it moved on from where it hit, is on the ground, and the propeller has stopped
    const movedM = Math.hypot((s.lat - at.lat) * 111120, (s.lon - at.lon) * 111120 * Math.cos((at.lat * Math.PI) / 180));
    expect(movedM).toBeGreaterThan(3);
    expect(s.altMslFt - s.groundElevFt).toBeLessThan(15);
    expect(s.rpm).toBeLessThan(5);
    expect([s.lat, s.lon, s.altMslFt, s.pitch, s.roll, s.headingTrue].every(Number.isFinite)).toBe(true);
    expect(crash.parts!.some((p) => p.detached)).toBe(true);

    // a new start puts everything back
    await sim.spawn({ kind: "runway", airportIdent: "KLVK" });
    expect(crash.parts).toBeNull();
    expect(crash.active).toBe(false);
    expect(sim.state.crash).toBeNull();
  });
});
