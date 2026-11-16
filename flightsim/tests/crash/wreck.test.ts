/**
 * Crash physics (src/crash/wreck.ts) with the real Rapier engine on flat ground.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { getAircraft } from "@/aircraft/catalog";
import { FG_MODELS } from "@/aircraft/fg-models.gen";
import { Wreck, loadRapier, type Airframe, type PartName, type WreckStart } from "@/crash/wreck";

type Rapier = Awaited<ReturnType<typeof loadRapier>>;
let R: Rapier;
beforeAll(async () => {
  R = await loadRapier();
});

const LB = 0.45359237;

function airframe(id: "c172p" | "pa28" | "A320" = "c172p", gearDown = true): Airframe {
  const parts = FG_MODELS[id].crash!.parts;
  return {
    massKg: (id === "A320" ? 140000 : 2300) * LB,
    gearDown,
    parts: Object.entries(parts).map(([name, p]) => ({ name: name as PartName, nodes: p!.nodes, min: p!.min, max: p!.max })),
  };
}

const flat = () => 100;

function start(over: Partial<WreckStart> = {}): WreckStart {
  return {
    lat: 37.6,
    lon: -122.1,
    altMslFt: 100 + getAircraft("c172p").cgHeightFt,
    groundElevFt: 100,
    headingTrue: 90,
    pitch: 0,
    roll: 0,
    vNorthKt: 0,
    vEastKt: 0,
    vsFpm: 0,
    rollRate: 0,
    pitchRate: 0,
    yawRate: 0,
    ...over,
  };
}

/** Run until settled (or `max` s); returns the wreck and the impacts seen. */
function run(w: Wreck, max = 40) {
  const impacts = [];
  for (let t = 0; t < max && !w.settled; t += 1 / 30) {
    w.step(1 / 30);
    impacts.push(...w.drainImpacts());
    const p = w.pose();
    expect(Number.isFinite(p.lat + p.lon + p.altMslFt + p.pitch + p.roll + p.headingTrue)).toBe(true);
  }
  return impacts;
}

const detached = (w: Wreck) => w.parts.filter((p) => p.detached).map((p) => p.name).sort();
const distanceM = (w: Wreck, s: WreckStart) => {
  const p = w.pose();
  return Math.hypot((p.lat - s.lat) * 111120, (p.lon - s.lon) * 111120 * Math.cos(s.lat * (Math.PI / 180)));
};

describe("crash physics", () => {
  it("keeps the attitude and position it is given", () => {
    const s = start({ altMslFt: 1100, headingTrue: 123, pitch: 5, roll: -10 });
    const w = Wreck.create(R, airframe(), s, flat);
    const p = w.pose();
    // (the physics engine works in single precision)
    expect(p.headingTrue).toBeCloseTo(123, 4);
    expect(p.pitch).toBeCloseTo(5, 4);
    expect(p.roll).toBeCloseTo(-10, 4);
    expect(p.lat).toBeCloseTo(s.lat, 7);
    expect(p.lon).toBeCloseTo(s.lon, 7);
    expect(p.altMslFt).toBeCloseTo(1100, 1);
    w.dispose();
  });

  it("an aircraft standing on its wheels stays standing; nothing breaks", () => {
    const w = Wreck.create(R, airframe(), start(), flat);
    run(w, 10);
    expect(w.settled).toBe(true);
    expect(detached(w)).toEqual([]);
    for (const g of ["gear_left", "gear_right", "gear_nose"] as const) expect(Math.abs(w.clearanceM(g)), g).toBeLessThan(0.05); // on its three wheels
    expect(w.clearanceM("body")).toBeGreaterThan(0.1);
    expect(Math.abs(w.pose().pitch)).toBeLessThan(6);
    expect(Math.abs(w.pose().roll)).toBeLessThan(5);
    w.dispose();
  });

  it("a firm touchdown (300 ft/min) does not break the landing gear", () => {
    const w = Wreck.create(R, airframe(), start({ altMslFt: 100 + getAircraft("c172p").cgHeightFt + 0.3, vEastKt: 50, vsFpm: -300 }), flat);
    run(w, 4);
    expect(detached(w)).toEqual([]);
    w.dispose();
  });

  it("a very hard landing (1,500 ft/min) breaks the landing gear and the aircraft comes down on its fuselage", () => {
    const s = start({ vEastKt: 55, vsFpm: -1500, pitch: 4 });
    const w = Wreck.create(R, airframe(), s, flat);
    const impacts = run(w);
    expect(w.settled).toBe(true);
    // a main leg breaks (often only one: the aircraft then leans over onto that side)
    expect(detached(w).filter((n) => n === "gear_left" || n === "gear_right").length).toBeGreaterThan(0);
    const lowest = Math.min(w.clearanceM("body"), w.clearanceM("wing_left"), w.clearanceM("wing_right"));
    expect(lowest).toBeLessThan(0.15); // down on the fuselage or a wing
    expect(lowest).toBeGreaterThan(-0.15); // …not in the ground
    expect(Math.abs(w.pose().roll)).toBeLessThan(45);
    const d = distanceM(w, s);
    expect(d).toBeGreaterThan(15);
    expect(d).toBeLessThan(250);
    expect(impacts.some((i) => i.broke)).toBe(true);
    w.dispose();
  });

  it("gear broken by the crash itself comes off at once", () => {
    const w = Wreck.create(R, airframe(), start({ vEastKt: 50, vsFpm: -1100, broken: ["gear_left", "gear_right", "gear_nose"] }), flat);
    expect(detached(w)).toEqual(["gear_left", "gear_nose", "gear_right"]);
    run(w);
    expect(w.clearanceM("body")).toBeLessThan(0.15);
    w.dispose();
  });

  it("a wing tip touching at taxi speed does not tear the wing off", () => {
    const w = Wreck.create(R, airframe(), start({ altMslFt: 100 + getAircraft("c172p").cgHeightFt + 0.4, vEastKt: 15, vsFpm: -150, roll: 22 }), flat);
    run(w, 8);
    expect(detached(w).filter((n) => n.startsWith("wing"))).toEqual([]);
    w.dispose();
  });

  it("a steep dive into the ground at 80 kt breaks the aircraft apart; nothing ends up in the ground", () => {
    const s = start({ altMslFt: 108, vEastKt: 70, vsFpm: -4000, pitch: -35, roll: 20, rollRate: 15 });
    const w = Wreck.create(R, airframe(), s, flat);
    const impacts = run(w);
    expect(w.settled).toBe(true);
    const gone = detached(w);
    expect(gone.length).toBeGreaterThanOrEqual(2);
    expect(gone.some((n) => n.startsWith("wing") || n === "tail")).toBe(true);
    expect(impacts.length).toBeGreaterThan(2);
    expect(Math.max(...impacts.map((i) => i.strength))).toBeGreaterThan(0.5);
    for (const p of w.parts) if (!p.hidden) expect(w.clearanceM(p.name), p.name).toBeGreaterThan(-0.3);
    // broken-off pieces have moved away from where they were on the fuselage
    const moved = w.parts.filter((p) => p.detached && !p.hidden).map((p) => Math.hypot(p.delta[12]!, p.delta[13]!, p.delta[14]!));
    expect(Math.max(...moved)).toBeGreaterThan(0.5);
    w.dispose();
  });

  it("a gear-up landing with retractable gear slides on the belly (A320)", () => {
    const s = start({ altMslFt: 100 + 9, vEastKt: 130, vsFpm: -600 });
    const w = Wreck.create(R, airframe("A320", false), s, flat);
    run(w);
    expect(w.settled).toBe(true);
    expect(w.clearanceM("body")).toBeLessThan(0.2);
    expect(w.clearanceM("body")).toBeGreaterThan(-0.2);
    w.dispose();
  });
});
