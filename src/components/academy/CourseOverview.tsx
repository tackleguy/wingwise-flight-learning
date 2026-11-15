/** Shared academy overview used by /vfr and /ifr. */
import { Link } from "@tanstack/react-router";
import { ArrowRight, CheckCircle2, type LucideIcon } from "lucide-react";
import { Meter, Notice, Page, PageHeader, Section } from "@/components/app/page";
import { getCourse } from "@/lib/content";
import type { Course, Module } from "@/lib/content/types";
import { useHydrated, useStore, type QuizAttempt } from "@/lib/store";
import { cn } from "@/lib/utils";
import { PracticeCard } from "./PracticeLink";

export function bestQuiz(
  quizzes: QuizAttempt[],
  course: string,
  moduleId: string,
): { pct: number; score: number; total: number } | null {
  let best: { pct: number; score: number; total: number } | null = null;
  for (const q of quizzes) {
    if (!q.final || q.course !== course || q.moduleId !== moduleId || q.total <= 0) continue;
    const pct = Math.round((q.score / q.total) * 100);
    if (!best || pct > best.pct) best = { pct, score: q.score, total: q.total };
  }
  return best;
}

export function moduleCompletion(mod: Module, lessons: Record<string, string>) {
  const done = mod.lessons.filter((l) => !!lessons[l.id]).length;
  return {
    done,
    total: mod.lessons.length,
    pct: mod.lessons.length ? (done / mod.lessons.length) * 100 : 0,
  };
}

/** First incomplete lesson in course order, or null when everything is done. */
export function nextLesson(course: Course, lessons: Record<string, string>) {
  for (const mod of course.modules) {
    const idx = mod.lessons.findIndex((l) => !lessons[l.id]);
    if (idx >= 0) {
      const lesson = mod.lessons[idx];
      if (lesson) return { mod, lesson, n: idx + 1 };
    }
  }
  return null;
}

export function CourseOverview({
  courseId,
  eyebrow,
  icon,
  related,
}: {
  courseId: "vfr" | "ifr";
  eyebrow: string;
  icon: LucideIcon;
  related: { to: string; label: string; text: string }[];
}) {
  const course = getCourse(courseId);
  const lessons = useStore((s) => s.lessons);
  const quizzes = useStore((s) => s.quizzes);
  const hydrated = useHydrated();

  if (!course) {
    return (
      <Page>
        <PageHeader
          eyebrow={eyebrow}
          title="Course unavailable"
          description="The course content could not be loaded."
        />
      </Page>
    );
  }

  const allL = course.modules.flatMap((m) => m.lessons);
  const done = allL.filter((l) => !!lessons[l.id]).length;
  const pct = allL.length ? (done / allL.length) * 100 : 0;
  const minutesLeft = allL.filter((l) => !lessons[l.id]).reduce((s, l) => s + l.minutes, 0);
  const totalMinutes = allL.reduce((s, l) => s + l.minutes, 0);
  const bests = course.modules.map((m) => bestQuiz(quizzes, course.id, m.id));
  const passed = bests.filter((b) => b && b.pct >= 70).length;
  const taken = bests.filter((b): b is NonNullable<typeof b> => !!b);
  const avg = taken.length ? Math.round(taken.reduce((s, b) => s + b.pct, 0) / taken.length) : null;
  const next = nextLesson(course, lessons);
  const started = done > 0;

  return (
    <Page className="max-w-5xl">
      <PageHeader
        eyebrow={eyebrow}
        title={course.title}
        icon={icon}
        description={course.description}
        actions={
          next ? (
            <Link
              to="/academy/$course/$module"
              params={{ course: course.id, module: next.mod.id }}
              search={{ lesson: next.n }}
              className="inline-flex items-center gap-2 rounded-lg btn-glow px-3.5 py-2 text-sm font-semibold text-primary-foreground"
            >
              {started ? "Continue training" : "Start the course"}
              <ArrowRight className="size-4" />
            </Link>
          ) : null
        }
      />

      {/* One compact progress line instead of four stat cards + a "start here" panel. */}
      <div className="mb-8">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-sm">
          <span className="text-muted-foreground">
            <span className="font-mono font-semibold text-foreground tabular">
              {hydrated ? done : "—"}/{allL.length}
            </span>{" "}
            lessons ·{" "}
            <span className="font-mono font-semibold text-foreground tabular">
              {passed}/{course.modules.length}
            </span>{" "}
            module exams passed
            {avg !== null ? ` (avg ${avg}%)` : ""} · {Math.floor(minutesLeft / 60)}h{" "}
            {minutesLeft % 60}m left
          </span>
          {next ? (
            <span className="min-w-0 truncate text-xs text-muted-foreground">
              Up next:{" "}
              <Link
                to="/academy/$course/$module"
                params={{ course: course.id, module: next.mod.id }}
                search={{ lesson: next.n }}
                className="font-medium text-foreground hover:text-primary"
              >
                {next.lesson.title}
              </Link>{" "}
              · Module {next.mod.number}
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-xs text-ok">
              <CheckCircle2 className="size-3.5" />
              Course complete — retake module exams to lift your best scores.
            </span>
          )}
        </div>
        <Meter value={pct} />
      </div>

      <Section
        title="Modules"
        description={`${course.modules.length} modules · ${Math.round(totalMinutes / 60)} h · each ends with a graded module exam`}
      >
        <ol className="divide-y border-y">
          {course.modules.map((m, i) => {
            const c = moduleCompletion(m, lessons);
            const b = bests[i] ?? null;
            const minutes = m.lessons.reduce((s, l) => s + l.minutes, 0);
            const firstOpen = m.lessons.findIndex((l) => !lessons[l.id]);
            const complete = c.pct >= 100;
            return (
              <li key={m.id}>
                <Link
                  to="/academy/$course/$module"
                  params={{ course: course.id, module: m.id }}
                  search={{ lesson: firstOpen >= 0 ? firstOpen + 1 : 1 }}
                  className="group flex items-center gap-3 py-3 sm:gap-4"
                >
                  <span
                    className={cn(
                      "flex w-7 shrink-0 justify-center font-mono text-sm",
                      complete ? "text-ok" : "text-muted-foreground",
                    )}
                  >
                    {complete ? (
                      <CheckCircle2 className="size-4.5" />
                    ) : (
                      String(m.number).padStart(2, "0")
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium leading-snug group-hover:text-primary">
                      {m.title}
                    </span>
                    <span className="hidden truncate text-xs text-muted-foreground sm:block">
                      {m.summary}
                    </span>
                  </span>
                  <span className="hidden shrink-0 text-xs text-muted-foreground tabular md:block">
                    {c.done}/{c.total} lessons · {minutes} min
                  </span>
                  <span className="w-16 shrink-0 text-right font-mono text-xs tabular">
                    {b ? (
                      <span className={b.pct >= 70 ? "text-ok" : "text-caution"}>
                        Exam {b.pct}%
                      </span>
                    ) : (
                      <span className="text-muted-foreground md:hidden">
                        {c.done}/{c.total}
                      </span>
                    )}
                  </span>
                  <Meter value={c.pct} className="hidden w-20 shrink-0 sm:block" />
                </Link>
              </li>
            );
          })}
        </ol>
      </Section>

      <Section title="Hands-on practice">
        <ul className="grid gap-x-6 gap-y-1 sm:grid-cols-3">
          {related.map((r) => (
            <li key={r.to}>
              <PracticeCard to={r.to} label={r.label} text={r.text} compact />
            </li>
          ))}
        </ul>
      </Section>

      <Notice tone="caution" title="Educational content — not a substitute for instruction.">
        Lessons are based on FAA handbooks (PHAK, AFH, IFH), the AIM and 14 CFR, and are intended to
        supplement — not replace — training with an authorized flight instructor and current
        official FAA publications.
      </Notice>
    </Page>
  );
}
