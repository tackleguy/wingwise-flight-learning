/**
 * An off-centre perspective projection for CesiumJS.
 *
 * In the cockpit view the instrument panel covers the lower part of the screen, so the horizon
 * should sit in the upper third — but the camera must NOT be pitched to get it there (that would
 * falsify the attitude the student sees). Instead the projection window is shifted: the camera
 * still looks straight ahead and its line of sight simply lands above the centre of the screen.
 *
 * CesiumJS's own PerspectiveFrustum has an `yOffset`, but it is given in metres on the near plane
 * and CesiumJS re-clones the frustum and changes `near` while rendering (and its clone() does not
 * copy the offset), so it cannot be used directly. This subclass stores the shift as a fraction
 * of the screen (`axisNdcY`) and derives `yOffset` from whatever `near` is current.
 */
import { PerspectiveFrustum } from "cesium";

export class ShiftedFrustum extends PerspectiveFrustum {
  /** Where the camera's line of sight lands on screen: +1 top edge, 0 centre (normal projection), −1 bottom edge. */
  axisNdcY = 0;
  private work: ShiftedFrustum | null = null;

  constructor(options?: { fov?: number; aspectRatio?: number; near?: number; far?: number }) {
    super(options);
    // Replace the plain number with a value computed from the current near plane and field of view.
    Object.defineProperty(this, "yOffset", {
      configurable: true,
      enumerable: true,
      get: (): number => {
        if (this.axisNdcY === 0) return 0;
        const aspect = this.aspectRatio ?? 1;
        const fov = this.fov ?? 1;
        const fovy = aspect <= 1 ? fov : 2 * Math.atan(Math.tan(fov / 2) / aspect);
        return -this.axisNdcY * this.near * Math.tan(fovy / 2);
      },
      set: () => {
        /* derived — ignore assignments */
      },
    });
  }

  /** CesiumJS clones the camera frustum into its own scratch object every frame; hand it one of ours instead so the shift survives. */
  override clone(result?: PerspectiveFrustum): PerspectiveFrustum {
    let r: ShiftedFrustum;
    if (result instanceof ShiftedFrustum) r = result;
    else if (result) r = this.work ??= new ShiftedFrustum();
    else r = new ShiftedFrustum();
    r.aspectRatio = this.aspectRatio;
    r.fov = this.fov;
    r.near = this.near;
    r.far = this.far;
    r.axisNdcY = this.axisNdcY;
    return r;
  }
}
