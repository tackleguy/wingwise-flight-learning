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
  warning,
} from "../builders";

export const weather: Module = {
  id: "weather",
  number: 7,
  title: "Weather",
  summary:
    "The atmosphere, pressure and wind, stability and clouds; fronts, fog, thunderstorms and icing; and reading METARs, TAFs and other weather products.",
  lessons: [
    {
      id: "vfr.weather.1",
      title: "The Atmosphere, Pressure, Wind and Stability",
      minutes: 11,
      objectives: [
        "Know the standard atmosphere values",
        "Explain circulation around high- and low-pressure systems",
        "Relate temperature/dew point spread, stability and cloud type",
      ],
      blocks: [
        h("The standard atmosphere"),
        p(
          "To compare instruments and performance, the International Standard Atmosphere (ISA) defines sea-level conditions as 15°C (59°F) and 29.92 in Hg (1013.2 hPa). Temperature decreases about 2°C (3.5°F) per 1,000 ft, and pressure decreases about 1 in Hg per 1,000 ft in the lower atmosphere. Real days are rarely standard, which is why we correct for temperature and pressure.",
        ),
        h("Pressure and wind"),
        p(
          "Air flows from high pressure to low pressure, but the Coriolis force deflects it to the right in the Northern Hemisphere. Aloft, the result is wind that flows clockwise around highs and counterclockwise around lows, roughly parallel to the isobars. Near the surface, friction slows the wind, so it crosses the isobars at an angle — flowing out of highs and into lows.",
        ),
        table(
          ["Feature", "High pressure", "Low pressure"],
          [
            [
              "Circulation (N. Hemisphere)",
              "Clockwise, outward at the surface",
              "Counterclockwise, inward at the surface",
            ],
            ["Vertical motion", "Descending (sinking) air", "Rising air"],
            [
              "Typical weather",
              "Generally fair, but haze and poor visibility possible",
              "Clouds, precipitation, generally poorer weather",
            ],
          ],
        ),
        tip(
          "Closely spaced isobars",
          "On a surface chart, closely spaced isobars mean a strong pressure gradient and strong winds.",
        ),
        h("Moisture and the dew point"),
        p(
          "Dew point is the temperature to which air must be cooled to become saturated. When the temperature and dew point are close together (a spread of a few degrees), clouds or fog are likely. You can estimate the base of convective clouds: divide the spread in °C by 2.5 (or in °F by 4.4) and multiply by 1,000 to get the cloud base in feet AGL.",
        ),
        check({
          id: "vfr.weather.1.k1",
          kind: "calc",
          prompt:
            "The surface temperature is 22°C and the dew point is 12°C. What is the approximate base of cumulus clouds?",
          choices: ["2,500 ft AGL", "4,000 ft AGL", "5,000 ft AGL", "10,000 ft AGL"],
          answer: 1,
          explanation:
            "The spread is 10°C. 10 ÷ 2.5 = 4, so about 4,000 ft AGL. Using the Fahrenheit divisor (4.4) on Celsius values would give about 2,300 ft — a common mistake.",
          subject: "Weather",
          reference: "PHAK Ch. 12",
        }),
        h("Stability"),
        p(
          "Stability is the atmosphere's resistance to vertical motion. In stable air, a parcel of air that is lifted becomes cooler than its surroundings and sinks back. In unstable air, it stays warmer than the surroundings and keeps rising. The rate at which temperature actually decreases with altitude (the lapse rate) is the key: a steep lapse rate means instability, while a temperature inversion (temperature increasing with height) is very stable.",
        ),
        table(
          ["Stable air", "Unstable air"],
          [
            ["Stratiform clouds", "Cumuliform clouds"],
            ["Smooth air", "Turbulence"],
            ["Fair to poor visibility (haze, smoke)", "Good visibility, except in showers"],
            ["Steady, continuous precipitation", "Showery precipitation"],
          ],
        ),
        info(
          "Cloud families",
          "Low clouds (stratus, stratocumulus, nimbostratus) have bases from the surface to about 6,500 ft AGL; middle clouds (altostratus, altocumulus) from about 6,500 to 20,000 ft; high clouds (cirrus, cirrostratus, cirrocumulus) above about 20,000 ft. Clouds with extensive vertical development include towering cumulus and cumulonimbus — the thunderstorm cloud.",
        ),
        caution(
          "Inversions trap haze",
          "A low-level temperature inversion with high humidity often produces smooth air but poor visibility in fog, haze or low clouds near the surface.",
        ),
      ],
    },
    {
      id: "vfr.weather.2",
      title: "Fronts, Fog, Thunderstorms and Icing",
      minutes: 12,
      objectives: [
        "Compare the weather associated with cold and warm fronts",
        "Identify types of fog and the conditions that form them",
        "Describe the thunderstorm life cycle and avoidance guidance",
        "Recognize the conditions for structural icing",
      ],
      blocks: [
        h("Air masses and fronts"),
        p(
          "A front is the boundary between two air masses of different temperature and moisture. When a front passes, you can expect a change in temperature and dew point, a wind shift, and a change in pressure. The type of front determines the weather you will encounter.",
        ),
        table(
          ["", "Cold front", "Warm front"],
          [
            ["Movement", "Fast (about 25–30 mph)", "Slow (about 10–25 mph)"],
            [
              "Clouds",
              "Cumuliform; possibly a squall line ahead",
              "Stratiform, extending far ahead of the front",
            ],
            [
              "Precipitation",
              "Showers, heavy at times; narrow band",
              "Steady, light to moderate; wide area; freezing rain possible ahead",
            ],
            [
              "Visibility",
              "Poor in showers, excellent after passage",
              "Poor, often with fog and low ceilings",
            ],
            ["Turbulence", "Often significant", "Usually smooth"],
          ],
        ),
        h("Fog"),
        p(
          "Fog is a cloud that begins within 50 ft of the surface. It forms when the air cools to its dew point or when moisture is added until it is saturated. Small temperature/dew point spreads in the evening forecast a high chance of fog by morning.",
        ),
        ul(
          "Radiation fog: forms on clear, calm nights over land as the ground cools; burns off after sunrise. Light wind (under about 5 knots) helps it form.",
          "Advection fog: moist air moves over a colder surface, common along coasts; can form with winds and persist for days. Winds above about 15 knots usually lift it into low stratus.",
          "Upslope fog: moist, stable air is pushed up sloping terrain and cools adiabatically.",
          "Precipitation-induced fog: warm rain falls through cooler air, adding moisture; often associated with warm fronts.",
          "Steam fog: cold air moves over warmer water; often accompanied by low-level turbulence and icing.",
        ),
        h("Thunderstorms"),
        p(
          "A thunderstorm needs three ingredients: sufficient moisture, an unstable lapse rate, and a lifting action (fronts, terrain, heating or converging winds). It has three stages. In the cumulus stage, continuous updrafts dominate. The mature stage begins when precipitation starts falling from the cloud base — updrafts and downdrafts coexist and the storm is most intense. In the dissipating stage, downdrafts dominate and the storm rains itself out.",
        ),
        warning(
          "Stay 20 NM away",
          "Avoid severe thunderstorms by at least 20 NM, and never fly under the anvil or try to squeeze between storms when doing so would put you within 20 NM of either one. Hazards include severe turbulence, hail (even in clear air beneath the anvil), lightning, icing and microbursts. Embedded thunderstorms hidden in other clouds are especially dangerous.",
        ),
        info(
          "Microbursts",
          "A microburst is an intense, localized downdraft usually less than 1 mile across that can exceed 6,000 ft per minute and lasts about 15 minutes. An airplane flying through one first gains airspeed from a headwind, then meets the downdraft, then a sudden tailwind that robs airspeed close to the ground.",
        ),
        h("Structural icing"),
        p(
          "Two conditions are required for structural ice: visible moisture (cloud or rain) and an aircraft surface temperature at or below freezing. Freezing rain produces the highest accumulation rate and indicates warmer air above — often found ahead of warm fronts. Even a thin layer of frost on the wings must be removed before takeoff; frost disrupts the airflow and can prevent the airplane from becoming airborne.",
        ),
        check({
          id: "vfr.weather.2.k1",
          kind: "mc",
          prompt: "Which stage of a thunderstorm is characterized predominantly by downdrafts?",
          choices: ["Cumulus", "Mature", "Dissipating", "Developing"],
          answer: 2,
          explanation:
            "Downdrafts dominate the dissipating stage. The mature stage has both updrafts and downdrafts and is the most violent, which makes it the tempting choice, but it is not characterized predominantly by downdrafts.",
          subject: "Weather",
          reference: "AC 00-6B; PHAK Ch. 12",
        }),
        check({
          id: "vfr.weather.2.k2",
          kind: "mc",
          prompt:
            "What type of fog is most likely to form on a clear, calm night over a land surface?",
          choices: ["Advection fog", "Radiation fog", "Steam fog", "Upslope fog"],
          answer: 1,
          explanation:
            "Clear skies let the ground radiate heat away, cooling the air above to its dew point — radiation fog. Advection fog requires air moving over a colder surface and usually some wind.",
          subject: "Weather",
          reference: "PHAK Ch. 12",
        }),
      ],
    },
    {
      id: "vfr.weather.3",
      title: "Weather Reports, Forecasts and Briefings",
      minutes: 12,
      objectives: [
        "Decode a METAR and TAF",
        "Identify AIRMETs, SIGMETs, convective SIGMETs and PIREPs",
        "Obtain an appropriate weather briefing",
      ],
      blocks: [
        h("METAR"),
        p(
          "A METAR is an hourly routine surface observation (a SPECI is a special observation issued when conditions change significantly). Elements appear in a fixed order: type, station, date/time (UTC, Zulu), wind, visibility, runway visual range (if reported), present weather, sky condition, temperature/dew point, altimeter and remarks.",
        ),
        table(
          ["Element", "Example", "Decoded"],
          [
            ["Station / time", "KDEN 141753Z", "Denver, 14th day, 1753 UTC"],
            ["Wind", "27015G25KT", "From 270° true at 15 knots, gusting 25"],
            ["Visibility", "3SM", "3 statute miles"],
            ["Weather", "-RA BR", "Light rain and mist"],
            [
              "Sky",
              "FEW008 BKN015 OVC030",
              "Few at 800 ft, broken at 1,500 ft, overcast at 3,000 ft AGL",
            ],
            ["Temp / dew point", "08/06", "8°C / 6°C (M = minus, e.g., M02)"],
            ["Altimeter", "A2992", "29.92 in Hg"],
          ],
        ),
        p(
          "The ceiling is the height of the lowest layer reported as broken (BKN) or overcast (OVC), or the vertical visibility (VV) into an obscuration. FEW and SCT layers are not ceilings. Cloud heights in METARs and TAFs are above ground level; wind directions in METARs and TAFs are relative to true north.",
        ),
        exercise("metar-decode", "Decode live-style METARs element by element"),
        check({
          id: "vfr.weather.3.k1",
          kind: "weather",
          context: "METAR KABC 121856Z 18008KT 6SM HZ SCT012 BKN025 OVC080 24/19 A3002",
          prompt: "What is the ceiling at KABC?",
          choices: ["1,200 ft AGL", "No ceiling is reported", "8,000 ft AGL", "2,500 ft AGL"],
          answer: 3,
          explanation:
            "The lowest broken or overcast layer is BKN025, so the ceiling is 2,500 ft AGL. SCT012 is the lowest layer, but scattered clouds do not constitute a ceiling.",
          subject: "Weather Services",
          reference: "AC 00-45",
        }),
        h("TAF"),
        p(
          "A Terminal Aerodrome Forecast covers the area within 5 SM of an airport, usually for 24 or 30 hours. It uses the same codes as a METAR plus change groups: FM (from — a rapid, complete change at the given time), TEMPO (temporary fluctuations lasting less than an hour at a time and covering less than half the period), PROB30/PROB40 (probability of occurrence) and BECMG (a gradual change over the stated period). 'P6SM' means visibility greater than 6 SM.",
        ),
        exercise("taf-decode", "Decode a TAF and identify when conditions drop below VFR"),
        h("Advisories and other products"),
        table(
          ["Product", "What it warns of"],
          [
            [
              "AIRMET Sierra",
              "IFR conditions (ceilings below 1,000 ft and/or visibility below 3 SM) affecting over 50% of an area; extensive mountain obscuration",
            ],
            [
              "AIRMET Tango",
              "Moderate turbulence, sustained surface winds of 30 knots or more, low-level wind shear",
            ],
            ["AIRMET Zulu", "Moderate icing and freezing levels"],
            [
              "SIGMET",
              "Non-convective hazards to all aircraft: severe or extreme turbulence, severe icing, widespread dust or sandstorms, volcanic ash",
            ],
            [
              "Convective SIGMET",
              "Severe thunderstorms: surface winds ≥ 50 knots, hail ≥ ¾ inch, tornadoes, embedded or lines of thunderstorms, or thunderstorms with heavy precipitation over a large area",
            ],
            [
              "PIREP (UA / UUA urgent)",
              "Actual conditions reported by pilots — the only direct observation of cloud tops, icing and turbulence",
            ],
          ],
        ),
        info(
          "Graphical tools",
          "The Graphical Forecasts for Aviation (GFA) on aviationweather.gov combine METARs, TAFs, PIREPs, clouds, precipitation, icing and turbulence forecasts on an interactive map. Surface and significant-weather prognostic charts show forecast fronts, pressure systems, freezing levels and IFR/MVFR areas.",
        ),
        h("Briefings"),
        ul(
          "Standard briefing: when you have not received a previous briefing — the complete picture.",
          "Abbreviated briefing: to update a previous briefing or obtain specific items.",
          "Outlook briefing: when departure is 6 or more hours away.",
          "Sources: Flight Service (1-800-WX-BRIEF or online) and approved providers before departure; ATIS/ASOS/AWOS, FIS-B datalink, Flight Service on the radio and PIREPs in flight.",
        ),
        caution(
          "Datalink weather is not real-time",
          "NEXRAD images received in the cockpit can be several minutes old — older than the time stamp suggests. Never use them to pick a path through thunderstorm cells.",
        ),
        practice(
          "/weather",
          "Weather center",
          "Pull METARs, TAFs and advisories for your local airports and practice making go/no-go decisions.",
        ),
      ],
    },
  ],
  flashcards: [
    {
      id: "vfr.weather.fc1",
      front: "Standard sea-level temperature and pressure",
      back: "15°C (59°F) and 29.92 in Hg (1013.2 hPa).",
    },
    {
      id: "vfr.weather.fc2",
      front: "Wind around a low (N. Hemisphere)",
      back: "Counterclockwise, flowing inward at the surface.",
    },
    {
      id: "vfr.weather.fc3",
      front: "Three ingredients of a thunderstorm",
      back: "Sufficient moisture, unstable air, and a lifting action.",
    },
    {
      id: "vfr.weather.fc4",
      front: "Conditions required for structural icing",
      back: "Visible moisture and a surface temperature at or below freezing.",
    },
    {
      id: "vfr.weather.fc5",
      front: "Definition of a ceiling",
      back: "Lowest layer reported as broken or overcast, or the vertical visibility into an obscuration.",
    },
    {
      id: "vfr.weather.fc6",
      front: "AIRMET Sierra / Tango / Zulu",
      back: "Sierra: IFR and mountain obscuration. Tango: turbulence, strong surface winds, LLWS. Zulu: icing and freezing level.",
    },
  ],
  quiz: [
    q({
      id: "vfr.weather.q1",
      kind: "weather",
      context: "METAR KXYZ 201753Z 31012G22KT 10SM FEW045 SCT250 22/03 A2996 RMK AO2",
      prompt: "What are the wind conditions?",
      choices: [
        "From 310° true at 12 knots, gusts to 22",
        "From 310° magnetic at 12 knots, gusts to 22",
        "From 220° true at 31 knots",
        "From 310° true at 22 knots, gusts to 12",
      ],
      answer: 0,
      explanation:
        "31012G22KT is wind from 310° TRUE at 12 knots gusting to 22. METAR and TAF winds are true; it is ATIS and tower-reported winds that are magnetic, which makes the 'magnetic' choice tempting.",
      subject: "Weather Services",
      reference: "AC 00-45",
    }),
    q({
      id: "vfr.weather.q2",
      kind: "weather",
      context:
        "TAF KXYZ 201730Z 2018/2118 18010KT P6SM SCT040 FM202300 20015G25KT 5SM -SHRA BKN025 TEMPO 2101/2104 2SM TSRA OVC015CB",
      prompt: "What weather is expected temporarily between 0100Z and 0400Z on the 21st?",
      choices: [
        "Visibility greater than 6 SM, scattered clouds at 4,000 ft",
        "5 SM in light rain showers, ceiling 2,500 ft",
        "2 SM in thunderstorms with moderate rain, overcast cumulonimbus at 1,500 ft",
        "Gradual change to IFR conditions lasting until the end of the forecast",
      ],
      answer: 2,
      explanation:
        "The TEMPO group for 2101/2104 forecasts temporary 2 SM in thunderstorms with rain and an overcast cumulonimbus layer at 1,500 ft. The FM group describes prevailing conditions from 2300Z, and TEMPO is not a gradual (BECMG) change.",
      subject: "Weather Services",
      reference: "AC 00-45",
    }),
    q({
      id: "vfr.weather.q3",
      kind: "mc",
      prompt: "What are the characteristics of stable air?",
      choices: [
        "Good visibility and showery precipitation",
        "Cumuliform clouds and turbulence",
        "Poor visibility, steady precipitation and stratiform clouds",
        "Unlimited visibility and cumulus clouds",
      ],
      answer: 2,
      explanation:
        "Stable air resists vertical movement, so clouds spread out in layers, precipitation is steady and visibility suffers from trapped haze. Good visibility with showers and cumuliform clouds describe unstable air.",
      subject: "Weather",
      reference: "PHAK Ch. 12",
    }),
    q({
      id: "vfr.weather.q4",
      kind: "mc",
      prompt:
        "Which weather phenomenon signals the beginning of the mature stage of a thunderstorm?",
      choices: [
        "The appearance of an anvil top",
        "Precipitation beginning to fall from the cloud base",
        "Maximum growth rate of the cloud",
        "Strong updrafts throughout the cloud",
      ],
      answer: 1,
      explanation:
        "The mature stage begins when precipitation starts to fall from the cloud base, signaling downdrafts have developed. Strong updrafts throughout the cloud characterize the earlier cumulus stage.",
      subject: "Weather",
      reference: "AC 00-6B",
    }),
    q({
      id: "vfr.weather.q5",
      kind: "mc",
      prompt: "Which product warns of moderate icing and gives freezing level information?",
      choices: ["AIRMET Zulu", "AIRMET Tango", "SIGMET", "Convective SIGMET"],
      answer: 0,
      explanation:
        "AIRMET Zulu covers moderate icing and freezing levels. SEVERE icing would be a SIGMET. AIRMET Tango is for turbulence, strong surface winds and low-level wind shear.",
      subject: "Weather Services",
      reference: "AC 00-45",
    }),
    q({
      id: "vfr.weather.q6",
      kind: "mc",
      prompt: "Advection fog is most likely to form when:",
      choices: [
        "Air cools on a clear, calm night",
        "Cold air moves over warmer water",
        "Moist, stable air is forced up a slope",
        "Moist air moves over a colder surface",
      ],
      answer: 3,
      explanation:
        "Advection fog forms when warm, moist air moves (is advected) over a colder surface, typically along coasts. Clear calm nights produce radiation fog, cold air over warm water produces steam fog, and lifting up a slope produces upslope fog.",
      subject: "Weather",
      reference: "PHAK Ch. 12",
    }),
    q({
      id: "vfr.weather.q7",
      kind: "tf",
      prompt:
        "True or false: frost that is too thin to see through may be left on the wings because it does not affect lift.",
      choices: ["True", "False"],
      answer: 1,
      explanation:
        "False. Even a thin coating of frost roughens the wing surface, disrupts airflow, increases stall speed and can prevent a takeoff. All frost must be removed before flight.",
      subject: "Weather",
      reference: "PHAK Ch. 12; AC 00-6B",
    }),
    q({
      id: "vfr.weather.q8",
      kind: "mc",
      prompt: "When should a pilot request an outlook briefing?",
      choices: [
        "When departure is within 1 hour",
        "To update a previous briefing",
        "When departure is 6 or more hours away",
        "Only when IFR conditions are forecast",
      ],
      answer: 2,
      explanation:
        "An outlook briefing is for departures 6 or more hours away. Updating a previous briefing is the purpose of an abbreviated briefing.",
      subject: "Weather Services",
      reference: "PHAK Ch. 13",
    }),
  ],
  practice: [
    link("/weather", "Weather center"),
    link("/simulator?scenario=emg-weather", "Deteriorating weather scenario"),
  ],
};
