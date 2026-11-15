/**
 * The sky module: everything the weather LOOKS like — time of day and night, haze and fog that
 * match the reported visibility, cloud layers (drawn from the same cloud field the flight side
 * uses for "am I in cloud?"), rain and snow.
 *
 * How it is drawn: two full-screen passes added to CesiumJS's post-processing (see `shaders.ts`):
 * a cloud pass (ray-marched, usually at reduced resolution) and a final pass that lays haze over
 * the scene using the depth buffer, puts the clouds on top, whites the view out inside cloud and
 * adds precipitation. Nothing is added to the 3-D scene itself, so picking and depth are untouched.
 *
 * The module only READS `sim.env` (the weather module writes it) and eases toward it, so changes
 * never pop. It also owns: `scene.fog` (used only to stop loading terrain that haze hides),
 * `scene.light.intensity` and the city-lights layer (how dark the night is).
 */
import * as CesiumNamespace from "cesium";
import {
  Cartesian3,
  Cartesian4,
  PixelDatatype,
  PixelFormat,
  PostProcessStage,
  PostProcessStageComposite,
  PostProcessStageSampleMode,
  TextureMagnificationFilter,
  TextureMinificationFilter,
} from "cesium";
import { CLOUD_NOISE, CLOUD_NOISE_SIZE, layerDensity } from "@/core/clouds";
import { clamp, D2R, FT_PER_M, R2D } from "@/core/math";
import { windAt, type Sim } from "@/core/sim";
import { daylight, localSolarHours, sunPosition } from "@/core/sun";
import type { CloudLayer, Quality, SpawnResult } from "@/core/types";
import { ecef, type World } from "@/world/world";
import type { Sky, SkyDebugInfo } from "./api";
import {
  CLEAN_AIR_SCALE_HEIGHT_M,
  M_PER_FT,
  cleanAirExtinctionPerM,
  coverFraction,
  coverShade,
  coverThreshold,
  drawnVisibilitySm,
  ease,
  extinctionPerM,
  fieldMapping,
  fieldOrigin,
  fogDepthM,
  hazeCullDistanceM,
  hazeScaleHeightM,
  layerLatticeOrigin,
  newFieldMapping,
  newPalette,
  nightSettings,
  precipIntensity,
  skyPalette,
  utcForLocalDate,
  utcForLocalSolarTime,
  weatherExtinctionPerM,
  type NightSettings,
} from "./model";
import { CLOUD_EXTINCTION_PER_M, DETAIL_CELL_M, MAX_LAYERS, cloudPassShader, finalPassShader, type ShaderOptions } from "./shaders";

export type { Sky, SkyApi, SkyDebugInfo } from "./api";

// CesiumJS exports its low-level renderer classes but does not describe them in its type definitions.
interface GpuTexture {
  destroy(): void;
}
interface CesiumRenderer {
  Texture: new (options: Record<string, unknown>) => GpuTexture;
  Sampler: new (options: Record<string, unknown>) => unknown;
  TextureWrap: { REPEAT: number };
}
const { Texture, Sampler, TextureWrap } = CesiumNamespace as unknown as CesiumRenderer;

interface QualityPreset {
  /** Resolution of the cloud pass relative to the screen (per axis). */
  scale: number;
  /** Upper limit for the number of pixels the cloud pass shades (big screens get a smaller scale). */
  pixelBudget: number;
  /** Most density look-ups for one cloud layer along one sight line (only reached by lines that skim a layer). */
  maxIterations: number;
  /** Search step growth per step: step ≈ growth × (distance + 700 m). */
  growth: number;
  /** Clouds nearer than this are marched exactly, metres. */
  exactRangeM: number;
  /** … then softly out to here; beyond it a layer is an even veil. */
  farRangeM: number;
  lightSamples: number;
  detailOctaves: number;
  precipLayers: number;
}

const QUALITY: Record<Quality, QualityPreset> = {
  low: { scale: 0.5, pixelBudget: 0.45e6, maxIterations: 36, growth: 0.11, exactRangeM: 10000, farRangeM: 30000, lightSamples: 0, detailOctaves: 0, precipLayers: 2 },
  medium: { scale: 0.5, pixelBudget: 0.8e6, maxIterations: 64, growth: 0.07, exactRangeM: 16000, farRangeM: 45000, lightSamples: 2, detailOctaves: 1, precipLayers: 3 },
  high: { scale: 1, pixelBudget: 2.2e6, maxIterations: 110, growth: 0.045, exactRangeM: 30000, farRangeM: 70000, lightSamples: 4, detailOctaves: 2, precipLayers: 4 },
};
const SCALES = [1, 0.75, 0.5, 0.375, 0.25];

/** One cloud layer as it is being drawn (eased toward `env.clouds[index]`). */
interface Slot {
  baseM: number;
  topM: number;
  threshold: number;
  fraction: number;
  /** 0 = not drawn … 1 = fully there (layers fade in and out). */
  amount: number;
  /** 1 for an overcast (its top surface gets gentle dips), partly for broken. */
  overcast: number;
  /** How much this layer darkens the ground under it, 0..1. */
  shade: number;
}

let stageSerial = 0;

export function createSky(world: World): Sky {
  const scene = world.scene;
  const camera = world.camera;
  const context = (scene as unknown as { context: { drawingBufferWidth: number; drawingBufferHeight: number } }).context;

  // ------------------------------------------------------------------ state

  let sim: Sim | null = null;
  let enabled = true;
  let disposed = false;
  let needSnap = true;
  let pendingSolarHours: number | null = null;
  let pendingDate: [number, number, number] | null = null;

  let sunElevation = 60;
  let sunAzimuth = 180;
  let sunKeyUtc = NaN;
  let sunKeyLat = NaN;
  let sunKeyLon = NaN;

  let lnVis = Math.log(30);
  let hazeBaseM = 0;
  let precipAmount = 0;
  let precipKind: "rain" | "snow" = "rain";
  let precipPhase = 0;
  let cloudFog = 0;
  let overcastAbove = 0;
  let groundShade = 0;
  let shadeBaseM = 1e5;
  let cullDistanceM = 3e5;
  let cameraInCloud = 0;
  let lastRenderMs = 0;
  let stepView = false;

  const slots: Slot[] = [];
  for (let i = 0; i < MAX_LAYERS; i++) slots.push({ baseM: 0, topM: 0, threshold: 2, fraction: 0, amount: 0, overcast: 0, shade: 0 });
  const order: number[] = [];

  const palette = newPalette();
  const night: NightSettings = { lightIntensity: 2, nightAlpha: 0, lightsBrightness: 1 };
  const map = newFieldMapping();
  let mapLat = 999;
  let mapLon = 999;
  const lattice: [number, number, number, number] = [0, 0, 0, 0];

  // ------------------------------------------------------------------ uniforms (mutated in place, never re-created)

  const U = {
    camDir: new Cartesian3(0, 1, 0),
    camRight: new Cartesian3(1, 0, 0),
    camUp: new Cartesian3(0, 0, 1),
    cam: new Cartesian4(0, 1 / (2 * 6371000), 6371000, 0),
    haze: new Cartesian4(1e-5, 1500, 0, 0),
    haze2: new Cartesian4(cleanAirExtinctionPerM, CLEAN_AIR_SCALE_HEIGHT_M, 0, 0),
    hazeColor: new Cartesian3(0.8, 0.85, 0.9),
    sun: new Cartesian4(0, 0, 1, 0),
    sunColor: new Cartesian3(1, 1, 1),
    ambColor: new Cartesian3(0.6, 0.7, 0.8),
    layerCount: 0,
    layerA: [new Cartesian4(), new Cartesian4(), new Cartesian4(), new Cartesian4()],
    layerB: [new Cartesian4(), new Cartesian4(), new Cartesian4(), new Cartesian4()],
    layerC: [new Cartesian4(), new Cartesian4(), new Cartesian4(), new Cartesian4()],
    fieldLin: new Cartesian4(1, 0, 0, 1),
    fieldQuadX: new Cartesian3(0, 0, 0),
    fieldQuadY: new Cartesian3(0, 0, 0),
    detail: new Cartesian4(0, 0, 1 / DETAIL_CELL_M, 0.075),
    sunField: new Cartesian4(0, 1, 1, 0),
    march: new Cartesian4(64, 0.07, 16000, 45000),
    cloudsOn: 0,
    sceneTint: new Cartesian4(1, 1, 1, 0),
    shade: new Cartesian4(0, 1e5, 0, 0),
    cloudFog: new Cartesian4(1, 1, 1, 0),
    precip: new Cartesian4(0, 0, 8, 0.001),
    precipDir: new Cartesian3(0, 0, -1),
    precipAx1: new Cartesian3(1, 0, 0),
    precipAx2: new Cartesian3(0, 1, 0),
    precipColor: new Cartesian3(0.8, 0.84, 0.9),
  };

  // ------------------------------------------------------------------ GPU resources

  const noiseTexture = (() => {
    // R: the shared cloud table. G: the same table shifted by (37,17) — lets the shader build 3-D noise from one look-up.
    const n = CLOUD_NOISE_SIZE;
    const data = new Uint8Array(n * n * 4);
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const o = (y * n + x) * 4;
        data[o] = CLOUD_NOISE[y * n + x]!;
        data[o + 1] = CLOUD_NOISE[((y + 17) % n) * n + ((x + 37) % n)]!;
        data[o + 2] = CLOUD_NOISE[((y + 59) % n) * n + ((x + 101) % n)]!;
        data[o + 3] = 255;
      }
    }
    return new Texture({
      context,
      pixelFormat: PixelFormat.RGBA,
      pixelDatatype: PixelDatatype.UNSIGNED_BYTE,
      source: { width: n, height: n, arrayBufferView: data },
      flipY: false,
      sampler: new Sampler({
        wrapS: TextureWrap.REPEAT,
        wrapT: TextureWrap.REPEAT,
        minificationFilter: TextureMinificationFilter.LINEAR,
        magnificationFilter: TextureMagnificationFilter.LINEAR,
      }),
    });
  })();

  let composite: PostProcessStageComposite | null = null;
  let stageKey = "";
  let stageInfo = { quality: "medium" as Quality, scale: 0.5, volumetric: true, preset: QUALITY.medium };

  function commonUniforms(): Record<string, unknown> {
    return {
      u_camDir: () => U.camDir,
      u_camRight: () => U.camRight,
      u_camUp: () => U.camUp,
      u_cam: () => U.cam,
      u_haze: () => U.haze,
      u_haze2: () => U.haze2,
      u_hazeColor: () => U.hazeColor,
      u_sun: () => U.sun,
      u_sunColor: () => U.sunColor,
      u_ambColor: () => U.ambColor,
    };
  }

  function pickScale(preset: QualityPreset): number {
    const pixels = Math.max(1, context.drawingBufferWidth * context.drawingBufferHeight);
    const wanted = Math.min(preset.scale, Math.sqrt(preset.pixelBudget / pixels));
    for (const s of SCALES) if (s <= wanted + 1e-6) return s;
    return SCALES[SCALES.length - 1]!;
  }

  /** (Re)build the two passes when the quality, the 3-D clouds setting or the screen size class changes. */
  function ensureStages(): void {
    const quality: Quality = sim?.settings.quality ?? "medium";
    const preset = QUALITY[quality] ?? QUALITY.medium;
    const volumetric = sim?.settings.clouds3d ?? true;
    const scale = pickScale(preset);
    const key = `${quality}|${volumetric}|${scale}|${stepView}`;
    if (key === stageKey && composite) return;
    if (composite) scene.postProcessStages.remove(composite);
    composite = null;
    stageKey = key;
    stageInfo = { quality, scale, volumetric, preset };

    const options: ShaderOptions = {
      volumetric,
      maxIterations: preset.maxIterations,
      lightSamples: volumetric ? preset.lightSamples : 0,
      detailOctaves: volumetric ? preset.detailOctaves : 0,
      precipLayers: preset.precipLayers,
      cloudsFullRes: scale >= 1,
      countSteps: stepView,
    };
    const id = ++stageSerial;
    const clouds = new PostProcessStage({
      name: `skyready_sky_clouds_${id}`,
      fragmentShader: cloudPassShader(options),
      textureScale: scale,
      sampleMode: PostProcessStageSampleMode.NEAREST,
      uniforms: {
        ...commonUniforms(),
        u_noise: () => noiseTexture,
        u_layerCount: () => U.layerCount,
        u_layerA: () => U.layerA,
        u_layerB: () => U.layerB,
        u_layerC: () => U.layerC,
        u_fieldLin: () => U.fieldLin,
        u_fieldQuadX: () => U.fieldQuadX,
        u_fieldQuadY: () => U.fieldQuadY,
        u_detail: () => U.detail,
        u_sunField: () => U.sunField,
        u_march: () => U.march,
      },
    });
    const final = new PostProcessStage({
      name: `skyready_sky_final_${id}`,
      fragmentShader: finalPassShader(options),
      sampleMode: PostProcessStageSampleMode.NEAREST,
      uniforms: {
        ...commonUniforms(),
        u_clouds: clouds.name,
        u_cloudsOn: () => U.cloudsOn,
        u_sceneTint: () => U.sceneTint,
        u_shade: () => U.shade,
        u_cloudFog: () => U.cloudFog,
        u_precip: () => U.precip,
        u_precipDir: () => U.precipDir,
        u_precipAx1: () => U.precipAx1,
        u_precipAx2: () => U.precipAx2,
        u_precipColor: () => U.precipColor,
      },
    });
    composite = new PostProcessStageComposite({ name: `skyready_sky_${id}`, stages: [clouds, final], inputPreviousStageTexture: false });
    composite.enabled = enabled;
    scene.postProcessStages.add(composite);
  }

  // ------------------------------------------------------------------ CesiumJS settings this module owns

  const fog = scene.fog;
  const savedFog = {
    enabled: fog.enabled,
    renderable: fog.renderable,
    density: fog.density,
    heightScalar: fog.heightScalar,
    heightFalloff: fog.heightFalloff,
    maxHeight: fog.maxHeight,
  };
  const nightLayer = world.nightLayer;
  const savedNight = { nightAlpha: nightLayer.nightAlpha, brightness: nightLayer.brightness, gamma: nightLayer.gamma };
  const savedLightIntensity = (scene.light as { intensity?: number }).intensity ?? 2;

  function applyFog(): void {
    if (enabled) {
      // CesiumJS's own fog is only used to stop loading terrain that our haze hides anyway; it is not drawn.
      fog.enabled = true;
      fog.renderable = false;
      fog.heightScalar = 1;
      fog.heightFalloff = 0;
      fog.maxHeight = 800000;
      fog.density = 6.06 / cullDistanceM; // CesiumMath.fog() reaches exactly 1 (tile dropped) at distance × density ≈ 6.06
    } else {
      Object.assign(fog, savedFog);
    }
  }

  function applyNight(): void {
    nightSettings(sunElevation, night);
    const light = scene.light as { intensity?: number };
    if (typeof light.intensity === "number") light.intensity = night.lightIntensity;
    nightLayer.gamma = 0.5; // keeps the bright city cores, drops the dark-blue background of the lights picture
    nightLayer.nightAlpha = night.nightAlpha;
    nightLayer.brightness = night.lightsBrightness;
  }

  // ------------------------------------------------------------------ per-frame: weather easing (needs dt)

  function updateSun(s: Sim): void {
    const st = s.state;
    const utc = s.env.utcMs;
    if (utc !== sunKeyUtc || Math.abs(st.lat - sunKeyLat) > 0.02 || Math.abs(st.lon - sunKeyLon) > 0.02) {
      const p = sunPosition(utc, st.lat, st.lon);
      sunElevation = p.elevationDeg;
      sunAzimuth = p.azimuthDeg;
      sunKeyUtc = utc;
      sunKeyLat = st.lat;
      sunKeyLon = st.lon;
    }
  }

  function applyPending(s: Sim): void {
    if (pendingDate) {
      s.env.utcMs = utcForLocalDate(s.env.utcMs, s.state.lon, pendingDate[0], pendingDate[1], pendingDate[2]);
      pendingDate = null;
    }
    if (pendingSolarHours !== null) {
      s.env.utcMs = utcForLocalSolarTime(s.env.utcMs, s.state.lon, pendingSolarHours);
      pendingSolarHours = null;
    }
  }

  function setSlotTarget(slot: Slot, layer: CloudLayer, dt: number, snap: boolean): void {
    const baseM = layer.baseFtMsl * M_PER_FT;
    const topM = (layer.baseFtMsl + Math.max(200, layer.topFtMsl - layer.baseFtMsl)) * M_PER_FT;
    const thr = coverThreshold(layer.cover);
    const frac = coverFraction(layer.cover);
    const ovc = layer.cover === "OVC" ? 1 : layer.cover === "BKN" ? 0.35 : 0;
    const shade = coverShade(layer.cover);
    if (snap || slot.amount <= 0.001) {
      // a layer that was not there appears at its place and fades in
      slot.baseM = baseM;
      slot.topM = topM;
      slot.threshold = thr;
      slot.fraction = frac;
      slot.overcast = ovc;
      slot.shade = shade;
    } else {
      const tau = 0.55;
      slot.baseM = ease(slot.baseM, baseM, dt, tau);
      slot.topM = ease(slot.topM, topM, dt, tau);
      slot.threshold = ease(slot.threshold, thr, dt, tau);
      slot.fraction = ease(slot.fraction, frac, dt, tau);
      slot.overcast = ease(slot.overcast, ovc, dt, tau);
      slot.shade = ease(slot.shade, shade, dt, tau);
    }
    slot.amount = snap ? 1 : Math.min(1, slot.amount + dt / 1.2);
  }

  function frame(s: Sim, dtReal: number): void {
    if (disposed) return;
    sim = s;
    applyPending(s);
    updateSun(s);
    const env = s.env;
    const snap = needSnap;
    needSnap = false;
    const dt = snap ? 0 : clamp(dtReal, 0, 1);
    if (snap) lastRenderMs = 0; // the camera-dependent values below jump too

    // visibility (eased in log space so 30 → 1 mile passes smoothly through all the stages of haze)
    const visTarget = Math.log(drawnVisibilitySm(env));
    lnVis = snap ? visTarget : ease(lnVis, visTarget, dt, 0.6);

    // the height the visibility number applies at: the ground under the aircraft; follows rising ground slowly
    // so that crossing a ridge does not suddenly thicken the haze in the valley below
    const groundM = s.state.groundElevFt * M_PER_FT;
    if (snap) hazeBaseM = groundM;
    else hazeBaseM += clamp(groundM - hazeBaseM, -6 * dt, 1.5 * dt);

    // cloud layers
    for (let i = 0; i < MAX_LAYERS; i++) {
      const slot = slots[i]!;
      const layer = env.clouds[i];
      if (layer && Number.isFinite(layer.baseFtMsl) && Number.isFinite(layer.topFtMsl)) setSlotTarget(slot, layer, dt, snap);
      else slot.amount = snap ? 0 : Math.max(0, slot.amount - dt / 1.2);
    }

    // precipitation: fade out before switching between rain and snow
    const kind = env.precipitation;
    let precipTarget = precipIntensity(kind, env.visibilitySm);
    if (kind !== "none" && kind !== precipKind) {
      if (precipAmount > 0.01 && !snap) precipTarget = 0;
      else precipKind = kind;
    }
    precipAmount = snap ? precipTarget : precipAmount + clamp(precipTarget - precipAmount, -dt / 1.5, dt / 1.5);
  }

  // ------------------------------------------------------------------ per-render: everything that depends on the camera

  const scratchA = new Cartesian3();
  const scratchB = new Cartesian3();
  const scratchAircraft = new Cartesian3();
  const east = new Cartesian3();
  const north = new Cartesian3();
  const up = new Cartesian3();

  const toLocal = (v: Cartesian3, out: Cartesian3, scale: number): Cartesian3 => {
    const x = Cartesian3.dot(v, east) * scale;
    const y = Cartesian3.dot(v, north) * scale;
    const z = Cartesian3.dot(v, up) * scale;
    out.x = x;
    out.y = y;
    out.z = z;
    return out;
  };

  function preRender(): void {
    if (disposed || !sim) return;
    const s = sim;
    const now = performance.now();
    const dt = lastRenderMs ? clamp((now - lastRenderMs) / 1000, 0, 1) : 0;
    lastRenderMs = now;
    ensureStages();
    applyNight();

    // --- camera frame: east / north / up at the camera
    const carto = camera.positionCartographic;
    const lat = carto.latitude;
    const lon = carto.longitude;
    const camH = carto.height;
    const sinLat = Math.sin(lat);
    const cosLat = Math.cos(lat);
    const sinLon = Math.sin(lon);
    const cosLon = Math.cos(lon);
    Cartesian3.fromElements(-sinLon, cosLon, 0, east);
    Cartesian3.fromElements(-sinLat * cosLon, -sinLat * sinLon, cosLat, north);
    Cartesian3.fromElements(cosLat * cosLon, cosLat * sinLon, sinLat, up);
    const frustum = camera.frustum as { fovy?: number; aspectRatio?: number };
    const tanY = Math.tan((frustum.fovy ?? 1) / 2);
    const tanX = tanY * (frustum.aspectRatio ?? context.drawingBufferWidth / Math.max(1, context.drawingBufferHeight));
    toLocal(camera.directionWC, U.camDir, 1);
    toLocal(camera.rightWC, U.camRight, tanX);
    toLocal(camera.upWC, U.camUp, tanY);
    const earthR = Math.max(6.3e6, Cartesian3.magnitude(camera.positionWC) - camH);
    U.cam.x = camH;
    U.cam.y = 1 / (2 * (earthR + camH));
    U.cam.z = earthR;

    const latDeg = lat * R2D;
    const lonDeg = lon * R2D;
    const camAltFt = camH * FT_PER_M;

    // --- is the camera with the aircraft? (decides whose "in cloud" and whose speed applies)
    const st = s.state;
    ecef(st.lat, st.lon, st.altMslFt, scratchAircraft);
    const camToAircraftM = Cartesian3.distance(scratchAircraft, camera.positionWC);

    // --- cloud layers: order them along a sight line (the layer around the camera, then those below going down, then those above going up)
    if (Math.abs(latDeg - mapLat) > 0.002 || Math.abs(lonDeg - mapLon) > 0.002) {
      // the slopes of the cloud layout change slowly: refresh them every couple of hundred metres
      fieldMapping(latDeg, lonDeg, map);
      mapLat = latDeg;
      mapLon = lonDeg;
      U.fieldLin.x = map.xe;
      U.fieldLin.y = map.xn;
      U.fieldLin.z = map.ye;
      U.fieldLin.w = map.yn;
      Cartesian3.fromElements(map.xee, map.xen, map.xnn, U.fieldQuadX);
      Cartesian3.fromElements(map.yee, map.yen, map.ynn, U.fieldQuadY);
    } else {
      fieldOrigin(latDeg, lonDeg, map);
    }
    const cellsPerM = 1 / DETAIL_CELL_M;
    U.detail.x = (((map.x0 * cellsPerM) % 256) + 256) % 256;
    U.detail.y = (((map.y0 * cellsPerM) % 256) + 256) % 256;
    U.detail.z = cellsPerM;
    U.detail.w = 0.075; // the fine noise moves cloud edges by up to about ±100 m

    order.length = 0;
    for (let i = 0; i < MAX_LAYERS; i++) if (slots[i]!.amount > 0.003) order.push(i);
    const rank = (i: number): number => {
      const sl = slots[i]!;
      if (camH >= sl.baseM - 30 && camH <= sl.topM + 30) return -1e9 + sl.baseM; // around the camera: first
      if (sl.topM < camH) return -sl.baseM; // below: nearest (highest) first
      return 1e6 + sl.baseM; // above: nearest (lowest) first
    };
    order.sort((a, b) => rank(a) - rank(b));

    let above = 0;
    let shade = 0;
    let shadeBase = 1e5;
    let rainCloud = -1;
    let rainCloudThickness = -1;
    for (let k = 0; k < order.length; k++) {
      const sl = slots[order[k]!]!;
      const w = sl.shade * sl.amount;
      if (sl.baseM > camH) above = Math.max(above, w);
      if (w > 0.05) {
        shade = Math.max(shade, w);
        shadeBase = Math.min(shadeBase, sl.baseM);
      }
      // the rain comes from the deepest broken / overcast layer, or failing that the deepest layer of any kind
      const score = (sl.shade >= 0.5 ? 1e5 : 0) + (sl.topM - sl.baseM);
      if (score > rainCloudThickness) {
        rainCloudThickness = score;
        rainCloud = order[k]!;
      }
    }
    overcastAbove = dt > 0 ? ease(overcastAbove, above, dt, 0.5) : above;
    groundShade = dt > 0 ? ease(groundShade, shade, dt, 0.5) : shade;
    if (shade > 0.05) shadeBaseM = shadeBase;

    for (let k = 0; k < MAX_LAYERS; k++) {
      const a = U.layerA[k]!;
      const b = U.layerB[k]!;
      const c = U.layerC[k]!;
      const i = order[k];
      if (i === undefined) {
        c.x = 0;
        continue;
      }
      const sl = slots[i]!;
      const thick = sl.topM - sl.baseM;
      a.x = sl.baseM;
      a.y = sl.topM;
      a.z = sl.threshold;
      a.w = sl.fraction;
      layerLatticeOrigin(map, i, lattice);
      b.x = lattice[0];
      b.y = lattice[1];
      b.z = lattice[2];
      b.w = lattice[3];
      c.x = sl.amount;
      c.y = 1 - 0.5 * sl.fraction * (1 - Math.exp(-thick / 900)); // thick, wide-spread cloud has a dark base
      c.z = sl.overcast;
      c.w = i === rainCloud || sl.shade >= 0.5 ? 0.38 * precipAmount : 0; // rain cloud is darker
    }
    U.layerCount = order.length;
    U.cloudsOn = order.length > 0 ? 1 : 0;
    const preset = stageInfo.preset;
    // with three or four layers each gets a little less, so the total stays bounded
    U.march.x = Math.round(preset.maxIterations * (order.length <= 2 ? 1 : order.length === 3 ? 0.8 : 0.7));
    U.march.y = preset.growth;
    U.march.z = preset.exactRangeM;
    U.march.w = preset.farRangeM;

    // --- camera inside cloud? (same shared cloud field as state.inCloud, evaluated at the camera)
    let density = 0;
    const clouds = s.env.clouds;
    for (let i = 0; i < clouds.length && i < MAX_LAYERS; i++) density = Math.max(density, layerDensity(clouds[i]!, i, map.x0, map.y0, camAltFt));
    if (camToAircraftM < 60) density = Math.max(density, st.inCloud); // cockpit / chase view: agree with the flight side's flag
    cameraInCloud = density;
    cloudFog = dt > 0 ? ease(cloudFog, density, dt, 0.25) : density;

    // --- sun, colours
    const el = sunElevation * D2R;
    const az = sunAzimuth * D2R;
    const sx = Math.sin(az) * Math.cos(el);
    const sy = Math.cos(az) * Math.cos(el);
    U.sun.x = sx;
    U.sun.y = sy;
    U.sun.z = Math.sin(el);
    U.sun.w = 0.07 + 0.28 * (1 - clamp((sunElevation - 4) / 20, 0, 1));
    const hLen = Math.max(1e-6, Math.hypot(sx, sy));
    U.sunField.x = (map.xe * sx + map.xn * sy) / hLen;
    U.sunField.y = (map.ye * sx + map.yn * sy) / hLen;

    const visSm = Math.exp(lnVis);
    skyPalette(sunElevation, visSm, overcastAbove, palette);
    const rainMood = 1 - 0.18 * precipAmount * overcastAbove;
    Cartesian3.fromElements(palette.haze[0] * rainMood, palette.haze[1] * rainMood, palette.haze[2] * rainMood, U.hazeColor);
    Cartesian3.fromElements(palette.sun[0], palette.sun[1], palette.sun[2], U.sunColor);
    Cartesian3.fromElements(palette.ambient[0], palette.ambient[1], palette.ambient[2], U.ambColor);
    U.sceneTint.x = palette.sceneTint[0];
    U.sceneTint.y = palette.sceneTint[1];
    U.sceneTint.z = palette.sceneTint[2];
    const day = daylight(sunElevation);
    U.shade.x = (0.3 * groundShade + 0.14 * precipAmount * groundShade) * (0.35 + 0.65 * day);
    U.shade.y = shadeBaseM;

    // colour of the inside of a cloud: skylight plus sun scattered many times
    const fogR = palette.sun[0] * 0.4 + palette.ambient[0] * 0.62;
    const fogG = palette.sun[1] * 0.4 + palette.ambient[1] * 0.62;
    const fogB = palette.sun[2] * 0.4 + palette.ambient[2] * 0.62;
    const fogGrey = (fogR + fogG + fogB) / 3;
    U.cloudFog.x = (fogR + fogGrey) / 2;
    U.cloudFog.y = (fogG + fogGrey) / 2;
    U.cloudFog.z = (fogB + fogGrey) / 2;
    U.cloudFog.w = cloudFog > 0.002 ? CLOUD_EXTINCTION_PER_M * cloudFog : 0;

    // --- haze
    const scaleH = hazeScaleHeightM(visSm);
    const a = clamp((camH - hazeBaseM - fogDepthM(visSm)) / scaleH, -5, 80);
    U.haze.x = weatherExtinctionPerM(visSm);
    U.haze.y = scaleH;
    U.haze.z = a;
    U.haze.w = hazeBaseM;
    U.haze2.z = clamp((camH - hazeBaseM) / CLEAN_AIR_SCALE_HEIGHT_M, -1, 80);
    cullDistanceM = hazeCullDistanceM(visSm, a);
    applyFog();

    // --- precipitation: which way the drops move relative to the camera
    const windLayer = windAt(s.env, camAltFt);
    const KT = 0.514444;
    const windE = -windLayer.kt * Math.sin(windLayer.dirTrue * D2R) * KT;
    const windN = -windLayer.kt * Math.cos(windLayer.dirTrue * D2R) * KT;
    const fall = precipKind === "snow" ? 1.4 : 8.5; // terminal fall speed, m/s (typical values)
    let vx = windE;
    let vy = windN;
    let vz = -fall;
    if (camToAircraftM < 150) {
      // camera travelling with the aircraft: the drops come at you
      vx -= st.vEastKt * KT;
      vy -= st.vNorthKt * KT;
      vz -= st.vsFpm * 0.00508;
    }
    const speed = Math.max(0.5, Math.hypot(vx, vy, vz));
    Cartesian3.fromElements(vx / speed, vy / speed, vz / speed, U.precipDir);
    Cartesian3.fromElements(Math.abs(U.precipDir.z) < 0.9 ? 0 : 1, 0, Math.abs(U.precipDir.z) < 0.9 ? 1 : 0, scratchA);
    Cartesian3.normalize(Cartesian3.cross(U.precipDir, scratchA, scratchB), U.precipAx1);
    Cartesian3.cross(U.precipDir, U.precipAx1, U.precipAx2);
    precipPhase = (precipPhase + speed * clamp(dt, 0, 0.25)) % 60000;
    // only below or inside the cloud the rain falls from (with no cloud reported: below about 12,000 ft above the ground)
    const precipTopM = rainCloud >= 0 ? slots[rainCloud]!.topM : hazeBaseM + 3700;
    const underCloud = 1 - clamp((camH - (precipTopM - 120)) / 120, 0, 1);
    U.precip.x = precipAmount * underCloud;
    U.precip.y = precipKind === "snow" ? 1 : 0;
    U.precip.z = speed;
    U.precip.w = (2 * tanY) / Math.max(1, context.drawingBufferHeight);
    U.cam.w = precipPhase; // how far the drops have moved, metres
    const lum = (0.1 + 0.9 * day) * (1 - 0.25 * overcastAbove);
    const snow = precipKind === "snow";
    Cartesian3.fromElements((snow ? 0.95 : 0.74) * lum, (snow ? 0.96 : 0.79) * lum, (snow ? 0.98 : 0.86) * lum, U.precipColor);
  }

  const removePreRender = scene.preRender.addEventListener(preRender);

  // ------------------------------------------------------------------ public interface

  const api: Sky = {
    name: "sky",
    onSpawn(s: Sim, _result: SpawnResult) {
      sim = s;
      applyPending(s);
      needSnap = true; // a reposition is a scene cut: show the weather as it is, do not ease from somewhere else
    },
    frame,
    dispose() {
      if (disposed) return;
      disposed = true;
      removePreRender();
      if (composite && !scene.isDestroyed()) scene.postProcessStages.remove(composite);
      composite = null;
      noiseTexture.destroy();
      if (!scene.isDestroyed()) {
        Object.assign(fog, savedFog);
        const light = scene.light as { intensity?: number };
        if (typeof light.intensity === "number") light.intensity = savedLightIntensity;
        nightLayer.nightAlpha = savedNight.nightAlpha;
        nightLayer.brightness = savedNight.brightness;
        nightLayer.gamma = savedNight.gamma;
      }
    },
    setLocalSolarTime(hours: number) {
      if (!Number.isFinite(hours)) return;
      if (sim && sim.lastSpawn) sim.env.utcMs = utcForLocalSolarTime(sim.env.utcMs, sim.state.lon, hours);
      else pendingSolarHours = hours;
      if (sim) updateSun(sim);
    },
    localSolarTime() {
      if (pendingSolarHours !== null) return pendingSolarHours;
      return sim ? localSolarHours(sim.env.utcMs, sim.state.lon) : 12;
    },
    sunElevationDeg() {
      if (sim) updateSun(sim);
      return sunElevation;
    },
    daylight() {
      if (sim) updateSun(sim);
      return daylight(sunElevation);
    },
    setDate(year: number, month1to12: number, day: number) {
      if (!Number.isFinite(year + month1to12 + day)) return;
      if (sim && sim.lastSpawn) sim.env.utcMs = utcForLocalDate(sim.env.utcMs, sim.state.lon, year, month1to12, day);
      else pendingDate = [year, month1to12, day];
      if (sim) updateSun(sim);
    },
    setEnabled(on: boolean) {
      enabled = on;
      if (composite) composite.enabled = on;
      applyFog();
    },
    snap() {
      needSnap = true;
    },
    debugWorkView(on: boolean) {
      stepView = on;
    },
    debug(): SkyDebugInfo {
      const visSm = Math.exp(lnVis);
      return {
        visibilitySm: visSm,
        extinctionPerM: extinctionPerM(visSm),
        hazeScaleHeightM: hazeScaleHeightM(visSm),
        hazeColor: [U.hazeColor.x, U.hazeColor.y, U.hazeColor.z],
        hazeBaseM,
        cullDistanceM,
        precipIntensity: precipAmount,
        overcast: overcastAbove,
        cameraInCloud,
        sunElevationDeg: sunElevation,
        sunAzimuthDeg: sunAzimuth,
        daylight: daylight(sunElevation),
        quality: `${stageInfo.quality}${stageInfo.volumetric ? "" : " (flat clouds)"}`,
        cloudSteps: stageInfo.volumetric ? U.march.x : 1,
        lightSamples: stageInfo.volumetric ? stageInfo.preset.lightSamples : 0,
        cloudScale: stageInfo.scale,
        layers: order.length,
      };
    },
  };
  return api;
}
