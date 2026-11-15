/**
 * Collects the numbers measured by tests/physics/validation.test.ts and writes
 *   docs/physics-validation.json   (the raw rows)
 *   docs/PHYSICS-VALIDATION.md     (the table a person reads)
 * The files contain no dates or machine-specific values, so running the tests again without changing
 * the flight model rewrites them byte-for-byte.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export interface ValidationRow {
  /** "performance" rows are compared with handbook values; "handling" rows with a stated expectation. */
  group: "performance" | "handling";
  quantity: string;
  /** Handbook-class value or expectation, as text. */
  published: string;
  simulated: number;
  unit: string;
  /** Accepted range for the simulated value. */
  min: number;
  max: number;
  /** One line: how it was measured. */
  method: string;
  pass: boolean;
  /** Digits after the decimal point used in the table. */
  digits: number;
}

const rows: ValidationRow[] = [];

/** Record one measured value. Returns it so the caller can also `expect` on it. */
export function record(row: Omit<ValidationRow, "pass" | "digits"> & { digits?: number }): ValidationRow {
  const digits = row.digits ?? (Math.abs(row.simulated) >= 100 ? 0 : 1);
  const r: ValidationRow = { ...row, digits, pass: Number.isFinite(row.simulated) && row.simulated >= row.min && row.simulated <= row.max };
  const i = rows.findIndex((x) => x.quantity === r.quantity);
  if (i >= 0) rows[i] = r;
  else rows.push(r);
  return r;
}

const fmt = (v: number, d: number) => (Number.isFinite(v) ? v.toFixed(d) : "n/a");
const range = (r: ValidationRow) => {
  const lo = Number.isFinite(r.min) ? fmt(r.min, r.digits) : "";
  const hi = Number.isFinite(r.max) ? fmt(r.max, r.digits) : "";
  if (lo && hi) return `${lo} to ${hi}`;
  if (hi) return `at most ${hi}`;
  return `at least ${lo}`;
};

function table(group: ValidationRow["group"], firstHeader: string): string {
  const out = [`| Quantity | ${firstHeader} | Simulated | Accepted range | Result | How it was measured |`, "| --- | --- | --- | --- | --- | --- |"];
  for (const r of rows.filter((x) => x.group === group)) {
    out.push(`| ${r.quantity} | ${r.published} | ${fmt(r.simulated, r.digits)} ${r.unit} | ${range(r)} ${r.unit} | ${r.pass ? "pass" : "**FAIL**"} | ${r.method} |`);
  }
  return out.join("\n");
}

export function markdown(): string {
  const failed = rows.filter((r) => !r.pass).length;
  return `# Flight-model validation — SkyReady Flight Simulator

This page is **written by an automated test** (\`tests/physics/validation.test.ts\`). To regenerate it:

\`\`\`bash
cd flightsim && npx vitest run tests/physics/validation.test.ts
\`\`\`

The test flies the real simulator (the same JSBSim flight model the browser loads, in
\`public/jsbsim/\`) with a scripted test pilot, measures each quantity, and compares it with
Cessna 172P *Pilot's Operating Handbook*-class figures. The raw numbers are in
\`docs/physics-validation.json\`.

**Read this first.** The simulator is a learning aid, not an approved training device. The
"published" figures below are the handbook-class reference values listed in the project's
validation brief (2,400 lb, sea level, standard day unless noted); they are for education only —
always use the handbook of the real aircraft you fly. A "pass" means the simulation is inside the
accepted range, not that it is certified to behave like the aircraft.

Result of the last run: **${rows.length - failed} of ${rows.length} checks passed${failed ? ` — ${failed} FAILED` : ""}.**

Unless a row says otherwise: 2,400 lb (maximum weight), flaps up, standard atmosphere, no wind.
"KIAS" (what the airspeed indicator shows) is converted to the calibrated airspeed the flight model
works in with the handbook's airspeed-calibration table (\`src/physics/constants.ts\`).

## 1. Performance against handbook-class figures

${table("performance", "Published")}

## 2. Handling qualities

There are no handbook numbers for most of these; the "expected" column says what a pilot of the real
aircraft would expect to see, and the accepted range is what the tests enforce.

${table("handling", "Expected")}

## 3. What these numbers do not show

See \`docs/notes/physics.md\` for the full, honest list. In short: the stall and spin behaviour is
built from textbook aerodynamics and tuned to feel right, not matched to flight-test data; engine
temperatures are JSBSim's simple model; and the left-turning tendencies are physically reasoned
estimates sized so that the rudder needed in the climb and on the take-off roll is plausible.
`;
}

export function writeReport(): void {
  const docs = path.join(root, "docs");
  mkdirSync(docs, { recursive: true });
  const json = {
    note: "Written by tests/physics/validation.test.ts — do not edit by hand.",
    rows: rows.map((r) => ({ ...r, simulated: Number.isFinite(r.simulated) ? Number(r.simulated.toFixed(r.digits + 1)) : null, min: Number.isFinite(r.min) ? r.min : null, max: Number.isFinite(r.max) ? r.max : null })),
  };
  writeFileSync(path.join(docs, "physics-validation.json"), JSON.stringify(json, null, 2) + "\n");
  writeFileSync(path.join(docs, "PHYSICS-VALIDATION.md"), markdown());
}
