import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  Circle,
  ClipboardList,
  Headphones,
  Lightbulb,
  ListChecks,
  MessageSquareText,
  Mic,
  Play,
  Plane,
  Radio,
  RotateCcw,
  Square,
  Volume2,
  Wand2,
} from "lucide-react";
import { toast } from "sonner";
import { Page, PageHeader, Panel, Notice, Pill, formatDateTime } from "@/components/app/page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  RadioPanel,
  makeRadioState,
  isListening,
  type RadioState,
  type TransmitMeta,
} from "@/components/radio/RadioPanel";
import { AtcTranscript } from "@/components/radio/AtcTranscript";
import { AtcReport } from "@/components/radio/AtcReport";
import { actions, useHydrated, useStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { atcAircraftOptions, facilityDirectory, toweredAirports } from "@/lib/atc/context";
import {
  consumeHint,
  createSession,
  currentStep,
  expectedFacility,
  HINT_LIMIT,
  sessionReport,
  stepChecklist,
  stepExample,
  stepFacilities,
  stepHint,
  submitTransmission,
  type EngineEvent,
  type EngineSession,
} from "@/lib/atc/engine";
import { getScenario, isScenarioId, SCENARIOS } from "@/lib/atc/scenarios";
import {
  DIFFICULTIES,
  PERSONALITIES,
  PHASES,
  type Difficulty,
  type Personality,
  type RadioLine,
  type ScenarioId,
  type SessionReport,
} from "@/lib/atc/types";
import { useRadioQueue, type QueueItem } from "@/lib/atc/useRadioQueue";
import { useSpeechSupport } from "@/lib/atc/speech";
import { formatFreqShort } from "@/lib/atc/frequency";
import { alt, hdg, PHONETIC } from "@/lib/atc/phrase";

type AtcSearch = {
  scenario?: ScenarioId | undefined;
  difficulty?: Difficulty | undefined;
  airport?: string | undefined;
  checkride?: string | undefined;
};

const DIFF_IDS: Difficulty[] = ["beginner", "intermediate", "advanced", "checkride"];

export const Route = createFileRoute("/atc")({
  validateSearch: (s: Record<string, unknown>): AtcSearch => {
    const out: AtcSearch = {};
    if (isScenarioId(s["scenario"])) out.scenario = s["scenario"];
    const d = s["difficulty"];
    if (typeof d === "string" && (DIFF_IDS as string[]).includes(d))
      out.difficulty = d as Difficulty;
    const a = s["airport"];
    if (typeof a === "string" && /^[A-Za-z0-9]{3,4}$/.test(a)) out.airport = a.toUpperCase();
    const c = s["checkride"];
    if (typeof c === "string" && c.length > 0 && c.length < 100) out.checkride = c;
    return out;
  },
  head: () => ({
    meta: [
      { title: "ATC Simulator — TeachX" },
      {
        name: "description",
        content:
          "Practise FAA radio phraseology with 15 simulated ATC scenarios — taxi, takeoff, flight following, Class D entry, IFR clearances, approaches and emergencies — scored on readbacks, phraseology and timing.",
      },
      { property: "og:title", content: "ATC Simulator — TeachX" },
      {
        property: "og:description",
        content:
          "Simulated ATC radio training with realistic COM radio, voice input and detailed scoring.",
      },
    ],
  }),
  component: AtcPage,
});

const DIFF_RATE: Record<Difficulty, number> = {
  beginner: 0.88,
  intermediate: 1,
  advanced: 1.08,
  checkride: 1.1,
};
const PERS_RATE: Record<Personality, number> = {
  instructor: 0.94,
  professional: 1,
  busy: 1.18,
  examiner: 1.02,
};

function toQueue(events: EngineEvent[], onComplete: () => void): QueueItem[] {
  return events.map((e): QueueItem => {
    switch (e.type) {
      case "atc":
        return {
          kind: "atc",
          station: e.facility.name,
          text: e.phrase.text,
          spoken: e.phrase.spoken,
          delayMs: e.delayMs,
          mhz: e.facility.mhz,
        };
      case "traffic":
        return {
          kind: "traffic",
          station: e.label,
          text: e.phrase.text,
          spoken: e.phrase.spoken,
          delayMs: e.delayMs,
          pitch: e.pitch,
        };
      case "system":
        return { kind: "system", text: e.text, tone: e.tone };
      case "complete":
        return { kind: "call", fn: onComplete };
    }
  });
}

/** Transponder code currently set, as far as the scenario has progressed. */
function displaySquawk(s: EngineSession): string {
  const ctx = s.ctx;
  if (ctx.squawk === "7700") return "7700";
  if (
    ctx.clearance &&
    s.def.id !== "ifr-clearance-request" &&
    s.def.id !== "ifr-departure-clearance"
  )
    return ctx.clearance.squawk;
  if (["freq-change", "traffic-advisory", "emergency"].includes(s.def.id)) return ctx.squawk;
  if (s.def.id === "flight-following" && s.steps.findIndex((st) => st.id === "ff-squawk") < s.index)
    return ctx.squawk;
  if (
    s.def.rules === "IFR" &&
    (s.def.id === "instrument-approach" ||
      s.def.id === "established-final" ||
      s.def.id === "freq-change-request")
  )
    return ctx.squawk;
  return "1200";
}

const EMPTY_PAD = { c: "", r: "", a: "", f: "", t: "", notes: "" };

function AtcPage() {
  const search = Route.useSearch();
  const hydrated = useHydrated();
  const profile = useStore((s) => s.profile);
  const settings = useStore((s) => s.settings);
  const sessions = useStore((s) => s.atcSessions);
  const support = useSpeechSupport();

  const towered = useMemo(() => toweredAirports(), []);
  const aircraftOptions = useMemo(() => atcAircraftOptions(), []);

  const [scenarioId, setScenarioId] = useState<ScenarioId>(search.scenario ?? "taxi");
  const [airport, setAirport] = useState<string>(
    search.airport && towered.some((a) => a.icao === search.airport) ? search.airport : "KPAO",
  );
  const [aircraftId, setAircraftId] = useState("c172");
  const [callsign, setCallsign] = useState("N172TX");
  const [difficulty, setDifficulty] = useState<Difficulty>(
    search.difficulty ?? (search.checkride ? "checkride" : "beginner"),
  );
  const [personality, setPersonality] = useState<Personality>("professional");
  const defaultsApplied = useRef(false);

  useEffect(() => {
    if (!hydrated || defaultsApplied.current) return;
    defaultsApplied.current = true;
    if (profile?.callsign) setCallsign(profile.callsign.toUpperCase());
    if (
      !search.airport &&
      profile?.homeAirport &&
      towered.some((a) => a.icao === profile.homeAirport.toUpperCase())
    )
      setAirport(profile.homeAirport.toUpperCase());
    if (aircraftOptions.some((a) => a.id === settings.preferredAircraft))
      setAircraftId(settings.preferredAircraft);
    if (!search.difficulty && !search.checkride) setDifficulty(settings.training.difficulty);
  }, [
    hydrated,
    profile,
    settings.preferredAircraft,
    settings.training.difficulty,
    search.airport,
    search.difficulty,
    search.checkride,
    towered,
    aircraftOptions,
  ]);

  const [phase, setPhase] = useState<"setup" | "live" | "report">("setup");
  const [session, setSession] = useState<EngineSession | null>(null);
  const sessionRef = useRef<EngineSession | null>(null);
  const [radio, setRadio] = useState<RadioState>(() => makeRadioState(121.5, 118.0));
  const [report, setReport] = useState<SessionReport | null>(null);
  const [reportLines, setReportLines] = useState<RadioLine[]>([]);
  const [draft, setDraft] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [pad, setPad] = useState(EMPTY_PAD);
  const [atisHeard, setAtisHeard] = useState(false);
  const [tab, setTab] = useState("briefing");
  const busyAtPtt = useRef(false);
  const savedRef = useRef(false);

  const queue = useRadioQueue({
    speech: settings.voice.atcSpeech,
    rate: Math.max(
      0.6,
      Math.min(1.8, settings.voice.rate * DIFF_RATE[difficulty] * PERS_RATE[personality]),
    ),
    volume: Math.max(0, Math.min(1, radio.volume * settings.voice.volume)),
    voiceName: settings.voice.voiceName,
  });

  const callsignValid = /^[A-Z0-9]{2,7}$/.test(callsign);
  const scenario = getScenario(scenarioId) ?? SCENARIOS[0];

  const finish = useCallback(
    (early: boolean) => {
      const s = sessionRef.current;
      if (!s) return;
      queue.halt();
      const r = sessionReport(s);
      const lines = queue.getLines();
      setReport(r);
      setReportLines(lines);
      setPhase("report");
      if (!savedRef.current && s.evals.length > 0) {
        savedRef.current = true;
        actions.recordAtc({
          scenarioId: s.def.id,
          title: `${s.def.title}${early ? " (ended early)" : ""}`,
          airport: s.ctx.airport.icao,
          difficulty: s.difficulty,
          engine: "scripted",
          score: r.score,
          breakdown: r.breakdown,
          feedback: r.feedback,
          transcript: lines.map((l) => ({
            from: l.from === "traffic" ? "atc" : l.from,
            ...(l.station
              ? { station: l.from === "traffic" ? `${l.station} (other traffic)` : l.station }
              : {}),
            text: l.text,
            t: l.t,
          })),
        });
        toast.success("Session saved to your training record", {
          description: `${s.def.title} — ${r.score}%`,
        });
      }
    },
    [queue],
  );

  const start = () => {
    if (!callsignValid) {
      toast.error("Enter a valid callsign (e.g. N172TX)");
      return;
    }
    queue.reset();
    savedRef.current = false;
    const { session: s, events } = createSession({
      scenarioId,
      airportIcao: airport,
      aircraftId,
      callsign,
      difficulty,
      personality,
    });
    sessionRef.current = s;
    setSession(s);
    const r = s.def.radio(s.ctx, difficulty);
    setRadio((prev) =>
      makeRadioState(r.active, r.standby, { volume: prev.volume, spacing: prev.spacing }),
    );
    setReport(null);
    setDraft("");
    setRevealed(false);
    setPad(EMPTY_PAD);
    setAtisHeard(false);
    setTab("briefing");
    setPhase("live");
    queue.push(toQueue(events, () => finish(false)));
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const onPttStart = useCallback(() => {
    busyAtPtt.current = queue.isBusy();
  }, [queue]);

  const onTransmit = useCallback(
    (text: string, meta: TransmitMeta) => {
      const s = sessionRef.current;
      if (!s || s.done) return;
      const last = queue.lastAtcEnd();
      const delaySec = last ? Math.max(0, (meta.pttStartedAt - last) / 1000) : null;
      queue.addPilot(text, undefined, meta.mhz);
      const r = submitTransmission(s, {
        text,
        mhz: meta.mhz,
        busy: busyAtPtt.current,
        delaySec,
        at: Date.now(),
      });
      busyAtPtt.current = false;
      sessionRef.current = r.session;
      setSession(r.session);
      setRevealed(false);
      queue.push(toQueue(r.events, () => finish(false)));
    },
    [queue, finish],
  );

  // ATIS reception when tuned.
  const atisFreq = session?.ctx.atisFreq ?? null;
  const tunedAtis = phase === "live" && atisFreq !== null && isListening(radio, atisFreq);
  useEffect(() => {
    if (tunedAtis && !atisHeard) setAtisHeard(true);
  }, [tunedAtis, atisHeard]);

  const playAtis = () => {
    const s = sessionRef.current;
    if (!s) return;
    queue.push([
      {
        kind: "traffic",
        station: `${s.ctx.airportName} ATIS`,
        text: s.ctx.atis.phrase.text,
        spoken: s.ctx.atis.phrase.spoken,
        delayMs: 200,
        pitch: 0.9,
      },
    ]);
  };

  const abort = () => {
    const s = sessionRef.current;
    if (s && s.evals.length) finish(true);
    else {
      queue.reset();
      setPhase("setup");
      setSession(null);
      sessionRef.current = null;
    }
  };

  const bestByScenario = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of sessions)
      if (a.engine === "scripted") m.set(a.scenarioId, Math.max(m.get(a.scenarioId) ?? 0, a.score));
    return m;
  }, [sessions]);

  const checkrideLink = search.checkride
    ? `/checkrides?attempt=${encodeURIComponent(search.checkride)}`
    : null;

  // ---------------- report ----------------
  if (phase === "report" && report && session) {
    return (
      <Page>
        <PageHeader eyebrow="Radio · ATC Simulator" title="Session report" icon={Radio} />
        <AtcReport
          report={report}
          title={session.def.title}
          subtitle={
            <>
              {session.ctx.airport.icao} · {session.ctx.aircraft.shortName} {session.ctx.cs.full} ·{" "}
              {DIFFICULTIES.find((d) => d.id === session.difficulty)?.label} ·{" "}
              {PERSONALITIES.find((p) => p.id === session.personality)?.label}
            </>
          }
          lines={reportLines}
          pilotLabel={session.ctx.cs.full}
          note={
            checkrideLink ? (
              <Notice title="Checkride stage complete.">
                Your score has been saved.{" "}
                <a href={checkrideLink} className="font-semibold text-primary underline">
                  Return to checkride
                </a>{" "}
                to continue.
              </Notice>
            ) : undefined
          }
          actions={
            <>
              {checkrideLink ? (
                <Button asChild>
                  <a href={checkrideLink}>
                    <ArrowLeft /> Return to checkride
                  </a>
                </Button>
              ) : null}
              <Button onClick={start} variant={checkrideLink ? "outline" : "default"}>
                <RotateCcw /> Try again
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  queue.reset();
                  setPhase("setup");
                }}
              >
                <ListChecks /> Choose another scenario
              </Button>
              <Button variant="ghost" asChild>
                <Link to="/ai-atc">
                  <MessageSquareText /> Free-form AI ATC practice
                </Link>
              </Button>
            </>
          }
        />
      </Page>
    );
  }

  // ---------------- live session ----------------
  if (phase === "live" && session) {
    const step = currentStep(session);
    const fac = expectedFacility(session);
    const directory = facilityDirectory(session.ctx);
    const brief = session.def.briefing(session.ctx);
    const hintsLeft = HINT_LIMIT[session.difficulty] - session.hintsUsed;
    const canHint = session.difficulty !== "checkride";
    const showChecklist = session.difficulty === "beginner" || revealed;
    const facs = stepFacilities(session);
    const ctx = session.ctx;
    const atisVisible = session.difficulty === "beginner" || atisHeard;

    return (
      <Page wide>
        <div className="mb-4 flex flex-col gap-3 border-b pb-4 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            <p className="label-caps mb-1 text-primary">
              ATC Simulator · {PHASES.find((p) => p.id === session.def.phase)?.label}
            </p>
            <h1 className="flex flex-wrap items-center gap-2 text-xl font-bold tracking-tight sm:text-2xl">
              {session.def.title}
              <Pill tone="caution">Simulated</Pill>
              <Pill tone="primary">
                {DIFFICULTIES.find((d) => d.id === session.difficulty)?.label}
              </Pill>
              <Pill>{PERSONALITIES.find((p) => p.id === session.personality)?.label}</Pill>
            </h1>
            <p className="mt-1 text-xs text-muted-foreground">
              {ctx.airport.icao} {ctx.airport.name} · {ctx.aircraft.shortName}{" "}
              <span className="font-mono">{ctx.cs.full}</span> · {session.def.rules}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={start}>
              <RotateCcw /> Restart
            </Button>
            <Button variant="secondary" size="sm" onClick={abort}>
              <Square /> End &amp; score
            </Button>
          </div>
        </div>
        <Notice
          tone="caution"
          title="Simulated ATC for training — not real air traffic control."
          className="mb-4"
        >
          Nothing here is a real clearance or instruction. Frequencies marked SIM are training
          stand-ins.
        </Notice>
        {checkrideLink ? (
          <Notice className="mb-4" title="Checkride stage.">
            Complete this scenario, then return to your mock checkride.
          </Notice>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
          <div className="min-w-0 space-y-4">
            <RadioPanel
              value={radio}
              onChange={setRadio}
              directory={directory}
              expected={
                session.difficulty === "checkride" || !fac ? null : { name: fac.name, mhz: fac.mhz }
              }
              receiving={queue.receiving}
              onPttStart={onPttStart}
              onTransmit={onTransmit}
              micEnabled={settings.voice.micInput}
              draft={draft}
              onDraftChange={setDraft}
              disabled={session.done}
              composerActions={
                session.difficulty === "beginner" && step ? (
                  <button
                    type="button"
                    onClick={() => setDraft(stepExample(session)?.text ?? "")}
                    className="inline-flex items-center gap-1 rounded border border-primary/40 bg-primary/10 px-2 py-1 text-[11px] font-semibold text-primary hover:bg-primary/20"
                  >
                    <Wand2 className="size-3" /> Say it for me
                  </button>
                ) : null
              }
            />
            <AtcTranscript
              lines={queue.lines}
              receiving={queue.receiving}
              pilotLabel={ctx.cs.full}
              className="h-[320px] lg:h-[400px]"
            />
          </div>

          <div className="min-w-0 space-y-4">
            <div className="panel grid grid-cols-2 gap-px overflow-hidden bg-border sm:grid-cols-4">
              {[
                { l: "Position", v: ctx.position },
                { l: "Altitude", v: `${alt(ctx.altitude).text} ft` },
                { l: "Heading", v: hdg(ctx.heading).text },
                { l: "Runway", v: ctx.runway.id },
                { l: "Wind", v: `${hdg(ctx.atis.windDirMag).text}@${ctx.atis.windKt}` },
                {
                  l: "ATIS",
                  v: atisVisible ? (PHONETIC[ctx.atis.letter] ?? ctx.atis.letter) : "—",
                },
                { l: "Squawk", v: displaySquawk(session) },
                {
                  l: "Talking to",
                  v: session.difficulty === "checkride" ? "—" : (fac?.name ?? "—"),
                },
              ].map((x) => (
                <div key={x.l} className="bg-card px-3 py-2">
                  <div className="label-caps !text-[9px]">{x.l}</div>
                  <div className="truncate text-xs font-semibold" title={x.v}>
                    {x.v}
                  </div>
                </div>
              ))}
            </div>

            {tunedAtis ? (
              <div className="avionics-screen p-3">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-[11px] font-semibold text-cyan">
                    <Headphones className="size-3.5" /> Receiving {ctx.airportName} ATIS{" "}
                    {atisFreq ? formatFreqShort(atisFreq) : ""}
                  </span>
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={playAtis}>
                    <Volume2 /> Listen
                  </Button>
                </div>
                <p className="font-mono text-xs leading-relaxed text-cyan/90">
                  {ctx.atis.phrase.text}
                </p>
              </div>
            ) : null}

            <Tabs value={tab} onValueChange={setTab}>
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="briefing" className="text-xs">
                  <BookOpen className="size-3.5" /> <span className="hidden sm:inline">Brief</span>
                </TabsTrigger>
                <TabsTrigger value="hints" className="text-xs">
                  <Lightbulb className="size-3.5" /> <span className="hidden sm:inline">Hints</span>
                </TabsTrigger>
                <TabsTrigger value="pad" className="text-xs">
                  <ClipboardList className="size-3.5" />{" "}
                  <span className="hidden sm:inline">CRAFT</span>
                </TabsTrigger>
                <TabsTrigger value="progress" className="text-xs">
                  <ListChecks className="size-3.5" />{" "}
                  <span className="hidden sm:inline">Progress</span>
                </TabsTrigger>
              </TabsList>

              <TabsContent value="briefing">
                <Panel title="Scenario briefing">
                  <div className="space-y-3 text-sm">
                    <p>{brief.situation}</p>
                    <p className="rounded border border-primary/25 bg-primary/5 px-3 py-2 text-xs">
                      <span className="font-semibold text-primary">Goal: </span>
                      {brief.goal}
                    </p>
                    <div>
                      <div className="label-caps mb-1">What to say</div>
                      <ul className="list-disc space-y-1 pl-4 text-xs text-foreground/85">
                        {brief.say.map((x) => (
                          <li key={x}>{x}</li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <div className="label-caps mb-1">Why</div>
                      <ul className="list-disc space-y-1 pl-4 text-xs text-foreground/85">
                        {brief.why.map((x) => (
                          <li key={x}>{x}</li>
                        ))}
                      </ul>
                    </div>
                    {atisVisible ? (
                      <div>
                        <div className="label-caps mb-1">ATIS {PHONETIC[ctx.atis.letter]}</div>
                        <p className="avionics-screen p-2 font-mono text-[11px] leading-relaxed text-cyan/90">
                          {ctx.atis.phrase.text}
                        </p>
                      </div>
                    ) : ctx.atisFreq ? (
                      <p className="text-xs text-muted-foreground">
                        Tune the ATIS on{" "}
                        <span className="font-mono text-cyan">{formatFreqShort(ctx.atisFreq)}</span>{" "}
                        to get the current information code.
                      </p>
                    ) : null}
                    <p className="text-[11px] text-muted-foreground">
                      References: {session.def.refs.join(" · ")}
                    </p>
                  </div>
                </Panel>
              </TabsContent>

              <TabsContent value="hints">
                <Panel title={step ? `Now: ${step.title}` : "Complete"}>
                  {!canHint ? (
                    <p className="text-sm text-muted-foreground">
                      Checkride mode: no hints or explanations until the final report.
                    </p>
                  ) : step ? (
                    <div className="space-y-3 text-sm">
                      {showChecklist ? (
                        <>
                          <p className="text-xs text-foreground/85">{stepHint(session)}</p>
                          <ul className="space-y-1">
                            {stepChecklist(session, session.difficulty === "beginner").map((c) => (
                              <li key={c} className="flex items-start gap-2 text-xs">
                                <Circle className="mt-0.5 size-3 shrink-0 text-primary" /> {c}
                              </li>
                            ))}
                          </ul>
                          {session.difficulty === "beginner" ? (
                            <div className="rounded border border-ok/25 bg-ok/5 p-2">
                              <div className="label-caps mb-1 !text-ok">Example</div>
                              <p className="font-mono text-xs">{stepExample(session)?.text}</p>
                              <Button
                                size="sm"
                                variant="outline"
                                className="mt-2 h-7 text-xs"
                                onClick={() => setDraft(stepExample(session)?.text ?? "")}
                              >
                                <Wand2 /> Say it for me
                              </Button>
                            </div>
                          ) : null}
                        </>
                      ) : (
                        <div className="space-y-2">
                          <p className="text-xs text-muted-foreground">
                            Hints remaining:{" "}
                            <span className="font-mono">{Math.max(0, hintsLeft)}</span>. A hint
                            shows what this transmission must contain.
                          </p>
                          <Button
                            size="sm"
                            disabled={hintsLeft <= 0}
                            onClick={() => {
                              const r = consumeHint(session);
                              if (!r.allowed) return;
                              sessionRef.current = r.session;
                              setSession(r.session);
                              setRevealed(true);
                            }}
                          >
                            <Lightbulb /> Reveal hint
                          </Button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">Scenario complete.</p>
                  )}
                </Panel>
              </TabsContent>

              <TabsContent value="pad">
                <Panel title="Clearance notepad (CRAFT)">
                  <div className="space-y-2">
                    {(
                      [
                        ["c", "C — Clearance limit"],
                        ["r", "R — Route"],
                        ["a", "A — Altitude"],
                        ["f", "F — Frequency"],
                        ["t", "T — Transponder"],
                      ] as const
                    ).map(([k, l]) => (
                      <label
                        key={k}
                        className="grid grid-cols-[7.5rem_1fr] items-center gap-2 text-xs"
                      >
                        <span className="font-semibold text-muted-foreground">{l}</span>
                        <Input
                          value={pad[k]}
                          onChange={(e) => setPad({ ...pad, [k]: e.target.value })}
                          className="h-8 font-mono text-xs"
                        />
                      </label>
                    ))}
                    <Textarea
                      value={pad.notes}
                      onChange={(e) => setPad({ ...pad, notes: e.target.value })}
                      placeholder="Notes: ATIS, altimeter, taxi route, traffic…"
                      className="min-h-20 font-mono text-xs"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Write clearances as you hear them, then read back from the pad. Your notes
                      stay in this session only.
                    </p>
                  </div>
                </Panel>
              </TabsContent>

              <TabsContent value="progress">
                <Panel title={`Progress · ${Math.min(session.index, facs.length)}/${facs.length}`}>
                  <ol className="space-y-2">
                    {facs.map((f, i) => {
                      const done = i < session.index || session.done;
                      const cur = i === session.index && !session.done;
                      const evs = session.evals.filter((e) => e.stepId === f.id);
                      const last = evs[evs.length - 1];
                      return (
                        <li
                          key={f.id}
                          className={cn(
                            "flex items-start gap-2 rounded px-2 py-1.5 text-xs",
                            cur && "bg-primary/10",
                          )}
                        >
                          {done ? (
                            <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-ok" />
                          ) : cur ? (
                            <Play className="mt-0.5 size-3.5 shrink-0 text-primary" />
                          ) : (
                            <Circle className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="font-semibold">{f.title}</div>
                            <div className="text-muted-foreground">
                              {session.difficulty === "checkride" ? "" : `${f.facility.name} · `}
                              {f.atcFirst ? "ATC calls first" : "You call first"}
                            </div>
                          </div>
                          {last && session.difficulty !== "checkride" ? (
                            <span
                              className={cn(
                                "font-mono",
                                last.score >= 80
                                  ? "text-ok"
                                  : last.score >= 60
                                    ? "text-caution"
                                    : "text-warning",
                              )}
                            >
                              {last.score}
                            </span>
                          ) : null}
                        </li>
                      );
                    })}
                  </ol>
                  {session.evals.length ? (
                    <div className="mt-3 border-t pt-3">
                      <div className="label-caps mb-1.5">Communication history</div>
                      <ul className="max-h-48 space-y-1 overflow-y-auto">
                        {session.evals.map((e) => (
                          <li key={e.id} className="flex gap-2 text-[11px]">
                            <span className="w-7 shrink-0 font-mono text-muted-foreground">
                              {session.difficulty === "checkride" ? "—" : e.score}
                            </span>
                            <span className="truncate font-mono">“{e.text}”</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </Panel>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </Page>
    );
  }

  // ---------------- setup ----------------
  return (
    <Page>
      <PageHeader
        eyebrow="Radio"
        title="ATC Simulator"
        icon={Radio}
        description="Fifteen scripted radio scenarios built on FAA phraseology (AIM Chapter 4, Pilot/Controller Glossary). Tune the radio, key the mic, and get scored on every readback."
        actions={
          <Button variant="outline" asChild>
            <Link to="/ai-atc">
              <MessageSquareText /> AI ATC Practice
            </Link>
          </Button>
        }
      />
      <Notice
        tone="caution"
        title="Simulated ATC for training — not real air traffic control."
        className="mb-6"
      >
        Scenarios use an educational airport dataset; frequencies and procedures may be outdated.
        Never use this for real-world operations.
      </Notice>
      {checkrideLink ? (
        <Notice className="mb-6" title="Checkride stage.">
          Your mock checkride includes this radio scenario. Complete it, then use “Return to
          checkride”.
        </Notice>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-6">
          {PHASES.map((p) => {
            const list = SCENARIOS.filter((s) => s.phase === p.id);
            if (!list.length) return null;
            return (
              <section key={p.id}>
                <h2 className="label-caps mb-2">{p.label}</h2>
                <div className="grid gap-2.5 sm:grid-cols-2">
                  {list.map((s) => {
                    const sel = s.id === scenarioId;
                    const best = bestByScenario.get(s.id);
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => setScenarioId(s.id)}
                        aria-pressed={sel}
                        className={cn(
                          "panel flex flex-col gap-2 p-3.5 text-left transition-colors hover:border-primary/50",
                          sel && "border-primary bg-primary/[0.06] ring-1 ring-primary/40",
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-sm font-semibold">{s.title}</span>
                          {best !== undefined ? (
                            <span
                              className={cn(
                                "font-mono text-xs",
                                best >= 80 ? "text-ok" : "text-caution",
                              )}
                            >
                              best {best}%
                            </span>
                          ) : null}
                        </div>
                        <p className="line-clamp-2 text-xs text-muted-foreground">{s.summary}</p>
                        <div className="mt-auto flex flex-wrap gap-1">
                          <Pill tone={s.rules === "IFR" ? "magenta" : "ok"}>{s.rules}</Pill>
                          {s.stations.map((st) => (
                            <Pill key={st}>{st}</Pill>
                          ))}
                          <Pill tone="cyan">
                            {s.firstSpeaker === "pilot" ? "You call first" : "ATC calls first"}
                          </Pill>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>

        <div className="space-y-4 lg:sticky lg:top-4 lg:self-start">
          <Panel title="Session setup">
            <div className="space-y-4">
              <div>
                <div className="label-caps mb-1">Scenario</div>
                <p className="text-sm font-semibold">{scenario?.title}</p>
              </div>
              <div className="grid gap-3">
                <label className="space-y-1">
                  <span className="label-caps">Airport</span>
                  <Select value={airport} onValueChange={setAirport}>
                    <SelectTrigger aria-label="Airport">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {towered.map((a) => (
                        <SelectItem key={a.icao} value={a.icao}>
                          {a.icao} — {a.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </label>
                <label className="space-y-1">
                  <span className="label-caps">Aircraft</span>
                  <Select value={aircraftId} onValueChange={setAircraftId}>
                    <SelectTrigger aria-label="Aircraft">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {aircraftOptions.map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </label>
                <label className="space-y-1">
                  <span className="label-caps">Callsign</span>
                  <Input
                    value={callsign}
                    onChange={(e) =>
                      setCallsign(
                        e.target.value
                          .toUpperCase()
                          .replace(/[^A-Z0-9]/g, "")
                          .slice(0, 7),
                      )
                    }
                    className={cn("font-mono", !callsignValid && "border-warning")}
                    aria-invalid={!callsignValid}
                  />
                  <span className="block text-[11px] text-muted-foreground">
                    FAA N-numbers abbreviate after ATC does (N172TX → N2TX).
                  </span>
                </label>
              </div>

              <div>
                <div className="label-caps mb-1.5">Difficulty</div>
                <div className="grid grid-cols-2 gap-1.5" role="radiogroup" aria-label="Difficulty">
                  {DIFFICULTIES.map((d) => (
                    <button
                      key={d.id}
                      type="button"
                      role="radio"
                      aria-checked={difficulty === d.id}
                      onClick={() => setDifficulty(d.id)}
                      className={cn(
                        "rounded-md border px-2 py-1.5 text-xs font-semibold",
                        difficulty === d.id
                          ? "border-primary bg-primary/15 text-primary"
                          : "border-border text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
                <p className="mt-1.5 text-[11px] text-muted-foreground">
                  {DIFFICULTIES.find((d) => d.id === difficulty)?.description}
                </p>
              </div>

              <div>
                <div className="label-caps mb-1.5">Controller</div>
                <div
                  className="grid grid-cols-2 gap-1.5"
                  role="radiogroup"
                  aria-label="Controller personality"
                >
                  {PERSONALITIES.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      role="radio"
                      aria-checked={personality === p.id}
                      onClick={() => setPersonality(p.id)}
                      className={cn(
                        "rounded-md border px-2 py-1.5 text-xs font-semibold",
                        personality === p.id
                          ? "border-primary bg-primary/15 text-primary"
                          : "border-border text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
                <p className="mt-1.5 text-[11px] text-muted-foreground">
                  {PERSONALITIES.find((p) => p.id === personality)?.description}
                </p>
              </div>

              <div className="space-y-2 rounded-md border p-3">
                <label className="flex items-center justify-between gap-2 text-xs">
                  <span className="flex items-center gap-1.5">
                    <Volume2 className="size-3.5" /> Controller voice
                  </span>
                  <Switch
                    checked={settings.voice.atcSpeech}
                    onCheckedChange={(v) =>
                      actions.updateSettings((s) => ({ ...s, voice: { ...s.voice, atcSpeech: v } }))
                    }
                  />
                </label>
                <label className="flex items-center justify-between gap-2 text-xs">
                  <span className="flex items-center gap-1.5">
                    <Mic className="size-3.5" /> Microphone (push-to-talk)
                  </span>
                  <Switch
                    checked={settings.voice.micInput}
                    onCheckedChange={(v) =>
                      actions.updateSettings((s) => ({ ...s, voice: { ...s.voice, micInput: v } }))
                    }
                  />
                </label>
                <p className="text-[11px] text-muted-foreground">
                  {!hydrated
                    ? "Checking browser speech support…"
                    : `Speech: ${support.tts ? "voice output available" : "no voice output in this browser"} · ${support.stt ? "voice input available" : "voice input not supported — type your calls"}.`}
                </p>
              </div>

              <Button className="w-full" size="lg" onClick={start} disabled={!callsignValid}>
                <Play /> Start scenario
              </Button>
            </div>
          </Panel>

          <Panel title="Recent sessions">
            {hydrated && sessions.filter((s) => s.engine === "scripted").length ? (
              <ul className="space-y-2">
                {sessions
                  .filter((s) => s.engine === "scripted")
                  .slice(0, 5)
                  .map((s) => (
                    <li key={s.id} className="flex items-center justify-between gap-2 text-xs">
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{s.title}</span>
                        <span className="text-muted-foreground">
                          {s.airport} · {s.difficulty} · {formatDateTime(s.date)}
                        </span>
                      </span>
                      <span
                        className={cn(
                          "font-mono font-semibold",
                          s.score >= 80
                            ? "text-ok"
                            : s.score >= 60
                              ? "text-caution"
                              : "text-warning",
                        )}
                      >
                        {Math.round(s.score)}%
                      </span>
                    </li>
                  ))}
              </ul>
            ) : (
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <Plane className="size-3.5" /> Your scored sessions will appear here.
              </p>
            )}
          </Panel>
        </div>
      </div>
    </Page>
  );
}
