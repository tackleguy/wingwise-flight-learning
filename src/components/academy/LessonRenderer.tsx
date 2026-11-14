/**
 * Renders lesson content blocks (see LessonBlock in src/lib/content/types.ts): text, lists,
 * tables, callouts, inline knowledge checks, interactive diagrams, graded exercises and practice
 * links into the rest of the platform.
 */
import { useState } from "react";
import { AlertOctagon, AlertTriangle, BookMarked, Info, Lightbulb, MousePointerClick, PenLine, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CalloutTone, LessonBlock, QuizQuestion } from "@/lib/content/types";
import { cn } from "@/lib/utils";
import { getDiagram } from "./diagrams";
import { getExercise } from "./exercises";
import { Choices, Feedback } from "./exercises/shared";
import { PracticeCard } from "./PracticeLink";

const CALLOUT: Record<CalloutTone, { cls: string; icon: typeof Info; label: string }> = {
  info: { cls: "border-primary/30 bg-primary/5 [&_.ct]:text-primary", icon: Info, label: "Note" },
  tip: { cls: "border-ok/30 bg-ok/5 [&_.ct]:text-ok", icon: Lightbulb, label: "Tip" },
  caution: { cls: "border-caution/35 bg-caution/5 [&_.ct]:text-caution", icon: AlertTriangle, label: "Caution" },
  warning: { cls: "border-warning/40 bg-warning/5 [&_.ct]:text-warning", icon: AlertOctagon, label: "Warning" },
};

export function LessonRenderer({ blocks, className }: { blocks: LessonBlock[]; className?: string }) {
  return (
    <div className={cn("space-y-4", className)}>
      {blocks.map((b, i) => (
        <Block key={i} block={b} />
      ))}
    </div>
  );
}

function Block({ block }: { block: LessonBlock }) {
  switch (block.type) {
    case "h":
      return <h3 className="flex items-center gap-2 pt-3 text-lg font-semibold tracking-tight first:pt-0">{block.text}</h3>;
    case "p":
      return <p className="text-[15px] leading-7 text-foreground/90">{block.text}</p>;
    case "list": {
      const Tag = block.ordered ? "ol" : "ul";
      return (
        <Tag className={cn("space-y-1.5 pl-1 text-[15px] leading-7 text-foreground/90", block.ordered ? "list-none [counter-reset:li]" : "")}>
          {block.items.map((it, i) => (
            <li key={i} className="flex gap-2.5">
              {block.ordered ? (
                <span className="mt-1 flex size-5 shrink-0 items-center justify-center rounded bg-primary/15 font-mono text-[11px] font-semibold text-primary">{i + 1}</span>
              ) : (
                <span className="mt-[11px] size-1.5 shrink-0 rounded-full bg-primary" />
              )}
              <span className="min-w-0">{it}</span>
            </li>
          ))}
        </Tag>
      );
    }
    case "callout": {
      const c = CALLOUT[block.tone];
      const Icon = c.icon;
      return (
        <div className={cn("flex gap-3 rounded-md border px-4 py-3", c.cls)}>
          <Icon className="ct mt-0.5 size-4 shrink-0" />
          <div className="min-w-0 text-sm leading-relaxed">
            <p className="ct font-semibold">{block.title ?? c.label}</p>
            <p className="mt-0.5 text-foreground/85">{block.text}</p>
          </div>
        </div>
      );
    }
    case "table":
      return (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full min-w-[480px] text-sm">
            <thead className="bg-muted/50">
              <tr>
                {block.headers.map((hd) => (
                  <th key={hd} className="px-3 py-2 text-left text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    {hd}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {block.rows.map((r, i) => (
                <tr key={i} className="align-top hover:bg-muted/20">
                  {r.map((c, j) => (
                    <td key={j} className={cn("px-3 py-2 leading-relaxed", j === 0 && "font-medium")}>
                      {c}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "diagram":
      return <DiagramBlock id={block.id} caption={block.caption} />;
    case "check":
      return <KnowledgeCheck question={block.question} />;
    case "exercise":
      return <ExerciseBlock id={block.id} title={block.title} />;
    case "practice":
      return <PracticeCard to={block.to} label={block.label} text={block.text} />;
  }
}

function DiagramBlock({ id, caption }: { id: string; caption: string }) {
  const d = getDiagram(id);
  if (!d) return null;
  const C = d.component;
  return (
    <figure className="panel overflow-hidden">
      <div className="flex items-center justify-between gap-2 border-b px-4 py-2">
        <span className="label-caps flex items-center gap-1.5">
          <MousePointerClick className="size-3.5 text-cyan" />
          Interactive · {d.title}
        </span>
      </div>
      <div className="p-3 sm:p-4">
        <C />
      </div>
      <figcaption className="border-t bg-muted/20 px-4 py-2 text-xs leading-relaxed text-muted-foreground">{caption}</figcaption>
    </figure>
  );
}

function ExerciseBlock({ id, title }: { id: string; title: string }) {
  const e = getExercise(id);
  if (!e) return null;
  const C = e.component;
  return (
    <section className="panel overflow-hidden border-cyan/25">
      <div className="flex items-center gap-2 border-b bg-cyan/5 px-4 py-2">
        <PenLine className="size-3.5 text-cyan" />
        <span className="label-caps text-cyan">Exercise</span>
        <span className="truncate text-sm font-semibold">{title}</span>
      </div>
      <div className="p-3 sm:p-4">
        <C />
      </div>
    </section>
  );
}

/** Inline knowledge check: answer → immediate right/wrong with explanation; retry allowed. */
export function KnowledgeCheck({ question }: { question: QuizQuestion }) {
  const [sel, setSel] = useState<number | null>(null);
  const [tries, setTries] = useState(0);
  const correct = sel === question.answer;
  return (
    <div className="rounded-lg border border-primary/25 bg-card">
      <div className="flex items-center justify-between gap-2 border-b px-4 py-2">
        <span className="label-caps flex items-center gap-1.5 text-primary">
          <BookMarked className="size-3.5" />
          Knowledge check
        </span>
        {question.reference ? <span className="text-[10px] text-muted-foreground">{question.reference}</span> : null}
      </div>
      <div className="space-y-3 p-4">
        {question.context ? <pre className="avionics-screen overflow-x-auto p-2.5 font-mono text-xs whitespace-pre-wrap text-ok">{question.context}</pre> : null}
        <p className="text-sm font-medium">{question.prompt}</p>
        <Choices
          choices={question.choices}
          selected={sel}
          answer={question.answer}
          revealed={sel !== null && correct}
          onSelect={(i) => {
            setSel(i);
            setTries((t) => t + 1);
          }}
          columns={question.choices.length > 2 ? 1 : 2}
        />
        {sel !== null ? (
          correct ? (
            <Feedback ok title={tries === 1 ? "Correct" : `Correct (attempt ${tries})`}>
              {question.explanation}
            </Feedback>
          ) : (
            <div className="space-y-2">
              <Feedback ok={false} title="Not quite — think it through and try again">
                {question.choices[sel] ? <>You chose "{question.choices[sel]}". </> : null}
                {tries >= 2 ? question.explanation : "Re-read the section above, then pick another answer."}
              </Feedback>
              <Button size="sm" variant="outline" onClick={() => setSel(null)}>
                <RotateCcw className="size-3.5" />
                Try again
              </Button>
            </div>
          )
        ) : null}
      </div>
    </div>
  );
}
