import { afterEach, describe, expect, it, vi } from "vitest";
import { loadJson, saveJson } from "@/core/storage";

function fakeStorage(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
  return store;
}

afterEach(() => vi.unstubAllGlobals());

describe("storage: values saved before the rename to SkyReady", () => {
  it("saves under the skyready.sim. prefix", () => {
    const store = fakeStorage();
    saveJson("hobbs", 12.5);
    expect([...store.keys()]).toEqual(["skyready.sim.hobbs"]);
  });

  it("moves a value saved under the old teachx.sim. prefix and keeps it", () => {
    const store = fakeStorage({ "teachx.sim.settings": JSON.stringify({ units: "metric" }) });
    expect(loadJson<{ units?: string; extra: number }>("settings", { extra: 1 })).toEqual({ units: "metric", extra: 1 });
    expect([...store.keys()]).toEqual(["skyready.sim.settings"]);
  });

  it("never overwrites a value already saved under the new prefix", () => {
    const store = fakeStorage({ "teachx.sim.hobbs": "3", "skyready.sim.hobbs": "7" });
    expect(loadJson("hobbs", 0)).toBe(7);
    expect([...store.keys()]).toEqual(["skyready.sim.hobbs"]);
  });
});
