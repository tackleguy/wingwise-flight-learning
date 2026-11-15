/**
 * Checks on the generated aircraft model (public/models/trainer.glb, built by scripts/build-aircraft.mjs):
 * size, triangle budget, named moving parts with sensible hinge lines, wheels that touch the ground
 * when the flight model stands on them, and light positions.
 */
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CG_HEIGHT_FT } from "@/core/defaults";
import { M_PER_FT } from "@/core/math";
import { gearShiftM } from "@/views/math";
import { TRAINER_META } from "@/views/trainer-meta";
import { makeSim } from "../helpers";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const file = path.join(root, "public/models/trainer.glb");

interface GltfNode {
  name: string;
  mesh?: number;
  children?: number[];
  translation?: [number, number, number];
  rotation?: [number, number, number, number];
}
interface Gltf {
  nodes: GltfNode[];
  meshes: { name: string; primitives: { attributes: Record<string, number>; indices: number; material: number }[] }[];
  accessors: { bufferView: number; componentType: number; count: number; type: string; min?: number[]; max?: number[] }[];
  bufferViews: { byteOffset: number; byteLength: number }[];
  materials: { name: string; alphaMode?: string }[];
  images: { mimeType: string; bufferView: number }[];
  scenes: { nodes: number[] }[];
}

function readGlb(): { json: Gltf; bin: Buffer } {
  const buf = readFileSync(file);
  expect(buf.readUInt32LE(0)).toBe(0x46546c67); // "glTF"
  expect(buf.readUInt32LE(4)).toBe(2);
  expect(buf.readUInt32LE(8)).toBe(buf.length);
  const jsonLen = buf.readUInt32LE(12);
  const json = JSON.parse(buf.subarray(20, 20 + jsonLen).toString("utf8")) as Gltf;
  const binStart = 20 + jsonLen + 8;
  return { json, bin: buf.subarray(binStart) };
}

/** glTF vector (x left, y up, z nose) → aircraft frame (x nose, y left, z up). */
const toAircraft = (v: number[]): [number, number, number] => [v[2]!, v[0]!, v[1]!];

function rotate(q: [number, number, number, number], v: [number, number, number]): [number, number, number] {
  const [x, y, z, w] = q;
  const ix = w * v[0] + y * v[2] - z * v[1];
  const iy = w * v[1] + z * v[0] - x * v[2];
  const iz = w * v[2] + x * v[1] - y * v[0];
  const iw = -x * v[0] - y * v[1] - z * v[2];
  return [ix * w + iw * -x + iy * -z - iz * -y, iy * w + iw * -y + iz * -x - ix * -z, iz * w + iw * -z + ix * -y - iy * -x];
}

/** All vertex positions of a node's mesh in the aircraft frame. */
function nodePositions(json: Gltf, bin: Buffer, name: string): [number, number, number][] {
  const node = json.nodes.find((n) => n.name === name);
  if (!node || node.mesh === undefined) throw new Error("no mesh node " + name);
  const out: [number, number, number][] = [];
  for (const prim of json.meshes[node.mesh]!.primitives) {
    const acc = json.accessors[prim.attributes.POSITION!]!;
    const view = json.bufferViews[acc.bufferView]!;
    for (let i = 0; i < acc.count; i++) {
      const o = view.byteOffset + i * 12;
      let p: [number, number, number] = [bin.readFloatLE(o), bin.readFloatLE(o + 4), bin.readFloatLE(o + 8)];
      if (node.rotation) p = rotate(node.rotation, p);
      const t = node.translation ?? [0, 0, 0];
      out.push(toAircraft([p[0] + t[0], p[1] + t[1], p[2] + t[2]]));
    }
  }
  return out;
}

describe("aircraft model (trainer.glb)", () => {
  const { json, bin } = readGlb();
  const names = json.nodes.map((n) => n.name);

  it("is a small, valid binary glTF within the triangle budget", () => {
    expect(statSync(file).size).toBeLessThan(1.5 * 1024 * 1024);
    let triangles = 0;
    for (const m of json.meshes) for (const p of m.primitives) triangles += json.accessors[p.indices]!.count / 3;
    expect(triangles).toBe(TRAINER_META.triangles);
    expect(triangles).toBeGreaterThan(8000);
    expect(triangles).toBeLessThan(40000);
    for (const m of json.meshes) for (const p of m.primitives) expect(Object.keys(p.attributes).sort()).toEqual(["NORMAL", "POSITION", "TEXCOORD_0"]);
    expect(json.images.every((i) => i.mimeType === "image/png")).toBe(true);
    expect(json.materials.map((m) => m.name)).toEqual(["livery", "interior", "propdisc"]);
  });

  it("has the named parts the simulator animates, and the light positions", () => {
    for (const n of Object.values(TRAINER_META.nodes)) expect(names).toContain(n);
    for (const n of ["fuselage_nose", "fuselage_cabin", "fuselage_tail", "wing_left", "wing_right", "strut_left", "strut_right", "stabilizer", "fin", "gear_nose", "gear_main_left", "gear_main_right", "cockpit_shell", "cockpit_frame"]) expect(names).toContain(n);
    for (const n of ["light_beacon", "light_nav_left", "light_nav_right", "light_tail", "light_strobe_left", "light_strobe_right", "light_landing", "light_taxi"]) {
      const node = json.nodes.find((x) => x.name === n);
      expect(node?.translation, n).toBeDefined();
    }
    const at = (n: string) => toAircraft(json.nodes.find((x) => x.name === n)!.translation!);
    expect(at("light_nav_left")[1]).toBeGreaterThan(5.3); // red on the LEFT wing tip
    expect(at("light_nav_right")[1]).toBeLessThan(-5.3); // green on the right
    expect(at("light_beacon")[2]).toBeGreaterThan(1.4); // on top of the fin
    expect(at("light_beacon")[0]).toBeLessThan(-5);
    expect(at("light_landing")[0]).toBeGreaterThan(1.8); // in the nose
    expect(at("light_tail")[0]).toBeLessThan(-4.8);
    // the cockpit frame and the outside of the cabin are separate groups so the cockpit view can swap them
    const group = (n: string) => json.nodes.find((x) => x.name === n)!.children!.map((i) => json.nodes[i]!.name);
    expect(group("cockpit")).toEqual(expect.arrayContaining(["cockpit_shell", "cockpit_frame"]));
    expect(group("cabin_exterior")).toEqual(["fuselage_cabin"]);
  });

  it("has the proportions of a four-seat high-wing trainer", () => {
    const all: [number, number, number][] = [];
    for (const n of json.nodes) if (n.mesh !== undefined) all.push(...nodePositions(json, bin, n.name));
    const min = [0, 1, 2].map((k) => Math.min(...all.map((p) => p[k]!)));
    const max = [0, 1, 2].map((k) => Math.max(...all.map((p) => p[k]!)));
    expect(max[0]! - min[0]!).toBeGreaterThan(8.1); // length about 8.3 m
    expect(max[0]! - min[0]!).toBeLessThan(8.45);
    expect(max[1]! - min[1]!).toBeGreaterThan(10.9); // span about 11 m
    expect(max[1]! - min[1]!).toBeLessThan(11.15);
    expect(Math.abs(max[1]! + min[1]!)).toBeLessThan(0.01); // symmetric
    // high wing: the wing is above the cabin windows and the pilot's eye is below it
    const wing = nodePositions(json, bin, "wing_left");
    const wingLowest = Math.min(...wing.map((p) => p[2]));
    expect(wingLowest).toBeGreaterThan(TRAINER_META.eye[2] + 0.15);
    expect(TRAINER_META.eye[1]).toBeGreaterThan(0.15); // left seat
  });

  it("stands on its three wheels where the flight model stands (within what the gear legs can take up)", async () => {
    // the flight model at rest
    const sim = makeSim(0);
    await sim.spawn({ kind: "runway", airportIdent: "KSFO", runwayEndId: "28R" });
    sim.controls.parkingBrake = true;
    sim.advance(6);
    const pitch = (sim.state.pitch * Math.PI) / 180;
    const cgHeightM = (sim.state.altMslFt - sim.state.groundElevFt) * M_PER_FT;
    expect(Math.abs(cgHeightM - CG_HEIGHT_FT * M_PER_FT)).toBeLessThan(0.05);
    // height above the ground of the lowest point of each wheel, with the model in that attitude
    const lowest = (name: string) => {
      let lo = Infinity;
      for (const p of nodePositions(json, bin, name)) lo = Math.min(lo, cgHeightM + p[2] * Math.cos(pitch) + p[0] * Math.sin(pitch));
      return lo;
    };
    const wheels = { nose: lowest("gear_nose"), left: lowest("gear_main_left"), right: lowest("gear_main_right") };
    for (const [name, h] of Object.entries(wheels)) {
      // The simulator moves each wheel so the tyre touches the ground (the legs give a little). The model as built
      // must be well inside that travel for the attitude the flight model really rests at.
      expect(Math.abs(h), `${name} wheel is ${(h * 100).toFixed(1)} cm from the ground`).toBeLessThan(0.07);
      const shift = gearShiftM(h, 0.05);
      expect(h + shift, name).toBeCloseTo(0, 6);
    }
    // the lowest tyre point in the generated numbers is the lowest point of the wheel mesh
    const meshLow = Math.min(...nodePositions(json, bin, "gear_main_left").map((p) => p[2]));
    expect(meshLow).toBeCloseTo(TRAINER_META.wheels.mainLeft[2], 2);
    expect(Math.min(...nodePositions(json, bin, "gear_nose").map((p) => p[2]))).toBeCloseTo(TRAINER_META.wheels.nose[2], 2);
    // nothing else is lower than the wheels (propeller clear of the ground)
    expect(lowest("propeller_disc")).toBeGreaterThan(0.2);
    // wheel positions match the flight model's landing gear (JSBSim c172p: nose 6.8 in ahead of, mains 58.2 in behind the firewall)
    const cgIn = sim.state.cgIn;
    expect(Math.abs(TRAINER_META.wheels.nose[0] - (cgIn + 6.8) * 0.0254)).toBeLessThan(0.08);
    expect(Math.abs(TRAINER_META.wheels.mainLeft[0] - (cgIn - 58.2) * 0.0254)).toBeLessThan(0.08);
    // the gear nodes can be moved by the simulator: they have no rotation of their own
    for (const n of ["gear_nose", "gear_main_left", "gear_main_right"]) expect(json.nodes.find((x) => x.name === n)!.rotation).toBeUndefined();
  });

  it("puts every hinge along the part's own X axis, in the right place", () => {
    const axis = (name: string) => {
      const n = json.nodes.find((x) => x.name === name)!;
      expect(n.rotation, name).toBeDefined();
      return toAircraft(rotate(n.rotation!, [1, 0, 0]));
    };
    // elevator, ailerons and flaps hinge across the aircraft (toward the left wing) …
    for (const n of ["elevator", "aileron_left", "aileron_right", "flap_left", "flap_right"]) {
      const a = axis(n);
      expect(a[1], n).toBeGreaterThan(0.97);
    }
    // … the rudder hinges upward (leaning back), the propeller turns about the nose direction
    expect(axis("rudder")[2]).toBeGreaterThan(0.85);
    expect(axis("rudder")[0]).toBeLessThan(0);
    expect(axis("propeller")[0]).toBeGreaterThan(0.999);
    expect(axis("propeller_disc")[0]).toBeGreaterThan(0.999);
    // control surfaces sit behind their hinge line (so a positive turn about +Y lifts the trailing edge)
    const pivot = (name: string) => toAircraft(json.nodes.find((x) => x.name === name)!.translation!);
    for (const n of ["elevator", "aileron_left", "flap_left"]) {
      const pts = nodePositions(json, bin, n);
      const meanX = pts.reduce((s, p) => s + p[0], 0) / pts.length;
      expect(meanX, n).toBeLessThan(pivot(n)[0]);
    }
    // left parts are on the left, right parts on the right
    expect(pivot("aileron_left")[1]).toBeGreaterThan(2);
    expect(Math.max(...nodePositions(json, bin, "aileron_right").map((p) => p[1]))).toBeLessThan(-2);
    expect(Math.min(...nodePositions(json, bin, "flap_left").map((p) => p[1]))).toBeGreaterThan(0.5);
    // propeller: 75 inch diameter, spinning in the plane across the nose
    const disc = nodePositions(json, bin, "propeller_disc");
    const hub = pivot("propeller");
    const r = Math.max(...disc.map((p) => Math.hypot(p[1] - hub[1], p[2] - hub[2])));
    expect(Math.abs(r - TRAINER_META.propRadiusM)).toBeLessThan(0.01);
  });
});
