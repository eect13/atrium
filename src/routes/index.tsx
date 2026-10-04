import { createFileRoute } from "@tanstack/react-router";
import { AtriumApp } from "@/components/atrium-app";

export const Route = createFileRoute("/")({
  head: () => ({
    links: [{ rel: "canonical", href: "https://atrium-swart-seven.vercel.app/" }],
  }),
  component: Home,
});

function Home() {
  return <AtriumApp />;
}
