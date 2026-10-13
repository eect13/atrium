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

test("main-window exit clears the float keep flag once the floats are gone (C47)", async () => {
  const store = new Map<string, string>();
  const ls = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
  };
  let open = ["main", "widget-cal"];
  const seenAtFloatClose: (string | null)[] = [];
  const g = globalThis as Record<string, unknown>;
  const had = { window: g.window, localStorage: g.localStorage };
  g.localStorage = ls;
  g.window = {
    setTimeout,
    clearTimeout,
    __TAURI_INTERNALS__: {
      metadata: { currentWindow: { label: "main" }, currentWebview: { label: "main", windowLabel: "main" } },
      transformCallback: () => 1,
      invoke: async (cmd: string, args: { label?: string }) => {
        if (cmd === "plugin:window|get_all_windows") return [...open];
        if (cmd === "plugin:window|close") {
          // the float's own close handler reads the shared flag before it goes
          seenAtFloatClose.push(ls.getItem("atrium.float.keep"));
          setTimeout(() => (open = open.filter((l) => l !== args.label)), 120);
          return null;
        }
        return null;
      },
    },
  };
  try {
    const { closeAllNativeFloatsForExit } = await import("./native-float.ts");
    ls.setItem("atrium.float.keep", "2"); // stuck from an earlier session
    await closeAllNativeFloatsForExit();
    assert.deepEqual(seenAtFloatClose, ["3"], "floats still see the keep flag while they close");
    assert.deepEqual(open, ["main"], "waited until the float was gone");
    assert.equal(ls.getItem("atrium.float.keep"), null, "flag cleared before main is destroyed (no timer needed)");
  } finally {
    g.window = had.window;
    g.localStorage = had.localStorage;
  }
});

test("native-session wires main close to closeAllNativeFloatsForExit (O8 coverage)", async () => {
  const { readFile } = await import("node:fs/promises");
  const src = await readFile(new URL("./native-session.ts", import.meta.url), "utf8");
  assert.match(src, /import \{ closeAllNativeFloatsForExit \} from "@\/lib\/native-float"/);
  assert.match(src, /onCloseRequested/);
  assert.match(src, /await closeAllNativeFloatsForExit\(\)/);
});
