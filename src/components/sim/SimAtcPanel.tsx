/**
 * Live Communicator AI & Simulated ATC panel inside the 3D Flight Simulator.
 *
 * Syncs COM1/COM2/Transponder with SimEngine, keeps Weather -> ATIS current, fires
 * proactive controller handoffs & clearances on flight milestones, and routes pilot calls
 * through local AI (with strict guardrails + full scripted communicator fallback).
 *
 * SIMULATED FOR TRAINING ONLY — never real air traffic control.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import {
  Headphones,
  Lightbulb,
  Loader2,
  MessageSquare,
  Radio,
  Send,
  Volume2,
  X,
} from "lucide-react";
import type { SimEngine } from "@/sim/engine";
import { useSimSnapshot } from "@/sim/react";
import type { BuiltScenario, ScenarioDef } from "@/sim/scenarios";
import { atcController, parseJsonObject } from "@/lib/ai/services";
import type { AiMessage } from "@/lib/ai/client";
import { facilityOf } from "@/lib/atc/context";
import { formatFreqShort } from "@/lib/atc/frequency";
import {
  aiStateSnapshot,
  applyAiTurn,
  blockedTurn,
  facilityAt,
  freeDirectory,
  freeHint,
  freeReport,
  noStationTurn,
  scriptedTurn,
  type AiAtcJson,
  type FreeReply,
} from "@/lib/atc/freeform";
import { PHONETIC } from "@/lib/atc/phrase";
import {
  extractTelemetry,
  handleSimEvent,
  initSimAtc,
  initialSimRadios,
  simQuickCalls,
  stepSimAtc,
  type SimAtcController,
} from "@/lib/atc/sim-bridge";
import { useRadioQueue, type QueueItem } from "@/lib/atc/useRadioQueue";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { AiStatusPill, useAiStatus } from "@/components/ai/AiStatusPill";
import { AtcTranscript } from "@/components/radio/AtcTranscript";
import {
  isListening,
  RadioPanel,
  type RadioState,
  type TransmitMeta,
} from "@/components/radio/RadioPanel";
import { Pill } from "@/components/app/page";
import { Button } from "@/components/ui/button";

export interface SimAtcSummary {
  score: number;
  grade: string;
  transmissions: number;
  engine: "ai" | "scripted";
  airport: string;
  destination?: string | undefined;
  recordPayload: {
    scenarioId: string;
    title: string;
    airport: string;
    difficulty: "beginner" | "intermediate" | "advanced" | "checkride";
    engine: "ai" | "scripted";
    score: number;
    breakdown: ReturnType<typeof freeReport>["breakdown"];
    feedback: string[];
    transcript: { from: "pilot" | "atc" | "system"; station?: string; text: string; t: number }[];
  };
}

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

export interface SimAtcPanelProps {
  engine: SimEngine;
  scenario: ScenarioDef;
  built: BuiltScenario;
  open: boolean;
  ended: boolean;
  onOpenChange: (open: boolean) => void;
  onHudUpdate?: (info: { activeFreq: number; stationName: string; unread: number }) => void;
  summaryRef: MutableRefObject<(() => SimAtcSummary | null) | null>;
}

export function SimAtcPanel({
  engine,
  scenario,
  built,
  open,
  ended,
  onOpenChange,
  onHudUpdate,
  summaryRef,
}: SimAtcPanelProps) {
  const snap = useSimSnapshot(engine);
  const profile = useStore((s) => s.profile);
  const settings = useStore((s) => s.settings);
  const { status, aiAvailable } = useAiStatus();

  const callsign = useMemo(() => {
    const raw = (profile?.callsign || "N172TX").toUpperCase().replace(/[^A-Z0-9]/g, "");
    return /^[A-Z0-9]{2,7}$/.test(raw) ? raw : "N172TX";
  }, [profile?.callsign]);

  const difficulty = settings.training.difficulty;
  const personality = "professional" as const;

  const initRef = useRef<ReturnType<typeof initSimAtc> | null>(null);
  if (!initRef.current) {
    initRef.current = initSimAtc({
      built,
      scenario,
      aircraftId: engine.perf.id,
      callsign,
      difficulty,
      personality,
      snap: engine.getSnapshot(),
    });
  }

  const [ctrl, setCtrl] = useState<SimAtcController>(() => initRef.current!.ctrl);
  const ctrlRef = useRef<SimAtcController>(initRef.current.ctrl);
  const historyRef = useRef<AiMessage[]>([]);
  const aiTurns = useRef(0);
  const busyAtPtt = useRef(false);
  const [thinking, setThinking] = useState(false);
  const [aiHint, setAiHint] = useState("");
  const [lastEngine, setLastEngine] = useState<"ai" | "scripted">(aiAvailable ? "ai" : "scripted");
  const [unread, setUnread] = useState(0);
  const [banner, setBanner] = useState<{ station: string; text: string } | null>(null);
  const bannerTimer = useRef<number | null>(null);
  const [radioUi, setRadioUi] = useState<
    Pick<RadioState, "tx" | "monitor2" | "volume" | "spacing">
  >({
    tx: 1,
    monitor2: false,
    volume: 0.85,
    spacing: 25,
  });

  const radiosPowered = !snap.failures.radios && snap.indicated.avionicsPowered;

  const queue = useRadioQueue({
    speech: settings.voice.atcSpeech && radiosPowered && !ended,
    rate: Math.max(0.6, Math.min(1.8, settings.voice.rate)),
    volume: radiosPowered ? Math.max(0, Math.min(1, radioUi.volume * settings.voice.volume)) : 0,
    voiceName: settings.voice.voiceName,
  });

  const pushReplies = useCallback(
    (replies: FreeReply[], announce = true) => {
      if (!replies.length) return;
      queue.push(toQueue(replies));
      if (!announce) return;
      const atcMsg = [...replies].reverse().find((r) => r.kind === "atc");
      if (atcMsg) {
        if (!open) setUnread((n) => n + 1);
        setBanner({
          station: atcMsg.facility?.name ?? "ATC",
          text: atcMsg.phrase.text,
        });
        if (bannerTimer.current) window.clearTimeout(bannerTimer.current);
        bannerTimer.current = window.setTimeout(() => setBanner(null), 10000);
      }
    },
    [queue, open],
  );

  // Clear unread counter when drawer is opened
  useEffect(() => {
    if (open) setUnread(0);
  }, [open]);

  // Halt speech queue cleanly if flight ends
  useEffect(() => {
    if (ended) queue.halt();
  }, [ended, queue]);

  // Seed SimEngine COM1/COM2 & initial transcript notice once on mount
  useEffect(() => {
    const init = initRef.current!;
    engine.setRadios(initialSimRadios(init.ctrl.free));
    queue.push(toQueue(init.replies));
    return () => {
      if (bannerTimer.current) window.clearTimeout(bannerTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine]);

  // Listen for immediate sim events (liftoff, touchdown, failures)
  useEffect(() => {
    return engine.onEvent((ev) => {
      if (ended) return;
      const { ctrl: nextCtrl, replies } = handleSimEvent(ctrlRef.current, ev);
      ctrlRef.current = nextCtrl;
      setCtrl(nextCtrl);
      if (replies.length) pushReplies(replies);
    });
  }, [engine, ended, pushReplies]);

  // Sync live telemetry, weather ATIS & proactive flight milestones ~every 1.5s
  useEffect(() => {
    const id = window.setInterval(() => {
      if (ended) return;
      const s = engine.getSnapshot();
      if (s.paused) return;
      const res = stepSimAtc(ctrlRef.current, s, built);
      ctrlRef.current = res.ctrl;
      setCtrl(res.ctrl);
      if (res.replies.length) {
        pushReplies(res.replies);
      }
    }, 1500);
    return () => window.clearInterval(id);
  }, [engine, built, ended, pushReplies]);

  const radioValue: RadioState = useMemo(
    () => ({
      com1: snap.radios.com1,
      com2: snap.radios.com2,
      ...radioUi,
    }),
    [snap.radios.com1, snap.radios.com2, radioUi],
  );

  const handleRadioChange = useCallback(
    (next: RadioState) => {
      setRadioUi({
        tx: next.tx,
        monitor2: next.monitor2,
        volume: next.volume,
        spacing: next.spacing,
      });
      if (
        next.com1.active !== snap.radios.com1.active ||
        next.com1.standby !== snap.radios.com1.standby ||
        next.com2.active !== snap.radios.com2.active ||
        next.com2.standby !== snap.radios.com2.standby
      ) {
        engine.setRadios({ com1: next.com1, com2: next.com2 });
      }
    },
    [engine, snap.radios.com1, snap.radios.com2],
  );

  const commitFree = useCallback(
    (nextFree: SimAtcController["free"]) => {
      const nextCtrl = { ...ctrlRef.current, free: nextFree };
      ctrlRef.current = nextCtrl;
      setCtrl(nextCtrl);
      // Sync assigned transponder code when cleared/squawk assigned if pilot leaves it on default
      const targetSqk = nextFree.emergency
        ? "7700"
        : nextFree.ffActive || nextFree.clearance
          ? nextFree.ctx.squawk
          : null;
      if (targetSqk && engine.getSnapshot().radios.transponder.code === "1200") {
        engine.setRadios({
          transponder: { ...engine.getSnapshot().radios.transponder, code: targetSqk },
        });
      }
    },
    [engine],
  );

  const onTransmit = useCallback(
    async (text: string, meta: TransmitMeta) => {
      const s = ctrlRef.current.free;
      const curSnap = engine.getSnapshot();
      if (!radiosPowered || thinking || ended) return;

      queue.addPilot(text, undefined, meta.mhz);
      const f = facilityAt(s, meta.mhz);
      if (!f) {
        const r = noStationTurn(s, text, meta.mhz);
        commitFree(r.state);
        pushReplies(r.replies, false);
        return;
      }
      if (busyAtPtt.current) {
        busyAtPtt.current = false;
        const r = blockedTurn(s, text, f);
        commitFree(r.state);
        pushReplies(r.replies, false);
        return;
      }

      if (aiAvailable) {
        setThinking(true);
        const telemetry = extractTelemetry(curSnap, built, s);
        const userMsg: AiMessage = {
          role: "user",
          content: `[Pilot on ${f.name} ${formatFreqShort(f.mhz)}] ${text}`,
        };
        const res = await atcController({
          state: aiStateSnapshot(s, { ...telemetry }),
          difficulty: s.difficulty,
          personality: s.personality,
          goal: s.goal,
          history: [...historyRef.current, userMsg],
        });
        setThinking(false);
        const cur = ctrlRef.current.free;
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
            commitFree(applied.state);
            setAiHint(applied.hint);
            setLastEngine("ai");
            const extra: FreeReply[] = [];
            if (s.difficulty === "beginner" && applied.issues.length) {
              extra.push({
                kind: "system",
                phrase: {
                  text: `Tips:\n${applied.issues.map((i) => `• ${i}`).join("\n")}`,
                  spoken: "",
                },
                delayMs: 0,
                tone: "caution",
              });
            }
            pushReplies([...applied.replies, ...extra]);
            return;
          }
        }
      }

      const r = scriptedTurn(ctrlRef.current.free, text, f);
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
      commitFree(r.state);
      setAiHint("");
      setLastEngine("scripted");
      pushReplies(r.replies);
    },
    [aiAvailable, built, commitFree, ended, engine, pushReplies, queue, radiosPowered, thinking],
  );

  // Report summary callback to FlightSession debrief
  useEffect(() => {
    summaryRef.current = () => {
      const f = ctrlRef.current.free;
      if (!f.evals.length) return null;
      const rep = freeReport(f);
      const lines = queue.getLines();
      const eng = aiTurns.current > 0 ? ("ai" as const) : ("scripted" as const);
      return {
        score: rep.score,
        grade: rep.grade,
        transmissions: f.evals.length,
        engine: eng,
        airport: f.dep.airport.icao,
        ...(f.dest ? { destination: f.dest.airport.icao } : {}),
        recordPayload: {
          scenarioId: `sim-${scenario.id}`,
          title: `Sim ATC: ${scenario.title}`.slice(0, 120),
          airport: f.dep.airport.icao,
          difficulty: f.difficulty,
          engine: eng,
          score: rep.score,
          breakdown: rep.breakdown,
          feedback: rep.feedback,
          transcript: lines.map((l) => ({
            from: l.from === "traffic" ? "atc" : l.from,
            ...(l.station ? { station: l.station } : {}),
            text: l.text,
            t: l.t,
          })),
        },
      };
    };
  }, [queue, scenario.id, scenario.title, summaryRef]);

  const free = ctrl.free;
  const ctx = free.ctx;
  const curFac = facilityOf(ctx, free.currentStation);
  const activeMhz = radioUi.tx === 1 ? radioValue.com1.active : radioValue.com2.active;
  const tunedFac = facilityAt(free, activeMhz);

  useEffect(() => {
    onHudUpdate?.({
      activeFreq: activeMhz,
      stationName: curFac.name,
      unread,
    });
  }, [activeMhz, curFac.name, unread, onHudUpdate]);

  const tunedAtisLeg = [
    ctx,
    ...(free.dest && free.dest.airport.icao !== ctx.airport.icao ? [free.dest] : []),
    ...(free.dep.airport.icao !== ctx.airport.icao ? [free.dep] : []),
  ].find((l) => l.atisFreq !== null && isListening(radioValue, l.atisFreq));

  const quickCalls = useMemo(() => simQuickCalls(free, tunedFac, snap), [free, tunedFac, snap]);
  const tel = useMemo(() => extractTelemetry(snap, built, free), [snap, built, free]);
  const hintText = aiHint || freeHint(free);

  const sendQuickCall = (text: string) => {
    if (!radiosPowered || thinking) return;
    // Auto-tune COM1 active to the expected station if pilot isn't on a valid station yet
    let mhz = activeMhz;
    if (!facilityAt(free, mhz)) {
      mhz = curFac.mhz;
      if (radioUi.tx === 1) {
        engine.setRadios({ com1: { active: curFac.mhz, standby: radioValue.com1.active } });
      } else {
        engine.setRadios({ com2: { active: curFac.mhz, standby: radioValue.com2.active } });
      }
    }
    void onTransmit(text, {
      via: "text",
      pttStartedAt: Date.now(),
      endedAt: Date.now(),
      com: radioUi.tx,
      mhz,
    });
  };

  if (!open) {
    if (!banner || !radiosPowered) return null;
    return (
      <div className="pointer-events-auto absolute top-28 right-3 z-20 w-[min(360px,calc(100%-1.5rem))] rounded-md border border-primary/40 bg-black/80 p-2.5 text-white shadow-lg backdrop-blur">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-[10px] font-bold tracking-wide text-ok uppercase">
              <Radio className="size-3" /> {banner.station}
            </p>
            <p className="mt-0.5 font-mono text-xs leading-snug text-white/95">{banner.text}</p>
          </div>
          <button
            type="button"
            onClick={() => setBanner(null)}
            className="rounded p-0.5 text-white/50 hover:bg-white/10 hover:text-white"
            aria-label="Dismiss ATC banner"
          >
            <X className="size-3.5" />
          </button>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {free.pending && quickCalls[0] ? (
            <Button
              size="sm"
              className="h-6 px-2 text-[11px]"
              onClick={() => sendQuickCall(quickCalls[0]!.text)}
            >
              <Send className="size-3" /> Read back
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="secondary"
            className="h-6 px-2 text-[11px]"
            onClick={() => onOpenChange(true)}
          >
            <MessageSquare className="size-3" /> Open ATC Radio
          </Button>
        </div>
      </div>
    );
  }

  return (
    <aside
      aria-label="Simulator Air Traffic Control Radio"
      className="pointer-events-auto absolute top-24 right-3 bottom-3 z-30 flex w-[min(430px,calc(100%-1.5rem))] flex-col overflow-hidden rounded-lg border border-white/15 bg-background/95 shadow-2xl backdrop-blur"
    >
      <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="flex items-center gap-1 text-xs font-bold tracking-wide uppercase">
              <Radio className="size-3.5 text-primary" /> Sim ATC
            </span>
            <AiStatusPill
              status={status}
              loading={false}
              using={aiAvailable ? lastEngine : "scripted"}
            />
            {free.dest ? (
              <Pill tone="primary">
                {free.leg} · {free.dep.airport.icao}→{free.dest.airport.icao}
              </Pill>
            ) : null}
          </div>
          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
            {ctx.airport.icao} · Rwy {ctx.runway.id} · ATIS {PHONETIC[ctx.atis.letter]}{" "}
            {ctx.atis.altimeter.toFixed(2)} · {tel.distToActiveNm} nm{" "}
            {ctx.airport.towered ? "" : "(CTAF)"}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Minimize ATC panel"
          title="Minimize ATC panel"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto p-3">
        {!radiosPowered ? (
          <div className="rounded border border-warning/50 bg-warning/15 px-2.5 py-2 text-xs text-warning">
            COM radios inoperative — check Master Battery &amp; Avionics Master or radio failure.
          </div>
        ) : null}

        {free.difficulty !== "checkride" ? (
          <div className="rounded border-l-2 border-primary/60 bg-muted/40 px-2.5 py-1.5 text-[11px] leading-snug">
            <span className="font-semibold text-primary">
              Now: {curFac.name} ({formatFreqShort(curFac.mhz)})
            </span>
            <p className="mt-0.5 text-muted-foreground">
              <Lightbulb className="mr-1 inline size-3 text-caution" />
              {hintText}
            </p>
          </div>
        ) : null}

        <RadioPanel
          value={radioValue}
          onChange={handleRadioChange}
          directory={freeDirectory(free)}
          expected={free.difficulty === "checkride" ? null : { name: curFac.name, mhz: curFac.mhz }}
          receiving={queue.receiving}
          onPttStart={() => {
            busyAtPtt.current = queue.isBusy();
          }}
          onTransmit={(t, m) => void onTransmit(t, m)}
          micEnabled={settings.voice.micInput}
          spacebarPtt={false}
          disabled={thinking || !radiosPowered}
          {...(thinking ? { composerPlaceholder: "Controller is responding…" } : {})}
        />

        {quickCalls.length && radiosPowered ? (
          <div className="flex flex-wrap gap-1">
            {quickCalls.map((q) => (
              <button
                key={q.label}
                type="button"
                disabled={thinking}
                onClick={() => sendQuickCall(q.text)}
                className="rounded border border-border bg-muted/60 px-2 py-1 text-[11px] font-medium hover:border-primary/60 hover:bg-primary/10 disabled:opacity-50"
                title={q.text}
              >
                {q.label}
              </button>
            ))}
          </div>
        ) : null}

        {tunedAtisLeg && radiosPowered ? (
          <div className="avionics-screen p-2">
            <div className="mb-0.5 flex items-center justify-between gap-2">
              <span className="flex items-center gap-1 text-[10px] font-semibold text-cyan">
                <Headphones className="size-3" /> {tunedAtisLeg.airport.icao}{" "}
                {tunedAtisLeg.airport.towered ? "ATIS" : "AWOS"}{" "}
                {tunedAtisLeg.atisFreq ? formatFreqShort(tunedAtisLeg.atisFreq) : ""}
              </span>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 px-2 text-[11px]"
                onClick={() =>
                  queue.push([
                    {
                      kind: "traffic",
                      station: `${tunedAtisLeg.airportName} ${tunedAtisLeg.airport.towered ? "ATIS" : "AWOS"}`,
                      text: tunedAtisLeg.atis.phrase.text,
                      spoken: tunedAtisLeg.atis.phrase.spoken,
                      delayMs: 150,
                      pitch: 0.9,
                    },
                  ])
                }
              >
                <Volume2 className="size-3" /> Listen
              </Button>
            </div>
            <p className="font-mono text-[11px] leading-snug text-cyan/90">
              {tunedAtisLeg.atis.phrase.text}
            </p>
          </div>
        ) : null}

        <div className="relative">
          <AtcTranscript
            lines={queue.lines}
            receiving={queue.receiving}
            pilotLabel={ctx.cs.full}
            className="h-[175px]"
          />
          {thinking ? (
            <div className="absolute right-2 bottom-2 flex items-center gap-1 rounded-full border bg-card px-2 py-0.5 text-[10px] text-muted-foreground">
              <Loader2 className="size-3 animate-spin" /> Responding…
            </div>
          ) : null}
        </div>
        <p className="text-[10px] text-muted-foreground">
          Simulated ATC for training only — never real ATC. Type any request, weather check,
          altitude change, or diversion.
        </p>
      </div>
    </aside>
  );
}
