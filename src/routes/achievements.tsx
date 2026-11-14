import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Lock, Trophy } from "lucide-react";

import { Meter, Page, PageHeader, Pill, Stat, formatDate } from "@/components/app/page";
import { achievementIcon } from "@/components/achievements/achievement-icon";
import { ACHIEVEMENTS, achievementProgress, type AchievementCategory } from "@/lib/achievements";
import { useHydrated, useStore } from "@/lib/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/achievements")({
  head: () => ({
    meta: [
      { title: "Achievements — TeachX" },
      {
        name: "description",
        content:
          "Training milestones earned from your real progress: flights, landings, radio work, ground school, exams and consistency.",
      },
    ],
  }),
  component: AchievementsPage,
});

const CATEGORIES: AchievementCategory[] = [
  "Flight",
  "Radio",
  "Ground School",
  "Instrument",
  "Avionics",
  "Exams",
  "Consistency",
];

function AchievementsPage() {
  const hydrated = useHydrated();
  const unlocked = useStore((s) => s.achievements);
  // Subscribe to the whole state so progress bars update; select a stable reference.
  const state = useStore((s) => s);
  const [filter, setFilter] = useState<AchievementCategory | "all" | "unlocked" | "locked">("all");

  const rows = useMemo(
    () =>
      ACHIEVEMENTS.map((a) => ({
        a,
        date: unlocked[a.id],
        prog: hydrated ? achievementProgress(a, state) : null,
      })),
    [unlocked, state, hydrated],
  );
  const count = rows.filter((r) => r.date).length;
  const shown = rows.filter((r) =>
    filter === "all"
      ? true
      : filter === "unlocked"
        ? !!r.date
        : filter === "locked"
          ? !r.date
          : r.a.category === filter,
  );
  const latest = rows
    .filter((r) => r.date)
    .sort((x, y) => ((x.date ?? "") < (y.date ?? "") ? 1 : -1))[0];

  return (
    <Page>
      <PageHeader
        eyebrow="Overview"
        icon={Trophy}
        title="Achievements"
        description="Milestones are unlocked automatically from your real training record — simulator flights, ATC sessions, lessons, quizzes and exams. Nothing here is awarded for simply visiting a page."
      />

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat
          label="Unlocked"
          value={hydrated ? `${count}/${ACHIEVEMENTS.length}` : "—"}
          tone="primary"
        />
        <Stat
          label="Completion"
          value={hydrated ? `${Math.round((count / ACHIEVEMENTS.length) * 100)}%` : "—"}
        />
        <Stat
          label="Latest"
          value={<span className="text-base">{latest ? latest.a.title : "None yet"}</span>}
          sub={latest?.date ? formatDate(latest.date) : "Fly, study or talk to ATC to start"}
        />
        <Stat label="Remaining" value={hydrated ? ACHIEVEMENTS.length - count : "—"} />
      </div>

      <div className="mb-4 flex flex-wrap gap-1.5" role="group" aria-label="Filter achievements">
        {(["all", "unlocked", "locked", ...CATEGORIES] as const).map((c) => (
          <button
            key={c}
            type="button"
            aria-pressed={filter === c}
            onClick={() => setFilter(c)}
            className={cn(
              "rounded-md border px-2.5 py-1 text-xs font-medium capitalize",
              filter === c
                ? "border-primary/50 bg-primary/15 text-primary"
                : "bg-card text-muted-foreground hover:text-foreground",
            )}
          >
            {c}
          </button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map(({ a, date, prog }) => {
          const Icon = achievementIcon(a.icon);
          const done = !!date;
          const p = prog
            ? prog.target > 0
              ? (prog.current / prog.target) * 100
              : 0
            : done
              ? 100
              : 0;
          return (
            <div
              key={a.id}
              className={cn(
                "panel relative flex gap-3 p-4 transition-colors",
                done ? "border-ok/30" : "opacity-90",
              )}
            >
              <div
                className={cn(
                  "grid size-11 shrink-0 place-items-center rounded-md border",
                  done
                    ? "border-ok/40 bg-ok/10 text-ok"
                    : "border-border bg-muted text-muted-foreground",
                )}
              >
                {done ? <Icon className="size-5" /> : <Lock className="size-4" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <h3 className={cn("text-sm font-semibold", !done && "text-foreground/80")}>
                    {a.title}
                  </h3>
                  <Pill>{a.category}</Pill>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{a.description}</p>
                {done ? (
                  <p className="mt-2 text-xs text-ok">Unlocked {formatDate(date)}</p>
                ) : prog ? (
                  <div className="mt-2">
                    <Meter value={p} />
                    <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                      {prog.current} / {prog.target}
                    </p>
                  </div>
                ) : (
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    Locked — complete the requirement above.
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Page>
  );
}
