import { createFileRoute } from "@tanstack/react-router";
import { BookOpen } from "lucide-react";
import { CourseOverview } from "@/components/academy/CourseOverview";

export const Route = createFileRoute("/vfr")({
  head: () => ({
    meta: [
      { title: "VFR Ground School — SkyReady" },
      {
        name: "description",
        content:
          "Private pilot ground school: aerodynamics, systems, regulations, airspace, weather, charts, navigation, airport operations, emergencies and decision-making — with interactive diagrams and graded exercises.",
      },
    ],
  }),
  component: VfrPage,
});

const RELATED = [
  {
    to: "/simulator?scenario=vfr-pattern",
    label: "Fly the traffic pattern",
    text: "Practise pattern entry, legs, radio calls and landings in the simulator.",
  },
  {
    to: "/weather",
    label: "Weather Lab",
    text: "Decode live-style METARs and TAFs and make go/no-go decisions.",
  },
  {
    to: "/navigation",
    label: "Navigation & charts",
    text: "Sectional chart work, E6B calculations and VOR/GPS navigation.",
  },
];

function VfrPage() {
  return <CourseOverview courseId="vfr" eyebrow="VFR training" icon={BookOpen} related={RELATED} />;
}
