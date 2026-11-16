/**
 * Views module: the aircraft you see and the cameras you see it through.
 *
 *   const views = sim.use(createViews(world));
 *   views.attach(viewElement);          // drag to look, wheel / pinch to zoom, double-tap to reset
 *   views.setMode("cockpit");
 *
 * Register it BEFORE modules that read the camera in their own frame() hook (sky, scenery, audio),
 * so they see this frame's camera.
 */
import { clamp } from "@/core/math";
import type { Sim } from "@/core/sim";
import type { SimEvents, SpawnResult } from "@/core/types";
import type { World } from "@/world/world";
import { AircraftVisual } from "./aircraft";
import type { TowerSite, ViewMode, ViewsModule } from "./api";
import { CameraRig, GLARE_SHIELD_DEPRESSION_DEG } from "./cameras";
import { StepLead, predictPose, type RenderPose } from "./math";
import { attachPointer } from "./pointer";

export type { TowerSite, ViewMode, ViewsApi, ViewsModule } from "./api";
export { TRAINER_META } from "./trainer-meta";

const ORDER: ViewMode[] = ["cockpit", "chase", "tower", "free"];

export function createViews(world: World): ViewsModule {
  const aircraft = new AircraftVisual(world);
  const rig = new CameraRig(world);
  const lead = new StepLead();
  const pose: RenderPose = { lat: 0, lon: 0, altMslFt: 0, headingTrue: 0, pitch: 0, roll: 0 };
  const listeners = new Set<() => void>();
  let sim: Sim | null = null;
  let offs: (() => void)[] = [];
  const detachers = new Set<() => void>();
  let pendingMode: ViewMode | null = null;
  /** The view in use when the aircraft crashed (the camera goes outside to watch; it comes back on the next start). */
  let modeBeforeCrash: ViewMode | null = null;

  const notify = () => {
    for (const fn of [...listeners]) {
      try {
        fn();
      } catch (err) {
        console.error("[SkyReady] views listener failed", err);
      }
    }
  };

  /** Listen to the simulator's events the first time we see the Sim (the module is created before it is registered). */
  const bind = (s: Sim) => {
    if (sim === s) return;
    for (const off of offs) off();
    sim = s;
    offs = [
      s.events.on("command", (c: SimEvents["command"]) => {
        switch (c.id) {
          case "view-next":
            api.next();
            break;
          case "view-cockpit":
            api.setMode("cockpit");
            break;
          case "view-chase":
            api.setMode("chase");
            break;
          case "view-tower":
            api.setMode("tower");
            break;
          case "view-free":
            // pressing "free view" again parks the camera (watch the fly-by) / lets it follow again
            if (rig.mode === "free") {
              if (rig.freeStay) {
                api.setFreeStay(false);
                s.message("Free view: the camera follows the aircraft again.", "info");
              } else if (!s.state.onGround && s.state.gsKt > 30) {
                api.flyby();
                s.message("Free view: the camera is parked ahead of you — watch yourself fly past. Press the free-view key again to follow.", "info");
              } else {
                api.setFreeStay(true);
                s.message("Free view: the camera stays here and watches. Press the free-view key again to follow.", "info");
              }
            } else api.setMode("free");
            break;
          case "view-reset":
            api.resetLook();
            break;
          default:
            break;
        }
      }),
      s.events.on("touchdown", (t: SimEvents["touchdown"]) => rig.touchdown(t.vsFpm)),
      s.events.on("crash", () => {
        // watch the crash from outside (the outside view orbits the wreck without turning with it)
        if (rig.mode === "cockpit" || rig.mode === "chase" || (rig.mode === "free" && !rig.freeStay)) {
          modeBeforeCrash = rig.mode;
          rig.watchCrash(s);
          notify();
        }
      }),
    ];
    if (pendingMode) {
      rig.setMode(pendingMode, s);
      pendingMode = null;
    }
  };

  const api: ViewsModule = {
    name: "views",
    get mode() {
      return pendingMode ?? rig.mode;
    },
    get ready() {
      return aircraft.ready;
    },
    get freeStay() {
      return rig.freeStay;
    },
    get tower(): TowerSite | null {
      return rig.tower;
    },
    glareShieldDepressionDeg: GLARE_SHIELD_DEPRESSION_DEG,

    setMode(mode: ViewMode) {
      if (!ORDER.includes(mode)) return;
      if (!sim) {
        pendingMode = mode;
        rig.mode = mode;
        notify();
        return;
      }
      if (mode === rig.mode) return;
      rig.setMode(mode, sim);
      notify();
    },
    next() {
      api.setMode(ORDER[(ORDER.indexOf(api.mode) + 1) % ORDER.length]!);
    },
    look(dYawDeg: number, dPitchDeg: number) {
      if (Number.isFinite(dYawDeg) && Number.isFinite(dPitchDeg)) rig.look(dYawDeg, dPitchDeg);
    },
    zoom(factor: number) {
      if (Number.isFinite(factor) && factor > 0) rig.zoom(factor);
    },
    resetLook() {
      rig.resetLook();
    },
    attach(el: HTMLElement) {
      const detach = attachPointer(el, world.scene.canvas, () => sim, api);
      detachers.add(detach);
      return () => {
        detach();
        detachers.delete(detach);
      };
    },
    setCockpitHorizonFraction(fraction: number) {
      if (Number.isFinite(fraction)) rig.horizonFraction = clamp(fraction, 0.12, 0.6);
    },
    subscribe(fn: () => void) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    setFreeStay(stay: boolean) {
      if (!sim || stay === rig.freeStay) return;
      rig.setFreeStay(stay, sim);
      notify();
    },
    flyby(secondsAhead = 8) {
      if (!sim) return;
      rig.flyby(sim, clamp(secondsAhead, 2, 30));
      notify();
    },
    cockpitScreenFraction(degBelowHorizon: number) {
      return rig.cockpitScreenFraction(degBelowHorizon);
    },
    setTransitionSeconds(seconds: number) {
      if (Number.isFinite(seconds)) rig.transitionSec = clamp(seconds, 0, 60);
    },
    setLampTest(on: boolean) {
      aircraft.holdFlash = on;
    },
    debugState() {
      return { ...rig.debugState(), daylight: aircraft.daylight, modelReady: aircraft.ready };
    },

    onSpawn(s: Sim, _result: SpawnResult) {
      bind(s);
      if (modeBeforeCrash) {
        const m = modeBeforeCrash;
        modeBeforeCrash = null;
        rig.resetFreeOrbit();
        if (rig.mode === "free" && !rig.freeStay) api.setMode(m);
      }
      aircraft.setAircraft(s.aircraft.id);
      lead.reset();
      rig.onSpawn(s);
      notify();
    },
    frame(s: Sim, dtReal: number) {
      bind(s);
      if (!s.lastSpawn) return; // nothing to show yet
      const running = !s.paused && !s.spawning && !s.state.crash;
      predictPose(s.state, lead.update(s.state.time, dtReal, s.timeScale, running), pose);
      rig.update(s, pose, dtReal);
      aircraft.setInterior(rig.interior);
      aircraft.update(s, pose, dtReal);
    },
    dispose() {
      for (const off of offs) off();
      offs = [];
      for (const d of [...detachers]) d();
      detachers.clear();
      listeners.clear();
      aircraft.dispose();
      sim = null;
    },
  };
  return api;
}
