import { useEffect, useState } from "react";
export type Progress = { xp: number; done: string[]; streak: number; last: string };
const KEY = "teachx-progress";
const init: Progress = { xp: 0, done: [], streak: 0, last: "" };
export function useProgress() {
  const [p, setP] = useState<Progress>(init);
  useEffect(() => { try { setP({ ...init, ...JSON.parse(localStorage.getItem(KEY) || "{}") }); } catch {} }, []);
  const complete = (id: string, xp: number) => {
    const cur: Progress = { ...init, ...JSON.parse(localStorage.getItem(KEY) || "{}") };
    const today = new Date().toDateString();
    const yest = new Date(Date.now() - 864e5).toDateString();
    const streak = cur.last === today ? cur.streak : cur.last === yest ? cur.streak + 1 : 1;
    const next = { xp: cur.xp + xp, done: Array.from(new Set([...cur.done, id])), streak, last: today };
    localStorage.setItem(KEY, JSON.stringify(next)); setP(next);
  };
  return { p, complete };
}
