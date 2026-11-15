import { createFileRoute } from "@tanstack/react-router";
import { Compass } from "lucide-react";
import { CourseOverview } from "@/components/academy/CourseOverview";

export const Route = createFileRoute("/ifr")({
  head: () => ({
    meta: [
      { title: "IFR Ground School — SkyReady" },
      {
        name: "description",
        content:
          "Instrument rating ground school: attitude instrument flying, IFR regulations, weather, VOR/ILS/GPS navigation, holding, approaches, IFR planning and emergencies.",
      },
    ],
  }),
  component: IfrPage,
});

const RELATED = [
  {
    to: "/avionics",
    label: "Avionics Lab",
    text: "Work the PFD, MFD, GPS flight plans and autopilot modes.",
  },
  {
    to: "/simulator?scenario=ifr-ils",
    label: "Fly an ILS approach",
    text: "Intercept the localizer, track the glideslope and fly to decision altitude.",
  },
  {
    to: "/ai-atc",
    label: "AI ATC practice",
    text: "Copy IFR clearances and handle approach control with an AI controller.",
  },
];

function IfrPage() {
  return <CourseOverview courseId="ifr" eyebrow="IFR training" icon={Compass} related={RELATED} />;
}
