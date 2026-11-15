/**
 * Local aviation knowledge base for the AI Flight Instructor's scripted fallback.
 *
 * Concise, educational summaries of FAA material (14 CFR, AIM, PHAK, AFH, IFH, AWH). Values
 * reflect the regulations as commonly published; always verify against the current edition.
 * EDUCATIONAL ONLY — not a substitute for current FAA publications, the POH/AFM or a CFI.
 */

export interface QuizItem {
  q: string;
  options: [string, string, string, string];
  answer: 0 | 1 | 2 | 3;
  why: string;
}

export interface KnowledgeEntry {
  id: string;
  title: string;
  category:
    | "Aerodynamics"
    | "Regulations"
    | "Airspace"
    | "Weather"
    | "Navigation"
    | "Instruments"
    | "Human factors"
    | "Procedures"
    | "IFR"
    | "Performance"
    | "Communications";
  keywords: string[];
  /** Plain-language explanation (markdown). */
  simple: string;
  /** Additional technical detail (markdown). */
  advanced: string;
  refs: string[];
  quiz: QuizItem[];
}

export const DISCLAIMER =
  "Educational explanation only — consult current FAA publications, the POH/AFM and a CFI for real-world operations.";

export const KNOWLEDGE: KnowledgeEntry[] = [
  {
    id: "v-speeds",
    title: "V-speeds",
    category: "Aerodynamics",
    keywords: [
      "v-speeds",
      "vspeeds",
      "vx",
      "vy",
      "va",
      "vne",
      "vno",
      "vfe",
      "vso",
      "vs1",
      "vr",
      "vg",
      "best glide",
      "best rate",
      "best angle",
      "airspeed arcs",
      "green arc",
      "white arc",
      "yellow arc",
      "red line",
    ],
    simple:
      "V-speeds are the key airspeeds for your airplane, found in the POH. The ones you use every flight:\n\n- **Vr** — rotate for takeoff\n- **Vx** — best **angle** of climb (most altitude per distance — obstacles)\n- **Vy** — best **rate** of climb (most altitude per minute)\n- **Vg** — best glide (engine out)\n- **Va** — maneuvering speed (full, abrupt control inputs won't overstress the airframe)\n- **Vne** — never exceed (red line)",
    advanced:
      "**Airspeed indicator markings:**\n- **White arc**: Vso (bottom, stall in landing configuration) to Vfe (top, max flaps extended)\n- **Green arc**: Vs1 (stall in a specified configuration, usually clean) to Vno (max structural cruising speed)\n- **Yellow arc**: Vno to Vne — smooth air only, with caution\n- **Red line**: Vne\n\nNot marked on most indicators: Vx, Vy, Va, Vg. Va **decreases as weight decreases**. Vx increases and Vy decreases with altitude until they meet at the absolute ceiling.",
    refs: [
      "PHAK ch. 8 (Flight Instruments)",
      "14 CFR 1.2 (abbreviations)",
      "Aircraft POH/AFM section 2",
    ],
    quiz: [
      {
        q: "The top of the green arc on the airspeed indicator marks…",
        options: ["Vne", "Vno", "Vfe", "Va"],
        answer: 1,
        why: "The green arc runs from Vs1 to Vno, the maximum structural cruising speed.",
      },
      {
        q: "Which speed gives the greatest altitude gain over the shortest horizontal distance?",
        options: ["Vy", "Vg", "Vx", "Vr"],
        answer: 2,
        why: "Vx is best angle of climb — used to clear obstacles.",
      },
    ],
  },
  {
    id: "airspace-overview",
    title: "Airspace classes overview",
    category: "Airspace",
    keywords: [
      "airspace",
      "airspace classes",
      "class a",
      "controlled airspace",
      "uncontrolled",
      "class f",
    ],
    simple:
      "US airspace is divided into **controlled** (A, B, C, D, E) and **uncontrolled** (G).\n\n- **A**: 18,000 ft MSL up to FL600 — IFR only\n- **B**: around the busiest airports — need an ATC **clearance**\n- **C**: busy airports with radar approach — need **two-way radio contact**\n- **D**: airports with a control tower — need **two-way radio contact**\n- **E**: other controlled airspace (often starts at 700 or 1,200 ft AGL)\n- **G**: uncontrolled, usually near the surface",
    advanced:
      "Equipment and entry requirements increase with the class: Class B needs a clearance, a Mode C transponder and ADS-B Out (also within the 30 NM Mode C veil); Class C needs two-way communication, Mode C and ADS-B Out; Class D needs two-way communication. Class A requires an IFR flight plan and clearance. Speed limits (91.117): 250 KIAS below 10,000 MSL; 200 KIAS at or below 2,500 AGL within 4 NM of the primary airport of Class C/D; 200 KIAS under a Class B shelf or in a VFR corridor.",
    refs: ["AIM 3-2 Controlled airspace", "14 CFR 91.117, 91.215, 91.225"],
    quiz: [
      {
        q: "Which airspace requires an explicit ATC clearance to enter VFR?",
        options: ["Class C", "Class D", "Class B", "Class E"],
        answer: 2,
        why: 'Class B requires "cleared into the Class Bravo"; C and D require only two-way communication.',
      },
    ],
  },
  {
    id: "class-b",
    title: "Class B airspace",
    category: "Airspace",
    keywords: ["class b", "class bravo", "bravo", "mode c veil", "cleared into the class bravo"],
    simple:
      'Class B surrounds the busiest airports, shaped like an upside-down wedding cake. To enter VFR you must hear the words **"cleared into the Class Bravo"**. Radar vectors or a squawk code alone are not a clearance.',
    advanced:
      "- Pilot: at least a private pilot certificate, or a student/sport/recreational pilot with the required training and endorsements (61.95). Some primary airports prohibit student operations entirely.\n- Equipment: two-way radio, Mode C transponder, ADS-B Out (within the 30 NM veil too).\n- VFR minimums: **3 SM visibility, clear of clouds**.\n- Speed: 250 KIAS max below 10,000 MSL; 200 KIAS below the shelf or in a VFR corridor.",
    refs: ["14 CFR 91.131", "AIM 3-2-3", "14 CFR 61.95"],
    quiz: [
      {
        q: "VFR cloud clearance in Class B is…",
        options: [
          "500 below, 1,000 above, 2,000 horizontal",
          "Clear of clouds",
          "1,000 above and below, 1 SM horizontal",
          "Clear of clouds with 1 SM visibility",
        ],
        answer: 1,
        why: "Class B: 3 SM visibility and clear of clouds (91.155).",
      },
    ],
  },
  {
    id: "class-c",
    title: "Class C airspace",
    category: "Airspace",
    keywords: ["class c", "class charlie", "charlie", "outer area", "two-way communication"],
    simple:
      "Class C surrounds airports with a tower and radar approach control. You must **establish two-way radio communication** before entering — the controller must answer with **your callsign**.",
    advanced:
      'Typical shape: a **5 NM** radius core from the surface to **4,000 ft AGL**, and a **10 NM** shelf from about **1,200 to 4,000 ft AGL**. A 20 NM outer area offers radar services. Requirements: two-way radio, Mode C, ADS-B Out. If the controller says "aircraft calling, standby" (no callsign), communication is **not** established — stay out.',
    refs: ["14 CFR 91.130", "AIM 3-2-4"],
    quiz: [
      {
        q: 'Approach replies: "N123AB, standby." May you enter the Class C?',
        options: [
          "No — you need a clearance",
          "Yes — two-way communication is established",
          "Only above 4,000 AGL",
          "Only if squawking 1200",
        ],
        answer: 1,
        why: "Your callsign was used, so two-way communication is established (AIM 3-2-4).",
      },
    ],
  },
  {
    id: "class-d",
    title: "Class D airspace",
    category: "Airspace",
    keywords: ["class d", "class delta", "delta", "control tower", "towered airport"],
    simple:
      "Class D surrounds airports with an operating control tower, usually from the surface to **2,500 ft AGL** within about 4 NM. You need **two-way radio communication** before entering — the tower must reply using your callsign.",
    advanced:
      "When the tower closes, the airspace usually reverts to Class E or G (check the Chart Supplement). Arrivals should establish contact before entering; departures must keep contact while within the airspace. VFR minimums: 3 SM visibility; 500 below, 1,000 above, 2,000 horizontal from clouds; and in the surface area at least a 1,000 ft ceiling (91.155(c)).",
    refs: ["14 CFR 91.129", "AIM 3-2-5"],
    quiz: [
      {
        q: "Typical vertical limit of Class D airspace is…",
        options: ["1,200 ft AGL", "2,500 ft AGL", "4,000 ft AGL", "10,000 ft MSL"],
        answer: 1,
        why: "Class D normally extends from the surface to 2,500 ft above the airport elevation.",
      },
    ],
  },
  {
    id: "class-e-g",
    title: "Class E and Class G airspace",
    category: "Airspace",
    keywords: [
      "class e",
      "class g",
      "echo",
      "golf airspace",
      "uncontrolled airspace",
      "700 agl",
      "1200 agl",
      "magenta vignette",
    ],
    simple:
      "**Class E** is controlled airspace that isn't A, B, C or D — often starting at **1,200 ft AGL**, or **700 ft AGL** near airports with instrument approaches (shown by magenta shading). **Class G** is uncontrolled airspace beneath it.",
    advanced:
      "Class E also includes surface areas around some non-towered airports (dashed magenta) and federal airways (1,200 AGL to 17,999 MSL). No ATC communication is required for VFR in E or G, but VFR weather minimums differ (see 91.155) and are lowest in Class G near the surface during the day (1 SM, clear of clouds below 1,200 AGL).",
    refs: ["AIM 3-2-6, 3-3", "14 CFR 91.155"],
    quiz: [
      {
        q: "Faded magenta shading around an airport on a sectional means Class E begins at…",
        options: ["The surface", "700 ft AGL", "1,200 ft AGL", "14,500 ft MSL"],
        answer: 1,
        why: "Magenta vignette: Class E floor at 700 ft AGL; blue vignette: 1,200 ft AGL.",
      },
    ],
  },
  {
    id: "vfr-minimums",
    title: "Basic VFR weather minimums (91.155)",
    category: "Regulations",
    keywords: [
      "vfr minimums",
      "weather minimums",
      "91.155",
      "cloud clearance",
      "visibility requirements",
      "3 152",
      "500 below",
      "basic vfr",
    ],
    simple:
      'Most controlled airspace below 10,000 ft MSL (Class C, D, E) uses the **"3-152"** rule: **3 SM visibility**, and stay **500 ft below, 1,000 ft above, 2,000 ft horizontal** from clouds. Class B is 3 SM and clear of clouds.',
    advanced:
      "- **Class B**: 3 SM, clear of clouds\n- **Class C, D, E below 10,000 MSL**: 3 SM; 500 below / 1,000 above / 2,000 horizontal\n- **Class E at/above 10,000 MSL**: 5 SM; 1,000 below / 1,000 above / 1 SM horizontal\n- **Class G, 1,200 AGL or less**: day 1 SM clear of clouds; night 3 SM, 500/1,000/2,000 (1 SM clear of clouds in a pattern within ½ NM of the runway)\n- **Class G above 1,200 AGL, below 10,000 MSL**: day 1 SM, 500/1,000/2,000; night 3 SM, 500/1,000/2,000\n- **Class G above 1,200 AGL and at/above 10,000 MSL**: 5 SM; 1,000/1,000/1 SM\n- Inside a surface area: ceiling at least **1,000 ft** and ground visibility **3 SM** unless Special VFR.",
    refs: ["14 CFR 91.155", "AIM 3-1-4"],
    quiz: [
      {
        q: "VFR visibility in Class E airspace at 11,500 ft MSL is…",
        options: ["3 SM", "1 SM", "5 SM", "Clear of clouds"],
        answer: 2,
        why: "At or above 10,000 MSL (and more than 1,200 AGL) Class E requires 5 SM and 1,000/1,000/1 SM.",
      },
    ],
  },
  {
    id: "special-vfr",
    title: "Special VFR (91.157)",
    category: "Regulations",
    keywords: ["special vfr", "svfr", "91.157"],
    simple:
      "Special VFR lets you operate in a surface area when the weather is below basic VFR (ceiling below 1,000 ft or visibility below 3 SM) — **only with an ATC clearance**, staying **clear of clouds** with at least **1 SM** visibility.",
    advanced:
      "Applies below 10,000 MSL within the surface area of Class B, C, D or E. You must request it — ATC won't offer it. At **night** (sunset to sunrise) both the pilot (instrument rating) and the aircraft (IFR-equipped) must be instrument qualified. Ground visibility of 1 SM is required for takeoff/landing where reported. Several major Class B airports prohibit fixed-wing SVFR (listed in 14 CFR 91 Appendix D).",
    refs: ["14 CFR 91.157", "AIM 4-4-6"],
    quiz: [
      {
        q: "Special VFR at night requires…",
        options: [
          "A commercial certificate",
          "An instrument rating and IFR-equipped aircraft",
          "3 SM visibility",
          "A Class B clearance",
        ],
        answer: 1,
        why: "91.157(c): at night, the pilot must be instrument rated and the aircraft IFR equipped.",
      },
    ],
  },
  {
    id: "vfr-fuel",
    title: "VFR fuel requirements (91.151)",
    category: "Regulations",
    keywords: [
      "vfr fuel",
      "fuel reserve",
      "91.151",
      "30 minutes",
      "45 minutes",
      "fuel requirements",
    ],
    simple:
      "Under VFR you must have enough fuel to reach your first intended landing point **plus 30 minutes** at normal cruise in the **day**, or **plus 45 minutes at night**. That's the legal minimum — many pilots plan at least an hour.",
    advanced:
      "The reserve is computed at **normal cruising speed** and assumes known wind and forecast conditions. Rotorcraft need 20 minutes. Fuel-exhaustion accidents usually involve legal-but-thin plans: build personal minimums and verify fuel visually before flight.",
    refs: ["14 CFR 91.151"],
    quiz: [
      {
        q: "Minimum VFR fuel reserve at night (airplane) is…",
        options: ["20 minutes", "30 minutes", "45 minutes", "1 hour"],
        answer: 2,
        why: "91.151(a)(2): 45 minutes at normal cruise at night.",
      },
    ],
  },
  {
    id: "ifr-fuel",
    title: "IFR fuel requirements (91.167)",
    category: "IFR",
    keywords: ["ifr fuel", "91.167", "fuel to alternate"],
    simple:
      "Under IFR you need enough fuel to fly to your **destination**, then to your **alternate** (if one is required), and then for **45 more minutes** at normal cruise.",
    advanced:
      "The alternate leg is required only when the 1-2-3 rule (91.169) says you need an alternate. Plan fuel for expected routing, holding and approach delays — not just the great-circle distance.",
    refs: ["14 CFR 91.167"],
    quiz: [
      {
        q: "IFR fuel: destination + alternate (if required) + …",
        options: ["30 minutes", "45 minutes", "1 hour", "Fuel for one approach"],
        answer: 1,
        why: "91.167: 45 minutes at normal cruise after the alternate.",
      },
    ],
  },
  {
    id: "alternate-123",
    title: "Alternates: the 1-2-3 rule and alternate minimums",
    category: "IFR",
    keywords: [
      "1-2-3 rule",
      "123 rule",
      "alternate",
      "alternate minimums",
      "91.169",
      "600-2",
      "800-2",
    ],
    simple:
      'You need an IFR alternate unless, from **1 hour before to 1 hour after** your ETA, the destination forecast shows a ceiling of at least **2,000 ft** and visibility of at least **3 SM** — the "1-2-3 rule".',
    advanced:
      'To **use** an airport as an alternate, its forecast at your ETA must meet the published alternate minimums, or if none are published (no "A" symbol): **precision approach 600 ft & 2 SM**, **non-precision 800 ft & 2 SM**, or with no instrument approach, a descent from the MEA and landing under basic VFR. An "A" with a triangle on the chart means non-standard alternate minimums or not authorized.',
    refs: ["14 CFR 91.169", "IFH ch. 10"],
    quiz: [
      {
        q: "Standard alternate minimums for an airport with only a non-precision approach are…",
        options: ["600 ft and 2 SM", "800 ft and 2 SM", "1,000 ft and 3 SM", "2,000 ft and 3 SM"],
        answer: 1,
        why: "91.169(c): non-precision 800-2; precision 600-2.",
      },
    ],
  },
  {
    id: "currency-6157",
    title: "Recent flight experience / currency (61.57)",
    category: "Regulations",
    keywords: [
      "currency",
      "61.57",
      "passenger currency",
      "night currency",
      "instrument currency",
      "90 days",
      "6 hit",
      "ipc",
      "three takeoffs and landings",
    ],
    simple:
      "To carry passengers you need **3 takeoffs and landings in the last 90 days** in the same category and class (full stop in a tailwheel). For night passengers, the 3 must be **to a full stop at night** (1 hour after sunset to 1 hour before sunrise). To fly IFR you need **6 approaches, holding, and intercepting/tracking courses** in the last 6 calendar months.",
    advanced:
      'Instrument currency ("6 HIT"): **6** approaches, **H**olding procedures and tasks, **I**ntercepting and **T**racking courses, within the preceding **6 calendar months** (aircraft, FFS/FTD or approved ATD). If lapsed, you have another 6 calendar months to regain it with a safety pilot or instructor; after that an **Instrument Proficiency Check (IPC)** is required. Passenger currency also requires the type for type-rated aircraft.',
    refs: ["14 CFR 61.57"],
    quiz: [
      {
        q: "Night passenger currency requires three takeoffs and landings to a full stop within…",
        options: ["30 days", "60 days", "90 days", "6 calendar months"],
        answer: 2,
        why: "61.57(b): preceding 90 days, during the period 1 hr after sunset to 1 hr before sunrise.",
      },
    ],
  },
  {
    id: "flight-review",
    title: "Flight review (61.56)",
    category: "Regulations",
    keywords: ["flight review", "61.56", "bfr", "biennial", "24 calendar months"],
    simple:
      "Every **24 calendar months** you need a flight review with an instructor: at least **1 hour of ground** and **1 hour of flight** training, ending with a logbook endorsement.",
    advanced:
      "A practical test for a new certificate/rating, certain WINGS phases, or some military checks can substitute. Without a current flight review you cannot act as PIC (you can still fly with an instructor). The review covers Part 91 rules and maneuvers the instructor chooses.",
    refs: ["14 CFR 61.56"],
    quiz: [
      {
        q: "A flight review requires at least…",
        options: ["1 hr ground + 1 hr flight", "2 hr flight", "3 takeoffs and landings", "An IPC"],
        answer: 0,
        why: "61.56(a): 1 hour of ground training and 1 hour of flight training.",
      },
    ],
  },
  {
    id: "documents-arrow",
    title: "Required aircraft documents (ARROW)",
    category: "Regulations",
    keywords: [
      "arrow",
      "aircraft documents",
      "airworthiness certificate",
      "registration",
      "required documents",
    ],
    simple:
      "Remember **ARROW**: **A**irworthiness certificate, **R**egistration, **R**adio station license (international flights only), **O**perating limitations (POH/AFM, placards, markings), **W**eight & balance data.",
    advanced:
      "The airworthiness certificate must be displayed so passengers/crew can see it (91.203). Registration certificates now expire every 7 years. The pilot also carries a pilot certificate, medical (or BasicMed documents) and government photo ID.",
    refs: ["14 CFR 91.203, 91.9", "PHAK ch. 9"],
    quiz: [
      {
        q: "In ARROW, the second R (radio station license) is required…",
        options: ["Always", "Only for flights outside the US", "Only for IFR", "Only at night"],
        answer: 1,
        why: "A radio station license is needed for international flights (FCC requirement).",
      },
    ],
  },
  {
    id: "inspections",
    title: "Required inspections (AV1ATE)",
    category: "Regulations",
    keywords: [
      "inspections",
      "av1ate",
      "annual inspection",
      "100 hour",
      "transponder check",
      "elt",
      "altimeter check",
      "vor check 30 days",
      "aviate",
    ],
    simple:
      "**AV1ATE**: **A**nnual (12 calendar months), **V**OR check (30 days, IFR), **1**00-hour (if used for hire), **A**ltimeter/static (24 calendar months, IFR), **T**ransponder (24 calendar months), **E**LT (12 calendar months).",
    advanced:
      "The 100-hour may be exceeded by up to 10 hours only to reach a place where it can be done (the excess counts toward the next one). ELT batteries are replaced after 1 hour of cumulative use or 50% of useful life. Pilots confirm compliance in the aircraft maintenance logbooks — plus any applicable Airworthiness Directives.",
    refs: ["14 CFR 91.409, 91.411, 91.413, 91.207, 91.171"],
    quiz: [
      {
        q: "Transponder inspections are required every…",
        options: ["12 calendar months", "24 calendar months", "100 hours", "30 days"],
        answer: 1,
        why: "91.413: within the preceding 24 calendar months.",
      },
    ],
  },
  {
    id: "required-equipment",
    title: "Minimum equipment (TOMATO FLAMES / FLAPS / GRABCARD)",
    category: "Regulations",
    keywords: [
      "tomato flames",
      "flaps",
      "grabcard",
      "91.205",
      "required equipment",
      "inoperative equipment",
      "mel",
    ],
    simple:
      "14 CFR 91.205 lists the minimum instruments: **TOMATO FLAMES** for day VFR, plus **FLAPS** for night VFR, plus **GRABCARD** for IFR.",
    advanced:
      '- **Day VFR**: Tachometer, Oil pressure, Manifold pressure (per altitude engine), Altimeter, Temperature (liquid-cooled), Oil temperature, Fuel gauges, Landing-gear position (retractable), Airspeed indicator, Magnetic compass, ELT, Seat belts (+ anticollision lights for aircraft certificated after March 11, 1996)\n- **Night VFR**: Fuses/spare, Landing light (if for hire), Anticollision lights, Position lights, Source of electrical power\n- **IFR**: Generator/alternator, Radios/nav appropriate, Altimeter (sensitive), Ball (slip-skid), Clock, Attitude, Rate-of-turn, Directional gyro\n\nInoperative equipment: follow the MEL or 91.213(d) (placard "INOPERATIVE", deactivate/remove, determine it\'s not a hazard).',
    refs: ["14 CFR 91.205, 91.213"],
    quiz: [
      {
        q: "Which is part of the day VFR list (TOMATO FLAMES)?",
        options: ["Clock", "Attitude indicator", "Magnetic compass", "Landing light"],
        answer: 2,
        why: "M = Magnetic compass. Clock and attitude are GRABCARD (IFR).",
      },
    ],
  },
  {
    id: "metar",
    title: "Reading a METAR",
    category: "Weather",
    keywords: [
      "metar",
      "weather report",
      "ceiling",
      "few",
      "scattered",
      "broken",
      "overcast",
      "altimeter setting",
      "speci",
    ],
    simple:
      "A METAR is an hourly airport weather observation. Example: `KPAO 141756Z 31008KT 10SM FEW040 18/09 A3002` = Palo Alto, 14th at 1756Z, wind 310° at 8 kt, visibility 10 SM, few clouds at 4,000 ft, temp 18 °C, dew point 9 °C, altimeter 30.02.",
    advanced:
      "Sky cover: **FEW** 1–2 oktas, **SCT** 3–4, **BKN** 5–7, **OVC** 8; the **ceiling** is the lowest BKN/OVC layer or vertical visibility (VV). Heights are AGL in hundreds of feet. Wind direction is **true**. `G` = gusts, `VRB` = variable; `M` = minus (e.g. M02). Weather: `-` light, `+` heavy, `TS` thunderstorm, `BR` mist, `FG` fog, `HZ` haze. `SPECI` = special unscheduled report. Remarks: `AO2` = automated station with precipitation discriminator.",
    refs: ["AIM 7-1", "Aviation Weather Handbook (FAA-H-8083-28)"],
    quiz: [
      {
        q: 'In a METAR, "BKN008 OVC020" means the ceiling is…',
        options: ["800 ft AGL", "2,000 ft AGL", "800 ft MSL", "No ceiling"],
        answer: 0,
        why: "The ceiling is the lowest broken or overcast layer: 800 ft AGL.",
      },
    ],
  },
  {
    id: "taf",
    title: "Terminal Aerodrome Forecast (TAF)",
    category: "Weather",
    keywords: ["taf", "forecast", "tempo", "becmg", "prob30", "fm group"],
    simple:
      "A TAF forecasts weather within **5 SM** of an airport, usually for **24 or 30 hours**. It uses the same codes as a METAR plus change groups like **FM** (from), **TEMPO** (temporary) and **PROB30/40** (probability).",
    advanced:
      "TAFs are issued 4 times daily (0000, 0600, 1200, 1800Z). `FM1500` = rapid change starting 1500Z; `TEMPO 1618` = temporary fluctuations for < 1 hour at a time and < half the period; `BECMG` = gradual change; `PROB30` = 30% chance. Visibility greater than 6 SM is shown as `P6SM`.",
    refs: ["Aviation Weather Handbook", "AIM 7-1"],
    quiz: [
      {
        q: '"P6SM" in a TAF means visibility…',
        options: [
          "Probably 6 SM",
          "Plus/greater than 6 SM",
          "6 SM in precipitation",
          "Partial 6 SM",
        ],
        answer: 1,
        why: "P6SM = more than 6 statute miles.",
      },
    ],
  },
  {
    id: "stalls",
    title: "Stalls",
    category: "Aerodynamics",
    keywords: [
      "stall",
      "stalls",
      "critical angle of attack",
      "angle of attack",
      "aoa",
      "stall recovery",
      "stall speed",
    ],
    simple:
      "A wing stalls when it exceeds its **critical angle of attack** — not at a particular airspeed. It can happen at **any airspeed, attitude or power setting**. Recover by **reducing the angle of attack** (lower the nose), then level the wings and add power.",
    advanced:
      "Stall speed increases with **weight**, **load factor** (bank), **forward CG**, and **contamination** (frost/ice); it decreases with flaps. FAA stall recovery template: 1) autopilot/autothrottle off, 2) **pitch nose down** until the stall warning stops, 3) wings level, 4) thrust as needed, 5) speed brakes retracted, 6) return to desired flight path. Accelerated stalls happen above the 1-G stall speed in turns or abrupt pull-ups.",
    refs: ["Airplane Flying Handbook ch. 5", "PHAK ch. 5", "AC 120-109"],
    quiz: [
      {
        q: "The first action to recover from a stall is…",
        options: [
          "Add full power",
          "Level the wings",
          "Reduce the angle of attack",
          "Raise the flaps",
        ],
        answer: 2,
        why: "A stall is an angle-of-attack problem; reducing AOA is always the first step.",
      },
    ],
  },
  {
    id: "spins",
    title: "Spins",
    category: "Aerodynamics",
    keywords: ["spin", "spins", "pare", "spin recovery", "autorotation", "incipient spin"],
    simple:
      "A spin is an aggravated stall with **yaw** — one wing is more stalled than the other, so the airplane autorotates. Use the POH procedure; the generic one is **PARE**: **P**ower idle, **A**ilerons neutral, **R**udder full opposite the rotation, **E**levator forward to break the stall.",
    advanced:
      "Phases: incipient, developed, recovery. Uncoordinated flight near the stall (e.g. skidding base-to-final turn with rudder) is the classic entry. Aft CG makes recovery harder or impossible. Many normal-category airplanes are not approved for intentional spins — check the limitations section.",
    refs: ["Airplane Flying Handbook ch. 5", "POH/AFM"],
    quiz: [
      {
        q: 'In PARE spin recovery, "R" stands for…',
        options: [
          "Retard throttle",
          "Rudder full opposite the rotation",
          "Roll wings level",
          "Recover pitch",
        ],
        answer: 1,
        why: "Full opposite rudder stops the rotation.",
      },
    ],
  },
  {
    id: "load-factor",
    title: "Load factor and turns",
    category: "Aerodynamics",
    keywords: [
      "load factor",
      "g force",
      "g load",
      "bank angle",
      "60 degree bank",
      "limit load",
      "normal category",
    ],
    simple:
      'Load factor is how many "G" the wings are carrying. In a level turn it increases with bank: **60° of bank = 2 G**. Stall speed rises with the square root of the load factor — at 60° bank it\'s about **41% higher**.',
    advanced:
      "Level turn: n = 1 / cos(bank). 30° ≈ 1.15 G, 45° ≈ 1.41 G, 60° = 2 G. Category limit load factors: **normal +3.8 / −1.52**, **utility +4.4 / −1.76**, **acrobatic +6.0 / −3.0**. Stall speed in a turn = Vs × √n.",
    refs: ["PHAK ch. 5", "14 CFR 23 (category limits)"],
    quiz: [
      {
        q: "The load factor in a level 60° banked turn is…",
        options: ["1.15 G", "1.41 G", "2.0 G", "3.8 G"],
        answer: 2,
        why: "1 / cos 60° = 2.",
      },
    ],
  },
  {
    id: "maneuvering-speed",
    title: "Maneuvering speed (Va)",
    category: "Aerodynamics",
    keywords: ["maneuvering speed", "va", "turbulence penetration", "design maneuvering speed"],
    simple:
      "Va is the speed at or below which the airplane will **stall before it can be overstressed** by full, abrupt control inputs or a strong gust. Slow to Va (or below) in turbulence.",
    advanced:
      "Va **decreases with lower weight**: Va(new) ≈ Va(max) × √(W/Wmax). Even below Va, full deflection of more than one control at once, or rapid reversals, can still damage the structure — Va protects against a single full deflection.",
    refs: ["PHAK ch. 5", "14 CFR 23"],
    quiz: [
      {
        q: "As aircraft weight decreases, Va…",
        options: ["Increases", "Decreases", "Stays the same", "Doubles"],
        answer: 1,
        why: "A lighter airplane reaches the limit load factor sooner, so Va decreases.",
      },
    ],
  },
  {
    id: "density-altitude",
    title: "Density altitude",
    category: "Performance",
    keywords: [
      "density altitude",
      "pressure altitude",
      "high hot humid",
      "performance",
      "takeoff distance",
    ],
    simple:
      'Density altitude is how high the airplane "feels" it is. **High, hot and humid** air is thin, so the engine makes less power, the propeller and wings are less efficient, and you\'ll need **more runway and climb more slowly**.',
    advanced:
      "Pressure altitude = field elevation + (29.92 − altimeter) × 1,000. ISA temperature is 15 °C at sea level, decreasing ~2 °C per 1,000 ft. Rule of thumb: DA ≈ PA + 120 × (OAT − ISA). Example: PA 5,000 ft, OAT 30 °C (ISA 5 °C) → DA ≈ 8,000 ft. Use POH performance charts and add a margin.",
    refs: ["PHAK ch. 11", "FAA-P-8740-2 Density Altitude"],
    quiz: [
      {
        q: "Which combination gives the highest density altitude?",
        options: ["Low, cold, dry", "High, hot, humid", "High, cold, dry", "Low, hot, dry"],
        answer: 1,
        why: "High elevation, high temperature and high humidity all decrease air density.",
      },
    ],
  },
  {
    id: "weight-balance",
    title: "Weight and balance",
    category: "Performance",
    keywords: [
      "weight and balance",
      "center of gravity",
      "cg",
      "moment",
      "arm",
      "aft cg",
      "forward cg",
    ],
    simple:
      "Weight × arm = moment. Add up all weights and moments; **CG = total moment ÷ total weight**. The CG must stay within the POH envelope for the whole flight (fuel burn moves it).",
    advanced:
      "Standard weights: avgas **6 lb/gal**, Jet A ~**6.7 lb/gal**, oil **7.5 lb/gal**. **Forward CG**: more stable, higher stall speed, more tail-down force, harder to flare. **Aft CG**: less stable, lower stall speed, harder (or impossible) stall/spin recovery. Weight shift: ΔCG = (weight moved × distance) ÷ total weight.",
    refs: ["Weight & Balance Handbook FAA-H-8083-1", "PHAK ch. 10"],
    quiz: [
      {
        q: "An aft CG generally causes…",
        options: [
          "Higher stall speed",
          "Reduced stability and harder stall recovery",
          "Better spin recovery",
          "More tail-down force",
        ],
        answer: 1,
        why: "Aft CG reduces longitudinal stability and makes stall/spin recovery more difficult.",
      },
    ],
  },
  {
    id: "carb-ice",
    title: "Carburetor icing",
    category: "Procedures",
    keywords: ["carb ice", "carburetor ice", "carburetor icing", "carb heat", "induction icing"],
    simple:
      "Fuel evaporating in the carburetor venturi can drop the temperature enough to form ice, **even on warm days**. With a fixed-pitch prop the first sign is a **drop in RPM**. Apply **full carb heat**; RPM drops a bit more, then rises as the ice melts.",
    advanced:
      "Carb ice is likely below about 21 °C (70 °F) with high humidity and possible up to ~38 °C (100 °F) with humidity as low as 50%; it's most likely at reduced power (descents). Constant-speed props show a **manifold pressure** drop instead. Carb heat enriches the mixture (warm air is less dense) and reduces power. Fuel-injected engines don't get carb ice but can suffer induction (impact) icing.",
    refs: ["PHAK ch. 7"],
    quiz: [
      {
        q: "With a fixed-pitch propeller, the first indication of carburetor ice is usually…",
        options: ["Rise in oil temperature", "Drop in RPM", "Rise in RPM", "Drop in oil pressure"],
        answer: 1,
        why: "Ice restricts airflow, reducing power — seen as an RPM drop on a fixed-pitch prop.",
      },
    ],
  },
  {
    id: "hypoxia",
    title: "Hypoxia and supplemental oxygen",
    category: "Human factors",
    keywords: [
      "hypoxia",
      "oxygen",
      "91.211",
      "hypemic",
      "histotoxic",
      "stagnant",
      "carbon monoxide",
      "12500",
      "14000",
    ],
    simple:
      "Hypoxia is not enough oxygen reaching the brain. It sneaks up with **euphoria, impaired judgment, headache and blue lips/fingernails**. Above **12,500 ft** for more than 30 minutes the crew must use oxygen; above **14,000 ft** at all times; above **15,000 ft** passengers must be offered it.",
    advanced:
      "Types: **hypoxic** (altitude), **hypemic** (blood can't carry O₂ — CO poisoning, anemia, recent blood donation), **stagnant** (poor circulation — G-forces, cold), **histotoxic** (cells can't use O₂ — alcohol, drugs). Time of useful consciousness drops sharply above 18,000 ft. A CO detector helps catch exhaust leaks from cabin heaters.",
    refs: ["14 CFR 91.211", "AIM 8-1-2", "PHAK ch. 17"],
    quiz: [
      {
        q: "Carbon monoxide poisoning causes which type of hypoxia?",
        options: ["Hypoxic", "Hypemic", "Stagnant", "Histotoxic"],
        answer: 1,
        why: "CO binds to hemoglobin, reducing the blood's ability to carry oxygen (hypemic).",
      },
    ],
  },
  {
    id: "spatial-disorientation",
    title: "Spatial disorientation and illusions",
    category: "Human factors",
    keywords: [
      "spatial disorientation",
      "vertigo",
      "the leans",
      "graveyard spiral",
      "somatogravic",
      "coriolis",
      "inner ear",
      "vestibular",
    ],
    simple:
      "Without outside visual references, your inner ear lies to you. A slow turn can feel like level flight, and leveling out can feel like turning the other way (**the leans**). **Trust your instruments**, not your body.",
    advanced:
      "Vestibular illusions: **the leans**, **Coriolis** (head movement during a turn — most overwhelming), **graveyard spiral** (pulling back in an unnoticed descending turn tightens it), **graveyard spin**, **somatogravic** (acceleration feels like pitch-up → pilot pushes nose down), **inversion**, **elevator** illusions. Visual: **false horizon**, **autokinesis** (a stationary light seems to move). VFR pilots entering IMC are at high risk — avoid it, and if it happens, use instruments and get help.",
    refs: ["AIM 8-1-5", "PHAK ch. 17"],
    quiz: [
      {
        q: "A rapid acceleration on a dark night takeoff can create the illusion of…",
        options: [
          "A nose-down attitude",
          "A nose-up attitude (somatogravic illusion)",
          "A left bank",
          "Descending",
        ],
        answer: 1,
        why: "The somatogravic illusion makes acceleration feel like pitching up; pilots may push the nose down.",
      },
    ],
  },
  {
    id: "adm",
    title: "Aeronautical decision-making (PAVE, IMSAFE, DECIDE)",
    category: "Human factors",
    keywords: [
      "adm",
      "pave",
      "imsafe",
      "decide",
      "3p",
      "risk management",
      "personal minimums",
      "decision making",
    ],
    simple:
      "Use checklists for your judgment too:\n\n- **IMSAFE** — am I fit? Illness, Medication, Stress, Alcohol, Fatigue, Emotion/Eating\n- **PAVE** — risks: Pilot, Aircraft, enVironment, External pressures\n- **DECIDE** — Detect, Estimate, Choose, Identify, Do, Evaluate",
    advanced:
      "The **3P** model (Perceive, Process, Perform) is used continuously in flight. Combine with **personal minimums** set on the ground, before external pressure (get-there-itis) builds. Single-pilot resource management (SRM) adds task, automation and risk management, and CFIT awareness.",
    refs: ["PHAK ch. 2", "Risk Management Handbook FAA-H-8083-2"],
    quiz: [
      {
        q: 'In PAVE, the "E" stands for…',
        options: ["Emergency", "External pressures", "Equipment", "Experience"],
        answer: 1,
        why: "Pilot, Aircraft, enVironment, External pressures.",
      },
    ],
  },
  {
    id: "hazardous-attitudes",
    title: "The five hazardous attitudes",
    category: "Human factors",
    keywords: [
      "hazardous attitudes",
      "anti-authority",
      "impulsivity",
      "invulnerability",
      "macho",
      "resignation",
      "antidote",
    ],
    simple:
      'Five attitudes lead pilots into trouble, each with an antidote:\n\n1. **Anti-authority** ("Don\'t tell me") → Follow the rules\n2. **Impulsivity** ("Do it quickly") → Not so fast, think first\n3. **Invulnerability** ("It won\'t happen to me") → It could happen to me\n4. **Macho** ("I can do it") → Taking chances is foolish\n5. **Resignation** ("What\'s the use?") → I\'m not helpless',
    advanced:
      "Recognise the attitude in yourself, label it, and say the antidote out loud. Written exams test matching a scenario to the attitude (e.g. a pilot who scud-runs to impress passengers → macho).",
    refs: ["PHAK ch. 2"],
    quiz: [
      {
        q: '"It won\'t happen to me" is which hazardous attitude?',
        options: ["Macho", "Invulnerability", "Resignation", "Impulsivity"],
        answer: 1,
        why: 'Invulnerability — antidote: "It could happen to me."',
      },
    ],
  },
  {
    id: "alcohol-drugs",
    title: "Alcohol and drugs (91.17)",
    category: "Regulations",
    keywords: ["alcohol", "drugs", "91.17", "8 hours", "bottle to throttle", "0.04", "medication"],
    simple:
      'No flying within **8 hours** of drinking alcohol ("bottle to throttle"), while under the influence, or with a blood alcohol of **0.04% or more** — and none of these is a safe target. Many medications also make you unfit to fly.',
    advanced:
      "91.17 also prohibits using any drug that affects your faculties contrary to safety, and carrying an obviously intoxicated passenger (except a medical patient under care). Use the FAA's medication guidance and IMSAFE; many pilots use a 12–24 hour personal rule.",
    refs: ["14 CFR 91.17", "AIM 8-1-1"],
    quiz: [
      {
        q: "The minimum time between drinking alcohol and acting as crew is…",
        options: ["4 hours", "8 hours", "12 hours", "24 hours"],
        answer: 1,
        why: "91.17(a)(1): 8 hours.",
      },
    ],
  },
  {
    id: "vor",
    title: "VOR navigation",
    category: "Navigation",
    keywords: [
      "vor",
      "radial",
      "cdi",
      "obs",
      "to from",
      "reverse sensing",
      "vor check",
      "91.171",
      "vot",
    ],
    simple:
      "A VOR transmits **radials** — magnetic courses **FROM** the station. Set a course with the OBS; the CDI needle shows whether the course is left or right, and the TO/FROM flag tells which side of the station you're on.",
    advanced:
      "Full-scale CDI deflection is **±10°**. Set the OBS close to your heading to avoid **reverse sensing**. Frequencies 108.0–117.95 MHz; always identify the Morse code. IFR VOR checks within **30 days** (91.171): VOT or ground checkpoint **±4°**, airborne checkpoint **±6°**, dual VOR **within 4°** of each other. Service volumes: Terminal, Low, High (and VOR MON).",
    refs: ["AIM 1-1-3", "14 CFR 91.171", "PHAK ch. 16"],
    quiz: [
      {
        q: "Allowable error for a VOT check is…",
        options: ["±2°", "±4°", "±6°", "±10°"],
        answer: 1,
        why: "91.171: VOT and ground checkpoint ±4°; airborne ±6°.",
      },
    ],
  },
  {
    id: "ils",
    title: "ILS approach",
    category: "IFR",
    keywords: [
      "ils",
      "localizer",
      "glideslope",
      "glide slope",
      "decision altitude",
      "da",
      "dh",
      "precision approach",
      "marker",
    ],
    simple:
      "An ILS gives you **lateral** guidance (localizer) and **vertical** guidance (glideslope, usually 3°) down to a **decision altitude (DA)**. At DA, if you can't see the runway environment, you go missed.",
    advanced:
      "Localizer: 108.10–111.95 MHz (odd tenths), course width typically **3–6°** full scale (about 700 ft wide at the threshold) — about **4× more sensitive** than a VOR. Glideslope full scale ≈ ±0.7°. Category I typical minimums: **200 ft HAT and ½ SM (RVR 2400/1800)**. To descend below DA you need the required flight visibility and specific runway references (91.175). A back course has reverse sensing on a basic CDI (not on an HSI set to the front course).",
    refs: ["AIM 1-1-9", "14 CFR 91.175", "IFH ch. 10"],
    quiz: [
      {
        q: "Compared with a VOR, a localizer is about… more sensitive.",
        options: ["Twice", "Four times", "Ten times", "Equally"],
        answer: 1,
        why: "Localizer full scale is ~2.5° each side vs 10° for a VOR — roughly 4×.",
      },
    ],
  },
  {
    id: "holding",
    title: "Holding patterns and entries",
    category: "IFR",
    keywords: [
      "holding",
      "hold",
      "holding pattern",
      "direct entry",
      "teardrop",
      "parallel entry",
      "efc",
      "holding speed",
    ],
    simple:
      "A hold is a racetrack over a fix. Standard holds use **right turns** and **1-minute inbound legs** (at or below 14,000 ft MSL). You enter using **direct**, **parallel** or **teardrop** depending on your heading relative to the holding course.",
    advanced:
      "Entry sectors use a line 70° from the holding course through the fix (AIM 5-3-8). Max holding speeds (most civil): **200 KIAS** up to 6,000 MSL, **230 KIAS** 6,001–14,000, **265 KIAS** above 14,000. Above 14,000 MSL legs are 1½ minutes. ATC holding clearance: direction from fix, fix, radial/course, leg length if not standard, left turns if non-standard, and an **EFC** time. Lost comms: leave the hold at the EFC.",
    refs: ["AIM 5-3-8", "IFH ch. 10"],
    quiz: [
      {
        q: "Maximum holding speed for a civil aircraft at 8,000 ft MSL is…",
        options: ["200 KIAS", "210 KIAS", "230 KIAS", "265 KIAS"],
        answer: 2,
        why: "6,001–14,000 ft MSL: 230 KIAS.",
      },
    ],
  },
  {
    id: "lost-comms",
    title: "IFR lost communications (91.185)",
    category: "IFR",
    keywords: [
      "lost comms",
      "lost communications",
      "lose comms",
      "lose communication",
      "lose communications",
      "lose radio",
      "comms",
      "radio failure",
      "no radio",
      "91.185",
      "avef",
      "mea",
      "7600",
    ],
    simple:
      "If you lose two-way radio in **VFR conditions**, stay VFR and land as soon as practicable. In **IMC**, fly the route and altitude rules of 91.185 and squawk **7600**.",
    advanced:
      "**Route — AVEF**: **A**ssigned, **V**ectored (direct to the fix/route in the vector clearance), **E**xpected, **F**iled. **Altitude** — the **highest** of: the last **assigned**, the **MEA**, or the altitude ATC told you to **expect** (once that time/fix arrives). Leaving the clearance limit: if it's the approach fix, begin descent/approach as close as possible to the EFC (or ETA if no EFC). Use 121.5 and listen on navaid voice.",
    refs: ["14 CFR 91.185", "AIM 6-4-1"],
    quiz: [
      {
        q: "In IMC with lost comms, you fly the highest of assigned, expected, and…",
        options: ["Filed altitude", "MEA", "MOCA", "Cruise altitude"],
        answer: 1,
        why: "91.185(c)(2): highest of assigned, MEA, or expected.",
      },
    ],
  },
  {
    id: "transponder",
    title: "Transponder codes and Mode C / ADS-B",
    category: "Communications",
    keywords: [
      "transponder",
      "squawk",
      "1200",
      "7500",
      "7600",
      "7700",
      "mode c",
      "ads-b",
      "91.215",
    ],
    simple:
      "Key codes: **1200** VFR, **7500** hijack, **7600** lost communications, **7700** emergency. When changing codes, avoid passing through the emergency codes.",
    advanced:
      "Mode C (altitude reporting) and ADS-B Out are required in Class A, B and C, within 30 NM of Class B primary airports (Mode C veil), above the ceiling of Class B/C up to 10,000 MSL within their lateral limits, and above 10,000 MSL (except at or below 2,500 AGL). Transponder checks every 24 calendar months (91.413).",
    refs: ["14 CFR 91.215, 91.225", "AIM 4-1-20, 6-2-2"],
    quiz: [
      {
        q: "The transponder code for lost communications is…",
        options: ["7500", "7600", "7700", "1200"],
        answer: 1,
        why: "7600 = radio failure.",
      },
    ],
  },
  {
    id: "engine-failure",
    title: "Engine failure in flight (ABCDE)",
    category: "Procedures",
    keywords: [
      "engine failure",
      "engine out",
      "forced landing",
      "abcde",
      "best glide",
      "power off landing",
      "emergency landing",
    ],
    simple:
      "**Fly the airplane first.** Then **ABCDE**: **A**irspeed — best glide; **B**est field — pick a landing spot; **C**hecklist — restart attempt (fuel, mixture, carb heat, mags); **D**eclare — MAYDAY, 7700; **E**xecute — land, securing the airplane.",
    advanced:
      'Pitch for Vg immediately — every knot above or below costs distance. Turn toward the best field before troubleshooting. On an engine failure after takeoff, land roughly straight ahead (within ~30° either side); the "impossible turn" back to the runway kills pilots unless altitude and training support it.',
    refs: ["Airplane Flying Handbook ch. 18", "POH section 3"],
    quiz: [
      {
        q: "The first thing to do after an engine failure in cruise is…",
        options: ["Call ATC", "Establish best glide speed", "Restart the engine", "Squawk 7700"],
        answer: 1,
        why: "Aviate first: best glide maximises time and options.",
      },
    ],
  },
  {
    id: "emergency-comms",
    title: "Declaring an emergency (MAYDAY / PAN-PAN)",
    category: "Communications",
    keywords: [
      "mayday",
      "pan pan",
      "pan-pan",
      "declare emergency",
      "distress",
      "urgency",
      "121.5",
      "guard",
    ],
    simple:
      "**MAYDAY** (said 3 times) = distress: grave, imminent danger. **PAN-PAN** (3 times) = urgency: safety concern, not immediate danger. Then: who you're calling, callsign, nature of the problem, position, altitude, intentions, souls on board and fuel remaining. Squawk **7700**.",
    advanced:
      "If you aren't talking to anyone, use the current frequency or **121.5** (guard). The PIC may deviate from any rule to meet an emergency (91.3(b)) and must send a written report only if requested. Don't hesitate to declare — it costs nothing and gets you priority.",
    refs: ["AIM 6-3-1", "14 CFR 91.3"],
    quiz: [
      {
        q: '"PAN-PAN" indicates…',
        options: ["Distress", "Urgency", "Lost comms", "Hijack"],
        answer: 1,
        why: "PAN-PAN = urgency; MAYDAY = distress.",
      },
    ],
  },
  {
    id: "right-of-way",
    title: "Right-of-way rules (91.113)",
    category: "Regulations",
    keywords: [
      "right of way",
      "right-of-way",
      "91.113",
      "converging",
      "head on",
      "overtaking",
      "balloon",
    ],
    simple:
      "An aircraft in **distress** has right of way over all. Converging at the same altitude: the aircraft on the **right** has right of way. **Head-on**: both turn **right**. **Overtaking**: pass on the **right**. Landing aircraft have right of way over those on the ground and in flight.",
    advanced:
      "Category priority: **balloon** > **glider** > **airship** > powered parachute / weight-shift > **airplane / rotorcraft**. An aircraft towing or refueling others has right of way over other engine-driven aircraft. When two aircraft approach to land, the **lower** one has right of way but may not cut in front of another on final.",
    refs: ["14 CFR 91.113"],
    quiz: [
      {
        q: "An airplane and a glider converge. Who has the right of way?",
        options: ["The airplane", "The glider", "The faster aircraft", "The one on the left"],
        answer: 1,
        why: "Gliders have right of way over airships, airplanes and rotorcraft.",
      },
    ],
  },
  {
    id: "minimum-altitudes",
    title: "Minimum safe altitudes (91.119)",
    category: "Regulations",
    keywords: ["minimum safe altitude", "91.119", "congested area", "1000 feet", "500 feet"],
    simple:
      "Except for takeoff and landing: always high enough to make an emergency landing without undue hazard; over **congested areas**, **1,000 ft above** the highest obstacle within **2,000 ft**; elsewhere **500 ft above the surface**; over open water/sparse areas, no closer than **500 ft** to any person, vessel, vehicle or structure.",
    advanced:
      "Helicopters, powered parachutes and weight-shift aircraft have relaxed rules. Separately, wilderness areas and national parks ask for 2,000 ft AGL (advisory, chart note). IFR minimum altitudes are in 91.177.",
    refs: ["14 CFR 91.119"],
    quiz: [
      {
        q: "Over a congested area, minimum altitude is…",
        options: [
          "500 ft AGL",
          "1,000 ft above the highest obstacle within 2,000 ft",
          "1,000 ft AGL",
          "2,000 ft AGL",
        ],
        answer: 1,
        why: "91.119(b).",
      },
    ],
  },
  {
    id: "light-gun",
    title: "Light gun signals",
    category: "Communications",
    keywords: [
      "light gun",
      "light signals",
      "steady green",
      "flashing red",
      "lost radio tower",
      "nordo",
    ],
    simple:
      "If your radio fails near a tower, watch for light signals:\n\n- **Steady green**: ground — cleared for takeoff; air — cleared to land\n- **Flashing green**: ground — cleared to taxi; air — return for landing\n- **Steady red**: ground — stop; air — give way, continue circling\n- **Flashing red**: ground — taxi clear of the runway; air — airport unsafe, do not land\n- **Flashing white**: ground — return to starting point\n- **Alternating red/green**: exercise extreme caution",
    advanced:
      "Acknowledge in the air by rocking wings (day) or flashing landing/navigation lights (night); on the ground by moving ailerons/rudder (day) or flashing lights (night). Squawk 7600 and remain outside Class D until you've worked out the traffic flow.",
    refs: ["AIM 4-3-13"],
    quiz: [
      {
        q: "A flashing red light to an aircraft in flight means…",
        options: [
          "Give way and circle",
          "Airport unsafe — do not land",
          "Return for landing",
          "Cleared to land",
        ],
        answer: 1,
        why: "Flashing red (in flight): airport unsafe, do not land.",
      },
    ],
  },
  {
    id: "wake-turbulence",
    title: "Wake turbulence",
    category: "Procedures",
    keywords: ["wake turbulence", "wingtip vortices", "vortices", "heavy aircraft", "jet blast"],
    simple:
      "Every wing producing lift sheds wingtip vortices — strongest from **heavy, clean, slow** airplanes. They **sink** and drift with the wind. Land **beyond** a heavy's touchdown point and take off **before** its rotation point, climbing above its path.",
    advanced:
      "Vortices sink ~300–500 fpm and level off about 500–900 ft below the generating aircraft's path. A **light quartering tailwind** is most dangerous (it can hold a vortex on the runway or move the upwind vortex into the touchdown zone). Near the ground, vortices move outward at 2–3 kt. ATC applies extra separation behind heavies but VFR pilots are responsible for wake avoidance once they accept a visual.",
    refs: ["AIM 7-4"],
    quiz: [
      {
        q: "Which wind is most hazardous for lingering wake turbulence on the runway?",
        options: ["Strong headwind", "Light quartering tailwind", "Strong crosswind", "Calm"],
        answer: 1,
        why: "A light quartering tailwind can move vortices into the touchdown zone and keep them there.",
      },
    ],
  },
  {
    id: "airport-signs",
    title: "Runway signs, markings and hold-short lines",
    category: "Procedures",
    keywords: [
      "runway markings",
      "hold short",
      "hold short line",
      "runway signs",
      "mandatory sign",
      "runway incursion",
      "ils critical area",
      "taxiway signs",
    ],
    simple:
      "**Red signs with white letters** are mandatory (runway holding position) — never cross without a clearance at a towered airport. The **hold-short marking** is four yellow lines, two solid and two dashed: stop on the **solid** side.",
    advanced:
      "Black signs with yellow letters = **location** (you are here). Yellow with black text and arrows = **direction/destination**. The ILS critical-area hold marking looks like a yellow ladder. Read back all hold-short instructions and verify the runway on the compass/heading before takeoff. At non-towered airports, look both ways and announce before crossing.",
    refs: ["AIM 2-3", "AIM 4-3-18", "AC 150/5340-18"],
    quiz: [
      {
        q: "At a hold-short marking, the aircraft stops on the side with…",
        options: ["Dashed lines", "Solid lines", "Either side", "Red paint"],
        answer: 1,
        why: "Solid lines face the holding aircraft; dashed lines face the runway.",
      },
    ],
  },
  {
    id: "pitot-static",
    title: "Pitot-static instruments (ASI, altimeter, VSI)",
    category: "Instruments",
    keywords: [
      "pitot static",
      "pitot-static",
      "airspeed indicator",
      "altimeter",
      "vsi",
      "vertical speed",
      "blocked pitot",
      "blocked static",
      "alternate static",
    ],
    simple:
      "The **airspeed indicator** compares ram (pitot) pressure to static pressure. The **altimeter** and **vertical speed indicator** use static pressure only. Blockages make them lie in predictable ways.",
    advanced:
      '**Pitot blocked (ram and drain hole)**: the ASI acts like an altimeter — reads higher in a climb, lower in a descent. **Static blocked**: altimeter freezes, VSI reads zero, ASI reads **low in a climb / high in a descent**. **Alternate static** (cabin pressure is lower): altimeter and ASI read slightly **high**, VSI shows a momentary climb. Altimeter errors: "high to low, look out below" (pressure or temperature).',
    refs: ["PHAK ch. 8", "IFH ch. 5"],
    quiz: [
      {
        q: "If the static port is blocked, the altimeter will…",
        options: [
          "Read zero",
          "Freeze at the altitude where it blocked",
          "Act like an airspeed indicator",
          "Read high",
        ],
        answer: 1,
        why: "With no static pressure change, the altimeter stays put.",
      },
    ],
  },
  {
    id: "gyro-instruments",
    title: "Gyroscopic instruments (AI, HI, turn coordinator)",
    category: "Instruments",
    keywords: [
      "attitude indicator",
      "heading indicator",
      "turn coordinator",
      "gyro",
      "gyroscope",
      "vacuum",
      "precession",
      "rigidity in space",
      "standard rate",
    ],
    simple:
      "Gyros use **rigidity in space**. The **attitude indicator** shows pitch and bank; the **heading indicator** shows heading (realign it with the compass about every 15 minutes); the **turn coordinator** shows rate of roll and turn, and the ball shows coordination.",
    advanced:
      "Typical light aircraft: AI and HI are **vacuum** driven, turn coordinator **electric** (redundancy). **Precession** causes HI drift. A standard-rate turn is **3°/s** (360° in 2 minutes) — the turn coordinator's wing on the index mark. Vacuum failure: AI and HI slowly become unreliable — cover them and fly partial panel.",
    refs: ["PHAK ch. 8", "IFH ch. 5"],
    quiz: [
      {
        q: "A standard-rate turn is…",
        options: ["1.5°/s", "3°/s", "6°/s", "30° of bank"],
        answer: 1,
        why: "3° per second = 360° in 2 minutes.",
      },
    ],
  },
  {
    id: "compass",
    title: "Magnetic compass errors",
    category: "Instruments",
    keywords: [
      "magnetic compass",
      "compass errors",
      "northerly turning error",
      "ands",
      "unos",
      "deviation",
      "variation",
      "dip",
    ],
    simple:
      "The compass is reliable only in straight, level, unaccelerated flight. In the Northern Hemisphere: **ANDS** — **A**ccelerate **N**orth, **D**ecelerate **S**outh (on east/west headings). **UNOS** — **U**ndershoot **N**orth, **O**vershoot **S**outh when turning to those headings.",
    advanced:
      "Errors come from **magnetic dip**. Also: **variation** (true vs magnetic north — from charts), **deviation** (the aircraft's own magnetic fields — compass correction card), **oscillation** in turbulence. Rule of thumb for turning to north/south: lead/lag by latitude plus half the bank.",
    refs: ["PHAK ch. 8"],
    quiz: [
      {
        q: "In the Northern Hemisphere, accelerating on an easterly heading makes the compass indicate a turn toward…",
        options: ["North", "South", "West", "No error"],
        answer: 0,
        why: "ANDS: Accelerate North.",
      },
    ],
  },
  {
    id: "traffic-pattern",
    title: "Traffic patterns and CTAF procedures",
    category: "Procedures",
    keywords: [
      "traffic pattern",
      "pattern",
      "ctaf",
      "non-towered",
      "uncontrolled airport",
      "self announce",
      "45 entry",
      "downwind",
      "unicom",
    ],
    simple:
      'Standard patterns use **left turns** at about **1,000 ft AGL** unless published otherwise. At non-towered airports, enter **45° to the downwind at midfield** at pattern altitude and **self-announce** on the CTAF: "<Airport> traffic, <type/callsign>, <position>, <intentions>, <airport> traffic."',
    advanced:
      'Announce about 10 miles out, entering downwind, base, final and clear of the runway. Depart straight out or with a 45° turn after reaching pattern altitude (AIM 4-3-3). Overfly at least 500 ft above pattern altitude. "Any traffic please advise" is not a recognized call. Check the Chart Supplement for right traffic and non-standard pattern altitudes.',
    refs: ["AIM 4-1-9, 4-3-3", "AC 90-66"],
    quiz: [
      {
        q: "The recommended entry to a non-towered traffic pattern is…",
        options: [
          "Straight-in to final",
          "45° to the downwind at midfield",
          "Crosswind at pattern altitude",
          "Overhead the field",
        ],
        answer: 1,
        why: "AIM 4-3-3 / AC 90-66: 45° to the downwind leg, abeam midfield.",
      },
    ],
  },
  {
    id: "atc-phraseology",
    title: "ATC phraseology and readbacks",
    category: "Communications",
    keywords: [
      "phraseology",
      "readback",
      "read back",
      "roger",
      "wilco",
      "say again",
      "radio calls",
      "callsign",
      "phonetic alphabet",
      "radio communication",
    ],
    simple:
      "A good radio call answers **who you're calling, who you are, where you are, what you want**. **Read back** runway assignments, hold-short instructions, altitudes, headings, frequencies and transponder codes, then your callsign. **Roger** = received; **Wilco** = will comply; **Say again** = repeat; **Unable** = can't comply.",
    advanced:
      'Use the full callsign until ATC abbreviates it (AIM 4-2-4). Numbers are spoken digit by digit ("niner" for 9); altitudes in thousands/hundreds; frequencies with "point". "Affirmative/negative" instead of yes/no. Listen before transmitting to avoid blocking others. Never accept an instruction you can\'t safely follow — say "unable".',
    refs: ["AIM 4-2", "AIM 4-4-7", "Pilot/Controller Glossary"],
    quiz: [
      {
        q: '"Wilco" means…',
        options: ["I have received your message", "I will comply", "Repeat that", "Wait"],
        answer: 1,
        why: "Wilco = will comply; roger = received.",
      },
    ],
  },
  {
    id: "icing",
    title: "Structural icing",
    category: "Weather",
    keywords: [
      "icing",
      "structural ice",
      "rime ice",
      "clear ice",
      "freezing rain",
      "frost",
      "known icing",
    ],
    simple:
      "Structural ice needs **visible moisture** and an airframe temperature at or below **freezing**. It destroys lift, adds weight and drag, and raises stall speed. If you pick up ice, **change altitude or turn around** — don't wait.",
    advanced:
      "**Rime**: small supercooled droplets freeze instantly — rough, milky. **Clear**: large droplets flow back before freezing — smooth, heavy, most dangerous (often 0 to −10 °C, freezing rain). **Mixed**: both. **Freezing rain** implies warmer air above (inversion) — climbing may help. **Frost** must be removed before takeoff; even sandpaper-thin frost can significantly reduce lift.",
    refs: ["Aviation Weather Handbook", "AC 91-74", "PHAK ch. 12"],
    quiz: [
      {
        q: "Freezing rain at the surface usually means…",
        options: [
          "Colder air above",
          "Warmer air above (temperature inversion)",
          "A thunderstorm is near",
          "Fog will form",
        ],
        answer: 1,
        why: "Rain forms in warmer air aloft and falls into sub-freezing air below.",
      },
    ],
  },
  {
    id: "thunderstorms",
    title: "Thunderstorms and microbursts",
    category: "Weather",
    keywords: [
      "thunderstorm",
      "thunderstorms",
      "microburst",
      "convective",
      "cumulonimbus",
      "wind shear",
      "squall line",
    ],
    simple:
      "Thunderstorms need **moisture, unstable air and a lifting force**. Avoid them by at least **20 NM** if severe — they bring turbulence, hail, lightning, icing and wind shear. Never fly under the anvil or try to cross a squall line.",
    advanced:
      "Life cycle: **cumulus** (updrafts), **mature** (updrafts and downdrafts, precipitation starts — most intense), **dissipating** (downdrafts). **Microbursts**: downdrafts up to ~6,000 fpm, horizontal extent < 2.5 miles, lasting ~15 minutes — first a headwind (performance increase), then a strong downdraft and tailwind. Embedded thunderstorms in IMC are especially dangerous.",
    refs: ["AIM 7-1-28", "Aviation Weather Handbook"],
    quiz: [
      {
        q: "The thunderstorm stage with both updrafts and downdrafts is the…",
        options: ["Cumulus stage", "Mature stage", "Dissipating stage", "Anvil stage"],
        answer: 1,
        why: "Mature stage — precipitation begins and the storm is most intense.",
      },
    ],
  },
  {
    id: "fronts",
    title: "Air masses and fronts",
    category: "Weather",
    keywords: [
      "front",
      "fronts",
      "cold front",
      "warm front",
      "occluded",
      "stationary front",
      "air mass",
    ],
    simple:
      "A **front** is the boundary between air masses. **Cold fronts** move fast and bring a narrow band of cumulus clouds, showers and gusty winds, then clear skies. **Warm fronts** move slowly and bring wide areas of low stratus clouds, poor visibility and steady rain.",
    advanced:
      "Frontal passage is marked by a **wind shift**, temperature/dew point change and pressure change. Stable air → stratiform clouds, smooth air, poor visibility; unstable air → cumuliform clouds, turbulence, showers, good visibility. Occluded fronts combine both and can hide embedded thunderstorms.",
    refs: ["PHAK ch. 12", "Aviation Weather Handbook"],
    quiz: [
      {
        q: "Which is typical of a warm front?",
        options: [
          "Narrow line of thunderstorms",
          "Widespread low stratus and steady precipitation",
          "Rapid clearing",
          "Strong gusts",
        ],
        answer: 1,
        why: "Warm fronts bring extensive stratiform clouds and steady precipitation over a wide area.",
      },
    ],
  },
  {
    id: "instrument-scan",
    title: "Instrument scan and attitude flying",
    category: "IFR",
    keywords: [
      "instrument scan",
      "scan",
      "attitude instrument flying",
      "fixation",
      "partial panel",
      "radial scan",
      "control and performance",
    ],
    simple:
      "Attitude instrument flying = **set an attitude and power, then cross-check** the instruments. Center the scan on the **attitude indicator**, glance out to another instrument and back.",
    advanced:
      "Common scan errors: **fixation**, **omission**, **emphasis**. Control–performance method: control instruments (attitude, power) vs performance instruments (airspeed, altitude, heading, VSI). Standard-rate bank ≈ **TAS/10 + 7** degrees. Partial panel: use the turn coordinator, compass (with its errors), airspeed, altimeter and VSI; make small, timed turns.",
    refs: ["Instrument Flying Handbook ch. 6–7"],
    quiz: [
      {
        q: "Approximate bank for a standard-rate turn at 100 KTAS is…",
        options: ["10°", "17°", "25°", "30°"],
        answer: 1,
        why: "100/10 + 7 = 17°.",
      },
    ],
  },
  {
    id: "night-illusions",
    title: "Night vision and landing illusions",
    category: "Human factors",
    keywords: [
      "night vision",
      "night flying",
      "black hole",
      "landing illusions",
      "dark adaptation",
      "rods",
      "cones",
      "upsloping runway",
      "narrow runway",
    ],
    simple:
      "Your eyes take about **30 minutes** to fully adapt to darkness. At night, look **slightly off-center** (rods are in the periphery). Some runways and conditions trick you into flying a **dangerously low approach** — use VASI/PAPI and glidepath guidance.",
    advanced:
      "Illusions that make you feel **too high** (so you fly too low): **upsloping runway**, **narrow runway**, **featureless terrain / black-hole approach**, **rain on the windscreen**. Too **low** (you fly too high): **downsloping** or **wide** runway. **Haze** makes the runway seem farther away; entering **fog** can cause a pitch-up illusion. Avoid bright light after adaptation; use red or dim white cockpit lighting.",
    refs: ["AIM 8-1-6, 2-1-2", "PHAK ch. 17"],
    quiz: [
      {
        q: "A narrower-than-usual runway can create the illusion of being…",
        options: ["Too low", "Too high", "Too fast", "Off centerline"],
        answer: 1,
        why: "It looks farther away/higher, so pilots tend to fly a lower approach.",
      },
    ],
  },
  {
    id: "glass-cockpit",
    title: "Glass cockpit (G1000 PFD/MFD)",
    category: "Instruments",
    keywords: [
      "g1000",
      "glass cockpit",
      "pfd",
      "mfd",
      "ahrs",
      "adc",
      "reversionary",
      "primary flight display",
    ],
    simple:
      "A **PFD** combines the six-pack: attitude in the middle, **airspeed tape** on the left, **altitude tape** and VSI on the right, and an **HSI** below. The **MFD** shows the moving map, engine indications and flight plan.",
    advanced:
      "Sensors: **AHRS** (attitude/heading) and **ADC** (air data). A red X over a display means its data is invalid. **Reversionary mode** (red DISPLAY BACKUP button) puts flight and engine information on one screen if a display fails. Trend vectors predict airspeed/altitude ~6 seconds ahead. Always know where the standby instruments are and practise using them.",
    refs: ["Advanced Avionics Handbook FAA-H-8083-6", "G1000 Pilot's Guide"],
    quiz: [
      {
        q: "On a G1000, a red X over the airspeed tape indicates…",
        options: ["Overspeed", "Invalid airspeed data", "Stall warning", "Autopilot failure"],
        answer: 1,
        why: "A red X means the information source has failed or is invalid.",
      },
    ],
  },
  {
    id: "autopilot",
    title: "Autopilot basics",
    category: "Instruments",
    keywords: [
      "autopilot",
      "flight director",
      "hdg mode",
      "nav mode",
      "apr mode",
      "alt hold",
      "vs mode",
      "automation",
    ],
    simple:
      "The autopilot flies the modes you select: **HDG** (heading bug), **NAV** (course), **APR** (approach), **ALT** (hold altitude), **VS** (vertical speed). Always ask: **What is it doing? Why? What will it do next?**",
    advanced:
      "On many systems **armed** modes show in white and **active** modes in green. Know at least two ways to disconnect it, and the trim-runaway procedure (disconnect, hold the yoke, pull the circuit breaker). Automation reduces workload but can cause mode confusion — verify every mode change on the annunciator bar.",
    refs: ["Advanced Avionics Handbook", "AFM supplement for the autopilot"],
    quiz: [
      {
        q: "On a typical G1000 autopilot, a mode shown in white is…",
        options: ["Active", "Armed", "Failed", "Disconnected"],
        answer: 1,
        why: "White = armed (waiting to capture); green = active.",
      },
    ],
  },
  {
    id: "weather-briefing",
    title: "Preflight weather briefings",
    category: "Weather",
    keywords: [
      "weather briefing",
      "preflight briefing",
      "1800wxbrief",
      "standard briefing",
      "abbreviated briefing",
      "outlook briefing",
      "91.103",
    ],
    simple:
      "Before every flight, gather **all available information** (91.103): weather, fuel, alternatives, runway lengths, delays and performance. Briefing types: **standard** (full), **abbreviated** (update/specific items) and **outlook** (6+ hours before departure).",
    advanced:
      "Sources include 1800wxbrief.com, aviationweather.gov and approved EFB apps. Look at the big picture (surface analysis, prog charts), then hazards (SIGMETs, AIRMETs, convective outlook, PIREPs), then METARs/TAFs/winds aloft and NOTAMs/TFRs. For IFR or flights not in the vicinity of an airport, 91.103 specifically requires weather reports and forecasts, fuel requirements and alternatives.",
    refs: ["14 CFR 91.103", "AIM 7-1-5"],
    quiz: [
      {
        q: "An outlook briefing is requested when departure is…",
        options: ["Within 1 hour", "6 or more hours away", "During flight", "For IFR only"],
        answer: 1,
        why: "Outlook briefings are for departures 6 or more hours in the future.",
      },
    ],
  },
];

// ---------------- retrieval ----------------

const STOP = new Set([
  "the",
  "a",
  "an",
  "is",
  "are",
  "what",
  "how",
  "why",
  "when",
  "do",
  "does",
  "i",
  "my",
  "me",
  "to",
  "of",
  "in",
  "on",
  "for",
  "and",
  "or",
  "about",
  "explain",
  "tell",
  "can",
  "you",
  "it",
  "be",
  "with",
  "this",
  "that",
  "please",
  "should",
  "would",
  "if",
  "at",
  "from",
  "by",
  "as",
  "we",
  "need",
  "know",
]);

function tokens(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9.\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP.has(w));
}

export interface Retrieved {
  entry: KnowledgeEntry;
  score: number;
}

export function searchKnowledge(query: string, limit = 3): Retrieved[] {
  const q = query.toLowerCase();
  const qt = tokens(query);
  if (!qt.length) return [];
  const out: Retrieved[] = [];
  for (const e of KNOWLEDGE) {
    let score = 0;
    for (const k of e.keywords) {
      const kl = k.toLowerCase();
      if (kl.includes(" ") || kl.includes("-") || kl.includes(".")) {
        if (q.includes(kl)) score += 6;
      } else if (qt.includes(kl)) score += 4;
    }
    for (const w of tokens(e.title)) if (qt.includes(w)) score += 2;
    const body = `${e.simple} ${e.advanced}`.toLowerCase();
    for (const w of qt) if (w.length > 3 && body.includes(w)) score += 0.4;
    if (score > 0) out.push({ entry: e, score });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, limit);
}

export function getEntry(id: string): KnowledgeEntry | undefined {
  return KNOWLEDGE.find((e) => e.id === id);
}

/** Scripted instructor answer from the knowledge base (markdown). */
export function localAnswer(
  query: string,
  level: "simple" | "advanced",
): { markdown: string; matched: KnowledgeEntry[] } {
  const hits = searchKnowledge(query, 3);
  const best = hits[0];
  if (!best || best.score < 2) {
    const sample = [
      "V-speeds",
      "VFR weather minimums",
      "Class C airspace",
      "IFR lost communications",
      "holding entries",
      "density altitude",
      "carburetor icing",
      "the 1-2-3 rule",
    ];
    return {
      matched: [],
      markdown: `I couldn't find that topic in my offline knowledge base. Try asking about a specific subject — for example **${sample.slice(0, 4).join("**, **")}** or **${sample.slice(4).join("**, **")}** — or pick one of the quick actions.\n\n_${DISCLAIMER}_`,
    };
  }
  const e = best.entry;
  const related = hits
    .slice(1)
    .filter((h) => h.score >= 2)
    .map((h) => h.entry.title);
  const body = level === "simple" ? e.simple : `${e.simple}\n\n${e.advanced}`;
  const md = `### ${e.title}\n\n${body}\n\n**References:** ${e.refs.join("; ")}${related.length ? `\n\n**Related:** ${related.join(" · ")}` : ""}\n\n_${DISCLAIMER}_`;
  return { markdown: md, matched: [e, ...hits.slice(1).map((h) => h.entry)] };
}

/** Quiz questions for a topic (falls back to a random mix). */
export function quizFor(topic: string, count = 3): { entry: KnowledgeEntry; item: QuizItem }[] {
  const hits = topic.trim() ? searchKnowledge(topic, 4).filter((h) => h.score >= 2) : [];
  const pool = (
    hits.length
      ? hits.map((h) => h.entry)
      : [...KNOWLEDGE].sort(() => Math.random() - 0.5).slice(0, count)
  ).flatMap((e) => e.quiz.map((item) => ({ entry: e, item })));
  return pool.slice(0, count);
}

// ---------------- instruments & practice scenarios ----------------

export const INSTRUMENTS: { id: string; label: string; entry: string; question: string }[] = [
  {
    id: "asi",
    label: "Airspeed indicator",
    entry: "pitot-static",
    question: "How does the airspeed indicator work, and what do its colored arcs mean?",
  },
  {
    id: "ai",
    label: "Attitude indicator",
    entry: "gyro-instruments",
    question: "How does the attitude indicator work and how can it fail?",
  },
  {
    id: "alt",
    label: "Altimeter",
    entry: "pitot-static",
    question: "How does the altimeter work, and what errors does it have?",
  },
  {
    id: "vsi",
    label: "Vertical speed indicator",
    entry: "pitot-static",
    question: "How does the vertical speed indicator work?",
  },
  {
    id: "hi",
    label: "Heading indicator",
    entry: "gyro-instruments",
    question: "How does the heading indicator work and why does it drift?",
  },
  {
    id: "tc",
    label: "Turn coordinator",
    entry: "gyro-instruments",
    question: "What does the turn coordinator show, and what is a standard-rate turn?",
  },
  {
    id: "compass",
    label: "Magnetic compass",
    entry: "compass",
    question: "What are the magnetic compass errors?",
  },
  {
    id: "vor",
    label: "VOR / CDI",
    entry: "vor",
    question: "How do I use a VOR and CDI to track a radial?",
  },
  {
    id: "ils",
    label: "ILS / glideslope",
    entry: "ils",
    question: "How does an ILS work — localizer, glideslope and decision altitude?",
  },
  {
    id: "xpdr",
    label: "Transponder",
    entry: "transponder",
    question: "What are the transponder codes and when is Mode C / ADS-B required?",
  },
  {
    id: "g1000",
    label: "G1000 PFD / MFD",
    entry: "glass-cockpit",
    question: "How do I read a G1000 PFD and what is reversionary mode?",
  },
  {
    id: "ap",
    label: "Autopilot",
    entry: "autopilot",
    question: "How do autopilot modes work and how do I avoid mode confusion?",
  },
];

export interface PracticeScenario {
  title: string;
  situation: string;
  questions: string[];
  teachingPoints: string[];
  topics: string[];
}

export const PRACTICE_SCENARIOS: PracticeScenario[] = [
  {
    title: "Rough engine over rough terrain",
    situation:
      "You're cruising at 5,500 ft in a Cessna 172 on a sunny 15 °C day with high humidity. The RPM slowly drops from 2,400 to 2,250 and the engine starts running slightly rough. The nearest airport is 14 NM behind you.",
    questions: [
      "What is the most likely cause?",
      "What do you do first, and what will you see?",
      "When would you declare an emergency, and on which frequency?",
    ],
    teachingPoints: [
      "Carburetor ice can form well above freezing in humid air (PHAK ch. 7).",
      "Full carb heat: expect a further RPM drop, then a rise as ice melts.",
      "Fly the airplane, turn toward the nearest suitable airport, and don't hesitate to declare (AIM 6-3-1).",
    ],
    topics: ["carb-ice", "engine-failure", "emergency-comms"],
  },
  {
    title: "Deteriorating weather on a VFR cross-country",
    situation:
      "Halfway through a VFR cross-country in Class E airspace, the ceiling ahead lowers to about 1,800 ft AGL and visibility drops to 4 SM in haze. You are at 2,500 ft AGL and the terrain ahead rises.",
    questions: [
      "Are you still legal VFR? Which cloud clearances apply?",
      "What are your options?",
      "Which hazardous attitude might push you to continue?",
    ],
    teachingPoints: [
      "Class E below 10,000 MSL: 3 SM, 500 below / 1,000 above / 2,000 horizontal (91.155).",
      "A 180° turn early is a decision, not a failure.",
      "Watch for get-there-itis (external pressures in PAVE) and the 'macho' attitude.",
    ],
    topics: ["vfr-minimums", "adm", "hazardous-attitudes"],
  },
  {
    title: "Lost communications in IMC",
    situation:
      "You're IFR at 6,000 ft, cleared direct to a VOR, then as filed. ATC told you to expect 8,000 ft ten minutes after departure. Your radios fail completely in solid IMC. The MEA on your airway is 7,000 ft.",
    questions: [
      "What route do you fly?",
      "What altitude do you fly now, and later?",
      "What do you squawk?",
    ],
    teachingPoints: [
      "Route: Assigned, Vectored, Expected, Filed (AVEF).",
      "Altitude: highest of assigned (6,000), MEA (7,000), expected (8,000 once the time arrives) — 91.185.",
      "Squawk 7600.",
    ],
    topics: ["lost-comms", "transponder"],
  },
  {
    title: "Vacuum failure in the clouds",
    situation:
      "Climbing through a cloud layer, you notice the attitude indicator slowly banking left while the turn coordinator shows wings level and the heading indicator is spinning. The vacuum gauge reads zero.",
    questions: [
      "Which instruments can you trust?",
      "How do you fly partial panel?",
      "What do you tell ATC?",
    ],
    teachingPoints: [
      "Vacuum-driven AI and HI are unreliable; cover them.",
      "Use the turn coordinator, airspeed, altimeter, VSI and compass (with its errors).",
      "Tell ATC: request no-gyro vectors and a lower-workload approach.",
    ],
    topics: ["gyro-instruments", "instrument-scan", "compass"],
  },
  {
    title: "High, hot and heavy",
    situation:
      "You plan to depart a 5,000 ft elevation airport with a 4,800 ft runway at 33 °C, four adults on board and full fuel in a Piper Archer. The altimeter setting is 29.82.",
    questions: [
      "What is the approximate density altitude?",
      "Is the takeoff feasible?",
      "What could you change?",
    ],
    teachingPoints: [
      "PA ≈ 5,000 + (29.92 − 29.82) × 1,000 = 5,100 ft; ISA ≈ 5 °C → DA ≈ 5,100 + 120 × 28 ≈ 8,500 ft.",
      "Use POH charts with margin; check weight & balance.",
      "Reduce weight, depart in the cool morning, or choose a longer runway.",
    ],
    topics: ["density-altitude", "weight-balance"],
  },
  {
    title: "Night currency and passengers",
    situation:
      "Your last landings were three full-stop landings in daylight 40 days ago and one touch-and-go at night 70 days ago. Friends want a night sightseeing flight tonight.",
    questions: [
      "Can you legally take them?",
      "What would you need to do first?",
      "What night illusions should you brief yourself on?",
    ],
    teachingPoints: [
      "Night passenger currency: 3 takeoffs and landings to a full stop at night within 90 days (61.57(b)).",
      "Do three full-stop night landings solo first.",
      "Black-hole approaches and featureless terrain make you feel too high.",
    ],
    topics: ["currency-6157", "night-illusions"],
  },
  {
    title: "Electrical failure on a night flight",
    situation:
      "At night, 25 NM from home, the ammeter shows a discharge and the low-voltage light comes on. Your panel is mostly electric except the vacuum attitude and heading indicators.",
    questions: [
      "What do you do with the electrical load?",
      "What will you lose first?",
      "How will you get into a towered airport if the radio dies?",
    ],
    teachingPoints: [
      "Follow the POH: shed non-essential load to extend battery time.",
      "Plan for loss of radios, transponder and lights.",
      "Know the light gun signals and squawk 7600 if you can (AIM 4-3-13).",
    ],
    topics: ["light-gun", "required-equipment", "transponder"],
  },
  {
    title: "Unexpected ice on approach",
    situation:
      "On an IFR approach at 4,000 ft in cloud, OAT −3 °C, you see rime ice building on the wing leading edges and the airspeed is decaying at your normal power setting.",
    questions: [
      "What are the immediate risks?",
      "What are your exit options?",
      "How should you fly the approach and landing?",
    ],
    teachingPoints: [
      "Ice raises stall speed and drag; don't use autopilot to mask handling changes.",
      "Request a different altitude or reverse course — tell ATC early.",
      "Carry extra speed, avoid full flaps if the POH recommends, and expect a longer landing.",
    ],
    topics: ["icing", "stalls"],
  },
];

/** Checkride preparation plan (markdown) for the scripted fallback. */
export function checkridePlan(trackLabel: string, isInstrument: boolean): string {
  const lines = [
    `### Checkride prep plan — ${trackLabel}`,
    "",
    "**1. Paperwork & eligibility**",
    `- Logbook endorsements: 61.39 (prep within the preceding 2 calendar months, and knowledge-test deficiencies reviewed) plus the certificate-specific endorsements.`,
    `- ${isInstrument ? "Instrument rating (61.65): 3 hours of instrument training in preparation within the preceding 2 calendar months." : "Private pilot (61.109): 3 hours of training in preparation within the preceding 2 calendar months."}`,
    "- Knowledge test report (valid 24 calendar months), medical/BasicMed, photo ID, IACRA application.",
    "- Aircraft: ARROW documents and AV1ATE inspections up to date; logbooks tabbed for the examiner.",
    "",
    "**2. Oral exam (ACS-based)**",
    "- Practise scenario questions — use the **Oral Exam** simulator in SkyReady.",
    `- Know: ${isInstrument ? "IFR currency, required equipment (GRABCARD), alternates (1-2-3, 600-2/800-2), lost comms (91.185), approach charts, holding, icing and weather products" : "airspace & VFR minimums, currency, ARROW/AV1ATE, TOMATO FLAMES/FLAPS, weather (METAR/TAF), performance & W&B, ADM (PAVE/IMSAFE), emergencies"}.`,
    "",
    "**3. Flight portion**",
    `- Fly every task to ACS tolerances (${isInstrument ? "±100 ft, ±10°, ±10 kt; ¾-scale deflection max on approaches" : "e.g. steep turns ±100 ft, ±10 kt, ±5° bank"}).`,
    "- Practise radio work in the **ATC Simulator** (checkride difficulty).",
    "- Run a full **mock checkride** in SkyReady, then fly one with a different CFI.",
    "",
    "**4. Final week**",
    "- Plan the cross-country the examiner assigns early; brief weather with a standard briefing.",
    "- Sleep, IMSAFE, and arrive with a calm, organised flight bag.",
    "",
    `_${DISCLAIMER}_`,
  ];
  return lines.join("\n");
}
