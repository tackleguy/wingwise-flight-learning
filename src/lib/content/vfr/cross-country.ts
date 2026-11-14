import type { Module } from "../types";
import { caution, check, exercise, h, info, link, ol, p, practice, q, table, tip, ul } from "../builders";

export const crossCountry: Module = {
  id: "cross-country",
  number: 15,
  title: "Cross-Country Planning",
  summary:
    "Planning a VFR cross-country from route to flight plan, plus weight and balance and performance calculations that tell you whether the flight is possible.",
  lessons: [
    {
      id: "vfr.cross-country.1",
      title: "Planning the Route and Filing a VFR Flight Plan",
      minutes: 11,
      objectives: [
        "Follow a systematic cross-country planning process",
        "Gather weather, NOTAMs and TFR information required by 91.103",
        "File, activate and close a VFR flight plan",
      ],
      blocks: [
        h("A repeatable planning process"),
        p(
          "Good cross-country flights are planned the same way every time. A consistent process keeps you from forgetting the item that matters today — a TFR, a closed runway, or a headwind that eats your fuel reserve.",
        ),
        ol(
          "Draw the route on a current sectional and review terrain, obstacles, airspace and special use airspace along it.",
          "Select checkpoints and choose a cruising altitude that complies with 91.159 and clears terrain and obstacles with margin.",
          "Get a weather briefing: current conditions, forecasts, winds aloft, AIRMETs/SIGMETs and PIREPs.",
          "Check NOTAMs and TFRs for the departure, destination, alternates and route.",
          "Review the Chart Supplement for each airport: runways, pattern altitude, frequencies, fuel availability and remarks.",
          "Complete the navigation log: headings, groundspeeds, times and fuel for each leg.",
          "Compute weight and balance and takeoff/landing performance.",
          "Plan alternates and decide your personal go/no-go criteria.",
          "File a VFR flight plan and consider requesting flight following.",
        ),
        exercise("xc-calc", "Plan a two-leg cross-country"),
        h("VFR flight plans"),
        p(
          "A VFR flight plan is not required for most domestic VFR flights, but it is strongly recommended because it is your search-and-rescue insurance. File it with Flight Service (by phone, online or by radio). Filing alone is not enough: you must activate it after departure, typically by contacting Flight Service or through the online system. When you land, close it. If you do not close or extend the plan within 30 minutes after your ETA, Flight Service begins search-and-rescue procedures.",
        ),
        caution(
          "Close your flight plan",
          "Tower controllers do not close VFR flight plans automatically. Forgetting to close a plan sends people looking for you and can tie up search resources.",
        ),
        h("Flight following"),
        p(
          "VFR radar traffic advisories ('flight following') let ATC call out traffic and help you with airspace and emergencies. Request it on the departure or approach frequency. Service is on a workload-permitting basis and does not relieve you of see-and-avoid responsibility or of obtaining clearances for Class B.",
        ),
        check({
          id: "vfr.cross-country.1.k1",
          kind: "mc",
          prompt: "If a VFR flight plan is not closed or extended, when does search and rescue normally begin?",
          choices: [
            "15 minutes after the ETA",
            "30 minutes after the ETA",
            "1 hour after the ETA",
            "When the aircraft runs out of fuel",
          ],
          answer: 1,
          explanation:
            "Flight Service begins search procedures if a VFR flight plan is not closed within 30 minutes after the ETA. This is why you must close every plan you open.",
          subject: "Regulations",
          reference: "AIM 5-1-4",
        }),
        tip(
          "Personal minimums",
          "Set personal limits for ceiling, visibility, wind and crosswind before you look at the forecast, and write them down. It is much easier to stick to a decision made on the ground with a clear head.",
        ),
        practice("/planner", "Flight planner", "Plan a complete cross-country: route, weather, fuel and flight plan."),
      ],
    },
    {
      id: "vfr.cross-country.2",
      title: "Weight, Balance and Performance",
      minutes: 12,
      objectives: [
        "Define weight-and-balance terms",
        "Compute total weight and center of gravity",
        "Use performance charts to determine takeoff and landing distances",
      ],
      blocks: [
        h("Why weight and balance matter"),
        p(
          "Overweight airplanes need longer runways, climb poorly, stall at higher speeds and can be structurally overstressed. A CG outside the limits makes the airplane harder or impossible to control: too far forward and you may not be able to flare; too far aft and stall or spin recovery may be impossible. 14 CFR 91.9 requires you to operate within the limitations in the AFM/POH.",
        ),
        table(
          ["Term", "Meaning"],
          [
            ["Datum", "An imaginary vertical reference plane from which all horizontal distances are measured"],
            ["Arm", "Horizontal distance from the datum to an item's CG, in inches (positive aft)"],
            ["Moment", "Weight × arm (often divided by 100 or 1,000 in POH tables)"],
            ["Center of gravity", "Total moment ÷ total weight"],
            ["Basic empty weight", "Airframe, engine, fixed equipment, unusable fuel and full oil (on most modern airplanes)"],
            ["Useful load", "Maximum weight minus basic empty weight: pilot, passengers, baggage and usable fuel"],
          ],
        ),
        info(
          "Standard weights",
          "Avgas weighs 6 lb per gallon; oil weighs 7.5 lb per gallon; water weighs about 8.35 lb per gallon.",
        ),
        h("Computing CG"),
        table(
          ["Item", "Weight (lb)", "Arm (in)", "Moment (lb-in)"],
          [
            ["Basic empty weight", "1,500", "38.0", "57,000"],
            ["Pilot and front passenger", "340", "37.0", "12,580"],
            ["Fuel (40 gal × 6)", "240", "48.0", "11,520"],
            ["Rear passenger", "150", "73.0", "10,950"],
            ["Total", "2,230", "41.3", "92,050"],
          ],
        ),
        p(
          "Add the weights, add the moments, and divide total moment by total weight: 92,050 ÷ 2,230 ≈ 41.3 inches aft of the datum. Then check that both the weight and the CG fall within the POH envelope — and recheck at landing weight, since fuel burn moves the CG.",
        ),
        exercise("weight-balance", "Load the airplane and check the CG envelope"),
        check({
          id: "vfr.cross-country.2.k1",
          kind: "calc",
          prompt:
            "An airplane weighs 2,400 lb with the CG at 45.0 in. A 60-lb bag is moved from a station at 50 in to one at 100 in. What is the new CG?",
          choices: ["43.75 in", "45.25 in", "46.25 in", "47.50 in"],
          answer: 2,
          explanation:
            "Change in CG = (weight moved × distance moved) ÷ total weight = (60 × 50) ÷ 2,400 = 1.25 in aft, so the new CG is 46.25 in. Total weight does not change when weight is shifted.",
          subject: "Weight & Balance",
          reference: "PHAK Ch. 10",
        }),
        h("Performance charts"),
        p(
          "POH performance charts give takeoff ground roll and distance over a 50-ft obstacle, climb rate, cruise performance and landing distance for a given pressure altitude, temperature, weight and wind. Read the notes carefully: they often tell you to add a percentage for a grass runway or a tailwind, or to reduce distance for a headwind.",
        ),
        ul(
          "Higher density altitude → longer takeoff and landing distances and lower climb rate.",
          "Headwind → shorter takeoff and landing distances; tailwind → significantly longer.",
          "Uphill runway → longer takeoff; wet or grass surfaces → longer distances.",
          "Heavier weight → longer distances, higher stall speed.",
        ),
        caution(
          "Charts assume a new airplane and a test pilot",
          "Published numbers come from a new airplane flown precisely. Add a generous margin — many pilots add 50% to the POH distance over a 50-ft obstacle.",
        ),
      ],
    },
  ],
  flashcards: [
    { id: "vfr.cross-country.fc1", front: "Avgas weight per gallon", back: "6 lb." },
    { id: "vfr.cross-country.fc2", front: "Center of gravity formula", back: "CG = total moment ÷ total weight." },
    { id: "vfr.cross-country.fc3", front: "Moment", back: "Weight × arm." },
    { id: "vfr.cross-country.fc4", front: "When search and rescue begins for a VFR flight plan", back: "If not closed within 30 minutes after the ETA." },
    { id: "vfr.cross-country.fc5", front: "Weight-shift formula", back: "ΔCG = (weight moved × distance moved) ÷ total weight." },
    { id: "vfr.cross-country.fc6", front: "Useful load", back: "Maximum weight minus basic empty weight." },
  ],
  quiz: [
    q({
      id: "vfr.cross-country.q1",
      kind: "calc",
      context:
        "Empty weight 1,450 lb, moment 53,650. Pilot 180 lb at 37 in. Passenger 160 lb at 37 in. Fuel 30 gal at 48 in. Baggage 50 lb at 95 in.",
      prompt: "What is the total weight and approximate CG?",
      choices: ["2,020 lb, 39.4 in", "2,020 lb, 41.0 in", "1,840 lb, 39.4 in", "2,020 lb, 43.3 in"],
      answer: 0,
      explanation:
        "Weights: 1,450 + 180 + 160 + 180 (30 gal × 6) + 50 = 2,020 lb. Moments: 53,650 + 6,660 + 5,920 + 8,640 + 4,750 = 79,620. CG = 79,620 ÷ 2,020 ≈ 39.4 in. Forgetting to include the fuel (180 lb) gives the tempting but wrong 1,840 lb total.",
      subject: "Weight & Balance",
      reference: "PHAK Ch. 10",
    }),
    q({
      id: "vfr.cross-country.q2",
      kind: "mc",
      prompt: "Which is included in useful load?",
      choices: ["Unusable fuel", "Full engine oil (on most modern airplanes)", "Usable fuel", "Fixed avionics"],
      answer: 2,
      explanation:
        "Useful load includes pilot, passengers, baggage and usable fuel. Unusable fuel, full oil (on most modern airplanes) and fixed equipment are part of basic empty weight.",
      subject: "Weight & Balance",
      reference: "PHAK Ch. 10",
    }),
    q({
      id: "vfr.cross-country.q3",
      kind: "mc",
      prompt: "What is the effect of operating with the CG aft of the aft limit?",
      choices: [
        "Increased stability and heavy elevator forces",
        "Higher stall speed",
        "Reduced stability and possibly unrecoverable stalls or spins",
        "No effect if the weight is below maximum",
      ],
      answer: 2,
      explanation:
        "An aft CG reduces longitudinal stability and elevator authority to lower the nose, so stall and spin recovery can become impossible. Increased stability and higher stall speed are effects of a FORWARD CG.",
      subject: "Weight & Balance",
      reference: "PHAK Ch. 10",
    }),
    q({
      id: "vfr.cross-country.q4",
      kind: "mc",
      prompt: "A VFR flight plan filed with Flight Service must be:",
      choices: [
        "Activated automatically when the tower clears you for takeoff",
        "Activated by the pilot, and closed upon arrival",
        "Closed by the destination tower automatically",
        "Activated only if requested by ATC",
      ],
      answer: 1,
      explanation:
        "The pilot activates the VFR flight plan (usually with Flight Service) and must close it on arrival. Towers do not automatically activate or close VFR flight plans.",
      subject: "Regulations",
      reference: "AIM 5-1-4",
    }),
    q({
      id: "vfr.cross-country.q5",
      kind: "scenario",
      context:
        "The POH shows a takeoff distance over a 50-ft obstacle of 1,650 ft at today's conditions. The runway is 2,000 ft of dry grass, and the POH note says to increase distances by 15% for dry grass.",
      prompt: "What is the adjusted distance, and what is the wise decision?",
      choices: [
        "1,650 ft — go, there is 350 ft of margin",
        "1,898 ft — legal, but the margin is very thin; consider reducing weight or waiting for cooler conditions",
        "2,475 ft — it is impossible",
        "1,402 ft — plenty of margin",
      ],
      answer: 1,
      explanation:
        "1,650 × 1.15 ≈ 1,898 ft, leaving only about 100 ft. With a new-airplane chart and real-world technique, that is not an adequate safety margin. Ignoring the grass correction is the tempting error.",
      subject: "Performance",
      reference: "PHAK Ch. 11",
    }),
    q({
      id: "vfr.cross-country.q6",
      kind: "calc",
      prompt: "How much does 36 gallons of avgas weigh?",
      choices: ["180 lb", "216 lb", "252 lb", "270 lb"],
      answer: 1,
      explanation: "36 gal × 6 lb/gal = 216 lb. Using 7.5 lb/gal (the weight of oil) would give 270 lb.",
      subject: "Weight & Balance",
      reference: "PHAK Ch. 10",
    }),
  ],
  practice: [link("/planner", "Flight planner"), link("/simulator?scenario=vfr-xc", "Fly a cross-country"), link("/weather", "Weather briefing")],
};
