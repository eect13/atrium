/**
 * Card 204: easy-to-read analog face. Face --muted, ring --border, 12 ticks (quarters bold),
 * hands --foreground, no numerals; second hand only when Seconds is on.
 */
function analogAngles(h: number, m: number, s: number) {
  return { hour: ((h % 12) + m / 60) * 30, minute: (m + s / 60) * 6, second: s * 6 };
}

export function AnalogClock({ h, m, s, seconds, label, className }: { h: number; m: number; s: number; seconds: boolean; label: string; className?: string }) {
  const a = analogAngles(h, m, s);
  const hand = (deg: number, len: number, w: number, color: string) => (
    <line x1={50} y1={50} x2={50} y2={50 - len} stroke={color} strokeWidth={w} strokeLinecap="round" transform={`rotate(${deg} 50 50)`} />
  );
  return (
    <svg role="img" aria-label={label} viewBox="0 0 100 100" className={className}>
      <circle cx={50} cy={50} r={47} fill="var(--color-muted)" stroke="var(--color-border)" strokeWidth={2} />
      {Array.from({ length: 12 }, (_, i) => {
        const q = i % 3 === 0;
        return <line key={i} x1={50} y1={7} x2={50} y2={q ? 15 : 12} stroke={q ? "var(--color-foreground)" : "var(--color-muted-foreground)"} strokeWidth={q ? 2.5 : 1.2} strokeLinecap="round" transform={`rotate(${i * 30} 50 50)`} />;
      })}
      {hand(a.hour, 24, 4, "var(--color-foreground)")}
      {hand(a.minute, 34, 2.5, "var(--color-foreground)")}
      {seconds ? hand(a.second, 38, 1, "var(--color-foreground)") : null}
      <circle cx={50} cy={50} r={2.5} fill="var(--color-foreground)" />
    </svg>
  );
}
