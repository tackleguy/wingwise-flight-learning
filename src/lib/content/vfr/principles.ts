import type { Module } from "../types";
import {
  caution,
  check,
  diagram,
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

export const principles: Module = {
  id: "principles",
  number: 1,
  title: "Principles of Flight",
  summary:
    "The four forces, how a wing produces lift, angle of attack and the lift equation — the physics every later lesson builds on.",
  lessons: [
    {
      id: "vfr.principles.1",
      title: "The Four Forces",
      minutes: 8,
      objectives: [
        "Name the four forces acting on an airplane in flight and the direction each acts",
        "Explain the balance of forces in steady, unaccelerated flight",
        "Describe what changes when the airplane climbs, descends or accelerates",
      ],
      blocks: [
        h("Four forces, always at work"),
        p(
          "Every moment an airplane is in the air, four forces act on it: lift, weight, thrust and drag. Lift is the upward force produced mostly by the wings. Weight is gravity pulling the airplane toward the center of the earth. Thrust is the forward force produced by the propeller or jet engine. Drag is the rearward, retarding force caused by the airplane moving through the air.",
        ),
        diagram(
          "four-forces",
          "Lift acts perpendicular to the relative wind, weight acts toward the center of the earth, thrust acts along the propeller axis and drag acts parallel to and in the same direction as the relative wind.",
        ),
        p(
          "A precise detail that trips people up: lift is defined as acting perpendicular to the relative wind (the flight path), not straight up toward the sky. Drag acts parallel to the relative wind. In level flight these happen to line up with 'up' and 'back', but in a climb, descent or turn they tilt with the flight path.",
        ),
        h("Equilibrium in steady flight"),
        p(
          "In straight-and-level, unaccelerated flight the forces are in equilibrium: lift equals weight and thrust equals drag. The FAA's Pilot's Handbook (PHAK Ch. 5) states it more completely — the sum of all upward forces equals the sum of all downward forces, and the sum of all forward forces equals the sum of all rearward forces. Equilibrium does not mean the airplane is stopped; it means it is not accelerating. A Cessna cruising at a steady 110 knots is in equilibrium.",
        ),
        table(
          ["Condition", "What the forces are doing"],
          [
            [
              "Straight-and-level, constant speed",
              "Lift = weight, thrust = drag (no acceleration)",
            ],
            [
              "Accelerating in level flight",
              "Thrust momentarily exceeds drag until drag rises to match",
            ],
            [
              "Steady climb",
              "A component of weight acts rearward along the flight path, so more thrust is needed",
            ],
            [
              "Steady descent",
              "A component of weight acts forward along the path, so less thrust is needed",
            ],
          ],
        ),
        h("Changing the balance"),
        p(
          "When you add power in level flight, thrust exceeds drag and the airplane accelerates. As speed increases, drag also increases until thrust and drag balance again at a new, higher speed. If you want to stay level while accelerating, you must reduce angle of attack (lower the nose slightly) because faster airflow produces more lift at the same angle of attack.",
        ),
        p(
          "In a steady climb, the airplane is not accelerating, so the forces still balance — but weight now has a component acting rearward along the flight path. That is why a climb needs more power than level flight at the same airspeed, and why an airplane's climb ability is ultimately limited by excess power or excess thrust.",
        ),
        tip(
          "Pitch and power work together",
          "A useful rule of thumb from the Airplane Flying Handbook: at a given configuration, power plus attitude equals performance. Set a known pitch attitude and power setting and the airplane will settle at a predictable airspeed and vertical speed.",
        ),
        check({
          id: "vfr.principles.1.k1",
          kind: "mc",
          prompt:
            "During straight-and-level flight at a constant airspeed, which statement is true?",
          choices: [
            "Lift equals weight and thrust equals drag",
            "Lift is greater than weight and thrust is greater than drag",
            "Lift equals thrust and weight equals drag",
            "Thrust is greater than drag, which keeps the airplane moving",
          ],
          answer: 0,
          explanation:
            "Constant speed and constant altitude mean no acceleration, so opposing forces balance: lift = weight and thrust = drag. A common misconception is that thrust must exceed drag to keep moving — that would cause acceleration, not steady flight.",
          subject: "Aerodynamics",
          reference: "PHAK Ch. 5",
        }),
        info(
          "Newton and Bernoulli",
          "Lift can be explained by both Bernoulli's principle (faster flow over the curved upper surface means lower pressure) and Newton's third law (the wing deflects air downward, so the air pushes the wing upward). They are complementary descriptions of the same flow, not competing theories.",
        ),
        practice(
          "/simulator?scenario=vfr-turns-climbs",
          "Feel the forces",
          "Fly level, then add power without changing pitch and watch the airplane climb. Then trim for a new airspeed and observe how pitch and power interact.",
        ),
      ],
    },
    {
      id: "vfr.principles.2",
      title: "Airfoils, Angle of Attack and the Lift Equation",
      minutes: 10,
      objectives: [
        "Identify the parts of an airfoil and define chord line and relative wind",
        "Distinguish angle of attack from pitch attitude and angle of incidence",
        "Explain how airspeed, angle of attack, air density and wing area affect lift",
      ],
      blocks: [
        h("Anatomy of an airfoil"),
        p(
          "An airfoil is any surface shaped to produce a useful reaction from the air moving across it — wings, propeller blades and the horizontal tail are all airfoils. The leading edge meets the air first and the trailing edge is where the upper and lower flows rejoin. The chord line is an imaginary straight line from leading edge to trailing edge. Camber is the curvature of the airfoil relative to that line.",
        ),
        p(
          "The relative wind is the direction of the airflow relative to the airfoil. It is always parallel to and opposite the flight path. If the airplane is descending, the relative wind comes up from below; if it is climbing, the relative wind comes slightly from above the horizon.",
        ),
        diagram(
          "airfoil-aoa",
          "Angle of attack is the acute angle between the chord line and the relative wind. Change the pitch and the flight path to see how they differ.",
        ),
        h("Angle of attack is not pitch attitude"),
        p(
          "Angle of attack (AOA) is the angle between the chord line and the relative wind. Pitch attitude is the angle between the airplane's longitudinal axis and the horizon. They are different: an airplane in a nose-high mushing descent can have a modest pitch attitude and a very high angle of attack. Angle of incidence is yet another angle — the fixed angle between the wing's chord line and the airplane's longitudinal axis, set by the manufacturer.",
        ),
        table(
          ["Angle", "Measured between", "Pilot controls it?"],
          [
            [
              "Angle of attack",
              "Chord line and relative wind",
              "Yes — primarily with the elevator",
            ],
            ["Pitch attitude", "Longitudinal axis and the natural horizon", "Yes"],
            ["Angle of incidence", "Chord line and longitudinal axis", "No — fixed by design"],
          ],
        ),
        h("The lift equation"),
        p(
          "Engineers express lift as L = ½ ρ V² S CL, where ρ (rho) is air density, V is true airspeed, S is wing area and CL is the coefficient of lift, which depends mostly on angle of attack and the wing's shape (including flap setting). You will not compute this on a checkride, but it tells you exactly which levers you have.",
        ),
        ul(
          "Airspeed has a squared effect: doubling airspeed produces four times the lift at the same angle of attack.",
          "Angle of attack raises CL roughly in proportion — until the critical angle of attack, where the airflow separates and the wing stalls.",
          "Air density decreases with altitude, heat and humidity, so a wing must fly faster (true airspeed) to produce the same lift on a hot day or at a high-elevation airport.",
          "Flaps increase camber (and some increase wing area), raising CL so the airplane can fly slower.",
        ),
        check({
          id: "vfr.principles.2.k1",
          kind: "mc",
          prompt: "If airspeed is doubled while angle of attack stays the same, lift will:",
          choices: [
            "Double",
            "Remain the same",
            "Increase by a factor of four",
            "Halve, because drag increases",
          ],
          answer: 2,
          explanation:
            "Lift varies with the square of velocity, so 2² = 4 times the lift. 'Double' is the tempting answer if you treat the relationship as linear, but the V² term makes it quadratic.",
          subject: "Aerodynamics",
          reference: "PHAK Ch. 4",
        }),
        h("Trading speed for angle of attack"),
        p(
          "In level flight lift must equal weight. Because lift depends on both speed and angle of attack, every airspeed has a matching angle of attack. Slow down and you must raise the angle of attack to hold altitude; speed up and you must lower it. This is why the nose comes up as you slow the airplane in level flight, and why slow flight feels nose-high.",
        ),
        caution(
          "A wing can stall at any airspeed",
          "The stall is caused by exceeding the critical angle of attack, not by a particular airspeed. Published stall speeds apply only at a specific weight, configuration and 1 G. In a steep turn or an abrupt pull-up, the wing can exceed its critical AOA well above the published stall speed.",
        ),
        check({
          id: "vfr.principles.2.k2",
          kind: "tf",
          prompt:
            "True or false: angle of attack is the angle between the wing's chord line and the horizon.",
          choices: ["True", "False"],
          answer: 1,
          explanation:
            "False. Angle of attack is measured between the chord line and the relative wind. The angle to the horizon describes pitch attitude, which can differ substantially from AOA in climbs, descents and mushing flight.",
          subject: "Aerodynamics",
          reference: "PHAK Ch. 4",
        }),
        practice(
          "/simulator?scenario=vfr-slow-flight",
          "Slow flight",
          "Slow the airplane while holding altitude and notice how pitch attitude (and angle of attack) must increase as airspeed decreases.",
        ),
      ],
    },
  ],
  flashcards: [
    {
      id: "vfr.principles.fc1",
      front: "The four forces of flight",
      back: "Lift, weight, thrust and drag.",
    },
    {
      id: "vfr.principles.fc2",
      front: "Relationship of forces in straight-and-level, unaccelerated flight",
      back: "Lift = weight and thrust = drag (sum of opposing forces is equal).",
    },
    {
      id: "vfr.principles.fc3",
      front: "Angle of attack",
      back: "The acute angle between the chord line of the wing and the relative wind.",
    },
    {
      id: "vfr.principles.fc4",
      front: "Relative wind",
      back: "Airflow relative to the airfoil — parallel to and opposite the flight path.",
    },
    {
      id: "vfr.principles.fc5",
      front: "Effect of doubling airspeed on lift (same AOA)",
      back: "Lift increases four times, because lift varies with the square of airspeed.",
    },
    {
      id: "vfr.principles.fc6",
      front: "Angle of incidence",
      back: "The fixed angle between the wing chord line and the airplane's longitudinal axis, set by the manufacturer.",
    },
  ],
  quiz: [
    q({
      id: "vfr.principles.q1",
      kind: "mc",
      prompt: "In which direction does lift act?",
      choices: [
        "Straight up, opposite gravity",
        "Perpendicular to the longitudinal axis",
        "Parallel to the chord line",
        "Perpendicular to the relative wind",
      ],
      answer: 3,
      explanation:
        "Lift is defined as perpendicular to the relative wind (flight path). It only points 'straight up' when the flight path is level and the wings are level — in a bank or climb it tilts.",
      subject: "Aerodynamics",
      reference: "PHAK Ch. 5",
    }),
    q({
      id: "vfr.principles.q2",
      kind: "mc",
      prompt:
        "The angle between the chord line of an airfoil and the relative wind is known as the:",
      choices: ["Angle of incidence", "Pitch angle", "Angle of attack", "Dihedral angle"],
      answer: 2,
      explanation:
        "That is the definition of angle of attack. Angle of incidence is between the chord line and the longitudinal axis, and is fixed by the design.",
      subject: "Aerodynamics",
      reference: "PHAK Ch. 4",
    }),
    q({
      id: "vfr.principles.q3",
      kind: "tf",
      prompt: "True or false: an airplane in a steady, constant-airspeed climb is in equilibrium.",
      choices: ["True", "False"],
      answer: 0,
      explanation:
        "True. Equilibrium means no acceleration. A steady climb at constant airspeed and constant rate is unaccelerated, so the forces (resolved along and perpendicular to the flight path) balance. Many students assume a climb means lift exceeds weight — in a steady climb it does not.",
      subject: "Aerodynamics",
      reference: "PHAK Ch. 5",
    }),
    q({
      id: "vfr.principles.q4",
      kind: "scenario",
      context:
        "You are cruising straight and level. Without touching the throttle, you slowly reduce airspeed from 100 to 70 knots while maintaining altitude.",
      prompt: "What must happen to angle of attack?",
      choices: [
        "It must decrease",
        "It must increase",
        "It stays the same; only power changes lift",
        "It must decrease, then increase",
      ],
      answer: 1,
      explanation:
        "Lift must still equal weight. With less airspeed, the only remaining lever is a higher coefficient of lift, which comes from a higher angle of attack. Decreasing AOA at lower speed would produce less lift and the airplane would descend.",
      subject: "Aerodynamics",
      reference: "PHAK Ch. 4",
    }),
    q({
      id: "vfr.principles.q5",
      kind: "mc",
      prompt:
        "Which change will DECREASE the lift a wing produces at a given indicated angle of attack and true airspeed?",
      choices: [
        "Lowering the flaps",
        "Moving to colder air",
        "Flying at a higher density altitude",
        "Flying in denser air near sea level",
      ],
      answer: 2,
      explanation:
        "Lift is proportional to air density. Higher density altitude means thinner air and less lift at the same true airspeed and AOA. Flaps increase CL, and colder or sea-level air is denser — all three raise lift.",
      subject: "Aerodynamics",
      reference: "PHAK Ch. 4",
    }),
    q({
      id: "vfr.principles.q6",
      kind: "mc",
      prompt: "What does the wing's critical angle of attack depend on?",
      choices: [
        "Airspeed",
        "Gross weight",
        "Bank angle",
        "The wing design and configuration, not weight or airspeed",
      ],
      answer: 3,
      explanation:
        "For a given wing (and flap setting) the critical AOA is constant. Weight, bank angle and load factor change the stall SPEED, but the stall always occurs at the same critical angle of attack.",
      subject: "Aerodynamics",
      reference: "PHAK Ch. 5",
    }),
    q({
      id: "vfr.principles.q7",
      kind: "mc",
      prompt: "Wingtip vortices are strongest behind an aircraft that is:",
      choices: [
        "Heavy, clean and slow",
        "Light, dirty and fast",
        "Heavy, dirty and fast",
        "Light, clean and slow",
      ],
      answer: 0,
      explanation:
        "Vortex strength is greatest when the wing is working hardest: high weight, clean configuration and slow speed (high AOA). Extended flaps and gear ('dirty') change the vortex characteristics and generally reduce strength.",
      subject: "Aerodynamics",
      reference: "AIM Ch. 7, Wake Turbulence",
    }),
  ],
  practice: [
    link("/simulator?scenario=vfr-turns-climbs", "Climbs, descents and turns"),
    link("/simulator?scenario=vfr-slow-flight", "Slow flight"),
  ],
};
