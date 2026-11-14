/**
 * Scenario context builder: picks the runway in use from a scenario wind, builds the ATIS,
 * resolves facility names/frequencies from the airport dataset (with clearly-flagged
 * simulated stand-ins where the dataset has none), and seeds the aircraft/callsign.
 */
import {
  AIRPORTS,
  allRunwayEnds,
  bestRunwayForWind,
  freqOf,
  getAirport,
  magneticHeading,
} from "@/lib/data/airports";
import { AIRCRAFT_PERF } from "@/lib/data/aircraft-perf";
import type { Airport, RunwayEnd } from "@/lib/data/types";
import { bearingDeg, distanceNm, norm180, norm360 } from "@/lib/geo";
import {
  alt,
  altimeter,
  digits,
  hdg,
  letter,
  makeCallsign,
  ph,
  plain,
  rwy,
  usRunway,
  wind,
} from "./phrase";
import type {
  AircraftInfo,
  AtisInfo,
  Facility,
  FacilityKey,
  Phrase,
  RunwayInfo,
  ScenarioContext,
  Station,
} from "./types";

// ---------- RNG ----------

export type Rng = () => number;

export function makeRng(seed: number): Rng {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const pick = <T>(rng: Rng, arr: readonly T[]): T =>
  arr[Math.floor(rng() * arr.length) % arr.length] as T;
export const between = (rng: Rng, lo: number, hi: number) => Math.round(lo + rng() * (hi - lo));

// ---------- aircraft ----------

const AIRCRAFT_ATC: Record<string, Omit<AircraftInfo, "id" | "shortName">> = {
  c152: {
    typeWord: "Cessna",
    spokenType: "Cessna 152",
    icaoType: "C152",
    equip: "U",
    typeKeywords: ["cessna", "152", "c152"],
  },
  c172: {
    typeWord: "Skyhawk",
    spokenType: "Cessna 172",
    icaoType: "C172",
    equip: "G",
    typeKeywords: ["cessna", "172", "skyhawk", "c172"],
  },
  pa28: {
    typeWord: "Cherokee",
    spokenType: "Piper Archer",
    icaoType: "P28A",
    equip: "G",
    typeKeywords: ["piper", "archer", "cherokee", "pa28", "p28a"],
  },
  da40: {
    typeWord: "Diamond Star",
    spokenType: "Diamond 40",
    icaoType: "DA40",
    equip: "G",
    typeKeywords: ["diamond", "da40", "40", "star"],
  },
  be36: {
    typeWord: "Bonanza",
    spokenType: "Bonanza",
    icaoType: "BE36",
    equip: "G",
    typeKeywords: ["bonanza", "be36", "beech"],
  },
  sr20: {
    typeWord: "Cirrus",
    spokenType: "Cirrus SR20",
    icaoType: "SR20",
    equip: "G",
    typeKeywords: ["cirrus", "sr20", "20"],
  },
  sr22: {
    typeWord: "Cirrus",
    spokenType: "Cirrus SR22",
    icaoType: "SR22",
    equip: "G",
    typeKeywords: ["cirrus", "sr22", "22"],
  },
  pa34: {
    typeWord: "Seneca",
    spokenType: "Piper Seneca",
    icaoType: "PA34",
    equip: "G",
    typeKeywords: ["seneca", "piper", "pa34"],
  },
  be58: {
    typeWord: "Baron",
    spokenType: "Beech Baron",
    icaoType: "BE58",
    equip: "G",
    typeKeywords: ["baron", "be58", "beech"],
  },
  be350: {
    typeWord: "King Air",
    spokenType: "King Air 350",
    icaoType: "B350",
    equip: "G",
    typeKeywords: ["king", "air", "b350", "350"],
  },
  b738: {
    typeWord: "Boeing",
    spokenType: "Boeing 737",
    icaoType: "B738",
    equip: "L",
    typeKeywords: ["boeing", "737", "b738"],
  },
  a320: {
    typeWord: "Airbus",
    spokenType: "Airbus A320",
    icaoType: "A320",
    equip: "L",
    typeKeywords: ["airbus", "320", "a320"],
  },
};

export function aircraftInfo(id: string): AircraftInfo {
  const perf =
    AIRCRAFT_PERF.find((a) => a.id === id) ??
    AIRCRAFT_PERF.find((a) => a.id === "c172") ??
    AIRCRAFT_PERF[0];
  const meta = AIRCRAFT_ATC[perf?.id ?? "c172"] ?? AIRCRAFT_ATC["c172"];
  return {
    id: perf?.id ?? "c172",
    shortName: perf?.shortName ?? "C172S",
    typeWord: meta?.typeWord ?? "Skyhawk",
    spokenType: meta?.spokenType ?? "Cessna 172",
    icaoType: meta?.icaoType ?? "C172",
    equip: meta?.equip ?? "G",
    typeKeywords: meta?.typeKeywords ?? ["cessna"],
  };
}

/** Aircraft offered in the ATC trainers (all dataset aircraft). */
export function atcAircraftOptions() {
  return AIRCRAFT_PERF.map((a) => ({
    id: a.id,
    label: `${a.shortName} — ${aircraftInfo(a.id).spokenType}`,
  }));
}

// ---------- airports & facilities ----------

export function toweredAirports(): Airport[] {
  return AIRPORTS.filter((a) => a.towered);
}

function isAcronym(s: string) {
  return /^[A-Z']{2,4}$/.test(s);
}

export function airportSpokenName(a: Airport): string {
  const named = a.frequencies.find(
    (f) => (f.type === "TWR" || f.type === "GND") && /\s(Tower|Ground)$/.test(f.name),
  );
  if (named) {
    const base = named.name.replace(/\s(Tower|Ground)$/, "");
    if (!isAcronym(base)) return base;
  }
  return a.city;
}

function facilityName(a: Airport, type: "GND" | "TWR" | "CLNC", suffix: string): string {
  const f = freqOf(a, type);
  if (f && /\s/.test(f.name) && !isAcronym(f.name.split(" ")[0] ?? "")) return f.name;
  return `${airportSpokenName(a)} ${suffix}`;
}

function nearestWith(a: Airport, type: "APP" | "DEP") {
  const own = freqOf(a, type);
  if (own) return { f: own, borrowed: false };
  let best: { f: NonNullable<ReturnType<typeof freqOf>>; d: number } | null = null;
  for (const o of AIRPORTS) {
    if (o.icao === a.icao) continue;
    const f = freqOf(o, type);
    if (!f) continue;
    const d = distanceNm(a.lat, a.lon, o.lat, o.lon);
    if (!best || d < best.d) best = { f, d };
  }
  return best && best.d < 120 ? { f: best.f, borrowed: true } : null;
}

const CENTERS: { test: (a: Airport) => boolean; name: string; mhz: number }[] = [
  { test: (a) => a.region === "CA" && a.lat >= 35.5, name: "Oakland Center", mhz: 132.2 },
  { test: (a) => a.region === "CA", name: "Los Angeles Center", mhz: 135.5 },
  { test: (a) => a.region === "WA", name: "Seattle Center", mhz: 125.1 },
  { test: (a) => a.region === "NY", name: "New York Center", mhz: 125.325 },
  { test: (a) => a.region === "MA", name: "Boston Center", mhz: 124.85 },
  { test: (a) => a.region === "IL", name: "Chicago Center", mhz: 120.35 },
  { test: (a) => a.region === "CO", name: "Denver Center", mhz: 128.6 },
  { test: (a) => a.region === "GA", name: "Atlanta Center", mhz: 127.1 },
  { test: (a) => a.region === "AZ", name: "Albuquerque Center", mhz: 126.45 },
  { test: (a) => a.region === "FL", name: "Jacksonville Center", mhz: 134.0 },
];

export function buildFacilities(a: Airport): Partial<Record<FacilityKey, Facility>> {
  const out: Partial<Record<FacilityKey, Facility>> = {};
  const gnd = freqOf(a, "GND");
  const twr = freqOf(a, "TWR");
  const clnc = freqOf(a, "CLNC");
  const ctaf = freqOf(a, "CTAF");
  if (gnd)
    out.ground = {
      key: "ground",
      station: "Ground",
      name: facilityName(a, "GND", "Ground"),
      mhz: gnd.mhz,
      simulated: false,
    };
  if (twr)
    out.tower = {
      key: "tower",
      station: "Tower",
      name: facilityName(a, "TWR", "Tower"),
      mhz: twr.mhz,
      simulated: false,
    };
  if (clnc)
    out.clearance = {
      key: "clearance",
      station: "Clearance Delivery",
      name: facilityName(a, "CLNC", "Clearance"),
      mhz: clnc.mhz,
      simulated: false,
    };
  else if (out.ground)
    out.clearance = {
      ...out.ground,
      key: "clearance",
      note: "No clearance delivery frequency at this airport — IFR clearances come from Ground.",
    };
  if (ctaf)
    out.ctaf = {
      key: "ctaf",
      station: "CTAF",
      name: ctaf.name.includes("Traffic") ? ctaf.name : `${airportSpokenName(a)} Traffic`,
      mhz: ctaf.mhz,
      simulated: false,
    };

  const app = nearestWith(a, "APP");
  if (app) {
    const name = /\s/.test(app.f.name) ? app.f.name : "Approach";
    out.approach = {
      key: "approach",
      station: "Approach",
      name,
      mhz: app.f.mhz,
      simulated: false,
      ...(app.borrowed ? { note: "Serving approach control for the area." } : {}),
    };
  }
  const dep = freqOf(a, "DEP");
  if (dep)
    out.departure = {
      key: "departure",
      station: "Departure",
      name: /\s/.test(dep.name) ? dep.name : "Departure",
      mhz: dep.mhz,
      simulated: false,
    };
  else if (out.approach)
    out.departure = {
      ...out.approach,
      key: "departure",
      station: "Departure",
      name: out.approach.name.replace(/Approach$/, "Departure"),
    };

  const c = CENTERS.find((x) => x.test(a)) ?? { name: "Center", mhz: 132.45 };
  out.center = {
    key: "center",
    station: "Center",
    name: c.name,
    mhz: c.mhz,
    simulated: true,
    note: "Simulated training frequency.",
  };
  out.fss = {
    key: "fss",
    station: "Flight Service",
    name: c.name.replace(/Center$/, "Radio"),
    mhz: 122.2,
    simulated: true,
    note: "122.2 is a common FSS frequency; simulated here.",
  };
  return out;
}

export function facilityOf(ctx: ScenarioContext, key: FacilityKey): Facility {
  const f = ctx.facilities[key];
  if (f) return f;
  // Last-resort fallback so a scenario never breaks on sparse data.
  const station: Record<FacilityKey, Station> = {
    clearance: "Clearance Delivery",
    ground: "Ground",
    tower: "Tower",
    departure: "Departure",
    approach: "Approach",
    center: "Center",
    fss: "Flight Service",
    ctaf: "CTAF",
  };
  return {
    key,
    station: station[key],
    name: `${ctx.airportName} ${station[key]}`,
    mhz: 122.9,
    simulated: true,
  };
}

/** All facilities as a directory for the radio "frequency list". */
export function facilityDirectory(
  ctx: ScenarioContext,
): { mhz: number; name: string; station: string; simulated: boolean }[] {
  const seen = new Set<string>();
  const out: { mhz: number; name: string; station: string; simulated: boolean }[] = [];
  if (ctx.atisFreq)
    out.push({
      mhz: ctx.atisFreq,
      name: `${ctx.airportName} ATIS`,
      station: "ATIS",
      simulated: false,
    });
  const order: FacilityKey[] = [
    "clearance",
    "ground",
    "tower",
    "departure",
    "approach",
    "center",
    "fss",
    "ctaf",
  ];
  for (const k of order) {
    const f = ctx.facilities[k];
    if (!f) continue;
    const key = `${f.name}|${f.mhz}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ mhz: f.mhz, name: f.name, station: f.station, simulated: f.simulated });
  }
  return out;
}

// ---------- runway / ATIS ----------

function runwayInfo(a: Airport, end: RunwayEnd): RunwayInfo {
  return {
    id: usRunway(end.id),
    dataId: end.id,
    magHeading: Math.round(magneticHeading(a, end.trueHeading)),
    pattern: end.pattern,
    ils: end.ils ? { freq: end.ils.freq, ident: end.ils.ident } : null,
  };
}

const COMPASS = [
  "north",
  "northeast",
  "east",
  "southeast",
  "south",
  "southwest",
  "west",
  "northwest",
] as const;
export function compassWord(deg: number): string {
  return COMPASS[Math.round(norm360(deg) / 45) % 8] ?? "north";
}

export function approachPhrase(r: RunwayInfo): Phrase {
  return r.ils
    ? { text: `ILS runway ${r.id}`, spoken: `I L S runway ${rwy(r.id).spoken}` }
    : { text: `RNAV (GPS) runway ${r.id}`, spoken: `R-NAV runway ${rwy(r.id).spoken}` };
}

function buildAtis(
  name: string,
  rng: Rng,
  runway: RunwayInfo,
  windTrue: number,
  windKt: number,
  magVar: number,
  ifrWx: boolean,
): AtisInfo {
  const letterCode = String.fromCharCode(65 + between(rng, 0, 9));
  const now = new Date();
  const zuluTime = `${String(now.getUTCHours()).padStart(2, "0")}55`;
  const windDirMag = Math.round(norm360(windTrue - magVar) / 10) * 10 || 360;
  const tempC = between(rng, 9, 26);
  const dewC = tempC - between(rng, 2, 11);
  const altSetting = Math.round((29.82 + rng() * 0.36) * 100) / 100;
  const visibilitySm = ifrWx ? pick(rng, [2, 3, 4]) : 10;
  const sky = ifrWx
    ? pick(rng, [
        "Ceiling 800 overcast",
        "Ceiling 1,100 broken, 2,500 overcast",
        "Ceiling 900 overcast",
      ])
    : pick(rng, [
        "Sky clear",
        "Few clouds at 4,500",
        "Scattered clouds at 3,500",
        "Few clouds at 6,000",
      ]);
  const approachInUse = ifrWx
    ? ph`${approachPhrase(runway)} approach in use.`
    : runway.ils
      ? plain("Visual approaches in use.")
      : null;
  const phrase = ph`${name} airport information ${letter(letterCode)}, ${digits(zuluTime)} Zulu. ${wind(windDirMag, windKt)}. Visibility ${visibilitySm}${ifrWx ? " mist" : ""}. ${sky}. Temperature ${tempC}, dew point ${dewC}. Altimeter ${altimeter(altSetting)}. ${approachInUse} Landing and departing runway ${rwy(runway.id)}. Advise on initial contact you have information ${letter(letterCode)}.`;
  return {
    letter: letterCode,
    zuluTime,
    windDirMag,
    windKt,
    visibilitySm,
    sky,
    tempC,
    dewC,
    altimeter: altSetting,
    phrase,
  };
}

export function randomSquawk(rng: Rng): string {
  for (;;) {
    const s = `${between(rng, 2, 6)}${between(rng, 0, 7)}${between(rng, 0, 7)}${between(rng, 1, 7)}`;
    if (!["1200", "7500", "7600", "7700"].includes(s)) return s;
  }
}

export function pickDestination(a: Airport, prefer?: string) {
  const pref = prefer ? getAirport(prefer) : undefined;
  const target =
    pref && pref.icao !== a.icao
      ? pref
      : (() => {
          const others = AIRPORTS.filter((o) => o.icao !== a.icao)
            .map((o) => ({ o, d: distanceNm(a.lat, a.lon, o.lat, o.lon) }))
            .sort((x, y) => x.d - y.d);
          return (others.find((x) => x.d >= 25 && x.d <= 180) ?? others[0])?.o ?? a;
        })();
  const d = distanceNm(a.lat, a.lon, target.lat, target.lon);
  const brgTrue = bearingDeg(a.lat, a.lon, target.lat, target.lon);
  return {
    icao: target.icao,
    name: airportSpokenName(target),
    bearing: Math.round(norm360(brgTrue - a.magVar)),
    distanceNm: Math.round(d),
  };
}

function cruiseAltitudes(elev: number, courseMag: number) {
  const east = courseMag >= 0 && courseMag < 180;
  const floorVfr = Math.max(3500, elev + 2500);
  const vfr =
    (east ? [3500, 5500, 7500, 9500, 11500] : [4500, 6500, 8500, 10500, 12500]).find(
      (x) => x >= floorVfr,
    ) ?? 9500;
  const floorIfr = Math.max(5000, elev + 3000);
  const ifr =
    (east ? [5000, 7000, 9000, 11000, 13000] : [4000, 6000, 8000, 10000, 12000]).find(
      (x) => x >= floorIfr,
    ) ?? 9000;
  const initial = Math.min(ifr - 1000, Math.max(3000, Math.ceil((elev + 2000) / 1000) * 1000));
  return { vfr, ifr, initial };
}

export interface BuildContextOptions {
  airportIcao: string;
  aircraftId: string;
  callsign: string;
  rules: "VFR" | "IFR";
  seed?: number;
  destinationIcao?: string;
  preferIls?: boolean;
  ifrWeather?: boolean;
}

export function buildContext(o: BuildContextOptions): ScenarioContext {
  const rng = makeRng(o.seed ?? Date.now());
  const airport = getAirport(o.airportIcao) ?? toweredAirports()[0] ?? (AIRPORTS[0] as Airport);
  const ends = allRunwayEnds(airport);
  let windTrue = between(rng, 0, 35) * 10;
  if (o.preferIls) {
    const ilsEnds = ends.filter((e) => e.end.ils);
    if (ilsEnds.length)
      windTrue = norm360(pick(rng, ilsEnds).end.trueHeading + between(rng, -25, 25));
  }
  const windKt = between(rng, 4, 14);
  const best = bestRunwayForWind(airport, windTrue) ?? ends[0];
  const runway = best
    ? runwayInfo(airport, best.end)
    : { id: "36", dataId: "36", magHeading: 360, pattern: "left" as const, ils: null };
  const otherRunway = ends.find(
    (e) =>
      best &&
      e.runway.name !== best.runway.name &&
      Math.abs(norm180(e.end.trueHeading - windTrue)) < 100,
  );
  const reciprocal = best ? best.runway.ends.find((e) => e.id !== best.end.id) : undefined;
  const altEnd = otherRunway?.end ?? reciprocal;
  const altRunway = altEnd ? runwayInfo(airport, altEnd) : null;

  const airportName = airportSpokenName(airport);
  const aircraft = aircraftInfo(o.aircraftId);
  const cs = makeCallsign(o.callsign, [
    aircraft.typeWord,
    ...aircraft.typeKeywords.filter((k) => /^[a-z]+$/.test(k)),
  ]);
  const atis = buildAtis(
    airportName,
    rng,
    runway,
    windTrue,
    windKt,
    airport.magVar,
    !!o.ifrWeather,
  );
  const facilities = buildFacilities(airport);
  const destination = pickDestination(airport, o.destinationIcao);
  const alts = cruiseAltitudes(airport.elevationFt, destination.bearing);
  const patternAltitude = Math.round((airport.elevationFt + 1000) / 100) * 100;
  const delta = Math.max(-90, Math.min(90, norm180(destination.bearing - runway.magHeading)));
  let departureHeading = Math.round(norm360(runway.magHeading + delta) / 10) * 10 || 360;
  if (Math.abs(norm180(departureHeading - runway.magHeading)) < 15)
    departureHeading =
      Math.round(norm360(runway.magHeading + (delta >= 0 ? 30 : -30)) / 10) * 10 || 360;
  const taxiRoute = airport.taxiways.length
    ? airport.taxiways.slice(0, rng() < 0.5 ? 1 : Math.min(2, airport.taxiways.length))
    : ["A"];
  const positionDirDeg = between(rng, 0, 7) * 45;
  const positionMiles = between(rng, 8, 14);
  const souls = between(rng, 1, 3);
  const distress = rng() < 0.6;

  return {
    airport,
    airportName,
    aircraft,
    cs,
    abbrevBy: {},
    runway,
    altRunway,
    atis,
    atisFreq: freqOf(airport, "ATIS")?.mhz ?? freqOf(airport, "AWOS")?.mhz ?? null,
    facilities,
    taxiRoute,
    parking: "transient parking",
    patternAltitude,
    squawk: randomSquawk(rng),
    destination,
    vfrCruise: alts.vfr,
    ifrInitial: alts.initial,
    ifrCruise: alts.ifr,
    departureHeading,
    position: `${positionMiles} miles ${compassWord(positionDirDeg)} of ${airportName}`,
    positionDir: compassWord(positionDirDeg),
    positionMiles,
    altitude: alts.vfr,
    heading: Math.round(norm360(positionDirDeg + 180) / 10) * 10 || 360,
    clearance: null,
    traffic: [],
    emergency: {
      kind: distress ? "distress" : "urgency",
      nature: distress
        ? pick(rng, ["engine failure", "smoke in the cockpit"])
        : pick(rng, ["rough-running engine", "low oil pressure"]),
      souls,
      fuelMinutes: between(rng, 4, 12) * 15,
    },
    approachName: approachPhrase(runway).text,
    interceptAltitude: Math.ceil((airport.elevationFt + 1900) / 100) * 100,
    reported: {},
    rules: o.rules,
  };
}

/** Human-readable situation summary, e.g. "4,500 ft, heading 270". */
export function situationLine(ctx: ScenarioContext): string {
  return `${alt(ctx.altitude).text} ft · heading ${hdg(ctx.heading).text}`;
}
