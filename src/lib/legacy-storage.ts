/**
 * The site used to be called TeachX, and it saved everything in the browser under "teachx-…" keys.
 * It is now SkyReady and uses "skyready-…" keys. `migrateLegacyKey` moves an old saved value to its
 * new key the first time it is needed, so nobody loses their training record or preferences.
 *
 * Safe to call any number of times: it does its work at most once per key per page load, never
 * overwrites a value already saved under the new key, and only removes the old key after the copy
 * has been written.
 */
const done = new Set<string>();

export function migrateLegacyKey(oldKey: string, newKey: string): void {
  if (done.has(newKey) || typeof window === "undefined") return;
  done.add(newKey);
  try {
    const ls = window.localStorage;
    const old = ls.getItem(oldKey);
    if (old === null) return;
    if (ls.getItem(newKey) === null) ls.setItem(newKey, old);
    ls.removeItem(oldKey);
  } catch {
    /* storage blocked or full — the old key stays where it is and is tried again next visit */
  }
}

/** Old key → new key for everything the main site keeps in localStorage. */
export const LEGACY_KEYS = {
  training: ["teachx-training-v1", "skyready-training-v1"],
  navOpen: ["teachx-nav-open", "skyready-nav-open"],
  nightLighting: ["teachx-night-lighting", "skyready-night-lighting"],
} as const;
