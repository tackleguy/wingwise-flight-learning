/**
 * Horizontal bar chart of score % by subject, with the 70% passing line. Single series:
 * one hue, no legend; the per-bar tooltip and the adjacent table give exact values.
 */
import { Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export interface SubjectDatum {
  subject: string;
  pct: number;
  correct: number;
  total: number;
}

function short(s: string): string {
  return s.length > 20 ? `${s.slice(0, 18)}…` : s;
}

export function SubjectChart({ data, passPct = 70 }: { data: SubjectDatum[]; passPct?: number }) {
  const height = Math.max(120, data.length * 30 + 36);
  return (
    <div style={{ height }} className="w-full" role="img" aria-label={`Score by subject: ${data.map((d) => `${d.subject} ${Math.round(d.pct)}%`).join(", ")}`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 0 }} barCategoryGap={8}>
          <CartesianGrid horizontal={false} stroke="var(--color-border)" strokeOpacity={0.5} />
          <XAxis
            type="number"
            domain={[0, 100]}
            ticks={[0, 25, 50, 70, 100]}
            tickFormatter={(v: number) => `${v}%`}
            tick={{ fill: "var(--color-muted-foreground)", fontSize: 11 }}
            axisLine={{ stroke: "var(--color-border)" }}
            tickLine={false}
          />
          <YAxis
            type="category"
            dataKey="subject"
            width={128}
            tickFormatter={short}
            tick={{ fill: "var(--color-foreground)", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            cursor={{ fill: "var(--color-accent)", fillOpacity: 0.35 }}
            content={({ active, payload }) => {
              const d = active && payload && payload[0] ? (payload[0].payload as SubjectDatum) : null;
              if (!d) return null;
              return (
                <div className="rounded-md border bg-popover px-2.5 py-1.5 text-xs shadow-md">
                  <div className="font-semibold">{d.subject}</div>
                  <div className="font-mono tabular text-muted-foreground">
                    {Math.round(d.pct)}% · {d.correct}/{d.total} correct
                  </div>
                </div>
              );
            }}
          />
          <ReferenceLine
            x={passPct}
            stroke="var(--color-caution)"
            strokeDasharray="4 3"
            label={{ value: "Pass 70%", position: "top", fill: "var(--color-muted-foreground)", fontSize: 10 }}
          />
          <Bar dataKey="pct" fill="var(--color-primary)" radius={[0, 4, 4, 0]} barSize={12} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
