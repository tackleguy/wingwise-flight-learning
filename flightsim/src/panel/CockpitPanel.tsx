/**
 * <CockpitPanel>: the instrument panel of the SkyReady trainer, drawn as SVG over the lower part of
 * the 3D view.
 *
 * - Reads sim.state.ind / nav / sys and sim.controls; writes only sim.controls and emits commands.
 *   (Two documented exceptions: sim.state.flapsDeg for the flap position indicator, and the time
 *   and position needed to work out whether it is day or night for the panel lighting.)
 * - One requestAnimationFrame loop moves all needles through refs; it stops while the panel is hidden.
 * - Layouts: see ./layout.ts. In explain mode a tap on any instrument calls onExplain(id) instead
 *   of operating it.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type SyntheticEvent } from "react";
import type { Sim } from "@/core/sim";
import { daylight, sunPosition } from "@/core/sun";
import { MagneticCompass, COMPASS_W } from "./compass";
import { BUS_ALIVE_VOLTS, PanelContext, panelStats, type FrameInfo, type PanelApi, type Updater } from "./context";
import { CarbHeatKnob, FlapLever, FuelSelector, IgnitionKey, MasterSwitch, MixtureKnob, PanelDimmer, ParkingBrake, Rocker, ThrottleKnob, TrimWheel } from "./controls";
import { PANEL_CSS } from "./css";
import { Ammeter, Annunciators, ClockOat, EgtGauge, FuelGauge, OilGauge, SuctionGauge, Tachometer } from "./engine";
import { Airspeed, Altimeter, Attitude, HeadingIndicator, TurnCoordinator, VerticalSpeed } from "./flight";
import { isInstrumentId, type InstrumentId } from "./ids";
import { DESIGN, PANEL_PAGES, panelLayout, type PanelMetrics, type PanelPage } from "./layout";
import { panelLighting } from "./lighting";
import { u } from "./parts";
import { RadioStack, VorIndicator } from "./radios";

export interface CockpitPanelProps {
  sim: Sim;
  /** Called in explain mode when the pilot taps an instrument or control. */
  onExplain?: (id: InstrumentId) => void;
  /** When true, taps explain instead of operating the controls. */
  explainMode?: boolean;
  className?: string;
  /**
   * Called whenever the share of the screen height covered by the panel changes
   * (0 when the panel is hidden) — pass it on to the views module so it can place the horizon.
   */
  onCoverage?: (fraction: number, metrics: PanelMetrics | null) => void;
  /** Start with the panel hidden (the pilot can show it with the tab handle or the panel-toggle command). */
  defaultHidden?: boolean;
  /**
   * Size in CSS pixels of the area the panel lives in. Leave undefined (the normal case) and the
   * panel measures its positioned parent, or the window. Useful for server rendering and tests.
   */
  viewport?: { width: number; height: number };
}

const PAGE_TITLES: Record<PanelPage, string> = { engine: "Engine", radios: "Radios", switches: "Switches" };

function At({ x, y, children }: { x: number; y: number; children: ReactNode }) {
  return (
    <div className="txp-at" style={{ left: u(x), top: u(y) }}>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------- groups

function SixPack({ cell, columns }: { cell: number; columns: 3 | 6 }) {
  const pos = (i: number): [number, number] => (columns === 3 ? [(i % 3) * cell, Math.floor(i / 3) * cell] : [i * cell, 0]);
  const dials = [Airspeed, Attitude, Altimeter, TurnCoordinator, HeadingIndicator, VerticalSpeed];
  return (
    <>
      {dials.map((D, i) => {
        const [x, y] = pos(i);
        return (
          <At key={i} x={x} y={y}>
            <D size={cell} />
          </At>
        );
      })}
    </>
  );
}

const CLUSTER_CELL = 88;
function EngineCluster() {
  const c = CLUSTER_CELL;
  return (
    <>
      <At x={0} y={0}>
        <FuelGauge size={c} />
      </At>
      <At x={c} y={0}>
        <OilGauge size={c} />
      </At>
      <At x={0} y={c}>
        <EgtGauge size={c} />
      </At>
      <At x={c} y={c}>
        <Ammeter size={c} />
      </At>
      <At x={0} y={2 * c}>
        <SuctionGauge size={c} />
      </At>
      <At x={c} y={2 * c}>
        <ClockOat size={c} />
      </At>
    </>
  );
}

function SwitchBlock() {
  return (
    <>
      <At x={0} y={0}>
        <MasterSwitch />
      </At>
      <At x={60} y={0}>
        <Rocker id="avionics-master" ctl="avionics-master" text="AVIONICS" label="Avionics master switch" get={(c) => c.avionicsMaster} set={(c, on) => (c.avionicsMaster = on)} />
      </At>
      <At x={98} y={0}>
        <Rocker id="pitot-heat" ctl="pitot-heat" text="PITOT HT" label="Pitot heat switch" get={(c) => c.pitotHeat} set={(c, on) => (c.pitotHeat = on)} />
      </At>
      <At x={142} y={0}>
        <PanelDimmer />
      </At>
      <At x={0} y={62}>
        <Rocker id="lights" ctl="light-beacon" text="BEACON" label="Beacon light switch" get={(c) => c.lights.beacon} set={(c, on) => (c.lights.beacon = on)} />
      </At>
      <At x={38} y={62}>
        <Rocker id="lights" ctl="light-landing" text="LAND" label="Landing light switch" get={(c) => c.lights.landing} set={(c, on) => (c.lights.landing = on)} />
      </At>
      <At x={76} y={62}>
        <Rocker id="lights" ctl="light-taxi" text="TAXI" label="Taxi light switch" get={(c) => c.lights.taxi} set={(c, on) => (c.lights.taxi = on)} />
      </At>
      <At x={114} y={62}>
        <Rocker id="lights" ctl="light-nav" text="NAV" label="Navigation (position) lights switch" get={(c) => c.lights.nav} set={(c, on) => (c.lights.nav = on)} />
      </At>
      <At x={152} y={62}>
        <Rocker id="lights" ctl="light-strobe" text="STROBE" label="Strobe lights switch" get={(c) => c.lights.strobe} set={(c, on) => (c.lights.strobe = on)} />
      </At>
      <At x={204} y={0}>
        <IgnitionKey />
      </At>
      <At x={204} y={88}>
        <ParkingBrake />
      </At>
    </>
  );
}

function EngineControls({ x, y }: { x: number; y: number }) {
  return (
    <>
      <At x={x} y={y}>
        <CarbHeatKnob />
      </At>
      <At x={x + 42} y={y}>
        <ThrottleKnob />
      </At>
      <At x={x + 84} y={y}>
        <MixtureKnob />
      </At>
    </>
  );
}

// ---------------------------------------------------------------- layouts

/** Everything visible at once. Canvas: 1280 × 280 units under the glare shield. */
function WideLayout() {
  const cell = DESIGN.wideCell;
  return (
    <div className="txp-canvas" style={{ width: u(DESIGN.wide.w), height: u(DESIGN.wide.h - DESIGN.glare) }}>
      <At x={6} y={7}>
        <EngineCluster />
      </At>
      <At x={188} y={6}>
        <SixPack cell={cell} columns={3} />
      </At>
      <At x={588} y={6}>
        <VorIndicator size={cell} />
      </At>
      <At x={588} y={6 + cell + 2}>
        <Tachometer size={cell} />
      </At>
      <At x={728} y={6}>
        <Annunciators />
      </At>
      <At x={728} y={36}>
        <RadioStack />
      </At>
      <At x={984} y={6}>
        <SwitchBlock />
      </At>
      <At x={980} y={134}>
        <FuelSelector />
      </At>
      <EngineControls x={1052} y={134} />
      <At x={1180} y={134}>
        <FlapLever />
      </At>
      <At x={1234} y={134}>
        <TrimWheel />
      </At>
    </div>
  );
}

function PageBody({ page }: { page: PanelPage }) {
  if (page === "engine")
    return (
      <>
        <At x={0} y={4}>
          <Tachometer size={132} />
        </At>
        <EngineControls x={3} y={140} />
        <At x={140} y={8}>
          <EngineCluster />
        </At>
      </>
    );
  if (page === "radios")
    return (
      <>
        <At x={0} y={66}>
          <VorIndicator size={148} />
        </At>
        <At x={152} y={24}>
          <RadioStack />
        </At>
      </>
    );
  return (
    <>
      <At x={2} y={6}>
        <SwitchBlock />
      </At>
      <At x={24} y={136}>
        <FuelSelector />
      </At>
      <At x={122} y={136}>
        <FlapLever />
      </At>
      <At x={204} y={136}>
        <TrimWheel />
      </At>
    </>
  );
}

/**
 * In a sideways-scrolling strip a finger that lands on a knob or lever must operate it, not scroll
 * the strip. `touch-action` covers this in most browsers; this makes sure in all of them.
 */
function useNoScrollOnControls(ref: React.RefObject<HTMLDivElement | null>): void {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let onControl = false;
    const start = (e: TouchEvent) => {
      onControl = !!(e.target as Element | null)?.closest?.(".tx-ctl");
    };
    const move = (e: TouchEvent) => {
      if (onControl && e.cancelable) e.preventDefault();
    };
    el.addEventListener("touchstart", start, { passive: true });
    el.addEventListener("touchmove", move, { passive: false });
    return () => {
      el.removeEventListener("touchstart", start);
      el.removeEventListener("touchmove", move);
    };
  }, [ref]);
}

/** The Engine · Radios · Switches pages side by side in a strip that scrolls (swipes) sideways. */
function Pages({ page, onPage, style, className }: { page: PanelPage; onPage: (p: PanelPage) => void; style?: CSSProperties; className?: string }) {
  const scroller = useRef<HTMLDivElement>(null);
  const els = useRef<Partial<Record<PanelPage, HTMLDivElement | null>>>({});
  const settled = useRef<PanelPage | null>(null);
  // While the strip is travelling to a page chosen with a tab, scroll events must not pick another page.
  const travel = useRef<{ target: number; timer: ReturnType<typeof setTimeout> | 0 } | null>(null);
  const pick = useRef<() => void>(() => undefined);
  const endTravel = () => {
    if (travel.current?.timer) clearTimeout(travel.current.timer);
    travel.current = null;
  };
  const armTravel = (target: number, ms: number) => {
    if (travel.current?.timer) clearTimeout(travel.current.timer);
    // If the strip stops somewhere else (the pilot grabbed it on the way), select whatever page is there.
    const timer = setTimeout(() => {
      endTravel();
      pick.current();
    }, ms);
    travel.current = { target, timer };
  };

  // Bring the chosen page into view (instantly the first time, smoothly afterwards).
  useLayoutEffect(() => {
    const sc = scroller.current;
    const el = els.current[page];
    if (!sc || !el) return;
    if (settled.current === page) return;
    const first = settled.current === null;
    settled.current = page;
    const max = Math.max(0, sc.scrollWidth - sc.clientWidth);
    const left = Math.min(max, Math.max(0, el.offsetLeft - (sc.clientWidth - el.offsetWidth) / 2));
    if (first || typeof sc.scrollTo !== "function") {
      endTravel();
      sc.scrollLeft = left;
    } else if (Math.abs(sc.scrollLeft - left) > 2) {
      armTravel(left, 3000);
      sc.scrollTo({ left, behavior: "smooth" });
    }
  }, [page]);
  useEffect(() => endTravel, []);

  useNoScrollOnControls(scroller);

  // Swiping the strip selects the tab of the page nearest the middle.
  useEffect(() => {
    const sc = scroller.current;
    if (!sc) return;
    let raf = 0;
    const choose = () => {
      if (travel.current) return;
      if (sc.scrollWidth <= sc.clientWidth + 2) return;
      const mid = sc.scrollLeft + sc.clientWidth / 2;
      let best: PanelPage | null = null;
      let bestD = Infinity;
      for (const p of PANEL_PAGES) {
        const el = els.current[p];
        if (!el) continue;
        const d = Math.abs(el.offsetLeft + el.offsetWidth / 2 - mid);
        if (d < bestD) {
          bestD = d;
          best = p;
        }
      }
      if (best && best !== settled.current) {
        settled.current = best;
        onPage(best);
      }
    };
    pick.current = choose;
    const onScroll = () => {
      const t = travel.current;
      if (t) {
        // arrived: hand control back to the pilot's finger; still moving: keep waiting
        if (Math.abs(sc.scrollLeft - t.target) < 3) endTravel();
        else armTravel(t.target, 350);
        return;
      }
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        choose();
      });
    };
    sc.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      pick.current = () => undefined;
      sc.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [onPage]);

  return (
    <div ref={scroller} className={`txp-pages ${className ?? ""}`} style={style} data-pages="1">
      {PANEL_PAGES.map((p) => (
        <div
          key={p}
          className="txp-page"
          data-page={p}
          role="group"
          aria-label={`${PAGE_TITLES[p]} page`}
          style={{ width: u(DESIGN.pageW[p]), height: u(DESIGN.pageH) }}
          ref={(el) => {
            els.current[p] = el;
          }}
        >
          <PageBody page={p} />
        </div>
      ))}
    </div>
  );
}

function TabBar({ m, page, onTab, onToggleDrawer, withAnnunciators }: { m: PanelMetrics; page: PanelPage; onTab: (p: PanelPage) => void; onToggleDrawer: () => void; withAnnunciators: boolean }) {
  const blur = (e: SyntheticEvent<HTMLElement>) => e.currentTarget.blur();
  return (
    <div className="txp-tabs" data-panel-chrome="1" role="tablist" aria-label="Instrument panel pages">
      {PANEL_PAGES.map((p) => (
        <button
          key={p}
          type="button"
          className="txp-tab"
          role="tab"
          data-tab={p}
          aria-selected={m.drawerOpen && page === p}
          onClick={(e) => {
            blur(e);
            onTab(p);
          }}
        >
          {PAGE_TITLES[p]}
        </button>
      ))}
      <button
        type="button"
        className="txp-tab icon"
        data-tab="drawer"
        aria-label={m.drawerOpen ? "Hide the engine, radio and switch pages (show only the six flight instruments)" : "Show the engine, radio and switch pages"}
        title={m.drawerOpen ? "Fewer instruments" : "More instruments"}
        onClick={(e) => {
          blur(e);
          onToggleDrawer();
        }}
      >
        {m.drawerOpen ? "▾ Less" : "▴ More"}
      </button>
      <div className="txp-tabs-space" />
      {withAnnunciators ? (
        <div className="txp-tabs-ann" style={{ "--u": `${Math.min(0.9, (m.tabBarPx - 6) / 26)}px` } as CSSProperties}>
          <Annunciators />
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------- the panel

export function CockpitPanel({ sim, onExplain, explainMode = false, className, onCoverage, defaultHidden = false, viewport }: CockpitPanelProps) {
  const root = useRef<HTMLDivElement>(null);
  const [measured, setSize] = useState(() => (typeof window === "undefined" ? { w: 1280, h: 720 } : { w: window.innerWidth, h: window.innerHeight }));
  const fixedW = viewport?.width;
  const fixedH = viewport?.height;
  const size = useMemo(() => (fixedW && fixedH ? { w: fixedW, h: fixedH } : measured), [fixedW, fixedH, measured]);
  const [hidden, setHidden] = useState(defaultHidden);
  const [drawer, setDrawer] = useState<boolean | undefined>(undefined);
  const [page, setPage] = useState<PanelPage>("engine");
  const rowScroll = useRef<HTMLDivElement>(null);
  useNoScrollOnControls(rowScroll);
  const explain = useRef(explainMode);
  explain.current = explainMode;
  const coverage = useRef(onCoverage);
  coverage.current = onCoverage;

  const m = useMemo(() => panelLayout(size.w, size.h, { drawerOpen: drawer }), [size, drawer]);

  // ---- size of the area the panel lives in (its positioned parent, or the window)
  useLayoutEffect(() => {
    if (fixedW && fixedH) return;
    const parent = root.current?.offsetParent ?? root.current?.parentElement ?? null;
    const measure = () => {
      const r = parent?.getBoundingClientRect();
      const w = r && r.width > 50 ? r.width : window.innerWidth;
      const h = r && r.height > 50 ? r.height : window.innerHeight;
      setSize((s) => (Math.abs(s.w - w) < 0.5 && Math.abs(s.h - h) < 0.5 ? s : { w, h }));
    };
    measure();
    const ro = typeof ResizeObserver !== "undefined" && parent ? new ResizeObserver(measure) : null;
    if (ro && parent) ro.observe(parent);
    window.addEventListener("resize", measure);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [fixedW, fixedH]);

  // ---- shared services for the instruments
  const updaters = useRef(new Set<Updater>()).current;
  const api = useMemo<PanelApi>(() => {
    let lastClick = 0;
    let lastHint = -1e9;
    return {
      sim,
      register(fn) {
        updaters.add(fn);
        return () => {
          updaters.delete(fn);
        };
      },
      click() {
        const now = performance.now();
        if (now - lastClick < 45) return;
        lastClick = now;
        try {
          (sim.module("audio") as unknown as { play?: (name: string) => void } | undefined)?.play?.("switch");
        } catch {
          /* sound is optional */
        }
      },
      blocked: () => explain.current,
      hintNoPower() {
        const now = performance.now();
        if (now - lastHint < 8000) return;
        lastHint = now;
        sim.message("The radios have no electrical power. Switch on the master switch (BAT) and the avionics master first.", "info");
      },
    };
  }, [sim, updaters]);

  // ---- commands
  useEffect(
    () =>
      sim.events.on("command", (e) => {
        if (e.id === "panel-toggle") setHidden((h) => !h);
      }),
    [sim],
  );

  // ---- the frame loop (stopped while hidden)
  useEffect(() => {
    if (hidden) return;
    let raf = 0;
    let last = performance.now();
    let lightAt = -1e9;
    let lightKey = "";
    let warned = false;
    const f: FrameInfo = { sim, state: sim.state, ind: sim.state.ind, nav: sim.state.nav, sys: sim.state.sys, c: sim.controls, powered: false, avionics: false, now: 0, dt: 0 };
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      f.dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
      f.now = now / 1000;
      last = now;
      f.powered = f.sys.busVolts > BUS_ALIVE_VOLTS;
      f.avionics = f.sys.avionicsPowered;
      if (now - lightAt > 250) {
        lightAt = now;
        const sun = sunPosition(sim.env.utcMs, sim.state.lat, sim.state.lon);
        const light = panelLighting(daylight(sun.elevationDeg), sim.controls.lights.panel, f.powered);
        const el = root.current;
        if (el && light.key !== lightKey) {
          lightKey = light.key;
          for (const k in light.vars) el.style.setProperty(k, light.vars[k]!);
          el.dataset.night = light.ambient < 0.5 ? "1" : "0";
        }
      }
      const t0 = performance.now();
      for (const fn of updaters) {
        try {
          fn(f);
        } catch (err) {
          if (!warned) {
            warned = true;
            console.error("[SkyReady] panel instrument update failed", err);
          }
        }
      }
      panelStats.updaters = updaters.size;
      panelStats.frames++;
      panelStats.frameMs += (performance.now() - t0 - panelStats.frameMs) * 0.05;
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [hidden, sim, updaters]);

  // ---- tell the app how much of the screen is covered
  const fraction = hidden ? 0 : m.fraction;
  useEffect(() => {
    coverage.current?.(fraction, hidden ? null : m);
    const px = hidden ? 0 : Math.round(m.heightPx);
    document.documentElement.style.setProperty("--skyready-panel-height", `${px}px`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fraction, hidden, m.mode]);
  useEffect(() => () => void document.documentElement.style.removeProperty("--skyready-panel-height"), []);

  // ---- explain mode: taps explain instead of operating
  const isChrome = (t: EventTarget | null) => !!(t as Element | null)?.closest?.("[data-panel-chrome]");
  const targetId = (t: EventTarget | null): InstrumentId | null => {
    const id = (t as Element | null)?.closest?.("[data-instrument]")?.getAttribute("data-instrument");
    return isInstrumentId(id) ? id : null;
  };

  const emit = (id: "panel-toggle" | "explain-toggle") => sim.events.emit("command", { id });
  const blurThen = (fn: () => void) => (e: SyntheticEvent<HTMLElement>) => {
    e.currentTarget.blur();
    fn();
  };
  const openPage = (p: PanelPage) => {
    setPage(p);
    if (!m.drawerOpen) setDrawer(true);
  };
  const toggleDrawer = () => setDrawer(!m.drawerOpen);

  const designW = m.mode === "wide" ? DESIGN.wide.w : m.mode === "side" ? DESIGN.side.w : m.mode === "row" ? DESIGN.row.w : DESIGN.stackMain.w;
  // The compass sits on the glare shield above the middle of the six-pack.
  const compassLeft =
    m.mode === "side" ? u(6 + (DESIGN.cell * 3) / 2 - COMPASS_W / 2) : `calc(50% + var(--u) * ${(m.mode === "wide" ? 188 + (DESIGN.wideCell * 3) / 2 - designW / 2 : 0) - COMPASS_W / 2})`;

  let body: ReactNode = null;
  if (!hidden) {
    if (m.mode === "wide") body = <WideLayout />;
    else if (m.mode === "side")
      body = (
        <>
          <TabBar m={m} page={page} onTab={openPage} onToggleDrawer={toggleDrawer} withAnnunciators />
          <div className="txp-canvas" style={{ width: "100%", maxWidth: "100%", height: u(DESIGN.side.h - DESIGN.glare) }}>
            <At x={6} y={4}>
              <SixPack cell={DESIGN.cell} columns={3} />
            </At>
            <Pages page={page} onPage={setPage} style={{ left: u(6 + DESIGN.cell * 3 + 2), right: 0, top: u(4), height: u(DESIGN.pageH) }} />
          </div>
        </>
      );
    else if (m.mode === "row")
      body = (
        <>
          <TabBar m={m} page={page} onTab={openPage} onToggleDrawer={toggleDrawer} withAnnunciators />
          <div className="txp-rowscroll" ref={rowScroll}>
            <div className="txp-canvas" style={{ width: u(DESIGN.row.w), height: u(DESIGN.row.h - DESIGN.glare) }}>
              <At x={6} y={4}>
                <SixPack cell={DESIGN.cell} columns={6} />
              </At>
            </div>
          </div>
        </>
      );
    else
      body = (
        <>
          <div className="txp-canvas" style={{ width: u(DESIGN.stackMain.w), height: u(DESIGN.stackMain.h - DESIGN.glare) }}>
            <At x={(DESIGN.stackMain.w - 244) / 2} y={4}>
              <Annunciators />
            </At>
            <At x={4} y={32}>
              <SixPack cell={DESIGN.cell} columns={3} />
            </At>
          </div>
          <TabBar m={m} page={page} onTab={openPage} onToggleDrawer={toggleDrawer} withAnnunciators={false} />
          {m.drawerOpen ? (
            <div style={{ "--u": `${m.pageUnit}px`, padding: "4px 0" } as CSSProperties}>
              <Pages page={page} onPage={setPage} className="static" style={{ height: u(DESIGN.pageH), maxWidth: "100%", width: "fit-content" }} />
            </div>
          ) : null}
        </>
      );
  }

  return (
    <div
      ref={root}
      className={`txp${className ? ` ${className}` : ""}`}
      data-layout={m.mode}
      data-explain={explainMode ? "1" : "0"}
      data-hidden={hidden ? "1" : "0"}
      style={{ "--u": `${m.unit}px`, "--tab": `${m.tabBarPx}px` } as CSSProperties}
      onContextMenu={(e) => e.preventDefault()}
      onPointerDownCapture={(e) => {
        if (explainMode && !isChrome(e.target)) e.stopPropagation();
      }}
      onClickCapture={(e) => {
        if (!explainMode || isChrome(e.target)) return;
        e.stopPropagation();
        e.preventDefault();
        const id = targetId(e.target);
        if (id) onExplain?.(id);
      }}
      onKeyDownCapture={(e) => {
        if (!explainMode || e.key !== "Enter" || isChrome(e.target)) return;
        const id = targetId(e.target);
        if (!id) return;
        e.stopPropagation();
        e.preventDefault();
        onExplain?.(id);
      }}
    >
      <style href="skyready-panel-css" precedence="default">
        {PANEL_CSS}
      </style>
      <PanelContext.Provider value={api}>
        {hidden ? (
          <button type="button" className="txp-chip txp-show" data-panel-chrome="1" data-ctl="panel-show" aria-label="Show the instrument panel" onClick={blurThen(() => emit("panel-toggle"))}>
            ▴ Instruments
          </button>
        ) : (
          <>
            <div className="txp-top">
              <div className="txp-compass" style={{ left: compassLeft }}>
                <MagneticCompass />
              </div>
              <div className="txp-handle" data-panel-chrome="1">
                <button type="button" className="txp-chip" data-ctl="explain-toggle" aria-pressed={explainMode} aria-label="Explain mode: tap any instrument to learn what it does" title="Explain an instrument" onClick={blurThen(() => emit("explain-toggle"))}>
                  {explainMode ? "? Tap an instrument" : "? Explain"}
                </button>
                <button type="button" className="txp-chip" data-ctl="panel-hide" aria-label="Hide the instrument panel for a clear view outside" title="Hide the panel" onClick={blurThen(() => emit("panel-toggle"))}>
                  ▾ Hide
                </button>
              </div>
            </div>
            <div className="txp-shell">
              <div className="txp-glare" />
              {body}
            </div>
          </>
        )}
      </PanelContext.Provider>
    </div>
  );
}
