import { beforeEach, describe, expect, it } from "vitest";
import { migrateLegacyKey } from "@/lib/legacy-storage";

describe("migrateLegacyKey (TeachX → SkyReady saved data)", () => {
  beforeEach(() => window.localStorage.clear());

  it("moves an old value to the new key", () => {
    window.localStorage.setItem("teachx-test-a", '{"flights":[1]}');
    migrateLegacyKey("teachx-test-a", "skyready-test-a");
    expect(window.localStorage.getItem("skyready-test-a")).toBe('{"flights":[1]}');
    expect(window.localStorage.getItem("teachx-test-a")).toBeNull();
  });

  it("keeps a value already saved under the new key", () => {
    window.localStorage.setItem("teachx-test-b", "old");
    window.localStorage.setItem("skyready-test-b", "new");
    migrateLegacyKey("teachx-test-b", "skyready-test-b");
    expect(window.localStorage.getItem("skyready-test-b")).toBe("new");
    expect(window.localStorage.getItem("teachx-test-b")).toBeNull();
  });

  it("does nothing when there is no old value", () => {
    migrateLegacyKey("teachx-test-c", "skyready-test-c");
    expect(window.localStorage.getItem("skyready-test-c")).toBeNull();
  });
});
