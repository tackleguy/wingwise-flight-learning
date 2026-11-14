import type { Module } from "../types";
import { caution, check, diagram, h, info, link, ol, p, practice, q, table, tip, ul, warning } from "../builders";

export const approaches: Module = {
  id: "approaches",
  number: 5,
  title: "Instrument Approaches",
  summary:
    "Approach charts and segments, DA versus MDA and 14 CFR 91.175; ILS, localizer and RNAV (LPV, LNAV/VNAV, LNAV) approaches; VOR approaches, circling and missed approaches.",
  lessons: [
    {
      id: "ifr.approaches.1",
      title: "Approach Charts, Segments and Landing Minimums",
      minutes: 12,
      objectives: [
        "Identify approach segments and fixes on an approach chart",
        "Explain DA versus MDA and approach categories",
        "Apply 14 CFR 91.175 to descend below minimums or execute a missed approach",
      ],
      blocks: [
        h("Reading an approach chart"),
        p(
          "An instrument approach procedure (IAP) chart is laid out the same way every time: the briefing strip at the top (frequencies, final approach course, minimum safe altitude, missed approach instructions, notes), the plan view (the overhead picture with feeder routes and fixes), the profile view (the side view with altitudes and distances), the minimums section and the airport sketch. Brief it in the same order on every approach.",
        ),
        table(
          ["Segment", "Begins at", "Purpose"],
          [
            ["Feeder route", "En route structure", "Connects the en route system to the IAF"],
            ["Initial", "Initial approach fix (IAF)", "Maneuvers onto the intermediate course, may include a course reversal or DME arc"],
            ["Intermediate", "Intermediate fix (IF)", "Aligns the aircraft and adjusts speed and configuration"],
            ["Final", "Final approach fix (FAF) or glideslope intercept", "Descent to minimums and alignment with the runway"],
            ["Missed approach", "Missed approach point (MAP) or DA", "Climb to a safe altitude and a holding fix"],
          ],
        ),
        info(
          "Symbols to know",
          "On nonprecision approaches the FAF is marked with a Maltese cross in the profile view. On precision approaches the final segment begins at glideslope intercept, marked with a lightning bolt; the Maltese cross there applies to the localizer-only (glideslope out) approach.",
        ),
        h("Course reversals and when not to fly them"),
        p(
          "A procedure turn (or a hold-in-lieu-of-PT or teardrop) lets you reverse course onto the final approach course. You must remain within the charted distance (commonly 10 NM) and at or above the charted altitude, and the AIM sets a maximum of 200 KIAS. A procedure turn is not permitted when the route is marked 'NoPT', when you receive radar vectors to the final approach course, when you conduct a timed approach from a holding fix, or when ATC clears you 'straight-in'.",
        ),
        h("DA versus MDA"),
        table(
          ["", "Decision altitude (DA)", "Minimum descent altitude (MDA)"],
          [
            ["Used on", "Precision (ILS) and approaches with vertical guidance (LPV, LNAV/VNAV)", "Nonprecision approaches (LNAV, LP, VOR, LOC, NDB) and circling"],
            ["Meaning", "The altitude at which you must decide to continue or begin the missed approach", "The lowest altitude you may descend to until the 91.175(c) requirements are met"],
            ["Below it?", "Momentary descent below DA during the transition to the missed approach is expected", "You may not descend below the MDA without the required visual references"],
            ["Where the miss begins", "At DA", "At the missed approach point (often a fix or timed from the FAF)"],
          ],
        ),
        h("Approach categories"),
        table(
          ["Category", "VREF or 1.3 VSO at max landing weight"],
          [
            ["A", "Less than 91 knots"],
            ["B", "91 to 120 knots"],
            ["C", "121 to 140 knots"],
            ["D", "141 to 165 knots"],
            ["E", "166 knots or more"],
          ],
        ),
        p(
          "If you fly the approach (especially a circling approach) at a speed above your category's range, use the minimums for the higher category.",
        ),
        h("14 CFR 91.175 — descending below DA or MDA"),
        p("You may not operate below the DA or MDA unless all three conditions are met:"),
        ol(
          "The aircraft is continuously in a position from which a descent to a landing on the intended runway can be made at a normal rate of descent using normal maneuvers.",
          "The flight visibility is not less than the visibility prescribed for the approach.",
          "At least one of the following visual references for the intended runway is distinctly visible and identifiable: the approach light system; the threshold, threshold markings or threshold lights; runway end identifier lights; the visual glide slope indicator; the touchdown zone, touchdown zone markings or touchdown zone lights; the runway or runway markings; the runway lights.",
        ),
        warning(
          "The approach light exception",
          "If the approach lights are your only reference, you may descend to 100 ft above the touchdown zone elevation — but not lower unless the red terminating bars or red side row bars are also distinctly visible and identifiable.",
        ),
        check({
          id: "ifr.approaches.1.k1",
          kind: "scenario",
          context:
            "At DA on an ILS, you see the approach light system clearly but nothing else. Flight visibility appears to meet the published minimum. The ALS has no red terminating or side row bars visible.",
          prompt: "How low may you descend?",
          choices: [
            "To the runway — the ALS is a valid reference",
            "You must go missed at DA",
            "To 50 ft above the touchdown zone",
            "To 100 ft above the touchdown zone elevation, unless other references become visible",
          ],
          answer: 3,
          explanation:
            "The ALS lets you continue below DA, but only to 100 ft above TDZE unless the red terminating or red side row bars are visible. To land you then need one of the other references (threshold, runway lights, etc.).",
          subject: "Instrument Approaches",
          reference: "14 CFR 91.175(c)(3)(i)",
        }),
        caution(
          "Maintain the last assigned altitude",
          "When cleared for an approach while on an unpublished route or radar vectors, maintain the last assigned altitude until established on a segment of a published route or the approach procedure (91.175(i)), unless ATC assigns another altitude.",
        ),
      ],
    },
    {
      id: "ifr.approaches.2",
      title: "ILS, Localizer and RNAV Approaches",
      minutes: 12,
      objectives: [
        "Describe ILS components and localizer and glideslope sensitivity",
        "Compare LPV, LNAV/VNAV, LNAV and LP approaches",
        "Fly a stabilized precision approach",
      ],
      blocks: [
        h("The ILS"),
        p(
          "The instrument landing system provides precise lateral and vertical guidance to a runway. The localizer gives lateral guidance along the runway centerline; the glideslope gives vertical guidance, usually on a 3° path; marker beacons or fixes give range information; and an approach light system helps the transition to visual flight.",
        ),
        diagram("ils", "ILS localizer and glideslope: course widths, glideslope angle and the decision altitude."),
        table(
          ["Component", "Details"],
          [
            ["Localizer", "108.10–111.95 MHz (odd tenths). Course width 3°–6° (typically 5°, i.e., 2.5° full scale each side), tailored to about 700 ft wide at the threshold — roughly four times more sensitive than a VOR"],
            ["Glideslope", "UHF, automatically paired with the localizer. Typically 3°. Full-scale deflection is about ±0.7°. False glideslopes exist above the true one, so intercept from below"],
            ["Outer marker", "4–7 NM from the threshold; blue light, dashes (often replaced by a named fix)"],
            ["Middle marker", "About 3,500 ft from the threshold; amber light, alternating dots and dashes"],
            ["Approach lights", "Aid the transition from instrument to visual flight"],
          ],
        ),
        info(
          "CAT I minimums",
          "A standard Category I ILS has a decision height of no lower than 200 ft above the touchdown zone and visibility minimums as low as 1/2 SM or RVR 2,400 ft (1,800 ft with touchdown zone and centerline lighting).",
        ),
        check({
          id: "ifr.approaches.2.k1",
          kind: "mc",
          prompt: "Why should the glideslope normally be intercepted from below?",
          choices: [
            "Because the glideslope signal is not transmitted above 3°",
            "To avoid capturing a false glideslope that exists above the true one",
            "Because ATC regulations prohibit intercepting from above",
            "Because the localizer is only usable below the glideslope",
          ],
          answer: 1,
          explanation:
            "False glideslope lobes exist at higher angles (multiples of the true angle). Intercepting from below at the published altitude ensures you capture the true glideslope. Intercepting from above is not prohibited, but it risks capturing a false one.",
          subject: "Instrument Approaches",
          reference: "AIM 1-1-9",
        }),
        h("Localizer-only and back course"),
        p(
          "If the glideslope is out of service, the approach becomes a localizer (nonprecision) approach with higher minimums: an MDA and a missed approach point usually defined by a fix or timing. A localizer back course approach uses the localizer signal behind the antenna; with a conventional CDI the needle reverse-senses, but an HSI set to the front course does not.",
        ),
        h("RNAV (GPS) approaches"),
        table(
          ["Minimums line", "Guidance", "Minimum type", "Equipment"],
          [
            ["LPV", "Lateral and vertical, angular like an ILS", "DA (can be as low as 200 ft)", "WAAS"],
            ["LNAV/VNAV", "Lateral and vertical", "DA", "WAAS or approved baro-VNAV"],
            ["LP", "Lateral only, angular", "MDA", "WAAS"],
            ["LNAV", "Lateral only", "MDA", "IFR-approved GPS (WAAS not required)"],
          ],
        ),
        p(
          "LPV and LNAV/VNAV are approaches with vertical guidance (APV); they are flown like an ILS to a DA. LNAV and LP are nonprecision approaches flown to an MDA. Many units also provide advisory vertical guidance ('LNAV+V') on LNAV approaches — useful for a stable descent, but the MDA and stepdown fixes still govern.",
        ),
        tip(
          "Check the annunciator",
          "Before the final approach fix, confirm the GPS annunciates the approach mode you expect (for example, LPV). If it downgrades to LNAV, you must use the LNAV MDA, not the LPV DA.",
        ),
        practice("/simulator?scenario=ifr-ils", "ILS approach", "Fly a coupled and hand-flown ILS to minimums."),
        practice("/simulator?scenario=ifr-rnav", "RNAV approach", "Fly an RNAV (GPS) approach to LPV minimums and handle a downgrade to LNAV."),
      ],
    },
    {
      id: "ifr.approaches.3",
      title: "Nonprecision, Circling and Missed Approaches",
      minutes: 11,
      objectives: [
        "Fly a VOR or LNAV approach with stepdown fixes and a visual descent point",
        "Perform a circling approach safely",
        "Execute a missed approach, including an early missed approach",
      ],
      blocks: [
        h("VOR and other nonprecision approaches"),
        p(
          "A VOR approach uses a VOR radial as the final approach course. If the VOR is on the airport, the missed approach point is typically the VOR itself; if off-airport, it is usually a DME fix or a time from the FAF. Stepdown fixes on final protect obstacles — do not descend below a stepdown fix altitude until you pass it.",
        ),
        ul(
          "Use a continuous descent final approach (CDFA) where possible: a constant-angle descent at the published vertical descent angle, rather than 'dive and drive' to the MDA.",
          "The visual descent point (VDP, marked 'V') is where a normal descent from the MDA to the runway can begin — do not descend below the MDA before the VDP.",
          "If the MAP is based on timing, start the clock at the FAF and use the groundspeed table on the chart.",
        ),
        check({
          id: "ifr.approaches.3.k1",
          kind: "calc",
          context: "The timing table shows FAF to MAP: 4.2 NM. Your groundspeed on final is 90 knots.",
          prompt: "About how long after passing the FAF will you reach the MAP?",
          choices: ["2 min 48 s", "1 min 50 s", "3 min 30 s", "4 min 12 s"],
          answer: 0,
          explanation:
            "Time = distance ÷ groundspeed = 4.2 ÷ 90 hours = 0.0467 h × 60 = 2.8 min ≈ 2 min 48 s. Use groundspeed, not indicated airspeed — a headwind lengthens the time.",
          subject: "Instrument Approaches",
          reference: "IFH Ch. 10",
        }),
        h("Circling approaches"),
        p(
          "A circling approach lets you land on a runway other than the one aligned with the final approach course. You descend to the circling MDA, keep the airport in sight, and maneuver visually to the landing runway, staying within the protected circling area for your approach category. Do not descend below the circling MDA until in a position to make a normal descent to the landing runway.",
        ),
        warning(
          "Circling is high-risk",
          "Low altitude, low speed, maneuvering and poor visibility combine during circling. If you lose sight of the airport, immediately begin the missed approach: make a climbing turn toward the landing runway and continue the turn until established on the missed approach course.",
        ),
        h("Missed approaches"),
        p(
          "Under 91.175(e) you must immediately execute the missed approach when the requirements to descend below the DA/MDA are not met on reaching the MAP or DA, or when, at any time after descending below the DA/MDA, an identifiable part of the airport is not distinctly visible (except during normal bank in a circling approach).",
        ),
        ol(
          "Power: apply climb or go-around power.",
          "Attitude: pitch up to the missed approach attitude.",
          "Configure: clean up gear and flaps as the POH directs once climbing.",
          "Fly the published missed approach (or ATC's instructions) and tell ATC 'missed approach'.",
        ),
        info(
          "Early missed approach",
          "If you begin a missed approach before the MAP, the AIM recommends flying the approach's lateral path to the MAP, at or above the MDA or DA, before making any turn, unless ATC instructs otherwise. Obstacle protection for the missed approach assumes you start it at the MAP.",
        ),
        check({
          id: "ifr.approaches.3.k2",
          kind: "mc",
          prompt: "You decide to go missed 2 NM before the MAP on a nonprecision approach. What does the AIM recommend?",
          choices: [
            "Immediately turn to the missed approach heading",
            "Climb straight ahead to the MAP at or above the MDA, then fly the missed approach",
            "Descend to the MDA and continue to the MAP",
            "Request vectors and hold present position",
          ],
          answer: 1,
          explanation:
            "Fly to the MAP along the approach course at or above the MDA, then execute the published missed approach. Turning early can take you out of the protected airspace designed for the missed approach.",
          subject: "Instrument Approaches",
          reference: "AIM 5-4-21",
        }),
        tip(
          "Brief the miss first",
          "Brief the missed approach before you start the approach and set up the navigation for it. Expect the miss on every approach — then landing is the pleasant surprise.",
        ),
        practice("/simulator?scenario=ifr-missed", "Missed approach", "Fly an approach to minimums, go missed and enter the published hold."),
      ],
    },
  ],
  flashcards: [
    { id: "ifr.approaches.fc1", front: "DA vs MDA", back: "DA: decision point on precision/APV approaches. MDA: lowest altitude on nonprecision/circling until visual references are met." },
    { id: "ifr.approaches.fc2", front: "Approach category B", back: "VREF / 1.3 VSO of 91–120 knots." },
    { id: "ifr.approaches.fc3", front: "Approach lights as the only reference", back: "Descend no lower than 100 ft above TDZE unless red terminating or side row bars are visible." },
    { id: "ifr.approaches.fc4", front: "LPV vs LNAV", back: "LPV: lateral + vertical to a DA (WAAS). LNAV: lateral only to an MDA." },
    { id: "ifr.approaches.fc5", front: "When a procedure turn is not permitted", back: "NoPT, radar vectors to final, timed approach from a hold, or cleared straight-in." },
    { id: "ifr.approaches.fc6", front: "Losing sight of the airport while circling", back: "Climbing turn toward the landing runway, then continue to the missed approach course." },
  ],
  quiz: [
    q({
      id: "ifr.approaches.q1",
      kind: "mc",
      prompt: "An airplane's VREF is 75 knots, but you plan to circle at 95 knots. Which approach category minimums should you use?",
      choices: ["A", "B", "C", "D"],
      answer: 1,
      explanation:
        "Category A is under 91 knots, but if you maneuver at a speed in the next category's range (91–120 knots), you must use Category B minimums. Using A because of VREF alone is the trap.",
      subject: "Instrument Approaches",
      reference: "14 CFR 97.3; AIM 5-4-7",
    }),
    q({
      id: "ifr.approaches.q2",
      kind: "mc",
      prompt: "Which approach provides vertical guidance and uses a decision altitude?",
      choices: ["LNAV", "LP", "VOR", "LNAV/VNAV"],
      answer: 3,
      explanation:
        "LNAV/VNAV (like LPV) is an approach with vertical guidance flown to a DA. LNAV, LP and VOR approaches are lateral-only and use an MDA.",
      subject: "Instrument Approaches",
      reference: "AIM 5-4-5",
    }),
    q({
      id: "ifr.approaches.q3",
      kind: "scenario",
      context:
        "On an LNAV approach you reach the MDA 1 NM before the VDP and see the runway lights. Flight visibility meets the minimum.",
      prompt: "What should you do?",
      choices: [
        "Descend immediately to land",
        "Maintain the MDA until reaching the VDP, then begin a normal descent",
        "Go missed immediately because you are early",
        "Climb back to the FAF altitude",
      ],
      answer: 1,
      explanation:
        "The VDP is where a normal descent to the runway begins. Descending below the MDA before the VDP can put you below the obstacle-clear visual path. You do not need to go missed — just hold the MDA until the VDP.",
      subject: "Instrument Approaches",
      reference: "AIM 5-4-5",
    }),
    q({
      id: "ifr.approaches.q4",
      kind: "mc",
      prompt: "Compared with a VOR, a localizer is approximately how much more sensitive?",
      choices: ["Four times", "Twice", "Ten times", "The same"],
      answer: 0,
      explanation:
        "A localizer full-scale deflection is about 2.5° (typical) versus 10° for a VOR — roughly four times more sensitive. That is why small corrections are essential on a localizer.",
      subject: "Instrument Approaches",
      reference: "IFH Ch. 9",
    }),
    q({
      id: "ifr.approaches.q5",
      kind: "mc",
      prompt: "Under 91.175, which is NOT one of the visual references that allows descent below DA or MDA?",
      choices: [
        "Runway end identifier lights (REIL)",
        "The visual glide slope indicator",
        "A taxiway adjacent to the runway",
        "Touchdown zone lights",
      ],
      answer: 2,
      explanation:
        "Taxiways are not listed references. REIL, the VGSI and touchdown zone lights are all on the 91.175(c)(3) list.",
      subject: "Instrument Approaches",
      reference: "14 CFR 91.175(c)",
    }),
    q({
      id: "ifr.approaches.q6",
      kind: "tf",
      prompt: "True or false: when established on a segment marked 'NoPT', you should fly the procedure turn anyway if you are high.",
      choices: ["True", "False"],
      answer: 1,
      explanation:
        "False. A procedure turn is not permitted on a NoPT route without ATC authorization. If you need to lose altitude, ask ATC for a hold or vectors.",
      subject: "Instrument Approaches",
      reference: "AIM 5-4-9",
    }),
    q({
      id: "ifr.approaches.q7",
      kind: "mc",
      prompt: "While circling to land at the MDA, you lose sight of the airport. What should you do?",
      choices: [
        "Descend to regain visual contact",
        "Continue the circle at the MDA until you see the runway again",
        "Make a climbing turn toward the landing runway and continue to the missed approach course",
        "Fly straight ahead and climb",
      ],
      answer: 2,
      explanation:
        "The AIM procedure is an initial climbing turn toward the landing runway, continuing until established on the missed approach course. This keeps you within the protected circling area. Flying straight ahead could take you out of it.",
      subject: "Instrument Approaches",
      reference: "AIM 5-4-21",
    }),
    q({
      id: "ifr.approaches.q8",
      kind: "scenario",
      context: "On an ILS, NOTAMs report the glideslope out of service.",
      prompt: "Which minimums apply?",
      choices: [
        "The localizer (LOC) MDA and visibility",
        "The ILS DA with a 50-ft increase",
        "Circling minimums only",
        "The approach may not be flown",
      ],
      answer: 0,
      explanation:
        "Without a glideslope, the approach is flown as a localizer approach using the published LOC (S-LOC) MDA and visibility. There is no rule adding 50 ft to the DA.",
      subject: "Instrument Approaches",
      reference: "IFH Ch. 10",
    }),
  ],
  practice: [
    link("/simulator?scenario=ifr-ils", "ILS approach"),
    link("/simulator?scenario=ifr-rnav", "RNAV approach"),
    link("/simulator?scenario=ifr-missed", "Missed approach"),
    link("/simulator?scenario=ifr-vor-intercept", "VOR approach tracking"),
  ],
};
