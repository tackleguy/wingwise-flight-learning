/**
 * What injected failures do to the aircraft, and the basic electrical system they act on.
 *
 * Failures are switched on in `sim.state.sys.failures` (by the Tests mode, or any future instructor
 * panel). Some are drawn by the instruments module directly (vacuum, pitot, static). This module
 * makes the others happen:
 *
 * - engine:     the engine stops (no air and no fuel get through) — the propeller windmills.
 * - carbIce:    carburettor icing conditions. Ice builds up over about a minute and a half while the
 *               carburettor heat is off, taking more and more power (rough running, rpm dropping);
 *               carburettor heat melts it again in about half a minute. Carburettor heat itself
 *               costs a little power (warm air is thinner), as in the real aircraft.
 * - alternator: the alternator stops charging. The battery then carries every electrical load and
 *               runs down; its voltage sags, the LOW VOLTS light comes on and the ammeter shows a
 *               discharge. Switching things off makes the battery last longer.
 * - radio:      the radios (COM, NAV, transponder) are dead although the bus is alive.
 *
 * Without any failure the electrical system behaves exactly like the simple version it replaces:
 * 28 V with the alternator on line, about 24 V on the battery alone, nothing with the master off.
 */
import type { Sim, SimModule } from "@/core/sim";
import { clamp } from "@/core/math";

/** Battery capacity, ampere-hours (a 24 V, 35 Ah aircraft battery). */
const BATTERY_AH = 35;
/** Bus voltage below which the avionics (radios) stop working, V. */
const AVIONICS_MIN_VOLTS = 20;
/** Carburettor ice: seconds to build from clean to fully iced with the heat off, and to melt with it on. */
const ICE_BUILD_S = 90;
const ICE_MELT_S = 30;
/** Share of power a fully iced carburettor takes away, and what carburettor heat itself costs. */
const ICE_POWER_SHARE = 0.65;
const CARB_HEAT_POWER_SHARE = 0.06;

/** Electrical load, amperes, from what is switched on. */
export function electricalLoadAmps(sim: Sim): number {
  const c = sim.controls;
  if (!c.masterBattery) return 0;
  let a = 4; // instruments, annunciators, flap motor at rest, …
  if (c.avionicsMaster && !sim.state.sys.failures.radio) a += 6;
  const l = c.lights;
  if (l.beacon) a += 2;
  if (l.nav) a += 3;
  if (l.strobe) a += 3;
  if (l.landing) a += 8;
  if (l.taxi) a += 6;
  a += 2 * clamp(l.panel, 0, 1);
  if (c.pitotHeat) a += 10;
  return a;
}

export function createFailureEffects(): SimModule {
  return {
    name: "failure-effects",
    onSpawn(sim) {
      // every new start begins with a healthy aircraft (a test then adds its own failures)
      const y = sim.state.sys;
      y.batteryPct = 100;
      y.carbIce = 0;
      const f = y.failures;
      f.engine = f.alternator = f.vacuum = f.pitot = f.staticPort = f.radio = false;
      f.carbIce = false;
    },
    preStep(sim, dt) {
      const y = sim.state.sys;
      const f = y.failures;
      const fi = sim.fdmIn;
      // carburettor ice
      if (f.carbIce && !sim.controls.carbHeat && y.engineRunning) y.carbIce = Math.min(1, y.carbIce + dt / ICE_BUILD_S);
      else if (sim.controls.carbHeat || !f.carbIce) y.carbIce = Math.max(0, y.carbIce - dt / ICE_MELT_S);
      let loss = fi.powerLoss;
      loss = Math.max(loss, y.carbIce * ICE_POWER_SHARE);
      if (sim.controls.carbHeat && y.engineRunning) loss = Math.max(loss, CARB_HEAT_POWER_SHARE);
      if (f.engine) loss = 1;
      fi.powerLoss = clamp(loss, 0, 1);
    },
    postStep(sim, dt) {
      const c = sim.controls;
      const y = sim.state.sys;
      y.alternatorOnline = c.masterBattery && c.masterAlternator && y.engineRunning && !y.failures.alternator;
      const load = electricalLoadAmps(sim);
      if (!c.masterBattery) {
        y.busVolts = 0;
        y.batteryAmps = 0;
      } else if (y.alternatorOnline) {
        // the alternator carries the load and recharges the battery
        const charge = y.batteryPct < 99.5 ? 6 : 0.5;
        y.batteryPct = Math.min(100, y.batteryPct + ((charge * dt) / (BATTERY_AH * 3600)) * 100);
        y.busVolts = 28;
        y.batteryAmps = charge;
      } else {
        // the battery alone: it runs down, and its voltage sags with the load and as it empties
        y.batteryPct = Math.max(0, y.batteryPct - ((load * dt) / (BATTERY_AH * 3600)) * 100);
        const charge = y.batteryPct / 100;
        const rest = charge > 0.2 ? 24.2 : 18 + (6.2 * charge) / 0.2;
        y.busVolts = Math.max(0, rest - load * 0.012);
        y.batteryAmps = -load;
      }
      y.avionicsPowered = c.masterBattery && c.avionicsMaster && y.busVolts > AVIONICS_MIN_VOLTS && !y.failures.radio;
    },
  };
}
