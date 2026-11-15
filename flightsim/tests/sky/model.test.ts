import { describe, expect, it } from "vitest";
import { CLOUD_SCALE_1_M, CLOUD_SCALE_2_M, cloudFieldXY, cloudShape, valueNoise } from "@/core/clouds";
import { localSolarHours, sunPosition } from "@/core/sun";
import {
  CITY_LIGHT_GAIN,
  M_PER_SM,
  contrastAt,
  coverThreshold,
  drawnVisibilitySm,
  ease,
  extinctionPerM,
  fieldFromLocal,
  fieldMapping,
  groundBrightness,
  hazeCullDistanceM,
  hazeOpticalDepth,
  hazeOpticalDepthToSpace,
  hazeProfile,
  hazeScaleHeightM,
  heightAlongRay,
  layerLatticeOrigin,
  newFieldMapping,
  newPalette,
  nightSettings,
  precipIntensity,
  skyPalette,
  slabInterval,
  utcForLocalDate,
  utcForLocalSolarTime,
} from "@/sky/model";

// ---------------------------------------------------------------- helpers: exact WGS84 geometry (independent of the code under test)

const A = 6378137;
const E2 = 6.69437999014e-3;
const D2R = Math.PI / 180;

function toEcef(latDeg: number, lonDeg: number, h: number): [number, number, number] {
  const lat = latDeg * D2R;
  const lon = lonDeg * D2R;
  const n = A / Math.sqrt(1 - E2 * Math.sin(lat) ** 2);
  return [(n + h) * Math.cos(lat) * Math.cos(lon), (n + h) * Math.cos(lat) * Math.sin(lon), (n * (1 - E2) + h) * Math.sin(lat)];
}

function toGeodetic(p: [number, number, number]): { lat: number; lon: number; h: number } {
  const [x, y, z] = p;
  const lon = Math.atan2(y, x);
  const r = Math.hypot(x, y);
  let lat = Math.atan2(z, r * (1 - E2));
  let h = 0;
  for (let i = 0; i < 8; i++) {
    const n = A / Math.sqrt(1 - E2 * Math.sin(lat) ** 2);
    h = r / Math.cos(lat) - n;
    lat = Math.atan2(z, r * (1 - (E2 * n) / (n + h)));
  }
  return { lat: lat / D2R, lon: lon / D2R, h };
}

/** Geodetic position of the point at east/north/up metres from an origin (exact). */
function enuPoint(latDeg: number, lonDeg: number, h0: number, e: number, n: number, u: number) {
  const lat = latDeg * D2R;
  const lon = lonDeg * D2R;
  const o = toEcef(latDeg, lonDeg, h0);
  const east = [-Math.sin(lon), Math.cos(lon), 0];
  const north = [-Math.sin(lat) * Math.cos(lon), -Math.sin(lat) * Math.sin(lon), Math.cos(lat)];
  const up = [Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat)];
  return toGeodetic([o[0] + e * east[0]! + n * north[0]! + u * up[0]!, o[1] + e * east[1]! + n * north[1]! + u * up[1]!, o[2] + e * east[2]! + n * north[2]! + u * up[2]!]);
}

// ---------------------------------------------------------------- haze

describe("haze that matches the visibility number", () => {
  it("leaves about 5 % contrast at the reported visibility (Koschmieder)", () => {
    for (const vis of [0.25, 0.5, 1, 3, 5, 10, 30]) {
      expect(contrastAt(vis, vis * M_PER_SM)).toBeCloseTo(0.05, 3);
      expect(contrastAt(vis, 0.25 * vis * M_PER_SM)).toBeGreaterThan(0.45); // things well inside the visibility are clearly seen
      expect(contrastAt(vis, 2 * vis * M_PER_SM)).toBeLessThan(0.004); // things at twice the visibility are gone
    }
    expect(extinctionPerM(3)).toBeCloseTo(2.996 / 4828.03, 9);
  });

  it("makes fog a shallow layer and ordinary haze a deep one", () => {
    expect(hazeScaleHeightM(0.5)).toBeLessThan(100);
    expect(hazeScaleHeightM(0.25)).toBeLessThan(hazeScaleHeightM(0.5));
    expect(hazeScaleHeightM(5)).toBeGreaterThan(600);
    expect(hazeScaleHeightM(30)).toBeGreaterThan(1200);
    let prev = 0;
    for (let v = 0.05; v < 120; v *= 1.2) {
      const h = hazeScaleHeightM(v);
      expect(h).toBeGreaterThanOrEqual(prev);
      prev = h;
    }
  });

  it("integrates haze along level, climbing and descending sight lines", () => {
    const beta = extinctionPerM(5);
    // level at the reference height: plain exp(-beta d)
    expect(hazeOpticalDepth(beta, 4000, 0, 0)).toBeCloseTo(beta * 4000, 9);
    // level, one scale height up: 1/e of the density
    expect(hazeOpticalDepth(beta, 4000, 1, 1)).toBeCloseTo((beta * 4000) / Math.E, 9);
    // climbing two scale heights: compare with a numerical integral
    const numeric = (a: number, b: number, n = 4000) => {
      let s = 0;
      for (let i = 0; i < n; i++) s += hazeProfile(a + ((b - a) * (i + 0.5)) / n);
      return (s / n) * beta * 4000;
    };
    for (const [a, b] of [
      [0, 2],
      [3, 0],
      [0.5, -1],
      [-0.5, 2],
      [4, 4.00001],
    ] as const) {
      expect(hazeOpticalDepth(beta, 4000, a, b)).toBeCloseTo(numeric(a, b), 4);
    }
    // symmetric: looking down a path equals looking up it
    expect(hazeOpticalDepth(beta, 4000, 0, 2)).toBeCloseTo(hazeOpticalDepth(beta, 4000, 2, 0), 9);
  });

  it("approximates the haze seen against the sky on a curved earth", () => {
    const R = 6371000;
    const H = 1200;
    const beta = 1e-4;
    const numeric = (dz: number) => {
      // integrate exp(-(h(t) - h0)/H) along the true spherical geometry
      let s = 0;
      const dt = 200;
      for (let t = dt / 2; t < 2.0e6; t += dt) {
        const h = Math.sqrt(R * R + 2 * R * dz * t + t * t) - R;
        s += Math.exp(-h / H) * dt;
      }
      return s * beta;
    };
    for (const elevDeg of [0, 0.5, 1, 2, 5, 15, 45, 90]) {
      const dz = Math.sin(elevDeg * D2R);
      const approx = hazeOpticalDepthToSpace(beta, H, 0, dz, R);
      const exact = numeric(dz);
      expect(Math.abs(approx / exact - 1)).toBeLessThan(0.08);
    }
    // horizon in 3-mile haze: nothing of the sky's own colour is left -> no visible horizon line
    expect(Math.exp(-hazeOpticalDepthToSpace(extinctionPerM(3), hazeScaleHeightM(3), 0, 0))).toBeLessThan(1e-6);
    // straight up in 30-mile haze: the sky is hardly changed
    expect(Math.exp(-hazeOpticalDepthToSpace(extinctionPerM(30), hazeScaleHeightM(30), 0, 1))).toBeGreaterThan(0.85);
  });

  it("only drops terrain that haze hides completely", () => {
    for (const vis of [0.25, 0.5, 1, 3, 10, 30]) {
      const beta = extinctionPerM(vis);
      const scaleH = hazeScaleHeightM(vis);
      for (const a of [0, 0.5, 2]) {
        const cull = hazeCullDistanceM(vis, a);
        expect(cull).toBeGreaterThanOrEqual(Math.min(3000, 2 * vis * M_PER_SM));
        // worst cases: terrain at camera level, at the reference level, and a mountain three scale heights above the camera
        for (const b of [a, 0, a + 3]) {
          if (cull >= 2.0e6) continue;
          const tau = hazeOpticalDepth(beta, cull, a, b);
          if (cull > 3000) expect(Math.exp(-tau)).toBeLessThan(0.003);
        }
        void scaleH;
      }
    }
    // high above a fog layer nothing is culled early
    expect(hazeCullDistanceM(0.5, 30)).toBeGreaterThan(1.0e6);
    // in fog on the ground the cut-off is a few kilometres - a big saving in terrain loading
    expect(hazeCullDistanceM(0.5, 0)).toBeLessThan(8000);
  });
});

// ---------------------------------------------------------------- precipitation

describe("precipitation amount", () => {
  it("follows visibility and is zero without precipitation", () => {
    expect(precipIntensity("none", 1)).toBe(0);
    expect(precipIntensity("rain", 10)).toBeCloseTo(0.35, 6);
    expect(precipIntensity("rain", 1)).toBe(1);
    expect(precipIntensity("rain", 4)).toBeGreaterThan(precipIntensity("rain", 6));
    expect(precipIntensity("snow", 0.25)).toBe(1);
    expect(precipIntensity("snow", 5)).toBeCloseTo(0.35, 6);
  });

  it("caps the drawn visibility in rain and snow", () => {
    expect(drawnVisibilitySm({ visibilitySm: 30, precipitation: "none" })).toBe(30);
    expect(drawnVisibilitySm({ visibilitySm: 30, precipitation: "rain" })).toBe(7);
    expect(drawnVisibilitySm({ visibilitySm: 2, precipitation: "rain" })).toBe(2);
    expect(drawnVisibilitySm({ visibilitySm: 30, precipitation: "snow" })).toBe(3);
    expect(drawnVisibilitySm({ visibilitySm: Number.NaN, precipitation: "none" })).toBe(10);
    expect(drawnVisibilitySm({ visibilitySm: 0, precipitation: "none" })).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------- day and night

describe("day, twilight and night", () => {
  it("darkens the ground smoothly and never to black", () => {
    let prev = 0;
    for (let el = -30; el <= 60; el += 0.25) {
      const b = groundBrightness(el);
      expect(b).toBeGreaterThanOrEqual(prev - 1e-9);
      expect(b - prev).toBeLessThan(0.05); // no jumps
      prev = b;
    }
    expect(groundBrightness(40)).toBe(1);
    expect(groundBrightness(0)).toBeGreaterThan(0.6); // sunset is not night
    expect(groundBrightness(-6)).toBeLessThan(0.25); // end of civil twilight: dark
    expect(groundBrightness(-30)).toBeGreaterThan(0.02); // faint moonlit / starlit ground
    expect(groundBrightness(-30)).toBeLessThan(0.06);
  });

  it("gives CesiumJS settings that reproduce that brightness and fade the city lights in", () => {
    const out = { lightIntensity: 0, nightAlpha: 0, lightsBrightness: 0 };
    let prevLights = 1e9;
    for (let el = 30; el >= -30; el -= 0.5) {
      nightSettings(el, out);
      const nightBlend = 1 - Math.min(1, Math.max(0, 5 * Math.sin(el * D2R)));
      const alpha = out.nightAlpha * nightBlend;
      const light = Math.min(1, out.lightIntensity);
      // ground = light x (1 - alpha) x day picture
      expect(light * (1 - alpha)).toBeCloseTo(groundBrightness(el), 2);
      expect(out.lightIntensity).toBeGreaterThan(0.05);
      expect(out.lightIntensity).toBeLessThanOrEqual(2);
      expect(out.nightAlpha).toBeGreaterThanOrEqual(0);
      expect(out.nightAlpha).toBeLessThanOrEqual(1);
      const lights = alpha * light * out.lightsBrightness; // how bright a fully lit city pixel ends up
      expect(lights).toBeLessThanOrEqual(CITY_LIGHT_GAIN + 1e-6);
      if (el > 2.5) expect(lights).toBeLessThan(0.01); // no city lights by day
      if (el < -6) expect(lights).toBeCloseTo(CITY_LIGHT_GAIN, 3); // fully on at night
      expect(lights).toBeLessThanOrEqual(prevLights + 0.2);
      prevLights = Math.max(lights, 1e-9);
    }
    nightSettings(45, out);
    expect(out.lightIntensity).toBe(2);
    expect(out.nightAlpha).toBe(0);
  });

  it("has sensible colours from noon to night", () => {
    const p = newPalette();
    const lum = (c: number[]) => 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
    skyPalette(60, 30, 0, p);
    const noonHaze = lum(p.haze);
    expect(noonHaze).toBeGreaterThan(0.75);
    expect(p.haze[2]).toBeGreaterThan(p.haze[0]); // bluish-white by day
    expect(lum(p.sun)).toBeGreaterThan(0.9);
    skyPalette(1, 30, 0, p);
    expect(p.haze[0]).toBeGreaterThan(p.haze[2]); // orange tint at low sun
    expect(p.sun[0]).toBeGreaterThan(p.sun[2] * 1.5);
    skyPalette(-20, 30, 0, p);
    expect(lum(p.haze)).toBeLessThan(0.03); // dark at night
    expect(p.haze[2]).toBeGreaterThan(p.haze[0]); // blue-grey
    expect(lum(p.sun)).toBe(0);
    expect(lum(p.ambient)).toBeGreaterThan(0.015); // faint moonlight on clouds
    // fog is greyer than clear-air haze, overcast darker than sunny
    skyPalette(60, 0.5, 0, p);
    expect(Math.abs(p.haze[2] - p.haze[0])).toBeLessThan(0.06);
    const fogLum = lum(p.haze);
    skyPalette(60, 0.5, 1, p);
    expect(lum(p.haze)).toBeLessThan(fogLum);
    // every colour stays in range, with no jumps as the sun moves
    let prev = -1;
    for (let el = -25; el <= 90; el += 0.25) {
      skyPalette(el, 10, 0.3, p);
      for (const c of [...p.haze, ...p.sun, ...p.ambient, ...p.sceneTint]) {
        expect(c).toBeGreaterThanOrEqual(0);
        expect(c).toBeLessThanOrEqual(1);
      }
      const l = lum(p.haze);
      if (prev >= 0) expect(Math.abs(l - prev)).toBeLessThan(0.04);
      prev = l;
    }
  });

  it("sets local solar time and date", () => {
    const start = Date.UTC(2026, 5, 21, 19, 0, 0);
    for (const lon of [-122.4, 0, 13.4, 151.2, -179, 179]) {
      for (const h of [0, 5.5, 12, 19.4, 23.75]) {
        const t = utcForLocalSolarTime(start, lon, h);
        expect(localSolarHours(t, lon)).toBeCloseTo(h, 2); // core/sun rounds to whole seconds
        // same local solar date
        const day = (ms: number) => Math.floor((ms + (lon / 15) * 3600000) / 86400000);
        expect(day(t)).toBe(day(start));
      }
    }
    // noon really is when the sun is highest (within the equation of time, about a quarter hour)
    const noon = utcForLocalSolarTime(start, -122.4, 12);
    const elNoon = sunPosition(noon, 37.6, -122.4).elevationDeg;
    expect(elNoon).toBeGreaterThan(sunPosition(noon + 3600000, 37.6, -122.4).elevationDeg);
    expect(elNoon).toBeGreaterThan(sunPosition(noon - 3600000, 37.6, -122.4).elevationDeg);
    // changing the date keeps the time of day; winter sun is lower than summer sun
    const winter = utcForLocalDate(noon, -122.4, 2026, 12, 21);
    expect(localSolarHours(winter, -122.4)).toBeCloseTo(12, 2);
    const local = new Date(winter + (-122.4 / 15) * 3600000);
    expect([local.getUTCFullYear(), local.getUTCMonth() + 1, local.getUTCDate()]).toEqual([2026, 12, 21]);
    expect(sunPosition(winter, 37.6, -122.4).elevationDeg).toBeLessThan(elNoon - 40);
  });
});

// ---------------------------------------------------------------- cloud geometry shared with the flight side

describe("cloud geometry given to the shader", () => {
  it("maps metres east/north of the camera to the shared cloud field", () => {
    const map = newFieldMapping();
    let worstNear = 0;
    let worstMid = 0;
    let worstFar = 0;
    for (const [lat, lon] of [
      [37.62, -122.38],
      [51.47, -0.45],
      [-33.95, 151.18],
      [64.13, -21.94],
      [1.36, 103.99],
      [-54.8, -68.3],
      [35.55, 139.78],
    ] as const) {
      fieldMapping(lat, lon, map);
      const here = cloudFieldXY(lat, lon);
      expect(map.x0).toBeCloseTo(here.x, 6);
      expect(map.y0).toBeCloseTo(here.y, 6);
      for (const dist of [500, 5000, 20000, 60000, 100000]) {
        for (let brg = 0; brg < 360; brg += 30) {
          for (const height of [0, 3000]) {
            const e = dist * Math.sin(brg * D2R);
            const n = dist * Math.cos(brg * D2R);
            // the true point: e, n in the camera's horizontal plane, then moved to the given height above the ellipsoid
            const flat = enuPoint(lat, lon, 1000, e, n, 0);
            const truth = cloudFieldXY(flat.lat, flat.lon);
            // the shader scales the horizontal offset by R / (R + height of the point) - here the camera plane's point is at
            // height flat.h above the ellipsoid, so do the same
            const s = 1 - flat.h / 6371000;
            const got = fieldFromLocal(map, e * s, n * s);
            const err = Math.hypot(got.x - truth.x, got.y - truth.y);
            if (dist <= 5000) worstNear = Math.max(worstNear, err);
            else if (dist <= 20000) worstMid = Math.max(worstMid, err);
            else worstFar = Math.max(worstFar, err);
            void height;
          }
        }
      }
    }
    // where it matters (the clouds around you) the drawn field is the flight side's field to within a few metres
    expect(worstNear).toBeLessThan(0.2); // within 5 km
    expect(worstMid).toBeLessThan(2); // at 20 km
    expect(worstFar).toBeLessThan(60); // out to 100 km, where clouds are a soft veil in haze anyway
  });

  it("puts the camera at the right place in the noise table for every layer", () => {
    const map = newFieldMapping();
    const lattice: [number, number, number, number] = [0, 0, 0, 0];
    for (const [lat, lon] of [
      [37.62, -122.38],
      [-33.95, 151.18],
      [51.47, -0.45],
    ] as const) {
      fieldMapping(lat, lon, map);
      for (let layer = 0; layer < 4; layer++) {
        layerLatticeOrigin(map, layer, lattice);
        for (const v of lattice) {
          expect(v).toBeGreaterThanOrEqual(0);
          expect(v).toBeLessThan(256);
        }
        for (const [dx, dy] of [
          [0, 0],
          [731.5, -1290.25],
          [-25013, 8800],
          [60000, 45000],
        ] as const) {
          // what the shader computes ...
          const shader = 0.65 * valueNoise(lattice[0] + dx / CLOUD_SCALE_1_M, lattice[1] + dy / CLOUD_SCALE_1_M) + 0.35 * valueNoise(lattice[2] + dx / CLOUD_SCALE_2_M, lattice[3] + dy / CLOUD_SCALE_2_M);
          // ... is what the flight side computes
          expect(shader).toBeCloseTo(cloudShape(map.x0 + dx, map.y0 + dy, layer), 6);
        }
      }
    }
  });

  it("uses a threshold below every shape value for an overcast", () => {
    expect(coverThreshold("OVC")).toBeLessThan(-0.2);
    expect(coverThreshold("FEW")).toBeGreaterThan(coverThreshold("SCT"));
    expect(coverThreshold("SCT")).toBeGreaterThan(coverThreshold("BKN"));
    expect(coverThreshold("BKN")).toBeGreaterThan(0);
  });

  it("finds where a sight line is inside a cloud layer on a curved earth", () => {
    const R = 6371000;
    const exactHeight = (camH: number, dz: number, t: number) => Math.sqrt((R + camH) ** 2 + 2 * (R + camH) * dz * t + t * t) - R;
    // from below, looking up at 30 degrees
    let iv = slabInterval(300, 0.5, R, 1000, 2000)!;
    expect(iv[0]).toBeCloseTo(1400, -1);
    expect(iv[1]).toBeCloseTo(3400, -1);
    // from below, looking at the horizon: the cloud base comes down to meet the line of sight about 94 km away
    iv = slabInterval(300, 0, R, 1000, 2000)!;
    expect(iv[0]).toBeGreaterThan(90000);
    expect(iv[0]).toBeLessThan(98000);
    expect(exactHeight(300, 0, iv[0])).toBeCloseTo(1000, -1);
    // from above looking down steeply: in through the top, out through the base
    iv = slabInterval(3000, -0.5, R, 1000, 2000)!;
    expect(heightAlongRay(3000, -0.5, R, iv[0])).toBeCloseTo(2000, 3);
    expect(heightAlongRay(3000, -0.5, R, iv[1])).toBeCloseTo(1000, 3);
    // from above looking up: never
    expect(slabInterval(3000, 0.1, R, 1000, 2000)).toBeNull();
    // from above, skimming: enters the top, never reaches the base, leaves through the top again
    iv = slabInterval(2100, -0.006, R, 1000, 2000)!;
    expect(heightAlongRay(2100, -0.006, R, iv[0])).toBeCloseTo(2000, 2);
    expect(heightAlongRay(2100, -0.006, R, iv[1])).toBeCloseTo(2000, 2);
    expect(heightAlongRay(2100, -0.006, R, (iv[0] + iv[1]) / 2)).toBeGreaterThan(1000);
    // inside the layer: starts at the camera
    iv = slabInterval(1500, 0.02, R, 1000, 2000)!;
    expect(iv[0]).toBe(0);
    expect(heightAlongRay(1500, 0.02, R, iv[1])).toBeCloseTo(2000, 2);
    // straight up and straight down do not divide by zero
    iv = slabInterval(0, 1, R, 1000, 2000)!;
    expect(iv[0]).toBeCloseTo(1000, 3);
    expect(iv[1]).toBeCloseTo(2000, 3);
    iv = slabInterval(5000, -1, R, 1000, 2000)!;
    expect(iv[0]).toBeCloseTo(3000, 3);
    expect(iv[1]).toBeCloseTo(4000, 3);
    // random sight lines: both ends lie on the layer's surfaces, the middle is inside, and the
    // second-order height formula agrees with exact spherical geometry
    let seed = 7;
    const rnd = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    let found = 0;
    for (let i = 0; i < 3000; i++) {
      const camH = rnd() * 6000;
      const dz = Math.sin((rnd() * 60 - 30) * D2R) * (rnd() < 0.5 ? 0.1 : 1);
      const base = 500 + rnd() * 3000;
      const top = base + 100 + rnd() * 2500;
      const r = slabInterval(camH, dz, R, base, top);
      if (!r) continue;
      found++;
      const [ta, tb] = r;
      expect(tb).toBeGreaterThan(ta);
      const mid = heightAlongRay(camH, dz, R, (ta + tb) / 2);
      expect(mid).toBeGreaterThan(base - 0.5);
      expect(mid).toBeLessThan(top + 0.5);
      for (const t of [ta, tb]) {
        const h = heightAlongRay(camH, dz, R, t);
        if (t > 0) expect(Math.min(Math.abs(h - base), Math.abs(h - top))).toBeLessThan(0.5);
        if (t < 150000) expect(Math.abs(h - exactHeight(camH, dz, t))).toBeLessThan(3 + t * 1e-4);
      }
    }
    expect(found).toBeGreaterThan(1000);
  });
});

describe("easing", () => {
  it("approaches the target without overshoot, independent of frame rate", () => {
    let a = 0;
    for (let i = 0; i < 60; i++) a = ease(a, 1, 1 / 60, 0.5);
    let b = 0;
    for (let i = 0; i < 6; i++) b = ease(b, 1, 1 / 6, 0.5);
    expect(a).toBeCloseTo(b, 6);
    expect(a).toBeCloseTo(1 - Math.exp(-2), 6);
    expect(ease(3, 1, 0, 0.5)).toBe(3);
    expect(ease(3, 1, 100, 0.5)).toBeCloseTo(1, 9);
  });
});
