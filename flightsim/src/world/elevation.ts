/**
 * Terrain elevation for BOTH rendering and physics.
 *
 * Source: the open "Terrain Tiles" dataset on AWS (Mapzen/Tilezen "terrarium" PNG tiles, keyless).
 * One service decodes the tiles, flattens the ground under runways, and answers two callers:
 *   - CesiumJS asks for a 65×65 height grid per globe tile (`cesiumHeights`);
 *   - the flight model asks for the ground height under the wheels (`groundFt`).
 * Because both use the same numbers, the aircraft's wheels meet the terrain you can see.
 *
 * Heights are metres above mean sea level. The simulator treats them as heights above the
 * WGS84 ellipsoid (the globe is simply drawn without the geoid undulation, as most sims do).
 */
import type { Runway, WorldData } from "@/data/world-data";
import { D2R, FT_PER_M, M_PER_FT, M_PER_NM, clamp, smoothstep } from "@/core/math";

export const TERRAIN_URL = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png";
/** Finest Terrarium zoom requested (≈ 19 m per pixel at the equator, matching 30 m SRTM data). */
export const SOURCE_MAX_ZOOM = 13;
const TILE = 256;
const GRID = 65;

/** Runway flattening: full weight inside the pavement plus this margin, blended to natural terrain over BLEND_M. */
const SIDE_MARGIN_M = 50;
const END_MARGIN_M = 90;
const BLEND_M = 380;
/** Published runway-end elevations further than this from the terrain data are treated as data errors. */
const MAX_ELEV_DISAGREEMENT_M = 30;

interface TileEntry {
  data: Float32Array | null;
  promise: Promise<Float32Array | null>;
  used: number;
  failed: boolean;
}

interface RunwayPlane {
  cLat: number;
  cLon: number;
  cosLat: number;
  sinH: number;
  cosH: number;
  halfLenM: number;
  halfWidM: number;
  hA: number;
  hB: number;
}

export type TileDecoder = (url: string) => Promise<Float32Array | null>;

/** Decode a terrarium PNG into metres (browser). */
async function decodeTerrarium(url: string): Promise<Float32Array | null> {
  const res = await fetch(url, { mode: "cors" });
  if (!res.ok) return null; // ocean / missing tile
  const blob = await res.blob();
  const bmp = await createImageBitmap(blob, { colorSpaceConversion: "none", premultiplyAlpha: "none" });
  let ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null;
  if (typeof OffscreenCanvas !== "undefined") {
    ctx = new OffscreenCanvas(TILE, TILE).getContext("2d", { willReadFrequently: true });
  } else {
    const c = document.createElement("canvas");
    c.width = TILE;
    c.height = TILE;
    ctx = c.getContext("2d", { willReadFrequently: true });
  }
  if (!ctx) return null;
  ctx.drawImage(bmp, 0, 0, TILE, TILE);
  bmp.close();
  const px = ctx.getImageData(0, 0, TILE, TILE).data;
  const out = new Float32Array(TILE * TILE);
  for (let i = 0, j = 0; i < out.length; i++, j += 4) out[i] = px[j]! * 256 + px[j + 1]! + px[j + 2]! / 256 - 32768;
  return out;
}

/**
 * The source data includes the sea floor (ocean depths). A simulator wants a flat sea, so heights
 * are clamped to sea level — except inside these boxes, where real LAND lies below sea level.
 * [south, north, west, east, lowest land height in metres]
 */
const BELOW_SEA_LEVEL_LAND: readonly (readonly [number, number, number, number, number])[] = [
  [30.4, 33.3, 35.2, 35.75, -432], // Dead Sea and Jordan valley
  [35.6, 37.0, -117.5, -116.3, -86], // Death Valley
  [32.5, 33.9, -116.4, -114.9, -72], // Salton Sea / Imperial Valley
  [36.0, 48.0, 46.0, 55.0, -28], // Caspian depression (the Caspian Sea surface is 28 m below sea level)
  [51.0, 53.6, 3.3, 7.3, -7], // Netherlands polders
  [42.0, 43.5, 88.5, 90.5, -154], // Turpan depression
  [28.5, 30.6, 26.0, 29.5, -133], // Qattara depression
  [11.0, 15.0, 39.8, 42.7, -155], // Danakil / Lake Assal
  [-49.8, -49.3, -68.7, -68.0, -105], // Laguna del Carbón
  [-29.8, -27.5, 136.5, 138.5, -15], // Lake Eyre
];

/** Lowest height (m) the terrain may have at a point: 0 over the sea, negative only in known dry depressions. */
export function seaFloorM(lat: number, lon: number): number {
  for (const b of BELOW_SEA_LEVEL_LAND) if (lat >= b[0] && lat <= b[1] && lon >= b[2] && lon <= b[3]) return b[4];
  return 0;
}

const mercX = (lon: number, z: number) => ((lon + 180) / 360) * 2 ** z;
const mercY = (lat: number, z: number) => {
  const s = Math.sin(clamp(lat, -85.0511, 85.0511) * D2R);
  return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * 2 ** z;
};
/** Latitude (deg) of a fractional Web-Mercator tile row at zoom z. */
const latOfMercY = (y: number, z: number) => Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / 2 ** z))) / D2R;

export class ElevationService {
  private readonly tiles = new Map<string, TileEntry>();
  private readonly planes = new Map<number, RunwayPlane | null>();
  private readonly planePending = new Map<number, Promise<RunwayPlane | null>>();
  private clock = 0;
  private active = 0;
  private readonly queue: (() => void)[] = [];
  /** Number of tiles still downloading (for a loading indicator). */
  pendingTiles = 0;

  constructor(
    private readonly data: WorldData | null,
    private readonly decoder: TileDecoder = decodeTerrarium,
    private readonly maxCachedTiles = 220,
  ) {}

  // ------------------------------------------------------------------ tiles

  private fetchTile(z: number, x: number, y: number): TileEntry {
    const n = 2 ** z;
    const xx = ((x % n) + n) % n;
    const key = `${z}/${xx}/${y}`;
    let e = this.tiles.get(key);
    if (e) {
      e.used = ++this.clock;
      return e;
    }
    const entry: TileEntry = { data: null, promise: Promise.resolve(null), used: ++this.clock, failed: false };
    this.pendingTiles++;
    entry.promise = new Promise<void>((resolve) => {
      const run = () => {
        this.active++;
        resolve();
      };
      if (this.active < 8) run();
      else this.queue.push(run);
    })
      .then(() => (y < 0 || y >= n ? null : this.decoder(TERRAIN_URL.replace("{z}", String(z)).replace("{x}", String(xx)).replace("{y}", String(y)))))
      .catch(() => {
        entry.failed = true;
        return null;
      })
      .then((data) => {
        this.active--;
        this.pendingTiles--;
        this.queue.shift()?.();
        // Missing tiles (open ocean) are sea level.
        entry.data = data ?? new Float32Array(TILE * TILE);
        if (data) {
          // Flatten the sea: clamp ocean depths to sea level (see BELOW_SEA_LEVEL_LAND).
          const floor = z >= 7 ? seaFloorM(latOfMercY(y + 0.5, z), ((xx + 0.5) / n) * 360 - 180) : 0;
          for (let i = 0; i < data.length; i++) if (data[i]! < floor) data[i] = floor;
        }
        return entry.data;
      });
    this.tiles.set(key, entry);
    e = entry;
    if (this.tiles.size > this.maxCachedTiles) this.evict();
    return e;
  }

  private evict() {
    const entries = [...this.tiles.entries()].filter(([, e]) => e.data).sort((a, b) => a[1].used - b[1].used);
    for (let i = 0; i < entries.length - this.maxCachedTiles * 0.8; i++) this.tiles.delete(entries[i]![0]);
  }

  /** Bilinear sample of a decoded tile at fractional pixel coordinates (edge-aligned, clamped). */
  private static sample(d: Float32Array, u: number, v: number): number {
    const x0 = clamp(Math.floor(u), 0, TILE - 1);
    const y0 = clamp(Math.floor(v), 0, TILE - 1);
    const x1 = Math.min(TILE - 1, x0 + 1);
    const y1 = Math.min(TILE - 1, y0 + 1);
    const fx = clamp(u - x0, 0, 1);
    const fy = clamp(v - y0, 0, 1);
    const a = d[y0 * TILE + x0]!;
    const b = d[y0 * TILE + x1]!;
    const c = d[y1 * TILE + x0]!;
    const e = d[y1 * TILE + x1]!;
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + e) * fx * fy;
  }

  /** Natural terrain height (m), no runway flattening. Null until the tile has loaded. */
  rawHeightM(lat: number, lon: number): number | null {
    for (let z = SOURCE_MAX_ZOOM; z >= SOURCE_MAX_ZOOM - 5; z--) {
      const fx = mercX(lon, z);
      const fy = mercY(lat, z);
      const x = Math.floor(fx);
      const y = Math.floor(fy);
      const n = 2 ** z;
      const e = this.tiles.get(`${z}/${((x % n) + n) % n}/${y}`);
      if (e?.data) {
        e.used = ++this.clock;
        return ElevationService.sample(e.data, (fx - x) * TILE, (fy - y) * TILE);
      }
      if (z === SOURCE_MAX_ZOOM) this.fetchTile(z, x, y); // start loading the detailed tile
    }
    return null;
  }

  private async rawHeightAsync(lat: number, lon: number): Promise<number> {
    const z = SOURCE_MAX_ZOOM;
    const fx = mercX(lon, z);
    const fy = mercY(lat, z);
    const x = Math.floor(fx);
    const y = Math.floor(fy);
    const d = await this.fetchTile(z, x, y).promise;
    return d ? ElevationService.sample(d, (fx - x) * TILE, (fy - y) * TILE) : 0;
  }

  // ------------------------------------------------------------------ runway flattening

  private async buildPlane(rw: Runway): Promise<RunwayPlane | null> {
    const [a, b] = rw.ends;
    const [rawA, rawB] = await Promise.all([this.rawHeightAsync(a.lat, a.lon), this.rawHeightAsync(b.lat, b.lon)]);
    const pick = (pubFt: number | null, raw: number) => (pubFt !== null && Math.abs(pubFt * M_PER_FT - raw) < MAX_ELEV_DISAGREEMENT_M ? pubFt * M_PER_FT : raw);
    const cLat = (a.lat + b.lat) / 2;
    const cLon = (a.lon + b.lon) / 2;
    const h = a.headingTrue * D2R;
    return {
      cLat,
      cLon,
      cosLat: Math.cos(cLat * D2R),
      sinH: Math.sin(h),
      cosH: Math.cos(h),
      halfLenM: (rw.lengthFt * M_PER_FT) / 2,
      halfWidM: (rw.widthFt * M_PER_FT) / 2,
      hA: pick(a.elevFt, rawA),
      hB: pick(b.elevFt, rawB),
    };
  }

  private planeFor(rw: Runway): RunwayPlane | null | undefined {
    const p = this.planes.get(rw.index);
    if (p !== undefined) return p;
    if (!this.planePending.has(rw.index)) {
      this.planePending.set(
        rw.index,
        this.buildPlane(rw)
          .catch(() => null)
          .then((plane) => {
            this.planes.set(rw.index, plane);
            this.planePending.delete(rw.index);
            return plane;
          }),
      );
    }
    return undefined;
  }

  private async planesNear(lat: number, lon: number, marginNm: number): Promise<RunwayPlane[]> {
    if (!this.data) return [];
    const rws = this.data.runwaysNear(lat, lon, marginNm);
    const out: RunwayPlane[] = [];
    await Promise.all(
      rws.map(async (rw) => {
        let p = this.planeFor(rw);
        if (p === undefined) p = await this.planePending.get(rw.index);
        if (p) out.push(p);
      }),
    );
    return out;
  }

  private static flatten(planes: RunwayPlane[], lat: number, lon: number, h: number): number {
    let wMax = 0;
    let wSum = 0;
    let hSum = 0;
    for (const p of planes) {
      const north = (lat - p.cLat) * 60 * M_PER_NM;
      const east = (lon - p.cLon) * 60 * M_PER_NM * p.cosLat;
      const along = north * p.cosH + east * p.sinH;
      const across = -north * p.sinH + east * p.cosH;
      const d = Math.max(Math.abs(along) - (p.halfLenM + END_MARGIN_M), Math.abs(across) - (p.halfWidM + SIDE_MARGIN_M), 0);
      if (d >= BLEND_M) continue;
      const w = 1 - smoothstep(0, BLEND_M, d);
      const t = clamp((along + p.halfLenM) / (2 * p.halfLenM), 0, 1);
      const hp = p.hA + (p.hB - p.hA) * t;
      wMax = Math.max(wMax, w);
      wSum += w;
      hSum += w * hp;
    }
    return wSum > 0 ? h * (1 - wMax) + (hSum / wSum) * wMax : h;
  }

  /** Ground height in metres including runway flattening; null until the terrain under the point has loaded. */
  heightM(lat: number, lon: number): number | null {
    const raw = this.rawHeightM(lat, lon);
    if (raw === null) return null;
    if (!this.data) return raw;
    const rws = this.data.runwaysNear(lat, lon, 0.45);
    if (!rws.length) return raw;
    const planes: RunwayPlane[] = [];
    for (const rw of rws) {
      const p = this.planeFor(rw);
      if (p) planes.push(p);
    }
    return planes.length ? ElevationService.flatten(planes, lat, lon, raw) : raw;
  }

  /** Ground elevation in feet MSL under a point (what the wheels touch). */
  groundFt(lat: number, lon: number): number | null {
    const m = this.heightM(lat, lon);
    return m === null ? null : m * FT_PER_M;
  }

  /** Elevation of the flattened runway surface at a runway end, ft (after `ensure`). */
  runwayEndElevFt(rw: Runway, endIndex: 0 | 1): number | null {
    const p = this.planes.get(rw.index);
    return p ? (endIndex === 0 ? p.hA : p.hB) * FT_PER_M : null;
  }

  /**
   * Make sure detailed terrain (and runway surfaces) are loaded around a point — call before
   * placing the aircraft so the first physics step has real ground under it.
   */
  async ensure(lat: number, lon: number, radiusNm = 1.5): Promise<void> {
    const z = SOURCE_MAX_ZOOM;
    const dLat = radiusNm / 60;
    const dLon = radiusNm / 60 / Math.max(0.1, Math.cos(lat * D2R));
    const x0 = Math.floor(mercX(lon - dLon, z));
    const x1 = Math.floor(mercX(lon + dLon, z));
    const y0 = Math.floor(mercY(lat + dLat, z));
    const y1 = Math.floor(mercY(lat - dLat, z));
    const jobs: Promise<unknown>[] = [];
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) jobs.push(this.fetchTile(z, x, y).promise);
    jobs.push(this.planesNear(lat, lon, radiusNm + 0.5));
    await Promise.all(jobs);
  }

  /** Keep the terrain around the aircraft loaded while flying (cheap; call about once a second). */
  prefetch(lat: number, lon: number): void {
    const z = SOURCE_MAX_ZOOM;
    const x = Math.floor(mercX(lon, z));
    const y = Math.floor(mercY(lat, z));
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) this.fetchTile(z, x + dx, y + dy);
    if (this.data) for (const rw of this.data.runwaysNear(lat, lon, 2)) this.planeFor(rw);
  }

  // ------------------------------------------------------------------ CesiumJS

  /**
   * Height grid for a CesiumJS globe tile (Web-Mercator tiling, rows north→south). Globe level L
   * uses source zoom L−2, so one downloaded PNG feeds sixteen globe tiles.
   */
  async cesiumHeights(x: number, y: number, level: number): Promise<Float32Array> {
    const zs = clamp(level - 2, 0, SOURCE_MAX_ZOOM);
    const shift = level - zs;
    const scale = 2 ** shift;
    const sx = Math.floor(x / scale);
    const sy = Math.floor(y / scale);
    const d = await this.fetchTile(zs, sx, sy).promise;
    const out = new Float32Array(GRID * GRID);
    if (!d) return out;
    const sub = TILE / scale; // source pixels spanned by this globe tile
    const u0 = (x - sx * scale) * sub;
    const v0 = (y - sy * scale) * sub;
    const step = sub / (GRID - 1);
    for (let j = 0; j < GRID; j++) {
      for (let i = 0; i < GRID; i++) out[j * GRID + i] = ElevationService.sample(d, u0 + i * step, v0 + j * step);
    }
    // Flatten runways (only where tiles are small enough for a runway to matter).
    if (this.data && level >= 9) {
      const n = 2 ** level;
      const lonW = (x / n) * 360 - 180;
      const lonE = ((x + 1) / n) * 360 - 180;
      const latN = latOfMercY(y, level);
      const latS = latOfMercY(y + 1, level);
      const cLat = (latN + latS) / 2;
      const cLon = (lonW + lonE) / 2;
      const halfDiagNm = (Math.hypot((latN - latS) * 60, (lonE - lonW) * 60 * Math.cos(cLat * D2R)) / 2) * 1.05;
      const planes = await this.planesNear(cLat, cLon, halfDiagNm + 0.4);
      if (planes.length) {
        for (let j = 0; j < GRID; j++) {
          const lat = latOfMercY(y + j / (GRID - 1), level);
          for (let i = 0; i < GRID; i++) {
            const lon = lonW + ((lonE - lonW) * i) / (GRID - 1);
            out[j * GRID + i] = ElevationService.flatten(planes, lat, lon, out[j * GRID + i]!);
          }
        }
      }
    }
    return out;
  }
}
