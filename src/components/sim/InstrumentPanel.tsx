/**
 * Cockpit instrument panel for the simulator. Uses the shared avionics library so the
 * simulator and the Avionics Lab show identical, engine-driven instruments.
 * (Temporary minimal version — replaced once the avionics library is available.)
 */
import { useSimSnapshot } from "@/sim/react";

export function InstrumentPanel() {
  const s = useSimSnapshot();
  return (
    <div className="flex h-full min-w-[300px] flex-1 items-center justify-center rounded border border-white/10 bg-black/40 font-mono text-xs text-white/70">
      IAS {Math.round(s.indicated.iasKt)} · ALT {Math.round(s.indicated.altFt)} · HDG {Math.round(s.indicated.headingMag)}
    </div>
  );
}
