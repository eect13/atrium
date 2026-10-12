import assert from "node:assert/strict";
import { test } from "node:test";
import { RETRY_AFTER_CAP_S, retryAfterSeconds } from "./http.ts";

test("Card 154 N12: Retry-After seconds, HTTP-date and 15 min cap", () => {
  assert.equal(retryAfterSeconds("120"), 120);
  assert.equal(retryAfterSeconds(" 5 "), 5);
  assert.equal(retryAfterSeconds("99999"), RETRY_AFTER_CAP_S);
  const now = Date.parse("Sun, 06 Nov 1994 08:49:37 GMT");
  assert.equal(retryAfterSeconds("Sun, 06 Nov 1994 08:50:07 GMT", now), 30);
  assert.equal(retryAfterSeconds("Sun, 06 Nov 1994 08:40:00 GMT", now), 0);
  assert.equal(retryAfterSeconds("Sun, 06 Nov 1994 10:49:37 GMT", now), RETRY_AFTER_CAP_S);
  assert.equal(retryAfterSeconds("soon"), null);
  assert.equal(retryAfterSeconds(null), null);
});
