/**
 * Draws one runway: a thin mesh lying on the (flattened) terrain, with the surface look and every
 * painted marking computed per pixel in the shader — so the paint is razor sharp when the aircraft
 * stands on it and fades smoothly to its average far away (no shimmering centreline).
 *
 * How it stays on the ground at every distance:
 *   - every vertex takes its height from the SAME terrain service the wheels use;
 *   - the mesh is drawn as a "decal": depth-TESTED against the terrain (hills and aircraft in front
 *     hide it) but it does not write depth, and its depth is pulled a little toward the viewer —
 *     more with distance — so coarse far-away terrain tiles can never poke through it.
 */
import { Cartesian3, Cartesian4, type Matrix4 } from "cesium";
import { axisPoint, toLocal, type LocalFrame, type RunwayAxis } from "./geo";
import { Mesh, type GlContext, type GlTexture, type UniformMap } from "./gl";
import { SURFACE_LOOK, type EndMarks, type RunwayLayout } from "./layout";
import { DESIG_TEX_W, SDF_RANGE_TEXELS } from "./textures";

/** Extra mesh around the pavement so its edge can be anti-aliased / feathered, metres. */
export const EDGE_MARGIN_M = 6;
/** Maximum spacing of mesh rows along the runway, metres (keeps the mesh on the curved, blended terrain). */
const ROW_STEP_M = 20;

/** Values shared by every runway and updated once per frame. */
export interface SurfaceShared {
  /** x: brightness multiplier at night (0…1), y: time (s), z: how bright the runway lights are (0…1), w: unused. */
  env: Cartesian4;
  /** The aircraft's landing / taxi light in EYE coordinates: xyz position, w strength (0 = off). */
  lampPos: Cartesian4;
  /** xyz: direction the lamp shines in (eye coordinates, unit vector). */
  lampDir: Cartesian4;
}

const VS = /* glsl */ `
in vec3 position;
in vec2 st;
out vec2 v_st;
out float v_day;
out vec3 v_fogColor;
out float v_dist;
out vec3 v_posEC;
uniform vec4 u_place; // x: lift above the terrain (m), y: extra depth bias (stacking order of crossing runways), z: edge light spacing (m, 0 = unlighted)

void main() {
  vec3 p = position + vec3(0.0, 0.0, u_place.x);
  vec4 pe = czm_modelView * vec4(p, 1.0);
  float d = length(pe.xyz);
  // Decal depth bias: pull the depth (not the picture) toward the eye, growing with distance, so
  // coarse distant terrain cannot cover the runway.
  float bias = 0.03 * smoothstep(200.0, 6000.0, d) + u_place.y;
  gl_Position = czm_projection * vec4(pe.xyz * (1.0 - bias), 1.0);
  czm_vertexLogDepth();

  v_st = st;
  v_dist = d;
  v_posEC = pe.xyz;

  // Same day/night shading as the globe (sun angle on level ground).
  vec3 up = normalize(czm_normal * vec3(0.0, 0.0, 1.0));
  v_day = clamp(czm_getLambertDiffuse(czm_lightDirectionEC, up) * 7.14, 0.0, 1.0);

  // Same haze colour the globe fades into.
  v_fogColor = vec3(0.0);
  if (czm_fogDensity > 0.0) {
    vec3 positionWC = (czm_model * vec4(p, 1.0)).xyz;
    vec3 lightDirection = czm_sunDirectionWC;
    vec3 rayleigh;
    vec3 mie;
    float opacity;
    czm_computeGroundAtmosphereScattering(positionWC, lightDirection, rayleigh, mie, opacity);
    vec3 fogColor = czm_computeAtmosphereColor(positionWC, lightDirection, rayleigh, mie, opacity).rgb;
    fogColor *= clamp(dot(normalize(czm_viewerPositionWC), lightDirection), czm_fogMinimumBrightness, 1.0);
    #ifndef HDR
    fogColor = czm_pbrNeutralTonemapping(fogColor);
    fogColor = czm_inverseGamma(fogColor);
    #endif
    v_fogColor = fogColor;
  }
}
`;

const FS = /* glsl */ `
in vec2 v_st;
in float v_day;
in vec3 v_fogColor;
in float v_dist;
in vec3 v_posEC;

uniform vec4 u_place; // z: edge light spacing (m, 0 = unlighted)
uniform vec4 u_lampPos;
uniform vec4 u_lampDir;
uniform vec4 u_geom;  // half width, length, surface look, rubber amount
uniform vec4 u_mark;  // centreline half width, side stripe inner, side stripe outer, lateral scale
uniform vec4 u_a0;    // end A: displaced, bar end, stripes start, stripes end        (metres from the pavement end)
uniform vec4 u_a1;    //        stripes per side, number start, number zone length, number zone half width
uniform vec4 u_a2;    //        centreline start, aiming start, aiming end, touchdown-zone limit (from the threshold)
uniform vec4 u_b0;
uniform vec4 u_b1;
uniform vec4 u_b2;
uniform vec4 u_flags; // arrows at A, arrows at B, marked, unused
uniform vec4 u_env;   // night brightness, time, runway light level
uniform sampler2D u_noise;
uniform sampler2D u_desigA;
uniform sampler2D u_desigB;

const float FT = 0.3048;

// Fraction of a pixel-wide window centred on x that lies inside [a, b] (box filter).
float span(float x, float a, float b, float w) {
  return clamp((min(x + 0.5 * w, b) - max(x - 0.5 * w, a)) / w, 0.0, 1.0);
}
// Integral of a repeating pulse (period p, "on" for the first a of each period).
float pulseArea(float x, float p, float a) {
  float k = floor(x / p);
  return k * a + min(x - k * p, a);
}
// Box-filtered repeating pulse.
float pulse(float x, float p, float a, float w) {
  return clamp((pulseArea(x + 0.5 * w, p, a) - pulseArea(x - 0.5 * w, p, a)) / w, 0.0, 1.0);
}
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

// Painted number / letter from its distance-field texture.
float glyph(sampler2D tex, vec2 uv, float zoneHalfWidth, float ws, float wt) {
  vec4 t = texture(tex, uv);
  float texel = 2.0 * zoneHalfWidth / ${DESIG_TEX_W.toFixed(1)};
  float dist = (t.g * 255.0 - 128.0) / 127.0 * ${SDF_RANGE_TEXELS.toFixed(1)} * texel; // metres, + inside the paint
  float sharp = clamp(dist / max(fwidth(dist), 1e-5) + 0.5, 0.0, 1.0);
  // When even the short side of the pixel footprint covers several texels, the averaged coverage is the better answer.
  float distant = smoothstep(1.0, 2.5, min(ws, wt) / texel);
  float inside = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
  return mix(sharp, t.r, distant) * inside;
}

// Markings of one runway end. d: metres from the pavement end, x: metres right of the centreline for a landing pilot.
float endMarks(float d, float x, vec4 e0, vec4 e1, vec4 e2, float arrows, float ws, float wt, float k) {
  float ax = abs(x);
  float paint = 0.0;
  float edge = u_mark.z > 0.0 ? u_mark.z : u_geom.x - 0.5;

  // bar across a displaced threshold
  if (e0.y > e0.x) paint = max(paint, span(d, e0.x, e0.y, wt) * span(ax, -1.0, edge, ws));

  // threshold stripes
  if (e1.x > 0.5) {
    float a = 5.75 * FT;
    float lat = pulse(ax - a, 2.0 * a, a, ws) * span(ax, a - 0.01, e1.x * 2.0 * a + 0.01, ws);
    paint = max(paint, lat * span(d, e0.z, e0.w, wt));
  }

  float dt = d - e0.x; // metres past the threshold

  // aiming point blocks
  if (e2.z > e2.y) paint = max(paint, span(d, e2.y, e2.z, wt) * span(ax, 36.0 * FT * k, 66.0 * FT * k, ws));

  // touchdown-zone bars: groups every 500 ft (3, -, 2, 2, 1, 1 bars)
  if (e2.w > 0.0) {
    float sp = 500.0 * FT;
    float g = floor((dt + 0.5 * sp) / sp);
    float local = dt - g * sp;
    float ok = step(0.5, g) * step(g, 6.5) * (1.0 - step(1.5, g) * step(g, 2.5)) * step(g * sp + 75.0 * FT, e2.w);
    float nb = g < 1.5 ? 3.0 : (g < 4.5 ? 2.0 : 1.0);
    float per = 11.0 * FT * k;
    float x0 = 36.0 * FT * k;
    float lat = pulse(ax - x0, per, 6.0 * FT * k, ws) * span(ax, x0 - 0.01, x0 + (nb - 1.0) * per + 6.0 * FT * k + 0.01, ws);
    paint = max(paint, ok * lat * span(local, 0.0, 75.0 * FT, wt));
  }

  // displaced threshold: arrows along the centreline, arrow heads across the width just before the bar
  if (arrows > 0.5 && d < e0.x + 1.0) {
    float period = 200.0 * FT;
    float shaft = 75.0 * FT;
    float head = 45.0 * FT;
    float y = d - (e0.x - 150.0 * FT);
    y = y - period * floor(y / period);
    float inPart = span(d, 0.0, e0.x - 30.0 * FT, wt);
    float shaftHalf = max(0.45, 1.5 * FT * k);
    float headHalf = 7.5 * FT * k;
    float c = span(y, 0.0, shaft, wt) * span(ax, -1.0, shaftHalf, ws);
    float hw = headHalf * (1.0 - clamp((y - shaft) / head, 0.0, 1.0));
    c = max(c, span(y, shaft, shaft + head, wt) * clamp((hw - ax) / ws + 0.5, 0.0, 1.0));
    paint = max(paint, c * inPart);
    // heads across the width
    float cell = u_geom.x / (u_geom.x > 15.0 ? 2.0 : 1.0);
    float xl = abs(x + u_geom.x - cell * (floor((x + u_geom.x) / cell) + 0.5));
    float y2 = d - (e0.x - 50.0 * FT);
    float hw2 = min(headHalf, 0.3 * cell) * (1.0 - clamp(y2 / head, 0.0, 1.0));
    paint = max(paint, span(y2, 0.0, head, wt) * clamp((hw2 - xl) / ws + 0.5, 0.0, 1.0));
  }
  return paint;
}

void main() {
  float s = v_st.x;
  float t = v_st.y;
  float hw = u_geom.x;
  float len = u_geom.y;
  float look = u_geom.z;
  float ws = max(fwidth(s), 1e-4);
  float wt = max(fwidth(t), 1e-4);
  float sAbs = abs(s);
  bool nearA = t < 0.5 * len;
  float d = nearA ? t : len - t;
  float x = nearA ? s : -s;
  vec4 e0 = nearA ? u_a0 : u_b0;
  vec4 e1 = nearA ? u_a1 : u_b1;
  vec4 e2 = nearA ? u_a2 : u_b2;
  float dt = d - e0.x;

  vec4 nFine = texture(u_noise, vec2(s, t) / 5.5);
  vec4 nMed = texture(u_noise, vec2(s, t) / 43.0);
  vec4 nBig = texture(u_noise, vec2(s, t) / 260.0 + 0.37);
  vec4 nStreak = texture(u_noise, vec2(s / 7.0, t / 190.0));

  vec3 col;
  float alpha = span(s, -hw, hw, ws) * span(t, 0.0, len, wt);
  float paved = 0.0;

  if (look < 0.5 || look > 5.5) {
    // asphalt (0) and "unknown, looks paved" (6)
    paved = 1.0;
    vec3 base = look < 0.5 ? vec3(0.215, 0.22, 0.23) : vec3(0.30, 0.30, 0.295);
    col = base * (0.84 + 0.32 * nMed.g) * (0.90 + 0.20 * nFine.r) * (0.90 + 0.20 * nBig.b);
    // worn, lighter strip where the wheels run
    float wear = 1.0 - smoothstep(0.10, 0.46, sAbs / hw);
    col = mix(col, col * 1.22 + 0.012, wear * (0.35 + 0.5 * nBig.g));
    // long sealed joints between the paving lanes
    float lane = pulse(s + hw + 0.04, max(3.8, 2.0 * hw / floor(2.0 * hw / 3.8 + 0.5)), 0.08, ws) * (0.5 + 0.5 * nMed.a);
    col *= 1.0 - 0.11 * lane;
  } else if (look < 1.5) {
    // concrete slabs
    paved = 1.0;
    col = vec3(0.60, 0.59, 0.56) * (0.90 + 0.20 * nMed.g) * (0.94 + 0.12 * nFine.r) * (0.93 + 0.14 * nBig.b);
    float slabL = 20.0 * FT;
    float lanes = max(2.0, floor(2.0 * hw / (18.75 * FT) + 0.5));
    float slabW = 2.0 * hw / lanes;
    float joint = max(pulse(s + hw + 0.03, slabW, 0.07, ws), pulse(t + 0.03, slabL, 0.07, wt));
    float tone = hash(vec2(floor((s + hw) / slabW), floor(t / slabL)));
    col *= 1.0 + (tone - 0.5) * 0.10 * (1.0 - smoothstep(0.3, 1.5, wt / slabL));
    col *= 1.0 - 0.42 * joint;
  } else if (look < 2.5) {
    // grass: a mown strip, slightly lighter and yellower than rough grass, with soft ragged edges
    col = vec3(0.34, 0.43, 0.19) * (0.80 + 0.40 * nMed.g) * (0.88 + 0.24 * nFine.r);
    col = mix(col, vec3(0.47, 0.46, 0.24), 0.35 * nBig.b);
    col *= 0.95 + 0.10 * pulse(s + 400.0, 9.0, 4.5, ws); // mowing stripes
    // bare, worn patches where aircraft touch down and turn
    float bare = smoothstep(0.55, 0.9, nBig.g * (1.0 - smoothstep(0.2, 0.7, sAbs / hw)));
    col = mix(col, vec3(0.45, 0.39, 0.26), 0.45 * bare);
    float ragged = (nMed.r - 0.5) * 5.0;
    alpha = smoothstep(0.0, 3.0, hw - sAbs + ragged) * smoothstep(0.0, 4.0, min(t, len - t) + ragged) * 0.86;
  } else if (look < 3.5) {
    // gravel
    col = vec3(0.57, 0.53, 0.46) * (0.82 + 0.36 * nFine.r) * (0.88 + 0.24 * nMed.g);
    float ragged = (nMed.r - 0.5) * 3.0;
    alpha = smoothstep(0.0, 1.6, hw - sAbs + ragged) * smoothstep(0.0, 2.5, min(t, len - t) + ragged) * 0.93;
  } else if (look < 4.5) {
    // dirt / sand / clay
    col = vec3(0.54, 0.43, 0.31) * (0.80 + 0.40 * nMed.g) * (0.90 + 0.20 * nFine.r);
    col = mix(col, vec3(0.62, 0.52, 0.38), 0.4 * nBig.b);
    // two wheel tracks
    float track = exp(-pow((sAbs - 1.3) / 0.5, 2.0)) * (0.5 + 0.5 * nStreak.a);
    col *= 1.0 - 0.16 * track;
    float ragged = (nMed.r - 0.5) * 5.0;
    alpha = smoothstep(0.0, 3.0, hw - sAbs + ragged) * smoothstep(0.0, 4.0, min(t, len - t) + ragged) * 0.88;
  } else {
    // snow / ice
    col = vec3(0.90, 0.92, 0.95) * (0.93 + 0.10 * nMed.g);
    float ragged = (nMed.r - 0.5) * 4.0;
    alpha = smoothstep(0.0, 3.0, hw - sAbs + ragged) * smoothstep(0.0, 4.0, min(t, len - t) + ragged) * 0.9;
  }

  // tyre rubber in the touchdown zones (dark streaks along the wheel tracks)
  float rubberAmount = 0.0;
  if (paved > 0.5 && u_geom.w > 0.0) {
    float zone = clamp(len / 2400.0, 0.35, 1.0);
    float along = smoothstep(40.0 * zone, 260.0 * zone, dt) * (1.0 - smoothstep(520.0 * zone, 1050.0 * zone, dt));
    float gear = hw > 20.0 ? 4.6 : 2.2;
    float across = exp(-pow((sAbs - gear) / (gear * 0.9), 2.0)) + 0.4 * exp(-pow(sAbs / 1.6, 2.0));
    float streaks = (0.15 + 1.0 * nStreak.g) * (0.55 + 0.9 * nMed.a) * (0.7 + 0.6 * texture(u_noise, vec2(s / 2.1, t / 55.0)).a);
    rubberAmount = clamp(u_geom.w * along * across * streaks * 0.9, 0.0, 0.78);
    col = mix(col, vec3(0.055, 0.055, 0.06), rubberAmount);
  }

  // paint
  if (u_flags.z > 0.5) {
    float k = u_mark.w;
    float paint = 0.0;
    // dashed centreline between the two runway numbers
    if (u_mark.x > 0.0) {
      float clA = u_a2.x;
      float clB = len - u_b2.x;
      paint = span(s, -u_mark.x, u_mark.x, ws) * pulse(t - clA, 200.0 * FT, 120.0 * FT, wt) * span(t, clA, clB, wt);
    }
    // side stripes
    if (u_mark.z > 0.0) paint = max(paint, span(sAbs, u_mark.y, u_mark.z, ws) * span(t, u_a0.x, len - u_b0.x, wt));
    paint = max(paint, endMarks(d, x, e0, e1, e2, nearA ? u_flags.x : u_flags.y, ws, wt, k));
    // runway numbers (both ends are sampled so the texture derivatives stay continuous)
    vec2 uvA = vec2(0.5 + s / (2.0 * max(u_a1.w, 0.01)), (t - u_a1.y) / max(u_a1.z, 0.01));
    vec2 uvB = vec2(0.5 - s / (2.0 * max(u_b1.w, 0.01)), (len - t - u_b1.y) / max(u_b1.z, 0.01));
    float gA = u_a1.z > 0.0 ? glyph(u_desigA, uvA, u_a1.w, ws, wt) : 0.0;
    float gB = u_b1.z > 0.0 ? glyph(u_desigB, uvB, u_b1.w, ws, wt) : 0.0;
    paint = max(paint, max(gA, gB));
    // paint wears, and rubber covers it
    float wearPaint = (0.80 + 0.20 * nMed.r) * (1.0 - 0.75 * rubberAmount);
    col = mix(col, vec3(0.90, 0.90, 0.875) * (0.92 + 0.08 * nFine.r), clamp(paint, 0.0, 1.0) * wearPaint);
  }

  // day / night …
  float light = mix(u_env.x, 1.0, v_day);
  float dark = 1.0 - v_day;
  // … a little pool of light on the pavement beside each runway edge light …
  if (u_place.z > 0.0 && u_env.z > 0.0) {
    float tl = floor(t / u_place.z + 0.5) * u_place.z;
    float ds = sAbs - (hw + 3.0);
    float d2 = (t - tl) * (t - tl) + ds * ds + 0.12;
    light += u_env.z * dark * 0.9 / (1.0 + d2 / 3.0);
  }
  // … and the aircraft's own landing / taxi light (a cone ahead of the nose)
  if (u_lampPos.w > 0.0) {
    vec3 toP = v_posEC - u_lampPos.xyz;
    float lampDist = length(toP);
    float cone = smoothstep(0.86, 0.975, dot(toP / max(lampDist, 0.01), u_lampDir.xyz));
    light += u_lampPos.w * dark * cone / (1.0 + lampDist * lampDist / 2500.0);
  }
  // … then the same haze as the terrain
  col *= czm_lightColor * min(light, 1.15);
  col = czm_fog(v_dist, col, v_fogColor, czm_fogVisualDensityScalar);
  out_FragColor = vec4(col, alpha);
}
`;

const endVec = (e: EndMarks) => ({
  v0: new Cartesian4(e.displacedM, e.barEndM, e.stripeStartM, e.stripeEndM),
  v1: new Cartesian4(e.stripesPerSide, e.desigStartM, e.desigLengthM, e.desigHalfWidthM),
  v2: new Cartesian4(e.centrelineStartM, e.aimStartM, e.aimEndM, e.tdzMaxFromThresholdM),
});

export interface SurfaceMeshData {
  vertices: Float32Array;
  indices: Uint16Array;
  center: Cartesian3;
  radius: number;
}

/**
 * Build the vertex data of a runway mesh (generator: yields now and then so the caller can spread
 * the work over several frames). `heightM(lat, lon)` is the terrain height the wheels roll on.
 */
export function* buildSurfaceVertices(frame: LocalFrame, axis: RunwayAxis, layout: RunwayLayout, heightM: (lat: number, lon: number, t: number) => number): Generator<void, SurfaceMeshData, void> {
  const m = EDGE_MARGIN_M;
  const hw = layout.widthM / 2 + m;
  const len = axis.lengthM;
  const rows = Math.max(2, Math.ceil((len + 2 * m) / ROW_STEP_M) + 1);
  const cols = Math.max(3, Math.ceil((2 * hw) / ROW_STEP_M) + 1);
  const vertices = new Float32Array(rows * cols * 5);
  const p = { lat: 0, lon: 0 };
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  let o = 0;
  for (let r = 0; r < rows; r++) {
    const t = -m + ((len + 2 * m) * r) / (rows - 1);
    for (let c = 0; c < cols; c++) {
      const s = -hw + (2 * hw * c) / (cols - 1);
      axisPoint(axis, s, t, p);
      toLocal(frame, p.lat, p.lon, heightM(p.lat, p.lon, t), vertices, o);
      const x = vertices[o]!;
      const y = vertices[o + 1]!;
      const z = vertices[o + 2]!;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
      vertices[o + 3] = s;
      vertices[o + 4] = t;
      o += 5;
    }
    if (r % 24 === 23) yield;
  }
  const indices = new Uint16Array((rows - 1) * (cols - 1) * 6);
  let i = 0;
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const a = r * cols + c;
      const b = a + 1;
      const d = a + cols;
      const e = d + 1;
      indices[i++] = a;
      indices[i++] = b;
      indices[i++] = d;
      indices[i++] = b;
      indices[i++] = e;
      indices[i++] = d;
    }
  }
  const center = new Cartesian3((minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2);
  const radius = Math.hypot(maxX - minX, maxY - minY, maxZ - minZ) / 2 + 5;
  return { vertices, indices, center, radius };
}

export interface SurfaceOptions {
  context: GlContext;
  modelMatrix: Matrix4;
  data: SurfaceMeshData;
  layout: RunwayLayout;
  lengthM: number;
  noise: GlTexture;
  desigA: GlTexture;
  desigB: GlTexture;
  shared: SurfaceShared;
  /** Stacking order among the runways of one airport (0 = bottom). */
  rank: number;
  /** Spacing of the runway edge lights, metres (0 for an unlighted runway). */
  edgeSpacingM: number;
}

/** Create the GPU mesh of a runway surface. */
export function createSurfaceMesh(o: SurfaceOptions): Mesh {
  const l = o.layout;
  const a = endVec(l.ends[0]);
  const b = endVec(l.ends[1]);
  const geom = new Cartesian4(l.widthM / 2, o.lengthM, SURFACE_LOOK[l.look], l.rubber);
  const mark = new Cartesian4(l.centrelineWidthM / 2, l.sideInnerM, l.sideOuterM, l.lateralScale);
  const flags = new Cartesian4(l.ends[0].arrows ? 1 : 0, l.ends[1].arrows ? 1 : 0, l.marked ? 1 : 0, 0);
  // 3.5 cm above the terrain, +1.2 cm per crossing runway; the tiny extra bias keeps the order at any distance.
  const place = new Cartesian4(0.035 + 0.012 * o.rank, 0.00004 * o.rank, o.edgeSpacingM, 0);
  const uniforms: UniformMap = {
    u_place: () => place,
    u_geom: () => geom,
    u_mark: () => mark,
    u_a0: () => a.v0,
    u_a1: () => a.v1,
    u_a2: () => a.v2,
    u_b0: () => b.v0,
    u_b1: () => b.v1,
    u_b2: () => b.v2,
    u_flags: () => flags,
    u_env: () => o.shared.env,
    u_lampPos: () => o.shared.lampPos,
    u_lampDir: () => o.shared.lampDir,
    u_noise: () => o.noise,
    u_desigA: () => o.desigA,
    u_desigB: () => o.desigB,
  };
  return new Mesh(o.context, {
    vertices: o.data.vertices,
    attributes: [
      { name: "position", components: 3 },
      { name: "st", components: 2 },
    ],
    indices: o.data.indices,
    vertexShader: VS,
    fragmentShader: FS,
    uniforms,
    modelMatrix: o.modelMatrix,
    localCenter: o.data.center,
    radius: o.data.radius,
    mode: "decal",
  });
}
