import { useState } from "react";
import { norm180, norm360 } from "@/lib/geo";
import { cn } from "@/lib/utils";
import { CdiIndicator, HoldSketch } from "../diagrams/navigation";
import {
  HOLD_ENTRY_TEXT,
  holdingEntry,
  pad3,
  pick,
  rndInt,
  shuffle,
  vorIndication,
  type HoldEntry,
} from "../navmath";
import { Choices, ExerciseFrame, Feedback, Loading, useGenerated, useScore } from "./shared";

const VORS = [
  "OTTER",
  "BADGR",
  "LINCOLN",
  "CEDAR",
  "MAPLE",
  "HAWKS",
  "TIGER",
  "RIVER",
  "SUMMIT",
  "PRAIRIE",
];
const DIRS = ["north", "northeast", "east", "southeast", "south", "southwest", "west", "northwest"];
const dirOf = (brg: number) => DIRS[Math.round(norm360(brg) / 45) % 8] ?? "north";

/* ------------------------------------------------------------------------------------------ */
/* Holding entries                                                                             */
/* ------------------------------------------------------------------------------------------ */

function genHold() {
  for (;;) {
    const radial = rndInt(0, 23) * 15;
    const right = Math.random() < 0.7;
    const hdg = rndInt(1, 72) * 5;
    const inbound = norm360(radial + 180);
    // Avoid headings within 5° of a sector boundary — real pilots would accept either entry there.
    let rel = norm180(hdg - inbound);
    if (!right) rel = -rel;
    const bounds = [-70, 110, 180, -180];
    if (bounds.some((b) => Math.abs(rel - b) < 6)) continue;
    const fix = pick(VORS);
    const inboundWrong = shuffle([radial, norm360(radial + 90), norm360(radial - 90)]).slice(0, 3);
    const opts = shuffle([inbound, ...inboundWrong]);
    return {
      radial,
      right,
      hdg,
      inbound,
      fix,
      entry: holdingEntry(hdg, inbound, right),
      inboundChoices: opts.map((o) => `${pad3(o)}°`),
      inboundAnswer: opts.indexOf(inbound),
    };
  }
}

const ENTRIES: HoldEntry[] = ["direct", "teardrop", "parallel"];

export function HoldingEntryExercise() {
  const { item, next } = useGenerated(genHold);
  const { score, record } = useScore();
  const [q1, setQ1] = useState<number | null>(null);
  const [q2, setQ2] = useState<number | null>(null);
  if (!item) return <Loading />;
  const ans2 = ENTRIES.indexOf(item.entry);
  const radialStr = pad3(item.radial === 0 ? 360 : item.radial);

  return (
    <ExerciseFrame
      score={score}
      onNext={() => {
        next();
        setQ1(null);
        setQ2(null);
      }}
      nextLabel="New clearance"
      instructions="Work out the inbound course from the clearance, then choose the recommended entry for your heading at the fix (AIM 5-3-8)."
    >
      <div className="avionics-screen p-3 font-mono text-[13px] leading-relaxed text-ok">
        "Skyhawk 345TX, hold {dirOf(item.radial)} of the {item.fix} VOR on the {radialStr} radial,{" "}
        {item.right ? "" : "left turns, "}expect further clearance 1-4-3-0, time now 1-4-1-0."
        <div className="mt-2 text-xs text-cyan">
          You are heading {pad3(item.hdg)}° direct to {item.fix}.
        </div>
      </div>
      <div className="space-y-2">
        <p className="text-sm font-medium">1. What is the inbound course to the holding fix?</p>
        <Choices
          choices={item.inboundChoices}
          selected={q1}
          answer={item.inboundAnswer}
          revealed={q1 !== null}
          onSelect={setQ1}
          columns={2}
        />
        {q1 !== null ? (
          <Feedback ok={q1 === item.inboundAnswer}>
            Holding {dirOf(item.radial)} on the {radialStr} radial puts the hold on that radial; you
            fly inbound toward the station, so the inbound course is the reciprocal:{" "}
            {pad3(item.inbound)}°.{" "}
            {item.right
              ? "No turn direction was stated, so turns are to the right (standard)."
              : "Left turns were specified (non-standard)."}
          </Feedback>
        ) : null}
      </div>
      {q1 !== null ? (
        <div className="space-y-2">
          <p className="text-sm font-medium">2. Which entry should you use?</p>
          <div className="grid grid-cols-3 gap-1.5">
            {ENTRIES.map((e, i) => (
              <button
                key={e}
                type="button"
                disabled={q2 !== null}
                onClick={() => {
                  setQ2(i);
                  record(i === ans2);
                }}
                className={cn(
                  "rounded-md border px-2 py-2 text-sm font-medium capitalize",
                  q2 === null && "hover:border-primary/60 hover:bg-accent/40",
                  q2 !== null && i === ans2 && "border-ok/60 bg-ok/10 text-ok",
                  q2 === i && i !== ans2 && "border-warning/60 bg-warning/10 text-warning",
                )}
              >
                {e}
              </button>
            ))}
          </div>
          {q2 !== null ? (
            <div className="grid gap-3 md:grid-cols-[1fr_1fr]">
              <div className="avionics-screen overflow-hidden">
                <HoldSketch
                  inbound={item.inbound}
                  right={item.right}
                  hdg={item.hdg}
                  fixLabel={item.fix}
                />
              </div>
              <Feedback
                ok={q2 === ans2}
                title={`${item.entry[0]?.toUpperCase()}${item.entry.slice(1)} entry`}
              >
                Your heading {pad3(item.hdg)}° is{" "}
                {Math.abs(norm180(item.hdg - item.inbound)).toFixed(0)}°{" "}
                {norm180(item.hdg - item.inbound) >= 0 ? "right" : "left"} of the inbound course.{" "}
                {HOLD_ENTRY_TEXT[item.entry]}
              </Feedback>
            </div>
          ) : null}
        </div>
      ) : null}
    </ExerciseFrame>
  );
}

/* ------------------------------------------------------------------------------------------ */
/* VOR orientation                                                                             */
/* ------------------------------------------------------------------------------------------ */

function genVor() {
  const radial = rndInt(0, 71) * 5;
  const offset = Math.random() < 0.5 ? 0 : pick([-8, -6, -4, 4, 6, 8]);
  const useTo = Math.random() < 0.5;
  // OBS such that the aircraft is `offset` degrees from the selected radial / its reciprocal.
  const obs = norm360((useTo ? radial + 180 : radial) + offset);
  const ind = vorIndication(radial, obs);
  const radials = shuffle(
    [radial, norm360(radial + 180), norm360(radial + 90), norm360(obs)].filter(
      (v, i, a) => a.indexOf(v) === i,
    ),
  );
  while (radials.length < 4) {
    const extra = norm360(radial + pick([45, -45, 135, -135]));
    if (!radials.includes(extra)) radials.push(extra);
  }
  const posChoices = shuffle(
    Array.from(
      new Set([dirOf(radial), dirOf(radial + 180), dirOf(radial + 90), dirOf(radial - 90)]),
    ),
  );
  return {
    radial,
    obs,
    ind,
    radialChoices: radials.map((r) => `${pad3(r === 0 ? 360 : r)}°`),
    radialAnswer: radials.indexOf(radial),
    posChoices,
    posAnswer: posChoices.indexOf(dirOf(radial)),
  };
}

export function VorOrientationExercise() {
  const { item, next } = useGenerated(genVor);
  const { score, record } = useScore();
  const [q1, setQ1] = useState<number | null>(null);
  const [q2, setQ2] = useState<number | null>(null);
  if (!item) return <Loading />;
  const dots = item.ind.needleDeg / 2;

  return (
    <ExerciseFrame
      score={score}
      onNext={() => {
        next();
        setQ1(null);
        setQ2(null);
      }}
      nextLabel="New position"
      instructions="Read the VOR indicator. Remember: the CDI ignores heading; the TO/FROM flag tells you which side of the station you are on relative to the OBS; each dot is 2°."
    >
      <div className="grid gap-4 sm:grid-cols-[200px_1fr]">
        <div className="flex flex-col items-center gap-1">
          <CdiIndicator obs={item.obs} needleDots={dots} flag={item.ind.flag} size={190} />
          <span className="font-mono text-xs text-muted-foreground">
            OBS {pad3(item.obs)}° · {item.ind.flag} · needle{" "}
            {Math.abs(dots) < 0.1
              ? "centered"
              : `${Math.abs(dots)} dots ${dots > 0 ? "right" : "left"}`}
          </span>
        </div>
        <div className="space-y-3">
          <div className="space-y-2">
            <p className="text-sm font-medium">1. Which radial is the aircraft on?</p>
            <Choices
              choices={item.radialChoices}
              selected={q1}
              answer={item.radialAnswer}
              revealed={q1 !== null}
              onSelect={(i) => {
                setQ1(i);
                record(i === item.radialAnswer);
              }}
              columns={2}
            />
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">
              2. In which direction from the station is the aircraft?
            </p>
            <Choices
              choices={item.posChoices.map((d) => d[0]?.toUpperCase() + d.slice(1))}
              selected={q2}
              answer={item.posAnswer}
              revealed={q2 !== null}
              onSelect={(i) => {
                setQ2(i);
                record(i === item.posAnswer);
              }}
              columns={2}
            />
          </div>
          {q1 !== null && q2 !== null ? (
            <Feedback ok={q1 === item.radialAnswer && q2 === item.posAnswer}>
              OBS {pad3(item.obs)}° with a {item.ind.flag} flag: you are on the side of the station
              where flying {pad3(item.obs)}° would take you{" "}
              {item.ind.flag === "FROM" ? "away from" : "toward"} it.{" "}
              {Math.abs(dots) >= 0.1
                ? `The needle is ${Math.abs(dots)} dots ${dots > 0 ? "right" : "left"}, so the selected course is ${Math.abs(item.ind.offCourseDeg)}° to the ${dots > 0 ? "right" : "left"} — you are on the ${pad3(item.radial)} radial.`
                : `The needle is centered, so you are on the ${pad3(item.radial)} radial.`}{" "}
              Radials are named for the direction they point away from the station, so the{" "}
              {pad3(item.radial)} radial lies {dirOf(item.radial)} of it.
            </Feedback>
          ) : null}
        </div>
      </div>
    </ExerciseFrame>
  );
}

/* ------------------------------------------------------------------------------------------ */
/* Instrument scan — primary / supporting (FAA-H-8083-15)                                      */
/* ------------------------------------------------------------------------------------------ */

const INSTR = [
  "Attitude indicator",
  "Altimeter",
  "Airspeed indicator",
  "Vertical speed indicator",
  "Heading indicator",
  "Turn coordinator",
  "Tachometer / manifold pressure",
] as const;
type Instr = (typeof INSTR)[number];

const MANEUVERS: { name: string; pitch: Instr; bank: Instr; power: Instr; note: string }[] = [
  {
    name: "Straight-and-level flight at constant airspeed",
    pitch: "Altimeter",
    bank: "Heading indicator",
    power: "Airspeed indicator",
    note: "The altimeter shows whether altitude is being held, the heading indicator whether heading is held, and the airspeed indicator whether power is correct. AI and VSI support pitch; AI and turn coordinator support bank; tach/MP supports power.",
  },
  {
    name: "Level standard-rate turn (established)",
    pitch: "Altimeter",
    bank: "Turn coordinator",
    power: "Airspeed indicator",
    note: "Once established, the turn coordinator is primary for bank because it shows the standard rate. (During roll-in the attitude indicator is primary.) Altimeter primary for pitch; airspeed primary for power.",
  },
  {
    name: "Constant-airspeed climb (established, straight)",
    pitch: "Airspeed indicator",
    bank: "Heading indicator",
    power: "Tachometer / manifold pressure",
    note: "Power is set to climb power and left there, so tach/MP is primary for power; pitch is adjusted to hold the climb airspeed, so the airspeed indicator is primary for pitch.",
  },
  {
    name: "Constant-rate climb (e.g. 500 fpm at 90 KIAS)",
    pitch: "Vertical speed indicator",
    bank: "Heading indicator",
    power: "Airspeed indicator",
    note: "Pitch controls the rate (VSI primary for pitch) and power controls the airspeed (airspeed indicator primary for power).",
  },
  {
    name: "Constant-airspeed descent (straight)",
    pitch: "Airspeed indicator",
    bank: "Heading indicator",
    power: "Tachometer / manifold pressure",
    note: "As in the constant-airspeed climb: a fixed power setting (tach/MP primary) and pitch for airspeed.",
  },
  {
    name: "Climbing standard-rate turn at constant airspeed",
    pitch: "Airspeed indicator",
    bank: "Turn coordinator",
    power: "Tachometer / manifold pressure",
    note: "Combine the climb (ASI for pitch, tach/MP for power) with the standard-rate turn (turn coordinator for bank).",
  },
  {
    name: "Leveling off from a climb at cruise altitude",
    pitch: "Altimeter",
    bank: "Heading indicator",
    power: "Airspeed indicator",
    note: "Lead the level-off by about 10% of the vertical speed; once level, the altimeter becomes primary for pitch and power is reduced to cruise when the airspeed indicator approaches cruise speed.",
  },
];

function genScan() {
  const m = pick(MANEUVERS);
  return { m };
}

export function InstrumentScanExercise() {
  const { item, next } = useGenerated(genScan);
  const { score, record } = useScore();
  const [a, setA] = useState<{ pitch: Instr | null; bank: Instr | null; power: Instr | null }>({
    pitch: null,
    bank: null,
    power: null,
  });
  const [checked, setChecked] = useState(false);
  if (!item) return <Loading />;
  const m = item.m;
  const ok = { pitch: a.pitch === m.pitch, bank: a.bank === m.bank, power: a.power === m.power };
  const all = ok.pitch && ok.bank && ok.power;
  const ready = a.pitch && a.bank && a.power;

  return (
    <ExerciseFrame
      score={score}
      onNext={() => {
        next();
        setA({ pitch: null, bank: null, power: null });
        setChecked(false);
      }}
      nextLabel="New maneuver"
      instructions="Primary/supporting method (Instrument Flying Handbook, FAA-H-8083-15): for each control function, pick the PRIMARY instrument — the one that shows whether the desired value is being maintained."
    >
      <div className="rounded-md border border-cyan/30 bg-cyan/5 px-3 py-2 text-sm font-medium">
        {m.name}
      </div>
      {(["pitch", "bank", "power"] as const).map((k) => (
        <div key={k} className="space-y-1.5">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Primary for {k}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {INSTR.map((ins) => (
              <button
                key={ins}
                type="button"
                disabled={checked}
                onClick={() => setA({ ...a, [k]: ins })}
                className={cn(
                  "rounded-md border px-2.5 py-1.5 text-xs",
                  !checked && a[k] === ins && "border-primary bg-primary/15 text-primary",
                  !checked && a[k] !== ins && "text-muted-foreground hover:text-foreground",
                  checked && ins === m[k] && "border-ok/60 bg-ok/10 text-ok",
                  checked &&
                    a[k] === ins &&
                    ins !== m[k] &&
                    "border-warning/60 bg-warning/10 text-warning",
                  checked && ins !== m[k] && a[k] !== ins && "opacity-50",
                )}
              >
                {ins}
              </button>
            ))}
          </div>
        </div>
      ))}
      {!checked ? (
        <button
          type="button"
          disabled={!ready}
          onClick={() => {
            setChecked(true);
            record(all);
          }}
          className="inline-flex h-8 items-center rounded-lg btn-glow px-3 text-xs font-semibold text-primary-foreground disabled:opacity-40"
        >
          Check
        </button>
      ) : (
        <Feedback ok={all}>{m.note}</Feedback>
      )}
    </ExerciseFrame>
  );
}
