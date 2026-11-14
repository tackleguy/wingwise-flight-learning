import { useEffect, useRef, useState } from "react";
import { Pause, Play, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { norm360 } from "@/lib/geo";
import { C, DiagramLayout, Readout, SliderControl, ToggleChip } from "./controls";
import {
  AirspeedGauge,
  AltimeterGauge,
  AttitudeGauge,
  HeadingGauge,
  TurnCoordinatorGauge,
  VsiGauge,
} from "./gauges";

/* ------------------------------------------------------------------------------------------ */
/* Six pack                                                                                    */
/* ------------------------------------------------------------------------------------------ */

type Inst = "asi" | "ai" | "alt" | "tc" | "hi" | "vsi";

const INST: Record<Inst, { name: string; system: string; text: string; errors: string }> = {
  asi: {
    name: "Airspeed indicator",
    system: "Pitot-static (pitot + static)",
    text: "Shows indicated airspeed by comparing ram (pitot) pressure with static pressure. Colour arcs: white = flap operating range (VSO to VFE), green = normal operating range (VS1 to VNO), yellow = caution range (smooth air only), red line = VNE.",
    errors:
      "Pitot blockage, static blockage, position error. Does not show true airspeed — TAS increases about 2% per 1,000 ft above IAS.",
  },
  ai: {
    name: "Attitude indicator",
    system: "Gyroscopic — vacuum-driven in most trainers",
    text: "Shows pitch and bank relative to the natural horizon using a gyro with rigidity in space. It is the only instrument that shows pitch and bank directly and is the master instrument for attitude flying.",
    errors:
      "Small errors in turns and accelerations; tumbles beyond its limits in older units; slowly fails if vacuum pressure is lost — check the suction gauge.",
  },
  alt: {
    name: "Altimeter",
    system: "Pitot-static (static only)",
    text: "An aneroid barometer that shows altitude above the pressure level set in the Kollsman window. Set the current local altimeter setting (or 29.92 at and above 18,000 ft MSL).",
    errors:
      '"High to low, look out below": flying from high to low pressure or into colder air makes the altimeter read higher than true altitude.',
  },
  tc: {
    name: "Turn coordinator",
    system: "Gyroscopic — usually electric (a backup to the vacuum system)",
    text: 'The miniature airplane shows rate of roll and rate of turn; aligned with the L/R mark = standard-rate turn (3°/s, 360° in 2 minutes). The inclinometer ball shows coordination — "step on the ball".',
    errors:
      "Does not show bank angle directly. Standard-rate bank ≈ TAS/10 + 7 (about 17° at 100 kt).",
  },
  hi: {
    name: "Heading indicator",
    system: "Gyroscopic — vacuum-driven in most trainers",
    text: "A directional gyro that shows heading without the turning and acceleration errors of the magnetic compass.",
    errors:
      "Precession: it drifts and must be aligned with the magnetic compass about every 15 minutes in straight, unaccelerated flight.",
  },
  vsi: {
    name: "Vertical speed indicator",
    system: "Pitot-static (static only)",
    text: "Shows rate of climb or descent by measuring how fast static pressure changes through a calibrated leak. Gives trend information immediately and rate information after a short lag (about 6–9 seconds).",
    errors: "Lag; erratic in turbulence. Shows zero if the static port is blocked.",
  },
};

export function SixPackDiagram() {
  const [pitch, setPitch] = useState(0);
  const [bank, setBank] = useState(0);
  const [sel, setSel] = useState<Inst>("ai");
  const [running, setRunning] = useState(true);
  const sim = useRef({ alt: 3000, hdg: 90, ias: 105 });
  const [, setTick] = useState(0);
  const ctl = useRef({ pitch, bank });
  ctl.current = { pitch, bank };

  useEffect(() => {
    if (!running) return;
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    const loop = (t: number) => {
      const dt = Math.min(0.1, (t - last) / 1000);
      last = t;
      const s = sim.current;
      const { pitch: p, bank: b } = ctl.current;
      const n = 1 / Math.cos((b * Math.PI) / 180);
      const target = Math.max(45, 105 - 4.2 * p - (n - 1) * 12);
      s.ias += (target - s.ias) * Math.min(1, dt * 0.6);
      const vs = p * 105 - (n - 1) * 250;
      s.alt += (vs / 60) * dt;
      const rate = (1091 * Math.tan((b * Math.PI) / 180)) / Math.max(40, s.ias);
      s.hdg = norm360(s.hdg + rate * dt);
      acc += dt;
      if (acc > 1 / 30) {
        acc = 0;
        setTick((x) => x + 1);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [running]);

  const s = sim.current;
  const n = 1 / Math.cos((bank * Math.PI) / 180);
  const vs = pitch * 105 - (n - 1) * 250;
  const rate = (1091 * Math.tan((bank * Math.PI) / 180)) / Math.max(40, s.ias);
  const pos: Record<Inst, [number, number]> = {
    asi: [70, 72],
    ai: [200, 72],
    alt: [330, 72],
    tc: [70, 210],
    hi: [200, 210],
    vsi: [330, 210],
  };
  const click = (i: Inst) => ({
    onClick: () => setSel(i),
    className: "cursor-pointer",
    role: "button" as const,
    "aria-label": INST[i].name,
  });
  const info = INST[sel];

  return (
    <DiagramLayout
      stage={
        <svg
          viewBox="0 0 400 290"
          className="h-auto w-full"
          role="img"
          aria-label="Six basic flight instruments"
        >
          <rect width="400" height="290" fill="oklch(0.1 0.01 258)" />
          <g transform={`translate(${pos.asi[0]} ${pos.asi[1]})`} {...click("asi")}>
            <AirspeedGauge kt={s.ias} selected={sel === "asi"} />
          </g>
          <g transform={`translate(${pos.ai[0]} ${pos.ai[1]})`} {...click("ai")}>
            <AttitudeGauge pitch={pitch} bank={bank} selected={sel === "ai"} />
          </g>
          <g transform={`translate(${pos.alt[0]} ${pos.alt[1]})`} {...click("alt")}>
            <AltimeterGauge ft={s.alt} selected={sel === "alt"} />
          </g>
          <g transform={`translate(${pos.tc[0]} ${pos.tc[1]})`} {...click("tc")}>
            <TurnCoordinatorGauge rate={rate} selected={sel === "tc"} />
          </g>
          <g transform={`translate(${pos.hi[0]} ${pos.hi[1]})`} {...click("hi")}>
            <HeadingGauge heading={s.hdg} selected={sel === "hi"} />
          </g>
          <g transform={`translate(${pos.vsi[0]} ${pos.vsi[1]})`} {...click("vsi")}>
            <VsiGauge fpm={vs} selected={sel === "vsi"} />
          </g>
        </svg>
      }
      controls={
        <>
          <SliderControl
            label="Pitch attitude"
            value={pitch}
            min={-10}
            max={15}
            step={0.5}
            onChange={setPitch}
            format={(v) => `${v > 0 ? "+" : ""}${v}°`}
          />
          <SliderControl
            label="Bank angle"
            value={bank}
            min={-45}
            max={45}
            onChange={setBank}
            format={(v) => (v === 0 ? "0°" : `${Math.abs(v)}° ${v > 0 ? "right" : "left"}`)}
          />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => setRunning((r) => !r)}>
              {running ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
              {running ? "Freeze" : "Resume"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                sim.current = { alt: 3000, hdg: 90, ias: 105 };
                setPitch(0);
                setBank(0);
                setTick((x) => x + 1);
              }}
            >
              <RotateCcw className="size-3.5" />
              Straight & level
            </Button>
          </div>
        </>
      }
      info={
        <div className="rounded-md border bg-card p-3 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-1">
            <p className="font-semibold text-cyan">{info.name}</p>
            <span className="text-[10px] text-muted-foreground">{info.system}</span>
          </div>
          <p className="mt-1.5 leading-relaxed text-muted-foreground">{info.text}</p>
          <p className="mt-1.5 leading-relaxed">
            <span className="font-semibold text-caution">Errors & limits: </span>
            <span className="text-muted-foreground">{info.errors}</span>
          </p>
          <p className="mt-2 text-[10px] text-muted-foreground">
            Click any instrument to learn about it. Move the sliders and watch all six respond
            together.
          </p>
        </div>
      }
    />
  );
}

/* ------------------------------------------------------------------------------------------ */
/* Pitot-static system failures                                                                */
/* ------------------------------------------------------------------------------------------ */

const BLOCK_ALT = 5000;
const BLOCK_IAS = 110;
/** Static pressure (inHg) — linearised ~1 inHg per 1,000 ft for this demonstration. */
const pStatic = (alt: number) => 29.92 - alt / 1000;
/** Dynamic pressure (inHg) for an indicated airspeed. */
const qFor = (ias: number) => 0.479 * (ias / 100) ** 2;
const iasFor = (q: number) => (q <= 0 ? 0 : 100 * Math.sqrt(q / 0.479));

export function PitotStaticDiagram() {
  const [pitotBlocked, setPitotBlocked] = useState(false);
  const [drainBlocked, setDrainBlocked] = useState(true);
  const [staticBlocked, setStaticBlocked] = useState(false);
  const [altStatic, setAltStatic] = useState(false);
  const [alt, setAlt] = useState(BLOCK_ALT);
  const [ias, setIas] = useState(BLOCK_IAS);
  const [vsHint, setVsHint] = useState(0);
  const prevAlt = useRef(alt);

  useEffect(() => {
    setVsHint(alt - prevAlt.current);
    prevAlt.current = alt;
    const t = window.setTimeout(() => setVsHint(0), 900);
    return () => window.clearTimeout(t);
  }, [alt]);

  const staticSeen =
    staticBlocked && !altStatic
      ? pStatic(BLOCK_ALT)
      : altStatic
        ? pStatic(alt) - 0.05
        : pStatic(alt);
  let totalSeen = pStatic(alt) + qFor(ias);
  if (pitotBlocked) totalSeen = drainBlocked ? pStatic(BLOCK_ALT) + qFor(BLOCK_IAS) : staticSeen;
  const indIas = iasFor(totalSeen - staticSeen);
  const indAlt = (29.92 - staticSeen) * 1000;
  const vsiMoving =
    staticBlocked && !altStatic ? 0 : Math.sign(vsHint) * Math.min(2000, Math.abs(vsHint) * 8);

  const affected: string[] = [];
  if (pitotBlocked && drainBlocked)
    affected.push(
      "Airspeed acts like an altimeter: reads higher in a climb, lower in a descent (trapped pitot pressure).",
    );
  if (pitotBlocked && !drainBlocked)
    affected.push("Airspeed drops to zero: pitot pressure vents out through the open drain hole.");
  if (staticBlocked && !altStatic) {
    affected.push("Altimeter freezes at the altitude where the blockage occurred.");
    affected.push("VSI reads zero regardless of actual climb or descent.");
    if (!pitotBlocked)
      affected.push(
        "Airspeed reads low in a climb and high in a descent (dangerous — risk of overspeed when descending).",
      );
  }
  if (altStatic)
    affected.push(
      "Alternate static (cabin) pressure is slightly lower: altimeter and airspeed read a little high; the VSI shows a momentary climb when it is selected.",
    );

  const block = (on: boolean) => (on ? C.warn : C.ok);

  return (
    <DiagramLayout
      stage={
        <svg
          viewBox="0 0 400 270"
          className="h-auto w-full"
          role="img"
          aria-label="Pitot-static system"
        >
          <rect width="400" height="270" fill="oklch(0.1 0.01 258)" />
          {/* plumbing */}
          <g fill="none" strokeWidth="3">
            <path d="M24,40 L70,40 L70,108" stroke={block(pitotBlocked)} />
            <path
              d="M24,236 L340,236 L340,190 M200,236 L200,190 M70,236 L70,190"
              stroke={block(staticBlocked && !altStatic)}
            />
          </g>
          <g fontSize="9" fill={C.muted}>
            <text x="8" y="28">
              PITOT TUBE
            </text>
            <text x="8" y="256">
              STATIC PORT
            </text>
          </g>
          <path d="M8,36 L28,36 L28,44 L8,44 Z" fill="#94a3b8" />
          <circle cx="20" cy="236" r="6" fill="#94a3b8" />
          {pitotBlocked ? (
            <text x="4" y="62" fill={C.warn} fontSize="10" fontWeight="700">
              ✕ {drainBlocked ? "inlet + drain" : "inlet only"}
            </text>
          ) : null}
          {staticBlocked ? (
            <text x="34" y="226" fill={C.warn} fontSize="10" fontWeight="700">
              ✕ blocked
            </text>
          ) : null}
          {altStatic ? (
            <text x="230" y="262" fill={C.caution} fontSize="9" fontWeight="600">
              ALTERNATE STATIC (cabin) OPEN
            </text>
          ) : null}
          <g transform="translate(70 142)">
            <AirspeedGauge kt={indIas} label={`ASI ${Math.round(indIas)} KT`} />
          </g>
          <g transform="translate(200 142)">
            <AltimeterGauge
              ft={indAlt}
              label={`ALT ${Math.round(indAlt).toLocaleString("en-US")}`}
            />
          </g>
          <g transform="translate(340 142)">
            <VsiGauge fpm={vsiMoving} label="VSI" />
          </g>
          <text x="120" y="22" fill={C.muted} fontSize="9">
            Blockage scenario starts at {BLOCK_ALT.toLocaleString("en-US")} ft, {BLOCK_IAS} KIAS
          </text>
        </svg>
      }
      controls={
        <>
          <div className="flex flex-wrap gap-1.5">
            <ToggleChip
              on={pitotBlocked}
              onToggle={() => setPitotBlocked((v) => !v)}
              tone="warning"
            >
              Pitot blocked (ice)
            </ToggleChip>
            {pitotBlocked ? (
              <ToggleChip
                on={drainBlocked}
                onToggle={() => setDrainBlocked((v) => !v)}
                tone="warning"
              >
                Drain hole blocked too
              </ToggleChip>
            ) : null}
            <ToggleChip
              on={staticBlocked}
              onToggle={() => setStaticBlocked((v) => !v)}
              tone="warning"
            >
              Static port blocked
            </ToggleChip>
            <ToggleChip on={altStatic} onToggle={() => setAltStatic((v) => !v)} tone="caution">
              Alternate static
            </ToggleChip>
          </div>
          <SliderControl
            label="Actual altitude (climb / descend)"
            value={alt}
            min={2000}
            max={8000}
            step={100}
            onChange={setAlt}
            format={(v) => `${v.toLocaleString("en-US")} ft`}
          />
          <SliderControl
            label="Actual indicated airspeed"
            value={ias}
            min={60}
            max={150}
            onChange={setIas}
            format={(v) => `${v} kt`}
          />
        </>
      }
      info={
        <>
          <div className="grid grid-cols-2 gap-2">
            <Readout
              label="True altitude"
              value={`${alt.toLocaleString("en-US")} ft`}
              tone="default"
            />
            <Readout
              label="Indicated"
              value={`${Math.round(indAlt).toLocaleString("en-US")} ft`}
              tone={Math.abs(indAlt - alt) > 60 ? "warning" : "ok"}
            />
            <Readout label="Actual airspeed" value={`${ias} kt`} tone="default" />
            <Readout
              label="Indicated"
              value={`${Math.round(indIas)} kt`}
              tone={Math.abs(indIas - ias) > 3 ? "warning" : "ok"}
            />
          </div>
          <ul
            className={cn(
              "space-y-1 text-xs leading-relaxed",
              affected.length ? "text-foreground" : "text-muted-foreground",
            )}
          >
            {affected.length ? (
              affected.map((a) => <li key={a}>• {a}</li>)
            ) : (
              <li>
                All instruments normal. Toggle a blockage, then move the altitude slider to see the
                effect.
              </li>
            )}
          </ul>
        </>
      }
    />
  );
}
