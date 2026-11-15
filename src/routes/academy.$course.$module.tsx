import { useEffect, useRef } from "react";
import { createFileRoute, Link, notFound, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Circle,
  GraduationCap,
  Layers,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState, Notice, Page, PageHeader } from "@/components/app/page";
import { bestQuiz, moduleCompletion } from "@/components/academy/CourseOverview";
import { Flashcards } from "@/components/academy/Flashcards";
import { LessonRenderer } from "@/components/academy/LessonRenderer";
import { ModuleQuiz } from "@/components/academy/ModuleQuiz";
import { PracticeCard } from "@/components/academy/PracticeLink";
import { getCourse, getModule } from "@/lib/content";
import { actions, useStore } from "@/lib/store";
import { cn } from "@/lib/utils";

type Tab = "lessons" | "flashcards" | "quiz";
interface ModuleSearch {
  lesson?: number;
  tab?: Tab;
}

export const Route = createFileRoute("/academy/$course/$module")({
  validateSearch: (s: Record<string, unknown>): ModuleSearch => {
    const out: ModuleSearch = {};
    const n = Number(s["lesson"]);
    if (Number.isInteger(n) && n >= 1) out.lesson = n;
    const t = s["tab"];
    if (t === "lessons" || t === "flashcards" || t === "quiz") out.tab = t;
    return out;
  },
  loader: ({ params }) => {
    const course = getCourse(params.course);
    const mod = getModule(params.course, params.module);
    if (!course || !mod) throw notFound();
    return { title: mod.title, summary: mod.summary, courseTitle: course.title };
  },
  head: ({ loaderData }) => ({
    meta: [
      {
        title: `${loaderData?.title ?? "Module"} — ${loaderData?.courseTitle ?? "Academy"} — SkyReady`,
      },
      {
        name: "description",
        content:
          loaderData?.summary ??
          "SkyReady ground school module with lessons, flashcards and a graded module exam.",
      },
    ],
  }),
  notFoundComponent: () => (
    <Page>
      <EmptyState
        icon={BookOpen}
        title="Module not found"
        description="That ground school module does not exist. Choose a module from the course overview."
        action={{ to: "/vfr", label: "VFR ground school" }}
      />
    </Page>
  ),
  component: ModulePage,
});

function ModulePage() {
  const params = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const lessonsDone = useStore((s) => s.lessons);
  const quizzes = useStore((s) => s.quizzes);
  const course = getCourse(params.course);
  const mod = getModule(params.course, params.module);
  const tab: Tab = search.tab ?? "lessons";
  const topRef = useRef<HTMLDivElement>(null);
  const first = useRef(true);

  const total = mod?.lessons.length ?? 0;
  const n = Math.min(Math.max(1, search.lesson ?? 1), Math.max(1, total));

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [n, tab]);

  if (!course || !mod) {
    return (
      <Page>
        <EmptyState
          icon={BookOpen}
          title="Module not found"
          action={{ to: "/vfr", label: "VFR ground school" }}
        />
      </Page>
    );
  }

  const coursePath = course.id === "ifr" ? "/ifr" : "/vfr";
  const lesson = mod.lessons[n - 1];
  const link = (k: number) => `/academy/${course.id}/${mod.id}?lesson=${k}`;
  const comp = moduleCompletion(mod, lessonsDone);
  const best = bestQuiz(quizzes, course.id, mod.id);
  const modIdx = course.modules.findIndex((m) => m.id === mod.id);
  const prevMod = modIdx > 0 ? course.modules[modIdx - 1] : undefined;
  const nextMod = modIdx >= 0 ? course.modules[modIdx + 1] : undefined;

  const go = (k: number, t: Tab = "lessons") => navigate({ search: { lesson: k, tab: t } });
  const setTab = (t: string) => {
    if (t === "lessons" || t === "flashcards" || t === "quiz")
      navigate({ search: { lesson: n, tab: t } });
  };

  const isDone = lesson ? !!lessonsDone[lesson.id] : false;
  const completeAndContinue = () => {
    if (!lesson) return;
    actions.completeLesson(lesson.id, lesson.title, link(n));
    if (n < total) go(n + 1);
    else go(n, "quiz");
  };

  const lessonList = (
    <ol className="space-y-0.5">
      {mod.lessons.map((l, i) => {
        const done = !!lessonsDone[l.id];
        const active = i + 1 === n;
        return (
          <li key={l.id}>
            <button
              type="button"
              onClick={() => go(i + 1)}
              aria-current={active ? "step" : undefined}
              className={cn(
                "flex w-full items-start gap-2.5 rounded-md px-2 py-2 text-left text-sm transition-colors",
                active ? "bg-primary/10 text-primary" : "text-foreground/85 hover:bg-accent/40",
              )}
            >
              {done ? (
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-ok" />
              ) : (
                <Circle
                  className={cn(
                    "mt-0.5 size-4 shrink-0",
                    active ? "text-primary" : "text-muted-foreground/50",
                  )}
                />
              )}
              <span className={cn("min-w-0 flex-1 leading-snug", active && "font-semibold")}>
                {l.title}
              </span>
              <span className="shrink-0 text-[11px] text-muted-foreground tabular">
                {l.minutes}m
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );

  return (
    <Page>
      <div ref={topRef} className="scroll-mt-20" />
      <PageHeader
        eyebrow={`${course.title} · Module ${mod.number} of ${course.modules.length}`}
        title={mod.title}
        actions={
          <Link
            to={coursePath}
            className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm hover:bg-accent"
          >
            <ArrowLeft className="size-4" />
            All modules
          </Link>
        }
      />

      <Tabs value={tab} onValueChange={setTab}>
        <div className="-mx-4 mb-6 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <TabsList>
            <TabsTrigger value="lessons" className="gap-1.5">
              <BookOpen className="size-3.5" />
              Lessons
              <span className="font-mono text-[10px] text-muted-foreground">
                {comp.done}/{comp.total}
              </span>
            </TabsTrigger>
            <TabsTrigger value="flashcards" className="gap-1.5">
              <Layers className="size-3.5" />
              Flashcards
            </TabsTrigger>
            <TabsTrigger value="quiz" className="gap-1.5">
              <GraduationCap className="size-3.5" />
              Module exam
              {best ? (
                <span
                  className={cn(
                    "font-mono text-[10px]",
                    best.pct >= 70 ? "text-ok" : "text-caution",
                  )}
                >
                  {best.pct}%
                </span>
              ) : null}
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="lessons">
          <div className="grid gap-8 lg:grid-cols-[240px_minmax(0,1fr)] xl:gap-12">
            {/* Lesson list: a quiet sidebar on desktop, collapsed on mobile. */}
            <aside className="min-w-0 lg:sticky lg:top-4 lg:self-start">
              <details className="group rounded-md border lg:hidden">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 text-sm select-none [&::-webkit-details-marker]:hidden">
                  <span className="min-w-0 truncate">
                    <span className="text-muted-foreground">
                      Lesson {n} of {total} ·
                    </span>{" "}
                    <span className="font-medium">{lesson?.title}</span>
                  </span>
                  <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
                </summary>
                <div className="border-t p-1.5">{lessonList}</div>
              </details>
              <nav className="hidden lg:block" aria-label="Lessons">
                <p className="label-caps mb-2 px-2">Lessons</p>
                {lessonList}
                <div className="mt-6 space-y-1 border-t pt-4 text-xs">
                  {prevMod ? (
                    <Link
                      to="/academy/$course/$module"
                      params={{ course: course.id, module: prevMod.id }}
                      search={{ lesson: 1 }}
                      className="flex items-center gap-1.5 px-2 py-1 text-muted-foreground hover:text-foreground"
                    >
                      <ChevronLeft className="size-3.5 shrink-0" />
                      <span className="truncate">{prevMod.title}</span>
                    </Link>
                  ) : null}
                  {nextMod ? (
                    <Link
                      to="/academy/$course/$module"
                      params={{ course: course.id, module: nextMod.id }}
                      search={{ lesson: 1 }}
                      className="flex items-center gap-1.5 px-2 py-1 text-muted-foreground hover:text-foreground"
                    >
                      <ChevronRight className="size-3.5 shrink-0" />
                      <span className="truncate">{nextMod.title}</span>
                    </Link>
                  ) : null}
                </div>
              </nav>
            </aside>

            {/* Lesson content — a calm reading column (~70ch). */}
            {lesson ? (
              <article
                className="min-w-0 w-full max-w-[70ch] animate-fade-up xl:mx-auto"
                key={lesson.id}
              >
                <p className="mb-2 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                  <span className="hidden lg:inline">
                    Lesson {n} of {total}
                  </span>
                  <span aria-hidden className="hidden lg:inline">
                    ·
                  </span>
                  <span>{lesson.minutes} min read</span>
                  {isDone ? (
                    <>
                      <span aria-hidden>·</span>
                      <span className="inline-flex items-center gap-1 text-ok">
                        <CheckCircle2 className="size-3.5" /> Completed
                      </span>
                    </>
                  ) : null}
                </p>
                <h2 className="mb-5 text-2xl font-bold tracking-tight sm:text-[28px]">
                  {lesson.title}
                </h2>
                {lesson.objectives.length ? (
                  <div className="mb-8 border-l-2 border-cyan/50 pl-4">
                    <p className="mb-1.5 text-xs font-medium text-muted-foreground">
                      In this lesson
                    </p>
                    <ul className="space-y-1 text-sm text-foreground/85">
                      {lesson.objectives.map((o) => (
                        <li key={o}>{o}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                <LessonRenderer blocks={lesson.blocks} />

                <div className="mt-10 flex flex-col-reverse gap-3 border-t pt-5 sm:flex-row sm:items-center sm:justify-between">
                  <Button variant="ghost" disabled={n <= 1} onClick={() => go(n - 1)}>
                    <ArrowLeft className="size-4" />
                    Previous
                  </Button>
                  <div className="flex flex-col-reverse gap-2 sm:flex-row">
                    {n < total && !isDone ? (
                      <Button variant="ghost" onClick={() => go(n + 1)}>
                        Skip
                      </Button>
                    ) : null}
                    <Button onClick={completeAndContinue}>
                      {isDone
                        ? n < total
                          ? "Next lesson"
                          : "Take the module exam"
                        : n < total
                          ? "Mark complete & continue"
                          : "Mark complete & take exam"}
                      <ArrowRight className="size-4" />
                    </Button>
                  </div>
                </div>

                {mod.practice.length ? (
                  <section className="mt-10">
                    <h3 className="mb-1 text-sm font-semibold">Practise this module</h3>
                    <ul className="grid gap-x-6 sm:grid-cols-2">
                      {mod.practice.map((p) => (
                        <li key={p.to + p.label}>
                          <PracticeCard to={p.to} label={p.label} compact />
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : null}
              </article>
            ) : (
              <EmptyState title="No lessons in this module" />
            )}
          </div>
        </TabsContent>

        <TabsContent value="flashcards">
          <Flashcards cards={mod.flashcards} />
        </TabsContent>

        <TabsContent value="quiz">
          <div className="max-w-3xl">
            {comp.done < comp.total ? (
              <Notice tone="caution" className="mb-4">
                {comp.done} of {comp.total} lessons done — finish them first for the best result.
              </Notice>
            ) : null}
            <ModuleQuiz
              key={mod.id}
              courseId={course.id}
              mod={mod}
              link={`/academy/${course.id}/${mod.id}?tab=quiz`}
            />
            <div className="mt-10 flex flex-col gap-4 border-t pt-5 sm:flex-row sm:items-start sm:justify-between">
              {mod.practice.length ? (
                <ul className="min-w-0">
                  {mod.practice.map((p) => (
                    <li key={p.to + p.label}>
                      <PracticeCard to={p.to} label={p.label} compact />
                    </li>
                  ))}
                </ul>
              ) : (
                <span />
              )}
              {nextMod ? (
                <Link
                  to="/academy/$course/$module"
                  params={{ course: course.id, module: nextMod.id }}
                  search={{ lesson: 1 }}
                  className="inline-flex shrink-0 items-center gap-1.5 text-sm font-medium text-primary hover:underline"
                >
                  Next module: {nextMod.title}
                  <ChevronRight className="size-4 shrink-0" />
                </Link>
              ) : null}
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </Page>
  );
}
