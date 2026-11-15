/**
 * SkyReady persistent training record.
 *
 * All progress (profile, lessons, quizzes, exams, flights, ATC sessions, oral exams,
 * checkrides, settings) lives in ONE store so every section of the app stays connected.
 *
 * Persistence: browser localStorage (per device). The shape mirrors the relational model in
 * src/lib/models.ts so it can later be synced to a Postgres backend (Lovable Cloud).
 *
 * Usage in components:
 *   const flights = useStore((s) => s.flights);
 *   actions.logFlight({...})
 */
import { useSyncExternalStore } from "react";
import { LEGACY_KEYS, migrateLegacyKey } from "@/lib/legacy-storage";

export type TrackId =
  | "student"
  | "private"
  | "instrument"
  | "commercial"
  | "atp"
  | "multi-engine"
  | "seaplane"
  | "tailwheel"
  | "high-performance"
  | "complex"
  | "high-altitude"
  | "cfi"
  | "cfii"
  | "night"
  | "cross-country"
  | "emergency"
  | "mountain"
  | "adm";

export interface PilotProfile {
  id: string;
  name: string;
  email: string;
  /** Simulated aircraft callsign, e.g. "N172TX". */
  callsign: string;
  homeAirport: string;
  goal: TrackId;
  createdAt: string;
}

export interface AssessmentResult {
  date: string;
  score: number;
  total: number;
  byCategory: Record<string, { correct: number; total: number }>;
  recommendedTrack: TrackId;
  level: "beginner" | "intermediate" | "advanced";
}

export interface QuizAttempt {
  id: string;
  date: string;
  /** "vfr" | "ifr" | other course id */
  course: string;
  moduleId: string;
  title: string;
  score: number;
  total: number;
  /** true for end-of-module final quiz */
  final: boolean;
}

export interface ExamAttempt {
  id: string;
  date: string;
  examId: string;
  title: string;
  mode: "timed" | "study";
  correct: number;
  incorrect: number;
  unanswered: number;
  total: number;
  /** 0–100 */
  scorePct: number;
  passed: boolean;
  timeUsedSec: number;
  bySubject: Record<string, { correct: number; total: number }>;
  missedQuestionIds: string[];
}

export interface FlightObjectiveResult {
  text: string;
  met: boolean;
  detail?: string;
}

export interface FlightLog {
  id: string;
  date: string;
  aircraftId: string;
  departure: string;
  destination: string;
  durationSec: number;
  /** Scenario category */
  kind: "free" | "vfr" | "ifr" | "emergency" | "checkride" | "avionics";
  rules: "VFR" | "IFR";
  scenarioId: string;
  scenarioTitle: string;
  landings: number;
  approaches: number;
  night: boolean;
  maneuvers: string[];
  objectives: FlightObjectiveResult[];
  feedback: string[];
  /** 0–100 */
  score: number;
  /** Optional link to a checkride attempt */
  checkrideId?: string;
}

export interface TranscriptLine {
  from: "pilot" | "atc" | "system";
  station?: string;
  text: string;
  t: number;
}

export interface AtcSession {
  id: string;
  date: string;
  scenarioId: string;
  title: string;
  airport: string;
  difficulty: "beginner" | "intermediate" | "advanced" | "checkride";
  engine: "scripted" | "ai";
  /** 0–100 */
  score: number;
  breakdown: Record<string, number>;
  feedback: string[];
  transcript: TranscriptLine[];
}

export interface OralAttempt {
  id: string;
  date: string;
  level: "beginner" | "standard" | "advanced" | "checkride";
  trackId: TrackId;
  /** 0–100 */
  score: number;
  items: { topic: string; question: string; answer: string; score: number; feedback: string }[];
}

export interface CheckrideStageResult {
  id: string;
  name: string;
  /** 0–100 */
  score: number;
  status: "satisfactory" | "unsatisfactory" | "incomplete";
  notes: string[];
  acsRef?: string;
}

export interface CheckrideAttempt {
  id: string;
  date: string;
  trackId: TrackId;
  title: string;
  stages: CheckrideStageResult[];
  overall: number;
  passed: boolean;
  completed: boolean;
}

export interface ActivityItem {
  id: string;
  date: string;
  kind:
    | "lesson"
    | "quiz"
    | "exam"
    | "flight"
    | "atc"
    | "oral"
    | "checkride"
    | "avionics"
    | "achievement"
    | "account"
    | "planner";
  text: string;
  link?: string;
}

export interface SavedFlightPlan {
  id: string;
  date: string;
  name: string;
  rules: "VFR" | "IFR";
  aircraftId: string;
  departure: string;
  destination: string;
  alternate: string;
  /** Waypoint identifiers (airports/navaids) or "lat,lon" strings */
  route: string[];
  cruiseAltFt: number;
  cruiseKtas: number;
  windDir: number;
  windKt: number;
  fuelGal: number;
  departureTime: string;
}

export interface Settings {
  units: {
    altitude: "ft" | "m";
    distance: "nm" | "km";
    speed: "kt" | "kmh";
    pressure: "inHg" | "hPa";
  };
  jurisdiction: "FAA" | "EASA" | "ICAO";
  preferredAircraft: string;
  voice: { atcSpeech: boolean; rate: number; volume: number; voiceName: string; micInput: boolean };
  sim: {
    quality: "low" | "medium" | "high";
    showFps: boolean;
    invertPitch: boolean;
    mouseYoke: boolean;
    sensitivity: number;
    hud: boolean;
  };
  accessibility: { reducedMotion: boolean; largeText: boolean; highContrast: boolean };
  notifications: { studyReminders: boolean; achievementToasts: boolean };
  training: {
    dailyGoalMin: number;
    showHints: boolean;
    difficulty: "beginner" | "intermediate" | "advanced";
  };
  ai: {
    /**
     * All AI is local:
     *   "on-device"     — model runs in this browser on the GPU (WebLLM), default
     *   "local-browser" — the user's own OpenAI-compatible model server (e.g. Ollama on their computer)
     *   "scripted"      — no AI; rule-based training mode
     */
    provider: "on-device" | "local-browser" | "scripted";
    /** Set once the user has turned the on-device model on; it then starts automatically from cache. */
    onDeviceEnabled: boolean;
    /** OpenAI-compatible endpoint reachable from the browser, e.g. http://localhost:11434/v1 (Ollama). No keys stored. */
    localBrowserUrl: string;
    localBrowserModel: string;
  };
}

export interface TrainingState {
  version: 1;
  profile: PilotProfile | null;
  assessment: AssessmentResult | null;
  /** lessonId -> completed ISO date */
  lessons: Record<string, string>;
  quizzes: QuizAttempt[];
  exams: ExamAttempt[];
  flights: FlightLog[];
  atcSessions: AtcSession[];
  orals: OralAttempt[];
  checkrides: CheckrideAttempt[];
  /** Avionics lab task ids completed */
  avionicsTasks: Record<string, string>;
  flightPlans: SavedFlightPlan[];
  /** achievementId -> unlocked ISO date */
  achievements: Record<string, string>;
  activity: ActivityItem[];
  /** Flashcard ids marked as known */
  flashcardsKnown: Record<string, true>;
  settings: Settings;
}

export const DEFAULT_SETTINGS: Settings = {
  units: { altitude: "ft", distance: "nm", speed: "kt", pressure: "inHg" },
  jurisdiction: "FAA",
  preferredAircraft: "c172",
  voice: { atcSpeech: true, rate: 1.05, volume: 0.9, voiceName: "", micInput: true },
  sim: {
    quality: "medium",
    showFps: false,
    invertPitch: false,
    mouseYoke: false,
    sensitivity: 1,
    hud: true,
  },
  accessibility: { reducedMotion: false, largeText: false, highContrast: false },
  notifications: { studyReminders: true, achievementToasts: true },
  training: { dailyGoalMin: 30, showHints: true, difficulty: "beginner" },
  ai: {
    provider: "on-device",
    onDeviceEnabled: false,
    localBrowserUrl: "http://localhost:11434/v1",
    localBrowserModel: "llama3.1",
  },
};

export const INITIAL_STATE: TrainingState = {
  version: 1,
  profile: null,
  assessment: null,
  lessons: {},
  quizzes: [],
  exams: [],
  flights: [],
  atcSessions: [],
  orals: [],
  checkrides: [],
  avionicsTasks: {},
  flightPlans: [],
  achievements: {},
  activity: [],
  flashcardsKnown: {},
  settings: DEFAULT_SETTINGS,
};

const [LEGACY_STORAGE_KEY, STORAGE_KEY] = LEGACY_KEYS.training;

let state: TrainingState = INITIAL_STATE;
let loaded = false;
const listeners = new Set<() => void>();

/** Older saves may name cloud/server providers that no longer exist — everything is local now. */
function normalizeAi(ai: Settings["ai"]): Settings["ai"] {
  const p = ai.provider as string;
  const provider: Settings["ai"]["provider"] =
    p === "local-browser" || p === "scripted" ? p : "on-device";
  return { ...ai, provider, onDeviceEnabled: !!ai.onDeviceEnabled };
}

function deepMergeSettings(s: Partial<Settings> | undefined): Settings {
  const d = DEFAULT_SETTINGS;
  if (!s) return d;
  return {
    ...d,
    ...s,
    units: { ...d.units, ...(s.units ?? {}) },
    voice: { ...d.voice, ...(s.voice ?? {}) },
    sim: { ...d.sim, ...(s.sim ?? {}) },
    accessibility: { ...d.accessibility, ...(s.accessibility ?? {}) },
    notifications: { ...d.notifications, ...(s.notifications ?? {}) },
    training: { ...d.training, ...(s.training ?? {}) },
    ai: normalizeAi({ ...d.ai, ...(s.ai ?? {}) }),
  };
}

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  migrateLegacyKey(LEGACY_STORAGE_KEY, STORAGE_KEY);
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<TrainingState>;
      state = { ...INITIAL_STATE, ...parsed, settings: deepMergeSettings(parsed.settings) };
    }
  } catch {
    state = INITIAL_STATE;
  }
  window.addEventListener("storage", (e) => {
    if (e.key !== STORAGE_KEY || !e.newValue) return;
    try {
      const parsed = JSON.parse(e.newValue) as Partial<TrainingState>;
      state = { ...INITIAL_STATE, ...parsed, settings: deepMergeSettings(parsed.settings) };
      listeners.forEach((l) => l());
    } catch {
      /* ignore */
    }
  });
}

function persist() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* storage full or blocked — progress stays in memory for this session */
  }
}

export function getState(): TrainingState {
  load();
  return state;
}

export function setState(updater: (s: TrainingState) => TrainingState) {
  load();
  state = updater(state);
  persist();
  listeners.forEach((l) => l());
  // Re-evaluate achievements after every change (lazy import avoids a cycle).
  void import("./achievements").then((m) => m.evaluateAchievements());
}

function subscribe(l: () => void) {
  load();
  listeners.add(l);
  return () => listeners.delete(l);
}

/** React hook: select a slice of the training state. Selector must return stable references. */
export function useStore<T>(selector: (s: TrainingState) => T): T {
  return useSyncExternalStore(
    subscribe,
    () => selector(getState()),
    () => selector(INITIAL_STATE),
  );
}

/** True once the client store has loaded (use to avoid flashing empty states during SSR). */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}

export const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);

const now = () => new Date().toISOString();

function pushActivity(
  s: TrainingState,
  kind: ActivityItem["kind"],
  text: string,
  link?: string,
): ActivityItem[] {
  const item: ActivityItem = { id: uid(), date: now(), kind, text };
  if (link) item.link = link;
  return [item, ...s.activity].slice(0, 200);
}

export const actions = {
  createProfile(p: Omit<PilotProfile, "id" | "createdAt">) {
    setState((s) => ({
      ...s,
      profile: { ...p, id: uid(), createdAt: now() },
      activity: pushActivity(s, "account", `Pilot profile created for ${p.name}`, "/"),
    }));
  },
  updateProfile(patch: Partial<Omit<PilotProfile, "id" | "createdAt">>) {
    setState((s) => (s.profile ? { ...s, profile: { ...s.profile, ...patch } } : s));
  },
  saveAssessment(a: AssessmentResult) {
    setState((s) => ({
      ...s,
      assessment: a,
      activity: pushActivity(
        s,
        "exam",
        `Knowledge assessment: ${a.score}/${a.total} (${a.level})`,
        "/onboarding",
      ),
    }));
  },
  completeLesson(lessonId: string, title: string, link?: string) {
    setState((s) =>
      s.lessons[lessonId]
        ? s
        : {
            ...s,
            lessons: { ...s.lessons, [lessonId]: now() },
            activity: pushActivity(s, "lesson", `Completed lesson: ${title}`, link),
          },
    );
  },
  recordQuiz(q: Omit<QuizAttempt, "id" | "date">, link?: string) {
    setState((s) => ({
      ...s,
      quizzes: [{ ...q, id: uid(), date: now() }, ...s.quizzes],
      activity: pushActivity(
        s,
        "quiz",
        `${q.final ? "Module exam" : "Quiz"} — ${q.title}: ${q.score}/${q.total}`,
        link,
      ),
    }));
  },
  recordExam(e: Omit<ExamAttempt, "id" | "date">): string {
    const id = uid();
    setState((s) => ({
      ...s,
      exams: [{ ...e, id, date: now() }, ...s.exams],
      activity: pushActivity(
        s,
        "exam",
        `${e.title}: ${Math.round(e.scorePct)}% ${e.passed ? "(pass)" : "(below 70%)"}`,
        "/practice-tests",
      ),
    }));
    return id;
  },
  logFlight(f: Omit<FlightLog, "id" | "date">): string {
    const id = uid();
    setState((s) => ({
      ...s,
      flights: [{ ...f, id, date: now() }, ...s.flights],
      activity: pushActivity(
        s,
        "flight",
        `Sim flight: ${f.scenarioTitle} — score ${Math.round(f.score)}`,
        "/logbook",
      ),
    }));
    return id;
  },
  deleteFlight(id: string) {
    setState((s) => ({ ...s, flights: s.flights.filter((f) => f.id !== id) }));
  },
  recordAtc(a: Omit<AtcSession, "id" | "date">): string {
    const id = uid();
    setState((s) => ({
      ...s,
      atcSessions: [{ ...a, id, date: now() }, ...s.atcSessions],
      activity: pushActivity(
        s,
        "atc",
        `ATC practice: ${a.title} — ${Math.round(a.score)}%`,
        a.engine === "ai" ? "/ai-atc" : "/atc",
      ),
    }));
    return id;
  },
  recordOral(o: Omit<OralAttempt, "id" | "date">): string {
    const id = uid();
    setState((s) => ({
      ...s,
      orals: [{ ...o, id, date: now() }, ...s.orals],
      activity: pushActivity(
        s,
        "oral",
        `Oral exam (${o.level}): ${Math.round(o.score)}%`,
        "/oral-exam",
      ),
    }));
    return id;
  },
  saveCheckride(c: CheckrideAttempt) {
    setState((s) => {
      const exists = s.checkrides.some((x) => x.id === c.id);
      return {
        ...s,
        checkrides: exists
          ? s.checkrides.map((x) => (x.id === c.id ? c : x))
          : [c, ...s.checkrides],
        activity: c.completed
          ? pushActivity(
              s,
              "checkride",
              `Mock checkride (${c.title}): ${c.passed ? "satisfactory" : "unsatisfactory"} — ${Math.round(c.overall)}%`,
              "/checkrides",
            )
          : s.activity,
      };
    });
  },
  completeAvionicsTask(taskId: string, title: string) {
    setState((s) =>
      s.avionicsTasks[taskId]
        ? s
        : {
            ...s,
            avionicsTasks: { ...s.avionicsTasks, [taskId]: now() },
            activity: pushActivity(s, "avionics", `Avionics lab: ${title}`, "/avionics"),
          },
    );
  },
  saveFlightPlan(p: Omit<SavedFlightPlan, "id" | "date">): string {
    const id = uid();
    setState((s) => ({
      ...s,
      flightPlans: [{ ...p, id, date: now() }, ...s.flightPlans],
      activity: pushActivity(
        s,
        "planner",
        `Flight plan saved: ${p.departure} → ${p.destination} (${p.rules})`,
        "/planner",
      ),
    }));
    return id;
  },
  deleteFlightPlan(id: string) {
    setState((s) => ({ ...s, flightPlans: s.flightPlans.filter((p) => p.id !== id) }));
  },
  unlockAchievement(id: string, title: string) {
    setState((s) =>
      s.achievements[id]
        ? s
        : {
            ...s,
            achievements: { ...s.achievements, [id]: now() },
            activity: pushActivity(
              s,
              "achievement",
              `Achievement unlocked: ${title}`,
              "/achievements",
            ),
          },
    );
  },
  toggleFlashcard(id: string) {
    setState((s) => {
      const next = { ...s.flashcardsKnown };
      if (next[id]) delete next[id];
      else next[id] = true;
      return { ...s, flashcardsKnown: next };
    });
  },
  updateSettings(updater: (s: Settings) => Settings) {
    setState((s) => ({ ...s, settings: updater(s.settings) }));
  },
  exportData(): string {
    return JSON.stringify(getState(), null, 2);
  },
  importData(json: string) {
    const parsed = JSON.parse(json) as Partial<TrainingState>;
    if (typeof parsed !== "object" || parsed === null || parsed.version !== 1)
      throw new Error("Not a SkyReady export file");
    setState(() => ({ ...INITIAL_STATE, ...parsed, settings: deepMergeSettings(parsed.settings) }));
  },
  resetAll() {
    setState(() => INITIAL_STATE);
  },
};
