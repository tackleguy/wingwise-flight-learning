/**
 * Every instrument and control on the cockpit panel that can be explained ("explain this
 * instrument" mode). The same ids are used as `data-instrument` attributes on the drawing.
 */
export const INSTRUMENT_IDS = [
  // flight instruments (the "six-pack") and the compass
  "airspeed",
  "attitude",
  "altimeter",
  "turn-coordinator",
  "heading",
  "vsi",
  "compass",
  // engine and system gauges
  "tachometer",
  "fuel-quantity",
  "oil-temp",
  "oil-pressure",
  "egt",
  "ammeter",
  "suction",
  "clock",
  "annunciators",
  // radios and navigation
  "com1",
  "nav1",
  "dme",
  "transponder",
  "vor1",
  // switches and levers
  "master-switch",
  "avionics-master",
  "lights",
  "panel-lights",
  "pitot-heat",
  "ignition",
  "throttle",
  "mixture",
  "carb-heat",
  "flaps",
  "trim",
  "fuel-selector",
  "parking-brake",
] as const;

export type InstrumentId = (typeof INSTRUMENT_IDS)[number];

export function isInstrumentId(v: unknown): v is InstrumentId {
  return typeof v === "string" && (INSTRUMENT_IDS as readonly string[]).includes(v);
}
