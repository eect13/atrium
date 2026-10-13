/**
 * Two-way sync engine (pure; no React, no store). Card 163 §6:
 *   - incremental pulls with a per-calendar syncToken; HTTP 410 → full re-sync
 *   - writes queue locally first ("saved here, syncs when it works") and flush in order
 *   - a stale write (etag mismatch) fails instead of overwriting Google
 */
import type { CalendarEvent } from "../types.ts";
import { CalendarApiError } from "./google-source.ts";
import type { CalendarSource, EventWrite, ListEventsResult } from "./source.ts";

/** Full pulls start this far back; later changes arrive through the sync token. */
export const FULL_SYNC_BACK_DAYS = 180;

export function fullWindow(now = new Date()) {
  const from = new Date(now.getTime() - FULL_SYNC_BACK_DAYS * 86_400_000);
  const to = new Date(now.getTime() + 2 * 365 * 86_400_000);
  return { timeMin: from.toISOString(), timeMax: to.toISOString() };
}

export type PullResult = ListEventsResult & { full: boolean; window?: { timeMin: string; timeMax: string } };

export async function pullCalendar(src: CalendarSource, calId: string, token: string | undefined, now = new Date()): Promise<PullResult> {
  if (token) {
    const r = await src.listEvents(calId, { syncToken: token });
    if (!r.resync) return { ...r, full: false };
  }
  const window = fullWindow(now);
  return { ...(await src.listEvents(calId, window)), full: true, window };
}

const overlaps = (e: CalendarEvent, w: { timeMin: string; timeMax: string }) =>
  (e.repeat ? true : new Date(e.end) >= new Date(w.timeMin)) && new Date(e.start) <= new Date(w.timeMax);

/**
 * Fold one pull into the desk events. A full pull replaces that calendar's events inside its
 * window; an incremental pull upserts changes and drops deletions. Local-only fields
 * (Atrium category, chosen colour, reminder) survive a Google update.
 */
export function applyPull(events: CalendarEvent[], calId: string, r: PullResult, pendingIds: ReadonlySet<string> = new Set()): CalendarEvent[] {
  const incoming = new Map(r.events.map((e) => [e.id, e]));
  const gone = new Set(r.deleted);
  const out: CalendarEvent[] = [];
  for (const e of events) {
    const mine = e.source === "google" && e.calId === calId;
    if (!mine) {
      out.push(e);
      continue;
    }
    if (pendingIds.has(e.id)) {
      out.push(e);
      incoming.delete(e.id);
      continue;
    }
    const next = incoming.get(e.id);
    if (next) {
      out.push({ ...next, cat: e.cat || next.cat, color: e.color ?? next.color, reminder: next.reminder ?? e.reminder });
      incoming.delete(e.id);
      continue;
    }
    if (gone.has(e.id)) continue;
    if (r.full && r.window && overlaps(e, r.window)) continue;
    out.push(e);
  }
  out.push(...incoming.values());
  return out;
}

export type PendingOp = {
  id: string;
  kind: "create" | "update" | "delete" | "move";
  calId: string;
  /** move: destination calendar. */
  moveTo?: string;
  /** delete/move: who Google emails ("none" unless the user chose to tell guests). */
  notify?: "all" | "none";
  /** Desk id of the event (a temporary id until a create lands). */
  localId: string;
  remoteId?: string;
  etag?: string;
  write?: EventWrite;
  at: string;
};

/** Add an op, folding it into what is already queued for the same event. */
export function enqueue(queue: PendingOp[], op: PendingOp): PendingOp[] {
  const prev = queue.find((q) => q.localId === op.localId && q.kind !== "move");
  // Card 174 K2: a move is its own step after any queued edit (never folded into one).
  if (!prev || op.kind === "move" || queue.some((q) => q.localId === op.localId && q.kind === "move")) return [...queue, op];
  const rest = queue.filter((q) => q !== prev);
  if (op.kind === "delete") return prev.kind === "create" ? rest : [...rest, { ...op, remoteId: prev.remoteId ?? op.remoteId, etag: prev.etag ?? op.etag }];
  if (prev.kind === "create") return [...rest, { ...prev, write: op.write, calId: op.calId }];
  return [...rest, { ...op, kind: "update", remoteId: prev.remoteId ?? op.remoteId, etag: prev.etag ?? op.etag }];
}

export type FlushResult = {
  /** Ops that reached Google, with the event Google now has (absent for deletes). */
  done: { op: PendingOp; event?: CalendarEvent }[];
  /** Dropped because Google had a newer copy or the event is gone. */
  conflicts: PendingOp[];
  left: PendingOp[];
  /** Why the flush stopped early (offline, expired sign-in, Google error). */
  stopped?: { code: string; status: number };
};

export async function flushPending(src: CalendarSource, queue: PendingOp[]): Promise<FlushResult> {
  const res: FlushResult = { done: [], conflicts: [], left: [] };
  for (let i = 0; i < queue.length; i += 1) {
    const op = queue[i]!;
    try {
      if (op.kind === "create") res.done.push({ op, event: await src.createEvent!(op.calId, op.write!) });
      else if (op.kind === "update") res.done.push({ op, event: await src.updateEvent!(op.calId, op.remoteId!, { ...op.write!, etag: op.etag }, op.notify ?? "none") });
      else if (op.kind === "move") res.done.push({ op, event: await src.moveEvent!(op.calId, op.remoteId!, op.moveTo!, op.notify ?? "none") });
      else {
        await src.deleteEvent!(op.calId, op.remoteId!, op.etag, op.notify ?? "none");
        res.done.push({ op });
      }
    } catch (e) {
      const err = e instanceof CalendarApiError ? e : new CalendarApiError(0, "offline", e instanceof Error ? e.message : String(e));
      // A refused move (no access, not organizer, wrong event type) leaves the event where it is.
      if (op.kind === "move" && [400, 403, 404, 409, 412].includes(err.status)) {
        res.conflicts.push(op);
        continue;
      }
      if (err.code === "conflict" || err.code === "not_found") {
        if (op.kind === "delete" && err.code === "not_found") res.done.push({ op });
        else res.conflicts.push(op);
        continue;
      }
      res.stopped = { code: err.code, status: err.status };
      res.left = queue.slice(i);
      return res;
    }
  }
  return res;
}

/** Fold flushed ops back into the desk: temporary ids become Google ids, etags refresh. */
export function applyFlush(events: CalendarEvent[], r: FlushResult): CalendarEvent[] {
  let out = events;
  for (const { op, event } of r.done) {
    if (!event) continue;
    out = out.map((e) => (e.id === op.localId ? { ...event, cat: e.cat, color: e.color ?? event.color } : e));
  }
  return out;
}

export function writeOf(e: CalendarEvent): EventWrite {
  return { title: e.title, start: e.start, end: e.end, loc: e.loc, allDay: e.allDay, repeat: e.repeat, repeatInterval: e.repeatInterval, repeatUntil: e.repeatUntil, repeatCount: e.repeatCount, reminder: e.reminder, etag: e.etag };
}

/** Banner for a stopped sync (Card 164 §6). */
export function bannerFor(stop: { code: string; status: number } | undefined, online: boolean): "failed" | "expired" | "disconnected" | "offline" | "partial" | null {
  if (!stop) return null;
  if (!online || stop.code === "offline") return "offline";
  if (stop.code === "disconnected") return "disconnected";
  if (stop.code === "expired" || stop.status === 401) return "expired";
  if (stop.code === "needs_edit") return "partial";
  return "failed";
}

/**
 * Card 179 (Critic 178 N1): one calendar's pull. Events cached before Card 174 have no organiser
 * info and an incremental pull never refills them, so the first pull after that does a full window,
 * once per calendar (`backfilled`). After any pull, a Google event of that calendar still without
 * organiser info (outside the window, or Google sent none) counts as not the user's
 * (`organizerSelf: false`): no pre-sync block, and the existing not-yours rules for moves and prompts.
 */
export async function syncCalendar(
  src: CalendarSource,
  events: CalendarEvent[],
  calId: string,
  token: string | undefined,
  backfilled: boolean,
  pendingIds: ReadonlySet<string> = new Set(),
  now = new Date(),
): Promise<{ events: CalendarEvent[]; token: string | undefined; full: boolean }> {
  const stale = !backfilled && events.some((e) => e.source === "google" && e.calId === calId && e.organizerSelf === undefined);
  const r = await pullCalendar(src, calId, stale ? undefined : token, now);
  const next = applyPull(events, calId, r, pendingIds).map((e) => (e.source === "google" && e.calId === calId && e.organizerSelf === undefined ? { ...e, organizerSelf: false } : e));
  return { events: next, token: r.nextSyncToken, full: r.full };
}
