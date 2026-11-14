/**
 * Educational weather reference sections with small interactive elements and SVG illustrations.
 * Content follows the FAA Aviation Weather Handbook (FAA-H-8083-28), PHAK Ch. 12 and the AIM.
 */
import { useState, type ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { AIRCRAFT_PERF, getPerf } from "@/lib/data/aircraft-perf";
import { CATEGORY_INFO, flightCategory } from "@/lib/weather/metar";
import { CategoryBadge } from "@/components/weather/decoders";
import { cn } from "@/lib/utils";

function Choice<T extends string>({ value, options, onChange, label }: { value: T; options: { v: T; l: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="flex flex-wrap gap-1" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.v} type="button" aria-pressed={value === o.v} onClick={() => onChange(o.v)} className={cn("rounded border px-2.5 py-1 text-xs font-medium", value === o.v ? "border-primary/50 bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground")}>
          {o.l}
        </button>
      ))}
    </div>
  );
}

function Facts({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <table className="w-full text-sm">
      <tbody>
        {rows.map(([k, v]) => (
          <tr key={k} className="border-b last:border-0 align-top">
            <td className="w-32 py-1.5 pr-3 text-xs text-muted-foreground">{k}</td>
            <td className="py-1.5 text-sm">{v}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Num({ label, value, onChange, unit, step = 1 }: { label: string; value: number; onChange: (v: number) => void; unit?: string; step?: number }) {
  return (
    <label className="text-xs">
      <span className="label-caps mb-1 block">{label}</span>
      <div className="flex items-center gap-1">
        <Input type="number" step={step} value={Number.isFinite(value) ? value : ""} onChange={(e) => onChange(Number(e.target.value))} className="w-28 font-mono" />
        {unit ? <span className="text-muted-foreground">{unit}</span> : null}
      </div>
    </label>
  );
}

/* ------------------------------ Fronts ------------------------------ */

type FrontType = "cold" | "warm" | "stationary" | "occluded";

const FRONTS: Record<FrontType, { name: string; facts: [string, string][] }> = {
  cold: {
    name: "Cold front",
    facts: [
      ["What happens", "Colder, denser air advances and wedges under warmer air, lifting it sharply. Steep frontal slope; typically moves 20–35 kt."],
      ["Clouds", "Cumulus and cumulonimbus along a narrow band; squall lines may form 50–300 nm ahead (fast-moving fronts)."],
      ["Precipitation", "Showery, often heavy, short-lived; thunderstorms and hail possible."],
      ["Visibility", "Poor in showers, then usually excellent behind the front."],
      ["Wind", "Sharp veer (Northern Hemisphere): e.g. south-southwest ahead, west-northwest behind, often gusty."],
      ["Pressure / temp", "Pressure falls ahead, rises sharply behind; temperature and dew point drop."],
      ["Pilot hazards", "Turbulence, embedded thunderstorms, wind shear, gusty crosswinds at the passage."],
    ],
  },
  warm: {
    name: "Warm front",
    facts: [
      ["What happens", "Warm air advances and slides up over retreating cold air. Gentle slope (≈1:150); moves 10–25 kt; weather can extend 500+ nm ahead."],
      ["Clouds", "Sequence: cirrus → cirrostratus → altostratus → nimbostratus, lowering as the front approaches; stratus and fog near the surface front."],
      ["Precipitation", "Steady, widespread rain or drizzle ahead; freezing rain/ice pellets if the surface air is below 0 °C."],
      ["Visibility", "Poor ahead of the front: precipitation, fog, low stratus."],
      ["Wind", "Southeast ahead, veering south-southwest behind; less abrupt than a cold front."],
      ["Pressure / temp", "Pressure falls steadily ahead and levels off after passage; temperature rises."],
      ["Pilot hazards", "Widespread IFR, low ceilings, fog, icing in cloud and freezing rain beneath the frontal surface."],
    ],
  },
  stationary: {
    name: "Stationary front",
    facts: [
      ["What happens", "Neither air mass advances; the boundary barely moves. Winds blow nearly parallel to the front."],
      ["Weather", "Similar to a warm front but can persist over the same area for days."],
      ["Pilot hazards", "Long periods of low ceilings, precipitation and icing along the boundary."],
    ],
  },
  occluded: {
    name: "Occluded front",
    facts: [
      ["What happens", "A faster cold front overtakes a warm front, lifting the warm sector aloft (cold- or warm-type occlusion)."],
      ["Weather", "Combines warm- and cold-front weather: widespread cloud and precipitation with embedded thunderstorms possible."],
      ["Pilot hazards", "Embedded convection hidden in stratiform cloud, icing, low ceilings — often the most complex frontal weather."],
    ],
  },
};

function FrontSymbol({ type }: { type: FrontType }) {
  const blue = "oklch(0.65 0.18 250)";
  const red = "oklch(0.65 0.22 27)";
  const purple = "oklch(0.6 0.2 310)";
  const W = 300;
  const y = 40;
  const items: ReactNode[] = [];
  for (let i = 0; i < 6; i++) {
    const x = 20 + i * 45;
    if (type === "cold" || (type === "stationary" && i % 2 === 0) || (type === "occluded" && i % 2 === 0)) {
      const c = type === "occluded" ? purple : blue;
      const up = type === "stationary" ? 1 : -1;
      items.push(<polygon key={i} points={`${x},${y} ${x + 18},${y} ${x + 9},${y + up * 14}`} fill={c} />);
    } else {
      const c = type === "occluded" ? purple : red;
      const sweep = type === "stationary" ? 0 : 1;
      items.push(<path key={i} d={`M ${x} ${y} A 9 9 0 0 ${sweep} ${x + 18} ${y} Z`} fill={c} />);
    }
  }
  const line = type === "cold" ? blue : type === "warm" ? red : type === "occluded" ? purple : null;
  return (
    <svg viewBox={`0 0 ${W} 80`} className="h-16 w-full max-w-xs" role="img" aria-label={`${FRONTS[type].name} chart symbol`}>
      {line ? (
        <line x1={10} y1={y} x2={W - 10} y2={y} stroke={line} strokeWidth={3} />
      ) : (
        <>
          {Array.from({ length: 6 }, (_, i) => (
            <line key={i} x1={10 + i * 47} y1={y} x2={57 + i * 47} y2={y} stroke={i % 2 === 0 ? blue : red} strokeWidth={3} />
          ))}
        </>
      )}
      {items}
      <text x={W - 10} y={74} fontSize={10} textAnchor="end" fill="oklch(0.68 0.025 250)">
        {type === "stationary" ? "symbols on opposite sides — little movement" : "symbols point in the direction of movement →"}
      </text>
    </svg>
  );
}

function FrontSection({ type }: { type: FrontType }) {
  // Simple cross-section: cold air wedge (blue), warm air (red), cloud shapes.
  const steep = type === "cold";
  return (
    <svg viewBox="0 0 300 120" className="h-28 w-full max-w-xs" role="img" aria-label={`${FRONTS[type].name} cross-section`}>
      <rect x={0} y={0} width={300} height={110} fill="oklch(0.65 0.22 27 / 0.08)" />
      {type === "cold" ? <path d="M 300 110 L 300 30 Q 200 40 150 110 Z" fill="oklch(0.65 0.18 250 / 0.25)" stroke="oklch(0.65 0.18 250)" /> : null}
      {type === "warm" ? <path d="M 0 110 L 0 40 L 230 110 Z" fill="oklch(0.65 0.18 250 / 0.25)" stroke="oklch(0.65 0.18 250)" /> : null}
      {type === "stationary" ? <path d="M 0 110 L 0 45 L 260 110 Z" fill="oklch(0.65 0.18 250 / 0.25)" stroke="oklch(0.65 0.18 250)" /> : null}
      {type === "occluded" ? (
        <>
          <path d="M 300 110 L 300 30 Q 220 50 170 110 Z" fill="oklch(0.65 0.18 250 / 0.3)" stroke="oklch(0.65 0.18 250)" />
          <path d="M 0 110 L 0 50 L 170 110 Z" fill="oklch(0.65 0.18 250 / 0.18)" stroke="oklch(0.65 0.18 250)" />
          <path d="M 70 20 Q 120 0 170 20 L 170 40 L 70 40 Z" fill="oklch(1 0 0 / 0.15)" />
        </>
      ) : null}
      {steep ? (
        <path d="M 150 75 q -10 -40 15 -55 q 20 -15 40 5 q 15 20 -5 50 Z" fill="oklch(1 0 0 / 0.18)" stroke="oklch(1 0 0 / 0.5)" />
      ) : type !== "occluded" ? (
        <>
          <ellipse cx={90} cy={50} rx={70} ry={8} fill="oklch(1 0 0 / 0.15)" />
          <ellipse cx={170} cy={30} rx={90} ry={6} fill="oklch(1 0 0 / 0.1)" />
          <ellipse cx={40} cy={75} rx={50} ry={9} fill="oklch(1 0 0 / 0.2)" />
        </>
      ) : null}
      <line x1={0} y1={110} x2={300} y2={110} stroke="oklch(0.6 0.02 250)" />
      <text x={6} y={12} fontSize={9} fill="oklch(0.75 0.15 27)">
        warm air
      </text>
      <text x={type === "cold" || type === "occluded" ? 240 : 6} y={104} fontSize={9} fill="oklch(0.75 0.15 250)">
        cold air
      </text>
    </svg>
  );
}

export function FrontsRef() {
  const [t, setT] = useState<FrontType>("cold");
  const f = FRONTS[t];
  return (
    <div className="space-y-3">
      <Choice label="Front type" value={t} onChange={setT} options={(Object.keys(FRONTS) as FrontType[]).map((k) => ({ v: k, l: FRONTS[k].name }))} />
      <div className="grid gap-4 md:grid-cols-[minmax(0,320px)_1fr]">
        <div className="avionics-screen space-y-2 p-3">
          <FrontSymbol type={t} />
          <FrontSection type={t} />
        </div>
        <Facts rows={f.facts} />
      </div>
    </div>
  );
}

/* ------------------------------ Pressure ------------------------------ */

export function PressureRef() {
  const [sys, setSys] = useState<"H" | "L">("H");
  const [setting, setSetting] = useState(30.12);
  const [actual, setActual] = useState(29.82);
  const [indicated, setIndicated] = useState(5500);
  const errorFt = Math.round((setting - actual) * 1000);
  const trueAlt = indicated - errorFt;
  const cw = sys === "H";
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="space-y-2">
        <Choice label="Pressure system" value={sys} onChange={setSys} options={[{ v: "H", l: "High pressure" }, { v: "L", l: "Low pressure" }]} />
        <svg viewBox="0 0 220 180" className="avionics-screen w-full max-w-xs" role="img" aria-label={`${cw ? "High" : "Low"} pressure circulation, Northern Hemisphere`}>
          {[30, 52, 74].map((r) => (
            <ellipse key={r} cx={110} cy={90} rx={r * 1.25} ry={r} fill="none" stroke="oklch(1 0 0 / 0.25)" />
          ))}
          <text x={110} y={98} textAnchor="middle" fontSize={24} fontWeight={700} fill={cw ? "oklch(0.65 0.18 250)" : "oklch(0.65 0.22 27)"}>
            {sys}
          </text>
          {[0, 90, 180, 270].map((a) => {
            const rad = (a * Math.PI) / 180;
            const x = 110 + Math.cos(rad) * 63 * 1.25;
            const y = 90 + Math.sin(rad) * 63;
            // tangent direction: clockwise around high (in screen coords y-down, clockwise = +90°), crossing outward/inward 20°
            const tan = a + (cw ? 90 : -90) + (cw ? -20 : 20);
            const tr = (tan * Math.PI) / 180;
            return <line key={a} x1={x - Math.cos(tr) * 14} y1={y - Math.sin(tr) * 14} x2={x + Math.cos(tr) * 14} y2={y + Math.sin(tr) * 14} stroke="var(--color-cyan)" strokeWidth={2} markerEnd="url(#arr)" />;
          })}
          <defs>
            <marker id="arr" viewBox="0 0 10 10" refX={8} refY={5} markerWidth={6} markerHeight={6} orient="auto">
              <path d="M0,0 L10,5 L0,10 Z" fill="var(--color-cyan)" />
            </marker>
          </defs>
        </svg>
        <p className="text-sm text-muted-foreground">
          {cw
            ? "Northern Hemisphere highs: air descends and flows clockwise and outward. Descending air warms and dries — generally good weather, but haze and poor visibility can be trapped under the inversion."
            : "Northern Hemisphere lows: air flows counter-clockwise and inward, then rises. Rising air cools and condenses — clouds, precipitation and generally poorer weather. Fronts are associated with lows."}{" "}
          Surface friction makes wind cross the isobars toward low pressure; aloft, winds blow nearly parallel to the isobars.
        </p>
      </div>
      <div className="panel p-3">
        <p className="label-caps mb-2">"High to low, look out below" — altimeter error</p>
        <div className="grid grid-cols-2 gap-3">
          <Num label="Kollsman setting" value={setting} onChange={setSetting} unit="inHg" step={0.01} />
          <Num label="Actual local setting" value={actual} onChange={setActual} unit="inHg" step={0.01} />
          <Num label="Indicated altitude" value={indicated} onChange={setIndicated} unit="ft" step={100} />
        </div>
        <div className="mt-3 rounded-md border bg-muted/30 p-3 text-sm">
          <div>
            Altimeter error: <span className="font-mono font-semibold">{errorFt > 0 ? "+" : ""}{errorFt} ft</span> (≈ 10 ft per 0.01 inHg)
          </div>
          <div>
            True altitude ≈ <span className={cn("font-mono font-semibold", errorFt > 0 ? "text-warning" : "text-ok")}>{trueAlt.toLocaleString()} ft</span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {errorFt > 0
              ? "You are LOWER than indicated — flying from high to low pressure without resetting the altimeter erodes terrain clearance."
              : errorFt < 0
                ? "You are higher than indicated (setting lower than actual)."
                : "Altimeter set correctly."}{" "}
            Colder-than-standard temperatures cause the same 'lower than indicated' error ("high to low, hot to cold, look out below").
          </p>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ Clouds ------------------------------ */

const CLOUDS: { family: string; height: string; types: string; hazards: string }[] = [
  { family: "Low", height: "Surface – 6,500 ft AGL", types: "Stratus, stratocumulus, nimbostratus, fog", hazards: "Low ceilings and visibility; icing in freezing temperatures; drizzle." },
  { family: "Middle", height: "6,500 – 20,000 ft AGL", types: "Altostratus, altocumulus", hazards: "Icing (supercooled water), light turbulence; altocumulus castellanus signals mid-level instability." },
  { family: "High", height: "Above 20,000 ft AGL", types: "Cirrus, cirrostratus, cirrocumulus", hazards: "Composed of ice crystals — little icing; cirrostratus halo often precedes a warm front." },
  { family: "Vertical development", height: "Base low/middle, tops to 50,000+ ft", types: "Towering cumulus (TCU), cumulonimbus (CB)", hazards: "Severe turbulence, icing, hail, lightning, wind shear — avoid." },
];

export function CloudsRef() {
  const [t, setT] = useState(24);
  const [td, setTd] = useState(14);
  const [elev, setElev] = useState(500);
  const baseAgl = Math.max(0, ((t - td) / 2.5) * 1000);
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,320px)]">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="label-caps py-1.5 pr-2">Family</th>
              <th className="label-caps py-1.5 pr-2">Typical height</th>
              <th className="label-caps py-1.5 pr-2">Types</th>
              <th className="label-caps py-1.5">Hazards</th>
            </tr>
          </thead>
          <tbody>
            {CLOUDS.map((c) => (
              <tr key={c.family} className="border-b last:border-0 align-top">
                <td className="py-1.5 pr-2 font-medium">{c.family}</td>
                <td className="py-1.5 pr-2 text-xs">{c.height}</td>
                <td className="py-1.5 pr-2 text-xs">{c.types}</td>
                <td className="py-1.5 text-xs text-muted-foreground">{c.hazards}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-xs text-muted-foreground">
          Stable air produces stratiform clouds, smooth air, steady precipitation and poorer visibility; unstable air produces cumuliform clouds, turbulence, showery precipitation and good visibility outside showers.
        </p>
      </div>
      <div className="panel p-3">
        <p className="label-caps mb-2">Estimate cumulus cloud base</p>
        <div className="grid grid-cols-2 gap-3">
          <Num label="Temperature" value={t} onChange={setT} unit="°C" />
          <Num label="Dew point" value={td} onChange={setTd} unit="°C" />
          <Num label="Field elevation" value={elev} onChange={setElev} unit="ft" step={100} />
        </div>
        <div className="mt-3 rounded-md border bg-muted/30 p-3 text-sm">
          {td > t ? (
            <span className="text-warning">Dew point cannot exceed temperature.</span>
          ) : (
            <>
              Base ≈ <span className="font-mono font-semibold">{Math.round(baseAgl / 100) * 100} ft AGL</span> ({Math.round((baseAgl + elev) / 100) * 100} ft MSL)
              <p className="mt-1 text-xs text-muted-foreground">Spread ÷ 2.5 × 1,000 ft (°C) — unsaturated air cools ≈ 3 °C/1,000 ft while the dew point falls ≈ 0.5 °C/1,000 ft, so they converge ≈ 2.5 °C per 1,000 ft.</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ Visibility / ceiling ------------------------------ */

export function VisCeilRef() {
  const [ceil, setCeil] = useState(2500);
  const [vis, setVis] = useState(4);
  const [noCeil, setNoCeil] = useState(false);
  const cat = flightCategory(noCeil ? null : ceil, vis);
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
      <div className="panel space-y-3 p-3">
        <p className="label-caps">Flight category calculator</p>
        <div className="grid grid-cols-2 gap-3">
          <Num label="Ceiling (AGL)" value={ceil} onChange={setCeil} unit="ft" step={100} />
          <Num label="Visibility" value={vis} onChange={setVis} unit="SM" step={0.25} />
        </div>
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" checked={noCeil} onChange={(e) => setNoCeil(e.target.checked)} className="accent-[var(--color-primary)]" /> No ceiling (only FEW/SCT or clear)
        </label>
        <div className="flex items-center gap-3">
          <CategoryBadge cat={cat} large />
          <span className="text-xs text-muted-foreground">{CATEGORY_INFO[cat].rule}</span>
        </div>
        <p className="text-[11px] text-muted-foreground">A ceiling is the lowest broken (BKN) or overcast (OVC) layer, or vertical visibility (VV) into an obscuration. The category is set by whichever of ceiling or visibility is worse.</p>
      </div>
      <div className="overflow-x-auto">
        <p className="label-caps mb-1.5">Basic VFR weather minimums — 14 CFR 91.155 (summary)</p>
        <table className="w-full min-w-[520px] text-xs">
          <thead>
            <tr className="border-b text-left">
              <th className="label-caps py-1.5 pr-2">Airspace</th>
              <th className="label-caps py-1.5 pr-2">Visibility</th>
              <th className="label-caps py-1.5">Cloud clearance</th>
            </tr>
          </thead>
          <tbody>
            {[
              ["Class B", "3 SM", "Clear of clouds"],
              ["Class C / D", "3 SM", "500 below, 1,000 above, 2,000 horizontal"],
              ["Class E below 10,000 MSL", "3 SM", "500 below, 1,000 above, 2,000 horizontal"],
              ["Class E at/above 10,000 MSL", "5 SM", "1,000 below, 1,000 above, 1 SM horizontal"],
              ["Class G ≤ 1,200 AGL — day", "1 SM", "Clear of clouds"],
              ["Class G ≤ 1,200 AGL — night", "3 SM*", "500 below, 1,000 above, 2,000 horizontal*"],
              ["Class G > 1,200 AGL, < 10,000 MSL — day", "1 SM", "500 below, 1,000 above, 2,000 horizontal"],
              ["Class G > 1,200 AGL, < 10,000 MSL — night", "3 SM", "500 below, 1,000 above, 2,000 horizontal"],
              ["Class G > 1,200 AGL, ≥ 10,000 MSL", "5 SM", "1,000 below, 1,000 above, 1 SM horizontal"],
            ].map(([a, v, c]) => (
              <tr key={a} className="border-b last:border-0">
                <td className="py-1.5 pr-2">{a}</td>
                <td className="py-1.5 pr-2 font-mono">{v}</td>
                <td className="py-1.5">{c}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-1.5 text-[11px] text-muted-foreground">
          * Night Class G exception: 1 SM and clear of clouds when operating in an airport traffic pattern within ½ mile of the runway. Class D/C/B/E surface areas also require a 1,000-ft ceiling and 3 SM ground visibility to operate VFR (91.155(c)–(d)); otherwise a special VFR clearance is needed.
        </p>
      </div>
    </div>
  );
}

/* ------------------------------ Icing ------------------------------ */

export function IcingRef() {
  const [temp, setTemp] = useState(-5);
  const [moist, setMoist] = useState(true);
  const risk = !moist
    ? { t: "No structural icing without visible moisture (cloud, rain, drizzle).", tone: "text-ok" }
    : temp > 2
      ? { t: "Above freezing — structural ice won't form (watch for carburetor ice, which can occur up to ~30 °C+).", tone: "text-ok" }
      : temp > 0
        ? { t: "Near 0 °C — icing possible: airframe surfaces can be colder than the air, and evaporation cools them.", tone: "text-caution" }
        : temp >= -10
          ? { t: "0 to −10 °C: highest risk. Large supercooled droplets → clear or mixed ice that spreads back and is hard to remove.", tone: "text-warning" }
          : temp >= -20
            ? { t: "−10 to −20 °C: rime ice most likely (small droplets freeze on impact, rough and opaque). Mixed ice in cumuliform cloud.", tone: "text-warning" }
            : temp >= -40
              ? { t: "Below −20 °C: icing less common (clouds mostly ice crystals) but possible, especially in cumuliform clouds.", tone: "text-caution" }
              : { t: "Below −40 °C: supercooled water cannot exist; structural icing essentially absent.", tone: "text-ok" };
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-3">
        <div className="panel p-3">
          <p className="label-caps mb-2">Icing likelihood explorer</p>
          <label className="text-xs">
            <span className="flex justify-between">
              <span>Outside air temperature</span>
              <span className="font-mono text-foreground">{temp}°C</span>
            </span>
            <input type="range" min={-45} max={10} value={temp} onChange={(e) => setTemp(Number(e.target.value))} className="mt-1 w-full accent-[var(--color-cyan)]" />
          </label>
          <label className="mt-2 flex items-center gap-2 text-xs">
            <input type="checkbox" checked={moist} onChange={(e) => setMoist(e.target.checked)} className="accent-[var(--color-primary)]" /> In visible moisture (cloud or precipitation)
          </label>
          <p className={cn("mt-2 text-sm", risk.tone)}>{risk.t}</p>
        </div>
        <Facts
          rows={[
            ["Rime", "Rough, milky, opaque. Small droplets freeze instantly. Common in stratiform cloud, −10 to −20 °C. Disrupts airflow; adds weight."],
            ["Clear", "Glossy, transparent, heavy, hard to remove. Large droplets flow back before freezing. Freezing rain and cumuliform clouds, 0 to −10 °C."],
            ["Mixed", "Combination of rime and clear — rough and hard, forms in a range of droplet sizes."],
            ["Escape", "Change altitude toward warmer air or out of cloud, turn around, request priority handling. Report with a PIREP."],
          ]}
        />
      </div>
      <div className="panel p-3">
        <p className="label-caps mb-2">Freezing rain — the temperature inversion trap</p>
        <svg viewBox="0 0 260 180" className="w-full" role="img" aria-label="Freezing rain vertical profile">
          <rect x={30} y={10} width={220} height={50} fill="oklch(0.65 0.22 27 / 0.12)" />
          <rect x={30} y={60} width={220} height={60} fill="oklch(0.65 0.22 27 / 0.06)" />
          <rect x={30} y={120} width={220} height={50} fill="oklch(0.65 0.18 250 / 0.15)" />
          <polyline points="60,15 120,50 160,95 120,140 90,170" fill="none" stroke="var(--color-caution)" strokeWidth={2} />
          <line x1={140} y1={10} x2={140} y2={170} stroke="oklch(1 0 0 / 0.4)" strokeDasharray="4 3" />
          <text x={143} y={20} fontSize={8} fill="oklch(0.8 0 0)">0 °C</text>
          <text x={34} y={24} fontSize={9} fill="oklch(0.85 0.02 250)">Snow aloft (below 0 °C)</text>
          <text x={34} y={92} fontSize={9} fill="oklch(0.85 0.1 27)">Warm layer &gt; 0 °C: snow melts → rain</text>
          <text x={34} y={150} fontSize={9} fill="oklch(0.85 0.1 250)">Sub-freezing surface layer:</text>
          <text x={34} y={162} fontSize={9} fill="oklch(0.85 0.1 250)">supercooled rain → clear ice on contact</text>
          <line x1={30} y1={170} x2={250} y2={170} stroke="oklch(0.6 0.02 250)" />
          <text x={170} y={60} fontSize={8} fill="var(--color-caution)">temperature profile</text>
        </svg>
        <p className="mt-2 text-xs text-muted-foreground">
          Freezing rain means warmer air exists above. Ice pellets (PL) at the surface indicate freezing rain at a higher altitude. Climbing into the warm layer is sometimes possible, but the safest choice is to avoid the area entirely — freezing rain can exceed any light aircraft's ice protection.
        </p>
      </div>
    </div>
  );
}

/* ------------------------------ Turbulence ------------------------------ */

const TURB = {
  light: { l: "Light", d: "Slight, erratic changes in altitude and/or attitude. Occupants may feel a slight strain against seat belts; unsecured objects may be displaced slightly. Light chop: slight, rapid, somewhat rhythmic bumpiness." },
  moderate: { l: "Moderate", d: "Changes in altitude and/or attitude occur but the aircraft remains in positive control; usually variations in indicated airspeed. Occupants feel definite strains against seat belts; unsecured objects are dislodged; walking is difficult." },
  severe: { l: "Severe", d: "Large, abrupt changes in altitude and/or attitude; large variations in indicated airspeed. The aircraft may be momentarily out of control. Occupants are forced violently against seat belts. Report immediately (UUA)." },
  extreme: { l: "Extreme", d: "The aircraft is violently tossed about and practically impossible to control. May cause structural damage. Report immediately (UUA)." },
} as const;

export function TurbulenceRef() {
  const [lvl, setLvl] = useState<keyof typeof TURB>("moderate");
  const [ac, setAc] = useState("c172");
  const p = getPerf(ac);
  const [weight, setWeight] = useState(p.maxGrossLb - 300);
  const w = Math.min(Math.max(weight, p.emptyWeightLb), p.maxGrossLb);
  const va = p.v.a * Math.sqrt(w / p.maxGrossLb);
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-3">
        <Choice label="Turbulence intensity" value={lvl} onChange={setLvl} options={(Object.keys(TURB) as (keyof typeof TURB)[]).map((k) => ({ v: k, l: TURB[k].l }))} />
        <p className="rounded-md border bg-muted/30 p-3 text-sm">{TURB[lvl].d}</p>
        <Facts
          rows={[
            ["Mechanical", "Wind flowing over terrain and obstructions; worst on the lee side of ridges and buildings."],
            ["Convective", "Thermals from uneven surface heating — bumpy afternoons, below cumulus bases."],
            ["Frontal", "Lifting of warm air at a frontal surface; strongest with fast cold fronts."],
            ["Wind shear", "Abrupt change in wind speed/direction; low-level wind shear (LLWS) near thunderstorms, fronts and inversions."],
            ["Mountain wave", "Stable air over ridges with strong perpendicular wind; standing lenticular and rotor clouds mark it."],
            ["Wake", "Vortices from heavier aircraft; stay above and upwind of their flight path (AIM 7-4)."],
          ]}
        />
      </div>
      <div className="panel p-3">
        <p className="label-caps mb-2">Turbulence penetration — maneuvering speed at your weight</p>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs">
            <span className="label-caps mb-1 block">Aircraft</span>
            <select
              value={ac}
              onChange={(e) => {
                const np = getPerf(e.target.value);
                setAc(e.target.value);
                setWeight(np.maxGrossLb - Math.round((np.maxGrossLb - np.emptyWeightLb) * 0.3));
              }}
              className="h-9 w-full rounded-md border bg-background px-2 text-sm"
            >
              {AIRCRAFT_PERF.filter((x) => x.powerType !== "jet").map((x) => (
                <option key={x.id} value={x.id}>
                  {x.shortName}
                </option>
              ))}
            </select>
          </label>
          <Num label="Current weight" value={weight} onChange={setWeight} unit="lb" step={50} />
        </div>
        <div className="mt-3 rounded-md border bg-muted/30 p-3 text-sm">
          Va at {w.toLocaleString()} lb ≈ <span className="font-mono font-semibold text-cyan">{Math.round(va)} KIAS</span>
          <span className="text-muted-foreground"> (Va {p.v.a} at {p.maxGrossLb.toLocaleString()} lb max gross)</span>
          <p className="mt-1 text-xs text-muted-foreground">Va × √(weight ÷ max gross). A lighter airplane accelerates more for the same gust, so Va decreases with weight. Fly at or below the POH turbulence penetration speed, wings level, accept altitude changes.</p>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ Thunderstorms ------------------------------ */

const STAGES = {
  cumulus: { l: "Cumulus stage", d: "Updrafts dominate (can exceed 3,000 fpm). Cloud grows rapidly; little or no precipitation reaches the ground. Typically 10–15 minutes." },
  mature: { l: "Mature stage", d: "Precipitation reaches the surface — this marks the start of downdrafts alongside updrafts. Most intense: severe turbulence, lightning, hail, heavy rain, gust fronts and microbursts. Typically 15–30 minutes." },
  dissipating: { l: "Dissipating stage", d: "Downdrafts dominate and the storm rains itself out; the anvil may linger. Strong outflow winds and wind shear can still occur." },
} as const;

export function ThunderstormRef() {
  const [st, setSt] = useState<keyof typeof STAGES>("mature");
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-3">
        <Choice label="Life-cycle stage" value={st} onChange={setSt} options={(Object.keys(STAGES) as (keyof typeof STAGES)[]).map((k) => ({ v: k, l: STAGES[k].l }))} />
        <svg viewBox="0 0 260 170" className="avionics-screen w-full" role="img" aria-label={STAGES[st].l}>
          <line x1={10} y1={160} x2={250} y2={160} stroke="oklch(0.6 0.02 250)" />
          {st === "cumulus" ? <path d="M 90 160 L 90 110 Q 80 80 105 70 Q 110 45 135 50 Q 160 40 165 70 Q 185 85 170 110 L 170 160" fill="oklch(1 0 0 / 0.15)" stroke="oklch(1 0 0 / 0.5)" transform="translate(0 -30)" /> : null}
          {st === "mature" ? (
            <path d="M 80 130 Q 70 100 90 85 Q 85 50 110 35 L 40 20 L 230 20 L 160 35 Q 185 55 175 85 Q 195 100 185 130 Z" fill="oklch(1 0 0 / 0.18)" stroke="oklch(1 0 0 / 0.55)" />
          ) : null}
          {st === "dissipating" ? <path d="M 70 130 Q 80 90 110 60 L 30 30 L 240 30 L 170 60 Q 190 100 195 130 Z" fill="oklch(1 0 0 / 0.08)" stroke="oklch(1 0 0 / 0.3)" strokeDasharray="4 3" /> : null}
          {/* drafts */}
          {st !== "dissipating" ? [110, 130, 150].map((x) => <line key={`u${x}`} x1={x} y1={st === "cumulus" ? 140 : 125} x2={x} y2={st === "cumulus" ? 60 : 45} stroke="oklch(0.65 0.22 27)" strokeWidth={1.5} markerEnd="url(#up)" />) : null}
          {st !== "cumulus" ? [95, 165, 180].map((x) => <line key={`d${x}`} x1={x} y1={60} x2={x} y2={150} stroke="oklch(0.65 0.18 250)" strokeWidth={1.5} markerEnd="url(#dn)" />) : null}
          {st !== "cumulus" ? <path d="M 120 158 Q 150 150 230 158" fill="none" stroke="oklch(0.65 0.18 250)" strokeDasharray="3 3" markerEnd="url(#dn)" /> : null}
          <defs>
            <marker id="up" viewBox="0 0 10 10" refX={5} refY={5} markerWidth={5} markerHeight={5} orient="auto">
              <path d="M0,0 L10,5 L0,10 Z" fill="oklch(0.65 0.22 27)" />
            </marker>
            <marker id="dn" viewBox="0 0 10 10" refX={5} refY={5} markerWidth={5} markerHeight={5} orient="auto">
              <path d="M0,0 L10,5 L0,10 Z" fill="oklch(0.65 0.18 250)" />
            </marker>
          </defs>
          <text x={12} y={14} fontSize={8} fill="oklch(0.75 0.15 27)">▲ updraft</text>
          <text x={60} y={14} fontSize={8} fill="oklch(0.75 0.15 250)">▼ downdraft / gust front</text>
        </svg>
        <p className="text-sm">{STAGES[st].d}</p>
      </div>
      <div className="space-y-3">
        <Facts
          rows={[
            ["Ingredients", "Sufficient moisture, an unstable lapse rate, and a lifting force (fronts, terrain, surface heating, converging winds)."],
            ["Types", "Air-mass (isolated, short-lived), multicell/squall line (non-frontal line, often ahead of a cold front), supercell (rotating, longest-lived, most severe)."],
            ["Hazards", "Severe turbulence, icing, hail (also in clear air under the anvil), lightning, microbursts/LLWS, gust fronts, tornadoes, altimeter errors from rapid pressure changes."],
          ]}
        />
        <div className="rounded-md border border-warning/30 bg-warning/5 p-3 text-sm">
          <p className="mb-1 font-semibold text-warning">Avoidance (AIM 7-1-28)</p>
          <ul className="list-disc space-y-0.5 pl-5 text-xs">
            <li>Avoid severe thunderstorms or intense radar echoes by at least 20 nm.</li>
            <li>Don't land or take off ahead of an approaching storm — gust fronts and wind shear.</li>
            <li>Don't fly under a thunderstorm, even if you can see through it.</li>
            <li>Don't fly between closely spaced storms (6/10 coverage or more) or rely on visual/datalink gaps.</li>
            <li>Clear the top of a known or suspected severe storm by at least 1,000 ft per 10 kt of wind at the cloud top.</li>
            <li>Datalink (NEXRAD) imagery can be 5–15+ minutes old — strategic avoidance only, never tactical penetration.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
