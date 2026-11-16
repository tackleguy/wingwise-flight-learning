/**
 * The four cameras — cockpit, chase, tower, free — and the eased moves between them.
 * Everything is driven once per drawn frame from the (predicted) aircraft pose; nothing here
 * allocates while flying.
 */
import { Cartesian3, Cartographic, Ellipsoid, Matrix3, Matrix4, Quaternion } from "cesium";
import { D2R, FT_PER_M, M_PER_FT, M_PER_NM, R2D, angleDiff, clamp, destination, distanceNm, norm360 } from "@/core/math";
import type { Sim } from "@/core/sim";
import { aircraftMatrix, ecef, type World } from "@/world/world";
import type { TowerSite, ViewMode } from "./api";
import { ShiftedFrustum } from "./frustum";
import { LOOK_LIMITS, approach, approachAngle, autoZoomFovDeg, axisNdcForFraction, cesiumFovRad, observerSite, pickTowerSite, screenFractionOfElevation, smootherstep, verticalFovDeg, type RenderPose } from "./math";
import { visualSpecFor } from "./model-spec";
import { TRAINER_META } from "./trainer-meta";

/** Top of the glare shield as seen from the pilot's eye (from the model's geometry): degrees below the level line of sight. */
export const GLARE_SHIELD_DEPRESSION_DEG = TRAINER_META.sight.glareShieldDeg;

/** Default horizontal fields of view on a 16:9 screen, degrees. */
const COCKPIT_HFOV = 86;
const CHASE_HFOV = 75;
const TRANSITION_SEC = 0.6;
/** Moves longer than this are a straight cut (a camera flying a kilometre in half a second helps nobody). */
const CUT_DISTANCE_M = 350;
const CHASE = { distance: 15, minDistance: 5, maxDistance: 150, elevation: 11, aimAhead: 1.0, aimUp: 0.9, headingLag: 0.7 };
const FREE = { distance: 22, elevation: 9 };

interface Pose {
  pos: Cartesian3;
  dir: Cartesian3;
  up: Cartesian3;
  /** Vertical field of view, degrees. */
  fovy: number;
  /** Off-centre projection (see ShiftedFrustum.axisNdcY). */
  axis: number;
  near: number;
}
const newPose = (): Pose => ({ pos: new Cartesian3(), dir: new Cartesian3(1, 0, 0), up: new Cartesian3(0, 0, 1), fovy: 50, axis: 0, near: 0.5 });

export class CameraRig {
  mode: ViewMode = "chase";
  /** True while the cockpit frame should be drawn instead of the cabin's outside. */
  interior = false;
  freeStay = false;
  tower: TowerSite | null = null;
  horizonFraction = 0.33;

  private readonly frustum: ShiftedFrustum;
  private readonly target = newPose();
  private readonly out = newPose();
  private hasPose = false;

  // ---- per-mode state
  private headYaw = 0;
  private headPitch = 0;
  private headYawT = 0;
  private headPitchT = 0;
  private cockpitZoom = 1;
  private headSink = 0;
  private headSway = 0;
  private axisNow = axisNdcForFraction(0.33);

  /** Pilot's eye point of the aircraft being flown (frame A: x nose, y left, z up), its span, and size relative to the trainer. */
  private eye: readonly [number, number, number] = TRAINER_META.eye;
  private spanM: number = TRAINER_META.spanM;
  private sizeScale = 1;
  private chaseHeading = 0;
  private chaseYaw = 0;
  private chasePitch = CHASE.elevation;
  private chaseYawT = 0;
  private chasePitchT = CHASE.elevation;
  private chaseDist = CHASE.distance;
  private chaseDistT = CHASE.distance;
  private chaseLift = 0;

  private towerYaw = 0;
  private towerPitch = 0;
  private towerZoom = 1;
  private towerFov = 20;
  private readonly towerPos = new Cartesian3();
  private towerGroundKnown = false;
  private towerCheck = 0;

  private freeAz = 0;
  private freeAzT = 0;
  private freeEl = FREE.elevation;
  private freeElT = FREE.elevation;
  private freeDist = FREE.distance;
  private freeDistT = FREE.distance;
  private readonly stayPos = new Cartesian3();
  private stayYaw = 0;
  private stayPitch = 0;
  private stayZoom = 1;
  private stayFov = 30;
  private lastAglFt = 0;

  // ---- transition
  private trT = 1;
  private trDur = TRANSITION_SEC;
  /** Length of the eased move between views, seconds. */
  transitionSec = TRANSITION_SEC;
  private trFromCockpit = false;
  private readonly trOffset = new Cartesian3();
  private readonly trQuat = new Quaternion();
  private trFovy = 50;
  private trAxis = 0;

  // ---- shake
  private clock = 0;
  private bump = 0;
  private bumpAge = 10;
  private buffet = 0;
  private rumble = 0;

  // ---- scratch
  private readonly body = new Matrix4();
  private readonly level = new Matrix4();
  private readonly acPos = new Cartesian3();
  private readonly upV = new Cartesian3();
  private readonly a = new Cartesian3();
  private readonly b = new Cartesian3();
  private readonly c = new Cartesian3();
  private readonly right = new Cartesian3();
  private readonly m3 = new Matrix3();
  private readonly q = new Quaternion();
  private readonly q2 = new Quaternion();
  private readonly carto = new Cartographic();

  constructor(private readonly world: World) {
    const cam = world.camera;
    const old = cam.frustum as { fov?: number; aspectRatio?: number; near?: number; far?: number };
    this.frustum = new ShiftedFrustum({ fov: old.fov ?? 1, aspectRatio: old.aspectRatio ?? 16 / 9, near: old.near ?? 0.5, far: old.far ?? 1e10 });
    cam.frustum = this.frustum;
  }

  // ------------------------------------------------------------------ commands from the module

  setMode(mode: ViewMode, sim: Sim): void {
    if (mode === this.mode) return;
    this.beginTransition(this.mode === "cockpit");
    this.mode = mode;
    if (mode === "tower") this.pickTower(sim, true);
    if (mode === "free" && !this.freeStay) this.freeAz = this.freeAzT = norm360(sim.state.headingTrue + 215);
  }

  look(dYaw: number, dPitch: number): void {
    switch (this.mode) {
      case "cockpit":
        this.headYawT = clamp(this.headYawT + dYaw, -LOOK_LIMITS.yaw, LOOK_LIMITS.yaw);
        this.headPitchT = clamp(this.headPitchT + dPitch, -LOOK_LIMITS.pitchDown, LOOK_LIMITS.pitchUp);
        break;
      case "chase":
        // looking right = the camera swings round to the left of the aircraft; looking up = the camera goes lower
        this.chaseYawT += dYaw;
        this.chasePitchT = clamp(this.chasePitchT - dPitch, -8, 85);
        break;
      case "tower":
        this.towerYaw = clamp(this.towerYaw + dYaw * 0.4, -25, 25);
        this.towerPitch = clamp(this.towerPitch + dPitch * 0.4, -15, 15);
        break;
      case "free":
        if (this.freeStay) {
          this.stayYaw = clamp(this.stayYaw + dYaw * 0.5, -40, 40);
          this.stayPitch = clamp(this.stayPitch + dPitch * 0.5, -25, 25);
        } else {
          this.freeAzT += dYaw;
          this.freeElT = clamp(this.freeElT - dPitch, -8, 88);
        }
        break;
    }
  }

  zoom(factor: number): void {
    const f = clamp(factor, 0.2, 5);
    switch (this.mode) {
      case "cockpit":
        this.cockpitZoom = clamp(this.cockpitZoom * f, 0.28, 1.25);
        break;
      case "chase":
        this.chaseDistT = clamp(this.chaseDistT * f, CHASE.minDistance * this.sizeScale, CHASE.maxDistance * this.sizeScale);
        break;
      case "tower":
        this.towerZoom = clamp(this.towerZoom * f, 0.25, 6);
        break;
      case "free":
        if (this.freeStay) this.stayZoom = clamp(this.stayZoom * f, 0.25, 6);
        else this.freeDistT = clamp(this.freeDistT * f, CHASE.minDistance, 400);
        break;
    }
  }

  resetLook(): void {
    switch (this.mode) {
      case "cockpit":
        this.headYawT = this.headPitchT = 0;
        this.cockpitZoom = 1;
        break;
      case "chase":
        // unwind the short way
        this.chaseYaw = angleDiff(this.chaseYaw, 0);
        this.chaseYawT = 0;
        this.chasePitchT = CHASE.elevation;
        this.chaseDistT = CHASE.distance * this.sizeScale;
        break;
      case "tower":
        this.towerYaw = this.towerPitch = 0;
        this.towerZoom = 1;
        break;
      case "free":
        this.stayYaw = this.stayPitch = 0;
        this.stayZoom = 1;
        this.freeElT = FREE.elevation;
        this.freeDistT = FREE.distance;
        break;
    }
  }

  /** After a crash: orbit the wreck from a little above and far enough back to see the pieces scatter. */
  watchCrash(sim: Sim): void {
    if (this.mode !== "free") this.setMode("free", sim);
    this.freeStay = false;
    this.freeElT = 24;
    this.freeDistT = Math.max(32, this.spanM * 3.2);
  }

  /** The free view's usual angle and distance again (after watching a crash). */
  resetFreeOrbit(): void {
    this.freeElT = FREE.elevation;
    this.freeDistT = FREE.distance;
  }

  /** Free view: keep the camera where it is and watch the aircraft (true), or go back to orbiting it (false). */
  setFreeStay(stay: boolean, sim: Sim): void {
    if (stay === this.freeStay) return;
    if (stay) {
      Cartesian3.clone(this.hasPose ? this.out.pos : this.acPos, this.stayPos);
      this.stayYaw = this.stayPitch = 0;
      this.stayZoom = 1;
      this.stayFov = this.out.fovy * (this.world.scene.canvas.clientWidth / Math.max(1, this.world.scene.canvas.clientHeight));
    } else {
      this.beginTransition(false);
      this.freeAz = this.freeAzT = norm360(sim.state.headingTrue + 215);
    }
    this.freeStay = stay;
  }

  /** Park the free camera beside the path ahead of the aircraft. */
  flyby(sim: Sim, secondsAhead: number): void {
    const s = sim.state;
    const moving = s.gsKt > 8;
    const track = moving ? s.trackTrue : s.headingTrue;
    const aheadM = moving ? Math.max(60, (s.gsKt / 1.9438445) * secondsAhead) : 45;
    // low to the ground near the runway, otherwise a little below the flight path so the aircraft passes against the sky
    const low = s.aglFt < 400;
    const predictedAglFt = Math.max(0, s.aglFt + (s.vsFpm / 60) * secondsAhead);
    // far enough to the side that the camera looks across at the aircraft rather than straight up at it
    const sideM = Math.max(clamp(aheadM * 0.12, 18, 70), low ? predictedAglFt * M_PER_FT * 1.3 : 0);
    const ahead = destination(s.lat, s.lon, track, aheadM / M_PER_NM);
    const p = destination(ahead.lat, ahead.lon, norm360(track - 90), sideM / M_PER_NM);
    const ground = sim.elevation.groundFt(p.lat, p.lon) ?? s.groundElevFt;
    const predictedAlt = s.altMslFt + (s.vsFpm / 60) * secondsAhead;
    const alt = low ? ground + 7 : Math.max(ground + 7, predictedAlt - 60);
    if (this.mode !== "free") {
      this.beginTransition(this.mode === "cockpit");
      this.mode = "free";
    }
    ecef(p.lat, p.lon, alt, this.stayPos);
    this.stayYaw = this.stayPitch = 0;
    this.stayZoom = 1;
    this.stayFov = 40;
    this.freeStay = true;
    this.trT = 1; // a cut: the camera jumps ahead
    this.interior = false;
  }

  /** After the aircraft has been repositioned: no easing from the old place. */
  onSpawn(sim: Sim): void {
    const s = sim.state;
    const spec = visualSpecFor(sim.aircraft.id);
    const before = this.sizeScale;
    this.eye = spec.eye;
    this.spanM = spec.spanM;
    this.sizeScale = Math.max(1, spec.lengthM / TRAINER_META.lengthM);
    if (before !== this.sizeScale) this.chaseDist = this.chaseDistT = clamp(CHASE.distance * this.sizeScale, CHASE.minDistance, CHASE.maxDistance * this.sizeScale);
    this.chaseHeading = s.headingTrue;
    this.chaseLift = 0;
    this.trT = 1;
    this.hasPose = false;
    this.bump = 0;
    this.bumpAge = 10;
    this.headSink = this.headSway = 0;
    this.freeStay = false;
    this.freeAz = this.freeAzT = norm360(s.headingTrue + 215);
    this.tower = null;
    if (this.mode === "tower") this.pickTower(sim, true);
    this.interior = this.mode === "cockpit";
  }

  touchdown(vsFpm: number): void {
    this.bump = clamp(Math.abs(vsFpm) / 600, 0.12, 1.6);
    this.bumpAge = 0;
  }

  // ------------------------------------------------------------------ tower site

  private pickTower(sim: Sim, force: boolean): void {
    const s = sim.state;
    const last = sim.lastSpawn;
    let site = pickTowerSite(sim.data, s.lat, s.lon, last ? { airportIdent: last.airportIdent, runwayEndId: last.runwayEndId } : null);
    if (site && distanceNm(s.lat, s.lon, site.lat, site.lon) > 25) site = null;
    if (!site) {
      if (!force && this.tower && !this.tower.airportIdent && distanceNm(s.lat, s.lon, this.tower.lat, this.tower.lon) < 4) return;
      site = observerSite(s.lat, s.lon, s.headingTrue, s.groundElevFt);
    }
    if (!force && this.tower && this.tower.airportIdent === site.airportIdent && this.tower.runwayName === site.runwayName && site.airportIdent) return;
    this.tower = site;
    this.towerGroundKnown = false;
    this.towerYaw = this.towerPitch = 0;
    this.placeTower(sim);
    void sim.elevation.ensure(site.lat, site.lon, 0.3).catch(() => undefined);
  }

  private placeTower(sim: Sim): void {
    const t = this.tower;
    if (!t) return;
    const g = sim.elevation.groundFt(t.lat, t.lon);
    if (g !== null) this.towerGroundKnown = true;
    ecef(t.lat, t.lon, (g ?? t.fallbackElevFt) + t.heightAglFt, this.towerPos);
  }

  // ------------------------------------------------------------------ transitions

  private beginTransition(fromCockpit: boolean): void {
    if (!this.hasPose) {
      this.trT = 1;
      return;
    }
    Cartesian3.subtract(this.out.pos, this.acPos, this.trOffset);
    this.quatOf(this.out.dir, this.out.up, this.trQuat);
    this.trFovy = this.out.fovy;
    this.trAxis = this.out.axis;
    this.trFromCockpit = fromCockpit;
    this.trT = this.transitionSec > 0 ? 0 : 1;
    this.trDur = Math.max(0.001, this.transitionSec);
  }

  private quatOf(dir: Cartesian3, up: Cartesian3, result: Quaternion): Quaternion {
    const r = Cartesian3.normalize(Cartesian3.cross(dir, up, this.a), this.a);
    const u = Cartesian3.cross(r, dir, this.b);
    const m = this.m3;
    // columns: right, up, back
    Matrix3.setColumn(m, 0, r, m);
    Matrix3.setColumn(m, 1, u, m);
    Matrix3.setColumn(m, 2, Cartesian3.negate(dir, this.c), m);
    return Quaternion.fromRotationMatrix(m, result);
  }

  // ------------------------------------------------------------------ per frame

  update(sim: Sim, pose: RenderPose, dtReal: number): void {
    // the smoothing filters are exact exponentials, so long frames (a slow computer) are fine
    const dt = clamp(dtReal, 0, 0.5);
    const s = sim.state;
    const world = this.world;
    const canvas = world.scene.canvas;
    const aspect = canvas.clientWidth > 0 && canvas.clientHeight > 0 ? canvas.clientWidth / canvas.clientHeight : 16 / 9;
    if (!sim.paused) this.clock += dt;

    this.lastAglFt = s.aglFt;
    aircraftMatrix(pose.lat, pose.lon, pose.altMslFt, pose.headingTrue, pose.pitch, pose.roll, this.body);
    Matrix4.getTranslation(this.body, this.acPos);
    Ellipsoid.WGS84.geodeticSurfaceNormal(this.acPos, this.upV);

    // ---- shake sources (kept small on purpose)
    this.bumpAge += sim.paused ? 0 : dt;
    this.buffet = approach(this.buffet, s.stalled && !s.onGround ? 1 : 0, dt, 0.25);
    this.rumble = approach(this.rumble, s.onGround ? clamp((s.gsKt - 2) / 55, 0, 1) : 0, dt, 0.2);
    const T = this.clock;
    const bumpNow = this.bump * Math.exp(-this.bumpAge / 0.22) * Math.cos(this.bumpAge * 2 * Math.PI * 5.5);
    const shakeUp = bumpNow * 0.03 + this.buffet * 0.005 * Math.sin(T * 71) + this.rumble * 0.0028 * (Math.sin(T * 107) + 0.6 * Math.sin(T * 149 + 1));
    const shakeSide = this.buffet * 0.004 * Math.sin(T * 57 + 2) + this.rumble * 0.0016 * Math.sin(T * 83.5 + 0.7);
    const shakePitchDeg = bumpNow * 0.35 + this.buffet * 0.1 * Math.sin(T * 63 + 1);

    // ---- wanted pose for the current view
    const t = this.target;
    switch (this.mode) {
      case "cockpit":
        this.cockpitPose(sim, dt, aspect, shakeUp, shakeSide, t);
        break;
      case "chase":
        this.chasePose(sim, pose, dt, aspect, t);
        break;
      case "tower":
        this.towerPose(sim, dt, aspect, t);
        break;
      case "free":
        if (this.freeStay) this.stayPoseFn(dt, aspect, t);
        else this.freePose(sim, pose, dt, aspect, t);
        break;
    }

    // ---- ease from the previous view
    const o = this.out;
    if (this.trT < 1) {
      const fromPos = Cartesian3.add(this.acPos, this.trOffset, this.a);
      if (Cartesian3.distance(fromPos, t.pos) > CUT_DISTANCE_M) this.trT = 1;
    }
    if (this.trT < 1) {
      this.trT = Math.min(1, this.trT + dtReal / this.trDur);
      const k = smootherstep(this.trT);
      const fromPos = Cartesian3.add(this.acPos, this.trOffset, this.a);
      Cartesian3.lerp(fromPos, t.pos, k, o.pos);
      const qTo = this.quatOf(t.dir, t.up, this.q);
      const qq = Quaternion.slerp(this.trQuat, qTo, k, this.q2);
      Matrix3.fromQuaternion(qq, this.m3);
      Cartesian3.fromElements(-this.m3[6]!, -this.m3[7]!, -this.m3[8]!, o.dir);
      Cartesian3.fromElements(this.m3[3]!, this.m3[4]!, this.m3[5]!, o.up);
      o.fovy = this.trFovy + (t.fovy - this.trFovy) * k;
      o.axis = this.trAxis + (t.axis - this.trAxis) * k;
      o.near = 0.1;
      // The cockpit frame is only drawn while the camera is (nearly) at the pilot's eye, the outside of the cabin
      // only when it is not — so no view ever shows the inside of the model.
      this.interior = this.mode === "cockpit" ? k > 0.86 : this.trFromCockpit && k < 0.1;
    } else {
      Cartesian3.clone(t.pos, o.pos);
      Cartesian3.clone(t.dir, o.dir);
      Cartesian3.clone(t.up, o.up);
      o.fovy = t.fovy;
      o.axis = t.axis;
      o.near = t.near;
      this.interior = this.mode === "cockpit";
    }
    this.hasPose = true;

    // ---- write the camera
    const cam = world.camera;
    Cartesian3.normalize(o.dir, o.dir);
    Cartesian3.normalize(Cartesian3.cross(o.dir, o.up, this.right), this.right);
    Cartesian3.cross(this.right, o.dir, o.up);
    Cartesian3.clone(o.pos, cam.position);
    Cartesian3.clone(o.dir, cam.direction);
    Cartesian3.clone(o.up, cam.up);
    Cartesian3.clone(this.right, cam.right);
    if (this.mode !== "cockpit" && shakePitchDeg !== 0) {
      // outside views: a small nod of the camera instead of moving the eye
      const ang = shakePitchDeg * D2R * 0.5;
      Cartesian3.add(cam.direction, Cartesian3.multiplyByScalar(o.up, Math.tan(ang), this.a), cam.direction);
      Cartesian3.normalize(cam.direction, cam.direction);
      Cartesian3.cross(this.right, cam.direction, cam.up);
    }
    const f = this.frustum;
    f.aspectRatio = aspect;
    f.fov = cesiumFovRad(clamp(o.fovy, 0.5, 120), aspect);
    f.axisNdcY = o.axis;
    f.near = o.near;
  }

  // ------------------------------------------------------------------ cockpit

  private cockpitPose(sim: Sim, dt: number, aspect: number, shakeUp: number, shakeSide: number, t: Pose): void {
    const s = sim.state;
    this.headYaw = approach(this.headYaw, this.headYawT, dt, 0.07);
    this.headPitch = approach(this.headPitch, this.headPitchT, dt, 0.07);
    // the head sinks a little under g and leans against a slip or skid
    this.headSink = approach(this.headSink, clamp((s.nz - 1) * 0.014, -0.02, 0.035), dt, 0.14);
    this.headSway = approach(this.headSway, clamp(s.ny * 0.012, -0.02, 0.02), dt, 0.18);
    this.axisNow = approach(this.axisNow, axisNdcForFraction(this.horizonFraction), dt, 0.15);
    const cy = Math.cos(this.headYaw * D2R);
    const sy = Math.sin(this.headYaw * D2R);
    const cp = Math.cos(this.headPitch * D2R);
    const sp = Math.sin(this.headPitch * D2R);
    // turning the head moves the eyes a little (the neck is behind them): about 9 cm of travel side to side
    const eyeX = this.eye[0] + 0.09 * (cy - 1) * 0.5;
    const eyeY = this.eye[1] - 0.085 * sy - shakeSide - this.headSway;
    const eyeZ = this.eye[2] - this.headSink + shakeUp;
    Matrix4.multiplyByPoint(this.body, Cartesian3.fromElements(eyeX, eyeY, eyeZ, this.a), t.pos);
    // body axes: x nose, y left, z up; positive yaw = look right, positive pitch = look up
    Matrix4.multiplyByPointAsVector(this.body, Cartesian3.fromElements(cp * cy, -cp * sy, sp, this.a), t.dir);
    Matrix4.multiplyByPointAsVector(this.body, Cartesian3.fromElements(-sp * cy, sp * sy, cp, this.a), t.up);
    const h = clamp(COCKPIT_HFOV * this.cockpitZoom, 20, 108);
    t.fovy = verticalFovDeg(h, aspect, 14, 78);
    t.axis = this.axisNow;
    t.near = 0.07;
  }

  // ------------------------------------------------------------------ chase

  /** Camera on a sphere around an aim point: `az` true bearing FROM the aim point TO the camera, `el` degrees above it. */
  private orbit(sim: Sim, pose: RenderPose, az: number, el: number, dist: number, aimAhead: number, aimUp: number, dt: number, t: Pose): void {
    aircraftMatrix(pose.lat, pose.lon, pose.altMslFt, az, 0, 0, this.level);
    // level frame at the aircraft: +x points along `az` (toward the camera), +z up
    const ce = Math.cos(el * D2R);
    Matrix4.multiplyByPoint(this.level, Cartesian3.fromElements(dist * ce, 0, dist * Math.sin(el * D2R) + aimUp, this.a), t.pos);
    // keep the camera above the ground
    let need = 0;
    if (sim.state.aglFt < 800) {
      Cartographic.fromCartesian(t.pos, Ellipsoid.WGS84, this.carto);
      const g = sim.elevation.groundFt(this.carto.latitude * R2D, this.carto.longitude * R2D) ?? sim.state.groundElevFt;
      need = Math.max(0, g * M_PER_FT + 1.3 - this.carto.height);
    }
    this.chaseLift = need > this.chaseLift ? approach(this.chaseLift, need, dt, 0.05) : approach(this.chaseLift, need, dt, 0.5);
    if (this.chaseLift > 0.001) Cartesian3.add(t.pos, Cartesian3.multiplyByScalar(this.upV, Math.max(this.chaseLift, need), this.a), t.pos);
    // aim a little ahead of and above the centre of the aircraft
    aircraftMatrix(pose.lat, pose.lon, pose.altMslFt, pose.headingTrue, 0, 0, this.level);
    const aim = Matrix4.multiplyByPoint(this.level, Cartesian3.fromElements(aimAhead, 0, aimUp, this.a), this.b);
    Cartesian3.normalize(Cartesian3.subtract(aim, t.pos, t.dir), t.dir);
    Cartesian3.clone(this.upV, t.up);
  }

  private chasePose(sim: Sim, pose: RenderPose, dt: number, aspect: number, t: Pose): void {
    // follow the heading with a little lag so turns, yaw and bank can be seen
    this.chaseHeading = approachAngle(this.chaseHeading, pose.headingTrue, dt, CHASE.headingLag);
    this.chaseYaw = approach(this.chaseYaw, this.chaseYawT, dt, 0.09);
    this.chasePitch = approach(this.chasePitch, this.chasePitchT, dt, 0.09);
    this.chaseDist = approach(this.chaseDist, this.chaseDistT, dt, 0.12);
    const az = norm360(this.chaseHeading + 180 + this.chaseYaw);
    this.orbit(sim, pose, az, this.chasePitch, this.chaseDist, CHASE.aimAhead, CHASE.aimUp, dt, t);
    t.fovy = verticalFovDeg(CHASE_HFOV, aspect);
    t.axis = 0;
    t.near = 0.5;
  }

  // ------------------------------------------------------------------ free (orbit)

  private freePose(sim: Sim, pose: RenderPose, dt: number, aspect: number, t: Pose): void {
    this.freeAz = approach(this.freeAz, this.freeAzT, dt, 0.09);
    this.freeEl = approach(this.freeEl, this.freeElT, dt, 0.09);
    this.freeDist = approach(this.freeDist, this.freeDistT, dt, 0.12);
    this.orbit(sim, pose, norm360(this.freeAz), this.freeEl, this.freeDist, 0, 0.5, dt, t);
    t.fovy = verticalFovDeg(CHASE_HFOV, aspect);
    t.axis = 0;
    t.near = 0.5;
  }

  // ------------------------------------------------------------------ fixed cameras that watch the aircraft

  private watchFrom(pos: Cartesian3, yawDeg: number, pitchDeg: number, t: Pose): number {
    Cartesian3.clone(pos, t.pos);
    Ellipsoid.WGS84.geodeticSurfaceNormal(pos, t.up);
    const d = Cartesian3.subtract(this.acPos, pos, t.dir);
    const dist = Cartesian3.magnitude(d);
    if (dist < 0.5) Cartesian3.cross(t.up, Cartesian3.UNIT_Z, t.dir);
    Cartesian3.normalize(t.dir, t.dir);
    if (yawDeg !== 0 || pitchDeg !== 0) {
      // user offset: turn right / tilt up relative to the line to the aircraft
      const r = Cartesian3.normalize(Cartesian3.cross(t.dir, t.up, this.a), this.a);
      const u = Cartesian3.cross(r, t.dir, this.b);
      const ty = Math.tan(yawDeg * D2R);
      const tp = Math.tan(pitchDeg * D2R);
      t.dir.x += r.x * ty + u.x * tp;
      t.dir.y += r.y * ty + u.y * tp;
      t.dir.z += r.z * ty + u.z * tp;
      Cartesian3.normalize(t.dir, t.dir);
    }
    return dist;
  }

  /**
   * When the aircraft is low, widen the view (by at most `maxWiden` times) and aim a little below it, so the
   * ground it is about to land on is in the picture — a close-up against plain sky tells you nothing about height.
   * Returns the horizontal field of view to use, degrees; nudges `t.dir` downward.
   */
  private groundInView(aglFt: number, distM: number, tightFovDeg: number, aspect: number, maxWiden: number, t: Pose): number {
    if (aglFt > 700 || distM < 30) return tightFovDeg;
    const below = Math.atan((aglFt * M_PER_FT + 3) / distM) * R2D; // angle between the aircraft and the ground under it
    const fade = 1 - clamp((aglFt - 450) / 250, 0, 1);
    const needH = below * 1.75 * Math.max(1, aspect) * fade;
    const fov = clamp(Math.max(tightFovDeg, needH), tightFovDeg, tightFovDeg * maxWiden);
    // aim below the aircraft by up to 30 % of the picture height (never losing the aircraft)
    const fovy = fov / Math.max(1, aspect);
    const drop = Math.min(below * 0.6 * fade, fovy * 0.3);
    if (drop > 0.001) {
      const k = Math.tan(drop * D2R);
      t.dir.x -= t.up.x * k;
      t.dir.y -= t.up.y * k;
      t.dir.z -= t.up.z * k;
      Cartesian3.normalize(t.dir, t.dir);
    }
    return fov;
  }

  private towerPose(sim: Sim, dt: number, aspect: number, t: Pose): void {
    const s = sim.state;
    // re-pick the nearest airport now and then, and whenever the aircraft has gone far away
    this.towerCheck -= dt;
    if (!this.tower) this.pickTower(sim, true);
    else if (this.towerCheck <= 0) {
      this.towerCheck = 2;
      if (!this.towerGroundKnown) this.placeTower(sim);
      const d = distanceNm(s.lat, s.lon, this.tower.lat, this.tower.lon);
      if (d > 4) {
        const before = this.tower;
        const near = pickTowerSite(sim.data, s.lat, s.lon, null);
        if (near && near.airportIdent !== before.airportIdent && distanceNm(s.lat, s.lon, near.lat, near.lon) < d * 0.6) {
          this.tower = near;
          this.towerGroundKnown = false;
          this.placeTower(sim);
          void sim.elevation.ensure(near.lat, near.lon, 0.3).catch(() => undefined);
          sim.message(`Tower view moved to ${near.airportName || near.airportIdent}.`, "info");
        } else if (!near && d > 8 && before.airportIdent) this.pickTower(sim, true);
        else if (!before.airportIdent && d > 3) this.pickTower(sim, true);
      }
    }
    const dist = this.watchFrom(this.towerPos, this.towerYaw, this.towerPitch, t);
    // automatic zoom: the aircraft keeps a sensible size however far away it is
    const tight = autoZoomFovDeg(dist, this.spanM, 0.2, 1.2, 62);
    const want = clamp(this.groundInView(s.aglFt, dist, tight, aspect, 3.2, t) * this.towerZoom, 0.6, 90);
    this.towerFov = approach(this.towerFov, want, dt, 0.35);
    t.fovy = verticalFovDeg(this.towerFov, aspect, 0.3, 75);
    t.axis = 0;
    t.near = 1;
  }

  private stayPoseFn(dt: number, aspect: number, t: Pose): void {
    const dist = this.watchFrom(this.stayPos, this.stayYaw, this.stayPitch, t);
    const tight = autoZoomFovDeg(dist, this.spanM, 0.26, 3.5, 70);
    const want = clamp(this.groundInView(this.lastAglFt, dist, tight, aspect, 2.2, t) * this.stayZoom, 1, 95);
    this.stayFov = approach(this.stayFov, want, dt, 0.3);
    t.fovy = verticalFovDeg(this.stayFov, aspect, 0.6, 78);
    t.axis = 0;
    t.near = 0.5;
  }

  // ------------------------------------------------------------------ helpers for the panel / UI

  /** Fraction of the screen height (from the top) where a direction below the pilot's level line of sight appears. */
  cockpitScreenFraction(degBelowHorizon: number): number {
    const canvas = this.world.scene.canvas;
    const aspect = canvas.clientWidth > 0 && canvas.clientHeight > 0 ? canvas.clientWidth / canvas.clientHeight : 16 / 9;
    const fovy = verticalFovDeg(clamp(COCKPIT_HFOV * this.cockpitZoom, 20, 108), aspect, 14, 78);
    return screenFractionOfElevation(-degBelowHorizon, fovy, axisNdcForFraction(this.horizonFraction));
  }

  debugState(): Record<string, number | boolean | string> {
    const o = this.out;
    return {
      mode: this.mode,
      interior: this.interior,
      transition: this.trT,
      headYaw: this.headYaw,
      headPitch: this.headPitch,
      cockpitZoom: this.cockpitZoom,
      chaseYaw: this.chaseYaw,
      chasePitch: this.chasePitch,
      chaseDistance: this.chaseDist,
      chaseHeading: this.chaseHeading,
      freeAzimuth: this.freeAz,
      freeElevation: this.freeEl,
      freeDistance: this.freeDist,
      freeStay: this.freeStay,
      towerZoom: this.towerZoom,
      fovyDeg: o.fovy,
      axisNdcY: o.axis,
      near: o.near,
      distanceToAircraftM: Cartesian3.distance(o.pos, this.acPos),
      bump: this.bump * Math.exp(-this.bumpAge / 0.22),
      buffet: this.buffet,
      rumble: this.rumble,
    };
  }

  /** Height of the camera above the ground under it, ft (for other modules, e.g. sound). */
  cameraHeightFt(): number {
    Cartographic.fromCartesian(this.world.camera.positionWC, Ellipsoid.WGS84, this.carto);
    return this.carto.height * FT_PER_M;
  }
}
