import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ClipboardList } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Page, PageHeader } from "@/components/app/page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ENDORSEMENTS, FOCUS_AREAS, HOUR_FIELDS, RATINGS, useAccount, type Hours,
} from "@/lib/account";
import { TRACKS } from "@/lib/content/tracks";
import { actions, getState, type TrackId } from "@/lib/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/setup")({
  head: () => ({
    meta: [
      { title: "Set Up Your Training — SkyReady" },
      { name: "description", content: "Add your ratings, endorsements and flight hours, then choose what to work on." },
      { property: "og:title", content: "Set Up Your Training — SkyReady" },
      { property: "og:description", content: "Tell SkyReady where you are so it can plan your training." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Setup,
});

const STEPS = ["Ratings", "Endorsements", "Hours", "Training focus"] as const;
const GOALS = ["student", "private", "instrument", "commercial", "multi-engine", "cfi", "cfii", "atp"];

function Chips({ options, value, onChange }: { options: readonly string[]; value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = value.includes(o);
        return (
          <button
            key={o}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(on ? value.filter((x) => x !== o) : [...value, o])}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-sm transition-colors",
              on ? "border-primary bg-primary/15 text-foreground" : "border-border text-muted-foreground hover:border-primary/50",
            )}
          >
            {on ? <CheckCircle2 className="size-4 text-primary" /> : null}
            {o}
          </button>
        );
      })}
    </div>
  );
}

function Setup() {
  const { data } = useAccount();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [ratings, setRatings] = useState<string[]>([]);
  const [endorsements, setEndorsements] = useState<string[]>([]);
  const [hours, setHours] = useState<Hours>({});
  const [goal, setGoal] = useState("private");
  const [focus, setFocus] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const p = data?.profile;
    if (!p) return;
    setName(p.display_name ?? "");
    setRatings(p.ratings);
    setEndorsements(p.endorsements);
    setHours(p.hours ?? {});
    setGoal(p.goal);
    setFocus(p.focus_areas);
  }, [data?.profile]);

  const save = async () => {
    if (!data?.user) return;
    if (focus.length === 0) {
      toast.error("Pick at least one thing to work on.");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("profiles").upsert({
      id: data.user.id,
      display_name: name.trim() || null,
      ratings: ratings.filter((r) => r !== "None yet"),
      endorsements,
      hours,
      goal,
      focus_areas: focus,
      onboarded: true,
      updated_at: new Date().toISOString(),
    });
    setSaving(false);
    if (error) {
      toast.error("Couldn't save your setup. Try again.");
      return;
    }
    const local = getState().profile;
    const displayName = name.trim() || data.user.email?.split("@")[0] || "Pilot";
    if (local) actions.updateProfile({ name: displayName, goal: goal as TrackId });
    else
      actions.createProfile({
        name: displayName,
        email: data.user.email ?? "",
        callsign: "N172TX",
        homeAirport: "KPAO",
        goal: goal as TrackId,
      });
    await qc.invalidateQueries({ queryKey: ["account"] });
    toast.success("Your training plan is ready");
    navigate({ to: "/" });
  };

  return (
    <Page className="max-w-3xl">
      <PageHeader
        eyebrow="Pilot setup"
        icon={ClipboardList}
        title="Tell us where you are"
        description="Add your ratings, endorsements and hours, then pick what you want to work on. You can change this any time."
      />
      <ol className="mb-8 flex flex-wrap gap-2 text-xs">
        {STEPS.map((s, i) => (
          <li key={s}>
            <button
              type="button"
              onClick={() => setStep(i)}
              className={cn(
                "rounded-full border px-3 py-1 font-medium",
                i === step ? "border-primary bg-primary text-primary-foreground" : i < step ? "border-ok/50 text-ok" : "border-border text-muted-foreground",
              )}
            >
              {i + 1}. {s}
            </button>
          </li>
        ))}
      </ol>

      <section className="glass space-y-5 rounded-2xl border border-border p-6">
        {step === 0 ? (
          <>
            <div className="max-w-sm space-y-1.5">
              <Label htmlFor="dn">Your name</Label>
              <Input id="dn" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <h2 className="mb-1 font-semibold">Which certificates and ratings do you hold?</h2>
              <p className="mb-4 text-sm text-muted-foreground">Pick all that apply.</p>
              <Chips options={RATINGS} value={ratings} onChange={setRatings} />
            </div>
          </>
        ) : null}
        {step === 1 ? (
          <div>
            <h2 className="mb-1 font-semibold">Which endorsements do you have?</h2>
            <p className="mb-4 text-sm text-muted-foreground">Logbook sign-offs from your instructor. Skip if none yet.</p>
            <Chips options={ENDORSEMENTS} value={endorsements} onChange={setEndorsements} />
          </div>
        ) : null}
        {step === 2 ? (
          <div>
            <h2 className="mb-1 font-semibold">How many hours have you logged?</h2>
            <p className="mb-4 text-sm text-muted-foreground">Rough numbers are fine.</p>
            <div className="grid gap-4 sm:grid-cols-2">
              {HOUR_FIELDS.map((f) => (
                <div key={f.key} className="space-y-1.5">
                  <Label htmlFor={f.key}>{f.label}</Label>
                  <Input
                    id={f.key}
                    type="number"
                    min={0}
                    step={0.1}
                    inputMode="decimal"
                    value={hours[f.key] ?? ""}
                    onChange={(e) =>
                      setHours({ ...hours, [f.key]: e.target.value === "" ? undefined : Math.max(0, Number(e.target.value)) })
                    }
                  />
                </div>
              ))}
            </div>
          </div>
        ) : null}
        {step === 3 ? (
          <>
            <div>
              <h2 className="mb-3 font-semibold">What are you training for next?</h2>
              <div className="flex flex-wrap gap-2">
                {TRACKS.filter((t) => GOALS.includes(t.id)).map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    aria-pressed={goal === t.id}
                    onClick={() => setGoal(t.id)}
                    className={cn(
                      "rounded-full border px-3.5 py-2 text-sm",
                      goal === t.id ? "border-primary bg-primary/15" : "border-border text-muted-foreground",
                    )}
                  >
                    {t.title}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <h2 className="mb-1 font-semibold">What do you want to work on?</h2>
              <p className="mb-4 text-sm text-muted-foreground">These go to the top of your home page.</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {FOCUS_AREAS.map((f) => {
                  const on = focus.includes(f.id);
                  return (
                    <button
                      key={f.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setFocus(on ? focus.filter((x) => x !== f.id) : [...focus, f.id])}
                      className={cn(
                        "rounded-xl border p-3 text-left transition-colors",
                        on ? "border-primary bg-primary/10" : "border-border hover:border-primary/50",
                      )}
                    >
                      <span className="flex items-center gap-2 text-sm font-semibold">
                        {on ? <CheckCircle2 className="size-4 text-primary" /> : null}
                        {f.label}
                      </span>
                      <span className="text-xs text-muted-foreground">{f.blurb}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        ) : null}

        <div className="flex justify-between pt-2">
          <Button variant="ghost" disabled={step === 0} onClick={() => setStep(step - 1)}>Back</Button>
          {step < STEPS.length - 1 ? (
            <Button className="btn-glow" onClick={() => setStep(step + 1)}>Next</Button>
          ) : (
            <Button className="btn-glow" disabled={saving} onClick={save}>
              {saving ? "Saving…" : "Build my training plan"}
            </Button>
          )}
        </div>
      </section>
    </Page>
  );
}
