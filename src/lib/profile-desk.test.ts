import assert from "node:assert/strict";
import { test } from "node:test";
import { collectProfileBackup, parseProfileBackup, restoreProfileBackup, wipeAtriumStorage, PERSIST_KEY, PROFILE_KIND } from "./profile-desk.ts";

function mem() {
  const bag = new Map<string, string>();
  return {
    get length() {
      return bag.size;
    },
    key(i: number) {
      return [...bag.keys()][i] ?? null;
    },
    getItem(k: string) {
      return bag.has(k) ? bag.get(k)! : null;
    },
    setItem(k: string, v: string) {
      bag.set(k, v);
    },
    removeItem(k: string) {
      bag.delete(k);
    },
    clear() {
      bag.clear();
    },
  };
}

test("wipeAtriumStorage drops only atrium.* keys", () => {
  const ls = mem();
  const ss = mem();
  (globalThis as { localStorage: Storage }).localStorage = ls as unknown as Storage;
  (globalThis as { sessionStorage: Storage }).sessionStorage = ss as unknown as Storage;
  ls.setItem(PERSIST_KEY, '{"notes":[]}');
  ls.setItem("atrium.win", "{}");
  ls.setItem("other.app", "keep");
  ss.setItem("atrium.news.snap", "{}");
  wipeAtriumStorage();
  assert.equal(ls.getItem(PERSIST_KEY), null);
  assert.equal(ls.getItem("atrium.win"), null);
  assert.equal(ls.getItem("other.app"), "keep");
  assert.equal(ss.getItem("atrium.news.snap"), null);
});

test("backup restore round-trips atrium keys and rejects junk", () => {
  const ls = mem();
  const ss = mem();
  (globalThis as { localStorage: Storage }).localStorage = ls as unknown as Storage;
  (globalThis as { sessionStorage: Storage }).sessionStorage = ss as unknown as Storage;
  ls.setItem(PERSIST_KEY, '{"view":"notes"}');
  const file = collectProfileBackup();
  assert.equal(file.kind, PROFILE_KIND);
  assert.equal(file.storage[PERSIST_KEY], '{"view":"notes"}');
  ls.setItem(PERSIST_KEY, "dirty");
  restoreProfileBackup(file);
  assert.equal(ls.getItem(PERSIST_KEY), '{"view":"notes"}');
  assert.throws(() => parseProfileBackup("{}"));
});
