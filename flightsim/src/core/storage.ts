/** Versioned localStorage helper. Everything the simulator remembers lives under "teachx.sim.*". */
const PREFIX = "teachx.sim.";

export function loadJson<T>(key: string, fallback: T): T {
  if (typeof localStorage === "undefined") return fallback;
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
