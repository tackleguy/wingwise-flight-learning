export type Q = { q: string; options: string[]; answer: number; why: string };
export type Lesson = { id: string; title: string; questions: Q[] };
export type Unit = { id: string; title: string; icon: string; desc: string; lessons: Lesson[] };

export const units: Unit[] = [
  { id: "deck", title: "Flight Deck", icon: "🛩️", desc: "Learn the six-pack instruments", lessons: [
    { id: "deck-1", title: "The Six Pack", questions: [
      { q: "Which instrument shows the aircraft's pitch and bank?", options: ["Altimeter", "Attitude indicator", "Heading indicator", "VSI"], answer: 1, why: "The attitude indicator (artificial horizon) shows pitch and bank." },
      { q: "The airspeed indicator works using…", options: ["Gyroscope", "Pitot-static system", "Vacuum only", "GPS"], answer: 1, why: "It compares pitot (ram) pressure with static pressure." },
      { q: "What does the VSI show?", options: ["Rate of climb/descent", "Heading", "Altitude", "Turn rate"], answer: 0, why: "Vertical Speed Indicator = feet per minute up or down." },
      { q: "Which instrument shows rate of turn and coordination?", options: ["Turn coordinator", "Attitude indicator", "Compass", "Altimeter"], answer: 0, why: "The turn coordinator plus its ball (inclinometer)." },
    ]},
    { id: "deck-2", title: "Airspeed Arcs", questions: [
      { q: "The white arc on the airspeed indicator is the…", options: ["Normal range", "Flap operating range", "Caution range", "Never exceed"], answer: 1, why: "White arc = flap operating range." },
      { q: "The red line marks…", options: ["Vso", "Vne", "Va", "Vfe"], answer: 1, why: "Red line = Vne, never-exceed speed." },
      { q: "The yellow arc means fly there only in…", options: ["Turbulence", "Smooth air", "Night", "Landing"], answer: 1, why: "Yellow = caution range, smooth air only." },
      { q: "The bottom of the green arc is…", options: ["Vs1", "Vso", "Vy", "Vx"], answer: 0, why: "Vs1: stall speed in a specified (clean) configuration." },
    ]},
  ]},
  { id: "wx", title: "Weather", icon: "⛅", desc: "METARs, clouds and fronts", lessons: [
    { id: "wx-1", title: "Reading METARs", questions: [
      { q: "In a METAR, 'BKN030' means…", options: ["Broken clouds at 3,000 ft", "Broken clouds at 300 ft", "Visibility 3 miles", "Wind 030°"], answer: 0, why: "Cloud heights are in hundreds of feet AGL." },
      { q: "'27015G25KT' means wind from 270° at…", options: ["15 kt gusting 25", "25 kt gusting 15", "1.5 kt", "150 kt"], answer: 0, why: "Direction, speed, G = gusts, KT = knots." },
      { q: "What is a ceiling?", options: ["Lowest broken or overcast layer", "Any cloud layer", "Highest cloud", "Freezing level"], answer: 0, why: "Ceiling = lowest BKN, OVC, or vertical visibility." },
      { q: "'-RA' means…", options: ["Heavy rain", "Light rain", "No rain", "Rain ended"], answer: 1, why: "Minus = light, plus = heavy." },
    ]},
    { id: "wx-2", title: "Hazards", questions: [
      { q: "Which cloud is associated with thunderstorms?", options: ["Cirrus", "Stratus", "Cumulonimbus", "Altostratus"], answer: 2, why: "Cumulonimbus clouds produce thunderstorms." },
      { q: "Fog is most likely when temperature and dew point are…", options: ["Far apart", "Close together", "Both below zero", "Rising"], answer: 1, why: "A small spread means air near saturation." },
      { q: "Wind shear is most dangerous during…", options: ["Cruise", "Takeoff and landing", "Taxi", "Preflight"], answer: 1, why: "Low, slow flight leaves little margin to recover." },
      { q: "Structural icing needs visible moisture and…", options: ["Temps at/below freezing", "High winds", "Clear skies", "Night"], answer: 0, why: "Visible moisture + freezing temps = ice." },
    ]},
  ]},
  { id: "aero", title: "Aerodynamics", icon: "🌬️", desc: "Four forces and stalls", lessons: [
    { id: "aero-1", title: "Four Forces", questions: [
      { q: "The four forces are lift, weight, thrust and…", options: ["Torque", "Drag", "Gravity", "Inertia"], answer: 1, why: "Lift opposes weight; thrust opposes drag." },
      { q: "A stall happens when you exceed the critical…", options: ["Airspeed", "Angle of attack", "Altitude", "Bank"], answer: 1, why: "Stalls can occur at any airspeed or attitude." },
      { q: "In straight-and-level unaccelerated flight, lift equals…", options: ["Thrust", "Drag", "Weight", "Zero"], answer: 2, why: "All forces balance in steady flight." },
      { q: "Increasing bank angle in a level turn makes stall speed…", options: ["Decrease", "Increase", "Stay the same", "Zero"], answer: 1, why: "Load factor rises, so stall speed rises." },
    ]},
  ]},
  { id: "regs", title: "Regulations", icon: "📜", desc: "Rules every student needs", lessons: [
    { id: "regs-1", title: "Student Rules", questions: [
      { q: "Basic VFR in Class E below 10,000 ft requires visibility of…", options: ["1 SM", "3 SM", "5 SM", "10 SM"], answer: 1, why: "3 SM; 500 below, 1,000 above, 2,000 horizontal." },
      { q: "Can a student pilot carry passengers?", options: ["Yes", "No", "Only family", "Only at night"], answer: 1, why: "Students may not carry passengers (14 CFR 61.89)." },
      { q: "Required documents: ARROW stands for Airworthiness, Registration, Radio, Operating limits and…", options: ["Weather", "Weight & balance", "Wings", "Waiver"], answer: 1, why: "W = Weight and balance data." },
      { q: "Alcohol: no flying within how many hours of drinking?", options: ["4", "8", "12", "24"], answer: 1, why: "Bottle to throttle: 8 hours, and under 0.04 BAC." },
    ]},
  ]},
  { id: "nav", title: "Navigation", icon: "🧭", desc: "Charts, airspace and radio", lessons: [
    { id: "nav-1", title: "Airspace & Charts", questions: [
      { q: "Solid magenta circles on a sectional mark…", options: ["Class B", "Class C", "Class D", "Class E surface"], answer: 1, why: "Class C is solid magenta; Class B is solid blue." },
      { q: "Dashed blue lines show…", options: ["Class D", "Class B", "MOA", "Class G"], answer: 0, why: "Class D is outlined by dashed blue." },
      { q: "What is the VFR squawk code?", options: ["7700", "7500", "1200", "7600"], answer: 2, why: "1200 = VFR. 7700 emergency, 7600 lost comms." },
      { q: "On a true course of 090° with 10°E variation, magnetic course is…", options: ["080°", "100°", "090°", "270°"], answer: 0, why: "East is least: subtract easterly variation." },
    ]},
  ]},
];
export const allLessons = units.flatMap((u) => u.lessons);
