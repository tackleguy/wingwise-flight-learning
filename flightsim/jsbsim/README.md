# The flight-physics engine (FlightGear's JSBSim) and the aircraft data

The simulator's flight physics is **JSBSim as bundled with FlightGear 2024.2**
(`flightgear/src/FDM/JSBSim`, LGPL-2.1), compiled to WebAssembly. The result lives in
`../public/jsbsim/` (`jsbsim.mjs`, `jsbsim.wasm`, `jsbsim.data`) and is a separate, replaceable
module, as the LGPL requires. `JSBSIM-SOURCE.txt` there records exactly what it was built from.

| File / folder | What it is |
| --- | --- |
| `build-flightgear.sh` | **The build used for the shipped files.** FlightGear's JSBSim + the SimGear helper subset of JSBSim 1.1.14 + `wrapper.cpp` + the aircraft below. |
| `build.sh` | The earlier build from a stand-alone JSBSim checkout (Cessna only). Kept for reference; not used any more. |
| `wrapper.cpp` | TeachX's bridge between the engine and the simulator's JavaScript (TeachX's own code). |
| `aircraft/`, `engine/`, `systems/` | The flight-model data packaged into `jsbsim.data`: the ten aircraft of `src/aircraft/catalog.ts` and the engine, propeller and system files they use. |
| `upstream/` | Unmodified originals of every aircraft file this project changed. |
| `CHANGES.md` | Every change made to the aircraft data. |
| `tools/` | The Cessna 172P tuning tools. |

## Rebuilding (about 5 minutes)

1. Emscripten:

   ```bash
   git clone https://github.com/emscripten-core/emsdk.git && cd emsdk && ./emsdk install latest && ./emsdk activate latest && source ./emsdk_env.sh && cd ..
   ```

2. FlightGear's source code: any FlightGear source tree that contains `src/FDM/JSBSim` (the build
   that is shipped used the "flightgear-next" archive, version 2024.2.0, from
   https://gitlab.com/flightgear/flightgear).

3. The SimGear helper subset: the JSBSim 1.1.14 source package from PyPI.

   ```bash
   curl -LO https://files.pythonhosted.org/packages/22/b5/670b227c720dc95de4050ebfb63ba834f5097d8a1eb6744f5d14770e549b/JSBSim-1.1.14.tar.gz && tar xzf JSBSim-1.1.14.tar.gz
   ```

4. Build:

   ```bash
   FG_SRC=/path/to/flightgear-next SG_SUBSET=/path/to/JSBSim-1.1.14/src ./build-flightgear.sh
   ```

The script prints the files it wrote. Then run the tests (`npm test` in `flightsim/`) — they use
the built module.

## What the build changes

FlightGear's JSBSim sources are compiled as they are, except for two bug fixes applied to a
temporary copy during the build (both are the same fixes later JSBSim releases made):

- `models/atmosphere/FGWinds.h/.cpp`: the turbulence filter's memory moves from function-level
  `static` variables (shared by every aircraft in the program, never reset) into the FGWinds object.
- `simgear/misc/strutils.cxx` (helper subset): take the POSIX `strerror_r` path under Emscripten.

`FGfdmSocket.cpp` needs `<sys/select.h>`, which desktop systems include indirectly; the build
passes `-include sys/select.h` instead of changing the file.

## Licences

- JSBSim (and FlightGear's copy of it): LGPL-2.1 — `JSBSIM-LICENSE-LGPL-2.1.txt`.
- SimGear helper subset: LGPL-2.0-or-later; expat (inside it): MIT.
- Aircraft data: JSBSim's repository licence (LGPL-2.1), except `aircraft/c310/c310.xml` and
  `aircraft/f16/f16.xml`, which declare the GPL in their headers.
