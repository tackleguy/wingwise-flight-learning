import type { Module } from "../types";
import { caution, check, h, info, link, p, q, table, tip, ul, warning } from "../builders";

export const regulations: Module = {
  id: "regulations",
  number: 5,
  title: "VFR Regulations",
  summary:
    "Pilot certificates, medicals and currency; aircraft documents, inspections and required equipment; and the Part 91 flight rules every VFR pilot must know.",
  lessons: [
    {
      id: "vfr.regulations.1",
      title: "Pilot Certificates, Medicals and Currency",
      minutes: 11,
      objectives: [
        "List the documents a pilot must carry",
        "State medical certificate durations and the BasicMed alternative",
        "Apply flight review and passenger-carrying currency requirements",
        "Describe private pilot privileges and limitations",
      ],
      blocks: [
        h("What you carry"),
        p(
          "When acting as pilot in command you must have your pilot certificate and, unless you are exercising privileges that do not require one, a medical certificate (or, under BasicMed, a valid U.S. driver's license plus the BasicMed documents). You must also carry government-issued photo identification. You must present these on request to the FAA, NTSB, TSA or a federal, state or local law enforcement officer (14 CFR 61.3).",
        ),
        h("Medical certificates"),
        p(
          "A private pilot needs at least a third-class medical certificate. Its duration depends on your age at the time of the exam. The privileges of a higher-class medical revert to lower-class privileges as time passes.",
        ),
        table(
          ["Medical class", "Under age 40", "Age 40 and over"],
          [
            ["First class (ATP privileges)", "12 calendar months", "6 calendar months"],
            ["Second class (commercial privileges)", "12 calendar months", "12 calendar months"],
            [
              "Third class (private/student privileges)",
              "60 calendar months",
              "24 calendar months",
            ],
          ],
        ),
        info(
          "BasicMed (14 CFR Part 68 and 61.113(i))",
          "Instead of a third-class medical, eligible pilots may fly under BasicMed: you must have held a medical certificate after July 14, 2006, hold a U.S. driver's license, complete a comprehensive medical exam with a state-licensed physician every 48 months, and complete an online medical education course every 24 calendar months. Aircraft and operating limits apply (for example, no more than 6 occupants, max takeoff weight 6,000 lb, at or below 18,000 ft MSL, not above 250 KIAS, not for compensation or hire). See 14 CFR 61.113(i) for the full list.",
        ),
        h("Flight review"),
        p(
          "To act as PIC you must have completed a flight review within the preceding 24 calendar months (14 CFR 61.56). It consists of at least 1 hour of flight training and 1 hour of ground training with an authorized instructor, covering Part 91 rules and the maneuvers the instructor chooses. Passing a practical test for a new certificate or rating also satisfies it.",
        ),
        h("Recent flight experience to carry passengers"),
        table(
          ["Requirement", "Rule (14 CFR 61.57)"],
          [
            [
              "Day passengers",
              "3 takeoffs and 3 landings within the preceding 90 days, as sole manipulator of the controls, in the same category and class (and type, if a type rating is required)",
            ],
            [
              "Tailwheel airplanes",
              "The 3 landings must be to a full stop in a tailwheel airplane",
            ],
            [
              "Night passengers",
              "3 takeoffs and 3 landings to a full stop within the preceding 90 days during the period beginning 1 hour after sunset and ending 1 hour before sunrise",
            ],
          ],
        ),
        check({
          id: "vfr.regulations.1.k1",
          kind: "scenario",
          context:
            "Your last three landings were touch-and-goes at 20:30 local, which was 1 hour 15 minutes after sunset, 40 days ago.",
          prompt: "May you carry passengers tonight at 21:00 (more than 1 hour after sunset)?",
          choices: [
            "No — night currency requires the landings to be to a full stop",
            "Yes — the landings were within 90 days and at night",
            "Yes, because touch-and-goes count for night currency in tricycle-gear airplanes",
            "No — night currency requires landings within 30 days",
          ],
          answer: 0,
          explanation:
            "Night passenger-carrying currency requires 3 takeoffs and 3 landings to a FULL STOP between 1 hour after sunset and 1 hour before sunrise. The timing was correct and within 90 days, but touch-and-goes do not count for night currency. They would count for DAY currency in a tricycle-gear airplane.",
          subject: "Regulations",
          reference: "14 CFR 61.57(b)",
        }),
        h("Private pilot privileges and limitations"),
        p(
          "A private pilot may not act as PIC of an aircraft carrying passengers or property for compensation or hire, nor for compensation or hire, except in specific cases in 14 CFR 61.113. The most common exception: you may share the operating expenses of a flight with your passengers, but you must pay at least your pro rata share. Operating expenses are limited to fuel, oil, airport expenditures and rental fees.",
        ),
        ul(
          "Change of permanent mailing address: notify the FAA within 30 days, or you may not exercise the privileges of your certificate (61.60).",
          "Complex airplane (retractable gear, flaps and controllable-pitch propeller): one-time logbook endorsement (61.31(e)).",
          "High-performance airplane (engine of more than 200 horsepower): one-time endorsement (61.31(f)).",
          "Tailwheel airplane: one-time endorsement (61.31(i)).",
        ),
        caution(
          "Holding out",
          "Advertising or offering to fly people for money — even through a website or social media — can turn a private flight into an illegal commercial operation. Expense-sharing requires a common purpose for the flight.",
        ),
      ],
    },
    {
      id: "vfr.regulations.2",
      title: "Aircraft Documents, Inspections and Equipment",
      minutes: 11,
      objectives: [
        "Identify the documents required on board (ARROW)",
        "State inspection intervals for annual, 100-hour, transponder, ELT and others",
        "Determine whether an aircraft with inoperative equipment may fly (91.213)",
        "Recall the required equipment for day and night VFR (91.205)",
      ],
      blocks: [
        h("Documents on board: ARROW"),
        ul(
          "A — Airworthiness certificate, displayed where passengers or crew can see it (91.203).",
          "R — Registration certificate (aircraft registrations are now valid for 7 years).",
          "R — Radio station license, required only for international flights.",
          "O — Operating limitations: the approved AFM/POH, placards and instrument markings (91.9).",
          "W — Weight and balance data, current for the airplane's equipment.",
        ),
        h("Inspections"),
        p(
          "The owner or operator is primarily responsible for maintaining the aircraft in an airworthy condition, including compliance with airworthiness directives (ADs) (91.403). The PIC is responsible for determining that the aircraft is in condition for safe flight (91.7). Check the maintenance records before you fly a rental — the memory aid 'AV1ATE' covers the common inspections.",
        ),
        table(
          ["Inspection", "Interval", "Rule"],
          [
            ["Annual", "Within the preceding 12 calendar months", "91.409(a)"],
            ["VOR check (IFR only)", "Within the preceding 30 days", "91.171"],
            [
              "100-hour",
              "Every 100 hours of time in service if carrying a person for hire, or giving flight instruction for hire in an aircraft the instructor provides. May be exceeded by up to 10 hours to reach a place where it can be done; the excess counts toward the next 100 hours.",
              "91.409(b)",
            ],
            [
              "Altimeter / static system (IFR in controlled airspace)",
              "Within the preceding 24 calendar months",
              "91.411",
            ],
            ["Transponder", "Within the preceding 24 calendar months", "91.413"],
            [
              "ELT",
              "Within the preceding 12 calendar months; battery replaced after 1 cumulative hour of use or 50% of its useful life",
              "91.207",
            ],
          ],
        ),
        tip(
          "An annual counts as a 100-hour",
          "An annual inspection satisfies the 100-hour requirement, but a 100-hour inspection does not satisfy the annual.",
        ),
        h("Required equipment for VFR (91.205)"),
        table(
          ["Day VFR (ATOMATOFLAMES)", "Night VFR adds (FLAPS)"],
          [
            ["Airspeed indicator", "Fuses — one spare set, accessible (if fuses are used)"],
            ["Tachometer for each engine", "Landing light — if operated for hire"],
            [
              "Oil pressure gauge for each engine using a pressure system",
              "Anticollision light system",
            ],
            ["Manifold pressure gauge for each altitude engine", "Position lights"],
            [
              "Altimeter",
              "Source of electrical energy for all installed electrical and radio equipment",
            ],
            ["Temperature gauge for each liquid-cooled engine", ""],
            ["Oil temperature gauge for each air-cooled engine", ""],
            ["Fuel gauge for each tank", ""],
            ["Landing gear position indicator (retractable gear)", ""],
            ["Anticollision lights (aircraft certificated after March 11, 1996)", ""],
            ["Magnetic direction indicator", ""],
            ["ELT, if required by 91.207", ""],
            [
              "Safety belts (and shoulder harnesses for front seats of small airplanes manufactured after July 18, 1978)",
              "",
            ],
          ],
        ),
        h("Flying with inoperative equipment (91.213)"),
        p(
          "Most light airplanes do not have a Minimum Equipment List. Under 91.213(d), you may fly with inoperative equipment only if it is NOT required by: the VFR-day type certificate requirements, the aircraft's equipment list or kinds of operations equipment list (KOEL), 91.205 or any other rule for the kind of operation, or an airworthiness directive. The inoperative item must then be removed or deactivated and placarded 'Inoperative', and a pilot or mechanic must determine it does not create a hazard. Removal or deactivation that requires maintenance must be recorded by an appropriately rated person.",
        ),
        check({
          id: "vfr.regulations.2.k1",
          kind: "mc",
          prompt:
            "An aircraft used for flight instruction for hire, provided by the flight instructor, requires which inspection in addition to the annual?",
          choices: [
            "A transponder inspection every 12 months",
            "A 50-hour inspection",
            "A VOR check every 30 days",
            "A 100-hour inspection",
          ],
          answer: 3,
          explanation:
            "91.409(b) requires a 100-hour inspection for aircraft carrying any person for hire or used for flight instruction for hire when the aircraft is provided by the instructor. The VOR check applies only to IFR operations and the transponder interval is 24 calendar months.",
          subject: "Regulations",
          reference: "14 CFR 91.409",
        }),
        warning(
          "Airworthiness directives",
          "An AD is a legally enforceable rule. Flying an aircraft that is out of compliance with an applicable AD makes it unairworthy, even if everything else looks fine. Recurring ADs must be tracked in the maintenance records.",
        ),
      ],
    },
    {
      id: "vfr.regulations.3",
      title: "Part 91 Flight Rules",
      minutes: 12,
      objectives: [
        "State VFR weather minimums from 14 CFR 91.155",
        "Apply minimum safe altitudes, cruising altitudes and right-of-way rules",
        "Know VFR fuel, alcohol, oxygen and preflight action requirements",
      ],
      blocks: [
        h("Preflight action and responsibility"),
        p(
          "The pilot in command is directly responsible for, and is the final authority as to, the operation of the aircraft (91.3). Before each flight you must become familiar with all available information concerning that flight (91.103). For a flight not in the vicinity of an airport this must include weather reports and forecasts, fuel requirements, alternatives if the flight cannot be completed as planned, and any known traffic delays. For every flight it includes runway lengths at airports of intended use and takeoff and landing distance data.",
        ),
        h("Basic VFR weather minimums (91.155)"),
        table(
          ["Airspace", "Flight visibility", "Distance from clouds"],
          [
            ["Class A", "Not applicable (IFR only)", "Not applicable"],
            ["Class B", "3 SM", "Clear of clouds"],
            ["Class C", "3 SM", "500 ft below, 1,000 ft above, 2,000 ft horizontal"],
            ["Class D", "3 SM", "500 ft below, 1,000 ft above, 2,000 ft horizontal"],
            [
              "Class E below 10,000 ft MSL",
              "3 SM",
              "500 ft below, 1,000 ft above, 2,000 ft horizontal",
            ],
            [
              "Class E at or above 10,000 ft MSL",
              "5 SM",
              "1,000 ft below, 1,000 ft above, 1 SM horizontal",
            ],
            ["Class G, 1,200 ft or less AGL — day", "1 SM", "Clear of clouds"],
            [
              "Class G, 1,200 ft or less AGL — night",
              "3 SM",
              "500 ft below, 1,000 ft above, 2,000 ft horizontal",
            ],
            [
              "Class G, more than 1,200 ft AGL but below 10,000 ft MSL — day",
              "1 SM",
              "500 ft below, 1,000 ft above, 2,000 ft horizontal",
            ],
            [
              "Class G, more than 1,200 ft AGL but below 10,000 ft MSL — night",
              "3 SM",
              "500 ft below, 1,000 ft above, 2,000 ft horizontal",
            ],
            [
              "Class G, more than 1,200 ft AGL and at or above 10,000 ft MSL",
              "5 SM",
              "1,000 ft below, 1,000 ft above, 1 SM horizontal",
            ],
          ],
        ),
        info(
          "Ceiling rule and exceptions",
          "Except under special VFR, you may not operate beneath the ceiling within the surface area of controlled airspace when the ceiling is less than 1,000 ft, or take off, land or enter the traffic pattern there unless ground visibility is at least 3 SM (91.155(c)–(d)). Class G at night has an exception for airplanes in the traffic pattern within ½ mile of the runway: 1 SM and clear of clouds (91.155(b)(2)). Special VFR (91.157) requires an ATC clearance, 1 SM visibility and clear of clouds, and at night requires an instrument rating and IFR-equipped aircraft.",
        ),
        check({
          id: "vfr.regulations.3.k1",
          kind: "mc",
          prompt: "What are the VFR minimums in Class C airspace?",
          choices: [
            "1 SM and clear of clouds",
            "3 SM and clear of clouds",
            "3 SM; 500 ft below, 1,000 ft above, 2,000 ft horizontal",
            "5 SM; 1,000 ft below, 1,000 ft above, 1 SM horizontal",
          ],
          answer: 2,
          explanation:
            "Class C (like Class D and Class E below 10,000 MSL) uses 3 SM and 500/1,000/2,000. 'Clear of clouds' with 3 SM applies only to Class B, which is the tempting distractor.",
          subject: "Regulations",
          reference: "14 CFR 91.155",
        }),
        h("Minimum safe altitudes (91.119)"),
        ul(
          "Anywhere: an altitude allowing, if a power unit fails, an emergency landing without undue hazard to persons or property on the surface.",
          "Over congested areas (cities, towns, settlements or open-air assemblies): 1,000 ft above the highest obstacle within a horizontal radius of 2,000 ft.",
          "Over other than congested areas: 500 ft above the surface. Over open water or sparsely populated areas, no closer than 500 ft to any person, vessel, vehicle or structure.",
          "These do not apply when necessary for takeoff or landing.",
        ),
        h("VFR cruising altitudes (91.159)"),
        p(
          "In level cruising flight more than 3,000 ft above the surface (and below 18,000 ft MSL), fly on a magnetic COURSE of 0°–179° at odd thousands plus 500 ft (3,500, 5,500…), and on a magnetic course of 180°–359° at even thousands plus 500 ft (4,500, 6,500…). The memory aid is 'East is odd, West is even odder' — remembering that it is based on magnetic course, not heading.",
        ),
        h("Right-of-way (91.113)"),
        ul(
          "An aircraft in distress has the right of way over all other air traffic.",
          "Converging aircraft of different categories: balloon has right of way over all; glider over airship, powered parachute, weight-shift-control, airplane and rotorcraft; airship over powered parachute, weight-shift-control, airplane and rotorcraft. An aircraft towing or refueling other aircraft has right of way over all other engine-driven aircraft.",
          "Converging aircraft of the same category: the aircraft to the other's right has the right of way.",
          "Approaching head-on: each pilot alters course to the right.",
          "Overtaking: the aircraft being overtaken has the right of way; the overtaking aircraft alters course to the right to pass well clear.",
          "Landing: aircraft on final approach or landing have the right of way over aircraft in flight or on the surface; when two are approaching to land, the lower aircraft has the right of way but may not take advantage of this to cut in front.",
        ),
        h("Fuel, alcohol and oxygen"),
        table(
          ["Rule", "Requirement"],
          [
            [
              "VFR fuel, day (91.151)",
              "Enough to fly to the first point of intended landing and then at least 30 minutes at normal cruising speed",
            ],
            [
              "VFR fuel, night (91.151)",
              "To the first point of intended landing plus at least 45 minutes at normal cruising speed",
            ],
            [
              "Alcohol (91.17)",
              "Not within 8 hours of consuming alcohol, while under the influence, or with a blood alcohol concentration of 0.04 or greater",
            ],
            [
              "Oxygen (91.211)",
              "Required crew must use oxygen above 12,500 ft MSL up to and including 14,000 ft MSL for flight time beyond 30 minutes; at all times above 14,000 ft MSL; each occupant must be provided oxygen above 15,000 ft MSL",
            ],
            [
              "Seat belts (91.107)",
              "PIC must brief passengers on seat belts and ensure each is notified to fasten them; each person must be belted for taxi, takeoff and landing",
            ],
          ],
        ),
        check({
          id: "vfr.regulations.3.k2",
          kind: "mc",
          prompt:
            "You plan a VFR flight on a magnetic course of 225° at more than 3,000 ft AGL. Which cruising altitude is appropriate?",
          choices: ["5,500 ft MSL", "6,000 ft MSL", "6,500 ft MSL", "7,500 ft MSL"],
          answer: 2,
          explanation:
            "A magnetic course of 180°–359° requires even thousands plus 500 ft, so 6,500 ft (or 4,500, 8,500…). 5,500 and 7,500 are odd-plus-500 altitudes for eastbound courses, and 6,000 is an IFR altitude.",
          subject: "Regulations",
          reference: "14 CFR 91.159",
        }),
        caution(
          "Accident reporting",
          "NTSB Part 830 requires immediate notification of an aircraft accident and certain serious incidents (such as flight control malfunction or in-flight fire). A written report is due within 10 days after an accident, or after 7 days if an overdue aircraft is still missing.",
        ),
      ],
    },
  ],
  flashcards: [
    {
      id: "vfr.regulations.fc1",
      front: "Flight review interval",
      back: "Every 24 calendar months: at least 1 hour of ground and 1 hour of flight training (61.56).",
    },
    {
      id: "vfr.regulations.fc2",
      front: "Night passenger currency",
      back: "3 takeoffs and 3 landings to a full stop, 1 hr after sunset to 1 hr before sunrise, within 90 days (61.57(b)).",
    },
    {
      id: "vfr.regulations.fc3",
      front: "ARROW",
      back: "Airworthiness cert, Registration, Radio license (international), Operating limitations, Weight & balance.",
    },
    {
      id: "vfr.regulations.fc4",
      front: "Transponder inspection interval",
      back: "24 calendar months (91.413).",
    },
    {
      id: "vfr.regulations.fc5",
      front: "VFR fuel reserve day / night",
      back: "30 minutes day, 45 minutes night at normal cruising speed (91.151).",
    },
    {
      id: "vfr.regulations.fc6",
      front: "Minimum altitude over congested areas",
      back: "1,000 ft above the highest obstacle within 2,000 ft horizontally (91.119).",
    },
  ],
  quiz: [
    q({
      id: "vfr.regulations.q1",
      kind: "mc",
      prompt:
        "A third-class medical certificate issued to a 45-year-old pilot is valid for private pilot privileges until the end of the:",
      choices: [
        "12th calendar month",
        "24th calendar month",
        "36th calendar month",
        "60th calendar month",
      ],
      answer: 1,
      explanation:
        "For pilots age 40 or older at the time of the exam, a third-class medical is valid for 24 calendar months. The 60-calendar-month duration applies only if the pilot was under 40 at the exam.",
      subject: "Regulations",
      reference: "14 CFR 61.23",
    }),
    q({
      id: "vfr.regulations.q2",
      kind: "mc",
      prompt: "What may a private pilot share with passengers?",
      choices: [
        "Nothing — all costs must be paid by the pilot",
        "Operating expenses, with the pilot paying no less than the pro rata share",
        "Any costs, provided the pilot does not make a profit",
        "Aircraft depreciation and insurance, split equally",
      ],
      answer: 1,
      explanation:
        "61.113(c) allows a private pilot to share fuel, oil, airport expenditures or rental fees, paying at least a pro rata share. 'Any costs without profit' is too broad, and depreciation and insurance are not allowable shared expenses.",
      subject: "Regulations",
      reference: "14 CFR 61.113",
    }),
    q({
      id: "vfr.regulations.q3",
      kind: "scenario",
      context:
        "Your rental airplane's last annual inspection was completed on March 14 of last year. Today is March 20 of this year.",
      prompt: "May the airplane be flown?",
      choices: [
        "Yes, until the end of March",
        "Yes, an annual is valid for 13 months",
        "No, the annual expired at the end of February",
        "No, the annual expired on March 14",
      ],
      answer: 0,
      explanation:
        "An annual is due within the preceding 12 CALENDAR months, so an inspection completed March 14 last year is valid through March 31 this year. It does not expire on the anniversary date.",
      subject: "Regulations",
      reference: "14 CFR 91.409",
    }),
    q({
      id: "vfr.regulations.q4",
      kind: "mc",
      prompt: "Which is NOT required equipment for day VFR flight under 91.205?",
      choices: [
        "Airspeed indicator",
        "Magnetic direction indicator",
        "Attitude indicator",
        "Fuel gauge for each tank",
      ],
      answer: 2,
      explanation:
        "An attitude indicator is required for IFR, not day VFR. Airspeed indicator, magnetic direction indicator and fuel gauges are all on the day VFR list (ATOMATOFLAMES).",
      subject: "Regulations",
      reference: "14 CFR 91.205",
    }),
    q({
      id: "vfr.regulations.q5",
      kind: "mc",
      prompt:
        "During the day in Class G airspace at 1,000 ft AGL, what are the minimum VFR visibility and cloud clearance?",
      choices: [
        "1 SM and clear of clouds",
        "3 SM and clear of clouds",
        "1 SM; 500 below, 1,000 above, 2,000 horizontal",
        "3 SM; 500 below, 1,000 above, 2,000 horizontal",
      ],
      answer: 0,
      explanation:
        "In Class G at or below 1,200 ft AGL during the day, the minimums are 1 SM and clear of clouds. At night it becomes 3 SM with 500/1,000/2,000 (except the traffic-pattern exception).",
      subject: "Regulations",
      reference: "14 CFR 91.155",
    }),
    q({
      id: "vfr.regulations.q6",
      kind: "mc",
      prompt: "Two airplanes are converging at the same altitude. Which has the right of way?",
      choices: [
        "The faster airplane",
        "The airplane on the left",
        "The airplane on the right",
        "The larger airplane",
      ],
      answer: 2,
      explanation:
        "When aircraft of the same category converge at approximately the same altitude, the aircraft to the other's right has the right of way. Speed and size do not matter.",
      subject: "Regulations",
      reference: "14 CFR 91.113",
    }),
    q({
      id: "vfr.regulations.q7",
      kind: "tf",
      prompt:
        "True or false: flight crew must use supplemental oxygen at all times when flying above 14,000 ft MSL.",
      choices: ["True", "False"],
      answer: 0,
      explanation:
        "True. Above 14,000 ft MSL required crew must use oxygen continuously. Between 12,500 and 14,000 ft, it is required only for time beyond 30 minutes, and above 15,000 ft every occupant must be provided oxygen.",
      subject: "Regulations",
      reference: "14 CFR 91.211",
    }),
    q({
      id: "vfr.regulations.q8",
      kind: "mc",
      prompt:
        "Under 91.17, no person may act as a crewmember with a blood alcohol concentration of:",
      choices: ["0.08 or greater", "0.02 or greater", "0.04 or greater", "0.10 or greater"],
      answer: 2,
      explanation:
        "The limit is 0.04. 0.08 is a typical state driving limit and is a common distractor. The rule also prohibits flying within 8 hours of drinking or while under the influence.",
      subject: "Regulations",
      reference: "14 CFR 91.17",
    }),
  ],
  practice: [
    link("/planner", "Preflight planning"),
    link("/aircraft", "Aircraft documents and equipment"),
  ],
};
