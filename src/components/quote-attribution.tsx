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
/** Wikiquote page title from the quote href, for the inline link's tooltip. */
function pageTitle(href: string): string {
  try {
    return decodeURIComponent(new URL(href).pathname.replace(/^\/wiki\//, "")).replace(/_/g, " ");
  } catch {
    return href;
  }
}

/**
 * layout "stack" (default): author line over the source line — Quotes cards and the Dashboard widget.
 * layout "inline" (Form 152 B1): one 44px row for the float's pinned footer — truncated author, Wikiquote, CC BY-SA.
 */
export function QuoteAttribution({
  q,
  className,
  layout = "stack",
}: {
  q: Pick<DeskQuote, "author" | "href" | "source">;
  className?: string;
  layout?: "stack" | "inline";
}) {
  if (layout === "inline") {
    return (
      <div className={cn("flex h-hit min-w-0 items-center gap-1 text-xs text-muted-foreground", className)} data-quote-attribution={q.source}>
        <span className="min-w-0 flex-1 truncate" title={`— ${q.author}`}>
          — {q.author}
        </span>
        {q.source === "wikiquote" ? (
          <>
            <a
              href={q.href}
              onClick={onExternalAnchorClick}
              className={cn(QUOTE_LINK, "min-w-hit max-w-[45%] shrink-0 justify-center truncate")}
              title={`Wikiquote: ${pageTitle(q.href)}`}
              target="_blank"
              rel="noreferrer"
            >
              Wikiquote
            </a>
            <a
              href={WQ_LICENSE.href}
              onClick={onExternalAnchorClick}
              className={cn(QUOTE_LINK, "min-w-hit shrink-0 justify-center")}
              title="CC BY-SA 4.0 · excerpt edited"
              aria-label="CC BY-SA 4.0 licence, excerpt edited"
              target="_blank"
              rel="noreferrer"
            >
              CC BY-SA
            </a>
          </>
        ) : (
          <span className="shrink-0">Built-in</span>
        )}
      </div>
    );
  }
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
