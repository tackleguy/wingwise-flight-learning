/**
 * Weather Lab decoders: METAR, TAF (with period timeline), PIREP and winds-aloft (FB).
 */
import { Link } from "@tanstack/react-router";
import { useMemo, useState, type ReactNode } from "react";
import { AlertTriangle, ArrowUp } from "lucide-react";

import { Pill } from "@/components/app/page";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { getAirport } from "@/lib/data/airports";
import { CATEGORY_INFO, describeCloud, describeWind, formatVisibility, parseMetar, relativeHumidity, summarizeMetar, type FlightCategory } from "@/lib/weather/metar";
import { CHANGE_TEXT, formatObsTime, obsMinutes, parseTaf, prevailingAt, type TafPeriod } from "@/lib/weather/taf";
import { PIREP_EXAMPLES, PIREP_FIELD_HELP, parsePirep } from "@/lib/weather-lab/pirep";
import { FB_EXAMPLE, FB_EXAMPLE_HIGH, FB_LEVELS, decodeFbGroup, decodeFbLine } from "@/lib/weather-lab/winds-aloft";
import { cn } from "@/lib/utils";

const CAT_BG: Record<FlightCategory, string> = { VFR: "bg-ok", MVFR: "bg-primary", IFR: "bg-warning", LIFR: "bg-magenta" };
const CAT_SOFT: Record<FlightCategory, string> = { VFR: "bg-ok/30 border-ok text-ok", MVFR: "bg-primary/30 border-primary text-primary", IFR: "bg-warning/30 border-warning text-warning", LIFR: "bg-magenta/30 border-magenta text-magenta" };

export function CategoryBadge({ cat, large }: { cat: FlightCategory | null; large?: boolean }) {
  if (!cat) return <Pill>Category n/a</Pill>;
  const info = CATEGORY_INFO[cat];
  return (
    <span className={cn("inline-flex items-center gap-2 rounded border px-2 py-1 font-mono font-bold", large ? "text-base" : "text-xs", { VFR: "border-ok/40 bg-ok/10 text-ok", MVFR: "border-primary/40 bg-primary/10 text-primary", IFR: "border-warning/40 bg-warning/10 text-warning", LIFR: "border-magenta/40 bg-magenta/10 text-magenta" }[cat])} title={info.rule}>
      <span className={cn("size-2 rounded-full", CAT_BG[cat])} />
      {cat}
    </span>
  );
}

function Examples({ items, onPick }: { items: { label: string; text: string }[]; onPick: (t: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      <span className="label-caps self-center">Examples</span>
      {items.map((e) => (
        <button key={e.label} type="button" onClick={() => onPick(e.text)} className="rounded border bg-card px-2 py-0.5 text-xs text-muted-foreground hover:border-primary/50 hover:text-foreground">
          {e.label}
        </button>
      ))}
    </div>
  );
}

function DecodeRow({ k, children, raw }: { k: string; children: ReactNode; raw?: string | undefined }) {
  return (
    <tr className="border-b last:border-0 align-top">
      <td className="w-36 py-2 pr-3 text-xs text-muted-foreground">{k}</td>
      <td className="py-2 pr-3 text-sm">{children}</td>
      <td className="hidden py-2 font-mono text-[11px] text-cyan sm:table-cell">{raw}</td>
    </tr>
  );
}

/* ------------------------------ METAR ------------------------------ */

const METAR_EXAMPLES = [
  { label: "VFR", text: "METAR KPAO 141653Z 31008KT 10SM FEW030 18/09 A3002 RMK AO2" },
  { label: "Marine layer", text: "METAR KSFO 141456Z 28006KT 3SM BR OVC008 13/12 A3001 RMK AO2 SLP163" },
  { label: "Thunderstorm", text: "SPECI KATL 142112Z 27028G45KT 1 1/2SM +TSRA BKN018CB OVC035 24/21 A2978 RMK AO2 PK WND 27052/2105" },
  { label: "LIFR fog", text: "METAR KMRY 141254Z 00000KT 1/4SM FG VV001 11/11 A3004" },
  { label: "Freezing rain", text: "METAR KBOS 140954Z 05012KT 2SM -FZRA BR OVC009 M01/M02 A2992" },
];

export function MetarDecoder() {
  const [raw, setRaw] = useState(METAR_EXAMPLES[1]?.text ?? "");
  const m = useMemo(() => (raw.trim() ? parseMetar(raw) : null), [raw]);
  const ap = m?.station ? getAirport(m.station) : undefined;
  const spread = m && m.tempC !== null && m.dewpointC !== null ? m.tempC - m.dewpointC : null;
  return (
    <div className="space-y-3">
      <Examples items={METAR_EXAMPLES} onPick={setRaw} />
      <Textarea value={raw} onChange={(e) => setRaw(e.target.value)} rows={2} className="font-mono text-sm" placeholder="Paste a METAR, e.g. KPAO 141653Z 31008KT 10SM FEW030 18/09 A3002" aria-label="METAR text" />
      {!m ? (
        <p className="text-sm text-muted-foreground">Paste any METAR or SPECI to decode it.</p>
      ) : (
        <div className="panel overflow-hidden">
          <div className="flex flex-wrap items-center gap-3 border-b px-4 py-3">
            <CategoryBadge cat={m.flightCategory} large />
            <div className="min-w-0 flex-1 text-sm">
              <div className="font-semibold">
                {m.type} {m.station}
                {ap ? (
                  <Link to="/airports/$icao" params={{ icao: ap.icao }} className="ml-2 text-xs font-normal text-primary hover:underline">
                    {ap.name} →
                  </Link>
                ) : null}
              </div>
              {m.flightCategory ? <div className="text-xs text-muted-foreground">{CATEGORY_INFO[m.flightCategory].label}: {CATEGORY_INFO[m.flightCategory].rule}</div> : null}
            </div>
          </div>
          <p className="border-b bg-muted/30 px-4 py-2 text-sm">{summarizeMetar(m)}.</p>
          <div className="overflow-x-auto px-4">
            <table className="w-full">
              <tbody>
                <DecodeRow k="Report">
                  {m.type === "SPECI" ? "SPECI — special (unscheduled) observation issued because conditions changed significantly" : "METAR — routine hourly observation"}
                  {m.auto ? " · AUTO (fully automated, no human observer)" : ""}
                  {m.corrected ? " · COR (corrected report)" : ""}
                </DecodeRow>
                <DecodeRow k="Time" raw={m.time ? `${String(m.time.day).padStart(2, "0")}${String(m.time.hour).padStart(2, "0")}${String(m.time.minute).padStart(2, "0")}Z` : undefined}>
                  {m.time ? `Day ${m.time.day} of the month at ${String(m.time.hour).padStart(2, "0")}:${String(m.time.minute).padStart(2, "0")} UTC` : "Not found"}
                </DecodeRow>
                <DecodeRow k="Wind" raw={m.wind?.raw}>
                  {describeWind(m.wind)}
                  {m.wind?.gustKt ? <span className="text-caution"> — gust factor {m.wind.gustKt - m.wind.speedKt} kt</span> : null}
                </DecodeRow>
                <DecodeRow k="Visibility" raw={m.visibility?.raw}>
                  {formatVisibility(m.visibility)}
                </DecodeRow>
                {m.rvr.length ? (
                  <DecodeRow k="Runway visual range" raw={m.rvr.join(" ")}>
                    {m.rvr.map((r) => {
                      const x = /^R(\w+)\/([MP]?)(\d{4})(?:V([MP]?)(\d{4}))?FT/.exec(r);
                      return x ? `Runway ${x[1]}: ${x[2] === "M" ? "less than " : x[2] === "P" ? "more than " : ""}${Number(x[3])} ft${x[5] ? ` varying to ${Number(x[5])} ft` : ""}` : r;
                    }).join("; ")}
                  </DecodeRow>
                ) : null}
                <DecodeRow k="Weather" raw={m.weather.map((w) => w.raw).join(" ") || undefined}>
                  {m.weather.length ? m.weather.map((w) => w.text).join(", ") : "No significant weather reported"}
                </DecodeRow>
                <DecodeRow k="Sky condition" raw={m.clouds.map((c) => c.raw).join(" ") || undefined}>
                  {m.clouds.length ? (
                    <ul className="space-y-0.5">
                      {m.clouds.map((c) => (
                        <li key={c.raw} className={cn(c.type === "CB" && "text-warning")}>
                          {describeCloud(c)}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    "Not reported"
                  )}
                </DecodeRow>
                <DecodeRow k="Ceiling">{m.ceilingFt !== null ? `${m.ceilingFt.toLocaleString()} ft AGL (lowest broken, overcast or vertical visibility)` : "None — no broken/overcast layer"}</DecodeRow>
                <DecodeRow k="Temp / dew point">
                  {m.tempC !== null ? (
                    <>
                      {m.tempC}°C / {m.dewpointC ?? "—"}°C
                      {spread !== null && m.dewpointC !== null ? (
                        <span className="text-muted-foreground">
                          {" "}
                          · spread {spread}°C · RH {relativeHumidity(m.tempC, m.dewpointC)}%
                        </span>
                      ) : null}
                      {spread !== null && spread <= 2 ? <div className="text-xs text-caution">Spread of 2 °C or less — fog or low cloud likely (or present).</div> : null}
                      {m.tempC <= 0 && m.weather.some((w) => /RA|DZ|SN|FZ/.test(w.raw)) ? <div className="text-xs text-warning">Precipitation at or below freezing — icing hazard.</div> : null}
                    </>
                  ) : (
                    "Not reported"
                  )}
                </DecodeRow>
                <DecodeRow k="Altimeter" raw={m.altimeter?.raw}>
                  {m.altimeter ? `${m.altimeter.inHg.toFixed(2)} inHg (${Math.round(m.altimeter.hPa)} hPa)` : "Not reported"}
                </DecodeRow>
                {m.remarks ? (
                  <DecodeRow k="Remarks" raw={`RMK ${m.remarks}`}>
                    <RemarksDecode rmk={m.remarks} />
                  </DecodeRow>
                ) : null}
              </tbody>
            </table>
          </div>
          {m.unparsed.length ? (
            <p className="flex items-center gap-1.5 border-t px-4 py-2 text-xs text-caution">
              <AlertTriangle className="size-3.5" /> Not recognised: <span className="font-mono">{m.unparsed.join(" ")}</span>
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}

function RemarksDecode({ rmk }: { rmk: string }) {
  const notes: string[] = [];
  for (const t of rmk.split(/\s+/)) {
    if (t === "AO1") notes.push("AO1 — automated station without a precipitation discriminator");
    else if (t === "AO2") notes.push("AO2 — automated station with a precipitation discriminator (rain/snow)");
    else if (/^SLP\d{3}$/.test(t)) {
      const v = Number(t.slice(3)) / 10;
      notes.push(`SLP — sea-level pressure ${(v >= 50 ? 900 + v : 1000 + v).toFixed(1)} hPa`);
    } else if (/^T[01]\d{3}[01]\d{3}$/.test(t)) {
      const tt = (t[1] === "1" ? -1 : 1) * Number(t.slice(2, 5)) / 10;
      const dd = (t[5] === "1" ? -1 : 1) * Number(t.slice(6, 9)) / 10;
      notes.push(`Precise temperature ${tt.toFixed(1)}°C, dew point ${dd.toFixed(1)}°C`);
    } else if (t === "PK") notes.push("PK WND — peak wind (direction/speed/time follows)");
    else if (t === "TSNO") notes.push("TSNO — thunderstorm information not available");
    else if (t === "$") notes.push("$ — station needs maintenance");
  }
  return (
    <div>
      <div className="font-mono text-xs">{rmk}</div>
      {notes.length ? (
        <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-muted-foreground">
          {notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/* ------------------------------ TAF ------------------------------ */

const TAF_EXAMPLES = [
  { label: "Marine layer", text: "TAF KSFO 141120Z 1412/1518 VRB03KT 1SM BR OVC004\n  FM141800 29010KT P6SM SCT012\n  FM142200 29016G24KT P6SM SKC\n  FM150400 28008KT 4SM BR OVC008" },
  { label: "Thunderstorms", text: "TAF KATL 141720Z 1418/1524 20012KT P6SM SCT040 BKN250\n  TEMPO 1420/1424 30025G45KT 2SM +TSRA BKN030CB\n  FM150100 32008KT P6SM SCT050\n  PROB30 1510/1514 3SM BR" },
  { label: "Winter front", text: "TAF AMD KBOS 140540Z 1406/1512 05015G25KT 3SM -SN OVC015\n  BECMG 1410/1412 1SM SN OVC006\n  TEMPO 1412/1416 1/2SM +SN VV004\n  FM141900 33020G30KT P6SM BKN030 WS020/34045KT" },
];

function tafMinutesFn(validFrom: number) {
  // Handle month wrap: any time earlier than validFrom by more than ~20 days is in the next month.
  return (t: { day: number; hour: number; minute: number }) => {
    let v = obsMinutes(t);
    if (v < validFrom - 20 * 1440) v += 31 * 1440;
    return v;
  };
}

export function TafDecoder() {
  const [raw, setRaw] = useState(TAF_EXAMPLES[0]?.text ?? "");
  const taf = useMemo(() => (raw.trim() ? parseTaf(raw) : null), [raw]);
  const vf = taf?.validFrom ? obsMinutes(taf.validFrom) : null;
  const mins = vf !== null ? tafMinutesFn(vf) : null;
  const vt = taf?.validTo && mins ? mins(taf.validTo) : null;
  const span = vf !== null && vt !== null && vt > vf ? vt - vf : null;
  const [at, setAt] = useState(0.25);

  const atTime = useMemo(() => {
    if (!taf?.validFrom || vf === null || span === null) return null;
    const t = vf + Math.round((at * span) / 60) * 60;
    const day = Math.floor(t / 1440);
    const hour = Math.floor((t % 1440) / 60);
    const realDay = day > 31 ? day - 31 : day;
    return { day: realDay, hour, minute: 0, abs: t };
  }, [taf, vf, span, at]);
  const prevailing = taf && atTime ? prevailingAt(taf, { day: atTime.day, hour: atTime.hour, minute: 0 }) : null;

  const main = taf ? taf.periods.filter((p) => p.type === "BASE" || p.type === "FM") : [];
  const temp = taf ? taf.periods.filter((p) => p.type !== "BASE" && p.type !== "FM") : [];

  const pos = (p: TafPeriod, edge: "from" | "to", fallback: number) => {
    const t = p[edge];
    if (!t || !mins || vf === null || span === null) return fallback;
    return Math.max(0, Math.min(1, (mins(t) - vf) / span));
  };

  return (
    <div className="space-y-3">
      <Examples items={TAF_EXAMPLES} onPick={setRaw} />
      <Textarea value={raw} onChange={(e) => setRaw(e.target.value)} rows={5} className="font-mono text-sm" aria-label="TAF text" />
      {!taf ? (
        <p className="text-sm text-muted-foreground">Paste a TAF to decode it.</p>
      ) : (
        <div className="panel overflow-hidden">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b px-4 py-3 text-sm">
            <span className="font-semibold">TAF {taf.station}</span>
            {taf.amended ? <Pill tone="caution">Amended</Pill> : null}
            {taf.corrected ? <Pill tone="caution">Corrected</Pill> : null}
            <span className="text-xs text-muted-foreground">Issued {formatObsTime(taf.issued)}</span>
            <span className="text-xs text-muted-foreground">
              Valid {formatObsTime(taf.validFrom)} → {formatObsTime(taf.validTo)}
            </span>
          </div>
          {span !== null ? (
            <div className="border-b px-4 py-3">
              <p className="label-caps mb-2">Period timeline</p>
              <div className="relative">
                <div className="relative h-7 overflow-hidden rounded bg-muted">
                  {main.map((p, i) => {
                    const from = i === 0 ? 0 : pos(p, "from", 0);
                    const next = main[i + 1];
                    const to = next ? pos(next, "from", 1) : 1;
                    return (
                      <div key={i} className={cn("absolute top-0 flex h-full items-center justify-center border-r border-background text-[10px] font-bold text-background", p.flightCategory ? CAT_BG[p.flightCategory] : "bg-muted-foreground")} style={{ left: `${from * 100}%`, width: `${Math.max(0, to - from) * 100}%` }} title={p.raw}>
                        <span className="truncate px-1">{p.flightCategory ?? ""}</span>
                      </div>
                    );
                  })}
                </div>
                {temp.length ? (
                  <div className="relative mt-1 h-5">
                    {temp.map((p, i) => {
                      const from = pos(p, "from", 0);
                      const to = pos(p, "to", 1);
                      return (
                        <div
                          key={i}
                          className={cn("absolute h-full rounded border text-[9px] leading-[18px] font-semibold", p.flightCategory ? CAT_SOFT[p.flightCategory] : "border-muted-foreground bg-muted-foreground/30")}
                          style={{ left: `${from * 100}%`, width: `${Math.max(0.01, to - from) * 100}%`, backgroundImage: "repeating-linear-gradient(45deg, transparent 0 4px, oklch(0 0 0 / 0.25) 4px 6px)" }}
                          title={p.raw}
                        >
                          <span className="px-1">{p.type === "PROB" ? `PROB${p.probability ?? ""}` : p.type}</span>
                        </div>
                      );
                    })}
                  </div>
                ) : null}
                <div className="pointer-events-none absolute top-0 h-full border-l-2 border-white" style={{ left: `${at * 100}%`, height: temp.length ? "3.25rem" : "1.75rem" }} />
              </div>
              <input type="range" min={0} max={1} step={1 / Math.max(1, span / 60)} value={at} onChange={(e) => setAt(Number(e.target.value))} className="mt-2 w-full accent-[var(--color-primary)]" aria-label="Time within the forecast" />
              {prevailing && atTime ? (
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-mono">
                    {String(atTime.day).padStart(2, "0")}/{String(atTime.hour).padStart(2, "0")}00Z
                  </span>
                  <CategoryBadge cat={prevailing.category} />
                  <span className="text-muted-foreground">Prevailing: {prevailing.base ? periodSummary(prevailing.base) : "—"}</span>
                  {prevailing.temporary.length ? <span className="text-caution">+ {prevailing.temporary.map((t) => `${t.type === "PROB" ? `PROB${t.probability}` : t.type}: ${periodSummary(t)}`).join("; ")}</span> : null}
                </div>
              ) : null}
            </div>
          ) : null}
          <ol className="divide-y">
            {taf.periods.map((p, i) => (
              <li key={i} className="grid gap-2 px-4 py-3 sm:grid-cols-[160px_minmax(0,1fr)]">
                <div>
                  <div className="flex items-center gap-2">
                    <Pill tone={p.type === "BASE" || p.type === "FM" ? "primary" : "caution"}>{p.type === "PROB" ? `PROB${p.probability ?? ""}${p.tempo ? " TEMPO" : ""}` : p.type}</Pill>
                    <CategoryBadge cat={p.flightCategory} />
                  </div>
                  <div className="mt-1 font-mono text-[11px] text-muted-foreground">
                    {formatObsTime(p.from)}
                    {p.to ? ` → ${formatObsTime(p.to)}` : ""}
                  </div>
                </div>
                <div className="text-sm">
                  <p className="text-xs text-muted-foreground">{CHANGE_TEXT[p.type]}</p>
                  <p className="mt-1">{periodSummary(p)}</p>
                  <p className="mt-1 font-mono text-[11px] text-cyan">{p.raw}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

function periodSummary(p: TafPeriod): string {
  const parts: string[] = [];
  if (p.wind) parts.push(`wind ${describeWind(p.wind).toLowerCase()}`);
  if (p.visibility) parts.push(`visibility ${formatVisibility(p.visibility)}`);
  if (p.weather.length) parts.push(p.weather.map((w) => w.text).join(", "));
  if (p.noSigWeather) parts.push("no significant weather");
  if (p.clouds.length) parts.push(p.clouds.map((c) => describeCloud(c).toLowerCase()).join(", "));
  if (p.windShear) parts.push(`wind shear at ${p.windShear.heightFt.toLocaleString()} ft AGL: ${p.windShear.direction}° at ${p.windShear.speedKt} kt`);
  const s = parts.join("; ");
  return s ? `${s[0]?.toUpperCase()}${s.slice(1)}` : "No change in reported elements";
}

/* ------------------------------ PIREP ------------------------------ */

export function PirepDecoder() {
  const [raw, setRaw] = useState(PIREP_EXAMPLES[0] ?? "");
  const p = useMemo(() => (raw.trim() ? parsePirep(raw) : null), [raw]);
  return (
    <div className="space-y-3">
      <Examples items={PIREP_EXAMPLES.map((t, i) => ({ label: ["Routine", "Severe icing (UUA)", "Chop on climb", "Wind shear (UUA)"][i] ?? `#${i + 1}`, text: t }))} onPick={setRaw} />
      <Textarea value={raw} onChange={(e) => setRaw(e.target.value)} rows={3} className="font-mono text-sm" aria-label="PIREP text" />
      {p ? (
        <div className="panel overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
            {p.urgent ? <Pill tone="warning">UUA · Urgent</Pill> : <Pill tone="primary">UA · Routine</Pill>}
            <span className="text-sm">{p.summary}</span>
          </div>
          {p.errors.length ? (
            <ul className="border-b bg-caution/5 px-4 py-2 text-xs text-caution">
              {p.errors.map((e) => (
                <li key={e} className="flex items-start gap-1.5">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" /> {e}
                </li>
              ))}
            </ul>
          ) : null}
          <div className="overflow-x-auto px-4">
            <table className="w-full">
              <tbody>
                {p.fields.map((f, i) => (
                  <DecodeRow key={`${f.code}-${i}`} k={`${f.label} (/${f.code})`} raw={f.raw}>
                    <span className={cn(f.warn && "font-medium text-warning")}>{f.text}</span>
                  </DecodeRow>
                ))}
              </tbody>
            </table>
          </div>
          <p className="border-t px-4 py-2 text-[11px] text-muted-foreground">PIREP altitudes, cloud bases and tops are in feet MSL — unlike METAR cloud heights, which are AGL.</p>
        </div>
      ) : null}
      <details className="panel px-4 py-3 text-sm">
        <summary className="cursor-pointer font-medium">PIREP field reference</summary>
        <table className="mt-2 w-full text-xs">
          <tbody>
            {PIREP_FIELD_HELP.map((h) => (
              <tr key={h.code} className="border-b last:border-0 align-top">
                <td className="py-1.5 pr-3 font-mono text-cyan">{h.code}</td>
                <td className="py-1.5 pr-3 font-medium">{h.label}</td>
                <td className="py-1.5 text-muted-foreground">{h.help}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}

/* ------------------------------ Winds aloft ------------------------------ */

function WindArrow({ dir }: { dir: number | null }) {
  if (dir === null) return <span className="inline-block size-4" />;
  // Arrow points the way the wind blows TO.
  return <ArrowUp className="inline-block size-4 text-cyan" style={{ transform: `rotate(${dir + 180}deg)` }} aria-hidden />;
}

export function WindsAloftDecoder() {
  const [group, setGroup] = useState("7319-60");
  const [alt, setAlt] = useState(34000);
  const [line, setLine] = useState(FB_EXAMPLE);
  const single = useMemo(() => decodeFbGroup(group, alt), [group, alt]);
  const decodedLine = useMemo(() => decodeFbLine(line), [line]);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="panel p-4">
          <p className="label-caps mb-2">Decode one group</p>
          <div className="flex flex-wrap gap-2">
            <Input value={group} onChange={(e) => setGroup(e.target.value.toUpperCase().replace(/[^0-9+-]/g, "").slice(0, 7))} className="w-36 font-mono" aria-label="FB group" />
            <select value={alt} onChange={(e) => setAlt(Number(e.target.value))} className="h-9 rounded-md border bg-background px-2 text-sm" aria-label="Altitude level">
              {FB_LEVELS.map((l) => (
                <option key={l} value={l}>
                  {l.toLocaleString()} ft
                </option>
              ))}
            </select>
          </div>
          <div className="mt-2 flex flex-wrap gap-1">
            {[
              ["2745-02", 9000],
              ["9900+05", 6000],
              ["731960", 34000],
              ["7799", 39000],
              ["0507", 3000],
            ].map(([g, a]) => (
              <button
                key={String(g)}
                type="button"
                onClick={() => {
                  setGroup(String(g));
                  setAlt(Number(a));
                }}
                className="rounded border px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground hover:text-foreground"
              >
                {g} @ {Number(a) / 1000}k
              </button>
            ))}
          </div>
          <div className="mt-3 rounded-md border bg-muted/30 p-3">
            {single.ok ? (
              <div className="flex items-center gap-3">
                <WindArrow dir={single.direction} />
                <div className="font-mono text-lg font-semibold">
                  {single.lightVariable ? "Light & variable" : `${String(single.direction).padStart(3, "0")}° / ${single.speedKt}${single.speedAtLeast ? "+" : ""} kt`}
                  {single.tempC !== null ? <span className="ml-3 text-cyan">{single.tempC > 0 ? "+" : ""}{single.tempC}°C</span> : null}
                </div>
              </div>
            ) : (
              <p className="text-sm text-warning">{single.error}</p>
            )}
            {single.steps.length ? (
              <ol className="mt-2 list-decimal space-y-0.5 pl-5 text-xs text-muted-foreground">
                {single.steps.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ol>
            ) : null}
          </div>
        </div>
        <div className="panel p-4 text-sm">
          <p className="label-caps mb-2">FB decoding rules</p>
          <ul className="space-y-1.5 text-xs">
            <li><span className="font-mono text-cyan">DDSS</span> — direction (tens of degrees, <strong>true</strong>) and speed in knots: 2745 = 270° at 45 kt.</li>
            <li><span className="font-mono text-cyan">DDSS±TT</span> — with temperature °C (6,000–24,000 ft): 2745-02.</li>
            <li><span className="font-mono text-cyan">9900</span> — light and variable, less than 5 kt.</li>
            <li><span className="font-mono text-cyan">DD 51–86</span> — 100 kt or more: subtract 50 from DD, add 100 to SS. 7319 = 230° at 119 kt.</li>
            <li><span className="font-mono text-cyan">7799</span> — 199 kt or more.</li>
            <li>Above 24,000 ft the temperature sign is omitted — it is always negative: 731960 = 230°/119 kt, −60°C.</li>
            <li>No wind is forecast within 1,500 ft of station elevation; no temperature at 3,000 ft or within 2,500 ft of the station.</li>
          </ul>
        </div>
      </div>

      <div className="panel p-4">
        <p className="label-caps mb-2">Decode a station line</p>
        <div className="mb-2 flex flex-wrap gap-1.5">
          <button type="button" onClick={() => setLine(FB_EXAMPLE)} className="rounded border px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground">
            Sea-level station (SFO)
          </button>
          <button type="button" onClick={() => setLine(FB_EXAMPLE_HIGH)} className="rounded border px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground">
            High-elevation station (DEN)
          </button>
        </div>
        <Input value={line} onChange={(e) => setLine(e.target.value.toUpperCase())} className="font-mono text-xs" aria-label="FB station line" />
        <p className="mt-1 font-mono text-[11px] text-muted-foreground">FT {FB_LEVELS.map((l) => String(l).padStart(5, " ")).join(" ")} — groups align to the highest levels when low levels are omitted.</p>
        {"error" in decodedLine ? (
          <p className="mt-2 text-sm text-warning">{decodedLine.error}</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[640px] text-xs">
              <thead>
                <tr className="border-b text-left">
                  <th className="label-caps py-1.5">{decodedLine.station}</th>
                  {decodedLine.cells.map((c) => (
                    <th key={c.level} className="label-caps py-1.5 text-center">
                      {c.level >= 18000 ? `FL${c.level / 100}` : `${c.level / 1000}k ft`}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="font-mono">
                <tr className="border-b">
                  <td className="py-1.5 font-sans text-muted-foreground">Raw</td>
                  {decodedLine.cells.map((c) => (
                    <td key={c.level} className="py-1.5 text-center text-cyan">
                      {c.raw || "—"}
                    </td>
                  ))}
                </tr>
                <tr className="border-b">
                  <td className="py-1.5 font-sans text-muted-foreground">Wind</td>
                  {decodedLine.cells.map((c) => (
                    <td key={c.level} className="py-1.5 text-center">
                      {!c.raw ? <span className="text-muted-foreground">none</span> : c.ok ? c.lightVariable ? "L&V" : (
                        <span className="inline-flex items-center gap-1">
                          <WindArrow dir={c.direction} />
                          {String(c.direction).padStart(3, "0")}/{c.speedKt}
                        </span>
                      ) : <span className="text-warning">err</span>}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="py-1.5 font-sans text-muted-foreground">Temp °C</td>
                  {decodedLine.cells.map((c) => (
                    <td key={c.level} className="py-1.5 text-center">
                      {c.tempC !== null ? `${c.tempC > 0 ? "+" : ""}${c.tempC}` : "—"}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
