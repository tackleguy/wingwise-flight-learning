import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Check, ChevronLeft, ChevronRight, Cog, Fuel, Gauge, Plane, PlaneTakeoff, Star, Zap, CircleDot, Move3d } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { EmptyState, Notice, Page, PageHeader, Panel, Pill, Stat } from "@/components/app/page";
import { HrefLink, buildHref } from "@/components/app/xlink";
import { AircraftSilhouette, AirspeedIndicator, ArcLegend } from "@/components/aircraft/aircraft-graphics";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AIRCRAFT,
  CATEGORY_LABELS,
  SIMULATION_ASSUMPTIONS,
  enduranceHr,
  getAircraft,
  perfFor,
  perfSpecs,
  rangeNm,
  vSpeeds,
  type AircraftInfo,
  type SystemInfo,
} from "@/lib/data/aircraft";
import { actions, useHydrated, useStore } from "@/lib/store";

export const Route = createFileRoute("/aircraft/$id")({
  head: ({ params }) => {
    const a = getAircraft(params.id);
    return {
      meta: [
        { title: `${a ? a.name : "Aircraft"} — TeachX` },
        { name: "description", content: a ? `${a.name}: systems, cockpit, V-speeds, limitations and performance (educational approximations).` : "TeachX aircraft library." },
      ],
    };
  },
  component: AircraftDetail,
});

function AircraftDetail() {
  const { id } = Route.useParams();
  const a = getAircraft(id);
  if (!a) {
    return (
      <Page>
        <EmptyState icon={Plane} title="Aircraft not found" description={`There is no aircraft with id "${id}" in the library.`} action={{ to: "/aircraft", label: "Back to Aircraft Library" }} />
      </Page>
    );
  }
  return <Detail a={a} />;
}

function Detail({ a }: { a: AircraftInfo }) {
  const p = perfFor(a);
  const hydrated = useHydrated();
  const preferred = useStore((s) => s.settings.preferredAircraft) === a.id;
  const idx = AIRCRAFT.findIndex((x) => x.id === a.id);
  const prev = AIRCRAFT[(idx - 1 + AIRCRAFT.length) % AIRCRAFT.length];
  const next = AIRCRAFT[(idx + 1) % AIRCRAFT.length];
  const vs = vSpeeds(p);

  return (
    <Page>
      <Link to="/aircraft" className="mb-3 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" /> Aircraft Library
      </Link>
      <PageHeader
        eyebrow={a.manufacturer}
        title={a.name}
        description={
          <span>
            {a.role} · {a.variant}
          </span>
        }
        actions={
          <>
            <Button
              variant={preferred ? "secondary" : "outline"}
              size="sm"
              disabled={!hydrated || preferred}
              onClick={() => actions.updateSettings((s) => ({ ...s, preferredAircraft: a.id }))}
            >
              {preferred ? <Check className="size-4 text-ok" /> : <Star className="size-4" />}
              {preferred ? "Preferred aircraft" : "Set as preferred"}
            </Button>
            <Button size="sm" asChild>
              <HrefLink href={buildHref("/simulator", { aircraft: a.id })}>
                <PlaneTakeoff className="size-4" /> Fly this aircraft
              </HrefLink>
            </Button>
          </>
        }
      />

      <div className="mb-6 flex flex-wrap gap-1.5">
        {a.categories.map((c) => (
          <Pill key={c} tone="primary">
            {CATEGORY_LABELS[c]}
          </Pill>
        ))}
        <Pill>{a.seats} seats</Pill>
        <Pill>First flight {a.firstFlight}</Pill>
        <Pill tone="caution">Educational approximations</Pill>
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <div className="avionics-screen grid-backdrop p-2">
          <AircraftSilhouette spec={a.silhouette} spanFt={p.wingSpanFt} view="top" className="h-56 w-full" />
        </div>
        <div className="avionics-screen grid-backdrop p-2">
          <AircraftSilhouette spec={a.silhouette} spanFt={p.wingSpanFt} view="side" className="h-56 w-full" />
        </div>
      </div>
      <p className="-mt-4 mb-6 text-[11px] text-muted-foreground">Schematic line drawings generated to scale from approximate dimensions — not manufacturer drawings.</p>

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Cruise" value={`${p.cruiseKtas}`} sub={`KTAS at ${p.cruiseAltFt.toLocaleString()} ft`} />
        <Stat label="Range" value={Math.round(rangeNm(p)).toLocaleString()} sub="nm, 45-min reserve, still air" />
        <Stat label="Endurance" value={enduranceHr(p).toFixed(1)} sub={`h on ${p.usableFuelGal.toLocaleString()} gal ${p.fuelType}`} />
        <Stat label="Ceiling" value={p.serviceCeilingFt.toLocaleString()} sub="ft service ceiling" />
      </div>

      <Tabs defaultValue="overview">
        <div className="overflow-x-auto">
          <TabsList className="mb-4">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="cockpit">Cockpit</TabsTrigger>
            <TabsTrigger value="systems">Systems</TabsTrigger>
            <TabsTrigger value="limits">Limitations</TabsTrigger>
            <TabsTrigger value="performance">Performance</TabsTrigger>
            <TabsTrigger value="training">Training</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="overview" className="animate-fade-up">
          <div className="grid gap-4 lg:grid-cols-3">
            <Panel title="About this aircraft" className="lg:col-span-2">
              <div className="space-y-3 text-sm leading-relaxed text-foreground/90">
                {a.overview.map((t, i) => (
                  <p key={i}>{t}</p>
                ))}
              </div>
            </Panel>
            <Panel title="At a glance">
              <dl className="space-y-2 text-sm">
                {[
                  ["Manufacturer", a.manufacturer],
                  ["Simulated variant", a.variant],
                  ["Role", a.role],
                  ["Engines", `${p.engines} × ${p.powerType === "jet" ? `${p.thrustLbfPerEngine.toLocaleString()} lbf` : `${p.hpPerEngine} ${p.powerType === "turboprop" ? "shp" : "hp"}`}`],
                  ["Landing gear", p.retractableGear ? "Retractable" : "Fixed"],
                  ["Fuel", `${p.fuelType}`],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-3 border-b pb-1.5 last:border-0">
                    <dt className="text-muted-foreground">{k}</dt>
                    <dd className="text-right">{v}</dd>
                  </div>
                ))}
              </dl>
            </Panel>
          </div>
        </TabsContent>

        <TabsContent value="cockpit" className="animate-fade-up">
          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="Cockpit layout">
              <p className="text-sm leading-relaxed text-foreground/90">{a.cockpit.layout}</p>
            </Panel>
            <Panel title="Key instruments">
              <ul className="space-y-1.5 text-sm">
                {a.cockpit.instruments.map((t) => (
                  <li key={t} className="flex gap-2">
                    <Gauge className="mt-0.5 size-3.5 shrink-0 text-cyan" />
                    <span>{t}</span>
                  </li>
                ))}
              </ul>
            </Panel>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link to="/avionics">Practice in the Avionics Lab</Link>
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="systems" className="animate-fade-up">
          <div className="grid gap-4 md:grid-cols-2">
            <SystemPanel icon={Cog} title="Engine & propeller" s={a.engine} />
            <SystemPanel icon={Fuel} title="Fuel system" s={a.fuel} />
            <SystemPanel icon={Zap} title="Electrical system" s={a.electrical} />
            <SystemPanel icon={CircleDot} title="Landing gear" s={a.gear} />
            <SystemPanel icon={Move3d} title="Flight controls" s={a.controls} className="md:col-span-2" />
          </div>
        </TabsContent>

        <TabsContent value="limits" className="animate-fade-up">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,320px)_1fr]">
            <Panel title="Airspeed indicator markings">
              <AirspeedIndicator perf={p} />
              <div className="mt-4 border-t pt-3">
                <ArcLegend perf={p} />
              </div>
              {p.powerType !== "piston" ? (
                <p className="mt-3 text-[11px] text-muted-foreground">
                  Turbine aircraft display airspeed on a tape with a barber-pole Vmo/Mmo instead of colored arcs. This dial is a teaching aid built from the model's reference speeds.
                </p>
              ) : null}
            </Panel>
            <div className="space-y-4">
              <Panel title="V-speeds (KIAS, simulator model)">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left">
                        <th className="label-caps py-1.5 pr-3">Speed</th>
                        <th className="label-caps py-1.5 pr-3 text-right">KIAS</th>
                        <th className="label-caps py-1.5">Meaning</th>
                      </tr>
                    </thead>
                    <tbody>
                      {vs.map((r) => (
                        <tr key={r.key} className="border-b last:border-0">
                          <td className="py-1.5 pr-3 font-mono font-semibold text-cyan">{r.label}</td>
                          <td className="py-1.5 pr-3 text-right font-mono tabular">{r.kias}</td>
                          <td className="py-1.5 text-muted-foreground">{r.meaning}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Panel>
              <Panel title="Other operating limitations">
                <ul className="list-disc space-y-1.5 pl-5 text-sm">
                  {a.limitations.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                  <li>Maneuvering speed (Va) shown is at maximum gross weight; Va decreases as weight decreases.</li>
                </ul>
              </Panel>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="performance" className="animate-fade-up">
          <Panel title="Performance specification (from the simulator flight model)">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <tbody>
                  {perfSpecs(p).map((r) => (
                    <tr key={r.label} className="border-b last:border-0">
                      <td className="py-2 pr-4 text-muted-foreground">{r.label}</td>
                      <td className="py-2 pr-4 font-mono tabular">{r.value}</td>
                      <td className="hidden py-2 text-xs text-muted-foreground sm:table-cell">{r.note ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </TabsContent>

        <TabsContent value="training" className="animate-fade-up">
          <div className="grid gap-3 md:grid-cols-2">
            {a.training.map((t) => (
              <div key={t.scenario} className="panel flex flex-col gap-2 p-4">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-semibold">{t.label}</h3>
                  <Pill tone="cyan">{t.scenario}</Pill>
                </div>
                <p className="text-sm text-muted-foreground">{t.why}</p>
                <Button size="sm" variant="outline" className="mt-auto self-start" asChild>
                  <HrefLink href={buildHref("/simulator", { scenario: t.scenario, aircraft: a.id })}>
                    <PlaneTakeoff className="size-4" /> Fly scenario in the {p.shortName}
                  </HrefLink>
                </Button>
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      <Notice tone="caution" title="Simulation assumptions." className="mt-8">
        {SIMULATION_ASSUMPTIONS}
      </Notice>

      <div className="mt-6 flex items-center justify-between gap-2 border-t pt-4 text-sm">
        {prev ? (
          <Link to="/aircraft/$id" params={{ id: prev.id }} className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground">
            <ChevronLeft className="size-4" /> {prev.name}
          </Link>
        ) : (
          <span />
        )}
        {next ? (
          <Link to="/aircraft/$id" params={{ id: next.id }} className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground">
            {next.name} <ChevronRight className="size-4" />
          </Link>
        ) : null}
      </div>
    </Page>
  );
}

function SystemPanel({ icon: Icon, title, s, className }: { icon: LucideIcon; title: string; s: SystemInfo; className?: string }) {
  return (
    <div className={`panel p-4 ${className ?? ""}`}>
      <div className="mb-2 flex items-center gap-2">
        <Icon className="size-4 text-primary" />
        <h3 className="text-sm font-semibold">{title}</h3>
      </div>
      <p className="text-sm text-foreground/90">{s.summary}</p>
      <ul className="mt-3 space-y-1.5 border-t pt-3 text-sm text-muted-foreground">
        {s.details.map((d) => (
          <li key={d} className="flex gap-2">
            <span className="mt-2 size-1 shrink-0 rounded-full bg-cyan" />
            <span>{d}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
