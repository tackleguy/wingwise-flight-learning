import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PlaneTakeoff } from "lucide-react";
import { Page, PageHeader, Notice } from "@/components/app/page";
import { SimSetup } from "@/components/sim/SimSetup";
import { FlightSession } from "@/components/sim/FlightSession";
import {
  getScenario,
  SCENARIOS,
  type ScenarioConfig,
  type ScenarioDef,
  type BuiltScenario,
} from "@/sim/scenarios";
import { getAirport, getNavaid } from "@/lib/data/airports";
import { getState, useStore } from "@/lib/store";
import type { Waypoint } from "@/sim/types";

interface SimSearch {
  scenario?: string;
  aircraft?: string;
  airport?: string;
  dest?: string;
  plan?: string;
  checkride?: string;
}

const str = (v: unknown) =>
  typeof v === "string" && v.length > 0 && v.length < 64 ? v : undefined;

export const Route = createFileRoute("/simulator")({
  validateSearch: (s: Record<string, unknown>): SimSearch => {
    const out: SimSearch = {};
    const keys = ["scenario", "aircraft", "airport", "dest", "plan", "checkride"] as const;
    for (const k of keys) {
      const v = str(s[k]);
      if (v) out[k] = v;
    }
    return out;
  },
  head: () => ({
    meta: [
      { title: "Flight Simulator — TeachX" },
      {
        name: "description",
        content:
          "3D browser flight simulator with real physics, VFR/IFR/emergency training scenarios, scored objectives and debriefs.",
      },
    ],
  }),
  component: SimulatorPage,
});

function planWaypoints(planId: string | undefined): Waypoint[] | null {
  if (!planId) return null;
  const p = getState().flightPlans.find((x) => x.id === planId);
  if (!p) return null;
  const ids = [p.departure, ...p.route, p.destination];
  const wps: Waypoint[] = [];
  for (const id of ids) {
    const ap = getAirport(id);
    if (ap) {
      wps.push({ id: ap.icao, lat: ap.lat, lon: ap.lon, kind: "airport" });
      continue;
    }
    const nv = getNavaid(id);
    if (nv) {
      wps.push({ id: nv.id, lat: nv.lat, lon: nv.lon, kind: "vor" });
      continue;
    }
    const m = /^(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)$/.exec(id);
    if (m) wps.push({ id: "USR", lat: Number(m[1]), lon: Number(m[2]), kind: "user" });
  }
  return wps.length >= 2 ? wps : null;
}

function SimulatorPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const preferred = useStore((s) => s.settings.preferredAircraft);
  const plan = useStore((s) =>
    search.plan ? s.flightPlans.find((p) => p.id === search.plan) : undefined,
  );
  const [session, setSession] = useState<{
    scenario: ScenarioDef;
    config: ScenarioConfig;
    run: number;
  } | null>(null);

  const initial = useMemo(() => {
    const sc = getScenario(search.scenario) ?? SCENARIOS[0]!;
    const config: ScenarioConfig = {
      aircraftId: search.aircraft ?? plan?.aircraftId ?? preferred ?? sc.defaultAircraft,
    };
    const dep = search.airport ?? plan?.departure;
    const dst = search.dest ?? plan?.destination;
    if (dep && getAirport(dep)) config.airport = getAirport(dep)!.icao;
    if (dst && getAirport(dst)) config.destination = getAirport(dst)!.icao;
    if (!search.aircraft && !plan && sc.defaultAircraft)
      config.aircraftId =
        sc.category === "free" ? preferred || sc.defaultAircraft : sc.defaultAircraft;
    return { scenarioId: sc.id, config };
  }, [search.scenario, search.aircraft, search.airport, search.dest, plan, preferred]);

  const built: BuiltScenario | null = useMemo(() => {
    if (!session) return null;
    const b = session.scenario.build(session.config);
    const wps = session.scenario.id === "free-flight" ? planWaypoints(search.plan) : null;
    if (wps) {
      const prev = b.setup;
      b.setup = (e) => {
        prev?.(e);
        e.loadFlightPlan(wps);
      };
      b.instructions = [
        ...b.instructions,
        `Flight plan loaded: ${wps.map((w) => w.id).join(" → ")}`,
      ];
    }
    return b;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.run, session?.scenario, session?.config]);

  if (session && built) {
    return (
      <FlightSession
        key={session.run}
        scenario={session.scenario}
        config={session.config}
        built={built}
        checkrideId={search.checkride}
        onExit={() => setSession(null)}
        onRestart={() => setSession((s) => (s ? { ...s, run: s.run + 1 } : s))}
      />
    );
  }

  return (
    <Page wide>
      <PageHeader
        eyebrow="Fly"
        icon={PlaneTakeoff}
        title="Flight Simulator"
        description="A physics-based 3D simulator: choose free flight or a structured training scenario. Every flight is scored against measurable objectives and saved to your logbook."
      />
      {search.checkride ? (
        <Notice className="mb-4" title="Checkride in progress.">
          Complete this flight and use “Return to checkride” in the debrief — your score is attached
          to your mock checkride automatically.
        </Notice>
      ) : null}
      {plan ? (
        <Notice className="mb-4" title={`Flight plan: ${plan.departure} → ${plan.destination}.`}>
          Choose Free Flight to fly it — the route will be loaded into the GPS.
        </Notice>
      ) : null}
      <SimSetup
        key={initial.scenarioId + (search.plan ?? "")}
        initial={initial}
        onStart={(scenario, config) => {
          setSession({ scenario, config, run: Date.now() });
          if (search.scenario !== scenario.id)
            void navigate({
              to: "/simulator",
              search: { ...search, scenario: scenario.id },
              replace: true,
            });
        }}
      />
      <p className="mt-6 text-[11px] leading-relaxed text-muted-foreground">
        Flight model: simplified point-mass aerodynamics with angle-of-attack based lift, stall,
        propeller/jet thrust, density altitude, wind, gusts and turbulence. Aircraft numbers are
        educational approximations — not POH/AFM data. Scenery, terrain and approach procedures are
        synthetic training representations and must not be used for real-world navigation.
      </p>
    </Page>
  );
}
