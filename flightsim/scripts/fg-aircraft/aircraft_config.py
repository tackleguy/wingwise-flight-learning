"""Per-aircraft settings for fetch.py / convert.py (filled in after inspecting each model)."""

AIRCRAFT = {
    "c172p": {
        "local": True, "fgdir": "c172p", "set": "c172p-set.xml", "jsbsim": "c172p",
        "skip": [r"hotspot", r"courtesyon"],
    },
    "c182": {
        "fgdir": "c182s", "set": "c182s-set.xml", "jsbsim": "c182",
        "skip": [r"\.cs(\.|$)", r"control-?lock", r"ExtLight"],
    },
    "pa28": {
        "fgdir": "PA28", "set": "PA28-161-180-set.xml", "jsbsim": "pa28",
        # instrument panel / cabin details that are top-level objects in PA28-161.ac
        "skip_box": [[[-1.85, -0.45, -0.55], [0.6, 0.45, 0.5]]],
    },
    "pa28_cadet": {"fgdir": "Piper-PA-28", "set": "pa28-set.xml", "jsbsim": "pa28", "candidate": True,
                   "wheels": {"mainLeft": "^roueG$", "mainRight": "^roueD$", "nose": "^roueA$"}},
    "pa28_161": {"fgdir": "pa28-161", "set": "pa28-161-set.xml", "jsbsim": "pa28", "candidate": True},
    "J3Cub": {"fgdir": "J3Cub", "set": "J3Cub-set.xml", "jsbsim": "J3Cub"},
    "c310": {
        "fgdir": "c310", "set": "c310-set.xml", "jsbsim": "c310",
        "skip": [r"^PanelBack$", r"^Bulkhead$"],
    },
    "DHC6": {
        "fgdir": "dhc6", "set": "dhc6-set.xml", "jsbsim": "DHC6",
        "skip": [r"^baggage$", r"^Baggage\.door\.inn$", r"^sphere$", r"LNDlight", r"^strobe\.\d"],
    },
    "p51d": {
        "fgdir": "p51d", "set": "p51d-jsbsim-set.xml", "jsbsim": "p51d",
        # the canopy is the Cockpit/enclosure.xml sub-model
        "fetch_allow": [r"Cockpit/enclosure\.xml"], "allow_submodel": [r"enclosure\.xml"],
        # default livery "DD" (Models/Liveries/DD.xml); the 1k copies are enough for 1024 px output
        "fetch_extra": ["Models/Liveries/DD.xml", "Models/Liveries/1k/DDfuselage.png", "Models/Liveries/1k/DDwing1.png",
                        "Models/Liveries/1k/DDwing2.png", "Models/Liveries/DDspinner.png", "Models/Liveries/DDspinner2.png",
                        "Models/Liveries/DDenclosure.png"],
        "props": {
            "sim/model/livery/texture-fuselage": "Liveries/1k/DDfuselage.png",
            "sim/model/livery/texture-wing1": "Liveries/1k/DDwing1.png",
            "sim/model/livery/texture-wing2": "Liveries/1k/DDwing2.png",
            "sim/model/livery/texture-spinner": "Liveries/DDspinner.png",
            "sim/model/livery/texture-spinner2": "Liveries/DDspinner2.png",
            "sim/model/livery/texture-enclosure": "../Liveries/DDenclosure.png",
        },
        # the exterior fuselage carries an interior light-map effect too, so do not skip by effect
        "ignore_interior_effects": True,
        "skip": [r"fugelageInside", r"amorGlass", r"canopyreleaseCable", r"^spinner2$"],
        "wheels": {"mainLeft": "^mainWheelLeft$", "mainRight": "^mainWheelRight$", "tail": "^tailWheel$"},
    },
    "A320": {
        "fgdir": "A320-family", "set": "A320-200-CFM-set.xml", "jsbsim": "A320",
        "no_propellers": True,  # engine fans and the ram-air turbine stay static
    },
    "f16": {"fgdir": "f16", "set": "f16-block-52-set.xml", "jsbsim": "f16"},
    "t6texan2": {
        "fgdir": "Beechcraft-T6-Texan-II", "set": "t6II-set.xml", "jsbsim": "t6texan2",
        # French object names: roue = wheel, pale = blade, bol = spinner, volet = flap
        "wheels": {"mainLeft": "^roueG$", "mainRight": "^roueD$", "nose": "^roueA$"},
        "hub_re": r"^bol$",
        # the centre flap under the fuselage ("volet") hinges 0.2 m from the outer flap hinge lines (they meet at the
        # wing roots); it is moved with the outer flap of each side
        "hinge_tolerance_m": {"flap_left": 0.3, "flap_right": 0.3},
    },
}
ORDER = ["c172p", "c182", "pa28", "J3Cub", "c310", "DHC6", "p51d", "A320", "f16", "t6texan2"]
