import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/app/page";
import { cn } from "@/lib/utils";
import {
  CATEGORY_INFO,
  describeCloud,
  describeWind,
  formatVisibility,
  parseMetar,
  type FlightCategory,
} from "@/lib/weather/metar";
import { CHANGE_TEXT, formatObsTime, parseTaf, prevailingAt, type Taf } from "@/lib/weather/taf";
import { pick, rndInt, shuffle } from "../navmath";
import {
  AnswerField,
  Choices,
  ExerciseFrame,
  Feedback,
  Loading,
  parseLooseNumber,
  useGenerated,
  useScore,
  within,
} from "./shared";

const STATIONS = [
  "KORD",
  "KDEN",
  "KSEA",
  "KBOS",
  "KATL",
  "KPHX",
  "KMSP",
  "KSFO",
  "KDFW",
  "KMIA",
  "KJFK",
  "KPDX",
  "KSLC",
  "KBDL",
  "KCLT",
  "KMKE",
  "KDSM",
  "KOKC",
];
const pad2 = (n: number) => String(n).padStart(2, "0");
const pad3 = (n: number) => String(n).padStart(3, "0");
const tempStr = (t: number) => (t < 0 ? `M${pad2(-t)}` : pad2(t));

const VIS = [
  "10SM",
  "10SM",
  "10SM",
  "8SM",
  "7SM",
  "6SM",
  "5SM",
  "4SM",
  "3SM",
  "2 1/2SM",
  "2SM",
  "1 1/2SM",
  "1SM",
  "3/4SM",
  "1/2SM",
  "1/4SM",
  "M1/4SM",
] as const;

/* ------------------------------------------------------------------------------------------ */
/* METAR generator                                                                             */
/* ------------------------------------------------------------------------------------------ */

export function generateMetar(): string {
  const station = pick(STATIONS);
  const day = rndInt(1, 28);
  const hour = rndInt(0, 23);
  const parts: string[] = [station, `${pad2(day)}${pad2(hour)}${pick(["51", "53", "56"])}Z`];
  if (Math.random() < 0.25) parts.push("AUTO");

  // Wind
  const wr = Math.random();
  if (wr < 0.1) parts.push("00000KT");
  else if (wr < 0.2) parts.push(`VRB${pad2(rndInt(2, 6))}KT`);
  else {
    const dir = rndInt(1, 36) * 10;
    const spd = rndInt(4, 26);
    const gust = spd >= 10 && Math.random() < 0.4 ? spd + rndInt(7, 15) : null;
    parts.push(`${pad3(dir)}${pad2(spd)}${gust ? `G${pad2(gust)}` : ""}KT`);
    if (spd > 6 && Math.random() < 0.18) {
      const a = (dir - rndInt(3, 6) * 10 + 360) % 360 || 360;
      const b = (dir + rndInt(3, 6) * 10) % 360 || 360;
      parts.push(`${pad3(a)}V${pad3(b)}`);
    }
  }

  // Visibility & weather (kept physically consistent)
  const vis = pick(VIS);
  const visNum = parseLooseNumber(vis.replace("SM", "")) ?? 10;
  parts.push(vis);
  const temp = rndInt(-15, 34);
  const cold = temp <= 1;
  const wx: string[] = [];
  if (visNum < 7) {
    const precip = cold
      ? pick(["-SN", "SN", "+SN", "-FZRA", "-FZDZ", ""])
      : pick(["-RA", "RA", "+RA", "-DZ", "-SHRA", "TSRA", "-TSRA", "", ""]);
    if (precip) wx.push(precip);
    if (visNum < 0.625) wx.push(cold ? "FZFG" : "FG");
    else if (visNum <= 6 && Math.random() < 0.7) wx.push(precip ? "BR" : pick(["BR", "HZ"]));
  } else if (Math.random() < 0.15) wx.push("VCSH");
  parts.push(...wx);

  // Clouds
  const thunder = wx.some((w) => w.includes("TS"));
  if (visNum <= 0.5 && Math.random() < 0.6) {
    parts.push(`VV${pad3(rndInt(1, 3))}`);
  } else {
    const nLayers = visNum >= 7 ? rndInt(0, 3) : rndInt(1, 3);
    if (nLayers === 0) parts.push(Math.random() < 0.5 ? "CLR" : "SKC");
    let h =
      visNum < 1
        ? rndInt(2, 6)
        : visNum < 3
          ? rndInt(5, 12)
          : visNum < 6
            ? rndInt(8, 25)
            : rndInt(15, 60);
    const covers = ["FEW", "SCT", "BKN", "OVC"];
    let ci = rndInt(0, visNum < 3 ? 3 : 2);
    for (let i = 0; i < nLayers; i++) {
      const cov = covers[Math.min(3, ci)] ?? "BKN";
      const cb = thunder && i === 0 ? "CB" : "";
      parts.push(`${cov}${pad3(h)}${cb}`);
      if (cov === "OVC") break;
      h += rndInt(5, 40);
      ci += rndInt(0, 2);
    }
  }

  const dew = Math.max(-30, temp - (visNum < 3 ? rndInt(0, 2) : rndInt(2, 15)));
  parts.push(`${tempStr(temp)}/${tempStr(dew)}`);
  parts.push(`A${rndInt(2950, 3040)}`);
  parts.push("RMK", "AO2", `SLP${pad3(rndInt(0, 999))}`);
  return parts.join(" ");
}

/* ------------------------------------------------------------------------------------------ */
/* METAR decode exercise                                                                       */
/* ------------------------------------------------------------------------------------------ */

const CATS: FlightCategory[] = ["VFR", "MVFR", "IFR", "LIFR"];

export function MetarDecodeExercise() {
  const { item: raw, next } = useGenerated(generateMetar);
  const { score, record } = useScore();
  const [a, setA] = useState({
    dir: "",
    spd: "",
    gust: "",
    vis: "",
    ceil: "",
    cat: "" as FlightCategory | "",
  });
  const [checked, setChecked] = useState(false);

  if (!raw) return <Loading />;
  const m = parseMetar(raw);
  const w = m.wind;

  const dirOk = (() => {
    const v = a.dir.trim().toUpperCase();
    if (!w) return false;
    if (w.calm) return v === "CALM" || v === "0" || v === "000";
    if (w.direction === "VRB") return v === "VRB" || v.startsWith("VAR");
    return within(parseLooseNumber(v), Number(w.direction), 0);
  })();
  const spdOk =
    within(parseLooseNumber(a.spd || "x"), w?.speedKt ?? 0, 0) ||
    (!!w?.calm && (a.spd.trim() === "0" || a.spd.trim() === ""));
  const gustOk = w?.gustKt
    ? within(parseLooseNumber(a.gust || "x"), w.gustKt, 0)
    : a.gust.trim() === "" || a.gust.trim() === "0" || /none/i.test(a.gust);
  const visOk = m.visibility
    ? within(parseLooseNumber(a.vis || "x"), m.visibility.sm, 0.01)
    : false;
  const ceilOk =
    m.ceilingFt === null
      ? a.ceil.trim() === "" || /none|unl|no/i.test(a.ceil)
      : within(parseLooseNumber(a.ceil || "x"), m.ceilingFt, 0) ||
        within(
          parseLooseNumber(a.ceil || "x") !== null ? (parseLooseNumber(a.ceil) ?? 0) * 100 : null,
          m.ceilingFt,
          0,
        );
  const catOk = a.cat === m.flightCategory;
  const allOk = dirOk && spdOk && gustOk && visOk && ceilOk && catOk;

  const check = () => {
    setChecked(true);
    record(allOk);
  };
  const reset = () => {
    next();
    setChecked(false);
    setA({ dir: "", spd: "", gust: "", vis: "", ceil: "", cat: "" });
  };
  const st = (ok: boolean) => (checked ? ok : null);

  return (
    <ExerciseFrame
      score={score}
      onNext={reset}
      nextLabel="New METAR"
      instructions="Decode the observation. Wind direction in degrees true (or VRB / calm). Leave gusts blank if none. Visibility accepts fractions like 1 1/2. Ceiling is the lowest broken, overcast or vertical-visibility layer — leave blank if there is no ceiling."
    >
      <div className="avionics-screen p-3 font-mono text-[13px] leading-relaxed break-words text-ok">
        {raw}
      </div>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        <AnswerField
          label="Wind direction"
          value={a.dir}
          onChange={(v) => setA({ ...a, dir: v })}
          suffix="°"
          status={st(dirOk)}
          inputMode="text"
        />
        <AnswerField
          label="Wind speed"
          value={a.spd}
          onChange={(v) => setA({ ...a, spd: v })}
          suffix="kt"
          status={st(spdOk)}
        />
        <AnswerField
          label="Gusts"
          value={a.gust}
          onChange={(v) => setA({ ...a, gust: v })}
          suffix="kt"
          status={st(gustOk)}
          placeholder="none"
        />
        <AnswerField
          label="Visibility"
          value={a.vis}
          onChange={(v) => setA({ ...a, vis: v })}
          suffix="SM"
          status={st(visOk)}
          inputMode="text"
        />
        <AnswerField
          label="Ceiling"
          value={a.ceil}
          onChange={(v) => setA({ ...a, ceil: v })}
          suffix="ft AGL"
          status={st(ceilOk)}
          placeholder="none"
        />
        <div>
          <span className="mb-1 block text-[11px] font-medium text-muted-foreground">
            Flight category
          </span>
          <div className="grid grid-cols-4 gap-1">
            {CATS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setA({ ...a, cat: c })}
                className={cn(
                  "h-9 rounded-md border font-mono text-[11px] font-semibold",
                  a.cat === c
                    ? "border-primary bg-primary/15 text-primary"
                    : "text-muted-foreground hover:text-foreground",
                  checked && c === m.flightCategory && "border-ok text-ok",
                )}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
      </div>
      {!checked ? (
        <Button size="sm" onClick={check}>
          Check decode
        </Button>
      ) : (
        <>
          <Feedback ok={allOk} title={allOk ? "Perfect decode" : "Review the highlighted fields"}>
            {m.flightCategory ? (
              <>
                Flight category <strong>{m.flightCategory}</strong> —{" "}
                {CATEGORY_INFO[m.flightCategory].rule}. The more restrictive of ceiling and
                visibility decides.
              </>
            ) : null}
          </Feedback>
          <MetarDecodeTable raw={raw} />
        </>
      )}
    </ExerciseFrame>
  );
}

/** Group-by-group decode table for a METAR (reusable). */
export function MetarDecodeTable({ raw }: { raw: string }) {
  const m = parseMetar(raw);
  const rows: [string, string][] = [];
  rows.push(["Station", m.station || "—"]);
  if (m.time)
    rows.push([
      "Observed",
      `Day ${m.time.day}, ${pad2(m.time.hour)}${pad2(m.time.minute)} UTC (Zulu)`,
    ]);
  if (m.auto) rows.push(["AUTO", "Fully automated observation (no human observer)"]);
  rows.push(["Wind", describeWind(m.wind)]);
  rows.push(["Visibility", formatVisibility(m.visibility)]);
  if (m.rvr.length) rows.push(["Runway visual range", m.rvr.join(", ")]);
  if (m.weather.length)
    rows.push(["Weather", m.weather.map((x) => `${x.raw} = ${x.text}`).join("; ")]);
  rows.push(["Sky", m.clouds.length ? m.clouds.map(describeCloud).join("; ") : "—"]);
  rows.push([
    "Ceiling",
    m.ceilingFt !== null ? `${m.ceilingFt.toLocaleString("en-US")} ft AGL` : "None",
  ]);
  if (m.tempC !== null)
    rows.push([
      "Temp / dewpoint",
      `${m.tempC} °C / ${m.dewpointC ?? "—"} °C${m.dewpointC !== null ? ` (spread ${m.tempC - m.dewpointC} °C)` : ""}`,
    ]);
  if (m.altimeter)
    rows.push(["Altimeter", `${m.altimeter.inHg.toFixed(2)} inHg (${m.altimeter.hPa} hPa)`]);
  if (m.remarks)
    rows.push([
      "Remarks",
      `${m.remarks}${m.remarks.includes("AO2") ? " — AO2: automated station with precipitation discriminator" : ""}`,
    ]);
  return (
    <div className="overflow-hidden rounded-md border">
      <table className="w-full text-xs">
        <tbody className="divide-y">
          {rows.map(([k, v]) => (
            <tr key={k}>
              <td className="w-32 bg-muted/40 px-2.5 py-1.5 align-top text-muted-foreground">
                {k}
              </td>
              <td className="px-2.5 py-1.5">{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------------------------------------------------------------------ */
/* TAF generator                                                                               */
/* ------------------------------------------------------------------------------------------ */

function condFor(cat: FlightCategory): string {
  switch (cat) {
    case "VFR":
      return pick(["P6SM SKC", "P6SM FEW050", "P6SM SCT045 BKN100", "P6SM BKN060", "P6SM SCT035"]);
    case "MVFR":
      return pick([
        "5SM BR BKN025",
        "P6SM OVC020",
        "4SM -RA BKN015 OVC030",
        "3SM -SHRA BKN025",
        "P6SM BKN012",
      ]);
    case "IFR":
      return pick([
        "2SM -RA BR OVC008",
        "1 1/2SM BR OVC006",
        "2SM -RA OVC009",
        "2SM TSRA BKN008CB",
        "1SM -DZ BR OVC005",
      ]);
    case "LIFR":
      return pick(["1/2SM FG VV002", "1/4SM FG OVC001", "3/4SM -RA BR OVC004"]);
  }
}

function windStr(): string {
  if (Math.random() < 0.12) return `VRB${pad2(rndInt(3, 5))}KT`;
  const spd = rndInt(5, 22);
  const g = spd >= 12 && Math.random() < 0.4 ? `G${pad2(spd + rndInt(8, 12))}` : "";
  return `${pad3(rndInt(1, 36) * 10)}${pad2(spd)}${g}KT`;
}

function addHours(day: number, hour: number, add: number) {
  const total = hour + add;
  return { day: day + Math.floor(total / 24), hour: total % 24 };
}

export function generateTaf(): string {
  const station = pick(STATIONS);
  const day = rndInt(2, 27);
  const start = pick([0, 6, 12, 18]);
  const issued = start === 0 ? { day: day - 1, hour: 23 } : { day, hour: start - 1 };
  const endGroup = start === 0 ? `${pad2(day)}24` : `${pad2(day + 1)}${pad2(start)}`;
  const lines: string[] = [];
  lines.push(
    `TAF ${station} ${pad2(issued.day)}${pad2(issued.hour)}${pick(["20", "30", "40"])}Z ${pad2(day)}${pad2(start)}/${endGroup}`,
  );
  const cats: FlightCategory[] = ["VFR", "MVFR", "IFR", "LIFR"];
  const baseCat = pick<FlightCategory>(["VFR", "VFR", "MVFR", "IFR"]);
  lines.push(`${windStr()} ${condFor(baseCat)}`);
  const fm1 = addHours(day, start, rndInt(4, 8));
  const fm1Cat = pick(cats.filter((c) => c !== baseCat));
  lines.push(`FM${pad2(fm1.day)}${pad2(fm1.hour)}00 ${windStr()} ${condFor(fm1Cat)}`);
  const tStart = addHours(fm1.day, fm1.hour, rndInt(1, 3));
  const tEnd = addHours(tStart.day, tStart.hour, rndInt(2, 4));
  const tempoCat = pick(cats.filter((c) => c !== fm1Cat && c !== "VFR"));
  lines.push(
    `TEMPO ${pad2(tStart.day)}${pad2(tStart.hour)}/${pad2(tEnd.day)}${pad2(tEnd.hour)} ${condFor(tempoCat)}`,
  );
  const fm2 = addHours(day, start, rndInt(12, 15));
  lines.push(`FM${pad2(fm2.day)}${pad2(fm2.hour)}00 ${windStr()} ${condFor(pick(cats))}`);
  if (Math.random() < 0.5) {
    const p = addHours(fm2.day, fm2.hour, rndInt(2, 4));
    const pe = addHours(p.day, p.hour, rndInt(2, 3));
    lines.push(
      `PROB30 ${pad2(p.day)}${pad2(p.hour)}/${pad2(pe.day)}${pad2(pe.hour)} ${condFor(pick<FlightCategory>(["IFR", "LIFR"]))}`,
    );
  } else {
    const b = addHours(fm2.day, fm2.hour, rndInt(3, 4));
    const be = addHours(b.day, b.hour, 2);
    lines.push(
      `BECMG ${pad2(b.day)}${pad2(b.hour)}/${pad2(be.day)}${pad2(be.hour)} ${condFor(pick<FlightCategory>(["VFR", "MVFR"]))}`,
    );
  }
  return lines.join("\n  ");
}

/* ------------------------------------------------------------------------------------------ */
/* TAF decode exercise                                                                         */
/* ------------------------------------------------------------------------------------------ */

interface TafQ {
  prompt: string;
  choices: string[];
  answer: number;
  explanation: string;
}

function buildTafQuestions(taf: Taf): TafQ[] {
  const qs: TafQ[] = [];
  const mk = (prompt: string, correct: string, wrong: string[], explanation: string): TafQ => {
    const uniq = Array.from(new Set(wrong.filter((w) => w !== correct))).slice(0, 3);
    const choices = shuffle([correct, ...uniq]);
    return { prompt, choices, answer: choices.indexOf(correct), explanation };
  };
  const vf = formatObsTime(taf.validFrom);
  const vt = formatObsTime(taf.validTo);
  qs.push(
    mk(
      "What is the valid period of this TAF?",
      `${vf} to ${vt}`,
      [
        `${formatObsTime(taf.issued)} to ${vt}`,
        `${vf} to ${formatObsTime(taf.periods[1]?.from ?? null)}`,
        `${vf} for 30 hours`,
      ],
      `The group after the issue time (ddhh/ddhh) gives the valid period: from ${vf} to ${vt}. The issue time (${formatObsTime(taf.issued)}) is when the forecast was written.`,
    ),
  );
  const fm = taf.periods.find((p) => p.type === "FM");
  if (fm?.wind) {
    const correct = describeWind(fm.wind);
    const wrongs = taf.periods.filter((p) => p !== fm && p.wind).map((p) => describeWind(p.wind));
    const w = fm.wind;
    if (typeof w.direction === "number")
      wrongs.push(describeWind({ ...w, direction: (w.direction + 180) % 360 || 360 }));
    wrongs.push(describeWind({ ...w, speedKt: w.speedKt + 10, gustKt: null }));
    qs.push(
      mk(
        `What wind is forecast beginning ${formatObsTime(fm.from)}?`,
        correct,
        wrongs,
        `"${fm.raw.split(" ").slice(0, 2).join(" ")}" — FM (from) introduces a rapid, complete change at that time. Wind direction in a TAF is true.`,
      ),
    );
  }
  const tempo = taf.periods.find((p) => p.type === "TEMPO");
  if (tempo?.from) {
    const at = tempo.from;
    const prev = prevailingAt(taf, at);
    if (prev.category) {
      qs.push(
        mk(
          `Ignoring temporary conditions, what flight category is forecast to PREVAIL at ${formatObsTime(at)}?`,
          prev.category,
          ["VFR", "MVFR", "IFR", "LIFR"],
          `At ${formatObsTime(at)} the period in force is "${prev.base?.raw ?? ""}" → ${prev.category}. The TEMPO group describes fluctuations to ${tempo.flightCategory ?? "other"} conditions lasting less than an hour at a time — plan for them, but they are not the prevailing forecast.`,
        ),
      );
    }
    if (tempo.visibility) {
      qs.push(
        mk(
          "What does the TEMPO group forecast for visibility?",
          `${formatVisibility(tempo.visibility)}, temporarily`,
          [
            `${formatVisibility(tempo.visibility)}, for the rest of the forecast`,
            "Unchanged from the previous group",
            `${formatVisibility(tempo.visibility)} with 30% probability`,
          ],
          `TEMPO: ${CHANGE_TEXT.TEMPO}.`,
        ),
      );
    }
  }
  const prob = taf.periods.find((p) => p.type === "PROB");
  const becmg = taf.periods.find((p) => p.type === "BECMG");
  if (prob) {
    qs.push(
      mk(
        `What does "PROB${prob.probability}" mean in this TAF?`,
        `A ${prob.probability}% chance of the stated conditions between ${formatObsTime(prob.from)} and ${formatObsTime(prob.to)}`,
        [
          "The conditions will begin gradually and then prevail",
          "Conditions are expected for 30 minutes",
          "Thunderstorms are forecast for 30% of the area",
        ],
        "PROB30/PROB40 gives the probability (30 or 40%) of thunderstorms or other precipitation events and the associated conditions occurring in the period.",
      ),
    );
  } else if (becmg) {
    qs.push(
      mk(
        "What does the BECMG group mean?",
        `Conditions change gradually between ${formatObsTime(becmg.from)} and ${formatObsTime(becmg.to)} and then prevail`,
        [
          "Conditions occur temporarily, less than an hour at a time",
          "There is a 30% chance of the conditions",
          "The forecast has been amended",
        ],
        `BECMG: ${CHANGE_TEXT.BECMG}.`,
      ),
    );
  }
  return qs;
}

export function TafDecodeExercise() {
  const { item: raw, next } = useGenerated(generateTaf);
  const { score, record } = useScore();
  const [answers, setAnswers] = useState<Record<number, number>>({});

  if (!raw) return <Loading />;
  const taf = parseTaf(raw);
  // Questions are derived from the TAF; shuffle once per TAF by memoising on raw via a stable seed.
  const qs = cachedQuestions(raw, taf);
  const done = qs.every((_, i) => answers[i] !== undefined);
  const correct = qs.filter((q, i) => answers[i] === q.answer).length;

  return (
    <ExerciseFrame
      score={score}
      onNext={() => {
        next();
        setAnswers({});
      }}
      nextLabel="New TAF"
      instructions="Read the forecast, then answer each question. Times are UTC (Z)."
      footer={done ? `${correct}/${qs.length} correct on this TAF` : undefined}
    >
      <pre className="avionics-screen overflow-x-auto p-3 font-mono text-[12.5px] leading-relaxed whitespace-pre-wrap text-ok">
        {raw}
      </pre>
      <div className="space-y-4">
        {qs.map((q, i) => {
          const sel = answers[i];
          const revealed = sel !== undefined;
          return (
            <div key={q.prompt} className="space-y-2">
              <p className="text-sm font-medium">
                <span className="mr-1.5 font-mono text-xs text-muted-foreground">{i + 1}.</span>
                {q.prompt}
              </p>
              <Choices
                choices={q.choices}
                selected={sel ?? null}
                answer={q.answer}
                revealed={revealed}
                onSelect={(c) => {
                  setAnswers((s) => ({ ...s, [i]: c }));
                  record(c === q.answer);
                }}
                columns={2}
              />
              {revealed ? <Feedback ok={sel === q.answer}>{q.explanation}</Feedback> : null}
            </div>
          );
        })}
      </div>
      {done ? (
        <div className="overflow-hidden rounded-md border">
          <table className="w-full text-xs">
            <thead className="bg-muted/40 text-left text-muted-foreground">
              <tr>
                <th className="px-2.5 py-1.5 font-medium">Group</th>
                <th className="px-2.5 py-1.5 font-medium">Period</th>
                <th className="px-2.5 py-1.5 font-medium">Category</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {taf.periods.map((p) => (
                <tr key={p.raw}>
                  <td className="px-2.5 py-1.5 font-mono">{p.raw}</td>
                  <td className="px-2.5 py-1.5 whitespace-nowrap">
                    {formatObsTime(p.from)} – {formatObsTime(p.to)}
                  </td>
                  <td className="px-2.5 py-1.5">
                    {p.flightCategory ? (
                      <Pill tone={CATEGORY_INFO[p.flightCategory].tone}>{p.flightCategory}</Pill>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </ExerciseFrame>
  );
}

const qCache = new Map<string, TafQ[]>();
function cachedQuestions(raw: string, taf: Taf): TafQ[] {
  let q = qCache.get(raw);
  if (!q) {
    q = buildTafQuestions(taf);
    qCache.set(raw, q);
    if (qCache.size > 20) {
      const first = qCache.keys().next().value;
      if (first !== undefined) qCache.delete(first);
    }
  }
  return q;
}
