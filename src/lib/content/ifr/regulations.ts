import type { Module } from "../types";
import { caution, check, h, info, link, p, practice, q, table, tip, ul, warning } from "../builders";

export const regulations: Module = {
  id: "regulations",
  number: 2,
  title: "IFR Regulations",
  summary:
    "When an instrument rating is required, instrument currency and the IPC, IFR equipment and inspections, flight plans and clearances, required reports, and minimum IFR altitudes.",
  lessons: [
    {
      id: "ifr.regulations.1",
      title: "Instrument Currency, Equipment and Inspections",
      minutes: 11,
      objectives: [
        "State when an instrument rating is required",
        "Apply the 61.57(c) instrument currency rules and the IPC requirement",
        "List IFR equipment (91.205(d)) and inspection requirements including the VOR check",
      ],
      blocks: [
        h("When you need an instrument rating"),
        ul(
          "To act as PIC under IFR (any IFR flight plan and clearance).",
          "In weather conditions less than the VFR minimums of 91.155.",
          "In Class A airspace.",
          "For special VFR at night (91.157).",
        ),
        h("Instrument currency (61.57(c))"),
        p(
          "To act as PIC under IFR or in weather below VFR minimums, you must have performed and logged, within the 6 calendar months preceding the month of the flight, under actual or simulated instrument conditions: at least six instrument approaches, holding procedures and tasks, and intercepting and tracking courses through the use of navigational electronic systems. You can do this in an airplane (with a safety pilot or instructor) or in an approved flight simulator, FTD or aviation training device, within the limits of 61.57(c).",
        ),
        table(
          ["Time since last current", "Status", "How to regain"],
          [
            ["Within 6 calendar months", "Current", "—"],
            ["6 to 12 calendar months", "Not current for IFR PIC", "Complete the 6-HIT tasks with a safety pilot, instructor or approved device (you cannot act as PIC under IFR in IMC meanwhile)"],
            ["More than 12 calendar months", "Not current", "Instrument proficiency check (IPC) with a CFII, examiner or other authorized person (61.57(d))"],
          ],
        ),
        info(
          "Safety pilots (91.109(c))",
          "Simulated instrument flight in an aircraft requires a safety pilot holding at least a private pilot certificate with category and class ratings appropriate to the aircraft, adequate visibility forward and to each side (or a competent observer), and fully functioning dual controls (with limited exceptions for throwover yokes).",
        ),
        check({
          id: "ifr.regulations.1.k1",
          kind: "scenario",
          context:
            "Today is October 20. Your last instrument approaches, holding and tracking were logged on March 15 of this year, and none since.",
          prompt: "Are you instrument current today?",
          choices: [
            "Yes — through the end of September",
            "No — currency expired at the end of September; you have until the end of March next year to regain it without an IPC",
            "Yes — 6 calendar months means through October 31",
            "No — you need an IPC immediately",
          ],
          answer: 1,
          explanation:
            "Tasks logged in March keep you current through the end of September (6 calendar months preceding the month of flight: April–September). In October you are not current, but within the following 6 calendar months you may regain currency by completing the tasks; only after 12 calendar months is an IPC required.",
          subject: "Regulations",
          reference: "14 CFR 61.57(c)–(d)",
        }),
        h("IFR equipment (91.205(d))"),
        p(
          "For IFR flight you need everything required for day VFR (and night VFR, at night), plus the items remembered as GRABCARD:",
        ),
        table(
          ["Item", "Requirement"],
          [
            ["G — Generator or alternator", "Of adequate capacity"],
            ["R — Radios", "Two-way radio communication and navigation equipment suitable for the route"],
            ["A — Altimeter", "Sensitive altimeter adjustable for barometric pressure"],
            ["B — Ball", "Slip-skid indicator"],
            ["C — Clock", "Displaying hours, minutes and seconds with a sweep-second pointer or digital presentation"],
            ["A — Attitude indicator", "Gyroscopic pitch and bank indicator"],
            ["R — Rate-of-turn indicator", "Gyroscopic rate-of-turn indicator"],
            ["D — Directional gyro", "Gyroscopic direction indicator"],
          ],
        ),
        h("Inspections for IFR"),
        table(
          ["Item", "Requirement", "Rule"],
          [
            ["Altimeter, static system and automatic altitude reporting", "Tested within the preceding 24 calendar months for IFR in controlled airspace", "91.411"],
            ["Transponder", "Tested within the preceding 24 calendar months", "91.413"],
            ["VOR receiver", "Operationally checked within the preceding 30 days for IFR use", "91.171"],
          ],
        ),
        table(
          ["VOR check method", "Permissible error"],
          [
            ["VOT (VOR test facility)", "±4°"],
            ["Designated ground checkpoint", "±4°"],
            ["Designated airborne checkpoint", "±6°"],
            ["Dual VOR check (one against the other)", "4° between the two receivers"],
          ],
        ),
        tip(
          "Record the VOR check",
          "The person performing the check must enter the date, place, bearing error and their signature in the aircraft log or other record (91.171(d)).",
        ),
      ],
    },
    {
      id: "ifr.regulations.2",
      title: "IFR Flight Plans, Clearances and Required Reports",
      minutes: 11,
      objectives: [
        "Know when an IFR flight plan and clearance are required",
        "Copy and read back a clearance using CRAFT",
        "List the reports required by 91.183, 91.187 and the AIM",
      ],
      blocks: [
        h("Flight plan and clearance (91.173)"),
        p(
          "No person may operate an aircraft in controlled airspace under IFR unless that person has filed an IFR flight plan and received an appropriate ATC clearance. The AIM recommends filing at least 30 minutes before the estimated departure time. An IFR flight plan can be filed with Flight Service or approved online providers and is activated when ATC issues the clearance.",
        ),
        h("Copying a clearance: CRAFT"),
        table(
          ["Element", "Example"],
          [
            ["C — Clearance limit", "'Cleared to the Springfield airport'"],
            ["R — Route", "'Via the RIVER ONE departure, then as filed'"],
            ["A — Altitude", "'Climb and maintain 5,000, expect 9,000 ten minutes after departure'"],
            ["F — Frequency", "'Departure frequency 124.35'"],
            ["T — Transponder", "'Squawk 4521'"],
          ],
        ),
        p(
          "Read back the clearance, and never accept one you cannot comply with — say 'unable' and request something different. 91.123 requires compliance with a clearance once obtained, except in an emergency or to respond to a TCAS resolution advisory, and you must ask for clarification if you are uncertain of its meaning.",
        ),
        info(
          "Departing a non-towered airport",
          "You may receive a clearance with a void time ('clearance void if not off by 1430'). If you do not depart by that time, notify ATC as soon as possible, but no later than 30 minutes after the void time. 'Hold for release' means you may not depart until ATC releases you.",
        ),
        h("Special clearances"),
        ul(
          "VFR-on-top: an IFR clearance that lets you fly at VFR altitudes in VFR conditions. You must comply with VFR cloud clearance and visibility minimums and VFR cruising altitudes, and with IFR rules. Not permitted in Class A.",
          "Visual approach: authorized by ATC when the pilot has the airport or the preceding aircraft in sight; the reported ceiling at the airport must be at least 1,000 ft and visibility at least 3 SM.",
          "Contact approach: must be requested by the pilot (ATC cannot initiate it), requires at least 1 SM flight visibility, clear of clouds, a reasonable expectation of continuing to the airport in those conditions, and an airport with a standard or special instrument approach procedure.",
        ),
        check({
          id: "ifr.regulations.2.k1",
          kind: "mc",
          prompt: "Which statement about a contact approach is correct?",
          choices: [
            "ATC may assign a contact approach whenever the weather is VFR",
            "It must be requested by the pilot and requires at least 1 SM flight visibility and clear of clouds",
            "It requires the pilot to have the preceding aircraft in sight",
            "It requires a ceiling of at least 1,000 ft and visibility of 3 SM",
          ],
          answer: 1,
          explanation:
            "Only the pilot can request a contact approach, and the conditions are 1 SM flight visibility and clear of clouds. The 1,000-ft/3-SM and 'traffic in sight' conditions belong to the visual approach.",
          subject: "IFR Procedures",
          reference: "AIM Ch. 5, Sec. 4 (Contact Approach)",
        }),
        h("Required reports"),
        p(
          "Some reports are required at all times; others only when not in radar contact. Many pilots use 'MARVELOUS VFR C500' to remember them.",
        ),
        table(
          ["Report", "When"],
          [
            ["Missed approach", "Always"],
            ["Airspeed change of 10 knots or 5% (whichever is greater) from filed TAS", "Always"],
            ["Reaching a holding fix (time and altitude)", "Always"],
            ["Vacating any previously assigned altitude for a new one", "Always"],
            ["ETA change of more than 2 minutes", "Non-radar"],
            ["Leaving a holding fix", "Always"],
            ["Outer marker / final approach fix inbound", "Non-radar"],
            ["Unforecast weather and anything affecting safety of flight", "Always"],
            ["VFR-on-top altitude change", "Always"],
            ["Radio, navigation or approach equipment malfunction (91.187)", "Always"],
            ["Compulsory reporting points (solid triangles)", "Non-radar"],
            ["Unable to climb or descend at least 500 fpm", "Always"],
          ],
        ),
        caution(
          "91.187 malfunction reports",
          "Report as soon as practical any loss of VOR, ILS or other navigation receiver capability or impairment of air/ground communication, including the aircraft identification, the equipment affected, how much your IFR capability is impaired and what assistance you want.",
        ),
        practice("/ai-atc", "Copy a clearance", "Request and read back IFR clearances with an AI controller."),
      ],
    },
    {
      id: "ifr.regulations.3",
      title: "Minimum IFR Altitudes and Instrument Procedures",
      minutes: 11,
      objectives: [
        "Define MEA, MOCA, MRA, MCA, MAA and OROCA",
        "Apply the minimum altitude rules of 91.177 and IFR cruising altitudes of 91.179",
        "Describe the types of instrument procedures and climb gradient requirements",
      ],
      blocks: [
        h("En route altitudes"),
        table(
          ["Altitude", "What it guarantees"],
          [
            ["MEA — minimum en route altitude", "Acceptable navigation signal coverage and obstacle clearance between fixes"],
            ["MOCA — minimum obstruction clearance altitude", "Obstacle clearance for the entire segment, but navigation signal coverage only within 22 NM of a VOR"],
            ["MRA — minimum reception altitude", "Lowest altitude at which an intersection can be identified using the specified navaids"],
            ["MCA — minimum crossing altitude", "Lowest altitude at which a fix must be crossed when proceeding toward a higher MEA"],
            ["MAA — maximum authorized altitude", "Highest usable altitude for the segment (signal interference above it)"],
            ["OROCA — off-route obstruction clearance altitude", "1,000 ft obstacle clearance (2,000 ft in designated mountainous areas) within a grid; no navigation or communication coverage guarantee"],
          ],
        ),
        h("91.177: minimum altitudes for IFR operations"),
        p(
          "Except when necessary for takeoff or landing, or when otherwise authorized, no person may operate under IFR below the applicable minimum altitudes prescribed in Parts 95 and 97 (MEAs, MOCAs and approach altitudes). Where none is prescribed, the minimum is 2,000 ft above the highest obstacle within a horizontal distance of 4 NM from the course in designated mountainous areas, and 1,000 ft above the highest obstacle within 4 NM elsewhere.",
        ),
        p(
          "When climbing to a higher MEA, begin the climb immediately after passing the point beyond which the higher minimum applies — unless a minimum crossing altitude (MCA) is specified, in which case you must cross that point at or above the MCA. The MOCA may be used below the MEA when within 22 NM of the VOR on which the segment is based (91.177(a)(2)(ii)).",
        ),
        check({
          id: "ifr.regulations.3.k1",
          kind: "mc",
          prompt: "What does the MOCA guarantee that the MEA also guarantees?",
          choices: [
            "Two-way communication with ATC",
            "Obstacle clearance on the route segment",
            "Navigation signal coverage along the entire segment",
            "Radar coverage",
          ],
          answer: 1,
          explanation:
            "Both provide obstacle clearance. The MEA additionally assures navigation signal coverage for the whole segment, whereas the MOCA assures it only within 22 NM of the VOR. Neither guarantees communication or radar coverage.",
          subject: "IFR Procedures",
          reference: "14 CFR 91.177; AIM 5-3-4",
        }),
        h("IFR cruising altitudes (91.179)"),
        p(
          "In controlled airspace, fly the altitude ATC assigns. In uncontrolled airspace below 18,000 ft MSL, use odd thousands on magnetic courses of 0°–179° and even thousands on magnetic courses of 180°–359° (no +500 ft, which is the VFR convention).",
        ),
        h("Instrument procedures"),
        ul(
          "Departure procedures: Obstacle Departure Procedures (ODPs) provide obstacle clearance and may be flown without a clearance to do so; Standard Instrument Departures (SIDs) also reduce pilot/controller workload and require ATC clearance.",
          "Standard Terminal Arrival Routes (STARs) connect the en route structure to the terminal area.",
          "Instrument approach procedures (Part 97) provide the final link to the runway.",
        ),
        p(
          "Unless a higher gradient is published, instrument departures assume a climb gradient of at least 200 ft per nautical mile, crossing the departure end of the runway at least 35 ft above it and reaching 400 ft above the airport before turning. To convert a gradient to a climb rate: feet per minute = feet per NM × groundspeed ÷ 60.",
        ),
        check({
          id: "ifr.regulations.3.k2",
          kind: "calc",
          prompt: "A departure procedure requires 300 ft per NM to 3,000 ft. Your climb groundspeed is 90 knots. What minimum climb rate is required?",
          choices: ["300 fpm", "450 fpm", "540 fpm", "900 fpm"],
          answer: 1,
          explanation:
            "300 ft/NM × 90 NM/hr ÷ 60 = 450 fpm. 900 fpm would result from forgetting to divide by 60 correctly (300 × 3).",
          subject: "IFR Procedures",
          reference: "AIM Ch. 5, Sec. 2",
        }),
        warning(
          "Takeoff minimums under Part 91",
          "The standard takeoff minimums in 91.175(f) apply to Parts 121, 125, 129 and 135 operators. Part 91 pilots have no regulatory takeoff minimums, but departing into zero-zero weather with no way back is a serious risk — plan a takeoff alternate and use personal minimums.",
        ),
        tip(
          "Read the departure notes",
          "Look for the 'T' symbol in the approach chart minimums section: it means the airport has nonstandard takeoff minimums, an ODP or both, listed in the front of the Terminal Procedures Publication.",
        ),
      ],
    },
  ],
  flashcards: [
    { id: "ifr.regulations.fc1", front: "Instrument currency (61.57(c))", back: "Within 6 calendar months: 6 approaches, holding, intercepting and tracking courses." },
    { id: "ifr.regulations.fc2", front: "When an IPC is required", back: "If not current for more than 12 calendar months (61.57(d))." },
    { id: "ifr.regulations.fc3", front: "GRABCARD", back: "Generator, Radios, Altimeter, Ball, Clock, Attitude indicator, Rate-of-turn, Directional gyro (91.205(d))." },
    { id: "ifr.regulations.fc4", front: "VOR check interval and tolerances", back: "30 days. VOT/ground ±4°, airborne ±6°, dual 4° between receivers (91.171)." },
    { id: "ifr.regulations.fc5", front: "CRAFT", back: "Clearance limit, Route, Altitude, Frequency, Transponder." },
    { id: "ifr.regulations.fc6", front: "91.177 off-airway minimum altitude", back: "2,000 ft above obstacles within 4 NM in mountainous areas; 1,000 ft elsewhere." },
  ],
  quiz: [
    q({
      id: "ifr.regulations.q1",
      kind: "mc",
      prompt: "Which tasks must be logged within the preceding 6 calendar months for instrument currency?",
      choices: [
        "Six approaches and three holds",
        "Six approaches, holding procedures and tasks, and intercepting and tracking courses",
        "Six hours of instrument time and six approaches",
        "Three approaches and an IPC",
      ],
      answer: 1,
      explanation:
        "61.57(c) requires six instrument approaches, holding procedures and tasks, and intercepting and tracking courses through the use of navigational electronic systems. There is no hours requirement and only one 'holding procedures and tasks' item.",
      subject: "Regulations",
      reference: "14 CFR 61.57(c)",
    }),
    q({
      id: "ifr.regulations.q2",
      kind: "mc",
      prompt: "What is the maximum permissible bearing error when checking a VOR receiver against a designated airborne checkpoint?",
      choices: ["±4°", "4° between receivers", "±10°", "±6°"],
      answer: 3,
      explanation:
        "Airborne checkpoints allow ±6°. VOT and ground checkpoints allow ±4°, and a dual-VOR comparison allows 4° between the two receivers.",
      subject: "Regulations",
      reference: "14 CFR 91.171",
    }),
    q({
      id: "ifr.regulations.q3",
      kind: "scenario",
      context: "You receive: 'N123AB is cleared to the Riverside airport via V25 SALLY, direct. Climb and maintain 6,000. Departure frequency 125.1. Squawk 2241.'",
      prompt: "What is the clearance limit?",
      choices: ["SALLY intersection", "6,000 ft", "The Riverside airport", "V25"],
      answer: 2,
      explanation:
        "The clearance limit is the point to which you are cleared — the Riverside airport. SALLY is a fix on the route, and 6,000 ft is the altitude element of CRAFT.",
      subject: "IFR Procedures",
      reference: "AIM 4-4-3",
    }),
    q({
      id: "ifr.regulations.q4",
      kind: "mc",
      prompt: "When not in radar contact, which of these reports is required?",
      choices: [
        "Leaving every assigned altitude only when in VFR conditions",
        "Passing every VOR on the route",
        "Turning on the landing light",
        "A corrected ETA whenever the previous estimate is in error by more than 2 minutes",
      ],
      answer: 3,
      explanation:
        "In a non-radar environment, you must report when an ETA changes by more than 2 minutes, plus compulsory reporting points and FAF inbound. Vacating an altitude is required at ALL times, not only in VFR conditions.",
      subject: "IFR Procedures",
      reference: "AIM 5-3-3",
    }),
    q({
      id: "ifr.regulations.q5",
      kind: "mc",
      prompt: "En route in uncontrolled airspace under IFR on a magnetic course of 120°, which cruising altitude is appropriate?",
      choices: ["6,000 ft", "6,500 ft", "7,000 ft", "7,500 ft"],
      answer: 2,
      explanation:
        "91.179 requires odd thousands for magnetic courses of 0°–179° under IFR: 7,000 ft. The +500 altitudes (6,500 / 7,500) are VFR altitudes.",
      subject: "Regulations",
      reference: "14 CFR 91.179",
    }),
    q({
      id: "ifr.regulations.q6",
      kind: "tf",
      prompt: "True or false: ATC may initiate a contact approach if the pilot has the airport in sight.",
      choices: ["True", "False"],
      answer: 1,
      explanation:
        "False. A contact approach must be specifically requested by the pilot. ATC may initiate a VISUAL approach, which is why the two are often confused.",
      subject: "IFR Procedures",
      reference: "AIM Ch. 5, Sec. 4 (Contact Approach)",
    }),
    q({
      id: "ifr.regulations.q7",
      kind: "mc",
      prompt: "In a designated mountainous area with no published minimum altitude, what is the minimum IFR altitude?",
      choices: [
        "1,000 ft above the highest obstacle within 4 NM of the course",
        "2,000 ft above the highest obstacle within 4 NM of the course",
        "2,000 ft above the highest obstacle within 5 SM of the course",
        "1,500 ft AGL",
      ],
      answer: 1,
      explanation:
        "91.177(a)(2)(i): 2,000 ft above the highest obstacle within a horizontal distance of 4 NM in designated mountainous areas; 1,000 ft elsewhere.",
      subject: "Regulations",
      reference: "14 CFR 91.177",
    }),
    q({
      id: "ifr.regulations.q8",
      kind: "mc",
      prompt: "If you cannot depart before the void time in your clearance, you must notify ATC:",
      choices: [
        "As soon as possible, but no later than 30 minutes after the void time",
        "Within 1 hour",
        "Only if you intend to depart later",
        "Within 10 minutes of the void time",
      ],
      answer: 0,
      explanation:
        "The AIM requires notification as soon as possible, but no later than 30 minutes after the void time, so ATC can release the protected airspace and avoid initiating search procedures.",
      subject: "IFR Procedures",
      reference: "AIM Ch. 5, Sec. 2",
    }),
  ],
  practice: [link("/ai-atc", "Clearances with AI ATC"), link("/planner", "IFR planning"), link("/simulator?scenario=ifr-departure", "IFR departure")],
};
