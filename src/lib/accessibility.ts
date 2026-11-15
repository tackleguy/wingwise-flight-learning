/**
 * Accessibility & cockpit-lighting display preferences.
 *
 * Applies classes on <html> (document.documentElement):
 *   tx-reduced-motion  — disables animations/transitions
 *   tx-large-text      — scales the root font size (all rem-based UI grows)
 *   tx-high-contrast   — brighter text, stronger borders
 *   tx-night-lighting  — "night (red) cockpit lighting" palette to preserve dark adaptation
 *
 * The matching CSS is injected once at runtime (see ensureStyles) so the feature works without
 * touching the global stylesheet. Accessibility values live in the training store
 * (settings.accessibility); the night-lighting flag is a per-device display preference kept in
 * localStorage because the store's Settings type has no field for it.
 *
 * App shell usage:  useApplyAccessibility();
 */
import { useEffect, useSyncExternalStore } from "react";
import { useStore, type Settings } from "@/lib/store";

const NIGHT_KEY = "teachx-night-lighting";
const STYLE_ID = "teachx-a11y-styles";

const CSS = `
html.tx-large-text { font-size: 112.5%; }
html.tx-reduced-motion *, html.tx-reduced-motion *::before, html.tx-reduced-motion *::after {
  animation-duration: 0.001ms !important; animation-iteration-count: 1 !important;
  transition-duration: 0.001ms !important; scroll-behavior: auto !important;
}
html.tx-high-contrast {
  --background: oklch(0.11 0.01 258); --card: oklch(0.16 0.015 258); --popover: oklch(0.17 0.015 258);
  --foreground: oklch(0.99 0 0); --card-foreground: oklch(0.99 0 0); --popover-foreground: oklch(0.99 0 0);
  --muted: oklch(0.22 0.02 258); --muted-foreground: oklch(0.88 0.02 250);
  --border: oklch(0.58 0.03 258); --input: oklch(0.62 0.03 258);
  --primary: oklch(0.8 0.15 242); --sidebar-foreground: oklch(0.97 0 0); --sidebar-border: oklch(0.5 0.03 258);
}
html.tx-high-contrast a:focus-visible, html.tx-high-contrast button:focus-visible { outline: 2px solid oklch(0.9 0.15 90); outline-offset: 2px; }
html.tx-night-lighting {
  --background: oklch(0.1 0.012 25); --card: oklch(0.13 0.02 25); --popover: oklch(0.14 0.02 25);
  --foreground: oklch(0.72 0.16 28); --card-foreground: oklch(0.72 0.16 28); --popover-foreground: oklch(0.72 0.16 28);
  --muted: oklch(0.17 0.025 25); --muted-foreground: oklch(0.55 0.12 28);
  --secondary: oklch(0.18 0.03 25); --secondary-foreground: oklch(0.7 0.15 28);
  --accent: oklch(0.2 0.05 25); --accent-foreground: oklch(0.78 0.16 28);
  --primary: oklch(0.62 0.2 27); --primary-foreground: oklch(0.12 0.02 25);
  --border: oklch(0.26 0.05 25); --input: oklch(0.3 0.06 25); --ring: oklch(0.62 0.2 27);
  --ok: oklch(0.68 0.17 40); --caution: oklch(0.72 0.17 50); --warning: oklch(0.6 0.23 25);
  --cyan: oklch(0.7 0.15 35); --magenta: oklch(0.65 0.2 15);
  --panel: oklch(0.08 0.01 25); --bezel: oklch(0.06 0.01 25);
  --sidebar: oklch(0.09 0.012 25); --sidebar-foreground: oklch(0.68 0.15 28); --sidebar-primary: oklch(0.62 0.2 27);
  --sidebar-accent: oklch(0.17 0.04 25); --sidebar-accent-foreground: oklch(0.78 0.16 28); --sidebar-border: oklch(0.2 0.04 25);
  --brand-1: oklch(0.5 0.2 25); --brand-2: oklch(0.62 0.2 27); --brand-3: oklch(0.75 0.15 35);
  --chart-1: oklch(0.62 0.2 27); --chart-2: oklch(0.7 0.15 45); --chart-3: oklch(0.55 0.15 15); --chart-4: oklch(0.75 0.12 35); --chart-5: oklch(0.5 0.12 20);
}
`;

function ensureStyles() {
  if (typeof document === "undefined" || document.getElementById(STYLE_ID)) return;
  const el = document.createElement("style");
  el.id = STYLE_ID;
  el.textContent = CSS;
  document.head.appendChild(el);
}

/* --------- night-lighting flag (device-local) --------- */

const nightListeners = new Set<() => void>();

export function getNightLighting(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(NIGHT_KEY) === "1";
  } catch {
    return false;
  }
}

export function setNightLighting(on: boolean) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(NIGHT_KEY, on ? "1" : "0");
  } catch {
    /* storage blocked — applies for this page view only */
  }
  applyNight(on);
  nightListeners.forEach((l) => l());
}

export function useNightLighting(): boolean {
  return useSyncExternalStore(
    (l) => {
      nightListeners.add(l);
      return () => nightListeners.delete(l);
    },
    getNightLighting,
    () => false,
  );
}

function applyNight(on: boolean) {
  if (typeof document === "undefined") return;
  ensureStyles();
  document.documentElement.classList.toggle("tx-night-lighting", on);
}

/** Apply the accessibility classes to <html>. Safe to call repeatedly; no-op on the server. */
export function applyAccessibility(a: Settings["accessibility"], night = getNightLighting()) {
  if (typeof document === "undefined") return;
  ensureStyles();
  const root = document.documentElement;
  root.classList.toggle("tx-reduced-motion", a.reducedMotion);
  root.classList.toggle("tx-large-text", a.largeText);
  root.classList.toggle("tx-high-contrast", a.highContrast);
  root.classList.toggle("tx-night-lighting", night);
}

/** Hook for the app shell: keeps <html> classes in sync with the stored preferences. */
export function useApplyAccessibility() {
  const reducedMotion = useStore((s) => s.settings.accessibility.reducedMotion);
  const largeText = useStore((s) => s.settings.accessibility.largeText);
  const highContrast = useStore((s) => s.settings.accessibility.highContrast);
  const night = useNightLighting();
  useEffect(() => {
    applyAccessibility({ reducedMotion, largeText, highContrast }, night);
  }, [reducedMotion, largeText, highContrast, night]);
}
