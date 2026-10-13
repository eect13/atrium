/**
 * Calendar accounts (Card 164): the Google connection, its sync state and the read-only
 * "Other calendars" (ICS / iCal). Persisted separately from the desk (`atrium.calendar.v1`).
 * The desktop session secret is an opaque, revocable handle; Google tokens never reach here.
 */
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { isTauri, openExternal } from "../http.ts";
import { uid } from "../format.ts";
import { useAtrium } from "../store.ts";
import type { CalendarEvent, GCalDesk } from "../types.ts";
import { gcalLane } from "../google-cal.ts";
import { api, CalendarApiError, fetchStatus, GoogleSource, type ApiClient, type ConnStatus } from "./google-source.ts";
import { LEGACY_ICS, withoutSource, type IcsSourceMeta } from "./ics-source.ts";
import { isWritableRole } from "./source.ts";
import { applyFlush, applyPull, bannerFor, enqueue, flushPending, pullCalendar, writeOf, type PendingOp } from "./sync.ts";

export type Banner = "failed" | "expired" | "offline" | "partial" | null;

type State = {
  session: string | null;
  status: ConnStatus | null;
  email: string | null;
  canEdit: boolean;
  lastSync: string | null;
  banner: Banner;
  syncTokens: Record<string, string>;
  pending: PendingOp[];
  icsSources: IcsSourceMeta[];
  connecting: boolean;
  syncing: boolean;
};

const initial: State = { session: null, status: null, email: null, canEdit: false, lastSync: null, banner: null, syncTokens: {}, pending: [], icsSources: [], connecting: false, syncing: false };

export const useCalAccounts = create<State>()(
  persist(() => initial, {
    name: "atrium.calendar.v1",
    version: 1,
    storage: createJSONStorage(() => (typeof localStorage === "undefined" ? (undefined as unknown as Storage) : localStorage)),
    partialize: ({ connecting: _c, syncing: _s, status: _st, ...keep }) => keep,
  }),
);

const set = (p: Partial<State>) => useCalAccounts.setState(p);
const get = () => useCalAccounts.getState();

/** Desktop/Android talk to the deployed Atrium server; the web app uses its own origin. */
export function calendarApiBase() {
  if (!isTauri()) return "";
  const env = (import.meta as { env?: Record<string, string | undefined> }).env;
  return (env?.VITE_CALENDAR_API_ORIGIN || "https://atrium-swart-seven.vercel.app").replace(/\/+$/, "");
}

const client = (): ApiClient => ({ base: calendarApiBase(), session: get().session });
const source = () => new GoogleSource(client());
const online = () => (typeof navigator === "undefined" ? true : navigator.onLine !== false);

export async function refreshStatus() {
  const s = await fetchStatus(client());
  if (s.state === "connected") set({ status: s, email: s.email, canEdit: s.canEdit, banner: get().banner === "expired" ? null : get().banner });
  else if (s.state === "expired") set({ status: s, banner: "expired" });
  else if (s.state === "disconnected" && get().email) {
    // Server no longer knows this device (revoked elsewhere): show as signed out, keep nothing.
    dropGoogleLocal();
    set({ status: s });
  } else set({ status: s, ...(s.state === "unreachable" && get().email ? { banner: online() ? "failed" : "offline" } : {}) });
  return s;
}

function b64url(bytes: Uint8Array) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

let cancelFlow: (() => void) | null = null;

/**
 * Card 164 state 2. Web: a Google popup on this origin (cookie session). Desktop: the system
 * browser + a one-time hand-off claimed with a verifier only this app holds.
 */
export async function connectGoogle(opts: { loginHint?: string } = {}) {
  cancelFlow?.();
  set({ connecting: true });
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  cancelFlow = () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    set({ connecting: false });
    cancelFlow = null;
  };
  const hint = opts.loginHint ? `login_hint=${encodeURIComponent(opts.loginHint)}` : "";
  const deadline = Date.now() + 10 * 60_000;
  if (isTauri()) {
    const verifier = b64url(crypto.getRandomValues(new Uint8Array(32)));
    const challenge = b64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
    const ok = await openExternal(`${calendarApiBase()}/api/calendar/connect?handoff=${challenge}${hint ? `&${hint}` : ""}`);
    if (!ok) {
      cancelFlow?.();
      throw new Error("Couldn't open the browser");
    }
    const poll = async () => {
      if (stopped) return;
      if (Date.now() > deadline) return cancelFlow?.();
      try {
        const r = await api<{ session?: string; state?: string }>({ base: calendarApiBase() }, "/handoff", { method: "POST", body: JSON.stringify({ verifier }) });
        if (r.session) {
          const old = get().session;
          if (old && old !== r.session) await api({ base: calendarApiBase(), session: old }, "/disconnect", { method: "POST", body: JSON.stringify({ keepGrant: true }) }).catch(() => undefined);
          set({ session: r.session });
          cancelFlow?.();
          await afterConnect();
          return;
        }
      } catch (e) {
        if (e instanceof CalendarApiError && e.status === 410) return cancelFlow?.();
      }
      timer = setTimeout(() => void poll(), 2000);
    };
    timer = setTimeout(() => void poll(), 2000);
    return;
  }
  const url = `/api/calendar/connect${hint ? `?${hint}` : ""}`;
  const w = window.open(url, "atrium-google", "popup,width=520,height=680");
  if (!w) {
    window.location.assign(url);
    return;
  }
  const poll = async () => {
    if (stopped) return;
    if (Date.now() > deadline) return cancelFlow?.();
    const s = await fetchStatus(client());
    if (s.state === "connected") {
      cancelFlow?.();
      await afterConnect();
      return;
    }
    timer = setTimeout(() => void poll(), 2000);
  };
  timer = setTimeout(() => void poll(), 2000);
}

export function cancelConnect() {
  cancelFlow?.();
}

async function afterConnect() {
  set({ banner: null });
  await refreshStatus();
  await syncNow();
}

/** Disconnect keeps nothing locally and deletes nothing in Google (Card 164 Q3). */
export async function disconnectGoogle() {
  try {
    await api(client(), "/disconnect", { method: "POST" });
  } catch {
    /* already gone on the server: still forget locally */
  }
  dropGoogleLocal();
  set({ session: null, status: { state: "disconnected" } });
}

function dropGoogleLocal() {
  useAtrium.setState((s) => ({ events: s.events.filter((e) => e.source !== "google"), gcalCals: [], gcalOff: [] }));
  set({ email: null, canEdit: false, lastSync: null, banner: null, syncTokens: {}, pending: [] });
}

/** Calendars the user can write to, primary first (Card 164 Q2: new events default to primary). */
export function writableGoogleCalendars(cals: GCalDesk[] = useAtrium.getState().gcalCals, canEdit = get().canEdit) {
  if (!canEdit) return [];
  return cals.filter((c) => isWritableRole(c.accessRole)).sort((a, b) => Number(Boolean(b.primary)) - Number(Boolean(a.primary)));
}

export function isReadOnlyEvent(e: CalendarEvent, cals: GCalDesk[] = useAtrium.getState().gcalCals, canEdit = get().canEdit) {
  if (e.source === "ics") return true;
  if (e.source !== "google") return false;
  const cal = cals.find((c) => c.id === e.calId);
  return !canEdit || !cal || !isWritableRole(cal.accessRole);
}

let syncing: Promise<void> | null = null;

/** Flush queued writes, refresh the calendar list, pull every shown calendar. */
export function syncNow(): Promise<void> {
  if (syncing) return syncing;
  syncing = (async () => {
    set({ syncing: true });
    try {
      if (get().status?.state !== "connected" && (await refreshStatus()).state !== "connected") return;
      const src = source();
      if (get().pending.length) {
        const r = await flushPending(src, get().pending);
        useAtrium.setState((s) => ({ events: applyFlush(s.events, r) }));
        set({ pending: r.left });
        if (r.stopped) {
          set({ banner: bannerFor(r.stopped, online()) });
          return;
        }
      }
      const metas = await src.listCalendars();
      const cals: GCalDesk[] = metas.map((m) => {
        const prev = useAtrium.getState().gcalCals.find((c) => c.id === m.id);
        return { ...gcalLane({ id: m.id, summary: m.name, primary: m.primary, accessRole: m.accessRole }), ...(prev?.colour ? { colour: prev.colour } : {}) };
      });
      useAtrium.getState().setGcalCals(cals);
      const off = new Set(useAtrium.getState().gcalOff);
      const tokens = { ...get().syncTokens };
      const pendingIds = new Set(get().pending.map((p) => p.localId));
      for (const c of cals) {
        if (off.has(c.id)) continue;
        const r = await pullCalendar(src, c.id, tokens[c.id]);
        useAtrium.setState((s) => ({ events: applyPull(s.events, c.id, r, pendingIds) }));
        if (r.nextSyncToken) tokens[c.id] = r.nextSyncToken;
        else delete tokens[c.id];
      }
      const known = new Set(cals.map((c) => c.id));
      useAtrium.setState((s) => ({ events: s.events.filter((e) => e.source !== "google" || !e.calId || known.has(e.calId)) }));
      set({ syncTokens: tokens, lastSync: new Date().toISOString(), banner: null });
    } catch (e) {
      const err = e instanceof CalendarApiError ? e : new CalendarApiError(0, "offline");
      set({ banner: bannerFor({ code: err.code, status: err.status }, online()) });
    } finally {
      set({ syncing: false });
      syncing = null;
    }
  })();
  return syncing;
}

/** A calendar was hidden or shown in the picker: shown ones pull, hidden ones keep their token. */
export async function toggleGoogleCalendar(id: string) {
  const turningOn = useAtrium.getState().gcalOff.includes(id);
  useAtrium.getState().toggleGcal(id);
  if (turningOn) await syncNow();
}

export function setCalendarColour(id: string, colour: string) {
  useAtrium.setState((s) => ({ gcalCals: s.gcalCals.map((c) => (c.id === id ? { ...c, colour } : c)) }));
}

/**
 * Save locally first, then write to Google. Card 164 6a: if Google is unreachable the change
 * stays here and syncs on the next successful sync.
 */
export async function queueGoogleWrite(kind: PendingOp["kind"], e: CalendarEvent) {
  if (!e.calId) return;
  const op: PendingOp = { id: uid(), kind, calId: e.calId, localId: e.id, remoteId: e.remoteId, etag: e.etag, write: kind === "delete" ? undefined : writeOf(e), at: new Date().toISOString() };
  set({ pending: enqueue(get().pending, op) });
  await syncNow();
}

// ---------- Other calendars (read-only) ----------

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
