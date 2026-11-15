# JSBSim (FlightGear's flight dynamics) for TeachX

TeachX's browser simulator can use **JSBSim** — the open-source flight dynamics model used by the
FlightGear simulator — compiled to WebAssembly. The built files live in `public/jsbsim/`:

| File | What it is |
| --- | --- |
| `jsbsim.wasm` | JSBSim library + the TeachX bridge (`wrapper.cpp`), compiled with Emscripten |
| `jsbsim.mjs` | Emscripten loader (ES module) |
| `jsbsim.data` | JSBSim aircraft/engine XML files packaged for the virtual file system |
| `JSBSIM-LICENSE-LGPL-2.1.txt` | JSBSim's licence |
| `JSBSIM-SOURCE.txt` | Exact upstream source location and commit |

TeachX code talks to it only through `src/sim/jsbsim.ts`.

## Licence (LGPL-2.1)

- JSBSim is © the JSBSim developers and licensed under the GNU Lesser General Public License v2.1.
  Source: https://github.com/JSBSim-Team/jsbsim (the exact commit is recorded in
  `public/jsbsim/JSBSIM-SOURCE.txt`).
- The library is compiled **unmodified**. It is delivered as a separate module that the web app
  loads at runtime, so anyone can rebuild and replace `public/jsbsim/*` with their own build of
  JSBSim using the script below (LGPL §6).
- **Data modification (LGPL §2):** in the packaged copy of `aircraft/pa28/pa28.xml`, the
  `LEFT_MAIN` and `RIGHT_MAIN` gear contacts have `<max_steer>` changed from `360` (free castering,
  which makes the aircraft spin on the ground) to `0`. The change is applied by `build.sh` and
  marked in the file with a comment.
- Aircraft shipped: `c172p` (Cessna 172P), `pa28` (Piper PA-28-180), `A320` (Airbus A320-200) and
  the engine/propeller files they reference. These files carry no separate licence; JSBSim's
  repository licence applies. The 737 model is **not** shipped because its file declares a GPL
  licence.
- TeachX's own code (`wrapper.cpp`, `src/sim/jsbsim.ts` and the rest of TeachX) is not part of JSBSim.

## Rebuilding

```bash
git clone https://github.com/emscripten-core/emsdk.git && cd emsdk && ./emsdk install latest && ./emsdk activate latest && source ./emsdk_env.sh && cd ..
```

```bash
git clone https://github.com/JSBSim-Team/jsbsim.git
```

```bash
mkdir build-wasm && cd build-wasm && emcmake cmake ../jsbsim -DCMAKE_BUILD_TYPE=Release -DBUILD_DOCS=OFF -DBUILD_PYTHON_MODULE=OFF -DCMAKE_CXX_FLAGS="-fwasm-exceptions -O2" && emmake make -j4 libJSBSim && cd ..
```

```bash
JSBSIM_SRC=$PWD/jsbsim JSBSIM_BUILD=$PWD/build-wasm path/to/teachx/tools/jsbsim-wasm/build.sh
```

## Conventions verified by tests (`src/sim/jsbsim.test.ts`)

JSBSim's command signs differ from TeachX's: elevator − = nose up, rudder − = yaw right,
pitch trim − = nose up (aileron + = roll right in both). Latitude must be set with the geodetic
setter, and ground starts place the reference point a few feet above the runway (as JSBSim's own
reset files do) so the aircraft settles onto its gear.
