/**
 * Cockpit instrument panel for the simulator. Uses the shared avionics library, so the
 * simulator and the Avionics Lab show identical, engine-driven instruments.
 *
 * Glass aircraft: PFD + MFD. Steam-gauge aircraft: six-pack + nav instruments.
 * A tabbed stack on the right holds the autopilot, radios, GPS and engine gauges.
 */
import { useState } from "react";
import {
  Annunciators,
  AutopilotPanel,
  EngineGauges,
  GpsUnit,
  Hsi,
  Mfd,
  Pfd,
  RadiosPanel,
  SixPack,
  VorIndicator,
} from "@/components/avionics";
import { useSimEngine } from "@/sim/react";
import { cn } from "@/lib/utils";

type StackTab = "ap" | "radios" | "gps" | "engine";

const TAB_LABEL: Record<StackTab, string> = { ap: "Autopilot", radios: "Radios", gps: "GPS", engine: "Engine" };

export function InstrumentPanel() {
  const engine = useSimEngine();
  const glass = engine.perf.avionics !== "steam";
  const [tab, setTab] = useState<StackTab>(glass ? "ap" : "radios");
  const tabs: StackTab[] = ["ap", "radios", "gps", "engine"];

  return (
    <div className="flex h-full shrink-0 gap-2">
      {glass ? (
        <>
          <div className="h-full shrink-0 overflow-hidden" style={{ width: "min(46vh, 410px)" }}>
            <Pfd hideSoftKeys />
          </div>
          <div className="hidden h-full shrink-0 overflow-hidden xl:block" style={{ width: "min(40vh, 360px)" }}>
            <Mfd hideEngineStrip />
          </div>
        </>
      ) : (
        <>
          <div className="h-full shrink-0 overflow-hidden" style={{ width: "min(62vh, 470px)" }}>
            <SixPack showCompass={false} />
          </div>
          <div className="hidden h-full shrink-0 flex-col gap-2 overflow-hidden xl:flex" style={{ width: "min(22vh, 160px)" }}>
            <VorIndicator nav={1} />
            <Hsi />
          </div>
        </>
      )}
      <div className="flex h-full w-[300px] shrink-0 flex-col overflow-hidden rounded border border-white/10 bg-black/30">
        <div className="flex gap-1 border-b border-white/10 p-1">
          {tabs.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn("flex-1 rounded px-2 py-1 text-[10px] font-semibold tracking-wider uppercase", tab === t ? "bg-primary text-primary-foreground" : "text-white/70 hover:bg-white/5")}
            >
              {TAB_LABEL[t]}
            </button>
          ))}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
          {tab === "ap" ? <AutopilotPanel /> : null}
          {tab === "radios" ? <RadiosPanel /> : null}
          {tab === "gps" ? <GpsUnit /> : null}
          {tab === "engine" ? (
            <div className="space-y-2">
              <EngineGauges layout="panel" />
              <Annunciators />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
