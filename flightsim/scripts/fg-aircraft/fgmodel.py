"""
Reading FlightGear aircraft models: AC3D (.ac) files, model XML (<path>, <offsets>, <model>,
<animation>, <effect>), -set.xml property defaults and <condition> blocks.

Frames
  AC3D file:        y up (as written by the modeller)
  FG model frame:   x aft, y right, z up, metres:  (x, y, z)_fg = (x_ac, -z_ac, y_ac)
  aircraft frame F: FG model frame after every <offsets> of the model XML chain (origin = FG's
                    reference point of the aircraft). Everything this module returns is in F.
"""
import os
import re
import math
import xml.etree.ElementTree as ET

import numpy as np

# ----------------------------------------------------------------------------- XML helpers


def parse_xml_file(path):
    try:
        return ET.parse(path).getroot()
    except ET.ParseError:
        s = open(path, "rb").read().decode("utf-8", "replace")
        s = re.sub(r"<\?xml[^>]*\?>", "", s, count=1)
        s = re.sub(r"<!--.*?-->", "", s, flags=re.S)
        end = s.rfind("</PropertyList>")
        if end >= 0:
            s = s[: end + len("</PropertyList>")]
        return ET.fromstring(s)


class Files:
    """Maps FG paths ("Aircraft/<Dir>/..." or relative) to local files of the download cache."""

    def __init__(self, roots, main_dir):
        self.roots = roots  # {fgdir: local folder}
        self.main_dir = main_dir

    def resolve(self, cur_fgdir, cur_dir, ref):
        ref = ref.strip().replace("\\", "/").lstrip("/")
        if ref.lower().startswith("aircraft/"):
            parts = ref.split("/", 2)
            if len(parts) == 3:
                d = parts[1]
                return d, os.path.normpath(parts[2])
            return None, ref
        return cur_fgdir, os.path.normpath(os.path.join(cur_dir, ref))

    def local(self, fgdir, path):
        root = self.roots.get(fgdir)
        if root is None:
            return None
        p = os.path.join(root, path)
        return p if os.path.exists(p) else None


def load_xml_includes(files, fgdir, path, depth=0, aliases=True):
    """Parse an FG PropertyList, merging include="..." files (included content first)."""
    lp = files.local(fgdir, path)
    if not lp:
        return None
    root = parse_xml_file(lp)
    cur = os.path.dirname(path)

    def merge(el):
        for ch in list(el):
            merge(ch)
        inc = el.get("include")
        if inc and depth < 8:
            d, p = files.resolve(fgdir, cur, inc)
            sub = load_xml_includes(files, d, p, depth + 1) if d else None
            if sub is not None:
                own = list(el)
                for ch in own:
                    el.remove(ch)
                tag = f"{fgdir}/{p}#{id(sub)}"
                for ch in list(sub):
                    if ch.get("__inc") is None:
                        ch.set("__inc", tag)
                    el.append(ch)
                for ch in own:
                    el.append(ch)
                # text value of the included root, if any
                if (el.text or "").strip() == "" and (sub.text or "").strip():
                    el.text = sub.text

    merge(root)
    if depth == 0 and aliases:
        resolve_aliases(root)
    return root


def _find_path(root, path):
    el = root
    for c in path.strip("/").split("/"):
        m = re.match(r"([^\[]+)(?:\[(\d+)\])?$", c)
        if not m:
            return None
        name, idx = m.group(1), int(m.group(2) or 0)
        kids = [k for k in el if k.tag == name]
        # honour n="..." attributes when present
        hit = [k for k in kids if k.get("n") is not None and int(k.get("n")) == idx]
        el = hit[0] if hit else (kids[idx] if idx < len(kids) else None)
        if el is None:
            return None
    return el


def resolve_aliases(root):
    """<property alias="/params/x"/> or alias="../../params/x" -> the text found there in the same file."""
    parent = {c: p for p in root.iter() for c in p}
    for _ in range(4):
        changed = False
        for el in root.iter():
            al = el.get("alias")
            if not al:
                continue
            if al.startswith("/"):
                tgt = _find_path(root, al)
            else:
                cur = el
                tgt = None
                parts = al.split("/")
                while parts and parts[0] in ("..", "."):
                    if parts.pop(0) == "..":
                        cur = parent.get(cur)
                        if cur is None:
                            break
                if cur is not None:
                    tgt = _find_path(cur, "/".join(parts)) if parts else cur
            if tgt is not None and tgt.get("alias") is None:
                el.text = tgt.text
                el.set("__alias", al)
                del el.attrib["alias"]
                changed = True
        if not changed:
            break


def norm_prop(p):
    """'/engines/engine/rpm' -> 'engines/engine[0]/rpm'"""
    out = []
    for c in p.strip().strip("/").split("/"):
        if not c:
            continue
        if c == "..":
            if out:
                out.pop()
            continue
        if not re.search(r"\[\d+\]$", c):
            c = c + "[0]"
        out.append(c)
    return "/".join(out)


def flatten_props(root, prefix="", out=None):
    """-set.xml -> {normalised property path: text}"""
    if out is None:
        out = {}
    counts = {}
    for ch in root:
        if not isinstance(ch.tag, str):
            continue
        n = ch.get("n")
        ck = (ch.tag, ch.get("__inc"))  # indices restart in every included file (FG props_io)
        if n is None:
            n = counts.get(ck, 0)
        else:
            n = int(fnum(n))
        counts[ck] = max(counts.get(ck, 0), n + 1)
        key = (prefix + "/" if prefix else "") + f"{ch.tag}[{n}]"
        if len(ch):
            flatten_props(ch, key, out)
        elif ch.get("alias"):
            out[key] = "@alias:" + ch.get("alias")
        else:
            out[key] = (ch.text or "").strip()
    if not prefix:  # resolve aliases on the merged tree, like FG does at run time
        for _ in range(4):
            for k, v in list(out.items()):
                if v.startswith("@alias:"):
                    tgt = out.get(norm_prop(v[7:]))
                    if tgt is not None and not tgt.startswith("@alias:"):
                        out[k] = tgt
        for k, v in list(out.items()):
            if v.startswith("@alias:"):
                out[k] = ""
    return out


# ----------------------------------------------------------------------------- conditions

DYNAMIC_PROPS = re.compile(
    r"(rpm|propeller[-/]|/prop-|gear/gear(\[\d+\])?/position|gear/position|surface-positions|"
    r"controls/flight/|velocities/|orientation/|sim/time/)",
    re.I,
)


class Props:
    def __init__(self, values):
        self.values = values

    def get(self, p):
        return self.values.get(norm_prop(p))


def _num(s):
    try:
        return float(s)
    except (TypeError, ValueError):
        return None


_NUM = re.compile(r"^\s*[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?")


def fnum(s, default=0.0):
    """number like FG reads it (strtod: leading number, rest ignored)"""
    if s is None:
        return default
    m = _NUM.match(s)
    return float(m.group(0)) if m else default


def eval_condition(el, props, refs=None, dynamic=None):
    """Evaluate an FG <condition> (implicit AND of its children). Three-valued: properties matching
    `dynamic` (rpm, gear position, surface positions...) are unknown (None). refs collects property names."""
    if el is None:
        return True
    return _and([_eval(ch, props, refs, dynamic) for ch in el if isinstance(ch.tag, str)])


def _and(vals):
    if any(v is False for v in vals):
        return False
    return None if any(v is None for v in vals) else True


def _or(vals):
    if any(v is True for v in vals):
        return True
    return None if any(v is None for v in vals) else False


def _is_dyn(p, dynamic):
    return dynamic is not None and dynamic.search(p or "") is not None


def _operands(el, props, refs, dynamic):
    vals = []
    unknown = False
    for ch in el:
        if ch.tag == "property":
            if refs is not None:
                refs.append(ch.text or "")
            if _is_dyn(ch.text, dynamic):
                unknown = True
            v = props.get(ch.text or "")
            vals.append(v if v not in (None, "") else "0")
        elif ch.tag == "value":
            vals.append((ch.text or "").strip())
        elif ch.tag == "expression":
            unknown = True
            vals.append("0")
    while len(vals) < 2:
        vals.append("0")
    return vals[0], vals[1], unknown


def _eval(el, props, refs, dynamic):
    t = el.tag
    if t == "and":
        return _and([_eval(c, props, refs, dynamic) for c in el if isinstance(c.tag, str)])
    if t == "or":
        return _or([_eval(c, props, refs, dynamic) for c in el if isinstance(c.tag, str)])
    if t == "not":
        v = _and([_eval(c, props, refs, dynamic) for c in el if isinstance(c.tag, str)])
        return None if v is None else (not v)
    if t == "property":
        if refs is not None:
            refs.append(el.text or "")
        if _is_dyn(el.text, dynamic):
            return None
        v = props.get(el.text or "")
        if v is None:
            return False
        n = _num(v)
        if n is not None:
            return n != 0
        return v.lower() in ("true", "yes")
    if t in ("equals", "not-equals", "less-than", "less-than-equals", "greater-than", "greater-than-equals"):
        a, b, unknown = _operands(el, props, refs, dynamic)
        if unknown:
            return None
        na, nb = _num(a), _num(b)
        if na is None and a.lower() in ("true", "false"):
            na = 1.0 if a.lower() == "true" else 0.0
        if nb is None and b.lower() in ("true", "false"):
            nb = 1.0 if b.lower() == "true" else 0.0
        if na is not None and nb is not None:
            a, b = na, nb
        if t == "equals":
            return a == b
        if t == "not-equals":
            return a != b
        try:
            if t == "less-than":
                return a < b
            if t == "less-than-equals":
                return a <= b
            if t == "greater-than":
                return a > b
            return a >= b
        except TypeError:
            return False
    return None  # unknown element (expression...): don't hide things because of it


# ----------------------------------------------------------------------------- AC3D

AC_TO_FG = np.array([[1, 0, 0], [0, 0, -1], [0, 1, 0]], dtype=np.float64)  # (x,y,z)_fg = (x, -z, y)_ac


class AcMaterial:
    __slots__ = ("name", "rgb", "amb", "emis", "spec", "shi", "trans")


class AcObject:
    def __init__(self):
        self.kind = "poly"
        self.name = ""
        self.names = []  # self + AC ancestors (innermost first)
        self.texture = None
        self.texrep = (1.0, 1.0)
        self.texoff = (0.0, 0.0)
        self.crease = None
        self.verts = None  # (n,3) AC frame, all parent transforms applied
        self.surfs = []  # (flags, mat, [(idx,u,v), ...])
        self.hidden = False


def parse_ac(path):
    """Return (materials, objects) — objects flattened, vertices in the AC file frame."""
    with open(path, "rb") as f:
        raw = f.read().decode("latin-1").split("\n")  # not splitlines(): byte 0x85 is no line break here
    rawlen = [len(l) + 1 for l in raw]  # data blocks count characters including CR/LF
    lines = [l[:-1] if l.endswith("\r") else l for l in raw]
    i = 0
    mats = []
    objs = []
    if not lines or not lines[0].startswith("AC3D"):
        raise ValueError(f"not an AC3D file: {path}")
    i = 1

    def tok(line):
        return re.findall(r'"[^"]*"|\S+', line)

    def read_object(parent_R, parent_t, parent_names):
        nonlocal i
        hdr = tok(lines[i])
        i += 1
        o = AcObject()
        o.kind = hdr[1].lower() if len(hdr) > 1 else "poly"
        R = np.eye(3)
        t = np.zeros(3)
        verts = []
        nkids = 0
        while i < len(lines):
            line = lines[i].strip()
            if not line:
                i += 1
                continue
            tk = tok(line)
            key = tk[0].lower()
            if key == "name":
                o.name = line[4:].strip().strip('"')
                i += 1
            elif key == "data":
                n = int(tk[1])
                i += 1
                got = 0
                while got < n and i < len(lines):
                    got += rawlen[i]
                    i += 1
            elif key == "texture":
                if o.texture is None:
                    o.texture = line[7:].strip().strip('"')
                i += 1
            elif key == "texrep":
                o.texrep = (float(tk[1]), float(tk[2]))
                i += 1
            elif key == "texoff":
                o.texoff = (float(tk[1]), float(tk[2]))
                i += 1
            elif key == "rot":
                v = [float(x) for x in tk[1:10]]
                R = np.array(v, dtype=np.float64).reshape(3, 3)
                i += 1
            elif key == "loc":
                t = np.array([float(x) for x in tk[1:4]])
                i += 1
            elif key == "crease":
                o.crease = float(tk[1])
                i += 1
            elif key == "hidden":
                o.hidden = True
                i += 1
            elif key in ("url", "subdivide", "locked", "folded", "shader"):
                i += 1
            elif key == "numvert":
                n = int(tk[1])
                i += 1
                arr = np.empty((n, 3))
                for k in range(n):
                    p = lines[i].split()
                    arr[k] = (float(p[0]), float(p[1]), float(p[2]))
                    i += 1
                verts = arr
            elif key == "numsurf":
                n = int(tk[1])
                i += 1
                for _ in range(n):
                    flags = 0
                    mat = 0
                    refs = []
                    while i < len(lines):
                        l2 = lines[i].split()
                        i += 1
                        if not l2:
                            continue
                        k2 = l2[0].lower()
                        if k2 == "surf":
                            flags = int(l2[1], 16) if l2[1].lower().startswith("0x") else int(l2[1])
                        elif k2 == "mat":
                            mat = int(l2[1])
                        elif k2 == "refs":
                            m = int(l2[1])
                            for _ in range(m):
                                r = lines[i].split()
                                i += 1
                                refs.append((int(r[0]), float(r[1]) if len(r) > 1 else 0.0, float(r[2]) if len(r) > 2 else 0.0))
                            break
                    o.surfs.append((flags, mat, refs))
            elif key == "kids":
                nkids = int(tk[1])
                i += 1
                break
            else:
                i += 1
        # world transform (AC3D: child coordinates are relative to the parent; v' = R v + t)
        WR = parent_R @ R
        Wt = parent_R @ t + parent_t
        o.names = [o.name] + parent_names if o.name else list(parent_names)
        if len(verts):
            o.verts = verts @ WR.T + Wt
        objs.append(o)
        for _ in range(nkids):
            while i < len(lines) and not lines[i].strip():
                i += 1
            if i >= len(lines) or not lines[i].lstrip().startswith("OBJECT"):
                break  # fewer kids than declared (hand-edited files); FG tolerates this too
            read_object(WR, Wt, o.names)

    while i < len(lines):
        line = lines[i].strip()
        if line.startswith("MATERIAL"):
            m = AcMaterial()
            q = re.match(r'MATERIAL\s+("[^"]*"|\S+)\s+(.*)', line)
            m.name = q.group(1).strip('"') if q else ""
            rest = q.group(2).split() if q else []

            def grab(k, n):
                if k in rest:
                    j = rest.index(k)
                    return [float(x) for x in rest[j + 1 : j + 1 + n]]
                return None

            m.rgb = grab("rgb", 3) or [0.8, 0.8, 0.8]
            m.amb = grab("amb", 3) or [0.2, 0.2, 0.2]
            m.emis = grab("emis", 3) or [0, 0, 0]
            m.spec = grab("spec", 3) or [0, 0, 0]
            m.shi = (grab("shi", 1) or [0])[0]
            m.trans = (grab("trans", 1) or [0])[0]
            mats.append(m)
            i += 1
        elif line.startswith("OBJECT"):
            read_object(np.eye(3), np.zeros(3), [])
        else:
            i += 1
    return mats, objs


# ----------------------------------------------------------------------------- transforms


def rot_x(a):
    c, s = math.cos(a), math.sin(a)
    return np.array([[1, 0, 0], [0, c, -s], [0, s, c]])


def rot_y(a):
    c, s = math.cos(a), math.sin(a)
    return np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]])


def rot_z(a):
    c, s = math.cos(a), math.sin(a)
    return np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]])


def offsets_matrix(el):
    """FG <offsets>: rotate (pitch about y, then roll about x, then heading about z), then translate."""
    M = np.eye(4)
    if el is None:
        return M

    def f(k):
        return fnum(el.findtext(k))

    d = math.pi / 180
    R = rot_z(f("heading-deg") * d) @ rot_x(f("roll-deg") * d) @ rot_y(f("pitch-deg") * d)
    M[:3, :3] = R
    M[:3, 3] = (f("x-m"), f("y-m"), f("z-m"))
    return M


def xf_points(M, P):
    return P @ M[:3, :3].T + M[:3, 3]


def xf_dirs(M, D):
    return D @ M[:3, :3].T


# ----------------------------------------------------------------------------- model tree


class Anim:
    """One <animation> of a model XML, with its geometry already in the aircraft frame F."""

    def __init__(self, el, M, level, xml_path, fgdir, cur_dir):
        self.el = el
        self.type = (el.findtext("type") or "").strip()
        self.objects = [(o.text or "").strip() for o in el.findall("object-name") if o.text]
        self.name = (el.findtext("name") or "").strip()
        self.props = [(p.text or "").strip() for p in el.findall("property")]
        self.aliases = [p.get("__alias") or p.get("alias") or "" for p in el.findall("property")]
        if self.type in ("select", "blend") and el.find("condition") is not None:
            self.props += [(p.text or "").strip() for p in el.find("condition").iter("property") if p.text]
        self.prop = self.props[0] if self.props else ""
        f = el.findtext("factor")
        self.factor = fnum(f, 1.0) if f and f.strip() else 1.0
        self.M = M
        self.level = level
        self.xml_path = xml_path
        self.fgdir = fgdir
        self.cur_dir = cur_dir
        self.center = None
        self.axis = None
        self.axis_object = None

    def resolve_axis(self, line_objects):
        """center/axis in F (or None). line_objects: {name: (p0, p1)} in the level's raw frame."""
        el = self.el
        ax = el.find("axis")
        c = el.find("center")
        center = None
        axis = None
        if ax is not None:
            if ax.find("x1-m") is not None:
                g = lambda k: fnum(ax.findtext(k))  # noqa: E731
                p1 = np.array([g("x1-m"), g("y1-m"), g("z1-m")])
                p2 = np.array([g("x2-m"), g("y2-m"), g("z2-m")])
                center, axis = p1, p2 - p1
            elif ax.find("object-name") is not None:
                nm = (ax.findtext("object-name") or "").strip()
                self.axis_object = nm
                seg = line_objects.get(nm)
                if seg is not None:
                    center, axis = seg[0], seg[1] - seg[0]
            else:
                g = lambda k: fnum(ax.findtext(k))  # noqa: E731
                axis = np.array([g("x"), g("y"), g("z")])
        if c is not None and center is None:
            g = lambda k: fnum(c.findtext(k))  # noqa: E731
            center = np.array([g("x-m"), g("y-m"), g("z-m")])
        if axis is None or np.linalg.norm(axis) < 1e-9:
            return False
        if center is None:
            center = np.zeros(3)
        self.center = xf_points(self.M, center[None])[0]
        a = xf_dirs(self.M, axis[None])[0]
        self.axis = a / np.linalg.norm(a)
        return True


class Mesh:
    """Triangles of one AC object instance, in the aircraft frame F."""

    __slots__ = (
        "name", "names", "src", "pos", "nrm", "uv", "mat", "tex", "double", "anims", "effects",
        "hidden_by", "levels", "submodel_paths",
    )


class ModelLoader:
    def __init__(self, files, props, log=print):
        self.files = files
        self.props = props
        self.log = log
        self.meshes = []
        self.anims = []  # all animations, in load order
        self.effects = []  # (effect path, [object names], level)
        self.levels = []  # (xml path, level id, parent level id)
        self.line_objects = {}  # level -> {name: (p0,p1)} raw frame
        self.ac_materials = {}  # ac path -> materials
        self.missing_textures = set()
        self.submodels_skipped = []

    def load(self, fgdir, path, M=None, parent_level=None, skip_submodel=None, depth=0, subname=None):
        if M is None:
            M = np.eye(4)
        root = load_xml_includes(self.files, fgdir, path)
        if root is None:
            self.log(f"   !! model file missing: {fgdir}/{path}")
            return
        level = len(self.levels)
        self.levels.append((f"{fgdir}/{path}", level, parent_level, subname))
        cur = os.path.dirname(path)
        Mraw = M @ offsets_matrix(root.find("offsets"))
        first_mesh = len(self.meshes)
        acp = root.findtext("path")
        if acp and acp.strip():
            d, p = self.files.resolve(fgdir, cur, acp)
            if d and p.lower().endswith(".ac"):
                self.load_ac(d, p, Mraw, level)
            elif d and p.lower().endswith(".xml"):
                self.load(d, p, Mraw, level, skip_submodel, depth + 1)
        # sub-models
        for sub in root.findall("model"):
            sp = (sub.findtext("path") or "").strip()
            if not sp:
                continue
            nm = (sub.findtext("name") or "").strip()
            if skip_submodel and skip_submodel(sp, nm):
                self.submodels_skipped.append(sp)
                continue
            cond = sub.find("condition")
            if cond is not None and eval_condition(cond, self.props, dynamic=DYNAMIC_PROPS) is False:
                self.submodels_skipped.append(sp + " (condition false)")
                continue
            d, p = self.files.resolve(fgdir, cur, sp)
            if not d or not self.files.local(d, p):
                self.submodels_skipped.append(sp + " (not available)")
                continue
            Ms = Mraw @ offsets_matrix(sub.find("offsets"))
            n0 = len(self.meshes)
            if p.lower().endswith(".ac"):
                lv = len(self.levels)
                self.levels.append((f"{d}/{p}", lv, level, nm))
                self.load_ac(d, p, Ms, lv)
            else:
                self.load(d, p, Ms, level, skip_submodel, depth + 1, nm)
            for m in self.meshes[n0:]:
                if nm:
                    m.names.append(nm)
                m.submodel_paths.append(sp)
        # animations of this level (apply to every mesh loaded under it)
        sub_meshes = self.meshes[first_mesh:]
        lines = self.line_objects.get(level, {})
        # line objects of the AC of this level are kept in raw frame; also allow axis objects of sub-levels
        for el in root.findall("animation"):
            a = Anim(el, Mraw, level, path, fgdir, cur)
            a.resolve_axis(lines)
            self.anims.append(a)
            targets = set(a.objects)
            for m in sub_meshes:
                if not targets or targets.intersection(m.names):
                    m.anims.append(a)
                    if a.name and a.name not in m.names:
                        m.names.append(a.name)
        for el in root.findall("effect"):
            inh = (el.findtext("inherits-from") or "").strip()
            objs = [(o.text or "").strip() for o in el.findall("object-name")]
            self.effects.append((inh, objs, level))
            for m in sub_meshes:
                if set(objs).intersection(m.names):
                    m.effects.append(inh)

    def load_ac(self, fgdir, path, M, level):
        lp = self.files.local(fgdir, path)
        if not lp:
            self.log(f"   !! .ac missing: {fgdir}/{path}")
            return
        mats, objs = parse_ac(lp)
        self.ac_materials[f"{fgdir}/{path}"] = mats
        cur = os.path.dirname(path)
        lines = self.line_objects.setdefault(level, {})
        R = M[:3, :3]
        for o in objs:
            if o.verts is None or not o.surfs:
                continue
            P_fg = o.verts @ AC_TO_FG.T  # raw model frame of this level
            polys = [s for s in o.surfs if (s[0] & 0x0F) == 0 and len(s[2]) >= 3]
            if not polys:
                # line object: possible rotation axis
                if o.name:
                    idx = [r[0] for s in o.surfs for r in s[2]]
                    if len(idx) >= 2:
                        lines[o.name] = (P_fg[idx[0]], P_fg[idx[-1]])
                continue
            if o.name and len(o.verts) == 2:
                lines[o.name] = (P_fg[0], P_fg[1])
            P = xf_points(M, P_fg)
            tex = None
            if o.texture and o.texture.strip() and "empty_texture" not in o.texture:
                lt = self.find_texture(fgdir, cur, o.texture)
                if lt:
                    tex = lt
                else:
                    self.missing_textures.add(o.texture)
            self.add_mesh(o, P, R, polys, mats, tex, f"{fgdir}/{path}", level)

    def find_texture(self, fgdir, cur, ref):
        """FG looks next to the .ac file first, then in the folders of the model XMLs above it."""
        d, p = self.files.resolve(fgdir, cur, ref)
        cands = []
        if d:
            cands += [(d, p), (d, os.path.join(cur, os.path.basename(p)))]
        for lvpath, _, _, _ in reversed(self.levels):
            ld, lp = lvpath.split("/", 1)
            ldir = os.path.dirname(lp)
            cands += [(ld, os.path.normpath(os.path.join(ldir, ref))), (ld, os.path.join(ldir, os.path.basename(ref)))]
        for cd, cp in cands:
            lt = self.files.local(cd, cp)
            if lt:
                return lt
        return None

    def add_mesh(self, o, P, R, polys, mats, tex, src, level):
        """Triangulate, compute normals (AC3D crease smoothing) — vectorised."""
        crease = o.crease if o.crease is not None else 61.0
        cos_c = math.cos(math.radians(min(max(crease, 0.0), 180.0)))
        nverts = len(P)
        Pl = P.tolist()
        tri_v, tri_u, tri_w, tri_face, tri_mat, tri_flags = [], [], [], [], [], []
        face_n = []
        for flags, mat, refs in polys:
            refs = [r for r in refs if 0 <= r[0] < nverts]
            k = len(refs)
            if k < 3:
                continue
            # Newell normal (twice the area vector)
            nx = ny = nz = 0.0
            for j in range(k):
                a = Pl[refs[j][0]]
                b = Pl[refs[(j + 1) % k][0]]
                nx += (a[1] - b[1]) * (a[2] + b[2])
                ny += (a[2] - b[2]) * (a[0] + b[0])
                nz += (a[0] - b[0]) * (a[1] + b[1])
            ln = math.sqrt(nx * nx + ny * ny + nz * nz)
            if ln < 1e-12:
                continue
            fi = len(face_n)
            face_n.append((nx, ny, nz))
            if k == 3:
                tris = [refs]
            elif k == 4:
                p0, p1, p2, p3 = (Pl[r[0]] for r in refs)
                d02 = sum((p2[i] - p0[i]) ** 2 for i in range(3))
                d13 = sum((p3[i] - p1[i]) ** 2 for i in range(3))
                if d02 <= d13:
                    tris = [[refs[0], refs[1], refs[2]], [refs[0], refs[2], refs[3]]]
                else:
                    tris = [[refs[1], refs[2], refs[3]], [refs[1], refs[3], refs[0]]]
            else:
                tris = triangulate(P, refs, np.array((nx, ny, nz)) / ln)
            for t in tris:
                tri_v.append((t[0][0], t[1][0], t[2][0]))
                tri_u.append((t[0][1], t[1][1], t[2][1]))
                tri_w.append((t[0][2], t[1][2], t[2][2]))
                tri_face.append(fi)
                tri_mat.append(mat)
                tri_flags.append(flags)
        if not tri_v:
            return
        FN = np.array(face_n)
        FA = np.linalg.norm(FN, axis=1) / 2
        FN = FN / (2 * FA[:, None])
        tv = np.array(tri_v, dtype=np.int64)
        T = len(tv)
        cv = tv.reshape(-1)  # corner -> vertex
        cf = np.repeat(np.array(tri_face, dtype=np.int64), 3)  # corner -> face
        tflags = np.array(tri_flags, dtype=np.int64)
        smooth_c = np.repeat((tflags & 0x10) != 0, 3)
        nrm = FN[cf].copy()
        if smooth_c.any():
            sc = np.nonzero(smooth_c)[0]
            F = len(FN)
            key = np.unique(cv[sc] * F + cf[sc])
            pv, pf = key // F, key % F  # sorted by vertex
            start = np.searchsorted(pv, cv[sc], side="left")
            end = np.searchsorted(pv, cv[sc], side="right")
            cnt = end - start
            rep = np.repeat(np.arange(len(sc)), cnt)
            offs = np.cumsum(cnt) - cnt
            idx = start[rep] + (np.arange(len(rep)) - offs[rep])
            g = pf[idx]
            fcorner = cf[sc][rep]
            dots = np.einsum("ij,ij->i", FN[g], FN[fcorner])
            w = (dots >= cos_c - 1e-6) * FA[g]
            acc = np.zeros((len(sc), 3))
            for ax in range(3):
                acc[:, ax] = np.bincount(rep, weights=FN[g, ax] * w, minlength=len(sc))
            ln = np.linalg.norm(acc, axis=1)
            ok = ln > 1e-12
            acc[ok] /= ln[ok, None]
            acc[~ok] = FN[cf[sc][~ok]]
            nrm[sc] = acc
        ru, rv = o.texrep
        ou, ov = o.texoff
        uu = np.array(tri_u).reshape(-1)
        vv = np.array(tri_w).reshape(-1)
        m = Mesh()
        m.name = o.name
        m.names = list(o.names)
        m.src = src
        m.pos = P[cv]
        m.nrm = nrm
        m.uv = np.stack([ou + uu * ru, 1.0 - (ov + vv * rv)], axis=1)
        m.mat = np.array(tri_mat, dtype=np.int64)  # AC material index per triangle (of m.src)
        m.double = (tflags & 0x20) != 0
        m.tex = tex
        m.anims = []
        m.effects = []
        m.hidden_by = None
        m.levels = level
        m.submodel_paths = []
        self.meshes.append(m)


def triangulate(P, corners, n):
    """Polygon (list of (vi,u,v)) -> triangles. Fans for convex, ear clipping otherwise."""
    k = len(corners)
    if k == 3:
        return [corners]
    if k == 4:
        a, b, c, d = corners
        # split along the shorter diagonal unless that makes a fold
        pa, pb, pc, pd = P[a[0]], P[b[0]], P[c[0]], P[d[0]]
        t1 = np.cross(pb - pa, pc - pa) @ n > 0 and np.cross(pc - pa, pd - pa) @ n > 0
        t2 = np.cross(pc - pb, pd - pb) @ n > 0 and np.cross(pd - pb, pa - pb) @ n > 0
        if t1 and (not t2 or np.linalg.norm(pc - pa) <= np.linalg.norm(pd - pb)):
            return [[a, b, c], [a, c, d]]
        if t2:
            return [[b, c, d], [b, d, a]]
        return [[a, b, c], [a, c, d]]
    # project to plane
    ax = np.argmax(np.abs(n))
    i1, i2 = [(1, 2), (2, 0), (0, 1)][ax]
    sgn = 1.0 if n[ax] > 0 else -1.0
    pts = [(P[c[0]][i1], P[c[0]][i2]) for c in corners]
    idx = list(range(k))
    out = []

    def cross(o, a, b):
        return ((a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])) * sgn

    guard = 0
    while len(idx) > 3 and guard < 10 * k:
        guard += 1
        found = False
        m = len(idx)
        for j in range(m):
            ia, ib, ic = idx[(j - 1) % m], idx[j], idx[(j + 1) % m]
            A, B, C = pts[ia], pts[ib], pts[ic]
            if cross(A, B, C) <= 1e-14:
                continue
            ok = True
            for q in idx:
                if q in (ia, ib, ic):
                    continue
                Q = pts[q]
                if cross(A, B, Q) >= 0 and cross(B, C, Q) >= 0 and cross(C, A, Q) >= 0:
                    ok = False
                    break
            if ok:
                out.append([corners[ia], corners[ib], corners[ic]])
                idx.pop(j)
                found = True
                break
        if not found:
            break
    if len(idx) == 3:
        out.append([corners[i] for i in idx])
    elif len(idx) > 3:  # degenerate: fan the rest
        for j in range(1, len(idx) - 1):
            out.append([corners[idx[0]], corners[idx[j]], corners[idx[j + 1]]])
    return out
