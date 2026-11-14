import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Accessibility,
  Bell,
  Bot,
  Cpu,
  CheckCircle2,
  Database,
  Download,
  Gamepad2,
  Globe2,
  Keyboard,
  Loader2,
  Mic,
  Monitor,
  Moon,
  Plane,
  Play,
  Ruler,
  Settings as SettingsIcon,
  SlidersHorizontal,
  Trash2,
  Upload,
  UserCircle2,
  Volume2,
  XCircle,
} from "lucide-react";

import { Notice, Page, PageHeader, Pill } from "@/components/app/page";
import { ConfirmAction, downloadFile } from "@/components/app/confirm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { applyAccessibility, setNightLighting, useNightLighting } from "@/lib/accessibility";
import { enableOnDeviceAi, getAiStatus, type AiStatus } from "@/lib/ai/client";
import { MODEL_DOWNLOAD_LABEL, MODEL_LABEL } from "@/lib/ai/local-model-id";
import { isModelCached, stopLocalModel, useLocalModel } from "@/lib/ai/local-model";
import { AIRCRAFT_PERF } from "@/lib/data/aircraft-perf";
import { AIRPORTS } from "@/lib/data/airports";
import { actions, useHydrated, useStore, type Settings, type TrackId } from "@/lib/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — TeachX" },
      {
        name: "description",
        content:
          "Pilot profile, training preferences, units, voice & microphone, simulator graphics and controls, accessibility, AI provider and data management.",
      },
    ],
  }),
  component: SettingsPage,
});

const TRACKS: { id: TrackId; label: string }[] = [
  { id: "student", label: "Student Pilot" },
  { id: "private", label: "Private Pilot" },
  { id: "instrument", label: "Instrument Rating" },
  { id: "commercial", label: "Commercial Pilot" },
  { id: "atp", label: "Airline Transport Pilot" },
  { id: "multi-engine", label: "Multi-Engine Rating" },
  { id: "seaplane", label: "Seaplane Rating" },
  { id: "tailwheel", label: "Tailwheel Endorsement" },
  { id: "high-performance", label: "High-Performance Endorsement" },
  { id: "complex", label: "Complex Endorsement" },
  { id: "high-altitude", label: "High-Altitude Endorsement" },
  { id: "cfi", label: "Flight Instructor (CFI)" },
  { id: "cfii", label: "Instrument Instructor (CFII)" },
  { id: "night", label: "Night Flying" },
  { id: "cross-country", label: "Cross-Country Flying" },
  { id: "emergency", label: "Emergency Procedures" },
  { id: "mountain", label: "Mountain Flying" },
  { id: "adm", label: "Aeronautical Decision Making" },
];

const SECTIONS = [
  { id: "profile", label: "Profile", icon: UserCircle2 },
  { id: "training", label: "Training", icon: SlidersHorizontal },
  { id: "units", label: "Units & region", icon: Ruler },
  { id: "voice", label: "Voice & microphone", icon: Volume2 },
  { id: "graphics", label: "Simulator graphics", icon: Monitor },
  { id: "controls", label: "Controls", icon: Gamepad2 },
  { id: "accessibility", label: "Accessibility & theme", icon: Accessibility },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "ai", label: "AI provider", icon: Bot },
  { id: "data", label: "Data", icon: Database },
] as const;

const CALLSIGN_N = /^N[1-9][0-9A-Z]{0,4}$/;
const CALLSIGN_ICAO = /^[A-Z0-9]{1,2}-[A-Z0-9]{3,5}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function upd(fn: (s: Settings) => Settings) {
  actions.updateSettings(fn);
}

function SettingsPage() {
  const hydrated = useHydrated();
  const settings = useStore((s) => s.settings);

  // Apply accessibility classes while on this page (the app shell can also call useApplyAccessibility()).
  const night = useNightLighting();
  useEffect(() => {
    if (hydrated) applyAccessibility(settings.accessibility, night);
  }, [hydrated, settings.accessibility, night]);

  return (
    <Page wide>
      <PageHeader
        eyebrow="System"
        icon={SettingsIcon}
        title="Settings"
        description="Preferences are saved automatically in this browser with your training record."
      />
      <div className="grid gap-6 lg:grid-cols-[200px_minmax(0,1fr)]">
        <nav className="hidden lg:block" aria-label="Settings sections">
          <ul className="sticky top-4 space-y-0.5 text-sm">
            {SECTIONS.map((s) => (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <s.icon className="size-4" /> {s.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="min-w-0 space-y-6">
          {!hydrated ? (
            <div className="panel flex items-center gap-2 p-6 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Loading your settings…
            </div>
          ) : (
            <>
              <ProfileSection />
              <TrainingSection settings={settings} />
              <UnitsSection settings={settings} />
              <VoiceSection settings={settings} />
              <GraphicsSection settings={settings} />
              <ControlsSection settings={settings} />
              <AccessibilitySection settings={settings} night={night} />
              <NotificationsSection settings={settings} />
              <AiSection settings={settings} />
              <DataSection />
            </>
          )}
        </div>
      </div>
    </Page>
  );
}

/* ------------------------------ layout helpers ------------------------------ */

function Card({
  id,
  title,
  icon: Icon,
  description,
  children,
}: {
  id: string;
  title: string;
  icon: typeof Plane;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section id={id} className="panel scroll-mt-4">
      <div className="border-b px-5 py-3">
        <h2 className="flex items-center gap-2 font-semibold">
          <Icon className="size-4 text-primary" /> {title}
        </h2>
        {description ? <p className="mt-0.5 text-xs text-muted-foreground">{description}</p> : null}
      </div>
      <div className="divide-y">{children}</div>
    </section>
  );
}

function Row({
  label,
  hint,
  children,
  htmlFor,
}: {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
  htmlFor?: string;
}) {
  return (
    <div className="flex flex-col gap-2 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <div className="min-w-0">
        <label htmlFor={htmlFor} className="text-sm font-medium">
          {label}
        </label>
        {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
      </div>
      <div className="shrink-0 sm:max-w-[60%]">{children}</div>
    </div>
  );
}

function Toggle({
  id,
  checked,
  onChange,
}: {
  id: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return <Switch id={id} checked={checked} onCheckedChange={onChange} />;
}

function Seg<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { v: T; l: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className="inline-flex rounded-md border p-0.5" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.v}
          type="button"
          aria-pressed={value === o.v}
          onClick={() => onChange(o.v)}
          className={cn(
            "rounded px-2.5 py-1 text-xs font-medium",
            value === o.v
              ? "bg-primary/15 text-primary"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.l}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------ Profile ------------------------------ */

function ProfileSection() {
  const profile = useStore((s) => s.profile);
  const [name, setName] = useState(profile?.name ?? "");
  const [email, setEmail] = useState(profile?.email ?? "");
  const [callsign, setCallsign] = useState(profile?.callsign ?? "");
  const [home, setHome] = useState(profile?.homeAirport ?? "KPAO");
  const [goal, setGoal] = useState<TrackId>(profile?.goal ?? "private");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!profile) return;
    setName(profile.name);
    setEmail(profile.email);
    setCallsign(profile.callsign);
    setHome(profile.homeAirport);
    setGoal(profile.goal);
  }, [profile]);

  if (!profile) {
    return (
      <Card id="profile" title="Pilot profile" icon={UserCircle2}>
        <div className="px-5 py-4">
          <p className="text-sm text-muted-foreground">
            You haven't created a pilot profile yet. The onboarding takes about five minutes and
            includes a short knowledge assessment that recommends a training track.
          </p>
          <Button asChild size="sm" className="mt-3">
            <Link to="/onboarding">Create your pilot profile</Link>
          </Button>
        </div>
      </Card>
    );
  }

  const cs = callsign.trim().toUpperCase();
  const csValid = CALLSIGN_N.test(cs) || CALLSIGN_ICAO.test(cs);
  const emailValid = email.trim() === "" || EMAIL.test(email.trim());
  const nameValid = name.trim().length >= 2;
  const changed =
    name !== profile.name ||
    email !== profile.email ||
    cs !== profile.callsign ||
    home !== profile.homeAirport ||
    goal !== profile.goal;
  const valid = csValid && emailValid && nameValid;

  return (
    <Card
      id="profile"
      title="Pilot profile"
      icon={UserCircle2}
      description="Used for your callsign on ATC frequencies, your home airport defaults and training recommendations."
    >
      <div className="grid gap-4 px-5 py-4 sm:grid-cols-2">
        <label className="text-xs">
          <span className="label-caps mb-1 block">Name</span>
          <Input value={name} onChange={(e) => setName(e.target.value)} aria-invalid={!nameValid} />
          {!nameValid ? <span className="mt-1 block text-warning">Enter your name.</span> : null}
        </label>
        <label className="text-xs">
          <span className="label-caps mb-1 block">Email</span>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={!emailValid}
          />
          {!emailValid ? (
            <span className="mt-1 block text-warning">
              That doesn't look like an email address.
            </span>
          ) : (
            <span className="mt-1 block text-muted-foreground">Stored only in this browser.</span>
          )}
        </label>
        <label className="text-xs">
          <span className="label-caps mb-1 block">Aircraft callsign (registration)</span>
          <Input
            value={callsign}
            onChange={(e) => setCallsign(e.target.value.toUpperCase())}
            className="font-mono"
            aria-invalid={!csValid}
            placeholder="N172TX"
          />
          {csValid ? (
            <span className="mt-1 block text-muted-foreground">
              US N-number (e.g. N172TX) or ICAO-style registration (e.g. G-ABCD, C-FABC).
            </span>
          ) : (
            <span className="mt-1 block text-warning">
              Use an N-number like N172TX (N, then a digit 1–9, then up to 4 digits/letters) or a
              registration like G-ABCD.
            </span>
          )}
        </label>
        <label className="text-xs">
          <span className="label-caps mb-1 block">Home airport</span>
          <Select value={home} onValueChange={setHome}>
            <SelectTrigger className="font-mono">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[...AIRPORTS]
                .sort((a, b) => a.icao.localeCompare(b.icao))
                .map((a) => (
                  <SelectItem key={a.icao} value={a.icao}>
                    {a.icao} — {a.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </label>
        <label className="text-xs sm:col-span-2">
          <span className="label-caps mb-1 block">Training goal</span>
          <Select value={goal} onValueChange={(v) => setGoal(v as TrackId)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TRACKS.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
      </div>
      <div className="flex items-center justify-end gap-3 px-5 py-3">
        {saved && !changed ? (
          <span className="flex items-center gap-1 text-xs text-ok">
            <CheckCircle2 className="size-3.5" /> Profile saved
          </span>
        ) : null}
        <Button
          size="sm"
          disabled={!changed || !valid}
          onClick={() => {
            actions.updateProfile({
              name: name.trim(),
              email: email.trim(),
              callsign: cs,
              homeAirport: home,
              goal,
            });
            setSaved(true);
          }}
        >
          Save profile
        </Button>
      </div>
    </Card>
  );
}

/* ------------------------------ Training ------------------------------ */

function TrainingSection({ settings }: { settings: Settings }) {
  const t = settings.training;
  return (
    <Card id="training" title="Training preferences" icon={SlidersHorizontal}>
      <Row label="Daily study goal" hint="Target training minutes per day.">
        <Select
          value={String(t.dailyGoalMin)}
          onValueChange={(v) =>
            upd((s) => ({ ...s, training: { ...s.training, dailyGoalMin: Number(v) } }))
          }
        >
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[15, 30, 45, 60, 90, 120].map((m) => (
              <SelectItem key={m} value={String(m)}>
                {m} minutes
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Row>
      <Row label="Default difficulty" hint="Starting difficulty for ATC and scenario practice.">
        <Seg
          label="Difficulty"
          value={t.difficulty}
          options={[
            { v: "beginner", l: "Beginner" },
            { v: "intermediate", l: "Intermediate" },
            { v: "advanced", l: "Advanced" },
          ]}
          onChange={(v) => upd((s) => ({ ...s, training: { ...s.training, difficulty: v } }))}
        />
      </Row>
      <Row
        label="Show hints"
        hint="Instructor hints and prompts during lessons and simulator scenarios."
        htmlFor="hints"
      >
        <Toggle
          id="hints"
          checked={t.showHints}
          onChange={(v) => upd((s) => ({ ...s, training: { ...s.training, showHints: v } }))}
        />
      </Row>
      <Row
        label="Preferred aircraft"
        hint={
          <Link to="/aircraft" className="text-primary hover:underline">
            Browse the aircraft library
          </Link>
        }
      >
        <Select
          value={settings.preferredAircraft}
          onValueChange={(v) => upd((s) => ({ ...s, preferredAircraft: v }))}
        >
          <SelectTrigger className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {AIRCRAFT_PERF.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.shortName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Row>
    </Card>
  );
}

/* ------------------------------ Units ------------------------------ */

function UnitsSection({ settings }: { settings: Settings }) {
  const u = settings.units;
  const set = <K extends keyof Settings["units"]>(k: K, v: Settings["units"][K]) =>
    upd((s) => ({ ...s, units: { ...s.units, [k]: v } }));
  return (
    <Card
      id="units"
      title="Units & region"
      icon={Ruler}
      description="Display preferences where TeachX supports conversion. Aviation-standard units (feet, knots, nautical miles, inHg) are used in FAA training content and radio phraseology."
    >
      <Row label="Altitude">
        <Seg
          label="Altitude"
          value={u.altitude}
          options={[
            { v: "ft", l: "Feet" },
            { v: "m", l: "Meters" },
          ]}
          onChange={(v) => set("altitude", v)}
        />
      </Row>
      <Row label="Distance">
        <Seg
          label="Distance"
          value={u.distance}
          options={[
            { v: "nm", l: "Nautical miles" },
            { v: "km", l: "Kilometers" },
          ]}
          onChange={(v) => set("distance", v)}
        />
      </Row>
      <Row label="Speed">
        <Seg
          label="Speed"
          value={u.speed}
          options={[
            { v: "kt", l: "Knots" },
            { v: "kmh", l: "km/h" },
          ]}
          onChange={(v) => set("speed", v)}
        />
      </Row>
      <Row label="Pressure (altimeter)">
        <Seg
          label="Pressure"
          value={u.pressure}
          options={[
            { v: "inHg", l: "inHg" },
            { v: "hPa", l: "hPa" },
          ]}
          onChange={(v) => set("pressure", v)}
        />
      </Row>
      <Row
        label="Regulatory jurisdiction"
        hint="TeachX content is based on FAA regulations (14 CFR), the AIM and FAA handbooks. Other jurisdictions are shown for reference only; their rules differ."
      >
        <Select
          value={settings.jurisdiction}
          onValueChange={(v) => upd((s) => ({ ...s, jurisdiction: v as Settings["jurisdiction"] }))}
        >
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="FAA">FAA (United States)</SelectItem>
            <SelectItem value="EASA">EASA (Europe)</SelectItem>
            <SelectItem value="ICAO">ICAO (generic)</SelectItem>
          </SelectContent>
        </Select>
      </Row>
      {settings.jurisdiction !== "FAA" ? (
        <div className="px-5 py-3">
          <Notice tone="caution">
            Lessons, exams and checkrides remain FAA-based. Use your national authority's material
            for {settings.jurisdiction} requirements.
          </Notice>
        </div>
      ) : null}
    </Card>
  );
}

/* ------------------------------ Voice ------------------------------ */

function VoiceSection({ settings }: { settings: Settings }) {
  const v = settings.voice;
  const setV = <K extends keyof Settings["voice"]>(k: K, val: Settings["voice"][K]) =>
    upd((s) => ({ ...s, voice: { ...s.voice, [k]: val } }));
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [ttsSupported, setTtsSupported] = useState(true);
  const [srSupported, setSrSupported] = useState(false);
  const [micState, setMicState] = useState<{
    status: "idle" | "testing" | "ok" | "error";
    msg?: string;
  }>({ status: "idle" });
  const [level, setLevel] = useState(0);
  const stopRef = useRef<() => void>(() => undefined);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const w = window as unknown as Record<string, unknown>;
    setSrSupported(Boolean(w["SpeechRecognition"] || w["webkitSpeechRecognition"]));
    if (!("speechSynthesis" in window)) {
      setTtsSupported(false);
      return;
    }
    const load = () =>
      setVoices(
        window.speechSynthesis.getVoices().filter((x) => x.lang.toLowerCase().startsWith("en")),
      );
    load();
    window.speechSynthesis.addEventListener("voiceschanged", load);
    return () => {
      window.speechSynthesis.removeEventListener("voiceschanged", load);
      stopRef.current();
    };
  }, []);

  const test = () => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(
      "November one seven two tango x-ray, Palo Alto tower, wind three one zero at eight, runway three one, cleared for takeoff.",
    );
    u.rate = v.rate;
    u.volume = v.volume;
    const voice = voices.find((x) => x.name === v.voiceName);
    if (voice) u.voice = voice;
    window.speechSynthesis.speak(u);
  };

  const testMic = async () => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setMicState({
        status: "error",
        msg: "This browser does not support microphone access (getUserMedia). Try a current Chrome, Edge or Safari over HTTPS.",
      });
      return;
    }
    setMicState({ status: "testing" });
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const Ctx = (window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext) as
        typeof AudioContext | undefined;
      let raf = 0;
      let ctx: AudioContext | undefined;
      if (Ctx) {
        ctx = new Ctx();
        const src = ctx.createMediaStreamSource(stream);
        const an = ctx.createAnalyser();
        an.fftSize = 512;
        src.connect(an);
        const buf = new Uint8Array(an.fftSize);
        const tick = () => {
          an.getByteTimeDomainData(buf);
          let peak = 0;
          for (const b of buf) peak = Math.max(peak, Math.abs(b - 128));
          setLevel(Math.min(100, (peak / 128) * 200));
          raf = requestAnimationFrame(tick);
        };
        tick();
      }
      const stop = () => {
        cancelAnimationFrame(raf);
        stream.getTracks().forEach((t) => t.stop());
        void ctx?.close();
        setLevel(0);
      };
      stopRef.current = stop;
      setMicState({
        status: "ok",
        msg: "Microphone access granted. Speak — the meter should move. The test stops automatically after 8 seconds.",
      });
      setTimeout(stop, 8000);
    } catch (e) {
      const name = e instanceof DOMException ? e.name : "";
      const msg =
        name === "NotAllowedError"
          ? "Permission was denied. Allow microphone access for this site in your browser's address-bar permissions, then try again."
          : name === "NotFoundError"
            ? "No microphone was found. Connect a headset or microphone and try again."
            : `Could not open the microphone${e instanceof Error ? `: ${e.message}` : "."}`;
      setMicState({ status: "error", msg });
    }
  };

  return (
    <Card
      id="voice"
      title="Voice & microphone"
      icon={Volume2}
      description="ATC and instructor speech uses your browser's built-in speech synthesis; push-to-talk uses browser speech recognition where available."
    >
      <Row label="ATC speech" hint="Read controller transmissions aloud." htmlFor="atcspeech">
        <Toggle id="atcspeech" checked={v.atcSpeech} onChange={(x) => setV("atcSpeech", x)} />
      </Row>
      <Row label="Voice">
        {ttsSupported ? (
          <Select
            value={v.voiceName || "__default"}
            onValueChange={(x) => setV("voiceName", x === "__default" ? "" : x)}
          >
            <SelectTrigger className="w-64">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__default">Browser default</SelectItem>
              {voices.map((x) => (
                <SelectItem key={x.name} value={x.name}>
                  {x.name} ({x.lang})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <span className="text-xs text-warning">
            Speech synthesis is not supported in this browser.
          </span>
        )}
      </Row>
      <Row label="Speech rate" hint={<span className="font-mono">{v.rate.toFixed(2)}×</span>}>
        <Slider
          className="w-56"
          min={0.6}
          max={1.6}
          step={0.05}
          value={[v.rate]}
          onValueChange={(x) => setV("rate", x[0] ?? 1)}
          aria-label="Speech rate"
        />
      </Row>
      <Row label="Volume" hint={<span className="font-mono">{Math.round(v.volume * 100)}%</span>}>
        <Slider
          className="w-56"
          min={0}
          max={1}
          step={0.05}
          value={[v.volume]}
          onValueChange={(x) => setV("volume", x[0] ?? 0.9)}
          aria-label="Speech volume"
        />
      </Row>
      <Row label="Test voice">
        <Button size="sm" variant="outline" onClick={test} disabled={!ttsSupported}>
          <Play className="size-4" /> Play sample transmission
        </Button>
      </Row>
      <Row
        label="Microphone input"
        hint={
          srSupported
            ? "Speak your radio calls (push-to-talk) in ATC practice."
            : "Speech recognition isn't available in this browser — you can still type radio calls. Chrome and Edge support it."
        }
        htmlFor="mic"
      >
        <Toggle id="mic" checked={v.micInput} onChange={(x) => setV("micInput", x)} />
      </Row>
      <div className="px-5 py-3.5">
        <div className="flex flex-wrap items-center gap-3">
          <Button
            size="sm"
            variant="outline"
            onClick={() => void testMic()}
            disabled={micState.status === "testing"}
          >
            {micState.status === "testing" ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Mic className="size-4" />
            )}{" "}
            Test microphone permission
          </Button>
          {micState.status === "ok" ? (
            <div
              className="h-2 w-40 overflow-hidden rounded-full bg-muted"
              aria-label="Microphone level"
            >
              <div className="h-full bg-ok transition-[width]" style={{ width: `${level}%` }} />
            </div>
          ) : null}
        </div>
        {micState.msg ? (
          <p
            className={cn(
              "mt-2 flex items-start gap-1.5 text-xs",
              micState.status === "error" ? "text-warning" : "text-ok",
            )}
          >
            {micState.status === "error" ? (
              <XCircle className="mt-0.5 size-3.5 shrink-0" />
            ) : (
              <CheckCircle2 className="mt-0.5 size-3.5 shrink-0" />
            )}
            {micState.msg}
          </p>
        ) : null}
      </div>
    </Card>
  );
}

/* ------------------------------ Graphics ------------------------------ */

function GraphicsSection({ settings }: { settings: Settings }) {
  const g = settings.sim;
  const setS = <K extends keyof Settings["sim"]>(k: K, val: Settings["sim"][K]) =>
    upd((s) => ({ ...s, sim: { ...s.sim, [k]: val } }));
  return (
    <Card id="graphics" title="Simulator graphics" icon={Monitor}>
      <Row label="Graphics quality" hint="Lower settings improve frame rate on laptops and phones.">
        <Seg
          label="Graphics quality"
          value={g.quality}
          options={[
            { v: "low", l: "Low" },
            { v: "medium", l: "Medium" },
            { v: "high", l: "High" },
          ]}
          onChange={(v) => setS("quality", v)}
        />
      </Row>
      <Row
        label="Heads-up display"
        hint="Overlay of airspeed, altitude, heading and scenario guidance."
        htmlFor="hud"
      >
        <Toggle id="hud" checked={g.hud} onChange={(v) => setS("hud", v)} />
      </Row>
      <Row label="Show frame rate (FPS)" htmlFor="fps">
        <Toggle id="fps" checked={g.showFps} onChange={(v) => setS("showFps", v)} />
      </Row>
    </Card>
  );
}

/* ------------------------------ Controls ------------------------------ */

const KEYMAP: [string, string][] = [
  ["W / S  or  ↑ / ↓", "Pitch down / up (nose)"],
  ["A / D  or  ← / →", "Roll left / right"],
  ["Q / E", "Rudder left / right"],
  ["Shift / Ctrl  or  + / −", "Throttle increase / decrease"],
  ["F / V", "Flaps up / down (one detent)"],
  ["G", "Landing gear up / down"],
  ["B", "Wheel brakes (hold)"],
  ["P", "Parking brake"],
  ["[ / ]", "Elevator trim nose down / nose up"],
  ["Z", "Autopilot on / off"],
  ["C", "Cycle camera view"],
  ["1 – 5", "Select camera view"],
  ["Space", "Pause / resume"],
];

function ControlsSection({ settings }: { settings: Settings }) {
  const g = settings.sim;
  const setS = <K extends keyof Settings["sim"]>(k: K, val: Settings["sim"][K]) =>
    upd((s) => ({ ...s, sim: { ...s.sim, [k]: val } }));
  return (
    <Card id="controls" title="Control configuration" icon={Gamepad2}>
      <div className="px-5 py-4">
        <p className="label-caps mb-2 flex items-center gap-1.5">
          <Keyboard className="size-3.5" /> Keyboard map
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <tbody>
              {KEYMAP.map(([k, a]) => (
                <tr key={k} className="border-b last:border-0">
                  <td className="py-1.5 pr-4 whitespace-nowrap">
                    {k.split("  ").map((part, i) => (
                      <span key={i} className={i ? "ml-1" : undefined}>
                        {part === "or" ? (
                          <span className="text-xs text-muted-foreground">or</span>
                        ) : (
                          part.split(" / ").map((key, j) => (
                            <span key={j}>
                              {j ? <span className="mx-0.5 text-muted-foreground">/</span> : null}
                              <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[11px]">
                                {key.trim()}
                              </kbd>
                            </span>
                          ))
                        )}
                      </span>
                    ))}
                  </td>
                  <td className="py-1.5 text-muted-foreground">{a}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <Row
        label="Invert pitch"
        hint="Flight-stick style: pushing forward (W / ↑) pitches up instead of down."
        htmlFor="invert"
      >
        <Toggle id="invert" checked={g.invertPitch} onChange={(v) => setS("invertPitch", v)} />
      </Row>
      <Row
        label="Control sensitivity"
        hint={<span className="font-mono">{g.sensitivity.toFixed(2)}×</span>}
      >
        <Slider
          className="w-56"
          min={0.5}
          max={2}
          step={0.05}
          value={[g.sensitivity]}
          onValueChange={(x) => setS("sensitivity", x[0] ?? 1)}
          aria-label="Control sensitivity"
        />
      </Row>
      <Row
        label="Mouse yoke"
        hint="Fly with the mouse: horizontal = roll, vertical = pitch (click the view to capture)."
        htmlFor="mouse"
      >
        <Toggle id="mouse" checked={g.mouseYoke} onChange={(v) => setS("mouseYoke", v)} />
      </Row>
    </Card>
  );
}

/* ------------------------------ Accessibility ------------------------------ */

function AccessibilitySection({ settings, night }: { settings: Settings; night: boolean }) {
  const a = settings.accessibility;
  const setA = <K extends keyof Settings["accessibility"]>(k: K, val: boolean) =>
    upd((s) => ({ ...s, accessibility: { ...s.accessibility, [k]: val } }));
  return (
    <Card id="accessibility" title="Accessibility & theme" icon={Accessibility}>
      <Row
        label="Reduce motion"
        hint="Turns off interface animations and transitions."
        htmlFor="rm"
      >
        <Toggle id="rm" checked={a.reducedMotion} onChange={(v) => setA("reducedMotion", v)} />
      </Row>
      <Row
        label="Large text"
        hint="Increases the size of all text and controls by 12.5%."
        htmlFor="lt"
      >
        <Toggle id="lt" checked={a.largeText} onChange={(v) => setA("largeText", v)} />
      </Row>
      <Row
        label="High contrast"
        hint="Brighter text, stronger borders and focus outlines."
        htmlFor="hc"
      >
        <Toggle id="hc" checked={a.highContrast} onChange={(v) => setA("highContrast", v)} />
      </Row>
      <Row
        label="Theme"
        hint="TeachX uses a dark cockpit theme designed for long study sessions and avionics realism."
      >
        <Pill tone="primary">Dark cockpit</Pill>
      </Row>
      <Row
        label="Night (red) cockpit lighting"
        hint="Red-tinted interface that preserves night vision — like red flood lighting in the cockpit. Saved on this device."
        htmlFor="night"
      >
        <span className="flex items-center gap-2">
          <Moon className={cn("size-4", night ? "text-primary" : "text-muted-foreground")} />
          <Toggle id="night" checked={night} onChange={setNightLighting} />
        </span>
      </Row>
    </Card>
  );
}

/* ------------------------------ Notifications ------------------------------ */

function NotificationsSection({ settings }: { settings: Settings }) {
  const n = settings.notifications;
  const setN = <K extends keyof Settings["notifications"]>(k: K, val: boolean) =>
    upd((s) => ({ ...s, notifications: { ...s.notifications, [k]: val } }));
  return (
    <Card
      id="notifications"
      title="Notifications"
      icon={Bell}
      description="In-app only — TeachX does not send emails or push notifications."
    >
      <Row
        label="Achievement pop-ups"
        hint="Show a notification when you unlock an achievement."
        htmlFor="ach"
      >
        <Toggle
          id="ach"
          checked={n.achievementToasts}
          onChange={(v) => setN("achievementToasts", v)}
        />
      </Row>
      <Row
        label="Study reminders"
        hint="In-app reminders about your daily study goal."
        htmlFor="rem"
      >
        <Toggle id="rem" checked={n.studyReminders} onChange={(v) => setN("studyReminders", v)} />
      </Row>
    </Card>
  );
}

/* ------------------------------ AI provider ------------------------------ */

const PROVIDERS: { v: Settings["ai"]["provider"]; l: string; d: string }[] = [
  {
    v: "on-device",
    l: "On-device AI (recommended)",
    d: `${MODEL_LABEL} runs right here in your browser on your GPU. One-time download (${MODEL_DOWNLOAD_LABEL}), then cached. Nothing is sent to any server. Needs WebGPU (recent Chrome or Edge on desktop).`,
  },
  {
    v: "local-browser",
    l: "Your own local model server",
    d: "A model you run on your own computer (e.g. Ollama or LM Studio), called directly from this browser via an OpenAI-compatible URL. No key needed.",
  },
  {
    v: "scripted",
    l: "Scripted (no AI)",
    d: "Deterministic scripted ATC, rubric-based oral grading. Works fully offline.",
  },
];

function OnDevicePanel() {
  const local = useLocalModel();
  const enabled = useStore((s) => s.settings.ai.onDeviceEnabled);
  const [cached, setCached] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    void isModelCached().then((c) => alive && setCached(c));
    return () => {
      alive = false;
    };
  }, [local.status]);
  const running = local.status === "ready" || local.status === "thinking";
  return (
    <div className="space-y-3 px-5 py-4">
      <p className="label-caps">On-device model</p>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-medium">{MODEL_LABEL}</span>
        {running ? (
          <Pill tone="ok">Running on this device</Pill>
        ) : local.status === "loading" ? (
          <Pill tone="primary">Loading · {Math.round(local.progress * 100)}%</Pill>
        ) : local.status === "unsupported" ? (
          <Pill tone="caution">WebGPU not available</Pill>
        ) : local.status === "error" ? (
          <Pill tone="warning">Couldn&apos;t start</Pill>
        ) : (
          <Pill>Off</Pill>
        )}
        {cached ? <Pill tone="cyan">Downloaded</Pill> : null}
        {enabled && !running ? (
          <span className="text-[11px] text-muted-foreground">
            Starts automatically when you use an AI feature.
          </span>
        ) : null}
      </div>
      {local.status === "loading" ? (
        <div>
          <div className="h-1.5 overflow-hidden rounded bg-muted">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${Math.round(local.progress * 100)}%` }}
            />
          </div>
          <p className="mt-1 truncate text-[11px] text-muted-foreground">{local.message}</p>
        </div>
      ) : local.message && local.status !== "ready" ? (
        <p className="text-xs text-muted-foreground">{local.message}</p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {running ? (
          <Button size="sm" variant="outline" onClick={stopLocalModel}>
            Stop &amp; free GPU memory
          </Button>
        ) : (
          <Button
            size="sm"
            onClick={() => void enableOnDeviceAi()}
            disabled={local.status === "loading"}
          >
            {local.status === "loading" ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Cpu className="size-4" />
            )}{" "}
            {cached ? "Start on-device AI" : `Download & start (${MODEL_DOWNLOAD_LABEL}, one time)`}
          </Button>
        )}
        {enabled ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              stopLocalModel();
              upd((s) => ({ ...s, ai: { ...s.ai, onDeviceEnabled: false } }));
            }}
          >
            Don&apos;t auto-start
          </Button>
        ) : null}
      </div>
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        The model files come from Hugging Face the first time and are stored in your browser&apos;s
        cache. After that it works offline. Clearing site data removes the download.
      </p>
    </div>
  );
}

function AiSection({ settings }: { settings: Settings }) {
  const ai = settings.ai;
  const setAi = <K extends keyof Settings["ai"]>(k: K, val: Settings["ai"][K]) =>
    upd((s) => ({ ...s, ai: { ...s.ai, [k]: val } }));
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [test, setTest] = useState<{
    state: "idle" | "testing" | "ok" | "error";
    msg?: string;
    models?: string[];
  }>({ state: "idle" });

  useEffect(() => {
    let alive = true;
    getAiStatus()
      .then((s) => alive && setStatus(s))
      .catch(() => alive && setStatus(null));
    return () => {
      alive = false;
    };
  }, [ai.provider]);

  const runTest = async () => {
    const base = ai.localBrowserUrl.trim().replace(/\/+$/, "");
    if (!/^https?:\/\//i.test(base)) {
      setTest({
        state: "error",
        msg: "Enter a full URL starting with http:// or https:// (e.g. http://localhost:11434/v1).",
      });
      return;
    }
    setTest({ state: "testing" });
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    try {
      const res = await fetch(`${base}/models`, { signal: ctrl.signal });
      if (!res.ok) {
        setTest({
          state: "error",
          msg: `The server answered HTTP ${res.status} ${res.statusText}. Check that the URL ends in /v1 for OpenAI-compatible servers.`,
        });
        return;
      }
      const json = (await res.json()) as { data?: { id?: string }[]; models?: { name?: string }[] };
      const models = (
        json.data?.map((m) => m.id ?? "") ??
        json.models?.map((m) => m.name ?? "") ??
        []
      ).filter(Boolean);
      const want = ai.localBrowserModel.trim();
      const found = !want || models.some((m) => m === want || m.split(":")[0] === want);
      setTest({
        state: found ? "ok" : "error",
        models,
        msg: found
          ? `Connected. ${models.length} model${models.length === 1 ? "" : "s"} available${want ? `; "${want}" found` : ""}.`
          : `Connected, but model "${want}" was not found. Pull it first (e.g. "ollama pull ${want}") or pick one of the models listed below.`,
      });
    } catch (e) {
      const aborted = e instanceof DOMException && e.name === "AbortError";
      const mixed =
        typeof window !== "undefined" &&
        window.location.protocol === "https:" &&
        base.startsWith("http://") &&
        !/^http:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/i.test(base);
      setTest({
        state: "error",
        msg: aborted
          ? "No response within 8 seconds. Is the model server running?"
          : mixed
            ? "The browser blocked this request because this page is HTTPS and the model URL is plain HTTP on another host (mixed content). Use localhost, or serve the model over HTTPS."
            : `Could not reach ${base}/models. Make sure the server is running. If it is, the browser probably blocked the request because of CORS: for Ollama, restart it with the environment variable OLLAMA_ORIGINS set to this site's origin${typeof window !== "undefined" ? ` (${window.location.origin})` : ""} or "*" — e.g. OLLAMA_ORIGINS="*" ollama serve. LM Studio: enable CORS in the server settings.`,
      });
    } finally {
      clearTimeout(timer);
    }
  };

  return (
    <Card
      id="ai"
      title="AI provider"
      icon={Bot}
      description="Powers AI ATC, the AI Instructor and the oral examiner. Every feature also works in scripted mode without any AI."
    >
      <div className="space-y-2 px-5 py-4" role="radiogroup" aria-label="AI provider">
        {PROVIDERS.map((p) => {
          const avail =
            status === null
              ? null
              : p.v === "on-device"
                ? status.webgpu
                : p.v === "local-browser"
                  ? ai.provider === "local-browser"
                    ? status.localBrowser
                    : null
                  : true;
          return (
            <button
              key={p.v}
              type="button"
              role="radio"
              aria-checked={ai.provider === p.v}
              onClick={() => setAi("provider", p.v)}
              className={cn(
                "flex w-full items-start gap-3 rounded-md border px-3 py-2.5 text-left transition-colors",
                ai.provider === p.v ? "border-primary/50 bg-primary/10" : "hover:bg-accent/40",
              )}
            >
              <span
                className={cn(
                  "mt-1 grid size-3.5 shrink-0 place-items-center rounded-full border",
                  ai.provider === p.v ? "border-primary" : "border-muted-foreground",
                )}
              >
                {ai.provider === p.v ? <span className="size-1.5 rounded-full bg-primary" /> : null}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2 text-sm font-medium">
                  {p.l}
                  {p.v === "on-device" && status ? (
                    status.webgpu ? (
                      <Pill tone="ok">WebGPU available</Pill>
                    ) : (
                      <Pill tone="caution">Not supported in this browser</Pill>
                    )
                  ) : null}
                  {p.v === "local-browser" && avail !== null ? (
                    avail ? (
                      <Pill tone="ok">Available</Pill>
                    ) : (
                      <Pill>Not configured</Pill>
                    )
                  ) : null}
                </span>
                <span className="mt-0.5 block text-xs text-muted-foreground">{p.d}</span>
              </span>
            </button>
          );
        })}
      </div>
      {ai.provider === "on-device" ? <OnDevicePanel /> : null}
      {ai.provider === "local-browser" ? (
        <div className="space-y-3 px-5 py-4">
          <p className="label-caps">Local model in this browser</p>
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_200px]">
            <label className="text-xs">
              <span className="mb-1 block text-muted-foreground">OpenAI-compatible base URL</span>
              <Input
                value={ai.localBrowserUrl}
                onChange={(e) => setAi("localBrowserUrl", e.target.value)}
                placeholder="http://localhost:11434/v1"
                className="font-mono"
              />
            </label>
            <label className="text-xs">
              <span className="mb-1 block text-muted-foreground">Model name</span>
              <Input
                value={ai.localBrowserModel}
                onChange={(e) => setAi("localBrowserModel", e.target.value)}
                placeholder="llama3.1"
                className="font-mono"
              />
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              size="sm"
              variant="outline"
              onClick={() => void runTest()}
              disabled={test.state === "testing"}
            >
              {test.state === "testing" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Globe2 className="size-4" />
              )}{" "}
              Test connection
            </Button>
            <span className="text-[11px] text-muted-foreground">
              Calls {ai.localBrowserUrl.replace(/\/+$/, "")}/models from your browser.
            </span>
          </div>
          {test.msg ? (
            <div
              className={cn(
                "rounded-md border px-3 py-2 text-xs",
                test.state === "ok" ? "border-ok/30 bg-ok/5" : "border-warning/30 bg-warning/5",
              )}
            >
              <p className="flex items-start gap-1.5">
                {test.state === "ok" ? (
                  <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-ok" />
                ) : (
                  <XCircle className="mt-0.5 size-3.5 shrink-0 text-warning" />
                )}
                <span>{test.msg}</span>
              </p>
              {test.models?.length ? (
                <div className="mt-2 flex flex-wrap gap-1">
                  {test.models.slice(0, 20).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setAi("localBrowserModel", m)}
                      className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[11px] hover:border-primary/50"
                    >
                      {m}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
      <div className="px-5 py-3">
        <Notice tone="info" title="All AI on TeachX is local.">
          Nothing is sent to a cloud AI service and there are no API keys. The on-device model runs
          inside your browser; your own model server is reached directly at the URL above. AI output
          is a training aid and may be wrong; always verify against official FAA sources.
        </Notice>
      </div>
    </Card>
  );
}

/* ------------------------------ Data ------------------------------ */

function DataSection() {
  const counts = useStore((s) => s);
  const fileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const exportAll = () => {
    downloadFile(
      `teachx-training-${new Date().toISOString().slice(0, 10)}.json`,
      actions.exportData(),
      "application/json",
    );
    setMsg({
      ok: true,
      text: "Export downloaded. Keep it somewhere safe — it's your only backup.",
    });
  };

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    try {
      const text = await f.text();
      actions.importData(text);
      setMsg({
        ok: true,
        text: `Imported ${f.name}. Your training record has been replaced with the file's contents.`,
      });
    } catch (e) {
      setMsg({
        ok: false,
        text:
          e instanceof SyntaxError
            ? "That file isn't valid JSON."
            : e instanceof Error
              ? e.message
              : "Import failed.",
      });
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <Card
      id="data"
      title="Data management"
      icon={Database}
      description="Your training record lives in this browser's local storage. Clearing browser data deletes it — export regularly."
    >
      <div className="px-5 py-3 text-xs text-muted-foreground">
        {Object.keys(counts.lessons).length} lessons · {counts.quizzes.length} quizzes ·{" "}
        {counts.exams.length} exams · {counts.flights.length} flights · {counts.atcSessions.length}{" "}
        ATC sessions · {counts.orals.length} oral exams · {counts.checkrides.length} checkrides ·{" "}
        {counts.flightPlans.length} flight plans
      </div>
      <Row label="Export" hint="Download your complete training record as JSON.">
        <Button size="sm" variant="outline" onClick={exportAll}>
          <Download className="size-4" /> Export JSON
        </Button>
      </Row>
      <Row label="Import" hint="Restore from a TeachX export. This replaces your current record.">
        <>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => void onFile(e.target.files?.[0])}
          />
          <ConfirmAction
            title="Replace your training record?"
            description="Importing a file replaces all current progress, settings and logbook entries in this browser with the file's contents. Export first if you want a backup."
            confirmLabel="Choose file"
            destructive={false}
            onConfirm={() => fileRef.current?.click()}
            trigger={
              <Button size="sm" variant="outline">
                <Upload className="size-4" /> Import JSON
              </Button>
            }
          />
        </>
      </Row>
      <Row
        label="Reset everything"
        hint="Permanently delete your profile, progress, logbook, plans and settings from this browser."
      >
        <ConfirmAction
          title="Reset all training data?"
          description="This permanently deletes your pilot profile, lesson progress, quiz and exam history, logbook, ATC sessions, flight plans, achievements and settings from this browser. It cannot be undone."
          confirmLabel="Delete everything"
          onConfirm={() => {
            actions.resetAll();
            setMsg({ ok: true, text: "All training data was reset." });
          }}
          trigger={
            <Button size="sm" variant="outline" className="text-warning hover:text-warning">
              <Trash2 className="size-4" /> Reset
            </Button>
          }
        />
      </Row>
      {msg ? (
        <div className="px-5 py-3">
          <p
            className={cn("flex items-center gap-1.5 text-xs", msg.ok ? "text-ok" : "text-warning")}
          >
            {msg.ok ? <CheckCircle2 className="size-3.5" /> : <XCircle className="size-3.5" />}
            {msg.text}
          </p>
        </div>
      ) : null}
    </Card>
  );
}
