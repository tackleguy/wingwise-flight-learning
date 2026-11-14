/**
 * Classic "six-pack" steam gauges + magnetic compass. Each gauge is exported separately and reads
 * the engine snapshot via context; knobs (altimeter Kollsman, heading bug) change engine state.
 *
 * In glass-cockpit aircraft these gauges behave as the STANDBY instruments: the standby attitude
 * indicator keeps working after an AHRS failure (it has its own gyro), which is exactly what the
 * partial-panel lesson relies on.
 */
import { memo } from "react";
import { clamp, norm180 } from "@/lib/geo";
import { cn } from "@/lib/utils";
import { pad3 } from "@/sim/avionics-helpers";
import { useSimEngine, useSimSnapshot } from "@/sim/react";
import {
  arcPath,
  ExplainButton,
  Flag,
  GaugeFace,
  GaugeFrame,
  GaugeGlass,
  MONO,
  polar,
} from "./common";
import { stepBaro, stepHeadingBug, syncHeadingBug } from "./controls";
import { Knob } from "./Knob";

const WHITE = "#f1f3f5";

interface GaugeProps {
  className?: string | undefined;
}

function Needle({
  angle,
  length,
  width = 4,
  color = WHITE,
  tail = 14,
}: {
  angle: number;
  length: number;
  width?: number;
  color?: string;
  tail?: number;
}) {
  return (
    <g transform={`rotate(${angle} 100 100)`}>
      <path
        d={`M ${100 - width / 2} ${100 + tail} L ${100 - width / 2} ${100 - length + 8} L 100 ${100 - length} L ${100 + width / 2} ${100 - length + 8} L ${100 + width / 2} ${100 + tail} Z`}
        fill={color}
        stroke="black"
        strokeWidth={0.6}
      />
    </g>
  );
}

function Hub() {
  return <circle cx={100} cy={100} r={6} fill="#2a2d31" stroke="#555" />;
}

// ---------------------------------------------------------------- airspeed

export function AirspeedIndicator({ className }: GaugeProps) {
  const s = useSimSnapshot();
  const engine = useSimEngine();
  const v = engine.perf.v;
  const vmax = Math.ceil((v.ne * 1.15) / 20) * 20;
  const ang = (kt: number) =>
    kt <= 40 ? (Math.max(0, kt) / 40) * 28 : 28 + ((Math.min(kt, vmax) - 40) / (vmax - 40)) * 312;
  const ias = s.indicated.iasKt;
  return (
    <GaugeFrame caption="Airspeed" explainId="asi" className={className}>
      <svg
        viewBox="0 0 200 200"
        className="h-full w-full"
        role="img"
        aria-label={`Airspeed ${Math.round(ias)} knots`}
      >
        <GaugeFace />
        <AsiDial vmax={vmax} so={v.so} fe={v.fe} s1={v.s1} no={v.no} ne={v.ne} />
        <Needle angle={ang(ias)} length={78} />
        <Hub />
        <GaugeGlass />
      </svg>
    </GaugeFrame>
  );
}

const AsiDial = memo(function AsiDial({
  vmax,
  so,
  fe,
  s1,
  no,
  ne,
}: {
  vmax: number;
  so: number;
  fe: number;
  s1: number;
  no: number;
  ne: number;
}) {
  const ang = (kt: number) =>
    kt <= 40 ? (Math.max(0, kt) / 40) * 28 : 28 + ((Math.min(kt, vmax) - 40) / (vmax - 40)) * 312;
  const ticks: React.ReactNode[] = [];
  for (let kt = 40; kt <= vmax; kt += 5) {
    const major = kt % 10 === 0;
    const a = polar(100, 100, 88, ang(kt));
    const b = polar(100, 100, major ? 76 : 81, ang(kt));
    ticks.push(
      <line
        key={kt}
        x1={a.x}
        y1={a.y}
        x2={b.x}
        y2={b.y}
        stroke={WHITE}
        strokeWidth={major ? 2 : 1}
      />,
    );
    if (kt % 20 === 0) {
      const p = polar(100, 100, 63, ang(kt));
      ticks.push(
        <text
          key={`n${kt}`}
          x={p.x}
          y={p.y + 5}
          textAnchor="middle"
          fill={WHITE}
          fontSize={13}
          fontFamily={MONO}
        >
          {kt}
        </text>,
      );
    }
  }
  const ne1 = polar(100, 100, 90, ang(ne));
  const ne2 = polar(100, 100, 72, ang(ne));
  return (
    <g>
      <path
        d={arcPath(100, 100, 79, ang(so), ang(fe))}
        fill="none"
        stroke={WHITE}
        strokeWidth={5}
      />
      <path
        d={arcPath(100, 100, 85, ang(s1), ang(no))}
        fill="none"
        stroke="var(--ok)"
        strokeWidth={6}
      />
      <path
        d={arcPath(100, 100, 85, ang(no), ang(ne))}
        fill="none"
        stroke="var(--caution)"
        strokeWidth={6}
      />
      <line x1={ne1.x} y1={ne1.y} x2={ne2.x} y2={ne2.y} stroke="var(--warning)" strokeWidth={4} />
      {ticks}
      <text
        x={100}
        y={128}
        textAnchor="middle"
        fill={WHITE}
        fontSize={10}
        fontFamily={MONO}
        letterSpacing={1}
      >
        AIRSPEED
      </text>
      <text x={100} y={140} textAnchor="middle" fill={WHITE} fontSize={9} fontFamily={MONO}>
        KNOTS
      </text>
    </g>
  );
});

// ---------------------------------------------------------------- attitude

export function AttitudeIndicator({ className }: GaugeProps) {
  const s = useSimSnapshot();
  const engine = useSimEngine();
  // Glass aircraft: this is the standby attitude indicator (independent gyro).
  const standby = engine.perf.avionics !== "steam";
  const pitch = standby ? s.aircraft.pitch : s.indicated.pitch;
  const bank = standby ? s.aircraft.bank : s.indicated.bank;
  const P = 3; // px per degree
  return (
    <GaugeFrame
      caption={standby ? "Standby attitude" : "Attitude"}
      explainId="ai"
      className={className}
    >
      <svg
        viewBox="0 0 200 200"
        className="h-full w-full"
        role="img"
        aria-label={`Attitude pitch ${Math.round(pitch)} bank ${Math.round(bank)}`}
      >
        <GaugeFace />
        <defs>
          <clipPath id="tx-ai-clip">
            <circle cx={100} cy={100} r={84} />
          </clipPath>
        </defs>
        <g clipPath="url(#tx-ai-clip)">
          <g transform={`rotate(${-bank} 100 100)`}>
            <g transform={`translate(0 ${clamp(pitch, -30, 30) * P})`}>
              <rect x={-100} y={-200} width={400} height={300} fill="#2f7fd0" />
              <rect x={-100} y={100} width={400} height={300} fill="#6b4420" />
              <line x1={-100} x2={300} y1={100} y2={100} stroke={WHITE} strokeWidth={2} />
              <AiPitchLines />
            </g>
            {/* sky pointer (rotates with the horizon card) */}
            <polygon points="100,18 93,31 107,31" fill={WHITE} />
          </g>
        </g>
        <AiBankScale />
        {/* fixed miniature aircraft */}
        <g>
          <path
            d="M 52 101 h 34 l 14 12 l 14 -12 h 34"
            fill="none"
            stroke="#ff8a1f"
            strokeWidth={4.5}
            strokeLinejoin="round"
          />
          <circle cx={100} cy={101} r={3.5} fill="#ff8a1f" />
          <path d="M 100 172 L 92 188 L 108 188 Z" fill="#ff8a1f" />
        </g>
        <GaugeGlass />
      </svg>
    </GaugeFrame>
  );
}

const AiPitchLines = memo(function AiPitchLines() {
  const P = 3;
  return (
    <g>
      {[-20, -10, -5, 5, 10, 20].map((p) => {
        const w = Math.abs(p) === 5 ? 16 : Math.abs(p) === 10 ? 30 : 42;
        const y = 100 - p * P;
        return (
          <line key={p} x1={100 - w} x2={100 + w} y1={y} y2={y} stroke={WHITE} strokeWidth={1.6} />
        );
      })}
    </g>
  );
});

const AiBankScale = memo(function AiBankScale() {
  return (
    <g>
      {[-90, -60, -30, -20, -10, 10, 20, 30, 60, 90].map((a) => {
        const long = Math.abs(a) === 30 || Math.abs(a) === 60 || Math.abs(a) === 90;
        const p1 = polar(100, 100, 86, a);
        const p2 = polar(100, 100, long ? 74 : 79, a);
        return (
          <line
            key={a}
            x1={p1.x}
            y1={p1.y}
            x2={p2.x}
            y2={p2.y}
            stroke={WHITE}
            strokeWidth={long ? 3 : 2}
          />
        );
      })}
      {[-45, 45].map((a) => {
        const p = polar(100, 100, 81, a);
        return <circle key={a} cx={p.x} cy={p.y} r={2} fill={WHITE} />;
      })}
      <polygon points="100,16 94,6 106,6" fill={WHITE} />
    </g>
  );
});

// ---------------------------------------------------------------- altimeter

export function Altimeter({ className }: GaugeProps) {
  const s = useSimSnapshot();
  const engine = useSimEngine();
  const alt = s.indicated.altFt;
  const inHg = s.radios.altimeterInHg;
  const a100 = ((((alt % 1000) + 1000) % 1000) / 1000) * 360;
  const a1000 = ((((alt % 10000) + 10000) % 10000) / 10000) * 360;
  const a10000 = (clamp(alt, 0, 100000) / 100000) * 360;
  return (
    <GaugeFrame
      caption="Altimeter"
      explainId="alt"
      className={className}
      controls={
        <div className="absolute -bottom-1 -left-1">
          <Knob
            size="sm"
            label="Altimeter setting (Kollsman)"
            caption=""
            valueNow={inHg}
            valueMin={27.5}
            valueMax={31.5}
            valueText={`${inHg.toFixed(2)} inches of mercury`}
            onStep={(d, big) => stepBaro(engine, d, big)}
          />
        </div>
      }
    >
      <svg
        viewBox="0 0 200 200"
        className="h-full w-full"
        role="img"
        aria-label={`Altitude ${Math.round(alt)} feet, altimeter ${inHg.toFixed(2)}`}
      >
        <GaugeFace />
        <AltDial />
        {/* Kollsman window */}
        <rect x={108} y={92} width={40} height={16} rx={2} fill="black" stroke="#666" />
        <text x={128} y={104} textAnchor="middle" fill={WHITE} fontSize={11} fontFamily={MONO}>
          {inHg.toFixed(2)}
        </text>
        {alt < 10000 ? (
          <g>
            <defs>
              <pattern
                id="tx-xhatch"
                width={6}
                height={6}
                patternUnits="userSpaceOnUse"
                patternTransform="rotate(45)"
              >
                <rect width={3} height={6} fill={WHITE} />
                <rect x={3} width={3} height={6} fill="#111" />
              </pattern>
            </defs>
            <rect x={90} y={52} width={20} height={9} fill="url(#tx-xhatch)" stroke="#444" />
          </g>
        ) : null}
        <g transform={`rotate(${a10000} 100 100)`}>
          <line x1={100} y1={100} x2={100} y2={14} stroke={WHITE} strokeWidth={1.4} />
          <polygon points="100,10 94,22 106,22" fill={WHITE} />
        </g>
        <Needle angle={a1000} length={48} width={9} />
        <Needle angle={a100} length={80} width={4} />
        <Hub />
        <GaugeGlass />
      </svg>
    </GaugeFrame>
  );
}

const AltDial = memo(function AltDial() {
  const out: React.ReactNode[] = [];
  for (let i = 0; i < 50; i++) {
    const a = (i / 50) * 360;
    const major = i % 5 === 0;
    const p1 = polar(100, 100, 88, a);
    const p2 = polar(100, 100, major ? 76 : 82, a);
    out.push(
      <line
        key={i}
        x1={p1.x}
        y1={p1.y}
        x2={p2.x}
        y2={p2.y}
        stroke={WHITE}
        strokeWidth={major ? 2.2 : 1}
      />,
    );
  }
  for (let n = 0; n < 10; n++) {
    const p = polar(100, 100, 65, n * 36);
    out.push(
      <text
        key={`n${n}`}
        x={p.x}
        y={p.y + 6}
        textAnchor="middle"
        fill={WHITE}
        fontSize={17}
        fontFamily={MONO}
        fontWeight={600}
      >
        {n}
      </text>,
    );
  }
  return (
    <g>
      {out}
      <text x={100} y={78} textAnchor="middle" fill={WHITE} fontSize={8} fontFamily={MONO}>
        ALT
      </text>
      <text x={100} y={140} textAnchor="middle" fill={WHITE} fontSize={8} fontFamily={MONO}>
        100 FEET
      </text>
    </g>
  );
});

// ---------------------------------------------------------------- turn coordinator

export function TurnCoordinator({ className }: GaugeProps) {
  const s = useSimSnapshot();
  const powered = s.controls.masterBattery && s.aircraft.busVolts > 18;
  const rate = s.indicated.turnRate;
  const rot = clamp((rate / 3) * 20, -38, 38);
  const slip = clamp(s.indicated.slip, -1, 1);
  const bx = 100 + slip * 30;
  const by = 160 - 5 * slip * slip;
  return (
    <GaugeFrame caption="Turn coordinator" explainId="tc" className={className}>
      <svg
        viewBox="0 0 200 200"
        className="h-full w-full"
        role="img"
        aria-label={`Turn rate ${rate.toFixed(1)} degrees per second`}
      >
        <GaugeFace />
        <TcDial />
        <g transform={`rotate(${rot} 100 100)`}>
          <path
            d="M 40 100 h 46 a 14 14 0 0 1 28 0 h 46"
            fill="none"
            stroke={WHITE}
            strokeWidth={5}
            strokeLinecap="round"
          />
          <circle cx={100} cy={100} r={7} fill={WHITE} />
          <path
            d="M 100 86 v -10 M 92 80 h 16"
            stroke={WHITE}
            strokeWidth={3.5}
            strokeLinecap="round"
          />
        </g>
        {/* inclinometer */}
        <path
          d="M 62 146 Q 100 162 138 146 L 138 158 Q 100 174 62 158 Z"
          fill="#1d2a1d"
          stroke="#888"
          strokeWidth={1}
          opacity={0.95}
        />
        <line x1={89} x2={89} y1={148} y2={166} stroke="#222" strokeWidth={2} />
        <line x1={111} x2={111} y1={148} y2={166} stroke="#222" strokeWidth={2} />
        <circle cx={bx} cy={by} r={6} fill="#0d0d0d" stroke="#bbb" strokeWidth={1} />
        {!powered ? <Flag x={100} y={62} text="OFF" /> : null}
        <GaugeGlass />
      </svg>
    </GaugeFrame>
  );
}

const TcDial = memo(function TcDial() {
  const mk = (a: number, key: string) => {
    const p1 = polar(100, 100, 86, a);
    const p2 = polar(100, 100, 72, a);
    return (
      <line key={key} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke={WHITE} strokeWidth={3} />
    );
  };
  return (
    <g>
      {mk(-90, "l0")}
      {mk(90, "r0")}
      {mk(-110, "l1")}
      {mk(110, "r1")}
      <text
        x={34}
        y={150}
        textAnchor="middle"
        fill={WHITE}
        fontSize={14}
        fontFamily={MONO}
        fontWeight={700}
      >
        L
      </text>
      <text
        x={166}
        y={150}
        textAnchor="middle"
        fill={WHITE}
        fontSize={14}
        fontFamily={MONO}
        fontWeight={700}
      >
        R
      </text>
      <text x={100} y={44} textAnchor="middle" fill={WHITE} fontSize={8} fontFamily={MONO}>
        TURN COORDINATOR
      </text>
      <text x={100} y={133} textAnchor="middle" fill={WHITE} fontSize={8} fontFamily={MONO}>
        2 MIN
      </text>
      <text x={100} y={181} textAnchor="middle" fill="#aaa" fontSize={6} fontFamily={MONO}>
        NO PITCH INFORMATION
      </text>
    </g>
  );
});

// ---------------------------------------------------------------- heading indicator

export function HeadingIndicator({ className }: GaugeProps) {
  const s = useSimSnapshot();
  const engine = useSimEngine();
  const hdg = s.indicated.headingMag;
  const bug = s.radios.hdgBug;
  return (
    <GaugeFrame
      caption="Heading"
      explainId="hi"
      className={className}
      controls={
        <div className="absolute -right-1 -bottom-1">
          <Knob
            size="sm"
            label="Heading bug"
            caption=""
            valueNow={bug}
            valueMin={0}
            valueMax={359}
            valueText={`Heading bug ${pad3(bug)}`}
            onStep={(d, big) => stepHeadingBug(engine, d, big)}
            onPush={() => syncHeadingBug(engine)}
          />
        </div>
      }
    >
      <svg
        viewBox="0 0 200 200"
        className="h-full w-full"
        role="img"
        aria-label={`Heading ${pad3(hdg)}, bug ${pad3(bug)}`}
      >
        <GaugeFace />
        <g transform={`rotate(${-hdg} 100 100)`}>
          <CompassCard r={86} />
          <g transform={`rotate(${bug} 100 100)`}>
            <path
              d="M 92 12 h 16 v 10 h -4 l -4 -5 l -4 5 h -4 Z"
              fill="var(--cyan)"
              stroke="black"
              strokeWidth={0.6}
            />
          </g>
        </g>
        <HiFixed />
        <GaugeGlass />
      </svg>
    </GaugeFrame>
  );
}

const CompassCard = memo(function CompassCard({ r }: { r: number }) {
  const out: React.ReactNode[] = [];
  const names: Record<number, string> = { 0: "N", 90: "E", 180: "S", 270: "W" };
  for (let d = 0; d < 360; d += 5) {
    const long = d % 10 === 0;
    const a = polar(100, 100, r, d);
    const b = polar(100, 100, r - (long ? 11 : 6), d);
    out.push(
      <line
        key={d}
        x1={a.x}
        y1={a.y}
        x2={b.x}
        y2={b.y}
        stroke={WHITE}
        strokeWidth={long ? 1.8 : 1}
      />,
    );
    if (d % 30 === 0) {
      const p = polar(100, 100, r - 24, d);
      out.push(
        <text
          key={`t${d}`}
          x={p.x}
          y={p.y + 6}
          textAnchor="middle"
          fill={WHITE}
          fontSize={names[d] ? 18 : 15}
          fontWeight={names[d] ? 700 : 500}
          fontFamily={MONO}
          transform={`rotate(${d} ${p.x} ${p.y})`}
        >
          {names[d] ?? d / 10}
        </text>,
      );
    }
  }
  return <g>{out}</g>;
});

const HiFixed = memo(function HiFixed() {
  return (
    <g>
      {[45, 135, 225, 315].map((a) => {
        const p1 = polar(100, 100, 91, a);
        const p2 = polar(100, 100, 84, a);
        return (
          <line
            key={a}
            x1={p1.x}
            y1={p1.y}
            x2={p2.x}
            y2={p2.y}
            stroke="#ff8a1f"
            strokeWidth={2.5}
          />
        );
      })}
      <polygon points="100,22 95,8 105,8" fill="#ff8a1f" />
      <path
        d="M 100 72 L 104 92 L 128 100 L 128 105 L 104 103 L 103 120 L 111 125 L 111 129 L 89 129 L 89 125 L 97 120 L 96 103 L 72 105 L 72 100 L 96 92 Z"
        fill="#ff8a1f"
        opacity={0.95}
      />
    </g>
  );
});

// ---------------------------------------------------------------- VSI

export function VerticalSpeedIndicator({ className }: GaugeProps) {
  const s = useSimSnapshot();
  const vs = s.indicated.vsFpm;
  const ang = (v: number) => -90 + (clamp(v, -2000, 2000) / 2000) * 170;
  return (
    <GaugeFrame caption="Vertical speed" explainId="vsi" className={className}>
      <svg
        viewBox="0 0 200 200"
        className="h-full w-full"
        role="img"
        aria-label={`Vertical speed ${Math.round(vs)} feet per minute`}
      >
        <GaugeFace />
        <VsiDial />
        <Needle angle={ang(vs)} length={80} />
        <Hub />
        <GaugeGlass />
      </svg>
    </GaugeFrame>
  );
}

const VsiDial = memo(function VsiDial() {
  const ang = (v: number) => -90 + (v / 2000) * 170;
  const out: React.ReactNode[] = [];
  for (let v = -2000; v <= 2000; v += 100) {
    const major = v % 500 === 0;
    const a = polar(100, 100, 88, ang(v));
    const b = polar(100, 100, major ? 75 : 81, ang(v));
    out.push(
      <line
        key={v}
        x1={a.x}
        y1={a.y}
        x2={b.x}
        y2={b.y}
        stroke={WHITE}
        strokeWidth={major ? 2.2 : 1}
      />,
    );
    if (v % 500 === 0) {
      const p = polar(100, 100, 63, ang(v));
      out.push(
        <text
          key={`n${v}`}
          x={p.x}
          y={p.y + 5}
          textAnchor="middle"
          fill={WHITE}
          fontSize={14}
          fontFamily={MONO}
        >
          {Math.abs(v) === 0 ? "0" : String(Math.abs(v) / 1000).replace(/^0/, "")}
        </text>,
      );
    }
  }
  return (
    <g>
      {out}
      <text x={100} y={74} textAnchor="middle" fill={WHITE} fontSize={9} fontFamily={MONO}>
        UP
      </text>
      <text x={100} y={134} textAnchor="middle" fill={WHITE} fontSize={9} fontFamily={MONO}>
        DOWN
      </text>
      <text x={100} y={148} textAnchor="middle" fill="#aaa" fontSize={6.5} fontFamily={MONO}>
        1000 FT/MIN
      </text>
    </g>
  );
});

// ---------------------------------------------------------------- magnetic compass

export function MagneticCompass({ className }: GaugeProps) {
  const s = useSimSnapshot();
  const hdg = s.indicated.compass;
  const K = 2.1;
  const marks: React.ReactNode[] = [];
  const names: Record<number, string> = { 0: "N", 90: "E", 180: "S", 270: "W" };
  const base = Math.round(hdg / 5) * 5;
  for (let d = base - 50; d <= base + 50; d += 5) {
    const dd = ((d % 360) + 360) % 360;
    // A wet compass card is read from behind: higher headings appear to the LEFT.
    const x = 110 - norm180(dd - hdg) * K;
    const major = dd % 10 === 0;
    marks.push(
      <line
        key={`m${d}`}
        x1={x}
        x2={x}
        y1={64}
        y2={major ? 50 : 56}
        stroke={WHITE}
        strokeWidth={major ? 1.6 : 1}
      />,
    );
    if (dd % 30 === 0) {
      marks.push(
        <text
          key={`t${d}`}
          x={x}
          y={42}
          textAnchor="middle"
          fill={WHITE}
          fontSize={names[dd] ? 17 : 14}
          fontWeight={names[dd] ? 700 : 500}
          fontFamily={MONO}
        >
          {names[dd] ?? dd / 10}
        </text>,
      );
    }
  }
  const tilt = clamp(-s.indicated.bank * 0.25, -8, 8);
  return (
    <figure className={cn("relative flex flex-col items-center", className)}>
      <div className="relative w-full rounded-2xl bg-bezel p-1.5 shadow-[inset_0_1px_0_oklch(1_0_0/0.07),0_6px_18px_oklch(0_0_0/0.5)]">
        <svg
          viewBox="0 0 220 90"
          className="h-auto w-full"
          role="img"
          aria-label={`Magnetic compass ${pad3(hdg)}`}
        >
          <defs>
            <linearGradient id="tx-wet" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0c0d0e" />
              <stop offset="50%" stopColor="#202326" />
              <stop offset="100%" stopColor="#0c0d0e" />
            </linearGradient>
            <clipPath id="tx-wet-clip">
              <rect x={22} y={18} width={176} height={58} rx={22} />
            </clipPath>
          </defs>
          <rect x={6} y={6} width={208} height={80} rx={26} fill="#1a1c1f" stroke="#3a3e44" />
          <rect x={22} y={18} width={176} height={58} rx={22} fill="url(#tx-wet)" />
          <g clipPath="url(#tx-wet-clip)">
            <g transform={`rotate(${tilt} 110 50)`}>{marks}</g>
          </g>
          <line x1={110} x2={110} y1={18} y2={76} stroke="#ff8a1f" strokeWidth={2.5} />
          <rect
            x={22}
            y={18}
            width={176}
            height={58}
            rx={22}
            fill="none"
            stroke="black"
            strokeWidth={2}
          />
          <path
            d="M 30 26 Q 110 14 190 26"
            fill="none"
            stroke="white"
            strokeOpacity={0.08}
            strokeWidth={6}
          />
        </svg>
        {/* explain button */}
        <div className="absolute top-1 right-1">
          <ExplainButton id="compass" label="Magnetic compass" />
        </div>
      </div>
      <figcaption className="mt-1 text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
        Magnetic compass
      </figcaption>
    </figure>
  );
}

// ---------------------------------------------------------------- grid

export interface SixPackProps {
  className?: string | undefined;
  /** Show the magnetic compass above the six-pack (default true). */
  showCompass?: boolean | undefined;
}

/** Standard "basic T" layout: ASI, AI, ALT on top; TC, HI, VSI below. */
export function SixPack({ className, showCompass = true }: SixPackProps) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-white/5 bg-[oklch(0.17_0.008_258)] p-3 shadow-inner",
        className,
      )}
    >
      {showCompass ? (
        <div className="mx-auto mb-3 w-1/3 min-w-[150px]">
          <MagneticCompass />
        </div>
      ) : null}
      <div className="grid grid-cols-3 gap-3">
        <AirspeedIndicator />
        <AttitudeIndicator />
        <Altimeter />
        <TurnCoordinator />
        <HeadingIndicator />
        <VerticalSpeedIndicator />
      </div>
    </div>
  );
}
