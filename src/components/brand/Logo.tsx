/**
 * SkyReady brand mark.
 *
 * A check mark — "ready", the checklist is complete — whose long stroke becomes a takeoff climb,
 * with an aircraft lifting off its tip into the sky. Check = prepared; climb = progress.
 *
 *   <LogoMark size={32} />            badge only
 *   <Logo />                          badge + "SkyReady" wordmark
 *
 * Motion (CSS in styles.css, `.brand-logo*`): the check draws and the aircraft climbs in on mount;
 * on hover of the nearest `.brand-logo-host` the aircraft nudges forward and the glow brightens.
 * All motion is disabled by prefers-reduced-motion and the app's own reduced-motion setting.
 *
 * The same artwork, without motion, is in public/favicon.svg (and the simulator's favicons).
 */
import { useId } from "react";
import { cn } from "@/lib/utils";

/** Top-view aircraft silhouette, nose up, centred on 0,0 (about 17 units long, 17 wide). */
const AIRCRAFT_PATH =
  "M0 -9.5 C0.95 -9.5 1.3 -8.4 1.3 -6.8 L1.3 -2.4 L8.4 1.6 L8.4 3.4 L1.3 1.5 L1.05 6 L3.8 7.9 L3.8 9.1 L0 8.3 L-3.8 9.1 L-3.8 7.9 L-1.05 6 L-1.3 1.5 L-8.4 3.4 L-8.4 1.6 L-1.3 -2.4 L-1.3 -6.8 C-1.3 -8.4 -0.95 -9.5 0 -9.5 Z";

export function LogoMark({
  size = 32,
  className,
  animated = true,
  title = "SkyReady",
}: {
  size?: number;
  className?: string;
  /** Play the draw-on / climb-in animation on mount. */
  animated?: boolean;
  title?: string;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const id = (k: string) => `srl-${k}-${uid}`;
  return (
    <svg
      viewBox="0 0 48 48"
      width={size}
      height={size}
      role="img"
      aria-label={title}
      className={cn("brand-logo shrink-0", animated && "brand-logo-animated", className)}
    >
      <defs>
        <linearGradient id={id("bg")} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#17295a" />
          <stop offset="1" stopColor="#0a1430" />
        </linearGradient>
        <linearGradient id={id("hl")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity=".16" />
          <stop offset=".5" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <radialGradient id={id("glow")} cx=".74" cy=".26" r=".6">
          <stop offset="0" stopColor="#38bdf8" stopOpacity=".42" />
          <stop offset="1" stopColor="#38bdf8" stopOpacity="0" />
        </radialGradient>
        <linearGradient
          id={id("check")}
          x1="11"
          y1="34"
          x2="30"
          y2="20"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="#2563eb" />
          <stop offset=".6" stopColor="#38bdf8" />
          <stop offset="1" stopColor="#a5f3fc" />
        </linearGradient>
        <linearGradient
          id={id("plane")}
          x1="0"
          y1="-9"
          x2="0"
          y2="9"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#d4ecff" />
        </linearGradient>
        <clipPath id={id("clip")}>
          <rect width="48" height="48" rx="13" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${id("clip")})`}>
        <rect width="48" height="48" fill={`url(#${id("bg")})`} />
        <rect className="brand-logo-glow" width="48" height="48" fill={`url(#${id("glow")})`} />
        <rect className="brand-logo-sheen" x="-30" y="-10" width="16" height="70" fill="#fff" />
      </g>
      <rect
        x=".5"
        y=".5"
        width="47"
        height="47"
        rx="12.5"
        fill={`url(#${id("hl")})`}
        stroke="#fff"
        strokeOpacity=".12"
      />
      <path
        className="brand-logo-check"
        pathLength={1}
        d="M11.5 25.5 L19.5 33.5 L28 25"
        fill="none"
        stroke={`url(#${id("check")})`}
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <g transform="translate(33.6 19.4) rotate(45) scale(.92)">
        <g className="brand-logo-plane">
          <path d={AIRCRAFT_PATH} fill={`url(#${id("plane")})`} />
        </g>
      </g>
    </svg>
  );
}

/** Badge + wordmark. Pass `tagline={null}` to hide the tagline. */
export function Logo({
  size = 34,
  className,
  tagline = "Flight Training",
  animated = true,
}: {
  size?: number;
  className?: string;
  tagline?: string | null;
  animated?: boolean;
}) {
  return (
    <span className={cn("brand-logo-host inline-flex items-center gap-2.5", className)}>
      <LogoMark size={size} animated={animated} />
      <span className="flex min-w-0 flex-col leading-none group-data-[collapsible=icon]:hidden">
        <span className="font-display text-[19px] font-bold tracking-[-0.03em] text-foreground">
          Sky<span className="text-brand-gradient">Ready</span>
        </span>
        {tagline ? (
          <span className="mt-1 text-[9.5px] font-semibold tracking-[0.22em] text-muted-foreground uppercase">
            {tagline}
          </span>
        ) : null}
      </span>
    </span>
  );
}
