/**
 * Weather Decision Scenarios — SIMULATED weather products for go / no-go training.
 * Every product below is invented for teaching and uses dataset airports for realism only.
 */

export type Decision = "go" | "no-go" | "delay" | "divert";

export const DECISION_LABEL: Record<Decision, string> = {
  go: "Go",
  "no-go": "No-go (cancel)",
  delay: "Delay & re-brief",
  divert: "Divert / alternate plan",
};

export const HAZARDS: { id: string; label: string }[] = [
  { id: "low-ceiling", label: "Low ceilings (IFR / MVFR)" },
  { id: "low-vis", label: "Reduced visibility (fog, mist, haze, precipitation)" },
  { id: "fog-risk", label: "Fog formation risk (small temperature/dew-point spread)" },
  { id: "ts", label: "Thunderstorms / convective activity" },
  { id: "icing", label: "Structural icing" },
  { id: "turb", label: "Turbulence" },
  { id: "wind", label: "Strong or gusty surface wind / crosswind" },
  { id: "llws", label: "Low-level wind shear" },
  { id: "density-alt", label: "High density altitude" },
  { id: "frontal", label: "Deteriorating trend / frontal passage" },
];

export interface WxScenario {
  id: string;
  title: string;
  rules: "VFR" | "IFR";
  phase: "preflight" | "en route";
  pilot: string;
  flight: string;
  products: { label: string; text: string }[];
  /** Options the trainee may choose from. */
  options: Decision[];
  best: Decision;
  acceptable: Decision[];
  hazards: string[];
  /** Words a good justification is likely to mention (any one counts). */
  keywords: string[];
  explanation: string;
  keyPoints: string[];
}

export const WX_SCENARIOS: WxScenario[] = [
  {
    id: "mry-fog",
    title: "Coastal fog at the destination",
    rules: "VFR",
    phase: "preflight",
    pilot: "Private pilot, 140 h, no instrument rating. Cessna 172.",
    flight: "VFR cross-country KPAO → KMRY (≈ 60 nm), planned departure 1500Z, ETA ≈ 1545Z.",
    products: [
      { label: "METAR KPAO", text: "KPAO 141447Z 31006KT 10SM FEW015 14/10 A3002" },
      { label: "METAR KMRY", text: "KMRY 141454Z 00000KT 1/2SM FG VV002 11/11 A3001" },
      { label: "TAF KMRY", text: "KMRY 141120Z 1412/1512 VRB03KT 1/4SM FG VV001\n  FM141800 28008KT 5SM BR SCT008\n  FM142000 29012KT P6SM SKC" },
    ],
    options: ["go", "no-go", "delay", "divert"],
    best: "delay",
    acceptable: ["no-go"],
    hazards: ["low-ceiling", "low-vis", "fog-risk"],
    keywords: ["fog", "vv", "lifr", "delay", "2000", "1800", "spread", "minimum"],
    explanation:
      "Monterey is LIFR (vertical visibility 200 ft, ½ SM fog) with a zero temperature/dew-point spread, and the TAF keeps it below VFR until at least 1800Z (5 SM, scattered 800 — still marginal) and VFR only from 2000Z. Arriving at 1545Z would be into conditions you cannot legally or safely fly VFR. Delaying until after the forecast improvement and getting an updated briefing is the best choice; cancelling is also sound.",
    keyPoints: ["Ceiling/visibility at the destination at ETA decides a VFR flight, not the departure weather.", "A 0 °C spread means fog will be slow to burn off — watch for forecast busts.", "Plan an alternate inland (e.g. KSNS) if you do go later."],
  },
  {
    id: "lvk-gusts",
    title: "Gusty crosswinds for a low-time pilot",
    rules: "VFR",
    phase: "preflight",
    pilot: "Student pilot, 25 h, solo endorsed (personal minimums: 10 kt crosswind, 15 kt total). Cessna 152 (max demonstrated crosswind 12 kt).",
    flight: "Solo pattern work at KLVK (runways 07/25), planned 2100Z.",
    products: [
      { label: "METAR KLVK", text: "KLVK 142053Z 34022G35KT 10SM SKC 26/03 A2990" },
      { label: "TAF KLVK", text: "KLVK 141740Z 1418/1518 33018G30KT P6SM SKC\n  FM150300 28010KT P6SM SKC" },
      { label: "AIRMET", text: "AIRMET TANGO — MOD TURB BLW 080. SUSTAINED SFC WND GTR THAN 30KT. CONDS CONTG BYD 03Z." },
    ],
    options: ["go", "no-go", "delay", "divert"],
    best: "no-go",
    acceptable: ["delay"],
    hazards: ["wind", "turb"],
    keywords: ["crosswind", "gust", "minimum", "personal", "12", "demonstrated", "turbulence", "tango"],
    explanation:
      "Wind 340° true (≈ 327° magnetic) at 22 gusting 35 is almost perpendicular to runways 07/25: roughly 21 kt of crosswind steady and about 34 kt in the gusts — far beyond both the student's 10-kt personal minimum and the C152's 12-kt demonstrated value — with a 13-kt gust factor and moderate mechanical turbulence (AIRMET Tango). The winds don't drop until after 0300Z (night). Cancel the solo; a dual lesson on crosswind technique on a calmer day is the right path.",
    keyPoints: ["Compute crosswind components for the runways you'll actually use.", "Personal minimums are set on the ground, not in the cockpit.", "Gust factor adds workload: half the gust factor is commonly added to approach speed."],
  },
  {
    id: "prc-density",
    title: "Hot afternoon at a high-elevation airport",
    rules: "VFR",
    phase: "preflight",
    pilot: "Private pilot, 300 h. Cessna 172S near maximum gross weight (4 adults, full fuel).",
    flight: "VFR departure from KPRC (elevation 5,045 ft) at 2200Z in July.",
    products: [
      { label: "METAR KPRC", text: "KPRC 142156Z 22012G18KT 10SM FEW090CB SCT120 37/02 A3001 RMK CB DSNT E" },
      { label: "TAF KPRC", text: "KPRC 141720Z 1418/1518 21012G20KT P6SM SCT090\n  TEMPO 1421/1502 VRB25G40KT 3SM TSRA BKN080CB" },
    ],
    options: ["go", "no-go", "delay", "divert"],
    best: "delay",
    acceptable: ["no-go"],
    hazards: ["density-alt", "ts", "wind"],
    keywords: ["density", "altitude", "performance", "weight", "morning", "storm", "cb", "thunderstorm", "climb"],
    explanation:
      "With 37 °C at 5,045 ft and an altimeter of 30.01 (pressure altitude ≈ 4,950 ft) the density altitude is about 8,800 ft. A loaded 172 will have a long takeoff roll and a very weak climb, while afternoon thunderstorms are forecast (TEMPO TSRA, gusts 40 kt) and a CB is already in sight. Delay to the cool early morning, reduce weight (fewer passengers or less fuel, still meeting reserves), and recompute takeoff and climb performance.",
    keyPoints: ["Density altitude ≈ pressure altitude + 120 × (OAT − ISA temp).", "Lean for best power on run-up at high-DA airports.", "Convective activity typically peaks mid-to-late afternoon in desert summer."],
  },
  {
    id: "mry-ifr",
    title: "Low ceilings with good IFR options",
    rules: "IFR",
    phase: "preflight",
    pilot: "Instrument-rated pilot, current (6 approaches in the last 6 months), 450 h. G1000 Cessna 172 with autopilot.",
    flight: "IFR KOAK → KMRY, depart 1600Z, ETA 1650Z. Planned approach: ILS RWY 10R at KMRY (minimums 200-½).",
    products: [
      { label: "METAR KMRY", text: "KMRY 141554Z 13004KT 1 1/2SM BR OVC005 12/11 A3003" },
      { label: "TAF KMRY", text: "KMRY 141120Z 1412/1512 12004KT 1SM BR OVC004\n  FM141700 VRB03KT 3SM BR OVC008\n  FM142000 28010KT P6SM SCT015" },
      { label: "TAF KSNS (alternate)", text: "KSNS 141120Z 1412/1512 VRB03KT 5SM BR BKN012\n  FM141700 31006KT P6SM BKN030" },
      { label: "PIREP", text: "MRY UA /OV MRY/TM 1530/FLDURD/TP BE58/SK OVC005-TOP018/TA 12/RM SMOOTH, TOPS 1800" },
    ],
    options: ["go", "no-go", "delay", "divert"],
    best: "go",
    acceptable: ["delay"],
    hazards: ["low-ceiling", "low-vis"],
    keywords: ["ils", "minimum", "alternate", "salinas", "sns", "tops", "smooth", "above", "current"],
    explanation:
      "The destination is IFR but comfortably above ILS minimums (500 ft and 1½ SM vs. 200-½) and improving, the layer is thin and smooth (tops 1,800 ft per PIREP), temperatures are well above freezing (no icing) and there are no thunderstorms. The 1-2-3 rule requires an alternate; Salinas is forecast 1,200-ft broken improving to VFR — well above standard alternate minimums. A current pilot in a well-equipped airplane can go, with the alternate filed and fuel planned for it.",
    keyPoints: ["IFR weather isn't automatically a no-go for a current instrument pilot — compare to minimums and your personal minimums.", "Check the alternate meets 600-2 / 800-2 (or published) minimums at ETA.", "Tops and temperatures from PIREPs help assess icing and escape options."],
  },
  {
    id: "sea-icing",
    title: "Winter IFR with icing",
    rules: "IFR",
    phase: "preflight",
    pilot: "Instrument-rated pilot, 600 h. Cessna 172 — NOT approved for flight into known icing.",
    flight: "IFR KBFI → KPDX area, MEA on the airway 6,000 ft, departure 1800Z.",
    products: [
      { label: "METAR KSEA", text: "KSEA 141753Z 18012KT 4SM -RA BR OVC012 04/02 A2968" },
      { label: "AIRMET", text: "AIRMET ZULU FOR ICE AND FRZLVL — MOD ICE BTN FRZLVL AND FL160. FRZLVL 030-045." },
      { label: "PIREP", text: "SEA UA /OV SEA180020/TM 1735/FL070/TP C208/SK OVC015-TOP140/TA M05/IC MOD RIME 045-070" },
    ],
    options: ["go", "no-go", "delay", "divert"],
    best: "no-go",
    acceptable: [],
    hazards: ["icing", "low-ceiling", "frontal"],
    keywords: ["icing", "ice", "freezing", "known", "fiki", "mea", "rime", "zulu", "pirep"],
    explanation:
      "The freezing level is 3,000–4,500 ft, the MEA is 6,000 ft, cloud tops are 14,000 ft and a PIREP reports moderate rime ice from 4,500 to 7,000 ft — that is 'known icing' for an airplane with no ice protection. You would be in cloud above the freezing level for the whole route with no way to climb out of it. Cancel.",
    keyPoints: ["Structural icing needs visible moisture and temperatures at or below 0 °C.", "MEA above the freezing level in solid cloud = no escape.", "PIREPs from similar or larger aircraft are strong evidence; a C208 picking up moderate ice is a clear warning."],
  },
  {
    id: "atl-storms",
    title: "Afternoon thunderstorm line",
    rules: "IFR",
    phase: "preflight",
    pilot: "Instrument-rated pilot, 800 h. SR22 with datalink weather (NEXRAD delayed 5–15 min). No onboard radar.",
    flight: "IFR KPDK area → KATL area, planned departure 2030Z.",
    products: [
      { label: "TAF KATL", text: "KATL 141720Z 1418/1524 20012KT P6SM SCT040 BKN250\n  TEMPO 1420/1424 30025G45KT 2SM +TSRA BKN030CB\n  FM150100 32008KT P6SM SCT050" },
      { label: "Convective SIGMET", text: "CONVECTIVE SIGMET 42E — LINE TS 30NM WIDE MOV FROM 26030KT. TOPS ABV FL450. HAIL TO 1 IN... WIND GUSTS TO 55KT POSS." },
      { label: "METAR KATL", text: "KATL 141952Z 20014G22KT 10SM SCT045CB BKN250 33/22 A2981 RMK CB DSNT W MOV E" },
    ],
    options: ["go", "no-go", "delay", "divert"],
    best: "delay",
    acceptable: ["no-go"],
    hazards: ["ts", "turb", "llws", "wind"],
    keywords: ["thunderstorm", "convective", "sigmet", "line", "nexrad", "delay", "20", "hail", "shear"],
    explanation:
      "A solid line of severe thunderstorms (Convective SIGMET, tops above FL450, hail, gusts to 55 kt) is moving toward the destination during your ETA. Datalink NEXRAD is delayed and must not be used to pick a path through a line. The TAF shows improvement after 0100Z. Delay until the line passes and re-brief.",
    keyPoints: ["Avoid severe thunderstorms by at least 20 nm (AIM 7-1-28).", "Never fly under an anvil or between closely spaced cells.", "Gust fronts and wind shear extend well ahead of the storms."],
  },
  {
    id: "sns-enroute",
    title: "Weather closing in en route",
    rules: "VFR",
    phase: "en route",
    pilot: "Private pilot, 200 h, VFR only. Piper Archer, 2:40 of fuel remaining.",
    flight: "VFR KHWD → KSNS. You are 30 nm south of Hayward at 3,500 ft; visibility ahead is decreasing.",
    products: [
      { label: "SPECI KSNS (via ATIS)", text: "KSNS 141733Z 30008KT 2SM BR OVC006 13/12 A3004" },
      { label: "METAR KSJC (behind you)", text: "KSJC 141753Z 31010KT 10SM FEW025 17/09 A3003" },
      { label: "In-flight observation", text: "Cloud bases ahead appear to be lowering below 2,500 ft MSL; terrain to the east rises to 3,800 ft." },
    ],
    options: ["go", "no-go", "delay", "divert"],
    best: "divert",
    acceptable: [],
    hazards: ["low-ceiling", "low-vis", "frontal"],
    keywords: ["divert", "san jose", "sjc", "180", "turn", "terrain", "ifr", "vfr into imc", "behind"],
    explanation:
      "Salinas has gone IFR (600 ft overcast, 2 SM mist) and conditions ahead are deteriorating over rising terrain — the classic setup for VFR flight into IMC. Weather behind you at San Jose is VFR. Make an early 180° turn and divert to KSJC, tell ATC/Flight Service, and wait it out on the ground.",
    keyPoints: ["Make the diversion decision early, while you still have options and VFR behind you.", "'Continuation bias' (get-there-itis) is a leading factor in VFR-into-IMC accidents.", "Use the diversion: turn first, then plan heading, distance and fuel."],
  },
  {
    id: "ccr-good",
    title: "A genuinely good VFR day",
    rules: "VFR",
    phase: "preflight",
    pilot: "Private pilot, 180 h. Cessna 172.",
    flight: "VFR KCCR → KSQL (≈ 35 nm), departure 1800Z, ETA 1830Z.",
    products: [
      { label: "METAR KCCR", text: "KCCR 141753Z 31008KT 10SM CLR 21/06 A3008" },
      { label: "METAR KSQL", text: "KSQL 141755Z 30009KT 10SM FEW030 19/08 A3007" },
      { label: "TAF KOAK", text: "KOAK 141720Z 1418/1518 29010KT P6SM FEW030\n  FM150300 27006KT P6SM SCT015" },
    ],
    options: ["go", "no-go", "delay", "divert"],
    best: "go",
    acceptable: [],
    hazards: [],
    keywords: ["vfr", "clear", "light", "wind", "spread", "stable", "forecast", "good"],
    explanation:
      "Both airports are VFR with light winds nearly aligned with the runways (KSQL runway 30), wide temperature/dew-point spreads and a stable forecast — the marine layer isn't forecast until after 0300Z, well after your return. There are no significant hazards: go, with the usual Class B awareness under the SFO shelf.",
    keyPoints: ["Recognising a good day matters as much as spotting hazards — over-caution erodes training value.", "Check when forecast changes occur relative to your ETA and return time."],
  },
  {
    id: "sfo-lifr",
    title: "Dense fog below approach minimums",
    rules: "IFR",
    phase: "preflight",
    pilot: "Instrument-rated pilot, 350 h, current. Baron G58.",
    flight: "IFR to KSFO, ETA 1400Z. ILS RWY 28R CAT I minimums: DA 213 ft, RVR 1,800 ft.",
    products: [
      { label: "METAR KSFO", text: "KSFO 141256Z 00000KT 1/8SM R28R/0600V1000FT FG VV001 10/10 A3006" },
      { label: "TAF KSFO", text: "KSFO 141120Z 1412/1518 VRB03KT 1/4SM FG VV001\n  FM141700 29008KT 3SM BR OVC008\n  FM142000 29012KT P6SM FEW015" },
      { label: "TAF KOAK", text: "KOAK 141120Z 1412/1512 VRB03KT 1/4SM FG VV001\n  FM141730 30008KT 4SM BR BKN010" },
    ],
    options: ["go", "no-go", "delay", "divert"],
    best: "delay",
    acceptable: ["no-go"],
    hazards: ["low-ceiling", "low-vis", "fog-risk"],
    keywords: ["rvr", "minimum", "below", "fog", "alternate", "oak", "delay", "1700"],
    explanation:
      "RVR 600–1,000 ft and vertical visibility 100 ft are far below the CAT I ILS minimums (RVR 1,800), and the nearby alternate (Oakland) is just as bad until about 1730Z. With no legal alternate available and the destination below minimums at ETA, delay until the forecast improvement after 1700Z and re-brief — or cancel.",
    keyPoints: ["Part 91 operators may legally 'take a look', but planning a flight with both destination and alternate below minimums is poor ADM.", "Alternates must be forecast above alternate minimums at ETA (91.169).", "Radiation fog in the Bay typically lifts late morning."],
  },
];
