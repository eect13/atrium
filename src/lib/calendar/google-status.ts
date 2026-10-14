/** Card 204: Options › Calendar Google row (the widget only shows Reconnect). */
export type GoogleRow = { tone: "ok" | "warn" | "bad" | "off"; title: string; sub: string };

export function googleStatusRow(s: { email: string | null; canEdit: boolean; banner: string | null; lastSync: string | null }, fmt: (iso: string) => string): GoogleRow {
  if (s.banner === "expired") return { tone: "bad", title: s.email ? `Google · ${s.email}` : "Google", sub: "Sign-in expired" };
  if (!s.email || s.banner === "disconnected") return { tone: "off", title: "Google", sub: "Not connected" };
  if (!s.canEdit) return { tone: "warn", title: `Google · ${s.email}`, sub: "Can view only" };
  return { tone: "ok", title: `Google · ${s.email}`, sub: `Connected · can edit${s.lastSync ? ` · synced ${fmt(s.lastSync)}` : ""}` };
}
