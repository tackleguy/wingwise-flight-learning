/**
 * Classic round-dial flight instruments drawn in SVG. Each gauge renders centred at (0,0) with a
 * radius of 50 so callers can place it with <g transform="translate(x y)">.
 */
import { useId, type ReactNode } from "react";

const R = 50;
const face = "oklch(0.13 0.01 258)";
const tick = "#e2e8f0";

function Bezel({
  children,
  label,
  selected,
}: {
  children: ReactNode;
  label?: string | undefined;
  selected?: boolean | undefined;
}) {
  return (
    <g>
      <circle
        r={R + 6}
        fill="oklch(0.22 0.01 258)"
        stroke={selected ? "var(--color-cyan)" : "oklch(0.32 0.02 258)"}
        strokeWidth={selected ? 3 : 2}
      />
      <circle r={R} fill={face} />
      {children}
      {label ? (
        <text
          y={R + 18}
          textAnchor="middle"
          fill="var(--color-muted-foreground)"
          fontSize="9"
          fontWeight="600"
          letterSpacing="0.08em"
        >
          {label}
        </text>
      ) : null}
    </g>
  );
}

function polar(angleDeg: number, r: number) {
  const a = ((angleDeg - 90) * Math.PI) / 180;
  return { x: r * Math.cos(a), y: r * Math.sin(a) };
}

function arc(r: number, a0: number, a1: number) {
  const p0 = polar(a0, r);
  const p1 = polar(a1, r);
  const large = a1 - a0 > 180 ? 1 : 0;
  return `M${p0.x},${p0.y} A${r},${r} 0 ${large} 1 ${p1.x},${p1.y}`;
}

function Needle({
  angle,
  len = R - 8,
  width = 2.5,
  color = "#f8fafc",
}: {
  angle: number;
  len?: number;
  width?: number;
  color?: string;
}) {
  return (
    <g transform={`rotate(${angle})`}>
      <path d={`M${-width},6 L0,${-len} L${width},6 Z`} fill={color} />
      <circle r="3.5" fill="#94a3b8" />
    </g>
  );
}

/** Airspeed indicator, C172-style markings (40–163 KIAS). */
export function AirspeedGauge({
  kt,
  label = "AIRSPEED",
  selected,
}: {
  kt: number;
  label?: string;
  selected?: boolean;
}) {
  const ang = (v: number) => 20 + (Math.max(0, Math.min(200, v)) / 200) * 320;
  return (
    <Bezel label={label} selected={selected}>
      <path d={arc(R - 4, ang(40), ang(85))} stroke="#f8fafc" strokeWidth="4" fill="none" />
      <path d={arc(R - 9, ang(48), ang(129))} stroke="#22c55e" strokeWidth="4" fill="none" />
      <path d={arc(R - 9, ang(129), ang(163))} stroke="#eab308" strokeWidth="4" fill="none" />
      <line {...lineAt(ang(163), R - 13, R - 3)} stroke="#ef4444" strokeWidth="2.5" />
      {Array.from({ length: 21 }).map((_, i) => {
        const v = i * 10;
        const major = v % 20 === 0;
        return (
          <line
            key={v}
            {...lineAt(ang(v), major ? R - 16 : R - 13, R - 11)}
            stroke={tick}
            strokeWidth={major ? 1.4 : 0.8}
          />
        );
      })}
      {[40, 60, 80, 100, 120, 140, 160, 180].map((v) => {
        const p = polar(ang(v), R - 24);
        return (
          <text key={v} x={p.x} y={p.y + 3} fill={tick} fontSize="7.5" textAnchor="middle">
            {v}
          </text>
        );
      })}
      <text y="16" fill="#94a3b8" fontSize="6" textAnchor="middle">
        KNOTS
      </text>
      <Needle angle={ang(kt)} />
    </Bezel>
  );
}

function lineAt(angle: number, r0: number, r1: number) {
  const a = polar(angle, r0);
  const b = polar(angle, r1);
  return { x1: a.x, y1: a.y, x2: b.x, y2: b.y };
}

/** Attitude indicator. Pitch in degrees (+ nose up), bank in degrees (+ right wing down). */
export function AttitudeGauge({
  pitch,
  bank,
  label = "ATTITUDE",
  selected,
}: {
  pitch: number;
  bank: number;
  label?: string;
  selected?: boolean;
}) {
  const id = useId().replace(/:/g, "");
  const ppd = 2.2;
  return (
    <Bezel label={label} selected={selected}>
      <defs>
        <clipPath id={`ai-${id}`}>
          <circle r={R - 1} />
        </clipPath>
      </defs>
      <g clipPath={`url(#ai-${id})`}>
        <g transform={`rotate(${-bank}) translate(0 ${pitch * ppd})`}>
          <rect x="-120" y="-160" width="240" height="160" fill="#2f7fd1" />
          <rect x="-120" y="0" width="240" height="160" fill="#8b5a2b" />
          <line x1="-120" y1="0" x2="120" y2="0" stroke="#fff" strokeWidth="1.2" />
          {[-20, -10, -5, 5, 10, 20].map((p) => (
            <g key={p}>
              <line
                x1={Math.abs(p) % 10 === 0 ? -14 : -7}
                y1={-p * ppd}
                x2={Math.abs(p) % 10 === 0 ? 14 : 7}
                y2={-p * ppd}
                stroke="#fff"
                strokeWidth="1"
              />
              {Math.abs(p) % 10 === 0 ? (
                <text x="18" y={-p * ppd + 2.5} fill="#fff" fontSize="6">
                  {Math.abs(p)}
                </text>
              ) : null}
            </g>
          ))}
        </g>
      </g>
      {/* bank scale */}
      {[-60, -45, -30, -20, -10, 0, 10, 20, 30, 45, 60].map((a) => (
        <line
          key={a}
          {...lineAt(a, R - (a % 30 === 0 ? 10 : 6), R - 1)}
          stroke="#fff"
          strokeWidth={a === 0 ? 2 : 1.2}
        />
      ))}
      <g transform={`rotate(${-bank})`}>
        <path d={`M0,${-R + 11} L-4,${-R + 18} L4,${-R + 18} Z`} fill="#f59e0b" />
      </g>
      {/* miniature airplane */}
      <path
        d="M-30,0 L-10,0 L-5,5 L0,0 L5,5 L10,0 L30,0"
        fill="none"
        stroke="#f59e0b"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <circle r="2" fill="#f59e0b" />
    </Bezel>
  );
}

/** Altimeter with 100-ft and 1,000-ft hands plus a Kollsman window. */
export function AltimeterGauge({
  ft,
  setting = 29.92,
  label = "ALTIMETER",
  selected,
}: {
  ft: number;
  setting?: number;
  label?: string;
  selected?: boolean;
}) {
  const hundreds = ((ft % 1000) + 1000) % 1000;
  const thousands = ((ft % 10000) + 10000) % 10000;
  return (
    <Bezel label={label} selected={selected}>
      {Array.from({ length: 50 }).map((_, i) => (
        <line
          key={i}
          {...lineAt(i * 7.2, i % 5 === 0 ? R - 10 : R - 6, R - 2)}
          stroke={tick}
          strokeWidth={i % 5 === 0 ? 1.4 : 0.7}
        />
      ))}
      {Array.from({ length: 10 }).map((_, i) => {
        const p = polar(i * 36, R - 17);
        return (
          <text
            key={i}
            x={p.x}
            y={p.y + 3}
            fill={tick}
            fontSize="9"
            fontWeight="600"
            textAnchor="middle"
          >
            {i}
          </text>
        );
      })}
      <rect x="10" y="-4" width="26" height="9" fill="#000" stroke="#475569" strokeWidth="0.6" />
      <text x="23" y="3.2" fill={tick} fontSize="6.5" textAnchor="middle" fontFamily="monospace">
        {setting.toFixed(2)}
      </text>
      <Needle angle={(thousands / 10000) * 360} len={R - 26} width={3.5} />
      <Needle angle={(hundreds / 1000) * 360} len={R - 6} width={2} />
      <text y="22" fill="#94a3b8" fontSize="7" textAnchor="middle" fontFamily="monospace">
        {Math.round(ft).toLocaleString("en-US")}
      </text>
    </Bezel>
  );
}

/** Turn coordinator. rate in °/s (+ right), slip in ball widths (+ ball right). */
export function TurnCoordinatorGauge({
  rate,
  slip = 0,
  label = "TURN COORD.",
  selected,
}: {
  rate: number;
  slip?: number;
  label?: string;
  selected?: boolean;
}) {
  const tilt = Math.max(-35, Math.min(35, (rate / 3) * 20));
  const ball = Math.max(-1.6, Math.min(1.6, slip)) * 7;
  return (
    <Bezel label={label} selected={selected}>
      {[-20, 0, 20].map((a) => (
        <g key={a}>
          <line {...lineAt(-90 + a, R - 12, R - 3)} stroke={tick} strokeWidth="2" />
          <line {...lineAt(90 + a, R - 12, R - 3)} stroke={tick} strokeWidth="2" />
        </g>
      ))}
      <text x="-38" y="22" fill={tick} fontSize="8" fontWeight="700">
        L
      </text>
      <text x="32" y="22" fill={tick} fontSize="8" fontWeight="700">
        R
      </text>
      <text y="-28" fill="#94a3b8" fontSize="5.5" textAnchor="middle">
        2 MIN
      </text>
      <g transform={`rotate(${tilt})`}>
        <path
          d="M-34,0 L-6,0 L-3,-4 L3,-4 L6,0 L34,0 L34,3 L6,3 L3,6 L-3,6 L-6,3 L-34,3 Z"
          fill="#f8fafc"
        />
        <rect x="-1.5" y="-12" width="3" height="10" fill="#f8fafc" />
      </g>
      <path
        d="M-24,18 Q0,30 24,18"
        fill="none"
        stroke="#475569"
        strokeWidth="9"
        strokeLinecap="round"
      />
      <line x1="-5" y1="22" x2="-5" y2="30" stroke="#0f172a" strokeWidth="1" />
      <line x1="5" y1="22" x2="5" y2="30" stroke="#0f172a" strokeWidth="1" />
      <circle
        cx={ball}
        cy={24 + Math.abs(ball) * 0.12}
        r="4"
        fill="#111827"
        stroke="#e2e8f0"
        strokeWidth="0.8"
      />
    </Bezel>
  );
}

/** Heading indicator (directional gyro). */
export function HeadingGauge({
  heading,
  bug,
  label = "HEADING",
  selected,
}: {
  heading: number;
  bug?: number;
  label?: string;
  selected?: boolean;
}) {
  return (
    <Bezel label={label} selected={selected}>
      <g transform={`rotate(${-heading})`}>
        {Array.from({ length: 72 }).map((_, i) => (
          <line
            key={i}
            {...lineAt(i * 5, i % 2 === 0 ? R - 9 : R - 5, R - 1)}
            stroke={tick}
            strokeWidth={i % 6 === 0 ? 1.4 : 0.7}
          />
        ))}
        {Array.from({ length: 12 }).map((_, i) => {
          const a = i * 30;
          const p = polar(a, R - 17);
          const txt =
            a === 0 ? "N" : a === 90 ? "E" : a === 180 ? "S" : a === 270 ? "W" : String(a / 10);
          return (
            <text
              key={a}
              x={p.x}
              y={p.y + 3}
              fill={a % 90 === 0 ? "#f8fafc" : tick}
              fontSize={a % 90 === 0 ? 9 : 7.5}
              fontWeight="700"
              textAnchor="middle"
              transform={`rotate(${a} ${p.x} ${p.y})`}
            >
              {txt}
            </text>
          );
        })}
        {bug !== undefined ? (
          <path
            d={`M-4,${-R + 1} L4,${-R + 1} L4,${-R + 6} L0,${-R + 3} L-4,${-R + 6} Z`}
            fill="var(--color-cyan)"
            transform={`rotate(${bug})`}
          />
        ) : null}
      </g>
      <path d="M0,-38 L-3,-30 L3,-30 Z" fill="#f59e0b" />
      <path
        d="M0,-18 L0,16 M-14,-2 L14,-2 M-6,12 L6,12"
        stroke="#f59e0b"
        strokeWidth="2.5"
        fill="none"
      />
    </Bezel>
  );
}

/** Vertical speed indicator, ±2,000 fpm. */
export function VsiGauge({
  fpm,
  label = "VERT. SPEED",
  selected,
}: {
  fpm: number;
  label?: string;
  selected?: boolean;
}) {
  const ang = (v: number) => -90 + (Math.max(-2000, Math.min(2000, v)) / 2000) * 170;
  return (
    <Bezel label={label} selected={selected}>
      {Array.from({ length: 41 }).map((_, i) => {
        const v = -2000 + i * 100;
        const major = v % 500 === 0;
        return (
          <line
            key={v}
            {...lineAt(ang(v), major ? R - 11 : R - 6, R - 1)}
            stroke={tick}
            strokeWidth={major ? 1.4 : 0.7}
          />
        );
      })}
      {[0, 5, 10, 15, 20].map((v) => {
        const up = polar(ang(v * 100), R - 19);
        const dn = polar(ang(-v * 100), R - 19);
        return (
          <g key={v}>
            <text x={up.x} y={up.y + 3} fill={tick} fontSize="8" textAnchor="middle">
              {v}
            </text>
            {v !== 0 ? (
              <text x={dn.x} y={dn.y + 3} fill={tick} fontSize="8" textAnchor="middle">
                {v}
              </text>
            ) : null}
          </g>
        );
      })}
      <text x="8" y="-12" fill="#94a3b8" fontSize="5.5">
        UP
      </text>
      <text x="8" y="16" fill="#94a3b8" fontSize="5.5">
        DOWN
      </text>
      <text x="6" y="2" fill="#94a3b8" fontSize="5">
        100 FT/MIN
      </text>
      <Needle angle={ang(fpm)} />
    </Bezel>
  );
}

/** Magnetic-compass style card used by navigation diagrams (not a gauge). */
export function CompassRose({
  r,
  rotate = 0,
  step = 5,
}: {
  r: number;
  rotate?: number;
  step?: number;
}) {
  return (
    <g transform={`rotate(${-rotate})`}>
      <circle r={r} fill="none" stroke="#64748b" strokeWidth="1" />
      {Array.from({ length: 360 / step }).map((_, i) => {
        const a = i * step;
        const major = a % 30 === 0;
        return (
          <line
            key={a}
            {...lineAt(a, major ? r - 9 : a % 10 === 0 ? r - 6 : r - 4, r)}
            stroke={tick}
            strokeWidth={major ? 1.3 : 0.7}
          />
        );
      })}
      {Array.from({ length: 12 }).map((_, i) => {
        const a = i * 30;
        const p = polar(a, r - 17);
        const txt =
          a === 0 ? "N" : a === 90 ? "E" : a === 180 ? "S" : a === 270 ? "W" : String(a / 10);
        return (
          <text
            key={a}
            x={p.x}
            y={p.y + 3.5}
            fill={tick}
            fontSize="10"
            fontWeight="700"
            textAnchor="middle"
            transform={`rotate(${a} ${p.x} ${p.y})`}
          >
            {txt}
          </text>
        );
      })}
    </g>
  );
}

export { polar, lineAt };
