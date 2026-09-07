import { cn } from "@/lib/utils";
import type { IssuerHit } from "@/lib/issuer";

export function ChipMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 36 28" className={cn("h-7 w-9", className)} aria-hidden>
      <rect x="1" y="1" width="34" height="26" rx="4" fill="currentColor" opacity="0.35" />
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        opacity="0.7"
        d="M10 1v26M26 1v26M1 10h34M1 18h34"
      />
    </svg>
  );
}

export function Contactless({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={cn("size-5", className)} aria-hidden>
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        d="M8 8.5c2.2 1.6 2.2 5.4 0 7M11.2 6.2c3.2 2.4 3.2 9.2 0 11.6M14.4 4c4.2 3.2 4.2 12.8 0 16"
      />
    </svg>
  );
}

/** Official currency glyph in a coin seal — cash “on person”. */
export function CurrencyMark({ symbol, className }: { symbol: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-current/35 font-display text-xl leading-none",
        className,
      )}
      aria-hidden
    >
      {symbol}
    </span>
  );
}

/** App-icon mark (Wallet fallback when the network does not return card art). */
export function AppMark({ letters, className }: { letters: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex size-10 shrink-0 items-center justify-center rounded-lg bg-current/15 text-[11px] font-semibold tracking-[0.14em]",
        className,
      )}
      aria-hidden
    >
      {letters}
    </span>
  );
}

export function FaceMark({ hit, cash, className }: { hit: IssuerHit; cash: boolean; className?: string }) {
  if (cash) return <CurrencyMark symbol={hit.symbol} className={className} />;
  return <AppMark letters={hit.mark} className={className} />;
}
