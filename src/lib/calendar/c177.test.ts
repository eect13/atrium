import { test } from "node:test";
import assert from "node:assert/strict";
import { CLAIM_COPY, claimFailKind, retryLabel, RATE_LIMIT_WAIT_MS } from "./claim-errors.ts";
import { deleteBlock, GUEST_HELPER, seriesGuestQuestion } from "./move.ts";
import { unwrapReply } from "./device-secret.ts";
import type { CalendarEvent } from "../types.ts";

const fail = (status: number, body: { error?: string; message?: string } | null) => {
  try {
    unwrapReply({ status, body });
  } catch (e) {
    return claimFailKind(e);
  }
  throw new Error("no throw");
};

test("L7: Rust reply → message kind (fixed copy, never the server message)", () => {
  assert.equal(fail(401, { error: "bad_code", message: "x" }), "bad_code");
  assert.equal(fail(429, { error: "rate_limited" }), "rate_limited");
  assert.equal(fail(410, { error: "used" }), "used");
  assert.equal(fail(410, { error: "expired" }), "expired");
  assert.equal(fail(410, null), "expired");
  assert.equal(fail(0, null), "offline");
  assert.equal(fail(500, { error: "boom", message: "stack" }), "unknown");
  assert.equal(claimFailKind(new Error("nope")), "unknown");
  for (const s of Object.values(CLAIM_COPY)) assert.doesNotMatch(s, /\d{3}|error|stack/i);
  assert.equal(CLAIM_COPY.expired, "This code has expired. Codes last 2 minutes.");
});

test("L7: 60 s wait label counts down m:ss", () => {
  assert.equal(RATE_LIMIT_WAIT_MS, 60_000);
  assert.equal(retryLabel(59_000), "Try again in 0:59");
  assert.equal(retryLabel(9_000), "Try again in 0:09");
});

test("Form 176 (a): guest step question per scope", () => {
  assert.equal(seriesGuestQuestion("this", 1), "Tell 1 guest this date is cancelled?");
  assert.equal(seriesGuestQuestion("following", 3), "Tell 3 guests these dates are cancelled?");
  assert.equal(seriesGuestQuestion("all", 2), "Tell 2 guests the event is cancelled?");
  assert.equal(GUEST_HELPER, "Google emails them a cancellation. If you don't send one, it still leaves their calendars.");
});

const ev = (p: Partial<CalendarEvent>): CalendarEvent => ({ id: "x", title: "t", start: "2026-10-13T01:00:00Z", ...p }) as CalendarEvent;

test("Card 177 (b): pre-sync delete block", () => {
  assert.equal(deleteBlock(ev({}), null), null, "Atrium-only never blocked");
  assert.equal(deleteBlock(ev({ source: "google" }), "2026-10-13T00:00:00Z"), "Finish syncing before deleting Google events.", "unknown ownership");
  assert.equal(deleteBlock(ev({ source: "google", organizerSelf: true, guestCount: 2 }), null), "Finish syncing before deleting events that have guests.");
  assert.equal(deleteBlock(ev({ source: "google", organizerSelf: true, guestCount: 0 }), null), null, "no guests not blocked");
  assert.equal(deleteBlock(ev({ source: "google", organizerSelf: true, guestCount: 2 }), "2026-10-13T00:00:00Z"), null, "re-enabled after sync");
});
