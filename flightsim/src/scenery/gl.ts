/**
 * Thin wrappers around CesiumJS's low-level renderer (vertex buffers, shader programs, draw
 * commands). CesiumJS exports these classes but does not document or type them, so everything that
 * touches them lives in this one file. Written against CesiumJS 1.147 (the version is pinned in
 * package.json).
 *
 * Why the low-level route: the runway surface, the lights and the windsock each need their own
 * shader (markings computed per pixel, lights that change colour with the viewing direction, a
 * sock that bends in the wind) and a depth bias the public Primitive API cannot express.
 */
import * as Cesium from "cesium";
import { BoundingSphere, Cartesian2, Cartesian3, ComponentDatatype, IndexDatatype, Matrix4, PrimitiveType, type Scene } from "cesium";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;
const C = Cesium as unknown as Record<string, Any>;

/** The WebGL context wrapper of a scene (undocumented `scene.context`). */
export type GlContext = Any;
export type GlTexture = { destroy(): void; width: number; height: number } & Record<string, Any>;
export type UniformMap = Record<string, () => unknown>;

export function contextOf(scene: Scene): GlContext {
  return (scene as unknown as { context: GlContext }).context;
}

export interface AttributeSpec {
  name: string;
  components: 1 | 2 | 3 | 4;
  /** "float" (default, 4 bytes per component) or "ubyte" (normalised 0…1, 1 byte per component). */
  type?: "float" | "ubyte";
}

export interface MeshOptions {
  /** Interleaved vertex data. */
  vertices: ArrayBufferView;
  attributes: AttributeSpec[];
  indices: Uint16Array | Uint32Array;
  vertexShader: string;
  fragmentShader: string;
  uniforms: UniformMap;
  /** Model matrix (local frame → Earth-fixed). */
  modelMatrix: Matrix4;
  /** Bounding sphere in LOCAL coordinates (transformed with the model matrix for culling). */
  localCenter: Cartesian3;
  radius: number;
  /** "decal": blended over what is already drawn, depth-tested but not written. "solid": ordinary opaque geometry. "glow": additive-style light sprites. */
  mode: "decal" | "solid" | "glow";
}

const stride = (attrs: AttributeSpec[]) => attrs.reduce((n, a) => n + (a.type === "ubyte" ? a.components : a.components * 4), 0);

/** One vertex array + shader + draw command. */
export class Mesh {
  readonly command: Any;
  private readonly vertexArray: Any;
  private readonly shaderProgram: Any;
  private destroyed = false;

  constructor(context: GlContext, o: MeshOptions) {
    const vertexBuffer = C.Buffer.createVertexBuffer({ context, typedArray: o.vertices, usage: C.BufferUsage.STATIC_DRAW });
    const indexBuffer = C.Buffer.createIndexBuffer({
      context,
      typedArray: o.indices,
      usage: C.BufferUsage.STATIC_DRAW,
      indexDatatype: o.indices instanceof Uint32Array ? IndexDatatype.UNSIGNED_INT : IndexDatatype.UNSIGNED_SHORT,
    });
    const strideInBytes = stride(o.attributes);
    const attributeLocations: Record<string, number> = {};
    const attributes: Any[] = [];
    let offsetInBytes = 0;
    o.attributes.forEach((a, index) => {
      attributeLocations[a.name] = index;
      const ubyte = a.type === "ubyte";
      attributes.push({
        index,
        vertexBuffer,
        componentsPerAttribute: a.components,
        componentDatatype: ubyte ? ComponentDatatype.UNSIGNED_BYTE : ComponentDatatype.FLOAT,
        normalize: ubyte,
        offsetInBytes,
        strideInBytes,
      });
      offsetInBytes += ubyte ? a.components : a.components * 4;
    });
    this.vertexArray = new C.VertexArray({ context, attributes, indexBuffer });
    this.shaderProgram = C.ShaderProgram.fromCache({ context, vertexShaderSource: o.vertexShader, fragmentShaderSource: o.fragmentShader, attributeLocations });

    const depthTest = { enabled: true, func: C.DepthFunction.LESS_OR_EQUAL };
    const renderState =
      o.mode === "solid"
        ? C.RenderState.fromCache({ depthTest, depthMask: true, cull: { enabled: false } })
        : C.RenderState.fromCache({
            depthTest,
            depthMask: false,
            cull: { enabled: false },
            blending:
              o.mode === "decal"
                ? C.BlendingState.ALPHA_BLEND
                : {
                    // Pre-multiplied output: rgb is added, alpha says how much of the background the bright core hides.
                    enabled: true,
                    equationRgb: C.BlendEquation.ADD,
                    equationAlpha: C.BlendEquation.ADD,
                    functionSourceRgb: C.BlendFunction.ONE,
                    functionSourceAlpha: C.BlendFunction.ONE,
                    functionDestinationRgb: C.BlendFunction.ONE_MINUS_SOURCE_ALPHA,
                    functionDestinationAlpha: C.BlendFunction.ONE_MINUS_SOURCE_ALPHA,
                  },
          });

    const boundingVolume = new BoundingSphere(Matrix4.multiplyByPoint(o.modelMatrix, o.localCenter, new Cartesian3()), o.radius);
    this.command = new C.DrawCommand({
      vertexArray: this.vertexArray,
      primitiveType: PrimitiveType.TRIANGLES,
      renderState,
      shaderProgram: this.shaderProgram,
      uniformMap: o.uniforms,
      owner: this,
      // Everything is drawn in the opaque pass, after the globe: decals and light sprites blend over
      // the terrain and are then covered correctly by clouds, haze and anything translucent.
      pass: C.Pass.OPAQUE,
      modelMatrix: Matrix4.clone(o.modelMatrix),
      boundingVolume,
      cull: true,
      castShadows: false,
      receiveShadows: false,
    });
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.vertexArray.destroy();
    this.shaderProgram.destroy();
  }
}

/** A scene primitive that draws a list of meshes (added to scene.primitives). */
export class MeshLayer {
  show = true;
  private readonly meshes: Mesh[] = [];
  private destroyed = false;

  add(mesh: Mesh): void {
    this.meshes.push(mesh);
  }

  remove(mesh: Mesh): void {
    const i = this.meshes.indexOf(mesh);
    if (i >= 0) this.meshes.splice(i, 1);
  }

  get length(): number {
    return this.meshes.length;
  }

  /** Called by CesiumJS once per rendered frame. */
  update(frameState: Any): void {
    if (!this.show || !frameState.passes.render) return;
    const list = frameState.commandList;
    for (let i = 0; i < this.meshes.length; i++) list.push(this.meshes[i]!.command);
  }

  isDestroyed(): boolean {
    return this.destroyed;
  }

  destroy(): void {
    this.destroyed = true;
    this.meshes.length = 0;
  }
}

export interface TextureOptions {
  width: number;
  height: number;
  /** RGBA bytes, row 0 = v 0 (no flipping). */
  pixels: Uint8Array;
  repeat: boolean;
}

/** RGBA texture with mipmaps and anisotropic filtering (keeps fine lines stable at shallow viewing angles). */
export function createTexture(context: GlContext, o: TextureOptions): GlTexture {
  const maxAniso = Math.max(1, Math.min(16, Number(C.ContextLimits?.maximumTextureFilterAnisotropy) || 1));
  const wrap = o.repeat ? C.TextureWrap.REPEAT : C.TextureWrap.CLAMP_TO_EDGE;
  const texture = new C.Texture({
    context,
    width: o.width,
    height: o.height,
    flipY: false,
    source: { width: o.width, height: o.height, arrayBufferView: o.pixels },
    sampler: new C.Sampler({
      wrapS: wrap,
      wrapT: wrap,
      minificationFilter: C.TextureMinificationFilter.LINEAR_MIPMAP_LINEAR,
      magnificationFilter: C.TextureMagnificationFilter.LINEAR,
      maximumAnisotropy: maxAniso,
    }),
  });
  texture.generateMipmap();
  return texture as GlTexture;
}

/** Triangulate a simple polygon given as parallel x / y arrays; returns vertex indices (three per triangle). */
export function triangulate(xs: number[], ys: number[]): number[] {
  const pts: Cartesian2[] = [];
  for (let i = 0; i < xs.length; i++) pts.push(new Cartesian2(xs[i]!, ys[i]!));
  return C.PolygonPipeline.triangulate(pts) as number[];
}
