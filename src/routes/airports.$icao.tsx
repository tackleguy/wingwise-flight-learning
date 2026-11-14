import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ArrowLeft, Building2, Compass, FileText, PlaneTakeoff, Radio, Route as RouteIcon, Wind } from "lucide-react";

import { EmptyState, Notice, Page, PageHeader, Panel, Pill, Stat } from "@/components/app/page";
import { HrefLink, buildHref } from "@/components/app/xlink";
import { AirportDiagram } from "@/components/airports/airport-diagram";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AIRPORT_DATA_NOTICE, allRunwayEnds, bestRunwayForWind, getAirport, magneticHeading } from "@/lib/data/airports";
import { fmtHdg, isIfrCapable, nearbyNavaids, nearestAirports } from "@/lib/data/airport-utils";
import type { Airport } from "@/lib/data/types";
import { formatFreq, formatLatLon, norm360, windComponents } from "@/lib/geo";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/airports/$icao")({
  head: ({ params }) => {
    const a = getAirport(params.icao);
    return {
      meta: [
        { title: `${a ? `${a.icao} · ${a.name}` : "Airport"} — TeachX` },
        { name: "description", content: a ? `${a.name} (${a.icao}): runways, frequencies, airspace, diagram, wind tool and procedures. Educational data, not for navigation.` : "TeachX airport database." },
      ],
    };
  },
  component: AirportPage,
});

function AirportPage() {
  const { icao } = Route.useParams();
  const a = getAirport(icao);
  if (!a) {
    return (
      <Page>
        <EmptyState icon={Building2} title="Airport not found" description={`"${icao}" is not in the TeachX educational airport dataset.`} action={{ to: "/airports", label: "Browse airports" }} />
      </Page>
    );
  }
  return <AirportDetail a={a} />;
}

const FREQ_LABEL: Record<string, string> = {
  ATIS: "Automatic Terminal Information Service",
  AWOS: "Automated Weather Observing System",
  CLNC: "Clearance Delivery",
  GND: "Ground Control",
  TWR: "Tower",
  CTAF: "Common Traffic Advisory Frequency",
  UNICOM: "UNICOM",
  APP: "Approach Control",
  DEP: "Departure Control",
  CTR: "Center (ARTCC)",
  FSS: "Flight Service",
};

const AIRSPACE_TEXT: Record<string, string> = {
  B: "Class B — ATC clearance required to enter; Mode C transponder within 30 nm (the 'Mode C veil'). Student pilots need specific endorsements (14 CFR 61.95).",
  C: "Class C — two-way radio communication must be established before entering; Mode C transponder required.",
  D: "Class D — two-way radio communication must be established with the tower before entering (typically up to 2,500 ft AGL).",
  E: "Class E — controlled airspace; no ATC communication requirement for VFR. Weather minimums are higher than Class G.",
  G: "Class G — uncontrolled airspace; lowest VFR weather minimums. Self-announce on CTAF at non-towered fields.",
};

function AirportDetail({ a }: { a: Airport }) {
  const [windDir, setWindDir] = useState("");
  const [windKt, setWindKt] = useState("");
  const [gustKt, setGustKt] = useState("");
  const [ref, setRef] = useState<"true" | "mag">("mag");

  const dirN = Number(windDir);
  const ktN = Number(windKt);
  const gN = Number(gustKt);
  const windValid = windDir !== "" && windKt !== "" && Number.isFinite(dirN) && dirN >= 0 && dirN <= 360 && Number.isFinite(ktN) && ktN >= 0 && ktN < 150;
  const windTrue = windValid ? norm360(ref === "mag" ? dirN + a.magVar : dirN) : undefined;
  const best = windValid && windTrue !== undefined && ktN > 0 ? bestRunwayForWind(a, windTrue) : undefined;

  const ends = useMemo(() => allRunwayEnds(a), [a]);
  const comps = useMemo(() => {
    if (!windValid || windTrue === undefined) return [];
    return ends.map(({ runway, end }) => {
      const c = windComponents(end.trueHeading, windTrue, ktN);
      const g = gustKt !== "" && Number.isFinite(gN) && gN > ktN ? windComponents(end.trueHeading, windTrue, gN) : undefined;
      return { runway, end, c, g };
    });
  }, [ends, windValid, windTrue, ktN, gN, gustKt]);

  const navs = useMemo(() => {
    const listed = new Set(a.nearbyNavaids);
    return nearbyNavaids(a.lat, a.lon, 9999)
      .filter((n) => n.distNm <= 60 || listed.has(n.item.id))
      .map((n) => ({ ...n, listed: listed.has(n.item.id) }));
  }, [a]);

  const neighbours = useMemo(() => nearestAirports(a.lat, a.lon, { limit: 5, exclude: [a.icao], maxNm: 120 }), [a]);

  return (
    <Page>
      <Link to="/airports" className="mb-3 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" /> Airport Database
      </Link>
      <PageHeader
        eyebrow={`${a.city}, ${a.region}, ${a.country}`}
        title={`${a.icao} — ${a.name}`}
        description={
          <span className="font-mono text-xs">
            {a.iata ? `IATA ${a.iata} · ` : ""}
            {formatLatLon(a.lat, a.lon)} · Var {Math.abs(a.magVar)}°{a.magVar >= 0 ? "E" : "W"}
          </span>
        }
        actions={
          <>
            <Button variant="outline" size="sm" asChild>
              <Link to="/planner" search={{ from: a.icao }}>
                <RouteIcon className="size-4" /> Plan a flight from here
              </Link>
            </Button>
            <Button size="sm" asChild>
              <HrefLink href={buildHref("/simulator", { airport: a.icao })}>
                <PlaneTakeoff className="size-4" /> Depart from here in the simulator
              </HrefLink>
            </Button>
          </>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Elevation" value={`${a.elevationFt.toLocaleString()}`} sub="ft MSL" />
        <Stat label="Airspace" value={`Class ${a.airspace}`} sub={a.towered ? "Towered" : "Non-towered (CTAF)"} tone="primary" />
        <Stat label="Runways" value={a.runways.length} sub={`Longest ${Math.max(...a.runways.map((r) => r.lengthFt)).toLocaleString()} ft`} />
        <Stat label="Instrument" value={isIfrCapable(a) ? "IFR" : "VFR only"} sub={a.runways.some((r) => r.ends.some((e) => e.ils)) ? "ILS available" : isIfrCapable(a) ? "Non-precision / RNAV" : "No instrument approach listed"} tone={isIfrCapable(a) ? "ok" : "default"} />
      </div>

      <Notice tone="info" className="mb-6">
        {AIRSPACE_TEXT[a.airspace]}
      </Notice>

      <div className="mb-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
        <Panel title="Airport diagram (north up, to scale)">
          <div className="avionics-screen overflow-hidden">
            <AirportDiagram airport={a} highlightEnd={best?.end.id} windFromTrue={windTrue} windKt={windValid ? ktN : undefined} className="aspect-square w-full" />
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Runways are drawn from the dataset's threshold coordinates. Numbers are oriented for the landing direction. Dashed cyan cones mark runways with an ILS. Geometry is simplified — compare with the official FAA airport diagram.
          </p>
        </Panel>

        <Panel
          title={
            <span className="flex items-center gap-1.5">
              <Wind className="size-3.5" /> Runway wind tool
            </span>
          }
        >
          <div className="grid grid-cols-3 gap-2">
            <label className="text-xs">
              <span className="label-caps">Direction °</span>
              <Input inputMode="numeric" value={windDir} onChange={(e) => setWindDir(e.target.value.replace(/[^0-9]/g, "").slice(0, 3))} placeholder="280" className="mt-1 font-mono" />
            </label>
            <label className="text-xs">
              <span className="label-caps">Speed kt</span>
              <Input inputMode="numeric" value={windKt} onChange={(e) => setWindKt(e.target.value.replace(/[^0-9]/g, "").slice(0, 3))} placeholder="12" className="mt-1 font-mono" />
            </label>
            <label className="text-xs">
              <span className="label-caps">Gust kt</span>
              <Input inputMode="numeric" value={gustKt} onChange={(e) => setGustKt(e.target.value.replace(/[^0-9]/g, "").slice(0, 3))} placeholder="opt." className="mt-1 font-mono" />
            </label>
          </div>
          <div className="mt-2 flex gap-1 text-xs" role="group" aria-label="Wind direction reference">
            {(
              [
                ["mag", "Magnetic (ATIS / tower)"],
                ["true", "True (METAR / TAF)"],
              ] as const
            ).map(([v, l]) => (
              <button key={v} type="button" onClick={() => setRef(v)} aria-pressed={ref === v} className={cn("flex-1 rounded border px-2 py-1", ref === v ? "border-primary/50 bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground")}>
                {l}
              </button>
            ))}
          </div>
          {!windValid ? (
            <p className="mt-3 text-xs text-muted-foreground">Enter a wind direction (0–360°) and speed to compute headwind and crosswind components for every runway and the recommended runway.</p>
          ) : (
            <>
              {best ? (
                <div className="mt-3 rounded-md border border-ok/30 bg-ok/5 px-3 py-2 text-sm">
                  Recommended: <span className="font-mono font-semibold text-ok">Runway {best.end.id}</span>
                  <span className="text-muted-foreground"> — most into the wind{a.runways.length > 1 ? " (ties favour the longer runway)" : ""}.</span>
                </div>
              ) : (
                <div className="mt-3 rounded-md border px-3 py-2 text-sm text-muted-foreground">Calm wind — use the runway in use / calm-wind runway.</div>
              )}
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="label-caps py-1.5">Rwy</th>
                      <th className="label-caps py-1.5">Hdg °M</th>
                      <th className="label-caps py-1.5">Head/tail</th>
                      <th className="label-caps py-1.5">Crosswind</th>
                    </tr>
                  </thead>
                  <tbody>
                    {comps.map(({ end, c, g }) => {
                      const xw = Math.abs(c.crosswind);
                      const side = c.crosswind >= 0 ? "R" : "L";
                      return (
                        <tr key={end.id} className={cn("border-b last:border-0", best?.end.id === end.id && "bg-ok/5")}>
                          <td className="py-1.5 font-mono font-semibold">{end.id}</td>
                          <td className="py-1.5 font-mono">{fmtHdg(magneticHeading(a, end.trueHeading))}</td>
                          <td className={cn("py-1.5 font-mono", c.headwind < -0.5 ? "text-warning" : "text-foreground")}>
                            {c.headwind >= -0.5 ? `${Math.round(Math.max(0, c.headwind))} kt head` : `${Math.round(-c.headwind)} kt TAIL`}
                          </td>
                          <td className={cn("py-1.5 font-mono", xw > 15 ? "text-warning" : xw > 10 ? "text-caution" : "")}>
                            {Math.round(xw)} kt {xw >= 0.5 ? side : ""}
                            {g ? <span className="text-muted-foreground"> (G {Math.round(Math.abs(g.crosswind))})</span> : null}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">
                Wind used: {fmtHdg(windTrue ?? 0)}°T ({fmtHdg((windTrue ?? 0) - a.magVar)}°M) at {ktN} kt. Amber/red crosswind = above 10/15 kt — compare with your aircraft's maximum demonstrated crosswind and your personal minimums. Tailwind components are red.
              </p>
            </>
          )}
        </Panel>
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <Panel
          title={
            <span className="flex items-center gap-1.5">
              <Radio className="size-3.5" /> Frequencies
            </span>
          }
        >
          <table className="w-full text-sm">
            <tbody>
              {a.frequencies.map((f, i) => (
                <tr key={`${f.type}-${i}`} className="border-b last:border-0">
                  <td className="py-1.5 pr-3">
                    <Pill tone="cyan">{f.type}</Pill>
                  </td>
                  <td className="py-1.5 pr-3">
                    <div>{f.name !== f.type ? f.name : FREQ_LABEL[f.type] ?? f.type}</div>
                    {f.name !== f.type ? <div className="text-[11px] text-muted-foreground">{FREQ_LABEL[f.type]}</div> : null}
                  </td>
                  <td className="py-1.5 text-right font-mono text-cyan tabular">{formatFreq(f.mhz)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
        <Panel
          title={
            <span className="flex items-center gap-1.5">
              <Compass className="size-3.5" /> Nearby navaids
            </span>
          }
        >
          {navs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No navaids within 60 nm in the dataset.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="label-caps py-1.5">Ident</th>
                  <th className="label-caps py-1.5">Type / freq</th>
                  <th className="label-caps py-1.5 text-right">From apt</th>
                  <th className="label-caps hidden py-1.5 text-right sm:table-cell">Radial</th>
                </tr>
              </thead>
              <tbody>
                {navs.slice(0, 8).map(({ item: n, distNm, brgTrue }) => (
                  <tr key={n.id} className="border-b last:border-0">
                    <td className="py-1.5">
                      <div className="font-mono font-semibold">{n.id}</div>
                      <div className="text-[11px] text-muted-foreground">{n.name}</div>
                    </td>
                    <td className="py-1.5 text-xs">
                      {n.type}
                      {n.freq ? <span className="ml-1 font-mono text-cyan">{n.type === "NDB" ? `${n.freq} kHz` : formatFreq(n.freq)}</span> : null}
                    </td>
                    <td className="py-1.5 text-right font-mono text-xs">
                      {distNm.toFixed(1)} nm
                      <div className="text-muted-foreground">{fmtHdg(brgTrue - a.magVar)}°M</div>
                    </td>
                    <td className="hidden py-1.5 text-right font-mono text-xs sm:table-cell">
                      R-{fmtHdg(brgTrue + 180 - n.magVar)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="mt-2 text-[11px] text-muted-foreground">"From apt" is the magnetic bearing and distance from the airport to the navaid. "Radial" is the navaid radial the airport lies on (using the navaid's declination).</p>
        </Panel>
      </div>

      <Panel title="Runways" className="mb-6">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="label-caps py-1.5 pr-3">Runway</th>
                <th className="label-caps py-1.5 pr-3">Length × width</th>
                <th className="label-caps py-1.5 pr-3">Surface</th>
                <th className="label-caps py-1.5 pr-3">End</th>
                <th className="label-caps py-1.5 pr-3">True hdg</th>
                <th className="label-caps py-1.5 pr-3">Mag hdg</th>
                <th className="label-caps py-1.5 pr-3">Pattern</th>
                <th className="label-caps py-1.5">ILS</th>
              </tr>
            </thead>
            <tbody>
              {a.runways.flatMap((r) =>
                r.ends.map((e, i) => (
                  <tr key={`${r.name}-${e.id}`} className={cn(i === 1 ? "border-b last:border-0" : "")}>
                    {i === 0 ? (
                      <>
                        <td rowSpan={2} className="py-1.5 pr-3 align-top font-mono font-semibold">
                          {r.name}
                        </td>
                        <td rowSpan={2} className="py-1.5 pr-3 align-top font-mono tabular">
                          {r.lengthFt.toLocaleString()} × {r.widthFt} ft
                        </td>
                        <td rowSpan={2} className="py-1.5 pr-3 align-top capitalize">
                          {r.surface}
                        </td>
                      </>
                    ) : null}
                    <td className="py-1.5 pr-3 font-mono">{e.id}</td>
                    <td className="py-1.5 pr-3 font-mono">{fmtHdg(e.trueHeading)}°</td>
                    <td className="py-1.5 pr-3 font-mono">{fmtHdg(magneticHeading(a, e.trueHeading))}°</td>
                    <td className="py-1.5 pr-3">{e.pattern === "right" ? <Pill tone="caution">Right</Pill> : <span className="text-muted-foreground">Left</span>}</td>
                    <td className="py-1.5 font-mono text-xs">
                      {e.ils ? (
                        <span className="text-cyan">
                          {e.ils.ident} {formatFreq(e.ils.freq)} · GS {e.ils.glideslopeDeg.toFixed(1)}°
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
        </div>
      </Panel>

      <div className="mb-6 grid gap-4 md:grid-cols-3">
        <Panel
          title={
            <span className="flex items-center gap-1.5">
              <FileText className="size-3.5" /> Procedures
            </span>
          }
        >
          {a.procedures.length ? (
            <ul className="space-y-1.5 text-sm">
              {a.procedures.map((p) => (
                <li key={p} className="flex gap-2">
                  <span className="mt-2 size-1 shrink-0 rounded-full bg-magenta" />
                  {p}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No procedures listed.</p>
          )}
          <p className="mt-3 text-[11px] text-muted-foreground">Names only — TeachX does not reproduce approach plates. Use current FAA Terminal Procedures Publications.</p>
        </Panel>
        <Panel title="Notes">
          <ul className="space-y-1.5 text-sm">
            {a.notes.map((n) => (
              <li key={n} className="flex gap-2">
                <span className="mt-2 size-1 shrink-0 rounded-full bg-caution" />
                {n}
              </li>
            ))}
            {a.taxiways.length ? (
              <li className="flex gap-2">
                <span className="mt-2 size-1 shrink-0 rounded-full bg-muted-foreground" />
                Main taxiways: <span className="font-mono">{a.taxiways.join(", ")}</span>
              </li>
            ) : null}
          </ul>
          {a.training.length ? (
            <div className="mt-3 flex flex-wrap gap-1">
              {a.training.map((t) => (
                <Pill key={t}>{t}</Pill>
              ))}
            </div>
          ) : null}
        </Panel>
        <Panel title="Nearby airports">
          {neighbours.length ? (
            <ul className="space-y-1.5 text-sm">
              {neighbours.map(({ item, distNm, brgTrue }) => (
                <li key={item.icao} className="flex items-center justify-between gap-2">
                  <Link to="/airports/$icao" params={{ icao: item.icao }} className="truncate hover:text-primary">
                    <span className="font-mono font-semibold">{item.icao}</span> <span className="text-muted-foreground">{item.city}</span>
                  </Link>
                  <span className="shrink-0 font-mono text-xs text-muted-foreground">
                    {fmtHdg(brgTrue - a.magVar)}°M {distNm.toFixed(0)} nm
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No other dataset airports within 120 nm.</p>
          )}
        </Panel>
      </div>

      <Notice tone="caution" title="Data source & currency.">
        <span className="block">Source: {AIRPORT_DATA_NOTICE.source}.</span>
        <span className="block">Currency: {AIRPORT_DATA_NOTICE.currency}</span>
        <strong className="block">{AIRPORT_DATA_NOTICE.disclaimer}</strong>
      </Notice>
    </Page>
  );
}
