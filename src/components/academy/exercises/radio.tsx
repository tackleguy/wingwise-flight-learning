import { useState } from "react";
import { Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { lightSignalMeaning, type LightColor, type LightMode } from "../diagrams/airport";
import { pick, shuffle } from "../navmath";
import { Choices, ExerciseFrame, Feedback, Loading, useGenerated, useScore } from "./shared";

/* ------------------------------------------------------------------------------------------ */
/* Light gun signals                                                                           */
/* ------------------------------------------------------------------------------------------ */

const SIGNALS: { color: LightColor; mode: LightMode }[] = [
  { color: "green", mode: "steady" },
  { color: "green", mode: "flashing" },
  { color: "red", mode: "steady" },
  { color: "red", mode: "flashing" },
  { color: "white", mode: "flashing" },
  { color: "alternating", mode: "flashing" },
];

const ALL_MEANINGS = Array.from(
  new Set(
    SIGNALS.flatMap((s) => [lightSignalMeaning(s.color, s.mode, "ground"), lightSignalMeaning(s.color, s.mode, "air")]).filter(
      (m): m is string => !!m && m !== "Not applicable",
    ),
  ),
);

function genLight() {
  for (;;) {
    const s = pick(SIGNALS);
    const where = pick(["ground", "air"] as const);
    const meaning = lightSignalMeaning(s.color, s.mode, where);
    if (!meaning || meaning === "Not applicable") continue;
    const wrong = shuffle(ALL_MEANINGS.filter((m) => m !== meaning)).slice(0, 3);
    const choices = shuffle([meaning, ...wrong]);
    return { ...s, where, meaning, choices, answer: choices.indexOf(meaning) };
  }
}

export function LightGunSignalsExercise() {
  const { item, next } = useGenerated(genLight);
  const { score, record } = useScore();
  const [sel, setSel] = useState<number | null>(null);
  if (!item) return <Loading />;
  const hex = item.color === "red" ? "#ef4444" : item.color === "white" ? "#f8fafc" : "#22c55e";
  const label = item.color === "alternating" ? "Alternating red and green" : `${item.mode === "steady" ? "Steady" : "Flashing"} ${item.color}`;
  return (
    <ExerciseFrame
      score={score}
      onNext={() => {
        next();
        setSel(null);
      }}
      nextLabel="Next signal"
      instructions="Your radio has failed. The tower points the light gun at you — what does the signal mean? (14 CFR 91.125)"
    >
      <div className="grid gap-4 sm:grid-cols-[180px_1fr]">
        <div className="avionics-screen flex flex-col items-center justify-center gap-2 p-4">
          <div className="relative size-20">
            <div className={cn("absolute inset-0 rounded-full", item.mode === "flashing" && "animate-annunciator")} style={{ background: hex, boxShadow: `0 0 28px ${hex}` }} />
            {item.color === "alternating" ? (
              <div className="animate-annunciator absolute inset-0 rounded-full" style={{ background: "#ef4444", boxShadow: "0 0 28px #ef4444", animationDelay: "0.5s" }} />
            ) : null}
          </div>
          <p className="text-center text-xs font-semibold">{label}</p>
          <p className="text-center text-[11px] text-cyan">Aircraft {item.where === "air" ? "in flight" : "on the ground"}</p>
        </div>
        <div className="space-y-2">
          <Choices
            choices={item.choices}
            selected={sel}
            answer={item.answer}
            revealed={sel !== null}
            onSelect={(i) => {
              setSel(i);
              record(i === item.answer);
            }}
          />
          {sel !== null ? (
            <Feedback ok={sel === item.answer}>
              {label} {item.where === "air" ? "to an aircraft in flight" : "to an aircraft on the ground"} means: <strong>{item.meaning}</strong>.
            </Feedback>
          ) : null}
        </div>
      </div>
    </ExerciseFrame>
  );
}

/* ------------------------------------------------------------------------------------------ */
/* Radio phraseology                                                                           */
/* ------------------------------------------------------------------------------------------ */

interface OrderTask {
  kind: "order";
  situation: string;
  parts: string[];
  explanation: string;
}
interface ReadbackTask {
  kind: "readback";
  situation: string;
  atc: string;
  choices: string[];
  answer: number;
  explanation: string;
}
type RadioTask = OrderTask | ReadbackTask;

const ORDER_TASKS: OrderTask[] = [
  {
    kind: "order",
    situation: "You are 10 miles north of Lincoln (towered, Class D) at 3,500 ft and want to land. You have ATIS information Bravo.",
    parts: ["Lincoln Tower,", "Skyhawk 3-4-5-Tango-X-ray,", "one-zero miles north at three thousand five hundred,", "inbound for landing", "with information Bravo."],
    explanation: "Initial call-up: who you are calling, who you are, where you are, what you want, and the ATIS code (AIM 4-2-3).",
  },
  {
    kind: "order",
    situation: "You are parked at the FBO at Lincoln, ready to taxi for a VFR departure to the south, with ATIS Charlie.",
    parts: ["Lincoln Ground,", "Skyhawk 3-4-5-Tango-X-ray,", "at the FBO,", "ready to taxi, VFR southbound,", "with information Charlie."],
    explanation: "Ground: facility, call sign, your location on the airport, your request with direction of flight, and the ATIS code.",
  },
  {
    kind: "order",
    situation: "Departing a non-towered airport, Centerville. You are on runway 27, about to take off, remaining in the pattern.",
    parts: ["Centerville traffic,", "Skyhawk 3-4-5-Tango-X-ray,", "departing runway two-seven,", "remaining in the pattern,", "Centerville."],
    explanation: "CTAF calls start and end with the airport name so pilots on a shared frequency know which airport you mean (AC 90-66C).",
  },
  {
    kind: "order",
    situation: "Cruising VFR 15 miles east of Denver at 9,500 ft, you want flight following to Pueblo.",
    parts: ["Denver Approach,", "Skyhawk 3-4-5-Tango-X-ray,", "one-five miles east at niner thousand five hundred,", "request flight following", "to Pueblo."],
    explanation: "Flight following request: facility, call sign, position and altitude, then the request and destination. Some pilots make a short initial call first and wait for \"go ahead\".",
  },
  {
    kind: "order",
    situation: "Holding short of runway 27 at Lincoln, ready for departure to the west.",
    parts: ["Lincoln Tower,", "Skyhawk 3-4-5-Tango-X-ray,", "holding short runway two-seven,", "ready for departure,", "westbound."],
    explanation: "Tower departure call: who, who you are, where you are (runway), and what you want.",
  },
];

const READBACK_TASKS: ReadbackTask[] = [
  {
    kind: "readback",
    situation: "Taxiing at a towered airport.",
    atc: "Skyhawk 345TX, runway 27, taxi via Alpha, hold short of runway 32.",
    choices: [
      "Runway 27, taxi via Alpha, hold short runway 32, Skyhawk 345TX.",
      "Taxi via Alpha to 27, Skyhawk 345TX.",
      "Roger, Skyhawk 345TX.",
      "Runway 32, taxi via Alpha, hold short runway 27, Skyhawk 345TX.",
    ],
    answer: 0,
    explanation: "Pilots must read back all runway hold-short instructions, plus the assigned runway and taxi route. \"Roger\" only acknowledges receipt — it is not a readback.",
  },
  {
    kind: "readback",
    situation: "Inbound to a Class C airport.",
    atc: "Skyhawk 345TX, squawk 4-5-2-1.",
    choices: ["Squawk 4521, Skyhawk 345TX.", "Wilco, Skyhawk 345TX.", "Squawking 4251, Skyhawk 345TX.", "Roger, 345TX."],
    answer: 0,
    explanation: "Read back transponder codes exactly so the controller can catch a mis-hearing.",
  },
  {
    kind: "readback",
    situation: "On departure.",
    atc: "Skyhawk 345TX, contact Lincoln Departure 124.6.",
    choices: ["124.6, Skyhawk 345TX.", "Contact departure, Skyhawk 345TX.", "Roger, switching.", "124.6, good day."],
    answer: 0,
    explanation: "Read back the frequency and end with your call sign. Adding \"good day\" is fine, but the call sign is required.",
  },
  {
    kind: "readback",
    situation: "On the downwind leg.",
    atc: "Skyhawk 345TX, runway 27, cleared to land.",
    choices: ["Cleared to land runway 27, Skyhawk 345TX.", "Cleared to land, 345TX.", "Roger, landing.", "Runway 27, Skyhawk 345TX."],
    answer: 0,
    explanation: "Landing and takeoff clearances are read back with the runway number (AIM 4-4-7). Omitting the runway can hide a wrong-runway error.",
  },
  {
    kind: "readback",
    situation: "VFR flight following.",
    atc: "Skyhawk 345TX, climb and maintain 5,500, turn left heading 270.",
    choices: ["Climb and maintain 5,500, left heading 270, Skyhawk 345TX.", "Left 270, Skyhawk 345TX.", "Wilco.", "Climb to 5,500, right 270, Skyhawk 345TX."],
    answer: 0,
    explanation: "Read back altitude assignments and headings (with turn direction) so errors can be caught.",
  },
  {
    kind: "readback",
    situation: "On the ground, before departure.",
    atc: "Skyhawk 345TX, cleared to Pueblo via radar vectors, then direct. Climb and maintain 5,000, expect 9,000 one zero minutes after departure. Departure frequency 124.6, squawk 4-5-2-1.",
    choices: [
      "Cleared to Pueblo via radar vectors then direct, climb and maintain 5,000, expect 9,000 one zero minutes after departure, departure 124.6, squawk 4521, Skyhawk 345TX.",
      "Cleared as filed, 5,000, squawk 4521, Skyhawk 345TX.",
      "Cleared to Pueblo, climb 9,000, 124.6, squawk 4521, Skyhawk 345TX.",
      "Roger, copied, Skyhawk 345TX.",
    ],
    answer: 0,
    explanation: "Read back an IFR clearance in full (CRAFT: Clearance limit, Route, Altitude, Frequency, Transponder). The initial altitude is 5,000 — 9,000 is only expected.",
  },
];

function genRadio(): RadioTask {
  const t = Math.random() < 0.5 ? pick(ORDER_TASKS) : pick(READBACK_TASKS);
  if (t.kind === "readback") {
    const correct = t.choices[t.answer] ?? "";
    const choices = shuffle(t.choices);
    return { ...t, choices, answer: choices.indexOf(correct) };
  }
  return t;
}

export function RadioPhraseologyExercise() {
  const { item, next, round } = useGenerated(genRadio);
  const { score, record } = useScore();
  if (!item) return <Loading />;
  return (
    <ExerciseFrame score={score} onNext={next} nextLabel="Next call" instructions="Practise standard phraseology from the AIM Pilot/Controller Glossary and AIM chapter 4.">
      {item.kind === "order" ? <OrderCall key={`o${round}`} task={item} onDone={record} /> : <Readback key={`r${round}`} task={item} onDone={record} />}
    </ExerciseFrame>
  );
}

function OrderCall({ task, onDone }: { task: OrderTask; onDone: (ok: boolean) => void }) {
  const [pool] = useState(() => shuffle(task.parts.map((p, i) => ({ p, i }))));
  const [picked, setPicked] = useState<number[]>([]);
  const [checked, setChecked] = useState(false);
  const ok = picked.length === task.parts.length && picked.every((v, i) => v === i);
  return (
    <div className="space-y-3">
      <div className="rounded-md border border-cyan/30 bg-cyan/5 px-3 py-2 text-sm">
        <span className="label-caps mr-2 text-cyan">Situation</span>
        {task.situation}
      </div>
      <p className="text-xs text-muted-foreground">Tap the phrases in the order you would say them.</p>
      <div className="min-h-12 rounded-md border bg-panel p-2.5 font-mono text-[13px] leading-relaxed">
        {picked.length ? picked.map((i) => task.parts[i]).join(" ") : <span className="text-muted-foreground/60">Your transmission…</span>}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {pool.map(({ p, i }) => (
          <button
            key={i}
            type="button"
            disabled={picked.includes(i) || checked}
            onClick={() => setPicked((s) => [...s, i])}
            className="rounded-md border px-2.5 py-1.5 font-mono text-xs transition-colors hover:border-primary/60 disabled:opacity-30"
          >
            {p}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <Button size="sm" variant="ghost" disabled={!picked.length || checked} onClick={() => setPicked((s) => s.slice(0, -1))}>
          <Undo2 className="size-3.5" />
          Undo
        </Button>
        <Button
          size="sm"
          disabled={picked.length !== task.parts.length || checked}
          onClick={() => {
            setChecked(true);
            onDone(ok);
          }}
        >
          Transmit
        </Button>
      </div>
      {checked ? (
        <Feedback ok={ok} title={ok ? "Good call" : "Correct order"}>
          {!ok ? <p className="mb-1 font-mono">{task.parts.join(" ")}</p> : null}
          {task.explanation}
        </Feedback>
      ) : null}
    </div>
  );
}

function Readback({ task, onDone }: { task: ReadbackTask; onDone: (ok: boolean) => void }) {
  const [sel, setSel] = useState<number | null>(null);
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">{task.situation} ATC transmits:</p>
      <div className="avionics-screen p-3 font-mono text-[13px] leading-relaxed text-ok">"{task.atc}"</div>
      <p className="text-sm font-medium">Choose the correct readback.</p>
      <Choices
        choices={task.choices}
        selected={sel}
        answer={task.answer}
        revealed={sel !== null}
        onSelect={(i) => {
          setSel(i);
          onDone(i === task.answer);
        }}
      />
      {sel !== null ? <Feedback ok={sel === task.answer}>{task.explanation}</Feedback> : null}
    </div>
  );
}
