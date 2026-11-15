/**
 * Switches and levers: master switch, avionics master, lights, pitot heat, panel-light dimmer,
 * ignition key, parking brake, throttle / mixture / carburettor heat, flap lever with position
 * indicator, elevator trim wheel and the fuel selector.
 * They write sim.controls only. Every control reads its position back from sim.controls each
 * frame, so changes made with the keyboard, a joystick or a lesson script show up here too.
 */
import { useId, useRef, type ReactNode } from "react";
import { clamp } from "@/core/math";
import type { ControlState, FuelSelector as FuelSelectorPos, IgnitionPos } from "@/core/types";
import { useFrame, usePanel } from "./context";
import { polar } from "./geometry";
import type { InstrumentId } from "./ids";
import { useDrag, useKnob, usePress, useWheel } from "./interact";
import { Hit, T, box, range, setRot, setShown, tickPath, useCell } from "./parts";

// ---------------------------------------------------------------- rocker switches

/** The moving part of a rocker switch at (x, y), size w × h. ON = top pressed in. */
function RockerArt({ x, y, w, h, red, refOn, refOff }: { x: number; y: number; w: number; h: number; red?: boolean; refOn: (el: SVGGElement | null) => void; refOff: (el: SVGGElement | null) => void }) {
  const half = h / 2;
  const hi = red ? "tx-rk-red" : "tx-rk";
  const lo = red ? "tx-rk-red-lo" : "tx-rk-lo";
  return (
    <>
      <rect x={x - 2} y={y - 2} width={w + 4} height={h + 4} rx="3" className="tx-rk-well" />
      <g ref={refOn} style={{ display: "none" }}>
        <rect x={x + 1} y={y + 1.5} width={w - 2} height={half - 1.5} rx="1.5" className={lo} />
        <rect x={x} y={y + half} width={w} height={half} rx="2" className={hi} />
        <rect x={x + 3} y={y + 4} width={w - 6} height="3" rx="1.2" className="tx-rk-on" />
        <path d={`M${x + 2} ${y + h - 2.2}H${x + w - 2}`} className="tx-rk-edge" />
      </g>
      <g ref={refOff}>
        <rect x={x} y={y} width={w} height={half} rx="2" className={hi} />
        <rect x={x + 1} y={y + half} width={w - 2} height={half - 1.5} rx="1.5" className={lo} />
        <rect x={x + 3} y={y + 4} width={w - 6} height="3" rx="1.2" className="tx-rk-off" />
        <path d={`M${x + 2} ${y + 2.2}H${x + w - 2}`} className="tx-rk-edge" />
      </g>
    </>
  );
}

function useRockerState(get: (c: ControlState) => boolean): { refOn: (el: SVGGElement | null) => void; refOff: (el: SVGGElement | null) => void; root: React.RefObject<SVGGElement | null> } {
  const on = useRef<SVGGElement | null>(null);
  const off = useRef<SVGGElement | null>(null);
  const root = useRef<SVGGElement | null>(null);
  const cell = useCell(-1);
  useFrame(({ c }) => {
    const v = get(c) ? 1 : 0;
    if (v === cell.v) return;
    cell.v = v;
    if (on.current) on.current.style.display = v ? "" : "none";
    if (off.current) off.current.style.display = v ? "none" : "";
    root.current?.setAttribute("aria-checked", v ? "true" : "false");
  });
  return { refOn: (el) => (on.current = el), refOff: (el) => (off.current = el), root };
}

export const ROCKER_W = 38;
export const ROCKER_H = 60;

/** One labelled rocker switch (38 × 60 units). Up (top pressed) is ON. */
export function Rocker({ id, ctl, text, label, get, set }: { id: InstrumentId; ctl: string; text: string; label: string; get: (c: ControlState) => boolean; set: (c: ControlState, on: boolean) => void }) {
  const { sim } = usePanel();
  const st = useRockerState(get);
  const press = usePress(() => set(sim.controls, !get(sim.controls)));
  return (
    <svg className="txp-inst" data-instrument={id} viewBox={`0 0 ${ROCKER_W} ${ROCKER_H}`} style={box(ROCKER_W, ROCKER_H)}>
      <g {...press} ref={st.root} data-ctl={ctl} role="switch" aria-checked="false" aria-label={label} className="tx-ctl">
        <Hit x={0} y={0} w={ROCKER_W} h={ROCKER_H} />
        <T x={ROCKER_W / 2} y={7} s={6.8} className="lbl">
          {text}
        </T>
        <RockerArt x={9} y={17} w={20} h={38} refOn={st.refOn} refOff={st.refOff} />
      </g>
    </svg>
  );
}

export const MASTER_W = 56;

/**
 * The split master switch: BAT (battery) on the right, ALT (alternator) on the left.
 * As in the aeroplane, switching the battery half off takes the alternator half with it, and the
 * alternator half cannot be on without the battery half.
 */
export function MasterSwitch() {
  const { sim } = usePanel();
  const alt = useRockerState((c) => c.masterAlternator);
  const bat = useRockerState((c) => c.masterBattery);
  const pressAlt = usePress(() => {
    const c = sim.controls;
    if (c.masterAlternator) c.masterAlternator = false;
    else c.masterAlternator = c.masterBattery = true;
  });
  const pressBat = usePress(() => {
    const c = sim.controls;
    if (c.masterBattery) c.masterBattery = c.masterAlternator = false;
    else c.masterBattery = true;
  });
  return (
    <svg className="txp-inst" data-instrument="master-switch" viewBox={`0 0 ${MASTER_W} ${ROCKER_H}`} style={box(MASTER_W, ROCKER_H)}>
      <T x={MASTER_W / 2} y={7} s={6.8} className="lbl">
        MASTER
      </T>
      <g {...pressAlt} ref={alt.root} data-ctl="master-alt" role="switch" aria-checked="false" aria-label="Master switch, alternator half" className="tx-ctl">
        <Hit x={0} y={11} w={MASTER_W / 2} h={ROCKER_H - 11} />
        <RockerArt x={7} y={15} w={19} h={34} red refOn={alt.refOn} refOff={alt.refOff} />
        <T x={16.5} y={55.5} s={5.6} className="lbl">
          ALT
        </T>
      </g>
      <g {...pressBat} ref={bat.root} data-ctl="master-bat" role="switch" aria-checked="false" aria-label="Master switch, battery half" className="tx-ctl">
        <Hit x={MASTER_W / 2} y={11} w={MASTER_W / 2} h={ROCKER_H - 11} />
        <RockerArt x={30} y={15} w={19} h={34} red refOn={bat.refOn} refOff={bat.refOff} />
        <T x={39.5} y={55.5} s={5.6} className="lbl">
          BAT
        </T>
      </g>
    </svg>
  );
}

// ---------------------------------------------------------------- panel light dimmer

export const DIMMER_W = 44;

export function PanelDimmer() {
  const { sim } = usePanel();
  const cap = useRef<SVGGElement>(null);
  const cell = useCell(NaN);
  useFrame(({ c }) => setRot(cap.current, cell, -135 + clamp(c.lights.panel, 0, 1) * 270, 22, 35, 0.5));
  const knob = useKnob(
    (n) => {
      const l = sim.controls.lights;
      l.panel = clamp(Math.round((l.panel + n * 0.05) * 100) / 100, 0, 1);
    },
    { pxPerStep: 5, fastGain: 2 },
  );
  return (
    <svg className="txp-inst" data-instrument="panel-lights" viewBox={`0 0 ${DIMMER_W} ${ROCKER_H}`} style={box(DIMMER_W, ROCKER_H)}>
      <T x={22} y={7} s={6.8} className="lbl">
        PANEL LT
      </T>
      <path d={tickPath(range(-135, 135, 45), 16, 19, 22, 35)} className="arc s-label" strokeWidth="1.2" />
      <g {...knob} data-ctl="panel-dimmer" role="button" aria-label="Panel lights dimmer. Enter brighter, Shift+Enter dimmer." className="tx-ctl">
        <Hit x={0} y={12} w={DIMMER_W} h={46} />
        <circle cx="22" cy="35" r="13" className="tx-knob" />
        <g ref={cap}>
          <path d={tickPath(range(0, 330, 30), 10, 12.6, 22, 35)} className="tx-knob-ridge" />
          <path d="M22 31V23.4" className="tx-knob-mark" />
        </g>
      </g>
      <T x={6.5} y={55.5} s={5} className="lbl tx-faint">
        OFF
      </T>
      <T x={37.5} y={55.5} s={5} className="lbl tx-faint">
        BRT
      </T>
    </svg>
  );
}

// ---------------------------------------------------------------- ignition key

export const IGNITION_W = 80;
export const IGNITION_H = 84;
const IGN_CX = 40;
const IGN_CY = 54;
const IGN_ANGLES = [-72, -36, 0, 36, 72] as const;
const IGN_LABELS = ["OFF", "R", "L", "BOTH", "START"] as const;

/**
 * Magneto / starter key: OFF, R, L, BOTH, START. START is spring-loaded: it is held only while
 * pressed and returns to BOTH on release, like the real key.
 */
export function IgnitionKey() {
  const { sim } = usePanel();
  const key = useRef<SVGGElement>(null);
  const cell = useCell(NaN);
  const shown = useRef(IGN_ANGLES[3] as number);
  useFrame(({ c, dt }) => {
    const target = IGN_ANGLES[c.ignition] ?? 36;
    shown.current += (target - shown.current) * Math.min(1, dt * 18);
    setRot(key.current, cell, shown.current, IGN_CX, IGN_CY, 0.2);
  });
  const set = (p: number) => {
    sim.controls.ignition = clamp(Math.round(p), 0, 4) as IgnitionPos;
  };
  const springBack = () => {
    if (sim.controls.ignition === 4) sim.controls.ignition = 3;
  };
  const up = usePress(() => set(sim.controls.ignition + 1), { onRelease: springBack });
  const down = usePress(() => set(Math.min(3, sim.controls.ignition) - 1));
  const whole = usePress((_n, shift) => (shift ? set(Math.min(3, sim.controls.ignition) - 1) : set(sim.controls.ignition + 1)), { onRelease: springBack });
  return (
    <svg className="txp-inst" data-instrument="ignition" viewBox={`0 0 ${IGNITION_W} ${IGNITION_H}`} style={box(IGNITION_W, IGNITION_H)}>
      <T x={IGN_CX} y={6.5} s={6.8} className="lbl">
        MAGNETOS
      </T>
      <path d={tickPath(IGN_ANGLES, 18.5, 22.5, IGN_CX, IGN_CY)} className="arc s-label" strokeWidth="1.3" />
      <circle cx={IGN_CX} cy={IGN_CY} r="17" className="tx-lock" />
      <circle cx={IGN_CX} cy={IGN_CY} r="12.5" className="tx-lock-inner" />
      <g ref={key}>
        <rect x={IGN_CX - 4.6} y={IGN_CY - 21} width="9.2" height="30" rx="4" className="tx-key" />
        <circle cx={IGN_CX} cy={IGN_CY - 15} r="1.9" className="tx-key-hole" />
        <path d={`M${IGN_CX} ${IGN_CY - 9.5}V${IGN_CY + 5}`} className="tx-key-line" />
      </g>
      {/* keyboard: Enter = one position clockwise (hold on START), Shift+Enter = back */}
      <g {...whole} data-ctl="ignition" role="button" aria-label="Ignition key. Enter turns it clockwise (hold for START), Shift+Enter turns it back." className="tx-ctl">
        <circle cx={IGN_CX} cy={IGN_CY} r="3" className="tx-hit" />
      </g>
      <g {...down} tabIndex={-1} data-ctl="ignition-down" role="button" aria-label="Turn the ignition key one position anticlockwise" className="tx-ctl">
        <path d={`M${IGN_CX - 19} ${IGN_CY - 19}H${IGN_CX}V${IGN_CY + 24}H${IGN_CX - 19}Z`} className="tx-hit" />
      </g>
      <g {...up} tabIndex={-1} data-ctl="ignition-up" role="button" aria-label="Turn the ignition key one position clockwise; hold on START to crank the engine" className="tx-ctl">
        <path d={`M${IGN_CX} ${IGN_CY - 19}H${IGN_CX + 19}V${IGN_CY + 24}H${IGN_CX}Z`} className="tx-hit" />
      </g>
      {IGN_LABELS.map((text, i) => (
        <IgnitionLabel key={text} index={i} text={text} set={set} springBack={springBack} />
      ))}
    </svg>
  );
}

function IgnitionLabel({ index, text, set, springBack }: { index: number; text: string; set: (p: number) => void; springBack: () => void }) {
  const press = usePress(() => set(index), { onRelease: index === 4 ? springBack : undefined });
  const [x, y] = polar(31, IGN_ANGLES[index]!, IGN_CX, IGN_CY);
  return (
    <g {...press} tabIndex={-1} data-ctl={`ignition-${text.toLowerCase()}`} role="button" aria-label={index === 4 ? "Starter: press and hold to crank the engine" : `Ignition ${text}`} className="tx-ctl">
      <circle cx={x} cy={y} r="10.5" className="tx-hit" />
      <T x={x} y={y} s={text.length > 3 ? 6.2 : 7.4} className="lbl">
        {text}
      </T>
    </g>
  );
}

// ---------------------------------------------------------------- parking brake

export const PARK_W = 80;
export const PARK_H = 34;

export function ParkingBrake() {
  const { sim } = usePanel();
  const handle = useRef<SVGGElement>(null);
  const shaft = useRef<SVGRectElement>(null);
  const on = useRef<SVGTextElement>(null);
  const cell = useCell(NaN);
  const cOn = useCell(-1);
  const pos = useRef(0);
  useFrame(({ c, dt }) => {
    pos.current += ((c.parkingBrake ? 1 : 0) - pos.current) * Math.min(1, dt * 14);
    const x = Math.round(pos.current * 130) / 10;
    if (x !== cell.v) {
      cell.v = x;
      handle.current?.setAttribute("transform", `translate(${x} 0)`);
      shaft.current?.setAttribute("width", String(8 + x));
    }
    setShown(on.current, cOn, c.parkingBrake);
  });
  const press = usePress(() => {
    sim.controls.parkingBrake = !sim.controls.parkingBrake;
  });
  return (
    <svg className="txp-inst" data-instrument="parking-brake" viewBox={`0 0 ${PARK_W} ${PARK_H}`} style={box(PARK_W, PARK_H)}>
      <g {...press} data-ctl="parking-brake" role="switch" aria-label="Parking brake" className="tx-ctl">
        <Hit x={0} y={0} w={PARK_W} h={PARK_H} />
        <T x={3} y={10} s={6.4} anchor="start" className="lbl">
          PARK BRAKE
        </T>
        <text ref={on} x="3" y="24" fontSize="8" textAnchor="start" dominantBaseline="central" className="tx-warn-text" style={{ display: "none" }}>
          SET
        </text>
        <rect ref={shaft} x="49" y="17" width="8" height="4" className="tx-shaft" />
        <rect x="42" y="14.5" width="8" height="9" rx="1.5" className="tx-collar" />
        <g ref={handle}>
          <rect x="56" y="9" width="9" height="20" rx="3.5" className="tx-knob" />
          <T x={60.5} y={19.2} s={6.5} className="tx-knob-text">
            P
          </T>
        </g>
      </g>
    </svg>
  );
}

// ---------------------------------------------------------------- push-pull engine controls

export const PUSHPULL_W = 42;
export const LEVER_H = 140;
const PP_TOP = 43;
const PP_TRAVEL = 60;

function PushPull({
  id,
  ctl,
  text,
  hint,
  label,
  variant,
  children,
  pull,
  onDrag,
  onTap,
  onWheel,
  onKey,
  onRelease,
}: {
  id: InstrumentId;
  ctl: string;
  text: string;
  hint: string;
  label: string;
  variant: "throttle" | "mixture" | "carb";
  children?: ReactNode;
  /** How far the knob is pulled out, 0 (fully in) … 1 (fully out). */
  pull: (c: ControlState) => number;
  /** Knob moved by this fraction of its travel (+ = pulled out). */
  onDrag: (dPull: number) => void;
  onTap?: () => void;
  onWheel: (dir: number) => void;
  onKey: (dir: number) => void;
  onRelease?: () => void;
}) {
  const knob = useRef<SVGGElement>(null);
  const shaft = useRef<SVGRectElement>(null);
  const cell = useCell(NaN);
  const pos = useRef(NaN);
  useFrame(({ c, dt }) => {
    const target = clamp(pull(c), 0, 1);
    // Follow the control quickly but smoothly (the carburettor heat knob is two-position and would otherwise jump).
    pos.current = Number.isFinite(pos.current) ? pos.current + (target - pos.current) * Math.min(1, dt * 16) : target;
    const y = Math.round(pos.current * PP_TRAVEL * 10) / 10;
    if (y === cell.v) return;
    cell.v = y;
    knob.current?.setAttribute("transform", `translate(0 ${y})`);
    shaft.current?.setAttribute("height", String(Math.max(0.1, PP_TOP - 14 - 24 + y)));
  });
  const drag = useDrag((d) => {
    if (d.phase === "move") onDrag((d.dfy * LEVER_H) / PP_TRAVEL);
    if (d.phase === "up") {
      if (d.travelPx < 5) onTap?.();
      onRelease?.();
    }
  });
  const wheel = useWheel((dir) => onWheel(dir));
  return (
    <svg className="txp-inst" data-instrument={id} viewBox={`0 0 ${PUSHPULL_W} ${LEVER_H}`} style={box(PUSHPULL_W, LEVER_H)}>
      <g
        {...drag}
        ref={wheel}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key !== "Enter") return;
          e.preventDefault();
          e.stopPropagation();
          onKey(e.shiftKey ? -1 : 1);
        }}
        data-ctl={ctl}
        role="slider"
        aria-label={label}
        className="tx-ctl"
      >
        <Hit x={0} y={0} w={PUSHPULL_W} h={LEVER_H} />
        <T x={PUSHPULL_W / 2} y={7} s={6.4} className="lbl">
          {text}
        </T>
        <rect x="13.5" y="15" width="15" height="9" rx="2" className="tx-collar" />
        <rect ref={shaft} x="18.4" y="24" width="5.2" height="5" className="tx-shaft" />
        <g ref={knob}>
          {variant === "carb" ? <rect x="8" y={PP_TOP - 13} width="26" height="25" rx="5" className="tx-knob" /> : <circle cx="21" cy={PP_TOP} r="14.5" className={variant === "mixture" ? "tx-knob-red" : "tx-knob"} />}
          {variant === "mixture" ? <path d={tickPath(range(0, 345, 15), 12.6, 14.5, 21, PP_TOP)} className="tx-knob-notch" /> : null}
          {variant === "throttle" ? <circle cx="21" cy={PP_TOP} r="8" className="tx-knob-cap" /> : null}
          {children}
        </g>
        <T x={PUSHPULL_W / 2} y={LEVER_H - 6.5} s={5.4} className="lbl tx-faint">
          {hint}
        </T>
      </g>
    </svg>
  );
}

export function ThrottleKnob() {
  const { sim } = usePanel();
  const c = sim.controls;
  const bump = (d: number) => {
    c.throttle = clamp(c.throttle + d, 0, 1);
  };
  return (
    <PushPull
      id="throttle"
      ctl="throttle"
      text="THROTTLE"
      hint="PULL: IDLE"
      label="Throttle. Push in (Enter) for more power, pull out (Shift+Enter) for less."
      variant="throttle"
      pull={(k) => 1 - k.throttle}
      onDrag={(d) => bump(-d)}
      onWheel={(dir) => bump(dir * 0.04)}
      onKey={(dir) => bump(dir * 0.05)}
    />
  );
}

export function MixtureKnob() {
  const { sim } = usePanel();
  const c = sim.controls;
  const bump = (d: number) => {
    c.mixture = clamp(c.mixture + d, 0, 1);
  };
  return (
    <PushPull
      id="mixture"
      ctl="mixture"
      text="MIXTURE"
      hint="PULL: LEAN"
      label="Mixture. Push in (Enter) for richer, pull out (Shift+Enter) for leaner; fully out stops the engine."
      variant="mixture"
      pull={(k) => 1 - k.mixture}
      onDrag={(d) => bump(-d)}
      onWheel={(dir) => bump(dir * 0.03)}
      onKey={(dir) => bump(dir * 0.05)}
    />
  );
}

export function CarbHeatKnob() {
  const api = usePanel();
  const c = api.sim.controls;
  const acc = useRef(0);
  const set = (on: boolean) => {
    if (c.carbHeat === on) return;
    c.carbHeat = on;
    api.click("switch");
  };
  return (
    <PushPull
      id="carb-heat"
      ctl="carb-heat"
      text="CARB HEAT"
      hint="PULL: ON"
      label="Carburettor heat. Enter pulls it on (hot), Shift+Enter pushes it off (cold)."
      variant="carb"
      pull={(k) => (k.carbHeat ? 1 : 0)}
      onDrag={(d) => {
        acc.current += d;
        if (acc.current > 0.25) set(true);
        else if (acc.current < -0.25) set(false);
      }}
      onTap={() => set(!c.carbHeat)}
      onRelease={() => {
        acc.current = 0;
      }}
      onWheel={(dir) => set(dir < 0)}
      onKey={(dir) => set(dir > 0)}
    />
  );
}

// ---------------------------------------------------------------- flap lever and indicator

export const FLAP_W = 54;
const FLAP_Y0 = 26;
/** Lever travel between notches for a four-notch lever (the Cessna 172); other aircraft share the same total travel. */
const FLAP_DY = 28;
const FLAP_TRAVEL = FLAP_DY * 3;

export function FlapLever() {
  const api = usePanel();
  const c = api.sim.controls;
  const lever = useRef<SVGGElement>(null);
  const ptr = useRef<SVGGElement>(null);
  const cLever = useCell(NaN);
  const cPtr = useCell(NaN);
  const pos = useRef(NaN);
  const detents = api.sim.aircraft.flapDetentsDeg;
  const last = detents.length - 1;
  const maxDeg = detents[last] || 1;
  const dy = last > 0 ? FLAP_TRAVEL / last : FLAP_DY;
  const labels = detents.map((d, i) => (i === 0 ? "UP" : `${d}°`));
  useFrame(({ c: k, state, dt }) => {
    pos.current = Number.isFinite(pos.current) ? pos.current + (k.flapIndex - pos.current) * Math.min(1, dt * 20) : k.flapIndex;
    const y = Math.round(pos.current * dy * 10) / 10;
    if (y !== cLever.v) {
      cLever.v = y;
      lever.current?.setAttribute("transform", `translate(0 ${y})`);
    }
    // The indicator shows where the flaps really are (they take a few seconds to travel).
    const p = Math.round(clamp(state.flapsDeg / maxDeg, 0, 1) * dy * last * 10) / 10;
    if (p !== cPtr.v) {
      cPtr.v = p;
      ptr.current?.setAttribute("transform", `translate(0 ${p})`);
    }
  });
  const set = (i: number) => {
    const v = clamp(Math.round(i), 0, last);
    if (v === c.flapIndex) return;
    c.flapIndex = v;
    api.click("switch");
  };
  const drag = useDrag((d) => {
    if (d.phase === "up") return;
    set((d.fy * LEVER_H - FLAP_Y0) / dy);
  });
  const wheel = useWheel((dir) => set(c.flapIndex - dir));
  return (
    <svg className="txp-inst" data-instrument="flaps" viewBox={`0 0 ${FLAP_W} ${LEVER_H}`} style={box(FLAP_W, LEVER_H)}>
      <g
        {...drag}
        ref={wheel}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key !== "Enter") return;
          e.preventDefault();
          e.stopPropagation();
          set(c.flapIndex + (e.shiftKey ? -1 : 1));
        }}
        data-ctl="flap-lever"
        role="slider"
        aria-label="Wing flap lever. Enter lowers the flaps one notch, Shift+Enter raises them."
        className="tx-ctl"
      >
        <Hit x={0} y={0} w={FLAP_W} h={LEVER_H} />
        <T x={FLAP_W / 2} y={7} s={6.4} className="lbl">
          WING FLAPS
        </T>
        <rect x="9.5" y={FLAP_Y0 - 7} width="7" height={dy * last + 14} rx="3.5" className="tx-slot" />
        {labels.map((t, i) => (
          <g key={t}>
            <path d={`M17.5 ${FLAP_Y0 + i * dy}H22.5`} className="arc s-label" strokeWidth="1.2" />
            <T x={31} y={FLAP_Y0 + i * dy + 0.4} s={last > 4 ? 6 : 7} className="lbl">
              {t}
            </T>
          </g>
        ))}
        {last === 0 && (
          <T x={FLAP_W / 2} y={FLAP_Y0 + 30} s={5.6} className="lbl tx-faint">
            NO FLAPS
          </T>
        )}
        <g ref={lever}>
          <rect x="3" y={FLAP_Y0 - 6.5} width="21" height="13" rx="3" className="tx-flap-handle" />
          <path d={`M6 ${FLAP_Y0 - 2}H21M6 ${FLAP_Y0 + 2}H21`} className="tx-flap-grip" />
        </g>
        {/* position indicator */}
        <rect x="42" y={FLAP_Y0 - 7} width="8" height={dy * last + 14} rx="2" className="tx-window" />
        <path d={labels.map((_, i) => `M42 ${FLAP_Y0 + i * dy}h8`).join("")} className="arc s-label" strokeWidth="0.8" opacity="0.5" />
        <g ref={ptr}>
          <rect x="42.6" y={FLAP_Y0 - 2} width="6.8" height="4" rx="1" className="mk" />
        </g>
        <T x={46} y={LEVER_H - 13} s={5} className="lbl tx-faint">
          POS
        </T>
      </g>
    </svg>
  );
}

// ---------------------------------------------------------------- elevator trim wheel

export const TRIM_W = 42;
const TRIM_MID = 72;
const TRIM_HALF = 44;

export function TrimWheel() {
  const { sim } = usePanel();
  const c = sim.controls;
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const ridges = useRef<SVGGElement>(null);
  const ptr = useRef<SVGGElement>(null);
  const cR = useCell(NaN);
  const cP = useCell(NaN);
  useFrame(({ c: k }) => {
    const t = clamp(k.trim, -1, 1);
    const r = Math.round((((t * 90) % 8) + 8) % 8 * 10) / 10;
    if (r !== cR.v) {
      cR.v = r;
      ridges.current?.setAttribute("transform", `translate(0 ${r})`);
    }
    const p = Math.round(t * TRIM_HALF * 10) / 10;
    if (p !== cP.v) {
      cP.v = p;
      ptr.current?.setAttribute("transform", `translate(0 ${p})`);
    }
  });
  const bump = (d: number) => {
    c.trim = clamp(c.trim + d, -1, 1);
  };
  // Rolling the exposed rim of the wheel DOWN trims nose UP, as in the aeroplane.
  const drag = useDrag((d) => {
    if (d.phase === "move") bump((d.dfy * LEVER_H) / 150);
  });
  const wheel = useWheel((dir) => bump(-dir * 0.015));
  return (
    <svg className="txp-inst" data-instrument="trim" viewBox={`0 0 ${TRIM_W} ${LEVER_H}`} style={box(TRIM_W, LEVER_H)}>
      <defs>
        <clipPath id={`${uid}t`}>
          <rect x="5" y="20" width="15" height="104" rx="5" />
        </clipPath>
      </defs>
      <g
        {...drag}
        ref={wheel}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key !== "Enter") return;
          e.preventDefault();
          e.stopPropagation();
          bump(e.shiftKey ? -0.02 : 0.02);
        }}
        data-ctl="trim-wheel"
        role="slider"
        aria-label="Elevator trim wheel. Enter trims nose up, Shift+Enter trims nose down."
        className="tx-ctl"
      >
        <Hit x={0} y={0} w={TRIM_W} h={LEVER_H} />
        <T x={TRIM_W / 2} y={7} s={6.4} className="lbl">
          ELEV TRIM
        </T>
        <rect x="5" y="20" width="15" height="104" rx="5" className="tx-wheel" />
        <g clipPath={`url(#${uid}t)`}>
          <g ref={ridges}>
            <path d={range(4, 132, 8).map((y) => `M6 ${y}H19`).join("")} className="tx-wheel-ridge" />
          </g>
        </g>
        <rect x="5" y="20" width="15" height="104" rx="5" className="tx-wheel-shade" />
        {/* position indicator: up = nose down, down = nose up, the mark in the middle is the take-off setting */}
        <rect x="24.5" y={TRIM_MID - TRIM_HALF - 5} width="4" height={TRIM_HALF * 2 + 10} rx="1.5" className="tx-window" />
        <path d={`M23.5 ${TRIM_MID}H30`} className="arc s-label" strokeWidth="2" />
        <g ref={ptr}>
          <path d={`M24.2 ${TRIM_MID} L30.4 ${TRIM_MID - 4} V${TRIM_MID + 4} Z`} className="mk" />
        </g>
        <T x={36} y={TRIM_MID - TRIM_HALF} s={5.4} className="lbl">
          DN
        </T>
        <T x={36} y={TRIM_MID} s={5.2} className="lbl">
          T/O
        </T>
        <T x={36} y={TRIM_MID + TRIM_HALF} s={5.4} className="lbl">
          UP
        </T>
        <T x={TRIM_W / 2} y={LEVER_H - 6.5} s={5.2} className="lbl tx-faint">
          NOSE
        </T>
      </g>
    </svg>
  );
}

// ---------------------------------------------------------------- fuel selector

export const FUELSEL_W = 68;
const FS_CX = 34;
const FS_CY = 80;
const FS_POS: readonly FuelSelectorPos[] = ["both", "right", "off", "left"];
const FS_ANGLE: Record<FuelSelectorPos, number> = { both: 0, right: 90, off: 180, left: 270 };

export function FuelSelector() {
  const api = usePanel();
  const c = api.sim.controls;
  const handle = useRef<SVGGElement>(null);
  const cell = useCell(NaN);
  const shown = useRef(NaN);
  useFrame(({ c: k, dt }) => {
    const target = FS_ANGLE[k.fuelSelector] ?? 0;
    if (!Number.isFinite(shown.current)) shown.current = target;
    let d = target - shown.current;
    d = ((((d + 180) % 360) + 360) % 360) - 180;
    shown.current += d * Math.min(1, dt * 16);
    setRot(handle.current, cell, shown.current, FS_CX, FS_CY, 0.3);
  });
  const set = (p: FuelSelectorPos) => {
    if (c.fuelSelector === p) return;
    c.fuelSelector = p;
    api.click("switch");
  };
  const drag = useDrag((d) => {
    if (d.phase === "up") return;
    const dx = d.fx * FUELSEL_W - FS_CX;
    const dy = d.fy * LEVER_H - FS_CY;
    if (Math.hypot(dx, dy) < 8) return;
    const a = (((Math.atan2(dx, -dy) * 180) / Math.PI) + 360) % 360;
    set(FS_POS[Math.round(a / 90) % 4]!);
  });
  return (
    <svg className="txp-inst" data-instrument="fuel-selector" viewBox={`0 0 ${FUELSEL_W} ${LEVER_H}`} style={box(FUELSEL_W, LEVER_H)}>
      <g
        {...drag}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key !== "Enter") return;
          e.preventDefault();
          e.stopPropagation();
          const order: FuelSelectorPos[] = ["left", "both", "right", "off"];
          const i = order.indexOf(c.fuelSelector);
          set(order[(i + (e.shiftKey ? order.length - 1 : 1)) % order.length]!);
        }}
        data-ctl="fuel-selector"
        role="slider"
        aria-label="Fuel selector valve: LEFT, BOTH, RIGHT or OFF. Enter moves to the next position."
        className="tx-ctl"
      >
        <Hit x={0} y={0} w={FUELSEL_W} h={LEVER_H} />
        <T x={FUELSEL_W / 2} y={7} s={6.4} className="lbl">
          FUEL SELECTOR
        </T>
        <circle cx={FS_CX} cy={FS_CY} r="22" className="tx-plate" />
        <path d={tickPath([0, 90, 180, 270], 18, 22, FS_CX, FS_CY)} className="arc s-label" strokeWidth="1.6" />
        <T x={FS_CX} y={FS_CY - 31} s={7.4} className="lbl">
          BOTH
        </T>
        <T x={FS_CX} y={FS_CY + 31.5} s={7.4} className="lbl">
          OFF
        </T>
        <T x={5.2} y={FS_CY} s={8.4} className="lbl">
          L
        </T>
        <T x={FUELSEL_W - 5.2} y={FS_CY} s={8.4} className="lbl">
          R
        </T>
        <g ref={handle}>
          <path d={`M${FS_CX} ${FS_CY - 19} L${FS_CX + 5.5} ${FS_CY - 6} V${FS_CY + 9} A5.5 5.5 0 0 1 ${FS_CX - 5.5} ${FS_CY + 9} V${FS_CY - 6} Z`} className="tx-fuel-handle" />
          <path d={`M${FS_CX} ${FS_CY - 15.5}V${FS_CY - 6}`} className="tx-knob-mark" />
        </g>
      </g>
    </svg>
  );
}
