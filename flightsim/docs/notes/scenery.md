# Scenery module — notes

Owner files: `src/scenery/**`, `dev/scenery.html`, `dev/scenery.ts`, `tests/scenery/**`, this file.

## 1. What was built

`createScenery(world)` (in `src/scenery/index.ts`) returns the `"scenery"` module. Around the
aircraft it draws, for every airport in the open database:

| Thing | What you see |
| --- | --- |
| **Runways** | In the surveyed position, heading, length and width, lying exactly on the ground the wheels roll on. Surface looks: asphalt (dark, lighter worn centre strip, paving-lane joints, tyre rubber in the touchdown zones), concrete (light grey slabs with joints), grass (mown strip, soft ragged edges, the photo underneath shows through a little), gravel, dirt, snow, and a neutral grey for "surface unknown". |
| **Markings** (paved runways) | Threshold stripes (4/6/8/12/16 by width), runway numbers with L / C / R letter the right way up at each end, dashed centreline (120 ft stripes, 80 ft gaps), aiming-point blocks 1,020 ft past the threshold on runways of 4,200 ft or more, touchdown-zone bars (3-2-2-1-1) on runways over 6,000 ft and at least 100 ft wide, side stripes on wide runways, and for displaced thresholds: centreline arrows, arrow heads and the threshold bar. Short or narrow paved strips get numbers and a centreline only. Grass, gravel and dirt get no paint. |
| **Lights** (only runways marked "lighted" in the data) | White edge lights every 200 ft or less; amber for the last 2,000 ft (or half the runway) *in the direction you are travelling*; red in front of a displaced threshold as seen on approach; green threshold lights seen from the approach and red runway-end lights seen from the runway; approach lights with a 1,000 ft bar and sequenced flashers at medium/large airports; centreline lights at large airports (high quality). |
| **PAPI** | Four lights on the left of the runway about 950 ft past the threshold of every lighted paved runway end: white above / red below their angles 2.50°, 2.83°, 3.17°, 3.50° — four white = too high … two and two = on the 3° path … four red = too low. Works by day too. |
| **Beacon** | Rotating green/white airport beacon at lighted airports (one turn every 5 s), at night or in poor visibility. |
| **Windsocks** | Orange-and-white socks beside the touchdown areas of the two longest runways (one at mid-field for short strips). They point downwind and extend band by band with the surface wind — limp in calm, straight out at 15 kt. |
| **Buildings** (optional) | Plain extruded blocks from OpenStreetMap footprints within 2–3 km of the aircraft. |

Lights come on at night and dusk and whenever visibility is below roughly 3–6 statute miles;
the PAPI is always on.

### Files

| File | Purpose |
| --- | --- |
| `api.ts` | `SceneryApi`, `SceneryStats`, `PapiReport`, the "representative positions" note, buildings attribution text |
| `index.ts` | the module: per-frame values, level of detail, build scheduling |
| `lod.ts` | pure rules: build / dispose radii, runway budget, light level, build priority |
| `geo.ts` | pure geodesy: WGS84 → local east/north/up frame, runway axes |
| `layout.ts` | pure: surface look and every marking dimension of a runway |
| `lights-layout.ts` | pure: every light of a runway (position, colours, direction rule), PAPI logic |
| `airport.ts` | builds one airport step by step (generator) |
| `runway-surface.ts` | runway mesh + shader (surface looks and markings per pixel) |
| `lights.ts` | light sprites mesh + shader |
| `windsock.ts`, `windsock-math.ts` | windsock mesh + shader, extension rule |
| `textures.ts` | procedural noise texture, runway numerals (signed distance field) |
| `buildings.ts`, `buildings-math.ts` | optional OpenStreetMap buildings |
| `gl.ts` | the only file that touches CesiumJS's low-level (undocumented) renderer classes |

## 2. Decisions and why

### Runway drawing: thin "decal" meshes with the paint computed per pixel
The brief offered two routes: (a) CesiumJS `GroundPrimitive` (draped on the terrain) or (b) ordinary
meshes lying just above the runway plane. **I built a variant of (b)**; (a) was assessed on paper
only — it was not run — and rejected because a draped primitive reconstructs its texture
coordinates from the depth buffer (noisy at the shallow angles a pilot looks along a runway from),
costs several stencil passes per runway, and cannot have a custom shader, which the markings need.

What (b) looks like here:

- **Same ground as the wheels.** Every mesh vertex takes its height from `elevation.heightM()` —
  the function physics uses — after `elevation.ensure()` has loaded the terrain under the runway.
  Rows every 20 m follow the Earth's curvature and, where runways cross, the blended surface the
  terrain service produces there. The mesh is lifted 3.5 cm (+1.2 cm per crossing runway).
- **Decal rendering.** The mesh is drawn in the opaque pass right after the globe, blended, depth
  *tested* but not written. Nothing can z-fight with it, crossing runways simply paint over each
  other in a fixed order (unpaved first, longest paved last), edges are anti-aliased with alpha,
  and grass strips let a little of the aerial photo through.
- **Depth bias that grows with distance** (in the vertex shader: the eye-space position is scaled
  toward the eye by up to 3 % beyond 200 m … 6 km; the picture does not move, only its depth).
  This is what keeps the runway from sinking into the coarse terrain tiles CesiumJS shows far
  away (at 5 nm the terrain under a runway is 60–120 m cells and only approximately flattened).
  Hills in front still hide the runway; they just have to be more than 3 % of the distance in front.
- **Markings are maths, not textures.** Threshold stripes, centreline dashes, aiming points,
  touchdown-zone bars, side stripes, the displaced-threshold bar and arrows are box-filtered
  rectangles / pulse trains / triangles evaluated in the fragment shader in runway metres, with the
  pixel footprint from `fwidth`. Result: razor sharp from the cockpit on the ground, and a smooth
  fade to the average far away — no shimmer, no mip-map tuning, no texture memory.
- **Runway numbers** are the one thing that needs a texture: a 128 × 256 signed-distance-field
  per designator ("28R", "09", …), drawn with Canvas 2D from an original stroke design of the
  numerals (blocky runway-paint style: 60 ft tall, 20 ft wide, 5 ft strokes), converted with a
  two-pass Euclidean distance transform, mip-mapped with anisotropic filtering, cached for the
  whole session and shared by all airports. Close up the edge is reconstructed from the distance
  (always crisp); when minified the stored coverage is used.
- One shared 256 × 256 repeating noise texture gives every surface its grain.
- Surfaces get the same day/night factor and the same haze (CesiumJS `scene.fog` with the
  atmosphere's colour, computed per vertex) as the globe, so they fade with the terrain.

### Lights: one sprite mesh per airport, all behaviour in the shader
The brief suggested `PointPrimitiveCollection` / `BillboardCollection`. I used a custom sprite mesh
instead because the lights need things those collections cannot do without per-frame CPU work:

- colour by viewing direction (green threshold / red end, amber caution zone, red before a
  displaced threshold, one-way approach lights) — decided per light in the vertex shader;
- PAPI red/white from the viewer's angle above the horizon as seen from each unit;
- beacon sweep and sequenced flashers from a time uniform;
- a depth rule that fits lights on the ground: each sprite takes the depth of the ground seen
  under its lower edge (never more than half-way to the eye), so the terrain cannot slice the glow
  in half, yet hills and the aircraft in front still hide it. No `disableDepthTestDistance`.

Sprites have a minimum on-screen size and fade only gently with distance (power 0.33), plus a haze
term `exp(−distance × 3.912 / visibility × 0.5)` — lamps carry about twice as far as unlit ground.
The glow is procedural in the fragment shader (bright core + halo), blended pre-multiplied so the
halo adds light and the core covers the background (visible against bright daytime ground too).
Lights are drawn after everything opaque (the module keeps its light layer last in
`scene.primitives`), so clouds / haze drawn later cover them correctly.

**PAPI readability aid:** far away the four units would fall on the same two or three screen
pixels (a real eye resolves them, a display cannot), so beyond the distance where they would
touch, the shader keeps them 1.3 sprite-widths apart about their true centre. Colours and
transition angles are unaffected.

### Night look of the pavement
Unlit pavement keeps 30 % brightness at night (the factor CesiumJS uses for the night side of the
globe; `scenery.nightBrightness` lets the integrator match whatever the sky module does). Lighted
runways get a small pool of light on the pavement beside each edge light, and the aircraft's own
landing / taxi light (`controls.lights.landing` / `.taxi`, battery on) lights a cone of runway
ahead of the nose below 500 ft — both only as it gets dark.

### Windsock
One mesh per airport, bent in the vertex shader: the first `windKt / 15` of the sock is held
straight, the rest droops; the limp part collapses; a little sway and flutter from a time uniform.
The wind is the **surface** wind (`sim.env.wind[0]`, the same layer the spawn code uses to choose
the runway) plus the gust value, smoothed over about a second — not the wind at the aircraft's
altitude. It is drawn 1.4× the size of a real large windsock (5 m sock on an 8 m pole) so it can be
found from the pattern.

### Level of detail, lifetime, budgets
- Build radius 12 nm, dispose radius 16 nm (measured from the aircraft and from the last
  `refresh()` position). Scan once a second or every 0.25 nm.
- Build order: the airport the flight started at, then nearest first, with a 3 nm bonus for
  airports within 35° of the track.
- Runway budget on screen: 30 / 50 / 80 (low / medium / high); at most 12 runways per airport
  (longest first). When the budget is full a clearly nearer airport replaces the farthest one.
- Per frame: at most 2.5 ms of airport building (14 ms for 2.5 s after a spawn / `refresh()`, when
  a loading pause is expected anyway), plus 1.5 ms for building tiles; terrain loading is started
  for at most two new airports per frame. Building is a generator that yields every ~24 mesh rows /
  160 lights / one texture.
- Quality: low = edge, threshold/end lights, PAPI, beacon; medium adds approach lights and
  flashers; high adds centreline lights and 100 ft approach-light stations at large airports.
  Changing `settings.quality` rebuilds only the lights.

### Buildings (optional part 5)
OpenStreetMap footprints from OpenFreeMap vector tiles (zoom 14, layer `building`,
`render_height`). In that schema one feature holds *all* buildings of one height in the tile, so
"cap the buildings" is done on outlines: sorted by ground area × height bonus, taken until a point
budget is used (3,500 points per tile at medium, 8,000 at high; none at low), outlines under 45 m²
dropped, collinear points removed (0.6 m tolerance; 1.8 m for outlines of more than 150 points such
as terminals). Each tile becomes one mesh of flat-roofed boxes in eight grey/beige tints.
Tiles within 2 km (medium) / 3 km (high) of the aircraft, only below 6,000 ft above the ground, one
download at a time, at least 5 s apart (≤ 12 per minute), 18 tiles cached. The required
attribution is added to the credit line automatically while buildings are on.

## 3. Outside sources

| Source | Licence | Link | How it is used |
| --- | --- | --- | --- |
| CesiumJS 1.147 (already a dependency) | Apache-2.0 | https://github.com/CesiumGS/cesium | Rendering. `src/scenery/gl.ts` uses its exported but undocumented renderer classes (`Buffer`, `VertexArray`, `ShaderProgram`, `RenderState`, `DrawCommand`, `Texture`, `Sampler`, `PolygonPipeline.triangulate`) and built-in GLSL functions (`czm_fog`, `czm_computeGroundAtmosphereScattering`, …). No Cesium code was copied. |
| OpenFreeMap vector tiles (planet) | Tiles: free, no key; data © OpenStreetMap contributors (ODbL); schema © OpenMapTiles (CC-BY) | https://openfreemap.org · https://tiles.openfreemap.org/planet | Optional buildings. Attribution text "OpenFreeMap © OpenMapTiles Data from OpenStreetMap" (`BUILDINGS_ATTRIBUTION` in `api.ts`) — already listed in `CREDITS.md`. |
| @mapbox/vector-tile 2.0, pbf 4.0 (already dependencies) | BSD-3-Clause | https://github.com/mapbox/vector-tile-js · https://github.com/mapbox/pbf | Decoding the building tiles. |
| OurAirports (via `src/data/world-data.ts`) | Public domain | https://ourairports.com/data/ | Runway positions, sizes, surfaces, "lighted" flag, displaced thresholds. |
| FAA Advisory Circular 150/5340-1 "Standards for Airport Markings" and AC 150/5345 / AIM chapter 2 (lighting, PAPI angles) | US Government works, public domain | https://www.faa.gov/airports/resources/advisory_circulars · https://www.faa.gov/air_traffic/publications/atpubs/aim_html/chap2_section_1.html | Reference for the *dimensions and rules* (stripe counts, 120/80 ft centreline, 1,020 ft aiming point, 500 ft touchdown-zone spacing, 200 ft edge-light spacing, 2,000 ft caution zone, PAPI 2.5/2.83/3.17/3.5°). Written from general knowledge of these standards; the documents were not downloaded during the build, so individual dimensions may differ slightly from the current editions. |
| Felzenszwalb & Huttenlocher, "Distance Transforms of Sampled Functions" (2012) | Published algorithm | https://cs.brown.edu/people/pfelzens/dt/ | The 1-D squared distance transform used to make the numeral distance fields (own implementation). |

No new npm dependencies. No downloaded images, fonts or models: the noise texture, numerals and
glow sprites are generated in code. Nothing was taken from FlightGear or any GPL source.

## 4. What was verified, and how

VERIFICATION_PLACEHOLDER

## 5. Known limitations and what is still unrealistic

- **Everything about lights is representative, not surveyed.** The data only has a "lighted" flag
  per runway. Edge-light spacing, approach-light systems (every lighted paved runway of 3,500 ft or
  more at a medium/large airport gets one; real airports often have them on one end only, or a
  different type), centreline lights, beacon position and above all **PAPI presence, side,
  distance from the threshold and angle (always 3.0°, left side)** are standard layouts. Real
  PAPIs may be on the right, set to another angle, or absent (some runways have VASI or nothing).
  `SCENERY_SYNTHETIC_NOTE` (exported from `@/scenery`) is a ready sentence for the UI.
- **PAPI units are spread apart on screen at long range** (see section 2) — an aid for low-resolution
  displays; at short range their spacing is true (30 ft).
- **Markings are the standard pattern, not the real paint.** Every paved runway long and wide enough
  gets precision-style markings; real runways vary (visual / non-precision patterns, different
  aiming-point distances, yellow chevrons on blast pads, runway-end arrows of different lengths,
  ICAO vs FAA styles, "displaced" areas that are really stopways). Numbers come from the database
  designator exactly as published ("09" keeps its zero, as outside the USA; US runways are painted
  "9" in reality but the data mostly has the form shown on charts).
- **No taxiways, aprons, hold-short lines, signs, or taxi lights** — the airport database has none.
  (OpenStreetMap has taxiways in the `aeroway` layer of the same vector tiles; not used.)
- **Displaced thresholds on unpaved runways are not marked** (no paint on grass), although the
  spawn code still starts a "final" at the displaced point.
- **Runway width/length oddities in the data**: width 0 or missing becomes 50/75/150 ft by length;
  widths are clamped to 15…300 ft (500 ft unpaved); runways shorter than 60 m or longer than
  9,000 m are treated as data errors and not drawn. Estimated runways (`runway.estimated`) are drawn
  like any other, in the estimated position.
- **Surface "unknown"** is drawn as plain grey with numbers and a centreline only when it is at
  least 40 ft wide and lighted or 3,000 ft long; otherwise unmarked grey. It may really be grass.
- **Lit surfaces at night are simplified**: pavement keeps 30 % brightness (not black), the pools of
  light under edge lights and the landing-light cone are simple falloffs, there are no shadows and
  the landing light lights only runway surfaces (not grass beside them, terrain or buildings).
- **Lights and haze**: lights use `env.visibilitySm` for their own extinction and do not know about
  cloud layers; if the sky module draws fog/cloud as a post-process the lights are covered by it
  like everything else (intended), but they are not specially brightened inside cloud.
  Hills hide lights, except in the last few percent of the distance right in front of a lamp.
- **Beacon and windsock positions are invented** (reference point if clear of runways, otherwise
  beside the main runway; socks 62 m left of the runway about 390 m past each threshold). The
  windsock is 1.4× life size and shows the *reported surface wind*, with no terrain effects.
- **Buildings** are flat-roofed boxes in neutral colours, no textures, no night lighting, only the
  largest outlines in each tile (small houses are dropped first), courtyards are filled in, heights
  come from OpenStreetMap's `render_height` (often a default). They stand on level ground at the
  height under their centre, so on steep slopes one side sinks in. They appear a few seconds after
  arriving (one tile every 5 s) and there are none at low quality or above 6,000 ft AGL.
- **Far-distance depth bias**: beyond a few km a runway is drawn "in front of" anything within 3 %
  of its distance, so an object standing on a distant runway that is drawn *before* the scenery
  layer could be painted over. The module keeps its runway layer first in `scene.primitives`, so
  this only concerns things drawn in the globe pass.
- Uses CesiumJS renderer classes that are exported but undocumented (`gl.ts`); the CesiumJS version
  is pinned (1.147.0) — re-test this module when upgrading CesiumJS.

## 6. Shared-file changes

None. Only files under `src/scenery/`, `dev/scenery.*`, `tests/scenery/` and this note were
created. (`CREDITS.md` already lists OpenStreetMap / OpenFreeMap and the vector-tile libraries.)

## 7. For the integrator

```ts
import { createScenery, SCENERY_SYNTHETIC_NOTE } from "@/scenery";
const scenery = sim.use(createScenery(world));   // any time; before the views module is tidiest
```

- Nothing else is required: the module follows the aircraft, reacts to `spawn` (it builds the
  start airport first with a larger time budget) and reads `sim.settings.quality`,
  `sim.settings.buildings`, `sim.env` (time, visibility, surface wind, gust) every frame.
  `world.setQuality()` is not touched.
- `scenery.refresh(lat, lon)` pre-builds around a position (e.g. while a loading screen is up).
- `scenery.stats` (airports / runways / lights / worst frame ms …), `scenery.activeAirports`.
- `scenery.papiReport()` → `{ angleDeg, pattern: "WWRR", whiteCount, meaning, runwayEndId, … }` for
  the nearest PAPI facing the aircraft — handy for the training module ("PAPI shows two white, two
  red") and for scoring approaches. Say "representative" in the UI.
- `scenery.nightBrightness` (default 0.3): lower it if the sky module makes the night landscape
  darker than CesiumJS's default so unlit pavement does not glow.
- Draw order: the module keeps its runway layer at the bottom and its light layer at the top of
  `world.scene.primitives` (checked every frame). If another module also insists on being last,
  nothing breaks — lights in front of that module's opaque geometry may be hidden by it.
- Haze: surfaces follow `scene.fog` (density, `visualDensityScalar`, `minimumBrightness`) and the
  default `scene.atmosphere`; if the sky module fogs the scene some other way (post-process), it
  works too because everything here is depth-tested normal geometry.
- The night-side city-lights layer (`world.nightLayer`) is extremely bright near the ground and
  drowns the runway lights; the dev page hides it. The sky module should tone it down at low level.
- Buildings attribution is shown through CesiumJS's credit display automatically; the credits
  screen should also list it (`BUILDINGS_ATTRIBUTION`).

## 8. Ideas not done

- Taxiways and aprons from the OpenMapTiles `aeroway` layer (real OSM data, so not "faked").
- Reading PAPI / VASI and approach-light types from OpenStreetMap or FAA data where available.
- Segmented circle, tetrahedron, runway-end identifier lights (REIL), touchdown-zone lights,
  blast-pad chevrons, runway distance-remaining signs.
- Wet-runway look in rain, snow cover, puddles; landing-light reflections.
- Trees and night window lights on buildings.
- A draped far-distance version of the runway (GroundPrimitive) was considered and not needed.
