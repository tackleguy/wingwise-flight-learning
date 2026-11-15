/**
 * Engine and system gauges: tachometer, fuel quantity, oil temperature / pressure, EGT, ammeter,
 * suction, clock + outside air temperature, and the warning lights (annunciators).
 * Values come from sim.state.ind; electrically driven gauges fall to their rest position when the
 * bus has no power (as the real ones do).
 */
import { useMemo, useRef } from "react";
import { AIRCRAFT } from "@/core/defaults";
import { useFrame } from "./context";
import { FUEL_FULL_GAL, arcPath, interpTable, linearAngle, polar, tachAngle, type Table } from "./geometry";
import { DialNumbers, Dial, Hub, SmallDial, T, box, range, setRot, setText, tickPath, useCell } from "./parts";

// ---------------------------------------------------------------- tachometer

export function Tachometer({ size }: { size: number }) {
  const needle = useRef<SVGGElement>(null);
  const hours = useRef<SVGTextElement>(null);
  const tenths = useRef<SVGTextElement>(null);
  const cNeedle = useCell(NaN);
  const cHours = useCell("");
  const cTenths = useCell("");
  useFrame(({ ind }) => {
    setRot(needle.current, cNeedle, tachAngle(ind.tachRpm));
    const h = Math.max(0, Number.isFinite(ind.hobbs) ? ind.hobbs : 0);
    const t = Math.floor(h * 10 + 1e-6);
    setText(hours.current, cHours, String(Math.floor(t / 10) % 10000).padStart(4, "0"));
    setText(tenths.current, cTenths, String(t % 10));
  });
  const art = useMemo(() => {
    const nums = range(5, 35, 5).map((n) => [tachAngle(n * 100), String(n)] as const);
    return {
      major: tickPath(range(0, 3500, 500).map(tachAngle), 73, 90),
      minor: tickPath(
        range(100, 3400, 100)
          .filter((r) => r % 500 !== 0)
          .map(tachAngle),
        81.5,
        90,
      ),
      nums,
    };
  }, []);
  return (
    <Dial id="tachometer" size={size} label="Tachometer (engine revolutions per minute)">
      {/* green arc: normal operating range; red line: maximum */}
      <path d={arcPath(85.5, tachAngle(2100), tachAngle(AIRCRAFT.maxRpm))} className="arc s-green" strokeWidth="7.5" />
      <path d={art.minor} className="arc s-mk" strokeWidth="1.2" />
      <path d={art.major} className="arc s-mk" strokeWidth="2.6" />
      <path d={tickPath([tachAngle(AIRCRAFT.maxRpm)], 70, 90)} className="arc s-red" strokeWidth="3.4" />
      <DialNumbers items={art.nums} r={58} s={15} />
      <T x={100} y={62} s={9} className="tx-legend">
        RPM
      </T>
      <T x={100} y={72} s={5.8} className="tx-legend">
        HUNDREDS
      </T>
      <T x={98} y={125.5} s={5.4} className="tx-legend">
        HOURS
      </T>
      <rect x="74" y="130" width="38" height="14" rx="1.5" className="tx-window" />
      <rect x="112" y="130" width="11" height="14" rx="1.5" className="tx-window-white" />
      <text ref={hours} x="93.6" y="137.4" fontSize="10" textAnchor="middle" dominantBaseline="central" className="tx-window-text tx-mono" letterSpacing="1.6">
        0000
      </text>
      <text ref={tenths} x="117.5" y="137.4" fontSize="10" textAnchor="middle" dominantBaseline="central" className="tx-window-ink tx-mono">
        0
      </text>
      <g ref={needle}>
        <path d="M100 117 L96.6 104 L98.8 30 L100 22 L101.2 30 L103.4 104 Z" className="tx-needle" />
      </g>
      <Hub />
    </Dial>
  );
}

// ---------------------------------------------------------------- small twin gauges

const HALF_A0 = -28;
const HALF_A1 = 28;
const HALF_R = 38;
const HALF_CY = 77;

function halfArc(px: number, from: number, to: number, r = HALF_R): string {
  return arcPath(r, HALF_A0 + (HALF_A1 - HALF_A0) * from, HALF_A0 + (HALF_A1 - HALF_A0) * to, px, HALF_CY);
}
function halfTicks(px: number, at: readonly number[], r0: number, r1: number): string {
  return tickPath(
    at.map((f) => HALF_A0 + (HALF_A1 - HALF_A0) * f),
    r0,
    r1,
    px,
    HALF_CY,
  );
}

function HalfNeedle({ px, refG }: { px: number; refG: React.RefObject<SVGGElement | null> }) {
  return (
    <>
      <g ref={refG}>
        <path d={`M${px - 1.1} ${HALF_CY} L${px} ${HALF_CY - HALF_R + 1} L${px + 1.1} ${HALF_CY} Z`} className="tx-needle" />
      </g>
      <circle cx={px} cy={HALF_CY} r="3.4" className="tx-hub" />
    </>
  );
}

const LEFT_PX = 30;
const RIGHT_PX = 70;
/** Needle rest position of an unpowered electric gauge (just below the bottom of its scale). */
const REST = HALF_A0 - 6;

/** Left and right fuel quantity in one case, E to F — as in the real aeroplane's twin gauge. */
export function FuelGauge({ size }: { size: number }) {
  const nl = useRef<SVGGElement>(null);
  const nr = useRef<SVGGElement>(null);
  const cl = useCell(NaN);
  const cr = useCell(NaN);
  useFrame(({ ind, powered }) => {
    setRot(nl.current, cl, powered ? linearAngle(ind.fuelLeftGal, 0, FUEL_FULL_GAL, HALF_A0, HALF_A1, 0.08) : REST, LEFT_PX, HALF_CY, 0.1);
    setRot(nr.current, cr, powered ? linearAngle(ind.fuelRightGal, 0, FUEL_FULL_GAL, HALF_A0, HALF_A1, 0.08) : REST, RIGHT_PX, HALF_CY, 0.1);
  });
  const quarters = [0, 0.25, 0.5, 0.75, 1];
  return (
    <SmallDial id="fuel-quantity" size={size} label="Fuel quantity gauges, left and right tank">
      <T x={50} y={19} s={8.2} className="tx-legend">
        FUEL
      </T>
      {[LEFT_PX, RIGHT_PX].map((px) => (
        <g key={px}>
          <path d={halfArc(px, 0, 1)} className="arc s-mk" strokeWidth="1.4" />
          <path d={halfTicks(px, quarters, HALF_R - 5, HALF_R + 0.6)} className="arc s-mk" strokeWidth="1.6" />
          <path d={halfTicks(px, [0], HALF_R - 6.5, HALF_R + 1.5)} className="arc s-red" strokeWidth="2.6" />
          <T x={polar(HALF_R - 12, HALF_A0 + 5, px, HALF_CY)[0]} y={polar(HALF_R - 12, HALF_A0 + 5, px, HALF_CY)[1]} s={8}>
            E
          </T>
          <T x={polar(HALF_R - 12, HALF_A1 - 5, px, HALF_CY)[0]} y={polar(HALF_R - 12, HALF_A1 - 5, px, HALF_CY)[1]} s={8}>
            F
          </T>
        </g>
      ))}
      <HalfNeedle px={LEFT_PX} refG={nl} />
      <HalfNeedle px={RIGHT_PX} refG={nr} />
      <T x={LEFT_PX} y={87} s={7.4} className="tx-legend">
        L
      </T>
      <T x={RIGHT_PX} y={87} s={7.4} className="tx-legend">
        R
      </T>
    </SmallDial>
  );
}

const OIL_T_MIN = 75;
const OIL_T_MAX = 250;
const OIL_P_MAX = 115;
const oilT = (f: number) => (f - OIL_T_MIN) / (OIL_T_MAX - OIL_T_MIN);
const oilP = (psi: number) => psi / OIL_P_MAX;

/** Oil temperature (left) and oil pressure (right). Each half can be explained separately. */
export function OilGauge({ size }: { size: number }) {
  const nt = useRef<SVGGElement>(null);
  const np = useRef<SVGGElement>(null);
  const ct = useCell(NaN);
  const cp = useCell(NaN);
  useFrame(({ ind, powered }) => {
    // The temperature gauge is electric; the pressure gauge is fed by a direct oil line and needs no electricity.
    setRot(nt.current, ct, powered ? linearAngle(ind.oilTempF, OIL_T_MIN, OIL_T_MAX, HALF_A0, HALF_A1, 0.08) : REST, LEFT_PX, HALF_CY, 0.1);
    setRot(np.current, cp, linearAngle(ind.oilPressPsi, 0, OIL_P_MAX, HALF_A0, HALF_A1, 0.08), RIGHT_PX, HALF_CY, 0.1);
  });
  return (
    <SmallDial size={size} label="Oil temperature and oil pressure gauges">
      <T x={50} y={19} s={8.2} className="tx-legend">
        OIL
      </T>
      <g data-instrument="oil-temp">
        <path d="M6 50A44 44 0 0 1 50 6V94A44 44 0 0 1 6 50Z" className="tx-xhit" />
        <path d={halfArc(LEFT_PX, 0, 1)} className="arc s-mk" strokeWidth="1.2" />
        <path d={halfArc(LEFT_PX, oilT(100), oilT(245), HALF_R - 2)} className="arc s-green" strokeWidth="4.4" />
        <path d={halfTicks(LEFT_PX, [oilT(245)], HALF_R - 7, HALF_R + 1.5)} className="arc s-red" strokeWidth="2.4" />
        <HalfNeedle px={LEFT_PX} refG={nt} />
        <T x={LEFT_PX + 1} y={87} s={6.6} className="tx-legend">
          °F
        </T>
      </g>
      <g data-instrument="oil-pressure">
        <path d="M94 50A44 44 0 0 0 50 6V94A44 44 0 0 0 94 50Z" className="tx-xhit" />
        <path d={halfArc(RIGHT_PX, 0, 1)} className="arc s-mk" strokeWidth="1.2" />
        <path d={halfArc(RIGHT_PX, oilP(60), oilP(90), HALF_R - 2)} className="arc s-green" strokeWidth="4.4" />
        <path d={halfTicks(RIGHT_PX, [oilP(25), oilP(115)], HALF_R - 7, HALF_R + 1.5)} className="arc s-red" strokeWidth="2.4" />
        <HalfNeedle px={RIGHT_PX} refG={np} />
        <T x={RIGHT_PX - 1} y={87} s={6.6} className="tx-legend">
          PSI
        </T>
      </g>
    </SmallDial>
  );
}

// ---------------------------------------------------------------- single small gauges

const SG_CX = 50;
const SG_CY = 60;
const SG_R = 36;

function SmallNeedle({ refG }: { refG: React.RefObject<SVGGElement | null> }) {
  return (
    <>
      <g ref={refG}>
        <path d={`M${SG_CX - 1.3} ${SG_CY + 5} L${SG_CX} ${SG_CY - SG_R + 1.5} L${SG_CX + 1.3} ${SG_CY + 5} Z`} className="tx-needle" />
      </g>
      <circle cx={SG_CX} cy={SG_CY} r="4" className="tx-hub" />
    </>
  );
}

export const EGT_MIN_F = 900;
export const EGT_MAX_F = 1700;
const EGT_SWEEP = 56;

/** Exhaust gas temperature: a relative gauge (no numbers), used for leaning the mixture. */
export function EgtGauge({ size }: { size: number }) {
  const needle = useRef<SVGGElement>(null);
  const cell = useCell(NaN);
  useFrame(({ ind }) => setRot(needle.current, cell, linearAngle(ind.egtF, EGT_MIN_F, EGT_MAX_F, -EGT_SWEEP, EGT_SWEEP), SG_CX, SG_CY, 0.1));
  const ticks = useMemo(() => {
    const all = range(0, 16, 1).map((i) => -EGT_SWEEP + (i * 2 * EGT_SWEEP) / 16);
    return { minor: tickPath(all, SG_R - 4, SG_R + 1, SG_CX, SG_CY), major: tickPath(all.filter((_, i) => i % 4 === 0), SG_R - 7, SG_R + 1, SG_CX, SG_CY) };
  }, []);
  return (
    <SmallDial id="egt" size={size} label="Exhaust gas temperature gauge">
      <path d={ticks.minor} className="arc s-mk" strokeWidth="1" />
      <path d={ticks.major} className="arc s-mk" strokeWidth="1.8" />
      <T x={50} y={76} s={8.4} className="tx-legend">
        EGT
      </T>
      <T x={50} y={85} s={5.2} className="tx-legend">
        50°F / DIV
      </T>
      <SmallNeedle refG={needle} />
    </SmallDial>
  );
}

const AMP_SWEEP = 52;

/** Ammeter: battery charge (+, right) or discharge (−, left), amperes. */
export function Ammeter({ size }: { size: number }) {
  const needle = useRef<SVGGElement>(null);
  const cell = useCell(NaN);
  useFrame(({ ind, powered }) => setRot(needle.current, cell, powered ? linearAngle(ind.ammeterA, -60, 60, -AMP_SWEEP, AMP_SWEEP) : 0, SG_CX, SG_CY, 0.1));
  const ticks = useMemo(() => {
    const a = (amps: number) => (amps / 60) * AMP_SWEEP;
    return { minor: tickPath([-45, -15, 15, 45].map(a), SG_R - 4, SG_R + 1, SG_CX, SG_CY), major: tickPath([-60, -30, 0, 30, 60].map(a), SG_R - 7, SG_R + 1, SG_CX, SG_CY) };
  }, []);
  return (
    <SmallDial id="ammeter" size={size} label="Ammeter">
      <path d={arcPath(SG_R + 1, -AMP_SWEEP, AMP_SWEEP, SG_CX, SG_CY)} className="arc s-mk" strokeWidth="1" />
      <path d={ticks.minor} className="arc s-mk" strokeWidth="1" />
      <path d={ticks.major} className="arc s-mk" strokeWidth="1.8" />
      <DialNumbers
        items={[
          [-AMP_SWEEP + 6, "−"],
          [0, "0"],
          [AMP_SWEEP - 6, "+"],
        ]}
        r={SG_R - 14}
        s={9}
        cx={SG_CX}
        cy={SG_CY}
      />
      <T x={50} y={78} s={8.4} className="tx-legend">
        AMP
      </T>
      <T x={50} y={86.5} s={5} className="tx-legend">
        60 – 0 – 60
      </T>
      <SmallNeedle refG={needle} />
    </SmallDial>
  );
}

const SUC_SWEEP = 52;
const SUCTION_TABLE: Table = [
  [0, -SUC_SWEEP - 14],
  [3, -SUC_SWEEP],
  [7, SUC_SWEEP],
  [8, SUC_SWEEP + 8],
];
export const suctionAngle = (inHg: number) => interpTable(SUCTION_TABLE, Number.isFinite(inHg) ? inHg : 0);

/** Suction (vacuum) gauge, inches of mercury: the air pump that spins the attitude and heading gyros. */
export function SuctionGauge({ size }: { size: number }) {
  const needle = useRef<SVGGElement>(null);
  const cell = useCell(NaN);
  useFrame(({ ind }) => setRot(needle.current, cell, suctionAngle(ind.suctionInHg), SG_CX, SG_CY, 0.1));
  const art = useMemo(
    () => ({
      major: tickPath([3, 4, 5, 6, 7].map(suctionAngle), SG_R - 7, SG_R + 1, SG_CX, SG_CY),
      minor: tickPath([3.5, 4.5, 5.5, 6.5].map(suctionAngle), SG_R - 4, SG_R + 1, SG_CX, SG_CY),
      nums: [3, 4, 5, 6, 7].map((n) => [suctionAngle(n), String(n)] as const),
    }),
    [],
  );
  return (
    <SmallDial id="suction" size={size} label="Suction (vacuum) gauge">
      <path d={arcPath(SG_R - 1.2, suctionAngle(4.5), suctionAngle(5.4), SG_CX, SG_CY)} className="arc s-green" strokeWidth="4.6" />
      <path d={art.minor} className="arc s-mk" strokeWidth="1" />
      <path d={art.major} className="arc s-mk" strokeWidth="1.8" />
      <DialNumbers items={art.nums} r={SG_R - 13.5} s={7.6} cx={SG_CX} cy={SG_CY} />
      <T x={50} y={78} s={6.6} className="tx-legend">
        SUCTION
      </T>
      <T x={50} y={86} s={5} className="tx-legend">
        IN HG
      </T>
      <SmallNeedle refG={needle} />
    </SmallDial>
  );
}

// ---------------------------------------------------------------- clock and outside air temperature

function hhmmss(sec: number): string {
  const s = Math.floor((((Number.isFinite(sec) ? sec : 0) % 86400) + 86400) % 86400);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(Math.floor(s / 3600))}:${p(Math.floor(s / 60) % 60)}:${p(s % 60)}`;
}

/** Digital clock (UTC, "Zulu" time) with the outside air temperature. */
export function ClockOat({ size }: { size: number }) {
  const time = useRef<SVGTextElement>(null);
  const tc = useRef<SVGTextElement>(null);
  const tf = useRef<SVGTextElement>(null);
  const cTime = useCell("");
  const cC = useCell("");
  const cF = useCell("");
  useFrame(({ ind }) => {
    setText(time.current, cTime, hhmmss(ind.clockUtcSec));
    const c = Number.isFinite(ind.oatC) ? ind.oatC : 0;
    setText(tc.current, cC, `${Math.round(c)}°C`);
    setText(tf.current, cF, `${Math.round(c * 1.8 + 32)}°F`);
  });
  return (
    <svg className="txp-inst" data-instrument="clock" viewBox="0 0 100 100" style={box(size, size)} role="img" aria-label="Clock (UTC) and outside air temperature">
      <rect x="3" y="14" width="94" height="72" rx="5" className="tx-bezel" />
      <rect x="3.6" y="14.6" width="92.8" height="70.8" rx="4.6" className="tx-bezel-ring" />
      <rect x="8" y="19" width="84" height="62" rx="2.5" className="tx-lcd" />
      <T x={12} y={27} s={6.4} anchor="start" className="tx-lcd-ink">
        UTC
      </T>
      <text ref={time} x="50" y="41.5" fontSize="15.5" textAnchor="middle" dominantBaseline="central" className="tx-lcd-ink tx-mono">
        00:00:00
      </text>
      <path d="M11 53H89" className="tx-lcd-rule" />
      <T x={12} y={60.5} s={6.4} anchor="start" className="tx-lcd-ink">
        OAT
      </T>
      <text ref={tc} x="60" y="70" fontSize="13" textAnchor="end" dominantBaseline="central" className="tx-lcd-ink tx-mono">
        15°C
      </text>
      <text ref={tf} x="89" y="70.6" fontSize="9" textAnchor="end" dominantBaseline="central" className="tx-lcd-ink tx-mono">
        59°F
      </text>
    </svg>
  );
}

// ---------------------------------------------------------------- annunciators

export const LOW_VOLTS = 24.5;
export const LOW_VACUUM_INHG = 3.5;
export const LOW_FUEL_GAL = 5;

const LAMPS: readonly { key: string; l1: string; l2: string; amber?: boolean }[] = [
  { key: "volts", l1: "LOW", l2: "VOLTS" },
  { key: "vac", l1: "LOW", l2: "VACUUM", amber: true },
  { key: "lfuel", l1: "L FUEL", l2: "LOW", amber: true },
  { key: "rfuel", l1: "R FUEL", l2: "LOW", amber: true },
  { key: "stall", l1: "STALL", l2: "SIM AID" },
];

/** Which warning lights are lit (pure, unit-tested). The stall light is a simulator aid: real C172s only have a horn. */
export function annunciatorStates(ind: { suctionInHg: number; fuelLeftGal: number; fuelRightGal: number }, sys: { busVolts: number; stallHorn: boolean }, powered: boolean): boolean[] {
  return [powered && sys.busVolts < LOW_VOLTS, powered && ind.suctionInHg < LOW_VACUUM_INHG, powered && ind.fuelLeftGal < LOW_FUEL_GAL, powered && ind.fuelRightGal < LOW_FUEL_GAL, sys.stallHorn];
}

export const ANNUNCIATOR_W = 244;
export const ANNUNCIATOR_H = 26;

export function Annunciators({ scale = 1 }: { scale?: number }) {
  const lamps = useRef<(SVGGElement | null)[]>([]);
  const cell = useCell("");
  useFrame(({ ind, sys, powered }) => {
    const on = annunciatorStates(ind, sys, powered);
    const key = on.map((b) => (b ? "1" : "0")).join("");
    if (key === cell.v) return;
    cell.v = key;
    on.forEach((b, i) => lamps.current[i]?.setAttribute("class", `tx-ann${LAMPS[i]!.amber ? " amber" : ""}${b ? " on" : ""}`));
  });
  const w = 46.4;
  return (
    <svg className="txp-inst" data-instrument="annunciators" viewBox={`0 0 ${ANNUNCIATOR_W} ${ANNUNCIATOR_H}`} style={box(ANNUNCIATOR_W * scale, ANNUNCIATOR_H * scale)} role="img" aria-label="Warning lights (annunciators)">
      <rect x="0.5" y="0.5" width={ANNUNCIATOR_W - 1} height={ANNUNCIATOR_H - 1} rx="3" className="tx-radio" />
      {LAMPS.map((l, i) => {
        const x = 3 + i * (w + 1.5);
        return (
          <g
            key={l.key}
            className={`tx-ann${l.amber ? " amber" : ""}`}
            ref={(el) => {
              lamps.current[i] = el;
            }}
          >
            <rect x={x} y="3" width={w} height="20" rx="2" />
            <T x={x + w / 2} y={9.6} s={6.6}>
              {l.l1}
            </T>
            <T x={x + w / 2} y={17.6} s={l.key === "stall" ? 5 : 6.6}>
              {l.l2}
            </T>
          </g>
        );
      })}
    </svg>
  );
}
