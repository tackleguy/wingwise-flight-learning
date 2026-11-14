import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Building2, Map as MapIcon, Radio, Search, X } from "lucide-react";

import { EmptyState, Notice, Page, PageHeader, Pill } from "@/components/app/page";
import { Input } from "@/components/ui/input";
import { AIRPORTS, AIRPORT_DATA_NOTICE } from "@/lib/data/airports";
import { isIfrCapable } from "@/lib/data/airport-utils";
import type { Airport, AirspaceClass } from "@/lib/data/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/airports/")({
  head: () => ({
    meta: [
      { title: "Airport Database — TeachX" },
      { name: "description", content: "Search training airports by name, ICAO, IATA, city or region. Runways, frequencies, airspace and procedures (educational dataset, not for navigation)." },
    ],
  }),
  component: AirportsIndex,
});

const CLASSES: AirspaceClass[] = ["B", "C", "D", "E", "G"];

function AirportsIndex() {
  const [q, setQ] = useState("");
  const [cls, setCls] = useState<AirspaceClass | "all">("all");
  const [towered, setTowered] = useState<"all" | "yes" | "no">("all");
  const [ifrOnly, setIfrOnly] = useState(false);
  const [hover, setHover] = useState<string | null>(null);

  const list = useMemo(() => {
    const k = q.trim().toLowerCase();
    return AIRPORTS.filter((a) => {
      if (cls !== "all" && a.airspace !== cls) return false;
      if (towered === "yes" && !a.towered) return false;
      if (towered === "no" && a.towered) return false;
      if (ifrOnly && !isIfrCapable(a)) return false;
      if (!k) return true;
      return [a.icao, a.iata ?? "", a.name, a.city, a.region, a.country].join(" ").toLowerCase().includes(k);
    });
  }, [q, cls, towered, ifrOnly]);

  const active = cls !== "all" || towered !== "all" || ifrOnly || q;

  return (
    <Page wide>
      <PageHeader
        eyebrow="Fly"
        icon={Building2}
        title="Airport Database"
        description="Runways, frequencies, airspace, procedures and diagrams for the airports used in TeachX training. Select an airport for its diagram, wind tool and nearby navaids."
      />
      <Notice tone="caution" title="Educational dataset." className="mb-5">
        {AIRPORT_DATA_NOTICE.source}. {AIRPORT_DATA_NOTICE.currency} <strong>{AIRPORT_DATA_NOTICE.disclaimer}</strong>
      </Notice>

      <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-center">
        <div className="relative xl:w-80">
          <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, ICAO, IATA, city or state…" className="pl-8" aria-label="Search airports" />
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
          <div className="flex items-center gap-1" role="group" aria-label="Airspace class">
            <span className="label-caps mr-1">Airspace</span>
            {(["all", ...CLASSES] as const).map((c) => (
              <button
                key={c}
                type="button"
                aria-pressed={cls === c}
                onClick={() => setCls(c)}
                className={cn("rounded border px-2 py-1 font-mono", cls === c ? "border-primary/50 bg-primary/15 text-primary" : "bg-card text-muted-foreground hover:text-foreground")}
              >
                {c === "all" ? "All" : c}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1" role="group" aria-label="Tower">
            <span className="label-caps mr-1">Tower</span>
            {(["all", "yes", "no"] as const).map((t) => (
              <button
                key={t}
                type="button"
                aria-pressed={towered === t}
                onClick={() => setTowered(t)}
                className={cn("rounded border px-2 py-1", towered === t ? "border-primary/50 bg-primary/15 text-primary" : "bg-card text-muted-foreground hover:text-foreground")}
              >
                {t === "all" ? "Any" : t === "yes" ? "Towered" : "Non-towered"}
              </button>
            ))}
          </div>
          <label className="flex cursor-pointer items-center gap-2">
            <input type="checkbox" checked={ifrOnly} onChange={(e) => setIfrOnly(e.target.checked)} className="accent-[var(--color-primary)]" />
            <span>IFR-capable (instrument approach)</span>
          </label>
          {active ? (
            <button
              type="button"
              className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
              onClick={() => {
                setQ("");
                setCls("all");
                setTowered("all");
                setIfrOnly(false);
              }}
            >
              <X className="size-3.5" /> Clear filters
            </button>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,520px)]">
        <div className="panel overflow-hidden">
          <div className="flex items-center justify-between border-b px-4 py-2.5">
            <span className="label-caps">{list.length} airports</span>
          </div>
          {list.length === 0 ? (
            <div className="p-4">
              <EmptyState icon={Search} title="No airports match" description="Adjust the search or filters." />
            </div>
          ) : (
            <div className="max-h-[640px] overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 bg-card">
                  <tr className="border-b text-left">
                    <th className="label-caps px-4 py-2">Ident</th>
                    <th className="label-caps px-2 py-2">Airport</th>
                    <th className="label-caps hidden px-2 py-2 md:table-cell">Elev</th>
                    <th className="label-caps px-2 py-2">Class</th>
                    <th className="label-caps hidden px-2 py-2 sm:table-cell">Longest rwy</th>
                    <th className="label-caps px-2 py-2">Ops</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((a) => {
                    const longest = a.runways.reduce((m, r) => Math.max(m, r.lengthFt), 0);
                    return (
                      <tr
                        key={a.icao}
                        onMouseEnter={() => setHover(a.icao)}
                        onMouseLeave={() => setHover(null)}
                        className={cn("border-b transition-colors last:border-0 hover:bg-accent/40", hover === a.icao && "bg-accent/40")}
                      >
                        <td className="px-4 py-2 align-top">
                          <Link to="/airports/$icao" params={{ icao: a.icao }} className="font-mono font-semibold text-primary hover:underline">
                            {a.icao}
                          </Link>
                          {a.iata ? <div className="font-mono text-[11px] text-muted-foreground">{a.iata}</div> : null}
                        </td>
                        <td className="px-2 py-2 align-top">
                          <Link to="/airports/$icao" params={{ icao: a.icao }} className="hover:underline">
                            {a.name}
                          </Link>
                          <div className="text-xs text-muted-foreground">
                            {a.city}, {a.region}
                          </div>
                        </td>
                        <td className="hidden px-2 py-2 align-top font-mono text-xs tabular md:table-cell">{a.elevationFt.toLocaleString()} ft</td>
                        <td className="px-2 py-2 align-top">
                          <Pill tone={a.airspace === "B" ? "primary" : a.airspace === "C" ? "magenta" : a.airspace === "D" ? "cyan" : "default"}>{a.airspace}</Pill>
                        </td>
                        <td className="hidden px-2 py-2 align-top font-mono text-xs tabular sm:table-cell">{longest.toLocaleString()} ft</td>
                        <td className="px-2 py-2 align-top">
                          <div className="flex flex-wrap gap-1">
                            {a.towered ? <Pill tone="ok">Twr</Pill> : <Pill>CTAF</Pill>}
                            {isIfrCapable(a) ? <Pill tone="primary">IFR</Pill> : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <AirportMap airports={list} hover={hover} setHover={setHover} />
      </div>
    </Page>
  );
}

function AirportMap({ airports, hover, setHover }: { airports: Airport[]; hover: string | null; setHover: (v: string | null) => void }) {
  const navigate = useNavigate();
  const [view, setView] = useState<"fit" | "us" | "bay">("fit");
  const W = 520;
  const H = 400;

  const bounds = useMemo(() => {
    if (view === "us") return { minLat: 24, maxLat: 50, minLon: -126, maxLon: -66 };
    if (view === "bay") return { minLat: 36.4, maxLat: 38.2, minLon: -122.95, maxLon: -121.1 };
    if (airports.length === 0) return { minLat: 24, maxLat: 50, minLon: -126, maxLon: -66 };
    let minLat = Infinity;
    let maxLat = -Infinity;
    let minLon = Infinity;
    let maxLon = -Infinity;
    for (const a of airports) {
      minLat = Math.min(minLat, a.lat);
      maxLat = Math.max(maxLat, a.lat);
      minLon = Math.min(minLon, a.lon);
      maxLon = Math.max(maxLon, a.lon);
    }
    const padLat = Math.max(0.25, (maxLat - minLat) * 0.12);
    const padLon = Math.max(0.3, (maxLon - minLon) * 0.08);
    return { minLat: minLat - padLat, maxLat: maxLat + padLat, minLon: minLon - padLon, maxLon: maxLon + padLon };
  }, [airports, view]);

  // Equirectangular projection with cos(lat) correction, letterboxed into W×H.
  const proj = useMemo(() => {
    const midLat = (bounds.minLat + bounds.maxLat) / 2;
    const k = Math.cos((midLat * Math.PI) / 180);
    const spanX = (bounds.maxLon - bounds.minLon) * k;
    const spanY = bounds.maxLat - bounds.minLat;
    const s = Math.min((W - 40) / spanX, (H - 40) / spanY);
    const ox = (W - spanX * s) / 2;
    const oy = (H - spanY * s) / 2;
    return {
      x: (lon: number) => ox + (lon - bounds.minLon) * k * s,
      y: (lat: number) => oy + (bounds.maxLat - lat) * s,
      degSpan: Math.max(bounds.maxLon - bounds.minLon, spanY),
    };
  }, [bounds]);

  const step = proj.degSpan > 20 ? 5 : proj.degSpan > 6 ? 2 : proj.degSpan > 2 ? 0.5 : 0.25;
  const lats: number[] = [];
  for (let v = Math.ceil(bounds.minLat / step) * step; v <= bounds.maxLat; v += step) lats.push(+v.toFixed(2));
  const lons: number[] = [];
  for (let v = Math.ceil(bounds.minLon / step) * step; v <= bounds.maxLon; v += step) lons.push(+v.toFixed(2));
  const shown = view === "fit" ? airports : AIRPORTS.filter((a) => a.lat >= bounds.minLat && a.lat <= bounds.maxLat && a.lon >= bounds.minLon && a.lon <= bounds.maxLon);
  const dense = shown.length > 8 && proj.degSpan > 6;

  return (
    <div className="panel overflow-hidden lg:sticky lg:top-4 lg:self-start">
      <div className="flex items-center justify-between gap-2 border-b px-4 py-2">
        <span className="label-caps flex items-center gap-1.5">
          <MapIcon className="size-3.5" /> Airport map
        </span>
        <div className="flex gap-1 text-xs">
          {(
            [
              ["fit", "Fit results"],
              ["bay", "SF Bay"],
              ["us", "USA"],
            ] as const
          ).map(([v, l]) => (
            <button key={v} type="button" onClick={() => setView(v)} aria-pressed={view === v} className={cn("rounded border px-2 py-0.5", view === v ? "border-primary/50 bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground")}>
              {l}
            </button>
          ))}
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="block w-full bg-panel" role="img" aria-label="Map of airports plotted by latitude and longitude">
        <g stroke="oklch(1 0 0 / 0.07)" strokeWidth={1}>
          {lats.map((v) => (
            <line key={`la${v}`} x1={0} x2={W} y1={proj.y(v)} y2={proj.y(v)} />
          ))}
          {lons.map((v) => (
            <line key={`lo${v}`} y1={0} y2={H} x1={proj.x(v)} x2={proj.x(v)} />
          ))}
        </g>
        <g fill="oklch(0.68 0.025 250)" fontSize={9} fontFamily="var(--font-mono)">
          {lats.map((v) => (
            <text key={`tla${v}`} x={4} y={proj.y(v) - 3}>
              {Math.abs(v)}°{v >= 0 ? "N" : "S"}
            </text>
          ))}
          {lons.map((v) => (
            <text key={`tlo${v}`} x={proj.x(v) + 3} y={H - 4}>
              {Math.abs(v)}°{v >= 0 ? "E" : "W"}
            </text>
          ))}
        </g>
        {shown.map((a) => {
          const x = proj.x(a.lon);
          const y = proj.y(a.lat);
          const color = a.towered ? "var(--color-primary)" : "var(--color-magenta)";
          const isH = hover === a.icao;
          return (
            <g
              key={a.icao}
              transform={`translate(${x} ${y})`}
              className="cursor-pointer"
              onMouseEnter={() => setHover(a.icao)}
              onMouseLeave={() => setHover(null)}
              onClick={() => void navigate({ to: "/airports/$icao", params: { icao: a.icao } })}
              role="link"
              aria-label={`${a.icao} ${a.name}`}
            >
              <circle r={isH ? 9 : 6} fill="none" stroke={color} strokeWidth={isH ? 2.5 : 1.8} />
              {a.towered ? null : <circle r={2} fill={color} />}
              {!dense || isH ? (
                <text x={9} y={4} fontSize={isH ? 12 : 10} fill={isH ? "white" : "oklch(0.85 0.02 250)"} fontFamily="var(--font-mono)" fontWeight={600}>
                  {a.icao}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
      <div className="flex flex-wrap items-center gap-4 border-t px-4 py-2 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="inline-block size-2.5 rounded-full border-2 border-primary" /> Towered
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block size-2.5 rounded-full border-2 border-magenta" /> Non-towered
        </span>
        <span className="flex items-center gap-1.5">
          <Radio className="size-3" /> Click a symbol for details
        </span>
        <span className="ml-auto">Schematic plot — not a chart</span>
      </div>
    </div>
  );
}
