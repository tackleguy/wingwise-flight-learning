import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { BookOpen, Cpu, Loader2 } from "lucide-react";

import { Notice, Page, PageHeader } from "@/components/app/page";
import { Annunciators } from "@/components/avionics/Annunciators";
import { AP_HELP, AutopilotPanel } from "@/components/avionics/AutopilotPanel";
import { InstrumentExplainContext } from "@/components/avionics/common";
import { EngineGauges } from "@/components/avionics/EngineGauges";
import { GpsUnit } from "@/components/avionics/GpsUnit";
import type { InstrumentId } from "@/components/avionics/instrument-info";
import { FlightControls, useKeyboardFlightControls } from "@/components/avionics/lab/FlightControls";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LAB_AIRCRAFT, LAB_WEATHER, labSimOptions, type LabAircraftId } from "@/lib/avionics/scenarios";
import { AVIONICS_TASKS, type LabDisplay } from "@/lib/avionics/tasks";
import { useStore } from "@/lib/store";
import { WEATHER_PRESETS } from "@/sim/environment";
import type { SimEngine } from "@/sim/engine";
import { SimProvider } from "@/sim/react";
import { useCreateSim } from "@/sim/react";

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
  const [perfId, setPerfId] = useState<LabAircraftId>(() => (LAB_AIRCRAFT.some((a) => a.id === preferred) ? (preferred as LabAircraftId) : "c172"));
  const [wx, setWx] = useState<string>("scattered");
  const engine = useCreateSim(() => labSimOptions(perfId, wx), [perfId, wx]);

  // Start with the altimeter still on 29.92 so setting it is a real task.
  useEffect(() => {
    engine?.setRadios({ altimeterInHg: 29.92 });
  }, [engine]);

  return (
    <Page wide>
      <PageHeader
        eyebrow="Train"
        title="Avionics Lab"
        icon={Cpu}
        description="Fly a live simulation and learn every display, radio and autopilot mode by doing. Every needle, tape and annunciation is driven by the same flight model."
        actions={
          <>
            <Select value={perfId} onValueChange={(v) => setPerfId(v as LabAircraftId)}>
              <SelectTrigger className="h-9 w-[230px]" aria-label="Aircraft and panel">
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
              <SelectTrigger className="h-9 w-[190px]" aria-label="Weather">
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
        Avionics here are Garmin-inspired training representations (TeachX Flight Display, TX-750 Navigator), simplified for learning. Approaches are simulator-generated training procedures, not published IAPs. Not a substitute for aircraft-specific
        training, the AFM/POH, or the manufacturer's pilot guide.
      </Notice>
      {engine ? (
        <SimProvider engine={engine}>
          <LabBody key={`${perfId}-${wx}`} engine={engine} />
        </SimProvider>
      ) : (
        <div className="flex min-h-[420px] flex-col items-center justify-center gap-3 rounded-xl border border-dashed text-muted-foreground" role="status">
          <Loader2 className="size-6 animate-spin text-primary" />
          <p className="text-sm">Starting the simulation…</p>
        </div>
      )}
    </Page>
  );
}

function LabBody({ engine }: { engine: SimEngine }) {
  const glass = engine.perf.avionics !== "steam";
  const [display, setDisplay] = useState<LabDisplay>(glass ? "glass" : "sixpack");
  const done = useStore((s) => s.avionicsTasks);
  const [taskId, setTaskId] = useState<string>(() => AVIONICS_TASKS.find((t) => !done[t.id])?.id ?? AVIONICS_TASKS[0]!.id);
  const task = AVIONICS_TASKS.find((t) => t.id === taskId) ?? AVIONICS_TASKS[0]!;
  const runner = useTaskRunner(engine, taskId);
  const [infoId, setInfoId] = useState<InstrumentId>("pfd");
  const [infoOpen, setInfoOpen] = useState(false);
  const explain = useCallback((id: InstrumentId) => {
    setInfoId(id);
    setInfoOpen(true);
  }, []);
  useKeyboardFlightControls(engine);

  return (
    <InstrumentExplainContext.Provider value={explain}>
      <LabControlStrip className="mb-4" />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[300px_minmax(0,1fr)_380px]">
        {/* centre: displays */}
        <section className="min-w-0 space-y-4 lg:col-start-1 xl:col-start-2 xl:row-start-1" aria-label="Displays">
          <Tabs value={display} onValueChange={(v) => setDisplay(v as LabDisplay)}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <TabsList className="h-auto max-w-full flex-wrap justify-start">
                {DISPLAYS.map((d) => (
                  <TabsTrigger key={d.id} value={d.id} className="text-xs sm:text-sm">
                    <span className="hidden sm:inline">{d.label}</span>
                    <span className="sm:hidden">{d.short}</span>
                  </TabsTrigger>
                ))}
              </TabsList>
              <Button size="sm" variant="ghost" onClick={() => explain(display === "glass" ? "pfd" : display === "sixpack" ? "ai" : display === "nav" ? "vor" : display === "gps" ? "gps" : "autopilot")}>
                <BookOpen /> Explain this display
              </Button>
            </div>
            <TabsContent value="glass" className="space-y-3">
              <div className="grid gap-3 2xl:grid-cols-2">
                <Pfd />
                <Mfd />
              </div>
            </TabsContent>
            <TabsContent value="sixpack">
              <div className="mx-auto max-w-3xl space-y-3">
                <SixPack />
                {glass ? <p className="text-center text-xs text-muted-foreground">In this glass-cockpit aircraft, the six-pack represents the standby instruments — the standby attitude indicator keeps working after an AHRS failure.</p> : null}
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
              <div className="grid gap-3 2xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
                <Pfd hideSoftKeys />
                <div className="space-y-3">
                  <AutopilotPanel />
                  <ModeGuide />
                </div>
              </div>
            </TabsContent>
          </Tabs>
          <FlightControls />
        </section>

        {/* left: tasks */}
        <aside className="min-w-0 space-y-4 lg:col-start-1 lg:row-start-2 xl:col-start-1 xl:row-start-1" aria-label="Training tasks">
          <CurrentTaskCard task={task} runner={runner} engine={engine} onShowDisplay={setDisplay} />
          <TaskList currentId={taskId} onSelect={setTaskId} />
          <div className="panel p-3">
            <p className="label-caps mb-1.5">Explain an instrument</p>
            <p className="mb-2 text-xs text-muted-foreground">Click the ⓘ on any instrument, or open the guide.</p>
            <Button size="sm" variant="outline" className="w-full" onClick={() => setInfoOpen(true)}>
              <BookOpen /> Instrument guide
            </Button>
          </div>
        </aside>

        {/* right: controls */}
        <aside className="min-w-0 space-y-4 lg:col-start-2 lg:row-span-2 lg:row-start-1 xl:col-start-3" aria-label="Panels">
          {display !== "autopilot" ? <AutopilotPanel /> : null}
          <RadiosPanel />
          <Annunciators />
          <SwitchPanel />
          {display !== "glass" ? <EngineGauges /> : null}
        </aside>
      </div>
      <InstrumentInfoSheet id={infoId} open={infoOpen} onOpenChange={setInfoOpen} onSelect={setInfoId} />
    </InstrumentExplainContext.Provider>
  );
}

function ModeGuide() {
  const rows: [string, string][] = [
    ["HDG", AP_HELP["HDG"]!],
    ["NAV", AP_HELP["NAV"]!],
    ["APR", AP_HELP["APR"]!],
    ["ALT", AP_HELP["ALT"]!],
    ["VS", AP_HELP["VS"]!],
    ["FLC", AP_HELP["FLC"]!],
  ];
  return (
    <div className="panel p-3">
      <p className="label-caps mb-2">Mode guide</p>
      <p className="mb-2 text-xs text-muted-foreground">
        <span className="font-semibold text-ok">Green</span> = active · <span className="font-semibold text-foreground">White</span> = armed (waits to capture). Always confirm the PFD annunciation after pressing a button.
      </p>
      <dl className="space-y-1.5 text-xs">
        {rows.map(([k, v]) => (
          <div key={k} className="grid grid-cols-[2.5rem_1fr] gap-2">
            <dt className="font-mono font-bold text-ok">{k}</dt>
            <dd className="leading-snug text-muted-foreground">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
