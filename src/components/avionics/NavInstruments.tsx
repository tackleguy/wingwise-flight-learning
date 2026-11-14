/**
 * Navigation instruments: VOR/CDI, mechanical HSI, ADF, DME and ILS indicators.
 * All read `snapshot.nav.*` (receiver outputs) and tune/adjust the engine through knobs.
 */
import { memo, useRef, useState } from "react";
import { clamp, norm360 } from "@/lib/geo";
import { cn } from "@/lib/utils";
import { fmtEte, fmtNav, makeRateTracker, morse, pad3 } from "@/sim/avionics-helpers";
import { useSimEngine, useSimSnapshot } from "@/sim/react";
import type { NavReceiverOutput } from "@/sim/types";
import { ExplainButton, Flag, GaugeFace, GaugeFrame, GaugeGlass, MONO, polar } from "./common";
import {
  stepCourse,
  stepHeadingBug,
  stepObs,
  syncCourse,
  syncHeadingBug,
  syncObs,
} from "./controls";
import { Knob } from "./Knob";

const WHITE = "#f1f3f5";
const DOT = 18;

// ---------------------------------------------------------------- shared dial pieces

const AzimuthCard = memo(function AzimuthCard({
  r,
  labelR,
  fontSize = 14,
}: {
  r: number;
  labelR: number;
  fontSize?: number;
}) {
  const out: React.ReactNode[] = [];
  const names: Record<number, string> = { 0: "N", 90: "E", 180: "S", 270: "W" };
  for (let d = 0; d < 360; d += 5) {
    const long = d % 10 === 0;
    const a = polar(100, 100, r, d);
    const b = polar(100, 100, r - (long ? 9 : 5), d);
    out.push(
      <line
        key={d}
        x1={a.x}
        y1={a.y}
        x2={b.x}
        y2={b.y}
        stroke={WHITE}
        strokeWidth={long ? 1.6 : 0.9}
      />,
    );
    if (d % 30 === 0) {
      const p = polar(100, 100, labelR, d);
      out.push(
        <text
          key={`t${d}`}
          x={p.x}
          y={p.y + fontSize * 0.36}
          textAnchor="middle"
          fill={WHITE}
          fontSize={fontSize}
          fontFamily={MONO}
          fontWeight={names[d] ? 700 : 500}
          transform={`rotate(${d} ${p.x} ${p.y})`}
        >
          {names[d] ?? d / 10}
        </text>,
      );
    }
  }
  return <g>{out}</g>;
});

function CdiDots({ vertical = false }: { vertical?: boolean }) {
  return (
    <g>
      {[-2, -1, 1, 2].map((d) => (
        <circle
          key={d}
          cx={vertical ? 100 : 100 + d * DOT}
          cy={vertical ? 100 + d * DOT : 100}
          r={3.2}
          fill="none"
          stroke={WHITE}
          strokeWidth={1.4}
        />
      ))}
      <circle cx={100} cy={100} r={6} fill="none" stroke={WHITE} strokeWidth={1.4} />
    </g>
  );
}

function ToFromFlag({ toFrom, valid }: { toFrom: NavReceiverOutput["toFrom"]; valid: boolean }) {
  if (!valid || toFrom === "OFF") return <Flag x={128} y={124} text="NAV" />;
  return toFrom === "TO" ? (
    <g>
      <polygon points="128,64 120,78 136,78" fill={WHITE} />
      <text
        x={128}
        y={90}
        textAnchor="middle"
        fill={WHITE}
        fontSize={9}
        fontFamily={MONO}
        fontWeight={700}
      >
        TO
      </text>
    </g>
  ) : (
    <g>
      <polygon points="128,136 120,122 136,122" fill={WHITE} />
      <text
        x={128}
        y={117}
        textAnchor="middle"
        fill={WHITE}
        fontSize={9}
        fontFamily={MONO}
        fontWeight={700}
      >
        FR
      </text>
    </g>
  );
}

function IdentStrip({ freq, rx, label }: { freq: number; rx: NavReceiverOutput; label: string }) {
  return (
    <div className="mt-1.5 flex w-full items-center justify-between gap-2 rounded-md border border-white/10 bg-black px-2 py-1 font-mono text-[11px]">
      <span className="text-white/55">{label}</span>
      <span className="text-ok tabular">{fmtNav(freq)}</span>
      <span className={cn("min-w-[3ch] font-semibold", rx.valid ? "text-ok" : "text-white/30")}>
        {rx.valid || rx.ident ? rx.ident || "---" : "---"}
      </span>
      <span
        className="hidden truncate text-[10px] tracking-widest text-white/50 sm:inline"
        title="Morse identifier"
      >
        {rx.valid && rx.ident ? morse(rx.ident) : ""}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------- VOR / CDI

export interface NavIndicatorProps {
  /** Which NAV receiver drives the indicator (default 1). */
  nav?: 1 | 2 | undefined;
  className?: string | undefined;
}

/** VOR indicator (CDI) with OBS knob, TO/FROM flag and glideslope needle when an ILS is tuned. */
export function VorIndicator({ nav = 1, className }: NavIndicatorProps) {
  const s = useSimSnapshot();
  const engine = useSimEngine();
  const rx = nav === 1 ? s.nav.nav1 : s.nav.nav2;
  const r = nav === 1 ? s.radios.nav1 : s.radios.nav2;
  const ils = rx.kind === "ILS";
  const obs = r.obs;
  const dev = clamp(rx.valid ? rx.cdiDots : 0, -2.5, 2.5) * DOT;
  const gs = clamp(rx.gsValid ? rx.gsDots : 0, -2.5, 2.5) * DOT;
  return (
    <div className={cn("flex flex-col items-center", className)}>
      <GaugeFrame
        caption={`NAV ${nav} — ${ils ? "LOC/GS" : "VOR"}`}
        explainId={ils ? "ils" : "vor"}
        className="w-full"
        controls={
          <div className="absolute -bottom-1 -left-1">
            <Knob
              size="sm"
              label={`NAV${nav} OBS`}
              caption=""
              valueNow={Math.round(obs)}
              valueMin={0}
              valueMax={359}
              valueText={`Course ${pad3(obs)}`}
              onStep={(d, big) => stepObs(engine, nav, d, big)}
              onPush={() => syncObs(engine, nav)}
            />
          </div>
        }
      >
        <svg
          viewBox="0 0 200 200"
          className="h-full w-full"
          role="img"
          aria-label={`NAV ${nav} course ${pad3(obs)} deviation ${rx.cdiDots.toFixed(1)} dots ${rx.toFrom}`}
        >
          <GaugeFace />
          <g transform={`rotate(${-obs} 100 100)`}>
            <AzimuthCard r={88} labelR={72} />
          </g>
          <polygon points="100,14 94,4 106,4" fill="#ff8a1f" />
          <polygon points="100,186 94,196 106,196" fill={WHITE} opacity={0.6} />
          <circle cx={100} cy={100} r={58} fill="#0b0c0e" stroke="#333" />
          <CdiDots />
          {ils ? <CdiDots vertical /> : null}
          <ToFromFlag toFrom={rx.toFrom} valid={rx.valid} />
          {ils && !rx.gsValid ? <Flag x={72} y={76} text="GS" /> : null}
          <line
            x1={100 + dev}
            x2={100 + dev}
            y1={46}
            y2={154}
            stroke={WHITE}
            strokeWidth={3}
            strokeLinecap="round"
          />
          {ils && rx.gsValid ? (
            <line
              x1={46}
              x2={154}
              y1={100 - gs}
              y2={100 - gs}
              stroke={WHITE}
              strokeWidth={3}
              strokeLinecap="round"
            />
          ) : null}
          <text x={100} y={150} textAnchor="middle" fill="#9aa3ad" fontSize={8} fontFamily={MONO}>
            {ils ? `LOC ${pad3(rx.locCourse)}` : `OBS ${pad3(obs)}`}
          </text>
          <GaugeGlass />
        </svg>
      </GaugeFrame>
      <IdentStrip freq={r.active} rx={rx} label={`NAV${nav}`} />
    </div>
  );
}

// ---------------------------------------------------------------- mechanical HSI

export function Hsi({ className }: { className?: string | undefined }) {
  const s = useSimSnapshot();
  const engine = useSimEngine();
  const hdg = s.indicated.headingMag;
  const h = s.nav.hsi;
  const gps = h.source === "GPS";
  const color = gps ? "var(--magenta)" : "var(--ok)";
  const dev = clamp(h.cdiDots, -2.5, 2.5) * 16;
  const off = h.toFrom === "OFF";
  return (
    <GaugeFrame
      caption={`HSI — ${gps ? "GPS" : h.source}`}
      explainId="hsi"
      className={className}
      controls={
        <>
          <div className="absolute -bottom-1 -left-1">
            <Knob
              size="sm"
              label="Course (CRS)"
              caption=""
              valueNow={Math.round(h.course)}
              valueMin={0}
              valueMax={359}
              valueText={gps ? "GPS course is set by the flight plan" : `Course ${pad3(h.course)}`}
              onStep={(d, big) => stepCourse(engine, d, big)}
              onPush={() => syncCourse(engine)}
            />
          </div>
          <div className="absolute -right-1 -bottom-1">
            <Knob
              size="sm"
              label="Heading bug"
              caption=""
              valueNow={s.radios.hdgBug}
              valueMin={0}
              valueMax={359}
              valueText={`Heading bug ${pad3(s.radios.hdgBug)}`}
              onStep={(d, big) => stepHeadingBug(engine, d, big)}
              onPush={() => syncHeadingBug(engine)}
            />
          </div>
        </>
      }
    >
      <svg
        viewBox="0 0 200 200"
        className="h-full w-full"
        role="img"
        aria-label={`HSI heading ${pad3(hdg)}, course ${pad3(h.course)}`}
      >
        <GaugeFace />
        {s.indicated.headingValid ? (
          <>
            <g transform={`rotate(${-hdg} 100 100)`}>
              <AzimuthCard r={88} labelR={70} fontSize={13} />
              <g transform={`rotate(${s.radios.hdgBug} 100 100)`}>
                <path
                  d="M 93 11 h 14 v 9 h -4 l -3 -4 l -3 4 h -4 Z"
                  fill="var(--cyan)"
                  stroke="black"
                  strokeWidth={0.5}
                />
              </g>
            </g>
            <g transform={`rotate(${h.course - hdg} 100 100)`}>
              <polygon points="100,26 93,40 107,40" fill={color} stroke="black" strokeWidth={0.6} />
              <rect x={98} y={40} width={4} height={24} fill={color} />
              <rect x={98} y={136} width={4} height={36} fill={color} />
              {[-2, -1, 1, 2].map((d) => (
                <circle
                  key={d}
                  cx={100 + d * 16}
                  cy={100}
                  r={3}
                  fill="none"
                  stroke={WHITE}
                  strokeWidth={1.2}
                />
              ))}
              {!off ? <rect x={100 + dev - 2.5} y={66} width={5} height={68} fill={color} /> : null}
              {!off ? (
                <polygon
                  points={h.toFrom === "TO" ? "122,74 116,84 128,84" : "122,126 116,116 128,116"}
                  fill={WHITE}
                />
              ) : null}
            </g>
            {off ? <Flag x={70} y={78} text="NAV" /> : null}
            {h.gsValid ? (
              <g>
                {[-2, -1, 1, 2].map((d) => (
                  <circle
                    key={d}
                    cx={178}
                    cy={100 + d * 14}
                    r={2.5}
                    fill="none"
                    stroke={WHITE}
                    strokeWidth={1}
                  />
                ))}
                <polygon
                  points={`178,${100 - clamp(h.gsDots, -2.5, 2.5) * 14 - 6} 184,${100 - clamp(h.gsDots, -2.5, 2.5) * 14} 178,${100 - clamp(h.gsDots, -2.5, 2.5) * 14 + 6} 172,${100 - clamp(h.gsDots, -2.5, 2.5) * 14}`}
                  fill={color}
                />
              </g>
            ) : null}
            <path
              d="M 100 88 L 102 98 L 114 101 L 114 104 L 102 103 L 101 112 L 105 115 L 95 115 L 99 112 L 98 103 L 86 104 L 86 101 L 98 98 Z"
              fill="#ff8a1f"
            />
          </>
        ) : (
          <Flag x={100} y={100} text="HDG FAIL" />
        )}
        <polygon points="100,12 95,2 105,2" fill="#ff8a1f" />
        <text x={30} y={22} fill={color} fontSize={10} fontFamily={MONO} fontWeight={700}>
          {gps ? "GPS" : `${h.label}${h.source === "NAV1" ? 1 : 2}`}
        </text>
        <GaugeGlass />
      </svg>
    </GaugeFrame>
  );
}

// ---------------------------------------------------------------- ADF

export function AdfIndicator({ className }: { className?: string | undefined }) {
  const s = useSimSnapshot();
  const [card, setCard] = useState(0);
  const adf = s.nav.adf;
  const rel = adf.relBearing;
  const brgMag = norm360(s.indicated.headingMag + rel);
  return (
    <div className={cn("flex flex-col items-center", className)}>
      <GaugeFrame
        caption="ADF"
        explainId="adf"
        className="w-full"
        controls={
          <div className="absolute -bottom-1 -left-1">
            <Knob
              size="sm"
              label="ADF card (HDG)"
              caption=""
              valueNow={card}
              valueMin={0}
              valueMax={359}
              valueText={`Card ${pad3(card)}. Push to align with heading`}
              onStep={(d, big) => setCard((c) => norm360(c + d * (big ? 10 : 1)))}
              onPush={() => setCard(Math.round(s.indicated.headingMag))}
            />
          </div>
        }
      >
        <svg
          viewBox="0 0 200 200"
          className="h-full w-full"
          role="img"
          aria-label={`ADF relative bearing ${Math.round(rel)}`}
        >
          <GaugeFace />
          <g transform={`rotate(${-card} 100 100)`}>
            <AzimuthCard r={88} labelR={72} />
          </g>
          <polygon points="100,14 94,4 106,4" fill="#ff8a1f" />
          <g transform={`rotate(${rel} 100 100)`}>
            <path
              d="M 100 20 L 108 40 L 102 40 L 102 168 L 98 168 L 98 40 L 92 40 Z"
              fill="#ffd21f"
              stroke="black"
              strokeWidth={0.6}
            />
          </g>
          <circle cx={100} cy={100} r={6} fill="#2a2d31" stroke="#555" />
          {!adf.valid ? <Flag x={100} y={140} text="NO SIG" /> : null}
          <GaugeGlass />
        </svg>
      </GaugeFrame>
      <div className="mt-1.5 flex w-full items-center justify-between rounded-md border border-white/10 bg-black px-2 py-1 font-mono text-[11px]">
        <span className="text-white/55">ADF</span>
        <span className="text-ok tabular">{s.radios.adfKhz} kHz</span>
        <span className={adf.valid ? "font-semibold text-ok" : "text-white/30"}>
          {adf.valid ? adf.ident : "---"}
        </span>
        <span className="text-white/60 tabular">{adf.valid ? `MB ${pad3(brgMag)}°` : ""}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- DME

export function DmeReadout({ nav: initialNav = 1, className }: NavIndicatorProps) {
  const s = useSimSnapshot();
  const [nav, setNav] = useState<1 | 2>(initialNav);
  const rx = nav === 1 ? s.nav.nav1 : s.nav.nav2;
  const tracker = useRef<{ n: number; f: ReturnType<typeof makeRateTracker> }>({
    n: nav,
    f: makeRateTracker(2),
  });
  if (tracker.current.n !== nav) tracker.current = { n: nav, f: makeRateTracker(2) };
  const rate = rx.dmeValid ? tracker.current.f(rx.dmeNm, s.aircraft.simTimeSec) : 0;
  const kt = Math.abs(rate * 3600);
  const closing = rate < -0.0005;
  const min = closing && kt > 20 ? (rx.dmeNm / kt) * 60 : 0;
  const cell = (label: string, value: string, unit: string) => (
    <div className="flex flex-col items-center rounded border border-white/5 bg-black/70 px-2 py-1.5">
      <span className="font-mono text-xl font-semibold text-[#ff5a3c] tabular [text-shadow:0_0_8px_oklch(0.65_0.22_27/0.6)] sm:text-2xl">
        {value}
      </span>
      <span className="text-[9px] tracking-widest text-white/50 uppercase" title={label}>
        {unit}
      </span>
    </div>
  );
  return (
    <div className={cn("rounded-xl border border-white/10 bg-bezel p-2", className)}>
      <div className="mb-1.5 flex items-center justify-between px-1">
        <span className="text-[10px] font-semibold tracking-[0.2em] text-white/45 uppercase">
          DME
        </span>
        <div className="flex items-center gap-1">
          {([1, 2] as const).map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setNav(n)}
              aria-pressed={nav === n}
              className={cn(
                "rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold",
                nav === n ? "bg-ok/20 text-ok" : "text-white/50 hover:text-white",
              )}
            >
              N{n}
            </button>
          ))}
          <ExplainButton id="dme" label="DME" />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        {cell("dist", rx.dmeValid ? rx.dmeNm.toFixed(1) : "---", "nm")}
        {cell("gs", rx.dmeValid ? String(Math.round(kt)) : "---", "kt")}
        {cell(
          "time",
          rx.dmeValid && min > 0 ? (min > 99 ? "99+" : String(Math.round(min))) : "---",
          "min",
        )}
      </div>
      <p className="mt-1 px-1 font-mono text-[10px] text-white/40">
        {rx.dmeValid
          ? `${rx.ident} ${closing ? "inbound" : "outbound"} · ETE ${fmtEte(min)}`
          : rx.valid
            ? `${rx.ident}: no DME paired`
            : "No DME station tuned"}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------- ILS

/** ILS indicator: localizer & glideslope needles and marker beacon lights. */
export function IlsIndicator({ nav = 1, className }: NavIndicatorProps) {
  const s = useSimSnapshot();
  const rx = nav === 1 ? s.nav.nav1 : s.nav.nav2;
  const r = nav === 1 ? s.radios.nav1 : s.radios.nav2;
  const loc = rx.kind === "ILS" && rx.valid;
  const dev = clamp(loc ? rx.cdiDots : 0, -2.5, 2.5) * DOT;
  const gs = clamp(rx.gsValid ? rx.gsDots : 0, -2.5, 2.5) * DOT;
  const m = s.nav.marker;
  const lamp = (on: boolean, label: string, color: string) => (
    <div className="flex flex-col items-center gap-0.5">
      <span
        className={cn("size-4 rounded-full border border-black", on && "animate-annunciator")}
        style={{
          background: on ? color : "oklch(0.22 0.01 258)",
          boxShadow: on ? `0 0 10px ${color}` : undefined,
        }}
      />
      <span className="font-mono text-[9px] text-white/50">{label}</span>
    </div>
  );
  return (
    <div className={cn("flex flex-col items-center", className)}>
      <GaugeFrame caption={`ILS — NAV ${nav}`} explainId="ils" className="w-full">
        <svg
          viewBox="0 0 200 200"
          className="h-full w-full"
          role="img"
          aria-label={`ILS localizer ${rx.cdiDots.toFixed(1)} dots glideslope ${rx.gsDots.toFixed(1)} dots`}
        >
          <GaugeFace />
          <IlsFace />
          <CdiDots />
          <CdiDots vertical />
          {!loc ? <Flag x={66} y={128} text="LOC" /> : null}
          {!rx.gsValid ? <Flag x={134} y={72} text="GS" /> : null}
          <line
            x1={100 + dev}
            x2={100 + dev}
            y1={40}
            y2={160}
            stroke={WHITE}
            strokeWidth={3.2}
            strokeLinecap="round"
          />
          <line
            x1={40}
            x2={160}
            y1={100 - gs}
            y2={100 - gs}
            stroke={WHITE}
            strokeWidth={3.2}
            strokeLinecap="round"
          />
          <text x={100} y={168} textAnchor="middle" fill="#9aa3ad" fontSize={8} fontFamily={MONO}>
            {rx.kind === "ILS" ? `${rx.ident} · CRS ${pad3(rx.locCourse)}` : "TUNE AN ILS"}
          </text>
          <GaugeGlass />
        </svg>
      </GaugeFrame>
      <div className="mt-1.5 flex w-full items-center justify-between rounded-md border border-white/10 bg-black px-2 py-1">
        <span className="font-mono text-[11px] text-ok tabular">{fmtNav(r.active)}</span>
        <div className="flex gap-3">
          {lamp(m === "OM", "OM", "oklch(0.7 0.16 250)")}
          {lamp(m === "MM", "MM", "var(--caution)")}
          {lamp(m === "IM", "IM", "#f1f3f5")}
        </div>
      </div>
    </div>
  );
}

const IlsFace = memo(function IlsFace() {
  return (
    <g>
      <circle cx={100} cy={100} r={74} fill="#0b0c0e" stroke="#333" />
      <text x={100} y={36} textAnchor="middle" fill="#9aa3ad" fontSize={8} fontFamily={MONO}>
        FLY UP
      </text>
      <text x={34} y={104} textAnchor="middle" fill="#9aa3ad" fontSize={7} fontFamily={MONO}>
        L
      </text>
      <text x={166} y={104} textAnchor="middle" fill="#9aa3ad" fontSize={7} fontFamily={MONO}>
        R
      </text>
    </g>
  );
});

// ---------------------------------------------------------------- group

/** All navigation instruments in a responsive grid (for the "Navigation Instruments" tab). */
export function NavInstrumentsPanel({ className }: { className?: string | undefined }) {
  return (
    <div
      className={cn(
        "grid grid-cols-2 gap-3 rounded-2xl border border-white/5 bg-[oklch(0.17_0.008_258)] p-3 md:grid-cols-3",
        className,
      )}
    >
      <VorIndicator nav={1} />
      <Hsi />
      <VorIndicator nav={2} />
      <IlsIndicator nav={1} />
      <AdfIndicator />
      <div className="col-span-2 flex flex-col justify-center md:col-span-1">
        <DmeReadout nav={1} />
      </div>
    </div>
  );
}
