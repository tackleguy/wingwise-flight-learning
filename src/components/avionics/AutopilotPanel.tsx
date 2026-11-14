/**
 * Autopilot / flight director controller: AP, FD, YD, HDG, NAV, APR, ALT, VS, FLC, nose UP/DN,
 * HDG / ALT / CRS knobs and a mode display (active green, armed white, AP DISCONNECT flashing).
 */
import type { ReactNode } from "react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { pad3 } from "@/sim/avionics-helpers";
import { useSimEngine, useSimSnapshot } from "@/sim/react";
import { ExplainButton } from "./common";
import { stepAltBug, stepCourse, stepHeadingBug, syncCourse, syncHeadingBug } from "./controls";
import { Knob } from "./Knob";
import { lateralArmedLabel, lateralLabel, verticalTarget } from "./Pfd";

type Lit = "active" | "armed" | null;

export const AP_HELP: Record<string, string> = {
  AP: "Autopilot: engages the servos so the aircraft flies the flight-director commands. Press again to disconnect. A strong control input also disconnects it.",
  FD: "Flight director: shows magenta command bars on the PFD for the selected modes. With AP off you can hand-fly the bars.",
  YD: "Yaw damper: uses the rudder to damp yaw oscillations and keep the slip indicator centred.",
  HDG: "Heading mode: turns to and holds the cyan heading bug, limited to about a standard-rate bank.",
  NAV: "Navigation mode: arms (white) then captures and tracks the course from the CDI source — GPS magenta line, VOR radial or localizer. While armed, the AP flies the heading bug to intercept.",
  APR: "Approach mode: arms lateral approach capture (LOC or GPS) and vertical capture (glideslope or GPS glidepath) for an ILS or RNAV approach.",
  ALT: "Altitude hold: holds the altitude at the moment you press it. 'ALTS' armed (white) means the AP will level off at the cyan selected altitude.",
  VS: "Vertical speed: climbs/descends at the selected rate (UP/DN changes it by 100 fpm). Set the selected altitude first so ALTS captures it.",
  FLC: "Flight level change: holds the selected airspeed by pitching; power decides climb or descent. Climb power + FLC = efficient climb without overspeed or stall.",
  UP: "Nose UP: VS +100 fpm, FLC −1 kt (nose up = slower), pitch +0.5°, or ALT hold +10 ft.",
  DN: "Nose DN: VS −100 fpm, FLC +1 kt, pitch −0.5°, or ALT hold −10 ft.",
};

function ApButton({
  label,
  lit,
  onClick,
  help,
  wide,
}: {
  label: string;
  lit: Lit;
  onClick: () => void;
  help: string;
  wide?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          aria-pressed={lit === "active"}
          aria-label={`${label}${lit === "active" ? " (active)" : lit === "armed" ? " (armed)" : ""}`}
          className={cn(
            "group relative flex h-12 flex-col items-center justify-end rounded-md border border-white/10 bg-gradient-to-b from-[oklch(0.3_0.006_258)] to-[oklch(0.19_0.006_258)] pb-1.5 font-mono text-[11px] font-bold tracking-wider text-white/80 shadow-[inset_0_1px_0_oklch(1_0_0/0.12),0_2px_4px_oklch(0_0_0/0.6)] transition select-none hover:text-white active:translate-y-px active:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
            wide ? "col-span-2" : "",
          )}
        >
          <span
            className={cn(
              "absolute top-1.5 h-1 w-7 rounded-full transition",
              lit === "active"
                ? "bg-ok shadow-[0_0_8px_var(--ok)]"
                : lit === "armed"
                  ? "bg-white shadow-[0_0_6px_white]"
                  : "bg-black/60",
            )}
          />
          {label}
        </button>
      </TooltipTrigger>
      <TooltipContent
        side="top"
        className="max-w-64 bg-popover text-popover-foreground ring-1 ring-border"
      >
        <p className="font-semibold">{label}</p>
        <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{help}</p>
      </TooltipContent>
    </Tooltip>
  );
}

function ModeDisplay({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-[auto_1fr_auto_1fr_auto] items-center gap-x-2 rounded-md border border-black bg-black px-2 py-1.5 font-mono text-[12px] shadow-[inset_0_0_0_1px_oklch(1_0_0/0.05)]">
      {children}
    </div>
  );
}

export interface AutopilotPanelProps {
  className?: string | undefined;
}

export function AutopilotPanel({ className }: AutopilotPanelProps) {
  const s = useSimSnapshot();
  const engine = useSimEngine();
  const ap = s.ap;
  const r = s.radios;
  const on = ap.fd || ap.engaged;
  const disc = !ap.engaged && ap.annunciation.includes("DISCONNECT");
  const lat = on ? lateralLabel(ap, s.nav) : "";
  const latArm = on ? lateralArmedLabel(ap, s.nav) : "";
  const vert = on
    ? ap.vertical === "GS"
      ? s.nav.hsi.source === "GPS"
        ? "GP"
        : "GS"
      : ap.vertical
    : "";
  const vArm = on
    ? ap.verticalArmed === "GS"
      ? s.nav.hsi.source === "GPS"
        ? "GP"
        : "GS"
      : (ap.verticalArmed ?? "")
    : "";
  const tgt = on ? verticalTarget(ap, r) : "";
  const gpsCrs = r.cdiSource === "GPS";

  return (
    <TooltipProvider delayDuration={350}>
      <div
        className={cn(
          "relative rounded-xl border border-white/10 bg-bezel p-2.5 shadow-[inset_0_1px_0_oklch(1_0_0/0.06)]",
          className,
        )}
      >
        <div className="mb-2 flex items-center justify-between px-0.5">
          <span className="text-[10px] font-semibold tracking-[0.2em] text-white/45 uppercase">
            Autopilot · Flight director
          </span>
          <ExplainButton id="autopilot" label="Autopilot" />
        </div>

        <ModeDisplay>
          <span
            className={cn(
              "font-bold",
              disc ? "animate-annunciator text-caution" : ap.engaged ? "text-ok" : "text-white/20",
            )}
          >
            AP
          </span>
          <span className="flex gap-2">
            <span className="font-bold text-ok">{lat}</span>
            <span className="text-white">{latArm}</span>
          </span>
          <span className={cn("font-bold", ap.yd ? "text-ok" : "text-white/20")}>YD</span>
          <span className="flex gap-2">
            <span className="font-bold text-ok">{vert}</span>
            <span className="text-ok/90">{ap.vertical === "ALT" ? "" : tgt}</span>
            <span className="text-white">{vArm}</span>
          </span>
          <span className={cn("font-bold", ap.fd ? "text-ok" : "text-white/20")}>FD</span>
        </ModeDisplay>
        {disc ? (
          <div
            className="animate-annunciator mt-1.5 rounded border border-caution bg-caution/15 py-1 text-center font-mono text-[11px] font-bold tracking-widest text-caution"
            role="alert"
          >
            {ap.annunciation || "AP DISCONNECT"}
          </div>
        ) : null}

        <div className="mt-2 grid grid-cols-3 gap-1.5 font-mono text-[10px] text-white/60">
          <div className="rounded bg-black px-1.5 py-1">
            HDG <span className="text-cyan tabular">{pad3(r.hdgBug)}°</span>
          </div>
          <div className="rounded bg-black px-1.5 py-1">
            ALT <span className="text-cyan tabular">{r.altBug}</span>
          </div>
          <div className="rounded bg-black px-1.5 py-1">
            {ap.vertical === "FLC" ? (
              <>
                IAS <span className="text-cyan tabular">{r.iasBug}</span>
              </>
            ) : (
              <>
                VS <span className="text-cyan tabular">{r.vsBug}</span>
              </>
            )}
          </div>
        </div>

        <div className="mt-2 grid grid-cols-6 gap-1.5">
          <ApButton
            label="AP"
            lit={ap.engaged ? "active" : null}
            onClick={() => engine.apToggle()}
            help={AP_HELP["AP"]!}
          />
          <ApButton
            label="FD"
            lit={ap.fd ? "active" : null}
            onClick={() => engine.fdToggle()}
            help={AP_HELP["FD"]!}
          />
          <ApButton
            label="YD"
            lit={ap.yd ? "active" : null}
            onClick={() => engine.yawDamperToggle()}
            help={AP_HELP["YD"]!}
          />
          <ApButton
            label="HDG"
            lit={on && ap.lateral === "HDG" ? "active" : null}
            onClick={() => engine.apLateral("HDG")}
            help={AP_HELP["HDG"]!}
          />
          <ApButton
            label="NAV"
            lit={
              on && ap.lateral === "NAV"
                ? "active"
                : on && ap.lateralArmed === "NAV"
                  ? "armed"
                  : null
            }
            onClick={() => engine.apLateral("NAV")}
            help={AP_HELP["NAV"]!}
          />
          <ApButton
            label="APR"
            lit={
              on && ap.lateral === "APR"
                ? "active"
                : on && ap.lateralArmed === "LOC"
                  ? "armed"
                  : null
            }
            onClick={() => engine.apLateral("APR")}
            help={AP_HELP["APR"]!}
          />
          <ApButton
            label="ALT"
            lit={
              on && ap.vertical === "ALT"
                ? "active"
                : on && ap.verticalArmed === "ALTS"
                  ? "armed"
                  : null
            }
            onClick={() => engine.apVertical("ALT")}
            help={AP_HELP["ALT"]!}
          />
          <ApButton
            label="VS"
            lit={on && ap.vertical === "VS" ? "active" : null}
            onClick={() => engine.apVertical("VS")}
            help={AP_HELP["VS"]!}
          />
          <ApButton
            label="FLC"
            lit={on && ap.vertical === "FLC" ? "active" : null}
            onClick={() => engine.apVertical("FLC")}
            help={AP_HELP["FLC"]!}
          />
          <ApButton
            label="▲ UP"
            lit={null}
            onClick={() => engine.apWheel(1)}
            help={AP_HELP["UP"]!}
          />
          <ApButton
            label="▼ DN"
            lit={null}
            onClick={() => engine.apWheel(-1)}
            help={AP_HELP["DN"]!}
          />
          <ApButton
            label="SYNC"
            lit={null}
            onClick={() => syncHeadingBug(engine)}
            help="Heading SYNC: sets the heading bug to the current heading (same as pushing the HDG knob)."
          />
        </div>

        <div className="mt-3 flex items-end justify-around gap-2">
          <Knob
            label="HDG"
            caption="HDG · push sync"
            valueNow={r.hdgBug}
            valueMin={0}
            valueMax={359}
            valueText={`Heading bug ${pad3(r.hdgBug)}`}
            onStep={(d, big) => stepHeadingBug(engine, d, big)}
            onPush={() => syncHeadingBug(engine)}
          />
          <Knob
            label="ALT select, thousands (outer)"
            caption="ALT · 1000/100"
            valueNow={r.altBug}
            valueMin={0}
            valueMax={45000}
            valueText={`Selected altitude ${r.altBug} feet`}
            onStep={(d) => stepAltBug(engine, d, true)}
            inner={{
              label: "ALT select, hundreds (inner)",
              valueNow: r.altBug,
              valueText: `Selected altitude ${r.altBug} feet`,
              onStep: (d) => stepAltBug(engine, d, false),
            }}
          />
          <Knob
            label="CRS"
            caption={gpsCrs ? "CRS · GPS auto" : "CRS · push ctr"}
            valueNow={Math.round(s.nav.hsi.course)}
            valueMin={0}
            valueMax={359}
            valueText={
              gpsCrs ? "GPS course is set by the flight plan" : `Course ${pad3(s.nav.hsi.course)}`
            }
            onStep={(d, big) => stepCourse(engine, d, big)}
            onPush={() => syncCourse(engine)}
          />
        </div>
      </div>
    </TooltipProvider>
  );
}
