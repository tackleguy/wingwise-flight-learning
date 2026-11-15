/**
 * <CockpitViewer> — renders a CockpitDefinition in 3D against a running SimEngine.
 *
 *   const engine = useCockpitSim(def);
 *   {engine && def ? <CockpitViewer definition={def} engine={engine} onSelect={setHotspot} /> : null}
 *
 * three.js is loaded on the client only (dynamic import in an effect); on the server — and until
 * WebGL is ready — a lightweight placeholder is rendered. Live instruments are the regular TeachX
 * avionics React components, rendered through portals into CSS3D screens inside the cockpit.
 */
import {
  Component,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ErrorInfo,
  type ReactNode,
  type Ref,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import type { SimEngine } from "@/sim/engine";
import { SimProvider } from "@/sim/react";
import {
  AdfIndicator,
  Altimeter,
  AirspeedIndicator,
  Annunciators,
  AttitudeIndicator,
  AutopilotPanel,
  DmeReadout,
  EngineGauges,
  GpsUnit,
  HeadingIndicator,
  Hsi,
  IlsIndicator,
  MagneticCompass,
  Mfd,
  Pfd,
  RadiosPanel,
  SixPack,
  SwitchPanel,
  TurnCoordinator,
  VerticalSpeedIndicator,
  VorIndicator,
} from "@/components/avionics";
import type { CockpitDefinition, Hotspot, InstrumentScreen } from "./types";
import type { CockpitRuntime, ScreenMount } from "./runtime";

export interface CockpitViewerHandle {
  /** Turn the seat view (or orbit target) toward a hotspot. */
  focus(id: string): void;
  getHotspot(id: string): Hotspot | undefined;
  /** Hotspot centre in container pixels (null if off-screen / not ready). */
  project(id: string): { x: number; y: number } | null;
}

export interface CockpitViewerProps {
  definition: CockpitDefinition;
  engine: SimEngine;
  selectedId?: string | null;
  highlightIds?: string[];
  onSelect?(h: Hotspot | null): void;
  onHover?(h: Hotspot | null): void;
  /** controls operable (default true) */
  interactive?: boolean;
  view?: "seat" | "inspect";
  /** transparent background so a World3D canvas behind shows through windows */
  transparent?: boolean;
  /** shared head-look (degrees) for syncing with World3D cockpit camera */
  look?: { yaw: number; pitch: number };
  onLookChange?(l: { yaw: number; pitch: number }): void;
  className?: string;
  showLabels?: boolean;
  ref?: Ref<CockpitViewerHandle>;
}

export function CockpitViewer(props: CockpitViewerProps) {
  const {
    definition,
    engine,
    selectedId = null,
    highlightIds,
    interactive = true,
    view = "seat",
    transparent = false,
    look,
    className,
    showLabels = false,
  } = props;
  const hostRef = useRef<HTMLDivElement>(null);
  const rtRef = useRef<CockpitRuntime | null>(null);
  const [mounts, setMounts] = useState<ScreenMount[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const cb = useRef(props);
  cb.current = props;

  useImperativeHandle(
    props.ref,
    () => ({
      focus: (id) => rtRef.current?.focusHotspot(id),
      getHotspot: (id) => rtRef.current?.getHotspot(id),
      project: (id) => rtRef.current?.projectHotspot(id) ?? null,
    }),
    [],
  );

  useEffect(() => {
    let cancelled = false;
    let rt: CockpitRuntime | null = null;
    setStatus("loading");
    void import("./runtime")
      .then(({ CockpitRuntime }) => {
        const host = hostRef.current;
        if (cancelled || !host) return;
        const p = cb.current;
        rt = new CockpitRuntime({
          host,
          definition,
          engine,
          transparent,
          view: p.view ?? "seat",
          interactive: p.interactive ?? true,
          showLabels: p.showLabels ?? false,
          look: p.look,
          onSelect: (h) => cb.current.onSelect?.(h),
          onHover: (h) => cb.current.onHover?.(h),
          onLookChange: (l) => cb.current.onLookChange?.(l),
        });
        rt.setSelected(p.selectedId ?? null);
        rt.setHighlights(p.highlightIds ?? []);
        rtRef.current = rt;
        setMounts(rt.mounts.slice());
        setStatus("ready");
      })
      .catch((err: unknown) => {
        console.error("[cockpit3d] failed to start", err);
        if (!cancelled) setStatus("error");
      });
    return () => {
      cancelled = true;
      setMounts([]);
      rt?.dispose();
      rtRef.current = null;
    };
  }, [definition, engine, transparent]);

  useEffect(() => rtRef.current?.setSelected(selectedId), [selectedId, status]);
  const hlKey = (highlightIds ?? []).join("|");
  useEffect(() => {
    rtRef.current?.setHighlights(hlKey ? hlKey.split("|") : []);
  }, [hlKey, status]);
  useEffect(() => rtRef.current?.setInteractive(interactive), [interactive, status]);
  useEffect(() => rtRef.current?.setShowLabels(showLabels), [showLabels, status]);
  useEffect(() => rtRef.current?.setView(view), [view, status]);
  const yaw = look?.yaw;
  const pitch = look?.pitch;
  useEffect(() => {
    if (yaw !== undefined && pitch !== undefined) rtRef.current?.setLook({ yaw, pitch });
  }, [yaw, pitch, status]);

  return (
    <div
      className={cn(
        "relative w-full overflow-hidden rounded-xl",
        transparent ? "bg-transparent" : "bg-[#07090c]",
        className ?? "h-[60vh] min-h-[340px]",
      )}
      data-cockpit={definition.id}
    >
      <div
        ref={hostRef}
        className="absolute inset-0"
        aria-label={`${definition.name} 3D cockpit`}
        role="application"
      />
      {status !== "ready" ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
          {status === "error"
            ? "3D cockpit unavailable — your browser could not start WebGL."
            : "Loading 3D cockpit…"}
        </div>
      ) : null}
      {mounts.map((m) =>
        createPortal(
          <ScreenBoundary>
            <SimProvider engine={engine}>
              <ScreenContent screen={m.screen} />
            </SimProvider>
          </ScreenBoundary>,
          m.el,
          m.screen.id,
        ),
      )}
    </div>
  );
}

/** Maps an InstrumentScreen to the matching avionics component. */
export function ScreenContent({ screen }: { screen: InstrumentScreen }) {
  const o = screen.options ?? {};
  switch (screen.component) {
    case "pfd":
      return <Pfd hideSoftKeys={o.hideSoftKeys ?? true} />;
    case "mfd":
      return <Mfd initialPage={o.initialPage} hideEngineStrip={o.hideEngineStrip} />;
    case "sixpack":
      return <SixPack showCompass={false} />;
    case "asi":
      return <AirspeedIndicator />;
    case "ai":
      return <AttitudeIndicator />;
    case "alt":
      return <Altimeter />;
    case "tc":
      return <TurnCoordinator />;
    case "hi":
      return <HeadingIndicator />;
    case "vsi":
      return <VerticalSpeedIndicator />;
    case "compass":
      return <MagneticCompass />;
    case "vor1":
      return <VorIndicator nav={1} />;
    case "vor2":
      return <VorIndicator nav={2} />;
    case "hsi":
      return <Hsi />;
    case "adf":
      return <AdfIndicator />;
    case "dme":
      return <DmeReadout />;
    case "ils":
      return <IlsIndicator />;
    case "radios":
      return <RadiosPanel sections={o.sections} />;
    case "com-nav":
      return <RadiosPanel sections={o.sections ?? ["com", "nav"]} />;
    case "xpdr":
      return <RadiosPanel sections={o.sections ?? ["xpdr"]} />;
    case "autopilot":
      return <AutopilotPanel />;
    case "engine":
      return <EngineGauges layout={o.layout ?? "panel"} />;
    case "annunciators":
      return <Annunciators activeOnly={o.activeOnly} />;
    case "gps":
      return <GpsUnit />;
    case "switches":
      return <SwitchPanel />;
  }
}

class ScreenBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override componentDidCatch(err: Error, info: ErrorInfo) {
    console.error("[cockpit3d] instrument failed", err, info.componentStack);
  }
  override render() {
    return this.state.failed ? (
      <div className="flex h-24 items-center justify-center font-mono text-xs text-red-400">
        INOP
      </div>
    ) : (
      this.props.children
    );
  }
}
