/**
 * React bindings for the simulation engine.
 *
 *   <SimProvider engine={engine}> ... </SimProvider>
 *   const snap = useSimSnapshot();            // full snapshot (re-renders every frame)
 *   const ias = useSimSelector((s) => s.indicated.iasKt);
 *   const engine = useSimEngine();            // to send commands: engine.setControls(...)
 */
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import type { SimEngine, SimOptions } from "./engine";
import type { SimSnapshot } from "./types";

const SimContext = createContext<SimEngine | null>(null);

export function SimProvider({ engine, children }: { engine: SimEngine; children: ReactNode }) {
  return <SimContext.Provider value={engine}>{children}</SimContext.Provider>;
}

export function useSimEngine(): SimEngine {
  const e = useContext(SimContext);
  if (!e) throw new Error("useSimEngine must be used inside <SimProvider>");
  return e;
}

export function useSimSnapshot(engine?: SimEngine): SimSnapshot {
  const ctx = useContext(SimContext);
  const e = engine ?? ctx;
  if (!e) throw new Error("useSimSnapshot needs an engine (prop or <SimProvider>)");
  return useSyncExternalStore(e.subscribe, e.getSnapshot, e.getSnapshot);
}

/** Select a derived value; component re-renders only when the selected value changes (Object.is). */
export function useSimSelector<T>(selector: (s: SimSnapshot) => T, engine?: SimEngine): T {
  const ctx = useContext(SimContext);
  const e = engine ?? ctx;
  if (!e) throw new Error("useSimSelector needs an engine (prop or <SimProvider>)");
  const sel = useRef(selector);
  sel.current = selector;
  return useSyncExternalStore(
    e.subscribe,
    () => sel.current(e.getSnapshot()),
    () => sel.current(e.getSnapshot()),
  );
}

/**
 * Create (client-side only) and run a SimEngine for the lifetime of the component.
 * Returns null during SSR / before the engine is ready.
 */
export function useCreateSim(factory: () => SimOptions, deps: unknown[]): SimEngine | null {
  const [engine, setEngine] = useState<SimEngine | null>(null);
  useEffect(() => {
    let disposed = false;
    let created: SimEngine | null = null;
    void import("./engine").then(({ SimEngine }) => {
      if (disposed) return;
      created = new SimEngine(factory());
      created.start();
      setEngine(created);
    });
    return () => {
      disposed = true;
      created?.dispose();
      setEngine(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return engine;
}
