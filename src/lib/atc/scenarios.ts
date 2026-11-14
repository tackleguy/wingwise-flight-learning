/**
 * The 15 scripted ATC training scenarios.
 *
 * Each scenario is a state machine of steps. A step names the facility (station + frequency
 * resolved from the airport dataset), whether ATC speaks first (`prompt`), the elements the
 * pilot's transmission must contain (`expects`), the correct phraseology (`example`) and the
 * state change once the step is complete (`apply`).
 *
 * Phraseology follows the AIM (Chapter 4), the Pilot/Controller Glossary and JO 7110.65.
 * SIMULATED FOR TRAINING ONLY — not real ATC instructions or clearances.
 */
import { getNavaid } from "@/lib/data/airports";
import { norm180, norm360 } from "@/lib/geo";
import { approachPhrase, compassWord, facilityOf } from "./context";
import type { Expect, StepKind } from "./evaluate";
import {
  alt,
  altimeter,
  clock,
  csPhrase,
  freq,
  hdg,
  letter,
  miles,
  ph,
  plain,
  PHONETIC,
  route,
  rwy,
  squawk,
  wind,
} from "./phrase";
import type {
  Difficulty,
  EvalItem,
  FacilityKey,
  Phrase,
  ScenarioContext,
  ScenarioId,
  ScenarioPhase,
  Station,
  TransmissionEval,
} from "./types";

export interface Step {
  id: string;
  title: string;
  facility: FacilityKey;
  kind: StepKind;
  /** ATC transmission that opens the step (ATC speaks first). */
  prompt?: (ctx: ScenarioContext) => Phrase;
  expects: (ctx: ScenarioContext) => Expect[];
  example: (ctx: ScenarioContext) => Phrase;
  hint: (ctx: ScenarioContext) => string;
  /** ATC reply after an acceptable pilot transmission (e.g. "readback correct"). */
  closing?: (ctx: ScenarioContext) => Phrase | null;
  apply?: (ctx: ScenarioContext, ev: TransmissionEval) => ScenarioContext;
  /** Narrative shown when the step begins. */
  situation?: (ctx: ScenarioContext) => string;
  /** Instruction that needs an immediate response (go-around, traffic alert). */
  urgent?: boolean;
  /** Custom ATC reaction when a critical item is missing. */
  retryPrompt?: (ctx: ScenarioContext, failed: EvalItem[]) => Phrase | null;
  /** ATC follow-up transmitted when a (non-critical) item was missing, e.g. ATIS not reported. */
  missingNotes?: { label: string; atc: (ctx: ScenarioContext) => Phrase }[];
}

export interface Briefing {
  situation: string;
  goal: string;
  say: string[];
  why: string[];
}

export interface ScenarioDef {
  id: ScenarioId;
  title: string;
  phase: ScenarioPhase;
  rules: "VFR" | "IFR";
  summary: string;
  stations: Station[];
  firstSpeaker: "pilot" | "atc";
  contextOptions?: { preferIls?: boolean; ifrWeather?: boolean };
  init: (ctx: ScenarioContext) => ScenarioContext;
  radio: (ctx: ScenarioContext, d: Difficulty) => { active: number; standby: number };
  briefing: (ctx: ScenarioContext) => Briefing;
  steps: (ctx: ScenarioContext, d: Difficulty) => Step[];
  refs: string[];
}

// ---------- helpers ----------

const fac = facilityOf;
/** Callsign as ATC/pilot should use it on this facility right now. */
const C = (ctx: ScenarioContext, k: FacilityKey) => csPhrase(ctx.cs, !!ctx.abbrevBy[k]);
const FULL = (ctx: ScenarioContext) => csPhrase(ctx.cs, false);
const N = (ctx: ScenarioContext, k: FacilityKey) => plain(fac(ctx, k).name);
const FQ = (ctx: ScenarioContext, k: FacilityKey) => freq(fac(ctx, k).mhz);
const BLANK = 118.0;
const advancedMode = (d: Difficulty) => d === "advanced" || d === "checkride";
const stby = (ctx: ScenarioContext, d: Difficulty, k: FacilityKey) =>
  d === "beginner" ? fac(ctx, k).mhz : BLANK;
const r10 = (d: number) => Math.round(norm360(d) / 10) * 10 || 360;
const turnSide = (from: number, to: number): "left" | "right" =>
  norm180(to - from) >= 0 ? "right" : "left";
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
const clockOf = (heading: number, bearing: number) => {
  const c = Math.round(norm360(bearing - heading) / 30) % 12;
  return c === 0 ? 12 : c;
};
const fuelText = (min: number) => {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return [h ? `${h} hour${h > 1 ? "s" : ""}` : "", m ? `${m} minutes` : ""]
    .filter(Boolean)
    .join(" ");
};

const station = (ctx: ScenarioContext, k: FacilityKey): Expect => ({
  kind: "station",
  facility: fac(ctx, k),
});
const atisE = (ctx: ScenarioContext): Expect => ({ kind: "atis", letter: ctx.atis.letter });
const runwayRB = (id: string, say?: string): Expect => ({
  kind: "runway",
  runway: id,
  readback: true,
  ...(say ? { say } : {}),
});
const runwayRep = (id: string): Expect => ({
  kind: "runway",
  runway: id,
  readback: false,
  severity: "major",
});
const atisMissing = {
  label: "ATIS code",
  atc: (ctx: ScenarioContext) =>
    ph`${C(ctx, "ground")}, information ${letter(ctx.atis.letter)} is current, altimeter ${altimeter(ctx.atis.altimeter)}.`,
};
const routeWords = (ctx: ScenarioContext) => ctx.taxiRoute.map((t) => PHONETIC[t] ?? t);
const otherType = (ctx: ScenarioContext) =>
  ctx.aircraft.typeWord === "Cherokee" ? "Cessna" : "Cherokee";
const destForms = (ctx: ScenarioContext) => [
  ctx.destination.name,
  ctx.destination.icao,
  ctx.destination.icao.slice(1),
];
const positionAny = (ctx: ScenarioContext) => [
  `${ctx.positionMiles} miles`,
  `${ctx.positionMiles} mile`,
  ctx.positionDir,
  "over",
  "overhead",
];
const nav = (ctx: ScenarioContext) => {
  const id = ctx.airport.nearbyNavaids[0];
  const n = id ? getNavaid(id) : undefined;
  return { id: id ?? "", name: n?.name ?? ctx.airportName };
};
const ifrClearance = (ctx: ScenarioContext, withVectors: boolean) => ({
  limit: `the ${ctx.destination.name} airport`,
  route: withVectors ? `radar vectors ${nav(ctx).name}, then as filed` : "as filed",
  altitude: ctx.ifrInitial,
  expectAltitude: ctx.ifrCruise,
  expectMinutes: 10,
  departureMhz: fac(ctx, "departure").mhz,
  squawk: ctx.squawk,
});
const vfrPhrase = (ctx: ScenarioContext) =>
  `VFR departure to the ${compassWord(ctx.departureHeading)}`;

// ---------- 1. taxi ----------

const taxi: ScenarioDef = {
  id: "taxi",
  title: "Request taxi clearance",
  phase: "ground",
  rules: "VFR",
  summary:
    "Call Ground from the ramp with the ATIS code, receive a taxi clearance and read back the runway, route and hold-short instruction.",
  stations: ["Ground"],
  firstSpeaker: "pilot",
  refs: ["AIM 4-3-18 Taxiing", "AIM 4-2-3 Contact procedures", "JO 7110.65 §3-7-2"],
  init: (ctx) => ({
    ...ctx,
    position: `${ctx.parking}, ${ctx.airportName}`,
    altitude: ctx.airport.elevationFt,
    heading: ctx.runway.magHeading,
  }),
  radio: (ctx, d) => ({
    active: ctx.atisFreq ?? fac(ctx, "ground").mhz,
    standby: stby(ctx, d, "ground"),
  }),
  briefing: (ctx) => ({
    situation: `You're parked at ${ctx.parking} at ${ctx.airport.name} (${ctx.airport.icao}) in a ${ctx.aircraft.spokenType}, engine running, ready to taxi for a ${vfrPhrase(ctx)}.`,
    goal: `Listen to the ATIS, tune ${fac(ctx, "ground").name} (${freq(fac(ctx, "ground").mhz).text}) and request taxi. Read back the taxi clearance exactly.`,
    say: [
      "Who you're calling → who you are → where you are → ATIS code → what you want.",
      "Read back the runway assignment, the taxi route and every hold-short instruction, ending with your callsign.",
    ],
    why: [
      "Ground can't see every ramp — your position and the ATIS code save a round trip.",
      "Hold-short readbacks are mandatory: they are the last defence against runway incursions.",
    ],
  }),
  steps: (_ctx, d) => {
    const steps: Step[] = [
      {
        id: "taxi-request",
        title: "Initial call to Ground",
        facility: "ground",
        kind: "initial",
        expects: (ctx) => [
          station(ctx, "ground"),
          {
            kind: "phrase",
            label: "Position",
            any: [
              "parking",
              "ramp",
              "fbo",
              "hangar",
              "tie down",
              "tiedown",
              "transient",
              "terminal",
              "run up",
              "runup",
              "apron",
            ],
            category: "awareness",
            severity: "major",
            tip: `Tell Ground where you are ("at ${ctx.parking}") — they can't see every ramp.`,
            say: `at ${ctx.parking}`,
          },
          atisE(ctx),
          {
            kind: "phrase",
            label: "Request",
            any: ["taxi"],
            category: "phraseology",
            severity: "major",
            tip: `State your request: "request taxi".`,
            say: "request taxi",
          },
          {
            kind: "phrase",
            label: "Intentions",
            any: [
              "vfr",
              "departure",
              "depart",
              "northbound",
              "southbound",
              "eastbound",
              "westbound",
              "pattern",
              "closed traffic",
              "local",
              "to the",
            ],
            category: "awareness",
            severity: "minor",
            tip: `Add your intentions, e.g. "${vfrPhrase(ctx)}" or "closed traffic".`,
          },
        ],
        example: (ctx) =>
          ph`${N(ctx, "ground")}, ${C(ctx, "ground")}, at ${ctx.parking}, with information ${letter(ctx.atis.letter)}, request taxi, ${vfrPhrase(ctx)}.`,
        hint: (ctx) =>
          `Call ${fac(ctx, "ground").name}: your full callsign, position, "with information ${PHONETIC[ctx.atis.letter]}", and "request taxi".`,
        missingNotes: [atisMissing],
      },
      {
        id: "taxi-readback",
        title: "Taxi clearance readback",
        facility: "ground",
        kind: "readback",
        prompt: (ctx) =>
          ph`${C(ctx, "ground")}, ${N(ctx, "ground")}, runway ${rwy(ctx.runway.id)}, taxi via ${route(ctx.taxiRoute)}, hold short of runway ${rwy(ctx.runway.id)}.`,
        expects: (ctx) => [
          runwayRB(ctx.runway.id),
          {
            kind: "phrase",
            label: "Taxi route",
            any: [routeWords(ctx).join(" ")],
            all: routeWords(ctx),
            category: "readback",
            severity: "major",
            tip: `Read back the taxi route ("taxi via ${routeWords(ctx).join(", ")}").`,
            say: `taxi via ${routeWords(ctx).join(", ")}`,
          },
          { kind: "holdShort", runway: ctx.runway.id },
        ],
        example: (ctx) =>
          ph`Runway ${rwy(ctx.runway.id)}, taxi via ${route(ctx.taxiRoute)}, hold short runway ${rwy(ctx.runway.id)}, ${C(ctx, "ground")}.`,
        hint: () =>
          "Read back the runway, the taxi route and the hold-short instruction, then your callsign.",
        apply: (ctx) => ({ ...ctx, position: `taxiing to runway ${ctx.runway.id}` }),
      },
    ];
    if (advancedMode(d))
      steps.push({
        id: "taxi-runway-change",
        title: "Runway change",
        facility: "ground",
        kind: "readback",
        situation: () => "While you taxi, the wind shifts and Ground changes the runway.",
        prompt: (ctx) => {
          const r = ctx.altRunway ?? ctx.runway;
          return ph`${C(ctx, "ground")}, runway change. Runway ${rwy(r.id)}, taxi via ${route(ctx.taxiRoute)}, hold short of runway ${rwy(r.id)}.`;
        },
        expects: (ctx) => {
          const r = ctx.altRunway ?? ctx.runway;
          return [runwayRB(r.id), { kind: "holdShort", runway: r.id }];
        },
        example: (ctx) => {
          const r = ctx.altRunway ?? ctx.runway;
          return ph`Runway ${rwy(r.id)}, taxi via ${route(ctx.taxiRoute)}, hold short runway ${rwy(r.id)}, ${C(ctx, "ground")}.`;
        },
        hint: () =>
          "A runway change is a new clearance — read back the new runway and hold short again.",
        apply: (ctx) => ({ ...ctx, runway: ctx.altRunway ?? ctx.runway }),
      });
    return steps;
  },
};

// ---------- 2. takeoff ----------

const takeoff: ScenarioDef = {
  id: "takeoff",
  title: "Request takeoff clearance",
  phase: "departure",
  rules: "VFR",
  summary:
    "Run-up complete, holding short. Switch to Tower, report ready and read back the takeoff clearance with the departure instruction.",
  stations: ["Tower"],
  firstSpeaker: "pilot",
  refs: [
    "AIM 4-3-10 Intersection takeoffs / ready for departure",
    "AIM 4-3-15 Line up and wait",
    "JO 7110.65 §3-9",
  ],
  init: (ctx) => ({
    ...ctx,
    position: `holding short of runway ${ctx.runway.id}`,
    altitude: ctx.airport.elevationFt,
    heading: ctx.runway.magHeading,
    abbrevBy: { ground: true },
  }),
  radio: (ctx, d) => ({ active: fac(ctx, "ground").mhz, standby: stby(ctx, d, "tower") }),
  briefing: (ctx) => ({
    situation: `Run-up complete at the hold-short line for runway ${ctx.runway.id} at ${ctx.airport.icao}. You're still on Ground frequency.`,
    goal: `Switch to ${fac(ctx, "tower").name} (${freq(fac(ctx, "tower").mhz).text}), report ready for departure and read back the takeoff clearance.`,
    say: [
      'Station, callsign, "holding short runway __, ready for departure", and your direction of flight.',
      'Readback: runway + "cleared for takeoff" + any departure instruction + callsign.',
    ],
    why: [
      "The runway number in the readback confirms you're on the right runway.",
      '"Line up and wait" is NOT a takeoff clearance — never take off without hearing "cleared for takeoff".',
    ],
  }),
  steps: (_ctx, d) => {
    const depSide = (ctx: ScenarioContext) => turnSide(ctx.runway.magHeading, ctx.departureHeading);
    const steps: Step[] = [
      {
        id: "ready",
        title: "Ready for departure",
        facility: "tower",
        kind: "initial",
        situation: (ctx) => `Tune ${fac(ctx, "tower").name} and report ready.`,
        expects: (ctx) => [
          station(ctx, "tower"),
          {
            kind: "phrase",
            label: "Position",
            any: ["holding short", "hold short", "at runway", "run up", "runup"],
            category: "awareness",
            severity: "major",
            tip: `Say where you are: "holding short runway ${ctx.runway.id}".`,
            say: `holding short runway ${ctx.runway.id}`,
          },
          runwayRep(ctx.runway.id),
          {
            kind: "phrase",
            label: "Ready",
            any: ["ready for departure", "ready for takeoff", "ready to go", "ready"],
            category: "phraseology",
            severity: "major",
            tip: `Say "ready for departure" (AIM 4-3-10).`,
            say: "ready for departure",
          },
          {
            kind: "phrase",
            label: "Direction of flight",
            any: [
              "vfr",
              "northbound",
              "southbound",
              "eastbound",
              "westbound",
              "departure to the",
              "to the",
              "pattern",
              "closed traffic",
            ],
            category: "awareness",
            severity: "minor",
            tip: `Add your intentions ("${vfrPhrase(ctx)}") so Tower can plan your departure.`,
          },
        ],
        example: (ctx) =>
          ph`${N(ctx, "tower")}, ${C(ctx, "tower")}, holding short runway ${rwy(ctx.runway.id)}, ready for departure, ${vfrPhrase(ctx)}.`,
        hint: (ctx) =>
          `Flip to ${fac(ctx, "tower").name}, then: station, full callsign, "holding short runway ${ctx.runway.id}, ready for departure".`,
      },
    ];
    if (advancedMode(d))
      steps.push({
        id: "luaw",
        title: "Line up and wait",
        facility: "tower",
        kind: "readback",
        prompt: (ctx) =>
          ph`${C(ctx, "tower")}, ${N(ctx, "tower")}, runway ${rwy(ctx.runway.id)}, line up and wait, traffic crossing downfield.`,
        expects: (ctx) => [
          runwayRB(ctx.runway.id),
          {
            kind: "phrase",
            label: "Line up and wait",
            any: ["line up and wait"],
            category: ["phraseology", "readback"],
            severity: "critical",
            tip: `Read back "line up and wait" exactly — it is NOT a takeoff clearance (AIM 4-3-15).`,
            say: `runway ${ctx.runway.id}, line up and wait`,
          },
        ],
        example: (ctx) => ph`Runway ${rwy(ctx.runway.id)}, line up and wait, ${C(ctx, "tower")}.`,
        hint: () =>
          'Read back "runway __, line up and wait". Taxi onto the runway and stop — do not take off.',
        apply: (ctx) => ({ ...ctx, position: `lined up on runway ${ctx.runway.id}` }),
      });
    steps.push({
      id: "takeoff-clearance",
      title: "Takeoff clearance readback",
      facility: "tower",
      kind: "readback",
      prompt: (ctx) =>
        ph`${C(ctx, "tower")}${ctx.abbrevBy.tower ? "" : ph`, ${N(ctx, "tower")}`}, ${wind(ctx.atis.windDirMag, ctx.atis.windKt)}, runway ${rwy(ctx.runway.id)}, cleared for takeoff, ${depSide(ctx)} downwind departure approved.`,
      expects: (ctx) => [
        runwayRB(ctx.runway.id),
        {
          kind: "phrase",
          label: "Cleared for takeoff",
          any: ["cleared for takeoff", "cleared takeoff", "clear for takeoff"],
          category: ["phraseology", "readback"],
          severity: "critical",
          tip: `Read back "cleared for takeoff" with the runway — it confirms you received the clearance for the correct runway.`,
          say: `runway ${ctx.runway.id}, cleared for takeoff`,
        },
        {
          kind: "phrase",
          label: "Departure instruction",
          any: [
            `${depSide(ctx)} downwind`,
            `${depSide(ctx)} turn`,
            `${depSide(ctx)} downwind departure`,
          ],
          category: "readback",
          severity: "major",
          tip: `Read back the departure instruction ("${depSide(ctx)} downwind departure").`,
          say: `${depSide(ctx)} downwind departure`,
        },
      ],
      example: (ctx) =>
        ph`Runway ${rwy(ctx.runway.id)}, cleared for takeoff, ${depSide(ctx)} downwind departure, ${C(ctx, "tower")}.`,
      hint: () =>
        'Read back the runway, "cleared for takeoff", the departure instruction and your callsign.',
      apply: (ctx) => ({
        ...ctx,
        position: `departing runway ${ctx.runway.id}`,
        altitude: ctx.airport.elevationFt + 500,
      }),
    });
    return steps;
  },
};

// ---------- 3. departure ----------

const departure: ScenarioDef = {
  id: "departure",
  title: "Receive departure instructions",
  phase: "departure",
  rules: "IFR",
  summary:
    "Just airborne on an IFR departure: take the heading and frequency change from Tower, check in with Departure and read back climb and vector instructions.",
  stations: ["Tower", "Departure", "Center"],
  firstSpeaker: "atc",
  refs: [
    "AIM 5-2-9 Departure procedures",
    "AIM 5-3-1 ARTCC communications (initial contact)",
    "JO 7110.65 §5-6",
  ],
  init: (ctx) => {
    const c = ifrClearance(ctx, true);
    return {
      ...ctx,
      rules: "IFR",
      clearance: c,
      position: `just airborne off runway ${ctx.runway.id}`,
      altitude: Math.round((ctx.airport.elevationFt + 800) / 100) * 100,
      heading: ctx.runway.magHeading,
      abbrevBy: { tower: true },
    };
  },
  radio: (ctx, d) => ({ active: fac(ctx, "tower").mhz, standby: stby(ctx, d, "departure") }),
  briefing: (ctx) => ({
    situation: `IFR to ${ctx.destination.name}, cleared to climb to ${alt(ctx.ifrInitial).text}. You just took off from runway ${ctx.runway.id} and are climbing through ${alt(Math.round((ctx.airport.elevationFt + 800) / 100) * 100).text} ft.`,
    goal: "Read back Tower's heading and frequency, check in with Departure stating altitude, then read back new altitude/heading and the handoff to Center.",
    say: [
      'Initial contact with Departure: facility, full callsign, current altitude "climbing" assigned altitude (e.g. "1,400 climbing 3,000").',
      "Read back every altitude, heading and frequency, with direction of turn.",
    ],
    why: [
      "Stating altitude on check-in lets the controller verify your Mode C (AIM 5-3-1).",
      "Heading and altitude readbacks catch errors before they become losses of separation.",
    ],
  }),
  steps: (_ctx, d) => {
    const steps: Step[] = [
      {
        id: "tower-handoff",
        title: "Tower: turn and contact Departure",
        facility: "tower",
        kind: "readback",
        prompt: (ctx) =>
          ph`${C(ctx, "tower")}, turn ${turnSide(ctx.runway.magHeading, ctx.departureHeading)} heading ${hdg(ctx.departureHeading)}, contact ${N(ctx, "departure")} ${FQ(ctx, "departure")}.`,
        expects: (ctx) => [
          {
            kind: "heading",
            deg: ctx.departureHeading,
            turn: turnSide(ctx.runway.magHeading, ctx.departureHeading),
            readback: true,
          },
          { kind: "frequency", mhz: fac(ctx, "departure").mhz, readback: true },
        ],
        example: (ctx) =>
          ph`${turnSide(ctx.runway.magHeading, ctx.departureHeading)} heading ${hdg(ctx.departureHeading)}, ${N(ctx, "departure")} ${FQ(ctx, "departure")}, ${C(ctx, "tower")}.`,
        hint: () => "Read back the turn direction, heading and new frequency, then your callsign.",
        apply: (ctx) => ({
          ...ctx,
          heading: ctx.departureHeading,
          altitude: Math.round((ctx.airport.elevationFt + 1400) / 100) * 100,
        }),
      },
      {
        id: "departure-checkin",
        title: "Check in with Departure",
        facility: "departure",
        kind: "initial",
        situation: (ctx) =>
          `Climbing through ${alt(ctx.altitude).text} ft for ${alt(ctx.ifrInitial).text}, heading ${hdg(ctx.heading).text}.`,
        expects: (ctx) => [
          station(ctx, "departure"),
          {
            kind: "altitude",
            ft: ctx.altitude,
            readback: false,
            label: "Current altitude",
            tolerance: 400,
          },
          {
            kind: "altitude",
            ft: ctx.ifrInitial,
            readback: false,
            label: "Assigned altitude",
            severity: "major",
          },
        ],
        example: (ctx) =>
          ph`${N(ctx, "departure")}, ${C(ctx, "departure")}, ${alt(ctx.altitude)} climbing ${alt(ctx.ifrInitial)}.`,
        hint: (ctx) =>
          `Tune ${freq(fac(ctx, "departure").mhz).text}. Say facility, full callsign, current altitude "climbing" ${alt(ctx.ifrInitial).text}.`,
      },
      {
        id: "radar-contact",
        title: "Climb and vector",
        facility: "departure",
        kind: "readback",
        prompt: (ctx) => {
          const h2 = r10(ctx.destination.bearing);
          return ph`${C(ctx, "departure")}, ${N(ctx, "departure")}, radar contact. Climb and maintain ${alt(ctx.ifrCruise)}, turn ${turnSide(ctx.heading, h2)} heading ${hdg(h2)}.`;
        },
        expects: (ctx) => {
          const h2 = r10(ctx.destination.bearing);
          return [
            {
              kind: "altitude",
              ft: ctx.ifrCruise,
              readback: true,
              say: `climb and maintain ${alt(ctx.ifrCruise).text}`,
            },
            { kind: "heading", deg: h2, turn: turnSide(ctx.heading, h2), readback: true },
          ];
        },
        example: (ctx) => {
          const h2 = r10(ctx.destination.bearing);
          return ph`Climb and maintain ${alt(ctx.ifrCruise)}, ${turnSide(ctx.heading, h2)} heading ${hdg(h2)}, ${C(ctx, "departure")}.`;
        },
        hint: () => "Read back the altitude and heading (with turn direction).",
        apply: (ctx) => ({
          ...ctx,
          heading: r10(ctx.destination.bearing),
          altitude: ctx.ifrCruise,
        }),
      },
    ];
    if (advancedMode(d))
      steps.push({
        id: "stop-climb",
        title: "Amended altitude",
        facility: "departure",
        kind: "readback",
        situation: () => "Climbing — Departure has crossing traffic above you.",
        prompt: (ctx) =>
          ph`${C(ctx, "departure")}, amended altitude, stop climb at ${alt(ctx.ifrCruise - 1000)}, traffic one o'clock, 6 miles, eastbound, King Air at ${alt(ctx.ifrCruise)}.`,
        expects: (ctx) => [
          {
            kind: "altitude",
            ft: ctx.ifrCruise - 1000,
            readback: true,
            say: `stop climb at ${alt(ctx.ifrCruise - 1000).text}`,
          },
        ],
        example: (ctx) =>
          ph`Stop climb at ${alt(ctx.ifrCruise - 1000)}, looking for traffic, ${C(ctx, "departure")}.`,
        hint: () => "An amended altitude replaces the previous one — read back the new altitude.",
        apply: (ctx) => ({ ...ctx, altitude: ctx.ifrCruise - 1000 }),
      });
    steps.push(
      {
        id: "center-handoff",
        title: "Handoff to Center",
        facility: "departure",
        kind: "readback",
        prompt: (ctx) =>
          ph`${C(ctx, "departure")}, contact ${N(ctx, "center")} ${FQ(ctx, "center")}.`,
        expects: (ctx) => [{ kind: "frequency", mhz: fac(ctx, "center").mhz, readback: true }],
        example: (ctx) => ph`${N(ctx, "center")} ${FQ(ctx, "center")}, ${C(ctx, "departure")}.`,
        hint: () => "Read back the facility and frequency.",
      },
      {
        id: "center-checkin",
        title: "Check in with Center",
        facility: "center",
        kind: "initial",
        expects: (ctx) => [
          station(ctx, "center"),
          {
            kind: "altitude",
            ft: ctx.altitude,
            readback: false,
            label: "Altitude",
            tolerance: 100,
          },
        ],
        example: (ctx) => ph`${N(ctx, "center")}, ${C(ctx, "center")}, ${alt(ctx.altitude)}.`,
        hint: (ctx) =>
          `Tune ${freq(fac(ctx, "center").mhz).text}: facility, full callsign, altitude.`,
        closing: (ctx) => ph`${C(ctx, "center")}, ${N(ctx, "center")}, roger.`,
      },
    );
    return steps;
  },
};

// ---------- 4. flight following ----------

const flightFollowing: ScenarioDef = {
  id: "flight-following",
  title: "Request VFR flight following",
  phase: "enroute",
  rules: "VFR",
  summary:
    "Make a short initial call to Approach, give type, position, altitude and destination when asked, then read back the squawk and altimeter.",
  stations: ["Approach"],
  firstSpeaker: "pilot",
  refs: ["AIM 4-1-15 Radar traffic information service", "AIM 4-2-3 Contact procedures"],
  init: (ctx) => ({
    ...ctx,
    altitude: ctx.vfrCruise,
    heading: r10(ctx.destination.bearing),
    abbrevBy: {},
  }),
  radio: (ctx, d) => ({ active: fac(ctx, "tower").mhz, standby: stby(ctx, d, "approach") }),
  briefing: (ctx) => ({
    situation: `VFR at ${alt(ctx.vfrCruise).text} ft, ${ctx.position}, heading for ${ctx.destination.name} (${ctx.destination.icao}). Tower approved your frequency change.`,
    goal: `Call ${fac(ctx, "approach").name} (${freq(fac(ctx, "approach").mhz).text}) and request flight following to ${ctx.destination.name}.`,
    say: [
      'First call: just facility, callsign, "request flight following" — then wait.',
      'When told "go ahead": type/equipment, position, altitude, destination, request.',
      "Read back the squawk code and altimeter.",
    ],
    why: [
      "Busy approach controllers may not be able to take your whole request immediately.",
      "The squawk lets them identify you on radar and provide traffic advisories.",
    ],
  }),
  steps: () => [
    {
      id: "ff-initial",
      title: "Short initial call",
      facility: "approach",
      kind: "initial",
      expects: (ctx) => [
        station(ctx, "approach"),
        {
          kind: "phrase",
          label: "Request",
          any: ["request", "flight following", "advisories"],
          category: "phraseology",
          severity: "major",
          tip: `Say "request flight following" (or just "request").`,
          say: "request flight following",
        },
        {
          kind: "maxWords",
          max: 14,
          tip: 'Keep the first call short — facility, callsign, "request flight following" — and give details after the controller says "go ahead" (AIM 4-2-3).',
        },
      ],
      example: (ctx) => ph`${N(ctx, "approach")}, ${C(ctx, "approach")}, request flight following.`,
      hint: (ctx) =>
        `Tune ${fac(ctx, "approach").name}. Keep it short: facility, full callsign, "request flight following".`,
    },
    {
      id: "ff-details",
      title: "Give your details",
      facility: "approach",
      kind: "request",
      prompt: (ctx) => ph`${C(ctx, "approach")}, ${N(ctx, "approach")}, go ahead.`,
      expects: (ctx) => [
        {
          kind: "phrase",
          label: "Aircraft type",
          any: ctx.aircraft.typeKeywords,
          category: "awareness",
          severity: "major",
          tip: `Give your type and equipment suffix ("${ctx.aircraft.spokenType} slant ${PHONETIC[ctx.aircraft.equip]}").`,
          say: `${ctx.aircraft.spokenType} slant ${PHONETIC[ctx.aircraft.equip]}`,
        },
        {
          kind: "phrase",
          label: "Position",
          any: positionAny(ctx),
          category: "awareness",
          severity: "major",
          tip: `Give your position relative to a known point ("${ctx.position}").`,
          say: ctx.position,
        },
        { kind: "altitude", ft: ctx.altitude, readback: false, label: "Altitude", tolerance: 200 },
        {
          kind: "phrase",
          label: "Destination",
          any: destForms(ctx),
          category: "awareness",
          severity: "major",
          tip: `State your destination ("to ${ctx.destination.name}").`,
          say: `to ${ctx.destination.name}`,
        },
      ],
      example: (ctx) =>
        ph`${C(ctx, "approach")}, ${ctx.aircraft.spokenType} slant ${letter(ctx.aircraft.equip)}, ${ctx.position}, ${alt(ctx.altitude)}, request flight following to ${ctx.destination.name}.`,
      hint: (ctx) =>
        `Callsign, type ("${ctx.aircraft.spokenType} slant ${PHONETIC[ctx.aircraft.equip]}"), position, altitude, "request flight following to ${ctx.destination.name}".`,
    },
    {
      id: "ff-squawk",
      title: "Squawk and altimeter",
      facility: "approach",
      kind: "readback",
      prompt: (ctx) =>
        ph`${C(ctx, "approach")}, squawk ${squawk(ctx.squawk)}, ${ctx.airportName} altimeter ${altimeter(ctx.atis.altimeter)}.`,
      expects: (ctx) => [
        { kind: "squawk", code: ctx.squawk },
        { kind: "altimeter", inHg: ctx.atis.altimeter },
      ],
      example: (ctx) =>
        ph`Squawk ${squawk(ctx.squawk)}, ${altimeter(ctx.atis.altimeter)}, ${C(ctx, "approach")}.`,
      hint: () => "Read back the code and the altimeter setting, then set them.",
    },
    {
      id: "ff-radar",
      title: "Radar contact",
      facility: "approach",
      kind: "acknowledge",
      prompt: (ctx) =>
        ph`${C(ctx, "approach")}, radar contact, ${ctx.position}, ${alt(ctx.altitude)}. Maintain VFR.`,
      expects: () => [
        {
          kind: "phrase",
          label: "Maintain VFR",
          any: ["maintain vfr"],
          category: ["readback", "phraseology"],
          severity: "major",
          tip: `Acknowledge with "maintain VFR" and your callsign.`,
          say: "maintain VFR",
        },
      ],
      example: (ctx) => ph`Maintain VFR, ${C(ctx, "approach")}.`,
      hint: () => "Acknowledge the instruction to maintain VFR.",
    },
  ],
};

// ---------- 5. frequency change ----------

const freqChange: ScenarioDef = {
  id: "freq-change",
  title: "Changing frequencies (handoff)",
  phase: "enroute",
  rules: "VFR",
  summary: "Read back a handoff, tune the new facility and check in correctly with your altitude.",
  stations: ["Approach", "Center"],
  firstSpeaker: "atc",
  refs: ["AIM 4-2-3 Contact procedures", "AIM 5-3-1 ARTCC communications", "AIM 4-1-15"],
  init: (ctx) => ({
    ...ctx,
    altitude: ctx.vfrCruise,
    heading: r10(ctx.destination.bearing),
    abbrevBy: { approach: true },
  }),
  radio: (ctx, d) => ({ active: fac(ctx, "approach").mhz, standby: stby(ctx, d, "center") }),
  briefing: (ctx) => ({
    situation: `VFR flight following with ${fac(ctx, "approach").name}, ${alt(ctx.vfrCruise).text} ft, ${ctx.position}.`,
    goal: "Read back the frequency change, tune the new facility and check in with your altitude.",
    say: [
      "Readback: facility + frequency + callsign.",
      'Check-in: facility, full callsign, altitude ("level 4,500" or just "4,500").',
    ],
    why: [
      "Reading back the frequency catches an error before you lose contact.",
      'The new controller verifies your Mode C from your altitude report — "with you" tells them nothing.',
    ],
  }),
  steps: (_ctx, d) => {
    const steps: Step[] = [
      {
        id: "handoff",
        title: "Handoff readback",
        facility: "approach",
        kind: "readback",
        prompt: (ctx) =>
          ph`${C(ctx, "approach")}, contact ${N(ctx, "center")} ${FQ(ctx, "center")}.`,
        expects: (ctx) => [{ kind: "frequency", mhz: fac(ctx, "center").mhz, readback: true }],
        example: (ctx) => ph`${N(ctx, "center")} ${FQ(ctx, "center")}, ${C(ctx, "approach")}.`,
        hint: () => "Read back the facility name and frequency with your callsign.",
      },
      {
        id: "checkin",
        title: "Check in with Center",
        facility: "center",
        kind: "initial",
        expects: (ctx) => [
          station(ctx, "center"),
          {
            kind: "altitude",
            ft: ctx.altitude,
            readback: false,
            label: "Altitude",
            tolerance: 100,
          },
        ],
        example: (ctx) => ph`${N(ctx, "center")}, ${C(ctx, "center")}, level ${alt(ctx.altitude)}.`,
        hint: (ctx) =>
          `Tune ${freq(fac(ctx, "center").mhz).text}, listen for a gap, then: facility, full callsign, altitude.`,
      },
      {
        id: "altimeter",
        title: "Altimeter",
        facility: "center",
        kind: "readback",
        prompt: (ctx) =>
          ph`${C(ctx, "center")}, ${N(ctx, "center")}, roger, ${ctx.destination.name} altimeter ${altimeter(ctx.atis.altimeter - 0.03)}.`,
        expects: (ctx) => [
          {
            kind: "altimeter",
            inHg: Math.round((ctx.atis.altimeter - 0.03) * 100) / 100,
            severity: "major",
          },
        ],
        example: (ctx) => ph`${altimeter(ctx.atis.altimeter - 0.03)}, ${C(ctx, "center")}.`,
        hint: () => "Read back the altimeter setting and set it.",
      },
    ];
    if (advancedMode(d))
      steps.push(
        {
          id: "second-handoff",
          title: "Unexpected frequency change",
          facility: "center",
          kind: "readback",
          situation: () => "Center is re-routing VFR traffic back to Approach.",
          prompt: (ctx) =>
            ph`${C(ctx, "center")}, change to my frequency is not approved, contact ${N(ctx, "approach")} ${FQ(ctx, "approach")} for further advisories.`,
          expects: (ctx) => [{ kind: "frequency", mhz: fac(ctx, "approach").mhz, readback: true }],
          example: (ctx) => ph`${N(ctx, "approach")} ${FQ(ctx, "approach")}, ${C(ctx, "center")}.`,
          hint: () => "Another handoff — read back the facility and frequency.",
          apply: (ctx) => ({ ...ctx, abbrevBy: { ...ctx.abbrevBy, approach: false } }),
        },
        {
          id: "back-to-approach",
          title: "Check in with Approach",
          facility: "approach",
          kind: "initial",
          expects: (ctx) => [
            station(ctx, "approach"),
            {
              kind: "altitude",
              ft: ctx.altitude,
              readback: false,
              label: "Altitude",
              tolerance: 100,
            },
          ],
          example: (ctx) =>
            ph`${N(ctx, "approach")}, ${C(ctx, "approach")}, level ${alt(ctx.altitude)}.`,
          hint: () => "Tune and check in: facility, full callsign, altitude.",
          closing: (ctx) => ph`${C(ctx, "approach")}, ${N(ctx, "approach")}, roger.`,
        },
      );
    return steps;
  },
};

// ---------- 6. traffic advisory ----------

const trafficAdvisory: ScenarioDef = {
  id: "traffic-advisory",
  title: "Traffic advisories",
  phase: "enroute",
  rules: "VFR",
  summary:
    'Respond correctly to traffic calls: "looking", "negative contact", "traffic in sight" — and to a traffic alert with a vector.',
  stations: ["Approach"],
  firstSpeaker: "atc",
  refs: [
    "AIM 4-1-15 Radar traffic information service",
    "P/CG: Negative contact, Traffic in sight",
    "JO 7110.65 §2-1-21",
  ],
  init: (ctx) => ({
    ...ctx,
    altitude: ctx.vfrCruise,
    heading: r10(ctx.destination.bearing),
    abbrevBy: { approach: true },
  }),
  radio: (ctx) => ({ active: fac(ctx, "approach").mhz, standby: fac(ctx, "tower").mhz }),
  briefing: (ctx) => ({
    situation: `VFR with flight following, ${alt(ctx.vfrCruise).text} ft, heading ${hdg(r10(ctx.destination.bearing)).text}.`,
    goal: "Acknowledge each traffic call with the correct phrase, and react immediately to a traffic alert.",
    say: [
      'Not seen yet: "Looking, <callsign>" or "Negative contact, <callsign>".',
      'Seen: "Traffic in sight, <callsign>".',
      "Traffic alert with a vector: read back the heading immediately.",
    ],
    why: [
      '"Roger" doesn\'t tell the controller whether you see the traffic.',
      "Clock positions are relative to your track, not your heading.",
    ],
  }),
  steps: (_ctx, d) => {
    const respond: Expect = {
      kind: "phrase",
      label: "Traffic response",
      any: [
        "looking",
        "negative contact",
        "negative traffic",
        "traffic in sight",
        "in sight",
        "have the traffic",
        "have traffic",
        "looking for traffic",
      ],
      category: "phraseology",
      severity: "major",
      tip: `Answer a traffic call with "looking", "negative contact" or "traffic in sight" — not just "roger" (AIM 4-1-15).`,
      say: "looking",
    };
    const steps: Step[] = [
      {
        id: "traffic-1",
        title: "First traffic call",
        facility: "approach",
        kind: "acknowledge",
        prompt: (ctx) =>
          ph`${C(ctx, "approach")}, traffic ${clock(2)}, ${miles(5)}, westbound, ${otherType(ctx)}, altitude indicates ${alt(ctx.altitude - 500)}.`,
        expects: () => [respond],
        example: (ctx) => ph`Looking, ${C(ctx, "approach")}.`,
        hint: () =>
          'You haven\'t spotted it yet — say "looking" (or "negative contact") and your callsign.',
      },
    ];
    if (advancedMode(d))
      steps.push({
        id: "traffic-alert",
        title: "Traffic alert",
        facility: "approach",
        kind: "readback",
        urgent: true,
        prompt: (ctx) =>
          ph`${C(ctx, "approach")}, traffic alert, ${otherType(ctx)} ${clock(12)}, ${miles(1)}, opposite direction, same altitude. Advise you turn right heading ${hdg(r10(ctx.heading + 40))} immediately.`,
        expects: (ctx) => [
          { kind: "heading", deg: r10(ctx.heading + 40), turn: "right", readback: true },
        ],
        example: (ctx) => ph`Right heading ${hdg(r10(ctx.heading + 40))}, ${C(ctx, "approach")}.`,
        hint: () => "Turn first, then read back the heading — briefly.",
        apply: (ctx) => ({ ...ctx, heading: r10(ctx.heading + 40) }),
      });
    steps.push({
      id: "traffic-2",
      title: "Updated traffic call",
      facility: "approach",
      kind: "acknowledge",
      prompt: (ctx) =>
        ph`${C(ctx, "approach")}, traffic now ${clock(1)}, ${miles(2)}, converging, ${otherType(ctx)}, altitude indicates ${alt(ctx.altitude - 300)}.`,
      expects: () => [{ ...respond, say: "traffic in sight" }],
      example: (ctx) => ph`Traffic in sight, ${C(ctx, "approach")}.`,
      hint: () => 'You now see the airplane — say "traffic in sight" with your callsign.',
      closing: (ctx) => ph`${C(ctx, "approach")}, roger.`,
    });
    return steps;
  },
};

// ---------- 7. class D entry ----------

const classDEntry: ScenarioDef = {
  id: "class-d-entry",
  title: "Entering Class D airspace",
  phase: "arrival",
  rules: "VFR",
  summary:
    "Establish two-way radio communication before entering Class D, then follow pattern-entry and landing instructions.",
  stations: ["Tower"],
  firstSpeaker: "pilot",
  refs: [
    "14 CFR 91.129",
    "AIM 3-2-5 Class D airspace",
    "AIM 4-3-2 Airports with an operating control tower",
  ],
  init: (ctx) => ({
    ...ctx,
    positionMiles: 10,
    position: `10 miles ${ctx.positionDir} of ${ctx.airportName}`,
    altitude: Math.round((ctx.patternAltitude + 1000) / 500) * 500,
    heading: r10(dirDeg(ctx.positionDir) + 180),
    abbrevBy: {},
  }),
  radio: (ctx, d) => ({ active: ctx.atisFreq ?? BLANK, standby: stby(ctx, d, "tower") }),
  briefing: (ctx) => ({
    situation: `Inbound VFR, 10 miles ${ctx.positionDir} of ${ctx.airportName}, outside the Class D. You've listened to the ATIS.`,
    goal: `Call ${fac(ctx, "tower").name} before entering the Class D. Don't enter until the controller answers with your callsign.`,
    say: [
      'Facility, full callsign, position, altitude, "with information __", "inbound for landing".',
      'Read back the pattern entry and runway; later "cleared to land" with the runway.',
    ],
    why: [
      'Two-way communication is established when the controller responds using your callsign — even "<callsign>, standby" counts (AIM 3-2-5).',
      '"Aircraft calling, standby" (no callsign) means you may NOT enter.',
    ],
  }),
  steps: (_ctx, d) => {
    const initialExpects = (ctx: ScenarioContext): Expect[] => [
      station(ctx, "tower"),
      {
        kind: "phrase",
        label: "Position",
        any: positionAny(ctx),
        category: "awareness",
        severity: "major",
        tip: `Report your position ("${ctx.position}").`,
        say: ctx.position,
      },
      { kind: "altitude", ft: ctx.altitude, readback: false, label: "Altitude", tolerance: 200 },
      atisE(ctx),
      {
        kind: "phrase",
        label: "Intentions",
        any: ["landing", "full stop", "touch and go", "inbound", "land", "option"],
        category: "awareness",
        severity: "major",
        tip: `State your intentions ("inbound for landing").`,
        say: "inbound for landing",
      },
    ];
    const initialExample = (ctx: ScenarioContext) =>
      ph`${N(ctx, "tower")}, ${C(ctx, "tower")}, ${ctx.position}, ${alt(ctx.altitude)}, with information ${letter(ctx.atis.letter)}, inbound for landing.`;
    const steps: Step[] = [
      {
        id: "classd-call",
        title: "Initial call to Tower",
        facility: "tower",
        kind: "initial",
        expects: initialExpects,
        example: initialExample,
        hint: (ctx) =>
          `Tune ${fac(ctx, "tower").name}: facility, full callsign, position, altitude, ATIS, "inbound for landing".`,
        missingNotes: [
          {
            label: "ATIS code",
            atc: (ctx) =>
              ph`${C(ctx, "tower")}, information ${letter(ctx.atis.letter)} is current, altimeter ${altimeter(ctx.atis.altimeter)}.`,
          },
        ],
      },
    ];
    if (advancedMode(d))
      steps.push({
        id: "say-again",
        title: "Say again — two-way comms not established",
        facility: "tower",
        kind: "initial",
        situation: () =>
          "The controller didn't catch your callsign. Two-way communication is NOT established yet — stay outside the Class D.",
        prompt: (ctx) => ph`Aircraft calling ${N(ctx, "tower")}, say again.`,
        expects: initialExpects,
        example: initialExample,
        hint: () =>
          "Repeat your full initial call — and remain outside the Class D until Tower answers with your callsign.",
      });
    steps.push(
      {
        id: "pattern-entry",
        title: "Pattern entry readback",
        facility: "tower",
        kind: "readback",
        prompt: (ctx) =>
          ph`${C(ctx, "tower")}, ${N(ctx, "tower")}, enter ${ctx.runway.pattern} downwind runway ${rwy(ctx.runway.id)}, report midfield downwind.`,
        expects: (ctx) => [
          runwayRB(ctx.runway.id),
          {
            kind: "phrase",
            label: "Pattern entry",
            any: [`${ctx.runway.pattern} downwind`],
            category: "readback",
            severity: "major",
            tip: `Read back the pattern entry ("${ctx.runway.pattern} downwind").`,
            say: `enter ${ctx.runway.pattern} downwind runway ${ctx.runway.id}`,
          },
          {
            kind: "phrase",
            label: "Reporting point",
            any: ["midfield", "wilco"],
            category: "readback",
            severity: "minor",
            tip: `Acknowledge the reporting instruction ("report midfield" or "wilco").`,
          },
        ],
        example: (ctx) =>
          ph`Enter ${ctx.runway.pattern} downwind runway ${rwy(ctx.runway.id)}, report midfield, ${C(ctx, "tower")}.`,
        hint: () => "Read back the pattern entry, runway and reporting point.",
        apply: (ctx) => ({
          ...ctx,
          position: `midfield ${ctx.runway.pattern} downwind runway ${ctx.runway.id}`,
          altitude: ctx.patternAltitude,
        }),
      },
      {
        id: "midfield",
        title: "Report midfield downwind",
        facility: "tower",
        kind: "report",
        situation: (ctx) =>
          `You're now midfield ${ctx.runway.pattern} downwind for runway ${ctx.runway.id} at pattern altitude.`,
        expects: (ctx) => [
          {
            kind: "phrase",
            label: "Position report",
            all: ["midfield", "downwind"],
            any: ["midfield downwind"],
            category: "awareness",
            severity: "major",
            tip: `Report exactly what was asked: "midfield ${ctx.runway.pattern} downwind runway ${ctx.runway.id}".`,
            say: `midfield ${ctx.runway.pattern} downwind`,
          },
          runwayRep(ctx.runway.id),
        ],
        example: (ctx) =>
          ph`${N(ctx, "tower")}, ${C(ctx, "tower")}, midfield ${ctx.runway.pattern} downwind runway ${rwy(ctx.runway.id)}.`,
        hint: () => "Report the position Tower asked for, with the runway.",
      },
      {
        id: "cleared-land",
        title: "Landing clearance readback",
        facility: "tower",
        kind: "readback",
        prompt: (ctx) =>
          ph`${C(ctx, "tower")}, number two, follow the Cherokee on ${ctx.runway.pattern} base, runway ${rwy(ctx.runway.id)}, cleared to land.`,
        expects: (ctx) => [
          runwayRB(ctx.runway.id),
          {
            kind: "phrase",
            label: "Cleared to land",
            any: ["cleared to land", "clear to land"],
            category: ["phraseology", "readback"],
            severity: "critical",
            tip: `Read back "runway ${ctx.runway.id}, cleared to land".`,
            say: `runway ${ctx.runway.id}, cleared to land`,
          },
          {
            kind: "phrase",
            label: "Sequence",
            any: ["number 2", "following", "follow", "traffic in sight", "looking"],
            category: "awareness",
            severity: "minor",
            tip: `Acknowledge your sequence ("number two, following the Cherokee") — or say "looking" if you don't see it.`,
          },
        ],
        example: (ctx) =>
          ph`Number two, following the Cherokee, runway ${rwy(ctx.runway.id)}, cleared to land, ${C(ctx, "tower")}.`,
        hint: () => 'Read back your sequence, the runway and "cleared to land".',
      },
    );
    return steps;
  },
};

// ---------- 8. landing ----------

const landing: ScenarioDef = {
  id: "landing",
  title: "Request landing clearance",
  phase: "arrival",
  rules: "VFR",
  summary:
    "Report a 3-mile final, read back the landing clearance, then exit the runway and switch to Ground.",
  stations: ["Tower", "Ground"],
  firstSpeaker: "pilot",
  refs: ["AIM 4-3-2", "AIM 4-3-20 Exiting the runway after landing", "JO 7110.65 §3-10"],
  init: (ctx) => ({
    ...ctx,
    position: `3 mile final runway ${ctx.runway.id}`,
    altitude: Math.round((ctx.airport.elevationFt + 1000) / 100) * 100,
    heading: ctx.runway.magHeading,
    abbrevBy: { tower: true },
  }),
  radio: (ctx, d) => ({ active: fac(ctx, "tower").mhz, standby: stby(ctx, d, "ground") }),
  briefing: (ctx) => ({
    situation: `Straight-in for runway ${ctx.runway.id} at ${ctx.airport.icao}. Tower asked you to "report 3-mile final". You're there now.`,
    goal: "Report, read back the landing clearance, then exit and contact Ground.",
    say: [
      'Report: callsign, "3 mile final runway __", full stop.',
      'Readback: "runway __, cleared to land", callsign.',
      "After landing: read back the exit instruction and Ground frequency.",
    ],
    why: [
      'Never land without hearing "cleared to land" for YOUR runway.',
      '"Continue" means you\'re not cleared yet — expect a clearance or a go-around.',
    ],
  }),
  steps: (_ctx, d) => {
    const exitSide = (ctx: ScenarioContext) => (ctx.runway.pattern === "left" ? "left" : "right");
    const twy = (ctx: ScenarioContext) => ctx.taxiRoute[0] ?? "A";
    const steps: Step[] = [
      {
        id: "final-report",
        title: "Report 3-mile final",
        facility: "tower",
        kind: "report",
        expects: (ctx) => [
          {
            kind: "phrase",
            label: "Position",
            any: ["3 mile final", "3 miles final", "final", "3 mile", "3 miles"],
            category: "awareness",
            severity: "major",
            tip: `Report "3 mile final runway ${ctx.runway.id}".`,
            say: `3 mile final runway ${ctx.runway.id}`,
          },
          runwayRep(ctx.runway.id),
          {
            kind: "phrase",
            label: "Intentions",
            any: ["full stop", "landing", "touch and go", "stop and go", "option", "low approach"],
            category: "awareness",
            severity: "minor",
            tip: `Add your intentions ("full stop").`,
          },
        ],
        example: (ctx) =>
          ph`${N(ctx, "tower")}, ${C(ctx, "tower")}, 3 mile final runway ${rwy(ctx.runway.id)}, full stop.`,
        hint: () => "Report your position and runway with your callsign.",
      },
    ];
    if (advancedMode(d))
      steps.push({
        id: "continue",
        title: '"Continue"',
        facility: "tower",
        kind: "acknowledge",
        prompt: (ctx) =>
          ph`${C(ctx, "tower")}, continue, traffic departing runway ${rwy(ctx.runway.id)}.`,
        expects: () => [
          {
            kind: "phrase",
            label: "Continue",
            any: ["continue", "continuing"],
            category: ["phraseology", "readback"],
            severity: "major",
            tip: `"Continue" means you're NOT cleared to land yet — acknowledge "continue" and expect a landing clearance (P/CG).`,
            say: "continue",
          },
        ],
        example: (ctx) => ph`Continue, ${C(ctx, "tower")}.`,
        hint: () => "Acknowledge — you are not cleared to land yet.",
      });
    steps.push(
      {
        id: "land-clearance",
        title: "Landing clearance readback",
        facility: "tower",
        kind: "readback",
        prompt: (ctx) =>
          ph`${C(ctx, "tower")}, ${wind(ctx.atis.windDirMag, ctx.atis.windKt)}, runway ${rwy(ctx.runway.id)}, cleared to land.`,
        expects: (ctx) => [
          runwayRB(ctx.runway.id),
          {
            kind: "phrase",
            label: "Cleared to land",
            any: ["cleared to land", "clear to land"],
            category: ["phraseology", "readback"],
            severity: "critical",
            tip: `Read back "runway ${ctx.runway.id}, cleared to land".`,
            say: `runway ${ctx.runway.id}, cleared to land`,
          },
        ],
        example: (ctx) => ph`Runway ${rwy(ctx.runway.id)}, cleared to land, ${C(ctx, "tower")}.`,
        hint: () => 'Runway, "cleared to land", callsign.',
        apply: (ctx) => ({
          ...ctx,
          position: `rolling out on runway ${ctx.runway.id}`,
          altitude: ctx.airport.elevationFt,
        }),
      },
      {
        id: "exit",
        title: "Exit and contact Ground",
        facility: "tower",
        kind: "readback",
        situation: (ctx) => `You've touched down and are slowing on runway ${ctx.runway.id}.`,
        prompt: (ctx) =>
          ph`${C(ctx, "tower")}, turn ${exitSide(ctx)} at ${letter(twy(ctx))}, contact ${N(ctx, "ground")} ${FQ(ctx, "ground")}.`,
        expects: (ctx) => [
          { kind: "frequency", mhz: fac(ctx, "ground").mhz, readback: true },
          {
            kind: "phrase",
            label: "Exit instruction",
            any: [`${exitSide(ctx)} at`, PHONETIC[twy(ctx)] ?? twy(ctx)],
            category: "readback",
            severity: "minor",
            tip: `Read back the exit ("${exitSide(ctx)} at ${PHONETIC[twy(ctx)]}").`,
          },
        ],
        example: (ctx) =>
          ph`${exitSide(ctx)} at ${letter(twy(ctx))}, ${N(ctx, "ground")} ${FQ(ctx, "ground")}, ${C(ctx, "tower")}.`,
        hint: () => "Read back the exit and the Ground frequency.",
        apply: (ctx) => ({ ...ctx, position: `clear of runway ${ctx.runway.id} at ${twy(ctx)}` }),
      },
      {
        id: "ground-call",
        title: "Call Ground for taxi",
        facility: "ground",
        kind: "initial",
        situation: (ctx) => `You're clear of the runway at taxiway ${PHONETIC[twy(ctx)]}.`,
        expects: (ctx) => [
          station(ctx, "ground"),
          {
            kind: "phrase",
            label: "Position",
            any: ["clear of", "clear", "off the runway"],
            category: "awareness",
            severity: "major",
            tip: `Say you're clear of the runway and where ("clear of runway ${ctx.runway.id} at ${PHONETIC[twy(ctx)]}").`,
            say: `clear of runway ${ctx.runway.id} at ${PHONETIC[twy(ctx)]}`,
          },
          {
            kind: "phrase",
            label: "Request",
            any: ["taxi", "parking", "ramp", "fbo"],
            category: "phraseology",
            severity: "minor",
            tip: `State your request ("taxi to ${ctx.parking}").`,
          },
        ],
        example: (ctx) =>
          ph`${N(ctx, "ground")}, ${C(ctx, "ground")}, clear of runway ${rwy(ctx.runway.id)} at ${letter(twy(ctx))}, taxi to ${ctx.parking}.`,
        hint: (ctx) =>
          `Tune ${fac(ctx, "ground").name}: facility, full callsign, "clear of runway ${ctx.runway.id} at ${PHONETIC[twy(ctx)]}", request taxi.`,
        closing: (ctx) =>
          ph`${C(ctx, "ground")}, ${N(ctx, "ground")}, taxi to ${ctx.parking} via ${route(ctx.taxiRoute)}.`,
      },
    );
    return steps;
  },
};

// ---------- 9. go-around ----------

const goAround: ScenarioDef = {
  id: "go-around",
  title: "Go-around instruction",
  phase: "arrival",
  rules: "VFR",
  summary:
    "On short final, Tower orders a go-around. Respond immediately, read back the climb-out instructions and re-enter the pattern.",
  stations: ["Tower"],
  firstSpeaker: "atc",
  refs: ["AIM 4-3-2", "P/CG: Go around", "Airplane Flying Handbook ch. 9 (go-arounds)"],
  init: (ctx) => ({
    ...ctx,
    position: `short final runway ${ctx.runway.id}`,
    altitude: ctx.airport.elevationFt + 300,
    heading: ctx.runway.magHeading,
    abbrevBy: { tower: true },
  }),
  radio: (ctx) => ({ active: fac(ctx, "tower").mhz, standby: fac(ctx, "ground").mhz }),
  briefing: (ctx) => ({
    situation: `Short final for runway ${ctx.runway.id}, already cleared to land. An airplane is slow to exit the runway.`,
    goal: 'Go around immediately, answer "going around", then read back and fly the climb-out instructions.',
    say: [
      'Immediate response: "Going around, <callsign>" — fly first.',
      "Read back heading, altitude and pattern instructions.",
    ],
    why: [
      "A go-around instruction must be complied with immediately; the reply should be short.",
      "Reading back the altitude and heading prevents conflicts with departing traffic.",
    ],
  }),
  steps: () => [
    {
      id: "go-around",
      title: "Go around!",
      facility: "tower",
      kind: "acknowledge",
      urgent: true,
      prompt: (ctx) => ph`${C(ctx, "tower")}, go around, aircraft on the runway.`,
      expects: () => [
        {
          kind: "phrase",
          label: "Going around",
          any: ["going around", "go around", "going round"],
          category: ["phraseology", "readback"],
          severity: "critical",
          tip: `Respond immediately with "going around" and your callsign.`,
          say: "going around",
        },
        {
          kind: "phrase",
          label: "Standard reply",
          any: ["going around"],
          category: "phraseology",
          severity: "minor",
          tip: `The standard pilot reply is "going around" (not "go around").`,
        },
      ],
      example: (ctx) => ph`Going around, ${C(ctx, "tower")}.`,
      hint: () => 'Full power, climb — and say "going around" with your callsign.',
      apply: (ctx) => ({
        ...ctx,
        position: `climbing out over runway ${ctx.runway.id}`,
        altitude: ctx.airport.elevationFt + 500,
      }),
    },
    {
      id: "climb-out",
      title: "Climb-out instructions",
      facility: "tower",
      kind: "readback",
      prompt: (ctx) =>
        ph`${C(ctx, "tower")}, fly runway heading, climb and maintain ${alt(ctx.patternAltitude)}, make ${ctx.runway.pattern} traffic runway ${rwy(ctx.runway.id)}, report downwind.`,
      expects: (ctx) => [
        { kind: "heading", deg: "runway", readback: true },
        {
          kind: "altitude",
          ft: ctx.patternAltitude,
          readback: true,
          say: `climb and maintain ${alt(ctx.patternAltitude).text}`,
        },
        { kind: "runway", runway: ctx.runway.id, readback: true, severity: "major" },
        {
          kind: "phrase",
          label: "Pattern instruction",
          any: [`${ctx.runway.pattern} traffic`],
          category: "readback",
          severity: "major",
          tip: `Read back "${ctx.runway.pattern} traffic".`,
          say: `make ${ctx.runway.pattern} traffic`,
        },
      ],
      example: (ctx) =>
        ph`Runway heading, ${alt(ctx.patternAltitude)}, ${ctx.runway.pattern} traffic runway ${rwy(ctx.runway.id)}, report downwind, ${C(ctx, "tower")}.`,
      hint: () => "Read back heading, altitude, pattern direction and runway.",
      apply: (ctx) => ({
        ...ctx,
        position: `${ctx.runway.pattern} downwind runway ${ctx.runway.id}`,
        altitude: ctx.patternAltitude,
        heading: r10(ctx.runway.magHeading + 180),
      }),
    },
    {
      id: "downwind",
      title: "Report downwind",
      facility: "tower",
      kind: "report",
      situation: (ctx) =>
        `You're established on the ${ctx.runway.pattern} downwind for runway ${ctx.runway.id}.`,
      expects: (ctx) => [
        {
          kind: "phrase",
          label: "Position report",
          any: ["downwind"],
          category: "awareness",
          severity: "major",
          tip: `Report "${ctx.runway.pattern} downwind runway ${ctx.runway.id}".`,
          say: `${ctx.runway.pattern} downwind runway ${ctx.runway.id}`,
        },
        runwayRep(ctx.runway.id),
      ],
      example: (ctx) =>
        ph`${N(ctx, "tower")}, ${C(ctx, "tower")}, ${ctx.runway.pattern} downwind runway ${rwy(ctx.runway.id)}, full stop.`,
      hint: () => "Report downwind with the runway.",
    },
    {
      id: "cleared-land-2",
      title: "Landing clearance readback",
      facility: "tower",
      kind: "readback",
      prompt: (ctx) => ph`${C(ctx, "tower")}, runway ${rwy(ctx.runway.id)}, cleared to land.`,
      expects: (ctx) => [
        runwayRB(ctx.runway.id),
        {
          kind: "phrase",
          label: "Cleared to land",
          any: ["cleared to land", "clear to land"],
          category: ["phraseology", "readback"],
          severity: "critical",
          tip: `Read back "runway ${ctx.runway.id}, cleared to land".`,
          say: `runway ${ctx.runway.id}, cleared to land`,
        },
      ],
      example: (ctx) => ph`Runway ${rwy(ctx.runway.id)}, cleared to land, ${C(ctx, "tower")}.`,
      hint: () => 'Runway, "cleared to land", callsign.',
    },
  ],
};

// ---------- 10. IFR clearance request ----------

const ifrClearanceRequest: ScenarioDef = {
  id: "ifr-clearance-request",
  title: "Request an IFR clearance",
  phase: "ifr",
  rules: "IFR",
  summary:
    "Request your IFR clearance from Clearance Delivery (or Ground), state you're ready to copy and read back the full clearance.",
  stations: ["Clearance Delivery", "Ground"],
  firstSpeaker: "pilot",
  refs: [
    "AIM 5-2-1 Pre-taxi clearance procedures",
    "AIM 4-4-7 Pilot responsibility upon clearance issuance",
    "AIM 5-2-5 Abbreviated IFR departure clearance",
  ],
  contextOptions: { ifrWeather: true },
  init: (ctx) => ({
    ...ctx,
    rules: "IFR",
    position: `${ctx.parking}, ${ctx.airportName}`,
    altitude: ctx.airport.elevationFt,
    abbrevBy: {},
    clearance: ifrClearance(ctx, false),
  }),
  radio: (ctx, d) => ({ active: ctx.atisFreq ?? BLANK, standby: stby(ctx, d, "clearance") }),
  briefing: (ctx) => ({
    situation: `IFR flight plan filed from ${ctx.airport.icao} to ${ctx.destination.icao} (${ctx.destination.name}). You're at ${ctx.parking} with the ATIS.${fac(ctx, "clearance").note ? ` ${fac(ctx, "clearance").note}` : ""}`,
    goal: `Request your clearance from ${fac(ctx, "clearance").name} and read it back (CRAFT).`,
    say: [
      'Request: facility, full callsign, "IFR to <destination>", ATIS code, "request clearance".',
      "Write the clearance on the CRAFT pad as you hear it, then read it all back.",
    ],
    why: [
      "The ATIS code and destination let the controller find your flight plan quickly.",
      "The full readback is your chance to catch errors in route, altitude, frequency or code.",
    ],
  }),
  steps: (_ctx, d) => {
    const steps: Step[] = [
      {
        id: "clr-request",
        title: "Request clearance",
        facility: "clearance",
        kind: "initial",
        expects: (ctx) => [
          station(ctx, "clearance"),
          {
            kind: "phrase",
            label: "IFR",
            any: ["ifr"],
            category: "awareness",
            severity: "major",
            tip: `Say "IFR to ${ctx.destination.name}".`,
            say: `IFR to ${ctx.destination.name}`,
          },
          {
            kind: "phrase",
            label: "Destination",
            any: destForms(ctx),
            category: "awareness",
            severity: "major",
            tip: `State your destination ("IFR to ${ctx.destination.name}").`,
            say: `to ${ctx.destination.name}`,
          },
          atisE(ctx),
          {
            kind: "phrase",
            label: "Request",
            any: ["clearance", "ready to copy", "request ifr"],
            category: "phraseology",
            severity: "minor",
            tip: `End with "request clearance".`,
          },
        ],
        example: (ctx) =>
          ph`${N(ctx, "clearance")}, ${C(ctx, "clearance")}, ${fac(ctx, "clearance").note ? `at ${ctx.parking}, ` : ""}IFR to ${ctx.destination.name}, with information ${letter(ctx.atis.letter)}, request clearance.`,
        hint: (ctx) =>
          `Tune ${fac(ctx, "clearance").name} (${freq(fac(ctx, "clearance").mhz).text}): facility, full callsign, "IFR to ${ctx.destination.name}", ATIS, "request clearance".`,
        missingNotes: [
          {
            label: "ATIS code",
            atc: (ctx) =>
              ph`${C(ctx, "clearance")}, information ${letter(ctx.atis.letter)} is current, altimeter ${altimeter(ctx.atis.altimeter)}.`,
          },
        ],
      },
      {
        id: "ready-copy",
        title: "Ready to copy",
        facility: "clearance",
        kind: "acknowledge",
        prompt: (ctx) =>
          ph`${C(ctx, "clearance")}, ${N(ctx, "clearance")}, I have your clearance, advise ready to copy.`,
        expects: () => [
          {
            kind: "phrase",
            label: "Ready to copy",
            any: ["ready to copy", "ready"],
            category: "phraseology",
            severity: "major",
            tip: `Grab your pen and answer "ready to copy".`,
            say: "ready to copy",
          },
        ],
        example: (ctx) => ph`Ready to copy, ${C(ctx, "clearance")}.`,
        hint: () => 'Have the CRAFT pad ready, then say "ready to copy".',
      },
      {
        id: "clr-readback",
        title: "Clearance readback",
        facility: "clearance",
        kind: "readback",
        prompt: (ctx) =>
          ph`${C(ctx, "clearance")}, cleared to the ${ctx.destination.name} airport as filed. Climb and maintain ${alt(ctx.ifrInitial)}, expect ${alt(ctx.ifrCruise)} 10 minutes after departure. Departure frequency ${FQ(ctx, "departure")}, squawk ${squawk(ctx.squawk)}.`,
        expects: (ctx) => [
          {
            kind: "phrase",
            label: "Clearance limit",
            any: destForms(ctx),
            category: "readback",
            severity: "major",
            tip: `Read back the clearance limit ("cleared to the ${ctx.destination.name} airport").`,
            say: `cleared to the ${ctx.destination.name} airport`,
          },
          {
            kind: "phrase",
            label: "Route",
            any: ["as filed"],
            category: "readback",
            severity: "major",
            tip: `Read back the route ("as filed").`,
            say: "as filed",
          },
          {
            kind: "altitude",
            ft: ctx.ifrInitial,
            readback: true,
            say: `climb and maintain ${alt(ctx.ifrInitial).text}`,
          },
          {
            kind: "altitude",
            ft: ctx.ifrCruise,
            readback: false,
            label: "Expected altitude",
            severity: "major",
            say: `expect ${alt(ctx.ifrCruise).text} 10 minutes after departure`,
          },
          {
            kind: "frequency",
            mhz: fac(ctx, "departure").mhz,
            readback: true,
            say: `departure frequency ${freq(fac(ctx, "departure").mhz).text}`,
          },
          { kind: "squawk", code: ctx.squawk },
        ],
        example: (ctx) =>
          ph`Cleared to the ${ctx.destination.name} airport as filed, climb and maintain ${alt(ctx.ifrInitial)}, expect ${alt(ctx.ifrCruise)} 10 minutes after departure, departure frequency ${FQ(ctx, "departure")}, squawk ${squawk(ctx.squawk)}, ${C(ctx, "clearance")}.`,
        hint: () =>
          "Read back every CRAFT item: Clearance limit, Route, Altitude (and expect), Frequency, Transponder.",
        closing: (ctx) => (advancedMode(d) ? null : ph`${C(ctx, "clearance")}, readback correct.`),
      },
    ];
    if (advancedMode(d))
      steps.push({
        id: "new-code",
        title: "Amended squawk",
        facility: "clearance",
        kind: "readback",
        prompt: (ctx) => {
          const code = `${ctx.squawk.slice(0, 3)}${ctx.squawk.endsWith("6") ? "2" : "6"}`;
          return ph`${C(ctx, "clearance")}, readback correct, correction, squawk ${squawk(code)}.`;
        },
        expects: (ctx) => [
          {
            kind: "squawk",
            code: `${ctx.squawk.slice(0, 3)}${ctx.squawk.endsWith("6") ? "2" : "6"}`,
          },
        ],
        example: (ctx) =>
          ph`Squawk ${squawk(`${ctx.squawk.slice(0, 3)}${ctx.squawk.endsWith("6") ? "2" : "6"}`)}, ${C(ctx, "clearance")}.`,
        hint: () => "A corrected code replaces the old one — read it back and update your pad.",
        closing: (ctx) => ph`${C(ctx, "clearance")}, readback correct.`,
      });
    return steps;
  },
};

// ---------- 11. IFR departure clearance (CRAFT) ----------

const ifrDepartureClearance: ScenarioDef = {
  id: "ifr-departure-clearance",
  title: "Copy & read back a CRAFT clearance",
  phase: "ifr",
  rules: "IFR",
  summary:
    "Copy a full-route IFR clearance with radar vectors to a fix, then read it back item by item.",
  stations: ["Clearance Delivery", "Ground"],
  firstSpeaker: "atc",
  refs: ["AIM 4-4-3 Clearance items", "AIM 4-4-7", "JO 7110.65 §4-3-2 Departure clearances"],
  contextOptions: { ifrWeather: true },
  init: (ctx) => ({
    ...ctx,
    rules: "IFR",
    position: `${ctx.parking}, ${ctx.airportName}`,
    altitude: ctx.airport.elevationFt,
    abbrevBy: {},
    clearance: ifrClearance(ctx, true),
  }),
  radio: (ctx) => ({ active: fac(ctx, "clearance").mhz, standby: ctx.atisFreq ?? BLANK }),
  briefing: (ctx) => ({
    situation: `You called ${fac(ctx, "clearance").name} for your IFR clearance to ${ctx.destination.name}. They're calling you back.`,
    goal: "Copy the clearance on the CRAFT pad and read it back in order.",
    say: [
      "C — Clearance limit",
      "R — Route (radar vectors, fix, then as filed)",
      "A — Altitude: climb and maintain …, expect … 10 minutes after departure",
      "F — Departure frequency",
      "T — Transponder code",
    ],
    why: [
      "CRAFT matches the order controllers issue clearances, so you're never hunting for an item.",
      "If anything is unclear, ask — never accept a clearance you don't understand (AIM 4-4-7).",
    ],
  }),
  steps: (_ctx, d) => {
    const steps: Step[] = [
      {
        id: "advise-ready",
        title: "Ready to copy",
        facility: "clearance",
        kind: "acknowledge",
        prompt: (ctx) =>
          ph`${C(ctx, "clearance")}, ${N(ctx, "clearance")}, I have your IFR clearance, advise ready to copy.`,
        expects: () => [
          {
            kind: "phrase",
            label: "Ready to copy",
            any: ["ready to copy", "ready"],
            category: "phraseology",
            severity: "major",
            tip: `Answer "ready to copy" when you have something to write with.`,
            say: "ready to copy",
          },
        ],
        example: (ctx) => ph`Ready to copy, ${C(ctx, "clearance")}.`,
        hint: () => 'Pen ready? Say "ready to copy" and your callsign.',
      },
      {
        id: "craft",
        title: "CRAFT readback",
        facility: "clearance",
        kind: "readback",
        prompt: (ctx) =>
          ph`${C(ctx, "clearance")}, cleared to the ${ctx.destination.name} airport via radar vectors ${nav(ctx).name}, then as filed. Climb and maintain ${alt(ctx.ifrInitial)}, expect ${alt(ctx.ifrCruise)} 10 minutes after departure. Departure frequency ${FQ(ctx, "departure")}, squawk ${squawk(ctx.squawk)}.`,
        expects: (ctx) => [
          {
            kind: "phrase",
            label: "C — Clearance limit",
            any: destForms(ctx),
            category: "readback",
            severity: "major",
            tip: `Read back the clearance limit ("cleared to the ${ctx.destination.name} airport").`,
            say: `cleared to the ${ctx.destination.name} airport`,
          },
          {
            kind: "phrase",
            label: "R — Radar vectors",
            any: ["radar vectors", "vectors"],
            category: "readback",
            severity: "major",
            tip: `Read back the route: "radar vectors ${nav(ctx).name}, then as filed".`,
            say: `radar vectors ${nav(ctx).name}`,
          },
          {
            kind: "phrase",
            label: "R — Route fix",
            any: [nav(ctx).name, nav(ctx).id].filter(Boolean),
            category: "readback",
            severity: "major",
            tip: `Include the fix (${nav(ctx).name}) in the route readback.`,
            say: nav(ctx).name,
          },
          {
            kind: "phrase",
            label: "R — Then as filed",
            any: ["as filed"],
            category: "readback",
            severity: "minor",
            tip: `Finish the route with "then as filed".`,
          },
          {
            kind: "altitude",
            ft: ctx.ifrInitial,
            readback: true,
            label: "A — Initial altitude",
            say: `climb and maintain ${alt(ctx.ifrInitial).text}`,
          },
          {
            kind: "altitude",
            ft: ctx.ifrCruise,
            readback: false,
            label: "A — Expected altitude",
            severity: "major",
            say: `expect ${alt(ctx.ifrCruise).text} 10 minutes after departure`,
          },
          {
            kind: "frequency",
            mhz: fac(ctx, "departure").mhz,
            readback: true,
            say: `departure frequency ${freq(fac(ctx, "departure").mhz).text}`,
          },
          { kind: "squawk", code: ctx.squawk },
        ],
        example: (ctx) =>
          ph`Cleared to the ${ctx.destination.name} airport via radar vectors ${nav(ctx).name}, then as filed, climb and maintain ${alt(ctx.ifrInitial)}, expect ${alt(ctx.ifrCruise)} 10 minutes after departure, departure frequency ${FQ(ctx, "departure")}, squawk ${squawk(ctx.squawk)}, ${C(ctx, "clearance")}.`,
        hint: () => "Read it back in CRAFT order straight from your pad.",
        closing: (ctx) => (advancedMode(d) ? null : ph`${C(ctx, "clearance")}, readback correct.`),
      },
    ];
    if (advancedMode(d))
      steps.push({
        id: "amendment",
        title: "Clearance amendment",
        facility: "clearance",
        kind: "readback",
        prompt: (ctx) =>
          ph`${C(ctx, "clearance")}, readback correct. Amendment to your altitude: climb and maintain ${alt(ctx.ifrInitial + 1000)}, expect ${alt(ctx.ifrCruise)} 10 minutes after departure, rest of clearance unchanged.`,
        expects: (ctx) => [
          {
            kind: "altitude",
            ft: ctx.ifrInitial + 1000,
            readback: true,
            say: `climb and maintain ${alt(ctx.ifrInitial + 1000).text}`,
          },
          {
            kind: "altitude",
            ft: ctx.ifrCruise,
            readback: false,
            label: "Expected altitude",
            severity: "minor",
          },
        ],
        example: (ctx) =>
          ph`Climb and maintain ${alt(ctx.ifrInitial + 1000)}, expect ${alt(ctx.ifrCruise)} 10 minutes after departure, ${C(ctx, "clearance")}.`,
        hint: () => "Cross out the old altitude on your pad and read back the new one.",
        apply: (ctx) => ({ ...ctx, ifrInitial: ctx.ifrInitial + 1000 }),
        closing: (ctx) => ph`${C(ctx, "clearance")}, readback correct.`,
      });
    return steps;
  },
};

// ---------- 12. instrument approach ----------

const instrumentApproach: ScenarioDef = {
  id: "instrument-approach",
  title: "Fly an instrument approach",
  phase: "ifr",
  rules: "IFR",
  summary:
    'Descent, vectors to final and an approach clearance: read back altitudes, headings and "maintain … until established, cleared … approach".',
  stations: ["Approach", "Tower"],
  firstSpeaker: "atc",
  refs: [
    "AIM 5-4-3 Approach control",
    "AIM 5-4-7 Instrument approach procedures",
    "JO 7110.65 §5-9-4 Arrival instructions",
  ],
  contextOptions: { preferIls: true, ifrWeather: true },
  init: (ctx) => ({
    ...ctx,
    rules: "IFR",
    position: `${15} miles ${ctx.positionDir} of ${ctx.airportName}`,
    altitude: Math.max(
      ctx.interceptAltitude + 3000,
      Math.round((ctx.airport.elevationFt + 5000) / 1000) * 1000,
    ),
    heading: r10(dirDeg(ctx.positionDir) + 180),
    abbrevBy: { approach: true },
  }),
  radio: (ctx, d) => ({ active: fac(ctx, "approach").mhz, standby: stby(ctx, d, "tower") }),
  briefing: (ctx) => ({
    situation: `IFR inbound to ${ctx.airport.icao} in IMC, ${ctx.position} at ${alt(Math.max(ctx.interceptAltitude + 3000, Math.round((ctx.airport.elevationFt + 5000) / 1000) * 1000)).text} ft. ATIS: ${ctx.atis.sky}, visibility ${ctx.atis.visibilitySm}.`,
    goal: `Fly vectors to the ${approachPhrase(ctx.runway).text} approach and switch to Tower.`,
    say: [
      "Read back every altitude, heading and the full approach clearance.",
      'Approach clearance readback: heading, "maintain __ until established", "cleared <approach>".',
    ],
    why: [
      '"Maintain until established" protects you from terrain until you\'re on a published segment.',
      "Never descend below the assigned altitude on a vector until you're established and cleared.",
    ],
  }),
  steps: (_ctx, d) => {
    const descend = (ctx: ScenarioContext) =>
      Math.max(ctx.interceptAltitude + 1000, ctx.altitude - 2000);
    const downwind = (ctx: ScenarioContext) => r10(ctx.runway.magHeading + 180);
    const intercept = (ctx: ScenarioContext) =>
      r10(ctx.runway.magHeading + (ctx.runway.pattern === "left" ? 30 : -30));
    const steps: Step[] = [
      {
        id: "descend",
        title: "Descent and expected approach",
        facility: "approach",
        kind: "readback",
        prompt: (ctx) =>
          ph`${C(ctx, "approach")}, descend and maintain ${alt(descend(ctx))}, ${ctx.airportName} altimeter ${altimeter(ctx.atis.altimeter)}, expect vectors ${approachPhrase(ctx.runway)} approach.`,
        expects: (ctx) => [
          {
            kind: "altitude",
            ft: descend(ctx),
            readback: true,
            say: `descend and maintain ${alt(descend(ctx)).text}`,
          },
          { kind: "altimeter", inHg: ctx.atis.altimeter, severity: "major" },
          {
            kind: "phrase",
            label: "Expected approach",
            any: ["ils", "rnav", "gps", "localizer", "approach"],
            category: "awareness",
            severity: "minor",
            tip: `Acknowledge the expected approach ("expect ${approachPhrase(ctx.runway).text}").`,
          },
        ],
        example: (ctx) =>
          ph`Descend and maintain ${alt(descend(ctx))}, ${altimeter(ctx.atis.altimeter)}, expect ${approachPhrase(ctx.runway)}, ${C(ctx, "approach")}.`,
        hint: () => "Read back the altitude and altimeter; note the approach to brief.",
        apply: (ctx) => ({ ...ctx, altitude: descend(ctx) }),
      },
      {
        id: "vector",
        title: "Vector",
        facility: "approach",
        kind: "readback",
        prompt: (ctx) =>
          ph`${C(ctx, "approach")}, turn ${turnSide(ctx.heading, downwind(ctx))} heading ${hdg(downwind(ctx))}, vector for the ${approachPhrase(ctx.runway)} approach.`,
        expects: (ctx) => [
          {
            kind: "heading",
            deg: downwind(ctx),
            turn: turnSide(ctx.heading, downwind(ctx)),
            readback: true,
          },
        ],
        example: (ctx) =>
          ph`${turnSide(ctx.heading, downwind(ctx))} heading ${hdg(downwind(ctx))}, ${C(ctx, "approach")}.`,
        hint: () => "Read back the turn direction and heading.",
        apply: (ctx) => ({ ...ctx, heading: downwind(ctx) }),
      },
    ];
    if (advancedMode(d))
      steps.push({
        id: "amended-descent",
        title: "Amended altitude",
        facility: "approach",
        kind: "readback",
        prompt: (ctx) =>
          ph`${C(ctx, "approach")}, descend and maintain ${alt(ctx.interceptAltitude + 500)}, traffic is a King Air on a 4-mile final.`,
        expects: (ctx) => [
          {
            kind: "altitude",
            ft: ctx.interceptAltitude + 500,
            readback: true,
            say: `descend and maintain ${alt(ctx.interceptAltitude + 500).text}`,
          },
        ],
        example: (ctx) =>
          ph`Descend and maintain ${alt(ctx.interceptAltitude + 500)}, ${C(ctx, "approach")}.`,
        hint: () => "Read back the new altitude.",
        apply: (ctx) => ({ ...ctx, altitude: ctx.interceptAltitude + 500 }),
      });
    steps.push(
      {
        id: "approach-clearance",
        title: "Approach clearance",
        facility: "approach",
        kind: "readback",
        prompt: (ctx) =>
          ph`${C(ctx, "approach")}, 6 miles from the final approach fix, turn ${turnSide(ctx.heading, intercept(ctx))} heading ${hdg(intercept(ctx))}, maintain ${alt(ctx.interceptAltitude)} until established on the ${ctx.runway.ils ? "localizer" : "final approach course"}, cleared ${approachPhrase(ctx.runway)} approach.`,
        expects: (ctx) => [
          {
            kind: "heading",
            deg: intercept(ctx),
            turn: turnSide(ctx.heading, intercept(ctx)),
            readback: true,
          },
          {
            kind: "altitude",
            ft: ctx.interceptAltitude,
            readback: true,
            say: `maintain ${alt(ctx.interceptAltitude).text} until established`,
          },
          {
            kind: "phrase",
            label: "Until established",
            any: ["until established", "established"],
            category: "readback",
            severity: "major",
            tip: `Include "until established" — it's a condition on your altitude.`,
            say: "until established",
          },
          {
            kind: "phrase",
            label: "Approach clearance",
            any: [
              "cleared ils",
              "cleared rnav",
              "cleared gps",
              "cleared the ils",
              "cleared for the ils",
              "cleared approach",
              "cleared for the approach",
              "cleared localizer",
            ],
            category: ["readback", "phraseology"],
            severity: "critical",
            tip: `Read back the approach clearance ("cleared ${approachPhrase(ctx.runway).text} approach").`,
            say: `cleared ${approachPhrase(ctx.runway).text} approach`,
          },
          runwayRB(ctx.runway.id),
        ],
        example: (ctx) =>
          ph`${turnSide(ctx.heading, intercept(ctx))} heading ${hdg(intercept(ctx))}, maintain ${alt(ctx.interceptAltitude)} until established, cleared ${approachPhrase(ctx.runway)} approach, ${C(ctx, "approach")}.`,
        hint: () => 'Heading, "maintain __ until established", "cleared <approach>", callsign.',
        apply: (ctx) => ({
          ...ctx,
          heading: intercept(ctx),
          altitude: ctx.interceptAltitude,
          position: `established on the ${approachPhrase(ctx.runway).text}`,
        }),
      },
      {
        id: "tower-handoff",
        title: "Contact Tower",
        facility: "approach",
        kind: "readback",
        situation: () => "You're established inbound.",
        prompt: (ctx) => ph`${C(ctx, "approach")}, contact ${N(ctx, "tower")} ${FQ(ctx, "tower")}.`,
        expects: (ctx) => [{ kind: "frequency", mhz: fac(ctx, "tower").mhz, readback: true }],
        example: (ctx) => ph`${N(ctx, "tower")} ${FQ(ctx, "tower")}, ${C(ctx, "approach")}.`,
        hint: () => "Read back the Tower frequency.",
      },
      {
        id: "tower-checkin",
        title: "Check in with Tower",
        facility: "tower",
        kind: "initial",
        expects: (ctx) => [
          station(ctx, "tower"),
          {
            kind: "phrase",
            label: "Approach",
            any: ["ils", "rnav", "gps", "localizer", "approach"],
            category: "awareness",
            severity: "major",
            tip: `Tell Tower which approach you're on ("${approachPhrase(ctx.runway).text}").`,
            say: approachPhrase(ctx.runway).text,
          },
          runwayRep(ctx.runway.id),
        ],
        example: (ctx) =>
          ph`${N(ctx, "tower")}, ${C(ctx, "tower")}, ${approachPhrase(ctx.runway)}.`,
        hint: (ctx) =>
          `Tune ${fac(ctx, "tower").name}: facility, full callsign, approach and runway.`,
      },
      {
        id: "land",
        title: "Landing clearance",
        facility: "tower",
        kind: "readback",
        prompt: (ctx) =>
          ph`${C(ctx, "tower")}, ${N(ctx, "tower")}, ${wind(ctx.atis.windDirMag, ctx.atis.windKt)}, runway ${rwy(ctx.runway.id)}, cleared to land.`,
        expects: (ctx) => [
          runwayRB(ctx.runway.id),
          {
            kind: "phrase",
            label: "Cleared to land",
            any: ["cleared to land", "clear to land"],
            category: ["phraseology", "readback"],
            severity: "critical",
            tip: `Read back "runway ${ctx.runway.id}, cleared to land".`,
            say: `runway ${ctx.runway.id}, cleared to land`,
          },
        ],
        example: (ctx) => ph`Runway ${rwy(ctx.runway.id)}, cleared to land, ${C(ctx, "tower")}.`,
        hint: () => 'Runway, "cleared to land", callsign.',
      },
    );
    return steps;
  },
};

// ---------- 13. established on final ----------

const establishedFinal: ScenarioDef = {
  id: "established-final",
  title: "Report established",
  phase: "ifr",
  rules: "IFR",
  summary:
    "Cleared for the approach with a request to report established: report, switch to Tower and get your landing clearance.",
  stations: ["Approach", "Tower"],
  firstSpeaker: "pilot",
  refs: ["AIM 5-4-3", "AIM 5-3-3 Additional reports", "P/CG: Established"],
  contextOptions: { preferIls: true, ifrWeather: true },
  init: (ctx) => ({
    ...ctx,
    rules: "IFR",
    position: `intercepting the ${approachPhrase(ctx.runway).text} final approach course`,
    altitude: ctx.interceptAltitude,
    heading: ctx.runway.magHeading,
    abbrevBy: { approach: true },
  }),
  radio: (ctx, d) => ({ active: fac(ctx, "approach").mhz, standby: stby(ctx, d, "tower") }),
  briefing: (ctx) => ({
    situation: `You were cleared for the ${approachPhrase(ctx.runway).text} approach and told: "report established". The ${ctx.runway.ils ? "localizer" : "course"} needle is now centered.`,
    goal: "Report established, read back the Tower handoff, check in and read back the landing clearance.",
    say: [
      '"<callsign>, established <approach>".',
      "Tower check-in: facility, full callsign, approach and position.",
    ],
    why: [
      "Approach needs your report to release you to Tower and to sequence traffic behind you.",
      '"Established" means on a published segment of the approach — not just turning toward it.',
    ],
  }),
  steps: (_ctx, d) => {
    const steps: Step[] = [
      {
        id: "report-established",
        title: "Report established",
        facility: "approach",
        kind: "report",
        expects: (ctx) => [
          {
            kind: "phrase",
            label: "Established",
            any: ["established"],
            category: ["phraseology", "awareness"],
            severity: "major",
            tip: `Use the word "established" — that's what the controller asked you to report.`,
            say: `established ${approachPhrase(ctx.runway).text}`,
          },
          {
            kind: "phrase",
            label: "Approach",
            any: ["ils", "rnav", "gps", "localizer", "final approach course", "final"],
            category: "awareness",
            severity: "major",
            tip: `Say what you're established on ("${approachPhrase(ctx.runway).text}").`,
          },
          runwayRep(ctx.runway.id),
        ],
        example: (ctx) =>
          ph`${N(ctx, "approach")}, ${C(ctx, "approach")}, established ${approachPhrase(ctx.runway)}.`,
        hint: () => 'Callsign, "established", approach and runway.',
      },
      {
        id: "contact-tower",
        title: "Contact Tower",
        facility: "approach",
        kind: "readback",
        prompt: (ctx) =>
          ph`${C(ctx, "approach")}, roger, contact ${N(ctx, "tower")} ${FQ(ctx, "tower")}.`,
        expects: (ctx) => [{ kind: "frequency", mhz: fac(ctx, "tower").mhz, readback: true }],
        example: (ctx) => ph`${N(ctx, "tower")} ${FQ(ctx, "tower")}, ${C(ctx, "approach")}.`,
        hint: () => "Read back the Tower frequency.",
      },
      {
        id: "tower-call",
        title: "Check in with Tower",
        facility: "tower",
        kind: "initial",
        expects: (ctx) => [
          station(ctx, "tower"),
          {
            kind: "phrase",
            label: "Position",
            any: [
              "final",
              "inbound",
              "established",
              "outer marker",
              "final approach fix",
              "ils",
              "rnav",
              "localizer",
            ],
            category: "awareness",
            severity: "major",
            tip: `Report the approach/position ("${approachPhrase(ctx.runway).text}, 6 mile final").`,
            say: `${approachPhrase(ctx.runway).text}, 6 mile final`,
          },
          runwayRep(ctx.runway.id),
        ],
        example: (ctx) =>
          ph`${N(ctx, "tower")}, ${C(ctx, "tower")}, ${approachPhrase(ctx.runway)}, 6 mile final.`,
        hint: (ctx) =>
          `Tune ${fac(ctx, "tower").name}: facility, full callsign, approach, position.`,
      },
    ];
    if (advancedMode(d))
      steps.push({
        id: "continue",
        title: '"Continue"',
        facility: "tower",
        kind: "acknowledge",
        prompt: (ctx) =>
          ph`${C(ctx, "tower")}, ${N(ctx, "tower")}, continue, traffic departing runway ${rwy(ctx.runway.id)}.`,
        expects: () => [
          {
            kind: "phrase",
            label: "Continue",
            any: ["continue", "continuing"],
            category: ["phraseology", "readback"],
            severity: "major",
            tip: `Acknowledge "continue" — you're not cleared to land yet.`,
            say: "continue",
          },
        ],
        example: (ctx) => ph`Continue, ${C(ctx, "tower")}.`,
        hint: () => "Acknowledge — not cleared to land yet.",
      });
    steps.push({
      id: "landing-clearance",
      title: "Landing clearance",
      facility: "tower",
      kind: "readback",
      prompt: (ctx) =>
        ph`${C(ctx, "tower")}${ctx.abbrevBy.tower ? "" : ph`, ${N(ctx, "tower")}`}, ${wind(ctx.atis.windDirMag, ctx.atis.windKt)}, runway ${rwy(ctx.runway.id)}, cleared to land.`,
      expects: (ctx) => [
        runwayRB(ctx.runway.id),
        {
          kind: "phrase",
          label: "Cleared to land",
          any: ["cleared to land", "clear to land"],
          category: ["phraseology", "readback"],
          severity: "critical",
          tip: `Read back "runway ${ctx.runway.id}, cleared to land".`,
          say: `runway ${ctx.runway.id}, cleared to land`,
        },
      ],
      example: (ctx) => ph`Runway ${rwy(ctx.runway.id)}, cleared to land, ${C(ctx, "tower")}.`,
      hint: () => 'Runway, "cleared to land", callsign.',
    });
    return steps;
  },
};

// ---------- 14. frequency change request ----------

const freqChangeRequest: ScenarioDef = {
  id: "freq-change-request",
  title: "Request a frequency change (Flight Service)",
  phase: "enroute",
  rules: "IFR",
  summary:
    "Ask Center to leave the frequency, get destination weather from Flight Service, then report back on Center's frequency.",
  stations: ["Center", "Flight Service"],
  firstSpeaker: "pilot",
  refs: [
    "AIM 5-3-1 ARTCC communications",
    "AIM 7-1 In-flight weather services (Flight Service)",
    "JO 7110.65 §2-1-17",
  ],
  init: (ctx) => ({
    ...ctx,
    rules: "IFR",
    altitude: ctx.ifrCruise,
    heading: r10(ctx.destination.bearing),
    position: `${ctx.positionMiles} miles ${ctx.positionDir} of ${ctx.airportName}`,
    abbrevBy: { center: true },
  }),
  radio: (ctx, d) => ({ active: fac(ctx, "center").mhz, standby: stby(ctx, d, "fss") }),
  briefing: (ctx) => ({
    situation: `IFR at ${alt(ctx.ifrCruise).text} ft with ${fac(ctx, "center").name}, ${ctx.position}, en route to ${ctx.destination.name}.`,
    goal: `Leave Center's frequency briefly to get ${ctx.destination.name} weather from ${fac(ctx, "fss").name} (${freq(fac(ctx, "fss").mhz).text}), then return.`,
    say: [
      'Ask first: "request frequency change for 5 minutes to get weather".',
      'Flight Service is called "<name> Radio".',
      'On return: "<facility>, <callsign>, back on frequency".',
    ],
    why: [
      "On an IFR flight you must not leave the frequency without approval.",
      "Center needs to know you're back so they can reach you.",
    ],
  }),
  steps: (_ctx, d) => {
    const steps: Step[] = [
      {
        id: "request-leave",
        title: "Request to leave frequency",
        facility: "center",
        kind: "request",
        expects: () => [
          {
            kind: "phrase",
            label: "Frequency change request",
            any: [
              "frequency change",
              "leave the frequency",
              "leave frequency",
              "leave your frequency",
              "change frequency",
              "freq change",
              "off frequency",
            ],
            category: "phraseology",
            severity: "major",
            tip: `Ask for it explicitly: "request frequency change for 5 minutes".`,
            say: "request frequency change",
          },
          {
            kind: "phrase",
            label: "Reason",
            any: ["weather", "flight service", "fss", "radio", "pirep", "briefing", "metar"],
            category: "awareness",
            severity: "minor",
            tip: `Say why ("to get weather from Flight Service").`,
          },
          {
            kind: "phrase",
            label: "Duration",
            any: ["minutes", "minute"],
            category: "awareness",
            severity: "minor",
            tip: `Say how long you'll be off frequency ("for 5 minutes").`,
          },
        ],
        example: (ctx) =>
          ph`${N(ctx, "center")}, ${C(ctx, "center")}, request frequency change for 5 minutes to get weather from Flight Service.`,
        hint: () => 'Callsign, "request frequency change for 5 minutes", reason.',
      },
      {
        id: "approved",
        title: "Frequency change approved",
        facility: "center",
        kind: "acknowledge",
        prompt: (ctx) =>
          ph`${C(ctx, "center")}, frequency change approved, report back on this frequency.`,
        expects: () => [
          {
            kind: "phrase",
            label: "Acknowledge",
            any: ["wilco", "will report back", "report back", "frequency change approved"],
            category: ["readback", "phraseology"],
            severity: "major",
            tip: `Acknowledge with "wilco" or "frequency change approved, will report back".`,
            say: "wilco",
          },
        ],
        example: (ctx) => ph`Frequency change approved, will report back, ${C(ctx, "center")}.`,
        hint: () => "Acknowledge you'll report back.",
      },
      {
        id: "fss-call",
        title: "Call Flight Service",
        facility: "fss",
        kind: "initial",
        expects: (ctx) => [
          station(ctx, "fss"),
          {
            kind: "phrase",
            label: "Position",
            any: positionAny(ctx),
            category: "awareness",
            severity: "minor",
            tip: `Give your position so FSS can pick the best outlet ("${ctx.position}").`,
          },
          {
            kind: "phrase",
            label: "Request",
            any: ["weather", "metar", "forecast", "conditions", "report", "taf"],
            category: "phraseology",
            severity: "major",
            tip: `State what you want ("request ${ctx.destination.name} weather").`,
            say: `request ${ctx.destination.name} weather`,
          },
        ],
        example: (ctx) =>
          ph`${N(ctx, "fss")}, ${C(ctx, "fss")}, ${ctx.position}, request current weather for ${ctx.destination.name}.`,
        hint: (ctx) =>
          `Tune ${freq(fac(ctx, "fss").mhz).text}: "${fac(ctx, "fss").name}", full callsign, position, request.`,
      },
      {
        id: "fss-weather",
        title: "Acknowledge the weather",
        facility: "fss",
        kind: "acknowledge",
        prompt: (ctx) =>
          ph`${C(ctx, "fss")}, ${N(ctx, "fss")}, ${ctx.destination.name} weather at ${ctx.atis.zuluTime} Zulu: ${wind(ctx.atis.windDirMag, ctx.atis.windKt + 3)}, visibility 6, ceiling ${alt(1800)} broken, temperature ${ctx.atis.tempC - 2}, dew point ${ctx.atis.dewC - 2}, altimeter ${altimeter(ctx.atis.altimeter - 0.02)}.`,
        expects: () => [
          {
            kind: "phrase",
            label: "Acknowledgement",
            any: ["roger", "thank", "thanks", "got it", "received"],
            category: "phraseology",
            severity: "minor",
            tip: `Acknowledge ("roger, thank you") with your callsign.`,
          },
        ],
        example: (ctx) => ph`Roger, thank you, ${C(ctx, "fss")}.`,
        hint: () => "Acknowledge the weather — then go back to Center.",
      },
      {
        id: "back-on",
        title: "Report back on frequency",
        facility: "center",
        kind: "report",
        situation: (ctx) =>
          `Done with Flight Service. Return to ${fac(ctx, "center").name} (${freq(fac(ctx, "center").mhz).text}).`,
        expects: (ctx) => [
          station(ctx, "center"),
          {
            kind: "phrase",
            label: "Back on frequency",
            any: ["back on", "back with", "returning to frequency", "back"],
            category: "phraseology",
            severity: "major",
            tip: `Tell the controller you've returned: "back on frequency".`,
            say: "back on frequency",
          },
        ],
        example: (ctx) => ph`${N(ctx, "center")}, ${C(ctx, "center")}, back on frequency.`,
        hint: () => 'Retune Center and report "back on frequency".',
        closing: (ctx) => (advancedMode(d) ? null : ph`${C(ctx, "center")}, roger.`),
      },
    ];
    if (advancedMode(d))
      steps.push({
        id: "descent",
        title: "Unexpected descent",
        facility: "center",
        kind: "readback",
        prompt: (ctx) =>
          ph`${C(ctx, "center")}, roger. Descend and maintain ${alt(ctx.ifrCruise - 2000)}, ${ctx.destination.name} altimeter ${altimeter(ctx.atis.altimeter - 0.02)}.`,
        expects: (ctx) => [
          {
            kind: "altitude",
            ft: ctx.ifrCruise - 2000,
            readback: true,
            say: `descend and maintain ${alt(ctx.ifrCruise - 2000).text}`,
          },
          {
            kind: "altimeter",
            inHg: Math.round((ctx.atis.altimeter - 0.02) * 100) / 100,
            severity: "minor",
          },
        ],
        example: (ctx) =>
          ph`Descend and maintain ${alt(ctx.ifrCruise - 2000)}, ${altimeter(ctx.atis.altimeter - 0.02)}, ${C(ctx, "center")}.`,
        hint: () => "Read back the altitude and altimeter.",
      });
    return steps;
  },
};

// ---------- 15. emergency ----------

const emergency: ScenarioDef = {
  id: "emergency",
  title: "Declare an emergency",
  phase: "emergency",
  rules: "VFR",
  summary:
    "Declare a distress (MAYDAY) or urgency (PAN-PAN) situation with nature, position, altitude, intentions, souls on board and fuel — then squawk 7700 and follow vectors.",
  stations: ["Approach", "Tower"],
  firstSpeaker: "pilot",
  refs: [
    "AIM 6-3-1 Distress and urgency communications",
    "AIM 6-2-2 Transponder emergency operation (7700)",
    "14 CFR 91.3(b)",
  ],
  init: (ctx) => {
    const toApt = r10(dirDeg(ctx.positionDir) + 180);
    return {
      ...ctx,
      altitude: ctx.vfrCruise,
      heading: r10(toApt + 50),
      abbrevBy: { approach: true },
    };
  },
  radio: (ctx) => ({ active: fac(ctx, "approach").mhz, standby: fac(ctx, "tower").mhz }),
  briefing: (ctx) => {
    const distress = ctx.emergency.kind === "distress";
    return {
      situation: `VFR with flight following on ${fac(ctx, "approach").name}, ${alt(ctx.vfrCruise).text} ft, ${ctx.position}. Problem: ${ctx.emergency.nature}. ${ctx.emergency.souls} soul${ctx.emergency.souls > 1 ? "s" : ""} on board, ${fuelText(ctx.emergency.fuelMinutes)} of fuel.`,
      goal: `${distress ? "Declare a distress emergency (MAYDAY)" : "Declare an urgency situation (PAN-PAN)"} and get help to ${ctx.airport.icao}.`,
      say: [
        distress
          ? '"MAYDAY, MAYDAY, MAYDAY" — then facility, callsign.'
          : '"PAN-PAN, PAN-PAN, PAN-PAN" — then facility, callsign.',
        "Nature of the problem, position, altitude, intentions, souls on board, fuel remaining (hours/minutes).",
        "Squawk 7700 when told (or on your own if not in contact).",
      ],
      why: [
        "Aviate, navigate, communicate: fly the airplane first, then talk.",
        "Declaring early gets you priority handling — the PIC may deviate from any rule to meet the emergency (14 CFR 91.3(b)).",
      ],
    };
  },
  steps: () => {
    const word = (ctx: ScenarioContext) =>
      ctx.emergency.kind === "distress" ? "Mayday" : "Pan-Pan";
    const toApt = (ctx: ScenarioContext) => r10(dirDeg(ctx.positionDir) + 180);
    const soulsE = (ctx: ScenarioContext): Expect => ({
      kind: "number",
      label: "Souls on board",
      value: ctx.emergency.souls,
      near: ["souls", "soul", "people", "persons", "aboard", "board", "pob"],
      category: "awareness",
      severity: "major",
      tip: `State souls on board ("${ctx.emergency.souls} souls on board") — rescuers need it.`,
    });
    const fuelE = (): Expect => ({
      kind: "phrase",
      label: "Fuel remaining",
      any: ["fuel"],
      category: "awareness",
      severity: "major",
      tip: `State fuel remaining in time ("1 hour 30 minutes of fuel").`,
    });
    return [
      {
        id: "declare",
        title: "Declare the emergency",
        facility: "approach",
        kind: "initial",
        situation: (ctx) =>
          `${ctx.emergency.nature.charAt(0).toUpperCase()}${ctx.emergency.nature.slice(1)}! You've started the checklist. Now communicate.`,
        expects: (ctx) => {
          const distress = ctx.emergency.kind === "distress";
          return [
            {
              kind: "phrase",
              label: distress ? "MAYDAY" : "PAN-PAN",
              any: distress ? ["mayday"] : ["pan pan", "pan"],
              repeat: distress ? { phrase: "mayday", times: 3 } : { phrase: "pan pan", times: 3 },
              category: "phraseology",
              severity: "critical",
              tip: distress
                ? `Begin with "MAYDAY, MAYDAY, MAYDAY" — it gets you immediate priority (AIM 6-3-1).`
                : `Begin with "PAN-PAN, PAN-PAN, PAN-PAN" to declare an urgency condition (AIM 6-3-1).`,
              say: distress ? "Mayday, Mayday, Mayday" : "Pan-Pan, Pan-Pan, Pan-Pan",
            },
            station(ctx, "approach"),
            {
              kind: "phrase",
              label: "Nature of emergency",
              any: [
                "engine",
                "failure",
                "failed",
                "smoke",
                "fire",
                "rough",
                "oil",
                "power",
                "quit",
              ],
              category: "awareness",
              severity: "major",
              tip: `Say what's wrong ("${ctx.emergency.nature}").`,
              say: ctx.emergency.nature,
            },
            {
              kind: "phrase",
              label: "Position",
              any: positionAny(ctx),
              category: "awareness",
              severity: "major",
              tip: `Give your position ("${ctx.position}").`,
              say: ctx.position,
            },
            {
              kind: "altitude",
              ft: ctx.altitude,
              readback: false,
              label: "Altitude",
              tolerance: 300,
            },
            {
              kind: "phrase",
              label: "Intentions",
              any: [
                "landing",
                "land",
                "divert",
                "diverting",
                "returning",
                "return",
                "request",
                "vectors",
                "nearest",
                "forced landing",
              ],
              category: "awareness",
              severity: "minor",
              tip: `State your intentions ("request vectors to ${ctx.airportName}").`,
            },
            soulsE(ctx),
            fuelE(),
          ];
        },
        example: (ctx) =>
          ph`${word(ctx)}, ${word(ctx)}, ${word(ctx)}, ${N(ctx, "approach")}, ${C(ctx, "approach")}, ${ctx.emergency.nature}, ${ctx.position}, ${alt(ctx.altitude)}, request vectors to ${ctx.airportName}, ${ctx.emergency.souls} soul${ctx.emergency.souls > 1 ? "s" : ""} on board, ${fuelText(ctx.emergency.fuelMinutes)} of fuel remaining.`,
        hint: (ctx) =>
          `${ctx.emergency.kind === "distress" ? "MAYDAY ×3" : "PAN-PAN ×3"}, facility, callsign, problem, position, altitude, intentions, souls, fuel.`,
        retryPrompt: (ctx, failed) =>
          failed.some((f) => f.label === "MAYDAY" || f.label === "PAN-PAN")
            ? ph`${C(ctx, "approach")}, ${N(ctx, "approach")}, say again — are you declaring an emergency?`
            : null,
        apply: (ctx, ev) => ({
          ...ctx,
          reported: {
            ...ctx.reported,
            souls: ev.items.some((i) => i.label === "Souls on board" && i.ok),
            fuel: ev.items.some((i) => i.label === "Fuel remaining" && i.ok),
          },
          altitude: ctx.altitude - 300,
        }),
      },
      {
        id: "squawk-vector",
        title: "Squawk 7700 and vector",
        facility: "approach",
        kind: "readback",
        prompt: (ctx) => {
          const ask = !ctx.reported["souls"] || !ctx.reported["fuel"];
          return ph`${C(ctx, "approach")}, roger ${word(ctx)}. Squawk 7700. ${ctx.airportName} is ${clock(clockOf(ctx.heading, toApt(ctx)))}, ${miles(ctx.positionMiles)}. Turn ${turnSide(ctx.heading, toApt(ctx))} heading ${hdg(toApt(ctx))}.${ask ? " Say souls on board and fuel remaining." : ""}`;
        },
        expects: (ctx) => {
          const e: Expect[] = [
            { kind: "squawk", code: "7700" },
            {
              kind: "heading",
              deg: toApt(ctx),
              turn: turnSide(ctx.heading, toApt(ctx)),
              readback: true,
            },
          ];
          if (!ctx.reported["souls"]) e.push(soulsE(ctx));
          if (!ctx.reported["fuel"]) e.push(fuelE());
          return e;
        },
        example: (ctx) => {
          const ask = !ctx.reported["souls"] || !ctx.reported["fuel"];
          return ph`Squawk 7700, ${turnSide(ctx.heading, toApt(ctx))} heading ${hdg(toApt(ctx))}, ${C(ctx, "approach")}${ask ? `, ${ctx.emergency.souls} soul${ctx.emergency.souls > 1 ? "s" : ""} on board, ${fuelText(ctx.emergency.fuelMinutes)} of fuel` : ""}.`;
        },
        hint: () => "Read back the code and heading; answer any question asked.",
        apply: (ctx) => ({ ...ctx, heading: toApt(ctx), squawk: "7700" }),
      },
      {
        id: "handoff-tower",
        title: "Handoff to Tower",
        facility: "approach",
        kind: "readback",
        situation: (ctx) => `Approaching ${ctx.airportName}, field in sight.`,
        prompt: (ctx) =>
          ph`${C(ctx, "approach")}, ${ctx.airportName} airport 12 o'clock, 5 miles. Runway ${rwy(ctx.runway.id)}, ${wind(ctx.atis.windDirMag, ctx.atis.windKt)}. Contact ${N(ctx, "tower")} ${FQ(ctx, "tower")}, they're expecting you.`,
        expects: (ctx) => [
          { kind: "frequency", mhz: fac(ctx, "tower").mhz, readback: true },
          { kind: "runway", runway: ctx.runway.id, readback: true, severity: "minor" },
        ],
        example: (ctx) =>
          ph`Runway ${rwy(ctx.runway.id)}, ${N(ctx, "tower")} ${FQ(ctx, "tower")}, ${C(ctx, "approach")}.`,
        hint: () => "Read back the runway and Tower frequency.",
        apply: (ctx) => ({
          ...ctx,
          position: `5 miles ${ctx.positionDir} of ${ctx.airportName}`,
          positionMiles: 5,
        }),
      },
      {
        id: "tower-emergency",
        title: "Check in with Tower",
        facility: "tower",
        kind: "initial",
        expects: (ctx) => [
          station(ctx, "tower"),
          {
            kind: "phrase",
            label: "Emergency status",
            any: ["mayday", "pan pan", "emergency", "engine", "smoke", "oil", "rough"],
            category: "awareness",
            severity: "minor",
            tip: `Remind Tower of your emergency status.`,
          },
          {
            kind: "phrase",
            label: "Position",
            any: ["5 miles", "5 mile", ctx.positionDir, "final", "downwind", "base"],
            category: "awareness",
            severity: "major",
            tip: `Give your position ("5 miles ${ctx.positionDir}").`,
          },
          runwayRep(ctx.runway.id),
        ],
        example: (ctx) =>
          ph`${N(ctx, "tower")}, ${C(ctx, "tower")}, ${word(ctx)}, ${ctx.emergency.nature}, 5 miles ${ctx.positionDir}, landing runway ${rwy(ctx.runway.id)}.`,
        hint: (ctx) =>
          `Tune ${fac(ctx, "tower").name}: facility, full callsign, emergency, position, runway.`,
      },
      {
        id: "emergency-land",
        title: "Landing clearance",
        facility: "tower",
        kind: "readback",
        prompt: (ctx) =>
          ph`${C(ctx, "tower")}, ${N(ctx, "tower")}, runway ${rwy(ctx.runway.id)}, cleared to land. Emergency equipment is standing by.`,
        expects: (ctx) => [
          runwayRB(ctx.runway.id),
          {
            kind: "phrase",
            label: "Cleared to land",
            any: ["cleared to land", "clear to land"],
            category: ["phraseology", "readback"],
            severity: "critical",
            tip: `Read back "runway ${ctx.runway.id}, cleared to land".`,
            say: `runway ${ctx.runway.id}, cleared to land`,
          },
        ],
        example: (ctx) => ph`Runway ${rwy(ctx.runway.id)}, cleared to land, ${C(ctx, "tower")}.`,
        hint: () => 'Runway, "cleared to land", callsign — then fly the airplane.',
      },
    ];
  },
};

export const SCENARIOS: ScenarioDef[] = [
  taxi,
  takeoff,
  departure,
  flightFollowing,
  freqChange,
  trafficAdvisory,
  classDEntry,
  landing,
  goAround,
  ifrClearanceRequest,
  ifrDepartureClearance,
  instrumentApproach,
  establishedFinal,
  freqChangeRequest,
  emergency,
];

export const SCENARIO_IDS = SCENARIOS.map((s) => s.id);

export function getScenario(id: string): ScenarioDef | undefined {
  return SCENARIOS.find((s) => s.id === id);
}

export function isScenarioId(id: unknown): id is ScenarioId {
  return typeof id === "string" && SCENARIOS.some((s) => s.id === id);
}

/** Facility-name helper exported for UIs (e.g. "Palo Alto Ground"). */
export function facilityLabel(ctx: ScenarioContext, k: FacilityKey) {
  return fac(ctx, k);
}

export { FULL as fullCallsignPhrase };
