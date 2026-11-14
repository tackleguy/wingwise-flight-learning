/**
 * Shared page primitives. Use these on every page so the platform looks consistent:
 *
 *   <Page>
 *     <PageHeader eyebrow="Train" title="Weather Lab" description="..." actions={<Button/>} />
 *     <Section title="..." description="..."> ... </Section>
 *   </Page>
 */
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { AlertTriangle, Info, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function Page({
  children,
  className,
  wide,
}: {
  children: ReactNode;
  className?: string;
  wide?: boolean;
}) {
  return (
    <div
      className={cn(
        "mx-auto w-full px-4 py-6 sm:px-6 lg:py-8",
        wide ? "max-w-[1600px]" : "max-w-7xl",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  icon: Icon,
}: {
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  icon?: LucideIcon;
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 border-b pb-5 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        {eyebrow ? <p className="label-caps mb-1.5 text-primary">{eyebrow}</p> : null}
        <h1 className="flex items-center gap-2.5 text-2xl font-bold tracking-tight sm:text-[28px]">
          {Icon ? <Icon className="size-6 text-primary" /> : null}
          {title}
        </h1>
        {description ? (
          <p className="mt-1.5 max-w-3xl text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function Section({
  title,
  description,
  actions,
  children,
  className,
}: {
  title?: string;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("mb-8", className)}>
      {title || actions ? (
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            {title ? <h2 className="text-base font-semibold tracking-tight">{title}</h2> : null}
            {description ? (
              <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
            ) : null}
          </div>
          {actions}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function Panel({
  children,
  className,
  title,
  actions,
}: {
  children: ReactNode;
  className?: string;
  title?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className={cn("panel min-w-0", className)}>
      {title || actions ? (
        <div className="flex items-center justify-between gap-2 border-b px-4 py-2.5">
          <div className="label-caps">{title}</div>
          {actions}
        </div>
      ) : null}
      <div className="p-4">{children}</div>
    </div>
  );
}

export function Stat({
  label,
  value,
  sub,
  tone = "default",
  icon: Icon,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: "default" | "ok" | "caution" | "warning" | "primary";
  icon?: LucideIcon;
}) {
  const toneCls = {
    default: "text-foreground",
    ok: "text-ok",
    caution: "text-caution",
    warning: "text-warning",
    primary: "text-primary",
  }[tone];
  return (
    <div className="panel px-4 py-3">
      <div className="flex items-center justify-between">
        <span className="label-caps">{label}</span>
        {Icon ? <Icon className="size-4 text-muted-foreground" /> : null}
      </div>
      <div className={cn("mt-1.5 font-mono text-2xl font-semibold tabular", toneCls)}>{value}</div>
      {sub ? <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div> : null}
    </div>
  );
}

/** Horizontal proficiency bar, value 0–100. */
export function Meter({
  value,
  label,
  className,
}: {
  value: number;
  label?: string;
  className?: string;
}) {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  const color = v >= 80 ? "bg-ok" : v >= 60 ? "bg-primary" : v >= 35 ? "bg-caution" : "bg-warning";
  return (
    <div className={className}>
      {label ? (
        <div className="mb-1 flex justify-between text-xs">
          <span className="text-muted-foreground">{label}</span>
          <span className="font-mono tabular">{v}%</span>
        </div>
      ) : null}
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full transition-all", color)}
          style={{ width: `${v}%` }}
        />
      </div>
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon?: LucideIcon;
  title: string;
  description?: ReactNode;
  action?: { to: string; label: string };
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed px-6 py-10 text-center">
      {Icon ? <Icon className="mb-3 size-8 text-muted-foreground" /> : null}
      <p className="font-semibold">{title}</p>
      {description ? (
        <p className="mt-1 max-w-md text-sm text-muted-foreground">{description}</p>
      ) : null}
      {action ? (
        <Link
          to={action.to}
          className="mt-4 inline-flex items-center rounded-md bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
        >
          {action.label}
        </Link>
      ) : null}
    </div>
  );
}

/** Notice used to clearly label simulated / educational / non-official content. */
/**
 * Quiet notice used to label simulated / educational / non-official content.
 * Disclaimers (tone "caution" with a title) show only their headline; the full text is one
 * click away under "Details", so pages stay uncluttered without hiding the key message.
 */
export function Notice({
  children,
  tone = "info",
  title,
  className,
  open,
}: {
  children: ReactNode;
  tone?: "info" | "caution";
  title?: string;
  className?: string;
  /** Force the details open (or closed). Defaults: caution+title → collapsed. */
  open?: boolean;
}) {
  const Icon = tone === "caution" ? AlertTriangle : Info;
  const iconCls = tone === "caution" ? "text-caution" : "text-primary";
  const collapsible = !!title && (open === undefined ? tone === "caution" : !open);
  if (collapsible) {
    return (
      <details className={cn("group text-xs text-muted-foreground", className)}>
        <summary className="flex cursor-pointer list-none items-center gap-2 py-1 select-none [&::-webkit-details-marker]:hidden">
          <Icon className={cn("size-3.5 shrink-0", iconCls)} />
          <span className="font-medium text-foreground/80">{title}</span>
          <span className="text-[11px] text-muted-foreground/80 underline-offset-2 group-open:hidden hover:underline">
            Details
          </span>
        </summary>
        <div className="mt-1 border-l border-border pl-3 leading-relaxed">{children}</div>
      </details>
    );
  }
  return (
    <div
      className={cn(
        "flex gap-2 border-l-2 py-1 pl-3 text-xs leading-relaxed text-muted-foreground",
        tone === "caution" ? "border-caution/60" : "border-primary/50",
        className,
      )}
    >
      <Icon className={cn("mt-0.5 size-3.5 shrink-0", iconCls)} />
      <div>
        {title ? <span className="font-medium text-foreground/85">{title} </span> : null}
        {children}
      </div>
    </div>
  );
}

export function Pill({
  children,
  tone = "default",
  className,
}: {
  children: ReactNode;
  tone?: "default" | "ok" | "caution" | "warning" | "primary" | "magenta" | "cyan";
  className?: string;
}) {
  const toneCls = {
    default: "border-border bg-muted text-muted-foreground",
    ok: "border-ok/30 bg-ok/10 text-ok",
    caution: "border-caution/30 bg-caution/10 text-caution",
    warning: "border-warning/30 bg-warning/10 text-warning",
    primary: "border-primary/30 bg-primary/10 text-primary",
    magenta: "border-magenta/30 bg-magenta/10 text-magenta",
    cyan: "border-cyan/30 bg-cyan/10 text-cyan",
  }[tone];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase",
        toneCls,
        className,
      )}
    >
      {children}
    </span>
  );
}

export function formatDuration(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
