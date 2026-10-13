/**
 * Per-widget options (Card 161 §1): `dashPrefs.widgets[id]`. Helper copy is off by default.
 * Only widgets with options appear here; the registry (`dash.ts`) is unchanged.
 */
export type ClockWidgetOpts = { helper: boolean; bands: boolean; changes: boolean; seconds: boolean; shared: boolean };
export type CalendarWidgetOpts = { helper: boolean; freeBusy: boolean; upNext: boolean };

export type WidgetOpts = { clock: ClockWidgetOpts; calendar: CalendarWidgetOpts };
export type DashPrefs = { widgets: Partial<{ [K in keyof WidgetOpts]: Partial<WidgetOpts[K]> }> };

export const WIDGET_DEFAULTS: WidgetOpts = {
  clock: { helper: false, bands: true, changes: true, seconds: true, shared: false },
  calendar: { helper: false, freeBusy: true, upNext: true },
};

export const WIDGET_OPTION_ROWS: { [K in keyof WidgetOpts]: { key: keyof WidgetOpts[K]; label: string }[] } = {
  clock: [
    { key: "helper", label: "Helper text" },
    { key: "bands", label: "Day/night bands" },
    { key: "changes", label: "Clock change notices" },
    { key: "seconds", label: "Seconds" },
    { key: "shared", label: "Shared work hours" },
  ],
  calendar: [
    { key: "helper", label: "Helper text" },
    { key: "freeBusy", label: "Free/busy strip" },
    { key: "upNext", label: "Up next" },
  ],
};

export function widgetOpts<K extends keyof WidgetOpts>(prefs: DashPrefs | undefined, id: K): WidgetOpts[K] {
  return { ...WIDGET_DEFAULTS[id], ...(prefs?.widgets?.[id] ?? {}) } as WidgetOpts[K];
}

export function normalizeDashPrefs(raw: unknown): DashPrefs {
  const widgets: DashPrefs["widgets"] = {};
  const src = (raw && typeof raw === "object" ? (raw as { widgets?: unknown }).widgets : undefined) as Record<string, unknown> | undefined;
  for (const id of Object.keys(WIDGET_DEFAULTS) as (keyof WidgetOpts)[]) {
    const row = src?.[id];
    if (!row || typeof row !== "object") continue;
    const out: Record<string, boolean> = {};
    for (const k of Object.keys(WIDGET_DEFAULTS[id])) {
      const v = (row as Record<string, unknown>)[k];
      if (typeof v === "boolean") out[k] = v;
    }
    (widgets as Record<string, unknown>)[id] = out;
  }
  return { widgets };
}

export const hasWidgetOptions = (id: string): id is keyof WidgetOpts => id in WIDGET_DEFAULTS;
