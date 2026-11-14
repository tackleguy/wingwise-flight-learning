import { useMemo } from "react";
import { INITIAL_STATE, useStore, type TrainingState } from "@/lib/store";

/**
 * The slices of the training record that track progress depends on, assembled into a
 * TrainingState. SSR-safe: uses the store's server snapshot until the client has hydrated.
 */
export function useTrackState(): TrainingState {
  const lessons = useStore((s) => s.lessons);
  const quizzes = useStore((s) => s.quizzes);
  const exams = useStore((s) => s.exams);
  const flights = useStore((s) => s.flights);
  const atcSessions = useStore((s) => s.atcSessions);
  return useMemo(
    () => ({ ...INITIAL_STATE, lessons, quizzes, exams, flights, atcSessions }),
    [lessons, quizzes, exams, flights, atcSessions],
  );
}
