/**
 * Reusable rotary knob (optionally dual concentric).
 *
 *   <Knob label="HDG" onStep={(d) => ...} onPush={() => ...} />
 *   <Knob label="NAV1 MHz" onStep={...} inner={{ label: "NAV1 kHz", onStep: ... }} />
 *
 * Input: drag (up/right = increase), mouse wheel, arrow keys (PageUp/PageDown = large step),
 * Enter/Space or a click without dragging = push. Each ring is an accessible role="slider".
 */
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { cn } from "@/lib/utils";

export interface KnobRing {
  label: string;
  /** Called once per detent: dir = +1 / −1; big = PageUp/PageDown or shift-wheel. */
  onStep: (dir: 1 | -1, big: boolean) => void;
  onPush?: () => void;
  valueNow?: number;
  valueMin?: number;
  valueMax?: number;
  valueText?: string;
}

export interface KnobProps extends KnobRing {
  /** Inner concentric knob. */
  inner?: KnobRing;
  size?: "sm" | "md" | "lg";
  /** Text shown under the knob (defaults to label). Pass "" to hide. */
  caption?: string;
  /** Small text above the knob, e.g. "PUSH SYNC". */
  pushHint?: string;
  className?: string;
}

const SIZES = { sm: 40, md: 52, lg: 64 } as const;
const DRAG_PX = 10;
const WHEEL_UNITS = 40;

function useRing(ring: KnobRing, setAngle: (f: (a: number) => number) => void) {
  const ref = useRef<HTMLDivElement>(null);
  const r = useRef(ring);
  r.current = ring;
  const drag = useRef<{ x: number; y: number; acc: number; moved: boolean } | null>(null);

  const step = (dir: 1 | -1, big = false) => {
    r.current.onStep(dir, big);
    setAngle((a) => a + dir * 18);
  };

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let acc = 0;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      acc += e.deltaY === 0 ? e.deltaX : e.deltaY;
      // Mouse wheels send ~100 per notch; trackpads send many small deltas.
      while (Math.abs(acc) >= WHEEL_UNITS) {
        const dir = acc < 0 ? 1 : -1;
        acc += dir * WHEEL_UNITS;
        r.current.onStep(dir, e.shiftKey);
        setAngle((a) => a + dir * 18);
      }
      if (Math.abs(e.deltaY) >= 50) acc = 0;
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [setAngle]);

  const handlers = {
    onPointerDown: (e: ReactPointerEvent<HTMLDivElement>) => {
      e.stopPropagation();
      (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
      drag.current = { x: e.clientX, y: e.clientY, acc: 0, moved: false };
    },
    onPointerMove: (e: ReactPointerEvent<HTMLDivElement>) => {
      const d = drag.current;
      if (!d) return;
      e.stopPropagation();
      const delta = e.clientX - d.x - (e.clientY - d.y);
      d.x = e.clientX;
      d.y = e.clientY;
      d.acc += delta;
      if (Math.abs(d.acc) > 3) d.moved = true;
      while (Math.abs(d.acc) >= DRAG_PX) {
        const dir = d.acc > 0 ? 1 : -1;
        d.acc -= dir * DRAG_PX;
        step(dir);
      }
    },
    onPointerUp: (e: ReactPointerEvent<HTMLDivElement>) => {
      const d = drag.current;
      drag.current = null;
      e.stopPropagation();
      if (d && !d.moved) r.current.onPush?.();
    },
    onPointerCancel: () => {
      drag.current = null;
    },
    onKeyDown: (e: KeyboardEvent<HTMLDivElement>) => {
      const k = e.key;
      if (k === "ArrowUp" || k === "ArrowRight") step(1);
      else if (k === "ArrowDown" || k === "ArrowLeft") step(-1);
      else if (k === "PageUp") step(1, true);
      else if (k === "PageDown") step(-1, true);
      else if (k === "Enter" || k === " ") r.current.onPush?.();
      else return;
      e.preventDefault();
      e.stopPropagation();
    },
  };
  return { ref, handlers };
}

function ariaFor(ring: KnobRing) {
  return {
    role: "slider" as const,
    tabIndex: 0,
    "aria-label": ring.onPush ? `${ring.label} (press Enter to push)` : ring.label,
    "aria-valuenow": ring.valueNow ?? 0,
    "aria-valuemin": ring.valueMin ?? -1e6,
    "aria-valuemax": ring.valueMax ?? 1e6,
    ...(ring.valueText !== undefined ? { "aria-valuetext": ring.valueText } : {}),
  };
}

const KNURL =
  "repeating-conic-gradient(from 0deg, oklch(0.36 0.005 258) 0deg 6deg, oklch(0.22 0.005 258) 6deg 12deg)";

export function Knob(props: KnobProps) {
  const { inner, size = "md", caption, pushHint, className } = props;
  const px = SIZES[size];
  const [outerAngle, setOuterAngle] = useState(0);
  const [innerAngle, setInnerAngle] = useState(0);
  const outer = useRing(props, setOuterAngle);
  const innerRing = useRing(inner ?? { label: "", onStep: () => {} }, setInnerAngle);
  const innerPx = Math.round(px * 0.58);

  return (
    <div className={cn("flex flex-col items-center gap-1 select-none", className)}>
      {pushHint ? <span className="text-[8px] font-semibold tracking-widest text-white/40 uppercase">{pushHint}</span> : null}
      <div
        ref={outer.ref}
        {...ariaFor(props)}
        {...outer.handlers}
        className="relative cursor-grab touch-none rounded-full shadow-[0_3px_8px_oklch(0_0_0/0.7),inset_0_1px_0_oklch(1_0_0/0.15)] outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-black active:cursor-grabbing"
        style={{ width: px, height: px, background: "radial-gradient(circle at 50% 35%, oklch(0.34 0.006 258), oklch(0.16 0.005 258))" }}
      >
        <div className="absolute inset-[3px] rounded-full opacity-90" style={{ background: KNURL, transform: `rotate(${outerAngle}deg)` }} />
        {!inner ? (
          <div className="absolute inset-[22%] rounded-full bg-[radial-gradient(circle_at_50%_30%,oklch(0.3_0.006_258),oklch(0.15_0.005_258))]">
            <div className="absolute top-[8%] left-1/2 h-[30%] w-[3px] -translate-x-1/2 rounded bg-white/70" style={{ transformOrigin: "50% 140%", transform: `translateX(-50%) rotate(${outerAngle}deg)` }} />
          </div>
        ) : (
          <div
            ref={innerRing.ref}
            {...ariaFor(inner)}
            {...innerRing.handlers}
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 cursor-grab touch-none rounded-full shadow-[0_2px_6px_oklch(0_0_0/0.8)] outline-none focus-visible:ring-2 focus-visible:ring-cyan"
            style={{ width: innerPx, height: innerPx, background: "radial-gradient(circle at 50% 30%, oklch(0.38 0.006 258), oklch(0.18 0.005 258))" }}
          >
            <div className="absolute inset-[2px] rounded-full opacity-80" style={{ background: KNURL, transform: `rotate(${innerAngle}deg)` }} />
            <div className="absolute inset-[26%] rounded-full bg-[oklch(0.22_0.005_258)]" />
          </div>
        )}
      </div>
      {caption !== "" ? <span className="max-w-[6rem] truncate text-center font-mono text-[9px] font-semibold tracking-wider text-white/55 uppercase">{caption ?? props.label}</span> : null}
    </div>
  );
}
