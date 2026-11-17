import { Link } from "@tanstack/react-router";
import {
  CheckCircle2,
  ClipboardCheck,
  GraduationCap,
  Notebook,
  Radio,
  RotateCcw,
  Sparkles,
  XCircle,
} from "lucide-react";
import type { ScenarioDef } from "@/sim/scenarios";
import { getPerf } from "@/lib/data/aircraft-perf";
import { Button } from "@/components/ui/button";
import { formatDuration } from "@/components/app/page";
import { cn } from "@/lib/utils";

export interface DebriefData {
  flightId: string;
  score: number;
  results: { id: string; text: string; met: boolean; detail: string; score: number }[];
  feedback: string[];
  crashed: string;
  durationSec: number;
  distanceNm: number;
  landings: number;
  maxAlt: number;
  realSec: number;
  atc?: {
    score: number;
    grade: string;
    transmissions: number;
    engine: "ai" | "scripted";
    airport: string;
    destination?: string;
  };
}

function grade(score: number) {
  if (score >= 90) return { label: "Excellent", tone: "text-ok" };
  if (score >= 75) return { label: "Proficient", tone: "text-ok" };
  if (score >= 60) return { label: "Satisfactory", tone: "text-primary" };
  if (score >= 40) return { label: "Needs practice", tone: "text-caution" };
  return { label: "Unsatisfactory", tone: "text-warning" };
}

export function Debrief({
  data,
  scenario,
  aircraftId,
  checkrideId,
  onRetry,
  onChoose,
}: {
  data: DebriefData;
  scenario: ScenarioDef;
  aircraftId: string;
  checkrideId?: string | undefined;
  onRetry: () => void;
  onChoose: () => void;
}) {
  const g = grade(data.score);
  const r = 46;
  const circ = 2 * Math.PI * r;
  return (
    <div className="absolute inset-0 z-40 flex justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm">
      <div className="panel animate-fade-up my-auto h-fit w-full max-w-3xl">
        <div className="flex flex-col gap-4 border-b p-5 sm:flex-row sm:items-center">
          <svg viewBox="0 0 110 110" className="size-28 shrink-0">
            <circle cx="55" cy="55" r={r} fill="none" stroke="var(--color-muted)" strokeWidth="9" />
            <circle
              cx="55"
              cy="55"
              r={r}
              fill="none"
              stroke={
                data.score >= 75
                  ? "var(--ok)"
                  : data.score >= 60
                    ? "var(--primary)"
                    : data.score >= 40
                      ? "var(--caution)"
                      : "var(--warning)"
              }
              strokeWidth="9"
              strokeLinecap="round"
              strokeDasharray={`${(data.score / 100) * circ} ${circ}`}
              transform="rotate(-90 55 55)"
            />
            <text
              x="55"
              y="60"
              textAnchor="middle"
              className="fill-foreground font-mono text-[24px] font-bold"
            >
              {Math.round(data.score)}
            </text>
          </svg>
          <div className="min-w-0">
            <p className="label-caps text-primary">Flight debrief · saved to your logbook</p>
            <h2 className="text-xl font-bold">{scenario.title}</h2>
            <p className={cn("text-sm font-semibold", g.tone)}>{g.label}</p>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs text-muted-foreground">
              <span>{getPerf(aircraftId).shortName}</span>
              <span>Sim time {formatDuration(data.durationSec)}</span>
              <span>{data.distanceNm.toFixed(1)} nm</span>
              <span>
                {data.landings} landing{data.landings === 1 ? "" : "s"}
              </span>
              <span>Max {Math.round(data.maxAlt).toLocaleString()} ft</span>
            </div>
          </div>
        </div>
        {data.crashed ? (
          <div className="border-b bg-warning/10 px-5 py-3 text-sm text-warning">
            <strong>Crash:</strong> {data.crashed}
          </div>
        ) : null}
        <div className="grid gap-5 p-5 md:grid-cols-2">
          <div>
            <p className="label-caps mb-2">Objectives</p>
            <ul className="space-y-2">
              {data.results.map((r) => (
                <li key={r.id} className="flex gap-2 text-sm">
                  {r.met ? (
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-ok" />
                  ) : (
                    <XCircle className="mt-0.5 size-4 shrink-0 text-warning" />
                  )}
                  <div className="min-w-0">
                    <p className="font-medium">{r.text}</p>
                    <p className="text-xs text-muted-foreground">{r.detail}</p>
                    <div className="mt-1 h-1 overflow-hidden rounded bg-muted">
                      <div
                        className={cn(
                          "h-full",
                          r.met ? "bg-ok" : r.score > 0.5 ? "bg-caution" : "bg-warning",
                        )}
                        style={{ width: `${Math.round(r.score * 100)}%` }}
                      />
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="label-caps mb-2">Instructor feedback</p>
            <ul className="space-y-2 text-sm leading-relaxed text-foreground/90">
              {data.feedback.map((f, i) => (
                <li key={i} className="rounded border bg-muted/30 px-3 py-2">
                  {f}
                </li>
              ))}
            </ul>
            {data.atc ? (
              <div className="mt-4 rounded border bg-muted/30 p-3 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 font-semibold">
                    <Radio className="size-3.5 text-primary" /> Radio communications (
                    {data.atc.airport}
                    {data.atc.destination ? ` → ${data.atc.destination}` : ""})
                  </span>
                  <span
                    className={cn(
                      "font-mono font-bold",
                      data.atc.score >= 80
                        ? "text-ok"
                        : data.atc.score >= 60
                          ? "text-caution"
                          : "text-warning",
                    )}
                  >
                    {Math.round(data.atc.score)}% · {data.atc.grade}
                  </span>
                </div>
                <p className="mt-1 text-muted-foreground">
                  {data.atc.transmissions} pilot call
                  {data.atc.transmissions === 1 ? "" : "s"} ·{" "}
                  {data.atc.engine === "ai" ? "Communicator AI" : "Scripted controller"} · saved to
                  your ATC record
                </p>
              </div>
            ) : null}
            <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
              Simulated flight time is recorded for training tracking only. It is not loggable
              flight time under 14 CFR 61.51.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 border-t p-4">
          <Button onClick={onRetry}>
            <RotateCcw className="size-4" /> Fly again
          </Button>
          <Button variant="secondary" onClick={onChoose}>
            Choose another scenario
          </Button>
          <Button variant="outline" asChild>
            <Link to="/logbook">
              <Notebook className="size-4" /> Logbook
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to="/instructor">
              <Sparkles className="size-4" /> Ask the AI instructor
            </Link>
          </Button>
          {scenario.category === "vfr" ? (
            <Button variant="outline" asChild>
              <Link to="/vfr">
                <GraduationCap className="size-4" /> VFR ground school
              </Link>
            </Button>
          ) : null}
          {scenario.category === "ifr" ? (
            <Button variant="outline" asChild>
              <Link to="/ifr">
                <GraduationCap className="size-4" /> IFR ground school
              </Link>
            </Button>
          ) : null}
          {checkrideId ? (
            <Button variant="default" className="ml-auto text-black [--primary:var(--ok)]" asChild>
              <Link to="/checkrides" search={{ attempt: checkrideId }}>
                <ClipboardCheck className="size-4" /> Return to checkride
              </Link>
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
