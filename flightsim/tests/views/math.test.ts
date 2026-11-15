import { describe, expect, it } from "vitest";
import { distanceNm, localOffsetM } from "@/core/math";
import { initialState } from "@/core/defaults";
import {
  GEAR_TRAVEL,
  PHYSICS_DT,
  StepLead,
  approach,
  approachAngle,
  autoZoomFovDeg,
  axisNdcForFraction,
  cesiumFovRad,
  clampLook,
  gearShiftM,
  observerSite,
  pickTowerSite,
  predictPose,
  screenFractionOfElevation,
  smootherstep,
  verticalFovDeg,
} from "@/views/math";
import { worldData } from "../helpers";

describe("camera arithmetic", () => {
  it("gives about 75° across on a 16:9 screen and stays sensible on other shapes", () => {
    const v = verticalFovDeg(75, 16 / 9);
    expect(v).toBeGreaterThan(46);
    expect(v).toBeLessThan(47.5);
    expect((cesiumFovRad(v, 16 / 9) * 180) / Math.PI).toBeCloseTo(75, 1);
    // a tall phone: vertical field of view is capped, CesiumJS gets the vertical angle
    const tall = verticalFovDeg(75, 9 / 16);
    expect(tall).toBe(82);
    expect((cesiumFovRad(tall, 9 / 16) * 180) / Math.PI).toBeCloseTo(82, 5);
    // a very wide monitor keeps a minimum vertical view
    expect(verticalFovDeg(75, 32 / 9)).toBe(38);
  });

  it("puts the horizon where the panel wants it without pitching the camera", () => {
    const axis = axisNdcForFraction(0.33);
    expect(axis).toBeCloseTo(0.34, 6);
    // the line of sight itself (elevation 0) lands at the requested fraction, for any field of view
    for (const fov of [30, 56, 75]) expect(screenFractionOfElevation(0, fov, axis)).toBeCloseTo(0.33, 6);
    expect(screenFractionOfElevation(0, 50, axisNdcForFraction(0.5))).toBeCloseTo(0.5, 6);
    // things below the horizon appear lower on the screen, above it higher
    expect(screenFractionOfElevation(-10, 56, axis)).toBeGreaterThan(0.33);
    expect(screenFractionOfElevation(+5, 56, axis)).toBeLessThan(0.33);
    // the top and bottom edges of the screen
    const half = 28;
    const up = (Math.atan(Math.tan((half * Math.PI) / 180) * (1 - axis)) * 180) / Math.PI;
    expect(screenFractionOfElevation(up, 56, axis)).toBeCloseTo(0, 6);
  });

  it("smooths without overshoot and independent of frame rate", () => {
    let a = 0;
    for (let i = 0; i < 60; i++) a = approach(a, 1, 1 / 60, 0.3);
    let b = 0;
    for (let i = 0; i < 240; i++) b = approach(b, 1, 1 / 240, 0.3);
    expect(a).toBeCloseTo(b, 6);
    expect(a).toBeGreaterThan(0.95);
    expect(a).toBeLessThan(1);
    // headings go the short way round through north
    const cw = approachAngle(350, 10, 0.02, 0.1);
    expect(cw).toBeGreaterThan(350);
    expect(cw).toBeLessThan(360);
    const ccw = approachAngle(10, 350, 0.02, 0.1);
    expect(ccw).toBeLessThan(10);
    expect(ccw).toBeGreaterThan(0);
    // … and wrap correctly when they cross it
    expect(approachAngle(350, 10, 0.1, 0.1)).toBeCloseTo(350 + 20 * (1 - Math.exp(-1)) - 360, 6);
    expect(smootherstep(0)).toBe(0);
    expect(smootherstep(1)).toBe(1);
    expect(smootherstep(0.5)).toBeCloseTo(0.5, 6);
  });

  it("limits head movement to what a neck can do", () => {
    expect(clampLook(200, 80)).toEqual({ yaw: 150, pitch: 60 });
    expect(clampLook(-200, -80)).toEqual({ yaw: -150, pitch: -40 });
  });

  it("zooms the tower camera so the aircraft keeps its size", () => {
    const near = autoZoomFovDeg(200, 11, 0.2, 1.6, 62);
    const far = autoZoomFovDeg(2000, 11, 0.2, 1.6, 62);
    expect(near).toBeGreaterThan(far * 8);
    // 11 m at 2 km fills a fifth of a view this wide
    expect((11 / 2000 / ((far * Math.PI) / 180)) as number).toBeCloseTo(0.2, 1);
    expect(autoZoomFovDeg(5, 11, 0.2, 1.6, 62)).toBe(62);
    expect(autoZoomFovDeg(1e6, 11, 0.2, 1.6, 62)).toBe(1.6);
  });
});

describe("smooth motion between physics steps", () => {
  it("tracks the time the physics lags behind the frame clock", () => {
    const lead = new StepLead();
    // 60 fps with a small timing wobble: frames of 15, 18, 16, 17.7 ms; physics steps are 8.33 ms
    let simTime = 0;
    let acc = 0;
    let real = 0;
    lead.update(0, 0, 1, true);
    for (const dt of [0.015, 0.018, 0.016, 0.0177, 0.0166, 0.0167, 0.015, 0.0185]) {
      acc += dt;
      real += dt;
      const steps = Math.floor(acc / PHYSICS_DT);
      acc -= steps * PHYSICS_DT;
      simTime += steps * PHYSICS_DT;
      const l = lead.update(simTime, dt, 1, true);
      expect(l).toBeGreaterThanOrEqual(0);
      expect(l).toBeLessThanOrEqual(PHYSICS_DT + 1e-12);
      // physics time + lead = real time: the drawn position advances evenly
      expect(simTime + l).toBeCloseTo(real, 9);
    }
    // paused: nothing to predict
    expect(lead.update(simTime, 0.016, 1, false)).toBe(0);
    // a respawn (simulation time jumps back) resets it
    expect(lead.update(0, 0.016, 1, true)).toBe(0);
  });

  it("predicts the pose along the velocity and the turn", () => {
    const s = initialState();
    Object.assign(s, { lat: 37, lon: -122, altMslFt: 1000, headingTrue: 90, pitch: 2, roll: 0, vNorthKt: 0, vEastKt: 120, vsFpm: 600, turnRate: 3, pitchRate: 1.2, rollRate: -6, yawRate: 0 });
    const out = { lat: 0, lon: 0, altMslFt: 0, headingTrue: 0, pitch: 0, roll: 0 };
    predictPose(s, PHYSICS_DT, out);
    // 120 kt for 1/120 s = 0.514 m east
    const movedM = distanceNm(37, -122, out.lat, out.lon) * 1852;
    expect(movedM).toBeGreaterThan(0.5);
    expect(movedM).toBeLessThan(0.53);
    expect(out.lon).toBeGreaterThan(-122);
    expect(out.lat).toBeCloseTo(37, 9);
    expect(out.altMslFt).toBeCloseTo(1000 + 10 * PHYSICS_DT, 6);
    expect(out.headingTrue).toBeCloseTo(90 + 3 * PHYSICS_DT, 6);
    expect(out.pitch).toBeCloseTo(2 + 1.2 * PHYSICS_DT, 6);
    expect(out.roll).toBeCloseTo(-6 * PHYSICS_DT, 6);
    // no lead = the state itself
    predictPose(s, 0, out);
    expect(out).toEqual({ lat: 37, lon: -122, altMslFt: 1000, headingTrue: 90, pitch: 2, roll: 0 });
  });
});

describe("landing gear legs", () => {
  it("put the tyre on the ground when it is close, and let the wheel hang in flight", () => {
    // 3 cm above the ground with a rigid leg: the wheel comes down 3 cm
    expect(gearShiftM(0.03, 0.05)).toBeCloseTo(-0.03, 9);
    // 4 cm into the ground: the leg gives 4 cm
    expect(gearShiftM(-0.04, 0.05)).toBeCloseTo(0.04, 9);
    // limits of travel
    expect(gearShiftM(-1, 0.05)).toBe(GEAR_TRAVEL.up);
    // in flight the wheel hangs at its extended position — the same position at which it first touches
    expect(gearShiftM(5, 0.05)).toBe(-0.05);
    expect(gearShiftM(0.05, 0.05)).toBeCloseTo(-0.05, 9);
    expect(gearShiftM(0.0501, 0.05)).toBe(-0.05);
  });
});

describe("tower position (synthetic — the open data has no tower positions)", () => {
  const data = worldData();

  it("stands beside the runway in use, clear of the other runways", () => {
    const ksfo = data.getAirport("KSFO")!;
    const site = pickTowerSite(data, ksfo.lat, ksfo.lon, { airportIdent: "KSFO", runwayEndId: "28R" })!;
    expect(site).not.toBeNull();
    expect(site.airportIdent).toBe("KSFO");
    expect(site.runwayName).toContain("28R");
    expect(site.synthetic).toBe(true);
    expect(site.heightAglFt).toBeGreaterThanOrEqual(60);
    expect(site.heightAglFt).toBeLessThanOrEqual(100);
    // a long runway: the tower stays near the end in use (a light aircraft is down long before the middle)
    const rw = ksfo.runways.find((r) => r.name.includes("28R"))!;
    const end = rw.ends.find((e) => e.id === "28R")!;
    const fromThreshold = localOffsetM(end.lat, end.lon, site.lat, site.lon);
    const h = (end.headingTrue * Math.PI) / 180;
    const along = fromThreshold.north * Math.cos(h) + fromThreshold.east * Math.sin(h);
    const across = Math.abs(fromThreshold.east * Math.cos(h) - fromThreshold.north * Math.sin(h));
    expect(along).toBeGreaterThan(700);
    expect(along).toBeLessThan(900);
    expect(across).toBeGreaterThan(100);
    expect(across).toBeLessThan(400);
    // a short runway: beside the middle
    const kpao = data.getAirport("KPAO")!;
    const short = pickTowerSite(data, kpao.lat, kpao.lon, { airportIdent: "KPAO", runwayEndId: kpao.runways[0]!.ends[0].id })!;
    const r0 = kpao.runways[0]!;
    const dMid = distanceNm(short.lat, short.lon, (r0.ends[0].lat + r0.ends[1].lat) / 2, (r0.ends[0].lon + r0.ends[1].lon) / 2) * 1852;
    expect(dMid).toBeGreaterThan(100);
    expect(dMid).toBeLessThan(330);
    // not standing on any runway of the airport
    for (const other of ksfo.runways) {
      const a = other.ends[0];
      const b = other.ends[1];
      for (let t = 0; t <= 1; t += 0.02) {
        const d = distanceNm(site.lat, site.lon, a.lat + (b.lat - a.lat) * t, a.lon + (b.lon - a.lon) * t) * 1852;
        expect(d).toBeGreaterThan(60);
      }
    }
  });

  it("falls back to the nearest airport, or to a plain observer far from any airport", () => {
    const kpao = data.getAirport("KPAO")!;
    const site = pickTowerSite(data, kpao.lat + 0.01, kpao.lon, null)!;
    expect(site.airportIdent).toBe("KPAO");
    // spawn airport too far away is ignored in favour of the nearest one
    const far = pickTowerSite(data, kpao.lat, kpao.lon, { airportIdent: "KJFK", runwayEndId: "04L" })!;
    expect(far.airportIdent).toBe("KPAO");
    // middle of the Pacific: no airport within range
    expect(pickTowerSite(data, 0, -140, null)).toBeNull();
    const obs = observerSite(0, -140, 90, 0);
    expect(obs.airportIdent).toBeNull();
    const d = distanceNm(0, -140, obs.lat, obs.lon) * 1852;
    expect(d).toBeGreaterThan(400);
    expect(d).toBeLessThan(600);
  });
});
