/** Avionics Lab training tasks (ids are stored in TrainingState.avionicsTasks). Stub — replaced by the Avionics Lab. */
export interface AvionicsTask {
  id: string;
  title: string;
  description: string;
  category: "pfd" | "mfd" | "gps" | "nav" | "autopilot" | "radios" | "steam";
}

export const AVIONICS_TASKS: AvionicsTask[] = [];
