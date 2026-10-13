import { createFileRoute } from "@tanstack/react-router";

/** Google Calendar connection + two-way sync (Card 165). Logic lives in src/lib/calendar/api.server.ts. */
async function handle({ request, params }: { request: Request; params: { _splat?: string } }) {
  const { handleCalendar } = await import("@/lib/calendar/api.server");
  const { getSql } = await import("@/lib/db");
  return handleCalendar(request, params._splat ?? "", { sql: getSql });
}

export const Route = createFileRoute("/api/calendar/$")({
  server: { handlers: { GET: handle, POST: handle, PATCH: handle, DELETE: handle, OPTIONS: handle } },
});
