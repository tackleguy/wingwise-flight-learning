/**
 * Free-form ATC practice engine (used by /ai-atc).
 *
 *  - Keeps the scenario state (airport, runway, frequencies, position, altitude, heading,
 *    current station, clearance, flight plan, pending readback) in one object.
 *  - `scriptedTurn` is a rule-based controller with an intent matcher, so the page works end to
 *    end with no AI configured.
 *  - `applyAiTurn` validates and sanitises an AI controller's JSON reply and enforces guardrails
 *    (runways/frequencies must exist at the airport, sane altitudes/headings/codes). Anything
 *    invalid → the caller falls back to `scriptedTurn` for that turn.
 *  - Readbacks are graded locally either way: instructions in every ATC transmission are parsed
 *    into expected readback elements.
 *
 * SIMULATED FOR TRAINING ONLY.
 */
import { AIRPORTS, allRunwayEnds, getAirport } from "@/lib/data/airports";
import type { Airport } from "@/lib/data/types";
import { bearingDeg, distanceNm, norm180, norm360 } from "@/lib/geo";
import type { SavedFlightPlan } from "@/lib/store";
import {
  airportSpokenName,
  approachPhrase,
  buildAirportLegContext,
  buildContext,
  compassWord,
  facilityDirectory,
  facilityDirectoryForFields,
  facilityOf,
  makeRng,
} from "./context";
import {
  blockedItem,
  buildReport,
  correctFrequencyItem,
  evaluateTransmission,
  scoreItems,
  summarize,
  wrongFrequencyItem,
  type Expect,
  type StepKind,
} from "./evaluate";
import { freqEquals, formatFreqShort } from "./frequency";
import {
  hasAny,
  hasPhrase,
  parseTransmission,
  readAltitudes,
  readFrequencies,
  readHeadings,
  readRunways,
  readSquawks,
  type ParsedTransmission,
} from "./normalize";
import {
  alt,
  altimeter,
  csPhrase,
  freq,
  hdg,
  letter,
  ph,
  PHONETIC,
  route,
  rwy,
  speakify,
  squawk,
  usRunway,
  wind,
} from "./phrase";
import type {
  AirportLegContext,
  Clearance,
  Difficulty,
  EvalItem,
  Facility,
  FacilityKey,
  Personality,
  Phrase,
  ScenarioContext,
  SessionReport,
  TransmissionEval,
} from "./types";

export type FreeGoalId =
  | "vfr-full-flight"
  | "ifr-full-flight"
  | "vfr-departure-ff"
  | "ifr-departure"
  | "vfr-arrival"
  | "ifr-arrival"
  | "pattern"
  | "custom";

export const FREE_GOALS: {
  id: FreeGoalId;
  label: string;
  rules: "VFR" | "IFR" | "any";
  fullFlight?: boolean;
  describe: (dest: string) => string;
}[] = [
  {
    id: "vfr-full-flight",
    label: "Full VFR cross-country flight",
    rules: "VFR",
    fullFlight: true,
    describe: (d) =>
      `Full VFR flight to ${d}: taxi, takeoff, flight following, arrival, landing & taxi in`,
  },
  {
    id: "ifr-full-flight",
    label: "Full IFR cross-country flight",
    rules: "IFR",
    fullFlight: true,
    describe: (d) =>
      `Full IFR flight to ${d}: clearance, taxi, takeoff, center, approach, landing & taxi in`,
  },
  {
    id: "vfr-departure-ff",
    label: "VFR departure with flight following",
    rules: "VFR",
    describe: (d) => `VFR departure with flight following to ${d}`,
  },
  {
    id: "ifr-departure",
    label: "IFR clearance and departure",
    rules: "IFR",
    describe: (d) => `IFR clearance and departure to ${d}`,
  },
  {
    id: "vfr-arrival",
    label: "VFR arrival into Class D",
    rules: "VFR",
    describe: () => "VFR arrival: enter Class D, pattern entry, landing and taxi in",
  },
  {
    id: "ifr-arrival",
    label: "IFR arrival and approach",
    rules: "IFR",
    describe: () => "IFR arrival: descent, vectors, approach clearance, landing",
  },
  {
    id: "pattern",
    label: "Closed traffic (pattern work)",
    rules: "VFR",
    describe: () => "Closed traffic: taxi, takeoff, pattern and landing",
  },
  {
    id: "custom",
    label: "Free-form (describe your own)",
    rules: "any",
    describe: () => "Free-form radio practice",
  },
];

export type FlightLeg = "departure" | "enroute" | "destination";

export type FreePhase =
  | "ramp"
  | "taxiing"
  | "holding-short"
  | "airborne"
  | "enroute"
  | "inbound"
  | "pattern"
  | "final"
  | "landed"
  | "parked"
  | "arrival";

export type PendingTag =
  | "clearance"
  | "taxi"
  | "takeoff"
  | "handoff"
  | "squawk"
  | "climb"
  | "altitude"
  | "vectors"
  | "runway"
  | "pattern-entry"
  | "landing"
  | "go-around"
  | "exit"
  | "app-desc"
  | "app-vector"
  | "app-clear"
  | "emergency"
  | "generic";

export interface PendingReadback {
  expects: Expect[];
  tag: PendingTag;
  facility: FacilityKey;
  /** For handoffs: where the pilot goes next. */
  next?: FacilityKey;
  instruction: string;
}

export interface FreeState {
  ctx: ScenarioContext;
  /** Original departure airport leg context (used when switching legs). */
  dep: AirportLegContext;
  /** Destination airport leg context for cross-country flights (null for local/arrival). */
  dest: AirportLegContext | null;
  leg: FlightLeg;
  goalId: FreeGoalId;
  goal: string;
  rules: "VFR" | "IFR";
  difficulty: Difficulty;
  personality: Personality;
  phase: FreePhase;
  currentStation: FacilityKey;
  clearance: Clearance | null;
  pending: PendingReadback | null;
  ffActive: boolean;
  /** Flight-following request progress: controller said "go ahead". */
  ffAsked: boolean;
  emergency: boolean;
  goalReached: boolean;
  flightPlan: {
    rules: "VFR" | "IFR";
    departure: string;
    destination: string;
    route: string[];
    cruiseAltFt: number;
  } | null;
  evals: TransmissionEval[];
  turn: number;
}

export interface FreeReply {
  kind: "atc" | "system";
  facility?: Facility;
  phrase: Phrase;
  delayMs: number;
  tone?: "info" | "ok" | "caution" | "warning";
}

export interface FreeSetup {
  airportIcao: string;
  destinationIcao?: string;
  aircraftId: string;
  callsign: string;
  rules: "VFR" | "IFR";
  goalId: FreeGoalId;
  customGoal?: string;
  difficulty: Difficulty;
  personality: Personality;
  plan?: SavedFlightPlan | null;
}

// ---------------------------------------------------------------------------

const capFirst = (p: Phrase): Phrase => ({
  text: p.text.charAt(0).toUpperCase() + p.text.slice(1),
  spoken: p.spoken.charAt(0).toUpperCase() + p.spoken.slice(1),
});
const r10 = (d: number) => Math.round(norm360(d) / 10) * 10 || 360;
const side = (from: number, to: number) => (norm180(to - from) >= 0 ? "right" : "left");

export function legFromCtx(ctx: ScenarioContext): AirportLegContext {
  return {
    airport: ctx.airport,
    airportName: ctx.airportName,
    runway: ctx.runway,
    altRunway: ctx.altRunway,
    atis: ctx.atis,
    atisFreq: ctx.atisFreq,
    facilities: ctx.facilities,
    taxiRoute: ctx.taxiRoute,
    patternAltitude: ctx.patternAltitude,
    interceptAltitude: ctx.interceptAltitude,
    approachName: ctx.approachName,
  };
}

export function landingStation(ctx: ScenarioContext): FacilityKey {
  return ctx.airport.towered ? "tower" : "ctaf";
}

export function groundStation(ctx: ScenarioContext): FacilityKey | null {
  return ctx.airport.towered ? "ground" : null;
}

export function switchToLeg(s: FreeState, targetLeg: FlightLeg): FreeState {
  if (targetLeg === "destination" && s.dest) {
    const d = s.dest;
    return {
      ...s,
      leg: "destination",
      ctx: {
        ...s.ctx,
        airport: d.airport,
        airportName: d.airportName,
        runway: d.runway,
        altRunway: d.altRunway,
        atis: d.atis,
        atisFreq: d.atisFreq,
        facilities: d.facilities,
        taxiRoute: d.taxiRoute,
        patternAltitude: d.patternAltitude,
        interceptAltitude: d.interceptAltitude,
        approachName: d.approachName,
        abbrevBy: {},
      },
    };
  }
  if (targetLeg === "departure") {
    const d = s.dep;
    return {
      ...s,
      leg: "departure",
      ctx: {
        ...s.ctx,
        airport: d.airport,
        airportName: d.airportName,
        runway: d.runway,
        altRunway: d.altRunway,
        atis: d.atis,
        atisFreq: d.atisFreq,
        facilities: d.facilities,
        taxiRoute: d.taxiRoute,
        patternAltitude: d.patternAltitude,
        interceptAltitude: d.interceptAltitude,
        approachName: d.approachName,
        abbrevBy: {},
      },
    };
  }
  return { ...s, leg: targetLeg };
}

export function switchDestinationAirport(s: FreeState, ap: Airport): FreeState {
  const destLeg = buildAirportLegContext(ap, {
    rng: makeRng(Date.now()),
    preferIls: s.rules === "IFR",
    ifrWeather: s.rules === "IFR",
  });
  const dist = Math.round(distanceNm(s.ctx.airport.lat, s.ctx.airport.lon, ap.lat, ap.lon));
  const brg = Math.round(
    norm360(
      bearingDeg(s.ctx.airport.lat, s.ctx.airport.lon, ap.lat, ap.lon) - s.ctx.airport.magVar,
    ),
  );
  const next: FreeState = {
    ...s,
    dest: destLeg,
    ctx: {
      ...s.ctx,
      destination: {
        icao: ap.icao,
        name: airportSpokenName(ap),
        bearing: brg,
        distanceNm: dist,
      },
    },
  };
  return s.leg === "destination" ? switchToLeg(next, "destination") : next;
}

export function createFreeState(o: FreeSetup): { state: FreeState; replies: FreeReply[] } {
  const plan = o.plan ?? null;
  const rules = plan ? plan.rules : o.rules;
  const destPref = o.destinationIcao ?? plan?.destination;
  const base = buildContext({
    airportIcao: o.airportIcao,
    aircraftId: o.aircraftId,
    callsign: o.callsign,
    rules,
    ...(destPref ? { destinationIcao: destPref } : {}),
    ...(o.goalId === "ifr-arrival" || o.goalId === "ifr-full-flight"
      ? { preferIls: true, ifrWeather: true }
      : {}),
    ...(o.goalId === "ifr-departure" ? { ifrWeather: true } : {}),
  });
  const ctx: ScenarioContext =
    plan?.cruiseAltFt && plan.cruiseAltFt >= 1000
      ? { ...base, ifrCruise: plan.cruiseAltFt, vfrCruise: plan.cruiseAltFt }
      : base;
  const dep = legFromCtx(ctx);
  const arrivalOnly =
    o.goalId === "vfr-arrival" || o.goalId === "ifr-arrival" || o.goalId === "pattern";
  const destAp = !arrivalOnly ? getAirport(ctx.destination.icao) : undefined;
  const dest =
    destAp && destAp.icao !== ctx.airport.icao
      ? buildAirportLegContext(destAp, {
          rng: makeRng(Date.now() + 97),
          preferIls: rules === "IFR",
          ifrWeather: rules === "IFR",
        })
      : null;

  const goalDef = FREE_GOALS.find((g) => g.id === o.goalId) ?? FREE_GOALS[0];
  const goal =
    o.goalId === "custom" && o.customGoal?.trim()
      ? o.customGoal.trim().slice(0, 200)
      : (goalDef?.describe(`${ctx.destination.name} (${ctx.destination.icao})`) ??
        "Radio practice");

  let phase: FreePhase = "ramp";
  let leg: FlightLeg = "departure";
  let currentStation: FacilityKey =
    rules === "IFR" ? "clearance" : ctx.airport.towered ? "ground" : "ctaf";
  let c: ScenarioContext = {
    ...ctx,
    position: `${ctx.parking}, ${ctx.airportName}`,
    altitude: ctx.airport.elevationFt,
    heading: ctx.runway.magHeading,
  };
  if (o.goalId === "vfr-arrival") {
    phase = "inbound";
    leg = "destination";
    currentStation = landingStation(ctx);
    c = {
      ...ctx,
      positionMiles: 10,
      position: `10 miles ${ctx.positionDir} of ${ctx.airportName}`,
      altitude: Math.round((ctx.patternAltitude + 1000) / 500) * 500,
      heading: r10(dirDeg(ctx.positionDir) + 180),
    };
  } else if (o.goalId === "ifr-arrival") {
    phase = "arrival";
    leg = "destination";
    currentStation = "approach";
    c = {
      ...ctx,
      position: `20 miles ${ctx.positionDir} of ${ctx.airportName}`,
      altitude: Math.max(
        ctx.interceptAltitude + 3000,
        Math.round((ctx.airport.elevationFt + 5000) / 1000) * 1000,
      ),
      heading: r10(dirDeg(ctx.positionDir) + 180),
    };
  }

  const state: FreeState = {
    ctx: c,
    dep,
    dest,
    leg,
    goalId: o.goalId,
    goal,
    rules,
    difficulty: o.difficulty,
    personality: o.personality,
    phase,
    currentStation,
    clearance: null,
    pending: null,
    ffActive: false,
    ffAsked: false,
    emergency: false,
    goalReached: false,
    flightPlan: plan
      ? {
          rules: plan.rules,
          departure: plan.departure,
          destination: plan.destination,
          route: plan.route,
          cruiseAltFt: plan.cruiseAltFt,
        }
      : o.goalId === "ifr-full-flight" || o.goalId === "vfr-full-flight"
        ? {
            rules,
            departure: c.airport.icao,
            destination: c.destination.icao,
            route: [],
            cruiseAltFt: rules === "IFR" ? c.ifrCruise : c.vfrCruise,
          }
        : null,
    evals: [],
    turn: 0,
  };
  const f = facilityOf(c, currentStation);
  const intro: FreeReply[] = [
    sys(
      `SIMULATED ATC — ${goal}. ${c.airport.icao} ${c.airport.name}, runway ${c.runway.id} in use${c.atisFreq ? `, ATIS ${formatFreqShort(c.atisFreq)}` : ""}. Training only — not real air traffic control.`,
      "caution",
    ),
    sys(startHint(state, f), "info"),
  ];
  return { state, replies: intro };
}

const DIR_DEG: Record<string, number> = {
  north: 0,
  northeast: 45,
  east: 90,
  southeast: 135,
  south: 180,
  southwest: 225,
  west: 270,
  northwest: 315,
};
const dirDeg = (w: string) => DIR_DEG[w] ?? 0;

function startHint(s: FreeState, f: Facility): string {
  const c = s.ctx;
  switch (s.phase) {
    case "inbound":
      return `You're ${c.position} at ${alt(c.altitude).text} ft. Get the ATIS, then call ${f.name} on ${formatFreqShort(f.mhz)} before entering the ${c.airport.towered ? `Class ${c.airport.airspace}` : "traffic pattern"}.`;
    case "arrival":
      return `IFR inbound, ${c.position} at ${alt(c.altitude).text} ft. Check in with ${f.name} on ${formatFreqShort(f.mhz)}.`;
    default:
      if (!c.airport.towered && s.rules === "VFR")
        return `You're at ${c.parking} at untowered ${c.airport.icao}. Check AWOS if available, then self-announce taxi and takeoff intentions on ${f.name} (${formatFreqShort(f.mhz)}).`;
      return s.rules === "IFR"
        ? `You're at ${c.parking} with an IFR flight plan to ${c.destination.name}${s.flightPlan ? ` (route: ${s.flightPlan.route.join(" ") || "direct"}, ${alt(s.flightPlan.cruiseAltFt).text} ft)` : ""}. Get the ATIS, then request your clearance from ${f.name} on ${formatFreqShort(f.mhz)}.`
        : `You're at ${c.parking}. Get the ATIS, then call ${f.name} on ${formatFreqShort(f.mhz)} for taxi.`;
  }
}

function sys(text: string, tone: FreeReply["tone"] = "info", delayMs = 0): FreeReply {
  return { kind: "system", phrase: { text, spoken: text }, delayMs, tone };
}

export function freeDirectory(s: FreeState) {
  const base = facilityDirectory(s.ctx);
  const seen = new Set(base.map((d) => `${d.name}|${d.mhz}`));
  const extraAirport =
    s.leg === "destination" ? (s.dep.airport.icao !== s.ctx.airport.icao ? s.dep : null) : s.dest;
  if (!extraAirport) return base;
  const extra = facilityDirectoryForFields(
    extraAirport.airportName,
    extraAirport.atisFreq,
    extraAirport.facilities,
    extraAirport.airport.towered,
  ).filter((d) => {
    const k = `${d.name}|${d.mhz}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return [...base, ...extra];
}

export function facilityAt(s: FreeState, mhz: number): Facility | null {
  const order: FacilityKey[] = [
    s.currentStation,
    "ground",
    "tower",
    "ctaf",
    "clearance",
    "departure",
    "approach",
    "center",
    "fss",
  ];
  for (const k of order) {
    const f = s.ctx.facilities[k];
    if (f && freqEquals(f.mhz, mhz)) return f;
  }
  const other = s.leg === "destination" ? s.dep : s.dest;
  if (other) {
    for (const k of order) {
      const f = other.facilities[k];
      if (f && freqEquals(f.mhz, mhz)) return f;
    }
  }
  return null;
}

function isDestFacility(s: FreeState, f: Facility): boolean {
  if (!s.dest || s.leg === "destination") return false;
  const inCurrent = Object.values(s.ctx.facilities).some(
    (cf) => cf && cf.name === f.name && freqEquals(cf.mhz, f.mhz),
  );
  if (inCurrent) return false;
  return Object.values(s.dest.facilities).some(
    (df) => df && df.name === f.name && freqEquals(df.mhz, f.mhz),
  );
}

// ---------------- instruction → readback expectations ----------------

/** Parse an ATC instruction into the elements the pilot must read back. */
export function extractReadback(atcText: string, ctx: ScenarioContext): Expect[] {
  const p = parseTransmission(atcText);
  const out: Expect[] = [];
  const rws = readRunways(p);
  const clearedish = hasAny(p, [
    "cleared to land",
    "cleared for takeoff",
    "line up and wait",
    "taxi",
    "cleared touch and go",
    "cleared for the option",
  ]);
  const approachCleared = hasAny(p, [
    "cleared ils",
    "cleared rnav",
    "cleared gps",
    "cleared localizer",
    "cleared visual",
  ]);
  if (rws[0] && (clearedish || approachCleared || hasAny(p, ["enter", "make"])))
    out.push({ kind: "runway", runway: rws[0], readback: true });
  const via = /taxi via ([a-z ,]+?)(?:,? hold short|\.|$)/i.exec(atcText);
  if (via?.[1]) {
    const letters = via[1]
      .split(/[ ,]+/)
      .map((w) => w.trim().toLowerCase())
      .filter(Boolean)
      .map((w) =>
        w.length === 1
          ? w
          : (Object.entries(PHONETIC)
              .find(([, v]) => v.toLowerCase() === w)?.[0]
              ?.toLowerCase() ?? ""),
      )
      .filter((x) => x.length === 1);
    if (letters.length)
      out.push({
        kind: "phrase",
        label: "Taxi route",
        any: [letters.join(" ")],
        all: letters,
        category: "readback",
        severity: "major",
        tip: `Read back the taxi route ("taxi via ${via[1].trim()}").`,
        say: `taxi via ${via[1].trim()}`,
      });
  }
  const holdIdx = p.tokens.indexOf("hold");
  if (holdIdx >= 0 && p.tokens[holdIdx + 1] === "short") {
    const after = readRunways(parseTransmission(p.tokens.slice(holdIdx).join(" ")));
    const r = after[0] ?? rws[0];
    if (r) out.push({ kind: "holdShort", runway: r });
  }
  const entry = /\b(enter|make) (left|right) (downwind|base|closed traffic|traffic)/i.exec(atcText);
  if (entry?.[2] && entry[3]) {
    const phr = `${entry[2].toLowerCase()} ${entry[3].toLowerCase().replace("closed ", "")}`;
    out.push({
      kind: "phrase",
      label: "Pattern instruction",
      any: [phr, `${entry[2].toLowerCase()} closed traffic`],
      category: "readback",
      severity: "major",
      tip: `Read back the pattern instruction ("${entry[0].toLowerCase()}").`,
      say: entry[0].toLowerCase(),
    });
  }
  if (hasPhrase(p, "cleared to land"))
    out.push({
      kind: "phrase",
      label: "Cleared to land",
      any: ["cleared to land", "clear to land"],
      category: ["phraseology", "readback"],
      severity: "critical",
      tip: `Read back "runway …, cleared to land".`,
      say: "cleared to land",
    });
  if (hasPhrase(p, "cleared for takeoff"))
    out.push({
      kind: "phrase",
      label: "Cleared for takeoff",
      any: ["cleared for takeoff", "clear for takeoff", "cleared takeoff"],
      category: ["phraseology", "readback"],
      severity: "critical",
      tip: `Read back "runway …, cleared for takeoff".`,
      say: "cleared for takeoff",
    });
  if (hasPhrase(p, "cleared touch and go") || /touch-and-go/i.test(atcText))
    out.push({
      kind: "phrase",
      label: "Cleared touch-and-go",
      any: ["touch and go"],
      category: ["phraseology", "readback"],
      severity: "critical",
      tip: `Read back "cleared touch-and-go".`,
      say: "cleared touch-and-go",
    });
  if (hasPhrase(p, "line up and wait"))
    out.push({
      kind: "phrase",
      label: "Line up and wait",
      any: ["line up and wait"],
      category: ["phraseology", "readback"],
      severity: "critical",
      tip: `Read back "line up and wait".`,
      say: "line up and wait",
    });
  if (hasPhrase(p, "go around"))
    out.push({
      kind: "phrase",
      label: "Going around",
      any: ["going around", "go around"],
      category: ["phraseology", "readback"],
      severity: "critical",
      tip: `Reply "going around".`,
      say: "going around",
    });
  if (
    hasAny(p, ["cleared ils", "cleared rnav", "cleared gps", "cleared localizer", "cleared visual"])
  )
    out.push({
      kind: "phrase",
      label: "Approach clearance",
      any: [
        "cleared ils",
        "cleared rnav",
        "cleared gps",
        "cleared localizer",
        "cleared visual",
        "cleared approach",
        "cleared for the",
      ],
      category: ["phraseology", "readback"],
      severity: "critical",
      tip: `Read back the approach clearance.`,
      say: `cleared ${approachPhrase(ctx.runway).text} approach`,
    });
  if (hasAny(p, ["maintain", "climb", "descend", "stop climb", "cross"])) {
    for (const a of readAltitudes(p).slice(0, 1))
      out.push({ kind: "altitude", ft: a, readback: true });
  }
  if (hasAny(p, ["until established"]))
    out.push({
      kind: "phrase",
      label: "Until established",
      any: ["until established", "established"],
      category: "readback",
      severity: "major",
      tip: `Include "until established".`,
      say: "until established",
    });
  for (const h of readHeadings(p).slice(0, 1))
    out.push({ kind: "heading", deg: h.deg, ...(h.turn ? { turn: h.turn } : {}), readback: true });
  if (hasPhrase(p, "runway heading")) out.push({ kind: "heading", deg: "runway", readback: true });
  if (hasAny(p, ["contact", "monitor", "departure frequency"]))
    for (const f of readFrequencies(p).slice(0, 1))
      out.push({ kind: "frequency", mhz: f, readback: true });
  for (const sq of readSquawks(p).slice(0, 1))
    if (sq !== "1200") out.push({ kind: "squawk", code: sq });
  if (hasPhrase(p, "maintain vfr"))
    out.push({
      kind: "phrase",
      label: "Maintain VFR",
      any: ["maintain vfr"],
      category: "readback",
      severity: "minor",
      tip: `Acknowledge "maintain VFR".`,
      say: "maintain VFR",
    });
  return out;
}

// ---------------- evaluation ----------------

function makeEval(
  s: FreeState,
  title: string,
  f: Facility | null,
  text: string,
  items: EvalItem[],
  example: string,
  aiScore?: number,
): TransmissionEval {
  const local = scoreItems(items, s.personality);
  return {
    id: `t${s.evals.length + 1}`,
    stepId: `turn-${s.turn}`,
    stepTitle: title,
    station: f?.name ?? "No station",
    text,
    attempt: 1,
    score: aiScore === undefined ? local : Math.round(local * 0.65 + aiScore * 0.35),
    items,
    delaySec: null,
    example,
    summary: summarize(items),
    at: Date.now(),
  };
}

/** Evaluate a pilot transmission locally (callsign, phraseology, pending readback, frequency). */
export function evaluatePilot(
  s: FreeState,
  text: string,
  f: Facility,
  opts: { aiScore?: number; aiIssues?: string[] } = {},
): { items: EvalItem[]; parsed: ParsedTransmission; kind: StepKind } {
  const allowed = !!s.ctx.abbrevBy[f.key];
  const pend = s.pending && s.pending.facility === f.key ? s.pending : null;
  const kind: StepKind = pend ? "readback" : allowed ? "request" : "initial";
  const expects: Expect[] = pend ? [...pend.expects] : [];
  if (!allowed) expects.push({ kind: "station", facility: f });
  const { items, parsed } = evaluateTransmission({
    text,
    expects,
    cs: s.ctx.cs,
    abbreviatedAllowed: allowed,
    kind,
    personality: s.personality,
  });
  items.push(correctFrequencyItem(f));
  for (const issue of (opts.aiIssues ?? []).slice(0, 4))
    items.push({
      label: "AI controller note",
      categories: ["phraseology"],
      ok: false,
      severity: "minor",
      message: issue,
    });
  return { items, parsed, kind };
}

// ---------------- scripted controller ----------------

function intentOf(p: ParsedTransmission, s?: FreeState) {
  if (hasAny(p, ["mayday", "pan pan", "engine failure", "declaring emergency"])) return "emergency";
  if (
    s?.emergency &&
    hasAny(p, ["souls", "fuel", "minutes", "hours", "on board", "person", "people"])
  )
    return "emergency-info";
  if (hasAny(p, ["say again"])) return "say-again";
  if (hasAny(p, ["radio check", "how do you read"])) return "radio-check";
  if (hasAny(p, ["going around", "go around", "missed approach", "executing missed"]))
    return "go-around";
  if (hasAny(p, ["divert", "diverting", "diversion", "change destination"])) return "divert";
  if (hasAny(p, ["progressive taxi", "unfamiliar", "which taxiway", "taxi instructions"]))
    return "progressive-taxi";
  if (hasAny(p, ["cancel ifr", "cancel flight following", "terminate radar", "cancel advisories"]))
    return "cancel-service";
  if (
    hasAny(p, ["wind check", "say winds", "say wind", "altimeter", "weather", "say atis"]) ||
    (hasPhrase(p, "current winds") && !hasPhrase(p, "taxi"))
  )
    return "weather-check";
  if (
    hasAny(p, ["where am i", "say position", "distance to", "how far"]) &&
    !hasPhrase(p, "inbound")
  )
    return "position-query";
  if (
    hasAny(p, ["ready to copy", "request clearance", "clearance"]) ||
    (hasPhrase(p, "ifr to") && !hasPhrase(p, "taxi"))
  )
    return "clearance";
  if (hasAny(p, ["clear of", "clear of runway", "off the runway"])) return "clear-runway";
  if (
    hasAny(p, [
      "frequency change",
      "leave the frequency",
      "leave frequency",
      "squawk vfr",
      "change frequency",
    ])
  )
    return "freq-change";
  if (hasAny(p, ["taxi", "taxiing"])) return "taxi";
  if (hasAny(p, ["ready for departure", "ready for takeoff", "ready to go", "holding short"]))
    return "ready";
  if (hasAny(p, ["flight following", "advisories", "request vfr"])) return "flight-following";
  if (hasAny(p, ["traffic in sight", "negative contact", "looking", "have the traffic"]))
    return "traffic";
  if (hasAny(p, ["established"])) return "established";
  if (hasAny(p, ["different runway", "opposite direction", "request runway", "change runway"]))
    return "runway-request";
  if (
    hasAny(p, [
      "request higher",
      "request lower",
      "request climb",
      "request descent",
      "request altitude",
    ]) ||
    (hasAny(p, ["climb to", "descend to", "request"]) && readAltitudes(p).length > 0)
  )
    return "altitude-request";
  if (
    hasAny(p, [
      "request vector",
      "request vectors",
      "vectors to",
      "vectors for",
      "direct to",
      "proceed direct",
    ])
  )
    return "vectors-direct";
  if (hasAny(p, ["downwind", "base", "final", "midfield", "crosswind", "upwind"]))
    return "position";
  if (
    hasAny(p, [
      "landing",
      "inbound",
      "full stop",
      "touch and go",
      "with information",
      "option",
      "closed traffic",
    ])
  )
    return "inbound";
  if (hasAny(p, ["request"])) return "request";
  if (readAltitudes(p).length) return "check-in";
  if (hasAny(p, ["roger", "wilco", "affirmative", "thanks", "thank you"])) return "ack";
  return "unknown";
}

const INTENT_TITLE: Record<string, string> = {
  emergency: "Emergency call",
  "emergency-info": "Emergency details",
  "say-again": "Say again",
  "radio-check": "Radio check",
  "go-around": "Go-around / missed approach",
  divert: "Diversion request",
  "progressive-taxi": "Progressive taxi request",
  "cancel-service": "Cancel radar/IFR service",
  "weather-check": "Weather / altimeter check",
  "position-query": "Position query",
  "runway-request": "Runway request",
  "altitude-request": "Altitude change request",
  "vectors-direct": "Vectors / direct-to request",
  clearance: "IFR clearance request",
  "clear-runway": "Clear of runway",
  "freq-change": "Frequency change request",
  taxi: "Taxi request",
  ready: "Ready for departure",
  "flight-following": "Flight following request",
  traffic: "Traffic response",
  established: "Established report",
  position: "Position report",
  inbound: "Initial call / inbound",
  request: "Request",
  "check-in": "Check-in",
  ack: "Acknowledgement",
  unknown: "Transmission",
  readback: "Readback",
};

function example(s: FreeState, intent: string, f: Facility): string {
  const c = s.ctx;
  const cs = csPhrase(c.cs, !!c.abbrevBy[f.key]).text;
  switch (intent) {
    case "taxi":
      if (f.key === "ctaf")
        return `${f.name}, ${cs}, at ${c.parking}, taxiing to runway ${c.runway.id}${s.rules === "VFR" ? `, VFR departure to the ${compassWord(c.departureHeading)}` : ""}.`;
      return s.rules === "IFR"
        ? `${f.name}, ${cs}, at ${c.parking}, with information ${PHONETIC[c.atis.letter]}, ready to taxi, IFR to ${c.destination.name}.`
        : `${f.name}, ${cs}, at ${c.parking}, with information ${PHONETIC[c.atis.letter]}, request taxi, VFR departure to the ${compassWord(c.departureHeading)}.`;
    case "ff-details":
      return `${cs}, ${c.aircraft.spokenType} slant ${PHONETIC[c.aircraft.equip]}, ${c.position}, ${alt(c.altitude).text}, request flight following to ${c.destination.name}.`;
    case "ready":
      return `${f.name}, ${cs}, holding short runway ${c.runway.id}, ready for departure.`;
    case "clearance":
      return `${f.name}, ${cs}, IFR to ${c.destination.name}, with information ${PHONETIC[c.atis.letter]}, request clearance.`;
    case "flight-following":
      return `${f.name}, ${cs}, request flight following.`;
    case "inbound":
      return `${f.name}, ${cs}, ${c.position}, ${alt(c.altitude).text}, with information ${PHONETIC[c.atis.letter]}, inbound for landing.`;
    case "check-in":
      return `${f.name}, ${cs}, ${alt(c.altitude).text}.`;
    case "weather-check":
      return `${f.name}, ${cs}, request altimeter and current winds.`;
    case "altitude-request":
      return `${f.name}, ${cs}, request ${alt(c.altitude + 2000).text}.`;
    default:
      return `${f.name}, ${cs}, <position>, <request>.`;
  }
}

export function readbackExample(s: FreeState, pend: PendingReadback, f: Facility): string {
  const cs = csPhrase(s.ctx.cs, true).text;
  const parts = pend.expects.map((e) => {
    switch (e.kind) {
      case "runway":
        return `runway ${usRunway(e.runway)}`;
      case "holdShort":
        return `hold short runway ${usRunway(e.runway)}`;
      case "altitude":
        return alt(e.ft).text;
      case "heading":
        return e.deg === "runway"
          ? "runway heading"
          : `${e.turn ? `${e.turn} ` : ""}heading ${hdg(e.deg).text}`;
      case "frequency":
        return formatFreqShort(e.mhz);
      case "squawk":
        return `squawk ${e.code}`;
      case "phrase":
        return e.say ?? e.label.toLowerCase();
      default:
        return "";
    }
  });
  void f;
  return `${[...new Set(parts.filter(Boolean))].join(", ")}, ${cs}.`.replace(/^./, (m) =>
    m.toUpperCase(),
  );
}

interface Ctl {
  s: FreeState;
  out: FreeReply[];
  delay: number;
}

function atc(
  c: Ctl,
  key: FacilityKey,
  build: (cs: Phrase) => Phrase,
  pending?: Omit<PendingReadback, "expects" | "instruction" | "facility"> | null,
  extraDelay = 0,
) {
  const f = facilityOf(c.s.ctx, key);
  const cs = csPhrase(c.s.ctx.cs, !!c.s.ctx.abbrevBy[key]);
  const phrase = capFirst(build(cs));
  c.out.push({
    kind: "atc",
    facility: f,
    phrase: { text: phrase.text, spoken: speakify(phrase.spoken) },
    delayMs: c.delay + extraDelay,
  });
  c.delay = 700;
  c.s = { ...c.s, ctx: { ...c.s.ctx, abbrevBy: { ...c.s.ctx.abbrevBy, [key]: true } } };
  if (pending) {
    const expects = extractReadback(phrase.text, c.s.ctx);
    c.s = {
      ...c.s,
      pending: expects.length
        ? { ...pending, expects, facility: key, instruction: phrase.text }
        : null,
    };
  }
}

function note(c: Ctl, text: string, tone: FreeReply["tone"] = "info") {
  c.out.push(sys(text, tone, c.delay));
}

function goalDone(c: Ctl, msg: string) {
  if (c.s.goalReached) return;
  c.s = { ...c.s, goalReached: true };
  note(c, `✓ Goal reached: ${msg} Keep practising, or press “End & score” for your report.`, "ok");
}

function personalityDelay(p: Personality) {
  return { instructor: 1500, professional: 1100, busy: 650, examiner: 1250 }[p];
}

function makeClearance(s: FreeState): Clearance {
  const c = s.ctx;
  const routeTxt =
    s.flightPlan && s.flightPlan.route.length
      ? `${s.flightPlan.route.slice(0, 3).join(" ")}, then as filed`
      : "as filed";
  return {
    limit: `the ${c.destination.name} airport`,
    route: s.flightPlan && s.flightPlan.route.length ? `radar vectors ${routeTxt}` : "as filed",
    altitude: c.ifrInitial,
    expectAltitude:
      s.flightPlan?.cruiseAltFt && s.flightPlan.cruiseAltFt > c.ifrInitial
        ? s.flightPlan.cruiseAltFt
        : c.ifrCruise,
    expectMinutes: 10,
    departureMhz: facilityOf(c, "departure").mhz,
    squawk: c.squawk,
  };
}

/** What happens after a correct readback (auto-progression). */
function afterReadback(c: Ctl, pend: PendingReadback) {
  const ctx = c.s.ctx;
  const vfr = c.s.rules === "VFR";
  const isFullFlight = c.s.goalId === "vfr-full-flight" || c.s.goalId === "ifr-full-flight";
  switch (pend.tag) {
    case "clearance": {
      const viaGround = !!facilityOf(ctx, "clearance").note;
      const gnd = groundStation(ctx);
      atc(c, pend.facility, (cs) =>
        viaGround || !gnd
          ? ph`${cs}, readback correct. Advise ready to taxi.`
          : ph`${cs}, readback correct. Contact ${facilityOf(ctx, "ground").name} ${freq(facilityOf(ctx, "ground").mhz)} when ready to taxi.`,
      );
      c.s = { ...c.s, currentStation: gnd ?? landingStation(ctx) };
      break;
    }
    case "taxi": {
      const twrKey = landingStation(ctx);
      c.s = {
        ...c.s,
        phase: "holding-short",
        ctx: { ...c.s.ctx, position: `holding short of runway ${ctx.runway.id}` },
      };
      note(
        c,
        `You taxi to runway ${ctx.runway.id} and complete the run-up. Holding short. Contact ${facilityOf(ctx, twrKey).name} ${formatFreqShort(facilityOf(ctx, twrKey).mhz)} when ready.`,
      );
      c.s = { ...c.s, currentStation: twrKey };
      break;
    }
    case "takeoff": {
      const airborneAlt = Math.round((ctx.airport.elevationFt + 900) / 100) * 100;
      c.s = {
        ...c.s,
        phase: c.s.goalId === "pattern" ? "pattern" : "airborne",
        ctx: { ...c.s.ctx, position: `departing runway ${ctx.runway.id}`, altitude: airborneAlt },
      };
      note(c, `Airborne — climbing through ${alt(airborneAlt).text} ft.`);
      c.delay = 3500;
      if (c.s.goalId === "pattern") {
        atc(
          c,
          landingStation(ctx),
          (cs) => ph`${cs}, report midfield ${ctx.runway.pattern} downwind.`,
        );
      } else if (!vfr || c.s.goalId === "vfr-departure-ff" || c.s.goalId === "vfr-full-flight") {
        atc(
          c,
          landingStation(ctx),
          (cs) =>
            ph`${cs}, contact ${facilityOf(ctx, "departure").name} ${freq(facilityOf(ctx, "departure").mhz)}.`,
          { tag: "handoff", next: "departure" },
        );
      } else {
        atc(c, landingStation(ctx), (cs) => ph`${cs}, frequency change approved.`);
        c.s = { ...c.s, phase: "enroute", leg: "enroute" };
        goalDone(c, "VFR departure complete.");
      }
      break;
    }
    case "handoff": {
      const next = pend.next ?? "departure";
      const destNext = c.s.dest?.facilities[next];
      if (
        c.s.dest &&
        c.s.leg !== "destination" &&
        destNext &&
        isDestFacility(c.s, destNext) &&
        pend.instruction.includes(destNext.name) &&
        pend.instruction.includes(formatFreqShort(destNext.mhz))
      ) {
        c.s = switchToLeg(c.s, "destination");
      }
      const nextCtx = c.s.ctx;
      const nf = facilityOf(nextCtx, next);
      c.s = {
        ...c.s,
        currentStation: next,
        ctx: { ...c.s.ctx, abbrevBy: { ...c.s.ctx.abbrevBy, [next]: false } },
      };
      if (next === "departure" || next === "approach" || next === "center")
        c.s = {
          ...c.s,
          ctx: {
            ...c.s.ctx,
            altitude: Math.max(
              c.s.ctx.altitude,
              Math.round((nextCtx.airport.elevationFt + 1500) / 100) * 100,
            ),
          },
        };
      if (c.s.difficulty === "beginner")
        note(
          c,
          `Tune ${nf.name} ${formatFreqShort(nf.mhz)} and check in with your callsign and altitude.`,
        );
      break;
    }
    case "squawk":
      c.s = {
        ...c.s,
        ffActive: true,
        phase: "enroute",
        leg: c.s.leg === "departure" ? "enroute" : c.s.leg,
        ctx: { ...c.s.ctx, squawk: ctx.squawk },
      };
      atc(
        c,
        c.s.currentStation,
        (cs) => ph`${cs}, radar contact, ${c.s.ctx.position}. Maintain VFR.`,
      );
      if (c.s.goalId === "vfr-departure-ff") goalDone(c, "flight following established.");
      else if (c.s.goalId === "vfr-full-flight" && c.s.dest)
        note(
          c,
          `Flight following established enroute to ${c.s.dest.airportName}. Talk with ${facilityOf(ctx, c.s.currentStation).name}, or use “Approach destination” when ready for arrival.`,
        );
      break;
    case "climb":
      c.s = {
        ...c.s,
        phase: "enroute",
        leg: c.s.leg === "departure" ? "enroute" : c.s.leg,
        ctx: { ...c.s.ctx, altitude: c.s.clearance?.expectAltitude ?? ctx.ifrCruise },
      };
      c.delay = 5000;
      atc(
        c,
        c.s.currentStation,
        (cs) =>
          ph`${cs}, contact ${facilityOf(ctx, "center").name} ${freq(facilityOf(ctx, "center").mhz)}.`,
        { tag: "handoff", next: "center" },
      );
      break;
    case "altitude": {
      const assigned = readAltitudes(parseTransmission(pend.instruction))[0];
      if (assigned) c.s = { ...c.s, ctx: { ...c.s.ctx, altitude: assigned } };
      break;
    }
    case "vectors": {
      const assignedHdg = readHeadings(parseTransmission(pend.instruction))[0];
      if (assignedHdg) c.s = { ...c.s, ctx: { ...c.s.ctx, heading: assignedHdg.deg } };
      break;
    }
    case "pattern-entry":
      c.s = {
        ...c.s,
        phase: "pattern",
        ctx: {
          ...c.s.ctx,
          altitude: ctx.patternAltitude,
          position: `entering ${ctx.runway.pattern} downwind runway ${ctx.runway.id}`,
        },
      };
      if (c.s.difficulty === "beginner")
        note(c, "Fly the pattern entry, then report midfield downwind as instructed.");
      break;
    case "landing": {
      c.s = {
        ...c.s,
        phase: "landed",
        ctx: {
          ...c.s.ctx,
          altitude: ctx.airport.elevationFt,
          position: `rolling out on runway ${ctx.runway.id}`,
        },
      };
      note(c, "Touchdown — slowing on the runway.");
      c.delay = 3000;
      if (c.s.goalId === "pattern" && !c.s.goalReached) {
        goalDone(c, "pattern work complete.");
      }
      const gnd = groundStation(ctx);
      if (gnd) {
        atc(
          c,
          "tower",
          (cs) =>
            ph`${cs}, turn ${ctx.runway.pattern} at ${letter(ctx.taxiRoute[0] ?? "A")}, contact ${facilityOf(ctx, "ground").name} ${freq(facilityOf(ctx, "ground").mhz)}.`,
          { tag: "handoff", next: "ground" },
        );
      } else {
        note(
          c,
          `Untowered field: exit the runway and announce clear of runway ${ctx.runway.id} on ${facilityOf(ctx, "ctaf").name}.`,
        );
        if (isFullFlight) c.s = { ...c.s, currentStation: "ctaf" };
      }
      break;
    }
    case "app-desc": {
      c.s = {
        ...c.s,
        phase: "arrival",
        ctx: {
          ...c.s.ctx,
          altitude: readAltitudes(parseTransmission(pend.instruction))[0] ?? ctx.altitude,
        },
      };
      const dw = r10(ctx.runway.magHeading + 180);
      c.delay = 4000;
      atc(
        c,
        c.s.currentStation,
        (cs) =>
          ph`${cs}, turn ${side(ctx.heading, dw)} heading ${hdg(dw)}, vector for the ${approachPhrase(ctx.runway)} approach.`,
        { tag: "app-vector" },
      );
      c.s = { ...c.s, ctx: { ...c.s.ctx, heading: dw } };
      break;
    }
    case "app-vector": {
      const ic = r10(ctx.runway.magHeading + (ctx.runway.pattern === "left" ? 30 : -30));
      c.delay = 5000;
      atc(
        c,
        c.s.currentStation,
        (cs) =>
          ph`${cs}, 6 miles from the final approach fix, turn ${side(ctx.heading, ic)} heading ${hdg(ic)}, maintain ${alt(ctx.interceptAltitude)} until established, cleared ${approachPhrase(ctx.runway)} approach.`,
        { tag: "app-clear" },
      );
      c.s = { ...c.s, ctx: { ...c.s.ctx, heading: ic, altitude: ctx.interceptAltitude } };
      break;
    }
    case "app-clear": {
      const twrKey = landingStation(ctx);
      c.s = {
        ...c.s,
        phase: "final",
        ctx: { ...c.s.ctx, position: `established on the ${approachPhrase(ctx.runway).text}` },
      };
      c.delay = 5000;
      if (ctx.airport.towered) {
        atc(
          c,
          c.s.currentStation,
          (cs) =>
            ph`${cs}, contact ${facilityOf(ctx, "tower").name} ${freq(facilityOf(ctx, "tower").mhz)}.`,
          { tag: "handoff", next: "tower" },
        );
      } else {
        atc(
          c,
          c.s.currentStation,
          (cs) =>
            ph`${cs}, radar service terminated, change to advisory frequency ${freq(facilityOf(ctx, "ctaf").mhz)} approved.`,
          { tag: "handoff", next: twrKey },
        );
      }
      break;
    }
    case "go-around":
      c.s = {
        ...c.s,
        phase: c.s.rules === "IFR" ? "arrival" : "pattern",
        ctx: {
          ...c.s.ctx,
          altitude: c.s.rules === "IFR" ? ctx.interceptAltitude : ctx.patternAltitude,
        },
      };
      break;
    case "emergency":
      note(c, "ATC is giving you priority handling. Continue to the airport and land.", "caution");
      break;
    default:
      break;
  }
}

/**
 * Rule-based controller for a pilot transmission. `f` is the facility the pilot reached.
 */
export function scriptedTurn(
  s0: FreeState,
  text: string,
  f: Facility,
): { state: FreeState; replies: FreeReply[]; evaluation: TransmissionEval } {
  // If pilot tuned a destination facility before the leg switched, switch active airport context cleanly.
  let working = s0;
  if (working.dest && working.leg !== "destination" && isDestFacility(working, f)) {
    working = switchToLeg(working, "destination");
  }

  const c: Ctl = {
    s: { ...working, turn: working.turn + 1 },
    out: [],
    delay: personalityDelay(working.personality),
  };
  const coach = working.difficulty === "beginner";
  const ev0 = evaluatePilot(c.s, text, f);
  const p = ev0.parsed;
  const rawIntent = intentOf(p, c.s);
  // Urgent or clarification calls bypass an unrelated pending readback.
  const bypassPending =
    rawIntent === "emergency" ||
    rawIntent === "go-around" ||
    rawIntent === "say-again" ||
    rawIntent === "radio-check";
  const pend = !bypassPending && c.s.pending && c.s.pending.facility === f.key ? c.s.pending : null;
  const intent = pend ? "readback" : rawIntent;
  const ctx = c.s.ctx;
  const vfr = c.s.rules === "VFR";
  const exampleText = pend ? readbackExample(c.s, pend, f) : example(c.s, intent, f);
  const evaluation = makeEval(
    c.s,
    INTENT_TITLE[intent] ?? "Transmission",
    f,
    text,
    ev0.items,
    exampleText,
  );
  c.s = { ...c.s, evals: [...c.s.evals, evaluation] };
  const missingCs = ev0.items.some((i) => i.label === "Callsign" && !i.ok);

  if (missingCs && f.key !== "ctaf") {
    atc(c, f.key, () =>
      pend
        ? ph`Station reading back, say callsign.`
        : ph`Aircraft calling ${f.name}, say again callsign.`,
    );
    if (coach)
      note(
        c,
        `Include your callsign (${c.s.ctx.abbrevBy[f.key] ? ctx.cs.abbrev : ctx.cs.full}).`,
        "caution",
      );
    return { state: c.s, replies: c.out, evaluation };
  }

  if (intent === "readback" && pend) {
    const failed = ev0.items.filter(
      (i) => !i.ok && i.severity === "critical" && !i.categories.includes("timing"),
    );
    if (failed.length) {
      const frags = failed.map((i) => i.correct).filter((x): x is string => !!x);
      atc(c, f.key, (cs) => ph`${cs}, negative, ${frags.join(", ") || pend.instruction}.`);
      if (coach) note(c, `Read back: “${exampleText}”`, "caution");
      return { state: c.s, replies: c.out, evaluation };
    }
    c.s = { ...c.s, pending: null };
    if (coach) note(c, "✓ Readback correct.", "ok");
    afterReadback(c, pend);
    return { state: c.s, replies: c.out, evaluation };
  }

  // Wrong facility for the request → redirect like a real controller would.
  const redirect = (to: FacilityKey) => {
    const t = facilityOf(ctx, to);
    atc(c, f.key, (cs) => ph`${cs}, ${f.name}, contact ${t.name} ${freq(t.mhz)}.`, {
      tag: "handoff",
      next: to,
    });
  };

  switch (intent) {
    case "emergency": {
      const word = hasPhrase(p, "mayday") ? "Mayday" : "Pan-Pan";
      c.s = { ...c.s, emergency: true, pending: null };
      const toApt = r10(dirDeg(ctx.positionDir) + 180);
      atc(
        c,
        f.key,
        (cs) =>
          ph`${cs}, roger ${word}. Squawk 7700. ${ctx.airportName} airport bears ${hdg(toApt)}, ${ctx.positionMiles} miles. Turn ${side(ctx.heading, toApt)} heading ${hdg(toApt)}. Say souls on board and fuel remaining.`,
        { tag: "emergency" },
      );
      break;
    }
    case "emergency-info":
      atc(
        c,
        f.key,
        (cs) =>
          ph`${cs}, roger, emergency equipment standing by at ${ctx.airportName}, cleared to land any runway.`,
      );
      c.s = { ...c.s, pending: null, phase: "final" };
      break;
    case "say-again":
      if (c.s.evals.length > 1)
        atc(
          c,
          f.key,
          (cs) => ph`${cs}, I say again, ${c.s.pending?.instruction ?? "say request"}.`,
        );
      else atc(c, f.key, (cs) => ph`${cs}, say request.`);
      break;
    case "radio-check":
      atc(c, f.key, (cs) =>
        c.s.personality === "instructor"
          ? ph`${cs}, ${f.name}, reading you loud and clear.`
          : ph`${cs}, ${f.name}, five by five.`,
      );
      break;
    case "weather-check":
      atc(
        c,
        f.key,
        (cs) =>
          ph`${cs}, ${f.name}, ${wind(ctx.atis.windDirMag, ctx.atis.windKt)}, ${ctx.airportName} altimeter ${altimeter(ctx.atis.altimeter)}, ${ctx.atis.sky.toLowerCase()}, information ${letter(ctx.atis.letter)} current.`,
      );
      break;
    case "position-query":
      atc(
        c,
        f.key,
        (cs) => ph`${cs}, ${f.name}, you are ${ctx.position}, altitude ${alt(ctx.altitude)} feet.`,
      );
      break;
    case "go-around": {
      c.s = { ...c.s, pending: null };
      if (f.key === "ctaf") {
        c.s = { ...c.s, phase: "pattern" };
        note(c, `Self-announced go-around on ${f.name}. Re-enter ${ctx.runway.pattern} traffic.`);
        break;
      }
      if (c.s.rules === "IFR") {
        const missedAlt = ctx.interceptAltitude;
        atc(
          c,
          f.key,
          (cs) =>
            ph`${cs}, roger, climb and maintain ${alt(missedAlt)}, fly runway heading, contact ${facilityOf(ctx, "approach").name} ${freq(facilityOf(ctx, "approach").mhz)}.`,
          { tag: "go-around" },
        );
        c.s = { ...c.s, phase: "arrival", currentStation: "approach" };
      } else {
        atc(
          c,
          f.key,
          (cs) =>
            ph`${cs}, roger, make ${ctx.runway.pattern} traffic runway ${rwy(ctx.runway.id)}, report midfield downwind.`,
          { tag: "go-around" },
        );
        c.s = { ...c.s, phase: "pattern" };
      }
      break;
    }
    case "divert": {
      const tokens = p.tokens.map((t) => t.toUpperCase());
      const matched = AIRPORTS.find(
        (a) =>
          a.icao !== ctx.airport.icao &&
          (tokens.includes(a.icao) ||
            tokens.includes(a.iata ?? "") ||
            p.canon.includes(a.city.toLowerCase())),
      );
      const target = matched ?? AIRPORTS.find((a) => a.icao !== ctx.airport.icao);
      if (!target) {
        atc(c, f.key, (cs) => ph`${cs}, say requested diversion airport.`);
        break;
      }
      c.s = switchDestinationAirport(c.s, target);
      const d = c.s.ctx.destination;
      const appFac = facilityOf(
        c.s.dest?.facilities ? { ...c.s.ctx, facilities: c.s.dest.facilities } : c.s.ctx,
        c.s.dest?.airport.towered ? "approach" : "ctaf",
      );
      atc(
        c,
        f.key,
        (cs) =>
          ph`${cs}, roger, cleared direct ${d.name}, heading ${hdg(d.bearing)}, ${d.distanceNm} miles. Contact ${appFac.name} ${freq(appFac.mhz)} approaching the airport.`,
        { tag: "vectors" },
      );
      c.s = { ...c.s, phase: "enroute", leg: "enroute" };
      break;
    }
    case "progressive-taxi": {
      const gnd = groundStation(ctx);
      if (gnd && f.key !== "ground") {
        redirect("ground");
        break;
      }
      const routeStr = ctx.taxiRoute.map((t) => PHONETIC[t] ?? t).join(", then ");
      atc(
        c,
        f.key,
        (cs) =>
          c.s.phase === "landed"
            ? ph`${cs}, turn onto taxiway ${route(ctx.taxiRoute)}, continue straight to ${ctx.parking}.`
            : ph`${cs}, turn onto ${routeStr || "Alpha"}, follow it to the hold short line for runway ${rwy(ctx.runway.id)}.`,
        c.s.phase === "landed" ? undefined : { tag: "taxi" },
      );
      break;
    }
    case "cancel-service":
      if (c.s.rules === "IFR") {
        c.s = { ...c.s, rules: "VFR", clearance: null, ffActive: false };
        atc(
          c,
          f.key,
          (cs) => ph`${cs}, IFR cancellation received, squawk VFR, frequency change approved.`,
        );
      } else {
        c.s = { ...c.s, ffActive: false };
        atc(
          c,
          f.key,
          (cs) => ph`${cs}, radar service terminated, squawk VFR, frequency change approved.`,
        );
      }
      break;
    case "runway-request": {
      const reqRwy = readRunways(p)[0];
      const end = reqRwy
        ? allRunwayEnds(ctx.airport).find((e) => usRunway(e.end.id) === reqRwy)
        : allRunwayEnds(ctx.airport).find((e) => usRunway(e.end.id) !== ctx.runway.id);
      if (!end) {
        atc(c, f.key, (cs) => ph`${cs}, unable that runway, runway ${rwy(ctx.runway.id)} in use.`);
        break;
      }
      const newRwy = {
        id: usRunway(end.end.id),
        dataId: end.end.id,
        magHeading: Math.round(norm360(end.end.trueHeading - ctx.airport.magVar)),
        pattern: end.end.pattern,
        ils: end.end.ils ? { freq: end.end.ils.freq, ident: end.end.ils.ident } : null,
      };
      c.s = { ...c.s, ctx: { ...ctx, runway: newRwy } };
      atc(c, f.key, (cs) => ph`${cs}, approved, expect runway ${rwy(newRwy.id)}.`, {
        tag: "runway",
      });
      break;
    }
    case "altitude-request": {
      if (f.key !== "departure" && f.key !== "approach" && f.key !== "center") {
        redirect(c.s.rules === "IFR" ? "center" : "approach");
        break;
      }
      const reqAlt = readAltitudes(p)[0];
      const nextAlt =
        reqAlt ??
        (hasAny(p, ["higher", "climb"])
          ? ctx.altitude + 2000
          : Math.max(2500, ctx.altitude - 2000));
      const verb = nextAlt >= ctx.altitude ? "climb and maintain" : "descend and maintain";
      atc(
        c,
        f.key,
        (cs) =>
          ph`${cs}, ${verb === "climb and maintain" ? "climb and maintain" : "descend and maintain"} ${alt(nextAlt)}.`,
        { tag: "altitude" },
      );
      break;
    }
    case "vectors-direct": {
      if (f.key !== "departure" && f.key !== "approach" && f.key !== "center") {
        redirect("approach");
        break;
      }
      const h =
        c.s.leg === "destination" && c.s.dest ? r10(c.s.ctx.heading) : r10(ctx.destination.bearing);
      atc(
        c,
        f.key,
        (cs) =>
          hasAny(p, ["direct"])
            ? ph`${cs}, cleared direct ${ctx.destination.name}, own navigation.`
            : ph`${cs}, turn ${side(ctx.heading, h)} heading ${hdg(h)}, radar vectors.`,
        hasAny(p, ["direct"]) ? undefined : { tag: "vectors" },
      );
      break;
    }
    case "clearance":
      if (f.key !== "clearance" && f.key !== "ground") {
        redirect("clearance");
        break;
      }
      if (vfr && !c.s.flightPlan) {
        atc(c, f.key, (cs) => ph`${cs}, I don't have an IFR flight plan for you. Say intentions.`);
        break;
      }
      {
        const cl = makeClearance(c.s);
        c.s = { ...c.s, clearance: cl, rules: "IFR" };
        atc(
          c,
          f.key,
          (cs) =>
            ph`${cs}, cleared to ${cl.limit} ${cl.route === "as filed" ? "as filed" : `via ${cl.route}`}. Climb and maintain ${alt(cl.altitude)}, expect ${alt(cl.expectAltitude)} ${cl.expectMinutes} minutes after departure. Departure frequency ${freq(cl.departureMhz)}, squawk ${squawk(cl.squawk)}.`,
          { tag: "clearance" },
        );
        c.s = {
          ...c.s,
          pending: c.s.pending
            ? {
                ...c.s.pending,
                expects: [
                  {
                    kind: "phrase",
                    label: "Clearance limit",
                    any: [ctx.destination.name, ctx.destination.icao],
                    category: "readback",
                    severity: "major",
                    tip: `Read back the clearance limit (${ctx.destination.name}).`,
                    say: `cleared to the ${ctx.destination.name} airport`,
                  },
                  {
                    kind: "phrase",
                    label: "Route",
                    any: cl.route === "as filed" ? ["as filed"] : ["vectors", "as filed"],
                    category: "readback",
                    severity: "major",
                    tip: `Read back the route (${cl.route}).`,
                    say: cl.route,
                  },
                  ...c.s.pending.expects,
                ],
              }
            : null,
        };
      }
      break;
    case "taxi":
      if (f.key === "ctaf") {
        if (c.s.phase === "landed") {
          c.s = { ...c.s, phase: "parked" };
          goalDone(c, `landed at ${ctx.airportName} and taxied clear.`);
        } else {
          c.s = { ...c.s, phase: "holding-short" };
          note(
            c,
            `Self-announced taxi on ${f.name}. Announce departure on runway ${ctx.runway.id}.`,
          );
        }
        break;
      }
      if (f.key !== "ground" && !(f.key === "clearance" && facilityOf(ctx, "clearance").note)) {
        redirect("ground");
        break;
      }
      if (c.s.phase === "landed") {
        atc(c, f.key, (cs) => ph`${cs}, taxi to ${ctx.parking} via ${route(ctx.taxiRoute)}.`);
        c.s = { ...c.s, phase: "parked" };
        const fullMsg =
          c.s.goalId === "vfr-full-flight" || c.s.goalId === "ifr-full-flight"
            ? `full flight complete at ${ctx.airportName} — taxied to parking.`
            : "landed and taxied in.";
        goalDone(c, fullMsg);
        break;
      }
      if (c.s.rules === "IFR" && !c.s.clearance) {
        atc(
          c,
          f.key,
          (cs) =>
            ph`${cs}, ${f.name}, I'll need you to pick up your IFR clearance first. Advise ready to copy.`,
        );
        c.s = { ...c.s, currentStation: "clearance" };
        break;
      }
      atc(
        c,
        "ground",
        (cs) =>
          ph`${cs}, ${f.name}, runway ${rwy(ctx.runway.id)}, taxi via ${route(ctx.taxiRoute)}, hold short of runway ${rwy(ctx.runway.id)}.`,
        { tag: "taxi" },
      );
      c.s = { ...c.s, phase: "taxiing" };
      break;
    case "ready":
      if (f.key === "ctaf") {
        const airborneAlt = Math.round((ctx.airport.elevationFt + 900) / 100) * 100;
        c.s = {
          ...c.s,
          phase: c.s.goalId === "pattern" ? "pattern" : "airborne",
          leg: c.s.goalId === "pattern" ? c.s.leg : "enroute",
          currentStation: c.s.goalId === "vfr-full-flight" || !vfr ? "departure" : "ctaf",
          ctx: { ...ctx, position: `departing runway ${ctx.runway.id}`, altitude: airborneAlt },
        };
        note(
          c,
          `Self-announced departing runway ${ctx.runway.id} on ${f.name}.${c.s.goalId === "vfr-full-flight" || !vfr ? ` Contact ${facilityOf(ctx, "departure").name} ${formatFreqShort(facilityOf(ctx, "departure").mhz)} airborne.` : ""}`,
        );
        break;
      }
      if (f.key !== "tower") {
        redirect("tower");
        break;
      }
      if (c.s.phase !== "holding-short" && c.s.phase !== "ramp" && c.s.phase !== "taxiing") {
        atc(c, f.key, (cs) => ph`${cs}, say position.`);
        break;
      }
      {
        const dep =
          c.s.goalId === "pattern" || hasAny(p, ["closed traffic"])
            ? ph`make ${ctx.runway.pattern} closed traffic`
            : vfr
              ? ph`${side(ctx.runway.magHeading, ctx.departureHeading)} downwind departure approved`
              : ph`turn ${side(ctx.runway.magHeading, ctx.departureHeading)} heading ${hdg(ctx.departureHeading)}`;
        atc(
          c,
          "tower",
          (cs) =>
            ph`${cs}, ${f.name}, ${wind(ctx.atis.windDirMag, ctx.atis.windKt)}, runway ${rwy(ctx.runway.id)}, cleared for takeoff, ${dep}.`,
          { tag: "takeoff" },
        );
      }
      break;
    case "flight-following":
      if (f.key !== "approach" && f.key !== "departure" && f.key !== "center") {
        redirect("departure");
        break;
      }
      if (p.wordCount <= 10 && !hasAny(p, [ctx.destination.name, ctx.destination.icao])) {
        atc(c, f.key, (cs) => ph`${cs}, ${f.name}, go ahead.`);
        c.s = { ...c.s, ffAsked: true };
      } else {
        c.s = { ...c.s, ffAsked: false };
        atc(
          c,
          f.key,
          (cs) =>
            ph`${cs}, squawk ${squawk(ctx.squawk)}, ${ctx.airportName} altimeter ${altimeter(ctx.atis.altimeter)}.`,
          { tag: "squawk" },
        );
      }
      break;
    case "check-in":
    case "request":
      if (
        (f.key === "departure" || f.key === "approach" || f.key === "center") &&
        c.s.ffAsked &&
        c.s.phase !== "arrival"
      ) {
        c.s = { ...c.s, ffAsked: false };
        atc(
          c,
          f.key,
          (cs) =>
            ph`${cs}, squawk ${squawk(ctx.squawk)}, ${ctx.airportName} altimeter ${altimeter(ctx.atis.altimeter)}.`,
          { tag: "squawk" },
        );
      } else if (f.key === "departure" || f.key === "approach" || f.key === "center") {
        if (
          c.s.phase === "arrival" ||
          (c.s.goalId === "ifr-arrival" && f.key === "approach") ||
          (c.s.leg === "destination" && f.key === "approach" && c.s.rules === "IFR")
        ) {
          const d = Math.max(ctx.interceptAltitude + 1000, ctx.altitude - 2000);
          atc(
            c,
            f.key,
            (cs) =>
              ph`${cs}, ${f.name}, descend and maintain ${alt(d)}, ${ctx.airportName} altimeter ${altimeter(ctx.atis.altimeter)}, expect vectors ${approachPhrase(ctx.runway)} approach.`,
            { tag: "app-desc" },
          );
        } else if (c.s.rules === "IFR" && f.key === "departure") {
          const cruise = c.s.clearance?.expectAltitude ?? ctx.ifrCruise;
          atc(
            c,
            f.key,
            (cs) => ph`${cs}, ${f.name}, radar contact. Climb and maintain ${alt(cruise)}.`,
            { tag: "climb" },
          );
        } else if (f.key === "center") {
          atc(c, f.key, (cs) => ph`${cs}, ${f.name}, roger.`);
          c.s = { ...c.s, phase: "enroute", leg: c.s.leg === "departure" ? "enroute" : c.s.leg };
          if (c.s.goalId === "ifr-departure")
            goalDone(c, "IFR departure complete and handed off to Center.");
          else if (c.s.goalId === "ifr-full-flight" && c.s.dest && c.s.leg !== "destination")
            note(
              c,
              `With ${f.name} enroute to ${c.s.dest.airportName}. Request altitude/weather, or use “Approach destination” when ready for arrival.`,
            );
        } else if (intent === "request" || hasAny(p, ["flight following"])) {
          atc(c, f.key, (cs) => ph`${cs}, ${f.name}, go ahead.`);
        } else {
          atc(
            c,
            f.key,
            (cs) => ph`${cs}, ${f.name}, radar contact${c.s.ffActive ? "" : `, say request`}.`,
          );
        }
      } else if (f.key === "tower" && c.s.phase === "final") {
        atc(
          c,
          "tower",
          (cs) =>
            ph`${cs}, ${f.name}, ${wind(ctx.atis.windDirMag, ctx.atis.windKt)}, runway ${rwy(ctx.runway.id)}, cleared to land.`,
          { tag: "landing" },
        );
      } else if (f.key === "tower" && c.s.phase === "inbound") {
        atc(
          c,
          "tower",
          (cs) =>
            ph`${cs}, ${f.name}, enter ${ctx.runway.pattern} downwind runway ${rwy(ctx.runway.id)}, report midfield downwind.`,
          { tag: "pattern-entry" },
        );
      } else if (f.key === "ctaf") {
        note(c, `Transmitted on ${f.name} (${formatFreqShort(f.mhz)}).`);
      } else {
        atc(c, f.key, (cs) => ph`${cs}, ${f.name}, say request.`);
      }
      break;
    case "inbound":
    case "established":
      if (f.key === "ctaf") {
        c.s = { ...c.s, phase: hasAny(p, ["final"]) ? "final" : "pattern" };
        note(
          c,
          `Self-announced on ${f.name}. Land on runway ${ctx.runway.id}, then report clear of the runway.`,
        );
        break;
      }
      if ((f.key === "approach" || f.key === "center") && c.s.phase === "arrival") {
        const d = Math.max(ctx.interceptAltitude + 1000, ctx.altitude - 2000);
        atc(
          c,
          f.key,
          (cs) =>
            ph`${cs}, ${f.name}, descend and maintain ${alt(d)}, ${ctx.airportName} altimeter ${altimeter(ctx.atis.altimeter)}, expect vectors ${approachPhrase(ctx.runway)} approach.`,
          { tag: "app-desc" },
        );
      } else if (
        f.key === "tower" &&
        (c.s.phase === "inbound" || c.s.phase === "enroute" || c.s.phase === "airborne")
      ) {
        c.s = { ...c.s, phase: "inbound" };
        atc(
          c,
          "tower",
          (cs) =>
            ph`${cs}, ${f.name}, enter ${ctx.runway.pattern} downwind runway ${rwy(ctx.runway.id)}, report midfield downwind.`,
          { tag: "pattern-entry" },
        );
      } else if (f.key === "tower" && (c.s.phase === "final" || c.s.phase === "pattern")) {
        atc(
          c,
          "tower",
          (cs) =>
            ph`${cs}, ${f.name}, ${wind(ctx.atis.windDirMag, ctx.atis.windKt)}, runway ${rwy(ctx.runway.id)}, ${hasAny(p, ["touch and go", "option"]) ? "cleared touch-and-go" : "cleared to land"}.`,
          { tag: "landing" },
        );
      } else if (intent === "established" && (f.key === "approach" || f.key === "departure")) {
        const twr = landingStation(ctx);
        atc(
          c,
          f.key,
          (cs) =>
            ctx.airport.towered
              ? ph`${cs}, roger, contact ${facilityOf(ctx, "tower").name} ${freq(facilityOf(ctx, "tower").mhz)}.`
              : ph`${cs}, roger, radar service terminated, change to advisory frequency ${freq(facilityOf(ctx, "ctaf").mhz)} approved.`,
          { tag: "handoff", next: twr },
        );
      } else if (f.key === "approach" || f.key === "departure" || f.key === "center") {
        // If pilot reports inbound to destination while still on Center/Departure, switch to dest!
        if (c.s.dest && c.s.leg !== "destination") {
          c.s = switchToLeg(c.s, "destination");
        }
        const dCtx = c.s.ctx;
        const twr = landingStation(dCtx);
        atc(
          c,
          f.key,
          (cs) =>
            dCtx.airport.towered
              ? ph`${cs}, ${f.name}, ${dCtx.airportName} altimeter ${altimeter(dCtx.atis.altimeter)}, contact ${facilityOf(dCtx, "tower").name} ${freq(facilityOf(dCtx, "tower").mhz)} for landing.`
              : ph`${cs}, ${f.name}, ${dCtx.airportName} altimeter ${altimeter(dCtx.atis.altimeter)}, radar service terminated, change to ${facilityOf(dCtx, "ctaf").name} ${freq(facilityOf(dCtx, "ctaf").mhz)} approved.`,
          { tag: "handoff", next: twr },
        );
        c.s = { ...c.s, phase: "inbound" };
      } else {
        atc(c, f.key, (cs) => ph`${cs}, ${f.name}, say request.`);
      }
      break;
    case "position":
      if (f.key === "ctaf") {
        c.s = { ...c.s, phase: hasAny(p, ["final"]) ? "final" : "pattern" };
        note(c, `Self-announced pattern position on ${f.name}.`);
        break;
      }
      if (f.key !== "tower") {
        atc(c, f.key, (cs) => ph`${cs}, ${f.name}, roger.`);
        break;
      }
      if (hasAny(p, ["touch and go", "option"]))
        atc(c, "tower", (cs) => ph`${cs}, runway ${rwy(ctx.runway.id)}, cleared touch-and-go.`, {
          tag: "landing",
        });
      else
        atc(
          c,
          "tower",
          (cs) => ph`${cs}, number one, runway ${rwy(ctx.runway.id)}, cleared to land.`,
          { tag: "landing" },
        );
      c.s = { ...c.s, phase: "final" };
      break;
    case "clear-runway": {
      if (f.key === "ctaf") {
        c.s = { ...c.s, phase: "parked" };
        goalDone(c, `landed at ${ctx.airportName} and clear of the runway.`);
        break;
      }
      if (f.key !== "ground" && !(f.key === "clearance" && facilityOf(ctx, "clearance").note)) {
        redirect("ground");
        break;
      }
      atc(
        c,
        "ground",
        (cs) => ph`${cs}, ${f.name}, taxi to ${ctx.parking} via ${route(ctx.taxiRoute)}.`,
      );
      c.s = { ...c.s, phase: "parked" };
      const doneMsg =
        c.s.goalId === "vfr-full-flight" || c.s.goalId === "ifr-full-flight"
          ? `full flight complete at ${ctx.airportName} — landed and taxied to parking.`
          : "landed and taxied in.";
      goalDone(c, doneMsg);
      break;
    }
    case "freq-change":
      atc(c, f.key, (cs) =>
        c.s.rules === "VFR"
          ? ph`${cs}, radar service terminated, squawk VFR, frequency change approved.`
          : ph`${cs}, frequency change approved, report back on this frequency.`,
      );
      if (c.s.rules === "VFR") c.s = { ...c.s, ffActive: false };
      break;
    case "traffic":
      atc(c, f.key, (cs) => ph`${cs}, roger.`);
      break;
    case "ack":
      if (c.s.emergency)
        atc(c, f.key, (cs) => ph`${cs}, roger, emergency equipment will be standing by.`);
      else if (f.key !== "ctaf") atc(c, f.key, (cs) => ph`${cs}, roger.`);
      break;
    default:
      if (f.key === "ctaf") {
        note(c, `Advisory transmitted on ${f.name}.`);
      } else {
        atc(c, f.key, (cs) => ph`${cs}, ${f.name}, say again.`);
        if (coach) note(c, `Not sure what you need? Try: “${exampleText}”`, "info");
      }
  }
  if (coach && ev0.items.some((i) => !i.ok && i.label !== "Callsign")) {
    const tips = ev0.items
      .filter((i) => !i.ok)
      .slice(0, 3)
      .map((i) => `• ${i.message}`);
    note(c, `Tips:\n${tips.join("\n")}`, "caution");
  }
  return { state: c.s, replies: c.out, evaluation };
}

/** Transmission on a frequency with no station (or not the one you think). */
export function noStationTurn(
  s: FreeState,
  text: string,
  mhz: number,
): { state: FreeState; replies: FreeReply[]; evaluation: TransmissionEval } {
  const expected = facilityOf(s.ctx, s.currentStation);
  const items = [wrongFrequencyItem(expected, mhz)];
  const evaluation = makeEval(
    { ...s },
    "Transmission on wrong frequency",
    null,
    text,
    items,
    `Tune ${expected.name} ${formatFreqShort(expected.mhz)} first.`,
  );
  const msg =
    s.difficulty === "checkride"
      ? "No response."
      : `No response on ${formatFreqShort(mhz)}. ${s.difficulty === "beginner" ? `You probably want ${expected.name} on ${formatFreqShort(expected.mhz)}.` : "Check your frequency."}`;
  return {
    state: { ...s, turn: s.turn + 1, evals: [...s.evals, evaluation] },
    replies: [sys(msg, "warning")],
    evaluation,
  };
}

/** Pilot keyed the mic while someone else was transmitting. */
export function blockedTurn(
  s: FreeState,
  text: string,
  f: Facility,
): { state: FreeState; replies: FreeReply[]; evaluation: TransmissionEval } {
  const evaluation = makeEval(
    s,
    "Blocked transmission",
    f,
    text,
    [blockedItem()],
    "Wait for a pause, then transmit.",
  );
  const msg =
    s.difficulty === "checkride"
      ? "Your transmission was blocked (frequency busy)."
      : "Blocked — you keyed the mic while another station was transmitting. Wait for a break, then call again.";
  return {
    state: { ...s, turn: s.turn + 1, evals: [...s.evals, evaluation] },
    replies: [sys(msg, "warning")],
    evaluation,
  };
}

// ---------------- AI support ----------------

export function aiStateSnapshot(
  s: FreeState,
  telemetry?: Record<string, unknown>,
): Record<string, unknown> {
  const c = s.ctx;
  const dir = freeDirectory(s);
  return {
    leg: s.leg,
    airport: {
      icao: c.airport.icao,
      name: c.airport.name,
      towered: c.airport.towered,
      elevationFt: c.airport.elevationFt,
      airspace: `Class ${c.airport.airspace}`,
    },
    runwayInUse: c.runway.id,
    runwaysAvailable: allRunwayEnds(c.airport).map((e) => usRunway(e.end.id)),
    trafficPattern: `${c.runway.pattern} traffic for runway ${c.runway.id}, pattern altitude ${c.patternAltitude} ft`,
    taxiways: c.airport.taxiways,
    parking: c.parking,
    atis: {
      letter: c.atis.letter,
      windDirMag: c.atis.windDirMag,
      windKt: c.atis.windKt,
      altimeter: c.atis.altimeter,
      sky: c.atis.sky,
      text: c.atis.phrase.text,
    },
    stations: dir.map((d) => ({
      name: d.name,
      type: d.station,
      frequency: formatFreqShort(d.mhz),
    })),
    currentStation: facilityOf(c, s.currentStation).name,
    aircraft: {
      callsign: c.cs.full,
      abbreviated: c.cs.abbrev,
      canAbbreviate: c.cs.canAbbreviate,
      type: c.aircraft.spokenType,
      equipment: `/${c.aircraft.equip}`,
    },
    flightRules: s.rules,
    flightFollowingActive: s.ffActive,
    phase: s.phase,
    position: c.position,
    altitudeFt: c.altitude,
    headingMag: c.heading,
    squawk: s.emergency ? "7700" : s.ffActive || s.clearance ? c.squawk : "1200",
    departureAirport: {
      icao: s.dep.airport.icao,
      name: s.dep.airportName,
      runwayInUse: s.dep.runway.id,
    },
    destination: {
      icao: c.destination.icao,
      name: c.destination.name,
      bearingMag: c.destination.bearing,
      distanceNm: c.destination.distanceNm,
    },
    ...(s.dest
      ? {
          destinationAirport: {
            icao: s.dest.airport.icao,
            name: s.dest.airportName,
            towered: s.dest.airport.towered,
            elevationFt: s.dest.airport.elevationFt,
            runwayInUse: s.dest.runway.id,
            runwaysAvailable: allRunwayEnds(s.dest.airport).map((e) => usRunway(e.end.id)),
            trafficPattern: `${s.dest.runway.pattern} traffic for runway ${s.dest.runway.id}, pattern altitude ${s.dest.patternAltitude} ft`,
            atis: { letter: s.dest.atis.letter, text: s.dest.atis.phrase.text },
            stations: facilityDirectoryForFields(
              s.dest.airportName,
              s.dest.atisFreq,
              s.dest.facilities,
              s.dest.airport.towered,
            ).map((d) => ({
              name: d.name,
              type: d.station,
              frequency: formatFreqShort(d.mhz),
            })),
          },
        }
      : {}),
    flightPlan: s.flightPlan,
    activeClearance: s.clearance
      ? {
          limit: s.clearance.limit,
          route: s.clearance.route,
          altitude: s.clearance.altitude,
          expect: `${s.clearance.expectAltitude} ${s.clearance.expectMinutes} min after departure`,
          departureFrequency: formatFreqShort(s.clearance.departureMhz),
          squawk: s.clearance.squawk,
        }
      : null,
    suggestedValues: {
      squawkToAssign: c.squawk,
      vfrCruise: c.vfrCruise,
      ifrInitial: c.ifrInitial,
      ifrCruise: c.ifrCruise,
      departureHeading: c.departureHeading,
      approach: approachPhrase(c.runway).text,
      interceptAltitude: c.interceptAltitude,
    },
    pendingReadback: s.pending ? s.pending.instruction : null,
    emergencyDeclared: s.emergency,
    goalReached: s.goalReached,
    ...(telemetry ? { telemetry } : {}),
  };
}

export interface AiAtcJson {
  station?: unknown;
  transmission?: unknown;
  stateUpdates?: Record<string, unknown>;
  evaluation?: { score?: unknown; issues?: unknown };
  hint?: unknown;
}

const META_RE =
  /\b(as an ai|language model|i cannot|i can't help|i'm sorry|openai|gemini|anthropic|real[- ]world (?:clearance|instruction))\b/i;

/**
 * Validate an AI controller reply against the airport/scenario and apply it.
 * Returns ok:false (→ use scripted fallback for this turn) if it breaks a guardrail.
 */
export function applyAiTurn(
  s0: FreeState,
  json: AiAtcJson,
  text: string,
  f: Facility,
):
  | {
      ok: true;
      state: FreeState;
      replies: FreeReply[];
      evaluation: TransmissionEval;
      hint: string;
      issues: string[];
    }
  | { ok: false; reason: string } {
  const ctx0 = s0.ctx;
  const dir = freeDirectory(s0);
  const transmission =
    typeof json.transmission === "string" ? json.transmission.trim().replace(/\s+/g, " ") : null;
  if (transmission === null) return { ok: false, reason: "missing transmission" };
  if (transmission.length > 500) return { ok: false, reason: "transmission too long" };
  if (META_RE.test(transmission)) return { ok: false, reason: "off-role transmission" };

  const u = json.stateUpdates && typeof json.stateUpdates === "object" ? json.stateUpdates : {};
  const divertCode = typeof u["divertTo"] === "string" ? u["divertTo"].trim().toUpperCase() : "";
  const divertAp = divertCode ? getAirport(divertCode) : undefined;

  // Guardrail: runways and frequencies mentioned must exist at departure, destination, or divert airport.
  const allAps: Airport[] = [ctx0.airport];
  if (s0.dep.airport.icao !== ctx0.airport.icao) allAps.push(s0.dep.airport);
  if (s0.dest && s0.dest.airport.icao !== ctx0.airport.icao) allAps.push(s0.dest.airport);
  if (divertAp && !allAps.some((a) => a.icao === divertAp.icao)) allAps.push(divertAp);

  const parsed = parseTransmission(transmission);
  const validRunways = new Set(
    allAps.flatMap((ap) => allRunwayEnds(ap).map((e) => usRunway(e.end.id))),
  );
  for (const r of readRunways(parsed))
    if (!validRunways.has(r)) return { ok: false, reason: `unknown runway ${r}` };

  const divertDir = divertAp
    ? (() => {
        const leg = buildAirportLegContext(divertAp, {
          preferIls: s0.rules === "IFR",
          ifrWeather: s0.rules === "IFR",
        });
        return facilityDirectoryForFields(
          leg.airportName,
          leg.atisFreq,
          leg.facilities,
          leg.airport.towered,
        );
      })()
    : [];
  const validFreqs = [
    ...dir.map((d) => d.mhz),
    ...divertDir.map((d) => d.mhz),
    ...allAps.flatMap((ap) =>
      allRunwayEnds(ap).flatMap((e) => (e.end.ils ? [e.end.ils.freq] : [])),
    ),
  ];
  for (const fr of readFrequencies(parsed))
    if (!validFreqs.some((v) => freqEquals(v, fr)))
      return { ok: false, reason: `unknown frequency ${fr}` };
  const maxAlt = s0.rules === "VFR" ? 17500 : 45000;
  for (const a of readAltitudes(parsed))
    if (a < 300 || a > maxAlt) return { ok: false, reason: `implausible altitude ${a}` };
  for (const h of readHeadings(parsed))
    if (h.deg < 1 || h.deg > 360) return { ok: false, reason: "invalid heading" };

  // Station must be a known facility across active, departure, or destination (default: the one called).
  const stationName = typeof json.station === "string" ? json.station.toLowerCase() : "";
  const allFacilities = [
    ...Object.values(ctx0.facilities),
    ...Object.values(s0.dep.facilities),
    ...(s0.dest ? Object.values(s0.dest.facilities) : []),
  ].filter((x): x is Facility => !!x);
  const replyFac =
    allFacilities.find(
      (x) =>
        stationName &&
        (x.name.toLowerCase() === stationName || stationName.includes(x.name.toLowerCase())),
    ) ?? f;

  // Evaluate the pilot (locally) + AI score/issues.
  const aiScore =
    typeof json.evaluation?.score === "number" && Number.isFinite(json.evaluation.score)
      ? Math.max(0, Math.min(100, Math.round(json.evaluation.score)))
      : undefined;
  const issues = Array.isArray(json.evaluation?.issues)
    ? (json.evaluation.issues as unknown[])
        .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
        .map((x) => x.slice(0, 300))
        .slice(0, 4)
    : [];
  const s1: FreeState = { ...s0, turn: s0.turn + 1 };
  const ev = evaluatePilot(s1, text, f, { aiIssues: issues });
  const pend = s1.pending && s1.pending.facility === f.key ? s1.pending : null;
  const evaluation = makeEval(
    s1,
    pend ? "Readback" : "Transmission",
    f,
    text,
    ev.items,
    pend ? readbackExample(s1, pend, f) : example(s1, intentOf(ev.parsed), f),
    aiScore,
  );

  // Apply sanitised state updates (handles leg switching and diversions before context fields).
  let s: FreeState = { ...s1, evals: [...s1.evals, evaluation] };
  if (divertAp && divertAp.icao !== s.ctx.airport.icao) {
    s = switchDestinationAirport(s, divertAp);
  }
  if (typeof u["leg"] === "string") {
    const legVal = u["leg"].toLowerCase();
    if (legVal === "departure" || legVal === "enroute" || legVal === "destination") {
      s = switchToLeg(s, legVal);
    }
  } else if (isDestFacility(s, replyFac) && s.dest) {
    s = switchToLeg(s, "destination");
  }

  let c: ScenarioContext = { ...s.ctx, abbrevBy: { ...s.ctx.abbrevBy, [replyFac.key]: true } };
  const num = (v: unknown) =>
    typeof v === "number" && Number.isFinite(v)
      ? v
      : typeof v === "string" && v.trim() && Number.isFinite(Number(v))
        ? Number(v)
        : null;
  if (typeof u["position"] === "string" && u["position"].trim())
    c = { ...c, position: u["position"].trim().slice(0, 120) };
  const altU = num(u["altitude"]);
  if (altU !== null && altU >= 0 && altU <= maxAlt) c = { ...c, altitude: Math.round(altU) };
  const hdgU = num(u["heading"]);
  if (hdgU !== null && hdgU >= 1 && hdgU <= 360) c = { ...c, heading: Math.round(hdgU) };
  const activeValidRunways = new Set(allRunwayEnds(c.airport).map((e) => usRunway(e.end.id)));
  if (typeof u["runway"] === "string" && activeValidRunways.has(usRunway(u["runway"]))) {
    const end = allRunwayEnds(c.airport).find(
      (e) => usRunway(e.end.id) === usRunway(String(u["runway"])),
    );
    if (end)
      c = {
        ...c,
        runway: {
          ...c.runway,
          id: usRunway(end.end.id),
          dataId: end.end.id,
          magHeading: Math.round(norm360(end.end.trueHeading - c.airport.magVar)),
          pattern: end.end.pattern,
          ils: end.end.ils ? { freq: end.end.ils.freq, ident: end.end.ils.ident } : null,
        },
      };
  }
  if (
    typeof u["squawk"] === "string" &&
    /^[0-7]{4}$/.test(u["squawk"]) &&
    (s.emergency || !["7500", "7600", "7700"].includes(u["squawk"]))
  )
    c = { ...c, squawk: u["squawk"] };
  if (typeof u["ffActive"] === "boolean") s = { ...s, ffActive: u["ffActive"] };
  const stationU = typeof u["currentStation"] === "string" ? u["currentStation"].toLowerCase() : "";
  const freqU = num(u["frequency"]);
  const nextFacCandidates = [
    ...Object.values(c.facilities),
    ...(s.dest ? Object.values(s.dest.facilities) : []),
    ...Object.values(s.dep.facilities),
  ].filter((x): x is Facility => !!x);
  const nextFac = nextFacCandidates.find(
    (x) =>
      (stationU && x.name.toLowerCase() === stationU) ||
      (freqU !== null && freqEquals(x.mhz, freqU)),
  );
  if (nextFac) s = { ...s, currentStation: nextFac.key };
  if (typeof u["phase"] === "string") {
    const ph0 = u["phase"].toLowerCase();
    const phases: FreePhase[] = [
      "ramp",
      "taxiing",
      "holding-short",
      "airborne",
      "enroute",
      "inbound",
      "pattern",
      "final",
      "landed",
      "parked",
      "arrival",
    ];
    const m = phases.find((x) => ph0.includes(x));
    if (m) s = { ...s, phase: m };
  }
  const cl = u["clearance"];
  if (cl && typeof cl === "object") {
    const o = cl as Record<string, unknown>;
    const a = num(o["altitude"]);
    const ea = num(o["expectAltitude"]);
    const df = num(o["departureFrequency"]);
    const sq =
      typeof o["squawk"] === "string" && /^[0-7]{4}$/.test(o["squawk"]) ? o["squawk"] : null;
    if (typeof o["limit"] === "string" && a !== null && a > 0 && a <= 45000) {
      s = {
        ...s,
        clearance: {
          limit: o["limit"].slice(0, 120),
          route: typeof o["route"] === "string" ? o["route"].slice(0, 160) : "as filed",
          altitude: Math.round(a),
          expectAltitude: ea !== null && ea > 0 && ea <= 45000 ? Math.round(ea) : c.ifrCruise,
          expectMinutes: 10,
          departureMhz:
            df !== null && validFreqs.some((v) => freqEquals(v, df))
              ? df
              : facilityOf(c, "departure").mhz,
          squawk: sq ?? c.squawk,
        },
      };
    }
  }
  if (hasAny(parseTransmission(text), ["mayday", "pan pan"])) s = { ...s, emergency: true };
  if (s.phase === "parked" && (!s.dest || s.leg === "destination")) {
    s = { ...s, goalReached: true };
  }

  // Pending readback from the AI instruction.
  const expects = transmission ? extractReadback(transmission, c) : [];
  s = {
    ...s,
    ctx: c,
    pending: expects.length
      ? { expects, tag: "generic", facility: replyFac.key, instruction: transmission }
      : pend
        ? null
        : s.pending,
  };

  const replies: FreeReply[] = [];
  if (transmission)
    replies.push({
      kind: "atc",
      facility: replyFac,
      phrase: { text: transmission, spoken: speakify(transmission) },
      delayMs: personalityDelay(s.personality),
    });
  const hint =
    s.difficulty === "checkride" || typeof json.hint !== "string"
      ? ""
      : json.hint.trim().slice(0, 300);
  return { ok: true, state: s, replies, evaluation, hint, issues };
}

/**
 * Advance a multi-leg flight from departure/enroute to the destination arrival leg
 * (used in /ai-atc so pilots can fly end-to-end into the destination airport).
 */
export function advanceFreeFlight(s: FreeState): { state: FreeState; replies: FreeReply[] } {
  if (!s.dest || s.leg === "destination") return { state: s, replies: [] };
  const prevCenter = facilityOf(s.ctx, s.currentStation);
  const inboundBrg = s.ctx.destination.bearing;
  const fromDestWord = compassWord(norm360(inboundBrg + 180));
  const switched = switchToLeg(s, "destination");
  const dCtx = switched.ctx;
  const ifr = switched.rules === "IFR";
  const milesOut = ifr ? 18 : 12;
  const nextAlt = ifr
    ? Math.max(
        dCtx.interceptAltitude + 2000,
        Math.round((dCtx.airport.elevationFt + 4000) / 1000) * 1000,
      )
    : Math.round((dCtx.patternAltitude + 1500) / 500) * 500;
  const nextPhase: FreePhase = ifr ? "arrival" : "inbound";
  const nextStation: FacilityKey = ifr
    ? "approach"
    : switched.ffActive && dCtx.facilities.approach
      ? "approach"
      : landingStation(dCtx);
  const nextFac = facilityOf(dCtx, nextStation);

  const nextState: FreeState = {
    ...switched,
    phase: nextPhase,
    currentStation: nextStation,
    pending: null,
    ffAsked: false,
    ctx: {
      ...dCtx,
      positionMiles: milesOut,
      positionDir: fromDestWord,
      position: `${milesOut} miles ${fromDestWord} of ${dCtx.airportName}`,
      altitude: nextAlt,
      heading: r10(inboundBrg),
    },
  };

  const replies: FreeReply[] = [];
  if (ifr || switched.ffActive) {
    const p = ph`${dCtx.cs.full}, contact ${nextFac.name} ${freq(nextFac.mhz)}, ${dCtx.airportName} altimeter ${altimeter(dCtx.atis.altimeter)}.`;
    replies.push({
      kind: "atc",
      facility: prevCenter,
      phrase: capFirst(p),
      delayMs: 250,
    });
  }
  replies.push(
    sys(
      `Approaching ${dCtx.airport.icao} (${dCtx.airportName}) — ${milesOut} miles ${fromDestWord} at ${alt(nextAlt).text} ft, runway ${dCtx.runway.id} in use${dCtx.atisFreq ? `, ATIS ${formatFreqShort(dCtx.atisFreq)}` : ""}. Tune ${nextFac.name} (${formatFreqShort(nextFac.mhz)}).`,
      "info",
    ),
  );
  return { state: nextState, replies };
}

export function freeReport(s: FreeState): SessionReport {
  return buildReport(s.evals);
}

/** Suggested next call for the hints panel (scripted). */
export function freeHint(s: FreeState): string {
  const f = facilityOf(s.ctx, s.currentStation);
  if (s.pending)
    return `Read back: “${readbackExample(s, s.pending, facilityOf(s.ctx, s.pending.facility))}”`;
  const c = s.ctx;
  if (s.ffAsked) return `Give your details: “${example(s, "ff-details", f)}”`;
  if (
    f.key !== "ctaf" &&
    !c.abbrevBy[s.currentStation] &&
    !["ramp", "inbound", "arrival", "holding-short", "taxiing", "landed"].includes(s.phase)
  )
    return `Check in with ${f.name} (${formatFreqShort(f.mhz)}): “${f.name}, ${csPhrase(c.cs, false).text}, ${alt(c.altitude).text}${s.phase === "airborne" ? ` climbing ${alt(s.clearance?.altitude ?? c.vfrCruise).text}` : ""}.”`;
  switch (s.phase) {
    case "ramp":
      if (!c.airport.towered && s.rules === "VFR")
        return `Self-announce taxi on ${facilityOf(c, "ctaf").name} (${formatFreqShort(facilityOf(c, "ctaf").mhz)}): “${example(s, "taxi", facilityOf(c, "ctaf"))}”`;
      return s.rules === "IFR" && !s.clearance
        ? `Call ${f.name} (${formatFreqShort(f.mhz)}): “${example(s, "clearance", f)}”`
        : `Call ${facilityOf(c, "ground").name}: “${example(s, "taxi", facilityOf(c, "ground"))}”`;
    case "holding-short":
    case "taxiing": {
      const twr = facilityOf(c, landingStation(c));
      return `Switch to ${twr.name} (${formatFreqShort(twr.mhz)}): “${example(s, "ready", twr)}”`;
    }
    case "airborne":
      if (s.dest && s.leg !== "destination" && (s.ffActive || s.rules === "IFR"))
        return `Climbing enroute to ${s.dest.airportName}. Check in with ${f.name}, or use “Approach destination” when ready to descend.`;
      return s.rules === "VFR" && !s.ffActive
        ? `Request flight following: “${example(s, "flight-following", f)}”`
        : `Respond to ${f.name}'s instructions.`;
    case "enroute":
      if (s.dest && s.leg !== "destination")
        return `Enroute to ${s.dest.airportName} (${s.dest.airport.icao}) with ${f.name}. Ask for altitude, weather, or press “Approach destination” for arrival.`;
      return s.rules === "VFR" && !s.ffActive
        ? `Request flight following: “${example(s, "flight-following", facilityOf(c, "approach"))}”`
        : "Fly the route; respond to any calls. Request a frequency change when leaving the area.";
    case "inbound": {
      const twr = facilityOf(c, landingStation(c));
      return `${c.airport.towered ? "Call" : "Self-announce on"} ${twr.name} (${formatFreqShort(twr.mhz)}): “${example(s, "inbound", twr)}”`;
    }
    case "arrival":
      return `Check in with ${f.name} (${formatFreqShort(f.mhz)}): “${f.name}, ${csPhrase(c.cs, false).text}, ${alt(c.altitude).text}, with information ${PHONETIC[c.atis.letter]}.”`;
    case "pattern": {
      const twr = facilityOf(c, landingStation(c));
      return `Report your position in the pattern on ${twr.name}: “${twr.name}, ${csPhrase(c.cs, true).text}, midfield ${c.runway.pattern} downwind runway ${c.runway.id}.”`;
    }
    case "final": {
      const twr = facilityOf(c, landingStation(c));
      return c.airport.towered
        ? `Check in / report final with ${twr.name}, then read back the landing clearance.`
        : `Report final on ${twr.name}, then report clear of runway ${c.runway.id}.`;
    }
    case "landed": {
      const gnd = groundStation(c);
      if (!gnd) {
        const ctaf = facilityOf(c, "ctaf");
        return `Announce clear of runway ${c.runway.id} on ${ctaf.name}: “${ctaf.name}, ${csPhrase(c.cs, false).text}, clear of runway ${c.runway.id}, ${c.airportName}.”`;
      }
      const gndF = facilityOf(c, gnd);
      return `After exiting: “${gndF.name} (${formatFreqShort(gndF.mhz)}), ${csPhrase(c.cs, false).text}, clear of runway ${c.runway.id} at ${PHONETIC[c.taxiRoute[0] ?? "A"]}, taxi to parking.”`;
    }
    default:
      return "Goal reached — press End & score, or keep practising.";
  }
}
