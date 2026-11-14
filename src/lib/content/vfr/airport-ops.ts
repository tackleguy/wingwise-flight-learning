import type { Module } from "../types";
import { caution, check, diagram, h, info, link, p, practice, q, table, tip, ul, warning } from "../builders";

export const airportOps: Module = {
  id: "airport-ops",
  number: 12,
  title: "Airport Operations",
  summary:
    "Runway and taxiway markings, airport signs, lighting systems, wind indicators, wake turbulence avoidance and preventing runway incursions.",
  lessons: [
    {
      id: "vfr.airport-ops.1",
      title: "Runway Markings and Airport Signs",
      minutes: 10,
      objectives: [
        "Identify runway markings including displaced thresholds and blast pads",
        "Recognize holding position markings and know which side to stop on",
        "Interpret mandatory, location, direction, destination and information signs",
      ],
      blocks: [
        h("Runway numbers and markings"),
        p(
          "Runway numbers are the runway's magnetic direction rounded to the nearest 10° with the last zero dropped: a runway aligned with 168° magnetic is runway 17, and the opposite end is runway 35. Parallel runways add L (left), C (center) or R (right). Runway markings are white; taxiway markings are yellow.",
        ),
        diagram(
          "runway-markings",
          "Precision instrument runway markings: threshold, designation, touchdown zone, aiming point, side stripes and centerline. Explore displaced threshold and blast pad markings.",
        ),
        table(
          ["Marking", "Meaning and use"],
          [
            ["Threshold bars", "Beginning of the runway available for landing"],
            ["Displaced threshold (white arrows leading to a white bar)", "The area before the bar may be used for taxi, takeoff and the landing rollout from the opposite direction, but NOT for touchdown"],
            ["Blast pad / stopway (yellow chevrons)", "Not usable for taxi, takeoff or landing (except a stopway for an aborted takeoff where authorized)"],
            ["Aiming point (large rectangular bars)", "Visual aiming point for landing, about 1,000 ft from the threshold"],
            ["Closed runway or taxiway (yellow or white X)", "Closed to all operations"],
          ],
        ),
        h("Holding position markings"),
        p(
          "Runway holding position markings are four yellow lines across the taxiway — two solid and two dashed. The solid lines are on the side where you must stop. When you approach from the solid side, do not cross without an ATC clearance (at a towered airport) or until you have made sure the runway is clear (at a non-towered airport). From the dashed side, you are exiting the runway: you are not clear until the entire airplane has crossed the lines.",
        ),
        warning(
          "Never cross a hold line without a clearance",
          "At a towered airport, an explicit clearance is required to enter or cross any runway. If in doubt, stop and ask. Runway incursions are among the most serious safety risks at airports.",
        ),
        h("Airport signs"),
        table(
          ["Sign type", "Colors", "Example / meaning"],
          [
            ["Mandatory instruction", "White text on red", "Runway holding position (e.g., '22-4'), ILS critical area, 'NO ENTRY'"],
            ["Location", "Yellow text and border on black", "Taxiway or runway you are on (e.g., 'B')"],
            ["Direction", "Black text on yellow, with arrows", "Direction to taxiways leading away from an intersection"],
            ["Destination", "Black text on yellow, with arrow", "Direction to a destination such as a runway or 'FBO'"],
            ["Information", "Black text on yellow", "Radio frequencies, noise-abatement procedures"],
            ["Runway distance remaining", "White numbers on black", "Thousands of feet of runway remaining"],
          ],
        ),
        check({
          id: "vfr.airport-ops.1.k1",
          kind: "mc",
          prompt: "A sign with a black background and a yellow inscription and border indicates:",
          choices: [
            "A mandatory instruction",
            "The taxiway or runway on which the aircraft is located",
            "The direction to a destination",
            "Runway distance remaining",
          ],
          answer: 1,
          explanation:
            "Black with yellow text is a location sign — it tells you where you are. Direction and destination signs are the reverse (black text on yellow). Mandatory signs are white on red.",
          subject: "Airport Operations",
          reference: "AIM 2-3-9",
        }),
        check({
          id: "vfr.airport-ops.1.k2",
          kind: "mc",
          prompt: "The portion of a runway before a displaced threshold may be used for:",
          choices: [
            "Taxi, takeoff and landing rollout, but not touchdown",
            "Landing only",
            "Nothing — it is closed",
            "Taxi only",
          ],
          answer: 0,
          explanation:
            "A displaced threshold area is available for taxiing, takeoffs and the rollout of landings from the opposite direction, but not for touchdown. Areas marked with yellow chevrons (blast pads) are the ones that are unusable.",
          subject: "Airport Operations",
          reference: "AIM 2-3-3",
        }),
      ],
    },
    {
      id: "vfr.airport-ops.2",
      title: "Airport Lighting, Wind Indicators and Wake Turbulence",
      minutes: 11,
      objectives: [
        "Interpret airport beacons, approach slope indicators and runway lights",
        "Activate pilot-controlled lighting",
        "Avoid wake turbulence on takeoff and landing",
      ],
      blocks: [
        h("Airport lighting"),
        table(
          ["Lighting", "Meaning"],
          [
            ["Beacon: alternating white and green", "Lighted land airport"],
            ["Beacon: white, white, green (dual-peaked white)", "Military airport"],
            ["Beacon: white and yellow", "Lighted water airport"],
            ["Runway edge lights", "White (on instrument runways, yellow on the last 2,000 ft or half the runway, whichever is less)"],
            ["Threshold lights", "Green when seen on approach; runway end lights show red toward the runway"],
            ["Taxiway edge lights", "Blue"],
            ["Taxiway centerline lights", "Green"],
          ],
        ),
        info(
          "Daytime beacon",
          "In Class B, C, D and E surface areas, operation of the airport beacon during daylight often indicates that the ground visibility is less than 3 miles and/or the ceiling is less than 1,000 ft — but there is no regulatory requirement for this, so do not rely on it.",
        ),
        h("Visual glide slope indicators"),
        p(
          "A PAPI (precision approach path indicator) is a row of four lights, usually on the left side of the runway. Two white and two red means you are on the glide path (usually 3°). More white means high; more red means low — four red is well below the glide path. The older two-bar VASI shows red over white when on glidepath: 'red over white, you're all right'. VASI and PAPI typically provide obstruction clearance within ±10° of the extended centerline out to 4 NM.",
        ),
        check({
          id: "vfr.airport-ops.2.k1",
          kind: "mc",
          prompt: "On approach, the PAPI shows three white lights and one red light. You are:",
          choices: ["On the glide path", "Slightly above the glide path", "Slightly below the glide path", "Well below the glide path"],
          answer: 1,
          explanation:
            "More white means higher. Two white and two red is on glide path; three white and one red is slightly high. Four red would be well below.",
          subject: "Airport Operations",
          reference: "AIM 2-1-2",
        }),
        h("Pilot-controlled lighting"),
        p(
          "At many non-towered airports you turn on the runway lights by keying the microphone on the CTAF or a designated frequency. The standard system: key 7 times within 5 seconds for high intensity, 5 times for medium and 3 times for low. Lights typically stay on for 15 minutes. Key 7 times first to be sure the system activates, then select the intensity you want.",
        ),
        h("Wind indicators"),
        p(
          "A wind cone (windsock) shows wind direction and approximate speed; it points downwind and is fully extended in strong wind. A segmented circle surrounds the wind indicator and may include landing strip indicators and traffic pattern indicators — L-shaped markers showing the direction of turns in the pattern for each runway.",
        ),
        h("Wake turbulence"),
        p(
          "Every wing producing lift sheds wingtip vortices. Behind a large airplane they can roll a light airplane beyond its control limits. Vortices sink — typically several hundred feet per minute, leveling off about 500 to 900 ft below the generating aircraft's flight path — and drift with the wind. Near the ground they move outward at about 2 to 3 knots; a light crosswind can hold the upwind vortex over the runway, and a light quartering tailwind can move vortices forward into your touchdown zone.",
        ),
        ul(
          "Landing behind a larger aircraft on the same runway: stay at or above its flight path and land beyond its touchdown point.",
          "Departing behind a larger aircraft: rotate before its rotation point and climb above its flight path, or wait.",
          "Landing behind a departing larger aircraft: land well before its rotation point.",
          "Crossing behind: cross above its flight path.",
        ),
        caution(
          "Helicopters too",
          "A hovering or slow-moving helicopter produces strong downwash and vortices. Avoid taxiing or flying close behind one.",
        ),
        tip(
          "Runway incursion prevention",
          "Review the airport diagram and hot spots before taxi, write down taxi instructions, read back all hold-short instructions, keep your head up on the taxiway, and never hesitate to ask for progressive taxi instructions.",
        ),
        practice("/airports", "Airport diagrams", "Study airport diagrams and hot spots before your next flight."),
      ],
    },
  ],
  flashcards: [
    { id: "vfr.airport-ops.fc1", front: "Holding position markings", back: "Four yellow lines, two solid and two dashed; stop on the solid side." },
    { id: "vfr.airport-ops.fc2", front: "Location sign colors", back: "Yellow text and border on a black background." },
    { id: "vfr.airport-ops.fc3", front: "PAPI 2 white / 2 red", back: "On the glide path." },
    { id: "vfr.airport-ops.fc4", front: "Pilot-controlled lighting — high intensity", back: "Key the mic 7 times within 5 seconds." },
    { id: "vfr.airport-ops.fc5", front: "Beacon for a lighted civilian land airport", back: "Alternating white and green." },
    { id: "vfr.airport-ops.fc6", front: "Landing behind a large aircraft", back: "Stay at or above its flight path and land beyond its touchdown point." },
  ],
  quiz: [
    q({
      id: "vfr.airport-ops.q1",
      kind: "mc",
      prompt: "The numbers 8 and 26 on the approach ends of a runway indicate that the runway is oriented approximately:",
      choices: ["008° and 026° true", "080° and 260° true", "080° and 260° magnetic", "008° and 026° magnetic"],
      answer: 2,
      explanation:
        "Runway numbers are magnetic headings rounded to the nearest 10° with the final zero dropped: 080° and 260° magnetic. They are not true headings.",
      subject: "Airport Operations",
      reference: "AIM 2-3-3",
    }),
    q({
      id: "vfr.airport-ops.q2",
      kind: "mc",
      prompt: "Yellow chevrons on the approach end of a runway mark an area that is:",
      choices: [
        "Usable for taxi and takeoff only",
        "A displaced threshold",
        "Unusable for taxi, takeoff or landing",
        "A runway safety area usable for landing in an emergency only",
      ],
      answer: 2,
      explanation:
        "Yellow chevrons mark a blast pad or stopway that is not usable for normal taxi, takeoff or landing. A displaced threshold is marked with white arrows and is usable for taxi and takeoff.",
      subject: "Airport Operations",
      reference: "AIM 2-3-3",
    }),
    q({
      id: "vfr.airport-ops.q3",
      kind: "mc",
      prompt: "When exiting a runway after landing, you are clear of the runway when:",
      choices: [
        "The nose wheel crosses the solid lines",
        "The entire aircraft has crossed the holding position markings",
        "You have turned onto the taxiway",
        "Tower tells you to contact ground",
      ],
      answer: 1,
      explanation:
        "You are not clear until the entire airplane is past the holding position markings. Turning onto the taxiway or getting a frequency change does not by itself make you clear.",
      subject: "Airport Operations",
      reference: "AIM 2-3-5",
    }),
    q({
      id: "vfr.airport-ops.q4",
      kind: "mc",
      prompt: "Taxiway edge lights are:",
      choices: ["Green", "White", "Yellow", "Blue"],
      answer: 3,
      explanation: "Taxiway edge lights are blue; taxiway centerline lights are green. Runway edge lights are white (yellow near the end of instrument runways).",
      subject: "Airport Operations",
      reference: "AIM Ch. 2, Sec. 1",
    }),
    q({
      id: "vfr.airport-ops.q5",
      kind: "scenario",
      context: "You are cleared to land behind a departing Boeing 737 on the same runway.",
      prompt: "How should you plan your landing to avoid its wake?",
      choices: [
        "Land beyond the point where it rotated",
        "Land before the point where it rotated",
        "Land at the normal aiming point regardless",
        "Stay below its flight path and land long",
      ],
      answer: 1,
      explanation:
        "The departing jet starts producing vortices at rotation, so land well before that point. Landing beyond its rotation point would put you in its wake. (Landing behind a LANDING aircraft is the opposite: land beyond its touchdown point.)",
      subject: "Airport Operations",
      reference: "AIM Ch. 7, Wake Turbulence",
    }),
    q({
      id: "vfr.airport-ops.q6",
      kind: "mc",
      prompt: "Which wind condition is most likely to keep wake vortices in the touchdown zone of a runway?",
      choices: ["A strong headwind", "A light quartering tailwind", "A strong crosswind", "Calm wind"],
      answer: 1,
      explanation:
        "A light quartering tailwind can move vortices of a preceding landing aircraft forward into the touchdown zone. A strong wind breaks vortices up quickly; calm wind lets them move outward and sink.",
      subject: "Airport Operations",
      reference: "AIM Ch. 7, Wake Turbulence",
    }),
    q({
      id: "vfr.airport-ops.q7",
      kind: "tf",
      prompt: "True or false: a sign with white letters on a red background is a mandatory instruction sign.",
      choices: ["True", "False"],
      answer: 0,
      explanation:
        "True. Mandatory instruction signs — runway holding position, ILS critical area and no-entry signs — are white on red. Do not proceed past them without a clearance.",
      subject: "Airport Operations",
      reference: "AIM 2-3-8",
    }),
  ],
  practice: [link("/airports", "Airport diagrams and data"), link("/atc", "Taxi communications")],
};
