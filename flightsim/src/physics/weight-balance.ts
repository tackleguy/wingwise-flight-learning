/**
 * Weight and balance for the TeachX trainer (Cessna 172P-class).
 *
 * The numbers here are the SAME numbers the flight model uses (flightsim/jsbsim/aircraft/c172p/
 * c172p.xml): same empty weight, same loading stations, same arms. A test checks that the centre
 * of gravity computed here agrees with the one JSBSim reports (tests/physics/weight-balance.test.ts).
 *
 * Arms are inches aft of the datum (the front face of the firewall), handbook-class values.
 * Educational reference only — a real aircraft must be loaded with ITS OWN weight-and-balance data.
 */

/** Avgas weighs about 6 lb per US gallon. */
export const FUEL_LB_PER_GAL = 6;
/** Basic empty weight used by the flight model, lb (includes unusable fuel and full oil). */
export const EMPTY_WEIGHT_LB = 1454;
/** Arm of the empty aircraft, inches aft of datum. */
export const EMPTY_ARM_IN = 39.6;
/** Maximum take-off and landing weight (normal category), lb. */
export const MAX_GROSS_WEIGHT_LB = 2400;
/** Usable fuel per tank, US gal (standard tanks: 40 gal usable in total). */
export const USABLE_FUEL_PER_TANK_GAL = 20;

export type StationId = "pilot" | "frontPassenger" | "rearLeft" | "rearRight" | "baggage" | "fuelLeft" | "fuelRight";

export interface LoadingStation {
  id: StationId;
  /** Plain-language name for the loading screen. */
  name: string;
  /** Inches aft of datum. */
  armIn: number;
  /** Inches right of the centreline (negative = left). */
  lateralIn: number;
  /** Structural / placard limit for this station, lb. */
  maxLb: number;
}

/** Loading stations in the order of `sim.loading.payloadLb`, then the two fuel tanks. */
export const STATIONS: readonly LoadingStation[] = [
  { id: "pilot", name: "Pilot (left front seat)", armIn: 37, lateralIn: -14, maxLb: 400 },
  { id: "frontPassenger", name: "Front passenger (right front seat)", armIn: 37, lateralIn: 14, maxLb: 400 },
  { id: "rearLeft", name: "Rear passenger, left", armIn: 73, lateralIn: -14, maxLb: 400 },
  { id: "rearRight", name: "Rear passenger, right", armIn: 73, lateralIn: 14, maxLb: 400 },
  { id: "baggage", name: "Baggage area", armIn: 95, lateralIn: 0, maxLb: 120 },
  { id: "fuelLeft", name: "Fuel, left tank", armIn: 48, lateralIn: -58, maxLb: USABLE_FUEL_PER_TANK_GAL * FUEL_LB_PER_GAL },
  { id: "fuelRight", name: "Fuel, right tank", armIn: 48, lateralIn: 58, maxLb: USABLE_FUEL_PER_TANK_GAL * FUEL_LB_PER_GAL },
];

/** Centre-of-gravity limits, normal category. */
export const CG_AFT_LIMIT_IN = 47.3;
export const CG_FORWARD_LIMIT_LIGHT_IN = 35.0;
export const CG_FORWARD_LIMIT_GROSS_IN = 39.5;
/** The forward limit is constant up to this weight, then moves aft in a straight line to maximum weight. */
export const CG_FORWARD_BREAK_WEIGHT_LB = 1950;

/**
 * The normal-category envelope as a closed polygon (centre of gravity in inches, weight in lb),
 * going clockwise from the bottom-left corner. Draw it as a chart with CG across and weight up.
 * The bottom edge is drawn at 1500 lb, just above the empty weight.
 */
export const CG_ENVELOPE: readonly { cgIn: number; weightLb: number }[] = [
  { cgIn: CG_FORWARD_LIMIT_LIGHT_IN, weightLb: 1500 },
  { cgIn: CG_FORWARD_LIMIT_LIGHT_IN, weightLb: CG_FORWARD_BREAK_WEIGHT_LB },
  { cgIn: CG_FORWARD_LIMIT_GROSS_IN, weightLb: MAX_GROSS_WEIGHT_LB },
  { cgIn: CG_AFT_LIMIT_IN, weightLb: MAX_GROSS_WEIGHT_LB },
  { cgIn: CG_AFT_LIMIT_IN, weightLb: 1500 },
];

/** Forward centre-of-gravity limit at a given weight, inches. */
export function forwardLimitIn(weightLb: number): number {
  if (weightLb <= CG_FORWARD_BREAK_WEIGHT_LB) return CG_FORWARD_LIMIT_LIGHT_IN;
  const t = (weightLb - CG_FORWARD_BREAK_WEIGHT_LB) / (MAX_GROSS_WEIGHT_LB - CG_FORWARD_BREAK_WEIGHT_LB);
  return CG_FORWARD_LIMIT_LIGHT_IN + t * (CG_FORWARD_LIMIT_GROSS_IN - CG_FORWARD_LIMIT_LIGHT_IN);
}

/** The loading the simulator uses at the next spawn (same shape as `sim.loading`). */
export interface Loading {
  fuelLeftGal: number;
  fuelRightGal: number;
  /** [pilot, front passenger, rear-left, rear-right, baggage], lb */
  payloadLb: readonly [number, number, number, number, number];
}

export interface WeightBalanceItem {
  id: StationId | "empty";
  name: string;
  weightLb: number;
  armIn: number;
  /** weight × arm, lb·in */
  momentLbIn: number;
  /** True when this station carries more than its limit. */
  overLimit: boolean;
}

export interface WeightBalance {
  /** Total (ramp) weight, lb. */
  weightLb: number;
  /** Total moment, lb·in. */
  momentLbIn: number;
  /** Centre of gravity, inches aft of datum. */
  cgIn: number;
  /** Lateral centre of gravity, inches right of the centreline. */
  lateralCgIn: number;
  /** Limits at this weight. */
  forwardLimitIn: number;
  aftLimitIn: number;
  /** Pounds above maximum weight (0 when within limits). */
  overweightLb: number;
  /** Weight is at or below maximum AND the centre of gravity is between the limits AND no station is over its limit. */
  withinEnvelope: boolean;
  /** Plain-language problems, empty when everything is within limits. */
  problems: string[];
  /** One row per item for a loading table (empty aircraft first). */
  items: WeightBalanceItem[];
}

/** Add up a loading: total weight, moment, centre of gravity, and whether it is inside the normal-category envelope. */
export function computeWeightBalance(loading: Loading): WeightBalance {
  const weights: number[] = [...loading.payloadLb.map((w) => Math.max(0, w)), Math.max(0, loading.fuelLeftGal) * FUEL_LB_PER_GAL, Math.max(0, loading.fuelRightGal) * FUEL_LB_PER_GAL];
  const items: WeightBalanceItem[] = [
    { id: "empty", name: "Empty aircraft", weightLb: EMPTY_WEIGHT_LB, armIn: EMPTY_ARM_IN, momentLbIn: EMPTY_WEIGHT_LB * EMPTY_ARM_IN, overLimit: false },
  ];
  let weightLb = EMPTY_WEIGHT_LB;
  let momentLbIn = EMPTY_WEIGHT_LB * EMPTY_ARM_IN;
  let lateral = 0;
  const problems: string[] = [];
  STATIONS.forEach((st, i) => {
    const w = weights[i] ?? 0;
    const overLimit = w > st.maxLb + 1e-6;
    items.push({ id: st.id, name: st.name, weightLb: w, armIn: st.armIn, momentLbIn: w * st.armIn, overLimit });
    weightLb += w;
    momentLbIn += w * st.armIn;
    lateral += w * st.lateralIn;
    if (overLimit) problems.push(`${st.name}: ${Math.round(w)} lb is more than the ${Math.round(st.maxLb)} lb limit.`);
  });
  const cgIn = momentLbIn / weightLb;
  const fwd = forwardLimitIn(weightLb);
  const overweightLb = Math.max(0, weightLb - MAX_GROSS_WEIGHT_LB);
  if (overweightLb > 0.5) problems.push(`Overweight by ${Math.round(overweightLb)} lb (maximum ${MAX_GROSS_WEIGHT_LB} lb).`);
  if (cgIn < fwd - 1e-6) problems.push(`Centre of gravity is too far forward (${cgIn.toFixed(1)} in; the limit at this weight is ${fwd.toFixed(1)} in).`);
  if (cgIn > CG_AFT_LIMIT_IN + 1e-6) problems.push(`Centre of gravity is too far aft (${cgIn.toFixed(1)} in; the limit is ${CG_AFT_LIMIT_IN.toFixed(1)} in).`);
  return {
    weightLb,
    momentLbIn,
    cgIn,
    lateralCgIn: lateral / weightLb,
    forwardLimitIn: fwd,
    aftLimitIn: CG_AFT_LIMIT_IN,
    overweightLb,
    withinEnvelope: problems.length === 0,
    problems,
    items,
  };
}
