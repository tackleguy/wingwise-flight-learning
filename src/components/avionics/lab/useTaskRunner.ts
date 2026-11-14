/**
 * Evaluates every incomplete Avionics Lab task against the live snapshot. A task completes when
 * its check passes continuously for HOLD_MS (wall-clock, not while paused).
 */
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { AVIONICS_TASKS, type TaskMemory } from "@/lib/avionics/tasks";
import { actions, useStore } from "@/lib/store";
import type { SimEngine } from "@/sim/engine";

export const HOLD_MS = 2000;

export interface CurrentTaskState {
  status: string;
  passing: boolean;
  heldMs: number;
}

export function useTaskRunner(
  engine: SimEngine | null,
  currentId: string | null,
): CurrentTaskState {
  const done = useStore((s) => s.avionicsTasks);
  const doneRef = useRef(done);
  doneRef.current = done;
  const currentRef = useRef(currentId);
  currentRef.current = currentId;
  const [state, setState] = useState<CurrentTaskState>({ status: "", passing: false, heldMs: 0 });

  useEffect(() => {
    if (!engine) return;
    const mem = new Map<string, TaskMemory>();
    const since = new Map<string, number>();
    let lastUi = 0;
    const tick = () => {
      const s = engine.getSnapshot();
      const now = typeof performance !== "undefined" ? performance.now() : Date.now();
      for (const t of AVIONICS_TASKS) {
        if (doneRef.current[t.id]) continue;
        let m = mem.get(t.id);
        if (!m) {
          m = {};
          mem.set(t.id, m);
        }
        let ok = false;
        try {
          ok = !s.paused && !s.aircraft.crashed && t.check(s, m);
        } catch {
          ok = false;
        }
        if (ok) {
          const t0 = since.get(t.id) ?? now;
          since.set(t.id, t0);
          if (now - t0 >= HOLD_MS) {
            since.delete(t.id);
            actions.completeAvionicsTask(t.id, t.title);
            toast.success(`Task complete: ${t.title}`, {
              description: "Great work — progress saved to your training record.",
            });
          }
        } else since.delete(t.id);
      }
      if (now - lastUi > 200) {
        lastUi = now;
        const cur = AVIONICS_TASKS.find((t) => t.id === currentRef.current);
        if (cur) {
          const t0 = since.get(cur.id);
          let status = "";
          try {
            status = cur.status ? cur.status(s) : "";
          } catch {
            status = "";
          }
          setState({ status, passing: t0 !== undefined, heldMs: t0 !== undefined ? now - t0 : 0 });
        }
      }
    };
    return engine.subscribe(tick);
  }, [engine]);

  return state;
}
