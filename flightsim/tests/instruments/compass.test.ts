import { describe, expect, it } from "vitest";
import { magneticField, magneticVariation, trueToMag } from "@/core/magvar";
import { compassDeviation } from "@/instruments";
import { cruise, makeRig, norm180 } from "./pilot";

/** Places used: about 67° of dip down (USA), 66° of dip up (Australia), and almost no dip (Peru, on the magnetic equator). */
const NORTH = { lat: 40, lon: -100 };
const SOUTH = { lat: -35, lon: 149 };
const MAG_EQUATOR = { lat: -12, lon: -77 };

/** Start in cruise on a given MAGNETIC heading at a place; fly straight for a while so everything is settled. */
async function onHeading(place: { lat: number; lon: number }, magHeading: number, kias = 100) {
  const headingTrue = (magHeading + magneticVariation(place.lat, place.lon) + 360) % 360;
  const rig = await makeRig(cruise(headingTrue, place.lat, place.lon, { kias }));
  rig.pilot.fly(12, { altFt: 3500, headingTrue, kcas: kias });
  const s = rig.sim.state;
  /** Compass reading minus the real magnetic heading, degrees (+ = compass shows a heading further clockwise). */
  const error = () => norm180(s.ind.compassMag - trueToMag(s.headingTrue, s.magVar));
  return { ...rig, headingTrue, error };
}

/** Roll into a turn and record the compass error over the next seconds. */
async function rollIn(place: { lat: number; lon: number }, magHeading: number, bankDeg: number) {
  const r = await onHeading(place, magHeading);
  const s = r.sim.state;
  const start = { error: r.error(), compass: s.ind.compassMag, heading: s.headingTrue };
  let min = Infinity;
  let max = -Infinity;
  let compassSwing = 0; // how far the compass reading itself moved against (−) or with (+) the turn, worst case early on
  r.pilot.fly(5, { altFt: 3500, bankDeg, kcas: 100 }, () => {
    min = Math.min(min, r.error());
    max = Math.max(max, r.error());
    const moved = norm180(s.ind.compassMag - start.compass) * Math.sign(bankDeg);
    compassSwing = Math.min(compassSwing, moved);
  });
  const turned = norm180(s.headingTrue - start.heading);
  r.pilot.fly(7, { altFt: 3500, bankDeg, kcas: 100 });
  return { start, min, max, compassSwing, turned, late: r.error() };
}

describe("magnetic field helper", () => {
  it("gives sensible dip angles around the world", () => {
    const usa = magneticField(40, -100);
    expect(usa.inclDeg).toBeGreaterThan(60);
    expect(usa.inclDeg).toBeLessThan(72);
    expect(usa.horizNt).toBeGreaterThan(15000);
    expect(usa.horizNt).toBeLessThan(26000);
    expect(usa.declDeg).toBeCloseTo(magneticVariation(40, -100), 6);
    expect(magneticField(-35, 149).inclDeg).toBeLessThan(-60); // southern hemisphere: the field points up out of the ground
    expect(Math.abs(magneticField(-12, -77).inclDeg)).toBeLessThan(6); // on the magnetic equator
    expect(magneticField(69.7, 19).horizNt).toBeLessThan(13000); // weak horizontal field near the pole
    expect(magneticField(69.7, 19).totalNt).toBeGreaterThan(50000);
  });
});

describe("magnetic compass", () => {
  it("is accurate in straight, level, unaccelerated flight (apart from the small fixed deviation)", async () => {
    for (const mag of [0, 45, 90, 180, 270, 315]) {
      const r = await onHeading(NORTH, mag);
      const s = r.sim.state;
      let worst = 0;
      r.pilot.fly(15, { altFt: 3500, headingTrue: r.headingTrue, kcas: 100 }, () => {
        const magnetic = trueToMag(s.headingTrue, s.magVar);
        worst = Math.max(worst, Math.abs(norm180(s.ind.compassMag - magnetic - compassDeviation(magnetic))));
      });
      expect(worst, `heading ${mag}`).toBeLessThan(0.6);
      expect(Math.abs(r.error())).toBeLessThan(2.1);
    }
    for (let h = 0; h < 360; h += 5) expect(Math.abs(compassDeviation(h))).toBeLessThanOrEqual(2);
  });

  it("northern hemisphere, turning from NORTH: first shows a turn the wrong way, then lags", async () => {
    const right = await rollIn(NORTH, 0, 16);
    expect(right.turned).toBeGreaterThan(4); // the aircraft is turning right (east) …
    expect(right.compassSwing).toBeLessThan(-12); // … but the compass swings more than 12° to the LEFT (west)
    expect(right.min).toBeLessThan(-20);
    expect(right.late).toBeLessThan(-20); // 12 s into the turn it still lags far behind

    const left = await rollIn(NORTH, 0, -16);
    expect(left.turned).toBeLessThan(-4);
    expect(left.compassSwing).toBeLessThan(-12); // mirror image: swings right while turning left
    expect(left.max).toBeGreaterThan(20);
    expect(left.late).toBeGreaterThan(20);
  });

  it("northern hemisphere, turning from SOUTH: leads the turn", async () => {
    const right = await rollIn(NORTH, 180, 16);
    expect(right.turned).toBeGreaterThan(4);
    expect(right.compassSwing).toBeGreaterThan(-1); // never goes the wrong way
    expect(right.max).toBeGreaterThan(20); // shows much more turn than has been made
    expect(right.late).toBeGreaterThan(12);

    const left = await rollIn(NORTH, 180, -16);
    expect(left.min).toBeLessThan(-20);
    expect(left.late).toBeLessThan(-12);
  });

  it("southern hemisphere: the turning errors are reversed", async () => {
    const fromNorth = await rollIn(SOUTH, 0, 16);
    expect(fromNorth.compassSwing).toBeGreaterThan(-1); // from north it now LEADS
    expect(fromNorth.max).toBeGreaterThan(20);
    expect(fromNorth.late).toBeGreaterThan(12);

    const fromSouth = await rollIn(SOUTH, 180, 16);
    expect(fromSouth.compassSwing).toBeLessThan(-12); // from south it first goes the wrong way and lags
    expect(fromSouth.min).toBeLessThan(-20);
    expect(fromSouth.late).toBeLessThan(-20);
  });

  it("on the magnetic equator there is practically no turning error", async () => {
    for (const mag of [0, 180]) {
      const r = await rollIn(MAG_EQUATOR, mag, 16);
      expect(Math.abs(r.min)).toBeLessThan(5);
      expect(Math.abs(r.max)).toBeLessThan(5);
      expect(Math.abs(r.late)).toBeLessThan(5);
    }
  });

  it("acceleration error on east/west headings: Accelerate North, Decelerate South (northern hemisphere)", async () => {
    // ---- heading east
    const east = await onHeading(NORTH, 90, 80);
    expect(Math.abs(east.error())).toBeLessThan(2.1);
    east.pilot.fly(6, { altFt: 3500, headingTrue: east.headingTrue, throttle: 1 });
    expect(east.sim.state.kcas).toBeGreaterThan(86); // speeding up
    expect(east.error()).toBeLessThan(-8); // reads less than 090: swung toward north
    east.pilot.fly(8, { altFt: 3500, headingTrue: east.headingTrue, throttle: 0 });
    expect(east.error()).toBeGreaterThan(8); // slowing down: reads more than 090, toward south

    // ---- heading west: the reading still swings toward north when accelerating (so the sign of the error flips)
    const west = await onHeading(NORTH, 270, 80);
    west.pilot.fly(6, { altFt: 3500, headingTrue: west.headingTrue, throttle: 1 });
    expect(west.error()).toBeGreaterThan(8);
    west.pilot.fly(8, { altFt: 3500, headingTrue: west.headingTrue, throttle: 0 });
    expect(west.error()).toBeLessThan(-8);

    // ---- heading north: speeding up or slowing down makes no difference
    const north = await onHeading(NORTH, 0, 80);
    let worst = 0;
    const watch = () => (worst = Math.max(worst, Math.abs(north.error())));
    north.pilot.fly(6, { altFt: 3500, headingTrue: north.headingTrue, throttle: 1 }, watch);
    north.pilot.fly(8, { altFt: 3500, headingTrue: north.headingTrue, throttle: 0 }, watch);
    expect(worst).toBeLessThan(5);
  });

  it("acceleration error is reversed in the southern hemisphere and absent on the magnetic equator", async () => {
    const south = await onHeading(SOUTH, 90, 80);
    south.pilot.fly(6, { altFt: 3500, headingTrue: south.headingTrue, throttle: 1 });
    expect(south.error()).toBeGreaterThan(8); // accelerating east: swings toward SOUTH here
    south.pilot.fly(8, { altFt: 3500, headingTrue: south.headingTrue, throttle: 0 });
    expect(south.error()).toBeLessThan(-8);

    const equator = await onHeading(MAG_EQUATOR, 90, 80);
    let worst = 0;
    equator.pilot.fly(6, { altFt: 3500, headingTrue: equator.headingTrue, throttle: 1 }, () => (worst = Math.max(worst, Math.abs(equator.error()))));
    expect(worst).toBeLessThan(4);
  });

  it("swings after a manoeuvre and is accurate again a few seconds after rolling out", async () => {
    const r = await onHeading(NORTH, 300);
    const s = r.sim.state;
    r.pilot.fly(25, { altFt: 3500, bankDeg: 20, kcas: 100 }); // turn right through north
    expect(Math.abs(r.error())).toBeGreaterThan(15); // badly wrong in the turn
    // roll out and hold wings level
    let overshoot = 0;
    const errAtRollout = r.error();
    r.pilot.fly(6, { altFt: 3500, bankDeg: 0, kcas: 100 }, () => {
      // the card swings back through the correct value before it settles (damped oscillation)
      if (Math.sign(r.error()) === -Math.sign(errAtRollout)) overshoot = Math.max(overshoot, Math.abs(r.error()));
    });
    expect(overshoot).toBeGreaterThan(0.5);
    expect(overshoot).toBeLessThan(12);
    r.pilot.fly(4, { altFt: 3500, bankDeg: 0, kcas: 100 });
    // ten seconds after starting the roll-out: correct again to within the deviation
    expect(Math.abs(s.roll)).toBeLessThan(2);
    expect(Math.abs(r.error())).toBeLessThan(2.5);
  });

  it("jams against its bowl when the cabin is tilted too far from 'apparent down', and frees itself afterwards", async () => {
    const r = await onHeading(NORTH, 90);
    const { sim, pilot, inst } = r;
    expect(inst.status.compassDragging).toBe(false);
    // Normal turns and climbs never do this (the card hangs with the apparent vertical, like the
    // slip ball). A near knife-edge bank held without turning does: everything sags toward the low wing.
    let dragged = false;
    pilot.fly(5, { bankDeg: 85, pitchDeg: 0, rudder: 0 }, () => (dragged ||= inst.status.compassDragging));
    expect(dragged).toBe(true);
    pilot.fly(20, { pitchDeg: 2, bankDeg: 0, throttle: 0.5 });
    pilot.syncPitch();
    pilot.fly(45, { altFt: sim.state.altMslFt, headingTrue: sim.state.headingTrue, kcas: 100 });
    expect(inst.status.compassDragging).toBe(false);
    expect(Math.abs(r.error())).toBeLessThan(2.5);
  });
});
