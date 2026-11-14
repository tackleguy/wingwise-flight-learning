import type { Module } from "../types";
import { caution, check, h, info, link, p, practice, q, table, tip, ul, warning } from "../builders";

export const night: Module = {
  id: "night",
  number: 17,
  title: "Night VFR",
  summary:
    "How your eyes work in the dark, night visual illusions, aircraft and airport lighting, the three 'night' definitions and planning a safe night flight.",
  lessons: [
    {
      id: "vfr.night.1",
      title: "Night Vision and Visual Illusions",
      minutes: 9,
      objectives: [
        "Explain how rods and cones affect night vision",
        "Use dark adaptation and off-center viewing",
        "Recognize night visual illusions and their effect on approaches",
      ],
      blocks: [
        h("Rods and cones"),
        p(
          "The retina has two kinds of light-sensitive cells. Cones are concentrated in the center of the eye; they detect color and fine detail but need good light. Rods are spread around the periphery; they are far more sensitive to dim light and movement but cannot see color. At night, the cones stop working well, which creates a night blind spot right where you look directly.",
        ),
        tip(
          "Look off-center",
          "To see a dim object at night, look 5° to 10° to one side of it so its image falls on the rods, and scan slowly in small steps rather than staring.",
        ),
        h("Dark adaptation"),
        p(
          "The rods take about 30 minutes to fully adapt to darkness, and a single bright light can ruin that adaptation. Avoid bright lights before flight, use dim cockpit lighting, and if you use red light, remember it makes red chart features hard to see. Hypoxia degrades night vision early — even at altitudes as low as about 5,000 ft — so consider supplemental oxygen at night when flying higher, and avoid smoking, which adds carbon monoxide to the blood.",
        ),
        h("Night illusions"),
        table(
          ["Illusion", "What happens", "Risk"],
          [
            ["Autokinesis", "Staring at a single light in the dark makes it appear to move", "Loss of control trying to follow it; keep eyes moving"],
            ["False horizon", "Sloping cloud layers or ground lights mistaken for the horizon", "Flying with the wings banked or nose misaligned"],
            ["Black-hole approach", "Approach over water or unlit terrain to a lighted runway; you feel higher than you are", "Flying a dangerously low approach and landing short"],
            ["Narrow runway / upsloping runway", "Creates the illusion of being higher than actual", "Lower-than-normal approach"],
            ["Wide runway / downsloping runway", "Creates the illusion of being lower than actual", "Higher-than-normal approach"],
            ["Haze", "Objects appear farther away", "Lower-than-normal approach"],
          ],
        ),
        warning(
          "Black-hole approaches kill",
          "On dark nights over water or unlit terrain, use the VASI/PAPI or an instrument approach glide path and cross-check the altimeter. Do not descend below the visual glide slope until close to the runway.",
        ),
        check({
          id: "vfr.night.1.k1",
          kind: "mc",
          prompt: "What is the best technique for seeing objects at night?",
          choices: [
            "Look directly at the object",
            "Use off-center vision, scanning slowly in small sectors",
            "Stare at one point until your eyes adjust",
            "Use bright white cockpit lights",
          ],
          answer: 1,
          explanation:
            "Off-center viewing places the image on the light-sensitive rods. Looking directly puts it in the night blind spot of the cone-rich center, and staring promotes autokinesis.",
          subject: "Night Operations",
          reference: "PHAK Ch. 17",
        }),
        info(
          "Approach lighting",
          "A visual glide slope indicator is your best defense against illusions. If one is not available, plan a slightly steeper, power-on, stabilized approach rather than a long, low drag-in.",
        ),
      ],
    },
    {
      id: "vfr.night.2",
      title: "Night Operations: Lighting, Rules and Planning",
      minutes: 10,
      objectives: [
        "Interpret other aircraft's position lights to determine direction",
        "Distinguish the three regulatory 'night' definitions",
        "Plan fuel, equipment and alternates for a night flight",
      ],
      blocks: [
        h("Aircraft lighting"),
        p(
          "Position (navigation) lights are red on the left wingtip, green on the right wingtip and white on the tail. They must be on from sunset to sunrise (91.209). Anticollision lights (a rotating beacon or strobes) must be on whenever the airplane is operating, unless the PIC turns them off for safety — for example, strobes in clouds or fog that cause disorientation.",
        ),
        table(
          ["What you see", "What the other aircraft is doing"],
          [
            ["Both red and green (green on your left, red on your right)", "Coming toward you head-on — take evasive action"],
            ["Steady white only", "Moving away from you"],
            ["Red (and flashing beacon) only", "Crossing from right to left in front of you"],
            ["Green (and flashing beacon) only", "Crossing from left to right in front of you"],
          ],
        ),
        check({
          id: "vfr.night.2.k1",
          kind: "scenario",
          context: "At night, you see a steady red light and a flashing red light ahead at your altitude.",
          prompt: "What is the other aircraft doing?",
          choices: [
            "Approaching head-on",
            "Crossing to your left",
            "Crossing to your right",
            "Flying away from you",
          ],
          answer: 1,
          explanation:
            "Seeing only the red (left wingtip) light means you are looking at its left side, so it is moving toward your left. Head-on would show both red and green; flying away would show white.",
          subject: "Night Operations",
          reference: "PHAK Ch. 17; AFH Ch. 11",
        }),
        h("Three definitions of 'night'"),
        table(
          ["Purpose", "Definition", "Rule"],
          [
            ["Logging night flight time", "End of evening civil twilight to beginning of morning civil twilight", "14 CFR 1.1, 61.51"],
            ["Night passenger currency", "1 hour after sunset to 1 hour before sunrise", "61.57(b)"],
            ["Aircraft position lights", "Sunset to sunrise", "91.209"],
          ],
        ),
        h("Planning a night flight"),
        ul(
          "Fuel: VFR at night requires enough fuel to reach the first point of intended landing plus 45 minutes at normal cruising speed (91.151).",
          "Equipment: day VFR items plus position lights, anticollision lights, an electrical source and spare fuses if fuses are used (91.205(c)).",
          "Route: favor routes over lighted areas and near airports, and plan higher altitudes for terrain clearance and glide options.",
          "Weather: be wary of a narrow temperature/dew point spread that can produce fog after dark, and of clouds you cannot see.",
          "Bring at least one flashlight (with a red mode) and a backup, and know where the airport lighting frequency is.",
        ),
        caution(
          "Clouds are invisible at night",
          "On a dark night, the first sign of flying into a cloud may be the ground lights disappearing or a halo around your strobes. If that happens, turn back immediately using your instruments.",
        ),
        tip(
          "Preflight in daylight",
          "When possible, preflight before dark. Small fluid leaks, damage and contamination are much harder to see with a flashlight.",
        ),
        practice("/simulator?scenario=vfr-landing", "Night landing", "Fly approaches to a lighted runway and use the PAPI to avoid a black-hole approach."),
      ],
    },
  ],
  flashcards: [
    { id: "vfr.night.fc1", front: "Time for full dark adaptation", back: "About 30 minutes." },
    { id: "vfr.night.fc2", front: "Off-center viewing", back: "Look 5°–10° to the side of an object at night so its image falls on the rods." },
    { id: "vfr.night.fc3", front: "Autokinesis", back: "A stationary light stared at in the dark appears to move." },
    { id: "vfr.night.fc4", front: "Left wingtip position light color", back: "Red (right is green, tail is white)." },
    { id: "vfr.night.fc5", front: "Position lights required", back: "Sunset to sunrise (91.209)." },
    { id: "vfr.night.fc6", front: "Black-hole approach tendency", back: "Feeling higher than actual — leading to a dangerously low approach." },
  ],
  quiz: [
    q({
      id: "vfr.night.q1",
      kind: "mc",
      prompt: "Which cells in the eye are primarily responsible for night vision?",
      choices: ["Cones", "Rods", "The fovea", "The optic nerve"],
      answer: 1,
      explanation:
        "Rods are sensitive to dim light and are located around the periphery. Cones, concentrated in the fovea, need bright light and are responsible for color and detail.",
      subject: "Night Operations",
      reference: "PHAK Ch. 17",
    }),
    q({
      id: "vfr.night.q2",
      kind: "mc",
      prompt: "A narrower-than-usual runway can create the illusion that the aircraft is:",
      choices: [
        "Higher than it actually is, leading to a low approach",
        "Lower than it actually is, leading to a high approach",
        "Farther from the runway than it is",
        "In a bank",
      ],
      answer: 0,
      explanation:
        "A narrow runway looks like a normal runway seen from higher up, so pilots tend to fly lower than normal. A wider-than-usual runway has the opposite effect.",
      subject: "Human Factors",
      reference: "AIM 8-1-5",
    }),
    q({
      id: "vfr.night.q3",
      kind: "mc",
      prompt: "For night passenger-carrying currency, 'night' is defined as:",
      choices: [
        "Sunset to sunrise",
        "End of evening civil twilight to beginning of morning civil twilight",
        "1 hour after sunset to 1 hour before sunrise",
        "30 minutes after sunset to 30 minutes before sunrise",
      ],
      answer: 2,
      explanation:
        "61.57(b) uses 1 hour after sunset to 1 hour before sunrise. Civil twilight is for logging night time, and sunset to sunrise is for position lights.",
      subject: "Regulations",
      reference: "14 CFR 61.57(b)",
    }),
    q({
      id: "vfr.night.q4",
      kind: "scenario",
      context: "At night you see only a steady white light and a flashing anticollision light ahead at about your altitude. The lights are not getting brighter.",
      prompt: "What should you conclude?",
      choices: [
        "The aircraft is moving away from you",
        "The aircraft is approaching head-on",
        "The aircraft is crossing right to left",
        "Nothing can be determined from lights",
      ],
      answer: 0,
      explanation:
        "The white position light is on the tail, so seeing only white means you are looking at the aircraft from behind — it is moving away. Head-on would show both red and green; crossing right to left would show its red left wingtip light.",
      subject: "Night Operations",
      reference: "PHAK Ch. 17; AFH Ch. 11",
    }),
    q({
      id: "vfr.night.q5",
      kind: "tf",
      prompt: "True or false: the VFR fuel reserve requirement at night is 30 minutes at normal cruise speed.",
      choices: ["True", "False"],
      answer: 1,
      explanation: "False. The night requirement is 45 minutes; 30 minutes is the day requirement (91.151).",
      subject: "Regulations",
      reference: "14 CFR 91.151",
    }),
    q({
      id: "vfr.night.q6",
      kind: "mc",
      prompt: "What is the best defense against a black-hole approach illusion?",
      choices: [
        "Fly a long, flat, low approach",
        "Look directly at the runway lights without scanning",
        "Turn off the landing light",
        "Use a visual glide slope indicator or instrument glide path and cross-check the altimeter",
      ],
      answer: 3,
      explanation:
        "A VASI/PAPI or electronic glide path gives an objective reference, and the altimeter confirms height. A long, low approach is exactly what the illusion produces.",
      subject: "Night Operations",
      reference: "AIM 8-1-5",
    }),
  ],
  practice: [link("/simulator?scenario=vfr-landing", "Night landings"), link("/simulator?scenario=vfr-pattern", "Night pattern")],
};
