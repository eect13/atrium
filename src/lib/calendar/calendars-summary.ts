/** Card 235 (Form 234 §3). */
/** Options › Calendar row sub: "2 by address · 1 imported · refreshed 14:02", or "None yet". */
export function calendarsSummary(sources: { kind?: string; refreshedAt?: string }[], fmt: (iso: string) => string) {
  if (!sources.length) return "None yet";
  const byAddress = sources.filter((s) => s.kind === "ical").length;
  const imported = sources.length - byAddress;
  const last = sources
    .map((s) => s.refreshedAt)
    .filter((t): t is string => Boolean(t))
    .toSorted()
    .at(-1);
  return [byAddress ? `${byAddress} by address` : "", imported ? `${imported} imported` : "", last ? `refreshed ${fmt(last)}` : ""].filter(Boolean).join(" · ");
}
