/**
 * Mouse and touch handling for the 3D view: drag to look around / orbit, wheel or pinch to zoom,
 * double-click or double-tap to reset. Only reacts to events that land on the 3D view itself,
 * never to events on buttons or panels drawn over it.
 */
import type { Sim } from "@/core/sim";

export interface PointerTarget {
  look(dYawDeg: number, dPitchDeg: number): void;
  zoom(factor: number): void;
  resetLook(): void;
}

interface Touch {
  x: number;
  y: number;
}

/** Degrees of view rotation per pixel dragged. */
const DEG_PER_PX = 0.22;

export function attachPointer(el: HTMLElement, canvas: HTMLCanvasElement, sim: () => Sim | null, target: PointerTarget): () => void {
  /** The view itself: the element given to attach(), or the 3D canvas inside it (but not other things layered over it). */
  const onView = (e: Event) => e.target === el || e.target === canvas || (e.target instanceof Node && e.target === canvas.parentElement);
  const pointers = new Map<number, Touch>();
  let dragging = false;
  let moved = 0;
  let pinchDist = 0;
  let lastTapTime = 0;
  let lastTapX = 0;
  let lastTapY = 0;

  const mayDrag = (e: PointerEvent): boolean => {
    if (e.pointerType === "touch" || e.pointerType === "pen") return true;
    if (e.button === 2) return true; // right button: always looks around
    // left button looks around unless the mouse is being used as the yoke
    return e.button === 0 && !(sim()?.settings.mouseYoke ?? false);
  };

  const onDown = (e: PointerEvent) => {
    if (!onView(e) || !mayDrag(e)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      /* not capturable (e.g. synthetic event) */
    }
    if (pointers.size === 1) {
      dragging = true;
      moved = 0;
    } else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinchDist = Math.hypot(a!.x - b!.x, a!.y - b!.y);
    }
  };

  const onMove = (e: PointerEvent) => {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    p.x = e.clientX;
    p.y = e.clientY;
    if (pointers.size >= 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      if (pinchDist > 10 && d > 10) target.zoom(pinchDist / d); // fingers apart = zoom in
      pinchDist = d;
      moved += 100;
      return;
    }
    if (!dragging) return;
    moved += Math.abs(dx) + Math.abs(dy);
    // "grab the scene": dragging right turns the view to the left, dragging down tilts it up
    target.look(-dx * DEG_PER_PX, dy * DEG_PER_PX);
    if (e.cancelable) e.preventDefault();
  };

  const onUp = (e: PointerEvent) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    try {
      el.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
    if (pointers.size === 0) {
      // double tap (touch): two quick taps close together without dragging
      if (e.pointerType !== "mouse" && moved < 12 && e.type === "pointerup") {
        const now = performance.now();
        if (now - lastTapTime < 320 && Math.hypot(e.clientX - lastTapX, e.clientY - lastTapY) < 40) {
          target.resetLook();
          lastTapTime = 0;
        } else {
          lastTapTime = now;
          lastTapX = e.clientX;
          lastTapY = e.clientY;
        }
      }
      dragging = false;
    }
    pinchDist = 0;
  };

  const onWheel = (e: WheelEvent) => {
    if (!onView(e)) return;
    const unit = e.deltaMode === 1 ? 32 : e.deltaMode === 2 ? 400 : 1;
    target.zoom(Math.exp(Math.max(-240, Math.min(240, e.deltaY * unit)) * 0.0012));
    e.preventDefault();
  };
  const onDblClick = (e: MouseEvent) => {
    if (onView(e)) target.resetLook();
  };
  const onContextMenu = (e: MouseEvent) => {
    if (onView(e)) e.preventDefault(); // the right button drags the view
  };

  el.addEventListener("pointerdown", onDown);
  el.addEventListener("pointermove", onMove);
  el.addEventListener("pointerup", onUp);
  el.addEventListener("pointercancel", onUp);
  el.addEventListener("wheel", onWheel, { passive: false });
  el.addEventListener("dblclick", onDblClick);
  el.addEventListener("contextmenu", onContextMenu);
  return () => {
    el.removeEventListener("pointerdown", onDown);
    el.removeEventListener("pointermove", onMove);
    el.removeEventListener("pointerup", onUp);
    el.removeEventListener("pointercancel", onUp);
    el.removeEventListener("wheel", onWheel);
    el.removeEventListener("dblclick", onDblClick);
    el.removeEventListener("contextmenu", onContextMenu);
    pointers.clear();
  };
}
