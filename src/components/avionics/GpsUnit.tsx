/**
 * SR-750 Navigator — interactive panel-mount GPS navigator (touch-screen style).
 *
 * Pages: MAP, NAV, FPL (build/edit flight plan), D→ (direct-to), NRST, WPT (airport/navaid info),
 * PROC (training approaches). CDI source toggle (GPS ↔ VLOC) and a dual concentric knob
 * (outer = page, inner = map range; push = map orientation).
 */
import { useMemo, useState, type ReactNode } from "react";
import { allRunwayEnds, freqOf, getAirport, magneticHeading } from "@/lib/data/airports";
import type { Airport, RunwayEnd } from "@/lib/data/types";
import { bearingDeg, distanceNm, norm360 } from "@/lib/geo";
import { cn } from "@/lib/utils";
import {
  fmtCom,
  fmtEte,
  fmtNav,
  hitToWaypoint,
  legTable,
  nearestAirports,
  pad3,
  searchIdentifiers,
  waypointFromAirport,
  type IdentHit,
} from "@/sim/avionics-helpers";
import type { SimEngine } from "@/sim/engine";
import { buildTrainingApproach } from "@/sim/navigation";
import { useSimEngine, useSimSnapshot } from "@/sim/react";
import type { SimSnapshot, Waypoint } from "@/sim/types";
import { ExplainButton } from "./common";
import { Knob } from "./Knob";
import { MovingMap, nextRange } from "./MovingMap";

export type GpsPage = "MAP" | "NAV" | "FPL" | "DTO" | "NRST" | "WPT" | "PROC";
const PAGES: { id: GpsPage; label: string; help: string }[] = [
  { id: "MAP", label: "MAP", help: "Moving map" },
  { id: "NAV", label: "NAV", help: "Navigation data: DTK, TRK, DIS, ETE, BRG, GS, XTK" },
  { id: "FPL", label: "FPL", help: "Create and edit the flight plan" },
  { id: "DTO", label: "D→", help: "Direct-to a waypoint" },
  { id: "NRST", label: "NRST", help: "Nearest airports" },
  { id: "WPT", label: "WPT", help: "Airport / navaid information" },
  { id: "PROC", label: "PROC", help: "Approach (training procedure) selection" },
];

export interface GpsUnitProps {
  className?: string | undefined;
  initialPage?: GpsPage | undefined;
}

export function GpsUnit({ className, initialPage = "MAP" }: GpsUnitProps) {
  const s = useSimSnapshot();
  const engine = useSimEngine();
  const [page, setPage] = useState<GpsPage>(initialPage);
  const [range, setRange] = useState(10);
  const [orientation, setOrientation] = useState<"north" | "track">("track");
  const [wptId, setWptId] = useState<string>("");
  const [msg, setMsg] = useState<string>("");
  const powered = s.indicated.avionicsPowered;
  const cdiGps = s.radios.cdiSource === "GPS";

  const go = (p: GpsPage) => {
    setPage(p);
    setMsg("");
  };
  const cyclePage = (dir: 1 | -1) => {
    const i = PAGES.findIndex((p) => p.id === page);
    go(PAGES[(i + dir + PAGES.length) % PAGES.length]!.id);
  };
  const toggleCdi = () => engine.setRadios({ cdiSource: cdiGps ? "NAV1" : "GPS" });

  return (
    <div
      className={cn(
        "relative rounded-2xl border border-white/10 bg-gradient-to-b from-[oklch(0.25_0.006_258)] to-[oklch(0.17_0.006_258)] p-3 shadow-[inset_0_1px_0_oklch(1_0_0/0.08),0_12px_30px_oklch(0_0_0/0.5)]",
        className,
      )}
    >
      <div className="mb-2 flex items-center justify-between px-1">
        <span className="font-mono text-[11px] font-bold tracking-[0.25em] text-white/70">
          SR-750 <span className="font-normal text-white/40">NAVIGATOR</span>
        </span>
        <ExplainButton id="gps" label="SR-750 Navigator" />
      </div>
      <div className="flex flex-col gap-3 md:flex-row">
        {/* screen */}
        <div className="min-w-0 flex-1">
          <div
            className="relative flex flex-col overflow-hidden rounded-md border border-black bg-black shadow-[inset_0_0_0_1px_oklch(1_0_0/0.05)]"
            style={{ aspectRatio: "4 / 3.1" }}
          >
            {!powered ? (
              <div className="flex flex-1 items-center justify-center font-mono text-sm text-[#3a4048]">
                NO POWER — AVIONICS MASTER
              </div>
            ) : (
              <>
                <StatusBar s={s} page={page} />
                <div className="relative min-h-0 flex-1 overflow-auto">
                  {page === "MAP" ? (
                    <div className="absolute inset-0 flex flex-col">
                      <DataFields s={s} />
                      <div className="relative min-h-0 flex-1">
                        <MovingMap
                          rangeNm={range}
                          orientation={orientation}
                          fill
                          width={800}
                          height={520}
                          onZoom={(d) => setRange((r) => nextRange(r, d))}
                          layers={{ weather: false }}
                        />
                        <div className="absolute right-2 bottom-2 flex gap-1">
                          <ScreenBtn
                            onClick={() => setRange((r) => nextRange(r, -1))}
                            ariaLabel="Zoom in"
                          >
                            −
                          </ScreenBtn>
                          <ScreenBtn
                            onClick={() => setRange((r) => nextRange(r, 1))}
                            ariaLabel="Zoom out"
                          >
                            +
                          </ScreenBtn>
                        </div>
                      </div>
                    </div>
                  ) : page === "NAV" ? (
                    <NavPage s={s} />
                  ) : page === "FPL" ? (
                    <FplPage s={s} engine={engine} onMsg={setMsg} />
                  ) : page === "DTO" ? (
                    <DirectToPage s={s} engine={engine} onDone={() => go("MAP")} />
                  ) : page === "NRST" ? (
                    <NrstPage
                      s={s}
                      engine={engine}
                      onInfo={(id) => {
                        setWptId(id);
                        go("WPT");
                      }}
                      onMsg={setMsg}
                    />
                  ) : page === "WPT" ? (
                    <WptPage s={s} engine={engine} id={wptId} setId={setWptId} onMsg={setMsg} />
                  ) : (
                    <ProcPage s={s} engine={engine} onMsg={setMsg} />
                  )}
                </div>
                {msg ? (
                  <button
                    type="button"
                    onClick={() => setMsg("")}
                    className="border-t border-cyan/30 bg-cyan/10 px-2 py-1 text-left font-mono text-[10px] text-cyan"
                  >
                    {msg}
                  </button>
                ) : null}
                <nav
                  className="grid grid-cols-7 border-t border-white/10 bg-[#0b0d10]"
                  aria-label="GPS pages"
                >
                  {PAGES.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      title={p.help}
                      onClick={() => go(p.id)}
                      aria-current={page === p.id ? "page" : undefined}
                      className={cn(
                        "border-r border-white/5 py-1.5 font-mono text-[10px] font-bold tracking-wider transition last:border-r-0 sm:text-[11px]",
                        page === p.id
                          ? "bg-cyan/15 text-cyan"
                          : "text-white/60 hover:bg-white/5 hover:text-white",
                        p.id === "DTO" && page !== p.id && "text-magenta/80",
                      )}
                    >
                      {p.label}
                    </button>
                  ))}
                </nav>
              </>
            )}
          </div>
        </div>
        {/* bezel controls */}
        <div className="flex shrink-0 flex-row items-center justify-between gap-3 md:w-24 md:flex-col md:justify-start">
          <BezelButton onClick={() => go("DTO")} title="Direct-to" className="text-magenta">
            D→
          </BezelButton>
          <BezelButton
            onClick={toggleCdi}
            title="Toggle CDI source between GPS and VLOC (NAV1)"
            className={cdiGps ? "text-magenta" : "text-ok"}
          >
            <span className="flex flex-col leading-none">
              <span className="text-[8px] text-white/50">CDI</span>
              {cdiGps ? "GPS" : "VLOC"}
            </span>
          </BezelButton>
          <BezelButton onClick={() => go("FPL")} title="Flight plan page">
            FPL
          </BezelButton>
          <BezelButton onClick={() => go("PROC")} title="Procedures (approaches)">
            PROC
          </BezelButton>
          <div className="md:mt-3">
            <Knob
              size="lg"
              label="Page select (outer)"
              caption="PAGE / RNG"
              pushHint="push: N↑/TRK↑"
              valueNow={PAGES.findIndex((p) => p.id === page)}
              valueMin={0}
              valueMax={PAGES.length - 1}
              valueText={`Page ${page}`}
              onStep={(d) => cyclePage(d)}
              inner={{
                label: "Map range (inner)",
                valueNow: range,
                valueText: `${range} nautical miles`,
                onStep: (d) => setRange((r) => nextRange(r, d === 1 ? -1 : 1)),
                onPush: () => setOrientation((o) => (o === "north" ? "track" : "north")),
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- bits

function BezelButton({
  children,
  onClick,
  title,
  className,
}: {
  children: ReactNode;
  onClick: () => void;
  title: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        "flex h-10 w-full min-w-14 items-center justify-center rounded-md border border-white/10 bg-gradient-to-b from-[oklch(0.32_0.006_258)] to-[oklch(0.2_0.006_258)] font-mono text-xs font-bold text-white/80 shadow-[inset_0_1px_0_oklch(1_0_0/0.12),0_2px_4px_oklch(0_0_0/0.6)] transition hover:text-white active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        className,
      )}
    >
      {children}
    </button>
  );
}

function ScreenBtn({
  children,
  onClick,
  ariaLabel,
  className,
  title,
  tone = "default",
  disabled,
}: {
  children: ReactNode;
  onClick: () => void;
  ariaLabel?: string;
  className?: string;
  title?: string;
  tone?: "default" | "cyan" | "magenta" | "ok";
  disabled?: boolean;
}) {
  const t = {
    default: "border-white/20 text-white/85 hover:bg-white/10",
    cyan: "border-cyan/40 text-cyan hover:bg-cyan/10",
    magenta: "border-magenta/50 text-magenta hover:bg-magenta/15",
    ok: "border-ok/40 text-ok hover:bg-ok/10",
  }[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      title={title}
      disabled={disabled}
      className={cn(
        "rounded border bg-black/70 px-2 py-0.5 font-mono text-[10px] font-semibold transition disabled:opacity-30",
        t,
        className,
      )}
    >
      {children}
    </button>
  );
}

function StatusBar({ s, page }: { s: SimSnapshot; page: GpsPage }) {
  const g = s.nav.gps;
  const cdiGps = s.radios.cdiSource === "GPS";
  return (
    <div className="flex items-center justify-between gap-2 border-b border-white/10 bg-[#0b0d10] px-2 py-1 font-mono text-[10px]">
      <span className="font-bold tracking-wider text-cyan">
        {PAGES.find((p) => p.id === page)?.help.split(":")[0]}
      </span>
      <span className="flex items-center gap-2">
        <span className={g.valid ? "text-ok" : "animate-annunciator text-caution"}>
          {g.valid
            ? s.gps.approach && s.gps.mode === "APR"
              ? s.gps.approach.kind === "RNAV"
                ? "LPV"
                : "APR"
              : s.gps.mode
            : "LOI"}
        </span>
        <span
          className={cn(
            "rounded border px-1",
            cdiGps ? "border-magenta/50 text-magenta" : "border-ok/50 text-ok",
          )}
        >
          {cdiGps ? "GPS" : "VLOC"}
        </span>
      </span>
    </div>
  );
}

function DataFields({ s }: { s: SimSnapshot }) {
  const g = s.nav.gps;
  const ok = g.valid;
  const has = ok && !!g.toId;
  const f = (label: string, value: string, magenta = false) => (
    <div className="flex flex-col items-center px-1">
      <span className="text-[8px] text-white/50">{label}</span>
      <span
        className={cn("text-[12px] font-semibold tabular", magenta ? "text-magenta" : "text-white")}
      >
        {value}
      </span>
    </div>
  );
  return (
    <div className="grid grid-cols-5 border-b border-white/10 bg-[#07090c] py-0.5 font-mono">
      {f("GS", ok ? `${Math.round(s.aircraft.gsKt)}KT` : "---")}
      {f("DTK", has ? `${pad3(g.dtk)}°` : "___", true)}
      {f("TRK", ok ? `${pad3(norm360(s.aircraft.track - s.magVar))}°` : "___")}
      {f("DIS", has ? `${g.distNm.toFixed(1)}` : "___", true)}
      {f("ETE", has ? fmtEte(g.eteMin) : "__:__")}
    </div>
  );
}

/** Identifier entry with autocomplete over AIRPORTS + NAVAIDS. */
function IdentInput({
  s,
  onSelect,
  placeholder,
  airportsOnly,
  autoFocus,
}: {
  s: SimSnapshot;
  onSelect: (h: IdentHit) => void;
  placeholder: string;
  airportsOnly?: boolean;
  autoFocus?: boolean;
}) {
  const [q, setQ] = useState("");
  const [hi, setHi] = useState(0);
  const hits = useMemo(() => {
    const all = searchIdentifiers(q, { lat: s.aircraft.lat, lon: s.aircraft.lon }, 12);
    return (airportsOnly ? all.filter((h) => h.kind === "airport") : all).slice(0, 6);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, airportsOnly]);
  const pick = (h: IdentHit | undefined) => {
    if (!h) return;
    onSelect(h);
    setQ("");
    setHi(0);
  };
  return (
    <div className="relative">
      <input
        value={q}
        autoFocus={autoFocus}
        onChange={(e) => {
          setQ(e.target.value.toUpperCase().replace(/[^A-Z0-9 ]/g, ""));
          setHi(0);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setHi((i) => Math.min(hits.length - 1, i + 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHi((i) => Math.max(0, i - 1));
          } else if (e.key === "Enter") {
            e.preventDefault();
            pick(hits[hi]);
          } else if (e.key === "Escape") setQ("");
        }}
        placeholder={placeholder}
        aria-label={placeholder}
        className="w-full rounded border border-cyan/40 bg-black px-2 py-1 font-mono text-[12px] tracking-widest text-cyan uppercase placeholder:text-white/30 placeholder:normal-case placeholder:tracking-normal focus:border-cyan focus:outline-none"
      />
      {q && hits.length > 0 ? (
        <ul
          role="listbox"
          className="absolute top-full right-0 left-0 z-20 mt-0.5 max-h-48 overflow-auto rounded border border-white/15 bg-[#0b0d10] shadow-xl"
        >
          {hits.map((h, i) => (
            <li key={`${h.kind}${h.id}${h.lat}`} role="option" aria-selected={i === hi}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(h)}
                className={cn(
                  "flex w-full items-center justify-between gap-2 px-2 py-1 text-left font-mono text-[11px]",
                  i === hi ? "bg-cyan/15" : "hover:bg-white/5",
                )}
              >
                <span>
                  <b className="text-cyan">{h.id}</b>{" "}
                  <span className="text-white/60">{h.name}</span>
                </span>
                <span className="shrink-0 text-[9px] text-white/40">
                  {h.type}
                  {h.distNm !== undefined ? ` · ${h.distNm.toFixed(0)}NM` : ""}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : q && hits.length === 0 ? (
        <p className="mt-0.5 font-mono text-[10px] text-caution">No identifier matches “{q}”</p>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------- NAV

function NavPage({ s }: { s: SimSnapshot }) {
  const g = s.nav.gps;
  const has = g.valid && !!g.toId;
  const fullScale = s.gps.mode === "APR" ? 0.3 : s.gps.mode === "TERM" ? 1 : 2;
  const field = (label: string, value: string, tone: "w" | "m" | "c" = "w", hint?: string) => (
    <div className="rounded border border-white/10 bg-[#07090c] px-2 py-1" title={hint}>
      <div className="text-[9px] tracking-wider text-white/50">{label}</div>
      <div
        className={cn(
          "text-lg leading-tight font-semibold tabular",
          tone === "m" ? "text-magenta" : tone === "c" ? "text-cyan" : "text-white",
        )}
      >
        {value}
      </div>
    </div>
  );
  const dev = Math.max(-2.5, Math.min(2.5, g.cdiDots));
  return (
    <div className="space-y-2 p-2 font-mono">
      <div className="flex items-center justify-between rounded border border-magenta/30 bg-magenta/5 px-2 py-1 text-[12px]">
        <span className="text-white/60">ACTIVE LEG</span>
        <span className="font-bold text-magenta">
          {has ? `${s.gps.directTo ? "D→" : g.fromId} → ${g.toId}` : "—"}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
        {field(
          "DTK",
          has ? `${pad3(g.dtk)}°` : "___",
          "m",
          "Desired track: the course of the active leg",
        )}
        {field(
          "TRK",
          g.valid ? `${pad3(norm360(s.aircraft.track - s.magVar))}°` : "___",
          "w",
          "Your actual ground track",
        )}
        {field(
          "DIS",
          has ? `${g.distNm.toFixed(1)}NM` : "___",
          "m",
          "Distance to the active waypoint",
        )}
        {field(
          "ETE",
          has ? fmtEte(g.eteMin) : "__:__",
          "w",
          "Estimated time en route to the active waypoint",
        )}
        {field(
          "BRG",
          has ? `${pad3(g.brg)}°` : "___",
          "w",
          "Bearing from you to the active waypoint",
        )}
        {field("GS", g.valid ? `${Math.round(s.aircraft.gsKt)}KT` : "___", "w", "Groundspeed")}
        {field(
          "XTK",
          has ? `${Math.abs(g.xtkNm).toFixed(2)}${g.xtkNm >= 0 ? "R" : "L"}` : "___",
          "w",
          "Cross-track error: how far you are left/right of the course",
        )}
        {field(
          "REM",
          has ? `${g.remainingNm.toFixed(1)}NM` : "___",
          "w",
          "Distance remaining in the flight plan",
        )}
      </div>
      <div className="rounded border border-white/10 bg-[#07090c] px-3 py-2">
        <div className="mb-1 flex justify-between text-[9px] text-white/50">
          <span>
            CDI · full scale {fullScale} NM ({s.gps.mode})
          </span>
          <span>{has ? g.toFrom : ""}</span>
        </div>
        <svg
          viewBox="0 0 300 34"
          className="h-8 w-full"
          role="img"
          aria-label={`GPS course deviation ${dev.toFixed(1)} dots`}
        >
          {[-2, -1, 0, 1, 2].map((d) => (
            <circle
              key={d}
              cx={150 + d * 50}
              cy={17}
              r={d === 0 ? 0 : 4}
              fill="none"
              stroke="#f1f3f5"
              strokeWidth={1.5}
            />
          ))}
          <line x1={150} x2={150} y1={4} y2={30} stroke="#f1f3f5" strokeWidth={1} opacity={0.4} />
          {has ? (
            <rect x={150 + dev * 50 - 4} y={2} width={8} height={30} fill="var(--magenta)" />
          ) : null}
          {has ? (
            <polygon
              points={g.toFrom === "TO" ? "150,0 143,10 157,10" : "150,34 143,24 157,24"}
              fill="#f1f3f5"
            />
          ) : null}
        </svg>
      </div>
      <p className="text-[10px] leading-snug text-white/45">
        With the CDI on GPS, the autopilot NAV mode flies the magenta active leg. XTK and the CDI
        show the same information: how far you are from the course line.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------- FPL

function insertIndex(fp: Waypoint[]) {
  const idx = fp.findIndex(
    (w) => w.kind === "fix" && !!w.label && ["IAF", "IF", "FAF"].includes(w.label),
  );
  if (idx >= 0) return idx;
  const rw = fp.findIndex((w) => w.kind === "runway");
  return rw >= 0 ? rw : fp.length;
}

function commitPlan(
  engine: SimEngine,
  s: SimSnapshot,
  next: Waypoint[],
  keepActiveId: string | undefined,
) {
  const dto = s.gps.directTo;
  engine.loadFlightPlan(next);
  if (keepActiveId) {
    const i = next.findIndex((w) => w.id === keepActiveId);
    if (i >= 1) engine.setActiveLeg(i);
  }
  if (dto) engine.directTo(dto);
}

function FplPage({
  s,
  engine,
  onMsg,
}: {
  s: SimSnapshot;
  engine: SimEngine;
  onMsg: (m: string) => void;
}) {
  const fp = s.gps.flightPlan;
  const legs = legTable(fp, s.magVar);
  const activeId = fp[s.gps.activeLeg]?.id;
  const add = (h: IdentHit) => {
    const wp = hitToWaypoint(h);
    if (fp.length > 0 && fp[fp.length - 1]?.id === wp.id) return;
    const at = insertIndex(fp);
    const next = [...fp.slice(0, at), wp, ...fp.slice(at)];
    commitPlan(engine, s, next, activeId);
    onMsg(`${wp.id} added to the flight plan (${next.length} waypoints).`);
  };
  const remove = (i: number) => {
    const next = fp.filter((_, k) => k !== i);
    commitPlan(engine, s, next, activeId);
  };
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= fp.length) return;
    const next = [...fp];
    [next[i], next[j]] = [next[j]!, next[i]!];
    commitPlan(engine, s, next, activeId);
  };
  let cum = 0;
  return (
    <div className="flex h-full flex-col font-mono">
      <div className="space-y-1 border-b border-white/10 p-2">
        <IdentInput
          s={s}
          onSelect={add}
          placeholder="Add waypoint — type an identifier (e.g. KHAF, OSI)"
        />
        <div className="flex items-center justify-between text-[9px] text-white/45">
          <span>
            {fp.length} waypoint{fp.length === 1 ? "" : "s"}
            {s.gps.approach && fp.some((w) => w.kind === "runway")
              ? ` · ${s.gps.approach.label}`
              : ""}
          </span>
          {fp.length > 0 ? (
            <button
              type="button"
              className="text-warning/80 hover:text-warning"
              onClick={() => engine.loadFlightPlan([])}
            >
              CLEAR FPL
            </button>
          ) : null}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {fp.length === 0 ? (
          <div className="p-3 text-[11px] leading-relaxed text-white/50">
            <p>Empty flight plan.</p>
            <p className="mt-1">
              Type an identifier above to add waypoints — the first waypoint is the origin, then
              each leg is flown in order.
            </p>
          </div>
        ) : (
          <table className="w-full text-[11px]">
            <thead className="sticky top-0 bg-[#0b0d10] text-[9px] text-white/50">
              <tr>
                <th className="w-4" />
                <th className="px-1 py-1 text-left font-normal">WPT</th>
                <th className="px-1 py-1 text-right font-normal">DTK</th>
                <th className="px-1 py-1 text-right font-normal">DIS</th>
                <th className="px-1 py-1 text-right font-normal">CUM</th>
                <th className="px-1 py-1" />
              </tr>
            </thead>
            <tbody>
              {legs.map((l, i) => {
                cum += l.distNm;
                const isActive = !s.gps.directTo && i === s.gps.activeLeg;
                return (
                  <tr
                    key={`${l.wp.id}-${i}`}
                    className={cn("border-t border-white/5", isActive && "bg-magenta/10")}
                  >
                    <td className="pl-1 text-magenta">{isActive ? "➔" : ""}</td>
                    <td
                      className={cn(
                        "px-1 py-1 font-semibold",
                        isActive ? "text-magenta" : "text-white",
                      )}
                    >
                      {l.wp.id}
                      {l.wp.altFt !== undefined && l.wp.kind !== "airport" ? (
                        <span className="ml-1 text-[9px] text-cyan">{l.wp.altFt}</span>
                      ) : null}
                    </td>
                    <td className="px-1 py-1 text-right tabular">
                      {i > 0 ? `${pad3(l.dtk)}°` : ""}
                    </td>
                    <td className="px-1 py-1 text-right tabular">
                      {i > 0 ? l.distNm.toFixed(1) : ""}
                    </td>
                    <td className="px-1 py-1 text-right text-white/50 tabular">
                      {i > 0 ? cum.toFixed(0) : ""}
                    </td>
                    <td className="px-1 py-1 text-right whitespace-nowrap">
                      {i > 0 ? (
                        <ScreenBtn
                          tone="magenta"
                          onClick={() => engine.setActiveLeg(i)}
                          title={`Activate the leg to ${l.wp.id}`}
                          className="mr-0.5"
                        >
                          ACT
                        </ScreenBtn>
                      ) : null}
                      <ScreenBtn
                        onClick={() => move(i, -1)}
                        ariaLabel={`Move ${l.wp.id} up`}
                        disabled={i === 0}
                        className="mr-0.5 px-1"
                      >
                        ↑
                      </ScreenBtn>
                      <ScreenBtn
                        onClick={() => move(i, 1)}
                        ariaLabel={`Move ${l.wp.id} down`}
                        disabled={i === fp.length - 1}
                        className="mr-0.5 px-1"
                      >
                        ↓
                      </ScreenBtn>
                      <ScreenBtn
                        onClick={() => remove(i)}
                        ariaLabel={`Delete ${l.wp.id}`}
                        className="px-1 text-warning"
                      >
                        ✕
                      </ScreenBtn>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      <p className="border-t border-white/10 px-2 py-1 text-[9.5px] leading-snug text-white/45">
        <span className="text-cyan">Load into autopilot NAV:</span> set CDI to GPS, then press NAV
        on the autopilot. The AP flies the magenta leg and sequences automatically.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------- D→

function DirectToPage({
  s,
  engine,
  onDone,
}: {
  s: SimSnapshot;
  engine: SimEngine;
  onDone: () => void;
}) {
  const fp = s.gps.flightPlan;
  const def = s.gps.directTo ?? fp[s.gps.activeLeg] ?? null;
  const [sel, setSel] = useState<Waypoint | null>(def);
  const a = s.aircraft;
  const info = sel
    ? {
        brg: norm360(bearingDeg(a.lat, a.lon, sel.lat, sel.lon) - s.magVar),
        dis: distanceNm(a.lat, a.lon, sel.lat, sel.lon),
      }
    : null;
  return (
    <div className="space-y-2 p-2 font-mono">
      <IdentInput
        s={s}
        onSelect={(h) => setSel(hitToWaypoint(h))}
        placeholder="Direct-to identifier (e.g. KHAF)"
        autoFocus
      />
      <div className="rounded border border-magenta/30 bg-magenta/5 p-2">
        {sel && info ? (
          <>
            <div className="flex items-baseline justify-between">
              <span className="text-xl font-bold text-magenta">D→ {sel.id}</span>
              <span className="text-[10px] text-white/50">{sel.kind.toUpperCase()}</span>
            </div>
            <div className="truncate text-[10px] text-white/60">{sel.label ?? ""}</div>
            <div className="mt-1 grid grid-cols-2 gap-1 text-[12px]">
              <span>
                <span className="text-[9px] text-white/50">BRG </span>
                {pad3(info.brg)}°
              </span>
              <span>
                <span className="text-[9px] text-white/50">DIS </span>
                {info.dis.toFixed(1)}NM
              </span>
            </div>
          </>
        ) : (
          <span className="text-[11px] text-white/50">
            Enter an identifier or pick a flight-plan waypoint below.
          </span>
        )}
      </div>
      <div className="flex gap-1.5">
        <ScreenBtn
          tone="magenta"
          className="flex-1 py-1.5 text-[11px]"
          disabled={!sel}
          onClick={() => {
            if (!sel) return;
            engine.directTo(sel);
            onDone();
          }}
        >
          ACTIVATE D→
        </ScreenBtn>
        {s.gps.directTo ? (
          <ScreenBtn className="py-1.5 text-[11px]" onClick={() => engine.cancelDirectTo()}>
            CANCEL D→
          </ScreenBtn>
        ) : null}
      </div>
      {fp.length > 0 ? (
        <div>
          <div className="mb-0.5 text-[9px] text-white/45">FLIGHT PLAN WAYPOINTS</div>
          <div className="flex flex-wrap gap-1">
            {fp.map((w, i) => (
              <ScreenBtn
                key={`${w.id}${i}`}
                onClick={() => setSel(w)}
                tone={sel?.id === w.id ? "magenta" : "default"}
              >
                {w.id}
              </ScreenBtn>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------- NRST

function NrstPage({
  s,
  engine,
  onInfo,
  onMsg,
}: {
  s: SimSnapshot;
  engine: SimEngine;
  onInfo: (id: string) => void;
  onMsg: (m: string) => void;
}) {
  const list = nearestAirports(s.aircraft.lat, s.aircraft.lon, s.magVar, 8);
  return (
    <table className="w-full font-mono text-[11px]">
      <thead className="sticky top-0 bg-[#0b0d10] text-[9px] text-white/50">
        <tr>
          <th className="px-2 py-1 text-left font-normal">APT</th>
          <th className="px-1 py-1 text-right font-normal">BRG</th>
          <th className="px-1 py-1 text-right font-normal">DIS</th>
          <th className="px-1 py-1 text-right font-normal">RWY</th>
          <th className="px-1 py-1 text-right font-normal">TWR/CTAF</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {list.map(({ airport: ap, distNm, brgMag, longestFt }) => {
          const tw = freqOf(ap, "TWR") ?? freqOf(ap, "CTAF") ?? freqOf(ap, "UNICOM");
          return (
            <tr key={ap.icao} className="border-t border-white/5">
              <td className="px-2 py-1">
                <button
                  type="button"
                  className="text-left"
                  onClick={() => onInfo(ap.icao)}
                  title="Airport information"
                >
                  <span className="font-semibold text-cyan underline-offset-2 hover:underline">
                    {ap.icao}
                  </span>
                  <span className="block max-w-[9rem] truncate text-[9px] text-white/45">
                    {ap.name}
                  </span>
                </button>
              </td>
              <td className="px-1 py-1 text-right tabular">{pad3(brgMag)}°</td>
              <td className="px-1 py-1 text-right tabular">{distNm.toFixed(1)}</td>
              <td className="px-1 py-1 text-right text-white/80 tabular">{longestFt}</td>
              <td className="px-1 py-1 text-right text-ok tabular">
                {tw ? (
                  <button
                    type="button"
                    className="hover:underline"
                    title={`Load ${tw.name} into COM1 standby`}
                    onClick={() => {
                      engine.setRadios({
                        com1: { ...engine.getSnapshot().radios.com1, standby: tw.mhz },
                      });
                      onMsg(`${ap.icao} ${tw.type} ${fmtCom(tw.mhz)} loaded into COM1 standby.`);
                    }}
                  >
                    {fmtCom(tw.mhz)}
                  </button>
                ) : (
                  "—"
                )}
              </td>
              <td className="px-1.5 py-1 text-right">
                <ScreenBtn
                  tone="magenta"
                  onClick={() => engine.directTo(waypointFromAirport(ap))}
                  title={`Direct-to ${ap.icao}`}
                >
                  D→
                </ScreenBtn>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// ---------------------------------------------------------------- WPT

function WptPage({
  s,
  engine,
  id,
  setId,
  onMsg,
}: {
  s: SimSnapshot;
  engine: SimEngine;
  id: string;
  setId: (id: string) => void;
  onMsg: (m: string) => void;
}) {
  const nearest =
    nearestAirports(s.aircraft.lat, s.aircraft.lon, s.magVar, 1)[0]?.airport.icao ?? "";
  const key = id || nearest;
  const hit =
    searchIdentifiers(key, { lat: s.aircraft.lat, lon: s.aircraft.lon }, 20).find(
      (h) => h.id === key,
    ) ?? null;
  const loadCom = (mhz: number, label: string) => {
    engine.setRadios({ com1: { ...engine.getSnapshot().radios.com1, standby: mhz } });
    onMsg(`${label} ${fmtCom(mhz)} → COM1 standby. Press ⇄ on the COM1 radio to make it active.`);
  };
  const loadNav = (mhz: number, label: string) => {
    engine.setRadios({ nav1: { ...engine.getSnapshot().radios.nav1, standby: mhz } });
    onMsg(`${label} ${fmtNav(mhz)} → NAV1 standby. Swap it to active and identify the Morse code.`);
  };
  return (
    <div className="space-y-2 p-2 font-mono text-[11px]">
      <IdentInput s={s} onSelect={(h) => setId(h.id)} placeholder="Airport or navaid identifier" />
      {!hit ? (
        <p className="text-white/50">Unknown identifier.</p>
      ) : hit.airport ? (
        <AirportInfo ap={hit.airport} s={s} engine={engine} loadCom={loadCom} loadNav={loadNav} />
      ) : hit.navaid ? (
        <div className="space-y-1.5 rounded border border-white/10 p-2">
          <div className="flex items-baseline justify-between">
            <span className="text-lg font-bold text-cyan">{hit.navaid.id}</span>
            <span className="text-[10px] text-white/50">{hit.navaid.type}</span>
          </div>
          <div className="text-white/70">{hit.navaid.name}</div>
          {hit.navaid.freq !== undefined ? (
            <div className="flex items-center justify-between">
              <span className="text-ok">
                {hit.navaid.type === "NDB" ? `${hit.navaid.freq} kHz` : fmtNav(hit.navaid.freq)}
              </span>
              {hit.navaid.type !== "NDB" ? (
                <ScreenBtn tone="ok" onClick={() => loadNav(hit.navaid!.freq!, hit.navaid!.id)}>
                  NAV1 STBY
                </ScreenBtn>
              ) : null}
            </div>
          ) : null}
          <ScreenBtn tone="magenta" onClick={() => engine.directTo(hitToWaypoint(hit))}>
            D→ {hit.navaid.id}
          </ScreenBtn>
        </div>
      ) : null}
    </div>
  );
}

function AirportInfo({
  ap,
  s,
  engine,
  loadCom,
  loadNav,
}: {
  ap: Airport;
  s: SimSnapshot;
  engine: SimEngine;
  loadCom: (m: number, l: string) => void;
  loadNav: (m: number, l: string) => void;
}) {
  const a = s.aircraft;
  return (
    <div className="space-y-2">
      <div className="rounded border border-white/10 p-2">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-lg font-bold text-cyan">{ap.icao}</span>
          <span className="text-[10px] text-white/50">
            ELEV {ap.elevationFt}FT · CLASS {ap.airspace}
          </span>
        </div>
        <div className="truncate text-white/70">{ap.name}</div>
        <div className="mt-0.5 flex items-center justify-between text-[10px] text-white/55">
          <span>
            BRG {pad3(norm360(bearingDeg(a.lat, a.lon, ap.lat, ap.lon) - s.magVar))}° ·{" "}
            {distanceNm(a.lat, a.lon, ap.lat, ap.lon).toFixed(1)}NM
          </span>
          <ScreenBtn tone="magenta" onClick={() => engine.directTo(waypointFromAirport(ap))}>
            D→
          </ScreenBtn>
        </div>
      </div>
      <div>
        <div className="mb-0.5 text-[9px] text-white/45">RUNWAYS</div>
        {ap.runways.map((r) => (
          <div
            key={r.name}
            className="flex flex-wrap items-center justify-between gap-1 border-t border-white/5 py-1"
          >
            <span className="text-white">
              {r.name}{" "}
              <span className="text-white/50">
                {r.lengthFt}×{r.widthFt} {r.surface}
              </span>
            </span>
            <span className="flex gap-1">
              {r.ends
                .filter((e) => e.ils)
                .map((e) => (
                  <ScreenBtn
                    key={e.id}
                    tone="ok"
                    onClick={() => loadNav(e.ils!.freq, `ILS ${e.id} ${e.ils!.ident}`)}
                    title={`ILS ${e.id} ${e.ils!.ident} — load into NAV1 standby`}
                  >
                    ILS{e.id} {fmtNav(e.ils!.freq)}
                  </ScreenBtn>
                ))}
            </span>
          </div>
        ))}
      </div>
      <div>
        <div className="mb-0.5 text-[9px] text-white/45">FREQUENCIES</div>
        {ap.frequencies.map((f) => (
          <div
            key={`${f.type}${f.mhz}`}
            className="flex items-center justify-between border-t border-white/5 py-1"
          >
            <span>
              <span className="inline-block w-10 text-white/55">{f.type}</span>
              <span className="text-white/75">{f.name}</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="text-ok tabular">{fmtCom(f.mhz)}</span>
              <ScreenBtn
                onClick={() => loadCom(f.mhz, `${ap.icao} ${f.type}`)}
                title="Load into COM1 standby"
              >
                COM1
              </ScreenBtn>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- PROC

function destinationAirport(s: SimSnapshot): Airport | undefined {
  if (s.gps.approach) {
    const a = getAirport(s.gps.approach.airport);
    if (a) return a;
  }
  const dto = s.gps.directTo;
  if (dto?.kind === "airport") return getAirport(dto.id);
  const last = [...s.gps.flightPlan].reverse().find((w) => w.kind === "airport");
  if (last) return getAirport(last.id);
  return nearestAirports(s.aircraft.lat, s.aircraft.lon, s.magVar, 1)[0]?.airport;
}

export function activateTrainingApproach(
  engine: SimEngine,
  ap: Airport,
  end: RunwayEnd,
  kind: "ILS" | "RNAV",
) {
  const wps = buildTrainingApproach(ap, end);
  const label =
    kind === "ILS" ? `ILS RWY ${end.id} (training)` : `RNAV (GPS) RWY ${end.id} (training)`;
  engine.activateApproach({ airport: ap.icao, runway: end.id, kind, label }, wps);
  if (kind === "ILS" && end.ils) {
    const r = engine.getSnapshot().radios;
    engine.setRadios({
      nav1: {
        active: end.ils.freq,
        standby: r.nav1.active,
        obs: Math.round(magneticHeading(ap, end.trueHeading)),
      },
    });
  }
  return { label, wps };
}

function ProcPage({
  s,
  engine,
  onMsg,
}: {
  s: SimSnapshot;
  engine: SimEngine;
  onMsg: (m: string) => void;
}) {
  const [apId, setApId] = useState<string>("");
  const ap = (apId ? getAirport(apId) : undefined) ?? destinationAirport(s);
  const loaded =
    s.gps.approach && s.gps.flightPlan.some((w) => w.kind === "runway") ? s.gps.approach : null;
  const approachWps = loaded
    ? s.gps.flightPlan.filter((w) => w.kind === "fix" || w.kind === "runway")
    : [];
  return (
    <div className="space-y-2 p-2 font-mono text-[11px]">
      <div className="rounded border border-caution/50 bg-caution/10 px-2 py-1 text-[10px] font-bold text-caution">
        TRAINING PROCEDURE — not the published IAP. Simulator-generated from runway geometry.
      </div>
      <IdentInput
        s={s}
        onSelect={(h) => setApId(h.id)}
        placeholder="Airport (default: destination)"
        airportsOnly
      />
      {loaded ? (
        <div className="rounded border border-magenta/30 bg-magenta/5 p-2">
          <div className="flex items-center justify-between">
            <span className="font-bold text-magenta">{loaded.label}</span>
            <span className="text-[9px] text-white/50">{loaded.airport}</span>
          </div>
          <div className="mt-1 flex flex-wrap gap-1">
            {approachWps.map((w) => (
              <ScreenBtn
                key={w.id}
                tone="magenta"
                onClick={() => engine.directTo(w)}
                title={`Direct-to ${w.id}${w.altFt !== undefined ? ` (cross at ${w.altFt} ft)` : ""}`}
              >
                D→ {w.label ?? w.id}{" "}
                {w.altFt !== undefined ? <span className="text-cyan">{w.altFt}</span> : null}
              </ScreenBtn>
            ))}
          </div>
          {loaded.kind === "ILS" ? (
            <p className="mt-1 text-[10px] text-white/55">
              NAV1 tuned {fmtNav(s.radios.nav1.active)}{" "}
              {s.nav.nav1.valid ? (
                <span className="text-ok">{s.nav.nav1.ident}</span>
              ) : (
                "(not yet receivable)"
              )}{" "}
              · CRS {pad3(s.radios.nav1.obs)}°. Switch CDI to <span className="text-ok">VLOC</span>{" "}
              and press APR to arm LOC/GS.
            </p>
          ) : (
            <p className="mt-1 text-[10px] text-white/55">
              Keep CDI on GPS. Press APR to arm; the glidepath (V) appears within 2 NM of the FAF.
            </p>
          )}
        </div>
      ) : null}
      {ap ? (
        <div>
          <div className="mb-1 flex items-baseline justify-between">
            <span className="font-bold text-cyan">{ap.icao}</span>
            <span className="truncate text-[9px] text-white/45">{ap.name}</span>
          </div>
          {allRunwayEnds(ap).map(({ end }) => (
            <div
              key={end.id}
              className="flex flex-wrap items-center justify-between gap-1 border-t border-white/5 py-1"
            >
              <span className="text-white">
                RWY {end.id}{" "}
                <span className="text-white/45">{pad3(magneticHeading(ap, end.trueHeading))}°</span>
              </span>
              <span className="flex gap-1">
                <ScreenBtn
                  tone="magenta"
                  onClick={() => {
                    const r = activateTrainingApproach(engine, ap, end, "RNAV");
                    onMsg(`${r.label} activated. Training procedure — not the published IAP.`);
                  }}
                >
                  RNAV
                </ScreenBtn>
                {end.ils ? (
                  <ScreenBtn
                    tone="ok"
                    onClick={() => {
                      const r = activateTrainingApproach(engine, ap, end, "ILS");
                      onMsg(
                        `${r.label} activated · NAV1 ${fmtNav(end.ils!.freq)} ${end.ils!.ident}. Training procedure — not the published IAP.`,
                      );
                    }}
                  >
                    ILS {fmtNav(end.ils.freq)}
                  </ScreenBtn>
                ) : null}
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
