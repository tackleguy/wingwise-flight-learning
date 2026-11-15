/**
 * Windsocks: an orange-and-white sock on a pole that swings to point DOWNWIND and fills out as
 * the wind gets stronger — hanging limp in calm air, fully straight at 15 knots. The five bands
 * extend one after another (roughly 3 knots each), the way pilots are taught to read a real one.
 *
 * All the socks of one airport are a single mesh; the bending is done in the vertex shader from
 * two numbers (wind direction and strength), so animating them costs nothing on the CPU.
 * The sock is drawn about 1.4× the size of a real large windsock so it can be found from the
 * traffic pattern (stated in docs/notes/scenery.md).
 */
import { Cartesian3, Cartesian4, type Matrix4 } from "cesium";
import { Mesh, type GlContext, type UniformMap } from "./gl";

export { sockExtension } from "./windsock-math";

export const SOCK_LENGTH_M = 5.0;
export const SOCK_MOUTH_RADIUS_M = 0.62;
const SOCK_TIP_RADIUS_M = 0.3;
export const POLE_HEIGHT_M = 8.0;
const POLE_RADIUS_M = 0.09;
const BANDS = 5;
const RING_SEGMENTS = 10;
const SUB = 2; // sub-rings per band


/** Values shared by every windsock and updated once per frame. */
export interface WindsockShared {
  /** x, y: unit vector the wind blows TOWARD (east, north); z: extension 0…1; w: time (s). */
  wind: Cartesian4;
  /** x: night brightness. */
  env: Cartesian4;
}

const VS = /* glsl */ `
in vec3 position; // top of the pole (where the sock is attached)
in vec4 shape;    // sock: distance along 0…1, angle round the ring, ring radius, 1.   pole: 0,0,0,0
in vec3 offset;   // pole: offset from the top of the pole
in vec4 color;    // rgb, a = 1 at lighted airports
out vec3 v_color;
out float v_dist;
uniform vec4 u_wind;
uniform vec4 u_env;

void main() {
  vec3 p = position + offset;
  vec3 normal = vec3(normalize(offset.xy + vec2(1e-5)), 0.0);
  if (shape.w > 0.5) {
    float u = shape.x;
    float f = u_wind.z;
    float time = u_wind.w;
    // sway a little about the wind direction
    float yaw = (0.07 * sin(time * 1.3 + position.x) + 0.05 * sin(time * 3.7 + u * 4.0) * u) * (0.4 + f);
    vec2 dw = vec2(u_wind.x * cos(yaw) - u_wind.y * sin(yaw), u_wind.x * sin(yaw) + u_wind.y * cos(yaw));
    vec3 side = vec3(dw.y, -dw.x, 0.0);
    // walk along the sock: straight for the part the wind can hold up, drooping after that
    vec3 c = vec3(0.0);
    vec3 dir = vec3(dw, 0.0);
    const int STEPS = 8;
    for (int i = 0; i < STEPS; i++) {
      float ui = (float(i) + 0.5) / float(STEPS) * u;
      float droop = 1.5 * smoothstep(f - 0.05, f + 0.32, ui) * (1.0 - 0.9 * smoothstep(0.9, 1.0, f));
      droop += 0.07 * sin(time * 6.5 - ui * 8.0 + position.y) * ui * (0.3 + f);
      dir = vec3(dw * cos(droop), -sin(droop));
      c += dir * (u * ${SOCK_LENGTH_M.toFixed(2)} / float(STEPS));
    }
    // limp cloth is not blown round: the hanging part collapses
    float inflate = mix(0.42, 1.0, clamp(f * 1.7 - u * 0.6, 0.0, 1.0));
    float radius = shape.z * mix(1.0, inflate, smoothstep(0.08, 0.4, u));
    vec3 n2 = cross(side, dir);
    normal = cos(shape.y) * side + sin(shape.y) * n2;
    p = position + c + radius * normal;
  }
  vec4 pe = czm_modelView * vec4(p, 1.0);
  gl_Position = czm_projection * pe;
  v_dist = length(pe.xyz);

  vec3 up = normalize(czm_normal * vec3(0.0, 0.0, 1.0));
  float day = clamp(czm_getLambertDiffuse(czm_lightDirectionEC, up) * 7.14, 0.0, 1.0);
  vec3 nEC = normalize(czm_normal * normal);
  float shade = 0.72 + 0.28 * abs(dot(nEC, czm_lightDirectionEC));
  // lighted airports keep their windsock lit at night
  float night = mix(u_env.x, max(u_env.x, 0.62), color.a);
  v_color = color.rgb * shade * mix(night, 1.0, day) * czm_lightColor;
}
`;

const FS = /* glsl */ `
in vec3 v_color;
in float v_dist;
void main() {
  // fade into the haze like everything else (grey is close enough at windsock distances)
  float fog = 1.0 - exp(-pow(v_dist * czm_fogDensity, 2.0));
  out_FragColor = vec4(mix(v_color, vec3(0.62, 0.66, 0.70) * max(max(v_color.r, v_color.g), v_color.b) * 1.2, fog * 0.85), 1.0);
}
`;

const ORANGE = [255, 106, 18] as const;
const WHITE = [245, 245, 240] as const;
const POLE = [150, 152, 158] as const;

/** A windsock position in the airport's local frame: the foot of the pole on the ground. */
export interface SockSite {
  x: number;
  y: number;
  z: number;
}

const VERTS_PER_SOCK = BANDS * (SUB + 1) * (RING_SEGMENTS + 1) + 2 * 6;
const FLOATS = 11; // 3 + 4 + 3 + 1 (colour as 4 bytes)

/** Create the GPU mesh for the windsocks of an airport (null when there are none). */
export function createWindsockMesh(context: GlContext, modelMatrix: Matrix4, sites: SockSite[], lighted: boolean, shared: WindsockShared): Mesh | null {
  if (!sites.length) return null;
  const buffer = new ArrayBuffer(sites.length * VERTS_PER_SOCK * FLOATS * 4);
  const f = new Float32Array(buffer);
  const u8 = new Uint8Array(buffer);
  const indices: number[] = [];
  let v = 0;
  const put = (top: SockSite, shape: [number, number, number, number], off: [number, number, number], rgb: readonly [number, number, number]) => {
    const o = v * FLOATS;
    f[o] = top.x;
    f[o + 1] = top.y;
    f[o + 2] = top.z;
    f[o + 3] = shape[0];
    f[o + 4] = shape[1];
    f[o + 5] = shape[2];
    f[o + 6] = shape[3];
    f[o + 7] = off[0];
    f[o + 8] = off[1];
    f[o + 9] = off[2];
    const b = (o + 10) * 4;
    u8[b] = rgb[0];
    u8[b + 1] = rgb[1];
    u8[b + 2] = rgb[2];
    u8[b + 3] = lighted ? 255 : 0;
    return v++;
  };
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (const site of sites) {
    const top: SockSite = { x: site.x, y: site.y, z: site.z + POLE_HEIGHT_M };
    minX = Math.min(minX, site.x);
    maxX = Math.max(maxX, site.x);
    minY = Math.min(minY, site.y);
    maxY = Math.max(maxY, site.y);
    minZ = Math.min(minZ, site.z);
    maxZ = Math.max(maxZ, top.z);
    // sock: five bands, each with its own rings so the colour edges are crisp
    for (let band = 0; band < BANDS; band++) {
      const rgb = band % 2 === 0 ? ORANGE : WHITE;
      const first = v;
      for (let k = 0; k <= SUB; k++) {
        const u = (band + k / SUB) / BANDS;
        const radius = SOCK_MOUTH_RADIUS_M + (SOCK_TIP_RADIUS_M - SOCK_MOUTH_RADIUS_M) * u;
        for (let s = 0; s <= RING_SEGMENTS; s++) put(top, [u, (s / RING_SEGMENTS) * Math.PI * 2, radius, 1], [0, 0, 0], rgb);
      }
      const ring = RING_SEGMENTS + 1;
      for (let k = 0; k < SUB; k++) {
        for (let s = 0; s < RING_SEGMENTS; s++) {
          const a = first + k * ring + s;
          const b = a + 1;
          const c = a + ring;
          const d = c + 1;
          indices.push(a, b, c, b, d, c);
        }
      }
    }
    // pole: a six-sided column from the ground to just above the sock mouth
    const firstPole = v;
    for (let s = 0; s < 6; s++) {
      const ang = (s / 6) * Math.PI * 2;
      const ox = Math.cos(ang) * POLE_RADIUS_M;
      const oy = Math.sin(ang) * POLE_RADIUS_M;
      put(top, [0, 0, 0, 0], [ox, oy, -POLE_HEIGHT_M], POLE);
      put(top, [0, 0, 0, 0], [ox, oy, SOCK_MOUTH_RADIUS_M + 0.15], POLE);
    }
    for (let s = 0; s < 6; s++) {
      const a = firstPole + s * 2;
      const b = firstPole + ((s + 1) % 6) * 2;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const uniforms: UniformMap = {
    u_wind: () => shared.wind,
    u_env: () => shared.env,
  };
  return new Mesh(context, {
    vertices: f,
    attributes: [
      { name: "position", components: 3 },
      { name: "shape", components: 4 },
      { name: "offset", components: 3 },
      { name: "color", components: 4, type: "ubyte" },
    ],
    indices: new Uint16Array(indices),
    vertexShader: VS,
    fragmentShader: FS,
    uniforms,
    modelMatrix,
    localCenter: new Cartesian3((minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2),
    radius: Math.hypot(maxX - minX, maxY - minY, maxZ - minZ) / 2 + SOCK_LENGTH_M + 2,
    mode: "solid",
  });
}
