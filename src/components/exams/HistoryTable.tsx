import type { ExamAttempt } from "@/lib/store";
import { formatDate, formatDuration } from "@/components/app/page";
import { cn } from "@/lib/utils";

export function HistoryTable({ rows }: { rows: ExamAttempt[] }) {
  return (
    <div className="overflow-x-auto border-y">
      <table className="w-full min-w-[560px] text-sm">
        <thead>
          <tr className="border-b text-left">
            <th className="px-3 py-2 text-xs font-medium text-muted-foreground">Date</th>
            <th className="px-3 py-2 text-xs font-medium text-muted-foreground">Exam</th>
            <th className="px-3 py-2 text-xs font-medium text-muted-foreground">Mode</th>
            <th className="px-3 py-2 text-xs font-medium text-muted-foreground text-right">
              Score
            </th>
            <th className="px-3 py-2 text-xs font-medium text-muted-foreground text-right">
              Correct
            </th>
            <th className="px-3 py-2 text-xs font-medium text-muted-foreground text-right">Time</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((e) => (
            <tr key={e.id} className="border-b border-border/60 last:border-0">
              <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">
                {formatDate(e.date)}
              </td>
              <td className="px-3 py-2">{e.title}</td>
              <td className="px-3 py-2">
                <span className="text-xs text-muted-foreground capitalize">{e.mode}</span>
              </td>
              <td className="px-3 py-2 text-right">
                <span
                  className={cn(
                    "font-mono font-semibold tabular",
                    e.passed ? "text-ok" : "text-warning",
                  )}
                >
                  {Math.round(e.scorePct)}%
                </span>
              </td>
              <td className="px-3 py-2 text-right font-mono text-xs tabular">
                {e.correct}/{e.total}
              </td>
              <td className="px-3 py-2 text-right font-mono text-xs text-muted-foreground tabular">
                {formatDuration(e.timeUsedSec)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
