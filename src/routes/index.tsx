import { createFileRoute } from "@tanstack/react-router";
import { AtriumApp } from "@/components/atrium-app";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return <AtriumApp />;
}
