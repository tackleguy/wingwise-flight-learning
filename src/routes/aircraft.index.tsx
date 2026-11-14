import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ArrowLeftRight, Plane, Search, X } from "lucide-react";

import { EmptyState, Notice, Page, PageHeader, Panel, Pill, Section } from "@/components/app/page";
import { AircraftSilhouette } from "@/components/aircraft/aircraft-graphics";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AIRCRAFT,
  CATEGORY_LABELS,
  SIMULATION_ASSUMPTIONS,
  enduranceHr,
  perfFor,
  perfSpecs,
  rangeNm,
  vSpeeds,
  type AircraftInfo,
} from "@/lib/data/aircraft";
import type { AircraftCategory } from "@/lib/data/types";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/aircraft/")({
  head: () => ({
    meta: [
      { title: "Aircraft Library — TeachX" },
      {
        name: "description",
        content:
          "Systems, limitations and performance of every TeachX training aircraft, from the Cessna 152 to the Airbus A320 — with side-by-side comparison.",
      },
    ],
  }),
  component: AircraftLibrary,
});

const CATS = Object.keys(CATEGORY_LABELS) as AircraftCategory[];

function AircraftLibrary() {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<AircraftCategory | "all">("all");
  const [cmpA, setCmpA] = useState<string>("c172");
  const [cmpB, setCmpB] = useState<string>("pa28");
  const preferred = useStore((s) => s.settings.preferredAircraft);

  const list = useMemo(() => {
    const k = q.trim().toLowerCase();
    return AIRCRAFT.filter((a) => (cat === "all" ? true : a.categories.includes(cat))).filter(
      (a) =>
        !k
          ? true
          : [
              a.name,
              a.manufacturer,
              a.variant,
              a.role,
              a.id,
              perfFor(a).shortName,
              ...a.categories.map((c) => CATEGORY_LABELS[c]),
            ]
              .join(" ")
              .toLowerCase()
              .includes(k),
    );
  }, [q, cat]);

  const counts = useMemo(() => {
    const m: Record<string, number> = { all: AIRCRAFT.length };
    for (const c of CATS) m[c] = AIRCRAFT.filter((a) => a.categories.includes(c)).length;
    return m;
  }, []);

  const addToCompare = (id: string) => {
    if (id === cmpA || id === cmpB) return;
    setCmpA(cmpB);
    setCmpB(id);
    if (typeof document !== "undefined")
      document.getElementById("compare")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <Page>
      <PageHeader
        eyebrow="Fly"
        icon={Plane}
        title="Aircraft Library"
        description="Systems, cockpit layout, limitations and performance for every aircraft in the TeachX simulator. Numbers come straight from the simulator's flight model so what you read here is what you fly."
        actions={
          <Button variant="outline" size="sm" asChild>
            <a href="#compare">
              <ArrowLeftRight className="size-4" /> Compare aircraft
            </a>
          </Button>
        }
      />

      <Notice tone="caution" title="Educational data." className="mb-6">
        {SIMULATION_ASSUMPTIONS}
      </Notice>

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative lg:w-80">
          <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search aircraft, maker, role…"
            className="pl-8"
            aria-label="Search aircraft"
          />
          {q ? (
            <button
              type="button"
              onClick={() => setQ("")}
              className="absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="size-4" />
            </button>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by category">
          {(["all", ...CATS] as const).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCat(c)}
              aria-pressed={cat === c}
              className={cn(
                "rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
                cat === c
                  ? "border-primary/50 bg-primary/15 text-primary"
                  : "bg-card text-muted-foreground hover:text-foreground",
              )}
            >
              {c === "all" ? "All" : CATEGORY_LABELS[c]}{" "}
              <span className="ml-1 font-mono opacity-70">{counts[c]}</span>
            </button>
          ))}
        </div>
      </div>

      {list.length === 0 ? (
        <EmptyState
          icon={Search}
          title="No aircraft match"
          description="Try a different search term or category."
        />
      ) : (
        <div className="mb-10 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((a) => (
            <AircraftCard
              key={a.id}
              a={a}
              preferred={preferred === a.id}
              onCompare={() => addToCompare(a.id)}
              inCompare={a.id === cmpA || a.id === cmpB}
            />
          ))}
        </div>
      )}

      <Section
        title="Compare aircraft"
        description="Pick any two aircraft to compare performance, limitations and V-speeds side by side."
        className="scroll-mt-20"
      >
        <div id="compare" className="scroll-mt-20" />
        <Compare a={cmpA} b={cmpB} setA={setCmpA} setB={setCmpB} />
      </Section>
    </Page>
  );
}

function AircraftCard({
  a,
  preferred,
  onCompare,
  inCompare,
}: {
  a: AircraftInfo;
  preferred: boolean;
  onCompare: () => void;
  inCompare: boolean;
}) {
  const p = perfFor(a);
  return (
    <div className="panel flex flex-col overflow-hidden transition-colors hover:border-primary/40">
      <Link to="/aircraft/$id" params={{ id: a.id }} className="group block">
        <div className="avionics-screen m-3 mb-0 grid-backdrop">
          <AircraftSilhouette
            spec={a.silhouette}
            spanFt={p.wingSpanFt}
            view="top"
            className="h-32 w-full"
          />
        </div>
        <div className="px-4 pt-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="font-semibold group-hover:text-primary">{a.name}</h3>
              <p className="text-xs text-muted-foreground">{a.manufacturer}</p>
            </div>
            {preferred ? <Pill tone="primary">Preferred</Pill> : null}
          </div>
          <div className="mt-2 flex flex-wrap gap-1">
            {a.categories.map((c) => (
              <Pill key={c}>{CATEGORY_LABELS[c]}</Pill>
            ))}
          </div>
        </div>
      </Link>
      <dl className="mx-4 mt-3 grid grid-cols-3 gap-2 border-t pt-3 text-xs">
        <div>
          <dt className="label-caps">Cruise</dt>
          <dd className="font-mono tabular">{p.cruiseKtas} kt</dd>
        </div>
        <div>
          <dt className="label-caps">Range*</dt>
          <dd className="font-mono tabular">{Math.round(rangeNm(p)).toLocaleString()} nm</dd>
        </div>
        <div>
          <dt className="label-caps">Seats</dt>
          <dd className="font-mono tabular">{a.seats}</dd>
        </div>
      </dl>
      <div className="mt-auto flex items-center gap-2 p-4 pt-3">
        <Button asChild size="sm" className="flex-1">
          <Link to="/aircraft/$id" params={{ id: a.id }}>
            View details
          </Link>
        </Button>
        <Button size="sm" variant="outline" onClick={onCompare} disabled={inCompare}>
          <ArrowLeftRight className="size-3.5" /> {inCompare ? "Comparing" : "Compare"}
        </Button>
      </div>
    </div>
  );
}

function Compare({
  a,
  b,
  setA,
  setB,
}: {
  a: string;
  b: string;
  setA: (v: string) => void;
  setB: (v: string) => void;
}) {
  const A = AIRCRAFT.find((x) => x.id === a);
  const B = AIRCRAFT.find((x) => x.id === b);
  if (!A || !B) return null;
  const pa = perfFor(A);
  const pb = perfFor(B);
  const sa = perfSpecs(pa);
  const sb = perfSpecs(pb);
  const va = vSpeeds(pa);
  const vb = vSpeeds(pb);
  const vKeys = Array.from(new Set([...va.map((r) => r.key), ...vb.map((r) => r.key)]));
  const vOrder = [
    "Vso",
    "Vs1",
    "Vmc",
    "Vr",
    "Vx",
    "Vy",
    "Vyse",
    "Vg",
    "Vref",
    "Vfe",
    "Va",
    "Vle",
    "Vno",
    "Vne",
  ];
  vKeys.sort((x, y) => vOrder.indexOf(x) - vOrder.indexOf(y));

  const numeric: { label: string; a: number; b: number; unit: string; higherBetter: boolean }[] = [
    { label: "Cruise speed", a: pa.cruiseKtas, b: pb.cruiseKtas, unit: "KTAS", higherBetter: true },
    {
      label: "Range (45-min reserve)",
      a: rangeNm(pa),
      b: rangeNm(pb),
      unit: "nm",
      higherBetter: true,
    },
    { label: "Endurance", a: enduranceHr(pa), b: enduranceHr(pb), unit: "h", higherBetter: true },
    {
      label: "Service ceiling",
      a: pa.serviceCeilingFt,
      b: pb.serviceCeilingFt,
      unit: "ft",
      higherBetter: true,
    },
    {
      label: "Useful load",
      a: pa.maxGrossLb - pa.emptyWeightLb,
      b: pb.maxGrossLb - pb.emptyWeightLb,
      unit: "lb",
      higherBetter: true,
    },
    {
      label: "Cruise fuel burn",
      a: pa.fuelBurnCruiseGph,
      b: pb.fuelBurnCruiseGph,
      unit: "gal/h",
      higherBetter: false,
    },
    {
      label: "Fuel per 100 nm",
      a: (pa.fuelBurnCruiseGph / pa.cruiseKtas) * 100,
      b: (pb.fuelBurnCruiseGph / pb.cruiseKtas) * 100,
      unit: "gal",
      higherBetter: false,
    },
    { label: "Stall speed (Vso)", a: pa.v.so, b: pb.v.so, unit: "KIAS", higherBetter: false },
  ];

  return (
    <div className="panel overflow-hidden">
      <div className="grid grid-cols-1 gap-3 border-b p-4 sm:grid-cols-2">
        {[
          { v: a, set: setA, info: A, p: pa, other: b },
          { v: b, set: setB, info: B, p: pb, other: a },
        ].map((col, i) => (
          <div key={i} className="space-y-2">
            <Select value={col.v} onValueChange={col.set}>
              <SelectTrigger aria-label={`Aircraft ${i === 0 ? "A" : "B"}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AIRCRAFT.map((x) => (
                  <SelectItem key={x.id} value={x.id} disabled={x.id === col.other}>
                    {x.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="avionics-screen grid-backdrop">
              <AircraftSilhouette
                spec={col.info.silhouette}
                spanFt={col.p.wingSpanFt}
                view="side"
                className="h-28 w-full"
              />
            </div>
          </div>
        ))}
      </div>

      <div className="border-b p-4">
        <p className="label-caps mb-3">Key comparison</p>
        <div className="space-y-3">
          {numeric.map((r) => {
            const max = Math.max(r.a, r.b) || 1;
            const winA = r.higherBetter ? r.a > r.b : r.a < r.b;
            const winB = r.higherBetter ? r.b > r.a : r.b < r.a;
            const f = (x: number) =>
              r.unit === "h" ? x.toFixed(1) : Math.round(x).toLocaleString();
            return (
              <div
                key={r.label}
                className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-xs sm:gap-3"
              >
                <div className="flex items-center justify-end gap-2">
                  <span className={cn("font-mono tabular", winA && "text-ok")}>
                    {f(r.a)} {r.unit}
                  </span>
                  <div className="hidden h-1.5 w-28 justify-end overflow-hidden rounded-full bg-muted sm:flex">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${(r.a / max) * 100}%` }}
                    />
                  </div>
                </div>
                <span className="w-28 text-center text-muted-foreground sm:w-40">{r.label}</span>
                <div className="flex items-center gap-2">
                  <div className="hidden h-1.5 w-28 overflow-hidden rounded-full bg-muted sm:block">
                    <div
                      className="h-full rounded-full bg-magenta"
                      style={{ width: `${(r.b / max) * 100}%` }}
                    />
                  </div>
                  <span className={cn("font-mono tabular", winB && "text-ok")}>
                    {f(r.b)} {r.unit}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-left">
              <th className="label-caps px-4 py-2">Specification</th>
              <th className="px-4 py-2 font-semibold text-primary">{A.name}</th>
              <th className="px-4 py-2 font-semibold text-magenta">{B.name}</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b">
              <td className="px-4 py-2 text-muted-foreground">Category</td>
              <td className="px-4 py-2">
                {A.categories.map((c) => CATEGORY_LABELS[c]).join(", ")}
              </td>
              <td className="px-4 py-2">
                {B.categories.map((c) => CATEGORY_LABELS[c]).join(", ")}
              </td>
            </tr>
            <tr className="border-b">
              <td className="px-4 py-2 text-muted-foreground">Seats</td>
              <td className="px-4 py-2 font-mono">{A.seats}</td>
              <td className="px-4 py-2 font-mono">{B.seats}</td>
            </tr>
            {sa.map((row, i) => (
              <tr key={row.label} className="border-b">
                <td className="px-4 py-2 text-muted-foreground">{row.label}</td>
                <td className="px-4 py-2 font-mono text-xs">{row.value}</td>
                <td className="px-4 py-2 font-mono text-xs">{sb[i]?.value ?? "—"}</td>
              </tr>
            ))}
            <tr className="border-b bg-muted/40">
              <td colSpan={3} className="label-caps px-4 py-2">
                V-speeds (KIAS)
              </td>
            </tr>
            {vKeys.map((k) => {
              const ra = va.find((r) => r.key === k);
              const rb = vb.find((r) => r.key === k);
              return (
                <tr key={k} className="border-b last:border-0">
                  <td className="px-4 py-2 text-muted-foreground">{ra?.label ?? rb?.label}</td>
                  <td className="px-4 py-2 font-mono">{ra ? ra.kias : "—"}</td>
                  <td className="px-4 py-2 font-mono">{rb ? rb.kias : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="border-t px-4 py-2 text-[11px] text-muted-foreground">
        * Range is still-air at cruise speed with a 45-minute reserve, no allowance for climb,
        descent or wind. Educational approximation only.
      </p>
    </div>
  );
}
