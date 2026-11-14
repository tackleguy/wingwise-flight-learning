import { useId, useRef, useState, type PointerEvent } from "react";
import { cn } from "@/lib/utils";
import { norm180, norm360, windTriangle, windComponents } from "@/lib/geo";
import { HOLD_ENTRY_TEXT, holdingEntry, pad3, vorIndication } from "../navmath";
import { ArrowDefs, C, DiagramLayout, Readout, Segmented, SliderControl } from "./controls";
import { CompassRose, lineAt, polar } from "./gauges";

/* ------------------------------------------------------------------------------------------ */
/* Reusable VOR / CDI indicator                                                                */
/* ------------------------------------------------------------------------------------------ */

/** Classic VOR indicator. needleDots: −5…+5 (+ = needle right). */
export function CdiIndicator({ obs, needleDots, flag, size = 180, gsDots }: { obs: number; needleDots: number; flag: "TO" | "FROM" | "OFF"; size?: number; gsDots?: number }) {
  const nd = Math.max(-5, Math.min(5, needleDots));
  return (
    <svg viewBox="-60 -60 120 120" width={size} height={size} role="img" aria-label="Course deviation indicator">
      <circle r="58" fill="oklch(0.22 0.01 258)" stroke="oklch(0.32 0.02 258)" strokeWidth="2" />
      <circle r="52" fill="oklch(0.13 0.01 258)" />
      <g transform={`rotate(${-obs})`}>
        {Array.from({ length: 72 }).map((_, i) => (
          <line key={i} {...lineAt(i * 5, i % 6 === 0 ? 43 : 47, 51)} stroke="#e2e8f0" strokeWidth={i % 6 === 0 ? 1.2 : 0.6} />
        ))}
        {Array.from({ length: 12 }).map((_, i) => {
          const a = i * 30;
          const p = polar(a, 37);
          return (
            <text key={a} x={p.x} y={p.y + 3} fontSize="7" fill="#e2e8f0" textAnchor="middle" transform={`rotate(${a} ${p.x} ${p.y})`}>
              {a === 0 ? "N" : a === 90 ? "E" : a === 180 ? "S" : a === 270 ? "W" : a / 10}
            </text>
          );
        })}
      </g>
      <path d="M0,-52 L-4,-44 L4,-44 Z" fill="#f59e0b" />
      <text y="-27" fill="var(--color-cyan)" fontSize="8" fontFamily="monospace" textAnchor="middle">{pad3(obs)}</text>
      {[-5, -4, -3, -2, -1, 1, 2, 3, 4, 5].map((d) => (
        <circle key={d} cx={d * 5.5} cy="0" r="1.6" fill="none" stroke="#e2e8f0" strokeWidth="0.8" />
      ))}
      <circle r="4" fill="none" stroke="#e2e8f0" strokeWidth="0.8" />
      {gsDots !== undefined ? (
        <>
          {[-4, -2, 2, 4].map((d) => (
            <circle key={d} cx="40" cy={d * 5.5} r="1.6" fill="none" stroke="#e2e8f0" strokeWidth="0.8" />
          ))}
          <line x1="-32" x2="32" y1={Math.max(-5, Math.min(5, gsDots)) * 5.5} y2={Math.max(-5, Math.min(5, gsDots)) * 5.5} stroke="#f8fafc" strokeWidth="2.2" />
        </>
      ) : null}
      <line x1={nd * 5.5} x2={nd * 5.5} y1="-30" y2="30" stroke="#f8fafc" strokeWidth="2.4" />
      <g transform="translate(18 14)">
        {flag === "OFF" ? (
          <rect x="-1" y="-6" width="20" height="10" fill="#dc2626" />
        ) : (
          <path d={flag === "TO" ? "M0,4 L8,-6 L16,4 Z" : "M0,-6 L8,4 L16,-6 Z"} fill="#f8fafc" />
        )}
        <text x="8" y={flag === "FROM" ? 14 : 13} fontSize="6" fill={flag === "OFF" ? "#fca5a5" : "#e2e8f0"} textAnchor="middle" fontWeight="700">
          {flag}
        </text>
      </g>
    </svg>
  );
}

/* ------------------------------------------------------------------------------------------ */
/* VOR / CDI                                                                                   */
/* ------------------------------------------------------------------------------------------ */

function useSvgPointer(onPoint: (x: number, y: number) => void) {
  const ref = useRef<SVGSVGElement>(null);
  const dragging = useRef(false);
  const toSvg = (e: PointerEvent<SVGSVGElement>) => {
    const svg = ref.current;
    const m = svg?.getScreenCTM();
    if (!svg || !m) return null;
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return pt;
  };
  return {
    ref,
    onPointerDown: (e: PointerEvent<SVGSVGElement>) => {
      dragging.current = true;
      e.currentTarget.setPointerCapture(e.pointerId);
      const p = toSvg(e);
      if (p) onPoint(p.x, p.y);
    },
    onPointerMove: (e: PointerEvent<SVGSVGElement>) => {
      if (!dragging.current) return;
      const p = toSvg(e);
      if (p) onPoint(p.x, p.y);
    },
    onPointerUp: () => {
      dragging.current = false;
    },
    onPointerCancel: () => {
      dragging.current = false;
    },
  };
}

export function VorCdiDiagram() {
  const [pos, setPos] = useState({ x: 290, y: 90 });
  const [obs, setObs] = useState(60);
  const [hdg, setHdg] = useState(240);
  const cx = 200;
  const cy = 150;
  const handlers = useSvgPointer((x, y) => setPos({ x: Math.max(10, Math.min(390, x)), y: Math.max(10, Math.min(290, y)) }));
  const dx = pos.x - cx;
  const dy = pos.y - cy;
  const dist = Math.hypot(dx, dy);
  const radial = norm360((Math.atan2(dx, -dy) * 180) / Math.PI);
  const overhead = dist < 10;
  const ind = vorIndication(radial, obs);
  const dots = overhead ? 0 : ind.needleDeg / 2;
  const course = polar(obs, 400);

  return (
    <DiagramLayout
      stage={
        <svg
          viewBox="0 0 400 300"
          className="h-auto w-full touch-none select-none"
          role="img"
          aria-label="Drag the aircraft around the VOR"
          {...handlers}
        >
          <rect width="400" height="300" fill={C.panel} />
          {/* TO / FROM halves */}
          <g transform={`translate(${cx} ${cy}) rotate(${obs})`}>
            <rect x="-400" y="-400" width="800" height="400" fill={C.ok} opacity="0.05" />
            <rect x="-400" y="0" width="800" height="400" fill={C.primary} opacity="0.06" />
            <line x1="-400" y1="0" x2="400" y2="0" stroke={C.muted} strokeDasharray="3 5" />
          </g>
          <g transform={`translate(${cx} ${cy})`}>
            <CompassRose r={110} />
            <line x1={-course.x} y1={-course.y} x2={course.x} y2={course.y} stroke={C.magenta} strokeWidth="1.5" />
            <path d="M-9,0 L-4.5,-8 L4.5,-8 L9,0 L4.5,8 L-4.5,8 Z" fill="none" stroke={C.primary} strokeWidth="2" />
            <circle r="2" fill={C.primary} />
            <text x={polar(obs, 128).x} y={polar(obs, 128).y} fill={C.magenta} fontSize="10" fontWeight="700" textAnchor="middle">{pad3(obs)}° R</text>
          </g>
          <text x={cx + polar(obs + 35, 128).x} y={cy + polar(obs + 35, 128).y} fill={C.ok} fontSize="10" fontWeight="700" textAnchor="middle">FROM</text>
          <text x={cx + polar(obs + 215, 128).x} y={cy + polar(obs + 215, 128).y} fill={C.primary} fontSize="10" fontWeight="700" textAnchor="middle">TO</text>
          {/* radial line to aircraft */}
          <line x1={cx} y1={cy} x2={pos.x} y2={pos.y} stroke={C.cyan} strokeDasharray="2 3" />
          <g transform={`translate(${pos.x} ${pos.y}) rotate(${hdg})`} className="cursor-grab">
            <circle r="16" fill="transparent" />
            <path d="M0,-11 L2,-4 L11,1 L11,3 L2,1 L1,8 L4,10 L4,11 L0,10 L-4,11 L-4,10 L-1,8 L-2,1 L-11,3 L-11,1 L-2,-4 Z" fill={C.cyan} />
          </g>
          <text x="392" y="16" fill={C.muted} fontSize="9" textAnchor="end">Drag the aircraft</text>
        </svg>
      }
      controls={
        <>
          <SliderControl label="OBS (selected course)" value={obs} min={0} max={359} onChange={setObs} format={(v) => `${pad3(v)}°`} />
          <SliderControl label="Aircraft heading (does not affect the CDI)" value={hdg} min={0} max={359} onChange={setHdg} format={(v) => `${pad3(v)}°`} />
        </>
      }
      info={
        <div className="flex flex-col items-center gap-3 sm:flex-row lg:flex-col xl:flex-row">
          <CdiIndicator obs={obs} needleDots={dots} flag={overhead ? "OFF" : ind.flag} size={160} />
          <div className="w-full space-y-2 text-xs">
            <div className="grid grid-cols-2 gap-2">
              <Readout label="On radial" value={`${pad3(radial)}°`} />
              <Readout label="Flag" value={overhead ? "OFF" : ind.flag} tone={ind.flag === "TO" ? "ok" : "cyan"} />
            </div>
            <p className="leading-relaxed text-muted-foreground">
              {overhead
                ? "Over the station the indication is unreliable (cone of confusion) — the flag shows OFF."
                : `You are ${Math.abs(ind.offCourseDeg).toFixed(0)}° off the ${pad3(ind.flag === "FROM" ? obs : obs + 180)} radial. The needle points toward the selected course — ${
                    Math.abs(dots) < 0.25 ? "centered: you are on it." : `fly ${dots > 0 ? "right" : "left"} (with a heading near ${pad3(obs)}°) to intercept.`
                  } Full-scale deflection is 10°, each dot 2°. The CDI does not depend on heading.`}
            </p>
          </div>
        </div>
      }
    />
  );
}

/* ------------------------------------------------------------------------------------------ */
/* HSI                                                                                         */
/* ------------------------------------------------------------------------------------------ */

export function HsiDiagram() {
  const [hdg, setHdg] = useState(30);
  const [crs, setCrs] = useState(90);
  const [dev, setDev] = useState(2);
  const [toFrom, setToFrom] = useState<"TO" | "FROM">("TO");
  const rel = norm180(crs - hdg);
  const devPx = dev * 9;
  const intercept = Math.abs(norm180(crs - hdg));
  const side = dev > 0 ? "right" : dev < 0 ? "left" : null;
  let advice = "Centered: you are on the course.";
  if (side) {
    const turningToward = (side === "right" && norm180(hdg - crs) > 0) || (side === "left" && norm180(hdg - crs) < 0);
    advice = `The course is to your ${side}. ${turningToward ? `Your heading converges with the course at ${intercept.toFixed(0)}° — the deviation bar will move toward center.` : `Turn ${side} to establish an intercept angle (e.g. heading ${pad3(crs + (side === "right" ? 30 : -30))}° for a 30° intercept).`}`;
  }

  return (
    <DiagramLayout
      stage={
        <svg viewBox="-140 -130 280 260" className="h-auto w-full" role="img" aria-label="Horizontal situation indicator">
          <ArrowDefs id="hsi" />
          <rect x="-140" y="-130" width="280" height="260" fill="oklch(0.1 0.01 258)" />
          <circle r="112" fill="oklch(0.13 0.01 258)" stroke="oklch(0.32 0.02 258)" strokeWidth="3" />
          <CompassRose r={108} rotate={hdg} />
          {/* lubber + heading */}
          <path d="M0,-112 L-6,-122 L6,-122 Z" fill="#f59e0b" />
          <text y="-116" dy="-10" fill="#f8fafc" fontSize="11" fontFamily="monospace" textAnchor="middle">{pad3(hdg)}</text>
          {/* course pointer & CDI */}
          <g transform={`rotate(${rel})`}>
            <path d="M0,-86 L-6,-74 L-2,-74 L-2,-52 L2,-52 L2,-74 L6,-74 Z" fill={C.magenta} />
            <rect x="-2" y="52" width="4" height="34" fill={C.magenta} />
            {[-2, -1, 1, 2].map((d) => (
              <circle key={d} cx={d * 18} cy="0" r="3" fill="none" stroke="#e2e8f0" strokeWidth="1.2" />
            ))}
            <rect x={devPx - 2} y="-46" width="4" height="92" fill={C.magenta} />
            <path d={toFrom === "TO" ? "M0,-40 L-7,-30 L7,-30 Z" : "M0,40 L-7,30 L7,30 Z"} fill="#f8fafc" />
          </g>
          {/* aircraft symbol */}
          <path d="M0,-14 L2,-5 L14,1 L14,4 L2,2 L1,10 L5,13 L5,15 L0,14 L-5,15 L-5,13 L-1,10 L-2,2 L-14,4 L-14,1 L-2,-5 Z" fill="#f59e0b" />
          <text x="-132" y="-114" fill={C.magenta} fontSize="10" fontFamily="monospace">CRS {pad3(crs)}</text>
          <text x="132" y="-114" fill={C.muted} fontSize="10" textAnchor="end">2°/dot (VOR)</text>
        </svg>
      }
      controls={
        <>
          <SliderControl label="Heading" value={hdg} min={0} max={359} onChange={setHdg} format={(v) => `${pad3(v)}°`} />
          <SliderControl label="Selected course" value={crs} min={0} max={359} onChange={setCrs} format={(v) => `${pad3(v)}°`} />
          <SliderControl label="Course deviation (− left, + right)" value={dev} min={-2.5} max={2.5} step={0.25} onChange={setDev} format={(v) => `${v > 0 ? "+" : ""}${v} dots`} />
          <Segmented value={toFrom} onChange={setToFrom} options={[{ value: "TO", label: "TO" }, { value: "FROM", label: "FROM" }]} />
        </>
      }
      info={
        <>
          <div className="grid grid-cols-2 gap-2">
            <Readout label="Course − heading" value={`${rel > 0 ? "+" : ""}${rel.toFixed(0)}°`} tone="magenta" />
            <Readout label="Deviation" value={`${Math.abs(dev * 2).toFixed(1)}° ${side ?? ""}`} />
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            The HSI combines a heading indicator with a CDI. The course pointer turns with the compass card, so the deviation bar
            shows a picture of where the course lies relative to the aircraft symbol. {advice}
          </p>
        </>
      }
    />
  );
}

/* ------------------------------------------------------------------------------------------ */
/* ILS                                                                                         */
/* ------------------------------------------------------------------------------------------ */

export function IlsDiagram() {
  const [lat, setLat] = useState(1); // degrees right (+) / left (−) of the localizer
  const [vert, setVert] = useState(0.3); // degrees above (+) / below (−) the glideslope
  const [dist, setDist] = useState(5);
  const locDots = -(lat / 0.5);
  const gsDots = vert / 0.14;
  const ftLat = Math.round(dist * 6076 * Math.tan((lat * Math.PI) / 180));
  const gsAlt = Math.round(dist * 6076 * Math.tan((3 * Math.PI) / 180));
  const ftVert = Math.round(dist * 6076 * (Math.tan(((3 + vert) * Math.PI) / 180) - Math.tan((3 * Math.PI) / 180)));
  const sx = (d: number) => 360 - (d / 10) * 300;
  const sy = (ft: number) => 120 - (ft / 3500) * 100;
  const ty = (ft: number) => 220 + Math.max(-38, Math.min(38, ft / 80));
  const full = Math.abs(locDots) >= 5 || Math.abs(gsDots) >= 5;

  return (
    <DiagramLayout
      stage={
        <svg viewBox="0 0 400 280" className="h-auto w-full" role="img" aria-label="ILS localizer and glideslope">
          <rect width="400" height="280" fill={C.panel} />
          <text x="10" y="16" fill={C.muted} fontSize="9" fontWeight="600">SIDE VIEW — GLIDESLOPE (3°)</text>
          <line x1="40" y1="120" x2="380" y2="120" stroke="oklch(0.6 0.05 60)" />
          <path d={`M${sx(0)},120 L${sx(10)},${sy(10 * 6076 * Math.tan((3.7 * Math.PI) / 180))} L${sx(10)},${sy(10 * 6076 * Math.tan((2.3 * Math.PI) / 180))} Z`} fill={C.ok} opacity="0.12" />
          <line x1={sx(0)} y1="120" x2={sx(10)} y2={sy(10 * 6076 * Math.tan((3 * Math.PI) / 180))} stroke={C.ok} strokeWidth="1.5" />
          <circle cx={sx(dist)} cy={sy(gsAlt + ftVert)} r="5" fill={C.cyan} />
          <text x={sx(dist) + 7} y={sy(gsAlt + ftVert) - 4} fill={C.cyan} fontSize="9">{(gsAlt + ftVert).toLocaleString("en-US")} ft AGL</text>
          <text x="10" y="150" fill={C.muted} fontSize="9" fontWeight="600">TOP VIEW — LOCALIZER</text>
          <path d={`M${sx(0)},220 L${sx(10)},${ty(10 * 6076 * Math.tan((2.5 * Math.PI) / 180))} L${sx(10)},${ty(-10 * 6076 * Math.tan((2.5 * Math.PI) / 180))} Z`} fill={C.ok} opacity="0.12" />
          <line x1={sx(0)} y1="220" x2={sx(10)} y2="220" stroke={C.ok} strokeWidth="1.5" />
          <rect x={sx(0)} y="216" width="22" height="8" fill="#94a3b8" />
          <circle cx={sx(dist)} cy={ty(-ftLat)} r="5" fill={C.cyan} />
          {[0, 2, 4, 6, 8, 10].map((d) => (
            <text key={d} x={sx(d)} y="272" fill={C.muted} fontSize="8.5" textAnchor="middle">{d} NM</text>
          ))}
          <text x="390" y="150" fill={C.muted} fontSize="8.5" textAnchor="end">Approach direction →  runway (right)</text>
        </svg>
      }
      controls={
        <>
          <SliderControl label="Lateral position (− left, + right of course)" value={lat} min={-3} max={3} step={0.1} onChange={setLat} format={(v) => `${v > 0 ? "+" : ""}${v.toFixed(1)}°`} />
          <SliderControl label="Vertical position (− below, + above glideslope)" value={vert} min={-1} max={1} step={0.02} onChange={setVert} format={(v) => `${v > 0 ? "+" : ""}${v.toFixed(2)}°`} />
          <SliderControl label="Distance from threshold" value={dist} min={1} max={10} step={0.5} onChange={setDist} format={(v) => `${v} NM`} />
        </>
      }
      info={
        <div className="flex flex-col items-center gap-3 sm:flex-row lg:flex-col xl:flex-row">
          <CdiIndicator obs={270} needleDots={locDots} flag="TO" gsDots={gsDots} size={160} />
          <div className="w-full space-y-2 text-xs">
            <div className="grid grid-cols-2 gap-2">
              <Readout label="Localizer" value={`${Math.abs(locDots).toFixed(1)} dots ${locDots > 0.05 ? "R" : locDots < -0.05 ? "L" : ""}`} tone={Math.abs(locDots) >= 5 ? "warning" : "cyan"} sub={`${Math.abs(ftLat).toLocaleString("en-US")} ft ${lat >= 0 ? "right" : "left"}`} />
              <Readout label="Glideslope" value={`${Math.abs(gsDots).toFixed(1)} dots ${gsDots > 0.05 ? "↓" : gsDots < -0.05 ? "↑" : ""}`} tone={Math.abs(gsDots) >= 5 ? "warning" : "cyan"} sub={`${Math.abs(ftVert)} ft ${vert >= 0 ? "high" : "low"}`} />
            </div>
            <p className={cn("leading-relaxed", full ? "text-warning" : "text-muted-foreground")}>
              {full
                ? "Full-scale deflection — the aircraft is outside the usable course width. Execute the missed approach if established inside the final approach fix."
                : "Fly toward the needles: a needle left of center means the localizer is to your left; a glideslope needle below center means you are above the glidepath. The localizer is about four times more sensitive than a VOR (≈0.5°/dot here); the glideslope is ±0.7° full scale."}
            </p>
          </div>
        </div>
      }
    />
  );
}

/* ------------------------------------------------------------------------------------------ */
/* Holding pattern entries                                                                     */
/* ------------------------------------------------------------------------------------------ */

function wedge(a0: number, a1: number, r: number) {
  const sweep = norm360(a1 - a0);
  const p0 = polar(a0, r);
  const p1 = polar(a0 + sweep, r);
  return `M0,0 L${p0.x},${p0.y} A${r},${r} 0 ${sweep > 180 ? 1 : 0} 1 ${p1.x},${p1.y} Z`;
}

/** Hold, entry sectors and arriving aircraft (north-up). Reused by the holding-entry exercise. */
export function HoldSketch({ inbound, right, hdg, showSectors = true, fixLabel }: { inbound: number; right: boolean; hdg: number; showSectors?: boolean; fixLabel?: string | undefined }) {
  const id = `hp${useId().replace(/:/g, "")}`;
  const entry = holdingEntry(hdg, inbound, right);
  const C0 = inbound;
  const sectors = right
    ? { parallel: [C0, C0 + 110], teardrop: [C0 + 290, C0 + 360], direct: [C0 + 110, C0 + 290] }
    : { parallel: [C0 - 110, C0], teardrop: [C0, C0 + 70], direct: [C0 + 70, C0 + 250] };
  const colors = HOLD_COLORS;
  const r = 26;
  const L = 80;
  const sx = right ? 1 : -1;
  const track = `M0,0 A${r},${r} 0 0 ${right ? 1 : 0} ${2 * r * sx},0 L${2 * r * sx},${L} A${r},${r} 0 0 ${right ? 1 : 0} 0,${L} Z`;
  const bearingFrom = norm360(hdg + 180);
  const ac = polar(bearingFrom, 125);
  const seventy = right ? C0 + 110 : C0 - 110;
  return (
    <svg viewBox="-160 -150 320 300" className="h-auto w-full" role="img" aria-label="Holding pattern entry sectors">
          <ArrowDefs id={id} />
          <rect x="-160" y="-150" width="320" height="300" fill={C.panel} />
          {(Object.keys(sectors) as (keyof typeof sectors)[]).map((k) => {
            const [a0, a1] = sectors[k];
            return <path key={k} d={wedge(a0 ?? 0, a1 ?? 0, 140)} fill={colors[k]} opacity={showSectors ? (entry === k ? 0.22 : 0.07) : 0} stroke={colors[k]} strokeOpacity={showSectors ? 0.4 : 0} />;
          })}
          {/* 70° line */}
          {showSectors ? (
          <line x1={polar(seventy, 140).x} y1={polar(seventy, 140).y} x2={polar(seventy + 180, 140).x} y2={polar(seventy + 180, 140).y} stroke={C.fg} strokeDasharray="5 4" strokeWidth="1" opacity="0.6" />
          ) : null}
          {/* sector labels */}
          {showSectors && (Object.keys(sectors) as (keyof typeof sectors)[]).map((k) => {
            const [a0, a1] = sectors[k];
            const midA = (a0 ?? 0) + norm360((a1 ?? 0) - (a0 ?? 0)) / 2;
            const p = polar(midA, 100);
            return (
              <text key={k} x={p.x} y={p.y} fill={colors[k]} fontSize="11" fontWeight="700" textAnchor="middle" style={{ textTransform: "uppercase" }}>
                {k}
              </text>
            );
          })}
          {/* hold */}
          <g transform={`rotate(${inbound})`}>
            <path d={track} fill="none" stroke={C.cyan} strokeWidth="2" />
          </g>
          <g transform={`rotate(${inbound})`}>
            <line x1="0" y1={L + 10} x2="0" y2="8" stroke={C.cyan} strokeWidth="2.5" markerEnd={`url(#${id}-cyan)`} />
          </g>
          <path d="M0,-7 L7,6 L-7,6 Z" fill="none" stroke={C.fg} strokeWidth="1.5" />
          {fixLabel ? <text x="10" y="-8" fill={C.fg} fontSize="10" fontWeight="700">{fixLabel}</text> : null}
          {/* aircraft */}
          <line x1={ac.x} y1={ac.y} x2="0" y2="0" stroke={C.fg} strokeDasharray="3 4" opacity="0.6" />
          <g transform={`translate(${ac.x} ${ac.y}) rotate(${hdg})`}>
            <path d="M0,-11 L2,-4 L11,1 L11,3 L2,1 L1,8 L4,10 L4,11 L0,10 L-4,11 L-4,10 L-1,8 L-2,1 L-11,3 L-11,1 L-2,-4 Z" fill={C.fg} />
          </g>
          <text x="-152" y="-136" fill={C.muted} fontSize="9">North up{showSectors ? ` · inbound ${pad3(inbound)}° · ${right ? "right (standard)" : "left (non-standard)"} turns` : ""}</text>
    </svg>
  );
}

const HOLD_COLORS = { direct: C.ok, teardrop: C.caution, parallel: C.magenta };

export function HoldingPatternDiagram() {
  const [inbound, setInbound] = useState(360);
  const [right, setRight] = useState(true);
  const [hdg, setHdg] = useState(135);
  const entry = holdingEntry(hdg, inbound, right);
  const colors = HOLD_COLORS;

  return (
    <DiagramLayout
      stage={<HoldSketch inbound={inbound} right={right} hdg={hdg} />}
      controls={
        <>
          <SliderControl label="Inbound course" value={inbound} min={1} max={360} onChange={setInbound} format={(v) => `${pad3(v)}°`} />
          <SliderControl label="Aircraft heading to the fix" value={hdg} min={1} max={360} onChange={setHdg} format={(v) => `${pad3(v)}°`} />
          <Segmented value={right ? "r" : "l"} onChange={(v) => setRight(v === "r")} options={[{ value: "r", label: "Standard (right)" }, { value: "l", label: "Non-standard (left)" }]} />
        </>
      }
      info={
        <>
          <div className="rounded-md border p-3" style={{ borderColor: colors[entry] }}>
            <div className="label-caps mb-1">Recommended entry</div>
            <p className="text-sm font-semibold capitalize" style={{ color: colors[entry] }}>{entry}</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{HOLD_ENTRY_TEXT[entry]}</p>
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Sectors are based on the aircraft's heading relative to the holding course, divided by a line drawn 70° to the holding
            course through the fix (AIM 5-3-8). Below 6,000 ft MSL, maximum holding speed is 200 KIAS; legs are 1 minute at or below
            14,000 ft MSL. These are recommended, not mandatory, entries.
          </p>
        </>
      }
    />
  );
}

/* ------------------------------------------------------------------------------------------ */
/* Wind triangle                                                                               */
/* ------------------------------------------------------------------------------------------ */

export function WindTriangleDiagram() {
  const [tc, setTc] = useState(90);
  const [tas, setTas] = useState(110);
  const [wdir, setWdir] = useState(30);
  const [wspd, setWspd] = useState(25);
  const w = windTriangle(tc, tas, wdir, wspd);
  const comps = windComponents(tc, wdir, wspd);
  const valid = Number.isFinite(w.heading);
  const scale = 120 / Math.max(tas, valid ? w.groundspeed : tas, 1);
  const hv = polar(valid ? w.heading : tc, tas * scale);
  const wv = polar(wdir + 180, wspd * scale);
  const gv = { x: hv.x + wv.x, y: hv.y + wv.y };
  const ox = -gv.x / 2;
  const oy = -gv.y / 2;

  return (
    <DiagramLayout
      stage={
        <svg viewBox="-150 -140 300 280" className="h-auto w-full" role="img" aria-label="Wind triangle">
          <ArrowDefs id="wt" />
          <rect x="-150" y="-140" width="300" height="280" fill={C.panel} />
          <text x="-142" y="-124" fill={C.muted} fontSize="9">N ↑ — vectors to scale</text>
          {valid ? (
            <g transform={`translate(${ox} ${oy})`}>
              <line x1="0" y1="0" x2={hv.x} y2={hv.y} stroke={C.cyan} strokeWidth="2.5" markerEnd="url(#wt-cyan)" />
              <line x1={hv.x} y1={hv.y} x2={gv.x} y2={gv.y} stroke={C.caution} strokeWidth="2.5" markerEnd="url(#wt-caution)" />
              <line x1="0" y1="0" x2={gv.x} y2={gv.y} stroke={C.magenta} strokeWidth="2.5" markerEnd="url(#wt-magenta)" />
              <text x={hv.x / 2 - 8} y={hv.y / 2 - 8} fill={C.cyan} fontSize="10" fontWeight="600">Heading / TAS</text>
              <text x={(hv.x + gv.x) / 2 + 6} y={(hv.y + gv.y) / 2} fill={C.caution} fontSize="10" fontWeight="600">Wind</text>
              <text x={gv.x / 2 + 6} y={gv.y / 2 + 14} fill={C.magenta} fontSize="10" fontWeight="600">Course / GS</text>
              <circle r="3" fill={C.fg} />
            </g>
          ) : (
            <text x="0" y="0" fill={C.warn} fontSize="11" textAnchor="middle">Crosswind exceeds TAS — no solution</text>
          )}
        </svg>
      }
      controls={
        <>
          <SliderControl label="True course" value={tc} min={0} max={359} onChange={setTc} format={(v) => `${pad3(v)}°`} />
          <SliderControl label="True airspeed" value={tas} min={60} max={200} onChange={setTas} format={(v) => `${v} kt`} />
          <SliderControl label="Wind from (true)" value={wdir} min={0} max={359} step={5} onChange={setWdir} format={(v) => `${pad3(v)}°`} />
          <SliderControl label="Wind speed" value={wspd} min={0} max={50} onChange={setWspd} format={(v) => `${v} kt`} />
        </>
      }
      info={
        <>
          <div className="grid grid-cols-3 gap-2">
            <Readout label="WCA" value={valid ? `${Math.abs(w.wca).toFixed(0)}° ${w.wca > 0.5 ? "R" : w.wca < -0.5 ? "L" : ""}` : "—"} tone="caution" />
            <Readout label="True hdg" value={valid ? `${pad3(w.heading)}°` : "—"} />
            <Readout label="Groundspeed" value={valid ? `${Math.round(w.groundspeed)} kt` : "—"} tone="magenta" />
            <Readout label="Headwind" value={`${comps.headwind >= 0 ? "" : "tail "}${Math.abs(comps.headwind).toFixed(0)} kt`} tone="default" />
            <Readout label="Crosswind" value={`${Math.abs(comps.crosswind).toFixed(0)} kt ${comps.crosswind > 0.5 ? "from R" : comps.crosswind < -0.5 ? "from L" : ""}`} tone="default" />
            <Readout label="Time / 100 NM" value={valid && w.groundspeed > 0 ? `${Math.round((100 / w.groundspeed) * 60)} min` : "—"} tone="default" />
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Point the nose into the wind by the wind correction angle so that heading/TAS plus the wind vector equals the desired
            course over the ground. sin(WCA) = wind × sin(wind angle) ÷ TAS. Then apply magnetic variation (east is least, west is
            best) to get magnetic heading.
          </p>
        </>
      }
    />
  );
}
