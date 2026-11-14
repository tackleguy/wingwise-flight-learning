/**
 * Three.js out-the-window view. Reads the SimEngine snapshot every animation frame (no React
 * re-renders). Terrain heights come from the same `terrainElevationFt` the flight model uses.
 */
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { AIRPORTS } from "@/lib/data/airports";
import type { Airport, Runway } from "@/lib/data/types";
import { distanceNm, FT_PER_NM, localOffsetFt, toRad, destinationPoint } from "@/lib/geo";
import { terrainElevationFt } from "@/sim/environment";
import type { SimEngine } from "@/sim/engine";
import type { Landmark } from "@/sim/scenarios";
import type { SimSnapshot } from "@/sim/types";

export type CameraMode = "cockpit" | "chase" | "orbit" | "tower";

const M = 0.3048;

interface Props {
  engine: SimEngine;
  origin: { lat: number; lon: number };
  towerAirport: Airport;
  landmarks: Landmark[];
  camera: CameraMode;
  quality: "low" | "medium" | "high";
  /** Look offset for cockpit view in degrees (yaw, pitch) */
  look?: { yaw: number; pitch: number };
  className?: string;
}

function latLonFromLocal(origin: { lat: number; lon: number }, eastFt: number, northFt: number) {
  return {
    lat: origin.lat + northFt / (60 * FT_PER_NM),
    lon: origin.lon + eastFt / (60 * FT_PER_NM * Math.cos(toRad(origin.lat))),
  };
}

function toWorld(origin: { lat: number; lon: number }, lat: number, lon: number, altFt: number) {
  const o = localOffsetFt(origin.lat, origin.lon, lat, lon);
  return new THREE.Vector3(o.east * M, altFt * M, -o.north * M);
}

// --------------------------------------------------------------- textures

function runwayTexture(rw: Runway): THREE.CanvasTexture {
  const w = 128;
  const h = Math.min(2048, Math.max(512, Math.round((w * rw.lengthFt) / rw.widthFt / 2)));
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d")!;
  g.fillStyle = "#3b3d42";
  g.fillRect(0, 0, w, h);
  // subtle texture
  for (let i = 0; i < 1800; i++) {
    g.fillStyle = `rgba(${Math.random() > 0.5 ? 255 : 0},${Math.random() > 0.5 ? 255 : 0},255,0.035)`;
    g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
  }
  // tire marks in touchdown zones
  g.fillStyle = "rgba(15,15,15,0.35)";
  g.fillRect(w * 0.3, h * 0.04, w * 0.4, h * 0.12);
  g.fillRect(w * 0.3, h * 0.84, w * 0.4, h * 0.12);
  const ftToPx = h / rw.lengthFt;
  g.fillStyle = "#e9ecef";
  // edge lines
  g.fillRect(3, 0, 3, h);
  g.fillRect(w - 6, 0, 3, h);
  // centerline dashes (120 ft stripe, 80 ft gap)
  for (let y = 400 * ftToPx; y < h - 400 * ftToPx; y += 200 * ftToPx)
    g.fillRect(w / 2 - 1.5, y, 3, 120 * ftToPx);
  const drawEnd = (bottom: boolean, id: string) => {
    g.save();
    if (!bottom) {
      g.translate(w, h);
      g.rotate(Math.PI);
    }
    // origin now at the far (top) end in rotated frame; we draw relative to the bottom edge
    const base = h;
    // threshold piano keys
    const keys = 8;
    const kw = (w - 24) / (keys * 2);
    for (let i = 0; i < keys; i++) {
      g.fillRect(12 + i * kw * 2 + kw * 0.3, base - 150 * ftToPx - 6, kw * 1.4, 150 * ftToPx);
    }
    // runway designator
    g.font = `bold ${Math.max(18, Math.min(60, 60 * ftToPx * 2.4))}px sans-serif`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(id, w / 2, base - 260 * ftToPx - 12);
    // aiming point (1000 ft)
    g.fillRect(w * 0.18, base - 1150 * ftToPx, w * 0.12, 150 * ftToPx);
    g.fillRect(w * 0.7, base - 1150 * ftToPx, w * 0.12, 150 * ftToPx);
    // touchdown zone bars
    for (const d of [500, 1500, 2000]) {
      if (d * 2 > rw.lengthFt) continue;
      g.fillRect(w * 0.2, base - (d + 75) * ftToPx, w * 0.05, 75 * ftToPx);
      g.fillRect(w * 0.75, base - (d + 75) * ftToPx, w * 0.05, 75 * ftToPx);
    }
    g.restore();
  };
  drawEnd(true, rw.ends[0].id);
  drawEnd(false, rw.ends[1].id);
  const t = new THREE.CanvasTexture(c);
  t.anisotropy = 8;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function taxiTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 32;
  c.height = 64;
  const g = c.getContext("2d")!;
  g.fillStyle = "#45474c";
  g.fillRect(0, 0, 32, 64);
  g.fillStyle = "#d9b13a";
  g.fillRect(15, 0, 2, 64);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function groundTexture(): THREE.CanvasTexture {
  // Patchwork of fields, roads and darker vegetation — gives a sense of speed and height.
  const n = 512;
  const c = document.createElement("canvas");
  c.width = n;
  c.height = n;
  const g = c.getContext("2d")!;
  let seed = 11;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  g.fillStyle = "#b9b9b9";
  g.fillRect(0, 0, n, n);
  const cell = 32;
  for (let y = 0; y < n; y += cell) {
    for (let x = 0; x < n; x += cell) {
      const v = 0.78 + rnd() * 0.4;
      const tint = rnd();
      const r = Math.round(255 * v * (tint > 0.85 ? 1.05 : 0.92));
      const gg = Math.round(255 * v);
      const b = Math.round(255 * v * (tint > 0.7 ? 0.82 : 0.9));
      g.fillStyle = `rgb(${r},${gg},${b})`;
      g.fillRect(x, y, cell - 1, cell - 1);
      if (rnd() > 0.7) {
        g.fillStyle = "rgba(0,0,0,0.12)";
        for (let k = 0; k < 6; k++) g.fillRect(x + rnd() * cell, y + rnd() * cell, 3, 3);
      }
    }
  }
  g.fillStyle = "rgba(255,255,255,0.35)";
  g.fillRect(0, n / 2, n, 2);
  g.fillRect(n / 3, 0, 2, n);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// --------------------------------------------------------------- builders

function buildTerrain(
  origin: { lat: number; lon: number },
  center: THREE.Vector3,
  quality: Props["quality"],
) {
  const size = 70000;
  const seg = quality === "high" ? 220 : quality === "medium" ? 150 : 90;
  const geo = new THREE.PlaneGeometry(size, size, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes["position"] as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const col = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) + center.x;
    const z = pos.getZ(i) + center.z;
    const ll = latLonFromLocal(origin, x / M, -z / M);
    const elevFt = terrainElevationFt(ll.lat, ll.lon);
    pos.setXYZ(i, x, elevFt * M - 1.2, z);
    const n =
      Math.sin(x * 0.0013) * Math.cos(z * 0.0011) * 0.5 + Math.sin(x * 0.0071 + z * 0.0043) * 0.5;
    const hNorm = Math.min(1, elevFt / 2500);
    if (hNorm < 0.35) col.setRGB(0.26 + n * 0.03, 0.34 + n * 0.04, 0.2 + n * 0.02);
    else if (hNorm < 0.7) col.setRGB(0.38 + n * 0.03, 0.36 + n * 0.03, 0.24);
    else col.setRGB(0.47, 0.45, 0.4);
    colors[i * 3] = col.r;
    colors[i * 3 + 1] = col.g;
    colors[i * 3 + 2] = col.b;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const tex = groundTexture();
  tex.repeat.set(size / 1600, size / 1600);
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, map: tex });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = false;
  return mesh;
}

interface PapiSet {
  lights: THREE.Mesh[];
  threshold: { lat: number; lon: number };
  elevFt: number;
  heading: number;
}

function buildAirport(origin: { lat: number; lon: number }, ap: Airport, taxiTex: THREE.Texture) {
  const group = new THREE.Group();
  const papis: PapiSet[] = [];
  const edgeLightPositions: number[] = [];
  const edgeLightColors: number[] = [];
  for (const rw of ap.runways) {
    const a = rw.ends[0];
    const b = rw.ends[1];
    const elevA = terrainElevationFt(a.threshold.lat, a.threshold.lon);
    const pA = toWorld(origin, a.threshold.lat, a.threshold.lon, elevA);
    const pB = toWorld(
      origin,
      b.threshold.lat,
      b.threshold.lon,
      terrainElevationFt(b.threshold.lat, b.threshold.lon),
    );
    const mid = pA.clone().add(pB).multiplyScalar(0.5);
    const len = pA.distanceTo(new THREE.Vector3(pB.x, pA.y, pB.z));
    const widthM = rw.widthFt * M;
    const geo = new THREE.PlaneGeometry(widthM, len);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshLambertMaterial({ map: runwayTexture(rw) });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(mid.x, mid.y + 0.15, mid.z);
    // Plane's +Z (texture bottom) should face end A; heading of A is direction A→B.
    mesh.rotation.y = -toRad(a.trueHeading);
    group.add(mesh);

    // Parallel taxiway (offset to the right of end A) + connectors
    const offsetM = (rw.widthFt / 2 + 350) * M;
    const right = new THREE.Vector3(
      Math.cos(toRad(a.trueHeading)),
      0,
      Math.sin(toRad(a.trueHeading)),
    );
    const tw = new THREE.PlaneGeometry(20, len);
    tw.rotateX(-Math.PI / 2);
    const twTex = taxiTex.clone();
    twTex.repeat.set(1, len / 30);
    twTex.needsUpdate = true;
    const twMesh = new THREE.Mesh(tw, new THREE.MeshLambertMaterial({ map: twTex }));
    twMesh.position.copy(mid).addScaledVector(right, offsetM);
    twMesh.position.y = mid.y + 0.1;
    twMesh.rotation.y = mesh.rotation.y;
    group.add(twMesh);
    for (const f of [0.02, 0.5, 0.98]) {
      const c = new THREE.PlaneGeometry(offsetM, 18);
      c.rotateX(-Math.PI / 2);
      const cm = new THREE.Mesh(c, new THREE.MeshLambertMaterial({ color: 0x45474c }));
      const along = pA.clone().lerp(pB, f);
      cm.position.copy(along).addScaledVector(right, offsetM / 2);
      cm.position.y = mid.y + 0.12;
      cm.rotation.y = mesh.rotation.y;
      group.add(cm);
    }
    // Apron with hangars near the taxiway midpoint
    const apronCenter = mid.clone().addScaledVector(right, offsetM + 120);
    const apron = new THREE.Mesh(
      new THREE.PlaneGeometry(220, Math.min(500, len * 0.3)).rotateX(-Math.PI / 2),
      new THREE.MeshLambertMaterial({ color: 0x4d4f55 }),
    );
    apron.position.set(apronCenter.x, mid.y + 0.08, apronCenter.z);
    apron.rotation.y = mesh.rotation.y;
    group.add(apron);
    for (let i = 0; i < 4; i++) {
      const hangar = new THREE.Mesh(
        new THREE.BoxGeometry(40, 12, 30),
        new THREE.MeshLambertMaterial({ color: i % 2 ? 0x8a8f99 : 0x9aa0a8 }),
      );
      const along = (i - 1.5) * 60;
      const fwd = new THREE.Vector3(
        Math.sin(toRad(a.trueHeading)),
        0,
        -Math.cos(toRad(a.trueHeading)),
      );
      hangar.position.copy(apronCenter).addScaledVector(right, 140).addScaledVector(fwd, along);
      hangar.position.y = mid.y + 6;
      hangar.rotation.y = mesh.rotation.y;
      group.add(hangar);
    }

    // Edge lights (white), threshold (green) and end (red) lights
    const fwd = pB.clone().sub(pA).setY(0).normalize();
    const spacing = 60;
    for (let d = 0; d <= len; d += spacing) {
      for (const side of [-1, 1]) {
        const p = pA
          .clone()
          .addScaledVector(fwd, d)
          .addScaledVector(right, side * (widthM / 2 + 1.5));
        edgeLightPositions.push(p.x, mid.y + 0.6, p.z);
        edgeLightColors.push(1, 0.95, 0.8);
      }
    }
    for (let k = -widthM / 2; k <= widthM / 2; k += 4) {
      const pa = pA.clone().addScaledVector(right, k).addScaledVector(fwd, -1);
      edgeLightPositions.push(pa.x, mid.y + 0.5, pa.z);
      edgeLightColors.push(0.2, 1, 0.3);
      const pb = pB.clone().addScaledVector(right, k).addScaledVector(fwd, 1);
      edgeLightPositions.push(pb.x, mid.y + 0.5, pb.z);
      edgeLightColors.push(0.2, 1, 0.3);
    }

    // PAPI on the left side of each runway end, 1,000 ft from the threshold
    for (const end of rw.ends) {
      const th = toWorld(
        origin,
        end.threshold.lat,
        end.threshold.lon,
        terrainElevationFt(end.threshold.lat, end.threshold.lon),
      );
      const dir = new THREE.Vector3(
        Math.sin(toRad(end.trueHeading)),
        0,
        -Math.cos(toRad(end.trueHeading)),
      );
      const left = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(-1);
      const lights: THREE.Mesh[] = [];
      for (let i = 0; i < 4; i++) {
        const m = new THREE.Mesh(
          new THREE.BoxGeometry(2.2, 1.2, 1.2),
          new THREE.MeshBasicMaterial({ color: 0xff2020 }),
        );
        // i = 0 outermost
        m.position
          .copy(th)
          .addScaledVector(dir, 1000 * M)
          .addScaledVector(left, widthM / 2 + 15 + (3 - i) * 9);
        m.position.y = th.y + 0.9;
        m.rotation.y = -toRad(end.trueHeading);
        group.add(m);
        lights.push(m);
      }
      papis.push({
        lights,
        threshold: end.threshold,
        elevFt: terrainElevationFt(end.threshold.lat, end.threshold.lon),
        heading: end.trueHeading,
      });
    }
  }
  // Control tower
  if (ap.towered) {
    const rw0 = ap.runways[0]!;
    const c = toWorld(origin, ap.lat, ap.lon, ap.elevationFt);
    const right = new THREE.Vector3(
      Math.cos(toRad(rw0.ends[0].trueHeading)),
      0,
      Math.sin(toRad(rw0.ends[0].trueHeading)),
    );
    const pos = c.clone().addScaledVector(right, (rw0.widthFt / 2 + 900) * M);
    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(4, 5, 30, 10),
      new THREE.MeshLambertMaterial({ color: 0xb8bcc4 }),
    );
    shaft.position.set(pos.x, c.y + 15, pos.z);
    const cab = new THREE.Mesh(
      new THREE.CylinderGeometry(8, 7, 6, 10),
      new THREE.MeshLambertMaterial({ color: 0x1d3b55, emissive: 0x0b1a26 }),
    );
    cab.position.set(pos.x, c.y + 33, pos.z);
    group.add(shaft, cab);
  }
  const lightGeo = new THREE.BufferGeometry();
  lightGeo.setAttribute("position", new THREE.Float32BufferAttribute(edgeLightPositions, 3));
  lightGeo.setAttribute("color", new THREE.Float32BufferAttribute(edgeLightColors, 3));
  const lightsMat = new THREE.PointsMaterial({
    size: 3.5,
    vertexColors: true,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
  });
  const lightPoints = new THREE.Points(lightGeo, lightsMat);
  group.add(lightPoints);
  return { group, papis, lightPoints };
}

function buildAircraftModel(perfId: string, spanFt: number) {
  const g = new THREE.Group();
  const span = spanFt * M;
  const highWing = perfId === "c152" || perfId === "c172";
  const jet = perfId === "b738" || perfId === "a320";
  const twin = ["pa34", "be58", "be350", "b738", "a320"].includes(perfId);
  const len = span * (jet ? 1.05 : 0.75);
  const body = new THREE.MeshStandardMaterial({
    color: 0xf2f4f7,
    roughness: 0.45,
    metalness: 0.15,
  });
  const accent = new THREE.MeshStandardMaterial({ color: 0x1f5fa8, roughness: 0.5 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x0f1a26, roughness: 0.1, metalness: 0.6 });
  const rad = len * (jet ? 0.055 : 0.07);
  const fus = new THREE.Mesh(new THREE.CapsuleGeometry(rad, len * 0.75, 6, 12), body);
  fus.rotation.x = Math.PI / 2;
  g.add(fus);
  const stripe = new THREE.Mesh(
    new THREE.CylinderGeometry(rad * 1.01, rad * 1.01, len * 0.6, 12, 1, true),
    accent,
  );
  stripe.rotation.x = Math.PI / 2;
  stripe.scale.set(1, 1, 0.25);
  stripe.position.y = -rad * 0.2;
  g.add(stripe);
  const windshield = new THREE.Mesh(
    new THREE.SphereGeometry(rad * 0.95, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2.4),
    glass,
  );
  windshield.position.set(0, rad * 0.35, -len * 0.25);
  windshield.scale.set(1, 0.6, 1.4);
  g.add(windshield);
  const wingY = highWing ? rad * 0.95 : -rad * 0.55;
  const chord = span * (jet ? 0.13 : 0.13);
  const wing = new THREE.Mesh(new THREE.BoxGeometry(span, rad * 0.18, chord), body);
  wing.position.set(0, wingY, -len * (jet ? 0.02 : 0.08));
  g.add(wing);
  if (highWing) {
    for (const s of [-1, 1]) {
      const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, span * 0.32, 4), body);
      strut.position.set(s * span * 0.13, 0, -len * 0.08);
      strut.rotation.z = s * 1.2;
      g.add(strut);
    }
  }
  const hstab = new THREE.Mesh(new THREE.BoxGeometry(span * 0.36, rad * 0.12, chord * 0.7), body);
  hstab.position.set(0, jet ? rad * 0.3 : 0, len * 0.47);
  g.add(hstab);
  const vstab = new THREE.Mesh(new THREE.BoxGeometry(rad * 0.12, span * 0.16, chord * 0.9), accent);
  vstab.position.set(0, span * 0.08 + rad * 0.3, len * 0.46);
  g.add(vstab);
  // wingtip nav lights
  const navL = new THREE.Mesh(
    new THREE.SphereGeometry(0.18, 6, 6),
    new THREE.MeshBasicMaterial({ color: 0xff2222 }),
  );
  navL.position.set(-span / 2, wingY, -len * 0.08);
  const navR = new THREE.Mesh(
    new THREE.SphereGeometry(0.18, 6, 6),
    new THREE.MeshBasicMaterial({ color: 0x22ff44 }),
  );
  navR.position.set(span / 2, wingY, -len * 0.08);
  const beacon = new THREE.Mesh(
    new THREE.SphereGeometry(0.2, 6, 6),
    new THREE.MeshBasicMaterial({ color: 0xff3030 }),
  );
  beacon.position.set(0, span * 0.16 + rad * 0.4, len * 0.46);
  g.add(navL, navR, beacon);
  // engines / propellers
  const props: THREE.Mesh[] = [];
  const propMat = new THREE.MeshBasicMaterial({
    color: 0x222222,
    transparent: true,
    opacity: 0.35,
    side: THREE.DoubleSide,
  });
  const addProp = (x: number, y: number, z: number, r: number) => {
    const p = new THREE.Mesh(new THREE.CircleGeometry(r, 20), propMat);
    p.position.set(x, y, z);
    g.add(p);
    props.push(p);
  };
  if (jet) {
    for (const s of [-1, 1]) {
      const eng = new THREE.Mesh(
        new THREE.CylinderGeometry(rad * 0.55, rad * 0.5, chord * 1.1, 12),
        new THREE.MeshStandardMaterial({ color: 0xc9ced6, metalness: 0.4 }),
      );
      eng.rotation.x = Math.PI / 2;
      eng.position.set(s * span * 0.17, wingY - rad * 0.55, -len * 0.12);
      g.add(eng);
    }
  } else if (twin) {
    for (const s of [-1, 1]) {
      const nac = new THREE.Mesh(new THREE.CapsuleGeometry(rad * 0.4, chord * 0.9, 4, 8), body);
      nac.rotation.x = Math.PI / 2;
      nac.position.set(s * span * 0.18, wingY, -len * 0.15);
      g.add(nac);
      addProp(s * span * 0.18, wingY, -len * 0.15 - chord * 0.9, span * 0.09);
    }
  } else {
    addProp(0, 0, -len * 0.5 - rad, span * 0.095);
  }
  // landing gear
  const gear = new THREE.Group();
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x151515 });
  const wheel = (x: number, z: number) => {
    const w = new THREE.Mesh(
      new THREE.CylinderGeometry(rad * 0.28, rad * 0.28, rad * 0.18, 10),
      wheelMat,
    );
    w.rotation.z = Math.PI / 2;
    w.position.set(x, -rad * 1.45, z);
    gear.add(w);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, rad * 1.2, 4), body);
    leg.position.set(x, -rad * 0.9, z);
    gear.add(leg);
  };
  wheel(-span * 0.07, -len * 0.04);
  wheel(span * 0.07, -len * 0.04);
  wheel(0, -len * 0.38);
  g.add(gear);
  // Landing light
  const landingLight = new THREE.SpotLight(0xfff4dd, 0, 900, 0.32, 0.5, 1.2);
  landingLight.position.set(0, wingY, -len * 0.3);
  const target = new THREE.Object3D();
  target.position.set(0, -10, -200);
  g.add(landingLight, target);
  landingLight.target = target;
  return { group: g, props, gear, navL, navR, beacon, landingLight, gearDrop: rad * 1.6 + 0.3 };
}

function buildClouds(snap: SimSnapshot, center: THREE.Vector3) {
  const w = snap.weather;
  const group = new THREE.Group();
  if (w.cloudBaseFt === null || w.cloudCover === "CLR") return group;
  const groundM = snap.aircraft.groundElevFt * M;
  const baseM = groundM + w.cloudBaseFt * M;
  const topsM = groundM + (w.cloudTopsFt ?? w.cloudBaseFt + 3000) * M;
  if (w.cloudCover === "OVC" || w.cloudCover === "BKN") {
    const mat = new THREE.MeshLambertMaterial({
      color: w.cloudCover === "OVC" ? 0xb9bec6 : 0xd5d9de,
      transparent: true,
      opacity: w.cloudCover === "OVC" ? 0.97 : 0.8,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const base = new THREE.Mesh(new THREE.PlaneGeometry(140000, 140000).rotateX(-Math.PI / 2), mat);
    base.position.set(center.x, baseM, center.z);
    group.add(base);
    const top = base.clone();
    top.position.y = topsM;
    (top.material as THREE.MeshLambertMaterial) = mat.clone();
    (top.material as THREE.MeshLambertMaterial).color.set(0xf4f6f8);
    group.add(top);
  }
  const count =
    w.cloudCover === "FEW" ? 70 : w.cloudCover === "SCT" ? 170 : w.cloudCover === "BKN" ? 240 : 0;
  const puffMat = new THREE.MeshLambertMaterial({
    color: 0xf2f4f7,
    transparent: true,
    opacity: 0.92,
  });
  const puffGeo = new THREE.SphereGeometry(1, 10, 8);
  const inst = new THREE.InstancedMesh(puffGeo, puffMat, count * 3);
  const m = new THREE.Matrix4();
  let k = 0;
  let seed = 7;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let i = 0; i < count; i++) {
    const x = center.x + (rnd() - 0.5) * 60000;
    const z = center.z + (rnd() - 0.5) * 60000;
    const size = 250 + rnd() * 600;
    for (let j = 0; j < 3; j++) {
      const s = size * (0.6 + rnd() * 0.5);
      m.compose(
        new THREE.Vector3(
          x + (rnd() - 0.5) * size * 1.4,
          baseM + s * 0.35,
          z + (rnd() - 0.5) * size * 1.4,
        ),
        new THREE.Quaternion(),
        new THREE.Vector3(s, s * 0.45, s * 0.9),
      );
      inst.setMatrixAt(k++, m);
    }
  }
  inst.count = k;
  group.add(inst);
  return group;
}

function skyColor(hour: number, overcast: boolean) {
  const day = new THREE.Color(overcast ? 0x9aa3ad : 0x6f9fd8);
  const dusk = new THREE.Color(0xd08a5a);
  const night = new THREE.Color(0x05080f);
  const sunAlt = Math.sin(((hour - 6) / 12) * Math.PI); // 0 at 6/18, 1 at noon
  if (sunAlt > 0.25) return day;
  if (sunAlt > 0) return dusk.clone().lerp(day, sunAlt / 0.25);
  if (sunAlt > -0.2) return night.clone().lerp(dusk, 1 + sunAlt / 0.2);
  return night;
}

// --------------------------------------------------------------- component

function disposeObject(root: THREE.Object3D) {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    mesh.geometry?.dispose();
    const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
    const mats = Array.isArray(mat) ? mat : mat ? [mat] : [];
    for (const m of mats) {
      const map = (m as THREE.MeshLambertMaterial).map;
      map?.dispose();
      m.dispose();
    }
  });
}

export function World3D({
  engine,
  origin,
  towerAirport,
  landmarks,
  camera,
  quality,
  look,
  className,
}: Props) {
  const host = useRef<HTMLDivElement>(null);
  const camRef = useRef<CameraMode>(camera);
  const lookRef = useRef(look ?? { yaw: 0, pitch: 0 });
  camRef.current = camera;
  lookRef.current = look ?? { yaw: 0, pitch: 0 };

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const renderer = new THREE.WebGLRenderer({
      antialias: quality !== "low",
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, quality === "high" ? 2 : 1.25));
    renderer.setSize(el.clientWidth, el.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    el.appendChild(renderer.domElement);
    renderer.domElement.style.display = "block";

    const scene = new THREE.Scene();
    const cam = new THREE.PerspectiveCamera(
      62,
      el.clientWidth / Math.max(1, el.clientHeight),
      0.3,
      120000,
    );
    const hemi = new THREE.HemisphereLight(0xdfe9ff, 0x3a4a2a, 0.9);
    const sun = new THREE.DirectionalLight(0xffffff, 1.4);
    scene.add(hemi, sun);
    scene.fog = new THREE.Fog(0xaab8c8, 2000, 40000);

    const snap0 = engine.getSnapshot();
    const perf = engine.perf;
    const model = buildAircraftModel(perf.id, perf.wingSpanFt);
    scene.add(model.group);

    // Far ground plane beyond the terrain mesh
    const far = new THREE.Mesh(
      new THREE.PlaneGeometry(400000, 400000).rotateX(-Math.PI / 2),
      new THREE.MeshLambertMaterial({ color: 0x3f5233 }),
    );
    far.position.y = -3;
    scene.add(far);

    let terrain: THREE.Mesh | null = null;
    let terrainCenter = new THREE.Vector3(1e9, 0, 1e9);
    let airportGroups: { group: THREE.Group; papis: PapiSet[]; lightPoints: THREE.Points }[] = [];
    let clouds: THREE.Group | null = null;
    let cloudKey = "";
    const taxiTex = taxiTexture();

    const rebuildWorld = (center: THREE.Vector3, snap: SimSnapshot) => {
      if (terrain) {
        scene.remove(terrain);
        terrain.geometry.dispose();
      }
      terrain = buildTerrain(origin, center, quality);
      scene.add(terrain);
      terrainCenter = center.clone();
      for (const a of airportGroups) {
        scene.remove(a.group);
        disposeObject(a.group);
      }
      airportGroups = [];
      const ll = latLonFromLocal(origin, center.x / M, -center.z / M);
      for (const ap of AIRPORTS) {
        if (distanceNm(ll.lat, ll.lon, ap.lat, ap.lon) > 45) continue;
        const built = buildAirport(origin, ap, taxiTex);
        scene.add(built.group);
        airportGroups.push(built);
      }
      void snap;
    };

    // Landmarks
    const lmGroup = new THREE.Group();
    for (const lm of landmarks) {
      const ground = terrainElevationFt(lm.lat, lm.lon);
      const p = toWorld(origin, lm.lat, lm.lon, ground);
      if (lm.kind === "tower") {
        const t = new THREE.Mesh(
          new THREE.CylinderGeometry(0.8, 2.5, lm.heightFt * M, 6),
          new THREE.MeshLambertMaterial({ color: 0xc23b2b }),
        );
        t.position.set(p.x, p.y + (lm.heightFt * M) / 2, p.z);
        const beacon = new THREE.Mesh(
          new THREE.SphereGeometry(2.5, 8, 8),
          new THREE.MeshBasicMaterial({ color: 0xff3020 }),
        );
        beacon.position.set(p.x, p.y + lm.heightFt * M + 2, p.z);
        lmGroup.add(t, beacon);
      } else {
        const col = lm.kind === "fix" ? 0x22d3ee : 0xf59e0b;
        const pole = new THREE.Mesh(
          new THREE.CylinderGeometry(3, 3, 120, 6),
          new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.55 }),
        );
        pole.position.set(p.x, p.y + 60 + (lm.kind === "point" ? lm.heightFt * M * 0.1 : 0), p.z);
        const ring = new THREE.Mesh(
          new THREE.TorusGeometry(220, 6, 6, 40),
          new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.6 }),
        );
        ring.rotation.x = Math.PI / 2;
        ring.position.set(p.x, p.y + 2, p.z);
        lmGroup.add(pole, ring);
      }
    }
    scene.add(lmGroup);

    // Rain streaks
    const rainCount = 1600;
    const rainGeo = new THREE.BufferGeometry();
    const rainPos = new Float32Array(rainCount * 6);
    for (let i = 0; i < rainCount; i++) {
      const x = (Math.random() - 0.5) * 160;
      const y = Math.random() * 120 - 40;
      const z = (Math.random() - 0.5) * 160;
      rainPos.set([x, y, z, x, y - 2.2, z], i * 6);
    }
    rainGeo.setAttribute("position", new THREE.BufferAttribute(rainPos, 3));
    const rain = new THREE.LineSegments(
      rainGeo,
      new THREE.LineBasicMaterial({ color: 0xaab4c4, transparent: true, opacity: 0.35 }),
    );
    rain.visible = false;
    scene.add(rain);

    const chasePos = new THREE.Vector3();
    let chaseInit = false;
    let orbitYaw = 0;
    let orbitPitch = 0.25;
    let orbitDist = perf.wingSpanFt * M * 2.5;
    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    const onDown = (e: PointerEvent) => {
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
    };
    const onUp = () => (dragging = false);
    const onMove = (e: PointerEvent) => {
      if (!dragging || camRef.current !== "orbit") return;
      orbitYaw -= (e.clientX - lastX) * 0.008;
      orbitPitch = Math.max(-0.3, Math.min(1.3, orbitPitch + (e.clientY - lastY) * 0.006));
      lastX = e.clientX;
      lastY = e.clientY;
    };
    const onWheel = (e: WheelEvent) => {
      if (camRef.current !== "orbit") return;
      e.preventDefault();
      orbitDist = Math.max(
        perf.wingSpanFt * M * 0.8,
        Math.min(800, orbitDist * (1 + Math.sign(e.deltaY) * 0.1)),
      );
    };
    renderer.domElement.addEventListener("pointerdown", onDown);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointermove", onMove);
    renderer.domElement.addEventListener("wheel", onWheel, { passive: false });

    const ro = new ResizeObserver(() => {
      const w = el.clientWidth;
      const h = Math.max(1, el.clientHeight);
      renderer.setSize(w, h);
      cam.aspect = w / h;
      cam.updateProjectionMatrix();
    });
    ro.observe(el);

    const towerPos = (() => {
      const rw0 = towerAirport.runways[0];
      const c = toWorld(origin, towerAirport.lat, towerAirport.lon, towerAirport.elevationFt);
      if (!rw0) return c.setY(c.y + 35);
      const right = new THREE.Vector3(
        Math.cos(toRad(rw0.ends[0].trueHeading)),
        0,
        Math.sin(toRad(rw0.ends[0].trueHeading)),
      );
      return c.addScaledVector(right, (rw0.widthFt / 2 + 900) * M).setY(c.y + 34);
    })();

    let raf = 0;
    let lastT = performance.now();
    const euler = new THREE.Euler(0, 0, 0, "YXZ");
    rebuildWorld(toWorld(origin, snap0.aircraft.lat, snap0.aircraft.lon, 0).setY(0), snap0);

    const frame = (t: number) => {
      const dt = Math.max(0, Math.min(0.1, (t - lastT) / 1000));
      lastT = t;
      const s = engine.getSnapshot();
      const a = s.aircraft;
      const pos = toWorld(origin, a.lat, a.lon, a.altMslFt);
      const flat = pos.clone().setY(0);
      if (flat.distanceTo(terrainCenter.clone().setY(0)) > 15000) rebuildWorld(flat, s);

      // aircraft transform
      model.group.position.copy(pos).setY(pos.y + model.gearDrop);
      euler.set(toRad(a.pitch), -toRad(a.heading), -toRad(a.bank), "YXZ");
      model.group.setRotationFromEuler(euler);
      const propSpeed = a.rpm / 60;
      for (const p of model.props) {
        p.rotation.z += propSpeed * dt * 6;
        (p.material as THREE.MeshBasicMaterial).opacity = a.rpm > 300 ? 0.28 : 0.9;
      }
      model.gear.visible = s.aircraft.gearPosition > 0.15;
      const blink = Math.floor(t / 600) % 2 === 0;
      model.beacon.visible = s.controls.lights.beacon && blink;
      model.navL.visible = model.navR.visible = s.controls.lights.nav;
      model.landingLight.intensity = s.controls.lights.landing || s.controls.lights.taxi ? 6 : 0;

      // sky, light, fog
      const w = s.weather;
      const overcast = w.cloudCover === "OVC" || w.cloudCover === "BKN";
      const sky = skyColor(w.timeOfDay, overcast);
      const sunAlt = Math.sin(((w.timeOfDay - 6) / 12) * Math.PI);
      const dayF = Math.max(0, Math.min(1, sunAlt * 2 + 0.25));
      hemi.intensity = 0.12 + dayF * (overcast ? 0.7 : 0.85);
      sun.intensity = dayF * (overcast ? 0.35 : 1.4);
      sun.position
        .set(Math.cos(((w.timeOfDay - 6) / 12) * Math.PI) * 1000, Math.max(50, sunAlt * 1000), -400)
        .add(pos);
      sun.target.position.copy(pos);
      const visM = Math.min(60000, Math.max(200, w.visibilitySm * 1609));
      const base = w.cloudBaseFt !== null ? (a.groundElevFt + w.cloudBaseFt) * M : Infinity;
      const tops =
        w.cloudBaseFt !== null
          ? (a.groundElevFt + (w.cloudTopsFt ?? w.cloudBaseFt + 3000)) * M
          : -Infinity;
      const inCloud = overcast && pos.y > base - 5 && pos.y < tops;
      const fog = scene.fog as THREE.Fog;
      if (inCloud) {
        fog.color.setRGB(
          0.62 * (0.3 + dayF * 0.7),
          0.65 * (0.3 + dayF * 0.7),
          0.69 * (0.3 + dayF * 0.7),
        );
        fog.near = 2;
        fog.far = 70;
        scene.background = fog.color.clone();
      } else {
        fog.color
          .copy(sky)
          .lerp(new THREE.Color(0xc9d2dc), overcast ? 0.4 : 0.25)
          .multiplyScalar(0.35 + dayF * 0.65);
        fog.near = visM * 0.05;
        fog.far = visM * 1.15;
        scene.background = sky.clone().multiplyScalar(0.3 + dayF * 0.7);
      }
      const night = dayF < 0.3;
      for (const ag of airportGroups) {
        (ag.lightPoints.material as THREE.PointsMaterial).size = night ? 4 : 1.6;
        (ag.lightPoints.material as THREE.PointsMaterial).opacity = night ? 1 : 0.5;
        // PAPI colour by glidepath angle (outermost light lowest transition angle)
        for (const papi of ag.papis) {
          const dNm = distanceNm(papi.threshold.lat, papi.threshold.lon, a.lat, a.lon);
          if (dNm > 8) continue;
          const papiPt = destinationPoint(
            papi.threshold.lat,
            papi.threshold.lon,
            papi.heading,
            1000 / FT_PER_NM,
          );
          const distFt = Math.max(1, distanceNm(papiPt.lat, papiPt.lon, a.lat, a.lon) * FT_PER_NM);
          const angle = (Math.atan2(a.altMslFt - papi.elevFt, distFt) * 180) / Math.PI;
          const settings = [2.5, 2.83, 3.17, 3.5];
          papi.lights.forEach((l, i) => {
            (l.material as THREE.MeshBasicMaterial).color.set(
              angle > settings[i]! ? 0xffffff : 0xff2020,
            );
          });
        }
      }
      const cKey = `${w.cloudCover}-${w.cloudBaseFt}-${w.cloudTopsFt}-${Math.round(terrainCenter.x)}-${Math.round(terrainCenter.z)}`;
      if (cKey !== cloudKey) {
        if (clouds) {
          scene.remove(clouds);
          disposeObject(clouds);
        }
        clouds = buildClouds(s, terrainCenter);
        scene.add(clouds);
        cloudKey = cKey;
      }
      rain.visible = w.precipitation !== "none";
      if (rain.visible) {
        rain.position.copy(cam.position);
        const arr = rainGeo.attributes["position"] as THREE.BufferAttribute;
        for (let i = 0; i < rainCount; i++) {
          let y = arr.getY(i * 2) - dt * 40;
          if (y < -40) y += 120;
          arr.setY(i * 2, y);
          arr.setY(i * 2 + 1, y - 2.2);
        }
        arr.needsUpdate = true;
      }

      // camera
      const mode = camRef.current;
      model.group.visible = mode !== "cockpit";
      if (mode === "cockpit") {
        const eye = new THREE.Vector3(0, perf.eyeHeightFt * M * 0.35, -perf.wingSpanFt * M * 0.12)
          .applyEuler(euler)
          .add(model.group.position);
        if (a.onGround) eye.y = pos.y + perf.eyeHeightFt * M;
        cam.position.copy(eye);
        const lk = lookRef.current;
        const e2 = new THREE.Euler(
          toRad(a.pitch) + toRad(lk.pitch),
          -toRad(a.heading) - toRad(lk.yaw),
          -toRad(a.bank),
          "YXZ",
        );
        cam.setRotationFromEuler(e2);
        cam.fov = 64;
      } else if (mode === "chase") {
        const back = new THREE.Vector3(0, perf.wingSpanFt * M * 0.35, perf.wingSpanFt * M * 1.6);
        back.applyEuler(new THREE.Euler(0, -toRad(a.heading), 0, "YXZ"));
        const target = model.group.position.clone().add(back);
        if (!chaseInit) {
          chasePos.copy(target);
          chaseInit = true;
        }
        chasePos.lerp(target, Math.min(1, dt * 3));
        cam.position.copy(chasePos);
        cam.lookAt(model.group.position);
        cam.fov = 58;
      } else if (mode === "orbit") {
        const off = new THREE.Vector3(
          Math.sin(orbitYaw) * Math.cos(orbitPitch),
          Math.sin(orbitPitch),
          Math.cos(orbitYaw) * Math.cos(orbitPitch),
        ).multiplyScalar(orbitDist);
        cam.position.copy(model.group.position).add(off);
        cam.lookAt(model.group.position);
        cam.fov = 55;
      } else {
        cam.position.copy(towerPos);
        cam.lookAt(model.group.position);
        const d = towerPos.distanceTo(model.group.position);
        cam.fov = Math.max(4, Math.min(60, (perf.wingSpanFt * M * 6 * 57) / Math.max(d, 1)));
      }
      // keep the camera above terrain
      const camLL = latLonFromLocal(origin, cam.position.x / M, -cam.position.z / M);
      const gY = terrainElevationFt(camLL.lat, camLL.lon) * M + 1.5;
      if (cam.position.y < gY) cam.position.y = gY;
      cam.updateProjectionMatrix();
      renderer.render(scene, cam);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointermove", onMove);
      renderer.domElement.removeEventListener("pointerdown", onDown);
      renderer.domElement.removeEventListener("wheel", onWheel);
      disposeObject(scene);
      taxiTex.dispose();
      renderer.dispose();
      el.removeChild(renderer.domElement);
    };
  }, [engine, origin.lat, origin.lon, quality, towerAirport, landmarks]);

  return <div ref={host} className={className} style={{ touchAction: "none" }} />;
}
