import type { Module } from "../types";
import { caution, check, h, info, link, p, practice, q, table, tip, ul } from "../builders";

export const adm: Module = {
  id: "adm",
  number: 18,
  title: "Decision-Making and Risk Management",
  summary:
    "Aeronautical decision-making models, hazardous attitudes and their antidotes, risk assessment with PAVE and IMSAFE, and the human factors that degrade pilot performance.",
  lessons: [
    {
      id: "vfr.adm.1",
      title: "Aeronautical Decision-Making and Hazardous Attitudes",
      minutes: 10,
      objectives: [
        "Describe the DECIDE and 3P decision-making models",
        "Identify the five hazardous attitudes and their antidotes",
        "Recognize operational pitfalls such as get-there-itis and scud running",
      ],
      blocks: [
        h("Why ADM"),
        p(
          "Most general aviation accidents involve pilot decisions rather than a lack of stick-and-rudder skill. Aeronautical decision-making (ADM) is a systematic approach to consistently choosing the best course of action. It is a skill you can learn and practice, just like landings.",
        ),
        h("Two models"),
        table(
          ["DECIDE model", "3P model"],
          [
            ["Detect that a change has occurred", "Perceive the hazards"],
            ["Estimate the need to react", "Process — evaluate the level of risk"],
            ["Choose a desirable outcome", "Perform — act to mitigate the risk, then repeat"],
            ["Identify actions to control the change", ""],
            ["Do the necessary action", ""],
            ["Evaluate the effect of the action", ""],
          ],
        ),
        h("Hazardous attitudes"),
        p(
          "The FAA identifies five attitudes that lead to poor decisions. Recognizing one in yourself is the first step; the second is to say the antidote — out loud if necessary.",
        ),
        table(
          ["Attitude", "Thinking", "Antidote"],
          [
            ["Anti-authority", "'Don't tell me.'", "'Follow the rules. They are usually right.'"],
            ["Impulsivity", "'Do it quickly.'", "'Not so fast. Think first.'"],
            ["Invulnerability", "'It won't happen to me.'", "'It could happen to me.'"],
            ["Macho", "'I can do it.'", "'Taking chances is foolish.'"],
            ["Resignation", "'What's the use?'", "'I'm not helpless. I can make a difference.'"],
          ],
        ),
        check({
          id: "vfr.adm.1.k1",
          kind: "scenario",
          context:
            "A pilot is told by Flight Service that VFR flight is not recommended along the route. The pilot thinks: 'Those briefers are always overly cautious. I'll go anyway.'",
          prompt: "Which hazardous attitude is this?",
          choices: ["Invulnerability", "Anti-authority", "Resignation", "Impulsivity"],
          answer: 1,
          explanation:
            "Resenting or dismissing advice and rules is anti-authority; the antidote is 'Follow the rules, they are usually right.' Invulnerability is 'it won't happen to me', which is related but focuses on personal risk rather than rejecting authority.",
          subject: "ADM",
          reference: "PHAK Ch. 2",
        }),
        h("Operational pitfalls"),
        ul(
          "Get-there-itis (plan continuation bias): fixation on the destination that clouds judgment of changing conditions.",
          "Scud running: pushing below lowering ceilings to stay visual, often into terrain or obstacles.",
          "Continuing VFR into IMC: one of the leading causes of fatal GA accidents.",
          "Peer pressure and duck-under syndrome: descending below minimums to 'have a look'.",
          "Getting behind the airplane, loss of situational awareness, and neglect of flight planning, preflight or checklists.",
          "Operating without adequate fuel reserves.",
        ),
        tip(
          "Have an out",
          "Always know where you would go if the plan fails — an alternate airport, a turn-back point, a fuel decision time. Pilots with a planned exit use it; pilots without one keep going.",
        ),
      ],
    },
    {
      id: "vfr.adm.2",
      title: "Risk Management and Human Factors",
      minutes: 11,
      objectives: [
        "Assess risk with the PAVE and IMSAFE checklists",
        "Recognize hypoxia, hyperventilation and carbon monoxide poisoning",
        "Describe common vestibular illusions and spatial disorientation",
      ],
      blocks: [
        h("PAVE"),
        table(
          ["Risk element", "Questions to ask"],
          [
            ["P — Pilot", "Am I current, proficient and fit (IMSAFE)? Within personal minimums?"],
            ["A — Aircraft", "Airworthy? Right equipment? Enough performance and fuel for today's conditions?"],
            ["V — enVironment", "Weather, terrain, airports, airspace, night?"],
            ["E — External pressures", "Schedules, passengers, people waiting, the desire to impress, cost of a hotel?"],
          ],
        ),
        h("IMSAFE"),
        ul(
          "Illness — any symptoms?",
          "Medication — prescription or over-the-counter drugs that impair? The FAA advises waiting at least five times the maximum dosing interval after a sedating medication.",
          "Stress — psychological pressure from work, family or finances?",
          "Alcohol — at least 8 hours bottle to throttle, BAC below 0.04, and not under the influence (many pilots use 12–24 hours).",
          "Fatigue — adequately rested?",
          "Emotion (or Eating) — emotionally upset? Properly nourished and hydrated?",
        ),
        h("Hypoxia"),
        table(
          ["Type", "Cause"],
          [
            ["Hypoxic", "Not enough oxygen in the air at altitude"],
            ["Hypemic (anemic)", "Blood cannot carry enough oxygen — carbon monoxide, anemia, blood donation"],
            ["Stagnant", "Poor circulation — excessive G-forces, cold, shock"],
            ["Histotoxic", "Cells cannot use oxygen — alcohol, drugs, certain poisons"],
          ],
        ),
        p(
          "Hypoxia is insidious: early symptoms include euphoria, impaired judgment, headache, drowsiness and tingling, and many people feel fine until they are seriously impaired. Time of useful consciousness shrinks rapidly with altitude. Carbon monoxide from a leaking exhaust or heater shroud causes hypemic hypoxia; symptoms include headache, drowsiness and dizziness. If you suspect CO, turn off the cabin heat, open fresh-air vents and land.",
        ),
        info(
          "Hyperventilation",
          "Breathing too fast or deeply — often from anxiety — blows off too much carbon dioxide. Symptoms (lightheadedness, tingling, visual impairment) resemble hypoxia. Slow your breathing rate, talk aloud or breathe into a paper bag. If oxygen is in use, check the equipment first, since hypoxia is more dangerous.",
        ),
        check({
          id: "vfr.adm.2.k1",
          kind: "mc",
          prompt: "Carbon monoxide poisoning produces which type of hypoxia?",
          choices: ["Hypoxic", "Stagnant", "Hypemic", "Histotoxic"],
          answer: 2,
          explanation:
            "CO binds to hemoglobin far more readily than oxygen, so the blood cannot carry oxygen — hypemic hypoxia. Histotoxic hypoxia is when cells cannot USE oxygen, as with alcohol.",
          subject: "Human Factors",
          reference: "PHAK Ch. 17",
        }),
        h("Spatial disorientation"),
        p(
          "Your inner ear (vestibular system) senses accelerations, not steady motion, and it can be fooled. Without a visual horizon, your body will give you false information with complete conviction.",
        ),
        table(
          ["Illusion", "Cause and effect"],
          [
            ["The leans", "After an unnoticed gradual bank, abruptly leveling the wings creates the sensation of banking the other way"],
            ["Graveyard spiral", "In a prolonged coordinated turn the sensation of turning fades; the pilot notices altitude loss, pulls back and tightens the spiral"],
            ["Coriolis illusion", "An abrupt head movement during a prolonged constant-rate turn produces an overwhelming sensation of tumbling — the most overwhelming of the illusions"],
            ["Somatogravic", "Rapid acceleration feels like a nose-up attitude, tempting the pilot to push forward — dangerous on a dark night takeoff or go-around"],
            ["Inversion", "An abrupt change from climb to level flight creates the illusion of tumbling backward"],
          ],
        ),
        caution(
          "Trust the instruments",
          "The only defense against spatial disorientation without outside references is to fly by the instruments and believe them. Avoid flight in conditions where you might lose visual references unless you are instrument-rated and current.",
        ),
        info(
          "Scuba diving",
          "After a dive that did not require a controlled ascent, wait at least 12 hours before flying up to 8,000 ft cabin altitude, and at least 24 hours before flying above 8,000 ft or after any dive requiring a controlled ascent (AIM 8-1-2).",
        ),
        practice("/simulator?scenario=emg-weather", "Weather decision scenario", "Make go/no-go and diversion decisions as conditions deteriorate."),
      ],
    },
  ],
  flashcards: [
    { id: "vfr.adm.fc1", front: "Antidote for 'It won't happen to me'", back: "'It could happen to me.' (Invulnerability)" },
    { id: "vfr.adm.fc2", front: "Antidote for 'Do it quickly'", back: "'Not so fast. Think first.' (Impulsivity)" },
    { id: "vfr.adm.fc3", front: "PAVE", back: "Pilot, Aircraft, enVironment, External pressures." },
    { id: "vfr.adm.fc4", front: "IMSAFE", back: "Illness, Medication, Stress, Alcohol, Fatigue, Emotion/Eating." },
    { id: "vfr.adm.fc5", front: "Four types of hypoxia", back: "Hypoxic, hypemic, stagnant, histotoxic." },
    { id: "vfr.adm.fc6", front: "The leans", back: "After leveling from an unnoticed bank, a false sensation of banking the opposite way." },
  ],
  quiz: [
    q({
      id: "vfr.adm.q1",
      kind: "mc",
      prompt: "Which hazardous attitude is reflected by 'I can do it — watch this'?",
      choices: ["Macho", "Impulsivity", "Anti-authority", "Resignation"],
      answer: 0,
      explanation:
        "Trying to prove oneself and take chances to impress others is the macho attitude. The antidote: 'Taking chances is foolish.'",
      subject: "ADM",
      reference: "PHAK Ch. 2",
    }),
    q({
      id: "vfr.adm.q2",
      kind: "mc",
      prompt: "The antidote for the resignation attitude is:",
      choices: ["'Follow the rules.'", "'Not so fast, think first.'", "'It could happen to me.'", "'I'm not helpless. I can make a difference.'"],
      answer: 3,
      explanation:
        "Resignation ('What's the use?') is countered with 'I'm not helpless.' The other choices are the antidotes for anti-authority, impulsivity and invulnerability.",
      subject: "ADM",
      reference: "PHAK Ch. 2",
    }),
    q({
      id: "vfr.adm.q3",
      kind: "scenario",
      context:
        "You promised to bring three friends to a family event 200 NM away. The forecast shows marginal VFR at the destination, your passengers are already at the airport, and returning tomorrow would mean a hotel bill.",
      prompt: "In the PAVE model, which element is creating the most pressure on your decision?",
      choices: ["Pilot", "Aircraft", "enVironment", "External pressures"],
      answer: 3,
      explanation:
        "Commitments, waiting passengers and costs are external pressures — often the most dangerous element because they push you to accept risks you would otherwise reject. The weather (environment) is the hazard, but the pressure to go comes from outside factors.",
      subject: "ADM",
      reference: "PHAK Ch. 2",
    }),
    q({
      id: "vfr.adm.q4",
      kind: "mc",
      prompt: "Rapid or extra-deep breathing while under stress may result in:",
      choices: ["Hypoxia", "Hyperventilation", "Spatial disorientation", "Carbon monoxide poisoning"],
      answer: 1,
      explanation:
        "Over-breathing reduces CO2 in the blood, causing hyperventilation. Its symptoms resemble hypoxia, which is why it is easily confused, but the cause and treatment are different.",
      subject: "Human Factors",
      reference: "PHAK Ch. 17",
    }),
    q({
      id: "vfr.adm.q5",
      kind: "mc",
      prompt: "An abrupt head movement during a prolonged constant-rate turn in IMC may cause:",
      choices: ["The leans", "Coriolis illusion", "Autokinesis", "Somatogravic illusion"],
      answer: 1,
      explanation:
        "Moving the head during a sustained turn stimulates multiple semicircular canals and produces the overwhelming tumbling sensation of the Coriolis illusion. The leans follow an abrupt roll-out from an unnoticed bank.",
      subject: "Human Factors",
      reference: "PHAK Ch. 17",
    }),
    q({
      id: "vfr.adm.q6",
      kind: "tf",
      prompt: "True or false: a pilot experiencing hypoxia will usually notice the symptoms early and clearly.",
      choices: ["True", "False"],
      answer: 1,
      explanation:
        "False. Hypoxia is insidious — impaired judgment and euphoria can make the pilot feel fine. This is why oxygen rules and altitude awareness matter.",
      subject: "Human Factors",
      reference: "PHAK Ch. 17",
    }),
    q({
      id: "vfr.adm.q7",
      kind: "mc",
      prompt: "In the DECIDE model, what is the first step?",
      choices: ["Do the necessary action", "Detect that a change has occurred", "Determine the best outcome", "Delegate tasks"],
      answer: 1,
      explanation:
        "DECIDE begins with Detect — recognizing that something has changed and requires attention. You cannot respond to a problem you have not noticed.",
      subject: "ADM",
      reference: "PHAK Ch. 2",
    }),
  ],
  practice: [link("/simulator?scenario=emg-weather", "Weather decision scenario"), link("/weather", "Go/no-go with real weather")],
};
