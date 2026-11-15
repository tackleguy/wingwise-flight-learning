import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { BookOpen, ChevronDown, Cpu, Loader2 } from "lucide-react";

import { Notice, Page, PageHeader } from "@/components/app/page";
import { Annunciators } from "@/components/avionics/Annunciators";
import { AP_HELP, AutopilotPanel } from "@/components/avionics/AutopilotPanel";
import { InstrumentExplainContext } from "@/components/avionics/common";
import { EngineGauges } from "@/components/avionics/EngineGauges";
import { GpsUnit } from "@/components/avionics/GpsUnit";
import type { InstrumentId } from "@/components/avionics/instrument-info";
import {
  FlightControls,
  useKeyboardFlightControls,
} from "@/components/avionics/lab/FlightControls";
import { InstrumentInfoSheet } from "@/components/avionics/lab/InstrumentInfoSheet";
import { LabControlStrip } from "@/components/avionics/lab/LabControlStrip";
import { CurrentTaskCard, TaskList } from "@/components/avionics/lab/TaskPanel";
import { useTaskRunner } from "@/components/avionics/lab/useTaskRunner";
import { Mfd } from "@/components/avionics/Mfd";
import { NavInstrumentsPanel } from "@/components/avionics/NavInstruments";
import { Pfd } from "@/components/avionics/Pfd";
import { RadiosPanel } from "@/components/avionics/RadiosPanel";
import { SixPack } from "@/components/avionics/SixPack";
import { SwitchPanel } from "@/components/avionics/SwitchPanel";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  LAB_AIRCRAFT,
  LAB_WEATHER,
  labSimOptions,
  type LabAircraftId,
} from "@/lib/avionics/scenarios";
import { AVIONICS_TASKS, type AvionicsTask, type LabDisplay } from "@/lib/avionics/tasks";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { WEATHER_PRESETS } from "@/sim/environment";
import type { SimEngine } from "@/sim/engine";
import { SimProvider, useCreateSim, useSimSelector } from "@/sim/react";

export const Route = createFileRoute("/avionics")({
  head: () => ({
    meta: [
      { title: "Avionics Lab — TeachX" },
      {
        name: "description",
        content:
          "Hands-on avionics training: a live glass-cockpit PFD/MFD, classic six-pack, VOR/ILS/ADF/DME, the TX-750 GPS navigator and a full autopilot — with guided tasks, failures and instrument explanations.",
      },
    ],
  }),
  component: AvionicsLab,
});

const DISPLAYS: { id: LabDisplay; label: string; short: string }[] = [
  { id: "glass", label: "Glass Cockpit (PFD+MFD)", short: "Glass" },
  { id: "sixpack", label: "Six-Pack", short: "Six-Pack" },
  { id: "nav", label: "Navigation Instruments", short: "Nav" },
  { id: "gps", label: "GPS Navigator", short: "GPS" },
  { id: "autopilot", label: "Autopilot", short: "Autopilot" },
];

function AvionicsLab() {
  const preferred = useStore((s) => s.settings.preferredAircraft);
  const [perfId, setPerfId] = useState<LabAircraftId>(() =>
    LAB_AIRCRAFT.some((a) => a.id === preferred) ? (preferred as LabAircraftId) : "c172",
  );
  const [wx, setWx] = useState<string>("scattered");
  const engine = useCreateSim(() => labSimOptions(perfId, wx), [perfId, wx]);

  // Start with the altimeter still on 29.92 so setting it is a real task.
  useEffect(() => {
    engine?.setRadios({ altimeterInHg: 29.92 });
  }, [engine]);

  return (
    <Page wide>
      <PageHeader
        eyebrow="Fly"
        title="Avionics Lab"
        icon={Cpu}
        description="Fly a live simulation and learn every display, radio and autopilot mode by doing."
        actions={
          <>
            <Select value={perfId} onValueChange={(v) => setPerfId(v as LabAircraftId)}>
              <SelectTrigger className="h-9 w-full sm:w-[300px]" aria-label="Aircraft and panel">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LAB_AIRCRAFT.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.label} — {a.panel}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={wx} onValueChange={setWx}>
              <SelectTrigger className="h-9 w-full sm:w-[200px]" aria-label="Weather">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LAB_WEATHER.map((k) => (
                  <SelectItem key={k} value={k}>
                    {WEATHER_PRESETS[k]?.label ?? k}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        }
      />
      <Notice tone="caution" title="Educational simulation." className="mb-4">
        Avionics here are Garmin-inspired training representations (TeachX Flight Display, TX-750
        Navigator), simplified for learning. Approaches are simulator-generated training procedures,
        not published IAPs. Not a substitute for aircraft-specific training, the AFM/POH, or the
        manufacturer's pilot guide.
      </Notice>
      {engine ? (
        <SimProvider engine={engine}>
          <LabBody key={`${perfId}-${wx}`} engine={engine} />
        </SimProvider>
      ) : (
        <div
          className="flex min-h-[420px] flex-col items-center justify-center gap-3 rounded-xl border border-dashed text-muted-foreground"
          role="status"
        >
          <Loader2 className="size-6 animate-spin text-primary" />
          <p className="text-sm">Starting the simulation…</p>
        </div>
      )}
    </Page>
  );
}

type SidePanel = "autopilot" | "radios" | "systems";

/** Which side-panel tab a task mostly uses. */
function panelFor(task: AvionicsTask): SidePanel {
  if (task.id === "baro-set") return "radios";
  if (task.category === "steam") return "systems";
  if (task.category === "radios" || task.category === "nav") return "radios";
  return "autopilot";
}

function LabBody({ engine }: { engine: SimEngine }) {
  const glass = engine.perf.avionics !== "steam";
  const [display, setDisplay] = useState<LabDisplay>(glass ? "glass" : "sixpack");
  const done = useStore((s) => s.avionicsTasks);
  const [taskId, setTaskId] = useState<string>(
    () => AVIONICS_TASKS.find((t) => !done[t.id])?.id ?? AVIONICS_TASKS[0]!.id,
  );
  const task = AVIONICS_TASKS.find((t) => t.id === taskId) ?? AVIONICS_TASKS[0]!;
  const [panel, setPanel] = useState<SidePanel>(() => panelFor(task));
  const selectTask = useCallback((id: string) => {
    setTaskId(id);
    const t = AVIONICS_TASKS.find((x) => x.id === id);
    if (t) setPanel(panelFor(t));
  }, []);
  const [infoId, setInfoId] = useState<InstrumentId>("pfd");
  const [infoOpen, setInfoOpen] = useState(false);
  const explain = useCallback((id: InstrumentId) => {
    setInfoId(id);
    setInfoOpen(true);
  }, []);
  useKeyboardFlightControls(engine);

  return (
    <InstrumentExplainContext.Provider value={explain}>
      <LabControlStrip className="mb-4">
        <AlertStrip onOpen={() => setPanel("systems")} />
      </LabControlStrip>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[300px_minmax(0,1fr)_360px]">
        {/* left: current task + task list */}
        <aside
          className="panel min-w-0 space-y-4 self-start p-4 lg:col-start-1 lg:row-start-2 xl:row-start-1"
          aria-label="Training tasks"
        >
          <TaskCardHost
            task={task}
            engine={engine}
            onShowDisplay={setDisplay}
            onSelect={selectTask}
          />
          <TaskList currentId={taskId} onSelect={selectTask} className="border-t pt-3" />
        </aside>

        {/* centre: displays + flight controls */}
        <section
          className="min-w-0 space-y-3 lg:col-start-1 lg:row-start-1 xl:col-start-2"
          aria-label="Displays"
        >
          <Tabs value={display} onValueChange={(v) => setDisplay(v as LabDisplay)}>
            <div className="flex items-center justify-between gap-2">
              <TabsList className="h-auto max-w-full flex-wrap justify-start">
                {DISPLAYS.map((d) => (
                  <TabsTrigger
                    key={d.id}
                    value={d.id}
                    title={d.label}
                    className="px-2.5 text-xs sm:text-sm"
                  >
                    {d.short}
                  </TabsTrigger>
                ))}
              </TabsList>
              <Button
                size="sm"
                variant="ghost"
                className="shrink-0"
                aria-label="Explain this display"
                title="Explain this display (instrument guide)"
                onClick={() => explain(DISPLAY_INFO[display])}
              >
                <BookOpen /> <span className="hidden sm:inline">Explain</span>
              </Button>
            </div>
            <TabsContent value="glass" className="space-y-3">
              <div className="grid gap-3 min-[1880px]:grid-cols-2">
                <Pfd />
                <Mfd />
              </div>
            </TabsContent>
            <TabsContent value="sixpack">
              <div className="mx-auto max-w-3xl space-y-2">
                <SixPack />
                {glass ? (
                  <p className="text-center text-xs text-muted-foreground">
                    Standby instruments — they keep working after an AHRS failure.
                  </p>
                ) : null}
              </div>
            </TabsContent>
            <TabsContent value="nav">
              <NavInstrumentsPanel />
            </TabsContent>
            <TabsContent value="gps">
              <div className="mx-auto max-w-3xl">
                <GpsUnit />
              </div>
            </TabsContent>
            <TabsContent value="autopilot" className="space-y-3">
              <div className="grid gap-3 min-[1880px]:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
                <Pfd hideSoftKeys />
                <AutopilotPanel />
              </div>
            </TabsContent>
          </Tabs>
          <FlightControls />
        </section>

        {/* right: one tabbed panel for autopilot / radios / systems */}
        <aside
          className="min-w-0 lg:col-start-2 lg:row-span-2 lg:row-start-1 xl:col-start-3"
          aria-label="Cockpit panels"
        >
          <Tabs value={panel} onValueChange={(v) => setPanel(v as SidePanel)}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="autopilot">Autopilot</TabsTrigger>
              <TabsTrigger value="radios">Radios</TabsTrigger>
              <TabsTrigger value="systems">Systems</TabsTrigger>
            </TabsList>
            <TabsContent value="autopilot" className="space-y-3">
              {display !== "autopilot" ? <AutopilotPanel /> : null}
              <ModeGuide open={display === "autopilot"} />
            </TabsContent>
            <TabsContent value="radios">
              <RadiosPanel />
            </TabsContent>
            <TabsContent value="systems" className="space-y-3">
              <Annunciators />
              <SwitchPanel />
              {display !== "glass" ? <EngineGauges /> : null}
            </TabsContent>
          </Tabs>
        </aside>
      </div>
      <InstrumentInfoSheet
        id={infoId}
        open={infoOpen}
        onOpenChange={setInfoOpen}
        onSelect={setInfoId}
      />
    </InstrumentExplainContext.Provider>
  );
}

const DISPLAY_INFO: Record<LabDisplay, InstrumentId> = {
  glass: "pfd",
  sixpack: "ai",
  nav: "vor",
  gps: "gps",
  autopilot: "autopilot",
};

/** One-line list of active annunciations; renders nothing when all is quiet. */
function AlertStrip({ onOpen }: { onOpen: () => void }) {
  const key = useSimSelector((s) => s.alerts.map((a) => `${a.level}:${a.text}`).join("|"));
  if (!key) return null;
  const alerts = key.split("|").map((k) => {
    const i = k.indexOf(":");
    return { level: k.slice(0, i), text: k.slice(i + 1) };
  });
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex min-w-0 flex-wrap items-center gap-1 sm:ml-auto"
      aria-label="Active annunciations — open Systems"
      title="Open the Systems panel"
    >
      {alerts.map((a) => (
        <span
          key={a.text}
          className={cn(
            "rounded-[3px] px-1.5 py-0.5 font-mono text-[10px] font-bold text-black",
            a.level === "warning"
              ? "animate-annunciator bg-warning"
              : a.level === "caution"
                ? "bg-caution"
                : "bg-white/85",
          )}
        >
          {a.text}
        </span>
      ))}
    </button>
  );
}

/** Runs the live task evaluator (all tasks) and shows the selected task. Kept separate so its
 *  5 Hz status updates don't re-render the whole lab. */
function TaskCardHost({
  task,
  engine,
  onShowDisplay,
  onSelect,
}: {
  task: AvionicsTask;
  engine: SimEngine;
  onShowDisplay: (d: LabDisplay) => void;
  onSelect: (id: string) => void;
}) {
  const runner = useTaskRunner(engine, task.id);
  return (
    <CurrentTaskCard
      task={task}
      runner={runner}
      engine={engine}
      onShowDisplay={onShowDisplay}
      onSelect={onSelect}
    />
  );
}

function ModeGuide({ open }: { open: boolean }) {
  const rows: [string, string][] = [
    ["HDG", AP_HELP["HDG"]!],
    ["NAV", AP_HELP["NAV"]!],
    ["APR", AP_HELP["APR"]!],
    ["ALT", AP_HELP["ALT"]!],
    ["VS", AP_HELP["VS"]!],
    ["FLC", AP_HELP["FLC"]!],
  ];
  return (
    <details className="group px-1" open={open}>
      <summary className="flex cursor-pointer list-none items-center gap-1.5 text-xs font-semibold text-muted-foreground select-none hover:text-foreground [&::-webkit-details-marker]:hidden">
        <BookOpen className="size-3.5" /> Mode guide
        <ChevronDown className="size-3.5 transition-transform group-open:rotate-180" />
      </summary>
      <p className="mt-2 text-xs text-muted-foreground">
        <span className="font-semibold text-ok">Green</span> = active ·{" "}
        <span className="font-semibold text-foreground">White</span> = armed. Always confirm the PFD
        annunciation.
      </p>
      <dl className="mt-2 space-y-1.5 text-xs">
        {rows.map(([k, v]) => (
          <div key={k} className="grid grid-cols-[2.5rem_1fr] gap-2">
            <dt className="font-mono font-bold text-ok">{k}</dt>
            <dd className="leading-snug text-muted-foreground">{v}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}
