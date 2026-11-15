/**
 * loadRealWeather with a pretend network: the order of the sources, falling through when one is
 * missing or silent, time limits, the ten-minute cache and the "ask each source only once" rule.
 * The answers the pretend network gives are the REAL ones saved in tests/weather/fixtures.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createWeather, type FetchLike } from "@/weather";

const fixtures = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");
const load = (name: string): unknown => JSON.parse(readFileSync(path.join(fixtures, name), "utf8"));
const awc = (file: string, id: string) => (load(file) as { icaoId: string }[]).find((e) => e.icaoId === id);

const RELAY = "https://sim.example/app/api/metar";
const T0 = Date.UTC(2026, 10, 15, 3, 20); // the fixtures were recorded just before this
const MIN = 60_000;

type Answer = { status: number; body?: unknown; notJson?: boolean } | "hang" | "offline";
type Router = (url: string) => Answer;

function network(router: Router) {
  const calls: string[] = [];
  const headers: Record<string, string>[] = [];
  const fetch: FetchLike = (url, init) => {
    calls.push(url);
    headers.push(init?.headers ?? {});
    const a = router(url);
    if (a === "hang") return new Promise(() => undefined);
    if (a === "offline") return Promise.reject(new TypeError("Failed to fetch"));
    return Promise.resolve({
      ok: a.status >= 200 && a.status < 300,
      status: a.status,
      json: async () => {
        if (a.notJson) throw new SyntaxError("Unexpected token '<'");
        return a.body;
      },
    });
  };
  const count = (part: string) => calls.filter((c) => c.includes(part)).length;
  return { fetch, calls, headers, count };
}

const isRelay = (u: string) => u.startsWith(RELAY);
const isNws = (u: string) => u.startsWith("https://api.weather.gov/");
const isOpenMeteo = (u: string) => u.startsWith("https://api.open-meteo.com/");
const HTML_404: Answer = { status: 404, notJson: true };

/** A world where everything works: the relay knows KSFO, the weather service knows the Bay Area, the model knows everything. */
const allGood: Router = (u) => {
  if (isRelay(u)) return { status: 200, body: awc("awc-metar-bbox-sfo.json", "KSFO") };
  if (u.includes("/points/")) return { status: 200, body: load("nws-points-ksfo.json") };
  if (u.includes("/gridpoints/")) return { status: 200, body: load("nws-stations-ksfo.json") };
  if (u.includes("/stations/KHAF/")) return { status: 200, body: load("nws-obs-khaf.json") };
  if (u.includes("/stations/KSFO/")) return { status: 200, body: load("nws-obs-ksfo.json") };
  if (isNws(u)) return { status: 404, body: { title: "Not Found" } };
  if (isOpenMeteo(u)) return { status: 200, body: load("open-meteo-egll.json") };
  return HTML_404;
};

function setup(router: Router, opts: { relayUrl?: string | null; timeoutMs?: number; persist?: boolean } = {}) {
  const net = network(router);
  const clock = { t: T0 };
  const weather = createWeather({ fetch: net.fetch, now: () => clock.t, relayUrl: opts.relayUrl === undefined ? RELAY : opts.relayUrl, timeoutMs: opts.timeoutMs ?? 2000, persist: opts.persist ?? false });
  return { weather, net, clock };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("loadRealWeather — the sources in order", () => {
  it("uses the relay first: one METAR request plus one winds-aloft request", async () => {
    const { weather, net } = setup(allGood);
    let notified = 0;
    weather.subscribe(() => notified++);
    const r = await weather.loadRealWeather(37.6196, -122.3656, "KSFO");
    expect(r.ok).toBe(true);
    expect(r.source).toBe("metar");
    expect(r.stationId).toBe("KSFO");
    expect(r.distanceNm).toBeLessThan(0.5);
    expect(r.raw).toMatch(/^METAR KSFO 150256Z 00000KT 10SM BKN180 BKN200 16\/11 A2998/);
    expect(r.ageMinutes).toBe(24);
    expect(r.message).toContain("San Francisco Intl, CA, US (KSFO)");
    expect(r.message).toContain("24 minutes ago");
    expect(r.message).toContain("aviationweather.gov");
    expect(net.calls).toHaveLength(2);
    expect(net.calls[0]).toBe(`${RELAY}?ids=KSFO&lat=37.6&lon=-122.4`);
    expect(net.calls[1]).toContain("https://api.open-meteo.com/v1/forecast?latitude=37.62&longitude=-122.37&current=wind_speed_10m");
    // nothing but a plain Accept header is sent (anything else would trigger a CORS pre-flight in browsers)
    for (const h of net.headers) expect(Object.keys(h)).toEqual(["Accept"]);

    const env = weather.env;
    expect(env.source).toBe("metar");
    expect(env.stationId).toBe("KSFO");
    expect(env.rawReport).toBe(r.raw);
    expect(env.observedAtMs).toBe(1794711360 * 1000);
    expect(env.stationElevFt).toBeCloseTo(6.56, 1);
    expect(env.qnhInHg).toBeCloseTo(29.98, 2);
    expect(env.clouds.map((c) => [c.cover, c.baseFtMsl])).toEqual([
      ["BKN", 18007],
      ["BKN", 20007],
    ]);
    expect(env.wind[0]).toMatchObject({ altFtMsl: env.stationElevFt, kt: 0 });
    expect(env.wind[env.wind.length - 1]).toEqual({ altFtMsl: 13481, dirTrue: 219, kt: 21.2 }); // real winds aloft from the model
    expect(r.message).toContain("Winds above the ground come from the Open-Meteo forecast model.");
    expect(notified).toBe(1);
    expect(weather.flightCategory()).toBe("VFR");
  });

  it("falls through quietly when there is no relay (404 page), to the US weather service", async () => {
    const { weather, net } = setup((u) => (isRelay(u) ? HTML_404 : allGood(u)));
    const r = await weather.loadRealWeather(37.6196, -122.3656, "KSFO");
    expect(r.ok).toBe(true);
    expect(r.source).toBe("nws");
    expect(r.stationId).toBe("KSFO");
    expect(r.message).toContain("US National Weather Service");
    expect(net.calls.map((c) => c.split("?")[0])).toEqual([RELAY, "https://api.weather.gov/stations/KSFO/observations/latest", "https://api.open-meteo.com/v1/forecast"]);
    // this observation had no wind: the model's surface wind is used and the message says so
    expect(weather.env.wind[0]).toMatchObject({ dirTrue: 123, kt: 3.1 });
    expect(r.message).toContain("did not report wind");
    expect(weather.env.source).toBe("nws");

    // the missing relay is remembered: another airport does not probe it again
    const r2 = await weather.loadRealWeather(37.5136, -122.4996, "KHAF");
    expect(r2.ok).toBe(true);
    expect(r2.stationId).toBe("KHAF");
    expect(r2.raw).toContain("KHAF 150235Z AUTO 00000KT 6SM BR");
    expect(net.count(RELAY)).toBe(1);
  });

  it("treats a web page answered with status 200 (a server that serves the app for every address) as 'no relay'", async () => {
    const { weather, net } = setup((u) => (isRelay(u) ? { status: 200, notJson: true } : allGood(u)));
    const r = await weather.loadRealWeather(37.6196, -122.3656, "KSFO");
    expect(r.ok).toBe(true);
    expect(r.source).toBe("nws");
    expect(net.count(RELAY)).toBe(1);
  });

  it("without an airport: asks the weather service for the stations near the point and takes the nearest airport that answers", async () => {
    const { weather, net } = setup((u) => {
      if (u.includes("/stations/KSFO/")) return { status: 404, body: { title: "Not Found" } };
      return allGood(u);
    }, { relayUrl: null });
    const r = await weather.loadRealWeather(37.55, -122.45);
    expect(r.ok).toBe(true);
    expect(r.source).toBe("nws");
    expect(r.stationId).toBe("KHAF");
    expect(r.distanceNm).toBeGreaterThan(2);
    expect(r.distanceNm).toBeLessThan(6);
    expect(r.message).toContain("4 nm away");
    expect(r.message).not.toContain("a long way from here");
    expect(net.calls.map((c) => c.split("?")[0])).toEqual([
      "https://api.weather.gov/points/37.55,-122.45",
      "https://api.weather.gov/gridpoints/MTR/85,98/stations",
      "https://api.weather.gov/stations/KSFO/observations/latest",
      "https://api.weather.gov/stations/KHAF/observations/latest",
      "https://api.open-meteo.com/v1/forecast",
    ]);
    expect(net.calls[1]).toContain("limit=12");
  });

  it("outside the USA: skips the US service without calling it and uses the Open-Meteo model, saying so", async () => {
    const { weather, net } = setup((u) => (isRelay(u) ? HTML_404 : allGood(u)));
    const r = await weather.loadRealWeather(51.477, -0.461, "EGLL");
    expect(r.ok).toBe(true);
    expect(r.source).toBe("open-meteo");
    expect(r.stationId).toBeUndefined();
    expect(r.raw).toBeUndefined();
    expect(r.message).toMatch(/Open-Meteo computer forecast model/);
    expect(r.message).toMatch(/not a measurement at the airport/);
    expect(net.count("api.weather.gov")).toBe(0);
    expect(net.calls).toHaveLength(2); // relay probe + ONE Open-Meteo request (weather and winds aloft together)
    expect(net.calls[1]).toContain("current=temperature_2m");
    expect(weather.env.source).toBe("open-meteo");
    expect(weather.env.stationId).toBeUndefined();
    expect(weather.env.rawReport).toBeUndefined();
    expect(weather.env.wind.length).toBeGreaterThan(3);
  });

  it("when the relay has no station for the place (its own JSON 404) the next source is asked", async () => {
    const { weather, net } = setup((u) => (isRelay(u) ? { status: 404, body: { error: "no-station", message: "none" } } : allGood(u)));
    const r = await weather.loadRealWeather(51.477, -0.461);
    expect(r.ok).toBe(true);
    expect(r.source).toBe("open-meteo");
    // … and the relay is still considered present for other places
    await weather.loadRealWeather(48.1, 11.6);
    expect(net.count(RELAY)).toBe(2);
  });

  it("estimates the winds aloft when the model cannot be reached, and says so", async () => {
    const { weather } = setup((u) => (isOpenMeteo(u) ? "offline" : allGood(u)));
    const r = await weather.loadRealWeather(37.6196, -122.3656, "KSFO");
    expect(r.ok).toBe(true);
    expect(r.source).toBe("metar");
    expect(r.message).toContain("Winds above the ground are estimated from the surface wind.");
  });

  it("says so when the nearest reporting station is far away", async () => {
    const { weather } = setup(allGood);
    const r = await weather.loadRealWeather(38.4, -121.6); // about 60 nm from San Francisco
    expect(r.ok).toBe(true);
    expect(r.stationId).toBe("KSFO");
    expect(r.distanceNm).toBeGreaterThan(50);
    expect(r.message).toMatch(/, 5\d nm away|, 6\d nm away/);
    expect(r.message).toContain("a long way from here");
  });

  it("warns when the newest report is old", async () => {
    const old = { ...(awc("awc-metar-bbox-sfo.json", "KSFO") as object), obsTime: T0 / 1000 - 5 * 3600 };
    const { weather } = setup((u) => (isRelay(u) ? { status: 200, body: old } : allGood(u)));
    const r = await weather.loadRealWeather(37.6196, -122.3656, "KSFO");
    expect(r.ok).toBe(true);
    expect(r.ageMinutes).toBe(300);
    expect(r.message).toContain("5 hours ago");
    expect(r.message).toContain("This report is old");
  });
});

describe("loadRealWeather — failures never throw and never change the weather", () => {
  it("gives a source about as long as the time limit, then moves on", async () => {
    const { weather, net } = setup((u) => (isRelay(u) || isNws(u) ? "hang" : allGood(u)), { timeoutMs: 40 });
    const t = Date.now();
    const r = await weather.loadRealWeather(37.6196, -122.3656, "KSFO");
    const took = Date.now() - t;
    expect(r.ok).toBe(true);
    expect(r.source).toBe("open-meteo");
    expect(took).toBeGreaterThanOrEqual(70); // two sources timed out
    expect(took).toBeLessThan(5000); // (far above the expected 80 ms so a busy test machine cannot fail it)
    expect(net.count(RELAY)).toBe(1);
    expect(net.count("api.weather.gov")).toBe(1);
  });

  it("reports failure in plain words when nothing answers, and keeps the weather", async () => {
    const { weather } = setup(() => "hang", { timeoutMs: 30 });
    weather.applyPreset("overcast-rain");
    const before = JSON.stringify(weather.env);
    const r = await weather.loadRealWeather(37.6196, -122.3656, "KSFO");
    expect(r.ok).toBe(false);
    expect(r.source).toBe("preset");
    expect(r.message).toMatch(/did not answer/);
    expect(r.message).toMatch(/left as it was/);
    expect(JSON.stringify(weather.env)).toBe(before);
    expect(weather.activePresetId()).toBe("overcast-rain");
  });

  it("survives a network that rejects, answers nonsense, or throws outright", async () => {
    for (const router of [(): Answer => "offline", (): Answer => ({ status: 200, body: { hello: "world" } }), (): Answer => ({ status: 500, notJson: true }), (): Answer => ({ status: 200, body: null })]) {
      const { weather } = setup(router, { timeoutMs: 200 });
      const r = await weather.loadRealWeather(37.6, -122.4, "KSFO");
      expect(r.ok).toBe(false);
      expect(typeof r.message).toBe("string");
      expect(weather.env.source).toBe("preset");
    }
    const exploding = createWeather({
      fetch: () => {
        throw new Error("boom");
      },
      relayUrl: RELAY,
      persist: false,
      timeoutMs: 200,
    });
    await expect(exploding.loadRealWeather(37.6, -122.4)).resolves.toMatchObject({ ok: false });
    const noFetch = createWeather({ fetch: undefined, relayUrl: null, persist: false, now: () => T0 });
    await expect(noFetch.loadRealWeather(Number.NaN, 0)).resolves.toMatchObject({ ok: false });
    await expect(noFetch.loadRealWeather(95, 0)).resolves.toMatchObject({ ok: false });
  });

  it("says so when the services answer but have nothing for the place", async () => {
    const { weather } = setup((u) => {
      if (isRelay(u)) return { status: 404, body: { error: "no-station", message: "none" } };
      if (isNws(u)) return { status: 404, body: load("nws-points-outside-usa-404.json") };
      return { status: 400, body: load("open-meteo-error-400.json") };
    });
    const r = await weather.loadRealWeather(40, -100);
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/No real weather could be found/);
  });

  it("does not apply real weather that arrives after the user chose something else", async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const net = network(allGood);
    const slow: FetchLike = async (url, init) => {
      await gate;
      return net.fetch(url, init);
    };
    const weather = createWeather({ fetch: slow, now: () => T0, relayUrl: RELAY, persist: false });
    const pending = weather.loadRealWeather(37.6196, -122.3656, "KSFO");
    weather.applyPreset("crosswind-10");
    release();
    const r = await pending;
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/Other weather was chosen/);
    expect(weather.env.source).toBe("preset");
    expect(weather.activePresetId()).toBe("crosswind-10");
  });
});

describe("loadRealWeather — cache and usage limits", () => {
  it("answers from the cache for ten minutes without touching the network, then asks again", async () => {
    const { weather, net, clock } = setup(allGood);
    const first = await weather.loadRealWeather(37.6196, -122.3656, "KSFO");
    expect(first.ok).toBe(true);
    expect(net.calls).toHaveLength(2);

    clock.t = T0 + 9 * MIN + 59_000;
    weather.applyPreset("calm-clear");
    const again = await weather.loadRealWeather(37.6196, -122.3656, "KSFO");
    expect(again.ok).toBe(true);
    expect(again.stationId).toBe("KSFO");
    expect(again.ageMinutes).toBe(34); // the age is counted from the observation, not from the download
    expect(weather.env.source).toBe("metar");
    expect(net.calls).toHaveLength(2); // nothing new

    clock.t = T0 + 10 * MIN + 1000;
    const later = await weather.loadRealWeather(37.6196, -122.3656, "KSFO");
    expect(later.ok).toBe(true);
    expect(net.calls).toHaveLength(4);
  });

  it("shares one download between simultaneous requests for the same place", async () => {
    const { weather, net } = setup(allGood);
    const [a, b] = await Promise.all([weather.loadRealWeather(37.6196, -122.3656, "KSFO"), weather.loadRealWeather(37.6196, -122.3656, "KSFO")]);
    expect(net.calls).toHaveLength(2);
    // the later request is the one that counts; the earlier one reports that it was overtaken
    expect(b.ok).toBe(true);
    expect(a.ok).toBe(false);
  });

  it("uses one cache entry per 0.1-degree cell when no airport is named", async () => {
    const { weather, net } = setup(allGood);
    await weather.loadRealWeather(37.61, -122.37);
    const n = net.calls.length;
    await weather.loadRealWeather(37.64, -122.41); // same cell
    expect(net.calls).toHaveLength(n);
    await weather.loadRealWeather(37.9, -122.0); // another cell
    expect(net.calls.length).toBeGreaterThan(n);
  });

  it("after a source did not answer it is left alone for a minute; after it answered 'nothing here', for ten", async () => {
    const offline = setup(() => "offline");
    expect((await offline.weather.loadRealWeather(37.6, -122.4, "KSFO")).ok).toBe(false);
    const n = offline.net.calls.length;
    expect(n).toBe(3); // relay, weather service, model: once each
    const retry = await offline.weather.loadRealWeather(37.6, -122.4, "KSFO");
    expect(retry.ok).toBe(false);
    expect(retry.message).toMatch(/a moment ago/);
    expect(offline.net.calls).toHaveLength(n);
    offline.clock.t = T0 + 61_000;
    await offline.weather.loadRealWeather(37.6, -122.4, "KSFO");
    expect(offline.net.calls).toHaveLength(2 * n);

    const nothing = setup((u) => {
      if (isRelay(u)) return { status: 404, body: { error: "no-station", message: "none" } };
      if (isNws(u)) return { status: 404, body: load("nws-points-outside-usa-404.json") };
      return { status: 400, body: load("open-meteo-error-400.json") };
    });
    await nothing.weather.loadRealWeather(40, -100);
    const m = nothing.net.calls.length;
    nothing.clock.t = T0 + 5 * MIN;
    const r = await nothing.weather.loadRealWeather(40, -100);
    expect(r.ok).toBe(false);
    expect(nothing.net.calls).toHaveLength(m);
    nothing.clock.t = T0 + 10 * MIN + 1;
    await nothing.weather.loadRealWeather(40, -100);
    expect(nothing.net.calls.length).toBeGreaterThan(m);
  });

  it("keeps fetched weather in localStorage so a reload within ten minutes does not ask again", async () => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    });
    const first = setup(allGood, { persist: true });
    expect((await first.weather.loadRealWeather(37.6196, -122.3656, "KSFO")).ok).toBe(true);
    expect([...store.keys()]).toEqual(["skyready.sim.weather.cache.v1"]);

    const reloaded = setup(() => "offline", { persist: true });
    reloaded.clock.t = T0 + 4 * MIN;
    const r = await reloaded.weather.loadRealWeather(37.6196, -122.3656, "KSFO");
    expect(r.ok).toBe(true);
    expect(r.stationId).toBe("KSFO");
    expect(reloaded.net.calls).toHaveLength(0);

    const tooLate = setup(() => "offline", { persist: true });
    tooLate.clock.t = T0 + 11 * MIN;
    expect((await tooLate.weather.loadRealWeather(37.6196, -122.3656, "KSFO")).ok).toBe(false);
    expect(tooLate.net.calls.length).toBeGreaterThan(0);
  });
});
