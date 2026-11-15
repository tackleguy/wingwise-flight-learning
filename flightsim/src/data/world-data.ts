/**
 * World database: every airport, runway, radio frequency and navaid from OurAirports (public
 * domain), prepared by scripts/build-data.mjs into compact column files under public/data/.
 *
 *   const data = await loadWorldData();
 *   data.searchAirports("palo alto");
 *   data.getAirport("KPAO");
 *   data.airportsNear(lat, lon, 20);
 *   data.navaidsNear(lat, lon, 130);
 *
 * Not for real-world navigation: positions, frequencies and runway details may be wrong or out of date.
 */
import { bearingDeg, distanceNm, norm180 } from "@/core/math";

export type SurfaceType = "unknown" | "asphalt" | "concrete" | "grass" | "gravel" | "dirt" | "water" | "snow";
const SURFACES: SurfaceType[] = ["unknown", "asphalt", "concrete", "grass", "gravel", "dirt", "water", "snow"];

export interface RunwayEnd {
  /** Designator, e.g. "28R". */
  id: string;
  /** Physical end of the pavement. */
  lat: number;
  lon: number;
  /** Published elevation, ft (null when the data has none). */
  elevFt: number | null;
  /** True heading when taking off / landing from this end. */
  headingTrue: number;
  /** Displaced threshold distance from this end, ft. */
  displacedFt: number;
}

export interface Runway {
  index: number;
  airportIndex: number;
  /** e.g. "10L/28R" */
  name: string;
  lengthFt: number;
  widthFt: number;
  surface: SurfaceType;
  /** True for hard surfaces (asphalt / concrete). */
  paved: boolean;
  lighted: boolean;
  /** True when the position was estimated from the airport reference point (no surveyed end points in the data). */
  estimated: boolean;
  ends: [RunwayEnd, RunwayEnd];
}

export interface Frequency {
  /** e.g. "TWR", "GND", "ATIS", "CTAF", "UNIC", "APP" … as published by OurAirports. */
  type: string;
  description: string;
  mhz: number;
}

export type AirportSize = "small" | "medium" | "large";

export interface AirportSummary {
  index: number;
  ident: string;
  icao: string;
  iata: string;
  name: string;
  city: string;
  country: string;
  size: AirportSize;
  lat: number;
  lon: number;
  elevFt: number | null;
  runwayCount: number;
}

export interface Airport extends AirportSummary {
  countryName: string;
  runways: Runway[];
  frequencies: Frequency[];
}

export type NavaidType = "VOR" | "VOR-DME" | "VORTAC" | "DME" | "NDB" | "NDB-DME" | "TACAN";
const NAVTYPES: NavaidType[] = ["VOR", "VOR-DME", "VORTAC", "DME", "NDB", "NDB-DME", "TACAN"];

export interface Navaid {
  index: number;
  ident: string;
  name: string;
  type: NavaidType;
  /** VOR/DME frequency in MHz (e.g. 115.8) or NDB frequency in kHz. */
  freqMhz: number;
  freqKhz: number;
  lat: number;
  lon: number;
  elevFt: number;
  /** Station declination used for its radials (east positive); null if unknown. */
  magVar: number | null;
  hasVor: boolean;
  hasDme: boolean;
  isNdb: boolean;
  /** Nominal service range, nm (from the published usage class; simplified). */
  rangeNm: number;
}

interface RawAirports {
  meta: { v: number; generated: string; source: string; counts: Record<string, number> };
  countries: Record<string, string>;
  ident: string[];
  icao: string[];
  iata: string[];
  name: string[];
  city: string[];
  country: string[];
  type: number[];
  lat: number[];
  lon: number[];
  elev: (number | null)[];
  rw0: number[];
  rwn: number[];
}
interface RawRunways {
  ap: number[];
  len: number[];
  wid: number[];
  surf: number[];
  lit: number[];
  est: number[];
  aId: string[];
  aLat: number[];
  aLon: number[];
  aElev: (number | null)[];
  aHdg: number[];
  aDisp: number[];
  bId: string[];
  bLat: number[];
  bLon: number[];
  bElev: (number | null)[];
  bHdg: number[];
  bDisp: number[];
}
interface RawFrequencies {
  ap: number[];
  type: string[];
  desc: string[];
  mhz: number[];
}
interface RawNavaids {
  ident: string[];
  name: string[];
  type: number[];
  khz: number[];
  lat: number[];
  lon: number[];
  elev: (number | null)[];
  magVar: (number | null)[];
  usage: string[];
  power: string[];
  ap: number[];
}

export interface RawWorldData {
  airports: RawAirports;
  runways: RawRunways;
  frequencies: RawFrequencies;
  navaids: RawNavaids;
}

const SIZES: AirportSize[] = ["small", "medium", "large"];
const cellKey = (lat: number, lon: number) => (Math.floor(lat) + 90) * 360 + (Math.floor(lon) + 180);

export class WorldData {
  readonly meta: RawAirports["meta"];
  readonly airportCount: number;
  private readonly a: RawAirports;
  private readonly r: RawRunways;
  private readonly f: RawFrequencies;
  private readonly n: RawNavaids;
  private readonly byIdent = new Map<string, number>();
  private readonly airportGrid = new Map<number, number[]>();
  private readonly navaidGrid = new Map<number, number[]>();
  private readonly runwayGrid = new Map<number, number[]>();
  private readonly freqByAirport = new Map<number, number[]>();
  private readonly airportCache = new Map<number, Airport>();
  private readonly runwayCache = new Map<number, Runway>();
  private readonly navaidCache = new Map<number, Navaid>();
  private searchText: string[] | null = null;

  constructor(raw: RawWorldData) {
    this.a = raw.airports;
    this.r = raw.runways;
    this.f = raw.frequencies;
    this.n = raw.navaids;
    this.meta = raw.airports.meta;
    this.airportCount = this.a.ident.length;
    for (let i = 0; i < this.a.ident.length; i++) {
      this.byIdent.set(this.a.ident[i]!.toUpperCase(), i);
      push(this.airportGrid, cellKey(this.a.lat[i]!, this.a.lon[i]!), i);
    }
    // ICAO / IATA codes resolve too, without overriding a primary ident.
    for (let i = 0; i < this.a.ident.length; i++) {
      for (const code of [this.a.icao[i], this.a.iata[i]]) {
        if (code && !this.byIdent.has(code.toUpperCase())) this.byIdent.set(code.toUpperCase(), i);
      }
    }
    for (let i = 0; i < this.n.ident.length; i++) push(this.navaidGrid, cellKey(this.n.lat[i]!, this.n.lon[i]!), i);
    for (let i = 0; i < this.f.ap.length; i++) push(this.freqByAirport, this.f.ap[i]!, i);
    // Runway grid uses 0.1° cells (≈ 6 nm) covering each runway's bounding box, for terrain flattening.
    for (let i = 0; i < this.r.ap.length; i++) {
      const la0 = Math.floor(Math.min(this.r.aLat[i]!, this.r.bLat[i]!) * 10 - 0.05);
      const la1 = Math.floor(Math.max(this.r.aLat[i]!, this.r.bLat[i]!) * 10 + 0.05);
      const lo0 = Math.floor(Math.min(this.r.aLon[i]!, this.r.bLon[i]!) * 10 - 0.05);
      const lo1 = Math.floor(Math.max(this.r.aLon[i]!, this.r.bLon[i]!) * 10 + 0.05);
      if (lo1 - lo0 > 20 || la1 - la0 > 20) continue; // crosses the antimeridian or bad data
      for (let la = la0; la <= la1; la++) for (let lo = lo0; lo <= lo1; lo++) push(this.runwayGrid, la * 4000 + lo, i);
    }
  }

  // ------------------------------------------------------------------ airports

  summary(index: number): AirportSummary {
    const a = this.a;
    return {
      index,
      ident: a.ident[index]!,
      icao: a.icao[index]!,
      iata: a.iata[index]!,
      name: a.name[index]!,
      city: a.city[index]!,
      country: a.country[index]!,
      size: SIZES[a.type[index]!] ?? "small",
      lat: a.lat[index]!,
      lon: a.lon[index]!,
      elevFt: a.elev[index] ?? null,
      runwayCount: a.rwn[index]!,
    };
  }

  airportByIndex(index: number): Airport | undefined {
    if (index < 0 || index >= this.airportCount) return undefined;
    let ap = this.airportCache.get(index);
    if (!ap) {
      const s = this.summary(index);
      const runways: Runway[] = [];
      for (let k = this.a.rw0[index]!; k < this.a.rw0[index]! + this.a.rwn[index]!; k++) runways.push(this.runway(k));
      const frequencies = (this.freqByAirport.get(index) ?? []).map((k) => ({ type: this.f.type[k]!, description: this.f.desc[k]!, mhz: this.f.mhz[k]! }));
      ap = { ...s, countryName: this.a.countries[s.country] ?? s.country, runways, frequencies };
      this.airportCache.set(index, ap);
    }
    return ap;
  }

  /** Look up by OurAirports ident, ICAO or IATA code (case-insensitive). */
  getAirport(code: string): Airport | undefined {
    const i = this.byIdent.get(code.trim().toUpperCase());
    return i === undefined ? undefined : this.airportByIndex(i);
  }

  runway(index: number): Runway {
    let rw = this.runwayCache.get(index);
    if (!rw) {
      const r = this.r;
      const surface = SURFACES[r.surf[index]!] ?? "unknown";
      const end = (id: string[], lat: number[], lon: number[], elev: (number | null)[], hdg: number[], disp: number[]): RunwayEnd => ({
        id: id[index]!,
        lat: lat[index]!,
        lon: lon[index]!,
        elevFt: elev[index] ?? null,
        headingTrue: hdg[index]!,
        displacedFt: disp[index] ?? 0,
      });
      const a = end(r.aId, r.aLat, r.aLon, r.aElev, r.aHdg, r.aDisp);
      const b = end(r.bId, r.bLat, r.bLon, r.bElev, r.bHdg, r.bDisp);
      rw = {
        index,
        airportIndex: r.ap[index]!,
        name: `${a.id}/${b.id}`,
        lengthFt: r.len[index]!,
        widthFt: r.wid[index]!,
        surface,
        paved: surface === "asphalt" || surface === "concrete",
        lighted: r.lit[index] === 1,
        estimated: r.est[index] === 1,
        ends: [a, b],
      };
      this.runwayCache.set(index, rw);
    }
    return rw;
  }

  /**
   * Search by ident / ICAO / IATA / name / city. Exact code matches first, then prefixes,
   * then word matches; larger airports rank higher within each group.
   */
  searchAirports(query: string, limit = 25): AirportSummary[] {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    if (!this.searchText) {
      const a = this.a;
      this.searchText = a.ident.map((id, i) => `${id}|${a.icao[i]}|${a.iata[i]}|${a.name[i]}|${a.city[i]}|${a.countries[a.country[i]!] ?? ""}`.toLowerCase());
    }
    const words = q.split(/\s+/).filter(Boolean);
    const scored: { i: number; s: number }[] = [];
    const a = this.a;
    for (let i = 0; i < this.searchText.length; i++) {
      const t = this.searchText[i]!;
      let ok = true;
      for (const w of words) {
        if (!t.includes(w)) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
      const ident = a.ident[i]!.toLowerCase();
      const icao = a.icao[i]!.toLowerCase();
      const iata = a.iata[i]!.toLowerCase();
      let s = a.type[i]! * 10 + (a.rwn[i]! > 0 ? 5 : 0);
      if (ident === q || icao === q || iata === q) s += 1000;
      else if (ident.startsWith(q) || icao.startsWith(q)) s += 300;
      const name = a.name[i]!.toLowerCase();
      const city = a.city[i]!.toLowerCase();
      if (city === q) s += 120;
      else if (city.startsWith(q)) s += 80;
      if (name.startsWith(q)) s += 60;
      scored.push({ i, s });
    }
    scored.sort((x, y) => y.s - x.s || a.name[x.i]!.localeCompare(a.name[y.i]!));
    return scored.slice(0, limit).map((x) => this.summary(x.i));
  }

  /** Airports within radiusNm, nearest first. */
  airportsNear(lat: number, lon: number, radiusNm: number, opts: { withRunwaysOnly?: boolean } = {}): (AirportSummary & { distanceNm: number; bearingTrue: number })[] {
    const out: (AirportSummary & { distanceNm: number; bearingTrue: number })[] = [];
    this.forCells(this.airportGrid, lat, lon, radiusNm, (i) => {
      if (opts.withRunwaysOnly && this.a.rwn[i] === 0) return;
      const d = distanceNm(lat, lon, this.a.lat[i]!, this.a.lon[i]!);
      if (d <= radiusNm) out.push({ ...this.summary(i), distanceNm: d, bearingTrue: bearingDeg(lat, lon, this.a.lat[i]!, this.a.lon[i]!) });
    });
    return out.sort((x, y) => x.distanceNm - y.distanceNm);
  }

  nearestAirport(lat: number, lon: number, opts: { withRunwaysOnly?: boolean; maxNm?: number } = {}): (AirportSummary & { distanceNm: number; bearingTrue: number }) | undefined {
    for (const r of [15, 60, 200, opts.maxNm ?? 600]) {
      if (opts.maxNm !== undefined && r > opts.maxNm) break;
      const list = this.airportsNear(lat, lon, r, opts);
      if (list.length) return list[0];
    }
    return undefined;
  }

  /** Runways whose bounding box is within ~marginNm of the point (used for terrain flattening and drawing). */
  runwaysNear(lat: number, lon: number, marginNm = 3): Runway[] {
    const seen = new Set<number>();
    const out: Runway[] = [];
    const dLat = marginNm / 60;
    const dLon = marginNm / 60 / Math.max(0.2, Math.cos((lat * Math.PI) / 180));
    for (let la = Math.floor((lat - dLat) * 10); la <= Math.floor((lat + dLat) * 10); la++) {
      for (let lo = Math.floor((lon - dLon) * 10); lo <= Math.floor((lon + dLon) * 10); lo++) {
        for (const i of this.runwayGrid.get(la * 4000 + lo) ?? []) {
          if (seen.has(i)) continue;
          seen.add(i);
          out.push(this.runway(i));
        }
      }
    }
    return out;
  }

  // ------------------------------------------------------------------ navaids

  navaid(index: number): Navaid {
    let nv = this.navaidCache.get(index);
    if (!nv) {
      const n = this.n;
      const type = NAVTYPES[n.type[index]!] ?? "VOR";
      const usage = n.usage[index] ?? "";
      const isNdb = type === "NDB" || type === "NDB-DME";
      // Simplified standard service volumes: terminal 25 nm, low 40 nm, high 130 nm; NDB by power.
      const rangeNm = isNdb ? (n.power[index] === "HIGH" ? 75 : n.power[index] === "LOW" ? 25 : 50) : usage === "TERMINAL" ? 25 : usage === "HI" || usage === "BOTH" ? 130 : 40;
      nv = {
        index,
        ident: n.ident[index]!,
        name: n.name[index]!,
        type,
        freqKhz: n.khz[index]!,
        freqMhz: isNdb ? n.khz[index]! : n.khz[index]! / 1000,
        lat: n.lat[index]!,
        lon: n.lon[index]!,
        elevFt: n.elev[index] ?? 0,
        magVar: n.magVar[index] ?? null,
        hasVor: type === "VOR" || type === "VOR-DME" || type === "VORTAC",
        hasDme: type === "VOR-DME" || type === "VORTAC" || type === "DME" || type === "NDB-DME" || type === "TACAN",
        isNdb,
        rangeNm,
      };
      this.navaidCache.set(index, nv);
    }
    return nv;
  }

  navaidsNear(lat: number, lon: number, radiusNm: number): (Navaid & { distanceNm: number; bearingTrue: number })[] {
    const out: (Navaid & { distanceNm: number; bearingTrue: number })[] = [];
    this.forCells(this.navaidGrid, lat, lon, radiusNm, (i) => {
      const d = distanceNm(lat, lon, this.n.lat[i]!, this.n.lon[i]!);
      if (d <= radiusNm) out.push({ ...this.navaid(i), distanceNm: d, bearingTrue: bearingDeg(lat, lon, this.n.lat[i]!, this.n.lon[i]!) });
    });
    return out.sort((x, y) => x.distanceNm - y.distanceNm);
  }

  private forCells(grid: Map<number, number[]>, lat: number, lon: number, radiusNm: number, fn: (index: number) => void) {
    const dLat = radiusNm / 60;
    const dLon = Math.min(180, radiusNm / 60 / Math.max(0.05, Math.cos((lat * Math.PI) / 180)));
    const la0 = Math.max(-90, Math.floor(lat - dLat));
    const la1 = Math.min(89, Math.floor(lat + dLat));
    for (let la = la0; la <= la1; la++) {
      for (let lo = Math.floor(lon - dLon); lo <= Math.floor(lon + dLon); lo++) {
        const wrapped = Math.floor(norm180(lo + 0.5));
        for (const i of grid.get((la + 90) * 360 + (wrapped + 180)) ?? []) fn(i);
      }
    }
  }
}

function push(map: Map<number, number[]>, key: number, value: number) {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

let loading: Promise<WorldData> | null = null;

/** Download (once) and index the world database. `baseUrl` defaults to the app's own /data/ folder. */
export function loadWorldData(baseUrl: string = `${import.meta.env.BASE_URL}data/`): Promise<WorldData> {
  if (!loading) {
    const get = async <T>(name: string): Promise<T> => {
      const res = await fetch(baseUrl + name);
      if (!res.ok) throw new Error(`Could not load ${name} (HTTP ${res.status})`);
      return (await res.json()) as T;
    };
    loading = Promise.all([get<RawAirports>("airports.json"), get<RawRunways>("runways.json"), get<RawFrequencies>("frequencies.json"), get<RawNavaids>("navaids.json")])
      .then(([airports, runways, frequencies, navaids]) => new WorldData({ airports, runways, frequencies, navaids }))
      .catch((e: unknown) => {
        loading = null;
        throw e;
      });
  }
  return loading;
}
