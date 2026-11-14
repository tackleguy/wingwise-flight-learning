import type { Module } from "../types";
import { caution, check, exercise, h, info, link, ol, p, practice, q, table, tip, ul } from "../builders";

export const planning: Module = {
  id: "planning",
  number: 6,
  title: "IFR Flight Planning",
  summary:
    "Choosing a route and altitude, checking NOTAMs, selecting departure and approach procedures, and meeting the alternate (91.169) and fuel (91.167) requirements.",
  lessons: [
    {
      id: "ifr.planning.1",
      title: "Route, Altitude, NOTAMs and Approach Selection",
      minutes: 11,
      objectives: [
        "Select an IFR route using preferred routes, airways, RNAV and procedures",
        "Choose a cruising altitude considering MEAs, winds, icing and terrain",
        "Review NOTAMs and select the expected approach",
      ],
      blocks: [
        h("Building the route"),
        p(
          "An IFR route has to work for you and for ATC. Start with what ATC is likely to give you: published preferred IFR routes (in the Chart Supplement), recent routes cleared between the same airports (many planning apps show them), SIDs and STARs serving your airports, and the airway or RNAV structure between them. A route that matches ATC's flows saves a reroute on the runway.",
        ),
        ul(
          "Departure: Is there an ODP or SID? Can you meet the required climb gradient? Is a takeoff alternate needed for low weather at departure?",
          "En route: Victor airways or T-routes, or direct RNAV routing if your equipment allows it. Note MEAs, MOCAs, MCAs, changeover points and OROCAs if off airways.",
          "Arrival: Is there a STAR? Which IAFs connect to the likely approach?",
        ),
        h("Choosing an altitude"),
        table(
          ["Factor", "What to check"],
          [
            ["Minimum altitudes", "MEA on airways, OROCA or 91.177 off-airway; MCAs at fixes"],
            ["Direction of flight", "91.179 hemispheric rule in uncontrolled airspace (odd thousands eastbound, even westbound); ATC assigns in controlled airspace"],
            ["Winds", "Winds aloft forecast — a lower altitude may avoid a strong headwind"],
            ["Icing", "Freezing level and cloud tops: is there an ice-free altitude above the MEA?"],
            ["Oxygen and performance", "91.211 oxygen rules and your airplane's realistic climb capability"],
          ],
        ),
        h("NOTAMs"),
        p(
          "NOTAMs tell you what has changed: closed runways, inoperative navaids or lighting, approach procedure amendments, obstacles and temporary flight restrictions. FDC NOTAMs carry regulatory information such as amendments to instrument approach procedures and TFRs. Read every NOTAM for your departure, destination and alternate airports and for navaids and airspace along the route.",
        ),
        caution(
          "Navaid outages change minimums",
          "A NOTAM such as 'ILS RWY 27 GS U/S' converts the approach to a localizer approach with higher minimums, and an inoperative approach light system raises visibility minimums. An outage can also remove the only approach that makes an airport usable as an alternate.",
        ),
        h("Selecting the approach"),
        ol(
          "Determine the likely runway from the forecast wind and the airport's usual flow.",
          "List the approaches to that runway and their minimums; pick the lowest you are equipped and current for.",
          "Check NOTAMs and equipment requirements (e.g., 'DME required', 'RNP', 'WAAS').",
          "Compare the forecast at ETA with those minimums plus your personal margin.",
          "Identify a backup approach and the missed approach plan.",
        ),
        check({
          id: "ifr.planning.1.k1",
          kind: "scenario",
          context:
            "Your destination's only approaches are an ILS RWY 9 and an RNAV (GPS) RWY 27. A NOTAM shows the ILS RWY 9 localizer is out of service. The wind is forecast from 090° at 15 knots, and you have a WAAS GPS.",
          prompt: "What is the best planning decision?",
          choices: [
            "Plan the ILS anyway — NOTAMs are often outdated",
            "Plan the RNAV RWY 27 with a circle-to-land or a tailwind landing, and verify the minimums and tailwind component are acceptable",
            "Plan a visual approach regardless of the weather",
            "File without an approach plan and ask ATC on arrival",
          ],
          answer: 1,
          explanation:
            "With the localizer out, the ILS is unusable. The RNAV 27 is available, but with an easterly wind you must plan either a circle-to-land to runway 9 (with higher circling minimums) or a straight-in with a 15-knot tailwind — both need checking against the forecast and your limits.",
          subject: "IFR Procedures",
          reference: "AIM 5-1-3",
        }),
        tip(
          "File what ATC expects",
          "Filing a route that ATC will accept without changes reduces workload during the busiest part of the flight — the clearance copy and departure.",
        ),
        practice("/planner", "IFR planner", "Plan an IFR route with SID, airways, STAR and the expected approach."),
      ],
    },
    {
      id: "ifr.planning.2",
      title: "Alternates and IFR Fuel Requirements",
      minutes: 11,
      objectives: [
        "Determine when an alternate is required using the 1-2-3 rule",
        "Apply standard and nonstandard alternate minimums",
        "Compute IFR fuel requirements under 91.167",
      ],
      blocks: [
        h("Is an alternate required? (91.169)"),
        p(
          "An IFR flight plan must include an alternate airport unless the destination has a standard instrument approach procedure and, for at least 1 hour before to 1 hour after the estimated time of arrival, the weather reports or forecasts indicate a ceiling of at least 2,000 ft above the airport elevation and visibility of at least 3 SM. This is the '1-2-3 rule': 1 hour either side of ETA, 2,000-ft ceiling, 3 SM visibility. (Helicopters have different values; see 91.169(b)(2).)",
        ),
        check({
          id: "ifr.planning.2.k1",
          kind: "weather",
          context:
            "ETA 1500Z. Destination TAF: FM1200 BKN025 P6SM; FM1530 OVC015 4SM -RA. The destination has an RNAV (GPS) approach.",
          prompt: "Is an alternate required?",
          choices: [
            "No — the ceiling is 2,500 ft at ETA",
            "Yes — within 1 hour after ETA the forecast ceiling drops to 1,500 ft",
            "No — the visibility stays above 3 SM",
            "Yes — because the approach is GPS-based",
          ],
          answer: 1,
          explanation:
            "The 1-2-3 rule covers 1400Z to 1600Z. From 1530Z the ceiling is forecast at 1,500 ft, below 2,000 ft, so an alternate is required. Looking only at the forecast for the ETA itself is the common mistake.",
          subject: "Regulations",
          reference: "14 CFR 91.169",
        }),
        h("Alternate airport weather minimums (91.169(c))"),
        table(
          ["Alternate has…", "Forecast at ETA at the alternate must be at least"],
          [
            ["A precision approach (no nonstandard minimums published)", "Ceiling 600 ft and visibility 2 SM"],
            ["A nonprecision approach (no nonstandard minimums published)", "Ceiling 800 ft and visibility 2 SM"],
            ["Nonstandard alternate minimums (▲A symbol)", "The published alternate minimums for that procedure"],
            ["No instrument approach procedure", "Ceiling and visibility allowing descent from the MEA, approach and landing under basic VFR"],
          ],
        ),
        info(
          "'A NA' and once you get there",
          "'A NA' on a chart means alternate minimums are not authorized — the approach cannot be used for alternate planning. Alternate minimums are for PLANNING only: if you actually divert to the alternate, you fly the approach to its normal published landing minimums.",
        ),
        info(
          "GPS and alternates",
          "With a WAAS GPS, you may plan to use an RNAV (GPS) approach at the alternate, but planning must be based on the LNAV or circling minimums (or LNAV/VNAV if approved for baro-VNAV), not LPV — see AIM 1-1-17 for details. Older non-WAAS (TSO-C129) receivers may not plan a GPS approach at both the destination and the alternate.",
        ),
        h("IFR fuel (91.167)"),
        p(
          "No person may operate in IFR conditions unless the aircraft carries enough fuel, considering weather reports and forecasts, to: complete the flight to the first airport of intended landing (including the approach); then fly from that airport to the alternate airport, if one is required; and then fly after that for 45 minutes at normal cruising speed.",
        ),
        table(
          ["Leg", "Example"],
          [
            ["Departure to destination, including approach", "2.0 hours"],
            ["Missed approach and destination to alternate", "0.6 hours"],
            ["Reserve at normal cruise", "0.75 hours"],
            ["Total at 10 gal/hr", "3.35 hours × 10 = 33.5 gallons minimum"],
          ],
        ),
        exercise("fuel-planning", "Calculate IFR fuel with alternate and reserve"),
        caution(
          "Legal is not the same as safe",
          "Holding, vectors, a missed approach and a headwind stronger than forecast can easily consume 45 minutes. Many instrument pilots plan to land with at least an hour of fuel, and declare 'minimum fuel' or an emergency early when fuel becomes critical.",
        ),
        tip(
          "Choose a good alternate",
          "Pick an alternate in a different weather pattern, with multiple approaches and good services — not just the closest airport that meets the minimums on paper.",
        ),
        practice("/simulator?scenario=ifr-departure", "IFR departure", "Fly a departure procedure and climb gradient you planned."),
      ],
    },
  ],
  flashcards: [
    { id: "ifr.planning.fc1", front: "1-2-3 rule (91.169)", back: "No alternate needed if from 1 hr before to 1 hr after ETA the ceiling is ≥ 2,000 ft and visibility ≥ 3 SM (and the destination has an IAP)." },
    { id: "ifr.planning.fc2", front: "Standard alternate minimums — precision approach", back: "600-ft ceiling and 2 SM visibility." },
    { id: "ifr.planning.fc3", front: "Standard alternate minimums — nonprecision approach", back: "800-ft ceiling and 2 SM visibility." },
    { id: "ifr.planning.fc4", front: "IFR fuel requirement (91.167)", back: "To destination (incl. approach), then to alternate if required, then 45 minutes at normal cruise." },
    { id: "ifr.planning.fc5", front: "'A NA' on an approach chart", back: "Alternate minimums not authorized — cannot be used for alternate planning." },
    { id: "ifr.planning.fc6", front: "Alternate with no IAP", back: "Forecast must allow descent from the MEA, approach and landing under basic VFR." },
  ],
  quiz: [
    q({
      id: "ifr.planning.q1",
      kind: "calc",
      context: "Flight time to destination including approach: 1 hr 40 min. Destination to alternate: 30 min. Fuel burn: 12 gal/hr.",
      prompt: "What is the minimum fuel required under 91.167?",
      choices: ["26 gal", "29 gal", "35 gal", "41 gal"],
      answer: 2,
      explanation:
        "1:40 + 0:30 + 0:45 = 2 hr 55 min = 2.917 hr × 12 ≈ 35 gal. Using a 30-minute reserve (the VFR day value) gives 32 gal, and omitting the alternate gives 29 gal.",
      subject: "Regulations",
      reference: "14 CFR 91.167",
    }),
    q({
      id: "ifr.planning.q2",
      kind: "mc",
      prompt: "Your planned alternate has only a VOR approach with standard alternate minimums. What must its forecast be at your ETA there?",
      choices: [
        "Ceiling 600 ft and visibility 2 SM",
        "Ceiling 800 ft and visibility 2 SM",
        "Ceiling 1,000 ft and visibility 3 SM",
        "Ceiling 2,000 ft and visibility 3 SM",
      ],
      answer: 1,
      explanation:
        "A nonprecision approach requires 800-2 under 91.169(c). 600-2 applies to precision approaches, and 2,000-3 is the destination test for whether an alternate is needed at all.",
      subject: "Regulations",
      reference: "14 CFR 91.169(c)",
    }),
    q({
      id: "ifr.planning.q3",
      kind: "tf",
      prompt: "True or false: after diverting to your alternate, you must use the alternate minimums for the approach you fly there.",
      choices: ["True", "False"],
      answer: 1,
      explanation:
        "False. Alternate minimums apply to flight PLANNING. When you actually fly the approach at the alternate, the normal published landing minimums apply.",
      subject: "IFR Procedures",
      reference: "IFH Ch. 10",
    }),
    q({
      id: "ifr.planning.q4",
      kind: "scenario",
      context: "Your destination has no instrument approach procedure. The forecast is ceiling 4,000 ft and visibility 6 SM all day.",
      prompt: "Is an alternate required?",
      choices: [
        "No — the weather exceeds 2,000 and 3",
        "Yes — the 1-2-3 exception only applies if the destination has a standard instrument approach procedure",
        "No — alternates are only required in IMC",
        "Only at night",
      ],
      answer: 1,
      explanation:
        "91.169(b) excuses the alternate only when the first airport of intended landing has a Part 97 standard IAP AND the 1-2-3 weather is met. With no IAP, an alternate is required regardless of the forecast.",
      subject: "Regulations",
      reference: "14 CFR 91.169(b)",
    }),
    q({
      id: "ifr.planning.q5",
      kind: "mc",
      prompt: "What does a triangle with an 'A' in the minimums section of an approach chart indicate?",
      choices: [
        "Alternate minimums are standard",
        "The airport has an ATIS",
        "Nonstandard alternate minimums or alternate restrictions apply — see the front of the TPP",
        "An approach light system is installed",
      ],
      answer: 2,
      explanation:
        "The ▲A symbol means the airport has nonstandard alternate minimums or restrictions, listed in the Terminal Procedures Publication. Standard minimums carry no symbol.",
      subject: "Charts",
      reference: "Terminal Procedures Publication",
    }),
    q({
      id: "ifr.planning.q6",
      kind: "mc",
      prompt: "Which type of NOTAM would announce an amendment to an instrument approach procedure?",
      choices: ["FDC NOTAM", "Pointer NOTAM", "Military NOTAM", "SAA NOTAM"],
      answer: 0,
      explanation:
        "FDC NOTAMs contain regulatory information, including changes to instrument approach procedures and TFRs. Pointer NOTAMs merely point to other NOTAMs.",
      subject: "IFR Procedures",
      reference: "AIM 5-1-3",
    }),
    q({
      id: "ifr.planning.q7",
      kind: "mc",
      prompt: "When choosing an IFR cruising altitude, which consideration is MOST important for an airplane not certificated for flight into known icing?",
      choices: [
        "Choosing the altitude with the best tailwind regardless of temperature",
        "Selecting an altitude above the MEA where the temperature is above freezing or the airplane is out of clouds",
        "Flying the lowest altitude available to save time climbing",
        "Always flying at an even altitude",
      ],
      answer: 1,
      explanation:
        "Avoiding icing — by staying in above-freezing air or out of visible moisture while above the MEA — is critical in a non-FIKI airplane. A great tailwind is worthless if the altitude puts you in icing clouds.",
      subject: "IFR Procedures",
      reference: "AC 00-6B; IFH Ch. 10",
    }),
  ],
  practice: [link("/planner", "IFR flight planner"), link("/weather", "IFR weather briefing"), link("/simulator?scenario=ifr-departure", "IFR departure")],
};
