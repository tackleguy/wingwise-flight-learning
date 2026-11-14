import type { Module } from "../types";
import { caution, check, diagram, h, info, link, ol, p, practice, q, table, tip, ul } from "../builders";

export const trafficPatterns: Module = {
  id: "traffic-patterns",
  number: 13,
  title: "Traffic Patterns",
  summary:
    "Pattern legs and altitudes, entering and departing at towered and non-towered airports, correcting for wind, and the ground reference maneuvers that build those skills.",
  lessons: [
    {
      id: "vfr.traffic-patterns.1",
      title: "The Standard Traffic Pattern",
      minutes: 10,
      objectives: [
        "Name the legs of the traffic pattern and the recommended pattern altitude",
        "Enter and depart the pattern at a non-towered airport using recommended procedures",
        "Interpret segmented circle traffic indicators",
      ],
      blocks: [
        h("Why patterns exist"),
        p(
          "The traffic pattern is an agreed flow of traffic around an airport so every pilot knows where to look for everyone else. Predictability is the main safety feature: if you fly the expected pattern and make the expected radio calls, other pilots can find you.",
        ),
        diagram(
          "traffic-pattern",
          "A standard left-hand pattern: departure (upwind), crosswind, downwind, base and final legs, with the recommended 45° entry to downwind.",
        ),
        table(
          ["Leg", "Description"],
          [
            ["Upwind / departure", "Flight path aligned with and in the direction of landing, after takeoff or on a go-around"],
            ["Crosswind", "Perpendicular to the runway at the departure end"],
            ["Downwind", "Parallel to the runway in the opposite direction of landing, typically ½ to 1 mile from the runway"],
            ["Base", "Perpendicular to the runway, between downwind and final"],
            ["Final", "Aligned with the runway centerline, descending to land"],
          ],
        ),
        h("Altitudes and direction"),
        ul(
          "Pattern altitude is published in the Chart Supplement; if not, the FAA recommends 1,000 ft above the airport elevation for propeller airplanes (AC 90-66C).",
          "Turns are to the left unless markings, light signals or the Chart Supplement indicate right traffic (14 CFR 91.126).",
          "Turn crosswind after passing the departure end of the runway and within 300 ft of pattern altitude.",
          "When departing the pattern, fly straight out or make a 45° turn in the direction of the pattern after reaching pattern altitude.",
          "If you must overfly the airport, do so at least 500 ft above the highest pattern altitude.",
        ),
        h("Entering at a non-towered airport"),
        ol(
          "Listen to the AWOS/ASOS and CTAF well before arrival to determine the runway in use.",
          "If you are on the non-pattern side, cross over at least 500 ft above pattern altitude, then descend well clear and enter.",
          "Enter on a 45° angle to the downwind leg, abeam the midpoint of the runway, at pattern altitude.",
          "Self-announce at about 10 miles, entering downwind, on base, on final and clear of the runway.",
        ),
        info(
          "Midfield crossover",
          "AC 90-66C also describes an alternative: crossing over midfield at pattern altitude and turning directly onto downwind. Use it only when traffic allows, and announce your intentions — the 45° entry remains the preferred method.",
        ),
        check({
          id: "vfr.traffic-patterns.1.k1",
          kind: "mc",
          prompt: "What is the recommended entry to the traffic pattern at a non-towered airport?",
          choices: [
            "A straight-in approach to final",
            "A 45° entry to the downwind leg abeam midfield at pattern altitude",
            "Entering on the base leg from the opposite side",
            "Crossing over the runway at pattern altitude at the departure end",
          ],
          answer: 1,
          explanation:
            "AC 90-66C recommends a 45° entry to downwind abeam the midpoint of the runway at pattern altitude. Straight-in approaches are not prohibited but are discouraged because they conflict with pattern traffic.",
          subject: "Airport Operations",
          reference: "AC 90-66C; AIM 4-3-3",
        }),
        h("Segmented circle"),
        p(
          "At many non-towered airports, the wind indicator is surrounded by a segmented circle. L-shaped traffic pattern indicators attached to the circle show the direction of turns: imagine the indicator as the base and final legs for that runway. If the short arm of the 'L' points right of the runway direction, right traffic is in use.",
        ),
        practice("/simulator?scenario=vfr-pattern", "Fly the pattern", "Fly a full pattern with radio calls, maintaining 1,000 ft AGL and spacing."),
      ],
    },
    {
      id: "vfr.traffic-patterns.2",
      title: "Wind Correction and Ground Reference Maneuvers",
      minutes: 10,
      objectives: [
        "Correct for wind drift on each leg of the pattern",
        "Explain how bank angle changes with groundspeed in a turn around a point",
        "Perform the rectangular course, S-turns and turns around a point",
      ],
      blocks: [
        h("Wind in the pattern"),
        p(
          "The traffic pattern is a ground track, so you must correct for wind on every leg. On downwind with a crosswind, crab into the wind to stay parallel to the runway. If the wind is blowing you toward the runway on downwind, it will push you past final on the turn — start the base turn a little later and expect a tailwind on base. The rectangular course ground reference maneuver trains exactly this skill.",
        ),
        h("Ground reference maneuvers"),
        p(
          "Ground reference maneuvers are flown at about 600 to 1,000 ft AGL, high enough for safety and low enough to see drift clearly. They teach you to divide attention between flying the airplane, tracking a ground reference and watching for traffic — the same skills you need in the pattern.",
        ),
        table(
          ["Maneuver", "What you practice"],
          [
            ["Rectangular course", "Tracking a rectangular ground path, like a traffic pattern, with crab angles on each side"],
            ["S-turns across a road", "Semicircles of equal radius on each side of a straight reference line"],
            ["Turns around a point", "A constant-radius circle around a ground point with continuously varying bank"],
          ],
        ),
        h("The key relationship"),
        p(
          "To fly a constant radius over the ground, bank angle must vary with groundspeed. The steepest bank occurs when you are flying directly downwind (highest groundspeed), and the shallowest bank when flying directly upwind (lowest groundspeed). Enter turns around a point on the downwind side so the steepest bank comes first.",
        ),
        check({
          id: "vfr.traffic-patterns.2.k1",
          kind: "mc",
          prompt: "During a turn around a point, where is the steepest bank angle required?",
          choices: [
            "When heading directly upwind",
            "When heading directly downwind",
            "When the wind is directly off a wingtip",
            "Bank angle stays constant",
          ],
          answer: 1,
          explanation:
            "Groundspeed is highest heading downwind, so you need the steepest bank to hold the radius. Upwind, the groundspeed is lowest and the bank is shallowest. A constant bank produces an egg-shaped track that drifts downwind.",
          subject: "Navigation",
          reference: "AFH Ch. 7",
        }),
        caution(
          "Watch your coordination",
          "Low-altitude turns while looking outside invite uncoordinated, skidding turns. Keep the ball centered and the airspeed under control; this is the same trap that causes base-to-final stall/spin accidents.",
        ),
        tip(
          "Pick an emergency landing area",
          "Choose a reference point with a suitable field nearby. At ground reference altitudes, an engine failure leaves very little time to choose one.",
        ),
        check({
          id: "vfr.traffic-patterns.2.k2",
          kind: "scenario",
          context: "On left downwind for runway 36, the wind is from 270° (from your left as you fly south on downwind).",
          prompt: "How will the wind affect your base leg?",
          choices: [
            "Headwind on base — you may need to turn base earlier",
            "Tailwind on base — you may overshoot final unless you turn base earlier",
            "No effect on base",
            "Strong crosswind from the right on base",
          ],
          answer: 1,
          explanation:
            "Flying south on left downwind for 36, base is flown heading east. A west wind is then a tailwind on base, increasing groundspeed and risking an overshoot of final. Plan an earlier base turn and avoid steep, skidding turns to final.",
          subject: "Airport Operations",
          reference: "AFH Ch. 8",
        }),
        practice("/simulator?scenario=vfr-ground-ref", "Ground reference maneuvers", "Fly a rectangular course and turns around a point with a 15-knot wind."),
      ],
    },
  ],
  flashcards: [
    { id: "vfr.traffic-patterns.fc1", front: "Standard direction of pattern turns", back: "Left, unless otherwise indicated (91.126)." },
    { id: "vfr.traffic-patterns.fc2", front: "Recommended pattern altitude for propeller airplanes", back: "1,000 ft AGL unless otherwise established (AC 90-66C)." },
    { id: "vfr.traffic-patterns.fc3", front: "Recommended pattern entry at a non-towered airport", back: "45° to downwind, abeam midfield, at pattern altitude." },
    { id: "vfr.traffic-patterns.fc4", front: "When to turn crosswind after takeoff", back: "Beyond the departure end of the runway and within 300 ft of pattern altitude." },
    { id: "vfr.traffic-patterns.fc5", front: "Steepest bank in a turn around a point", back: "Directly downwind, where groundspeed is highest." },
    { id: "vfr.traffic-patterns.fc6", front: "Overflying an airport", back: "At least 500 ft above the highest pattern altitude." },
  ],
  quiz: [
    q({
      id: "vfr.traffic-patterns.q1",
      kind: "mc",
      prompt: "Which leg of the traffic pattern is flown parallel to the landing runway in the direction opposite to landing?",
      choices: ["Upwind", "Crosswind", "Downwind", "Base"],
      answer: 2,
      explanation: "The downwind leg parallels the runway in the opposite direction of landing. The upwind (departure) leg parallels it in the direction of landing.",
      subject: "Airport Operations",
      reference: "AIM 4-3-3",
    }),
    q({
      id: "vfr.traffic-patterns.q2",
      kind: "mc",
      prompt: "When approaching to land at an airport without an operating control tower in Class G airspace, the pilot should:",
      choices: [
        "Make all turns to the left unless otherwise indicated",
        "Enter and fly a pattern in either direction",
        "Make all turns to the right",
        "Fly a straight-in approach",
      ],
      answer: 0,
      explanation:
        "91.126(b) requires left turns at airports in Class G unless markings or other indications show right traffic. Choosing a direction freely would make you unpredictable to other traffic.",
      subject: "Regulations",
      reference: "14 CFR 91.126",
    }),
    q({
      id: "vfr.traffic-patterns.q3",
      kind: "scenario",
      context:
        "A segmented circle shows a landing strip indicator for runway 9-27 with traffic pattern indicators. The traffic pattern indicator at the east end of the strip (the approach end for runway 27) has its short arm extending to the north.",
      prompt: "For landing on runway 27, what pattern is in use?",
      choices: ["Left traffic", "Right traffic", "Straight-in only", "Cannot be determined"],
      answer: 1,
      explanation:
        "The indicator depicts base and final. Base is north of the extended centerline, so downwind is flown eastbound north of the runway, base southbound and final westbound — every turn is to the right. Left traffic for runway 27 would put the base leg to the south.",
      subject: "Airport Operations",
      reference: "AIM 4-3-4",
    }),
    q({
      id: "vfr.traffic-patterns.q4",
      kind: "mc",
      prompt: "When departing a non-towered airport's traffic pattern, the recommended procedure is to:",
      choices: [
        "Turn in any direction immediately after takeoff",
        "Climb on the downwind leg and depart from there",
        "Fly straight out or make a 45° turn in the direction of the pattern after reaching pattern altitude",
        "Make a 90° turn against the direction of the pattern",
      ],
      answer: 2,
      explanation:
        "AC 90-66C recommends departing straight out or with a 45° turn in the direction of the pattern after reaching pattern altitude. Turning against the flow places you head-on with pattern traffic.",
      subject: "Airport Operations",
      reference: "AC 90-66C",
    }),
    q({
      id: "vfr.traffic-patterns.q5",
      kind: "mc",
      prompt: "During S-turns across a road with the wind perpendicular to the road, the bank is steepest when:",
      choices: [
        "Crossing the road heading downwind",
        "Crossing the road heading upwind",
        "Parallel to the road",
        "It remains constant",
      ],
      answer: 0,
      explanation:
        "As in turns around a point, groundspeed is highest heading downwind, so the bank must be steepest there. Upwind, groundspeed is lowest and the bank is shallowest.",
      subject: "Navigation",
      reference: "AFH Ch. 7",
    }),
    q({
      id: "vfr.traffic-patterns.q6",
      kind: "tf",
      prompt: "True or false: at a non-towered airport, straight-in approaches are prohibited by regulation.",
      choices: ["True", "False"],
      answer: 1,
      explanation:
        "False. Straight-in approaches are not prohibited, but AC 90-66C discourages them; a pilot flying one should not disrupt the flow of pattern traffic and must yield as required by 91.113.",
      subject: "Airport Operations",
      reference: "AC 90-66C",
    }),
  ],
  practice: [link("/simulator?scenario=vfr-pattern", "Traffic pattern"), link("/simulator?scenario=vfr-ground-ref", "Ground reference maneuvers")],
};
