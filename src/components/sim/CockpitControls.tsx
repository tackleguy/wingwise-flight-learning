import { useRef, useState, type MutableRefObject } from "react";
import { Fuel, Lightbulb, Power, Zap } from "lucide-react";
import { useSimEngine, useSimSnapshot } from "@/sim/react";
import { cn } from "@/lib/utils";

function Toggle({ on, label, onClick, tone = "ok", title }: { on: boolean; label: string; onClick: () => void; tone?: "ok" | "caution"; title?: string }) {
  return (
    <button
      onClick={onClick}
      title={title ?? label}
      className={cn(
        "flex flex-col items-center gap-1 rounded border px-1.5 py-1 text-[10px] font-semibold tracking-wide uppercase transition",
        on ? (tone === "ok" ? "border-ok/50 bg-ok/15 text-ok" : "border-caution/50 bg-caution/15 text-caution") : "border-white/10 text-white/55 hover:bg-white/5",
      )}
    >
      <span className={cn("h-1.5 w-5 rounded-full", on ? (tone === "ok" ? "bg-ok" : "bg-caution") : "bg-white/15")} />
      {label}
    </button>
  );
}

function VLever({ value, onChange, label, color }: { value: number; onChange: (v: number) => void; label: string; color: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const set = (clientY: number) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    onChange(Math.max(0, Math.min(1, 1 - (clientY - r.top) / r.height)));
  };
  return (
    <div className="flex flex-col items-center gap-1">
      <div
        ref={ref}
        role="slider"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(value * 100)}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "ArrowUp") onChange(Math.min(1, value + 0.05));
          if (e.key === "ArrowDown") onChange(Math.max(0, value - 0.05));
        }}
        onPointerDown={(e) => {
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          set(e.clientY);
        }}
        onPointerMove={(e) => {
          if (e.buttons) set(e.clientY);
        }}
        className="relative h-28 w-8 cursor-ns-resize rounded border border-white/10 bg-black/40"
      >
        <div className="absolute inset-x-[14px] top-1 bottom-1 rounded bg-white/10" />
        <div className="absolute inset-x-0.5 h-5 rounded-sm border border-white/30 shadow" style={{ bottom: `calc(${value * 100}% - ${value * 20}px)`, background: color }} />
      </div>
      <span className="text-[9px] font-semibold tracking-wider text-white/60 uppercase">{label}</span>
      <span className="font-mono text-[10px] text-white/80">{Math.round(value * 100)}%</span>
    </div>
  );
}

/** Throttle, mixture, flaps, gear, trim, brakes, engine, electrical, lights, fuel. */
export function CockpitControls() {
  const e = useSimEngine();
  const s = useSimSnapshot();
  const c = s.controls;
  const perf = e.perf;
  const [tab, setTab] = useState<"flight" | "systems">("flight");
  const fuel = s.aircraft.fuelLeftGal + s.aircraft.fuelRightGal;
  return (
    <div className="flex h-full min-w-[300px] shrink-0 flex-col rounded border border-white/10 bg-black/30 p-2 text-white">
      <div className="mb-2 flex gap-1">
        {(["flight", "systems"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={cn("flex-1 rounded px-2 py-1 text-[10px] font-semibold tracking-wider uppercase", tab === t ? "bg-primary text-primary-foreground" : "bg-white/5 text-white/70")}>
            {t === "flight" ? "Flight controls" : "Systems"}
          </button>
        ))}
      </div>
      {tab === "flight" ? (
        <div className="flex min-h-0 flex-1 gap-3 overflow-y-auto">
          <VLever label="Throttle" value={c.throttle} onChange={(v) => e.setControls({ throttle: v })} color="#111" />
          {perf.powerType === "piston" ? <VLever label="Mixture" value={c.mixture} onChange={(v) => e.setControls({ mixture: v })} color="#b91c1c" /> : null}
          <div className="flex flex-col gap-1.5">
            <span className="text-[9px] font-semibold tracking-wider text-white/60 uppercase">Flaps</span>
            {perf.flapDetents.map((d, i) => (
              <button key={d} onClick={() => e.setControls({ flapIndex: i })} className={cn("rounded border px-2 py-0.5 font-mono text-[11px]", c.flapIndex === i ? "border-cyan bg-cyan/15 text-cyan" : "border-white/10 text-white/70 hover:bg-white/5")}>
                {d}°
              </button>
            ))}
            <span className="font-mono text-[10px] text-white/50">actual {Math.round(s.aircraft.flapsDeg)}°</span>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-[9px] font-semibold tracking-wider text-white/60 uppercase">Trim</span>
            <button className="rounded border border-white/10 px-2 py-1 text-[11px] hover:bg-white/5" onClick={() => e.setControls({ trim: c.trim + 0.05 })}>Nose ▲</button>
            <div className="relative mx-auto h-12 w-2 rounded bg-white/10">
              <div className="absolute left-1/2 h-1.5 w-4 -translate-x-1/2 rounded bg-cyan" style={{ bottom: `calc(${(c.trim + 1) * 50}% - 3px)` }} />
            </div>
            <button className="rounded border border-white/10 px-2 py-1 text-[11px] hover:bg-white/5" onClick={() => e.setControls({ trim: c.trim - 0.05 })}>Nose ▼</button>
          </div>
          <div className="flex flex-col gap-1.5">
            {perf.retractableGear ? (
              <button onClick={() => e.setControls({ gearDown: !c.gearDown })} className={cn("rounded border px-2 py-1.5 text-[11px] font-semibold", c.gearDown ? "border-ok/50 text-ok" : "border-white/20 text-white/80")}>
                GEAR {c.gearDown ? "DOWN" : "UP"}
                <span className="block font-mono text-[9px] text-white/50">{s.aircraft.gearPosition > 0.98 ? "3 GREEN" : s.aircraft.gearPosition < 0.02 ? "UP & LOCKED" : "IN TRANSIT"}</span>
              </button>
            ) : (
              <span className="rounded border border-white/10 px-2 py-1.5 text-center text-[10px] text-white/50">Fixed gear</span>
            )}
            <button onPointerDown={() => e.setControls({ brakes: 1 })} onPointerUp={() => e.setControls({ brakes: 0 })} onPointerLeave={() => e.setControls({ brakes: 0 })} className={cn("rounded border px-2 py-1.5 text-[11px] font-semibold", c.brakes > 0 ? "border-caution text-caution" : "border-white/10 text-white/80")}>
              BRAKES (hold)
            </button>
            <Toggle on={c.parkingBrake} label="Park brake" tone="caution" onClick={() => e.setControls({ parkingBrake: !c.parkingBrake })} />
            <div className="grid grid-cols-2 gap-1">
              <button className="rounded border border-white/10 px-1 py-1 text-[10px] hover:bg-white/5" onPointerDown={() => e.setControls({ rudder: -0.8 })} onPointerUp={() => e.setControls({ rudder: 0 })} onPointerLeave={() => e.setControls({ rudder: 0 })}>◀ Rudder</button>
              <button className="rounded border border-white/10 px-1 py-1 text-[10px] hover:bg-white/5" onPointerDown={() => e.setControls({ rudder: 0.8 })} onPointerUp={() => e.setControls({ rudder: 0 })} onPointerLeave={() => e.setControls({ rudder: 0 })}>Rudder ▶</button>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-4 content-start gap-1.5 overflow-y-auto">
          <Toggle on={c.masterBattery} label="Battery" onClick={() => e.setControls({ masterBattery: !c.masterBattery })} />
          <Toggle on={c.alternator} label="Alt" onClick={() => e.setControls({ alternator: !c.alternator })} />
          <Toggle on={c.avionicsMaster} label="Avionics" onClick={() => e.setControls({ avionicsMaster: !c.avionicsMaster })} />
          <button
            onClick={() => (s.aircraft.engineRunning ? e.stopEngine() : e.startEngine())}
            className={cn("flex flex-col items-center gap-1 rounded border px-1.5 py-1 text-[10px] font-semibold uppercase", s.aircraft.engineRunning ? "border-ok/50 text-ok" : s.aircraft.engineCranking > 0 ? "border-caution text-caution" : "border-white/20 text-white")}
          >
            <Power className="size-3.5" /> {s.aircraft.engineRunning ? "Engine stop" : s.aircraft.engineCranking > 0 ? "Cranking" : "Start"}
          </button>
          <Toggle on={c.lights.nav} label="Nav" onClick={() => e.setControls({ lights: { ...c.lights, nav: !c.lights.nav } })} />
          <Toggle on={c.lights.beacon} label="Beacon" onClick={() => e.setControls({ lights: { ...c.lights, beacon: !c.lights.beacon } })} />
          <Toggle on={c.lights.strobe} label="Strobe" onClick={() => e.setControls({ lights: { ...c.lights, strobe: !c.lights.strobe } })} />
          <Toggle on={c.lights.landing} label="Landing" onClick={() => e.setControls({ lights: { ...c.lights, landing: !c.lights.landing } })} />
          <Toggle on={c.lights.taxi} label="Taxi" onClick={() => e.setControls({ lights: { ...c.lights, taxi: !c.lights.taxi } })} />
          <Toggle on={c.pitotHeat} label="Pitot ht" onClick={() => e.setControls({ pitotHeat: !c.pitotHeat })} />
          {perf.powerType === "piston" ? <Toggle on={c.carbHeat} label="Carb ht" tone="caution" onClick={() => e.setControls({ carbHeat: !c.carbHeat })} /> : null}
          <div className="col-span-4 mt-1 rounded border border-white/10 p-1.5">
            <div className="mb-1 flex items-center gap-1 text-[9px] font-semibold tracking-wider text-white/60 uppercase"><Fuel className="size-3" /> Fuel selector · {fuel.toFixed(1)} gal</div>
            <div className="grid grid-cols-4 gap-1">
              {(["left", "both", "right", "off"] as const).map((f) => (
                <button key={f} onClick={() => e.setControls({ fuelSelector: f })} className={cn("rounded border px-1 py-1 text-[10px] uppercase", c.fuelSelector === f ? (f === "off" ? "border-warning text-warning" : "border-cyan text-cyan") : "border-white/10 text-white/60")}>
                  {f}
                </button>
              ))}
            </div>
            <div className="mt-1 flex justify-between font-mono text-[10px] text-white/60">
              <span>L {s.aircraft.fuelLeftGal.toFixed(1)}</span>
              <span>{s.aircraft.fuelFlowGph.toFixed(1)} gph</span>
              <span>R {s.aircraft.fuelRightGal.toFixed(1)}</span>
            </div>
          </div>
          <div className="col-span-4 flex justify-between rounded border border-white/10 p-1.5 font-mono text-[10px] text-white/70">
            <span className="inline-flex items-center gap-1"><Zap className="size-3" /> {s.aircraft.busVolts.toFixed(1)} V</span>
            <span>{s.aircraft.ammeterA >= 0 ? "+" : ""}{s.aircraft.ammeterA.toFixed(0)} A</span>
            <span>BATT {Math.round(s.aircraft.batteryPct)}%</span>
            <span className="inline-flex items-center gap-1"><Lightbulb className="size-3" /> {s.controls.lights.landing ? "LDG" : "—"}</span>
          </div>
        </div>
      )}
    </div>
  );
}

/** Touch/mouse yoke: drag inside the pad. Up = push (nose down), down = pull (nose up). */
export function VirtualYoke({ virtual, className }: { virtual: MutableRefObject<{ x: number; y: number; active: boolean }>; className?: string }) {
  const pad = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const update = (cx: number, cy: number) => {
    const r = pad.current?.getBoundingClientRect();
    if (!r) return;
    const x = Math.max(-1, Math.min(1, ((cx - r.left) / r.width) * 2 - 1));
    const y = Math.max(-1, Math.min(1, ((cy - r.top) / r.height) * 2 - 1));
    virtual.current = { x, y, active: true };
    setPos({ x, y });
  };
  const release = () => {
    virtual.current = { x: 0, y: 0, active: false };
    setPos({ x: 0, y: 0 });
  };
  return (
    <div className={cn("flex flex-col items-center gap-1", className)}>
      <div
        ref={pad}
        onPointerDown={(e) => {
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          update(e.clientX, e.clientY);
        }}
        onPointerMove={(e) => {
          if (e.buttons) update(e.clientX, e.clientY);
        }}
        onPointerUp={release}
        onPointerCancel={release}
        className="relative size-28 cursor-grab touch-none rounded-full border border-white/15 bg-black/50 backdrop-blur"
        aria-label="On-screen yoke: drag to pitch and roll"
      >
        <div className="absolute inset-x-0 top-1/2 h-px bg-white/15" />
        <div className="absolute inset-y-0 left-1/2 w-px bg-white/15" />
        <div className="absolute size-7 rounded-full border-2 border-cyan bg-cyan/20" style={{ left: `calc(${(pos.x + 1) * 50}% - 14px)`, top: `calc(${(pos.y + 1) * 50}% - 14px)` }} />
      </div>
      <span className="text-[9px] font-semibold tracking-wider text-white/60 uppercase">Yoke · drag</span>
    </div>
  );
}
