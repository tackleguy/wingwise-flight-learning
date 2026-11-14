import type { Module } from "../types";
import {
  caution,
  check,
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
  warning,
} from "../builders";

export const emergencies: Module = {
  id: "emergencies",
  number: 16,
  title: "Emergency Procedures",
  summary:
    "Engine failures and forced landings, fires, electrical and vacuum failures, inadvertent flight into IMC, and how to get help from ATC.",
  lessons: [
    {
      id: "vfr.emergencies.1",
      title: "Engine Failure and Forced Landings",
      minutes: 11,
      objectives: [
        "Apply the ABCDE flow after an engine failure",
        "Select a suitable forced-landing site",
        "Respond correctly to an engine failure after takeoff and to fires",
      ],
      blocks: [
        h("First, fly the airplane"),
        p(
          "Most emergencies become accidents because the pilot stops flying the airplane while dealing with the problem. The universal priority is Aviate, Navigate, Communicate — in that order. After an engine failure, the first action is always to establish the best glide speed, which gives the greatest distance for the altitude you have.",
        ),
        table(
          ["Step", "Action"],
          [
            ["A — Airspeed", "Pitch for best glide speed (VG) and trim for it"],
            [
              "B — Best field",
              "Pick a landing site within gliding distance, preferably into the wind",
            ],
            [
              "C — Checklist",
              "Restart checklist: fuel selector/tank, fuel pump, mixture rich, carb heat on, magnetos, primer locked",
            ],
            ["D — Declare", "Mayday on the current frequency or 121.5; squawk 7700"],
            [
              "E — Execute",
              "Secure the engine (fuel off, mixture idle cutoff, magnetos off), flaps as needed, unlatch doors, master off before touchdown per the POH",
            ],
          ],
        ),
        h("Choosing a field"),
        ul(
          "Within easy gliding range — pick a field you can definitely reach, not the best field you might reach.",
          "Into the wind to reduce groundspeed at touchdown.",
          "Long and smooth enough: plowed fields along the furrows, pastures, roads only if free of wires and traffic.",
          "Free of obstacles on approach — watch for power lines, which are hard to see; look for the poles.",
        ),
        tip(
          "Aim for a key position",
          "Plan to arrive at a point abeam the touchdown area at about normal pattern altitude (a 'high key'/'low key' technique), then fly a normal pattern. Extending flaps is easy; stretching a glide is impossible.",
        ),
        h("Engine failure after takeoff"),
        p(
          "If the engine fails shortly after takeoff, lower the nose immediately to maintain airspeed and land generally straight ahead, with only small changes in direction to avoid obstacles. Turning back to the runway — 'the impossible turn' — requires far more altitude than most pilots expect and has caused many fatal stall/spin accidents. Know in advance at what altitude, in your airplane, a turnback is even possible.",
        ),
        check({
          id: "vfr.emergencies.1.k1",
          kind: "scenario",
          context:
            "At 400 ft AGL after takeoff, the engine stops. There are fields ahead and slightly to the left.",
          prompt: "What is the best action?",
          choices: [
            "Turn back to the runway immediately",
            "Hold the climb attitude while attempting a restart",
            "Lower the nose to glide speed and land in a field ahead",
            "Bank steeply to return to the departure end",
          ],
          answer: 2,
          explanation:
            "At 400 ft there is no time for a safe turnback, and holding the climb attitude will cause a stall within seconds. Pitch for glide speed and land ahead within a small arc.",
          subject: "Emergency Procedures",
          reference: "AFH Ch. 18",
        }),
        h("Fires"),
        table(
          ["Fire", "Typical POH actions"],
          [
            [
              "Engine fire in flight",
              "Mixture idle cutoff, fuel selector off, master switch off, cabin heat and air off, establish a high-speed descent to try to extinguish, and plan a forced landing",
            ],
            [
              "Electrical fire in flight",
              "Master switch off, cabin heat and air vents off, use the fire extinguisher, then ventilate the cabin once the fire is out; restore only essential electrical circuits",
            ],
            [
              "Engine fire during start",
              "Continue cranking to draw the fire into the engine; if it persists, follow the POH and evacuate",
            ],
          ],
        ),
        warning(
          "Use your POH checklist",
          "These summaries show typical logic. Every airplane's procedures differ — the POH emergency checklist is the authority, and memory items should be practiced until automatic.",
        ),
        practice(
          "/simulator?scenario=emg-engine-failure",
          "Engine failure",
          "Practice best-glide, field selection and the restart checklist from altitude.",
        ),
      ],
    },
    {
      id: "vfr.emergencies.2",
      title: "Systems Failures, Inadvertent IMC and Getting Help",
      minutes: 10,
      objectives: [
        "Respond to electrical, vacuum and pitot-static failures",
        "Escape inadvertent instrument meteorological conditions",
        "Use ATC, 121.5 MHz and transponder codes to obtain assistance",
      ],
      blocks: [
        h("Systems failures"),
        ul(
          "Alternator failure: ammeter discharge or low-voltage warning. Turn off nonessential electrical equipment, keep a radio, and land as soon as practical.",
          "Vacuum failure: low suction gauge, attitude and heading indicators slowly tumbling or drifting. Cover them and fly by outside references (VFR) or the remaining instruments.",
          "Pitot ice or blockage: turn on pitot heat; cross-check airspeed with known pitch and power settings.",
          "Rough-running engine: check carb heat, mixture, fuel selector and magnetos; land at the nearest suitable airport.",
        ),
        h("Inadvertent flight into IMC"),
        p(
          "VFR flight into instrument meteorological conditions is one of the deadliest scenarios in general aviation. Without outside references, a non-instrument-rated pilot can become spatially disoriented within seconds to minutes. The way out is to transition to instruments, keep the wings level, and make a gentle, standard-rate 180° turn back to the conditions you just left.",
        ),
        ol(
          "Believe the instruments, not your body. Keep the wings level on the attitude indicator.",
          "Maintain altitude and airspeed; do not make abrupt control inputs.",
          "Make a standard-rate turn (shallow bank) of 180° back toward VMC.",
          "Ask ATC for help — they can provide headings, altitude information and the nearest VFR weather.",
          "Once in VMC, land at the nearest suitable airport and let the experience go.",
        ),
        caution(
          "Don't let the turn become a spiral",
          "A disoriented pilot's turn can tighten into a graveyard spiral. Keep the bank shallow — about 15°–20° in a light airplane — and watch the altimeter and airspeed.",
        ),
        check({
          id: "vfr.emergencies.2.k1",
          kind: "mc",
          prompt: "A VFR pilot inadvertently enters clouds. What is the recommended first action?",
          choices: [
            "Descend rapidly to find the ground",
            "Climb steeply to get above the clouds",
            "Transition to the flight instruments, keep the wings level and make a shallow 180° turn",
            "Continue on course and hope it clears",
          ],
          answer: 2,
          explanation:
            "Control first: get on the instruments, level the wings, then turn back with a shallow standard-rate turn. Rapid descents and steep climbs are how disoriented pilots lose control or hit terrain.",
          subject: "Emergency Procedures",
          reference: "AFH Ch. 18",
        }),
        h("Getting help"),
        table(
          ["Tool", "Use"],
          [
            [
              "121.5 MHz",
              "International VHF emergency frequency, monitored by many ATC facilities, Flight Service and airliners",
            ],
            ["Squawk 7700", "Alerts every radar facility that you have an emergency"],
            [
              "'Mayday' / 'Pan-pan'",
              "Mayday (spoken three times) for distress; Pan-pan for urgency",
            ],
            ["ELT", "Emergency locator transmitter; 406 MHz units are detected by satellites"],
          ],
        ),
        info(
          "Emergency authority",
          "In an in-flight emergency requiring immediate action, the PIC may deviate from any rule of Part 91 to the extent required (91.3(b)). If you do, you must send a written report to the FAA if requested (91.3(c)). If ATC gives you priority, you may be asked to submit a report within 48 hours (91.123(d)).",
        ),
        tip(
          "Declare early",
          "Declaring an emergency costs you nothing and gives you priority, extra help and the authority to deviate from rules. Pilots who delay declaring often run out of options.",
        ),
        practice(
          "/simulator?scenario=emg-weather",
          "Inadvertent IMC",
          "Practice a 180° escape turn on instruments after entering cloud.",
        ),
      ],
    },
  ],
  flashcards: [
    {
      id: "vfr.emergencies.fc1",
      front: "First action after engine failure",
      back: "Establish best glide speed (VG).",
    },
    {
      id: "vfr.emergencies.fc2",
      front: "ABCDE",
      back: "Airspeed, Best field, Checklist, Declare, Execute.",
    },
    { id: "vfr.emergencies.fc3", front: "Emergency frequency", back: "121.5 MHz." },
    {
      id: "vfr.emergencies.fc4",
      front: "Engine failure at low altitude after takeoff",
      back: "Lower the nose and land generally straight ahead; avoid the 'impossible turn'.",
    },
    {
      id: "vfr.emergencies.fc5",
      front: "Escape from inadvertent IMC",
      back: "Wings level on instruments, then a shallow standard-rate 180° turn; ask ATC for help.",
    },
    {
      id: "vfr.emergencies.fc6",
      front: "PIC emergency authority",
      back: "May deviate from Part 91 to the extent required (91.3(b)); written report on request.",
    },
  ],
  quiz: [
    q({
      id: "vfr.emergencies.q1",
      kind: "mc",
      prompt: "Why should a pilot use best glide speed after an engine failure?",
      choices: [
        "It provides the lowest rate of descent",
        "It provides the greatest distance for altitude lost",
        "It is the speed required by regulation",
        "It prevents carburetor icing",
      ],
      answer: 1,
      explanation:
        "VG gives the best glide ratio — the most distance per foot of altitude. Minimum sink speed (slower) gives the lowest descent rate and maximum time aloft, but less distance.",
      subject: "Emergency Procedures",
      reference: "AFH Ch. 18",
    }),
    q({
      id: "vfr.emergencies.q2",
      kind: "mc",
      prompt: "Which frequency is the international VHF emergency frequency?",
      choices: ["122.2 MHz", "121.5 MHz", "123.45 MHz", "122.8 MHz"],
      answer: 1,
      explanation:
        "121.5 MHz is the emergency frequency. 122.2 is a common Flight Service frequency and 122.8 is a common UNICOM/CTAF.",
      subject: "Radio & ATC",
      reference: "AIM 6-3-1",
    }),
    q({
      id: "vfr.emergencies.q3",
      kind: "scenario",
      context:
        "Smoke and the smell of burning insulation fill the cabin in cruise. The engine is running normally.",
      prompt: "What is the most likely problem and first action?",
      choices: [
        "Engine fire — mixture to idle cutoff",
        "Carburetor icing — apply carb heat",
        "Electrical fire — master switch off",
        "Exhaust leak — open the cabin heat",
      ],
      answer: 2,
      explanation:
        "Burning-insulation smell with a normally running engine points to an electrical fire; turn off the master switch to remove power, then follow the POH. Cutting off the mixture would stop a healthy engine, and opening the cabin heat could bring in carbon monoxide or feed a fire.",
      subject: "Emergency Procedures",
      reference: "AFH Ch. 18",
    }),
    q({
      id: "vfr.emergencies.q4",
      kind: "mc",
      prompt: "When choosing a field for a forced landing, it is generally best to land:",
      choices: [
        "Downwind to stretch the glide",
        "Across the furrows of a plowed field",
        "Into the wind on a field within easy gliding distance",
        "On the nearest highway regardless of traffic",
      ],
      answer: 2,
      explanation:
        "Landing into the wind reduces groundspeed and ground roll. Landing downwind increases touchdown speed, and landing across furrows can flip the airplane.",
      subject: "Emergency Procedures",
      reference: "AFH Ch. 18",
    }),
    q({
      id: "vfr.emergencies.q5",
      kind: "tf",
      prompt:
        "True or false: a pilot who deviates from a rule during an emergency must send a written report to the FAA only if requested.",
      choices: ["True", "False"],
      answer: 0,
      explanation:
        "True. 91.3(c) requires a written report of the deviation to the Administrator upon request.",
      subject: "Regulations",
      reference: "14 CFR 91.3",
    }),
    q({
      id: "vfr.emergencies.q6",
      kind: "mc",
      prompt: "A VFR pilot who loses two-way radio communications should:",
      choices: [
        "Squawk 7700 and continue to the destination using IFR rules",
        "Climb to the MEA",
        "Squawk 7500 and circle until contacted",
        "Squawk 7600, continue VFR and land as soon as practicable",
      ],
      answer: 3,
      explanation:
        "91.185(b): if the failure occurs in VFR conditions, or VFR conditions are encountered, continue the flight under VFR and land as soon as practicable. 7600 alerts ATC. 7500 is the hijack code.",
      subject: "Radio & ATC",
      reference: "14 CFR 91.185(b)",
    }),
    q({
      id: "vfr.emergencies.q7",
      kind: "mc",
      prompt:
        "During an inadvertent IMC encounter, which bank angle is appropriate for the 180° turn in a light airplane?",
      choices: [
        "About 45°",
        "About 60°",
        "A shallow, roughly standard-rate bank of about 15°–20°",
        "Whatever turns the airplane fastest",
      ],
      answer: 2,
      explanation:
        "A shallow, standard-rate turn minimizes altitude loss and disorientation. Steep banks increase the load factor and the risk of a graveyard spiral.",
      subject: "Emergency Procedures",
      reference: "AFH Ch. 18",
    }),
  ],
  practice: [
    link("/simulator?scenario=emg-engine-failure", "Engine failure"),
    link("/simulator?scenario=emg-electrical", "Electrical failure"),
    link("/simulator?scenario=emg-vacuum", "Vacuum failure"),
    link("/simulator?scenario=emg-weather", "Inadvertent IMC"),
    link("/simulator?scenario=emg-radio", "Radio failure"),
  ],
};
