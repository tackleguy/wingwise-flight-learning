/**
 * Oral exam simulator — session configuration and question selection.
 */
import type { TrackId } from "@/lib/store";
import { ORAL_QUESTIONS, ORAL_TOPICS } from "./questions";
import type { OralLevel, OralQuestion, OralTopic, OralTrack } from "./types";

export * from "./types";
export * from "./grading";
export { ORAL_QUESTIONS, ORAL_TOPICS };

export interface LevelInfo {
  label: string;
  count: number;
  hints: boolean;
  maxDifficulty: 1 | 2 | 3;
  description: string;
}

export const LEVELS: Record<OralLevel, LevelInfo> = {
  beginner: {
    label: "Beginner",
    count: 6,
    hints: true,
    maxDifficulty: 1,
    description:
      "6 foundational questions with hints available. A friendly introduction to how an examiner asks and probes.",
  },
  standard: {
    label: "Standard",
    count: 10,
    hints: false,
    maxDifficulty: 2,
    description:
      "10 questions across systems, regulations, weather, performance, aeromedical and risk management.",
  },
  advanced: {
    label: "Advanced",
    count: 14,
    hints: false,
    maxDifficulty: 3,
    description: "14 questions including advanced and instrument topics, with deeper follow-ups.",
  },
  checkride: {
    label: "Checkride",
    count: 16,
    hints: false,
    maxDifficulty: 3,
    description:
      "Full mock oral: 16 scenario-based questions, no hints, examiner-style probing — like the ground portion of a practical test.",
  },
};

export function trackToOral(t: TrackId): OralTrack {
  if (t === "instrument" || t === "cfii") return "instrument";
  if (
    [
      "commercial",
      "atp",
      "multi-engine",
      "complex",
      "high-performance",
      "high-altitude",
      "cfi",
    ].includes(t)
  )
    return "commercial";
  return "private";
}

function shuffle<T>(a: readonly T[]): T[] {
  const r = a.slice();
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = r[i]!;
    r[i] = r[j]!;
    r[j] = t;
  }
  return r;
}

/** Pick questions for a session: filtered by track and difficulty, spread across topics. */
export function selectQuestions(
  level: OralLevel,
  trackId: TrackId,
  count?: number,
): OralQuestion[] {
  const info = LEVELS[level];
  const n = count ?? info.count;
  const track = trackToOral(trackId);
  // Advanced sessions add instrument questions for every track ("incl. instrument").
  const pool = ORAL_QUESTIONS.filter(
    (q) => q.tracks.includes(track) || (level === "advanced" && q.tracks.includes("instrument")),
  );

  let eligible = pool.filter((q) => q.difficulty <= info.maxDifficulty);
  if (eligible.length < n)
    eligible = pool.filter((q) => q.difficulty <= Math.min(3, info.maxDifficulty + 1));
  if (eligible.length < n) eligible = pool;

  // Group by topic, then round-robin so a session covers many topics.
  const byTopic = new Map<OralTopic, OralQuestion[]>();
  for (const q of shuffle(eligible)) {
    const list = byTopic.get(q.topic) ?? [];
    list.push(q);
    byTopic.set(q.topic, list);
  }
  // Checkride sessions lead each topic with its scenario-based question when one exists.
  if (level === "checkride") {
    for (const [t, list] of byTopic)
      byTopic.set(t, [...list.filter((q) => q.scenario), ...list.filter((q) => !q.scenario)]);
  }
  // Instrument-track sessions prioritize instrument topics.
  const topicOrder = shuffle([...byTopic.keys()]).sort((a, b) => {
    if (track !== "instrument") return 0;
    const ai = a.startsWith("IFR") || a === "Instrument Approaches" ? 0 : 1;
    const bi = b.startsWith("IFR") || b === "Instrument Approaches" ? 0 : 1;
    return ai - bi;
  });
  const picked: OralQuestion[] = [];
  while (picked.length < n) {
    let progressed = false;
    for (const t of topicOrder) {
      const list = byTopic.get(t);
      const next = list?.shift();
      if (next) {
        picked.push(next);
        progressed = true;
        if (picked.length >= n) break;
      }
    }
    if (!progressed) break;
  }
  return picked;
}

export const ORAL_TOPIC_LESSON: Record<OralTopic, { label: string; to: string }> = {
  "Aircraft Systems": { label: "VFR Academy · Aircraft Systems", to: "/academy/vfr/systems" },
  Regulations: { label: "VFR Academy · Regulations", to: "/academy/vfr/regulations" },
  Weather: { label: "Weather Lab", to: "/weather" },
  Navigation: {
    label: "VFR Academy · Dead Reckoning & Radio Navigation",
    to: "/academy/vfr/dead-reckoning",
  },
  Performance: {
    label: "VFR Academy · Takeoffs & Landings (performance)",
    to: "/academy/vfr/takeoffs-landings",
  },
  "Weight & Balance": {
    label: "VFR Academy · Cross-Country Planning (W&B)",
    to: "/academy/vfr/cross-country",
  },
  Aeromedical: { label: "VFR Academy · ADM & Human Factors", to: "/academy/vfr/adm" },
  "Emergency Procedures": {
    label: "VFR Academy · Emergency Procedures",
    to: "/academy/vfr/emergencies",
  },
  "Cross-Country Planning": {
    label: "VFR Academy · Cross-Country",
    to: "/academy/vfr/cross-country",
  },
  "Risk Management": {
    label: "VFR Academy · Aeronautical Decision-Making",
    to: "/academy/vfr/adm",
  },
  Airspace: { label: "VFR Academy · Airspace", to: "/academy/vfr/airspace" },
  "Flight Planning": { label: "Flight Planner", to: "/planner" },
  "Commercial Operations": { label: "Training Pathways", to: "/training" },
  Maneuvers: { label: "Flight Simulator", to: "/simulator" },
  "IFR Regulations": { label: "IFR Academy · Regulations", to: "/academy/ifr/regulations" },
  "IFR Procedures": { label: "IFR Academy · IFR Flight Planning", to: "/academy/ifr/planning" },
  "Instrument Approaches": { label: "IFR Academy · Approaches", to: "/academy/ifr/approaches" },
  "IFR Weather": { label: "IFR Academy · IFR Weather", to: "/academy/ifr/weather" },
  "IFR Emergencies": { label: "IFR Academy · IFR Emergencies", to: "/academy/ifr/emergencies" },
};
