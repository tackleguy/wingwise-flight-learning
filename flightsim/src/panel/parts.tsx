/**
 * Shared drawing pieces for the panel: dial frames, tick marks, knobs, seven-segment digits.
 * All artwork is original SVG drawn in code (no image files, no fonts shipped).
 */
import { useImperativeHandle, useMemo, useRef, type CSSProperties, type ReactNode, type Ref } from "react";
import { polar } from "./geometry";
import type { InstrumentId } from "./ids";
import { useKnob, usePress } from "./interact";

/** A length in panel units as a CSS value. */
export const u = (n: number): string => `calc(var(--u) * ${n})`;
export const box = (w: number, h: number): CSSProperties => ({ width: u(w), height: u(h) });

const r2 = (v: number) => Math.round(v * 100) / 100;

/** One path containing a radial tick for every angle. */
export function tickPath(angles: readonly number[], r0: number, r1: number, cx = 100, cy = 100): string {
  let d = "";
  for (const a of angles) {
    const [x0, y0] = polar(r0, a, cx, cy);
    const [x1, y1] = polar(r1, a, cx, cy);
    d += `M${r2(x0)} ${r2(y0)}L${r2(x1)} ${r2(y1)}`;
  }
  return d;
}

export function range(from: number, to: number, step: number): number[] {
  const out: number[] = [];
  for (let v = from; v <= to + 1e-9; v += step) out.push(Math.round(v * 1000) / 1000);
  return out;
}

/** A small mutable cell used to skip DOM writes when nothing changed. */
export function useCell<T>(initial: T): { v: T } {
  return useRef({ v: initial }).current;
}

/** Rotate an element about a point, only when the angle really changed. */
export function setRot(el: Element | null, cell: { v: number }, angle: number, cx = 100, cy = 100, eps = 0.04): void {
  if (!el || Math.abs(angle - cell.v) < eps) return;
  cell.v = angle;
  el.setAttribute("transform", `rotate(${angle.toFixed(2)} ${cx} ${cy})`);
}

export function setText(el: Element | null, cell: { v: string }, text: string): void {
  if (!el || cell.v === text) return;
  cell.v = text;
  el.textContent = text;
}

export function setShown(el: SVGElement | HTMLElement | null, cell: { v: number }, shown: boolean): void {
  const n = shown ? 1 : 0;
  if (!el || cell.v === n) return;
  cell.v = n;
  el.style.display = shown ? "" : "none";
}

export function setOpacity(el: SVGElement | HTMLElement | null, cell: { v: number }, opacity: number): void {
  const o = Math.round(opacity * 50) / 50;
  if (!el || cell.v === o) return;
  cell.v = o;
  el.style.opacity = String(o);
}

/** Text centred on a point. */
export function T({ x, y, s, children, className, rot, anchor = "middle", w }: { x: number; y: number; s: number; children: ReactNode; className?: string; rot?: number; anchor?: "start" | "middle" | "end"; w?: number }) {
  return (
    <text x={r2(x)} y={r2(y)} fontSize={s} textAnchor={anchor} dominantBaseline="central" className={className} transform={rot ? `rotate(${r2(rot)} ${r2(x)} ${r2(y)})` : undefined} fontWeight={w}>
      {children}
    </text>
  );
}

/** Numbers placed around a dial, upright. */
export function DialNumbers({ items, r, s, cx = 100, cy = 100, className }: { items: readonly (readonly [number, string])[]; r: number; s: number; cx?: number; cy?: number; className?: string }) {
  return (
    <>
      {items.map(([a, label]) => {
        const [x, y] = polar(r, a, cx, cy);
        return (
          <T key={`${a}-${label}`} x={x} y={y} s={s} className={className}>
            {label}
          </T>
        );
      })}
    </>
  );
}

const SCREW_POS: readonly (readonly [number, number, number])[] = [
  [13, 13, 35],
  [187, 13, -20],
  [13, 187, 70],
  [187, 187, 10],
];

function Screw({ x, y, a, r = 4.6 }: { x: number; y: number; a: number; r?: number }) {
  return (
    <g transform={`rotate(${a} ${x} ${y})`}>
      <circle cx={x} cy={y} r={r} className="tx-screw" />
      <path d={`M${x - r * 0.7} ${y}H${x + r * 0.7}`} className="tx-screw-slot" />
    </g>
  );
}

/** A standard round instrument: 200 × 200 drawing units, face radius 90, centre (100, 100). */
export function Dial({ id, size, label, children, screws = true }: { id: InstrumentId; size: number; label: string; children: ReactNode; screws?: boolean | readonly number[] }) {
  const list = screws === true ? [0, 1, 2, 3] : screws === false ? [] : screws;
  return (
    <svg className="txp-inst" data-instrument={id} viewBox="0 0 200 200" style={box(size, size)} role="img" aria-label={label}>
      {list.map((i) => {
        const p = SCREW_POS[i]!;
        return <Screw key={i} x={p[0]} y={p[1]} a={p[2]} />;
      })}
      <circle cx="100" cy="100" r="97.5" className="tx-bezel" />
      <circle cx="100" cy="100" r="96.4" className="tx-bezel-ring" />
      <circle cx="100" cy="100" r="90.5" className="tx-face" />
      {children}
      <circle cx="100" cy="100" r="90.5" className="tx-glass" />
    </svg>
  );
}

/** A small round gauge: 100 × 100 drawing units, face radius 44, centre (50, 50). */
export function SmallDial({ id, size, label, children }: { id?: InstrumentId; size: number; label: string; children: ReactNode }) {
  return (
    <svg className="txp-inst" data-instrument={id} viewBox="0 0 100 100" style={box(size, size)} role="img" aria-label={label}>
      <circle cx="50" cy="50" r="48" className="tx-bezel" />
      <circle cx="50" cy="50" r="47.2" className="tx-bezel-ring" />
      <circle cx="50" cy="50" r="44" className="tx-face" />
      {children}
    </svg>
  );
}

/** Centre cap over the needle pivots. */
export function Hub({ cx = 100, cy = 100, r = 7 }: { cx?: number; cy?: number; r?: number }) {
  return (
    <>
      <circle cx={cx} cy={cy} r={r} className="tx-hub" />
      <circle cx={cx} cy={cy} r={r * 0.32} className="tx-hub-dot" />
    </>
  );
}

/** An invisible, generously sized hit area. */
export function Hit({ x, y, w, h, rx = 4 }: { x: number; y: number; w: number; h: number; rx?: number }) {
  return <rect x={x} y={y} width={w} height={h} rx={rx} className="tx-hit" />;
}

/**
 * A rotary knob drawn at (cx, cy). Works by drag, wheel, tap left/right half, hold, Enter / Shift+Enter.
 * The cap turns as it is operated (purely cosmetic).
 */
export function Knob({
  cx,
  cy,
  r,
  ctl,
  label,
  onStep,
  pxPerStep,
  fastGain,
  hitR,
  red,
  text,
}: {
  cx: number;
  cy: number;
  r: number;
  ctl: string;
  label: string;
  onStep: (steps: number) => void;
  pxPerStep?: number;
  fastGain?: number;
  hitR?: number;
  red?: boolean;
  text?: string;
}) {
  const cap = useRef<SVGGElement>(null);
  const turn = useRef(0);
  const props = useKnob(
    (n) => {
      turn.current = (turn.current + n * 17) % 360;
      cap.current?.setAttribute("transform", `rotate(${turn.current} ${cx} ${cy})`);
      onStep(n);
    },
    { pxPerStep, fastGain },
  );
  const ridges = useMemo(() => tickPath(range(0, 345, 30), r * 0.74, r * 0.98, cx, cy), [cx, cy, r]);
  return (
    <g {...props} data-ctl={ctl} role="button" aria-label={label} className="tx-ctl">
      <circle cx={cx} cy={cy} r={hitR ?? r + 6} className="tx-hit" />
      <circle cx={cx} cy={cy} r={r} className={red ? "tx-knob-red" : "tx-knob"} />
      <g ref={cap}>
        <path d={ridges} className="tx-knob-ridge" />
        <path d={`M${cx} ${cy - r * (text ? 0.62 : 0.28)}V${cy - r * 0.9}`} className="tx-knob-mark" />
      </g>
      {text ? (
        <T x={cx} y={cy} s={r * 0.5} className="tx-knob-text">
          {text}
        </T>
      ) : null}
    </g>
  );
}

/** A flat push button with a text label. */
export function PushButton({
  x,
  y,
  w,
  h,
  ctl,
  label,
  text,
  onPress,
  repeat,
  fontSize,
  children,
  className,
  pad,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  ctl: string;
  label: string;
  text?: string;
  onPress: (count: number, shift: boolean) => void;
  repeat?: boolean;
  fontSize?: number;
  children?: ReactNode;
  className?: string;
  /** Extra invisible touch margin around the button [sideways, up/down], drawing units. */
  pad?: readonly [number, number];
}) {
  const props = usePress(onPress, { repeat });
  return (
    <g {...props} data-ctl={ctl} role="button" aria-label={label} className={`tx-ctl tx-btn ${className ?? ""}`}>
      {pad ? <rect x={x - pad[0]} y={y - pad[1]} width={w + 2 * pad[0]} height={h + 2 * pad[1]} className="tx-hit" /> : null}
      <rect x={x} y={y} width={w} height={h} rx={Math.min(4, h / 3)} className="tx-btn-body" />
      {text ? (
        <T x={x + w / 2} y={y + h / 2 + 0.4} s={fontSize ?? h * 0.5} className="tx-btn-text">
          {text}
        </T>
      ) : null}
      {children}
    </g>
  );
}

// ---------------------------------------------------------------- seven-segment digits

const SEGMENTS: Record<string, string> = {
  "0": "abcdef",
  "1": "bc",
  "2": "abged",
  "3": "abgcd",
  "4": "fgbc",
  "5": "afgcd",
  "6": "afgedc",
  "7": "abc",
  "8": "abcdefg",
  "9": "abcdfg",
  "-": "g",
  " ": "",
};
const SEG_ORDER = "abcdefg";

export interface SegApi {
  /** Show a string of digits; "." lights the decimal point after the previous digit. */
  set(text: string): void;
}

/**
 * A row of seven-segment digits (like the gas-discharge displays of a classic NAV/COM radio).
 * `h` is the digit height; the row is drawn with its top-left corner at (x, y).
 */
export function SevenSeg({ x, y, h, count, api, className, pitch: pitchIn }: { x: number; y: number; h: number; count: number; api: Ref<SegApi>; className?: string; pitch?: number }) {
  const segs = useRef<(SVGLineElement | null)[][]>([]);
  const dots = useRef<(SVGCircleElement | null)[]>([]);
  const last = useRef("\u0000");
  const w = h * 0.54;
  const t = h * 0.13;
  const pitch = pitchIn ?? w + h * 0.3;
  useImperativeHandle(
    api,
    () => ({
      set(text: string) {
        if (text === last.current) return;
        last.current = text;
        let di = -1;
        const on: string[] = [];
        const dp: boolean[] = [];
        for (const ch of text) {
          if (ch === ".") {
            if (di >= 0) dp[di] = true;
            continue;
          }
          di++;
          on[di] = SEGMENTS[ch] ?? "";
        }
        for (let i = 0; i < count; i++) {
          const lit = on[i] ?? "";
          const row = segs.current[i];
          for (let k = 0; k < 7; k++) {
            const el = row?.[k];
            if (el) el.style.opacity = lit.includes(SEG_ORDER[k]!) ? "1" : "0.07";
          }
          const d = dots.current[i];
          if (d) d.style.opacity = dp[i] ? "1" : "0";
        }
      },
    }),
    [count],
  );
  const digits = [];
  for (let i = 0; i < count; i++) {
    const ox = x + i * pitch;
    const m = h / 2;
    const e = t * 0.75; // gap at the segment ends
    const lines: [number, number, number, number][] = [
      [ox + e, y + t / 2, ox + w - e, y + t / 2], // a
      [ox + w - t / 2, y + e, ox + w - t / 2, y + m - e * 0.6], // b
      [ox + w - t / 2, y + m + e * 0.6, ox + w - t / 2, y + h - e], // c
      [ox + e, y + h - t / 2, ox + w - e, y + h - t / 2], // d
      [ox + t / 2, y + m + e * 0.6, ox + t / 2, y + h - e], // e
      [ox + t / 2, y + e, ox + t / 2, y + m - e * 0.6], // f
      [ox + e, y + m, ox + w - e, y + m], // g
    ];
    digits.push(
      <g key={i}>
        {lines.map((l, k) => (
          <line
            key={k}
            x1={r2(l[0])}
            y1={r2(l[1])}
            x2={r2(l[2])}
            y2={r2(l[3])}
            strokeWidth={r2(t)}
            style={{ opacity: 0.07 }}
            ref={(el) => {
              (segs.current[i] ??= [])[k] = el;
            }}
          />
        ))}
        <circle
          cx={r2(ox + w + h * 0.15)}
          cy={r2(y + h - t / 2)}
          r={r2(t * 0.62)}
          style={{ opacity: 0 }}
          ref={(el) => {
            dots.current[i] = el;
          }}
        />
      </g>,
    );
  }
  return (
    <g className={`tx-seg ${className ?? ""}`} transform={`translate(${r2(x)} ${r2(y + h)}) skewX(-6) translate(${r2(-x)} ${r2(-(y + h))})`}>
      {digits}
    </g>
  );
}

/** Width of a SevenSeg row in drawing units. */
export const sevenSegWidth = (h: number, count: number) => count * (h * 0.54 + h * 0.3) - h * 0.3;
