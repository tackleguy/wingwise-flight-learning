import type { Module } from "../types";
import {
  caution,
  check,
  diagram,
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

export const aerodynamics: Module = {
  id: "aerodynamics",
  number: 4,
  title: "Aerodynamics",
  summary:
    "Stalls and spins, load factor in turns, stability, left-turning tendencies, ground effect and how density altitude changes performance.",
  lessons: [
    {
      id: "vfr.aerodynamics.1",
      title: "Stalls and Spins",
      minutes: 10,
      objectives: [
        "Explain why a wing stalls and recognize the warning signs",
        "Recover from a stall using the FAA-recommended procedure",
        "Describe the conditions that lead to a spin and the PARE recovery",
      ],
      blocks: [
        h("What a stall really is"),
        p(
          "A stall is an aerodynamic condition in which the wing exceeds its critical angle of attack and the airflow can no longer follow the upper surface. The flow separates, lift drops sharply and drag rises. Most light-airplane wings stall somewhere around 16–20° angle of attack, but the exact number does not matter as much as the principle: the stall is about angle of attack, and it can happen at any airspeed, attitude or power setting.",
        ),
        diagram(
          "stall-aoa",
          "As angle of attack increases, the separation point creeps forward on the upper surface. Past the critical angle, lift collapses.",
        ),
        h("Recognizing an approaching stall"),
        ul(
          "Stall warning horn or light (typically activates 5–10 knots above the stall)",
          "Mushy, less effective controls",
          "Buffeting as separated air strikes the tail",
          "High nose attitude and decreasing airspeed",
          "Change in sound — quieter airflow",
        ),
        h("Stall recovery"),
        p(
          "The FAA's stall recovery template (AFH Ch. 5) puts angle of attack first because that is the cause. Power alone will not cure a stall if the wing is still beyond its critical angle.",
        ),
        ol(
          "Disconnect the autopilot (if engaged).",
          "Pitch nose-down to reduce angle of attack until the stall warning stops.",
          "Roll wings level.",
          "Add power as needed.",
          "Retract speed brakes or spoilers (if equipped).",
          "Return to the desired flight path.",
        ),
        check({
          id: "vfr.aerodynamics.1.k1",
          kind: "mc",
          prompt: "What is the FIRST and most important action in recovering from a stall?",
          choices: [
            "Add full power",
            "Level the wings with aileron",
            "Reduce the angle of attack",
            "Apply opposite rudder",
          ],
          answer: 2,
          explanation:
            "The stall is caused by exceeding the critical angle of attack, so reducing AOA is the only thing that actually breaks the stall. Adding power helps minimize altitude loss but does not unstall a wing that is still above its critical AOA.",
          subject: "Aerodynamics",
          reference: "AFH Ch. 5",
        }),
        h("Wing design and stall progression"),
        p(
          "Wings are usually designed so the root stalls before the tip — through washout (twist that gives the tip a lower angle of incidence), stall strips on the inboard leading edge, or slots near the tip. That keeps the ailerons effective as the stall begins and gives the pilot buffet warning from the separated air hitting the tail.",
        ),
        h("Spins"),
        p(
          "A spin is an aggravated stall that results in autorotation: the airplane descends in a corkscrew path. Two ingredients are required: the wing must be stalled, and there must be yaw. In a spin one wing is more deeply stalled than the other. Uncoordinated flight at low airspeed — particularly skidding with too much rudder on the base-to-final turn — is the classic spin entry. PARE (below) is the general recovery; your airplane's POH procedure takes precedence, and many airplanes are placarded against intentional spins.",
        ),
        table(
          ["PARE step", "Action"],
          [
            ["P — Power", "Reduce to idle"],
            ["A — Ailerons", "Neutral"],
            ["R — Rudder", "Full opposite the direction of rotation"],
            [
              "E — Elevator",
              "Briskly forward to break the stall; when rotation stops, neutralize rudder and recover from the dive",
            ],
          ],
        ),
        warning(
          "Base-to-final skid",
          "Overshooting final and adding inside rudder to tighten the turn creates a skid. If the airplane stalls in a skid, the inside wing drops sharply and the airplane can enter an incipient spin far too low to recover. Shallow the bank, accept the overshoot and go around if needed.",
        ),
        practice(
          "/simulator?scenario=vfr-stall",
          "Stall recognition and recovery",
          "Practice power-off and power-on stalls and the recovery template.",
        ),
      ],
    },
    {
      id: "vfr.aerodynamics.2",
      title: "Turns and Load Factor",
      minutes: 10,
      objectives: [
        "Explain what makes an airplane turn",
        "Calculate load factor and stall speed in a level turn",
        "Know the load limits for normal, utility and aerobatic category airplanes",
      ],
      blocks: [
        h("What makes an airplane turn"),
        p(
          "When you bank, lift tilts with the wings. Part of it still acts upward (the vertical component) and part acts sideways toward the center of the turn (the horizontal component). The horizontal component of lift is what turns the airplane. Because the vertical component is now smaller, you must increase total lift — with back pressure and higher angle of attack — to hold altitude.",
        ),
        h("Load factor"),
        p(
          "Load factor is the ratio of the total load the wings support to the airplane's weight, expressed in G. In a level, coordinated turn it depends only on bank angle: load factor = 1 ÷ cos(bank). It does not depend on airspeed or airplane type.",
        ),
        diagram(
          "load-factor",
          "Load factor rises slowly at shallow bank angles and very rapidly beyond 45°. At 60° bank it is 2 G; at 80° it is almost 6 G.",
        ),
        table(
          ["Bank angle", "Load factor (G)", "Stall speed increase"],
          [
            ["0°", "1.0", "0%"],
            ["30°", "1.15", "About 7%"],
            ["45°", "1.41", "About 19%"],
            ["60°", "2.0", "About 41%"],
            ["75°", "3.86", "About 96%"],
          ],
        ),
        p(
          "Stall speed rises with the square root of the load factor. An airplane that stalls at 50 knots in level flight stalls at about 50 × √2 ≈ 71 knots in a 60° level turn. This is why steep turns at low airspeed are dangerous.",
        ),
        check({
          id: "vfr.aerodynamics.2.k1",
          kind: "calc",
          prompt:
            "An airplane weighing 2,400 lb is in a level, coordinated 60° banked turn. What total load must the wings support?",
          choices: ["2,400 lb", "3,384 lb", "4,800 lb", "7,200 lb"],
          answer: 2,
          explanation:
            "At 60° bank the load factor is 2.0 G, so 2,400 × 2 = 4,800 lb. 3,384 lb would be the result for a 45° bank (1.41 G).",
          subject: "Aerodynamics",
          reference: "PHAK Ch. 5",
        }),
        h("Category load limits"),
        table(
          ["Category", "Positive limit", "Negative limit"],
          [
            ["Normal", "+3.8 G", "−1.52 G"],
            ["Utility", "+4.4 G", "−1.76 G"],
            ["Aerobatic", "+6.0 G", "−3.0 G"],
          ],
        ),
        h("Maneuvering speed (VA)"),
        p(
          "Below design maneuvering speed, the airplane will stall before it can exceed its limit load factor from a single full, abrupt control deflection or a strong gust. VA decreases as weight decreases because a lighter airplane needs less lift to reach the same load factor. Note that VA does not protect against multiple or alternating full control inputs, which can still overstress the structure.",
        ),
        caution(
          "Turbulence",
          "In moderate or greater turbulence, slow to or below VA (or the POH turbulent air penetration speed) and stay out of the yellow arc.",
        ),
        practice(
          "/simulator?scenario=vfr-turns-climbs",
          "Steep turns",
          "Fly 45° steep turns and notice the back pressure and power needed to hold altitude.",
        ),
      ],
    },
    {
      id: "vfr.aerodynamics.3",
      title: "Stability, Left-Turning Tendencies and Density Altitude",
      minutes: 11,
      objectives: [
        "Describe static and dynamic stability and the effect of CG position",
        "Identify the four left-turning tendencies",
        "Explain ground effect and how density altitude affects performance",
      ],
      blocks: [
        h("Stability"),
        p(
          "Static stability is the airplane's initial tendency after being disturbed: positive (returns toward the original attitude), neutral (stays in the new attitude) or negative (keeps moving away). Dynamic stability describes what happens over time — whether the oscillations die out, continue or grow. Training airplanes are designed with positive static and positive dynamic stability in pitch.",
        ),
        table(
          ["CG position", "Effect"],
          [
            [
              "Forward CG",
              "More stable; higher stall speed; lower cruise speed; heavier elevator forces; may lack elevator authority to flare",
            ],
            [
              "Aft CG",
              "Less stable; lower stall speed; slightly faster cruise; light controls; stall and spin recovery can be difficult or impossible beyond the aft limit",
            ],
          ],
        ),
        h("Left-turning tendencies"),
        p(
          "In single-engine airplanes whose propeller turns clockwise as seen from the cockpit, four effects make the nose want to go left, especially at high power and low airspeed such as on takeoff and climb. You counter them with right rudder.",
        ),
        ul(
          "Torque: the engine turns the propeller clockwise, so the airplane tends to roll left (Newton's third law).",
          "Spiraling slipstream: the propeller's corkscrewing airflow strikes the left side of the vertical tail, yawing the nose left.",
          "Gyroscopic precession: when the tail is raised in a tailwheel airplane, the force on the spinning propeller acts 90° later, yawing the nose left.",
          "P-factor (asymmetric thrust): at high angles of attack the descending right blade has a higher angle of attack and produces more thrust than the ascending left blade, yawing the nose left.",
        ),
        h("Ground effect"),
        p(
          "Within about one wingspan of the surface, the ground interferes with the wingtip vortices and downwash. Induced drag falls and the wing produces more lift at a given angle of attack. Effects are most noticeable within half a wingspan. An airplane may become airborne in ground effect below the speed it needs to climb out of it — the soft-field technique exploits this deliberately — and it floats in ground effect when landing too fast.",
        ),
        h("Density altitude"),
        p(
          "Density altitude is pressure altitude corrected for nonstandard temperature. It is the altitude in the standard atmosphere where the air density equals what you actually have. High density altitude means thin air: the wings make less lift, the propeller less thrust and a normally aspirated engine less power. Takeoff roll is longer and climb rate is lower.",
        ),
        diagram(
          "density-altitude",
          "Raise temperature, elevation or humidity and density altitude goes up — and performance goes down.",
        ),
        ul(
          "Pressure altitude ≈ field elevation + (29.92 − altimeter setting) × 1,000 ft.",
          "Standard temperature is 15°C at sea level, decreasing about 2°C per 1,000 ft.",
          "Rule of thumb: density altitude ≈ pressure altitude + 120 ft × (OAT − standard temperature in °C).",
          "High, hot and humid all increase density altitude; humid air is less dense than dry air.",
        ),
        check({
          id: "vfr.aerodynamics.3.k1",
          kind: "calc",
          context:
            "Field elevation 5,000 ft, altimeter setting 29.92 in Hg, outside air temperature 30°C.",
          prompt: "Using the rule of thumb, what is the approximate density altitude?",
          choices: ["5,000 ft", "6,800 ft", "8,000 ft", "9,500 ft"],
          answer: 2,
          explanation:
            "Pressure altitude is 5,000 ft (altimeter 29.92). Standard temperature at 5,000 ft is 15 − 10 = 5°C. The difference is 25°C × 120 ft = 3,000 ft, so DA ≈ 8,000 ft. Forgetting to adjust standard temperature for altitude (using 15°C) gives the tempting but wrong 6,800 ft.",
          subject: "Performance",
          reference: "PHAK Ch. 11",
        }),
        tip(
          "Use the POH charts",
          "Rules of thumb are for awareness. For actual takeoff and climb planning, use the POH performance charts with pressure altitude and temperature, and add a generous safety margin.",
        ),
      ],
    },
  ],
  flashcards: [
    {
      id: "vfr.aerodynamics.fc1",
      front: "Cause of every stall",
      back: "Exceeding the critical angle of attack.",
    },
    {
      id: "vfr.aerodynamics.fc2",
      front: "PARE",
      back: "Spin recovery: Power idle, Ailerons neutral, Rudder opposite rotation, Elevator forward.",
    },
    {
      id: "vfr.aerodynamics.fc3",
      front: "Load factor in a 60° level turn",
      back: "2 G; stall speed increases about 41%.",
    },
    {
      id: "vfr.aerodynamics.fc4",
      front: "Normal category limit load factors",
      back: "+3.8 G and −1.52 G.",
    },
    {
      id: "vfr.aerodynamics.fc5",
      front: "Four left-turning tendencies",
      back: "Torque, spiraling slipstream, gyroscopic precession and P-factor.",
    },
    {
      id: "vfr.aerodynamics.fc6",
      front: "Effect of high density altitude",
      back: "Longer takeoff roll, reduced climb rate, less engine power and propeller efficiency.",
    },
  ],
  quiz: [
    q({
      id: "vfr.aerodynamics.q1",
      kind: "mc",
      prompt: "In what flight condition must an airplane be placed to spin?",
      choices: [
        "Partially stalled with one wing low",
        "In a steep diving spiral",
        "Stalled",
        "In a high-speed skid",
      ],
      answer: 2,
      explanation:
        "A spin requires a stall plus yaw. Without a stall there is no spin — a steep diving spiral is unstalled and has rapidly increasing airspeed, which is a different situation with a different recovery.",
      subject: "Aerodynamics",
      reference: "PHAK Ch. 5; AFH Ch. 5",
    }),
    q({
      id: "vfr.aerodynamics.q2",
      kind: "mc",
      prompt: "What determines the load factor in a level, coordinated turn?",
      choices: ["Airspeed", "Rate of turn", "Angle of bank", "Gross weight"],
      answer: 2,
      explanation:
        "In a level coordinated turn, load factor = 1/cos(bank) regardless of airspeed, rate of turn or airplane type. Rate of turn depends on both bank and airspeed, which makes it tempting, but load factor depends on bank alone.",
      subject: "Aerodynamics",
      reference: "PHAK Ch. 5",
    }),
    q({
      id: "vfr.aerodynamics.q3",
      kind: "calc",
      prompt:
        "An airplane stalls at 52 knots in level flight. Approximately what is its stall speed in a level 60° bank?",
      choices: ["56 knots", "62 knots", "74 knots", "104 knots"],
      answer: 2,
      explanation:
        "Stall speed increases with the square root of load factor. At 60° the load factor is 2, √2 ≈ 1.41, so 52 × 1.41 ≈ 73–74 knots. Doubling to 104 knots is the trap — stall speed does not double when load factor doubles.",
      subject: "Aerodynamics",
      reference: "PHAK Ch. 5",
    }),
    q({
      id: "vfr.aerodynamics.q4",
      kind: "mc",
      prompt: "What is an effect of a forward center of gravity?",
      choices: [
        "Lower stall speed",
        "Lighter elevator control forces",
        "Reduced longitudinal stability",
        "Higher stall speed and lower cruise speed",
      ],
      answer: 3,
      explanation:
        "With a forward CG the tail must push down harder, effectively adding weight, so stall speed rises and cruise speed falls. Forward CG makes the airplane MORE stable and the elevator heavier — the other choices describe an aft CG.",
      subject: "Weight & Balance",
      reference: "PHAK Ch. 10",
    }),
    q({
      id: "vfr.aerodynamics.q5",
      kind: "mc",
      prompt: "P-factor causes a left-turning tendency most pronounced when the airplane is:",
      choices: [
        "At low airspeed, high angle of attack and high power",
        "At high airspeed and low angle of attack",
        "Gliding at idle",
        "In straight-and-level cruise",
      ],
      answer: 0,
      explanation:
        "P-factor comes from the descending blade meeting the air at a higher AOA than the ascending blade, which happens at high airplane angles of attack with high power — classic climb conditions. In cruise or at idle the asymmetry is small.",
      subject: "Aerodynamics",
      reference: "PHAK Ch. 5",
    }),
    q({
      id: "vfr.aerodynamics.q6",
      kind: "tf",
      prompt:
        "True or false: ground effect reduces induced drag and can allow an airplane to become airborne before reaching the speed needed to climb.",
      choices: ["True", "False"],
      answer: 0,
      explanation:
        "True. Ground effect restricts the wingtip vortices and downwash, reducing induced drag. An airplane that lifts off prematurely may settle back to the runway when it climbs out of ground effect.",
      subject: "Aerodynamics",
      reference: "PHAK Ch. 5",
    }),
    q({
      id: "vfr.aerodynamics.q7",
      kind: "mc",
      prompt: "Which combination results in the HIGHEST density altitude?",
      choices: [
        "Low elevation, low temperature, low humidity",
        "High elevation, high temperature, high humidity",
        "Low elevation, high temperature, low humidity",
        "High elevation, low temperature, high humidity",
      ],
      answer: 1,
      explanation:
        "High, hot and humid all reduce air density. Many pilots forget humidity: moist air is lighter than dry air, so it raises density altitude too.",
      subject: "Performance",
      reference: "PHAK Ch. 4",
    }),
    q({
      id: "vfr.aerodynamics.q8",
      kind: "mc",
      prompt: "How does maneuvering speed (VA) change as gross weight decreases?",
      choices: ["It increases", "It is unrelated to weight", "It stays the same", "It decreases"],
      answer: 3,
      explanation:
        "A lighter airplane reaches the limit load factor at a lower speed, because it needs less lift to produce the same G. So VA decreases as weight decreases — the opposite of what many pilots assume.",
      subject: "Aerodynamics",
      reference: "PHAK Ch. 5",
    }),
  ],
  practice: [
    link("/simulator?scenario=vfr-stall", "Stalls"),
    link("/simulator?scenario=vfr-slow-flight", "Slow flight"),
    link("/simulator?scenario=vfr-turns-climbs", "Steep turns"),
  ],
};
