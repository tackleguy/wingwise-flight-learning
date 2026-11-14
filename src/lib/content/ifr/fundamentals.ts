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

export const fundamentals: Module = {
  id: "fundamentals",
  number: 1,
  title: "Instrument Flight Fundamentals",
  summary:
    "Attitude instrument flying, control and performance instruments, the primary/supporting method, scan techniques, instrument checks and unusual attitude recovery.",
  lessons: [
    {
      id: "ifr.fundamentals.1",
      title: "Attitude Instrument Flying and the Scan",
      minutes: 11,
      objectives: [
        "Describe the control and performance concept of attitude instrument flying",
        "Identify primary and supporting instruments for basic maneuvers",
        "Use an effective cross-check and avoid fixation, omission and emphasis errors",
      ],
      blocks: [
        h("Flying by reference to instruments"),
        p(
          "In visual flight you control the airplane by setting a pitch and bank attitude against the natural horizon and setting power. Instrument flight is the same airplane and the same control inputs — the only difference is that the horizon now lives on the attitude indicator. The Instrument Flying Handbook (IFH) calls this attitude instrument flying: controlling the airplane's attitude and power by reference to instruments to achieve a desired performance. The IFH breaks the skill into three fundamentals: cross-check (scanning the instruments), instrument interpretation (understanding what each one is telling you) and aircraft control (making the right, small corrections). All three improve with practice; none can be skipped.",
        ),
        diagram(
          "six-pack",
          "The attitude indicator sits at the center of the scan. Performance instruments around it confirm that the attitude and power you set produce the result you want.",
        ),
        table(
          ["Group", "Instruments", "Role"],
          [
            [
              "Control",
              "Attitude indicator; power instruments (tachometer, manifold pressure)",
              "Show immediate attitude and power — what you set",
            ],
            [
              "Performance",
              "Altimeter, airspeed indicator, VSI, heading indicator, turn coordinator",
              "Show the result of the attitude and power",
            ],
            ["Navigation", "CDI/HSI, GPS, DME, RMI", "Show position relative to a facility or fix"],
          ],
        ),
        p(
          "The control-and-performance method is simple: set an attitude and power on the control instruments, then check the performance instruments. If performance is not what you want, make a small, specific change on the control instruments — for example, raise the nose one bar width on the attitude indicator — and check again.",
        ),
        h("Primary and supporting instruments"),
        p(
          "The FAA also teaches the primary and supporting method. For each of pitch, bank and power, the primary instrument is the one that gives the most pertinent information about whether you are achieving the desired performance; supporting instruments back it up. Primary instruments change with the maneuver.",
        ),
        table(
          ["Maneuver", "Pitch primary", "Bank primary", "Power primary"],
          [
            ["Straight-and-level", "Altimeter", "Heading indicator", "Airspeed indicator"],
            [
              "Standard-rate level turn (established)",
              "Altimeter",
              "Turn coordinator (miniature airplane)",
              "Airspeed indicator",
            ],
            [
              "Constant-airspeed climb (established)",
              "Airspeed indicator",
              "Heading indicator",
              "Tachometer/MP (climb power)",
            ],
            ["Constant-rate descent", "VSI", "Heading indicator", "Airspeed indicator"],
          ],
        ),
        info(
          "During transitions",
          "While establishing a new attitude — rolling into a turn or raising the nose to climb — the attitude indicator is primary because it is the only instrument that shows the change directly and instantly. Once the maneuver is established, the performance instruments take over as primary.",
        ),
        check({
          id: "ifr.fundamentals.1.k1",
          kind: "mc",
          prompt: "In straight-and-level flight, which instrument is primary for bank?",
          choices: [
            "Attitude indicator",
            "Turn coordinator",
            "Heading indicator",
            "Magnetic compass",
          ],
          answer: 2,
          explanation:
            "If heading is not changing, the wings are level, so the heading indicator gives the most pertinent bank information in straight flight. The attitude indicator is a supporting instrument here (and primary only during the transition into a turn).",
          subject: "Flight Instruments",
          reference: "IFH Ch. 6",
        }),
        h("Scan patterns"),
        ul(
          "Radial (hub-and-spoke) scan: start at the attitude indicator, glance at one instrument, return to the attitude indicator, then the next. Most of your time (often cited as 80–90%) is spent on the attitude indicator.",
          "Selected radial cross-check: emphasize the instruments that matter for the current maneuver.",
          "Inverted-V cross-check: attitude indicator, turn coordinator, attitude indicator, VSI, attitude indicator.",
          "Rectangular cross-check: around the panel in a fixed order — easy but gives equal weight to every instrument.",
        ),
        table(
          ["Common error", "Description"],
          [
            [
              "Fixation",
              "Staring at one instrument (often the one with the problem) while others drift",
            ],
            ["Omission", "Leaving an instrument out of the scan entirely"],
            ["Emphasis", "Relying on one instrument instead of the combination"],
          ],
        ),
        exercise("instrument-scan", "Train an efficient instrument cross-check"),
        tip(
          "Standard-rate bank rule of thumb",
          "A standard-rate turn is 3° per second (360° in 2 minutes). The bank angle needed is roughly TAS ÷ 10 + 7: at 120 knots, about 19°.",
        ),
        practice(
          "/avionics",
          "Avionics lab",
          "Practice holding altitude, heading and airspeed using only the instruments.",
        ),
      ],
    },
    {
      id: "ifr.fundamentals.2",
      title: "Instrument Checks, Basic Maneuvers and Unusual Attitudes",
      minutes: 10,
      objectives: [
        "Perform a preflight and taxi check of the flight instruments",
        "Fly basic instrument maneuvers including timed turns",
        "Recover from nose-high and nose-low unusual attitudes",
      ],
      blocks: [
        h("Checking the instruments before IFR flight"),
        ul(
          "Altimeter: set to the current altimeter setting; it should read within 75 ft of a known field elevation (IFH guidance) — otherwise have it checked.",
          "Airspeed indicator: reads zero before taxi; pitot cover removed and pitot heat checked.",
          "VSI: reads zero (or note the error and treat that value as zero).",
          "Attitude indicator: erect within about 5 minutes and stays level during taxi turns (no more than about 5° of bank).",
          "Heading indicator: set to the magnetic compass and turns in the correct direction during taxi turns.",
          "Turn coordinator: miniature airplane shows a turn in the correct direction and the ball moves opposite the turn.",
          "Magnetic compass: swings freely, full of fluid, and the deviation card is in place.",
        ),
        h("Basic maneuvers"),
        p(
          "Every instrument maneuver combines a few basic skills: straight-and-level flight, standard-rate turns, constant-airspeed and constant-rate climbs and descents, and changes in airspeed. When you level off from a climb, start leading the level-off by about 10% of the vertical speed: at 500 fpm, begin lowering the nose about 50 ft before the target altitude.",
        ),
        h("Timed and compass turns"),
        p(
          "If the heading indicator fails, you can turn to a new heading by timing a standard-rate turn: 3° per second, so a 45° heading change takes 15 seconds. Start timing as you roll into the turn and begin rolling out when the time is up. Compass turns are possible too, but you must account for northerly turning error (undershoot north, overshoot south in the Northern Hemisphere).",
        ),
        check({
          id: "ifr.fundamentals.2.k1",
          kind: "calc",
          prompt:
            "With the heading indicator inoperative, how long should a standard-rate turn last to change heading from 090° to 180°?",
          choices: ["15 seconds", "30 seconds", "45 seconds", "60 seconds"],
          answer: 1,
          explanation:
            "A 90° change at 3° per second takes 30 seconds. 60 seconds would be correct for a half-standard-rate turn, which is used on no-gyro approaches inside the final approach fix.",
          subject: "Flight Instruments",
          reference: "IFH Ch. 7",
        }),
        h("Unusual attitude recovery"),
        p(
          "An unusual attitude is any attitude not needed for normal instrument flight — often the result of distraction, disorientation or an instrument failure. First identify whether the nose is high or low using the attitude indicator, airspeed, altimeter and VSI together, then recover in the correct order.",
        ),
        table(
          ["Nose-high (airspeed decreasing)", "Nose-low (airspeed increasing)"],
          [
            ["1. Add power", "1. Reduce power"],
            ["2. Lower the nose to prevent a stall", "2. Level the wings to stop the spiral"],
            ["3. Level the wings", "3. Raise the nose smoothly to level flight"],
            [
              "4. Return to the original altitude and heading",
              "4. Return to the original altitude and heading",
            ],
          ],
        ),
        caution(
          "Level the wings before pulling",
          "In a nose-low spiral, pulling back before leveling the wings only tightens the spiral and can overstress the airframe. Roll level first, then raise the nose.",
        ),
        check({
          id: "ifr.fundamentals.2.k2",
          kind: "scenario",
          context:
            "You look up from a chart to see the airspeed increasing rapidly, the altimeter unwinding and the turn coordinator showing a steep right turn.",
          prompt: "What is the correct recovery sequence?",
          choices: [
            "Reduce power, level the wings, then smoothly raise the nose",
            "Pull back firmly, then level the wings, then reduce power",
            "Add power, lower the nose, level the wings",
            "Level the wings, add power, pull back",
          ],
          answer: 0,
          explanation:
            "This is a nose-low spiral. Reduce power to stop the acceleration, level the wings, then raise the nose. Pulling first tightens the spiral; adding power is the nose-HIGH recovery.",
          subject: "Flight Instruments",
          reference: "IFH Ch. 7",
        }),
        ol(
          "Recognize: cross-check several instruments to confirm the attitude.",
          "Recover in the correct sequence with smooth, positive control inputs.",
          "Return to the assigned altitude and heading and tell ATC if you deviated.",
        ),
        practice(
          "/simulator?scenario=emg-vacuum",
          "Partial panel",
          "Fly timed turns and recover from unusual attitudes with the attitude indicator failed.",
        ),
      ],
    },
  ],
  flashcards: [
    {
      id: "ifr.fundamentals.fc1",
      front: "Three fundamental skills of attitude instrument flying",
      back: "Cross-check, instrument interpretation and aircraft control.",
    },
    {
      id: "ifr.fundamentals.fc2",
      front: "Control instruments",
      back: "Attitude indicator and power instruments (tachometer / manifold pressure).",
    },
    {
      id: "ifr.fundamentals.fc3",
      front: "Pitch primary in straight-and-level flight",
      back: "Altimeter.",
    },
    {
      id: "ifr.fundamentals.fc4",
      front: "Standard-rate turn",
      back: "3° per second — 360° in 2 minutes. Bank ≈ TAS ÷ 10 + 7.",
    },
    {
      id: "ifr.fundamentals.fc5",
      front: "Nose-low unusual attitude recovery",
      back: "Reduce power, level the wings, raise the nose.",
    },
    {
      id: "ifr.fundamentals.fc6",
      front: "Three common scan errors",
      back: "Fixation, omission and emphasis.",
    },
  ],
  quiz: [
    q({
      id: "ifr.fundamentals.q1",
      kind: "mc",
      prompt: "What is the primary pitch instrument during a stabilized, constant-airspeed climb?",
      choices: ["Altimeter", "Airspeed indicator", "VSI", "Attitude indicator"],
      answer: 1,
      explanation:
        "In a constant-airspeed climb you hold airspeed with pitch, so the airspeed indicator is primary for pitch. The attitude indicator is primary only while establishing the climb; the altimeter is primary for pitch in level flight.",
      subject: "Flight Instruments",
      reference: "IFH Ch. 6",
    }),
    q({
      id: "ifr.fundamentals.q2",
      kind: "calc",
      prompt: "Approximately what bank angle produces a standard-rate turn at 150 knots TAS?",
      choices: ["15°", "18°", "22°", "30°"],
      answer: 2,
      explanation:
        "TAS ÷ 10 + 7 = 15 + 7 = 22°. Using 15° (TAS ÷ 10 alone) forgets the +7 in the rule of thumb.",
      subject: "Flight Instruments",
      reference: "IFH Ch. 6",
    }),
    q({
      id: "ifr.fundamentals.q3",
      kind: "mc",
      prompt:
        "Which scan error is most often associated with a pilot who stares at the heading indicator while altitude drifts?",
      choices: ["Omission", "Reversal", "Emphasis", "Fixation"],
      answer: 3,
      explanation:
        "Fixation is concentrating on a single instrument to the exclusion of others. Omission is leaving an instrument out altogether, and emphasis is relying on one instrument for information it cannot fully provide.",
      subject: "Flight Instruments",
      reference: "IFH Ch. 6",
    }),
    q({
      id: "ifr.fundamentals.q4",
      kind: "scenario",
      context:
        "In IMC the attitude indicator shows a nose-high attitude. Airspeed is decreasing and the altimeter is climbing.",
      prompt: "What is the correct initial recovery action?",
      choices: [
        "Reduce power and pull back",
        "Add power and lower the nose",
        "Level the wings with aileron only",
        "Extend flaps",
      ],
      answer: 1,
      explanation:
        "For a nose-high unusual attitude with decreasing airspeed, add power and lower the nose to prevent a stall, then level the wings. Reducing power is part of the nose-LOW recovery.",
      subject: "Flight Instruments",
      reference: "IFH Ch. 7",
    }),
    q({
      id: "ifr.fundamentals.q5",
      kind: "mc",
      prompt: "During the taxi check before an IFR flight, a turn to the left should show:",
      choices: [
        "Turn coordinator showing a left turn with the ball moving right, heading decreasing",
        "Turn coordinator showing a left turn with the ball moving left, heading increasing",
        "Attitude indicator banking 15° left",
        "No movement of any instrument",
      ],
      answer: 0,
      explanation:
        "Turning left, the miniature airplane shows a left turn, the ball swings to the outside (right) and the heading decreases. The attitude indicator should remain essentially level during taxi turns.",
      subject: "Flight Instruments",
      reference: "IFH Ch. 5",
    }),
    q({
      id: "ifr.fundamentals.q6",
      kind: "tf",
      prompt:
        "True or false: during the transition into a turn, the attitude indicator is the primary bank instrument.",
      choices: ["True", "False"],
      answer: 0,
      explanation:
        "True. While establishing the bank, the attitude indicator shows the change directly. Once the standard-rate turn is established, the turn coordinator becomes primary for bank.",
      subject: "Flight Instruments",
      reference: "IFH Ch. 6",
    }),
    q({
      id: "ifr.fundamentals.q7",
      kind: "calc",
      prompt:
        "You are climbing at 600 fpm to 6,000 ft. Using the 10% rule, at what altitude should you begin the level-off?",
      choices: ["5,400 ft", "5,800 ft", "5,940 ft", "6,000 ft"],
      answer: 2,
      explanation:
        "Lead by about 10% of the vertical speed: 10% of 600 fpm = 60 ft, so start leveling at about 5,940 ft. Starting at 5,400 ft would level off far too early.",
      subject: "Flight Instruments",
      reference: "IFH Ch. 7",
    }),
  ],
  practice: [
    link("/avionics", "Avionics lab"),
    link("/simulator?scenario=emg-vacuum", "Partial panel"),
    link("/simulator?scenario=ifr-departure", "IFR departure"),
  ],
};
