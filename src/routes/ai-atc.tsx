import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bot,
  FileText,
  Headphones,
  Lightbulb,
  ListChecks,
  Loader2,
  MessageSquareText,
  Play,
  Radio,
  RefreshCw,
  RotateCcw,
  Settings2,
  Square,
  Volume2,
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
import { AiStatusPill, useAiStatus } from "@/components/ai/AiStatusPill";
import { actions, useHydrated, useStore, type SavedFlightPlan } from "@/lib/store";
import { cn } from "@/lib/utils";
import { atcAircraftOptions, facilityOf, toweredAirports } from "@/lib/atc/context";
import {
  aiStateSnapshot,
  applyAiTurn,
  blockedTurn,
  createFreeState,
  facilityAt,
  freeDirectory,
  freeHint,
  freeReport,
  FREE_GOALS,
  noStationTurn,
  scriptedTurn,
  type AiAtcJson,
  type FreeGoalId,
  type FreeReply,
  type FreeState,
} from "@/lib/atc/freeform";
import { atcController, parseJsonObject } from "@/lib/ai/services";
import type { AiMessage } from "@/lib/ai/client";
import {
  DIFFICULTIES,
  PERSONALITIES,
  type Difficulty,
  type Personality,
  type RadioLine,
  type SessionReport,
} from "@/lib/atc/types";
import { useRadioQueue, type QueueItem } from "@/lib/atc/useRadioQueue";
import { formatFreqShort } from "@/lib/atc/frequency";
import { alt, hdg, PHONETIC } from "@/lib/atc/phrase";

type AiAtcSearch = { plan?: string | undefined };

export const Route = createFileRoute("/ai-atc")({
  validateSearch: (s: Record<string, unknown>): AiAtcSearch => {
    const p = s["plan"];
    return typeof p === "string" && p.length > 0 && p.length < 100 ? { plan: p } : {};
  },
  head: () => ({
    meta: [
      { title: "AI ATC Practice — TeachX" },
      {
        name: "description",
        content:
          "Free-form radio practice with a simulated AI air traffic controller that tracks your position, altitude, runway, frequency and clearance — with a full scripted fallback when no AI is configured.",
      },
      { property: "og:title", content: "AI ATC Practice — TeachX" },
      {
        property: "og:description",
        content:
          "Talk to a simulated controller in your own words and get scored on phraseology and readbacks.",
      },
    ],
  }),
  component: AiAtcPage,
});

const HINTS: Record<Difficulty, number> = {
  beginner: Infinity,
  intermediate: 3,
  advanced: 1,
  checkride: 0,
};

function toQueue(replies: FreeReply[]): QueueItem[] {
  return replies.map((r): QueueItem =>
    r.kind === "atc" && r.facility
      ? {
          kind: "atc",
          station: r.facility.name,
          text: r.phrase.text,
          spoken: r.phrase.spoken,
          delayMs: r.delayMs,
          mhz: r.facility.mhz,
        }
      : { kind: "system", text: r.phrase.text, ...(r.tone ? { tone: r.tone } : {}) },
  );
}

function AiAtcPage() {
  const search = Route.useSearch();
  const hydrated = useHydrated();
  const profile = useStore((s) => s.profile);
  const settings = useStore((s) => s.settings);
  const plans = useStore((s) => s.flightPlans);
  const sessions = useStore((s) => s.atcSessions);
  const { status, loading, refresh, aiAvailable } = useAiStatus();

  const towered = useMemo(() => toweredAirports(), []);
  const aircraftOptions = useMemo(() => atcAircraftOptions(), []);

  const [planId, setPlanId] = useState<string>("none");
  const [airport, setAirport] = useState("KPAO");
  const [aircraftId, setAircraftId] = useState("c172");
  const [callsign, setCallsign] = useState("N172TX");
  const [rules, setRules] = useState<"VFR" | "IFR">("VFR");
  const [goalId, setGoalId] = useState<FreeGoalId>("vfr-departure-ff");
  const [customGoal, setCustomGoal] = useState("");
  const [difficulty, setDifficulty] = useState<Difficulty>("beginner");
  const [personality, setPersonality] = useState<Personality>("professional");
  const defaultsApplied = useRef(false);

  const plan: SavedFlightPlan | null = useMemo(
    () => plans.find((p) => p.id === planId) ?? null,
    [plans, planId],
  );

  const applyPlan = useCallback(
    (p: SavedFlightPlan | null) => {
      if (!p) return;
      setRules(p.rules);
      setGoalId(p.rules === "IFR" ? "ifr-departure" : "vfr-departure-ff");
      if (towered.some((a) => a.icao === p.departure.toUpperCase()))
        setAirport(p.departure.toUpperCase());
      if (aircraftOptions.some((a) => a.id === p.aircraftId)) setAircraftId(p.aircraftId);
    },
    [towered, aircraftOptions],
  );

  useEffect(() => {
    if (!hydrated || defaultsApplied.current) return;
    defaultsApplied.current = true;
    if (profile?.callsign) setCallsign(profile.callsign.toUpperCase());
    if (profile?.homeAirport && towered.some((a) => a.icao === profile.homeAirport.toUpperCase()))
      setAirport(profile.homeAirport.toUpperCase());
    if (aircraftOptions.some((a) => a.id === settings.preferredAircraft))
      setAircraftId(settings.preferredAircraft);
    setDifficulty(settings.training.difficulty);
    if (search.plan) {
      const p = plans.find((x) => x.id === search.plan);
      if (p) {
        setPlanId(p.id);
        applyPlan(p);
      } else toast.error("That flight plan wasn't found on this device.");
    }
  }, [
    hydrated,
    profile,
    settings.preferredAircraft,
    settings.training.difficulty,
    search.plan,
    plans,
    towered,
    aircraftOptions,
    applyPlan,
  ]);

  const [phase, setPhase] = useState<"setup" | "live" | "report">("setup");
  const [state, setState] = useState<FreeState | null>(null);
  const stateRef = useRef<FreeState | null>(null);
  const historyRef = useRef<AiMessage[]>([]);
  const aiTurns = useRef(0);
  const [lastEngine, setLastEngine] = useState<"ai" | "scripted" | null>(null);
  const [thinking, setThinking] = useState(false);
  const [aiHint, setAiHint] = useState("");
  const [hintsUsed, setHintsUsed] = useState(0);
  const [hintOpen, setHintOpen] = useState(false);
  const [radio, setRadio] = useState<RadioState>(() => makeRadioState(121.5, 118.0));
  const [report, setReport] = useState<SessionReport | null>(null);
  const [reportLines, setReportLines] = useState<RadioLine[]>([]);
  const [useAi, setUseAi] = useState(false);
  const busyAtPtt = useRef(false);
  const saved = useRef(false);

  const queue = useRadioQueue({
    speech: settings.voice.atcSpeech,
    rate: Math.max(
      0.6,
      Math.min(
        1.8,
        settings.voice.rate *
          (difficulty === "beginner" ? 0.9 : difficulty === "intermediate" ? 1 : 1.08) *
          (personality === "busy" ? 1.15 : personality === "instructor" ? 0.95 : 1),
      ),
    ),
    volume: Math.max(0, Math.min(1, radio.volume * settings.voice.volume)),
    voiceName: settings.voice.voiceName,
  });

  const callsignValid = /^[A-Z0-9]{2,7}$/.test(callsign);

  const commit = (s: FreeState) => {
    stateRef.current = s;
    setState(s);
  };

  const start = () => {
    if (!callsignValid) {
      toast.error("Enter a valid callsign (e.g. N172TX)");
      return;
    }
    if (goalId === "custom" && !customGoal.trim()) {
      toast.error("Describe your scenario goal, or pick a preset.");
      return;
    }
    queue.reset();
    saved.current = false;
    aiTurns.current = 0;
    historyRef.current = [];
    const { state: s, replies } = createFreeState({
      airportIcao: airport,
      aircraftId,
      callsign,
      rules,
      goalId,
      customGoal,
      difficulty,
      personality,
      plan,
    });
    commit(s);
    const startFac = facilityOf(s.ctx, s.currentStation);
    setRadio((prev) =>
      makeRadioState(
        s.ctx.atisFreq ?? startFac.mhz,
        difficulty === "beginner" ? startFac.mhz : 118.0,
        { volume: prev.volume, spacing: prev.spacing },
      ),
    );
    setUseAi(aiAvailable);
    setLastEngine(aiAvailable ? "ai" : "scripted");
    setAiHint("");
    setHintsUsed(0);
    setHintOpen(false);
    setReport(null);
    setPhase("live");
    queue.push(toQueue(replies));
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const finish = () => {
    const s = stateRef.current;
    if (!s) return;
    queue.halt();
    const r = freeReport(s);
    const lines = queue.getLines();
    setReport(r);
    setReportLines(lines);
    setPhase("report");
    if (!saved.current && s.evals.length) {
      saved.current = true;
      actions.recordAtc({
        scenarioId: `ai-${s.goalId}`,
        title: `AI ATC: ${s.goal}`.slice(0, 120),
        airport: s.ctx.airport.icao,
        difficulty: s.difficulty,
        engine: aiTurns.current > 0 ? "ai" : "scripted",
        score: r.score,
        breakdown: r.breakdown,
        feedback: r.feedback,
        transcript: lines.map((l) => ({
          from: l.from === "traffic" ? "atc" : l.from,
          ...(l.station ? { station: l.station } : {}),
          text: l.text,
          t: l.t,
        })),
      });
      toast.success("Session saved to your training record", {
        description: `${r.score}% — ${r.grade}`,
      });
    }
  };

  const onPttStart = useCallback(() => {
    busyAtPtt.current = queue.isBusy();
  }, [queue]);

  const onTransmit = useCallback(
    async (text: string, meta: TransmitMeta) => {
      const s = stateRef.current;
      if (!s || thinking) return;
      queue.addPilot(text, undefined, meta.mhz);
      const f = facilityAt(s, meta.mhz);
      if (!f) {
        const r = noStationTurn(s, text, meta.mhz);
        commit(r.state);
        queue.push(toQueue(r.replies));
        return;
      }
      if (busyAtPtt.current) {
        busyAtPtt.current = false;
        const r = blockedTurn(s, text, f);
        commit(r.state);
        queue.push(toQueue(r.replies));
        return;
      }
      setHintOpen(false);
      if (useAi) {
        setThinking(true);
        const userMsg: AiMessage = {
          role: "user",
          content: `[Pilot on ${f.name} ${formatFreqShort(f.mhz)}] ${text}`,
        };
        const res = await atcController({
          state: aiStateSnapshot(s),
          difficulty: s.difficulty,
          personality: s.personality,
          goal: s.goal,
          history: [...historyRef.current, userMsg],
        });
        setThinking(false);
        const cur = stateRef.current ?? s;
        if (res.ok) {
          const json = parseJsonObject<AiAtcJson>(res.text);
          const applied = json
            ? applyAiTurn(cur, json, text, f)
            : ({ ok: false, reason: "not JSON" } as const);
          if (applied.ok) {
            aiTurns.current += 1;
            const reply = applied.replies.find((r) => r.kind === "atc");
            historyRef.current = [
              ...historyRef.current,
              userMsg,
              {
                role: "assistant" as const,
                content: JSON.stringify({
                  station: reply?.facility?.name ?? f.name,
                  transmission: reply?.phrase.text ?? "",
                }),
              },
            ].slice(-24);
            commit(applied.state);
            setAiHint(applied.hint);
            setLastEngine("ai");
            const extra: FreeReply[] = [];
            if (s.difficulty === "beginner" && applied.issues.length)
              extra.push({
                kind: "system",
                phrase: {
                  text: `Tips:\n${applied.issues.map((i) => `• ${i}`).join("\n")}`,
                  spoken: "",
                },
                delayMs: 0,
                tone: "caution",
              });
            if (!reply)
              extra.push({
                kind: "system",
                phrase: { text: "No response.", spoken: "" },
                delayMs: 600,
                tone: "info",
              });
            queue.push(toQueue([...applied.replies, ...extra]));
            return;
          }
          if (s.difficulty !== "checkride")
            queue.addSystem(
              "AI reply didn't pass the scenario guardrails — the scripted controller answered this turn.",
              "info",
            );
        } else if (s.difficulty !== "checkride") {
          queue.addSystem(`${res.reason} The scripted controller answered this turn.`, "info");
        }
      }
      const r = scriptedTurn(stateRef.current ?? s, text, f);
      const reply = r.replies.find((x) => x.kind === "atc");
      historyRef.current = [
        ...historyRef.current,
        {
          role: "user" as const,
          content: `[Pilot on ${f.name} ${formatFreqShort(f.mhz)}] ${text}`,
        },
        ...(reply
          ? [
              {
                role: "assistant" as const,
                content: JSON.stringify({
                  station: reply.facility?.name ?? f.name,
                  transmission: reply.phrase.text,
                }),
              },
            ]
          : []),
      ].slice(-24);
      commit(r.state);
      setAiHint("");
      setLastEngine("scripted");
      queue.push(toQueue(r.replies));
    },
    [queue, thinking, useAi],
  );

  const atisFreq = state?.ctx.atisFreq ?? null;
  const tunedAtis = phase === "live" && atisFreq !== null && isListening(radio, atisFreq);
  const playAtis = () => {
    const s = stateRef.current;
    if (s)
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

  // ---------------- report ----------------
  if (phase === "report" && report && state) {
    return (
      <Page>
        <PageHeader
          eyebrow="Radio · AI ATC Practice"
          title="Session report"
          icon={MessageSquareText}
        />
        <AtcReport
          report={report}
          title={state.goal}
          subtitle={
            <>
              {state.ctx.airport.icao} · {state.ctx.aircraft.shortName} {state.ctx.cs.full} ·{" "}
              {state.rules} · {DIFFICULTIES.find((d) => d.id === state.difficulty)?.label} ·{" "}
              {aiTurns.current > 0
                ? `AI controller (${aiTurns.current} AI turn${aiTurns.current > 1 ? "s" : ""})`
                : "Scripted controller"}
            </>
          }
          lines={reportLines}
          pilotLabel={state.ctx.cs.full}
          actions={
            <>
              <Button onClick={start}>
                <RotateCcw /> Practise again
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  queue.reset();
                  setPhase("setup");
                }}
              >
                <Settings2 /> New setup
              </Button>
              <Button variant="ghost" asChild>
                <Link to="/atc">
                  <Radio /> Scripted scenarios
                </Link>
              </Button>
            </>
          }
        />
      </Page>
    );
  }

  // ---------------- live ----------------
  if (phase === "live" && state) {
    const ctx = state.ctx;
    const cur = facilityOf(ctx, state.currentStation);
    const hintsLeft = HINTS[state.difficulty] - hintsUsed;
    const lastEval = state.evals[state.evals.length - 1];
    const hintAllowed =
      state.difficulty === "beginner" ||
      (state.difficulty === "intermediate" && hintsLeft > 0) ||
      (state.difficulty === "advanced" && hintsLeft > 0 && !!lastEval && lastEval.score < 85);
    const hintText = aiHint || freeHint(state);
    const showHint = state.difficulty === "beginner" || hintOpen;

    return (
      <Page wide>
        <div className="mb-4 flex flex-col gap-3 border-b pb-4 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            <p className="label-caps mb-1 text-primary">AI ATC Practice</p>
            <h1 className="flex flex-wrap items-center gap-2 text-xl font-bold tracking-tight sm:text-2xl">
              <span className="min-w-0 break-words">{state.goal}</span>
            </h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <Pill tone="caution">Simulated</Pill>
              <AiStatusPill
                status={status}
                loading={false}
                using={useAi ? lastEngine : "scripted"}
              />
              <Pill tone="primary">
                {DIFFICULTIES.find((d) => d.id === state.difficulty)?.label}
              </Pill>
              <Pill>{PERSONALITIES.find((p) => p.id === state.personality)?.label}</Pill>
              <Pill tone={state.rules === "IFR" ? "magenta" : "ok"}>{state.rules}</Pill>
              {state.goalReached ? <Pill tone="ok">Goal reached</Pill> : null}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={start}>
              <RotateCcw /> Restart
            </Button>
            <Button size="sm" onClick={finish} disabled={!state.evals.length}>
              <Square /> End &amp; score
            </Button>
          </div>
        </div>
        <Notice
          tone="caution"
          title="Simulated ATC for training — not real air traffic control."
          className="mb-4"
        >
          {useAi
            ? "An AI plays the controller inside strict scenario guardrails; replies that break them are replaced by the scripted controller."
            : "No AI provider is active, so the built-in scripted controller is answering — every feature still works."}
        </Notice>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
          <div className="min-w-0 space-y-4">
            <RadioPanel
              value={radio}
              onChange={setRadio}
              directory={freeDirectory(state)}
              expected={state.difficulty === "checkride" ? null : { name: cur.name, mhz: cur.mhz }}
              receiving={queue.receiving}
              onPttStart={onPttStart}
              onTransmit={(t, m) => void onTransmit(t, m)}
              micEnabled={settings.voice.micInput}
              disabled={thinking}
              {...(thinking ? { composerPlaceholder: "Controller is responding…" } : {})}
            />
            <div className="relative">
              <AtcTranscript
                lines={queue.lines}
                receiving={queue.receiving}
                pilotLabel={ctx.cs.full}
                className="h-[320px] lg:h-[400px]"
              />
              {thinking ? (
                <div className="absolute right-3 bottom-3 flex items-center gap-1.5 rounded-full border bg-card px-2.5 py-1 text-[11px] text-muted-foreground">
                  <Loader2 className="size-3 animate-spin" /> Controller is responding…
                </div>
              ) : null}
            </div>
          </div>

          <div className="min-w-0 space-y-4">
            <Panel title="Scenario state">
              <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                {[
                  [
                    "Station",
                    state.difficulty === "checkride"
                      ? "—"
                      : `${cur.name} ${formatFreqShort(cur.mhz)}`,
                  ],
                  ["Phase", state.phase.replace("-", " ")],
                  ["Position", ctx.position],
                  ["Altitude", `${alt(ctx.altitude).text} ft`],
                  ["Heading", hdg(ctx.heading).text],
                  ["Runway", `${ctx.runway.id} (${ctx.runway.pattern} traffic)`],
                  [
                    "Squawk",
                    state.emergency
                      ? "7700"
                      : state.ffActive || state.clearance
                        ? ctx.squawk
                        : "1200",
                  ],
                  ["ATIS", `${PHONETIC[ctx.atis.letter]} · ${ctx.atis.altimeter.toFixed(2)}`],
                ].map(([k, v]) => (
                  <div key={k} className="min-w-0">
                    <dt className="label-caps !text-[9px]">{k}</dt>
                    <dd className="truncate font-medium" title={v}>
                      {v}
                    </dd>
                  </div>
                ))}
              </dl>
            </Panel>

            {tunedAtis ? (
              <div className="avionics-screen p-3">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-[11px] font-semibold text-cyan">
                    <Headphones className="size-3.5" /> Receiving ATIS{" "}
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

            {state.clearance || state.flightPlan ? (
              <Panel title={state.clearance ? "Active clearance (CRAFT)" : "Flight plan"}>
                {state.clearance ? (
                  <dl className="space-y-1 font-mono text-xs">
                    <div>
                      <span className="text-muted-foreground">C </span>
                      {state.clearance.limit}
                    </div>
                    <div>
                      <span className="text-muted-foreground">R </span>
                      {state.clearance.route}
                    </div>
                    <div>
                      <span className="text-muted-foreground">A </span>
                      {alt(state.clearance.altitude).text}, expect{" "}
                      {alt(state.clearance.expectAltitude).text} {state.clearance.expectMinutes} min
                      after departure
                    </div>
                    <div>
                      <span className="text-muted-foreground">F </span>
                      {formatFreqShort(state.clearance.departureMhz)}
                    </div>
                    <div>
                      <span className="text-muted-foreground">T </span>
                      {state.clearance.squawk}
                    </div>
                  </dl>
                ) : null}
                {state.flightPlan ? (
                  <p
                    className={cn(
                      "text-xs text-muted-foreground",
                      state.clearance && "mt-3 border-t pt-2",
                    )}
                  >
                    Filed: {state.flightPlan.rules} {state.flightPlan.departure} →{" "}
                    {state.flightPlan.destination} via{" "}
                    {state.flightPlan.route.join(" ") || "direct"} at{" "}
                    {alt(state.flightPlan.cruiseAltFt).text} ft
                  </p>
                ) : null}
              </Panel>
            ) : null}

            <Panel title="Hints">
              {state.difficulty === "checkride" ? (
                <p className="text-sm text-muted-foreground">
                  Checkride mode: no hints until your final report.
                </p>
              ) : showHint ? (
                <p className="text-sm">
                  <Lightbulb className="mr-1.5 inline size-4 text-caution" />
                  {hintText}
                </p>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">
                    {state.difficulty === "advanced"
                      ? "Advanced: one hint, available after a weak transmission."
                      : `Hints remaining: ${Math.max(0, hintsLeft)}.`}
                  </p>
                  <Button
                    size="sm"
                    disabled={!hintAllowed}
                    onClick={() => {
                      setHintsUsed((n) => n + 1);
                      setHintOpen(true);
                    }}
                  >
                    <Lightbulb /> Show hint
                  </Button>
                </div>
              )}
            </Panel>

            {state.evals.length ? (
              <Panel title="Communication history">
                <ul className="max-h-56 space-y-1.5 overflow-y-auto">
                  {state.evals.map((e) => (
                    <li key={e.id} className="flex gap-2 text-[11px]">
                      <span
                        className={cn(
                          "w-7 shrink-0 font-mono",
                          state.difficulty === "checkride"
                            ? "text-muted-foreground"
                            : e.score >= 85
                              ? "text-ok"
                              : e.score >= 65
                                ? "text-caution"
                                : "text-warning",
                        )}
                      >
                        {state.difficulty === "checkride" ? "—" : e.score}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate font-mono">“{e.text}”</span>
                        {state.difficulty !== "checkride" && e.items.some((i) => !i.ok) ? (
                          <span className="block truncate text-muted-foreground">
                            {e.items.find((i) => !i.ok)?.message}
                          </span>
                        ) : null}
                      </span>
                    </li>
                  ))}
                </ul>
              </Panel>
            ) : null}
          </div>
        </div>
      </Page>
    );
  }

  // ---------------- setup ----------------
  const goalDef = FREE_GOALS.find((g) => g.id === goalId);
  const aiSessions = sessions.filter((s) => s.scenarioId.startsWith("ai-")).slice(0, 5);
  return (
    <Page>
      <PageHeader
        eyebrow="Radio"
        title="AI ATC Practice"
        icon={MessageSquareText}
        description="Talk to a simulated controller in your own words. It keeps track of your position, altitude, heading, runway, frequency, clearance and flight plan — and scores every call."
        actions={
          <Button variant="outline" asChild>
            <Link to="/atc">
              <Radio /> Scripted scenarios
            </Link>
          </Button>
        }
      />
      <Notice
        tone="caution"
        title="Simulated ATC for training — not real air traffic control."
        className="mb-6"
      >
        The AI controller is constrained to the selected airport's runways and frequencies. Never
        use it for real-world operations.
      </Notice>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-5">
          <Panel
            title="Controller engine"
            actions={
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => void refresh()}
              >
                <RefreshCw /> Re-check
              </Button>
            }
          >
            <div className="flex flex-wrap items-center gap-3">
              <AiStatusPill status={status} loading={loading} />
              <p className="min-w-0 flex-1 text-xs text-muted-foreground">
                {loading
                  ? "Checking which AI providers are available…"
                  : aiAvailable
                    ? "An AI controller will answer your calls. If a reply fails validation, the scripted controller steps in for that turn."
                    : "No AI provider is active — the built-in scripted controller with intent matching will run the whole session. You can configure AI in Settings."}
              </p>
              <Button variant="outline" size="sm" asChild>
                <Link to="/settings">
                  <Settings2 /> AI settings
                </Link>
              </Button>
            </div>
          </Panel>

          <Panel title="Flight plan (optional)">
            {hydrated && plans.length ? (
              <div className="space-y-2">
                <Select
                  value={planId}
                  onValueChange={(v) => {
                    setPlanId(v);
                    applyPlan(plans.find((p) => p.id === v) ?? null);
                  }}
                >
                  <SelectTrigger aria-label="Saved flight plan">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No flight plan</SelectItem>
                    {plans.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.rules} {p.departure} → {p.destination} ·{" "}
                        {p.name || formatDateTime(p.date)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {plan ? (
                  <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                    <FileText className="mt-0.5 size-3.5 shrink-0" /> {plan.rules} {plan.departure}{" "}
                    → {plan.destination} via {plan.route.join(" ") || "direct"},{" "}
                    {alt(plan.cruiseAltFt).text} ft.{" "}
                    {plan.rules === "IFR"
                      ? "Request your simulated IFR clearance from Clearance Delivery/Ground."
                      : "Request flight following after departure."}
                    {!towered.some((a) => a.icao === plan.departure.toUpperCase())
                      ? " (Departure airport isn't towered in the dataset — choose a towered airport below.)"
                      : ""}
                  </p>
                ) : null}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                No saved plans yet. Create one in the{" "}
                <Link to="/planner" className="text-primary underline">
                  Flight Planner
                </Link>{" "}
                to practise requesting a simulated IFR clearance for your own route.
              </p>
            )}
          </Panel>

          <Panel title="Scenario goal">
            <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Scenario goal">
              {FREE_GOALS.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  role="radio"
                  aria-checked={goalId === g.id}
                  onClick={() => {
                    setGoalId(g.id);
                    if (g.rules !== "any") setRules(g.rules);
                  }}
                  className={cn(
                    "rounded-md border px-3 py-2.5 text-left text-sm",
                    goalId === g.id
                      ? "border-primary bg-primary/10"
                      : "border-border hover:border-primary/40",
                  )}
                >
                  <span className="font-semibold">{g.label}</span>
                  {g.rules !== "any" ? (
                    <Pill tone={g.rules === "IFR" ? "magenta" : "ok"} className="ml-2">
                      {g.rules}
                    </Pill>
                  ) : null}
                </button>
              ))}
            </div>
            {goalId === "custom" ? (
              <Textarea
                value={customGoal}
                onChange={(e) => setCustomGoal(e.target.value.slice(0, 200))}
                placeholder='e.g. "VFR departure with flight following to KMRY, then a frequency change to get weather"'
                className="mt-3 min-h-20 text-sm"
              />
            ) : goalDef ? (
              <p className="mt-3 text-xs text-muted-foreground">
                You'll practise: {goalDef.describe("your destination")}.
              </p>
            ) : null}
          </Panel>

          {aiSessions.length ? (
            <Panel title="Recent AI ATC sessions">
              <ul className="space-y-2">
                {aiSessions.map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-2 text-xs">
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{s.title}</span>
                      <span className="text-muted-foreground">
                        {s.airport} · {s.engine === "ai" ? "AI" : "scripted"} ·{" "}
                        {formatDateTime(s.date)}
                      </span>
                    </span>
                    <span
                      className={cn(
                        "font-mono font-semibold",
                        s.score >= 80 ? "text-ok" : s.score >= 60 ? "text-caution" : "text-warning",
                      )}
                    >
                      {Math.round(s.score)}%
                    </span>
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}
        </div>

        <div className="space-y-4 lg:sticky lg:top-4 lg:self-start">
          <Panel title="Aircraft & mode">
            <div className="space-y-3">
              <label className="block space-y-1">
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
              <label className="block space-y-1">
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
              <label className="block space-y-1">
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
              </label>
              <div>
                <span className="label-caps">Flight rules</span>
                <div
                  className="mt-1 grid grid-cols-2 gap-1.5"
                  role="radiogroup"
                  aria-label="Flight rules"
                >
                  {(["VFR", "IFR"] as const).map((r) => (
                    <button
                      key={r}
                      type="button"
                      role="radio"
                      aria-checked={rules === r}
                      onClick={() => setRules(r)}
                      className={cn(
                        "rounded-md border px-2 py-1.5 text-xs font-semibold",
                        rules === r
                          ? "border-primary bg-primary/15 text-primary"
                          : "border-border text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <span className="label-caps">Mode</span>
                <div className="mt-1 grid grid-cols-2 gap-1.5" role="radiogroup" aria-label="Mode">
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
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {DIFFICULTIES.find((d) => d.id === difficulty)?.description}
                </p>
              </div>
              <div>
                <span className="label-caps">Controller</span>
                <div
                  className="mt-1 grid grid-cols-2 gap-1.5"
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
              </div>
              <Button
                className="w-full"
                size="lg"
                onClick={start}
                disabled={!callsignValid || loading}
              >
                {loading ? <Loader2 className="animate-spin" /> : aiAvailable ? <Bot /> : <Play />}{" "}
                Start practice
              </Button>
              <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <ListChecks className="size-3.5" /> Scored on phraseology, readbacks, callsign use,
                frequency management and timing.
              </p>
            </div>
          </Panel>
        </div>
      </div>
    </Page>
  );
}
