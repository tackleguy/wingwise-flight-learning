/** Tiny typed event bus. */
export class EventBus<E extends object> {
  private handlers = new Map<keyof E, Set<(payload: never) => void>>();

  on<K extends keyof E>(type: K, fn: (payload: E[K]) => void): () => void {
    let set = this.handlers.get(type);
    if (!set) {
      set = new Set();
      this.handlers.set(type, set);
    }
    set.add(fn as (payload: never) => void);
    return () => {
      set.delete(fn as (payload: never) => void);
    };
  }

  emit<K extends keyof E>(type: K, payload: E[K]): void {
    const set = this.handlers.get(type);
    if (!set) return;
    for (const fn of [...set]) {
      try {
        (fn as (p: E[K]) => void)(payload);
      } catch (err) {
        console.error(`[SkyReady] event handler for "${String(type)}" failed`, err);
      }
    }
  }

  clear(): void {
    this.handlers.clear();
  }
}
