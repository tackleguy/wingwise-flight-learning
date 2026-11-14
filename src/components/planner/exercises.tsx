/**
 * Planner exercises: a simulated weather briefing and a simulated NOTAM review, templated
 * with the airports of the plan being built. All weather/NOTAM text here is SIMULATED.
 */
import { useMemo, useState } from "react";
import { Notice } from "@/components/app/page";
import { McQuiz, type McQuestion } from "@/components/training/mc-quiz";
import type { Airport } from "@/lib/data/types";
import { getNavaid } from "@/lib/data/airports";
import { cn } from "@/lib/utils";

function dayCode(offsetH = 0) {
  const d = new Date(Date.now() + offsetH * 3600000);
  return { dd: String(d.getUTCDate()).padStart(2, "0"), mm: String(d.getUTCMonth() + 1).padStart(2, "0"), yy: String(d.getUTCFullYear()).slice(2), y1: String(d.getUTCFullYear()).slice(3) };
}

type Briefing = { id: string; title: string; summary: string; products: { label: string; text: string }[]; questions: McQuestion[] };

function briefings(dep: Airport, dst: Airport): Briefing[] {
  const { dd } = dayCode();
  const dn = dayCode(24).dd;
  const D = dep.icao;
  const S = dst.icao;
  return [
    {
      id: "marine",
      title: "Morning marine layer",
      summary: `You plan a VFR departure from ${D} at 1600Z to ${S}.`,
      products: [
        { label: `METAR ${D}`, text: `METAR ${D} ${dd}1553Z 00000KT 3SM BR OVC008 13/12 A3001 RMK AO2` },
        { label: `TAF ${D}`, text: `TAF ${D} ${dd}1130Z ${dd}12/${dd}24 VRB03KT 2SM BR OVC006\n  FM${dd}1800 30008KT P6SM SCT015\n  FM${dd}2200 29014KT P6SM SKC` },
        { label: `METAR ${S}`, text: `METAR ${S} ${dd}1556Z 32010KT 10SM FEW020 16/09 A3000` },
      ],
      questions: [
        {
          id: "m1",
          prompt: `What is the flight category at ${D} in the 1553Z METAR?`,
          choices: ["VFR", "MVFR", "IFR", "LIFR"],
          answer: 2,
          explanation: "Ceiling 800 ft overcast (500 to below 1,000 ft) is IFR; visibility 3 SM alone would be MVFR. The flight category is set by the lower of the two.",
        },
        {
          id: "m2",
          prompt: `From what time does the TAF first forecast VFR conditions at ${D}?`,
          choices: ["1200Z", "1600Z", "1800Z", "2200Z"],
          answer: 2,
          explanation: "FM…1800 forecasts P6SM (more than 6 SM) and SCT015 — scattered is not a ceiling, so conditions become VFR from 1800Z.",
        },
        {
          id: "m3",
          prompt: "What is the best decision for a VFR departure planned at 1600Z?",
          choices: ["Depart on time — the destination is VFR", "Request a special VFR clearance and go", "Delay until after the forecast improvement (≈1800Z) and get an updated briefing", "Depart and climb through the layer"],
          answer: 2,
          explanation: "The departure airport is IFR with a 600–800 ft ceiling forecast until 1800Z. Delaying keeps you legal and safe; the temperature/dew point spread of 1 °C also means the fog may be slow to lift — re-check before departure. Special VFR requires 1 SM and clear of clouds and is a poor choice for a cross-country.",
        },
      ],
    },
    {
      id: "wind",
      title: "Gusty winds ahead of a front",
      summary: `Afternoon VFR flight ${D} → ${S}, departing 2100Z, ETA about an hour later.`,
      products: [
        { label: `METAR ${D}`, text: `METAR ${D} ${dd}2053Z 24018G28KT 10SM SCT035 BKN050 18/08 A2978` },
        { label: `TAF ${S}`, text: `TAF ${S} ${dd}1740Z ${dd}18/${dn}18 23015G25KT P6SM BKN040\n  TEMPO ${dd}20/${dd}24 5SM -SHRA BKN025\n  FM${dn}0200 30010KT P6SM SCT050` },
        { label: "AIRMET", text: "AIRMET TANGO UPDT 2 FOR TURB VALID UNTIL 0300\nMOD TURB BLW 080. CONDS CONTG BYD 03Z." },
      ],
      questions: [
        {
          id: "w1",
          prompt: `What is the gust factor at ${D}?`,
          choices: ["8 kt", "10 kt", "18 kt", "28 kt"],
          answer: 1,
          explanation: "Gust factor = gust − steady wind = 28 − 18 = 10 kt. Many POH procedures add half the gust factor to the approach speed.",
        },
        {
          id: "w2",
          prompt: "What does TEMPO 20/24 … BKN025 mean in the destination TAF?",
          choices: [
            "Conditions will permanently change at 2000Z",
            "Temporary fluctuations, each lasting less than an hour and in total less than half of 2000–2400Z",
            "A 30% probability of showers",
            "The forecast is amended",
          ],
          answer: 1,
          explanation: "TEMPO groups describe temporary fluctuations expected to last less than 1 hour each and, in aggregate, less than half the indicated period. During them the ceiling could be 2,500 ft (MVFR).",
        },
        {
          id: "w3",
          prompt: "AIRMET Tango is issued for which hazard?",
          choices: ["IFR conditions and mountain obscuration", "Moderate icing and freezing levels", "Moderate turbulence, sustained surface winds ≥ 30 kt, or non-convective low-level wind shear", "Thunderstorms"],
          answer: 2,
          explanation: "AIRMET Sierra = IFR/mountain obscuration, Tango = turbulence/strong surface winds/LLWS, Zulu = icing/freezing level. Convective hazards are SIGMET (convective) products.",
        },
        {
          id: "w4",
          prompt: "Which planning action is most appropriate?",
          choices: ["Plan the flight below 1,000 ft AGL to avoid turbulence", "Check your aircraft's max demonstrated crosswind against runway alignment, slow to Va (adjusted for weight) in turbulence, and set personal-minimum gust limits", "Ignore — AIRMETs only apply to large aircraft", "Cancel all flights when any AIRMET exists"],
          answer: 1,
          explanation: "AIRMETs describe hazards significant to light aircraft. Evaluate crosswind components, turbulence penetration speed and your personal minimums; a go/no-go decision depends on the specific runways and your experience.",
        },
      ],
    },
  ];
}

export function BriefingExercise({ dep, dst }: { dep: Airport; dst: Airport }) {
  const list = useMemo(() => briefings(dep, dst), [dep, dst]);
  const [idx, setIdx] = useState(0);
  const b = list[idx] ?? list[0];
  if (!b) return null;
  return (
    <div className="space-y-3">
      <Notice tone="caution" title="Simulated weather.">
        These products are generated for this exercise using your plan's airports. They are not real observations or forecasts. For real flights get an official briefing (1800wxbrief.com / FAA-approved sources).
      </Notice>
      <div className="flex flex-wrap gap-1.5">
        {list.map((x, i) => (
          <button key={x.id} type="button" onClick={() => setIdx(i)} className={cn("rounded border px-2.5 py-1 text-xs", i === idx ? "border-primary/50 bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground")}>
            {x.title}
          </button>
        ))}
      </div>
      <p className="text-sm">{b.summary}</p>
      <div className="grid gap-2 md:grid-cols-3">
        {b.products.map((p) => (
          <div key={p.label} className="avionics-screen p-2.5">
            <div className="label-caps mb-1">{p.label} (simulated)</div>
            <pre className="font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-cyan">{p.text}</pre>
          </div>
        ))}
      </div>
      <McQuiz questions={b.questions} resetKey={`${b.id}-${dep.icao}-${dst.icao}`} />
    </div>
  );
}

export function NotamExercise({ dep, dst }: { dep: Airport; dst: Airport }) {
  const { dd, mm, yy, y1 } = dayCode();
  const d3 = dep.icao.startsWith("K") ? dep.icao.slice(1) : dep.icao;
  const s3 = dst.icao.startsWith("K") ? dst.icao.slice(1) : dst.icao;
  const rwy = dep.runways[0]?.name ?? "13/31";
  const dRwy = dst.runways[0]?.name ?? "12/30";
  const nav = getNavaid(dep.nearbyNavaids[0] ?? "") ?? getNavaid(dst.nearbyNavaids[0] ?? "");
  const navId = nav?.id ?? "OSI";
  const ts = (h: number) => `${yy}${mm}${dd}${String(h).padStart(2, "0")}00`;
  const end = (days: number) => {
    const e = new Date(Date.now() + days * 86400000);
    return `${String(e.getUTCFullYear()).slice(2)}${String(e.getUTCMonth() + 1).padStart(2, "0")}${String(e.getUTCDate()).padStart(2, "0")}2359`;
  };

  const questions: McQuestion[] = [
    {
      id: "n1",
      prompt: "What does this NOTAM mean for your departure?",
      context: `!${d3} ${mm}/012 ${d3} RWY ${rwy} CLSD ${ts(14)}-${ts(22)}`,
      choices: [`Runway ${rwy} is closed from 1400Z to 2200Z today`, `Runway ${rwy} is closed for 14 to 22 days`, "The airport is closed to all traffic", "Runway lights are out of service"],
      answer: 0,
      explanation: `Times in NOTAMs are UTC in the format YYMMDDHHMM: ${ts(14)} = 20${yy}-${mm}-${dd} 1400Z. If ${rwy} is the only runway, ${dep.icao} is effectively unusable for that window.`,
    },
    {
      id: "n2",
      prompt: "How should you read the end time on this NOTAM?",
      context: `!${navId} ${mm}/008 ${navId} VOR U/S ${ts(0)}-${end(4)}EST`,
      choices: ["The VOR is under test and usable", "The VOR is unserviceable; 'EST' means the end time is estimated and may be extended or cancelled", "The VOR is unserviceable only in the eastern sector", "EST means Eastern Standard Time"],
      answer: 1,
      explanation: "U/S = unserviceable. 'EST' after the end time marks an estimated expiry — the NOTAM stays in effect until cancelled or replaced. Plan GPS or another navaid and don't select an approach that requires that VOR.",
    },
    {
      id: "n3",
      prompt: "What does this FDC NOTAM describe and what must you do?",
      context: `!FDC ${y1}/4521 ZOA CA..AIRSPACE ${dst.city.toUpperCase()}, CA..TEMPORARY FLIGHT RESTRICTIONS WI AN AREA DEFINED AS 3NM RADIUS OF ${Math.abs(Math.floor(dst.lat))}${String(Math.round((Math.abs(dst.lat) % 1) * 60)).padStart(2, "0")}N${Math.abs(Math.floor(dst.lon))}${String(Math.round((Math.abs(dst.lon) % 1) * 60)).padStart(2, "0")}W SFC-3000FT AGL ${ts(16)}-${ts(19)}. PURSUANT TO 14 CFR SECTION 91.137(A)(2)`,
      choices: ["A new instrument approach", "A temporary flight restriction (disaster/hazard area relief) you must avoid unless authorized", "A military operations area", "A parachute jumping area that is advisory only"],
      answer: 1,
      explanation: "FDC NOTAMs carry regulatory information such as TFRs. 91.137(a)(2) TFRs protect disaster/hazard relief aircraft; entry is prohibited unless an exception applies. Compare the center point and radius with your route and destination.",
    },
    {
      id: "n4",
      prompt: "What is the hazard here?",
      context: `!${d3} ${mm}/021 ${d3} OBST CRANE (ASN 20${yy}-AWP-1234-NRA) 1.2NM N ${d3} 285FT (270FT AGL) NOT LGT ${ts(13)}-${end(6)}`,
      choices: ["A crane 285 ft tall above ground", "An unlit crane reaching 285 ft MSL (270 ft AGL), 1.2 nm north of the airport", "A lighted tower at 270 ft MSL", "A runway obstruction on the centerline"],
      answer: 1,
      explanation: "Obstacle NOTAMs give the top in MSL followed by the height AGL in parentheses. 'NOT LGT' = not lighted — a particular hazard at night or in low visibility near the departure path.",
    },
    {
      id: "n5",
      prompt: `How does this NOTAM affect your arrival at ${dst.icao}?`,
      context: `!${s3} ${mm}/030 ${s3} RWY ${dRwy.split("/")[0]} PAPI U/S ${ts(0)}-${end(10)}EST`,
      choices: ["The runway is closed", "No visual glidepath guidance from the PAPI — fly a stabilized approach using other cues", "The approach lighting system is inoperative only at night", "The runway is restricted to IFR traffic"],
      answer: 1,
      explanation: "PAPI (Precision Approach Path Indicator) unserviceable means you lose the red/white visual glidepath. The runway remains open; use normal sight picture, VNAV/ILS guidance if available, and aim-point technique.",
    },
    {
      id: "n6",
      prompt: "Which part of this NOTAM tells you it is in effect only on a schedule?",
      context: `!${d3} ${mm}/033 ${d3} TWY B CLSD BTN TWY B2 AND TWY B4 DLY 0300-1200 ${ts(3)}-${end(14)}`,
      choices: ["TWY B", "BTN TWY B2 AND TWY B4", "DLY 0300-1200", "The NOTAM number"],
      answer: 2,
      explanation: "'DLY 0300-1200' = daily from 0300Z to 1200Z within the overall effective period. Outside those hours the taxiway segment is open.",
    },
  ];

  return (
    <div className="space-y-3">
      <Notice tone="caution" title="Simulated NOTAMs.">
        Written in the modern FAA domestic format for training, using your plan's airports. They are not real NOTAMs. Always obtain current NOTAMs from official sources (FAA NOTAM Search / Flight Service) before flight — 14 CFR 91.103 requires you to become familiar with all available information.
      </Notice>
      <McQuiz questions={questions} resetKey={`${dep.icao}-${dst.icao}`} />
    </div>
  );
}
