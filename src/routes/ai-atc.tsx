import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bot,
  FileText,
  Headphones,
  Lightbulb,
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
import { Page, PageHeader, Notice, Pill, formatDateTime } from "@/components/app/page";
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
import { AIRPORTS } from "@/lib/data/airports";
import { atcAircraftOptions, facilityOf } from "@/lib/atc/context";
import {
  advanceFreeFlight,
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
      { title: "AI ATC Practice — SkyReady" },
      {
        name: "description",
        content:
          "Free-form radio practice with a simulated AI air traffic controller that tracks your position, altitude, runway, frequency and clearance — with a full scripted fallback when no AI is configured.",
      },
      { property: "og:title", content: "AI ATC Practice — SkyReady" },
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

  const allAirports = AIRPORTS;
  const aircraftOptions = useMemo(() => atcAircraftOptions(), []);

  const [planId, setPlanId] = useState<string>("none");
  const [airport, setAirport] = useState("KPAO");
  const [destination, setDestination] = useState("auto");
  const [aircraftId, setAircraftId] = useState("c172");
  const [callsign, setCallsign] = useState("N172TX");
  const [rules, setRules] = useState<"VFR" | "IFR">("VFR");
  const [goalId, setGoalId] = useState<FreeGoalId>("vfr-full-flight");
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
      setGoalId(p.rules === "IFR" ? "ifr-full-flight" : "vfr-full-flight");
      if (allAirports.some((a) => a.icao === p.departure.toUpperCase()))
        setAirport(p.departure.toUpperCase());
      if (allAirports.some((a) => a.icao === p.destination.toUpperCase()))
        setDestination(p.destination.toUpperCase());
      if (aircraftOptions.some((a) => a.id === p.aircraftId)) setAircraftId(p.aircraftId);
    },
    [allAirports, aircraftOptions],
  );

  useEffect(() => {
    if (!hydrated || defaultsApplied.current) return;
    defaultsApplied.current = true;
    if (profile?.callsign) setCallsign(profile.callsign.toUpperCase());
    if (
      profile?.homeAirport &&
      allAirports.some((a) => a.icao === profile.homeAirport.toUpperCase())
    )
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
    allAirports,
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
      ...(destination !== "auto" && destination !== airport
        ? { destinationIcao: destination }
        : {}),
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

  const advanceLeg = () => {
    const cur = stateRef.current;
    if (!cur) return;
    const { state: next, replies } = advanceFreeFlight(cur);
    commit(next);
    setAiHint("");
    if (replies.length) queue.push(toQueue(replies));
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

  const tunedAtisLeg =
    phase === "live" && state
      ? ([
          state.ctx,
          ...(state.dest && state.dest.airport.icao !== state.ctx.airport.icao ? [state.dest] : []),
          ...(state.dep.airport.icao !== state.ctx.airport.icao ? [state.dep] : []),
        ].find((l) => l.atisFreq !== null && isListening(radio, l.atisFreq)) ?? null)
      : null;
  const playAtis = () => {
    if (tunedAtisLeg)
      queue.push([
        {
          kind: "traffic",
          station: `${tunedAtisLeg.airportName} ${tunedAtisLeg.airport.towered ? "ATIS" : "AWOS"}`,
          text: tunedAtisLeg.atis.phrase.text,
          spoken: tunedAtisLeg.atis.phrase.spoken,
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
              {state.dep.airport.icao}
              {state.dest ? ` → ${state.dest.airport.icao}` : ""} · {state.ctx.aircraft.shortName}{" "}
              {state.ctx.cs.full} · {state.rules} ·{" "}
              {DIFFICULTIES.find((d) => d.id === state.difficulty)?.label} ·{" "}
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
    const canAdvanceToDest =
      !!state.dest &&
      state.leg !== "destination" &&
      (state.phase === "airborne" || state.phase === "enroute");
    const hintsLeft = HINTS[state.difficulty] - hintsUsed;
    const lastEval = state.evals[state.evals.length - 1];
    const hintAllowed =
      state.difficulty === "beginner" ||
      (state.difficulty === "intermediate" && hintsLeft > 0) ||
      (state.difficulty === "advanced" && hintsLeft > 0 && !!lastEval && lastEval.score < 85);
    const hintText = aiHint || freeHint(state);
    const showHint = state.difficulty === "beginner" || hintOpen;

    const taskBlock = (
      <div className="border-l-2 border-primary/60 pl-3">
        <div className="label-caps">
          {state.difficulty === "checkride"
            ? "Checkride mode"
            : `Now: ${cur.name} ${formatFreqShort(cur.mhz)}`}
        </div>
        {state.difficulty === "checkride" ? (
          <p className="mt-0.5 text-xs text-muted-foreground">No hints until your final report.</p>
        ) : showHint ? (
          <p className="mt-0.5 text-sm">
            <Lightbulb className="mr-1.5 inline size-3.5 text-caution" />
            {hintText}
          </p>
        ) : (
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              disabled={!hintAllowed}
              onClick={() => {
                setHintsUsed((n) => n + 1);
                setHintOpen(true);
              }}
            >
              <Lightbulb /> Show hint
            </Button>
            <span className="text-[11px] text-muted-foreground">
              {state.difficulty === "advanced"
                ? "One hint, after a weak call."
                : `${Math.max(0, hintsLeft)} left`}
            </span>
          </div>
        )}
      </div>
    );

    return (
      <Page wide>
        <div className="mb-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            <p className="label-caps mb-1 text-primary">AI ATC Practice</p>
            <h1 className="text-xl font-bold tracking-tight sm:text-2xl">
              <span className="min-w-0 break-words">{state.goal}</span>
            </h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs text-muted-foreground">
              <AiStatusPill
                status={status}
                loading={false}
                using={useAi ? lastEngine : "scripted"}
              />
              {state.dest ? (
                <Pill tone="primary">
                  Leg: {state.leg} ({state.dep.airport.icao} → {state.dest.airport.icao})
                </Pill>
              ) : null}
              {state.goalReached ? <Pill tone="ok">Goal reached</Pill> : null}
              <span>
                {ctx.airport.icao}
                {!ctx.airport.towered ? " (CTAF)" : ""} · {ctx.aircraft.shortName}{" "}
                <span className="font-mono">{ctx.cs.full}</span> · {state.rules} ·{" "}
                {DIFFICULTIES.find((d) => d.id === state.difficulty)?.label} ·{" "}
                {PERSONALITIES.find((p) => p.id === state.personality)?.label}
              </span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {canAdvanceToDest ? (
              <Button variant="secondary" size="sm" onClick={advanceLeg}>
                <Play /> Approach {state.dest?.airport.icao}
              </Button>
            ) : null}
            <Button variant="ghost" size="sm" onClick={start}>
              <RotateCcw /> Restart
            </Button>
            <Button size="sm" onClick={finish} disabled={!state.evals.length}>
              <Square /> End &amp; score
            </Button>
          </div>
        </div>
        <Notice tone="caution" title="Simulated ATC — not real ATC." className="mb-3">
          Training only.{" "}
          {useAi
            ? "An AI plays the controller inside strict scenario guardrails; replies that break them are replaced by the scripted controller."
            : "No AI provider is active, so the built-in scripted controller is answering — every feature still works."}
        </Notice>

        <div className="mb-3 lg:hidden">{taskBlock}</div>
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

          <div className="min-w-0 space-y-5">
            <div className="hidden lg:block">{taskBlock}</div>

            <dl className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
              {[
                ["Airport", ctx.airport.icao],
                ["Phase", state.phase.replace("-", " ")],
                ["Rwy", `${ctx.runway.id} (${ctx.runway.pattern})`],
                [
                  "Sqk",
                  state.emergency
                    ? "7700"
                    : state.ffActive || state.clearance
                      ? ctx.squawk
                      : "1200",
                ],
                ["ATIS", `${PHONETIC[ctx.atis.letter]} · ${ctx.atis.altimeter.toFixed(2)}`],
                ["Alt", `${alt(ctx.altitude).text} ft`],
                ["Hdg", hdg(ctx.heading).text],
                ["Pos", ctx.position],
              ].map(([k, v]) => (
                <div key={k} className="flex min-w-0 items-baseline gap-1">
                  <dt className="text-[10px] text-muted-foreground uppercase">{k}</dt>
                  <dd className="max-w-[12rem] truncate font-mono font-semibold" title={v}>
                    {v}
                  </dd>
                </div>
              ))}
            </dl>

            {tunedAtisLeg ? (
              <div className="avionics-screen p-3">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-[11px] font-semibold text-cyan">
                    <Headphones className="size-3.5" /> Receiving {tunedAtisLeg.airport.icao}{" "}
                    {tunedAtisLeg.airport.towered ? "ATIS" : "AWOS"}{" "}
                    {tunedAtisLeg.atisFreq ? formatFreqShort(tunedAtisLeg.atisFreq) : ""}
                  </span>
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={playAtis}>
                    <Volume2 /> Listen
                  </Button>
                </div>
                <p className="font-mono text-xs leading-relaxed text-cyan/90">
                  {tunedAtisLeg.atis.phrase.text}
                </p>
              </div>
            ) : null}

            {state.clearance || state.flightPlan ? (
              <div>
                <div className="label-caps mb-1.5">
                  {state.clearance ? "Active clearance (CRAFT)" : "Flight plan"}
                </div>
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
                  <p className={cn("text-xs text-muted-foreground", state.clearance && "mt-2")}>
                    Filed: {state.flightPlan.rules} {state.flightPlan.departure} →{" "}
                    {state.flightPlan.destination} via{" "}
                    {state.flightPlan.route.join(" ") || "direct"} at{" "}
                    {alt(state.flightPlan.cruiseAltFt).text} ft
                  </p>
                ) : null}
              </div>
            ) : null}

            {state.evals.length ? (
              <details className="text-xs">
                <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                  Communication history ({state.evals.length})
                </summary>
                <ul className="mt-2 max-h-56 space-y-1.5 overflow-y-auto">
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
              </details>
            ) : null}
          </div>
        </div>
      </Page>
    );
  }

  // ---------------- setup ----------------
  const goalDef = FREE_GOALS.find((g) => g.id === goalId);
  const aiSessions = sessions.filter((s) => s.scenarioId.startsWith("ai-")).slice(0, 5);
  const optionBtn = (on: boolean) =>
    cn(
      "rounded-md border px-2 py-1.5 text-xs font-semibold",
      on
        ? "border-primary bg-primary/15 text-primary"
        : "border-border text-muted-foreground hover:text-foreground",
    );
  return (
    <Page>
      <PageHeader
        eyebrow="Radio"
        title="AI ATC Practice"
        icon={MessageSquareText}
        description="Talk to a simulated controller in your own words — every call is scored."
        actions={
          <Button variant="outline" asChild>
            <Link to="/atc">
              <Radio /> Scripted scenarios
            </Link>
          </Button>
        }
      />
      <div className="-mt-2 mb-5 flex flex-wrap items-center gap-x-4 gap-y-2">
        <Notice tone="caution" title="Simulated ATC — not real ATC.">
          Training only. The AI controller is constrained to the selected airport's runways and
          frequencies. Never use it for real-world operations.
        </Notice>
        <span
          className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"
          title={
            loading
              ? "Checking which AI providers are available…"
              : aiAvailable
                ? "An AI controller will answer your calls. If a reply fails validation, the scripted controller steps in for that turn."
                : "No AI provider is active — the built-in scripted controller with intent matching runs the whole session."
          }
        >
          <span>Controller:</span>
          <AiStatusPill status={status} loading={loading} />
          <button
            type="button"
            onClick={() => void refresh()}
            className="rounded p-1 hover:bg-muted hover:text-foreground"
            aria-label="Re-check AI availability"
            title="Re-check AI availability"
          >
            <RefreshCw className="size-3.5" />
          </button>
          <Link to="/settings" className="inline-flex items-center gap-1 hover:text-foreground">
            <Settings2 className="size-3.5" /> AI settings
          </Link>
        </span>
      </div>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-8">
          <section>
            <h2 className="label-caps mb-2">Scenario goal</h2>
            <div
              className="grid gap-1.5 sm:grid-cols-2"
              role="radiogroup"
              aria-label="Scenario goal"
            >
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
                    "flex items-center justify-between gap-2 rounded-md border px-3 py-2.5 text-left text-sm",
                    goalId === g.id
                      ? "border-primary/60 bg-primary/[0.07]"
                      : "border-transparent hover:bg-muted/40",
                  )}
                >
                  <span className="font-semibold">{g.label}</span>
                  {g.rules !== "any" ? (
                    <Pill tone={g.rules === "IFR" ? "magenta" : "ok"}>{g.rules}</Pill>
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

            <div className="mt-5">
              {hydrated && plans.length ? (
                <div className="space-y-2">
                  <span className="label-caps">Flight plan (optional)</span>
                  <Select
                    value={planId}
                    onValueChange={(v) => {
                      setPlanId(v);
                      applyPlan(plans.find((p) => p.id === v) ?? null);
                    }}
                  >
                    <SelectTrigger aria-label="Saved flight plan" className="sm:max-w-md">
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
                      <FileText className="mt-0.5 size-3.5 shrink-0" /> {plan.rules}{" "}
                      {plan.departure} → {plan.destination} via {plan.route.join(" ") || "direct"},{" "}
                      {alt(plan.cruiseAltFt).text} ft.{" "}
                      {plan.rules === "IFR"
                        ? "Request your simulated IFR clearance from Clearance Delivery/Ground."
                        : "Request flight following after departure."}
                    </p>
                  ) : null}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  <FileText className="mr-1 inline size-3.5" />
                  Optional: save a route in the{" "}
                  <Link to="/planner" className="text-primary underline">
                    Flight Planner
                  </Link>{" "}
                  to request a clearance for it here.
                </p>
              )}
            </div>
          </section>

          {aiSessions.length ? (
            <section>
              <h2 className="label-caps mb-2">Recent AI ATC sessions</h2>
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
            </section>
          ) : null}
        </div>

        <div className="lg:sticky lg:top-4 lg:self-start">
          <section className="panel space-y-4 p-4">
            <label className="block space-y-1">
              <span className="label-caps">
                {goalId === "vfr-arrival" || goalId === "ifr-arrival"
                  ? "Arrival airport"
                  : "Departure airport"}
              </span>
              <Select
                value={airport}
                onValueChange={(v) => {
                  setAirport(v);
                  if (destination === v) setDestination("auto");
                }}
              >
                <SelectTrigger aria-label="Airport">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {allAirports.map((a) => (
                    <SelectItem key={a.icao} value={a.icao}>
                      {a.icao} — {a.name}
                      {a.towered ? "" : " (CTAF)"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            {!["vfr-arrival", "ifr-arrival", "pattern"].includes(goalId) ? (
              <label className="block space-y-1">
                <span className="label-caps">Destination airport</span>
                <Select value={destination} onValueChange={setDestination}>
                  <SelectTrigger aria-label="Destination airport">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">Auto (nearby airport)</SelectItem>
                    {allAirports
                      .filter((a) => a.icao !== airport)
                      .map((a) => (
                        <SelectItem key={a.icao} value={a.icao}>
                          {a.icao} — {a.name}
                          {a.towered ? "" : " (CTAF)"}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </label>
            ) : null}
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
                    className={optionBtn(rules === r)}
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
                    title={d.description}
                    className={optionBtn(difficulty === d.id)}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {DIFFICULTIES.find((d) => d.id === difficulty)?.description}
              </p>
            </div>

            <details className="group">
              <summary className="cursor-pointer list-none text-xs text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
                <span className="group-open:hidden">
                  More options — aircraft, callsign <span className="font-mono">{callsign}</span>,
                  controller
                </span>
                <span className="hidden group-open:inline">Fewer options</span>
              </summary>
              <div className="mt-3 space-y-3">
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
                        title={p.description}
                        className={optionBtn(personality === p.id)}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </details>
            {!callsignValid ? (
              <p className="text-[11px] text-warning">Check the callsign under More options.</p>
            ) : null}

            <Button
              className="w-full"
              size="lg"
              onClick={start}
              disabled={!callsignValid || loading}
              title="Scored on phraseology, readbacks, callsign use, frequency management and timing."
            >
              {loading ? <Loader2 className="animate-spin" /> : aiAvailable ? <Bot /> : <Play />}{" "}
              Start practice
            </Button>
          </section>
        </div>
      </div>
    </Page>
  );
}
