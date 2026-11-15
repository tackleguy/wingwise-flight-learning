"""Minimal binary glTF 2.0 (GLB) writer: nodes, meshes (POSITION/NORMAL/TEXCOORD_0 + indices),
PBR materials, embedded images. No dependencies besides numpy."""
import json
import struct

import numpy as np

ARRAY_BUFFER = 34962
ELEMENT_ARRAY_BUFFER = 34963


class GlbBuilder:
    def __init__(self, generator, copyright_=None):
        self.json = {
            "asset": {"version": "2.0", "generator": generator},
            "scene": 0,
            "scenes": [{"nodes": []}],
            "nodes": [],
            "meshes": [],
            "materials": [],
            "textures": [],
            "images": [],
            "samplers": [{"magFilter": 9729, "minFilter": 9987, "wrapS": 10497, "wrapT": 10497}],
            "accessors": [],
            "bufferViews": [],
            "buffers": [{"byteLength": 0}],
        }
        if copyright_:
            self.json["asset"]["copyright"] = copyright_
        self.bin = bytearray()

    def _view(self, data, target=None):
        while len(self.bin) % 4:
            self.bin.append(0)
        off = len(self.bin)
        self.bin += data
        bv = {"buffer": 0, "byteOffset": off, "byteLength": len(data)}
        if target:
            bv["target"] = target
        self.json["bufferViews"].append(bv)
        return len(self.json["bufferViews"]) - 1

    def _accessor(self, arr, type_, component, target, minmax=False):
        arr = np.ascontiguousarray(arr)
        view = self._view(arr.tobytes(), target)
        acc = {"bufferView": view, "componentType": component, "count": int(arr.shape[0]), "type": type_}
        if minmax:
            acc["min"] = [float(x) for x in arr.min(axis=0)]
            acc["max"] = [float(x) for x in arr.max(axis=0)]
        self.json["accessors"].append(acc)
        return len(self.json["accessors"]) - 1

    def add_image(self, data, mime, name=None):
        view = self._view(data)
        img = {"bufferView": view, "mimeType": mime}
        if name:
            img["name"] = name
        self.json["images"].append(img)
        self.json["textures"].append({"sampler": 0, "source": len(self.json["images"]) - 1})
        return len(self.json["textures"]) - 1

    def add_material(self, name, rgba, roughness, texture=None, alpha_mode="OPAQUE", cutoff=None, double=False):
        m = {
            "name": name,
            "pbrMetallicRoughness": {
                "baseColorFactor": [round(float(c), 4) for c in rgba],
                "metallicFactor": 0.0,
                "roughnessFactor": round(float(roughness), 3),
            },
        }
        if texture is not None:
            m["pbrMetallicRoughness"]["baseColorTexture"] = {"index": texture}
        if alpha_mode != "OPAQUE":
            m["alphaMode"] = alpha_mode
            if alpha_mode == "MASK" and cutoff is not None:
                m["alphaCutoff"] = cutoff
        if double:
            m["doubleSided"] = True
        self.json["materials"].append(m)
        return len(self.json["materials"]) - 1

    def add_mesh(self, name, prims):
        """prims: [(pos (n,3) f32, nrm (n,3) f32, uv (n,2) f32 or None, idx (m,) int, material)]"""
        out = []
        for pos, nrm, uv, idx, mat in prims:
            attrs = {
                "POSITION": self._accessor(pos.astype(np.float32), "VEC3", 5126, ARRAY_BUFFER, minmax=True),
                "NORMAL": self._accessor(nrm.astype(np.float32), "VEC3", 5126, ARRAY_BUFFER),
            }
            if uv is not None:
                attrs["TEXCOORD_0"] = self._accessor(uv.astype(np.float32), "VEC2", 5126, ARRAY_BUFFER)
            if len(pos) < 65536:
                ind = self._accessor(idx.astype(np.uint16), "SCALAR", 5123, ELEMENT_ARRAY_BUFFER)
            else:
                ind = self._accessor(idx.astype(np.uint32), "SCALAR", 5125, ELEMENT_ARRAY_BUFFER)
            out.append({"attributes": attrs, "indices": ind, "material": mat, "mode": 4})
        self.json["meshes"].append({"name": name, "primitives": out})
        return len(self.json["meshes"]) - 1

    def add_node(self, name, mesh=None, translation=None, rotation=None, children=None, extras=None):
        n = {"name": name}
        if mesh is not None:
            n["mesh"] = mesh
        if translation is not None and any(abs(t) > 1e-9 for t in translation):
            n["translation"] = [round(float(t), 6) for t in translation]
        if rotation is not None and abs(rotation[3] - 1.0) > 1e-12:
            n["rotation"] = [round(float(q), 8) for q in rotation]
        if children:
            n["children"] = list(children)
        if extras:
            n["extras"] = extras
        self.json["nodes"].append(n)
        return len(self.json["nodes"]) - 1

    def set_roots(self, roots, scene_name=None):
        self.json["scenes"][0]["nodes"] = list(roots)
        if scene_name:
            self.json["scenes"][0]["name"] = scene_name

    def bytes(self):
        j = self.json
        for k in ("textures", "images", "materials"):
            if not j[k]:
                del j[k]
        if "textures" not in j:
            j.pop("samplers", None)
        while len(self.bin) % 4:
            self.bin.append(0)
        j["buffers"][0]["byteLength"] = len(self.bin)
        js = json.dumps(j, separators=(",", ":")).encode("utf-8")
        while len(js) % 4:
            js += b" "
        total = 12 + 8 + len(js) + 8 + len(self.bin)
        out = bytearray()
        out += struct.pack("<III", 0x46546C67, 2, total)
        out += struct.pack("<II", len(js), 0x4E4F534A) + js
        out += struct.pack("<II", len(self.bin), 0x004E4942) + self.bin
        return bytes(out)
