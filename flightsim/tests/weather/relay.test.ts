/**
 * The Vercel Edge Function /api/metar (repository root: api/metar.ts) with a pretend upstream.
 * The upstream answers are real aviationweather.gov answers saved in tests/weather/fixtures.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import handler, { config } from "../../../api/metar";
import { relayToObservation } from "@/weather/sources";

const fixtures = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");
const text = (name: string) => readFileSync(path.join(fixtures, name), "utf8");
const BBOX_SFO = text("awc-metar-bbox-sfo.json");
const IDS_KSFO = text("awc-metar-ids-ksfo.json");

interface Call {
  url: string;
  headers: Record<string, string>;
}

/** Replace the global fetch by an upstream that answers from a table. */
function upstream(answer: (url: URL) => { status: number; body?: string } | "offline") {
  const calls: Call[] = [];
  vi.stubGlobal("fetch", async (input: string | URL, init?: { headers?: Record<string, string> }) => {
    const url = new URL(String(input));
    calls.push({ url: url.href, headers: init?.headers ?? {} });
    const a = answer(url);
    if (a === "offline") throw new TypeError("fetch failed");
    return new Response(a.status === 204 ? null : (a.body ?? ""), { status: a.status });
  });
  return calls;
}

const get = (query: string, method = "GET") => handler(new Request(`https://sim.example/api/metar${query}`, { method }));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("/api/metar relay", () => {
  it("declares the Edge runtime", () => {
    expect(config).toEqual({ runtime: "edge" });
  });

  it("finds the nearest station to a position with a box of about ±0.75 degrees and identifies itself politely", async () => {
    vi.useFakeTimers({ now: Date.UTC(2026, 10, 15, 3, 20), toFake: ["Date"] });
    const calls = upstream(() => ({ status: 200, body: BBOX_SFO }));
    const res = await get("?lat=37.5136&lon=-122.4996");
    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(res.headers.get("cache-control")).toBe("public, s-maxage=600, stale-while-revalidate=1800");
    expect(res.headers.get("content-type")).toMatch(/^application\/json/);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.icaoId).toBe("KHAF"); // Half Moon Bay is nearest to that point, not San Francisco
    expect(Object.keys(body).sort()).toEqual(["altim", "clouds", "dewp", "elev", "icaoId", "lat", "lon", "name", "obsTime", "rawOb", "temp", "visib", "wdir", "wgst", "wspd", "wxString"]);
    expect(body).toMatchObject({
      name: "Half Moon Bay Arpt, CA, US",
      rawOb: "METAR KHAF 150255Z AUTO 11003KT 6SM BR FEW003 FEW013 SCT019 14/13 A2999 RMK AO2",
      wdir: 110,
      wspd: 3,
      wgst: null,
      visib: 6,
      altim: 1015.7,
      elev: 11,
      wxString: "BR",
      clouds: [
        { cover: "FEW", base: 300 },
        { cover: "FEW", base: 1300 },
        { cover: "SCT", base: 1900 },
      ],
    });

    expect(calls).toHaveLength(1);
    const u = new URL(calls[0]!.url);
    expect(u.origin + u.pathname).toBe("https://aviationweather.gov/api/data/metar");
    expect(u.searchParams.get("format")).toBe("json");
    const [minLat, minLon, maxLat, maxLon] = u.searchParams.get("bbox")!.split(",").map(Number) as [number, number, number, number];
    expect(minLat).toBeCloseTo(37.51 - 0.75, 2);
    expect(maxLat).toBeCloseTo(37.51 + 0.75, 2);
    expect(maxLon - minLon).toBeGreaterThan(1.5); // widened in longitude so the box stays about square on the ground
    expect(maxLon - minLon).toBeLessThan(2.2);
    expect((minLon + maxLon) / 2).toBeCloseTo(-122.5, 1);
    expect(calls[0]!.headers["User-Agent"]).toBe("TeachX-Flight-Simulator (educational; contact via site)");

    // the simulator's own adapter understands the relay's answer
    const obs = relayToObservation(body, Date.UTC(2026, 10, 15, 3, 20))!;
    expect(obs.stationId).toBe("KHAF");
    expect(obs.visibilitySm).toBe(6);
  });

  it("passes on a variable wind as 'VRB' and visibility 'or more' as text", async () => {
    upstream(() => ({ status: 200, body: BBOX_SFO }));
    const body = (await (await get("?lat=37.66&lon=-122.12")).json()) as Record<string, unknown>;
    expect(body.icaoId).toBe("KHWD");
    expect(body.wdir).toBe("VRB");
    expect(body.visib).toBe("10+");
    expect(body.clouds).toEqual([]);
  });

  it("looks a station up by identifier", async () => {
    const calls = upstream(() => ({ status: 200, body: IDS_KSFO }));
    const res = await get("?ids=ksfo");
    expect(res.status).toBe(200);
    expect(((await res.json()) as { icaoId: string }).icaoId).toBe("KSFO");
    expect(new URL(calls[0]!.url).searchParams.get("ids")).toBe("KSFO");
    expect(calls).toHaveLength(1);
  });

  it("falls back from an identifier without a report to the nearest station of the position", async () => {
    const calls = upstream((u) => (u.searchParams.has("ids") ? { status: 204 } : { status: 200, body: BBOX_SFO }));
    const res = await get("?ids=KZZZ&lat=37.62&lon=-122.37");
    expect(res.status).toBe(200);
    expect(((await res.json()) as { icaoId: string }).icaoId).toBe("KSFO");
    expect(calls.map((c) => (new URL(c.url).searchParams.has("ids") ? "ids" : "bbox"))).toEqual(["ids", "bbox"]);
  });

  it("widens the box once (to about ±2.5 degrees) when the first is empty, then gives up with a cacheable 404", async () => {
    const calls = upstream(() => ({ status: 204 }));
    const res = await get("?lat=-49.5&lon=-139.5");
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: "no-station" });
    expect(res.headers.get("cache-control")).toBe("public, s-maxage=600, stale-while-revalidate=1800");
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(calls).toHaveLength(2);
    const span = (c: Call) => {
      const [a, , b] = new URL(c.url).searchParams.get("bbox")!.split(",").map(Number) as [number, number, number, number];
      return b - a;
    };
    expect(span(calls[0]!)).toBeCloseTo(1.5, 2);
    expect(span(calls[1]!)).toBeCloseTo(5, 2);

    // found only in the wider box
    const calls2 = upstream((u) => {
      const [a, , b] = u.searchParams.get("bbox")!.split(",").map(Number) as [number, number, number, number];
      return b - a > 2 ? { status: 200, body: BBOX_SFO } : { status: 200, body: "[]" };
    });
    const res2 = await get("?lat=36.2&lon=-121.5");
    expect(res2.status).toBe(200);
    expect(((await res2.json()) as { icaoId: string }).icaoId).toBe("KWVI");
    expect(calls2).toHaveLength(2);
  });

  it("prefers a fresh report over a nearer stale one", async () => {
    vi.useFakeTimers({ now: Date.UTC(2026, 10, 15, 3, 20), toFake: ["Date"] });
    const list = JSON.parse(BBOX_SFO) as { icaoId: string; obsTime: number }[];
    for (const e of list) if (e.icaoId === "KSFO") e.obsTime -= 6 * 3600;
    upstream(() => ({ status: 200, body: JSON.stringify(list) }));
    const body = (await (await get("?lat=37.6196&lon=-122.3656")).json()) as { icaoId: string };
    expect(body.icaoId).not.toBe("KSFO");
    expect(body.icaoId).toBe("KSQL"); // the next nearest
  });

  it("validates its inputs and never forwards anything it did not check", async () => {
    const calls = upstream(() => ({ status: 200, body: BBOX_SFO }));
    for (const bad of ["", "?lat=37.6", "?lon=-122", "?lat=abc&lon=def", "?lat=91&lon=0", "?lat=37.6&lon=1e9", "?lat=37.6&lon=-122.4;x", "?ids=KS", "?ids=KSFO,KOAK", "?ids=../../etc", "?ids=K%20FO", "?lat=NaN&lon=NaN", "?lat=&lon="]) {
      const res = await get(bad);
      expect(res.status, bad).toBe(400);
      expect(res.headers.get("access-control-allow-origin")).toBe("*");
      expect(((await res.json()) as { error: string }).error).toBe("bad-request");
    }
    expect(calls).toHaveLength(0);

    // precise positions are rounded to two decimals; a longitude beyond ±180 is wrapped
    await get("?lat=37.619612345&lon=237.63442");
    const [minLat, minLon, maxLat, maxLon] = new URL(calls[0]!.url).searchParams.get("bbox")!.split(",").map(Number) as [number, number, number, number];
    expect((minLat + maxLat) / 2).toBeCloseTo(37.62, 2);
    expect((minLon + maxLon) / 2).toBeCloseTo(-122.37, 2);
    for (const c of calls) expect(c.url).toMatch(/^https:\/\/aviationweather\.gov\/api\/data\/metar\?bbox=-?\d+\.\d\d,-?\d+\.\d\d,-?\d+\.\d\d,-?\d+\.\d\d&format=json$/);
  });

  it("keeps the search box inside the map near the poles and the date line", async () => {
    const calls = upstream(() => ({ status: 204 }));
    await get("?lat=89.9&lon=179.9");
    for (const c of calls) {
      const [minLat, minLon, maxLat, maxLon] = new URL(c.url).searchParams.get("bbox")!.split(",").map(Number) as [number, number, number, number];
      expect(minLat).toBeGreaterThanOrEqual(-90);
      expect(maxLat).toBeLessThanOrEqual(90);
      expect(minLon).toBeGreaterThanOrEqual(-180);
      expect(maxLon).toBeLessThanOrEqual(180);
      expect(maxLat).toBeGreaterThan(minLat);
      expect(maxLon).toBeGreaterThan(minLon);
    }
  });

  it("answers 502 (cached only briefly) when the upstream fails, is unreachable or sends rubbish", async () => {
    for (const a of [{ status: 500, body: "oops" }, { status: 429, body: "slow down" }, "offline" as const, { status: 200, body: "<html>not json</html>" }]) {
      upstream(() => a);
      const res = await get("?lat=37.6&lon=-122.4");
      expect(res.status).toBe(502);
      expect(((await res.json()) as { error: string }).error).toBe("upstream-unavailable");
      expect(res.headers.get("cache-control")).toBe("public, s-maxage=30");
      expect(res.headers.get("access-control-allow-origin")).toBe("*");
    }
  });

  it("ignores entries that are not station reports", async () => {
    upstream(() => ({ status: 200, body: JSON.stringify([null, 5, "x", { icaoId: 12 }, { icaoId: "KAAA" }, { icaoId: "KBBB", lat: 37.7, lon: -122.3, obsTime: 1, rawOb: "METAR KBBB" }]) }));
    const res = await get("?lat=37.6&lon=-122.4");
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.icaoId).toBe("KBBB"); // KAAA has no position
    expect(body.temp).toBeNull();
    expect(body.clouds).toEqual([]);
  });

  it("answers pre-flight requests and refuses other methods", async () => {
    const calls = upstream(() => ({ status: 200, body: BBOX_SFO }));
    const options = await get("?lat=1&lon=2", "OPTIONS");
    expect(options.status).toBe(204);
    expect(options.headers.get("access-control-allow-origin")).toBe("*");
    expect(options.headers.get("access-control-allow-methods")).toContain("GET");
    const post = await get("?lat=1&lon=2", "POST");
    expect(post.status).toBe(405);
    expect(calls).toHaveLength(0);
    expect((await get("?lat=37.6&lon=-122.4", "HEAD")).status).toBe(200);
  });
});
