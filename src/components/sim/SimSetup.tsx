import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  ChevronRight,
  Clock,
  Cloud,
  Gauge,
  Plane,
  PlaneTakeoff,
  ShieldCheck,
  Target,
  Wind,
} from "lucide-react";
import { AIRPORTS } from "@/lib/data/airports";
import { AIRCRAFT_PERF, getPerf } from "@/lib/data/aircraft-perf";
import { WEATHER_PRESETS } from "@/sim/environment";
import {
  CATEGORY_LABEL,
  SCENARIOS,
  type ScenarioCategory,
  type ScenarioConfig,
  type ScenarioDef,
} from "@/sim/scenarios";
import { useStore } from "@/lib/store";
import { Pill } from "@/components/app/page";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";

const CATS: ScenarioCategory[] = ["free", "vfr", "ifr", "emergency", "checkride"];

function bestScore(flights: { scenarioId: string; score: number }[], id: string) {
  let b = -1;
  for (const f of flights) if (f.scenarioId === id) b = Math.max(b, f.score);
  return b;
}

export function SimSetup({
  initial,
  onStart,
}: {
  initial: { scenarioId: string; config: ScenarioConfig };
  onStart: (scenario: ScenarioDef, config: ScenarioConfig) => void;
}) {
  const flights = useStore((s) => s.flights);
  const preferred = useStore((s) => s.settings.preferredAircraft);
  const initialScenario = SCENARIOS.find((s) => s.id === initial.scenarioId) ?? SCENARIOS[0]!;
  const [cat, setCat] = useState<ScenarioCategory>(initialScenario.category);
  const [scenario, setScenario] = useState<ScenarioDef>(initialScenario);
  const [aircraft, setAircraft] = useState(
    initial.config.aircraftId || preferred || initialScenario.defaultAircraft,
  );
  const [airport, setAirport] = useState(initial.config.airport ?? "KPAO");
  const [destination, setDestination] = useState(initial.config.destination ?? "");
  const [weatherKey, setWeatherKey] = useState(initial.config.weatherKey ?? "scattered");
  const [timeOfDay, setTimeOfDay] = useState(initial.config.timeOfDay ?? 13);
  const [customWind, setCustomWind] = useState(false);
  const [windDir, setWindDir] = useState(270);
  const [windKt, setWindKt] = useState(8);
  const [vis, setVis] = useState<number | null>(null);

  const list = SCENARIOS.filter((s) => s.category === cat);
  const allowed = scenario.aircraft
    ? AIRCRAFT_PERF.filter((a) => scenario.aircraft!.includes(a.id))
    : AIRCRAFT_PERF;
  const effectiveAircraft = allowed.some((a) => a.id === aircraft)
    ? aircraft
    : scenario.defaultAircraft;
  const isFree = scenario.id === "free-flight";

  const config: ScenarioConfig = useMemo(() => {
    const c: ScenarioConfig = { aircraftId: effectiveAircraft };
    if (isFree) {
      c.airport = airport;
      if (destination) c.destination = destination;
      c.weatherKey = weatherKey;
      c.timeOfDay = timeOfDay;
      if (customWind) {
        c.windDir = windDir;
        c.windKt = windKt;
      }
      if (vis !== null) c.visibilitySm = vis;
    } else if (timeOfDay !== 13 && scenario.id !== "emg-electrical") {
      c.timeOfDay = timeOfDay;
    }
    return c;
  }, [
    effectiveAircraft,
    isFree,
    airport,
    destination,
    weatherKey,
    timeOfDay,
    customWind,
    windDir,
    windKt,
    vis,
    scenario.id,
  ]);

  const preview = useMemo(() => {
    try {
      return scenario.build(config);
    } catch {
      return null;
    }
  }, [scenario, config]);

  const perf = getPerf(effectiveAircraft);
  const w = preview?.options.weather;

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_420px]">
      <div className="min-w-0">
        <div className="mb-4 flex flex-wrap gap-1.5">
          {CATS.map((c) => (
            <button
              key={c}
              onClick={() => {
                setCat(c);
                const first = SCENARIOS.find((s) => s.category === c);
                if (first) setScenario(first);
              }}
              className={cn(
                "rounded-md border px-3 py-1.5 text-xs font-semibold tracking-wide uppercase transition",
                cat === c
                  ? "border-primary bg-primary/15 text-primary"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              {CATEGORY_LABEL[c]}
            </button>
          ))}
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {list.map((s) => {
            const best = bestScore(flights, s.id);
            const active = s.id === scenario.id;
            return (
              <button
                key={s.id}
                onClick={() => setScenario(s)}
                className={cn(
                  "panel group flex flex-col items-start gap-1.5 p-3.5 text-left transition",
                  active ? "border-primary ring-1 ring-primary/40" : "hover:border-primary/50",
                )}
              >
                <div className="flex w-full items-center justify-between gap-2">
                  <span className="font-semibold">{s.title}</span>
                  <Pill tone={s.rules === "IFR" ? "magenta" : "ok"}>{s.rules}</Pill>
                </div>
                <p className="text-xs leading-relaxed text-muted-foreground">{s.summary}</p>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <Clock className="size-3" /> ~{s.durationMin} min
                  </span>
                  <span className="capitalize">{s.level}</span>
                  {best >= 0 ? (
                    <Pill tone={best >= 80 ? "ok" : best >= 60 ? "primary" : "caution"}>
                      Best {Math.round(best)}
                    </Pill>
                  ) : (
                    <Pill>Not flown</Pill>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <aside className="panel flex flex-col">
        <div className="border-b p-4">
          <p className="label-caps text-primary">
            {CATEGORY_LABEL[scenario.category]} · {scenario.rules}
          </p>
          <h2 className="mt-1 text-lg font-bold">{scenario.title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{scenario.summary}</p>
        </div>
        <div className="space-y-4 p-4 text-sm">
          <div>
            <Label className="label-caps">Aircraft</Label>
            <select
              value={effectiveAircraft}
              onChange={(e) => setAircraft(e.target.value)}
              className="mt-1.5 w-full rounded-md border bg-background px-2.5 py-2 text-sm"
            >
              {allowed.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.shortName} — {a.engines > 1 ? "twin" : "single"} {a.powerType}
                </option>
              ))}
            </select>
            <p className="mt-1 text-[11px] text-muted-foreground">
              VR {perf.v.r} · VY {perf.v.y} · VREF {perf.v.ref} KIAS ·{" "}
              <Link
                to="/aircraft/$id"
                params={{ id: perf.id }}
                className="text-primary hover:underline"
              >
                aircraft details
              </Link>
            </p>
          </div>

          {isFree ? (
            <>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="label-caps">Departure</Label>
                  <select
                    value={airport}
                    onChange={(e) => setAirport(e.target.value)}
                    className="mt-1.5 w-full rounded-md border bg-background px-2 py-2 text-sm"
                  >
                    {AIRPORTS.map((a) => (
                      <option key={a.icao} value={a.icao}>
                        {a.icao} — {a.city}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label className="label-caps">Destination</Label>
                  <select
                    value={destination}
                    onChange={(e) => setDestination(e.target.value)}
                    className="mt-1.5 w-full rounded-md border bg-background px-2 py-2 text-sm"
                  >
                    <option value="">None (local)</option>
                    {AIRPORTS.filter((a) => a.icao !== airport).map((a) => (
                      <option key={a.icao} value={a.icao}>
                        {a.icao} — {a.city}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <Label className="label-caps">Weather</Label>
                <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                  {Object.entries(WEATHER_PRESETS).map(([k, p]) => (
                    <button
                      key={k}
                      onClick={() => setWeatherKey(k)}
                      className={cn(
                        "rounded border px-2 py-1.5 text-left text-xs",
                        weatherKey === k ? "border-primary bg-primary/10" : "hover:bg-accent",
                      )}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
              <details className="group">
                <summary className="cursor-pointer text-xs text-muted-foreground select-none hover:text-foreground">
                  Wind &amp; visibility
                </summary>
                <div className="mt-3 space-y-4">
                  <div>
                    <label className="flex items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        checked={customWind}
                        onChange={(e) => setCustomWind(e.target.checked)}
                      />{" "}
                      Custom surface wind
                    </label>
                    {customWind ? (
                      <div className="mt-2 grid grid-cols-2 gap-3">
                        <div>
                          <span className="text-[11px] text-muted-foreground">
                            From {windDir}° true
                          </span>
                          <Slider
                            min={0}
                            max={359}
                            step={10}
                            value={[windDir]}
                            onValueChange={(v) => setWindDir(v[0] ?? 0)}
                          />
                        </div>
                        <div>
                          <span className="text-[11px] text-muted-foreground">{windKt} kt</span>
                          <Slider
                            min={0}
                            max={35}
                            step={1}
                            value={[windKt]}
                            onValueChange={(v) => setWindKt(v[0] ?? 0)}
                          />
                        </div>
                      </div>
                    ) : null}
                  </div>
                  <div>
                    <span className="label-caps">
                      Visibility {vis === null ? "(preset)" : `${vis} SM`}
                    </span>
                    <Slider
                      className="mt-2"
                      min={0.5}
                      max={30}
                      step={0.5}
                      value={[vis ?? 10]}
                      onValueChange={(v) => setVis(v[0] ?? 10)}
                    />
                  </div>
                </div>
              </details>
            </>
          ) : null}

          <div>
            <span className="label-caps">
              Time of day {String(Math.floor(timeOfDay)).padStart(2, "0")}:
              {String(Math.round((timeOfDay % 1) * 60)).padStart(2, "0")} local
            </span>
            <Slider
              className="mt-2"
              min={0}
              max={23.5}
              step={0.5}
              value={[timeOfDay]}
              onValueChange={(v) => setTimeOfDay(v[0] ?? 13)}
            />
          </div>

          {preview && w ? (
            <div className="rounded-md border bg-muted/40 p-3 text-xs">
              <div className="mb-2 flex flex-wrap gap-3 text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <PlaneTakeoff className="size-3.5" /> {preview.departure.icao}
                  {preview.destination && preview.destination.icao !== preview.departure.icao
                    ? ` → ${preview.destination.icao}`
                    : ""}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Wind className="size-3.5" /> {Math.round(w.windDir)}°/{Math.round(w.windKt)}
                  {w.gustKt > w.windKt ? `G${w.gustKt}` : ""} kt
                </span>
                <span className="inline-flex items-center gap-1">
                  <Cloud className="size-3.5" /> {w.cloudCover}
                  {w.cloudBaseFt ? ` ${w.cloudBaseFt} ft` : ""} · {w.visibilitySm} SM
                </span>
              </div>
              <p className="label-caps mb-1.5 flex items-center gap-1">
                <Target className="size-3" /> Objectives
              </p>
              <ul className="space-y-1">
                {preview.objectives.map((o) => (
                  <li key={o.id} className="flex gap-1.5">
                    <span className="text-primary">▸</span>
                    {o.text}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <details className="group" open={scenario.category !== "free"}>
            <summary className="label-caps flex cursor-pointer items-center gap-1 select-none">
              <ChevronRight className="size-3 transition-transform group-open:rotate-90" /> Briefing
            </summary>
            <ol className="mt-2 list-decimal space-y-1.5 pl-4 text-xs leading-relaxed text-foreground/85">
              {scenario.briefing.map((b, i) => (
                <li key={i}>{b}</li>
              ))}
            </ol>
            <div className="mt-2 space-y-1">
              {scenario.safety.map((s, i) => (
                <p key={i} className="flex gap-2 text-[11px] leading-relaxed text-muted-foreground">
                  <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-caution" />
                  {s}
                </p>
              ))}
            </div>
          </details>
        </div>
        <div className="mt-auto border-t p-4">
          <Button
            className="w-full"
            size="lg"
            onClick={() => onStart(scenario, config)}
            disabled={!preview}
          >
            <Plane className="size-4" /> Start{" "}
            {scenario.category === "free" ? "flight" : "scenario"}
          </Button>
          {!preview ? (
            <p className="mt-2 flex items-center gap-1 text-xs text-warning">
              <AlertTriangle className="size-3.5" /> This configuration can't be built — pick
              another airport.
            </p>
          ) : null}
        </div>
      </aside>
    </div>
  );
}
