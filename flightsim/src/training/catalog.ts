/**
 * The tests. All of them use the Cessna 172P (the aircraft this simulator is tuned for).
 *
 * Speeds are the Cessna 172P's (KIAS): best glide 65, rotate 55, approach 65, manoeuvring speed
 * 99 at maximum weight. Tolerances are generous for a learning aid; they are not the FAA's
 * checkride standards (those are in the Airman Certification Standards).
 */
import {
  atMark,
  band,
  climbTo,
  gentleTouchdown,
  ias,
  landOnRunway,
  never,
  noCrash,
  noDriftTouchdown,
  noStall,
  objective,
  onAnyRunway,
  reportFailure,
  since,
  stallRecovery,
  steepTurn,
  stopOnRunway,
  touchdownsAfter,
  wingsLevelTouchdown,
  within,
  wrapDeg,
} from "./objectives";
import type { TestContext, TestDef, TestEvent } from "./types";

/** Stop a landing test a few seconds after the aircraft has stopped. */
function stoppedAfterLanding(ctx: TestContext): string | null {
  const s = ctx.sim.state;
  if (!ctx.touchdowns.length || !s.onGround || s.gsKt > 2) {
    delete ctx.memo.stoppedAt;
    return null;
  }
  ctx.memo.stoppedAt ??= ctx.t;
  return ctx.t - ctx.memo.stoppedAt > 3 ? "Landed and stopped." : null;
}

/** Set a failure once, at a moment, and remember when ("failure"). */
function failAt(when: (ctx: TestContext) => boolean, apply: (ctx: TestContext) => void, message?: string): TestEvent {
  return {
    when,
    run(ctx) {
      apply(ctx);
      ctx.marks.failure = ctx.t;
      if (message) ctx.sim.message(message, "warn", true);
    },
  };
}

const altAtMark = (ctx: TestContext, key: string) => ctx.memo[key] ?? ctx.sim.state.altMslFt;
const hdgAtMark = (ctx: TestContext, key: string) => ctx.memo[key] ?? ctx.sim.state.headingTrue;

export const TESTS: readonly TestDef[] = [
  // ============================================================ PREFLIGHT
  {
    id: "walkaround",
    category: "preflight",
    title: "Walk-around inspection",
    summary: "Inspect the aircraft before flight, find what is wrong, and decide whether it is safe to fly.",
    minutes: 5,
    briefing: [
      "Walk around the Cessna 172 as you would before every flight.",
      "For each item, read what you find and mark it OK or PROBLEM.",
      "Some attempts hide several problems, some none at all.",
      "Then decide: fly as is, fix the problems first, or do not fly (needs a mechanic).",
    ],
    tips: [
      "Use the aircraft's own checklist every time, in the same order — memory misses things.",
      "Anything you can fix on the spot (a cover, a tie-down, water in the fuel) is fixed before flight; damage to the structure, propeller, tyres or controls needs a mechanic.",
      "Missing documents also keep the aircraft on the ground.",
    ],
    walkaround: true,
  },
  {
    id: "start-and-before-takeoff",
    category: "preflight",
    title: "Engine start, run-up and before-take-off check",
    summary: "Start the engine, do the run-up and set the cockpit up for take-off — every switch is checked.",
    minutes: 8,
    briefing: [
      "You are on runway 25R at Livermore (KLVK) with the engine off and the parking brake set.",
      "Before starting: MASTER switch ON, BEACON ON, AVIONICS OFF, fuel selector BOTH, MIXTURE rich, throttle open a little.",
      "Start: turn the magneto key to START, let it go to BOTH when the engine runs. Then AVIONICS ON.",
      "Run-up (parking brake SET): throttle to about 1,700 rpm, check each magneto (key to R, back to BOTH, to L, back to BOTH) and the carburettor heat (pull, then push in).",
      "Before take-off: flaps 0–10°, trim at T/O, carb heat OFF, mixture rich, magnetos BOTH, transponder ALT, altimeter set to the airport's elevation, landing light and strobes ON, parking brake OFF.",
      "Then take off and climb to 500 ft above the ground.",
    ],
    tips: [
      "Read the checklist aloud, item by item, and touch each switch as you check it.",
      "The magneto check finds a fouled plug or a faulty magneto before it matters: expect a small rpm drop on each, and no rough running.",
    ],
    flight: {
      setup: { airport: "KLVK", runway: "25R", kind: "runway", engineRunning: false, weather: "light-breeze", hours: 10 },
      timeLimitSec: 900,
      prepare(sim) {
        const c = sim.controls;
        c.lights.beacon = c.lights.strobe = c.lights.landing = c.lights.taxi = c.lights.nav = false;
        c.avionicsMaster = false;
        c.masterBattery = c.masterAlternator = false;
        c.xpdr.mode = "STBY";
        c.parkingBrake = true;
        c.throttle = 0;
        c.flapIndex = 0;
        c.trim = 0;
        c.mixture = 0;
        c.ignition = 0;
        // the altimeter starts on the last flight's setting
        c.altimeterInHg = Math.round((sim.env.qnhInHg + 0.17) * 100) / 100;
      },
      events: () => [
        { when: (ctx) => ctx.sim.controls.ignition === 4, run: (ctx) => void (ctx.marks.crank = ctx.t) },
        { when: (ctx) => ctx.sim.state.sys.engineRunning, run: (ctx) => void (ctx.marks.started = ctx.t) },
        { when: (ctx) => ctx.sim.state.sys.engineRunning && ctx.sim.state.onGround && ctx.sim.state.rpm > 1500 && ctx.sim.state.gsKt < 3, run: (ctx) => void (ctx.marks.runup = ctx.t) },
        { when: (ctx) => ctx.sim.state.sys.engineRunning && ctx.sim.state.onGround && ctx.sim.controls.throttle >= 0.8 && ctx.sim.state.gsKt > 5, run: (ctx) => void (ctx.marks.roll = ctx.t) },
      ],
      objectives: () => [
        atMark("start-master", "Before start: master switch ON", 1, "crank", (sim) => sim.controls.masterBattery, "Master switch was on.", "The master switch was off when you started — nothing would work after the start.", "You never used the starter."),
        atMark("start-beacon", "Before start: beacon ON (warns people near the propeller)", 1, "crank", (sim) => sim.controls.lights.beacon, "Beacon was on.", "The beacon was off: people near the aircraft had no warning the propeller was about to turn.", "You never used the starter."),
        atMark("start-avionics", "Before start: avionics OFF (protects the radios)", 1, "crank", (sim) => !sim.controls.avionicsMaster, "Avionics were off.", "The avionics were on during the start — the voltage dip can damage the radios.", "You never used the starter."),
        atMark("start-fuel", "Before start: fuel selector BOTH and mixture rich", 1, "crank", (sim) => sim.controls.fuelSelector === "both" && sim.controls.mixture >= 0.9, "Fuel on and mixture rich.", "Fuel selector not on BOTH or mixture not rich.", "You never used the starter."),
        within("started", "Start the engine", 2, null, 300, (sim) => sim.state.sys.engineRunning, (s) => `Engine running after ${Math.round(s)} s.`, "The engine was not started within 5 minutes."),
        atMark("runup-brake", "Run-up with the parking brake SET", 1, "runup", (sim) => sim.controls.parkingBrake, "Parking brake was set for the run-up.", "The parking brake was off at run-up power — the aircraft can creep forward.", "You did not do a run-up (about 1,700 rpm, standing still)."),
        objective("runup-mags", "Run-up: check both magnetos (R, then L, back to BOTH)", 1, {
          pending: "Do it at about 1,700 rpm with the parking brake set.",
          update(o, ctx) {
            const s = ctx.sim.state;
            const ign = ctx.sim.controls.ignition;
            if (s.sys.engineRunning && s.onGround && s.rpm > 1300 && s.gsKt < 3) {
              if (ign === 1) ctx.memo.magR = 1;
              if (ign === 2) ctx.memo.magL = 1;
            }
            if (ctx.memo.magR && ctx.memo.magL && ign === 3 && ctx.marks.roll === undefined) o.pass("Both magnetos checked.");
            if (ctx.marks.roll !== undefined) o.fail(ctx.memo.magR || ctx.memo.magL ? "Only one magneto was checked." : "The magnetos were not checked before take-off.");
          },
        }),
        objective("runup-carb", "Run-up: check the carburettor heat", 1, {
          pending: "Pull the carb heat at run-up power, then push it in.",
          update(o, ctx) {
            const s = ctx.sim.state;
            if (s.sys.engineRunning && s.onGround && s.rpm > 1300 && s.gsKt < 3 && ctx.sim.controls.carbHeat) o.pass("Carburettor heat checked.");
            if (ctx.marks.roll !== undefined) o.fail("The carburettor heat was not checked at the run-up.");
          },
        }),
        atMark("to-flaps", "Take-off: flaps 0–10°", 1, "roll", (sim) => sim.controls.flapIndex <= 1, "Flaps set for take-off.", "Too much flap for a normal take-off."),
        atMark("to-trim", "Take-off: trim at the T/O mark", 1, "roll", (sim) => Math.abs(sim.controls.trim) <= 0.2, "Trim set for take-off.", "The trim was far from the take-off setting — the nose would pitch strongly after lift-off."),
        atMark("to-carb", "Take-off: carburettor heat OFF", 1, "roll", (sim) => !sim.controls.carbHeat, "Carb heat off (full power available).", "Carb heat was on: less power for take-off."),
        atMark("to-mixture", "Take-off: mixture rich", 1, "roll", (sim) => sim.controls.mixture >= 0.9, "Mixture rich.", "The mixture was not fully rich."),
        atMark("to-mags", "Take-off: magnetos BOTH", 1, "roll", (sim) => sim.controls.ignition === 3, "Magnetos on BOTH.", "The key was not on BOTH."),
        atMark("to-fuel", "Take-off: fuel selector BOTH", 1, "roll", (sim) => sim.controls.fuelSelector === "both", "Fuel on BOTH.", "The fuel selector was not on BOTH."),
        atMark("to-brake", "Take-off: parking brake OFF", 1, "roll", (sim) => !sim.controls.parkingBrake, "Parking brake released.", "The parking brake was still on."),
        atMark("to-xpdr", "Take-off: transponder ALT", 1, "roll", (sim) => sim.controls.xpdr.mode === "ALT", "Transponder on ALT.", "The transponder was not on ALT: air traffic control and other aircraft could not see your altitude."),
        atMark("to-altimeter", "Take-off: altimeter set (reads the airport's elevation within 60 ft)", 1, "roll", (sim) => Math.abs(sim.state.ind.alt - sim.state.groundElevFt - 3) <= 60, "Altimeter set correctly.", "The altimeter was not set: turn the knob until it shows the airport's elevation (or set the reported pressure)."),
        atMark("to-lights", "Take-off: landing light and strobes ON", 1, "roll", (sim) => sim.controls.lights.landing && sim.controls.lights.strobe, "Lights on — easier for others to see you.", "Landing light or strobes were off."),
        climbTo(500, 2),
        noStall(1),
        noCrash(),
      ],
      done: (ctx) => (ctx.liftoffAt !== null && ctx.sim.state.aglFt > 520 ? "Climbing through 500 ft." : null),
    },
  },

  // ============================================================ FAILURES
  {
    id: "engine-failure-after-takeoff",
    category: "failures",
    title: "Engine failure after take-off",
    summary: "The engine quits a few hundred feet after take-off. Glide straight ahead and land.",
    minutes: 4,
    briefing: [
      "You are lined up on runway 25R at Livermore (KLVK), engine running. Take off normally (full power, lift off at about 55 kt, climb at 75 kt).",
      "Somewhere between 400 and 700 ft above the ground the engine will stop.",
      "Lower the nose AT ONCE to keep at least 60 kt, then hold the best glide speed: 65 kt.",
      "Land more or less straight ahead (small turns to avoid obstacles are fine). Do NOT try to turn back to the runway.",
      "Report the problem with the button, touch down gently with the wings level.",
    ],
    tips: [
      "The first thing is the nose: below about 60 kt the wing is close to the stall, and a stall this low is not recoverable.",
      "Turning back to the runway (the 'impossible turn') needs far more height than you have — most accidents after an engine failure on take-off happen in that turn.",
      "With time to spare: fuel selector BOTH, mixture rich, carb heat ON, magnetos — then concentrate on the landing.",
    ],
    flight: {
      setup: { airport: "KLVK", runway: "25R", kind: "runway", weather: "calm-clear" },
      timeLimitSec: 420,
      prepare(sim) {
        sim.controls.parkingBrake = false;
        sim.controls.lights.landing = sim.controls.lights.strobe = true;
      },
      events: () => [
        failAt(
          (ctx) => ctx.liftoffAt !== null && ctx.sim.state.aglFt >= 400 + 300 * ctx.rand,
          (ctx) => {
            ctx.sim.state.sys.failures.engine = true;
            ctx.memo.failHdg = ctx.sim.state.headingTrue;
          },
          "The engine has stopped!",
        ),
      ],
      objectives: () => [
        within("glide-quick", "Lower the nose: at or above 60 kt within 8 s", 1, "failure", 8, (sim) => ias(sim) >= 60 && sim.state.pitch < 6, (s) => `Nose down after ${Math.round(s)} s.`, "The speed stayed below 60 kt — that is close to the stall this low."),
        band({ id: "glide-speed", label: "Hold the glide speed (60–75 kt) until the flare", weight: 2, afterMark: "failure", graceSec: 6, active: (ctx) => !ctx.sim.state.onGround && ctx.sim.state.aglFt > 30, value: (sim) => ias(sim), lo: 60, hi: 75, share: 0.7, unit: "kt" }),
        never(
          "no-turn-back",
          "Land ahead — no turn back to the runway (stay within 60° of the take-off heading)",
          2,
          "failure",
          (sim, ctx) => (Math.abs(wrapDeg(sim.state.headingTrue - hdgAtMark(ctx, "failHdg"))) > 60 ? "You turned back toward the airport. From this height the turn back usually ends in a stall-spin; land ahead." : null),
          "You landed ahead.",
          (ctx) => !ctx.sim.state.onGround,
        ),
        reportFailure("engine", 45, 1),
        gentleTouchdown(700, 1, "failure"),
        wingsLevelTouchdown(10, 1, "failure"),
        noStall(2),
        noCrash(),
      ],
      done: stoppedAfterLanding,
    },
  },
  {
    id: "engine-failure-glide",
    category: "failures",
    title: "Engine failure at 2,000 ft — glide to the runway",
    summary: "The engine stops on the approach. Glide to the runway and land on it.",
    minutes: 4,
    briefing: [
      "You are 2,000 ft above the ground, about 2½ miles from runway 25R at Livermore (KLVK), heading for it.",
      "After about 10 seconds the engine will stop.",
      "Set the best glide speed (65 kt) and trim for it. Report the problem.",
      "You will probably arrive too high: lose the extra height with flaps, a slip or S-turns — but do not slow below 60 kt.",
      "Land on the runway.",
    ],
    tips: [
      "Best glide speed gives the longest glide; flying faster or slower both bring you down sooner.",
      "Aim to arrive high and lose height near the runway — you can always lose height, never gain it.",
      "Flaps go down only when you are sure you will make the runway.",
    ],
    flight: {
      setup: { airport: "KLVK", runway: "25R", kind: "air", air: { heightFt: 2000, kias: 90, nmBefore: 2.5 }, weather: "calm-clear" },
      timeLimitSec: 480,
      events: () => [failAt((ctx) => ctx.t >= 10, (ctx) => void (ctx.sim.state.sys.failures.engine = true), "The engine has stopped!")],
      objectives: () => [
        within("glide-set", "Set the glide speed (60–70 kt) within 20 s", 1, "failure", 20, (sim) => ias(sim) >= 60 && ias(sim) <= 70, (s) => `Glide speed set after ${Math.round(s)} s.`, "The glide speed was not set within 20 s."),
        band({ id: "glide-speed", label: "Keep at least 60 kt and at most 85 kt until the flare", weight: 2, afterMark: "failure", graceSec: 20, active: (ctx) => !ctx.sim.state.onGround && ctx.sim.state.aglFt > 30, value: (sim) => ias(sim), lo: 60, hi: 85, share: 0.8, unit: "kt" }),
        reportFailure("engine", 45, 1),
        objective("land-runway", "Land on a runway at Livermore", 3, {
          pending: "Judged at touchdown.",
          update(o, ctx) {
            const td = touchdownsAfter(ctx, "failure")[0];
            if (!td) return;
            const apt = ctx.sim.data.getAirport("KLVK");
            if (apt && onAnyRunway(apt.runways, td.lat, td.lon)) o.pass("You landed on the runway.");
            else o.fail("You landed off the runway. Judge the glide earlier: if the runway stays still in the windshield you will reach it.");
          },
          finish: (o) => o.fail("You did not land."),
        }),
        gentleTouchdown(700, 1, "failure"),
        noStall(1),
        noCrash(),
      ],
      done: stoppedAfterLanding,
    },
  },
  {
    id: "carb-ice",
    category: "failures",
    title: "Partial power loss — carburettor ice",
    summary: "The engine slowly loses power in cruise. Find the cause and fix it.",
    minutes: 4,
    briefing: [
      "You are cruising at 3,000 ft above Livermore on a cool, damp day.",
      "Somewhere along the way the engine will start losing power (the rpm creeps down, the engine may run roughly).",
      "Work out why. The usual cause in these conditions is ice in the carburettor: pull the CARB HEAT knob and leave it out until the engine runs smoothly again.",
      "Keep your altitude (within 200 ft) while you sort it out, and report the problem.",
    ],
    tips: [
      "Carburettor ice can form even at 20 °C when the air is humid; full power rarely ices, reduced power often does.",
      "When you first pull carb heat the engine may run rougher for a moment as the ice melts — leave it on.",
      "The 172's checklist: carb heat ON at the first drop in rpm.",
    ],
    flight: {
      setup: { airport: "KLVK", runway: "25R", kind: "air", air: { heightFt: 3000, kias: 100, nmBefore: 6 }, weather: "overcast-rain" },
      timeLimitSec: 360,
      prepare(sim) {
        sim.controls.carbHeat = false;
      },
      events: () => [
        {
          when: (ctx) => ctx.t >= 15,
          run: (ctx) => {
            ctx.sim.state.sys.failures.carbIce = true;
            ctx.memo.alt0 = ctx.sim.state.altMslFt;
          },
        },
        // the problem becomes noticeable (about 100 rpm down)
        { when: (ctx) => (ctx.sim.state.sys.carbIce ?? 0) > 0.15, run: (ctx) => void (ctx.marks.failure = ctx.t) },
        { when: (ctx) => ctx.marks.failure !== undefined && ctx.sim.controls.carbHeat && ctx.sim.state.sys.carbIce < 0.02, run: (ctx) => void (ctx.marks.cleared = ctx.t) },
      ],
      objectives: () => [
        within("carb-heat", "Carburettor heat ON within 60 s of the rpm starting to drop", 2, "failure", 60, (sim) => sim.controls.carbHeat, (s) => `Carb heat on ${Math.round(s)} s after the rpm started to drop.`, "Carb heat was not applied in time — the ice kept growing."),
        never("carb-heat-hold", "Leave the carb heat on until the ice has melted", 1, "failure", (sim, ctx) => (ctx.memo.heatSeen && !sim.controls.carbHeat && ctx.marks.cleared === undefined ? "The carb heat was pushed in again before the engine ran smoothly." : (sim.controls.carbHeat && (ctx.memo.heatSeen = 1), null)), "Carb heat left on until the engine was clear."),
        band({ id: "alt", label: "Hold your altitude (within 200 ft)", weight: 2, afterMark: "failure", value: (sim) => sim.state.altMslFt, lo: (ctx) => altAtMark(ctx, "alt0") - 200, hi: (ctx) => altAtMark(ctx, "alt0") + 200, share: 0.8, unit: "ft" }),
        reportFailure("carbIce", 120, 1),
        noStall(1),
        noCrash(),
      ],
      done: (ctx) => {
        const s = since(ctx, "cleared");
        return s !== null && s > 45 ? "The engine is running normally again." : null;
      },
    },
  },
  {
    id: "vacuum-failure",
    category: "failures",
    title: "Vacuum failure in cloud (partial panel)",
    summary: "In cloud, the attitude and heading indicators quietly fail. Notice it and keep flying.",
    minutes: 6,
    briefing: [
      "You are flying inside a cloud layer at 3,000 ft above Livermore — no view outside, only the instruments.",
      "At some point the vacuum pump will fail. The attitude indicator and the heading indicator will slowly drift and give wrong information. The LOW VACUUM light and the suction gauge show it.",
      "Recognise it, report it, and keep the aircraft level using the instruments that still work: turn coordinator, airspeed, altimeter, vertical speed, compass.",
      "Hold your altitude (±200 ft) and heading (±20°), and never bank more than 30°.",
    ],
    tips: [
      "Cover the failed instruments (a sticky note in real life) so they cannot mislead you.",
      "Keep the turn coordinator's wings level and the altimeter steady; make only small, slow changes.",
      "Scan the suction gauge in every scan — that is how you notice a vacuum failure early.",
    ],
    flight: {
      setup: { airport: "KLVK", runway: "25R", kind: "air", air: { heightFt: 3000, kias: 100, nmBefore: 6 }, weather: "overcast-rain" },
      timeLimitSec: 420,
      events: () => [
        failAt(
          (ctx) => ctx.t >= 30 + 30 * ctx.rand,
          (ctx) => {
            ctx.sim.state.sys.failures.vacuum = true;
            ctx.memo.alt0 = ctx.sim.state.altMslFt;
            ctx.memo.hdg0 = ctx.sim.state.headingTrue;
          },
        ),
      ],
      objectives: () => [
        reportFailure("vacuum", 150, 2),
        band({ id: "alt", label: "Hold your altitude (within 200 ft)", weight: 2, afterMark: "failure", value: (sim) => sim.state.altMslFt, lo: (ctx) => altAtMark(ctx, "alt0") - 200, hi: (ctx) => altAtMark(ctx, "alt0") + 200, share: 0.8, unit: "ft" }),
        band({ id: "hdg", label: "Hold your heading (within 20°)", weight: 1, afterMark: "failure", value: (sim, ctx) => Math.abs(wrapDeg(sim.state.headingTrue - hdgAtMark(ctx, "hdg0"))), lo: 0, hi: 20, share: 0.7, unit: "°" }),
        never("bank", "Never bank more than 30°", 1, "failure", (sim) => (Math.abs(sim.state.roll) > 30 ? "The bank went past 30° — the start of a spiral. Level the turn coordinator's wings." : null), "The bank stayed under 30°."),
        noStall(1),
        noCrash(),
      ],
      done: (ctx) => {
        const s = since(ctx, "failure");
        return s !== null && s > 180 ? "Three minutes of partial-panel flying done." : null;
      },
    },
  },
  {
    id: "alternator-failure",
    category: "failures",
    title: "Electrical failure — alternator stops charging",
    summary: "The alternator fails. Notice the warning signs, report it and save the battery.",
    minutes: 5,
    briefing: [
      "You are cruising at 3,000 ft near Livermore with the radios, lights and pitot heat on.",
      "At some point the alternator will stop charging. The signs: the LOW VOLTS light, and the ammeter showing a discharge.",
      "Report the problem. Then save the battery for the radios and flaps you will need for landing: switch OFF the landing light, taxi light, strobes and pitot heat.",
      "Keep flying the aircraft (altitude within 300 ft) while you do it.",
    ],
    tips: [
      "The battery alone lasts roughly 30–60 minutes, less with everything on — enough to land if you shed load early.",
      "The engine does not need electricity: the magnetos keep it running even with a flat battery.",
      "Real checklist: check the alternator circuit breaker and switch, try resetting the master switch once.",
    ],
    flight: {
      setup: { airport: "KLVK", runway: "25R", kind: "air", air: { heightFt: 3000, kias: 100, nmBefore: 6 }, weather: "light-breeze", hours: 11 },
      timeLimitSec: 420,
      prepare(sim) {
        const c = sim.controls;
        c.masterBattery = c.masterAlternator = c.avionicsMaster = true;
        c.lights.landing = c.lights.taxi = c.lights.strobe = c.lights.nav = c.lights.beacon = true;
        c.pitotHeat = true;
      },
      events: () => [
        failAt(
          (ctx) => ctx.t >= 30 + 30 * ctx.rand,
          (ctx) => {
            ctx.sim.state.sys.failures.alternator = true;
            ctx.memo.alt0 = ctx.sim.state.altMslFt;
          },
        ),
      ],
      objectives: () => [
        reportFailure("alternator", 180, 2),
        within(
          "shed",
          "Save the battery: landing light, taxi light, strobes and pitot heat OFF within 3 minutes",
          2,
          "failure",
          180,
          (sim) => !sim.controls.lights.landing && !sim.controls.lights.taxi && !sim.controls.lights.strobe && !sim.controls.pitotHeat,
          (s) => `Electrical load reduced after ${Math.round(s)} s.`,
          "The big electrical loads were left on, draining the battery.",
        ),
        band({ id: "alt", label: "Keep flying: altitude within 300 ft", weight: 1, afterMark: "failure", value: (sim) => sim.state.altMslFt, lo: (ctx) => altAtMark(ctx, "alt0") - 300, hi: (ctx) => altAtMark(ctx, "alt0") + 300, share: 0.8, unit: "ft" }),
        never("master", "Keep the master switch ON (the radios and flaps need it)", 1, "failure", (sim) => (!sim.controls.masterBattery ? "The master switch was turned off: no radios, flaps or lights." : null), "Master switch kept on."),
        noCrash(),
      ],
      done: (ctx) => {
        const rep = ctx.reports.find((r) => r.kind === "alternator");
        const shed = !ctx.sim.controls.lights.landing && !ctx.sim.controls.lights.taxi && !ctx.sim.controls.lights.strobe && !ctx.sim.controls.pitotHeat;
        const s = since(ctx, "failure");
        if (rep && shed && ctx.t - rep.t > 20) return "Problem identified and the load reduced.";
        return s !== null && s > 240 ? "Four minutes after the failure." : null;
      },
    },
  },
  {
    id: "pitot-icing",
    category: "failures",
    title: "Pitot tube icing — airspeed goes wrong",
    summary: "Ice blocks the pitot tube in cloud. Recognise the wrong airspeed and fix it.",
    minutes: 5,
    briefing: [
      "You are flying in cloud at 3,000 ft near Livermore, close to freezing, with the pitot heat OFF.",
      "Ice will block the pitot tube. The airspeed indicator will stop telling the truth — it may freeze, or change when you climb or descend.",
      "Do not chase it! Hold your altitude with the attitude indicator and a normal power setting.",
      "Turn the PITOT HEAT on (it will melt the ice after a while) and report the problem.",
    ],
    tips: [
      "If the airspeed does something the power and pitch cannot explain, suspect the instrument, not the aircraft.",
      "Pitch + power = performance: a known attitude and rpm give a known speed, whatever the airspeed indicator says.",
      "Turn pitot heat on before you enter visible moisture near freezing.",
    ],
    flight: {
      setup: { airport: "KLVK", runway: "25R", kind: "air", air: { heightFt: 3000, kias: 100, nmBefore: 6 }, weather: "overcast-rain" },
      timeLimitSec: 420,
      prepare(sim) {
        sim.controls.pitotHeat = false;
      },
      events: () => [
        failAt(
          (ctx) => ctx.t >= 30 + 20 * ctx.rand,
          (ctx) => {
            ctx.sim.state.sys.failures.pitot = true;
            ctx.memo.alt0 = ctx.sim.state.altMslFt;
          },
        ),
        // with the pitot heat on, the ice melts after about 20 s
        { when: (ctx) => ctx.marks.failure !== undefined && ctx.sim.controls.pitotHeat && (ctx.memo.heatOnAt ??= ctx.t) !== undefined && ctx.t - ctx.memo.heatOnAt! > 20, run: (ctx) => ((ctx.sim.state.sys.failures.pitot = false), (ctx.marks.cleared = ctx.t), ctx.sim.message("The airspeed indicator is reading normally again.", "info")) },
      ],
      objectives: () => [
        within("pitot-heat", "Pitot heat ON within 90 s", 2, "failure", 90, (sim) => sim.controls.pitotHeat, (s) => `Pitot heat on after ${Math.round(s)} s.`, "Pitot heat was not switched on — the airspeed stayed blocked."),
        band({ id: "alt", label: "Hold your altitude (within 200 ft) — don't chase the airspeed", weight: 2, afterMark: "failure", value: (sim) => sim.state.altMslFt, lo: (ctx) => altAtMark(ctx, "alt0") - 200, hi: (ctx) => altAtMark(ctx, "alt0") + 200, share: 0.8, unit: "ft" }),
        reportFailure("pitot", 150, 1),
        noStall(2),
        noCrash(),
      ],
      done: (ctx) => {
        const s = since(ctx, "cleared");
        return s !== null && s > 30 ? "The pitot tube is clear again." : null;
      },
    },
  },
  {
    id: "radio-failure",
    category: "failures",
    title: "Radio failure — lost communications",
    summary: "Your radios go silent. Recognise it and squawk 7600.",
    minutes: 3,
    briefing: [
      "You are flying at 3,000 ft near Livermore, talking to air traffic control.",
      "At some point your radios will stop working (no sound, the displays go dark).",
      "Report the problem and set the transponder code 7600 — it tells controllers you have lost radio contact.",
      "Keep flying the aircraft (altitude within 300 ft).",
    ],
    tips: [
      "Check the obvious first: volume, frequency, headset plug, avionics switch, circuit breakers.",
      "7600 = radio failure, 7700 = emergency, 7500 = hijack.",
      "Near a towered airport, watch the tower for light-gun signals.",
    ],
    flight: {
      setup: { airport: "KLVK", runway: "25R", kind: "air", air: { heightFt: 3000, kias: 100, nmBefore: 6 }, weather: "light-breeze", hours: 11 },
      timeLimitSec: 300,
      prepare(sim) {
        const c = sim.controls;
        c.masterBattery = c.masterAlternator = c.avionicsMaster = true;
        c.xpdr = { code: "4521", mode: "ALT" };
      },
      events: () => [
        failAt(
          (ctx) => ctx.t >= 20 + 20 * ctx.rand,
          (ctx) => {
            ctx.sim.state.sys.failures.radio = true;
            ctx.memo.alt0 = ctx.sim.state.altMslFt;
          },
        ),
      ],
      objectives: () => [
        reportFailure("radio", 120, 1),
        within("squawk", "Set the transponder to 7600", 2, "failure", 150, (sim) => sim.controls.xpdr.code === "7600", (s) => `7600 set after ${Math.round(s)} s.`, "The transponder was not set to 7600."),
        band({ id: "alt", label: "Keep flying: altitude within 300 ft", weight: 1, afterMark: "failure", value: (sim) => sim.state.altMslFt, lo: (ctx) => altAtMark(ctx, "alt0") - 300, hi: (ctx) => altAtMark(ctx, "alt0") + 300, share: 0.8, unit: "ft" }),
        noCrash(),
      ],
      done: (ctx) => {
        const s = since(ctx, "failure");
        if (ctx.sim.controls.xpdr.code === "7600" && ctx.reports.some((r) => r.kind === "radio") && s !== null && s > 10) return "7600 set and the problem reported.";
        return s !== null && s > 180 ? "Three minutes after the failure." : null;
      },
    },
  },

  // ============================================================ WEATHER
  {
    id: "crosswind-landing",
    category: "weather",
    title: "Crosswind landing (10 kt)",
    summary: "Land with a steady 10-knot wind blowing across the runway.",
    minutes: 3,
    briefing: [
      "You are on a 2-mile final for runway 25R at Livermore (KLVK) with a 10-knot wind straight across the runway.",
      "On final, point the nose a little into the wind (crab) so you track the centre line.",
      "Near the runway, lower the wing into the wind and use opposite rudder to line the nose up with the runway (wing-low / sideslip).",
      "Touch down on the upwind main wheel first, on the centre line, without drifting. Keep the aileron into the wind as you slow down, and stop on the runway.",
    ],
    tips: [
      "The amount of bank is whatever stops the drift; the rudder keeps the nose straight.",
      "Hold aileron into the wind all the way to the stop — the wind can still lift the upwind wing on the ground.",
      "The Cessna 172's demonstrated crosswind is 15 kt.",
    ],
    flight: {
      setup: { airport: "KLVK", runway: "25R", kind: "final", finalNm: 2, weather: "crosswind-10" },
      timeLimitSec: 300,
      objectives: () => [landOnRunway(30, 2), noDriftTouchdown(5, 2), gentleTouchdown(600, 1), wingsLevelTouchdown(12, 1), stopOnRunway(1), noStall(1), noCrash()],
      done: stoppedAfterLanding,
    },
  },
  {
    id: "gusty-landing",
    category: "weather",
    title: "Gusty crosswind landing (15 gusting 25 kt)",
    summary: "A strong, gusty wind across the runway: control the speed and land safely.",
    minutes: 3,
    briefing: [
      "You are on a 2-mile final for runway 28L at Hayward (KHWD). The wind is 15 knots gusting 25, across the runway, and the air is bumpy.",
      "Add half the gust factor to your approach speed: fly 65 + 5 = about 70 kt (65–80 kt is accepted). Use less flap (20°) for better control.",
      "Crab on final, wing-low near the ground, and land on the centre line without drifting. Stop on the runway.",
    ],
    tips: [
      "Gusts change the airspeed suddenly: the extra speed protects you from a stall when a gust dies away.",
      "Make the control inputs as big as needed — and as quick — the wind will not wait.",
      "If it does not look right, go around: there is no prize for landing from a bad approach.",
    ],
    flight: {
      setup: { airport: "KHWD", runway: "28L", kind: "final", finalNm: 2, weather: "gusty-crosswind" },
      timeLimitSec: 300,
      prepare(sim) {
        sim.controls.flapIndex = 2;
      },
      objectives: () => [
        band({ id: "approach-speed", label: "Approach speed 65–80 kt (gust allowance) until the flare", weight: 1, active: (ctx) => !ctx.sim.state.onGround && ctx.sim.state.aglFt > 40 && !ctx.touchdowns.length, value: (sim) => ias(sim), lo: 65, hi: 80, share: 0.7, unit: "kt" }),
        landOnRunway(35, 2),
        noDriftTouchdown(6, 1),
        gentleTouchdown(700, 1),
        stopOnRunway(1),
        noStall(1),
        noCrash(),
      ],
      done: stoppedAfterLanding,
    },
  },
  {
    id: "go-around-fog",
    category: "weather",
    title: "Go-around in low visibility",
    summary: "On final in fog, the tower orders a go-around. Climb away safely.",
    minutes: 3,
    briefing: [
      "You are on a 3-mile final for runway 28L at San Francisco (KSFO) in fog — half a mile visibility, cloud at 300 ft — with full flaps.",
      "At about 400 ft above the ground the tower will call \"Go around!\".",
      "At once: FULL power (carb heat off), raise the nose to stop the descent, then flaps up to 20°. Climb at about 60–65 kt, then raise the rest of the flaps in stages.",
      "Do not let the aircraft sink below 200 ft after the call. Climb to 1,000 ft above the ground.",
    ],
    tips: [
      "Power first, then attitude, then flaps — taking the flaps up too early makes the aircraft sink.",
      "A go-around is a normal manoeuvre, not a failure: any time an approach is not right, go around.",
      "In poor visibility, decide early: if you cannot see the runway at your minimum height, go around.",
    ],
    flight: {
      setup: { airport: "KSFO", runway: "28L", kind: "final", finalNm: 3, weather: "lifr-fog" },
      timeLimitSec: 300,
      events: () => [
        {
          when: (ctx) => ctx.sim.state.aglFt <= 400 && !ctx.sim.state.onGround,
          run: (ctx) => {
            ctx.marks.call = ctx.t;
            ctx.sim.message("Tower: \"Go around! Go around!\"", "warn", true);
          },
        },
      ],
      objectives: () => [
        within("ga-power", "Full power within 4 s of the call", 2, "call", 4, (sim) => sim.controls.throttle >= 0.9 && !sim.controls.carbHeat, (s) => `Full power after ${s.toFixed(1)} s.`, "Full power was not added quickly enough."),
        within("ga-climb", "Stop the descent and climb within 10 s", 2, "call", 10, (sim) => sim.state.vsFpm > 100, (s) => `Climbing after ${Math.round(s)} s.`, "The aircraft was still descending 10 s after the call."),
        never("ga-floor", "Do not sink below 200 ft above the ground after the call", 2, "call", (sim) => (sim.state.aglFt < 200 ? "The aircraft sank below 200 ft — dangerously close to the ground in fog." : null), "Stayed above 200 ft."),
        within("ga-flaps", "Flaps up to 20° or less within 15 s", 1, "call", 15, (sim) => sim.controls.flapIndex <= 2, (s) => `Flaps raised after ${Math.round(s)} s.`, "Full flaps were left down — lots of drag, a poor climb."),
        objective("ga-1000", "Climb to 1,000 ft above the ground", 1, {
          pending: "Keep climbing.",
          update(o, ctx) {
            if (ctx.marks.call !== undefined && ctx.sim.state.aglFt >= 1000) o.pass("Reached 1,000 ft.");
          },
          finish: (o) => o.fail("Did not climb to 1,000 ft."),
        }),
        never("ga-no-land", "Do not land", 1, "call", (_sim, ctx) => (ctx.touchdowns.length ? "You landed — the go-around was ordered." : null), "No landing."),
        noStall(1),
        noCrash(),
      ],
      done: (ctx) => (ctx.marks.call !== undefined && ctx.sim.state.aglFt >= 1050 ? "Climbing through 1,000 ft." : null),
    },
  },
  {
    id: "turbulence",
    category: "weather",
    title: "Turbulence — slow down and hold on",
    summary: "Bumpy thermals: slow to manoeuvring speed and keep the aircraft steady.",
    minutes: 3,
    briefing: [
      "You are cruising at 2,500 ft above Livermore on a hot, bumpy afternoon, at about 110 kt.",
      "In rough air, slow below the manoeuvring speed (about 95 kt at this weight) within 45 s — that protects the airframe from overstress.",
      "Then hold a steady attitude: altitude within 150 ft and heading within 15°. Do not chase every bump.",
    ],
    tips: [
      "Below manoeuvring speed a big gust stalls the wing before it can bend the airframe.",
      "Hold the attitude, not the altitude: let the aircraft ride the up- and down-draughts a little.",
      "Loose objects and seat belts: secure everything before bumpy air.",
    ],
    flight: {
      setup: { airport: "KLVK", runway: "25R", kind: "air", air: { heightFt: 2500, kias: 110, nmBefore: 8 }, weather: "thermals", hours: 15 },
      timeLimitSec: 240,
      prepare(sim, ctx) {
        ctx.memo.alt0 = sim.state.altMslFt;
        ctx.memo.hdg0 = sim.state.headingTrue;
        ctx.marks.start = 0;
      },
      objectives: () => [
        within("va", "Slow below 95 kt within 45 s", 1, "start", 45, (sim) => ias(sim) <= 95, (s) => `Below 95 kt after ${Math.round(s)} s.`, "You stayed above the manoeuvring speed in rough air."),
        band({ id: "va-hold", label: "Stay below 100 kt in the rough air", weight: 1, afterMark: "start", graceSec: 45, value: (sim) => ias(sim), lo: 0, hi: 100, share: 0.85, unit: "kt" }),
        band({ id: "alt", label: "Hold altitude within 150 ft", weight: 2, afterMark: "start", graceSec: 20, value: (sim) => sim.state.altMslFt, lo: (ctx) => altAtMark(ctx, "alt0") - 150, hi: (ctx) => altAtMark(ctx, "alt0") + 150, share: 0.7, unit: "ft" }),
        band({ id: "hdg", label: "Hold heading within 15°", weight: 1, afterMark: "start", graceSec: 10, value: (sim, ctx) => Math.abs(wrapDeg(sim.state.headingTrue - hdgAtMark(ctx, "hdg0"))), lo: 0, hi: 15, share: 0.7, unit: "°" }),
        noStall(1),
        noCrash(),
      ],
      done: (ctx) => (ctx.t > 150 ? "Two and a half minutes of rough air flown." : null),
    },
  },
  {
    id: "hot-high-takeoff",
    category: "weather",
    title: "Hot and high take-off (Leadville, 9,927 ft)",
    summary: "Take off from America's highest airport on a hot day: little power, a long roll.",
    minutes: 4,
    briefing: [
      "You are lined up on runway 16 at Leadville, Colorado (KLXV) — almost 10,000 ft above sea level, and it is a hot day. The air is thin: the engine makes much less power and the wing needs more ground speed.",
      "Before take-off, lean the mixture for best power: at full throttle (brakes on), pull the mixture back slowly until the rpm peaks (it rises, then starts to drop), then enrich it slightly. Do not take off with the mixture fully rich up here.",
      "Release the brakes, keep straight, lift off at about 55 kt indicated, and climb at about 70–75 kt. Climb to 300 ft above the airport without stalling.",
    ],
    tips: [
      "Indicated airspeeds stay the same at altitude; the ground speed (and the runway used) gets much bigger.",
      "Density altitude here is well over 12,000 ft: expect a climb of only a few hundred feet per minute.",
      "Real pilots calculate the take-off distance first — and do not go if it is too long.",
    ],
    flight: {
      setup: { airport: "KLXV", runway: "16", kind: "runway", weather: "hot-high" },
      timeLimitSec: 420,
      prepare(sim) {
        sim.controls.parkingBrake = true;
        sim.controls.mixture = 1;
      },
      events: () => [{ when: (ctx) => ctx.sim.state.onGround && ctx.sim.controls.throttle >= 0.8 && ctx.sim.state.gsKt > 8, run: (ctx) => void (ctx.marks.roll = ctx.t) }],
      objectives: () => [
        atMark(
          "lean",
          "Lean the mixture for best power before the take-off roll",
          2,
          "roll",
          (sim) => sim.controls.mixture >= 0.45 && sim.controls.mixture <= 0.85,
          "Mixture leaned for best power.",
          "The mixture was not set for best power. Here, fully rich gives only about half the power of a well-leaned engine (in this simulator: about 50 hp instead of 87 hp); far too lean loses power too.",
          "You did not start the take-off roll.",
        ),
        climbTo(300, 2),
        band({ id: "climb-speed", label: "Climb at 65–85 kt", weight: 1, active: (ctx) => ctx.liftoffAt !== null && ctx.t - ctx.liftoffAt > 5 && !ctx.sim.state.onGround, value: (sim) => ias(sim), lo: 65, hi: 85, share: 0.7, unit: "kt" }),
        noStall(2),
        noCrash(),
      ],
      done: (ctx) => (ctx.liftoffAt !== null && ctx.sim.state.aglFt > 320 ? "Climbing through 300 ft." : null),
    },
  },

  // ============================================================ FLYING SKILLS
  {
    id: "steep-turn",
    category: "skills",
    title: "Steep turn",
    summary: "A full 360° turn at 45° of bank without gaining or losing height.",
    minutes: 3,
    briefing: [
      "You are at 3,000 ft above Livermore at about 95 kt.",
      "Note your heading and altitude. Roll into a 45° bank (left or right) and add a little power.",
      "As the bank increases, pull back to hold the altitude (the nose sits higher than in level flight).",
      "Turn a full circle and roll out on the heading you started on. Hold altitude within 100 ft and speed within 10 kt.",
    ],
    tips: [
      "Hold the bank with the attitude indicator and the horizon; check the altimeter often.",
      "If you start to lose height, reduce the bank a little first, then pull — pulling alone tightens the turn.",
      "Start rolling out about 20° before the entry heading.",
    ],
    flight: {
      setup: { airport: "KLVK", runway: "25R", kind: "air", air: { heightFt: 3000, kias: 95, nmBefore: 8 }, weather: "calm-clear" },
      timeLimitSec: 300,
      objectives: () => [steepTurn(4), noStall(1), noCrash()],
      done: (ctx) => (ctx.memo.turnDone ? "Turn completed." : null),
    },
  },
  {
    id: "power-off-stall",
    category: "skills",
    title: "Power-off stall and recovery",
    summary: "Stall the aircraft on purpose, recognise it and recover with little height lost.",
    minutes: 3,
    briefing: [
      "You are at 3,500 ft above Livermore. Close the throttle, hold the altitude by slowly raising the nose, and keep the wings level with the rudder and aileron.",
      "The speed falls; the stall warning sounds and the aircraft shudders. When the nose drops (the stall), RECOVER:",
      "Lower the nose to un-stall the wing, FULL power, level the wings, then climb away gently. Lose less than 300 ft and do not stall again.",
    ],
    tips: [
      "The wing stalls because of the angle of attack, not the speed: lowering the nose is what recovers it.",
      "Keep the ball centred: a stall with the aircraft skidding can drop a wing and start a spin.",
      "Pull out of the dive gently — pulling too hard stalls the wing again.",
    ],
    flight: {
      setup: { airport: "KLVK", runway: "25R", kind: "air", air: { heightFt: 3500, kias: 80, nmBefore: 8 }, weather: "calm-clear" },
      timeLimitSec: 300,
      objectives: () => [
        objective("stall-happen", "Stall the aircraft (power off, nose up)", 1, {
          pending: "Close the throttle and raise the nose slowly.",
          update(o, ctx) {
            if (ctx.stalls.length) o.pass("Stalled.");
          },
          finish: (o) => o.fail("The aircraft did not stall."),
        }),
        stallRecovery(300, 3),
        never("wings", "Keep the wings within 30° of level in the stall", 1, null, (sim, ctx) => (ctx.stalls.length && !ctx.stallRecoveries.length && Math.abs(sim.state.roll) > 30 ? "A wing dropped more than 30° — keep the ball centred with the rudder." : null), "The wings stayed nearly level."),
        noCrash(),
      ],
      done: (ctx) => {
        const r = ctx.stallRecoveries[0];
        return r && ctx.t - r.t > 20 ? "Recovered and climbing away." : null;
      },
    },
  },
];

export const CATEGORY_LABELS: Record<TestDef["category"], string> = {
  preflight: "Preflight",
  failures: "Failures & emergencies",
  weather: "Weather",
  skills: "Flying skills",
};

export function getTest(id: string): TestDef | undefined {
  return TESTS.find((t) => t.id === id);
}
