/**
 * Livery painting. Fuselage and fin share one texture that is projected from the side
 * (u = z, v = y), so stripes, windows, door seams and fin artwork are authored directly in
 * aircraft side-view coordinates (metres). A second canvas carries roughness (G) and
 * metalness (B) so painted glass is glossy and reflective while paint stays satin.
 *
 * All artwork is generic and original (white + accent stripes, fictional "SR-" marks). No
 * airline liveries or manufacturer logos.
 */
import type { V3 } from "./math";

export type P2 = [number, number];

export interface LiveryBounds {
  z0: number;
  z1: number;
  y0: number;
  y1: number;
}

export interface Surface {
  rough: number;
  metal: number;
}

export const PAINT: Surface = { rough: 0.36, metal: 0.05 };
export const GLASS: Surface = { rough: 0.06, metal: 0.55 };
export const BARE_METAL: Surface = { rough: 0.32, metal: 0.85 };

export class LiveryPainter {
  readonly color: HTMLCanvasElement;
  readonly pbr: HTMLCanvasElement;
  private readonly c: CanvasRenderingContext2D;
  private readonly p: CanvasRenderingContext2D;
  readonly b: LiveryBounds;
  readonly W: number;
  readonly H: number;
  /** Pixels per metre. */
  readonly ppm: number;

  constructor(b: LiveryBounds, widthPx: number, base: string, surface: Surface = PAINT) {
    this.b = b;
    this.W = widthPx;
    this.ppm = widthPx / (b.z1 - b.z0);
    this.H = Math.max(64, Math.round((b.y1 - b.y0) * this.ppm));
    this.color = document.createElement("canvas");
    this.pbr = document.createElement("canvas");
    for (const cv of [this.color, this.pbr]) {
      cv.width = this.W;
      cv.height = this.H;
    }
    const c = this.color.getContext("2d");
    const p = this.pbr.getContext("2d");
    if (!c || !p) throw new Error("2D canvas unavailable");
    this.c = c;
    this.p = p;
    c.fillStyle = base;
    c.fillRect(0, 0, this.W, this.H);
    p.fillStyle = surfaceStyle(surface);
    p.fillRect(0, 0, this.W, this.H);
  }

  X(z: number) {
    return (z - this.b.z0) * this.ppm;
  }
  Y(y: number) {
    return (this.b.y1 - y) * this.ppm;
  }

  private trace(
    ctx: CanvasRenderingContext2D,
    pts: readonly P2[],
    smooth: boolean | number,
    close = true,
  ) {
    ctx.beginPath();
    const n = pts.length;
    if (n === 0) return;
    if (typeof smooth === "number" && smooth > 0 && close && n >= 3) {
      // polygon with corners rounded by `smooth` metres
      const r = smooth;
      const corner = (i: number) => {
        const p = pts[((i % n) + n) % n] ?? [0, 0];
        const a = pts[(((i - 1) % n) + n) % n] ?? p;
        const b = pts[(i + 1) % n] ?? p;
        const la = Math.hypot(a[0] - p[0], a[1] - p[1]) || 1;
        const lb = Math.hypot(b[0] - p[0], b[1] - p[1]) || 1;
        const ra = Math.min(r, la / 2);
        const rb = Math.min(r, lb / 2);
        return {
          p,
          i: [p[0] + ((a[0] - p[0]) * ra) / la, p[1] + ((a[1] - p[1]) * ra) / la] as P2,
          o: [p[0] + ((b[0] - p[0]) * rb) / lb, p[1] + ((b[1] - p[1]) * rb) / lb] as P2,
        };
      };
      const c0 = corner(0);
      ctx.moveTo(this.X(c0.o[0]), this.Y(c0.o[1]));
      for (let i = 1; i <= n; i++) {
        const c = corner(i);
        ctx.lineTo(this.X(c.i[0]), this.Y(c.i[1]));
        ctx.quadraticCurveTo(this.X(c.p[0]), this.Y(c.p[1]), this.X(c.o[0]), this.Y(c.o[1]));
      }
      ctx.closePath();
      return;
    }
    const P = (i: number): [number, number] => {
      const q = pts[((i % n) + n) % n] ?? [0, 0];
      return [this.X(q[0]), this.Y(q[1])];
    };
    if (!smooth || n < 3) {
      const [x0, y0] = P(0);
      ctx.moveTo(x0, y0);
      for (let i = 1; i < n; i++) {
        const [x, y] = P(i);
        ctx.lineTo(x, y);
      }
      if (close) ctx.closePath();
      return;
    }
    // quadratic B-spline through mid-points (closed or open)
    if (close) {
      const [ax, ay] = P(0);
      const [bx, by] = P(1);
      ctx.moveTo((ax + bx) / 2, (ay + by) / 2);
      for (let i = 1; i <= n; i++) {
        const [cx, cy] = P(i);
        const [dx, dy] = P(i + 1);
        ctx.quadraticCurveTo(cx, cy, (cx + dx) / 2, (cy + dy) / 2);
      }
      ctx.closePath();
    } else {
      const [x0, y0] = P(0);
      ctx.moveTo(x0, y0);
      for (let i = 1; i < n - 1; i++) {
        const [cx, cy] = P(i);
        const [dx, dy] = P(i + 1);
        const last = i === n - 2;
        ctx.quadraticCurveTo(cx, cy, last ? dx : (cx + dx) / 2, last ? dy : (cy + dy) / 2);
      }
    }
  }

  /** Filled polygon in (z, y) metres. */
  /** `smooth`: true = spline through mid-points, number = corner radius in metres. */
  fill(
    pts: readonly P2[],
    color: string,
    opts: { smooth?: boolean | number; surface?: Surface } = {},
  ) {
    this.trace(this.c, pts, opts.smooth ?? false);
    this.c.fillStyle = color;
    this.c.fill();
    if (opts.surface) {
      this.trace(this.p, pts, opts.smooth ?? false);
      this.p.fillStyle = surfaceStyle(opts.surface);
      this.p.fill();
    }
  }

  /** Stripe between an upper and a lower polyline (both ordered nose → tail). */
  band(upper: readonly P2[], lower: readonly P2[], color: string, smooth = false) {
    this.fill([...upper, ...[...lower].reverse()], color, { smooth });
  }

  rect(z0: number, y0: number, z1: number, y1: number, color: string, surface?: Surface) {
    this.fill(
      [
        [z0, y0],
        [z1, y0],
        [z1, y1],
        [z0, y1],
      ],
      color,
      surface ? { surface } : {},
    );
  }

  /** Tinted window glass with a soft sky-reflection gradient. `smooth` as in {@link fill}. */
  glass(pts: readonly P2[], smooth: boolean | number = 0.05) {
    let yMin = Infinity;
    let yMax = -Infinity;
    for (const [, y] of pts) {
      yMin = Math.min(yMin, y);
      yMax = Math.max(yMax, y);
    }
    const g = this.c.createLinearGradient(0, this.Y(yMax), 0, this.Y(yMin));
    g.addColorStop(0, "#4a5d70");
    g.addColorStop(0.45, "#1d2a37");
    g.addColorStop(1, "#0b1118");
    this.trace(this.c, pts, smooth);
    this.c.fillStyle = g;
    this.c.fill();
    this.trace(this.p, pts, smooth);
    this.p.fillStyle = surfaceStyle(GLASS);
    this.p.fill();
  }

  /** Rounded-rectangle window. */
  window(z0: number, y0: number, z1: number, y1: number, r: number) {
    this.glass(roundRect(z0, y0, z1, y1, r), false);
  }

  /** Thin line (panel seam, door outline). Width in metres. */
  line(pts: readonly P2[], widthM: number, color = "rgba(0,0,0,0.35)", closed = false) {
    this.trace(this.c, pts, false, closed);
    this.c.strokeStyle = color;
    this.c.lineWidth = Math.max(1, widthM * this.ppm);
    this.c.lineJoin = "round";
    this.c.stroke();
  }

  /** Smooth open curve stroke. */
  curve(pts: readonly P2[], widthM: number, color: string) {
    this.trace(this.c, pts, true, false);
    this.c.strokeStyle = color;
    this.c.lineWidth = Math.max(1, widthM * this.ppm);
    this.c.lineCap = "round";
    this.c.stroke();
  }

  /** Door outline with rounded corners. */
  door(z0: number, y0: number, z1: number, y1: number, r: number, widthM = 0.012) {
    this.line(roundRect(z0, y0, z1, y1, r), widthM, "rgba(20,26,34,0.45)", true);
  }
}

export function roundRect(z0: number, y0: number, z1: number, y1: number, r: number): P2[] {
  const rr = Math.min(r, (z1 - z0) / 2, (y1 - y0) / 2);
  const pts: P2[] = [];
  const corner = (cz: number, cy: number, a0: number) => {
    for (let k = 0; k <= 4; k++) {
      const a = a0 + (k / 4) * (Math.PI / 2);
      pts.push([cz + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
    }
  };
  corner(z1 - rr, y1 - rr, 0);
  corner(z0 + rr, y1 - rr, Math.PI / 2);
  corner(z0 + rr, y0 + rr, Math.PI);
  corner(z1 - rr, y0 + rr, (3 * Math.PI) / 2);
  return pts;
}

function surfaceStyle(s: Surface) {
  return `rgb(0, ${Math.round(s.rough * 255)}, ${Math.round(s.metal * 255)})`;
}

/** Small canvas with a fictional registration mark (transparent background). */
export function registrationCanvas(text: string, color: string): HTMLCanvasElement {
  const cv = document.createElement("canvas");
  const h = 64;
  const ctx0 = cv.getContext("2d");
  if (!ctx0) throw new Error("2D canvas unavailable");
  ctx0.font = `600 ${h * 0.8}px system-ui, Arial, sans-serif`;
  const w = Math.ceil(ctx0.measureText(text).width + h * 0.2);
  cv.width = w;
  cv.height = h;
  const ctx = cv.getContext("2d");
  if (!ctx) throw new Error("2D canvas unavailable");
  ctx.font = `600 ${h * 0.8}px system-ui, Arial, sans-serif`;
  ctx.fillStyle = color;
  ctx.textBaseline = "middle";
  ctx.fillText(text, h * 0.1, h * 0.54);
  return cv;
}

/** Radial glow sprite texture (white core → transparent). */
export function glowCanvas(size = 64): HTMLCanvasElement {
  const cv = document.createElement("canvas");
  cv.width = cv.height = size;
  const ctx = cv.getContext("2d");
  if (!ctx) throw new Error("2D canvas unavailable");
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.18, "rgba(255,255,255,0.85)");
  g.addColorStop(0.45, "rgba(255,255,255,0.22)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return cv;
}

/** Propeller blur disc: faint grey with a brighter band where the painted tips run. */
export function propDiscCanvas(tipColor: string, tipFrom: number): HTMLCanvasElement {
  const size = 256;
  const cv = document.createElement("canvas");
  cv.width = cv.height = size;
  const ctx = cv.getContext("2d");
  if (!ctx) throw new Error("2D canvas unavailable");
  const r = size / 2;
  const g = ctx.createRadialGradient(r, r, 0, r, r, r);
  g.addColorStop(0, "rgba(30,30,30,0.0)");
  g.addColorStop(0.2, "rgba(30,30,30,0.22)");
  g.addColorStop(Math.max(0.21, tipFrom - 0.04), "rgba(30,30,30,0.16)");
  g.addColorStop(tipFrom, tipColor);
  g.addColorStop(0.985, tipColor);
  g.addColorStop(1, "rgba(30,30,30,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(r, r, r, 0, Math.PI * 2);
  ctx.fill();
  return cv;
}

export type { V3 };
