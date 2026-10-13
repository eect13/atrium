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

/// Card 174 M-a (Critic 171): the calendar refresh handle never reaches the WebView.
/// Rust claims the hand-off and rotates the handle itself; JS only ever gets the 1 h access handle.
/// At rest it is sealed with Windows DPAPI (CryptProtectData, current user) on Windows; on other
/// desktops it is a 0600 file in the app's private data dir. There is no command that returns it.
const CAL_API_DEFAULT: &str = "https://atrium-swart-seven.vercel.app";
#[cfg(windows)]
const CAL_ENTROPY: &[u8] = b"atrium-calendar-session-v1";

/// Fixed at build time (same name as the web build's VITE_CALENDAR_API_ORIGIN), never from JS,
/// so a script can't point the refresh at another server.
fn cal_api_base() -> String {
    let v = option_env!("VITE_CALENDAR_API_ORIGIN").unwrap_or(CAL_API_DEFAULT).trim_end_matches('/');
    if v.starts_with("https://") || v.starts_with("http://127.0.0.1:") || v.starts_with("http://localhost:") {
        v.to_string()
    } else {
        CAL_API_DEFAULT.to_string()
    }
}

fn cal_dir(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app.path().app_local_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn valid_secret(v: &str) -> bool {
    !v.is_empty() && v.len() <= 512 && v.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

#[cfg(windows)]
mod dpapi {
    use windows_sys::Win32::Foundation::{LocalFree, HLOCAL};
    use windows_sys::Win32::Security::Cryptography::{
        CryptProtectData, CryptUnprotectData, CRYPTPROTECT_UI_FORBIDDEN, CRYPT_INTEGER_BLOB,
    };

    fn blob(b: &[u8]) -> CRYPT_INTEGER_BLOB {
        CRYPT_INTEGER_BLOB { cbData: b.len() as u32, pbData: b.as_ptr() as *mut u8 }
    }

    unsafe fn take(out: CRYPT_INTEGER_BLOB) -> Vec<u8> {
        let v = std::slice::from_raw_parts(out.pbData, out.cbData as usize).to_vec();
        LocalFree(out.pbData as HLOCAL);
        v
    }

    pub fn protect(plain: &[u8], entropy: &[u8]) -> Result<Vec<u8>, String> {
        let input = blob(plain);
        let ent = blob(entropy);
        let mut out = CRYPT_INTEGER_BLOB { cbData: 0, pbData: std::ptr::null_mut() };
        let ok = unsafe { CryptProtectData(&input, std::ptr::null(), &ent, std::ptr::null(), std::ptr::null(), CRYPTPROTECT_UI_FORBIDDEN, &mut out) };
        if ok == 0 {
            return Err("CryptProtectData failed".into());
        }
        Ok(unsafe { take(out) })
    }

    pub fn unprotect(sealed: &[u8], entropy: &[u8]) -> Result<Vec<u8>, String> {
        let input = blob(sealed);
        let ent = blob(entropy);
        let mut out = CRYPT_INTEGER_BLOB { cbData: 0, pbData: std::ptr::null_mut() };
        let ok = unsafe { CryptUnprotectData(&input, std::ptr::null_mut(), &ent, std::ptr::null(), std::ptr::null(), CRYPTPROTECT_UI_FORBIDDEN, &mut out) };
        if ok == 0 {
            return Err("CryptUnprotectData failed".into());
        }
        Ok(unsafe { take(out) })
    }
}

#[cfg(windows)]
fn seal_secret(v: &str) -> Result<Vec<u8>, String> {
    dpapi::protect(v.as_bytes(), CAL_ENTROPY)
}
#[cfg(windows)]
fn open_secret(b: &[u8]) -> Option<String> {
    dpapi::unprotect(b, CAL_ENTROPY).ok().and_then(|v| String::from_utf8(v).ok())
}
#[cfg(not(windows))]
fn seal_secret(v: &str) -> Result<Vec<u8>, String> {
    Ok(v.as_bytes().to_vec())
}
#[cfg(not(windows))]
fn open_secret(b: &[u8]) -> Option<String> {
    String::from_utf8(b.to_vec()).ok()
}

/// `calendar-session.bin` (sealed). Card 170's plaintext `calendar-session.secret` is read once,
/// sealed into the new file, then removed. `calendar-session.used` marks that this install has
/// held a Rust-managed session, which closes the one-time `cal_session_adopt` door (Card 177 L8).
const BIN: &str = "calendar-session.bin";
const LEGACY: &str = "calendar-session.secret";
const MARK: &str = "calendar-session.used";

fn store_read(dir: &std::path::Path) -> Option<String> {
    if let Ok(b) = std::fs::read(dir.join(BIN)) {
        return open_secret(&b).map(|v| v.trim().to_string()).filter(|v| valid_secret(v));
    }
    let old = dir.join(LEGACY);
    let v = std::fs::read_to_string(&old).ok()?.trim().to_string();
    if !valid_secret(&v) {
        return None;
    }
    if store_write(dir, &v).is_ok() {
        let _ = std::fs::remove_file(&old);
    }
    Some(v)
}

fn store_write(dir: &std::path::Path, v: &str) -> Result<(), String> {
    if !valid_secret(v) {
        return Err("invalid value".into());
    }
    let p = dir.join(BIN);
    let tmp = p.with_extension("tmp");
    std::fs::write(&tmp, seal_secret(v)?).map_err(|e| e.to_string())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&tmp, std::fs::Permissions::from_mode(0o600));
    }
    std::fs::rename(&tmp, &p).map_err(|e| e.to_string())?;
    let _ = std::fs::write(dir.join(MARK), b"1");
    Ok(())
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

/// Card 177 L8: adopt only the one-time move of a Card 165-era handle from localStorage — when
/// this install has never held a Rust-managed session (no .bin, no legacy file, no marker).
/// Anything else is refused, so a script can't plant a handle later.
fn store_adopt(dir: &std::path::Path, v: &str) -> Result<(), String> {
    if dir.join(MARK).exists() || dir.join(BIN).exists() || dir.join(LEGACY).exists() {
        return Err("refused".into());
    }
    store_write(dir, v)
}

fn cal_read(app: &tauri::AppHandle) -> Option<String> {
    store_read(&cal_dir(app).ok()?)
}

fn cal_write(app: &tauri::AppHandle, v: &str) -> Result<(), String> {
    store_write(&cal_dir(app)?, v)
}

fn cal_clear_files(app: &tauri::AppHandle) -> Result<(), String> {
    store_clear(&cal_dir(app)?)
}

/// Strip the refresh handle from a server reply before it goes to JS.
fn without_refresh(mut body: serde_json::Value) -> serde_json::Value {
    if let Some(o) = body.as_object_mut() {
        o.remove("refresh");
    }
    body
}

async fn cal_post(path: &str, body: serde_json::Value) -> Result<(u16, serde_json::Value), String> {
    let client = reqwest::Client::builder().timeout(std::time::Duration::from_secs(20)).build().map_err(|e| e.to_string())?;
    let res = client
        .post(format!("{}/api/calendar{}", cal_api_base(), path))
        .header("content-type", "application/json")
        .body(body.to_string())
        .send()
        .await
        .map_err(|_| "offline".to_string())?;
    let status = res.status().as_u16();
    let text = res.text().await.unwrap_or_default();
    Ok((status, serde_json::from_str(&text).unwrap_or(serde_json::Value::Null)))
}

/// Reply shape for JS: `{ status, body }`, the body never carrying `refresh`.
fn reply(status: u16, body: serde_json::Value) -> serde_json::Value {
    serde_json::json!({ "status": status, "body": without_refresh(body) })
}

/// Keep the new refresh handle (if any) and hand JS the rest.
fn keep_pair(app: &tauri::AppHandle, status: u16, body: serde_json::Value) -> Result<serde_json::Value, String> {
    if status == 200 {
        let r = body.get("refresh").and_then(|v| v.as_str()).unwrap_or("");
        cal_write(app, r)?;
    }
    Ok(reply(status, body))
}

#[tauri::command]
async fn cal_session_claim(app: tauri::AppHandle, hid: String, verifier: String, code: String) -> Result<serde_json::Value, String> {
    if hid.len() > 128 || verifier.len() > 128 || code.len() > 16 {
        return Err("invalid value".into());
    }
    let (status, body) = cal_post("/handoff/claim", serde_json::json!({ "hid": hid, "verifier": verifier, "code": code })).await?;
    keep_pair(&app, status, body)
}

#[tauri::command]
async fn cal_session_refresh(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let Some(refresh) = cal_read(&app) else {
        return Ok(reply(401, serde_json::json!({ "error": "disconnected" })));
    };
    let (status, body) = cal_post("/session/refresh", serde_json::json!({ "refresh": refresh })).await?;
    if status == 401 {
        cal_clear_files(&app)?;
    }
    keep_pair(&app, status, body)
}

/// One-time move of a Card 165-era handle that JS still had in localStorage. Write-only, and
/// never replaces a handle that is already stored.
#[tauri::command]
fn cal_session_adopt(app: tauri::AppHandle, value: String) -> Result<(), String> {
    store_adopt(&cal_dir(&app)?, &value)
}

#[tauri::command]
fn cal_session_clear(app: tauri::AppHandle) -> Result<(), String> {
    cal_clear_files(&app)
}

#[cfg(test)]
mod secret_tests {
    use super::{cal_api_base, open_secret, reply, seal_secret, store_adopt, store_clear, store_read, store_write, valid_secret, without_refresh, BIN, LEGACY, MARK};

    fn tmp_dir(tag: &str) -> std::path::PathBuf {
        let d = std::env::temp_dir().join(format!("atrium-c177-{}-{}", tag, std::process::id()));
        let _ = std::fs::remove_dir_all(&d);
        std::fs::create_dir_all(&d).unwrap();
        d
    }

    #[test]
    fn bin_path_sealed_round_trip_and_clear() {
        let d = tmp_dir("bin");
        store_write(&d, "mockrefresh1xxxxxxxx").unwrap();
        let raw = std::fs::read(d.join(BIN)).unwrap();
        #[cfg(windows)]
        assert!(!raw.windows(20).any(|w| w == b"mockrefresh1xxxxxxxx"), "DPAPI: .bin is not plaintext");
        let _ = raw;
        assert_eq!(store_read(&d).as_deref(), Some("mockrefresh1xxxxxxxx"));
        store_clear(&d).unwrap();
        assert!(!d.join(BIN).exists());
        assert_eq!(store_read(&d), None);
        let _ = std::fs::remove_dir_all(&d);
    }

    #[test]
    fn legacy_plaintext_file_is_sealed_then_removed() {
        let d = tmp_dir("legacy");
        std::fs::write(d.join(LEGACY), "oldhandle_123").unwrap();
        assert_eq!(store_read(&d).as_deref(), Some("oldhandle_123"));
        assert!(!d.join(LEGACY).exists(), "plaintext file removed");
        assert!(d.join(BIN).exists(), "sealed .bin written");
        assert_eq!(store_read(&d).as_deref(), Some("oldhandle_123"));
        let _ = std::fs::remove_dir_all(&d);
    }

    #[test]
    fn adopt_is_one_time_only() {
        let d = tmp_dir("adopt");
        store_adopt(&d, "legacy_sid_1").unwrap();
        assert_eq!(store_read(&d).as_deref(), Some("legacy_sid_1"));
        assert!(store_adopt(&d, "planted_2").is_err(), "second adopt refused");
        store_clear(&d).unwrap();
        assert!(d.join(MARK).exists(), "marker survives sign-out");
        assert!(store_adopt(&d, "planted_3").is_err(), "refused after sign-out too");
        let d2 = tmp_dir("adopt2");
        store_write(&d2, "claimed_handle").unwrap();
        store_clear(&d2).unwrap();
        assert!(store_adopt(&d2, "planted_4").is_err(), "refused once a claim ever happened");
        let d3 = tmp_dir("adopt3");
        std::fs::write(d3.join(LEGACY), "x_1").unwrap();
        assert!(store_adopt(&d3, "planted_5").is_err(), "refused when a legacy file exists");
        for x in [d, d2, d3] {
            let _ = std::fs::remove_dir_all(&x);
        }
    }

    #[test]
    fn refresh_never_returned_to_js() {
        let r = reply(200, serde_json::json!({ "access": "a", "refresh": "r", "accessExp": 1 }));
        assert_eq!(r["status"], 200);
        assert!(r["body"].get("refresh").is_none());
        assert_eq!(r["body"]["access"], "a");
        assert_eq!(without_refresh(serde_json::Value::Null), serde_json::Value::Null);
    }

    #[test]
    fn seal_round_trip_and_api_base_is_fixed() {
        let s = seal_secret("abc_DEF-1").unwrap();
        assert_eq!(open_secret(&s).as_deref(), Some("abc_DEF-1"));
        #[cfg(windows)]
        assert!(!s.windows(9).any(|w| w == b"abc_DEF-1"), "DPAPI output is not plaintext");
        let b = cal_api_base();
        assert!(b.starts_with("https://") || b.starts_with("http://127.0.0.1:") || b.starts_with("http://localhost:"));
        assert!(!b.ends_with('/'));
    }

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
        .invoke_handler(tauri::generate_handler![fetch_text, open_url, cal_session_claim, cal_session_refresh, cal_session_adopt, cal_session_clear])
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
