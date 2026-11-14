/**
 * E6B-style flight computer: time–speed–distance, wind triangle, fuel, density altitude,
 * true airspeed and conversions. Educational calculations (standard-atmosphere approximations).
 */
import { useState, type ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { norm360, windComponents, windTriangle } from "@/lib/geo";
import { cn } from "@/lib/utils";

function N({
  label,
  value,
  set,
  unit,
  step = 1,
}: {
  label: string;
  value: string;
  set: (v: string) => void;
  unit?: string;
  step?: number;
}) {
  return (
    <label className="text-xs">
      <span className="label-caps mb-1 block">{label}</span>
      <div className="flex items-center gap-1">
        <Input
          type="number"
          inputMode="decimal"
          step={step}
          value={value}
          onChange={(e) => set(e.target.value)}
          className="h-8 font-mono"
        />
        {unit ? <span className="w-10 shrink-0 text-muted-foreground">{unit}</span> : null}
      </div>
    </label>
  );
}

function Out({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: "ok" | "warning" | undefined;
}) {
  return (
    <div className="rounded border bg-panel px-3 py-2">
      <div className="label-caps">{label}</div>
      <div
        className={cn(
          "font-mono text-lg font-semibold text-cyan tabular",
          tone === "warning" && "text-warning",
          tone === "ok" && "text-ok",
        )}
      >
        {value}
      </div>
      {sub ? <div className="text-[11px] text-muted-foreground">{sub}</div> : null}
    </div>
  );
}

const num = (s: string) => (s.trim() === "" ? NaN : Number(s));
const f0 = (v: number) => (Number.isFinite(v) ? Math.round(v).toLocaleString() : "—");
const f1 = (v: number) => (Number.isFinite(v) ? v.toFixed(1) : "—");
const hdg = (v: number) =>
  Number.isFinite(v) ? String(Math.round(norm360(v)) || 360).padStart(3, "0") + "°" : "—";
const hm = (min: number) =>
  Number.isFinite(min) && min >= 0
    ? `${Math.floor(min / 60)}:${String(Math.round(min % 60)).padStart(2, "0")}`
    : "—";

const TABS = ["TSD", "Wind", "Fuel", "Density alt", "TAS", "Convert"] as const;
type Tab = (typeof TABS)[number];

export function E6B() {
  const [tab, setTab] = useState<Tab>("TSD");
  return (
    <div className="panel overflow-hidden">
      <div
        className="flex flex-wrap gap-1 border-b bg-muted/30 p-1.5"
        role="tablist"
        aria-label="E6B functions"
      >
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={cn(
              "rounded px-2.5 py-1 text-xs font-semibold",
              tab === t
                ? "bg-primary/15 text-primary"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t}
          </button>
        ))}
      </div>
      <div className="p-4">
        {tab === "TSD" ? <Tsd /> : null}
        {tab === "Wind" ? <WindCalc /> : null}
        {tab === "Fuel" ? <FuelCalc /> : null}
        {tab === "Density alt" ? <DensityAlt /> : null}
        {tab === "TAS" ? <TasCalc /> : null}
        {tab === "Convert" ? <Convert /> : null}
      </div>
    </div>
  );
}

function Tsd() {
  const [solve, setSolve] = useState<"time" | "speed" | "dist">("time");
  const [d, setD] = useState("62");
  const [s, setS] = useState("115");
  const [t, setT] = useState("32");
  const D = num(d);
  const S = num(s);
  const T = num(t);
  const res = solve === "time" ? (D / S) * 60 : solve === "speed" ? D / (T / 60) : S * (T / 60);
  return (
    <div className="space-y-3">
      <div className="flex gap-1 text-xs">
        <span className="label-caps self-center pr-1">Solve for</span>
        {(["time", "speed", "dist"] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setSolve(k)}
            className={cn(
              "rounded border px-2 py-0.5",
              solve === k
                ? "border-primary/50 bg-primary/15 text-primary"
                : "text-muted-foreground",
            )}
          >
            {k === "dist" ? "distance" : k}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {solve !== "dist" ? <N label="Distance" value={d} set={setD} unit="nm" /> : null}
        {solve !== "speed" ? <N label="Groundspeed" value={s} set={setS} unit="kt" /> : null}
        {solve !== "time" ? <N label="Time" value={t} set={setT} unit="min" /> : null}
      </div>
      <Out
        label={solve === "time" ? "Time en route" : solve === "speed" ? "Groundspeed" : "Distance"}
        value={
          solve === "time"
            ? `${hm(res)} (${f0(res)} min)`
            : solve === "speed"
              ? `${f0(res)} kt`
              : `${f1(res)} nm`
        }
        sub="Distance = speed × time. Mental math: at 120 kt you cover 2 nm per minute."
      />
    </div>
  );
}

function WindCalc() {
  const [tc, setTc] = useState("150");
  const [tas, setTas] = useState("115");
  const [wd, setWd] = useState("240");
  const [ws, setWs] = useState("20");
  const [rwy, setRwy] = useState("190");
  const r = windTriangle(num(tc), num(tas), num(wd), num(ws));
  const comp = windComponents(num(rwy), num(wd), num(ws));
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <N label="True course" value={tc} set={setTc} unit="°T" />
        <N label="TAS" value={tas} set={setTas} unit="kt" />
        <N label="Wind from" value={wd} set={setWd} unit="°T" />
        <N label="Wind speed" value={ws} set={setWs} unit="kt" />
      </div>
      {Number.isFinite(r.groundspeed) ? (
        <div className="grid grid-cols-3 gap-2">
          <Out
            label="WCA"
            value={`${r.wca >= 0 ? "+" : ""}${f0(r.wca)}°`}
            sub={r.wca >= 0 ? "right" : "left"}
          />
          <Out label="True heading" value={hdg(r.heading)} />
          <Out label="Groundspeed" value={`${f0(r.groundspeed)} kt`} />
        </div>
      ) : (
        <p className="text-sm text-warning">
          Wind speed exceeds what the airplane can correct for at this TAS — no solution.
        </p>
      )}
      <div className="border-t pt-3">
        <p className="label-caps mb-2">Runway wind components (same wind)</p>
        <div className="grid grid-cols-3 gap-2">
          <N label="Runway heading" value={rwy} set={setRwy} unit="°" />
          <Out
            label={comp.headwind >= 0 ? "Headwind" : "Tailwind"}
            value={`${f0(Math.abs(comp.headwind))} kt`}
            tone={comp.headwind < 0 ? "warning" : undefined}
          />
          <Out
            label="Crosswind"
            value={`${f0(Math.abs(comp.crosswind))} kt`}
            sub={comp.crosswind >= 0 ? "from the right" : "from the left"}
          />
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Use the same reference for wind and runway (both magnetic for ATIS/tower winds, or both
          true).
        </p>
      </div>
    </div>
  );
}

function FuelCalc() {
  const [burn, setBurn] = useState("9");
  const [time, setTime] = useState("75");
  const [fuel, setFuel] = useState("40");
  const [dist, setDist] = useState("120");
  const [gs, setGs] = useState("110");
  const B = num(burn);
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <N label="Fuel burn" value={burn} set={setBurn} unit="gph" step={0.1} />
        <N label="Flight time" value={time} set={setTime} unit="min" />
        <N label="Fuel on board" value={fuel} set={setFuel} unit="gal" />
        <N label="Distance" value={dist} set={setDist} unit="nm" />
        <N label="Groundspeed" value={gs} set={setGs} unit="kt" />
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Out label="Fuel for time" value={`${f1((B * num(time)) / 60)} gal`} />
        <Out label="Endurance" value={hm((num(fuel) / B) * 60)} sub="h:mm, no reserve" />
        <Out
          label="Fuel for distance"
          value={`${f1((num(dist) / num(gs)) * B)} gal`}
          sub={`ETE ${hm((num(dist) / num(gs)) * 60)}`}
        />
        <Out
          label="Range (30-min reserve)"
          value={`${f0((num(fuel) / B - 0.5) * num(gs))} nm`}
          sub="VFR day reserve"
        />
      </div>
      <p className="text-[11px] text-muted-foreground">
        Avgas weighs ≈ 6 lb/gal; Jet-A ≈ 6.7 lb/gal.{" "}
        {Number.isFinite(num(fuel)) ? `${num(fuel)} gal of 100LL ≈ ${f0(num(fuel) * 6)} lb.` : ""}
      </p>
    </div>
  );
}

function pressureAlt(elev: number, altim: number) {
  return elev + (29.92 - altim) * 1000;
}

function DensityAlt() {
  const [elev, setElev] = useState("5045");
  const [alt, setAlt] = useState("30.01");
  const [oat, setOat] = useState("32");
  const pa = pressureAlt(num(elev), num(alt));
  const isa = 15 - 2 * (pa / 1000);
  const da = pa + 120 * (num(oat) - isa);
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-3">
        <N label="Field elevation" value={elev} set={setElev} unit="ft" />
        <N label="Altimeter" value={alt} set={setAlt} unit="inHg" step={0.01} />
        <N label="OAT" value={oat} set={setOat} unit="°C" />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Out
          label="Pressure altitude"
          value={`${f0(pa)} ft`}
          sub="Elev + (29.92 − altimeter) × 1,000"
        />
        <Out label="ISA temperature" value={`${f1(isa)}°C`} sub="15 °C − 2 °C per 1,000 ft" />
        <Out
          label="Density altitude"
          value={`${f0(da)} ft`}
          sub="PA + 120 × (OAT − ISA)"
          tone={da > 5000 ? "warning" : undefined}
        />
      </div>
      <p className="text-[11px] text-muted-foreground">
        High density altitude means longer takeoff rolls, reduced climb rate and higher true
        airspeed for the same indicated airspeed. Always use the POH performance charts.
      </p>
    </div>
  );
}

function TasCalc() {
  const [cas, setCas] = useState("110");
  const [pa, setPa] = useState("7500");
  const [oat, setOat] = useState("5");
  const P = num(pa);
  const sigma = Math.pow(1 - 6.8756e-6 * P, 5.2559) / ((num(oat) + 273.15) / 288.15);
  const tas = num(cas) / Math.sqrt(sigma);
  const thumb = num(cas) * (1 + 0.02 * (P / 1000));
  const daFt = (1 - Math.pow(sigma, 0.235)) / 6.8756e-6;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-3">
        <N label="CAS (≈ IAS)" value={cas} set={setCas} unit="kt" />
        <N label="Pressure altitude" value={pa} set={setPa} unit="ft" step={500} />
        <N label="OAT" value={oat} set={setOat} unit="°C" />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Out label="True airspeed" value={`${f0(tas)} kt`} sub="TAS = CAS ÷ √(density ratio)" />
        <Out label="Rule of thumb" value={`${f0(thumb)} kt`} sub="+2% per 1,000 ft" />
        <Out label="Density altitude" value={`${f0(daFt)} ft`} />
      </div>
      <p className="text-[11px] text-muted-foreground">
        Incompressible approximation, valid for light-aircraft speeds. Instrument and position
        errors (IAS→CAS) come from the POH airspeed calibration table.
      </p>
    </div>
  );
}

function Convert() {
  const [nm, setNm] = useState("10");
  const [c, setC] = useState("15");
  const [tru, setTru] = useState("090");
  const [vari, setVari] = useState("13");
  const [ew, setEw] = useState<"E" | "W">("E");
  const v = num(vari) * (ew === "E" ? 1 : -1);
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <div className="space-y-2">
        <N label="Nautical miles" value={nm} set={setNm} unit="nm" />
        <p className="font-mono text-sm">
          = {f1(num(nm) * 1.15078)} SM
          <br />= {f1(num(nm) * 1.852)} km
        </p>
      </div>
      <div className="space-y-2">
        <N label="Temperature" value={c} set={setC} unit="°C" />
        <p className="font-mono text-sm">= {f0((num(c) * 9) / 5 + 32)} °F</p>
      </div>
      <div className="space-y-2">
        <N label="True course" value={tru} set={setTru} unit="°T" />
        <div className="flex items-end gap-2">
          <N label="Variation" value={vari} set={setVari} unit="°" />
          <div className="flex gap-1 pb-1">
            {(["E", "W"] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setEw(k)}
                className={cn(
                  "rounded border px-2 py-0.5 text-xs",
                  ew === k
                    ? "border-primary/50 bg-primary/15 text-primary"
                    : "text-muted-foreground",
                )}
              >
                {k}
              </button>
            ))}
          </div>
        </div>
        <p className="font-mono text-sm">= {hdg(num(tru) - v)} magnetic</p>
        <p className="text-[11px] text-muted-foreground">
          "East is least, west is best": subtract easterly variation, add westerly.
        </p>
      </div>
    </div>
  );
}
