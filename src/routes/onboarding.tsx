import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  GraduationCap,
  UserCircle2,
  XCircle,
} from "lucide-react";
import { Page, PageHeader, Notice, Pill, Meter } from "@/components/app/page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { actions, useStore, type AssessmentResult, type TrackId } from "@/lib/store";
import { ASSESSMENT_QUESTIONS, scoreAssessment } from "@/lib/content/assessment";
import { TRACKS } from "@/lib/content/tracks";
import { AIRPORTS } from "@/lib/data/airports";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/onboarding")({
  head: () => ({
    meta: [
      { title: "Create Your Pilot Profile — TeachX" },
      {
        name: "description",
        content:
          "Create a pilot profile, take a short aviation knowledge assessment and choose your training pathway.",
      },
    ],
  }),
  component: Onboarding,
});

const CALLSIGN_RE = /^N[1-9][0-9]{0,4}[A-Z]{0,2}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function randomCallsign() {
  const n = 100 + Math.floor(Math.random() * 899);
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  return `N${n}${letters[Math.floor(Math.random() * letters.length)]}${letters[Math.floor(Math.random() * letters.length)]}`;
}

const STEPS = ["Profile", "Assessment", "Training goal", "Ready"] as const;

function Onboarding() {
  const existing = useStore((s) => s.profile);
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [name, setName] = useState(existing?.name ?? "");
  const [email, setEmail] = useState(existing?.email ?? "");
  const [callsign, setCallsign] = useState(existing?.callsign ?? randomCallsign());
  const [home, setHome] = useState(existing?.homeAirport ?? "KPAO");
  const [answers, setAnswers] = useState<(number | null)[]>(() =>
    ASSESSMENT_QUESTIONS.map(() => null),
  );
  const [qi, setQi] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [result, setResult] = useState<AssessmentResult | null>(null);
  const [goal, setGoal] = useState<TrackId>(existing?.goal ?? "private");

  const errors = useMemo(() => {
    const e: Record<string, string> = {};
    if (name.trim().length < 2) e["name"] = "Enter your name (at least 2 characters).";
    if (email && !EMAIL_RE.test(email)) e["email"] = "That email address doesn't look valid.";
    if (!CALLSIGN_RE.test(callsign))
      e["callsign"] = "Use a US-style N-number, e.g. N172TX (N + 1–5 digits + up to 2 letters).";
    return e;
  }, [name, email, callsign]);

  const q = ASSESSMENT_QUESTIONS[qi];
  const answered = answers.filter((a) => a !== null).length;

  const finishAssessment = () => {
    const r = scoreAssessment(answers);
    setResult(r);
    setGoal(r.recommendedTrack);
    actions.saveAssessment(r);
    setStep(2);
  };

  const saveProfile = () => {
    const p = { name: name.trim(), email: email.trim(), callsign, homeAirport: home, goal };
    if (existing) actions.updateProfile(p);
    else actions.createProfile(p);
    setStep(3);
  };

  const mainTracks = TRACKS.filter((t) =>
    [
      "student",
      "private",
      "instrument",
      "commercial",
      "atp",
      "cfi",
      "cfii",
      "multi-engine",
    ].includes(t.id),
  );

  return (
    <Page className="max-w-3xl">
      <PageHeader
        eyebrow="Get started"
        icon={UserCircle2}
        title={existing ? "Update your pilot profile" : "Create your pilot profile"}
        description="Three quick steps: your profile, a 15-question knowledge assessment, and your training goal."
      />

      <ol className="mb-8 flex items-center gap-2 text-xs" aria-label="Steps">
        {STEPS.map((s, i) => (
          <li
            key={s}
            aria-current={i === step ? "step" : undefined}
            className={cn(
              "flex min-w-0 items-center gap-1.5",
              i === step ? "text-foreground" : i < step ? "text-ok" : "text-muted-foreground",
            )}
          >
            <span
              className={cn(
                "grid size-5 shrink-0 place-items-center rounded-full border font-mono text-[10px]",
                i === step && "border-primary bg-primary text-primary-foreground",
                i < step && "border-ok/50",
              )}
            >
              {i < step ? <CheckCircle2 className="size-3" /> : i + 1}
            </span>
            <span className={cn("truncate font-medium", i !== step && "hidden sm:inline")}>
              {s}
            </span>
            {i < STEPS.length - 1 ? (
              <span className="mx-1 h-px w-4 shrink-0 bg-border sm:w-8" aria-hidden />
            ) : null}
          </li>
        ))}
      </ol>

      {step === 0 ? (
        <div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                className="mt-1.5"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Amelia Pilot"
                autoComplete="name"
              />
              {errors["name"] && name ? (
                <p className="mt-1 text-xs text-warning">{errors["name"]}</p>
              ) : null}
            </div>
            <div>
              <Label htmlFor="email">Email (optional)</Label>
              <Input
                id="email"
                type="email"
                className="mt-1.5"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
              />
              {errors["email"] ? (
                <p className="mt-1 text-xs text-warning">{errors["email"]}</p>
              ) : null}
            </div>
            <div>
              <Label htmlFor="callsign">Simulator callsign</Label>
              <div className="mt-1.5 flex gap-2">
                <Input
                  id="callsign"
                  className="font-mono uppercase"
                  value={callsign}
                  onChange={(e) =>
                    setCallsign(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))
                  }
                  maxLength={7}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setCallsign(randomCallsign())}
                >
                  Random
                </Button>
              </div>
              {errors["callsign"] ? (
                <p className="mt-1 text-xs text-warning">{errors["callsign"]}</p>
              ) : (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Used by ATC in radio practice (fictional registration).
                </p>
              )}
            </div>
            <div>
              <Label htmlFor="home">Home airport</Label>
              <select
                id="home"
                value={home}
                onChange={(e) => setHome(e.target.value)}
                className="mt-1.5 w-full rounded-md border bg-background px-3 py-2 text-sm"
              >
                {AIRPORTS.map((a) => (
                  <option key={a.icao} value={a.icao}>
                    {a.icao} — {a.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <Notice className="mt-6" title="Where is my data stored?" open={false}>
            Your profile and training progress are saved privately in this browser on this device.
            Export/import is available in Settings. Signing in to sync across devices requires
            enabling a cloud account backend for this app.
          </Notice>
          <div className="mt-5 flex justify-end">
            <Button disabled={Object.keys(errors).length > 0} onClick={() => setStep(1)}>
              Continue <ArrowRight className="size-4" />
            </Button>
          </div>
        </div>
      ) : null}

      {step === 1 && q ? (
        <div>
          <div className="mb-3 flex items-center justify-between text-xs text-muted-foreground">
            <span>
              Question {qi + 1} of {ASSESSMENT_QUESTIONS.length} · {q.subject}
            </span>
            <span>{answered} answered</span>
          </div>
          <Meter value={((qi + 1) / ASSESSMENT_QUESTIONS.length) * 100} />
          {q.context ? (
            <pre className="mt-4 overflow-x-auto rounded-md border bg-panel p-3 font-mono text-xs whitespace-pre-wrap text-ok">
              {q.context}
            </pre>
          ) : null}
          <p className="mt-6 text-lg font-semibold">{q.prompt}</p>
          <div className="mt-3 space-y-2">
            {q.choices.map((c, i) => {
              const sel = answers[qi] === i;
              const correct = revealed && i === q.answer;
              const wrong = revealed && sel && i !== q.answer;
              return (
                <button
                  key={i}
                  disabled={revealed}
                  onClick={() => setAnswers((a) => a.map((x, k) => (k === qi ? i : x)))}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-md border px-3 py-2.5 text-left text-sm transition",
                    correct
                      ? "border-ok bg-ok/10"
                      : wrong
                        ? "border-warning bg-warning/10"
                        : sel
                          ? "border-primary bg-primary/10"
                          : "hover:bg-accent",
                  )}
                >
                  <span className="grid size-6 shrink-0 place-items-center rounded border font-mono text-xs">
                    {String.fromCharCode(65 + i)}
                  </span>
                  {c}
                  {correct ? (
                    <CheckCircle2 className="ml-auto size-4 text-ok" />
                  ) : wrong ? (
                    <XCircle className="ml-auto size-4 text-warning" />
                  ) : null}
                </button>
              );
            })}
          </div>
          {revealed ? (
            <p className="mt-3 rounded-md bg-muted/40 p-3 text-sm text-foreground/90">
              {q.explanation}
            </p>
          ) : null}
          <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
            <Button
              variant="ghost"
              onClick={() => {
                setRevealed(false);
                if (qi === 0) setStep(0);
                else setQi(qi - 1);
              }}
            >
              <ArrowLeft className="size-4" /> Back
            </Button>
            <div className="flex gap-2">
              {!revealed && answers[qi] !== null ? (
                <Button variant="outline" onClick={() => setRevealed(true)}>
                  Check answer
                </Button>
              ) : null}
              {qi < ASSESSMENT_QUESTIONS.length - 1 ? (
                <Button
                  onClick={() => {
                    setRevealed(false);
                    setQi(qi + 1);
                  }}
                >
                  {answers[qi] === null ? "Skip — I don't know" : "Next"}{" "}
                  <ArrowRight className="size-4" />
                </Button>
              ) : (
                <Button onClick={finishAssessment}>
                  Finish assessment <CheckCircle2 className="size-4" />
                </Button>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {step === 2 ? (
        <div>
          {result ? (
            <div className="mb-8 border-b pb-6">
              <p className="text-xs text-muted-foreground">Assessment result</p>
              <p className="mt-1 text-2xl font-bold">
                {result.score}/{result.total}{" "}
                <span className="text-base font-medium text-muted-foreground capitalize">
                  · {result.level}
                </span>
              </p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {Object.entries(result.byCategory).map(([k, v]) => (
                  <Meter
                    key={k}
                    value={v.total ? (v.correct / v.total) * 100 : 0}
                    label={`${k} (${v.correct}/${v.total})`}
                  />
                ))}
              </div>
            </div>
          ) : null}
          <p className="mb-2 text-sm font-semibold">Choose your training goal</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {mainTracks.map((t) => (
              <button
                key={t.id}
                onClick={() => setGoal(t.id)}
                className={cn(
                  "rounded-md border p-3 text-left transition",
                  goal === t.id ? "border-primary bg-primary/10" : "hover:bg-accent",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold">{t.title}</span>
                  {result?.recommendedTrack === t.id ? <Pill tone="ok">Recommended</Pill> : null}
                </div>
                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{t.summary}</p>
              </button>
            ))}
          </div>
          <div className="mt-5 flex justify-between">
            <Button variant="ghost" onClick={() => setStep(1)}>
              <ArrowLeft className="size-4" /> Back
            </Button>
            <Button onClick={saveProfile}>
              Save profile <CheckCircle2 className="size-4" />
            </Button>
          </div>
        </div>
      ) : null}

      {step === 3 ? (
        <div className="py-6 text-center">
          <GraduationCap className="mx-auto size-10 text-primary" />
          <h2 className="mt-3 text-xl font-bold">You're ready to train, {name.split(" ")[0]}.</h2>
          <p className="mx-auto mt-1 max-w-lg text-sm text-muted-foreground">
            Your recommended path starts with ground school, then radio practice and simulator
            flights, and finishes with practice exams and a mock checkride.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <Button asChild>
              <Link to={goal === "instrument" || goal === "cfii" ? "/ifr" : "/vfr"}>
                Open {goal === "instrument" || goal === "cfii" ? "IFR" : "VFR"} academy
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to="/training/$track" params={{ track: goal }}>
                View my training track
              </Link>
            </Button>
            <Button variant="outline" onClick={() => navigate({ to: "/" })}>
              Go to dashboard
            </Button>
          </div>
        </div>
      ) : null}
    </Page>
  );
}
