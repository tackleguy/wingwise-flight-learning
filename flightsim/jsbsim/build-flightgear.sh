#!/usr/bin/env bash
# Builds the TeachX Flight Simulator's flight-physics engine from FLIGHTGEAR's own copy of JSBSim.
#
#   FlightGear's JSBSim (flightgear/src/FDM/JSBSim, LGPL-2.1; compiled as-is except one bug fix
#   that later JSBSim releases also made, applied below to a temporary copy)
#   + the small stand-alone SimGear helper subset that JSBSim 1.1.14 ships (props, xml, misc, ...)
#   + wrapper.cpp (TeachX glue)
#   + the aircraft data files in this folder
#   -> ../public/jsbsim/{jsbsim.mjs, jsbsim.wasm, jsbsim.data}
#
# FlightGear itself (graphics, scenery, scripting) is a desktop program and does not run in a
# browser; its flight-dynamics engine does, and that is what this script builds.
#
# Requirements:
#   * Emscripten SDK activated (em++ and emar on PATH)
#   * FG_SRC     a FlightGear source tree (the folder that contains src/FDM/JSBSim), e.g. the
#                "flightgear-next" (version 2024.2.0) source archive
#   * SG_SUBSET  the "src" folder of the JSBSim 1.1.14 source package
#                (https://pypi.org/project/JSBSim/1.1.14/ -> JSBSim-1.1.14.tar.gz). Only its
#                src/simgear folder is used: FlightGear normally links JSBSim against the full
#                SimGear library, which is far too big for the browser; JSBSim's own stand-alone
#                copy of the few SimGear helpers it needs is a drop-in replacement. 1.1.14 is the
#                JSBSim release closest to FlightGear's copy and still contains propertyObject.
#
# Usage:
#   FG_SRC=/path/to/flightgear-next SG_SUBSET=/path/to/JSBSim-1.1.14/src ./build-flightgear.sh
# Optional:
#   OUT=/some/dir          write the three files somewhere else
#   OBJ=/some/dir          keep the compiled library here between runs (default: a temp folder)
#   TEACHX_JSBSIM_DEV=1    also export Emscripten's FS object (tuning scripts only, never shipped)
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
FG="${FG_SRC:?set FG_SRC to a FlightGear source tree}"
SG="${SG_SUBSET:?set SG_SUBSET to the src folder of the JSBSim 1.1.14 source package}"
JSB="$FG/src/FDM/JSBSim"
OUT="${OUT:-$HERE/../public/jsbsim}"
[ -f "$JSB/FGFDMExec.cpp" ] || { echo "No FlightGear JSBSim sources in $JSB" >&2; exit 1; }
[ -f "$SG/simgear/props/propertyObject.cxx" ] || { echo "No SimGear subset in $SG/simgear" >&2; exit 1; }

FG_VERSION="$(tr -d '[:space:]' < "$FG/flightgear-version" 2>/dev/null || echo unknown)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
OBJ="${OBJ:-$TMP/obj}"
mkdir -p "$OUT" "$OBJ"

# Work on a copy of the SimGear subset with ONE fix applied, the same fix later JSBSim releases
# made (compare JSBSim 1.3.3 src/simgear/misc/strutils.cxx): Emscripten's C library declares
# _GNU_SOURCE but has the POSIX version of strerror_r(), so error_string() must take the POSIX path.
SG_ORIG="$SG"
mkdir -p "$TMP/sg"
cp -rp "$SG/simgear" "$TMP/sg/"
cp -p "$SG/JSBSim_API.h" "$TMP/sg/"   # export-macro header the helper files include (empty on non-Windows)
SG="$TMP/sg"
python3 - "$SG/simgear/misc/strutils.cxx" <<'PY'
import sys
p = sys.argv[1]
s = open(p, encoding="utf-8").read()
fixes = [
    ("#elif defined(_GNU_SOURCE)\n", "#elif defined(_GNU_SOURCE) && !defined(__EMSCRIPTEN__)\n"),
    ("defined(SG_MAC) || defined(__FreeBSD__)\n", "defined(SG_MAC) || defined(__FreeBSD__) || defined(__EMSCRIPTEN__)\n"),
    ("#if !defined(_GNU_SOURCE)\n", "#if !defined(_GNU_SOURCE) || defined(__EMSCRIPTEN__)\n"),
]
for old, new in fixes:
    if s.count(old) != 1:
        sys.exit(f"strutils.cxx: expected exactly one '{old.strip()}'")
    s = s.replace(old, new)
open(p, "w", encoding="utf-8").write(s)
PY

# Work on a copy of FlightGear's JSBSim with ONE fix applied, again the fix later JSBSim releases
# made (compare JSBSim 1.3.3 src/models/atmosphere/FGWinds.h/.cpp): the turbulence filter's memory
# of the previous time steps was kept in function-level "static" variables, shared by every flight
# model in the program and never reset. They become members of FGWinds, so each new flight starts
# with calm filter history (and the same flight replays exactly the same). Nothing else changes.
JSB_ORIG="$JSB"
mkdir -p "$TMP/jsb"
cp -rp "$JSB/." "$TMP/jsb/"
JSB="$TMP/jsb"
python3 - "$JSB/models/atmosphere/FGWinds.h" "$JSB/models/atmosphere/FGWinds.cpp" <<'PY'
import sys
h_path, c_path = sys.argv[1], sys.argv[2]
decl = """      xi_u_km1 = 0, nu_u_km1 = 0,
      xi_v_km1 = 0, xi_v_km2 = 0, nu_v_km1 = 0, nu_v_km2 = 0,
      xi_w_km1 = 0, xi_w_km2 = 0, nu_w_km1 = 0, nu_w_km2 = 0,
      xi_p_km1 = 0, nu_p_km1 = 0,
      xi_q_km1 = 0, xi_r_km1 = 0;
"""
c = open(c_path, encoding="utf-8").read()
old = "    static double\n" + decl
if c.count(old) != 1:
    sys.exit("FGWinds.cpp: turbulence history block not found exactly once")
c = c.replace(old, "    // (turbulence history: members of FGWinds, see FGWinds.h)\n")
open(c_path, "w", encoding="utf-8").write(c)
h = open(h_path, encoding="utf-8").read()
anchor = "  FGTable *POE_Table; ///< probability of exceedence table\n"
if h.count(anchor) != 1:
    sys.exit("FGWinds.h: anchor not found exactly once")
h = h.replace(anchor, anchor + "  // Turbulence filter history (moved from function statics, TeachX build)\n  double\n" + decl)
open(h_path, "w", encoding="utf-8").write(h)
PY

# ---- 1. compile the library (FlightGear's JSBSim + SimGear helper subset) -------------------
# "-include sys/select.h": FGfdmSocket.cpp uses fd_set without including the header that declares
# it (desktop C libraries pull it in indirectly, Emscripten's does not). The sources stay unmodified.
CXXFLAGS=(-O2 -fwasm-exceptions -std=c++17 -DNDEBUG -DHAVE_EXPAT_CONFIG_H -DXML_DEV_URANDOM -include sys/select.h
          "-DJSBSIM_VERSION=\"compiled from FlightGear $FG_VERSION\"" -I"$JSB" -I"$SG")
CFLAGS=(-O2 -DNDEBUG -DHAVE_EXPAT_CONFIG_H -DXML_DEV_URANDOM -I"$SG" -I"$SG/simgear/xml")
{
  # JSBSim.cpp is the command-line program and JSBSim.cxx/.hxx FlightGear's desktop glue: not used.
  (cd "$JSB" && find . -name '*.cpp' ! -name 'JSBSim.cpp' | sort | sed "s|^\./|$JSB/|")
  (cd "$SG" && find simgear -name '*.cxx' | sort | sed "s|^|$SG/|")
} > "$TMP/cxx.txt"
# xmltok_impl.c and xmltok_ns.c are #included by xmltok.c, not compiled on their own.
printf '%s\n' "$SG/simgear/xml/xmlparse.c" "$SG/simgear/xml/xmltok.c" "$SG/simgear/xml/xmlrole.c" > "$TMP/c.txt"

compile() {  # $1 = source file; object name = its path inside JSB or SG, with / and . replaced by _
  local src="$1" rel obj
  case "$src" in
    "$JSB"/*) rel="jsb/${src#"$JSB"/}" ;;
    *)        rel="sg/${src#"$SG"/}" ;;
  esac
  obj="$OBJ/$(printf '%s' "$rel" | tr '/.' '__').o"
  if [ ! -f "$obj" ] || [ "$src" -nt "$obj" ]; then
    case "$src" in
      *.c) emcc "${CFLAGS[@]}" -c "$src" -o "$obj" ;;
      *)   em++ "${CXXFLAGS[@]}" -c "$src" -o "$obj" ;;
    esac
  fi
}
# Compile a few files at a time in background jobs of this shell.
JOBS="${JOBS:-$(nproc 2>/dev/null || echo 4)}"
running=0
while IFS= read -r f; do
  compile "$f" &
  running=$((running + 1))
  if [ "$running" -ge "$JOBS" ]; then wait -n || true; running=$((running - 1)); fi
done < <(cat "$TMP/cxx.txt" "$TMP/c.txt")
wait || true
EXPECTED=$(cat "$TMP/cxx.txt" "$TMP/c.txt" | wc -l)
FOUND=$(find "$OBJ" -name '*.o' | wc -l)
[ "$FOUND" -eq "$EXPECTED" ] || { echo "Compile failed: $FOUND of $EXPECTED files compiled" >&2; exit 1; }
rm -f "$OBJ/libJSBSim.a"
emar rcs "$OBJ/libJSBSim.a" "$OBJ"/*.o
echo "Compiled $(ls "$OBJ"/*.o | wc -l) files from FlightGear $FG_VERSION's JSBSim + SimGear subset"

# ---- 2. the data package --------------------------------------------------------------------
# Every file under aircraft/, engine/ and systems/ in this folder (the ten aircraft the simulator
# offers and the engines/propellers/systems they use). Packaged copies have indentation and blank
# lines removed (about half the size); nothing else is changed. The readable files are the source.
DATA="$TMP/data"
mkdir -p "$DATA/systems"
python3 - "$HERE" "$DATA" <<'PY'
import os, re, sys
here, data = sys.argv[1], sys.argv[2]
n = 0
for top in ("aircraft", "engine", "systems"):
    for dirpath, _, files in os.walk(os.path.join(here, top)):
        for f in sorted(files):
            if not f.endswith(".xml"):
                continue
            src = os.path.join(dirpath, f)
            dst = os.path.join(data, os.path.relpath(src, here))
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            lines = [re.sub(r"[ \t]+", " ", l.strip()) for l in open(src, encoding="utf-8").read().split("\n")]
            open(dst, "w", encoding="utf-8").write("\n".join(l for l in lines if l) + "\n")
            n += 1
print(f"Packed {n} aircraft/engine/system files")
PY

# ---- 3. link ----------------------------------------------------------------------------------
RUNTIME='["HEAPF64"]'
if [ "${TEACHX_JSBSIM_DEV:-0}" = "1" ]; then RUNTIME='["HEAPF64","FS"]'; fi
em++ -O2 -fwasm-exceptions -std=c++17 -DTEACHX_FLIGHTGEAR_JSBSIM \
  -I"$JSB" -I"$SG" \
  "$HERE/wrapper.cpp" "$OBJ/libJSBSim.a" \
  -lembind \
  -sMODULARIZE=1 -sEXPORT_ES6=1 -sEXPORT_NAME=createJSBSim -sENVIRONMENT=web,worker,node \
  -sALLOW_MEMORY_GROWTH=1 -sINITIAL_MEMORY=33554432 -sSTACK_SIZE=1048576 \
  -sEXPORTED_RUNTIME_METHODS="$RUNTIME" -sEXPORTED_FUNCTIONS='["_malloc","_free"]' \
  --preload-file "$DATA@/jsbsim" \
  -o "$OUT/jsbsim.mjs"

# ---- 4. licence + source notes ------------------------------------------------------------
if [ -f "$SG_ORIG/../LICENSE.txt" ]; then cp "$SG_ORIG/../LICENSE.txt" "$OUT/JSBSIM-LICENSE-LGPL-2.1.txt"; fi
cat > "$OUT/JSBSIM-SOURCE.txt" <<EOF
Flight-physics engine: JSBSim (LGPL-2.1) as bundled with FlightGear $FG_VERSION
(flightgear/src/FDM/JSBSim, https://gitlab.com/flightgear/flightgear), compiled to WebAssembly,
linked with the stand-alone SimGear helper subset shipped in JSBSim 1.1.14
(src/simgear, https://pypi.org/project/JSBSim/1.1.14/ ; SimGear is LGPL-2.0, expat is MIT).
Two small fixes, both the same as later JSBSim releases made, are applied by the build script:
the turbulence filter history becomes per-aircraft (FGWinds.h/.cpp) and strutils.cxx takes the
POSIX strerror_r path under Emscripten. Everything else is FlightGear's code as released.

Aircraft data in jsbsim.data: ten aircraft from JSBSim's aircraft collection (JSBSim 1.1.14) —
c172p (tuned by the TeachX Flight Simulator project), c182 and pa28 (main-wheel steering fixed),
J3Cub, c310, DHC6, p51d, A320, f16, t6texan2 (unchanged) — with their engine, propeller and system
files. The c310 and f16 files declare the GPL; the others carry JSBSim's repository licence.
The data files, the unmodified originals, the list of changes (CHANGES.md) and the build script
(build-flightgear.sh) are in the project repository under flightsim/jsbsim/.
EOF
ls -la "$OUT"
