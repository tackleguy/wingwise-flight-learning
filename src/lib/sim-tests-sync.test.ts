import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import {
  OUTBOX_KEY,
  RESULTS_KEY,
  SEEDED_KEY,
  SIM_TESTS_TABLE,
  fromRow,
  mergeResults,
  pendingUploads,
  readLocalResults,
  syncSimTests,
  toRow,
  type SimTestResult,
  type SimTestRow,
  type StoredSimResults,
} from "./sim-tests-sync";

const attempt = (id: string, score: number, at: number, passed = score >= 80): SimTestResult => ({
  id,
  title: id,
  score,
  passed,
  at,
  durationSec: 120,
  endedBecause: "Stopped after landing.",
  objectives: [
    { label: "Do not stall", status: "pass", detail: "No stall.", weight: 2, critical: false },
  ],
});

/** A pretend `sim_test_results` table with the real unique key (user_id, test_id, flown_at). */
function fakeDb(opts: { missingTable?: boolean } = {}) {
  const rows: (SimTestRow & { user_id: string })[] = [];
  const missing = {
    code: "PGRST205",
    message: "Could not find the table 'public.sim_test_results' in the schema cache",
  };
  const db = {
    from(table: string) {
      expect(table).toBe(SIM_TESTS_TABLE);
      return {
        async upsert(
          input: (SimTestRow & { user_id: string })[],
          o: { onConflict: string; ignoreDuplicates: boolean },
        ) {
          if (opts.missingTable) return { error: missing };
          expect(o).toEqual({ onConflict: "user_id,test_id,flown_at", ignoreDuplicates: true });
          for (const r of input)
            if (
              !rows.some(
                (x) =>
                  x.user_id === r.user_id && x.test_id === r.test_id && x.flown_at === r.flown_at,
              )
            )
              rows.push(r);
          return { error: null };
        },
        select() {
          let user = "";
          const q = {
            eq(_col: string, v: string) {
              user = v;
              return q;
            },
            order() {
              return q;
            },
            async limit() {
              if (opts.missingTable) return { data: null, error: missing };
              return { data: rows.filter((r) => r.user_id === user), error: null };
            },
          };
          return q;
        },
      };
    },
  };
  return { db: db as unknown as SupabaseClient, rows };
}

beforeEach(() => window.localStorage.clear());

describe("simulator Tests scores in the account", () => {
  it("rows round-trip to the simulator's own format", () => {
    const a = attempt("steep-turn", 92, Date.UTC(2026, 10, 15, 20, 7, 14, 321));
    expect(fromRow(toRow(a))).toEqual(a);
    expect(toRow(a).flown_at).toBe("2026-11-15T20:07:14.321Z");
  });

  it("merging keeps the best score, any pass, the most attempts and the newest attempt", () => {
    const local: StoredSimResults = {
      "steep-turn": { best: 70, passed: false, attempts: 1, last: attempt("steep-turn", 70, 2000) },
    };
    const rows = [
      toRow(attempt("steep-turn", 90, 1000)),
      toRow(attempt("steep-turn", 60, 1500)),
      toRow(attempt("carb-ice", 85, 3000)),
    ];
    const m = mergeResults(local, rows);
    expect(m["steep-turn"]).toMatchObject({ best: 90, passed: true, attempts: 2 });
    expect(m["steep-turn"]!.last.score).toBe(70); // the device's attempt is the newest
    expect(m["carb-ice"]).toMatchObject({ best: 85, passed: true, attempts: 1 });
    expect(m["carb-ice"]!.last.at).toBe(3000);
  });

  it("uploads the outbox and older results once, then brings the account's scores to the device", async () => {
    const { db, rows } = fakeDb();
    // a result saved before the outbox existed, and one attempt waiting in the outbox
    window.localStorage.setItem(
      RESULTS_KEY,
      JSON.stringify({
        "carb-ice": { best: 85, passed: true, attempts: 1, last: attempt("carb-ice", 85, 1000) },
      }),
    );
    window.localStorage.setItem(OUTBOX_KEY, JSON.stringify([attempt("steep-turn", 95, 2000)]));
    expect(pendingUploads()).toHaveLength(2);

    const s = await syncSimTests("pilot-1", db);
    expect(s).toMatchObject({ state: "synced", tests: 2, passed: 2 });
    expect(rows.map((r) => r.test_id).sort()).toEqual(["carb-ice", "steep-turn"]);
    expect(JSON.parse(window.localStorage.getItem(OUTBOX_KEY)!)).toEqual([]);
    expect(window.localStorage.getItem(SEEDED_KEY)).toBe('"1"');
    expect(pendingUploads()).toHaveLength(0);
    expect(readLocalResults()["steep-turn"]).toMatchObject({ best: 95, passed: true });

    // the same pilot on a new device: the account's scores appear there
    window.localStorage.clear();
    await syncSimTests("pilot-1", db);
    expect(Object.keys(readLocalResults()).sort()).toEqual(["carb-ice", "steep-turn"]);
    expect(rows).toHaveLength(2); // nothing uploaded twice

    // another pilot sees none of it
    window.localStorage.clear();
    window.localStorage.setItem(SEEDED_KEY, '"1"');
    await syncSimTests("pilot-2", db);
    expect(readLocalResults()).toEqual({});
  });

  it("keeps everything on the device while the table does not exist yet", async () => {
    const { db } = fakeDb({ missingTable: true });
    window.localStorage.setItem(OUTBOX_KEY, JSON.stringify([attempt("steep-turn", 95, 2000)]));
    expect(await syncSimTests("pilot-1", db)).toEqual({ state: "not-set-up" });
    expect(JSON.parse(window.localStorage.getItem(OUTBOX_KEY)!)).toHaveLength(1);
    expect(window.localStorage.getItem(SEEDED_KEY)).toBeNull();
  });
});
