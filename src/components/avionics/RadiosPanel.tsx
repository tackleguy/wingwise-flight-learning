/**
 * Radio stack: COM1/COM2, NAV1/NAV2 (with station ident & Morse), ADF, transponder and
 * altimeter (BARO) setting. Standby frequencies are tuned with dual concentric knobs.
 */
import { useEffect, useState, type ReactNode } from "react";
import { ArrowLeftRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtCom, fmtNav, morse, stepAdf, stepComFreq, stepNavFreq } from "@/sim/avionics-helpers";
import type { SimEngine } from "@/sim/engine";
import { useSimEngine, useSimSnapshot } from "@/sim/react";
import type { SimSnapshot } from "@/sim/types";
import { ExplainButton } from "./common";
import { stepBaro } from "./controls";
import { Knob } from "./Knob";

function Row({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-lg border border-white/5 bg-[oklch(0.14_0.006_258)] px-2 py-1.5",
        className,
      )}
    >
      <span className="w-10 shrink-0 font-mono text-[10px] font-bold tracking-wider text-white/55">
        {label}
      </span>
      {children}
    </div>
  );
}

function Lcd({
  children,
  className,
  label,
}: {
  children: ReactNode;
  className?: string;
  label?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col rounded border border-black bg-black px-1.5 py-0.5 shadow-[inset_0_0_0_1px_oklch(1_0_0/0.05)]",
        className,
      )}
    >
      {label ? (
        <span className="text-[8px] leading-none tracking-wider text-white/40">{label}</span>
      ) : null}
      <span className="font-mono text-[15px] leading-tight font-semibold tabular">{children}</span>
    </div>
  );
}

function SwapBtn({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="inline-flex size-8 shrink-0 items-center justify-center rounded-md border border-white/10 bg-gradient-to-b from-[oklch(0.3_0.006_258)] to-[oklch(0.2_0.006_258)] text-white/80 shadow-[inset_0_1px_0_oklch(1_0_0/0.12)] hover:text-white active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <ArrowLeftRight className="size-3.5" />
    </button>
  );
}

function SmallBtn({
  children,
  onClick,
  active,
  title,
  className,
}: {
  children: ReactNode;
  onClick: () => void;
  active?: boolean;
  title?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={active}
      className={cn(
        "inline-flex h-7 items-center justify-center rounded border border-white/10 bg-gradient-to-b from-[oklch(0.3_0.006_258)] to-[oklch(0.2_0.006_258)] px-2 font-mono text-[10px] font-bold text-white/75 shadow-[inset_0_1px_0_oklch(1_0_0/0.1)] transition hover:text-white active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        active && "border-ok/50 text-ok",
        className,
      )}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------- COM / NAV

function ComRow({ n, s, engine }: { n: 1 | 2; s: SimSnapshot; engine: SimEngine }) {
  const c = n === 1 ? s.radios.com1 : s.radios.com2;
  const failed = s.failures.radios || !s.indicated.avionicsPowered;
  const tune = (part: "mhz" | "khz", d: number) => {
    const r = engine.getSnapshot().radios;
    const cur = n === 1 ? r.com1 : r.com2;
    const next = { ...cur, standby: stepComFreq(cur.standby, part, d) };
    engine.setRadios(n === 1 ? { com1: next } : { com2: next });
  };
  return (
    <Row label={`COM${n}`}>
      <Lcd label="ACTIVE" className="flex-1">
        <span className={failed ? "text-white/25" : "text-ok"}>
          {failed ? "-----" : fmtCom(c.active)}
        </span>
      </Lcd>
      <SwapBtn onClick={() => engine.swapCom(n)} label={`Swap COM${n} active and standby`} />
      <Lcd label="STBY" className="flex-1">
        <span className="text-cyan">{fmtCom(c.standby)}</span>
      </Lcd>
      <Knob
        size="sm"
        caption=""
        label={`COM${n} standby MHz (outer)`}
        valueNow={c.standby}
        valueText={`${fmtCom(c.standby)} megahertz`}
        onStep={(d) => tune("mhz", d)}
        inner={{
          label: `COM${n} standby kHz (inner)`,
          valueNow: c.standby,
          valueText: fmtCom(c.standby),
          onStep: (d) => tune("khz", d),
          onPush: () => engine.swapCom(n),
        }}
      />
    </Row>
  );
}

function NavRow({ n, s, engine }: { n: 1 | 2; s: SimSnapshot; engine: SimEngine }) {
  const r = n === 1 ? s.radios.nav1 : s.radios.nav2;
  const rx = n === 1 ? s.nav.nav1 : s.nav.nav2;
  const tune = (part: "mhz" | "khz", d: number) => {
    const rr = engine.getSnapshot().radios;
    const cur = n === 1 ? rr.nav1 : rr.nav2;
    const next = { ...cur, standby: stepNavFreq(cur.standby, part, d) };
    engine.setRadios(n === 1 ? { nav1: next } : { nav2: next });
  };
  const sel = s.radios.cdiSource === (n === 1 ? "NAV1" : "NAV2");
  return (
    <Row label={`NAV${n}`} className="flex-wrap gap-y-1">
      <Lcd label={sel ? "ACTIVE · CDI" : "ACTIVE"} className="flex-1">
        <span className="text-ok">{fmtNav(r.active)}</span>
        <span className={cn("ml-1.5 text-[11px]", rx.valid ? "text-ok" : "text-white/30")}>
          {rx.valid ? rx.ident : rx.ident ? `${rx.ident}?` : "---"}
        </span>
      </Lcd>
      <SwapBtn onClick={() => engine.swapNav(n)} label={`Swap NAV${n} active and standby`} />
      <Lcd label="STBY" className="flex-1">
        <span className="text-cyan">{fmtNav(r.standby)}</span>
      </Lcd>
      <Knob
        size="sm"
        caption=""
        label={`NAV${n} standby MHz (outer)`}
        valueNow={r.standby}
        valueText={`${fmtNav(r.standby)} megahertz`}
        onStep={(d) => tune("mhz", d)}
        inner={{
          label: `NAV${n} standby kHz (inner)`,
          valueNow: r.standby,
          valueText: fmtNav(r.standby),
          onStep: (d) => tune("khz", d),
          onPush: () => engine.swapNav(n),
        }}
      />
      <div
        className="w-full basis-full truncate pl-12 font-mono text-[10px] tracking-widest text-ok/80"
        title={rx.valid ? `Morse ident ${rx.ident}` : "No station received"}
      >
        {rx.valid ? (
          <>
            <span className="mr-2 tracking-normal text-white/45">IDENT</span>
            {morse(rx.ident)}
          </>
        ) : (
          <span className="tracking-normal text-white/30">no station received</span>
        )}
      </div>
    </Row>
  );
}

// ---------------------------------------------------------------- ADF

function AdfRow({ s, engine }: { s: SimSnapshot; engine: SimEngine }) {
  const adf = s.nav.adf;
  const khz = s.radios.adfKhz;
  const step = (d: number) =>
    engine.setRadios({ adfKhz: stepAdf(engine.getSnapshot().radios.adfKhz, d) });
  return (
    <Row label="ADF">
      <Lcd label="FREQ kHz" className="flex-1">
        <span className="text-ok">{khz}</span>
        <span className={cn("ml-1.5 text-[11px]", adf.valid ? "text-ok" : "text-white/30")}>
          {adf.valid ? adf.ident : "---"}
        </span>
      </Lcd>
      <div className="hidden flex-1 truncate font-mono text-[10px] tracking-widest text-ok/80 sm:block">
        {adf.valid ? morse(adf.ident) : ""}
      </div>
      <Knob
        size="sm"
        caption=""
        label="ADF tens (outer)"
        valueNow={khz}
        valueMin={190}
        valueMax={1750}
        valueText={`${khz} kilohertz`}
        onStep={(d) => step(d * 10)}
        inner={{ label: "ADF units (inner)", valueNow: khz, onStep: (d) => step(d) }}
      />
    </Row>
  );
}

// ---------------------------------------------------------------- transponder

function XpdrRow({ s, engine }: { s: SimSnapshot; engine: SimEngine }) {
  const xp = s.radios.transponder;
  const [pending, setPending] = useState<string | null>(null);
  const [identUntil, setIdentUntil] = useState(0);
  const [, force] = useState(0);
  useEffect(() => {
    if (!identUntil) return;
    const id = setTimeout(
      () => {
        setIdentUntil(0);
        force((x) => x + 1);
      },
      Math.max(0, identUntil - Date.now()),
    );
    return () => clearTimeout(id);
  }, [identUntil]);
  const setCode = (code: string) =>
    engine.setRadios({ transponder: { ...engine.getSnapshot().radios.transponder, code } });
  const digit = (d: number) => {
    const next = (pending ?? "") + String(d);
    if (next.length >= 4) {
      setCode(next.slice(0, 4));
      setPending(null);
    } else setPending(next);
  };
  const shown = pending !== null ? pending.padEnd(4, "_") : xp.code;
  const ident = identUntil > Date.now();
  const modeColor =
    xp.mode === "ALT" ? "text-ok" : xp.mode === "ON" ? "text-white" : "text-white/40";
  return (
    <Row label="XPDR" className="flex-wrap">
      <Lcd label={ident ? "IDENT" : "SQUAWK"} className="w-[7.5rem]">
        <span className={cn(pending !== null ? "text-cyan" : modeColor, "tracking-[0.2em]")}>
          {shown}
        </span>
        <span className={cn("ml-1 text-[11px]", modeColor)}>{xp.mode}</span>
        {ident ? <span className="animate-annunciator ml-1 text-[10px] text-cyan">ID</span> : null}
      </Lcd>
      <div className="flex flex-wrap gap-1">
        {(["STBY", "ON", "ALT"] as const).map((m) => (
          <SmallBtn
            key={m}
            active={xp.mode === m}
            onClick={() =>
              engine.setRadios({
                transponder: { ...engine.getSnapshot().radios.transponder, mode: m },
              })
            }
            title={
              m === "STBY"
                ? "Standby: not replying"
                : m === "ON"
                  ? "Mode A: code only"
                  : "Mode C/S: code and pressure altitude"
            }
          >
            {m}
          </SmallBtn>
        ))}
        <SmallBtn
          onClick={() => setIdentUntil(Date.now() + 18000)}
          title="IDENT: highlights your target on the controller's radar for about 18 seconds — only when ATC asks"
          className={ident ? "border-cyan/60 text-cyan" : ""}
        >
          IDENT
        </SmallBtn>
        <SmallBtn
          onClick={() => {
            setCode("1200");
            setPending(null);
          }}
          title="VFR code 1200 (US)"
        >
          VFR
        </SmallBtn>
      </div>
      <div
        className="flex w-full flex-wrap items-center gap-1 pl-12"
        role="group"
        aria-label="Transponder code keypad (digits 0–7)"
      >
        {[0, 1, 2, 3, 4, 5, 6, 7].map((d) => (
          <SmallBtn key={d} onClick={() => digit(d)} className="w-7 px-0 text-[12px]">
            {d}
          </SmallBtn>
        ))}
        <SmallBtn
          onClick={() => setPending((p) => (p && p.length > 1 ? p.slice(0, -1) : null))}
          title="Clear last digit"
        >
          CLR
        </SmallBtn>
      </div>
    </Row>
  );
}

// ---------------------------------------------------------------- BARO

function BaroRow({ s, engine }: { s: SimSnapshot; engine: SimEngine }) {
  const inHg = s.radios.altimeterInHg;
  return (
    <Row label="BARO">
      <Lcd label="ALTIMETER" className="flex-1">
        <span className="text-cyan">{inHg.toFixed(2)}</span>
        <span className="ml-1 text-[10px] text-white/50">
          inHg · {Math.round(inHg * 33.8639)} hPa
        </span>
      </Lcd>
      <SmallBtn
        onClick={() => engine.setRadios({ altimeterInHg: 29.92 })}
        title="Standard pressure 29.92 inHg (flight levels)"
      >
        STD
      </SmallBtn>
      <Knob
        size="sm"
        caption=""
        label="Altimeter setting"
        valueNow={inHg}
        valueMin={27.5}
        valueMax={31.5}
        valueText={`${inHg.toFixed(2)} inches`}
        onStep={(d, big) => stepBaro(engine, d, big)}
      />
    </Row>
  );
}

// ---------------------------------------------------------------- panel

export interface RadiosPanelProps {
  className?: string | undefined;
  /** Which sections to show (default all). */
  sections?: ("com" | "nav" | "adf" | "xpdr" | "baro")[] | undefined;
}

export function RadiosPanel({
  className,
  sections = ["com", "nav", "adf", "xpdr", "baro"],
}: RadiosPanelProps) {
  const s = useSimSnapshot();
  const engine = useSimEngine();
  const has = (k: (typeof sections)[number]) => sections.includes(k);
  return (
    <div
      className={cn(
        "relative space-y-1.5 rounded-xl border border-white/10 bg-bezel p-2.5",
        className,
      )}
    >
      <div className="flex items-center justify-between px-0.5">
        <span className="text-[10px] font-semibold tracking-[0.2em] text-white/45 uppercase">
          Radios
        </span>
        <span className="flex gap-1">
          <ExplainButton id="radios" label="Radios" />
          <ExplainButton id="transponder" label="Transponder" />
        </span>
      </div>
      {has("com") ? (
        <>
          <ComRow n={1} s={s} engine={engine} />
          <ComRow n={2} s={s} engine={engine} />
        </>
      ) : null}
      {has("nav") ? (
        <>
          <NavRow n={1} s={s} engine={engine} />
          <NavRow n={2} s={s} engine={engine} />
        </>
      ) : null}
      {has("adf") ? <AdfRow s={s} engine={engine} /> : null}
      {has("xpdr") ? <XpdrRow s={s} engine={engine} /> : null}
      {has("baro") ? <BaroRow s={s} engine={engine} /> : null}
      <p className="px-0.5 font-mono text-[9px] leading-snug text-white/35">
        Knobs: outer ring = MHz, inner = kHz (drag, scroll or arrow keys). Push inner = swap.
      </p>
    </div>
  );
}
