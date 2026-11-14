/**
 * Switch panel: master battery/alternator, avionics master, lights, pitot heat, carb heat,
 * fuel selector, throttle & mixture, and the magneto/start key (START → engine.startEngine()).
 */
import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useSimEngine, useSimSnapshot } from "@/sim/react";
import type { Controls } from "@/sim/types";
import { ExplainButton } from "./common";

function Rocker({ label, on, onToggle, tone = "default", title }: { label: string; on: boolean; onToggle: () => void; tone?: "default" | "red"; title?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      title={title ?? label}
      onClick={onToggle}
      className="group flex w-14 flex-col items-center gap-1 focus-visible:outline-none"
    >
      <span
        className={cn(
          "relative flex h-11 w-7 flex-col overflow-hidden rounded-[5px] border border-black shadow-[0_2px_4px_oklch(0_0_0/0.7)] transition group-focus-visible:ring-2 group-focus-visible:ring-primary",
          tone === "red" ? "bg-[oklch(0.42_0.16_27)]" : "bg-[oklch(0.86_0.01_250)]",
        )}
      >
        <span
          className={cn(
            "absolute inset-x-0 h-1/2 transition-all",
            on ? "top-0 bg-gradient-to-b from-black/0 to-black/25" : "top-1/2 bg-gradient-to-b from-black/25 to-black/0",
          )}
        />
        <span className={cn("mt-1 text-center font-mono text-[7px] font-bold", tone === "red" ? "text-white/80" : "text-black/70")}>{on ? "ON" : ""}</span>
        <span className={cn("mt-auto mb-1 text-center font-mono text-[7px] font-bold", tone === "red" ? "text-white/80" : "text-black/70")}>{on ? "" : "OFF"}</span>
      </span>
      <span className={cn("text-center font-mono text-[8.5px] leading-tight font-semibold tracking-wide uppercase", on ? "text-white" : "text-white/50")}>{label}</span>
    </button>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-white/5 bg-[oklch(0.14_0.006_258)] p-2">
      <div className="mb-1.5 font-mono text-[9px] font-bold tracking-[0.18em] text-white/40 uppercase">{title}</div>
      <div className="flex flex-wrap gap-x-1 gap-y-2">{children}</div>
    </div>
  );
}

function Lever({ label, value, onChange, color, help }: { label: string; value: number; onChange: (v: number) => void; color: string; help: string }) {
  return (
    <label className="flex w-full items-center gap-2" title={help}>
      <span className="w-14 shrink-0 font-mono text-[9px] font-bold tracking-wider text-white/60 uppercase">{label}</span>
      <input
        type="range"
        min={0}
        max={100}
        value={Math.round(value * 100)}
        onChange={(e) => onChange(Number(e.target.value) / 100)}
        className="h-2 flex-1 cursor-pointer appearance-none rounded-full bg-black/80 [&::-moz-range-thumb]:size-4 [&::-moz-range-thumb]:rounded-full [&::-webkit-slider-thumb]:size-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full"
        style={{ accentColor: color }}
        aria-label={label}
      />
      <span className="w-9 text-right font-mono text-[10px] text-white/70 tabular">{Math.round(value * 100)}%</span>
    </label>
  );
}

type KeyPos = "OFF" | "R" | "L" | "BOTH" | "START";

export interface SwitchPanelProps {
  className?: string | undefined;
}

export function SwitchPanel({ className }: SwitchPanelProps) {
  const s = useSimSnapshot();
  const engine = useSimEngine();
  const c = s.controls;
  const a = s.aircraft;
  const [mag, setMag] = useState<KeyPos | null>(null);
  const set = (p: Partial<Controls>) => engine.setControls(p);
  const light = (k: keyof Controls["lights"]) => engine.setControls({ lights: { ...engine.getSnapshot().controls.lights, [k]: !engine.getSnapshot().controls.lights[k] } });
  const keyPos: KeyPos = mag ?? (a.engineRunning || a.engineCranking > 0 ? "BOTH" : "OFF");
  const carb = engine.perf.powerType === "piston";
  const pressKey = (p: KeyPos) => {
    if (p === "OFF") {
      engine.stopEngine();
      setMag(null);
    } else if (p === "START") {
      setMag("START");
      engine.startEngine();
      setTimeout(() => setMag(null), 1500);
    } else setMag(p === "BOTH" ? null : p);
  };

  return (
    <div className={cn("relative space-y-2 rounded-xl border border-white/10 bg-bezel p-2.5", className)}>
      <div className="flex items-center justify-between px-0.5">
        <span className="text-[10px] font-semibold tracking-[0.2em] text-white/45 uppercase">Switches · engine controls</span>
        <ExplainButton id="switches" label="Switches" />
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Group title="Electrical">
          <Rocker label="BAT" tone="red" on={c.masterBattery} onToggle={() => set({ masterBattery: !c.masterBattery })} title="Master battery: connects the battery to the electrical bus" />
          <Rocker label="ALT" tone="red" on={c.alternator} onToggle={() => set({ alternator: !c.alternator })} title="Alternator field: charges the battery and powers the bus with the engine running" />
          <Rocker label="AVIONICS" on={c.avionicsMaster} onToggle={() => set({ avionicsMaster: !c.avionicsMaster })} title="Avionics master: powers radios and displays. OFF for engine start." />
          <div className="flex flex-col justify-center pl-1 font-mono text-[9px] leading-tight text-white/55">
            <span>
              BUS <b className={a.busVolts > 25 ? "text-ok" : a.busVolts > 20 ? "text-caution" : "text-warning"}>{a.busVolts.toFixed(1)}V</b>
            </span>
            <span>
              AMP <b className={a.ammeterA < -1 ? "text-caution" : "text-white/80"}>{a.ammeterA.toFixed(0)}A</b>
            </span>
            <span>
              BATT <b className="text-white/80">{a.batteryPct.toFixed(0)}%</b>
            </span>
          </div>
        </Group>
        <Group title="Lights">
          <Rocker label="BCN" on={c.lights.beacon} onToggle={() => light("beacon")} />
          <Rocker label="LAND" on={c.lights.landing} onToggle={() => light("landing")} />
          <Rocker label="TAXI" on={c.lights.taxi} onToggle={() => light("taxi")} />
          <Rocker label="NAV" on={c.lights.nav} onToggle={() => light("nav")} />
          <Rocker label="STROBE" on={c.lights.strobe} onToggle={() => light("strobe")} />
          <Rocker label="PANEL" on={c.lights.panel} onToggle={() => light("panel")} />
        </Group>
        <Group title="Anti-ice">
          <Rocker label="PITOT HEAT" on={c.pitotHeat} onToggle={() => set({ pitotHeat: !c.pitotHeat })} title="Pitot heat: heats the pitot tube to prevent/remove ice. Use in visible moisture near or below freezing." />
          {carb ? <Rocker label="CARB HEAT" on={c.carbHeat} onToggle={() => set({ carbHeat: !c.carbHeat })} title="Carburetor heat: hot air into the carburetor to melt/prevent carb ice. Expect a small RPM drop." /> : null}
        </Group>
        <Group title="Fuel">
          <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Fuel selector">
            {(["off", "left", "right", "both"] as const).map((f) => (
              <button
                key={f}
                type="button"
                role="radio"
                aria-checked={c.fuelSelector === f}
                onClick={() => set({ fuelSelector: f })}
                className={cn(
                  "h-7 rounded border px-2 font-mono text-[10px] font-bold uppercase",
                  c.fuelSelector === f ? (f === "off" ? "border-warning/60 bg-warning/15 text-warning" : "border-ok/50 bg-ok/10 text-ok") : "border-white/10 text-white/55 hover:text-white",
                )}
              >
                {f}
              </button>
            ))}
          </div>
          <div className="w-full font-mono text-[9px] text-white/50">
            L {a.fuelLeftGal.toFixed(1)} · R {a.fuelRightGal.toFixed(1)} gal · {a.fuelFlowGph.toFixed(1)} gph
          </div>
        </Group>
      </div>
      <div className="space-y-1.5 rounded-lg border border-white/5 bg-[oklch(0.14_0.006_258)] p-2">
        <Lever label="Throttle" value={c.throttle} onChange={(v) => set({ throttle: v })} color="#e5e7eb" help="Throttle: engine power. Keyboard + / −." />
        <Lever label="Mixture" value={c.mixture} onChange={(v) => set({ mixture: v })} color="#e0332b" help="Mixture: fuel/air ratio. Full rich for start, takeoff and landing; lean in cruise. Fully back = idle cut-off (engine stops)." />
      </div>
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-white/5 bg-[oklch(0.14_0.006_258)] p-2">
        <span className="font-mono text-[9px] font-bold tracking-[0.18em] text-white/40 uppercase">Magnetos</span>
        <div className="flex gap-1" role="radiogroup" aria-label="Magneto / start key">
          {(["OFF", "R", "L", "BOTH", "START"] as const).map((p) => (
            <button
              key={p}
              type="button"
              role="radio"
              aria-checked={keyPos === p}
              onClick={() => pressKey(p)}
              title={p === "START" ? "Engage the starter (spring-loaded back to BOTH)" : p === "OFF" ? "Magnetos off — stops the engine" : p === "BOTH" ? "Both magnetos (normal)" : `${p} magneto only (run-up check; single-magneto operation is not modelled)`}
              className={cn(
                "h-7 rounded border px-2 font-mono text-[10px] font-bold",
                keyPos === p ? (p === "START" ? "animate-annunciator border-caution bg-caution/20 text-caution" : p === "OFF" ? "border-warning/60 text-warning" : "border-ok/50 bg-ok/10 text-ok") : "border-white/10 text-white/55 hover:text-white",
              )}
            >
              {p}
            </button>
          ))}
        </div>
        <span className="font-mono text-[10px] text-white/55">
          {a.engineCranking > 0 ? <b className="text-caution">CRANKING…</b> : a.engineRunning ? <b className="text-ok">ENGINE RUNNING · {Math.round(a.rpm)} RPM</b> : <b className="text-warning">ENGINE STOPPED</b>}
        </span>
      </div>
    </div>
  );
}
