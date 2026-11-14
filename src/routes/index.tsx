import { createFileRoute, Link } from "@tanstack/react-router";
import { units, allLessons } from "@/lib/lessons";
import { useProgress } from "@/lib/progress";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [
    { title: "TeachX — Learn to Fly, One Lesson a Day" },
    { name: "description", content: "Bite-sized, game-style ground school: flight deck, weather, aerodynamics, regs and navigation." },
    { property: "og:title", content: "TeachX — Learn to Fly, One Lesson a Day" },
    { property: "og:description", content: "Bite-sized, game-style ground school for student pilots." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ]}),
  component: Home,
});

const offsets = [0, 60, 90, 60, 0, -60, -90, -60];

function Home() {
  const { p } = useProgress();
  const nextIdx = allLessons.findIndex((l) => !p.done.includes(l.id));
  let i = 0;
  return (
    <div className="mx-auto max-w-xl px-4 pb-20">
      <header className="sticky top-0 z-10 flex items-center justify-between bg-background/90 py-4 backdrop-blur">
        <h1 className="text-3xl font-bold">Teach<span className="text-primary">X</span></h1>
        <div className="flex gap-4 font-bold">
          <span className="text-amber">🔥 {p.streak}</span>
          <span className="text-accent">⭐ {p.xp} XP</span>
        </div>
      </header>
      {units.map((u) => (
        <section key={u.id} className="mt-8">
          <div className="rounded-2xl bg-primary p-5 text-primary-foreground btn-3d">
            <p className="text-sm font-bold uppercase opacity-80">{u.icon} Unit</p>
            <h2 className="text-2xl font-bold">{u.title}</h2>
            <p className="opacity-90">{u.desc}</p>
          </div>
          <div className="mt-8 flex flex-col items-center gap-6">
            {u.lessons.map((l) => {
              const idx = i++;
              const done = p.done.includes(l.id);
              const current = idx === nextIdx;
              const locked = !done && !current;
              const cls = `flex h-20 w-20 items-center justify-center rounded-full text-3xl font-bold transition ${
                done ? "bg-amber text-primary-foreground" : current ? "bg-primary text-primary-foreground btn-3d animate-bounce" : "bg-locked text-muted-foreground"}`;
              return (
                <div key={l.id} style={{ transform: `translateX(${offsets[idx % 8]}px)` }} className="flex flex-col items-center">
                  {locked ? <div className={cls}>🔒</div> :
                    <Link to="/lesson/$id" params={{ id: l.id }} className={cls}>{done ? "✓" : "★"}</Link>}
                  <span className="mt-2 text-sm font-semibold text-muted-foreground">{l.title}</span>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
