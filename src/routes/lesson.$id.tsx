import { createFileRoute, Link, notFound, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { allLessons } from "@/lib/lessons";
import { useProgress } from "@/lib/progress";

export const Route = createFileRoute("/lesson/$id")({
  loader: ({ params }) => { const l = allLessons.find((x) => x.id === params.id); if (!l) throw notFound(); return l; },
  head: ({ loaderData }) => ({ meta: [
    { title: `${loaderData?.title ?? "Lesson"} — TeachX` },
    { name: "description", content: "A bite-sized TeachX ground school lesson." },
    { property: "og:title", content: `${loaderData?.title ?? "Lesson"} — TeachX` },
    { property: "og:description", content: "A bite-sized TeachX ground school lesson." },
  ]}),
  component: LessonPage,
});

function LessonPage() {
  const lesson = Route.useLoaderData();
  const { complete } = useProgress();
  const nav = useNavigate();
  const [i, setI] = useState(0);
  const [pick, setPick] = useState<number | null>(null);
  const [checked, setChecked] = useState(false);
  const [hearts, setHearts] = useState(3);
  const [correct, setCorrect] = useState(0);
  const finished = i >= lesson.questions.length;
  const q = lesson.questions[i];

  if (hearts <= 0) return <End title="Out of fuel! 💔" sub="You ran out of hearts. Try again." btn="Retry" onClick={() => location.reload()} />;
  if (finished) return <End title="Lesson complete! 🎉" sub={`${correct}/${lesson.questions.length} correct · +${correct * 10} XP`} btn="Continue"
    onClick={() => { complete(lesson.id, correct * 10); nav({ to: "/" }); }} />;

  const right = pick === q.answer;
  return (
    <div className="mx-auto flex min-h-screen max-w-xl flex-col px-4 py-6">
      <div className="flex items-center gap-4">
        <Link to="/" className="text-2xl text-muted-foreground">✕</Link>
        <div className="h-4 flex-1 rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${(i / lesson.questions.length) * 100}%` }} /></div>
        <span className="font-bold text-destructive">❤️ {hearts}</span>
      </div>
      <h2 className="mt-10 text-2xl font-bold">{q.q}</h2>
      <div className="mt-6 grid gap-3">
        {q.options.map((o, k) => {
          const state = checked ? (k === q.answer ? "border-primary bg-primary/10" : k === pick ? "border-destructive bg-destructive/10" : "") : pick === k ? "border-accent bg-accent/10" : "";
          return <button key={k} disabled={checked} onClick={() => setPick(k)} className={`rounded-2xl border-2 border-b-4 bg-card p-4 text-left font-semibold ${state}`}>{o}</button>;
        })}
      </div>
      <div className="mt-auto pt-8">
        {checked && <div className={`mb-4 rounded-2xl p-4 ${right ? "bg-primary/15" : "bg-destructive/15"}`}>
          <p className={`font-bold ${right ? "text-primary-shadow" : "text-destructive"}`}>{right ? "Nice flying!" : "Not quite"}</p>
          <p className="text-sm">{q.why}</p></div>}
        <button disabled={pick === null} onClick={() => {
          if (!checked) { setChecked(true); if (right) setCorrect(correct + 1); else setHearts(hearts - 1); }
          else { setI(i + 1); setPick(null); setChecked(false); }
        }} className="w-full rounded-2xl bg-primary py-4 text-lg font-bold uppercase text-primary-foreground btn-3d disabled:opacity-40">{checked ? "Continue" : "Check"}</button>
      </div>
    </div>
  );
}

function End({ title, sub, btn, onClick }: { title: string; sub: string; btn: string; onClick: () => void }) {
  return (
    <div className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-4 px-4 text-center">
      <h2 className="text-4xl font-bold">{title}</h2>
      <p className="text-lg text-muted-foreground">{sub}</p>
      <button onClick={onClick} className="mt-4 w-full rounded-2xl bg-primary py-4 text-lg font-bold uppercase text-primary-foreground btn-3d">{btn}</button>
    </div>
  );
}
