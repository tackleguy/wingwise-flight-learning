/**
 * Draws all lights of one airport in a single draw call: small glowing sprites whose colour,
 * brightness and flashing are decided in the shader from where the viewer is.
 *
 *   - "sided" lights show one colour from one side and another from the other (green threshold /
 *     red runway end, amber caution zone, one-directional approach lights);
 *   - PAPI units turn from red to white at their own angle above the horizon;
 *   - the beacon sweeps a green and a white beam round; approach flashers run in sequence.
 *
 * Lights keep a minimum size on screen and fade gently with distance, so a runway reads as rows of
 * points from many miles away and as individual lamps close up. They are depth-tested (hills and
 * the aircraft hide them); the depth of each sprite is that of the ground just in front of the
 * lamp so the ground cannot slice the glow in half.
 */
import { Cartesian3, Cartesian4, type Matrix4 } from "cesium";
import { Mesh, type GlContext, type UniformMap } from "./gl";
import { LIGHT_TYPE, PAPI_TRANSITION_DEG, PAPI_UNIT_SPACING_M, type Rgba } from "./lights-layout";

/** A light with its position already worked out in the airport's local east/north/up frame (metres). */
export interface PlacedLight {
  x: number;
  y: number;
  z: number;
  /** Local direction for "sided" and PAPI lights (unit vector); for PAPI units dz is their place in the row. */
  dx: number;
  dy: number;
  dz: number;
  type: number;
  sizeM: number;
  param: number;
  intensity: number;
  day: number;
  colorA: Rgba;
  colorB: Rgba;
}

/** Values shared by every airport and updated once per frame. */
export interface LightsShared {
  /** x: brightness of night-only lights 0…1, y: brightness of day-visible lights, z: time (s), w: haze extinction per metre. */
  light: Cartesian4;
  /** x: smallest sprite diameter (CSS px), y: largest, z: size multiplier (glare at night), w: daylight 0…1. */
  view: Cartesian4;
}

const VS = /* glsl */ `
in vec3 position;
in vec3 corner;   // xy: quad corner (-1…1), z: 1 = also lit by day
in vec3 aux;      // direction (sided / PAPI)
in vec4 params;   // type, glow diameter (m), parameter, intensity
in vec4 colorA;
in vec4 colorB;
out vec4 v_color;
out vec2 v_uv;
out float v_ring;
uniform vec4 u_light;
uniform vec4 u_view;

void main() {
  float type = params.x;
  vec3 camLocal = (czm_inverseModelView * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  vec3 toCam = camLocal - position;
  float dist = max(length(toCam), 0.01);
  vec3 dirToCam = toCam / dist;
  // "straight up" at the lamp (the local frame is flat, the Earth is not)
  vec3 up = normalize(vec3(position.xy / 6371000.0, 1.0));

  vec4 color = colorA;
  float power = 1.0;
  float rowShift = 0.0;
  vec3 rowDir = vec3(0.0);
  if (type > ${(LIGHT_TYPE.sided - 0.5).toFixed(1)} && type < ${(LIGHT_TYPE.sided + 0.5).toFixed(1)}) {
    float side = dot(dirToCam, aux);
    color = mix(colorB, colorA, smoothstep(-0.03, 0.03, side));
  } else if (type > ${(LIGHT_TYPE.papi - 0.5).toFixed(1)} && type < ${(LIGHT_TYPE.papi + 0.5).toFixed(1)}) {
    float elev = degrees(asin(clamp(dot(dirToCam, up), -1.0, 1.0)));
    color = mix(colorB, colorA, smoothstep(params.z - ${PAPI_TRANSITION_DEG.toFixed(3)}, params.z + ${PAPI_TRANSITION_DEG.toFixed(3)}, elev));
    // the beam points up the approach: it fades out to the sides and cannot be seen from behind
    vec3 level = dirToCam - up * dot(dirToCam, up);
    float az = dot(normalize(level + vec3(1e-6)), vec3(aux.xy, 0.0));
    power = smoothstep(0.45, 0.80, az);
    rowShift = aux.z;
    rowDir = vec3(aux.y, -aux.x, 0.0);
  } else if (type > ${(LIGHT_TYPE.beacon - 0.5).toFixed(1)} && type < ${(LIGHT_TYPE.beacon + 0.5).toFixed(1)}) {
    // one turn every 5 s: a white flash, then a green one 2.5 s later
    float ang = u_light.z * 1.2566 + params.z * 6.2832;
    float c = dot(normalize(toCam.xy + vec2(1e-6)), vec2(cos(ang), sin(ang)));
    float white = pow(max(c, 0.0), 80.0);
    float green = pow(max(-c, 0.0), 80.0);
    color = vec4(colorA.rgb * green + colorB.rgb * white, 1.0);
    power = clamp(white + green, 0.0, 1.0);
  } else if (type > ${(LIGHT_TYPE.flash - 0.5).toFixed(1)}) {
    float f = fract(u_light.z * 2.0 - params.z * 2.0);
    power = smoothstep(0.0, 0.015, f) * (1.0 - smoothstep(0.05, 0.11, f));
    power *= smoothstep(-0.03, 0.03, dot(dirToCam, aux));
  }

  vec4 pe = czm_modelView * vec4(position, 1.0);
  float depth = max(-pe.z, 0.01);
  // metres covered by one CSS pixel at the lamp
  float mpp = 2.0 * depth / (czm_projection[1][1] * czm_viewport.w) * czm_pixelRatio;
  float minPx = u_view.x * (1.0 + 0.45 * clamp(params.w - 1.0, 0.0, 2.5));
  float truePx = params.y * u_view.z / mpp; // u_view.z: lamps look larger at night (glare)
  float sizePx = clamp(truePx, minPx, u_view.y);
  // Far away the lamp is smaller than its sprite: dim it, but gently (lights carry a long way).
  float reach = pow(clamp(truePx / minPx, 0.0, 1.0), 0.33);
  float haze = exp(-dist * u_light.w);
  float gain = mix(u_light.x, max(u_light.x, u_light.y), corner.z);
  float a = color.a * power * params.w * reach * haze * gain;
  v_color = vec4(color.rgb, a);
  v_uv = corner.xy;
  // by day, lamps that are lit (the PAPI) get a dark surround so red and white read against bright ground
  v_ring = corner.z * u_view.w;

  gl_Position = czm_projection * pe;
  if (rowShift != 0.0 && gl_Position.w > 1.0) {
    // A real eye can tell the four PAPI lights apart from miles away; a screen pixel cannot.
    // Far away, keep them at least a sprite and a bit apart on screen (about their true centre).
    vec4 next = czm_projection * vec4(pe.xyz + (czm_modelView * vec4(rowDir, 0.0)).xyz * ${PAPI_UNIT_SPACING_M.toFixed(1)}, 1.0);
    if (next.w > 0.0) {
      vec2 d = (next.xy / next.w - gl_Position.xy / gl_Position.w) * 0.5 * czm_viewport.zw;
      float actual = max(length(d), 1e-4);
      float wanted = max(actual, 1.3 * sizePx * czm_pixelRatio);
      gl_Position.xy += d / actual * (wanted - actual) * rowShift * 2.0 / czm_viewport.zw * gl_Position.w;
    }
  }
  gl_Position.xy += corner.xy * sizePx * czm_pixelRatio / czm_viewport.zw * gl_Position.w;
  if (a < 0.004) gl_Position = vec4(2.0, 2.0, 2.0, 1.0); // not lit: drop the sprite

  // Depth of the ground seen under the sprite's lower edge (never more than half-way to the eye).
  vec3 upEC = normalize(czm_normal * up);
  float h = dot(-pe.xyz, upEC) + 0.5;
  float hEff = max(h, 0.02 * dist);
  float r = 0.5 * sizePx * mpp;
  float k = max(hEff / (hEff + r), 0.5) - 0.01;
  vec4 clipDepth = czm_projection * vec4(pe.xyz * k, 1.0);
  if (a >= 0.004) gl_Position.z = clamp(clipDepth.z / clipDepth.w, -1.0, 1.0) * gl_Position.w;
  czm_vertexLogDepth(clipDepth);
}
`;

const FS = /* glsl */ `
in vec4 v_color;
in vec2 v_uv;
in float v_ring;

void main() {
  float r2 = dot(v_uv, v_uv);
  if (r2 > 1.0) discard;
  float r = sqrt(r2);
  float core = 1.0 - smoothstep(0.24, 0.64, r);
  float halo = max(exp(-r2 * 4.6) - 0.01, 0.0);
  float a = min(v_color.a, 1.0);
  float boost = clamp(v_color.a - 1.0, 0.0, 2.0); // very bright lamps get a stronger halo
  vec3 lamp = mix(v_color.rgb, vec3(1.0), 0.45 * core);
  vec3 rgb = lamp * a * (core + halo * (0.75 + 0.5 * boost));
  float ring = v_ring * (1.0 - core) * (1.0 - smoothstep(0.82, 1.0, r)) * 0.6;
  out_FragColor = vec4(rgb, a * max(core * 0.9, ring));
  czm_writeLogDepth();
}
`;

const BYTES_PER_VERTEX = 60;
const CORNERS = [
  [-1, -1],
  [1, -1],
  [1, 1],
  [-1, 1],
] as const;

/** Create the GPU mesh for a list of lights (null when the list is empty). */
export function createLightsMesh(context: GlContext, modelMatrix: Matrix4, lights: PlacedLight[], shared: LightsShared): Mesh | null {
  const n = lights.length;
  if (!n) return null;
  const buffer = new ArrayBuffer(n * 4 * BYTES_PER_VERTEX);
  const f = new Float32Array(buffer);
  const u8 = new Uint8Array(buffer);
  const indices = n * 4 > 65535 ? new Uint32Array(n * 6) : new Uint16Array(n * 6);
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < n; i++) {
    const l = lights[i]!;
    minX = Math.min(minX, l.x);
    maxX = Math.max(maxX, l.x);
    minY = Math.min(minY, l.y);
    maxY = Math.max(maxY, l.y);
    minZ = Math.min(minZ, l.z);
    maxZ = Math.max(maxZ, l.z);
    for (let c = 0; c < 4; c++) {
      const v = i * 4 + c;
      const o = (v * BYTES_PER_VERTEX) / 4;
      f[o] = l.x;
      f[o + 1] = l.y;
      f[o + 2] = l.z;
      f[o + 3] = CORNERS[c]![0];
      f[o + 4] = CORNERS[c]![1];
      f[o + 5] = l.day;
      f[o + 6] = l.dx;
      f[o + 7] = l.dy;
      f[o + 8] = l.dz;
      f[o + 9] = l.type;
      f[o + 10] = l.sizeM;
      f[o + 11] = l.param;
      f[o + 12] = l.intensity;
      const b = v * BYTES_PER_VERTEX + 52;
      u8[b] = l.colorA[0];
      u8[b + 1] = l.colorA[1];
      u8[b + 2] = l.colorA[2];
      u8[b + 3] = l.colorA[3];
      u8[b + 4] = l.colorB[0];
      u8[b + 5] = l.colorB[1];
      u8[b + 6] = l.colorB[2];
      u8[b + 7] = l.colorB[3];
    }
    const k = i * 6;
    const v0 = i * 4;
    indices[k] = v0;
    indices[k + 1] = v0 + 1;
    indices[k + 2] = v0 + 2;
    indices[k + 3] = v0;
    indices[k + 4] = v0 + 2;
    indices[k + 5] = v0 + 3;
  }
  const uniforms: UniformMap = {
    u_light: () => shared.light,
    u_view: () => shared.view,
  };
  return new Mesh(context, {
    vertices: f,
    attributes: [
      { name: "position", components: 3 },
      { name: "corner", components: 3 },
      { name: "aux", components: 3 },
      { name: "params", components: 4 },
      { name: "colorA", components: 4, type: "ubyte" },
      { name: "colorB", components: 4, type: "ubyte" },
    ],
    indices,
    vertexShader: VS,
    fragmentShader: FS,
    uniforms,
    modelMatrix,
    localCenter: new Cartesian3((minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2),
    radius: Math.hypot(maxX - minX, maxY - minY, maxZ - minZ) / 2 + 30,
    mode: "glow",
  });
}
