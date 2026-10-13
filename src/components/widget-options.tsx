"use client";

import { OverflowMenu } from "@/components/ui/overflow-menu";
import { useAtrium } from "@/lib/store";
import { WIDGET_OPTION_ROWS, widgetOpts, type WidgetOpts } from "@/lib/widget-prefs";

/** Card 161 §1: the ⋯ (44) options menu on a widget header; Switch rows; helper text off by default. */
export function WidgetOptionsMenu<K extends keyof WidgetOpts>({ id, label }: { id: K; label: string }) {
  const prefs = useAtrium((s) => s.dashPrefs);
  const setOpt = useAtrium((s) => s.setWidgetOpt);
  const opts = widgetOpts(prefs, id) as Record<string, boolean>;
  const rows = WIDGET_OPTION_ROWS[id] as { key: string; label: string }[];
  return (
    <OverflowMenu
      label={`${label} options`}
      menuClassName="w-64"
      items={rows.map((r) => ({ label: r.label, checked: opts[r.key] === true, onSelect: () => setOpt(id, r.key as never, !opts[r.key]) }))}
    />
  );
}
