/**
 * Avionics Lab task list + current task card (instructions, live status, set-up, and the
 * "why it matters" explanation one click away). Neither draws its own box; the route places
 * both in a single panel.
 */
import {
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Circle,
  Lightbulb,
  MonitorPlay,
  Wrench,
} from "lucide-react";
import { Meter, Pill } from "@/components/app/page";
import { Button } from "@/components/ui/button";
import {
  AVIONICS_CATEGORY_LABELS,
  AVIONICS_TASKS,
  type AvionicsTask,
  type LabDisplay,
} from "@/lib/avionics/tasks";
import { useHydrated, useStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import type { SimEngine } from "@/sim/engine";
import { HOLD_MS, type CurrentTaskState } from "./useTaskRunner";

const DISPLAY_LABEL: Record<LabDisplay, string> = {
  glass: "Glass cockpit",
  sixpack: "Six-pack",
  nav: "Nav instruments",
  gps: "GPS",
  autopilot: "Autopilot",
};

/** Collapsible list of all training tasks with overall progress. */
export function TaskList({
  currentId,
  onSelect,
  className,
}: {
  currentId: string | null;
  onSelect: (id: string) => void;
  className?: string | undefined;
}) {
  const done = useStore((s) => s.avionicsTasks);
  const hydrated = useHydrated();
  const count = AVIONICS_TASKS.filter((t) => done[t.id]).length;
  return (
    <details className={cn("group", className)}>
      <summary className="flex cursor-pointer list-none items-center gap-3 select-none [&::-webkit-details-marker]:hidden">
        <span className="text-sm font-medium">All tasks</span>
        <Meter value={hydrated ? (count / AVIONICS_TASKS.length) * 100 : 0} className="flex-1" />
        <span className="font-mono text-xs text-muted-foreground tabular">
          {hydrated ? count : 0}/{AVIONICS_TASKS.length}
        </span>
        <ChevronDown className="size-4 text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>
      <ol className="mt-2 max-h-[360px] space-y-0.5 overflow-auto pr-1">
        {AVIONICS_TASKS.map((t, i) => {
          const isDone = hydrated && !!done[t.id];
          const sel = t.id === currentId;
          return (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => onSelect(t.id)}
                aria-current={sel ? "true" : undefined}
                title={AVIONICS_CATEGORY_LABELS[t.category]}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-sm transition",
                  sel
                    ? "bg-primary/15 text-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {isDone ? (
                  <CheckCircle2 className="size-4 shrink-0 text-ok" />
                ) : (
                  <Circle className="size-4 shrink-0 opacity-50" />
                )}
                <span className="w-5 shrink-0 font-mono text-[10px] opacity-60">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="min-w-0 leading-snug">{t.title}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </details>
  );
}

export function CurrentTaskCard({
  task,
  runner,
  engine,
  onShowDisplay,
  onSelect,
  className,
}: {
  task: AvionicsTask;
  runner: CurrentTaskState;
  engine: SimEngine;
  onShowDisplay: (d: LabDisplay) => void;
  /** Move to another task (prev/next arrows). */
  onSelect?: ((id: string) => void) | undefined;
  className?: string | undefined;
}) {
  const doneAt = useStore((s) => s.avionicsTasks[task.id]);
  const hydrated = useHydrated();
  const done = hydrated && !!doneAt;
  const pct = Math.min(100, (runner.heldMs / HOLD_MS) * 100);
  const idx = AVIONICS_TASKS.findIndex((t) => t.id === task.id);
  const prev = AVIONICS_TASKS[idx - 1];
  const next = AVIONICS_TASKS[idx + 1];
  return (
    <div className={className}>
      <div className="flex items-center gap-2">
        <span className="label-caps min-w-0 flex-1 truncate">
          Task {idx + 1} of {AVIONICS_TASKS.length} · {AVIONICS_CATEGORY_LABELS[task.category]}
        </span>
        {onSelect ? (
          <span className="flex shrink-0">
            <Button
              size="icon"
              variant="ghost"
              className="size-7"
              disabled={!prev}
              onClick={() => prev && onSelect(prev.id)}
              aria-label="Previous task"
            >
              <ChevronLeft />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="size-7"
              disabled={!next}
              onClick={() => next && onSelect(next.id)}
              aria-label="Next task"
            >
              <ChevronRight />
            </Button>
          </span>
        ) : null}
      </div>
      <h3 className="mt-1 flex flex-wrap items-center gap-2 text-base font-semibold tracking-tight">
        {task.title}
        {done ? (
          <Pill tone="ok">Done</Pill>
        ) : runner.passing ? (
          <Pill tone="cyan">Holding…</Pill>
        ) : null}
      </h3>
      <p className="mt-0.5 text-sm text-muted-foreground">{task.description}</p>

      <ol className="mt-3 space-y-1.5 text-sm">
        {task.instructions.map((step, i) => (
          <li key={i} className="flex gap-2">
            <span className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-muted font-mono text-[10px] text-muted-foreground">
              {i + 1}
            </span>
            <span className="leading-snug">{step}</span>
          </li>
        ))}
      </ol>

      {runner.status || !done ? (
        <div className="mt-3 overflow-hidden rounded-md border border-white/10 bg-black">
          {runner.status ? (
            <p
              className="px-2.5 py-2 font-mono text-[11px] leading-relaxed text-ok"
              aria-live="polite"
            >
              {runner.status}
            </p>
          ) : null}
          {!done ? (
            <div className="h-1 bg-white/5">
              <div
                className={cn(
                  "h-full bg-cyan transition-[width] duration-200",
                  !runner.passing && "opacity-0",
                )}
                style={{ width: `${pct}%` }}
              />
            </div>
          ) : null}
        </div>
      ) : null}
      {done ? (
        <p className="mt-2 text-xs text-ok">
          Completed{" "}
          {new Date(doneAt!).toLocaleString(undefined, {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}{" "}
          — practise again any time.
        </p>
      ) : (
        <p className="mt-1 text-[11px] text-muted-foreground">
          Completes automatically after holding for 2 s.
        </p>
      )}

      {task.setup || task.display ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {task.setup ? (
            <Button size="sm" variant="secondary" onClick={() => task.setup!.run(engine)}>
              <Wrench /> {task.setup.label}
            </Button>
          ) : null}
          {task.display ? (
            <Button size="sm" variant="ghost" onClick={() => onShowDisplay(task.display!)}>
              <MonitorPlay /> {DISPLAY_LABEL[task.display]}
            </Button>
          ) : null}
        </div>
      ) : null}

      <details className="group mt-3">
        <summary className="flex cursor-pointer list-none items-center gap-1.5 text-xs font-semibold text-primary select-none [&::-webkit-details-marker]:hidden">
          <Lightbulb className="size-3.5" /> Why it matters
          <ChevronDown className="size-3.5 transition-transform group-open:rotate-180" />
        </summary>
        <p className="mt-1.5 text-sm leading-relaxed text-foreground/85">{task.explain}</p>
      </details>
    </div>
  );
}
