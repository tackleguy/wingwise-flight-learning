import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CockpitViewer } from "@/components/cockpit3d/CockpitViewer";
import { loadCockpit } from "@/components/cockpit3d/registry";
import { useCockpitSim } from "@/components/cockpit3d/sim";
import type { CockpitDefinition, Hotspot } from "@/components/cockpit3d/types";

export const Route = createFileRoute("/cockpits/$id")({
  component: TmpTest,
});

function TmpTest() {
  const { id } = Route.useParams();
  const [def, setDef] = useState<CockpitDefinition | null>(null);
  const [sel, setSel] = useState<Hotspot | null>(null);
  const [view, setView] = useState<"seat" | "inspect">("seat");
  const [labels, setLabels] = useState(false);
  useEffect(() => {
    void loadCockpit(id).then((d) => setDef(d ?? null));
  }, [id]);
  const engine = useCockpitSim(def);
  useEffect(() => {
    (window as unknown as Record<string, unknown>)["__engine"] = engine;
    (window as unknown as Record<string, unknown>)["__setView"] = setView;
    (window as unknown as Record<string, unknown>)["__setLabels"] = setLabels;
  }, [engine]);
  return (
    <div className="p-2">
      <div id="tmp-sel" className="text-xs">{sel ? sel.id : "none"}</div>
      {def && engine ? (
        <CockpitViewer
          definition={def}
          engine={engine}
          view={view}
          showLabels={labels}
          selectedId={sel?.id ?? null}
          highlightIds={["throttle"]}
          onSelect={setSel}
          className="h-[80vh]"
        />
      ) : null}
    </div>
  );
}
