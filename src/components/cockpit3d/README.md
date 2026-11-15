# Cockpit 3D — authoring guide

Reusable runtime for interactive, educational 3D cockpits. Everything here is original
procedural geometry: no external models, textures, logos or brand names. Cockpits are
**representative** layouts for training and understanding, never an approved panel or a POH.

| File                | What it is                                                                       |
| ------------------- | -------------------------------------------------------------------------------- |
| `types.ts`          | The contract (`CockpitDefinition`, `Hotspot`, `ControlBinding`, …)               |
| `parts.ts`          | Procedural parts library + shared materials (`MAT`)                              |
| `CockpitViewer.tsx` | React viewer (SSR-safe; three.js loaded in an effect)                            |
| `runtime.ts`        | Imperative three.js runtime used by the viewer (browser only)                    |
| `registry.ts`       | `COCKPITS` metadata, `loadCockpit(id)`, `cockpitForAircraft(perfId)`             |
| `sim.ts`            | `useCockpitSim(meta)`, `cockpitSimOptions(meta)`, `withCockpitPanel(meta, opts)` |
| `defs/<id>.ts`      | One cockpit per file, `export default definition`                                |
| `defs/sample.ts`    | Parts lab exercising every part, screen and binding — copy patterns from it      |

## Using a cockpit

```tsx
const [def, setDef] = useState<CockpitDefinition | null>(null);
useEffect(() => void loadCockpit(id).then((d) => setDef(d ?? null)), [id]);
const engine = useCockpitSim(def); // parked on a runway, parking brake set; { airborne: true } for cruise
const viewer = useRef<CockpitViewerHandle>(null);

{
  def && engine ? (
    <CockpitViewer
      ref={viewer}
      definition={def}
      engine={engine}
      view="seat" // or "inspect" (orbit)
      selectedId={sel?.id ?? null}
      highlightIds={tourStep ? [tourStep.hotspotId] : []} // pulsing amber
      onSelect={setSel} // Hotspot | null — show what/how/tip in your UI
      showLabels={false}
      className="h-[70vh]"
    />
  ) : null;
}
viewer.current?.focus("throttle"); // turn the head / orbit to a hotspot
```

`useCockpitSim` sets `SimOptions.panel` from the definition (`"steam"` or `"glass"`), so a
steam panel driven by C172 performance shows vacuum-gyro behaviour (`engine.panel`).
Other viewer props: `interactive` (default true), `transparent` (no sky/ground — let a World3D
canvas behind show through), `look` / `onLookChange` (head look in degrees, synced with World3D's
cockpit camera: yaw + = right, pitch + = up), `onHover`.

Interaction: drag = look around (seat) / orbit (inspect); wheel = zoom (FOV 30–75°); pinch on touch.
On a hotspot: click toggles / steps rotaries / presses buttons / turns knobs (shift- or
right-click = other direction); drag moves levers; wheel over a knob, rotary or lever steps it.
DOM instruments (PFD softkeys, radio knobs…) are directly clickable.

## Coordinate frame

Metres. **x = right, y = up, −z = forward** (toward the nose). Origin = the left-seat pilot's
design eye point. Typical light aircraft: panel face ≈ z −0.75 … −0.85, glareshield top ≈ y +0.05,
floor ≈ y −1.1, cabin centreline ≈ x +0.27 … +0.3 (side-by-side). Airliner: eye ~1.1 m above floor,
panel ~0.8 m ahead.

Every panel-mounted part is built **facing +z with its mounting face at z = 0**, "up" = +y. Put
parts inside a group positioned at the panel face (`panel.position.set(…)`) and add them at
`(x, y, 0)` in panel space. Floor parts (`fuelSelector`, seats, sticks, pedals) face +y.

## CockpitBuild

```ts
build(): CockpitBuild => ({
  root,                          // THREE.Group — everything lives under it
  hotspots,                      // Hotspot[]
  screens,                       // InstrumentScreen[]
  eye: { position, target },     // seat camera; target sets the default look direction
  inspect?: { position, target },// optional orbit camera (default: 0.8 m behind eye.target)
  eyeHeightM?: 1.4,              // eye height above ground when parked (places the outside ground)
  animate?(s, dt) {},            // called every frame with the latest SimSnapshot
  dispose?() {},                 // extra cleanup (rarely needed)
});
```

`build()` is called once per viewer mount. The viewer disposes all geometries/materials/textures
under `root` on unmount except shared ones (`userData.shared = true`, everything cached in
`parts.ts`). If you create your own materials, either let the viewer dispose them (default) or
mark them shared with `markShared()` and cache them yourself.

### Hotspots

```ts
{ id, label, category, what, how, tip?, object, control? }
```

`object` is the raycast target (descendants count) and the thing that is tinted on hover /
selection / highlight. Parts include invisible `hitBox` proxies so small controls are easy to hit.
Nearer geometry blocks clicks (a yoke in front of a switch wins) — place hotspots where a pilot
can actually reach them, or use the inspect view. Text must be accurate (PHAK/AFH/AIM terms) and
generic ("representative"), not copied from a POH.

### Control bindings (`hotspot.control`)

| kind     | fields                                                                     | runtime does                                                                                                                                            |
| -------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `toggle` | `get(s)`, `set(e, on)`                                                     | click flips; animates parts with `userData.applyState` (toggleSwitch, rocker halves)                                                                    |
| `lever`  | `get(s)` 0..1, `set(e, v)`, `axis`, `travel`, `moving`, `detents?`, `arc?` | drag along the projected axis (end-on axes: drag up = increase); moves `moving` to `base + axis·travel·v`, or rotates it `arc.angle·v` about `arc.axis` |
| `rotary` | `positions`, `get(s)` index, `set(e, i)`, `moving`, `step`                 | click = next (wraps), shift = previous, wheel steps; sets `moving.rotation.z = base − i·step`                                                           |
| `button` | `press(e)`                                                                 | click                                                                                                                                                   |
| `knob`   | `turn(e, ±1)`                                                              | wheel or click (shift = −1)                                                                                                                             |

The runtime animates `moving` for levers/rotaries and toggle parts every frame from `get(s)`, so the
3D state always mirrors the sim (also when changed elsewhere). Everything else (yokes, needles,
lit buttons, compass card) you animate in `animate(s, dt)`. Keep `get` pure and cheap.

Parts return what bindings need, e.g.

```ts
const thr = pushPullKnob({ style: "throttle" });
panel.add(place(thr.group, 0.05, -0.2, 0));
hotspots.push({
  id: "throttle",
  label: "Throttle",
  category: "engine",
  what: "…",
  how: "…",
  object: thr.group,
  control: {
    kind: "lever",
    get: (s) => s.controls.throttle,
    set: (e, v) => e.setControls({ throttle: v }),
    axis: thr.axis,
    travel: thr.travel,
    moving: thr.moving,
  },
});
```

### Instrument screens (live avionics)

```ts
{ id, component, position, rotation, widthM, heightM, pixelWidth, hotspotId?,
  parent?, shape?: "rect" | "circle", fit?: "contain" | "none", bare?: boolean, options? }
```

The viewer renders the SkyReady avionics React component for `component` into a DOM element of
`pixelWidth × pixelWidth·heightM/widthM` px, placed with CSS3D exactly at the pose (the screen faces
its local +z). `position`/`rotation` are in `parent` space (default `root`) — e.g. use
`displayBezel(...).screen.position` with `parent: bezel.group`. A punch-through mesh at the same
pose lets the DOM show through while nearer 3D geometry still occludes it.

Components: `pfd mfd sixpack asi ai alt tc hi vsi compass vor1 vor2 hsi adf dme ils radios com-nav
xpdr autopilot engine annunciators gps switches`. Round gauges default to a circular window.
`fit: "contain"` (default) scales the component down to fit the window; `bare` (default) hides its
caption/frame chrome. `options`: `hideSoftKeys` (PFD, default true — model softkeys in 3D),
`initialPage`/`hideEngineStrip` (MFD), `layout` (engine), `activeOnly` (annunciators), `sections`
(radios), `background`.

Tips: put the screen 2–4 mm **behind** the panel face, inside a cut-out (`panelWithCutouts` hole or
`displayBezel`) so the bezel overlaps the edge. A good `pixelWidth` is ~2600–3000 px per metre
(a 0.076 m round gauge → 220 px; a 10" PFD → 620 px). Keep the number of DOM screens reasonable
(< ~15): each re-renders with the sim.

### Tours

```ts
tours: [{ id, title, summary, steps: [{ hotspotId, text, check?: (s) => boolean }] }]
```

The page that hosts the viewer drives tours: highlight `step.hotspotId` via `highlightIds`,
`focus()` it, and use `check(s)` to auto-advance interactive steps.

## Parts catalogue (`parts.ts`)

All sizes in metres; every function returns new objects (geometry/material shared where cached).

**Materials** — `MAT.panelPaint(color?, rough?)`, `paint(color, rough?, metal?)`, `satinBlack()`,
`glossBlack()`, `brushedMetal(color?)`, `chrome()`, `aluminium(color?)`, `leather(color?)`,
`fabric(color?)`, `carpet(color?)`, `rubber()`, `plastic(color?, rough?)`, `glass(tint?, opacity?)`
(window — does not block clicks), `gaugeGlass()`, `instrumentFace()`, `placardWhite()`,
`emissive(color, intensity?)`, `wood(color?)`, `needle(color?)`.

**Helpers** — `mesh(geo, mat, name?)`, `group(name, ...children)`, `place(obj, x, y, z, rx?, ry?, rz?)`,
`roundedBox(w, h, d, mat, r?)` / `roundedBoxGeo`, `cylinderZGeo(rFront, rBack, len)` (along +z),
`cylinderYGeo(rTop, rBottom, len)` (along +y), `latheZGeo(key, [[r, z]...])`, `rod(a, b, r, mat)`,
`tubePath(points, r, mat, opts?)`, `hitBox(w, h, d)`, `markShared(x)`, `makeCanvas(w, h)`.

**Panels & structure**

- `panelWithCutouts({ width, height, thickness?, cornerRadius?, bevel?, holes?: Cutout[], topArch?, outline?, material? })` — `Cutout = {x, y, r} | {x, y, w, h, r?}`. Front at z = 0.
- `panelBlock({ width, height, depth?, title?, color?, screws?, holes? })` — sub-panel / overhead block with title placard and corner screws.
- `glareshield({ width, depth, lip?, bow?, material? })` — rear lip at z = 0, top at y = 0, extends −z.
- `windshieldFrame({ bottomY, topY, bottomZ, topZ, halfWidthBottom, halfWidthTop, centerX?, centerPost?, pillarRadius?, glass?, material? })` — open by default (no glass).
- `cabinShell({ centerX?, halfWidth, floorY, ceilingY, frontZ, rearZ, sillY, windowTopY, windowFrontZ, windowRearZ, style?: "light-aircraft"|"vintage"|"airliner", wallColor?, floorColor?, ceilingColor?, noHeadliner? })` — walls with window openings, armrests, door handles, carpet floor, footwell, headliner, rear bulkhead.
- `seat({ style?: "fabric"|"leather"|"vintage"|"airliner", color?, width? })` — origin = floor under seat, hidden in inspect view.
- `screws(points, { radius?, style?: "phillips"|"rivet", color? })`, `rivetLine(from, to, count, r?)`, `cornerScrews(w, h, inset?, r?)` — one InstancedMesh each.
- `placard(text | lines[], { width?, height?, color?, background?, weight?, align?, px?, border?, lit? })` — text plate facing +z.
- `circuitBreakerRow({ labels, amps?, spacing? })`, `fireExtinguisher()`, `domeLight()`.

**Gauges & displays**

- `steamGauge(scale, { radius?, style?: "steam"|"vintage"|"modern" })` → `{ group, needles, set(v), setAt(i, v) }` — canvas face + 3D needle + bezel + glass. Drive in `animate`.
- `dualGauge(leftScale, rightScale, { radius?, title? })` — two half-scales (fuel L/R, oil T/P).
- `analogClock({ radius? })` → adds `setTime(secondsOfDay)`.
- `GAUGES.tach() manifold() oilTemp() oilPress() fuelQty(cap, "L"|"R"|"") suction() ammeter() egt() cht() fuelFlow(max?) volts() n1()` — representative scales; or write your own `GaugeScale { min, max, startDeg?, endDeg?, major, minorPerMajor?, labels?, labelText?, labelDivisor?, arcs?, redlines?, title?, units? }` (angles clockwise from 12 o'clock).
- `gaugeBezel({ radius, style?, glass?, screws? })` — bezel for a DOM gauge window (hole radius = `radius`).
- `displayBezel({ width, height, screenWidth, screenHeight, screenOffset?, softkeys?, softkeyLabels?, knobs?, buttons?, depth?, color?, title? })` → `{ group, screen: { position, width, height }, softkeys, knobs }`.
- `cdu({ width?, title? })` — flight-management keypad with a static sample page.
- `wetCompass()` → `{ group, card, set(headingDeg) }` (reversed card like the real thing).

**Controls** (animate automatically when bound)

- `toggleSwitch({ guarded?, style?: "bat"|"paddle", label? })` → toggle.
- `rockerSwitch({ split?, labels?, color?, width?, height? })` → `{ group, halves[] }` — each half is a toggle hotspot (`halves[i].group`).
- `pushButton({ label, sublabel?, width?, height?, color?, style?: "square"|"round"|"key", backlit?, capColor? })` → `{ group, cap, setLit(on) }` (button binding; call `setLit` in `animate`).
- `rotaryKnob({ radius?, height?, style?: "knurled"|"concentric"|"pointer"|"chicken-head", color?, label? })` → `{ group, moving }` (knob binding).
- `rotarySelector({ positions, stepDeg?, baseDeg?, radius?, style? })`, `ignitionSwitch()` (OFF R L BOTH START), `fuelSelector({ positions?, stepDeg?, baseDeg? })` → `{ group, moving, positions, step }` (rotary binding).
- `pushPullKnob({ style?: "throttle"|"mixture"|"prop"|"carb-heat"|"primer"|"generic", travel?, label?, color? })` → `{ group, moving, axis, travel }` — value 0 = pulled out, 1 = pushed in.
- `quadrantLever({ knob?: "power"|"prop"|"mixture"|"thrust"|"flap"|"speedbrake"|"generic", length?, sweepDeg?, color? })` → `{ group, moving, axis, travel, arc }` — pivot at origin, 0 = aft, 1 = forward.
- `quadrantHousing({ width, height, depth, slots, slotLength?, color?, labels? })`.
- `flapSelector({ labels?, travel? })`, `gearLever({ travel? })` → slider parts with `detents` (0 = top).
- `yoke({ style?: "ram-horn"|"w"|"vintage"|"airliner", shaftLength?, travel?, maxRollDeg? })` → `{ group, column, wheel, update(elevator, aileron) }`.
- `controlStick({ style?: "vintage"|"modern", length?, maxDeg? })`, `sideStick()` → `{ group, pivot, update(elevator, aileron) }`.
- `rudderPedals({ spacing?, style?: "hanging"|"floor"|"bar", toeBrakes?, travel? })` → `{ group, left, right, update(rudder, brakes) }`.
- `trimWheel({ radius?, width? })` → `{ group, wheel, indicator, set(trim) }`.

**Merging** — `mergeStatic(group)` merges every static mesh under `group` into one mesh per material
(transparent meshes, InstancedMeshes and `hideInInspect` objects are kept separate). Build all
non-interactive décor (cabin, panel plates, screws, placards that never change) in one group and
add `mergeStatic(decor)` to `root`. Never merge hotspot objects or moving parts.

## Performance

- Reuse `MAT.*` materials and cached geometries; avoid `new Material` per part.
- Merge static décor (`mergeStatic`); use `screws()` / instanced rows for repeated small parts.
- `animate` runs every frame: no allocations (no `new Vector3`, no array literals); just set
  rotations/positions.
- Prefer 3D `steamGauge`s for simple engine gauges and DOM screens for complex instruments.
- The viewer pauses rendering when off-screen or the tab is hidden, and disposes everything on unmount.
- Mark large interior pieces that block the orbit view with `userData.hideInInspect = true` (seats do this).
