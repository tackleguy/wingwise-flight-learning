/**
 * Runtime: creates the world database, the terrain service, the simulator core and the 3D world,
 * and runs the animation loop (physics steps → module frame hooks → one render).
 */
import { Sim } from "@/core/sim";
import { loadWorldData, type WorldData } from "@/data/world-data";
import { ElevationService } from "@/world/elevation";
import { World } from "@/world/world";

export interface RuntimeOptions {
  /** Element the 3D view is created in (it fills this element). */
  container: HTMLElement;
  creditContainer?: HTMLElement;
  onProgress?: (message: string) => void;
}

export class Runtime {
  readonly sim: Sim;
  readonly world: World;
  readonly data: WorldData;
  readonly elevation: ElevationService;
  /** Smoothed frames per second actually drawn. */
  fps = 0;
  private raf = 0;
  private last = 0;
  private running = false;
  private readonly hidden = () => {
    // Skip the time that passed while the tab was in the background.
    this.last = performance.now();
  };

  private constructor(data: WorldData, elevation: ElevationService, sim: Sim, world: World) {
    this.data = data;
    this.elevation = elevation;
    this.sim = sim;
    this.world = world;
  }

  static async create(opts: RuntimeOptions): Promise<Runtime> {
    opts.onProgress?.("Loading airports of the world…");
    const data = await loadWorldData();
    const elevation = new ElevationService(data);
    const sim = new Sim({ data, elevation });
    opts.onProgress?.("Starting the 3D world…");
    const world = new World({ container: opts.container, elevation, quality: sim.settings.quality, hdUsImagery: sim.settings.hdUsImagery, creditContainer: opts.creditContainer });
    opts.onProgress?.("Loading the flight model…");
    await sim.preload();
    return new Runtime(data, elevation, sim, world);
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    document.addEventListener("visibilitychange", this.hidden);
    const loop = (now: number) => {
      if (!this.running) return;
      this.raf = requestAnimationFrame(loop);
      const dt = Math.max(0, (now - this.last) / 1000);
      this.last = now;
      if (dt > 0) this.fps += (1 / dt - this.fps) * 0.05;
      this.sim.frame(dt);
      this.world.setUtc(this.sim.env.utcMs);
      try {
        this.world.render();
      } catch (err) {
        console.error("[TeachX] render failed", err);
      }
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
    document.removeEventListener("visibilitychange", this.hidden);
  }

  destroy(): void {
    this.stop();
    this.sim.dispose();
    this.world.destroy();
  }
}
