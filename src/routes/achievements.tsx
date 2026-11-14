import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Lock, Trophy } from "lucide-react";

import { Meter, Page, PageHeader, formatDate } from "@/components/app/page";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

  const pct = Math.round((count / ACHIEVEMENTS.length) * 100);
  const status = filter === "unlocked" || filter === "locked" ? filter : "all";
  const category = CATEGORIES.includes(filter as AchievementCategory) ? filter : "all";
  const groups = CATEGORIES.map((c) => ({
    c,
    items: shown.filter((r) => r.a.category === c),
  })).filter((g) => g.items.length);

  return (
    <Page>
      <PageHeader
        eyebrow="Overview"
        icon={Trophy}
        title="Achievements"
        description="Unlocked automatically from your real training record."
      />

      <div className="mb-6 max-w-xl">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <p className="text-sm">
            <span className="font-mono text-xl font-semibold text-primary tabular">
              {hydrated ? count : "—"}
            </span>
            <span className="text-muted-foreground">
              {" "}
              of {ACHIEVEMENTS.length} unlocked{hydrated ? ` · ${pct}%` : ""}
            </span>
          </p>
          <p className="text-xs text-muted-foreground">
            {latest?.date
              ? `Latest: ${latest.a.title} · ${formatDate(latest.date)}`
              : "Fly, study or talk to ATC to start"}
          </p>
        </div>
        <Meter value={hydrated ? pct : 0} className="mt-2" />
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <div
          className="inline-flex rounded-md border p-0.5"
          role="group"
          aria-label="Filter achievements by status"
        >
          {(["all", "unlocked", "locked"] as const).map((c) => (
            <button
              key={c}
              type="button"
              aria-pressed={status === c && category === "all"}
              onClick={() => setFilter(c)}
              className={cn(
                "rounded px-2.5 py-1 text-xs font-medium capitalize",
                status === c && category === "all"
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {c}
            </button>
          ))}
        </div>
        <Select value={category} onValueChange={(v) => setFilter(v as AchievementCategory | "all")}>
          <SelectTrigger className="h-8 w-44 text-xs" aria-label="Filter achievements by category">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {groups.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing here yet.</p>
      ) : (
        <div className="space-y-8">
          {groups.map((g) => (
            <section key={g.c}>
              <h2 className="label-caps mb-1">{g.c}</h2>
              <ul className="divide-y">
                {g.items.map(({ a, date, prog }) => {
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
                    <li key={a.id} className="flex items-center gap-3 py-3">
                      <div
                        className={cn(
                          "grid size-9 shrink-0 place-items-center rounded-md",
                          done ? "bg-ok/10 text-ok" : "bg-muted text-muted-foreground",
                        )}
                      >
                        {done ? <Icon className="size-4" /> : <Lock className="size-3.5" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className={cn("text-sm font-semibold", !done && "text-foreground/80")}>
                          {a.title}
                        </h3>
                        <p className="text-xs text-muted-foreground">{a.description}</p>
                      </div>
                      <div className="w-24 shrink-0 text-right sm:w-32">
                        {done ? (
                          <span className="text-xs text-ok">{formatDate(date)}</span>
                        ) : prog ? (
                          <>
                            <Meter value={p} />
                            <span className="mt-1 block font-mono text-[11px] text-muted-foreground">
                              {prog.current} / {prog.target}
                            </span>
                          </>
                        ) : (
                          <span className="text-[11px] text-muted-foreground">Locked</span>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </Page>
  );
}
