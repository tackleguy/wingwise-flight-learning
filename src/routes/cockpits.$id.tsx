import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/cockpits/$id")({
  component: () => null,
});
