import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  CheckCircle2,
  Circle,
  Eye,
  Flag,
  Pause,
  Play,
  RotateCcw,
  XCircle,
  Video,
  ListChecks,
  PanelBottomClose,
  PanelBottomOpen,
} from "lucide-react";
import { toast } from "sonner";
import { SimProvider, useCreateSim, useSimSnapshot } from "@/sim/react";
import type { SimEngine } from "@/sim/engine";
import {
  CATEGORY_LABEL,
  scoreObjectives,
  type BuiltScenario,
  type ScenarioConfig,
  type ScenarioDef,
} from "@/sim/scenarios";
import type { SimEvent } from "@/sim/types";
import { actions, useStore, type FlightLog } from "@/lib/store";
import { getPerf } from "@/lib/data/aircraft-perf";
import { distanceNm } from "@/lib/geo";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { World3D, type CameraMode } from "./World3D";
import { CAMERAS, useFlightControls } from "./useFlightControls";
import { CockpitControls, VirtualYoke } from "./CockpitControls";
import { InstrumentPanel } from "./InstrumentPanel";
import { FlightDataStrip } from "./FlightDataStrip";
import { Debrief, type DebriefData } from "./Debrief";

const CAMERA_LABEL: Record<CameraMode, string> = {
  cockpit: "Cockpit",
  chase: "Chase",
  orbit: "Orbit",
  tower: "Tower",
};

const TIPS: Record<string, string> = {
  land: "Fly a stabilised approach: on speed, on glidepath (PAPI 2 white / 2 red), aligned with the centerline. Reduce power over the threshold and flare gradually.",
  vy: "Pitch for VY and trim to hold it — small pitch changes (1–2°) move the airspeed several knots.",
  hdg: "Use rudder to stay on the centerline and correct for the left-turning tendencies at high power.",
  tpa: "Level off at pattern altitude with pitch, then set cruise power and trim.",
  "steep-left":
    "Add back pressure and a little power as you roll in; keep the nose on the horizon. Roll out 20° before the entry heading.",
  "steep-right":
    "Add back pressure and a little power as you roll in; keep the nose on the horizon.",
  recovery: "Reduce angle of attack FIRST (forward pressure), then level the wings and add power.",
  "loc-track":
    "Make small heading corrections (2–5°) and wait for the needle to respond. Fly the heading that keeps the needle still.",
  "gs-track":
    "Glideslope: power for small corrections, pitch for larger ones. ~500 fpm descent at 100 kt groundspeed.",
  alt: "Scan the altimeter and VSI; trim off control pressure so the aircraft holds altitude by itself.",
  vg: "At the first sign of engine failure, pitch immediately for best glide — airspeed is life.",
  shed: "Turn off non-essential electrical loads to extend battery life.",
  "7600": "Lost comms: squawk 7600 and follow 14 CFR 91.185 (AVE-F / MEA).",
};

export interface FlightSessionProps {
  scenario: ScenarioDef;
  config: ScenarioConfig;
  built: BuiltScenario;
  checkrideId?: string | undefined;
  onExit: () => void;
  onRestart: () => void;
}

export function FlightSession(props: FlightSessionProps) {
  const engine = useCreateSim(() => props.built.options, [props.built]);
  if (!engine) {
    return (
      <div className="grid h-[calc(100dvh-3rem)] place-items-center bg-panel">
        <div className="text-center">
          <div className="mx-auto mb-3 size-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="label-caps">Loading aircraft &amp; scenery…</p>
        </div>
      </div>
    );
  }
  return (
    <SimProvider engine={engine}>
      <ActiveFlight {...props} engine={engine} />
    </SimProvider>
  );
}

function ActiveFlight({
  scenario,
  config,
  built,
  checkrideId,
  onExit,
  onRestart,
  engine,
}: FlightSessionProps & { engine: SimEngine }) {
  const settings = useStore((s) => s.settings);
  const [camera, setCamera] = useState<CameraMode>("cockpit");
  const [panelOpen, setPanelOpen] = useState(true);
  const [showObjectives, setShowObjectives] = useState(true);
  const [messages, setMessages] = useState<{ id: number; text: string; level: "info" | "warn" }[]>(
    [],
  );
  const [debrief, setDebrief] = useState<DebriefData | null>(null);
  const [, force] = useState(0);
  const ended = useRef(false);
  const startedAt = useRef(Date.now());
  const stats = useRef({
    landings: 0,
    maxAlt: 0,
    lastSimT: 0,
    failuresFired: new Set<number>(),
    crashAt: 0,
    maneuvers: new Set<string>(),
  });
  const msgId = useRef(0);

  const pushMessage = useCallback((text: string, level: "info" | "warn" = "info") => {
    if (!text) return;
    const id = ++msgId.current;
    setMessages((m) => [...m.slice(-3), { id, text, level }]);
    window.setTimeout(() => setMessages((m) => m.filter((x) => x.id !== id)), 6000);
  }, []);

  // Expose the engine for debugging in development builds only.
  useEffect(() => {
    if (import.meta.env.DEV) (window as unknown as { __sim?: SimEngine }).__sim = engine;
  }, [engine]);

  // Scenario setup (radios, GPS, approaches)
  useEffect(() => {
    built.setup?.(engine);
    pushMessage(built.instructions[0] ?? scenario.title);
  }, [engine, built, scenario.title, pushMessage]);

  const finish = useCallback(
    (reason: "complete" | "manual" | "crash" | "timeout") => {
      if (ended.current) return;
      ended.current = true;
      engine.setPaused(true);
      const snap = engine.getSnapshot();
      const a = snap.aircraft;
      const { score, results } = scoreObjectives(built.objectives, a.crashReason);
      const feedback: string[] = [];
      if (a.crashed)
        feedback.push(
          `The flight ended in a crash: ${a.crashReason}. In a real aircraft this would have been an accident — review the briefing and try again.`,
        );
      for (const r of results) {
        if (!r.met) {
          const tip = TIPS[r.id] ?? TIPS[r.id.split("-")[0] ?? ""] ?? "";
          feedback.push(`${r.text}: ${r.detail}.${tip ? ` Tip: ${tip}` : ""}`);
        }
      }
      if (reason === "manual" && results.some((r) => !r.met))
        feedback.push(
          "Flight ended early — incomplete objectives were scored as attempted so far.",
        );
      if (!feedback.length)
        feedback.push(
          "All objectives met. Excellent airmanship — try a harder weather preset or a different aircraft next.",
        );
      const durationSec = Math.max(1, a.simTimeSec);
      const night = snap.weather.timeOfDay < 6.5 || snap.weather.timeOfDay > 19.5;
      const approaches =
        scenario.rules === "IFR" &&
        results.some(
          (r) => (r.id === "loc-track" || r.id === "vdev" || r.id === "gs") && r.score > 0.3,
        )
          ? 1
          : 0;
      const log: Omit<FlightLog, "id" | "date"> = {
        aircraftId: engine.perf.id,
        departure: built.departure.icao,
        destination: nearestIcao(built, a.lat, a.lon),
        durationSec,
        kind: scenario.category === "free" ? "free" : scenario.category,
        rules: scenario.rules,
        scenarioId: scenario.id,
        scenarioTitle: scenario.title,
        landings: stats.current.landings,
        approaches,
        night,
        maneuvers: scenario.maneuvers,
        objectives: results.map((r) => ({ text: r.text, met: r.met, detail: r.detail })),
        feedback,
        score: Math.round(score),
      };
      if (checkrideId) log.checkrideId = checkrideId;
      const flightId = actions.logFlight(log);
      setDebrief({
        flightId,
        score,
        results,
        feedback,
        crashed: a.crashed ? a.crashReason : "",
        durationSec,
        distanceNm: a.distanceNm,
        landings: stats.current.landings,
        maxAlt: stats.current.maxAlt,
        realSec: (Date.now() - startedAt.current) / 1000,
      });
    },
    [engine, built, scenario, checkrideId],
  );

  // Event handling: objectives, messages, landings
  useEffect(() => {
    return engine.onEvent((e: SimEvent) => {
      const snap = engine.getSnapshot();
      for (const o of built.objectives) o.event(e, snap);
      if (e.type === "touchdown") {
        stats.current.landings += 1;
        pushMessage(
          `${e.message} — ${e.data?.["vs"] ?? 0} fpm`,
          Number(e.data?.["vs"] ?? 0) < -600 ? "warn" : "info",
        );
      } else if (e.type === "crash") {
        pushMessage(`CRASH — ${e.message}`, "warn");
        stats.current.crashAt = Date.now();
        window.setTimeout(() => finish("crash"), 2500);
      } else if (
        e.type === "stall" ||
        e.type === "overspeed" ||
        e.type === "gear-warning" ||
        e.type === "failure"
      ) {
        pushMessage(e.message, "warn");
      } else if (e.type === "liftoff" || e.type === "engine" || e.type === "info") {
        pushMessage(e.message);
      }
    });
  }, [engine, built, pushMessage, finish]);

  // Per-frame objective updates & scheduled failures
  useEffect(() => {
    let lastT = engine.getSnapshot().aircraft.simTimeSec;
    let lastRender = 0;
    return engine.subscribe(() => {
      const s = engine.getSnapshot();
      const t = s.aircraft.simTimeSec;
      const dt = t - lastT;
      lastT = t;
      if (dt <= 0 || ended.current) return;
      for (const o of built.objectives) o.update(s, dt);
      stats.current.maxAlt = Math.max(stats.current.maxAlt, s.indicated.altFt);
      built.failures.forEach((f, i) => {
        if (stats.current.failuresFired.has(i)) return;
        const due = typeof f.at === "number" ? t >= f.at : f.at(s);
        if (!due) return;
        stats.current.failuresFired.add(i);
        if (f.weather) engine.setWeather(f.weather);
        if (f.failure) engine.setFailure(f.failure, true);
        if (f.message) pushMessage(f.message, "warn");
      });
      if (built.isComplete?.(s, t)) finish("complete");
      else if (t > built.maxDurationSec) finish("timeout");
      // re-render objective panel ~3x per second
      const now = performance.now();
      if (now - lastRender > 330) {
        lastRender = now;
        force((x) => x + 1);
      }
    });
  }, [engine, built, finish, pushMessage]);

  const cycleCamera = useCallback((c: CameraMode | "next") => {
    setCamera((cur) => (c === "next" ? CAMERAS[(CAMERAS.indexOf(cur) + 1) % CAMERAS.length]! : c));
  }, []);
  const virtual = useFlightControls(engine, {
    invertPitch: settings.sim.invertPitch,
    sensitivity: settings.sim.sensitivity,
    enabled: !debrief,
    onCamera: cycleCamera,
    onPause: () => engine.togglePause(),
  });

  const origin = useMemo(() => ({ lat: built.departure.lat, lon: built.departure.lon }), [built]);
  const live = scoreObjectives(built.objectives, "");

  return (
    <div className="relative flex h-[calc(100dvh-3rem)] flex-col overflow-hidden bg-bezel">
      <div className="relative min-h-0 flex-1">
        <World3D
          engine={engine}
          origin={origin}
          towerAirport={built.departure}
          landmarks={built.landmarks}
          camera={camera}
          quality={settings.sim.quality}
          className="absolute inset-0"
        />

        {/* Top-left: scenario & objectives */}
        <div className="pointer-events-none absolute top-3 left-3 z-10 w-[min(340px,calc(100%-1.5rem))] space-y-2">
          <div className="pointer-events-auto rounded-md border border-white/10 bg-black/60 p-3 text-white backdrop-blur">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-[10px] font-semibold tracking-[0.14em] text-cyan uppercase">
                  {CATEGORY_LABEL[scenario.category]} · {scenario.rules} ·{" "}
                  {getPerf(engine.perf.id).shortName}
                </p>
                <p className="text-sm font-semibold">{scenario.title}</p>
              </div>
              <button
                onClick={() => setShowObjectives((v) => !v)}
                className="rounded p-1 hover:bg-white/10"
                aria-label="Toggle objectives"
              >
                <ListChecks className="size-4" />
              </button>
            </div>
            {showObjectives ? (
              <>
                <ul className="mt-2 space-y-1.5">
                  {live.results.map((r) => (
                    <li key={r.id} className="flex gap-1.5 text-[11px] leading-snug">
                      {r.met ? (
                        <CheckCircle2 className="mt-px size-3.5 shrink-0 text-ok" />
                      ) : r.score > 0 ? (
                        <Circle className="mt-px size-3.5 shrink-0 text-caution" />
                      ) : (
                        <Circle className="mt-px size-3.5 shrink-0 text-white/40" />
                      )}
                      <span>
                        <span className={r.met ? "text-white" : "text-white/85"}>{r.text}</span>
                        <span className="block text-white/50">{r.detail}</span>
                      </span>
                    </li>
                  ))}
                </ul>
                {built.instructions.length ? (
                  <div className="mt-2 border-t border-white/10 pt-2 text-[11px] leading-relaxed text-white/75">
                    {built.instructions.map((i, k) => (
                      <p key={k}>{i}</p>
                    ))}
                  </div>
                ) : null}
              </>
            ) : null}
          </div>
        </div>

        {/* Top-right: alerts + view controls */}
        <TopRight
          engine={engine}
          camera={camera}
          onCamera={setCamera}
          onEnd={() => finish("manual")}
          onRestart={onRestart}
        />

        {/* Messages */}
        <div className="pointer-events-none absolute top-3 left-1/2 z-10 flex w-[min(460px,60%)] -translate-x-1/2 flex-col items-center gap-1.5">
          {messages.map((m) => (
            <div
              key={m.id}
              className={cn(
                "animate-fade-up rounded border px-3 py-1.5 text-center text-xs font-medium backdrop-blur",
                m.level === "warn"
                  ? "border-warning/50 bg-warning/20 text-white"
                  : "border-white/15 bg-black/60 text-white",
              )}
            >
              {m.text}
            </div>
          ))}
        </div>

        {settings.sim.hud ? (
          <FlightDataStrip className="absolute bottom-3 left-1/2 z-10 -translate-x-1/2" />
        ) : null}
        <VirtualYoke virtual={virtual} className="absolute right-3 bottom-3 z-10" />
        <PausedOverlay engine={engine} />
      </div>

      {/* Instrument panel & controls */}
      <div
        className={cn(
          "relative z-20 border-t border-white/10 bg-panel transition-[height]",
          panelOpen ? "h-[min(46vh,330px)]" : "h-10",
        )}
      >
        <button
          onClick={() => setPanelOpen((v) => !v)}
          className="absolute -top-8 left-3 inline-flex items-center gap-1 rounded-t border border-b-0 border-white/10 bg-panel px-2.5 py-1 text-[11px] text-white/80"
        >
          {panelOpen ? (
            <PanelBottomClose className="size-3.5" />
          ) : (
            <PanelBottomOpen className="size-3.5" />
          )}{" "}
          {panelOpen ? "Hide panel" : "Show panel"}
        </button>
        {panelOpen ? (
          <div className="flex h-full min-h-0 gap-2 overflow-x-auto p-2">
            <InstrumentPanel />
            <CockpitControls />
          </div>
        ) : (
          <div className="flex h-full items-center px-3 text-[11px] text-white/60">
            Panel hidden — keyboard controls remain active. Press C to change view.
          </div>
        )}
      </div>

      {debrief ? (
        <Debrief
          data={debrief}
          scenario={scenario}
          aircraftId={engine.perf.id}
          checkrideId={checkrideId}
          onRetry={onRestart}
          onChoose={onExit}
        />
      ) : null}
      <span className="hidden">{config.aircraftId}</span>
    </div>
  );
}

function nearestIcao(built: BuiltScenario, lat: number, lon: number) {
  const cands = [built.departure, built.destination].filter(
    Boolean,
  ) as BuiltScenario["departure"][];
  let best = built.departure.icao;
  let d = Infinity;
  for (const a of cands) {
    const dd = distanceNm(a.lat, a.lon, lat, lon);
    if (dd < d) {
      d = dd;
      best = a.icao;
    }
  }
  return d < 5 ? best : `${best} area`;
}

function TopRight({
  engine,
  camera,
  onCamera,
  onEnd,
  onRestart,
}: {
  engine: SimEngine;
  camera: CameraMode;
  onCamera: (c: CameraMode) => void;
  onEnd: () => void;
  onRestart: () => void;
}) {
  const snap = useSimSnapshot(engine);
  return (
    <div className="absolute top-3 right-3 z-10 flex flex-col items-end gap-2">
      <div className="flex flex-wrap justify-end gap-1">
        {snap.alerts.slice(0, 6).map((a) => (
          <span
            key={a.text}
            className={cn(
              "rounded px-2 py-0.5 font-mono text-[11px] font-bold",
              a.level === "warning"
                ? "animate-annunciator bg-warning text-white"
                : a.level === "caution"
                  ? "bg-caution text-black"
                  : "bg-white/20 text-white",
            )}
          >
            {a.text}
          </span>
        ))}
      </div>
      <div className="flex items-center gap-1 rounded-md border border-white/10 bg-black/60 p-1 backdrop-blur">
        <Video className="mx-1 size-3.5 text-white/60" />
        {CAMERAS.map((c, i) => (
          <button
            key={c}
            onClick={() => onCamera(c)}
            title={`${CAMERA_LABEL[c]} view (${i + 1})`}
            className={cn(
              "rounded px-2 py-1 text-[11px] font-semibold",
              camera === c
                ? "bg-primary text-primary-foreground"
                : "text-white/80 hover:bg-white/10",
            )}
          >
            {CAMERA_LABEL[c]}
          </button>
        ))}
      </div>
      <div className="flex gap-1">
        <Button
          size="sm"
          variant="secondary"
          className="h-7 gap-1 bg-black/60 text-white hover:bg-black/80"
          onClick={() => engine.togglePause()}
        >
          {snap.paused ? <Play className="size-3.5" /> : <Pause className="size-3.5" />}{" "}
          {snap.paused ? "Resume" : "Pause"}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          className="h-7 gap-1 bg-black/60 text-white hover:bg-black/80"
          onClick={onRestart}
        >
          <RotateCcw className="size-3.5" /> Restart
        </Button>
        <Button size="sm" className="h-7 gap-1" onClick={onEnd}>
          <Flag className="size-3.5" /> End & debrief
        </Button>
      </div>
      {camera === "cockpit" ? (
        <p className="flex items-center gap-1 text-[10px] text-white/60">
          <Eye className="size-3" /> Out-the-window view
        </p>
      ) : null}
      {snap.aircraft.crashed ? (
        <p className="flex items-center gap-1 rounded bg-warning px-2 py-1 text-xs font-bold text-white">
          <XCircle className="size-3.5" /> {snap.aircraft.crashReason}
        </p>
      ) : null}
    </div>
  );
}

function PausedOverlay({ engine }: { engine: SimEngine }) {
  const snap = useSimSnapshot(engine);
  if (!snap.paused || snap.aircraft.crashed) return null;
  return (
    <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center">
      <div className="rounded-md border border-white/15 bg-black/70 px-6 py-4 text-center text-white backdrop-blur">
        <p className="font-mono text-lg font-bold tracking-widest">PAUSED</p>
        <p className="mt-1 text-xs text-white/70">
          Press Space or Resume to continue.{" "}
          <Link to="/settings" className="pointer-events-auto text-cyan underline">
            Control settings
          </Link>
        </p>
      </div>
    </div>
  );
}
