/**
 * Shared plumbing for the panel's instruments: one requestAnimationFrame loop owned by
 * <CockpitPanel> calls every registered "updater" with a FrameInfo; each instrument moves its own
 * needles through refs (no React state per frame).
 */
import { createContext, useContext, useEffect, useRef } from "react";
import type { Sim } from "@/core/sim";
import type { ControlState, InstrumentState, NavState, SimState, SystemsState } from "@/core/types";

export interface FrameInfo {
  sim: Sim;
  state: SimState;
  /** Indicated values — the only flight data the panel draws. */
  ind: InstrumentState;
  nav: NavState;
  sys: SystemsState;
  c: ControlState;
  /** The main electrical bus is alive (battery or alternator feeding it). */
  powered: boolean;
  /** The avionics bus is alive (radios work). */
  avionics: boolean;
  /** Real time, seconds (for blinking and spring-backs). */
  now: number;
  /** Real seconds since the previous panel frame. */
  dt: number;
}

export type Updater = (f: FrameInfo) => void;

export interface PanelApi {
  sim: Sim;
  /** Register a per-frame updater; returns the function that removes it. */
  register(fn: Updater): () => void;
  /** Click feedback (uses the audio module when it is present). */
  click(kind?: "switch" | "knob"): void;
  /** True while "explain mode" is on: controls must not operate. */
  blocked(): boolean;
  /** Tell the pilot why a dead radio does not respond (rate-limited). */
  hintNoPower(): void;
}

export const PanelContext = createContext<PanelApi | null>(null);

export function usePanel(): PanelApi {
  const api = useContext(PanelContext);
  if (!api) throw new Error("Panel instruments must be rendered inside <CockpitPanel>.");
  return api;
}

/** Run `fn` every panel frame (while the panel is visible). */
export function useFrame(fn: Updater): void {
  const api = usePanel();
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => api.register((f) => ref.current(f)), [api]);
}

/** Running numbers for developers: how many instruments update per frame and what that costs (smoothed, ms). */
export const panelStats = { updaters: 0, frames: 0, frameMs: 0 };

/** Bus voltage above which the 28 V panel equipment is considered alive. */
export const BUS_ALIVE_VOLTS = 10;
