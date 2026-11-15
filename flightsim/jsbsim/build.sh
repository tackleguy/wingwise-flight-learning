#!/usr/bin/env bash
# Builds the TeachX Flight Simulator's flight model:
#   JSBSim (LGPL-2.1, unmodified library)  +  wrapper.cpp (TeachX glue)  +  the TeachX-tuned
#   Cessna 172P data files in this folder  ->  ../public/jsbsim/{jsbsim.mjs,jsbsim.wasm,jsbsim.data}
#
# Only the one aircraft the trainer flies is packaged (aircraft/c172p + its engine and propeller).
#
# Requirements (see README.md for the full recipe):
#   * Emscripten SDK activated (em++ on PATH)
#   * a JSBSim checkout                                   -> JSBSIM_SRC
#   * libJSBSim.a built from it with Emscripten           -> JSBSIM_BUILD (contains src/libJSBSim.a)
#
# Usage:
#   JSBSIM_SRC=/path/to/jsbsim JSBSIM_BUILD=/path/to/build-wasm ./build.sh
# Optional:
#   OUT=/some/dir          write the three files somewhere else (used for trial builds while tuning)
#   TEACHX_JSBSIM_DEV=1    also export Emscripten's FS object so a tuning script can overwrite the
#                          XML files in memory without relinking (never used for the shipped build)
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
SRC="${JSBSIM_SRC:?set JSBSIM_SRC to a JSBSim source checkout}"
BUILD="${JSBSIM_BUILD:?set JSBSIM_BUILD to the Emscripten build folder containing src/libJSBSim.a}"
OUT="${OUT:-$HERE/../public/jsbsim}"
DATA="$(mktemp -d)"
trap 'rm -rf "$DATA"' EXIT
mkdir -p "$OUT" "$DATA/aircraft" "$DATA/engine" "$DATA/systems"

# The data package: exactly the files listed here, nothing else. The packaged copies have their
# indentation and blank lines removed (about half the size); nothing else is changed. The readable
# files in this folder are the source.
pack() { python3 - "$1" "$2" <<'PY'
import re, sys
src, dst = sys.argv[1], sys.argv[2]
lines = [re.sub(r"[ \t]+", " ", l.strip()) for l in open(src, encoding="utf-8").read().split("\n")]
open(dst, "w", encoding="utf-8").write("\n".join(l for l in lines if l) + "\n")
PY
}
mkdir -p "$DATA/aircraft/c172p"
pack "$HERE/aircraft/c172p/c172p.xml" "$DATA/aircraft/c172p/c172p.xml"
pack "$HERE/engine/eng_io320.xml" "$DATA/engine/eng_io320.xml"
pack "$HERE/engine/prop_75in2f.xml" "$DATA/engine/prop_75in2f.xml"
# (JSBSim wants a systems folder to exist; the trainer's aircraft file does not load anything from it.)
: > "$DATA/systems/.keep"

RUNTIME='["HEAPF64"]'
if [ "${TEACHX_JSBSIM_DEV:-0}" = "1" ]; then RUNTIME='["HEAPF64","FS"]'; fi

em++ -O2 -fwasm-exceptions -std=c++17 \
  -I"$SRC/src" -I"$BUILD/src" \
  "$HERE/wrapper.cpp" "$BUILD/src/libJSBSim.a" \
  -lembind \
  -sMODULARIZE=1 -sEXPORT_ES6=1 -sEXPORT_NAME=createJSBSim -sENVIRONMENT=web,worker,node \
  -sALLOW_MEMORY_GROWTH=1 -sINITIAL_MEMORY=33554432 -sSTACK_SIZE=1048576 \
  -sEXPORTED_RUNTIME_METHODS="$RUNTIME" -sEXPORTED_FUNCTIONS='["_malloc","_free"]' \
  --preload-file "$DATA@/jsbsim" \
  -o "$OUT/jsbsim.mjs"

cp "$SRC/COPYING" "$OUT/JSBSIM-LICENSE-LGPL-2.1.txt"
COMMIT="$(cd "$SRC" && git rev-parse HEAD 2>/dev/null || echo unknown)"
cat > "$OUT/JSBSIM-SOURCE.txt" <<EOF
JSBSim flight dynamics library (LGPL-2.1), compiled unmodified to WebAssembly.
Library source: https://github.com/JSBSim-Team/jsbsim commit $COMMIT

Aircraft data in jsbsim.data: JSBSim's c172p (aircraft/c172p/c172p.xml, engine/eng_io320.xml,
engine/prop_75in2f.xml) MODIFIED by the TeachX Flight Simulator project.
The modified files, the unmodified originals, the list of every change and the build script are
in the project repository under flightsim/jsbsim/ (see CHANGES.md and README.md there).
EOF
ls -la "$OUT"
