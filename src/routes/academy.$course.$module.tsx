import { useEffect, useRef } from "react";
import { createFileRoute, Link, notFound, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, BookOpen, CheckCircle2, ChevronLeft, ChevronRight, Circle, Clock, GraduationCap, Layers, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState, Notice, Page, PageHeader, Pill } from "@/components/app/page";
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
      { title: `${loaderData?.title ?? "Module"} — ${loaderData?.courseTitle ?? "Academy"} — TeachX` },
      { name: "description", content: loaderData?.summary ?? "TeachX ground school module with lessons, flashcards and a graded module exam." },
    ],
  }),
  notFoundComponent: () => (
    <Page>
      <EmptyState icon={BookOpen} title="Module not found" description="That ground school module does not exist. Choose a module from the course overview." action={{ to: "/vfr", label: "VFR ground school" }} />
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
        <EmptyState icon={BookOpen} title="Module not found" action={{ to: "/vfr", label: "VFR ground school" }} />
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
    if (t === "lessons" || t === "flashcards" || t === "quiz") navigate({ search: { lesson: n, tab: t } });
  };

  const isDone = lesson ? !!lessonsDone[lesson.id] : false;
  const completeAndContinue = () => {
    if (!lesson) return;
    actions.completeLesson(lesson.id, lesson.title, link(n));
    if (n < total) go(n + 1);
    else go(n, "quiz");
  };

  return (
    <Page>
      <div ref={topRef} className="scroll-mt-20" />
      <PageHeader
        eyebrow={`${course.title} · Module ${mod.number} of ${course.modules.length}`}
        title={mod.title}
        description={mod.summary}
        actions={
          <Link to={coursePath} className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm hover:bg-accent">
            <ArrowLeft className="size-4" />
            All modules
          </Link>
        }
      />

      <Tabs value={tab} onValueChange={setTab}>
        <div className="-mx-4 mb-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
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
              {best ? <span className={cn("font-mono text-[10px]", best.pct >= 70 ? "text-ok" : "text-caution")}>{best.pct}%</span> : null}
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="lessons">
          <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
            {/* Lesson list */}
            <aside className="lg:sticky lg:top-4 lg:self-start">
              <div className="panel overflow-hidden">
                <div className="flex items-center justify-between border-b px-3 py-2">
                  <span className="label-caps">Lessons</span>
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {comp.done}/{comp.total} done
                  </span>
                </div>
                <ol className="max-h-72 divide-y overflow-y-auto lg:max-h-none">
                  {mod.lessons.map((l, i) => {
                    const done = !!lessonsDone[l.id];
                    const active = i + 1 === n;
                    return (
                      <li key={l.id}>
                        <button
                          type="button"
                          onClick={() => go(i + 1)}
                          className={cn("flex w-full items-start gap-2.5 px-3 py-2.5 text-left text-sm transition-colors", active ? "bg-primary/10" : "hover:bg-accent/40")}
                        >
                          {done ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-ok" /> : <Circle className={cn("mt-0.5 size-4 shrink-0", active ? "text-primary" : "text-muted-foreground/50")} />}
                          <span className="min-w-0 flex-1">
                            <span className={cn("block leading-snug", active && "font-semibold text-primary")}>
                              {i + 1}. {l.title}
                            </span>
                            <span className="text-[11px] text-muted-foreground">{l.minutes} min</span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ol>
                <div className="grid grid-cols-2 gap-px border-t bg-border">
                  <button type="button" onClick={() => setTab("flashcards")} className="flex items-center justify-center gap-1.5 bg-card px-2 py-2 text-xs hover:bg-accent/40">
                    <Layers className="size-3.5" /> Flashcards
                  </button>
                  <button type="button" onClick={() => setTab("quiz")} className="flex items-center justify-center gap-1.5 bg-card px-2 py-2 text-xs hover:bg-accent/40">
                    <GraduationCap className="size-3.5" /> Module exam
                  </button>
                </div>
              </div>
              <div className="mt-3 hidden gap-2 lg:grid">
                {prevMod ? (
                  <Link to="/academy/$course/$module" params={{ course: course.id, module: prevMod.id }} search={{ lesson: 1 }} className="flex items-center gap-1.5 rounded-md border px-3 py-2 text-xs text-muted-foreground hover:text-foreground">
                    <ChevronLeft className="size-3.5" />
                    <span className="truncate">Module {prevMod.number}: {prevMod.title}</span>
                  </Link>
                ) : null}
                {nextMod ? (
                  <Link to="/academy/$course/$module" params={{ course: course.id, module: nextMod.id }} search={{ lesson: 1 }} className="flex items-center justify-between gap-1.5 rounded-md border px-3 py-2 text-xs text-muted-foreground hover:text-foreground">
                    <span className="truncate">Module {nextMod.number}: {nextMod.title}</span>
                    <ChevronRight className="size-3.5" />
                  </Link>
                ) : null}
              </div>
            </aside>

            {/* Lesson content */}
            {lesson ? (
              <article className="min-w-0 animate-fade-up" key={lesson.id}>
                <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="font-mono">
                    Lesson {n} of {total}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="size-3.5" />
                    {lesson.minutes} min
                  </span>
                  {isDone ? (
                    <Pill tone="ok">
                      <CheckCircle2 className="size-3" /> Completed
                    </Pill>
                  ) : null}
                </div>
                <h2 className="mb-4 text-xl font-bold tracking-tight sm:text-2xl">{lesson.title}</h2>
                {lesson.objectives.length ? (
                  <div className="mb-6 rounded-md border border-cyan/25 bg-cyan/5 p-4">
                    <p className="label-caps mb-2 flex items-center gap-1.5 text-cyan">
                      <Target className="size-3.5" />
                      Objectives
                    </p>
                    <ul className="space-y-1 text-sm">
                      {lesson.objectives.map((o) => (
                        <li key={o} className="flex gap-2">
                          <span className="mt-[9px] size-1 shrink-0 rounded-full bg-cyan" />
                          <span>{o}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                <LessonRenderer blocks={lesson.blocks} />

                <div className="mt-8 flex flex-col-reverse gap-3 border-t pt-5 sm:flex-row sm:items-center sm:justify-between">
                  <Button variant="outline" disabled={n <= 1} onClick={() => go(n - 1)}>
                    <ArrowLeft className="size-4" />
                    Previous lesson
                  </Button>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    {n < total ? (
                      <Button variant="ghost" onClick={() => go(n + 1)}>
                        Skip to next
                      </Button>
                    ) : null}
                    <Button onClick={completeAndContinue}>
                      {isDone ? (n < total ? "Next lesson" : "Take the module exam") : n < total ? "Mark complete & continue" : "Mark complete & take exam"}
                      <ArrowRight className="size-4" />
                    </Button>
                  </div>
                </div>

                {mod.practice.length ? (
                  <section className="mt-8">
                    <h3 className="mb-2 text-sm font-semibold">Practise this module</h3>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {mod.practice.map((p) => (
                        <PracticeCard key={p.to + p.label} to={p.to} label={p.label} compact />
                      ))}
                    </div>
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
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
            <ModuleQuiz key={mod.id} courseId={course.id} mod={mod} link={`/academy/${course.id}/${mod.id}?tab=quiz`} />
            <aside className="space-y-3">
              <Notice title="Module exam.">
                Pass with {70}% or better. Your best score counts toward course and certification-track progress. Every attempt is
                saved to your training record.
              </Notice>
              {comp.done < comp.total ? (
                <Notice tone="caution">
                  You have completed {comp.done} of {comp.total} lessons in this module. Finish the lessons first for the best result.
                </Notice>
              ) : null}
              {mod.practice.map((p) => (
                <PracticeCard key={p.to + p.label} to={p.to} label={p.label} compact />
              ))}
              {nextMod ? (
                <Link
                  to="/academy/$course/$module"
                  params={{ course: course.id, module: nextMod.id }}
                  search={{ lesson: 1 }}
                  className="flex items-center justify-between gap-2 rounded-md border px-3 py-2.5 text-sm hover:bg-accent/40"
                >
                  <span className="min-w-0">
                    <span className="label-caps block">Next module</span>
                    <span className="block truncate font-medium">{nextMod.title}</span>
                  </span>
                  <ChevronRight className="size-4 shrink-0" />
                </Link>
              ) : null}
            </aside>
          </div>
        </TabsContent>
      </Tabs>
    </Page>
  );
}
