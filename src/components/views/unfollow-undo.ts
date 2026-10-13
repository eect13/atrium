import { toast } from "sonner";
import { withInterestAt, withoutInterest, type FeedPrefs } from "@/lib/feed";

type Update = (fn: (p: FeedPrefs) => FeedPrefs) => void;

/**
 * Form 194 G6: unfollow at once → toast "Unfollowed {topic}" · Undo (re-inserted at its old position).
 * Focus: the next row's ×, else the previous row's ×, else `fallback()` (the Follow field).
 * Undo returns focus to the restored row's ×. The toast itself is the (single) live announcement.
 */
export function unfollowWithUndo({
  update,
  label,
  index,
  list,
  fallback,
}: {
  update: Update;
  label: string;
  index: number;
  list: HTMLElement | null;
  fallback: () => HTMLElement | null;
}) {
  const xs = () => [...(list?.querySelectorAll<HTMLElement>('button[aria-label^="Unfollow "]') ?? [])];
  update((p) => withoutInterest(p, label));
  // Card 197: the toast (Sonner's own polite live region) is the one announcement; no second region.
  requestAnimationFrame(() => {
    const left = xs();
    (left[index] ?? left[index - 1] ?? fallback())?.focus();
  });
  toast(`Unfollowed ${label}`, {
    action: {
      label: "Undo",
      onClick: () => {
        update((p) => withInterestAt(p, label, index));
        // Sonner hands focus back to the pre-toast element when the toast unmounts (~200 ms),
        // so focus the restored × now and again after that.
        const back = () => xs().find((b) => b.getAttribute("aria-label") === `Unfollow ${label}`)?.focus();
        requestAnimationFrame(back);
        setTimeout(back, 320);
      },
    },
  });
}
