import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  Check,
  ChevronLeft,
  ChevronRight,
  Cog,
  Fuel,
  Gauge,
  Plane,
  PlaneTakeoff,
  Star,
  Zap,
  CircleDot,
  Move3d,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useState, type ReactNode } from "react";

import { EmptyState, Notice, Page, PageHeader, Panel } from "@/components/app/page";
import { HrefLink, buildHref } from "@/components/app/xlink";
import { AircraftViewer3D } from "@/components/sim/AircraftViewer3D";
import {
  AircraftSilhouette,
  AirspeedIndicator,
  ArcLegend,
} from "@/components/aircraft/aircraft-graphics";
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
        {
          name: "description",
          content: a
            ? `${a.name}: systems, cockpit, V-speeds, limitations and performance (educational approximations).`
            : "TeachX aircraft library.",
        },
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
        <EmptyState
          icon={Plane}
          title="Aircraft not found"
          description={`There is no aircraft with id "${id}" in the library.`}
          action={{ to: "/aircraft", label: "Back to Aircraft Library" }}
        />
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
  const [figure, setFigure] = useState<"3d" | "drawings">("3d");

  return (
    <Page>
      <Link
        to="/aircraft"
        className="mb-3 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
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

      <Notice tone="caution" title="Educational approximations." className="mb-3">
        {SIMULATION_ASSUMPTIONS}
      </Notice>

      <p className="mb-5 text-sm text-muted-foreground">
        {a.categories.map((c) => CATEGORY_LABELS[c]).join(", ")} · {a.seats} seats · First flight{" "}
        {a.firstFlight}
      </p>

      <figure className="mb-6">
        {figure === "3d" ? (
          <AircraftViewer3D perfId={a.id} className="h-64 sm:h-80 lg:h-[380px]" />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="avionics-screen grid-backdrop hidden p-2 sm:block">
              <AircraftSilhouette
                spec={a.silhouette}
                spanFt={p.wingSpanFt}
                view="top"
                className="h-40 w-full"
              />
            </div>
            <div className="avionics-screen grid-backdrop p-2">
              <AircraftSilhouette
                spec={a.silhouette}
                spanFt={p.wingSpanFt}
                view="side"
                className="h-40 w-full"
              />
            </div>
          </div>
        )}
        <figcaption className="mt-1.5 flex items-center justify-between gap-3 text-[11px] text-muted-foreground">
          <span>
            {figure === "3d"
              ? "Representative 3D model — not a manufacturer drawing."
              : "Schematic drawings to scale — not manufacturer drawings."}
          </span>
          <button
            type="button"
            onClick={() => setFigure(figure === "3d" ? "drawings" : "3d")}
            className="shrink-0 underline-offset-2 hover:text-foreground hover:underline"
          >
            {figure === "3d" ? "2D drawings" : "3D model"}
          </button>
        </figcaption>
      </figure>

      <dl className="mb-6 grid grid-cols-2 gap-y-3 rounded-lg border px-4 py-3 sm:grid-cols-4">
        <Fact
          label="Cruise"
          value={`${p.cruiseKtas} kt`}
          sub={`KTAS at ${p.cruiseAltFt.toLocaleString()} ft`}
        />
        <Fact
          label="Range"
          value={`${Math.round(rangeNm(p)).toLocaleString()} nm`}
          sub="45-min reserve, still air"
        />
        <Fact
          label="Endurance"
          value={`${enduranceHr(p).toFixed(1)} h`}
          sub={`on ${p.usableFuelGal.toLocaleString()} gal ${p.fuelType}`}
        />
        <Fact
          label="Ceiling"
          value={`${p.serviceCeilingFt.toLocaleString()} ft`}
          sub="service ceiling"
        />
      </dl>

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
          <div className="grid gap-8 lg:grid-cols-3">
            <div className="max-w-3xl space-y-3 text-sm leading-relaxed text-foreground/90 lg:col-span-2">
              {a.overview.map((t, i) => (
                <p key={i}>{t}</p>
              ))}
            </div>
            <div>
              <dl className="space-y-2 text-sm">
                {[
                  ["Manufacturer", a.manufacturer],
                  ["Simulated variant", a.variant],
                  ["Role", a.role],
                  [
                    "Engines",
                    `${p.engines} × ${p.powerType === "jet" ? `${p.thrustLbfPerEngine.toLocaleString()} lbf` : `${p.hpPerEngine} ${p.powerType === "turboprop" ? "shp" : "hp"}`}`,
                  ],
                  ["Landing gear", p.retractableGear ? "Retractable" : "Fixed"],
                  ["Fuel", `${p.fuelType}`],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-3 border-b pb-1.5 last:border-0">
                    <dt className="text-muted-foreground">{k}</dt>
                    <dd className="text-right">{v}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="cockpit" className="animate-fade-up">
          <div className="grid gap-8 lg:grid-cols-2">
            <p className="text-sm leading-relaxed text-foreground/90">{a.cockpit.layout}</p>
            <div>
              <h3 className="label-caps mb-2">Key instruments</h3>
              <ul className="space-y-1.5 text-sm">
                {a.cockpit.instruments.map((t) => (
                  <li key={t} className="flex gap-2">
                    <Gauge className="mt-0.5 size-3.5 shrink-0 text-cyan" />
                    <span>{t}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <div className="mt-6 flex flex-wrap gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link to="/avionics">Practice in the Avionics Lab</Link>
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="systems" className="animate-fade-up">
          <div className="grid gap-x-8 gap-y-6 md:grid-cols-2">
            <SystemPanel icon={Cog} title="Engine & propeller" s={a.engine} />
            <SystemPanel icon={Fuel} title="Fuel system" s={a.fuel} />
            <SystemPanel icon={Zap} title="Electrical system" s={a.electrical} />
            <SystemPanel icon={CircleDot} title="Landing gear" s={a.gear} />
            <SystemPanel icon={Move3d} title="Flight controls" s={a.controls} />
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
                  Turbine aircraft display airspeed on a tape with a barber-pole Vmo/Mmo instead of
                  colored arcs. This dial is a teaching aid built from the model's reference speeds.
                </p>
              ) : null}
            </Panel>
            <div className="space-y-6">
              <section>
                <h3 className="label-caps mb-2">V-speeds (KIAS, simulator model)</h3>
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
                          <td className="py-1.5 pr-3 font-mono font-semibold text-cyan">
                            {r.label}
                          </td>
                          <td className="py-1.5 pr-3 text-right font-mono tabular">{r.kias}</td>
                          <td className="py-1.5 text-muted-foreground">{r.meaning}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
              <section>
                <h3 className="label-caps mb-2">Other operating limitations</h3>
                <ul className="list-disc space-y-1.5 pl-5 text-sm">
                  {a.limitations.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                  <li>
                    Maneuvering speed (Va) shown is at maximum gross weight; Va decreases as weight
                    decreases.
                  </li>
                </ul>
              </section>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="performance" className="animate-fade-up">
          <div>
            <h3 className="label-caps mb-2">From the simulator flight model</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <tbody>
                  {perfSpecs(p).map((r) => (
                    <tr key={r.label} className="border-b last:border-0">
                      <td className="py-2 pr-4 text-muted-foreground">{r.label}</td>
                      <td className="py-2 pr-4 font-mono tabular">{r.value}</td>
                      <td className="hidden py-2 text-xs text-muted-foreground sm:table-cell">
                        {r.note ?? ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="training" className="animate-fade-up">
          <ul className="divide-y rounded-lg border">
            {a.training.map((t) => (
              <li
                key={t.scenario}
                className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <h3 className="font-semibold">{t.label}</h3>
                  <p className="text-sm text-muted-foreground">{t.why}</p>
                </div>
                <Button size="sm" variant="outline" className="shrink-0 self-start" asChild>
                  <HrefLink
                    href={buildHref("/simulator", { scenario: t.scenario, aircraft: a.id })}
                  >
                    <PlaneTakeoff className="size-4" /> Fly scenario
                  </HrefLink>
                </Button>
              </li>
            ))}
          </ul>
        </TabsContent>
      </Tabs>

      <div className="mt-10 flex items-center justify-between gap-2 border-t pt-4 text-sm">
        {prev ? (
          <Link
            to="/aircraft/$id"
            params={{ id: prev.id }}
            className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="size-4" /> {prev.name}
          </Link>
        ) : (
          <span />
        )}
        {next ? (
          <Link
            to="/aircraft/$id"
            params={{ id: next.id }}
            className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
          >
            {next.name} <ChevronRight className="size-4" />
          </Link>
        ) : null}
      </div>
    </Page>
  );
}

function SystemPanel({
  icon: Icon,
  title,
  s,
  className,
}: {
  icon: LucideIcon;
  title: string;
  s: SystemInfo;
  className?: string;
}) {
  return (
    <div className={className}>
      <div className="mb-2 flex items-center gap-2">
        <Icon className="size-4 text-primary" />
        <h3 className="text-sm font-semibold">{title}</h3>
      </div>
      <p className="text-sm text-foreground/90">{s.summary}</p>
      <ul className="mt-2 space-y-1.5 text-sm text-muted-foreground">
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

function Fact({ label, value, sub }: { label: string; value: ReactNode; sub?: string }) {
  return (
    <div className="min-w-0">
      <dt className="label-caps">{label}</dt>
      <dd className="mt-0.5 font-mono text-lg font-semibold tabular">{value}</dd>
      {sub ? <dd className="text-[11px] text-muted-foreground">{sub}</dd> : null}
    </div>
  );
}
