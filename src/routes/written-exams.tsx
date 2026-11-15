import { useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { BookOpenCheck, ChevronRight, FileCheck2, Star, Timer } from "lucide-react";
import { Meter, Notice, Page, PageHeader, Section } from "@/components/app/page";
import { HistoryTable } from "@/components/exams/HistoryTable";
import { WRITTEN_EXAMS, type ExamDef } from "@/lib/exams/catalog";
import { READINESS_TONE, readinessFor } from "@/lib/exams/analytics";
import { useHydrated, useStore, type ExamAttempt } from "@/lib/store";

export const Route = createFileRoute("/written-exams")({
  head: () => ({
    meta: [
      { title: "Written Exams — TeachX" },
      {
        name: "description",
        content:
          "Full-length practice exams modeled on the FAA PAR, IRA, CAX, ATM, FOI, FIA and FII knowledge tests, with readiness estimates. Unofficial study material.",
      },
    ],
  }),
  component: WrittenExams,
});

function hours(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? `${h} h${m ? ` ${m} min` : ""}` : `${m} min`;
}

function WrittenExams() {
  const hydrated = useHydrated();
  const exams = useStore((s) => s.exams);
  const goal = useStore((s) => s.profile?.goal);
  const writtenIds = useMemo(() => new Set(WRITTEN_EXAMS.map((e) => e.id)), []);
  const writtenHistory = useMemo(
    () => exams.filter((e) => writtenIds.has(e.examId)),
    [exams, writtenIds],
  );

  const ordered = useMemo(() => {
    if (!goal) return WRITTEN_EXAMS;
    return [...WRITTEN_EXAMS].sort(
      (a, b) => Number(b.recommendedFor.includes(goal)) - Number(a.recommendedFor.includes(goal)),
    );
  }, [goal]);

  return (
    <Page className="max-w-6xl">
      <PageHeader
        eyebrow="Test"
        title="Written Exams"
        icon={FileCheck2}
        description="Full-length practice exams in the format of the FAA airman knowledge tests. Take them timed to measure readiness."
        actions={
          <Link
            to="/practice-tests"
            className="inline-flex h-9 items-center gap-2 rounded-md border border-input bg-background px-4 text-sm font-medium hover:bg-accent"
          >
            <BookOpenCheck className="size-4" /> Practice Test Center
          </Link>
        }
      />

      <Notice
        tone="caution"
        title="Unofficial study material — not actual FAA knowledge test questions."
        className="-mt-2 mb-6"
      >
        These exams mirror the format of the FAA knowledge tests but use original TeachX questions.
        A passing practice score does not guarantee a passing FAA result, and does not satisfy any
        FAA requirement or endorsement.
      </Notice>

      <ul className="mb-8 divide-y border-y">
        {ordered.map((e) => (
          <ExamRow
            key={e.id}
            def={e}
            attempts={exams.filter((a) => a.examId === e.id)}
            hydrated={hydrated}
            recommended={!!goal && e.recommendedFor.includes(goal)}
          />
        ))}
      </ul>

      {hydrated && writtenHistory.length > 0 ? (
        <Section title="Written exam history">
          <HistoryTable rows={writtenHistory.slice(0, 15)} />
        </Section>
      ) : null}

      <details className="group text-sm">
        <summary className="flex cursor-pointer list-none items-center gap-1.5 font-medium text-muted-foreground select-none hover:text-foreground [&::-webkit-details-marker]:hidden">
          <ChevronRight className="size-4 transition-transform group-open:rotate-90" />
          About the FAA knowledge tests &amp; readiness scale
        </summary>
        <div className="mt-3 grid max-w-4xl gap-6 pl-5 md:grid-cols-[1fr_220px]">
          <ul className="list-disc space-y-2 pl-4 text-foreground/85 marker:text-muted-foreground">
            <li>
              FAA knowledge tests are taken at approved testing centers. Most require an instructor
              endorsement or other proof of eligibility before testing (14 CFR 61.35).
            </li>
            <li>
              The minimum passing score is 70%. Your test report lists the ACS codes for the
              knowledge areas you missed, which your instructor must review with you before the
              practical test.
            </li>
            <li>
              For most certificates and ratings, the knowledge test result must be within the
              preceding 24 calendar months when you take the practical test (14 CFR 61.39).
            </li>
            <li>
              TeachX readiness estimates weight your most recent attempts most heavily and count
              study-mode attempts at half weight because answers are revealed as you go.
            </li>
          </ul>
          <ul className="grid content-start gap-2 text-sm">
            {(
              [
                ["Ready", "text-ok", "85%+"],
                ["Nearly ready", "text-primary", "78–84%"],
                ["Borderline", "text-caution", "70–77%"],
                ["Not yet ready", "text-warning", "below 70%"],
              ] as const
            ).map(([label, cls, range]) => (
              <li key={label} className="flex items-center justify-between">
                <span className={cls}>{label}</span>
                <span className="font-mono text-xs text-muted-foreground">{range}</span>
              </li>
            ))}
          </ul>
        </div>
      </details>
    </Page>
  );
}

const READINESS_TEXT = {
  ok: "text-ok",
  primary: "text-primary",
  caution: "text-caution",
  warning: "text-warning",
  default: "text-muted-foreground",
} as const;

function ExamRow({
  def,
  attempts,
  hydrated,
  recommended,
}: {
  def: ExamDef;
  attempts: ExamAttempt[];
  hydrated: boolean;
  recommended: boolean;
}) {
  const r = readinessFor(attempts, def.id);
  const capped = def.faa && def.faa.questions !== def.questionCount;
  const tone = READINESS_TONE[r.level];
  const last = attempts[0];
  return (
    <li className="flex flex-col gap-3 py-4 md:flex-row md:items-center md:gap-6">
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-baseline gap-x-2">
          <span className="w-10 shrink-0 font-mono text-sm font-semibold text-primary">
            {def.code}
          </span>
          <span className="font-semibold">{def.title}</span>
          {recommended ? (
            <span className="inline-flex items-center gap-1 text-xs text-primary">
              <Star className="size-3" /> Your goal
            </span>
          ) : null}
        </p>
        <p className="mt-0.5 pl-12 text-xs text-muted-foreground">
          {def.questionCount} questions · {hours(def.timeLimitMin)} · {def.passPct}% to pass
          {def.faa && capped ? (
            <span
              className="ml-1 cursor-help underline decoration-dotted underline-offset-2"
              title={`FAA test format: ${def.faa.questions} questions · ${hours(def.faa.minutes)} · 70% to pass. The TeachX bank currently provides ${def.questionCount} questions for this exam; the time limit is scaled to match.`}
            >
              (scaled)
            </span>
          ) : null}
        </p>
        <p className="mt-0.5 hidden truncate pl-12 text-xs text-muted-foreground/80 lg:block">
          {def.description}
        </p>
      </div>
      <div className="w-full shrink-0 pl-12 text-xs md:w-44 md:pl-0" title={r.detail}>
        {!hydrated ? (
          <span className="text-muted-foreground">…</span>
        ) : r.estimate === null ? (
          <span className="text-muted-foreground">No attempts yet</span>
        ) : (
          <>
            <div className="mb-1 flex justify-between gap-2">
              <span className={READINESS_TEXT[tone]}>{r.label}</span>
              {last ? (
                <span className="font-mono text-muted-foreground tabular">
                  last{" "}
                  <span className={last.passed ? "text-ok" : "text-warning"}>
                    {Math.round(last.scorePct)}%
                  </span>
                </span>
              ) : null}
            </div>
            <Meter value={r.estimate} />
          </>
        )}
      </div>
      <div className="flex shrink-0 gap-2 pl-12 md:pl-0">
        <Link
          to="/exam/$examId"
          params={{ examId: def.id }}
          search={{ mode: "timed" }}
          className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg btn-glow px-3 text-xs font-semibold text-primary-foreground"
        >
          <Timer className="size-3.5" /> Timed exam
        </Link>
        <Link
          to="/exam/$examId"
          params={{ examId: def.id }}
          search={{ mode: "study" }}
          className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-input px-3 text-xs font-medium hover:bg-accent"
        >
          <BookOpenCheck className="size-3.5" /> Study
        </Link>
      </div>
    </li>
  );
}
