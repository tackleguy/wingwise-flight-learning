/**
 * The aircraft as you see it: the 3D model, its moving parts, its lights, and the two things it puts
 * on the ground — a soft shadow (the height cue for the landing flare) and the landing-light pool at
 * night. The model is the FlightGear 3D model of the aircraft being flown (public/models/fg/, see
 * ./model-spec.ts); the original SkyReady trainer model (public/models/trainer.glb, built by
 * scripts/build-aircraft.mjs) is the fallback when a FlightGear model is missing.
 */
import {
  BillboardCollection,
  BlendOption,
  BlendingState,
  BoundingSphere,
  Cartesian2,
  Cartesian3,
  Cartesian4,
  Color,
  ComponentDatatype,
  CustomShader,
  Geometry,
  GeometryAttribute,
  GeometryInstance,
  ImageBasedLighting,
  LightingModel,
  Material,
  MaterialAppearance,
  Matrix3,
  Matrix4,
  Model,
  NearFarScalar,
  Primitive,
  PrimitiveType,
  ShadowMode,
  SunLight,
  UniformType,
  type Billboard,
  type ModelNode,
} from "cesium";
import { D2R, FT_PER_M, FT_PER_NM, M_PER_FT, R2D, clamp, destination, norm360, smoothstep } from "@/core/math";
import type { Sim } from "@/core/sim";
import { daylight, sunPosition } from "@/core/sun";
import { aircraftMatrix, type World } from "@/world/world";
import { FG_MODELS } from "@/aircraft/fg-models.gen";
import type { CrashModule } from "@/crash";
import { approach, gearShiftM, type RenderPose } from "./math";
import { visualSpecFor, type LightKey, type VisualSpec } from "./model-spec";
import { TRAINER_META } from "./trainer-meta";

/** What the shader does with each kind of surface (kinds are whole numbers added to texture U by the build script). */
const SHADER = /* glsl */ `
void fragmentMain(FragmentInput fsInput, inout czm_modelMaterial material) {
  vec2 uv = fsInput.attributes.texCoord_0;
  float kind = floor(uv.x + 0.0005);
  vec3 n = normalize(fsInput.attributes.normalEC);
  vec3 v = -normalize(fsInput.attributes.positionEC);
  vec3 up = normalize(czm_viewRotation * u_upWC);
  if (kind < 0.5) {
    // Painted outside surfaces: sun light comes from the scene; add light from the sky and the
    // ground, and a soft reflection of the sky on glossy parts (windows, spinner).
    float nUp = dot(n, up);
    vec3 ambient = mix(u_groundAmb, u_skyAmb, nUp * 0.5 + 0.5);
    vec3 r = reflect(-v, n);
    float rUp = dot(r, up);
    vec3 env = rUp > 0.0 ? mix(u_envHorizon, u_envZenith, pow(rUp, 0.55)) : mix(u_envHorizon, u_envGround, smoothstep(0.0, 0.3, -rUp));
    float gloss = 1.0 - material.roughness;
    float fresnel = pow(1.0 - clamp(dot(n, v), 0.0, 1.0), 5.0);
    vec3 f = material.specular + (max(vec3(gloss), material.specular) - material.specular) * fresnel;
    // The aircraft's own lights fall on the airframe near them (noticeable at night: the red flash on the tail,
    // the wing tips lit by the strobes). u_lightsB.z is 1 at night and small by day.
    vec3 p = fsInput.attributes.positionEC;
    vec3 own = vec3(0.0);
    vec3 L = u_beaconEC - p;
    float d2 = dot(L, L);
    own += vec3(1.0, 0.07, 0.05) * (u_lightsA.x * 0.55 * max(dot(n, L * inversesqrt(d2 + 0.0001)), 0.0) / (1.0 + d2 * 0.8));
    L = u_tipLeftEC - p;
    d2 = dot(L, L);
    own += (vec3(1.0, 0.07, 0.05) * (u_lightsA.y * 0.14) + vec3(u_lightsA.z * 1.3)) * (max(dot(n, L * inversesqrt(d2 + 0.0001)), 0.0) / (1.0 + d2 * 0.5));
    L = u_tipRightEC - p;
    d2 = dot(L, L);
    own += (vec3(0.05, 1.0, 0.3) * (u_lightsA.y * 0.14) + vec3(u_lightsA.z * 1.3)) * (max(dot(n, L * inversesqrt(d2 + 0.0001)), 0.0) / (1.0 + d2 * 0.5));
    material.emissive += material.diffuse * (ambient + own * u_lightsB.z) + env * f * gloss * gloss;
  } else if (kind < 1.5) {
    // Cabin interior: lit softly through the windows, never by direct sun through the roof.
    float nUp = dot(n, up);
    material.emissive = material.diffuse * u_cabin * (0.72 + 0.28 * nUp);
    material.diffuse = vec3(0.0);
    material.specular = vec3(0.0);
    material.roughness = 1.0;
  } else if (kind < 2.5) {
    // Blurred propeller disc: faint grey, lighter toward the painted tips, fading out at the rim and the hub.
    float rr = fract(uv.x);
    float body = smoothstep(0.16, 0.34, rr) * (1.0 - smoothstep(0.9, 1.0, rr));
    float tip = smoothstep(0.87, 0.91, rr) * (1.0 - smoothstep(0.94, 0.985, rr));
    vec3 light = u_skyAmb + u_groundAmb + vec3(0.02);
    material.emissive = mix(vec3(0.045), vec3(0.6), tip) * light;
    material.diffuse = vec3(0.0);
    material.specular = vec3(0.0);
    material.alpha = u_disc * (0.1 * body * (0.5 + 0.5 * rr) + 0.035 * tip);
  } else {
    // Light lenses glow when their light is on.
    float on = kind < 3.5 ? u_lightsA.x : kind < 5.5 ? u_lightsA.y : kind < 6.5 ? u_lightsA.w : kind < 7.5 ? u_lightsA.z : kind < 8.5 ? u_lightsB.x : u_lightsB.y;
    vec3 glow = kind < 4.5 ? vec3(1.0, 0.06, 0.04) : kind < 5.5 ? vec3(0.05, 1.0, 0.3) : vec3(1.0, 0.97, 0.9);
    float nUp = dot(n, up);
    material.emissive += material.diffuse * mix(u_groundAmb, u_skyAmb, nUp * 0.5 + 0.5) + glow * on * 2.5;
  }
}
`;

/**
 * Shading for the converted FlightGear models: the "painted outside surfaces" part of the trainer
 * shader above (sky and ground light, sky reflections, the aircraft's own lights on the airframe),
 * applied to every surface — these models have no surface-kind codes in their texture coordinates.
 */
const FG_SHADER = /* glsl */ `
void fragmentMain(FragmentInput fsInput, inout czm_modelMaterial material) {
  vec3 n = normalize(fsInput.attributes.normalEC);
  vec3 v = -normalize(fsInput.attributes.positionEC);
  if (dot(n, v) < 0.0) n = -n; // two-sided surfaces seen from behind
  vec3 up = normalize(czm_viewRotation * u_upWC);
  float nUp = dot(n, up);
  vec3 ambient = mix(u_groundAmb, u_skyAmb, nUp * 0.5 + 0.5);
  vec3 r = reflect(-v, n);
  float rUp = dot(r, up);
  vec3 env = rUp > 0.0 ? mix(u_envHorizon, u_envZenith, pow(rUp, 0.55)) : mix(u_envHorizon, u_envGround, smoothstep(0.0, 0.3, -rUp));
  float gloss = 1.0 - material.roughness;
  float fresnel = pow(1.0 - clamp(dot(n, v), 0.0, 1.0), 5.0);
  vec3 f = material.specular + (max(vec3(gloss), material.specular) - material.specular) * fresnel;
  vec3 p = fsInput.attributes.positionEC;
  vec3 own = vec3(0.0);
  vec3 L = u_beaconEC - p;
  float d2 = dot(L, L);
  own += vec3(1.0, 0.07, 0.05) * (u_lightsA.x * 0.55 * max(dot(n, L * inversesqrt(d2 + 0.0001)), 0.0) / (1.0 + d2 * 0.8));
  L = u_tipLeftEC - p;
  d2 = dot(L, L);
  own += (vec3(1.0, 0.07, 0.05) * (u_lightsA.y * 0.14) + vec3(u_lightsA.z * 1.3)) * (max(dot(n, L * inversesqrt(d2 + 0.0001)), 0.0) / (1.0 + d2 * 0.5));
  L = u_tipRightEC - p;
  d2 = dot(L, L);
  own += (vec3(0.05, 1.0, 0.3) * (u_lightsA.y * 0.14) + vec3(u_lightsA.z * 1.3)) * (max(dot(n, L * inversesqrt(d2 + 0.0001)), 0.0) / (1.0 + d2 * 0.5));
  material.emissive += material.diffuse * (ambient + own * u_lightsB.z) + env * f * gloss * gloss;
}
`;

const SHADOW_FABRIC = /* glsl */ `
float skyreadyBox(vec2 p, vec2 b) { vec2 d = abs(p) - b; return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0); }
czm_material czm_getMaterial(czm_materialInput materialInput) {
  czm_material m = czm_getDefaultMaterial(materialInput);
  vec2 p = (materialInput.st * 2.0 - 1.0) * halfSize / shapeScale; // metres (of the trainer's outline): x toward the nose, y toward the left wing
  float d = skyreadyBox(p - vec2(-1.85, 0.0), vec2(4.0, 0.38)) - 0.14; // fuselage
  d = min(d, skyreadyBox(p - vec2(-0.4, 0.0), vec2(0.72, 5.42)) - 0.08); // wing
  d = min(d, skyreadyBox(p - vec2(-4.88, 0.0), vec2(0.55, 1.68)) - 0.05); // tailplane
  float edge = max(length(materialInput.st * 2.0 - 1.0) - 0.9, 0.0) * 10.0;
  m.diffuse = vec3(0.0);
  m.alpha = opacity * (1.0 - smoothstep(-soft, soft, d)) * (1.0 - clamp(edge, 0.0, 1.0));
  return m;
}
`;

const POOL_FABRIC = /* glsl */ `
czm_material czm_getMaterial(czm_materialInput materialInput) {
  czm_material m = czm_getDefaultMaterial(materialInput);
  vec2 p = materialInput.st * 2.0 - 1.0;
  float r2 = dot(p, p);
  m.diffuse = tint;
  m.alpha = intensity * exp(-3.2 * r2) * (1.0 - smoothstep(0.7, 1.0, r2));
  return m;
}
`;

/** A flat patch laid on the ground (shadow, light pool). Local axes of its matrix: +X heading, +Y left, +Z up; the patch covers −1…+1 before scaling. */
class GroundPatch {
  readonly primitive: Primitive;
  readonly material: Material;
  private readonly matrix = new Matrix4();
  private readonly scale = new Cartesian3(1, 1, 1);

  constructor(world: World, type: string, source: string, uniforms: Record<string, unknown>) {
    // Drawn in the opaque pass with ordinary alpha blending (not CesiumJS's order-independent translucency, which
    // averages overlapping see-through layers and made the shadow and the light glows disturb each other).
    this.material = new Material({ fabric: { type, uniforms, source }, translucent: false });
    const geometry = new Geometry({
      attributes: {
        position: new GeometryAttribute({ componentDatatype: ComponentDatatype.DOUBLE, componentsPerAttribute: 3, values: new Float64Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]) }),
        normal: new GeometryAttribute({ componentDatatype: ComponentDatatype.FLOAT, componentsPerAttribute: 3, values: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]) }),
        st: new GeometryAttribute({ componentDatatype: ComponentDatatype.FLOAT, componentsPerAttribute: 2, values: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]) }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
      indices: new Uint16Array([0, 1, 2, 0, 2, 3]),
      primitiveType: PrimitiveType.TRIANGLES,
      boundingSphere: new BoundingSphere(Cartesian3.ZERO, Math.SQRT2),
    });
    this.primitive = new Primitive({
      geometryInstances: new GeometryInstance({ geometry }),
      appearance: new MaterialAppearance({
        material: this.material,
        flat: true,
        faceForward: false,
        translucent: false,
        closed: false,
        materialSupport: MaterialAppearance.MaterialSupport.TEXTURED,
        renderState: { depthTest: { enabled: true }, depthMask: false, blending: BlendingState.ALPHA_BLEND, cull: { enabled: false } },
      }),
      asynchronous: false,
      allowPicking: false,
      show: false,
    });
    world.scene.primitives.add(this.primitive);
  }

  place(lat: number, lon: number, altFt: number, headingDeg: number, pitchDeg: number, rollDeg: number, halfLengthM: number, halfWidthM: number): void {
    aircraftMatrix(lat, lon, altFt, headingDeg, pitchDeg, rollDeg, this.matrix);
    this.scale.x = halfLengthM;
    this.scale.y = halfWidthM;
    Matrix4.multiplyByScale(this.matrix, this.scale, this.matrix);
    this.primitive.modelMatrix = this.matrix;
  }

  set show(v: boolean) {
    this.primitive.show = v;
  }

  destroy(world: World): void {
    world.scene.primitives.remove(this.primitive);
  }
}

interface LightDef {
  key: LightKey;
  color: [number, number, number];
  /** Glow size on screen when close, pixels. */
  size: number;
  /** Direction the light mainly shines (body frame) and how wide (cosine of the half angle); null = all round. */
  axis: [number, number, number] | null;
  cos: number;
  /** How much of the glow is left in full daylight (0…1). */
  day: number;
}
const LIGHT_DEFS: LightDef[] = [
  { key: "beacon", color: [1, 0.1, 0.08], size: 60, axis: null, cos: -1, day: 0.4 },
  { key: "navLeft", color: [1, 0.08, 0.06], size: 34, axis: [0.574, 0.819, 0], cos: 0.4, day: 0.3 },
  { key: "navRight", color: [0.1, 1, 0.3], size: 34, axis: [0.574, -0.819, 0], cos: 0.4, day: 0.3 },
  { key: "strobeLeft", color: [1, 1, 1], size: 96, axis: null, cos: -1, day: 0.75 },
  { key: "strobeRight", color: [1, 1, 1], size: 96, axis: null, cos: -1, day: 0.75 },
  { key: "tail", color: [1, 0.97, 0.9], size: 30, axis: [-1, 0, 0], cos: 0.2, day: 0.3 },
  { key: "landing", color: [1, 0.96, 0.86], size: 110, axis: [0.99, 0, -0.14], cos: 0.25, day: 0.6 },
  { key: "taxi", color: [1, 0.96, 0.86], size: 70, axis: [0.98, 0, -0.2], cos: 0.1, day: 0.45 },
];

/** Landing gear legs: node name, lowest point of the tyre (body frame), and how far the wheel hangs down in flight (m). */
const GEAR = [
  { node: "gear_nose", wheel: TRAINER_META.wheels.nose, hang: 0.06 },
  { node: "gear_main_left", wheel: TRAINER_META.wheels.mainLeft, hang: 0.035 },
  { node: "gear_main_right", wheel: TRAINER_META.wheels.mainRight, hang: 0.035 },
] as const;

const HINGES = ["elevator", "rudder", "aileronLeft", "aileronRight", "flapLeft", "flapRight", "propeller", "propellerBlades"] as const;
type HingeKey = (typeof HINGES)[number];

function glowSprite(): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d");
  if (g) {
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    // a small hot core with a wide, faint halo
    grad.addColorStop(0, "rgba(255,255,255,1)");
    grad.addColorStop(0.07, "rgba(255,255,255,0.95)");
    grad.addColorStop(0.16, "rgba(255,255,255,0.4)");
    grad.addColorStop(0.32, "rgba(255,255,255,0.13)");
    grad.addColorStop(0.6, "rgba(255,255,255,0.035)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
  }
  return c;
}

export class AircraftVisual {
  /** Earth-fixed ← aircraft body (x nose, y left wing, z up) for the frame being drawn. */
  readonly bodyMatrix = new Matrix4();
  ready = false;
  failed = false;
  /** 0 night … 1 day at the aircraft (updated every frame). */
  daylight = 1;
  /** Lamp test: show the flashing lights (beacon, strobes) steadily — for checking them on developer pages. */
  holdFlash = false;

  private model: Model | null = null;
  /** The shader of the model being shown (trainer or FlightGear). */
  private shader: CustomShader;
  private readonly trainerShader: CustomShader;
  private readonly fgShader: CustomShader;
  /** The model shown now / being loaded. */
  private spec: VisualSpec = visualSpecFor("c172p");
  private loadToken = 0;
  /** Propellers of engines 2… (engine 1 uses `nodes.propeller` / `propellerBlades` / `discNode`). */
  private readonly extraProps: { spin?: ModelNode; blades?: ModelNode; disc?: ModelNode }[] = [];
  private gearRetractNode: ModelNode | undefined;
  private readonly billboards: BillboardCollection;
  private readonly glows: Billboard[] = [];
  private readonly lightLocal: Cartesian3[] = [];
  private readonly shadow: GroundPatch;
  private readonly pool: GroundPatch;
  private readonly nodes: Partial<Record<HingeKey, ModelNode>> = {};
  private readonly hingeDeg: Record<HingeKey, number> = { elevator: 999, rudder: 999, aileronLeft: 999, aileronRight: 999, flapLeft: 999, flapRight: 999, propeller: 999, propellerBlades: 999 };
  private discNode: ModelNode | undefined;
  private readonly gearNodes: (ModelNode | undefined)[] = [];
  private readonly gearShift = [0, 0, 0];
  private readonly gearApplied = [99, 99, 99];
  private cabinNode: ModelNode | undefined;
  private cockpitNode: ModelNode | undefined;
  /** Crash physics: the model's nodes by name (pieces that can break off), their animation matrices, and those moved or hidden. */
  private readonly crashNodes = new Map<string, ModelNode>();
  private readonly nodeBase = new Map<ModelNode, Matrix4>();
  private readonly crashTouched = new Set<ModelNode>();
  private readonly deltaM = new Matrix4();
  private readonly crashM = new Matrix4();
  private interior = false;
  private interiorApplied: boolean | null = null;
  private propAngle = 0;
  private lastSimTime = 0;
  private clock = 0;
  private frameNo = 0;
  private slopePitch = 0;
  private slopeRoll = 0;
  private disposed = false;
  private sunAtMs = Number.NaN;
  private sunElevDeg = 45;
  private readonly on = new Float32Array(8);

  // scratch
  private readonly rot3 = new Matrix3();
  private readonly rot4 = new Matrix4();
  private readonly nodeM = new Matrix4();
  private readonly v3 = new Cartesian3();
  private readonly v3b = new Cartesian3();
  private readonly v3c = new Cartesian3();
  private readonly lightColor = new Cartesian3(2, 2, 2);
  private readonly uSky = new Cartesian3();
  private readonly uGround = new Cartesian3();
  private readonly uZenith = new Cartesian3();
  private readonly uHorizon = new Cartesian3();
  private readonly uEnvGround = new Cartesian3();
  private readonly uCabin = new Cartesian3();
  private readonly uLightsA = new Cartesian4();
  private readonly uLightsB = new Cartesian4();
  private readonly uUp = new Cartesian3(0, 0, 1);
  private readonly color = new Color();

  constructor(private readonly world: World) {
    const v3 = (x: number, y: number, z: number) => ({ type: UniformType.VEC3, value: new Cartesian3(x, y, z) });
    const uniforms = () => ({
        u_upWC: v3(0, 0, 1),
        u_skyAmb: v3(0.4, 0.45, 0.55),
        u_groundAmb: v3(0.2, 0.19, 0.17),
        u_envZenith: v3(0.2, 0.4, 0.8),
        u_envHorizon: v3(0.75, 0.82, 0.9),
        u_envGround: v3(0.2, 0.2, 0.17),
        u_cabin: v3(0.6, 0.6, 0.6),
        u_beaconEC: v3(0, 0, -100),
        u_tipLeftEC: v3(0, 0, -100),
        u_tipRightEC: v3(0, 0, -100),
        u_lightsA: { type: UniformType.VEC4, value: new Cartesian4(0, 0, 0, 0) },
        u_lightsB: { type: UniformType.VEC4, value: new Cartesian4(0, 0, 0, 0) },
        u_disc: { type: UniformType.FLOAT, value: 0 },
    });
    this.trainerShader = new CustomShader({ lightingModel: LightingModel.PBR, uniforms: uniforms(), fragmentShaderText: SHADER });
    this.fgShader = new CustomShader({ lightingModel: LightingModel.PBR, uniforms: uniforms(), fragmentShaderText: FG_SHADER });
    this.shader = this.trainerShader;
    this.billboards = new BillboardCollection({ scene: world.scene, blendOption: BlendOption.TRANSLUCENT });
    world.scene.primitives.add(this.billboards);
    const sprite = glowSprite();
    for (const def of LIGHT_DEFS) {
      const p = this.spec.lights[def.key];
      this.lightLocal.push(new Cartesian3(p[0], p[1], p[2]));
      this.glows.push(
        this.billboards.add({
          position: new Cartesian3(),
          image: sprite,
          show: false,
          width: def.size,
          height: def.size,
          color: new Color(def.color[0], def.color[1], def.color[2], 1),
          scaleByDistance: new NearFarScalar(25, 1, 4000, 0.16),
          eyeOffset: new Cartesian3(0, 0, -0.4),
        }),
      );
    }
    this.shadow = new GroundPatch(world, "SkyreadyAircraftShadow", SHADOW_FABRIC, { opacity: 0.5, soft: 0.2, halfSize: new Cartesian2(9, 9), shapeScale: 1 });
    this.pool = new GroundPatch(world, "SkyreadyLandingLightPool", POOL_FABRIC, { intensity: 0.5, tint: new Color(1, 0.95, 0.82, 1) });
    void this.load(this.spec);
  }

  /** Show the model of this aircraft (loads it if a different model is shown now). */
  setAircraft(id: string): void {
    const spec = visualSpecFor(id);
    if (spec.url === this.spec.url && (this.model || !this.failed)) {
      this.spec = spec;
      return;
    }
    void this.load(spec);
  }

  private async load(spec: VisualSpec): Promise<void> {
    const token = ++this.loadToken;
    // forget the previous model
    if (this.model) {
      this.world.scene.primitives.remove(this.model);
      this.model = null;
    }
    this.ready = false;
    this.failed = false;
    this.spec = spec;
    this.shader = spec.fg ? this.fgShader : this.trainerShader;
    LIGHT_DEFS.forEach((def, i) => {
      const p = spec.lights[def.key];
      Cartesian3.fromElements(p[0], p[1], p[2], this.lightLocal[i]);
    });
    try {
      const url = new URL(`${import.meta.env.BASE_URL}${spec.url}`, document.baseURI).href;
      const model = await Model.fromGltfAsync({
        url,
        customShader: this.shader,
        // Lighting is done by the scene's sun plus the shader above; CesiumJS's own environment lighting is switched off.
        imageBasedLighting: new ImageBasedLighting({ imageBasedLightingFactor: new Cartesian2(0, 0) }),
        environmentMapOptions: { enabled: false },
        lightColor: this.lightColor,
        shadows: ShadowMode.DISABLED,
        allowPicking: false,
        incrementallyLoadTextures: false,
        show: false,
      });
      if (this.disposed || token !== this.loadToken) {
        model.destroy();
        return;
      }
      this.model = model;
      this.world.scene.primitives.add(model);
      model.errorEvent.addEventListener((e: unknown) => console.error("[SkyReady] aircraft model error", e));
      model.readyEvent.addEventListener(() => this.onReady(model));
    } catch (err) {
      if (token !== this.loadToken) return;
      this.failed = true;
      console.error("[SkyReady] the aircraft model could not be loaded", err);
      if (spec.fg) {
        // fall back to the SkyReady trainer model rather than showing nothing
        console.warn(`[SkyReady] showing the SkyReady trainer model instead of ${spec.url}`);
        void this.load({ ...visualSpecFor("__trainer__"), id: spec.id });
      }
    }
  }

  private onReady(model: Model): void {
    if (model !== this.model) return;
    const N = TRAINER_META.nodes;
    const get = (name: string): ModelNode | undefined => {
      try {
        return model.getNode(name) ?? undefined;
      } catch {
        return undefined;
      }
    };
    this.nodes.elevator = get(N.elevator);
    this.nodes.rudder = get(N.rudder);
    this.nodes.aileronLeft = get(N.aileronLeft);
    this.nodes.aileronRight = get(N.aileronRight);
    this.nodes.flapLeft = get(N.flapLeft);
    this.nodes.flapRight = get(N.flapRight);
    this.nodes.propeller = get(N.propeller);
    this.nodes.propellerBlades = get(N.propellerBlades);
    this.discNode = get(N.propellerDisc);
    this.cabinNode = get(N.cabinExterior);
    this.cockpitNode = get(N.cockpit);
    GEAR.forEach((g, i) => (this.gearNodes[i] = get(g.node)));
    this.extraProps.length = 0;
    for (const p of this.spec.propellers.slice(1)) this.extraProps.push({ spin: get(p.spin), blades: get(p.blades), disc: get(p.disc) });
    this.gearRetractNode = this.spec.gearNode ? get("gear_retract") : undefined;
    this.crashNodes.clear();
    this.nodeBase.clear();
    this.crashTouched.clear();
    const crashMeta = (FG_MODELS as Record<string, { crash?: { parts: Record<string, { nodes: string[] } | undefined> } } | undefined>)[this.spec.id]?.crash;
    if (this.spec.fg && crashMeta) {
      for (const part of Object.values(crashMeta.parts)) {
        for (const name of part?.nodes ?? []) {
          const node = get(name);
          if (node) this.crashNodes.set(name, node);
        }
      }
    }
    this.hingeDeg.elevator = this.hingeDeg.rudder = this.hingeDeg.aileronLeft = this.hingeDeg.aileronRight = 999;
    this.hingeDeg.flapLeft = this.hingeDeg.flapRight = this.hingeDeg.propeller = this.hingeDeg.propellerBlades = 999;
    // Light positions come from the model's empty "light_*" nodes when present (glTF x,y,z = left, up, nose).
    LIGHT_DEFS.forEach((def, i) => {
      const node = get("light_" + def.key.replace(/[A-Z]/g, (c) => "_" + c.toLowerCase()));
      const m = node?.originalMatrix;
      if (m) Cartesian3.fromElements(m[14]!, m[12]!, m[13]!, this.lightLocal[i]);
    });
    this.interiorApplied = null;
    model.show = true;
    this.ready = true;
  }

  /** Cockpit view on/off: hides the outside of the cabin (it would block the view) and shows the cockpit frame instead. */
  setInterior(on: boolean): void {
    this.interior = on;
  }

  private hinge(key: HingeKey, deg: number, threshold = 0.03): void {
    const node = this.nodes[key];
    if (!node || Math.abs(deg - this.hingeDeg[key]) < threshold) return;
    this.hingeDeg[key] = deg;
    Matrix3.fromRotationX(deg * D2R, this.rot3);
    Matrix4.fromRotationTranslation(this.rot3, Cartesian3.ZERO, this.rot4);
    Matrix4.multiply(node.originalMatrix, this.rot4, this.nodeM);
    this.rememberBase(node, this.nodeM);
    node.matrix = this.nodeM;
  }

  /** The node's own (animation) matrix, kept so a broken-off piece can be moved on top of it. */
  private rememberBase(node: ModelNode, m: Matrix4): void {
    let b = this.nodeBase.get(node);
    if (!b) this.nodeBase.set(node, (b = new Matrix4()));
    Matrix4.clone(m, b);
  }

  /**
   * Crash physics: draw broken-off pieces where they are (their pose relative to the fuselage comes
   * from the crash module), hide the ones that are gone; put everything back after a new start.
   */
  private applyCrash(sim: Sim): void {
    const parts = sim.module<CrashModule>("crash")?.parts ?? null;
    if (!parts) {
      if (this.crashTouched.size) {
        for (const node of this.crashTouched) {
          node.matrix = this.nodeBase.get(node) ?? node.originalMatrix;
          node.show = true;
        }
        this.crashTouched.clear();
        this.interiorApplied = null;
      }
      return;
    }
    for (const p of parts) {
      if (!p.detached) continue;
      Matrix4.unpack(p.delta as unknown as number[], 0, this.deltaM);
      for (const name of p.nodes) {
        const node = this.crashNodes.get(name);
        if (!node) continue;
        this.crashTouched.add(node);
        if (p.hidden) {
          if (node.show) node.show = false;
          continue;
        }
        Matrix4.multiply(this.deltaM, this.nodeBase.get(node) ?? node.originalMatrix, this.crashM);
        node.matrix = this.crashM;
      }
    }
  }

  /** Turn a node about its own local +X axis (no change threshold: used for the extra propellers). */
  private spin(node: ModelNode, deg: number): void {
    Matrix3.fromRotationX(deg * D2R, this.rot3);
    Matrix4.fromRotationTranslation(this.rot3, Cartesian3.ZERO, this.rot4);
    Matrix4.multiply(node.originalMatrix, this.rot4, this.nodeM);
    this.rememberBase(node, this.nodeM);
    node.matrix = this.nodeM;
  }

  /** Call once per drawn frame, AFTER the camera has been placed. */
  update(sim: Sim, pose: RenderPose, dtReal: number): void {
    const s = sim.state;
    const world = this.world;
    this.frameNo++;
    aircraftMatrix(pose.lat, pose.lon, pose.altMslFt, pose.headingTrue, pose.pitch, pose.roll, this.bodyMatrix);
    const dtSim = clamp(s.time - this.lastSimTime, 0, 0.5);
    this.lastSimTime = s.time;
    if (!sim.paused) this.clock += Math.min(dtReal, 0.25);

    // ---- sun, sky and night
    if (Math.abs(sim.env.utcMs - this.sunAtMs) > 4000 || this.frameNo % 240 === 1) {
      this.sunAtMs = sim.env.utcMs;
      this.sunElevDeg = sunPosition(sim.env.utcMs, s.lat, s.lon).elevationDeg;
    }
    const sunElev = this.sunElevDeg;
    const day = daylight(sunElev);
    this.daylight = day;
    const night = 1 - day;
    let direct = smoothstep(-1.5, 6, sunElev) * (0.6 + 0.4 * smoothstep(0, 35, sunElev));
    // under (or inside) a thick cloud layer the sun is weak and the light is flat
    let overcast = 0;
    for (const layer of sim.env.clouds) if (layer.baseFtMsl > s.altMslFt - 200) overcast = Math.max(overcast, layer.cover === "OVC" ? 1 : layer.cover === "BKN" ? 0.6 : 0);
    overcast = Math.max(overcast, s.inCloud);
    direct *= 1 - 0.8 * overcast;
    const warm = (1 - smoothstep(1, 22, sunElev)) * (1 - overcast);
    Cartesian3.fromElements(2.5 * direct, 2.5 * direct * (1 - 0.3 * warm), 2.5 * direct * (1 - 0.62 * warm), this.lightColor);
    const amb = day * (1 + 0.35 * overcast);
    // (the constants are the night floor: starlight / moonlight, so the aircraft never goes completely black)
    Cartesian3.fromElements(0.34 * amb + 0.026, 0.39 * amb + 0.031, 0.47 * amb + 0.05, this.uSky);
    Cartesian3.fromElements(0.17 * amb + 0.011, 0.16 * amb + 0.012, 0.14 * amb + 0.018, this.uGround);
    Cartesian3.fromElements(0.16 * day + 0.006, 0.34 * day + 0.008, 0.7 * day + 0.018, this.uZenith);
    Cartesian3.fromElements((0.72 + 0.2 * warm) * day + 0.012, (0.8 - 0.1 * warm) * day + 0.014, (0.9 - 0.4 * warm) * day + 0.024, this.uHorizon);
    Cartesian3.fromElements(0.2 * day + 0.004, 0.2 * day + 0.004, 0.17 * day + 0.005, this.uEnvGround);

    // ---- electrical power and switches
    const powered = sim.module("systems") ? s.sys.busVolts > 18 : true;
    const sw = sim.controls.lights;
    const tb = this.clock % 1.25;
    const beacon = powered && sw.beacon ? (this.holdFlash ? 1 : tb < 0.18 ? Math.sin((Math.PI * tb) / 0.18) : 0) : 0;
    const ts = (this.clock + 0.4) % 1.3;
    const strobe = powered && sw.strobe ? (this.holdFlash || ts < 0.055 || (ts > 0.15 && ts < 0.205) ? 1 : 0) : 0;
    const nav = powered && sw.nav ? 1 : 0;
    const landing = powered && sw.landing ? 1 : 0;
    const taxi = powered && sw.taxi ? 1 : 0;
    const cabinGlow = powered ? clamp(sw.panel, 0, 1) * 0.03 * night : 0;
    Cartesian3.fromElements(0.82 * amb + 0.022 + cabinGlow * 1.2, 0.82 * amb + 0.024 + cabinGlow, 0.85 * amb + 0.032 + cabinGlow * 0.7, this.uCabin);

    // ---- the model
    const model = this.model;
    if (model && this.ready) {
      model.modelMatrix = this.bodyMatrix;
      if (world.scene.light instanceof SunLight) model.lightColor = this.lightColor;
      Cartesian3.normalize(Matrix4.getTranslation(this.bodyMatrix, this.v3), this.uUp);
      const sh = this.shader;
      sh.setUniform("u_upWC", this.uUp);
      sh.setUniform("u_skyAmb", this.uSky);
      sh.setUniform("u_groundAmb", this.uGround);
      sh.setUniform("u_envZenith", this.uZenith);
      sh.setUniform("u_envHorizon", this.uHorizon);
      sh.setUniform("u_envGround", this.uEnvGround);
      sh.setUniform("u_cabin", this.uCabin);
      Cartesian4.fromElements(beacon, nav, strobe, nav, this.uLightsA);
      Cartesian4.fromElements(landing, taxi, 0.12 + 0.88 * night, 0, this.uLightsB);
      // positions of the beacon and the wing-tip lights in eye coordinates (the camera has been placed already)
      const view = world.camera.viewMatrix;
      const eyeOf = (i: number, name: string) => {
        Matrix4.multiplyByPoint(this.bodyMatrix, this.lightLocal[i]!, this.v3);
        sh.setUniform(name, Matrix4.multiplyByPoint(view, this.v3, this.v3));
      };
      eyeOf(0, "u_beaconEC");
      eyeOf(1, "u_tipLeftEC");
      eyeOf(2, "u_tipRightEC");
      sh.setUniform("u_lightsA", this.uLightsA);
      sh.setUniform("u_lightsB", this.uLightsB);

      if (this.interiorApplied !== this.interior) {
        this.interiorApplied = this.interior;
        if (this.spec.fg) {
          // The FlightGear models are exteriors only: in the cockpit view the instrument panel stands in for the cockpit.
          model.show = !this.interior;
        } else {
          if (this.cabinNode) this.cabinNode.show = !this.interior;
          if (this.cockpitNode) this.cockpitNode.show = this.interior;
        }
      }
      // retractable landing gear: shown unless fully up
      if (this.gearRetractNode) {
        const down = s.gearPosNorm > 0.05;
        if (this.gearRetractNode.show !== down) this.gearRetractNode.show = down;
      }

      // control surfaces (sign conventions: see the node notes in scripts/build-aircraft.mjs)
      const sf = s.surfaces;
      this.hinge("elevator", sf.elevatorDeg);
      this.hinge("rudder", sf.rudderDeg);
      this.hinge("aileronLeft", -sf.aileronLeftDeg);
      this.hinge("aileronRight", -sf.aileronRightDeg);
      this.hinge("flapLeft", -s.flapsDeg);
      this.hinge("flapRight", -s.flapsDeg);

      // landing gear: the legs give so the tyres sit on the ground (whatever attitude the flight model rests at)
      const cgAboveGroundM = (pose.altMslFt - s.groundElevFt) * M_PER_FT;
      for (let i = 0; i < GEAR.length; i++) {
        const g = GEAR[i]!;
        const node = this.gearNodes[i];
        if (!node) continue;
        const w = Matrix4.multiplyByPointAsVector(this.bodyMatrix, Cartesian3.fromElements(g.wheel[0], g.wheel[1], g.wheel[2], this.v3), this.v3);
        const target = gearShiftM(cgAboveGroundM + Cartesian3.dot(w, this.uUp), g.hang);
        const shift = (this.gearShift[i] = Math.abs(target - this.gearShift[i]!) > 0.2 ? target : approach(this.gearShift[i]!, target, dtReal, 0.05));
        if (Math.abs(shift - this.gearApplied[i]!) > 0.0015) {
          this.gearApplied[i] = shift;
          // these nodes have no rotation of their own: glTF +Y is the aircraft's "up"
          Matrix4.fromTranslation(Cartesian3.fromElements(0, shift, 0, this.v3), this.rot4);
          Matrix4.multiply(node.originalMatrix, this.rot4, this.nodeM);
          node.matrix = this.nodeM;
        }
      }

      // propeller: real blades at low rpm, a blurred disc when it turns too fast for the eye
      // (jets and turboprops report the engine speed in percent: draw the propeller at a plausible speed)
      const rpm = sim.aircraft.engine === "piston" ? Math.max(0, s.rpm) : s.n1Pct > 5 ? 900 + s.n1Pct * 12 : 0;
      this.propAngle = (this.propAngle + rpm * 6 * dtSim) % 360;
      const blades = rpm < 700;
      const bladesNode = this.nodes.propellerBlades;
      if (bladesNode && bladesNode.show !== blades) bladesNode.show = blades;
      this.hinge("propeller", this.propAngle, 0.0001);
      // (in the FlightGear models the blades and disc hang under the spinning propeller node: only show/hide them)
      if (blades && !this.spec.fg) this.hinge("propellerBlades", this.propAngle, 0.0001);
      const disc = smoothstep(350, 900, rpm);
      if (this.discNode && this.discNode.show !== disc > 0.01) this.discNode.show = disc > 0.01;
      sh.setUniform("u_disc", disc);
      for (let i = 0; i < this.extraProps.length; i++) {
        const p = this.extraProps[i]!;
        // the other engines' propellers turn the other way round on the drawing a little out of step
        const ang = (this.propAngle + 37 * (i + 1)) % 360;
        if (p.blades && p.blades.show !== blades) p.blades.show = blades;
        if (p.disc && p.disc.show !== disc > 0.01) p.disc.show = disc > 0.01;
        if (p.spin) this.spin(p.spin, ang);
        if (p.blades && blades && !this.spec.fg) this.spin(p.blades, ang);
      }
      this.applyCrash(sim);
    }

    // ---- light glows
    const cam = world.camera.positionWC;
    const on = this.on; // same order as LIGHT_DEFS
    on[0] = beacon;
    on[1] = on[2] = on[5] = nav;
    on[3] = on[4] = strobe;
    on[6] = landing;
    on[7] = taxi;
    for (let i = 0; i < LIGHT_DEFS.length; i++) {
      const def = LIGHT_DEFS[i]!;
      const glow = this.glows[i]!;
      let a = on[i]! * (def.day + (1 - def.day) * night);
      if (a > 0.01 && this.ready) {
        const p = Matrix4.multiplyByPoint(this.bodyMatrix, this.lightLocal[i]!, this.v3);
        if (def.axis) {
          const toCam = Cartesian3.normalize(Cartesian3.subtract(cam, p, this.v3b), this.v3b);
          const axis = Matrix4.multiplyByPointAsVector(this.bodyMatrix, Cartesian3.fromElements(def.axis[0], def.axis[1], def.axis[2], this.v3c), this.v3c);
          const c = Cartesian3.dot(toCam, axis);
          a *= smoothstep(def.cos - 0.18, def.cos + 0.18, c);
          if (def.key === "landing" || def.key === "taxi") a *= 0.35 + 0.65 * smoothstep(0.5, 0.98, c);
        }
        if (a > 0.01) {
          glow.position = p;
          this.color.red = def.color[0];
          this.color.green = def.color[1];
          this.color.blue = def.color[2];
          this.color.alpha = clamp(a, 0, 1);
          glow.color = this.color;
        }
      }
      const show = a > 0.01 && this.ready;
      if (glow.show !== show) glow.show = show;
    }

    // ---- shadow on the ground under the aircraft
    const cgHeightFt = sim.aircraft.cgHeightFt;
    const aglFt = Math.max(0, pose.altMslFt - cgHeightFt - s.groundElevFt);
    const ground0 = aglFt < 320 ? world.elevation.groundFt(pose.lat, pose.lon) : null;
    const camDist = Cartesian3.distance(cam, Matrix4.getTranslation(this.bodyMatrix, this.v3));
    const lift = (0.06 + camDist * 0.0012) * FT_PER_M; // a few centimetres above the surface, more when seen from far away
    const shadowAlpha = 0.6 * (1 - smoothstep(70, 300, aglFt)) * (0.25 + 0.75 * day) * (1 - 0.5 * overcast);
    // (after a crash the aircraft-shaped shadow would show wings that are gone: none then)
    if (ground0 !== null && shadowAlpha > 0.01 && this.ready && !s.crash) {
      if (this.frameNo % 5 === 0 || aglFt < 3) this.sampleSlope(pose, ground0);
      const hM = Math.max(0, pose.altMslFt - cgHeightFt - ground0) * M_PER_FT;
      const soft = 0.1 + hM * 0.07;
      // the shadow outline is the trainer's, stretched to this aircraft's size
      const shape = Math.max(0.6, this.spec.spanM / TRAINER_META.spanM);
      const half = (6.6 + soft * 1.6) * Math.max(1, shape);
      this.shadow.place(pose.lat, pose.lon, ground0 + lift, pose.headingTrue, this.slopePitch, this.slopeRoll, half, half);
      const u = this.shadow.material.uniforms;
      u.opacity = shadowAlpha;
      u.soft = soft;
      u.shapeScale = shape;
      (u.halfSize as Cartesian2).x = half;
      (u.halfSize as Cartesian2).y = half;
      this.shadow.show = true;
    } else this.shadow.show = false;

    // ---- landing / taxi light pool on the ground ahead (night and dusk, when low)
    let poolOn = false;
    const beam = Math.max(landing, taxi * 0.6);
    if (beam > 0 && night > 0.15 && aglFt < 260 && ground0 !== null && this.ready) {
      const tilt = (landing ? 7 : 11) * D2R; // the lamps are aimed a little below the nose
      const dirBody = Cartesian3.fromElements(Math.cos(tilt), 0, -Math.sin(tilt), this.v3b);
      const dir = Matrix4.multiplyByPointAsVector(this.bodyMatrix, dirBody, this.v3b);
      const down = -Cartesian3.dot(dir, this.uUp);
      const lampHeightM = Math.max(0.3, (pose.altMslFt - ground0) * M_PER_FT + this.spec.lights.landing[2]);
      if (down > 0.02) {
        const range = lampHeightM / down;
        if (range < 170) {
          const fwd = Math.sqrt(Math.max(0, 1 - down * down)) * range;
          // direction of the beam over the ground: the aircraft heading is close enough for a patch this soft
          const p = destination(pose.lat, pose.lon, norm360(pose.headingTrue), (fwd * FT_PER_M) / FT_PER_NM);
          const g = world.elevation.groundFt(p.lat, p.lon) ?? ground0;
          const widthM = 2.2 + range * 0.13;
          const lengthM = Math.min(widthM / Math.max(0.12, down), widthM * 5);
          this.pool.place(p.lat, p.lon, g + lift, pose.headingTrue, this.slopePitch, this.slopeRoll, lengthM, widthM);
          this.pool.material.uniforms.intensity = clamp(beam * smoothstep(0.15, 0.6, night) * (1 - smoothstep(60, 170, range)) * 0.75, 0, 0.8);
          poolOn = true;
        }
      }
    }
    this.pool.show = poolOn;
  }

  /** Tilt of the ground under the aircraft, so the shadow lies flat on slopes. */
  private sampleSlope(pose: RenderPose, ground0: number): void {
    const el = this.world.elevation;
    const d = 4 / (FT_PER_NM * M_PER_FT);
    const f = destination(pose.lat, pose.lon, norm360(pose.headingTrue), d);
    const l = destination(pose.lat, pose.lon, norm360(pose.headingTrue - 90), d);
    const gf = el.groundFt(f.lat, f.lon);
    const gl = el.groundFt(l.lat, l.lon);
    this.slopePitch = gf === null ? 0 : clamp(Math.atan(((gf - ground0) * M_PER_FT) / 4) * R2D, -25, 25);
    this.slopeRoll = gl === null ? 0 : clamp(Math.atan(((gl - ground0) * M_PER_FT) / 4) * R2D, -25, 25);
  }

  dispose(): void {
    this.disposed = true;
    const prims = this.world.scene.primitives;
    if (this.model) prims.remove(this.model);
    prims.remove(this.billboards);
    this.shadow.destroy(this.world);
    this.pool.destroy(this.world);
    this.model = null;
    this.ready = false;
  }
}
