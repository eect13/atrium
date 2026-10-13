import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { floatsAllowed, isMobileApp, nativeWindows } from "./platform.ts";
import { hubTopics, HUB_TOPIC_OTHER } from "./feed.ts";

const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP2A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0 Mobile Safari/537.36";
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148";
const WIN = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36 Edg/129.0";

test("isMobileApp: build-time TAURI_ENV_PLATFORM android/ios wins", () => {
  assert.equal(isMobileApp({ build: "android", tauri: true, ua: WIN }), true);
  assert.equal(isMobileApp({ build: "ios", tauri: true, ua: "" }), true);
  assert.equal(isMobileApp({ build: "windows", tauri: true, ua: WIN }), false);
  assert.equal(isMobileApp({ build: "desktop", tauri: true, ua: WIN }), false);
});

test("isMobileApp: runtime fallback only inside Tauri (Android / iOS WebView UA)", () => {
  assert.equal(isMobileApp({ build: "", tauri: true, ua: ANDROID }), true);
  assert.equal(isMobileApp({ build: "", tauri: true, ua: IPHONE }), true);
  assert.equal(isMobileApp({ build: "", tauri: true, ua: WIN }), false);
  // The website on a phone is not the mobile app (its floats are width-gated, lg only).
  assert.equal(isMobileApp({ build: "", tauri: false, ua: ANDROID }), false);
});

test("gating: native windows only on desktop Tauri; floats off only in the mobile app", () => {
  assert.equal(nativeWindows({ build: "", tauri: true, ua: WIN }), true);
  assert.equal(nativeWindows({ build: "", tauri: true, ua: ANDROID }), false);
  assert.equal(nativeWindows({ build: "android", tauri: true, ua: ANDROID }), false);
  assert.equal(nativeWindows({ build: "", tauri: false, ua: WIN }), false);
  assert.equal(floatsAllowed({ build: "", tauri: true, ua: ANDROID }), false);
  assert.equal(floatsAllowed({ build: "", tauri: false, ua: ANDROID }), true);
  assert.equal(floatsAllowed({ build: "", tauri: true, ua: WIN }), true);
});

async function withTauri(ua: string, run: (mod: typeof import("./native-float.ts")) => Promise<void>) {
  const calls: string[] = [];
  const g = globalThis as Record<string, unknown>;
  const prevWin = g.window;
  const prevNav = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  g.window = {
    __TAURI_INTERNALS__: {
      invoke: async (cmd: string) => {
        calls.push(cmd);
        throw new Error("stub");
      },
      transformCallback: () => 0,
      metadata: { currentWindow: { label: "main" }, currentWebview: { windowLabel: "main", label: "main" } },
    },
    addEventListener() {},
    removeEventListener() {},
  };
  Object.defineProperty(globalThis, "navigator", { value: { userAgent: ua }, configurable: true });
  try {
    await run(await import("./native-float.ts"));
  } finally {
    g.window = prevWin;
    if (prevNav) Object.defineProperty(globalThis, "navigator", prevNav);
  }
  return calls;
}

test("no native window calls on mobile (Android WebView in Tauri)", async () => {
  const calls = await withTauri(ANDROID, async (m) => {
    assert.equal(await m.openNativeFloat("widget", "w1", { x: 0, y: 0, w: 300, h: 200, title: "Clock" }, () => {}), false);
    await m.closeNativeFloat("widget", "w1");
    await m.closeAllNativeFloats();
    await m.closeAllNativeFloatsForExit(50);
    await m.setNativeAlwaysOnTop(true);
    m.watchNativeClose(() => {})();
    m.watchNativeBounds(() => {})();
    await new Promise((r) => setTimeout(r, 20));
  });
  assert.deepEqual(calls, []);
});

test("control: the same calls do reach Tauri on desktop", async () => {
  const calls = await withTauri(WIN, async (m) => {
    await m.openNativeFloat("widget", "w1", { x: 0, y: 0, w: 300, h: 200, title: "Clock" }, () => {}).catch(() => false);
    await new Promise((r) => setTimeout(r, 20));
  });
  assert.ok(calls.length > 0, "desktop Tauri still creates native floats");
});

test("wiring: every float surface and native call is gated", () => {
  assert.match(src("lib/native-session.ts"), /if \(!nativeWindows\(\)\) return \(\) => \{\};/);
  assert.doesNotMatch(src("lib/native-float.ts"), /if \(!isTauri\(\)\) return/);
  const layer = src("components/desktop-layer.tsx");
  assert.match(layer, /if \(!nativeWindows\(\)\) return;/);
  assert.match(layer, /if \(isTauri\(\) \|\| !floatsAllowed\(\)\) return null;/);
  const chrome = src("components/desk-chrome.tsx");
  assert.equal((chrome.match(/if \(!floats\) return null;/g) ?? []).length, 3, "FloatBtn, NotesFloatBtn, DeskMenu");
  assert.match(chrome, /className="relative hidden lg:block"/, "Windows menu below lg is hidden on the web too");
  assert.doesNotMatch(src("components/calendar/calendar-toolbar.tsx"), /label: "Float"/);
  assert.match(src("components/views/options-view.tsx"), /\{floats \? \(\s*<Card id="opt-desk"/);
  assert.match(src("components/views/notes-view.tsx"), /onPin=\{floats \? \(\) => pinNote\(n\.id\) : undefined\}/);
  for (const f of ["components/desk-chrome.tsx", "components/atrium-app.tsx", "components/views/options-view.tsx", "components/views/notes-view.tsx", "components/views/dashboard-view.tsx"])
    assert.match(src(f), /const floats = useFloatsAllowed\(\);/, `${f} uses the hydration-safe hook`);
  assert.match(src("lib/use-platform.ts"), /useSyncExternalStore\(noop, \(\) => floatsAllowed\(\), \(\) => true\)/);
  assert.match(src("components/atrium-app.tsx"), /\{floats \? \(\s*<div role="region" aria-label="Floating windows"/);
});

test("capabilities: window permissions are desktop-only (Tauri 2 platforms)", () => {
  const desk = JSON.parse(readFileSync(new URL("../../src-tauri/capabilities/desktop.json", import.meta.url), "utf8"));
  const mob = JSON.parse(readFileSync(new URL("../../src-tauri/capabilities/mobile.json", import.meta.url), "utf8"));
  assert.deepEqual(desk.platforms, ["linux", "macOS", "windows"]);
  assert.ok(desk.permissions.includes("core:webview:allow-create-webview-window"));
  assert.deepEqual(mob.platforms, ["iOS", "android"]);
  assert.deepEqual(mob.permissions, ["core:default"]);
  assert.ok(!mob.permissions.some((p: string) => /window:allow|webview:allow/.test(p)));
});

test("44px: Retry prices, Use starter sources, Notes swatches", () => {
  const w = src("components/widgets.tsx");
  assert.match(w, /className="mt-2 inline-flex min-h-11 items-center text-xs underline" onClick=\{\(\) => void markets\.refetch\(\)\}/);
  assert.match(w, /className="inline-flex min-h-11 items-center text-sm text-foreground underline-offset-2 hover:underline"/);
  assert.match(src("components/views/finance-markets.tsx"), /min-h-11 items-center px-5 text-xs underline/);
  assert.match(src("components/views/notes-view.tsx"), /aria-label="Add note"\s+className="size-11 /);
});

test("Form 191: Other chip last and only with items; Saved Remove / + Add link; Curate Unfollow", () => {
  const at = new Date().toISOString();
  const item = (id: string, topic?: string) => ({ id, url: `https://x.example/${id}`, title: id, kind: "link" as const, at, ...(topic ? { topic } : {}) });
  assert.deepEqual(hubTopics({ interests: ["Mars"], hub: [item("a", "Mars")] }), ["Mars"]);
  assert.deepEqual(hubTopics({ interests: ["Mars"], hub: [item("b", HUB_TOPIC_OTHER), item("a", "Mars")] }), ["Mars", HUB_TOPIC_OTHER]);
  const p = src("components/views/feed-panels.tsx");
  assert.match(p, /\{ label: "Remove", destructive: true/);
  assert.match(p, /verb="Remove"\s+detail="It leaves Saved\. The story isn't deleted anywhere\."/);
  assert.match(p, /aria-label="Add a link to Saved"[^>]*>\s*\+ Add link/);
  // Card 195 (Form 194 G6) supersedes the Curate ConfirmRow: immediate Unfollow with Undo.
  assert.match(p, /unfollowWithUndo\(/);
  assert.match(src("components/views/unfollow-undo.ts"), /toast\(`Unfollowed \$\{label\}`/);
  const t = src("components/views/feed-topics.tsx");
  assert.match(t, /"Saved items that don't match a followed topic\."/);
  assert.match(t, /"Use ⋯ or Alt\+↑\/↓ to reorder\."/);
  assert.match(t, /Dismissed · \{prefs\.dismissed\.length\}/);
  assert.doesNotMatch(t, /this week" \|\| | this week<\/span>/);
});

test("Card 189 A1–A3: delete/move descriptions and the always-mounted live region", () => {
  const c = src("components/views/calendar-view.tsx");
  assert.match(c, /delFailed \? "ev-del-reason ev-del-fail" : "ev-del-reason"/);
  assert.match(c, /aria-describedby=\{delDescribedBy\}/);
  assert.match(c, /<span id="ev-del-reason">\{delBlock\}<\/span>/);
  assert.match(c, /<span id="ev-del-fail">Couldn&apos;t reach Google\.<\/span>/);
  assert.doesNotMatch(c, /id="ev-del-block" aria-live/);
  assert.match(c, /<p id="ev-del-live" className="sr-only" aria-live="polite" aria-atomic="true">/);
  assert.match(c, /"ev-cal-move" : "", calBlock \? "ev-cal-block" : ""/);
  assert.match(c, /\{calBlock \? <p id="ev-cal-block"/);
});
