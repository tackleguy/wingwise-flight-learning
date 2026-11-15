# Panel module notes (`src/panel/`)

The cockpit instrument panel drawn as SVG over the lower part of the 3D view, fully interactive,
plus the "explain this instrument" teaching content. A learning aid: the drawings and numbers are
typical for a Cessna 172P-class trainer, not approved data.

## 1. What was built

| file | what it is |
| --- | --- |
| `index.ts` | public exports (see §2) |
| `CockpitPanel.tsx` | the `<CockpitPanel>` component: layouts, the one `requestAnimationFrame` loop, lighting, explain-mode capture, tab bar / drawer, hide handle |
| `ExplainCard.tsx` | the `<ExplainCard>` component (Tailwind-styled card with the live "Right now" reading) |
| `explain.ts` | `EXPLAIN`: original plain-language text for all 34 instruments/controls + `reading(sim)` interpreters |
| `ids.ts` | `InstrumentId`, `INSTRUMENT_IDS`, `isInstrumentId` |
| `layout.ts` | layout modes, `panelLayout()`, `panelHeightFraction()`, `PANEL_HEIGHT_FRACTION` |
| `geometry.ts` | pure dial maths (value → needle angle) for every scale, unit-tested |
| `radio.ts` | pure tuning rules (COM 25 kHz, NAV 50 kHz, wrap-around, squawk digits), unit-tested |
| `lighting.ts` | pure day / night / panel-light colour model, unit-tested |
| `flight.tsx` | airspeed, attitude, altimeter, turn coordinator, heading indicator, VSI |
| `engine.tsx` | tachometer, twin fuel gauge, twin oil gauge, EGT, ammeter, suction, clock + OAT, annunciators |
| `radios.tsx` | COM 1, NAV 1, ident/DME readout, transponder, VOR indicator |
| `controls.tsx` | master, avionics, lights, pitot heat, dimmer, ignition key, parking brake, throttle, mixture, carb heat, flap lever + indicator, trim wheel, fuel selector |
| `compass.tsx` | magnetic compass window above the glare shield |
| `parts.tsx`, `interact.ts`, `context.ts`, `css.ts` | shared SVG pieces (dial frame, knob, seven-segment digits), pointer/wheel/keyboard hooks, frame-loop plumbing, the stylesheet (a string, injected once) |
| `stub.ts` | `panelStubInstruments()` — developer stand-in for instruments/systems/nav (dev page and tests only) |
| `dev/panel.html`, `dev/panel.ts` | developer page (static mode and 3D mode) |
| `tests/panel/panel.test.ts` | 29 vitest tests |

All artwork is original SVG generated in code. No image, font or sound files.

## 2. Public API (`import … from "@/panel"`)

```ts
function CockpitPanel(props: {
  sim: Sim;
  onExplain?: (id: InstrumentId) => void;      // explain mode: a tap on an instrument/control
  explainMode?: boolean;                        // true = taps explain instead of operating
  className?: string;
  onCoverage?: (fraction: number, metrics: PanelMetrics | null) => void;  // share of screen height covered (0 when hidden)
  defaultHidden?: boolean;
  viewport?: { width: number; height: number }; // optional fixed size (tests / server render); normally measured
}): JSX.Element;

function ExplainCard(props: { id: InstrumentId; sim: Sim; onClose: () => void }): JSX.Element;

const EXPLAIN: Record<InstrumentId, InstrumentExplanation>;
interface InstrumentExplanation {
  id; title; group; what; howToRead: string[]; reading(sim: Sim): string;
  howItWorks; errors: string[]; failure; tip;
}
type InstrumentId = "airspeed" | "attitude" | "altimeter" | "turn-coordinator" | "heading" | "vsi" | "compass"
  | "tachometer" | "fuel-quantity" | "oil-temp" | "oil-pressure" | "egt" | "ammeter" | "suction" | "clock" | "annunciators"
  | "com1" | "nav1" | "dme" | "transponder" | "vor1"
  | "master-switch" | "avionics-master" | "lights" | "panel-lights" | "pitot-heat" | "ignition"
  | "throttle" | "mixture" | "carb-heat" | "flaps" | "trim" | "fuel-selector" | "parking-brake";
const INSTRUMENT_IDS: readonly InstrumentId[];
function isInstrumentId(v: unknown): v is InstrumentId;

const PANEL_HEIGHT_FRACTION: { wide: 0.41; side: 0.47; row: 0.42; stackClosed: 0.4; stackOpen: 0.71 }; // nominal
function panelLayout(w: number, h: number, opts?: { drawerOpen?: boolean }): PanelMetrics;
function panelHeightFraction(w: number, h: number, opts?: { drawerOpen?: boolean; hidden?: boolean }): number;
function defaultDrawerOpen(w: number, h: number): boolean;
interface PanelMetrics { mode: "wide" | "side" | "row" | "stack"; unit; pageUnit; tabBarPx; drawerOpen; hasDrawer; heightPx; fraction; dialPx }

function panelStubInstruments(): SimModule;    // dev / tests only (name "panel-stub")
const panelStats: { updaters: number; frames: number; frameMs: number }; // developer numbers
```

### What the integrator must know

- Put `<CockpitPanel>` (and `<ExplainCard>` when an id is selected) inside a **positioned** element
  that covers the 3D view (e.g. `position: fixed; inset: 0; pointer-events: none`). The panel is
  `position: absolute; bottom: 0` with `z-index: 20` and switches pointer events on for itself; the
  card is `absolute`, `z-index: 30`, top-left.
- The panel **emits** commands: `panel-toggle` (hide tab), `explain-toggle` (the "? Explain" chip),
  `dg-align` (ALIGN button on the heading indicator), `nav1-ident-toggle` (the ID button, new id).
  It **listens** only to `panel-toggle`. The app owns `explainMode` (toggle it on `explain-toggle`,
  and pause the sim if you want the "freeze and explain" behaviour).
- Who must act on what the panel emits: the instruments module on `dg-align` (it should change
  `controls.dgAdjustDeg`); the audio/nav module on `nav1-ident-toggle` (Morse ident).
- Horizon placement: use the `onCoverage` callback (exact, includes drawer and hidden states) or
  `panelHeightFraction(width, height)`. The panel also sets the CSS variable
  `--skyready-panel-height` on `<html>` (pixels, 0 when hidden) so the HUD and other overlays can
  stay clear of it; `ExplainCard` uses it.
- The panel reads `state.ind`, `state.nav`, `state.sys`, `controls`. It needs from the other
  modules: `sys.busVolts` (> 10 V = "powered"), `sys.avionicsPowered`, `sys.stallHorn`, all of
  `ind.*`, `nav.nav1` (`valid`, `flag`, `cdiDots`, `ident`, `dmeNm`, `dmeGsKt`, …), `nav.com1`.
  **Documented exceptions to "indications only":** `state.flapsDeg` (flap position indicator, as the
  brief asks), and `env.utcMs` + `state.lat/lon` only to work out day or night for the lighting.
- It writes only `sim.controls`. With no avionics power the tuning controls do nothing and the
  panel calls `sim.message(…)` once every 8 s to say why (not a control write, but worth knowing).
- Click feedback: `sim.module("audio")?.play("switch")` (rate-limited, optional).
- `controls.ignition = 4` (START) is held only while the pointer/Enter key is down and is set back
  to 3 on release by the panel itself.

## 3. Decisions (and why)

- **Each instrument is its own small SVG, laid out with absolutely positioned HTML boxes** whose
  sizes are multiples of one CSS variable `--u` ("panel unit"). The whole panel therefore scales
  evenly and stays crisp at any size, and the compact layouts can re-arrange the same instruments.
- **Four layouts** (`layout.ts`): `wide` (everything at once, ≥ 1180 px wide and ≥ 3:2),
  `side` (six-pack left + swipeable Engine · Radios · Switches pages), `row` (low-profile strip of
  the six flight instruments; landscape drawer closed), `stack` (portrait: six-pack on top, drawer
  below). In landscape the "More / Less" button switches between `row` and `side`. Six-pack dials
  never go below 96 px on the tested screens (see §5).
- **One NAV/COM and one VOR indicator.** A second NAV/COM and VOR 2 were optional in the brief; at
  1280 × 720 they only fitted by shrinking the engine gauges below a readable size, and I judged
  readable engine gauges more valuable for a student. See "ideas not done".
- **Attitude indicator bank direction.** The brief says "in a right bank the horizon line tilts
  down to the right as seen by the pilot". Taken literally (horizon lower on the right) that is the
  opposite of what a pilot sees: in a right bank the right wing points at the ground, the ground
  rises on the right-hand side and the horizon line is **higher on the right** (it appears rotated
  anticlockwise). I implemented the physically correct picture (card rotates by −roll; checked with
  the rotation maths in `tests/panel` and by screenshot: right wing bar in the brown). Bank scale:
  the scale ring turns with the horizon and its white triangle always points at the sky; the fixed
  orange triangle at the top is the index (reads 30° in a 30° bank either side).
- **Compass card** is drawn "backwards" like a real one (larger headings to the left of the lubber
  line), VOR needle is the swinging type with 5 dots a side (2° per dot), VSI and airspeed scales
  are non-linear lookup tables, the altimeter has three pointers and the striped low-altitude flag
  (fades out between 10,000 and 10,600 ft).
- **Seven-segment radio digits drawn as SVG strokes** so no font is shipped and the look does not
  depend on the device.
- **Touch buttons next to the tuning knobs** (MHz − / + and kHz − / +) in addition to the
  authentic dual concentric knob, because the knob is too small to hit reliably on phones.
- **Unpowered behaviour is enforced in the panel too** (belt and braces): with `sys.busVolts` ≤ 10 V
  the fuel and oil-temperature needles rest below the scale, the ammeter sits at zero, the turn
  coordinator shows its flag and levels, annunciators and panel lights are dead; radios follow
  `sys.avionicsPowered`. Oil pressure, EGT, tachometer and suction are treated as
  mechanical / self-powered and keep reading.
- **Lighting** is a pure function of daylight (sun elevation), the dimmer and bus power, applied as
  CSS variables (no per-frame filters). Night + lights off = about 10 % brightness (hard to read on
  purpose); radio displays and lit annunciators glow by themselves.
- **Keyboard**: Tab reaches every control; **Enter** operates it and **Shift+Enter** operates it
  the other way. Arrow keys, Space and letters are never handled, and focus is dropped after every
  pointer press, so the flight keys keep working.
- **Explain mode** is implemented with capture-phase handlers on the panel root, so no control can
  operate while it is on; the tab bar and the hide/explain chips keep working.
- The stylesheet is a string rendered through React 19's `<style href precedence>` so the module is
  self-contained (works in tests and server rendering). Only `ExplainCard` uses Tailwind classes.
- `stub.ts` is NOT installed by the panel itself. It only runs where a page registers it
  (dev page, tests) and stands down per part when the real `instruments` / `systems` / `nav`
  modules exist.

## 4. Outside sources

No outside code, images, fonts, sounds or text were copied. Nothing from FlightGear.
No new npm dependency (uses the project's React 19; `ExplainCard` uses the project's Tailwind).

- Aircraft limits (arcs, V-speeds, flap detents, max rpm) come from `src/core/defaults.ts`
  (`AIRCRAFT`), as the brief specifies them.
- Other numbers in the drawings and in the explanations (oil 100–245 °F / 25–60–90–115 psi,
  suction 4.5–5.4 inHg, magneto drop 125 / 50 rpm, 28 V / 60 A system, standard-rate turn, VOR dot
  = 2°, transponder codes, lapse rates, rules of thumb) are commonly published Cessna 172P
  handbook-class values and general pilot-training knowledge. **They were written from memory, not
  checked against a specific handbook in this session — a flight instructor should review
  `explain.ts` before it is relied on.**
- The explanation text is original writing.

## 5. Verification (what was actually run)

Commands, from `flightsim/`:

```bash
npx tsc --noEmit                                   # 0 errors in the whole project at the time of writing
npx vitest run tests/panel                         # 29 tests passed
VITE_CACHE_DIR=node_modules/.vite-panel npx vite --port 5332 --strictPort
node scripts/shot.cjs --url "http://127.0.0.1:5332/dev/panel.html?static=1&anim=0&ias=100&alt=3450&vs=500&pitch=5&roll=30&hdg=45&cdi=2&flag=TO&obs=90&bug=120" --ready "window.panelReady" --out x.png
```

**Unit tests (29, real JSBSim through `makeSim`)** — dial geometry (100 kt at the bottom of the
dial; 3,450 ft → pointers on 4.5 / 3.45 / 0.345; VSI zero at 9 o'clock and symmetric; right bank →
anticlockwise horizon; compass marks reversed; CDI sign), tuning rules incl. all 760 COM channels,
lighting (night without lights < 13 % luminance, with lights > 50 %, warm tint, needs power),
layouts (dial ≥ 96 px on 11 phone/tablet sizes in every drawer state), annunciator logic, every
`InstrumentId` has complete text, `reading(sim)` for every id in real flight, 30 specific reading
phrases, and a render-to-markup of all layouts (every id present exactly once in `wide`).

**Screenshots looked at** (headless Chrome, static mode unless noted):

| check | forced values | seen |
| --- | --- | --- |
| desktop 1280 × 720, 1920 × 1080, 2560 × 1440 | ias 100, alt 3450, vs +500, pitch 5, roll 30, hdg 45, cdi +2 TO, obs 90, bug 120, turn +1, ball +0.5 | needle on 100; 3,450 ft on three pointers; VSI on "5" up; horizon "/" with the right wing bar in the brown and the index on the 30° mark; "3 · 6" either side of the top index; compass "6 | 3" (larger left); VOR "E" on top, needle 2 dots right, ▲; wing on the R mark, ball right |
| second set | ias 76, alt 12,450, vs −700, pitch −3, roll −20, hdg 350, cdi −3 FROM, obs 210, turn −1 | all consistent, incl. hatch flag hidden above 10,600 ft and ▼ FROM |
| extremes | ias 33, alt 10,400, vs −2,200, roll −60, rpm 2,750, fuel L 0, oil T 250, oil P 20, 23 V, stall, flaps 30, trim +1, carb heat, park brake, ign R, selector LEFT, 7700 ON | needles pegged/at red lines as expected; LOW VOLTS, LOW VACUUM, L FUEL LOW, STALL lit; controls drawn in the right positions |
| tablet landscape 1024 × 768 (`side`), tablet portrait 820 × 1180 `--mobile` (`stack`, two pages visible), phone landscape 844 × 390 and 667 × 375 (`row`, and `side` with the drawer open), phone portrait 390 × 844 (`stack`) | — | layouts as designed; dial sizes 106–170 px |
| night, lights 0.7 / lights 0 | — | warm readable markings / almost black panel with only the radios glowing |
| no bus power (`power=0`) + forced gyro flags | — | radios dark, TC flag + level, fuel / oil-temp at rest, VOR striped flag, GYRO and OFF flags |
| explain mode | airspeed (desktop), VOR (tablet), altimeter by click (phone) | dashed outlines, card with "You are indicating 76 knots — that is VY (76)…", "Course 090° selected, flag TO. The needle is 2.0 dots to the right…", "It reads about 3,450 ft…" |
| hidden | `hidden=1` | only the "Instruments" tab remains; coverage 0; `--skyready-panel-height: 0px` |
| 3D mode, day | KSFO 28R short final, real physics + stub | panel over the 3D view; IAS 65 / ALT 513 / HDG 281 M matched the truth HUD; stub VOR tuned 115.80 → "SFO", 2.2 NM |
| 3D mode, night, lights 0.7 | scripted take-off from KSFO 28R, paused at 300 ft | truth 87.4 kt / 316 ft / +1,028 fpm / 2,506 rpm; needle angles read back from the page: airspeed 150.6° (= 87 kt on the scale), altimeter 113.6° / 11.4° / 1.1° (= 316 ft), VSI 2.9° past 12 o'clock (= about +1,000), tachometer 418.4° (= 2,506 rpm); 22–32 fps reported by the dev HUD under software rendering |

**Scripted interaction checks in the browser** (`--eval`, synthetic pointer / wheel / key events,
asserting `sim.controls`): 60 checks, all passed with mouse pointers at 1280 × 720 and again with
touch pointers on the 820 × 1180 tablet profile. They cover: COM/NAV flip-flop; tuning steps and
wrap limits (136.975 → 136.000, 136 → 118 MHz, 117.95 → 117.00, 117 → 108); knob wheel, drag and
click halves; press-and-hold repeat and stop; Kollsman knob and window text; OBS wrap through
north and Shift = 10°; heading bug; DG card knob; `dg-align` and `nav1-ident-toggle` emitted; flap
lever tap / drag / wheel; ignition START only while pressed (both ways of operating the key);
master switch interlock; lights, pitot heat, dimmer; radios dead without avionics power (and the
pilot told why); transponder digits and mode; throttle, mixture, carb heat, trim, fuel selector,
parking brake; Enter operates a focused control, Space is not handled, no focus kept after a
press; explain mode blocks controls and opens the right card (incl. the two halves of the oil
gauge); hide / show; requestAnimationFrame requests drop while hidden.
Tab bar: tab click scrolls to the page, a swipe selects the nearest tab, "Less / More" switches
`side` ↔ `row`.

**Performance**: the panel's own per-frame JavaScript (38 updaters) measured 0.13 ms with still
values, about 0.3 ms with every needle animating and 0.44 ms in the 3D page, on a heavily loaded
shared machine (`panelStats.frameMs`, smoothed; this does not include the browser's own SVG
painting, which was not measured). DOM writes are skipped when a value has not changed.

Not verified: real touch hardware (only synthetic touch pointer events), Safari / Firefox, screen
readers, the real instruments / systems / nav / audio modules (they did not exist yet).

## 6. Known limitations / still unrealistic

- One NAV/COM, one VOR indicator, no ADF, no glideslope/ILS needle, no audio panel, no COM volume
  or squelch, no transponder IDENT button or reply light.
- The annunciator set (LOW VOLTS, LOW VACUUM, L/R FUEL LOW) is the style of newer Cessnas, not a
  1981 172P; the STALL light is a simulator aid and is labelled so. Thresholds 24.5 V, 3.5 inHg,
  5 gal are typical values chosen for the simulator.
- The clock/OAT is a modern digital unit; the EGT scale is 50 °F per mark (a real one is 25 °F);
  the tachometer green arc is one arc (the real one is stepped by altitude); fuel "F" is drawn at
  20 gal a side.
- The attitude indicator's adjustment knob and the turn coordinator's roll response are not
  modelled by the panel (it draws what `state.ind` gives it). The compass card does not tilt or bob.
- Needle smoothing, lag and failures are the instruments module's job; the panel adds none.
- Push-pull knobs are drawn sliding up and down (in the aircraft they move toward you); the trim
  wheel is beside the panel rather than on a pedestal; the fuel selector is on the panel rather
  than on the floor.
- Touch targets in the phone layouts are small (tuning buttons about 24 px including the invisible
  margin); dragging the knobs is easier than tapping there. `touch-action` on SVG children is
  backed up by a `touchmove` guard, but was not tried on a real phone.
- Metric altimeter (`settings.units = "metric-alt"`) and hPa in the Kollsman window are not
  supported — feet and inHg only.
- No sound of its own; no tooltips beyond `aria-label`s; text is English only.
- The explanations were not reviewed by a flight instructor (see §4).

## 7. Shared-file changes

- `src/core/types.ts`: added `"nav1-ident-toggle"` to `CommandId` (additive, one line + comment).

Nothing else outside `src/panel/**`, `dev/panel.*`, `tests/panel/**`, `docs/notes/panel.md`.

## 8. Ideas not done

- NAV/COM 2 + VOR 2 (state and controls already exist: `nav2`, `com2`, `obs2`) — e.g. a denser
  "extra-wide" layout for screens ≥ 1700 px, or a fourth drawer page.
- ADF, ILS glideslope, audio panel, transponder IDENT.
- hPa / metric option, a second language.
- Dragging on the radio digits to tune; larger phone-specific radio page.
- Subtle glass reflections and needle shadows; compass card tilt; AI cage knob.
- A "press to test" for the annunciators; a printed V-speed placard.
- Letting the views module draw the panel inside the 3D cockpit instead of as an overlay.
