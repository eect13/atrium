/**
 * Calendar accounts (Card 164): the Google connection, its sync state and the read-only
 * "Other calendars" (ICS / iCal). Persisted separately from the desk (`atrium.calendar.v1`).
 * Google tokens never reach here. Desktop/Android: a 1 h access handle in memory and a rotating
 * refresh handle in the Tauri app-data store (Card 170 / Card 167 M2); nothing in localStorage.
 * Card 166 B3: a server "disconnected" never wipes Google events or queued changes.
 */
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { isTauri, openExternal } from "../http.ts";
import { uid } from "../format.ts";
import { useAtrium } from "../store.ts";
import type { CalendarEvent, GCalDesk } from "../types.ts";
import { gcalLane } from "../google-cal.ts";
import { CLAIM_COPY, claimFailKind, RATE_LIMIT_WAIT_MS, type ClaimFail } from "./claim-errors.ts";
import { adoptLegacy, claimOnDevice, clearRefresh, refreshOnDevice, type DeviceAccess } from "./device-secret.ts";
import { api, CalendarApiError, fetchStatus, GoogleSource, type ApiClient, type ConnStatus } from "./google-source.ts";
import { LEGACY_ICS, withoutSource, type IcsSourceMeta } from "./ics-source.ts";
import { isWritableRole } from "./source.ts";
import { applyFlush, bannerFor, enqueue, flushPending, syncCalendar, writeOf, type PendingOp } from "./sync.ts";

export type Banner = "failed" | "expired" | "disconnected" | "offline" | "partial" | null;

/** Desktop hand-off in progress: the browser shows a code the user types here. */
export type Handoff = { hid: string; startedAt: number; error?: string; busy?: boolean; fail?: ClaimFail; retryAt?: number };

type State = {
  status: ConnStatus | null;
  email: string | null;
  canEdit: boolean;
  lastSync: string | null;
  banner: Banner;
  syncTokens: Record<string, string>;
  /** Card 179: calendars that have had their one ownership-backfill pull. */
  ownerBackfill: Record<string, true>;
  pending: PendingOp[];
  icsSources: IcsSourceMeta[];
  connecting: boolean;
  syncing: boolean;
  handoff: Handoff | null;
  /** Card 168 (d), Eric's pick: new events go to the Google main calendar by default. */
  newEventsTo: "google" | "local";
  /** Card 174 K2: one-off message for the Calendar view (e.g. a refused move). Not persisted. */
  notice?: string | null;
};

const initial: State = { newEventsTo: "google", handoff: null, status: null, email: null, canEdit: false, lastSync: null, banner: null, syncTokens: {}, ownerBackfill: {}, pending: [], icsSources: [], connecting: false, syncing: false };

let legacyRefresh: string | null = null;

export const useCalAccounts = create<State>()(
  persist(() => initial, {
    name: "atrium.calendar.v1",
    version: 2,
    storage: createJSONStorage(() => (typeof localStorage === "undefined" ? (undefined as unknown as Storage) : localStorage)),
    partialize: ({ connecting: _c, syncing: _s, status: _st, handoff: _h, notice: _n, ...keep }) => keep,
    // v1 kept a long-lived Bearer sid in localStorage. Migration 0003 turned it into a refresh
    // handle on the server; move it to the device store and drop it from localStorage.
    migrate: (persisted, version) => {
      const p = { ...(persisted as Record<string, unknown>) };
      if (version < 2 && typeof p.session === "string") legacyRefresh = p.session;
      delete p.session;
      return p as unknown as State;
    },
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

let access: { token: string; exp: number } | null = null;
let renewing: Promise<string | null> | null = null;
const RENEW_EARLY_MS = 5 * 60_000;

function keepAccess(a: DeviceAccess) {
  access = { token: a.access, exp: a.accessExp };
}

async function forgetDevice() {
  access = null;
  legacyRefresh = null;
  await clearRefresh();
}

/** Rotate the refresh handle (Card 167 M2). 409 = another request just rotated: reread once. */
function renew(): Promise<string | null> {
  if (renewing) return renewing;
  renewing = (async () => {
    try {
      for (let i = 0; i < 2; i++) {
        try {
          const a = await refreshOnDevice();
          keepAccess(a);
          return a.access;
        } catch (e) {
          if (e instanceof CalendarApiError && e.status === 409) {
            await new Promise((r) => setTimeout(r, 400));
            continue;
          }
          if (e instanceof CalendarApiError && e.status === 401) await forgetDevice();
          return null;
        }
      }
      return null;
    } finally {
      renewing = null;
    }
  })();
  return renewing;
}

async function accessToken() {
  if (legacyRefresh) {
    await adoptLegacy(legacyRefresh).catch(() => undefined);
    legacyRefresh = null;
  }
  if (access && access.exp - Date.now() > RENEW_EARLY_MS) return access.token;
  return renew();
}

async function client(): Promise<ApiClient> {
  if (!isTauri()) return { base: "" };
  return { base: calendarApiBase(), native: true, session: await accessToken(), renew };
}
const source = async () => new GoogleSource(await client());
const online = () => (typeof navigator === "undefined" ? true : navigator.onLine !== false);

export async function refreshStatus() {
  const s = await fetchStatus(await client());
  if (s.state === "connected") set({ status: s, email: s.email, canEdit: s.canEdit, banner: get().banner === "expired" || get().banner === "disconnected" ? null : get().banner });
  else if (s.state === "expired") set({ status: s, banner: "expired" });
  else if (s.state === "disconnected" && get().email) {
    // B3: revoked elsewhere, DB reset or row deleted. Keep events (read-only, "as of" last sync)
    // and the pending queue until the user reconnects or chooses to discard; forget the session.
    await forgetDevice();
    set({ status: s, banner: "disconnected" });
  } else set({ status: s, ...(s.state === "unreachable" && get().email ? { banner: online() ? "failed" : "offline" } : {}) });
  return s;
}

/** True while Google is linked but this device can't write (expired or disconnected): view only. */
export function googleWritesPaused(st: Pick<State, "banner" | "status"> = get()) {
  return st.banner === "disconnected" || st.banner === "expired" || st.status?.state === "expired" || st.status?.state === "disconnected";
}

/** Card 168 B3 "Discard changes" (after ConfirmRow): drop queued writes; local-only creates go too. */
export function discardPending() {
  const ops = get().pending;
  const created = new Set(ops.filter((o) => o.kind === "create").map((o) => o.localId));
  useAtrium.setState((s) => ({ events: s.events.filter((e) => !(e.source === "google" && created.has(e.id) && !e.remoteId)) }));
  set({ pending: [], syncTokens: {}, ownerBackfill: {} });
}

function b64url(bytes: Uint8Array) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

let cancelFlow: (() => void) | null = null;
let verifier: string | null = null;

/**
 * Card 164 state 2. Web: a Google popup on this origin (cookie session). Desktop/Android
 * (Card 167 B2): the server issues a hand-off id for our challenge, the system browser signs in
 * and shows a 6-character code, and the user types it here; the claim needs code + verifier.
 */
export async function connectGoogle(opts: { loginHint?: string } = {}) {
  cancelFlow?.();
  set({ connecting: true });
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  cancelFlow = () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    verifier = null;
    set({ connecting: false, handoff: null });
    cancelFlow = null;
  };
  const hint = opts.loginHint ? `login_hint=${encodeURIComponent(opts.loginHint)}` : "";
  const deadline = Date.now() + 10 * 60_000;
  if (isTauri()) {
    verifier = b64url(crypto.getRandomValues(new Uint8Array(32)));
    const challenge = b64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
    let hid: string;
    try {
      hid = (await api<{ hid: string }>({ base: calendarApiBase(), native: true }, "/handoff/start", { method: "POST", body: JSON.stringify({ challenge }) })).hid;
    } catch (e) {
      cancelFlow?.();
      throw e instanceof CalendarApiError && e.status === 429 ? new Error(e.message) : new Error("Couldn't reach Atrium's calendar service");
    }
    const ok = await openExternal(`${calendarApiBase()}/api/calendar/connect?hid=${encodeURIComponent(hid)}${hint ? `&${hint}` : ""}`);
    if (!ok) {
      cancelFlow?.();
      throw new Error("Couldn't open the browser");
    }
    set({ handoff: { hid, startedAt: Date.now() } });
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
    const s = await fetchStatus(await client());
    if (s.state === "connected") {
      cancelFlow?.();
      await afterConnect();
      return;
    }
    timer = setTimeout(() => void poll(), 2000);
  };
  timer = setTimeout(() => void poll(), 2000);
}

/** The user typed the code from the browser page. Returns an error message, or null when connected. */
export async function submitHandoffCode(code: string): Promise<string | null> {
  const h = get().handoff;
  if (!h || !verifier) return "Start again: choose Sign in with Google.";
  set({ handoff: { ...h, busy: true, error: undefined, fail: undefined } });
  try {
    keepAccess(await claimOnDevice(h.hid, verifier, code));
  } catch (e) {
    // Card 176 L7: fixed copy per failure kind; the hand-off stays so the next action shows.
    const fail = claimFailKind(e);
    const msg = CLAIM_COPY[fail];
    set({ handoff: { ...h, busy: false, error: msg, fail, retryAt: fail === "rate_limited" ? Date.now() + RATE_LIMIT_WAIT_MS : undefined } });
    return msg;
  }
  cancelFlow?.();
  await afterConnect().catch(() => undefined);
  return null;
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
    await api(await client(), "/disconnect", { method: "POST" });
  } catch {
    /* already gone on the server: still forget locally */
  }
  await forgetDevice();
  dropGoogleLocal();
  set({ status: { state: "disconnected" } });
}

function dropGoogleLocal() {
  useAtrium.setState((s) => ({ events: s.events.filter((e) => e.source !== "google"), gcalCals: [], gcalOff: [] }));
  set({ email: null, canEdit: false, lastSync: null, banner: null, syncTokens: {}, ownerBackfill: {}, pending: [] });
}

/** Calendars the user can write to, primary first (Card 164 Q2: new events default to primary). */
export function writableGoogleCalendars(cals: GCalDesk[] = useAtrium.getState().gcalCals, canEdit = get().canEdit) {
  if (!canEdit || googleWritesPaused()) return [];
  return cals.filter((c) => isWritableRole(c.accessRole)).sort((a, b) => Number(Boolean(b.primary)) - Number(Boolean(a.primary)));
}

export function isReadOnlyEvent(e: CalendarEvent, cals: GCalDesk[] = useAtrium.getState().gcalCals, canEdit = get().canEdit) {
  if (e.source === "ics") return true;
  if (e.source !== "google") return false;
  if (googleWritesPaused()) return true;
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
      const src = await source();
      if (get().pending.length) {
        const r = await flushPending(src, get().pending);
        useAtrium.setState((s) => ({ events: applyFlush(s.events, r) }));
        set({ pending: r.left });
        const refused = r.conflicts.find((c) => c.kind === "move");
        if (refused) {
          const name = useAtrium.getState().gcalCals.find((c) => c.id === refused.moveTo)?.label ?? "that calendar";
          set({ notice: `Couldn't move to ${name}. Nothing changed.` });
        }
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
      const backfill = { ...get().ownerBackfill };
      const pendingIds = new Set(get().pending.map((p) => p.localId));
      for (const c of cals) {
        if (off.has(c.id)) continue;
        // Card 179 (N1): backfill full pull at most once per calendar; see syncCalendar.
        const r = await syncCalendar(src, useAtrium.getState().events, c.id, tokens[c.id], Boolean(backfill[c.id]), pendingIds);
        useAtrium.setState({ events: r.events });
        backfill[c.id] = true;
        if (r.token) tokens[c.id] = r.token;
        else delete tokens[c.id];
      }
      const known = new Set(cals.map((c) => c.id));
      useAtrium.setState((s) => ({ events: s.events.filter((e) => e.source !== "google" || !e.calId || known.has(e.calId)) }));
      set({ syncTokens: tokens, ownerBackfill: backfill, lastSync: new Date().toISOString(), banner: null });
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
  await queueGoogleWrites([{ kind, event: e }]);
}

/** Several writes that belong together (series split, move between calendars), one sync. */
export async function queueGoogleWrites(ops: { kind: PendingOp["kind"]; event: CalendarEvent; moveTo?: string; notify?: "all" | "none" }[]) {
  let q = get().pending;
  for (const { kind, event: e, moveTo, notify } of ops) {
    if (!e.calId) continue;
    q = enqueue(q, { id: uid(), kind, calId: e.calId, localId: e.id, remoteId: e.remoteId, etag: e.etag, write: kind === "delete" || kind === "move" ? undefined : writeOf(e), moveTo, notify, at: new Date().toISOString() });
  }
  set({ pending: q });
  if (syncing) await syncing;
  await syncNow();
}

export function setNewEventsTo(v: "google" | "local") {
  set({ newEventsTo: v });
}

/** Default target for a new event: Google main calendar when writable, else Atrium only. */
export function defaultEventTarget(writable: GCalDesk[], pref = get().newEventsTo) {
  return pref === "google" ? (writable[0]?.id ?? "local") : "local";
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

export function clearNotice() {
  set({ notice: null });
}
