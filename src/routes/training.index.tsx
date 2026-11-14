import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Award, ChevronRight, Crosshair, GraduationCap, Target } from "lucide-react";
import { Meter, Notice, Page, PageHeader, Pill, Section } from "@/components/app/page";
import {
  CERTIFICATE_PATH,
  getTrack,
  KIND_LABEL,
  trackProgress,
  TRACKS,
  type Track,
} from "@/lib/content/tracks";
import { useTrackState } from "@/components/academy/useTrackState";
import { actions, useStore, type TrackId, type TrainingState } from "@/lib/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/training/")({
  head: () => ({
    meta: [
      { title: "Flight Training Pathway — TeachX" },
      {
        name: "description",
        content:
          "The FAA certification pathway from student pilot to airline transport pilot, plus ratings, endorsements and training pathways — with requirements, ground school, exams and simulator scenarios for each.",
      },
    ],
  }),
  component: TrainingHub,
});

const GROUPS: { title: string; description: string; ids: TrackId[] }[] = [
  {
    title: "Additional ratings & instructor certificates",
    description: "Class ratings and flight instructor privileges added to your certificate.",
    ids: ["multi-engine", "seaplane", "cfi", "cfii"],
  },
  {
    title: "Endorsements",
    description: "One-time instructor endorsements required by 14 CFR 61.31.",
    ids: ["tailwheel", "high-performance", "complex", "high-altitude"],
  },
  {
    title: "Training pathways",
    description: "Skill-focused programs that cut across certificates.",
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
    <Page>
      <PageHeader
        eyebrow="Certification pathway"
        title="Flight Training"
        icon={GraduationCap}
        description="Follow the FAA certificate ladder from your first solo to the airline transport pilot certificate. Each track maps the real requirements onto TeachX ground school, exams, simulator scenarios and ATC practice."
      />

      <Notice tone="caution" title="Training aid only." className="mb-6">
        Completing TeachX training does not grant any FAA certificate, rating, endorsement, or
        loggable flight time. Simulator sessions here are not FAA-approved training devices. Train
        with an authorized instructor and verify requirements in the current 14 CFR and ACS.
      </Notice>

      {/* Goal */}
      {goalTrack && goalProg ? (
        <div className="panel mb-8 overflow-hidden border-primary/40">
          <div className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0">
              <p className="label-caps flex items-center gap-1.5 text-primary">
                <Target className="size-3.5" /> Your goal
              </p>
              <h2 className="mt-1 text-xl font-bold">{goalTrack.title}</h2>
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{goalTrack.summary}</p>
            </div>
            <div className="w-full shrink-0 md:w-72">
              <div className="mb-1 flex items-baseline justify-between">
                <span className="label-caps">Track progress</span>
                <span className="font-mono text-2xl font-semibold text-primary tabular">
                  {goalProg.pct}%
                </span>
              </div>
              <Meter value={goalProg.pct} />
              <Link
                to="/training/$track"
                params={{ track: goalTrack.id }}
                className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
              >
                Open track <ArrowRight className="size-4" />
              </Link>
            </div>
          </div>
          <div className="grid grid-cols-2 border-t sm:grid-cols-5">
            {(
              [
                ["Ground lessons", goalProg.parts.lessons],
                ["Module exams", goalProg.parts.quizzes],
                ["Tests passed", goalProg.parts.exams],
                ["Sim scenarios", goalProg.parts.sims],
                ["ATC scenarios", goalProg.parts.atc],
              ] as const
            ).map(([label, p]) => (
              <div
                key={label}
                className="border-r border-b px-4 py-2.5 last:border-r-0 sm:border-b-0"
              >
                <div className="label-caps">{label}</div>
                <div className="font-mono text-sm font-semibold tabular">
                  {p.done}/{p.total}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <Notice title="Set your training goal." className="mb-8">
          {profile
            ? "Choose a track below and select 'Set as my goal' on its page."
            : "Create your pilot profile and take the knowledge assessment to get a recommended track."}{" "}
          {!profile ? (
            <Link
              to="/onboarding"
              className="font-semibold text-primary underline-offset-2 hover:underline"
            >
              Start onboarding
            </Link>
          ) : null}
        </Notice>
      )}

      {/* Certificate ladder */}
      <Section
        title="Certificate pathway"
        description="The core FAA progression for airplane pilots."
      >
        <ol className="grid gap-3 md:grid-cols-5">
          {CERTIFICATE_PATH.map((id, i) => {
            const t = getTrack(id);
            if (!t) return null;
            const p = trackProgress(state, t);
            const isGoal = goal === id;
            return (
              <li key={id} className="relative">
                {i < CERTIFICATE_PATH.length - 1 ? (
                  <ChevronRight className="absolute top-1/2 -right-3 z-10 hidden size-5 -translate-y-1/2 text-muted-foreground md:block" />
                ) : null}
                <Link
                  to="/training/$track"
                  params={{ track: id }}
                  className={cn(
                    "panel flex h-full flex-col p-4 transition-colors hover:border-primary/60",
                    isGoal && "border-primary bg-primary/5 ring-1 ring-primary/40",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex size-7 items-center justify-center rounded-full bg-primary/15 font-mono text-xs font-bold text-primary">
                      {i + 1}
                    </span>
                    {isGoal ? (
                      <Pill tone="primary">
                        <Crosshair className="size-3" /> Goal
                      </Pill>
                    ) : (
                      <Pill>{KIND_LABEL[t.kind]}</Pill>
                    )}
                  </div>
                  <p className="mt-3 font-mono text-xs text-muted-foreground">{t.short}</p>
                  <p className="font-semibold leading-tight">{t.title}</p>
                  <p className="mt-1.5 line-clamp-3 text-xs leading-relaxed text-muted-foreground">
                    {t.summary}
                  </p>
                  <div className="mt-auto pt-3">
                    <Meter value={p.pct} label="Progress" />
                  </div>
                </Link>
              </li>
            );
          })}
        </ol>
      </Section>

      {GROUPS.map((g) => (
        <Section key={g.title} title={g.title} description={g.description}>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {g.ids.map((id) => {
              const t = getTrack(id);
              return t ? <TrackCard key={id} track={t} state={state} isGoal={goal === id} /> : null;
            })}
          </div>
        </Section>
      ))}

      <Section title="All tracks at a glance">
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Track</th>
                <th className="px-3 py-2 font-medium">Type</th>
                <th className="px-3 py-2 font-medium">Normally after</th>
                <th className="px-3 py-2 font-medium">Written test</th>
                <th className="w-40 px-3 py-2 font-medium">Progress</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {TRACKS.map((t) => {
                const p = trackProgress(state, t);
                const written = t.examIds.find((e) =>
                  ["par", "ira", "cax", "atm", "fia", "foi", "fii"].includes(e),
                );
                return (
                  <tr
                    key={t.id}
                    className={cn("hover:bg-muted/20", goal === t.id && "bg-primary/5")}
                  >
                    <td className="px-3 py-2">
                      <Link
                        to="/training/$track"
                        params={{ track: t.id }}
                        className="font-medium hover:text-primary"
                      >
                        {t.title}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {KIND_LABEL[t.kind]}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {t.prerequisites.map((p2) => getTrack(p2)?.short ?? p2).join(", ") || "—"}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs uppercase">{written ?? "—"}</td>
                    <td className="px-3 py-2">
                      <Meter value={p.pct} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Section>
    </Page>
  );
}

function TrackCard({
  track,
  state,
  isGoal,
}: {
  track: Track;
  state: TrainingState;
  isGoal: boolean;
}) {
  const p = trackProgress(state, track);
  const profile = useStore((s) => s.profile);
  return (
    <div
      className={cn("panel flex flex-col p-4", isGoal && "border-primary ring-1 ring-primary/40")}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <Link
            to="/training/$track"
            params={{ track: track.id }}
            className="font-semibold leading-tight hover:text-primary"
          >
            {track.title}
          </Link>
          <div className="mt-1 flex flex-wrap gap-1">
            <Pill
              tone={
                track.kind === "endorsement"
                  ? "cyan"
                  : track.kind === "pathway"
                    ? "magenta"
                    : "primary"
              }
            >
              {KIND_LABEL[track.kind]}
            </Pill>
            {isGoal ? (
              <Pill tone="ok">
                <Award className="size-3" /> Goal
              </Pill>
            ) : null}
          </div>
        </div>
        <span className="font-mono text-xs text-muted-foreground">{track.short}</span>
      </div>
      <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-muted-foreground">
        {track.summary}
      </p>
      <div className="mt-auto space-y-2 pt-3">
        <Meter value={p.pct} label="Progress" />
        <div className="flex items-center justify-between gap-2">
          <Link
            to="/training/$track"
            params={{ track: track.id }}
            className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
          >
            View requirements <ArrowRight className="size-3.5" />
          </Link>
          {profile && !isGoal ? (
            <button
              type="button"
              onClick={() => actions.updateProfile({ goal: track.id })}
              className="text-[11px] text-muted-foreground hover:text-foreground"
            >
              Set as goal
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
