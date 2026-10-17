/**
 * Card 228 (Form 227 B4): the shared desktop "menu" popup window (`index.html?float=menu`).
 * Rust pre-creates it hidden; a float sends `atrium:menu-open` with its rows and the trigger's
 * screen rect. We size to the panel, place it on the trigger's monitor work area (flip / shift /
 * cap), show and focus it. Pick → owner runs the handler; Esc, blur or owner move/close → hide.
 * Never destroyed; never click-through.
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { MenuPanel } from "@/components/ui/overflow-menu";
import { focusFirstRow, menuKeys } from "@/lib/menu-keys";
import { MENU_EV, placeMenu, type MenuOpen, type WireRow } from "@/lib/native-menu";

/** Transparent margin around the panel so its shadow is not cut by the window edge (logical px). */
const PAD = 8;

export function MenuWindow() {
  const [m, setM] = useState<MenuOpen | null>(null);
  const panel = useRef<HTMLDivElement | null>(null);
  const cur = useRef<MenuOpen | null>(null);
  cur.current = m;

  useEffect(() => {
    document.documentElement.style.background = "transparent";
    document.body.style.background = "transparent";
    const offs: (() => void)[] = [];
    let dead = false;
    void (async () => {
      const [{ listen }, { getCurrentWebviewWindow }] = await Promise.all([import("@tauri-apps/api/event"), import("@tauri-apps/api/webviewWindow")]);
      const me = getCurrentWebviewWindow();
      const add = (u: () => void) => (dead ? u() : offs.push(u));
      add(await listen<MenuOpen>(MENU_EV.open, (e) => setM(e.payload)));
      add(await listen<{ seq: number; items: WireRow[] }>(MENU_EV.update, (e) => setM((c) => (c && c.seq === e.payload.seq ? { ...c, items: e.payload.items } : c))));
      add(await listen<{ seq: number }>(MENU_EV.close, (e) => (cur.current?.seq === e.payload.seq ? void close(false) : undefined)));
      add(await me.onFocusChanged((e) => (!e.payload && cur.current ? void close(false) : undefined)));
    })();
    return () => {
      dead = true;
      offs.forEach((f) => f());
    };
  }, []);

  async function close(refocus: boolean) {
    const c = cur.current;
    if (!c) return;
    setM(null);
    const [{ emitTo }, { getCurrentWebviewWindow }] = await Promise.all([import("@tauri-apps/api/event"), import("@tauri-apps/api/webviewWindow")]);
    await getCurrentWebviewWindow().hide().catch(() => undefined);
    await emitTo(c.owner, MENU_EV.closed, { seq: c.seq, refocus }).catch(() => undefined);
  }

  // Place and show after the panel has rendered at its natural size.
  useLayoutEffect(() => {
    const c = m;
    const el = panel.current;
    if (!c || !el) return;
    document.documentElement.classList.toggle("light", c.theme === "light");
    let stale = false;
    void (async () => {
      const [{ getCurrentWebviewWindow }, { monitorFromPoint, currentMonitor }, { PhysicalPosition, PhysicalSize }, { emitTo }] = await Promise.all([
        import("@tauri-apps/api/webviewWindow"),
        import("@tauri-apps/api/window"),
        import("@tauri-apps/api/dpi"),
        import("@tauri-apps/api/event"),
      ]);
      const me = getCurrentWebviewWindow();
      const mon = (await monitorFromPoint(c.anchor.x + c.anchor.w / 2, c.anchor.y + c.anchor.h / 2).catch(() => null)) ?? (await currentMonitor().catch(() => null));
      if (stale || !mon) return;
      const s = mon.scaleFactor;
      el.style.maxHeight = "";
      const natural = { w: el.offsetWidth * s, h: el.scrollHeight * s };
      const work = { x: mon.workArea.position.x, y: mon.workArea.position.y, w: mon.workArea.size.width, h: mon.workArea.size.height };
      const p = placeMenu(c.anchor, natural, work, s, PAD * s);
      el.style.maxHeight = `${Math.floor(p.h / s - 2 * PAD)}px`;
      await me.setIgnoreCursorEvents(false).catch(() => undefined);
      await me.setSize(new PhysicalSize(p.w, p.h));
      await me.setPosition(new PhysicalPosition(p.x, p.y));
      await me.setAlwaysOnTop(true).catch(() => undefined);
      if (stale) return;
      await me.show();
      await me.setFocus().catch(() => undefined);
      focusFirstRow(el);
      await emitTo(c.owner, MENU_EV.shown, { seq: c.seq });
    })().catch(() => undefined);
    return () => {
      stale = true;
    };
    // Re-place only for a new open (seq), not for toggle updates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [m?.seq]);

  if (!m) return null;
  return (
    <div style={{ padding: PAD }} className="h-dvh w-screen overflow-hidden">
      <MenuPanel
        ref={panel}
        label={m.label}
        onKeyDown={(e) => menuKeys(e, panel.current, () => void close(true), () => void close(false))}
        className={m.menuClassName}
        items={m.items}
        onPick={(i) => {
          const it = m.items[i];
          if (!it || it.separator) return;
          void import("@tauri-apps/api/event").then(({ emitTo }) => emitTo(m.owner, MENU_EV.pick, { seq: m.seq, index: i }));
          if (it.checked === undefined) void close(true);
        }}
      />
    </div>
  );
}
