/**
 * Scenery module: draws the airports around the aircraft — runways with their markings, lights
 * (edge, threshold/end, approach, PAPI, beacon) and windsocks — and, optionally, simple buildings
 * from OpenStreetMap near the aircraft.
 *
 *   const scenery = sim.use(createScenery(world));
 *
 * Level of detail and lifetime: airports within about 12 nm are built (nearest first, the one the
 * aircraft started at or is flying toward gets priority), disposed again beyond about 16 nm. The
 * work is spread over frames with a small time budget so flying past a big hub does not stutter.
 */
import { Cartesian3, Cartesian4, Matrix4 } from "cesium";
import { D2R, M_PER_FT, R2D, angleDiff, bearingDeg, clamp, distanceNm } from "@/core/math";
import type { Sim } from "@/core/sim";
import { daylight, sunPosition } from "@/core/sun";
import type { Quality, SpawnResult } from "@/core/types";
import { aircraftMatrix, type World } from "@/world/world";
import { AirportScenery, type SceneryContext } from "./airport";
import type { PapiReport, SceneryApi, SceneryStats } from "./api";
import { Buildings } from "./buildings";
import { MeshLayer, contextOf } from "./gl";
import { papiMeaning, papiPattern, papiWhiteCount } from "./lights-layout";
import { BUILD_RADIUS_NM, DISPOSE_RADIUS_NM, RUNWAY_CAP, buildPriority, elevationAngleDeg, lightLevel } from "./lod";
import { TextureCache } from "./textures";
import { sockExtension } from "./windsock";

export type { PapiReport, SceneryApi, SceneryStats } from "./api";
export { BUILDINGS_ATTRIBUTION, SCENERY_SYNTHETIC_NOTE } from "./api";
export { BUILD_RADIUS_NM, DISPOSE_RADIUS_NM, RUNWAY_CAP } from "./lod";

/** Time the module may spend building per frame, milliseconds. */
const FRAME_BUDGET_MS = 2.5;
/** Extra time per frame for turning downloaded building tiles into meshes, milliseconds. */
const BUILDINGS_BUDGET_MS = 1.5;
/** Terrain loading is started for at most this many new airports per frame. */
const PREPARES_PER_FRAME = 2;
/** After a spawn the nearest airports are wanted at once: a larger budget for a moment. */
const BURST_BUDGET_MS = 14;
const BURST_SECONDS = 2.5;
/** Default brightness of unlit runway surfaces at night relative to daylight (the globe uses the same value). */
const NIGHT_BRIGHTNESS = 0.3;

const scratchMatrix = new Matrix4();
const scratchA = new Cartesian3();
const scratchB = new Cartesian3();
/** Lamp position relative to the aircraft reference point (nose +X, up +Z), metres. */
const LAMP_OFFSET = new Cartesian3(1.6, 0, -0.2);

class Scenery implements SceneryApi {
  readonly name = "scenery" as const;
  nightBrightness = NIGHT_BRIGHTNESS;
  readonly stats: SceneryStats = { airports: 0, pending: 0, runways: 0, lights: 0, windsocks: 0, buildingTiles: 0, buildings: 0, lastFrameMs: 0, worstFrameMs: 0, worstStepMs: 0, lightLevel: 0 };

  private readonly ctx: SceneryContext;
  private readonly airports = new Map<number, AirportScenery>();
  private readonly surfaceLayer = new MeshLayer();
  private readonly solidLayer = new MeshLayer();
  private readonly lightLayer = new MeshLayer();
  private readonly buildings: Buildings;
  private job: { airport: AirportScenery; gen: Generator<void, void, void> } | null = null;
  private sim: Sim | null = null;
  private center: { lat: number; lon: number } | null = null;
  private pendingRefresh: { lat: number; lon: number; until: number } | null = null;
  private readonly skipped = new Set<number>();
  private lastScan = { lat: 999, lon: 999, time: -1e9 };
  private burstUntil = 0;
  private time = 0;
  private startAirport = "";
  private quality: Quality = "medium";
  private windDir = { e: -1, n: 0 };
  private windExt = 0;
  private disposed = false;
  private readonly stepLog = new Float32Array(2048);
  private stepLogCount = 0;

  constructor(private readonly world: World) {
    const context = contextOf(world.scene);
    this.ctx = {
      context,
      elevation: world.elevation,
      textures: new TextureCache(context),
      surfaceLayer: this.surfaceLayer,
      solidLayer: this.solidLayer,
      lightLayer: this.lightLayer,
      surfaceShared: { env: new Cartesian4(NIGHT_BRIGHTNESS, 0, 0, 0), lampPos: new Cartesian4(0, 0, 0, 0), lampDir: new Cartesian4(0, 0, -1, 0) },
      lightsShared: { light: new Cartesian4(0, 0.75, 0, 0), view: new Cartesian4(2.6, 26, 1, 0) },
      windsockShared: { wind: new Cartesian4(-1, 0, 0, 0), env: new Cartesian4(NIGHT_BRIGHTNESS, 0, 0, 0) },
    };
    const primitives = world.scene.primitives;
    // Runway surfaces are decals: they must be drawn before anything that stands on them.
    primitives.add(this.surfaceLayer);
    primitives.lowerToBottom(this.surfaceLayer);
    primitives.add(this.solidLayer);
    primitives.add(this.lightLayer);
    this.buildings = new Buildings({ context, creditDisplay: world.widget.creditDisplay, elevation: world.elevation, layer: this.solidLayer, env: this.ctx.surfaceShared.env });
    // The shared grain texture is made now (start-up) rather than in the middle of a flight.
    this.ctx.textures.noiseTexture();
  }

  get activeAirports(): number {
    let n = 0;
    for (const a of this.airports.values()) if (a.state === "ready") n++;
    return n;
  }

  resetStats(): void {
    this.stats.worstFrameMs = 0;
    this.stats.worstStepMs = 0;
    this.stepLogCount = 0;
  }

  /** Durations (ms) of the most recent airport-building steps since resetStats() — developer page only. */
  debugStepTimes(): number[] {
    return Array.from(this.stepLog.subarray(0, Math.min(this.stepLogCount, this.stepLog.length)));
  }

  // ------------------------------------------------------------------ SimModule hooks

  onSpawn(sim: Sim, result: SpawnResult): void {
    this.sim = sim;
    this.startAirport = result.airportIdent ?? "";
    this.refresh(result.lat, result.lon);
  }

  refresh(lat: number, lon: number): void {
    const now = performance.now();
    this.pendingRefresh = { lat, lon, until: now + 20000 };
    this.burstUntil = now + BURST_SECONDS * 1000;
    if (this.sim) this.scan(this.sim, lat, lon);
  }

  frame(sim: Sim, dtReal: number): void {
    if (this.disposed) return;
    const t0 = performance.now();
    this.sim = sim;
    const s = sim.state;
    this.time = (this.time + clamp(dtReal, 0, 0.25)) % 3600;
    if (sim.settings.quality !== this.quality) this.quality = sim.settings.quality;

    this.updateShared(sim, dtReal);

    // Look for airports to add or drop: about once a second, or after moving a quarter of a mile.
    // A position given to refresh() is used until the aircraft itself has arrived near it.
    let hereLat = s.lat;
    let hereLon = s.lon;
    const o = this.pendingRefresh;
    if (o) {
      if (t0 < o.until && (sim.spawning || distanceNm(s.lat, s.lon, o.lat, o.lon) > 2)) {
        hereLat = o.lat;
        hereLon = o.lon;
      } else this.pendingRefresh = null;
    }
    if (distanceNm(this.lastScan.lat, this.lastScan.lon, hereLat, hereLon) > 0.25 || t0 - this.lastScan.time > 1000) this.scan(sim, hereLat, hereLon);

    this.startPreparing(sim);
    this.runBuilds(sim, t0);
    this.buildings.update(sim, Math.max(performance.now(), t0 + FRAME_BUDGET_MS) + BUILDINGS_BUDGET_MS);
    this.keepOrder();
    this.updateStats();

    const ms = performance.now() - t0;
    this.stats.lastFrameMs = ms;
    if (ms > this.stats.worstFrameMs) this.stats.worstFrameMs = ms;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.job = null;
    for (const a of this.airports.values()) a.dispose();
    this.airports.clear();
    this.buildings.dispose();
    const primitives = this.world.scene.primitives;
    for (const layer of [this.surfaceLayer, this.solidLayer, this.lightLayer]) {
      if (!primitives.isDestroyed() && primitives.contains(layer)) primitives.remove(layer);
    }
    this.ctx.textures.destroy();
  }

  // ------------------------------------------------------------------ per-frame values

  private updateShared(sim: Sim, dtReal: number): void {
    const s = sim.state;
    const env = sim.env;
    const { surfaceShared, lightsShared, windsockShared } = this.ctx;
    const sun = sunPosition(env.utcMs, s.lat, s.lon);
    const day = daylight(sun.elevationDeg);
    const level = lightLevel(day, env.visibilitySm);
    this.stats.lightLevel = level;

    surfaceShared.env.x = clamp(this.nightBrightness, 0, 1);
    surfaceShared.env.y = this.time;
    surfaceShared.env.z = level;
    this.updateLamp(sim, day);
    windsockShared.env.x = surfaceShared.env.x;

    // Lights: night-only lamps follow the light level; PAPI and approach lights also work by day.
    lightsShared.light.x = level;
    lightsShared.light.y = 0.8;
    lightsShared.light.z = this.time;
    // Lamps punch through haze about twice as far as unlit ground can be seen.
    const visM = Math.max(200, env.visibilitySm * 1609.344);
    lightsShared.light.w = (3.912 / visM) * 0.5;
    const night = 1 - day;
    lightsShared.view.x = 2.3 + 0.9 * night;
    lightsShared.view.y = 18 + 12 * night;
    lightsShared.view.z = 1 + 1.6 * night;
    lightsShared.view.w = day;
    this.lightLayer.show = true;

    // Windsock: the surface wind (lowest wind layer), with a little gust-driven liveliness.
    const surface = env.wind[0];
    const kt = surface ? surface.kt : 0;
    const from = surface ? surface.dirTrue : 0;
    const gust = env.gustKt > 0 ? env.gustKt * (0.5 + 0.5 * Math.sin(this.time * 0.9) * Math.sin(this.time * 0.37 + 1.3)) : 0;
    // the sock points where the wind blows TO
    const toE = -Math.sin(from * D2R);
    const toN = -Math.cos(from * D2R);
    const k = 1 - Math.exp(-clamp(dtReal, 0, 0.25) / 1.2);
    if (kt > 0.3) {
      this.windDir.e += (toE - this.windDir.e) * k;
      this.windDir.n += (toN - this.windDir.n) * k;
    }
    const len = Math.hypot(this.windDir.e, this.windDir.n) || 1;
    this.windExt += (sockExtension(kt + gust) - this.windExt) * k;
    windsockShared.wind.x = this.windDir.e / len;
    windsockShared.wind.y = this.windDir.n / len;
    windsockShared.wind.z = this.windExt;
    windsockShared.wind.w = this.time;
  }

  /**
   * The aircraft's landing / taxi light on the runway: where the lamp is and where it points, in
   * eye coordinates (the same for every runway mesh). Only at night and near the ground.
   */
  private updateLamp(sim: Sim, day: number): void {
    const { lampPos, lampDir } = this.ctx.surfaceShared;
    const c = sim.controls;
    const s = sim.state;
    const strength = c.masterBattery && s.sys.batteryPct > 1 ? (c.lights.landing ? 1.25 : c.lights.taxi ? 0.6 : 0) : 0;
    if (strength === 0 || day > 0.95 || s.aglFt > 500) {
      lampPos.w = 0;
      return;
    }
    // The lamp sits in the nose and is aimed a few degrees below the aircraft's nose.
    aircraftMatrix(s.lat, s.lon, s.altMslFt, s.headingTrue, s.pitch - 5, s.roll, scratchMatrix);
    const view = this.world.camera.viewMatrix;
    Matrix4.multiplyByPoint(scratchMatrix, LAMP_OFFSET, scratchA);
    Matrix4.multiplyByPoint(view, scratchA, scratchA);
    Matrix4.multiplyByPointAsVector(scratchMatrix, Cartesian3.UNIT_X, scratchB);
    Matrix4.multiplyByPointAsVector(view, scratchB, scratchB);
    Cartesian3.normalize(scratchB, scratchB);
    lampPos.x = scratchA.x;
    lampPos.y = scratchA.y;
    lampPos.z = scratchA.z;
    lampPos.w = strength;
    lampDir.x = scratchB.x;
    lampDir.y = scratchB.y;
    lampDir.z = scratchB.z;
  }

  /** Runway decals first, lights last: keeps the draw order right when other modules add their own primitives. */
  private keepOrder(): void {
    const primitives = this.world.scene.primitives;
    const n = primitives.length;
    if (n > 1 && primitives.get(n - 1) !== this.lightLayer) primitives.raiseToTop(this.lightLayer);
    if (n > 1 && primitives.get(0) !== this.surfaceLayer) primitives.lowerToBottom(this.surfaceLayer);
  }

  private updateStats(): void {
    const st = this.stats;
    st.airports = st.pending = st.runways = st.lights = st.windsocks = 0;
    for (const a of this.airports.values()) {
      if (a.state === "ready") st.airports++;
      else st.pending++;
      st.runways += a.runwayCount;
      st.lights += a.lightCount;
      st.windsocks += a.windsockCount;
    }
    st.buildingTiles = this.buildings.tileCount;
    st.buildings = this.buildings.buildingCount;
  }

  // ------------------------------------------------------------------ level of detail

  private scan(sim: Sim, lat: number, lon: number): void {
    this.lastScan = { lat, lon, time: performance.now() };
    this.center = { lat, lon };
    // Drop airports that are now far away (from the scan centre AND from the aircraft).
    for (const [index, a] of this.airports) {
      const d = Math.min(distanceNm(lat, lon, a.lat, a.lon), distanceNm(sim.state.lat, sim.state.lon, a.lat, a.lon));
      if (d > DISPOSE_RADIUS_NM) {
        if (this.job?.airport === a) this.job = null;
        a.dispose();
        this.airports.delete(index);
      }
    }
    // Add the airports in range, nearest first, within the runway budget. When the budget is full,
    // a clearly nearer airport replaces the farthest one.
    const cap = RUNWAY_CAP[this.quality];
    let runways = 0;
    for (const a of this.airports.values()) runways += a.runways.length;
    const near = sim.data.airportsNear(lat, lon, BUILD_RADIUS_NM, { withRunwaysOnly: true });
    for (const summary of near) {
      if (this.airports.has(summary.index) || this.skipped.has(summary.index)) continue;
      const airport = sim.data.airportByIndex(summary.index);
      if (!airport) continue;
      const entry = new AirportScenery(airport, this.ctx);
      if (!entry.runways.length) {
        this.skipped.add(summary.index);
        continue;
      }
      while (runways + entry.runways.length > cap && this.airports.size > 0) {
        let far: AirportScenery | null = null;
        let farDist = summary.distanceNm + 1;
        for (const a of this.airports.values()) {
          const d = distanceNm(lat, lon, a.lat, a.lon);
          if (d > farDist && a.ident !== this.startAirport) {
            far = a;
            farDist = d;
          }
        }
        if (!far) break;
        runways -= far.runways.length;
        if (this.job?.airport === far) this.job = null;
        far.dispose();
        this.airports.delete(far.index);
      }
      if (runways + entry.runways.length > cap && this.airports.size > 0) break;
      runways += entry.runways.length;
      this.airports.set(summary.index, entry);
    }
  }

  /** Start loading the terrain under new airports, a couple per frame, nearest first. */
  private startPreparing(sim: Sim): void {
    const c = this.center ?? { lat: sim.state.lat, lon: sim.state.lon };
    for (let k = 0; k < PREPARES_PER_FRAME; k++) {
      let best: AirportScenery | null = null;
      let bestDist = Infinity;
      for (const a of this.airports.values()) {
        if (a.state !== "waiting") continue;
        const d = a.ident === this.startAirport ? -1 : distanceNm(c.lat, c.lon, a.lat, a.lon);
        if (d < bestDist) {
          bestDist = d;
          best = a;
        }
      }
      if (!best) return;
      void best.prepare();
    }
  }

  private runBuilds(sim: Sim, frameStart: number): void {
    const budget = sim.spawning || frameStart < this.burstUntil ? BURST_BUDGET_MS : FRAME_BUDGET_MS;
    const deadline = frameStart + budget;
    let guard = 0;
    while (performance.now() < deadline && guard++ < 10000) {
      if (!this.job) {
        const next = this.nextToBuild(sim);
        if (!next) {
          // Nothing new to build: refresh lights if the quality setting changed.
          const stale = [...this.airports.values()].find((a) => a.lightsOutdated(this.quality));
          if (!stale) break;
          this.job = { airport: stale, gen: stale.buildLights(this.quality) };
        } else this.job = { airport: next, gen: next.build(this.quality) };
      }
      let done = true;
      const stepStart = performance.now();
      try {
        done = this.job.gen.next().done === true;
      } catch (err) {
        console.error(`[TeachX] scenery: building ${this.job.airport.ident} failed`, err);
        this.job.airport.dispose();
        this.airports.delete(this.job.airport.index);
      }
      const stepMs = performance.now() - stepStart;
      if (stepMs > this.stats.worstStepMs) this.stats.worstStepMs = stepMs;
      this.stepLog[this.stepLogCount++ % this.stepLog.length] = stepMs;
      if (done) this.job = null;
    }
  }

  private nextToBuild(sim: Sim): AirportScenery | null {
    const s = sim.state;
    const c = this.center ?? { lat: s.lat, lon: s.lon };
    let best: AirportScenery | null = null;
    let bestScore = Infinity;
    for (const a of this.airports.values()) {
      if (a.state !== "queued") continue;
      const d = distanceNm(c.lat, c.lon, a.lat, a.lon);
      const brg = Math.atan2((a.lon - s.lon) * Math.cos(s.lat * D2R), a.lat - s.lat) * R2D;
      const score = buildPriority(d, brg, s.trackTrue, s.gsKt, a.ident === this.startAirport);
      if (score < bestScore) {
        bestScore = score;
        best = a;
      }
    }
    return best;
  }

  // ------------------------------------------------------------------ PAPI read-out

  papiReport(lat?: number, lon?: number, altFtMsl?: number): PapiReport | null {
    const s = this.sim?.state;
    const oLat = lat ?? s?.lat;
    const oLon = lon ?? s?.lon;
    const oAltM = (altFtMsl ?? s?.altMslFt ?? 0) * M_PER_FT;
    if (oLat === undefined || oLon === undefined) return null;
    let best: PapiReport | null = null;
    let bestScore = Infinity;
    for (const a of this.airports.values()) {
      for (const p of a.papis) {
        const d = distanceNm(oLat, oLon, p.lat, p.lon);
        if (d > 8) continue;
        // Only a PAPI that faces the observer counts (the one at the other end of the runway points
        // away); among those, the one the observer is lined up with wins over one that is merely near.
        const offAxis = Math.abs(angleDiff(bearingDeg(p.lat, p.lon, oLat, oLon), p.facingTrue));
        if (offAxis > 60) continue;
        const score = d + offAxis * 0.25;
        if (score >= bestScore) continue;
        bestScore = score;
        // the angle above the PAPI's own horizon is what the four lights encode
        const angleDeg = elevationAngleDeg(p.lat, p.lon, p.hM, oLat, oLon, oAltM);
        const whiteCount = papiWhiteCount(angleDeg);
        best = { airportIdent: a.ident, runwayEndId: p.endId, angleDeg, pattern: papiPattern(angleDeg), whiteCount, distanceNm: d, meaning: papiMeaning(whiteCount) };
      }
    }
    return best;
  }
}

/** Create the scenery module. Register it with `sim.use(...)`. */
export function createScenery(world: World): SceneryApi {
  return new Scenery(world);
}
