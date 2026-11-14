import type { Module } from "../types";
import { caution, check, diagram, exercise, h, info, link, ol, p, practice, q, table, tip, ul } from "../builders";

export const pilotage: Module = {
  id: "pilotage",
  number: 9,
  title: "Pilotage",
  summary:
    "Navigating by visual reference to landmarks, choosing good checkpoints, using a VOR and GPS as cross-checks, diversions and what to do when lost.",
  lessons: [
    {
      id: "vfr.pilotage.1",
      title: "Navigating by Landmarks",
      minutes: 9,
      objectives: [
        "Define pilotage and explain when it is used",
        "Select checkpoints that are easy to identify from the air",
        "Use the chart-to-ground technique to stay oriented",
      ],
      blocks: [
        h("What pilotage is"),
        p(
          "Pilotage is navigation by reference to visible landmarks. You compare what you see outside with what is printed on the sectional chart. It is the oldest form of air navigation, it needs no electronics, and on every VFR flight it is your primary check that the airplane is where you think it is. In practice, pilotage and dead reckoning are used together: dead reckoning gives you a heading and timing, and pilotage confirms your progress.",
        ),
        h("Choosing checkpoints"),
        p(
          "Good checkpoints are features you cannot mistake for anything else. A town is only a good checkpoint if its size and shape, or something next to it, makes it unique. Plan checkpoints roughly every 10 to 20 NM along your route and at every turning point, and note the estimated time to each one on your navigation log.",
        ),
        table(
          ["Good checkpoints", "Poor checkpoints"],
          [
            ["Large lakes and reservoirs with distinctive shapes", "Small ponds that look alike"],
            ["Intersections of major highways and railroads", "Minor roads, especially in farm country grids"],
            ["Towns with an airport, river or distinctive layout", "Small towns that look the same"],
            ["Prominent bends in rivers, dams and bridges", "Power lines alone (hard to see)"],
            ["Tall, lighted obstacles and mountain peaks", "Features that change with season (snow, flooding)"],
          ],
        ),
        tip(
          "Look for a combination",
          "One feature can be misidentified; three that line up as charted — a highway crossing a river just south of a town with a racetrack — confirm your position.",
        ),
        h("Chart to ground, not ground to chart"),
        p(
          "Hold the chart oriented in your direction of flight so features on the chart lie in the same relative position as they appear outside. Then anticipate: look at the chart, decide what you should see next and when, and look for it. Working from ground to chart — spotting something and then hunting for it on the chart — is how pilots convince themselves that a feature matches when it does not.",
        ),
        exercise("landmarks", "Match chart features to aerial views"),
        check({
          id: "vfr.pilotage.1.k1",
          kind: "mc",
          prompt: "Which is the most reliable checkpoint for pilotage?",
          choices: [
            "A small farm pond",
            "A single highway in an area of many similar roads",
            "The intersection of a railroad and a river next to a town with an airport",
            "A forest boundary",
          ],
          answer: 2,
          explanation:
            "A combination of distinctive features is nearly impossible to misidentify. A single road in a grid of similar roads, or one of many ponds, is easily confused with a neighbor.",
          subject: "Navigation",
          reference: "PHAK Ch. 16",
        }),
        caution(
          "Head down, not out",
          "Folding charts and studying a tablet can consume your attention. Plan and fold your chart before flight, and keep scanning for traffic between checkpoint checks.",
        ),
        practice("/simulator?scenario=vfr-xc", "VFR cross-country", "Fly a short leg using only landmarks and your chart."),
      ],
    },
    {
      id: "vfr.pilotage.2",
      title: "VOR and GPS Cross-Checks, Diversions and Lost Procedures",
      minutes: 11,
      objectives: [
        "Tune, identify and interpret a VOR to determine your position",
        "Plan and execute a diversion to an alternate airport",
        "Apply a systematic lost procedure",
      ],
      blocks: [
        h("The VOR as a cross-check"),
        p(
          "A VOR (VHF omnidirectional range) transmits 360 radials, each one a magnetic bearing FROM the station. In the cockpit, you tune the frequency, identify the station by its Morse code, and turn the omni-bearing selector (OBS). The course deviation indicator (CDI) shows whether you are left or right of the selected course, and the TO/FROM flag tells you whether that course would take you toward or away from the station.",
        ),
        diagram(
          "vor-cdi",
          "With the OBS set to 360 and a FROM flag, a centered needle means you are on the 360 radial north of the station. Each dot of deflection is 2°, and full-scale deflection is 10° or more off course.",
        ),
        ul(
          "Always identify the station: a missing or test Morse code means the signal is unreliable.",
          "The VOR does not know your heading. The CDI shows position relative to a radial regardless of where the nose is pointed.",
          "To find which radial you are on, center the needle with a FROM flag and read the OBS.",
          "Two VOR radials crossing on the chart give a position fix.",
        ),
        exercise("vor-orientation", "Determine your position from VOR indications"),
        check({
          id: "vfr.pilotage.2.k1",
          kind: "scenario",
          context: "You are northeast of a VOR and want to fly directly to it along the 045° radial.",
          prompt: "What should you set in the OBS to get a TO indication with a centered needle?",
          choices: ["045", "225", "135", "315"],
          answer: 1,
          explanation:
            "Radials point FROM the station. If you are on the 045 radial, the course TO the station is the reciprocal, 225°. Setting 045 would give a FROM flag and reverse sensing if you flew inbound.",
          subject: "Navigation",
          reference: "PHAK Ch. 16",
        }),
        h("GPS"),
        p(
          "GPS gives precise position, groundspeed and time to the next waypoint and is the most common VFR navigation tool today. Its weakness is the pilot: a mis-entered waypoint or an unnoticed loss of signal can lead you confidently in the wrong direction. Keep the chart in your lap, keep confirming GPS position against landmarks, and know how to navigate without it.",
        ),
        h("Diversions"),
        p(
          "Weather, a sick passenger or a rough-running engine can make you divert. The AFH guidance: divert promptly — do not wait until conditions force your hand. Pick the alternate, turn toward it right away using an estimated heading, then refine the course, distance, time and fuel once established.",
        ),
        ol(
          "Decide to divert and choose a suitable airport.",
          "Turn toward it immediately on an estimated heading.",
          "Measure course and distance (plotter, GPS 'nearest' or rule of thumb).",
          "Estimate groundspeed, time en route and fuel required.",
          "Use pilotage to confirm progress; inform ATC or Flight Service and amend your flight plan.",
        ),
        h("If you become lost"),
        table(
          ["Step", "Action"],
          [
            ["Climb", "Higher altitude improves visibility of landmarks and radio/radar reception (stay clear of clouds and airspace)"],
            ["Communicate", "Call ATC, Flight Service or 121.5 MHz; ask for help"],
            ["Confess", "Admit you are lost or unsure of your position"],
            ["Comply", "Follow the instructions you are given"],
            ["Conserve", "Reduce power to conserve fuel; plan to land with reserve"],
          ],
        ),
        info(
          "Squawk 7700 if it becomes an emergency",
          "Being unsure of your position is not an emergency by itself, but low fuel, deteriorating weather or approaching darkness can make it one. Do not hesitate to declare an emergency and squawk 7700 for priority handling.",
        ),
        check({
          id: "vfr.pilotage.2.k2",
          kind: "tf",
          prompt: "True or false: when diverting, you should first compute exact heading, distance and fuel, then turn toward the alternate.",
          choices: ["True", "False"],
          answer: 1,
          explanation:
            "False. Turn toward the alternate promptly using an estimated heading, then work out precise numbers once established. Delaying the turn to do calculations wastes time and fuel and keeps you heading toward the problem.",
          subject: "Navigation",
          reference: "PHAK Ch. 16",
        }),
      ],
    },
  ],
  flashcards: [
    { id: "vfr.pilotage.fc1", front: "Pilotage", back: "Navigation by visual reference to landmarks compared with a chart." },
    { id: "vfr.pilotage.fc2", front: "VOR radial", back: "A magnetic bearing extending outbound FROM the station." },
    { id: "vfr.pilotage.fc3", front: "VOR CDI full-scale deflection", back: "10° or more off the selected course (2° per dot on a 5-dot scale)." },
    { id: "vfr.pilotage.fc4", front: "Lost procedure (5 Cs)", back: "Climb, Communicate, Confess, Comply, Conserve." },
    { id: "vfr.pilotage.fc5", front: "Diversion rule", back: "Turn toward the alternate promptly on an estimated heading, then refine." },
    { id: "vfr.pilotage.fc6", front: "Chart orientation for pilotage", back: "Hold the chart aligned with the direction of flight; navigate chart-to-ground." },
  ],
  quiz: [
    q({
      id: "vfr.pilotage.q1",
      kind: "scenario",
      context: "The OBS is set to 090. The CDI needle is centered and the flag shows FROM.",
      prompt: "Where is the airplane relative to the VOR?",
      choices: ["West of the station", "East of the station", "North of the station", "South of the station"],
      answer: 1,
      explanation:
        "A centered needle with a FROM flag on 090 means you are on the 090 radial — east of the station. Heading does not matter. West would correspond to a TO indication on 090.",
      subject: "Navigation",
      reference: "PHAK Ch. 16",
    }),
    q({
      id: "vfr.pilotage.q2",
      kind: "mc",
      prompt: "Why should a pilot listen to the Morse code identifier of a VOR?",
      choices: [
        "To confirm the frequency is tuned correctly and the station is operational",
        "To determine the distance from the station",
        "To set the OBS",
        "It is optional and only required for IFR flight",
      ],
      answer: 0,
      explanation:
        "Identifying confirms you are receiving the intended station and that it is usable — a station under maintenance may remove its identifier or transmit a test code. It does not give distance (DME does).",
      subject: "Navigation",
      reference: "AIM 1-1-3",
    }),
    q({
      id: "vfr.pilotage.q3",
      kind: "mc",
      prompt: "Which navigation technique uses visible landmarks compared with a chart?",
      choices: ["Dead reckoning", "Radio navigation", "Pilotage", "Celestial navigation"],
      answer: 2,
      explanation:
        "Pilotage is navigation by landmarks. Dead reckoning uses computed headings, speeds and times — the two are normally combined on VFR flights.",
      subject: "Navigation",
      reference: "PHAK Ch. 16",
    }),
    q({
      id: "vfr.pilotage.q4",
      kind: "scenario",
      context:
        "Halfway to your destination, clouds ahead are lowering and you can see rain shafts. An airport 15 NM to your left is reporting VFR.",
      prompt: "What is the best course of action?",
      choices: [
        "Continue and descend below the clouds to stay VFR",
        "Turn toward the alternate immediately, then refine heading and inform ATC or Flight Service",
        "Circle until the weather improves",
        "Climb above the clouds and continue VFR on top",
      ],
      answer: 1,
      explanation:
        "Divert promptly while conditions are still good. Descending under lowering clouds ('scud running') is a leading cause of VFR-into-IMC accidents, and VFR on top risks being trapped above a cloud layer.",
      subject: "ADM",
      reference: "PHAK Ch. 16",
    }),
    q({
      id: "vfr.pilotage.q5",
      kind: "mc",
      prompt: "When unsure of your position, why is climbing (when weather and airspace allow) usually helpful?",
      choices: [
        "It saves fuel at all altitudes",
        "It improves the range of radio communication, radar coverage and visibility of landmarks",
        "It is required by regulation",
        "It eliminates the need to contact ATC",
      ],
      answer: 1,
      explanation:
        "VHF radio, navaid reception and radar coverage are line-of-sight, so altitude extends their range and lets you see more landmarks. It does not replace asking ATC for help.",
      subject: "Navigation",
      reference: "PHAK Ch. 16",
    }),
    q({
      id: "vfr.pilotage.q6",
      kind: "tf",
      prompt: "True or false: a VOR CDI indication depends on the airplane's heading.",
      choices: ["True", "False"],
      answer: 1,
      explanation:
        "False. The VOR shows position relative to the selected radial regardless of heading. Heading only affects whether the needle 'senses' correctly — flying with the heading roughly matching the OBS course avoids reverse sensing.",
      subject: "Navigation",
      reference: "PHAK Ch. 16",
    }),
  ],
  practice: [
    link("/simulator?scenario=vfr-xc", "VFR cross-country"),
    link("/navigation", "Navigation tools"),
    link("/avionics", "VOR and GPS in the avionics lab"),
  ],
};
