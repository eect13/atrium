#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::Manager;

/// Longest Retry-After honoured (15 min).
const RETRY_AFTER_CAP: u64 = 15 * 60;

/// RFC 9110 §10.2.3: delay-seconds or IMF-fixdate ("Wed, 21 Oct 2026 07:28:00 GMT") → seconds, capped.
fn retry_after_secs(raw: &str, now_unix: u64) -> Option<u64> {
    let v = raw.trim();
    if v.is_empty() {
        return None;
    }
    if v.chars().all(|c| c.is_ascii_digit()) {
        return v.parse::<u64>().ok().map(|n| n.min(RETRY_AFTER_CAP));
    }
    let at = imf_fixdate_unix(v)?;
    Some(at.saturating_sub(now_unix).min(RETRY_AFTER_CAP))
}

fn imf_fixdate_unix(v: &str) -> Option<u64> {
    // "Sun, 06 Nov 1994 08:49:37 GMT"
    let p: Vec<&str> = v.split_whitespace().collect();
    if p.len() != 6 || p[5] != "GMT" {
        return None;
    }
    let day: i64 = p[1].parse().ok()?;
    let month = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
        .iter()
        .position(|m| *m == p[2])? as i64
        + 1;
    let year: i64 = p[3].parse().ok()?;
    let t: Vec<i64> = p[4].split(':').map(|x| x.parse().ok()).collect::<Option<Vec<i64>>>()?;
    if t.len() != 3 || !(1..=31).contains(&day) {
        return None;
    }
    // Days from civil (Howard Hinnant).
    let y = if month <= 2 { year - 1 } else { year };
    let era = if y >= 0 { y } else { y - 399 } / 400;
    let yoe = y - era * 400;
    let mp = (month + 9) % 12;
    let doy = (153 * mp + 2) / 5 + day - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    let days = era * 146_097 + doe - 719_468;
    let secs = days * 86_400 + t[0] * 3_600 + t[1] * 60 + t[2];
    u64::try_from(secs).ok()
}

#[cfg(test)]
mod retry_tests {
    use super::*;
    #[test]
    fn seconds_date_and_cap() {
        assert_eq!(retry_after_secs("120", 0), Some(120));
        assert_eq!(retry_after_secs("99999", 0), Some(RETRY_AFTER_CAP));
        assert_eq!(imf_fixdate_unix("Sun, 06 Nov 1994 08:49:37 GMT"), Some(784_111_777));
        assert_eq!(retry_after_secs("Sun, 06 Nov 1994 08:50:07 GMT", 784_111_777), Some(30));
        assert_eq!(retry_after_secs("Sun, 06 Nov 1994 08:49:37 GMT", 784_200_000), Some(0));
        assert_eq!(retry_after_secs("Sun, 06 Nov 1994 10:49:37 GMT", 784_111_777), Some(RETRY_AFTER_CAP));
        assert_eq!(retry_after_secs("soon", 0), None);
    }
}

#[tauri::command]
async fn fetch_text(url: String, ua: Option<String>) -> Result<String, String> {
    if blocked_url(&url) {
        return Err("That address is not allowed".into());
    }
    // Callers may name themselves (Wikimedia User-Agent policy); otherwise the browser UA.
    let agent = ua
        .filter(|s| !s.is_empty() && s.len() <= 200 && s.chars().all(|c| c.is_ascii_graphic() || c == ' '))
        .unwrap_or_else(|| "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36".to_string());
    let client = reqwest::Client::builder()
        .user_agent(agent)
        .timeout(std::time::Duration::from_secs(20))
        .redirect(reqwest::redirect::Policy::limited(6))
        .build()
        .map_err(|e| e.to_string())?;
    let res = client.get(&url).send().await.map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        // Keep Retry-After (seconds or HTTP-date, capped 15 min) so the caller can back off politely.
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);
        let retry = res
            .headers()
            .get(reqwest::header::RETRY_AFTER)
            .and_then(|v| v.to_str().ok())
            .and_then(|v| retry_after_secs(v, now));
        return Err(match retry {
            Some(s) => format!("HTTP {}; retry-after={}", res.status().as_u16(), s),
            None => format!("HTTP {}", res.status().as_u16()),
        });
    }
    let text = res.text().await.map_err(|e| e.to_string())?;
    if text.len() > 1_500_000 {
        return Err("Response too large".into());
    }
    Ok(text)
}


#[tauri::command]
fn open_url(url: String) -> Result<(), String> {
    if blocked_url(&url) {
        return Err("That address is not allowed".into());
    }
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("cmd")
            .args(["/C", "start", "", &url])
            .spawn()
            .map_err(|e| e.to_string())?;
        return Ok(());
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&url)
            .spawn()
            .map_err(|e| e.to_string())?;
        return Ok(());
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        std::process::Command::new("xdg-open")
            .arg(&url)
            .spawn()
            .map_err(|e| e.to_string())?;
        return Ok(());
    }
    #[allow(unreachable_code)]
    {
        let _ = url;
        Err("Open URL is not supported on this platform".into())
    }
}

fn blocked_url(url: &str) -> bool {
    let Ok(parsed) = reqwest::Url::parse(url) else {
        return true;
    };
    if parsed.scheme() != "http" && parsed.scheme() != "https" {
        return true;
    }
    let Some(host) = parsed.host_str() else {
        return true;
    };
    let h = host.trim_matches(|c| c == '[' || c == ']').to_ascii_lowercase();
    if h.is_empty()
        || h == "localhost"
        || h.ends_with(".local")
        || h.ends_with(".internal")
        || h == "metadata.google.internal"
    {
        return true;
    }
    if h == "0.0.0.0" || h == "::" || h == "::1" {
        return true;
    }
    let parts: Vec<&str> = h.split('.').collect();
    if parts.len() == 4 {
        let nums: Vec<Option<u8>> = parts.iter().map(|p| p.parse::<u8>().ok()).collect();
        if let [Some(a), Some(b), Some(_), Some(_)] = nums[..] {
            if a == 10 || a == 127 || a == 0 {
                return true;
            }
            if a == 169 && b == 254 {
                return true;
            }
            if a == 172 && (16..=31).contains(&b) {
                return true;
            }
            if a == 192 && b == 168 {
                return true;
            }
            if a == 100 && (64..=127).contains(&b) {
                return true;
            }
        }
    }
    h.starts_with("fe80:") || h.starts_with("fc") || h.starts_with("fd")
}

fn is_float_label(label: &str) -> bool {
    label.starts_with("note-") || label.starts_with("widget-")
}

// Desktop-only: mobile WebviewWindow has no unminimize(); only called from the
// desktop single-instance handler.
#[cfg(desktop)]
fn raise_floats(app: &tauri::AppHandle) {
    for (label, win) in app.webview_windows() {
        if !is_float_label(&label) {
            continue;
        }
        let _ = win.unminimize();
        let _ = win.show();
    }
}

/// Card 246 (Critic 245 B1): the removed calendar integration's device session lived in these files.
/// Only `cal_session_clear` remains (the Card 242 client migration calls it once); the claim /
/// refresh / adopt commands, the server client and the sealers are on `archive/google-calendar`.
const BIN: &str = "calendar-session.bin";
const LEGACY: &str = "calendar-session.secret";

fn cal_dir(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app.path().app_local_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn store_clear(dir: &std::path::Path) -> Result<(), String> {
    for name in [BIN, LEGACY, "calendar-session.tmp"] {
        match std::fs::remove_file(dir.join(name)) {
            Ok(()) => {}
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
            Err(e) => return Err(e.to_string()),
        }
    }
    Ok(())
}

pub mod state_file;
#[cfg(desktop)]
mod desk;

/// Card 212: did Ctrl+Shift+F12 register? (false on mobile, or when another app owns it)
#[tauri::command]
fn desk_shortcut_ok() -> bool {
    #[cfg(desktop)]
    return desk::shortcut_ok();
    #[cfg(not(desktop))]
    false
}

/// Card 217 R-b: main has captured + saved after tray Quit; finish the exit.
#[tauri::command]
fn desk_quit(app: tauri::AppHandle) {
    #[cfg(desktop)]
    desk::quit_now(&app);
    let _ = app;
}

/// Card 222: Open in Atrium raises main through desk::focus_main (foreground-lock safe).
#[tauri::command]
fn desk_focus_main(app: tauri::AppHandle) {
    #[cfg(desktop)]
    desk::focus_main(&app);
    let _ = app;
}

/// Card 212: Options › Unlock all, same path as the tray and the shortcut.
#[tauri::command]
fn desk_unlock_all(app: tauri::AppHandle) {
    #[cfg(desktop)]
    desk::unlock_all(&app);
    let _ = app;
}

fn state_dir(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    app.path().app_local_data_dir().map_err(|e| e.to_string())
}

/// Card 208: main's atrium.v1 save, mirrored to an app-data file (atomic). Main is the only caller.
#[tauri::command]
async fn state_save(app: tauri::AppHandle, text: String) -> Result<(), String> {
    state_file::stash(&state_dir(&app)?, text);
    off_worker(state_file::write_pending).await?
}

/// Card 211: Windows logoff/shutdown. WM_QUERYENDSESSION / WM_ENDSESSION reach the main window's
/// proc on the UI thread; write any pending state synchronously before Windows ends the process,
/// and ask main to save its window box (best effort; the per-save file already holds the rest).
#[cfg(windows)]
mod endsession {
    use windows_sys::Win32::Foundation::{HWND, LPARAM, LRESULT, WPARAM};
    use windows_sys::Win32::UI::Shell::{DefSubclassProc, SetWindowSubclass};
    use windows_sys::Win32::UI::WindowsAndMessaging::{WM_ENDSESSION, WM_QUERYENDSESSION};

    static APP: std::sync::OnceLock<tauri::AppHandle> = std::sync::OnceLock::new();

    unsafe extern "system" fn proc(hwnd: HWND, msg: u32, wp: WPARAM, lp: LPARAM, _id: usize, _data: usize) -> LRESULT {
        if msg == WM_QUERYENDSESSION || (msg == WM_ENDSESSION && wp != 0) {
            if let Some(app) = APP.get() {
                use tauri::Emitter;
                let _ = app.emit_to("main", "atrium:flush", ());
            }
            let _ = super::state_file::write_pending();
        }
        DefSubclassProc(hwnd, msg, wp, lp)
    }

    pub fn install(app: &tauri::AppHandle, win: &tauri::WebviewWindow) {
        let _ = APP.set(app.clone());
        if let Ok(h) = win.hwnd() {
            unsafe {
                SetWindowSubclass(h.0 as HWND, Some(proc), 0x0A7_211, 0);
            }
        }
    }
}



#[tauri::command]
async fn state_load(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let dir = state_dir(&app)?;
    off_worker(move || state_file::read(&dir)).await
}

async fn off_worker<T: Send + 'static>(f: impl FnOnce() -> T + Send + 'static) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(f).await.map_err(|e| e.to_string())
}

fn cal_clear_files(app: &tauri::AppHandle) -> Result<(), String> {
    store_clear(&cal_dir(app)?)
}

#[tauri::command]
fn cal_session_clear(app: tauri::AppHandle) -> Result<(), String> {
    cal_clear_files(&app)
}

#[cfg(test)]
mod cal_clear_tests {
    use super::{store_clear, BIN, LEGACY};

    #[test]
    fn clear_removes_session_files_and_tolerates_missing() {
        let d = std::env::temp_dir().join(format!("atrium-cal-clear-{}", std::process::id()));
        std::fs::create_dir_all(&d).unwrap();
        std::fs::write(d.join(BIN), b"x").unwrap();
        std::fs::write(d.join(LEGACY), b"y").unwrap();
        store_clear(&d).unwrap();
        assert!(!d.join(BIN).exists() && !d.join(LEGACY).exists());
        store_clear(&d).unwrap();
        let _ = std::fs::remove_dir_all(&d);
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();

    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.unminimize();
                let _ = win.show();
            }
            raise_floats(app);
        }));
        builder = builder.plugin(desk::plugin());
    }

    builder
        .invoke_handler(tauri::generate_handler![fetch_text, open_url, cal_session_clear, desk_shortcut_ok, desk_unlock_all, desk_quit, desk_focus_main, state_save, state_load])
        .setup(|app| {
            #[cfg(desktop)]
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.set_icon(tauri::include_image!("icons/icon.png"));
                #[cfg(windows)]
                endsession::install(app.handle(), &win);
            }
            #[cfg(desktop)]
            {
                desk::register_shortcut(app.handle());
                // No tray (e.g. no system tray on this desktop) must not stop the app.
                let _ = desk::build_tray(app.handle());
                // Card 228: pre-create the hidden ⋯ popup; drop it with main so a hidden
                // window never keeps the process alive.
                let _ = desk::create_menu_window(app.handle());
                if let Some(main) = app.get_webview_window("main") {
                    let h = app.handle().clone();
                    main.on_window_event(move |ev| {
                        if let tauri::WindowEvent::Destroyed = ev {
                            if let Some(m) = h.get_webview_window(desk::MENU_LABEL) {
                                let _ = m.destroy();
                            }
                        }
                    });
                }
            }
            let _ = app;
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building Atrium")
        .run(|app, event| {
            // Card 204 (Card 203 S4): on exit/shutdown ask main to write the window boxes now.
            if let tauri::RunEvent::ExitRequested { .. } = event {
                use tauri::Emitter;
                let _ = app.emit_to("main", "atrium:flush", ());
            }
            #[cfg(desktop)]
            if let tauri::RunEvent::Exit = event {
                desk::unregister_shortcut(app);
            }
        });
}
