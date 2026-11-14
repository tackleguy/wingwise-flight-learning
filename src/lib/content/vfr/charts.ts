import type { Module } from "../types";
import {
  caution,
  check,
  exercise,
  h,
  info,
  link,
  p,
  practice,
  q,
  table,
  tip,
  ul,
} from "../builders";

export const charts: Module = {
  id: "charts",
  number: 8,
  title: "Aviation Charts",
  summary:
    "Reading VFR sectional charts: scale, latitude and longitude, terrain and obstacles, airport and navaid symbols, and the Chart Supplement.",
  lessons: [
    {
      id: "vfr.charts.1",
      title: "Reading the Sectional: Grid, Terrain and Obstacles",
      minutes: 10,
      objectives: [
        "Use the latitude/longitude grid and the chart scale to locate points and measure distance",
        "Interpret maximum elevation figures (MEFs) and terrain shading",
        "Read obstacle symbols and their MSL and AGL heights",
      ],
      blocks: [
        h("The sectional chart"),
        p(
          "The VFR sectional aeronautical chart is the primary navigation chart for visual flight. It is drawn at a scale of 1:500,000 — about 6.86 nautical miles (roughly 8 statute miles) per inch — and is revised every 56 days. Always fly with a current chart: airspace, frequencies and obstacles change. Terminal Area Charts (TACs) at 1:250,000 show the busiest areas in more detail.",
        ),
        h("Latitude and longitude"),
        p(
          "Lines of latitude run east-west and measure distance north or south of the equator; lines of longitude run north-south and measure distance east or west of the prime meridian. Each degree is divided into 60 minutes. Because one minute of latitude equals one nautical mile anywhere on earth, the latitude scale along a meridian doubles as a distance scale. One minute of longitude shrinks as you move away from the equator, so do not use longitude ticks to measure distance.",
        ),
        check({
          id: "vfr.charts.1.k1",
          kind: "calc",
          prompt:
            "Two airports lie on the same meridian, one at 40°15'N and the other at 40°45'N. How far apart are they?",
          choices: ["15 NM", "30 NM", "45 NM", "60 NM"],
          answer: 1,
          explanation:
            "They differ by 30 minutes of latitude, and each minute of latitude is 1 NM, so they are 30 NM apart. 60 NM would be one full degree.",
          subject: "Charts",
          reference: "PHAK Ch. 16",
        }),
        h("Terrain and the maximum elevation figure"),
        p(
          "Terrain is shown with contour lines, color tints (greens for low terrain through browns for high) and spot elevations in feet MSL. Within each quadrangle bounded by ticked lines of latitude and longitude, a large two-part number — the Maximum Elevation Figure (MEF) — shows the highest elevation of terrain and obstacles in thousands and hundreds of feet MSL. A large 3 followed by a smaller 5 means 3,500 ft MSL.",
        ),
        caution(
          "The MEF is not a safe altitude by itself",
          "The MEF tells you the highest known feature in the quadrangle (with an allowance for unknown error), not a cruising altitude with clearance. Plan to fly comfortably above it, and remember 91.119 minimum altitudes.",
        ),
        h("Obstacles"),
        table(
          ["Symbol / number", "Meaning"],
          [
            [
              "Single obstacle symbol (less than 1,000 ft AGL)",
              "Tower, stack or similar man-made obstacle",
            ],
            ["Taller obstacle symbol", "1,000 ft AGL or higher"],
            ["Group obstacle symbol", "Multiple obstacles in close proximity"],
            ["Lightning-bolt rays on symbol", "High-intensity obstruction lights"],
            ["Bold number (e.g., 1549)", "Top of obstacle in feet MSL"],
            ["Number in parentheses (e.g., (1203))", "Height of obstacle in feet AGL"],
            ["'UC'", "Under construction or reported, position and elevation unverified"],
          ],
        ),
        tip(
          "Guy wires",
          "Tall towers are supported by guy wires that can extend up to about 1,500 ft horizontally from the tower — invisible from the air. Give towers a wide berth.",
        ),
        check({
          id: "vfr.charts.1.k2",
          kind: "chart",
          context: "Next to an obstacle symbol the chart shows: 2049 (1203)",
          prompt: "What is the height of the top of the obstacle above mean sea level?",
          choices: ["2,049 ft MSL", "1,203 ft MSL", "3,252 ft MSL", "846 ft MSL"],
          answer: 0,
          explanation:
            "The bold number is the MSL elevation of the top (2,049 ft MSL); the number in parentheses is the height above ground (1,203 ft AGL). Adding them together is a common mistake.",
          subject: "Charts",
          reference: "FAA Aeronautical Chart User's Guide",
        }),
        info(
          "Isogonic lines",
          "Dashed magenta lines labeled with a value such as 8°E show magnetic variation. You will use them when converting true course to magnetic course in dead reckoning.",
        ),
      ],
    },
    {
      id: "vfr.charts.2",
      title: "Airports, Navaids and the Chart Supplement",
      minutes: 10,
      objectives: [
        "Decode airport symbols and data blocks",
        "Recognize navaid symbols and the VOR compass rose",
        "Use the Chart Supplement for detailed airport information",
      ],
      blocks: [
        h("Airport symbols"),
        p(
          "Color tells you about the tower: blue airport symbols indicate an airport with a control tower; magenta indicates a non-towered airport. Hard-surfaced runways of 1,500 to 8,069 ft are drawn inside a circle showing the runway layout. Tick marks around the circle mean fuel is available and the field is attended during normal working hours. A star above the symbol indicates a rotating beacon operating from sunset to sunrise.",
        ),
        h("The airport data block"),
        table(
          ["Item", "Example", "Meaning"],
          [
            ["Name and identifier", "CITY MUNI (KABC)", "Airport name and location identifier"],
            ["Tower frequency", "CT - 118.3 ★", "Control tower frequency; ★ = part-time tower"],
            ["CTAF", "Ⓒ after a frequency", "Common traffic advisory frequency"],
            ["ATIS / AWOS / ASOS", "ATIS 124.5", "Automated weather/information frequency"],
            ["Elevation", "1125", "Field elevation in feet MSL"],
            [
              "Lighting",
              "L / *L",
              "Runway lights sunset to sunrise / lighting limitations — see Chart Supplement",
            ],
            ["Longest runway", "72", "Length of longest runway in hundreds of feet (7,200 ft)"],
            ["UNICOM", "122.95", "Aeronautical advisory station frequency"],
            ["Right traffic", "RP 23", "Right-hand traffic pattern for runway 23"],
            ["NO SVFR", "NO SVFR", "Fixed-wing special VFR not authorized"],
          ],
        ),
        exercise("sectional-symbols", "Identify sectional chart symbols"),
        h("Navaids"),
        ul(
          "VOR, VOR-DME and VORTAC symbols, surrounded by a compass rose aligned to MAGNETIC north.",
          "Blue boxes with the navaid name, frequency, Morse identifier and channel; an underlined frequency means no voice on that frequency.",
          "Victor airways drawn in blue from VOR to VOR, labeled such as V25.",
          "NDBs shown in magenta with their frequency in kHz.",
        ),
        check({
          id: "vfr.charts.2.k1",
          kind: "chart",
          context: "Airport data block: CT - 120.6 ★ Ⓒ   ATIS 127.25   874 *L 60 122.95",
          prompt: "Which statement is correct?",
          choices: [
            "The tower is part-time, field elevation is 874 ft MSL, and the longest runway is 6,000 ft",
            "The tower operates 24 hours and the field elevation is 60 ft",
            "The airport has no lighting and the UNICOM is 127.25",
            "Runway lighting is available sunset to sunrise without limitation",
          ],
          answer: 0,
          explanation:
            "The star after the tower frequency means part-time, 874 is the elevation, and 60 means the longest runway is 6,000 ft. *L means lighting limitations exist (see the Chart Supplement), and 127.25 is the ATIS, not UNICOM (122.95).",
          subject: "Charts",
          reference: "FAA Aeronautical Chart User's Guide",
        }),
        h("The Chart Supplement"),
        p(
          "The Chart Supplement (formerly the Airport/Facility Directory) contains the details that do not fit on a chart: runway dimensions and surface, traffic pattern altitudes, lighting and how to activate it, fuel, hours of tower operation, airspace classification when the tower is closed, noise-abatement and other remarks. Always review it for unfamiliar airports as part of your 91.103 preflight action.",
        ),
        tip(
          "Read the legend",
          "Every sectional has a legend panel. When you see a symbol you are unsure of, check the legend or the FAA Aeronautical Chart User's Guide rather than guessing.",
        ),
        practice(
          "/airports",
          "Airport directory",
          "Browse airport data and compare it with the chart symbols you have learned.",
        ),
      ],
    },
  ],
  flashcards: [
    {
      id: "vfr.charts.fc1",
      front: "Sectional chart scale",
      back: "1:500,000 — about 6.86 NM (8 SM) per inch.",
    },
    {
      id: "vfr.charts.fc2",
      front: "Blue vs magenta airport symbol",
      back: "Blue: towered. Magenta: non-towered.",
    },
    {
      id: "vfr.charts.fc3",
      front: "Maximum Elevation Figure (MEF)",
      back: "Highest terrain or obstacle in the quadrangle, in thousands and hundreds of feet MSL.",
    },
    {
      id: "vfr.charts.fc4",
      front: "Obstacle numbers 1549 (1203)",
      back: "Top at 1,549 ft MSL; 1,203 ft above ground.",
    },
    {
      id: "vfr.charts.fc5",
      front: "Star after the tower frequency",
      back: "Part-time tower — check the Chart Supplement for hours.",
    },
    { id: "vfr.charts.fc6", front: "One minute of latitude", back: "One nautical mile." },
  ],
  quiz: [
    q({
      id: "vfr.charts.q1",
      kind: "mc",
      prompt: "A large '4' followed by a smaller '3' in a sectional chart quadrangle means:",
      choices: [
        "The highest terrain is 430 ft MSL",
        "The Class E floor is 4,300 ft MSL",
        "Minimum safe altitude is 4,300 ft AGL",
        "The highest terrain or obstacle elevation is 4,300 ft MSL",
      ],
      answer: 3,
      explanation:
        "That is the Maximum Elevation Figure: 4,300 ft MSL, the highest known feature in the quadrangle. It is MSL, not AGL, and it is not a published minimum safe altitude.",
      subject: "Charts",
      reference: "FAA Aeronautical Chart User's Guide",
    }),
    q({
      id: "vfr.charts.q2",
      kind: "mc",
      prompt: "The compass rose around a VOR on a sectional chart is oriented to:",
      choices: ["Magnetic north", "True north", "Grid north", "The runway heading"],
      answer: 0,
      explanation:
        "VOR radials are magnetic, so the compass rose is aligned with magnetic north. Lines of latitude and longitude (and your plotter course) are referenced to true north.",
      subject: "Charts",
      reference: "PHAK Ch. 16",
    }),
    q({
      id: "vfr.charts.q3",
      kind: "mc",
      prompt: "Tick marks around a sectional chart airport symbol indicate:",
      choices: [
        "A control tower",
        "A rotating beacon",
        "Fuel available and the field attended during normal working hours",
        "Right traffic patterns",
      ],
      answer: 2,
      explanation:
        "Ticks mean services: fuel available and the field attended during normal working hours. A rotating beacon is shown by a star, and a control tower by blue color.",
      subject: "Charts",
      reference: "FAA Aeronautical Chart User's Guide",
    }),
    q({
      id: "vfr.charts.q4",
      kind: "chart",
      context: "Airport data block: 1350 L 45 122.8 Ⓒ RP 17",
      prompt: "What does 'RP 17' mean?",
      choices: [
        "Runway 17 has a published approach",
        "Right-hand traffic is used for runway 17",
        "Runway 17 is the preferred calm-wind runway",
        "Runway 17 is closed",
      ],
      answer: 1,
      explanation:
        "RP followed by runway numbers indicates right-hand traffic for those runways. Left traffic is standard everywhere else unless otherwise indicated.",
      subject: "Charts",
      reference: "FAA Aeronautical Chart User's Guide",
    }),
    q({
      id: "vfr.charts.q5",
      kind: "tf",
      prompt:
        "True or false: one minute of longitude equals one nautical mile anywhere on the sectional chart.",
      choices: ["True", "False"],
      answer: 1,
      explanation:
        "False. Meridians converge toward the poles, so a minute of longitude is less than 1 NM except at the equator. Only latitude gives a constant 1 NM per minute.",
      subject: "Charts",
      reference: "PHAK Ch. 16",
    }),
    q({
      id: "vfr.charts.q6",
      kind: "mc",
      prompt: "Where would you find the hours of operation of a part-time control tower?",
      choices: [
        "The sectional chart legend",
        "The airport's TAF",
        "The POH",
        "The Chart Supplement",
      ],
      answer: 3,
      explanation:
        "The Chart Supplement lists tower hours and what the airspace becomes when the tower closes. The sectional only marks a part-time tower with a star.",
      subject: "Airport Operations",
      reference: "Chart Supplement",
    }),
  ],
  practice: [link("/navigation", "Interactive chart"), link("/airports", "Airport directory")],
};
