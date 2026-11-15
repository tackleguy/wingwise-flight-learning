/**
 * The walk-around (preflight) inspection test: a Cessna 172's walk-around items, a few randomly
 * planted problems, and the grading of what the student found and decided.
 *
 * Each item is described as the student "sees" it. A problem is either fixable before flight
 * (remove the cover, drain the water, add oil…) or grounding (the aircraft needs a mechanic or
 * the missing document before it may fly).
 */
import type { TestResult } from "./types";
import { PASS_SCORE } from "./types";

export type Area = "Cabin" | "Left wing" | "Nose and engine" | "Right wing" | "Tail";
export const AREAS: readonly Area[] = ["Cabin", "Left wing", "Nose and engine", "Right wing", "Tail"];

interface ItemDef {
  id: string;
  area: Area;
  name: string;
  /** What a good item looks like. */
  ok: string;
  /** Possible problems for this item. */
  problems: { seen: string; grounding: boolean; why: string }[];
}

const ITEMS: readonly ItemDef[] = [
  { id: "docs", area: "Cabin", name: "Aircraft documents (airworthiness certificate, registration, operating handbook, weight & balance)", ok: "All four are in the document pocket.", problems: [{ seen: "The registration certificate is not on board.", grounding: true, why: "The aircraft may not fly without its registration certificate on board." }] },
  { id: "lock", area: "Cabin", name: "Control lock", ok: "Removed and stowed; the yoke moves freely.", problems: [{ seen: "The control lock is still in the yoke.", grounding: false, why: "Remove it — a take-off with the controls locked is usually fatal." }] },
  { id: "fuelgauges", area: "Cabin", name: "Fuel gauges (master switch on)", ok: "Both gauges read about 20 gallons.", problems: [{ seen: "Both gauges read almost empty — about 2 gallons each.", grounding: false, why: "Refuel before flight (and check the tanks visually)." }] },
  { id: "flaps", area: "Cabin", name: "Flaps (lower them for the walk-around)", ok: "They run down smoothly to full.", problems: [{ seen: "Nothing happens when you select the flaps down.", grounding: true, why: "A flap system fault needs a mechanic." }] },
  { id: "sumpL", area: "Left wing", name: "Fuel sample from the left tank drain", ok: "Clear blue fuel, no water, no dirt.", problems: [{ seen: "A clear bubble of water sits at the bottom of the sample cup.", grounding: false, why: "Keep draining samples until no water is left." }] },
  { id: "capL", area: "Left wing", name: "Left fuel cap and quantity", ok: "Fuel near the top; the cap is tight.", problems: [{ seen: "The fuel cap is loose and does not lock.", grounding: false, why: "Secure it — fuel can be sucked out of the tank in flight." }] },
  { id: "ailL", area: "Left wing", name: "Left aileron and hinges", ok: "Moves freely; hinges and bolts secure.", problems: [{ seen: "A crack runs through the outer aileron hinge bracket.", grounding: true, why: "Structural damage to a flight control: a mechanic must repair it." }] },
  { id: "stallvent", area: "Left wing", name: "Stall-warning opening (leading edge)", ok: "Clear; it whistles when you suck on it.", problems: [{ seen: "A wasp nest blocks the stall-warning opening.", grounding: false, why: "Clear it — without it there is no stall warning." }] },
  { id: "tieL", area: "Left wing", name: "Left wing tie-down", ok: "Untied.", problems: [{ seen: "The rope is still tied to the wing.", grounding: false, why: "Untie it before taxiing." }] },
  { id: "oil", area: "Nose and engine", name: "Engine oil (dipstick)", ok: "6 quarts.", problems: [{ seen: "Just over 3 quarts.", grounding: false, why: "Below the minimum: add oil (about 6 quarts for a normal flight)." }] },
  { id: "prop", area: "Nose and engine", name: "Propeller and spinner", ok: "No nicks or cracks; spinner secure.", problems: [{ seen: "A deep nick in the leading edge of one blade, near the tip.", grounding: true, why: "A nicked propeller can crack and lose its tip: a mechanic must dress or replace it." }] },
  { id: "cowl", area: "Nose and engine", name: "Air intake and cowling openings", ok: "Clear.", problems: [{ seen: "Straw and twigs — a bird's nest — inside the cowling.", grounding: false, why: "Remove it all (it is a fire risk) and look for more." }] },
  { id: "strainer", area: "Nose and engine", name: "Fuel strainer sample (under the engine)", ok: "Clear blue fuel.", problems: [{ seen: "The fuel is clear (not blue) and smells of kerosene.", grounding: true, why: "Jet fuel in a piston engine causes engine failure: the tanks must be drained by a mechanic." }] },
  { id: "nosegear", area: "Nose and engine", name: "Nose wheel tyre and strut", ok: "Tyre inflated, tread fine; strut extended normally.", problems: [{ seen: "The nose tyre is worn through to the cords.", grounding: true, why: "The tyre must be replaced before flight." }] },
  { id: "pitot", area: "Right wing", name: "Pitot tube", ok: "Cover removed; the opening is clear.", problems: [{ seen: "The red pitot cover is still on.", grounding: false, why: "Remove it — otherwise you have no airspeed." }] },
  { id: "static", area: "Right wing", name: "Static port (side of the fuselage)", ok: "Clean and open.", problems: [{ seen: "Tape covers the static port (left after washing the aircraft).", grounding: false, why: "Remove it — otherwise the altimeter and airspeed are wrong." }] },
  { id: "sumpR", area: "Right wing", name: "Fuel sample from the right tank drain", ok: "Clear blue fuel.", problems: [{ seen: "Small dark specks of dirt in the sample.", grounding: false, why: "Keep draining until the samples are clean." }] },
  { id: "mainR", area: "Right wing", name: "Right main tyre and brake", ok: "Tyre inflated; no leaks.", problems: [{ seen: "A puddle of red hydraulic fluid under the brake.", grounding: true, why: "A leaking brake must be repaired before flight." }] },
  { id: "tieR", area: "Right wing", name: "Right wing tie-down", ok: "Untied.", problems: [{ seen: "The rope is still tied to the wing.", grounding: false, why: "Untie it before taxiing." }] },
  { id: "elev", area: "Tail", name: "Elevator, rudder, trim tab and hinges", ok: "Free movement; all bolts and cotter pins in place.", problems: [{ seen: "A bolt on the elevator hinge is loose and its cotter pin is missing.", grounding: true, why: "A flight-control attachment must be repaired by a mechanic." }] },
  { id: "tieT", area: "Tail", name: "Tail tie-down", ok: "Untied.", problems: [{ seen: "The tail is still tied down.", grounding: false, why: "Untie it before taxiing." }] },
];

export type Decision = "go" | "fix-then-go" | "no-go";
export const DECISIONS: { id: Decision; label: string }[] = [
  { id: "go", label: "Safe to fly as it is" },
  { id: "fix-then-go", label: "Safe to fly once I have fixed the problems I found" },
  { id: "no-go", label: "Not safe to fly — it needs a mechanic (or a missing document)" },
];

export interface InspectionItem {
  id: string;
  area: Area;
  name: string;
  /** What the student finds. */
  seen: string;
  /** The planted problem, if any. */
  problem: { grounding: boolean; why: string } | null;
}

/** A fresh inspection with 0–3 planted problems (`rand` returns 0…1). */
export function makeInspection(rand: () => number = Math.random): InspectionItem[] {
  const r = rand();
  const count = r < 0.12 ? 0 : r < 0.37 ? 1 : r < 0.75 ? 2 : 3;
  // shuffle the item indices (Fisher–Yates) and take the first `count`
  const pool = ITEMS.map((_, i) => i);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.min(i, Math.floor(rand() * (i + 1)));
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  const chosen = new Set(pool.slice(0, count));
  return ITEMS.map((it, i) => {
    const p = chosen.has(i) ? it.problems[Math.floor(rand() * it.problems.length)]! : null;
    return { id: it.id, area: it.area, name: it.name, seen: p ? p.seen : it.ok, problem: p ? { grounding: p.grounding, why: p.why } : null };
  });
}

export function correctDecision(items: readonly InspectionItem[]): Decision {
  if (items.some((i) => i.problem?.grounding)) return "no-go";
  if (items.some((i) => i.problem)) return "fix-then-go";
  return "go";
}

/** Grade the student's marks (item id → "ok" | "problem") and decision. */
export function gradeInspection(items: readonly InspectionItem[], marks: Record<string, "ok" | "problem" | undefined>, decision: Decision | null): TestResult {
  const objectives: TestResult["objectives"] = [];
  const problems = items.filter((i) => i.problem);
  for (const i of problems) {
    const found = marks[i.id] === "problem";
    objectives.push({
      label: `Find: ${i.name.split(" (")[0]}`,
      status: found ? "pass" : "fail",
      detail: `${i.seen} ${i.problem!.why}${found ? "" : " You marked it OK."}`,
      weight: 2,
      critical: i.problem!.grounding,
    });
  }
  const falseAlarms = items.filter((i) => !i.problem && marks[i.id] === "problem");
  const unmarked = items.filter((i) => marks[i.id] === undefined);
  objectives.push({
    label: "Check every item",
    status: unmarked.length ? "fail" : "pass",
    detail: unmarked.length ? `${unmarked.length} item${unmarked.length > 1 ? "s were" : " was"} not checked.` : "Every item checked.",
    weight: 1,
    critical: false,
  });
  objectives.push({
    label: "No false alarms",
    status: falseAlarms.length ? "fail" : "pass",
    detail: falseAlarms.length ? `Marked as a problem although fine: ${falseAlarms.map((i) => i.name.split(" (")[0]).join(", ")}.` : "Nothing good was marked as a problem.",
    weight: 1,
    critical: false,
  });
  const want = correctDecision(items);
  const label = (d: Decision | null) => DECISIONS.find((x) => x.id === d)?.label ?? "no decision";
  objectives.push({
    label: "Make the right go / no-go decision",
    status: decision === want ? "pass" : "fail",
    detail: decision === want ? `Right: "${label(want)}".` : `You chose "${label(decision)}"; the right answer was "${label(want)}".`,
    weight: 3,
    critical: want === "no-go",
  });
  if (!problems.length) objectives.unshift({ label: "This aircraft had no problems", status: "pass", detail: "Everything was in order this time.", weight: 0, critical: false });
  const total = objectives.reduce((a, o) => a + o.weight, 0);
  const got = objectives.reduce((a, o) => a + (o.status === "pass" ? o.weight : 0), 0);
  const criticalOk = objectives.every((o) => !o.critical || o.status === "pass");
  const score = Math.round((100 * got) / Math.max(1, total));
  return {
    id: "walkaround",
    title: "Walk-around inspection",
    score: criticalOk ? score : Math.min(score, PASS_SCORE - 1),
    passed: criticalOk && score >= PASS_SCORE,
    at: Date.now(),
    durationSec: 0,
    endedBecause: "Inspection submitted.",
    objectives,
  };
}
