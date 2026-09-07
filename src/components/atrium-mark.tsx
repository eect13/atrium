/** Circle + outlined triangle — currentColor so light/dark both read. */
const MARK =
  "M16 1c8.284 0 15 6.716 15 15s-6.716 15-15 15S1 24.284 1 16 7.716 1 16 1Zm0 5.5 8.5 14.7H7.5L16 6.5Zm0 3.9 5.05 8.75h-10.1L16 10.4Z";

export function SaturnMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <path fill="currentColor" fillRule="evenodd" d={MARK} />
    </svg>
  );
}
