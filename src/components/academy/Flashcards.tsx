import { useMemo, useState } from "react";
import { Check, RotateCcw, Shuffle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState, Meter } from "@/components/app/page";
import type { Flashcard } from "@/lib/content/types";
import { actions, useStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { Segmented } from "./diagrams/controls";

export function Flashcards({ cards }: { cards: Flashcard[] }) {
  const known = useStore((s) => s.flashcardsKnown);
  const [filter, setFilter] = useState<"all" | "unknown">("all");
  const [flipped, setFlipped] = useState<Record<string, boolean>>({});
  const [order, setOrder] = useState<string[] | null>(null);

  const knownCount = cards.filter((c) => known[c.id]).length;
  const list = useMemo(() => {
    const byId = new Map(cards.map((c) => [c.id, c]));
    const base = order ? order.map((id) => byId.get(id)).filter((c): c is Flashcard => !!c) : cards;
    return filter === "unknown" ? base.filter((c) => !known[c.id]) : base;
  }, [cards, order, filter, known]);

  if (!cards.length) return <EmptyState title="No flashcards for this module" />;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="w-full max-w-xs">
          <Meter value={(knownCount / cards.length) * 100} label={`${knownCount} of ${cards.length} marked known`} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            value={filter}
            onChange={setFilter}
            options={[
              { value: "all", label: `All (${cards.length})` },
              { value: "unknown", label: `Still learning (${cards.length - knownCount})` },
            ]}
          />
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              const ids = cards.map((c) => c.id);
              for (let i = ids.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                const t = ids[i] as string;
                ids[i] = ids[j] as string;
                ids[j] = t;
              }
              setOrder(ids);
              setFlipped({});
            }}
          >
            <Shuffle className="size-3.5" />
            Shuffle
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setFlipped({})}>
            <RotateCcw className="size-3.5" />
            Reset
          </Button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">Tap a card to flip it. Mark the ones you know — they are saved to your training record.</p>
      {list.length === 0 ? (
        <EmptyState icon={Check} title="All cards marked known" description="Switch to 'All' to review them again." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((c) => {
            const isFlipped = !!flipped[c.id];
            const isKnown = !!known[c.id];
            return (
              <div key={c.id} className="flex flex-col">
                <button
                  type="button"
                  onClick={() => setFlipped((f) => ({ ...f, [c.id]: !f[c.id] }))}
                  className="group text-left"
                  style={{ perspective: "1000px" }}
                  aria-label={isFlipped ? "Show question" : "Show answer"}
                >
                  <div
                    className="grid transition-transform duration-500"
                    style={{ transformStyle: "preserve-3d", transform: isFlipped ? "rotateY(180deg)" : "none" }}
                  >
                    <div
                      className={cn("panel flex min-h-36 flex-col justify-between p-4 [grid-area:1/1] group-hover:border-primary/50", isKnown && "border-ok/40")}
                      style={{ backfaceVisibility: "hidden" }}
                    >
                      <span className="label-caps">Question</span>
                      <p className="my-3 text-sm font-semibold leading-relaxed">{c.front}</p>
                      <span className="text-[10px] text-muted-foreground">Tap to reveal</span>
                    </div>
                    <div
                      className="flex min-h-36 flex-col justify-between rounded-lg border border-primary/40 bg-primary/5 p-4 [grid-area:1/1]"
                      style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
                    >
                      <span className="label-caps text-primary">Answer</span>
                      <p className="my-3 text-sm leading-relaxed">{c.back}</p>
                      <span className="text-[10px] text-muted-foreground">Tap to flip back</span>
                    </div>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => actions.toggleFlashcard(c.id)}
                  className={cn(
                    "mt-1.5 inline-flex items-center justify-center gap-1.5 rounded-md border px-2 py-1.5 text-xs font-medium transition-colors",
                    isKnown ? "border-ok/40 bg-ok/10 text-ok" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Check className="size-3.5" />
                  {isKnown ? "Known" : "Mark as known"}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
