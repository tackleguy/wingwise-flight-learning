import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/academy/$course/$module")({
  component: () => null,
});
