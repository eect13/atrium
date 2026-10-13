import assert from "node:assert/strict";
import { test } from "node:test";
import { confirmStep } from "./confirm.ts";

test("remove needs two steps: ask then confirm the same id", () => {
  assert.deepEqual(confirmStep(null, { type: "confirm", id: "a" }), { confirmId: null, commit: null });
  const asked = confirmStep(null, { type: "ask", id: "a" });
  assert.deepEqual(asked, { confirmId: "a", commit: null });
  assert.deepEqual(confirmStep(asked.confirmId, { type: "confirm", id: "a" }), { confirmId: null, commit: "a" });
});

test("only one row confirms at a time; confirming another id does nothing", () => {
  const a = confirmStep(null, { type: "ask", id: "a" });
  const b = confirmStep(a.confirmId, { type: "ask", id: "b" });
  assert.equal(b.confirmId, "b");
  assert.deepEqual(confirmStep(b.confirmId, { type: "confirm", id: "a" }), { confirmId: "b", commit: null });
});

test("cancel and closing the host clear the pending confirm", () => {
  assert.deepEqual(confirmStep("a", { type: "cancel" }), { confirmId: null, commit: null });
  assert.deepEqual(confirmStep("a", { type: "close" }), { confirmId: null, commit: null });
});
