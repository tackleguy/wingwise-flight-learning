/**
 * Chart-reading training: sectional, IFR en-route, terminal procedures & airport diagrams, and a
 * random "identify this symbol" practice mode on the educational chart.
 */
import { useMemo, useState, type KeyboardEvent } from "react";
import { CheckCircle2, Shuffle, XCircle } from "lucide-react";

import { Notice } from "@/components/app/page";
import { AirportDiagram } from "@/components/airports/airport-diagram";
import { McQuiz, type McQuestion } from "@/components/training/mc-quiz";
import { Button } from "@/components/ui/button";
import { AIRPORTS, AIRPORT_DATA_NOTICE, magneticHeading } from "@/lib/data/airports";
import { fmtHdg } from "@/lib/data/airport-utils";
import { cn } from "@/lib/utils";
import { BayChart, type Layers } from "./bay-chart";
import {
  FEATURE_LABEL,
  practiceTargets,
  type ChartFeatureKind,
  type PracticeTarget,
} from "./chart-data";

/* ------------------------------ Sectional ------------------------------ */

const SECTIONAL_QUESTIONS: McQuestion[] = [
  {
    id: "s1",
    prompt: "On a sectional chart, a thick solid blue line around a major airport marks…",
    choices: ["Class B airspace", "Class C airspace", "Class D airspace", "A restricted area"],
    answer: 0,
    explanation:
      "Class B is solid blue, Class C solid magenta, Class D dashed blue, and Class E surface areas dashed magenta.",
  },
  {
    id: "s2",
    prompt: "Inside a Class C ring you read '40 over 15' (40/15). What does it mean?",
    choices: [
      "Ceiling 4,000 ft MSL, floor 1,500 ft MSL",
      "Ceiling 4,000 ft AGL, floor 1,500 ft AGL",
      "40 nm radius, 15 nm inner ring",
      "Frequency 124.0 / 121.5",
    ],
    answer: 0,
    explanation:
      "Airspace altitudes on sectionals are in hundreds of feet MSL: top number = ceiling, bottom = floor. 'SFC' means the shelf starts at the surface.",
  },
  {
    id: "s3",
    prompt: "A Class D airport shows '[25]' in a dashed blue box. What is the '25'?",
    choices: [
      "The ceiling of the Class D airspace, 2,500 ft MSL",
      "Runway length 2,500 ft",
      "Tower frequency",
      "Pattern altitude",
    ],
    answer: 0,
    explanation:
      "A bracketed number is the Class D ceiling in hundreds of feet MSL (typically about 2,500 ft above the airport). A minus sign before it ('[-25]') means 'up to but not including'.",
  },
  {
    id: "s4",
    prompt: "In an airport data block '7 L 24 122.95', what does '24' mean?",
    choices: [
      "Longest runway is about 2,400 ft",
      "Elevation 24 ft",
      "Pilot-controlled lighting on 24 clicks",
      "Runway 24 is in use",
    ],
    answer: 0,
    explanation:
      "Format: elevation (7 ft), L = lighting in operation sunset–sunrise, longest runway in hundreds of feet (24 → 2,400 ft), then UNICOM frequency.",
  },
  {
    id: "s5",
    prompt: "An airport symbol printed in magenta (rather than blue) indicates…",
    choices: [
      "The airport has no operating control tower",
      "The airport is closed",
      "The airport is private",
      "Military field",
    ],
    answer: 0,
    explanation:
      "Blue airport symbols have a control tower; magenta symbols are non-towered (CTAF). Private airports are marked with an 'R' inside the symbol.",
  },
  {
    id: "s6",
    prompt: "An obstacle labelled '1549 (1203)' tells you…",
    choices: [
      "Top 1,549 ft MSL; 1,203 ft above ground",
      "Top 1,549 ft AGL; 1,203 ft MSL base",
      "Two obstacles at those heights",
      "Radio frequency 154.9",
    ],
    answer: 0,
    explanation:
      "Bold figure = height of the top above mean sea level; figure in parentheses = height above ground level. Obstacles over 1,000 ft AGL use a taller symbol.",
  },
  {
    id: "s7",
    prompt: "A shaded magenta vignette (fuzzy band) on a sectional marks…",
    choices: [
      "Class E airspace beginning at 700 ft AGL",
      "Class E beginning at 1,200 ft AGL",
      "A Mode C veil",
      "A TFR",
    ],
    answer: 0,
    explanation:
      "Magenta vignette: Class E floor at 700 ft AGL (usually around airports with instrument approaches). Blue vignette: Class E floor at 1,200 ft AGL bordering Class G.",
  },
  {
    id: "s8",
    prompt: "Which is true of a Military Operations Area (MOA)?",
    choices: [
      "VFR flight is permitted, but you should contact the controlling agency and use extreme caution when active",
      "Entry is prohibited at all times",
      "Entry requires an ATC clearance like Class B",
      "It only exists above FL180",
    ],
    answer: 0,
    explanation:
      "MOAs separate military training from IFR traffic. VFR pilots may enter, but should check status with FSS/controlling agency. Restricted areas, by contrast, require permission when active.",
  },
  {
    id: "s9",
    prompt: "The Maximum Elevation Figure (MEF) '3⁵' in a latitude/longitude quadrangle means…",
    choices: [
      "The highest terrain or obstacle in that quadrangle plus a buffer is 3,500 ft MSL",
      "Minimum en route altitude 3,500 ft",
      "Class E floor at 3,500 ft",
      "VOR range 35 nm",
    ],
    answer: 0,
    explanation:
      "MEFs are shown in thousands and hundreds of feet MSL. Planning above the MEF gives obstacle clearance in that quadrangle.",
  },
];

export function SectionalTraining() {
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <McQuiz questions={SECTIONAL_QUESTIONS} />
      <div className="panel h-fit p-4 text-sm">
        <p className="label-caps mb-2">Sectional legend essentials</p>
        <ul className="space-y-1.5 text-xs">
          {[
            ["bg-[oklch(0.66_0.14_250)]", "Class B — solid blue"],
            ["bg-[oklch(0.66_0.22_335)]", "Class C — solid magenta"],
            ["border-2 border-dashed border-[oklch(0.66_0.14_250)]", "Class D — dashed blue"],
            [
              "border-2 border-dashed border-[oklch(0.66_0.22_335)]",
              "Class E surface — dashed magenta",
            ],
            [
              "bg-gradient-to-r from-[oklch(0.66_0.22_335/0.5)] to-transparent",
              "Class E at 700 AGL — magenta vignette",
            ],
            [
              "bg-gradient-to-r from-[oklch(0.66_0.14_250/0.5)] to-transparent",
              "Class E at 1,200 AGL — blue vignette",
            ],
          ].map(([cls, l]) => (
            <li key={l} className="flex items-center gap-2">
              <span className={cn("inline-block h-3 w-8 shrink-0 rounded-sm", cls)} />
              {l}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-muted-foreground">
          The official legend is in the FAA Aeronautical Chart User's Guide. Explore the symbols in
          context on the <strong>Chart workspace</strong> tab and test yourself in{" "}
          <strong>Chart practice</strong>.
        </p>
      </div>
    </div>
  );
}

/* ------------------------------ IFR en-route ------------------------------ */

const ENROUTE_TERMS = {
  airway: {
    t: "Victor airway (V25)",
    d: "VOR-based airway from 1,200 ft AGL up to but not including 18,000 ft MSL, normally 4 nm either side of centerline. T-routes are low-altitude RNAV routes; Q-routes (RNAV) and J-routes (jet) are at FL180 and above.",
  },
  mea: {
    t: "MEA — Minimum En Route Altitude (6000)",
    d: "Lowest published altitude between fixes that assures acceptable navigation signal coverage and meets obstacle clearance (1,000 ft, or 2,000 ft in designated mountainous areas) for the whole segment.",
  },
  moca: {
    t: "MOCA — Minimum Obstruction Clearance Altitude (*3400)",
    d: "Marked with an asterisk. Meets obstacle clearance for the whole segment but assures navigation signal coverage only within 22 nm of the VOR (14 CFR 91.177).",
  },
  mca: {
    t: "MCA — Minimum Crossing Altitude (flag)",
    d: "Lowest altitude at which a fix must be crossed when proceeding toward a higher MEA, shown with a flag symbol and the airway/altitude/direction (e.g. V25 7000E).",
  },
  mra: {
    t: "MRA — Minimum Reception Altitude (flag R)",
    d: "Lowest altitude at which an intersection can be determined using the navaids that define it.",
  },
  cop: {
    t: "Changeover point (COP)",
    d: "Where you change from the 'from' VOR to the 'to' VOR — shown with a bent line and the distances to each navaid. If not shown, change over at the midpoint.",
  },
  maa: {
    t: "MAA — Maximum Authorized Altitude (MAA-15500)",
    d: "Highest altitude at which the airway is usable, limited by navaid signal interference.",
  },
  mileage: {
    t: "Segment distance (52)",
    d: "Distance in nautical miles between the navaids/fixes along the airway. The total between navaids may appear in a box.",
  },
};

const ENROUTE_QUESTIONS: McQuestion[] = [
  {
    id: "e1",
    prompt: "What does the MEA guarantee that the MOCA does not?",
    choices: [
      "Navigation signal coverage along the entire segment",
      "Obstacle clearance",
      "Radar coverage",
      "Communications coverage with ATC",
    ],
    answer: 0,
    explanation:
      "Both provide obstacle clearance; the MEA also guarantees navaid reception along the whole segment, while the MOCA assures it only within 22 nm of the VOR.",
  },
  {
    id: "e2",
    prompt: "Victor airways extend from 1,200 ft AGL up to…",
    choices: ["But not including 18,000 ft MSL", "14,500 ft MSL", "FL450", "10,000 ft MSL"],
    answer: 0,
    explanation:
      "Above that, the high-altitude structure (jet routes and Q-routes) begins at FL180.",
  },
  {
    id: "e3",
    prompt: "A flag symbol with 'V25 7000E' at a fix is…",
    choices: [
      "An MCA: cross the fix at or above 7,000 ft when eastbound on V25",
      "An MRA of 7,000 ft",
      "A holding pattern altitude",
      "A maximum altitude",
    ],
    answer: 0,
    explanation:
      "Minimum crossing altitudes are given for a direction of flight and apply when climbing to a higher MEA beyond the fix.",
  },
  {
    id: "e4",
    prompt:
      "Where should you change VOR frequencies on an airway segment with no changeover point shown?",
    choices: [
      "At the midpoint between the navaids",
      "At the first intersection",
      "When the CDI flags",
      "Within 22 nm of the next VOR",
    ],
    answer: 0,
    explanation:
      "AIM 5-3-6: unless a COP is charted, change over at the midpoint (or at a turn if the airway turns).",
  },
  {
    id: "e5",
    prompt: "In mountainous areas, the MEA normally provides obstacle clearance of…",
    choices: ["2,000 ft within 4 nm of the course", "1,000 ft", "500 ft", "3,000 ft"],
    answer: 0,
    explanation:
      "Non-mountainous: 1,000 ft above the highest obstacle within 4 nm; designated mountainous areas: 2,000 ft (14 CFR 91.177).",
  },
];

export function EnrouteTraining() {
  const [sel, setSel] = useState<keyof typeof ENROUTE_TERMS>("mea");
  const B = "oklch(0.66 0.14 250)";
  const hot = (k: keyof typeof ENROUTE_TERMS) => ({
    onClick: () => setSel(k),
    style: { cursor: "pointer" },
    role: "button",
    "aria-label": ENROUTE_TERMS[k].t,
    tabIndex: 0,
    onKeyDown: (e: KeyboardEvent) => (e.key === "Enter" || e.key === " ") && setSel(k),
  });
  const hl = (k: keyof typeof ENROUTE_TERMS) => (sel === k ? "var(--color-caution)" : B);
  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div
          className="avionics-screen overflow-hidden"
          style={{ background: "oklch(0.96 0.01 90)" }}
        >
          <svg
            viewBox="0 0 600 240"
            className="w-full"
            role="img"
            aria-label="Sample IFR low-altitude en-route chart segment. Click labels to learn each element."
          >
            <rect width={600} height={240} fill="oklch(0.97 0.01 90)" />
            {/* VORs */}
            {[
              { x: 70, id: "ALPHA 113.9 ALF" },
              { x: 530, id: "BRAVO 116.2 BRV" },
            ].map((v) => (
              <g key={v.x}>
                <circle cx={v.x} cy={120} r={34} fill="none" stroke={B} strokeWidth={1} />
                <polygon
                  points={Array.from(
                    { length: 6 },
                    (_, i) =>
                      `${v.x + Math.cos((i * Math.PI) / 3) * 8},${120 + Math.sin((i * Math.PI) / 3) * 8}`,
                  ).join(" ")}
                  fill="none"
                  stroke={B}
                  strokeWidth={2}
                />
                <rect x={v.x - 46} y={168} width={92} height={18} fill="white" stroke={B} />
                <text x={v.x} y={181} fontSize={10} textAnchor="middle" fill={B} fontWeight={700}>
                  {v.id}
                </text>
              </g>
            ))}
            {/* airway */}
            <line
              x1={78}
              y1={120}
              x2={522}
              y2={120}
              stroke={hl("airway")}
              strokeWidth={3}
              {...hot("airway")}
            />
            <g {...hot("airway")}>
              <rect x={150} y={128} width={34} height={16} fill="white" stroke={hl("airway")} />
              <text
                x={167}
                y={140}
                fontSize={11}
                textAnchor="middle"
                fill={hl("airway")}
                fontWeight={700}
              >
                V25
              </text>
            </g>
            {/* intersection with MRA */}
            <polygon points="300,112 308,128 292,128" fill="none" stroke={B} strokeWidth={2} />
            <text x={300} y={150} fontSize={10} textAnchor="middle" fill={B} fontWeight={700}>
              TEACH
            </text>
            <g {...hot("mra")}>
              <line x1={300} y1={112} x2={300} y2={88} stroke={hl("mra")} strokeWidth={1.5} />
              <polygon
                points="300,88 316,94 300,100"
                fill="white"
                stroke={hl("mra")}
                strokeWidth={1.5}
              />
              <text x={304} y={98} fontSize={9} fill={hl("mra")} fontWeight={700}>
                R
              </text>
              <text x={320} y={98} fontSize={9} fill={hl("mra")}>
                MRA 5500
              </text>
            </g>
            {/* MCA flag */}
            <g {...hot("mca")}>
              <line
                x1={300}
                y1={128}
                x2={300}
                y2={200}
                stroke={hl("mca")}
                strokeWidth={1}
                strokeDasharray="3 2"
              />
              <polygon
                points="300,200 316,206 300,212"
                fill="white"
                stroke={hl("mca")}
                strokeWidth={1.5}
              />
              <text x={320} y={210} fontSize={9} fill={hl("mca")} fontWeight={700}>
                V25 7000E
              </text>
            </g>
            {/* MEA & MOCA segment 1 */}
            <g {...hot("mea")}>
              <text
                x={200}
                y={112}
                fontSize={12}
                textAnchor="middle"
                fill={hl("mea")}
                fontWeight={700}
              >
                6000
              </text>
            </g>
            <g {...hot("moca")}>
              <text x={225} y={140} fontSize={11} textAnchor="middle" fill={hl("moca")}>
                *3400
              </text>
            </g>
            <g {...hot("mileage")}>
              <text x={250} y={112} fontSize={11} textAnchor="middle" fill={hl("mileage")}>
                52
              </text>
            </g>
            {/* segment 2 MEA higher */}
            <g {...hot("mea")}>
              <text
                x={420}
                y={112}
                fontSize={12}
                textAnchor="middle"
                fill={hl("mea")}
                fontWeight={700}
              >
                8000
              </text>
            </g>
            <g {...hot("maa")}>
              <text x={420} y={150} fontSize={10} textAnchor="middle" fill={hl("maa")}>
                MAA-15500
              </text>
            </g>
            {/* COP */}
            <g {...hot("cop")}>
              <polyline
                points="455,104 465,90 475,104"
                fill="none"
                stroke={hl("cop")}
                strokeWidth={1.5}
              />
              <text x={465} y={84} fontSize={9} textAnchor="middle" fill={hl("cop")}>
                30 / 22
              </text>
            </g>
            <text x={590} y={232} fontSize={9} textAnchor="end" fill="oklch(0.5 0.02 250)">
              Simplified, fictional example — click any blue element
            </text>
          </svg>
        </div>
        <div className="panel h-fit p-4">
          <p className="label-caps mb-1">{ENROUTE_TERMS[sel].t}</p>
          <p className="text-sm">{ENROUTE_TERMS[sel].d}</p>
          <div className="mt-3 flex flex-wrap gap-1">
            {(Object.keys(ENROUTE_TERMS) as (keyof typeof ENROUTE_TERMS)[]).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setSel(k)}
                className={cn(
                  "rounded border px-2 py-0.5 text-[11px]",
                  sel === k
                    ? "border-caution/60 text-caution"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {ENROUTE_TERMS[k].t.split(" —")[0]?.split(" (")[0]}
              </button>
            ))}
          </div>
        </div>
      </div>
      <McQuiz questions={ENROUTE_QUESTIONS} />
    </div>
  );
}

/* ------------------------------ Terminal procedures ------------------------------ */

const PLATE_PARTS: Record<string, { t: string; d: string }> = {
  margin: {
    t: "Margin identification",
    d: "Procedure name (e.g. ILS or LOC RWY 28R), airport, city, procedure amendment number and effective date. The name tells you the navaid required for the final approach and the runway.",
  },
  brief: {
    t: "Pilot briefing strip",
    d: "Navaid frequency and identifier, final approach course, glideslope/FAF altitude, touchdown/airport elevation, approach lighting, the full missed approach instructions and communication frequencies (ATIS, approach, tower, ground).",
  },
  plan: {
    t: "Plan view",
    d: "Overhead view: initial approach fixes (IAF), feeder routes with altitudes and courses, holding patterns, procedure turns, minimum safe/sector altitudes (MSA circle), and terrain/obstacles.",
  },
  profile: {
    t: "Profile view",
    d: "Side view of the descent: FAF (Maltese cross for non-precision) or glideslope intercept (lightning bolt for precision), step-down fixes and altitudes, visual descent point (VDP) and the missed-approach icons.",
  },
  mins: {
    t: "Landing minimums",
    d: "Decision Altitude (DA) for precision/APV approaches or Minimum Descent Altitude (MDA) for non-precision, with visibility/RVR, by aircraft approach category (A–E, based on 1.3 × Vso at max landing weight). Circling minimums are separate.",
  },
  sketch: {
    t: "Airport sketch",
    d: "Runway layout, lengths and widths, approach lighting systems, touchdown zone elevation, and the time/distance table from FAF to MAP for non-precision approaches.",
  },
};

const TERMINAL_QUESTIONS: McQuestion[] = [
  {
    id: "t1",
    prompt: "On the profile view, a Maltese cross marks…",
    choices: [
      "The final approach fix of a non-precision approach",
      "The missed approach point",
      "The initial approach fix",
      "The visual descent point",
    ],
    answer: 0,
    explanation:
      "Precision approaches show glideslope intercept with a lightning bolt; the FAF for those is the glideslope intercept point.",
  },
  {
    id: "t2",
    prompt: "Your aircraft's Vso is 48 KIAS. Which approach category applies?",
    choices: ["A (below 91 kt)", "B (91–120 kt)", "C (121–140 kt)", "D"],
    answer: 0,
    explanation:
      "Category is based on 1.3 × Vso at maximum landing weight: 1.3 × 48 ≈ 62 kt → Category A (less than 91 kt).",
  },
  {
    id: "t3",
    prompt: "'DA 213' on an ILS approach means…",
    choices: [
      "Decision altitude 213 ft MSL — begin a missed approach there unless the required visual references are in sight",
      "Descend to 213 ft AGL and level off",
      "Descend below 213 ft only if cleared",
      "Minimum safe altitude 2,130 ft",
    ],
    answer: 0,
    explanation:
      "DA is MSL on precision/APV approaches; you may not continue below it without the 14 CFR 91.175(c) visual references. HAT (height above touchdown) is given alongside.",
  },
  {
    id: "t4",
    prompt: "The Minimum Safe Altitude (MSA) circle on an approach plate provides…",
    choices: [
      "1,000 ft obstacle clearance within 25 nm of the navaid/fix — emergency use, not navigation signal coverage",
      "Navigation coverage within 25 nm",
      "The altitude to fly the procedure turn",
      "Radar vectoring altitudes",
    ],
    answer: 0,
    explanation:
      "MSAs are for emergency use and situational awareness. They guarantee obstacle clearance, not signal reception.",
  },
  {
    id: "t5",
    prompt: "Where are the full missed-approach instructions found?",
    choices: [
      "In the briefing strip (and as icons in the profile view)",
      "Only in the plan view",
      "On the airport diagram",
      "In the Chart Supplement only",
    ],
    answer: 0,
    explanation:
      "Modern FAA plates put the textual missed approach in the briefing strip near the top, with pictorial icons in the profile view.",
  },
];

export function TerminalTraining() {
  const [sel, setSel] = useState("brief");
  const zone = (k: string, x: number, y: number, w: number, h: number, label: string) => (
    <g
      onClick={() => setSel(k)}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setSel(k)}
      role="button"
      tabIndex={0}
      aria-label={PLATE_PARTS[k]?.t}
      style={{ cursor: "pointer" }}
    >
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        fill={sel === k ? "oklch(0.82 0.16 78 / 0.18)" : "white"}
        stroke={sel === k ? "oklch(0.7 0.16 78)" : "oklch(0.35 0 0)"}
        strokeWidth={sel === k ? 2 : 1}
      />
      <text
        x={x + w / 2}
        y={y + h / 2 + 4}
        fontSize={11}
        textAnchor="middle"
        fill="oklch(0.25 0 0)"
        fontWeight={600}
      >
        {label}
      </text>
    </g>
  );
  const [apIcao, setApIcao] = useState("KSFO");
  const ap = AIRPORTS.find((a) => a.icao === apIcao) ?? AIRPORTS[0];
  const apQuestions = useMemo(() => (ap ? airportDiagramQuestions(ap) : []), [ap]);
  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,360px)_1fr]">
        <svg
          viewBox="0 0 300 400"
          className="w-full max-w-sm rounded-md border"
          role="img"
          aria-label="Anatomy of an instrument approach chart — click a section"
        >
          <rect width={300} height={400} fill="oklch(0.97 0.005 90)" />
          {zone("margin", 10, 8, 280, 22, "Margin: ILS or LOC RWY 28R")}
          {zone("brief", 10, 34, 280, 60, "Pilot briefing strip")}
          {zone("plan", 10, 98, 280, 140, "Plan view")}
          {zone("profile", 10, 242, 280, 64, "Profile view")}
          {zone("mins", 10, 310, 170, 82, "Landing minimums")}
          {zone("sketch", 184, 310, 106, 82, "Airport sketch")}
        </svg>
        <div className="space-y-3">
          <div className="panel p-4">
            <p className="label-caps mb-1">{PLATE_PARTS[sel]?.t}</p>
            <p className="text-sm">{PLATE_PARTS[sel]?.d}</p>
          </div>
          <Notice tone="caution">
            Schematic layout only — TeachX does not reproduce approach charts. Use current FAA
            Terminal Procedures Publications for real flight.
          </Notice>
        </div>
      </div>
      <McQuiz questions={TERMINAL_QUESTIONS} />

      <div>
        <h3 className="mb-2 font-semibold">Airport diagram reading practice</h3>
        <div className="mb-3 flex flex-wrap gap-1.5">
          {AIRPORTS.filter((a) => a.runways.length >= 1)
            .slice(0, 14)
            .map((a) => (
              <button
                key={a.icao}
                type="button"
                onClick={() => setApIcao(a.icao)}
                className={cn(
                  "rounded border px-2 py-0.5 font-mono text-xs",
                  a.icao === apIcao
                    ? "border-primary/50 bg-primary/15 text-primary"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {a.icao}
              </button>
            ))}
        </div>
        {ap ? (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,420px)_1fr]">
            <div>
              <div className="avionics-screen overflow-hidden">
                <AirportDiagram airport={ap} className="aspect-square w-full" />
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {ap.name}. {AIRPORT_DATA_NOTICE.disclaimer}
              </p>
            </div>
            <McQuiz questions={apQuestions} resetKey={ap.icao} />
          </div>
        ) : null}
      </div>
    </div>
  );
}

function shuffle<T>(arr: T[], seed: number): T[] {
  const a = [...arr];
  let s = seed;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 9301 + 49297) % 233280;
    const j = Math.floor((s / 233280) * (i + 1));
    [a[i], a[j]] = [a[j] as T, a[i] as T];
  }
  return a;
}

function mc(
  id: string,
  prompt: string,
  correct: string,
  wrong: string[],
  explanation: string,
  seed: number,
): McQuestion {
  const opts = shuffle(Array.from(new Set([correct, ...wrong])).slice(0, 4), seed);
  return { id, prompt, choices: opts, answer: opts.indexOf(correct), explanation };
}

function airportDiagramQuestions(ap: (typeof AIRPORTS)[number]): McQuestion[] {
  const qs: McQuestion[] = [];
  const seed = ap.icao.split("").reduce((n, c) => n + c.charCodeAt(0), 0);
  const r0 = ap.runways[0];
  if (!r0) return qs;
  const e0 = r0.ends[1];
  const mh = magneticHeading(ap, e0.trueHeading);
  qs.push(
    mc(
      "ad1",
      `What is the approximate magnetic heading of runway ${e0.id}?`,
      `${fmtHdg(mh)}°`,
      [`${fmtHdg(mh + 180)}°`, `${fmtHdg(mh + 20)}°`, `${fmtHdg(e0.trueHeading)}° (true)`],
      `Runway numbers are the magnetic heading rounded to the nearest 10° and divided by 10: runway ${e0.id} ≈ ${fmtHdg(mh)}° magnetic. True heading is ${fmtHdg(e0.trueHeading)}° (variation ${Math.abs(ap.magVar)}°${ap.magVar >= 0 ? "E" : "W"}).`,
      seed,
    ),
  );
  const longest = [...ap.runways].sort((a, b) => b.lengthFt - a.lengthFt)[0];
  if (longest) {
    qs.push(
      mc(
        "ad2",
        `How long is runway ${longest.name}?`,
        `${longest.lengthFt.toLocaleString()} ft`,
        [
          `${Math.round(longest.lengthFt * 0.7).toLocaleString()} ft`,
          `${Math.round(longest.lengthFt * 1.3).toLocaleString()} ft`,
          `${longest.widthFt.toLocaleString()} ft`,
        ],
        `Airport diagrams list runway dimensions as length × width: ${longest.lengthFt.toLocaleString()} × ${longest.widthFt} ft.`,
        seed + 1,
      ),
    );
  }
  const ilsEnd = ap.runways.flatMap((r) => r.ends).find((e) => e.ils);
  const allEnds = ap.runways.flatMap((r) => r.ends.map((e) => e.id));
  if (ilsEnd) {
    qs.push(
      mc(
        "ad3",
        "Which runway end in the dataset has an ILS?",
        `Runway ${ilsEnd.id}`,
        allEnds
          .filter(
            (x) =>
              x !== ilsEnd.id && !ap.runways.some((r) => r.ends.some((e) => e.id === x && e.ils)),
          )
          .slice(0, 3)
          .map((x) => `Runway ${x}`)
          .concat(["None"]),
        `The ILS (${ilsEnd.ils?.ident}) serves runway ${ilsEnd.id}; on the diagram it is drawn as the cyan approach cone.`,
        seed + 2,
      ),
    );
  }
  const rightEnd = ap.runways.flatMap((r) => r.ends).find((e) => e.pattern === "right");
  const patEnd = rightEnd ?? r0.ends[0];
  qs.push(
    mc(
      "ad4",
      `Which traffic pattern direction does runway ${patEnd.id} use?`,
      patEnd.pattern === "right" ? "Right traffic" : "Left traffic",
      [
        patEnd.pattern === "right" ? "Left traffic" : "Right traffic",
        "Either, pilot's choice",
        "No pattern at towered airports",
      ],
      `Standard traffic patterns are left-hand unless charted otherwise ('RP' in the Chart Supplement / on sectional data). Runway ${patEnd.id} uses ${patEnd.pattern} traffic.`,
      seed + 3,
    ),
  );
  return qs;
}

/* ------------------------------ Chart practice ------------------------------ */

const KINDS = Object.keys(FEATURE_LABEL) as ChartFeatureKind[];

export function ChartPractice({ layers }: { layers: Layers }) {
  const targets = useMemo(practiceTargets, []);
  const [target, setTarget] = useState<PracticeTarget | null>(null);
  const [opts, setOpts] = useState<ChartFeatureKind[]>([]);
  const [picked, setPicked] = useState<ChartFeatureKind | null>(null);
  const [score, setScore] = useState({ right: 0, total: 0 });

  const next = () => {
    const t = targets[Math.floor(Math.random() * targets.length)];
    if (!t) return;
    // Distractors: prefer related kinds for difficulty.
    const others = KINDS.filter((k) => k !== t.kind)
      .sort(() => Math.random() - 0.5)
      .slice(0, 3);
    setTarget(t);
    setOpts([t.kind, ...others].sort(() => Math.random() - 0.5));
    setPicked(null);
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <BayChart layers={layers} highlight={target} cursor="grab" className="h-[520px]" />
      <div className="panel h-fit p-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="label-caps">Identify the highlighted symbol</p>
          <span className="font-mono text-sm">
            {score.right}/{score.total}
          </span>
        </div>
        {!target ? (
          <div>
            <p className="text-sm text-muted-foreground">
              A random feature on the chart will be highlighted with an amber ring. Choose what it
              is. Labels stay on — you can hide them under "Layers" for a harder test.
            </p>
            <Button className="mt-3" onClick={next}>
              <Shuffle className="size-4" /> Start
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            {opts.map((k) => {
              const correct = k === target.kind;
              const show = picked !== null;
              return (
                <button
                  key={k}
                  type="button"
                  disabled={show}
                  onClick={() => {
                    setPicked(k);
                    setScore((s) => ({ right: s.right + (correct ? 1 : 0), total: s.total + 1 }));
                  }}
                  className={cn(
                    "flex w-full items-center gap-2 rounded border px-2.5 py-2 text-left text-sm",
                    !show && "hover:bg-accent/40",
                    show && correct && "border-ok/50 bg-ok/10",
                    show && picked === k && !correct && "border-warning/50 bg-warning/10",
                  )}
                >
                  <span className="flex-1">{FEATURE_LABEL[k]}</span>
                  {show && correct ? <CheckCircle2 className="size-4 text-ok" /> : null}
                  {show && picked === k && !correct ? (
                    <XCircle className="size-4 text-warning" />
                  ) : null}
                </button>
              );
            })}
            {picked ? (
              <div className="pt-1">
                <p className="text-xs text-muted-foreground">
                  {picked === target.kind ? "Correct" : "It's"}: {FEATURE_LABEL[target.kind]} —{" "}
                  <span className="font-mono">{target.name}</span>.
                </p>
                <Button size="sm" className="mt-2" onClick={next}>
                  Next symbol
                </Button>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
