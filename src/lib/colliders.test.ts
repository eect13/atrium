import assert from "node:assert/strict";
import { test } from "node:test";
import { addColliderNote, collidersFor, watchColliderNotes } from "./colliders.ts";
import type { WatchItem } from "./types.ts";

const bdo: WatchItem = { id: "bdo", symbol: "BDO", label: "BDO", name: "BDO Unibank", kind: "stock" };
const sm: WatchItem = { id: "sm", symbol: "SM", label: "SM", name: "SM Investments", kind: "stock" };
const smc: WatchItem = { id: "smc", symbol: "SMC", label: "SMC", name: "San Miguel", kind: "stock" };
const smph: WatchItem = { id: "smph", symbol: "SMPH", label: "SMPH", name: "SM Prime", kind: "stock" };
const ac: WatchItem = { id: "ac", symbol: "AC", label: "AC", name: "Ayala Corp", kind: "stock" };
const ali: WatchItem = { id: "ali", symbol: "ALI", label: "ALI", name: "Ayala Land", kind: "stock" };
const jgs: WatchItem = { id: "jgs", symbol: "JGS", label: "JGS", name: "JG Summit", kind: "stock" };
const urc: WatchItem = { id: "urc", symbol: "URC", label: "URC", name: "Universal Robina", kind: "stock" };
const tel: WatchItem = { id: "tel", symbol: "TEL", label: "TEL", name: "PLDT", kind: "stock" };
const phi: WatchItem = { id: "phi", symbol: "PHI", label: "PHI", name: "PLDT ADR", kind: "global" };
const tencent: WatchItem = { id: "0700hk", symbol: "0700.HK", label: "0700", name: "Tencent", kind: "global" };
const tcehy: WatchItem = { id: "tcehy", symbol: "TCEHY", label: "TCEHY", name: "Tencent ADR", kind: "global" };
const named: WatchItem = { id: "x", symbol: "X", label: "X", name: "BDO Unibank", kind: "stock" };

test("BDO foreign trap fires from one watched name", () => {
  assert.ok(collidersFor(bdo).some((c) => c.kind === "foreign"));
  const notes = watchColliderNotes([bdo, sm]);
  assert.ok(notes.some((n) => /Banco de Oro/i.test(n)));
  assert.equal(notes.some((n) => /San Miguel/i.test(n)), false);
});

test("SM vs SMC is a name collider only when both sit on the watcher", () => {
  assert.equal(watchColliderNotes([sm]).some((n) => /San Miguel/i.test(n)), false);
  assert.ok(watchColliderNotes([sm, smc]).some((n) => /San Miguel/i.test(n)));
  assert.ok(watchColliderNotes([sm, smph]).some((n) => /SM group/i.test(n)));
});

test("adding SMC next to SM warns before the row lands", () => {
  const note = addColliderNote([sm], smc);
  assert.ok(note && /San Miguel/i.test(note));
  assert.equal(addColliderNote([bdo], sm), undefined);
  assert.match(addColliderNote([], bdo) ?? "", /Banco de Oro/);
});

test("Tencent HK and ADR are a dual listing", () => {
  assert.ok(watchColliderNotes([tencent, tcehy]).some((n) => /ADR/i.test(n)));
  assert.equal(watchColliderNotes([tencent]).some((n) => /ADR/i.test(n)), false);
});

test("Ayala and JG groups fire when two listings sit together", () => {
  assert.ok(watchColliderNotes([ac, ali]).some((n) => /Ayala/i.test(n)));
  assert.ok(watchColliderNotes([jgs, urc]).some((n) => /JG Summit/i.test(n)));
  assert.equal(watchColliderNotes([ac]).some((n) => /Ayala sleeve/i.test(n)), false);
});

test("PLDT PSE and ADR are a dual listing", () => {
  assert.ok(watchColliderNotes([tel, phi]).some((n) => /PHI/i.test(n)));
  assert.equal(watchColliderNotes([tel]).some((n) => /PHI/i.test(n)), false);
});

test("a watch name whose first token is a ticker still hits the trap", () => {
  assert.ok(collidersFor(named).some((c) => c.kind === "foreign"));
  assert.match(addColliderNote([], named) ?? "", /Banco de Oro/);
});

test("AC foreign trap is the holdco, not Air Canada", () => {
  assert.match(addColliderNote([], ac) ?? "", /Ayala Corporation/);
});
