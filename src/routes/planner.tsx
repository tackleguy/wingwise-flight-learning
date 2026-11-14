import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  ClipboardList,
  CloudSun,
  FileWarning,
  FolderOpen,
  MessageSquareText,
  Navigation2,
  Plus,
  PlaneTakeoff,
  Printer,
  Route as RouteIcon,
  Save,
  Trash2,
  X,
  XCircle,
} from "lucide-react";

import {
  EmptyState,
  Notice,
  Page,
  PageHeader,
  Panel,
  Pill,
  Section,
  formatDateTime,
} from "@/components/app/page";
import { HrefLink, buildHref } from "@/components/app/xlink";
import { ConfirmAction } from "@/components/app/confirm";
import { BriefingExercise, NotamExercise } from "@/components/planner/exercises";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AIRCRAFT_PERF, getPerf } from "@/lib/data/aircraft-perf";
import { AIRPORTS, AIRPORT_DATA_NOTICE, NAVAIDS, getAirport } from "@/lib/data/airports";
import {
  fmtHdg,
  isIfrCapable,
  longestRunwayFt,
  nearestAirports,
  resolvePoint,
} from "@/lib/data/airport-utils";
import { windTriangle } from "@/lib/geo";
import {
  checkCruiseAltitude,
  computePlan,
  fuelRequirement,
  fmtMin,
  fmtZulu,
  pointAlongRoute,
  type PlanResult,
} from "@/lib/planning";
import { actions, useHydrated, useStore, type SavedFlightPlan } from "@/lib/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/planner")({
  validateSearch: (s: Record<string, unknown>): { from?: string } => {
    const f = s["from"];
    return typeof f === "string" && f ? { from: f.toUpperCase() } : {};
  },
  head: () => ({
    meta: [
      { title: "Flight Planner — TeachX" },
      {
        name: "description",
        content:
          "Plan VFR and IFR training flights: nav log with wind correction, fuel reserves, cruising-altitude rules, alternates, diversions, briefing and NOTAM exercises.",
      },
    ],
  }),
  component: Planner,
});

function toLocalInput(d: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

const sortedAirports = [...AIRPORTS].sort((a, b) => a.icao.localeCompare(b.icao));

function Planner() {
  const search = Route.useSearch();
  const hydrated = useHydrated();
  const settingsAircraft = useStore((s) => s.settings.preferredAircraft);
  const homeAirport = useStore((s) => s.profile?.homeAirport);
  const savedPlans = useStore((s) => s.flightPlans);

  const initialDep =
    search.from && getAirport(search.from) ? (getAirport(search.from)?.icao ?? "KPAO") : "KPAO";
  const [name, setName] = useState("");
  const [rules, setRules] = useState<"VFR" | "IFR">("VFR");
  const [dep, setDep] = useState(initialDep);
  const [dst, setDst] = useState(initialDep === "KMRY" ? "KPAO" : "KMRY");
  const [alt, setAlt] = useState("");
  const [aircraftId, setAircraftId] = useState("c172");
  const perf = getPerf(aircraftId);
  const [cruiseAlt, setCruiseAlt] = useState(String(5500));
  const [tas, setTas] = useState(String(perf.cruiseKtas));
  const [burn, setBurn] = useState(String(perf.fuelBurnCruiseGph));
  const [windDir, setWindDir] = useState("300");
  const [windKt, setWindKt] = useState("15");
  const [fuel, setFuel] = useState(String(perf.usableFuelGal));
  const [taxi, setTaxi] = useState("1.3");
  const [depTime, setDepTime] = useState("");
  const [night, setNight] = useState(false);
  const [route, setRoute] = useState<string[]>([]);
  const [wpInput, setWpInput] = useState("");
  const [wpError, setWpError] = useState("");
  const [savedId, setSavedId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [divFrac, setDivFrac] = useState(50);
  // IFR alternate checklist (1-2-3 rule)
  const [ceil2000, setCeil2000] = useState(false);
  const [vis3, setVis3] = useState(false);
  const [altMinsOk, setAltMinsOk] = useState(false);

  // Client-only defaults (avoid SSR/hydration mismatch).
  useEffect(() => {
    const d = new Date();
    d.setMinutes(0, 0, 0);
    d.setHours(d.getHours() + 1);
    setDepTime(toLocalInput(d));
  }, []);
  useEffect(() => {
    if (!hydrated) return;
    if (AIRCRAFT_PERF.some((p) => p.id === settingsAircraft)) applyAircraft(settingsAircraft);
    if (!search.from && homeAirport && getAirport(homeAirport))
      setDep(getAirport(homeAirport)?.icao ?? "KPAO");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  function applyAircraft(id: string) {
    const p = getPerf(id);
    setAircraftId(id);
    setTas(String(p.cruiseKtas));
    setBurn(String(p.fuelBurnCruiseGph));
    setFuel(String(p.usableFuelGal));
    setTaxi(String(Math.round(p.fuelBurnFullGph * 0.1 * 10) / 10));
    if (p.cruiseAltFt > 18000) {
      setRules("IFR");
      setCruiseAlt(String(p.cruiseAltFt));
    }
    setDirty(true);
  }

  const mark =
    <T,>(fn: (v: T) => void) =>
    (v: T) => {
      fn(v);
      setDirty(true);
    };

  const tasN = Number(tas) || 0;
  const burnN = Number(burn) || 0;
  const windDirN = Number(windDir) || 0;
  const windKtN = Number(windKt) || 0;
  const fuelN = Number(fuel) || 0;
  const altN = Number(cruiseAlt) || 0;
  const depIso = depTime ? new Date(depTime).toISOString() : undefined;

  const plan: PlanResult = useMemo(
    () =>
      computePlan({
        points: [dep, ...route, dst],
        tas: tasN,
        windFrom: windDirN,
        windKt: windKtN,
        burnGph: burnN,
        departureTime: depIso,
        taxiGal: Number(taxi) || 0,
      }),
    [dep, route, dst, tasN, windDirN, windKtN, burnN, depIso, taxi],
  );
  const altPlan = useMemo(
    () =>
      alt
        ? computePlan({
            points: [dst, alt],
            tas: tasN,
            windFrom: windDirN,
            windKt: windKtN,
            burnGph: burnN,
          })
        : undefined,
    [alt, dst, tasN, windDirN, windKtN, burnN],
  );

  const depAp = getAirport(dep);
  const dstAp = getAirport(dst);
  const altAp = alt ? getAirport(alt) : undefined;
  const sameDepDst = dep === dst;
  const firstLeg = plan.legs[0];
  const altChecks = plan.legs.map((l) =>
    checkCruiseAltitude(
      rules,
      altN,
      l.magCourse,
      Math.max(depAp?.elevationFt ?? 0, dstAp?.elevationFt ?? 0),
    ),
  );
  const altitudeOk = altChecks.every((c) => c.ok);
  const destHasIap = dstAp ? isIfrCapable(dstAp) : false;
  const alternateRequired = rules === "IFR" && !(destHasIap && ceil2000 && vis3);
  const fuelChk = fuelRequirement({
    rules,
    night,
    tripGal: plan.totalFuel,
    alternateGal: altPlan?.totalFuel ?? 0,
    burnGph: burnN,
    onBoardGal: fuelN,
    alternateRequired,
  });
  const impossible = plan.legs.some((l) => l.impossible);
  const overCapacity = fuelN > perf.usableFuelGal + 0.01;
  const aboveCeiling = altN > perf.serviceCeilingFt;
  const missingAlternate = rules === "IFR" && alternateRequired && !altAp;

  const issues: string[] = [];
  if (sameDepDst && route.length === 0)
    issues.push(
      "Departure and destination are the same — add waypoints for a local flight or choose a different destination.",
    );
  if (impossible)
    issues.push("Wind exceeds true airspeed on at least one leg — no wind-correction solution.");
  if (!fuelChk.ok)
    issues.push(
      `Fuel on board is ${Math.abs(fuelChk.marginGal).toFixed(1)} gal short of the legal minimum.`,
    );
  if (overCapacity)
    issues.push(
      `Fuel on board exceeds the ${perf.shortName}'s usable capacity (${perf.usableFuelGal} gal).`,
    );
  if (aboveCeiling)
    issues.push(
      `Cruise altitude is above the ${perf.shortName}'s service ceiling (${perf.serviceCeilingFt.toLocaleString()} ft).`,
    );
  if (!altitudeOk)
    issues.push(
      "Cruise altitude does not match the cruising-altitude rule for every leg (see below).",
    );
  if (missingAlternate)
    issues.push("IFR: an alternate is required by the 1-2-3 rule — select one.");
  if (rules === "VFR" && altN >= 18000)
    issues.push("VFR flight is not permitted at or above 18,000 ft MSL (Class A).");

  const addWaypoint = () => {
    const p = resolvePoint(wpInput);
    if (!p) {
      setWpError(`"${wpInput.trim().toUpperCase()}" is not a known airport, navaid or "lat,lon".`);
      return;
    }
    setRoute((r) => [...r, p.id]);
    setWpInput("");
    setWpError("");
    setDirty(true);
  };

  const save = () => {
    const id = actions.saveFlightPlan({
      name: name.trim() || `${dep} → ${dst} (${rules})`,
      rules,
      aircraftId,
      departure: dep,
      destination: dst,
      alternate: alt,
      route,
      cruiseAltFt: altN,
      cruiseKtas: tasN,
      windDir: windDirN,
      windKt: windKtN,
      fuelGal: fuelN,
      departureTime: depIso ?? new Date().toISOString(),
    });
    setSavedId(id);
    setDirty(false);
  };

  const load = (p: SavedFlightPlan) => {
    setName(p.name);
    setRules(p.rules);
    setDep(p.departure);
    setDst(p.destination);
    setAlt(p.alternate);
    setAircraftId(p.aircraftId);
    const pf = getPerf(p.aircraftId);
    setBurn(String(pf.fuelBurnCruiseGph));
    setTaxi(String(Math.round(pf.fuelBurnFullGph * 0.1 * 10) / 10));
    setRoute(p.route);
    setCruiseAlt(String(p.cruiseAltFt));
    setTas(String(p.cruiseKtas));
    setWindDir(String(p.windDir));
    setWindKt(String(p.windKt));
    setFuel(String(p.fuelGal));
    const d = new Date(p.departureTime);
    if (!Number.isNaN(d.getTime())) setDepTime(toLocalInput(d));
    setSavedId(p.id);
    setDirty(false);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const div = pointAlongRoute(plan, divFrac / 100);
  const divLeg = div ? plan.legs[div.legIndex] : undefined;
  const diversions = div ? nearestAirports(div.lat, div.lon, { limit: 5 }) : [];

  const savedPlan = savedId ? savedPlans.find((p) => p.id === savedId) : undefined;

  return (
    <Page wide>
      <style>{`@media print { body * { visibility: hidden !important; } #teachx-navlog, #teachx-navlog * { visibility: visible !important; } #teachx-navlog { position: absolute; left: 0; top: 0; width: 100%; color: #000 !important; background: #fff !important; } #teachx-navlog .no-print { display: none !important; } #teachx-navlog td, #teachx-navlog th { color: #000 !important; border-color: #999 !important; } }`}</style>
      <PageHeader
        eyebrow="Train"
        icon={RouteIcon}
        title="Flight Planner"
        description="Build a VFR or IFR nav log with wind correction, magnetic headings, ETEs, fuel reserves and the cruising-altitude rules — then fly it in the simulator or request a clearance from AI ATC."
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => typeof window !== "undefined" && window.print()}
              disabled={plan.legs.length === 0}
            >
              <Printer className="size-4" /> Print nav log
            </Button>
            <Button
              size="sm"
              onClick={save}
              disabled={!hydrated || plan.legs.length === 0 || plan.unresolved.length > 0}
            >
              <Save className="size-4" /> {savedId && !dirty ? "Saved" : "Save plan"}
            </Button>
          </>
        }
      />

      <Notice
        tone="caution"
        className="mb-5"
        title="Training tool — not for real-world flight planning."
      >
        Calculations use a single wind, great-circle legs and the simulator's educational
        performance numbers (no climb/descent allowances). Airport data:{" "}
        {AIRPORT_DATA_NOTICE.currency} {AIRPORT_DATA_NOTICE.disclaimer}
      </Notice>

      {savedPlan ? (
        <div className="mb-5 flex flex-col gap-3 rounded-md border border-ok/30 bg-ok/5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm">
            <CheckCircle2 className="mr-1.5 inline size-4 text-ok" />
            Saved as <span className="font-semibold">{savedPlan.name}</span>
            {dirty ? (
              <span className="ml-2 text-caution">
                — you have unsaved changes; save again to update the simulator/ATC version.
              </span>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" asChild>
              <HrefLink
                href={buildHref("/simulator", {
                  airport: savedPlan.departure,
                  dest: savedPlan.destination,
                  aircraft: savedPlan.aircraftId,
                  plan: savedPlan.id,
                  scenario: "free-flight",
                })}
              >
                <PlaneTakeoff className="size-4" /> Fly this plan in the simulator
              </HrefLink>
            </Button>
            <Button size="sm" variant="outline" asChild>
              <HrefLink href={buildHref("/ai-atc", { plan: savedPlan.id })}>
                <MessageSquareText className="size-4" /> Request clearance with AI ATC
              </HrefLink>
            </Button>
          </div>
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[400px_minmax(0,1fr)]">
        {/* ------------------------- Inputs ------------------------- */}
        <div className="space-y-4">
          <Panel title="Flight">
            <div className="space-y-3">
              <Field label="Plan name">
                <Input
                  value={name}
                  onChange={(e) => mark(setName)(e.target.value)}
                  placeholder={`${dep} → ${dst} (${rules})`}
                />
              </Field>
              <div
                className="grid grid-cols-2 gap-1 rounded-md border p-1"
                role="group"
                aria-label="Flight rules"
              >
                {(["VFR", "IFR"] as const).map((r) => (
                  <button
                    key={r}
                    type="button"
                    aria-pressed={rules === r}
                    onClick={() => mark(setRules)(r)}
                    className={cn(
                      "rounded py-1.5 text-sm font-semibold",
                      rules === r
                        ? r === "VFR"
                          ? "bg-ok/15 text-ok"
                          : "bg-primary/15 text-primary"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {r}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Departure">
                  <AirportSelect value={dep} onChange={mark(setDep)} />
                </Field>
                <Field label="Destination">
                  <AirportSelect value={dst} onChange={mark(setDst)} />
                </Field>
              </div>
              <Field
                label={`Alternate ${rules === "IFR" ? (alternateRequired ? "(required)" : "(not required)") : "(optional)"}`}
              >
                <AirportSelect value={alt} onChange={mark(setAlt)} allowNone exclude={dst} />
              </Field>
              <Field label="Aircraft">
                <Select value={aircraftId} onValueChange={applyAircraft}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {AIRCRAFT_PERF.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.shortName} — {p.cruiseKtas} KTAS, {p.fuelBurnCruiseGph} gph
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <div className="grid grid-cols-3 gap-2">
                <Field label="Cruise alt ft">
                  <Input
                    inputMode="numeric"
                    value={cruiseAlt}
                    onChange={(e) => mark(setCruiseAlt)(e.target.value.replace(/[^0-9]/g, ""))}
                    className="font-mono"
                  />
                </Field>
                <Field label="TAS kt">
                  <Input
                    inputMode="numeric"
                    value={tas}
                    onChange={(e) => mark(setTas)(e.target.value.replace(/[^0-9]/g, ""))}
                    className="font-mono"
                  />
                </Field>
                <Field label="Burn gph">
                  <Input
                    inputMode="decimal"
                    value={burn}
                    onChange={(e) => mark(setBurn)(e.target.value.replace(/[^0-9.]/g, ""))}
                    className="font-mono"
                  />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Wind from °T">
                  <Input
                    inputMode="numeric"
                    value={windDir}
                    onChange={(e) =>
                      mark(setWindDir)(e.target.value.replace(/[^0-9]/g, "").slice(0, 3))
                    }
                    className="font-mono"
                  />
                </Field>
                <Field label="Wind kt">
                  <Input
                    inputMode="numeric"
                    value={windKt}
                    onChange={(e) =>
                      mark(setWindKt)(e.target.value.replace(/[^0-9]/g, "").slice(0, 3))
                    }
                    className="font-mono"
                  />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Fuel on board gal">
                  <Input
                    inputMode="decimal"
                    value={fuel}
                    onChange={(e) => mark(setFuel)(e.target.value.replace(/[^0-9.]/g, ""))}
                    className="font-mono"
                  />
                </Field>
                <Field label="Taxi/T-O fuel gal">
                  <Input
                    inputMode="decimal"
                    value={taxi}
                    onChange={(e) => mark(setTaxi)(e.target.value.replace(/[^0-9.]/g, ""))}
                    className="font-mono"
                  />
                </Field>
              </div>
              <Field label="Departure time (local)">
                <Input
                  type="datetime-local"
                  value={depTime}
                  onChange={(e) => mark(setDepTime)(e.target.value)}
                  className="font-mono"
                />
              </Field>
              {depIso ? (
                <p className="-mt-2 text-[11px] text-muted-foreground">= {fmtZulu(depIso)} (UTC)</p>
              ) : null}
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={night}
                  onChange={(e) => mark(setNight)(e.target.checked)}
                  className="accent-[var(--color-primary)]"
                />
                Night flight {rules === "VFR" ? "(45-min VFR reserve)" : ""}
              </label>
            </div>
          </Panel>

          <Panel title="Route">
            <div className="flex flex-wrap items-center gap-1.5 text-sm">
              <Pill tone="ok">{dep}</Pill>
              {route.map((r, i) => (
                <span
                  key={`${r}-${i}`}
                  className="inline-flex items-center gap-0.5 rounded border bg-muted px-1.5 py-0.5 font-mono text-xs"
                >
                  {r}
                  <button
                    type="button"
                    aria-label={`Move ${r} earlier`}
                    disabled={i === 0}
                    onClick={() => mark(setRoute)(swap(route, i, i - 1))}
                    className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                  >
                    <ArrowUp className="size-3" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Move ${r} later`}
                    disabled={i === route.length - 1}
                    onClick={() => mark(setRoute)(swap(route, i, i + 1))}
                    className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                  >
                    <ArrowDown className="size-3" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Remove ${r}`}
                    onClick={() => mark(setRoute)(route.filter((_, j) => j !== i))}
                    className="text-muted-foreground hover:text-warning"
                  >
                    <X className="size-3" />
                  </button>
                </span>
              ))}
              <Pill tone="magenta">{dst}</Pill>
            </div>
            <form
              className="mt-3 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                addWaypoint();
              }}
            >
              <Input
                list="teachx-wpts"
                value={wpInput}
                onChange={(e) => setWpInput(e.target.value)}
                placeholder="Add waypoint: OSI, KHAF, 37.2,-122.0"
                className="font-mono"
                aria-label="Waypoint identifier"
              />
              <Button type="submit" variant="outline" disabled={!wpInput.trim()}>
                <Plus className="size-4" /> Add
              </Button>
            </form>
            <datalist id="teachx-wpts">
              {NAVAIDS.map((n) => (
                <option key={`n${n.id}`} value={n.id}>{`${n.name} ${n.type}`}</option>
              ))}
              {AIRPORTS.map((a) => (
                <option key={`a${a.icao}`} value={a.icao}>
                  {a.name}
                </option>
              ))}
            </datalist>
            {wpError ? (
              <p className="mt-1.5 text-xs text-warning">{wpError}</p>
            ) : (
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                Airport ICAO/IATA, navaid identifier, or latitude,longitude. Direct (great-circle)
                legs between points.
              </p>
            )}
          </Panel>
        </div>

        {/* ------------------------- Outputs ------------------------- */}
        <div className="min-w-0 space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <SummaryStat label="Distance" value={`${plan.totalNm.toFixed(1)} nm`} />
            <SummaryStat
              label="ETE"
              value={fmtMin(plan.totalMin)}
              sub={plan.legs.at(-1)?.eta ? `ETA ${fmtZulu(plan.legs.at(-1)?.eta)}` : undefined}
            />
            <SummaryStat
              label="Trip fuel"
              value={`${plan.totalFuel.toFixed(1)} gal`}
              sub={`incl. ${Number(taxi) || 0} gal taxi`}
            />
            <SummaryStat
              label="Fuel margin"
              value={`${fuelChk.marginGal >= 0 ? "+" : ""}${fuelChk.marginGal.toFixed(1)} gal`}
              tone={fuelChk.ok ? "ok" : "warning"}
              sub={`Required ${fuelChk.requiredGal.toFixed(1)} gal`}
            />
          </div>

          {issues.length ? (
            <div className="rounded-md border border-warning/30 bg-warning/5 px-4 py-3 text-sm">
              <div className="mb-1 flex items-center gap-1.5 font-semibold text-warning">
                <AlertTriangle className="size-4" /> Check these before you go
              </div>
              <ul className="list-disc space-y-0.5 pl-5 text-foreground/90">
                {issues.map((i) => (
                  <li key={i}>{i}</li>
                ))}
              </ul>
            </div>
          ) : plan.legs.length ? (
            <div className="flex items-center gap-2 rounded-md border border-ok/30 bg-ok/5 px-4 py-2.5 text-sm">
              <CheckCircle2 className="size-4 text-ok" /> Plan passes the fuel, altitude and route
              checks.
            </div>
          ) : null}

          <div id="teachx-navlog" className="panel overflow-hidden">
            <div className="flex items-center justify-between gap-2 border-b px-4 py-2.5">
              <div className="label-caps">
                Navigation log — {name.trim() || `${dep} → ${dst}`} · {rules} · {perf.shortName} ·{" "}
                {altN.toLocaleString()} ft · TAS {tasN} · Wind {fmtHdg(windDirN)}/{windKtN}
              </div>
            </div>
            {plan.unresolved.length ? (
              <p className="px-4 pt-3 text-xs text-warning">
                Unknown points: {plan.unresolved.join(", ")}
              </p>
            ) : null}
            {plan.legs.length === 0 ? (
              <div className="p-4">
                <EmptyState
                  icon={RouteIcon}
                  title="No legs yet"
                  description="Choose a departure and destination to build the nav log."
                />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[860px] text-xs">
                  <thead>
                    <tr className="border-b bg-muted/40 text-left">
                      {[
                        "Leg",
                        "Dist nm",
                        "TC",
                        "Var",
                        "MC",
                        "WCA",
                        "TH",
                        "MH",
                        "GS kt",
                        "ETE",
                        "Fuel gal",
                        "ETA",
                        "Cum nm",
                      ].map((h) => (
                        <th key={h} className="label-caps px-2 py-2 first:pl-4">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="font-mono tabular">
                    {plan.legs.map((l, i) => (
                      <tr key={i} className="border-b last:border-0">
                        <td className="px-2 py-1.5 pl-4 font-sans">
                          <span className="font-mono font-semibold">{l.from.id}</span> →{" "}
                          <span className="font-mono font-semibold">{l.to.id}</span>
                        </td>
                        <td className="px-2 py-1.5">{l.distNm.toFixed(1)}</td>
                        <td className="px-2 py-1.5">{fmtHdg(l.trueCourse)}</td>
                        <td className="px-2 py-1.5">
                          {Math.abs(l.magVar).toFixed(0)}
                          {l.magVar >= 0 ? "E" : "W"}
                        </td>
                        <td className="px-2 py-1.5 text-magenta">{fmtHdg(l.magCourse)}</td>
                        <td className="px-2 py-1.5">
                          {Number.isFinite(l.wca)
                            ? `${l.wca >= 0 ? "+" : ""}${l.wca.toFixed(0)}`
                            : "—"}
                        </td>
                        <td className="px-2 py-1.5">{fmtHdg(l.trueHeading)}</td>
                        <td className="px-2 py-1.5 font-semibold text-cyan">
                          {fmtHdg(l.magHeading)}
                        </td>
                        <td className="px-2 py-1.5">
                          {l.impossible ? (
                            <span className="text-warning">n/a</span>
                          ) : (
                            l.groundspeed.toFixed(0)
                          )}
                        </td>
                        <td className="px-2 py-1.5">{fmtMin(l.eteMin)}</td>
                        <td className="px-2 py-1.5">{l.fuelGal.toFixed(1)}</td>
                        <td className="px-2 py-1.5">{fmtZulu(l.eta)}</td>
                        <td className="px-2 py-1.5">{l.cumNm.toFixed(0)}</td>
                      </tr>
                    ))}
                    <tr className="border-t bg-muted/40 font-semibold">
                      <td className="px-2 py-1.5 pl-4 font-sans">Total</td>
                      <td className="px-2 py-1.5">{plan.totalNm.toFixed(1)}</td>
                      <td colSpan={7} />
                      <td className="px-2 py-1.5">{fmtMin(plan.totalMin)}</td>
                      <td className="px-2 py-1.5">{plan.totalFuel.toFixed(1)}</td>
                      <td className="px-2 py-1.5">{fmtZulu(plan.legs.at(-1)?.eta)}</td>
                      <td />
                    </tr>
                    {altPlan && altPlan.legs[0] ? (
                      <tr className="border-t text-muted-foreground">
                        <td className="px-2 py-1.5 pl-4 font-sans">
                          Alternate {altPlan.legs[0].from.id} → {altPlan.legs[0].to.id}
                        </td>
                        <td className="px-2 py-1.5">{altPlan.totalNm.toFixed(1)}</td>
                        <td className="px-2 py-1.5">{fmtHdg(altPlan.legs[0].trueCourse)}</td>
                        <td />
                        <td className="px-2 py-1.5">{fmtHdg(altPlan.legs[0].magCourse)}</td>
                        <td />
                        <td />
                        <td className="px-2 py-1.5">{fmtHdg(altPlan.legs[0].magHeading)}</td>
                        <td className="px-2 py-1.5">{altPlan.legs[0].groundspeed.toFixed(0)}</td>
                        <td className="px-2 py-1.5">{fmtMin(altPlan.totalMin)}</td>
                        <td className="px-2 py-1.5">{altPlan.totalFuel.toFixed(1)}</td>
                        <td colSpan={2} />
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            )}
            <div className="grid gap-4 border-t p-4 md:grid-cols-[minmax(0,1fr)_260px]">
              <div className="text-xs">
                <p className="label-caps mb-1.5">Fuel planning</p>
                <table className="w-full max-w-sm font-mono">
                  <tbody>
                    <tr>
                      <td className="py-0.5 font-sans text-muted-foreground">Trip (incl. taxi)</td>
                      <td className="text-right">{fuelChk.tripGal.toFixed(1)} gal</td>
                    </tr>
                    {rules === "IFR" ? (
                      <tr>
                        <td className="py-0.5 font-sans text-muted-foreground">To alternate</td>
                        <td className="text-right">
                          {alternateRequired
                            ? altPlan
                              ? `${fuelChk.alternateGal.toFixed(1)} gal`
                              : "select alternate"
                            : "not required"}
                        </td>
                      </tr>
                    ) : null}
                    <tr>
                      <td className="py-0.5 font-sans text-muted-foreground">
                        Reserve ({fuelChk.reserveMin} min)
                      </td>
                      <td className="text-right">{fuelChk.reserveGal.toFixed(1)} gal</td>
                    </tr>
                    <tr className="border-t">
                      <td className="py-0.5 font-sans font-semibold">Minimum required</td>
                      <td className="text-right font-semibold">
                        {fuelChk.requiredGal.toFixed(1)} gal
                      </td>
                    </tr>
                    <tr>
                      <td className="py-0.5 font-sans text-muted-foreground">On board</td>
                      <td className="text-right">{fuelN.toFixed(1)} gal</td>
                    </tr>
                    <tr>
                      <td className="py-0.5 font-sans text-muted-foreground">Endurance</td>
                      <td className="text-right">{fmtMin(fuelChk.enduranceMin)}</td>
                    </tr>
                  </tbody>
                </table>
                <p className="mt-2 text-muted-foreground">{fuelChk.rule}</p>
              </div>
              <RoutePlot plan={plan} altPlan={altPlan} div={div} />
            </div>
          </div>

          <Panel title="Cruising altitude check">
            {plan.legs.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Add a route to check the cruising altitude.
              </p>
            ) : (
              <ul className="space-y-1.5 text-sm">
                {altChecks.map((c, i) => {
                  const l = plan.legs[i];
                  return (
                    <li key={i} className="flex gap-2">
                      {c.ok ? (
                        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-ok" />
                      ) : (
                        <XCircle className="mt-0.5 size-4 shrink-0 text-warning" />
                      )}
                      <span>
                        <span className="font-mono text-xs text-muted-foreground">
                          {l?.from.id}→{l?.to.id} MC {fmtHdg(l?.magCourse ?? 0)}°:{" "}
                        </span>
                        {c.message}
                        {!c.ok && c.suggestion ? (
                          <button
                            type="button"
                            className="ml-2 text-xs text-primary hover:underline"
                            onClick={() => mark(setCruiseAlt)(String(c.suggestion))}
                          >
                            Use {c.suggestion.toLocaleString()} ft
                          </button>
                        ) : null}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
            <p className="mt-2 text-[11px] text-muted-foreground">
              {rules === "VFR"
                ? "14 CFR 91.159 applies in level cruising flight more than 3,000 ft AGL. The check uses the higher of the departure/destination elevations as a simple terrain reference — check the chart for terrain along the route."
                : "14 CFR 91.179 governs IFR altitudes in uncontrolled airspace; in controlled airspace ATC assigns altitudes, usually following the same odd/even convention. Also respect MEAs/MOCAs on your route."}
            </p>
          </Panel>

          {rules === "IFR" ? (
            <Panel title="IFR alternate requirement — the 1-2-3 rule (14 CFR 91.169)">
              <p className="mb-3 text-sm text-muted-foreground">
                No alternate is required if the destination has a standard instrument approach and,
                from <strong>1</strong> hour before to 1 hour after the ETA, the forecast is at
                least a <strong>2</strong>,000-ft ceiling and <strong>3</strong> SM visibility.
              </p>
              <div className="space-y-2 text-sm">
                <CheckRow
                  checked={destHasIap}
                  readOnly
                  label={`${dst} has a published instrument approach (${destHasIap ? "yes — from the dataset" : "none listed"})`}
                />
                <CheckRow
                  checked={ceil2000}
                  onChange={(v) => mark(setCeil2000)(v)}
                  label="Forecast ceiling ≥ 2,000 ft AGL from ETA −1 h to ETA +1 h"
                />
                <CheckRow
                  checked={vis3}
                  onChange={(v) => mark(setVis3)(v)}
                  label="Forecast visibility ≥ 3 SM over the same period"
                />
              </div>
              <div
                className={cn(
                  "mt-3 rounded-md border px-3 py-2 text-sm",
                  alternateRequired ? "border-caution/40 bg-caution/5" : "border-ok/30 bg-ok/5",
                )}
              >
                {alternateRequired ? (
                  <>
                    <span className="font-semibold text-caution">Alternate required.</span>{" "}
                    {altAp ? `Planned alternate: ${altAp.icao}.` : "Select an alternate above."}
                  </>
                ) : (
                  <>
                    <span className="font-semibold text-ok">No alternate required</span> by the
                    1-2-3 rule (you may still file one).
                  </>
                )}
              </div>
              {alternateRequired && altAp ? (
                <div className="mt-3 space-y-2 text-sm">
                  <p className="label-caps">Alternate suitability</p>
                  <CheckRow
                    checked={isIfrCapable(altAp)}
                    readOnly
                    label={`${altAp.icao} has an instrument approach${isIfrCapable(altAp) ? "" : " — if not, the forecast must allow descent from MEA, approach and landing in basic VFR"}`}
                  />
                  <CheckRow
                    checked={altMinsOk}
                    onChange={(v) => mark(setAltMinsOk)(v)}
                    label="Alternate forecast at ETA meets the published alternate minimums, or standard: 600-2 (precision) / 800-2 (non-precision)"
                  />
                </div>
              ) : null}
            </Panel>
          ) : null}

          <Panel
            title={
              <span className="flex items-center gap-1.5">
                <Navigation2 className="size-3.5" /> Diversion planning
              </span>
            }
          >
            {plan.legs.length === 0 || !div ? (
              <p className="text-sm text-muted-foreground">Build a route to plan diversions.</p>
            ) : (
              <>
                <label className="text-xs">
                  <span className="label-caps flex justify-between">
                    <span>Position along route</span>
                    <span className="font-mono text-foreground">
                      {div.distFromStartNm.toFixed(0)} nm from {dep} · leg {divLeg?.from.id}→
                      {divLeg?.to.id}
                    </span>
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={divFrac}
                    onChange={(e) => setDivFrac(Number(e.target.value))}
                    className="mt-1 w-full accent-[var(--color-magenta)]"
                  />
                </label>
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left">
                        <th className="label-caps py-1.5">Airport</th>
                        <th className="label-caps py-1.5">Mag hdg*</th>
                        <th className="label-caps py-1.5">Dist</th>
                        <th className="label-caps py-1.5">ETE</th>
                        <th className="label-caps hidden py-1.5 sm:table-cell">Longest rwy</th>
                      </tr>
                    </thead>
                    <tbody>
                      {diversions.map(({ item, distNm, brgTrue }) => {
                        const w = windTriangle(brgTrue, tasN, windDirN, windKtN);
                        const ete = w.groundspeed > 0 ? (distNm / w.groundspeed) * 60 : NaN;
                        return (
                          <tr key={item.icao} className="border-b last:border-0">
                            <td className="py-1.5">
                              <Link
                                to="/airports/$icao"
                                params={{ icao: item.icao }}
                                className="font-mono font-semibold hover:text-primary"
                              >
                                {item.icao}
                              </Link>{" "}
                              <span className="text-xs text-muted-foreground">
                                {item.towered ? "Twr" : "CTAF"}
                              </span>
                            </td>
                            <td className="py-1.5 font-mono text-cyan">
                              {fmtHdg(w.heading - item.magVar)}°
                            </td>
                            <td className="py-1.5 font-mono">{distNm.toFixed(1)} nm</td>
                            <td className="py-1.5 font-mono">{fmtMin(ete)}</td>
                            <td className="hidden py-1.5 font-mono text-xs sm:table-cell">
                              {longestRunwayFt(item).toLocaleString()} ft
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  * Magnetic heading corrected for the planning wind. In flight: turn toward the
                  diversion first, then refine heading, distance and fuel — 'Aviate, Navigate,
                  Communicate'.
                </p>
              </>
            )}
          </Panel>
        </div>
      </div>

      <Section
        title="Preflight exercises"
        description="Practice reviewing weather and NOTAMs for the plan above (simulated products)."
        className="mt-8"
      >
        {depAp && dstAp ? (
          <Tabs defaultValue="wx">
            <TabsList>
              <TabsTrigger value="wx">
                <CloudSun className="size-4" /> Weather briefing
              </TabsTrigger>
              <TabsTrigger value="notam">
                <FileWarning className="size-4" /> NOTAM review
              </TabsTrigger>
            </TabsList>
            <TabsContent value="wx" className="mt-4">
              <BriefingExercise dep={depAp} dst={dstAp} />
            </TabsContent>
            <TabsContent value="notam" className="mt-4">
              <NotamExercise dep={depAp} dst={dstAp} />
            </TabsContent>
          </Tabs>
        ) : null}
      </Section>

      <Section
        title="Saved flight plans"
        description="Plans are stored in this browser with the rest of your training record."
      >
        {!hydrated ? null : savedPlans.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title="No saved plans yet"
            description="Save a plan to fly it in the simulator or request an IFR/VFR clearance from AI ATC."
          />
        ) : (
          <div className="panel overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="label-caps px-4 py-2">Plan</th>
                  <th className="label-caps px-2 py-2">Route</th>
                  <th className="label-caps px-2 py-2">Aircraft</th>
                  <th className="label-caps px-2 py-2">Saved</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {savedPlans.map((p) => (
                  <tr
                    key={p.id}
                    className={cn("border-b last:border-0", p.id === savedId && "bg-primary/5")}
                  >
                    <td className="px-4 py-2">
                      <div className="font-medium">{p.name}</div>
                      <Pill tone={p.rules === "VFR" ? "ok" : "primary"}>{p.rules}</Pill>
                    </td>
                    <td className="px-2 py-2 font-mono text-xs">
                      {[p.departure, ...p.route, p.destination].join(" → ")}
                      {p.alternate ? ` (alt ${p.alternate})` : ""}
                    </td>
                    <td className="px-2 py-2 text-xs">{getPerf(p.aircraftId).shortName}</td>
                    <td className="px-2 py-2 text-xs text-muted-foreground">
                      {formatDateTime(p.date)}
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex justify-end gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => load(p)}
                          title="Load into planner"
                        >
                          <FolderOpen className="size-4" /> Load
                        </Button>
                        <Button size="sm" variant="ghost" asChild title="Fly in simulator">
                          <HrefLink
                            href={buildHref("/simulator", {
                              airport: p.departure,
                              dest: p.destination,
                              aircraft: p.aircraftId,
                              plan: p.id,
                              scenario: "free-flight",
                            })}
                          >
                            <PlaneTakeoff className="size-4" />
                            <span className="sr-only">Fly this plan</span>
                          </HrefLink>
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          asChild
                          title="Request clearance with AI ATC"
                        >
                          <HrefLink href={buildHref("/ai-atc", { plan: p.id })}>
                            <MessageSquareText className="size-4" />
                            <span className="sr-only">Request clearance</span>
                          </HrefLink>
                        </Button>
                        <ConfirmAction
                          title="Delete flight plan?"
                          description={`"${p.name}" will be removed from this browser. Links that reference it (simulator, AI ATC) will no longer load it.`}
                          confirmLabel="Delete plan"
                          onConfirm={() => {
                            actions.deleteFlightPlan(p.id);
                            if (savedId === p.id) setSavedId(null);
                          }}
                          trigger={
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-muted-foreground hover:text-warning"
                              title="Delete plan"
                            >
                              <Trash2 className="size-4" />
                              <span className="sr-only">Delete</span>
                            </Button>
                          }
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </Page>
  );
}

function swap<T>(arr: T[], i: number, j: number): T[] {
  const out = [...arr];
  const a = out[i] as T;
  out[i] = out[j] as T;
  out[j] = a;
  return out;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-xs">
      <span className="label-caps mb-1 block">{label}</span>
      {children}
    </label>
  );
}

function SummaryStat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string | undefined;
  tone?: "ok" | "warning";
}) {
  return (
    <div className="panel px-3 py-2.5">
      <div className="label-caps">{label}</div>
      <div
        className={cn(
          "mt-1 font-mono text-lg font-semibold tabular",
          tone === "ok" && "text-ok",
          tone === "warning" && "text-warning",
        )}
      >
        {value}
      </div>
      {sub ? <div className="text-[11px] text-muted-foreground">{sub}</div> : null}
    </div>
  );
}

function CheckRow({
  checked,
  onChange,
  label,
  readOnly,
}: {
  checked: boolean;
  onChange?: (v: boolean) => void;
  label: string;
  readOnly?: boolean;
}) {
  return (
    <label className={cn("flex items-start gap-2", readOnly ? "cursor-default" : "cursor-pointer")}>
      <input
        type="checkbox"
        checked={checked}
        disabled={readOnly}
        onChange={(e) => onChange?.(e.target.checked)}
        className="mt-1 accent-[var(--color-primary)]"
      />
      <span className={cn(readOnly && "text-muted-foreground")}>{label}</span>
    </label>
  );
}

function AirportSelect({
  value,
  onChange,
  allowNone,
  exclude,
}: {
  value: string;
  onChange: (v: string) => void;
  allowNone?: boolean;
  exclude?: string;
}) {
  return (
    <Select value={value || "__none"} onValueChange={(v) => onChange(v === "__none" ? "" : v)}>
      <SelectTrigger className="font-mono">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {allowNone ? <SelectItem value="__none">None</SelectItem> : null}
        {sortedAirports
          .filter((a) => a.icao !== exclude)
          .map((a) => (
            <SelectItem key={a.icao} value={a.icao}>
              <span className="font-mono">{a.icao}</span>{" "}
              <span className="text-muted-foreground">{a.city}</span>
            </SelectItem>
          ))}
      </SelectContent>
    </Select>
  );
}

function RoutePlot({
  plan,
  altPlan,
  div,
}: {
  plan: PlanResult;
  altPlan: PlanResult | undefined;
  div: { lat: number; lon: number } | undefined;
}) {
  const pts = [...plan.points, ...(altPlan?.points ?? [])];
  if (pts.length < 2)
    return (
      <div className="avionics-screen grid h-40 place-items-center text-xs text-muted-foreground">
        Route preview
      </div>
    );
  const lats = pts.map((p) => p.lat);
  const lons = pts.map((p) => p.lon);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  const k = Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180);
  const W = 260;
  const H = 180;
  const spanX = Math.max((maxLon - minLon) * k, 0.05);
  const spanY = Math.max(maxLat - minLat, 0.05);
  const s = Math.min((W - 50) / spanX, (H - 40) / spanY);
  const ox = (W - spanX * s) / 2 - 0;
  const oy = (H - spanY * s) / 2;
  const x = (lon: number) => ox + (lon - minLon) * k * s;
  const y = (lat: number) => oy + (maxLat - lat) * s;
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="avionics-screen w-full"
      role="img"
      aria-label="Route preview"
    >
      {altPlan && altPlan.points.length === 2 ? (
        <line
          x1={x(altPlan.points[0]?.lon ?? 0)}
          y1={y(altPlan.points[0]?.lat ?? 0)}
          x2={x(altPlan.points[1]?.lon ?? 0)}
          y2={y(altPlan.points[1]?.lat ?? 0)}
          stroke="var(--color-caution)"
          strokeDasharray="4 3"
          strokeWidth={1.5}
        />
      ) : null}
      <polyline
        points={plan.points.map((p) => `${x(p.lon)},${y(p.lat)}`).join(" ")}
        fill="none"
        stroke="var(--color-magenta)"
        strokeWidth={2}
      />
      {pts.map((p, i) => (
        <g key={`${p.id}-${i}`}>
          {p.kind === "airport" ? (
            <circle
              cx={x(p.lon)}
              cy={y(p.lat)}
              r={4}
              fill="var(--color-panel)"
              stroke="var(--color-primary)"
              strokeWidth={1.5}
            />
          ) : (
            <rect
              x={x(p.lon) - 3}
              y={y(p.lat) - 3}
              width={6}
              height={6}
              fill="none"
              stroke="var(--color-cyan)"
              strokeWidth={1.5}
              transform={`rotate(45 ${x(p.lon)} ${y(p.lat)})`}
            />
          )}
          <text
            x={x(p.lon) + 6}
            y={y(p.lat) - 5}
            fontSize={9}
            fill="oklch(0.9 0.01 250)"
            fontFamily="var(--font-mono)"
          >
            {p.id}
          </text>
        </g>
      ))}
      {div ? <circle cx={x(div.lon)} cy={y(div.lat)} r={4} fill="var(--color-magenta)" /> : null}
    </svg>
  );
}
