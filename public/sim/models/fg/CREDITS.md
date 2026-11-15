# FlightGear aircraft models — credits and licences

The `.glb` files in this folder are conversions of aircraft 3D models from the FlightGear flight
simulator project (https://www.flightgear.org). They are **not** original SkyReady work: each model
keeps the licence stated in its own aircraft files (GNU GPL, see below). Each was
**converted to glTF (textures resized, exterior only) by the SkyReady project** with
`scripts/fg-aircraft/convert.py` (cockpit, instruments, pilots, effects and lights removed;
default livery only; model moved so that its centre of gravity and wheels match the JSBSim
flight model used by SkyReady). The GPL requires that the source of these files stays available:
the original FlightGear files can be downloaded from the pages below, and the converter is in this
repository.

## c172p.glb — Cessna 172P Skyhawk (FlightGear c172p, default livery 4X-CHV)

- Authors: David Megginson (original), Gilberto Agostinho, Wayne Bragg, Juan Vera del Campo, onox, thevirtualfer, Daniel Dubreuil, Jonathan Redpath, Jonathan Schellhase, Tuomas Kuosmanen, Anders Gidenstam, Waldo Kitty, algefaen, Horacio, D-ECHO, Jarl Arntzen, Benedikt Hallinger, Sascha Reissner, Josh Davidson (the c172p team)
- Licence: GPL-2.0 (LICENSE file in the aircraft folder)
- Source: https://gitlab.com/flightgear/fgdata/-/tree/release/2024.1/Aircraft/c172p
- Version: FGData branch release/2024.1 (commit 11c6545, 2024.1.8-rc1)
- Converted to glTF (textures resized, exterior only) by the SkyReady project.

## c182.glb — Cessna 182S (FlightGear c182s)

- Authors: Heiko Schulz, Gilberto Agostinho, Benedikt Hallinger, onox, Wayne Bragg, Ron Jensen, Stuart Buchanan, David Megginson, Sascha Reissner
- Licence: GPL-2.0 (LICENSE file in the aircraft folder)
- Source: https://sourceforge.net/p/flightgear/fgaddon/HEAD/tree/trunk/Aircraft/c182s/
- Version: r21799 (folder last changed in r15312)
- Converted to glTF (textures resized, exterior only) by the SkyReady project.

## pa28.glb — Piper PA-28-161 Warrior II (FlightGear PA28)

- Authors: Bea Wolf / D-ECHO (3D model, textures), Josh Davidson (FDM, systems), Niels Krenz (FDM), Sascha Reissner (KAP140)
- Licence: GPL-2.0 (LICENSE file in the aircraft folder)
- Source: https://sourceforge.net/p/flightgear/fgaddon/HEAD/tree/trunk/Aircraft/PA28/
- Version: r21799 (folder last changed in r18092)
- Converted to glTF (textures resized, exterior only) by the SkyReady project.

## J3Cub.glb — Piper J-3 Cub (FlightGear J3Cub)

- Authors: David Megginson (original 3D, FDM), Jim Wilson (instruments), Don Lavelle (3D remodel), Erik Hofman (JSBSim FDM), Anders Gidenstam (hydrodynamics), Gilberto Agostinho (livery), Wayne Bragg (3D, systems, variants)
- Licence: GPL (README: 'License: GPL'; the folder ships the GPL version 3 text, copying.txt)
- Source: https://sourceforge.net/p/flightgear/fgaddon/HEAD/tree/trunk/Aircraft/J3Cub/
- Version: r21799 (folder last changed in r20587)
- Converted to glTF (textures resized, exterior only) by the SkyReady project.

## c310.glb — Cessna 310 (FlightGear c310, model c310-dpm)

- Authors: not stated in the aircraft's files (the 3D model file is named c310-dpm)
- Licence: no licence file in the aircraft folder; distributed in FlightGear's FGAddon repository under the GNU GPL
- Source: https://sourceforge.net/p/flightgear/fgaddon/HEAD/tree/trunk/Aircraft/c310/
- Version: r21799 (folder last changed in r2171)
- Converted to glTF (textures resized, exterior only) by the SkyReady project.

## DHC6.glb — de Havilland Canada DHC-6-300 Twin Otter, wheels (FlightGear dhc6)

- Authors: Syd Adams (initial model), Christian Thiriot (3D, textures), Bo Lan (Nasal, FDM, systems), Jonathan Schellhase (3D, Nasal, systems, sound), Tim Dicus (engine), Simworld2020 (radios), Sascha Reissner (lights, radios)
- Licence: no licence file in the aircraft folder; files that state one use GPL-2.0-or-later (e.g. Config/dhc6-mice.xml, onox 2015)
- Source: https://sourceforge.net/p/flightgear/fgaddon/HEAD/tree/trunk/Aircraft/dhc6/
- Version: r21799 (folder last changed in r18298)
- Converted to glTF (textures resized, exterior only) by the SkyReady project.

## p51d.glb — North American P-51D-25-NA Mustang (FlightGear p51d, default livery 'Delivery Day - March 1944')

- Authors: Jim Wilson, Jon Berndt, Hal V. Engel, onox
- Licence: GPL-2.0 (COPYING file in the aircraft folder)
- Source: https://sourceforge.net/p/flightgear/fgaddon/HEAD/tree/trunk/Aircraft/p51d/
- Version: r21799 (folder last changed in r15368)
- Converted to glTF (textures resized, exterior only) by the SkyReady project.

## A320.glb — Airbus A320-214 CFM56-5B (FlightGear A320-family, default livery Swiss HB-JLS)

- Authors: Josh Davidson, Jonathan Redpath, merspieler, Matthew Maring, Thorsten Herrmann, Semir Gebran (3D, textures)
- Licence: GPL-2.0-only (README.copyright.md: 'version 2 of the GNU General Public License')
- Source: https://sourceforge.net/p/flightgear/fgaddon/HEAD/tree/trunk/Aircraft/A320-family/
- Version: r21799 (folder last changed in r20377)
- Converted to glTF (textures resized, exterior only) by the SkyReady project.

## f16.glb — General Dynamics F-16CJ Block 52 Fighting Falcon (FlightGear f16), clean (no stores)

- Authors: Erik Hofman (main author), Martin 'Pegasus' Schmitt, Prohm 'Rama' Snitwong, Pensacola, Nikolai V. Chr., J Maverick 16, Richard Harrison, Josh Davidson, Martien Van Der P., Jonathan Redpath, Gary Brown, Justin Nicholson, Enrico Castaldi, Timi, Barszczisbad, PH-JAKE, Bat Campion, LJQCN101 (authors.txt)
- Licence: GPL-2.0 (LICENSE file in the aircraft folder)
- Source: https://sourceforge.net/p/flightgear/fgaddon/HEAD/tree/trunk/Aircraft/f16/
- Version: r21799 (folder last changed in r8379)
- Converted to glTF (textures resized, exterior only) by the SkyReady project.

## t6texan2.glb — Beechcraft T-6 Texan II (FlightGear Beechcraft-T6-Texan-II, US Navy livery)

- Authors: Emmanuel Baranger (3D, FDM)
- Licence: GPL-2.0 (COPYING file in the aircraft folder)
- Source: https://sourceforge.net/p/flightgear/fgaddon/HEAD/tree/trunk/Aircraft/Beechcraft-T6-Texan-II/
- Version: r21799 (folder last changed in r18616)
- Converted to glTF (textures resized, exterior only) by the SkyReady project.

# Extra models (no JSBSim flight model; Scenario Simulator)

## da40.glb — Diamond DA40 NG (FlightGear DA40, default livery OE-DWS)

- Authors: Bea Wolf (3D, textures, FDM, systems), Sascha Reissner, Joshua Davidson, Emmanuel Baranger (original Diamond-Da40), Maik Justus, Torsten Dreyer, the c172p authors, onox, Benedikt Hallinger, Philip Zakharov, Noah Ryu
- Licence: GPL-2.0 (COPYING file in the aircraft folder)
- Source: https://sourceforge.net/p/flightgear/fgaddon/HEAD/tree/trunk/Aircraft/DA40/
- Version: r21799 (folder last changed in r20292)
- Converted to glTF (textures resized, exterior only) by the SkyReady project.

## sr22.glb — Cirrus SR22 (FlightGear Cirrus-SR22)

- Authors: Emmanuel Baranger (3D, FDM)
- Licence: GPL-2.0 (COPYING file in the aircraft folder)
- Source: https://sourceforge.net/p/flightgear/fgaddon/HEAD/tree/trunk/Aircraft/Cirrus-SR22/
- Version: r21799 (folder last changed in r19658)
- Converted to glTF (textures resized, exterior only) by the SkyReady project.

## pa34.glb — Piper PA-34-200T Seneca II (FlightGear SenecaII)

- Authors: Torsten Dreyer
- Licence: GPL-2.0-or-later (stated in the aircraft's model files, (C) 2009 Torsten Dreyer; no separate licence file)
- Source: https://sourceforge.net/p/flightgear/fgaddon/HEAD/tree/trunk/Aircraft/SenecaII/
- Version: r21799 (folder last changed in r19328)
- Converted to glTF (textures resized, exterior only) by the SkyReady project.

## be350.glb — Beechcraft King Air 350 (FlightGear Beechcraft-King-Air, Securite Civile livery F-ZBFJ)

- Authors: Emmanuel Baranger (3D, FDM)
- Licence: GPL-2.0 (COPYING file in the aircraft folder)
- Source: https://sourceforge.net/p/flightgear/fgaddon/HEAD/tree/trunk/Aircraft/Beechcraft-King-Air/
- Version: r21799 (folder last changed in r21192)
- Converted to glTF (textures resized, exterior only) by the SkyReady project.

## b738.glb — Boeing 737-800 (FlightGear 737-800)

- Authors: David Culp (FDM), Syd Adams (glass instruments), Innis Cunningham (3D and panel), Michael Soitanen (current development)
- Licence: GPL-2.0 (LICENSE file in the aircraft folder)
- Source: https://sourceforge.net/p/flightgear/fgaddon/HEAD/tree/trunk/Aircraft/737-800/
- Version: r21799 (folder last changed in r15164)
- Converted to glTF (textures resized, exterior only) by the SkyReady project.

## be36.glb — Mooney M20M (FlightGear Mooney-M-20) - stand-in for the Beechcraft Bonanza A36

- Authors: Emmanuel Baranger (3D, FDM)
- Licence: GPL-2.0 (COPYING file in the aircraft folder)
- Source: https://sourceforge.net/p/flightgear/fgaddon/HEAD/tree/trunk/Aircraft/Mooney-M-20/
- Version: r21799 (folder last changed in r21291)
- Converted to glTF (textures resized, exterior only) by the SkyReady project.
