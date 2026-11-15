# Credits and licences

The SkyReady Flight Simulator uses only open-source software and open data. No paid services, no
API keys, no accounts. (This list is completed from `docs/notes/` as modules are finished.)

## Software

| What | Used for | Licence | Link |
| --- | --- | --- | --- |
| JSBSim | Flight physics (compiled to WebAssembly; shipped as a separate replaceable module in `public/jsbsim/`, with its c172p aircraft data) | LGPL-2.1 | https://github.com/JSBSim-Team/jsbsim |
| CesiumJS | 3D globe (used without Cesium ion) | Apache-2.0 | https://github.com/CesiumGS/cesium |
| React, React DOM | User interface | MIT | https://react.dev |
| Vite, vitest, TypeScript, Tailwind CSS | Build tools, tests, styling | MIT / Apache-2.0 | https://vite.dev · https://vitest.dev · https://www.typescriptlang.org · https://tailwindcss.com |
| lucide-react | Icons | ISC | https://lucide.dev |
| geomagnetism | Magnetic variation (World Magnetic Model) | Apache-2.0 | https://github.com/naturalatlas/geomagnetism |
| @mapbox/vector-tile, pbf | Reading OpenStreetMap vector tiles | BSD-3-Clause | https://github.com/mapbox/vector-tile-js · https://github.com/mapbox/pbf |
| three.js | Build-time authoring of the aircraft model only | MIT | https://threejs.org |
| Emscripten | Compiling JSBSim to WebAssembly | MIT / NCSA | https://emscripten.org |

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
The aircraft 3D model, instrument panel artwork, runway textures, sounds, lessons and all
simulator code outside the items above are original to SkyReady.
