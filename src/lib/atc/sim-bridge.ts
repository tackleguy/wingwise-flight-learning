/**
 * Simulator <-> ATC bridge: connects live SimEngine telemetry, weather, events, and
 * COM1/COM2/Transponder radios into the conversational full-flight ATC engine.
 *
 * Everything here is SIMULATED FOR TRAINING ONLY — never real ATC.
 */
import { AIRPORTS, allRunwayEnds, bestRunwayForWind, getAirport } from "@/lib/data/airports";
import type { Airport } from "@/lib/data/types";
import { bearingDeg, distanceNm, norm360 } from "@/lib/geo";
import type { BuiltScenario, ScenarioDef } from "@/sim/scenarios";
import type { ComRadio, SimEvent, SimSnapshot, WeatherState } from "@/sim/types";
import { airportSpokenName, compassWord, composeAtis, facilityOf } from "./context";
import { formatFreqShort } from "./frequency";
import {
  createFreeState,
  extractReadback,
  groundStation,
  landingStation,
  readbackExample,
  switchToLeg,
  type FreeReply,
  type FreeState,
} from "./freeform";
import { alt, altimeter, csPhrase, freq, hdg, PHONETIC, ph, plain, rwy, wind } from "./phrase";
import type {
  AirportLegContext,
  Difficulty,
  Facility,
  FacilityKey,
  Personality,
  RunwayInfo,
} from "./types";

export interface SimTelemetry {
  lat: number;
  lon: number;
  altMslFt: number;
  aglFt: number;
  headingMag: number;
  iasKt: number;
  gsKt: number;
  vsFpm: number;
  onGround: boolean;
  distToDepNm: number;
  brgToDepMag: number;
  distToDestNm: number | null;
  brgToDestMag: number | null;
  distToActiveNm: number;
  brgToActiveMag: number;
  nearestAirport: { icao: string; name: string; distNm: number };
  radiosPowered: boolean;
  com1: ComRadio;
  com2: ComRadio;
  squawk: string;
}

export interface SimAtcController {
  free: FreeState;
  startedAirborne: boolean;
  hasLiftedOff: boolean;
  fired: Record<string, boolean>;
}

const r10 = (d: number) => Math.round(norm360(d) / 10) * 10 || 360;

function skyText(w: WeatherState): string {
  if (w.cloudCover === "CLR" || w.cloudBaseFt === null) return "Sky clear";
  const base = Math.round(w.cloudBaseFt / 100) * 100;
  const word: Record<WeatherState["cloudCover"], string> = {
    CLR: "Sky clear",
    FEW: `Few clouds at ${base.toLocaleString()}`,
    SCT: `Scattered clouds at ${base.toLocaleString()}`,
    BKN: `Ceiling ${base.toLocaleString()} broken`,
    OVC: `Ceiling ${base.toLocaleString()} overcast`,
  };
  return word[w.cloudCover];
}

function zuluFromTimeOfDay(timeOfDay: number): string {
  const hrs = ((Math.floor(timeOfDay) % 24) + 24) % 24;
  return `${String(hrs).padStart(2, "0")}55`;
}

/** Rebuild an airport leg's ATIS so wind, visibility, clouds, temp, and altimeter match live sim weather. */
export function syncAtisWithWeather(
  legCtx: AirportLegContext,
  weather: WeatherState,
  ifrWx: boolean,
): AirportLegContext {
  const windDirMag = r10(weather.windDir - legCtx.airport.magVar);
  const windKt = Math.max(0, Math.round(weather.windKt));
  const atis = composeAtis({
    airportName: legCtx.airportName,
    letterCode: legCtx.atis.letter,
    zuluTime: zuluFromTimeOfDay(weather.timeOfDay),
    runway: legCtx.runway,
    windDirMag,
    windKt,
    visibilitySm: weather.visibilitySm,
    sky: skyText(weather),
    tempC: weather.tempC,
    dewC: weather.tempC - (weather.precipitation !== "none" ? 1 : weather.visibilitySm < 5 ? 2 : 7),
    altimeterInHg: weather.qnhInHg,
    ifrWx:
      ifrWx ||
      weather.visibilitySm < 3 ||
      (weather.cloudBaseFt !== null &&
        weather.cloudBaseFt < 1000 &&
        (weather.cloudCover === "BKN" || weather.cloudCover === "OVC")),
  });
  return { ...legCtx, atis };
}

function nearestAirportInfo(
  lat: number,
  lon: number,
): { icao: string; name: string; distNm: number } {
  let best = AIRPORTS[0]!;
  let bestD = Infinity;
  for (const a of AIRPORTS) {
    const d = distanceNm(lat, lon, a.lat, a.lon);
    if (d < bestD) {
      bestD = d;
      best = a;
    }
  }
  return {
    icao: best.icao,
    name: airportSpokenName(best),
    distNm: Math.round(bestD * 10) / 10,
  };
}

export function extractTelemetry(
  snap: SimSnapshot,
  built: BuiltScenario,
  free: FreeState,
): SimTelemetry {
  const ac = snap.aircraft;
  const dep = built.departure;
  const dest =
    (free.dest?.airport ?? built.destination ?? getAirport(free.ctx.destination.icao)) || null;
  const activeAp = free.ctx.airport;

  const distToDepNm = distanceNm(ac.lat, ac.lon, dep.lat, dep.lon);
  const brgToDepMag = r10(bearingDeg(ac.lat, ac.lon, dep.lat, dep.lon) - dep.magVar);
  const distToDestNm = dest ? distanceNm(ac.lat, ac.lon, dest.lat, dest.lon) : null;
  const brgToDestMag = dest
    ? r10(bearingDeg(ac.lat, ac.lon, dest.lat, dest.lon) - dest.magVar)
    : null;
  const distToActiveNm = distanceNm(ac.lat, ac.lon, activeAp.lat, activeAp.lon);
  const brgToActiveMag = r10(
    bearingDeg(ac.lat, ac.lon, activeAp.lat, activeAp.lon) - activeAp.magVar,
  );

  return {
    lat: Math.round(ac.lat * 10000) / 10000,
    lon: Math.round(ac.lon * 10000) / 10000,
    altMslFt: Math.round(snap.indicated.altFt),
    aglFt: Math.round(ac.aglFt),
    headingMag: Math.round(norm360(snap.indicated.headingMag)) || 360,
    iasKt: Math.round(snap.indicated.iasKt),
    gsKt: Math.round(ac.gsKt),
    vsFpm: Math.round(snap.indicated.vsFpm / 50) * 50,
    onGround: ac.onGround,
    distToDepNm: Math.round(distToDepNm * 10) / 10,
    brgToDepMag,
    distToDestNm: distToDestNm !== null ? Math.round(distToDestNm * 10) / 10 : null,
    brgToDestMag,
    distToActiveNm: Math.round(distToActiveNm * 10) / 10,
    brgToActiveMag,
    nearestAirport: nearestAirportInfo(ac.lat, ac.lon),
    radiosPowered: !snap.failures.radios && snap.indicated.avionicsPowered,
    com1: snap.radios.com1,
    com2: snap.radios.com2,
    squawk: snap.radios.transponder.code,
  };
}

function alignRunwayForWind(
  ap: Airport,
  windDirTrue: number,
  preferIls: boolean,
): RunwayInfo | null {
  const ends = allRunwayEnds(ap);
  const best =
    (preferIls
      ? ends.find(
          (e) => e.end.ils && Math.abs(((windDirTrue - e.end.trueHeading + 540) % 360) - 180) <= 90,
        )
      : undefined) ??
    bestRunwayForWind(ap, windDirTrue) ??
    ends[0];
  if (!best) return null;
  return {
    id: best.end.id.replace(/^0/, ""),
    dataId: best.end.id,
    magHeading: Math.round(norm360(best.end.trueHeading - ap.magVar)),
    pattern: best.end.pattern,
    ils: best.end.ils ? { freq: best.end.ils.freq, ident: best.end.ils.ident } : null,
  };
}

export function initSimAtc(opts: {
  built: BuiltScenario;
  scenario: ScenarioDef;
  aircraftId: string;
  callsign: string;
  difficulty: Difficulty;
  personality: Personality;
  snap: SimSnapshot;
}): { ctrl: SimAtcController; replies: FreeReply[] } {
  const { built, scenario, aircraftId, callsign, difficulty, personality, snap } = opts;
  const rules = scenario.rules;
  const startedAirborne = !snap.aircraft.onGround;
  const hasDest = !!built.destination && built.destination.icao !== built.departure.icao;

  const goalId = hasDest
    ? rules === "IFR"
      ? "ifr-full-flight"
      : "vfr-full-flight"
    : scenario.id.includes("land") || scenario.id.includes("pattern")
      ? "pattern"
      : scenario.id.includes("approach") || scenario.id.includes("ils")
        ? "ifr-arrival"
        : rules === "IFR"
          ? "ifr-departure"
          : "vfr-departure-ff";

  const { state: base } = createFreeState({
    airportIcao: built.departure.icao,
    ...(built.destination ? { destinationIcao: built.destination.icao } : {}),
    aircraftId,
    callsign,
    rules,
    goalId,
    difficulty,
    personality,
  });

  // Align active runway & ATIS with the live simulator weather
  const ifrWx = rules === "IFR" || snap.weather.visibilitySm < 3;
  const alignedRwy = alignRunwayForWind(built.departure, snap.weather.windDir, rules === "IFR");
  const depWithRwy: AirportLegContext = {
    ...base.dep,
    ...(alignedRwy ? { runway: alignedRwy } : {}),
  };
  const syncedDep = syncAtisWithWeather(depWithRwy, snap.weather, ifrWx);
  const syncedDest = base.dest
    ? syncAtisWithWeather(
        {
          ...base.dest,
          ...(alignRunwayForWind(base.dest.airport, snap.weather.windDir, rules === "IFR")
            ? {
                runway: alignRunwayForWind(
                  base.dest.airport,
                  snap.weather.windDir,
                  rules === "IFR",
                )!,
              }
            : {}),
        },
        snap.weather,
        ifrWx,
      )
    : null;

  let free: FreeState = {
    ...base,
    goal: scenario.title,
    dep: syncedDep,
    dest: syncedDest,
    ctx: {
      ...base.ctx,
      runway: syncedDep.runway,
      atis: syncedDep.atis,
      altitude: Math.round(snap.aircraft.altMslFt),
      heading: Math.round(norm360(snap.aircraft.heading - built.departure.magVar)) || 360,
    },
  };

  if (snap.aircraft.onGround) {
    // Most sim scenarios begin lined up on the runway with engine running
    const twrKey = landingStation(free.ctx);
    free = {
      ...free,
      leg: "departure",
      phase: "holding-short",
      currentStation: twrKey,
      ctx: {
        ...free.ctx,
        position: `runway ${free.ctx.runway.id} at ${free.ctx.airportName}`,
      },
    };
  } else {
    const distDep = distanceNm(
      snap.aircraft.lat,
      snap.aircraft.lon,
      built.departure.lat,
      built.departure.lon,
    );
    const destAp = syncedDest?.airport ?? null;
    const distDest = destAp
      ? distanceNm(snap.aircraft.lat, snap.aircraft.lon, destAp.lat, destAp.lon)
      : Infinity;

    if (destAp && distDest <= 18) {
      free = switchToLeg(free, "destination");
      const twrKey = landingStation(free.ctx);
      const isFinal = distDest <= 5 && snap.aircraft.aglFt < 1800;
      free = {
        ...free,
        phase: isFinal ? "final" : rules === "IFR" ? "arrival" : "inbound",
        currentStation: isFinal ? twrKey : rules === "IFR" ? "approach" : twrKey,
        ffActive: rules === "VFR" && distDest > 5,
      };
    } else if (distDep <= 5 && snap.aircraft.aglFt < 1800) {
      const twrKey = landingStation(free.ctx);
      free = {
        ...free,
        phase: "final",
        currentStation: twrKey,
        ctx: {
          ...free.ctx,
          position: `${Math.max(1, Math.round(distDep))} miles final runway ${free.ctx.runway.id}`,
        },
      };
    } else if (distDep <= 12 && (rules === "IFR" || scenario.id.includes("approach"))) {
      free = {
        ...free,
        phase: "arrival",
        currentStation: "approach",
        ctx: {
          ...free.ctx,
          position: `${Math.round(distDep)} miles ${compassWord(norm360(bearingDeg(built.departure.lat, built.departure.lon, snap.aircraft.lat, snap.aircraft.lon) - built.departure.magVar))} of ${free.ctx.airportName}`,
        },
      };
    } else {
      free = {
        ...free,
        leg: "enroute",
        phase: "enroute",
        currentStation: rules === "IFR" ? "center" : "approach",
        ffActive: rules === "IFR",
      };
    }
  }

  const curFac = facilityOf(free.ctx, free.currentStation);
  const introText = snap.aircraft.onGround
    ? `${free.ctx.airport.icao} · Runway ${free.ctx.runway.id}. ${curFac.name} on ${formatFreqShort(curFac.mhz)}${free.ctx.atisFreq ? `, ATIS ${formatFreqShort(free.ctx.atisFreq)}` : ""}.`
    : `Airborne · ${curFac.name} on ${formatFreqShort(curFac.mhz)}${free.dest ? ` → ${free.dest.airport.icao} (${free.dest.airportName})` : ""}.`;

  const replies: FreeReply[] = [
    {
      kind: "system",
      phrase: plain(`Live Sim ATC connected (training only). ${introText}`),
      delayMs: 0,
      tone: "info",
    },
  ];

  return {
    ctrl: {
      free,
      startedAirborne,
      hasLiftedOff: startedAirborne,
      fired: {},
    },
    replies,
  };
}

export function initialSimRadios(free: FreeState): { com1: ComRadio; com2: ComRadio } {
  const cur = facilityOf(free.ctx, free.currentStation);
  const standby =
    free.ctx.atisFreq ??
    free.ctx.facilities.departure?.mhz ??
    free.ctx.facilities.ground?.mhz ??
    121.5;
  const com2Active = free.ctx.atisFreq ?? free.ctx.facilities.ground?.mhz ?? 121.5;
  return {
    com1: { active: cur.mhz, standby },
    com2: { active: com2Active, standby: 121.5 },
  };
}

/**
 * Periodic telemetry sync & proactive ATC handoffs / clearances based on live flight progress.
 */
export function stepSimAtc(
  ctrl0: SimAtcController,
  snap: SimSnapshot,
  built: BuiltScenario,
): { ctrl: SimAtcController; replies: FreeReply[]; changed: boolean } {
  const tel = extractTelemetry(snap, built, ctrl0.free);
  const ifrWx = ctrl0.free.rules === "IFR" || snap.weather.visibilitySm < 3;

  // Keep weather-derived ATIS & active telemetry synchronized
  const dep = syncAtisWithWeather(ctrl0.free.dep, snap.weather, ifrWx);
  const dest = ctrl0.free.dest ? syncAtisWithWeather(ctrl0.free.dest, snap.weather, ifrWx) : null;
  const activeLegAtis = ctrl0.free.leg === "destination" && dest ? dest.atis : dep.atis;

  const activeAp = ctrl0.free.ctx.airport;
  const brgFromActive = norm360(
    bearingDeg(activeAp.lat, activeAp.lon, snap.aircraft.lat, snap.aircraft.lon) - activeAp.magVar,
  );
  const posText = snap.aircraft.onGround
    ? `at ${ctrl0.free.ctx.airportName}, runway ${ctrl0.free.ctx.runway.id}`
    : `${Math.max(1, Math.round(tel.distToActiveNm))} miles ${compassWord(brgFromActive)} of ${ctrl0.free.ctx.airportName}`;

  let free: FreeState = {
    ...ctrl0.free,
    dep,
    dest,
    ctx: {
      ...ctrl0.free.ctx,
      atis: activeLegAtis,
      altitude: Math.max(0, Math.round(snap.indicated.altFt)),
      heading: tel.headingMag,
      position: posText,
      positionDir: compassWord(brgFromActive),
      positionMiles: Math.max(1, Math.round(tel.distToActiveNm)),
    },
  };

  let ctrl: SimAtcController = {
    ...ctrl0,
    free,
    hasLiftedOff: ctrl0.hasLiftedOff || (!snap.aircraft.onGround && snap.aircraft.aglFt > 80),
  };
  const fired = { ...ctrl.fired };
  const replies: FreeReply[] = [];
  let changed = false;

  if (snap.aircraft.crashed) {
    return { ctrl, replies, changed };
  }

  // Handle COM radio / electrical loss cleanly
  if (!tel.radiosPowered) {
    if (!fired["comms-lost"] && snap.failures.radios) {
      fired["comms-lost"] = true;
      changed = true;
      replies.push({
        kind: "system",
        phrase: plain("COM radios inoperative — squawk 7600 if IFR in IMC."),
        delayMs: 0,
        tone: "warning",
      });
    }
    return { ctrl: { ...ctrl, fired }, replies, changed };
  }

  // Do not fire automated controller calls within the first 3 seconds of sim start
  if (snap.aircraft.simTimeSec < 3) {
    return { ctrl, replies, changed };
  }

  const csText = csPhrase(free.ctx.cs, !!free.ctx.abbrevBy[free.currentStation]);

  // 1. Climbout handoff after liftoff from departure runway
  if (
    !ctrl.startedAirborne &&
    ctrl.hasLiftedOff &&
    !fired["climbout"] &&
    snap.aircraft.aglFt > 450
  ) {
    fired["climbout"] = true;
    changed = true;
    const prevTwr = facilityOf(free.ctx, free.currentStation);
    const depFac = free.ctx.facilities.departure;
    if (
      free.ctx.airport.towered &&
      depFac &&
      (free.rules === "IFR" || free.ffActive || free.dest)
    ) {
      const p = ph`${csText}, contact ${depFac.name} ${freq(depFac.mhz)}.`;
      replies.push({
        kind: "atc",
        facility: prevTwr,
        phrase: p,
        delayMs: 250,
      });
      free = {
        ...free,
        phase: "airborne",
        currentStation: "departure",
      };
    } else {
      free = { ...free, phase: "airborne" };
    }
  }

  // 2. Enroute transition (climbing past 2,400 AGL and > 8 nm from departure)
  if (
    !fired["enroute-handoff"] &&
    free.leg === "departure" &&
    !snap.aircraft.onGround &&
    snap.aircraft.aglFt > 2400 &&
    tel.distToDepNm > 8 &&
    (tel.distToDestNm === null || tel.distToDestNm > 22)
  ) {
    fired["enroute-handoff"] = true;
    changed = true;
    const prevFac = facilityOf(free.ctx, free.currentStation);
    const center = facilityOf(free.ctx, "center");
    if (free.rules === "IFR" || free.ffActive) {
      const p = ph`${csText}, contact ${center.name} ${freq(center.mhz)}.`;
      replies.push({
        kind: "atc",
        facility: prevFac,
        phrase: p,
        delayMs: 250,
      });
      free = {
        ...free,
        leg: "enroute",
        phase: "enroute",
        currentStation: "center",
      };
    } else {
      free = { ...free, leg: "enroute", phase: "enroute" };
    }
  }

  // 3. Approaching destination airport (<= 22 nm from destination)
  if (
    free.dest &&
    free.leg !== "destination" &&
    !fired["dest-arrival-handoff"] &&
    tel.distToDestNm !== null &&
    tel.distToDestNm <= 22 &&
    snap.aircraft.simTimeSec > 8
  ) {
    fired["dest-arrival-handoff"] = true;
    changed = true;
    const prevFac = facilityOf(free.ctx, free.currentStation);
    free = switchToLeg(free, "destination");
    const dCtx = free.ctx;
    const nextKey: FacilityKey =
      free.rules === "IFR" || free.ffActive
        ? dCtx.facilities.approach
          ? "approach"
          : landingStation(dCtx)
        : landingStation(dCtx);
    const nextFac = facilityOf(dCtx, nextKey);
    const nextPhase = free.rules === "IFR" ? "arrival" : "inbound";
    free = {
      ...free,
      phase: nextPhase,
      currentStation: nextKey,
    };
    if (free.rules === "IFR" || free.ffActive) {
      const p = ph`${csPhrase(dCtx.cs, false)}, descending into ${dCtx.airportName}, contact ${nextFac.name} ${freq(nextFac.mhz)}, ${dCtx.airportName} altimeter ${altimeter(dCtx.atis.altimeter)}.`;
      replies.push({
        kind: "atc",
        facility: prevFac,
        phrase: p,
        delayMs: 250,
      });
    } else {
      replies.push({
        kind: "system",
        phrase: plain(
          `Approaching ${dCtx.airport.icao} (${dCtx.airportName}, ${Math.round(tel.distToDestNm)} nm) — runway ${dCtx.runway.id} in use${dCtx.atisFreq ? `, ATIS ${formatFreqShort(dCtx.atisFreq)}` : ""}. Tune ${nextFac.name} (${formatFreqShort(nextFac.mhz)}).`,
        ),
        delayMs: 0,
        tone: "info",
      });
    }
  }

  // 4. Destination Tower / CTAF handoff inside 7 nm
  if (
    !fired["dest-tower-handoff"] &&
    !snap.aircraft.onGround &&
    (free.leg === "destination" || !free.dest) &&
    tel.distToActiveNm <= 7 &&
    (free.currentStation === "approach" ||
      free.currentStation === "center" ||
      free.currentStation === "departure")
  ) {
    fired["dest-tower-handoff"] = true;
    changed = true;
    const prevFac = facilityOf(free.ctx, free.currentStation);
    const twrKey = landingStation(free.ctx);
    const twrFac = facilityOf(free.ctx, twrKey);
    free = {
      ...free,
      phase: "inbound",
      currentStation: twrKey,
    };
    const p = free.ctx.airport.towered
      ? ph`${csPhrase(free.ctx.cs, false)}, ${free.ctx.airportName} altimeter ${altimeter(free.ctx.atis.altimeter)}, contact ${twrFac.name} ${freq(twrFac.mhz)}.`
      : ph`${csPhrase(free.ctx.cs, false)}, radar service terminated, change to advisory frequency ${freq(twrFac.mhz)} approved.`;
    replies.push({
      kind: "atc",
      facility: prevFac,
      phrase: p,
      delayMs: 250,
    });
  }

  // 5. Short final automatic landing clearance (or CTAF reminder) if not cleared yet
  if (
    !fired["dest-landing-clear"] &&
    ctrl.hasLiftedOff &&
    !snap.aircraft.onGround &&
    (free.leg === "destination" || !free.dest) &&
    tel.distToActiveNm <= 4 &&
    snap.aircraft.aglFt < 1500 &&
    free.phase !== "final" &&
    free.phase !== "landed" &&
    free.phase !== "parked"
  ) {
    fired["dest-landing-clear"] = true;
    changed = true;
    const twrKey = landingStation(free.ctx);
    const twrFac = facilityOf(free.ctx, twrKey);
    free = {
      ...free,
      phase: "final",
      currentStation: twrKey,
    };
    if (free.ctx.airport.towered) {
      const p = ph`${csPhrase(free.ctx.cs, true)}, ${twrFac.name}, ${wind(free.ctx.atis.windDirMag, free.ctx.atis.windKt)}, runway ${rwy(free.ctx.runway.id)}, cleared to land.`;
      const expects = extractReadback(p.text, free.ctx);
      free = {
        ...free,
        pending: expects.length
          ? { expects, tag: "landing", facility: "tower", instruction: p.text }
          : free.pending,
      };
      replies.push({
        kind: "atc",
        facility: twrFac,
        phrase: p,
        delayMs: 250,
      });
    } else {
      replies.push({
        kind: "system",
        phrase: plain(
          `On final runway ${free.ctx.runway.id} at untowered ${free.ctx.airport.icao} — announce final on ${twrFac.name} (${formatFreqShort(twrFac.mhz)}).`,
        ),
        delayMs: 0,
        tone: "info",
      });
    }
  }

  // 6. After landing & slowing on runway: exit and contact Ground
  if (
    !fired["touchdown-rollout"] &&
    ctrl.hasLiftedOff &&
    snap.aircraft.onGround &&
    snap.aircraft.gsKt > 1 &&
    snap.aircraft.gsKt < 38 &&
    free.phase !== "landed" &&
    free.phase !== "parked" &&
    snap.aircraft.simTimeSec > 6
  ) {
    fired["touchdown-rollout"] = true;
    changed = true;
    const gndKey = groundStation(free.ctx);
    if (gndKey) {
      const twrFac = facilityOf(free.ctx, "tower");
      const gndFac = facilityOf(free.ctx, gndKey);
      const p = ph`${csPhrase(free.ctx.cs, true)}, turn next taxiway, contact ${gndFac.name} ${freq(gndFac.mhz)}.`;
      free = {
        ...free,
        phase: "landed",
        currentStation: gndKey,
        pending: null,
      };
      replies.push({
        kind: "atc",
        facility: twrFac,
        phrase: p,
        delayMs: 300,
      });
    } else {
      const ctafFac = facilityOf(free.ctx, "ctaf");
      free = { ...free, phase: "landed", currentStation: "ctaf", pending: null };
      replies.push({
        kind: "system",
        phrase: plain(
          `Cleared landing on runway ${free.ctx.runway.id}. Self-announce clear of the runway on ${ctafFac.name} (${formatFreqShort(ctafFac.mhz)}).`,
        ),
        delayMs: 0,
        tone: "info",
      });
    }
  }

  ctrl = { ...ctrl, free, fired };
  return { ctrl, replies, changed };
}

export function handleSimEvent(
  ctrl: SimAtcController,
  ev: SimEvent,
): { ctrl: SimAtcController; replies: FreeReply[] } {
  const replies: FreeReply[] = [];
  if (ev.type === "liftoff") {
    return {
      ctrl: {
        ...ctrl,
        hasLiftedOff: true,
        free:
          ctrl.free.phase === "holding-short" || ctrl.free.phase === "taxiing"
            ? { ...ctrl.free, phase: "airborne" }
            : ctrl.free,
      },
      replies,
    };
  }
  if (ev.type === "touchdown") {
    return { ctrl: { ...ctrl, hasLiftedOff: true }, replies };
  }
  if (ev.type === "failure" && !ctrl.fired["failure-hint"] && /engine/i.test(ev.message)) {
    return {
      ctrl: { ...ctrl, fired: { ...ctrl.fired, "failure-hint": true } },
      replies: [
        {
          kind: "system",
          phrase: plain(
            "Emergency detected: declare Mayday on your active frequency (or 121.5) for immediate vectors and emergency equipment.",
          ),
          delayMs: 0,
          tone: "warning",
        },
      ],
    };
  }
  return { ctrl, replies };
}

/** 3–4 context-aware one-click pilot calls for the in-sim ATC drawer. */
export function simQuickCalls(
  free: FreeState,
  tuned: Facility | null,
  snap?: SimSnapshot,
): { label: string; text: string }[] {
  const c = free.ctx;
  const fac = tuned ?? facilityOf(c, free.currentStation);
  const csFull = c.cs.full;
  const cs = c.abbrevBy[fac.key] ? c.cs.abbrev : csFull;
  const out: { label: string; text: string }[] = [];

  if (free.pending) {
    const pendFac = facilityOf(c, free.pending.facility);
    out.push({
      label: "Read back",
      text: readbackExample(free, free.pending, pendFac),
    });
  }

  if (snap?.failures.engine && !free.emergency) {
    out.push({
      label: "Declare Mayday",
      text: `Mayday, Mayday, Mayday, ${fac.name}, ${csFull}, ${c.aircraft.spokenType}, engine failure at ${alt(c.altitude).text} feet, returning to land.`,
    });
  }

  switch (free.phase) {
    case "ramp":
    case "taxiing":
    case "holding-short":
      if (free.rules === "IFR" && !free.clearance && c.airport.towered) {
        out.push({
          label: "Request IFR clearance",
          text: `${facilityOf(c, "clearance").name}, ${csFull}, ${c.aircraft.spokenType}, at ${c.airportName} with information ${PHONETIC[c.atis.letter]}, ready to copy IFR clearance to ${c.destination.name}.`,
        });
      }
      out.push({
        label: c.airport.towered ? "Ready for takeoff" : "Announce departure",
        text: c.airport.towered
          ? `${facilityOf(c, "tower").name}, ${csFull}, holding short runway ${c.runway.id}, ready for takeoff.`
          : `${facilityOf(c, "ctaf").name}, ${csFull}, departing runway ${c.runway.id}, ${c.airportName}.`,
      });
      break;
    case "airborne":
    case "enroute":
      if (free.rules === "VFR" && !free.ffActive) {
        out.push({
          label: "Flight following",
          text: `${fac.name}, ${csFull}, ${c.aircraft.spokenType}, ${c.position}, ${alt(c.altitude).text} feet, request VFR flight following to ${c.destination.name}.`,
        });
      } else {
        out.push({
          label: "Check in",
          text: `${fac.name}, ${csFull}, ${alt(c.altitude).text} feet, heading ${hdg(c.heading).text}.`,
        });
      }
      out.push({
        label: "Request higher +2,000",
        text: `${fac.name}, ${cs}, request ${alt(c.altitude + 2000).text} feet.`,
      });
      if (free.dest) {
        out.push({
          label: `Weather at ${free.dest.airport.icao}`,
          text: `${fac.name}, ${cs}, request current wind and altimeter at ${free.dest.airportName}.`,
        });
      }
      break;
    case "arrival":
    case "inbound":
    case "pattern":
    case "final":
      if (free.phase === "arrival") {
        out.push({
          label: "Report inbound IFR",
          text: `${fac.name}, ${csFull}, ${alt(c.altitude).text} feet, inbound with information ${PHONETIC[c.atis.letter]}, request ${c.approachName}.`,
        });
      } else if (free.phase === "inbound") {
        out.push({
          label: "Inbound landing",
          text: `${fac.name}, ${csFull}, ${c.position}, ${alt(c.altitude).text} feet with information ${PHONETIC[c.atis.letter]}, inbound for landing.`,
        });
      } else if (free.phase === "pattern") {
        out.push({
          label: "Midfield downwind",
          text: `${fac.name}, ${cs}, midfield ${c.runway.pattern} downwind runway ${c.runway.id}.`,
        });
      } else {
        out.push({
          label: "On final",
          text: `${fac.name}, ${cs}, final runway ${c.runway.id}${c.airport.towered ? "" : `, ${c.airportName}`}.`,
        });
      }
      out.push({
        label: "Going around",
        text: `${fac.name}, ${cs}, going around.`,
      });
      break;
    case "landed":
      out.push({
        label: c.airport.towered ? "Clear of runway / taxi in" : "Announce clear",
        text: c.airport.towered
          ? `${facilityOf(c, "ground").name}, ${csFull}, clear of runway ${c.runway.id}, taxi to parking.`
          : `${facilityOf(c, "ctaf").name}, ${csFull}, clear of runway ${c.runway.id}, ${c.airportName}.`,
      });
      break;
    default:
      break;
  }

  out.push({
    label: "Wind & altimeter",
    text: `${fac.name}, ${cs}, request wind and altimeter check.`,
  });

  return out.slice(0, 4);
}
