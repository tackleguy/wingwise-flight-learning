// TeachX Flight Simulator <-> JSBSim WebAssembly bridge.
//
// This file is TeachX's own glue code. It links against the unmodified JSBSim flight dynamics
// library (https://github.com/JSBSim-Team/jsbsim, LGPL-2.1) — the flight model used by the
// FlightGear simulator. The compiled library is shipped as a separate .wasm module so it can be
// replaced/relinked as the LGPL requires (see flightsim/jsbsim/README.md).
//
// It started as a copy of tools/jsbsim-wasm/wrapper.cpp (the main TeachX site's bridge); the
// only addition is startEngines(), marked below. The class stays compatible with both sites.
#include <emscripten/bind.h>
#include <memory>
#include <string>
#include <vector>

#include "FGFDMExec.h"
#include "initialization/FGInitialCondition.h"
#include "input_output/FGPropertyManager.h"
#include "models/FGFCS.h"
#include "models/FGPropulsion.h"

using namespace emscripten;

class Fdm {
 public:
  Fdm() : exec_(new JSBSim::FGFDMExec()) {
    exec_->SetDebugLevel(0);
    exec_->SetRootDir(SGPath("/jsbsim"));
    exec_->SetAircraftPath(SGPath("aircraft"));
    exec_->SetEnginePath(SGPath("engine"));
    exec_->SetSystemsPath(SGPath("systems"));
  }

  bool loadModel(const std::string& name) {
    try {
      return exec_->LoadModel(name);
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
   *  roaring and winding down. Returns false if anything went wrong. */
  bool startEngines(double throttle, double mixture) {
    try {
      auto prop = exec_->GetPropulsion();
      auto fcs = exec_->GetFCS();
      prop->InitRunning(-1);  // JSBSim's instant start (magnetos both, fuel on, steady state at full throttle)
      const unsigned n = prop->GetNumEngines();
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
      return true;
    } catch (const std::exception& e) {
      lastError_ = e.what();
      return false;
    } catch (...) {
      lastError_ = "unknown error while starting the engine";
      return false;
    }
  }

  double getByName(const std::string& path) { return exec_->GetPropertyValue(path); }
  void setByName(const std::string& path, double v) { exec_->SetPropertyValue(path, v); }
  std::string lastError() const { return lastError_; }

 private:
  std::unique_ptr<JSBSim::FGFDMExec> exec_;
  std::vector<SGPropertyNode*> nodes_;
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
      .function("bind", &Fdm::bind)
      .function("get", &Fdm::get)
      .function("set", &Fdm::set)
      .function("readAll", &Fdm::readAll, allow_raw_pointers())
      .function("getByName", &Fdm::getByName)
      .function("setByName", &Fdm::setByName)
      .function("lastError", &Fdm::lastError);
}
