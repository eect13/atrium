import { onExternalAnchorClick } from "@/lib/http";
import type { DeskQuote } from "@/lib/quotes";
import { WQ_LICENSE } from "@/lib/wikiquote";
import { cn } from "@/lib/utils";

/** Attribution links: text-sized look, 44px tall target. */
export const QUOTE_LINK =
  "inline-flex min-h-hit items-center rounded-sm underline underline-offset-2 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * "— Author" plus the per-quote source line, shared by Quotes cards, the Dashboard widget and its float.
 * Wikiquote rows: page link · CC BY-SA 4.0 link · excerpt edited (CC BY-SA §3(a), WMF ToU §7(g)–(h)).
 * Built-in rows: "Built-in", no licence line.
 */
export function QuoteAttribution({ q, className }: { q: Pick<DeskQuote, "author" | "href" | "source">; className?: string }) {
  return (
    <div className={cn("text-muted-foreground", className)} data-quote-attribution={q.source}>
      <p>— {q.author}</p>
      <p className="text-xs">
        {q.source === "wikiquote" ? (
          <>
            <a href={q.href} onClick={onExternalAnchorClick} className={QUOTE_LINK} target="_blank" rel="noreferrer">
              Wikiquote
            </a>
            <span aria-hidden> · </span>
            <a href={WQ_LICENSE.href} onClick={onExternalAnchorClick} className={QUOTE_LINK} target="_blank" rel="noreferrer">
              {WQ_LICENSE.label}
            </a>
            <span aria-hidden> · </span>
            <span>excerpt edited</span>
          </>
        ) : (
          <span className="inline-flex min-h-hit items-center">Built-in</span>
        )}
      </p>
    </div>
  );
}
