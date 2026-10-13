import assert from "node:assert/strict";
import { test } from "node:test";
import { MODULE_IDS, VIEW_IDS, toViewId } from "./types.ts";

test("every module is a persisted view, plus dashboard and options", () => {
  for (const id of MODULE_IDS) assert.equal(toViewId(id, "dashboard"), id);
  assert.equal(toViewId("dashboard", "calendar"), "dashboard");
  assert.equal(toViewId("options", "dashboard"), "options");
  assert.equal(VIEW_IDS.length, MODULE_IDS.length + 2);
});

test("clock survives a reload (Card 134 regression)", () => {
  assert.equal(toViewId("clock", "dashboard"), "clock");
});

test("legacy and junk saved views", () => {
  assert.equal(toViewId("modules", "dashboard"), "options");
  assert.equal(toViewId("nope", "dashboard"), "dashboard");
  assert.equal(toViewId(undefined, "dashboard"), "dashboard");
  assert.equal(toViewId(42, "notes"), "notes");
});
