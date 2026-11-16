import { Link, createFileRoute } from "@tanstack/react-router";
import { Globe2 } from "lucide-react";
import { Page, PageHeader, Notice } from "@/components/app/page";
import { useSimTestsSyncStatus, type SimSyncStatus } from "@/lib/sim-tests-sync";

/** One line under the notice: where the Tests scores are kept. */
function TestsSyncLine({ status }: { status: SimSyncStatus | null }) {
  const cls = "mb-3 text-xs text-muted-foreground";
  if (!status || status.state === "syncing")
    return <p className={cls}>Checking your account for saved Tests scores…</p>;
  if (status.state === "signed-out")
    return (
      <p className={cls}>
        Your Tests scores are kept on this device.{" "}
        <Link to="/auth" className="font-medium text-primary underline-offset-2 hover:underline">
          Sign in
        </Link>{" "}
        to save them to your account and see them on any device.
      </p>
    );
  if (status.state === "synced")
    return (
      <p className={cls} data-sim-sync="synced">
        Your Tests scores are saved to your account
        {status.tests > 0 ? ` — ${status.passed} of ${status.tests} tests tried are passed.` : "."}
      </p>
    );
  if (status.state === "not-set-up")
    return (
      <p className={cls}>
        Saving Tests scores to your account is not switched on yet; they are kept on this device for
        now.
      </p>
    );
  return (
    <p className={cls}>
      Could not reach your account just now; your Tests scores are kept on this device and will be
      saved later.
    </p>
  );
}

/** The standalone SkyReady Flight Simulator (built from /flightsim) is served as static files under /sim/. */
const SIM_URL = "/sim/index.html";

function WorldSimulator() {
  const sync = useSimTestsSyncStatus();
  return (
    <Page wide>
      <PageHeader
        eyebrow="Fly"
        icon={Globe2}
        title="SkyReady Flight Simulator"
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
      <Notice tone="caution" className="mb-2">
        A learning aid — not an FAA-approved training device. Time in this simulator cannot be
        logged. Click inside the simulator once so the keyboard controls it.
      </Notice>
      <TestsSyncLine status={sync} />
      <iframe
        src={`${SIM_URL}?embed=1`}
        title="SkyReady Flight Simulator"
        className="h-[78dvh] min-h-[480px] w-full rounded-xl border bg-black"
        allow="fullscreen; gamepad"
      />
    </Page>
  );
}

export const Route = createFileRoute("/flightgear")({
  component: WorldSimulator,
});
