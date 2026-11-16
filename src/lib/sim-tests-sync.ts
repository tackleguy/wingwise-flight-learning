/**
 * Keeps the World Flight Simulator's Tests scores in the pilot's account.
 *
 * The simulator (built from flightsim/, served at /sim/ on this same site, so it shares this
 * site's browser storage) saves on the device:
 *   skyready.sim.tests        — best score, pass and number of attempts per test (its Tests list)
 *   skyready.sim.testsOutbox  — every finished attempt not uploaded yet
 * While a pilot is signed in, this module uploads the outbox to the `sim_test_results` table and
 * merges the account's results back into the device's list, so the scores follow the pilot to
 * any device. The device copy stays the simulator's working store: it works signed out and
 * offline, and anything not uploaded waits in the outbox.
 *
 * The table is created by Lovable (see docs/ARCHITECTURE.md → Persistence). Until it exists the
 * sync reports "not-set-up" and nothing is lost.
 */
import { useEffect, useSyncExternalStore } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useAccount } from "@/lib/account";

export const SIM_TESTS_TABLE = "sim_test_results";
export const RESULTS_KEY = "skyready.sim.tests";
export const OUTBOX_KEY = "skyready.sim.testsOutbox";
/** Set once this device's older results (saved before the outbox existed) have been offered for upload. */
export const SEEDED_KEY = "skyready.sim.testsSeeded";

export interface SimObjectiveResult {
  label: string;
  status: string;
  detail: string;
  weight: number;
  critical: boolean;
}

/** One finished attempt, as the simulator saves it (`TestResult` in flightsim/src/training/types.ts). */
export interface SimTestResult {
  id: string;
  title: string;
  score: number;
  passed: boolean;
  /** When it ended, ms since 1970. */
  at: number;
  durationSec: number;
  endedBecause: string;
  objectives: SimObjectiveResult[];
}

export interface StoredSimResult {
  best: number;
  passed: boolean;
  attempts: number;
  last: SimTestResult;
}
export type StoredSimResults = Record<string, StoredSimResult>;

/** A row of `sim_test_results` (user_id, id and created_at are filled by the database). */
export interface SimTestRow {
  test_id: string;
  title: string;
  score: number;
  passed: boolean;
  duration_sec: number;
  ended_because: string;
  objectives: SimObjectiveResult[];
  flown_at: string;
}

const ROW_COLUMNS = "test_id,title,score,passed,duration_sec,ended_because,objectives,flown_at";

export function toRow(r: SimTestResult): SimTestRow {
  return {
    test_id: r.id,
    title: r.title,
    score: Math.max(0, Math.min(100, Math.round(r.score))),
    passed: r.passed,
    duration_sec: Math.max(0, Math.round(r.durationSec || 0)),
    ended_because: r.endedBecause ?? "",
    objectives: Array.isArray(r.objectives) ? r.objectives : [],
    flown_at: new Date(r.at).toISOString(),
  };
}

export function fromRow(row: SimTestRow): SimTestResult {
  return {
    id: row.test_id,
    title: row.title,
    score: row.score,
    passed: row.passed,
    at: Date.parse(row.flown_at),
    durationSec: row.duration_sec,
    endedBecause: row.ended_because,
    objectives: Array.isArray(row.objectives) ? row.objectives : [],
  };
}

export function isSimTestResult(v: unknown): v is SimTestResult {
  const r = v as SimTestResult | null;
  return (
    !!r &&
    typeof r === "object" &&
    typeof r.id === "string" &&
    typeof r.title === "string" &&
    typeof r.score === "number" &&
    typeof r.passed === "boolean" &&
    typeof r.at === "number" &&
    Number.isFinite(r.at)
  );
}

/**
 * The device's list with the account's attempts merged in: best score, passed if ever passed,
 * the larger attempt count, and the most recent attempt as "last".
 */
export function mergeResults(
  local: StoredSimResults,
  rows: readonly SimTestRow[],
): StoredSimResults {
  const out: StoredSimResults = { ...local };
  const byTest = new Map<string, SimTestRow[]>();
  for (const row of rows) {
    if (!row || typeof row.test_id !== "string") continue;
    const list = byTest.get(row.test_id) ?? [];
    list.push(row);
    byTest.set(row.test_id, list);
  }
  for (const [id, list] of byTest) {
    const newest = list.reduce((a, b) => (Date.parse(b.flown_at) > Date.parse(a.flown_at) ? b : a));
    const remoteLast = fromRow(newest);
    const mine = out[id];
    out[id] = {
      best: Math.max(mine?.best ?? 0, ...list.map((r) => r.score)),
      passed: (mine?.passed ?? false) || list.some((r) => r.passed),
      attempts: Math.max(mine?.attempts ?? 0, list.length),
      last:
        mine && isSimTestResult(mine.last) && mine.last.at >= remoteLast.at
          ? mine.last
          : remoteLast,
    };
  }
  return out;
}

// ---------------------------------------------------------------- device storage

function read<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or blocked: try again next time */
  }
}

export function readLocalResults(): StoredSimResults {
  const v = read<unknown>(RESULTS_KEY, {});
  return v && typeof v === "object" && !Array.isArray(v) ? (v as StoredSimResults) : {};
}

const sameAttempt = (a: SimTestResult, b: SimTestResult) => a.id === b.id && a.at === b.at;

/** What should be uploaded: the outbox, plus (once per device) the latest attempt of each test saved before the outbox existed. */
export function pendingUploads(): SimTestResult[] {
  const outbox = read<unknown[]>(OUTBOX_KEY, []);
  const list = (Array.isArray(outbox) ? outbox : []).filter(isSimTestResult);
  if (read<string | null>(SEEDED_KEY, null) !== "1") {
    for (const s of Object.values(readLocalResults())) {
      if (s && isSimTestResult(s.last) && !list.some((r) => sameAttempt(r, s.last)))
        list.push(s.last);
    }
  }
  return list;
}

/** Remove uploaded attempts from the outbox (re-read, so attempts finished meanwhile stay). */
export function markUploaded(done: readonly SimTestResult[]): void {
  const outbox = read<unknown[]>(OUTBOX_KEY, []);
  const left = (Array.isArray(outbox) ? outbox : []).filter(
    (r) => !isSimTestResult(r) || !done.some((d) => sameAttempt(d, r)),
  );
  write(OUTBOX_KEY, left);
  write(SEEDED_KEY, "1");
}

// ---------------------------------------------------------------- sync

export type SimSyncStatus =
  | { state: "signed-out" }
  | { state: "syncing" }
  | { state: "not-set-up" }
  | { state: "error"; message: string }
  | { state: "synced"; tests: number; passed: number; at: number };

function classify(error: { code?: string; message?: string }): SimSyncStatus {
  const missing =
    error.code === "PGRST205" ||
    error.code === "42P01" ||
    /could not find the table|does not exist/i.test(error.message ?? "");
  return missing
    ? { state: "not-set-up" }
    : { state: "error", message: error.message ?? "unknown error" };
}

/** Upload this device's pending attempts for `userId`, then merge the account's results into the device. */
export async function syncSimTests(
  userId: string,
  db: SupabaseClient = supabase as unknown as SupabaseClient,
): Promise<SimSyncStatus> {
  const pending = pendingUploads();
  if (pending.length) {
    const rows = pending.map((r) => ({ ...toRow(r), user_id: userId }));
    const { error } = await db
      .from(SIM_TESTS_TABLE)
      .upsert(rows, { onConflict: "user_id,test_id,flown_at", ignoreDuplicates: true });
    if (error) return classify(error);
    markUploaded(pending);
  }
  const { data, error } = await db
    .from(SIM_TESTS_TABLE)
    .select(ROW_COLUMNS)
    .eq("user_id", userId)
    .order("flown_at", { ascending: true })
    .limit(5000);
  if (error) return classify(error);
  const rows = (data ?? []) as unknown as SimTestRow[];
  const local = readLocalResults();
  const merged = mergeResults(local, rows);
  // Write only when something changed: every write wakes the simulator's list (storage event).
  if (JSON.stringify(merged) !== JSON.stringify(local)) write(RESULTS_KEY, merged);
  const all = Object.values(merged);
  return {
    state: "synced",
    tests: all.length,
    passed: all.filter((s) => s.passed).length,
    at: Date.now(),
  };
}

// ---------------------------------------------------------------- React

let current: SimSyncStatus | null = null;
const listeners = new Set<() => void>();
function setStatus(s: SimSyncStatus): void {
  current = s;
  for (const fn of listeners) fn();
}
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => void listeners.delete(fn);
};

/** The latest sync result, for display (null before the first sync). */
export function useSimTestsSyncStatus(): SimSyncStatus | null {
  return useSyncExternalStore(
    subscribe,
    () => current,
    () => null,
  );
}

/**
 * Run the sync while a pilot is signed in: once on sign-in / page load, and again whenever the
 * simulator (in this page's frame or another tab) saves a finished test. Mount once (AppShell).
 */
export function useSimTestsSync(): void {
  const { data } = useAccount();
  const userId = data?.user?.id ?? null;
  useEffect(() => {
    if (!userId) {
      setStatus({ state: "signed-out" });
      return;
    }
    let alive = true;
    let running = false;
    let again = false;
    let timer: number | undefined;
    const run = async () => {
      if (running) {
        again = true;
        return;
      }
      running = true;
      setStatus({ state: "syncing" });
      try {
        const s = await syncSimTests(userId);
        if (alive) setStatus(s);
      } catch (e) {
        if (alive) setStatus({ state: "error", message: String(e) });
      } finally {
        running = false;
        if (again && alive) {
          again = false;
          void run();
        }
      }
    };
    void run();
    const onStorage = (e: StorageEvent) => {
      if (e.key !== OUTBOX_KEY && e.key !== null) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void run(), 1500);
    };
    window.addEventListener("storage", onStorage);
    return () => {
      alive = false;
      window.clearTimeout(timer);
      window.removeEventListener("storage", onStorage);
    };
  }, [userId]);
}
