import { describe, expect, it } from "vitest";
import { SimEngine } from "@/sim/engine";
import { getScenario } from "@/sim/scenarios";
import { destinationPoint, norm360 } from "@/lib/geo";
import {
  extractTelemetry,
  handleSimEvent,
  initSimAtc,
  initialSimRadios,
  simQuickCalls,
  stepSimAtc,
  syncAtisWithWeather,
} from "./sim-bridge";

describe("simulator ATC bridge", () => {
  it("initializes holding-short on ground, syncs radios and live weather ATIS", () => {
    const scenario = getScenario("free-flight")!;
    const built = scenario.build({
      aircraftId: "c172",
      airport: "KPAO",
      destination: "KMRY",
      windDir: 310,
      windKt: 12,
    });
    const engine = new SimEngine(built.options);
    const snap = engine.getSnapshot();

    const { ctrl, replies } = initSimAtc({
      built,
      scenario,
      aircraftId: "c172",
      callsign: "N172TX",
      difficulty: "beginner",
      personality: "professional",
      snap,
    });

    expect(ctrl.free.phase).toBe("holding-short");
    expect(ctrl.free.dep.airport.icao).toBe("KPAO");
    expect(ctrl.free.dest?.airport.icao).toBe("KMRY");
    expect(ctrl.free.ctx.atis.windKt).toBe(12);
    expect(replies.length).toBeGreaterThan(0);

    const radios = initialSimRadios(ctrl.free);
    expect(radios.com1.active).toBeGreaterThan(117);
    expect(radios.com2.active).toBeGreaterThan(117);

    // Weather change updates ATIS phraseology immediately
    const updatedLeg = syncAtisWithWeather(
      ctrl.free.dep,
      { ...snap.weather, windKt: 18, qnhInHg: 30.12 },
      false,
    );
    expect(updatedLeg.atis.windKt).toBe(18);
    expect(updatedLeg.atis.altimeter).toBe(30.12);
    expect(updatedLeg.atis.phrase.text).toContain("30.12");
  });

  it("extracts live telemetry and respects radio/avionics power failures", () => {
    const scenario = getScenario("free-flight")!;
    const built = scenario.build({ aircraftId: "c172", airport: "KPAO", destination: "KMRY" });
    const engine = new SimEngine(built.options);
    const { ctrl } = initSimAtc({
      built,
      scenario,
      aircraftId: "c172",
      callsign: "N172TX",
      difficulty: "beginner",
      personality: "professional",
      snap: engine.getSnapshot(),
    });

    const okTel = extractTelemetry(engine.getSnapshot(), built, ctrl.free);
    expect(okTel.radiosPowered).toBe(true);
    expect(okTel.distToDestNm).toBeGreaterThan(30);

    engine.setFailure("radios", true);
    const failTel = extractTelemetry(engine.getSnapshot(), built, ctrl.free);
    expect(failTel.radiosPowered).toBe(false);

    // No proactive controller calls fire when radios failed
    const step = stepSimAtc(ctrl, engine.getSnapshot(), built);
    expect(step.replies.some((r) => r.kind === "atc")).toBe(false);
  });

  it("fires proactive climbout, enroute, destination approach/tower/landing/rollout handoffs once", () => {
    const scenario = getScenario("free-flight")!;
    const built = scenario.build({ aircraftId: "c172", airport: "KPAO", destination: "KMRY" });
    const engine = new SimEngine(built.options);
    const { ctrl: c0 } = initSimAtc({
      built,
      scenario,
      aircraftId: "c172",
      callsign: "N172TX",
      difficulty: "beginner",
      personality: "professional",
      snap: engine.getSnapshot(),
    });

    const baseSnap = engine.getSnapshot();

    // Climbout > 450 ft AGL
    const s1 = {
      ...baseSnap,
      aircraft: {
        ...baseSnap.aircraft,
        onGround: false,
        aglFt: 650,
        altMslFt: 655,
        simTimeSec: 25,
      },
      indicated: { ...baseSnap.indicated, altFt: 655 },
    };
    const r1 = stepSimAtc(c0, s1, built);
    expect(r1.changed).toBe(true);
    expect(r1.ctrl.free.currentStation).toBe("departure");
    expect(r1.replies.some((r) => r.kind === "atc")).toBe(true);

    // Stepping again at same spot does not duplicate climbout handoff
    const r1Dup = stepSimAtc(r1.ctrl, s1, built);
    expect(r1Dup.replies).toHaveLength(0);

    // Enroute > 2400 AGL and > 8 nm from KPAO (while > 22 nm from KMRY)
    const mid = destinationPoint(built.departure.lat, built.departure.lon, 150, 14);
    const s2 = {
      ...s1,
      aircraft: {
        ...s1.aircraft,
        lat: mid.lat,
        lon: mid.lon,
        aglFt: 3500,
        altMslFt: 3505,
        simTimeSec: 120,
      },
      indicated: { ...s1.indicated, altFt: 3505 },
    };
    const r2 = stepSimAtc(r1.ctrl, s2, built);
    expect(r2.ctrl.free.leg).toBe("enroute");

    // Approaching KMRY inside 18 nm
    const dest = built.destination!;
    const appPt = destinationPoint(dest.lat, dest.lon, 330, 15);
    const s3 = {
      ...s2,
      aircraft: {
        ...s2.aircraft,
        lat: appPt.lat,
        lon: appPt.lon,
        aglFt: 2500,
        altMslFt: 2700,
        simTimeSec: 360,
      },
      indicated: { ...s2.indicated, altFt: 2700 },
    };
    const r3 = stepSimAtc({ ...r2.ctrl, free: { ...r2.ctrl.free, ffActive: true } }, s3, built);
    expect(r3.ctrl.free.leg).toBe("destination");
    expect(r3.ctrl.free.ctx.airport.icao).toBe("KMRY");

    // 3 nm final at KMRY -> tower handoff + landing clearance
    const finPt = destinationPoint(dest.lat, dest.lon, norm360(280 + 180), 3);
    const s4 = {
      ...s3,
      aircraft: {
        ...s3.aircraft,
        lat: finPt.lat,
        lon: finPt.lon,
        aglFt: 900,
        altMslFt: dest.elevationFt + 900,
        simTimeSec: 460,
      },
      indicated: { ...s3.indicated, altFt: dest.elevationFt + 900 },
    };
    const r4 = stepSimAtc(r3.ctrl, s4, built);
    expect(r4.ctrl.free.phase).toBe("final");
    expect(r4.ctrl.free.pending?.tag).toBe("landing");

    // Touchdown rollout < 38 kt -> landed + ground handoff
    const s5 = {
      ...s4,
      aircraft: {
        ...s4.aircraft,
        onGround: true,
        aglFt: 0,
        gsKt: 20,
        simTimeSec: 495,
      },
    };
    const r5 = stepSimAtc(r4.ctrl, s5, built);
    expect(r5.ctrl.free.phase).toBe("landed");
    expect(r5.ctrl.free.currentStation).toBe("ground");
  });

  it("handles engine failure events and builds context-aware quick calls", () => {
    const scenario = getScenario("free-flight")!;
    const built = scenario.build({ aircraftId: "c172", airport: "KPAO" });
    const engine = new SimEngine(built.options);
    const { ctrl } = initSimAtc({
      built,
      scenario,
      aircraftId: "c172",
      callsign: "N172TX",
      difficulty: "beginner",
      personality: "professional",
      snap: engine.getSnapshot(),
    });

    const evRes = handleSimEvent(ctrl, { t: 10, type: "failure", message: "Engine failure" });
    expect(evRes.replies.some((r) => /Mayday/i.test(r.phrase.text))).toBe(true);

    engine.setFailure("engine", true);
    const calls = simQuickCalls(ctrl.free, null, engine.getSnapshot());
    expect(calls.some((c) => c.label.includes("Mayday"))).toBe(true);
    expect(calls.some((c) => c.label.includes("takeoff") || c.label.includes("clearance"))).toBe(
      true,
    );
  });
});
