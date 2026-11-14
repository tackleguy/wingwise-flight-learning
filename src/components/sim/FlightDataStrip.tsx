import { useSimSnapshot } from "@/sim/react";
import { cn } from "@/lib/utils";

function Cell({ label, value, unit, tone }: { label: string; value: string; unit?: string; tone?: "ok" | "caution" | "warning" | undefined }) {
  return (
    <div className="flex min-w-[64px] flex-col items-center px-2 py-1">
      <span className="text-[9px] font-semibold tracking-[0.14em] text-white/55 uppercase">{label}</span>
      <span className={cn("font-mono text-[15px] font-semibold tabular", tone === "warning" ? "text-warning" : tone === "caution" ? "text-caution" : "text-ok")}>
        {value}
        {unit ? <span className="ml-0.5 text-[10px] text-white/50">{unit}</span> : null}
      </span>
    </div>
  );
}

/** Compact always-visible flight data readout (HUD strip). */
export function FlightDataStrip({ className }: { className?: string }) {
  const s = useSimSnapshot();
  const a = s.aircraft;
  const i = s.indicated;
  const hdg = Math.round(i.headingMag) % 360;
  return (
    <div className={cn("flex flex-wrap items-stretch justify-center divide-x divide-white/10 rounded-md border border-white/10 bg-black/65 backdrop-blur", className)}>
      <Cell label="IAS" value={String(Math.round(i.iasKt))} unit="kt" tone={a.stallWarning || a.overspeed ? "warning" : undefined} />
      <Cell label="GS" value={String(Math.round(a.gsKt))} unit="kt" />
      <Cell label="ALT" value={String(Math.round(i.altFt / 10) * 10)} unit="ft" />
      <Cell label="AGL" value={a.aglFt < 2500 ? String(Math.max(0, Math.round(a.aglFt))) : "—"} unit={a.aglFt < 2500 ? "ft" : ""} tone={a.aglFt < 200 && !a.onGround ? "caution" : undefined} />
      <Cell label="VS" value={`${i.vsFpm >= 0 ? "+" : ""}${Math.round(i.vsFpm / 10) * 10}`} unit="fpm" />
      <Cell label="HDG" value={String(hdg === 0 ? 360 : hdg).padStart(3, "0")} unit="°" />
      <Cell label="PWR" value={String(Math.round(s.controls.throttle * 100))} unit="%" />
      <Cell label="FLAP" value={`${Math.round(a.flapsDeg)}°`} />
      <Cell label="TRIM" value={`${s.controls.trim >= 0 ? "+" : ""}${Math.round(s.controls.trim * 100)}`} />
      {a.onGround ? <Cell label="BRK" value={s.controls.parkingBrake ? "PARK" : s.controls.brakes > 0 ? "ON" : "OFF"} tone={s.controls.parkingBrake ? "caution" : undefined} /> : null}
      {s.ap.engaged ? <Cell label="AP" value={`${s.ap.lateral}/${s.ap.vertical}`} /> : null}
    </div>
  );
}
