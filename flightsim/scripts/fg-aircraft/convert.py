#!/usr/bin/env python3
"""
Convert FlightGear aircraft models (AC3D + model XML) to glTF binaries for the TeachX simulator.

    python3 -I scripts/fg-aircraft/convert.py                 # every aircraft in aircraft_config.py
    python3 -I scripts/fg-aircraft/convert.py c172p p51d      # some of them
    python3 -I scripts/fg-aircraft/convert.py --inspect c182  # list objects/animations, write nothing

Inputs : the download cache filled by fetch.py (FGAddon) and a local FGData checkout (c172p).
Outputs: public/models/fg/<id>.glb, public/models/fg/CREDITS.md, src/aircraft/fg-models.gen.ts

Frames (see README.md):
  FG model frame  x aft, y right, z up (metres);  AC3D y-up files:  fg = (x_ac, -z_ac, y_ac)
  JSBSim structural frame: x aft, y right, z up (inches) — same axes as the FG frame.
  glTF output: +Z nose, +Y up, +X left wing, metres, origin = JSBSim centre of gravity.
  The model is translated (never rotated or scaled unless the config says so) so that its main
  tyre bottoms sit on the JSBSim main-gear contact points.
"""
import io
import os
import re
import sys
import json
import math
import time
import hashlib
import xml.etree.ElementTree as ET

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from aircraft_config import AIRCRAFT, ORDER, EXTRA  # noqa: E402
from fgmodel import (  # noqa: E402
    Files, ModelLoader, Props, flatten_props, load_xml_includes, eval_condition, norm_prop, DYNAMIC_PROPS,
    parse_xml_file, fnum,
)
from glb import GlbBuilder  # noqa: E402

ROOT = os.path.normpath(os.path.join(HERE, "..", ".."))  # flightsim/
OUT_DIR = os.environ.get("FG_OUT") or os.path.join(ROOT, "public", "models", "fg")  # FG_OUT: experiments elsewhere
META_TS = os.path.join(os.environ["FG_OUT"], "fg-models.gen.ts") if os.environ.get("FG_OUT") else os.path.join(ROOT, "src", "aircraft", "fg-models.gen.ts")
JSBSIM_DIR = os.path.join(ROOT, "jsbsim", "aircraft")
SCRATCH = "/tmp/claude-0/-home-user-wingwise-flight-learning/51b73d3e-32ac-50c3-af10-4e0cf79554b5/scratchpad"
CACHE = os.environ.get("FG_CACHE", os.path.join(SCRATCH, "fgaddon"))
FGDATA = os.environ.get("FGDATA", os.path.join(SCRATCH, "fgdata", "repo"))

IN = 0.0254
FT = 0.3048

# Objects never wanted on the exterior model (matched against object names, sub-model names/paths)
GLOBAL_SKIP = [
    r"shadow", r"halo", r"light[-_ ]?cone", r"lightcone", r"procedural", r"flare", r"\bglow",
    r"smoke", r"contrail", r"spray", r"wake", r"vapou?r", r"exhaust[-_ ]?flame", r"afterburner[-_ ]?flame",
    r"pilot", r"copilot", r"\bhead\b", r"helmet", r"\bbody[-_]?pilot", r"passenger",
    r"interior", r"cockpit", r"instrument", r"\bpanel\b", r"gauge", r"needle", r"yoke", r"pedal",
    r"seat", r"throttle", r"mixture", r"switch", r"knob", r"lever", r"placard", r"\bhud\b",
    r"chock", r"tie-?down", r"tow-?bar", r"\bladder", r"remove.?before", r"\brbf\b", r"pitot[-_ ]?cover",
    r"engine[-_ ]?cover", r"intake[-_ ]?cover", r"\bcover\b", r"trailer", r"heater", r"external[-_ ]?power",
    r"\bgpu\b", r"\bfuel[-_ ]?truck", r"safety[-_ ]?cone", r"\bdamage", r"broken", r"crash",
    r"marker\.xml", r"immat",
]

GLOBAL_SKIP_TEX = r"panel|placard|primer|interior|cockpit|instrument|gauge|pilot|seat|yoke|carpet"

# property -> part recognition
PART_PROPS = [
    ("gear", r"gear/gear(\[\d+\])?/position-norm|gear-pos-norm|gear/position-norm"),
    ("propeller", r"(engines/engine(\[\d+\])?/([\w-]*rpm|n1|n2|thruster/rpm)\b)|propeller.*rpm|prop.*rpm"),
    ("aileron", r"aileron(?!.*(trim|tab))"),  # left / right decided by where the surface is
    ("elevator", r"elevator(?!.*(trim|tab))"),
    ("rudder", r"rudder(?!.*(trim|tab|pedal))"),
    ("flap", r"^(?!.*(apu|cowl|lever|switch|indicator|exhaust|vent|outflow|valve)).*flap"),
]
PART_PRIORITY = ["gear", "propeller", "aileron", "elevator", "rudder", "flap"]

DEFAULT_PROPS = {
    "sim/current-view/internal": "false",
    "sim/current-view/view-number": "1",
    "sim/multiplay/generic/int[0]": "0",
    "sim/rendering/rembrandt/enabled": "false",
    "sim/rendering/shaders/skydome": "true",
    "sim/rendering/als-secondary-lights/use-landing-light": "false",
    "controls/gear/gear-down": "true",
    "gear/gear/position-norm": "1",
    "gear/gear[1]/position-norm": "1",
    "gear/gear[2]/position-norm": "1",
    "sim/model/hide-yoke": "false",
}


def log(*a):
    print(*a, flush=True)


# ============================================================================ JSBSim reference


def jsb_loc(el):
    unit = (el.get("unit") or "IN").upper()
    f = {"IN": IN, "FT": FT, "M": 1.0}[unit]
    return np.array([float(el.findtext(k)) * f for k in ("x", "y", "z")])


def jsbsim_info(name):
    path = os.path.join(JSBSIM_DIR, name, name + ".xml")
    root = ET.parse(path).getroot()
    mt = root.find("metrics")
    ws = mt.find("wingspan")
    span = float(ws.text) * {"FT": FT, "M": 1.0, "IN": IN}[(ws.get("unit") or "FT").upper()]
    locs = {l.get("name"): jsb_loc(l) for l in mt.findall("location")}
    cg = jsb_loc(root.find("mass_balance").find("location[@name='CG']"))
    contacts = {}
    for c in root.find("ground_reactions").findall("contact"):
        n = c.get("name")
        if n in contacts and contacts[n][0] == "BOGEY":
            continue  # same name used for a BOGEY and a STRUCTURE point (c310): keep the wheel
        contacts[n] = (c.get("type"), jsb_loc(c.find("location")))
    return {"path": path, "span": span, "cg": cg, "contacts": contacts, "vrp": locs.get("VRP"), "eye": locs.get("EYEPOINT")}


def pick_contacts(info, cfg):
    cs = info["contacts"]
    want = cfg.get("jsb_contacts", {})
    out = {}
    for key, pats in (("mainLeft", [r"^LEFT_?M(AIN|LG)"]), ("mainRight", [r"^RIGHT_?M(AIN|LG)"]),
                      ("nose", [r"^NOSE(_LG|_GEAR)?$"]), ("tail", [r"^TAIL(_LG|_GEAR|_WHEEL)?$"])):
        if key in want:
            out[key] = want[key]
            continue
        for n, (typ, _) in cs.items():
            if typ == "BOGEY" and any(re.search(p, n) for p in pats):
                out[key] = n
                break
    return {k: (n, cs[n][1]) for k, n in out.items() if n in cs}


# ============================================================================ loading


def files_for(cfg):
    if cfg.get("local"):
        roots = {cfg["fgdir"]: os.path.join(FGDATA, "Aircraft", cfg["fgdir"])}
    else:
        roots = {d: os.path.join(CACHE, d) for d in os.listdir(CACHE) if os.path.isdir(os.path.join(CACHE, d))}
    return Files(roots, cfg["fgdir"])


def load_props(files, cfg):
    root = load_xml_includes(files, cfg["fgdir"], cfg["set"], aliases=False)
    vals = flatten_props(root) if root is not None else {}
    for k, v in DEFAULT_PROPS.items():
        vals.setdefault(norm_prop(k), v)
    for k, v in cfg.get("props", {}).items():
        vals[norm_prop(k)] = str(v)
    return root, Props(vals)


def model_path(setroot, cfg):
    if cfg.get("model"):
        return cfg["model"]
    for sim in setroot.findall("sim"):
        for m in sim.findall("model"):
            p = m.findtext("path")
            if p and p.strip():
                return p.strip()
    raise RuntimeError("no /sim/model/path")


def view0(setroot):
    views = [v for sim in setroot.findall("sim") for v in sim.findall("view")]
    for v in views:
        if v.get("n") in (None, "0"):
            c = v.find("config")
            if c is None:
                continue
            g = lambda k: fnum(c.findtext(k))  # noqa: E731
            return np.array([g("x-offset-m"), g("y-offset-m"), g("z-offset-m")])
    return None


def any_match(pats, texts):
    for p in pats:
        for t in texts:
            if t and re.search(p, t, re.I):
                return p
    return None


def load_aircraft(aid, cfg):
    files = files_for(cfg)
    setroot, props = load_props(files, cfg)
    mp = model_path(setroot, cfg)
    d, p = files.resolve(cfg["fgdir"], os.path.dirname(cfg["set"]), mp)
    skip_sub = GLOBAL_SKIP + cfg.get("skip_submodel", []) + cfg.get("skip", [])
    allow_sub = cfg.get("allow_submodel", [])

    def skip_submodel(path, name):
        if any_match(allow_sub, [path, name]):
            return False
        return any_match(skip_sub, [path, name]) is not None

    ml = ModelLoader(files, props, log=log)
    ml.load(d, p, skip_submodel=skip_submodel)
    return files, setroot, props, ml, (d, p)


# ============================================================================ classification


def classify(ml, cfg, props):
    """Decide for every mesh: skip / static / gear / part:<name> / prop:<n>:<blades|disc|hub>."""
    skip = GLOBAL_SKIP + cfg.get("skip", [])
    keep = cfg.get("keep", [])
    by_name = cfg.get("parts_by_name", {})
    res = []
    allow_sub = cfg.get("allow_submodel", [])
    for m in ml.meshes:
        texts = list(m.names) + [sp for sp in m.submodel_paths if not any_match(allow_sub, [sp])]
        why = None
        kept = any_match(keep, texts)
        if not kept:
            why = any_match(skip, texts)
            if why:
                why = "name:" + why
            elif m.effects and any(re.search(r"interior|cockpit|lightmap-interior", e, re.I) for e in m.effects) and not cfg.get("ignore_interior_effects"):
                why = "effect:" + [e for e in m.effects if re.search(r"interior|cockpit", e, re.I)][0]
            else:
                for a in m.anims:
                    if a.type == "select":
                        refs = []
                        ok = eval_condition(a.el.find("condition"), props, refs, dynamic=DYNAMIC_PROPS)
                        if ok is False:
                            why = "select:" + ",".join(sorted(set(refs)))[:80]
                            break
                    if a.type == "pick" and ((a.el.findtext("visible") or "").strip().lower() == "false" or cfg.get("skip_pick", False)):
                        why = "invisible pick object"
                        break
                    if a.type in ("flash", "billboard", "dist-scale") and not cfg.get("keep_billboards"):
                        why = "light halo (" + a.type + ")"
                        break
        if not why and not kept:
            tpat = cfg.get("skip_tex", GLOBAL_SKIP_TEX)
            if m.tex and tpat and re.search(tpat, os.path.basename(m.tex), re.I):
                why = "texture:" + os.path.basename(m.tex)
        if not why and not kept and cfg.get("skip_box"):
            lo, hi = m.pos.min(axis=0), m.pos.max(axis=0)
            for box in cfg["skip_box"]:
                if np.all(lo >= np.array(box[0])) and np.all(hi <= np.array(box[1])):
                    why = "inside cabin box"
                    break
        if why:
            res.append(("skip", why, None))
            continue
        # explicit part by name
        hit = None
        for part, pats in by_name.items():
            if any_match(pats if isinstance(pats, list) else [pats], m.names):
                hit = part
                break
        found = {}
        for a in m.anims:
            hints = a.props + [x for x in a.aliases if x]
            if a.type in ("rotate", "spin") and a.name:
                hints = hints + [a.name]  # e.g. A320: <name>Left elevator</name> on a multiplayer property
            for prop in hints:
                for part, pat in PART_PROPS:
                    if re.search(pat, prop, re.I):
                        if part != "gear" and part != "propeller" and a.type not in ("rotate", "spin"):
                            continue
                        if part == "propeller" and a.type not in ("spin", "rotate", "select", "blend"):
                            continue
                        found.setdefault(part, []).append(a)
                        break
        # propellers that spin on an unusual property (multiplayer aliases...): recognised by name
        sp = [a for a in m.anims if a.type == "spin"]
        if sp and not any(a.type in ("spin", "rotate") for a in found.get("propeller", [])) and \
                any_match([cfg.get("prop_name_re", r"prop|blade|spinner|disc|disk|helice|\bpale")], m.names[:3]):
            found["propeller"] = found.get("propeller", []) + sp
        if hit:
            if hit in ("static", "skip"):
                res.append((hit, "by name", None))
                continue
            base = hit.split("_")[0]
            cand = found.get(hit) or found.get(base) or [a for a in m.anims if a.type in ("rotate", "spin")]
            res.append(("gear", "", cand) if hit == "gear" else ("part", hit, cand))
            continue
        if cfg.get("no_propellers"):
            found.pop("propeller", None)
        cat = None
        for part in PART_PRIORITY:
            if part in found:
                if part == "propeller" and not any(a.type in ("spin", "rotate") for a in found[part]) and not re.search(r"prop|disc|disk|blur|blade|spinner|helice|pale", m.name, re.I):
                    continue
                cat = part
                break
        if cat is None:
            res.append(("static", "", None))
        elif cat == "gear":
            res.append(("gear", "", found["gear"]))
        else:
            res.append(("part", cat, found[cat]))
    return res


def bbox(P):
    return P.min(axis=0), P.max(axis=0)


def inspect(aid):
    cfg = AIRCRAFT[aid]
    files, setroot, props, ml, mp = load_aircraft(aid, cfg)
    texture_overrides(ml, files, props, cfg)
    cls = classify(ml, cfg, props)
    log(f"== {aid}: model {mp[0]}/{mp[1]}, {len(ml.meshes)} meshes, levels:")
    for lv in ml.levels:
        log("   level", lv)
    log("   skipped sub-models:", ", ".join(ml.submodels_skipped)[:3000])
    log("   missing textures:", ml.missing_textures)
    tot = {}
    skips = {}
    for m, (c, k, _) in zip(ml.meshes, cls):
        lo, hi = bbox(m.pos)
        ntri = len(m.pos) // 3
        tot[c] = tot.get(c, 0) + ntri
        if c == "skip" and not VERBOSE:
            r = k[:40]
            e = skips.setdefault(r, [0, []])
            e[0] += ntri
            e[1].append(m.name)
            continue
        an = ";".join(sorted(set(f"{a.type}:{a.prop.split('/')[-1] if a.prop else ''}" for a in m.anims if a.type not in ('material', 'noshadow', 'shader'))))[:70]
        log(f"  {c:6s} {k[:30]:30s} {ntri:6d} {'/'.join(m.names[:3])[:50]:50s} "
            f"c=({(lo[0]+hi[0])/2:6.2f},{(lo[1]+hi[1])/2:6.2f},{(lo[2]+hi[2])/2:6.2f}) "
            f"s=({hi[0]-lo[0]:5.2f},{hi[1]-lo[1]:5.2f},{hi[2]-lo[2]:5.2f}) {os.path.basename(m.tex)[:14] if m.tex else '-':14s} [{an}]")
    for r, (n, names) in sorted(skips.items(), key=lambda x: -x[1][0]):
        log(f"  skip {r:40s} {n:7d} tris  {len(names)} objs: {', '.join(names[:12])[:200]}")
    log("   triangles per category:", tot)



# ============================================================================ building

A_F2G = np.array([[0, -1, 0], [0, 0, 1], [-1, 0, 0]], dtype=np.float64)  # F (aft,right,up) dir -> glTF (left,up,nose)
GLTF_LEFT, GLTF_UP, GLTF_NOSE = np.array([1.0, 0, 0]), np.array([0, 1.0, 0]), np.array([0, 0, 1.0])
DISC_RE = r"fast|disc|disk|blur"
HUB_RE = r"spinner|hub|\bcone|prop[-_ ]?nut|dome"


def tri_area(P):
    a, b, c = P[0::3], P[1::3], P[2::3]
    return np.linalg.norm(np.cross(b - a, c - a), axis=1) / 2


def line_dist(c1, a1, c2, a2):
    """distance between two (nearly parallel) lines"""
    d = c2 - c1
    n = np.cross(a1, a2)
    if np.linalg.norm(n) < 0.2:
        return np.linalg.norm(d - (d @ a1) * a1)
    return abs(d @ n) / np.linalg.norm(n)


def quat_from_matrix(Rm):
    t = np.trace(Rm)
    if t > 0:
        s = math.sqrt(t + 1.0) * 2
        w = 0.25 * s
        x = (Rm[2, 1] - Rm[1, 2]) / s
        y = (Rm[0, 2] - Rm[2, 0]) / s
        z = (Rm[1, 0] - Rm[0, 1]) / s
    elif Rm[0, 0] > Rm[1, 1] and Rm[0, 0] > Rm[2, 2]:
        s = math.sqrt(1.0 + Rm[0, 0] - Rm[1, 1] - Rm[2, 2]) * 2
        w = (Rm[2, 1] - Rm[1, 2]) / s
        x = 0.25 * s
        y = (Rm[0, 1] + Rm[1, 0]) / s
        z = (Rm[0, 2] + Rm[2, 0]) / s
    elif Rm[1, 1] > Rm[2, 2]:
        s = math.sqrt(1.0 + Rm[1, 1] - Rm[0, 0] - Rm[2, 2]) * 2
        w = (Rm[0, 2] - Rm[2, 0]) / s
        x = (Rm[0, 1] + Rm[1, 0]) / s
        y = 0.25 * s
        z = (Rm[1, 2] + Rm[2, 1]) / s
    else:
        s = math.sqrt(1.0 + Rm[2, 2] - Rm[0, 0] - Rm[1, 1]) * 2
        w = (Rm[1, 0] - Rm[0, 1]) / s
        x = (Rm[0, 2] + Rm[2, 0]) / s
        y = (Rm[1, 2] + Rm[2, 1]) / s
        z = 0.25 * s
    q = np.array([x, y, z, w])
    return q / np.linalg.norm(q)


def axis_frame(ax):
    """rotation matrix whose local +X is ax (unit, glTF frame)"""
    X = ax / np.linalg.norm(ax)
    ref = GLTF_UP if abs(X @ GLTF_UP) < 0.8 else GLTF_NOSE
    Y = ref - (ref @ X) * X
    Y /= np.linalg.norm(Y)
    Z = np.cross(X, Y)
    return np.stack([X, Y, Z], axis=1)


class Piece:
    """a mesh, or the subset of its triangles (mask) that goes into one output node"""

    def __init__(self, mesh, mask=None):
        self.mesh = mesh
        self.mask = mask  # bool per triangle or None

    def tri_idx(self):
        T = len(self.mesh.pos) // 3
        return np.arange(T) if self.mask is None else np.nonzero(self.mask)[0]

    def corners(self):
        t = self.tri_idx()
        return (t[:, None] * 3 + np.arange(3)[None]).reshape(-1)

    def points(self):
        return self.mesh.pos[self.corners()]


# ---------------------------------------------------------------- textures

_img_cache = {}


def encode_texture(path, max_px):
    key = (path, max_px)
    if key in _img_cache:
        return _img_cache[key]
    im = Image.open(path)
    im.load()
    if im.mode in ("P", "PA"):
        im = im.convert("RGBA")
    if im.mode in ("L", "LA", "I", "I;16", "F"):
        im = im.convert("RGBA" if "A" in im.mode else "RGB")
    if im.mode not in ("RGB", "RGBA"):
        im = im.convert("RGBA")
    kind = "opaque"
    if im.mode == "RGBA":
        a = np.asarray(im.getchannel("A"))
        if a.min() >= 250:
            im = im.convert("RGB")
        else:
            semi = np.mean((a > 10) & (a < 245))
            kind = "blend" if semi > 0.03 else "mask"
    w, h = im.size
    sc = min(1.0, max_px / max(w, h))
    if sc < 1.0:
        im = im.resize((max(1, round(w * sc)), max(1, round(h * sc))), Image.LANCZOS)
    buf = io.BytesIO()
    if im.mode == "RGB":
        im.save(buf, "JPEG", quality=85, optimize=True)
        mime = "image/jpeg"
    else:
        im.save(buf, "PNG", optimize=True)
        mime = "image/png"
    out = (buf.getvalue(), mime, kind, im.size)
    _img_cache[key] = out
    return out


def texture_overrides(ml, files, props, cfg):
    """Default livery: material animations (<texture>, texture-prop) and aircraft effect images."""
    for m in ml.meshes:
        for a in m.anims:
            if a.type != "material":
                continue
            tex = None
            tp = a.el.findtext("texture-prop")
            base = a.el.findtext("property-base")
            if tp and base:
                v = props.get(base.strip().rstrip("/") + "/" + tp.strip())
                if v:
                    tex = v
            if not tex:
                t = a.el.findtext("texture")
                if t and t.strip():
                    tex = t.strip()
            if tex:
                found = ml.find_texture(a.fgdir, a.cur_dir, tex)
                if found:
                    m.tex = found
    for pat, ref in cfg.get("texture_map", {}).items():
        d, p = files.resolve(cfg["fgdir"], "", ref)
        lp = files.local(d, p) if d else None
        if not lp:
            raise RuntimeError(f"texture_map: {ref} not found")
        for m in ml.meshes:
            if m.tex and re.search(pat, os.path.basename(m.tex), re.I):
                m.tex = lp
            elif pat.startswith("@") and any(re.search(pat[1:], n, re.I) for n in m.names):
                m.tex = lp


# ---------------------------------------------------------------- main build


def anim_value(a, v):
    """value of an FG rotate/translate animation for property value v (deg or m)"""
    el = a.el
    interp = el.find("interpolation")
    if interp is not None:
        pts = sorted((fnum(e.findtext("ind")), fnum(e.findtext("dep"))) for e in interp.findall("entry"))
        if pts:
            xs, ys = zip(*pts)
            return float(np.interp(v, xs, ys))
    off = fnum(el.findtext("offset-deg") or el.findtext("offset-m") or "0")
    val = v * a.factor + off
    lo = el.findtext("min-deg") or el.findtext("min-m") or el.findtext("min")
    hi = el.findtext("max-deg") or el.findtext("max-m") or el.findtext("max")
    if lo and lo.strip():
        val = max(val, fnum(lo))
    if hi and hi.strip():
        val = min(val, fnum(hi))
    return val


def translate_dir(a):
    ax = a.el.find("axis")
    if ax is None:
        return None
    if ax.find("x1-m") is not None:
        g = lambda k: fnum(ax.findtext(k))  # noqa: E731
        d = np.array([g("x2-m") - g("x1-m"), g("y2-m") - g("y1-m"), g("z2-m") - g("z1-m")])
    else:
        d = np.array([fnum(ax.findtext(k)) for k in ("x", "y", "z")])
    n = np.linalg.norm(d)
    if n < 1e-9:
        return None
    d = (a.M[:3, :3] @ d) / n
    return d


def rodrigues(ax, th):
    K = np.array([[0, -ax[2], ax[1]], [ax[2], 0, -ax[0]], [-ax[1], ax[0], 0]])
    return np.eye(3) + math.sin(th) * K + (1 - math.cos(th)) * K @ K


def equivalent_pivot(prim, pieces, v=1.0):
    if not prim.prop:
        return None
    d = np.zeros(3)
    seen = set()
    for p in pieces:
        if not any(a is prim for a in p.mesh.anims):
            continue  # only the surface(s) that the primary rotation moves
        for a in p.mesh.anims:
            if a.type == "translate" and a.prop == prim.prop and id(a) not in seen:
                seen.add(id(a))
                td = translate_dir(a)
                if td is not None:
                    d += td * anim_value(a, v)
    if np.linalg.norm(d) < 0.01:
        return None
    th = math.radians(anim_value(prim, v))
    if abs(th) < math.radians(3):
        return None
    ax = prim.axis
    R = rodrigues(ax, th)
    dp = d - (d @ ax) * ax
    x, *_ = np.linalg.lstsq(np.eye(3) - R, dp, rcond=None)
    x = x - (x @ ax) * ax
    return prim.center + x


def wheel_bottom(pieces):
    P = np.concatenate([p.points() for p in pieces])
    lo, hi = P.min(axis=0), P.max(axis=0)
    return np.array([(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, lo[2]])


def find_wheels(entries, cfg, aux_kind):
    """entries: [(mesh, category)] included meshes. Returns {key: [Piece]} in F."""
    spec = cfg.get("wheels")
    out = {}
    if spec:
        for key, pats in spec.items():
            pats = pats if isinstance(pats, list) else [pats]
            sel = [Piece(m) for m, c in entries if any_match(pats, [m.name])]
            if sel:
                out[key] = sel
        return out
    cands = []
    for m, c in entries:
        nm = m.name.lower()
        if c[0] == "part" and c[1] == "propeller":
            continue
        spin = any(a.type == "spin" and re.search(r"gear|wheel|rollspeed", a.prop, re.I) for a in m.anims)
        named = re.search(r"wheel|tyre|tire|reifen", nm) and not re.search(r"well|door|fairing|pant|spat|brake|strut|axle|bay|cover|chock|cable|hub|wheelbk", nm)
        if spin or named:
            cands.append(m)
    for m in cands:
        lo, hi = m.pos.min(axis=0), m.pos.max(axis=0)
        y = (lo[1] + hi[1]) / 2
        key = "mainLeft" if y < -0.25 else ("mainRight" if y > 0.25 else aux_kind)
        out.setdefault(key, []).append(Piece(m))
    return out


def build(aid, tex_max=None, quiet=False):
    cfg = AIRCRAFT[aid]
    t0 = time.time()
    files, setroot, props, ml, mp = load_aircraft(aid, cfg)
    texture_overrides(ml, files, props, cfg)
    cls = classify(ml, cfg, props)
    jsb = jsbsim_info(cfg["jsbsim"]) if cfg.get("jsbsim") else None
    con = pick_contacts(jsb, cfg) if jsb else {}
    aux_kind = "nose" if ("nose" in con or not jsb) else "tail"
    retract = cfg.get("retractable")
    if retract is None and jsb:
        root = ET.parse(jsb["path"]).getroot()
        retract = any(
            (c.findtext("retractable") or "0").strip() == "1"
            for c in root.find("ground_reactions").findall("contact")
            if c.get("name") in (con.get("mainLeft", ("",))[0], con.get("mainRight", ("",))[0])
        )
    if retract is None:  # no flight model: retractable if FG animates any gear with gear position
        retract = any(c[0] == "gear" for c in cls)
    notes = []
    scale = cfg.get("scale", 1.0)
    if scale != 1.0:
        for m in ml.meshes:
            m.pos = m.pos * scale
        for a in ml.anims:
            if a.center is not None:
                a.center = a.center * scale

    entries = [(m, c) for m, c in zip(ml.meshes, cls) if c[0] != "skip"]

    # ---- wheels and alignment (F frame -> JSBSim structural, translation only)
    wheels = find_wheels([(m, c) for m, c in entries], cfg, aux_kind)
    for k in ("mainLeft", "mainRight"):
        if k not in wheels:
            raise RuntimeError(f"{aid}: no {k} wheel found (set cfg['wheels'])")
    wb = {k: wheel_bottom(v) for k, v in wheels.items()}
    if not quiet:
        log("   wheels: " + "; ".join(f"{k}: {', '.join(sorted({p.mesh.name for p in v}))[:80]} -> {fmt(wb[k])}" for k, v in wheels.items()))
    model_main = (wb["mainLeft"] + wb["mainRight"]) / 2
    if jsb:
        jl, jr = con["mainLeft"][1], con["mainRight"][1]
        jsb_main = (jl + jr) / 2
        T = jsb_main - model_main
        cg = jsb["cg"]
    else:
        # no flight model: origin at the centre of the bounding box in x (lateral) and z (fore/aft),
        # y = 0 at the bottom of the main tyres (the ground with the gear down)
        PP = np.concatenate([m.pos for m, _ in entries])
        lo_, hi_ = PP.min(axis=0), PP.max(axis=0)
        cg = np.zeros(3)
        T = -np.array([(lo_[0] + hi_[0]) / 2, (lo_[1] + hi_[1]) / 2, model_main[2]])
        jl = jr = jsb_main = model_main + T
        if aux_kind in wb and wb[aux_kind][0] > model_main[0]:
            wb["tail"] = wb.pop(aux_kind)
            aux_kind = "tail"

    def to_gltf(P):
        return (np.asarray(P) + T - cg) @ A_F2G.T

    def dir_gltf(D):
        return np.asarray(D) @ A_F2G.T

    track_model = wb["mainRight"][1] - wb["mainLeft"][1]
    track_jsb = (jr[1] - jl[1]) if jsb else track_model
    aux_err = None
    if aux_kind in wb and aux_kind in con:
        e = (wb[aux_kind] + T) - con[aux_kind][1]
        aux_err = e
    vrp_note = ""
    if jsb and jsb.get("vrp") is not None:
        dv = T - jsb["vrp"]
        vrp_note = f"(FG would place the model origin at the JSBSim VRP; this alignment differs from that by x {dv[0]*100:+.0f} cm, z {dv[2]*100:+.0f} cm)"

    # ---- group pieces into output nodes
    groups = {}  # node name -> list of Piece
    part_anims = {}  # node name -> list of anims
    static = []
    gear = []
    by_name = cfg.get("parts_by_name", {})
    for m, (cat, key, anims) in entries:
        if cat == "static":
            static.append(Piece(m))
            continue
        if cat == "gear":
            (gear if retract else static).append(Piece(m))
            continue
        # parts
        if key == "propeller":
            eng = 0
            for a in anims or []:
                mm = re.search(r"engine\[(\d+)\]", a.prop)
                if mm:
                    eng = int(mm.group(1))
                    break
            eng = cfg.get("engine_map", {}).get(eng, eng)
            node = f"__prop{eng}"
            groups.setdefault(node, []).append(Piece(m))
            part_anims.setdefault(node, []).extend(a for a in anims if a.type in ("spin", "rotate"))
            continue
        anims = [a for a in (anims or []) if a.type in ("rotate", "spin")]
        if key in ("aileron", "flap"):
            base = key.split("_")[0]
            tri_y = m.pos[0::3, 1] + m.pos[1::3, 1] + m.pos[2::3, 1]
            for side, mask in (("left", tri_y < 0), ("right", tri_y >= 0)):
                if mask.any():
                    node = f"{base}_{side}"
                    groups.setdefault(node, []).append(Piece(m, mask if not mask.all() else None))
                    part_anims.setdefault(node, []).extend(anims)
            continue
        groups.setdefault(key, []).append(Piece(m))
        part_anims.setdefault(key, []).extend(anims)

    # propellers: engine 0 -> "propeller", the next engines (sorted by FG engine index) -> propeller_2, _3 ...
    pk = sorted(k for k in groups if k.startswith("__prop"))
    for i, k in enumerate(pk):
        nn = "propeller" if i == 0 else f"propeller_{i + 1}"
        groups[nn] = groups.pop(k)
        part_anims[nn] = part_anims.pop(k, [])

    # ---- hinges. Each part's pieces are clustered by FG hinge animation; the biggest cluster gives the
    # node its axis. Other clusters of a similar orientation and a real size (inner/outer flaps, swept
    # elevator halves, centre flap) become child nodes with their own exact hinge; small linkages that
    # turn about other axes (rudder cables, steering, flap-track fairings) stay static.
    def want_dir(node):
        return GLTF_NOSE if node.startswith("propeller") else (GLTF_UP if node.startswith("rudder") else GLTF_LEFT)

    def gltf_hinge(node, cF, aF):
        c = to_gltf(cF[None])[0]
        ag = dir_gltf(aF[None])[0]
        ag /= np.linalg.norm(ag)
        if ag @ want_dir(node) < 0:
            ag = -ag
        return c, ag

    def hinge_mid(c, ag, pieces):
        """point on the hinge line (glTF) at the middle of the pieces' extent along it"""
        P = to_gltf(np.concatenate([p.points() for p in pieces]))
        tt = (P - c) @ ag
        return c + ag * (tt.min() + tt.max()) / 2

    POS = {"elevator": "trailing edge UP", "rudder": "trailing edge to the pilot's RIGHT"}
    prop_info = []
    node_defs = []  # (name, pieces, R (glTF), t (glTF), extras, [(kid name, pieces, R, t, extras)])
    for node in sorted(groups):
        pieces = groups[node]
        anims, seen = [], set()
        for a in part_anims.get(node, []):
            if id(a) not in seen and a.axis is not None:
                seen.add(id(a))
                anims.append(a)
        if not anims and not cfg.get("hinge_override", {}).get(node):
            notes.append(f"{node}: no usable hinge animation found in the FG model, kept static")
            static.extend(pieces)
            continue
        area = {}
        for p in pieces:
            ar = tri_area(p.points()).sum()
            for a in p.mesh.anims:
                if id(a) in seen:
                    area[id(a)] = area.get(id(a), 0) + ar
        tol = cfg.get("hinge_tolerance_m", {}).get(node, 0.15)
        clusters = []  # [prim, pieces, area]
        if node.startswith("propeller") or cfg.get("hinge_override", {}).get(node):
            prim = max(anims, key=lambda a: area.get(id(a), 0)) if anims else None
            clusters.append([prim, list(pieces), 1.0, [prim] if prim else []])
        else:
            remaining = sorted(anims, key=lambda a: -area.get(id(a), 0))
            assigned = set()
            while remaining:
                prim = remaining[0]
                compat = [a for a in remaining if abs(a.axis @ prim.axis) > 0.9 and line_dist(prim.center, prim.axis, a.center, a.axis) < tol]
                remaining = [a for a in remaining if all(a is not c_ for c_ in compat)]
                cids = {id(a) for a in compat}
                cp = [p for p in pieces if id(p) not in assigned and any(id(a) in cids for a in p.mesh.anims)]
                for p in cp:
                    assigned.add(id(p))
                if cp:
                    clusters.append([prim, cp, sum(tri_area(p.points()).sum() for p in cp), compat])
            left = [p for p in pieces if id(p) not in assigned]
            clusters.sort(key=lambda c_: -c_[2])
            main = clusters[0]
            keep_c = [main]
            def wheelish(c_):
                return any(re.search(r"wheel|tire|tyre|strut|axle", p.mesh.name, re.I) or
                           any(re.search(r"compression|steer|rollspeed|gear/", a.prop or "", re.I) for a in p.mesh.anims) for p in c_[1])
            for c_ in clusters[1:]:
                if abs(c_[0].axis @ main[0].axis) > 0.5 and c_[2] >= 0.15 * main[2] and not wheelish(c_):
                    keep_c.append(c_)
                else:
                    left.extend(c_[1])
            if left:
                if not quiet:
                    log(f"   {node}: {len(left)} piece(s) on other hinges kept static: " + ", ".join(sorted({p.mesh.name for p in left}))[:160])
                static.extend(left)
            clusters = keep_c
        if len(clusters) > 1 and not quiet:
            log(f"   {node}: hinge groups: " + " | ".join(", ".join(sorted({p.mesh.name for p in c_[1]})) + f" ({c_[2]:.1f} m2)" for c_ in clusters))
        # hinge of every cluster (glTF), with the Fowler-flap pivot where FG also translates the surface
        hz = []
        for prim, cp, _, compat in clusters:
            ho = cfg.get("hinge_override", {}).get(node)
            if ho:
                cF, aF = np.array(ho[0], float), np.array(ho[1], float) / np.linalg.norm(ho[1])
            else:
                cF, aF = prim.center, prim.axis
                if node == "elevator" and len(compat) > 1:
                    # mirrored halves on nearly the same hinge (dihedral / anhedral): average them
                    acc = sum((1.0 if a.axis @ prim.axis >= 0 else -1.0) * a.axis * (area.get(id(a), 0) + 1e-9) for a in compat)
                    aF = acc / np.linalg.norm(acc)
                    cc = sum(a.center * (area.get(id(a), 0) + 1e-9) for a in compat) / sum(area.get(id(a), 0) + 1e-9 for a in compat)
                    cF = prim.center + ((cc - prim.center) @ aF) * aF
                    cF = cc if abs(cc[1]) < abs(cF[1]) else cF
                piv = equivalent_pivot(prim, cp)
                if piv is not None:
                    fowler_note = ("Flaps: FlightGear moves them with a rotation plus a translation (Fowler-type); the flap nodes "
                                   "use the single pivot that gives FG's position at full flap (in between it is approximate).")
                    if fowler_note not in notes:
                        notes.append(fowler_note)
                    if not quiet:
                        log(f"   {node}: rotate+translate in FG -> equivalent pivot {fmt(piv)} (FG centre {fmt(prim.center)})")
                    cF = piv
            c, ag = gltf_hinge(node, cF, aF)
            hz.append((c, ag, cp))

        if node.startswith("propeller"):
            c, ag, _ = hz[0]
            # node origin on the axis, at the middle of the blades
            P = to_gltf(np.concatenate([p.points() for p in pieces]))
            c = c + ((P.mean(axis=0) - c) @ ag) * ag
            Rm = axis_frame(ag)
            suffix = node[len("propeller"):]
            sub = {"blades": [], "disc": [], "hub": []}
            for p in pieces:
                nm = " ".join(p.mesh.names[:2])
                k = "disc" if re.search(cfg.get("disc_re", DISC_RE), nm, re.I) else ("hub" if re.search(cfg.get("hub_re", HUB_RE), nm, re.I) else "blades")
                sub[k].append(p)
            P = to_gltf(np.concatenate([p.points() for p in (sub["blades"] or sub["disc"] or pieces)]))
            d = P - c
            radial = d - np.outer(d @ ag, ag)
            radius = float(np.linalg.norm(radial, axis=1).max())
            prop_info.append({"node": node, "radiusM": round(radius, 3), "position": [round(float(x), 3) for x in c]})
            kids = []
            if sub["blades"]:
                kids.append(("propeller_blades" + suffix, sub["blades"], Rm, c, None))
            if sub["disc"]:
                kids.append(("propeller_disc" + suffix, sub["disc"], Rm, c, None))
            node_defs.append((node, sub["hub"], Rm, c, {"spin": "local +X points forward; positive angle = clockwise seen from the cockpit"}, kids))
            continue

        ex = {"hinge": "local +X", "positive": POS.get(node, "trailing edge UP")}
        if len(hz) == 1:
            c, ag, cp = hz[0]
            node_defs.append((node, cp, axis_frame(ag), c, ex, []))
            continue
        # several hinges: geometry goes into child nodes with exact hinges; the parent turns them all
        # together about one compromise axis (exact for the first child)
        ys = [float(np.mean(to_gltf(np.concatenate([p.points() for p in cp]))[:, 0])) for _, _, cp in hz]
        mirrored = node == "elevator" and len(hz) == 2 and ys[0] * ys[1] < 0
        kids = []
        for i, (c, ag, cp) in enumerate(hz):
            kname = (f"{node}_{'left' if ys[i] > 0 else 'right'}") if mirrored else f"{node}_{i + 1}"
            kids.append((kname, cp, axis_frame(ag), hinge_mid(c, ag, cp), dict(ex, note=f"exact hinge of one segment; turn either '{node}' or its children, not both")))
        if mirrored:
            axs = sum(h[1] for h in hz)
            pc = sum(hinge_mid(h[0], h[1], h[2]) for h in hz) / len(hz)
            pa = axs / np.linalg.norm(axs)
            note = "two halves with swept hinges: turning this node moves both about one lateral axis (approximate); elevator_left / elevator_right have the exact hinges"
        else:
            pc, pa = kids[0][3], hz[0][1]
            note = f"several segments: turning this node moves them all about the hinge of {kids[0][0]} (exact for it, approximate for the others); the children have exact hinges"
        notes.append(f"{node}: {note}.")
        node_defs.append((node, [], axis_frame(pa), pc, dict(ex, note=note), kids))

    # ---- materials / textures
    builder = GlbBuilder("TeachX scripts/fg-aircraft/convert.py", cfg.get("copyright"))
    tex_max = tex_max or cfg.get("tex_max", 1024)
    mat_index = {}
    tex_index = {}
    glass_re = cfg.get("glass")
    double_all = cfg.get("double_all", True)  # no see-through holes into the empty cabin
    tex_bytes = 0

    def material_for(mesh, mi, dbl, disc=False):
        nonlocal tex_bytes
        acm = ml.ac_materials[mesh.src][mi] if mi < len(ml.ac_materials[mesh.src]) else None
        rgb = list(acm.rgb) if acm else [0.8, 0.8, 0.8]
        alpha = 1.0 - (acm.trans if acm else 0.0)
        shi = acm.shi if acm else 0
        glass = bool(glass_re and any_match([glass_re], mesh.names))
        if glass and alpha > 0.6:
            alpha = cfg.get("glass_alpha", 0.35)
        if cfg.get("material_rgb"):
            for pat, col in cfg["material_rgb"].items():
                if any_match([pat], mesh.names):
                    rgb = list(col)
        key = (mesh.src, mi, mesh.tex, dbl or double_all, glass, tuple(rgb), alpha, disc)
        if key in mat_index:
            return mat_index[key]
        tex = None
        kind = "opaque"
        if mesh.tex:
            if mesh.tex not in tex_index:
                data, mime, k, size = encode_texture(mesh.tex, tex_max)
                tex_bytes += len(data)
                tex_index[mesh.tex] = (builder.add_image(data, mime, os.path.basename(mesh.tex)), k)
            tex, kind = tex_index[mesh.tex]
        if disc and kind == "opaque":
            # FG fades these discs with blend/transparency animations; a solid disc would hide the nose
            alpha = min(alpha, cfg.get("disc_alpha", 0.22))
            rgb = [min(c, 0.75) for c in rgb]
        if alpha < 0.99 or kind == "blend" or glass:
            mode = "BLEND"
            nm = ((acm.name if acm else "") + " " + " ".join(mesh.names[:2])).lower()
            if not disc and re.search(r"glas|window|canopy|windshield|windscreen|vitre|cristal|transp|screen", nm) and "inside" not in nm and "interior" not in nm:
                # FG draws glass with a reflection shader; with no shader, nearly invisible glass would leave
                # holes into the empty cabin, so keep it at least lightly tinted
                alpha = max(alpha, cfg.get("glass_min_alpha", 0.25))
        elif kind == "mask":
            mode = "MASK"
        else:
            mode = "OPAQUE"
        rough = max(0.3, min(1.0, 1.0 - (shi / 128.0) * 0.7))
        name = (acm.name if acm and acm.name else f"m{mi}") + (f"_{os.path.basename(mesh.tex)}" if mesh.tex else "")
        idx = builder.add_material(name[:60], rgb + [alpha], rough, tex, mode, 0.5 if mode == "MASK" else None,
                                   double=(dbl or double_all or mode == "BLEND"))
        mat_index[key] = idx
        return idx

    total_tris = 0

    def make_mesh(name, pieces, Rm, t):
        nonlocal total_tris
        disc = name.startswith("propeller_disc")
        if not pieces:
            return None
        prims = {}
        for p in pieces:
            m = p.mesh
            ti = p.tri_idx()
            if len(ti) == 0:
                continue
            for mi in np.unique(m.mat[ti]):
                for dbl in (False, True):
                    sel = ti[(m.mat[ti] == mi) & (m.double[ti] == dbl)]
                    if len(sel) == 0:
                        continue
                    mat = material_for(m, int(mi), bool(dbl), disc)
                    cidx = (sel[:, None] * 3 + np.arange(3)[None]).reshape(-1)
                    P = to_gltf(m.pos[cidx])
                    N = dir_gltf(m.nrm[cidx])
                    UV = m.uv[cidx]
                    P = (P - t) @ Rm  # into the node's local frame
                    N = N @ Rm
                    e = prims.setdefault(mat, [[], [], [], m.tex is not None])
                    e[0].append(P)
                    e[1].append(N)
                    e[2].append(UV)
        out = []
        for mat, (Ps, Ns, UVs, has_tex) in prims.items():
            P = np.concatenate(Ps)
            N = np.concatenate(Ns)
            UV = np.concatenate(UVs)
            key = np.concatenate([np.round(P, 5), np.round(N, 3), np.round(UV, 5) if has_tex else np.zeros((len(P), 2))], axis=1)
            uniq, inv = np.unique(key, axis=0, return_inverse=True)
            inv = inv.reshape(-1)
            first = np.zeros(len(uniq), dtype=np.int64)
            first[inv[::-1]] = np.arange(len(inv))[::-1]
            Pu, Nu, UVu = P[first], N[first], UV[first]
            nl = np.linalg.norm(Nu, axis=1)
            Nu = Nu / np.where(nl > 1e-9, nl, 1)[:, None]
            # split very large primitives so 16-bit indices are not exceeded needlessly (uint32 is used anyway)
            out.append((Pu, Nu, UVu if has_tex else None, inv, mat))
            total_tris += len(inv) // 3
        return builder.add_mesh(name, out) if out else None

    node_ids = []
    I3 = np.eye(3)
    body_mesh = make_mesh("body", static, I3, np.zeros(3))
    node_ids.append(builder.add_node("body", body_mesh))
    if gear:
        gm = make_mesh("gear_retract", gear, I3, np.zeros(3))
        node_ids.append(builder.add_node("gear_retract", gm, extras={"note": "landing gear legs, wheels and doors; hide when the gear is up"}))
    parts = ["body"] + (["gear_retract"] if gear else [])
    for name, pieces, Rm, t, extras, kids in node_defs:
        mesh = make_mesh(name, pieces, Rm, t)
        kid_ids = []
        for kname, kp, kR, kt, kex in kids:
            km = make_mesh(kname, kp, kR, kt)
            Rrel = Rm.T @ kR
            trel = Rm.T @ (kt - t)
            kid_ids.append(builder.add_node(kname, km, translation=trel, rotation=quat_from_matrix(Rrel), extras=kex))
            parts.append(kname)
        node_ids.append(builder.add_node(name, mesh, translation=t, rotation=quat_from_matrix(Rm), children=kid_ids, extras=extras))
        parts.append(name)
    root_extras = {
        "source": f"FlightGear {cfg['fgdir']} ({cfg.get('licence', 'GPL-2.0-or-later')}), converted by TeachX scripts/fg-aircraft",
        "axes": "glTF +Z nose, +Y up, +X left wing. Origin = JSBSim centre of gravity. Metres.",
        "movingParts": "Every moving node turns about its own local +X axis (see each node's extras).",
    }
    root_extras["teachxDebug"] = {
        "jsbsimContacts": {k: fmt((v[1] - cg) @ A_F2G.T) for k, v in con.items()},
        "jsbsimCgGltf": [0, 0, 0],
        "groundY": round(float(((jsb_main - cg) @ A_F2G.T)[1]), 4),
    }
    root_id = builder.add_node(aid, None, children=node_ids, extras=root_extras)
    builder.set_roots([root_id], aid)

    # ---- bounds etc. (glTF frame, all geometry)
    allP = to_gltf(np.concatenate([p.points() for p in static + gear + [q for _, ps, _, _, _, kids in node_defs for q in ps + [x for k in kids for x in k[1]]]]))
    lo, hi = allP.min(axis=0), allP.max(axis=0)
    span = hi[0] - lo[0]
    eye = None
    v0 = view0(setroot)
    if v0 is not None:
        eyeF = np.array([v0[2], v0[0], v0[1]]) * scale
        eye = to_gltf(eyeF[None])[0]
    if cfg.get("eye_override") is not None:
        eye = to_gltf(np.array(cfg["eye_override"])[None])[0]
    wheels_g = {k: [round(float(x), 3) for x in to_gltf(v[None])[0]] for k, v in wb.items()}
    data = builder.bytes()
    if jsb and abs(span / jsb["span"] - 1) > 0.10:
        notes.append(f"Model span {span:.2f} m vs JSBSim wingspan {jsb['span']:.2f} m ({(span/jsb['span']-1)*100:+.0f}%).")
    info = {
        "aid": aid, "data": data, "tris": total_tris, "bounds": [lo, hi], "span": span, "eye": eye,
        "wheels": wheels_g, "props": prop_info, "parts": parts, "retract": bool(gear), "notes": notes,
        "T": T, "aux_err": aux_err, "aux_kind": aux_kind, "track": (track_model, track_jsb), "vrp_note": vrp_note,
        "jsb": jsb, "con": con, "tex_bytes": tex_bytes, "secs": time.time() - t0, "missing_tex": ml.missing_textures,
        "ground_y": float(to_gltf(jsb_main[None])[0][1]),
    }
    return info



# ============================================================================ outputs


def fmt(v, nd=3):
    return [round(float(x), nd) for x in v]


def meta_of(aid, info):
    cfg = AIRCRAFT[aid]
    lo, hi = info["bounds"]
    notes = list(cfg.get("notes", []))
    ae = info["aux_err"]
    if ae is not None:
        cm = lambda v: f"{round(v * 100):+d}".replace("+0", "0")  # noqa: E731
        notes.insert(0, f"Aligned on the JSBSim main-gear contact points; the {info['aux_kind']} wheel then differs from the JSBSim {info['aux_kind']} contact by {cm(ae[0])} cm fore/aft (+ = model wheel further aft) and {cm(ae[2])} cm vertically (+ = model tyre higher).")
    tm, tj = info["track"]
    if abs(tm - tj) > 0.15:
        notes.append(f"Main-gear track: model {tm:.2f} m, JSBSim {tj:.2f} m.")
    notes += info["notes"]
    if info["missing_tex"]:
        notes.append("Textures not available (surfaces drawn in their plain material colour): " + ", ".join(sorted({re.split(r"[\\\\/]", t)[-1] for t in info["missing_tex"]})) + ".")
    src = credits_of(aid)
    return {
        "url": f"models/fg/{aid}.glb",
        "source": {"aircraft": src["aircraft"], "revision": src["revision"], "licence": src["licence"], "authors": src["authors"], "page": src["page"]},
        "lengthM": round(float(hi[2] - lo[2]), 3),
        "spanM": round(float(hi[0] - lo[0]), 3),
        "heightM": round(float(hi[1] - lo[1]), 3),
        "bounds": [fmt(lo), fmt(hi)],
        "eye": fmt(info["eye"]) if info["eye"] is not None else None,
        "wheels": {k: v for k, v in info["wheels"].items() if k in ("mainLeft", "mainRight", "nose", "tail")},
        "propellers": info["props"],
        "parts": info["parts"],
        "retractableGear": info["retract"],
        "triangles": int(info["tris"]),
        "bytes": len(info["data"]),
        "notes": " ".join(notes),
    }


def credits_of(aid):
    cfg = AIRCRAFT[aid]
    if cfg.get("local"):
        rev = cfg.get("revision", "FGData")
        page = cfg.get("page", "")
    else:
        rev = "?"
        fj = os.path.join(CACHE, cfg["fgdir"], "_fetch.json")
        if os.path.exists(fj):
            j = json.load(open(fj))
            rev = f"r{j['revision']}"
            if j.get("dir_revision"):
                rev += f" (folder last changed in r{j['dir_revision']})"
        page = f"https://sourceforge.net/p/flightgear/fgaddon/HEAD/tree/trunk/Aircraft/{cfg['fgdir']}/"
    return {
        "aircraft": cfg.get("title", cfg["fgdir"]),
        "revision": rev,
        "licence": cfg.get("licence", "GPL-2.0-or-later"),
        "authors": cfg.get("authors", "see the aircraft's files"),
        "page": page,
    }


def read_glb_meta(path):
    import struct
    b = open(path, "rb").read()
    n = struct.unpack("<I", b[12:16])[0]
    j = json.loads(b[20 : 20 + n])
    root = j["nodes"][j["scenes"][0]["nodes"][0]]
    meta = root.get("extras", {}).get("teachx")
    if meta is not None:
        meta["bytes"] = len(b)
    return meta


def write_glb(aid, info):
    """store the metadata inside the GLB too (root node extras.teachx), so the TS file can be rebuilt from the GLBs"""
    import struct
    meta = meta_of(aid, info)
    data = info["data"]
    n = struct.unpack("<I", data[12:16])[0]
    j = json.loads(data[20 : 20 + n])
    binchunk = data[20 + n :]
    root = j["nodes"][j["scenes"][0]["nodes"][0]]
    root.setdefault("extras", {})["teachx"] = meta
    js = json.dumps(j, separators=(",", ":")).encode("utf-8")
    while len(js) % 4:
        js += b" "
    out = struct.pack("<III", 0x46546C67, 2, 12 + 8 + len(js) + len(binchunk)) + struct.pack("<II", len(js), 0x4E4F534A) + js + binchunk
    os.makedirs(OUT_DIR, exist_ok=True)
    with open(os.path.join(OUT_DIR, aid + ".glb"), "wb") as f:
        f.write(out)
    meta["bytes"] = len(out)
    return meta


def ts_value(v, ind=4):
    if isinstance(v, dict):
        pad = " " * ind
        inner = ",\n".join(f"{pad}  {k if re.match(r'^[A-Za-z_][A-Za-z0-9_]*$', k) else json.dumps(k)}: {ts_value(x, ind + 2)}" for k, x in v.items())
        return "{\n" + inner + "\n" + pad + "}"
    if isinstance(v, list) and v and isinstance(v[0], dict):
        pad = " " * ind
        return "[\n" + ",\n".join(pad + "  " + ts_value(x, ind + 2) for x in v) + "\n" + pad + "]"
    return json.dumps(v)


def write_meta_ts(failures):
    entries = {}
    for aid in ORDER:  # only the ten World Flight Simulator aircraft (the extras go to extra.json)
        path = os.path.join(OUT_DIR, aid + ".glb")
        meta = read_glb_meta(path) if os.path.exists(path) else None
        if meta is None:
            src = credits_of(aid)
            meta = {
                "url": "", "source": src, "lengthM": 0, "spanM": 0, "heightM": 0, "bounds": [[0, 0, 0], [0, 0, 0]],
                "eye": [0, 0, 0], "wheels": {"mainLeft": [0, 0, 0], "mainRight": [0, 0, 0]}, "propellers": [], "parts": [],
                "retractableGear": False, "triangles": 0, "bytes": 0,
                "notes": "Conversion failed: " + failures.get(aid, "not converted yet"),
            }
        if meta.get("eye") is None:
            meta["eye"] = [0, 0, 0]
            meta["notes"] += " No view 0 in the -set.xml: eye is a placeholder (0,0,0)."
        entries[aid] = meta
    ids = "|".join(json.dumps(a) for a in entries)
    lines = [
        "/**",
        " * GENERATED by scripts/fg-aircraft/convert.py — do not edit by hand (run the script again instead).",
        " * FlightGear aircraft exterior models converted to glTF (public/models/fg/<id>.glb).",
        " * Frame of every number below (same as the trainer model): glTF +Z nose, +Y up, +X LEFT wing, metres,",
        " * origin = the JSBSim flight model's centre of gravity (fuselage at the JSBSim structural attitude).",
        " * Moving parts are nodes that turn about their own local +X axis; positive angle =",
        " *   elevator / ailerons / flaps: trailing edge UP;  rudder: trailing edge to the pilot's RIGHT;",
        " *   propeller: clockwise seen from the cockpit (axis points forward).",
        " * Licences: these models are GPL (see public/models/fg/CREDITS.md).",
        " */",
        "export interface FgModelMeta {",
        "  url: string; // \"models/fg/<id>.glb\" (relative, no leading slash)",
        "  source: { aircraft: string; revision: string; licence: string; authors: string; page: string };",
        "  lengthM: number;",
        "  spanM: number;",
        "  heightM: number;",
        "  bounds: [[number, number, number], [number, number, number]]; // glTF frame",
        "  eye: [number, number, number]; // pilot's eye point (FG view 0), glTF frame",
        "  wheels: { mainLeft: [number, number, number]; mainRight: [number, number, number]; nose?: [number, number, number]; tail?: [number, number, number] }; // tyre bottoms",
        "  propellers: { node: string; radiusM: number; position: [number, number, number] }[];",
        "  parts: string[]; // node names present",
        "  retractableGear: boolean;",
        "  triangles: number;",
        "  bytes: number;",
        "  notes: string;",
        "}",
        "",
        f"export const FG_MODELS: Record<{ids}, FgModelMeta> = {{",
    ]
    for aid in entries:
        lines.append(f"  {aid}: {ts_value(entries[aid], 2)},")
    lines.append("};")
    lines.append("")
    os.makedirs(os.path.dirname(META_TS), exist_ok=True)
    with open(META_TS, "w") as f:
        f.write("\n".join(lines))
    return entries


def write_extra_json():
    """public/models/fg/extra.json: the aircraft without a JSBSim model (Scenario Simulator)."""
    out = {}
    for aid in EXTRA:
        path = os.path.join(OUT_DIR, aid + ".glb")
        if not os.path.exists(path):
            continue
        m = read_glb_meta(path)
        out[aid] = {"url": m["url"], "source": AIRCRAFT[aid]["fgdir"], "spanM": m["spanM"], "lengthM": m["lengthM"], "notes": m["notes"]}
    with open(os.path.join(OUT_DIR, "extra.json"), "w") as f:
        json.dump(out, f, indent=2, ensure_ascii=False)
        f.write("\n")
    return out


def write_credits(entries):
    out = [
        "# FlightGear aircraft models — credits and licences",
        "",
        "The `.glb` files in this folder are conversions of aircraft 3D models from the FlightGear flight",
        "simulator project (https://www.flightgear.org). They are **not** original TeachX work: each model",
        "keeps the licence stated in its own aircraft files (GNU GPL, see below). Each was",
        "**converted to glTF (textures resized, exterior only) by the TeachX project** with",
        "`scripts/fg-aircraft/convert.py` (cockpit, instruments, pilots, effects and lights removed;",
        "default livery only; model moved so that its centre of gravity and wheels match the JSBSim",
        "flight model used by TeachX). The GPL requires that the source of these files stays available:",
        "the original FlightGear files can be downloaded from the pages below, and the converter is in this",
        "repository.",
        "",
    ]
    extra_present = [a for a in EXTRA if os.path.exists(os.path.join(OUT_DIR, a + ".glb"))]
    for aid in ORDER + extra_present:
        if aid == (extra_present[0] if extra_present else None):
            out += ["# Extra models (no JSBSim flight model; Scenario Simulator)", ""]
        c = credits_of(aid)
        e = entries.get(aid, {"url": "x"})
        out += [
            f"## {aid}.glb — {c['aircraft']}",
            "",
            f"- Authors: {c['authors']}",
            f"- Licence: {c['licence']}",
            f"- Source: {c['page']}",
            f"- Version: {c['revision']}",
            f"- Converted to glTF (textures resized, exterior only) by the TeachX project." + ("" if e.get("url") else " **(conversion failed — no file)**"),
            "",
        ]
    with open(os.path.join(OUT_DIR, "CREDITS.md"), "w") as f:
        f.write("\n".join(out))


def main(argv):
    ids = argv or (ORDER + EXTRA)
    failures = {}
    for aid in ids:
        cfg = AIRCRAFT[aid]
        budget = cfg.get("budget", 10e6 if aid in ("A320", "f16") else 6e6)
        try:
            info = build(aid)
            tm = cfg.get("tex_max", 1024)
            while len(info["data"]) > budget and tm > 256:
                tm //= 2
                log(f"   {aid}: {len(info['data'])/1e6:.1f} MB > budget, textures down to {tm} px")
                info = build(aid, tex_max=tm, quiet=True)
            meta = write_glb(aid, info)
        except Exception as e:  # keep going with the others
            import traceback
            traceback.print_exc()
            failures[aid] = f"{type(e).__name__}: {e}"
            log(f"!! {aid} FAILED: {e}")
            continue
        ae = info["aux_err"]
        log(f"== {aid}: {meta['bytes']/1e6:.2f} MB, {meta['triangles']} tris, textures {info['tex_bytes']/1e6:.2f} MB, "
            f"parts {meta['parts']}, span {meta['spanM']} m (JSBSim {info['jsb']['span'] if info['jsb'] else float('nan'):.2f}), "
            f"{info['aux_kind']} err dx {ae[0]*100 if ae is not None else float('nan'):+.1f} cm dz {ae[2]*100 if ae is not None else float('nan'):+.1f} cm, "
            f"T={fmt(info['T'])} {info['vrp_note']} ({info['secs']:.1f}s)")
    entries = write_meta_ts({k: v for k, v in failures.items() if k in ORDER})
    write_extra_json()
    write_credits(entries)
    total = sum(e["bytes"] for e in entries.values())
    log(f"total {total/1e6:.2f} MB")
    return 0 if not failures else 1


VERBOSE = os.environ.get("VERBOSE") == "1"


if __name__ == "__main__":
    if len(sys.argv) > 2 and sys.argv[1] == "--inspect":
        for a in sys.argv[2:]:
            inspect(a)
        sys.exit(0)
    sys.exit(main(sys.argv[1:]))
