import { useState, type KeyboardEvent } from "react";
import { cn } from "@/lib/utils";
import { C, DiagramLayout } from "./controls";

type ClassId = "A" | "B" | "C" | "D" | "E" | "G";

interface ClassInfo {
  name: string;
  vertical: string;
  entry: string;
  equipment: string;
  pilot: string;
  vfrMins: string;
  speed: string;
  chart: string;
}

export const AIRSPACE_INFO: Record<ClassId, ClassInfo> = {
  A: {
    name: "Class A",
    vertical:
      "18,000 ft MSL up to and including FL600 (over the 48 contiguous states and Alaska within 12 NM of the coast).",
    entry: "IFR flight plan and ATC clearance — VFR flight is not permitted (14 CFR 91.135).",
    equipment:
      "IFR equipment, Mode C transponder and ADS-B Out (91.215, 91.225). Altimeters set to 29.92 inHg (flight levels).",
    pilot: "Instrument rating and IFR clearance.",
    vfrMins: "Not applicable — IFR only.",
    speed: "No 250-knot limit (applies below 10,000 ft MSL only).",
    chart: "Not depicted on sectional charts.",
  },
  B: {
    name: "Class B",
    vertical:
      "Surface to typically 10,000 ft MSL around the busiest airports, shaped like an upside-down wedding cake with shelves.",
    entry:
      'Explicit ATC clearance: "Cleared into the Class Bravo airspace" (91.131). Radar vectors alone are not a clearance.',
    equipment:
      "Two-way radio, Mode C transponder and ADS-B Out within the Class B and the 30 NM Mode C veil (91.215, 91.225).",
    pilot:
      "At least a private pilot certificate, or a student/recreational/sport pilot with the required training and endorsement (61.95). Some primary airports prohibit student solo operations.",
    vfrMins: "3 SM visibility, clear of clouds (91.155).",
    speed:
      "250 KIAS below 10,000 ft MSL; 200 KIAS under a Class B shelf or in a VFR corridor (91.117).",
    chart:
      "Solid blue lines; altitudes shown as ceiling over floor in hundreds of feet MSL (e.g. 100/40).",
  },
  C: {
    name: "Class C",
    vertical:
      "Surface to 4,000 ft above the airport elevation (charted in MSL). Inner 5 NM core from the surface, outer 10 NM shelf from about 1,200 ft AGL.",
    entry:
      "Two-way radio communication established before entry — ATC must reply using your call sign (91.130).",
    equipment:
      "Two-way radio, Mode C transponder and ADS-B Out within and above Class C up to 10,000 ft MSL.",
    pilot: "Student pilot or higher.",
    vfrMins: "3 SM visibility; 500 ft below, 1,000 ft above, 2,000 ft horizontal from clouds.",
    speed:
      "200 KIAS at or below 2,500 ft AGL within 4 NM of the primary airport (unless ATC authorizes otherwise).",
    chart: "Solid magenta lines; altitudes shown as ceiling over floor (e.g. 40/12 or 40/SFC).",
  },
  D: {
    name: "Class D",
    vertical:
      "Surface to typically 2,500 ft above airport elevation (charted in MSL), around airports with an operating control tower.",
    entry:
      "Two-way radio communication established before entry (91.129). Reverts to Class E or G when the tower is closed.",
    equipment: "Two-way radio. No transponder requirement by class alone.",
    pilot: "Student pilot or higher.",
    vfrMins:
      "3 SM visibility; 500 ft below, 1,000 ft above, 2,000 ft horizontal from clouds. Ceiling ≥ 1,000 ft to operate in the surface area without a special VFR clearance (91.155(c)).",
    speed: "200 KIAS at or below 2,500 ft AGL within 4 NM of the primary airport.",
    chart: "Dashed blue line; ceiling shown in a dashed box in hundreds of feet MSL, e.g. [25].",
  },
  E: {
    name: "Class E",
    vertical:
      "Controlled airspace not designated A, B, C or D. Usually begins at 1,200 ft AGL, 700 ft AGL near airports with instrument approaches (magenta vignette), at the surface around some airports (dashed magenta), and at 14,500 ft MSL elsewhere; extends up to (not including) 18,000 ft MSL.",
    entry: "No ATC clearance or radio contact required for VFR. IFR flights require a clearance.",
    equipment:
      "ADS-B Out and Mode C above 10,000 ft MSL, excluding airspace at and below 2,500 ft AGL.",
    pilot: "Student pilot or higher.",
    vfrMins:
      "Below 10,000 ft MSL: 3 SM; 500 below, 1,000 above, 2,000 horizontal. At or above 10,000 ft MSL: 5 SM; 1,000 below, 1,000 above, 1 SM horizontal.",
    speed: "250 KIAS below 10,000 ft MSL.",
    chart:
      "Blue vignette = Class E from 1,200 ft AGL; magenta vignette = from 700 ft AGL; dashed magenta = from the surface.",
  },
  G: {
    name: "Class G",
    vertical:
      "Uncontrolled airspace from the surface up to the base of the overlying Class E (usually 700 or 1,200 ft AGL).",
    entry: "No ATC clearance or radio contact required.",
    equipment: "No equipment requirement by class alone.",
    pilot: "Student pilot or higher.",
    vfrMins:
      "At or below 1,200 ft AGL — day: 1 SM, clear of clouds; night: 3 SM, 500/1,000/2,000 (1 SM clear of clouds in the traffic pattern within ½ NM of the runway). Above 1,200 ft AGL below 10,000 MSL — day: 1 SM; night: 3 SM; both 500 below, 1,000 above, 2,000 horizontal.",
    speed: "250 KIAS below 10,000 ft MSL.",
    chart: "Not explicitly depicted — it is the airspace beneath the Class E floor.",
  },
};

const BASE = 270;
const y = (alt: number) => BASE - (alt / 18000) * 210;

export function AirspaceClassesDiagram() {
  const [sel, setSel] = useState<ClassId>("C");
  const info = AIRSPACE_INFO[sel];
  const shape = (id: ClassId) => ({
    onClick: () => setSel(id),
    className: "cursor-pointer transition-opacity hover:opacity-90",
    role: "button" as const,
    "aria-label": `Class ${id}`,
    tabIndex: 0,
    onKeyDown: (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") setSel(id);
    },
  });
  const hl = (id: ClassId) => (sel === id ? 2.2 : 1);
  const fill = {
    A: "oklch(0.35 0.03 258)",
    B: "oklch(0.55 0.13 242 / 0.45)",
    C: "oklch(0.62 0.2 330 / 0.4)",
    D: "oklch(0.6 0.12 242 / 0.28)",
    E: "oklch(0.62 0.18 330 / 0.12)",
    G: "oklch(0.55 0.08 150 / 0.18)",
  };

  return (
    <DiagramLayout
      stage={
        <svg
          viewBox="0 0 600 300"
          className="h-auto w-full"
          role="img"
          aria-label="Airspace classes cross-section"
        >
          <rect width="600" height="300" fill={C.panel} />
          {/* Class E background: 1,200 AGL to 18,000 */}
          <rect
            {...shape("E")}
            x="0"
            y={y(18000)}
            width="600"
            height={y(1200) - y(18000)}
            fill={fill.E}
            stroke={C.magenta}
            strokeWidth={hl("E")}
            strokeOpacity="0.5"
          />
          {/* Class G band */}
          <rect
            {...shape("G")}
            x="0"
            y={y(1200)}
            width="600"
            height={BASE - y(1200)}
            fill={fill.G}
            stroke="oklch(0.7 0.1 150)"
            strokeWidth={hl("G")}
            strokeOpacity="0.6"
          />
          {/* E transition at 700 AGL around non-towered instrument airport */}
          <rect
            {...shape("E")}
            x="505"
            y={y(1200)}
            width="80"
            height={y(700) - y(1200)}
            fill={fill.E}
            stroke={C.magenta}
            strokeDasharray="3 3"
            strokeWidth={hl("E")}
          />
          {/* E surface area */}
          <rect
            {...shape("E")}
            x="531"
            y={y(700)}
            width="28"
            height={BASE - y(700)}
            fill="oklch(0.62 0.18 330 / 0.22)"
            stroke={C.magenta}
            strokeDasharray="5 3"
            strokeWidth={hl("E")}
          />
          {/* Class B wedding cake */}
          <path
            {...shape("B")}
            d={`M20,${y(10000)} L200,${y(10000)} L200,${y(6000)} L170,${y(6000)} L170,${y(3000)} L140,${y(3000)} L140,${BASE} L80,${BASE} L80,${y(3000)} L50,${y(3000)} L50,${y(6000)} L20,${y(6000)} Z`}
            fill={fill.B}
            stroke={C.primary}
            strokeWidth={hl("B")}
          />
          {/* Class C */}
          <path
            {...shape("C")}
            d={`M276,${y(4000)} L364,${y(4000)} L364,${y(1200)} L342,${y(1200)} L342,${BASE} L298,${BASE} L298,${y(1200)} L276,${y(1200)} Z`}
            fill={fill.C}
            stroke={C.magenta}
            strokeWidth={hl("C")}
          />
          {/* Class D */}
          <rect
            {...shape("D")}
            x="420"
            y={y(2500)}
            width="44"
            height={BASE - y(2500)}
            fill={fill.D}
            stroke={C.primary}
            strokeDasharray="6 4"
            strokeWidth={hl("D")}
          />
          {/* Class A */}
          <rect
            {...shape("A")}
            x="0"
            y="14"
            width="600"
            height={y(18000) - 14}
            fill={fill.A}
            stroke="oklch(0.75 0.02 258)"
            strokeWidth={hl("A")}
          />

          {/* Labels */}
          <g pointerEvents="none" fontSize="11" fontWeight="700">
            <text x="300" y="38" textAnchor="middle" fill={C.fg}>
              CLASS A · 18,000 MSL – FL600
            </text>
            <text x="110" y={y(8000)} textAnchor="middle" fill={C.fg}>
              B
            </text>
            <text x="320" y={y(2800)} textAnchor="middle" fill={C.fg}>
              C
            </text>
            <text x="442" y={y(1400)} textAnchor="middle" fill={C.fg}>
              D
            </text>
            <text x="250" y={y(9000)} textAnchor="middle" fill={C.magenta}>
              CLASS E
            </text>
            <text x="250" y={BASE - 6} textAnchor="middle" fill="oklch(0.8 0.1 150)">
              CLASS G
            </text>
            <text x="545" y={BASE - 20} textAnchor="middle" fill={C.magenta} fontSize="9">
              E
            </text>
          </g>
          {/* altitude scale */}
          <g pointerEvents="none" fontSize="8.5" fill={C.muted}>
            {[1200, 2500, 4000, 10000, 14500, 18000].map((a) => (
              <g key={a}>
                <line x1="596" y1={y(a)} x2="590" y2={y(a)} stroke={C.muted} />
                <text x="588" y={y(a) + 3} textAnchor="end">
                  {a.toLocaleString("en-US")}
                </text>
              </g>
            ))}
          </g>
          {/* ground and airports */}
          <line x1="0" y1={BASE} x2="600" y2={BASE} stroke="oklch(0.6 0.05 60)" strokeWidth="2" />
          {[110, 320, 442, 545].map((ax, i) => (
            <g key={ax} pointerEvents="none">
              <rect x={ax - 9} y={BASE - 2} width="18" height="4" fill={C.fg} />
              <text x={ax} y={BASE + 14} textAnchor="middle" fill={C.muted} fontSize="8.5">
                {["Major hub", "Radar approach", "Towered", "Non-towered IAP"][i]}
              </text>
            </g>
          ))}
          <text x="6" y={BASE + 26} fill={C.muted} fontSize="8.5">
            Schematic, not to scale. Altitudes in feet; B/C/D ceilings shown above airport elevation
            at sea level.
          </text>
        </svg>
      }
      controls={
        <div className="flex flex-wrap gap-1.5">
          {(["A", "B", "C", "D", "E", "G"] as ClassId[]).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setSel(c)}
              className={cn(
                "rounded-md border px-3 py-1.5 font-mono text-xs font-semibold",
                sel === c ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent",
              )}
            >
              {c}
            </button>
          ))}
          <span className="self-center text-[11px] text-muted-foreground">
            or click the diagram
          </span>
        </div>
      }
      info={
        <div className="rounded-md border bg-card text-xs">
          <div className="border-b px-3 py-2 font-semibold">{info.name}</div>
          <dl className="divide-y">
            {(
              [
                ["Dimensions", info.vertical],
                ["Entry", info.entry],
                ["Pilot", info.pilot],
                ["Equipment", info.equipment],
                ["VFR minimums", info.vfrMins],
                ["Speed", info.speed],
                ["On the chart", info.chart],
              ] as const
            ).map(([k, v]) => (
              <div key={k} className="grid grid-cols-[88px_1fr] gap-2 px-3 py-1.5">
                <dt className="text-muted-foreground">{k}</dt>
                <dd className="leading-relaxed">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      }
    />
  );
}
