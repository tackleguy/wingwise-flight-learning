import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  BookOpenCheck,
  Brain,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  Gauge,
  GraduationCap,
  Lightbulb,
  Loader2,
  Plane,
  Send,
  Sparkles,
  Target,
  Trash2,
  XCircle,
} from "lucide-react";
import { Page, PageHeader, Notice } from "@/components/app/page";
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
import { Textarea } from "@/components/ui/textarea";
import { AiStatusPill, useAiStatus } from "@/components/ai/AiStatusPill";
import { useHydrated, useStore, type TrackId, type TrainingState } from "@/lib/store";
import { getQuestion } from "@/lib/exams/bank";
import { cn } from "@/lib/utils";
import type { AiMessage } from "@/lib/ai/client";
import { AI_PROVIDER_LABEL, aiChat } from "@/lib/ai/client";
import {
  flightInstructor,
  parseJsonObject,
  scenarioGenerator,
  type GeneratedScenario,
} from "@/lib/ai/services";
import {
  checkridePlan,
  DISCLAIMER,
  getEntry,
  INSTRUMENTS,
  localAnswer,
  PRACTICE_SCENARIOS,
  quizFor,
  searchKnowledge,
  type QuizItem,
} from "@/lib/ai/knowledge";

export const Route = createFileRoute("/instructor")({
  head: () => ({
    meta: [
      { title: "AI Flight Instructor — SkyReady" },
      {
        name: "description",
        content:
          "Ask an AI flight instructor about regulations, aerodynamics, weather, instruments and procedures — with practice scenarios, quizzes, mistake reviews and checkride prep. Works offline with a built-in knowledge base.",
      },
      { property: "og:title", content: "AI Flight Instructor — SkyReady" },
      {
        property: "og:description",
        content:
          "Your ground-school instructor: explanations, quizzes, scenarios and checkride prep.",
      },
    ],
  }),
  component: InstructorPage,
});

const TRACK_LABEL: Record<TrackId, string> = {
  student: "Student Pilot",
  private: "Private Pilot",
  instrument: "Instrument Rating",
  commercial: "Commercial Pilot",
  atp: "Airline Transport Pilot",
  "multi-engine": "Multi-Engine Rating",
  seaplane: "Seaplane Rating",
  tailwheel: "Tailwheel Endorsement",
  "high-performance": "High-Performance Endorsement",
  complex: "Complex Endorsement",
  "high-altitude": "High-Altitude Endorsement",
  cfi: "Flight Instructor (CFI)",
  cfii: "Instrument Instructor (CFII)",
  night: "Night Flying",
  "cross-country": "Cross-Country",
  emergency: "Emergency Procedures",
  mountain: "Mountain Flying",
  adm: "Aeronautical Decision-Making",
};

interface QuizState {
  items: { item: QuizItem; topic: string }[];
  answers: (number | null)[];
}

interface ChatMsg {
  id: string;
  role: "user" | "assistant";
  content: string;
  source?: "ai" | "local";
  provider?: string;
  quiz?: QuizState;
  scenario?: GeneratedScenario;
}

let msgSeq = 0;
const mid = () => `m${Date.now().toString(36)}${(msgSeq++).toString(36)}`;

// ---------------- markdown-ish renderer ----------------

function inline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|_[^_]+_|\*[^*]+\*)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const t = m[0];
    const k = `${keyBase}-${i++}`;
    if (t.startsWith("**"))
      out.push(
        <strong key={k} className="font-semibold text-foreground">
          {t.slice(2, -2)}
        </strong>,
      );
    else if (t.startsWith("`"))
      out.push(
        <code key={k} className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]">
          {t.slice(1, -1)}
        </code>,
      );
    else out.push(<em key={k}>{t.slice(1, -1)}</em>);
    last = m.index + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function Markdown({ text }: { text: string }) {
  const lines = text.replace(/\r/g, "").split("\n");
  const blocks: ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  let para: string[] = [];
  const flushPara = () => {
    if (para.length)
      blocks.push(<p key={`p${blocks.length}`}>{inline(para.join(" "), `p${blocks.length}`)}</p>);
    para = [];
  };
  const flushList = () => {
    if (!list) return;
    const L = list;
    const Tag = L.ordered ? "ol" : "ul";
    blocks.push(
      <Tag
        key={`l${blocks.length}`}
        className={cn("space-y-1 pl-5", L.ordered ? "list-decimal" : "list-disc")}
      >
        {L.items.map((it, i) => (
          <li key={i}>{inline(it, `l${blocks.length}-${i}`)}</li>
        ))}
      </Tag>,
    );
    list = null;
  };
  for (const raw of lines) {
    const line = raw.trimEnd();
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    const ul = /^\s*[-*•]\s+(.*)$/.exec(line);
    const ol = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (!line.trim()) {
      flushPara();
      flushList();
    } else if (h) {
      flushPara();
      flushList();
      blocks.push(
        <p
          key={`h${blocks.length}`}
          className={cn(
            "font-semibold text-foreground",
            (h[1] ?? "").length <= 2 ? "text-base" : "text-sm",
          )}
        >
          {inline(h[2] ?? "", `h${blocks.length}`)}
        </p>,
      );
    } else if (ul || ol) {
      flushPara();
      const ordered = !!ol;
      if (!list || list.ordered !== ordered) {
        flushList();
        list = { ordered, items: [] };
      }
      list.items.push((ul?.[1] ?? ol?.[1] ?? "").trim());
    } else {
      flushList();
      para.push(line.trim());
    }
  }
  flushPara();
  flushList();
  return <div className="space-y-2.5 text-sm leading-relaxed text-foreground/90">{blocks}</div>;
}

// ---------------- context ----------------

interface ContextPiece {
  key: "goal" | "lesson" | "flight" | "weak";
  label: string;
  value: string;
}

function weakestKey(rec: Record<string, number>): [string, number] | null {
  const e = Object.entries(rec).sort((a, b) => a[1] - b[1])[0];
  return e ?? null;
}

function buildContextPieces(s: TrainingState): ContextPiece[] {
  const out: ContextPiece[] = [];
  if (s.profile)
    out.push({
      key: "goal",
      label: "Goal track",
      value: `${TRACK_LABEL[s.profile.goal]}${s.assessment ? ` · assessed ${s.assessment.level}` : ""}`,
    });
  else if (s.assessment)
    out.push({
      key: "goal",
      label: "Goal track",
      value: `${TRACK_LABEL[s.assessment.recommendedTrack]} (recommended)`,
    });
  const lesson = s.activity.find((a) => a.kind === "lesson" || a.kind === "quiz");
  if (lesson) out.push({ key: "lesson", label: "Recent lesson", value: lesson.text });
  const flight = s.flights[0];
  if (flight)
    out.push({
      key: "flight",
      label: "Last sim flight",
      value: `${flight.scenarioTitle} (${flight.departure}→${flight.destination}) — ${Math.round(flight.score)}%${flight.feedback[0] ? `; ${flight.feedback[0]}` : ""}`,
    });
  const weak: string[] = [];
  const exam = s.exams[0];
  if (exam) {
    const w = Object.entries(exam.bySubject)
      .filter(([, v]) => v.total > 0)
      .sort((a, b) => a[1].correct / a[1].total - b[1].correct / b[1].total)
      .slice(0, 2)
      .map(([k, v]) => `${k} ${v.correct}/${v.total}`);
    weak.push(
      `${exam.title}: ${Math.round(exam.scorePct)}% (${exam.missedQuestionIds.length} missed${w.length ? `; weakest ${w.join(", ")}` : ""})`,
    );
  }
  const atc = [...s.atcSessions].slice(0, 5).sort((a, b) => a.score - b.score)[0];
  if (atc) {
    const wk = weakestKey(atc.breakdown);
    weak.push(
      `ATC "${atc.title}": ${Math.round(atc.score)}%${wk ? `; weakest ${wk[0]} ${wk[1]}%` : ""}`,
    );
  }
  const oral = s.orals[0];
  if (oral) weak.push(`Oral exam (${oral.level}): ${Math.round(oral.score)}%`);
  if (weak.length) out.push({ key: "weak", label: "Weak areas", value: weak.join(" · ") });
  return out;
}

function mistakeMaterial(s: TrainingState): { lines: string[]; queries: string[] } {
  const lines: string[] = [];
  const queries: string[] = [];
  const exam = s.exams[0];
  if (exam && exam.missedQuestionIds.length) {
    const weakSubjects = Object.entries(exam.bySubject)
      .filter(([, v]) => v.total > 0 && v.correct < v.total)
      .sort((a, b) => a[1].correct / a[1].total - b[1].correct / b[1].total)
      .slice(0, 3);
    lines.push(
      `Practice exam "${exam.title}": ${exam.missedQuestionIds.length} missed${weakSubjects.length ? ` — weakest: ${weakSubjects.map(([k, v]) => `${k} (${v.correct}/${v.total})`).join(", ")}` : ""}.`,
    );
    const missed = exam.missedQuestionIds
      .map((id) => getQuestion(id))
      .filter((q): q is NonNullable<typeof q> => !!q)
      .slice(0, 3);
    for (const q of missed) {
      const right = q.choices[q.answer] ?? "";
      lines.push(
        `Missed question (${q.subject}): "${q.prompt.slice(0, 220)}" — correct answer: "${right}"${q.reference ? ` (${q.reference})` : ""}. Why: ${q.explanation.slice(0, 260)}`,
      );
      queries.push(`${q.prompt} ${right} ${q.subject}`);
    }
    queries.push(...weakSubjects.map(([k]) => k));
  }
  const atcs = [...s.atcSessions].slice(0, 6).sort((a, b) => a.score - b.score);
  const atc = atcs[0];
  if (atc && atc.feedback.length) {
    lines.push(
      `ATC session "${atc.title}" (${Math.round(atc.score)}%): ${atc.feedback.slice(0, 3).join(" | ")}`,
    );
    queries.push("readback phraseology", ...atc.feedback.slice(0, 2));
  }
  const flight = s.flights[0];
  if (flight) {
    const missed = flight.objectives.filter((o) => !o.met).map((o) => o.text);
    lines.push(
      `Last sim flight "${flight.scenarioTitle}" (${Math.round(flight.score)}%): ${[...missed.slice(0, 2), ...flight.feedback.slice(0, 2)].join(" | ") || "no major issues"}`,
    );
    queries.push(...missed.slice(0, 2), ...flight.feedback.slice(0, 2));
  }
  return { lines, queries };
}

// ---------------- page ----------------

function InstructorPage() {
  const hydrated = useHydrated();
  const full = useStore((s) => s);
  const { status, loading } = useAiStatus();
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [level, setLevel] = useState<"simple" | "advanced">("simple");
  const [instrument, setInstrument] = useState(INSTRUMENTS[0]?.id ?? "asi");
  const [quizTopic, setQuizTopic] = useState("");
  const [use, setUse] = useState<Record<ContextPiece["key"], boolean>>({
    goal: true,
    lesson: true,
    flight: true,
    weak: true,
  });
  const [ctxOpen, setCtxOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const pieces = useMemo(() => (hydrated ? buildContextPieces(full) : []), [hydrated, full]);
  const activePieces = pieces.filter((p) => use[p.key]);
  const contextText = activePieces.map((p) => `${p.label}: ${p.value}`).join("\n");
  const name = full.profile?.name?.split(" ")[0];
  const isInstrumentTrack = ["instrument", "cfii", "atp", "commercial"].includes(
    full.profile?.goal ?? "",
  );
  const aiOn = !!status && status.active !== "scripted";

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, busy]);

  const push = (m: Omit<ChatMsg, "id">) => setMessages((prev) => [...prev, { ...m, id: mid() }]);
  const history = (): AiMessage[] =>
    messages
      .filter((m) => !m.quiz)
      .slice(-10)
      .map((m) => ({ role: m.role, content: m.content.slice(0, 3000) }));
  const withDisclaimer = (t: string) =>
    t.includes("Educational explanation only") ? t : `${t}\n\n_${DISCLAIMER}_`;

  const ask = async (
    question: string,
    opts: { fallback?: () => string; display?: string } = {},
  ) => {
    const q = question.trim();
    if (!q || busy) return;
    push({ role: "user", content: opts.display ?? q });
    setBusy(true);
    const r = await flightInstructor({
      question: q,
      level,
      context: contextText,
      history: history(),
    });
    setBusy(false);
    if (r.ok)
      push({
        role: "assistant",
        content: withDisclaimer(r.text),
        source: "ai",
        provider: r.provider,
      });
    else
      push({
        role: "assistant",
        content: opts.fallback ? opts.fallback() : localAnswer(q, level).markdown,
        source: "local",
      });
  };

  const send = () => {
    const q = input.trim();
    if (!q) return;
    setInput("");
    void ask(q);
  };

  const explainInstrument = () => {
    const ins = INSTRUMENTS.find((i) => i.id === instrument) ?? INSTRUMENTS[0];
    if (!ins) return;
    void ask(ins.question, {
      display: `Explain the ${ins.label.toLowerCase()}.`,
      fallback: () => {
        const e = getEntry(ins.entry);
        if (!e) return localAnswer(ins.question, level).markdown;
        return `### ${ins.label}\n\n${level === "simple" ? e.simple : `${e.simple}\n\n${e.advanced}`}\n\n**References:** ${e.refs.join("; ")}\n\n_${DISCLAIMER}_`;
      },
    });
  };

  const explainMistakes = () => {
    const mat = mistakeMaterial(full);
    if (!mat.lines.length) {
      push({ role: "user", content: "Explain my mistakes." });
      push({
        role: "assistant",
        source: "local",
        content: `I don't have any graded work from you yet. Take a **practice test**, an **ATC Simulator** scenario or a **sim flight**, and I'll review what went wrong and how to fix it.\n\n_${DISCLAIMER}_`,
      });
      return;
    }
    const q = `Review my recent mistakes and explain, for each, what went wrong, why it matters, and how to fix it:\n${mat.lines.map((l) => `- ${l}`).join("\n")}`;
    void ask(q, {
      display: "Explain my recent mistakes.",
      fallback: () => {
        const seen = new Set<string>();
        const entries = mat.queries
          .flatMap((qq) => searchKnowledge(qq, 1))
          .filter((h) => h.score >= 2 && !seen.has(h.entry.id) && seen.add(h.entry.id))
          .slice(0, 3)
          .map((h) => h.entry);
        return [
          "### Your recent mistakes",
          ...mat.lines.map((l) => `- ${l}`),
          "",
          entries.length ? "### What to review" : "",
          ...entries.map(
            (e) =>
              `**${e.title}** — ${e.simple.split("\n")[0]}\n\n*Reference: ${e.refs[0] ?? "FAA handbooks"}*`,
          ),
          "",
          "### How to fix it",
          "1. Re-read the topic above, then **quiz yourself** on it (quick action: *Quiz me on this topic*).",
          "2. Repeat the exercise that exposed the mistake — same scenario, then a harder difficulty.",
          "3. Say radio calls and checklists **out loud**; the habit carries into the airplane.",
          "",
          `_${DISCLAIMER}_`,
        ]
          .filter((x) => x !== "")
          .join("\n");
      },
    });
  };

  const practiceScenario = async () => {
    if (busy) return;
    const topic =
      quizTopic.trim() ||
      (full.profile ? TRACK_LABEL[full.profile.goal] : "private pilot decision-making");
    push({
      role: "user",
      content: `Give me a practice scenario${quizTopic.trim() ? ` about ${quizTopic.trim()}` : ""}.`,
    });
    setBusy(true);
    const r = await scenarioGenerator({
      topic,
      level: level === "simple" ? "beginner" : "advanced",
      certificate: full.profile ? TRACK_LABEL[full.profile.goal] : "student pilot",
    });
    setBusy(false);
    if (r.ok) {
      push({
        role: "assistant",
        content: `### ${r.scenario.title}\n\n${r.scenario.situation}`,
        source: "ai",
        provider: r.provider,
        scenario: r.scenario,
      });
      return;
    }
    const match = quizTopic.trim() ? searchKnowledge(quizTopic, 3).map((h) => h.entry.id) : [];
    const pool = match.length
      ? PRACTICE_SCENARIOS.filter((p) => p.topics.some((t) => match.includes(t)))
      : [];
    const list = pool.length ? pool : PRACTICE_SCENARIOS;
    const sc = list[Math.floor(Math.random() * list.length)] ?? PRACTICE_SCENARIOS[0];
    if (!sc) return;
    push({
      role: "assistant",
      content: `### ${sc.title}\n\n${sc.situation}`,
      source: "local",
      scenario: {
        title: sc.title,
        situation: sc.situation,
        questions: sc.questions,
        teachingPoints: sc.teachingPoints,
      },
    });
  };

  const quizMe = async () => {
    if (busy) return;
    const topic = quizTopic.trim();
    push({ role: "user", content: topic ? `Quiz me on ${topic}.` : "Quiz me." });
    setBusy(true);
    let items: QuizState["items"] | null = null;
    let provider: string | undefined;
    if (aiOn && topic) {
      const r = await aiChat({
        service: "instructor",
        json: true,
        temperature: 0.5,
        system: `Write a 3-question multiple-choice quiz for a pilot in training on: ${topic}. Level: ${level}. Accurate per current FAA regulations and handbooks. Return JSON {"questions":[{"q":"","options":["","","",""],"answer":0,"why":""}]} with exactly 4 options each and "answer" the 0-based index.`,
        messages: [{ role: "user", content: `Quiz topic: ${topic}` }],
      });
      if (r.ok) {
        const j = parseJsonObject<{ questions?: unknown }>(r.text);
        const qs = Array.isArray(j?.questions) ? (j.questions as unknown[]) : [];
        const valid = qs
          .map((x) => x as { q?: unknown; options?: unknown; answer?: unknown; why?: unknown })
          .filter(
            (x) =>
              typeof x.q === "string" &&
              Array.isArray(x.options) &&
              x.options.length === 4 &&
              x.options.every((o) => typeof o === "string") &&
              typeof x.answer === "number" &&
              x.answer >= 0 &&
              x.answer <= 3,
          )
          .slice(0, 5)
          .map((x) => ({
            topic,
            item: {
              q: String(x.q),
              options: x.options as [string, string, string, string],
              answer: x.answer as 0 | 1 | 2 | 3,
              why: typeof x.why === "string" ? x.why : "",
            },
          }));
        if (valid.length >= 2) {
          items = valid;
          provider = r.provider;
        }
      }
    }
    setBusy(false);
    if (!items) items = quizFor(topic, 3).map((x) => ({ topic: x.entry.title, item: x.item }));
    push({
      role: "assistant",
      content: `### Quiz${topic ? `: ${topic}` : ""}\n\nPick an answer for each question.`,
      source: provider ? "ai" : "local",
      ...(provider ? { provider } : {}),
      quiz: { items, answers: items.map(() => null) },
    });
  };

  const checkridePrep = () => {
    const track = full.profile ? TRACK_LABEL[full.profile.goal] : "Private Pilot";
    void ask(
      `Help me prepare for my ${track} checkride: give me a structured plan covering paperwork and endorsements, the oral exam topics, the flight tasks and the final week.`,
      {
        display: `Help me prepare for my ${track} checkride.`,
        fallback: () => checkridePlan(track, isInstrumentTrack),
      },
    );
  };

  const answerQuiz = (msgId: string, qi: number, choice: number) =>
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== msgId || !m.quiz || m.quiz.answers[qi] !== null) return m;
        const answers = [...m.quiz.answers];
        answers[qi] = choice;
        return { ...m, quiz: { ...m.quiz, answers } };
      }),
    );

  const quick: { label: string; icon: typeof Sparkles; onClick: () => void }[] = [
    { label: "Explain this instrument", icon: Gauge, onClick: explainInstrument },
    { label: "Explain my mistake", icon: Target, onClick: explainMistakes },
    { label: "Give me a practice scenario", icon: Plane, onClick: () => void practiceScenario() },
    { label: "Quiz me on this topic", icon: BookOpenCheck, onClick: () => void quizMe() },
    { label: "Help me prepare for my checkride", icon: ClipboardCheck, onClick: checkridePrep },
  ];

  const contextPanel = (
    <div className="space-y-6">
      <section>
        <h2 className="label-caps mb-2 flex items-center justify-between gap-2">
          What I know about you
          <span className="font-sans text-[10px] tracking-normal normal-case">
            {activePieces.length}/{pieces.length} shared
          </span>
        </h2>
        {!hydrated ? (
          <p className="text-xs text-muted-foreground">Loading your training record…</p>
        ) : pieces.length ? (
          <ul
            className="space-y-3"
            title="Only the switched-on items are shared with the instructor."
          >
            {pieces.map((p) => (
              <li key={p.key} className="flex items-start gap-3">
                <Switch
                  checked={use[p.key]}
                  onCheckedChange={(v) => setUse({ ...use, [p.key]: v })}
                  aria-label={`Use ${p.label}`}
                  className="mt-0.5"
                />
                <div className="min-w-0">
                  <div className="label-caps !text-[9px]">{p.label}</div>
                  <p className={cn("text-xs", !use[p.key] && "text-muted-foreground line-through")}>
                    {p.value}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-muted-foreground">
            Nothing yet — finish{" "}
            <Link to="/onboarding" className="text-primary underline">
              onboarding
            </Link>
            , a test or a sim flight to personalise answers.
          </p>
        )}
      </section>
      <section className="space-y-3">
        <h2 className="label-caps">Tools</h2>
        <label className="block space-y-1">
          <span className="text-xs text-muted-foreground">Instrument to explain</span>
          <Select value={instrument} onValueChange={setInstrument}>
            <SelectTrigger aria-label="Instrument to explain">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {INSTRUMENTS.map((i) => (
                <SelectItem key={i.id} value={i.id}>
                  {i.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <label className="block space-y-1">
          <span className="text-xs text-muted-foreground">Quiz / scenario topic</span>
          <Input
            value={quizTopic}
            onChange={(e) => setQuizTopic(e.target.value.slice(0, 80))}
            placeholder="e.g. airspace, holding, icing"
          />
        </label>
      </section>
    </div>
  );

  const levelToggle = (
    <div
      className="inline-flex rounded-md border p-0.5"
      role="radiogroup"
      aria-label="Explanation level"
    >
      {(["simple", "advanced"] as const).map((l) => (
        <button
          key={l}
          type="button"
          role="radio"
          aria-checked={level === l}
          onClick={() => setLevel(l)}
          title={
            l === "simple"
              ? "Plain language and analogies."
              : "Technical detail, numbers and regulation references."
          }
          className={cn(
            "rounded px-2 py-0.5 text-[11px] font-medium capitalize",
            level === l
              ? "bg-primary/15 text-primary"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {l}
        </button>
      ))}
    </div>
  );

  return (
    <Page>
      <PageHeader
        eyebrow="Ground school"
        title="AI Flight Instructor"
        icon={Sparkles}
        description="Ask anything from regulations to aerodynamics, or get a scenario, quiz or checkride plan."
        actions={<AiStatusPill status={status} loading={loading} />}
      />
      <Notice
        tone="caution"
        className="-mt-2 mb-4"
        title="Educational use only — not a substitute for a CFI."
      >
        Answers are explanations for study — consult current FAA publications, the POH/AFM and a CFI
        for real-world operations.
        {!loading && !aiOn
          ? " No AI provider is active, so answers come from SkyReady's built-in knowledge base."
          : ""}
      </Notice>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="min-w-0">
          <details
            className="mb-3 lg:hidden"
            open={ctxOpen}
            onToggle={(e) => setCtxOpen((e.target as HTMLDetailsElement).open)}
          >
            <summary className="flex cursor-pointer list-none items-center justify-between py-1 text-xs font-medium text-muted-foreground [&::-webkit-details-marker]:hidden">
              <span className="flex items-center gap-2">
                <Brain className="size-3.5 text-primary" /> Personal context &amp; tools
              </span>
              <ChevronDown
                className={cn(
                  "size-4 text-muted-foreground transition-transform",
                  ctxOpen && "rotate-180",
                )}
              />
            </summary>
            <div className="pt-3 pb-2">{contextPanel}</div>
          </details>

          <div className="panel flex h-[calc(100dvh-15rem)] min-h-[480px] flex-col">
            <div
              ref={scrollRef}
              className="flex-1 space-y-4 overflow-y-auto p-4"
              aria-live="polite"
            >
              {messages.length === 0 ? (
                <div className="mx-auto max-w-lg py-6 text-center">
                  <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-primary/15">
                    <GraduationCap className="size-6 text-primary" />
                  </div>
                  <h2 className="text-lg font-semibold">
                    {name ? `Hi ${name}, ready to study?` : "Ready to study?"}
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Ask a question, or try one of these:
                  </p>
                  <div className="mt-4 flex flex-wrap justify-center gap-2">
                    {[
                      "What's the 1-2-3 rule?",
                      "Explain density altitude",
                      "What do I do if I lose comms in IMC?",
                    ].map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => void ask(s)}
                        className="rounded-full border px-3 py-1 text-xs text-muted-foreground hover:border-primary/50 hover:text-foreground"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
              {messages.map((m) =>
                m.role === "user" ? (
                  <div key={m.id} className="flex justify-end">
                    <div className="max-w-[85%] rounded-lg rounded-br-sm bg-primary/15 px-3.5 py-2 text-sm whitespace-pre-line">
                      {m.content}
                    </div>
                  </div>
                ) : (
                  <div key={m.id} className="flex gap-2.5">
                    <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/15">
                      <Sparkles className="size-3.5 text-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex items-center gap-1.5">
                        <span className="text-xs font-semibold">Instructor</span>
                        <span className="text-[10px] text-muted-foreground">
                          ·{" "}
                          {m.source === "ai"
                            ? (AI_PROVIDER_LABEL[m.provider ?? ""] ?? "AI")
                            : "Knowledge base"}
                        </span>
                      </div>
                      <div className="rounded-lg rounded-tl-sm border bg-muted/30 px-3.5 py-3">
                        <Markdown text={m.content} />
                        {m.scenario ? <ScenarioBlock s={m.scenario} /> : null}
                        {m.quiz ? (
                          <QuizBlock quiz={m.quiz} onAnswer={(qi, c) => answerQuiz(m.id, qi, c)} />
                        ) : null}
                        {m.scenario || m.quiz ? (
                          <p className="mt-3 text-[11px] text-muted-foreground italic">
                            {DISCLAIMER}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ),
              )}
              {busy ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="size-3.5 animate-spin" /> Thinking…
                </div>
              ) : null}
            </div>

            <div className="border-t p-3">
              <div className="mb-2 flex gap-1.5 overflow-x-auto pb-1">
                {quick.map((q) => (
                  <button
                    key={q.label}
                    type="button"
                    onClick={q.onClick}
                    disabled={busy}
                    className="flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs text-muted-foreground hover:border-primary/50 hover:text-foreground disabled:opacity-50"
                  >
                    <q.icon className="size-3.5" /> {q.label}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <Textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value.slice(0, 2000))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      send();
                    }
                  }}
                  placeholder="Ask your instructor…"
                  title="Enter to send, Shift+Enter for a new line"
                  className="max-h-40 min-h-11 resize-none text-sm"
                  rows={1}
                  aria-label="Message"
                />
                <Button
                  onClick={send}
                  disabled={busy || !input.trim()}
                  size="icon"
                  className="h-11 w-11 shrink-0"
                  aria-label="Send"
                >
                  <Send />
                </Button>
              </div>
              <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
                <span className="flex items-center gap-2">
                  {levelToggle}
                  <span className="hidden sm:inline">
                    {activePieces.length} context item{activePieces.length === 1 ? "" : "s"} shared
                  </span>
                </span>
                {messages.length ? (
                  <button
                    type="button"
                    onClick={() => setMessages([])}
                    className="flex items-center gap-1 hover:text-foreground"
                  >
                    <Trash2 className="size-3" /> Clear chat
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        </div>
        <div className="hidden lg:block">{contextPanel}</div>
      </div>
    </Page>
  );
}

function ScenarioBlock({ s }: { s: GeneratedScenario }) {
  const [show, setShow] = useState(false);
  return (
    <div className="mt-3 space-y-3">
      {s.questions.length ? (
        <div>
          <div className="label-caps mb-1">Think it through</div>
          <ol className="list-decimal space-y-1 pl-5 text-sm">
            {s.questions.map((q, i) => (
              <li key={i}>{q}</li>
            ))}
          </ol>
        </div>
      ) : null}
      {s.teachingPoints.length ? (
        show ? (
          <div className="rounded border border-ok/25 bg-ok/5 p-3">
            <div className="label-caps mb-1 flex items-center gap-1.5 !text-ok">
              <Lightbulb className="size-3.5" /> Teaching points
            </div>
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {s.teachingPoints.map((t, i) => (
                <li key={i}>{t}</li>
              ))}
            </ul>
          </div>
        ) : (
          <Button size="sm" variant="outline" onClick={() => setShow(true)}>
            <Lightbulb /> Show teaching points
          </Button>
        )
      ) : null}
    </div>
  );
}

function QuizBlock({
  quiz,
  onAnswer,
}: {
  quiz: QuizState;
  onAnswer: (qi: number, choice: number) => void;
}) {
  const answered = quiz.answers.filter((a) => a !== null).length;
  const correct = quiz.items.filter((it, i) => quiz.answers[i] === it.item.answer).length;
  return (
    <div className="mt-3 space-y-4">
      {quiz.items.map(({ item, topic }, qi) => {
        const a = quiz.answers[qi] ?? null;
        return (
          <div key={qi} className="space-y-2">
            <p className="text-sm font-medium">
              {qi + 1}. {item.q}{" "}
              <span className="text-[10px] text-muted-foreground uppercase">· {topic}</span>
            </p>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {item.options.map((o, oi) => {
                const isRight = oi === item.answer;
                const chosen = a === oi;
                return (
                  <button
                    key={oi}
                    type="button"
                    disabled={a !== null}
                    onClick={() => onAnswer(qi, oi)}
                    className={cn(
                      "flex items-start gap-2 rounded-md border px-2.5 py-1.5 text-left text-xs",
                      a === null && "hover:border-primary/50",
                      a !== null && isRight && "border-ok/50 bg-ok/10",
                      chosen && !isRight && "border-warning/50 bg-warning/10",
                    )}
                  >
                    {a !== null && isRight ? (
                      <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-ok" />
                    ) : chosen ? (
                      <XCircle className="mt-0.5 size-3.5 shrink-0 text-warning" />
                    ) : (
                      <span className="mt-0.5 size-3.5 shrink-0 rounded-full border" />
                    )}
                    {o}
                  </button>
                );
              })}
            </div>
            {a !== null && item.why ? (
              <p className={cn("text-xs", a === item.answer ? "text-ok" : "text-foreground/80")}>
                {a === item.answer ? "Correct. " : "Not quite. "}
                {item.why}
              </p>
            ) : null}
          </div>
        );
      })}
      {answered === quiz.items.length ? (
        <p className="rounded border bg-card px-3 py-2 text-sm font-semibold">
          Score: {correct}/{quiz.items.length}{" "}
          {correct === quiz.items.length
            ? "— excellent!"
            : "— review the explanations above, then try again."}
        </p>
      ) : null}
    </div>
  );
}
