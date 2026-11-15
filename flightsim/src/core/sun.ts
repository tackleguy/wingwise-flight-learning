/**
 * Where the sun is, from the date/time and position (NOAA's simplified solar position equations;
 * accurate to a fraction of a degree — plenty for lighting and "is it night?").
 */
const RAD = Math.PI / 180;

export interface SunPosition {
  /** Degrees above the horizon (negative = below). */
  elevationDeg: number;
  /** True bearing of the sun, degrees clockwise from north. */
  azimuthDeg: number;
}

export function sunPosition(utcMs: number, lat: number, lon: number): SunPosition {
  const d = new Date(utcMs);
  const start = Date.UTC(d.getUTCFullYear(), 0, 0);
  const dayOfYear = Math.floor((utcMs - start) / 86400000);
  const hours = d.getUTCHours() + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600;
  const g = ((2 * Math.PI) / 365) * (dayOfYear - 1 + (hours - 12) / 24);
  const eqTime = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const trueSolarMin = (((hours * 60 + eqTime + 4 * lon) % 1440) + 1440) % 1440;
  const hourAngle = (trueSolarMin / 4 - 180) * RAD;
  const la = lat * RAD;
  const cosZenith = Math.max(-1, Math.min(1, Math.sin(la) * Math.sin(decl) + Math.cos(la) * Math.cos(decl) * Math.cos(hourAngle)));
  const zenith = Math.acos(cosZenith);
  const az = Math.atan2(Math.sin(hourAngle), Math.cos(hourAngle) * Math.sin(la) - Math.tan(decl) * Math.cos(la)) / RAD + 180;
  return { elevationDeg: 90 - zenith / RAD, azimuthDeg: ((az % 360) + 360) % 360 };
}

/** 0 = night, 1 = full daylight, smooth through twilight (sun between 6° below and 6° above the horizon). */
export function daylight(elevationDeg: number): number {
  const t = Math.min(1, Math.max(0, (elevationDeg + 6) / 12));
  return t * t * (3 - 2 * t);
}

/** Local solar time of day in hours (0–24) at a longitude: 12 = the sun is highest. */
export function localSolarHours(utcMs: number, lon: number): number {
  const d = new Date(utcMs);
  const h = d.getUTCHours() + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600 + lon / 15;
  return ((h % 24) + 24) % 24;
}

/** The UTC time (ms) on the same UTC date at which the local solar time at `lon` equals `hours`. */
export function utcForLocalSolarHours(utcMs: number, lon: number, hours: number): number {
  const d = new Date(utcMs);
  const midnight = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const utcHours = (((hours - lon / 15) % 24) + 24) % 24;
  return midnight + utcHours * 3600000;
}
