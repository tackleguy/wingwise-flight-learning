/**
 * TeachX Flight Display — PFD.
 *
 * Every value is bound to the SimEngine snapshot: `indicated.*` for air data, attitude and heading
 * (so failures show the way a real display would), `nav.*` for the HSI and `ap` for the flight
 * director and mode annunciations.
 */
import { memo, useEffect, useRef, useState } from "react";
import type { AircraftPerf } from "@/lib/data/types";
import { clamp, norm180, norm360 } from "@/lib/geo";
import { computedWind, fmtCom, fmtNav, makeRateTracker, pad3 } from "@/sim/avionics-helpers";
import { useSimEngine, useSimSnapshot } from "@/sim/react";
import type { AutopilotState, NavOutputs, SimSnapshot } from "@/sim/types";
import { arcPath, DisplayBezel, MONO, polar, RedX, SoftKey } from "./common";
import { cycleCdi, stepBaro, syncHeadingBug } from "./controls";

const W = 1000;
const H = 750;
const CX = 500;
const CY = 265;
const PPD = 9; // px per degree of pitch
const WHITE = "#f4f6f8";

export interface PfdProps {
  className?: string | undefined;
  /** Hide the soft-key row under the display. */
  hideSoftKeys?: boolean | undefined;
}

export function Pfd({ className, hideSoftKeys }: PfdProps) {
  const s = useSimSnapshot();
  const engine = useSimEngine();
  const ind = s.indicated;
  const powered = ind.avionicsPowered;

  const softKeys = hideSoftKeys ? null : (
    <div className="grid grid-cols-6 gap-1">
      <SoftKey
        title="Cycle the CDI/HSI navigation source: GPS → NAV1 → NAV2"
        onClick={() => cycleCdi(engine)}
      >
        CDI
      </SoftKey>
      <SoftKey
        title="Sync the heading bug to the current heading"
        onClick={() => syncHeadingBug(engine)}
      >
        HDG SYNC
      </SoftKey>
      <SoftKey title="Decrease barometric setting 0.01 inHg" onClick={() => stepBaro(engine, -1)}>
        BARO −
      </SoftKey>
      <SoftKey title="Increase barometric setting 0.01 inHg" onClick={() => stepBaro(engine, 1)}>
        BARO +
      </SoftKey>
      <SoftKey
        title="Standard pressure 29.92 inHg (used at/above the transition altitude)"
        onClick={() => engine.setRadios({ altimeterInHg: 29.92 })}
      >
        STD BARO
      </SoftKey>
      <SoftKey
        title="Set the selected altitude to the current altitude"
        onClick={() =>
          engine.setRadios({ altBug: Math.round(engine.getSnapshot().indicated.altFt / 100) * 100 })
        }
      >
        ALT SYNC
      </SoftKey>
    </div>
  );

  return (
    <DisplayBezel
      title="TeachX Flight Display · PFD"
      explainId="pfd"
      className={className}
      footer={softKeys}
    >
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="block h-auto w-full rounded-md bg-black select-none"
        role="img"
        aria-label="Primary flight display"
      >
        {powered ? <PfdContent s={s} perf={engine.perf} /> : <NoPower />}
      </svg>
    </DisplayBezel>
  );
}

function NoPower() {
  return (
    <g>
      <rect x={0} y={0} width={W} height={H} fill="#020304" />
      <text
        x={CX}
        y={H / 2 - 8}
        textAnchor="middle"
        fill="#3a4048"
        fontSize={22}
        fontFamily={MONO}
        fontWeight={700}
      >
        DISPLAY UNPOWERED
      </text>
      <text
        x={CX}
        y={H / 2 + 22}
        textAnchor="middle"
        fill="#2c3138"
        fontSize={15}
        fontFamily={MONO}
      >
        Check MASTER (BAT/ALT) and AVIONICS switches
      </text>
    </g>
  );
}

function PfdContent({ s, perf }: { s: SimSnapshot; perf: AircraftPerf }) {
  const ind = s.indicated;
  const t = s.aircraft.simTimeSec;
  const iasTrend = useRef(makeRateTracker(1)).current;
  const altTrend = useRef(makeRateTracker(1)).current;
  const iasRate = iasTrend(ind.iasKt, t);
  const altRate = altTrend(ind.altFt, t);

  return (
    <g fontFamily={MONO}>
      <AttitudeLayer s={s} />
      <SpeedTape
        ias={ind.iasKt}
        valid={ind.airDataValid}
        bug={s.radios.iasBug}
        tas={s.aircraft.tasKt}
        trend={iasRate * 6}
        perf={perf}
        flc={s.ap.vertical === "FLC"}
      />
      <AltTape
        alt={ind.altFt}
        valid={ind.airDataValid}
        sel={s.radios.altBug}
        baro={s.radios.altimeterInHg}
        trend={altRate * 6}
      />
      <VsiTape
        vs={ind.vsFpm}
        valid={ind.airDataValid}
        bug={s.radios.vsBug}
        showBug={s.ap.vertical === "VS" && (s.ap.fd || s.ap.engaged)}
      />
      <VerticalDeviation nav={s.nav} />
      <MarkerBox marker={s.nav.marker} />
      <Hsi s={s} />
      <WindBox s={s} />
      <TopBar s={s} />
      <AfcsStrip ap={s.ap} nav={s.nav} radios={s.radios} />
      <BottomBar s={s} />
    </g>
  );
}

// ---------------------------------------------------------------- attitude

function AttitudeLayer({ s }: { s: SimSnapshot }) {
  const ind = s.indicated;
  const valid = ind.attitudeValid;
  const pitch = ind.pitch;
  const bank = ind.bank;
  const tf = `rotate(${-bank} ${CX} ${CY}) translate(0 ${pitch * PPD})`;
  const ap = s.ap;
  const fdOn = ap.fd && valid;
  const fdDy = clamp((ap.fdPitch - pitch) * PPD, -130, 130);
  const fdRot = clamp(ap.fdBank - bank, -40, 40);

  return (
    <g>
      <defs>
        <clipPath id="pfd-att">
          <rect x={0} y={72} width={W} height={H - 72} />
        </clipPath>
        <linearGradient id="pfd-ladder-fade" x1={0} y1={0} x2={0} y2={1}>
          <stop offset="0%" stopColor="white" stopOpacity={0} />
          <stop offset="14%" stopColor="white" stopOpacity={1} />
          <stop offset="86%" stopColor="white" stopOpacity={1} />
          <stop offset="100%" stopColor="white" stopOpacity={0} />
        </linearGradient>
        <mask id="pfd-ladder" maskUnits="userSpaceOnUse" x={360} y={118} width={280} height={282}>
          <rect x={360} y={118} width={280} height={282} fill="url(#pfd-ladder-fade)" />
        </mask>
        <linearGradient
          id="pfd-sky"
          gradientUnits="userSpaceOnUse"
          x1={0}
          y1={CY - 420}
          x2={0}
          y2={CY}
        >
          <stop offset="0%" stopColor="#0c3f8a" />
          <stop offset="100%" stopColor="#3f86d8" />
        </linearGradient>
        <linearGradient
          id="pfd-gnd"
          gradientUnits="userSpaceOnUse"
          x1={0}
          y1={CY}
          x2={0}
          y2={CY + 420}
        >
          <stop offset="0%" stopColor="#7a5226" />
          <stop offset="100%" stopColor="#4a2f12" />
        </linearGradient>
      </defs>
      {valid ? (
        <>
          <g clipPath="url(#pfd-att)">
            <g transform={tf}>
              <rect x={-1500} y={CY - 3000} width={4000} height={3000} fill="url(#pfd-sky)" />
              <rect x={-1500} y={CY} width={4000} height={3000} fill="url(#pfd-gnd)" />
              <line x1={-1500} x2={2500} y1={CY} y2={CY} stroke={WHITE} strokeWidth={2} />
            </g>
          </g>
          <g mask="url(#pfd-ladder)">
            <g transform={tf}>
              <PitchLadder pitch={pitch} />
            </g>
          </g>
        </>
      ) : (
        <rect x={0} y={72} width={W} height={H - 72} fill="#05070a" />
      )}
      <BankScale />
      {valid ? (
        <g transform={`rotate(${-bank} ${CX} ${CY})`}>
          <polygon
            points={`${CX},${CY - 167} ${CX - 11},${CY - 148} ${CX + 11},${CY - 148}`}
            fill={WHITE}
            stroke="black"
            strokeWidth={1}
          />
          <polygon
            transform={`translate(${clamp(ind.slip, -1, 1) * 20} 0)`}
            points={`${CX - 11},${CY - 145} ${CX + 11},${CY - 145} ${CX + 15},${CY - 137} ${CX - 15},${CY - 137}`}
            fill={WHITE}
            stroke="black"
            strokeWidth={1}
          />
        </g>
      ) : null}
      {fdOn ? (
        <g transform={`rotate(${fdRot} ${CX} ${CY}) translate(0 ${-fdDy})`}>
          <polygon
            points={`${CX},${CY - 4} ${CX - 108},${CY + 30} ${CX - 108},${CY + 19} ${CX},${CY - 15}`}
            fill="var(--magenta)"
            stroke="black"
            strokeWidth={1.5}
          />
          <polygon
            points={`${CX},${CY - 4} ${CX + 108},${CY + 30} ${CX + 108},${CY + 19} ${CX},${CY - 15}`}
            fill="var(--magenta)"
            stroke="black"
            strokeWidth={1.5}
          />
        </g>
      ) : null}
      <AircraftSymbol />
      {!valid ? <RedX x={330} y={110} w={340} h={290} label="AHRS FAIL" /> : null}
    </g>
  );
}

function PitchLadder({ pitch }: { pitch: number }) {
  const lines: React.ReactNode[] = [];
  const p0 = Math.round(pitch / 2.5) * 2.5;
  for (let p = p0 - 22.5; p <= p0 + 22.5; p += 2.5) {
    if (Math.abs(p) < 0.01 || p < -90 || p > 90) continue;
    const y = CY - p * PPD;
    const major = Math.abs(p % 10) < 0.01;
    const mid = Math.abs(p % 5) < 0.01;
    const w = major ? 120 : mid ? 60 : 28;
    lines.push(
      <line
        key={`l${p}`}
        x1={CX - w / 2}
        x2={CX + w / 2}
        y1={y}
        y2={y}
        stroke={WHITE}
        strokeWidth={2}
      />,
    );
    if (major) {
      const lbl = String(Math.abs(p));
      lines.push(
        <text
          key={`a${p}`}
          x={CX - w / 2 - 8}
          y={y + 7}
          textAnchor="end"
          fill={WHITE}
          fontSize={20}
          stroke="black"
          strokeWidth={0.6}
        >
          {lbl}
        </text>,
        <text
          key={`b${p}`}
          x={CX + w / 2 + 8}
          y={y + 7}
          textAnchor="start"
          fill={WHITE}
          fontSize={20}
          stroke="black"
          strokeWidth={0.6}
        >
          {lbl}
        </text>,
      );
    }
  }
  return <g>{lines}</g>;
}

const BankScale = memo(function BankScale() {
  const R = 170;
  const ticks = [-60, -45, -30, -20, -10, 10, 20, 30, 45, 60];
  return (
    <g pointerEvents="none">
      <path d={arcPath(CX, CY, R, -60, 60)} fill="none" stroke={WHITE} strokeWidth={2} />
      {ticks.map((a) => {
        const long = Math.abs(a) === 30 || Math.abs(a) === 60;
        const p1 = polar(CX, CY, R, a);
        const p2 = polar(CX, CY, R + (long ? 20 : 11), a);
        if (Math.abs(a) === 45) {
          const tip = polar(CX, CY, R + 2, a);
          const l = polar(CX, CY, R + 14, a - 2.4);
          const r = polar(CX, CY, R + 14, a + 2.4);
          return (
            <polygon
              key={a}
              points={`${tip.x},${tip.y} ${l.x},${l.y} ${r.x},${r.y}`}
              fill="none"
              stroke={WHITE}
              strokeWidth={1.8}
            />
          );
        }
        return (
          <line key={a} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke={WHITE} strokeWidth={2.5} />
        );
      })}
      <polygon
        points={`${CX},${CY - R - 1} ${CX - 10},${CY - R - 18} ${CX + 10},${CY - R - 18}`}
        fill="none"
        stroke={WHITE}
        strokeWidth={2}
      />
    </g>
  );
});

const AircraftSymbol = memo(function AircraftSymbol() {
  const y = "#ffd21f";
  return (
    <g pointerEvents="none">
      <polygon
        points={`${CX},${CY} ${CX - 92},${CY + 34} ${CX - 66},${CY + 34} ${CX},${CY + 12} ${CX + 66},${CY + 34} ${CX + 92},${CY + 34}`}
        fill={y}
        stroke="black"
        strokeWidth={1.5}
      />
      <rect
        x={CX - 175}
        y={CY - 4}
        width={56}
        height={8}
        fill={y}
        stroke="black"
        strokeWidth={1.5}
      />
      <rect
        x={CX + 119}
        y={CY - 4}
        width={56}
        height={8}
        fill={y}
        stroke="black"
        strokeWidth={1.5}
      />
    </g>
  );
});

// ---------------------------------------------------------------- airspeed tape

const ST = { x: 105, w: 90, top: 110, bot: 420 };

function SpeedTape({
  ias,
  valid,
  bug,
  tas,
  trend,
  perf,
  flc,
}: {
  ias: number;
  valid: boolean;
  bug: number;
  tas: number;
  trend: number;
  perf: AircraftPerf;
  flc: boolean;
}) {
  const K = 4;
  const v = Math.max(ias, 20);
  const y = (kt: number) => CY - (kt - v) * K;
  const ticks: React.ReactNode[] = [];
  const start = Math.floor((v - 45) / 5) * 5;
  for (let kt = start; kt <= v + 45; kt += 5) {
    if (kt < 20) continue;
    const yy = y(kt);
    const major = kt % 10 === 0;
    ticks.push(
      <line
        key={`t${kt}`}
        x1={ST.x + ST.w - (major ? 22 : 13)}
        x2={ST.x + ST.w}
        y1={yy}
        y2={yy}
        stroke={WHITE}
        strokeWidth={2}
      />,
    );
    if (major) {
      ticks.push(
        <text
          key={`n${kt}`}
          x={ST.x + ST.w - 28}
          y={yy + 8}
          textAnchor="end"
          fill={WHITE}
          fontSize={23}
        >
          {kt}
        </text>,
      );
    }
  }
  const pv = perf.v;
  const band = (from: number, to: number, x: number, w: number, fill: string, key: string) => {
    const y1 = y(to);
    const y2 = y(from);
    if (y2 < ST.top || y1 > ST.bot) return null;
    return (
      <rect
        key={key}
        x={x}
        y={Math.max(ST.top, y1)}
        width={w}
        height={Math.min(ST.bot, y2) - Math.max(ST.top, y1)}
        fill={fill}
      />
    );
  };
  const bx = ST.x + ST.w - 7;
  const textFill = ias > pv.ne ? "var(--warning)" : ias > pv.no ? "var(--caution)" : WHITE;
  const trendLen = clamp(trend, -40, 40);
  const bugY = clamp(y(bug), ST.top, ST.bot);

  return (
    <g>
      <defs>
        <clipPath id="pfd-st-clip">
          <rect x={ST.x} y={ST.top} width={ST.w + 12} height={ST.bot - ST.top} />
        </clipPath>
      </defs>
      <rect x={ST.x} y={ST.top} width={ST.w} height={ST.bot - ST.top} fill="black" opacity={0.42} />
      {valid ? (
        <>
          <g clipPath="url(#pfd-st-clip)">
            {ticks}
            {band(0, pv.so, bx, 7, "var(--warning)", "low")}
            {band(pv.so, pv.fe, bx - 5, 5, WHITE, "white")}
            {band(pv.s1, pv.no, bx, 7, "var(--ok)", "green")}
            {band(pv.no, pv.ne, bx, 7, "var(--caution)", "yellow")}
            {band(pv.ne, pv.ne + 80, bx, 7, "var(--warning)", "red")}
            {Math.abs(trendLen) > 1.5 ? (
              <line
                x1={ST.x + ST.w - 3}
                x2={ST.x + ST.w - 3}
                y1={CY}
                y2={CY - trendLen * K}
                stroke="var(--magenta)"
                strokeWidth={4}
              />
            ) : null}
          </g>
          <path
            d={`M ${ST.x + ST.w} ${bugY - 11} h 11 v 22 h -11 v -6 h 5 v -10 h -5 Z`}
            fill="var(--cyan)"
            stroke="black"
            strokeWidth={1}
          />
          <polygon
            points={`${ST.x - 4},${CY - 24} ${ST.x + 72},${CY - 24} ${ST.x + 72},${CY - 11} ${ST.x + 88},${CY} ${ST.x + 72},${CY + 11} ${ST.x + 72},${CY + 24} ${ST.x - 4},${CY + 24}`}
            fill="black"
            stroke={WHITE}
            strokeWidth={1.8}
          />
          <text
            x={ST.x + 66}
            y={CY + 11}
            textAnchor="end"
            fill={textFill}
            fontSize={32}
            fontWeight={700}
          >
            {ias < 20 ? "---" : Math.round(ias)}
          </text>
        </>
      ) : (
        <RedX x={ST.x} y={ST.top} w={ST.w} h={ST.bot - ST.top} />
      )}
      <rect x={ST.x} y={80} width={ST.w} height={26} fill="black" stroke="#444" />
      <text
        x={ST.x + ST.w / 2}
        y={100}
        textAnchor="middle"
        fill="var(--cyan)"
        fontSize={19}
        opacity={flc ? 1 : 0.8}
      >
        {Math.round(bug)}KT
      </text>
      <rect x={ST.x} y={424} width={ST.w} height={26} fill="black" stroke="#444" />
      <text x={ST.x + 6} y={443} fill={WHITE} fontSize={14}>
        TAS
      </text>
      <text x={ST.x + ST.w - 5} y={443} textAnchor="end" fill={WHITE} fontSize={18}>
        {valid ? Math.round(tas) : "---"}
        <tspan fontSize={12}>KT</tspan>
      </text>
    </g>
  );
}

// ---------------------------------------------------------------- altitude tape

const AT = { x: 790, w: 90, top: 110, bot: 420 };

function useAltAlert(alt: number, sel: number) {
  const st = useRef({ sel, phase: "idle" as "idle" | "approach" | "captured", until: 0 });
  const r = st.current;
  const now = typeof performance !== "undefined" ? performance.now() : 0;
  const dev = Math.abs(alt - sel);
  if (r.sel !== sel) {
    r.sel = sel;
    r.phase = dev < 200 ? "captured" : "idle";
    r.until = 0;
  }
  if (r.phase === "idle" && dev < 1000 && dev >= 200) {
    r.phase = "approach";
    r.until = now + 5000;
  }
  if (r.phase !== "captured" && dev < 200) {
    r.phase = "captured";
    r.until = 0;
  }
  if (r.phase === "approach" && dev >= 1000) r.phase = "idle";
  const deviation = r.phase === "captured" && dev > 200;
  return { approaching: r.phase === "approach" && now < r.until, deviation };
}

function AltTape({
  alt,
  valid,
  sel,
  baro,
  trend,
}: {
  alt: number;
  valid: boolean;
  sel: number;
  baro: number;
  trend: number;
}) {
  const K = 0.3;
  const y = (a: number) => CY - (a - alt) * K;
  const ticks: React.ReactNode[] = [];
  const start = Math.floor((alt - 540) / 20) * 20;
  for (let a = start; a <= alt + 540; a += 20) {
    const yy = y(a);
    const major = a % 100 === 0;
    ticks.push(
      <line
        key={`t${a}`}
        x1={AT.x}
        x2={AT.x + (major ? 18 : 9)}
        y1={yy}
        y2={yy}
        stroke={WHITE}
        strokeWidth={2}
      />,
    );
    if (major) {
      ticks.push(
        <text key={`n${a}`} x={AT.x + 22} y={yy + 7} fill={WHITE} fontSize={20}>
          {a}
        </text>,
      );
    }
  }
  const { approaching, deviation } = useAltAlert(alt, sel);
  const bugY = clamp(y(sel), AT.top, AT.bot);
  const altR = Math.round(alt / 20) * 20;
  const neg = altR < 0;
  const absR = Math.abs(altR);
  const main = `${neg ? "-" : ""}${Math.floor(absR / 100)}`;
  const sub = String(absR % 100).padStart(2, "0");
  const trendLen = clamp(trend, -500, 500);
  return (
    <g>
      <defs>
        <clipPath id="pfd-at-clip">
          <rect x={AT.x} y={AT.top} width={AT.w} height={AT.bot - AT.top} />
        </clipPath>
      </defs>
      <rect x={AT.x} y={AT.top} width={AT.w} height={AT.bot - AT.top} fill="black" opacity={0.42} />
      {valid ? (
        <>
          <g clipPath="url(#pfd-at-clip)">
            {ticks}
            {Math.abs(trendLen) > 20 ? (
              <line
                x1={AT.x + 3}
                x2={AT.x + 3}
                y1={CY}
                y2={CY - trendLen * K}
                stroke="var(--magenta)"
                strokeWidth={4}
              />
            ) : null}
          </g>
          <path
            d={`M ${AT.x} ${bugY - 11} h -11 v 22 h 11 v -6 h -5 v -10 h 5 Z`}
            fill="var(--cyan)"
            stroke="black"
            strokeWidth={1}
          />
          <polygon
            points={`${AT.x - 14},${CY} ${AT.x},${CY - 12} ${AT.x},${CY - 26} ${AT.x + AT.w + 6},${CY - 26} ${AT.x + AT.w + 6},${CY + 26} ${AT.x},${CY + 26} ${AT.x},${CY + 12}`}
            fill="black"
            stroke={WHITE}
            strokeWidth={1.8}
          />
          <text
            x={AT.x + 58}
            y={CY + 11}
            textAnchor="end"
            fill={WHITE}
            fontSize={30}
            fontWeight={700}
          >
            {main}
          </text>
          <text x={AT.x + 60} y={CY + 9} fill={WHITE} fontSize={22} fontWeight={700}>
            {sub}
          </text>
        </>
      ) : (
        <RedX x={AT.x} y={AT.top} w={AT.w} h={AT.bot - AT.top} />
      )}
      <g className={approaching || deviation ? "animate-annunciator" : undefined}>
        <rect
          x={AT.x}
          y={80}
          width={AT.w}
          height={26}
          fill={approaching ? "var(--cyan)" : "black"}
          stroke={deviation ? "var(--caution)" : "#444"}
        />
        <text
          x={AT.x + AT.w / 2}
          y={100}
          textAnchor="middle"
          fill={approaching ? "black" : deviation ? "var(--caution)" : "var(--cyan)"}
          fontSize={20}
          fontWeight={600}
        >
          {sel}
          <tspan fontSize={12}>FT</tspan>
        </text>
      </g>
      <rect x={AT.x} y={424} width={AT.w} height={26} fill="black" stroke="#444" />
      <text x={AT.x + AT.w / 2} y={444} textAnchor="middle" fill="var(--cyan)" fontSize={18}>
        {baro.toFixed(2)}
        <tspan fontSize={12}>IN</tspan>
      </text>
    </g>
  );
}

function VsiTape({
  vs,
  valid,
  bug,
  showBug,
}: {
  vs: number;
  valid: boolean;
  bug: number;
  showBug: boolean;
}) {
  const x = 885;
  const w = 56;
  const half = 135;
  const K = half / 2000;
  const y = (v: number) => CY - clamp(v, -2000, 2000) * K;
  const marks = [-2000, -1500, -1000, -500, 500, 1000, 1500, 2000];
  const py = y(vs);
  const shown = Math.abs(vs) >= 100;
  return (
    <g>
      <path
        d={`M ${x} ${CY - half - 10} h ${w - 10} l 10 10 v ${2 * half} l -10 10 h ${-(w - 10)} Z`}
        fill="black"
        opacity={0.42}
      />
      {marks.map((m) => (
        <g key={m}>
          <line
            x1={x}
            x2={x + (m % 1000 === 0 ? 14 : 8)}
            y1={y(m)}
            y2={y(m)}
            stroke={WHITE}
            strokeWidth={2}
          />
          {m % 1000 === 0 ? (
            <text x={x + 18} y={y(m) + 6} fill={WHITE} fontSize={16}>
              {Math.abs(m) / 1000}
            </text>
          ) : null}
        </g>
      ))}
      <line x1={x} x2={x + 16} y1={CY} y2={CY} stroke={WHITE} strokeWidth={3} />
      {valid ? (
        <>
          {showBug ? (
            <path
              d={`M ${x} ${y(bug) - 9} h 9 v 18 h -9 v -5 h 4 v -8 h -4 Z`}
              fill="var(--cyan)"
              stroke="black"
            />
          ) : null}
          <polygon
            points={`${x + 2},${py} ${x + 14},${py - 13} ${x + 74},${py - 13} ${x + 74},${py + 13} ${x + 14},${py + 13}`}
            fill="black"
            stroke={WHITE}
            strokeWidth={1.5}
          />
          {shown ? (
            <text x={x + 71} y={py + 6} textAnchor="end" fill={WHITE} fontSize={16}>
              {Math.round(vs / 50) * 50}
            </text>
          ) : null}
        </>
      ) : (
        <RedX x={x} y={CY - half} w={w} h={2 * half} />
      )}
    </g>
  );
}

function VerticalDeviation({ nav }: { nav: NavOutputs }) {
  const h = nav.hsi;
  if (!h.gsValid) return null;
  const x = 765;
  const dot = 30;
  const gps = h.source === "GPS";
  const color = gps ? "var(--magenta)" : "var(--ok)";
  const y = CY - clamp(h.gsDots, -2.5, 2.5) * dot;
  return (
    <g>
      <rect
        x={x - 13}
        y={CY - 2.5 * dot - 26}
        width={26}
        height={5 * dot + 32}
        fill="black"
        opacity={0.45}
      />
      <text
        x={x}
        y={CY - 2.5 * dot - 9}
        textAnchor="middle"
        fill={color}
        fontSize={16}
        fontWeight={700}
      >
        {gps ? "V" : "G"}
      </text>
      {[-2, -1, 1, 2].map((d) => (
        <circle
          key={d}
          cx={x}
          cy={CY + d * dot}
          r={5}
          fill="none"
          stroke={WHITE}
          strokeWidth={1.8}
        />
      ))}
      <line x1={x - 10} x2={x + 10} y1={CY} y2={CY} stroke={WHITE} strokeWidth={2} />
      <polygon
        points={`${x},${y - 12} ${x + 9},${y} ${x},${y + 12} ${x - 9},${y}`}
        fill={color}
        stroke="black"
      />
    </g>
  );
}

function MarkerBox({ marker }: { marker: NavOutputs["marker"] }) {
  if (!marker) return null;
  const map = {
    OM: { t: "O", c: "var(--cyan)" },
    MM: { t: "M", c: "var(--caution)" },
    IM: { t: "I", c: WHITE },
  } as const;
  const m = map[marker];
  return (
    <g className="animate-annunciator">
      <rect x={732} y={112} width={34} height={34} fill={m.c} stroke="black" />
      <text x={749} y={137} textAnchor="middle" fontSize={24} fontWeight={800} fill="black">
        {m.t}
      </text>
    </g>
  );
}

// ---------------------------------------------------------------- HSI

const HX = CX;
const HY = 612;
const HR = 132;
const DOT = 26;

const RoseMarks = memo(function RoseMarks() {
  const out: React.ReactNode[] = [];
  const labels: Record<number, string> = { 0: "N", 90: "E", 180: "S", 270: "W" };
  for (let d = 0; d < 360; d += 5) {
    const long = d % 10 === 0;
    const a = polar(HX, HY, HR, d);
    const b = polar(HX, HY, HR - (long ? 15 : 8), d);
    out.push(
      <line key={`k${d}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={WHITE} strokeWidth={2} />,
    );
    if (d % 30 === 0) {
      const p = polar(HX, HY, HR - 32, d);
      const lbl = labels[d] ?? String(d / 10);
      out.push(
        <text
          key={`l${d}`}
          x={p.x}
          y={p.y + 8}
          textAnchor="middle"
          fill={WHITE}
          fontSize={labels[d] ? 22 : 19}
          fontWeight={labels[d] ? 700 : 500}
          transform={`rotate(${d} ${p.x} ${p.y})`}
        >
          {lbl}
        </text>,
      );
    }
  }
  return <g>{out}</g>;
});

const FixedHsiMarks = memo(function FixedHsiMarks() {
  return (
    <g>
      {[45, 90, 135, 180, 225, 270, 315].map((d) => {
        const a = polar(HX, HY, HR + 4, d);
        const b = polar(HX, HY, HR + 14, d);
        return (
          <line key={d} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={WHITE} strokeWidth={2.5} />
        );
      })}
      {/* own-ship symbol */}
      <path
        d={`M ${HX} ${HY - 22} L ${HX + 3} ${HY - 4} L ${HX + 20} ${HY + 2} L ${HX + 20} ${HY + 6} L ${HX + 3} ${HY + 4} L ${HX + 2} ${HY + 16} L ${HX + 8} ${HY + 20} L ${HX - 8} ${HY + 20} L ${HX - 2} ${HY + 16} L ${HX - 3} ${HY + 4} L ${HX - 20} ${HY + 6} L ${HX - 20} ${HY + 2} L ${HX - 3} ${HY - 4} Z`}
        fill={WHITE}
      />
    </g>
  );
});

function Hsi({ s }: { s: SimSnapshot }) {
  const ind = s.indicated;
  const hdg = ind.headingMag;
  const h = s.nav.hsi;
  const gps = h.source === "GPS";
  const color = gps ? "var(--magenta)" : "var(--ok)";
  const crsRot = h.course - hdg;
  const dev = clamp(h.cdiDots, -2.5, 2.5) * DOT;
  const turn6 = clamp(ind.turnRate * 6, -90, 90);
  const srcLabel = gps ? "GPS" : `${h.label}${h.source === "NAV1" ? "1" : "2"}`;
  const sub = gps ? (s.gps.directTo ? "D→" : h.label) : "";
  const showCdi = h.toFrom !== "OFF";

  return (
    <g>
      <circle
        cx={HX}
        cy={HY}
        r={HR + 2}
        fill="black"
        opacity={0.72}
        stroke="#5a6068"
        strokeWidth={1.5}
      />
      {ind.headingValid ? (
        <>
          {Math.abs(turn6) > 1 ? (
            <path
              d={turn6 > 0 ? arcPath(HX, HY, HR + 8, 0, turn6) : arcPath(HX, HY, HR + 8, turn6, 0)}
              fill="none"
              stroke="var(--magenta)"
              strokeWidth={4}
            />
          ) : null}
          <g transform={`rotate(${-hdg} ${HX} ${HY})`}>
            <RoseMarks />
            <g transform={`rotate(${s.radios.hdgBug} ${HX} ${HY})`}>
              <path
                d={`M ${HX - 12} ${HY - HR - 2} h 24 v 14 h -6 l -6 -8 l -6 8 h -6 Z`}
                fill="var(--cyan)"
                stroke="black"
                strokeWidth={1}
              />
            </g>
          </g>
          <g transform={`rotate(${crsRot} ${HX} ${HY})`}>
            <polygon
              points={`${HX},${HY - HR + 14} ${HX - 11},${HY - HR + 36} ${HX + 11},${HY - HR + 36}`}
              fill={color}
              stroke="black"
            />
            <rect
              x={HX - 3}
              y={HY - HR + 36}
              width={6}
              height={HR - 36 - 64}
              fill={color}
              stroke="black"
              strokeWidth={0.5}
            />
            <rect
              x={HX - 3}
              y={HY + 64}
              width={6}
              height={HR - 64 - 14}
              fill={color}
              stroke="black"
              strokeWidth={0.5}
            />
            {[-2, -1, 1, 2].map((d) => (
              <circle
                key={d}
                cx={HX + d * DOT}
                cy={HY}
                r={5}
                fill="none"
                stroke={WHITE}
                strokeWidth={1.8}
              />
            ))}
            {showCdi ? (
              <rect
                x={HX + dev - 3.5}
                y={HY - 58}
                width={7}
                height={116}
                fill={color}
                stroke="black"
                strokeWidth={0.5}
              />
            ) : null}
            {showCdi ? (
              h.toFrom === "TO" ? (
                <polygon
                  points={`${HX + 34},${HY - 52} ${HX + 26},${HY - 38} ${HX + 42},${HY - 38}`}
                  fill={WHITE}
                />
              ) : (
                <polygon
                  points={`${HX + 34},${HY + 52} ${HX + 26},${HY + 38} ${HX + 42},${HY + 38}`}
                  fill={WHITE}
                />
              )
            ) : null}
          </g>
          <FixedHsiMarks />
          <text
            x={HX - 56}
            y={HY - 44}
            textAnchor="middle"
            fill={color}
            fontSize={16}
            fontWeight={700}
            stroke="black"
            strokeWidth={3}
            paintOrder="stroke"
          >
            {srcLabel}
          </text>
          {sub ? (
            <text
              x={HX + 56}
              y={HY - 44}
              textAnchor="middle"
              fill={color}
              fontSize={13}
              stroke="black"
              strokeWidth={3}
              paintOrder="stroke"
            >
              {sub}
            </text>
          ) : null}
          {!showCdi && !gps ? (
            <text
              x={HX - 56}
              y={HY - 26}
              textAnchor="middle"
              fill="var(--warning)"
              fontSize={12}
              fontWeight={700}
              stroke="black"
              strokeWidth={3}
              paintOrder="stroke"
            >
              NO SIG
            </text>
          ) : null}
        </>
      ) : (
        <RedX x={HX - HR} y={HY - HR} w={HR * 2} h={HR * 2} label="HDG" />
      )}
      {/* lubber + heading box */}
      <polygon
        points={`${HX},${HY - HR + 2} ${HX - 8},${HY - HR - 10} ${HX + 8},${HY - HR - 10}`}
        fill={WHITE}
      />
      <rect
        x={HX - 36}
        y={HY - HR - 40}
        width={72}
        height={30}
        fill="black"
        stroke={WHITE}
        strokeWidth={1.5}
      />
      <text x={HX} y={HY - HR - 17} textAnchor="middle" fill={WHITE} fontSize={23} fontWeight={700}>
        {ind.headingValid ? `${pad3(hdg)}°` : "---"}
      </text>
      {/* HDG / CRS boxes */}
      <rect x={290} y={470} width={112} height={30} fill="black" stroke="#555" />
      <text x={298} y={491} fill={WHITE} fontSize={14}>
        HDG
      </text>
      <text x={396} y={492} textAnchor="end" fill="var(--cyan)" fontSize={20} fontWeight={600}>
        {pad3(s.radios.hdgBug)}°
      </text>
      <rect x={598} y={470} width={112} height={30} fill="black" stroke="#555" />
      <text x={606} y={491} fill={WHITE} fontSize={14}>
        CRS
      </text>
      <text x={704} y={492} textAnchor="end" fill={color} fontSize={20} fontWeight={600}>
        {pad3(h.course)}°
      </text>
    </g>
  );
}

// ---------------------------------------------------------------- data boxes

function WindBox({ s }: { s: SimSnapshot }) {
  const w = computedWind(s.aircraft);
  const x = 15;
  const y = 470;
  const rot = norm180(w.fromTrue + 180 - s.aircraft.heading);
  return (
    <g>
      <rect x={x} y={y} width={150} height={62} fill="black" stroke="#555" />
      {w.valid && w.kt >= 1 ? (
        <>
          <g transform={`translate(${x + 30} ${y + 31}) rotate(${rot})`}>
            <line x1={0} y1={18} x2={0} y2={-14} stroke={WHITE} strokeWidth={3} />
            <polygon points="0,-22 -8,-10 8,-10" fill={WHITE} />
          </g>
          <text x={x + 60} y={y + 26} fill={WHITE} fontSize={18}>
            {pad3(norm360(w.fromTrue - s.magVar))}°
          </text>
          <text x={x + 60} y={y + 50} fill={WHITE} fontSize={18}>
            {Math.round(w.kt)}
            <tspan fontSize={12}>KT</tspan>
          </text>
        </>
      ) : (
        <text x={x + 75} y={y + 37} textAnchor="middle" fill="#9aa3ad" fontSize={14}>
          NO WIND DATA
        </text>
      )}
    </g>
  );
}

function TopBar({ s }: { s: SimSnapshot }) {
  const r = s.radios;
  const g = s.nav.gps;
  const src = r.cdiSource;
  const navRow = (n: 1 | 2, y: number) => {
    const nr = n === 1 ? r.nav1 : r.nav2;
    const rx = n === 1 ? s.nav.nav1 : s.nav.nav2;
    const sel = src === (n === 1 ? "NAV1" : "NAV2");
    return (
      <g key={n}>
        <text x={12} y={y} fill={WHITE} fontSize={15}>
          NAV{n}
        </text>
        <text x={62} y={y} fill={sel ? "var(--ok)" : WHITE} fontSize={16}>
          {fmtNav(nr.active)}
        </text>
        <text x={132} y={y} fill="#9aa3ad" fontSize={14}>
          ↔
        </text>
        <text x={150} y={y} fill="var(--cyan)" fontSize={16}>
          {fmtNav(nr.standby)}
        </text>
        <text x={218} y={y} fill="var(--ok)" fontSize={13}>
          {rx.valid ? rx.ident : ""}
        </text>
      </g>
    );
  };
  const comRow = (n: 1 | 2, y: number) => {
    const c = n === 1 ? r.com1 : r.com2;
    return (
      <g key={`c${n}`}>
        <text x={W - 236} y={y} fill="var(--cyan)" fontSize={16}>
          {fmtCom(c.standby)}
        </text>
        <text x={W - 160} y={y} fill="#9aa3ad" fontSize={14}>
          ↔
        </text>
        <text x={W - 142} y={y} fill={n === 1 ? "var(--ok)" : WHITE} fontSize={16}>
          {fmtCom(c.active)}
        </text>
        <text x={W - 12} y={y} textAnchor="end" fill={WHITE} fontSize={15}>
          COM{n}
        </text>
      </g>
    );
  };
  return (
    <g>
      <rect x={0} y={0} width={W} height={44} fill="#0b0d10" />
      <line x1={0} x2={W} y1={44} y2={44} stroke="#30353c" />
      {navRow(1, 18)}
      {navRow(2, 38)}
      {comRow(1, 18)}
      {comRow(2, 38)}
      <rect x={300} y={6} width={400} height={32} fill="black" stroke="#30353c" />
      {g.valid && g.toId ? (
        <>
          <text x={312} y={28} fill="var(--magenta)" fontSize={16}>
            {s.gps.directTo ? "D→" : g.fromId ? `${g.fromId.slice(0, 6)} →` : "→"}{" "}
            {g.toId.slice(0, 7)}
          </text>
          <text x={530} y={28} fill={WHITE} fontSize={14}>
            DIS{" "}
            <tspan fill="var(--magenta)" fontSize={16}>
              {g.distNm.toFixed(1)}
            </tspan>
            <tspan fontSize={11}>NM</tspan>
          </text>
          <text x={690} y={28} textAnchor="end" fill={WHITE} fontSize={14}>
            DTK{" "}
            <tspan fill="var(--magenta)" fontSize={16}>
              {pad3(g.dtk)}°
            </tspan>
          </text>
        </>
      ) : (
        <text x={CX} y={28} textAnchor="middle" fill="#9aa3ad" fontSize={14}>
          {g.valid ? "NO ACTIVE WAYPOINT" : s.failures.gps ? "GPS LOI — NO GPS POSITION" : "GPS —"}
        </text>
      )}
    </g>
  );
}

function useFlash(value: string, ms = 4000) {
  const [flash, setFlash] = useState(false);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (!value) return;
    setFlash(true);
    const id = setTimeout(() => setFlash(false), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return flash;
}

export function lateralLabel(ap: AutopilotState, nav: NavOutputs): string {
  switch (ap.lateral) {
    case "ROL":
      return "ROL";
    case "HDG":
      return "HDG";
    case "NAV":
      return nav.hsi.source === "GPS" ? "GPS" : nav.hsi.label === "LOC" ? "LOC" : "VOR";
    case "APR":
      return nav.hsi.source === "GPS" ? "GPS" : "LOC";
  }
}

export function lateralArmedLabel(ap: AutopilotState, nav: NavOutputs): string {
  if (!ap.lateralArmed) return "";
  if (ap.lateralArmed === "LOC") return nav.hsi.source === "GPS" ? "GPS" : "LOC";
  return nav.hsi.source === "GPS" ? "GPS" : nav.hsi.label === "LOC" ? "LOC" : "VOR";
}

export function verticalTarget(ap: AutopilotState, r: SimSnapshot["radios"]): string {
  switch (ap.vertical) {
    case "VS":
      return `${r.vsBug >= 0 ? "↑" : "↓"}${Math.abs(r.vsBug)}FPM`;
    case "FLC":
      return `${r.iasBug}KT`;
    case "ALT":
      return "";
    case "PIT":
      return `${ap.targetPitch >= 0 ? "+" : ""}${ap.targetPitch.toFixed(0)}°`;
    case "GS":
      return "";
  }
}

function AfcsStrip({
  ap,
  nav,
  radios,
}: {
  ap: AutopilotState;
  nav: NavOutputs;
  radios: SimSnapshot["radios"];
}) {
  const on = ap.fd || ap.engaged;
  const lat = on ? lateralLabel(ap, nav) : "";
  const latArm = on ? lateralArmedLabel(ap, nav) : "";
  const vert = on
    ? ap.vertical === "GS"
      ? nav.hsi.source === "GPS"
        ? "GP"
        : "GS"
      : ap.vertical
    : "";
  const vArm = on
    ? ap.verticalArmed === "GS"
      ? nav.hsi.source === "GPS"
        ? "GP"
        : "GS"
      : (ap.verticalArmed ?? "")
    : "";
  const tgt = on ? verticalTarget(ap, radios) : "";
  const disc = !ap.engaged && ap.annunciation.includes("DISCONNECT");
  const fLat = useFlash(lat);
  const fVert = useFlash(vert);
  const y0 = 46;
  const h = 25;
  const cell = (x: number, w: number) => (
    <rect x={x} y={y0} width={w} height={h} fill="black" stroke="#30353c" />
  );
  return (
    <g>
      {cell(240, 110)}
      {cell(350, 85)}
      {cell(435, 70)}
      {cell(505, 160)}
      {cell(665, 95)}
      <g className={disc ? "animate-annunciator" : undefined}>
        {ap.engaged || disc ? (
          <text
            x={262}
            y={y0 + 19}
            fill={disc ? "var(--caution)" : "var(--ok)"}
            fontSize={18}
            fontWeight={700}
          >
            AP
          </text>
        ) : null}
      </g>
      {ap.yd ? (
        <text x={302} y={y0 + 19} fill="var(--ok)" fontSize={18} fontWeight={700}>
          YD
        </text>
      ) : null}
      <g className={fLat ? "animate-annunciator" : undefined}>
        <text
          x={392}
          y={y0 + 19}
          textAnchor="middle"
          fill="var(--ok)"
          fontSize={18}
          fontWeight={700}
        >
          {lat}
        </text>
      </g>
      <text x={470} y={y0 + 19} textAnchor="middle" fill={WHITE} fontSize={17}>
        {latArm}
      </text>
      <g className={fVert ? "animate-annunciator" : undefined}>
        <text x={515} y={y0 + 19} fill="var(--ok)" fontSize={18} fontWeight={700}>
          {vert}
        </text>
      </g>
      <text x={655} y={y0 + 19} textAnchor="end" fill="var(--ok)" fontSize={16}>
        {ap.vertical === "ALT" && on ? "" : tgt}
      </text>
      <text x={712} y={y0 + 19} textAnchor="middle" fill={WHITE} fontSize={17}>
        {vArm}
      </text>
    </g>
  );
}

function BottomBar({ s }: { s: SimSnapshot }) {
  const xp = s.radios.transponder;
  const lcl = s.weather.timeOfDay + s.aircraft.simTimeSec / 3600;
  const hh = Math.floor(lcl % 24);
  const mm = Math.floor((lcl * 60) % 60);
  const xpColor = xp.mode === "ALT" ? "var(--ok)" : xp.mode === "ON" ? WHITE : "#7d858f";
  return (
    <g>
      <rect x={15} y={696} width={150} height={24} fill="black" stroke="#444" />
      <text x={22} y={714} fill={WHITE} fontSize={14}>
        GS
      </text>
      <text x={158} y={715} textAnchor="end" fill={WHITE} fontSize={17}>
        {s.nav.gps.valid ? Math.round(s.aircraft.gsKt) : "---"}
        <tspan fontSize={11}>KT</tspan>
      </text>
      <rect x={15} y={722} width={150} height={24} fill="black" stroke="#444" />
      <text x={22} y={740} fill={WHITE} fontSize={14}>
        OAT
      </text>
      <text x={158} y={741} textAnchor="end" fill={WHITE} fontSize={17}>
        {Math.round(s.aircraft.oatC)}°C
      </text>
      <rect x={835} y={696} width={150} height={24} fill="black" stroke="#444" />
      <text x={842} y={714} fill={WHITE} fontSize={14}>
        XPDR
      </text>
      <text x={978} y={715} textAnchor="end" fill={xpColor} fontSize={16}>
        {xp.code} {xp.mode}
      </text>
      <rect x={835} y={722} width={150} height={24} fill="black" stroke="#444" />
      <text x={842} y={740} fill={WHITE} fontSize={14}>
        LCL
      </text>
      <text x={978} y={741} textAnchor="end" fill={WHITE} fontSize={16}>
        {String(hh).padStart(2, "0")}:{String(mm).padStart(2, "0")}
      </text>
    </g>
  );
}
