/**
 * HrefLink — SPA link to a fully built URL (path + query string).
 *
 * Used for cross-links into routes owned by other features (simulator, AI ATC, academy...) whose
 * search-param schemas are defined there. It renders a real <a href> (so middle-click / open in
 * new tab work) and performs client-side navigation on a plain left click.
 */
import { useRouter } from "@tanstack/react-router";
import type { AnchorHTMLAttributes, MouseEvent, ReactNode } from "react";

export function buildHref(path: string, params: Record<string, string | number | undefined | null>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    q.set(k, String(v));
  }
  const s = q.toString();
  return s ? `${path}?${s}` : path;
}

export function HrefLink({
  href,
  children,
  onClick,
  ...rest
}: { href: string; children: ReactNode } & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href">) {
  const router = useRouter();
  return (
    <a
      href={href}
      onClick={(e: MouseEvent<HTMLAnchorElement>) => {
        onClick?.(e);
        if (e.defaultPrevented) return;
        if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        if (rest.target && rest.target !== "_self") return;
        e.preventDefault();
        void router.navigate({ href });
      }}
      {...rest}
    >
      {children}
    </a>
  );
}

/** Imperative navigation to a built href. */
export function useHrefNavigate() {
  const router = useRouter();
  return (href: string) => void router.navigate({ href });
}
