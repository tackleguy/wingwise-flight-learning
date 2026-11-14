/**
 * Keyboard flight controls. Held keys ramp the control surfaces smoothly; releasing them lets
 * the controls return to neutral (like letting go of a spring-loaded yoke).
 *
 *  Pitch: W/↑ push (nose down), S/↓ pull (nose up)   Roll: A/← left, D/→ right
 *  Rudder: Q / E        Throttle: + / Shift (up), - / Ctrl (down), PageUp/PageDown
 *  Flaps: F down, V up  Gear: G   Brakes: B (hold) or .   Parking brake: P
 *  Trim: [ nose down, ] nose up   Autopilot: Z   Camera: C (cycle) or 1–4   Pause: Space
 */
import { useEffect, useRef } from "react";
import type { SimEngine } from "@/sim/engine";
import type { CameraMode } from "./World3D";

const CAMERAS: CameraMode[] = ["cockpit", "chase", "orbit", "tower"];

export function useFlightControls(
  engine: SimEngine | null,
  opts: {
    invertPitch: boolean;
    sensitivity: number;
    enabled: boolean;
    onCamera: (c: CameraMode | "next") => void;
    onPause: () => void;
  },
) {
  const optsRef = useRef(opts);
  optsRef.current = opts;
  // Virtual (on-screen yoke) input, −1..1, set by the UI
  const virtual = useRef({ x: 0, y: 0, active: false });

  useEffect(() => {
    if (!engine || !opts.enabled) return;
    const held = new Set<string>();
    const isTyping = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      return (
        !!t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.tagName === "SELECT" ||
          t.isContentEditable)
      );
    };
    const down = (e: KeyboardEvent) => {
      if (isTyping(e)) return;
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      const c = engine.getControls();
      const handled = () => e.preventDefault();
      switch (k) {
        case "f":
          engine.setControls({ flapIndex: c.flapIndex + 1 });
          return handled();
        case "v":
          engine.setControls({ flapIndex: c.flapIndex - 1 });
          return handled();
        case "g":
          engine.setControls({ gearDown: !c.gearDown });
          return handled();
        case "p":
          engine.setControls({ parkingBrake: !c.parkingBrake });
          return handled();
        case "z":
          engine.apToggle();
          return handled();
        case "c":
          optsRef.current.onCamera("next");
          return handled();
        case "1":
        case "2":
        case "3":
        case "4":
          optsRef.current.onCamera(CAMERAS[Number(k) - 1]!);
          return handled();
        case " ":
          optsRef.current.onPause();
          return handled();
        case "[":
          engine.setControls({ trim: c.trim - 0.03 });
          return handled();
        case "]":
          engine.setControls({ trim: c.trim + 0.03 });
          return handled();
      }
      if (
        [
          "w",
          "s",
          "a",
          "d",
          "q",
          "e",
          "b",
          ".",
          "+",
          "=",
          "-",
          "_",
          "ArrowUp",
          "ArrowDown",
          "ArrowLeft",
          "ArrowRight",
          "Shift",
          "Control",
          "PageUp",
          "PageDown",
        ].includes(k)
      ) {
        held.add(k);
        if (k.startsWith("Arrow") || k === "PageUp" || k === "PageDown") e.preventDefault();
      }
    };
    const up = (e: KeyboardEvent) => {
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      held.delete(k);
    };
    const blur = () => held.clear();
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);

    let raf = 0;
    let last = performance.now();
    const state = { elev: 0, ail: 0, rud: 0 };
    const tick = (t: number) => {
      const dt = Math.max(0, Math.min(0.1, (t - last) / 1000));
      last = t;
      const o = optsRef.current;
      const sens = o.sensitivity;
      const inv = o.invertPitch ? -1 : 1;
      const pull = held.has("s") || held.has("ArrowDown");
      const push = held.has("w") || held.has("ArrowUp");
      const left = held.has("a") || held.has("ArrowLeft");
      const right = held.has("d") || held.has("ArrowRight");
      const ramp = (cur: number, target: number, rate: number) =>
        cur + Math.max(-rate * dt, Math.min(rate * dt, target - cur));
      const v = virtual.current;
      const kbElev = (pull ? 0.75 : 0) - (push ? 0.75 : 0);
      const kbAil = (right ? 0.85 : 0) - (left ? 0.85 : 0);
      const elevTarget = v.active ? v.y : kbElev * inv * sens;
      const ailTarget = v.active ? v.x : kbAil * sens;
      state.elev = ramp(
        state.elev,
        Math.max(-1, Math.min(1, elevTarget)),
        pull || push || v.active ? 1.6 : 2.5,
      );
      state.ail = ramp(
        state.ail,
        Math.max(-1, Math.min(1, ailTarget)),
        left || right || v.active ? 2.5 : 3.5,
      );
      const rudTarget = (held.has("e") ? 0.9 : 0) - (held.has("q") ? 0.9 : 0);
      state.rud = ramp(state.rud, rudTarget, 2.5);
      const c = engine.getControls();
      const patch: Parameters<SimEngine["setControls"]>[0] = {};
      if (Math.abs(c.elevator - state.elev) > 0.001) patch.elevator = state.elev;
      if (Math.abs(c.aileron - state.ail) > 0.001) patch.aileron = state.ail;
      if (Math.abs(c.rudder - state.rud) > 0.001) patch.rudder = state.rud;
      const thrUp = held.has("+") || held.has("=") || held.has("Shift") || held.has("PageUp");
      const thrDn = held.has("-") || held.has("_") || held.has("Control") || held.has("PageDown");
      if (thrUp) patch.throttle = Math.min(1, c.throttle + dt * 0.45);
      if (thrDn) patch.throttle = Math.max(0, c.throttle - dt * 0.45);
      const brake = held.has("b") || held.has(".");
      if (brake !== c.brakes > 0) patch.brakes = brake ? 1 : 0;
      if (Object.keys(patch).length) engine.setControls(patch);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, [engine, opts.enabled]);

  return virtual;
}

export { CAMERAS };
