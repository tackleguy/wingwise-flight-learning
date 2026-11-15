/**
 * Panel layouts and how much of the screen each one covers.
 *
 *   wide    everything visible at once (desktop / large landscape screens)          ≈ 41 % of the height
 *   side    six-pack on the left, tabbed pages (Engine · Radios · Switches) right    ≈ 47 %
 *   row     low-profile strip: the six flight instruments in one row (drawer closed) ≈ 25–42 %
 *   stack   portrait screens: six-pack on top, tabbed drawer underneath              ≈ 40 % closed, 71 % open
 *
 * In landscape, opening the drawer turns "row" into "side"; closing it turns "side" into "row".
 * All sizes are multiples of one "panel unit" (CSS variable --u), so the whole panel scales evenly.
 * The views module should keep the horizon inside the part of the screen ABOVE the panel:
 * use `panelLayout(width, height).fraction` (or the `onCoverage` callback of <CockpitPanel>).
 */
export type PanelLayoutMode = "wide" | "side" | "row" | "stack";

/** Nominal share of the screen height covered by the panel in each layout (drawer closed / open where it applies). */
export const PANEL_HEIGHT_FRACTION = {
  wide: 0.41,
  side: 0.47,
  row: 0.42,
  stackClosed: 0.4,
  stackOpen: 0.71,
} as const;

/** Design sizes in panel units. */
export const DESIGN = {
  wide: { w: 1280, h: 292 },
  /** Six-pack cell (one dial incl. its bezel) in the wide layout. */
  wideCell: 132,
  /** Six-pack cell in the compact layouts. */
  cell: 140,
  /** Height of a drawer page. */
  pageH: 280,
  pageW: { engine: 316, radios: 396, switches: 290 },
  glare: 12,
  side: { w: 836, h: 300 },
  row: { w: 852, h: 160 },
  stackMain: { w: 428, h: 328 },
} as const;

/** Gap between drawer pages and the padding at the ends of the page strip, panel units. */
export const PAGE_GAP = 14;
export const PAGE_PAD = 12;

export type PanelPage = "engine" | "radios" | "switches";
export const PANEL_PAGES: readonly PanelPage[] = ["engine", "radios", "switches"];

export interface PanelMetrics {
  mode: PanelLayoutMode;
  /** Pixels per panel unit for the main area (six-pack). */
  unit: number;
  /** Pixels per panel unit for the drawer pages (compact layouts). */
  pageUnit: number;
  /** Height of the tab bar in pixels (0 in the wide layout). */
  tabBarPx: number;
  /** Whether the drawer with the extra pages is open (always true for "wide" and "side"; false for "row"). */
  drawerOpen: boolean;
  /** Whether this screen has a drawer the pilot can open or close. */
  hasDrawer: boolean;
  /** Height in pixels from the top of the glare shield to the bottom of the screen. */
  heightPx: number;
  /** heightPx as a fraction of the screen height (0…1). */
  fraction: number;
  /** Diameter of a six-pack dial in pixels. */
  dialPx: number;
}

export interface PanelLayoutOptions {
  /** Drawer state chosen by the pilot; leave undefined for the default for this screen. */
  drawerOpen?: boolean;
}

/** True when a landscape screen is big enough to show everything at once. */
export function isWide(w: number, h: number): boolean {
  return w > h && w >= 1180 && w / h >= 1.5;
}

/** Default drawer state for a screen: open where plenty of outside view remains, closed on phones. */
export function defaultDrawerOpen(w: number, h: number): boolean {
  if (isWide(w, h)) return true;
  if (w > h) return h >= 560;
  const open = stack(w, h, true);
  return h - open.heightPx >= 380;
}

function stack(w: number, h: number, open: boolean): PanelMetrics {
  const tab = 36;
  const unit = Math.max(0.5, Math.min(w / DESIGN.stackMain.w, (0.4 * h) / DESIGN.stackMain.h, 1.25));
  let pageUnit = Math.max(0.5, Math.min(w / 400, (0.31 * h) / DESIGN.pageH, 1.25));
  // Where two (or all three) pages almost fit side by side, shrink a little so they fit exactly.
  const two = DESIGN.pageW.engine + DESIGN.pageW.radios + PAGE_GAP + PAGE_PAD;
  const three = two + DESIGN.pageW.switches + PAGE_GAP;
  for (const need of [three, two]) {
    const fit = w / need;
    if (fit < pageUnit && fit >= 0.86 * pageUnit) {
      pageUnit = fit;
      break;
    }
  }
  const heightPx = DESIGN.stackMain.h * unit + tab + (open ? DESIGN.pageH * pageUnit + 8 : 0);
  return { mode: "stack", unit, pageUnit, tabBarPx: tab, drawerOpen: open, hasDrawer: true, heightPx, fraction: heightPx / h, dialPx: DESIGN.cell * unit * 0.97 };
}

/** Work out the layout for a screen (or container) of w × h CSS pixels. */
export function panelLayout(w: number, h: number, opts: PanelLayoutOptions = {}): PanelMetrics {
  const vw = Math.max(200, w || 0);
  const vh = Math.max(200, h || 0);
  if (isWide(vw, vh)) {
    const unit = Math.min(vw / DESIGN.wide.w, (0.44 * vh) / DESIGN.wide.h);
    const heightPx = DESIGN.wide.h * unit;
    return { mode: "wide", unit, pageUnit: unit, tabBarPx: 0, drawerOpen: true, hasDrawer: false, heightPx, fraction: heightPx / vh, dialPx: DESIGN.wideCell * unit * 0.97 };
  }
  const open = opts.drawerOpen ?? defaultDrawerOpen(vw, vh);
  if (vw > vh) {
    if (open) {
      const tab = vh < 560 ? 30 : 34;
      // On short screens (phones) the opened panel may take most of the height; otherwise stay under half.
      const share = vh < 560 ? 0.9 : 0.47;
      const unit = Math.max(0.5, Math.min(vw / DESIGN.side.w, (share * vh - tab) / DESIGN.side.h));
      const heightPx = DESIGN.side.h * unit + tab;
      return { mode: "side", unit, pageUnit: unit, tabBarPx: tab, drawerOpen: true, hasDrawer: true, heightPx, fraction: heightPx / vh, dialPx: DESIGN.cell * unit * 0.97 };
    }
    const tab = 30;
    const unit = Math.max(0.7, Math.min(vw / DESIGN.row.w, (0.42 * vh - tab) / DESIGN.row.h, 1.25));
    const heightPx = DESIGN.row.h * unit + tab;
    return { mode: "row", unit, pageUnit: unit, tabBarPx: tab, drawerOpen: false, hasDrawer: true, heightPx, fraction: heightPx / vh, dialPx: DESIGN.cell * unit * 0.97 };
  }
  return stack(vw, vh, open);
}

/** Share of the screen height (0…1) covered by the panel — where the views module must not put the horizon. */
export function panelHeightFraction(w: number, h: number, opts: PanelLayoutOptions & { hidden?: boolean } = {}): number {
  if (opts.hidden) return 0;
  return panelLayout(w, h, opts).fraction;
}
