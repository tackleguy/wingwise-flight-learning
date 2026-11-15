/**
 * TeachX brand mark.
 *
 * The "X" is drawn by a folded paper plane climbing out of the bottom-left corner. Its fading
 * contrail is one stroke of the X and it flies *over* the other stroke (which is split to show the
 * crossing). Paper plane = classroom + flight; the climb = progress.
 *
 *   <LogoMark size={32} />            badge only
 *   <Logo />                          badge + "TeachX" wordmark
 *
 * Motion (CSS in styles.css, `.tx-logo*`): the plane flies in and the bar draws on mount; on hover
 * of the nearest `.tx-logo-host` the plane nudges forward and the glow brightens. All motion is disabled
 * by prefers-reduced-motion and the app's own reduced-motion setting.
 */
import { useId } from "react";
import { cn } from "@/lib/utils";

export function LogoMark({
  size = 32,
  className,
  animated = true,
  title = "TeachX",
}: {
  size?: number;
  className?: string;
  /** Play the fly-in animation on mount. */
  animated?: boolean;
  title?: string;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const id = (k: string) => `txl-${k}-${uid}`;
  return (
    <svg
      viewBox="0 0 48 48"
      width={size}
      height={size}
      role="img"
      aria-label={title}
      className={cn("tx-logo shrink-0", animated && "tx-logo-animated", className)}
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
        <radialGradient id={id("glow")} cx=".68" cy=".32" r=".55">
          <stop offset="0" stopColor="#38bdf8" stopOpacity=".4" />
          <stop offset="1" stopColor="#38bdf8" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={id("wl")} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#1d4fd8" stopOpacity="0" />
          <stop offset=".45" stopColor="#2563eb" />
          <stop offset="1" stopColor="#3b82f6" />
        </linearGradient>
        <linearGradient id={id("wr")} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#38bdf8" stopOpacity="0" />
          <stop offset=".45" stopColor="#38bdf8" />
          <stop offset="1" stopColor="#a5f3fc" />
        </linearGradient>
        <clipPath id={id("clip")}>
          <rect width="48" height="48" rx="13" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${id("clip")})`}>
        <rect width="48" height="48" fill={`url(#${id("bg")})`} />
        <rect className="tx-logo-glow" width="48" height="48" fill={`url(#${id("glow")})`} />
        <rect className="tx-logo-sheen" x="-30" y="-10" width="16" height="70" fill="#fff" />
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
        className="tx-logo-bar"
        pathLength={1}
        d="M13.5 13.5 L19.4 19.4"
        stroke="#eef3fb"
        strokeWidth="4.8"
        strokeLinecap="round"
      />
      <path
        className="tx-logo-bar tx-logo-bar-2"
        pathLength={1}
        d="M28.6 28.6 L34.5 34.5"
        stroke="#eef3fb"
        strokeWidth="4.8"
        strokeLinecap="round"
      />
      <g transform="translate(24 24) rotate(45)">
        <g className="tx-logo-plane">
          <path
            d="M0 -20.5 L0 18 Q-2 18.2 -2.3 15.6 L-2.6 -4.6 L-9.4 -1.2 Z"
            fill={`url(#${id("wl")})`}
          />
          <path
            d="M0 -20.5 L0 18 Q2 18.2 2.3 15.6 L2.6 -4.6 L9.4 -1.2 Z"
            fill={`url(#${id("wr")})`}
          />
        </g>
      </g>
    </svg>
  );
}

/** Badge + wordmark. `compact` hides the tagline. */
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
    <span className={cn("tx-logo-host inline-flex items-center gap-2.5", className)}>
      <LogoMark size={size} animated={animated} />
      <span className="flex min-w-0 flex-col leading-none group-data-[collapsible=icon]:hidden">
        <span className="font-display text-[19px] font-bold tracking-[-0.03em] text-foreground">
          Teach<span className="text-brand-gradient">X</span>
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
