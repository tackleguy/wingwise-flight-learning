/**
 * Moving map shared by the MFD and the TX-750 Navigator: aircraft symbol, flight plan
 * (active leg magenta), airports, VORs, relative terrain, simulated weather and traffic.
 */
import { memo, useEffect, useRef } from "react";
import { AIRPORTS, NAVAIDS } from "@/lib/data/airports";
import { distanceNm, norm360, toRad } from "@/lib/geo";
import { cn } from "@/lib/utils";
import {
  precipitationCells,
  project,
  syntheticTraffic,
  terrainAlertLevel,
  terrainGridAround,
  type MapProjection,
  type TerrainGrid,
} from "@/sim/avionics-helpers";
import { useSimSnapshot } from "@/sim/react";
import { MONO } from "./common";

export const MAP_RANGES = [2, 5, 10, 15, 20, 30, 50, 100] as const;

export function nextRange(range: number, dir: 1 | -1): number {
  const i = MAP_RANGES.findIndex((r) => r >= range);
  const idx = Math.min(MAP_RANGES.length - 1, Math.max(0, (i < 0 ? MAP_RANGES.length - 1 : i) + dir));
  return MAP_RANGES[idx]!;
}

export interface MapLayers {
  terrain: boolean;
  weather: boolean;
  traffic: boolean;
}

export interface MovingMapProps {
  rangeNm: number;
  orientation: "north" | "track";
  layers?: Partial<MapLayers> | undefined;
  /** viewBox size */
  width?: number | undefined;
  height?: number | undefined;
  /** Fill the parent box (slice) instead of keeping the intrinsic aspect ratio. */
  fill?: boolean | undefined;
  /** Mouse-wheel zoom: dir = +1 zoom out (larger range), −1 zoom in. */
  onZoom?: ((dir: 1 | -1) => void) | undefined;
  className?: string | undefined;
}

const TERRAIN_COLORS = { red: "#c8352b", yellow: "#d4a91c" } as const;

const TerrainLayer = memo(function TerrainLayer({ grid, altBucket }: { grid: TerrainGrid; altBucket: number }) {
  const c = grid.cellNm * 1.04;
  return (
    <g>
      {grid.cells.map((cell, i) => {
        const lvl = terrainAlertLevel(cell.elev, altBucket);
        let fill: string | null = null;
        let op = 0.7;
        if (lvl === "red") fill = TERRAIN_COLORS.red;
        else if (lvl === "yellow") fill = TERRAIN_COLORS.yellow;
        else if (cell.elev > 250) {
          fill = "#4a3620";
          op = Math.min(0.6, 0.18 + cell.elev / 4000);
        }
        if (!fill) return null;
        return <rect key={i} x={cell.e - c / 2} y={-cell.n - c / 2} width={c} height={c} fill={fill} opacity={op} />;
      })}
    </g>
  );
});

export function MovingMap({ rangeNm, orientation, layers, width = 800, height = 600, fill, onZoom, className }: MovingMapProps) {
  const s = useSimSnapshot();
  const ref = useRef<SVGSVGElement>(null);
  const zoomRef = useRef(onZoom);
  zoomRef.current = onZoom;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const h = (e: WheelEvent) => {
      if (!zoomRef.current) return;
      e.preventDefault();
      zoomRef.current(e.deltaY > 0 ? 1 : -1);
    };
    el.addEventListener("wheel", h, { passive: false });
    return () => el.removeEventListener("wheel", h);
  }, []);

  const L: MapLayers = { terrain: true, weather: false, traffic: true, ...layers };
  const a = s.aircraft;
  const gpsOk = s.nav.gps.valid;
  const trackUp = orientation === "track";
  const rot = trackUp ? (a.gsKt > 30 ? a.track : a.heading) : 0;
  const cx = width / 2;
  const cy = trackUp ? height * 0.66 : height / 2;
  const scale = (cy - 24) / rangeNm;
  const P: MapProjection = { scale, cx, cy, lat0: a.lat, lon0: a.lon, rot };
  const pr = (lat: number, lon: number) => project(P, lat, lon);
  const fs = width / 60;
  const view = rangeNm * 1.7;

  // Terrain (cached grid, memoized layer)
  const grid = L.terrain ? terrainGridAround(a.lat, a.lon, rangeNm) : null;
  const altBucket = Math.round(a.altMslFt / 50) * 50;
  let terrainTf = "";
  if (grid) {
    const dE = (grid.anchorLon - a.lon) * 60 * Math.cos(toRad(a.lat));
    const dN = (grid.anchorLat - a.lat) * 60;
    terrainTf = `translate(${cx} ${cy}) rotate(${-rot}) scale(${scale}) translate(${dE} ${-dN})`;
  }

  const fp = s.gps.flightPlan;
  const active = s.gps.activeLeg;
  const dto = s.gps.directTo;
  const traffic = L.traffic ? syntheticTraffic(a.simTimeSec, a.lat, a.lon) : [];
  const anyTa = traffic.some((t) => t.ta);
  const wx = L.weather && s.weather.precipitation !== "none" ? precipitationCells(a.lat, a.lon, rangeNm, s.weather.turbulence) : [];
  const ringR = (rangeNm / 2) * scale;

  return (
    <svg
      ref={ref}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio={fill ? "xMidYMid slice" : "xMidYMid meet"}
      className={cn("block bg-[#03060a] select-none", fill ? "h-full w-full" : "h-auto w-full", className)}
      role="img"
      aria-label={`Moving map, ${rangeNm} nautical mile range, ${trackUp ? "track up" : "north up"}`}
      fontFamily={MONO}
    >
      <defs>
        <clipPath id="tx-map-clip">
          <rect x={0} y={0} width={width} height={height} />
        </clipPath>
      </defs>
      <g clipPath="url(#tx-map-clip)" opacity={gpsOk ? 1 : 0.35}>
        {grid ? (
          <g transform={terrainTf}>
            <TerrainLayer grid={grid} altBucket={altBucket} />
          </g>
        ) : null}

        {wx.map((c, i) => {
          const p = pr(c.lat, c.lon);
          const r = c.radiusNm * scale;
          if (p.x < -r || p.x > width + r || p.y < -r || p.y > height + r) return null;
          const col = c.intensity === 3 ? "#e0332b" : c.intensity === 2 ? "#e6c419" : "#2fbf4a";
          return (
            <g key={`wx${i}`}>
              <circle cx={p.x} cy={p.y} r={r} fill={col} opacity={0.28} />
              <circle cx={p.x} cy={p.y} r={r * 0.55} fill={col} opacity={0.3} />
            </g>
          );
        })}

        {/* range ring */}
        <circle cx={cx} cy={cy} r={ringR} fill="none" stroke="#5b6570" strokeDasharray="6 6" strokeWidth={1.2} />
        <text x={cx + ringR * 0.72 + 4} y={cy - ringR * 0.72 - 4} fill="#9aa3ad" fontSize={fs * 0.9}>
          {rangeNm / 2 >= 1 ? rangeNm / 2 : (rangeNm / 2).toFixed(1)}
        </text>

        {/* airports */}
        {AIRPORTS.map((ap) => {
          if (distanceNm(a.lat, a.lon, ap.lat, ap.lon) > view) return null;
          const p = pr(ap.lat, ap.lon);
          const col = ap.towered ? "#4aa3ff" : "#c77dff";
          return (
            <g key={ap.icao}>
              {rangeNm <= 15
                ? ap.runways.map((r) => {
                    const t1 = pr(r.ends[0].threshold.lat, r.ends[0].threshold.lon);
                    const t2 = pr(r.ends[1].threshold.lat, r.ends[1].threshold.lon);
                    return <line key={r.name} x1={t1.x} y1={t1.y} x2={t2.x} y2={t2.y} stroke="#c9d1da" strokeWidth={Math.max(2, (r.widthFt / 6076) * scale)} strokeLinecap="butt" />;
                  })
                : null}
              {rangeNm > 15 ? <circle cx={p.x} cy={p.y} r={6} fill="none" stroke={col} strokeWidth={2.5} /> : null}
              <text x={p.x + 9} y={p.y - 8} fill={col} fontSize={fs} fontWeight={600}>
                {ap.icao}
              </text>
            </g>
          );
        })}

        {/* VORs */}
        {NAVAIDS.map((n) => {
          if (n.type === "NDB" || n.type === "FIX") return null;
          if (distanceNm(a.lat, a.lon, n.lat, n.lon) > view) return null;
          const p = pr(n.lat, n.lon);
          const r = 8;
          const pts = Array.from({ length: 6 }, (_, k) => `${p.x + r * Math.cos((k * Math.PI) / 3)},${p.y + r * Math.sin((k * Math.PI) / 3)}`).join(" ");
          return (
            <g key={`${n.id}${n.lat}`}>
              <polygon points={pts} fill="none" stroke="#3fd0c9" strokeWidth={2} />
              <circle cx={p.x} cy={p.y} r={2} fill="#3fd0c9" />
              <text x={p.x + 11} y={p.y + 15} fill="#3fd0c9" fontSize={fs * 0.95}>
                {n.id}
              </text>
            </g>
          );
        })}

        {/* flight plan */}
        {fp.map((w, i) => {
          if (i === 0) return null;
          const prev = fp[i - 1]!;
          const p1 = pr(prev.lat, prev.lon);
          const p2 = pr(w.lat, w.lon);
          const isActive = !dto && i === active;
          const past = !dto && i < active;
          return (
            <line
              key={`leg${i}`}
              x1={p1.x}
              y1={p1.y}
              x2={p2.x}
              y2={p2.y}
              stroke={isActive ? "var(--magenta)" : past ? "#6b7480" : "#f1f3f5"}
              strokeWidth={isActive ? 4.5 : 2.5}
            />
          );
        })}
        {dto ? <DirectToLine s={s} pr={pr} rangeNm={rangeNm} /> : null}
        {fp.map((w, i) => {
          const p = pr(w.lat, w.lon);
          const isTo = dto ? false : i === active;
          return (
            <g key={`wp${i}`}>
              <path d={`M ${p.x} ${p.y - 8} L ${p.x + 3} ${p.y - 3} L ${p.x + 8} ${p.y} L ${p.x + 3} ${p.y + 3} L ${p.x} ${p.y + 8} L ${p.x - 3} ${p.y + 3} L ${p.x - 8} ${p.y} L ${p.x - 3} ${p.y - 3} Z`} fill={isTo ? "var(--magenta)" : "#f1f3f5"} />
              <text x={p.x + 10} y={p.y + 16} fill={isTo ? "var(--magenta)" : "#f1f3f5"} fontSize={fs * 0.92}>
                {w.id}
                {w.altFt !== undefined && w.kind === "fix" ? ` ${w.altFt}` : ""}
              </text>
            </g>
          );
        })}
        {dto ? (
          (() => {
            const p = pr(dto.lat, dto.lon);
            return (
              <g>
                <circle cx={p.x} cy={p.y} r={7} fill="var(--magenta)" />
                <text x={p.x + 10} y={p.y + 16} fill="var(--magenta)" fontSize={fs}>
                  {dto.id}
                </text>
              </g>
            );
          })()
        ) : null}

        {/* traffic */}
        {traffic.map((t) => {
          const p = pr(t.lat, t.lon);
          const tag = `${t.relAltFt >= 0 ? "+" : "−"}${String(Math.round(Math.abs(t.relAltFt) / 100)).padStart(2, "0")}`;
          const col = t.ta ? "var(--caution)" : "#f1f3f5";
          return (
            <g key={t.id}>
              {t.ta ? (
                <circle cx={p.x} cy={p.y} r={8} fill={col} />
              ) : (
                <polygon points={`${p.x},${p.y - 9} ${p.x + 7},${p.y} ${p.x},${p.y + 9} ${p.x - 7},${p.y}`} fill={t.proximate ? col : "none"} stroke={col} strokeWidth={2} />
              )}
              <text x={p.x} y={t.relAltFt >= 0 ? p.y - 13 : p.y + 23} textAnchor="middle" fill={col} fontSize={fs * 0.85}>
                {tag}
                {t.trend > 0 ? "↑" : t.trend < 0 ? "↓" : ""}
              </text>
            </g>
          );
        })}
      </g>

      {/* own aircraft */}
      <g transform={`translate(${cx} ${cy}) rotate(${a.heading - rot})`}>
        <path d="M 0 -16 L 3 -4 L 15 2 L 15 6 L 3 4 L 2 12 L 7 15 L 7 18 L -7 18 L -7 15 L -2 12 L -3 4 L -15 6 L -15 2 L -3 -4 Z" fill="#f1f3f5" stroke="black" strokeWidth={1.5} />
      </g>

      {/* overlays */}
      <g>
        <rect x={width - 132} y={8} width={124} height={24} rx={3} fill="black" opacity={0.75} />
        <text x={width - 70} y={25} textAnchor="middle" fill="#f1f3f5" fontSize={fs * 0.9}>
          {trackUp ? "TRK UP" : "NORTH UP"} {rangeNm}NM
        </text>
        <NorthArrow x={width - 30} y={58} rot={rot} />
        {L.terrain ? (
          <g>
            <rect x={8} y={height - 32} width={180} height={24} rx={3} fill="black" opacity={0.75} />
            <rect x={14} y={height - 25} width={10} height={10} fill={TERRAIN_COLORS.red} />
            <text x={28} y={height - 15} fill="#c8ced6" fontSize={fs * 0.75}>
              &lt;100FT
            </text>
            <rect x={88} y={height - 25} width={10} height={10} fill={TERRAIN_COLORS.yellow} />
            <text x={102} y={height - 15} fill="#c8ced6" fontSize={fs * 0.75}>
              &lt;1000FT
            </text>
          </g>
        ) : null}
        {wx.length > 0 ? (
          <g>
            <rect x={8} y={8} width={196} height={24} rx={3} fill="black" opacity={0.8} />
            <text x={16} y={25} fill="var(--caution)" fontSize={fs * 0.8} fontWeight={700}>
              WX: SIMULATED — TRAINING ONLY
            </text>
          </g>
        ) : null}
        {anyTa ? (
          <g className="animate-annunciator">
            <rect x={cx - 60} y={8} width={120} height={26} rx={3} fill="var(--caution)" />
            <text x={cx} y={27} textAnchor="middle" fill="black" fontSize={fs * 1.05} fontWeight={800}>
              TRAFFIC
            </text>
          </g>
        ) : null}
        {!gpsOk ? (
          <g>
            <rect x={cx - 150} y={height / 2 - 70} width={300} height={40} fill="black" stroke="var(--caution)" />
            <text x={cx} y={height / 2 - 44} textAnchor="middle" fill="var(--caution)" fontSize={fs * 1.2} fontWeight={700}>
              NO GPS POSITION
            </text>
          </g>
        ) : null}
      </g>
    </svg>
  );
}

function NorthArrow({ x, y, rot }: { x: number; y: number; rot: number }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${-rot})`}>
      <circle r={14} fill="black" opacity={0.7} stroke="#5b6570" />
      <polygon points="0,-11 5,4 0,1 -5,4" fill="#f1f3f5" />
      <text y={-15} textAnchor="middle" fill="#f1f3f5" fontSize={10} transform={`rotate(${rot} 0 -19)`}>
        N
      </text>
    </g>
  );
}

function DirectToLine({ s, pr, rangeNm }: { s: ReturnType<typeof useSimSnapshot>; pr: (lat: number, lon: number) => { x: number; y: number }; rangeNm: number }) {
  const dto = s.gps.directTo!;
  // Draw the desired track as a line through the target along the D→ course.
  const dtkTrue = norm360(s.nav.gps.dtk + s.magVar);
  const back = (dtkTrue + 180) * (Math.PI / 180);
  const len = Math.max(rangeNm * 2, s.nav.gps.distNm + rangeNm);
  const dLat = (len / 60) * Math.cos(back);
  const dLon = (len / 60) * Math.sin(back) / Math.cos((dto.lat * Math.PI) / 180);
  const p1 = pr(dto.lat + dLat, dto.lon + dLon);
  const p2 = pr(dto.lat, dto.lon);
  return <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="var(--magenta)" strokeWidth={4.5} />;
}
