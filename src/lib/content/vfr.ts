import type { Course } from "./types";
import { principles } from "./vfr/principles";
import { systems } from "./vfr/systems";
import { controls } from "./vfr/controls";
import { aerodynamics } from "./vfr/aerodynamics";
import { regulations } from "./vfr/regulations";
import { airspace } from "./vfr/airspace";
import { weather } from "./vfr/weather";
import { charts } from "./vfr/charts";
import { pilotage } from "./vfr/pilotage";
import { deadReckoning } from "./vfr/dead-reckoning";
import { radio } from "./vfr/radio";
import { airportOps } from "./vfr/airport-ops";
import { trafficPatterns } from "./vfr/traffic-patterns";
import { takeoffsLandings } from "./vfr/takeoffs-landings";
import { crossCountry } from "./vfr/cross-country";
import { emergencies } from "./vfr/emergencies";
import { night } from "./vfr/night";
import { adm } from "./vfr/adm";

/**
 * VFR / Private Pilot ground school. Content is based on the FAA Pilot's Handbook of Aeronautical
 * Knowledge (FAA-H-8083-25), Airplane Flying Handbook (FAA-H-8083-3), the AIM and 14 CFR Parts 61/91.
 * It is training material, not a substitute for current FAA publications or an authorized instructor.
 */
export const VFR_COURSE: Course = {
  id: "vfr",
  title: "VFR Ground School",
  description:
    "Everything a private pilot needs to fly safely by visual flight rules: aerodynamics, systems, regulations, airspace, weather, navigation, airport operations, emergencies and decision-making.",
  modules: [
    principles,
    systems,
    controls,
    aerodynamics,
    regulations,
    airspace,
    weather,
    charts,
    pilotage,
    deadReckoning,
    radio,
    airportOps,
    trafficPatterns,
    takeoffsLandings,
    crossCountry,
    emergencies,
    night,
    adm,
  ],
};
