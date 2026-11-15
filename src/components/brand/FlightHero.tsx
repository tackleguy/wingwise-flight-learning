/**
 * FlightHero — an interactive, synthetic-vision style artificial horizon used as the dashboard hero.
 *
 * Move the pointer over it and the "aircraft" banks and pitches toward it (spring-smoothed); leave it
 * alone and a gentle autopilot takes over. Heading, airspeed, altitude and vertical speed respond to
 * the attitude like a real aircraft would (bank → turn, pitch → climb and lose speed), and a
 * perspective ground grid streams past to give a sense of speed.
 *
 * Rendering is plain SVG; the animation loop writes attributes through refs (no React re-renders
 * per frame), pauses when the hero is off-screen or the tab is hidden, and is disabled entirely
 * for reduced motion (a still, slightly banked pose is shown instead).
 */
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { MousePointer2 } from "lucide-react";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { cn } from "@/lib/utils";

const LADDER = [-20, -15, -10, -5, 5, 10, 15, 20];
const BANK_TICKS = [-60, -45, -30, -20, -10, 0, 10, 20, 30, 45, 60];
const GRID_N = 16;
const RAYS = 23;
/** Cloud puffs: x in hero widths from centre, y in hero heights above the horizon, size, depth. */
const CLOUDS = [
  { x: -0.95, y: 0.55, s: 1.25, d: 0.35 },
  { x: -0.35, y: 0.32, s: 0.8, d: 0.6 },
  { x: 0.25, y: 0.7, s: 1.5, d: 0.25 },
  { x: 0.7, y: 0.4, s: 0.9, d: 0.5 },
  { x: 1.15, y: 0.22, s: 0.65, d: 0.85 },
  { x: -1.4, y: 0.25, s: 0.7, d: 0.75 },
];
const HDG_PX = 4.2; // px per degree on the heading tape
const IAS_PX = 2.2; // px per knot
const ALT_PX = 0.09; // px per foot

/** Round SVG coordinates so server and browser render identical attribute strings. */
const r2 = (n: number) => Math.round(n * 100) / 100;
const clamp = (v: number, lo = -1, hi = 1) => Math.max(lo, Math.min(hi, v));
const wrap360 = (v: number) => ((v % 360) + 360) % 360;
const hdgLabel = (d: number) => {
  const n = wrap360(d);
  return n === 0 ? "N" : n === 90 ? "E" : n === 180 ? "S" : n === 270 ? "W" : String(n / 10);
};

interface Sim {
  bank: number;
  pitch: number;
  vb: number;
  vp: number;
  ias: number;
  alt: number;
  vs: number;
  hdg: number;
  phase: number;
  t: number;
  px: number;
  py: number;
  lastPointer: number;
  cloudX: number[];
}

export function FlightHero({
  children,
  className,
  overlay,
}: {
  /** Text / call-to-action content shown over the left side (top on phones). */
  children: ReactNode;
  className?: string;
  /** Optional content pinned to the bottom of the hero (e.g. readouts). */
  overlay?: ReactNode;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const id = (k: string) => `fh-${k}-${uid}`;
  const rootRef = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const [size, setSize] = useState({ w: 1200, h: 440 });
  const [interacted, setInteracted] = useState(false);

  const L = useMemo(() => {
    const { w, h } = size;
    const wide = w >= 860;
    const cx = wide ? w * 0.72 : w * 0.5;
    const cy = wide ? h * 0.48 : Math.min(h * 0.27, 150);
    const R = wide ? Math.min(h * 0.33, 150) : Math.min(w * 0.3, 110);
    const px = R / 11; // px per degree of pitch
    return { w, h, wide, cx, cy, R, px };
  }, [size]);

  const sim = useRef<Sim>({
    bank: 9,
    pitch: 2.5,
    vb: 0,
    vp: 0,
    ias: 108,
    alt: 4500,
    vs: 0,
    hdg: 305,
    phase: 0,
    t: 0,
    px: 0,
    py: 0,
    lastPointer: -1e9,
    cloudX: CLOUDS.map((c) => c.x),
  });

  const worldRef = useRef<SVGGElement>(null);
  const ladderRef = useRef<SVGGElement>(null);
  const bankRef = useRef<SVGGElement>(null);
  const gridRefs = useRef<(SVGLineElement | null)[]>([]);
  const cloudRefs = useRef<(SVGGElement | null)[]>([]);
  const hdgTapeRef = useRef<SVGGElement>(null);
  const iasTapeRef = useRef<SVGGElement>(null);
  const altTapeRef = useRef<SVGGElement>(null);
  const hdgTextRef = useRef<SVGTextElement>(null);
  const iasTextRef = useRef<SVGTextElement>(null);
  const altTextRef = useRef<SVGTextElement>(null);
  const vsTextRef = useRef<SVGTextElement>(null);

  // Track the hero's real size.
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      if (!e) return;
      const { width, height } = e.contentRect;
      if (width > 0 && height > 0) setSize({ w: Math.round(width), h: Math.round(height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Animation loop.
  useEffect(() => {
    const s = sim.current;
    const shown = { ias: -1, alt: -1, vs: -1, hdg: -1 };

    const apply = () => {
      const tr = `translate(${L.cx} ${L.cy}) rotate(${-s.bank}) translate(0 ${s.pitch * L.px})`;
      worldRef.current?.setAttribute("transform", tr);
      ladderRef.current?.setAttribute("transform", tr);
      bankRef.current?.setAttribute("transform", `translate(${L.cx} ${L.cy}) rotate(${-s.bank})`);
      // Perspective ground grid: equally spaced in depth, so lines bunch toward the horizon.
      const G = L.h * 0.42;
      const frac = s.phase % 1;
      for (let k = 0; k < GRID_N; k++) {
        const el = gridRefs.current[k];
        if (!el) continue;
        const z = 0.45 + k - frac;
        const y = G / z;
        el.setAttribute("y1", y.toFixed(1));
        el.setAttribute("y2", y.toFixed(1));
        el.setAttribute("stroke-opacity", (Math.min(1, y / (L.h * 0.22)) * 0.32).toFixed(3));
      }
      CLOUDS.forEach((c, i) => {
        const el = cloudRefs.current[i];
        if (!el) return;
        el.setAttribute(
          "transform",
          `translate(${((s.cloudX[i] ?? c.x) * L.w).toFixed(1)} ${(-c.y * L.h).toFixed(1)}) scale(${c.s})`,
        );
      });
      hdgTapeRef.current?.setAttribute("transform", `translate(${(-s.hdg * HDG_PX).toFixed(1)} 0)`);
      iasTapeRef.current?.setAttribute("transform", `translate(0 ${(s.ias * IAS_PX).toFixed(1)})`);
      altTapeRef.current?.setAttribute("transform", `translate(0 ${(s.alt * ALT_PX).toFixed(1)})`);
      const ias = Math.round(s.ias);
      const alt = Math.round(s.alt / 10) * 10;
      const vs = Math.round(s.vs / 50) * 50;
      const hdg = Math.round(wrap360(s.hdg)) % 360;
      if (ias !== shown.ias && iasTextRef.current) iasTextRef.current.textContent = String(ias);
      if (alt !== shown.alt && altTextRef.current)
        altTextRef.current.textContent = alt.toLocaleString("en-US");
      if (vs !== shown.vs && vsTextRef.current)
        vsTextRef.current.textContent = `${vs > 0 ? "▲" : vs < 0 ? "▼" : ""} ${Math.abs(vs)}`;
      if (hdg !== shown.hdg && hdgTextRef.current)
        hdgTextRef.current.textContent = String(hdg === 0 ? 360 : hdg).padStart(3, "0");
      shown.ias = ias;
      shown.alt = alt;
      shown.vs = vs;
      shown.hdg = hdg;
    };

    apply();
    if (reduced) return;

    let raf = 0;
    let last = performance.now();
    let visible = true;
    const step = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      s.t += dt;
      const t = s.t;
      // Targets: follow the pointer while it's active, otherwise a lazy autopilot S-turn.
      let tb: number;
      let tp: number;
      if (now - s.lastPointer < 1800) {
        tb = clamp((s.px - L.cx) / (L.w * 0.26)) * 40;
        tp = clamp((L.cy - s.py) / (L.h * 0.42)) * 13;
      } else {
        tb = 17 * Math.sin(t * 0.21) + 6 * Math.sin(t * 0.53 + 0.6);
        tp = 2.4 * Math.sin(t * 0.29 + 1) + 1.4;
      }
      // Spring-damper toward the targets (slightly under-damped, so it feels like it has mass).
      const k = 9;
      const c = 2 * Math.sqrt(k) * 0.8;
      s.vb += (k * (tb - s.bank) - c * s.vb) * dt;
      s.vp += (k * (tp - s.pitch) - c * s.vp) * dt;
      s.bank += s.vb * dt;
      s.pitch += s.vp * dt;
      // Simple aircraft response.
      const iasT = 112 - s.pitch * 3.2 + Math.abs(s.bank) * 0.08;
      s.ias += (iasT - s.ias) * Math.min(1, dt * 0.7);
      s.vs = s.ias * 101.27 * Math.sin((s.pitch * Math.PI) / 180);
      s.alt = Math.max(500, Math.min(15000, s.alt + (s.vs * dt) / 60));
      const turnRate = (1091 * Math.tan((s.bank * Math.PI) / 180)) / Math.max(60, s.ias);
      s.hdg = wrap360(s.hdg + turnRate * dt);
      s.phase += s.ias * dt * 0.011;
      CLOUDS.forEach((c, i) => {
        let x = (s.cloudX[i] ?? c.x) - (0.006 + c.d * 0.012) * dt - turnRate * dt * 0.012;
        if (x < -1.7) x += 3.4;
        if (x > 1.7) x -= 3.4;
        s.cloudX[i] = x;
      });
      apply();
      if (visible && !document.hidden) raf = requestAnimationFrame(step);
    };
    const start = () => {
      cancelAnimationFrame(raf);
      last = performance.now();
      raf = requestAnimationFrame(step);
    };
    const io = new IntersectionObserver(([e]) => {
      visible = !!e?.isIntersecting;
      if (visible) start();
      else cancelAnimationFrame(raf);
    });
    if (rootRef.current) io.observe(rootRef.current);
    const onVis = () => {
      if (!document.hidden && visible) start();
    };
    document.addEventListener("visibilitychange", onVis);
    start();
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [L, reduced]);

  const onPointer = (e: React.PointerEvent) => {
    const r = rootRef.current?.getBoundingClientRect();
    if (!r) return;
    const s = sim.current;
    s.px = e.clientX - r.left;
    s.py = e.clientY - r.top;
    s.lastPointer = performance.now();
    if (!interacted) setInteracted(true);
  };

  const s0 = sim.current;
  const initial = `translate(${L.cx} ${L.cy}) rotate(${-s0.bank}) translate(0 ${s0.pitch * L.px})`;
  const big = L.w * 3;
  const scale = L.R / 150;
  const tapeH = L.R * 1.7;
  const iasX = L.cx - L.R - 78;
  const altX = L.cx + L.R + 30;

  return (
    <div
      ref={rootRef}
      onPointerMove={reduced ? undefined : onPointer}
      onPointerDown={reduced ? undefined : onPointer}
      className={cn(
        "tx-night-tint relative isolate overflow-hidden rounded-2xl border border-white/10 bg-[#050b18] shadow-[0_40px_100px_-40px_oklch(0.5_0.18_255/0.55),inset_0_1px_0_oklch(1_0_0/0.08)] [touch-action:pan-y]",
        className,
      )}
    >
      <svg
        aria-hidden
        className="absolute inset-0 -z-10 size-full font-mono select-none"
        viewBox={`0 0 ${L.w} ${L.h}`}
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient
            id={id("sky")}
            x1="0"
            y1={-L.h * 1.4}
            x2="0"
            y2="0"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0" stopColor="#040a1c" />
            <stop offset=".5" stopColor="#0b2257" />
            <stop offset=".82" stopColor="#1d4fa6" />
            <stop offset=".96" stopColor="#4b94e6" />
            <stop offset="1" stopColor="#9ad8ff" />
          </linearGradient>
          <linearGradient
            id={id("gnd")}
            x1="0"
            y1="0"
            x2="0"
            y2={L.h * 1.2}
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0" stopColor="#0d2142" />
            <stop offset=".35" stopColor="#071328" />
            <stop offset="1" stopColor="#02060f" />
          </linearGradient>
          <radialGradient id={id("dawn")}>
            <stop offset="0" stopColor="#ffb86b" stopOpacity=".42" />
            <stop offset=".45" stopColor="#ff8f5a" stopOpacity=".12" />
            <stop offset="1" stopColor="#ff8f5a" stopOpacity="0" />
          </radialGradient>
          <linearGradient
            id={id("ray")}
            x1="0"
            y1="0"
            x2="0"
            y2={L.h}
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0" stopColor="#38bdf8" stopOpacity="0" />
            <stop offset=".5" stopColor="#38bdf8" stopOpacity=".22" />
            <stop offset="1" stopColor="#38bdf8" stopOpacity=".32" />
          </linearGradient>
          <filter id={id("blur")} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="18" />
          </filter>
          <filter id={id("glow")} x="-20%" y="-200%" width="140%" height="500%">
            <feGaussianBlur stdDeviation="4" />
          </filter>
          <clipPath id={id("ladder")}>
            <rect
              x={L.cx - L.R * 0.95}
              y={L.cy - L.R * 0.78}
              width={L.R * 1.9}
              height={L.R * 1.56}
              rx={16}
            />
          </clipPath>
          <clipPath id={id("hdg")}>
            <rect x={L.cx - L.R - 20} y={L.h - 46} width={L.R * 2 + 40} height={34} rx={8} />
          </clipPath>
          <clipPath id={id("ias")}>
            <rect x={iasX} y={L.cy - tapeH / 2} width={48} height={tapeH} rx={8} />
          </clipPath>
          <clipPath id={id("alt")}>
            <rect x={altX} y={L.cy - tapeH / 2} width={56} height={tapeH} rx={8} />
          </clipPath>
          <linearGradient id={id("fadeV")} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fff" stopOpacity="0" />
            <stop offset=".2" stopColor="#fff" stopOpacity="1" />
            <stop offset=".8" stopColor="#fff" stopOpacity="1" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
          <mask id={id("iasMask")}>
            <rect
              x={iasX}
              y={L.cy - tapeH / 2}
              width={48}
              height={tapeH}
              fill={`url(#${id("fadeV")})`}
            />
          </mask>
          <mask id={id("altMask")}>
            <rect
              x={altX}
              y={L.cy - tapeH / 2}
              width={56}
              height={tapeH}
              fill={`url(#${id("fadeV")})`}
            />
          </mask>
        </defs>

        {/* World: sky, dawn glow, clouds, ground grid, horizon — rotates with bank, shifts with pitch */}
        <g ref={worldRef} transform={initial}>
          <rect x={-big} y={-big} width={big * 2} height={big} fill={`url(#${id("sky")})`} />
          <ellipse
            cx={-L.w * 0.18}
            cy={0}
            rx={L.w * 0.55}
            ry={L.h * 0.32}
            fill={`url(#${id("dawn")})`}
          />
          <g filter={`url(#${id("blur")})`} opacity=".9">
            {CLOUDS.map((c, i) => (
              <g
                key={i}
                ref={(el) => {
                  cloudRefs.current[i] = el;
                }}
                transform={`translate(${c.x * L.w} ${-c.y * L.h}) scale(${c.s})`}
                fill="#cfe6ff"
                opacity={0.07 + c.d * 0.1}
              >
                <ellipse cx="0" cy="0" rx="120" ry="26" />
                <ellipse cx="-50" cy="-14" rx="60" ry="24" />
                <ellipse cx="40" cy="-18" rx="70" ry="28" />
              </g>
            ))}
          </g>
          <rect x={-big} y={0} width={big * 2} height={big} fill={`url(#${id("gnd")})`} />
          {Array.from({ length: RAYS }, (_, i) => {
            const k = i - (RAYS - 1) / 2;
            return (
              <line
                key={i}
                x1={0}
                y1={0}
                x2={k * L.w * 0.32}
                y2={L.h * 1.4}
                stroke={`url(#${id("ray")})`}
                strokeWidth={1}
              />
            );
          })}
          {Array.from({ length: GRID_N }, (_, k) => (
            <line
              key={k}
              ref={(el) => {
                gridRefs.current[k] = el;
              }}
              x1={-big}
              x2={big}
              y1={(L.h * 0.42) / (0.45 + k)}
              y2={(L.h * 0.42) / (0.45 + k)}
              stroke="#38bdf8"
              strokeOpacity={0.2}
              strokeWidth={1}
            />
          ))}
          <line
            x1={-big}
            x2={big}
            y1={0}
            y2={0}
            stroke="#7dd3fc"
            strokeWidth={6}
            opacity={0.55}
            filter={`url(#${id("glow")})`}
          />
          <line
            x1={-big}
            x2={big}
            y1={0}
            y2={0}
            stroke="#e6f6ff"
            strokeWidth={1.4}
            opacity={0.95}
          />
        </g>

        {/* Pitch ladder (clipped to the centre) */}
        <g clipPath={`url(#${id("ladder")})`}>
          <g ref={ladderRef} transform={initial}>
            {LADDER.map((p) => {
              const y = -p * L.px;
              const major = p % 10 === 0;
              const hw = (major ? 62 : 34) * scale;
              const gap = 20 * scale;
              const tick = p > 0 ? 6 : -6;
              return (
                <g key={p} stroke="#f1f8ff" strokeOpacity={0.85} strokeWidth={1.4} fill="none">
                  <path
                    d={`M ${-hw} ${y + tick} V ${y} H ${-gap} M ${gap} ${y} H ${hw} V ${y + tick}`}
                    strokeDasharray={p < 0 ? "6 4" : undefined}
                  />
                  {major ? (
                    <>
                      <text
                        x={-hw - 8}
                        y={y + 4}
                        textAnchor="end"
                        fill="#f1f8ff"
                        fillOpacity={0.75}
                        stroke="none"
                        fontSize={11 * Math.max(scale, 0.85)}
                      >
                        {Math.abs(p)}
                      </text>
                      <text
                        x={hw + 8}
                        y={y + 4}
                        fill="#f1f8ff"
                        fillOpacity={0.75}
                        stroke="none"
                        fontSize={11 * Math.max(scale, 0.85)}
                      >
                        {Math.abs(p)}
                      </text>
                    </>
                  ) : null}
                </g>
              );
            })}
          </g>
        </g>

        {/* Bank scale (rolls with the aircraft) + fixed pointer */}
        <g ref={bankRef} transform={`translate(${L.cx} ${L.cy}) rotate(${-s0.bank})`}>
          <path
            d={`M ${r2(-L.R * Math.sin(Math.PI / 3))} ${r2(-L.R * Math.cos(Math.PI / 3))} A ${r2(L.R)} ${r2(L.R)} 0 0 1 ${r2(L.R * Math.sin(Math.PI / 3))} ${r2(-L.R * Math.cos(Math.PI / 3))}`}
            fill="none"
            stroke="#f1f8ff"
            strokeOpacity={0.35}
            strokeWidth={1.2}
          />
          {BANK_TICKS.map((b) => {
            const len = b === 0 ? 0 : Math.abs(b) === 30 || Math.abs(b) === 60 ? 14 : 8;
            const a = (b * Math.PI) / 180;
            const x1 = r2(L.R * Math.sin(a));
            const y1 = r2(-L.R * Math.cos(a));
            const x2 = r2((L.R + len) * Math.sin(a));
            const y2 = r2(-(L.R + len) * Math.cos(a));
            return b === 0 ? (
              <path key={b} d={`M 0 ${-L.R} l -7 -12 h 14 z`} fill="#f1f8ff" fillOpacity={0.85} />
            ) : (
              <line
                key={b}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke="#f1f8ff"
                strokeOpacity={0.75}
                strokeWidth={1.6}
              />
            );
          })}
        </g>
        <path
          d={`M ${L.cx} ${L.cy - L.R + 3} l -7 12 h 14 z`}
          fill="#fbbf24"
          stroke="#0b1220"
          strokeWidth={1}
        />

        {/* Aircraft reference symbol (fixed) */}
        <g
          transform={`translate(${L.cx} ${L.cy}) scale(${Math.max(scale, 0.7)})`}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        >
          <path
            d="M -104 0 H -44 V 12 M 104 0 H 44 V 12"
            stroke="#04070f"
            strokeWidth={9}
            strokeOpacity={0.6}
          />
          <path d="M -104 0 H -44 V 12 M 104 0 H 44 V 12" stroke="#fbbf24" strokeWidth={4.5} />
          <rect
            x={-5}
            y={-5}
            width={10}
            height={10}
            fill="#fbbf24"
            stroke="#04070f"
            strokeWidth={2}
            rx={1.5}
          />
        </g>

        {L.wide ? (
          <>
            {/* Airspeed tape */}
            <g>
              <rect
                x={iasX}
                y={L.cy - tapeH / 2}
                width={48}
                height={tapeH}
                rx={8}
                fill="#020617"
                fillOpacity={0.45}
                stroke="#ffffff"
                strokeOpacity={0.1}
              />
              <g clipPath={`url(#${id("ias")})`}>
                <g mask={`url(#${id("iasMask")})`}>
                  <g transform={`translate(${iasX} ${L.cy})`}>
                    <g ref={iasTapeRef} transform={`translate(0 ${s0.ias * IAS_PX})`}>
                      {Array.from({ length: 21 }, (_, i) => {
                        const v = 20 + i * 10;
                        const y = -v * IAS_PX;
                        return (
                          <g key={v}>
                            <line
                              x1={40}
                              x2={48}
                              y1={y}
                              y2={y}
                              stroke="#e2f1ff"
                              strokeOpacity={0.6}
                            />
                            {v % 20 === 0 ? (
                              <text
                                x={34}
                                y={y + 3.5}
                                textAnchor="end"
                                fontSize={10}
                                fill="#e2f1ff"
                                fillOpacity={0.7}
                              >
                                {v}
                              </text>
                            ) : null}
                          </g>
                        );
                      })}
                    </g>
                  </g>
                </g>
              </g>
              <g transform={`translate(${iasX - 6} ${L.cy})`}>
                <path
                  d="M 0 -13 H 50 L 58 0 L 50 13 H 0 Z"
                  fill="#020617"
                  stroke="#7dd3fc"
                  strokeOpacity={0.6}
                />
                <text
                  ref={iasTextRef}
                  x={44}
                  y={4.5}
                  textAnchor="end"
                  fontSize={13}
                  fontWeight={600}
                  fill="#ffffff"
                >
                  {Math.round(s0.ias)}
                </text>
              </g>
              <text
                x={iasX + 24}
                y={L.cy - tapeH / 2 - 8}
                textAnchor="middle"
                fontSize={9.5}
                letterSpacing="0.12em"
                fill="#e2f1ff"
                fillOpacity={0.55}
              >
                IAS KT
              </text>
            </g>

            {/* Altitude tape */}
            <g>
              <rect
                x={altX}
                y={L.cy - tapeH / 2}
                width={56}
                height={tapeH}
                rx={8}
                fill="#020617"
                fillOpacity={0.45}
                stroke="#ffffff"
                strokeOpacity={0.1}
              />
              <g clipPath={`url(#${id("alt")})`}>
                <g mask={`url(#${id("altMask")})`}>
                  <g transform={`translate(${altX} ${L.cy})`}>
                    <g ref={altTapeRef} transform={`translate(0 ${s0.alt * ALT_PX})`}>
                      {Array.from({ length: 151 }, (_, i) => {
                        const v = i * 100;
                        const y = -v * ALT_PX;
                        return (
                          <g key={v}>
                            <line
                              x1={0}
                              x2={v % 500 === 0 ? 10 : 6}
                              y1={y}
                              y2={y}
                              stroke="#e2f1ff"
                              strokeOpacity={0.6}
                            />
                            {v % 500 === 0 ? (
                              <text
                                x={14}
                                y={y + 3.5}
                                fontSize={10}
                                fill="#e2f1ff"
                                fillOpacity={0.7}
                              >
                                {v}
                              </text>
                            ) : null}
                          </g>
                        );
                      })}
                    </g>
                  </g>
                </g>
              </g>
              <g transform={`translate(${altX - 8} ${L.cy})`}>
                <path
                  d="M 0 0 L 8 -13 H 72 V 13 H 8 Z"
                  fill="#020617"
                  stroke="#7dd3fc"
                  strokeOpacity={0.6}
                />
                <text
                  ref={altTextRef}
                  x={66}
                  y={4.5}
                  textAnchor="end"
                  fontSize={13}
                  fontWeight={600}
                  fill="#ffffff"
                >
                  {Math.round(s0.alt).toLocaleString("en-US")}
                </text>
              </g>
              <text
                x={altX + 28}
                y={L.cy - tapeH / 2 - 8}
                textAnchor="middle"
                fontSize={9.5}
                letterSpacing="0.12em"
                fill="#e2f1ff"
                fillOpacity={0.55}
              >
                ALT FT
              </text>
              <text
                ref={vsTextRef}
                x={altX + 28}
                y={L.cy + tapeH / 2 + 16}
                textAnchor="middle"
                fontSize={10}
                fill="#67e8f9"
                fillOpacity={0.9}
              >
                0
              </text>
            </g>

            {/* Heading tape */}
            <g>
              <rect
                x={L.cx - L.R - 20}
                y={L.h - 46}
                width={L.R * 2 + 40}
                height={34}
                rx={8}
                fill="#020617"
                fillOpacity={0.5}
                stroke="#ffffff"
                strokeOpacity={0.1}
              />
              <g clipPath={`url(#${id("hdg")})`}>
                <g transform={`translate(${L.cx} ${L.h - 46})`}>
                  <g ref={hdgTapeRef} transform={`translate(${-s0.hdg * HDG_PX} 0)`}>
                    {Array.from({ length: 216 }, (_, i) => {
                      const d = -360 + i * 5;
                      const x = d * HDG_PX;
                      const major = d % 10 === 0;
                      return (
                        <g key={d}>
                          <line
                            x1={x}
                            x2={x}
                            y1={0}
                            y2={major ? 9 : 5}
                            stroke="#e2f1ff"
                            strokeOpacity={0.6}
                          />
                          {d % 30 === 0 ? (
                            <text
                              x={x}
                              y={25}
                              textAnchor="middle"
                              fontSize={11}
                              fontWeight={d % 90 === 0 ? 700 : 400}
                              fill={d % 90 === 0 ? "#7dd3fc" : "#e2f1ff"}
                              fillOpacity={0.85}
                            >
                              {hdgLabel(d)}
                            </text>
                          ) : null}
                        </g>
                      );
                    })}
                  </g>
                </g>
              </g>
              <g transform={`translate(${L.cx} ${L.h - 46})`}>
                <path
                  d="M -24 -24 H 24 V -6 H 6 L 0 0 L -6 -6 H -24 Z"
                  fill="#020617"
                  stroke="#7dd3fc"
                  strokeOpacity={0.6}
                />
                <text
                  ref={hdgTextRef}
                  x={0}
                  y={-10.5}
                  textAnchor="middle"
                  fontSize={12}
                  fontWeight={600}
                  fill="#ffffff"
                >
                  {String(Math.round(s0.hdg)).padStart(3, "0")}
                </text>
              </g>
            </g>
          </>
        ) : null}
      </svg>

      {/* Legibility: darken behind the text (left on desktop, bottom on phones) + soft vignette */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-[5] bg-[linear-gradient(0deg,#050b18_0%,rgb(5_11_24/0.92)_42%,rgb(5_11_24/0.2)_68%,transparent_80%)] md:bg-[linear-gradient(90deg,#050b18_0%,rgb(5_11_24/0.9)_30%,rgb(5_11_24/0.35)_52%,transparent_66%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-[5] bg-[radial-gradient(ellipse_at_center,transparent_55%,rgb(2_6_15/0.55))]"
      />

      {!reduced ? (
        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute top-4 right-4 hidden items-center gap-1.5 rounded-full border border-white/15 bg-black/30 px-2.5 py-1 text-[11px] font-medium text-white/80 backdrop-blur-md transition-all duration-700 md:flex",
            interacted && "translate-y-[-6px] opacity-0",
          )}
        >
          <MousePointer2 className="size-3" />
          Move your cursor to fly
        </div>
      ) : null}

      <div className="relative">{children}</div>
      {overlay}
    </div>
  );
}
