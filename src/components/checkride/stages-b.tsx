/**
 * Checkride stages 8–12: flight maneuvers (simulator), navigation, radio communications (ATC
 * simulator), emergency operations and postflight/debrief. (Stage 7, the walk-around, lives in
 * WalkAround.tsx.)
 */
import { useMemo, useState } from "react";
import {
  CheckCircle2,
  ExternalLink,
  Plane,
  Radio,
  RefreshCw,
  SkipForward,
  XCircle,
} from "lucide-react";
import {
  emergencyQuestions,
  navigationQuestions,
  POSTFLIGHT_ITEMS,
  selectScore,
} from "@/lib/checkride/content";
import { useStore, type AtcSession, type FlightLog } from "@/lib/store";
import { Notice, Pill, formatDateTime, formatDuration } from "@/components/app/page";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { HrefLink } from "@/components/exams/HrefLink";
import { cn } from "@/lib/utils";
import {
  QuestionSet,
  SelectAllList,
  StageFrame,
  StageResult,
  questionScore,
  useToggleSet,
  type StageProps,
} from "./shared";

const linkBtn =
  "inline-flex h-9 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90";
const linkBtnOutline =
  "inline-flex h-9 items-center justify-center gap-2 rounded-md border border-input bg-background px-4 text-sm font-medium hover:bg-accent";

function SkipStage({ label, onConfirm }: { label: string; onConfirm: () => void }) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-muted-foreground">
          <SkipForward /> {label}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Continue without completing this task?</AlertDialogTitle>
          <AlertDialogDescription>
            On a practical test, every task must be completed satisfactorily. This stage will be
            graded unsatisfactory (0) and the checkride cannot pass. You can start a new attempt
            later.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Go back</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>Grade as not completed</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function FlightSummary({ f }: { f: FlightLog }) {
  return (
    <div className="rounded-md border bg-card p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Plane className="size-4 text-primary" />
        <span className="text-sm font-semibold">{f.scenarioTitle}</span>
        <span className="text-xs text-muted-foreground">
          {formatDateTime(f.date)} · {formatDuration(f.durationSec)}
        </span>
        <span
          className={cn(
            "ml-auto font-mono text-xl font-bold tabular",
            f.score >= 70 ? "text-ok" : "text-warning",
          )}
        >
          {Math.round(f.score)}
        </span>
      </div>
      {f.objectives.length ? (
        <ul className="mt-2 grid gap-1">
          {f.objectives.map((o, i) => (
            <li key={i} className="flex items-start gap-1.5 text-xs">
              {o.met ? (
                <CheckCircle2 className="mt-px size-3.5 shrink-0 text-ok" />
              ) : (
                <XCircle className="mt-px size-3.5 shrink-0 text-warning" />
              )}
              <span>
                {o.text}
                {o.detail ? <span className="text-muted-foreground"> — {o.detail}</span> : null}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function flightNotes(f: FlightLog): string[] {
  return [
    `Simulator: ${f.scenarioTitle} — score ${Math.round(f.score)}.`,
    ...f.objectives
      .filter((o) => !o.met)
      .map((o) => `Not met: ${o.text}${o.detail ? ` (${o.detail})` : ""}.`),
    ...f.feedback.slice(0, 3),
  ];
}

// ───────────── 8 · Flight maneuvers ─────────────

export function ManeuversStage({ attempt, track, stage, onComplete }: StageProps) {
  const flights = useStore((s) => s.flights);
  const flight = useMemo(
    () => flights.find((f) => f.checkrideId === attempt.id && f.kind !== "emergency") ?? null,
    [flights, attempt.id],
  );
  const href = `/simulator?scenario=${track.simScenario}&checkride=${encodeURIComponent(attempt.id)}`;
  return (
    <StageFrame stage={stage}>
      <p className="mb-3 text-sm">
        Fly the{" "}
        {track.ifr
          ? "instrument checkride profile — a precision approach to minimums and the missed approach"
          : "flight portion — the maneuvers and landing in the checkride profile"}{" "}
        in the TeachX simulator. Your flight is linked to this checkride and scored automatically
        against the objectives.
      </p>
      <Notice className="mb-4" title="How it works:">
        Launch the simulator, complete the flight, then use “Return to checkride” in the debrief.
        This attempt is saved, so you can come back at any time. The simulator works best on a
        desktop or tablet.
      </Notice>
      {flight ? (
        <>
          <FlightSummary f={flight} />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <HrefLink href={href} className={linkBtnOutline}>
              <RefreshCw className="size-4" /> Fly it again
            </HrefLink>
            <span className="text-xs text-muted-foreground">
              Your most recent linked flight is used.
            </span>
          </div>
          <StageResult
            score={Math.round(flight.score)}
            notes={flightNotes(flight)}
            onContinue={() => onComplete(Math.round(flight.score), flightNotes(flight))}
            continueLabel="Accept flight result"
          />
        </>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <HrefLink href={href} className={linkBtn}>
            <Plane className="size-4" /> Launch simulator <ExternalLink className="size-3.5" />
          </HrefLink>
          <span className="text-xs text-muted-foreground">No linked flight yet.</span>
          <div className="ml-auto">
            <SkipStage
              label="Continue without flying"
              onConfirm={() => onComplete(0, ["Flight portion not completed in the simulator."])}
            />
          </div>
        </div>
      )}
    </StageFrame>
  );
}

// ───────────── 9 · Navigation ─────────────

export function NavigationStage({ track, stage, onComplete }: StageProps) {
  const questions = useMemo(() => navigationQuestions(track.key), [track.key]);
  const [answers, setAnswers] = useState<(number | null)[]>(() => questions.map(() => null));
  const [revealed, setRevealed] = useState(false);
  const { score, missed } = questionScore(questions, answers);
  const notes = missed.length
    ? missed.map(
        (m) => `Review: ${m.prompt.length > 110 ? `${m.prompt.slice(0, 107)}…` : m.prompt}`,
      )
    : ["Navigation and orientation tasks answered correctly."];
  return (
    <StageFrame stage={stage}>
      <p className="mb-3 text-sm">
        {track.ifr
          ? "The examiner checks your orientation, tracking, holding and GPS knowledge."
          : "The examiner checks your orientation, course correction and diversion skills."}
      </p>
      <QuestionSet
        questions={questions}
        answers={answers}
        onAnswer={(i, c) => setAnswers((a) => a.map((v, j) => (j === i ? c : v)))}
        revealed={revealed}
      />
      {!revealed ? (
        <div className="mt-5 border-t pt-4">
          <Button onClick={() => setRevealed(true)} disabled={answers.some((a) => a === null)}>
            Submit for grading
          </Button>
        </div>
      ) : (
        <StageResult score={score} notes={notes} onContinue={() => onComplete(score, notes)} />
      )}
    </StageFrame>
  );
}

// ───────────── 10 · Radio communications ─────────────

const LAUNCH_RE = /ATC scenario launched at (\S+)/;

export function RadioStage({
  attempt,
  track,
  stage,
  saved,
  onComplete,
  onSaveProgress,
}: StageProps) {
  const sessions = useStore((s) => s.atcSessions);
  const launchedAt = useMemo(() => {
    for (const n of saved.notes) {
      const m = LAUNCH_RE.exec(n);
      if (m?.[1]) return m[1];
    }
    return null;
  }, [saved.notes]);
  const session: AtcSession | null = useMemo(() => {
    if (!launchedAt) return null;
    const t = Date.parse(launchedAt);
    const after = sessions.filter((s) => Date.parse(s.date) >= t);
    return after.find((s) => s.scenarioId === track.atcScenario) ?? after[0] ?? null;
  }, [sessions, launchedAt, track.atcScenario]);
  const href = `/atc?scenario=${track.atcScenario}&difficulty=checkride&checkride=${encodeURIComponent(attempt.id)}`;
  const notes = session
    ? [
        `ATC: ${session.title} (${session.difficulty}) — score ${Math.round(session.score)}.`,
        ...session.feedback.slice(0, 4),
      ]
    : [];

  return (
    <StageFrame stage={stage}>
      <p className="mb-3 text-sm">
        {track.ifr
          ? "Copy and read back an IFR departure clearance and handle the departure communications — at checkride difficulty, with no prompts."
          : "Make the radio calls to enter Class D airspace and land — at checkride difficulty, with no prompts."}
      </p>
      <Notice className="mb-4" title="How it works:">
        Launching records the start time; the first ATC session you complete after that is used for
        this stage. Finish the scenario, then use “Return to checkride”.
      </Notice>
      {session ? (
        <>
          <div className="rounded-md border bg-card p-3">
            <div className="flex flex-wrap items-center gap-2">
              <Radio className="size-4 text-primary" />
              <span className="text-sm font-semibold">{session.title}</span>
              <span className="text-xs text-muted-foreground">
                {session.airport} · {formatDateTime(session.date)}
              </span>
              <span
                className={cn(
                  "ml-auto font-mono text-xl font-bold tabular",
                  session.score >= 70 ? "text-ok" : "text-warning",
                )}
              >
                {Math.round(session.score)}
              </span>
            </div>
            {Object.keys(session.breakdown).length ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {Object.entries(session.breakdown).map(([k, v]) => (
                  <Pill key={k}>
                    {k}: {Math.round(v)}
                  </Pill>
                ))}
              </div>
            ) : null}
          </div>
          <div className="mt-3">
            <HrefLink
              href={href}
              className={linkBtnOutline}
              onClick={() =>
                onSaveProgress([`ATC scenario launched at ${new Date().toISOString()}`])
              }
            >
              <RefreshCw className="size-4" /> Try the scenario again
            </HrefLink>
          </div>
          <StageResult
            score={Math.round(session.score)}
            notes={notes}
            onContinue={() => onComplete(Math.round(session.score), notes)}
            continueLabel="Accept radio result"
          />
        </>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <HrefLink
            href={href}
            className={linkBtn}
            onClick={() => onSaveProgress([`ATC scenario launched at ${new Date().toISOString()}`])}
          >
            <Radio className="size-4" /> Launch ATC scenario <ExternalLink className="size-3.5" />
          </HrefLink>
          <span className="text-xs text-muted-foreground">
            {launchedAt
              ? `Launched ${formatDateTime(launchedAt)} — waiting for a completed session.`
              : "Not started yet."}
          </span>
          <div className="ml-auto">
            <SkipStage
              label="Continue without it"
              onConfirm={() => onComplete(0, ["Radio communications scenario not completed."])}
            />
          </div>
        </div>
      )}
    </StageFrame>
  );
}

// ───────────── 11 · Emergency operations ─────────────

export function EmergencyStage({ attempt, track, stage, onComplete }: StageProps) {
  const questions = useMemo(() => emergencyQuestions(track.key), [track.key]);
  const flights = useStore((s) => s.flights);
  const emgFlight = useMemo(
    () => flights.find((f) => f.checkrideId === attempt.id && f.kind === "emergency") ?? null,
    [flights, attempt.id],
  );
  const [answers, setAnswers] = useState<(number | null)[]>(() => questions.map(() => null));
  const [revealed, setRevealed] = useState(false);
  const qs = questionScore(questions, answers);
  const score = emgFlight ? Math.round(0.6 * qs.score + 0.4 * emgFlight.score) : qs.score;
  const notes = [
    ...qs.missed.map(
      (m) =>
        `Emergency decision: ${m.prompt.length > 110 ? `${m.prompt.slice(0, 107)}…` : m.prompt}`,
    ),
    ...(emgFlight
      ? flightNotes(emgFlight)
      : ["Optional engine-failure simulator flight not flown; graded on decision questions only."]),
  ];
  const href = `/simulator?scenario=emg-engine-failure&checkride=${encodeURIComponent(attempt.id)}`;

  return (
    <StageFrame stage={stage}>
      <div className="mb-4 rounded-md border bg-muted/20 p-3">
        <p className="text-sm font-semibold">Optional: simulated engine failure</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Fly the engine-failure scenario before answering. If you do, it counts for 40% of this
          stage. Your answers below are not saved if you leave, so fly first.
        </p>
        {emgFlight ? (
          <div className="mt-2">
            <FlightSummary f={emgFlight} />
          </div>
        ) : (
          <HrefLink href={href} className={cn(linkBtnOutline, "mt-2")}>
            <Plane className="size-4" /> Fly the engine-failure scenario{" "}
            <ExternalLink className="size-3.5" />
          </HrefLink>
        )}
      </div>
      <QuestionSet
        questions={questions}
        answers={answers}
        onAnswer={(i, c) => setAnswers((a) => a.map((v, j) => (j === i ? c : v)))}
        revealed={revealed}
      />
      {!revealed ? (
        <div className="mt-5 border-t pt-4">
          <Button onClick={() => setRevealed(true)} disabled={answers.some((a) => a === null)}>
            Submit for grading
          </Button>
        </div>
      ) : (
        <StageResult score={score} notes={notes} onContinue={() => onComplete(score, notes)} />
      )}
    </StageFrame>
  );
}

// ───────────── 12 · Postflight & debrief ─────────────

export function PostflightStage({ attempt, stage, onComplete }: StageProps) {
  const [sel, toggle] = useToggleSet();
  const [rating, setRating] = useState<number | null>(null);
  const [well, setWell] = useState("");
  const [improve, setImprove] = useState("");
  const [revealed, setRevealed] = useState(false);
  const score = selectScore(POSTFLIGHT_ITEMS, sel);
  const graded = attempt.stages.filter((s) => s.status !== "incomplete" && s.id !== "postflight");
  const weakest = graded.slice().sort((a, b) => a.score - b.score)[0];
  const notes = [
    ...POSTFLIGHT_ITEMS.filter((i) => i.correct && !sel.has(i.id)).map(
      (i) => `Securing item omitted: ${i.label}.`,
    ),
    ...POSTFLIGHT_ITEMS.filter((i) => !i.correct && sel.has(i.id)).map(
      (i) => `Incorrect practice: ${i.label}.`,
    ),
    `Self-assessment: ${rating ?? "—"}/5.`,
    `Self-debrief — went well: ${well.trim()}`,
    `Self-debrief — to improve: ${improve.trim()}`,
  ];
  const ready = rating !== null && well.trim().length >= 15 && improve.trim().length >= 15;

  return (
    <StageFrame stage={stage}>
      <h3 className="mb-2 text-sm font-semibold">
        A · After landing, parking and securing — select every correct action
      </h3>
      <SelectAllList
        items={POSTFLIGHT_ITEMS}
        selected={sel}
        onToggle={toggle}
        revealed={revealed}
      />

      <h3 className="mb-2 mt-6 text-sm font-semibold">B · Self-debrief</h3>
      {weakest ? (
        <p className="mb-3 text-xs text-muted-foreground">
          Your lowest stage so far:{" "}
          <span className="font-medium text-foreground">{weakest.name}</span> (
          {Math.round(weakest.score)}). A good debrief is honest and specific.
        </p>
      ) : null}
      <p className="mb-1.5 text-xs font-medium">
        How would you rate your overall performance today?
      </p>
      <div className="mb-4 flex gap-1.5">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            disabled={revealed}
            onClick={() => setRating(n)}
            className={cn(
              "size-9 rounded-md border font-mono text-sm",
              rating === n ? "border-primary bg-primary/15" : "hover:bg-accent",
            )}
            aria-pressed={rating === n}
          >
            {n}
          </button>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-xs font-medium">What went well?</span>
          <Textarea
            value={well}
            disabled={revealed}
            onChange={(e) => setWell(e.target.value)}
            rows={4}
            className="mt-1 text-sm"
            placeholder="e.g., Weather decision, radio calls…"
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium">
            What will you practice before a real checkride?
          </span>
          <Textarea
            value={improve}
            disabled={revealed}
            onChange={(e) => setImprove(e.target.value)}
            rows={4}
            className="mt-1 text-sm"
            placeholder="e.g., Holding entries, crosswind landings…"
          />
        </label>
      </div>
      {!revealed ? (
        <div className="mt-5 flex flex-wrap items-center gap-3 border-t pt-4">
          <Button onClick={() => setRevealed(true)} disabled={!ready}>
            Submit debrief
          </Button>
          {!ready ? (
            <span className="text-xs text-muted-foreground">
              Rate yourself and write at least a sentence in each box.
            </span>
          ) : null}
        </div>
      ) : (
        <StageResult
          score={score}
          notes={notes}
          onContinue={() => onComplete(score, notes)}
          continueLabel="Finish checkride"
        />
      )}
    </StageFrame>
  );
}
