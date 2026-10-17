/**
 * Calendar sources (Card 242): read-only iCal links and imported ICS files, persisted separately
 * from the desk (`atrium.calendar.v1`). Atrium's own events live in the desk store.
 *
 * The earlier two-way account integration was removed from the shipped app (Card 242). It is kept
 * on the `archive/google-calendar` branch; see docs/RESTORE-GOOGLE-CALENDAR.md. Migration v3 keeps
 * the ICS sources and drops that integration's prefs, sync tokens, queued writes and device handle.
 */
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { isTauri } from "../http.ts";
import { uid } from "../format.ts";
import { useAtrium } from "../store.ts";
import type { CalendarEvent } from "../types.ts";
import { LEGACY_ICS, withoutSource, type IcsSourceMeta } from "./ics-source.ts";

type State = { icsSources: IcsSourceMeta[] };

/** v3 keeps only the ICS sources (Card 242). Exported for tests. */
export function migrateCalendarStore(persisted: unknown): State {
  const raw = (persisted ?? {}) as { icsSources?: unknown };
  return { icsSources: Array.isArray(raw.icsSources) ? (raw.icsSources as IcsSourceMeta[]) : [] };
}

/** Desktop/Android kept a sealed refresh handle for the removed integration; forget it once. */
function forgetDeviceHandle() {
  if (!isTauri()) return;
  void import("@tauri-apps/api/core")
    .then(({ invoke }) => invoke("cal_session_clear"))
    .catch(() => undefined);
}

export const useCalAccounts = create<State>()(
  persist(() => ({ icsSources: [] }) as State, {
    name: "atrium.calendar.v1",
    version: 3,
    storage: createJSONStorage(() => (typeof localStorage === "undefined" ? (undefined as unknown as Storage) : localStorage)),
    partialize: ({ icsSources }) => ({ icsSources }),
    migrate: (persisted, version) => {
      if (version < 3) forgetDeviceHandle();
      return migrateCalendarStore(persisted);
    },
  }),
);

const set = (p: Partial<State>) => useCalAccounts.setState(p);
const get = () => useCalAccounts.getState();

/** iCal links and imported files are read-only; Atrium's own events are editable. */
export function isReadOnlyEvent(e: Pick<CalendarEvent, "source">) {
  return e.source === "ics";
}

export function icsSourcesWithLegacy(events: CalendarEvent[], sources: IcsSourceMeta[]): IcsSourceMeta[] {
  const legacy = events.some((e) => e.source === "ics" && !e.srcId);
  return legacy && !sources.some((s) => s.id === LEGACY_ICS) ? [...sources, { id: LEGACY_ICS, kind: "ics", name: "Earlier imports" }] : sources;
}

export function addIcsSource(meta: Omit<IcsSourceMeta, "id">, events: CalendarEvent[]) {
  const id = `ics-${uid()}`;
  set({ icsSources: [...get().icsSources, { ...meta, id }] });
  return useAtrium.getState().importEvents(events.map((e) => ({ ...e, source: "ics" as const, srcId: id })));
}

export function refreshIcsSource(id: string, events: CalendarEvent[]) {
  useAtrium.setState((s) => ({ events: withoutSource(s.events, id) }));
  const n = useAtrium.getState().importEvents(events.map((e) => ({ ...e, source: "ics" as const, srcId: id })));
  set({ icsSources: get().icsSources.map((s) => (s.id === id ? { ...s, refreshedAt: new Date().toISOString() } : s)) });
  return n;
}

export function removeIcsSource(id: string) {
  useAtrium.setState((s) => ({ events: withoutSource(s.events, id) }));
  set({ icsSources: get().icsSources.filter((s) => s.id !== id) });
}

export function hiddenIcsSources(sources: IcsSourceMeta[] = get().icsSources) {
  return new Set(sources.filter((s) => s.shown === false).map((s) => s.id));
}

export function updateIcsSource(id: string, patch: Partial<IcsSourceMeta>) {
  set({ icsSources: get().icsSources.map((s) => (s.id === id ? { ...s, ...patch } : s)) });
}
