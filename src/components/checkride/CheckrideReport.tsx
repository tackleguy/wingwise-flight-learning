/**
 * Instructor-style grading report for a completed virtual checkride. Printable via window.print();
 * print styles isolate the report and render it black-on-white.
 */
import { Link } from "@tanstack/react-router";
import { ArrowRight, Award, CheckCircle2, Printer, XCircle } from "lucide-react";
import type { CheckrideAttempt } from "@/lib/store";
import { useStore } from "@/lib/store";
import type { CheckrideTrackDef, StageId } from "@/lib/checkride/types";
import { PASS_SCORE } from "@/lib/checkride/content";
import { Pill, formatDate } from "@/components/app/page";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const PRINT_CSS = `
@media print {
  @page { margin: 14mm; }
  html, body { background: #fff !important; }
  body * { visibility: hidden !important; }
  #checkride-report, #checkride-report * { visibility: visible !important; }
  #checkride-report { position: absolute; left: 0; top: 0; width: 100%; padding: 0 !important; }
  #checkride-report * { color: #000 !important; background: transparent !important; box-shadow: none !important; border-color: #9ca3af !important; }
  #checkride-report .no-print { display: none !important; }
  #checkride-report table { page-break-inside: auto; }
  #checkride-report tr, #checkride-report .avoid-break { page-break-inside: avoid; }
}`;

function studyLink(id: StageId, ifr: boolean): { label: string; to: string } {
  const map: Record<StageId, { label: string; to: string }> = {
    "preflight-prep": {
      label: "Regulations review",
      to: ifr ? "/academy/ifr/regulations" : "/academy/vfr/regulations",
    },
    documents: {
      label: "Airworthiness & inspections",
      to: ifr ? "/academy/ifr/regulations" : "/academy/vfr/regulations",
    },
    "aircraft-knowledge": {
      label: ifr ? "IFR fundamentals & instruments" : "Aircraft systems",
      to: ifr ? "/academy/ifr/fundamentals" : "/academy/vfr/systems",
    },
    weather: { label: "Weather Lab", to: "/weather" },
    planning: { label: "Flight Planner", to: "/planner" },
    oral: { label: "Oral Exam Simulator", to: "/oral-exam" },
    walkaround: { label: "Aircraft Library (systems & preflight)", to: "/aircraft" },
    maneuvers: { label: "Flight Simulator", to: "/simulator" },
    navigation: {
      label: ifr ? "IFR navigation" : "Navigation & Charts",
      to: ifr ? "/academy/ifr/navigation" : "/navigation",
    },
    radio: { label: "ATC Simulator", to: "/atc" },
    emergency: {
      label: ifr ? "IFR emergencies" : "Emergency procedures",
      to: ifr ? "/academy/ifr/emergencies" : "/academy/vfr/emergencies",
    },
    postflight: { label: "Flight Logbook", to: "/logbook" },
  };
  return map[id];
}

export function CheckrideReport({
  attempt,
  track,
}: {
  attempt: CheckrideAttempt;
  track: CheckrideTrackDef;
}) {
  const profile = useStore((s) => s.profile);
  const unsat = attempt.stages.filter((s) => s.status !== "satisfactory");
  const passed = attempt.passed;

  return (
    <div id="checkride-report" className="animate-fade-up">
      <style>{PRINT_CSS}</style>
      <div className="no-print mb-4 flex flex-wrap items-center gap-2">
        <Button onClick={() => window.print()}>
          <Printer /> Print / save as PDF
        </Button>
        <Link
          to="/checkrides"
          className="inline-flex h-9 items-center gap-2 rounded-md border border-input bg-background px-4 text-sm font-medium hover:bg-accent"
        >
          All checkrides
        </Link>
      </div>

      <div className="panel p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b pb-4">
          <div>
            <p className="label-caps">SkyReady Virtual Checkride · Grading Report</p>
            <h2 className="mt-1 text-xl font-bold">{track.certificate}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Applicant: <span className="text-foreground">{profile?.name ?? "Applicant"}</span> ·
              Started {formatDate(attempt.date)} · Attempt {attempt.id.slice(0, 8)}
            </p>
          </div>
          <div className="text-right">
            <p
              className={cn(
                "flex items-center justify-end gap-2 text-2xl font-bold",
                passed ? "text-ok" : "text-warning",
              )}
            >
              {passed ? <Award className="size-6" /> : <XCircle className="size-6" />}
              {passed ? "SATISFACTORY" : "UNSATISFACTORY"}
            </p>
            <p className="font-mono text-sm text-muted-foreground tabular">
              Overall {Math.round(attempt.overall)}/100
            </p>
          </div>
        </div>

        <p className="mt-3 rounded-md border border-caution/40 bg-caution/5 px-3 py-2 text-xs text-foreground/85">
          <span className="font-semibold">Simulated checkride — not an FAA practical test.</span>{" "}
          This report is unofficial training feedback. It does not grant, and may not be used to
          obtain, any FAA certificate or rating, and it does not replace an instructor's endorsement
          or an examiner's evaluation.
        </p>

        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[620px] text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="label-caps py-2 pr-3">#</th>
                <th className="label-caps py-2 pr-3">Area / task</th>
                <th className="label-caps py-2 pr-3">ACS reference</th>
                <th className="label-caps py-2 pr-3 text-right">Score</th>
                <th className="label-caps py-2 text-right">Result</th>
              </tr>
            </thead>
            <tbody>
              {attempt.stages.map((s, i) => (
                <tr key={s.id} className="border-b border-border/60 align-top">
                  <td className="py-2 pr-3 font-mono text-xs text-muted-foreground">{i + 1}</td>
                  <td className="py-2 pr-3 font-medium">{s.name}</td>
                  <td className="py-2 pr-3 font-mono text-[11px] text-cyan">{s.acsRef ?? "—"}</td>
                  <td className="py-2 pr-3 text-right font-mono tabular">{Math.round(s.score)}</td>
                  <td className="py-2 text-right">
                    <Pill tone={s.status === "satisfactory" ? "ok" : "warning"}>
                      {s.status === "satisfactory" ? "SAT" : "UNSAT"}
                    </Pill>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h3 className="mt-6 text-base font-semibold">Examiner debrief</h3>
        <p className="mt-1 text-sm leading-relaxed text-foreground/90">
          {passed
            ? `All ${attempt.stages.length} areas were completed to a satisfactory standard (≥ ${PASS_SCORE}) in this simulation. Keep the margin: review the individual notes below, and continue training with your instructor toward the real practical test.`
            : `${unsat.length} area${unsat.length > 1 ? "s were" : " was"} not completed to a satisfactory standard: ${unsat.map((s) => s.name).join(", ")}. On an actual practical test, an unsatisfactory task results in a notice of disapproval and additional training before a retest. Focus your next training sessions on these areas.`}
        </p>

        <div className="mt-4 divide-y border-y">
          {attempt.stages.map((s, i) => {
            const link = studyLink(s.id as StageId, track.ifr);
            return (
              <div key={s.id} className="avoid-break py-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  {s.status === "satisfactory" ? (
                    <CheckCircle2 className="size-4 text-ok" />
                  ) : (
                    <XCircle className="size-4 text-warning" />
                  )}
                  <span className="text-sm font-semibold">
                    {i + 1}. {s.name}
                  </span>
                  <span className="font-mono text-xs text-muted-foreground tabular">
                    {Math.round(s.score)}/100
                  </span>
                  {s.status !== "satisfactory" && link ? (
                    <Link
                      to={link.to}
                      className="no-print ml-auto inline-flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      {link.label} <ArrowRight className="size-3" />
                    </Link>
                  ) : null}
                </div>
                {s.notes.length ? (
                  <ul className="mt-1.5 grid gap-0.5 text-xs leading-relaxed text-foreground/80">
                    {s.notes.map((n, j) => (
                      <li key={j}>• {n}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            );
          })}
        </div>
        <p className="mt-5 text-[11px] text-muted-foreground">
          Generated by SkyReady on {formatDate(new Date().toISOString())}. Grading thresholds: each
          area satisfactory at {PASS_SCORE}/100 or higher; overall pass requires every area
          satisfactory. ACS references identify the related Airman Certification Standards tasks for
          study purposes.
        </p>
      </div>
    </div>
  );
}
