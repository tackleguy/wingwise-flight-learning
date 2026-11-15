/**
 * Panel module: the SVG cockpit instrument panel and the "explain this instrument" content.
 * See docs/notes/panel.md.
 */
export { CockpitPanel, type CockpitPanelProps } from "./CockpitPanel";
export { ExplainCard, type ExplainCardProps } from "./ExplainCard";
export { EXPLAIN, type InstrumentExplanation } from "./explain";
export { INSTRUMENT_IDS, isInstrumentId, type InstrumentId } from "./ids";
export { PANEL_HEIGHT_FRACTION, panelHeightFraction, panelLayout, defaultDrawerOpen, type PanelLayoutMode, type PanelLayoutOptions, type PanelMetrics, type PanelPage } from "./layout";
export { panelStubInstruments } from "./stub";
export { panelStats } from "./context";
