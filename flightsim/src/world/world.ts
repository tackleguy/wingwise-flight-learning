/**
 * The 3D world: a CesiumJS globe (Apache-2.0, used WITHOUT Cesium ion — no token, no account)
 * with real terrain elevation and satellite imagery streamed from open, keyless sources.
 *
 *   terrain   Terrain Tiles on AWS Open Data (Mapzen/Tilezen "terrarium")           — see ./elevation.ts
 *   imagery   NASA GIBS Blue Marble (public domain) as the always-available base,
 *             Sentinel-2 cloudless 2016 by EOX (CC BY 4.0) for detail,
 *             optional USGS National Map imagery over the USA (public domain),
 *             NASA GIBS VIIRS city lights on the night side.
 *
 * The simulator drives the camera and calls render() itself (one render per animation frame).
 */
import "./cesium-base";
import {
  Cartesian3,
  CesiumWidget,
  Credit,
  CreditDisplay,
  CustomHeightmapTerrainProvider,
  Ellipsoid,
  HeadingPitchRoll,
  ImageryLayer,
  Ion,
  JulianDate,
  Math as CesiumMath,
  Matrix4,
  Rectangle,
  Transforms,
  UrlTemplateImageryProvider,
  WebMercatorTilingScheme,
  type Camera,
  type Globe,
  type Scene,
} from "cesium";
import { M_PER_FT } from "@/core/math";
import type { Quality } from "@/core/types";
import type { ElevationService } from "./elevation";

/** Deepest globe tile level that gets real elevation samples; closer tiles are interpolated by CesiumJS. */
const TERRAIN_MAX_LEVEL = 15;

class TerrainProvider extends CustomHeightmapTerrainProvider {
  override getTileDataAvailable(_x: number, _y: number, level: number): boolean | undefined {
    return level <= TERRAIN_MAX_LEVEL;
  }
}

export const ATTRIBUTION = {
  terrain: "Terrain: Mapzen / Tilezen Terrain Tiles on AWS (SRTM, USGS 3DEP, GMTED2010, ETOPO1 and others)",
  blueMarble: "NASA GIBS / Blue Marble",
  sentinel: 'Sentinel-2 cloudless – <a href="https://s2maps.eu" target="_blank" rel="noopener">s2maps.eu</a> by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2016 &amp; 2017)',
  usgs: "USGS The National Map: Orthoimagery",
  nightLights: "NASA GIBS / Earth Observatory city lights",
} as const;

const NED_FRAME = Transforms.localFrameToFixedFrameGenerator("north", "west");
const scratchHpr = new HeadingPitchRoll();
const scratchPos = new Cartesian3();

/** Earth-fixed position for a latitude/longitude (degrees) and altitude (feet). */
export function ecef(lat: number, lon: number, altFt: number, result?: Cartesian3): Cartesian3 {
  return Cartesian3.fromDegrees(lon, lat, altFt * M_PER_FT, Ellipsoid.WGS84, result ?? new Cartesian3());
}

/**
 * Placement matrix for something at a position with aviation heading / pitch / roll in degrees.
 * Local axes of the result: +X forward (the nose), +Y left wing, +Z up.
 * glTF models authored with the nose toward +Z and up +Y end up correctly oriented in CesiumJS.
 */
export function aircraftMatrix(lat: number, lon: number, altFt: number, headingDeg: number, pitchDeg: number, rollDeg: number, result?: Matrix4): Matrix4 {
  ecef(lat, lon, altFt, scratchPos);
  scratchHpr.heading = CesiumMath.toRadians(headingDeg);
  scratchHpr.pitch = CesiumMath.toRadians(pitchDeg);
  scratchHpr.roll = CesiumMath.toRadians(rollDeg);
  return Transforms.headingPitchRollToFixedFrame(scratchPos, scratchHpr, Ellipsoid.WGS84, NED_FRAME, result ?? new Matrix4());
}

/** The few CSS rules CesiumJS needs (its full widget stylesheet is not used). */
function injectStyle(): void {
  if (typeof document === "undefined" || document.getElementById("skyready-cesium-style")) return;
  const style = document.createElement("style");
  style.id = "skyready-cesium-style";
  style.textContent =
    ".cesium-widget{position:relative;width:100%;height:100%;overflow:hidden}" +
    ".cesium-widget canvas{display:block;width:100%;height:100%;touch-action:none;outline:none}" +
    ".cesium-credit-lightbox-overlay{display:none}" +
    ".cesium-credit-textContainer,.cesium-credit-logoContainer{display:inline}" +
    ".cesium-credit-expand-link{display:none}";
  document.head.appendChild(style);
}

export interface WorldOptions {
  container: HTMLElement;
  elevation: ElevationService;
  quality: Quality;
  hdUsImagery?: boolean;
  /** Element that receives the data attribution line (required by the imagery licences). */
  creditContainer?: HTMLElement;
}

export class World {
  readonly widget: CesiumWidget;
  readonly scene: Scene;
  readonly camera: Camera;
  readonly globe: Globe;
  readonly elevation: ElevationService;
  /** Night-side city lights layer (the sky module may adjust its brightness). */
  readonly nightLayer: ImageryLayer;
  private usgsLayer: ImageryLayer | null = null;
  private quality: Quality = "medium";
  private readonly time = new JulianDate();

  constructor(opts: WorldOptions) {
    this.elevation = opts.elevation;
    // No Cesium ion: make sure nothing ever asks for a token, and credit the library by name
    // instead of showing the "Cesium ion" service logo.
    Ion.defaultAccessToken = "";
    CreditDisplay.cesiumCredit = new Credit('<a href="https://cesium.com/platform/cesiumjs/" target="_blank" rel="noopener">CesiumJS</a>', true);
    injectStyle();

    const creditContainer = opts.creditContainer ?? document.createElement("div");
    const terrainProvider = new TerrainProvider({
      width: 65,
      height: 65,
      tilingScheme: new WebMercatorTilingScheme(),
      callback: (x, y, level) => this.elevation.cesiumHeights(x, y, level),
      credit: new Credit(ATTRIBUTION.terrain, true),
    });

    this.widget = new CesiumWidget(opts.container, {
      baseLayer: new ImageryLayer(
        new UrlTemplateImageryProvider({
          url: "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_ShadedRelief_Bathymetry/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpeg",
          maximumLevel: 8,
          credit: new Credit(ATTRIBUTION.blueMarble, true),
        }),
      ),
      terrainProvider,
      scene3DOnly: true,
      useDefaultRenderLoop: false,
      useBrowserRecommendedResolution: true,
      requestRenderMode: false,
      shadows: false,
      creditContainer,
      contextOptions: { webgl: { alpha: false, antialias: false, powerPreference: "high-performance", preserveDrawingBuffer: false } },
      msaaSamples: 1,
    });
    this.scene = this.widget.scene;
    this.camera = this.scene.camera;
    this.globe = this.scene.globe;

    const layers = this.widget.imageryLayers;
    layers.add(
      new ImageryLayer(
        new UrlTemplateImageryProvider({
          url: "https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/default/g/{z}/{y}/{x}.jpg",
          maximumLevel: 14,
          credit: new Credit(ATTRIBUTION.sentinel, true),
        }),
      ),
    );
    this.nightLayer = new ImageryLayer(
      new UrlTemplateImageryProvider({
        url: "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_CityLights_2012/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpg",
        maximumLevel: 8,
        credit: new Credit(ATTRIBUTION.nightLights, true),
      }),
      { dayAlpha: 0, nightAlpha: 0.85, brightness: 1.6 },
    );
    layers.add(this.nightLayer);
    if (opts.hdUsImagery) this.setHdUsImagery(true);

    const scene = this.scene;
    const globe = this.globe;
    globe.enableLighting = true;
    globe.dynamicAtmosphereLighting = true;
    globe.dynamicAtmosphereLightingFromSun = true;
    globe.showGroundAtmosphere = true;
    globe.depthTestAgainstTerrain = true;
    globe.preloadAncestors = true;
    globe.preloadSiblings = false;
    globe.tileCacheSize = 300;
    scene.highDynamicRange = false;
    scene.fog.enabled = true;
    scene.screenSpaceCameraController.enableInputs = false;
    scene.screenSpaceCameraController.enableCollisionDetection = false;
    this.widget.clock.shouldAnimate = false;
    this.camera.frustum.near = 0.5;

    this.setQuality(opts.quality);
  }

  /** Graphics quality: trades terrain/imagery detail and resolution for frame rate. */
  setQuality(q: Quality): void {
    this.quality = q;
    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    const w = this.widget;
    if (q === "low") {
      this.globe.maximumScreenSpaceError = 4;
      w.useBrowserRecommendedResolution = true;
      w.resolutionScale = 0.75;
      this.scene.msaaSamples = 1;
      this.globe.tileCacheSize = 150;
    } else if (q === "medium") {
      this.globe.maximumScreenSpaceError = 2.5;
      w.useBrowserRecommendedResolution = true;
      w.resolutionScale = 1;
      this.scene.msaaSamples = 2;
      this.globe.tileCacheSize = 300;
    } else {
      this.globe.maximumScreenSpaceError = 1.6;
      w.useBrowserRecommendedResolution = false;
      w.resolutionScale = Math.min(dpr, 2) / dpr;
      this.scene.msaaSamples = 4;
      this.globe.tileCacheSize = 500;
    }
  }

  getQuality(): Quality {
    return this.quality;
  }

  /** Sharper public-domain USGS aerial imagery over the United States (other areas keep the global imagery). */
  setHdUsImagery(on: boolean): void {
    const layers = this.widget.imageryLayers;
    if (on && !this.usgsLayer) {
      this.usgsLayer = new ImageryLayer(
        new UrlTemplateImageryProvider({
          url: "https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}",
          minimumLevel: 9,
          maximumLevel: 16,
          // United States incl. Alaska and Hawaii; tiles outside the coverage simply do not exist.
          rectangle: Rectangle.fromDegrees(-179.9, 17.5, -64.5, 71.6),
          credit: new Credit(ATTRIBUTION.usgs, true),
        }),
      );
      // Above the global imagery, below the night lights.
      layers.add(this.usgsLayer, layers.indexOf(this.nightLayer));
    } else if (!on && this.usgsLayer) {
      layers.remove(this.usgsLayer, true);
      this.usgsLayer = null;
    }
  }

  /** Set the simulated date/time (drives the sun, the stars and day/night lighting). */
  setUtc(utcMs: number): void {
    JulianDate.fromDate(new Date(utcMs), this.time);
    this.widget.clock.currentTime = this.time;
  }

  /** True when all terrain and imagery needed for the current view has arrived. */
  get tilesLoaded(): boolean {
    return this.globe.tilesLoaded;
  }

  resize(): void {
    this.widget.resize();
  }

  render(): void {
    this.widget.resize();
    this.widget.render();
  }

  destroy(): void {
    if (!this.widget.isDestroyed()) this.widget.destroy();
  }
}
