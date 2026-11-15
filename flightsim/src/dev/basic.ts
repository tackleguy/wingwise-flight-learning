/**
 * Bare-minimum camera, aircraft marker and keyboard for the developer test pages (dev/*.html).
 * The real modules (src/views, src/input) replace these in the app.
 */
import { BoxGeometry, Cartesian3, Color, ColorGeometryInstanceAttribute, GeometryInstance, Matrix3, Matrix4, PerInstanceColorAppearance, Primitive } from "cesium";
import { CG_HEIGHT_FT } from "@/core/defaults";
import { M_PER_FT, clamp } from "@/core/math";
import type { Sim, SimModule } from "@/core/sim";
import { aircraftMatrix, type World } from "@/world/world";

/** A simple box-and-wing aircraft so there is something to look at. Local axes: +X nose, +Y left, +Z up. */
export function basicAircraft(world: World): SimModule {
  const mk = (dims: [number, number, number], offset: [number, number, number], css: string) =>
    new Primitive({
      geometryInstances: new GeometryInstance({
        geometry: BoxGeometry.fromDimensions({ dimensions: new Cartesian3(...dims), vertexFormat: PerInstanceColorAppearance.VERTEX_FORMAT }),
        modelMatrix: Matrix4.fromTranslation(new Cartesian3(...offset)),
        attributes: { color: ColorGeometryInstanceAttribute.fromColor(Color.fromCssColorString(css)) },
      }),
      appearance: new PerInstanceColorAppearance({ flat: false, translucent: false }),
      asynchronous: false,
    });
  // fuselage, wing (high), tailplane, fin — z is measured from the wheels' contact point
  const parts = [mk([7.2, 1.1, 1.3], [-0.6, 0, 1.25], "#f4f4f4"), mk([1.5, 11, 0.16], [0.1, 0, 2.05], "#d9261c"), mk([0.9, 3.4, 0.1], [-4.0, 0, 1.4], "#f4f4f4"), mk([1.0, 0.1, 1.5], [-4.0, 0, 2.1], "#d9261c")];
  for (const p of parts) world.scene.primitives.add(p);
  const m = new Matrix4();
  return {
    name: "basic-aircraft",
    frame(sim: Sim) {
      const s = sim.state;
      aircraftMatrix(s.lat, s.lon, s.altMslFt - CG_HEIGHT_FT, s.headingTrue, s.pitch, s.roll, m);
      for (const p of parts) p.modelMatrix = m;
    },
    dispose() {
      for (const p of parts) world.scene.primitives.remove(p);
    },
  };
}

/** Chase camera that follows behind and above the aircraft. */
export function basicChaseCamera(world: World, distanceM = 22, heightM = 5): SimModule {
  const m = new Matrix4();
  const rot = new Matrix3();
  const pos = new Cartesian3();
  const dir = new Cartesian3();
  const up = new Cartesian3();
  const local = new Cartesian3();
  return {
    name: "basic-camera",
    frame(sim: Sim) {
      const s = sim.state;
      // follow heading only (no pitch/roll) so the horizon stays level
      aircraftMatrix(s.lat, s.lon, s.altMslFt, s.headingTrue, 0, 0, m);
      Matrix4.multiplyByPoint(m, Cartesian3.fromElements(-distanceM, 0, heightM, local), pos);
      Matrix4.getMatrix3(m, rot);
      Matrix3.multiplyByVector(rot, Cartesian3.normalize(Cartesian3.fromElements(distanceM, 0, -heightM * 0.6, local), local), dir);
      Matrix3.multiplyByVector(rot, Cartesian3.UNIT_Z, up);
      world.camera.setView({ destination: pos, orientation: { direction: dir, up } });
    },
  };
}

/** Arrow keys = yoke, A/D or ,/. = rudder, PageUp/PageDown or W/S = throttle, F = flaps, B = brakes, P = pause. */
export function basicKeyboard(): SimModule {
  const down = new Set<string>();
  const onDown = (e: KeyboardEvent) => {
    down.add(e.code);
    if (e.code.startsWith("Arrow") || e.code === "Space") e.preventDefault();
  };
  const onUp = (e: KeyboardEvent) => down.delete(e.code);
  window.addEventListener("keydown", onDown);
  window.addEventListener("keyup", onUp);
  let flapLatch = false;
  let brakeLatch = false;
  let pauseLatch = false;
  return {
    name: "basic-keyboard",
    frame(sim: Sim, dt: number) {
      const c = sim.controls;
      const axis = (neg: string[], pos: string[], cur: number, rate = 2.5) => {
        const target = (pos.some((k) => down.has(k)) ? 1 : 0) - (neg.some((k) => down.has(k)) ? 1 : 0);
        return cur + clamp(target - cur, -rate * dt, rate * dt);
      };
      c.elevator = axis(["ArrowUp"], ["ArrowDown"], c.elevator);
      c.aileron = axis(["ArrowLeft"], ["ArrowRight"], c.aileron);
      c.rudder = axis(["KeyA", "Comma"], ["KeyD", "Period"], c.rudder);
      if (down.has("PageUp") || down.has("KeyW")) c.throttle = clamp(c.throttle + 0.6 * dt, 0, 1);
      if (down.has("PageDown") || down.has("KeyS")) c.throttle = clamp(c.throttle - 0.6 * dt, 0, 1);
      const f = down.has("KeyF");
      if (f && !flapLatch) c.flapIndex = (c.flapIndex + (down.has("ShiftLeft") ? 3 : 1)) % 4;
      flapLatch = f;
      const b = down.has("KeyB");
      if (b && !brakeLatch) c.parkingBrake = !c.parkingBrake;
      brakeLatch = b;
      const brake = down.has("Space") ? 1 : 0;
      c.brakeLeft = c.brakeRight = brake;
      const p = down.has("KeyP");
      if (p && !pauseLatch) sim.setPaused(!sim.paused);
      pauseLatch = p;
    },
    dispose() {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
    },
  };
}

export const ftToM = (ft: number) => ft * M_PER_FT;
