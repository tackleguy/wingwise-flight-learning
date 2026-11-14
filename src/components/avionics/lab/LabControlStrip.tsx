/**
 * Avionics Lab toolbar: pause, time acceleration, a "Scenario" menu with reposition presets and a
 * "Failures" popover (each failure with its explanation). Kept to one compact row.
 */
import { useState, type ReactNode } from "react";
import { ChevronDown, MapPin, Pause, Play, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { applyPreset, LAB_PRESETS } from "@/lib/avionics/scenarios";
import { cn } from "@/lib/utils";
import { useSimEngine, useSimSelector } from "@/sim/react";
import type { Failures } from "@/sim/types";

export const FAILURE_INFO: {
  key: keyof Failures;
  label: string;
  help: string;
  glassOnly?: boolean;
  steamOnly?: boolean;
}[] = [
  {
    key: "vacuum",
    label: "Vacuum pump",
    help: "Steam gauges: the attitude and heading indicators slowly spin down and tilt — usually with NO warning flag. Cross-check the turn coordinator and altimeter.",
    steamOnly: true,
  },
  {
    key: "ahrs",
    label: "AHRS",
    help: "Glass cockpit: the PFD attitude and heading show red X. Fly the standby attitude indicator and the magnetic compass; the autopilot disconnects.",
    glassOnly: true,
  },
  {
    key: "pitot",
    label: "Pitot blocked",
    help: "Ice blocks the pitot tube and drain: the airspeed indicator behaves like an altimeter (reads higher in a climb, lower in a descent).",
  },
  {
    key: "static",
    label: "Static blocked",
    help: "Static port blocked: the altimeter freezes, the VSI reads zero and the airspeed is wrong. Alternate static (or breaking the VSI glass) is the remedy.",
  },
  {
    key: "alternator",
    label: "Alternator",
    help: "The battery is now the only power source: LOW VOLTS, negative ammeter. Shed electrical load; displays fail when the battery is flat.",
  },
  {
    key: "gps",
    label: "GPS",
    help: "GPS loss of integrity: no position, no magenta guidance. Revert to VOR/DME navigation and tell ATC.",
  },
  {
    key: "radios",
    label: "COM radios",
    help: "Communication radios inoperative. Squawk 7600 and follow lost-communication procedures.",
  },
  {
    key: "engine",
    label: "Engine",
    help: "Engine failure: pitch for best glide speed, pick a field, then troubleshoot (fuel, mixture, mags).",
  },
];

export function LabControlStrip({
  className,
  children,
}: {
  className?: string | undefined;
  /** Extra actions rendered at the end of the toolbar. */
  children?: ReactNode;
}) {
  const engine = useSimEngine();
  const paused = useSimSelector((s) => s.paused);
  const failures = useSimSelector((s) => s.failures);
  const [scale, setScale] = useState(engine.timeScale);
  const glass = engine.perf.avionics !== "steam";
  const available = FAILURE_INFO.filter((f) => !(f.glassOnly && !glass) && !(f.steamOnly && glass));
  const activeCount = available.filter((f) => failures[f.key]).length;

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <Button
        size="sm"
        variant={paused ? "default" : "secondary"}
        onClick={() => engine.togglePause()}
        aria-label={paused ? "Resume simulation" : "Pause simulation"}
      >
        {paused ? <Play /> : <Pause />}
        {paused ? "Resume" : "Pause"}
      </Button>
      <div
        className="flex h-8 overflow-hidden rounded-md border"
        role="radiogroup"
        aria-label="Time acceleration"
      >
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
            className={cn(
              "px-2.5 font-mono text-xs",
              scale === t
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted",
            )}
          >
            ×{t}
          </button>
        ))}
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="outline">
            <MapPin /> Scenario <ChevronDown className="opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-80">
          <DropdownMenuLabel className="text-xs text-muted-foreground">
            Reposition the aircraft
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {LAB_PRESETS.map((p) => (
            <DropdownMenuItem
              key={p.id}
              onSelect={() => applyPreset(engine, p.id)}
              className="flex-col items-start gap-0.5"
            >
              <span className="font-medium">{p.label}</span>
              <span className="text-xs leading-snug text-muted-foreground">{p.description}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <Popover>
        <PopoverTrigger asChild>
          <Button
            size="sm"
            variant="outline"
            className={cn(activeCount > 0 && "border-caution/60 text-caution")}
          >
            <TriangleAlert /> Failures
            {activeCount > 0 ? (
              <span className="rounded bg-caution px-1 font-mono text-[10px] text-black">
                {activeCount}
              </span>
            ) : null}
            <ChevronDown className="opacity-60" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[min(22rem,calc(100vw-2rem))] p-0">
          <div className="flex items-center justify-between border-b px-3 py-2">
            <span className="text-sm font-semibold">Inject a failure</span>
            {activeCount > 0 ? (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs"
                onClick={() => available.forEach((f) => engine.setFailure(f.key, false))}
              >
                Clear all
              </Button>
            ) : null}
          </div>
          <ul className="max-h-[60vh] divide-y overflow-auto">
            {available.map((f) => (
              <li key={f.key}>
                <label className="flex cursor-pointer gap-3 px-3 py-2.5 hover:bg-muted/50">
                  <Switch
                    checked={failures[f.key]}
                    onCheckedChange={(v) => engine.setFailure(f.key, v)}
                    aria-label={`${f.label} failure`}
                    className="mt-0.5 data-[state=checked]:bg-caution"
                  />
                  <span className="min-w-0">
                    <span
                      className={cn("block text-sm font-medium", failures[f.key] && "text-caution")}
                    >
                      {f.label}
                    </span>
                    <span className="block text-xs leading-snug text-muted-foreground">
                      {f.help}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </PopoverContent>
      </Popover>
      {children}
    </div>
  );
}
