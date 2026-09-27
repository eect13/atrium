import assert from "node:assert/strict";
import { test } from "node:test";
import { beginFloatKeep, endFloatKeep, floatKeepRequested, parseFloatHash } from "./native-float.ts";

test("parseFloatHash reads query (desktop native windows)", () => {
  const hit = parseFloatHash("https://tauri.localhost/index.html?float=note&id=abc-1");
  assert.deepEqual(hit, { kind: "note", id: "abc-1" });
});

test("parseFloatHash reads hash fallback", () => {
  const hit = parseFloatHash("https://tauri.localhost/index.html#float=widget&id=win9");
  assert.deepEqual(hit, { kind: "widget", id: "win9" });
});

test("parseFloatHash ignores junk", () => {
  assert.equal(parseFloatHash("https://tauri.localhost/index.html"), null);
  assert.equal(parseFloatHash("https://tauri.localhost/index.html?float=desk&id=x"), null);
});

test("float keep flag is shared through localStorage", () => {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem("atrium.float.keep");
  assert.equal(floatKeepRequested(), false);
  beginFloatKeep();
  beginFloatKeep();
  assert.equal(floatKeepRequested(), true);
  endFloatKeep();
  assert.equal(floatKeepRequested(), true);
  endFloatKeep();
  assert.equal(floatKeepRequested(), false);
});
