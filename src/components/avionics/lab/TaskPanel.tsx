/**
 * Avionics Lab task list + current task card (instructions, live status, explanation, set-up).
 */
import { CheckCircle2, Circle, Lightbulb, MonitorPlay, Wrench } from "lucide-react";
import { Meter, Pill } from "@/components/app/page";
import { Button } from "@/components/ui/button";
import { AVIONICS_CATEGORY_LABELS, AVIONICS_TASKS, type AvionicsTask, type LabDisplay } from "@/lib/avionics/tasks";
import { useHydrated, useStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import type { SimEngine } from "@/sim/engine";
import { HOLD_MS, type CurrentTaskState } from "./useTaskRunner";

const DISPLAY_LABEL: Record<LabDisplay, string> = {
  glass: "Glass cockpit",
  sixpack: "Six-pack",
  nav: "Navigation instruments",
  gps: "GPS navigator",
  autopilot: "Autopilot",
};

export function TaskList({ currentId, onSelect, className }: { currentId: string | null; onSelect: (id: string) => void; className?: string | undefined }) {
  const done = useStore((s) => s.avionicsTasks);
  const hydrated = useHydrated();
  const count = AVIONICS_TASKS.filter((t) => done[t.id]).length;
  return (
    <div className={cn("panel p-3", className)}>
      <div className="mb-2 flex items-center justify-between">
        <span className="label-caps">Training tasks</span>
        <span className="font-mono text-xs text-muted-foreground tabular">
          {hydrated ? count : 0}/{AVIONICS_TASKS.length}
        </span>
      </div>
      <Meter value={hydrated ? (count / AVIONICS_TASKS.length) * 100 : 0} className="mb-3" />
      <ol className="max-h-[420px] space-y-0.5 overflow-auto pr-1">
        {AVIONICS_TASKS.map((t, i) => {
          const isDone = hydrated && !!done[t.id];
          const sel = t.id === currentId;
          return (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => onSelect(t.id)}
                aria-current={sel ? "true" : undefined}
                className={cn(
                  "flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-sm transition",
                  sel ? "bg-primary/15 text-foreground ring-1 ring-primary/40" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {isDone ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-ok" /> : <Circle className="mt-0.5 size-4 shrink-0 opacity-50" />}
                <span className="min-w-0">
                  <span className="block leading-snug">
                    <span className="mr-1 font-mono text-[10px] opacity-60">{String(i + 1).padStart(2, "0")}</span>
                    {t.title}
                  </span>
                  <span className="text-[10px] tracking-wide uppercase opacity-60">{AVIONICS_CATEGORY_LABELS[t.category]}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export function CurrentTaskCard({
  task,
  runner,
  engine,
  onShowDisplay,
  className,
}: {
  task: AvionicsTask;
  runner: CurrentTaskState;
  engine: SimEngine;
  onShowDisplay: (d: LabDisplay) => void;
  className?: string | undefined;
}) {
  const doneAt = useStore((s) => s.avionicsTasks[task.id]);
  const hydrated = useHydrated();
  const done = hydrated && !!doneAt;
  const pct = Math.min(100, (runner.heldMs / HOLD_MS) * 100);
  return (
    <div className={cn("panel p-4", className)}>
      <div className="flex flex-wrap items-center gap-1.5">
        <Pill tone="primary">{AVIONICS_CATEGORY_LABELS[task.category]}</Pill>
        {done ? <Pill tone="ok">Completed</Pill> : runner.passing ? <Pill tone="cyan">Holding…</Pill> : <Pill>In progress</Pill>}
      </div>
      <h3 className="mt-2 text-base font-semibold tracking-tight">{task.title}</h3>
      <p className="mt-0.5 text-sm text-muted-foreground">{task.description}</p>

      <ol className="mt-3 space-y-1.5 text-sm">
        {task.instructions.map((step, i) => (
          <li key={i} className="flex gap-2">
            <span className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-muted font-mono text-[10px] text-muted-foreground">{i + 1}</span>
            <span className="leading-snug">{step}</span>
          </li>
        ))}
      </ol>

      {runner.status ? (
        <div className="mt-3 rounded-md border border-white/10 bg-black px-2.5 py-2 font-mono text-[11px] leading-relaxed text-ok" aria-live="polite">
          {runner.status}
        </div>
      ) : null}
      {!done ? (
        <div className="mt-2">
          <div className="h-1 overflow-hidden rounded-full bg-muted">
            <div className={cn("h-full rounded-full bg-cyan transition-[width] duration-200", !runner.passing && "opacity-0")} style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-1 text-[10px] text-muted-foreground">Completes automatically when the condition holds for 2 seconds.</p>
        </div>
      ) : (
        <p className="mt-2 text-xs text-ok">Completed {new Date(doneAt!).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })} — you can practise it again any time.</p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {task.setup ? (
          <Button size="sm" variant="secondary" onClick={() => task.setup!.run(engine)}>
            <Wrench /> {task.setup.label}
          </Button>
        ) : null}
        {task.display ? (
          <Button size="sm" variant="outline" onClick={() => onShowDisplay(task.display!)}>
            <MonitorPlay /> Show {DISPLAY_LABEL[task.display]}
          </Button>
        ) : null}
      </div>

      <div className="mt-4 rounded-md border border-primary/25 bg-primary/5 p-3">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-primary">
          <Lightbulb className="size-3.5" /> Why it matters
        </p>
        <p className="mt-1 text-sm leading-relaxed text-foreground/85">{task.explain}</p>
      </div>
    </div>
  );
}
