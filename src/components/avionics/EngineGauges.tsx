/**
 * Engine & systems indications (EIS): RPM/N1, manifold pressure, fuel flow, fuel quantity,
 * oil pressure/temperature, bus volts and ammeter — colour bands derived from the aircraft perf.
 */
import { memo } from "react";
import type { AircraftPerf } from "@/lib/data/types";
import { clamp } from "@/lib/geo";
import { cn } from "@/lib/utils";
import { useSimEngine, useSimSnapshot } from "@/sim/react";
import type { SimSnapshot } from "@/sim/types";
import { arcPath, ExplainButton, MONO, polar } from "./common";

type Band = { from: number; to: number; color: string };
interface GaugeSpec {
  key: string;
  label: string;
  unit: string;
  min: number;
  max: number;
  bands: Band[];
  value: (s: SimSnapshot) => number;
  digits: number;
}

const G = "var(--ok)";
const Y = "var(--caution)";
const R = "var(--warning)";

export function engineGaugeSpecs(p: AircraftPerf): GaugeSpec[] {
  const jet = p.powerType === "jet";
  const turboprop = p.powerType === "turboprop";
  const maxRpm = turboprop ? 1700 : 2700;
  const ffMax = Math.ceil((p.fuelBurnFullGph * 1.25) / 5) * 5;
  const tank = p.usableFuelGal / 2;
  const specs: GaugeSpec[] = [
    jet
      ? {
          key: "n1",
          label: "N1",
          unit: "%",
          min: 0,
          max: 110,
          bands: [
            { from: 20, to: 100, color: G },
            { from: 100, to: 110, color: R },
          ],
          value: (s) => s.aircraft.rpm,
          digits: 1,
        }
      : {
          key: "rpm",
          label: "RPM",
          unit: "",
          min: 0,
          max: maxRpm + 300,
          bands: [
            { from: turboprop ? 1050 : 2100, to: maxRpm, color: G },
            { from: maxRpm, to: maxRpm + 300, color: R },
          ],
          value: (s) => s.aircraft.rpm,
          digits: 0,
        },
  ];
  if (p.powerType === "piston") {
    specs.push({
      key: "mp",
      label: "MAN",
      unit: "inHg",
      min: 10,
      max: 40,
      bands: [
        { from: 15, to: 30, color: G },
        { from: 30, to: 40, color: Y },
      ],
      value: (s) => s.aircraft.manifoldInHg,
      digits: 1,
    });
  }
  specs.push(
    {
      key: "ff",
      label: "FFLOW",
      unit: "GPH",
      min: 0,
      max: ffMax,
      bands: [{ from: 0, to: p.fuelBurnFullGph, color: G }],
      value: (s) => s.aircraft.fuelFlowGph,
      digits: 1,
    },
    {
      key: "oilp",
      label: "OIL PRES",
      unit: "PSI",
      min: 0,
      max: 120,
      bands: [
        { from: 0, to: 20, color: R },
        { from: 20, to: 50, color: Y },
        { from: 50, to: 90, color: G },
        { from: 100, to: 120, color: R },
      ],
      value: (s) => s.aircraft.oilPressPsi,
      digits: 0,
    },
    {
      key: "oilt",
      label: "OIL TEMP",
      unit: "°F",
      min: 50,
      max: 260,
      bands: [
        { from: 100, to: 245, color: G },
        { from: 245, to: 260, color: R },
      ],
      value: (s) => s.aircraft.oilTempF,
      digits: 0,
    },
    {
      key: "fl",
      label: "FUEL L",
      unit: "GAL",
      min: 0,
      max: tank,
      bands: [
        { from: 0, to: tank * 0.1, color: R },
        { from: tank * 0.1, to: tank * 0.2, color: Y },
        { from: tank * 0.2, to: tank, color: G },
      ],
      value: (s) => s.aircraft.fuelLeftGal,
      digits: 1,
    },
    {
      key: "fr",
      label: "FUEL R",
      unit: "GAL",
      min: 0,
      max: tank,
      bands: [
        { from: 0, to: tank * 0.1, color: R },
        { from: tank * 0.1, to: tank * 0.2, color: Y },
        { from: tank * 0.2, to: tank, color: G },
      ],
      value: (s) => s.aircraft.fuelRightGal,
      digits: 1,
    },
    {
      key: "volts",
      label: "BUS VOLTS",
      unit: "V",
      min: 18,
      max: 32,
      bands: [
        { from: 18, to: 24, color: R },
        { from: 24, to: 26.5, color: Y },
        { from: 26.5, to: 29.5, color: G },
        { from: 29.5, to: 32, color: R },
      ],
      value: (s) => s.aircraft.busVolts,
      digits: 1,
    },
    {
      key: "amps",
      label: "BATT AMPS",
      unit: "A",
      min: -40,
      max: 40,
      bands: [
        { from: -40, to: -3, color: Y },
        { from: -3, to: 40, color: G },
      ],
      value: (s) => s.aircraft.ammeterA,
      digits: 0,
    },
  );
  return specs;
}

function bandColor(spec: GaugeSpec, v: number): string {
  for (const b of spec.bands)
    if (v >= b.from && v <= b.to) return b.color === G ? "#f1f3f5" : b.color;
  return "#f1f3f5";
}

const BarScale = memo(function BarScale({ spec }: { spec: GaugeSpec }) {
  const x = (v: number) =>
    8 + ((clamp(v, spec.min, spec.max) - spec.min) / (spec.max - spec.min)) * 184;
  return (
    <g>
      <rect x={8} y={22} width={184} height={6} fill="#1b1e22" />
      {spec.bands.map((b, i) => (
        <rect
          key={i}
          x={x(b.from)}
          y={22}
          width={Math.max(0, x(b.to) - x(b.from))}
          height={6}
          fill={b.color}
        />
      ))}
    </g>
  );
});

/** Horizontal bar gauge (G1000-style EIS). */
export function BarGauge({ spec, value }: { spec: GaugeSpec; value: number }) {
  const x = 8 + ((clamp(value, spec.min, spec.max) - spec.min) / (spec.max - spec.min)) * 184;
  const fill = bandColor(spec, value);
  return (
    <svg
      viewBox="0 0 200 36"
      className="block h-auto w-full"
      role="img"
      aria-label={`${spec.label} ${value.toFixed(spec.digits)} ${spec.unit}`}
    >
      <text x={8} y={15} fill="#c8ced6" fontSize={11} fontFamily={MONO} letterSpacing={0.5}>
        {spec.label}
      </text>
      <text
        x={192}
        y={16}
        textAnchor="end"
        fill={fill}
        fontSize={14}
        fontFamily={MONO}
        fontWeight={700}
      >
        {value.toFixed(spec.digits)}
        <tspan fontSize={9} fill="#9aa3ad">
          {spec.unit ? ` ${spec.unit}` : ""}
        </tspan>
      </text>
      <BarScale spec={spec} />
      <polygon points={`${x},30 ${x - 5},36 ${x + 5},36`} fill="#f1f3f5" />
      <line x1={x} x2={x} y1={19} y2={30} stroke="#f1f3f5" strokeWidth={1.5} />
    </svg>
  );
}

const ArcScale = memo(function ArcScale({ spec }: { spec: GaugeSpec }) {
  const a = (v: number) =>
    -130 + ((clamp(v, spec.min, spec.max) - spec.min) / (spec.max - spec.min)) * 260;
  return (
    <g>
      <path d={arcPath(60, 60, 46, -130, 130)} fill="none" stroke="#2a2e33" strokeWidth={7} />
      {spec.bands.map((b, i) => (
        <path
          key={i}
          d={arcPath(60, 60, 46, a(b.from), a(b.to))}
          fill="none"
          stroke={b.color}
          strokeWidth={7}
        />
      ))}
    </g>
  );
});

/** Round arc gauge (used for RPM / MP on the systems page). */
export function ArcGauge({ spec, value }: { spec: GaugeSpec; value: number }) {
  const ang = -130 + ((clamp(value, spec.min, spec.max) - spec.min) / (spec.max - spec.min)) * 260;
  const tip = polar(60, 60, 44, ang);
  return (
    <svg
      viewBox="0 0 120 100"
      className="block h-auto w-full"
      role="img"
      aria-label={`${spec.label} ${value.toFixed(spec.digits)} ${spec.unit}`}
    >
      <ArcScale spec={spec} />
      <line
        x1={60}
        y1={60}
        x2={tip.x}
        y2={tip.y}
        stroke="#f1f3f5"
        strokeWidth={3}
        strokeLinecap="round"
      />
      <circle cx={60} cy={60} r={4} fill="#f1f3f5" />
      <text
        x={60}
        y={86}
        textAnchor="middle"
        fill={bandColor(spec, value)}
        fontSize={16}
        fontFamily={MONO}
        fontWeight={700}
      >
        {value.toFixed(spec.digits)}
      </text>
      <text x={60} y={98} textAnchor="middle" fill="#9aa3ad" fontSize={9} fontFamily={MONO}>
        {spec.label} {spec.unit}
      </text>
    </svg>
  );
}

export interface EngineGaugesProps {
  className?: string | undefined;
  /** "strip" = narrow vertical EIS (MFD left side); "panel" = arc gauges + bars in a grid. */
  layout?: "strip" | "panel" | undefined;
}

export function EngineGauges({ className, layout = "panel" }: EngineGaugesProps) {
  const s = useSimSnapshot();
  const engine = useSimEngine();
  const specs = engineGaugeSpecs(engine.perf);
  if (layout === "strip") {
    return (
      <div
        className={cn("flex flex-col gap-0.5 bg-black px-1 py-1.5", className)}
        aria-label="Engine indication system"
      >
        <div className="mb-0.5 text-center font-mono text-[10px] tracking-[0.2em] text-white/50">
          ENGINE
        </div>
        {specs.map((sp) => (
          <BarGauge key={sp.key} spec={sp} value={sp.value(s)} />
        ))}
      </div>
    );
  }
  const arcs = specs.filter((sp) => sp.key === "rpm" || sp.key === "n1" || sp.key === "mp");
  const bars = specs.filter((sp) => !arcs.includes(sp));
  return (
    <div
      className={cn(
        "@container relative rounded-xl border border-white/10 bg-black p-3",
        className,
      )}
      aria-label="Engine and systems"
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="font-mono text-[10px] tracking-[0.2em] text-white/50">
          ENGINE · SYSTEMS
        </span>
        <ExplainButton id="engine" label="Engine indications" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        {arcs.map((sp) => (
          <ArcGauge key={sp.key} spec={sp} value={sp.value(s)} />
        ))}
      </div>
      <div className="mt-2 grid grid-cols-1 gap-x-4 @md:grid-cols-2">
        {bars.map((sp) => (
          <BarGauge key={sp.key} spec={sp} value={sp.value(s)} />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[10px] text-white/50">
        <span>
          ENGINE{" "}
          {s.aircraft.engineRunning ? (
            <b className="text-ok">RUN</b>
          ) : s.aircraft.engineCranking > 0 ? (
            <b className="text-caution">CRANK</b>
          ) : (
            <b className="text-warning">OFF</b>
          )}
        </span>
        <span>FUEL {(s.aircraft.fuelLeftGal + s.aircraft.fuelRightGal).toFixed(1)} GAL</span>
        <span>
          ENDUR{" "}
          {s.aircraft.fuelFlowGph > 0.5
            ? `${((s.aircraft.fuelLeftGal + s.aircraft.fuelRightGal) / s.aircraft.fuelFlowGph).toFixed(1)} H`
            : "—"}
        </span>
        {s.aircraft.carbIce > 0.05 ? (
          <span className="text-caution">CARB ICE {(s.aircraft.carbIce * 100).toFixed(0)}%</span>
        ) : null}
      </div>
    </div>
  );
}
