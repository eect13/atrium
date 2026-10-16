//! Card 212 (Form Card 209): desktop-widget escape hatches that never need the widget itself,
//! so a locked (click-through) or behind-everything widget can always be unlocked:
//! - global shortcut Ctrl+Shift+F12 = Unlock all (fails gracefully if another app owns it);
//! - tray menu: Open Atrium · Show widgets · Hide widgets | Unlock all widgets · Bring widgets to front | Quit.
//! Unlock clears click-through from Rust directly (works even if a webview is busy), then tells
//! main, the only writer, to clear `locked` on every window so it persists.
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

pub const UNLOCK_EVENT: &str = "atrium:unlock-all";
pub const SHORTCUT_LABEL: &str = "Ctrl+Shift+F12";
static SHORTCUT_OK: AtomicBool = AtomicBool::new(false);

pub fn unlock_shortcut() -> Shortcut {
    Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::F12)
}

pub fn shortcut_ok() -> bool {
    SHORTCUT_OK.load(Ordering::Relaxed)
}

fn floats(app: &AppHandle) -> Vec<tauri::WebviewWindow> {
    app.webview_windows().into_iter().filter(|(l, _)| super::is_float_label(l)).map(|(_, w)| w).collect()
}

pub fn unlock_all(app: &AppHandle) {
    for w in floats(app) {
        let _ = w.set_ignore_cursor_events(false);
    }
    let _ = app.emit_to("main", UNLOCK_EVENT, ());
}

pub fn plugin() -> tauri::plugin::TauriPlugin<tauri::Wry> {
    tauri_plugin_global_shortcut::Builder::new()
        .with_handler(|app, sc, ev| {
            if ev.state() == ShortcutState::Pressed && *sc == unlock_shortcut() {
                unlock_all(app);
            }
        })
        .build()
}

/// Register the shortcut; on failure (another app owns it) remember that and carry on.
pub fn register_shortcut(app: &AppHandle) {
    let ok = app.global_shortcut().register(unlock_shortcut()).is_ok();
    SHORTCUT_OK.store(ok, Ordering::Relaxed);
}

pub fn unregister_shortcut(app: &AppHandle) {
    let _ = app.global_shortcut().unregister_all();
}

pub fn build_tray(app: &AppHandle) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "open", "Open Atrium", true, None::<&str>)?;
    let show = MenuItem::with_id(app, "show", "Show widgets", true, None::<&str>)?;
    let hide = MenuItem::with_id(app, "hide", "Hide widgets", true, None::<&str>)?;
    let unlock = MenuItem::with_id(app, "unlock", format!("Unlock all widgets\t{SHORTCUT_LABEL}"), true, None::<&str>)?;
    let front = MenuItem::with_id(app, "front", "Bring widgets to front", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let sep1 = PredefinedMenuItem::separator(app)?;
    let sep2 = PredefinedMenuItem::separator(app)?;
    let menu = Menu::with_items(app, &[&open, &show, &hide, &sep1, &unlock, &front, &sep2, &quit])?;
    let mut tray = TrayIconBuilder::with_id("atrium").tooltip("Atrium").menu(&menu).show_menu_on_left_click(true);
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    tray.on_menu_event(|app, ev| match ev.id().as_ref() {
        "open" => {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.unminimize();
                let _ = w.show();
                let _ = w.set_focus();
            }
        }
        "show" => floats(app).iter().for_each(|w| {
            let _ = w.show();
        }),
        "hide" => floats(app).iter().for_each(|w| {
            let _ = w.hide();
        }),
        "unlock" => unlock_all(app),
        "front" => floats(app).iter().for_each(|w| {
            let _ = w.unminimize();
            let _ = w.show();
            let _ = w.set_focus();
        }),
        "quit" => {
            let _ = app.emit_to("main", "atrium:flush", ());
            let _ = super::state_file::write_pending();
            unregister_shortcut(app);
            app.exit(0);
        }
        _ => {}
    })
    .build(app)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn unlock_shortcut_is_ctrl_shift_f12_and_starts_unregistered() {
        let sc = unlock_shortcut();
        assert!(sc.matches(Modifiers::CONTROL | Modifiers::SHIFT, Code::F12));
        assert!(!sc.matches(Modifiers::CONTROL, Code::F12));
        assert!(!shortcut_ok(), "nothing claims success before register_shortcut ran");
    }
}
