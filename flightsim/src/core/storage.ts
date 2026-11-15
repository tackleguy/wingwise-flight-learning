/** Versioned localStorage helper. Everything the simulator remembers lives under "skyready.sim.*". */
const PREFIX = "skyready.sim.";
/**
 * The project used to be called TeachX and saved under "teachx.sim.*". A value still under its old
 * name is moved to the new name the first time it is read, so nobody loses their settings.
 */
const LEGACY_PREFIX = "teachx.sim.";

function migrateLegacy(key: string): void {
  try {
    const old = localStorage.getItem(LEGACY_PREFIX + key);
    if (old === null) return;
    if (localStorage.getItem(PREFIX + key) === null) localStorage.setItem(PREFIX + key, old);
    localStorage.removeItem(LEGACY_PREFIX + key);
  } catch {
    /* storage blocked or full: the old value stays and is tried again next time */
  }
}

export function loadJson<T>(key: string, fallback: T): T {
  if (typeof localStorage === "undefined") return fallback;
  migrateLegacy(key);
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as T;
    if (fallback && typeof fallback === "object" && !Array.isArray(fallback) && parsed && typeof parsed === "object") {
      return { ...fallback, ...parsed };
    }
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

export function saveJson(key: string, value: unknown): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* storage full or blocked (private mode / embedded iframe): the sim keeps working without saving */
  }
}

export function removeKey(key: string): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(PREFIX + key);
  } catch {
    /* ignore */
  }
}
