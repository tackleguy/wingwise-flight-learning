import type { Module } from "../types";
import { caution, check, h, info, link, ol, p, practice, q, table, tip, ul, warning } from "../builders";

export const emergencies: Module = {
  id: "emergencies",
  number: 7,
  title: "IFR Emergency Procedures",
  summary:
    "Two-way radio communications failure under 91.185, partial-panel flying after instrument failure, navigation failures, weather emergencies, minimum fuel and diversions.",
  lessons: [
    {
      id: "ifr.emergencies.1",
      title: "Lost Communications (14 CFR 91.185)",
      minutes: 12,
      objectives: [
        "Apply the route rule: assigned, vectored, expected, filed (AVE-F)",
        "Apply the altitude rule: highest of assigned, MEA and expected",
        "Know when to leave the clearance limit and begin the approach",
      ],
      blocks: [
        h("First steps"),
        p(
          "Most 'lost comm' events are not real radio failures — a wrong frequency, a volume knob, a stuck mic or flying out of range. Before concluding the radio has failed, check the audio panel, volume and squelch, try the previous frequency, the other radio, Flight Service, 121.5 MHz and a nearby facility. If it is a real failure, squawk 7600 and follow 91.185.",
        ),
        h("If you are in VFR conditions"),
        p(
          "If the failure occurs in VFR conditions, or if VFR conditions are encountered after the failure, continue the flight under VFR and land as soon as practicable (91.185(b)). 'As soon as practicable' does not mean at the nearest airport regardless of suitability — but it does mean you should not continue a long IFR flight when you could land safely in VFR.",
        ),
        h("If you are in IFR conditions: route"),
        table(
          ["Priority", "Route to fly"],
          [
            ["A — Assigned", "By the route assigned in the last ATC clearance received"],
            ["V — Vectored", "If being radar vectored, by the direct route from the point of failure to the fix, route or airway specified in the vector clearance"],
            ["E — Expected", "In the absence of an assigned route, by the route ATC has advised may be expected in a further clearance"],
            ["F — Filed", "In the absence of the above, by the route filed in the flight plan"],
          ],
        ),
        h("Altitude: MEA"),
        p(
          "Fly the HIGHEST of the following for the route segment being flown: the altitude or flight level assigned in the last ATC clearance; the minimum altitude (converted, if appropriate, to minimum flight level) for IFR operations — typically the MEA; or the altitude or flight level ATC has advised may be expected in a further clearance. Many pilots remember it as 'MEA': Minimum, Expected, Assigned — highest of the three, re-evaluated for each segment.",
        ),
        check({
          id: "ifr.emergencies.1.k1",
          kind: "scenario",
          context:
            "You were cleared to 5,000 ft and told 'expect 9,000 ten minutes after departure'. Ten minutes after departure, in IMC, your radios fail. The MEA on your current segment is 6,000 ft and on a later segment 10,000 ft.",
          prompt: "What altitudes should you fly?",
          choices: [
            "5,000 ft for the whole flight",
            "6,000 ft now, then 10,000 ft on the later segment",
            "9,000 ft now, then 10,000 ft when reaching the segment with the 10,000-ft MEA",
            "9,000 ft for the whole flight",
          ],
          answer: 2,
          explanation:
            "Fly the highest of assigned (5,000), MEA (6,000) and expected (9,000, now that the expected time has passed) — 9,000 ft. On the segment where the MEA is 10,000 ft, climb to 10,000, then return to 9,000 if a later segment's MEA is lower. 5,000 ft is below the MEA.",
          subject: "Emergency Procedures",
          reference: "14 CFR 91.185(c)(2)",
        }),
        h("Leaving the clearance limit"),
        ul(
          "If the clearance limit is a fix from which an approach begins: start the descent, or descent and approach, as close as possible to the expect-further-clearance (EFC) time if one was received; if not, as close as possible to the ETA calculated from the filed or amended (with ATC) estimated time en route.",
          "If the clearance limit is not a fix from which an approach begins: leave the clearance limit at the EFC time if one was received, or if none, upon arrival at the clearance limit; proceed to a fix from which an approach begins and commence descent or descent and approach as close as possible to the ETA calculated from the filed or amended estimated time en route.",
        ),
        info(
          "Holding while you wait",
          "If you arrive at the approach fix before the EFC or ETA, hold there (using a published hold if one exists) until it is time to begin the approach. ATC protects the airspace around your expected route and timing.",
        ),
        tip(
          "Get an EFC",
          "Whenever you are told to hold, make sure you have an EFC time. It is the anchor for your lost-communication plan.",
        ),
        practice("/simulator?scenario=emg-radio", "Lost comms", "Lose your radios in IMC and fly the 91.185 route and altitude to the approach."),
      ],
    },
    {
      id: "ifr.emergencies.2",
      title: "Instrument and Navigation Failures, Weather Emergencies and Diversion",
      minutes: 12,
      objectives: [
        "Fly partial panel after an attitude or heading indicator failure",
        "Respond to a GPS or navigation receiver failure and report it under 91.187",
        "Handle unforecast icing, thunderstorms, low fuel and diversions",
      ],
      blocks: [
        h("Recognizing an instrument failure"),
        p(
          "Gyro failures are often gradual: a vacuum pump failure lets the attitude and heading indicators slowly tilt and drift, and an unwary pilot follows them into an unusual attitude. The defense is a disciplined cross-check: when the attitude indicator disagrees with the turn coordinator, altimeter, VSI and airspeed, believe the majority. Check the suction gauge and any warning annunciators, then cover the failed instruments.",
        ),
        h("Partial panel"),
        table(
          ["Control", "Instruments to use without the AI and HI"],
          [
            ["Pitch", "Altimeter, VSI and airspeed indicator"],
            ["Bank", "Turn coordinator (standard-rate turns) and magnetic compass"],
            ["Heading", "Magnetic compass, timed turns at 3°/second"],
          ],
        ),
        ul(
          "Tell ATC immediately and ask for help: block altitudes, vectors and a no-gyro approach if needed.",
          "A no-gyro (radar) approach: ATC tells you 'turn left/right' and 'stop turn'. Make standard-rate turns until established on final, then half-standard-rate turns.",
          "Use the autopilot if it is still working and does not depend on the failed instrument.",
          "Land at the nearest airport with suitable weather — partial panel in IMC is an emergency.",
        ),
        check({
          id: "ifr.emergencies.2.k1",
          kind: "mc",
          prompt: "On a no-gyro radar approach, how should you make turns after being established on final?",
          choices: [
            "Standard-rate turns",
            "Half-standard-rate turns",
            "Turns at 30° of bank",
            "Turns using the magnetic compass only",
          ],
          answer: 1,
          explanation:
            "ATC expects standard-rate turns until you are on final, then half-standard-rate turns for the small corrections on final. Using standard rate on final would overshoot the controller's corrections.",
          subject: "Emergency Procedures",
          reference: "AIM 5-4-11",
        }),
        h("Navigation failures"),
        p(
          "If a GPS loses integrity (a RAIM or integrity alert), its position can no longer be trusted for navigation. Revert to another approved navigation source (VOR, DME, ILS), tell ATC, and request vectors if needed. If you lose VOR, ILS or other navigation receiver capability, or communication capability, 91.187 requires you to report it to ATC as soon as practical, stating the aircraft identification, the equipment affected, the degree to which your IFR capability is impaired and the assistance you need.",
        ),
        h("Weather emergencies"),
        ul(
          "Unforecast icing: tell ATC immediately and request a change — usually a climb to colder air above the clouds or a descent to warmer air, or a reversal. Do not wait to see if it gets better. Use available anti-ice and deice equipment and keep extra airspeed.",
          "Inadvertent thunderstorm penetration: hold a constant attitude, let altitude vary, turn up cockpit lights against lightning, and maintain your heading — a straight course is usually the quickest way out.",
          "Destination below minimums: hold for improvement only if fuel and forecast justify it; otherwise divert to your alternate early.",
        ),
        warning(
          "Minimum fuel vs emergency fuel",
          "'Minimum fuel' tells ATC you can accept little or no delay — it is NOT an emergency and does not give priority. If your remaining fuel means any delay would compromise safety, declare an emergency and say how many minutes of fuel remain.",
        ),
        h("Diversion"),
        ol(
          "Decide early and tell ATC you want to divert, including the reason.",
          "Get the weather and approach information for the new destination (ATIS, ATC, Flight Service, datalink).",
          "Brief the new approach and missed approach; recompute fuel.",
          "If you are short on fuel or something is failing, declare an emergency to get priority.",
        ),
        caution(
          "Declaring an emergency",
          "Saying 'Mayday' or 'declaring an emergency' gets you priority handling and authority to deviate from rules as necessary (91.3(b)). ATC may ask you to file a report later (91.123(d) within 48 hours if requested, if priority was given), but the paperwork is trivial compared with the alternative.",
        ),
        check({
          id: "ifr.emergencies.2.k2",
          kind: "scenario",
          context:
            "In IMC at 7,000 ft, light rime ice begins accumulating and is building steadily. The temperature is −4°C. PIREPs report tops at 8,000 ft and the freezing level at 4,000 ft. The MEA is 5,000 ft.",
          prompt: "What is the best action?",
          choices: [
            "Continue and monitor the ice accumulation",
            "Request a climb above the tops at 9,000 ft and advise ATC of the icing",
            "Descend to 3,000 ft immediately without a clearance",
            "Reduce airspeed to minimize ice accumulation",
          ],
          answer: 1,
          explanation:
            "Tops at 8,000 ft are close, and getting out of the clouds removes the visible moisture. Descending to warmer air would put you below the MEA (5,000 ft) before reaching above-freezing air at 4,000 ft. Slowing down in ice increases the stall risk. Tell ATC and act early.",
          subject: "Emergency Procedures",
          reference: "AC 00-6B; AIM 7-1",
        }),
        practice("/simulator?scenario=emg-vacuum", "Partial panel", "Lose the vacuum pump in IMC and fly a partial-panel approach."),
        practice("/simulator?scenario=emg-electrical", "Electrical failure", "Manage an alternator failure in IMC and plan a diversion."),
      ],
    },
  ],
  flashcards: [
    { id: "ifr.emergencies.fc1", front: "Lost comms route (AVE-F)", back: "Assigned, Vectored, Expected, Filed." },
    { id: "ifr.emergencies.fc2", front: "Lost comms altitude", back: "Highest of: assigned, MEA (minimum IFR altitude), expected — for each route segment." },
    { id: "ifr.emergencies.fc3", front: "Lost comms in VFR conditions", back: "Continue VFR and land as soon as practicable (91.185(b))." },
    { id: "ifr.emergencies.fc4", front: "91.187 malfunction report contents", back: "Aircraft ID, equipment affected, degree of impairment, assistance desired." },
    { id: "ifr.emergencies.fc5", front: "Partial panel pitch instruments", back: "Altimeter, VSI and airspeed indicator." },
    { id: "ifr.emergencies.fc6", front: "'Minimum fuel'", back: "An advisory that you can accept little or no delay — not an emergency and no priority." },
  ],
  quiz: [
    q({
      id: "ifr.emergencies.q1",
      kind: "scenario",
      context:
        "You are being radar vectored with 'fly heading 270, vectors to intercept V12' when your radios fail in IMC.",
      prompt: "What route should you fly?",
      choices: [
        "Return to your filed route immediately",
        "Continue heading 270 indefinitely",
        "Proceed directly from the point of failure to V12, then continue on your cleared route",
        "Proceed direct to the destination",
      ],
      answer: 2,
      explanation:
        "91.185(c)(1)(ii): if being vectored, fly by the direct route from the point of failure to the fix, route or airway specified in the vector clearance — V12 — and then continue on the assigned route. Holding the heading indefinitely is not the rule.",
      subject: "Emergency Procedures",
      reference: "14 CFR 91.185(c)(1)",
    }),
    q({
      id: "ifr.emergencies.q2",
      kind: "mc",
      prompt: "Your radio fails while you are in VFR conditions on an IFR flight plan. You should:",
      choices: [
        "Continue the flight under VFR and land as soon as practicable",
        "Continue to the destination following the filed route and altitude",
        "Climb to the MEA and hold",
        "Squawk 7700 and continue IFR",
      ],
      answer: 0,
      explanation:
        "91.185(b) applies in VFR conditions: continue VFR and land as soon as practicable. The IFR route and altitude rules of 91.185(c) apply only in IFR conditions.",
      subject: "Emergency Procedures",
      reference: "14 CFR 91.185(b)",
    }),
    q({
      id: "ifr.emergencies.q3",
      kind: "scenario",
      context:
        "Your clearance limit is the initial approach fix for the ILS at your destination. You received no EFC. Your filed ETE gives an ETA of 1520Z. You lose communications in IMC and arrive over the IAF at 1505Z.",
      prompt: "When should you begin the approach?",
      choices: [
        "Immediately at 1505Z",
        "Hold until 1520Z, then begin descent and approach as close as possible to that time",
        "Hold until fuel reaches 45 minutes",
        "At 1535Z, 15 minutes after the ETA",
      ],
      answer: 1,
      explanation:
        "With the clearance limit at a fix from which an approach begins and no EFC, begin the descent and approach as close as possible to the ETA calculated from the filed or amended ETE — 1520Z. Beginning early could conflict with traffic ATC is protecting you from.",
      subject: "Emergency Procedures",
      reference: "14 CFR 91.185(c)(3)(i)",
    }),
    q({
      id: "ifr.emergencies.q4",
      kind: "mc",
      prompt: "With a vacuum failure, which instrument is primary for bank in a standard-rate turn?",
      choices: ["Attitude indicator", "Heading indicator", "Turn coordinator", "VSI"],
      answer: 2,
      explanation:
        "The turn coordinator is electrically powered in most trainers and shows rate of turn. The attitude and heading indicators are vacuum-driven and have failed. The VSI indicates pitch performance, not bank.",
      subject: "Flight Instruments",
      reference: "IFH Ch. 7",
    }),
    q({
      id: "ifr.emergencies.q5",
      kind: "mc",
      prompt: "Which report must you make under 91.187 if your VOR receiver fails in controlled airspace under IFR?",
      choices: [
        "No report is required if you have GPS",
        "A written report to the FAA within 10 days",
        "A report only after landing",
        "A report including aircraft ID, equipment affected, degree of impairment and assistance desired",
      ],
      answer: 3,
      explanation:
        "91.187 requires reporting the malfunction to ATC as soon as practical, with those four elements. It is an in-flight radio report, not a written one.",
      subject: "Regulations",
      reference: "14 CFR 91.187",
    }),
    q({
      id: "ifr.emergencies.q6",
      kind: "tf",
      prompt: "True or false: declaring 'minimum fuel' gives you priority handling over other traffic.",
      choices: ["True", "False"],
      answer: 1,
      explanation:
        "False. 'Minimum fuel' is an advisory that you cannot accept undue delay. Priority comes only with declaring an emergency.",
      subject: "Emergency Procedures",
      reference: "AIM Pilot/Controller Glossary",
    }),
    q({
      id: "ifr.emergencies.q7",
      kind: "calc",
      prompt: "Partial panel, you need to turn from 270° to 030° (right) using a timed standard-rate turn. How long should the turn last?",
      choices: ["20 seconds", "40 seconds", "60 seconds", "80 seconds"],
      answer: 1,
      explanation:
        "From 270° right to 030° is 120°. At 3° per second, 120 ÷ 3 = 40 seconds. 80 seconds would be correct for a half-standard-rate turn.",
      subject: "Flight Instruments",
      reference: "IFH Ch. 7",
    }),
  ],
  practice: [
    link("/simulator?scenario=emg-radio", "Lost communications"),
    link("/simulator?scenario=emg-vacuum", "Vacuum failure"),
    link("/simulator?scenario=emg-electrical", "Electrical failure"),
    link("/simulator?scenario=emg-weather", "Weather emergency"),
  ],
};
