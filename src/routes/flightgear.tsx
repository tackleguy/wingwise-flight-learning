import { createFileRoute } from "@tanstack/react-router";
import { Globe2 } from "lucide-react";
import { Page, PageHeader, Notice } from "@/components/app/page";

/** The standalone TeachX Flight Simulator (built from /flightsim) is served as static files under /sim/. */
const SIM_URL = "/sim/index.html";

function WorldSimulator() {
  return (
    <Page wide>
      <PageHeader
        eyebrow="Fly"
        icon={Globe2}
        title="TeachX Flight Simulator"
        description="Fly ten aircraft — from Cessna trainers to a P-51 Mustang, an Airbus A320 and an F-16 — with FlightGear's flight physics and FlightGear's 3D aircraft, from any airport in the world, over real terrain, with real weather."
        actions={
          <a
            href={SIM_URL}
            target="_blank"
            rel="noopener"
            className="inline-flex items-center rounded-lg btn-glow px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            Open full screen
          </a>
        }
      />
      <Notice tone="caution" className="mb-4">
        A learning aid — not an FAA-approved training device. Time in this simulator cannot be
        logged. Click inside the simulator once so the keyboard controls it.
      </Notice>
      <iframe
        src={`${SIM_URL}?embed=1`}
        title="TeachX Flight Simulator"
        className="h-[78dvh] min-h-[480px] w-full rounded-xl border bg-black"
        allow="fullscreen; gamepad"
      />
    </Page>
  );
}

export const Route = createFileRoute("/flightgear")({
  component: WorldSimulator,
});
