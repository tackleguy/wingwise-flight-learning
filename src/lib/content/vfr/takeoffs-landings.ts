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

export const takeoffsLandings: Module = {
  id: "takeoffs-landings",
  number: 14,
  title: "Takeoffs and Landings",
  summary:
    "V-speeds, normal and crosswind takeoffs and landings, crosswind components, short- and soft-field techniques and the go-around.",
  lessons: [
    {
      id: "vfr.takeoffs-landings.1",
      title: "V-Speeds, Normal and Crosswind Operations",
      minutes: 11,
      objectives: [
        "Define the key V-speeds used for takeoff, climb and landing",
        "Fly a stabilized approach and normal landing",
        "Calculate a crosswind component and apply crosswind technique",
      ],
      blocks: [
        h("The V-speeds you will use"),
        table(
          ["Speed", "Name", "Use"],
          [
            ["VR", "Rotation speed", "Speed at which you begin raising the nose for liftoff"],
            [
              "VX",
              "Best angle of climb",
              "Most altitude gained in the shortest horizontal distance — obstacle clearance",
            ],
            [
              "VY",
              "Best rate of climb",
              "Most altitude gained in the shortest time — normal climb",
            ],
            [
              "VS0",
              "Stall speed, landing configuration",
              "Bottom of the white arc; basis for approach speed (≈ 1.3 VS0)",
            ],
            ["VS1", "Stall speed, specified configuration", "Bottom of the green arc"],
            ["VFE", "Maximum flap extended speed", "Top of the white arc"],
            [
              "VA",
              "Design maneuvering speed",
              "Max speed for full, abrupt control deflection; decreases with weight",
            ],
            [
              "VG",
              "Best glide speed",
              "Greatest distance per altitude lost with the engine failed",
            ],
          ],
        ),
        info(
          "VX vs VY with altitude",
          "VX increases and VY decreases as altitude increases; they meet at the airplane's absolute ceiling.",
        ),
        h("The normal takeoff"),
        p(
          "Line up on the centerline, confirm the heading indicator matches the runway, and add full power smoothly. Check engine instruments early in the roll. Use right rudder to counter left-turning tendencies, rotate at VR, and climb at VY (or VX if obstacles require). Keep the wings level and the climb straight until you are at a safe altitude.",
        ),
        h("The stabilized approach and landing"),
        p(
          "A stabilized approach means a constant glide path, airspeed, descent rate and configuration, aligned with the runway, by a predetermined point (often 300–500 ft AGL for light airplanes). If you are not stabilized by that point, go around. Approach at about 1.3 VS0 or the POH speed, adjusted for gusts. Over the runway, the roundout (flare) gradually raises the nose to slow the descent; touchdown should be on the main wheels at about the stall speed, with the airplane aligned with the centerline.",
        ),
        h("Crosswind components"),
        p(
          "Wind at an angle to the runway has two components: headwind (along the runway) and crosswind (across it). A quick rule: the crosswind component is about 50% of the wind speed at 30° off the runway, about 70% at 45°, about 90% at 60°, and 100% at 90°. Compare it with the maximum demonstrated crosswind in the POH and your own personal limit.",
        ),
        check({
          id: "vfr.takeoffs-landings.1.k1",
          kind: "calc",
          prompt:
            "You are landing on runway 27. The wind is 300° at 20 knots. What is the approximate crosswind component?",
          choices: ["5 knots", "10 knots", "14 knots", "17 knots"],
          answer: 1,
          explanation:
            "The wind is 30° off the runway (300 − 270). Crosswind ≈ 50% × 20 = 10 knots (exactly 20 × sin 30° = 10). 17 knots is the HEADWIND component (20 × cos 30°).",
          subject: "Performance",
          reference: "PHAK Ch. 11",
        }),
        h("Crosswind technique"),
        ul(
          "Takeoff: start with full aileron into the wind and reduce it as speed builds; use rudder to keep the centerline. Lift off cleanly, then establish a crab to track the extended centerline.",
          "Approach: crab on final to track the centerline. Most instructors teach transitioning to the wing-low (sideslip) method before the flare.",
          "Wing-low landing: lower the upwind wing with aileron to stop drift and use opposite rudder to keep the longitudinal axis aligned with the runway. Touch down on the upwind main wheel first.",
          "After touchdown: keep increasing aileron into the wind as the airplane slows.",
        ),
        caution(
          "Never land in a crab",
          "Touching down while crabbed or drifting places severe side loads on the landing gear and can cause a ground loop. Align the airplane with the runway before touchdown.",
        ),
        practice(
          "/simulator?scenario=vfr-landing",
          "Landing practice",
          "Fly stabilized approaches and crosswind landings in variable winds.",
        ),
      ],
    },
    {
      id: "vfr.takeoffs-landings.2",
      title: "Short-Field, Soft-Field and Go-Arounds",
      minutes: 10,
      objectives: [
        "Perform short-field takeoffs and landings to clear obstacles and stop quickly",
        "Perform soft-field takeoffs and landings using ground effect",
        "Execute a go-around promptly and correctly",
      ],
      blocks: [
        h("Short-field takeoff"),
        p(
          "Use the POH flap setting, line up using every available foot of runway, hold the brakes and apply full power, then release the brakes. Rotate at the POH speed and climb at VX until clear of obstacles (the standard is a 50-ft obstacle), then accelerate to VY and retract flaps as directed.",
        ),
        h("Short-field landing"),
        p(
          "Fly a stabilized approach at the POH short-field speed (often around 1.3 VS0) with full flaps, aiming for a precise touchdown point. Touch down at minimum controllable speed with little or no float, then lower the nose and brake firmly. Many POHs recommend retracting the flaps after touchdown to put more weight on the wheels for braking — follow your POH and avoid grabbing the gear lever in retractable airplanes.",
        ),
        h("Soft-field takeoff"),
        p(
          "On grass, sand or snow, the goal is to get the weight off the wheels as soon as possible. Keep moving during taxi and onto the runway, hold full back pressure to lift the nosewheel, and let the airplane lift off at the lowest possible airspeed. Immediately lower the nose slightly to stay in ground effect while accelerating to VX or VY, then climb.",
        ),
        h("Soft-field landing"),
        p(
          "Touch down as slowly and softly as possible with the nose held high. A little power during the flare can help. Keep back pressure after touchdown to keep the nosewheel off the soft surface, and keep moving — avoid heavy braking.",
        ),
        check({
          id: "vfr.takeoffs-landings.2.k1",
          kind: "mc",
          prompt:
            "After a soft-field liftoff, why does the pilot lower the nose and remain close to the surface?",
          choices: [
            "To accelerate in ground effect to a safe climb speed",
            "To avoid a tail strike",
            "To check the engine instruments",
            "To reduce P-factor",
          ],
          answer: 0,
          explanation:
            "The airplane lifts off below normal climb speed thanks to ground effect. It must accelerate to VX or VY while still in ground effect; climbing out immediately can cause it to settle back onto the runway.",
          subject: "Aerodynamics",
          reference: "AFH Ch. 6",
        }),
        h("The go-around"),
        p(
          "A go-around is a normal procedure, not a failure. Go around if you are unstabilized, too high or fast, the runway is occupied, you bounce, or anything feels wrong. The sequence is Power, Attitude, Configure:",
        ),
        ol(
          "Apply full power smoothly (carburetor heat off).",
          "Pitch to the go-around attitude and hold it — expect strong nose-up trim forces and use right rudder.",
          "Retract flaps to an intermediate setting as the POH directs; do not retract fully at once.",
          "With a positive rate of climb, retract remaining flaps incrementally as you accelerate to VY.",
          "Move to the side of the runway if needed to see departing traffic, and announce the go-around.",
        ),
        warning(
          "Porpoising and bounces",
          "Touching down nosewheel-first can start a porpoise — a series of increasingly hard bounces. Do not try to 'push' the airplane back down. Hold a landing attitude and go around.",
        ),
        tip(
          "Commit early",
          "Decide where you will go around before you start the approach — for example, if not stabilized by 300 ft AGL, or not touched down in the first third of the runway.",
        ),
        practice(
          "/simulator?scenario=vfr-takeoff-climb",
          "Takeoff and climb",
          "Practice normal, short- and soft-field takeoffs and climbs at VX and VY.",
        ),
      ],
    },
  ],
  flashcards: [
    {
      id: "vfr.takeoffs-landings.fc1",
      front: "VX",
      back: "Best angle of climb — most altitude per horizontal distance; obstacle clearance.",
    },
    {
      id: "vfr.takeoffs-landings.fc2",
      front: "VY",
      back: "Best rate of climb — most altitude per unit of time.",
    },
    {
      id: "vfr.takeoffs-landings.fc3",
      front: "Crosswind rule of thumb",
      back: "30° ≈ 50%, 45° ≈ 70%, 60° ≈ 90%, 90° = 100% of wind speed.",
    },
    {
      id: "vfr.takeoffs-landings.fc4",
      front: "Wing-low crosswind landing controls",
      back: "Aileron into the wind, opposite rudder to align with the runway.",
    },
    {
      id: "vfr.takeoffs-landings.fc5",
      front: "Go-around flow",
      back: "Power, attitude, configure (flaps incrementally after positive climb).",
    },
    {
      id: "vfr.takeoffs-landings.fc6",
      front: "Typical approach speed",
      back: "About 1.3 VS0 (or the POH value), plus a gust factor.",
    },
  ],
  quiz: [
    q({
      id: "vfr.takeoffs-landings.q1",
      kind: "mc",
      prompt:
        "Which speed provides the greatest gain in altitude in the shortest horizontal distance?",
      choices: ["VY", "VG", "VA", "VX"],
      answer: 3,
      explanation:
        "VX gives the best ANGLE (altitude per distance), used to clear obstacles. VY gives the best RATE (altitude per time).",
      subject: "Performance",
      reference: "PHAK Ch. 11",
    }),
    q({
      id: "vfr.takeoffs-landings.q2",
      kind: "calc",
      prompt: "Runway 18. Wind 240° at 16 knots. What is the approximate crosswind component?",
      choices: ["8 knots", "11 knots", "14 knots", "16 knots"],
      answer: 2,
      explanation:
        "The wind is 60° off the runway. Crosswind ≈ 90% × 16 ≈ 14 knots (16 × sin 60° = 13.9). 8 knots is the headwind component (16 × cos 60°).",
      subject: "Performance",
      reference: "PHAK Ch. 11",
    }),
    q({
      id: "vfr.takeoffs-landings.q3",
      kind: "mc",
      prompt:
        "During a wing-low crosswind landing with the wind from the left, the controls should be:",
      choices: [
        "Left aileron down, left rudder",
        "Right wing low, right rudder",
        "Left wing low with left aileron, and right rudder",
        "Ailerons neutral, right rudder",
      ],
      answer: 2,
      explanation:
        "Lower the upwind (left) wing with left aileron to stop drift, and use opposite (right) rudder to keep the nose aligned with the runway. Using same-side rudder would yaw the nose off the centerline.",
      subject: "Airport Operations",
      reference: "AFH Ch. 9",
    }),
    q({
      id: "vfr.takeoffs-landings.q4",
      kind: "mc",
      prompt: "What is the FIRST action when initiating a go-around?",
      choices: [
        "Retract the flaps fully",
        "Apply full power",
        "Raise the landing gear",
        "Call the tower",
      ],
      answer: 1,
      explanation:
        "Power first, then attitude, then configuration. Retracting flaps fully before power and climb are established can cause the airplane to sink or stall close to the ground.",
      subject: "Emergency Procedures",
      reference: "AFH Ch. 9",
    }),
    q({
      id: "vfr.takeoffs-landings.q5",
      kind: "scenario",
      context:
        "On final for a short grass strip with tall trees at the approach end, the airplane is 15 knots fast and well above the glide path at 300 ft AGL.",
      prompt: "What should you do?",
      choices: [
        "Push the nose down to steepen the approach",
        "Continue and plan to brake hard",
        "Slip aggressively to the runway",
        "Go around and set up a new, stabilized approach",
      ],
      answer: 3,
      explanation:
        "You are unstabilized at the gate. A go-around is the safe choice. Diving at the runway increases speed and float, and planning to 'brake hard' on grass with excess speed often ends in an overrun.",
      subject: "ADM",
      reference: "AFH Ch. 9",
    }),
    q({
      id: "vfr.takeoffs-landings.q6",
      kind: "tf",
      prompt:
        "True or false: in a soft-field takeoff, the airplane should lift off at the lowest possible airspeed and then accelerate in ground effect.",
      choices: ["True", "False"],
      answer: 0,
      explanation:
        "True. Getting the weight off the wheels early reduces drag from the soft surface; acceleration to climb speed then happens in ground effect.",
      subject: "Aerodynamics",
      reference: "AFH Ch. 6",
    }),
    q({
      id: "vfr.takeoffs-landings.q7",
      kind: "mc",
      prompt: "How do VX and VY change with increasing altitude?",
      choices: [
        "Both increase",
        "Both decrease",
        "VX increases and VY decreases",
        "VX decreases and VY increases",
      ],
      answer: 2,
      explanation:
        "VX increases and VY decreases with altitude until they converge at the absolute ceiling.",
      subject: "Performance",
      reference: "PHAK Ch. 11",
    }),
  ],
  practice: [
    link("/simulator?scenario=vfr-takeoff-climb", "Takeoff and climb"),
    link("/simulator?scenario=vfr-landing", "Landings"),
    link("/simulator?scenario=vfr-pattern", "Pattern work"),
  ],
};
