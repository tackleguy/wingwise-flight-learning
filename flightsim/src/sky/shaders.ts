/**
 * GLSL for the two full-screen passes of the sky module (CesiumJS PostProcessStage fragment shaders):
 *
 *   1. cloud pass  — ray-marches the cloud layers (usually at reduced resolution) and writes
 *                    premultiplied cloud colour + opacity;
 *   2. final pass  — haze / fog over the scene from the depth buffer, the clouds on top (depth-aware
 *                    upsampling), white-out when the camera is inside cloud, rain / snow, dither.
 *
 * All geometry is done in a local frame at the camera: x = east, y = north, z = up, metres, with the
 * earth's curvature as a second-order term: height along a sight line is h(t) = camH + dz·t + kc·t².
 * `model.ts` holds the same formulas in TypeScript (unit-tested).
 *
 * Where the clouds ARE comes from `core/clouds.ts` (shared with the flight side): the constants
 * below are injected from that file and `cloudDensity()` is a line-for-line port of `layerDensity()`.
 */
import { CLOUD_EDGE, CLOUD_NOISE_SIZE, CLOUD_OCTAVE_1, CLOUD_OCTAVE_2, CLOUD_SCALE_1_M, CLOUD_SCALE_2_M } from "@/core/clouds";

/** Number → GLSL float literal. */
const f = (n: number) => (Number.isInteger(n) ? `${n}.0` : `${n}`);

export const MAX_LAYERS = 4;
/** Extinction inside solid cloud, per metre: you see roughly 40 m (Koschmieder 3.0 / 0.075). */
export const CLOUD_EXTINCTION_PER_M = 0.075;
/** Size of one cell of the fine "wisp" noise that roughens cloud edges, metres. */
export const DETAIL_CELL_M = 210;

export interface ShaderOptions {
  /** false = one flat textured sheet per cloud deck instead of ray-marching. */
  volumetric: boolean;
  /** Hard upper bound of the march loop (the per-frame limit is a uniform ≤ this). */
  maxIterations: number;
  /** Extra shape look-ups toward the sun per lit sample (0, 1 or 2). */
  lightSamples: number;
  /** Octaves of edge-roughening noise (0, 1 or 2). */
  detailOctaves: number;
  /** Rain / snow depth layers (0 = precipitation code compiled out). */
  precipLayers: number;
  /** Cloud pass renders at full resolution (skip the depth-aware upsampling). */
  cloudsFullRes: boolean;
  /** Debug: the cloud pass writes its work count instead of colour. */
  countSteps?: boolean;
}

const COMMON = /* glsl */ `
uniform sampler2D colorTexture;
uniform sampler2D depthTexture;
uniform vec2 depthTextureDimensions;
in vec2 v_textureCoordinates;

uniform vec3 u_camDir;     // camera forward, east-north-up frame, unit length
uniform vec3 u_camRight;   // camera right * tan(half horizontal field of view)
uniform vec3 u_camUp;      // camera up * tan(half vertical field of view)
uniform vec4 u_cam;        // x: camera height above the ellipsoid (m), y: 1/(2(R+camH)), z: earth radius R (m), w: distance the rain has moved (m)
uniform vec4 u_haze;       // weather haze: x: extinction in its full-strength layer (1/m), y: scale height above that layer (m), z: camera height above the layer top in scale heights, w: ground level (m)
uniform vec4 u_haze2;      // clean-air haze (always there): x: extinction at ground level, y: scale height, z: camera height above the ground in scale heights
uniform vec3 u_hazeColor;
uniform vec4 u_sun;        // xyz: direction to the sun (east-north-up), w: strength of the glow around the sun in haze
uniform vec3 u_sunColor;   // direct sunlight on clouds (zero at night)
uniform vec3 u_ambColor;   // skylight on clouds

const float PI = 3.14159265;

vec3 viewRay(vec2 uv, out float invCos) {
  vec2 ndc = uv * 2.0 - 1.0;
  vec3 r = u_camDir + ndc.x * u_camRight + ndc.y * u_camUp;
  invCos = length(r);
  return r / invCos;
}

// Distance along the sight line to whatever the scene drew at this pixel (terrain, aircraft, ...), metres; -1 = sky.
float sceneDistance(vec2 uv, float invCos) {
  float d = texture(depthTexture, uv).r;
  if (d >= 0.9999995) return -1.0;
#ifdef LOG_DEPTH
  float z = exp2(d * czm_log2FarDepthFromNearPlusOne) - 1.0 + czm_currentFrustum.x;
#else
  float n = czm_currentFrustum.x;
  float fz = czm_currentFrustum.y;
  float z = n * fz / (fz - d * (fz - n));
#endif
  return z * invCos;
}

float rayHeight(float dz, float kc, float t) {
  return u_cam.x + dz * t + kc * t * t;
}

// First point where a descending sight line reaches the height hGround (curved earth); -1 = never.
float groundDistance(float dz, float kc, float hGround) {
  float dh = u_cam.x - hGround;
  if (dh <= 0.0 || dz >= 0.0) return -1.0;
  float disc = dz * dz - 4.0 * kc * dh;
  if (disc < 0.0) return -1.0;
  return 2.0 * dh / (-dz + sqrt(disc));
}

// Haze density is 1 at and below the reference level and exp(-x) at x scale heights above it.
float hazeProfileInt(float x) {
  return x <= 0.0 ? x : 1.0 - exp(-min(x, 80.0));
}

float hazePart(vec4 hz, float rise, float t) {
  float a = hz.z;
  float d = rise / hz.y;
  float avg = abs(d) < 1.0e-4 ? (a <= 0.0 ? 1.0 : exp(-min(a, 80.0))) : (hazeProfileInt(a + d) - hazeProfileInt(a)) / d;
  return hz.x * t * avg;
}

// Optical depth of haze from the camera to distance t along the sight line (see hazeOpticalDepth in model.ts).
float hazeTau(float dz, float kc, float t) {
  float rise = dz * t + kc * t * t;
  return hazePart(u_haze, rise, t) + hazePart(u_haze2, rise, t);
}

float hazeSkyPart(vec4 hz, float dz, float kc) {
  float rho = hz.z <= 0.0 ? 1.0 : exp(-min(hz.z, 80.0));
  return hz.x * rho * 2.0 * hz.y / (dz + sqrt(dz * dz + 16.0 * kc * hz.y / PI));
}

// Optical depth of haze along a sight line that leaves to space (grazing-incidence approximation, hazeOpticalDepthToSpace in model.ts).
float hazeTauSky(float dz, float kc) {
  return hazeSkyPart(u_haze, dz, kc) + hazeSkyPart(u_haze2, dz, kc);
}

vec3 hazeColorFor(vec3 ray) {
  float c = max(dot(ray, u_sun.xyz), 0.0);
  float c2 = c * c;
  return u_hazeColor + u_sunColor * (u_sun.w * c2 * c2 * c2);
}

// Interleaved gradient noise (Jimenez 2014): a cheap, even-looking per-pixel random number.
float ign(vec2 p) {
  return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715))));
}
`;

// ====================================================================================== cloud pass

function cloudCommon(o: ShaderOptions): string {
  const N = f(CLOUD_NOISE_SIZE);
  return /* glsl */ `
uniform sampler2D u_noise;   // R: the shared cloud noise table; G: the same shifted by (37,17) (3-D detail noise); B: another shifted copy
uniform float u_layerCount;
uniform vec4 u_layerA[${MAX_LAYERS}];   // base (m), top (m), shape threshold, cover fraction
uniform vec4 u_layerB[${MAX_LAYERS}];   // camera position in the noise table: octave 1 (xy), octave 2 (zw)
uniform vec4 u_layerC[${MAX_LAYERS}];   // x: amount 0..1 (fade in/out), y: brightness of the base, z: overcast-ness (top rolls), w: darkening (rain cloud)
uniform vec4 u_fieldLin;     // cloud-field metres per metre east / north of the camera: xe, xn, ye, yn
uniform vec3 u_fieldQuadX;   // second-order terms of field x: e², e·n, n²
uniform vec3 u_fieldQuadY;   // ... and of field y
uniform vec4 u_detail;       // xy: camera position in detail-noise cells, z: cells per metre, w: how far the detail moves cloud edges (shape units)
uniform vec4 u_sunField;     // xy: one metre toward the sun along the ground, in cloud-field metres
uniform vec4 u_march;        // x: look-up limit per layer, y: step growth per step, z: range marched exactly (m), w: range marched softly (m)

const float SIGMA = ${f(CLOUD_EXTINCTION_PER_M)};
// Shape units per metre: a generous limit on how quickly the cloud field changes. "(threshold - shape) / GRAD" is then
// a safe distance to the nearest cloud edge, which lets the march take big steps in clear air and small ones near cloud.
const float GRAD = 9.0e-4;

// Smooth value noise from the shared table: identical to valueNoise() in core/clouds.ts
// (the smoothstep is applied to the texture coordinate, the GPU's bilinear filter does the mix).
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 w = p - i;
  w = w * w * (3.0 - 2.0 * w);
  return texture(u_noise, (i + w + 0.5) / ${N}).r;
}

// The same kind of noise from an independent copy of the table (B channel) - used for looks only.
float vnoiseB(vec2 p) {
  vec2 i = floor(p);
  vec2 w = p - i;
  w = w * w * (3.0 - 2.0 * w);
  return texture(u_noise, (i + w + 0.5) / ${N}).b;
}

float cloudShape(vec4 lat, vec2 dXY) {
  return ${f(CLOUD_OCTAVE_1)} * vnoise(lat.xy + dXY * ${f(1 / CLOUD_SCALE_1_M)}) + ${f(CLOUD_OCTAVE_2)} * vnoise(lat.zw + dXY * ${f(1 / CLOUD_SCALE_2_M)});
}

// 3-D value noise from the same 2-D table (slice z+1 is the table shifted by (37,17), stored in G).
float noise3(vec3 p) {
  float iz = floor(p.z);
  float wz = p.z - iz;
  wz = wz * wz * (3.0 - 2.0 * wz);
  vec2 q = p.xy + vec2(37.0, 17.0) * iz;
  vec2 i = floor(q);
  vec2 w = q - i;
  w = w * w * (3.0 - 2.0 * w);
  vec2 rg = texture(u_noise, (i + w + 0.5) / ${N}).rg;
  return mix(rg.x, rg.y, wz);
}

// Cloud-field offset (metres, as core/clouds.ts cloudFieldXY) of the point t along the sight line, relative to the camera.
vec2 fieldOffset(vec3 ray, float t, float h) {
  float s = t * (1.0 - h / u_cam.z);   // metres along the ground under the point
  float e = ray.x * s;
  float n = ray.y * s;
  vec3 q = vec3(e * e, e * n, n * n);
  return vec2(u_fieldLin.x * e + u_fieldLin.y * n + dot(u_fieldQuadX, q), u_fieldLin.z * e + u_fieldLin.w * n + dot(u_fieldQuadY, q));
}

// Where the sight line is inside the shell between two heights (see slabInterval in model.ts).
bool slabInterval(float dz, float kc, float hb, float ht, out float ta, out float tb) {
  ta = 0.0;
  tb = 0.0;
  float sg = dz >= 0.0 ? 1.0 : -1.0;
  float cT = u_cam.x - ht;
  float discT = dz * dz - 4.0 * kc * cT;
  if (discT <= 0.0) return false;
  float qT = -0.5 * (dz + sg * sqrt(discT));
  float r1 = qT / kc;
  float r2 = cT / qT;
  ta = max(min(r1, r2), 0.0);
  tb = max(r1, r2);
  float cB = u_cam.x - hb;
  float discB = dz * dz - 4.0 * kc * cB;
  if (cB < 0.0) {
    if (discB <= 0.0) return false;
    float qB = -0.5 * (dz + sg * sqrt(discB));
    ta = max(ta, max(qB / kc, cB / qB));
  } else if (discB > 0.0 && dz < 0.0) {
    float qB = -0.5 * (dz + sg * sqrt(discB));
    float first = min(qB / kc, cB / qB);
    if (first > 0.0) tb = min(tb, first);
  }
  return tb > ta;
}

// Density of one layer at a point, 0..1. The core of it is a port of layerDensity() in core/clouds.ts (heights in metres);
// on top of that, for looks, finer 3-D noise pushes the edges in and out a little so clouds are lumpy instead of smooth mounds.
//   soft  > 0 widens the edges (far, sparsely sampled clouds are drawn as a smooth field)
//   skip  when the result is 0: how far the sight line can safely advance, given rr = (1 / horizontal speed, 1 / closing speed on cloud tops)
float cloudDensity(vec4 A, vec4 lat, vec4 Cv, vec2 dXY, float h, float soft, vec2 rr, out float localTop, out float skip) {
  float base = A.x;
  float thick = max(60.96, A.y - A.x);
  localTop = base + thick;
  skip = 40.0;
  if (h < base - 30.48 || h > base + thick + 30.48) return 0.0;
  float thr = A.z;
  float shape = cloudShape(lat, dXY);
${
  o.detailOctaves > 0
    ? /* glsl */ `
  if (soft <= 0.0 && thr > 0.0) {
    float amp = u_detail.w;
    if (shape < thr - 0.5 * amp) {
      skip = (thr - 0.5 * amp - shape) * (1.0 / GRAD) * rr.x;
      return 0.0;
    }
    vec3 p = vec3(u_detail.xy + dXY * u_detail.z, h * u_detail.z * 1.25);
    float n = noise3(p);
${o.detailOctaves > 1 ? `    n = 0.7 * n + 0.3 * noise3(p * 2.7 + 11.3);` : ""}
    shape += (n - 0.5) * amp;
  }`
    : ""
}
  float horiz = smoothstep(thr - soft, thr + ${f(CLOUD_EDGE)} + soft, shape);
  if (horiz <= 0.0) {
    skip = (thr - soft - shape) * (1.0 / GRAD) * rr.x;
    return 0.0;
  }
  localTop = base + thick * (0.35 + 0.65 * smoothstep(thr, thr + 0.2, shape));
  if (Cv.z > 0.01) {
    // Looks only: an overcast is a featureless slab for the flight side. Let its top roll and dip a little so it reads as
    // cloud tops from above (always downward: where the flight side says "cloud" the white-out still applies).
    float dip = min(0.2 * thick, 70.0) * (1.0 - smoothstep(0.32, 0.68, shape));
${o.detailOctaves > 0 ? `    float lump = vnoiseB(u_detail.xy * 0.55 + dXY * (u_detail.z * 0.55));\n    dip += min(0.25 * thick, 110.0) * lump * lump;` : ""}
    localTop -= Cv.z * dip;
  }
  float over = h - (localTop + 18.288);
  if (over >= 0.0) {
    skip = over * rr.y;
    return 0.0;
  }
  return horiz * smoothstep(base - 18.288, base + 27.432, h) * (1.0 - smoothstep(localTop - 36.576 - 400.0 * soft, localTop + 18.288, h));
}

// Colour of the cloud at a point: sunlight that got through the cloud between here and the sun, plus skylight.
vec3 cloudColor(vec4 A, vec4 lat, vec4 Cv, vec2 dXY, float h, float localTop, float d, vec3 ray, float sampled) {
  float base = A.x;
  float h01 = clamp((h - base) / max(localTop - base, 40.0), 0.0, 1.0);
  float sz = u_sun.z;
  float tauS;
${
  o.lightSamples > 0
    ? /* glsl */ `
  if (sampled > 0.5 && u_sunColor.r + u_sunColor.g > 0.004) {
    // walk a few steps toward the sun and add up the cloud in the way: lumps get a sunny side and a shaded side
    float cosE = sqrt(max(1.0 - sz * sz, 0.0));
    float x0 = 0.0;
    float dl = 0.0;
    float lt = localTop;
    float hl = h;
    float sk;
    tauS = 0.0;
    for (int i = 0; i < ${o.lightSamples}; i++) {
      float x = ${o.lightSamples >= 4 ? "i == 0 ? 50.0 : (i == 1 ? 140.0 : (i == 2 ? 360.0 : 850.0))" : o.lightSamples === 3 ? "i == 0 ? 60.0 : (i == 1 ? 200.0 : 600.0)" : o.lightSamples === 2 ? "i == 0 ? 70.0 : 300.0" : "120.0"};
      hl = h + x * sz;
      dl = cloudDensity(A, lat, Cv, dXY + u_sunField.xy * (x * cosE), hl, 0.0, vec2(0.0), lt, sk);
      tauS += dl * (x - x0);
      x0 = x;
    }
    // and beyond the last step: the rest of the way out through the top (or the base, when the sun is below the horizon)
    tauS += dl * 0.6 * min((sz >= 0.0 ? max(lt - hl, 0.0) : max(hl - base, 0.0)) / max(abs(sz), 0.16), 1500.0);
  } else`
    : ""
}
  {
    // no sampling: assume the sunlight came straight down the column from the cloud top (or up from the base)
    tauS = min((sz >= 0.0 ? max(localTop - h, 0.0) : max(h - base, 0.0)) / max(abs(sz), 0.16), 1500.0) * 0.8;
  }
  // direct light dies away quickly inside cloud; light that has been scattered many times much more slowly
  float sunVis = max(exp(-tauS * (1.0 / 190.0)), 0.6 * exp(-tauS * (1.0 / 1400.0)));
  float cosSun = max(dot(ray, u_sun.xyz), 0.0);
  float c2 = cosSun * cosSun;
  float silver = c2 * c2 * c2 * (1.0 - d);            // thin edges glow when you look toward the sun
  vec3 direct = u_sunColor * sunVis * (0.55 + 0.9 * silver);
  float amb = mix(Cv.y, 1.0, h01 * sqrt(h01));         // bases are shaded, tops see the whole sky
  vec3 col = direct + u_ambColor * (0.6 * amb);
  // looks only: hollows in the cloud top are a little darker, and the whole surface is gently mottled, so decks are not flat grey or flat white
  float thick = max(60.96, A.y - A.x);
  float hollow = clamp((base + thick - localTop) / min(thick, 400.0), 0.0, 1.0) * h01;
  float mottle = vnoiseB(u_detail.xy * 0.31 + dXY * (u_detail.z * 0.31) + 53.0);
  col *= (1.0 - 0.3 * hollow) * (0.93 + 0.14 * mottle);
  return col * (1.0 - Cv.w * (1.0 - 0.6 * h01));
}
`;
}

function cloudMarch(o: ShaderOptions): string {
  return /* glsl */ `
float fineStep(float t, float d) {
  // small steps close to the eye (in cloud you only see tens of metres), growing with distance; thin fringe needs less care
  float s = min(0.25 * t + 5.0, max(25.0, 0.02 * t));
  return s * mix(2.6, 1.0, smoothstep(0.0, 0.3, d));
}

void marchLayer(int k, vec3 ray, float dz, float kc, float tMax, inout vec3 C, inout float T, inout float work) {
  vec4 A = u_layerA[k];
  vec4 lat = u_layerB[k];
  vec4 Cv = u_layerC[k];
  if (Cv.x <= 0.003) return;
  float base = A.x;
  float top = A.x + max(60.96, A.y - A.x);
  float ta, tb;
  if (!slabInterval(dz, kc, base - 18.288, top + 18.288, ta, tb)) return;
  float tEnd = min(tb, tMax);
  if (tEnd <= ta) return;
  vec3 hz = hazeColorFor(ray);
  float cosE = sqrt(max(1.0 - dz * dz, 0.0));
  vec2 rr = vec2(1.0 / max(cosE, 0.05), 1.0 / (abs(dz) + 2.0 * cosE));
  float localTop;
  float skip;

  // ---- 1. near part: advance by the safe distance to the nearest cloud edge, pin the edge down exactly, then integrate finely.
  //         No random offsets are involved, so cloud outlines are clean (no speckle) and neighbouring pixels agree.
  float tExact = min(tEnd, u_march.z);
  float c0 = 700.0;
  float g = u_march.y;
  float cap = max((tExact - ta) / 7.0, 15.0);
  float t = ta + 0.5;
  float tPrev = ta;
  bool wasClear = true;
  float n = 0.0;
  vec3 col = vec3(0.0);
  for (int i = 0; i < ${o.maxIterations}; i++) {
    if (n >= u_march.x || t >= tExact || T < 0.02) break;
    n += 1.0;
    float h = rayHeight(dz, kc, t);
    float d = cloudDensity(A, lat, Cv, fieldOffset(ray, t, h), h, 0.0, rr, localTop, skip);
    if (d > 0.004) {
      if (wasClear) {
        float s = fineStep(t, 1.0);
        if (t - tPrev > 6.0) {
          // bisection, then one interpolation: the edge is found to within a metre or two, so the surface is smooth
          float lo = tPrev;
          float hi = t;
          float dLo = 0.0;
          float dHi = d;
          float lt;
          float sk;
          for (int b = 0; b < 4; b++) {
            float mid = 0.5 * (lo + hi);
            float hm = rayHeight(dz, kc, mid);
            float dm = cloudDensity(A, lat, Cv, fieldOffset(ray, mid, hm), hm, 0.0, rr, lt, sk);
            if (dm > 0.004) { hi = mid; dHi = dm; } else { lo = mid; dLo = dm; }
          }
          float edge = lo + (hi - lo) * clamp((0.004 - dLo) / max(dHi - dLo, 1.0e-5), 0.0, 1.0);
          s = fineStep(edge, 1.0);
          t = edge + 0.5 * s;
          h = rayHeight(dz, kc, t);
          d = cloudDensity(A, lat, Cv, fieldOffset(ray, t, h), h, 0.0, rr, localTop, skip);
          n += 5.0;
        }
        // the colour of this cloud face, taken a little way in (where most of what you see comes from) and kept until the sight line leaves the cloud
        float tc = t + 0.6 * s;
        float hc = rayHeight(dz, kc, tc);
        vec2 xyc = fieldOffset(ray, tc, hc);
        float ltc;
        float skc;
        float dc = cloudDensity(A, lat, Cv, xyc, hc, 0.0, rr, ltc, skc);
        col = cloudColor(A, lat, Cv, xyc, hc, dc > 0.0 ? ltc : localTop, max(dc, d), ray, 1.0);
        col = mix(hz, col, exp(-hazeTau(dz, kc, t)));
        n += ${f(1 + o.lightSamples)};
      }
      float ds = fineStep(t, d);
      float a = (1.0 - exp(-SIGMA * d * ds)) * Cv.x;
      C += T * a * col;
      T *= 1.0 - a;
      tPrev = t;
      t += ds;
      wasClear = false;
    } else {
      tPrev = t;
      wasClear = true;
      // never less than a step that still catches every lump worth seeing (the exact edge is found by the bisection above);
      // sight lines that have used much of their budget take longer steps instead of giving up half way
      float used = n / u_march.x;
      float least = max(min(0.2 * t + 5.0, 60.0), 0.012 * t) * (1.0 + 3.0 * used * used);
      float most = max(min(g * (t + c0), cap), least);
      t += clamp(skip, least, most);
    }
  }
  work += n;
  if (T < 0.02) return;

  // ---- 2. far part: a few wide, soft samples at fixed distances. Individual clouds
  //         are small on screen and deep in haze out there, so the layer is drawn as a smooth field of "how much cloud is about here".
  float t0 = max(u_march.z, ta);
  float tFar = min(tEnd, u_march.w);
  if (tFar > t0) {
    float ratio = pow(tFar / max(t0, 50.0), 1.0 / 6.0);
    float tt = max(t0, 50.0);
    for (int i = 0; i < 6; i++) {
      float ds = tt * (ratio - 1.0);
      float ts = tt + 0.5 * ds;
      float h = rayHeight(dz, kc, ts);
      vec2 dXY = fieldOffset(ray, ts, h);
      float d = cloudDensity(A, lat, Cv, dXY, h, 0.2, rr, localTop, skip);
      if (d > 0.0) {
        vec3 cf = cloudColor(A, lat, Cv, dXY, h, localTop, d, ray, 0.0);
        cf = mix(hz, cf, exp(-hazeTau(dz, kc, ts)));
        float a = (1.0 - exp(-d * d * ds * (1.0 / 1800.0))) * Cv.x;
        C += T * a * cf;
        T *= 1.0 - a;
      }
      tt += ds;
    }
    work += 6.0;
  }

  // ---- 3. beyond that: the layer as an even veil with the right average cover (closes the gap to the horizon)
  float tVeil = max(u_march.w, ta);
  if (tEnd > tVeil && T > 0.02) {
    float len = tEnd - tVeil;
    float hv = u_cam.x < base ? base + 0.12 * (top - base) : base + 0.85 * (top - base);
    vec3 cv = cloudColor(A, lat, Cv, vec2(0.0), hv, top, 1.0, ray, 0.0);
    cv = mix(hz, cv, exp(-hazeTau(dz, kc, tVeil + min(len, 8000.0) * 0.5)));
    float a = (1.0 - exp(-A.w * sqrt(A.w) * len * (1.0 / 3500.0))) * Cv.x;
    C += T * a * cv;
    T *= 1.0 - a;
  }
}
`;
}

function cloudFlat(): string {
  return /* glsl */ `
// Cheap mode: each cloud deck is one textured sheet (its base seen from below, its top seen from above).
void flatLayer(int k, vec3 ray, float dz, float kc, float tMax, inout vec3 C, inout float T, inout float work) {
  vec4 A = u_layerA[k];
  vec4 lat = u_layerB[k];
  vec4 Cv = u_layerC[k];
  if (Cv.x <= 0.003) return;
  float base = A.x;
  float thick = max(60.96, A.y - A.x);
  float camH = u_cam.x;
  bool below = camH < base + 0.5 * thick;
  // the sheet sits a little inside the layer so that the white-out (from the shared cloud field) takes over before you reach it
  float hs = below ? base + 20.0 : base + 0.62 * thick;
  if (below ? camH > hs - 5.0 : camH < hs + 5.0) return;
  float ta, tb;
  float c = camH - hs;
  float disc = dz * dz - 4.0 * kc * c;
  if (disc <= 0.0) return;
  float q = -0.5 * (dz + (dz >= 0.0 ? 1.0 : -1.0) * sqrt(disc));
  ta = min(q / kc, c / q);
  tb = max(q / kc, c / q);
  float t = below ? tb : ta;
  if (t <= 0.0 || t >= tMax) return;
  work += 1.0;
  float thr = A.z;
  float veil = smoothstep(u_march.z * 0.6, u_march.w, t);   // far away: an even veil with the right average cover
  vec2 dXY = fieldOffset(ray, min(t, u_march.w), hs);
  float shape = cloudShape(lat, dXY);
  float cover = mix(smoothstep(thr, thr + ${f(CLOUD_EDGE)} * 1.6, shape), min(1.0, A.w * 1.1), veil);
  if (cover <= 0.0) return;
  float puff = smoothstep(thr, thr + 0.22, shape);
  float localTop = base + thick * (0.35 + 0.65 * puff);
  float hl = below ? base + 0.1 * thick : mix(base + 0.55 * thick, localTop, 0.9);
  vec3 col = cloudColor(A, lat, Cv, dXY, hl, below ? localTop : base + thick, 1.0, ray, 0.0);
  col *= below ? mix(1.12, 0.94, puff) : mix(0.8, 1.0, puff);   // thin edges let light through from below; from above the centres are the bright domes
  col = mix(hazeColorFor(ray), col, exp(-hazeTau(dz, kc, t)));
  float a = cover * Cv.x;
  C += T * a * col;
  T *= 1.0 - a;
}
`;
}

export function cloudPassShader(o: ShaderOptions): string {
  return /* glsl */ `
${COMMON}
${cloudCommon(o)}
${o.volumetric ? cloudMarch(o) : cloudFlat()}

void main() {
  if (u_layerCount < 0.5) {
    out_FragColor = vec4(0.0);
    return;
  }
  vec2 uv = v_textureCoordinates;
  float invCos;
  vec3 ray = viewRay(uv, invCos);
  float dz = ray.z;
  float kc = max((1.0 - dz * dz) * u_cam.y, 1.0e-11);
  // depth is read a quarter of a texel off-centre so this pass and the final pass always pick the same depth texel
  float tScene = sceneDistance(uv + 0.25 / depthTextureDimensions, invCos);
  float tMax = tScene;
  if (tScene < 0.0) {
    tMax = 1.0e9;
    float tg = groundDistance(dz, kc, u_haze.w);   // terrain not drawn (still loading, or hidden by haze): stop at the ground anyway
    if (tg > 0.0) tMax = tg;
  }
  vec3 C = vec3(0.0);
  float T = 1.0;
  float work = 0.0;
  for (int k = 0; k < ${MAX_LAYERS}; k++) {
    if (float(k) >= u_layerCount || T < 0.02) break;
    ${o.volumetric ? "marchLayer(k, ray, dz, kc, tMax, C, T, work);" : "flatLayer(k, ray, dz, kc, tMax, C, T, work);"}
  }
  if (T < 0.02) {
    C /= 1.0 - T;
    T = 0.0;
  }
${o.countSteps ? "  out_FragColor = vec4(work / 255.0, fract(work / 16.0), 0.0, 1.0);" : "  out_FragColor = vec4(C, 1.0 - T);"}
}
`;
}

// ====================================================================================== final pass

function precipitation(o: ShaderOptions): string {
  if (o.precipLayers <= 0) return "vec3 addPrecipitation(vec3 col, vec3 ray) { return col; }";
  return /* glsl */ `
uniform vec4 u_precip;      // x: amount 0..1, y: 0 rain / 1 snow, z: speed of the drops relative to the camera (m/s), w: pixel size (radians)
uniform vec3 u_precipDir;   // direction the drops move relative to the camera (east-north-up), unit
uniform vec3 u_precipAx1;   // two directions perpendicular to it
uniform vec3 u_precipAx2;
uniform vec3 u_precipColor;

float hash21(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

// Drops on a cylinder of radius rho around the line the camera moves along (relative to the falling drops):
// seen from the camera they slide along lines of constant angle around that line, so streaks point the right way
// whether you stand on the ramp (straight down) or fly at 100 knots (toward you, out of a point ahead).
float precipLayer(vec3 ray, float rho, float seed) {
  float c = dot(ray, u_precipDir);
  vec3 perp = ray - c * u_precipDir;
  float s = length(perp);
  if (s < 0.04) return 0.0;
  float snow = u_precip.y;
  float cells = floor(mix(46.0, 30.0, snow) * (0.6 + rho * 0.5));
  float phi = atan(dot(perp, u_precipAx2), dot(perp, u_precipAx1)) / (2.0 * PI) + 0.5;
  float col = phi * cells;
  float ci = floor(col);
  float r1 = hash21(vec2(ci, seed));
  float k = 0.75 + 0.5 * r1;                              // not every drop falls at the same speed
  float speed = u_precip.z * k;
  float len = mix(clamp(speed * 0.028, 0.18, 2.4), 0.03 + 0.012 * rho, snow);   // streak length: motion during one "exposure"
  float spacing = mix(max(1.3, len * 2.2), 0.55, snow);
  float along = rho * c / s;                               // where this sight line pierces the cylinder, metres along the axis
  float u = (along - u_cam.w * k) / spacing + r1 * 37.0;
  float ui = floor(u);
  float uf = u - ui;
  float r2 = hash21(vec2(ci + 17.0 * seed, ui));
  float present = step(1.0 - mix(0.25, 0.9, u_precip.x), r2);
  float cellWidth = 2.0 * PI * rho * s / cells;            // metres across one column at this point
  float wobble = snow * 0.22 * sin(u * 2.3 + r1 * 6.28);
  float x = (col - ci - 0.5 - (fract(r2 * 7.31) - 0.5) * 0.6 - wobble) * cellWidth;
  float pixel = u_precip.w * rho / s;                      // metres covered by one pixel at this distance
  float halfW = max(mix(0.0015, 0.012, snow), 0.6 * pixel);
  float lenFrac = len / spacing;
  float lateral = 1.0 - smoothstep(halfW * 0.5, halfW * 1.5, abs(x));
  float seg = mix(smoothstep(0.0, lenFrac * 0.25, uf) * (1.0 - smoothstep(lenFrac * 0.6, lenFrac, uf)),
                  1.0 - smoothstep(halfW * 0.5, halfW * 1.5, abs(uf - 0.5) * spacing), snow);
  // things thinner than a pixel are drawn one pixel wide but fainter
  float thin = clamp(mix(0.0018, 0.011, snow) / max(pixel, 1.0e-5), 0.25, 1.0);
  return present * lateral * seg * thin * smoothstep(0.04, 0.2, s);
}

vec3 addPrecipitation(vec3 col, vec3 ray) {
  if (u_precip.x <= 0.003) return col;
  float a = 0.0;
  float rho = 1.1;
  for (int i = 0; i < ${o.precipLayers}; i++) {
    a += precipLayer(ray, rho, float(i) * 7.0 + 1.0) * (1.0 - 0.17 * float(i));
    rho *= 2.1;
  }
  a = min(a, 1.0) * mix(0.34, 0.75, u_precip.y) * (0.55 + 0.45 * u_precip.x);
  return mix(col, u_precipColor, a);
}
`;
}

export function finalPassShader(o: ShaderOptions): string {
  return /* glsl */ `
${COMMON}
uniform sampler2D u_clouds;
uniform vec2 u_cloudsDimensions;
uniform float u_cloudsOn;
uniform vec4 u_sceneTint;    // rgb: tint of the ground and everything on it (twilight / low sun), w: unused
uniform vec4 u_shade;        // x: how much the ground is darkened under cloud, y: height below which that applies (m)
uniform vec4 u_cloudFog;     // rgb: colour of the cloud the camera is in, w: its extinction (1/m), 0 = camera in clear air
${precipitation(o)}

vec4 cloudsAt(vec2 uv, float tHere) {
${
  o.cloudsFullRes
    ? "  return texture(u_clouds, uv);"
    : /* glsl */ `
  // Depth-aware upsampling: blend the four nearest cloud texels, preferring those that looked at the same
  // surface as this pixel, so no cloud leaks over the edge of the aircraft or a nearby ridge.
  vec2 dim = u_cloudsDimensions;
  vec2 p = uv * dim - 0.5;
  vec2 i = floor(p);
  vec2 w = p - i;
  float dHere = tHere < 0.0 ? 2.0e7 : tHere;
  vec4 acc = vec4(0.0);
  float wsum = 0.0;
  for (int j = 0; j < 4; j++) {
    vec2 o = vec2(mod(float(j), 2.0), floor(float(j) * 0.5));
    vec2 tuv = clamp((i + o + 0.5) / dim, vec2(0.0), vec2(1.0));
    float invCosJ;
    viewRay(tuv, invCosJ);
    float tj = sceneDistance(tuv + 0.25 / depthTextureDimensions, invCosJ);
    float dj = tj < 0.0 ? 2.0e7 : tj;
    float wj = (o.x > 0.5 ? w.x : 1.0 - w.x) * (o.y > 0.5 ? w.y : 1.0 - w.y);
    float apart = abs(log2(dj / dHere)) * 1.6;        // 0 on the same surface; large across the edge of something nearer
    apart *= apart;
    wj = wj / (1.0 + apart * apart) + 1.0e-4;
    acc += texture(u_clouds, tuv) * wj;
    wsum += wj;
  }
  return acc / wsum;`
}
}

void main() {
  vec2 uv = v_textureCoordinates;
  vec4 scene = texture(colorTexture, uv);
  float invCos;
  vec3 ray = viewRay(uv, invCos);
  float dz = ray.z;
  float kc = max((1.0 - dz * dz) * u_cam.y, 1.0e-11);
  float t = sceneDistance(uv, invCos);
  vec3 col = scene.rgb;
  vec3 haze = hazeColorFor(ray);
  float tau;
  float tFog;   // distance used for the in-cloud white-out
  if (t < 0.0) {
    // sky - or ground that was not drawn (terrain still loading, or dropped because haze hides it)
    float tg = groundDistance(dz, kc, u_haze.w);
    tau = tg > 0.0 ? hazeTau(dz, kc, tg) : hazeTauSky(dz, kc);
    tFog = 1.0e6;
  } else {
    float hP = rayHeight(dz, kc, t);
    col *= u_sceneTint.rgb * (1.0 - u_shade.x * (1.0 - smoothstep(u_shade.y - 120.0, u_shade.y, hP)));
    tau = hazeTau(dz, kc, t);
    tFog = t;
  }
  col = mix(haze, col, exp(-tau));

  if (u_cloudsOn > 0.5) {
    vec4 c = cloudsAt(uv, t);
    col = c.rgb + (1.0 - c.a) * col;
  }
  // inside cloud: everything beyond a few tens of metres is lost in white
  if (u_cloudFog.w > 0.0) col = mix(u_cloudFog.rgb, col, exp(-u_cloudFog.w * tFog));

  col = addPrecipitation(col, ray);
  col += (ign(gl_FragCoord.xy + 0.5) - 0.5) / 255.0;   // dither: no banding in smooth gradients
  out_FragColor = vec4(col, scene.a);
}
`;
}
