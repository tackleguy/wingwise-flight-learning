/**
 * Developer stand-in for the instruments / systems / nav modules, used by dev/panel.html so the
 * panel can be developed on its own. It simply copies the true flight state into state.ind
 * (no lag, no errors), fakes a healthy electrical and vacuum system, and runs a bare-bones VOR
 * receiver. It stands down automatically for any part whose real module is registered.
 * NOT used by the app.
 */
import { angleDiff, bearingDeg, clamp, distanceNm, indicatedAltitudeFt, norm180, norm360, FT_PER_NM } from "@/core/math";
import type { Sim, SimModule } from "@/core/sim";
import type { Navaid } from "@/data/world-data";

export function panelStubInstruments(): SimModule {
  let hobbs = 0;
  let steps = 0;
  let hasInst = false;
  let hasSys = false;
  let hasNav = false;
  let station: Navaid | null = null;
  let stationFor = -1;
  let off: (() => void) | null = null;
  let lastDme = NaN;

  const tuneNav = (sim: Sim) => {
    const s = sim.state;
    const f = sim.controls.nav1.active;
    if (station && Math.abs(stationFor - f) < 1e-4 && distanceNm(s.lat, s.lon, station.lat, station.lon) < station.rangeNm) return;
    stationFor = f;
    station = sim.data.navaidsNear(s.lat, s.lon, 150).find((n) => n.hasVor && Math.abs(n.freqMhz - f) < 0.006 && n.distanceNm <= n.rangeNm) ?? null;
  };

  return {
    name: "panel-stub",
    onSpawn(sim) {
      station = null;
      stationFor = -1;
      off ??= sim.events.on("command", (e) => {
        if (e.id !== "dg-align" || sim.module("instruments")) return;
        sim.controls.dgAdjustDeg += angleDiff(sim.state.ind.compassMag, sim.state.ind.dgMag);
      });
    },
    postStep(sim, dt) {
      const s = sim.state;
      const c = sim.controls;
      const ind = s.ind;
      const sys = s.sys;
      if (steps++ % 120 === 0) {
        hasInst = !!sim.module("instruments");
        hasSys = !!sim.module("systems");
        hasNav = !!sim.module("nav");
        if (!hasNav) tuneNav(sim);
      }
      if (!hasSys) {
        sys.alternatorOnline = c.masterBattery && c.masterAlternator && s.rpm > 900;
        sys.busVolts = c.masterBattery ? (sys.alternatorOnline ? 28 : 24) : 0;
        sys.avionicsPowered = c.avionicsMaster && sys.busVolts > 10;
        sys.vacuumInHg = clamp((s.rpm - 300) / 900, 0, 1) * 5;
        sys.stallHorn = !s.onGround && s.alphaDeg > 13.5;
      }
      if (!hasInst) {
        ind.ias = s.kcas;
        ind.alt = indicatedAltitudeFt(s.staticPressureInHg, c.altimeterInHg);
        ind.vs += (s.vsFpm - ind.vs) * Math.min(1, dt / 1.5);
        ind.attPitch = s.pitch;
        ind.attRoll = s.roll;
        ind.attFlag = sys.vacuumInHg < 3;
        ind.dgMag = norm360(s.headingTrue - s.magVar + c.dgAdjustDeg);
        ind.dgFlag = sys.vacuumInHg < 3;
        ind.compassMag = norm360(s.headingTrue - s.magVar);
        ind.turnRate = s.turnRate / 3;
        ind.ball = clamp(s.ny / 0.12, -1, 1);
        ind.turnFlag = sys.busVolts < 10;
        ind.tachRpm = s.rpm;
        if (sys.engineRunning) hobbs += dt / 3600;
        ind.hobbs = hobbs;
        ind.fuelLeftGal = s.fuelLeftGal;
        ind.fuelRightGal = s.fuelRightGal;
        ind.oilTempF = s.oilTempF;
        ind.oilPressPsi = s.oilPressPsi;
        ind.egtF = s.egtF;
        ind.suctionInHg = sys.vacuumInHg;
        ind.ammeterA = sys.alternatorOnline ? 4 : c.masterBattery ? -14 : 0;
        ind.clockUtcSec = (((sim.env.utcMs / 1000) % 86400) + 86400) % 86400;
        ind.oatC = s.oatC;
      }
      if (!hasNav && steps % 12 === 0) {
        const v = s.nav.nav1;
        const st = station;
        if (!st || !sys.avionicsPowered) {
          v.valid = false;
          v.flag = "OFF";
          v.ident = "";
          v.cdiDots = 0;
          v.dmeNm = v.dmeGsKt = null;
          v.kind = "NONE";
          lastDme = NaN;
        } else {
          const brgFrom = bearingDeg(st.lat, st.lon, s.lat, s.lon);
          const radial = norm360(brgFrom - (st.magVar ?? s.magVar));
          const d = norm180(radial - c.obs1);
          const from = Math.abs(d) <= 90;
          v.valid = true;
          v.kind = "VOR";
          v.ident = st.ident;
          v.name = st.name;
          v.radialMag = radial;
          v.bearingToMag = norm360(radial + 180);
          v.flag = from ? "FROM" : "TO";
          // + dots = fly right. FROM: on a radial clockwise of the course you are right of it (fly left).
          v.cdiDots = clamp(from ? -d / 2 : norm180(radial - (c.obs1 + 180)) / 2, -5, 5);
          v.signal = 1;
          if (st.hasDme) {
            const ground = distanceNm(s.lat, s.lon, st.lat, st.lon);
            const slant = Math.hypot(ground, (s.altMslFt - st.elevFt) / FT_PER_NM);
            v.dmeGsKt = Number.isFinite(lastDme) ? Math.abs((slant - lastDme) / (12 * dt)) * 3600 : 0;
            lastDme = slant;
            v.dmeNm = slant;
          } else v.dmeNm = v.dmeGsKt = null;
        }
      }
    },
    dispose() {
      off?.();
      off = null;
    },
  };
}
