/**
 * Sample / test cockpit — exercises every part, every screen component and every control
 * binding kind. Not listed in COCKPITS; load with `loadCockpit("sample")`.
 * It is a "parts lab", not a real aircraft layout.
 */
import * as THREE from "three";
import type { SimEngine } from "@/sim/engine";
import type {
  CockpitBuild,
  CockpitDefinition,
  Hotspot,
  InstrumentScreen,
  ScreenComponent,
} from "../types";
import {
  GAUGES,
  MAT,
  analogClock,
  cabinShell,
  cdu,
  circuitBreakerRow,
  controlStick,
  displayBezel,
  domeLight,
  dualGauge,
  fireExtinguisher,
  flapSelector,
  fuelSelector,
  gaugeBezel,
  gearLever,
  glareshield,
  group,
  ignitionSwitch,
  mergeStatic,
  panelBlock,
  panelWithCutouts,
  placard,
  pushButton,
  pushPullKnob,
  quadrantHousing,
  quadrantLever,
  rivetLine,
  rockerSwitch,
  rotaryKnob,
  rotarySelector,
  roundedBox,
  rudderPedals,
  screws,
  seat,
  sideStick,
  steamGauge,
  toggleSwitch,
  trimWheel,
  wetCompass,
  windshieldFrame,
  yoke,
  type Cutout,
} from "../parts";

const FUEL = ["left", "both", "right", "off"] as const;

function build(): CockpitBuild {
  const root = group("sample-root");
  const hotspots: Hotspot[] = [];
  const screens: InstrumentScreen[] = [];
  const decor = group("decor"); // static → merged at the end

  // ---------------------------------------------------------------- cabin
  decor.add(
    cabinShell({
      centerX: 0.3,
      halfWidth: 0.95,
      floorY: -1.15,
      ceilingY: 0.52,
      frontZ: -1.05,
      rearZ: 0.95,
      sillY: -0.12,
      windowTopY: 0.4,
      windowFrontZ: -0.7,
      windowRearZ: 0.55,
    }),
  );
  root.add(
    windshieldFrame({
      centerX: 0.3,
      bottomY: 0.06,
      topY: 0.48,
      bottomZ: -0.9,
      topZ: -0.5,
      halfWidthBottom: 0.92,
      halfWidthTop: 0.85,
      centerPost: true,
      glass: true,
    }),
  );
  const gs = glareshield({ width: 1.84, depth: 0.28, lip: 0.05 });
  gs.position.set(0.3, 0.06, -0.8);
  decor.add(gs);
  const dome = domeLight();
  dome.position.set(0.3, 0.5, 0.0);
  decor.add(dome);
  const ext = fireExtinguisher();
  ext.position.set(0.85, -1.15, 0.45);
  decor.add(ext);
  const console = roundedBox(0.16, 0.5, 0.9, MAT.panelPaint(0x30343a), 0.02);
  console.position.set(-0.52, -0.9, -0.2);
  decor.add(console);
  decor.add(
    rivetLine(new THREE.Vector3(-0.64, -0.1, -0.7), new THREE.Vector3(-0.64, -0.1, 0.5), 18),
  );

  // ---------------------------------------------------------------- main panel
  const panel = group("panel");
  panel.position.set(0.3, -0.29, -0.78);
  root.add(panel);
  const holes: Cutout[] = [];
  const R = 0.038;
  const round = (id: ScreenComponent, x: number, y: number, label: string) => {
    holes.push({ x, y, r: R });
    const bz = gaugeBezel({ radius: R });
    bz.position.set(x, y, 0);
    panel.add(bz);
    screens.push({
      id,
      component: id,
      position: new THREE.Vector3(x, y, -0.004),
      rotation: new THREE.Euler(),
      widthM: R * 2,
      heightM: R * 2,
      pixelWidth: 220,
      hotspotId: `scr-${id}`,
      parent: panel,
    });
    hotspots.push({
      id: `scr-${id}`,
      label,
      category: "flight-instruments",
      what: `${label} (live).`,
      how: "Rendered by the SkyReady avionics library.",
      object: bz,
    });
  };
  const rect = (
    id: ScreenComponent,
    x: number,
    y: number,
    w: number,
    h: number,
    px: number,
    label: string,
  ) => {
    holes.push({ x, y, w, h, r: 0.003 });
    screens.push({
      id,
      component: id,
      position: new THREE.Vector3(x, y, -0.004),
      rotation: new THREE.Euler(),
      widthM: w,
      heightM: h,
      pixelWidth: px,
      hotspotId: `scr-${id}`,
      parent: panel,
    });
    const frame = group(`frame-${id}`);
    frame.position.set(x, y, 0);
    panel.add(frame);
    hotspots.push({
      id: `scr-${id}`,
      label,
      category: id === "radios" || id === "com-nav" || id === "xpdr" ? "radios" : "navigation",
      what: `${label} (live).`,
      how: "Use the on-screen knobs and buttons directly.",
      object: frame,
    });
  };
  round("asi", -0.74, 0.22, "Airspeed indicator");
  round("ai", -0.64, 0.22, "Attitude indicator");
  round("alt", -0.54, 0.22, "Altimeter");
  round("tc", -0.74, 0.12, "Turn coordinator");
  round("hi", -0.64, 0.12, "Heading indicator");
  round("vsi", -0.54, 0.12, "Vertical speed indicator");
  round("vor1", 0.4, 0.22, "VOR 1");
  round("vor2", 0.5, 0.22, "VOR 2");
  round("hsi", 0.6, 0.22, "HSI");
  round("adf", 0.7, 0.22, "ADF");
  round("ils", 0.8, 0.22, "ILS indicator");
  rect("compass", 0.42, 0.11, 0.08, 0.08, 220, "Magnetic compass");
  rect("dme", 0.62, 0.11, 0.14, 0.06, 300, "DME");
  rect("mfd", 0.0, 0.14, 0.26, 0.2, 640, "MFD");
  rect("radios", -0.2, -0.07, 0.22, 0.15, 420, "Radio stack");
  rect("com-nav", 0.05, -0.07, 0.2, 0.11, 420, "COM/NAV");
  rect("xpdr", 0.3, -0.07, 0.2, 0.06, 420, "Transponder");
  rect("gps", 0.62, -0.05, 0.28, 0.17, 560, "GPS navigator");
  rect("switches", -0.6, -0.25, 0.3, 0.1, 520, "Switch panel");
  rect("annunciators", -0.26, -0.25, 0.3, 0.06, 520, "Annunciators");
  rect("engine", 0.08, -0.23, 0.26, 0.14, 520, "Engine gauges");
  rect("autopilot", 0.42, -0.25, 0.3, 0.09, 560, "Autopilot");
  rect("sixpack", 0.75, -0.23, 0.2, 0.15, 520, "Six-pack");

  // PFD inside a 3D display bezel (screen pose relative to the bezel via `parent`)
  holes.push({ x: -0.3, y: 0.14, w: 0.3, h: 0.24, r: 0.006 });
  const pfdBezel = displayBezel({
    width: 0.3,
    height: 0.24,
    screenWidth: 0.25,
    screenHeight: 0.17,
    screenOffset: [0, 0.018],
    softkeys: 6,
    softkeyLabels: ["CDI", "HDG", "BARO−", "BARO+", "STD", "TMR"],
    knobs: [
      [-0.137, 0.08],
      [0.137, 0.08],
    ],
  });
  pfdBezel.group.position.set(-0.3, 0.14, 0.012);
  panel.add(pfdBezel.group);
  screens.push({
    id: "pfd",
    component: "pfd",
    position: pfdBezel.screen.position.clone(),
    rotation: new THREE.Euler(),
    widthM: pfdBezel.screen.width,
    heightM: pfdBezel.screen.height,
    pixelWidth: 620,
    hotspotId: "scr-pfd",
    parent: pfdBezel.group,
  });
  hotspots.push({
    id: "scr-pfd",
    label: "Primary flight display",
    category: "flight-instruments",
    what: "Attitude, airspeed, altitude and heading on one screen.",
    how: "Scan the centre, then the tapes.",
    object: pfdBezel.group,
  });

  // 3D steam gauges (needles driven in animate)
  const tach = steamGauge(GAUGES.tach(), { radius: 0.032 });
  const fuelG = dualGauge(GAUGES.fuelQty(28, "L"), GAUGES.fuelQty(28, "R"), { radius: 0.032 });
  const suction = steamGauge(GAUGES.suction(), { radius: 0.026 });
  const clock = analogClock({ radius: 0.026, style: "vintage" });
  const steam: Array<[THREE.Group, number, number, number]> = [
    [tach.group, -0.74, -0.04, 0.032],
    [fuelG.group, -0.64, -0.04, 0.032],
    [suction.group, -0.55, -0.04, 0.026],
    [clock.group, -0.47, -0.04, 0.026],
  ];
  for (const [g, x, y, r] of steam) {
    holes.push({ x, y, r });
    g.position.set(x, y, 0);
    panel.add(g);
  }
  hotspots.push({
    id: "tach",
    label: "Tachometer",
    category: "engine",
    what: "Engine RPM.",
    how: "Set power by RPM on a fixed-pitch propeller.",
    object: tach.group,
  });

  const panelMesh = panelWithCutouts({ width: 1.8, height: 0.66, holes, topArch: 0.02 });
  panel.add(panelMesh);
  panel.add(
    screws(
      [
        [-0.88, 0.31],
        [0.88, 0.31],
        [-0.88, -0.31],
        [0.88, -0.31],
      ],
      {},
    ),
  );
  const title = placard("PARTS LAB — EDUCATIONAL SAMPLE", { width: 0.22, color: "#9aa0a6" });
  title.position.set(0, 0.3, 0.0004);
  panel.add(title);

  // ---------------------------------------------------------------- lower switch panel
  const lower = panelBlock({ width: 1.0, height: 0.17, title: "LOWER PANEL" });
  lower.position.set(0.0, -0.7, -0.76);
  root.add(lower);
  const master = rockerSwitch({ split: true, labels: ["BAT", "ALT"] });
  master.group.position.set(-0.42, -0.01, 0);
  lower.add(master.group);
  const [bat, alt] = master.halves;
  if (bat)
    hotspots.push({
      id: "master-bat",
      label: "Master switch (BAT)",
      category: "electrical",
      what: "Connects the battery to the electrical bus.",
      how: "ON before engine start; OFF after shutdown.",
      object: bat.group,
      control: {
        kind: "toggle",
        get: (s) => s.controls.masterBattery,
        set: (e, on) => e.setControls({ masterBattery: on }),
      },
    });
  if (alt)
    hotspots.push({
      id: "master-alt",
      label: "Master switch (ALT)",
      category: "electrical",
      what: "Brings the alternator online.",
      how: "Normally on with BAT.",
      object: alt.group,
      control: {
        kind: "toggle",
        get: (s) => s.controls.alternator,
        set: (e, on) => e.setControls({ alternator: on }),
      },
    });
  const pitot = toggleSwitch({ guarded: true, label: "PITOT HT" });
  pitot.group.position.set(-0.33, -0.01, 0);
  lower.add(pitot.group);
  hotspots.push({
    id: "pitot-heat",
    label: "Pitot heat",
    category: "electrical",
    what: "Heats the pitot tube to prevent icing.",
    how: "ON in visible moisture near freezing.",
    object: pitot.group,
    control: {
      kind: "toggle",
      get: (s) => s.controls.pitotHeat,
      set: (e, on) => e.setControls({ pitotHeat: on }),
    },
  });
  const beacon = toggleSwitch({ style: "paddle", label: "BCN" });
  beacon.group.position.set(-0.27, -0.01, 0);
  lower.add(beacon.group);
  hotspots.push({
    id: "beacon",
    label: "Beacon",
    category: "lighting",
    what: "Anti-collision beacon.",
    how: "ON before engine start.",
    object: beacon.group,
    control: {
      kind: "toggle",
      get: (s) => s.controls.lights.beacon,
      set: (e, on) => e.setControls({ lights: { ...e.getControls().lights, beacon: on } }),
    },
  });
  // ignition key — rotary
  const ign = ignitionSwitch();
  ign.group.position.set(-0.18, -0.01, 0);
  lower.add(ign.group);
  let magIdx = 3;
  hotspots.push({
    id: "ignition",
    label: "Magneto / ignition switch",
    category: "engine",
    what: "Selects magnetos and engages the starter.",
    how: "BOTH for flight; START to crank (spring-loaded back to BOTH).",
    object: ign.group,
    control: {
      kind: "rotary",
      positions: ign.positions,
      get: () => magIdx,
      set: (e: SimEngine, i: number) => {
        magIdx = i;
        if (i === 0) e.stopEngine();
        if (i === 4) {
          e.startEngine();
          magIdx = 3;
        }
      },
      moving: ign.moving,
      step: ign.step,
    },
  });
  // panel lights — rotary selector
  const lightsSel = rotarySelector({ positions: ["OFF", "ON"], stepDeg: 60 });
  lightsSel.group.position.set(-0.08, -0.01, 0);
  lower.add(lightsSel.group);
  hotspots.push({
    id: "panel-lights",
    label: "Panel lights",
    category: "lighting",
    what: "Instrument/panel lighting.",
    how: "ON at night.",
    object: lightsSel.group,
    control: {
      kind: "rotary",
      positions: lightsSel.positions,
      get: (s) => (s.controls.lights.panel ? 1 : 0),
      set: (e, i) => e.setControls({ lights: { ...e.getControls().lights, panel: i === 1 } }),
      moving: lightsSel.moving,
      step: lightsSel.step,
    },
  });
  // push-pull controls — levers
  const throttle = pushPullKnob({ style: "throttle", label: "" });
  throttle.group.position.set(0.02, -0.01, 0);
  lower.add(throttle.group);
  hotspots.push({
    id: "throttle",
    label: "Throttle",
    category: "engine",
    what: "Controls engine power.",
    how: "Push in for more power, pull out to reduce.",
    object: throttle.group,
    control: {
      kind: "lever",
      get: (s) => s.controls.throttle,
      set: (e, v) => e.setControls({ throttle: v }),
      axis: throttle.axis,
      travel: throttle.travel,
      moving: throttle.moving,
    },
  });
  const mixture = pushPullKnob({ style: "mixture" });
  mixture.group.position.set(0.1, -0.01, 0);
  lower.add(mixture.group);
  hotspots.push({
    id: "mixture",
    label: "Mixture",
    category: "engine",
    what: "Fuel/air ratio.",
    how: "Full rich for start and takeoff; lean in cruise.",
    object: mixture.group,
    control: {
      kind: "lever",
      get: (s) => s.controls.mixture,
      set: (e, v) => e.setControls({ mixture: v }),
      axis: mixture.axis,
      travel: mixture.travel,
      moving: mixture.moving,
    },
  });
  const carb = pushPullKnob({ style: "carb-heat", label: "CARB" });
  carb.group.position.set(0.17, -0.01, 0);
  lower.add(carb.group);
  hotspots.push({
    id: "carb-heat",
    label: "Carburetor heat",
    category: "engine",
    what: "Hot air to melt carburetor ice.",
    how: "Pull ON when suspecting carb ice.",
    object: carb.group,
    control: {
      kind: "lever",
      get: (s) => (s.controls.carbHeat ? 0 : 1),
      set: (e, v) => e.setControls({ carbHeat: v < 0.5 }),
      axis: carb.axis,
      travel: carb.travel,
      moving: carb.moving,
      detents: [0, 1],
    },
  });
  const primer = pushPullKnob({ style: "primer" });
  primer.group.position.set(0.23, -0.01, 0);
  lower.add(primer.group);
  hotspots.push({
    id: "primer",
    label: "Primer",
    category: "engine",
    what: "Sprays fuel into the cylinders for cold starts.",
    how: "Unlock, pump as required, lock.",
    object: primer.group,
    control: { kind: "button", press: () => undefined },
  });
  const flaps = flapSelector();
  flaps.group.position.set(0.31, 0.0, 0);
  lower.add(flaps.group);
  hotspots.push({
    id: "flaps",
    label: "Flap selector",
    category: "flight-controls",
    what: "Sets the wing flaps.",
    how: "Select one notch at a time within the white arc.",
    object: flaps.group,
    control: {
      kind: "lever",
      get: (s) => s.controls.flapIndex / 3,
      set: (e, v) => e.setControls({ flapIndex: Math.round(v * 3) }),
      axis: flaps.axis,
      travel: flaps.travel,
      moving: flaps.moving,
      detents: flaps.detents,
    },
  });
  const gear = gearLever();
  gear.group.position.set(0.39, 0.0, 0);
  lower.add(gear.group);
  const apBtn = pushButton({ label: "AP", color: "green", backlit: true });
  apBtn.group.position.set(-0.04, 0.035, 0);
  lower.add(apBtn.group);
  hotspots.push({
    id: "ap",
    label: "Autopilot engage",
    category: "autopilot",
    what: "Engages the autopilot servos.",
    how: "Press to engage/disengage.",
    object: apBtn.group,
    control: { kind: "button", press: (e) => e.apToggle() },
  });
  const hdg = rotaryKnob({ style: "concentric", label: "HDG" });
  hdg.group.position.set(-0.13, 0.035, 0);
  lower.add(hdg.group);
  hotspots.push({
    id: "hdg-bug",
    label: "Heading bug knob",
    category: "autopilot",
    what: "Sets the heading bug.",
    how: "Scroll or click (shift-click = left).",
    object: hdg.group,
    control: {
      kind: "knob",
      turn: (e, dir) => e.setRadios({ hdgBug: e.getSnapshot().radios.hdgBug + dir * 5 }),
    },
  });
  const knurl = rotaryKnob({ style: "pointer", label: "DIM" });
  knurl.group.position.set(-0.22, 0.035, 0);
  lower.add(knurl.group);
  const cb = circuitBreakerRow({
    labels: ["FLAP", "INST", "NAV", "COM", "XPDR", "LTS"],
    amps: [15, 5, 5, 5, 5, 10],
  });
  cb.position.set(-0.32, -0.062, 0);
  lower.add(cb);

  // ---------------------------------------------------------------- pedestal & quadrant
  const quad = quadrantHousing({
    width: 0.24,
    height: 0.12,
    depth: 0.2,
    slots: [-0.07, -0.025, 0.025, 0.07],
    labels: ["PWR", "PROP", "MIX", "THR"],
  });
  quad.position.set(0.3, -0.62, -0.55);
  root.add(quad);
  const power = quadrantLever({ knob: "power" });
  const prop = quadrantLever({ knob: "prop" });
  const mix2 = quadrantLever({ knob: "mixture" });
  const thrust = quadrantLever({ knob: "thrust", length: 0.15 });
  [power, prop, mix2, thrust].forEach((l, i) => {
    l.group.position.set([-0.07, -0.025, 0.025, 0.07][i] ?? 0, 0.0, 0);
    quad.add(l.group);
  });
  hotspots.push({
    id: "power-lever",
    label: "Power lever",
    category: "engine",
    what: "Quadrant-style throttle.",
    how: "Forward for more power.",
    object: power.group,
    control: {
      kind: "lever",
      get: (s) => s.controls.throttle,
      set: (e, v) => e.setControls({ throttle: v }),
      axis: power.axis,
      travel: power.travel,
      moving: power.moving,
      arc: power.arc,
    },
  });
  const flapLever = quadrantLever({ knob: "flap", length: 0.1 });
  flapLever.group.position.set(0.45, -0.62, -0.5);
  root.add(flapLever.group);
  const sb = quadrantLever({ knob: "speedbrake", length: 0.1 });
  sb.group.position.set(0.15, -0.62, -0.5);
  root.add(sb.group);
  const pedestalCdu = cdu();
  pedestalCdu.position.set(0.3, -0.66, -0.33);
  pedestalCdu.rotation.x = -1.0;
  root.add(pedestalCdu);
  const trim = trimWheel();
  trim.group.position.set(0.15, -0.8, -0.32);
  root.add(trim.group);
  hotspots.push({
    id: "trim",
    label: "Elevator trim wheel",
    category: "flight-controls",
    what: "Relieves control pressure.",
    how: "Roll forward for nose down, back for nose up.",
    object: trim.group,
    control: {
      kind: "knob",
      turn: (e, dir) => e.setControls({ trim: e.getControls().trim + dir * 0.05 }),
    },
  });
  const fuel = fuelSelector();
  fuel.group.position.set(0.3, -1.14, -0.05);
  root.add(fuel.group);
  hotspots.push({
    id: "fuel-selector",
    label: "Fuel selector",
    category: "fuel",
    what: "Selects which tank feeds the engine.",
    how: "BOTH for takeoff and landing.",
    object: fuel.group,
    control: {
      kind: "rotary",
      positions: fuel.positions,
      get: (s) => Math.max(0, FUEL.indexOf(s.controls.fuelSelector)),
      set: (e, i) => e.setControls({ fuelSelector: FUEL[i] ?? "both" }),
      moving: fuel.moving,
      step: fuel.step,
    },
  });

  // ---------------------------------------------------------------- flight controls
  const yk = yoke({ style: "ram-horn" });
  yk.group.position.set(0, -0.42, -0.78);
  root.add(yk.group);
  hotspots.push({
    id: "yoke",
    label: "Control yoke",
    category: "flight-controls",
    what: "Pitch and roll control.",
    how: "Pull to pitch up, turn to bank.",
    object: yk.group,
  });
  const yk2 = yoke({ style: "w" });
  yk2.group.position.set(0.6, -0.42, -0.78);
  root.add(yk2.group);
  const stick = controlStick({ style: "vintage" });
  stick.group.position.set(0.95, -1.15, -0.2);
  root.add(stick.group);
  const side = sideStick();
  side.group.position.set(-0.45, -0.55, -0.15);
  root.add(side.group);
  const pedals = rudderPedals();
  pedals.group.position.set(0, -0.92, -0.78);
  root.add(pedals.group);
  hotspots.push({
    id: "pedals",
    label: "Rudder pedals",
    category: "flight-controls",
    what: "Yaw control and toe brakes.",
    how: "Push the pedal on the side you want the nose to go.",
    object: pedals.group,
  });
  const leftSeat = seat({ style: "fabric" });
  leftSeat.position.set(0, -1.15, 0.15);
  const rightSeat = seat({ style: "leather" });
  rightSeat.position.set(0.6, -1.15, 0.15);
  root.add(leftSeat, rightSeat);

  const compass = wetCompass();
  compass.group.position.set(0.3, 0.42, -0.6);
  root.add(compass.group);
  hotspots.push({
    id: "wet-compass",
    label: "Magnetic compass",
    category: "navigation",
    what: "Standby direction reference.",
    how: "Read only in straight, unaccelerated flight.",
    object: compass.group,
  });

  root.add(mergeStatic(decor));

  return {
    root,
    hotspots,
    screens,
    eye: { position: new THREE.Vector3(0, 0, 0), target: new THREE.Vector3(0.05, -0.3, -0.78) },
    inspect: {
      position: new THREE.Vector3(0.3, -0.12, 0.25),
      target: new THREE.Vector3(0.3, -0.3, -0.78),
    },
    eyeHeightM: 1.5,
    animate(s) {
      const c = s.controls;
      const a = s.aircraft;
      yk.update(c.elevator, c.aileron);
      yk2.update(c.elevator, c.aileron);
      stick.update(c.elevator, c.aileron);
      side.update(c.elevator, c.aileron);
      pedals.update(c.rudder, c.brakes);
      tach.set(a.rpm);
      fuelG.setAt(0, a.fuelLeftGal);
      fuelG.setAt(1, a.fuelRightGal);
      suction.set(a.vacuumInHg);
      clock.setTime(s.weather.timeOfDay * 3600 + a.simTimeSec);
      compass.set(s.indicated.compass);
      trim.set(c.trim);
      apBtn.setLit(s.ap.engaged);
      gear.moving.position.y = c.gearDown ? -gear.travel / 2 : gear.travel / 2;
      thrust.moving.rotation.x = 0.44 - c.throttle * 0.87;
    },
  };
}

const definition: CockpitDefinition = {
  id: "sample",
  name: "Parts lab (sample)",
  era: "classic",
  years: "—",
  represents: "Test layout exercising every part; not a real aircraft",
  perfId: "c172",
  panel: "steam",
  summary: "Developer sample for the cockpit runtime.",
  aircraftIds: [],
  tours: [
    {
      id: "basics",
      title: "Basics",
      summary: "Master, throttle, ignition.",
      steps: [
        {
          hotspotId: "master-bat",
          text: "Turn the battery master ON.",
          check: (s) => s.controls.masterBattery,
        },
        { hotspotId: "throttle", text: "Set the throttle about ¼ in." },
        { hotspotId: "ignition", text: "Magnetos to BOTH." },
      ],
    },
  ],
  build,
};

export default definition;
