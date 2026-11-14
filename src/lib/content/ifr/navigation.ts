import type { Module } from "../types";
import {
  caution,
  check,
  diagram,
  exercise,
  h,
  info,
  link,
  ol,
  p,
  practice,
  q,
  table,
  tip,
  ul,
} from "../builders";

export const navigation: Module = {
  id: "navigation",
  number: 4,
  title: "IFR Navigation",
  summary:
    "VOR, DME and the HSI; intercepting and tracking courses and DME arcs; GPS, RNAV, RAIM and WAAS; airways and waypoints; and holding patterns — entries, timing and speeds.",
  lessons: [
    {
      id: "ifr.navigation.1",
      title: "VOR, DME and the HSI",
      minutes: 11,
      objectives: [
        "Interpret a VOR CDI and an HSI",
        "Intercept and track a VOR radial and fly a DME arc",
        "Explain DME slant-range error and VOR service volumes",
      ],
      blocks: [
        h("The VOR in instrument flight"),
        p(
          "A VOR transmits 360 magnetic radials. On a conventional CDI, the needle shows your position relative to the course selected with the OBS: full-scale deflection is 10° or more, so each of the five dots is about 2°. The TO/FROM flag shows whether the selected course would take you toward or away from the station. When flying a VOR course, keep your heading roughly aligned with the selected course to avoid reverse sensing.",
        ),
        diagram(
          "vor-cdi",
          "A conventional VOR CDI with OBS, TO/FROM flag and five-dot deflection scale.",
        ),
        h("The HSI"),
        p(
          "A horizontal situation indicator combines the heading indicator and CDI in one display. The course pointer is set on the rotating compass card, and the deviation bar shows where the course is relative to the airplane — so the picture matches the view from above. Because the HSI shows the course pointer against your actual heading, it does not reverse-sense when flying a localizer back course, provided the front course is set.",
        ),
        diagram(
          "hsi",
          "Horizontal situation indicator: heading card, course pointer, course deviation bar, TO/FROM indicator and glideslope.",
        ),
        h("Intercepting and tracking"),
        ol(
          "Turn to a heading parallel to the desired course to see which side you are on.",
          "Choose an intercept angle — 30° to 45° is typical; use less as you get closer to the station because the needle moves faster.",
          "As the needle starts to center, lead the turn onto course.",
          "Once established, bracket: if the needle drifts, turn 10°–20° toward it, then reduce the correction until you find the heading that holds it centered.",
        ),
        exercise(
          "vor-orientation",
          "Determine position and intercept headings from VOR indications",
        ),
        check({
          id: "ifr.navigation.1.k1",
          kind: "scenario",
          context:
            "You are heading 360°. The OBS is set to 030 with a TO flag and the CDI needle is deflected full scale to the right.",
          prompt: "Which heading will intercept the 030° course TO the station at a 45° angle?",
          choices: ["345°", "030°", "075°", "210°"],
          answer: 2,
          explanation:
            "With a TO flag and the needle right, the course is to your right. A 45° intercept is 030 + 45 = 075°. A heading of 345° would take you away from the course on the left side.",
          subject: "Navigation",
          reference: "IFH Ch. 9",
        }),
        h("DME and DME arcs"),
        p(
          "Distance measuring equipment measures slant range — the straight-line distance from the airplane to the station, not the ground distance. The error is greatest close to the station at high altitude: directly over a station at 6,000 ft AGL the DME reads about 1 NM. The error is negligible when you are at least 1 NM from the station for every 1,000 ft of altitude above it.",
        ),
        p(
          "A DME arc is a constant-distance path around a station, used as an approach transition. Fly it by keeping the RMI or bearing pointer near the wingtip reference (90° to your heading), turning 10°–20° toward the station whenever the distance increases and holding the heading when it decreases. With a CDI only, set the OBS 10° ahead of your current radial and turn when the needle centers.",
        ),
        info(
          "Service volumes",
          "Each VOR is classified as terminal, low or high altitude, with a standard service volume (horizontal range by altitude) published in the AIM and Chart Supplement. Use a navaid outside its service volume only when it is on a published route or ATC provides radar monitoring.",
        ),
        practice(
          "/simulator?scenario=ifr-vor-intercept",
          "VOR intercepts",
          "Intercept and track radials inbound and outbound.",
        ),
        practice(
          "/simulator?scenario=ifr-dme-arc",
          "DME arc",
          "Fly a 10-NM DME arc and intercept the final approach course.",
        ),
      ],
    },
    {
      id: "ifr.navigation.2",
      title: "GPS, RNAV, Airways and Waypoints",
      minutes: 11,
      objectives: [
        "Explain RAIM, WAAS and GPS CDI scaling",
        "Distinguish Victor airways, T-routes, Q-routes and jet routes",
        "Use fly-by and fly-over waypoints in en route navigation",
      ],
      blocks: [
        h("GPS and integrity"),
        p(
          "GPS determines position by timing signals from satellites. For IFR use, the receiver must also know the position is trustworthy. Receiver autonomous integrity monitoring (RAIM) uses extra satellites to detect a faulty one — at least five satellites in view (or four plus a baro-aided altimeter) for fault detection, and six for fault detection and exclusion. Non-WAAS (TSO-C129) receivers require a RAIM availability check during preflight planning.",
        ),
        p(
          "The Wide Area Augmentation System (WAAS) uses ground stations and geostationary satellites to correct GPS errors and broadcast integrity information. WAAS receivers (TSO-C145/C146) provide the accuracy for LPV and LNAV/VNAV approaches with vertical guidance, and generally do not need a separate RAIM prediction where WAAS coverage is available.",
        ),
        table(
          ["GPS mode", "Typical full-scale CDI deflection"],
          [
            ["En route", "About 2 NM on WAAS units (5 NM on older TSO-C129 units)"],
            ["Terminal (within 30 NM of departure or destination airport)", "1 NM"],
            [
              "Approach (final approach segment)",
              "0.3 NM, or angular like a localizer on LPV/LNAV/VNAV",
            ],
          ],
        ),
        caution(
          "Current database required",
          "To fly a GPS instrument approach, the navigation database must be current and the approach must be retrieved from it — you may not build one from manually entered waypoints. Check the database date before every IFR flight.",
        ),
        check({
          id: "ifr.navigation.2.k1",
          kind: "mc",
          prompt:
            "What is the minimum number of satellites RAIM needs to detect (but not exclude) a faulty satellite?",
          choices: ["Three", "Four", "Five", "Six"],
          answer: 2,
          explanation:
            "Fault detection requires at least five satellites (or four plus baro-aiding); fault exclusion requires six. Four satellites are enough for a 3D position but not for integrity monitoring.",
          subject: "Navigation",
          reference: "AIM 1-1-17",
        }),
        h("Airways and routes"),
        table(
          ["Route", "Based on", "Altitudes"],
          [
            ["Victor airways (V-)", "VORs", "1,200 ft AGL up to but not including 18,000 ft MSL"],
            ["T-routes", "RNAV (GPS)", "Low altitude, up to 17,999 ft MSL"],
            ["Jet routes (J-)", "VORs", "FL180 to FL450"],
            ["Q-routes", "RNAV (GPS)", "FL180 to FL450"],
          ],
        ),
        p(
          "Victor airways are 8 NM wide (4 NM either side of the centerline) and widen beyond 51 NM from the VOR. Changeover points (shown by a symbol and distances) tell you where to switch from one VOR to the next; if none is shown, change over at the midpoint.",
        ),
        h("Waypoints"),
        ul(
          "Fly-by waypoints: the receiver anticipates the turn and starts it before the waypoint, so you cut the corner smoothly. Most en route and approach waypoints are fly-by.",
          "Fly-over waypoints (circled on charts): you must cross the waypoint before turning — common at missed approach points.",
          "GPS may be used in lieu of ADF and DME equipment for many purposes, such as identifying fixes and flying DME arcs, as described in AIM 1-2-3.",
        ),
        tip(
          "Verify the flight plan",
          "After loading a route, check each waypoint against the clearance and chart: names, sequence, distances and courses. A single mis-keyed identifier can send you toward the wrong fix.",
        ),
        practice(
          "/simulator?scenario=ifr-rnav",
          "RNAV navigation",
          "Load and fly an RNAV route with fly-by and fly-over waypoints.",
        ),
      ],
    },
    {
      id: "ifr.navigation.3",
      title: "Holding Patterns",
      minutes: 12,
      objectives: [
        "Interpret holding instructions and draw the pattern",
        "Select the correct entry: direct, parallel or teardrop",
        "Apply holding timing, wind correction and maximum holding speeds",
      ],
      blocks: [
        p(
          "Holding keeps an airplane in a defined piece of airspace while it waits — for weather to improve, for traffic to clear, for an approach clearance, or as a course reversal on some approaches. A holding pattern is a racetrack: a fix, an inbound leg to that fix, a 180° turn, an outbound leg and another 180° turn back to the inbound course.",
        ),
        diagram(
          "holding-pattern",
          "A standard holding pattern: right turns, inbound leg to the holding fix, 1-minute inbound leg at or below 14,000 ft MSL. The holding side and non-holding side are shown.",
        ),
        h("Holding instructions"),
        p(
          "When ATC issues holding instructions for a pattern that is not charted, they include: the direction to hold from the fix (e.g., 'northwest'), the holding fix, the radial, course, bearing or airway on which to hold, leg length in miles if DME or RNAV is used (otherwise legs are timed), the direction of turns if left (right turns are standard), and an expect-further-clearance (EFC) time. Example: 'Hold southeast of the SPRING VOR on the 140 radial, left turns, expect further clearance at 1545' — the inbound course is 320° and the turns are to the left.",
        ),
        h("Entries"),
        p(
          "The AIM describes three entries based on your heading as you arrive at the fix, using a line drawn through the fix at 70° to the holding course on the holding side. For a standard (right-turn) pattern with inbound course I, the sectors by arrival heading are:",
        ),
        table(
          ["Entry", "Sector size", "Arrival heading (right-turn pattern)", "Procedure"],
          [
            [
              "Direct",
              "180°",
              "From I − 70° clockwise to I + 110°",
              "Cross the fix and turn right to fly the pattern",
            ],
            [
              "Teardrop",
              "70°",
              "From I + 110° clockwise to I + 180°",
              "Cross the fix, turn to a heading 30° into the holding side from the outbound course, fly 1 minute, turn right to intercept inbound",
            ],
            [
              "Parallel",
              "110°",
              "From I + 180° clockwise to I + 290°",
              "Cross the fix, turn to parallel the outbound course on the non-holding side for 1 minute, then turn back toward the holding side through more than 180° to intercept the inbound course or return to the fix",
            ],
          ],
        ),
        exercise("holding-entry", "Choose the correct holding entry for any arrival heading"),
        check({
          id: "ifr.navigation.3.k1",
          kind: "scenario",
          context:
            "Hold northeast of the ABC VORTAC on the 040 radial, standard (right) turns. You are arriving at the VORTAC on a heading of 090°.",
          prompt: "Which entry is recommended?",
          choices: ["Direct", "Teardrop", "Parallel", "Any entry may be used"],
          answer: 2,
          explanation:
            "The inbound course is 220°. For a right-turn pattern the parallel sector covers arrival headings from 040° clockwise to 150° (I + 180 to I + 290), so 090° is a parallel entry: cross the VORTAC, turn left to 040° on the non-holding side, then turn back to intercept 220° inbound. Direct would apply to headings from 150° to 330°.",
          subject: "IFR Procedures",
          reference: "AIM 5-3-8",
        }),
        h("Timing and wind"),
        ul(
          "Inbound leg: 1 minute at or below 14,000 ft MSL; 1½ minutes above 14,000 ft MSL.",
          "Start timing outbound over or abeam the fix, whichever occurs later. If you cannot tell when you are abeam, start timing when the turn to outbound is complete.",
          "Adjust the outbound time to achieve the correct inbound time: if the inbound leg was 45 seconds, add about 15 seconds outbound on the next circuit.",
          "Correct for wind on the outbound leg by applying about three times the inbound wind correction angle, in the opposite direction.",
          "Report to ATC when reaching the holding fix (time and altitude) and when leaving it.",
        ),
        h("Maximum holding airspeeds"),
        table(
          ["Altitude (MSL)", "Maximum holding speed"],
          [
            ["Up to and including 6,000 ft", "200 KIAS"],
            ["6,001 to 14,000 ft", "230 KIAS"],
            ["14,001 ft and above", "265 KIAS"],
          ],
        ),
        caution(
          "Exceptions",
          "Some charted holds have a lower published maximum (for example 210 KIAS, shown with an icon), and military airfields have different limits (USAF 310 KIAS, USN 230 KIAS). Begin slowing within 3 minutes before reaching the holding fix.",
        ),
        tip(
          "No EFC? Ask",
          "If you are told to hold and do not receive an EFC time, request one. It is critical if you lose communications — the lost-comm rules use the EFC to decide when to leave the hold.",
        ),
        practice(
          "/simulator?scenario=ifr-hold",
          "Holding practice",
          "Fly published and non-published holds with each entry type in a crosswind.",
        ),
      ],
    },
  ],
  flashcards: [
    {
      id: "ifr.navigation.fc1",
      front: "DME slant-range error is negligible when…",
      back: "The aircraft is 1 NM or more from the station for each 1,000 ft of altitude above it.",
    },
    {
      id: "ifr.navigation.fc2",
      front: "RAIM satellite requirements",
      back: "5 for fault detection (or 4 + baro-aiding); 6 for fault detection and exclusion.",
    },
    {
      id: "ifr.navigation.fc3",
      front: "Standard holding pattern",
      back: "Right turns; 1-minute inbound legs at or below 14,000 ft MSL (1½ minutes above).",
    },
    {
      id: "ifr.navigation.fc4",
      front: "Maximum holding speeds",
      back: "200 KIAS up to 6,000 ft; 230 KIAS 6,001–14,000 ft; 265 KIAS above 14,000 ft.",
    },
    {
      id: "ifr.navigation.fc5",
      front: "When to start outbound timing in a hold",
      back: "Over or abeam the fix, whichever occurs later.",
    },
    {
      id: "ifr.navigation.fc6",
      front: "Victor airway width",
      back: "4 NM either side of centerline (8 NM total), widening beyond 51 NM from the VOR.",
    },
  ],
  quiz: [
    q({
      id: "ifr.navigation.q1",
      kind: "calc",
      prompt:
        "An aircraft is directly over a VORTAC at 12,000 ft above the station. What will the DME read?",
      choices: ["0 NM", "1 NM", "2 NM", "12 NM"],
      answer: 2,
      explanation:
        "DME measures slant range. 12,000 ft is about 2 NM (6,076 ft per NM), so overhead the station the DME reads about 2 NM, not zero.",
      subject: "Navigation",
      reference: "AIM 1-1-7",
    }),
    q({
      id: "ifr.navigation.q2",
      kind: "scenario",
      context:
        "Hold southwest of the XYZ VOR on the 230 radial, right turns. You arrive at the VOR on a heading of 190°.",
      prompt: "Which entry should you use?",
      choices: ["Teardrop", "Direct", "Parallel", "Either direct or parallel"],
      answer: 0,
      explanation:
        "The inbound course is 050°. For a right-turn pattern, teardrop headings run from I + 110° (160°) clockwise to I + 180° (230°), so 190° is a teardrop: cross the VOR, turn right to about 200° (30° from the 230° outbound course toward the holding side), fly 1 minute, then turn right to intercept 050° inbound. Direct would apply to arrival headings from 340° clockwise to 160°.",
      subject: "IFR Procedures",
      reference: "AIM 5-3-8",
    }),
    q({
      id: "ifr.navigation.q3",
      kind: "mc",
      prompt:
        "What is the maximum holding airspeed for a propeller aircraft holding at 8,000 ft MSL at a civil fix with no published restriction?",
      choices: ["200 KIAS", "210 KIAS", "230 KIAS", "265 KIAS"],
      answer: 2,
      explanation:
        "6,001 to 14,000 ft MSL: 230 KIAS. 200 KIAS applies up to 6,000 ft and 265 KIAS above 14,000 ft; 210 KIAS applies only where published.",
      subject: "IFR Procedures",
      reference: "AIM 5-3-8",
    }),
    q({
      id: "ifr.navigation.q4",
      kind: "scenario",
      context:
        "In a hold at 5,000 ft with a 1-minute inbound leg, you time the inbound leg at 1 minute 20 seconds.",
      prompt: "How should you adjust the next outbound leg?",
      choices: [
        "Fly 40 seconds outbound",
        "Fly 1 minute 20 seconds outbound",
        "Fly 1 minute outbound",
        "Fly 2 minutes outbound",
      ],
      answer: 0,
      explanation:
        "The inbound leg was 20 seconds too long, so shorten the outbound leg by about 20 seconds: 1:00 − 0:20 = 40 seconds. Lengthening the outbound leg would make the inbound leg even longer.",
      subject: "IFR Procedures",
      reference: "AIM 5-3-8",
    }),
    q({
      id: "ifr.navigation.q5",
      kind: "mc",
      prompt:
        "A WAAS-capable GPS in terminal mode (within 30 NM of the airport) has a full-scale CDI deflection of:",
      choices: ["5 NM", "2 NM", "0.3 NM", "1 NM"],
      answer: 3,
      explanation:
        "Terminal mode is 1 NM full scale. En route is about 2 NM (5 NM on older units) and the final approach segment is 0.3 NM or angular.",
      subject: "Navigation",
      reference: "AIM 1-1-17",
    }),
    q({
      id: "ifr.navigation.q6",
      kind: "mc",
      prompt: "Which route type is an RNAV route in the low-altitude structure?",
      choices: ["T-route", "Q-route", "Jet route", "Victor airway"],
      answer: 0,
      explanation:
        "T-routes are low-altitude RNAV routes. Q-routes are high-altitude RNAV routes (FL180–FL450), and Victor and jet routes are based on VORs.",
      subject: "Navigation",
      reference: "AIM 5-3-4",
    }),
    q({
      id: "ifr.navigation.q7",
      kind: "mc",
      prompt: "When should you begin timing the outbound leg of a holding pattern?",
      choices: [
        "When crossing the fix inbound",
        "One minute after crossing the fix",
        "When the turn outbound begins",
        "Over or abeam the fix, whichever occurs later",
      ],
      answer: 3,
      explanation:
        "Outbound timing begins over or abeam the fix, whichever occurs later; if abeam cannot be determined, start when the turn to outbound is complete.",
      subject: "IFR Procedures",
      reference: "AIM 5-3-8",
    }),
    q({
      id: "ifr.navigation.q8",
      kind: "tf",
      prompt:
        "True or false: on an HSI with the localizer front course set, flying the back course produces reverse sensing.",
      choices: ["True", "False"],
      answer: 1,
      explanation:
        "False. With the front course set on the course pointer, the HSI depicts the course correctly when flying the back course — no reverse sensing. A conventional CDI, which does not know your heading, does reverse-sense.",
      subject: "Flight Instruments",
      reference: "IFH Ch. 9",
    }),
  ],
  practice: [
    link("/simulator?scenario=ifr-vor-intercept", "VOR intercepts"),
    link("/simulator?scenario=ifr-dme-arc", "DME arcs"),
    link("/simulator?scenario=ifr-hold", "Holding"),
    link("/simulator?scenario=ifr-rnav", "RNAV"),
    link("/navigation", "Navigation tools"),
  ],
};
