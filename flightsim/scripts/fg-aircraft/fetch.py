#!/usr/bin/env python3
"""
Download the few FlightGear FGAddon files needed to convert an aircraft's EXTERIOR model.

    python3 -I scripts/fg-aircraft/fetch.py <id> [<id> ...]      # crawl what convert.py needs
    python3 -I scripts/fg-aircraft/fetch.py --list <FGDir> [sub/path]   # show a remote directory
    python3 -I scripts/fg-aircraft/fetch.py --get <FGDir> <path> [...]  # fetch single files

Only SourceForge's web pages are used (svn / dl.flightgear.org are not reachable here):
  listing  https://sourceforge.net/p/flightgear/fgaddon/HEAD/tree/trunk/Aircraft/<Dir>/<path>/
  raw file https://sourceforge.net/p/flightgear/fgaddon/HEAD/tree/trunk/Aircraft/<Dir>/<path>?format=raw
Files land in  $FG_CACHE/<Dir>/<path>  (default: the session scratchpad, see CACHE below) and are
treated as untrusted data: they are parsed, never executed.

The crawl starts at the aircraft's -set.xml, follows <include>s, the 3D model XML and its
<model><path> sub-models (skipping cockpit / instrument / effect / light sub-models by name),
and downloads every .ac file and the textures those .ac files (and material animations / effects)
name. Liveries other than the default, sounds, Nasal etc. are never downloaded.
"""
import os
import re
import sys
import time
import json
import html
import urllib.request
import urllib.error
import xml.etree.ElementTree as ET

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from aircraft_config import AIRCRAFT  # noqa: E402

BASE = "https://sourceforge.net/p/flightgear/fgaddon/HEAD/tree/trunk/Aircraft/"
CACHE = os.environ.get(
    "FG_CACHE",
    "/tmp/claude-0/-home-user-wingwise-flight-learning/51b73d3e-32ac-50c3-af10-4e0cf79554b5/scratchpad/fgaddon",
)
UA = "Python-urllib/3 (fg-aircraft fetch)"

# Sub-model paths we never need (exterior only). Matched case-insensitively against the path.
SKIP_SUBMODEL = re.compile(
    r"(interior|cockpit|instrument|panel|pilot|human|crew|passenger|copilot|yoke|pedal|"
    r"seat|sound|nasal|smoke|spray|contrail|exhaust|vapou?r|damage|tyre|tire-smoke|"
    r"light|beacon|strobe|halo|cone|flash|shadow|reflect|marker|immat|registration|"
    r"weapon|store|missile|bomb|rocket|pylon|tank-drop|droptank|external-tank|"
    r"chock|tiedown|tie-down|towbar|ladder|cover|rbf|remove-before|cone|trailer|heater|"
    r"ground-?equip|gpu|stairs|catapult|fuel-?truck|pushback|hud|mfd|display|screen|"
    r"ai/|generic/|effects/)",
    re.I,
)


def log(*a):
    print(*a, file=sys.stderr, flush=True)


def http_get(url, tries=5):
    delay = 2.0
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=120) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            log(f"  HTTP {e.code} for {url} (try {i + 1})")
        except Exception as e:  # network hiccup
            log(f"  {type(e).__name__}: {e} for {url} (try {i + 1})")
        time.sleep(delay)
        delay *= 2
    raise RuntimeError(f"giving up on {url}")


def quote(p):
    return urllib.request.quote(p, safe="/-_.~")


def list_dir(fgdir, sub=""):
    """[(name, is_dir)] of a remote directory, plus the last-change revision shown for it."""
    url = BASE + quote(fgdir + "/" + sub).rstrip("/") + "/"
    data = http_get(url)
    if data is None:
        return None, None
    s = data.decode("utf-8", "replace")
    out = []
    for m in re.finditer(r'<a class="icon" href="([^"]+)" rel="nofollow" title="([^"]*)"><i class="fa fa-(folder|file)', s):
        out.append((html.unescape(m.group(2)), m.group(3) == "folder"))
    if not out:  # fallback: generic pattern from the task notes
        for m in re.finditer(r'rel="nofollow" title="([^"]+)"', s):
            name = html.unescape(m.group(1))
            if name not in ("Browse Commits", "History", "Feed", "RSS", "Atom"):
                out.append((name, "." not in name))
    rev = re.findall(r"\[r(\d+)\]", s)
    return out, (max(int(r) for r in rev) if rev else None)


def folder_revision(fgdir):
    """(revision, date) of the last change to Aircraft/<fgdir>, from the Aircraft/ listing page (cached)."""
    lp = os.path.join(CACHE, "aircraft.html")
    if not os.path.exists(lp):
        data = http_get(BASE)
        if data is None:
            return None
        with open(lp, "wb") as f:
            f.write(data)
    s = open(lp, encoding="utf-8", errors="replace").read()
    for m in re.finditer(r'<a class="icon" href="([^"]+)" rel="nofollow" title="[^"]*">.*?<span title="([^"]+)">.*?\[r(\d+)\]', s, flags=re.S):
        if m.group(1) == fgdir:
            return int(m.group(3)), m.group(2)
    return None


def local_path(fgdir, path):
    p = os.path.normpath(os.path.join(CACHE, fgdir, path))
    if not p.startswith(os.path.normpath(os.path.join(CACHE, fgdir)) + os.sep):
        raise ValueError(f"path escapes cache: {path}")
    return p


MISSING = {}


def get(fgdir, path):
    """Download Aircraft/<fgdir>/<path> once; return the local file path or None (404)."""
    path = os.path.normpath(path).replace("\\", "/")
    try:
        lp = local_path(fgdir, path)
    except ValueError:
        log(f"  skip (outside the aircraft folder): {fgdir}/{path}")
        return None
    if os.path.exists(lp):
        return lp
    if os.path.exists(lp + ".404"):
        return None
    log(f"  GET {fgdir}/{path}")
    data = http_get(BASE + quote(fgdir + "/" + path) + "?format=raw")
    os.makedirs(os.path.dirname(lp), exist_ok=True)
    if data is None:
        open(lp + ".404", "w").close()
        MISSING.setdefault(fgdir, []).append(path)
        return None
    # SourceForge answers HTML for a directory or an unknown page; refuse those.
    if data[:15].lower().startswith(b"<!doctype html") and not path.lower().endswith((".html", ".htm")):
        open(lp + ".404", "w").close()
        MISSING.setdefault(fgdir, []).append(path)
        return None
    with open(lp, "wb") as f:
        f.write(data)
    time.sleep(0.3)
    return lp


def resolve(fgdir, cur_dir, ref):
    """FG path resolution: 'Aircraft/<Dir>/x' is absolute, anything else is relative to cur_dir.
    Returns (fgdir, path) or (None, ref) for files outside FGAddon (FGData shared files)."""
    ref = ref.strip().replace("\\", "/")
    if ref.startswith("/"):
        ref = ref[1:]
    if ref.lower().startswith("aircraft/"):
        parts = ref.split("/", 2)
        if len(parts) == 3:
            return parts[1], parts[2]
        return None, ref
    if ref.startswith(("Models/", "Effects/", "Textures/", "Materials/", "Shaders/")) and not os.path.exists(
        local_path(fgdir, os.path.join(cur_dir, ref))
    ):
        # Could be FGData-relative (shared) or aircraft-relative: try the aircraft first.
        return fgdir, os.path.normpath(os.path.join(cur_dir, ref))
    return fgdir, os.path.normpath(os.path.join(cur_dir, ref))


def parse_xml(lp):
    try:
        return ET.parse(lp).getroot()
    except ET.ParseError:
        # FG XML files sometimes have junk after the root or an odd encoding header; be lenient.
        s = open(lp, "rb").read().decode("utf-8", "replace")
        s = re.sub(r"<\?xml[^>]*\?>", "", s, count=1)
        s = re.sub(r"<!--.*?-->", "", s, flags=re.S)
        end = s.rfind("</PropertyList>")
        if end >= 0:
            s = s[: end + len("</PropertyList>")]
        return ET.fromstring(s)


class Crawler:
    def __init__(self, cfg):
        self.cfg = cfg
        self.fgdir = cfg["fgdir"]
        self.seen = set()
        self.external = set()
        self.skipped = set()
        self.allow = [re.compile(p, re.I) for p in cfg.get("fetch_allow", [])]
        self.deny = [re.compile(p, re.I) for p in cfg.get("fetch_deny", [])]

    def xml_with_includes(self, fgdir, path, depth=0):
        """Parse an XML file, downloading and merging include="..." files (included content first)."""
        lp = get(fgdir, path)
        if not lp:
            return None
        self.seen.add((fgdir, path))
        root = parse_xml(lp)
        cur = os.path.dirname(path)

        def merge(el):
            for ch in list(el):
                merge(ch)
            inc = el.get("include")
            if not inc or depth > 8:
                return
            d, p = resolve(fgdir, cur, inc)
            if not d:
                self.external.add(inc)
                return
            sub = self.xml_with_includes(d, p, depth + 1)
            if sub is None:
                return
            own = list(el)
            for ch in own:
                el.remove(ch)
            for ch in list(sub):
                el.append(ch)
            for ch in own:
                el.append(ch)

        merge(root)
        return root

    def want_submodel(self, ref):
        if any(a.search(ref) for a in self.allow):
            return True
        if any(d.search(ref) for d in self.deny):
            return False
        return not SKIP_SUBMODEL.search(ref)

    def ac(self, fgdir, path):
        if (fgdir, path) in self.seen:
            return
        self.seen.add((fgdir, path))
        lp = get(fgdir, path)
        if not lp:
            return
        cur = os.path.dirname(path)
        with open(lp, "rb") as f:
            text = f.read().decode("latin-1")
        for t in sorted(set(re.findall(r'^texture\s+"([^"]+)"', text, flags=re.M))):
            self.texture(fgdir, cur, t)

    def texture(self, fgdir, cur, ref):
        d, p = resolve(fgdir, cur, ref)
        if not d:
            self.external.add(ref)
            return
        if (d, p) in self.seen:
            return
        self.seen.add((d, p))
        if get(d, p) is None:
            # FG also finds textures next to the model XML / in a Textures folder; try the base name.
            alt = os.path.join(cur, os.path.basename(ref))
            if alt != p and get(d, alt):
                return
            self.external.add(f"{d}/{p}")

    def model(self, fgdir, path, depth=0):
        if (fgdir, path) in self.seen:
            return
        if path.lower().endswith(".ac"):
            self.ac(fgdir, path)
            return
        self.seen.add((fgdir, path))
        root = self.xml_with_includes(fgdir, path)
        if root is None:
            return
        cur = os.path.dirname(path)
        p = root.findtext("path")
        if p:
            d, q = resolve(fgdir, cur, p)
            if d:
                self.model(d, q, depth + 1)
            else:
                self.external.add(p)
        for sub in root.findall("model"):
            sp = sub.findtext("path")
            if not sp:
                continue
            if not self.want_submodel(sp):
                self.skipped.add(sp)
                continue
            d, q = resolve(fgdir, cur, sp)
            if d:
                self.model(d, q, depth + 1)
            else:
                self.external.add(sp)
        # Default livery / material textures and effect base textures.
        for anim in root.iter("animation"):
            for tex in anim.findall("texture"):
                if tex.text and tex.text.strip():
                    self.texture(fgdir, cur, tex.text.strip())
        for eff in root.findall("effect"):
            inh = eff.findtext("inherits-from")
            if inh:
                d, q = resolve(fgdir, cur, inh if inh.endswith(".eff") or inh.endswith(".xml") else inh + ".eff")
                if d and (d, q) not in self.seen:
                    self.seen.add((d, q))
                    lp = get(d, q)
                    if lp:
                        try:
                            er = parse_xml(lp)
                            for t in er.iter("texture"):
                                if t.get("n") in (None, "0"):
                                    img = t.findtext("image")
                                    if img:
                                        self.texture(d, os.path.dirname(q), img.strip())
                        except ET.ParseError:
                            pass
                elif not d:
                    self.external.add(inh)

    def run(self):
        cfg = self.cfg
        listing, rev = list_dir(self.fgdir)
        drev = folder_revision(self.fgdir)
        if listing is None:
            raise RuntimeError(f"aircraft directory {self.fgdir} not found on SourceForge")
        os.makedirs(os.path.join(CACHE, self.fgdir), exist_ok=True)
        meta = {"dir": self.fgdir, "revision": rev, "root": [n for n, _ in listing], "fetched": time.strftime("%Y-%m-%d")}
        if drev:
            meta["dir_revision"], meta["dir_date"] = drev
        for name, is_dir in listing:
            if not is_dir and re.match(r"(licen[cs]e|copying|readme|thanks|authors|credits)", name, re.I):
                get(self.fgdir, name)
        setroot = self.xml_with_includes(self.fgdir, cfg["set"])
        if setroot is None:
            raise RuntimeError(f"{cfg['set']} not found")
        model_path = cfg.get("model") or self.find_model_path(setroot)
        meta["model"] = model_path
        d, q = resolve(self.fgdir, os.path.dirname(cfg["set"]), model_path)
        self.model(d, q)
        for extra in cfg.get("fetch_extra", []):
            if extra.lower().endswith(".ac") or extra.lower().endswith(".xml"):
                self.model(self.fgdir, extra)
            else:
                get(self.fgdir, extra)
        meta["skipped_submodels"] = sorted(self.skipped)
        meta["external"] = sorted(self.external)
        meta["missing"] = MISSING.get(self.fgdir, [])
        with open(os.path.join(CACHE, self.fgdir, "_fetch.json"), "w") as f:
            json.dump(meta, f, indent=1)
        return meta

    def find_model_path(self, setroot):
        # the include tree may hold it; look through every fetched xml of this aircraft
        cands = []
        for d, p in list(self.seen) + [(self.fgdir, self.cfg["set"])]:
            if d != self.fgdir or not p.endswith(".xml"):
                continue
            lp = local_path(d, p)
            if not os.path.exists(lp):
                continue
            r = parse_xml(lp)
            for m in r.iter("model"):
                pth = m.findtext("path")
                if pth and pth.strip().endswith(".xml"):
                    cands.append(pth.strip())
        if not cands:
            raise RuntimeError("no /sim/model/path found")
        return cands[0]


def main(argv):
    if not argv:
        print(__doc__)
        return 1
    if argv[0] == "--list":
        items, rev = list_dir(argv[1], argv[2] if len(argv) > 2 else "")
        print(f"[r{rev}]")
        for n, d in items or []:
            print(("D " if d else "  ") + n)
        return 0
    if argv[0] == "--revisions":
        for aid, cfg in AIRCRAFT.items():
            fj = os.path.join(CACHE, cfg["fgdir"], "_fetch.json")
            if cfg.get("local") or not os.path.exists(fj):
                continue
            meta = json.load(open(fj))
            drev = folder_revision(cfg["fgdir"])
            if drev:
                meta["dir_revision"], meta["dir_date"] = drev
                json.dump(meta, open(fj, "w"), indent=1)
                print(aid, cfg["fgdir"], meta["revision"], drev)
        return 0
    if argv[0] == "--get":
        for p in argv[2:]:
            print(get(argv[1], p))
        return 0
    for aid in argv:
        cfg = AIRCRAFT[aid]
        if cfg.get("local"):
            log(f"{aid}: local FGData copy, nothing to fetch")
            continue
        log(f"== {aid} ({cfg['fgdir']})")
        meta = Crawler(cfg).run()
        log(f"   revision r{meta['revision']}, model {meta['model']}")
        if meta["skipped_submodels"]:
            log("   skipped sub-models: " + ", ".join(meta["skipped_submodels"]))
        if meta["external"]:
            log("   outside FGAddon (not fetched): " + ", ".join(meta["external"]))
        if meta["missing"]:
            log("   404: " + ", ".join(meta["missing"]))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
