import { useQuery, queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const RATINGS = [
  "None yet",
  "Student Pilot Certificate",
  "Sport Pilot",
  "Recreational Pilot",
  "Private Pilot (PPL)",
  "Instrument Rating (IR)",
  "Commercial Pilot (CPL)",
  "Multi-Engine Rating",
  "Seaplane Rating",
  "CFI",
  "CFII",
  "MEI",
  "ATP",
] as const;

export const ENDORSEMENTS = [
  "Pre-solo knowledge test",
  "Solo flight (90-day)",
  "Solo cross-country",
  "Night solo",
  "Class B airspace solo",
  "Knowledge test sign-off",
  "Practical test (checkride) sign-off",
  "Complex",
  "High-performance",
  "Tailwheel",
  "High-altitude",
  "Flight review (BFR) current",
  "Instrument proficiency check (IPC)",
] as const;

export const HOUR_FIELDS = [
  { key: "total", label: "Total time" },
  { key: "dual", label: "Dual (with instructor)" },
  { key: "solo", label: "Solo" },
  { key: "pic", label: "Pilot in command" },
  { key: "xc", label: "Cross-country" },
  { key: "night", label: "Night" },
  { key: "instrument", label: "Instrument (actual + simulated)" },
] as const;
export type HourKey = (typeof HOUR_FIELDS)[number]["key"];
export type Hours = Partial<Record<HourKey, number>>;

export const FOCUS_AREAS = [
  { id: "flight-deck", label: "Flight deck & avionics", to: "/avionics", blurb: "Instruments, G1000, panel scans" },
  { id: "weather", label: "Weather", to: "/weather", blurb: "METARs, TAFs, hazards, go/no-go" },
  { id: "radio", label: "Radio & ATC", to: "/atc", blurb: "Phraseology and practice calls" },
  { id: "navigation", label: "Navigation", to: "/navigation", blurb: "Charts, VORs, airspace" },
  { id: "planning", label: "Flight planning", to: "/planner", blurb: "Routes, fuel, weight & balance" },
  { id: "written", label: "Written exam", to: "/written-exams", blurb: "FAA knowledge test prep" },
  { id: "checkride", label: "Checkride & oral", to: "/checkrides", blurb: "Mock checkrides and oral exam" },
  { id: "vfr", label: "VFR maneuvers", to: "/vfr", blurb: "Stalls, steep turns, landings" },
  { id: "ifr", label: "Instrument flying", to: "/ifr", blurb: "Approaches, holds, IFR procedures" },
  { id: "simulator", label: "Simulator practice", to: "/simulator", blurb: "Fly scenarios in the browser" },
] as const;
export type FocusId = (typeof FOCUS_AREAS)[number]["id"];

export interface AccountProfile {
  id: string;
  display_name: string | null;
  goal: string;
  ratings: string[];
  endorsements: string[];
  hours: Hours;
  focus_areas: string[];
  onboarded: boolean;
}

export const accountQuery = queryOptions({
  queryKey: ["account"],
  queryFn: async () => {
    const { data: u } = await supabase.auth.getUser();
    const user = u.user;
    if (!user) return { user: null, profile: null as AccountProfile | null };
    const { data } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
    return { user, profile: (data as unknown as AccountProfile | null) ?? null };
  },
  staleTime: 60_000,
});

export function useAccount() {
  return useQuery(accountQuery);
}
