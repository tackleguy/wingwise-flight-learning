/**
 * The six flight instruments ("six-pack") of a Cessna 172-class trainer, drawn as original SVG.
 * Every needle is driven by sim.state.ind (INDICATED values) — never by the true flight state.
 * Dial coordinates: 200 × 200 units, centre (100, 100), angles clockwise from 12 o'clock.
 */
import { useId, useMemo, useRef } from "react";
import { AIRCRAFT } from "@/core/defaults";
import { clamp, norm360 } from "@/core/math";
import { useFrame, usePanel } from "./context";
import { ATT_UNITS_PER_DEG, altimeterAngles, arcPath, asiAngle, attitudeTransform, ballAngle, cardRotation, polar, turnCoordinatorAngle, vsiAngle } from "./geometry";
import { usePress } from "./interact";
import { Dial, DialNumbers, Hub, Knob, T, range, setOpacity, setRot, setShown, setText, tickPath, useCell } from "./parts";

const COMPASS_LABELS: readonly (readonly [number, string])[] = [
  [0, "N"],
  [30, "3"],
  [60, "6"],
  [90, "E"],
  [120, "12"],
  [150, "15"],
  [180, "S"],
  [210, "21"],
  [240, "24"],
  [270, "W"],
  [300, "30"],
  [330, "33"],
];

/** Labels of a rotating compass card: each one is turned so it reads upright when it is at the top. */
export function CardLabels({ r, s, sLetter }: { r: number; s: number; sLetter?: number }) {
  return (
    <>
      {COMPASS_LABELS.map(([a, label]) => {
        const [x, y] = polar(r, a);
        const letter = a % 90 === 0;
        return (
          <T key={a} x={x} y={y} s={letter ? (sLetter ?? s) : s} rot={a}>
            {label}
          </T>
        );
      })}
    </>
  );
}

/** A red "OFF" warning flag that drops into view. */
function OffFlag({ x, y, refG, text = "OFF" }: { x: number; y: number; refG: React.RefObject<SVGGElement | null>; text?: string }) {
  return (
    <g ref={refG} style={{ display: "none" }}>
      <rect x={x} y={y} width="40" height="17" rx="2" className="tx-flag" />
      <T x={x + 20} y={y + 9} s={11} className="tx-flag-text">
        {text}
      </T>
    </g>
  );
}

// ---------------------------------------------------------------- airspeed indicator

export function Airspeed({ size }: { size: number }) {
  const needle = useRef<SVGGElement>(null);
  const cell = useCell(NaN);
  useFrame(({ ind }) => setRot(needle.current, cell, asiAngle(ind.ias)));
  const v = AIRCRAFT.v;
  const art = useMemo(() => {
    const majors = range(40, 200, 10).map(asiAngle);
    const minors = range(45, 195, 10).map(asiAngle);
    const nums = [40, 60, 80, 100, 120, 140, 160, 180, 200].map((k) => [asiAngle(k), String(k)] as const);
    return { majors: tickPath(majors, 61, 73.5), minors: tickPath(minors, 67, 73.5), nums };
  }, []);
  return (
    <Dial id="airspeed" size={size} label="Airspeed indicator">
      {/* green: normal operating range (Vs1 to Vno); yellow: caution range (smooth air only); red line: never exceed */}
      <path d={arcPath(85.5, asiAngle(v.s1), asiAngle(v.no))} className="arc s-green" strokeWidth="7.5" />
      <path d={arcPath(85.5, asiAngle(v.no), asiAngle(v.ne))} className="arc s-yellow" strokeWidth="7.5" />
      {/* white: flap operating range (Vs0 to Vfe) */}
      <path d={arcPath(77.6, asiAngle(v.s0), asiAngle(v.fe))} className="arc s-mk" strokeWidth="5.6" />
      <path d={tickPath([asiAngle(v.ne)], 70, 90)} className="arc s-red" strokeWidth="3.4" />
      <path d={art.majors} className="arc s-mk" strokeWidth="2.2" />
      <path d={art.minors} className="arc s-mk" strokeWidth="1.2" />
      <DialNumbers items={art.nums} r={50} s={12.8} />
      <T x={100} y={77} s={8.2} className="tx-legend">
        AIRSPEED
      </T>
      <T x={100} y={126} s={8.2} className="tx-legend">
        KNOTS
      </T>
      <g ref={needle}>
        <path d="M100 118 L96.6 104 L98.8 30 L100 22 L101.2 30 L103.4 104 Z" className="tx-needle" />
      </g>
      <Hub />
    </Dial>
  );
}

// ---------------------------------------------------------------- attitude indicator

const PITCH_MARKS: readonly (readonly [number, number, boolean])[] = [
  [5, 7, false],
  [10, 17, true],
  [15, 7, false],
  [20, 24, true],
  [25, 7, false],
  [30, 17, true],
  [40, 12, true],
  [50, 12, true],
  [60, 12, true],
];

export function Attitude({ size }: { size: number }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const card = useRef<SVGGElement>(null);
  const ring = useRef<SVGGElement>(null);
  const flag = useRef<SVGGElement>(null);
  const last = useCell({ rot: NaN, shift: NaN });
  const flagCell = useCell(-1);
  useFrame(({ ind }) => {
    const t = attitudeTransform(ind.attPitch, ind.attRoll);
    if (!(Math.abs(t.rotate - last.v.rot) < 0.03 && Math.abs(t.shift - last.v.shift) < 0.03)) {
      last.v.rot = t.rotate;
      last.v.shift = t.shift;
      const r = t.rotate.toFixed(2);
      card.current?.setAttribute("transform", `rotate(${r} 100 100) translate(0 ${t.shift.toFixed(2)})`);
      ring.current?.setAttribute("transform", `rotate(${r} 100 100)`);
    }
    setShown(flag.current, flagCell, ind.attFlag);
  });
  const k = ATT_UNITS_PER_DEG;
  const pitch = useMemo(() => {
    let d = "";
    const labels: { y: number; x: number; t: string }[] = [];
    for (const [deg, half, label] of PITCH_MARKS) {
      for (const sgn of [1, -1]) {
        const y = 100 - sgn * deg * k;
        d += `M${100 - half} ${y}H${100 + half}`;
        if (label) {
          labels.push({ y, x: 100 - half - 9, t: String(deg) });
          labels.push({ y, x: 100 + half + 9, t: String(deg) });
        }
      }
    }
    return { d, labels };
  }, [k]);
  return (
    <Dial id="attitude" size={size} label="Attitude indicator (artificial horizon)">
      <defs>
        <clipPath id={`${uid}w`}>
          <circle cx="100" cy="100" r="72" />
        </clipPath>
      </defs>
      {/* the horizon card: rotates with bank and slides with pitch */}
      <g clipPath={`url(#${uid}w)`}>
        <g ref={card}>
          <rect x="-200" y="-500" width="600" height="600" className="f-sky" />
          <rect x="-200" y="100" width="600" height="600" className="f-ground" />
          <path d="M-200 100H400" className="arc s-mk" strokeWidth="1.8" />
          <path d={pitch.d} className="arc s-mk" strokeWidth="1.5" />
          {pitch.labels.map((l, i) => (
            <T key={i} x={l.x} y={l.y} s={8.5}>
              {l.t}
            </T>
          ))}
        </g>
      </g>
      {/* the bank ring: turns with the horizon; its white triangle always points at the sky */}
      <g ref={ring}>
        <path d="M10 100A90 90 0 0 1 190 100H172A72 72 0 0 0 28 100Z" className="f-sky" />
        <path d="M10 100A90 90 0 0 0 190 100H172A72 72 0 0 1 28 100Z" className="f-ground" />
        <path d="M10 100A90 90 0 0 1 190 100A90 90 0 0 1 10 100ZM28 100A72 72 0 0 0 172 100A72 72 0 0 0 28 100Z" fillRule="evenodd" className="tx-ring-dim" />
        <path d={tickPath([-20, -10, 10, 20], 82, 90)} className="arc s-mk" strokeWidth="1.6" />
        <path d={tickPath([-90, -60, -30, 30, 60, 90], 75, 90)} className="arc s-mk" strokeWidth="2.6" />
        <path d="M100 21.5 L94.2 10.5 H105.8 Z" className="mk" />
        <path d="M10 100H28M172 100H190" className="arc s-mk" strokeWidth="1.8" />
      </g>
      <circle cx="100" cy="100" r="72" className="tx-inner-edge" />
      {/* fixed parts: bank index and the miniature aeroplane */}
      <path d="M100 23.5 L94 34.5 H106 Z" className="f-orange tx-outline" />
      <path d="M42 100H80V107M158 100H120V107" className="tx-mini-shadow" />
      <path d="M42 100H80V107M158 100H120V107" className="tx-mini" />
      <circle cx="100" cy="100" r="3.4" className="f-orange tx-outline" />
      <OffFlag x={112} y={48} refG={flag} text="GYRO" />
    </Dial>
  );
}

// ---------------------------------------------------------------- altimeter

export function Altimeter({ size }: { size: number }) {
  const { sim } = usePanel();
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const p100 = useRef<SVGGElement>(null);
  const p1000 = useRef<SVGGElement>(null);
  const p10000 = useRef<SVGGElement>(null);
  const baro = useRef<SVGTextElement>(null);
  const hatch = useRef<SVGGElement>(null);
  const c100 = useCell(NaN);
  const c1000 = useCell(NaN);
  const c10000 = useCell(NaN);
  const cBaro = useCell("");
  const cHatch = useCell(NaN);
  useFrame(({ ind, c }) => {
    const a = altimeterAngles(ind.alt);
    setRot(p100.current, c100, a.hundreds);
    setRot(p1000.current, c1000, a.thousands);
    setRot(p10000.current, c10000, a.tenThousands);
    setText(baro.current, cBaro, c.altimeterInHg.toFixed(2));
    // The striped flag is in view below 10,000 ft and slides away above it.
    setOpacity(hatch.current, cHatch, clamp((10600 - ind.alt) / 600, 0, 1));
  });
  const art = useMemo(() => {
    const nums = range(0, 9, 1).map((n) => [n * 36, String(n)] as const);
    return { majors: tickPath(range(0, 324, 36), 75, 90), minors: tickPath(range(0, 352.8, 7.2), 82.5, 90), nums };
  }, []);
  const setBaro = (steps: number) => {
    const c = sim.controls;
    c.altimeterInHg = clamp(Math.round((c.altimeterInHg + steps * 0.01) * 100) / 100, 27.5, 31.5);
  };
  return (
    <Dial id="altimeter" size={size} label="Altimeter" screws={[0, 1, 3]}>
      <defs>
        <pattern id={`${uid}h`} width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="5" height="5" className="tx-face" />
          <rect width="2.4" height="5" className="mk" />
        </pattern>
      </defs>
      <path d={art.minors} className="arc s-mk" strokeWidth="1.1" />
      <path d={art.majors} className="arc s-mk" strokeWidth="2.6" />
      <DialNumbers items={art.nums} r={62.5} s={19} />
      <T x={100} y={56} s={8} className="tx-legend">
        ALT
      </T>
      <T x={62} y={86} s={5.6} className="tx-legend">
        100 FT
      </T>
      {/* low-altitude warning flag (striped): visible below 10,000 ft */}
      <g ref={hatch}>
        <path d={`${arcPath(40, 152, 208)}L${polar(26, 208).join(" ")}A26 26 0 0 0 ${polar(26, 152).join(" ")}Z`} fill={`url(#${uid}h)`} />
      </g>
      {/* Kollsman window: the pressure the altimeter is set to */}
      <rect x="122" y="90" width="40" height="20" rx="2" className="tx-window" />
      <text ref={baro} x="142" y="100.6" fontSize="12.5" textAnchor="middle" dominantBaseline="central" className="tx-window-text">
        29.92
      </text>
      <T x={142} y={115.5} s={5.2} className="tx-legend">
        IN HG
      </T>
      <g ref={p10000}>
        <path d="M100 100V16" className="arc s-mk" strokeWidth="1.6" />
        <path d="M100 22 L94.5 11.5 H105.5 Z" className="mk" />
      </g>
      <g ref={p1000}>
        <path d="M100 108 L95 100 L92.5 66 L100 46 L107.5 66 L105 100 Z" className="tx-needle" />
      </g>
      <g ref={p100}>
        <path d="M100 118 L97 104 L98.6 34 L100 20 L101.4 34 L103 104 Z" className="tx-needle" />
      </g>
      <Hub />
      <Knob cx={22} cy={178} r={13} hitR={22} ctl="baro-knob" label="Altimeter setting knob (Kollsman). Enter raises the setting, Shift+Enter lowers it." onStep={setBaro} pxPerStep={5} />
    </Dial>
  );
}

// ---------------------------------------------------------------- turn coordinator

const TUBE_CX = 100;
const TUBE_CY = -70;
const TUBE_R = 216;
const TUBE_HALF_DEG = 13;

export function TurnCoordinator({ size }: { size: number }) {
  const plane = useRef<SVGGElement>(null);
  const ball = useRef<SVGCircleElement>(null);
  const flag = useRef<SVGGElement>(null);
  const cPlane = useCell(NaN);
  const cBall = useCell(NaN);
  const cFlag = useCell(-1);
  useFrame(({ ind, powered }) => {
    const dead = ind.turnFlag || !powered;
    // Without electricity the gyro runs down: the little aeroplane sits level and the red flag shows.
    setRot(plane.current, cPlane, dead && !powered ? 0 : turnCoordinatorAngle(ind.turnRate));
    const a = ballAngle(ind.ball);
    if (!(Math.abs(a - cBall.v) < 0.02) && ball.current) {
      cBall.v = a;
      const [x, y] = polar(TUBE_R, 180 - a, TUBE_CX, TUBE_CY);
      ball.current.setAttribute("cx", x.toFixed(2));
      ball.current.setAttribute("cy", y.toFixed(2));
    }
    setShown(flag.current, cFlag, dead);
  });
  const tube = useMemo(() => arcPath(TUBE_R, 180 - TUBE_HALF_DEG, 180 + TUBE_HALF_DEG, TUBE_CX, TUBE_CY), []);
  const cage = useMemo(() => tickPath([180 - 2.5, 180 + 2.5], TUBE_R - 7.5, TUBE_R + 7.5, TUBE_CX, TUBE_CY), []);
  return (
    <Dial id="turn-coordinator" size={size} label="Turn coordinator and slip-skid ball">
      {/* wings-level marks and the standard-rate (2 minute) turn marks */}
      <path d={tickPath([90, 270], 71, 89)} className="arc s-mk" strokeWidth="5" />
      <path d={tickPath([110, 250], 71, 89)} className="arc s-mk" strokeWidth="5" />
      <T x={polar(80, 125)[0]} y={polar(80, 125)[1]} s={12}>
        R
      </T>
      <T x={polar(80, 235)[0]} y={polar(80, 235)[1]} s={12}>
        L
      </T>
      <T x={100} y={40} s={7.6} className="tx-legend">
        TURN COORDINATOR
      </T>
      <T x={100} y={51} s={6} className="tx-legend">
        D.C. ELEC.
      </T>
      <T x={100} y={165} s={9.5} className="tx-legend">
        2 MIN
      </T>
      <T x={100} y={175.5} s={5.4} className="tx-legend">
        NO PITCH INFORMATION
      </T>
      {/* inclinometer: a ball in a curved glass tube */}
      <path d={tube} className="tx-tube" strokeWidth="15" />
      <circle ref={ball} cx="100" cy="146" r="6.6" className="tx-ball" />
      <path d={cage} className="tx-tube-cage" strokeWidth="1.5" />
      {/* miniature aeroplane seen from behind */}
      <g ref={plane}>
        <path d="M100 96.6 L32 98.6 V101.6 L100 104.2 L168 101.6 V98.6 Z" className="tx-needle" />
        <path d="M100 91 V79 M89 90.5 H111" className="arc s-mk" strokeWidth="2.6" strokeLinecap="round" />
        <circle cx="100" cy="100" r="8.6" className="tx-needle" />
      </g>
      <OffFlag x={121} y={60} refG={flag} />
    </Dial>
  );
}

// ---------------------------------------------------------------- heading indicator (directional gyro)

export function HeadingIndicator({ size }: { size: number }) {
  const api = usePanel();
  const { sim } = api;
  const card = useRef<SVGGElement>(null);
  const bug = useRef<SVGGElement>(null);
  const flag = useRef<SVGGElement>(null);
  const cCard = useCell(NaN);
  const cBug = useCell(NaN);
  const cFlag = useCell(-1);
  useFrame(({ ind, c }) => {
    setRot(card.current, cCard, cardRotation(ind.dgMag));
    setRot(bug.current, cBug, norm360(c.headingBugMag));
    setShown(flag.current, cFlag, ind.dgFlag);
  });
  const art = useMemo(() => ({ tens: tickPath(range(0, 350, 10), 77, 89), fives: tickPath(range(5, 355, 10), 82, 89) }), []);
  const align = usePress(() => sim.events.emit("command", { id: "dg-align" }));
  const setBug = (n: number) => {
    sim.controls.headingBugMag = norm360(Math.round(sim.controls.headingBugMag + n));
  };
  const setCard = (n: number) => {
    sim.controls.dgAdjustDeg += n;
  };
  return (
    <Dial id="heading" size={size} label="Heading indicator (directional gyro)" screws={[1]}>
      <g ref={card}>
        <path d={art.fives} className="arc s-mk" strokeWidth="1.1" />
        <path d={art.tens} className="arc s-mk" strokeWidth="2" />
        <CardLabels r={64} s={15} sLetter={17} />
        {/* heading bug: rides on the card at the selected heading */}
        <g ref={bug}>
          <path d="M91.5 9.6 V17.6 H96.6 L100 12.6 L103.4 17.6 H108.5 V9.6 Z" className="f-orange tx-outline" />
        </g>
      </g>
      {/* fixed parts: lubber line, 45° marks and the little aeroplane */}
      <path d={tickPath([45, 90, 135, 180, 225, 270, 315], 90.5, 95.5)} className="arc s-mk" strokeWidth="2.4" />
      <path d="M100 14.5 L95.6 4.5 H104.4 Z" className="mk tx-outline" />
      <path d="M100 14V25" className="arc s-mk" strokeWidth="1.4" />
      <path d="M100 66 L103.4 78 V92 L128 108 V114 L103.4 106 V126 L112 133 V137 L100 133.5 L88 137 V133 L96.6 126 V106 L72 114 V108 L96.6 92 V78 Z" className="tx-hi-plane" />
      <OffFlag x={111} y={47} refG={flag} />
      <Knob cx={22} cy={178} r={13} hitR={22} ctl="dg-knob" label="Heading indicator adjustment knob: turns the compass card. Enter increases the heading shown, Shift+Enter decreases it." onStep={setCard} pxPerStep={4} text="PUSH" />
      <Knob cx={178} cy={178} r={13} hitR={22} ctl="hdg-bug-knob" label="Heading bug knob. Enter moves the bug clockwise, Shift+Enter anticlockwise." onStep={setBug} pxPerStep={4} text="HDG" />
      <g {...align} data-ctl="dg-align" role="button" aria-label="Simulator shortcut: set the heading indicator to match the magnetic compass" className="tx-ctl tx-btn">
        <rect x="1" y="2" width="45" height="16" rx="5" className="tx-btn-body" />
        <T x={23.5} y={10.4} s={7.6} className="tx-btn-text">
          ALIGN
        </T>
      </g>
    </Dial>
  );
}

// ---------------------------------------------------------------- vertical speed indicator

export function VerticalSpeed({ size }: { size: number }) {
  const needle = useRef<SVGGElement>(null);
  const cell = useCell(NaN);
  useFrame(({ ind }) => setRot(needle.current, cell, vsiAngle(ind.vs)));
  const art = useMemo(() => {
    const major: number[] = [vsiAngle(0)];
    const minor: number[] = [];
    for (const sgn of [1, -1]) {
      for (const v of [500, 1000, 1500, 2000]) major.push(vsiAngle(sgn * v));
      for (const v of [100, 200, 300, 400, 600, 700, 800, 900, 1250, 1750]) minor.push(vsiAngle(sgn * v));
    }
    const nums: (readonly [number, string])[] = [[vsiAngle(0), "0"]];
    for (const sgn of [1, -1]) for (const v of [500, 1000, 1500, 2000]) nums.push([vsiAngle(sgn * v), String(v / 100)]);
    return { major: tickPath(major, 75, 90), minor: tickPath(minor, 82, 90), nums };
  }, []);
  return (
    <Dial id="vsi" size={size} label="Vertical speed indicator">
      <path d={art.minor} className="arc s-mk" strokeWidth="1.2" />
      <path d={art.major} className="arc s-mk" strokeWidth="2.6" />
      <DialNumbers items={art.nums} r={61} s={16} />
      <T x={122} y={77.5} s={7} className="tx-legend">
        VERTICAL
      </T>
      <T x={122} y={85.5} s={7} className="tx-legend">
        SPEED
      </T>
      <T x={122} y={114.5} s={6} className="tx-legend">
        100 FEET
      </T>
      <T x={122} y={121.5} s={6} className="tx-legend">
        PER MINUTE
      </T>
      <T x={66} y={80} s={8} className="tx-legend">
        UP
      </T>
      <T x={66} y={121} s={8} className="tx-legend">
        DN
      </T>
      <g ref={needle}>
        <path d="M100 116 L96.8 104 L98.8 30 L100 21 L101.2 30 L103.2 104 Z" className="tx-needle" />
      </g>
      <Hub />
    </Dial>
  );
}
