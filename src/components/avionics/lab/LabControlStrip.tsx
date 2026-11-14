/**
 * Avionics Lab control strip: pause, time acceleration, reposition presets and failure injection.
 */
import { useState } from "react";
import { MapPin, Pause, Play, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { applyPreset, LAB_PRESETS } from "@/lib/avionics/scenarios";
import { cn } from "@/lib/utils";
import { useSimEngine, useSimSelector } from "@/sim/react";
import type { Failures } from "@/sim/types";

export const FAILURE_INFO: { key: keyof Failures; label: string; help: string; glassOnly?: boolean; steamOnly?: boolean }[] = [
  { key: "vacuum", label: "Vacuum pump", help: "Steam gauges: the attitude and heading indicators slowly spin down and tilt — usually with NO warning flag. Cross-check the turn coordinator and altimeter.", steamOnly: true },
  { key: "ahrs", label: "AHRS", help: "Glass cockpit: the PFD attitude and heading show red X. Fly the standby attitude indicator and the magnetic compass; the autopilot disconnects.", glassOnly: true },
  { key: "pitot", label: "Pitot blocked", help: "Ice blocks the pitot tube and drain: the airspeed indicator behaves like an altimeter (reads higher in a climb, lower in a descent)." },
  { key: "static", label: "Static blocked", help: "Static port blocked: the altimeter freezes, the VSI reads zero and the airspeed is wrong. Alternate static (or breaking the VSI glass) is the remedy." },
  { key: "alternator", label: "Alternator", help: "The battery is now the only power source: LOW VOLTS, negative ammeter. Shed electrical load; displays fail when the battery is flat." },
  { key: "gps", label: "GPS", help: "GPS loss of integrity: no position, no magenta guidance. Revert to VOR/DME navigation and tell ATC." },
  { key: "radios", label: "COM radios", help: "Communication radios inoperative. Squawk 7600 and follow lost-communication procedures." },
  { key: "engine", label: "Engine", help: "Engine failure: pitch for best glide speed, pick a field, then troubleshoot (fuel, mixture, mags)." },
];

export function LabControlStrip({ className }: { className?: string | undefined }) {
  const engine = useSimEngine();
  const paused = useSimSelector((s) => s.paused);
  const failures = useSimSelector((s) => s.failures);
  const [scale, setScale] = useState(engine.timeScale);
  const glass = engine.perf.avionics !== "steam";
  const anyFailure = Object.values(failures).some(Boolean);

  return (
    <TooltipProvider delayDuration={250}>
      <div className={cn("panel flex flex-col gap-3 p-3 lg:flex-row lg:items-start", className)}>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant={paused ? "default" : "secondary"} onClick={() => engine.togglePause()} aria-label={paused ? "Resume simulation" : "Pause simulation"}>
            {paused ? <Play /> : <Pause />}
            {paused ? "Resume" : "Pause"}
          </Button>
          <div className="flex overflow-hidden rounded-md border" role="radiogroup" aria-label="Time acceleration">
            {[1, 2, 4].map((t) => (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={scale === t}
                onClick={() => {
                  engine.timeScale = t;
                  setScale(t);
                }}
                className={cn("px-2.5 py-1 font-mono text-xs", scale === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}
              >
                ×{t}
              </button>
            ))}
          </div>
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <span className="label-caps flex items-center gap-1.5">
            <MapPin className="size-3" /> Reposition
          </span>
          <div className="flex flex-wrap gap-1.5">
            {LAB_PRESETS.map((p) => (
              <Tooltip key={p.id}>
                <TooltipTrigger asChild>
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => applyPreset(engine, p.id)}>
                    {p.label}
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="max-w-64 bg-popover text-popover-foreground ring-1 ring-border">{p.description}</TooltipContent>
              </Tooltip>
            ))}
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-1.5 lg:max-w-[46%]">
          <span className="label-caps flex items-center gap-1.5">
            <TriangleAlert className={cn("size-3", anyFailure && "text-caution")} /> Failures
          </span>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1 sm:grid-cols-4">
            {FAILURE_INFO.filter((f) => !(f.glassOnly && !glass) && !(f.steamOnly && glass)).map((f) => (
              <Tooltip key={f.key}>
                <TooltipTrigger asChild>
                  <label className={cn("flex cursor-pointer items-center gap-1.5 rounded px-1 py-0.5 text-xs", failures[f.key] ? "text-caution" : "text-muted-foreground hover:text-foreground")}>
                    <Switch checked={failures[f.key]} onCheckedChange={(v) => engine.setFailure(f.key, v)} aria-label={`${f.label} failure`} className="data-[state=checked]:bg-caution" />
                    {f.label}
                  </label>
                </TooltipTrigger>
                <TooltipContent className="max-w-72 bg-popover text-popover-foreground ring-1 ring-border">
                  <p className="font-semibold">{f.label} failure</p>
                  <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{f.help}</p>
                </TooltipContent>
              </Tooltip>
            ))}
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
