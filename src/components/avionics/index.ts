/**
 * TeachX avionics component library. Every component reads the SimEngine from <SimProvider>
 * (useSimSnapshot / useSimEngine) and takes only optional sizing/config props.
 */
export { Pfd, type PfdProps } from "./Pfd";
export { Mfd, type MfdProps, type MfdPage } from "./Mfd";
export { MovingMap, MAP_RANGES, nextRange, type MovingMapProps, type MapLayers } from "./MovingMap";
export { SixPack, AirspeedIndicator, AttitudeIndicator, Altimeter, TurnCoordinator, HeadingIndicator, VerticalSpeedIndicator, MagneticCompass, type SixPackProps } from "./SixPack";
export { VorIndicator, Hsi, AdfIndicator, DmeReadout, IlsIndicator, NavInstrumentsPanel, type NavIndicatorProps } from "./NavInstruments";
export { GpsUnit, activateTrainingApproach, type GpsUnitProps, type GpsPage } from "./GpsUnit";
export { AutopilotPanel, AP_HELP, type AutopilotPanelProps } from "./AutopilotPanel";
export { RadiosPanel, type RadiosPanelProps } from "./RadiosPanel";
export { EngineGauges, BarGauge, ArcGauge, engineGaugeSpecs, type EngineGaugesProps } from "./EngineGauges";
export { Annunciators, type AnnunciatorsProps } from "./Annunciators";
export { Knob, type KnobProps, type KnobRing } from "./Knob";
export { SwitchPanel, type SwitchPanelProps } from "./SwitchPanel";
export { InstrumentExplainContext, ExplainButton, DisplayBezel, SoftKey } from "./common";
export { INSTRUMENT_INFO, type InstrumentId, type InstrumentInfo } from "./instrument-info";
export * as avionicsControls from "./controls";
export { FlightControls, useKeyboardFlightControls } from "./lab/FlightControls";
