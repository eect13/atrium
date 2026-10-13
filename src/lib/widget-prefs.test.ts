import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeDashPrefs, WIDGET_DEFAULTS, widgetOpts } from "./widget-prefs.ts";
import { busyBlocks, countdownLabel, freeBusyText, longestFree, minutesUntil, nextHalfHour, upNext } from "./calendar/day-summary.ts";

test("widget options: helper text is off by default; stored picks win; junk is dropped", () => {
  assert.equal(WIDGET_DEFAULTS.clock.helper, false);
  assert.equal(WIDGET_DEFAULTS.calendar.helper, false);
  assert.equal(WIDGET_DEFAULTS.clock.shared, false);
  assert.equal(widgetOpts(undefined, "calendar").freeBusy, true);
  assert.equal(widgetOpts({ widgets: { clock: { helper: true } } }, "clock").helper, true);
  assert.deepEqual(normalizeDashPrefs({ widgets: { clock: { helper: "yes", seconds: false }, bogus: { a: true } } }), { widgets: { clock: { seconds: false } } });
  assert.deepEqual(normalizeDashPrefs(null), { widgets: {} });
});

const at = (hhmm: string) => new Date(`2026-10-13T${hhmm}:00+08:00`).toISOString();
const e = (id: string, a: string, b: string, allDay = false) => ({ id, title: id, start: at(a), end: at(b), allDay });

test("Calendar A: up next, countdown, free/busy text", () => {
  const evs = [e("standup", "09:00", "09:30"), e("review", "14:00", "15:30"), e("1on1", "17:00", "17:30"), e("trip", "00:00", "23:59", true)];
  const now = new Date(at("13:35"));
  assert.equal(upNext(evs, "2026-10-13", now)?.id, "review");
  assert.equal(minutesUntil(at("14:00"), now), 25);
  assert.equal(countdownLabel(25), "25 min");
  assert.equal(countdownLabel(65), "1 h 5 min");
  assert.equal(upNext(evs, "2026-10-13", new Date(at("17:10"))), null);
  const { merged } = busyBlocks(evs, "2026-10-13");
  assert.deepEqual(merged, [{ from: 9, to: 9.5 }, { from: 14, to: 15.5 }, { from: 17, to: 17.5 }]);
  assert.deepEqual(longestFree(merged, 15.5), { from: 17.5, to: 20 });
  assert.equal(freeBusyText(3, longestFree(merged, 13 + 35 / 60)), "3 events · free 17:30–20:00");
  assert.equal(freeBusyText(0, null), "Free");
  assert.equal(nextHalfHour(new Date(at("13:35"))).toISOString(), at("14:00"));
  assert.equal(nextHalfHour(new Date(at("13:05"))).toISOString(), at("13:30"));
});
