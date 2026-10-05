import assert from "node:assert/strict";
import { test } from "node:test";
import { publicHttpUrl, withTimeout } from "./http.ts";

test("withTimeout rejects a hung request", async () => {
  await assert.rejects(withTimeout(new Promise(() => {}), 30, "Timed out"), /Timed out/);
});

test("withTimeout returns a fast result", async () => {
  assert.equal(await withTimeout(Promise.resolve("ok"), 200), "ok");
});

test("publicHttpUrl accepts only public http(s)", () => {
  assert.ok(publicHttpUrl("https://example.com/a"));
  assert.equal(publicHttpUrl("http://127.0.0.1/x"), null);
  assert.equal(publicHttpUrl("javascript:alert(1)"), null);
});
