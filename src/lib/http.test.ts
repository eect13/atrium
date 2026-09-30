import assert from "node:assert/strict";
import { test } from "node:test";
import { withTimeout } from "./http.ts";

test("withTimeout rejects a hung request", async () => {
  await assert.rejects(withTimeout(new Promise(() => {}), 30, "Timed out"), /Timed out/);
});

test("withTimeout returns a fast result", async () => {
  assert.equal(await withTimeout(Promise.resolve("ok"), 200), "ok");
});
