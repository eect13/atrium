import assert from "node:assert/strict";
import { test } from "node:test";
import { isQuotaError, onStorageQuota, QUOTA_NOTE, reportStorageQuota, resetStorageQuotaForTests } from "./quota.ts";

test("a full browser is reported once", () => {
  resetStorageQuotaForTests();
  const notes: string[] = [];
  const off = onStorageQuota((message) => notes.push(message));
  assert.equal(isQuotaError(Object.assign(new Error("full"), { name: "QuotaExceededError" })), true);
  assert.equal(isQuotaError(Object.assign(new Error("full"), { code: 22 })), true);
  assert.equal(isQuotaError(new Error("parse")), false);
  reportStorageQuota();
  reportStorageQuota();
  assert.deepEqual(notes, [QUOTA_NOTE]);
  off();
  resetStorageQuotaForTests();
});
