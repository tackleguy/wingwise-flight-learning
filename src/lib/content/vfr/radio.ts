import type { Module } from "../types";
import {
  caution,
  check,
  diagram,
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
} from "../builders";

export const radio: Module = {
  id: "radio",
  number: 11,
  title: "Radio Communications",
  summary:
    "Phraseology, the phonetic alphabet, making clear calls to ATC and on CTAF, transponder codes, light gun signals and what to do if the radio fails.",
  lessons: [
    {
      id: "vfr.radio.1",
      title: "Phraseology and Radio Technique",
      minutes: 9,
      objectives: [
        "Use the phonetic alphabet and standard number pronunciation",
        "Structure an initial call: who, who, where, what",
        "Read back clearances and instructions correctly",
      ],
      blocks: [
        h("Why standard phraseology matters"),
        p(
          "A busy frequency is shared by dozens of pilots and a controller. Standard words, spoken in a standard order, reduce misunderstandings and save time. The AIM Pilot/Controller Glossary defines what each phrase means — 'roger' means 'I received your last transmission', not 'yes'; 'wilco' means 'I have received your message, understand it and will comply'.",
        ),
        table(
          ["Letter", "Word", "Letter", "Word"],
          [
            ["A", "Alfa", "N", "November"],
            ["B", "Bravo", "O", "Oscar"],
            ["C", "Charlie", "P", "Papa"],
            ["D", "Delta", "Q", "Quebec"],
            ["E", "Echo", "R", "Romeo"],
            ["F", "Foxtrot", "S", "Sierra"],
            ["G", "Golf", "T", "Tango"],
            ["H", "Hotel", "U", "Uniform"],
            ["I", "India", "V", "Victor"],
            ["J", "Juliett", "W", "Whiskey"],
            ["K", "Kilo", "X", "X-ray"],
            ["L", "Lima", "Y", "Yankee"],
            ["M", "Mike", "Z", "Zulu"],
          ],
        ),
        h("Numbers"),
        ul(
          "Say each digit separately for headings, frequencies, codes and runway numbers: 'heading zero niner zero', 'squawk four two one five'.",
          "Altitudes: 'one zero thousand five hundred' for 10,500; 'three thousand five hundred' for 3,500; flight levels: 'flight level one eight zero'.",
          "Frequencies: 'one one niner point one'. Nine is spoken 'niner' to avoid confusion with the German 'nein'.",
          "Time is in UTC (Zulu) using the 24-hour clock.",
        ),
        h("The initial call"),
        p(
          "Before you key the mic, listen to make sure you won't step on someone, and know what you are going to say. A good initial call answers four questions: who you are calling, who you are, where you are, and what you want. Add the ATIS code if there is one.",
        ),
        info(
          "Example",
          "'Riverside Tower, Cessna Four Seven Two Papa Kilo, eight miles south, three thousand five hundred, inbound for landing with information Charlie.'",
        ),
        p(
          "After the controller abbreviates your call sign — for example to 'Cessna Two Papa Kilo' — you may use the abbreviated form too, but not before. End readbacks with your call sign so the controller knows who is acknowledging.",
        ),
        caution(
          "Read back hold-short instructions",
          "You must read back all runway hold-short instructions. It is also good practice to read back runway assignments, altitudes, headings, frequencies and transponder codes.",
        ),
        check({
          id: "vfr.radio.1.k1",
          kind: "mc",
          prompt: "How should a pilot state an altitude of 4,500 ft MSL?",
          choices: [
            "'Four point five'",
            "'Forty-five hundred'",
            "'Four thousand five hundred'",
            "'Four five zero zero'",
          ],
          answer: 2,
          explanation:
            "Altitudes below 18,000 ft are spoken in thousands and hundreds: 'four thousand five hundred'. 'Forty-five hundred' is common in casual speech but is not the AIM phraseology.",
          subject: "Radio & ATC",
          reference: "AIM 4-2-9",
        }),
        exercise("radio-phraseology", "Build correct radio calls for common situations"),
        tip(
          "Think, then talk",
          "If you are unsure what to say, it is fine to wait a moment and plan the call. Short, clear calls get better responses than long, rambling ones.",
        ),
      ],
    },
    {
      id: "vfr.radio.2",
      title: "ATC Services, CTAF, Transponder Codes and Light Signals",
      minutes: 11,
      objectives: [
        "Use ATIS, ground, tower, approach/departure and flight following",
        "Self-announce at non-towered airports",
        "Know the special transponder codes and interpret light gun signals",
        "Handle a radio failure at a towered airport",
      ],
      blocks: [
        h("Who you talk to"),
        table(
          ["Facility", "Purpose"],
          [
            [
              "ATIS / AWOS / ASOS",
              "Recorded weather, runway in use and NOTAMs; listen before contacting ground or approach",
            ],
            [
              "Clearance delivery",
              "IFR clearances and, at some airports, VFR departure instructions",
            ],
            ["Ground control", "Movement on taxiways and crossing runways"],
            ["Tower", "Takeoff and landing clearances and traffic in the Class D/C/B surface area"],
            [
              "Approach / departure control",
              "Radar services, Class B/C entry and VFR flight following",
            ],
            ["Flight Service (e.g., 122.2)", "Briefings, flight plan activation/closing, PIREPs"],
            [
              "CTAF / UNICOM",
              "Self-announced position reports at airports without an operating tower",
            ],
          ],
        ),
        h("Non-towered airports"),
        p(
          "At an airport without an operating control tower, pilots coordinate with each other on the common traffic advisory frequency (CTAF). The AIM recommends reporting about 10 miles out, entering downwind, on base, on final and when leaving the runway. Begin and end each transmission with the airport name, because several airports may share the same frequency.",
        ),
        info(
          "Example CTAF calls",
          "'Lakeview traffic, Cessna Two Papa Kilo, ten miles north, two thousand five hundred, inbound, landing runway one six, Lakeview.' — 'Lakeview traffic, Cessna Two Papa Kilo, left downwind runway one six, Lakeview.'",
        ),
        h("Transponder codes"),
        table(
          ["Code", "Meaning"],
          [
            ["1200", "VFR (unless ATC assigns a code)"],
            ["7500", "Unlawful interference (hijacking)"],
            ["7600", "Lost radio communications"],
            ["7700", "Emergency"],
          ],
        ),
        tip(
          "Changing codes",
          "When changing codes, avoid inadvertently passing through 7500, 7600 or 7700 — they trigger alarms at ATC facilities.",
        ),
        h("Light gun signals"),
        diagram(
          "light-gun",
          "The tower can signal with a steady or flashing green, red or white light, or alternating red and green.",
        ),
        table(
          ["Signal", "On the ground", "In flight"],
          [
            ["Steady green", "Cleared for takeoff", "Cleared to land"],
            [
              "Flashing green",
              "Cleared to taxi",
              "Return for landing (to be followed by steady green at the proper time)",
            ],
            ["Steady red", "Stop", "Give way to other aircraft and continue circling"],
            ["Flashing red", "Taxi clear of the runway in use", "Airport unsafe — do not land"],
            ["Flashing white", "Return to starting point on the airport", "Not applicable"],
            ["Alternating red and green", "Exercise extreme caution", "Exercise extreme caution"],
          ],
        ),
        exercise("light-gun-signals", "Interpret light gun signals on the ground and in the air"),
        check({
          id: "vfr.radio.2.k1",
          kind: "mc",
          prompt:
            "While on final approach, you receive a flashing red light from the tower. What does it mean?",
          choices: [
            "Give way to other aircraft and continue circling",
            "Airport unsafe — do not land",
            "Return for landing",
            "Exercise extreme caution",
          ],
          answer: 1,
          explanation:
            "Flashing red in flight means the airport is unsafe; do not land. STEADY red in flight means give way and continue circling — the most commonly confused pair.",
          subject: "Radio & ATC",
          reference: "AIM 4-3-13",
        }),
        h("Radio failure at a towered airport"),
        ul(
          "Squawk 7600.",
          "If the receiver has failed, remain outside or above the Class D surface area until you determine the direction and flow of traffic, then join the pattern and watch the tower for light signals.",
          "If only the transmitter has failed, monitor the tower frequency and watch for light signals.",
          "Acknowledge signals in the air by rocking the wings (day) or flashing the landing or navigation lights (night). On the ground, move the ailerons or rudder (day) or flash the landing or navigation lights (night).",
        ),
        practice(
          "/ai-atc",
          "AI ATC",
          "Practice calls to ground, tower and approach with an AI controller that responds like a real one.",
        ),
      ],
    },
  ],
  flashcards: [
    {
      id: "vfr.radio.fc1",
      front: "Four parts of an initial call",
      back: "Who you are calling, who you are, where you are, what you want (+ ATIS code).",
    },
    { id: "vfr.radio.fc2", front: "Squawk 7600", back: "Lost communications." },
    {
      id: "vfr.radio.fc3",
      front: "Steady red light — in flight",
      back: "Give way to other aircraft and continue circling.",
    },
    {
      id: "vfr.radio.fc4",
      front: "Flashing green light — on the ground",
      back: "Cleared to taxi.",
    },
    {
      id: "vfr.radio.fc5",
      front: "'Wilco'",
      back: "I have received your message, understand, and will comply.",
    },
    {
      id: "vfr.radio.fc6",
      front: "Recommended first CTAF report when inbound",
      back: "About 10 miles from the airport.",
    },
  ],
  quiz: [
    q({
      id: "vfr.radio.q1",
      kind: "mc",
      prompt: "A steady green light signal directed at an aircraft on the ground means:",
      choices: [
        "Cleared to taxi",
        "Taxi clear of runway",
        "Return to starting point",
        "Cleared for takeoff",
      ],
      answer: 3,
      explanation:
        "Steady green on the ground is cleared for takeoff; FLASHING green on the ground is cleared to taxi. Flashing white is return to starting point, and flashing red is taxi clear of the runway.",
      subject: "Radio & ATC",
      reference: "AIM 4-3-13",
    }),
    q({
      id: "vfr.radio.q2",
      kind: "mc",
      prompt: "Which transponder code indicates an emergency?",
      choices: ["7500", "7600", "1200", "7700"],
      answer: 3,
      explanation:
        "7700 is the emergency code. 7500 is unlawful interference, 7600 is lost communications and 1200 is VFR.",
      subject: "Radio & ATC",
      reference: "AIM 4-1-20; AIM 6-2-2",
    }),
    q({
      id: "vfr.radio.q3",
      kind: "scenario",
      context:
        "You are on the ramp and tower instructs: 'Cessna Two Papa Kilo, runway three four, taxi via Alpha, hold short of runway two eight.'",
      prompt: "Which readback is required?",
      choices: [
        "'Roger, Two Papa Kilo.'",
        "'Wilco, Two Papa Kilo.'",
        "'Runway three four, taxi via Alpha, hold short runway two eight, Cessna Two Papa Kilo.'",
        "No readback is required for taxi instructions",
      ],
      answer: 2,
      explanation:
        "Hold-short instructions must be read back. 'Roger' or 'Wilco' acknowledges receipt but does not confirm that you understood the hold-short point, so it does not satisfy the requirement.",
      subject: "Radio & ATC",
      reference: "AIM 4-3-18",
    }),
    q({
      id: "vfr.radio.q4",
      kind: "mc",
      prompt: "At a non-towered airport, how should a position report on CTAF begin and end?",
      choices: [
        "With the name of the airport",
        "With your call sign only",
        "With 'Unicom'",
        "With the time in Zulu",
      ],
      answer: 0,
      explanation:
        "Start with '[Airport] traffic' and end with the airport name so pilots at other airports sharing the frequency know which field you mean.",
      subject: "Radio & ATC",
      reference: "AIM 4-1-9",
    }),
    q({
      id: "vfr.radio.q5",
      kind: "scenario",
      context:
        "Your radio has failed completely. You are approaching a Class D airport and want to land.",
      prompt: "What should you do?",
      choices: [
        "Squawk 7700 and land on any runway immediately",
        "Squawk 7600, remain outside or above the Class D until you determine the traffic flow, then join the pattern and watch for light signals",
        "Enter the Class D directly and land without signals",
        "Land at the airport only if a steady red light is shown",
      ],
      answer: 1,
      explanation:
        "That is the AIM procedure for a receiver failure: 7600, stay outside or above until you know the flow, then enter the pattern and look for a steady green. A steady red would mean continue circling, not land.",
      subject: "Radio & ATC",
      reference: "AIM 4-2-13",
    }),
    q({
      id: "vfr.radio.q6",
      kind: "mc",
      prompt: "What is the correct way to say the frequency 119.1?",
      choices: [
        "'One nineteen one'",
        "'Eleven nine decimal one'",
        "'One one niner point one'",
        "'One hundred nineteen point one'",
      ],
      answer: 2,
      explanation:
        "Each digit is spoken separately with 'point' for the decimal: 'one one niner point one'. Grouping digits ('one nineteen') is not standard and invites errors.",
      subject: "Radio & ATC",
      reference: "AIM 4-2-8",
    }),
    q({
      id: "vfr.radio.q7",
      kind: "tf",
      prompt:
        "True or false: 'Roger' is an appropriate way to answer 'yes' to a controller's question.",
      choices: ["True", "False"],
      answer: 1,
      explanation:
        "False. 'Roger' only means 'I have received all of your last transmission'. To answer yes, say 'affirmative'.",
      subject: "Radio & ATC",
      reference: "AIM Pilot/Controller Glossary",
    }),
  ],
  practice: [
    link("/ai-atc", "AI ATC practice"),
    link("/atc", "ATC communications"),
    link("/simulator?scenario=emg-radio", "Radio failure"),
  ],
};
