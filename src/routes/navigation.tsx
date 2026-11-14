import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Calculator,
  Crosshair,
  Eraser,
  Layers as LayersIcon,
  Map as MapIcon,
  MousePointer2,
  Route as RouteIcon,
  Ruler,
  Undo2,
} from "lucide-react";

import { Notice, Page, PageHeader, Panel } from "@/components/app/page";
import { BayChart, type ChartPoint, type Layers } from "@/components/navigation/bay-chart";
import {
  ChartPractice,
  EnrouteTraining,
  SectionalTraining,
  TerminalTraining,
} from "@/components/navigation/chart-training";
import { E6B } from "@/components/navigation/e6b";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getAirport } from "@/lib/data/airports";
import { fmtHdg } from "@/lib/data/airport-utils";
import { bearingDeg, distanceNm, norm360, windTriangle } from "@/lib/geo";
import { fmtMin } from "@/lib/planning";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/navigation")({
  head: () => ({
    meta: [
      { title: "Navigation & Charts — TeachX" },
      {
        name: "description",
        content:
          "Interactive educational chart workspace: plot routes, measure courses and distances, compute wind correction, ETE and fuel; E6B calculator; sectional, IFR en-route and approach chart reading practice.",
      },
    ],
  }),
  component: NavigationPage,
});

const DEFAULT_LAYERS: Layers = {
  airspace: true,
  navaids: true,
  special: true,
  points: true,
  labels: true,
};

function NavigationPage() {
  const [layers, setLayers] = useState<Layers>(DEFAULT_LAYERS);
  return (
    <Page wide>
      <PageHeader
        eyebrow="Train"
        icon={MapIcon}
        title="Navigation & Charts"
        description="Plot a route on an interactive chart, work the numbers with an E6B, and practice reading sectional, en-route and terminal charts."
      />
      <Notice tone="caution" title="Educational chart — not for navigation." className="mb-5">
        The chart is a stylized drawing built from TeachX's educational airport and navaid dataset.
        Airspace shapes are simplified rings, the coastline is approximate, and the restricted area,
        MOA, some obstacles and the GPS waypoints are fictional examples for symbol training. Always
        use current FAA charts for flight.
      </Notice>
      <Tabs defaultValue="workspace">
        <div className="overflow-x-auto">
          <TabsList className="mb-4">
            <TabsTrigger value="workspace">
              <RouteIcon className="size-4" /> Chart workspace
            </TabsTrigger>
            <TabsTrigger value="e6b">
              <Calculator className="size-4" /> E6B
            </TabsTrigger>
            <TabsTrigger value="sectional">Sectional</TabsTrigger>
            <TabsTrigger value="enroute">IFR en-route</TabsTrigger>
            <TabsTrigger value="terminal">Approach plates & diagrams</TabsTrigger>
            <TabsTrigger value="practice">
              <Crosshair className="size-4" /> Chart practice
            </TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="workspace">
          <Workspace layers={layers} setLayers={setLayers} />
        </TabsContent>
        <TabsContent value="e6b">
          <div className="max-w-4xl">
            <E6B />
          </div>
        </TabsContent>
        <TabsContent value="sectional">
          <SectionalTraining />
        </TabsContent>
        <TabsContent value="enroute">
          <EnrouteTraining />
        </TabsContent>
        <TabsContent value="terminal">
          <TerminalTraining />
        </TabsContent>
        <TabsContent value="practice">
          <LayerToggles layers={layers} setLayers={setLayers} className="mb-3" />
          <ChartPractice layers={layers} />
        </TabsContent>
      </Tabs>
    </Page>
  );
}

function LayerToggles({
  layers,
  setLayers,
  className,
}: {
  layers: Layers;
  setLayers: (l: Layers) => void;
  className?: string;
}) {
  const items: [keyof Layers, string][] = [
    ["airspace", "Airspace"],
    ["navaids", "VORs"],
    ["special", "Special use"],
    ["points", "Obstacles, checkpoints, waypoints"],
    ["labels", "Labels"],
  ];
  return (
    <div className={cn("flex flex-wrap items-center gap-1.5 text-xs", className)}>
      <span className="label-caps mr-1 flex items-center gap-1">
        <LayersIcon className="size-3.5" /> Layers
      </span>
      {items.map(([k, l]) => (
        <button
          key={k}
          type="button"
          aria-pressed={layers[k]}
          onClick={() => setLayers({ ...layers, [k]: !layers[k] })}
          className={cn(
            "rounded border px-2 py-0.5",
            layers[k] ? "border-primary/50 bg-primary/15 text-primary" : "text-muted-foreground",
          )}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

function Workspace({ layers, setLayers }: { layers: Layers; setLayers: (l: Layers) => void }) {
  const [mode, setMode] = useState<"route" | "measure" | "pan">("route");
  const [route, setRoute] = useState<ChartPoint[]>([]);
  const [measure, setMeasure] = useState<{ a?: ChartPoint; b?: ChartPoint }>({});
  const [tas, setTas] = useState("110");
  const [wd, setWd] = useState("300");
  const [ws, setWs] = useState("15");
  const [burn, setBurn] = useState("8.5");

  const legs = useMemo(() => {
    const T = Number(tas) || 0;
    return route.slice(0, -1).map((a, i) => {
      const b = route[i + 1] as ChartPoint;
      const dist = distanceNm(a.lat, a.lon, b.lat, b.lon);
      const tc = bearingDeg(a.lat, a.lon, b.lat, b.lon);
      const mv = (a.magVar + b.magVar) / 2;
      const w = windTriangle(tc, T, Number(wd) || 0, Number(ws) || 0);
      const ok = Number.isFinite(w.groundspeed) && w.groundspeed > 0;
      const ete = ok ? (dist / w.groundspeed) * 60 : NaN;
      return {
        a,
        b,
        dist,
        tc,
        mc: norm360(tc - mv),
        wca: w.wca,
        th: w.heading,
        mh: norm360(w.heading - mv),
        gs: w.groundspeed,
        ete,
        fuel: ok ? (ete / 60) * (Number(burn) || 0) : NaN,
      };
    });
  }, [route, tas, wd, ws, burn]);

  const totals = legs.reduce(
    (t, l) => ({
      dist: t.dist + l.dist,
      ete: t.ete + (Number.isFinite(l.ete) ? l.ete : 0),
      fuel: t.fuel + (Number.isFinite(l.fuel) ? l.fuel : 0),
    }),
    { dist: 0, ete: 0, fuel: 0 },
  );
  const mDist =
    measure.a && measure.b
      ? distanceNm(measure.a.lat, measure.a.lon, measure.b.lat, measure.b.lon)
      : null;
  const mBrg =
    measure.a && measure.b
      ? bearingDeg(measure.a.lat, measure.a.lon, measure.b.lat, measure.b.lon)
      : null;
  const firstAp = route[0] ? getAirport(route[0].label) : undefined;

  const onClick = (p: ChartPoint) => {
    if (mode === "route") setRoute((r) => [...r, p]);
    else if (mode === "measure") setMeasure((m) => (!m.a || m.b ? { a: p } : { a: m.a, b: p }));
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
      <div className="min-w-0 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-md border p-0.5" role="group" aria-label="Chart tool">
            {(
              [
                ["route", "Plot route", RouteIcon],
                ["measure", "Measure", Ruler],
                ["pan", "Pan only", MousePointer2],
              ] as const
            ).map(([m, l, Icon]) => (
              <button
                key={m}
                type="button"
                aria-pressed={mode === m}
                onClick={() => setMode(m)}
                className={cn(
                  "flex items-center gap-1 rounded px-2.5 py-1 text-xs font-semibold",
                  mode === m
                    ? "bg-primary/15 text-primary"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="size-3.5" /> {l}
              </button>
            ))}
          </div>
          <LayerToggles layers={layers} setLayers={setLayers} />
        </div>
        <BayChart
          layers={layers}
          route={route}
          measure={measure}
          onClickPoint={mode === "pan" ? undefined : onClick}
          cursor={mode === "pan" ? "grab" : "crosshair"}
          className="h-[460px] sm:h-[600px]"
        />
        <p className="text-[11px] text-muted-foreground">
          {mode === "route"
            ? "Click to add route points — clicks near an airport, VOR, checkpoint or waypoint snap to it."
            : mode === "measure"
              ? "Click two points to measure distance and course; a third click starts a new measurement."
              : "Drag to pan."}{" "}
          Scroll or use the buttons to zoom; drag to pan in any mode.
        </p>
      </div>

      <div className="space-y-4">
        {mode === "measure" || measure.a ? (
          <Panel title="Measure">
            {mDist !== null && mBrg !== null && measure.a && measure.b ? (
              <div className="grid grid-cols-3 gap-2 text-sm">
                <div>
                  <div className="label-caps">Distance</div>
                  <div className="font-mono text-lg text-cyan">{mDist.toFixed(1)} nm</div>
                </div>
                <div>
                  <div className="label-caps">True course</div>
                  <div className="font-mono text-lg text-cyan">{fmtHdg(mBrg)}°</div>
                </div>
                <div>
                  <div className="label-caps">Magnetic</div>
                  <div className="font-mono text-lg text-cyan">
                    {fmtHdg(mBrg - measure.a.magVar)}°
                  </div>
                </div>
                <p className="col-span-3 text-[11px] text-muted-foreground">
                  {measure.a.label} → {measure.b.label}. Variation {measure.a.magVar}°E: magnetic =
                  true − east variation.
                </p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                {measure.a
                  ? `From ${measure.a.label} — click the second point.`
                  : "Select Measure and click two points on the chart."}
              </p>
            )}
          </Panel>
        ) : null}

        <Panel
          title="Route & wind"
          actions={
            <div className="flex gap-1">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setRoute((r) => r.slice(0, -1))}
                disabled={!route.length}
                title="Undo last point"
              >
                <Undo2 className="size-4" />
                <span className="sr-only">Undo</span>
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setRoute([])}
                disabled={!route.length}
                title="Clear route"
              >
                <Eraser className="size-4" />
                <span className="sr-only">Clear</span>
              </Button>
            </div>
          }
        >
          <div className="grid grid-cols-4 gap-2">
            {(
              [
                ["TAS kt", tas, setTas],
                ["Wind °T", wd, setWd],
                ["Wind kt", ws, setWs],
                ["Burn gph", burn, setBurn],
              ] as const
            ).map(([l, v, set]) => (
              <label key={l} className="text-xs">
                <span className="label-caps mb-1 block">{l}</span>
                <Input
                  inputMode="decimal"
                  value={v}
                  onChange={(e) => set(e.target.value.replace(/[^0-9.]/g, ""))}
                  className="h-8 font-mono"
                />
              </label>
            ))}
          </div>
          {route.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">
              Click on the chart to start a route — e.g. KPAO → Dumbarton Bridge → KHWD.
            </p>
          ) : (
            <ol className="mt-3 flex flex-wrap gap-1 text-xs">
              {route.map((p, i) => (
                <li
                  key={i}
                  className="inline-flex items-center gap-1 rounded border bg-muted px-1.5 py-0.5"
                >
                  <span className="grid size-4 place-items-center rounded-full bg-magenta text-[9px] font-bold text-white">
                    {i + 1}
                  </span>
                  <span className="font-mono">{p.label}</span>
                  <button
                    type="button"
                    onClick={() => setRoute((r) => r.filter((_, j) => j !== i))}
                    className="text-muted-foreground hover:text-warning"
                    aria-label={`Remove point ${i + 1}`}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ol>
          )}
        </Panel>

        {legs.length ? (
          <div className="panel overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-xs">
                <thead>
                  <tr className="border-b bg-muted/40 text-left">
                    {["Leg", "Dist", "TC", "MC", "WCA", "MH", "GS", "ETE", "Fuel"].map((h) => (
                      <th key={h} className="label-caps px-2 py-1.5 first:pl-3">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="font-mono">
                  {legs.map((l, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="px-2 py-1.5 pl-3 font-sans">
                        {i + 1}→{i + 2}
                      </td>
                      <td className="px-2 py-1.5">{l.dist.toFixed(1)}</td>
                      <td className="px-2 py-1.5">{fmtHdg(l.tc)}</td>
                      <td className="px-2 py-1.5 text-magenta">{fmtHdg(l.mc)}</td>
                      <td className="px-2 py-1.5">
                        {Number.isFinite(l.wca)
                          ? `${l.wca >= 0 ? "+" : ""}${l.wca.toFixed(0)}`
                          : "—"}
                      </td>
                      <td className="px-2 py-1.5 font-semibold text-cyan">{fmtHdg(l.mh)}</td>
                      <td className="px-2 py-1.5">
                        {Number.isFinite(l.gs) ? l.gs.toFixed(0) : "—"}
                      </td>
                      <td className="px-2 py-1.5">{fmtMin(l.ete)}</td>
                      <td className="px-2 py-1.5">
                        {Number.isFinite(l.fuel) ? l.fuel.toFixed(1) : "—"}
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t bg-muted/40 font-semibold">
                    <td className="px-2 py-1.5 pl-3 font-sans">Total</td>
                    <td className="px-2 py-1.5">{totals.dist.toFixed(1)}</td>
                    <td colSpan={5} />
                    <td className="px-2 py-1.5">{fmtMin(totals.ete)}</td>
                    <td className="px-2 py-1.5">{totals.fuel.toFixed(1)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="border-t px-3 py-2 text-[11px] text-muted-foreground">
              Fuel excludes taxi, climb and the legal reserve (VFR day: +30 min ={" "}
              {((Number(burn) || 0) * 0.5).toFixed(1)} gal).{" "}
              {firstAp ? (
                <Link
                  to="/planner"
                  search={{ from: firstAp.icao }}
                  className="text-primary hover:underline"
                >
                  Build a full plan from {firstAp.icao} in the Flight Planner →
                </Link>
              ) : null}
            </div>
          </div>
        ) : null}

        <E6B />
      </div>
    </div>
  );
}
