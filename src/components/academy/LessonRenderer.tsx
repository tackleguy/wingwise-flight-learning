/**
 * Renders lesson content blocks (see LessonBlock in src/lib/content/types.ts): text, lists,
 * tables, callouts, inline knowledge checks, interactive diagrams, graded exercises and practice
 * links into the rest of the platform.
 */
import { useState } from "react";
import {
  AlertOctagon,
  AlertTriangle,
  BookMarked,
  Info,
  Lightbulb,
  MousePointerClick,
  PenLine,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CalloutTone, LessonBlock, QuizQuestion } from "@/lib/content/types";
import { cn } from "@/lib/utils";
import { getDiagram } from "./diagrams";
import { getExercise } from "./exercises";
import { Choices, Feedback } from "./exercises/shared";
import { PracticeCard } from "./PracticeLink";

const CALLOUT: Record<CalloutTone, { cls: string; icon: typeof Info; label: string }> = {
  info: { cls: "border-primary/50 [&_.ct]:text-primary", icon: Info, label: "Note" },
  tip: { cls: "border-ok/50 [&_.ct]:text-ok", icon: Lightbulb, label: "Tip" },
  caution: {
    cls: "border-caution/60 bg-caution/[0.04] [&_.ct]:text-caution",
    icon: AlertTriangle,
    label: "Caution",
  },
  warning: {
    cls: "border-warning/60 bg-warning/[0.04] [&_.ct]:text-warning",
    icon: AlertOctagon,
    label: "Warning",
  },
};

export function LessonRenderer({
  blocks,
  className,
}: {
  blocks: LessonBlock[];
  className?: string;
}) {
  return (
    <div className={cn("space-y-5", className)}>
      {blocks.map((b, i) => (
        <Block key={i} block={b} />
      ))}
    </div>
  );
}

function Block({ block }: { block: LessonBlock }) {
  switch (block.type) {
    case "h":
      return (
        <h3 className="flex items-center gap-2 pt-4 text-lg font-semibold tracking-tight first:pt-0">
          {block.text}
        </h3>
      );
    case "p":
      return <p className="text-base leading-[1.75] text-foreground/90">{block.text}</p>;
    case "list": {
      const Tag = block.ordered ? "ol" : "ul";
      return (
        <Tag
          className={cn(
            "space-y-1.5 pl-1 text-base leading-7 text-foreground/90",
            block.ordered ? "list-none [counter-reset:li]" : "",
          )}
        >
          {block.items.map((it, i) => (
            <li key={i} className="flex gap-2.5">
              {block.ordered ? (
                <span className="w-5 shrink-0 text-right text-muted-foreground tabular">
                  {i + 1}.
                </span>
              ) : (
                <span className="mt-[13px] size-1 shrink-0 rounded-full bg-muted-foreground" />
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
        <div className={cn("flex gap-3 rounded-r-md border-l-2 py-1.5 pr-3 pl-4", c.cls)}>
          <Icon className="ct mt-1 size-4 shrink-0" />
          <div className="min-w-0 text-[15px] leading-relaxed">
            <p className="ct font-semibold">{block.title ?? c.label}</p>
            <p className="mt-0.5 text-foreground/85">{block.text}</p>
          </div>
        </div>
      );
    }
    case "table":
      return (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] text-sm">
            <thead className="border-b">
              <tr>
                {block.headers.map((hd) => (
                  <th
                    key={hd}
                    className="py-2 pr-4 text-left text-xs font-medium text-muted-foreground"
                  >
                    {hd}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {block.rows.map((r, i) => (
                <tr key={i} className="align-top">
                  {r.map((c, j) => (
                    <td
                      key={j}
                      className={cn("py-2 pr-4 leading-relaxed", j === 0 && "font-medium")}
                    >
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
    <figure className="py-2">
      <div className="rounded-lg border p-3 sm:p-4">
        <C />
      </div>
      <figcaption className="mt-2 flex gap-1.5 text-xs leading-relaxed text-muted-foreground">
        <MousePointerClick className="mt-0.5 size-3.5 shrink-0 text-cyan" aria-hidden />
        <span>
          <span className="font-medium text-foreground/80">{d.title}.</span> {caption}
        </span>
      </figcaption>
    </figure>
  );
}

function ExerciseBlock({ id, title }: { id: string; title: string }) {
  const e = getExercise(id);
  if (!e) return null;
  const C = e.component;
  return (
    <section className="py-2">
      <p className="mb-2 flex items-center gap-2 text-sm font-semibold">
        <PenLine className="size-4 text-cyan" aria-hidden />
        <span className="text-cyan">Exercise</span>
        <span className="min-w-0 truncate">{title}</span>
      </p>
      <div className="rounded-lg border p-3 sm:p-4">
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
    <div className="rounded-lg border p-4">
      <div className="space-y-3">
        <p className="flex items-center justify-between gap-2 text-xs">
          <span className="flex items-center gap-1.5 font-medium text-primary">
            <BookMarked className="size-3.5" aria-hidden />
            Knowledge check
          </span>
          {question.reference ? (
            <span className="text-[10px] text-muted-foreground">{question.reference}</span>
          ) : null}
        </p>
        {question.context ? (
          <pre className="avionics-screen overflow-x-auto p-2.5 font-mono text-xs whitespace-pre-wrap text-ok">
            {question.context}
          </pre>
        ) : null}
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
                {tries >= 2
                  ? question.explanation
                  : "Re-read the section above, then pick another answer."}
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
