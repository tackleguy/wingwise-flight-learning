/**
 * Chat-style oral exam with a simulated examiner. Reusable: the Oral Exam page and the Virtual
 * Checkride (stage 6) both embed it.
 *
 *   <OralExamSession level="standard" trackId="private" onComplete={(r) => ...} />
 *
 * Grading is rubric-based and always works offline; when an AI provider is available its
 * assessment is validated and blended with the rubric (see src/lib/oral/grading.ts).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowRight,
  BookMarked,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  Lightbulb,
  Loader2,
  Mic,
  MicOff,
  RotateCcw,
  Send,
  Sparkles,
  TrendingDown,
  TrendingUp,
  User,
  UserRound,
  Volume2,
  VolumeX,
  XCircle,
} from "lucide-react";
import type { OralAttempt, TrackId } from "@/lib/store";
import { useStore } from "@/lib/store";
import {
  LEVELS,
  ORAL_TOPIC_LESSON,
  aiAssess,
  blendScores,
  evaluateRubric,
  isNonAnswer,
  pickFollowUp,
  rubricScore,
  selectQuestions,
  verdictFor,
  type OralLevel,
  type OralQuestion,
  type OralTopic,
  type RubricConcept,
  type Verdict,
} from "@/lib/oral";
import { Meter, Panel, Pill, Stat } from "@/components/app/page";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { speak, speechSynthesisSupported, stopSpeaking, useSpeechInput } from "./speech";

export interface OralSessionResult {
  level: OralLevel;
  trackId: TrackId;
  /** 0–100 average of question scores */
  score: number;
  items: OralAttempt["items"];
  byTopic: { topic: string; score: number; count: number }[];
  transcript: { from: "examiner" | "applicant" | "evaluation"; text: string }[];
  aiAssisted: boolean;
}

interface EvalInfo {
  verdict: Verdict | "incomplete";
  score?: number;
  missing: string[];
  feedback: string;
  modelAnswer?: string;
  reference?: string;
  ai?: string;
}

interface ChatMsg {
  id: number;
  from: "examiner" | "applicant" | "evaluation";
  text: string;
  eval?: EvalInfo;
  topic?: string;
}

const TRANSITIONS = ["Okay, let's move on.", "Alright. Next topic.", "Good. Let's talk about something else.", "Moving on.", "Let's switch gears."];

function msgText(m: ChatMsg): string {
  if (m.from !== "evaluation" || !m.eval) return m.text;
  const e = m.eval;
  return [e.verdict === "incomplete" ? "Incomplete answer." : `Score ${e.score ?? 0}/100 (${e.verdict}).`, e.feedback, e.missing.length ? `Missing: ${e.missing.join("; ")}.` : ""].filter(Boolean).join(" ");
}

export function OralExamSession({
  level,
  trackId,
  count,
  onComplete,
  showReport = true,
  onRestart,
}: {
  level: OralLevel;
  trackId: TrackId;
  /** Override the number of questions (e.g., a shorter oral inside a checkride). */
  count?: number;
  onComplete: (r: OralSessionResult) => void;
  showReport?: boolean;
  onRestart?: () => void;
}) {
  const info = LEVELS[level];
  const voice = useStore((s) => s.settings.voice);
  const [questions, setQuestions] = useState<OralQuestion[] | null>(null);
  const [qi, setQi] = useState(0);
  const [step, setStep] = useState<"answer" | "followup" | "grading" | "done">("answer");
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [hintShown, setHintShown] = useState(false);
  const [tts, setTts] = useState(false);
  const [ttsSupported, setTtsSupported] = useState(false);
  const [result, setResult] = useState<OralSessionResult | null>(null);
  const [aiUsed, setAiUsed] = useState<string | null>(null);

  const firstRef = useRef<{ text: string; hits: Set<string>; followQ: string } | null>(null);
  const itemsRef = useRef<OralSessionResult["items"]>([]);
  const msgId = useRef(0);
  const completedRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const ttsRef = useRef(tts);
  ttsRef.current = tts;
  const messagesRef = useRef<ChatMsg[]>([]);
  messagesRef.current = messages;

  const push = useCallback(
    (m: Omit<ChatMsg, "id">) => {
      const msg = { ...m, id: ++msgId.current };
      setMessages((prev) => [...prev, msg]);
      if (m.from === "examiner" && ttsRef.current) speak(m.text, { rate: voice.rate, volume: voice.volume, voiceName: voice.voiceName });
    },
    [voice.rate, voice.volume, voice.voiceName],
  );

  const ask = useCallback(
    (qs: OralQuestion[], i: number) => {
      const q = qs[i];
      if (!q) return;
      const lead = i === 0 ? "" : `${TRANSITIONS[i % TRANSITIONS.length]} `;
      const scen = q.scenario && (level === "checkride" || level === "advanced" || q.id.startsWith("wx-")) ? `${q.scenario}\n\n` : "";
      push({ from: "examiner", text: `${lead}${scen}${q.question}`, topic: q.topic });
      setHintShown(false);
    },
    [level, push],
  );

  // Select questions client-side (random) and open the session.
  useEffect(() => {
    setTtsSupported(speechSynthesisSupported());
    const qs = selectQuestions(level, trackId, count);
    setQuestions(qs);
    const intro =
      level === "checkride"
        ? `Good morning. I'm your examiner for today's mock practical test oral. This is a simulated, unofficial evaluation. I'll ask ${qs.length} scenario-based questions — answer as completely as you would for a real examiner. There are no hints today. Let's begin.`
        : `Welcome. I'll be your examiner for this ${info.label.toLowerCase()} oral session — ${qs.length} questions. Answer in your own words; I'll follow up if something is missing.${info.hints ? " You can ask for a hint on any question." : ""}`;
    msgId.current = 0;
    setMessages([{ id: ++msgId.current, from: "examiner", text: intro }]);
    const t = window.setTimeout(() => ask(qs, 0), 400);
    return () => {
      window.clearTimeout(t);
      stopSpeaking();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages, step]);

  const appendVoice = useCallback((t: string) => setInput((prev) => (prev ? `${prev.trimEnd()} ${t}` : t)), []);
  const mic = useSpeechInput(appendVoice);

  const finish = useCallback(
    (qs: OralQuestion[]) => {
      if (completedRef.current) return;
      completedRef.current = true;
      const items = itemsRef.current;
      const score = items.length ? Math.round(items.reduce((a, it) => a + it.score, 0) / items.length) : 0;
      const topicMap = new Map<string, { sum: number; count: number }>();
      for (const it of items) {
        const t = topicMap.get(it.topic) ?? { sum: 0, count: 0 };
        t.sum += it.score;
        t.count += 1;
        topicMap.set(it.topic, t);
      }
      const byTopic = [...topicMap.entries()].map(([topic, v]) => ({ topic, score: Math.round(v.sum / v.count), count: v.count })).sort((a, b) => a.score - b.score);
      const closing = score >= 70 ? "That concludes the oral. Overall, a solid showing — review the items I noted." : "That concludes the oral. There are several areas you'll want to review before a real checkride.";
      const closingMsg: ChatMsg = { id: ++msgId.current, from: "examiner", text: closing };
      const all = [...messagesRef.current, closingMsg];
      setMessages(all);
      const r: OralSessionResult = {
        level,
        trackId,
        score,
        items,
        byTopic,
        transcript: all.map((m) => ({ from: m.from, text: msgText(m) })),
        aiAssisted: !!aiUsed,
      };
      setResult(r);
      onComplete(r);
      if (ttsRef.current) speak(closing, { rate: voice.rate, volume: voice.volume, voiceName: voice.voiceName });
      setStep("done");
      void qs;
    },
    [level, trackId, onComplete, aiUsed, voice.rate, voice.volume, voice.voiceName],
  );

  const finalize = useCallback(
    (qs: OralQuestion[], q: OralQuestion, answer: string, score: number, missing: RubricConcept[], aiFeedback: string, provider: string | null, nonAnswer: boolean) => {
      const verdict = verdictFor(score);
      const missingLabels = missing.map((m) => m.label);
      let feedback: string;
      if (nonAnswer) feedback = "That's okay — it's better to say you don't know than to guess on a checkride. Here's what the examiner is looking for.";
      else if (verdict === "satisfactory") feedback = missing.length ? "Satisfactory answer. For a complete answer, you could also have covered the items below." : "Complete, satisfactory answer.";
      else if (verdict === "partial") feedback = "Partially correct — some key elements are still missing. Review the model answer.";
      else feedback = "That answer doesn't meet the standard. Here's the reference answer to study.";
      if (aiFeedback) feedback = `${feedback} Examiner note: ${aiFeedback}`;
      push({
        from: "evaluation",
        text: "",
        eval: {
          verdict,
          score,
          missing: missingLabels,
          feedback,
          modelAnswer: q.modelAnswer,
          ...(q.reference ? { reference: q.reference } : {}),
          ...(provider ? { ai: provider } : {}),
        },
      });
      itemsRef.current = [
        ...itemsRef.current,
        { topic: q.topic, question: q.question, answer, score, feedback: [feedback, missingLabels.length ? `Missing: ${missingLabels.join("; ")}.` : ""].filter(Boolean).join(" ") },
      ];
      firstRef.current = null;
      const next = qi + 1;
      if (next < qs.length) {
        setStep("grading");
        window.setTimeout(() => {
          setQi(next);
          setStep("answer");
          ask(qs, next);
        }, 900);
      } else {
        window.setTimeout(() => finish(qs), 600);
        setStep("grading");
      }
    },
    [ask, finish, push, qi],
  );

  const submit = useCallback(
    async (raw: string) => {
      const qs = questions;
      const q = qs?.[qi];
      const text = raw.trim();
      if (!qs || !q || !text || (step !== "answer" && step !== "followup")) return;
      if (mic.listening) mic.stop();
      stopSpeaking();
      setInput("");
      push({ from: "applicant", text });
      const nonAnswer = isNonAnswer(text);

      if (step === "answer") {
        setStep("grading");
        const rub = evaluateRubric(q, text);
        const rubricPct = Math.round(rub.coverage * 100);
        const ai = nonAnswer ? null : await aiAssess(q, [{ question: q.question, answer: text }]);
        if (ai) setAiUsed(ai.provider);
        const blended = blendScores(rubricPct, ai);
        const verdict = verdictFor(blended);
        if (!nonAnswer && verdict === "partial" && rub.missing.length > 0) {
          const followQ = ai?.followUp || pickFollowUp(q, rub.missing);
          firstRef.current = { text, hits: rub.hits, followQ };
          push({
            from: "evaluation",
            text: "",
            eval: {
              verdict: "incomplete",
              missing: [],
              feedback: ai?.feedback ? `Incomplete answer. ${ai.feedback}` : `Incomplete answer — you covered part of it, but key elements are missing.`,
              ...(ai ? { ai: ai.provider } : {}),
            },
          });
          window.setTimeout(() => {
            push({ from: "examiner", text: followQ, topic: q.topic });
            setStep("followup");
          }, 500);
          return;
        }
        finalize(qs, q, text, blended, rub.missing, ai?.feedback ?? "", ai?.provider ?? null, nonAnswer);
        return;
      }

      // Follow-up answer
      const first = firstRef.current;
      setStep("grading");
      const firstHits = first?.hits ?? new Set<string>();
      const rub2 = evaluateRubric(q, text);
      const followHits = new Set([...rub2.hits].filter((h) => !firstHits.has(h)));
      const rubricPct = rubricScore(q, firstHits, followHits);
      const ai = nonAnswer
        ? null
        : await aiAssess(q, [
            { question: q.question, answer: first?.text ?? "" },
            { question: first?.followQ ?? "", answer: text },
          ]);
      if (ai) setAiUsed(ai.provider);
      const final = blendScores(rubricPct, ai);
      const stillMissing = q.concepts.filter((c) => !firstHits.has(c.id) && !followHits.has(c.id));
      finalize(qs, q, `${first?.text ?? ""}\n[Follow-up] ${text}`, final, stillMissing, ai?.feedback ?? "", ai?.provider ?? null, false);
    },
    [questions, qi, step, mic, push, finalize],
  );

  const q = questions?.[qi];
  const answered = itemsRef.current.length;
  const total = questions?.length ?? info.count;
  const canType = step === "answer" || step === "followup";

  if (result && showReport) {
    return <OralReport result={result} {...(onRestart ? { onRestart } : {})} />;
  }

  return (
    <div className="panel flex flex-col overflow-hidden">
      {/* Session bar */}
      <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2.5">
        <Pill tone="primary">{info.label} oral</Pill>
        {q && step !== "done" ? <Pill tone="cyan">{q.topic}</Pill> : null}
        <span className="font-mono text-xs text-muted-foreground tabular">
          {Math.min(answered + (step === "done" ? 0 : 1), total)}/{total}
        </span>
        <div className="ml-auto flex items-center gap-3">
          <span className="hidden items-center gap-1 text-[11px] text-muted-foreground sm:flex">
            {aiUsed ? <Sparkles className="size-3 text-magenta" /> : <CheckCircle2 className="size-3" />}
            {aiUsed ? "Rubric + AI grading" : "Rubric grading"}
          </span>
          {ttsSupported ? (
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              {tts ? <Volume2 className="size-3.5" /> : <VolumeX className="size-3.5" />}
              <span className="hidden sm:inline">Examiner voice</span>
              <Switch
                checked={tts}
                onCheckedChange={(v) => {
                  setTts(v);
                  if (!v) stopSpeaking();
                }}
                aria-label="Examiner voice"
              />
            </label>
          ) : null}
        </div>
      </div>
      <div className="h-1 bg-muted">
        <div className="h-full bg-primary transition-all" style={{ width: `${(answered / Math.max(1, total)) * 100}%` }} />
      </div>

      {/* Transcript */}
      <div ref={scrollRef} className="h-[52vh] min-h-[340px] space-y-3 overflow-y-auto bg-background/30 px-3 py-4 sm:px-5" aria-live="polite">
        {messages.map((m) => (
          <Message key={m.id} m={m} />
        ))}
        {step === "grading" ? (
          <div className="flex items-center gap-2 pl-10 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" /> Examiner is evaluating…
          </div>
        ) : null}
      </div>

      {/* Composer */}
      <div className="border-t bg-card px-3 py-3 sm:px-4">
        {info.hints && q && canType && step === "answer" ? (
          hintShown ? (
            <p className="mb-2 flex gap-1.5 rounded-md border border-caution/30 bg-caution/5 px-2.5 py-1.5 text-xs text-foreground/85">
              <Lightbulb className="mt-0.5 size-3.5 shrink-0 text-caution" /> {q.hint}
            </p>
          ) : (
            <button type="button" onClick={() => setHintShown(true)} className="mb-2 inline-flex items-center gap-1 text-xs text-caution hover:underline">
              <Lightbulb className="size-3.5" /> Show hint
            </button>
          )
        ) : null}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit(input);
          }}
          className="flex items-end gap-2"
        >
          <div className="relative flex-1">
            <Textarea
              value={mic.listening && mic.interim ? `${input}${input ? " " : ""}${mic.interim}` : input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void submit(input);
                }
              }}
              disabled={!canType}
              rows={3}
              placeholder={step === "done" ? "Session complete." : step === "followup" ? "Answer the follow-up…" : canType ? "Type your answer (Enter to send, Shift+Enter for a new line)…" : "Please wait…"}
              className="min-h-[76px] resize-none pr-2 text-sm"
              aria-label="Your answer"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            {mic.supported ? (
              <Button
                type="button"
                variant={mic.listening ? "destructive" : "outline"}
                size="icon"
                disabled={!canType}
                onClick={() => (mic.listening ? mic.stop() : mic.start())}
                aria-label={mic.listening ? "Stop voice input" : "Answer by voice"}
                title={mic.listening ? "Stop voice input" : "Answer by voice"}
              >
                {mic.listening ? <MicOff /> : <Mic />}
              </Button>
            ) : null}
            <Button type="submit" size="icon" disabled={!canType || !input.trim()} aria-label="Send answer">
              <Send />
            </Button>
          </div>
        </form>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
          <button
            type="button"
            disabled={!canType}
            onClick={() => void submit("I don't know")}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-40"
          >
            <CircleHelp className="size-3.5" /> I don't know
          </button>
          {mic.listening ? <span className="flex items-center gap-1 text-xs text-warning"><span className="size-2 animate-pulse rounded-full bg-warning" /> Listening… speak your answer, then press send.</span> : null}
          {!mic.supported ? <span className="text-[11px] text-muted-foreground">Voice answers aren't supported in this browser (try Chrome, Edge or Safari) — type your answers instead.</span> : null}
          {mic.error ? <span className="text-[11px] text-caution">{mic.error}</span> : null}
        </div>
      </div>
    </div>
  );
}

function Message({ m }: { m: ChatMsg }) {
  if (m.from === "evaluation" && m.eval) return <EvalCard e={m.eval} />;
  const examiner = m.from === "examiner";
  return (
    <div className={cn("flex gap-2.5 animate-fade-up", examiner ? "" : "flex-row-reverse")}>
      <div className={cn("flex size-8 shrink-0 items-center justify-center rounded-full border", examiner ? "border-primary/40 bg-primary/15 text-primary" : "border-border bg-muted text-muted-foreground")}>
        {examiner ? <UserRound className="size-4" /> : <User className="size-4" />}
      </div>
      <div className={cn("max-w-[85%] rounded-lg px-3 py-2 text-sm leading-relaxed", examiner ? "rounded-tl-sm border bg-card" : "rounded-tr-sm bg-primary/15")}>
        <p className="label-caps mb-0.5 text-[9px]">{examiner ? `Examiner${m.topic ? ` · ${m.topic}` : ""}` : "You"}</p>
        <p className="whitespace-pre-wrap">{m.text}</p>
      </div>
    </div>
  );
}

function EvalCard({ e }: { e: EvalInfo }) {
  const [open, setOpen] = useState(e.verdict !== "satisfactory" && e.verdict !== "incomplete");
  const tone = e.verdict === "satisfactory" ? "ok" : e.verdict === "incomplete" || e.verdict === "partial" ? "caution" : "warning";
  const Icon = e.verdict === "satisfactory" ? CheckCircle2 : e.verdict === "unsatisfactory" ? XCircle : AlertTriangle;
  return (
    <div className="ml-10 animate-fade-up rounded-md border border-border bg-muted/30 px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <Icon className={cn("size-4", tone === "ok" ? "text-ok" : tone === "caution" ? "text-caution" : "text-warning")} />
        <Pill tone={tone}>{e.verdict === "incomplete" ? "Incomplete — follow-up" : e.verdict}</Pill>
        {e.score !== undefined ? <span className="font-mono text-sm font-semibold tabular">{e.score}/100</span> : null}
        {e.ai ? (
          <span className="ml-auto flex items-center gap-1 text-[10px] text-muted-foreground">
            <Sparkles className="size-3 text-magenta" /> AI-assisted
          </span>
        ) : null}
      </div>
      <p className="mt-1.5 text-sm text-foreground/90">{e.feedback}</p>
      {e.missing.length ? (
        <div className="mt-2 flex flex-wrap gap-1">
          <span className="text-[11px] text-muted-foreground">Missing:</span>
          {e.missing.map((m) => (
            <span key={m} className="rounded border border-caution/30 bg-caution/10 px-1.5 py-0.5 text-[11px] text-caution">
              {m}
            </span>
          ))}
        </div>
      ) : null}
      {e.modelAnswer ? (
        <div className="mt-2">
          <button type="button" onClick={() => setOpen((o) => !o)} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
            <ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} /> Model answer
          </button>
          {open ? (
            <div className="mt-1.5 rounded border-l-2 border-primary/50 bg-background/40 px-2.5 py-2 text-[13px] leading-relaxed text-foreground/85">
              {e.modelAnswer}
              {e.reference ? (
                <p className="mt-1.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                  <BookMarked className="size-3" /> {e.reference}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** Final examination report. */
export function OralReport({ result, onRestart, compact }: { result: OralSessionResult; onRestart?: () => void; compact?: boolean }) {
  const [showTranscript, setShowTranscript] = useState(false);
  const strengths = result.byTopic.filter((t) => t.score >= 80).sort((a, b) => b.score - a.score);
  const review = result.byTopic.filter((t) => t.score < 70);
  const sat = result.score >= 70;
  const satCount = result.items.filter((i) => i.score >= 75).length;
  const lessonFor = (t: string) => (ORAL_TOPIC_LESSON as Record<string, { label: string; to: string } | undefined>)[t];

  const sortedItems = useMemo(() => result.items, [result.items]);

  return (
    <div className="animate-fade-up">
      <div className={cn("panel mb-4 border-l-4 p-5", sat ? "border-l-ok" : "border-l-warning")}>
        <div className="flex flex-wrap items-center gap-4">
          <div>
            <p className="label-caps">Examination report · {LEVELS[result.level].label} oral</p>
            <p className={cn("mt-1 text-2xl font-bold", sat ? "text-ok" : "text-warning")}>
              {result.score}/100 — {sat ? "Satisfactory" : "Needs more study"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {satCount} of {result.items.length} questions answered satisfactorily · {result.aiAssisted ? "Rubric + AI-assisted grading" : "Rubric grading"} · Simulated, unofficial evaluation
            </p>
          </div>
          {onRestart ? (
            <Button variant="outline" className="ml-auto" onClick={onRestart}>
              <RotateCcw /> New oral session
            </Button>
          ) : null}
        </div>
      </div>

      <div className={cn("mb-4 grid gap-4", compact ? "" : "lg:grid-cols-3")}>
        <Panel title="Score by topic" className={compact ? "" : "lg:col-span-1"}>
          <div className="grid gap-3">
            {result.byTopic.map((t) => (
              <Meter key={t.topic} value={t.score} label={`${t.topic}${t.count > 1 ? ` (${t.count})` : ""}`} />
            ))}
          </div>
        </Panel>
        <Panel title={<span className="flex items-center gap-1.5"><TrendingUp className="size-3.5" /> Strengths</span>}>
          {strengths.length ? (
            <ul className="grid gap-1.5 text-sm">
              {strengths.map((t) => (
                <li key={t.topic} className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5"><CheckCircle2 className="size-3.5 text-ok" /> {t.topic}</span>
                  <span className="font-mono text-xs tabular text-muted-foreground">{t.score}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No topic reached 80 yet. Keep practicing — model answers are in the transcript.</p>
          )}
        </Panel>
        <Panel title={<span className="flex items-center gap-1.5"><TrendingDown className="size-3.5" /> Areas to review</span>}>
          {review.length ? (
            <ul className="grid gap-1.5">
              {review.map((t) => {
                const l = lessonFor(t.topic);
                return (
                  <li key={t.topic}>
                    {l ? (
                      <Link to={l.to} className="flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-sm hover:border-primary/50 hover:bg-accent/40">
                        <span>
                          <span className="block text-[11px] text-muted-foreground">{t.topic} · {t.score}</span>
                          {l.label}
                        </span>
                        <ArrowRight className="size-4 shrink-0 text-primary" />
                      </Link>
                    ) : (
                      <span className="text-sm">{t.topic} · {t.score}</span>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Every topic scored 70 or above.</p>
          )}
        </Panel>
      </div>

      {!compact ? (
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Questions" value={result.items.length} />
          <Stat label="Satisfactory" value={satCount} tone="ok" />
          <Stat label="Needs review" value={result.items.length - satCount} tone={result.items.length - satCount ? "caution" : "default"} />
          <Stat label="Overall" value={`${result.score}`} tone={sat ? "ok" : "warning"} />
        </div>
      ) : null}

      <Panel
        title="Question-by-question"
        actions={
          <button type="button" onClick={() => setShowTranscript((s) => !s)} className="text-xs text-primary hover:underline">
            {showTranscript ? "Hide full transcript" : "Show full transcript"}
          </button>
        }
      >
        <ol className="grid gap-3">
          {sortedItems.map((it, i) => (
            <li key={i} className="rounded-md border px-3 py-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs text-muted-foreground">Q{i + 1}</span>
                <Pill>{it.topic}</Pill>
                <span className={cn("ml-auto font-mono text-sm font-semibold tabular", it.score >= 75 ? "text-ok" : it.score >= 35 ? "text-caution" : "text-warning")}>{it.score}</span>
              </div>
              <p className="mt-1 text-sm font-medium">{it.question}</p>
              <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">Your answer: {it.answer}</p>
              <p className="mt-1 text-xs text-foreground/80">{it.feedback}</p>
            </li>
          ))}
        </ol>
        {showTranscript ? (
          <div className="mt-4 max-h-[420px] overflow-y-auto rounded-md border bg-background/40 p-3">
            {result.transcript.map((t, i) => (
              <p key={i} className="mb-2 text-xs leading-relaxed">
                <span className={cn("font-semibold", t.from === "examiner" ? "text-primary" : t.from === "applicant" ? "text-foreground" : "text-caution")}>
                  {t.from === "examiner" ? "Examiner" : t.from === "applicant" ? "Applicant" : "Evaluation"}:
                </span>{" "}
                <span className="whitespace-pre-wrap text-foreground/85">{t.text}</span>
              </p>
            ))}
          </div>
        ) : null}
      </Panel>
    </div>
  );
}
