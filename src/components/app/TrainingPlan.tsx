import { Link } from "@tanstack/react-router";
import { ArrowRight, Pencil } from "lucide-react";
import { FOCUS_AREAS, HOUR_FIELDS, useAccount } from "@/lib/account";
import { TRACKS } from "@/lib/content/tracks";

/** Home-page block built from the signed-in pilot's ratings, hours and chosen focus areas. */
export function TrainingPlan() {
  const { data } = useAccount();
  const p = data?.profile;
  if (!data?.user || !p?.onboarded) return null;
  const goal = TRACKS.find((t) => t.id === p.goal);
  const focus = FOCUS_AREAS.filter((f) => p.focus_areas.includes(f.id));
  const hours = HOUR_FIELDS.filter((f) => (p.hours[f.key] ?? 0) > 0);
  return (
    <section className="mb-10">
      <div className="mb-4 flex items-end justify-between gap-3">
        <div>
          <p className="label-caps text-primary">Your training plan</p>
          <h2 className="text-xl font-bold tracking-tight">
            Working toward {goal?.title ?? "your next rating"}
          </h2>
        </div>
        <Link to="/setup" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <Pencil className="size-3.5" /> Edit
        </Link>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {focus.map((f) => (
          <Link
            key={f.id}
            to={f.to}
            className="glass group rounded-2xl border border-border p-4 transition-colors hover:border-primary/50"
          >
            <span className="flex items-center justify-between font-semibold">
              {f.label}
              <ArrowRight className="size-4 text-primary transition-transform group-hover:translate-x-0.5" />
            </span>
            <span className="text-sm text-muted-foreground">{f.blurb}</span>
          </Link>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
        {hours.map((h) => (
          <span key={h.key}>
            {h.label}: <b className="font-mono text-foreground">{p.hours[h.key]}</b>
          </span>
        ))}
        {p.ratings.length ? <span>Ratings: <b className="text-foreground">{p.ratings.join(", ")}</b></span> : null}
        {p.endorsements.length ? <span>Endorsements: <b className="text-foreground">{p.endorsements.length}</b></span> : null}
      </div>
    </section>
  );
}
