import { useState } from "react";
import { cn } from "@/lib/utils";
import { ArrowDefs, C, DiagramLayout, Readout, Segmented } from "./controls";

/* ------------------------------------------------------------------------------------------ */
/* Traffic pattern                                                                             */
/* ------------------------------------------------------------------------------------------ */

type Leg = "entry" | "upwind" | "crosswind" | "downwind" | "base" | "final";

const LEGS: Record<Leg, { name: string; alt: string; text: string; call: string }> = {
  entry: {
    name: "45° entry",
    alt: "Pattern altitude (TPA), typically 1,000 ft AGL",
    text: "Arrive at pattern altitude well before entering. Join the downwind leg at a 45° angle abeam midfield, giving way to aircraft already in the pattern (AC 90-66C).",
    call: "\"Centerville traffic, Skyhawk 345TX, ten miles south, inbound to enter left downwind runway 9 via the 45, full stop, Centerville.\"",
  },
  upwind: {
    name: "Departure / upwind leg",
    alt: "Climb at Vy toward TPA",
    text: "Climb straight out on the extended centerline. Do not turn crosswind until beyond the departure end of the runway and within 300 ft of pattern altitude. (Strictly, the upwind leg is the path parallel to the runway in the landing direction — e.g. after a go-around, offset to the side.)",
    call: "\"Centerville traffic, Skyhawk 345TX, departing runway 9, remaining in the pattern, Centerville.\"",
  },
  crosswind: {
    name: "Crosswind leg",
    alt: "Climbing through ~700 ft AGL to TPA",
    text: "A 90° turn in the pattern direction, perpendicular to the runway. Continue the climb to pattern altitude and look for traffic entering on the 45.",
    call: "\"Centerville traffic, Skyhawk 345TX, left crosswind runway 9, Centerville.\"",
  },
  downwind: {
    name: "Downwind leg",
    alt: "TPA — 1,000 ft AGL",
    text: "Fly parallel to the runway opposite the landing direction, about ½–1 NM out. Complete the before-landing checklist. Abeam the touchdown point: carburetor heat as required, reduce power, first flap setting, begin descent.",
    call: "\"Centerville traffic, Skyhawk 345TX, left downwind runway 9, full stop, Centerville.\"",
  },
  base: {
    name: "Base leg",
    alt: "Descending — about 600–700 ft AGL",
    text: "Turn base when the touchdown point is about 45° behind the wing. Continue the descent, add flaps as needed and evaluate wind drift so the turn to final does not overshoot the centerline.",
    call: "\"Centerville traffic, Skyhawk 345TX, left base runway 9, Centerville.\"",
  },
  final: {
    name: "Final approach",
    alt: "Descending — stabilized by about 300–500 ft AGL",
    text: "Aligned with the centerline at the target approach speed (about 1.3 VSO), on a stable glidepath to the aiming point. Go around if the approach is not stabilized.",
    call: "\"Centerville traffic, Skyhawk 345TX, final runway 9, full stop, Centerville.\"",
  },
};

export function TrafficPatternDiagram() {
  const [leg, setLeg] = useState<Leg>("downwind");
  const [dir, setDir] = useState<"left" | "right">("left");
  const s = dir === "left" ? 1 : -1;
  const ry = 150; // runway centerline y
  const py = ry - s * 85; // downwind y
  // Points (runway 09 — departing east/right)
  const P = {
    rwyStart: [150, ry],
    rwyEnd: [370, ry],
    upEnd: [470, ry],
    xwEnd: [500, py],
    dwStart: [470, py],
    dwEnd: [110, py],
    baseEnd: [80, ry],
    entryStart: [320, py - s * 48],
    entryEnd: [260, py],
  } as const;
  const legPaths: Record<Leg, string> = {
    upwind: `M${P.rwyEnd[0]},${ry} L${P.upEnd[0]},${ry}`,
    crosswind: `M${P.upEnd[0]},${ry} Q${P.xwEnd[0]},${ry} ${P.xwEnd[0]},${(ry + py) / 2} T${P.dwStart[0]},${py}`,
    downwind: `M${P.dwStart[0]},${py} L${P.dwEnd[0]},${py}`,
    base: `M${P.dwEnd[0]},${py} Q${P.baseEnd[0] - 10},${py} ${P.baseEnd[0] - 10},${(ry + py) / 2} T${P.baseEnd[0] + 30},${ry}`,
    final: `M${P.baseEnd[0] + 30},${ry} L${P.rwyStart[0] + 30},${ry}`,
    entry: `M${P.entryStart[0]},${P.entryStart[1]} L${P.entryEnd[0]},${P.entryEnd[1]}`,
  };
  const labelPos: Record<Leg, [number, number]> = {
    upwind: [420, ry + s * 16],
    crosswind: [520, (ry + py) / 2],
    downwind: [290, py - s * 12],
    base: [56, (ry + py) / 2],
    final: [112, ry + s * 16],
    entry: [362, P.entryStart[1] + 4],
  };
  const sel = LEGS[leg];

  return (
    <DiagramLayout
      stage={
        <svg viewBox="0 0 580 300" className="h-auto w-full" role="img" aria-label="Airport traffic pattern">
          <ArrowDefs id="tp" />
          <rect width="580" height="300" fill={C.panel} />
          {/* runway */}
          <rect x={P.rwyStart[0]} y={ry - 7} width={P.rwyEnd[0] - P.rwyStart[0]} height="14" fill="#475569" />
          <line x1={P.rwyStart[0] + 22} y1={ry} x2={P.rwyEnd[0] - 22} y2={ry} stroke="#e2e8f0" strokeDasharray="8 6" strokeWidth="1.2" />
          <text x={P.rwyStart[0] + 10} y={ry + 4} fill="#e2e8f0" fontSize="10" fontWeight="700">9</text>
          <text x={P.rwyEnd[0] - 22} y={ry + 4} fill="#e2e8f0" fontSize="10" fontWeight="700">27</text>
          {/* wind indicator */}
          <g transform="translate(40 30)">
            <text x="0" y="0" fill={C.muted} fontSize="9">WIND</text>
            <line x1="44" y1="-3" x2="10" y2="-3" stroke={C.cyan} strokeWidth="2" markerEnd="url(#tp-cyan)" transform="translate(0 10)" />
            <text x="0" y="24" fill={C.cyan} fontSize="9">from east → land 09</text>
          </g>
          {/* legs */}
          {(Object.keys(legPaths) as Leg[]).map((l) => (
            <g key={l} className="cursor-pointer" onClick={() => setLeg(l)} role="button" aria-label={LEGS[l].name}>
              <path d={legPaths[l]} fill="none" stroke="transparent" strokeWidth="18" />
              <path
                d={legPaths[l]}
                fill="none"
                stroke={leg === l ? C.cyan : l === "entry" ? C.magenta : C.primary}
                strokeWidth={leg === l ? 3.5 : 2}
                strokeDasharray={l === "entry" ? "6 4" : undefined}
                markerEnd={`url(#tp-${leg === l ? "cyan" : l === "entry" ? "magenta" : "primary"})`}
              />
              <text x={labelPos[l][0]} y={labelPos[l][1]} fill={leg === l ? C.cyan : C.muted} fontSize="10.5" fontWeight="600" textAnchor="middle">
                {LEGS[l].name.replace(" leg", "").replace("Departure / ", "")}
              </text>
            </g>
          ))}
          <text x="290" y={ry + s * 40} fill={C.muted} fontSize="9" textAnchor="middle">
            {dir === "left" ? "Left traffic: all turns to the left (standard unless charted otherwise)" : "Right traffic: all turns to the right (shown as RP on charts / in the Chart Supplement)"}
          </text>
          <text x="10" y="292" fill={C.muted} fontSize="8.5">Schematic, not to scale. Example calls use a non-towered airport (CTAF).</text>
        </svg>
      }
      controls={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Segmented value={dir} onChange={setDir} options={[{ value: "left", label: "Left traffic" }, { value: "right", label: "Right traffic" }]} />
          <div className="flex flex-wrap gap-1">
            {(["entry", "upwind", "crosswind", "downwind", "base", "final"] as Leg[]).map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => setLeg(l)}
                className={cn("rounded border px-2 py-0.5 text-[11px] capitalize", leg === l ? "border-cyan text-cyan" : "text-muted-foreground hover:text-foreground")}
              >
                {l === "entry" ? "45° entry" : l}
              </button>
            ))}
          </div>
        </div>
      }
      info={
        <div className="space-y-2 text-xs">
          <p className="font-semibold">{sel.name}</p>
          <Readout label="Altitude" value={sel.alt} tone="cyan" />
          <p className="leading-relaxed text-muted-foreground">{sel.text}</p>
          <div className="rounded-md border border-ok/25 bg-ok/5 p-2.5">
            <div className="label-caps mb-1 text-ok">Radio call</div>
            <p className="font-mono text-[11px] leading-relaxed">{sel.call.replace(/left/g, dir)}</p>
          </div>
        </div>
      }
    />
  );
}

/* ------------------------------------------------------------------------------------------ */
/* Runway markings                                                                             */
/* ------------------------------------------------------------------------------------------ */

type Mark = "blast" | "displaced" | "thresholdBar" | "threshold" | "designator" | "tdz" | "aiming" | "centerline" | "side" | "holdshort" | "sign";

const MARKS: Record<Mark, { name: string; text: string }> = {
  blast: { name: "Blast pad / stopway", text: "Yellow chevrons mark a paved area unusable for taxi, takeoff or landing. It protects against jet blast and may serve as an overrun area." },
  displaced: {
    name: "Displaced threshold",
    text: "White arrows lead to the displaced threshold. The area may be used for taxi, the takeoff roll and the landing rollout from the opposite direction — but not for touchdown when landing in this direction.",
  },
  thresholdBar: { name: "Threshold bar", text: "A white bar across the runway marking the beginning of the runway available for landing (here at the displaced threshold)." },
  threshold: { name: "Threshold markings", text: "Longitudinal white stripes (\"piano keys\") identifying the beginning of the runway available for landing. The number of stripes may indicate runway width." },
  designator: { name: "Runway designator", text: "The magnetic heading of the runway rounded to the nearest 10° with the last zero dropped: \"9\" means about 090° magnetic. L/C/R letters distinguish parallel runways." },
  tdz: { name: "Touchdown zone markings", text: "Pairs of rectangular bars at 500-ft intervals that identify the touchdown zone and give distance information for landing on precision instrument runways." },
  aiming: { name: "Aiming point", text: "Two broad white bars about 1,000 ft beyond the threshold — the visual aiming point for a landing aircraft." },
  centerline: { name: "Runway centerline", text: "A line of uniformly spaced white stripes and gaps marking the center of the runway, providing alignment guidance during takeoff and landing." },
  side: { name: "Runway side stripes", text: "Continuous white stripes along each edge that delineate the edges of the full-strength pavement and contrast with the shoulders." },
  holdshort: {
    name: "Runway holding position markings",
    text: "Four yellow lines — two solid and two dashed — across the taxiway. Stop on the solid-line side (taxiway side) unless cleared onto the runway. The dashed side faces the runway; you may cross them to exit the runway. At a towered airport you must not cross the solid lines without an ATC clearance.",
  },
  sign: { name: "Runway holding position sign", text: "Red sign with white characters at the hold-short line, here \"9-27\" — the runway you are about to enter. The left number is the runway to the left." },
};

export function RunwayMarkingsDiagram() {
  const [sel, setSel] = useState<Mark>("aiming");
  const top = 80;
  const bot = 180;
  const mid = (top + bot) / 2;
  const hit = (m: Mark) => ({
    className: "cursor-pointer",
    onClick: () => setSel(m),
    role: "button" as const,
    "aria-label": MARKS[m].name,
  });
  const hiStroke = (m: Mark) => (sel === m ? { stroke: C.cyan, strokeWidth: 2 } : {});
  const W = "#f1f5f9";
  const Y = "#facc15";

  return (
    <DiagramLayout
      stage={
        <svg viewBox="0 0 700 300" className="h-auto w-full" role="img" aria-label="Runway markings">
          <rect width="700" height="300" fill="oklch(0.33 0.05 150)" />
          {/* taxiway */}
          <rect x="520" y={bot} width="44" height="120" fill="#3f4652" />
          <line x1="542" y1={bot} x2="542" y2="300" stroke={Y} strokeWidth="1.5" />
          {/* runway pavement incl. blast pad */}
          <rect x="10" y={top} width="680" height={bot - top} fill="#3f4652" />
          {/* blast pad chevrons */}
          <g {...hit("blast")}>
            <rect x="10" y={top} width="60" height={bot - top} fill="transparent" {...hiStroke("blast")} />
            {[20, 38, 56].map((x) => (
              <path key={x} d={`M${x - 10},${top + 6} L${x + 4},${mid} L${x - 10},${bot - 6}`} fill="none" stroke={Y} strokeWidth="4" />
            ))}
          </g>
          {/* displaced threshold arrows */}
          <g {...hit("displaced")}>
            <rect x="70" y={top} width="100" height={bot - top} fill="transparent" {...hiStroke("displaced")} />
            {[86, 118, 150].map((x) => (
              <path key={x} d={`M${x - 10},${mid} L${x + 10},${mid} M${x + 4},${mid - 5} L${x + 10},${mid} L${x + 4},${mid + 5}`} stroke={W} strokeWidth="2.5" fill="none" />
            ))}
            {[top + 20, bot - 20].map((yy) => (
              <path key={yy} d={`M156,${yy - 6} L168,${yy} L156,${yy + 6}`} fill={W} />
            ))}
          </g>
          {/* threshold bar */}
          <g {...hit("thresholdBar")}>
            <rect x="172" y={top + 2} width="6" height={bot - top - 4} fill={W} {...hiStroke("thresholdBar")} />
          </g>
          {/* threshold stripes */}
          <g {...hit("threshold")}>
            <rect x="184" y={top} width="40" height={bot - top} fill="transparent" {...hiStroke("threshold")} />
            {[0, 1, 2, 3, 5, 6, 7, 8].map((k) => (
              <rect key={k} x="186" y={top + 8 + k * 9.5} width="36" height="5" fill={W} />
            ))}
          </g>
          {/* designator */}
          <g {...hit("designator")}>
            <rect x="232" y={top + 20} width="34" height={bot - top - 40} fill="transparent" {...hiStroke("designator")} />
            <text x="249" y={mid} fill={W} fontSize="34" fontWeight="800" textAnchor="middle" dominantBaseline="central" transform={`rotate(90 249 ${mid})`}>9</text>
          </g>
          {/* TDZ markings */}
          <g {...hit("tdz")}>
            {[
              [290, 3],
              [420, 2],
              [480, 2],
              [560, 1],
              [620, 1],
            ].map(([x, n]) => (
              <g key={x}>
                {Array.from({ length: n ?? 0 }).flatMap((_, i) => [
                  <rect key={`a${i}`} x={x} y={top + 10 + i * 7} width="20" height="4" fill={W} />,
                  <rect key={`b${i}`} x={x} y={bot - 14 - i * 7} width="20" height="4" fill={W} />,
                ])}
              </g>
            ))}
            {sel === "tdz" ? <rect x="285" y={top + 4} width="360" height={bot - top - 8} fill="none" stroke={C.cyan} strokeWidth="1.5" strokeDasharray="4 3" /> : null}
          </g>
          {/* aiming point */}
          <g {...hit("aiming")}>
            <rect x="340" y={top + 12} width="54" height="12" fill={W} {...hiStroke("aiming")} />
            <rect x="340" y={bot - 24} width="54" height="12" fill={W} {...hiStroke("aiming")} />
          </g>
          {/* centerline */}
          <g {...hit("centerline")}>
            <rect x="275" y={mid - 6} width="415" height="12" fill="transparent" {...hiStroke("centerline")} />
            {Array.from({ length: 13 }).map((_, i) => (
              <rect key={i} x={280 + i * 32} y={mid - 1.5} width="20" height="3" fill={W} />
            ))}
          </g>
          {/* side stripes */}
          <g {...hit("side")}>
            <rect x="178" y={top + 1} width="512" height="3" fill={W} {...hiStroke("side")} />
            <rect x="178" y={bot - 4} width="512" height="3" fill={W} {...hiStroke("side")} />
          </g>
          {/* hold short */}
          <g {...hit("holdshort")}>
            <rect x="520" y={bot + 14} width="44" height="22" fill="transparent" {...hiStroke("holdshort")} />
            <line x1="520" y1={bot + 18} x2="564" y2={bot + 18} stroke={Y} strokeWidth="2" strokeDasharray="5 3" />
            <line x1="520" y1={bot + 23} x2="564" y2={bot + 23} stroke={Y} strokeWidth="2" strokeDasharray="5 3" />
            <line x1="520" y1={bot + 28} x2="564" y2={bot + 28} stroke={Y} strokeWidth="2" />
            <line x1="520" y1={bot + 33} x2="564" y2={bot + 33} stroke={Y} strokeWidth="2" />
          </g>
          {/* sign */}
          <g {...hit("sign")}>
            <rect x="470" y={bot + 20} width="42" height="18" fill="#dc2626" {...hiStroke("sign")} />
            <text x="491" y={bot + 33} fill="#fff" fontSize="11" fontWeight="700" textAnchor="middle">9-27</text>
          </g>
          <text x="10" y="18" fill="#e2e8f0" fontSize="10">Precision instrument runway 9 — click any marking</text>
          <text x="10" y="292" fill="#cbd5e1" fontSize="8.5">Schematic, not to scale (AIM 2-3).</text>
        </svg>
      }
      controls={
        <div className="flex flex-wrap gap-1">
          {(Object.keys(MARKS) as Mark[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setSel(m)}
              className={cn("rounded border px-2 py-0.5 text-[11px]", sel === m ? "border-cyan text-cyan" : "text-muted-foreground hover:text-foreground")}
            >
              {MARKS[m].name}
            </button>
          ))}
        </div>
      }
      info={
        <div className="rounded-md border bg-card p-3 text-xs">
          <p className="font-semibold text-cyan">{MARKS[sel].name}</p>
          <p className="mt-1 leading-relaxed text-muted-foreground">{MARKS[sel].text}</p>
        </div>
      }
    />
  );
}

/* ------------------------------------------------------------------------------------------ */
/* ATC light gun signals                                                                       */
/* ------------------------------------------------------------------------------------------ */

export type LightColor = "green" | "red" | "white" | "alternating";
export type LightMode = "steady" | "flashing";

export function lightSignalMeaning(color: LightColor, mode: LightMode, where: "ground" | "air"): string | null {
  if (color === "alternating") return "Exercise extreme caution";
  const key = `${mode}-${color}`;
  const table: Record<string, { ground: string; air: string }> = {
    "steady-green": { ground: "Cleared for takeoff", air: "Cleared to land" },
    "flashing-green": { ground: "Cleared to taxi", air: "Return for landing (to be followed by steady green at the proper time)" },
    "steady-red": { ground: "Stop", air: "Give way to other aircraft and continue circling" },
    "flashing-red": { ground: "Taxi clear of the runway in use", air: "Airport unsafe — do not land" },
    "flashing-white": { ground: "Return to starting point on airport", air: "Not applicable" },
  };
  const row = table[key];
  return row ? row[where] : null;
}

export function LightGunDiagram() {
  const [color, setColor] = useState<LightColor>("green");
  const [mode, setMode] = useState<LightMode>("steady");
  const [where, setWhere] = useState<"ground" | "air">("ground");
  const meaning = lightSignalMeaning(color, mode, where);
  const beam = color === "green" ? "#22c55e" : color === "red" ? "#ef4444" : color === "white" ? "#f8fafc" : "#22c55e";
  const flashing = mode === "flashing" || color === "alternating";

  return (
    <DiagramLayout
      stage={
        <svg viewBox="0 0 400 240" className="h-auto w-full" role="img" aria-label="ATC light gun signal">
          <rect width="400" height="240" fill="oklch(0.16 0.03 258)" />
          <rect y="190" width="400" height="50" fill="oklch(0.3 0.05 150)" />
          {/* tower */}
          <rect x="48" y="90" width="18" height="100" fill="#64748b" />
          <path d="M34,70 L80,70 L76,92 L38,92 Z" fill="#94a3b8" />
          <rect x="40" y="74" width="34" height="12" fill="#0ea5e9" opacity="0.5" />
          {/* beam */}
          <g className={flashing ? "animate-annunciator" : undefined}>
            <path d={`M74,80 L${where === "air" ? "330,40 L330,90" : "330,170 L330,205"} Z`} fill={beam} opacity="0.22" />
            <circle cx="74" cy="80" r="6" fill={beam} />
          </g>
          {color === "alternating" ? (
            <g className="animate-annunciator" style={{ animationDelay: "0.5s" }}>
              <path d={`M74,80 L${where === "air" ? "330,40 L330,90" : "330,170 L330,205"} Z`} fill="#ef4444" opacity="0.22" />
              <circle cx="74" cy="80" r="6" fill="#ef4444" />
            </g>
          ) : null}
          {/* aircraft */}
          {where === "air" ? (
            <g transform="translate(330 64)">
              <path d="M-26,0 L22,0 L28,-3 L28,3 Z M-6,-1 L-2,-18 L4,-18 L4,-1 Z M-24,-1 L-28,-10 L-22,-10 L-18,-1 Z" fill="#e2e8f0" />
            </g>
          ) : (
            <g transform="translate(330 186)">
              <path d="M-26,0 L22,0 L28,-3 L28,3 Z M-6,-1 L-2,-14 L4,-14 L4,-1 Z M-24,-1 L-28,-10 L-22,-10 L-18,-1 Z" fill="#e2e8f0" />
              <circle cx="-14" cy="5" r="3" fill="#0f172a" />
              <circle cx="14" cy="5" r="3" fill="#0f172a" />
            </g>
          )}
          <text x="10" y="18" fill={C.muted} fontSize="10">
            {color === "alternating" ? "Alternating red and green" : `${mode === "steady" ? "Steady" : "Flashing"} ${color}`} — aircraft {where === "air" ? "in flight" : "on the ground"}
          </text>
        </svg>
      }
      controls={
        <div className="space-y-2">
          <Segmented
            value={color}
            onChange={setColor}
            options={[
              { value: "green", label: "Green" },
              { value: "red", label: "Red" },
              { value: "white", label: "White" },
              { value: "alternating", label: "Red/Green" },
            ]}
          />
          <div className="flex flex-wrap gap-2">
            <Segmented value={mode} onChange={setMode} options={[{ value: "steady", label: "Steady" }, { value: "flashing", label: "Flashing" }]} />
            <Segmented value={where} onChange={setWhere} options={[{ value: "ground", label: "On ground" }, { value: "air", label: "In flight" }]} />
          </div>
        </div>
      }
      info={
        <>
          <div className={cn("rounded-md border p-3", meaning && meaning !== "Not applicable" ? "border-ok/30 bg-ok/5" : "border-caution/30 bg-caution/5")}>
            <div className="label-caps mb-1">Meaning (14 CFR 91.125)</div>
            <p className="text-sm font-semibold">{meaning ?? "Not a standard ATC light signal"}</p>
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Light signals are used when two-way radio communication is lost. Acknowledge in flight by rocking the wings (day) or
            flashing the landing or navigation lights (night); on the ground, move the ailerons or rudder (day) or flash the lights
            (night) (AIM 4-3-13).
          </p>
        </>
      }
    />
  );
}
