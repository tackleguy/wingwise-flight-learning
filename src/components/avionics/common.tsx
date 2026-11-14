/**
 * Shared building blocks for the TeachX avionics library: the "explain this instrument" context,
 * bezels, soft keys, red-X failure overlays and small SVG helpers.
 */
import { createContext, useContext, type ReactNode } from "react";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";
import type { InstrumentId } from "./instrument-info";

// ---------------------------------------------------------------- explain context

/**
 * Provide this context (value = callback) to show small (i) buttons on every instrument.
 * Without a provider the buttons are not rendered, so embedding pages stay clean.
 */
export const InstrumentExplainContext = createContext<((id: InstrumentId) => void) | null>(null);

export function ExplainButton({
  id,
  className,
  label,
}: {
  id: InstrumentId;
  className?: string | undefined;
  label?: string | undefined;
}) {
  const explain = useContext(InstrumentExplainContext);
  if (!explain) return null;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        explain(id);
      }}
      aria-label={`Explain ${label ?? id}`}
      title="Explain this instrument"
      className={cn(
        "z-10 inline-flex size-6 items-center justify-center rounded-full border border-white/15 bg-black/60 text-white/60 transition hover:border-primary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        className,
      )}
    >
      <Info className="size-3.5" />
    </button>
  );
}

// ---------------------------------------------------------------- frames

/** Dark display bezel with optional title strip (used by PFD, MFD, GPS). */
export function DisplayBezel({
  children,
  title,
  explainId,
  footer,
  className,
}: {
  children: ReactNode;
  title?: ReactNode | undefined;
  explainId?: InstrumentId | undefined;
  footer?: ReactNode | undefined;
  className?: string | undefined;
}) {
  return (
    <div
      className={cn(
        "relative rounded-xl border border-white/10 bg-bezel p-2 shadow-[inset_0_1px_0_oklch(1_0_0/0.06),0_10px_30px_oklch(0_0_0/0.45)]",
        className,
      )}
    >
      {title || explainId ? (
        <div className="mb-1.5 flex items-center justify-between px-1">
          <span className="text-[10px] font-semibold tracking-[0.2em] text-white/40 uppercase">
            {title}
          </span>
          {explainId ? <ExplainButton id={explainId} /> : null}
        </div>
      ) : null}
      {children}
      {footer ? <div className="mt-1.5">{footer}</div> : null}
    </div>
  );
}

/** Round steam-gauge frame with caption and optional explain button. */
export function GaugeFrame({
  children,
  caption,
  explainId,
  className,
  controls,
}: {
  children: ReactNode;
  caption?: string | undefined;
  explainId?: InstrumentId | undefined;
  className?: string | undefined;
  controls?: ReactNode | undefined;
}) {
  return (
    <figure className={cn("relative flex flex-col items-center", className)}>
      <div className="relative aspect-square w-full rounded-2xl bg-bezel p-1.5 shadow-[inset_0_1px_0_oklch(1_0_0/0.07),0_6px_18px_oklch(0_0_0/0.5)]">
        {children}
        {explainId ? (
          <ExplainButton id={explainId} label={caption} className="absolute top-1 right-1" />
        ) : null}
        {controls}
      </div>
      {caption ? (
        <figcaption className="mt-1 text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
          {caption}
        </figcaption>
      ) : null}
    </figure>
  );
}

/** Soft key / bezel push button. */
export function SoftKey({
  children,
  onClick,
  active,
  tone = "default",
  className,
  title,
  disabled,
  ariaLabel,
}: {
  children: ReactNode;
  onClick?: () => void;
  active?: boolean | undefined;
  tone?: "default" | "ok" | "cyan" | "magenta" | "caution" | "warning" | undefined;
  className?: string | undefined;
  title?: string | undefined;
  disabled?: boolean | undefined;
  ariaLabel?: string | undefined;
}) {
  const lit = {
    default: "text-white",
    ok: "text-ok",
    cyan: "text-cyan",
    magenta: "text-magenta",
    caution: "text-caution",
    warning: "text-warning",
  }[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      disabled={disabled}
      aria-label={ariaLabel}
      aria-pressed={active === undefined ? undefined : active}
      className={cn(
        "relative inline-flex h-7 min-w-0 items-center justify-center rounded-[5px] border border-white/10 bg-gradient-to-b from-[oklch(0.3_0.01_258)] to-[oklch(0.2_0.01_258)] px-2 font-mono text-[10px] font-semibold tracking-wider text-white/75 uppercase shadow-[inset_0_1px_0_oklch(1_0_0/0.12),0_1px_2px_oklch(0_0_0/0.6)] transition select-none hover:text-white active:translate-y-px active:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-40",
        active && cn(lit, "border-white/25"),
        className,
      )}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------- SVG helpers

/** Red X failure overlay inside an SVG. */
export function RedX({
  x,
  y,
  w,
  h,
  label,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  label?: string | undefined;
}) {
  return (
    <g pointerEvents="none">
      <rect x={x} y={y} width={w} height={h} fill="black" opacity={0.55} />
      <line x1={x} y1={y} x2={x + w} y2={y + h} stroke="var(--warning)" strokeWidth={4} />
      <line x1={x + w} y1={y} x2={x} y2={y + h} stroke="var(--warning)" strokeWidth={4} />
      {label ? (
        <g>
          <rect
            x={x + w / 2 - label.length * 6 - 8}
            y={y + h / 2 - 13}
            width={label.length * 12 + 16}
            height={26}
            fill="black"
            stroke="var(--warning)"
          />
          <text
            x={x + w / 2}
            y={y + h / 2 + 6}
            textAnchor="middle"
            fill="var(--warning)"
            fontSize={17}
            fontWeight={700}
            fontFamily="var(--font-mono)"
          >
            {label}
          </text>
        </g>
      ) : null}
    </g>
  );
}

/** Point on a circle, 0° = up, clockwise. */
export function polar(cx: number, cy: number, r: number, deg: number) {
  const a = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}

/** SVG arc path, angles in degrees (0 = up, clockwise). */
export function arcPath(cx: number, cy: number, r: number, from: number, to: number) {
  const a = polar(cx, cy, r, from);
  const b = polar(cx, cy, r, to);
  const large = Math.abs(to - from) > 180 ? 1 : 0;
  const sweep = to > from ? 1 : 0;
  return `M ${a.x} ${a.y} A ${r} ${r} 0 ${large} ${sweep} ${b.x} ${b.y}`;
}

export const MONO = "var(--font-mono)";

/** Standard dark gauge face (circle) for steam gauges in a 200×200 viewBox. */
export function GaugeFace({ children }: { children?: ReactNode | undefined }) {
  return (
    <>
      <defs>
        <radialGradient id="tx-gauge-face" cx="50%" cy="40%" r="65%">
          <stop offset="0%" stopColor="#1d2024" />
          <stop offset="100%" stopColor="#0a0b0d" />
        </radialGradient>
        <linearGradient id="tx-gauge-rim" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#4a4f57" />
          <stop offset="100%" stopColor="#15171a" />
        </linearGradient>
      </defs>
      <circle cx={100} cy={100} r={98} fill="url(#tx-gauge-rim)" />
      <circle cx={100} cy={100} r={92} fill="url(#tx-gauge-face)" />
      {children}
    </>
  );
}

/** Glass reflection overlay for steam gauges. */
export function GaugeGlass() {
  return (
    <g pointerEvents="none">
      <circle
        cx={100}
        cy={100}
        r={92}
        fill="none"
        stroke="black"
        strokeOpacity={0.6}
        strokeWidth={3}
      />
      <path d="M 30 70 A 80 80 0 0 1 150 25 A 95 95 0 0 0 30 70 Z" fill="white" opacity={0.05} />
    </g>
  );
}

/** Small flag (e.g. "OFF", "NAV", "GS") drawn in a gauge. */
export function Flag({
  x,
  y,
  text,
  color = "var(--warning)",
  w,
}: {
  x: number;
  y: number;
  text: string;
  color?: string | undefined;
  w?: number | undefined;
}) {
  const width = w ?? text.length * 8 + 10;
  return (
    <g>
      <rect x={x - width / 2} y={y - 9} width={width} height={18} rx={2} fill={color} />
      <text
        x={x}
        y={y + 4.5}
        textAnchor="middle"
        fontSize={12}
        fontWeight={800}
        fill="black"
        fontFamily={MONO}
      >
        {text}
      </text>
    </g>
  );
}
