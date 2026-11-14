/**
 * Interactive educational chart (SVG) with pan & zoom. Coordinates are nautical miles from a
 * reference point (see chart-data.ts). NOT FOR NAVIGATION.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Maximize2, Minus, Plus } from "lucide-react";
import { bearingDeg, distanceNm, formatFreq, norm360 } from "@/lib/geo";
import { freqOf } from "@/lib/data/airports";
import {
  AIRSPACE,
  BAY,
  CHART_AIRPORTS,
  CHART_BOUNDS,
  CHART_NAVAIDS,
  COAST,
  POINT_FEATURES,
  SPECIAL_AREAS,
  proj,
  unproj,
  type PracticeTarget,
} from "./chart-data";

export interface ChartPoint {
  label: string;
  lat: number;
  lon: number;
  magVar: number;
}

export interface Layers {
  airspace: boolean;
  navaids: boolean;
  special: boolean;
  points: boolean;
  labels: boolean;
}

const BLUE = "oklch(0.66 0.14 250)";
const MAG = "oklch(0.66 0.22 335)";
const LAND = "oklch(0.215 0.018 120)";
const WATER = "oklch(0.24 0.045 235)";

const pts = (arr: [number, number][]) =>
  arr
    .map(([la, lo]) => {
      const p = proj(la, lo);
      return `${p.x},${p.y}`;
    })
    .join(" ");

function dm(v: number) {
  const t = Math.round(v * 60);
  return `${Math.floor(t / 60)}°${String(t % 60).padStart(2, "0")}`;
}

function fullView() {
  const a = proj(CHART_BOUNDS.maxLat, CHART_BOUNDS.minLon);
  const b = proj(CHART_BOUNDS.minLat, CHART_BOUNDS.maxLon);
  return { x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y };
}

export function BayChart({
  route = [],
  onClickPoint,
  measure,
  highlight,
  layers,
  cursor = "crosshair",
  className,
  overlay,
}: {
  route?: ChartPoint[];
  onClickPoint?: ((p: ChartPoint) => void) | undefined;
  measure?: { a?: ChartPoint | undefined; b?: ChartPoint | undefined };
  highlight?: PracticeTarget | null;
  layers: Layers;
  cursor?: string;
  className?: string;
  overlay?: ReactNode;
}) {
  const full = useMemo(fullView, []);
  const [vb, setVb] = useState(full);
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{ x: number; y: number; vb: typeof vb; moved: boolean } | null>(null);

  const toChart = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return null;
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const r = pt.matrixTransform(ctm.inverse());
    return { x: r.x, y: r.y };
  }, []);

  const zoomAt = useCallback(
    (factor: number, cx?: number, cy?: number) => {
      setVb((v) => {
        const w = Math.min(full.w * 1.6, Math.max(6, v.w * factor));
        const h = (w / v.w) * v.h;
        const px = cx ?? v.x + v.w / 2;
        const py = cy ?? v.y + v.h / 2;
        return { x: px - ((px - v.x) * w) / v.w, y: py - ((py - v.y) * h) / v.h, w, h };
      });
    },
    [full.w],
  );

  // Non-passive wheel listener so the page doesn't scroll while zooming the chart.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const p = toChart(e.clientX, e.clientY);
      zoomAt(e.deltaY > 0 ? 1.15 : 1 / 1.15, p?.x, p?.y);
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, [toChart, zoomAt]);

  const snap = (x: number, y: number): ChartPoint => {
    const ll = unproj(x, y);
    const snapNm = vb.w * 0.02;
    let best: { d: number; p: ChartPoint } | null = null;
    const consider = (label: string, lat: number, lon: number, magVar: number) => {
      const d = distanceNm(ll.lat, ll.lon, lat, lon);
      if (d <= snapNm && (!best || d < best.d)) best = { d, p: { label, lat, lon, magVar } };
    };
    for (const a of CHART_AIRPORTS) consider(a.icao, a.lat, a.lon, a.magVar);
    for (const n of CHART_NAVAIDS) consider(n.id, n.lat, n.lon, 13);
    for (const f of POINT_FEATURES)
      if (f.kind !== "obstacle")
        consider(f.kind === "waypoint" ? f.name : f.name, f.lat, f.lon, 13);
    const b = best as { d: number; p: ChartPoint } | null;
    if (b) return b.p;
    return {
      label: `${ll.lat.toFixed(3)},${ll.lon.toFixed(3)}`,
      lat: ll.lat,
      lon: ll.lon,
      magVar: 13,
    };
  };

  const fs = vb.w * 0.013;
  const sw = vb.w * 0.0018;
  const showLabels = layers.labels;

  const routeXY = route.map((p) => ({ ...p, ...proj(p.lat, p.lon) }));
  const ma = measure?.a ? proj(measure.a.lat, measure.a.lon) : null;
  const mb = measure?.b ? proj(measure.b.lat, measure.b.lon) : null;

  // graticule every 10'
  const grid: ReactNode[] = [];
  for (let lat = Math.ceil(CHART_BOUNDS.minLat * 6) / 6; lat <= CHART_BOUNDS.maxLat; lat += 1 / 6) {
    const a = proj(lat, CHART_BOUNDS.minLon);
    const b = proj(lat, CHART_BOUNDS.maxLon);
    const whole = Math.abs(lat * 2 - Math.round(lat * 2)) < 1e-6;
    grid.push(
      <line
        key={`la${lat.toFixed(3)}`}
        x1={a.x}
        y1={a.y}
        x2={b.x}
        y2={b.y}
        stroke="oklch(1 0 0 / 0.08)"
        strokeWidth={whole ? sw * 1.2 : sw * 0.6}
      />,
    );
    if (whole)
      grid.push(
        <text
          key={`lat${lat}`}
          x={vb.x + fs * 0.4}
          y={a.y - fs * 0.3}
          fontSize={fs * 0.75}
          fill="oklch(0.7 0.02 250)"
          fontFamily="var(--font-mono)"
        >
          {dm(lat)}'N
        </text>,
      );
  }
  for (let lon = Math.ceil(CHART_BOUNDS.minLon * 6) / 6; lon <= CHART_BOUNDS.maxLon; lon += 1 / 6) {
    const a = proj(CHART_BOUNDS.maxLat, lon);
    const b = proj(CHART_BOUNDS.minLat, lon);
    const whole = Math.abs(lon * 2 - Math.round(lon * 2)) < 1e-6;
    grid.push(
      <line
        key={`lo${lon.toFixed(3)}`}
        x1={a.x}
        y1={a.y}
        x2={b.x}
        y2={b.y}
        stroke="oklch(1 0 0 / 0.08)"
        strokeWidth={whole ? sw * 1.2 : sw * 0.6}
      />,
    );
    if (whole)
      grid.push(
        <text
          key={`lon${lon}`}
          x={a.x + fs * 0.3}
          y={vb.y + vb.h - fs * 0.5}
          fontSize={fs * 0.75}
          fill="oklch(0.7 0.02 250)"
          fontFamily="var(--font-mono)"
        >
          {dm(Math.abs(lon))}'W
        </text>,
      );
  }

  const ocean = [
    ...COAST,
    [CHART_BOUNDS.minLat - 1, CHART_BOUNDS.minLon - 1] as [number, number],
    [CHART_BOUNDS.maxLat + 1, CHART_BOUNDS.minLon - 1] as [number, number],
  ];
  const scaleNm = vb.w > 60 ? 10 : vb.w > 25 ? 5 : 2;

  return (
    <div className={`relative overflow-hidden rounded-md border ${className ?? ""}`}>
      <svg
        ref={svgRef}
        viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
        preserveAspectRatio="xMidYMid meet"
        className="block h-full w-full touch-none select-none"
        style={{ cursor: drag.current?.moved ? "grabbing" : cursor, background: LAND }}
        role="img"
        aria-label="Educational chart of the San Francisco Bay Area"
        onPointerDown={(e) => {
          (e.target as Element).setPointerCapture?.(e.pointerId);
          drag.current = { x: e.clientX, y: e.clientY, vb, moved: false };
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          const dxPx = e.clientX - d.x;
          const dyPx = e.clientY - d.y;
          if (!d.moved && Math.hypot(dxPx, dyPx) < 5) return;
          d.moved = true;
          const rect = svgRef.current?.getBoundingClientRect();
          if (!rect) return;
          const scale = Math.max(d.vb.w / rect.width, d.vb.h / rect.height);
          setVb({ ...d.vb, x: d.vb.x - dxPx * scale, y: d.vb.y - dyPx * scale });
        }}
        onPointerUp={(e) => {
          const d = drag.current;
          drag.current = null;
          if (d && !d.moved && onClickPoint) {
            const p = toChart(e.clientX, e.clientY);
            if (p) onClickPoint(snap(p.x, p.y));
          }
        }}
        onPointerCancel={() => (drag.current = null)}
      >
        <defs>
          <pattern
            id="hatch-r"
            width={1.2}
            height={1.2}
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <line x1={0} y1={0} x2={0} y2={1.2} stroke={BLUE} strokeWidth={0.35} opacity={0.6} />
          </pattern>
          <pattern
            id="hatch-m"
            width={1.2}
            height={1.2}
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <line x1={0} y1={0} x2={0} y2={1.2} stroke={MAG} strokeWidth={0.35} opacity={0.45} />
          </pattern>
        </defs>
        <polygon points={pts(ocean)} fill={WATER} />
        <polygon points={pts(BAY)} fill={WATER} />
        {grid}

        {layers.special
          ? SPECIAL_AREAS.map((a) => {
              const c = a.kind === "restricted" ? BLUE : MAG;
              const cen = a.pts.reduce(
                (acc, p) => ({
                  lat: acc.lat + p[0] / a.pts.length,
                  lon: acc.lon + p[1] / a.pts.length,
                }),
                { lat: 0, lon: 0 },
              );
              const cp = proj(cen.lat, cen.lon);
              return (
                <g key={a.id}>
                  <polygon
                    points={pts(a.pts)}
                    fill={`url(#hatch-${a.kind === "restricted" ? "r" : "m"})`}
                    stroke={c}
                    strokeWidth={sw * 2}
                  />
                  {showLabels ? (
                    <text
                      x={cp.x}
                      y={cp.y}
                      fontSize={fs * 0.8}
                      textAnchor="middle"
                      fill={c}
                      fontWeight={700}
                    >
                      {a.name}
                    </text>
                  ) : null}
                </g>
              );
            })
          : null}

        {layers.airspace
          ? AIRSPACE.map((s) => {
              const c = proj(s.lat, s.lon);
              const color = s.cls === "C" ? MAG : BLUE;
              return (
                <g key={s.id}>
                  {s.rings.map((r, i) => {
                    const lp = {
                      x: c.x + r.rNm * Math.cos(-Math.PI / 4),
                      y: c.y + r.rNm * Math.sin(-Math.PI / 4),
                    };
                    const lines = r.label.split("\n");
                    return (
                      <g key={i}>
                        <circle
                          cx={c.x}
                          cy={c.y}
                          r={r.rNm}
                          fill="none"
                          stroke={color}
                          strokeWidth={s.cls === "D" ? sw * 1.5 : sw * (i === 0 ? 3 : 2)}
                          strokeDasharray={s.cls === "D" ? `${fs * 0.5} ${fs * 0.35}` : undefined}
                          opacity={0.85}
                        />
                        {showLabels && vb.w < 80 ? (
                          <text
                            x={lp.x}
                            y={lp.y}
                            fontSize={fs * 0.7}
                            fill={color}
                            textAnchor="middle"
                            fontFamily="var(--font-mono)"
                            fontWeight={700}
                          >
                            {lines.length === 2 ? (
                              <>
                                <tspan x={lp.x} dy={-fs * 0.1}>
                                  {lines[0]}
                                </tspan>
                                <tspan
                                  x={lp.x}
                                  dy={fs * 0.75}
                                  style={{ textDecoration: "overline" }}
                                >
                                  {lines[1]}
                                </tspan>
                              </>
                            ) : (
                              lines[0]
                            )}
                          </text>
                        ) : null}
                      </g>
                    );
                  })}
                </g>
              );
            })
          : null}

        {layers.navaids
          ? CHART_NAVAIDS.map((n) => {
              const c = proj(n.lat, n.lon);
              const R = 5;
              const ticks: ReactNode[] = [];
              for (let d = 0; d < 360; d += 10) {
                const a = ((d + n.magVar - 90) * Math.PI) / 180; // rose aligned to magnetic north
                const len = d % 30 === 0 ? 0.7 : 0.35;
                ticks.push(
                  <line
                    key={d}
                    x1={c.x + Math.cos(a) * R}
                    y1={c.y + Math.sin(a) * R}
                    x2={c.x + Math.cos(a) * (R - len)}
                    y2={c.y + Math.sin(a) * (R - len)}
                    stroke={BLUE}
                    strokeWidth={sw * 0.9}
                  />,
                );
              }
              const mn = ((n.magVar - 90) * Math.PI) / 180;
              const hex = Array.from({ length: 6 }, (_, i) => {
                const a = (i * 60 * Math.PI) / 180;
                return `${c.x + Math.cos(a) * 0.55},${c.y + Math.sin(a) * 0.55}`;
              }).join(" ");
              return (
                <g key={n.id}>
                  <circle
                    cx={c.x}
                    cy={c.y}
                    r={R}
                    fill="none"
                    stroke={BLUE}
                    strokeWidth={sw}
                    opacity={0.8}
                  />
                  {ticks}
                  <line
                    x1={c.x}
                    y1={c.y}
                    x2={c.x + Math.cos(mn) * R}
                    y2={c.y + Math.sin(mn) * R}
                    stroke={BLUE}
                    strokeWidth={sw * 1.2}
                    markerEnd=""
                  />
                  {n.type === "VOR-DME" ? (
                    <rect
                      x={c.x - 0.75}
                      y={c.y - 0.6}
                      width={1.5}
                      height={1.2}
                      fill="none"
                      stroke={BLUE}
                      strokeWidth={sw * 1.2}
                    />
                  ) : null}
                  <polygon points={hex} fill="none" stroke={BLUE} strokeWidth={sw * 1.3} />
                  {n.type === "VORTAC"
                    ? [30, 150, 270].map((d) => {
                        const a = (d * Math.PI) / 180;
                        return (
                          <rect
                            key={d}
                            x={c.x + Math.cos(a) * 0.75 - 0.22}
                            y={c.y + Math.sin(a) * 0.75 - 0.22}
                            width={0.44}
                            height={0.44}
                            fill={BLUE}
                            transform={`rotate(${d + 90} ${c.x + Math.cos(a) * 0.75} ${c.y + Math.sin(a) * 0.75})`}
                          />
                        );
                      })
                    : null}
                  <circle cx={c.x} cy={c.y} r={0.12} fill={BLUE} />
                  {showLabels && vb.w < 80 ? (
                    <g transform={`translate(${c.x + R * 0.75} ${c.y - R * 0.95})`}>
                      <rect
                        x={-0.2}
                        y={-fs * 0.85}
                        width={fs * 6.2}
                        height={fs * 2.1}
                        fill="oklch(0.16 0.02 250 / 0.9)"
                        stroke={BLUE}
                        strokeWidth={sw}
                      />
                      <text x={fs * 0.15} y={0} fontSize={fs * 0.7} fill={BLUE} fontWeight={700}>
                        {n.name.toUpperCase()}
                      </text>
                      <text
                        x={fs * 0.15}
                        y={fs * 0.95}
                        fontSize={fs * 0.7}
                        fill={BLUE}
                        fontFamily="var(--font-mono)"
                      >
                        {n.freq ? formatFreq(n.freq) : ""} {n.id}
                      </text>
                    </g>
                  ) : null}
                </g>
              );
            })
          : null}

        {CHART_AIRPORTS.map((a) => {
          const c = proj(a.lat, a.lon);
          const color = a.towered ? BLUE : MAG;
          const r = 1.15;
          const ct = freqOf(a, "TWR") ?? freqOf(a, "CTAF");
          const longest = Math.max(...a.runways.map((x) => x.lengthFt));
          return (
            <g key={a.icao}>
              <circle
                cx={c.x}
                cy={c.y}
                r={r}
                fill="oklch(0.18 0.02 250)"
                stroke={color}
                strokeWidth={sw * 2}
              />
              {a.runways.map((rw) => {
                const h = ((rw.ends[0].trueHeading - 90) * Math.PI) / 180;
                const l = Math.min(r * 0.85, Math.max(0.35, (rw.lengthFt / 6076) * 0.9));
                return (
                  <line
                    key={rw.name}
                    x1={c.x - Math.cos(h) * l}
                    y1={c.y - Math.sin(h) * l}
                    x2={c.x + Math.cos(h) * l}
                    y2={c.y + Math.sin(h) * l}
                    stroke={color}
                    strokeWidth={sw * 2.6}
                  />
                );
              })}
              {showLabels && vb.w < 150 ? (
                <g>
                  <text
                    x={c.x + r * 1.4}
                    y={c.y - fs * 0.15}
                    fontSize={fs * 0.8}
                    fill={color}
                    fontWeight={700}
                  >
                    {a.name
                      .replace(/ (International |Municipal |Regional |Executive )?Airport/, "")
                      .toUpperCase()}{" "}
                    ({a.icao.slice(1)})
                  </text>
                  {vb.w < 75 ? (
                    <text
                      x={c.x + r * 1.4}
                      y={c.y + fs * 0.75}
                      fontSize={fs * 0.7}
                      fill={color}
                      fontFamily="var(--font-mono)"
                    >
                      {ct ? `${a.towered ? "CT" : "CTAF"}-${formatFreq(ct.mhz)}` : ""}{" "}
                      {a.elevationFt} L {Math.round(longest / 100)}
                    </text>
                  ) : null}
                </g>
              ) : null}
            </g>
          );
        })}

        {layers.points
          ? POINT_FEATURES.map((f) => {
              const c = proj(f.lat, f.lon);
              if (f.kind === "obstacle")
                return (
                  <g key={f.id}>
                    <path
                      d={`M ${c.x - 0.45} ${c.y + 0.3} L ${c.x} ${c.y - 0.9} L ${c.x + 0.45} ${c.y + 0.3}`}
                      fill="none"
                      stroke="oklch(0.85 0.02 250)"
                      strokeWidth={sw * 1.4}
                    />
                    <circle cx={c.x} cy={c.y + 0.05} r={0.1} fill="oklch(0.85 0.02 250)" />
                    {showLabels && vb.w < 120 ? (
                      <text
                        x={c.x + 0.6}
                        y={c.y - 0.3}
                        fontSize={fs * 0.65}
                        fill="oklch(0.85 0.02 250)"
                        fontFamily="var(--font-mono)"
                      >
                        {f.name}
                      </text>
                    ) : null}
                  </g>
                );
              if (f.kind === "checkpoint")
                return (
                  <g key={f.id}>
                    <line
                      x1={c.x}
                      y1={c.y}
                      x2={c.x}
                      y2={c.y - 1.3}
                      stroke={MAG}
                      strokeWidth={sw * 1.4}
                    />
                    <polygon
                      points={`${c.x},${c.y - 1.3} ${c.x + 0.9},${c.y - 1.05} ${c.x},${c.y - 0.8}`}
                      fill={MAG}
                    />
                    {showLabels && vb.w < 120 ? (
                      <text x={c.x + 1} y={c.y - 0.6} fontSize={fs * 0.65} fill={MAG}>
                        {f.name}
                      </text>
                    ) : null}
                  </g>
                );
              return (
                <g key={f.id}>
                  <path
                    d={`M ${c.x} ${c.y - 0.8} L ${c.x + 0.18} ${c.y - 0.18} L ${c.x + 0.8} ${c.y} L ${c.x + 0.18} ${c.y + 0.18} L ${c.x} ${c.y + 0.8} L ${c.x - 0.18} ${c.y + 0.18} L ${c.x - 0.8} ${c.y} L ${c.x - 0.18} ${c.y - 0.18} Z`}
                    fill="none"
                    stroke={BLUE}
                    strokeWidth={sw * 1.2}
                  />
                  {showLabels && vb.w < 120 ? (
                    <text
                      x={c.x + 0.9}
                      y={c.y + 0.9}
                      fontSize={fs * 0.65}
                      fill={BLUE}
                      fontFamily="var(--font-mono)"
                    >
                      {f.name}
                    </text>
                  ) : null}
                </g>
              );
            })
          : null}

        {/* route */}
        {routeXY.length > 1 ? (
          <polyline
            points={routeXY.map((p) => `${p.x},${p.y}`).join(" ")}
            fill="none"
            stroke="var(--color-magenta)"
            strokeWidth={sw * 3.5}
            strokeLinejoin="round"
          />
        ) : null}
        {routeXY.slice(0, -1).map((p, i) => {
          const q = routeXY[i + 1];
          if (!q) return null;
          const tc = bearingDeg(p.lat, p.lon, q.lat, q.lon);
          const d = distanceNm(p.lat, p.lon, q.lat, q.lon);
          const mx = (p.x + q.x) / 2;
          const my = (p.y + q.y) / 2;
          return (
            <g key={`leg${i}`}>
              <rect
                x={mx - fs * 2.2}
                y={my - fs * 0.85}
                width={fs * 4.4}
                height={fs * 1.25}
                rx={fs * 0.2}
                fill="oklch(0.14 0.02 258 / 0.9)"
                stroke="var(--color-magenta)"
                strokeWidth={sw}
              />
              <text
                x={mx}
                y={my}
                fontSize={fs * 0.72}
                fill="white"
                textAnchor="middle"
                fontFamily="var(--font-mono)"
              >
                {String(Math.round(norm360(tc - p.magVar)) || 360).padStart(3, "0")}° {d.toFixed(1)}
              </text>
            </g>
          );
        })}
        {routeXY.map((p, i) => (
          <g key={`rp${i}`}>
            <circle
              cx={p.x}
              cy={p.y}
              r={fs * 0.45}
              fill="var(--color-magenta)"
              stroke="white"
              strokeWidth={sw}
            />
            <text
              x={p.x}
              y={p.y + fs * 0.25}
              fontSize={fs * 0.55}
              textAnchor="middle"
              fill="white"
              fontWeight={700}
            >
              {i + 1}
            </text>
          </g>
        ))}

        {/* measure */}
        {ma ? <circle cx={ma.x} cy={ma.y} r={fs * 0.35} fill="var(--color-cyan)" /> : null}
        {ma && mb ? (
          <g>
            <line
              x1={ma.x}
              y1={ma.y}
              x2={mb.x}
              y2={mb.y}
              stroke="var(--color-cyan)"
              strokeWidth={sw * 2.5}
              strokeDasharray={`${fs * 0.6} ${fs * 0.4}`}
            />
            <circle cx={mb.x} cy={mb.y} r={fs * 0.35} fill="var(--color-cyan)" />
          </g>
        ) : null}

        {/* practice highlight */}
        {highlight
          ? (() => {
              const c = proj(highlight.lat, highlight.lon);
              return (
                <g>
                  <circle
                    cx={c.x}
                    cy={c.y}
                    r={highlight.r}
                    fill="oklch(0.82 0.16 78 / 0.15)"
                    stroke="var(--color-caution)"
                    strokeWidth={sw * 3}
                    className="animate-pulse"
                  />
                  <circle
                    cx={c.x}
                    cy={c.y}
                    r={highlight.r * 1.5}
                    fill="none"
                    stroke="var(--color-caution)"
                    strokeWidth={sw * 1.5}
                    strokeDasharray={`${fs * 0.4} ${fs * 0.3}`}
                  />
                </g>
              );
            })()
          : null}

        {/* scale bar */}
        <g transform={`translate(${vb.x + fs} ${vb.y + vb.h - fs * 2.2})`}>
          <rect x={0} y={0} width={scaleNm} height={fs * 0.3} fill="white" />
          <text x={0} y={-fs * 0.35} fontSize={fs * 0.7} fill="white" fontFamily="var(--font-mono)">
            {scaleNm} NM
          </text>
        </g>
      </svg>

      <div className="pointer-events-none absolute top-2 left-2 rounded bg-black/60 px-2 py-1 text-[10px] font-bold tracking-wide text-caution uppercase">
        Educational chart — not for navigation
      </div>
      <div className="absolute top-2 right-2 flex flex-col gap-1">
        <button
          type="button"
          onClick={() => zoomAt(1 / 1.4)}
          className="grid size-8 place-items-center rounded border bg-card/90 hover:bg-accent"
          aria-label="Zoom in"
        >
          <Plus className="size-4" />
        </button>
        <button
          type="button"
          onClick={() => zoomAt(1.4)}
          className="grid size-8 place-items-center rounded border bg-card/90 hover:bg-accent"
          aria-label="Zoom out"
        >
          <Minus className="size-4" />
        </button>
        <button
          type="button"
          onClick={() => setVb(full)}
          className="grid size-8 place-items-center rounded border bg-card/90 hover:bg-accent"
          aria-label="Reset view"
        >
          <Maximize2 className="size-4" />
        </button>
      </div>
      {overlay}
    </div>
  );
}
