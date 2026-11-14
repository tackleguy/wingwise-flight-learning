/**
 * Scaled, north-up SVG airport diagram drawn from runway threshold coordinates.
 * Educational — runway geometry in the dataset is simplified (see AIRPORT_DATA_NOTICE).
 */
import { useMemo } from "react";
import { localOffsetFt, norm360 } from "@/lib/geo";
import type { Airport } from "@/lib/data/types";

export function AirportDiagram({
  airport,
  highlightEnd,
  windFromTrue,
  windKt,
  className,
}: {
  airport: Airport;
  /** Runway end id to highlight (e.g. recommended runway). */
  highlightEnd?: string | undefined;
  windFromTrue?: number | undefined;
  windKt?: number | undefined;
  className?: string;
}) {
  const geo = useMemo(() => {
    const rw = airport.runways.map((r) => {
      const a = localOffsetFt(
        airport.lat,
        airport.lon,
        r.ends[0].threshold.lat,
        r.ends[0].threshold.lon,
      );
      const b = localOffsetFt(
        airport.lat,
        airport.lon,
        r.ends[1].threshold.lat,
        r.ends[1].threshold.lon,
      );
      // SVG: x = east, y = -north
      return { r, a: { x: a.east, y: -a.north }, b: { x: b.east, y: -b.north } };
    });
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const g of rw) {
      for (const p of [g.a, g.b]) {
        minX = Math.min(minX, p.x);
        maxX = Math.max(maxX, p.x);
        minY = Math.min(minY, p.y);
        maxY = Math.max(maxY, p.y);
      }
    }
    if (!Number.isFinite(minX)) {
      minX = -2000;
      maxX = 2000;
      minY = -2000;
      maxY = 2000;
    }
    const span = Math.max(maxX - minX, maxY - minY, 3000);
    const pad = span * 0.22;
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const size = span + pad * 2;
    return { rw, vb: { x: cx - size / 2, y: cy - size / 2, w: size, h: size }, span };
  }, [airport]);

  const { vb, span } = geo;
  const fs = span * 0.032;
  // Scale bar: choose a round length ≈ 1/4 of the span.
  const barOptions = [500, 1000, 2000, 3000, 5000, 10000];
  const bar = barOptions.reduce(
    (best, v) => (Math.abs(v - span / 4) < Math.abs(best - span / 4) ? v : best),
    1000,
  );
  const minWidth = span * 0.012;

  return (
    <svg
      viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
      className={className}
      role="img"
      aria-label={`${airport.icao} airport diagram, north up`}
    >
      <rect x={vb.x} y={vb.y} width={vb.w} height={vb.h} fill="var(--color-panel)" />
      {/* light grid every 1000 ft */}
      <g stroke="oklch(1 0 0 / 0.05)" strokeWidth={span * 0.0015}>
        {Array.from({ length: Math.ceil(vb.w / 1000) + 1 }, (_, i) => {
          const x = Math.floor(vb.x / 1000) * 1000 + i * 1000;
          return <line key={`v${i}`} x1={x} y1={vb.y} x2={x} y2={vb.y + vb.h} />;
        })}
        {Array.from({ length: Math.ceil(vb.h / 1000) + 1 }, (_, i) => {
          const y = Math.floor(vb.y / 1000) * 1000 + i * 1000;
          return <line key={`h${i}`} x1={vb.x} y1={y} x2={vb.x + vb.w} y2={y} />;
        })}
      </g>

      {geo.rw.map(({ r, a, b }) => {
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len = Math.hypot(dx, dy) || 1;
        const ux = dx / len;
        const uy = dy / len;
        const w = Math.max(r.widthFt, minWidth);
        const nx = -uy * (w / 2);
        const ny = ux * (w / 2);
        const pts = [
          [a.x + nx, a.y + ny],
          [b.x + nx, b.y + ny],
          [b.x - nx, b.y - ny],
          [a.x - nx, a.y - ny],
        ]
          .map((p) => p.join(","))
          .join(" ");
        const hl = r.ends.some((e) => e.id === highlightEnd);
        const label = (endIdx: 0 | 1) => {
          const e = r.ends[endIdx];
          const p = endIdx === 0 ? a : b;
          const dir = endIdx === 0 ? -1 : 1;
          const off = fs * 1.4;
          const lx = p.x + ux * off * dir;
          const ly = p.y + uy * off * dir;
          // Rotate text so it reads along the landing direction (bottom of number at threshold).
          const rot = norm360(e.trueHeading);
          const isHl = e.id === highlightEnd;
          return (
            <g key={e.id} transform={`translate(${lx} ${ly}) rotate(${rot})`}>
              <text
                x={0}
                y={0}
                fontSize={fs}
                textAnchor="middle"
                dominantBaseline="middle"
                fill={isHl ? "var(--color-ok)" : "white"}
                fontWeight={700}
                fontFamily="var(--font-mono)"
              >
                {e.id}
              </text>
            </g>
          );
        };
        return (
          <g key={r.name}>
            <polygon
              points={pts}
              fill={hl ? "oklch(0.8 0.19 148 / 0.25)" : "oklch(0.42 0.01 258)"}
              stroke={hl ? "var(--color-ok)" : "oklch(0.75 0.01 258)"}
              strokeWidth={span * 0.002}
            />
            <line
              x1={a.x + ux * w}
              y1={a.y + uy * w}
              x2={b.x - ux * w}
              y2={b.y - uy * w}
              stroke="white"
              strokeWidth={Math.max(span * 0.0015, w * 0.06)}
              strokeDasharray={`${span * 0.012} ${span * 0.01}`}
              opacity={0.75}
            />
            {r.ends.map((e, i) =>
              e.ils ? (
                <g key={`ils-${e.id}`}>
                  {/* ILS feather extends out from the approach end (behind the threshold) */}
                  {(() => {
                    const p = i === 0 ? a : b;
                    const d = i === 0 ? -1 : 1;
                    const L = span * 0.16;
                    const fx = p.x + ux * L * d;
                    const fy = p.y + uy * L * d;
                    const wx = -uy * L * 0.12;
                    const wy = ux * L * 0.12;
                    return (
                      <polygon
                        points={`${p.x},${p.y} ${fx + wx},${fy + wy} ${fx - wx},${fy - wy}`}
                        fill="oklch(0.84 0.13 205 / 0.12)"
                        stroke="var(--color-cyan)"
                        strokeWidth={span * 0.0012}
                        strokeDasharray={`${span * 0.006} ${span * 0.004}`}
                      />
                    );
                  })()}
                </g>
              ) : null,
            )}
            {label(0)}
            {label(1)}
          </g>
        );
      })}

      {/* north arrow */}
      <g transform={`translate(${vb.x + vb.w - fs * 2.2} ${vb.y + fs * 2.4})`}>
        <polygon
          points={`0,${-fs * 1.4} ${fs * 0.55},${fs * 0.6} 0,${fs * 0.2} ${-fs * 0.55},${fs * 0.6}`}
          fill="white"
        />
        <text
          y={fs * 1.7}
          fontSize={fs * 0.85}
          textAnchor="middle"
          fill="white"
          fontFamily="var(--font-mono)"
        >
          N
        </text>
      </g>

      {/* wind arrow (points downwind, i.e. the direction the wind blows TO) */}
      {windFromTrue !== undefined && windKt !== undefined && windKt > 0 ? (
        <g
          transform={`translate(${vb.x + fs * 3} ${vb.y + fs * 3.2}) rotate(${windFromTrue + 180})`}
        >
          <line
            x1={0}
            y1={fs * 1.8}
            x2={0}
            y2={-fs * 1.4}
            stroke="var(--color-caution)"
            strokeWidth={fs * 0.18}
          />
          <polygon
            points={`0,${-fs * 2} ${fs * 0.5},${-fs * 1.1} ${-fs * 0.5},${-fs * 1.1}`}
            fill="var(--color-caution)"
          />
        </g>
      ) : null}
      {windFromTrue !== undefined && windKt !== undefined && windKt > 0 ? (
        <text
          x={vb.x + fs * 3}
          y={vb.y + fs * 6.4}
          fontSize={fs * 0.8}
          textAnchor="middle"
          fill="var(--color-caution)"
          fontFamily="var(--font-mono)"
        >
          {String(Math.round(windFromTrue)).padStart(3, "0")}°T/{Math.round(windKt)}
        </text>
      ) : null}

      {/* scale bar */}
      <g transform={`translate(${vb.x + fs * 1.2} ${vb.y + vb.h - fs * 1.6})`}>
        <rect x={0} y={0} width={bar} height={fs * 0.3} fill="white" />
        <rect
          x={bar / 2}
          y={0}
          width={bar / 2}
          height={fs * 0.3}
          fill="oklch(0.4 0 0)"
          stroke="white"
          strokeWidth={fs * 0.05}
        />
        <text x={0} y={-fs * 0.4} fontSize={fs * 0.75} fill="white" fontFamily="var(--font-mono)">
          {bar.toLocaleString()} ft
        </text>
      </g>
      <text
        x={vb.x + vb.w - fs * 0.8}
        y={vb.y + vb.h - fs * 0.8}
        fontSize={fs * 0.6}
        textAnchor="end"
        fill="oklch(0.7 0.02 250)"
      >
        EDUCATIONAL DIAGRAM — NOT FOR NAVIGATION
      </text>
    </svg>
  );
}
