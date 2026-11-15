/**
 * TeachX Flight Simulator — weather relay (Vercel Edge Function, served at /api/metar).
 *
 * Why it exists: aviationweather.gov (the US Aviation Weather Center, free, no key) publishes the
 * airport weather reports (METAR) of the whole world, but its Data API sends no CORS header, so a
 * web page cannot call it directly. This small relay asks it on the page's behalf and passes the
 * answer on in a compact form.
 *
 *   GET /api/metar?lat=37.6&lon=-122.4          nearest reporting station to a position
 *   GET /api/metar?ids=KSFO                     one station by its ICAO identifier
 *   GET /api/metar?ids=KSFO&lat=37.6&lon=-122.4 that station, or the nearest one if it has no report
 *
 * Good manners toward the upstream service (its limit is 100 requests a minute):
 *  - answers are cached by Vercel's network for 10 minutes (s-maxage=600), so the upstream sees at
 *    most one request per place per ten minutes however many people fly there;
 *  - it identifies itself with a descriptive User-Agent;
 *  - inputs are validated and clamped; nothing else is passed through.
 *
 * Self-contained on purpose: no imports, Web-standard Request / Response only.
 */
export const config = { runtime: "edge" };

const UPSTREAM = "https://aviationweather.gov/api/data/metar";
const USER_AGENT = "TeachX-Flight-Simulator (educational; contact via site)";
const CACHE_OK = "public, s-maxage=600, stale-while-revalidate=1800";
const UPSTREAM_TIMEOUT_MS = 8000;
/** Half-size of the search box, degrees of latitude: first try, then one wider try. */
const BOX_DEG = [0.75, 2.5] as const;
/** A report older than this is passed over when a fresher one is nearby, seconds. */
const STALE_S = 3 * 3600;

/** What the relay returns for one station. */
export interface RelayMetar {
  icaoId: string;
  name: string | null;
  /** The report text. */
  rawOb: string | null;
  /** Observation time, seconds since 1970 (UTC). */
  obsTime: number | null;
  /** °C */
  temp: number | null;
  dewp: number | null;
  /** Degrees true, or "VRB" for a variable wind. */
  wdir: number | "VRB" | null;
  /** Knots. */
  wspd: number | null;
  wgst: number | null;
  /** Statute miles; a string such as "10+" or "6+" means "this or more". */
  visib: number | string | null;
  /** Altimeter setting, hPa. */
  altim: number | null;
  /** Cloud layers; base in feet above the station. */
  clouds: { cover: string; base: number | null }[];
  lat: number | null;
  lon: number | null;
  /** Station elevation, metres. */
  elev: number | null;
  /** Present weather, e.g. "-RA BR". */
  wxString: string | null;
}

/** One entry of the upstream answer: nothing is trusted until checked. */
interface Obj {
  icaoId?: unknown;
  name?: unknown;
  rawOb?: unknown;
  obsTime?: unknown;
  temp?: unknown;
  dewp?: unknown;
  wdir?: unknown;
  wspd?: unknown;
  wgst?: unknown;
  visib?: unknown;
  altim?: unknown;
  clouds?: unknown;
  lat?: unknown;
  lon?: unknown;
  elev?: unknown;
  wxString?: unknown;
  cover?: unknown;
  base?: unknown;
}
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const text = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v.slice(0, 400) : null);

function json(status: number, body: unknown, cacheControl: string): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": cacheControl,
    },
  });
}

/** A number from a query parameter; null when missing or not a plain decimal number. */
function queryNumber(value: string | null): number | null {
  if (value === null || !/^\s*[-+]?\d{1,3}(\.\d{1,15})?\s*$/.test(value)) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function distanceNm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const r = Math.PI / 180;
  const a = Math.sin(((lat2 - lat1) * r) / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(((lon2 - lon1) * r) / 2) ** 2;
  return 2 * 3440.065 * Math.asin(Math.min(1, Math.sqrt(a)));
}

function compact(e: Obj): RelayMetar | null {
  const icaoId = text(e.icaoId);
  if (!icaoId) return null;
  const clouds: RelayMetar["clouds"] = [];
  if (Array.isArray(e.clouds)) {
    for (const c of e.clouds.slice(0, 8)) {
      if (isObj(c) && typeof c.cover === "string") clouds.push({ cover: c.cover.slice(0, 8), base: num(c.base) });
    }
  }
  const visib = typeof e.visib === "string" ? e.visib.slice(0, 8) : num(e.visib);
  return {
    icaoId: icaoId.slice(0, 8),
    name: text(e.name),
    rawOb: text(e.rawOb),
    obsTime: num(e.obsTime),
    temp: num(e.temp),
    dewp: num(e.dewp),
    wdir: e.wdir === "VRB" ? "VRB" : num(e.wdir),
    wspd: num(e.wspd),
    wgst: num(e.wgst),
    visib,
    altim: num(e.altim),
    clouds,
    lat: num(e.lat),
    lon: num(e.lon),
    elev: num(e.elev),
    wxString: text(e.wxString),
  };
}

/** Ask aviationweather.gov. Resolves with the list of reports (empty when it has none); rejects when it cannot be reached or answers with an error. */
async function upstream(query: string): Promise<Obj[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const res = await fetch(`${UPSTREAM}?${query}&format=json`, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      signal: controller.signal,
    });
    if (res.status === 204) return []; // "no content": nothing reported there
    if (!res.ok) throw new Error(`upstream answered ${res.status}`);
    const body = await res.text();
    if (!body.trim()) return [];
    const data: unknown = JSON.parse(body);
    return Array.isArray(data) ? data.filter(isObj) : [];
  } finally {
    clearTimeout(timer);
  }
}

/** The report to use from a list: the nearest to the position that is not stale (or simply the newest when no position is given). */
function pick(list: Obj[], lat: number | null, lon: number | null, nowS: number): RelayMetar | null {
  let best: RelayMetar | null = null;
  let bestScore = Infinity;
  for (const e of list) {
    const m = compact(e);
    if (!m) continue;
    const stale = m.obsTime !== null && nowS - m.obsTime > STALE_S;
    let score: number;
    if (lat !== null && lon !== null) {
      if (m.lat === null || m.lon === null) continue;
      score = distanceNm(lat, lon, m.lat, m.lon) + (stale ? 1000 : 0);
    } else {
      score = -(m.obsTime ?? 0);
    }
    if (score < bestScore) {
      bestScore = score;
      best = m;
    }
  }
  return best;
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, OPTIONS", "Access-Control-Max-Age": "86400" },
    });
  }
  if (req.method !== "GET" && req.method !== "HEAD") {
    return json(405, { error: "method-not-allowed", message: "Use GET." }, "no-store");
  }

  let params: URLSearchParams;
  try {
    params = new URL(req.url).searchParams;
  } catch {
    return json(400, { error: "bad-request", message: "The address could not be read." }, "public, s-maxage=3600");
  }

  // ---- inputs: one ICAO identifier and/or a position
  const idRaw = (params.get("ids") ?? "").trim().toUpperCase();
  const id = /^[A-Z][A-Z0-9]{3}$/.test(idRaw) ? idRaw : null;
  const latRaw = queryNumber(params.get("lat"));
  const lonRaw = queryNumber(params.get("lon"));
  let lat: number | null = null;
  let lon: number | null = null;
  if (latRaw !== null && lonRaw !== null && Math.abs(latRaw) <= 90 && Math.abs(lonRaw) <= 360) {
    // two decimals (about half a mile) is plenty to find the nearest station
    lat = Math.round(latRaw * 100) / 100;
    lon = Math.round(((((lonRaw + 180) % 360) + 360) % 360 - 180) * 100) / 100;
  }
  if (!id && (lat === null || lon === null)) {
    return json(
      400,
      { error: "bad-request", message: "Give a position (?lat=37.6&lon=-122.4) or one four-character ICAO station identifier (?ids=KSFO)." },
      "public, s-maxage=3600",
    );
  }

  const nowS = Date.now() / 1000;
  try {
    let found: RelayMetar | null = null;
    if (id) {
      const list = await upstream(`ids=${id}`);
      found = pick(
        list.filter((e) => e.icaoId === id),
        null,
        null,
        nowS,
      );
    }
    if (!found && lat !== null && lon !== null) {
      for (const half of BOX_DEG) {
        // keep the box roughly square on the ground: degrees of longitude shrink toward the poles
        const halfLon = Math.min(half * 4, half / Math.max(0.05, Math.cos((lat * Math.PI) / 180)));
        const minLat = Math.max(-90, lat - half);
        const maxLat = Math.min(90, lat + half);
        const minLon = Math.max(-180, lon - halfLon);
        const maxLon = Math.min(180, lon + halfLon);
        const list = await upstream(`bbox=${minLat.toFixed(2)},${minLon.toFixed(2)},${maxLat.toFixed(2)},${maxLon.toFixed(2)}`);
        found = pick(list, lat, lon, nowS);
        if (found) break;
      }
    }
    if (!found) {
      return json(404, { error: "no-station", message: "No airport weather report was found for this place." }, CACHE_OK);
    }
    return json(200, found, CACHE_OK);
  } catch {
    // do not hammer a service that is having trouble: remember the failure briefly
    return json(502, { error: "upstream-unavailable", message: "aviationweather.gov could not be reached just now." }, "public, s-maxage=30");
  }
}
