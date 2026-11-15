"""
Per-aircraft settings for fetch.py / convert.py (written after inspecting each model with
`convert.py --inspect <id>` and looking at the check renders of view.cjs).

Keys (all optional except fgdir / set / jsbsim):
  local            True = FGData aircraft read from the local FGData checkout (no download)
  fgdir, set       FlightGear aircraft folder and the -set.xml that selects the variant
  model            override of /sim/model/path
  jsbsim           folder name under flightsim/jsbsim/aircraft (flight model to align with)
  title, authors, licence, revision, page   credits (CREDITS.md and fg-models.gen.ts)
  skip / keep      regexes on object / sub-model names to drop / force-keep
  skip_box         [[min xyz], [max xyz]] boxes (FG frame, as printed by --inspect): objects fully inside are dropped
  skip_tex         regex on texture file names of objects to drop (default: panel/placard/... textures)
  allow_submodel   sub-model paths to load although their name looks like an interior one
  fetch_allow, fetch_extra   extra files for fetch.py
  props            property values that override the -set.xml (e.g. livery texture paths)
  texture_map      {texture-name regex or "@object-name regex": replacement texture} (default livery)
  wheels           {"mainLeft"|"mainRight"|"nose"|"tail": object-name regex} when auto-detection fails
  parts_by_name    {"aileron"|"elevator"|"rudder"|"flap"|"propeller"|"gear"|"static"|"skip": [regex]}
  no_propellers    jets: spinning fans / ram-air turbines stay static
  hub_re, disc_re  object names of the propeller spinner / blurred disc
  ignore_interior_effects   do not drop objects only because FG gives them an interior light-map effect
  hinge_tolerance_m, hinge_override, tex_max, glass_min_alpha, disc_alpha, double_all, scale, notes
"""

GPL2PLUS = "GPL-2.0-or-later"

AIRCRAFT = {
    "c172p": {
        "local": True, "fgdir": "c172p", "set": "c172p-set.xml", "jsbsim": "c172p",
        "title": "Cessna 172P Skyhawk (FlightGear c172p, default livery 4X-CHV)",
        "authors": "David Megginson (original), Gilberto Agostinho, Wayne Bragg, Juan Vera del Campo, onox, thevirtualfer, "
                   "Daniel Dubreuil, Jonathan Redpath, Jonathan Schellhase, Tuomas Kuosmanen, Anders Gidenstam, Waldo Kitty, "
                   "algefaen, Horacio, D-ECHO, Jarl Arntzen, Benedikt Hallinger, Sascha Reissner, Josh Davidson (the c172p team)",
        "licence": "GPL-2.0 (LICENSE file in the aircraft folder)",
        "revision": "FGData branch release/2024.1 (commit 11c6545, 2024.1.8-rc1)",
        "page": "https://gitlab.com/flightgear/fgdata/-/tree/release/2024.1/Aircraft/c172p",
        "skip": [r"hotspot", r"courtesyon"],
        "notes": ["No wheel fairings (FlightGear's default for this model)."],
    },
    "c182": {
        "fgdir": "c182s", "set": "c182s-set.xml", "jsbsim": "c182",
        "title": "Cessna 182S (FlightGear c182s)",
        "authors": "Heiko Schulz, Gilberto Agostinho, Benedikt Hallinger, onox, Wayne Bragg, Ron Jensen, Stuart Buchanan, "
                   "David Megginson, Sascha Reissner",
        "licence": "GPL-2.0 (LICENSE file in the aircraft folder)",
        "skip": [r"\.cs(\.|$)", r"control-?lock", r"ExtLight"],
        "notes": ["The spinner is static (it is not part of the propeller node; it is round, so this does not show)."],
    },
    "pa28": {
        # Chosen among FGAddon PA28, Piper-PA-28 (Cadet) and pa28-161: all three are tapered-wing PA-28-161
        # Warriors; PA28 is by far the most detailed and the most recently maintained exterior.
        "fgdir": "PA28", "set": "PA28-161-180-set.xml", "jsbsim": "pa28",
        "title": "Piper PA-28-161 Warrior II (FlightGear PA28)",
        "authors": "Bea Wolf / D-ECHO (3D model, textures), Josh Davidson (FDM, systems), Niels Krenz (FDM), Sascha Reissner (KAP140)",
        "licence": "GPL-2.0 (LICENSE file in the aircraft folder)",
        # instrument panel / cabin details that are top-level objects in PA28-161.ac
        "skip_box": [[[-1.85, -0.45, -0.55], [0.6, 0.45, 0.5]]],
        "notes": [
            "The model is a PA-28-161 Warrior (tapered 35 ft wing) while the JSBSim pa28 is a PA-28-180 Cherokee "
            "(30 ft constant-chord wing). Not rescaled (that would shrink the fuselage too).",
            "The JSBSim nose contact is 19 cm lower than the model's nose tyre when the main wheels match: the JSBSim "
            "aircraft rests about 5.6 degrees nose-up, the model is drawn level.",
        ],
    },
    "J3Cub": {
        "fgdir": "J3Cub", "set": "J3Cub-set.xml", "jsbsim": "J3Cub",
        "title": "Piper J-3 Cub (FlightGear J3Cub)",
        "authors": "David Megginson (original 3D, FDM), Jim Wilson (instruments), Don Lavelle (3D remodel), Erik Hofman (JSBSim FDM), "
                   "Anders Gidenstam (hydrodynamics), Gilberto Agostinho (livery), Wayne Bragg (3D, systems, variants)",
        "licence": "GPL (README: 'License: GPL'; the folder ships the GPL version 3 text, copying.txt)",
        "notes": [
            "No flaps (the real J-3 Cub has none).",
            "The steerable tail wheel is static (FG turns it with the rudder).",
            "Tail-dragger: in the level structural attitude the tail wheel is 1.1 m above the main-wheel contact height "
            "(as in JSBSim).",
        ],
    },
    "c310": {
        "fgdir": "c310", "set": "c310-set.xml", "jsbsim": "c310",
        "title": "Cessna 310 (FlightGear c310, model c310-dpm)",
        "authors": "not stated in the aircraft's files (the 3D model file is named c310-dpm)",
        "licence": "no licence file in the aircraft folder; distributed in FlightGear's FGAddon repository under the GNU GPL",
        "skip": [r"^PanelBack$", r"^Bulkhead$"],
        "notes": [
            "Old, very simple model (about 1,500 triangles).",
            "Model wheelbase 2.38 m vs JSBSim 2.82 m, so the nose wheel is 44 cm behind the JSBSim nose contact.",
            "propeller = engine 0 = LEFT engine, propeller_2 = engine 1 = RIGHT engine.",
            "gear_retract also holds the nose-gear doors and the boarding step (FG retracts both with the gear).",
        ],
    },
    "DHC6": {
        "fgdir": "dhc6", "set": "dhc6-set.xml", "jsbsim": "DHC6",
        "title": "de Havilland Canada DHC-6-300 Twin Otter, wheels (FlightGear dhc6)",
        "authors": "Syd Adams (initial model), Christian Thiriot (3D, textures), Bo Lan (Nasal, FDM, systems), Jonathan Schellhase "
                   "(3D, Nasal, systems, sound), Tim Dicus (engine), Simworld2020 (radios), Sascha Reissner (lights, radios)",
        "licence": "no licence file in the aircraft folder; files that state one use GPL-2.0-or-later (e.g. Config/dhc6-mice.xml, onox 2015)",
        "skip": [r"^baggage$", r"^Baggage\.door\.inn$", r"^sphere$", r"LNDlight", r"^strobe\.\d"],
        "notes": [
            "Default paint = the texture the 3D model itself uses (paint2-R.png); FG's livery default 'paint2.png' does not exist.",
            "In FG the ailerons also droop with the flaps; here the aileron nodes only carry the aileron hinge (the app may add "
            "a flap-dependent droop). flap_left/flap_right hold the flap vane and the main flap of the double-slotted flap on one hinge.",
            "propeller = engine 0 = LEFT engine, propeller_2 = RIGHT engine.",
        ],
    },
    "p51d": {
        "fgdir": "p51d", "set": "p51d-jsbsim-set.xml", "jsbsim": "p51d",
        "title": "North American P-51D-25-NA Mustang (FlightGear p51d, default livery 'Delivery Day - March 1944')",
        "authors": "Jim Wilson, Jon Berndt, Hal V. Engel, onox",
        "licence": "GPL-2.0 (COPYING file in the aircraft folder)",
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
        "notes": [
            "The blurred propeller disc's texture is outside the aircraft folder in FG; it is drawn as a plain translucent disc.",
            "The inner main-gear doors (FG moves them with a separate property) are static and shown closed.",
            "Tail-dragger with a retractable tail wheel (in gear_retract).",
        ],
    },
    "A320": {
        "fgdir": "A320-family", "set": "A320-200-CFM-set.xml", "jsbsim": "A320",
        "title": "Airbus A320-214 CFM56-5B (FlightGear A320-family, default livery Swiss HB-JLS)",
        "authors": "Josh Davidson, Jonathan Redpath, merspieler, Matthew Maring, Thorsten Herrmann, Semir Gebran (3D, textures)",
        "licence": "GPL-2.0-only (README.copyright.md: 'version 2 of the GNU General Public License')",
        "no_propellers": True,  # engine fans and the ram-air turbine stay static
        # default livery SWR (A320-200-CFM-set.xml): applied by Nasal (canvas livery) to these objects
        "fetch_extra": ["Models/Liveries/CFM/SWR.xml", "Models/Liveries/CFM/4k/SWR-fuselage.png", "Models/Liveries/CFM/2k/SWR-engine.png"],
        "texture_map": {
            "@^(AileronL|AileronR|Antenna1|Antenna2|ApuFlap|AvionicsVentDoor|Cargo1|Cargo2|Cargo3|DoorL1|DoorL4|DoorR1|DoorR4|ElevatorL|ElevatorR|EngineFairingL|EngineFairingR|FairingL1|FairingL2|FairingL3|FairingR1|FairingR2|FairingR3|FlapL1|FlapL2|FlapR1|FlapR2|Fuselage|GPUServiceDoor|Hstabs|MLGGearDoorL|MLGGearDoorR|MLGWingDoorL1|MLGWingDoorL2|MLGWingDoorR1|MLGWingDoorR2|NLGAftDoorL|NLGAftDoorR|NLGFittingPanel|NLGForewardDoorL|NLGForewardDoorR|OutflowValveDoor1|OutflowValveDoor2|RatDoorL|RatDoorR|Rudder|Sharklet|SlatL1|SlatL2|SlatR1|SlatR2|SpoilerL1|SpoilerL2|SpoilerL3|SpoilerL4|SpoilerL5|SpoilerR1|SpoilerR2|SpoilerR3|SpoilerR4|SpoilerR5|Wings|WingtipFence|AOASensorL1|AOASensorL2|AOASensorR)$": "Models/Liveries/CFM/4k/SWR-fuselage.png",
            "@^(EngineCFM56L|EngineCFM56R|ReverserLDoor1|ReverserLDoor2|ReverserLDoor3|ReverserLDoor4|ReverserRDoor1|ReverserRDoor2|ReverserRDoor3|ReverserRDoor4|PylonCFM56L|PylonCFM56R|IntakeCFM56L|IntakeCFM56R)$": "Models/Liveries/CFM/2k/SWR-engine.png",
        },
        "tex_max": 2048,
        "notes": [
            "Jet: no propeller nodes (engine fans and the ram-air turbine are static). Spoilers, slats, the trimmable "
            "stabiliser and thrust reversers are static.",
            "gear_retract also holds the gear-bay doors: hiding it with the gear up leaves the wheel-bay openings visible.",
        ],
    },
    "f16": {
        "fgdir": "f16", "set": "f16-block-52-set.xml", "jsbsim": "f16",
        "title": "General Dynamics F-16CJ Block 52 Fighting Falcon (FlightGear f16), clean (no stores)",
        "authors": "Erik Hofman (main author), Martin 'Pegasus' Schmitt, Prohm 'Rama' Snitwong, Pensacola, Nikolai V. Chr., "
                   "J Maverick 16, Richard Harrison, Josh Davidson, Martien Van Der P., Jonathan Redpath, Gary Brown, "
                   "Justin Nicholson, Enrico Castaldi, Timi, Barszczisbad, PH-JAKE, Bat Campion, LJQCN101 (authors.txt)",
        "licence": "GPL-2.0 (LICENSE file in the aircraft folder)",
        "no_propellers": True,  # the engine fan stays static
        # the F-16 has flaperons (no separate flaps): they become the aileron nodes; the leading-edge
        # flaps stay static; both all-moving tail halves form the elevator
        "parts_by_name": {
            "aileron": [r"^(Left|Right)(Upper|Lower)Flap$"],
            "elevator": [r"^(Left|Right)(Upper|Lower)HorizonTail$"],
            "static": [r"^(Left|Right)(Upper|Lower)Lef$"],
        },
        "notes": [
            "No flap nodes: the F-16 has flaperons; they are exported as aileron_left / aileron_right (the app may add the "
            "flap deflection to them). Leading-edge flaps, speed brakes and the engine fan are static.",
            "elevator = both all-moving tail halves turned about one averaged axis (the real halves have about 10 degrees of anhedral each).",
            "Fairly low-detail model (about 20,000 triangles).",
            "gear_retract also holds the gear doors: hiding it with the gear up leaves the wheel-bay openings visible.",
        ],
    },
    "t6texan2": {
        "fgdir": "Beechcraft-T6-Texan-II", "set": "t6II-set.xml", "jsbsim": "t6texan2",
        "title": "Beechcraft T-6 Texan II (FlightGear Beechcraft-T6-Texan-II, US Navy livery)",
        "authors": "Emmanuel Baranger (3D, FDM)",
        "licence": "GPL-2.0 (COPYING file in the aircraft folder)",
        # French object names: roue = wheel, pale = blade, bol = spinner, volet = flap
        "wheels": {"mainLeft": "^roueG$", "mainRight": "^roueD$", "nose": "^roueA$"},
        "hub_re": r"^bol$",
        "notes": [
            "The JSBSim t6texan2 gear geometry does not match this model: JSBSim main-gear track 4.14 m vs 2.53 m in the "
            "model, wheelbase 3.58 m vs 2.33 m (the JSBSim nose contact is 1.25 m ahead of the model's nose wheel), and the "
            "JSBSim CG is 2.03 m above the wheels, which puts it near the front cockpit of this model. Aligned on the main wheels anyway.",
            "flap_left / flap_right: the outer flap plus one half of the centre flap under the fuselage, as child nodes with their own hinges.",
            "gear_retract also holds the gear doors: hiding it with the gear up leaves the wheel-bay openings visible.",
        ],
    },
}

ORDER = ["c172p", "c182", "pa28", "J3Cub", "c310", "DHC6", "p51d", "A320", "f16", "t6texan2"]

# Extra models for the Scenario Simulator (no JSBSim flight model): origin at the centre of the bounding
# box in x/z, y = 0 at the bottom of the main tyres (gear down). Listed in public/models/fg/extra.json.
NO_FDM = "no JSBSim model: origin at the bounding-box centre (x, z), y = 0 at the main-tyre bottoms"
AIRCRAFT.update({
    "da40": {"fgdir": "DA40", "set": "da40ng-jsb-club-set.xml", "retractable": False},
    "da40_eb": {"fgdir": "Diamond-Da40", "set": "da40-set.xml", "retractable": False, "candidate": True},
    "sr22": {"fgdir": "Cirrus-SR22", "set": "sr22-set.xml", "retractable": False},
    "sr22t": {"fgdir": "SR22T", "set": "SR22T-set.xml", "retractable": False, "candidate": True},
    "pa34": {"fgdir": "SenecaII", "set": "SenecaII-set.xml"},
    "be350": {"fgdir": "Beechcraft-King-Air", "set": "kingair-set.xml"},
    "b738": {"fgdir": "737-800", "set": "738-set.xml", "budget": 10e6, "no_propellers": True},
    "be36": {"fgdir": "Mooney-M-20", "set": "m20-set.xml"},
})
EXTRA = ["da40", "sr22", "pa34", "be350", "b738", "be36"]
