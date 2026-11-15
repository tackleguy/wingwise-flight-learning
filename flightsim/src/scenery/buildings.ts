/**
 * Optional buildings near the aircraft: simple extruded blocks from OpenStreetMap footprints, served
 * as vector tiles by OpenFreeMap (free, no key; OpenMapTiles schema, layer "building" with
 * `render_height`). Attribution — "OpenFreeMap © OpenMapTiles Data from OpenStreetMap" — is added
 * to the credit line whenever buildings are on.
 *
 * Deliberately modest: zoom-14 tiles within 2–3 km of the aircraft, only below about 6,000 ft above
 * the ground, the largest footprints first up to a budget per tile, one mesh per tile, a small
 * cache, and at most one tile download every few seconds (it is somebody's free server).
 * Buildings are plain grey/beige boxes with flat roofs — they give a sense of height and speed and
 * show where the hangars and terminals are; they are not models of the real buildings.
 */
import { VectorTile, classifyRings } from "@mapbox/vector-tile";
import Pbf from "pbf";
import { Cartesian3, Cartesian4, Credit, Transforms, type CreditDisplay } from "cesium";
import { D2R, clamp } from "@/core/math";
import type { Sim } from "@/core/sim";
import type { ElevationService } from "@/world/elevation";
import { BUILDINGS_ATTRIBUTION } from "./api";
import { BUILDING_BUDGET, BUILDING_ZOOM as ZOOM, latOfTileY, lonOfTileX, ringArea, selectFootprints, simplifyRing, tilesAround, type BuildingBudget as Budget, type Footprint } from "./buildings-math";
import { makeLocalFrame, toLocal } from "./geo";
import { Mesh, triangulate, type GlContext, type MeshLayer, type UniformMap } from "./gl";

const TILEJSON_URL = "https://tiles.openfreemap.org/planet";
/** Seconds between tile downloads (politeness). */
const REQUEST_INTERVAL_S = 5;
const MAX_CACHED_TILES = 18;
/** No buildings are loaded when the aircraft is higher than this above the ground, ft. */
const MAX_AGL_FT = 6000;

// ---------------------------------------------------------------- drawing

const VS = /* glsl */ `
in vec3 position;
in vec3 normal;
in vec4 color;
out vec3 v_color;
out float v_dist;
uniform vec4 u_env;

void main() {
  vec4 pe = czm_modelView * vec4(position, 1.0);
  gl_Position = czm_projection * pe;
  v_dist = length(pe.xyz);
  vec3 up = normalize(czm_normal * vec3(0.0, 0.0, 1.0));
  float day = clamp(czm_getLambertDiffuse(czm_lightDirectionEC, up) * 7.14, 0.0, 1.0);
  vec3 nEC = normalize(czm_normal * normal);
  // sunlit faces brighter, shaded faces still readable; roofs get the sky
  float sun = max(dot(nEC, czm_lightDirectionEC), 0.0);
  float shade = 0.58 + 0.42 * sun + 0.08 * normal.z;
  v_color = color.rgb * shade * mix(u_env.x, 1.0, day) * czm_lightColor;
}
`;

const FS = /* glsl */ `
in vec3 v_color;
in float v_dist;
void main() {
  float fog = 1.0 - exp(-pow(v_dist * czm_fogDensity, 2.0));
  float lum = max(max(v_color.r, v_color.g), v_color.b);
  out_FragColor = vec4(mix(v_color, vec3(0.62, 0.66, 0.70) * min(1.0, lum * 1.6), fog * 0.85), 1.0);
}
`;

/** Wall and roof tints (r, g, b): concrete greys, warm beiges, a few brick and metal tones. */
const PALETTE: readonly (readonly [number, number, number])[] = [
  [176, 172, 164],
  [158, 156, 152],
  [190, 182, 166],
  [168, 160, 146],
  [146, 148, 152],
  [182, 168, 150],
  [160, 142, 128],
  [198, 194, 186],
];

interface TileEntry {
  key: string;
  x: number;
  y: number;
  state: "loading" | "building" | "ready" | "empty" | "failed";
  mesh: Mesh | null;
  buildings: number;
  used: number;
}

export interface BuildingsContext {
  context: GlContext;
  /** Where the data attribution is shown. */
  creditDisplay: CreditDisplay;
  elevation: ElevationService;
  layer: MeshLayer;
  /** x: night brightness (shared with the runway surfaces). */
  env: Cartesian4;
}

export class Buildings {
  tileCount = 0;
  buildingCount = 0;
  /** Tile downloads started so far (for the politeness check in tests / notes). */
  requests = 0;
  private readonly tiles = new Map<string, TileEntry>();
  private template: string | null = null;
  private templateState: "none" | "loading" | "failed" = "none";
  private templateRetryAt = 0;
  private lastRequest = -1e9;
  private loading = 0;
  private clock = 0;
  private job: { tile: TileEntry; gen: Generator<void, void, void> } | null = null;
  private credit: Credit | null = null;
  private creditShown = false;
  private disposed = false;
  private wanted: { x: number; y: number; distM: number }[] = [];
  private wantedAt: { lat: number; lon: number; budget: Budget | null; low: boolean } = { lat: 999, lon: 999, budget: null, low: false };

  constructor(private readonly ctx: BuildingsContext) {}

  /** Called once per frame. `deadline` is the performance.now() time at which building work must stop for this frame. */
  update(sim: Sim, deadline: number): void {
    if (this.disposed) return;
    const budget = sim.settings.buildings ? BUILDING_BUDGET[sim.settings.quality] : null;
    const s = sim.state;
    const now = performance.now() / 1000;
    if (!budget) {
      if (this.tiles.size) this.clear();
      this.showCredit(false);
      return;
    }
    this.showCredit(true);
    // The list of wanted tiles is refreshed after moving about 150 m (not every frame).
    if (Math.abs(s.lat - this.wantedAt.lat) > 0.0013 || Math.abs(s.lon - this.wantedAt.lon) > 0.0013 || budget !== this.wantedAt.budget || s.aglFt < MAX_AGL_FT !== this.wantedAt.low) {
      this.wantedAt = { lat: s.lat, lon: s.lon, budget, low: s.aglFt < MAX_AGL_FT };
      this.wanted = s.aglFt < MAX_AGL_FT ? tilesAround(s.lat, s.lon, budget.radiusM) : [];
    }
    const wanted = this.wanted;
    this.clock++;
    for (const w of wanted) {
      const t = this.tiles.get(`${w.x}/${w.y}`);
      if (t) t.used = this.clock;
    }

    // One download at a time, a few seconds apart, nearest tile first.
    if (this.loading === 0 && now - this.lastRequest > REQUEST_INTERVAL_S) {
      if (!this.template) this.loadTemplate(now);
      else {
        const next = wanted.find((w) => !this.tiles.has(`${w.x}/${w.y}`));
        if (next) this.request(next.x, next.y, budget, now);
      }
    }

    // Turn downloaded tiles into meshes within the time budget.
    while (this.job && performance.now() < deadline) {
      let done = true;
      try {
        done = this.job.gen.next().done === true;
      } catch (err) {
        console.warn("[TeachX] scenery: a building tile could not be built", err);
        this.job.tile.state = "failed";
      }
      if (done) {
        this.job = null;
        this.startNext();
      }
    }

    // Forget tiles that have not been wanted for a while.
    if (this.tiles.size > MAX_CACHED_TILES) {
      const old = [...this.tiles.values()].filter((t) => t.state !== "loading" && t !== this.job?.tile).sort((a, b) => a.used - b.used);
      for (let i = 0; i < old.length && this.tiles.size > MAX_CACHED_TILES; i++) this.drop(old[i]!);
    }
    this.count();
  }

  private count(): void {
    let tiles = 0;
    let buildings = 0;
    for (const t of this.tiles.values()) {
      if (t.state === "ready") {
        tiles++;
        buildings += t.buildings;
      }
    }
    this.tileCount = tiles;
    this.buildingCount = buildings;
  }

  private showCredit(on: boolean): void {
    if (on === this.creditShown) return;
    const display = this.ctx.creditDisplay;
    this.credit ??= new Credit(BUILDINGS_ATTRIBUTION, true);
    if (on) display.addStaticCredit(this.credit);
    else display.removeStaticCredit(this.credit);
    this.creditShown = on;
  }

  private loadTemplate(now: number): void {
    if (this.templateState === "loading" || now < this.templateRetryAt) return;
    this.templateState = "loading";
    this.lastRequest = now;
    fetch(TILEJSON_URL)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((json: { tiles?: string[] }) => {
        const url = json.tiles?.[0];
        if (!url) throw new Error("no tile URL in the TileJSON");
        this.template = url;
        this.templateState = "none";
      })
      .catch((err) => {
        console.warn("[TeachX] scenery: buildings are unavailable (OpenFreeMap could not be reached)", err);
        this.templateState = "failed";
        this.templateRetryAt = performance.now() / 1000 + 120;
      });
  }

  private request(x: number, y: number, budget: Budget, now: number): void {
    const n = 2 ** ZOOM;
    if (y < 0 || y >= n || !this.template) return;
    const key = `${x}/${y}`;
    const tile: TileEntry = { key, x, y, state: "loading", mesh: null, buildings: 0, used: this.clock };
    this.tiles.set(key, tile);
    this.lastRequest = now;
    this.loading++;
    this.requests++;
    const url = this.template.replace("{z}", String(ZOOM)).replace("{x}", String(((x % n) + n) % n)).replace("{y}", String(y));
    fetch(url)
      .then((r) => (r.ok ? r.arrayBuffer() : r.status === 404 || r.status === 204 ? null : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((buf) => {
        this.loading--;
        if (this.disposed || this.tiles.get(key) !== tile) return;
        if (!buf || buf.byteLength === 0) {
          tile.state = "empty";
          return;
        }
        tile.state = "building";
        this.enqueue(tile, new Uint8Array(buf), budget);
      })
      .catch(() => {
        this.loading--;
        tile.state = "failed";
      });
  }

  private readonly queue: { tile: TileEntry; data: Uint8Array; budget: Budget }[] = [];

  private enqueue(tile: TileEntry, data: Uint8Array, budget: Budget): void {
    this.queue.push({ tile, data, budget });
    if (!this.job) this.startNext();
  }

  private startNext(): void {
    const next = this.queue.shift();
    if (next) this.job = { tile: next.tile, gen: this.buildTile(next.tile, next.data, next.budget) };
  }

  /** Decode a tile and build its mesh, yielding between small pieces of work. */
  private *buildTile(tile: TileEntry, data: Uint8Array, budget: Budget): Generator<void, void, void> {
    const layer = new VectorTile(new Pbf(data)).layers.building;
    yield;
    if (!layer || layer.length === 0) {
      tile.state = "empty";
      return;
    }
    const extent = layer.extent;
    const latMid = latOfTileY(tile.y + 0.5);
    const unitM = (40075016.686 * Math.cos(latMid * D2R)) / 2 ** ZOOM / extent;
    const tolerance = 0.6 / unitM; // 60 cm
    // In the OpenMapTiles schema one feature holds ALL buildings of the same height in the tile.
    const footprints: Footprint[] = [];
    for (let i = 0; i < layer.length; i++) {
      const f = layer.feature(i);
      if (f.type !== 3) continue;
      const heightM = clamp(Number(f.properties.render_height) || 6, 3, 450);
      const baseM = clamp(Number(f.properties.render_min_height) || 0, 0, heightM - 2);
      for (const polygon of classifyRings(f.loadGeometry())) {
        const outer = polygon[0];
        if (!outer || outer.length < 4) continue;
        const areaM2 = Math.abs(ringArea(outer)) * unitM * unitM;
        if (areaM2 < 45) continue; // sheds and garages
        // big, detailed outlines (terminals) are simplified harder so they stay affordable
        const ring = simplifyRing(outer, outer.length > 150 ? tolerance * 3 : tolerance);
        if (ring.length < 3 || ring.length > 1200) continue;
        // outlines that leave the tile are clipped copies; keep them, they still read as buildings
        footprints.push({ ring, heightM, baseM, areaM2 });
      }
      if (i % 3 === 2) yield;
    }
    yield;
    const chosen = selectFootprints(footprints, budget.points);
    if (!chosen.length) {
      tile.state = "empty";
      return;
    }

    // local frame at the tile centre
    const lat0 = latMid;
    const lon0 = lonOfTileX(tile.x + 0.5);
    const ground0 = this.ctx.elevation.heightM(lat0, lon0) ?? 0;
    const frame = makeLocalFrame(lat0, lon0, ground0);
    const modelMatrix = Transforms.eastNorthUpToFixedFrame(Cartesian3.fromDegrees(lon0, lat0, ground0));

    let vertexCount = 0;
    let indexCount = 0;
    for (const f of chosen) {
      vertexCount += f.ring.length * 5; // 4 per wall + 1 roof
      indexCount += f.ring.length * 6 + Math.max(0, f.ring.length - 2) * 3;
    }
    const FLOATS = 7;
    const buffer = new ArrayBuffer(vertexCount * FLOATS * 4);
    const fl = new Float32Array(buffer);
    const u8 = new Uint8Array(buffer);
    const indices = vertexCount > 65535 ? new Uint32Array(indexCount) : new Uint16Array(indexCount);
    let v = 0;
    let ix = 0;
    let radius = 0;
    const put = (x: number, y: number, z: number, nx: number, ny: number, nz: number, rgb: readonly [number, number, number], dim: number) => {
      const o = v * FLOATS;
      fl[o] = x;
      fl[o + 1] = y;
      fl[o + 2] = z;
      fl[o + 3] = nx;
      fl[o + 4] = ny;
      fl[o + 5] = nz;
      const b = (o + 6) * 4;
      u8[b] = rgb[0] * dim;
      u8[b + 1] = rgb[1] * dim;
      u8[b + 2] = rgb[2] * dim;
      u8[b + 3] = 255;
      return v++;
    };
    const local = [0, 0, 0];
    const xs: number[] = [];
    const ys: number[] = [];
    let built = 0;
    for (const f of chosen) {
      // footprint corners in the local frame, on level ground at the height of the terrain under its middle
      const n = f.ring.length;
      let cx = 0;
      let cy = 0;
      for (const p of f.ring) {
        cx += p.x;
        cy += p.y;
      }
      const cLat = latOfTileY(tile.y + cy / n / extent);
      const cLon = lonOfTileX(tile.x + cx / n / extent);
      const ground = this.ctx.elevation.heightM(cLat, cLon);
      if (ground === null) continue; // no terrain loaded there yet: skip rather than float
      xs.length = ys.length = 0;
      let zBase = 0;
      for (const p of f.ring) {
        toLocal(frame, latOfTileY(tile.y + p.y / extent), lonOfTileX(tile.x + p.x / extent), ground, local);
        xs.push(local[0]!);
        ys.push(local[1]!);
        zBase += local[2]! / n;
        radius = Math.max(radius, Math.hypot(local[0]!, local[1]!));
      }
      // which way round the outline runs decides which side of each wall faces outward
      let twice = 0;
      for (let i = 0, j = n - 1; i < n; j = i++) twice += xs[j]! * ys[i]! - xs[i]! * ys[j]!;
      const flip = twice > 0 ? -1 : 1; // counter-clockwise seen from above: outward is to the right of each edge
      const z0 = zBase + f.baseM - 0.5; // sink the foot a little so sloping ground does not show a gap
      const z1 = zBase + f.heightM;
      const hash = (Math.abs(Math.round(cx * 31 + cy * 17)) + n * 7) % PALETTE.length;
      const rgb = PALETTE[hash]!;
      // walls
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const ex = xs[j]! - xs[i]!;
        const ey = ys[j]! - ys[i]!;
        const len = Math.hypot(ex, ey) || 1;
        const nx = (flip * -ey) / len;
        const ny = (flip * ex) / len;
        const a = put(xs[i]!, ys[i]!, z0, nx, ny, 0, rgb, 1);
        const b = put(xs[j]!, ys[j]!, z0, nx, ny, 0, rgb, 1);
        const c = put(xs[j]!, ys[j]!, z1, nx, ny, 0, rgb, 1);
        const d = put(xs[i]!, ys[i]!, z1, nx, ny, 0, rgb, 1);
        indices[ix++] = a;
        indices[ix++] = b;
        indices[ix++] = c;
        indices[ix++] = a;
        indices[ix++] = c;
        indices[ix++] = d;
      }
      // flat roof, slightly darker
      const first = v;
      for (let i = 0; i < n; i++) put(xs[i]!, ys[i]!, z1, 0, 0, 1, rgb, 0.82);
      const tris = triangulate(xs, ys);
      for (const t of tris) indices[ix++] = first + t;
      built++;
      if (built % 25 === 0) yield;
    }
    yield;
    if (this.disposed || this.tiles.get(tile.key) !== tile || built === 0) {
      tile.state = built === 0 ? "empty" : tile.state;
      return;
    }
    const uniforms: UniformMap = { u_env: () => this.ctx.env };
    tile.mesh = new Mesh(this.ctx.context, {
      vertices: fl.subarray(0, v * FLOATS),
      attributes: [
        { name: "position", components: 3 },
        { name: "normal", components: 3 },
        { name: "color", components: 4, type: "ubyte" },
      ],
      indices: indices.subarray(0, ix),
      vertexShader: VS,
      fragmentShader: FS,
      uniforms,
      modelMatrix,
      localCenter: new Cartesian3(0, 0, 0),
      radius: radius + 500,
      mode: "solid",
    });
    this.ctx.layer.add(tile.mesh);
    tile.buildings = built;
    tile.state = "ready";
  }

  private drop(tile: TileEntry): void {
    if (tile.mesh) {
      this.ctx.layer.remove(tile.mesh);
      tile.mesh.destroy();
      tile.mesh = null;
    }
    this.tiles.delete(tile.key);
  }

  private clear(): void {
    this.job = null;
    this.queue.length = 0;
    for (const t of [...this.tiles.values()]) this.drop(t);
    this.tileCount = this.buildingCount = 0;
  }

  dispose(): void {
    if (this.disposed) return;
    this.clear();
    this.showCredit(false);
    this.disposed = true;
  }
}

/** Height above the ground below which buildings are loaded, ft (for the notes / UI). */
export const BUILDINGS_MAX_AGL_FT = MAX_AGL_FT;
