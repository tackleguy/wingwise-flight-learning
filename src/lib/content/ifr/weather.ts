import type { Module } from "../types";
import {
  caution,
  check,
  exercise,
  h,
  info,
  link,
  p,
  practice,
  q,
  table,
  tip,
  ul,
  warning,
} from "../builders";

export const weather: Module = {
  id: "weather",
  number: 3,
  title: "IFR Weather",
  summary:
    "Reading METARs and TAFs for IFR decisions, forecast charts and advisories, and the instrument pilot's big hazards: icing, turbulence, thunderstorms, low ceilings and visibility.",
  lessons: [
    {
      id: "ifr.weather.1",
      title: "METARs and TAFs for the Instrument Pilot",
      minutes: 11,
      objectives: [
        "Classify conditions as VFR, MVFR, IFR or LIFR",
        "Interpret ceilings, vertical visibility, RVR and remarks",
        "Use TAF change groups to judge conditions at ETA",
      ],
      blocks: [
        h("Flight categories"),
        p(
          "Instrument pilots read weather with different questions in mind: Will the ceiling and visibility be above approach minimums at my ETA? Do I need an alternate? Is there icing in the clouds? Flight categories give a quick overall picture.",
        ),
        table(
          ["Category", "Ceiling", "Visibility"],
          [
            ["VFR", "Greater than 3,000 ft AGL", "and greater than 5 SM"],
            ["MVFR (marginal VFR)", "1,000 to 3,000 ft", "and/or 3 to 5 SM"],
            ["IFR", "500 to below 1,000 ft", "and/or 1 to less than 3 SM"],
            ["LIFR (low IFR)", "Below 500 ft", "and/or less than 1 SM"],
          ],
        ),
        h("Ceilings, obscurations and RVR"),
        ul(
          "Ceiling: the lowest broken (BKN) or overcast (OVC) layer, or vertical visibility (VV) into an obscuration. VV002 means an indefinite ceiling of 200 ft.",
          "Visibility is prevailing visibility in statute miles; 1/2SM, M1/4SM (less than 1/4 SM) and so on.",
          "Runway visual range: R28L/2400FT means RVR for runway 28L is 2,400 ft. RVR is reported in feet and is what many approach minimums are based on.",
          "Weather codes: FG (fog, visibility < 5/8 SM), BR (mist, visibility 5/8 to 6 SM), FZRA (freezing rain), PL (ice pellets), TS (thunderstorm), +/− intensity.",
        ),
        h("Remarks worth reading"),
        table(
          ["Remark", "Meaning"],
          [
            ["AO2", "Automated station with a precipitation discriminator"],
            ["PK WND 28045/1715", "Peak wind 280° at 45 knots at 1715Z"],
            ["WSHFT 1650", "Wind shift at 1650Z (often a frontal passage)"],
            ["T00830072", "Precise temperature 8.3°C, dew point 7.2°C"],
            ["CIG 005V010", "Variable ceiling between 500 and 1,000 ft"],
            ["$", "Station needs maintenance — data may be unreliable"],
          ],
        ),
        exercise("metar-decode", "Decode IFR METARs including RVR, VV and remarks"),
        check({
          id: "ifr.weather.1.k1",
          kind: "weather",
          context: "METAR KAPA 121156Z 00000KT 1/2SM FG VV002 08/08 A3012 RMK AO2",
          prompt: "What is the ceiling and flight category?",
          choices: ["No ceiling; IFR", "500 ft; LIFR", "200 ft; IFR", "200 ft; LIFR"],
          answer: 3,
          explanation:
            "VV002 is an indefinite ceiling of 200 ft, and with 1/2 SM visibility the category is LIFR (ceiling below 500 ft and/or visibility less than 1 SM). Treating vertical visibility as 'no ceiling' is a common mistake.",
          subject: "Weather Services",
          reference: "AC 00-45",
        }),
        h("TAFs and timing"),
        p(
          "The TAF is your main tool for predicting conditions at your ETA and for alternate planning. Read each period and ask: what is the worst condition forecast within an hour of my arrival? TEMPO and PROB groups describe conditions that may occur — conservative planners treat them as likely, especially for approach and alternate decisions.",
        ),
        exercise("taf-decode", "Find the IFR periods in a TAF"),
        tip(
          "Look at the trend",
          "Compare the latest METARs to the TAF. If actual conditions are already worse than forecast, assume the forecast will continue to be optimistic.",
        ),
      ],
    },
    {
      id: "ifr.weather.2",
      title: "Forecast Charts and Advisories",
      minutes: 11,
      objectives: [
        "Use prog charts, G-AIRMETs, SIGMETs and convective outlooks in planning",
        "Decode a winds and temperatures aloft forecast",
        "Know when convective SIGMETs and center weather advisories are issued",
      ],
      blocks: [
        h("The big picture first"),
        p(
          "A good IFR briefing starts broad and narrows down: surface analysis and prognostic charts show fronts and pressure systems; the convective outlook shows thunderstorm risk; G-AIRMETs and SIGMETs show where hazards are forecast; then METARs, TAFs and PIREPs give the detail for your route.",
        ),
        table(
          ["Product", "What it shows", "Notes"],
          [
            [
              "Surface analysis",
              "Current fronts, pressure systems and station plots",
              "Issued every 3 hours",
            ],
            [
              "Low-level significant weather prog",
              "Forecast IFR and MVFR areas, moderate or greater turbulence, freezing levels (surface to FL240)",
              "12- and 24-hour forecasts",
            ],
            [
              "G-AIRMET",
              "Graphical AIRMETs: IFR, mountain obscuration, turbulence, strong surface winds, low-level wind shear, icing and freezing level",
              "Snapshots at 3-hour intervals out to 12 hours",
            ],
            [
              "SIGMET",
              "Severe icing, severe or extreme turbulence, dust/sandstorms, volcanic ash",
              "Applies to all aircraft",
            ],
            [
              "Convective SIGMET",
              "Severe or embedded thunderstorms, lines, tornadoes, large hail",
              "Issued hourly at 55 minutes past the hour; valid 2 hours",
            ],
            [
              "Convective outlook (SPC)",
              "Risk of thunderstorms and severe thunderstorms",
              "Day 1, 2, 3 and 4–8; categories from general thunder to high risk",
            ],
            [
              "Center Weather Advisory (CWA)",
              "Short-term advisory from an ARTCC weather unit for conditions meeting or approaching advisory criteria",
              "Valid up to 2 hours",
            ],
          ],
        ),
        h("Winds and temperatures aloft (FB)"),
        p(
          "The FB forecast gives wind direction (true, in tens of degrees), speed in knots and temperature in °C for standard levels. No wind is forecast for levels within 1,500 ft of station elevation, and no temperature for the 3,000-ft level or for levels within 2,500 ft of station elevation. Above 24,000 ft, temperatures are always negative and the minus sign is omitted.",
        ),
        table(
          ["Code", "Decoded"],
          [
            ["2715", "270° at 15 knots (no temperature — e.g., the 3,000-ft level)"],
            ["2715+05", "270° at 15 knots, +5°C"],
            ["9900", "Light and variable (less than 5 knots)"],
            [
              "731960",
              "Direction code above 50 means speed ≥ 100 knots: 73 − 50 = 23 → 230°; 19 + 100 = 119 knots; −60°C",
            ],
          ],
        ),
        check({
          id: "ifr.weather.2.k1",
          kind: "calc",
          prompt: "Decode the winds and temperatures aloft group 831533 forecast for FL340.",
          choices: [
            "830° at 15 knots, +33°C",
            "083° at 115 knots, +33°C",
            "330° at 115 knots, −33°C",
            "330° at 15 knots, −33°C",
          ],
          answer: 2,
          explanation:
            "A direction code above 36 means 50 was added to the direction and 100 must be added to the speed: 83 − 50 = 33 → 330°, 15 + 100 = 115 knots. Above 24,000 ft temperatures are always negative, so 33 means −33°C. Reading the speed as 15 knots misses the encoding rule.",
          subject: "Weather Services",
          reference: "AC 00-45",
        }),
        caution(
          "Datalink and NEXRAD latency",
          "ADS-B/FIS-B NEXRAD mosaics can be 5–15 minutes old or more. Use them for strategic avoidance, never to pick a path between cells.",
        ),
        info(
          "PIREPs",
          "Pilot reports are the only direct observations of cloud tops, icing and turbulence aloft. Ask for them and give them — especially for icing and tops on an IFR flight.",
        ),
        practice(
          "/weather",
          "Weather center",
          "Build a full IFR briefing from charts, advisories, METARs and TAFs.",
        ),
      ],
    },
    {
      id: "ifr.weather.3",
      title: "Icing, Turbulence, Thunderstorms and Weather Decisions",
      minutes: 12,
      objectives: [
        "Recognize icing conditions and the types of structural ice",
        "Classify turbulence intensity and know where to expect it",
        "Plan thunderstorm avoidance and make sound IFR go/no-go decisions",
      ],
      blocks: [
        h("Structural icing"),
        p(
          "Ice needs visible moisture and an airframe at or below 0°C. Supercooled water droplets — liquid below freezing — freeze on impact with the airplane. Most structural icing occurs between 0°C and about −20°C, and the greatest accumulation rates are usually found in the warmer part of that range where droplets are larger.",
        ),
        table(
          ["Type", "Forms from", "Characteristics"],
          [
            [
              "Clear (glaze)",
              "Large supercooled droplets, freezing rain, cumuliform clouds",
              "Hard, heavy, transparent; flows back before freezing; most hazardous and hard to remove",
            ],
            [
              "Rime",
              "Small droplets in stratiform clouds, colder temperatures",
              "Milky, rough, brittle; freezes instantly on leading edges",
            ],
            ["Mixed", "Combination", "Rough and hard"],
          ],
        ),
        warning(
          "Freezing rain and ice pellets",
          "Freezing rain means a warm layer (above freezing) aloft with a subfreezing layer below — rain falls from the warm layer and freezes on contact. Ice pellets (PL) at the surface indicate freezing rain at a higher altitude. Climbing into the warm layer may help; staying in freezing rain is extremely dangerous.",
        ),
        p(
          "Flight into known or forecast icing is permitted only in an aircraft certificated for it (FIKI) — check the POH limitations section. Even in a FIKI airplane, the strategy is to exit icing promptly: change altitude to warmer air or above the clouds, or turn around, and tell ATC what you need.",
        ),
        check({
          id: "ifr.weather.3.k1",
          kind: "mc",
          prompt: "Ice pellets reported at the surface usually indicate:",
          choices: [
            "Freezing rain at a higher altitude",
            "Thunderstorms within 10 NM",
            "A temperature inversion with fog",
            "Clear-air turbulence",
          ],
          answer: 0,
          explanation:
            "Ice pellets form when rain from a warm layer aloft refreezes falling through colder air below. Above that colder layer, there is freezing rain. They do not by themselves indicate thunderstorms.",
          subject: "Weather",
          reference: "AC 00-6B",
        }),
        h("Turbulence"),
        table(
          ["Intensity", "Aircraft reaction"],
          [
            ["Light", "Slight, erratic changes in altitude and/or attitude"],
            [
              "Moderate",
              "Changes in altitude/attitude with the aircraft remaining in positive control; variations in indicated airspeed",
            ],
            ["Severe", "Large, abrupt changes; aircraft may be momentarily out of control"],
            [
              "Extreme",
              "Aircraft violently tossed about and practically impossible to control; structural damage possible",
            ],
          ],
        ),
        ul(
          "Mechanical turbulence: wind over obstructions and rough terrain.",
          "Mountain wave: strong wind perpendicular to a ridge with stable air; look for lenticular and rotor clouds. Severe turbulence and strong downdrafts possible on the lee side.",
          "Clear air turbulence (CAT): commonly near the jet stream, especially in curved jet streams around deep troughs.",
          "Convective turbulence: in and around thunderstorms, often well outside the visible cloud.",
        ),
        h("Thunderstorms"),
        p(
          "An instrument rating does not make thunderstorms penetrable. Avoid severe or intense radar echoes by at least 20 NM, never fly under an anvil, and do not trust an apparent hole between cells. Embedded thunderstorms — hidden within stratiform layers — are particularly dangerous because you cannot see them without onboard weather radar or recent datalink information. If you inadvertently enter a thunderstorm, the AIM advice is to maintain a constant attitude, let altitude vary, keep your eyes on the instruments, turn up the cockpit lights and do not turn back once inside.",
        ),
        check({
          id: "ifr.weather.3.k2",
          kind: "mc",
          prompt: "If you inadvertently penetrate a thunderstorm, you should:",
          choices: [
            "Maintain altitude precisely using the autopilot altitude hold",
            "Maintain a constant attitude and let altitude and airspeed fluctuate",
            "Make an immediate 180° turn",
            "Climb at maximum power to get above it",
          ],
          answer: 1,
          explanation:
            "Chasing altitude in severe up- and downdrafts can overstress the airframe or stall the wing. Hold attitude, ride it out, and keep going straight — turning back keeps you in the storm longer.",
          subject: "Weather",
          reference: "AIM 7-1",
        }),
        h("Making the IFR weather decision"),
        ul(
          "Is the destination forecast above the approach minimums (with margin) at ETA? Above your personal minimums?",
          "Is an alternate required by 91.169, and does a suitable alternate meet alternate minimums?",
          "Where are the freezing levels and cloud tops? Is there an ice-free altitude above the MEA?",
          "Is there convective activity along the route, and is it embedded?",
          "What is your escape plan if conditions are worse than forecast?",
        ),
        tip(
          "Personal IFR minimums",
          "Newly rated instrument pilots commonly add a buffer to published minimums — for example, not planning approaches lower than 500 ft and 1 1/2 SM until gaining experience. Write your minimums down before you look at the weather.",
        ),
        practice(
          "/simulator?scenario=emg-weather",
          "Weather emergency",
          "Handle unforecast icing and deteriorating weather en route.",
        ),
      ],
    },
  ],
  flashcards: [
    {
      id: "ifr.weather.fc1",
      front: "IFR flight category",
      back: "Ceiling 500 to below 1,000 ft and/or visibility 1 to less than 3 SM.",
    },
    {
      id: "ifr.weather.fc2",
      front: "VV003",
      back: "Indefinite ceiling (vertical visibility) of 300 ft.",
    },
    {
      id: "ifr.weather.fc3",
      front: "Requirements for structural icing",
      back: "Visible moisture and an airframe temperature at or below 0°C.",
    },
    {
      id: "ifr.weather.fc4",
      front: "Ice pellets at the surface",
      back: "Freezing rain exists at a higher altitude.",
    },
    {
      id: "ifr.weather.fc5",
      front: "Convective SIGMET issuance",
      back: "Hourly at 55 minutes past the hour; valid for 2 hours.",
    },
    {
      id: "ifr.weather.fc6",
      front: "Winds aloft code 9900",
      back: "Light and variable (less than 5 knots).",
    },
  ],
  quiz: [
    q({
      id: "ifr.weather.q1",
      kind: "weather",
      context: "METAR KBOS 141454Z 07012KT 2SM -RA BR OVC008 06/05 A2981",
      prompt: "What flight category does this METAR represent?",
      choices: ["MVFR", "VFR", "LIFR", "IFR"],
      answer: 3,
      explanation:
        "Ceiling 800 ft (500 to below 1,000) and visibility 2 SM (1 to less than 3) are both IFR. It is not LIFR because the ceiling is not below 500 ft and visibility is not below 1 SM.",
      subject: "Weather Services",
      reference: "AC 00-45",
    }),
    q({
      id: "ifr.weather.q2",
      kind: "mc",
      prompt: "Which type of structural ice is generally the most hazardous?",
      choices: ["Rime ice", "Frost", "Clear ice", "Mixed ice"],
      answer: 2,
      explanation:
        "Clear ice forms from large supercooled droplets that flow back before freezing, creating heavy, hard, smooth ice that distorts the airfoil and is difficult to remove. Rime is brittle and lighter.",
      subject: "Weather",
      reference: "AC 00-6B",
    }),
    q({
      id: "ifr.weather.q3",
      kind: "calc",
      prompt: "Decode the winds and temperatures aloft group 750545 forecast for FL390.",
      choices: [
        "250° at 105 knots, −45°C",
        "750° at 5 knots, +45°C",
        "250° at 5 knots, −45°C",
        "075° at 05 knots, −45°C",
      ],
      answer: 0,
      explanation:
        "A direction code greater than 36 means 50 was added to the direction and 100 must be added to the speed: 75 − 50 = 25 → 250°; 05 + 100 = 105 knots. Above 24,000 ft temperatures are negative: −45°C.",
      subject: "Weather Services",
      reference: "AC 00-45",
    }),
    q({
      id: "ifr.weather.q4",
      kind: "mc",
      prompt:
        "In a G-AIRMET, which hazard category covers IFR conditions and mountain obscuration?",
      choices: ["Tango", "Zulu", "Sierra", "Convective"],
      answer: 2,
      explanation:
        "Sierra covers IFR and mountain obscuration. Tango is turbulence, strong surface winds and low-level wind shear; Zulu is icing and freezing level.",
      subject: "Weather Services",
      reference: "AC 00-45",
    }),
    q({
      id: "ifr.weather.q5",
      kind: "mc",
      prompt:
        "Turbulence that causes large, abrupt changes in altitude and attitude, with the aircraft possibly momentarily out of control, is classified as:",
      choices: ["Light", "Moderate", "Severe", "Extreme"],
      answer: 2,
      explanation:
        "That is the definition of severe turbulence. Moderate turbulence causes changes while the aircraft remains in positive control; extreme turbulence makes the aircraft practically impossible to control.",
      subject: "Weather",
      reference: "AIM 7-1 (Turbulence reporting criteria)",
    }),
    q({
      id: "ifr.weather.q6",
      kind: "weather",
      context:
        "TAF KDEN 141720Z 1418/1524 33012KT P6SM BKN040 FM150200 35015G25KT 3SM -SN BKN012 OVC025 TEMPO 1504/1508 1/2SM SN VV005",
      prompt: "You plan to arrive at 0600Z on the 15th. What should you plan for?",
      choices: [
        "Ceiling 1,200 ft and 3 SM in light snow, temporarily 1/2 SM in snow with a 500-ft indefinite ceiling",
        "VFR with a ceiling of 4,000 ft",
        "Clearing skies and light winds",
        "Ceiling 2,500 ft and P6SM",
      ],
      answer: 0,
      explanation:
        "From 0200Z on the 15th, prevailing conditions are BKN012 (ceiling 1,200) and 3 SM -SN, with TEMPO 1/2 SM and VV005 from 0400Z to 0800Z — which includes your ETA. Plan for the TEMPO conditions, not just the prevailing ones.",
      subject: "Weather Services",
      reference: "AC 00-45",
    }),
    q({
      id: "ifr.weather.q7",
      kind: "tf",
      prompt:
        "True or false: an instrument-rated pilot in an IFR-equipped airplane may safely penetrate an embedded thunderstorm if ATC provides vectors.",
      choices: ["True", "False"],
      answer: 1,
      explanation:
        "False. No pilot or airplane should intentionally penetrate a thunderstorm. ATC radar may not depict all cells or turbulence; vectors help you avoid weather, they do not make it safe to fly through.",
      subject: "Weather",
      reference: "AIM 7-1",
    }),
  ],
  practice: [
    link("/weather", "Weather center"),
    link("/simulator?scenario=emg-weather", "Weather emergencies"),
  ],
};
