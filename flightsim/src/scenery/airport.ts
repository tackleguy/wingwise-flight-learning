/**
 * Everything drawn for ONE airport: runway surfaces, lights (incl. PAPI and beacon) and windsocks,
 * all in a flat local frame at the airport. Built step by step by a generator so the work can be
 * spread over several frames.
 */
import { Cartesian3, Matrix4, Transforms } from "cesium";
import { FT_PER_M, M_PER_FT, clamp, norm360 } from "@/core/math";
import type { Quality } from "@/core/types";
import type { Airport, Runway } from "@/data/world-data";
import type { ElevationService } from "@/world/elevation";
import { axisCoords, axisPoint, makeLocalFrame, runwayAxis, toLocal, type LocalFrame, type RunwayAxis } from "./geo";
import type { GlContext, Mesh, MeshLayer } from "./gl";
import { runwayLayout, type RunwayLayout } from "./layout";
import { createLightsMesh, type LightsShared, type PlacedLight } from "./lights";
import { LIGHT_TYPE, beaconLight, edgeSpacingM, runwayLights, type LightSpec, type PapiSite } from "./lights-layout";
import { buildSurfaceVertices, createSurfaceMesh, type SurfaceShared } from "./runway-surface";
import type { TextureCache } from "./textures";
import { createWindsockMesh, type SockSite, type WindsockShared } from "./windsock";

/** Runways shorter / longer than this are treated as data errors and not drawn. */
const MIN_RUNWAY_M = 60;
const MAX_RUNWAY_M = 9000;
/** At most this many runways are drawn per airport (longest first). */
export const MAX_RUNWAYS_PER_AIRPORT = 12;

export interface SceneryContext {
  context: GlContext;
  elevation: ElevationService;
  textures: TextureCache;
  surfaceLayer: MeshLayer;
  solidLayer: MeshLayer;
  lightLayer: MeshLayer;
  surfaceShared: SurfaceShared;
  lightsShared: LightsShared;
  windsockShared: WindsockShared;
}

interface BuiltRunway {
  rw: Runway;
  axis: RunwayAxis;
  layout: RunwayLayout;
  /** Surface heights at the two ends, metres (fallback when the terrain service has no answer). */
  hA: number;
  hB: number;
}

/** A PAPI the read-out can be computed for. */
export interface PapiUnitSite {
  endId: string;
  lat: number;
  lon: number;
  hM: number;
  /** True bearing from the PAPI toward the aircraft it serves (out along the approach). */
  facingTrue: number;
}

/** waiting → preparing (terrain loading) → queued → building → ready */
export type AirportState = "waiting" | "preparing" | "queued" | "building" | "ready" | "disposed";

export class AirportScenery {
  state: AirportState = "waiting";
  readonly index: number;
  readonly ident: string;
  readonly lat: number;
  readonly lon: number;
  readonly lighted: boolean;
  runwayCount = 0;
  lightCount = 0;
  windsockCount = 0;
  readonly papis: PapiUnitSite[] = [];
  /** Usable runways of this airport, longest last (drawn on top where runways cross). */
  readonly runways: Runway[];
  private readonly frame: LocalFrame;
  private readonly modelMatrix: Matrix4;
  private readonly surfaces: Mesh[] = [];
  private lights: Mesh | null = null;
  private windsock: Mesh | null = null;
  private built: BuiltRunway[] = [];
  private lightsQuality: Quality | null = null;

  constructor(
    readonly airport: Airport,
    private readonly ctx: SceneryContext,
  ) {
    this.index = airport.index;
    this.ident = airport.ident;
    this.lat = airport.lat;
    this.lon = airport.lon;
    const usable = airport.runways.filter((rw) => {
      const len = runwayAxis(rw).lengthM;
      return rw.surface !== "water" && len >= MIN_RUNWAY_M && len <= MAX_RUNWAY_M;
    });
    // biggest first; any paved runway counts as bigger than any unpaved one (it is drawn on top where they cross)
    const weight = (rw: Runway) => rw.lengthFt * Math.max(20, rw.widthFt) + (rw.paved ? 1e9 : 0);
    usable.sort((a, b) => weight(b) - weight(a));
    this.runways = usable.slice(0, MAX_RUNWAYS_PER_AIRPORT).reverse();
    this.lighted = this.runways.some((rw) => rw.lighted);
    const h0 = (airport.elevFt ?? this.runways[0]?.ends[0].elevFt ?? 0) * M_PER_FT;
    this.frame = makeLocalFrame(airport.lat, airport.lon, h0);
    this.modelMatrix = Transforms.eastNorthUpToFixedFrame(Cartesian3.fromDegrees(airport.lon, airport.lat, h0));
  }

  /** Points whose terrain must be loaded before this airport can be built. */
  terrainPoints(): { lat: number; lon: number }[] {
    const pts: { lat: number; lon: number }[] = [];
    for (const rw of this.runways) {
      const axis = runwayAxis(rw);
      const n = Math.max(1, Math.ceil(axis.lengthM / 900));
      for (let i = 0; i <= n; i++) pts.push(axisPoint(axis, 0, (axis.lengthM * i) / n));
      if (rw.lighted && this.airport.size !== "small") {
        pts.push(axisPoint(axis, 0, -420), axisPoint(axis, 0, axis.lengthM + 420));
      }
    }
    return pts;
  }

  /** Load the terrain under the runways (and the flattened runway surfaces). Never rejects. */
  async prepare(timeoutMs = 15000): Promise<void> {
    if (this.state !== "waiting") return;
    this.state = "preparing";
    const jobs = this.terrainPoints().map((p) => this.ctx.elevation.ensure(p.lat, p.lon, 0.08).catch(() => undefined));
    await Promise.race([Promise.all(jobs), new Promise((resolve) => setTimeout(resolve, timeoutMs))]);
    if (this.state === "preparing") this.state = "queued";
  }

  /** Height (m) of the surface the wheels roll on at a point; falls back to the plane between the runway ends. */
  private surfaceHeightM(b: BuiltRunway, lat: number, lon: number, t: number): number {
    const h = this.ctx.elevation.heightM(lat, lon);
    if (h !== null) return h;
    return b.hA + (b.hB - b.hA) * clamp(t / b.axis.lengthM, 0, 1);
  }

  private endHeights(rw: Runway): [number, number] {
    const el = this.ctx.elevation;
    const fallback = this.airport.elevFt ?? 0;
    const one = (i: 0 | 1) => {
      const end = rw.ends[i];
      const ft = el.runwayEndElevFt(rw, i) ?? el.groundFt(end.lat, end.lon) ?? end.elevFt ?? fallback;
      return ft / FT_PER_M;
    };
    return [one(0), one(1)];
  }

  /** Build everything. Yields between chunks of work (each chunk is at most a few milliseconds). */
  *build(quality: Quality): Generator<void, void, void> {
    if (this.state === "disposed") return;
    this.state = "building";
    const { ctx } = this;
    let rank = 0;
    for (const rw of this.runways) {
      const axis = runwayAxis(rw);
      const layout = runwayLayout(rw, axis.lengthM, this.airport.size, this.airport.country);
      const [hA, hB] = this.endHeights(rw);
      const b: BuiltRunway = { rw, axis, layout, hA, hB };
      const data = yield* buildSurfaceVertices(this.frame, axis, layout, (lat, lon, t) => this.surfaceHeightM(b, lat, lon, t));
      yield;
      if (this.isDisposed()) return;
      // Number textures are made once per designator and reused by every airport.
      const texFor = (endIndex: 0 | 1) => (layout.ends[endIndex].desigLengthM > 0 ? ctx.textures.designatorTexture(layout.ends[endIndex].paintId) : ctx.textures.blankTexture());
      const needA = layout.ends[0].desigLengthM > 0 && !ctx.textures.hasDesignator(layout.ends[0].paintId);
      const desigA = texFor(0);
      if (needA) yield;
      const needB = layout.ends[1].desigLengthM > 0 && !ctx.textures.hasDesignator(layout.ends[1].paintId);
      const desigB = texFor(1);
      if (needB) yield;
      if (this.isDisposed()) return;
      const mesh = createSurfaceMesh({
        context: ctx.context,
        modelMatrix: this.modelMatrix,
        data,
        layout,
        lengthM: axis.lengthM,
        noise: ctx.textures.noiseTexture(),
        desigA,
        desigB,
        shared: ctx.surfaceShared,
        rank: rank++,
        edgeSpacingM: rw.lighted && axis.lengthM >= 150 ? edgeSpacingM(axis.lengthM) : 0,
      });
      this.surfaces.push(mesh);
      ctx.surfaceLayer.add(mesh);
      this.built.push(b);
      this.runwayCount = this.built.length;
      yield;
    }
    yield* this.buildLights(quality);
    if (this.isDisposed()) return;
    this.buildWindsocks();
    yield;
    if (!this.isDisposed()) this.state = "ready";
  }

  private isDisposed(): boolean {
    return this.state === "disposed";
  }

  /** True when the lights were built for a different quality setting. */
  lightsOutdated(quality: Quality): boolean {
    return this.state === "ready" && this.lightsQuality !== null && this.lightsQuality !== quality;
  }

  /** (Re)build the lights of this airport for a quality level. */
  *buildLights(quality: Quality): Generator<void, void, void> {
    const { ctx } = this;
    const placed: PlacedLight[] = [];
    const papis: PapiUnitSite[] = [];
    const p = { lat: 0, lon: 0 };
    const xyz = [0, 0, 0];
    let work = 0;
    for (const b of this.built) {
      const { lights, papis: sites } = runwayLights(b.rw, b.layout, b.axis.lengthM, this.airport.size, quality);
      const place = (l: Pick<LightSpec, "s" | "t" | "h" | "onGround">): number => {
        axisPoint(b.axis, l.s, l.t, p);
        let h = this.surfaceHeightM(b, p.lat, p.lon, l.t);
        // Approach lights stand on the real ground, but never far below the runway end (think of light masts / piers).
        if (l.onGround) h = Math.max(h, (l.t < 0 ? b.hA : b.hB) - 0.5);
        toLocal(this.frame, p.lat, p.lon, h + l.h, xyz);
        return h + l.h;
      };
      for (const l of lights) {
        place(l);
        // runway direction → local east/north (lights are level: no vertical component)
        const dx = l.dirT * b.axis.alongE + l.dirS * b.axis.rightE;
        const dy = l.dirT * b.axis.alongN + l.dirS * b.axis.rightN;
        // (PAPI units carry their place in the row instead of a vertical direction component)
        placed.push({ x: xyz[0]!, y: xyz[1]!, z: xyz[2]!, dx, dy, dz: l.type === LIGHT_TYPE.papi ? l.row * l.dirT : 0, type: l.type, sizeM: l.sizeM, param: l.param, intensity: l.intensity, day: l.day, colorA: l.colorA, colorB: l.colorB });
        if (++work % 160 === 0) yield;
      }
      for (const s of sites) papis.push(this.papiSite(b, s, place));
    }
    // airport beacon
    if (this.lighted && this.built.length) {
      const pos = this.beaconPosition();
      const spec = beaconLight(this.ident);
      const ground = ctx.elevation.heightM(pos.lat, pos.lon) ?? this.built[0]!.hA;
      toLocal(this.frame, pos.lat, pos.lon, ground + spec.h, xyz);
      placed.push({ x: xyz[0]!, y: xyz[1]!, z: xyz[2]!, dx: 0, dy: 1, dz: 0, type: spec.type, sizeM: spec.sizeM, param: spec.param, intensity: spec.intensity, day: spec.day, colorA: spec.colorA, colorB: spec.colorB });
    }
    yield;
    if (this.isDisposed()) return;
    const mesh = createLightsMesh(ctx.context, this.modelMatrix, placed, ctx.lightsShared);
    if (this.lights) {
      ctx.lightLayer.remove(this.lights);
      this.lights.destroy();
    }
    this.lights = mesh;
    if (mesh) ctx.lightLayer.add(mesh);
    this.lightCount = placed.length;
    this.lightsQuality = quality;
    this.papis.length = 0;
    this.papis.push(...papis);
  }

  private papiSite(b: BuiltRunway, site: PapiSite, place: (l: Pick<LightSpec, "s" | "t" | "h" | "onGround">) => number): PapiUnitSite {
    const hM = place({ s: site.s, t: site.t, h: 0.6, onGround: false });
    const p = axisPoint(b.axis, site.s, site.t);
    const along = (b.axis.headingRad * 180) / Math.PI;
    return { endId: site.endId, lat: p.lat, lon: p.lon, hM, facingTrue: norm360(site.endIndex === 0 ? along + 180 : along) };
  }

  /** True when a point is at least `marginM` away from every runway of this airport. */
  private clearOfRunways(lat: number, lon: number, marginM: number): boolean {
    const c = { s: 0, t: 0 };
    for (const b of this.built) {
      axisCoords(b.axis, lat, lon, c);
      if (c.t > -marginM && c.t < b.axis.lengthM + marginM && Math.abs(c.s) < b.layout.widthM / 2 + marginM) return false;
    }
    return true;
  }

  /** The beacon stands at the airport reference point, moved to the side if that is on a runway. */
  private beaconPosition(): { lat: number; lon: number } {
    if (this.clearOfRunways(this.lat, this.lon, 120)) return { lat: this.lat, lon: this.lon };
    const main = this.built[this.built.length - 1]!;
    for (const side of [1, -1]) {
      for (const dist of [200, 320, 450]) {
        const p = axisPoint(main.axis, side * (main.layout.widthM / 2 + dist), main.axis.lengthM / 2);
        if (this.clearOfRunways(p.lat, p.lon, 100)) return p;
      }
    }
    return axisPoint(main.axis, main.layout.widthM / 2 + 200, main.axis.lengthM / 2);
  }

  /** Windsocks beside the touchdown areas of the two longest runways (one at mid-field for short strips) and at the reference point. */
  private buildWindsocks(): void {
    const { ctx } = this;
    const sites: SockSite[] = [];
    const xyz = [0, 0, 0];
    const add = (b: BuiltRunway, s: number, t: number) => {
      if (sites.length >= 4) return;
      const p = axisPoint(b.axis, s, t);
      if (!this.clearOfRunways(p.lat, p.lon, 30)) return;
      const ground = ctx.elevation.heightM(p.lat, p.lon) ?? b.hA + (b.hB - b.hA) * clamp(t / b.axis.lengthM, 0, 1);
      toLocal(this.frame, p.lat, p.lon, ground, xyz);
      sites.push({ x: xyz[0]!, y: xyz[1]!, z: xyz[2]! });
    };
    const main = [...this.built].reverse().slice(0, 2);
    for (const b of main) {
      const hw = b.layout.widthM / 2;
      const len = b.axis.lengthM;
      if (len < 760) add(b, -(hw + 40), len / 2);
      else {
        const dA = b.layout.ends[0].displacedM + Math.min(390, len * 0.33);
        const dB = b.layout.ends[1].displacedM + Math.min(390, len * 0.33);
        add(b, -(hw + 62), dA); // left of a pilot landing at end A
        add(b, hw + 62, len - dB); // left of a pilot landing at end B
      }
    }
    // … and one at the airport reference point when that is not on or right beside a runway
    if (this.built.length && this.clearOfRunways(this.lat, this.lon, 45)) {
      const ground = ctx.elevation.heightM(this.lat, this.lon) ?? this.built[0]!.hA;
      toLocal(this.frame, this.lat, this.lon, ground, xyz);
      if (!sites.some((s) => Math.hypot(s.x - xyz[0]!, s.y - xyz[1]!) < 150)) sites.push({ x: xyz[0]!, y: xyz[1]!, z: xyz[2]! });
    }
    this.windsock = createWindsockMesh(ctx.context, this.modelMatrix, sites, this.lighted, ctx.windsockShared);
    if (this.windsock) ctx.solidLayer.add(this.windsock);
    this.windsockCount = sites.length;
  }

  dispose(): void {
    if (this.state === "disposed") return;
    this.state = "disposed";
    const { ctx } = this;
    for (const m of this.surfaces) {
      ctx.surfaceLayer.remove(m);
      m.destroy();
    }
    this.surfaces.length = 0;
    if (this.lights) {
      ctx.lightLayer.remove(this.lights);
      this.lights.destroy();
      this.lights = null;
    }
    if (this.windsock) {
      ctx.solidLayer.remove(this.windsock);
      this.windsock.destroy();
      this.windsock = null;
    }
    this.built = [];
    this.runwayCount = this.lightCount = this.windsockCount = 0;
    this.papis.length = 0;
  }
}
