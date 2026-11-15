// TeachX Flight Simulator <-> JSBSim WebAssembly bridge.
//
// This file is TeachX's own glue code. It links against JSBSim (LGPL-2.1) — the flight dynamics
// engine of the FlightGear simulator; the shipped build uses FlightGear's own copy of it (see
// build-flightgear.sh). The compiled library is shipped as a separate .wasm module so it can be
// replaced/relinked as the LGPL requires (see flightsim/jsbsim/README.md).
//
// It started as a copy of tools/jsbsim-wasm/wrapper.cpp (the main TeachX site's bridge); the
// additions are startEngines() and numEngines(), marked below.
#include <emscripten/bind.h>
#include <memory>
#include <string>
#include <vector>

#include "FGFDMExec.h"
#include "initialization/FGInitialCondition.h"
#include "input_output/FGPropertyManager.h"
#include "models/FGFCS.h"
#include "models/FGPropulsion.h"
#include "models/propulsion/FGEngine.h"
#include "models/propulsion/FGPropeller.h"

using namespace emscripten;

#ifdef TEACHX_FLIGHTGEAR_JSBSIM
#include <cstdlib>
// FlightGear's copy of JSBSim draws turbulence from the C library's global rand() and keeps one
// global Gaussian-generator phase, both shared by every flight model in the module. Newer JSBSim
// releases give each flight model its own generator. To keep "the same flight gives the same
// result" (training replays, tests), every new flight model restarts the shared sequence.
struct RandomReset : JSBSim::FGJSBBase {
  static void reset() {
    std::srand(1);
    gaussian_random_number_phase = 0;
  }
};
#endif

class Fdm {
 public:
  Fdm() : exec_(new JSBSim::FGFDMExec()) {
#ifdef TEACHX_FLIGHTGEAR_JSBSIM
    RandomReset::reset();
#endif
    exec_->SetDebugLevel(0);
    exec_->SetRootDir(SGPath("/jsbsim"));
    exec_->SetAircraftPath(SGPath("aircraft"));
    exec_->SetEnginePath(SGPath("engine"));
    exec_->SetSystemsPath(SGPath("systems"));
  }

  bool loadModel(const std::string& name) {
    try {
      const bool ok = exec_->LoadModel(name);
      // Remember each propeller's fine-pitch stop (a freshly loaded propeller sits at it).
      minPitch_.clear();
      if (ok) {
        auto prop = exec_->GetPropulsion();
        for (unsigned i = 0; i < prop->GetNumEngines(); i++) {
          auto* p = dynamic_cast<JSBSim::FGPropeller*>(prop->GetEngine(i)->GetThruster());
          minPitch_.push_back(p ? p->GetPitch() : 0.0);
        }
      }
      return ok;
    } catch (const std::exception& e) {
      lastError_ = e.what();
      return false;
    } catch (...) {
      lastError_ = "unknown error while loading model";
      return false;
    }
  }

  /** Initial conditions. Latitude is GEODETIC (what maps and GPS use). When onGround is true,
   *  altFt is the height of the model's reference point above the terrain (a few feet, as in
   *  JSBSim's reset files); otherwise altFt is altitude above sea level. */
  void setInitial(double latDeg, double lonDeg, double altFt, bool onGround, double terrainFt,
                  double headingDeg, double calibratedKts, double pitchDeg) {
    auto ic = exec_->GetIC();
    ic->SetTerrainElevationFtIC(terrainFt);
    ic->SetGeodLatitudeDegIC(latDeg);
    ic->SetLongitudeDegIC(lonDeg);
    if (onGround) ic->SetAltitudeAGLFtIC(altFt);
    else ic->SetAltitudeASLFtIC(altFt);
    ic->SetPsiDegIC(headingDeg);
    ic->SetThetaDegIC(pitchDeg);
    ic->SetPhiDegIC(0.0);
    ic->SetVcalibratedKtsIC(calibratedKts);
  }

  bool runIC() {
    try {
      return exec_->RunIC();
    } catch (const std::exception& e) {
      lastError_ = e.what();
      return false;
    }
  }

  void setDt(double dt) { exec_->Setdt(dt); }

  /** Advance n steps. Returns false if the model failed or terminated. */
  bool run(int steps) {
    try {
      for (int i = 0; i < steps; i++) {
        if (!exec_->Run()) return false;
      }
      return true;
    } catch (const std::exception& e) {
      lastError_ = e.what();
      return false;
    }
  }

  /** Register a property for fast access; returns a handle (index) or -1 if missing. */
  int bind(const std::string& path, bool create) {
    SGPropertyNode* n = exec_->GetPropertyManager()->GetNode(path, create);
    if (!n) return -1;
    nodes_.push_back(n);
    return static_cast<int>(nodes_.size()) - 1;
  }

  double get(int handle) const {
    if (handle < 0 || handle >= static_cast<int>(nodes_.size())) return 0.0;
    return nodes_[handle]->getDoubleValue();
  }

  void set(int handle, double value) {
    if (handle < 0 || handle >= static_cast<int>(nodes_.size())) return;
    nodes_[handle]->setDoubleValue(value);
  }

  /** Read all bound properties into the JS-provided Float64Array view (by heap offset). */
  void readAll(uintptr_t ptr, int count) {
    double* out = reinterpret_cast<double*>(ptr);
    const int n = std::min(count, static_cast<int>(nodes_.size()));
    for (int i = 0; i < n; i++) out[i] = nodes_[i]->getDoubleValue();
  }

  /** (Flight simulator addition.) Start every engine instantly and let it settle at the given
   *  throttle and mixture. JSBSim's own "propulsion/set-running" always settles at FULL throttle,
   *  which makes an aircraft that is put on the ground "engine running" begin with the engine
   *  roaring and winding down. Returns false if anything went wrong.
   *
   *  Variable-pitch propellers: JSBSim finds the engine's steady state by stepping the engine alone
   *  in half-second steps. The propeller governor (pitch change = rpm error x time step) overshoots
   *  wildly at that step size and stalls the engine, so during the start every governed propeller
   *  is held at its fine-pitch stop (as on a real engine start, propeller lever forward) and the
   *  governor is switched back on afterwards. */
  bool startEngines(double throttle, double mixture) {
    try {
      auto prop = exec_->GetPropulsion();
      auto fcs = exec_->GetFCS();
      const unsigned n = prop->GetNumEngines();
      const std::vector<int> governed = holdPropellers(true);
      prop->InitRunning(-1);  // JSBSim's instant start (magnetos both, fuel on, steady state at full throttle)
      for (unsigned i = 0; i < n; i++) {
        fcs->SetThrottleCmd(i, throttle);
        fcs->SetThrottlePos(i, throttle);
        fcs->SetMixtureCmd(i, mixture);
        fcs->SetMixturePos(i, mixture);
        if (i < prop->in.ThrottleCmd.size()) prop->in.ThrottleCmd[i] = throttle;
        if (i < prop->in.ThrottlePos.size()) prop->in.ThrottlePos[i] = throttle;
        if (i < prop->in.MixtureCmd.size()) prop->in.MixtureCmd[i] = mixture;
        if (i < prop->in.MixturePos.size()) prop->in.MixturePos[i] = mixture;
      }
      prop->GetSteadyState();  // march the engine to a steady state at the requested setting
      releasePropellers(governed);
      return true;
    } catch (const std::exception& e) {
      lastError_ = e.what();
      return false;
    } catch (...) {
      lastError_ = "unknown error while starting the engine";
      return false;
    }
  }

  /** (Flight simulator addition.) JSBSim's trim (mode 0 = longitudinal, 1 = full, 2 = ground), with
   *  governed propellers held at their CURRENT pitch while it runs (the trim also steps the engines
   *  alone in half-second steps, see startEngines). Let the governor settle for a moment of normal
   *  running before trimming. Returns true when the trim converged. */
  bool trim(int mode) {
    const std::vector<int> governed = holdPropellers(false);
    bool ok = true;
    try {
      exec_->DoTrim(mode);
    } catch (const std::exception& e) {
      lastError_ = e.what();
      ok = false;
    } catch (...) {
      lastError_ = "the trim did not converge";
      ok = false;
    }
    releasePropellers(governed);
    return ok;
  }

  /** (Flight simulator addition.) Number of engines of the loaded aircraft. */
  int numEngines() const { return static_cast<int>(exec_->GetPropulsion()->GetNumEngines()); }

  double getByName(const std::string& path) { return exec_->GetPropertyValue(path); }
  void setByName(const std::string& path, double v) { exec_->SetPropertyValue(path, v); }
  std::string lastError() const { return lastError_; }

 private:
  /** Switch every governed (constant-speed) propeller to fixed pitch — its fine-pitch stop, or the
   *  pitch it has now; returns the modes to restore. */
  std::vector<int> holdPropellers(bool atFinePitch) {
    auto prop = exec_->GetPropulsion();
    const unsigned n = prop->GetNumEngines();
    std::vector<int> governed(n, 0);
    for (unsigned i = 0; i < n; i++) {
      auto* p = dynamic_cast<JSBSim::FGPropeller*>(prop->GetEngine(i)->GetThruster());
      if (p && p->IsVPitch() && p->GetConstantSpeed() != 0) {
        governed[i] = p->GetConstantSpeed();
        p->SetConstantSpeed(0);
        if (atFinePitch && i < minPitch_.size()) p->SetPitch(minPitch_[i]);
      }
    }
    return governed;
  }

  void releasePropellers(const std::vector<int>& governed) {
    auto prop = exec_->GetPropulsion();
    for (unsigned i = 0; i < governed.size() && i < prop->GetNumEngines(); i++) {
      if (!governed[i]) continue;
      auto* p = dynamic_cast<JSBSim::FGPropeller*>(prop->GetEngine(i)->GetThruster());
      if (p) p->SetConstantSpeed(governed[i]);
    }
  }

  std::unique_ptr<JSBSim::FGFDMExec> exec_;
  std::vector<SGPropertyNode*> nodes_;
  std::vector<double> minPitch_;
  std::string lastError_;
};

EMSCRIPTEN_BINDINGS(teachx_jsbsim) {
  class_<Fdm>("Fdm")
      .constructor<>()
      .function("loadModel", &Fdm::loadModel)
      .function("setInitial", &Fdm::setInitial)
      .function("runIC", &Fdm::runIC)
      .function("setDt", &Fdm::setDt)
      .function("run", &Fdm::run)
      .function("startEngines", &Fdm::startEngines)
      .function("numEngines", &Fdm::numEngines)
      .function("trim", &Fdm::trim)
      .function("bind", &Fdm::bind)
      .function("get", &Fdm::get)
      .function("set", &Fdm::set)
      .function("readAll", &Fdm::readAll, allow_raw_pointers())
      .function("getByName", &Fdm::getByName)
      .function("setByName", &Fdm::setByName)
      .function("lastError", &Fdm::lastError);
}
