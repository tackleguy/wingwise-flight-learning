import type { Module } from "../types";
import { caution, check, h, info, link, p, practice, q, table, tip, ul } from "../builders";

export const controls: Module = {
  id: "controls",
  number: 3,
  title: "Flight Controls",
  summary:
    "The three axes, primary controls (ailerons, elevator, rudder), adverse yaw, trim, flaps and how to position the controls when taxiing in wind.",
  lessons: [
    {
      id: "vfr.controls.1",
      title: "Axes of Flight and Primary Controls",
      minutes: 8,
      objectives: [
        "Match each primary flight control to its axis of rotation",
        "Explain adverse yaw and how rudder coordinates a turn",
        "Describe how a stabilator and antiservo tab work",
      ],
      blocks: [
        h("Three axes through the center of gravity"),
        p(
          "An airplane rotates about three imaginary axes that all pass through its center of gravity (CG). Think of them as three skewers through the airplane. Rolling is rotation about the longitudinal axis (nose to tail). Pitching is rotation about the lateral axis (wingtip to wingtip). Yawing is rotation about the vertical axis (top to bottom).",
        ),
        table(
          ["Control", "Surface", "Motion", "Axis"],
          [
            ["Control wheel/stick left-right", "Ailerons", "Roll", "Longitudinal"],
            ["Control wheel/stick fore-aft", "Elevator (or stabilator)", "Pitch", "Lateral"],
            ["Rudder pedals", "Rudder", "Yaw", "Vertical"],
          ],
        ),
        h("Ailerons and adverse yaw"),
        p(
          "Ailerons move in opposite directions. Turning the yoke left raises the left aileron (less lift on the left wing) and lowers the right aileron (more lift on the right wing), so the airplane rolls left. The wing with the lowered aileron produces more lift — and therefore more induced drag — so it is pulled back slightly. That makes the nose yaw toward the raised wing, opposite the turn. This is adverse yaw.",
        ),
        p(
          "Pilots counter adverse yaw with coordinated rudder in the direction of the turn: left yoke with left rudder, right yoke with right rudder. The inclinometer ball on the turn coordinator shows whether you are coordinated. If the ball is off to one side, 'step on the ball' — add rudder on the side the ball has moved toward.",
        ),
        info(
          "Designs that reduce adverse yaw",
          "Manufacturers use differential ailerons (the up aileron moves farther than the down one), Frise-type ailerons (the up aileron's leading edge protrudes into the airflow to add drag) and aileron-rudder interconnects. None eliminates the need for coordinated rudder entirely.",
        ),
        h("Elevator and stabilator"),
        p(
          "Pulling the control back raises the elevator, pushing the tail down and the nose up, which increases angle of attack. Some airplanes, such as many Pipers, use a stabilator — a one-piece horizontal tail that pivots as a unit. Because a stabilator is very sensitive, it has an antiservo tab on its trailing edge that moves in the same direction as the trailing edge to add control resistance and feel.",
        ),
        h("Rudder"),
        p(
          "The rudder yaws the nose left or right. It does not turn the airplane by itself — the airplane turns because the wings are banked and the horizontal component of lift pulls it around. The rudder's jobs are to keep the airplane coordinated, counter left-turning tendencies, control direction on the ground and handle crosswinds during takeoff and landing.",
        ),
        check({
          id: "vfr.controls.1.k1",
          kind: "mc",
          prompt: "During a roll to the right, adverse yaw tends to yaw the nose:",
          choices: ["To the left", "To the right", "Up", "Down"],
          answer: 0,
          explanation:
            "Rolling right lowers the left aileron, giving the left wing more lift and more induced drag. That extra drag pulls the nose to the LEFT — opposite the turn — which is why you add right rudder as you roll right.",
          subject: "Aerodynamics",
          reference: "PHAK Ch. 6",
        }),
        tip(
          "Coordination exercise",
          "Pick a point on the horizon and roll back and forth between 30° banks while keeping the nose fixed on that point. It trains your feet and hands to move together.",
        ),
        practice(
          "/simulator?scenario=vfr-turns-climbs",
          "Coordinated turns",
          "Practice rolling in and out of turns while keeping the ball centered.",
        ),
      ],
    },
    {
      id: "vfr.controls.2",
      title: "Trim, Flaps and Taxiing in Wind",
      minutes: 9,
      objectives: [
        "Use trim to relieve control pressures",
        "Compare types of flaps and their effect on lift and drag",
        "Position the controls correctly when taxiing in a quartering wind",
      ],
      blocks: [
        h("Trim"),
        p(
          "Trim lets you hold a pitch attitude without constant pressure on the controls. A trim tab is a small hinged surface on the trailing edge of the elevator. It moves opposite to the direction you want the elevator to go: to hold the elevator up (nose up), the trim tab moves down, and the airflow pushing on it holds the elevator up. Fly the attitude first, then trim away the pressure.",
        ),
        tip(
          "Attitude first, trim second",
          "Trim is not a primary flight control. Establish the attitude and power you want with the control wheel and throttle, then trim to relieve the pressure you are holding.",
        ),
        h("Flaps"),
        p(
          "Flaps are hinged surfaces on the inboard trailing edge of the wings. Extending them increases camber (and on some designs wing area), which increases both lift and drag. That lets you approach at a slower airspeed and a steeper descent angle without gaining speed. Partial flaps (often up to about 10–20°) add proportionally more lift than drag and are used for some short- and soft-field takeoffs; larger settings add mostly drag.",
        ),
        table(
          ["Flap type", "How it works", "Notes"],
          [
            ["Plain", "Trailing edge hinges down", "Simple; raises lift and drag; pitch-down moment"],
            ["Split", "Only the lower surface deflects", "More drag than plain flap"],
            ["Slotted", "A gap lets high-energy air flow over the flap", "Delays separation; more lift"],
            ["Fowler", "Moves aft, then down", "Increases wing area and camber; largest lift increase"],
          ],
        ),
        caution(
          "Respect VFE",
          "Never extend flaps above the maximum flap extended speed (VFE), the top of the white arc. Some airplanes have different VFE values for different flap settings; check the POH.",
        ),
        info(
          "Leading-edge devices and spoilers",
          "Slots and slats on the wing's leading edge let the wing reach a higher angle of attack before stalling. Spoilers, used on gliders and many jets, disrupt airflow to reduce lift and increase drag for descent and roll control.",
        ),
        h("Taxiing in wind"),
        p(
          "On the ground, wind can lift a wing or the tail, especially in high-wing, tricycle-gear airplanes. The memory aid from the Airplane Flying Handbook is 'climb into a headwind, dive away from a tailwind': turn the yoke toward a headwind with neutral elevator; with a tailwind, turn the yoke away from the wind and hold forward elevator.",
        ),
        table(
          ["Wind from", "Aileron", "Elevator"],
          [
            ["Left front quarter", "Turned left (up aileron on upwind wing)", "Neutral"],
            ["Right front quarter", "Turned right (up aileron on upwind wing)", "Neutral"],
            ["Left rear quarter", "Turned right (down aileron on upwind wing)", "Forward (down)"],
            ["Right rear quarter", "Turned left (down aileron on upwind wing)", "Forward (down)"],
          ],
        ),
        check({
          id: "vfr.controls.2.k1",
          kind: "scenario",
          context: "You are taxiing a tricycle-gear, high-wing airplane with a strong quartering tailwind from the left.",
          prompt: "How should you position the controls?",
          choices: [
            "Left aileron up, neutral elevator",
            "Left aileron down, elevator down",
            "Right aileron down, elevator up",
            "Left aileron up, elevator up",
          ],
          answer: 1,
          explanation:
            "'Dive away from a tailwind': turn the yoke to the right (away from the wind), which lowers the left aileron so the wind cannot get under the left wing, and hold the elevator down to keep the tail from lifting. 'Left aileron up, neutral elevator' is correct for a left quartering HEADWIND, not a tailwind.",
          subject: "Airport Operations",
          reference: "AFH Ch. 2; PHAK Ch. 14",
        }),
        check({
          id: "vfr.controls.2.k2",
          kind: "tf",
          prompt: "True or false: to hold the nose up, an elevator trim tab moves upward.",
          choices: ["True", "False"],
          answer: 1,
          explanation:
            "False. A trim tab moves opposite to the control surface. To hold the elevator up (nose up), the tab moves down so the airflow pushes the elevator's trailing edge up.",
          subject: "Aircraft Systems",
          reference: "PHAK Ch. 6",
        }),
        ul(
          "Fly the airplane with the primary controls; trim to remove pressure.",
          "Use flaps within the white arc and as the POH directs.",
          "Always position the controls for wind while taxiing, especially in high-wing airplanes.",
        ),
      ],
    },
  ],
  flashcards: [
    { id: "vfr.controls.fc1", front: "Ailerons control movement about which axis?", back: "The longitudinal axis (roll)." },
    { id: "vfr.controls.fc2", front: "Elevator controls movement about which axis?", back: "The lateral axis (pitch)." },
    { id: "vfr.controls.fc3", front: "Adverse yaw", back: "Yaw opposite the direction of roll, caused by extra induced drag on the wing with the lowered aileron." },
    { id: "vfr.controls.fc4", front: "Trim tab movement", back: "Opposite to the movement of the control surface it trims." },
    { id: "vfr.controls.fc5", front: "Taxiing with a quartering tailwind", back: "'Dive away from the wind': yoke away from the wind, elevator forward (down)." },
    { id: "vfr.controls.fc6", front: "Fowler flap", back: "Moves aft and down, increasing both wing area and camber." },
  ],
  quiz: [
    q({
      id: "vfr.controls.q1",
      kind: "mc",
      prompt: "The three axes of an airplane intersect at the:",
      choices: ["Center of pressure", "Center of gravity", "Aerodynamic center", "Datum"],
      answer: 1,
      explanation:
        "All three axes pass through the CG; the airplane rotates about its CG. The center of pressure is where lift effectively acts and moves with angle of attack. The datum is an arbitrary reference for weight-and-balance measurements.",
      subject: "Aerodynamics",
      reference: "PHAK Ch. 5",
    }),
    q({
      id: "vfr.controls.q2",
      kind: "mc",
      prompt: "What is the purpose of the rudder?",
      choices: [
        "To bank the airplane in a turn",
        "To control yaw and keep the airplane coordinated",
        "To control pitch",
        "To turn the airplane without banking",
      ],
      answer: 1,
      explanation:
        "The rudder controls yaw about the vertical axis and is used to coordinate turns. Turning is caused by the horizontal component of lift when banked, so the rudder is not what turns the airplane.",
      subject: "Aerodynamics",
      reference: "PHAK Ch. 6",
    }),
    q({
      id: "vfr.controls.q3",
      kind: "scenario",
      context: "Taxiing with a quartering headwind from the right.",
      prompt: "What is the correct control position?",
      choices: [
        "Right aileron up, neutral elevator",
        "Right aileron down, neutral elevator",
        "Left aileron up, elevator down",
        "Right aileron up, elevator down",
      ],
      answer: 0,
      explanation:
        "'Climb into a headwind': turn the yoke right so the right (upwind) aileron is up and the wind cannot lift that wing, with neutral elevator for a tricycle-gear airplane. Elevator down is used for tailwinds.",
      subject: "Airport Operations",
      reference: "PHAK Ch. 14",
    }),
    q({
      id: "vfr.controls.q4",
      kind: "mc",
      prompt: "Extending flaps on approach primarily allows:",
      choices: [
        "A higher approach speed with a shallower angle",
        "Reduced stall speed with no change in drag",
        "Increased cruise speed",
        "A steeper approach angle without increasing airspeed",
      ],
      answer: 3,
      explanation:
        "Flaps add lift and drag, so you can descend more steeply without building speed and touch down slower. They do increase drag — that is part of how they steepen the approach.",
      subject: "Aerodynamics",
      reference: "PHAK Ch. 6; AFH Ch. 9",
    }),
    q({
      id: "vfr.controls.q5",
      kind: "mc",
      prompt: "An antiservo tab on a stabilator:",
      choices: [
        "Moves opposite the stabilator to make it easier to move",
        "Is used only on the rudder",
        "Moves in the same direction as the stabilator trailing edge to add control feel",
        "Locks the stabilator in place on the ground",
      ],
      answer: 2,
      explanation:
        "The antiservo tab moves in the same direction as the stabilator's trailing edge, making the very sensitive stabilator less so and providing feel. It also functions as a trim tab. A tab moving opposite to ease control movement is a servo (balance) tab.",
      subject: "Aircraft Systems",
      reference: "PHAK Ch. 6",
    }),
    q({
      id: "vfr.controls.q6",
      kind: "tf",
      prompt: "True or false: if the inclinometer ball is deflected to the right during a turn, you should add right rudder.",
      choices: ["True", "False"],
      answer: 0,
      explanation: "True — 'step on the ball'. Pressing the rudder on the side toward which the ball has moved recenters it and restores coordination.",
      subject: "Flight Instruments",
      reference: "PHAK Ch. 8",
    }),
  ],
  practice: [
    link("/simulator?scenario=vfr-turns-climbs", "Turns, climbs and descents"),
    link("/simulator?scenario=vfr-slow-flight", "Slow flight with flaps"),
  ],
};
