import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, ChevronRight, Crosshair, GraduationCap, Target } from "lucide-react";
import { Meter, Notice, Page, PageHeader, Section } from "@/components/app/page";
import {
  CERTIFICATE_PATH,
  getTrack,
  KIND_LABEL,
  trackProgress,
  TRACKS,
} from "@/lib/content/tracks";
import { useTrackState } from "@/components/academy/useTrackState";
import { useStore, type TrackId } from "@/lib/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/training/")({
  head: () => ({
    meta: [
      { title: "Flight Training Pathway — SkyReady" },
      {
        name: "description",
        content:
          "The FAA certification pathway from student pilot to airline transport pilot, plus ratings, endorsements and training pathways — with requirements, ground school, exams and simulator scenarios for each.",
      },
    ],
  }),
  component: TrainingHub,
});

const GROUPS: { title: string; ids: TrackId[] }[] = [
  {
    title: "Ratings & instructor",
    ids: ["multi-engine", "seaplane", "cfi", "cfii"],
  },
  {
    title: "Endorsements",
    ids: ["tailwheel", "high-performance", "complex", "high-altitude"],
  },
  {
    title: "Training pathways",
    ids: ["night", "cross-country", "emergency", "mountain", "adm"],
  },
];

function TrainingHub() {
  const state = useTrackState();
  const profile = useStore((s) => s.profile);
  const goal = profile?.goal ?? null;
  const goalTrack = goal ? getTrack(goal) : undefined;
  const goalProg = goalTrack ? trackProgress(state, goalTrack) : null;

  return (
    <Page className="max-w-6xl">
      <PageHeader
        eyebrow="Certification pathway"
        title="Flight Training"
        icon={GraduationCap}
        description="The FAA certificate ladder from first solo to ATP — each track maps the requirements onto ground school, exams, simulator and ATC practice."
        actions={
          goalTrack ? (
            <Link
              to="/training/$track"
              params={{ track: goalTrack.id }}
              className="inline-flex items-center gap-2 rounded-lg btn-glow px-3.5 py-2 text-sm font-semibold text-primary-foreground"
            >
              Open my goal track <ArrowRight className="size-4" />
            </Link>
          ) : !profile ? (
            <Link
              to="/onboarding"
              className="inline-flex items-center gap-2 rounded-lg btn-glow px-3.5 py-2 text-sm font-semibold text-primary-foreground"
            >
              Find my track <ArrowRight className="size-4" />
            </Link>
          ) : null
        }
      />

      {/* Goal: a single quiet line. */}
      {goalTrack && goalProg ? (
        <div className="mb-8">
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-sm">
            <span className="flex items-center gap-1.5">
              <Target className="size-4 self-center text-primary" />
              <span className="text-muted-foreground">Your goal:</span>
              <Link
                to="/training/$track"
                params={{ track: goalTrack.id }}
                className="font-semibold hover:text-primary"
              >
                {goalTrack.title}
              </Link>
              <span className="font-mono font-semibold text-primary tabular">{goalProg.pct}%</span>
            </span>
            <span className="text-xs text-muted-foreground">
              {(
                [
                  ["lessons", goalProg.parts.lessons],
                  ["module exams", goalProg.parts.quizzes],
                  ["tests", goalProg.parts.exams],
                  ["sim", goalProg.parts.sims],
                  ["ATC", goalProg.parts.atc],
                ] as const
              )
                .filter(([, p]) => p.total > 0)
                .map(([label, p]) => `${p.done}/${p.total} ${label}`)
                .join(" · ")}
            </span>
          </div>
          <Meter value={goalProg.pct} />
        </div>
      ) : (
        <p className="mb-8 text-sm text-muted-foreground">
          {profile
            ? "Open a track and choose “Set as my goal” to follow it here."
            : "Create your pilot profile and take the short assessment to get a recommended track."}
        </p>
      )}

      {/* Certificate ladder */}
      <Section title="Certificate pathway">
        <ol className="grid gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-5">
          {CERTIFICATE_PATH.map((id, i) => {
            const t = getTrack(id);
            if (!t) return null;
            const p = trackProgress(state, t);
            const isGoal = goal === id;
            return (
              <li key={id} className="bg-background">
                <Link
                  to="/training/$track"
                  params={{ track: id }}
                  className={cn(
                    "group flex h-full flex-row items-center gap-3 p-3.5 transition-colors hover:bg-accent/30 sm:flex-col sm:items-stretch sm:gap-2 sm:p-4",
                    isGoal && "bg-primary/5",
                  )}
                >
                  <span className="flex items-center gap-2 font-mono text-xs text-muted-foreground">
                    <span className="text-primary">{i + 1}</span>
                    {t.short}
                    {isGoal ? (
                      <Crosshair className="size-3.5 text-primary" aria-label="Your goal" />
                    ) : null}
                  </span>
                  <span className="min-w-0 flex-1 font-semibold leading-tight group-hover:text-primary">
                    {t.title}
                  </span>
                  <span className="flex w-24 shrink-0 items-center gap-2 sm:w-auto">
                    <Meter value={p.pct} className="flex-1" />
                    <span className="font-mono text-[11px] text-muted-foreground tabular">
                      {p.pct}%
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>
      </Section>

      {/* Everything else: three plain lists side by side. */}
      <Section title="More ratings, endorsements & pathways">
        <div className="grid gap-x-10 gap-y-6 md:grid-cols-3">
          {GROUPS.map((g) => (
            <div key={g.title}>
              <h3 className="mb-1 text-xs font-medium text-muted-foreground">{g.title}</h3>
              <ul className="divide-y border-t">
                {g.ids.map((id) => {
                  const t = getTrack(id);
                  if (!t) return null;
                  const p = trackProgress(state, t);
                  return (
                    <li key={id}>
                      <Link
                        to="/training/$track"
                        params={{ track: id }}
                        title={t.summary}
                        className="group flex items-center gap-3 py-2.5 text-sm"
                      >
                        <span className="min-w-0 flex-1 truncate group-hover:text-primary">
                          {t.title}
                          {goal === id ? (
                            <Crosshair
                              className="ml-1.5 inline size-3.5 text-primary"
                              aria-label="Your goal"
                            />
                          ) : null}
                        </span>
                        <span className="font-mono text-[11px] text-muted-foreground tabular">
                          {p.pct}%
                        </span>
                        <ChevronRight className="size-4 shrink-0 text-muted-foreground/60 group-hover:text-primary" />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </Section>

      <details className="group mb-8">
        <summary className="flex cursor-pointer list-none items-center gap-1.5 text-sm font-medium text-muted-foreground select-none hover:text-foreground [&::-webkit-details-marker]:hidden">
          <ChevronRight className="size-4 transition-transform group-open:rotate-90" />
          Compare all tracks
        </summary>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="border-b text-left text-xs text-muted-foreground">
              <tr>
                <th className="py-2 pr-3 font-medium">Track</th>
                <th className="py-2 pr-3 font-medium">Type</th>
                <th className="py-2 pr-3 font-medium">Normally after</th>
                <th className="py-2 pr-3 font-medium">Written test</th>
                <th className="w-40 py-2 font-medium">Progress</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {TRACKS.map((t) => {
                const p = trackProgress(state, t);
                const written = t.examIds.find((e) =>
                  ["par", "ira", "cax", "atm", "fia", "foi", "fii"].includes(e),
                );
                return (
                  <tr key={t.id} className={cn(goal === t.id && "bg-primary/5")}>
                    <td className="py-2 pr-3">
                      <Link
                        to="/training/$track"
                        params={{ track: t.id }}
                        className="font-medium hover:text-primary"
                      >
                        {t.title}
                      </Link>
                    </td>
                    <td className="py-2 pr-3 text-xs text-muted-foreground">
                      {KIND_LABEL[t.kind]}
                    </td>
                    <td className="py-2 pr-3 text-xs text-muted-foreground">
                      {t.prerequisites.map((p2) => getTrack(p2)?.short ?? p2).join(", ") || "—"}
                    </td>
                    <td className="py-2 pr-3 font-mono text-xs uppercase">{written ?? "—"}</td>
                    <td className="py-2">
                      <Meter value={p.pct} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </details>

      <Notice tone="caution" title="Training aid only — no FAA certificate or loggable time.">
        Completing SkyReady training does not grant any FAA certificate, rating, endorsement, or
        loggable flight time. Simulator sessions here are not FAA-approved training devices. Train
        with an authorized instructor and verify requirements in the current 14 CFR and ACS.
      </Notice>
    </Page>
  );
}
