/**
 * Public interface of the sky module: time of day, night, haze/fog, clouds and precipitation —
 * everything the weather LOOKS like. The weather itself (numbers) lives in `sim.env` and is
 * written by the weather module; the sky module only reads it and draws it.
 */
import type { SimModule } from "@/core/sim";

export interface SkyApi extends SimModule {
  readonly name: "sky";
  /** Set the time of day as local solar time (hours 0..24) at the aircraft's position; keeps the date. */
  setLocalSolarTime(hours: number): void;
  /** Hours 0..24 local solar time now. */
  localSolarTime(): number;
  sunElevationDeg(): number;
  /** 0 = night, 1 = day. */
  daylight(): number;
  /** Step the simulated date (season affects sun height and day length). */
  setDate(year: number, month1to12: number, day: number): void;
}

/** Read-only numbers the sky module is currently drawing with (for developer pages and tests). */
export interface SkyDebugInfo {
  /** Visibility actually drawn, statute miles (eased; capped in precipitation). */
  visibilitySm: number;
  /** Haze extinction at the reference ground level, per metre (= 3.0 / visibility in metres). */
  extinctionPerM: number;
  /** Haze scale height, metres. */
  hazeScaleHeightM: number;
  /** Colour distant things fade to (display colour 0..1). */
  hazeColor: [number, number, number];
  /** Altitude the visibility number applies at (ground under the aircraft, eased), metres. */
  hazeBaseM: number;
  /** Distance beyond which CesiumJS stops loading terrain tiles because haze hides them, metres. */
  cullDistanceM: number;
  /** 0 = no precipitation drawn … 1 = heavy. */
  precipIntensity: number;
  /** 0 = clear above the camera … 1 = overcast above the camera. */
  overcast: number;
  /** Cloud density at the camera, 0..1 (same shared cloud field as `state.inCloud`). */
  cameraInCloud: number;
  sunElevationDeg: number;
  sunAzimuthDeg: number;
  daylight: number;
  quality: string;
  /** Ray-march steps per cloud layer and light samples per step in the current quality. */
  cloudSteps: number;
  lightSamples: number;
  /** Resolution scale of the cloud pass (1 = full resolution). */
  cloudScale: number;
  layers: number;
}

/** What `createSky` actually returns: the contract above plus a few developer helpers. */
export interface Sky extends SkyApi {
  /** Switch the whole post-process (haze, clouds, precipitation) on or off — for comparisons. */
  setEnabled(on: boolean): void;
  /** Jump straight to the current weather instead of easing toward it. */
  snap(): void;
  debug(): SkyDebugInfo;
  /** Developer tool: the cloud pass shows how much work each pixel took (red = look-ups / 255) instead of clouds. */
  debugWorkView(on: boolean): void;
}
