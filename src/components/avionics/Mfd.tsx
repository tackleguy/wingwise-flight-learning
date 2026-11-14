/**
 * TeachX Flight Display — MFD: moving map, nearest airports, flight plan and engine/systems pages,
 * with an always-visible engine indication strip on the left.
 */
import { useState } from "react";
import { freqOf } from "@/lib/data/airports";
import { norm360 } from "@/lib/geo";
import { cn } from "@/lib/utils";
import {
  fmtCom,
  fmtEte,
  legTable,
  nearestAirports,
  pad3,
  waypointFromAirport,
} from "@/sim/avionics-helpers";
import { useSimEngine, useSimSnapshot } from "@/sim/react";
import type { SimSnapshot } from "@/sim/types";
import { DisplayBezel, SoftKey } from "./common";
import { EngineGauges } from "./EngineGauges";
import { MovingMap, nextRange, type MapLayers } from "./MovingMap";

export type MfdPage = "MAP" | "NRST" | "FPL" | "SYS";

export interface MfdProps {
  className?: string | undefined;
  /** Initial page (default MAP). */
  initialPage?: MfdPage | undefined;
  /** Hide the engine strip on the left (e.g. very narrow layouts). */
  hideEngineStrip?: boolean | undefined;
}

export function Mfd({ className, initialPage = "MAP", hideEngineStrip }: MfdProps) {
  const s = useSimSnapshot();
  const [page, setPage] = useState<MfdPage>(initialPage);
  const [range, setRange] = useState(10);
  const [orientation, setOrientation] = useState<"north" | "track">("track");
  const [layers, setLayers] = useState<MapLayers>({ terrain: true, weather: true, traffic: true });
  const toggle = (k: keyof MapLayers) => setLayers((l) => ({ ...l, [k]: !l[k] }));
  const powered = s.indicated.avionicsPowered;

  const softKeys = (
    <div className="grid grid-cols-5 gap-1 sm:grid-cols-10">
      {(["MAP", "NRST", "FPL", "SYS"] as const).map((p) => (
        <SoftKey
          key={p}
          active={page === p}
          tone="cyan"
          onClick={() => setPage(p)}
          title={PAGE_HELP[p]}
        >
          {p}
        </SoftKey>
      ))}
      <SoftKey
        active={layers.terrain}
        tone="ok"
        onClick={() => toggle("terrain")}
        title="Relative terrain: red within 100 ft, yellow within 1,000 ft of your altitude"
      >
        TER
      </SoftKey>
      <SoftKey
        active={layers.weather}
        tone="ok"
        onClick={() => toggle("weather")}
        title="Simulated precipitation overlay (educational, only when the weather has precipitation)"
      >
        WX
      </SoftKey>
      <SoftKey
        active={layers.traffic}
        tone="ok"
        onClick={() => toggle("traffic")}
        title="Simulated TIS-style traffic targets"
      >
        TFC
      </SoftKey>
      <SoftKey
        onClick={() => setOrientation((o) => (o === "north" ? "track" : "north"))}
        title="Toggle north-up / track-up"
      >
        {orientation === "north" ? "N UP" : "TRK UP"}
      </SoftKey>
      <SoftKey
        onClick={() => setRange((r) => nextRange(r, -1))}
        title="Zoom in (smaller range)"
        ariaLabel="Zoom in"
      >
        RNG −
      </SoftKey>
      <SoftKey
        onClick={() => setRange((r) => nextRange(r, 1))}
        title="Zoom out (larger range)"
        ariaLabel="Zoom out"
      >
        RNG +
      </SoftKey>
    </div>
  );

  return (
    <DisplayBezel
      title="TeachX Flight Display · MFD"
      explainId="mfd"
      className={className}
      footer={softKeys}
    >
      <div
        className="relative flex overflow-hidden rounded-md bg-black"
        style={{ aspectRatio: "4 / 3" }}
      >
        {!powered ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-1 font-mono text-[#3a4048]">
            <span className="text-lg font-bold">DISPLAY UNPOWERED</span>
            <span className="text-xs">Check MASTER and AVIONICS switches</span>
          </div>
        ) : (
          <>
            {!hideEngineStrip ? (
              <div className="w-[24%] min-w-[96px] shrink-0 overflow-hidden border-r border-white/10">
                <EngineGauges layout="strip" className="h-full" />
              </div>
            ) : null}
            <div className="relative flex min-w-0 flex-1 flex-col">
              <NavDataBar s={s} />
              <div className="relative min-h-0 flex-1">
                {page === "MAP" ? (
                  <MovingMap
                    rangeNm={range}
                    orientation={orientation}
                    layers={layers}
                    fill
                    width={800}
                    height={560}
                    onZoom={(d) => setRange((r) => nextRange(r, d))}
                  />
                ) : page === "NRST" ? (
                  <NearestPage s={s} />
                ) : page === "FPL" ? (
                  <FlightPlanPage s={s} />
                ) : (
                  <div className="h-full overflow-auto p-2">
                    <EngineGauges layout="panel" className="border-0" />
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </DisplayBezel>
  );
}

const PAGE_HELP: Record<MfdPage, string> = {
  MAP: "Moving map",
  NRST: "Nearest airports — distance, bearing, longest runway, frequencies",
  FPL: "Active flight plan",
  SYS: "Engine & systems page",
};

function NavDataBar({ s }: { s: SimSnapshot }) {
  const g = s.nav.gps;
  const trk = norm360(s.aircraft.track - s.magVar);
  const item = (label: string, value: string, magenta = false) => (
    <span className="flex items-baseline gap-1">
      <span className="text-[9px] text-white/55">{label}</span>
      <span
        className={cn("text-[12px] font-semibold tabular", magenta ? "text-magenta" : "text-white")}
      >
        {value}
      </span>
    </span>
  );
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 border-b border-white/10 bg-[#0b0d10] px-2 py-1 font-mono">
      {item("GS", g.valid ? `${Math.round(s.aircraft.gsKt)}KT` : "---")}
      {item("DTK", g.valid && g.toId ? `${pad3(g.dtk)}°` : "___", true)}
      {item("TRK", g.valid ? `${pad3(trk)}°` : "___")}
      {item("ETE", g.valid && g.toId ? fmtEte(g.eteMin) : "__:__")}
      {item("DIS", g.valid && g.toId ? `${g.distNm.toFixed(1)}NM` : "___", true)}
      {g.toId ? item("TO", g.toId, true) : null}
    </div>
  );
}

function NearestPage({ s }: { s: SimSnapshot }) {
  const engine = useSimEngine();
  const list = nearestAirports(s.aircraft.lat, s.aircraft.lon, s.magVar, 8);
  return (
    <div className="h-full overflow-auto font-mono text-[11px]">
      <table className="w-full">
        <thead className="sticky top-0 bg-[#0b0d10] text-[9px] text-white/50">
          <tr>
            <th className="px-2 py-1 text-left font-normal">APT</th>
            <th className="px-1 py-1 text-right font-normal">BRG</th>
            <th className="px-1 py-1 text-right font-normal">DIS</th>
            <th className="px-1 py-1 text-right font-normal">RWY</th>
            <th className="px-1 py-1 text-right font-normal">FREQ</th>
            <th className="px-2 py-1" />
          </tr>
        </thead>
        <tbody>
          {list.map(({ airport: ap, distNm, brgMag, longestFt }) => {
            const tw = freqOf(ap, "TWR") ?? freqOf(ap, "CTAF") ?? freqOf(ap, "UNICOM");
            return (
              <tr key={ap.icao} className="border-t border-white/5">
                <td className="px-2 py-1">
                  <div className="font-semibold text-cyan">{ap.icao}</div>
                  <div className="max-w-[12rem] truncate text-[9px] text-white/45">{ap.name}</div>
                </td>
                <td className="px-1 py-1 text-right text-white tabular">{pad3(brgMag)}°</td>
                <td className="px-1 py-1 text-right text-white tabular">{distNm.toFixed(1)}</td>
                <td className="px-1 py-1 text-right text-white/80 tabular">{longestFt}</td>
                <td className="px-1 py-1 text-right text-ok tabular">
                  {tw ? fmtCom(tw.mhz) : "—"}
                </td>
                <td className="px-2 py-1 text-right whitespace-nowrap">
                  <button
                    type="button"
                    className="mr-1 rounded border border-magenta/40 px-1 text-magenta hover:bg-magenta/15"
                    onClick={() => engine.directTo(waypointFromAirport(ap))}
                    title={`Direct-to ${ap.icao}`}
                  >
                    D→
                  </button>
                  {tw ? (
                    <button
                      type="button"
                      className="rounded border border-white/20 px-1 text-white/80 hover:bg-white/10"
                      onClick={() =>
                        engine.setRadios({
                          com1: { ...engine.getSnapshot().radios.com1, standby: tw.mhz },
                        })
                      }
                      title={`Load ${tw.name} ${fmtCom(tw.mhz)} into COM1 standby`}
                    >
                      COM
                    </button>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function FlightPlanPage({ s }: { s: SimSnapshot }) {
  const engine = useSimEngine();
  const fp = s.gps.flightPlan;
  const legs = legTable(fp, s.magVar);
  let cum = 0;
  return (
    <div className="h-full overflow-auto font-mono text-[11px]">
      <div className="flex items-center justify-between border-b border-white/10 px-2 py-1 text-[10px] text-white/55">
        <span>ACTIVE FLIGHT PLAN{s.gps.approach ? ` · ${s.gps.approach.label}` : ""}</span>
        <span className="text-white/40">Edit on the TX-750 Navigator</span>
      </div>
      {fp.length === 0 ? (
        <p className="p-3 text-white/45">
          No flight plan. Build one on the GPS (FPL page) or use Direct-to.
        </p>
      ) : (
        <table className="w-full">
          <thead className="text-[9px] text-white/50">
            <tr>
              <th className="px-2 py-1 text-left font-normal" />
              <th className="px-1 py-1 text-left font-normal">WPT</th>
              <th className="px-1 py-1 text-right font-normal">DTK</th>
              <th className="px-1 py-1 text-right font-normal">LEG</th>
              <th className="px-1 py-1 text-right font-normal">CUM</th>
              <th className="px-1 py-1 text-right font-normal">ALT</th>
            </tr>
          </thead>
          <tbody>
            {legs.map((l, i) => {
              cum += l.distNm;
              const isActive = !s.gps.directTo && i === s.gps.activeLeg;
              return (
                <tr
                  key={`${l.wp.id}-${i}`}
                  className={cn(
                    "cursor-pointer border-t border-white/5 hover:bg-white/5",
                    isActive && "text-magenta",
                  )}
                  onClick={() => i > 0 && engine.setActiveLeg(i)}
                  title={i > 0 ? `Activate leg to ${l.wp.id}` : undefined}
                >
                  <td className="w-4 px-2 py-1">{isActive ? "➔" : ""}</td>
                  <td
                    className={cn(
                      "px-1 py-1 font-semibold",
                      isActive ? "text-magenta" : "text-white",
                    )}
                  >
                    {l.wp.id}
                    {l.wp.label && l.wp.kind === "fix" ? (
                      <span className="ml-1 text-[9px] text-white/40">{l.wp.label}</span>
                    ) : null}
                  </td>
                  <td className="px-1 py-1 text-right tabular">{i > 0 ? `${pad3(l.dtk)}°` : ""}</td>
                  <td className="px-1 py-1 text-right tabular">
                    {i > 0 ? l.distNm.toFixed(1) : ""}
                  </td>
                  <td className="px-1 py-1 text-right text-white/60 tabular">
                    {i > 0 ? cum.toFixed(1) : ""}
                  </td>
                  <td className="px-1 py-1 text-right text-cyan tabular">
                    {l.wp.altFt !== undefined ? l.wp.altFt : ""}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
