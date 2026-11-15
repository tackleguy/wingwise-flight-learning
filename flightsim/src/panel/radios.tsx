/**
 * Avionics: COM 1 and NAV 1 (active / standby with flip-flop), the DME / station ident readout,
 * the transponder and the VOR indicator (course deviation indicator, CDI).
 * Tuning writes sim.controls; the receivers themselves live in the nav module (sim.state.nav).
 */
import { useMemo, useRef, useState, useEffect } from "react";
import { norm360 } from "@/core/math";
import type { ControlState, RadioFreqs } from "@/core/types";
import { useFrame, usePanel } from "./context";
import { CardLabels } from "./flight";
import { CDI_UNITS_PER_DOT, cardRotation, cdiOffset } from "./geometry";
import { usePress, useWheel } from "./interact";
import { Dial, Knob, PushButton, SevenSeg, T, box, range, setOpacity, setRot, setShown, setText, tickPath, useCell, type SegApi } from "./parts";
import { XPDR_MODES, cleanSquawk, flipFlop, formatFreq, stepSquawkDigit, tune, type RadioBand, type XpdrMode } from "./radio";

export const STACK_W = 244;
export const NAVCOM_H = 68;
export const DME_H = 32;
export const XPDR_H = 52;
/** Invisible touch margin around the small tuning buttons (they sit 4–5 units apart). */
const BTN_PAD = [2, 4] as const;

/** Operate a radio only when the avionics have power; otherwise tell the pilot why nothing happens. */
function useAvionicsGuard(): (fn: () => void) => void {
  const api = usePanel();
  return (fn) => {
    if (api.sim.state.sys.avionicsPowered) fn();
    else api.hintNoPower();
  };
}

// ---------------------------------------------------------------- NAV / COM unit

function NavCom({ band, n }: { band: RadioBand; n: 1 }) {
  const api = usePanel();
  const guard = useAvionicsGuard();
  const id = band === "com" ? "com1" : "nav1";
  const get = (c: ControlState): RadioFreqs => (band === "com" ? c.com1 : c.nav1);
  const act = useRef<SegApi>(null);
  const sby = useRef<SegApi>(null);
  const lit = useRef<SVGGElement>(null);
  const cLit = useCell(NaN);
  const digits = band === "com" ? 6 : 5;
  useFrame(({ c, avionics }) => {
    const r = get(c);
    act.current?.set(formatFreq(band, r.active));
    sby.current?.set(formatFreq(band, r.standby));
    setOpacity(lit.current, cLit, avionics ? 1 : 0);
  });
  const step = (part: "mhz" | "khz", steps: number) =>
    guard(() => {
      const r = get(api.sim.controls);
      r.standby = tune(band, r.standby, part, steps);
    });
  const flip = () => guard(() => flipFlop(get(api.sim.controls)));
  const name = band === "com" ? "COM" : "NAV";
  const what = band === "com" ? "communication radio" : "navigation radio";
  const xa = band === "com" ? 12 : 17;
  const xs = band === "com" ? 97 : 102;
  return (
    <svg className="txp-inst" data-instrument={id} viewBox={`0 0 ${STACK_W} ${NAVCOM_H}`} style={box(STACK_W, NAVCOM_H)} role="group" aria-label={`${name} ${n} ${what}`}>
      <rect x="0.5" y="0.5" width={STACK_W - 1} height={NAVCOM_H - 1} rx="3" className="tx-radio" />
      <T x={7} y={8} s={7.4} anchor="start" className="lbl">
        {name} {n}
      </T>
      <T x={56} y={8} s={5.4} className="lbl tx-faint">
        ACTIVE
      </T>
      <T x={140} y={8} s={5.4} className="lbl tx-faint">
        STANDBY
      </T>
      <rect x="6" y="13" width="174" height="27" rx="2" className="tx-display" />
      <path d="M91 16V37" className="tx-display-rule" />
      <g ref={lit}>
        <SevenSeg x={xa} y={18.5} h={16} count={digits} api={act} />
        <SevenSeg x={xs} y={18.5} h={16} count={digits} api={sby} />
      </g>
      {/* flip-flop: swap active and standby */}
      <PushButton x={6} y={44} w={34} h={19} ctl={`${id}-flip`} label={`${name} ${n}: swap the active and standby frequencies`} onPress={flip} pad={[2.5, 4]}>
        <path d="M14 50.5H31L27.5 47.5M32 56.5H15L18.5 59.5" className="tx-btn-glyph" />
      </PushButton>
      {/* touch buttons: whole megahertz and kilohertz, down / up */}
      <PushButton x={46} y={44} w={24} h={19} ctl={`${id}-mhz-dec`} label={`${name} ${n} standby: one megahertz down`} text="−" fontSize={13} repeat pad={BTN_PAD} onPress={() => step("mhz", -1)} />
      <T x={78.5} y={54} s={6} className="lbl">
        MHz
      </T>
      <PushButton x={87} y={44} w={24} h={19} ctl={`${id}-mhz-inc`} label={`${name} ${n} standby: one megahertz up`} text="+" fontSize={13} repeat pad={BTN_PAD} onPress={() => step("mhz", 1)} />
      <PushButton x={115} y={44} w={24} h={19} ctl={`${id}-khz-dec`} label={`${name} ${n} standby: one channel down`} text="−" fontSize={13} repeat pad={BTN_PAD} onPress={() => step("khz", -1)} />
      <T x={147.5} y={54} s={6} className="lbl">
        kHz
      </T>
      <PushButton x={156} y={44} w={24} h={19} ctl={`${id}-khz-inc`} label={`${name} ${n} standby: one channel up`} text="+" fontSize={13} repeat pad={BTN_PAD} onPress={() => step("khz", 1)} />
      {/* dual concentric tuning knob: large ring = megahertz, small centre knob = kilohertz */}
      <Knob cx={212} cy={36} r={25} hitR={27} ctl={`${id}-mhz-knob`} label={`${name} ${n} large tuning knob: whole megahertz of the standby frequency`} onStep={(s) => step("mhz", s)} pxPerStep={9} fastGain={1} />
      <Knob cx={212} cy={36} r={13.5} hitR={14.5} ctl={`${id}-khz-knob`} label={`${name} ${n} small tuning knob: kilohertz of the standby frequency`} onStep={(s) => step("khz", s)} pxPerStep={7} fastGain={2} text="kHz" />
      <T x={190} y={7.2} s={5.4} className="lbl tx-faint">
        MHz
      </T>
      <path d="M197 8.6 L200.5 12.5" className="tx-leader" />
    </svg>
  );
}

export const Com1 = () => <NavCom band="com" n={1} />;
export const Nav1 = () => <NavCom band="nav" n={1} />;

// ---------------------------------------------------------------- DME / ident readout

/** Station identifier, DME distance and ground speed for NAV 1, with the IDENT (listen) button. */
export function DmeStrip() {
  const api = usePanel();
  const guard = useAvionicsGuard();
  const ident = useRef<SVGTextElement>(null);
  const dist = useRef<SVGTextElement>(null);
  const gs = useRef<SVGTextElement>(null);
  const lit = useRef<SVGGElement>(null);
  const lamp = useRef<SVGCircleElement>(null);
  const cIdent = useCell("");
  const cDist = useCell("");
  const cGs = useCell("");
  const cLit = useCell(NaN);
  const cLamp = useCell(NaN);
  // The panel only remembers whether the ident button is pressed in; the audio / nav modules play the Morse code.
  const identOn = useRef(false);
  useEffect(
    () =>
      api.sim.events.on("command", (e) => {
        if (e.id === "nav1-ident-toggle") identOn.current = !identOn.current;
      }),
    [api],
  );
  useFrame(({ nav, avionics }) => {
    const v = nav.nav1;
    setOpacity(lit.current, cLit, avionics ? 1 : 0);
    setOpacity(lamp.current, cLamp, avionics && identOn.current ? 1 : 0.12);
    setText(ident.current, cIdent, v.valid && v.ident ? v.ident : "---");
    const d = v.valid ? v.dmeNm : null;
    setText(dist.current, cDist, d === null ? "--.-" : d < 99.95 ? d.toFixed(1) : d.toFixed(0));
    const g = v.valid ? v.dmeGsKt : null;
    setText(gs.current, cGs, g === null ? "---" : String(Math.round(Math.abs(g))));
  });
  return (
    <svg className="txp-inst" data-instrument="dme" viewBox={`0 0 ${STACK_W} ${DME_H}`} style={box(STACK_W, DME_H)} role="group" aria-label="NAV 1 station identifier and DME distance">
      <rect x="0.5" y="0.5" width={STACK_W - 1} height={DME_H - 1} rx="3" className="tx-radio" />
      <PushButton x={6} y={6} w={32} h={20} ctl="nav1-ident" label="NAV 1 ident: listen to the station's Morse code identifier" text="ID" fontSize={9} onPress={() => guard(() => api.sim.events.emit("command", { id: "nav1-ident-toggle" }))}>
        <circle ref={lamp} cx="33" cy="10.5" r="2" className="tx-led-dot" style={{ opacity: 0.12 }} />
      </PushButton>
      <rect x="43" y="5" width="195" height="22" rx="2" className="tx-display" />
      <g ref={lit}>
        <text ref={ident} x="50" y="16.6" fontSize="12.5" textAnchor="start" dominantBaseline="central" className="tx-led tx-mono">
          ---
        </text>
        <text ref={dist} x="153" y="16.6" fontSize="12.5" textAnchor="end" dominantBaseline="central" className="tx-led tx-mono">
          --.-
        </text>
        <T x={163} y={18} s={6} className="tx-led">
          NM
        </T>
        <text ref={gs} x="212" y="16.6" fontSize="12.5" textAnchor="end" dominantBaseline="central" className="tx-led tx-mono">
          ---
        </text>
        <T x={225} y={18} s={6} className="tx-led">
          KT
        </T>
      </g>
    </svg>
  );
}

// ---------------------------------------------------------------- transponder

function SquawkDigit({ index, x }: { index: number; x: number }) {
  const api = usePanel();
  const guard = useAvionicsGuard();
  const bump = (dir: number) =>
    guard(() => {
      const xp = api.sim.controls.xpdr;
      xp.code = stepSquawkDigit(xp.code, index, dir);
    });
  const up = usePress(() => bump(1), { repeat: true });
  const down = usePress(() => bump(-1), { repeat: true });
  const wheel = useWheel((dir) => bump(dir));
  return (
    <g ref={wheel}>
      <g {...up} data-ctl={`xpdr-d${index}-inc`} role="button" aria-label={`Transponder digit ${index + 1} up`} className="tx-ctl">
        <rect x={x} y="13" width="24" height="17" className="tx-hit" />
        <path d={`M${x + 12} 15.4l3.4 3.4h-6.8z`} className="tx-digit-arrow" />
      </g>
      <g {...down} data-ctl={`xpdr-d${index}-dec`} role="button" aria-label={`Transponder digit ${index + 1} down`} className="tx-ctl">
        <rect x={x} y="30" width="24" height="17" className="tx-hit" />
        <path d={`M${x + 12} 44.6l3.4-3.4h-6.8z`} className="tx-digit-arrow" />
      </g>
    </g>
  );
}

export function Transponder() {
  const api = usePanel();
  const code = useRef<SegApi>(null);
  const lit = useRef<SVGGElement>(null);
  const keys = useRef<(SVGGElement | null)[]>([]);
  const cLit = useCell(NaN);
  const cMode = useCell("");
  useFrame(({ c, avionics }) => {
    code.current?.set(cleanSquawk(c.xpdr.code));
    setOpacity(lit.current, cLit, avionics && c.xpdr.mode !== "OFF" ? 1 : 0);
    const key = `${c.xpdr.mode}${avionics ? 1 : 0}`;
    if (key !== cMode.v) {
      cMode.v = key;
      XPDR_MODES.forEach((m, i) => keys.current[i]?.setAttribute("data-on", m === c.xpdr.mode ? (avionics && m !== "OFF" ? "lit" : "sel") : ""));
    }
  });
  const setMode = (m: XpdrMode) => {
    api.sim.controls.xpdr.mode = m;
  };
  return (
    <svg className="txp-inst" data-instrument="transponder" viewBox={`0 0 ${STACK_W} ${XPDR_H}`} style={box(STACK_W, XPDR_H)} role="group" aria-label="Transponder">
      <rect x="0.5" y="0.5" width={STACK_W - 1} height={XPDR_H - 1} rx="3" className="tx-radio" />
      <T x={7} y={7.5} s={7.4} anchor="start" className="lbl">
        XPDR
      </T>
      <T x={72} y={7.5} s={5.4} className="lbl tx-faint">
        CODE
      </T>
      <rect x="6" y="13" width="108" height="34" rx="2" className="tx-display" />
      <g ref={lit}>
        <SevenSeg x={17.4} y={21.5} h={17} count={4} api={code} pitch={25} />
      </g>
      {[0, 1, 2, 3].map((i) => (
        <SquawkDigit key={i} index={i} x={10 + i * 25} />
      ))}
      {XPDR_MODES.map((m, i) => {
        const x = 120 + (i % 2) * 60;
        const y = 13 + Math.floor(i / 2) * 18;
        return (
          <g
            key={m}
            ref={(el) => {
              keys.current[i] = el;
            }}
            className="tx-mode"
          >
            <PushButton x={x} y={y} w={57} h={16} ctl={`xpdr-${m.toLowerCase()}`} label={`Transponder mode ${m}`} text={m} fontSize={8} onPress={() => setMode(m)} />
          </g>
        );
      })}
    </svg>
  );
}

// ---------------------------------------------------------------- the whole radio stack

export function RadioStack() {
  return (
    <div className="txp-stack">
      <Com1 />
      <Nav1 />
      <DmeStrip />
      <Transponder />
    </div>
  );
}
export const RADIO_STACK_H = NAVCOM_H * 2 + DME_H + XPDR_H + 3 * 4;

// ---------------------------------------------------------------- VOR indicator (course deviation indicator)

const NEEDLE_PIVOT_Y = 34;
const DOT_ROW_Y = 100;

/**
 * VOR indicator for NAV 1. The OBS knob turns the course card; the needle shows which side the
 * selected course lies on (each dot is 2°); the triangle shows TO or FROM; the striped flag means
 * "no usable signal".
 */
export function VorIndicator({ size }: { size: number }) {
  const api = usePanel();
  const [uid] = useState(() => `v${Math.random().toString(36).slice(2, 8)}`);
  const card = useRef<SVGGElement>(null);
  const needle = useRef<SVGGElement>(null);
  const to = useRef<SVGPathElement>(null);
  const from = useRef<SVGPathElement>(null);
  const off = useRef<SVGGElement>(null);
  const cCard = useCell(NaN);
  const cNeedle = useCell(NaN);
  const cTo = useCell(-1);
  const cFrom = useCell(-1);
  const cOff = useCell(-1);
  useFrame(({ nav, c, avionics }) => {
    const v = nav.nav1;
    const live = avionics && v.flag !== "OFF";
    setRot(card.current, cCard, cardRotation(c.obs1));
    // The needle hangs from a pivot at the top and swings; without a signal it rests in the centre.
    const x = live ? cdiOffset(v.cdiDots) : 0;
    const a = (-Math.atan2(x, DOT_ROW_Y - NEEDLE_PIVOT_Y) * 180) / Math.PI;
    setRot(needle.current, cNeedle, a, 100, NEEDLE_PIVOT_Y, 0.03);
    setShown(to.current, cTo, live && v.flag === "TO");
    setShown(from.current, cFrom, live && v.flag === "FROM");
    setShown(off.current, cOff, !live);
  });
  const art = useMemo(() => ({ tens: tickPath(range(0, 350, 10), 80, 89.5), fives: tickPath(range(5, 355, 10), 84, 89.5) }), []);
  const dots = [-5, -4, -3, -2, -1, 1, 2, 3, 4, 5];
  const setObs = (n: number) => {
    api.sim.controls.obs1 = norm360(Math.round(api.sim.controls.obs1 + n));
  };
  return (
    <Dial id="vor1" size={size} label="VOR indicator for NAV 1 (course deviation indicator)" screws={[0, 1, 3]}>
      <defs>
        <clipPath id={`${uid}c`}>
          <circle cx="100" cy="100" r="60" />
        </clipPath>
        <pattern id={`${uid}s`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="6" height="6" className="mk" />
          <rect width="3" height="6" className="f-red" />
        </pattern>
      </defs>
      {/* rotating course card (set with the OBS knob) */}
      <g ref={card}>
        <path d={art.fives} className="arc s-mk" strokeWidth="1" />
        <path d={art.tens} className="arc s-mk" strokeWidth="1.8" />
        <CardLabels r={70} s={11.5} sLetter={12.5} />
      </g>
      <circle cx="100" cy="100" r="60.5" className="tx-inner-face" />
      {/* course index (top) and reciprocal (bottom) */}
      <path d="M100 38.6 L95.4 48.4 H104.6 Z" className="f-orange" />
      <path d="M100 161.4 L96.6 153.6 H103.4 Z" className="mk" />
      {/* deviation scale: centre circle and five dots each side (2° per dot) */}
      <circle cx="100" cy={DOT_ROW_Y} r="5.2" className="arc s-mk" strokeWidth="1.4" />
      {dots.map((d) => (
        <circle key={d} cx={100 + d * CDI_UNITS_PER_DOT} cy={DOT_ROW_Y} r="1.9" className="mk" />
      ))}
      {/* TO / FROM window */}
      <T x={133} y={66.5} s={6} className="tx-legend">
        TO
      </T>
      <T x={133} y={93} s={6} className="tx-legend">
        FR
      </T>
      <rect x="124" y="70.5" width="18" height="18" rx="1.5" className="tx-window" />
      <path ref={to} d="M133 73.5 L139.5 85 H126.5 Z" className="mk" style={{ display: "none" }} />
      <path ref={from} d="M133 85.5 L139.5 74 H126.5 Z" className="mk" style={{ display: "none" }} />
      <g ref={off}>
        <rect x="124.6" y="71.1" width="16.8" height="16.8" rx="1" fill={`url(#${uid}s)`} />
      </g>
      <T x={72} y={76} s={6.4} className="tx-legend">
        NAV 1
      </T>
      <T x={100} y={137} s={6} className="tx-legend">
        VOR
      </T>
      <g clipPath={`url(#${uid}c)`}>
        <g ref={needle}>
          <path d={`M100 ${NEEDLE_PIVOT_Y}V166`} className="tx-cdi-needle" />
        </g>
      </g>
      <Knob cx={22} cy={178} r={13} hitR={22} ctl="obs1-knob" label="OBS knob: selects the VOR course. Enter turns the course up, Shift+Enter down." onStep={setObs} pxPerStep={4} text="OBS" />
    </Dial>
  );
}
