import type { ExamAttempt } from "@/lib/store";
import { Pill, formatDate, formatDuration } from "@/components/app/page";
import { cn } from "@/lib/utils";

export function HistoryTable({ rows }: { rows: ExamAttempt[] }) {
  return (
    <div className="panel overflow-x-auto">
      <table className="w-full min-w-[560px] text-sm">
        <thead>
          <tr className="border-b text-left">
            <th className="label-caps px-4 py-2.5">Date</th>
            <th className="label-caps px-4 py-2.5">Exam</th>
            <th className="label-caps px-4 py-2.5">Mode</th>
            <th className="label-caps px-4 py-2.5 text-right">Score</th>
            <th className="label-caps px-4 py-2.5 text-right">Correct</th>
            <th className="label-caps px-4 py-2.5 text-right">Time</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((e) => (
            <tr key={e.id} className="border-b border-border/60 last:border-0">
              <td className="whitespace-nowrap px-4 py-2.5 text-xs text-muted-foreground">{formatDate(e.date)}</td>
              <td className="px-4 py-2.5">{e.title}</td>
              <td className="px-4 py-2.5">
                <Pill tone={e.mode === "timed" ? "caution" : "cyan"}>{e.mode}</Pill>
              </td>
              <td className="px-4 py-2.5 text-right">
                <span className={cn("font-mono font-semibold tabular", e.passed ? "text-ok" : "text-warning")}>{Math.round(e.scorePct)}%</span>
              </td>
              <td className="px-4 py-2.5 text-right font-mono text-xs tabular">
                {e.correct}/{e.total}
              </td>
              <td className="px-4 py-2.5 text-right font-mono text-xs text-muted-foreground tabular">{formatDuration(e.timeUsedSec)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
