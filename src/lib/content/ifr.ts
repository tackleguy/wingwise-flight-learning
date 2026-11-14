import type { Course } from "./types";
import { fundamentals } from "./ifr/fundamentals";
import { regulations } from "./ifr/regulations";
import { weather } from "./ifr/weather";
import { navigation } from "./ifr/navigation";
import { approaches } from "./ifr/approaches";
import { planning } from "./ifr/planning";
import { emergencies } from "./ifr/emergencies";

/**
 * IFR / Instrument Rating ground school. Content is based on the FAA Instrument Flying Handbook
 * (FAA-H-8083-15), Instrument Procedures Handbook, the AIM and 14 CFR Parts 61/91/97.
 * It is training material, not a substitute for current FAA publications or an authorized instructor.
 */
export const IFR_COURSE: Course = {
  id: "ifr",
  title: "IFR Ground School",
  description:
    "Instrument rating knowledge: attitude instrument flying, IFR regulations, weather, navigation and holding, instrument approaches, IFR flight planning and emergency procedures.",
  modules: [fundamentals, regulations, weather, navigation, approaches, planning, emergencies],
};
