/**
 * Pointer / wheel / keyboard handling shared by the panel's knobs, buttons and levers.
 * Everything works with mouse, touch and pen (Pointer Events), supports press-and-hold repeat,
 * and never keeps keyboard focus after a pointer press, so the flight keys keep working.
 * Keyboard users can Tab to a control: Enter operates it, Shift+Enter operates it the other way.
 * (Arrow keys, Space and the letter keys are left alone — they fly the aeroplane.)
 */
import { useEffect, useMemo, useRef, type KeyboardEvent as RKeyboardEvent, type PointerEvent as RPointerEvent } from "react";
import { usePanel } from "./context";

const HOLD_DELAY_MS = 380;
const REPEAT_MS = 95;

type AnyEl = SVGElement | HTMLElement;

function capture(el: Element, id: number): void {
  try {
    el.setPointerCapture(id);
  } catch {
    /* synthetic events (tests) have no real pointer to capture */
  }
}
function release(el: Element, id: number): void {
  try {
    if (el.hasPointerCapture(id)) el.releasePointerCapture(id);
  } catch {
    /* ignore */
  }
}
/** Give the keyboard back to the flight controls after a pointer press. */
function dropFocus(el: Element): void {
  const a = document.activeElement;
  if (a && a === el && "blur" in a) (a as HTMLElement).blur();
}

export interface PressProps {
  onPointerDown(e: RPointerEvent<AnyEl>): void;
  onPointerUp(e: RPointerEvent<AnyEl>): void;
  onPointerCancel(e: RPointerEvent<AnyEl>): void;
  onLostPointerCapture(e: RPointerEvent<AnyEl>): void;
  onKeyDown(e: RKeyboardEvent<AnyEl>): void;
  onKeyUp(e: RKeyboardEvent<AnyEl>): void;
  tabIndex: number;
}

/**
 * A push button. `onPress` fires on press; with `repeat` it keeps firing while held (count = 0, 1, 2 …).
 * `onRelease` fires when the press ends (used for spring-loaded controls such as the starter).
 */
export function usePress(onPress: (count: number, shift: boolean) => void, opts: { repeat?: boolean; onRelease?: () => void; sound?: "switch" | "knob" | null } = {}): PressProps {
  const api = usePanel();
  const cb = useRef({ onPress, opts });
  cb.current = { onPress, opts };
  const st = useRef({ active: false, pointer: -1, hold: 0 as ReturnType<typeof setTimeout> | 0, rep: 0 as ReturnType<typeof setInterval> | 0, count: 0, key: false });
  useEffect(
    () => () => {
      const s = st.current;
      if (s.hold) clearTimeout(s.hold);
      if (s.rep) clearInterval(s.rep);
    },
    [],
  );
  return useMemo<PressProps>(() => {
    const stop = (fire: boolean) => {
      const s = st.current;
      if (s.hold) clearTimeout(s.hold);
      if (s.rep) clearInterval(s.rep);
      s.hold = s.rep = 0;
      if (s.active) {
        s.active = false;
        if (fire) cb.current.opts.onRelease?.();
      }
    };
    const start = (shift: boolean) => {
      const s = st.current;
      stop(false);
      s.active = true;
      s.count = 0;
      const sound = cb.current.opts.sound;
      if (sound !== null) api.click(sound ?? "switch");
      cb.current.onPress(s.count++, shift);
      if (cb.current.opts.repeat) {
        s.hold = setTimeout(() => {
          s.rep = setInterval(() => {
            if (api.blocked()) return stop(true);
            cb.current.onPress(s.count++, shift);
          }, REPEAT_MS);
        }, HOLD_DELAY_MS);
      }
    };
    return {
      tabIndex: 0,
      onPointerDown(e) {
        if (api.blocked() || (e.pointerType === "mouse" && e.button !== 0)) return;
        e.preventDefault();
        e.stopPropagation();
        st.current.pointer = e.pointerId;
        capture(e.currentTarget, e.pointerId);
        start(e.shiftKey);
      },
      onPointerUp(e) {
        if (e.pointerId !== st.current.pointer) return;
        release(e.currentTarget, e.pointerId);
        dropFocus(e.currentTarget);
        stop(true);
      },
      onPointerCancel() {
        stop(true);
      },
      onLostPointerCapture() {
        stop(true);
      },
      onKeyDown(e) {
        if (e.key !== "Enter" || api.blocked()) return;
        e.preventDefault();
        e.stopPropagation();
        if (e.repeat) {
          if (cb.current.opts.repeat) cb.current.onPress(st.current.count++, e.shiftKey);
          return;
        }
        st.current.key = true;
        st.current.active = true;
        st.current.count = 0;
        api.click(cb.current.opts.sound ?? "switch");
        cb.current.onPress(st.current.count++, e.shiftKey);
      },
      onKeyUp(e) {
        if (e.key !== "Enter" || !st.current.key) return;
        st.current.key = false;
        stop(true);
      },
    };
  }, [api]);
}

export interface KnobProps {
  ref(el: AnyEl | null): void;
  onPointerDown(e: RPointerEvent<AnyEl>): void;
  onPointerMove(e: RPointerEvent<AnyEl>): void;
  onPointerUp(e: RPointerEvent<AnyEl>): void;
  onPointerCancel(e: RPointerEvent<AnyEl>): void;
  onLostPointerCapture(e: RPointerEvent<AnyEl>): void;
  onKeyDown(e: RKeyboardEvent<AnyEl>): void;
  tabIndex: number;
}

/**
 * A rotary knob. `onStep(steps)` is called with a signed number of clicks:
 *   - drag up or to the right = increase (one click every `pxPerStep` pixels; a fast drag counts more),
 *   - mouse wheel (Shift = ×10),
 *   - a tap/click on the right half = +1, on the left half = −1, press and hold to repeat,
 *   - Enter / Shift+Enter with keyboard focus.
 */
export function useKnob(onStep: (steps: number) => void, opts: { pxPerStep?: number; fastGain?: number; wheelGain?: number } = {}): KnobProps {
  const api = usePanel();
  const cb = useRef({ onStep, opts });
  cb.current = { onStep, opts };
  const el = useRef<AnyEl | null>(null);
  const st = useRef({
    pointer: -1,
    x: 0,
    y: 0,
    acc: 0,
    moved: false,
    repeated: false,
    side: 1,
    t: 0,
    hold: 0 as ReturnType<typeof setTimeout> | 0,
    rep: 0 as ReturnType<typeof setInterval> | 0,
    held: 0,
    lastSound: 0,
  });
  const wheelOff = useRef<(() => void) | null>(null);

  return useMemo<KnobProps>(() => {
    const step = (n: number) => {
      if (!n) return;
      const now = performance.now();
      if (now - st.current.lastSound > 60) {
        st.current.lastSound = now;
        api.click("knob");
      }
      cb.current.onStep(n);
    };
    const clear = () => {
      const s = st.current;
      if (s.hold) clearTimeout(s.hold);
      if (s.rep) clearInterval(s.rep);
      s.hold = s.rep = 0;
    };
    const onWheel = (e: WheelEvent) => {
      if (api.blocked()) return;
      e.preventDefault();
      e.stopPropagation();
      const d = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? -e.deltaY : e.deltaX;
      if (!d) return;
      const gain = (e.shiftKey ? 10 : 1) * (cb.current.opts.wheelGain ?? 1);
      step(Math.sign(d) * gain);
    };
    return {
      tabIndex: 0,
      ref(node) {
        wheelOff.current?.();
        wheelOff.current = null;
        el.current = node;
        if (node) {
          node.addEventListener("wheel", onWheel as EventListener, { passive: false });
          wheelOff.current = () => node.removeEventListener("wheel", onWheel as EventListener);
        } else clear();
      },
      onPointerDown(e) {
        if (api.blocked() || (e.pointerType === "mouse" && e.button !== 0)) return;
        e.preventDefault();
        e.stopPropagation();
        const s = st.current;
        clear();
        s.pointer = e.pointerId;
        s.x = e.clientX;
        s.y = e.clientY;
        s.acc = 0;
        s.moved = false;
        s.repeated = false;
        s.held = 0;
        s.t = performance.now();
        const r = e.currentTarget.getBoundingClientRect();
        s.side = e.clientX >= r.left + r.width / 2 ? 1 : -1;
        capture(e.currentTarget, e.pointerId);
        s.hold = setTimeout(() => {
          s.rep = setInterval(() => {
            if (s.moved || api.blocked()) return clear();
            s.repeated = true;
            s.held++;
            step(s.side * (s.held > 14 ? (cb.current.opts.fastGain ?? 5) : 1));
          }, REPEAT_MS);
        }, HOLD_DELAY_MS);
      },
      onPointerMove(e) {
        const s = st.current;
        if (e.pointerId !== s.pointer) return;
        const dx = e.clientX - s.x;
        const dy = e.clientY - s.y;
        if (!s.moved && Math.hypot(dx, dy) < 5) return;
        if (!s.moved) {
          s.moved = true;
          clear();
        }
        const now = performance.now();
        const dt = Math.max(1, now - s.t);
        s.t = now;
        s.x = e.clientX;
        s.y = e.clientY;
        const d = dx - dy; // right or up = increase
        const speed = Math.abs(d) / dt; // px per ms
        const gain = speed > 0.9 ? (cb.current.opts.fastGain ?? 5) : 1;
        s.acc += (d / (cb.current.opts.pxPerStep ?? 5)) * gain;
        const n = s.acc > 0 ? Math.floor(s.acc) : Math.ceil(s.acc);
        if (n) {
          s.acc -= n;
          step(n);
        }
      },
      onPointerUp(e) {
        const s = st.current;
        if (e.pointerId !== s.pointer) return;
        s.pointer = -1;
        clear();
        release(e.currentTarget, e.pointerId);
        dropFocus(e.currentTarget);
        if (!s.moved && !s.repeated) step(s.side * (e.shiftKey ? 10 : 1));
      },
      onPointerCancel() {
        st.current.pointer = -1;
        clear();
      },
      onLostPointerCapture() {
        st.current.pointer = -1;
        clear();
      },
      onKeyDown(e) {
        if (e.key !== "Enter" || api.blocked()) return;
        e.preventDefault();
        e.stopPropagation();
        step(e.shiftKey ? -1 : 1);
      },
    };
  }, [api]);
}

export interface DragProps {
  onPointerDown(e: RPointerEvent<AnyEl>): void;
  onPointerMove(e: RPointerEvent<AnyEl>): void;
  onPointerUp(e: RPointerEvent<AnyEl>): void;
  onPointerCancel(e: RPointerEvent<AnyEl>): void;
  onLostPointerCapture(e: RPointerEvent<AnyEl>): void;
}

export interface DragInfo {
  /** Pointer position inside the element's box, 0…1 from left/top. */
  fx: number;
  fy: number;
  /** Movement since the previous event as a fraction of the element's width / height. */
  dfx: number;
  dfy: number;
  /** Total movement since the press started, pixels. */
  travelPx: number;
  phase: "down" | "move" | "up";
}

/** Low-level drag helper for levers and sliders: reports positions as fractions of the element's box. */
export function useDrag(onDrag: (d: DragInfo) => void): DragProps {
  const api = usePanel();
  const cb = useRef(onDrag);
  cb.current = onDrag;
  const st = useRef({ pointer: -1, x: 0, y: 0, travel: 0 });
  return useMemo<DragProps>(() => {
    const info = (e: RPointerEvent<AnyEl>, phase: DragInfo["phase"]): DragInfo => {
      const s = st.current;
      const r = e.currentTarget.getBoundingClientRect();
      const w = Math.max(1, r.width);
      const h = Math.max(1, r.height);
      const d: DragInfo = { fx: (e.clientX - r.left) / w, fy: (e.clientY - r.top) / h, dfx: (e.clientX - s.x) / w, dfy: (e.clientY - s.y) / h, travelPx: s.travel, phase };
      s.travel += Math.hypot(e.clientX - s.x, e.clientY - s.y);
      d.travelPx = s.travel;
      s.x = e.clientX;
      s.y = e.clientY;
      return d;
    };
    return {
      onPointerDown(e) {
        if (api.blocked() || (e.pointerType === "mouse" && e.button !== 0)) return;
        e.preventDefault();
        e.stopPropagation();
        const s = st.current;
        s.pointer = e.pointerId;
        s.x = e.clientX;
        s.y = e.clientY;
        s.travel = 0;
        capture(e.currentTarget, e.pointerId);
        cb.current(info(e, "down"));
      },
      onPointerMove(e) {
        if (e.pointerId !== st.current.pointer) return;
        cb.current(info(e, "move"));
      },
      onPointerUp(e) {
        if (e.pointerId !== st.current.pointer) return;
        cb.current(info(e, "up"));
        st.current.pointer = -1;
        release(e.currentTarget, e.pointerId);
        dropFocus(e.currentTarget);
      },
      onPointerCancel() {
        st.current.pointer = -1;
      },
      onLostPointerCapture() {
        st.current.pointer = -1;
      },
    };
  }, [api]);
}

/** Non-passive wheel listener on an element (React's own wheel events cannot stop page scrolling). */
export function useWheel(onWheel: (dir: number, shift: boolean) => void): (el: AnyEl | null) => void {
  const api = usePanel();
  const cb = useRef(onWheel);
  cb.current = onWheel;
  const off = useRef<(() => void) | null>(null);
  return useMemo(
    () => (node: AnyEl | null) => {
      off.current?.();
      off.current = null;
      if (!node) return;
      const h = (e: WheelEvent) => {
        if (api.blocked()) return;
        e.preventDefault();
        e.stopPropagation();
        const d = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? -e.deltaY : e.deltaX;
        if (d) cb.current(Math.sign(d), e.shiftKey);
      };
      node.addEventListener("wheel", h as EventListener, { passive: false });
      off.current = () => node.removeEventListener("wheel", h as EventListener);
    },
    [api],
  );
}
