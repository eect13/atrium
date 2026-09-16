function hourLabel(hour: number) {
  const ap = hour >= 12 ? "pm" : "am";
  return `${hour % 12 || 12}${ap}`;
}

/** Next wet hour in a short forecast strip, or a dry line. */
export function rainSoon(hours: { t: string; rain?: number; mm?: number }[]): string | null {
  if (!hours.length) return null;
  const wet = hours.find((h) => (h.rain ?? 0) >= 30 || (h.mm ?? 0) >= 0.2);
  if (!wet) return "Dry next 6 hours";
  const pct = wet.rain != null ? ` (${Math.round(wet.rain)}%)` : "";
  if (wet.t === hours[0]?.t) return `Rain now${pct}`;
  const hour = Number(wet.t.slice(11, 13));
  if (!Number.isFinite(hour)) return `Rain coming${pct}`;
  return `Rain around ${hourLabel(hour)}${pct}`;
}
