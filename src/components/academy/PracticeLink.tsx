import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import {
  ArrowRight,
  Building2,
  CloudSun,
  Gauge,
  Map,
  MessageSquareText,
  Plane,
  PlaneTakeoff,
  Radio,
  Route,
  type LucideIcon,
} from "lucide-react";

/** Split "/simulator?scenario=vfr-pattern" into a router path and a search object. */
export function splitHref(href: string): { to: string; search: Record<string, string> } {
  const [path = "/", query = ""] = href.split("?");
  const search: Record<string, string> = {};
  new URLSearchParams(query).forEach((v, k) => {
    search[k] = v;
  });
  return { to: path, search };
}

export function practiceIcon(href: string): LucideIcon {
  const p = href.split("?")[0] ?? "";
  if (p.startsWith("/simulator")) return PlaneTakeoff;
  if (p.startsWith("/avionics")) return Gauge;
  if (p.startsWith("/ai-atc")) return MessageSquareText;
  if (p.startsWith("/atc")) return Radio;
  if (p.startsWith("/weather")) return CloudSun;
  if (p.startsWith("/navigation")) return Map;
  if (p.startsWith("/planner")) return Route;
  if (p.startsWith("/aircraft")) return Plane;
  if (p.startsWith("/airports")) return Building2;
  return ArrowRight;
}

export function practiceArea(href: string): string {
  const p = href.split("?")[0] ?? "";
  if (p.startsWith("/simulator")) return "Flight simulator";
  if (p.startsWith("/avionics")) return "Avionics lab";
  if (p.startsWith("/ai-atc")) return "AI ATC practice";
  if (p.startsWith("/atc")) return "ATC simulator";
  if (p.startsWith("/weather")) return "Weather lab";
  if (p.startsWith("/navigation")) return "Navigation & charts";
  if (p.startsWith("/planner")) return "Flight planner";
  if (p.startsWith("/aircraft")) return "Aircraft library";
  if (p.startsWith("/airports")) return "Airport database";
  if (p.startsWith("/exam")) return "Written exam";
  if (p.startsWith("/oral-exam")) return "Oral exam";
  if (p.startsWith("/checkrides")) return "Mock checkride";
  return "Practice";
}

/** A router link that accepts a full href (path + query string). */
export function HrefLink({
  href,
  className,
  children,
  title,
}: {
  href: string;
  className?: string;
  children: ReactNode;
  title?: string;
}) {
  const { to, search } = splitHref(href);
  return (
    <Link to={to} search={search} className={className} title={title}>
      {children}
    </Link>
  );
}

/**
 * Link into another part of the platform. Default: a quiet bordered row (used inside lessons).
 * `compact`: a plain icon + text link with no box (used in lists).
 */
export function PracticeCard({
  to,
  label,
  text,
  compact,
}: {
  to: string;
  label: string;
  text?: string | undefined;
  compact?: boolean;
}) {
  const Icon = practiceIcon(to);
  const area = practiceArea(to);
  if (compact) {
    return (
      <HrefLink
        href={to}
        title={text ? `${area} — ${text}` : area}
        className="group flex items-start gap-2.5 rounded-md py-1.5 text-sm transition-colors hover:text-primary"
      >
        <Icon className="mt-0.5 size-4 shrink-0 text-primary/80" />
        <span className="min-w-0 flex-1">
          <span className="block font-medium">{label}</span>
          {text ? (
            <span className="block text-xs leading-relaxed text-muted-foreground">{text}</span>
          ) : null}
        </span>
      </HrefLink>
    );
  }
  return (
    <HrefLink
      href={to}
      className="group flex items-center gap-3 rounded-md border px-4 py-3 transition-colors hover:border-primary/50"
    >
      <Icon className="size-4.5 shrink-0 text-primary" />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">
          {label} <span className="font-normal text-muted-foreground">· {area}</span>
        </span>
        {text ? (
          <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">{text}</span>
        ) : null}
      </span>
      <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
    </HrefLink>
  );
}
