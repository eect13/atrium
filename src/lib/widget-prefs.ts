/**
 * Per-widget options (Card 161 §1): `dashPrefs.widgets[id]`. Helper copy is off by default.
 * Only widgets with options appear here; the registry (`dash.ts`) is unchanged.
 */
export type ClockWidgetOpts = { helper: boolean; changes: boolean; seconds: boolean; shared: boolean };
export type CalendarWidgetOpts = { helper: boolean; upNext: boolean };

export type WidgetOpts = { clock: ClockWidgetOpts; calendar: CalendarWidgetOpts };
/** Card 204: look shared by every widget (Options › Clock / Widgets / Desktop widgets). */
export type ClockStyle = "digital" | "analog";
export type DeskSnap = "off" | "edges" | "grid";
export type WidgetLook = { clockStyle: ClockStyle; compact: boolean; deskOpacity: number; deskSnap: DeskSnap };
export type DashPrefs = { widgets: Partial<{ [K in keyof WidgetOpts]: Partial<WidgetOpts[K]> }>; look?: Partial<WidgetLook> };

export const LOOK_DEFAULTS: WidgetLook = { clockStyle: "digital", compact: false, deskOpacity: 86, deskSnap: "off" };

export function widgetLook(prefs: DashPrefs | undefined): WidgetLook {
  return { ...LOOK_DEFAULTS, ...(prefs?.look ?? {}) };
}

/** Keeps only valid look fields; opacity is clamped to 40–100. */
export function normalizeLook(raw: unknown): Partial<WidgetLook> | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  const out: Partial<WidgetLook> = {};
  if (r.clockStyle === "digital" || r.clockStyle === "analog") out.clockStyle = r.clockStyle;
  if (typeof r.compact === "boolean") out.compact = r.compact;
  if (typeof r.deskOpacity === "number" && Number.isFinite(r.deskOpacity)) out.deskOpacity = Math.min(100, Math.max(40, Math.round(r.deskOpacity)));
  if (r.deskSnap === "off" || r.deskSnap === "edges" || r.deskSnap === "grid") out.deskSnap = r.deskSnap;
  return Object.keys(out).length ? out : undefined;
}

export const WIDGET_DEFAULTS: WidgetOpts = {
  clock: { helper: false, changes: true, seconds: false, shared: false },
  calendar: { helper: false, upNext: true },
};

export const WIDGET_OPTION_ROWS: { [K in keyof WidgetOpts]: { key: keyof WidgetOpts[K]; label: string }[] } = {
  clock: [
    { key: "helper", label: "Helper text" },
    { key: "changes", label: "Clock change notices" },
    { key: "seconds", label: "Seconds" },
    { key: "shared", label: "Shared work hours" },
  ],
  calendar: [
    { key: "helper", label: "Helper text" },
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
  // Card 204 migration: removed keys (clock.bands, calendar.freeBusy) drop out here.
  const look = normalizeLook(raw && typeof raw === "object" ? (raw as { look?: unknown }).look : undefined);
  return look ? { widgets, look } : { widgets };
}

export const hasWidgetOptions = (id: string): id is keyof WidgetOpts => id in WIDGET_DEFAULTS;
