import { mirrorStateToFile } from "./state-file.ts";

/** Card 197: a tab that crashed is remembered so the next launch opens the Dashboard instead of re-crashing. */
export const CRASHED_VIEW_KEY = "atrium.crashedView";

export function markCrashedView(view: string) {
  try {
    localStorage.setItem(CRASHED_VIEW_KEY, view);
    mirrorStateToFile(); // Card 211: survives a hard kill after the crash
  } catch {
    /* storage unavailable: nothing to remember */
  }
}

/**
 * Returns `fallback` (and clears the mark) when `view` is the one that crashed last session.
 * Card 199: if the fallback itself crashed (Dashboard), use `second` (Options) instead.
 */
export function safeLaunchView<V extends string>(view: V, fallback: V, second: V = fallback): V {
  try {
    if (typeof localStorage === "undefined") return view;
    const crashed = localStorage.getItem(CRASHED_VIEW_KEY);
    if (crashed === null) return view;
    localStorage.removeItem(CRASHED_VIEW_KEY);
    return crashed === view ? (view === fallback ? second : fallback) : view;
  } catch {
    return view;
  }
}
