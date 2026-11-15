/**
 * <ExplainCard>: the "explain this instrument" card. Plain-language teaching text for one
 * instrument or control (from ./explain.ts) with the present reading interpreted live.
 */
import { useEffect, useRef, useState } from "react";
import type { Sim } from "@/core/sim";
import { EXPLAIN } from "./explain";
import type { InstrumentId } from "./ids";

export interface ExplainCardProps {
  id: InstrumentId;
  sim: Sim;
  onClose: () => void;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-3">
      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-sky-300/90">{title}</h3>
      <div className="mt-1 text-[13.5px] leading-relaxed text-slate-200">{children}</div>
    </section>
  );
}

export function ExplainCard({ id, sim, onClose }: ExplainCardProps) {
  const x = EXPLAIN[id];
  const box = useRef<HTMLDivElement>(null);
  const read = () => {
    try {
      return x.reading(sim);
    } catch {
      return "";
    }
  };
  const [reading, setReading] = useState(read);
  // The reading follows the instrument a few times a second (never per frame).
  useEffect(() => {
    setReading(read());
    const t = setInterval(() => setReading(read()), 400);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, sim]);
  useEffect(() => {
    box.current?.scrollTo?.({ top: 0 });
  }, [id]);

  return (
    <div
      ref={box}
      role="dialog"
      aria-label={`About the ${x.title}`}
      data-explain-card={id}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onClose();
        }
      }}
      className="pointer-events-auto absolute left-2 right-2 top-2 z-30 mx-auto max-h-[max(calc(100%-var(--teachx-panel-height,0px)-16px),min(62%,24rem))] min-h-40 max-w-xl overflow-y-auto overscroll-contain rounded-xl border border-white/15 bg-slate-950/92 p-4 text-slate-100 shadow-2xl backdrop-blur sm:left-4 sm:right-auto sm:top-4 sm:mx-0 sm:w-[30rem]"
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-medium uppercase tracking-wider text-slate-400">{x.group}</div>
          <h2 className="text-lg font-semibold leading-tight text-white">{x.title}</h2>
        </div>
        <button type="button" onClick={onClose} aria-label="Close the explanation" className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-white/15 bg-white/5 text-lg text-slate-200 hover:bg-white/15">
          ×
        </button>
      </div>
      <p className="mt-2 text-[14px] leading-relaxed text-slate-100">{x.what}</p>

      {reading ? (
        <div className="mt-3 rounded-lg border border-sky-400/30 bg-sky-500/10 p-3" aria-live="polite">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-sky-300">Right now</div>
          <div className="mt-1 text-[14px] leading-relaxed text-white" data-explain-reading="1">
            {reading}
          </div>
        </div>
      ) : null}

      <Section title="How to read it">
        <ul className="list-disc space-y-1 pl-5">
          {x.howToRead.map((t, i) => (
            <li key={i}>{t}</li>
          ))}
        </ul>
      </Section>
      <Section title="How it works">{x.howItWorks}</Section>
      <Section title="Errors and limits">
        <ul className="list-disc space-y-1 pl-5">
          {x.errors.map((t, i) => (
            <li key={i}>{t}</li>
          ))}
        </ul>
      </Section>
      <Section title="If it fails">{x.failure}</Section>
      <Section title="Tip">
        <span className="text-amber-200">{x.tip}</span>
      </Section>
      <p className="mt-4 border-t border-white/10 pt-2 text-[11px] leading-snug text-slate-400">
        Numbers are typical for a Cessna 172P-class trainer and are for learning only. Always use the handbook of the aircraft you actually fly. This simulator is a learning aid, not an approved training device.
      </p>
    </div>
  );
}
