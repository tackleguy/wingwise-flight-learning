# Credits and licences

The SkyReady Flight Simulator uses only open-source software and open data. No paid services, no
API keys, no accounts. (This list is completed from `docs/notes/` as modules are finished.)

## Software

| What | Used for | Licence | Link |
| --- | --- | --- | --- |
| JSBSim **as bundled in FlightGear 2024.2** (`flightgear/src/FDM/JSBSim`) | Flight physics engine, compiled to WebAssembly by `jsbsim/build-flightgear.sh` (two small bug fixes that later JSBSim releases also made are applied during the build — listed in that script); shipped as a separate replaceable module in `public/jsbsim/` | LGPL-2.1 | https://gitlab.com/flightgear/flightgear · https://github.com/JSBSim-Team/jsbsim |
| SimGear helper subset shipped with JSBSim 1.1.14 (`src/simgear`: property tree, XML reader, paths) and the expat XML parser inside it | Lets FlightGear's JSBSim run without the full SimGear library | LGPL-2.0-or-later (SimGear) / MIT (expat) | https://pypi.org/project/JSBSim/1.1.14/ |
| JSBSim aircraft collection (`jsbsim/aircraft/`): c172p (tuned by SkyReady), c182, pa28, J3Cub, c310, DHC6, p51d, A320, f16, t6texan2, with their engine/propeller/system files | Flight models of the ten aircraft. The c182 and pa28 main-wheel steering is fixed (`jsbsim/CHANGES.md`); the others are unmodified | JSBSim's repository licence (LGPL-2.1); **c310 and f16 files declare GPL** | https://pypi.org/project/JSBSim/1.1.14/ |
| FlightGear aircraft 3D models (c172p from FGData; the other nine from FGAddon) | What the ten aircraft look like (converted to glTF, exterior only, textures resized) — separate data files in `public/models/fg/` | **GPL** (each aircraft's own licence; authors, sources and revisions in `public/models/fg/CREDITS.md`) | https://gitlab.com/flightgear/fgdata · https://sourceforge.net/p/flightgear/fgaddon/ |
| CesiumJS | 3D globe (used without Cesium ion) | Apache-2.0 | https://github.com/CesiumGS/cesium |
| React, React DOM | User interface | MIT | https://react.dev |
| Vite, vitest, TypeScript, Tailwind CSS | Build tools, tests, styling | MIT / Apache-2.0 | https://vite.dev · https://vitest.dev · https://www.typescriptlang.org · https://tailwindcss.com |
| lucide-react | Icons | ISC | https://lucide.dev |
| geomagnetism | Magnetic variation (World Magnetic Model) | Apache-2.0 | https://github.com/naturalatlas/geomagnetism |
| @mapbox/vector-tile, pbf | Reading OpenStreetMap vector tiles | BSD-3-Clause | https://github.com/mapbox/vector-tile-js · https://github.com/mapbox/pbf |
| three.js | Build-time authoring of the aircraft model only | MIT | https://threejs.org |
| Emscripten | Compiling JSBSim to WebAssembly | MIT / NCSA | https://emscripten.org |
| Pillow, numpy | Build-time conversion of the FlightGear 3D models (`scripts/fg-aircraft/`) only | MIT-CMU / BSD-3-Clause | https://python-pillow.org · https://numpy.org |

## Data

| What | Used for | Licence / terms | Link |
| --- | --- | --- | --- |
| OurAirports | Airports, runways, radio frequencies, navaids | Public domain (no guarantee of accuracy) | https://ourairports.com/data/ |
| Terrain Tiles (Mapzen / Tilezen) on AWS Open Data | Terrain elevation | Open data; attribution required for the underlying sources (below) | https://registry.opendata.aws/terrain-tiles/ |
| Sentinel-2 cloudless 2016 by EOX | Satellite imagery | CC BY 4.0 — "Sentinel-2 cloudless – https://s2maps.eu by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2016 & 2017)". EOX's hosted tiles are free for non-commercial use. | https://s2maps.eu |
| NASA GIBS — Blue Marble, VIIRS city lights | Base imagery, night lights | Public domain (NASA); credit requested | https://www.earthdata.nasa.gov/engage/open-data-services-software/earthdata-developer-portal/gibs-api |
| USGS The National Map — USGSImageryOnly | Optional sharper imagery over the USA | Public domain (USGS) | https://basemap.nationalmap.gov |
| World Magnetic Model (NOAA NCEI / BGS) | Magnetic variation | Public domain | https://www.ncei.noaa.gov/products/world-magnetic-model |
| aviationweather.gov (NOAA/NWS Aviation Weather Center) | METAR weather reports | US Government public data; max 100 requests/min | https://aviationweather.gov/data/api/ |
| api.weather.gov (NOAA/NWS) | Weather observations (USA) | US Government public data | https://www.weather.gov/documentation/services-web-api |
| Open-Meteo | Weather worldwide (fallback) | CC BY 4.0; free for non-commercial use, under 10,000 requests/day | https://open-meteo.com |
| OpenStreetMap via OpenFreeMap | Buildings / ground features (optional) | ODbL — © OpenStreetMap contributors; tiles by OpenFreeMap (© OpenMapTiles) | https://www.openstreetmap.org/copyright · https://openfreemap.org |

### Terrain Tiles source attribution
ArcticDEM terrain data DEM(s) were created from DigitalGlobe, Inc., imagery and funded under
National Science Foundation awards 1043681, 1559691, and 1542736; Australia terrain data ©
Commonwealth of Australia (Geoscience Australia) 2017; Austria terrain data © offene Daten
Österreichs – Digitales Geländemodell (DGM) Österreich; Canada terrain data contains information
licensed under the Open Government Licence – Canada; Europe terrain data produced using Copernicus
data and information funded by the European Union – EU-DEM layers; Global ETOPO1 terrain data U.S.
National Oceanic and Atmospheric Administration; Mexico terrain data source: INEGI, Continental
relief, 2016; New Zealand terrain data Copyright 2011 Crown copyright (c) Land Information New
Zealand and the New Zealand Government (All rights reserved); Norway terrain data © Kartverket;
United Kingdom terrain data © Environment Agency copyright and/or database right 2015. All rights
reserved; United States 3DEP (formerly NED) and global GMTED2010 and SRTM terrain data courtesy of
the U.S. Geological Survey.

## Original work
The instrument panel artwork, runway textures, sounds, lessons and all simulator code outside the
items above are original to SkyReady. The original SkyReady trainer 3D model (`public/models/trainer.glb`)
is kept as a fallback for when a FlightGear model cannot be loaded.

## About the GPL items
FlightGear's aircraft 3D models and the c310 and f16 flight-model files are licensed under the GNU
GPL. They are shipped unchanged in content (the 3D models converted to another file format) as
separate data files that the simulator loads at run time, together with their licence and a link to
their source. Anyone may copy and change them under the GPL. (This is the project's understanding
of how the licences apply — not legal advice.)
