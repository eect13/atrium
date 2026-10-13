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

/// Card 170 (Card 167 M2): the calendar refresh handle lives in the app's private data dir,
/// not in WebView localStorage. One opaque value; never logged.
fn cal_secret_path(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app.path().app_local_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("calendar-session.secret"))
}

fn valid_secret(v: &str) -> bool {
    !v.is_empty() && v.len() <= 512 && v.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

#[tauri::command]
fn cal_secret_get(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let p = cal_secret_path(&app)?;
    match std::fs::read_to_string(&p) {
        Ok(v) => {
            let v = v.trim().to_string();
            Ok(if valid_secret(&v) { Some(v) } else { None })
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
fn cal_secret_set(app: tauri::AppHandle, value: String) -> Result<(), String> {
    if !valid_secret(&value) {
        return Err("invalid value".into());
    }
    let p = cal_secret_path(&app)?;
    let tmp = p.with_extension("tmp");
    std::fs::write(&tmp, value.as_bytes()).map_err(|e| e.to_string())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&tmp, std::fs::Permissions::from_mode(0o600));
    }
    std::fs::rename(&tmp, &p).map_err(|e| e.to_string())
}

#[tauri::command]
fn cal_secret_clear(app: tauri::AppHandle) -> Result<(), String> {
    let p = cal_secret_path(&app)?;
    match std::fs::remove_file(&p) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

#[cfg(test)]
mod secret_tests {
    use super::valid_secret;
    #[test]
    fn only_opaque_handles() {
        assert!(valid_secret("abcDEF012-_"));
        assert!(!valid_secret(""));
        assert!(!valid_secret("a b"));
        assert!(!valid_secret("../x"));
        assert!(!valid_secret(&"a".repeat(513)));
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
    }

    builder
        .invoke_handler(tauri::generate_handler![fetch_text, open_url, cal_secret_get, cal_secret_set, cal_secret_clear])
        .setup(|app| {
            #[cfg(desktop)]
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.set_icon(tauri::include_image!("icons/icon.png"));
            }
            let _ = app;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Atrium");
}
