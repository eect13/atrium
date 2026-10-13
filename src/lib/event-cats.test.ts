import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CAT_SWATCHES,
  DEFAULT_EVENT_CATS,
  catFg,
  catsWithOrphans,
  eventCatColor,
  eventCatLabel,
  eventCatTagStyle,
  nextCatColor,
  normalizeEventCats,
  remapCatId,
  slugCatId,
  type EventCategory,
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
  assert.equal(eventCatLabel(cats, "legacy-x"), "Legacy x");
});

test("defaults use dedicated --cat-* tokens, not chrome", () => {
  for (const c of DEFAULT_EVENT_CATS) {
    assert.equal(c.color, `var(--cat-${c.id})`);
    assert.equal(catFg(c.color!), `var(--cat-${c.id}-fg)`);
  }
});

test("legacy Card 108 chrome colours remap to the palette", () => {
  const cats = normalizeEventCats([
    { id: "work", label: "Work", color: "var(--color-ring)" },
    { id: "club", label: "Club", color: "#a855f7" },
    { id: "own", label: "Own", color: "#123456" },
  ]);
  assert.equal(cats[0]?.color, "var(--cat-work)");
  assert.equal(cats[1]?.color, "var(--cat-personal)");
  assert.equal(cats[2]?.color, "#123456");
});

test("swatches are unique palette tokens (no duplicate purple)", () => {
  const colors = CAT_SWATCHES.map((s) => s.color);
  assert.equal(new Set(colors).size, colors.length);
  assert.equal(colors.filter((c) => /personal|purple|lilac|violet/.test(c)).length, 1);
  for (const c of colors) assert.match(c, /^var\(--cat-[a-z]+\)$/);
});

test("custom categories map to palette tokens", () => {
  const cats: EventCategory[] = [{ id: "travel", label: "Travel" }];
  assert.match(eventCatColor(cats, "travel"), /^var\(--cat-[a-z]+\)$/);
  assert.equal(eventCatColor(cats, "travel"), eventCatColor(cats, "travel"));
  assert.equal(eventCatColor([], "health"), "var(--cat-health)");
  const mixed = [...DEFAULT_EVENT_CATS, { id: "travel", label: "Travel" }];
  const used = DEFAULT_EVENT_CATS.map((c) => c.color);
  assert.ok(!used.includes(eventCatColor(mixed, "travel")));
});

test("nextCatColor picks an unused swatch", () => {
  assert.equal(nextCatColor(DEFAULT_EVENT_CATS), "var(--cat-pink)");
});

test("catFg picks readable text for raw hex fills", () => {
  assert.equal(catFg("#ffffff"), "#0c0c0d");
  assert.equal(catFg("#000"), "#ffffff");
  assert.equal(catFg("#8e24aa"), "#ffffff");
  const style = eventCatTagStyle(DEFAULT_EVENT_CATS, "work", "#f6bf26");
  assert.equal(style["--tag-bg"], "#f6bf26");
  assert.equal(style["--tag-fg"], "#0c0c0d");
});

test("delete remaps to Other, else first remaining", () => {
  assert.equal(remapCatId(DEFAULT_EVENT_CATS, "family"), "other");
  assert.equal(remapCatId(DEFAULT_EVENT_CATS, "other"), "work");
  assert.equal(remapCatId(DEFAULT_EVENT_CATS, "family", "health"), "health");
});

test("labels never show raw ids", () => {
  assert.equal(eventCatLabel([], "my-club"), "My club");
});
