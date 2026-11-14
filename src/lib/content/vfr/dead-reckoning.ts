import type { Module } from "../types";
import { check, diagram, exercise, h, info, link, ol, p, practice, q, table, tip, ul } from "../builders";

export const deadReckoning: Module = {
  id: "dead-reckoning",
  number: 10,
  title: "Dead Reckoning",
  summary:
    "Computing heading, groundspeed, time and fuel from the wind triangle, converting true to compass heading, and correcting when you drift off course.",
  lessons: [
    {
      id: "vfr.dead-reckoning.1",
      title: "The Wind Triangle and Heading",
      minutes: 11,
      objectives: [
        "Explain the wind triangle and the difference between course, heading and track",
        "Convert true course to compass heading using wind correction, variation and deviation",
        "Estimate wind correction angle with a rule of thumb",
      ],
      blocks: [
        h("Why dead reckoning"),
        p(
          "Dead reckoning (from 'deduced reckoning') is navigation by computation: knowing your true airspeed, the wind, and your course, you work out the heading to fly and how long each leg will take. Once airborne, you fly the heading, keep time and confirm with pilotage. It works anywhere — over featureless terrain, at night, or when the GPS fails.",
        ),
        h("Course, heading and track"),
        ul(
          "True course (TC): the intended path over the ground, measured from true north with a plotter on the chart.",
          "Heading: the direction the nose points. With a crosswind, heading differs from course by the wind correction angle (WCA).",
          "Track: the path actually flown over the ground. If you correct perfectly, track equals course.",
          "True airspeed (TAS) is speed through the air; groundspeed (GS) is speed over the ground after the wind's effect.",
        ),
        diagram(
          "wind-triangle",
          "The wind triangle: the air vector (heading and TAS), the wind vector, and the resulting ground vector (track and groundspeed).",
        ),
        h("From true course to compass heading"),
        table(
          ["Step", "Apply", "Memory aid"],
          [
            ["True course ± WCA = true heading", "Add WCA for a wind from the right, subtract for a wind from the left", "Correct into the wind"],
            ["True heading ± variation = magnetic heading", "Subtract easterly variation, add westerly variation", "'East is least, west is best'"],
            ["Magnetic heading ± deviation = compass heading", "Use the compass correction card", "—"],
          ],
        ),
        check({
          id: "vfr.dead-reckoning.1.k1",
          kind: "calc",
          prompt: "True course 270°, wind correction angle 8° right, magnetic variation 5°W. What is the magnetic heading?",
          choices: ["257°", "273°", "283°", "287°"],
          answer: 2,
          explanation:
            "TC 270 + 8 (wind from the right) = TH 278. Variation is west, so add: 278 + 5 = 283°. Subtracting westerly variation (giving 273°) is the most common error — remember 'west is best'.",
          subject: "Navigation",
          reference: "PHAK Ch. 16",
        }),
        h("Rule-of-thumb wind correction"),
        p(
          "The maximum drift angle in degrees is about (wind speed × 60) ÷ TAS. With a 20-knot wind and 100 knots TAS, maximum drift is about 12°, which happens when the wind is 90° to your course. With the wind 30° off the nose, use about half of the maximum; at 45°, about 70%; at 60° or more, nearly all of it. An E6B or electronic flight computer gives exact values.",
        ),
        exercise("wind-correction", "Compute wind correction angle and groundspeed"),
        tip(
          "Winds aloft are true",
          "Winds aloft forecasts give direction relative to TRUE north, so work the wind triangle with true course first, then apply variation. Surface winds from ATIS and the tower are magnetic.",
        ),
        info(
          "Compass deviation card",
          "Deviation varies by heading and is posted near the compass. It is usually only a few degrees, but it changes as avionics and electrical loads change.",
        ),
      ],
    },
    {
      id: "vfr.dead-reckoning.2",
      title: "Time, Speed, Distance, Fuel and Course Corrections",
      minutes: 10,
      objectives: [
        "Solve time, speed, distance and fuel problems",
        "Complete a navigation log for a cross-country leg",
        "Apply the 1-in-60 rule to return to course",
      ],
      blocks: [
        h("Time, speed and distance"),
        p(
          "The core relationship is distance = groundspeed × time. Rearranged, time (in minutes) = distance ÷ groundspeed × 60. Fuel required = time in hours × fuel burn per hour. These are the numbers you write on your navigation log for every leg, and they let you compare actual progress to your plan at each checkpoint.",
        ),
        check({
          id: "vfr.dead-reckoning.2.k1",
          kind: "calc",
          prompt: "A leg is 75 NM. Groundspeed is 110 knots and fuel burn is 9 gallons per hour. About how long and how much fuel?",
          choices: ["34 min, 5.1 gal", "41 min, 6.2 gal", "45 min, 6.8 gal", "68 min, 10.2 gal"],
          answer: 1,
          explanation:
            "75 ÷ 110 = 0.68 hours ≈ 41 minutes. 0.68 × 9 ≈ 6.2 gallons. Dividing 110 by 75 instead (or mixing up minutes and hours) produces the other answers.",
          subject: "Navigation",
          reference: "PHAK Ch. 16",
        }),
        h("The navigation log"),
        ol(
          "Draw the course and pick checkpoints; measure true course and distance for each leg.",
          "Get the winds aloft and choose an altitude; compute TAS from the POH.",
          "Solve the wind triangle for WCA and groundspeed on each leg.",
          "Convert to magnetic and compass heading.",
          "Compute time and fuel for each leg, including extra for the climb, and total them.",
          "Add the required reserve (30 minutes day, 45 minutes night) and compare with usable fuel.",
        ),
        exercise("xc-calc", "Fill in a navigation log"),
        exercise("fuel-planning", "Plan fuel with reserves"),
        h("Getting back on course: the 1-in-60 rule"),
        p(
          "At 60 NM, an error of 1° puts you about 1 NM off course. So the angle you are off course is approximately (distance off × 60) ÷ distance flown. To parallel the course, correct by that angle; to converge on your destination, add a second correction equal to (distance off × 60) ÷ distance remaining.",
        ),
        table(
          ["Example: 4 NM right of course after 40 NM, 60 NM to go", "Calculation", "Result"],
          [
            ["Angle to parallel course", "4 × 60 ÷ 40", "6°"],
            ["Additional angle to converge at destination", "4 × 60 ÷ 60", "4°"],
            ["Total correction (to the left)", "6° + 4°", "10°"],
          ],
        ),
        check({
          id: "vfr.dead-reckoning.2.k2",
          kind: "calc",
          prompt: "After 30 NM you find yourself 3 NM left of course. Approximately how many degrees are you off course?",
          choices: ["3°", "6°", "10°", "18°"],
          answer: 1,
          explanation:
            "Using 1-in-60: 3 × 60 ÷ 30 = 6°. Taking the 3 NM directly as degrees ignores that you have flown only half of 60 NM, which doubles the angle.",
          subject: "Navigation",
          reference: "PHAK Ch. 16",
        }),
        practice("/planner", "Flight planner", "Build a complete nav log with winds, times and fuel for a real route."),
      ],
    },
  ],
  flashcards: [
    { id: "vfr.dead-reckoning.fc1", front: "TC → compass heading sequence", back: "TC ± WCA = TH; TH ± variation = MH; MH ± deviation = CH." },
    { id: "vfr.dead-reckoning.fc2", front: "Applying variation", back: "East is least (subtract), west is best (add) when going from true to magnetic." },
    { id: "vfr.dead-reckoning.fc3", front: "Maximum drift rule of thumb", back: "Wind speed × 60 ÷ TAS." },
    { id: "vfr.dead-reckoning.fc4", front: "Time in minutes", back: "Distance ÷ groundspeed × 60." },
    { id: "vfr.dead-reckoning.fc5", front: "1-in-60 rule", back: "1° of error ≈ 1 NM off course per 60 NM flown." },
    { id: "vfr.dead-reckoning.fc6", front: "Winds aloft forecast direction reference", back: "True north." },
  ],
  quiz: [
    q({
      id: "vfr.dead-reckoning.q1",
      kind: "calc",
      prompt: "True heading 155°, variation 9°E, deviation +2° (from the card). What is the compass heading?",
      choices: ["144°", "148°", "162°", "166°"],
      answer: 1,
      explanation:
        "155 − 9 (east is least) = 146 magnetic. Apply the deviation from the card: 146 + 2 = 148° compass. Adding easterly variation instead gives 166°.",
      subject: "Navigation",
      reference: "PHAK Ch. 16",
    }),
    q({
      id: "vfr.dead-reckoning.q2",
      kind: "calc",
      prompt: "You cover 22 NM between two checkpoints in 12 minutes. What is your groundspeed?",
      choices: ["92 knots", "120 knots", "132 knots", "110 knots"],
      answer: 3,
      explanation: "22 NM in 12 minutes = 22 × (60 ÷ 12) = 22 × 5 = 110 knots.",
      subject: "Navigation",
      reference: "PHAK Ch. 16",
    }),
    q({
      id: "vfr.dead-reckoning.q3",
      kind: "calc",
      prompt: "TAS is 120 knots and the wind is 30 knots directly across your course. What is the approximate maximum wind correction angle?",
      choices: ["4°", "8°", "15°", "30°"],
      answer: 2,
      explanation:
        "Max drift ≈ wind × 60 ÷ TAS = 30 × 60 ÷ 120 = 15°. Using the wind speed itself (30°) dramatically overcorrects.",
      subject: "Navigation",
      reference: "PHAK Ch. 16",
    }),
    q({
      id: "vfr.dead-reckoning.q4",
      kind: "mc",
      prompt: "The direction in which the nose of the airplane points during flight is the:",
      choices: ["Heading", "Course", "Track", "Bearing"],
      answer: 0,
      explanation:
        "Heading is where the nose points. Course is the intended path and track is the path actually flown over the ground — they differ from heading whenever there is a crosswind.",
      subject: "Navigation",
      reference: "PHAK Ch. 16",
    }),
    q({
      id: "vfr.dead-reckoning.q5",
      kind: "calc",
      context: "Day VFR. Planned flight time 1 hour 30 minutes. Fuel burn 8 gallons per hour. Usable fuel 24 gallons.",
      prompt: "What is the minimum fuel required by 91.151, and is there enough?",
      choices: [
        "12 gal; yes",
        "16 gal; yes",
        "18 gal; no",
        "24 gal; exactly enough",
      ],
      answer: 1,
      explanation:
        "1.5 hours × 8 = 12 gallons plus a 30-minute day reserve (4 gallons) = 16 gallons, so 24 usable is enough. 12 gallons forgets the reserve; 18 gallons is what a 45-minute night reserve would require.",
      subject: "Regulations",
      reference: "14 CFR 91.151",
    }),
    q({
      id: "vfr.dead-reckoning.q6",
      kind: "calc",
      prompt: "After 20 NM you are 2 NM right of course with 40 NM remaining. What total heading change (to the left) will take you directly to the destination?",
      choices: ["3°", "6°", "9°", "12°"],
      answer: 2,
      explanation:
        "To parallel: 2 × 60 ÷ 20 = 6°. To converge: 2 × 60 ÷ 40 = 3°. Total = 9° left. Correcting only 6° would merely parallel the course and leave you 2 NM off at the destination.",
      subject: "Navigation",
      reference: "PHAK Ch. 16",
    }),
  ],
  practice: [link("/planner", "Flight planner"), link("/simulator?scenario=vfr-xc", "Fly the plan")],
};
