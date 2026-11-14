import { createFileRoute, Link } from "@tanstack/react-router";
import { Fragment, useMemo, useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Download,
  FileJson,
  Notebook,
  PlaneTakeoff,
  RotateCcw,
  Search,
  Trash2,
  XCircle,
} from "lucide-react";

import {
  EmptyState,
  Notice,
  Page,
  PageHeader,
  Pill,
  Stat,
  formatDate,
  formatDateTime,
  formatDuration,
} from "@/components/app/page";
import { ConfirmAction, downloadFile } from "@/components/app/confirm";
import { HrefLink, buildHref } from "@/components/app/xlink";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AIRCRAFT_PERF, getPerf } from "@/lib/data/aircraft-perf";
import { actions, useHydrated, useStore, type FlightLog } from "@/lib/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/logbook")({
  head: () => ({
    meta: [
      { title: "Flight Logbook — TeachX" },
      {
        name: "description",
        content:
          "Your simulated flight history: scenarios, maneuvers, objectives, scores and instructor feedback. Export to CSV or JSON. Simulated time is not loggable flight time.",
      },
    ],
  }),
  component: Logbook,
});

const KIND_LABEL: Record<FlightLog["kind"], string> = {
  free: "Free flight",
  vfr: "VFR training",
  ifr: "IFR training",
  emergency: "Emergency",
  checkride: "Checkride",
  avionics: "Avionics",
};

function scoreTone(s: number) {
  return s >= 80 ? "text-ok" : s >= 60 ? "text-primary" : s >= 40 ? "text-caution" : "text-warning";
}

function csvEscape(v: string | number | boolean) {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function Logbook() {
  const hydrated = useHydrated();
  const flights = useStore((s) => s.flights);
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<FlightLog["kind"] | "all">("all");
  const [rules, setRules] = useState<"all" | "VFR" | "IFR">("all");
  const [aircraft, setAircraft] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  const list = useMemo(() => {
    const k = q.trim().toLowerCase();
    const fromT = from ? new Date(`${from}T00:00:00`).getTime() : -Infinity;
    const toT = to ? new Date(`${to}T23:59:59`).getTime() : Infinity;
    return [...flights]
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .filter((f) => {
        if (kind !== "all" && f.kind !== kind) return false;
        if (rules !== "all" && f.rules !== rules) return false;
        if (aircraft !== "all" && f.aircraftId !== aircraft) return false;
        const t = new Date(f.date).getTime();
        if (t < fromT || t > toT) return false;
        if (!k) return true;
        return [
          f.scenarioTitle,
          f.scenarioId,
          f.departure,
          f.destination,
          getPerf(f.aircraftId).shortName,
          ...f.maneuvers,
        ]
          .join(" ")
          .toLowerCase()
          .includes(k);
      });
  }, [flights, q, kind, rules, aircraft, from, to]);

  const totals = useMemo(
    () => ({
      sec: list.reduce((s, f) => s + f.durationSec, 0),
      landings: list.reduce((s, f) => s + f.landings, 0),
      approaches: list.reduce((s, f) => s + f.approaches, 0),
      night: list.filter((f) => f.night).reduce((s, f) => s + f.durationSec, 0),
      ifr: list.filter((f) => f.rules === "IFR").reduce((s, f) => s + f.durationSec, 0),
      avg: list.length ? list.reduce((s, f) => s + f.score, 0) / list.length : 0,
    }),
    [list],
  );

  const filtered = q || kind !== "all" || rules !== "all" || aircraft !== "all" || from || to;
  const usedAircraft = useMemo(
    () => AIRCRAFT_PERF.filter((p) => flights.some((f) => f.aircraftId === p.id)),
    [flights],
  );

  const exportCsv = () => {
    const header = [
      "date",
      "aircraft",
      "departure",
      "destination",
      "duration_hr",
      "kind",
      "rules",
      "scenario_id",
      "scenario",
      "landings",
      "approaches",
      "night",
      "score",
      "maneuvers",
      "objectives_met",
      "objectives_total",
      "note",
    ];
    const rows = list.map((f) => [
      f.date,
      getPerf(f.aircraftId).shortName,
      f.departure,
      f.destination,
      (f.durationSec / 3600).toFixed(2),
      f.kind,
      f.rules,
      f.scenarioId,
      f.scenarioTitle,
      f.landings,
      f.approaches,
      f.night,
      Math.round(f.score),
      f.maneuvers.join("; "),
      f.objectives.filter((o) => o.met).length,
      f.objectives.length,
      "SIMULATED - not loggable under 14 CFR 61.51",
    ]);
    downloadFile(
      `teachx-logbook-${new Date().toISOString().slice(0, 10)}.csv`,
      [header, ...rows].map((r) => r.map(csvEscape).join(",")).join("\n"),
      "text/csv",
    );
  };
  const exportJson = () => {
    downloadFile(
      `teachx-logbook-${new Date().toISOString().slice(0, 10)}.json`,
      JSON.stringify(
        {
          notice:
            "TeachX simulated training flights. Simulated time is not loggable flight time under 14 CFR 61.51.",
          exportedAt: new Date().toISOString(),
          flights: list,
        },
        null,
        2,
      ),
      "application/json",
    );
  };

  return (
    <Page wide>
      <PageHeader
        eyebrow="Overview"
        icon={Notebook}
        title="Flight Logbook"
        description="Every simulator flight you complete is recorded here with its maneuvers, objectives, score and debrief."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={exportCsv} disabled={!list.length}>
              <Download className="size-4" /> CSV
            </Button>
            <Button variant="outline" size="sm" onClick={exportJson} disabled={!list.length}>
              <FileJson className="size-4" /> JSON
            </Button>
            <Button size="sm" asChild>
              <Link to="/simulator">
                <PlaneTakeoff className="size-4" /> New flight
              </Link>
            </Button>
          </>
        }
      />

      <Notice tone="caution" title="Simulated time is not loggable flight time." className="mb-6">
        Under 14 CFR 61.51, time in a personal-computer simulator cannot be logged toward a
        certificate or rating. Training time may only be credited when it is received in an
        FAA-approved aviation training device (ATD), flight training device (FTD) or full flight
        simulator, with an authorized instructor, within the limits of the applicable regulations.
        TeachX is not an FAA-approved training device. This logbook is a study record only.
      </Notice>

      {!hydrated ? null : flights.length === 0 ? (
        <EmptyState
          icon={Notebook}
          title="Your logbook is empty"
          description="Complete a simulator scenario — a traffic pattern, an ILS approach or an engine failure — and it will appear here with its score, objectives and instructor feedback."
          action={{ to: "/simulator", label: "Open the flight simulator" }}
        />
      ) : (
        <>
          <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <Stat
              label="Flights"
              value={list.length}
              sub={filtered ? `of ${flights.length} total` : "all time"}
            />
            <Stat
              label="Sim time"
              value={formatDuration(totals.sec)}
              sub="h:mm:ss (not loggable)"
            />
            <Stat label="Landings" value={totals.landings} />
            <Stat label="Approaches" value={totals.approaches} />
            <Stat
              label="IFR / night"
              value={`${(totals.ifr / 3600).toFixed(1)} / ${(totals.night / 3600).toFixed(1)}`}
              sub="hours"
            />
            <Stat
              label="Avg score"
              value={list.length ? Math.round(totals.avg) : "—"}
              tone={totals.avg >= 80 ? "ok" : totals.avg >= 60 ? "primary" : "caution"}
            />
          </div>

          <div className="mb-3 flex flex-col gap-2 lg:flex-row lg:flex-wrap lg:items-end">
            <div className="relative lg:w-64">
              <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Scenario, airport, maneuver…"
                className="pl-8"
                aria-label="Search flights"
              />
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5 lg:flex">
              <Select value={kind} onValueChange={(v) => setKind(v as FlightLog["kind"] | "all")}>
                <SelectTrigger className="lg:w-40" aria-label="Kind">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All kinds</SelectItem>
                  {(Object.keys(KIND_LABEL) as FlightLog["kind"][]).map((k) => (
                    <SelectItem key={k} value={k}>
                      {KIND_LABEL[k]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={rules} onValueChange={(v) => setRules(v as "all" | "VFR" | "IFR")}>
                <SelectTrigger className="lg:w-32" aria-label="Flight rules">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">VFR & IFR</SelectItem>
                  <SelectItem value="VFR">VFR</SelectItem>
                  <SelectItem value="IFR">IFR</SelectItem>
                </SelectContent>
              </Select>
              <Select value={aircraft} onValueChange={setAircraft}>
                <SelectTrigger className="lg:w-40" aria-label="Aircraft">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All aircraft</SelectItem>
                  {usedAircraft.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.shortName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                aria-label="From date"
                className="lg:w-40"
              />
              <Input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                aria-label="To date"
                className="lg:w-40"
              />
            </div>
            {filtered ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setQ("");
                  setKind("all");
                  setRules("all");
                  setAircraft("all");
                  setFrom("");
                  setTo("");
                }}
              >
                <RotateCcw className="size-3.5" /> Clear
              </Button>
            ) : null}
          </div>

          {list.length === 0 ? (
            <EmptyState
              icon={Search}
              title="No flights match these filters"
              description="Clear or adjust the filters to see more of your logbook."
            />
          ) : (
            <div className="panel overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm">
                <thead>
                  <tr className="border-b bg-muted/40 text-left">
                    <th className="w-8" />
                    {[
                      "Date",
                      "Aircraft",
                      "From",
                      "To",
                      "Duration",
                      "Kind",
                      "Rules",
                      "Ldg",
                      "App",
                      "Score",
                    ].map((h) => (
                      <th key={h} className="label-caps px-2 py-2">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {list.map((f) => {
                    const isOpen = open === f.id;
                    return (
                      <Fragment key={f.id}>
                        <tr
                          className={cn(
                            "cursor-pointer border-b transition-colors hover:bg-accent/30",
                            isOpen && "bg-accent/30",
                          )}
                          onClick={() => setOpen(isOpen ? null : f.id)}
                        >
                          <td className="pl-3">
                            <button
                              type="button"
                              aria-expanded={isOpen}
                              aria-label={isOpen ? "Collapse entry" : "Expand entry"}
                              className="text-muted-foreground"
                            >
                              {isOpen ? (
                                <ChevronDown className="size-4" />
                              ) : (
                                <ChevronRight className="size-4" />
                              )}
                            </button>
                          </td>
                          <td className="px-2 py-2">
                            <div className="text-xs">{formatDate(f.date)}</div>
                            <div className="max-w-[220px] truncate text-[11px] text-muted-foreground">
                              {f.scenarioTitle}
                            </div>
                          </td>
                          <td className="px-2 py-2 text-xs">{getPerf(f.aircraftId).shortName}</td>
                          <td className="px-2 py-2 font-mono text-xs">{f.departure}</td>
                          <td className="px-2 py-2 font-mono text-xs">{f.destination}</td>
                          <td className="px-2 py-2 font-mono text-xs tabular">
                            {formatDuration(f.durationSec)}
                          </td>
                          <td className="px-2 py-2 text-xs">{KIND_LABEL[f.kind]}</td>
                          <td className="px-2 py-2">
                            <Pill tone={f.rules === "VFR" ? "ok" : "primary"}>{f.rules}</Pill>
                            {f.night ? <Pill className="ml-1">Night</Pill> : null}
                          </td>
                          <td className="px-2 py-2 font-mono text-xs">{f.landings}</td>
                          <td className="px-2 py-2 font-mono text-xs">{f.approaches}</td>
                          <td
                            className={cn(
                              "px-2 py-2 font-mono font-semibold tabular",
                              scoreTone(f.score),
                            )}
                          >
                            {Math.round(f.score)}
                          </td>
                        </tr>
                        {isOpen ? (
                          <tr className="border-b bg-muted/20">
                            <td colSpan={11} className="px-4 py-4">
                              <EntryDetail f={f} onDeleted={() => setOpen(null)} />
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t bg-muted/40 font-semibold">
                    <td />
                    <td className="px-2 py-2 text-xs" colSpan={4}>
                      Totals ({list.length} flights)
                    </td>
                    <td className="px-2 py-2 font-mono text-xs">{formatDuration(totals.sec)}</td>
                    <td colSpan={2} />
                    <td className="px-2 py-2 font-mono text-xs">{totals.landings}</td>
                    <td className="px-2 py-2 font-mono text-xs">{totals.approaches}</td>
                    <td className={cn("px-2 py-2 font-mono text-xs", scoreTone(totals.avg))}>
                      {Math.round(totals.avg)} avg
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </>
      )}
    </Page>
  );
}

function EntryDetail({ f, onDeleted }: { f: FlightLog; onDeleted: () => void }) {
  const met = f.objectives.filter((o) => o.met).length;
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div>
        <p className="label-caps mb-1.5">Flight</p>
        <dl className="space-y-1 text-xs">
          <Row k="Scenario" v={`${f.scenarioTitle} (${f.scenarioId})`} />
          <Row k="Logged" v={formatDateTime(f.date)} />
          <Row k="Aircraft" v={getPerf(f.aircraftId).shortName} />
          <Row k="Route" v={`${f.departure} → ${f.destination}`} />
          <Row k="Duration" v={formatDuration(f.durationSec)} />
          <Row k="Conditions" v={`${f.rules}${f.night ? ", night" : ", day"}`} />
          {f.checkrideId ? <Row k="Checkride" v="Part of a mock checkride" /> : null}
        </dl>
        {f.maneuvers.length ? (
          <>
            <p className="label-caps mt-3 mb-1.5">Maneuvers</p>
            <div className="flex flex-wrap gap-1">
              {f.maneuvers.map((m) => (
                <Pill key={m} tone="cyan">
                  {m}
                </Pill>
              ))}
            </div>
          </>
        ) : null}
      </div>
      <div>
        <p className="label-caps mb-1.5">
          Objectives — {met}/{f.objectives.length} met
        </p>
        {f.objectives.length === 0 ? (
          <p className="text-xs text-muted-foreground">No objectives recorded for this flight.</p>
        ) : (
          <ul className="space-y-1.5 text-xs">
            {f.objectives.map((o, i) => (
              <li key={i} className="flex gap-2">
                {o.met ? (
                  <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-ok" />
                ) : (
                  <XCircle className="mt-0.5 size-3.5 shrink-0 text-warning" />
                )}
                <span>
                  {o.text}
                  {o.detail ? (
                    <span className="block text-muted-foreground">{o.detail}</span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="flex flex-col">
        <p className="label-caps mb-1.5">Instructor feedback</p>
        {f.feedback.length === 0 ? (
          <p className="text-xs text-muted-foreground">No feedback recorded.</p>
        ) : (
          <ul className="space-y-1.5 text-xs">
            {f.feedback.map((t, i) => (
              <li key={i} className="border-l-2 border-primary/50 pl-2">
                {t}
              </li>
            ))}
          </ul>
        )}
        <div className="mt-auto flex flex-wrap gap-2 pt-4">
          <Button size="sm" asChild>
            <HrefLink
              href={buildHref("/simulator", {
                scenario: f.scenarioId,
                aircraft: f.aircraftId,
                airport: f.departure,
              })}
            >
              <RotateCcw className="size-4" /> Review training
            </HrefLink>
          </Button>
          <ConfirmAction
            title="Delete this flight?"
            description="The flight will be permanently removed from your logbook and statistics. Achievements already unlocked are kept."
            confirmLabel="Delete flight"
            onConfirm={() => {
              actions.deleteFlight(f.id);
              onDeleted();
            }}
            trigger={
              <Button size="sm" variant="outline" className="text-warning hover:text-warning">
                <Trash2 className="size-4" /> Delete
              </Button>
            }
          />
        </div>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex gap-2">
      <dt className="w-20 shrink-0 text-muted-foreground">{k}</dt>
      <dd>{v}</dd>
    </div>
  );
}
