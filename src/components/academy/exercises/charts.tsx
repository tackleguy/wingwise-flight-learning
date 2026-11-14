import { useRef, useState, type MouseEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Segmented } from "../diagrams/controls";
import { pick, shuffle } from "../navmath";
import {
  ChartDisclaimer,
  Choices,
  ExerciseFrame,
  Feedback,
  Loading,
  useGenerated,
  useScore,
} from "./shared";
import { cn } from "@/lib/utils";

/* Sectional-style palette (chart paper is light, like the real thing). */
const K = {
  paper: "#eef0e4",
  blue: "#1d4ea3",
  magenta: "#a3166f",
  yellow: "#f2d64b",
  water: "#9cc7e6",
  waterLine: "#2d6fb3",
  ink: "#1f2937",
  road: "#b03a6b",
  green: "#c9dcb4",
};

function useSvgClick(onPoint: (x: number, y: number) => void) {
  const ref = useRef<SVGSVGElement>(null);
  const onClick = (e: MouseEvent<SVGSVGElement>) => {
    const svg = ref.current;
    const m = svg?.getScreenCTM();
    if (!svg || !m) return;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    onPoint(p.x, p.y);
  };
  return { ref, onClick };
}

function pointInPoly(x: number, y: number, poly: [number, number][]) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i] ?? [0, 0];
    const [xj, yj] = poly[j] ?? [0, 0];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/* ------------------------------------------------------------------------------------------ */
/* Airspace identification                                                                     */
/* ------------------------------------------------------------------------------------------ */

type Region =
  "b-sfc" | "b-30" | "b-50" | "c-sfc" | "c-12" | "d" | "e-sfc" | "e-700" | "r" | "moa" | "g";
type Cat = "B" | "C" | "D" | "E-SFC" | "E-700" | "G" | "R" | "MOA";

const B0 = { x: 150, y: 180 };
const C0 = { x: 435, y: 115 };
const D0 = { x: 470, y: 305 };
const E0 = { x: 315, y: 300 };
const RPOLY: [number, number][] = [
  [28, 318],
  [140, 318],
  [158, 388],
  [28, 388],
];
const MOAPOLY: [number, number][] = [
  [250, 18],
  [372, 18],
  [362, 70],
  [242, 64],
];

const REGIONS: Record<Region, { cat: Cat; name: string; text: string }> = {
  "b-sfc": {
    cat: "B",
    name: "the Class B surface area",
    text: "Class B surface area — solid blue line, 100/SFC: from the surface to 10,000 ft MSL. An ATC clearance is required to enter.",
  },
  "b-30": {
    cat: "B",
    name: "the Class B shelf with a 3,000-ft floor",
    text: "Class B shelf — 100/30: Class B from 3,000 to 10,000 ft MSL. Below 3,000 ft MSL here you are beneath the Class B (200-knot speed limit applies).",
  },
  "b-50": {
    cat: "B",
    name: "the Class B shelf with a 5,000-ft floor",
    text: "Class B outer shelf — 100/50: Class B from 5,000 to 10,000 ft MSL.",
  },
  "c-sfc": {
    cat: "C",
    name: "the Class C surface area",
    text: "Class C surface area — solid magenta line, 40/SFC: surface to 4,000 ft MSL. Establish two-way radio communication before entering.",
  },
  "c-12": {
    cat: "C",
    name: "the Class C outer shelf",
    text: "Class C shelf — 40/12: Class C from 1,200 to 4,000 ft MSL.",
  },
  d: {
    cat: "D",
    name: "the Class D airspace",
    text: "Class D — dashed blue line; the boxed [25] means the ceiling is 2,500 ft MSL. Two-way radio communication required.",
  },
  "e-sfc": {
    cat: "E-SFC",
    name: "the Class E surface area",
    text: "Class E surface area — dashed magenta line: controlled airspace from the surface. VFR requires 3 SM visibility and a 1,000-ft ceiling (91.155(c),(d)).",
  },
  "e-700": {
    cat: "E-700",
    name: "Class E airspace beginning at 700 ft AGL",
    text: "Inside the magenta vignette, Class E begins at 700 ft AGL (usually to protect instrument approaches). Class G lies below 700 ft AGL.",
  },
  r: {
    cat: "R",
    name: "the restricted area",
    text: "Restricted area R-4401 — blue hatched boundary. Flight within it is prohibited when active unless authorized by the controlling agency; times and altitudes are in the chart's special-use airspace table.",
  },
  moa: {
    cat: "MOA",
    name: "the Military Operations Area",
    text: "MOA — magenta hatched boundary. VFR flight is permitted, but military training is conducted; contact the controlling agency or Flight Service for status.",
  },
  g: {
    cat: "G",
    name: "Class G airspace at the surface (outside all depicted boundaries)",
    text: "Outside any depicted boundary, Class G extends from the surface to 1,200 ft AGL, with Class E above it up to 17,999 ft MSL.",
  },
};

const CAT_LABEL: Record<Cat, string> = {
  B: "Class B",
  C: "Class C",
  D: "Class D",
  "E-SFC": "Class E surface area",
  "E-700": "Class E from 700 ft AGL",
  G: "Class G (E from 1,200 AGL)",
  R: "Restricted area",
  MOA: "MOA",
};

function classify(x: number, y: number): Region {
  if (pointInPoly(x, y, RPOLY)) return "r";
  if (pointInPoly(x, y, MOAPOLY)) return "moa";
  const d = (p: { x: number; y: number }) => Math.hypot(x - p.x, y - p.y);
  const db = d(B0);
  if (db <= 45) return "b-sfc";
  if (db <= 85) return "b-30";
  if (db <= 120) return "b-50";
  const dc = d(C0);
  if (dc <= 32) return "c-sfc";
  if (dc <= 64) return "c-12";
  if (d(D0) <= 30) return "d";
  const de = d(E0);
  if (de <= 22) return "e-sfc";
  if (de <= 58) return "e-700";
  return "g";
}

function randomPointIn(region: Region): { x: number; y: number } {
  for (let k = 0; k < 2000; k++) {
    const x = 20 + Math.random() * 520;
    const y = 20 + Math.random() * 370;
    if (classify(x, y) === region) {
      // keep markers clear of boundaries for fairness
      const near = [
        [6, 0],
        [-6, 0],
        [0, 6],
        [0, -6],
      ].every(([dx, dy]) => classify(x + (dx ?? 0), y + (dy ?? 0)) === region);
      if (near) return { x, y };
    }
  }
  return { x: 520, y: 380 };
}

function AirportSymbol({
  x,
  y,
  color,
  towered,
}: {
  x: number;
  y: number;
  color: string;
  towered?: boolean;
}) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <circle r="8" fill="none" stroke={color} strokeWidth="2.5" />
      <rect x="-1.5" y="-6" width="3" height="12" fill={color} transform="rotate(30)" />
      {towered ? (
        <rect x="-1.5" y="-6" width="3" height="12" fill={color} transform="rotate(-50)" />
      ) : null}
    </g>
  );
}

function CeilingFloor({
  x,
  y,
  top,
  bottom,
  color,
}: {
  x: number;
  y: number;
  top: string;
  bottom: string;
  color: string;
}) {
  return (
    <g
      transform={`translate(${x} ${y})`}
      fontSize="10"
      fontWeight="700"
      fill={color}
      textAnchor="middle"
    >
      <text y="-2">{top}</text>
      <line x1="-11" x2="11" y1="1" y2="1" stroke={color} strokeWidth="1" />
      <text y="11">{bottom}</text>
    </g>
  );
}

function AirspaceChart({ children }: { children?: ReactNode }) {
  return (
    <>
      <defs>
        <radialGradient id="vig700" cx={E0.x} cy={E0.y} r="58" gradientUnits="userSpaceOnUse">
          <stop offset="0.62" stopColor={K.magenta} stopOpacity="0" />
          <stop offset="1" stopColor={K.magenta} stopOpacity="0.45" />
        </radialGradient>
      </defs>
      <rect width="560" height="400" fill={K.paper} />
      {/* terrain & water */}
      <path
        d="M0,240 C80,230 120,260 200,250 S300,215 360,232 S480,250 560,236 L560,400 L0,400 Z"
        fill={K.green}
        opacity="0.55"
      />
      <path
        d="M380,0 C372,60 395,110 388,170 S410,280 402,400"
        stroke={K.waterLine}
        strokeWidth="2"
        fill="none"
      />
      <ellipse
        cx="260"
        cy="150"
        rx="22"
        ry="12"
        fill={K.water}
        stroke={K.waterLine}
        strokeWidth="0.8"
      />
      {/* Mode C veil */}
      <circle cx={B0.x} cy={B0.y} r="168" fill="none" stroke={K.magenta} strokeWidth="1" />
      <text
        x={B0.x + 120}
        y={B0.y + 128}
        fill={K.magenta}
        fontSize="8"
        fontWeight="700"
        transform={`rotate(-38 ${B0.x + 120} ${B0.y + 128})`}
      >
        MODE C 30 NM
      </text>
      {/* Class B */}
      {[45, 85, 120].map((r) => (
        <circle
          key={r}
          cx={B0.x}
          cy={B0.y}
          r={r}
          fill={r === 45 ? "rgba(29,78,163,0.08)" : "none"}
          stroke={K.blue}
          strokeWidth="2.6"
        />
      ))}
      <CeilingFloor x={B0.x} y={B0.y - 22} top="100" bottom="SFC" color={K.blue} />
      <CeilingFloor x={B0.x} y={B0.y - 64} top="100" bottom="30" color={K.blue} />
      <CeilingFloor x={B0.x} y={B0.y - 101} top="100" bottom="50" color={K.blue} />
      <AirportSymbol x={B0.x} y={B0.y + 8} color={K.blue} towered />
      <text x={B0.x} y={B0.y + 28} fill={K.blue} fontSize="8" fontWeight="700" textAnchor="middle">
        METRO INTL
      </text>
      {/* Class C */}
      <circle cx={C0.x} cy={C0.y} r="64" fill="none" stroke={K.magenta} strokeWidth="2.6" />
      <circle
        cx={C0.x}
        cy={C0.y}
        r="32"
        fill="rgba(163,22,111,0.06)"
        stroke={K.magenta}
        strokeWidth="2.6"
      />
      <CeilingFloor x={C0.x} y={C0.y - 14} top="40" bottom="SFC" color={K.magenta} />
      <CeilingFloor x={C0.x + 46} y={C0.y - 36} top="40" bottom="12" color={K.magenta} />
      <AirportSymbol x={C0.x} y={C0.y + 14} color={K.blue} towered />
      {/* Class D */}
      <circle
        cx={D0.x}
        cy={D0.y}
        r="30"
        fill="none"
        stroke={K.blue}
        strokeWidth="2"
        strokeDasharray="7 4"
      />
      <rect
        x={D0.x + 10}
        y={D0.y - 30}
        width="22"
        height="14"
        fill="none"
        stroke={K.blue}
        strokeDasharray="3 2"
      />
      <text
        x={D0.x + 21}
        y={D0.y - 19.5}
        fill={K.blue}
        fontSize="10"
        fontWeight="700"
        textAnchor="middle"
      >
        25
      </text>
      <AirportSymbol x={D0.x} y={D0.y + 4} color={K.blue} />
      {/* Class E surface + 700 vignette */}
      <circle cx={E0.x} cy={E0.y} r="58" fill="url(#vig700)" />
      <circle
        cx={E0.x}
        cy={E0.y}
        r="22"
        fill="none"
        stroke={K.magenta}
        strokeWidth="2"
        strokeDasharray="7 4"
      />
      <AirportSymbol x={E0.x} y={E0.y} color={K.magenta} />
      {/* Restricted area */}
      <polygon
        points={RPOLY.map((p) => p.join(",")).join(" ")}
        fill="none"
        stroke={K.blue}
        strokeWidth="1.5"
      />
      <polygon
        points={RPOLY.map((p) => p.join(",")).join(" ")}
        fill="none"
        stroke={K.blue}
        strokeWidth="7"
        strokeDasharray="1.5 3.5"
        transform="translate(0 0)"
        opacity="0.8"
        clipPath="url(#rclip)"
      />
      <clipPath id="rclip">
        <polygon points={RPOLY.map((p) => p.join(",")).join(" ")} />
      </clipPath>
      <text x="88" y="356" fill={K.blue} fontSize="11" fontWeight="800" textAnchor="middle">
        R-4401
      </text>
      {/* MOA */}
      <clipPath id="moaclip">
        <polygon points={MOAPOLY.map((p) => p.join(",")).join(" ")} />
      </clipPath>
      <polygon
        points={MOAPOLY.map((p) => p.join(",")).join(" ")}
        fill="none"
        stroke={K.magenta}
        strokeWidth="1.5"
      />
      <polygon
        points={MOAPOLY.map((p) => p.join(",")).join(" ")}
        fill="none"
        stroke={K.magenta}
        strokeWidth="7"
        strokeDasharray="1.5 3.5"
        opacity="0.75"
        clipPath="url(#moaclip)"
      />
      <text x="306" y="48" fill={K.magenta} fontSize="10" fontWeight="800" textAnchor="middle">
        BULLSEYE MOA
      </text>
      {children}
    </>
  );
}

export function AirspaceIdentifyExercise() {
  const [mode, setMode] = useState<"identify" | "find">("identify");
  const genIdentify = () => {
    const region = pick<Region>([
      "b-sfc",
      "b-30",
      "b-50",
      "c-sfc",
      "c-12",
      "d",
      "e-sfc",
      "e-700",
      "r",
      "moa",
      "g",
      "g",
    ]);
    return { region, pt: randomPointIn(region) };
  };
  const { item, next } = useGenerated(genIdentify);
  const [target, setTarget] = useState<Region>("c-sfc");
  const [answer, setAnswer] = useState<Cat | null>(null);
  const [click, setClick] = useState<{ x: number; y: number; region: Region } | null>(null);
  const { score, record } = useScore();
  const svg = useSvgClick((x, y) => {
    if (mode !== "find" || click) return;
    const region = classify(x, y);
    setClick({ x, y, region });
    record(region === target);
  });

  const newFind = () => {
    const pool = (Object.keys(REGIONS) as Region[]).filter((r) => r !== target);
    setTarget(pick(pool));
    setClick(null);
  };

  if (!item) return <Loading />;
  const reg = REGIONS[item.region];

  return (
    <ExerciseFrame
      score={score}
      onNext={() => {
        if (mode === "identify") {
          next();
          setAnswer(null);
        } else newFind();
      }}
      nextLabel={mode === "identify" ? "New point" : "New target"}
      instructions={
        mode === "identify"
          ? "Which airspace boundary on this chart contains the marked point? Use the chart symbology: line colour, solid vs dashed, vignettes and hatching."
          : "Click inside the airspace named below."
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Segmented
          value={mode}
          onChange={(m) => {
            setMode(m);
            setAnswer(null);
            setClick(null);
          }}
          options={[
            { value: "identify", label: "Identify the point" },
            { value: "find", label: "Find the airspace" },
          ]}
        />
        <ChartDisclaimer />
      </div>
      {mode === "find" ? (
        <p className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
          Click inside <strong>{REGIONS[target].name}</strong>.
        </p>
      ) : null}
      <div className="overflow-hidden rounded-md border">
        <svg
          viewBox="0 0 560 400"
          className={cn(
            "h-auto w-full select-none",
            mode === "find" && !click && "cursor-crosshair",
          )}
          {...svg}
          role="img"
          aria-label="Educational sectional chart excerpt"
        >
          <AirspaceChart>
            {mode === "identify" ? (
              <g transform={`translate(${item.pt.x} ${item.pt.y})`}>
                <circle r="9" fill="none" stroke="#111" strokeWidth="2" />
                <circle
                  r="9"
                  fill="none"
                  stroke="#f97316"
                  strokeWidth="2"
                  className="animate-pulse"
                />
                <line x1="-14" x2="-5" stroke="#111" strokeWidth="2" />
                <line x1="5" x2="14" stroke="#111" strokeWidth="2" />
                <line y1="-14" y2="-5" stroke="#111" strokeWidth="2" />
                <line y1="5" y2="14" stroke="#111" strokeWidth="2" />
              </g>
            ) : click ? (
              <g transform={`translate(${click.x} ${click.y})`}>
                <circle
                  r="7"
                  fill={click.region === target ? "#16a34a" : "#dc2626"}
                  stroke="#fff"
                  strokeWidth="2"
                />
              </g>
            ) : null}
          </AirspaceChart>
        </svg>
      </div>
      {mode === "identify" ? (
        <>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
            {(Object.keys(CAT_LABEL) as Cat[]).map((c) => (
              <button
                key={c}
                type="button"
                disabled={answer !== null}
                onClick={() => {
                  setAnswer(c);
                  record(c === reg.cat);
                }}
                className={cn(
                  "rounded-md border px-2 py-2 text-xs font-medium transition-colors",
                  answer === null && "hover:border-primary/60 hover:bg-accent/40",
                  answer !== null && c === reg.cat && "border-ok/60 bg-ok/10 text-ok",
                  answer === c && c !== reg.cat && "border-warning/60 bg-warning/10 text-warning",
                )}
              >
                {CAT_LABEL[c]}
              </button>
            ))}
          </div>
          {answer ? <Feedback ok={answer === reg.cat}>{reg.text}</Feedback> : null}
        </>
      ) : click ? (
        <Feedback
          ok={click.region === target}
          title={
            click.region === target ? "Correct" : `That point is in ${REGIONS[click.region].name}`
          }
        >
          {REGIONS[target].text}
        </Feedback>
      ) : null}
    </ExerciseFrame>
  );
}

/* ------------------------------------------------------------------------------------------ */
/* Sectional chart symbols                                                                     */
/* ------------------------------------------------------------------------------------------ */

type Sym = {
  id: string;
  name: string;
  text: string;
  draw: () => ReactNode;
};

const runway = (color: string, angles: number[], len = 12) =>
  angles.map((a) => (
    <rect
      key={a}
      x="-1.6"
      y={-len / 2}
      width="3.2"
      height={len}
      fill={color}
      transform={`rotate(${a})`}
    />
  ));

const obstruction = (h = 22, bold = false) => (
  <g>
    <path d={`M-6,0 L0,${-h} L6,0`} fill="none" stroke={K.ink} strokeWidth={bold ? 3 : 1.8} />
    <circle cy="3" r="1.8" fill={K.ink} />
  </g>
);

const SYMBOLS: Sym[] = [
  {
    id: "towered",
    name: "Airport with a control tower, hard-surfaced runways 1,500–8,069 ft",
    text: "Blue airport symbols indicate an operating control tower. A circle around the runway layout means hard-surfaced runways of 1,500 to 8,069 ft.",
    draw: () => (
      <g>
        <circle r="13" fill="none" stroke={K.blue} strokeWidth="3" />
        {runway(K.blue, [20, 110], 16)}
      </g>
    ),
  },
  {
    id: "nontowered",
    name: "Non-towered airport, hard-surfaced runways 1,500–8,069 ft",
    text: "Magenta airport symbols are airports without an operating control tower. The runway layout inside the circle shows the runway orientation.",
    draw: () => (
      <g>
        <circle r="13" fill="none" stroke={K.magenta} strokeWidth="3" />
        {runway(K.magenta, [70], 18)}
      </g>
    ),
  },
  {
    id: "long",
    name: "Airport with runways longer than 8,069 ft (runway layout shown)",
    text: "Large airports are shown by their runway pattern outlined without a surrounding circle — blue if towered, magenta if not.",
    draw: () => (
      <g fill="none" stroke={K.blue} strokeWidth="2">
        <rect x="-3" y="-20" width="6" height="40" transform="rotate(15)" />
        <rect x="-3" y="-16" width="6" height="32" transform="rotate(-60)" />
      </g>
    ),
  },
  {
    id: "private",
    name: "Private (restricted) airport",
    text: "A circle with an R: private-use airport — use only in an emergency or with permission.",
    draw: () => (
      <g>
        <circle r="12" fill="none" stroke={K.magenta} strokeWidth="2.5" />
        <text y="5" fill={K.magenta} fontSize="15" fontWeight="800" textAnchor="middle">
          R
        </text>
      </g>
    ),
  },
  {
    id: "heliport",
    name: "Heliport",
    text: "A circle with an H marks a heliport (blue if towered).",
    draw: () => (
      <g>
        <circle r="12" fill="none" stroke={K.magenta} strokeWidth="2.5" />
        <text y="5" fill={K.magenta} fontSize="15" fontWeight="800" textAnchor="middle">
          H
        </text>
      </g>
    ),
  },
  {
    id: "seaplane",
    name: "Seaplane base",
    text: "A circle containing an anchor marks a seaplane base.",
    draw: () => (
      <g stroke={K.magenta} strokeWidth="2" fill="none">
        <circle r="12" strokeWidth="2.5" />
        <line y1="-7" y2="7" />
        <line x1="-4" x2="4" y1="-4" y2="-4" />
        <path d="M-7,2 Q0,10 7,2" />
      </g>
    ),
  },
  {
    id: "services",
    name: "Airport with fuel available and field tended (tick marks)",
    text: "Tick marks around the airport symbol mean fuel is available and the field is attended during normal working hours.",
    draw: () => (
      <g>
        <circle r="12" fill="none" stroke={K.magenta} strokeWidth="3" />
        {runway(K.magenta, [45], 16)}
        {[0, 90, 180, 270].map((a) => (
          <rect
            key={a}
            x="-1.5"
            y="-18"
            width="3"
            height="5"
            fill={K.magenta}
            transform={`rotate(${a})`}
          />
        ))}
      </g>
    ),
  },
  {
    id: "beacon",
    name: "Airport with a rotating beacon (sunset to sunrise)",
    text: "A star at the top of the airport symbol means a rotating beacon operates from sunset to sunrise.",
    draw: () => (
      <g>
        <circle r="12" fill="none" stroke={K.blue} strokeWidth="3" />
        {runway(K.blue, [90], 16)}
        <path
          d="M0,-25 L2,-19 L8,-19 L3,-15 L5,-9 L0,-13 L-5,-9 L-3,-15 L-8,-19 L-2,-19 Z"
          fill={K.blue}
        />
      </g>
    ),
  },
  {
    id: "vor",
    name: "VOR",
    text: "A hexagon with a centre dot is a VOR (VHF omnidirectional range).",
    draw: () => (
      <g fill="none" stroke={K.blue} strokeWidth="2">
        <path d="M-12,0 L-6,-10 L6,-10 L12,0 L6,10 L-6,10 Z" />
        <circle r="1.8" fill={K.blue} />
      </g>
    ),
  },
  {
    id: "vortac",
    name: "VORTAC",
    text: "A hexagon with three solid lobes is a VORTAC — a VOR co-located with military TACAN, providing DME to civil aircraft.",
    draw: () => (
      <g>
        <path
          d="M-12,0 L-6,-10 L6,-10 L12,0 L6,10 L-6,10 Z"
          fill="none"
          stroke={K.blue}
          strokeWidth="2"
        />
        <circle r="1.8" fill={K.blue} />
        {[0, 120, 240].map((a) => (
          <rect
            key={a}
            x="-6"
            y="-17"
            width="12"
            height="6"
            fill={K.blue}
            transform={`rotate(${a})`}
          />
        ))}
      </g>
    ),
  },
  {
    id: "vordme",
    name: "VOR-DME",
    text: "A hexagon inside a rectangle is a VOR-DME — VOR with distance measuring equipment.",
    draw: () => (
      <g fill="none" stroke={K.blue} strokeWidth="2">
        <rect x="-15" y="-12" width="30" height="24" />
        <path d="M-12,0 L-6,-10 L6,-10 L12,0 L6,10 L-6,10 Z" />
        <circle r="1.8" fill={K.blue} />
      </g>
    ),
  },
  {
    id: "ndb",
    name: "Non-directional beacon (NDB)",
    text: "A magenta stippled circle with a centre dot is an NDB.",
    draw: () => (
      <g fill="none" stroke={K.magenta}>
        {[6, 10, 14].map((r) => (
          <circle key={r} r={r} strokeWidth="2" strokeDasharray="1 2.6" />
        ))}
        <circle r="2.5" fill={K.magenta} stroke="none" />
      </g>
    ),
  },
  {
    id: "obst",
    name: "Obstruction below 1,000 ft AGL",
    text: "A slender inverted V with a dot is an obstruction. Two numbers nearby: top of obstruction in MSL (bold) and height AGL (in parentheses).",
    draw: () => (
      <g transform="translate(0 10)">
        {obstruction(22)}
        <text x="11" y="-14" fill={K.ink} fontSize="8" fontWeight="700">
          1249
        </text>
        <text x="11" y="-5" fill={K.ink} fontSize="8">
          (512)
        </text>
      </g>
    ),
  },
  {
    id: "obst-high",
    name: "Obstruction 1,000 ft AGL or higher",
    text: "Obstructions at or above 1,000 ft AGL use a larger, bolder symbol.",
    draw: () => (
      <g transform="translate(0 14)">
        <path d="M-9,0 L-2,-30 L2,-30 L9,0 Z" fill="none" stroke={K.ink} strokeWidth="2.6" />
        <circle cy="4" r="2" fill={K.ink} />
      </g>
    ),
  },
  {
    id: "obst-group",
    name: "Group obstruction",
    text: "Two inverted Vs side by side represent a group of obstructions; the elevation given is the highest one.",
    draw: () => (
      <g transform="translate(0 10)">
        <g transform="translate(-6 0)">{obstruction(20)}</g>
        <g transform="translate(6 0)">{obstruction(20)}</g>
      </g>
    ),
  },
  {
    id: "obst-lit",
    name: "Lighted obstruction",
    text: "Short lines radiating from the top of an obstruction symbol indicate that it is lighted.",
    draw: () => (
      <g transform="translate(0 12)">
        {obstruction(22)}
        <path d="M-6,-24 L-11,-28 M6,-24 L11,-28 M0,-26 L0,-32" stroke={K.ink} strokeWidth="1.6" />
      </g>
    ),
  },
  {
    id: "vfr-checkpoint",
    name: "Visual (VFR) checkpoint",
    text: "A magenta flag marks a visual checkpoint used by ATC and pilots for position reports, often with a name.",
    draw: () => (
      <g stroke={K.magenta} strokeWidth="2" fill={K.magenta}>
        <line x1="-6" y1="14" x2="-6" y2="-14" />
        <path d="M-6,-14 L10,-8 L-6,-2 Z" />
      </g>
    ),
  },
];

function genSymbol() {
  const s = pick(SYMBOLS);
  const others = shuffle(SYMBOLS.filter((x) => x.id !== s.id)).slice(0, 3);
  const choices = shuffle([s, ...others]);
  return {
    s,
    choices: choices.map((c) => c.name),
    answer: choices.findIndex((c) => c.id === s.id),
  };
}

export function SectionalSymbolsExercise() {
  const { item, next } = useGenerated(genSymbol);
  const [sel, setSel] = useState<number | null>(null);
  const { score, record } = useScore();
  if (!item) return <Loading />;
  return (
    <ExerciseFrame
      score={score}
      onNext={() => {
        next();
        setSel(null);
      }}
      nextLabel="Next symbol"
      instructions="Identify the sectional chart symbol."
    >
      <div className="grid gap-4 sm:grid-cols-[180px_1fr]">
        <div className="flex flex-col items-center gap-1">
          <svg
            viewBox="-40 -40 80 80"
            className="size-40 rounded-md border"
            style={{ background: K.paper }}
            role="img"
            aria-label="Chart symbol"
          >
            {item.s.draw()}
          </svg>
          <ChartDisclaimer />
        </div>
        <div className="space-y-2">
          <Choices
            choices={item.choices}
            selected={sel}
            answer={item.answer}
            revealed={sel !== null}
            onSelect={(i) => {
              setSel(i);
              record(i === item.answer);
            }}
          />
          {sel !== null ? <Feedback ok={sel === item.answer}>{item.s.text}</Feedback> : null}
        </div>
      </div>
    </ExerciseFrame>
  );
}

/* ------------------------------------------------------------------------------------------ */
/* Pilotage — match landmarks                                                                  */
/* ------------------------------------------------------------------------------------------ */

interface Landmark {
  id: string;
  x: number;
  y: number;
  r: number;
  name: string;
  seen: string;
}

const LANDMARKS: Landmark[] = [
  {
    id: "ashford",
    x: 118,
    y: 104,
    r: 30,
    name: "Ashford (town with railroad and racetrack)",
    seen: "A town with a railroad running through it and an oval racetrack on its east side.",
  },
  {
    id: "hook",
    x: 292,
    y: 96,
    r: 34,
    name: "Hook-shaped lake with dam",
    seen: "A long, hook-shaped lake with a dam across its southern end.",
  },
  {
    id: "round",
    x: 470,
    y: 296,
    r: 34,
    name: "Round lake with airport",
    seen: "A round lake with a small airport on its northern shore.",
  },
  {
    id: "tower",
    x: 342,
    y: 330,
    r: 18,
    name: "Tall lighted tower",
    seen: "A single very tall lighted tower standing on its own, south of the railroad.",
  },
  {
    id: "bellmont",
    x: 220,
    y: 268,
    r: 30,
    name: "Bellmont (highway junction)",
    seen: "A town where two highways cross, with no railroad through it.",
  },
  {
    id: "carver",
    x: 432,
    y: 132,
    r: 24,
    name: "Carver (river town)",
    seen: "A small town on the east bank of a river, next to a highway bridge.",
  },
  {
    id: "power-x",
    x: 173,
    y: 127,
    r: 15,
    name: "Power line crossing the railroad",
    seen: "A high-tension power line crossing a railroad just south-east of an oval racetrack.",
  },
  {
    id: "quarry",
    x: 82,
    y: 312,
    r: 20,
    name: "Quarry / open-pit mine",
    seen: "An open-pit quarry in open country, south-west of the nearest town.",
  },
];

function LandmarkChart({ marks }: { marks?: ReactNode }) {
  return (
    <>
      <rect width="560" height="380" fill={K.paper} />
      <path
        d="M0,220 C120,200 200,240 280,226 S430,190 560,210 L560,380 L0,380 Z"
        fill={K.green}
        opacity="0.5"
      />
      {/* river */}
      <path
        d="M402,0 C396,60 410,100 410,150 S392,260 404,380"
        stroke={K.waterLine}
        strokeWidth="3"
        fill="none"
      />
      {/* hook lake + dam */}
      <path
        d="M268,48 C300,40 322,58 314,82 C306,104 300,126 290,138 L276,138 C284,118 296,96 296,80 C296,66 284,62 270,66 Z"
        fill={K.water}
        stroke={K.waterLine}
        strokeWidth="1"
      />
      <line x1="274" y1="140" x2="292" y2="140" stroke={K.ink} strokeWidth="3" />
      {/* round lake */}
      <circle cx="470" cy="304" r="22" fill={K.water} stroke={K.waterLine} />
      <g transform="translate(470 270)">
        <circle r="6" fill="none" stroke={K.magenta} strokeWidth="2" />
        <rect x="-1.2" y="-4.5" width="2.4" height="9" fill={K.magenta} transform="rotate(90)" />
      </g>
      {/* towns */}
      <path
        d="M96,90 C110,80 136,84 142,98 C146,114 128,124 110,120 C96,116 88,102 96,90 Z"
        fill={K.yellow}
        stroke="#a58b16"
        strokeWidth="0.8"
      />
      <ellipse cx="160" cy="104" rx="10" ry="6" fill="none" stroke={K.ink} strokeWidth="1.6" />
      <path
        d="M204,256 C222,248 240,254 240,270 C238,284 220,288 206,282 C196,276 196,262 204,256 Z"
        fill={K.yellow}
        stroke="#a58b16"
        strokeWidth="0.8"
      />
      <circle cx="430" cy="132" r="10" fill={K.yellow} stroke="#a58b16" strokeWidth="0.8" />
      {/* railroad: Ashford → east */}
      <path
        d="M0,70 L80,92 L150,112 L240,170 L330,210 L560,236"
        fill="none"
        stroke={K.ink}
        strokeWidth="1.6"
      />
      <path
        d="M0,70 L80,92 L150,112 L240,170 L330,210 L560,236"
        fill="none"
        stroke={K.ink}
        strokeWidth="6"
        strokeDasharray="1 9"
      />
      {/* highways */}
      <path d="M220,0 L220,380" stroke={K.road} strokeWidth="2.2" fill="none" />
      <path d="M0,270 L560,262" stroke={K.road} strokeWidth="2.2" fill="none" />
      <path d="M560,140 L440,134 L380,130 L300,150" stroke={K.road} strokeWidth="2" fill="none" />
      <rect x="398" y="125" width="16" height="10" fill="none" stroke={K.ink} strokeWidth="1.2" />
      {/* power line */}
      <path d="M140,0 L240,380" stroke={K.ink} strokeWidth="1" fill="none" />
      {Array.from({ length: 12 }).map((_, i) => {
        const t = i / 11;
        const x = 140 + 100 * t;
        const y = 380 * t;
        return <rect key={i} x={x - 2} y={y - 2} width="4" height="4" fill={K.ink} />;
      })}
      {/* tower */}
      <g transform="translate(342 340)">
        <path d="M-6,0 L0,-24 L6,0" fill="none" stroke={K.ink} strokeWidth="2.6" />
        <path d="M-6,-26 L-11,-30 M6,-26 L11,-30 M0,-28 L0,-34" stroke={K.ink} strokeWidth="1.6" />
        <circle cy="3" r="1.8" fill={K.ink} />
        <text x="10" y="-12" fill={K.ink} fontSize="8" fontWeight="700">
          1549
        </text>
        <text x="10" y="-3" fill={K.ink} fontSize="8">
          (1012)
        </text>
      </g>
      {/* quarry */}
      <g transform="translate(82 312)" stroke={K.ink} strokeWidth="2">
        <line x1="-7" y1="-7" x2="7" y2="7" />
        <line x1="7" y1="-7" x2="-7" y2="7" />
        <line x1="-9" y1="-5" x2="-5" y2="-9" />
        <line x1="9" y1="-5" x2="5" y2="-9" />
      </g>
      {/* legend */}
      <g transform="translate(10 344)" fontSize="8" fill={K.ink}>
        <rect width="190" height="30" fill="#fff" opacity="0.75" stroke="#9ca3af" />
        <line x1="6" y1="10" x2="26" y2="10" stroke={K.ink} strokeWidth="1.6" />
        <text x="30" y="13">
          Railroad
        </text>
        <line x1="80" y1="10" x2="100" y2="10" stroke={K.road} strokeWidth="2.2" />
        <text x="104" y="13">
          Road
        </text>
        <line x1="136" y1="10" x2="156" y2="10" stroke={K.ink} strokeWidth="1" />
        <rect x="144" y="8" width="4" height="4" fill={K.ink} />
        <text x="160" y="13">
          Power
        </text>
        <text x="6" y="25">
          Yellow = towns · blue = water · N is up
        </text>
      </g>
      {marks}
    </>
  );
}

export function LandmarksExercise() {
  const { item, next } = useGenerated(() => pick(LANDMARKS));
  const [hit, setHit] = useState<{ x: number; y: number; id: string | null } | null>(null);
  const { score, record } = useScore();
  const svg = useSvgClick((x, y) => {
    if (!item || hit) return;
    let best: Landmark | null = null;
    let bestD = Infinity;
    for (const l of LANDMARKS) {
      const d = Math.hypot(l.x - x, l.y - y);
      if (d <= l.r && d < bestD) {
        best = l;
        bestD = d;
      }
    }
    setHit({ x, y, id: best?.id ?? null });
    record(best?.id === item.id);
  });
  if (!item) return <Loading />;
  const target = item;
  const clicked = hit?.id ? LANDMARKS.find((l) => l.id === hit.id) : null;

  return (
    <ExerciseFrame
      score={score}
      onNext={() => {
        next();
        setHit(null);
      }}
      nextLabel="Next landmark"
      instructions="Pilotage: compare what you see out of the window with the chart. Click the chart feature that matches the description."
    >
      <div className="rounded-md border border-cyan/30 bg-cyan/5 px-3 py-2 text-sm">
        <span className="label-caps mr-2 text-cyan">Out the window</span>
        {target.seen}
      </div>
      <div className="overflow-hidden rounded-md border">
        <svg
          viewBox="0 0 560 380"
          className={cn("h-auto w-full select-none", !hit && "cursor-crosshair")}
          {...svg}
          role="img"
          aria-label="Educational chart excerpt for pilotage"
        >
          <LandmarkChart
            marks={
              hit ? (
                <>
                  <circle
                    cx={target.x}
                    cy={target.y}
                    r={target.r}
                    fill="none"
                    stroke="#16a34a"
                    strokeWidth="2.5"
                    strokeDasharray="5 3"
                  />
                  <circle
                    cx={hit.x}
                    cy={hit.y}
                    r="6"
                    fill={hit.id === target.id ? "#16a34a" : "#dc2626"}
                    stroke="#fff"
                    strokeWidth="2"
                  />
                </>
              ) : null
            }
          />
        </svg>
      </div>
      <ChartDisclaimer />
      {hit ? (
        <Feedback
          ok={hit.id === target.id}
          title={
            hit.id === target.id
              ? "Correct"
              : hit.id === "__reveal"
                ? "Here it is"
                : clicked
                  ? `That is: ${clicked.name}`
                  : "Nothing distinctive there"
          }
        >
          The matching feature is circled in green: <strong>{target.name}</strong>. Good pilotage
          landmarks are unique combinations — a town plus a railroad, a lake with a distinctive
          shape, a road crossing a river — rather than any single common feature.
        </Feedback>
      ) : (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setHit({ x: target.x, y: target.y, id: "__reveal" });
            record(false);
          }}
        >
          Show me
        </Button>
      )}
    </ExerciseFrame>
  );
}
