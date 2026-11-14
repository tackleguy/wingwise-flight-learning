import type { Module } from "../types";
import { caution, check, diagram, exercise, h, info, link, p, practice, q, table, tip, ul, warning } from "../builders";

export const airspace: Module = {
  id: "airspace",
  number: 6,
  title: "Airspace",
  summary:
    "Classes A through G, entry and equipment requirements, chart depictions, speed limits, and special use and other airspace areas.",
  lessons: [
    {
      id: "vfr.airspace.1",
      title: "Controlled Airspace: Classes A, B and C",
      minutes: 11,
      objectives: [
        "Describe the dimensions and depiction of Class A, B and C airspace",
        "State entry, pilot and equipment requirements for each",
        "Apply the speed limits of 14 CFR 91.117",
      ],
      blocks: [
        h("The big picture"),
        p(
          "U.S. airspace is divided into controlled airspace (Classes A, B, C, D and E) and uncontrolled airspace (Class G). 'Controlled' means ATC provides IFR separation there — it does not automatically mean a VFR pilot must talk to ATC. Each class has its own entry rules, equipment requirements and VFR weather minimums. Think of the busiest airports as wedding cakes upside down: big shelves of airspace stacked above a smaller core around the airport.",
        ),
        diagram(
          "airspace-classes",
          "Cross-section of the U.S. airspace system: Class A from 18,000 ft MSL to FL600, Class B and C 'upside-down wedding cakes', Class D cylinders, Class E and Class G.",
        ),
        h("Class A"),
        p(
          "Class A extends from 18,000 ft MSL up to and including FL600 over the contiguous states and Alaska (within 12 NM of the coast). All operations are IFR: you need an instrument rating, an IFR clearance and an appropriately equipped aircraft, including a Mode C transponder and ADS-B Out. Altimeters are set to 29.92 in Hg and altitudes are expressed as flight levels. Class A is not depicted on sectional charts.",
        ),
        h("Class B"),
        p(
          "Class B surrounds the nation's busiest airports. It usually extends from the surface to 10,000 ft MSL and is shaped as layered shelves tailored to each airport, shown with solid blue lines on sectional and terminal area charts. Floors and ceilings of each shelf are printed in hundreds of feet MSL (for example 100 over 40 means 10,000 ft to 4,000 ft MSL).",
        ),
        ul(
          "ATC clearance required — you must hear 'cleared into the Class Bravo airspace'. Being radar-identified or told to 'remain clear' is not a clearance.",
          "Pilot: at least a private pilot certificate, or a student/recreational pilot with the required training and endorsements (61.95). Some Class B primary airports do not permit student pilot operations at all (Part 91 Appendix D, Section 4).",
          "Equipment: two-way radio, Mode C transponder and ADS-B Out. The Mode C and ADS-B requirement extends to the 30 NM 'Mode C veil' around the primary airport, from the surface to 10,000 ft MSL.",
          "VFR minimums: 3 SM visibility and clear of clouds.",
        ),
        h("Class C"),
        p(
          "Class C surrounds busy airports with an operating control tower and radar approach control. Its typical shape is a 5 NM radius surface area extending to 4,000 ft above airport elevation, and a 10 NM radius shelf from 1,200 ft to 4,000 ft above the airport. It is depicted with solid magenta lines. An outer area out to 20 NM is not charted; radar services are provided there but participation is voluntary.",
        ),
        ul(
          "Entry: establish two-way radio communication before entering. If the controller responds with your call sign, communication is established — even 'N123AB, standby'. If the controller says 'Aircraft calling, standby' (no call sign), you have NOT established communication.",
          "Equipment: two-way radio, Mode C transponder and ADS-B Out — also required above the ceiling and within the lateral boundaries of Class C up to 10,000 ft MSL.",
          "Pilot: no specific certificate level; students may operate with normal training.",
          "VFR minimums: 3 SM; 500 ft below, 1,000 ft above, 2,000 ft horizontal.",
        ),
        check({
          id: "vfr.airspace.1.k1",
          kind: "scenario",
          context:
            "Approaching a Class C airport, you call: 'Approach, Cessna 4 7 2 Papa Kilo, 15 miles south, 3,500, inbound for landing with information Bravo.' The controller replies: 'Cessna 4 7 2 Papa Kilo, standby.'",
          prompt: "May you enter the Class C airspace?",
          choices: [
            "No — you need an explicit clearance into Class C",
            "Yes — two-way communication has been established because the controller used your call sign",
            "No — 'standby' means remain outside",
            "Only if you are squawking 1200",
          ],
          answer: 1,
          explanation:
            "Class C requires only that two-way radio communication be established, and a reply using your call sign does that (AIM 3-2-4). An explicit clearance is required for Class B, not Class C. If the controller had said 'aircraft calling, standby' or told you to remain outside, you could not enter.",
          subject: "Airspace",
          reference: "AIM 3-2-4; 14 CFR 91.130",
        }),
        h("Speed limits (91.117)"),
        table(
          ["Where", "Maximum indicated airspeed"],
          [
            ["Below 10,000 ft MSL", "250 knots"],
            ["At or below 2,500 ft above the surface within 4 NM of the primary airport of Class C or D (unless authorized)", "200 knots"],
            ["Beneath the lateral limits of Class B, or in a VFR corridor through Class B", "200 knots"],
          ],
        ),
        tip(
          "Use the TAC",
          "Terminal Area Charts (1:250,000 scale) show Class B airspace in more detail, with VFR checkpoints, flyways and transition routes.",
        ),
      ],
    },
    {
      id: "vfr.airspace.2",
      title: "Class D, Class E and Class G",
      minutes: 10,
      objectives: [
        "Describe Class D, E and G airspace and how each is charted",
        "Determine the floor of Class E airspace from sectional symbology",
        "Know what happens to Class D airspace when the tower closes",
      ],
      blocks: [
        h("Class D"),
        p(
          "Class D surrounds airports with an operating control tower but without the traffic volume of Class B or C. It usually extends from the surface to about 2,500 ft above airport elevation, with a radius sized for the airport's instrument procedures. It is shown with a dashed blue line; the ceiling is printed in a dashed box in hundreds of feet MSL (for example [32] means 3,200 ft MSL).",
        ),
        ul(
          "Entry: establish two-way radio communication with the tower before entering, and maintain it.",
          "No transponder requirement unless another rule requires one (for example, the Mode C veil).",
          "VFR minimums: 3 SM; 500 ft below, 1,000 ft above, 2,000 ft horizontal.",
          "When the tower closes (part-time towers are marked with a star), the airspace reverts to Class E or Class G as listed in the Chart Supplement.",
        ),
        h("Class E"),
        p(
          "Class E is all controlled airspace that is not A, B, C or D. In most of the country it is the airspace that sits above Class G and below 18,000 ft MSL, and it also exists above FL600. VFR pilots need no clearance or radio contact in Class E. Its floor varies, and the sectional tells you where it starts:",
        ),
        table(
          ["Class E floor", "Sectional depiction"],
          [
            ["Surface", "Dashed magenta line around the airport"],
            ["700 ft AGL", "Shaded magenta vignette (fuzzy side inward)"],
            ["1,200 ft AGL", "The default in most areas; a shaded blue vignette marks the edge where a higher floor begins"],
            ["Specified altitude (e.g., 14,500 ft MSL)", "Staggered blue line or printed value"],
            ["Federal (Victor) airways", "From 1,200 ft AGL up to but not including 18,000 ft MSL, 4 NM either side of centerline"],
          ],
        ),
        h("Class G"),
        p(
          "Class G is uncontrolled airspace — everything not designated A, B, C, D or E. It usually extends from the surface up to the floor of the overlying Class E (700 ft or 1,200 ft AGL in most places, or up to 14,500 ft MSL in remote areas). ATC does not provide IFR separation in Class G, and the VFR weather minimums are the lowest in the system: by day below 1,200 ft AGL, 1 SM and clear of clouds.",
        ),
        table(
          ["Class", "Entry requirement", "Min. pilot certificate", "Transponder / ADS-B"],
          [
            ["A", "IFR clearance", "Instrument rating", "Required"],
            ["B", "ATC clearance", "Private (or endorsed student/recreational)", "Required (and within 30 NM veil)"],
            ["C", "Two-way radio communication", "Student", "Required"],
            ["D", "Two-way radio communication", "Student", "Not required by Class D rule"],
            ["E", "None for VFR", "Student", "Required at and above 10,000 ft MSL, excluding at or below 2,500 ft AGL"],
            ["G", "None", "Student", "Not required"],
          ],
        ),
        check({
          id: "vfr.airspace.2.k1",
          kind: "mc",
          prompt: "A dashed magenta line surrounding an airport on a sectional chart indicates:",
          choices: [
            "Class D airspace",
            "Class E airspace beginning at 700 ft AGL",
            "Class E airspace extending upward from the surface",
            "A Mode C veil",
          ],
          answer: 2,
          explanation:
            "Dashed magenta = Class E to the surface. Dashed BLUE is Class D, and the 700-ft AGL Class E floor is shown with a shaded magenta vignette, not a dashed line. The Mode C veil is a thin solid magenta circle labeled 'Mode C 30 NM'.",
          subject: "Charts",
          reference: "FAA Aeronautical Chart User's Guide",
        }),
        exercise("airspace-identify", "Identify the airspace class and floor at each point on the chart"),
        info(
          "Weather minimums matter more than radio calls",
          "Because Class E and G have different visibility and cloud clearance minimums, knowing exactly where the Class E floor begins tells you which VFR minimums apply at your altitude.",
        ),
      ],
    },
    {
      id: "vfr.airspace.3",
      title: "Special Use and Other Airspace",
      minutes: 9,
      objectives: [
        "Distinguish prohibited, restricted, warning, MOA, alert and controlled firing areas",
        "Understand TFRs, military training routes and other airspace areas",
        "Find activation times and controlling agencies",
      ],
      blocks: [
        h("Special use airspace"),
        p(
          "Special use airspace (SUA) confines activities that must be separated from other traffic or imposes limits on aircraft not participating in them. Times of use, altitudes and controlling agencies are listed on the margin of the sectional chart, and current status is available from Flight Service, ATC and NOTAMs.",
        ),
        table(
          ["Type", "Chart label", "What it means for a VFR pilot"],
          [
            ["Prohibited area", "P-xxx", "Flight is prohibited (e.g., over the White House, P-56)"],
            ["Restricted area", "R-xxxx", "Hazards such as artillery, missiles or aerial gunnery. Do not enter when active without permission from the controlling/using agency"],
            ["Warning area", "W-xxx", "Like a restricted area, but over international waters beyond 3 NM from the coast; hazardous activity"],
            ["Military operations area (MOA)", "Name + 'MOA'", "VFR flight is permitted but use extreme caution; contact the controlling agency or FSS for status"],
            ["Alert area", "A-xxx", "High volume of pilot training or unusual aerial activity. No permission needed; all pilots are responsible for collision avoidance"],
            ["Controlled firing area (CFA)", "Not charted", "Activities are suspended when spotter aircraft, radar or ground lookouts detect an approaching aircraft"],
          ],
        ),
        warning(
          "Restricted areas are not 'pass-through' by default",
          "A restricted area that is active is off-limits unless the controlling agency approves. When an IFR clearance takes you through one, ATC has coordinated it; on a VFR flight you must check status yourself.",
        ),
        h("Other airspace areas"),
        ul(
          "Temporary flight restrictions (TFRs): issued by NOTAM for VIP movements, disasters, sporting events, space operations and more (91.137–91.145). Always check before every flight.",
          "Military training routes (MTRs): IR (IFR) and VR (VFR) routes where military aircraft may fly at high speed and low altitude. Routes with no segment above 1,500 ft AGL use four-digit numbers; routes with one or more segments above 1,500 ft AGL use three-digit numbers.",
          "National security areas: pilots are requested to voluntarily avoid flying through them; flight may be temporarily prohibited by NOTAM.",
          "Parachute jump areas, published VFR routes and terminal radar service areas (TRSAs), where participation is voluntary but recommended.",
          "Air defense identification zones (ADIZ) and special flight rules areas such as the Washington, DC SFRA, which require flight plans, discrete transponder codes and special training.",
          "Wildlife refuges and national parks: pilots are requested to maintain at least 2,000 ft above the surface.",
        ),
        check({
          id: "vfr.airspace.3.k1",
          kind: "mc",
          prompt: "What is required for a VFR pilot to fly through an active MOA?",
          choices: [
            "A clearance from the controlling agency",
            "No clearance is required, but pilots should exercise extreme caution",
            "VFR flight is prohibited in an active MOA",
            "An instrument rating",
          ],
          answer: 1,
          explanation:
            "VFR flight through a MOA is legal at any time, though you should contact the controlling agency or FSS and use caution. A clearance or permission is required for an active RESTRICTED area, which is why that choice is tempting.",
          subject: "Airspace",
          reference: "AIM 3-4-5",
        }),
        caution(
          "TFRs are moving targets",
          "Presidential and stadium TFRs can appear with little notice. Violations can result in interception and certificate action. Get a briefing or check an approved source immediately before departure.",
        ),
        practice("/navigation", "Plan around airspace", "Draw a route and check for special use airspace and TFRs along the way."),
      ],
    },
  ],
  flashcards: [
    { id: "vfr.airspace.fc1", front: "Class B entry requirement", back: "An ATC clearance: 'Cleared into the Class Bravo airspace'." },
    { id: "vfr.airspace.fc2", front: "Class C entry requirement", back: "Two-way radio communication established before entering (controller uses your call sign)." },
    { id: "vfr.airspace.fc3", front: "Typical Class C dimensions", back: "5 NM radius surface to 4,000 ft above the airport; 10 NM shelf from 1,200 to 4,000 ft above the airport." },
    { id: "vfr.airspace.fc4", front: "Mode C veil", back: "30 NM around Class B primary airports, surface to 10,000 ft MSL: transponder with altitude reporting and ADS-B Out required." },
    { id: "vfr.airspace.fc5", front: "Shaded magenta vignette on a sectional", back: "Class E airspace begins at 700 ft AGL." },
    { id: "vfr.airspace.fc6", front: "Speed limit below Class B shelf or in a VFR corridor", back: "200 knots indicated (91.117)." },
  ],
  quiz: [
    q({
      id: "vfr.airspace.q1",
      kind: "mc",
      prompt: "What minimum pilot certification is required for operation within Class B airspace?",
      choices: [
        "Recreational pilot certificate",
        "Private pilot certificate, or student pilot certificate with appropriate logbook endorsements",
        "Commercial pilot certificate",
        "Private pilot certificate with an instrument rating",
      ],
      answer: 1,
      explanation:
        "Class B requires at least a private certificate, or a student or recreational pilot who has the training and endorsements of 61.95 (not permitted at certain listed primary airports). An instrument rating is required for Class A, not Class B.",
      subject: "Airspace",
      reference: "14 CFR 91.131",
    }),
    q({
      id: "vfr.airspace.q2",
      kind: "mc",
      prompt: "Class A airspace extends from:",
      choices: [
        "14,500 ft MSL to FL600",
        "18,000 ft MSL up to and including FL600",
        "10,000 ft MSL to FL450",
        "The surface to 18,000 ft MSL",
      ],
      answer: 1,
      explanation:
        "Class A begins at 18,000 ft MSL and extends up to and including FL600. 14,500 ft MSL is the default base of Class E in areas without a lower floor — a common mix-up.",
      subject: "Airspace",
      reference: "AIM 3-2-2",
    }),
    q({
      id: "vfr.airspace.q3",
      kind: "scenario",
      context:
        "You are planning a VFR flight at 3,500 ft MSL, about 25 NM from a Class B primary airport, beneath the outer shelf. Your airplane has a Mode C transponder but no ADS-B Out.",
      prompt: "Is the flight permitted?",
      choices: [
        "Yes, as long as you remain below the Class B shelf",
        "Yes, with a clearance from approach",
        "No, ADS-B Out is required within the 30 NM Mode C veil",
        "Yes, ADS-B is required only inside Class B itself",
      ],
      answer: 2,
      explanation:
        "91.225 requires ADS-B Out within 30 NM of a Class B primary airport from the surface to 10,000 ft MSL, even below the shelves. Remaining below the shelf keeps you out of Class B but not out of the veil. (Limited exceptions exist for aircraft without electrical systems; see 91.225.)",
      subject: "Airspace",
      reference: "14 CFR 91.225",
    }),
    q({
      id: "vfr.airspace.q4",
      kind: "mc",
      prompt: "The floor of Class E airspace along a federal (Victor) airway is normally:",
      choices: ["700 ft AGL", "1,200 ft AGL", "14,500 ft MSL", "The surface"],
      answer: 1,
      explanation:
        "Victor airways are Class E from 1,200 ft AGL up to but not including 18,000 ft MSL unless otherwise specified. 700 ft AGL is the floor near airports with instrument approaches, shown by a magenta vignette.",
      subject: "Airspace",
      reference: "AIM 3-2-6",
    }),
    q({
      id: "vfr.airspace.q5",
      kind: "mc",
      prompt: "Which type of special use airspace contains invisible hazards such as artillery firing and guided missiles and requires permission to enter when active?",
      choices: ["Alert area", "Military operations area", "Warning area over domestic land", "Restricted area"],
      answer: 3,
      explanation:
        "Restricted areas contain hazards to non-participating aircraft and require permission when active. MOAs and alert areas allow VFR flight without permission. Warning areas are over international waters, not domestic land.",
      subject: "Airspace",
      reference: "AIM 3-4-3",
    }),
    q({
      id: "vfr.airspace.q6",
      kind: "mc",
      prompt: "What is the maximum indicated airspeed at or below 2,500 ft AGL within 4 NM of the primary airport of Class D airspace, unless otherwise authorized?",
      choices: ["156 knots", "180 knots", "200 knots", "250 knots"],
      answer: 2,
      explanation:
        "91.117(b) limits speed to 200 knots in that area for Class C and D airports. 250 knots is the general limit below 10,000 ft MSL.",
      subject: "Airspace",
      reference: "14 CFR 91.117",
    }),
    q({
      id: "vfr.airspace.q7",
      kind: "tf",
      prompt: "True or false: when a part-time control tower closes, its Class D surface area always becomes Class G airspace.",
      choices: ["True", "False"],
      answer: 1,
      explanation:
        "False. It becomes Class E or Class G (or a combination) depending on the airport — check the airspace section of the Chart Supplement entry for that airport.",
      subject: "Airspace",
      reference: "AIM 3-2-5",
    }),
  ],
  practice: [link("/navigation", "Airspace on the moving map"), link("/airports", "Airport airspace info")],
};
