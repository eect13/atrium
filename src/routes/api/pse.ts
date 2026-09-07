import { createFileRoute } from "@tanstack/react-router";
import { getPseTape } from "@/lib/prices";

export const Route = createFileRoute("/api/pse")({
  server: {
    handlers: {
      GET: async () => {
        const tape = await getPseTape();
        const maxAge = tape.rows.length ? 60 : 5;
        const swr = tape.rows.length ? 3600 : 30;
        return new Response(JSON.stringify({ rows: tape.rows, asOf: tape.asOf }), {
          headers: {
            "content-type": "application/json; charset=utf-8",
            "cache-control": `public, max-age=${maxAge}, s-maxage=${maxAge}, stale-while-revalidate=${swr}`,
            "x-atrium-fetched": String(Date.now()),
          },
        });
      },
    },
  },
});
