/**
 * Navigation receivers: VOR, localizer/glideslope, DME, ADF, marker beacons and GPS.
 * Pure functions of aircraft position + radio settings → NavOutputs.
 */
import { AIRPORTS, NAVAIDS, magneticHeading } from "@/lib/data/airports";
import type { Airport, RunwayEnd } from "@/lib/data/types";
import {
  bearingDeg,
  clamp,
  crossTrackNm,
  destinationPoint,
  distanceNm,
  FT_PER_NM,
  norm180,
  norm360,
  toDeg,
} from "@/lib/geo";
import type {
  AircraftState,
  GpsOutput,
  GpsState,
  NavOutputs,
  NavReceiverOutput,
  Radios,
  Waypoint,
} from "./types";

export interface TrainingNdb {
  id: string;
  khz: number;
  lat: number;
  lon: number;
}

const EMPTY_RX: NavReceiverOutput = {
  valid: false,
  ident: "",
  kind: "NONE",
  freq: 0,
  radial: 0,
  cdiDots: 0,
  toFrom: "OFF",
  locCourse: 0,
  gsValid: false,
  gsDots: 0,
  dmeValid: false,
  dmeNm: 0,
  bearingTo: 0,
};

/** Line-of-sight reception range (nm) for a VHF station. */
function vhfRange(aglFt: number): number {
  return clamp(1.23 * Math.sqrt(Math.max(aglFt, 50)) + 15, 20, 130);
}

interface IlsHit {
  airport: Airport;
  end: RunwayEnd;
  runwayLengthFt: number;
}

const ILS_INDEX: { freq: number; hit: IlsHit }[] = AIRPORTS.flatMap((a) =>
  a.runways.flatMap((r) =>
    r.ends
      .filter((e) => e.ils)
      .map((e) => ({ freq: e.ils!.freq, hit: { airport: a, end: e, runwayLengthFt: r.lengthFt } })),
  ),
);

const same = (a: number, b: number) => Math.abs(a - b) < 0.004;

export function findIlsByFreq(freq: number, lat: number, lon: number): IlsHit | undefined {
  let best: IlsHit | undefined;
  let bestD = Infinity;
  for (const { freq: f, hit } of ILS_INDEX) {
    if (!same(f, freq)) continue;
    const d = distanceNm(lat, lon, hit.end.threshold.lat, hit.end.threshold.lon);
    if (d < bestD) {
      bestD = d;
      best = hit;
    }
  }
  return bestD < 40 ? best : undefined;
}

function computeReceiver(freq: number, obs: number, ac: AircraftState): NavReceiverOutput {
  // Localizer frequencies: 108.10–111.95 with odd tenths.
  const tenth = Math.round(freq * 10) % 10;
  const isLocBand = freq >= 108 && freq < 112 && tenth % 2 === 1;
  if (isLocBand) {
    const ils = findIlsByFreq(freq, ac.lat, ac.lon);
    if (!ils) return { ...EMPTY_RX, freq };
    const { end, airport, runwayLengthFt } = ils;
    const hdg = end.trueHeading;
    // Localizer antenna beyond the far end of the runway; glideslope ~1000 ft past threshold.
    const loc = destinationPoint(
      end.threshold.lat,
      end.threshold.lon,
      hdg,
      (runwayLengthFt + 1000) / FT_PER_NM,
    );
    const distLoc = distanceNm(loc.lat, loc.lon, ac.lat, ac.lon);
    const brgFromLoc = bearingDeg(loc.lat, loc.lon, ac.lat, ac.lon);
    const beta = norm180(brgFromLoc - norm360(hdg + 180));
    const inFront = Math.abs(beta) < 35;
    const locCourse = magneticHeading(airport, hdg);
    if (distLoc > 25 || !inFront)
      return { ...EMPTY_RX, freq, ident: end.ils!.ident, kind: "ILS", locCourse };
    // Localizer: ~±2.5° full scale (≈700 ft at threshold); 5 dots full scale each side → 2.5 dots shown.
    const widthDeg = clamp(toDeg(Math.atan(350 / (runwayLengthFt + 1000))), 1.5, 3);
    const cdiDots = clamp((beta / widthDeg) * 2.5, -2.5, 2.5);
    const gsPt = destinationPoint(end.threshold.lat, end.threshold.lon, hdg, 1000 / FT_PER_NM);
    const distGs = distanceNm(gsPt.lat, gsPt.lon, ac.lat, ac.lon) * FT_PER_NM;
    const heightAboveGs = ac.altMslFt - airport.elevationFt;
    const angle = toDeg(Math.atan2(heightAboveGs, Math.max(distGs, 1)));
    const gsAngle = end.ils!.glideslopeDeg;
    const gsValid = distGs / FT_PER_NM < 12 && Math.abs(beta) < 10;
    const gsDots = clamp(((gsAngle - angle) / 0.7) * 2.5, -2.5, 2.5);
    return {
      valid: true,
      ident: end.ils!.ident,
      kind: "ILS",
      freq,
      radial: 0,
      cdiDots,
      toFrom: "TO",
      locCourse,
      gsValid,
      gsDots,
      dmeValid: false,
      dmeNm: 0,
      bearingTo: norm360(
        bearingDeg(ac.lat, ac.lon, end.threshold.lat, end.threshold.lon) - airport.magVar,
      ),
    };
  }
  // VOR
  const range = vhfRange(ac.aglFt);
  let station = undefined as (typeof NAVAIDS)[number] | undefined;
  let d = Infinity;
  for (const n of NAVAIDS) {
    if (n.freq === undefined || n.type === "NDB" || !same(n.freq, freq)) continue;
    const dd = distanceNm(ac.lat, ac.lon, n.lat, n.lon);
    if (dd < d) {
      d = dd;
      station = n;
    }
  }
  if (!station || d > range) return { ...EMPTY_RX, freq };
  const radialTrue = bearingDeg(station.lat, station.lon, ac.lat, ac.lon);
  const radial = norm360(radialTrue - station.magVar);
  const fromDiff = norm180(radial - obs);
  const toFrom: "TO" | "FROM" = Math.abs(fromDiff) < 90 ? "FROM" : "TO";
  const dev = toFrom === "FROM" ? norm180(obs - radial) : norm180(norm360(radial + 180) - obs);
  // Over the station (cone of confusion) the flag goes OFF.
  const overStation = d < Math.max(0.3, ac.aglFt / 6076);
  const hasDme = station.type !== "VOR";
  const slant = Math.sqrt(d * d + (ac.altMslFt / FT_PER_NM) ** 2);
  return {
    valid: true,
    ident: station.id,
    kind: "VOR",
    freq,
    radial,
    cdiDots: overStation ? 0 : clamp(dev / 2, -2.5, 2.5),
    toFrom: overStation ? "OFF" : toFrom,
    locCourse: 0,
    gsValid: false,
    gsDots: 0,
    dmeValid: hasDme,
    dmeNm: hasDme ? slant : 0,
    bearingTo: norm360(radial + 180),
  };
}

function waypointTarget(gps: GpsState, ac: AircraftState): { from: Waypoint; to: Waypoint } | null {
  if (gps.directTo) {
    return { from: { id: "D→", lat: ac.lat, lon: ac.lon, kind: "user" }, to: gps.directTo };
  }
  const fp = gps.flightPlan;
  if (fp.length < 2) return null;
  const i = clamp(gps.activeLeg, 1, fp.length - 1);
  return { from: fp[i - 1]!, to: fp[i]! };
}

export function computeGps(
  gps: GpsState,
  ac: AircraftState,
  magVar: number,
  failed: boolean,
  directFrom: Waypoint | null,
): GpsOutput {
  const empty: GpsOutput = {
    valid: false,
    fromId: "",
    toId: "",
    dtk: 0,
    brg: 0,
    distNm: 0,
    xtkNm: 0,
    eteMin: 0,
    cdiDots: 0,
    vdevDots: 0,
    vdevValid: false,
    toFrom: "TO",
    remainingNm: 0,
  };
  if (failed) return empty;
  let leg = waypointTarget(gps, ac);
  if (gps.directTo && directFrom) leg = { from: directFrom, to: gps.directTo };
  if (!leg) return { ...empty, valid: true };
  const { from, to } = leg;
  const dtkTrue = bearingDeg(from.lat, from.lon, to.lat, to.lon);
  const brgTrue = bearingDeg(ac.lat, ac.lon, to.lat, to.lon);
  const dist = distanceNm(ac.lat, ac.lon, to.lat, to.lon);
  const xtk =
    from.lat === to.lat && from.lon === to.lon
      ? 0
      : crossTrackNm(from.lat, from.lon, to.lat, to.lon, ac.lat, ac.lon);
  const fullScale = gps.mode === "APR" ? 0.3 : gps.mode === "TERM" ? 1 : 2;
  const cdiDots = clamp((-xtk / fullScale) * 2.5, -2.5, 2.5);
  const toFrom = Math.abs(norm180(brgTrue - dtkTrue)) < 90 ? "TO" : "FROM";
  let remaining = dist;
  if (!gps.directTo) {
    for (let i = gps.activeLeg + 1; i < gps.flightPlan.length; i++) {
      const a = gps.flightPlan[i - 1]!;
      const b = gps.flightPlan[i]!;
      remaining += distanceNm(a.lat, a.lon, b.lat, b.lon);
    }
  }
  // LPV-style vertical guidance to the runway threshold when the destination waypoint is a runway.
  let vdevDots = 0;
  let vdevValid = false;
  if (gps.approach && gps.approach.kind === "RNAV" && gps.mode === "APR") {
    const rw = gps.flightPlan[gps.flightPlan.length - 1];
    if (rw && rw.kind === "runway" && rw.altFt !== undefined) {
      const dRw = distanceNm(ac.lat, ac.lon, rw.lat, rw.lon) * FT_PER_NM;
      const pathAlt = rw.altFt + 50 + dRw * Math.tan((3 * Math.PI) / 180);
      const angle = toDeg(Math.atan2(ac.altMslFt - rw.altFt - 50, Math.max(dRw, 1)));
      vdevDots = clamp(((3 - angle) / 0.7) * 2.5, -2.5, 2.5);
      vdevValid = dRw / FT_PER_NM < 8 && ac.altMslFt < pathAlt + 1500;
    }
  }
  return {
    valid: true,
    fromId: from.id,
    toId: to.id,
    dtk: norm360(dtkTrue - magVar),
    brg: norm360(brgTrue - magVar),
    distNm: dist,
    xtkNm: xtk,
    eteMin: ac.gsKt > 30 ? (dist / ac.gsKt) * 60 : 0,
    cdiDots,
    vdevDots,
    vdevValid,
    toFrom,
    remainingNm: remaining,
  };
}

export function computeNav(
  ac: AircraftState,
  radios: Radios,
  gps: GpsState,
  magVar: number,
  opts: {
    gpsFailed: boolean;
    navPowered: boolean;
    directFrom: Waypoint | null;
    ndbs: TrainingNdb[];
  },
): NavOutputs {
  const nav1 = opts.navPowered
    ? computeReceiver(radios.nav1.active, radios.nav1.obs, ac)
    : { ...EMPTY_RX };
  const nav2 = opts.navPowered
    ? computeReceiver(radios.nav2.active, radios.nav2.obs, ac)
    : { ...EMPTY_RX };
  const gpsOut = computeGps(gps, ac, magVar, opts.gpsFailed || !opts.navPowered, opts.directFrom);

  let hsi: NavOutputs["hsi"];
  if (radios.cdiSource === "GPS") {
    hsi = {
      source: "GPS",
      course: gpsOut.dtk,
      cdiDots: gpsOut.cdiDots,
      toFrom: gpsOut.valid && gpsOut.toId ? gpsOut.toFrom : "OFF",
      gsDots: gpsOut.vdevDots,
      gsValid: gpsOut.vdevValid,
      label:
        gps.approach && gps.mode === "APR"
          ? gps.approach.kind === "RNAV"
            ? "LPV"
            : "GPS"
          : gps.mode,
    };
  } else {
    const rx = radios.cdiSource === "NAV1" ? nav1 : nav2;
    const r = radios.cdiSource === "NAV1" ? radios.nav1 : radios.nav2;
    hsi = {
      source: radios.cdiSource,
      course: rx.kind === "ILS" && rx.valid ? rx.locCourse : r.obs,
      cdiDots: rx.cdiDots,
      toFrom: rx.valid ? rx.toFrom : "OFF",
      gsDots: rx.gsDots,
      gsValid: rx.gsValid,
      label: rx.kind === "ILS" ? "LOC" : "VOR",
    };
  }

  // ADF (training NDBs only).
  let adf: NavOutputs["adf"] = { valid: false, ident: "", relBearing: 90 };
  if (opts.navPowered) {
    const ndb = opts.ndbs.find((n) => Math.abs(n.khz - radios.adfKhz) < 0.5);
    if (ndb && distanceNm(ac.lat, ac.lon, ndb.lat, ndb.lon) < 60) {
      const brg = bearingDeg(ac.lat, ac.lon, ndb.lat, ndb.lon);
      adf = { valid: true, ident: ndb.id, relBearing: norm360(brg - ac.heading) };
    }
  }

  // Marker beacons for the ILS tuned on NAV1.
  let marker: NavOutputs["marker"] = null;
  const ils = nav1.kind === "ILS" ? findIlsByFreq(radios.nav1.active, ac.lat, ac.lon) : undefined;
  if (ils && opts.navPowered) {
    const d = distanceNm(ac.lat, ac.lon, ils.end.threshold.lat, ils.end.threshold.lon);
    const beta = Math.abs(
      norm180(
        bearingDeg(ils.end.threshold.lat, ils.end.threshold.lon, ac.lat, ac.lon) -
          norm360(ils.end.trueHeading + 180),
      ),
    );
    const cone = 0.15 + ac.aglFt / 20000;
    if (beta < 10) {
      if (Math.abs(d - 5) < cone) marker = "OM";
      else if (Math.abs(d - 0.55) < cone * 0.6) marker = "MM";
    }
  }

  return { nav1, nav2, gps: gpsOut, hsi, adf, marker };
}

/**
 * Build a training RNAV/ILS approach for a runway end: IF (9 nm) → FAF (5 nm) → runway.
 * These are simulator-generated training procedures based on runway geometry — NOT the
 * published instrument approach procedures.
 */
export function buildTrainingApproach(airport: Airport, end: RunwayEnd): Waypoint[] {
  const back = norm360(end.trueHeading + 180);
  const at = (nm: number) => destinationPoint(end.threshold.lat, end.threshold.lon, back, nm);
  const fafAlt = Math.ceil((airport.elevationFt + 5 * 318 + 50) / 100) * 100;
  const ifAlt = Math.ceil((airport.elevationFt + 9 * 318 + 50) / 100) * 100;
  const iaf = at(12);
  const ifp = at(9);
  const faf = at(5);
  return [
    { id: `${end.id}IAF`, label: "IAF", ...iaf, kind: "fix", altFt: ifAlt },
    { id: `${end.id}IF`, label: "IF", ...ifp, kind: "fix", altFt: ifAlt },
    { id: `${end.id}FAF`, label: "FAF", ...faf, kind: "fix", altFt: fafAlt },
    {
      id: `RW${end.id}`,
      label: `RW${end.id}`,
      lat: end.threshold.lat,
      lon: end.threshold.lon,
      kind: "runway",
      altFt: airport.elevationFt,
    },
  ];
}
