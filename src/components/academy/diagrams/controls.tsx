/** Small control primitives shared by the interactive diagrams and exercises. */
import type { ReactNode } from "react";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";

export function SliderControl({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  format,
  className,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  format?: (v: number) => string;
  className?: string;
}) {
  return (
    <label className={cn("block", className)}>
      <div className="mb-1.5 flex items-baseline justify-between gap-2 text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono font-semibold text-cyan tabular">
          {format ? format(value) : value}
        </span>
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={(v) => {
          const n = v[0];
          if (typeof n === "number") onChange(n);
        }}
        aria-label={label}
      />
    </label>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  className,
  size = "sm",
}: {
  options: { value: T; label: ReactNode }[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
  size?: "sm" | "xs";
}) {
  return (
    <div
      role="radiogroup"
      className={cn("inline-flex flex-wrap rounded-md border bg-muted/50 p-0.5", className)}
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded px-2.5 font-medium transition-colors",
            size === "sm" ? "py-1 text-xs" : "py-0.5 text-[11px]",
            value === o.value
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function ToggleChip({
  on,
  onToggle,
  children,
  tone = "primary",
}: {
  on: boolean;
  onToggle: () => void;
  children: ReactNode;
  tone?: "primary" | "warning" | "caution";
}) {
  const onCls = {
    primary: "border-primary bg-primary/15 text-primary",
    warning: "border-warning bg-warning/15 text-warning",
    caution: "border-caution bg-caution/15 text-caution",
  }[tone];
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onToggle}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors",
        on ? onCls : "text-muted-foreground hover:text-foreground",
      )}
    >
      <span className={cn("size-2 rounded-full", on ? "bg-current" : "bg-muted-foreground/40")} />
      {children}
    </button>
  );
}

export function Readout({
  label,
  value,
  tone = "cyan",
  sub,
}: {
  label: string;
  value: ReactNode;
  tone?: "cyan" | "ok" | "caution" | "warning" | "magenta" | "default";
  sub?: ReactNode;
}) {
  const cls = {
    cyan: "text-cyan",
    ok: "text-ok",
    caution: "text-caution",
    warning: "text-warning",
    magenta: "text-magenta",
    default: "text-foreground",
  }[tone];
  return (
    <div className="rounded-md border bg-panel px-2.5 py-1.5">
      <div className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
        {label}
      </div>
      <div className={cn("font-mono text-sm font-semibold tabular", cls)}>{value}</div>
      {sub ? <div className="text-[10px] text-muted-foreground">{sub}</div> : null}
    </div>
  );
}

/** Layout used by every diagram: SVG stage on top/left, controls & info on the side. */
export function DiagramLayout({
  stage,
  controls,
  info,
}: {
  stage: ReactNode;
  controls?: ReactNode;
  info?: ReactNode;
}) {
  return (
    <div className="@container">
      <div className="grid gap-4 @2xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="avionics-screen self-start overflow-hidden">{stage}</div>
        <div className="flex min-w-0 flex-col gap-3">
          {controls ? <div className="space-y-3">{controls}</div> : null}
          {info}
        </div>
      </div>
    </div>
  );
}

/** SVG arrow marker definitions; reference with markerEnd="url(#ax-<color>)". */
export function ArrowDefs({ id = "ax" }: { id?: string }) {
  const colors: Record<string, string> = {
    ok: "var(--color-ok)",
    warn: "var(--color-warning)",
    caution: "var(--color-caution)",
    cyan: "var(--color-cyan)",
    magenta: "var(--color-magenta)",
    primary: "var(--color-primary)",
    fg: "var(--color-foreground)",
    muted: "var(--color-muted-foreground)",
  };
  return (
    <defs>
      {Object.entries(colors).map(([k, c]) => (
        <marker
          key={k}
          id={`${id}-${k}`}
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path d="M0,0 L10,5 L0,10 z" fill={c} />
        </marker>
      ))}
    </defs>
  );
}

export const C = {
  ok: "var(--color-ok)",
  warn: "var(--color-warning)",
  caution: "var(--color-caution)",
  cyan: "var(--color-cyan)",
  magenta: "var(--color-magenta)",
  primary: "var(--color-primary)",
  fg: "var(--color-foreground)",
  muted: "var(--color-muted-foreground)",
  border: "var(--color-border)",
  panel: "var(--color-panel)",
  sky: "var(--color-sky)",
  ground: "var(--color-ground)",
  card: "var(--color-card)",
};
