/**
 * Simple flight controls for the Avionics Lab: keyboard (W/S pitch, A/D roll, Q/E rudder,
 * +/− throttle, [ ] trim, P pause) and an on-screen yoke pad, rudder, throttle, trim and flaps.
 */
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Keyboard } from "lucide-react";
import { clamp } from "@/lib/geo";
import { cn } from "@/lib/utils";
import type { SimEngine } from "@/sim/engine";
import { useSimEngine, useSimSelector } from "@/sim/react";

const AXIS = 0.45;

function isTypingTarget(t: EventTarget | null) {
  if (!(t instanceof HTMLElement)) return false;
  const tag = t.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || t.isContentEditable;
}

function disconnectIfEngaged(engine: SimEngine) {
  if (engine.getSnapshot().ap.engaged) engine.apDisconnect("AP disconnect — pilot input");
}

/** Attach the lab keyboard flight controls to the window while mounted. */
export function useKeyboardFlightControls(engine: SimEngine | null) {
  useEffect(() => {
    if (!engine) return;
    const held = new Set<string>();
    const apply = () => {
      const elevator = (held.has("s") ? AXIS : 0) - (held.has("w") ? AXIS : 0);
      const aileron = (held.has("d") ? AXIS : 0) - (held.has("a") ? AXIS : 0);
      const rudder = (held.has("e") ? 0.6 : 0) - (held.has("q") ? 0.6 : 0);
      engine.setControls({ elevator, aileron, rudder });
    };
    const down = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e.target)) return;
      const k = e.key.toLowerCase();
      const c = engine.getControls();
      if (["w", "a", "s", "d", "q", "e"].includes(k)) {
        if (!held.has(k)) {
          held.add(k);
          if (k !== "q" && k !== "e") disconnectIfEngaged(engine);
          apply();
        }
        e.preventDefault();
      } else if (k === "+" || k === "=") {
        engine.setControls({ throttle: clamp(c.throttle + 0.05, 0, 1) });
        e.preventDefault();
      } else if (k === "-" || k === "_") {
        engine.setControls({ throttle: clamp(c.throttle - 0.05, 0, 1) });
        e.preventDefault();
      } else if (k === "[") {
        engine.setControls({ trim: clamp(c.trim - 0.02, -1, 1) });
      } else if (k === "]") {
        engine.setControls({ trim: clamp(c.trim + 0.02, -1, 1) });
      } else if (k === "p") {
        engine.togglePause();
      }
    };
    const up = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (held.delete(k)) apply();
    };
    const blur = () => {
      held.clear();
      apply();
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, [engine]);
}

function YokePad() {
  const engine = useSimEngine();
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const active = useRef(false);
  const move = (e: ReactPointerEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = clamp(((e.clientX - r.left) / r.width) * 2 - 1, -1, 1);
    const y = clamp(((e.clientY - r.top) / r.height) * 2 - 1, -1, 1);
    setPos({ x, y });
    engine.setControls({ aileron: x * 0.7 * 0.85, elevator: y * 0.55 });
  };
  const release = () => {
    active.current = false;
    setPos({ x: 0, y: 0 });
    engine.setControls({ aileron: 0, elevator: 0 });
  };
  return (
    <div
      ref={ref}
      role="application"
      aria-label="Yoke pad: drag to roll and pitch. Drag down to pull (nose up)."
      className="relative aspect-square w-full max-w-[150px] cursor-crosshair touch-none rounded-xl border border-white/10 bg-[radial-gradient(circle,oklch(0.22_0.01_258),oklch(0.13_0.01_258))]"
      onPointerDown={(e) => {
        active.current = true;
        e.currentTarget.setPointerCapture(e.pointerId);
        disconnectIfEngaged(engine);
        move(e);
      }}
      onPointerMove={(e) => active.current && move(e)}
      onPointerUp={release}
      onPointerCancel={release}
    >
      <div className="absolute inset-x-0 top-1/2 h-px bg-white/10" />
      <div className="absolute inset-y-0 left-1/2 w-px bg-white/10" />
      <span className="absolute top-1 left-1/2 -translate-x-1/2 font-mono text-[8px] text-white/35">
        PUSH
      </span>
      <span className="absolute bottom-1 left-1/2 -translate-x-1/2 font-mono text-[8px] text-white/35">
        PULL
      </span>
      <div
        className="absolute size-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-primary bg-primary/30 shadow-[0_0_10px_var(--primary)]"
        style={{ left: `${(pos.x + 1) * 50}%`, top: `${(pos.y + 1) * 50}%` }}
      />
    </div>
  );
}

function HoldBtn({
  children,
  onDown,
  onUp,
  label,
}: {
  children: React.ReactNode;
  onDown: () => void;
  onUp: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onPointerDown={onDown}
      onPointerUp={onUp}
      onPointerLeave={onUp}
      className="h-8 flex-1 rounded-md border border-white/10 bg-gradient-to-b from-[oklch(0.3_0.006_258)] to-[oklch(0.2_0.006_258)] font-mono text-[11px] font-bold text-white/75 hover:text-white active:translate-y-px"
    >
      {children}
    </button>
  );
}

export function FlightControls({ className }: { className?: string | undefined }) {
  const engine = useSimEngine();
  const c = useSimSelector((s) => s.controls);
  const apOn = useSimSelector((s) => s.ap.engaged);
  const flaps = engine.perf.flapDetents;
  return (
    <div className={cn("rounded-xl border border-white/10 bg-card p-3", className)}>
      <div className="mb-2 flex items-center justify-between">
        <span className="label-caps">Flight controls</span>
        {apOn ? (
          <span className="font-mono text-[10px] text-ok">AP ENGAGED — input disconnects it</span>
        ) : null}
      </div>
      <div className="grid gap-3 sm:grid-cols-[150px_1fr]">
        <div className="flex flex-col items-center gap-2">
          <YokePad />
          <div className="flex w-full max-w-[150px] gap-1">
            <HoldBtn
              label="Left rudder"
              onDown={() => engine.setControls({ rudder: -0.6 })}
              onUp={() => engine.setControls({ rudder: 0 })}
            >
              ◀ RUD
            </HoldBtn>
            <HoldBtn
              label="Right rudder"
              onDown={() => engine.setControls({ rudder: 0.6 })}
              onUp={() => engine.setControls({ rudder: 0 })}
            >
              RUD ▶
            </HoldBtn>
          </div>
        </div>
        <div className="space-y-2.5">
          <label className="flex items-center gap-2">
            <span className="w-16 font-mono text-[10px] font-bold text-white/60">THROTTLE</span>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(c.throttle * 100)}
              onChange={(e) => engine.setControls({ throttle: Number(e.target.value) / 100 })}
              className="flex-1 accent-white"
              aria-label="Throttle"
            />
            <span className="w-10 text-right font-mono text-[11px] tabular">
              {Math.round(c.throttle * 100)}%
            </span>
          </label>
          <div className="flex items-center gap-2">
            <span className="w-16 font-mono text-[10px] font-bold text-white/60">TRIM</span>
            <button
              type="button"
              className="rounded border border-white/10 px-2 py-1 font-mono text-[10px] hover:bg-white/5"
              onClick={() => engine.setControls({ trim: clamp(c.trim - 0.02, -1, 1) })}
              aria-label="Trim nose down"
            >
              NOSE DN
            </button>
            <div className="relative h-2 flex-1 rounded-full bg-black/60">
              <div
                className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan"
                style={{ left: `${(c.trim + 1) * 50}%` }}
              />
            </div>
            <button
              type="button"
              className="rounded border border-white/10 px-2 py-1 font-mono text-[10px] hover:bg-white/5"
              onClick={() => engine.setControls({ trim: clamp(c.trim + 0.02, -1, 1) })}
              aria-label="Trim nose up"
            >
              NOSE UP
            </button>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-16 font-mono text-[10px] font-bold text-white/60">FLAPS</span>
            <div className="flex flex-1 gap-1">
              {flaps.map((deg, i) => (
                <button
                  key={deg}
                  type="button"
                  onClick={() => engine.setControls({ flapIndex: i })}
                  aria-pressed={c.flapIndex === i}
                  className={cn(
                    "flex-1 rounded border px-1 py-1 font-mono text-[10px]",
                    c.flapIndex === i
                      ? "border-primary bg-primary/15 text-primary"
                      : "border-white/10 text-white/60 hover:text-white",
                  )}
                >
                  {deg}°
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-start gap-2 rounded-md bg-muted/40 px-2 py-1.5 text-[11px] leading-relaxed text-muted-foreground">
            <Keyboard className="mt-0.5 size-3.5 shrink-0" />
            <span>
              <b className="text-foreground">W/S</b> pitch (S = pull) ·{" "}
              <b className="text-foreground">A/D</b> roll · <b className="text-foreground">Q/E</b>{" "}
              rudder · <b className="text-foreground">+/−</b> throttle ·{" "}
              <b className="text-foreground">[ ]</b> trim · <b className="text-foreground">P</b>{" "}
              pause
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
