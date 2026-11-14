/** Shared academy overview used by /vfr and /ifr. */
import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Clock,
  GraduationCap,
  Layers,
  Trophy,
  type LucideIcon,
} from "lucide-react";
import { Meter, Notice, Page, PageHeader, Pill, Section, Stat } from "@/components/app/page";
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
  const modulesDone = course.modules.filter((m) => moduleCompletion(m, lessons).pct >= 100).length;
  const next = nextLesson(course, lessons);
  const started = done > 0;

  return (
    <Page>
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
              className="inline-flex items-center gap-2 rounded-md bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
            >
              {started ? "Continue training" : "Start the course"}
              <ArrowRight className="size-4" />
            </Link>
          ) : null
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Lessons complete"
          value={hydrated ? `${done}/${allL.length}` : `—/${allL.length}`}
          sub={`${Math.round(pct)}% of the course`}
          icon={BookOpen}
          tone={pct >= 100 ? "ok" : "default"}
        />
        <Stat
          label="Modules complete"
          value={`${modulesDone}/${course.modules.length}`}
          sub="All lessons finished"
          icon={Layers}
        />
        <Stat
          label="Module exams passed"
          value={`${passed}/${course.modules.length}`}
          sub={avg !== null ? `Average best score ${avg}%` : "No module exams taken yet"}
          icon={Trophy}
          tone={passed === course.modules.length ? "ok" : "default"}
        />
        <Stat
          label="Study time left"
          value={`${Math.floor(minutesLeft / 60)}h ${minutesLeft % 60}m`}
          sub={`of ${Math.round(totalMinutes / 60)} h estimated`}
          icon={Clock}
        />
      </div>

      <Meter value={pct} label="Course progress" className="mb-6" />

      {next ? (
        <div className="panel mb-8 flex flex-col gap-4 border-primary/30 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="label-caps text-primary">
              {started ? "Continue where you left off" : "Start here"}
            </p>
            <p className="mt-1 truncate text-base font-semibold">{next.lesson.title}</p>
            <p className="text-xs text-muted-foreground">
              Module {next.mod.number} · {next.mod.title} · Lesson {next.n} of{" "}
              {next.mod.lessons.length} · {next.lesson.minutes} min
            </p>
          </div>
          <Link
            to="/academy/$course/$module"
            params={{ course: course.id, module: next.mod.id }}
            search={{ lesson: next.n }}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          >
            {started ? "Resume lesson" : "Begin lesson"}
            <ArrowRight className="size-4" />
          </Link>
        </div>
      ) : (
        <Notice title="Course complete." className="mb-8">
          You have completed every lesson in this course. Retake module exams to lift your best
          scores, or continue with the practice tests and simulator.
        </Notice>
      )}

      <Section
        title="Modules"
        description={`${course.modules.length} modules · ${allL.length} lessons · each ends with a graded module exam`}
      >
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {course.modules.map((m, i) => {
            const c = moduleCompletion(m, lessons);
            const b = bests[i] ?? null;
            const minutes = m.lessons.reduce((s, l) => s + l.minutes, 0);
            const firstOpen = m.lessons.findIndex((l) => !lessons[l.id]);
            return (
              <Link
                key={m.id}
                to="/academy/$course/$module"
                params={{ course: course.id, module: m.id }}
                search={{ lesson: firstOpen >= 0 ? firstOpen + 1 : 1 }}
                className={cn(
                  "panel group flex flex-col p-4 transition-colors hover:border-primary/50",
                  c.pct >= 100 && "border-ok/30",
                )}
              >
                <div className="flex items-start gap-3">
                  <span
                    className={cn(
                      "flex size-9 shrink-0 items-center justify-center rounded-md font-mono text-sm font-bold",
                      c.pct >= 100 ? "bg-ok/15 text-ok" : "bg-primary/15 text-primary",
                    )}
                  >
                    {c.pct >= 100 ? (
                      <CheckCircle2 className="size-4.5" />
                    ) : (
                      String(m.number).padStart(2, "0")
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold leading-tight group-hover:text-primary">
                      {m.title}
                    </p>
                    <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                      {m.summary}
                    </p>
                  </div>
                </div>
                <div className="mt-auto pt-4">
                  <div className="mb-2 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                    <span>
                      {m.lessons.length} lessons · {minutes} min
                    </span>
                    <span className="ml-auto">
                      {b ? (
                        <Pill tone={b.pct >= 70 ? "ok" : "caution"}>
                          <GraduationCap className="size-3" /> Exam {b.pct}%
                        </Pill>
                      ) : (
                        <Pill>Exam not taken</Pill>
                      )}
                    </span>
                  </div>
                  <Meter value={c.pct} />
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {c.done}/{c.total} lessons complete
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      </Section>

      <Section
        title="Hands-on practice"
        description="Apply what you learn in the simulator, labs and radio trainers."
      >
        <div className="grid gap-3 md:grid-cols-3">
          {related.map((r) => (
            <PracticeCard key={r.to} to={r.to} label={r.label} text={r.text} />
          ))}
        </div>
      </Section>

      <Notice tone="caution" title="Educational content.">
        Lessons are based on FAA handbooks (PHAK, AFH, IFH), the AIM and 14 CFR, and are intended to
        supplement — not replace — training with an authorized flight instructor and current
        official FAA publications.
      </Notice>
    </Page>
  );
}
