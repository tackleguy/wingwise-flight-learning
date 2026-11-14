import type { Module } from "../types";
import { caution, check, diagram, h, info, link, p, practice, q, table, tip, ul, warning } from "../builders";

export const systems: Module = {
  id: "systems",
  number: 2,
  title: "Aircraft Systems",
  summary:
    "Engine, ignition, fuel, induction, propeller and electrical systems, plus the pitot-static and gyroscopic flight instruments and how each fails.",
  lessons: [
    {
      id: "vfr.systems.1",
      title: "Engine, Ignition and Fuel",
      minutes: 10,
      objectives: [
        "Describe the four-stroke cycle and the dual magneto ignition system",
        "Explain mixture control and the effects of a mixture that is too rich or too lean",
        "Recognize detonation and preignition and identify approved fuel grades",
      ],
      blocks: [
        h("The reciprocating engine"),
        p(
          "Most training airplanes use a horizontally opposed, air-cooled, four-stroke piston engine. Each cylinder repeats the same cycle: intake (the piston moves down and draws in the fuel-air mixture), compression (the piston moves up and squeezes it), power (the spark plugs fire and the burning mixture drives the piston down) and exhaust (the piston moves up and pushes the burned gases out). Two full crankshaft revolutions complete one cycle.",
        ),
        h("Magneto ignition"),
        p(
          "The spark plugs are fired by two magnetos — small engine-driven generators that produce high voltage on their own. Because they are self-contained, the engine keeps running even if the airplane's battery and alternator fail completely. Each cylinder has two spark plugs, one fed by each magneto. Dual ignition adds redundancy and also burns the mixture more completely and evenly, which improves power.",
        ),
        p(
          "During the run-up you check each magneto individually. A small RPM drop on each is normal; the POH lists the maximum drop and the maximum difference between magnetos. A completely smooth run with no RPM drop at all on one magneto can indicate a broken ground (P-lead) wire — meaning that magneto is 'hot' and the propeller could fire if moved by hand even with the ignition switch OFF.",
        ),
        warning(
          "Treat every propeller as live",
          "A broken P-lead can leave a magneto armed with the key out. Never stand in the arc of a propeller or move it by hand unless the airplane has been secured by a qualified person.",
        ),
        h("Fuel and mixture"),
        p(
          "Gasoline engines need roughly 15 parts air to 1 part fuel by weight to burn efficiently. As you climb, air density decreases but the carburetor keeps delivering the same amount of fuel, so the mixture becomes richer. The mixture control lets you lean (reduce fuel flow) to restore the correct ratio. Follow the POH leaning procedure — many trainers are leaned for best power above about 3,000 feet density altitude or whenever cruising below 75% power.",
        ),
        table(
          ["Mixture condition", "Typical symptoms"],
          [
            ["Too rich", "Rough running, power loss, spark plug fouling, high fuel burn, lower cylinder temps"],
            ["Too lean", "Rough running, high cylinder/oil temps, possible detonation, engine may quit"],
            ["Correctly leaned", "Smooth operation, best power or best economy as selected"],
          ],
        ),
        h("Detonation and preignition"),
        ul(
          "Detonation: the fuel-air charge explodes instantaneously instead of burning smoothly. Causes include using a lower fuel grade than specified, an excessively lean mixture, high manifold pressure at low RPM, and overheating. Correct it by enriching the mixture, reducing power, lowering the nose to increase cooling airflow, and opening cowl flaps if installed.",
          "Preignition: the mixture ignites before the spark plug fires, typically from a hot spot such as a carbon deposit. It causes roughness, power loss and high temperatures and can damage the engine.",
        ),
        table(
          ["Fuel", "Color", "Notes"],
          [
            ["Avgas 100LL", "Blue", "Most common piston aviation fuel"],
            ["Avgas 100", "Green", "Higher lead content; rarely seen"],
            ["Jet A", "Clear to straw", "Turbine fuel — never put in a piston engine"],
          ],
        ),
        tip(
          "If the proper grade is not available",
          "The PHAK guidance: if the correct grade is not available, use only the next higher grade as a temporary substitute. Never use a lower grade — it can cause detonation and engine damage.",
        ),
        check({
          id: "vfr.systems.1.k1",
          kind: "mc",
          prompt: "Detonation is most likely to occur when:",
          choices: [
            "The mixture is set excessively rich",
            "A lower than specified grade of fuel is used",
            "The engine is operated at low power settings in cool air",
            "Carburetor heat is applied",
          ],
          answer: 1,
          explanation:
            "Lower-octane fuel cannot resist the compression and heat in the cylinder and detonates. A rich mixture actually helps cool the cylinders and suppresses detonation, so it is the opposite of the cause.",
          subject: "Aircraft Systems",
          reference: "PHAK Ch. 7",
        }),
        info(
          "Oil does more than lubricate",
          "Engine oil lubricates, cools the internal parts, seals between the piston rings and cylinder walls, cleans away contaminants and helps prevent corrosion. Low oil quantity is a common cause of high oil temperature.",
        ),
      ],
    },
    {
      id: "vfr.systems.2",
      title: "Induction, Propeller and Electrical Systems",
      minutes: 9,
      objectives: [
        "Recognize carburetor icing and use carburetor heat correctly",
        "Explain how a constant-speed propeller is controlled",
        "Interpret an ammeter and respond to an alternator failure",
      ],
      blocks: [
        h("Carburetor icing"),
        p(
          "A float-type carburetor draws air through a narrow venturi. The pressure drop in the venturi and the evaporation of fuel can cool the air by as much as 60°F, so ice can form even on a warm day. The PHAK notes that carburetor icing is most likely between about 20°F and 70°F with visible moisture or high humidity, and it is especially common at reduced power, such as during descents.",
        ),
        p(
          "With a fixed-pitch propeller, the first sign is a gradual loss of RPM, followed by engine roughness. When you apply carburetor heat, RPM first drops a bit further — the heated air is less dense and any melting ice passes through the engine — then gradually rises as the ice clears. With a constant-speed propeller, carburetor ice shows as a drop in manifold pressure instead, because the governor holds RPM constant.",
        ),
        caution(
          "Carb heat costs power",
          "Heated air is less dense, so full carb heat reduces available power and enriches the mixture. Use it as the POH directs (often before reducing power for descent or landing) and turn it off for a go-around unless icing is present.",
        ),
        p(
          "Fuel-injected engines inject fuel directly into the intake ports and have no venturi, so they are far less susceptible to induction icing. They do have an alternate air source that opens if the air filter is blocked, for example by impact ice.",
        ),
        h("Fixed-pitch and constant-speed propellers"),
        p(
          "A fixed-pitch propeller has one blade angle, so the throttle controls RPM directly and the tachometer is the power indicator. A constant-speed propeller lets the pilot select an RPM with the propeller control; a governor changes blade pitch to hold that RPM. The throttle then controls manifold pressure, shown on the manifold pressure gauge. To avoid high internal cylinder pressures, the common technique is: when increasing power, increase RPM first, then manifold pressure; when decreasing power, reduce manifold pressure first, then RPM. Always use the POH power settings.",
        ),
        check({
          id: "vfr.systems.2.k1",
          kind: "scenario",
          context:
            "Cruising on a humid 55°F day with a fixed-pitch propeller, you notice the RPM has slowly decreased by 150 RPM. You apply full carburetor heat.",
          prompt: "What will most likely happen next if carburetor ice was present?",
          choices: [
            "RPM rises immediately and stays high",
            "RPM drops further, then gradually increases as the ice melts",
            "RPM stays exactly the same",
            "Manifold pressure increases while RPM stays constant",
          ],
          answer: 1,
          explanation:
            "Heated air is less dense and melted ice passes through the engine, so RPM initially dips, then recovers as the ice clears. An immediate rise is not expected, and manifold pressure behavior applies to a constant-speed propeller, not a fixed-pitch one.",
          subject: "Aircraft Systems",
          reference: "PHAK Ch. 7",
        }),
        h("Electrical system"),
        p(
          "Light airplanes typically use a 14- or 28-volt direct-current system. An engine-driven alternator supplies power and charges the battery; the battery starts the engine and provides backup. The master switch connects the battery and alternator to the electrical bus. Circuit breakers or fuses protect each circuit. Radios, lights, flaps (in many trainers), the turn coordinator and the fuel gauges commonly depend on electrical power — the engine's ignition does not.",
        ),
        table(
          ["Ammeter shows", "Meaning", "Action"],
          [
            ["Small positive (charge)", "Alternator charging battery normally (e.g., after start)", "Normal"],
            ["Zero/centered in cruise", "Alternator carrying the load, battery fully charged", "Normal"],
            ["Sustained negative (discharge)", "Alternator not keeping up or failed; battery supplying load", "Follow POH checklist, shed load, land as soon as practical"],
            ["Sustained high charge", "Possible voltage regulator fault / overcharging", "Follow POH checklist"],
          ],
        ),
        tip(
          "Shed load early",
          "After an alternator failure, the battery may last only a short time. Turn off nonessential equipment immediately, keep one radio for communication, and plan to land before you lose the radios — or the electric flaps.",
        ),
        practice(
          "/simulator?scenario=emg-electrical",
          "Alternator failure",
          "Practice recognizing a discharging ammeter and running the electrical failure checklist.",
        ),
      ],
    },
    {
      id: "vfr.systems.3",
      title: "Flight Instruments",
      minutes: 12,
      objectives: [
        "Explain how the pitot-static instruments work and how blockages affect them",
        "Describe the gyroscopic instruments and their power sources",
        "Interpret airspeed indicator markings and magnetic compass errors",
      ],
      blocks: [
        p(
          "The traditional instrument panel groups six flight instruments: airspeed indicator, attitude indicator and altimeter on the top row; turn coordinator, heading indicator and vertical speed indicator on the bottom row. Three of them use air pressure (the pitot-static group) and three use gyroscopes.",
        ),
        diagram(
          "six-pack",
          "Top: airspeed, attitude, altimeter. Bottom: turn coordinator, heading indicator, vertical speed indicator.",
        ),
        h("Pitot-static system"),
        p(
          "The pitot tube faces the oncoming air and senses ram (impact) pressure. Static ports on the side of the fuselage sense still, ambient pressure. The airspeed indicator compares the two; the altimeter and vertical speed indicator use static pressure only.",
        ),
        diagram(
          "pitot-static",
          "Pitot pressure feeds only the airspeed indicator. Static pressure feeds the airspeed indicator, altimeter and vertical speed indicator.",
        ),
        table(
          ["Failure", "Airspeed", "Altimeter", "VSI"],
          [
            ["Pitot ram inlet and drain hole blocked", "Acts like an altimeter: increases in a climb, decreases in a descent", "Normal", "Normal"],
            ["Pitot ram inlet blocked, drain open", "Drops toward zero", "Normal", "Normal"],
            ["Static port blocked", "Reads low in a climb, high in a descent", "Frozen at the altitude where blockage occurred", "Shows zero"],
            ["Using alternate static (cabin air)", "Reads slightly high", "Reads slightly high", "Momentary climb indication"],
          ],
        ),
        table(
          ["Marking", "Meaning"],
          [
            ["White arc", "Flap operating range: bottom is VS0 (stall, landing configuration), top is VFE (max flap extended speed)"],
            ["Green arc", "Normal operating range: bottom is VS1 (stall, specified configuration), top is VNO (max structural cruising speed)"],
            ["Yellow arc", "Caution range from VNO to VNE — smooth air only"],
            ["Red line", "VNE, never-exceed speed"],
            ["Not marked: VA", "Design maneuvering speed is in the POH and on a placard, not on the indicator; it decreases as weight decreases"],
          ],
        ),
        h("The altimeter"),
        p(
          "The altimeter is an aneroid barometer calibrated to show altitude. You set the local altimeter setting in the Kollsman window. Each inch of mercury equals about 1,000 feet. If you fly from high pressure to low pressure (or warm to cold air) without resetting, the altimeter reads higher than your true altitude — 'high to low, look out below'.",
        ),
        ul(
          "Indicated altitude: what the altimeter shows with the current setting.",
          "Pressure altitude: indicated altitude with 29.92 in Hg set; used for performance and flight levels.",
          "Density altitude: pressure altitude corrected for nonstandard temperature; drives aircraft performance.",
          "True altitude: height above mean sea level (MSL).",
          "Absolute altitude: height above the terrain (AGL).",
        ),
        h("Gyroscopic instruments"),
        p(
          "Gyroscopes have two properties: rigidity in space (a spinning gyro resists changes to its orientation) and precession (a force applied to a spinning gyro reacts 90° later in the direction of rotation). The attitude indicator and heading indicator use rigidity in space; the turn coordinator uses precession. In most trainers the attitude and heading indicators are vacuum-driven and the turn coordinator is electric, so a single failure does not take out all three. The heading indicator drifts because of precession and friction, so align it with the magnetic compass periodically — commonly every 15 minutes, in straight-and-level, unaccelerated flight.",
        ),
        ul(
          "Magnetic compass — variation: the angle between true north and magnetic north; shown by isogonic lines on charts.",
          "Deviation: error caused by magnetic fields inside the airplane; shown on the compass correction card.",
          "Acceleration error (Northern Hemisphere, east or west headings): ANDS — Accelerate North, Decelerate South.",
          "Turning error (Northern Hemisphere): UNOS — Undershoot North, Overshoot South when rolling out by the compass.",
        ),
        check({
          id: "vfr.systems.3.k1",
          kind: "mc",
          prompt: "If the static port becomes blocked during a climb, the altimeter will:",
          choices: [
            "Continue to show an accurate climb",
            "Freeze at the altitude where the blockage occurred",
            "Read zero",
            "Read higher than actual altitude as you climb",
          ],
          answer: 1,
          explanation:
            "The altimeter has only static pressure as its input. Once that pressure is trapped, it can no longer change, so the altimeter freezes. The VSI goes to zero, and the airspeed indicator becomes inaccurate (reading low in a climb).",
          subject: "Flight Instruments",
          reference: "PHAK Ch. 8",
        }),
        check({
          id: "vfr.systems.3.k2",
          kind: "mc",
          prompt: "Which instrument relies on the gyroscopic property of precession?",
          choices: ["Attitude indicator", "Heading indicator", "Turn coordinator", "Magnetic compass"],
          answer: 2,
          explanation:
            "The turn coordinator senses rate of roll and yaw through precession. The attitude and heading indicators depend on rigidity in space, and the magnetic compass is not gyroscopic at all.",
          subject: "Flight Instruments",
          reference: "PHAK Ch. 8",
        }),
        practice(
          "/simulator?scenario=emg-vacuum",
          "Vacuum failure",
          "Experience a failing attitude indicator and learn to cross-check with the turn coordinator and pitot-static instruments.",
        ),
      ],
    },
  ],
  flashcards: [
    {
      id: "vfr.systems.fc1",
      front: "Why do magnetos keep the engine running after an electrical failure?",
      back: "They are self-contained, engine-driven generators that produce their own high voltage for the spark plugs.",
    },
    {
      id: "vfr.systems.fc2",
      front: "First indication of carburetor ice (fixed-pitch prop)",
      back: "Loss of RPM, possibly followed by engine roughness.",
    },
    {
      id: "vfr.systems.fc3",
      front: "Instruments connected to the static system",
      back: "Altimeter, vertical speed indicator and airspeed indicator.",
    },
    {
      id: "vfr.systems.fc4",
      front: "Top of the green arc",
      back: "VNO — maximum structural cruising speed. Above it (yellow arc) operate only in smooth air.",
    },
    { id: "vfr.systems.fc5", front: "ANDS", back: "Compass acceleration error: Accelerate North, Decelerate South (Northern Hemisphere, E/W headings)." },
    { id: "vfr.systems.fc6", front: "100LL avgas color", back: "Blue." },
  ],
  quiz: [
    q({
      id: "vfr.systems.q1",
      kind: "mc",
      prompt: "One purpose of the dual ignition system on an aircraft engine is to provide for:",
      choices: [
        "Improved engine performance",
        "Uniform heat distribution",
        "Balanced cylinder head pressure",
        "Faster engine starts",
      ],
      answer: 0,
      explanation:
        "Two plugs per cylinder burn the mixture more completely, improving performance, and add redundancy. Dual ignition does not exist to balance heat or pressure, and starts depend on the impulse coupling and starter, not on having two magnetos.",
      subject: "Aircraft Systems",
      reference: "PHAK Ch. 7",
    }),
    q({
      id: "vfr.systems.q2",
      kind: "mc",
      prompt: "If the grade of fuel specified for an engine is not available, which is acceptable as a temporary substitute?",
      choices: [
        "The next lower grade",
        "Automotive gasoline of the same octane",
        "The next higher grade",
        "Jet A mixed 50/50 with avgas",
      ],
      answer: 2,
      explanation:
        "Only the next higher grade is acceptable as a temporary substitute. A lower grade can cause detonation. Automotive fuel is legal only with an STC, and Jet A must never be used in a spark-ignition piston engine.",
      subject: "Aircraft Systems",
      reference: "PHAK Ch. 7",
    }),
    q({
      id: "vfr.systems.q3",
      kind: "scenario",
      context:
        "During a climb, the airspeed indicator begins increasing steadily while the altimeter also increases. The VSI shows a climb. You are flying through visible moisture near freezing.",
      prompt: "What is the most likely cause?",
      choices: [
        "The static port is blocked",
        "The pitot ram inlet and drain hole are both blocked",
        "The alternate static source is open",
        "The vacuum pump has failed",
      ],
      answer: 1,
      explanation:
        "With the pitot inlet and drain both blocked, trapped pitot pressure stays fixed while static pressure falls in the climb, so the airspeed indicator rises like an altimeter. A blocked static port would freeze the altimeter and zero the VSI, which is not happening here.",
      subject: "Flight Instruments",
      reference: "PHAK Ch. 8",
    }),
    q({
      id: "vfr.systems.q4",
      kind: "mc",
      prompt: "What does the lower limit of the white arc on the airspeed indicator represent?",
      choices: [
        "VS1, stall speed in a specified configuration",
        "VFE, maximum flap extended speed",
        "VS0, stall speed or minimum steady flight speed in the landing configuration",
        "VY, best rate of climb",
      ],
      answer: 2,
      explanation:
        "The white arc runs from VS0 (landing configuration stall) to VFE. VS1 is the bottom of the green arc, and VFE is the top of the white arc.",
      subject: "Flight Instruments",
      reference: "PHAK Ch. 8",
    }),
    q({
      id: "vfr.systems.q5",
      kind: "tf",
      prompt:
        "True or false: when flying from an area of high pressure into an area of lower pressure without resetting the altimeter, the airplane will be lower than the altimeter indicates.",
      choices: ["True", "False"],
      answer: 0,
      explanation:
        "True — 'high to low, look out below.' The altimeter, still set to the higher setting, overreads, so true altitude is lower than indicated. This is a terrain-clearance hazard.",
      subject: "Flight Instruments",
      reference: "PHAK Ch. 8",
    }),
    q({
      id: "vfr.systems.q6",
      kind: "mc",
      prompt: "In the Northern Hemisphere, if an airplane on an easterly heading accelerates, the magnetic compass will initially indicate:",
      choices: ["A turn toward the south", "A turn toward the north", "No change", "A turn toward the west"],
      answer: 1,
      explanation:
        "ANDS: Accelerate North, Decelerate South. Acceleration on an east or west heading causes an apparent turn toward north. Deceleration would show a turn toward south.",
      subject: "Flight Instruments",
      reference: "PHAK Ch. 8",
    }),
    q({
      id: "vfr.systems.q7",
      kind: "mc",
      prompt: "A sustained discharge indication on the ammeter in cruise most likely means:",
      choices: [
        "The battery is overcharging",
        "The magnetos have failed",
        "The alternator is not supplying enough current and the battery is carrying the load",
        "The vacuum pump has failed",
      ],
      answer: 2,
      explanation:
        "A discharge means current is flowing out of the battery because the alternator is failed or not keeping up. The magnetos are independent of the electrical system, and the vacuum system is shown on a separate suction gauge.",
      subject: "Aircraft Systems",
      reference: "PHAK Ch. 7",
    }),
  ],
  practice: [
    link("/aircraft", "Explore aircraft systems"),
    link("/avionics", "Avionics lab"),
    link("/simulator?scenario=emg-electrical", "Electrical failure"),
    link("/simulator?scenario=emg-vacuum", "Vacuum failure"),
  ],
};
