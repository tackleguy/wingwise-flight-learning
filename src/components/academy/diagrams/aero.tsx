import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { ArrowDefs, C, DiagramLayout, Readout, Segmented, SliderControl } from "./controls";

/* ------------------------------------------------------------------------------------------ */
/* Shared lift curve (representative light-airplane wing, flaps up)                            */
/* ------------------------------------------------------------------------------------------ */

export const CRITICAL_AOA = 16;

/** Representative lift coefficient vs angle of attack (degrees). */
export function liftCoefficient(aoa: number): number {
  if (aoa <= CRITICAL_AOA) return 0.095 * (aoa + 1.5);
  const peak = 0.095 * (CRITICAL_AOA + 1.5);
  return Math.max(0.75, peak - 0.11 * Math.pow(aoa - CRITICAL_AOA, 1.15));
}

/** Representative drag coefficient (parasite + induced, rising sharply after separation). */
export function dragCoefficient(aoa: number): number {
  const cl = liftCoefficient(aoa);
  const sep = aoa > CRITICAL_AOA - 2 ? 0.02 * Math.pow(aoa - (CRITICAL_AOA - 2), 1.4) : 0;
  return 0.03 + 0.055 * cl * cl + sep;
}

/** Simple airfoil outline in local coordinates, chord along +x from 0 to `c`. */
function airfoilPath(c: number, t = 0.13): string {
  const pts: [number, number][] = [];
  const N = 30;
  const yt = (x: number) => 5 * t * c * (0.2969 * Math.sqrt(x) - 0.126 * x - 0.3516 * x * x + 0.2843 * x ** 3 - 0.1015 * x ** 4);
  const camber = (x: number) => (x < 0.4 ? (0.04 / 0.16) * (0.8 * x - x * x) : (0.04 / 0.36) * (0.2 + 0.8 * x - x * x)) * c;
  for (let i = 0; i <= N; i++) {
    const x = (1 - Math.cos((Math.PI * i) / N)) / 2;
    pts.push([x * c, -(camber(x) + yt(x))]);
  }
  for (let i = N; i >= 0; i--) {
    const x = (1 - Math.cos((Math.PI * i) / N)) / 2;
    pts.push([x * c, -(camber(x) - yt(x))]);
  }
  return "M" + pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" L") + " Z";
}

/* ------------------------------------------------------------------------------------------ */
/* Four forces                                                                                 */
/* ------------------------------------------------------------------------------------------ */

const W_LB = 2400;
const T_MAX = 520;
const dragLb = (v: number) => 0.0272 * v * v + 651700 / (v * v);
const aoaForSpeed = (v: number) => -1 + 5.5 * (100 / v) ** 2;

function solveFlight(pitch: number, powerPct: number) {
  const thrust = (powerPct / 100) * T_MAX;
  const f = (v: number) => {
    const s = (thrust - dragLb(v)) / W_LB;
    const gamma = (Math.asin(Math.max(-1, Math.min(1, s))) * 180) / Math.PI;
    return aoaForSpeed(v) + gamma - pitch;
  };
  let lo = 50;
  let hi = 175;
  let stalled = false;
  if (f(lo) < 0) {
    stalled = true;
    hi = lo;
  } else if (f(hi) > 0) {
    lo = hi;
  } else {
    for (let k = 0; k < 50; k++) {
      const mid = (lo + hi) / 2;
      if (f(mid) > 0) lo = mid;
      else hi = mid;
    }
  }
  const v = (lo + hi) / 2;
  const drag = dragLb(v);
  const gammaRad = Math.asin(Math.max(-1, Math.min(1, (thrust - drag) / W_LB)));
  const aoa = stalled ? Math.max(CRITICAL_AOA + 1, pitch - (gammaRad * 180) / Math.PI) : aoaForSpeed(v);
  return { v, thrust, drag, gammaDeg: (gammaRad * 180) / Math.PI, vsFpm: v * 101.27 * Math.sin(gammaRad), aoa, stalled: stalled || aoa >= CRITICAL_AOA };
}

export function FourForcesDiagram() {
  const [power, setPower] = useState(65);
  const [pitch, setPitch] = useState(2);
  const s = useMemo(() => solveFlight(pitch, power), [pitch, power]);
  const scale = 0.11; // px per lb for T/D, separate scale for L/W
  const lw = 80;
  const cx = 200;
  const cy = 130;
  const gamma = s.gammaDeg;
  // Flight path direction (screen coords, y down)
  const fp = { x: Math.cos((gamma * Math.PI) / 180), y: -Math.sin((gamma * Math.PI) / 180) };
  const nrm = { x: fp.y, y: -fp.x }; // perpendicular, "up" relative to path
  const liftLen = lw * Math.cos((gamma * Math.PI) / 180);
  const tLen = Math.max(4, s.thrust * scale);
  const dLen = Math.max(4, s.drag * scale);
  const pitchRad = (pitch * Math.PI) / 180;
  const ax = { x: Math.cos(pitchRad), y: -Math.sin(pitchRad) };
  const trend = Math.abs(s.vsFpm) < 60 ? "Level flight — forces in balance" : s.vsFpm > 0 ? "Climbing — excess thrust" : "Descending — thrust less than drag";

  return (
    <DiagramLayout
      stage={
        <svg viewBox="0 0 400 260" className="h-auto w-full" role="img" aria-label="Four forces acting on an airplane">
          <ArrowDefs id="ff" />
          <rect width="400" height="260" fill={C.panel} />
          {/* horizon reference */}
          <line x1="0" y1={cy} x2="400" y2={cy} stroke={C.border} strokeDasharray="4 6" />
          {/* flight path */}
          <line x1={cx - fp.x * 180} y1={cy - fp.y * 180} x2={cx + fp.x * 180} y2={cy + fp.y * 180} stroke={C.magenta} strokeWidth="1" strokeDasharray="2 4" opacity="0.7" />
          {/* airplane side silhouette rotated by pitch */}
          <g transform={`translate(${cx} ${cy}) rotate(${-pitch})`}>
            <path d="M-70,-4 C-40,-12 30,-12 55,-6 L70,-2 L70,3 L55,6 C20,10 -40,8 -70,4 Z" fill="#cbd5e1" opacity="0.92" />
            <path d="M-62,-4 L-78,-30 L-66,-30 L-48,-6 Z" fill="#94a3b8" />
            <rect x="-12" y="-3" width="40" height="5" rx="2" fill="#64748b" />
            <path d="M40,-9 L52,-8 L50,-4 L36,-5 Z" fill="#0ea5e9" opacity="0.7" />
            <line x1="70" y1="-12" x2="70" y2="12" stroke="#94a3b8" strokeWidth="2" />
          </g>
          {/* Lift */}
          <line x1={cx} y1={cy} x2={cx + nrm.x * liftLen} y2={cy + nrm.y * liftLen} stroke={C.ok} strokeWidth="3" markerEnd="url(#ff-ok)" />
          <text x={cx + nrm.x * liftLen + 6} y={cy + nrm.y * liftLen} fill={C.ok} fontSize="11" fontWeight="600">LIFT</text>
          {/* Weight */}
          <line x1={cx} y1={cy} x2={cx} y2={cy + lw} stroke={C.warn} strokeWidth="3" markerEnd="url(#ff-warn)" />
          <text x={cx + 6} y={cy + lw + 4} fill={C.warn} fontSize="11" fontWeight="600">WEIGHT</text>
          {/* Thrust along longitudinal axis */}
          <line x1={cx + ax.x * 70} y1={cy + ax.y * 70} x2={cx + ax.x * (70 + tLen)} y2={cy + ax.y * (70 + tLen)} stroke={C.cyan} strokeWidth="3" markerEnd="url(#ff-cyan)" />
          <text x={cx + ax.x * (74 + tLen)} y={cy + ax.y * (74 + tLen) - 6} fill={C.cyan} fontSize="11" fontWeight="600">THRUST</text>
          {/* Drag opposite flight path */}
          <line x1={cx - fp.x * 72} y1={cy - fp.y * 72} x2={cx - fp.x * (72 + dLen)} y2={cy - fp.y * (72 + dLen)} stroke={C.caution} strokeWidth="3" markerEnd="url(#ff-caution)" />
          <text x={cx - fp.x * (76 + dLen) - 34} y={cy - fp.y * (76 + dLen) - 8} fill={C.caution} fontSize="11" fontWeight="600">DRAG</text>
          <text x="10" y="18" fill={C.muted} fontSize="10">Pitch {pitch > 0 ? "+" : ""}{pitch}° · flight path {gamma >= 0 ? "+" : ""}{gamma.toFixed(1)}° · AoA {s.aoa.toFixed(1)}°</text>
          {s.stalled ? (
            <text x="390" y="18" textAnchor="end" fill={C.warn} fontSize="11" fontWeight="700">STALL — CRITICAL AOA EXCEEDED</text>
          ) : null}
          <text x="10" y="250" fill={C.muted} fontSize="9">Simplified model of a 2,400 lb trainer — arrow lengths are to scale relative to one another.</text>
        </svg>
      }
      controls={
        <>
          <SliderControl label="Power" value={power} min={0} max={100} onChange={setPower} format={(v) => `${v}%`} />
          <SliderControl label="Pitch attitude" value={pitch} min={-6} max={16} step={0.5} onChange={setPitch} format={(v) => `${v > 0 ? "+" : ""}${v}°`} />
        </>
      }
      info={
        <>
          <div className="grid grid-cols-2 gap-2">
            <Readout label="Airspeed" value={`${Math.round(s.v)} KIAS`} />
            <Readout label="Vertical speed" value={`${s.vsFpm >= 0 ? "+" : ""}${Math.round(s.vsFpm / 10) * 10} fpm`} tone={Math.abs(s.vsFpm) < 60 ? "ok" : "cyan"} />
            <Readout label="Thrust" value={`${Math.round(s.thrust)} lb`} />
            <Readout label="Drag" value={`${Math.round(s.drag)} lb`} tone="caution" />
          </div>
          <p className={cn("text-xs font-semibold", s.stalled ? "text-warning" : "text-foreground")}>{s.stalled ? "Stalled: the pitch attitude demands more angle of attack than the wing can produce. Lower the nose." : trend}</p>
          <p className="text-xs leading-relaxed text-muted-foreground">
            In steady, unaccelerated flight lift equals weight and thrust equals drag. Add power at a constant pitch and the
            excess thrust becomes a climb; raise the pitch without adding power and the airplane trades airspeed for altitude
            until drag rises to match thrust again. Pitch primarily controls airspeed; power primarily controls altitude.
          </p>
        </>
      }
    />
  );
}

/* ------------------------------------------------------------------------------------------ */
/* Airfoil and angle of attack                                                                 */
/* ------------------------------------------------------------------------------------------ */

export function AirfoilAoaDiagram() {
  const [aoa, setAoa] = useState(5);
  const cl = liftCoefficient(aoa);
  const cd = dragCoefficient(aoa);
  const sep = Math.max(0, Math.min(1, (aoa - 12) / 6));
  const chord = 200;
  const ox = 100;
  const oy = 140;
  const rad = (aoa * Math.PI) / 180;
  // Center of pressure ~quarter chord in rotated frame
  const cp = { x: ox + chord * 0.27 * Math.cos(rad), y: oy - chord * 0.27 * -Math.sin(rad) };
  const liftLen = 55 * cl;
  const dragLen = 260 * cd;
  const streams = [-70, -48, -28, 30, 52, 74];

  return (
    <DiagramLayout
      stage={
        <svg viewBox="0 0 400 260" className="h-auto w-full" role="img" aria-label="Airfoil angle of attack">
          <ArrowDefs id="af" />
          <rect width="400" height="260" fill={C.panel} />
          {/* streamlines */}
          {streams.map((dy) => {
            const above = dy < 0;
            const bump = above ? -(12 + aoa * 1.1) * Math.exp(-Math.abs(dy) / 60) : (4 + aoa * 0.3) * Math.exp(-Math.abs(dy) / 60);
            const y = oy + dy;
            const sepHere = above && dy > -40 && sep > 0;
            const end = sepHere ? 230 - sep * 60 : 400;
            return (
              <g key={dy}>
                <path
                  d={`M0,${y} C70,${y} 90,${y + bump * 1.2 - aoa * 0.6} 160,${y + bump} S ${end - 40},${y + (sepHere ? bump : 0) + aoa * 0.9} ${end},${y + (sepHere ? bump : aoa * 0.9)}`}
                  fill="none"
                  stroke={C.primary}
                  strokeOpacity="0.55"
                  strokeWidth="1.2"
                />
              </g>
            );
          })}
          {/* separated, turbulent wake */}
          {sep > 0
            ? Array.from({ length: Math.ceil(sep * 7) }).map((_, i) => {
                const x = 180 + i * 26;
                const y = oy - 30 + Math.sin(i * 1.7) * 10 - i * 2;
                return (
                  <path
                    key={i}
                    d={`M${x},${y} a9,9 0 1,1 10,8 a6,6 0 1,0 -6,-5`}
                    fill="none"
                    stroke={C.warn}
                    strokeOpacity={0.35 + sep * 0.5}
                    strokeWidth="1.3"
                  />
                );
              })
            : null}
          {/* relative wind */}
          <g>
            <line x1="12" y1="232" x2="80" y2="232" stroke={C.cyan} strokeWidth="2" markerEnd="url(#af-cyan)" />
            <text x="12" y="250" fill={C.cyan} fontSize="10" fontWeight="600">RELATIVE WIND</text>
          </g>
          {/* airfoil */}
          <g transform={`translate(${ox} ${oy}) rotate(${-aoa})`}>
            <path d={airfoilPath(chord)} fill="#cbd5e1" />
            <line x1="-30" y1="0" x2={chord + 30} y2="0" stroke={C.caution} strokeDasharray="5 4" strokeWidth="1" />
            <text x={chord + 32} y="4" fill={C.caution} fontSize="10">chord line</text>
          </g>
          {/* AoA arc */}
          <line x1={ox - 60} y1={oy} x2={ox} y2={oy} stroke={C.cyan} strokeWidth="1" strokeDasharray="3 3" />
          <path d={`M${ox - 50},${oy} A50,50 0 0,${aoa >= 0 ? 0 : 1} ${ox - 50 * Math.cos(rad)},${oy + 50 * Math.sin(rad)}`} fill="none" stroke={C.fg} strokeWidth="1" />
          <text x={ox - 78} y={oy + (aoa >= 0 ? 16 : -6)} fill={C.fg} fontSize="11" fontWeight="600">α {aoa}°</text>
          {/* lift (perpendicular to relative wind) and drag (parallel) */}
          <line x1={cp.x} y1={cp.y} x2={cp.x} y2={cp.y - liftLen} stroke={C.ok} strokeWidth="3" markerEnd="url(#af-ok)" />
          <text x={cp.x + 6} y={cp.y - liftLen + 4} fill={C.ok} fontSize="11" fontWeight="600">LIFT</text>
          <line x1={cp.x + 10} y1={cp.y + 4} x2={cp.x + 10 + dragLen} y2={cp.y + 4} stroke={C.caution} strokeWidth="2.5" markerEnd="url(#af-caution)" />
          <text x={cp.x + 14 + dragLen} y={cp.y + 16} fill={C.caution} fontSize="10" fontWeight="600">DRAG</text>
          {aoa >= CRITICAL_AOA ? (
            <text x="390" y="20" textAnchor="end" fill={C.warn} fontSize="11" fontWeight="700">STALLED — FLOW SEPARATED</text>
          ) : aoa >= 13 ? (
            <text x="390" y="20" textAnchor="end" fill={C.caution} fontSize="11" fontWeight="700">APPROACHING CRITICAL AOA</text>
          ) : null}
        </svg>
      }
      controls={<SliderControl label="Angle of attack (α)" value={aoa} min={-4} max={22} step={0.5} onChange={setAoa} format={(v) => `${v}°`} />}
      info={
        <>
          <div className="grid grid-cols-3 gap-2">
            <Readout label="CL" value={cl.toFixed(2)} tone="ok" />
            <Readout label="CD" value={cd.toFixed(3)} tone="caution" />
            <Readout label="L/D" value={(cl / cd).toFixed(1)} />
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Angle of attack is the angle between the <span className="text-caution">chord line</span> and the{" "}
            <span className="text-cyan">relative wind</span> — not the pitch attitude. Lift acts perpendicular to the relative wind and
            grows almost linearly with α until the airflow can no longer follow the upper surface. Beyond the critical angle of
            attack (about {CRITICAL_AOA}° for this wing) the flow separates, lift drops and drag rises sharply: a stall. A wing can stall
            at any airspeed, attitude or power setting.
          </p>
        </>
      }
    />
  );
}

/* ------------------------------------------------------------------------------------------ */
/* Lift coefficient vs AoA                                                                     */
/* ------------------------------------------------------------------------------------------ */

export function StallAoaDiagram() {
  const [aoa, setAoa] = useState(8);
  const [flaps, setFlaps] = useState<"up" | "down">("up");
  const W = 400;
  const H = 260;
  const pad = { l: 44, r: 14, t: 18, b: 34 };
  const amin = -4;
  const amax = 24;
  const flapShift = flaps === "down" ? 0.45 : 0;
  const flapCrit = flaps === "down" ? CRITICAL_AOA - 2 : CRITICAL_AOA;
  const clf = (a: number) => {
    if (flaps === "up") return liftCoefficient(a);
    if (a <= flapCrit) return 0.095 * (a + 1.5) + flapShift;
    const peak = 0.095 * (flapCrit + 1.5) + flapShift;
    return Math.max(0.9, peak - 0.11 * Math.pow(a - flapCrit, 1.15));
  };
  const x = (a: number) => pad.l + ((a - amin) / (amax - amin)) * (W - pad.l - pad.r);
  const y = (c: number) => H - pad.b - ((c + 0.4) / 2.6) * (H - pad.t - pad.b);
  const pts = Array.from({ length: 113 }, (_, i) => amin + i * 0.25);
  const d = pts.map((a, i) => `${i ? "L" : "M"}${x(a).toFixed(1)},${y(clf(a)).toFixed(1)}`).join(" ");
  const dUp = pts.map((a, i) => `${i ? "L" : "M"}${x(a).toFixed(1)},${y(liftCoefficient(a)).toFixed(1)}`).join(" ");
  const cur = clf(aoa);
  const stalled = aoa > flapCrit;
  const zone = aoa > flapCrit ? "Stalled" : aoa > flapCrit - 3 ? "Stall warning range" : "Normal flight range";

  return (
    <DiagramLayout
      stage={
        <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Lift coefficient versus angle of attack">
          <rect width={W} height={H} fill={C.panel} />
          <rect x={x(flapCrit)} y={pad.t} width={x(amax) - x(flapCrit)} height={H - pad.t - pad.b} fill={C.warn} opacity="0.08" />
          <rect x={x(flapCrit - 3)} y={pad.t} width={x(flapCrit) - x(flapCrit - 3)} height={H - pad.t - pad.b} fill={C.caution} opacity="0.08" />
          {[-4, 0, 4, 8, 12, 16, 20, 24].map((a) => (
            <g key={a}>
              <line x1={x(a)} y1={pad.t} x2={x(a)} y2={H - pad.b} stroke={C.border} strokeWidth="0.6" />
              <text x={x(a)} y={H - pad.b + 13} fill={C.muted} fontSize="9" textAnchor="middle">{a}°</text>
            </g>
          ))}
          {[0, 0.5, 1, 1.5, 2].map((c) => (
            <g key={c}>
              <line x1={pad.l} y1={y(c)} x2={W - pad.r} y2={y(c)} stroke={C.border} strokeWidth="0.6" />
              <text x={pad.l - 6} y={y(c) + 3} fill={C.muted} fontSize="9" textAnchor="end">{c.toFixed(1)}</text>
            </g>
          ))}
          <text x={(W + pad.l) / 2} y={H - 4} fill={C.muted} fontSize="10" textAnchor="middle">Angle of attack</text>
          <text x="12" y={H / 2} fill={C.muted} fontSize="10" textAnchor="middle" transform={`rotate(-90 12 ${H / 2})`}>Lift coefficient CL</text>
          {flaps === "down" ? <path d={dUp} fill="none" stroke={C.muted} strokeWidth="1.2" strokeDasharray="4 3" /> : null}
          <path d={d} fill="none" stroke={C.ok} strokeWidth="2.2" />
          <line x1={x(flapCrit)} y1={pad.t} x2={x(flapCrit)} y2={H - pad.b} stroke={C.warn} strokeWidth="1.2" strokeDasharray="4 3" />
          <text x={x(flapCrit) + 4} y={pad.t + 12} fill={C.warn} fontSize="10" fontWeight="600">Critical AoA {flapCrit}°</text>
          <text x={x(flapCrit) + 4} y={pad.t + 24} fill={C.warn} fontSize="9">CL max {clf(flapCrit).toFixed(2)}</text>
          <line x1={x(aoa)} y1={y(cur)} x2={x(aoa)} y2={H - pad.b} stroke={C.cyan} strokeDasharray="2 3" />
          <circle cx={x(aoa)} cy={y(cur)} r="5" fill={stalled ? C.warn : C.cyan} stroke={C.panel} strokeWidth="2" />
        </svg>
      }
      controls={
        <>
          <SliderControl label="Angle of attack" value={aoa} min={-4} max={24} step={0.5} onChange={setAoa} format={(v) => `${v}°`} />
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Flaps</span>
            <Segmented value={flaps} onChange={setFlaps} options={[{ value: "up", label: "Up" }, { value: "down", label: "Extended" }]} />
          </div>
        </>
      }
      info={
        <>
          <div className="grid grid-cols-2 gap-2">
            <Readout label="CL" value={cur.toFixed(2)} tone={stalled ? "warning" : "ok"} />
            <Readout label="Regime" value={zone} tone={stalled ? "warning" : aoa > flapCrit - 3 ? "caution" : "ok"} />
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Lift coefficient rises steadily with angle of attack until CL max at the critical angle of attack. Past that point
            the curve falls off — that is the stall. Extending flaps raises CL max (lower stall speed) but the wing stalls at a
            slightly lower angle of attack. The stall warning horn is typically set to sound 5–10 knots before the stall.
          </p>
        </>
      }
    />
  );
}

/* ------------------------------------------------------------------------------------------ */
/* Load factor in turns                                                                        */
/* ------------------------------------------------------------------------------------------ */

export function LoadFactorDiagram() {
  const [bank, setBank] = useState(45);
  const [vs, setVs] = useState(48);
  const n = 1 / Math.cos((bank * Math.PI) / 180);
  const vsTurn = vs * Math.sqrt(n);
  const W = 400;
  const H = 260;
  const over = n > 3.8;
  // chart area (right side)
  const gx = (b: number) => 214 + (b / 80) * 170;
  const gy = (g: number) => 226 - ((g - 1) / 5) * 190;
  const curve = Array.from({ length: 81 }, (_, b) => `${b ? "L" : "M"}${gx(b).toFixed(1)},${gy(Math.min(6, 1 / Math.cos((b * Math.PI) / 180))).toFixed(1)}`).join(" ");
  const rad = (bank * Math.PI) / 180;
  const L = 34 * Math.min(n, 4);

  return (
    <DiagramLayout
      stage={
        <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Load factor versus bank angle">
          <ArrowDefs id="lf" />
          <rect width={W} height={H} fill={C.panel} />
          {/* front view aircraft */}
          <g transform={`translate(100 150)`}>
            <g transform={`rotate(${bank})`}>
              <rect x="-80" y="-3" width="160" height="6" rx="2" fill="#cbd5e1" />
              <circle r="11" fill="#94a3b8" />
              <rect x="-2" y="-30" width="4" height="22" fill="#94a3b8" />
              <line x1="0" y1="0" x2="0" y2={-L} stroke={C.ok} strokeWidth="3" markerEnd="url(#lf-ok)" />
              <text x="6" y={-L + 4} fill={C.ok} fontSize="10" fontWeight="600" transform={`rotate(${-bank} 6 ${-L + 4})`}>Total lift</text>
            </g>
            {/* components */}
            <line x1="0" y1="0" x2="0" y2={-L * Math.cos(rad)} stroke={C.cyan} strokeWidth="2" strokeDasharray="4 3" markerEnd="url(#lf-cyan)" />
            <line x1="0" y1="0" x2={L * Math.sin(rad)} y2="0" stroke={C.magenta} strokeWidth="2" strokeDasharray="4 3" markerEnd="url(#lf-magenta)" />
            <line x1="0" y1="0" x2="0" y2="34" stroke={C.warn} strokeWidth="2.5" markerEnd="url(#lf-warn)" />
            <text x="5" y="44" fill={C.warn} fontSize="10">Weight</text>
            <text x={L * Math.sin(rad) + 4} y="14" fill={C.magenta} fontSize="9">Horizontal (turns)</text>
          </g>
          <text x="12" y="20" fill={C.muted} fontSize="10">Front view — level turn, {bank}° bank</text>
          {/* chart */}
          {[1, 2, 3, 4, 5, 6].map((g) => (
            <g key={g}>
              <line x1={gx(0)} y1={gy(g)} x2={gx(80)} y2={gy(g)} stroke={C.border} strokeWidth="0.6" />
              <text x={gx(0) - 5} y={gy(g) + 3} fill={C.muted} fontSize="9" textAnchor="end">{g}G</text>
            </g>
          ))}
          {[0, 20, 40, 60, 80].map((b) => (
            <text key={b} x={gx(b)} y="240" fill={C.muted} fontSize="9" textAnchor="middle">{b}°</text>
          ))}
          <line x1={gx(0)} y1={gy(3.8)} x2={gx(80)} y2={gy(3.8)} stroke={C.warn} strokeDasharray="4 3" />
          <text x={gx(80)} y={gy(3.8) - 4} fill={C.warn} fontSize="9" textAnchor="end">+3.8 G normal-category limit</text>
          <path d={curve} fill="none" stroke={C.ok} strokeWidth="2" />
          <circle cx={gx(bank)} cy={gy(Math.min(6, n))} r="5" fill={over ? C.warn : C.cyan} stroke={C.panel} strokeWidth="2" />
          <text x={gx(40)} y="254" fill={C.muted} fontSize="10" textAnchor="middle">Bank angle</text>
        </svg>
      }
      controls={
        <>
          <SliderControl label="Bank angle" value={bank} min={0} max={80} onChange={setBank} format={(v) => `${v}°`} />
          <SliderControl label="Wings-level stall speed (Vs)" value={vs} min={40} max={80} onChange={setVs} format={(v) => `${v} KIAS`} />
        </>
      }
      info={
        <>
          <div className="grid grid-cols-2 gap-2">
            <Readout label="Load factor" value={`${n.toFixed(2)} G`} tone={over ? "warning" : "cyan"} sub="n = 1 / cos(bank)" />
            <Readout label="Stall speed" value={`${Math.round(vsTurn)} KIAS`} tone={over ? "warning" : "caution"} sub={`+${Math.round((Math.sqrt(n) - 1) * 100)}% (× √n)`} />
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            In a level turn the wing must produce enough lift to both support the weight and pull the airplane around the turn,
            so load factor increases with bank: 1.15 G at 30°, 1.41 G at 45°, 2 G at 60°. Stall speed increases with the square
            root of load factor — about 19% higher at 45° and 41% higher at 60°. Beyond about 75° a normal-category airplane
            (limit +3.8 G) cannot hold altitude without exceeding its limit load factor.
          </p>
        </>
      }
    />
  );
}
