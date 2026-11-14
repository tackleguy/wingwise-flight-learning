import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { norm360, windTriangle } from "@/lib/geo";
import { pad3, pick, rnd, rndInt } from "../navmath";
import { AnswerField, ExerciseFrame, Feedback, headingWithin, Loading, parseLooseNumber, useGenerated, useScore, within } from "./shared";

const r1 = (n: number) => Math.round(n * 10) / 10;

/** Parse a signed wind correction angle: "-5", "5L", "L5", "+7", "7R". Left is negative. */
function parseWca(raw: string): number | null {
  const s = raw.trim().toUpperCase();
  const m = /^([LR])?\s*([+-]?\d+(?:\.\d+)?)\s*°?\s*([LR])?$/.exec(s);
  if (!m) return null;
  let v = Number(m[2]);
  const side = m[1] ?? m[3];
  if (side === "L") v = -Math.abs(v);
  if (side === "R") v = Math.abs(v);
  return v;
}

function parseClock(raw: string): number | null {
  const m = /^(\d{1,2}):?(\d{2})\s*Z?$/i.exec(raw.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mm = Number(m[2]);
  if (h > 23 || mm > 59) return null;
  return h * 60 + mm;
}

const clock = (min: number) => {
  const t = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, "0")}${String(t % 60).padStart(2, "0")}Z`;
};

function SolutionTable({ rows }: { rows: [string, string, string?][] }) {
  return (
    <div className="overflow-hidden rounded-md border">
      <table className="w-full text-xs">
        <tbody className="divide-y">
          {rows.map(([k, v, how]) => (
            <tr key={k}>
              <td className="w-36 bg-muted/40 px-2.5 py-1.5 text-muted-foreground">{k}</td>
              <td className="px-2.5 py-1.5 font-mono font-semibold text-cyan">{v}</td>
              <td className="hidden px-2.5 py-1.5 text-muted-foreground sm:table-cell">{how ?? ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------------------------------------------------------------------ */
/* Wind correction                                                                             */
/* ------------------------------------------------------------------------------------------ */

function genWind() {
  for (;;) {
    const tc = rndInt(0, 359);
    const tas = rndInt(9, 15) * 10;
    const wdir = rndInt(1, 36) * 10;
    const wspd = rndInt(8, 35);
    const w = windTriangle(tc, tas, wdir, wspd);
    if (Number.isFinite(w.heading)) return { tc, tas, wdir, wspd, ...w };
  }
}

export function WindCorrectionExercise() {
  const { item, next } = useGenerated(genWind);
  const { score, record } = useScore();
  const [a, setA] = useState({ wca: "", th: "", gs: "" });
  const [checked, setChecked] = useState(false);
  if (!item) return <Loading />;
  const okW = within(parseWca(a.wca), item.wca, 2);
  const okH = headingWithin(parseLooseNumber(a.th), item.heading, 2);
  const okG = within(parseLooseNumber(a.gs), item.groundspeed, 3);
  const all = okW && okH && okG;
  const st = (ok: boolean) => (checked ? ok : null);
  return (
    <ExerciseFrame
      score={score}
      onNext={() => {
        next();
        setA({ wca: "", th: "", gs: "" });
        setChecked(false);
      }}
      instructions="Solve the wind triangle with an E6B, the formula or mental math. Enter WCA as e.g. 6L or 4R (tolerance ±2°, groundspeed ±3 kt)."
    >
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          ["True course", `${pad3(item.tc)}°`],
          ["True airspeed", `${item.tas} kt`],
          ["Wind (true)", `${pad3(item.wdir)}° @ ${item.wspd} kt`],
          ["Units", "knots / degrees true"],
        ].map(([k, v]) => (
          <div key={k} className="rounded-md border bg-panel px-2.5 py-1.5">
            <div className="text-[10px] tracking-wider text-muted-foreground uppercase">{k}</div>
            <div className="font-mono text-sm font-semibold">{v}</div>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2.5">
        <AnswerField label="Wind correction angle" value={a.wca} onChange={(v) => setA({ ...a, wca: v })} status={st(okW)} inputMode="text" placeholder="e.g. 6L" />
        <AnswerField label="True heading" value={a.th} onChange={(v) => setA({ ...a, th: v })} suffix="°" status={st(okH)} />
        <AnswerField label="Groundspeed" value={a.gs} onChange={(v) => setA({ ...a, gs: v })} suffix="kt" status={st(okG)} />
      </div>
      {!checked ? (
        <Button
          size="sm"
          onClick={() => {
            setChecked(true);
            record(all);
          }}
        >
          Check
        </Button>
      ) : (
        <>
          <Feedback ok={all} title={all ? "Correct solution" : "Compare with the solution"}>
            Wind angle relative to course = {Math.round(((item.wdir - item.tc + 540) % 360) - 180)}°. sin(WCA) = {item.wspd} × sin(wind angle) ÷ {item.tas}.
          </Feedback>
          <SolutionTable
            rows={[
              ["WCA", `${Math.abs(item.wca).toFixed(1)}° ${item.wca >= 0 ? "right" : "left"}`, "Correct into the wind"],
              ["True heading", `${pad3(item.heading)}°`, "TC + WCA (right +, left −)"],
              ["Groundspeed", `${item.groundspeed.toFixed(0)} kt`, "TAS·cos(WCA) − wind·cos(wind angle)"],
            ]}
          />
        </>
      )}
    </ExerciseFrame>
  );
}

/* ------------------------------------------------------------------------------------------ */
/* Cross-country leg                                                                           */
/* ------------------------------------------------------------------------------------------ */

function genXc() {
  const w = genWind();
  const dist = rndInt(35, 125);
  const varDeg = rndInt(2, 16);
  const varDir = pick(["E", "W"] as const);
  const gph = r1(rnd(7.5, 11));
  const dep = rndInt(0, 23) * 60 + rndInt(0, 11) * 5;
  const mh = norm360(w.heading + (varDir === "E" ? -varDeg : varDeg));
  const ete = (dist / w.groundspeed) * 60;
  return { ...w, dist, varDeg, varDir, gph, dep, mh, ete, eta: dep + ete, fuel: (ete / 60) * gph };
}

export function XcCalcExercise() {
  const { item, next } = useGenerated(genXc);
  const { score, record } = useScore();
  const blank = { th: "", mh: "", gs: "", ete: "", eta: "", fuel: "" };
  const [a, setA] = useState(blank);
  const [checked, setChecked] = useState(false);
  if (!item) return <Loading />;
  const eta = parseClock(a.eta);
  const ok = {
    th: headingWithin(parseLooseNumber(a.th), item.heading, 2),
    mh: headingWithin(parseLooseNumber(a.mh), item.mh, 2),
    gs: within(parseLooseNumber(a.gs), item.groundspeed, 3),
    ete: within(parseLooseNumber(a.ete), item.ete, 2),
    eta: eta !== null && Math.abs(((eta - item.eta + 2160) % 1440) - 720) <= 2,
    fuel: within(parseLooseNumber(a.fuel), item.fuel, Math.max(0.4, item.fuel * 0.05)),
  };
  const all = Object.values(ok).every(Boolean);
  const st = (v: boolean) => (checked ? v : null);
  return (
    <ExerciseFrame
      score={score}
      onNext={() => {
        next();
        setA(blank);
        setChecked(false);
      }}
      nextLabel="New leg"
      instructions="Complete the navigation log for this leg. Tolerances: headings ±2°, groundspeed ±3 kt, time ±2 min, fuel ±5%. Fuel is for the leg only (no climb or reserve)."
    >
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          ["True course", `${pad3(item.tc)}°`],
          ["Distance", `${item.dist} NM`],
          ["TAS", `${item.tas} kt`],
          ["Wind (true)", `${pad3(item.wdir)}° @ ${item.wspd} kt`],
          ["Variation", `${item.varDeg}° ${item.varDir}`],
          ["Fuel burn", `${item.gph} GPH`],
          ["Departure", clock(item.dep)],
        ].map(([k, v]) => (
          <div key={k} className="rounded-md border bg-panel px-2.5 py-1.5">
            <div className="text-[10px] tracking-wider text-muted-foreground uppercase">{k}</div>
            <div className="font-mono text-sm font-semibold">{v}</div>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        <AnswerField label="True heading" value={a.th} onChange={(v) => setA({ ...a, th: v })} suffix="°" status={st(ok.th)} />
        <AnswerField label="Magnetic heading" value={a.mh} onChange={(v) => setA({ ...a, mh: v })} suffix="°" status={st(ok.mh)} />
        <AnswerField label="Groundspeed" value={a.gs} onChange={(v) => setA({ ...a, gs: v })} suffix="kt" status={st(ok.gs)} />
        <AnswerField label="ETE" value={a.ete} onChange={(v) => setA({ ...a, ete: v })} suffix="min" status={st(ok.ete)} />
        <AnswerField label="ETA" value={a.eta} onChange={(v) => setA({ ...a, eta: v })} suffix="Z" status={st(ok.eta)} inputMode="numeric" placeholder="hhmm" />
        <AnswerField label="Fuel required" value={a.fuel} onChange={(v) => setA({ ...a, fuel: v })} suffix="gal" status={st(ok.fuel)} />
      </div>
      {!checked ? (
        <Button
          size="sm"
          onClick={() => {
            setChecked(true);
            record(all);
          }}
        >
          Check nav log
        </Button>
      ) : (
        <>
          <Feedback ok={all} title={all ? "Nav log correct" : "Compare with the worked solution"}>
            Remember: east variation is subtracted, west is added ("east is least, west is best"). Deviation from the compass card
            would be applied next to get compass heading.
          </Feedback>
          <SolutionTable
            rows={[
              ["WCA", `${Math.abs(item.wca).toFixed(1)}° ${item.wca >= 0 ? "R" : "L"}`, "From the wind triangle"],
              ["True heading", `${pad3(item.heading)}°`, "TC ± WCA"],
              ["Magnetic heading", `${pad3(item.mh)}°`, `TH ${item.varDir === "E" ? "−" : "+"} ${item.varDeg}° ${item.varDir}`],
              ["Groundspeed", `${item.groundspeed.toFixed(0)} kt`, ""],
              ["ETE", `${item.ete.toFixed(0)} min`, `${item.dist} NM ÷ ${item.groundspeed.toFixed(0)} kt × 60`],
              ["ETA", clock(item.eta), "Departure + ETE"],
              ["Fuel", `${item.fuel.toFixed(1)} gal`, `${(item.ete / 60).toFixed(2)} h × ${item.gph} GPH`],
            ]}
          />
        </>
      )}
    </ExerciseFrame>
  );
}

/* ------------------------------------------------------------------------------------------ */
/* Fuel planning (14 CFR 91.151)                                                               */
/* ------------------------------------------------------------------------------------------ */

function genFuel() {
  const night = Math.random() < 0.45;
  const ete = rndInt(6, 30) * 5;
  const gph = r1(rnd(7, 13));
  const taxi = pick([1, 1.1, 1.4, 2]);
  const trip = (ete / 60) * gph;
  const reserve = ((night ? 45 : 30) / 60) * gph;
  const total = taxi + trip + reserve;
  const usable = Math.round((total + rnd(-8, 12)) * 2) / 2;
  return { night, ete, gph, taxi, trip, reserve, total, usable: Math.max(10, usable) };
}

export function FuelPlanningExercise() {
  const { item, next } = useGenerated(genFuel);
  const { score, record } = useScore();
  const [a, setA] = useState({ trip: "", reserve: "", total: "", go: "" as "" | "yes" | "no" });
  const [checked, setChecked] = useState(false);
  if (!item) return <Loading />;
  const legal = item.usable >= item.total;
  const ok = {
    trip: within(parseLooseNumber(a.trip), item.trip, 0.3),
    reserve: within(parseLooseNumber(a.reserve), item.reserve, 0.2),
    total: within(parseLooseNumber(a.total), item.total, 0.4),
    go: a.go === (legal ? "yes" : "no"),
  };
  const all = Object.values(ok).every(Boolean);
  const st = (v: boolean) => (checked ? v : null);
  return (
    <ExerciseFrame
      score={score}
      onNext={() => {
        next();
        setA({ trip: "", reserve: "", total: "", go: "" });
        setChecked(false);
      }}
      nextLabel="New scenario"
      instructions="Compute the minimum fuel required by 14 CFR 91.151 for this VFR flight in an airplane, then decide whether the fuel on board is legal. Tolerance ±0.3 gal."
    >
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {[
          ["Flight", item.night ? "VFR at night" : "VFR by day"],
          ["Time to destination", `${item.ete} min`],
          ["Cruise fuel burn", `${item.gph} GPH`],
          ["Start, taxi, run-up", `${item.taxi} gal`],
          ["Usable fuel on board", `${item.usable} gal`],
        ].map(([k, v]) => (
          <div key={k} className="rounded-md border bg-panel px-2.5 py-1.5">
            <div className="text-[10px] tracking-wider text-muted-foreground uppercase">{k}</div>
            <div className="font-mono text-sm font-semibold">{v}</div>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <AnswerField label="Trip fuel" value={a.trip} onChange={(v) => setA({ ...a, trip: v })} suffix="gal" status={st(ok.trip)} />
        <AnswerField label="Required reserve" value={a.reserve} onChange={(v) => setA({ ...a, reserve: v })} suffix="gal" status={st(ok.reserve)} />
        <AnswerField label="Total required" value={a.total} onChange={(v) => setA({ ...a, total: v })} suffix="gal" status={st(ok.total)} />
        <div>
          <span className="mb-1 block text-[11px] font-medium text-muted-foreground">Legal to depart?</span>
          <div className="grid grid-cols-2 gap-1">
            {(["yes", "no"] as const).map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => setA({ ...a, go: g })}
                className={cn("h-9 rounded-md border text-xs font-semibold uppercase", a.go === g ? "border-primary bg-primary/15 text-primary" : "text-muted-foreground", checked && (legal ? "yes" : "no") === g && "border-ok text-ok")}
              >
                {g}
              </button>
            ))}
          </div>
        </div>
      </div>
      {!checked ? (
        <Button
          size="sm"
          onClick={() => {
            setChecked(true);
            record(all);
          }}
        >
          Check
        </Button>
      ) : (
        <>
          <Feedback ok={all} title={legal ? "Fuel is legal for this flight" : "Not legal — more fuel or a closer fuel stop is required"}>
            91.151: VFR flight in an airplane requires enough fuel to fly to the first point of intended landing and, at normal
            cruising speed, for at least 30 minutes by day or 45 minutes at night. This is a legal minimum — many pilots plan
            to land with at least one hour of fuel.
          </Feedback>
          <SolutionTable
            rows={[
              ["Trip fuel", `${item.trip.toFixed(1)} gal`, `${item.ete} min ÷ 60 × ${item.gph} GPH`],
              ["Reserve", `${item.reserve.toFixed(1)} gal`, `${item.night ? 45 : 30} min at ${item.gph} GPH`],
              ["Taxi allowance", `${item.taxi.toFixed(1)} gal`, "Burned before takeoff"],
              ["Total required", `${item.total.toFixed(1)} gal`, `vs ${item.usable} gal usable → margin ${(item.usable - item.total).toFixed(1)} gal`],
            ]}
          />
        </>
      )}
    </ExerciseFrame>
  );
}

/* ------------------------------------------------------------------------------------------ */
/* Weight and balance                                                                          */
/* ------------------------------------------------------------------------------------------ */

const WB = {
  emptyWeight: 1663,
  emptyMoment: 64700,
  arms: { front: 37.0, rear: 73.0, fuel: 48.0, bag1: 95.0 },
  maxWeight: 2550,
  aftLimit: 47.3,
};
const fwdLimit = (w: number) => (w <= 1950 ? 35.0 : 35.0 + ((w - 1950) / 600) * 6.0);

function genWb() {
  const front = rndInt(260, 400);
  const rear = pick([0, 0, rndInt(120, 200), rndInt(250, 360)]);
  const fuelGal = pick([20, 30, 35, 40, 45, 53]);
  const bag = pick([0, 20, 40, 60, 80, 120]);
  const rows = [
    { item: "Basic empty weight", weight: WB.emptyWeight, arm: WB.emptyMoment / WB.emptyWeight, moment: WB.emptyMoment },
    { item: "Pilot & front passenger", weight: front, arm: WB.arms.front, moment: front * WB.arms.front },
    { item: "Rear passengers", weight: rear, arm: WB.arms.rear, moment: rear * WB.arms.rear },
    { item: `Fuel (${fuelGal} gal × 6 lb)`, weight: fuelGal * 6, arm: WB.arms.fuel, moment: fuelGal * 6 * WB.arms.fuel },
    { item: "Baggage area 1", weight: bag, arm: WB.arms.bag1, moment: bag * WB.arms.bag1 },
  ];
  const weight = rows.reduce((s, r) => s + r.weight, 0);
  const moment = rows.reduce((s, r) => s + r.moment, 0);
  const cg = moment / weight;
  const inLimits = weight <= WB.maxWeight && cg >= fwdLimit(weight) && cg <= WB.aftLimit;
  return { rows, weight, moment, cg, inLimits };
}

function Envelope({ weight, cg }: { weight: number | null; cg: number | null }) {
  const x = (c: number) => 40 + ((c - 33) / (49 - 33)) * 330;
  const y = (w: number) => 210 - ((w - 1500) / (2700 - 1500)) * 190;
  const env: [number, number][] = [
    [35, 1500],
    [35, 1950],
    [41, 2550],
    [47.3, 2550],
    [47.3, 1500],
  ];
  return (
    <svg viewBox="0 0 390 240" className="h-auto w-full" role="img" aria-label="CG envelope">
      <rect width="390" height="240" fill="var(--color-panel)" />
      {[1500, 1800, 2100, 2400, 2700].map((w) => (
        <g key={w}>
          <line x1="40" x2="370" y1={y(w)} y2={y(w)} stroke="var(--color-border)" strokeWidth="0.6" />
          <text x="36" y={y(w) + 3} fill="var(--color-muted-foreground)" fontSize="8.5" textAnchor="end">{w}</text>
        </g>
      ))}
      {[33, 35, 37, 39, 41, 43, 45, 47, 49].map((c) => (
        <g key={c}>
          <line x1={x(c)} x2={x(c)} y1="20" y2="210" stroke="var(--color-border)" strokeWidth="0.6" />
          <text x={x(c)} y="222" fill="var(--color-muted-foreground)" fontSize="8.5" textAnchor="middle">{c}</text>
        </g>
      ))}
      <polygon points={env.map(([c, w]) => `${x(c)},${y(w)}`).join(" ")} fill="var(--color-ok)" fillOpacity="0.12" stroke="var(--color-ok)" strokeWidth="1.6" />
      <text x="205" y="236" fill="var(--color-muted-foreground)" fontSize="9" textAnchor="middle">CG (inches aft of datum)</text>
      <text x={x(44)} y={y(2550) - 5} fill="var(--color-ok)" fontSize="8.5" textAnchor="middle">Max 2,550 lb</text>
      {weight !== null && cg !== null ? (
        <g>
          <circle cx={x(Math.max(33, Math.min(49, cg)))} cy={y(Math.max(1500, Math.min(2700, weight)))} r="5.5" fill="var(--color-cyan)" stroke="var(--color-panel)" strokeWidth="2" />
          <text x={x(Math.max(33, Math.min(49, cg))) + 8} y={y(Math.max(1500, Math.min(2700, weight))) - 6} fill="var(--color-cyan)" fontSize="9" fontWeight="700">
            {Math.round(weight)} lb @ {cg.toFixed(1)}
          </text>
        </g>
      ) : null}
    </svg>
  );
}

export function WeightBalanceExercise() {
  const { item, next } = useGenerated(genWb);
  const { score, record } = useScore();
  const blank = { weight: "", moment: "", cg: "", ok: "" as "" | "yes" | "no" };
  const [a, setA] = useState(blank);
  const [checked, setChecked] = useState(false);
  if (!item) return <Loading />;
  const mIn = parseLooseNumber(a.moment);
  const ok = {
    weight: within(parseLooseNumber(a.weight), item.weight, 1),
    moment: mIn !== null && (Math.abs(mIn - item.moment) <= item.moment * 0.005 || Math.abs(mIn * 1000 - item.moment) <= item.moment * 0.005),
    cg: within(parseLooseNumber(a.cg), item.cg, 0.15),
    ok: a.ok === (item.inLimits ? "yes" : "no"),
  };
  const all = Object.values(ok).every(Boolean);
  const st = (v: boolean) => (checked ? v : null);
  const reason =
    item.weight > WB.maxWeight
      ? `Over maximum takeoff weight by ${Math.round(item.weight - WB.maxWeight)} lb.`
      : item.cg > WB.aftLimit
        ? "CG is aft of the aft limit — the airplane may be unstable and stall/spin recovery could be impossible."
        : item.cg < fwdLimit(item.weight)
          ? "CG is forward of the forward limit — the elevator may not be able to raise the nose for landing."
          : "Weight and CG are within the normal-category envelope.";

  return (
    <ExerciseFrame
      score={score}
      onNext={() => {
        next();
        setA(blank);
        setChecked(false);
      }}
      nextLabel="New loading"
      instructions="Representative C172-type training data. Moment = weight × arm. CG = total moment ÷ total weight. Enter the total moment in lb-in (or in thousands, e.g. 104.3)."
    >
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full min-w-[420px] text-xs">
          <thead className="bg-muted/40 text-left text-muted-foreground">
            <tr>
              <th className="px-2.5 py-1.5 font-medium">Item</th>
              <th className="px-2.5 py-1.5 text-right font-medium">Weight (lb)</th>
              <th className="px-2.5 py-1.5 text-right font-medium">Arm (in)</th>
              <th className="px-2.5 py-1.5 text-right font-medium">Moment (lb-in)</th>
            </tr>
          </thead>
          <tbody className="divide-y font-mono tabular">
            {item.rows.map((r) => (
              <tr key={r.item}>
                <td className="px-2.5 py-1.5 font-sans">{r.item}</td>
                <td className="px-2.5 py-1.5 text-right">{r.weight}</td>
                <td className="px-2.5 py-1.5 text-right">{r.arm.toFixed(1)}</td>
                <td className="px-2.5 py-1.5 text-right">{r.item === "Basic empty weight" ? r.moment.toLocaleString("en-US") : checked ? Math.round(r.moment).toLocaleString("en-US") : "?"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Limits: max takeoff weight 2,550 lb · forward CG limit 35.0 in at 1,950 lb or less, increasing linearly to 41.0 in at 2,550 lb · aft limit 47.3 in.
        Training data only — always use your aircraft's POH/AFM and weighing record.
      </p>
      <div className="grid gap-4 md:grid-cols-[1fr_1fr]">
        <div className="space-y-2.5">
          <div className="grid grid-cols-3 gap-2">
            <AnswerField label="Total weight" value={a.weight} onChange={(v) => setA({ ...a, weight: v })} suffix="lb" status={st(ok.weight)} />
            <AnswerField label="Total moment" value={a.moment} onChange={(v) => setA({ ...a, moment: v })} status={st(ok.moment)} />
            <AnswerField label="CG" value={a.cg} onChange={(v) => setA({ ...a, cg: v })} suffix="in" status={st(ok.cg)} />
          </div>
          <div>
            <span className="mb-1 block text-[11px] font-medium text-muted-foreground">Within limits?</span>
            <div className="grid grid-cols-2 gap-1">
              {(["yes", "no"] as const).map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setA({ ...a, ok: g })}
                  className={cn("h-9 rounded-md border text-xs font-semibold uppercase", a.ok === g ? "border-primary bg-primary/15 text-primary" : "text-muted-foreground", checked && (item.inLimits ? "yes" : "no") === g && "border-ok text-ok")}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>
          {!checked ? (
            <Button
              size="sm"
              onClick={() => {
                setChecked(true);
                record(all);
              }}
            >
              Check
            </Button>
          ) : (
            <Feedback ok={all} title={item.inLimits ? "Within limits" : "Out of limits"}>
              Total {Math.round(item.weight)} lb, moment {Math.round(item.moment).toLocaleString("en-US")} lb-in, CG {item.cg.toFixed(2)} in. {reason}
            </Feedback>
          )}
        </div>
        <div className="avionics-screen overflow-hidden">
          <Envelope weight={checked ? item.weight : parseLooseNumber(a.weight)} cg={checked ? item.cg : parseLooseNumber(a.cg)} />
        </div>
      </div>
    </ExerciseFrame>
  );
}
