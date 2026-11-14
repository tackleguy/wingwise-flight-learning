import { useState } from "react";
import { cn } from "@/lib/utils";
import { densityAltitude, isaTempC, pressureAltitude } from "../navmath";
import { C, DiagramLayout, Readout, SliderControl } from "./controls";

export function DensityAltitudeDiagram() {
  const [elev, setElev] = useState(5000);
  const [oat, setOat] = useState(30);
  const [alt, setAlt] = useState(29.82);
  const pa = pressureAltitude(elev, alt);
  const isa = isaTempC(pa);
  const da = densityAltitude(pa, oat);
  const maxFt = 16000;
  const bar = (ft: number) => Math.max(0, Math.min(1, ft / maxFt)) * 200;
  const severity = da - elev > 3000 ? "warning" : da - elev > 1500 ? "caution" : "ok";
  const bars: { label: string; ft: number; color: string }[] = [
    { label: "Field elevation", ft: elev, color: C.muted },
    { label: "Pressure altitude", ft: pa, color: C.primary },
    {
      label: "Density altitude",
      ft: da,
      color: severity === "warning" ? C.warn : severity === "caution" ? C.caution : C.ok,
    },
  ];

  return (
    <DiagramLayout
      stage={
        <svg
          viewBox="0 0 400 260"
          className="h-auto w-full"
          role="img"
          aria-label="Density altitude"
        >
          <rect width="400" height="260" fill={C.panel} />
          {[0, 4000, 8000, 12000, 16000].map((f) => (
            <g key={f}>
              <line
                x1="60"
                x2="390"
                y1={230 - bar(f)}
                y2={230 - bar(f)}
                stroke={C.border}
                strokeWidth="0.6"
              />
              <text x="54" y={233 - bar(f)} fill={C.muted} fontSize="9" textAnchor="end">
                {f.toLocaleString("en-US")}
              </text>
            </g>
          ))}
          {bars.map((b, i) => (
            <g key={b.label}>
              <rect
                x={90 + i * 100}
                y={230 - bar(b.ft)}
                width="60"
                height={bar(b.ft)}
                fill={b.color}
                opacity="0.75"
                rx="2"
              />
              <text
                x={120 + i * 100}
                y={224 - bar(b.ft)}
                fill={C.fg}
                fontSize="10"
                fontWeight="700"
                textAnchor="middle"
              >
                {Math.round(b.ft).toLocaleString("en-US")}
              </text>
              <text x={120 + i * 100} y="246" fill={C.muted} fontSize="9" textAnchor="middle">
                {b.label}
              </text>
            </g>
          ))}
          <text x="10" y="16" fill={C.muted} fontSize="9">
            Feet
          </text>
        </svg>
      }
      controls={
        <>
          <SliderControl
            label="Field elevation"
            value={elev}
            min={0}
            max={10000}
            step={100}
            onChange={setElev}
            format={(v) => `${v.toLocaleString("en-US")} ft`}
          />
          <SliderControl
            label="Outside air temperature"
            value={oat}
            min={-20}
            max={45}
            onChange={setOat}
            format={(v) => `${v} °C`}
          />
          <SliderControl
            label="Altimeter setting"
            value={alt}
            min={28.5}
            max={31}
            step={0.01}
            onChange={setAlt}
            format={(v) => `${v.toFixed(2)} inHg`}
          />
        </>
      }
      info={
        <>
          <div className="grid grid-cols-3 gap-2">
            <Readout
              label="Pressure alt"
              value={`${Math.round(pa).toLocaleString("en-US")} ft`}
              sub={`(29.92 − ${alt.toFixed(2)}) × 1,000`}
            />
            <Readout
              label="ISA temp"
              value={`${isa.toFixed(1)} °C`}
              tone="default"
              sub="15 − 2 °C/1,000 ft"
            />
            <Readout
              label="Density alt"
              value={`${Math.round(da).toLocaleString("en-US")} ft`}
              tone={severity === "ok" ? "ok" : severity}
              sub="PA + 120 × (OAT − ISA)"
            />
          </div>
          <p
            className={cn(
              "text-xs leading-relaxed",
              severity === "warning" ? "text-warning" : "text-muted-foreground",
            )}
          >
            {severity === "warning"
              ? "High density altitude: the airplane performs as if it were more than 3,000 ft higher than the field. Expect a much longer takeoff roll, a reduced climb rate and a higher true airspeed for the same indicated airspeed. Compute performance from the POH."
              : 'Density altitude is pressure altitude corrected for non-standard temperature — the altitude at which the airplane "feels" it is flying. High, hot and humid conditions raise density altitude and reduce engine power, propeller thrust and wing lift.'}
          </p>
        </>
      }
    />
  );
}
