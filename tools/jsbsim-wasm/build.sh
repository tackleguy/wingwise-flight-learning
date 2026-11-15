#!/usr/bin/env bash
# Builds JSBSim (LGPL-2.1) + TeachX bridge to WebAssembly into public/jsbsim/.
# Requirements: emsdk activated (emcc on PATH), a JSBSim checkout and a libJSBSim build made with
#   emcmake cmake <jsbsim> -DCMAKE_BUILD_TYPE=Release -DBUILD_DOCS=OFF -DBUILD_PYTHON_MODULE=OFF \
#     -DCMAKE_CXX_FLAGS="-fwasm-exceptions -O2" && emmake make libJSBSim
# Usage: JSBSIM_SRC=/path/to/jsbsim JSBSIM_BUILD=/path/to/build-wasm tools/jsbsim-wasm/build.sh
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
SRC="${JSBSIM_SRC:?set JSBSIM_SRC}"
BUILD="${JSBSIM_BUILD:?set JSBSIM_BUILD}"
OUT="$REPO/public/jsbsim"
DATA="$(mktemp -d)"
mkdir -p "$OUT" "$DATA/aircraft" "$DATA/engine" "$DATA/systems"

# Aircraft shipped (all from the JSBSim repository; none declares a separate licence).
for a in c172p pa28 A320; do cp -r "$SRC/aircraft/$a" "$DATA/aircraft/"; done
for e in eng_io320 prop_75in2f engIO360C propC8v CFM56_5 direct; do cp "$SRC/engine/$e.xml" "$DATA/engine/"; done

# TeachX modification (documented per LGPL §2): the upstream pa28.xml gives the LEFT_MAIN and
# RIGHT_MAIN contacts <max_steer> 360 (free castering), which makes the aircraft spin on the
# ground. Real PA-28 main wheels do not steer — set them to 0.
python3 - "$DATA/aircraft/pa28/pa28.xml" <<'PY'
import re, sys
p = sys.argv[1]
s = open(p).read()
def fix(m):
    block = m.group(0)
    return re.sub(r'<max_steer unit="DEG">\s*360\.0\s*</max_steer>', '<max_steer unit="DEG"> 0.0 </max_steer> <!-- TeachX: was 360 (castering) -->', block)
s2 = re.sub(r'<contact type="BOGEY" name="(LEFT|RIGHT)_MAIN">.*?</contact>', fix, s, flags=re.S)
assert s2 != s, "pa28 main-gear patch did not apply"
open(p, 'w').write(s2)
PY

em++ -O2 -fwasm-exceptions -std=c++17 \
  -I"$SRC/src" -I"$BUILD/src" \
  "$HERE/wrapper.cpp" "$BUILD/src/libJSBSim.a" \
  -lembind \
  -sMODULARIZE=1 -sEXPORT_ES6=1 -sEXPORT_NAME=createJSBSim -sENVIRONMENT=web,worker,node \
  -sALLOW_MEMORY_GROWTH=1 -sINITIAL_MEMORY=33554432 -sSTACK_SIZE=1048576 \
  -sEXPORTED_RUNTIME_METHODS='["HEAPF64"]' -sEXPORTED_FUNCTIONS='["_malloc","_free"]' \
  --preload-file "$DATA@/jsbsim" \
  -o "$OUT/jsbsim.mjs"

cp "$SRC/COPYING" "$OUT/JSBSIM-LICENSE-LGPL-2.1.txt"
( cd "$SRC" && echo "JSBSim source: https://github.com/JSBSim-Team/jsbsim commit $(git rev-parse HEAD)" ) > "$OUT/JSBSIM-SOURCE.txt"
rm -rf "$DATA"
ls -la "$OUT"
