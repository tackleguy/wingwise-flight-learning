import { useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { BookOpenCheck, Clock, FileCheck2, Gauge, History, Info, ListChecks, Star, Target, Timer } from "lucide-react";
import { Meter, Notice, Page, PageHeader, Panel, Pill, Section, formatDate } from "@/components/app/page";
import { HistoryTable } from "@/components/exams/HistoryTable";
import { WRITTEN_EXAMS, type ExamDef } from "@/lib/exams/catalog";
import { READINESS_TONE, readinessFor } from "@/lib/exams/analytics";
import { useHydrated, useStore, type ExamAttempt } from "@/lib/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/written-exams")({
  head: () => ({
    meta: [
      { title: "Written Exams — TeachX" },
      {
        name: "description",
        content: "Full-length practice exams modeled on the FAA PAR, IRA, CAX, ATM, FOI, FIA and FII knowledge tests, with readiness estimates. Unofficial study material.",
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
  const writtenHistory = useMemo(() => exams.filter((e) => writtenIds.has(e.examId)), [exams, writtenIds]);

  const ordered = useMemo(() => {
    if (!goal) return WRITTEN_EXAMS;
    return [...WRITTEN_EXAMS].sort((a, b) => Number(b.recommendedFor.includes(goal)) - Number(a.recommendedFor.includes(goal)));
  }, [goal]);

  return (
    <Page>
      <PageHeader
        eyebrow="Test"
        title="Written Exams"
        icon={FileCheck2}
        description="Full-length practice exams structured like the FAA airman knowledge tests — same question counts, time limits and 70% passing score where the TeachX bank allows. Take them timed to measure readiness."
        actions={
          <Link to="/practice-tests" className="inline-flex h-9 items-center gap-2 rounded-md border border-input bg-background px-4 text-sm font-medium hover:bg-accent">
            <BookOpenCheck className="size-4" /> Practice Test Center
          </Link>
        }
      />

      <Notice tone="caution" title="Unofficial study material — not actual FAA knowledge test questions." className="mb-6">
        These exams mirror the format of the FAA knowledge tests but use original TeachX questions. A passing practice score does not guarantee a passing FAA result, and does not satisfy any FAA requirement or endorsement.
      </Notice>

      <Section title="Full-length practice exams">
        <div className="grid gap-4 md:grid-cols-2">
          {ordered.map((e) => (
            <ExamCard key={e.id} def={e} attempts={exams.filter((a) => a.examId === e.id)} hydrated={hydrated} recommended={!!goal && e.recommendedFor.includes(goal)} />
          ))}
        </div>
      </Section>

      <div className="mb-8 grid gap-4 lg:grid-cols-3">
        <Panel title={<span className="flex items-center gap-1.5"><Info className="size-3.5" /> About the FAA knowledge tests</span>} className="lg:col-span-2">
          <ul className="grid gap-2 text-sm text-foreground/85">
            <li>• FAA knowledge tests are taken at approved testing centers. Most require an instructor endorsement or other proof of eligibility before testing (14 CFR 61.35).</li>
            <li>• The minimum passing score is 70%. Your test report lists the ACS codes for the knowledge areas you missed, which your instructor must review with you before the practical test.</li>
            <li>• For most certificates and ratings, the knowledge test result must be within the preceding 24 calendar months when you take the practical test (14 CFR 61.39).</li>
            <li>• TeachX readiness estimates weight your most recent attempts most heavily and count study-mode attempts at half weight because answers are revealed as you go.</li>
          </ul>
        </Panel>
        <Panel title={<span className="flex items-center gap-1.5"><Target className="size-3.5" /> Readiness scale</span>}>
          <ul className="grid gap-2 text-sm">
            <li className="flex items-center justify-between"><Pill tone="ok">Ready</Pill><span className="font-mono text-xs text-muted-foreground">85%+</span></li>
            <li className="flex items-center justify-between"><Pill tone="primary">Nearly ready</Pill><span className="font-mono text-xs text-muted-foreground">78–84%</span></li>
            <li className="flex items-center justify-between"><Pill tone="caution">Borderline</Pill><span className="font-mono text-xs text-muted-foreground">70–77%</span></li>
            <li className="flex items-center justify-between"><Pill tone="warning">Not yet ready</Pill><span className="font-mono text-xs text-muted-foreground">below 70%</span></li>
          </ul>
        </Panel>
      </div>

      <Section title="Written exam history">
        {!hydrated ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : writtenHistory.length === 0 ? (
          <p className="flex items-center gap-2 rounded-md border border-dashed px-4 py-6 text-sm text-muted-foreground">
            <History className="size-4" /> No written exam attempts yet. Start with study mode if you're early in your training.
          </p>
        ) : (
          <HistoryTable rows={writtenHistory.slice(0, 15)} />
        )}
      </Section>
    </Page>
  );
}

function ExamCard({ def, attempts, hydrated, recommended }: { def: ExamDef; attempts: ExamAttempt[]; hydrated: boolean; recommended: boolean }) {
  const r = readinessFor(attempts, def.id);
  const capped = def.faa && def.faa.questions !== def.questionCount;
  return (
    <div className={cn("panel flex flex-col p-5", recommended && "border-primary/50")}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded bg-primary/15 px-2 py-0.5 font-mono text-sm font-bold text-primary">{def.code}</span>
            {recommended ? (
              <Pill tone="primary">
                <Star className="size-3" /> Your goal
              </Pill>
            ) : null}
          </div>
          <h3 className="mt-2 text-lg font-semibold leading-snug">{def.title}</h3>
        </div>
        {hydrated ? <Pill tone={READINESS_TONE[r.level]}>{r.label}</Pill> : null}
      </div>
      <p className="mt-1.5 text-sm text-muted-foreground">{def.description}</p>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <div className="rounded-md border bg-background/40 px-2.5 py-2">
          <div className="label-caps flex items-center gap-1"><ListChecks className="size-3" /> Questions</div>
          <div className="mt-0.5 font-mono text-lg font-semibold tabular">{def.questionCount}</div>
        </div>
        <div className="rounded-md border bg-background/40 px-2.5 py-2">
          <div className="label-caps flex items-center gap-1"><Clock className="size-3" /> Time</div>
          <div className="mt-0.5 font-mono text-lg font-semibold tabular">{hours(def.timeLimitMin)}</div>
        </div>
        <div className="rounded-md border bg-background/40 px-2.5 py-2">
          <div className="label-caps flex items-center gap-1"><Gauge className="size-3" /> To pass</div>
          <div className="mt-0.5 font-mono text-lg font-semibold tabular">{def.passPct}%</div>
        </div>
      </div>
      {def.faa ? (
        <p className="mt-2 text-[11px] text-muted-foreground">
          FAA test format: {def.faa.questions} questions · {hours(def.faa.minutes)} · 70% to pass.
          {capped ? ` The TeachX bank currently provides ${def.questionCount} questions for this exam; the time limit is scaled to match.` : ""}
        </p>
      ) : null}

      <div className="mt-4 min-h-16 rounded-md border bg-muted/20 px-3 py-2.5">
        {!hydrated ? (
          <p className="text-xs text-muted-foreground">Loading…</p>
        ) : r.estimate === null ? (
          <p className="text-xs text-muted-foreground">{r.detail}</p>
        ) : (
          <>
            <Meter value={r.estimate} label="Readiness estimate" />
            <p className="mt-1.5 text-[11px] text-muted-foreground">{r.detail}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {attempts.slice(0, 3).map((a) => (
                <span key={a.id} className="rounded border px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground tabular">
                  {formatDate(a.date)} · <span className={a.passed ? "text-ok" : "text-warning"}>{Math.round(a.scorePct)}%</span> {a.mode === "study" ? "(study)" : ""}
                </span>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <Link
          to="/exam/$examId"
          params={{ examId: def.id }}
          search={{ mode: "timed" }}
          className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
        >
          <Timer className="size-4" /> Start timed exam
        </Link>
        <Link
          to="/exam/$examId"
          params={{ examId: def.id }}
          search={{ mode: "study" }}
          className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-input px-3 text-sm font-semibold hover:bg-accent"
        >
          <BookOpenCheck className="size-4" /> Study mode
        </Link>
      </div>
    </div>
  );
}
