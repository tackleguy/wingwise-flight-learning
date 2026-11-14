/**
 * Technical line-art graphics for the Aircraft Library:
 *  - <AircraftSilhouette view="top" | "side">  schematic three-view style drawing, to scale
 *  - <AirspeedIndicator>                         ASI with white/green/yellow arcs & red line from V-speeds
 */
import { useId, useMemo, useState, type ReactNode } from "react";
import type { AircraftPerf } from "@/lib/data/types";
import type { SilhouetteSpec } from "@/lib/data/aircraft";

const STROKE = "var(--color-cyan)";
const DIM = "var(--color-muted-foreground)";

function fmt(v: number) {
  return v >= 100 ? v.toFixed(0) : v.toFixed(1);
}

/* ------------------------------------------------------------------ */
/* Silhouette                                                          */
/* ------------------------------------------------------------------ */

export function AircraftSilhouette({
  spec,
  spanFt,
  view,
  className,
}: {
  spec: SilhouetteSpec;
  spanFt: number;
  view: "top" | "side";
  className?: string;
}) {
  return view === "top" ? (
    <TopView spec={spec} spanFt={spanFt} className={className} />
  ) : (
    <SideView spec={spec} className={className} />
  );
}

function TopView({
  spec,
  spanFt,
  className,
}: {
  spec: SilhouetteSpec;
  spanFt: number;
  className?: string | undefined;
}) {
  const L = spec.lengthFt;
  const b = spanFt;
  const w = spec.fuselageWidthFt;
  const pad = Math.max(L, b) * 0.12;
  const t = Math.tan((spec.sweepDeg * Math.PI) / 180);
  const xr = spec.wingPos * L;
  const xt = xr + (b / 2 - w / 2) * t;
  const cr = spec.rootChordFt;
  const ct = spec.tipChordFt;

  // Fuselage outline (top view): rounded nose, constant section, tapered tail cone.
  const noseLen = spec.engines === "wing-jet" ? 0.1 * L : 0.16 * L;
  const tailStart = spec.engines === "wing-jet" ? 0.68 * L : 0.5 * L;
  const tailW = Math.max(0.6, w * 0.18);
  const fus = [
    `M 0 0`,
    `C 0 ${-w * 0.35} ${noseLen * 0.4} ${-w / 2} ${noseLen} ${-w / 2}`,
    `L ${tailStart} ${-w / 2}`,
    `L ${L} ${-tailW / 2}`,
    `L ${L} ${tailW / 2}`,
    `L ${tailStart} ${w / 2}`,
    `L ${noseLen} ${w / 2}`,
    `C ${noseLen * 0.4} ${w / 2} 0 ${w * 0.35} 0 0 Z`,
  ].join(" ");

  const wing = (s: 1 | -1) =>
    `M ${xr} ${(s * w) / 2} L ${xt} ${(s * b) / 2} L ${xt + ct} ${(s * b) / 2} L ${xr + cr} ${(s * w) / 2} Z`;

  // Horizontal stabilizer
  const hc = Math.max(2.2, (spec.engines === "wing-jet" ? 0.12 : 0.15) * L);
  const hct = hc * 0.55;
  const hs = spec.hstabSpanFt / 2;
  const hSweep = Math.tan(
    ((spec.engines === "wing-jet" ? spec.sweepDeg + 4 : spec.sweepDeg + 3) * Math.PI) / 180,
  );
  const hxr = spec.tail === "t-tail" ? L - hc * 0.85 : L - hc * 1.05;
  const hxt = hxr + (hs - tailW) * hSweep;
  const hstab = (s: 1 | -1) =>
    `M ${hxr} ${(s * tailW) / 2} L ${hxt} ${s * hs} L ${hxt + hct} ${s * hs} L ${hxr + hc} ${(s * tailW) / 2} Z`;

  const elems: ReactNode[] = [];
  if (spec.engines === "nose") {
    const pr = Math.min(3.4, b * 0.1);
    elems.push(
      <line
        key="prop"
        x1={-0.6}
        y1={-pr}
        x2={-0.6}
        y2={pr}
        stroke={STROKE}
        strokeWidth={1.5}
        vectorEffect="non-scaling-stroke"
      />,
    );
  } else if (spec.engines === "wing-prop") {
    const yN = w / 2 + 0.13 * b;
    const nw = Math.max(2.4, 0.06 * b);
    const yAt = (y: number) => xr + (y - w / 2) * t;
    for (const s of [1, -1] as const) {
      const lx = yAt(yN);
      const x0 = lx - cr * 0.55;
      const x1 = lx + cr * 1.15;
      const pr = Math.max(3, b * 0.09);
      elems.push(
        <g key={`n${s}`}>
          <rect
            x={x0}
            y={s * yN - nw / 2}
            width={x1 - x0}
            height={nw}
            rx={nw / 2}
            fill="var(--color-panel)"
            stroke={STROKE}
            vectorEffect="non-scaling-stroke"
          />
          <line
            x1={x0 - 0.4}
            y1={s * yN - pr}
            x2={x0 - 0.4}
            y2={s * yN + pr}
            stroke={STROKE}
            strokeWidth={1.5}
            vectorEffect="non-scaling-stroke"
          />
        </g>,
      );
    }
  } else {
    const yE = 0.3 * (b / 2);
    const len = 0.13 * L;
    const ew = 0.058 * b;
    const lx = xr + (yE - w / 2) * t;
    for (const s of [1, -1] as const) {
      elems.push(
        <rect
          key={`e${s}`}
          x={lx - len * 0.65}
          y={s * yE - ew / 2}
          width={len}
          height={ew}
          rx={ew * 0.45}
          fill="var(--color-panel)"
          stroke={STROKE}
          vectorEffect="non-scaling-stroke"
        />,
      );
    }
  }

  const vb = `${-pad} ${-b / 2 - pad} ${L + pad * 2} ${b + pad * 2}`;
  const fs = Math.max(L, b) * 0.035;
  return (
    <svg
      viewBox={vb}
      className={className}
      role="img"
      aria-label="Top view schematic"
      preserveAspectRatio="xMidYMid meet"
    >
      <g fill="var(--color-panel)" stroke={STROKE} strokeWidth={1.1} strokeLinejoin="round">
        <path d={wing(1)} vectorEffect="non-scaling-stroke" />
        <path d={wing(-1)} vectorEffect="non-scaling-stroke" />
        <path d={hstab(1)} vectorEffect="non-scaling-stroke" />
        <path d={hstab(-1)} vectorEffect="non-scaling-stroke" />
        <path d={fus} vectorEffect="non-scaling-stroke" />
      </g>
      {elems}
      {/* fin (seen edge-on) */}
      <line
        x1={L - hc * 1.3}
        y1={0}
        x2={L}
        y2={0}
        stroke={STROKE}
        strokeWidth={2}
        vectorEffect="non-scaling-stroke"
      />
      {/* centreline */}
      <line
        x1={-pad * 0.6}
        y1={0}
        x2={L + pad * 0.6}
        y2={0}
        stroke={DIM}
        strokeDasharray="6 4"
        strokeWidth={0.6}
        vectorEffect="non-scaling-stroke"
      />
      {/* span dimension */}
      <g stroke={DIM} strokeWidth={0.8} vectorEffect="non-scaling-stroke">
        <line
          x1={L + pad * 0.55}
          y1={-b / 2}
          x2={L + pad * 0.55}
          y2={b / 2}
          vectorEffect="non-scaling-stroke"
        />
        <line
          x1={xt + ct}
          y1={-b / 2}
          x2={L + pad * 0.7}
          y2={-b / 2}
          strokeDasharray="2 3"
          vectorEffect="non-scaling-stroke"
        />
        <line
          x1={xt + ct}
          y1={b / 2}
          x2={L + pad * 0.7}
          y2={b / 2}
          strokeDasharray="2 3"
          vectorEffect="non-scaling-stroke"
        />
      </g>
      <text
        x={L + pad * 0.45}
        y={0}
        fill={DIM}
        fontSize={fs}
        textAnchor="middle"
        transform={`rotate(-90 ${L + pad * 0.45} 0)`}
        fontFamily="var(--font-mono)"
      >
        span {fmt(b)} ft
      </text>
      <text
        x={-pad * 0.6}
        y={-b / 2 - pad * 0.45}
        fill={DIM}
        fontSize={fs}
        fontFamily="var(--font-mono)"
      >
        TOP VIEW · NOSE LEFT
      </text>
    </svg>
  );
}

function SideView({ spec, className }: { spec: SilhouetteSpec; className?: string | undefined }) {
  const L = spec.lengthFt;
  const H = spec.heightFt;
  const jet = spec.engines === "wing-jet";
  const hf = spec.fuselageWidthFt * (jet ? 1.05 : 1.2);
  const zb = jet ? H * 0.12 : Math.max(1.2, H * 0.16);
  const zt = zb + hf;
  const pad = L * 0.1;
  const xr = spec.wingPos * L;
  const cr = spec.rootChordFt;
  const tailStart = jet ? 0.7 * L : 0.52 * L;
  const noseZ = zb + hf * (jet ? 0.42 : 0.5);
  const windX = jet ? 0.07 * L : 0.24 * L;
  const tailZb = zt - hf * (jet ? 0.3 : 0.35);

  // Fuselage side profile (y grows downward in SVG, so we flip with a transform).
  const fus = [
    `M 0 ${noseZ}`,
    `C 0 ${zb + hf * 0.82} ${windX * 0.45} ${zt} ${windX} ${zt}`,
    `L ${tailStart} ${zt}`,
    `L ${L} ${zt - hf * 0.08}`,
    `L ${L} ${tailZb}`,
    `L ${tailStart} ${zb + (jet ? 0.1 * hf : 0)}`,
    `L ${windX * 0.6} ${zb}`,
    `C ${windX * 0.25} ${zb} 0 ${zb + hf * 0.15} 0 ${noseZ} Z`,
  ].join(" ");

  // Fin
  const finRoot = (jet ? 0.2 : 0.2) * L;
  const finTip = finRoot * 0.5;
  const finSweep = jet ? 0.55 : 0.4;
  const fx0 = L - finRoot * 1.05;
  const fin = `M ${fx0} ${zt - hf * 0.05} L ${fx0 + finRoot * finSweep + finRoot * 0.3} ${H} L ${fx0 + finRoot * finSweep + finRoot * 0.3 + finTip} ${H} L ${L} ${zt - hf * 0.1} Z`;

  // Horizontal tail (edge-on)
  const hc = Math.max(2.2, (jet ? 0.12 : 0.15) * L);
  const hz = spec.tail === "t-tail" ? H - 0.15 : tailZb + hf * 0.15;
  const hx = spec.tail === "t-tail" ? fx0 + finRoot * finSweep + finRoot * 0.25 : L - hc * 1.05;

  // Wing (edge-on airfoil)
  const wz = spec.wing === "high" ? zt + 0.05 : zb + hf * 0.12;
  const th = Math.max(0.5, cr * 0.13);
  const wingPath = `M ${xr} ${wz} C ${xr + cr * 0.05} ${wz + th} ${xr + cr * 0.35} ${wz + th} ${xr + cr} ${wz + th * 0.1} L ${xr + cr} ${wz - th * 0.05} C ${xr + cr * 0.4} ${wz - th * 0.35} ${xr} ${wz - th * 0.3} ${xr} ${wz} Z`;

  // Gear
  const wr = jet ? 1.8 : 0.75;
  const noseX = jet ? 0.11 * L : 0.13 * L;
  const mainX = xr + cr * (jet ? 0.62 : 0.55);

  const extras: ReactNode[] = [];
  if (spec.engines === "nose") {
    const pr = Math.min(3.3, H * 0.4);
    extras.push(
      <line
        key="prop"
        x1={-0.5}
        y1={noseZ - pr}
        x2={-0.5}
        y2={noseZ + pr}
        stroke={STROKE}
        strokeWidth={1.5}
        vectorEffect="non-scaling-stroke"
      />,
    );
  } else if (spec.engines === "wing-prop") {
    const nh = Math.max(2.2, hf * 0.45);
    const x0 = xr - cr * 0.55;
    const x1 = xr + cr * 1.15;
    const pr = Math.max(3, H * 0.3);
    const cz = wz + nh * 0.1;
    extras.push(
      <g key="nac">
        <rect
          x={x0}
          y={cz - nh / 2}
          width={x1 - x0}
          height={nh}
          rx={nh / 2}
          fill="var(--color-panel)"
          stroke={STROKE}
          vectorEffect="non-scaling-stroke"
        />
        <line
          x1={x0 - 0.4}
          y1={cz - pr}
          x2={x0 - 0.4}
          y2={cz + pr}
          stroke={STROKE}
          strokeWidth={1.5}
          vectorEffect="non-scaling-stroke"
        />
      </g>,
    );
  } else {
    const d = 0.058 * spec.lengthFt * 0.95;
    const len = 0.13 * L;
    const ex = xr - len * 0.55;
    const ez = wz - d * 0.55;
    extras.push(
      <g key="eng">
        <line
          x1={ex + len * 0.5}
          y1={ez + d / 2}
          x2={xr + cr * 0.2}
          y2={wz}
          stroke={STROKE}
          vectorEffect="non-scaling-stroke"
        />
        <rect
          x={ex}
          y={ez - d / 2}
          width={len}
          height={d}
          rx={d * 0.45}
          fill="var(--color-panel)"
          stroke={STROKE}
          vectorEffect="non-scaling-stroke"
        />
      </g>,
    );
  }

  // Windows
  const windows: ReactNode[] = [];
  if (jet) {
    const n = Math.round((tailStart - windX * 2) / 3.2);
    for (let i = 0; i < n; i++) {
      const x = windX * 1.9 + i * 3.2;
      windows.push(
        <rect
          key={i}
          x={x}
          y={zb + hf * 0.62}
          width={0.9}
          height={1.1}
          rx={0.3}
          fill="none"
          stroke={STROKE}
          strokeWidth={0.5}
          vectorEffect="non-scaling-stroke"
        />,
      );
    }
    windows.push(
      <path
        key="ws"
        d={`M ${windX * 0.55} ${zb + hf * 0.68} L ${windX * 0.95} ${zt - hf * 0.08} L ${windX * 1.3} ${zt - hf * 0.08} L ${windX * 1.2} ${zb + hf * 0.68} Z`}
        fill="none"
        stroke={STROKE}
        strokeWidth={0.8}
        vectorEffect="non-scaling-stroke"
      />,
    );
  } else {
    const cabin0 = windX * 0.75;
    const cabin1 = xr + cr * (spec.engines === "wing-prop" ? 1.6 : 1.1);
    if (spec.bubbleCanopy) {
      windows.push(
        <path
          key="cn"
          d={`M ${cabin0} ${zt - hf * 0.1} Q ${(cabin0 + cabin1) / 2} ${zt + hf * 0.35} ${cabin1} ${zt - hf * 0.05}`}
          fill="none"
          stroke={STROKE}
          strokeWidth={0.9}
          vectorEffect="non-scaling-stroke"
        />,
      );
    }
    windows.push(
      <path
        key="w"
        d={`M ${cabin0} ${zb + hf * 0.55} L ${windX} ${zt - hf * 0.1} L ${cabin1} ${zt - hf * 0.1} L ${cabin1 - cr * 0.15} ${zb + hf * 0.55} Z`}
        fill="none"
        stroke={STROKE}
        strokeWidth={0.8}
        vectorEffect="non-scaling-stroke"
      />,
    );
  }

  const fs = L * 0.034;
  const vbTop = H + pad * 0.6;
  return (
    <svg
      viewBox={`${-pad} ${-vbTop} ${L + pad * 2} ${vbTop + pad * 0.9}`}
      className={className}
      role="img"
      aria-label="Side view schematic"
      preserveAspectRatio="xMidYMid meet"
    >
      <g transform="scale(1,-1)">
        {/* ground */}
        <line
          x1={-pad * 0.8}
          y1={0}
          x2={L + pad * 0.8}
          y2={0}
          stroke={DIM}
          strokeWidth={0.8}
          vectorEffect="non-scaling-stroke"
        />
        {/* gear */}
        <g
          stroke={STROKE}
          fill="var(--color-panel)"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        >
          <line
            x1={noseX}
            y1={wr}
            x2={noseX + (jet ? 0 : 0.5)}
            y2={zb + 0.2}
            vectorEffect="non-scaling-stroke"
          />
          <line
            x1={mainX}
            y1={wr}
            x2={mainX - (spec.wing === "high" ? 0.8 : 0)}
            y2={spec.wing === "high" ? zb + 0.3 : wz}
            vectorEffect="non-scaling-stroke"
          />
          <circle cx={noseX} cy={wr} r={wr * 0.9} vectorEffect="non-scaling-stroke" />
          <circle cx={mainX} cy={wr} r={wr} vectorEffect="non-scaling-stroke" />
        </g>
        <g fill="var(--color-panel)" stroke={STROKE} strokeWidth={1.1} strokeLinejoin="round">
          <path d={fin} vectorEffect="non-scaling-stroke" />
          <path d={fus} vectorEffect="non-scaling-stroke" />
          <rect
            x={hx}
            y={hz - 0.25}
            width={hc}
            height={0.5}
            rx={0.25}
            vectorEffect="non-scaling-stroke"
          />
          <path d={wingPath} vectorEffect="non-scaling-stroke" />
        </g>
        {spec.strut ? (
          <line
            x1={xr + cr * 0.15}
            y1={zb + hf * 0.25}
            x2={xr + cr * 0.4}
            y2={wz}
            stroke={STROKE}
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
        ) : null}
        {extras}
        {windows}
        {/* dimension lines */}
        <g stroke={DIM} strokeWidth={0.8}>
          <line x1={0} y1={-pad * 0.45} x2={L} y2={-pad * 0.45} vectorEffect="non-scaling-stroke" />
          <line x1={0} y1={-pad * 0.6} x2={0} y2={-pad * 0.3} vectorEffect="non-scaling-stroke" />
          <line x1={L} y1={-pad * 0.6} x2={L} y2={-pad * 0.3} vectorEffect="non-scaling-stroke" />
          <line
            x1={L + pad * 0.45}
            y1={0}
            x2={L + pad * 0.45}
            y2={H}
            vectorEffect="non-scaling-stroke"
          />
          <line
            x1={L - finRoot * 0.2}
            y1={H}
            x2={L + pad * 0.6}
            y2={H}
            strokeDasharray="2 3"
            vectorEffect="non-scaling-stroke"
          />
        </g>
      </g>
      <text
        x={L / 2}
        y={pad * 0.8}
        fill={DIM}
        fontSize={fs}
        textAnchor="middle"
        fontFamily="var(--font-mono)"
      >
        length {fmt(L)} ft
      </text>
      <text
        x={L + pad * 0.7}
        y={-H / 2}
        fill={DIM}
        fontSize={fs}
        textAnchor="middle"
        fontFamily="var(--font-mono)"
        transform={`rotate(-90 ${L + pad * 0.7} ${-H / 2})`}
      >
        height {fmt(H)} ft
      </text>
      <text
        x={-pad * 0.6}
        y={-H - pad * 0.15}
        fill={DIM}
        fontSize={fs}
        fontFamily="var(--font-mono)"
      >
        SIDE VIEW · {spec.wing.toUpperCase()} WING ·{" "}
        {spec.tail === "t-tail" ? "T-TAIL" : "CONVENTIONAL TAIL"}
      </text>
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Airspeed indicator                                                  */
/* ------------------------------------------------------------------ */

function polar(cx: number, cy: number, r: number, deg: number) {
  const a = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}

function arcPath(cx: number, cy: number, r: number, a0: number, a1: number) {
  const p0 = polar(cx, cy, r, a0);
  const p1 = polar(cx, cy, r, a1);
  const large = a1 - a0 > 180 ? 1 : 0;
  return `M ${p0.x} ${p0.y} A ${r} ${r} 0 ${large} 1 ${p1.x} ${p1.y}`;
}

export function airspeedZone(
  p: AircraftPerf,
  kias: number,
): { label: string; tone: "ok" | "caution" | "warning" | "default"; text: string } {
  const v = p.v;
  if (kias >= v.ne)
    return {
      label: "Above red line",
      tone: "warning",
      text: `At or above ${p.powerType === "piston" ? "Vne" : "Vmo"} (${v.ne} KIAS): structural failure or flutter risk. Never exceed.`,
    };
  if (kias > v.no)
    return {
      label: "Yellow arc — caution range",
      tone: "caution",
      text: `Between Vno (${v.no}) and Vne (${v.ne}): permitted only in smooth air, with caution.`,
    };
  if (v.mc !== undefined && kias < v.mc)
    return {
      label: "Below Vmc",
      tone: "warning",
      text: `Below Vmc (${v.mc} KIAS): directional control may be lost if an engine fails at high power.`,
    };
  if (kias >= v.s1) {
    const flaps =
      kias <= v.fe
        ? " Flaps may be extended (within white arc)."
        : " Above Vfe — flaps must be retracted.";
    return {
      label: "Green arc — normal operating range",
      tone: "ok",
      text: `Between Vs1 (${v.s1}) and Vno (${v.no}).${flaps}`,
    };
  }
  if (kias >= v.so)
    return {
      label: "White arc only",
      tone: "caution",
      text: `Between Vso (${v.so}) and Vs1 (${v.s1}): flaps-extended flight only — the clean wing would be stalled.`,
    };
  return {
    label: "Below stall speed",
    tone: "warning",
    text: `Below Vso (${v.so} KIAS): the airplane cannot sustain 1-g flight even in landing configuration.`,
  };
}

export function AirspeedIndicator({ perf, className }: { perf: AircraftPerf; className?: string }) {
  const v = perf.v;
  const id = useId();
  const step = v.ne > 260 ? 50 : 20;
  const minor = v.ne > 260 ? 10 : 5;
  const max = Math.ceil((v.ne * 1.12) / step) * step;
  const [needle, setNeedle] = useState(
    perf.cruiseKtas > v.no ? v.no - 5 : Math.min(perf.cruiseKtas, v.no - 5),
  );
  const ang = (s: number) => -165 + (330 * Math.max(0, Math.min(max, s))) / max;
  const cx = 110;
  const cy = 110;
  const R = 92;
  const zone = useMemo(() => airspeedZone(perf, needle), [perf, needle]);
  const ticks = useMemo(() => {
    const out: { s: number; major: boolean }[] = [];
    for (let s = 0; s <= max; s += minor) out.push({ s, major: s % step === 0 });
    return out;
  }, [max, minor, step]);
  const np = polar(cx, cy, R - 14, ang(needle));
  const toneCls = {
    ok: "text-ok",
    caution: "text-caution",
    warning: "text-warning",
    default: "text-foreground",
  }[zone.tone];

  return (
    <div className={className}>
      <svg
        viewBox="0 0 220 220"
        className="mx-auto w-full max-w-[280px]"
        role="img"
        aria-labelledby={`${id}-t`}
      >
        <title id={`${id}-t`}>Airspeed indicator with V-speed arcs</title>
        <circle cx={cx} cy={cy} r={106} fill="var(--color-bezel)" stroke="oklch(0.35 0.03 258)" />
        <circle cx={cx} cy={cy} r={100} fill="var(--color-panel)" />
        {/* arcs */}
        <path
          d={arcPath(cx, cy, R - 9, ang(v.so), ang(v.fe))}
          stroke="white"
          strokeWidth={5}
          fill="none"
        />
        <path
          d={arcPath(cx, cy, R - 2, ang(v.s1), ang(v.no))}
          stroke="var(--color-ok)"
          strokeWidth={6}
          fill="none"
        />
        <path
          d={arcPath(cx, cy, R - 2, ang(v.no), ang(v.ne))}
          stroke="var(--color-caution)"
          strokeWidth={6}
          fill="none"
        />
        {(() => {
          const a = polar(cx, cy, R + 3, ang(v.ne));
          const b = polar(cx, cy, R - 14, ang(v.ne));
          return (
            <line
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke="var(--color-warning)"
              strokeWidth={3}
            />
          );
        })()}
        {v.mc !== undefined
          ? (() => {
              const a = polar(cx, cy, R + 3, ang(v.mc));
              const b = polar(cx, cy, R - 14, ang(v.mc));
              return (
                <line
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke="var(--color-warning)"
                  strokeWidth={2.5}
                />
              );
            })()
          : null}
        {perf.engines > 1 && perf.powerType !== "jet"
          ? (() => {
              const a = polar(cx, cy, R + 3, ang(v.y));
              const b = polar(cx, cy, R - 14, ang(v.y));
              return (
                <line
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke="oklch(0.65 0.18 250)"
                  strokeWidth={2.5}
                />
              );
            })()
          : null}
        {ticks.map(({ s, major }) => {
          const a = polar(cx, cy, R - 6, ang(s));
          const b = polar(cx, cy, R - (major ? 18 : 12), ang(s));
          return (
            <line
              key={s}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke="oklch(0.92 0 0)"
              strokeWidth={major ? 1.4 : 0.7}
            />
          );
        })}
        {ticks
          .filter((t) => t.major && t.s > 0)
          .map(({ s }) => {
            const p = polar(cx, cy, R - 29, ang(s));
            return (
              <text
                key={s}
                x={p.x}
                y={p.y + 3.5}
                fontSize={10}
                textAnchor="middle"
                fill="oklch(0.95 0 0)"
                fontFamily="var(--font-mono)"
              >
                {s}
              </text>
            );
          })}
        <text x={cx} y={cy - 26} fontSize={8} textAnchor="middle" fill={DIM} letterSpacing={1.5}>
          AIRSPEED
        </text>
        <text x={cx} y={cy + 36} fontSize={8} textAnchor="middle" fill={DIM} letterSpacing={1.5}>
          KNOTS
        </text>
        <text
          x={cx}
          y={cy + 52}
          fontSize={12}
          textAnchor="middle"
          fill="var(--color-cyan)"
          fontFamily="var(--font-mono)"
        >
          {needle} KIAS
        </text>
        {/* needle */}
        <line
          x1={cx}
          y1={cy}
          x2={np.x}
          y2={np.y}
          stroke="white"
          strokeWidth={2.5}
          strokeLinecap="round"
          style={{ transition: "all 120ms ease-out" }}
        />
        <circle cx={cx} cy={cy} r={6} fill="oklch(0.25 0.02 258)" stroke="oklch(0.5 0.02 258)" />
      </svg>
      <div className="mt-3">
        <label className="label-caps flex items-center justify-between" htmlFor={`${id}-r`}>
          <span>Move the needle</span>
          <span className="font-mono text-foreground">{needle} KIAS</span>
        </label>
        <input
          id={`${id}-r`}
          type="range"
          min={0}
          max={max}
          value={needle}
          onChange={(e) => setNeedle(Number(e.target.value))}
          className="mt-1 w-full accent-[var(--color-primary)]"
        />
        <div className="mt-2 rounded-md border bg-muted/40 px-3 py-2 text-xs">
          <div className={`font-semibold ${toneCls}`}>{zone.label}</div>
          <div className="mt-0.5 text-muted-foreground">{zone.text}</div>
        </div>
      </div>
    </div>
  );
}

export function ArcLegend({ perf }: { perf: AircraftPerf }) {
  const v = perf.v;
  const rows: { sw: string; label: string; range: string }[] = [
    {
      sw: "bg-white",
      label: "White arc — flap operating range",
      range: `${v.so}–${v.fe} KIAS (Vso–Vfe)`,
    },
    {
      sw: "bg-ok",
      label: "Green arc — normal operating range",
      range: `${v.s1}–${v.no} KIAS (Vs1–Vno)`,
    },
    {
      sw: "bg-caution",
      label: "Yellow arc — caution, smooth air only",
      range: `${v.no}–${v.ne} KIAS (Vno–Vne)`,
    },
    {
      sw: "bg-warning",
      label:
        perf.powerType === "piston"
          ? "Red line — never exceed"
          : "Red line — max operating (Vmo approx.)",
      range: `${v.ne} KIAS`,
    },
  ];
  if (v.mc !== undefined)
    rows.push({ sw: "bg-warning", label: "Red radial — Vmc", range: `${v.mc} KIAS` });
  if (perf.engines > 1 && perf.powerType !== "jet")
    rows.push({
      sw: "bg-[oklch(0.65_0.18_250)]",
      label: "Blue line — Vyse (≈Vy in this model)",
      range: `${v.y} KIAS`,
    });
  return (
    <ul className="space-y-1.5 text-xs">
      {rows.map((r) => (
        <li key={r.label} className="flex items-center gap-2">
          <span className={`h-2 w-5 shrink-0 rounded-sm ${r.sw}`} />
          <span className="flex-1 text-muted-foreground">{r.label}</span>
          <span className="font-mono tabular">{r.range}</span>
        </li>
      ))}
    </ul>
  );
}
