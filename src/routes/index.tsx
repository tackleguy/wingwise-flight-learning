import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "TeachX — Student Pilot Training Tracker" },
      { name: "description", content: "Log flights and track progress toward your private pilot certificate." },
      { property: "og:title", content: "TeachX — Student Pilot Training Tracker" },
      { property: "og:description", content: "Log flights and track progress toward your private pilot certificate." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

type Flight = { id: string; date: string; aircraft: string; route: string; hours: number; type: "Dual" | "Solo"; night: boolean; xc: boolean; instrument: number; notes: string };

const KEY = "teachx-flights";
const empty = { date: new Date().toISOString().slice(0, 10), aircraft: "", route: "", hours: 1, type: "Dual" as const, night: false, xc: false, instrument: 0, notes: "" };

function Index() {
  const [flights, setFlights] = useState<Flight[]>([]);
  const [form, setForm] = useState<Omit<Flight, "id">>(empty);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => { try { setFlights(JSON.parse(localStorage.getItem(KEY) || "[]")); } catch {} setLoaded(true); }, []);
  useEffect(() => { if (loaded) localStorage.setItem(KEY, JSON.stringify(flights)); }, [flights, loaded]);

  const sum = (f: (x: Flight) => number) => flights.reduce((a, x) => a + f(x), 0);
  const reqs = [
    { label: "Total time", have: sum((x) => x.hours), need: 40 },
    { label: "Dual instruction", have: sum((x) => (x.type === "Dual" ? x.hours : 0)), need: 20 },
    { label: "Solo", have: sum((x) => (x.type === "Solo" ? x.hours : 0)), need: 10 },
    { label: "Night (dual)", have: sum((x) => (x.night && x.type === "Dual" ? x.hours : 0)), need: 3 },
    { label: "Cross-country (dual)", have: sum((x) => (x.xc && x.type === "Dual" ? x.hours : 0)), need: 3 },
    { label: "Solo cross-country", have: sum((x) => (x.xc && x.type === "Solo" ? x.hours : 0)), need: 5 },
    { label: "Instrument", have: sum((x) => x.instrument), need: 3 },
  ];
  const overall = Math.round((reqs.reduce((a, r) => a + Math.min(r.have / r.need, 1), 0) / reqs.length) * 100);

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    setFlights([{ ...form, id: crypto.randomUUID() }, ...flights]);
    setForm({ ...empty, aircraft: form.aircraft });
  };
  const input = "w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring";

  return (
    <div className="mx-auto max-w-6xl px-5 py-10">
      <header className="mb-10 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-xs tracking-[0.3em] text-accent">STUDENT PILOT LOGBOOK</p>
          <h1 className="text-5xl font-bold tracking-tight">Teach<span className="text-primary">X</span></h1>
        </div>
        <div className="text-right">
          <p className="font-mono text-5xl font-semibold text-primary">{overall}%</p>
          <p className="text-sm text-muted-foreground">to private pilot minimums</p>
        </div>
      </header>

      <section className="mb-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {reqs.map((r) => {
          const pct = Math.min((r.have / r.need) * 100, 100);
          return (
            <div key={r.label} className="rounded-lg border bg-card p-4">
              <p className="text-sm text-muted-foreground">{r.label}</p>
              <p className="mt-1 font-mono text-2xl">{r.have.toFixed(1)}<span className="text-sm text-muted-foreground"> / {r.need} hr</span></p>
              <div className="mt-3 h-1.5 rounded-full bg-muted">
                <div className={`h-full rounded-full ${pct >= 100 ? "bg-accent" : "bg-primary"}`} style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </section>

      <div className="grid gap-8 lg:grid-cols-[360px_1fr]">
        <form onSubmit={add} className="space-y-3 rounded-lg border bg-card p-5 self-start">
          <h2 className="text-lg font-semibold">Log a flight</h2>
          <input type="date" required className={input} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          <input placeholder="Aircraft (e.g. N172SP)" required className={input} value={form.aircraft} onChange={(e) => setForm({ ...form, aircraft: e.target.value })} />
          <input placeholder="Route (e.g. KPAO-KSQL)" className={input} value={form.route} onChange={(e) => setForm({ ...form, route: e.target.value })} />
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs text-muted-foreground">Hours<input type="number" step="0.1" min="0.1" className={input} value={form.hours} onChange={(e) => setForm({ ...form, hours: +e.target.value })} /></label>
            <label className="text-xs text-muted-foreground">Instrument hrs<input type="number" step="0.1" min="0" className={input} value={form.instrument} onChange={(e) => setForm({ ...form, instrument: +e.target.value })} /></label>
          </div>
          <div className="flex gap-2">
            {(["Dual", "Solo"] as const).map((t) => (
              <button type="button" key={t} onClick={() => setForm({ ...form, type: t })}
                className={`flex-1 rounded-md border px-3 py-2 text-sm ${form.type === t ? "border-primary bg-primary text-primary-foreground" : "bg-background"}`}>{t}</button>
            ))}
          </div>
          <div className="flex gap-5 text-sm">
            <label className="flex items-center gap-2"><input type="checkbox" className="accent-primary" checked={form.night} onChange={(e) => setForm({ ...form, night: e.target.checked })} />Night</label>
            <label className="flex items-center gap-2"><input type="checkbox" className="accent-primary" checked={form.xc} onChange={(e) => setForm({ ...form, xc: e.target.checked })} />Cross-country</label>
          </div>
          <textarea placeholder="Maneuvers, instructor notes…" rows={3} className={input} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          <button className="w-full rounded-md bg-primary py-2.5 font-semibold text-primary-foreground hover:opacity-90">Add to logbook</button>
        </form>

        <section>
          <h2 className="mb-3 text-lg font-semibold">Logbook <span className="font-mono text-sm text-muted-foreground">({flights.length})</span></h2>
          {flights.length === 0 ? (
            <div className="rounded-lg border border-dashed p-10 text-center text-muted-foreground">No flights yet. Log your first lesson to start tracking.</div>
          ) : (
            <ul className="space-y-2">
              {flights.map((f) => (
                <li key={f.id} className="flex items-start justify-between gap-4 rounded-lg border bg-card p-4">
                  <div>
                    <p className="font-mono text-sm text-muted-foreground">{f.date} · {f.aircraft}</p>
                    <p className="font-medium">{f.route || "Local flight"}</p>
                    <div className="mt-1 flex flex-wrap gap-1.5 text-xs">
                      <span className={`rounded px-2 py-0.5 ${f.type === "Solo" ? "bg-accent text-accent-foreground" : "bg-secondary"}`}>{f.type}</span>
                      {f.night && <span className="rounded bg-secondary px-2 py-0.5">Night</span>}
                      {f.xc && <span className="rounded bg-secondary px-2 py-0.5">XC</span>}
                      {f.instrument > 0 && <span className="rounded bg-secondary px-2 py-0.5">Inst {f.instrument}</span>}
                    </div>
                    {f.notes && <p className="mt-2 text-sm text-muted-foreground">{f.notes}</p>}
                  </div>
                  <div className="text-right">
                    <p className="font-mono text-xl text-primary">{f.hours.toFixed(1)}</p>
                    <button onClick={() => setFlights(flights.filter((x) => x.id !== f.id))} className="text-xs text-muted-foreground hover:text-destructive">Remove</button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
