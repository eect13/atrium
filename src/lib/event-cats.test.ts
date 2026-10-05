import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DEFAULT_EVENT_CATS,
  catsWithOrphans,
  eventCatColor,
  eventCatLabel,
  normalizeEventCats,
  slugCatId,
} from "./event-cats.ts";

test("normalizeEventCats falls back to defaults", () => {
  assert.equal(normalizeEventCats(null).length, DEFAULT_EVENT_CATS.length);
  assert.equal(normalizeEventCats([]).length, DEFAULT_EVENT_CATS.length);
});

test("normalizeEventCats keeps custom rows", () => {
  const cats = normalizeEventCats([{ id: "school", label: "School", color: "#123" }]);
  assert.equal(cats.length, 1);
  assert.equal(cats[0]?.label, "School");
  assert.equal(eventCatLabel(cats, "school"), "School");
  assert.equal(eventCatColor(cats, "school"), "#123");
});

test("slugCatId folds labels", () => {
  assert.equal(slugCatId("  My Club "), "my-club");
  assert.ok(slugCatId("!!!").startsWith("cat-"));
});

test("catsWithOrphans keeps unknown event ids selectable", () => {
  const cats = catsWithOrphans(DEFAULT_EVENT_CATS, ["work", "legacy-x"]);
  assert.ok(cats.some((c) => c.id === "legacy-x"));
  assert.equal(eventCatLabel(cats, "legacy-x"), "legacy-x");
});
