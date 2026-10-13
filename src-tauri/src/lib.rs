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

/// Card 195 (Critic 193 G2): how `calendar-session.bin` is sealed at rest, per platform.
/// Windows: DPAPI. Android: AES-256-GCM with a non-exportable key in AndroidKeyStore.
/// Other desktops: the 0600 file in the app's private dir (unchanged).
trait Sealer {
    fn seal(&self, plain: &[u8]) -> Result<Vec<u8>, String>;
    fn open(&self, sealed: &[u8]) -> Option<Vec<u8>>;
    /// False when the bytes predate this sealer (Android before Card 195 wrote plain bytes);
    /// store_read then re-seals them in place.
    fn is_sealed(&self, _b: &[u8]) -> bool {
        true
    }
}

#[cfg(windows)]
struct Dpapi;
#[cfg(windows)]
impl Sealer for Dpapi {
    fn seal(&self, plain: &[u8]) -> Result<Vec<u8>, String> {
        dpapi::protect(plain, CAL_ENTROPY)
    }
    fn open(&self, b: &[u8]) -> Option<Vec<u8>> {
        dpapi::unprotect(b, CAL_ENTROPY).ok()
    }
}

#[allow(dead_code)]
struct Plain;
impl Sealer for Plain {
    fn seal(&self, plain: &[u8]) -> Result<Vec<u8>, String> {
        Ok(plain.to_vec())
    }
    fn open(&self, b: &[u8]) -> Option<Vec<u8>> {
        Some(b.to_vec())
    }
}

/// Android at-rest format: MAGIC | iv_len (1 byte) | iv | ciphertext+tag. MAGIC starts with NUL,
/// so it can never be a valid (alphanumeric) handle written by the old plain path.
const AKS_MAGIC: &[u8] = b"\0AKS1";

#[allow(dead_code)]
fn aks_pack(iv: &[u8], ct: &[u8]) -> Result<Vec<u8>, String> {
    if iv.is_empty() || iv.len() > 32 || ct.len() < 16 {
        return Err("bad keystore output".into());
    }
    let mut out = Vec::with_capacity(AKS_MAGIC.len() + 1 + iv.len() + ct.len());
    out.extend_from_slice(AKS_MAGIC);
    out.push(iv.len() as u8);
    out.extend_from_slice(iv);
    out.extend_from_slice(ct);
    Ok(out)
}

#[allow(dead_code)]
fn aks_unpack(b: &[u8]) -> Option<(&[u8], &[u8])> {
    let rest = b.strip_prefix(AKS_MAGIC)?;
    let (&n, rest) = rest.split_first()?;
    let n = n as usize;
    if n == 0 || n > 32 || rest.len() < n + 16 {
        return None;
    }
    Some(rest.split_at(n))
}

#[cfg(target_os = "android")]
mod keystore {
    //! AndroidKeyStore over JNI (Tauri 2 `with_webview` → wry `JniHandle::exec`, jni 0.21 already
    //! in Cargo.lock via tauri). Key: AES-256, GCM/NoPadding, randomized IV, never leaves the TEE/keystore.
    use super::{aks_pack, aks_unpack, Sealer};
    use jni::objects::{JByteArray, JObject, JValue};
    use jni::JNIEnv;
    use std::time::Duration;
    use tauri::Manager;

    const ALIAS: &str = "atrium-calendar-session-v1";
    const ENCRYPT: i32 = 1;
    const DECRYPT: i32 = 2;
    /// KeyProperties.PURPOSE_ENCRYPT | PURPOSE_DECRYPT
    const PURPOSES: i32 = 3;

    pub struct Keystore(pub tauri::AppHandle);

    fn err(e: jni::errors::Error) -> String {
        e.to_string()
    }

    /// Run on the activity's thread and wait (≤5 s). Callers are async commands, never the main thread.
    fn run<T: Send + 'static>(app: &tauri::AppHandle, f: impl FnOnce(&mut JNIEnv) -> Result<T, String> + Send + 'static) -> Result<T, String> {
        let win = app.get_webview_window("main").ok_or("no main window")?;
        let (tx, rx) = std::sync::mpsc::channel();
        win.with_webview(move |wv| {
            wv.jni_handle().exec(move |env, _activity, _webview| {
                let r = f(env);
                if env.exception_check().unwrap_or(false) {
                    let _ = env.exception_clear();
                }
                let _ = tx.send(r);
            });
        })
        .map_err(|e| e.to_string())?;
        rx.recv_timeout(Duration::from_secs(5)).map_err(|_| "keystore timeout".to_string())?
    }

    fn strings<'a>(env: &mut JNIEnv<'a>, v: &str) -> Result<JObject<'a>, String> {
        let s = env.new_string(v).map_err(err)?;
        Ok(env.new_object_array(1, "java/lang/String", &s).map_err(err)?.into())
    }

    fn key<'a>(env: &mut JNIEnv<'a>) -> Result<JObject<'a>, String> {
        let provider = env.new_string("AndroidKeyStore").map_err(err)?;
        let ks = env
            .call_static_method("java/security/KeyStore", "getInstance", "(Ljava/lang/String;)Ljava/security/KeyStore;", &[JValue::Object(&provider)])
            .and_then(|v| v.l())
            .map_err(err)?;
        env.call_method(&ks, "load", "(Ljava/security/KeyStore$LoadStoreParameter;)V", &[JValue::Object(&JObject::null())]).map_err(err)?;
        let alias = env.new_string(ALIAS).map_err(err)?;
        let has = env.call_method(&ks, "containsAlias", "(Ljava/lang/String;)Z", &[JValue::Object(&alias)]).and_then(|v| v.z()).map_err(err)?;
        if !has {
            let aes = env.new_string("AES").map_err(err)?;
            let kg = env
                .call_static_method("javax/crypto/KeyGenerator", "getInstance", "(Ljava/lang/String;Ljava/lang/String;)Ljavax/crypto/KeyGenerator;", &[JValue::Object(&aes), JValue::Object(&provider)])
                .and_then(|v| v.l())
                .map_err(err)?;
            const B: &str = "android/security/keystore/KeyGenParameterSpec$Builder";
            const RB: &str = "Landroid/security/keystore/KeyGenParameterSpec$Builder;";
            let b = env.new_object(B, "(Ljava/lang/String;I)V", &[JValue::Object(&alias), JValue::Int(PURPOSES)]).map_err(err)?;
            let gcm = strings(env, "GCM")?;
            env.call_method(&b, "setBlockModes", &format!("([Ljava/lang/String;){RB}"), &[JValue::Object(&gcm)]).map_err(err)?;
            let pad = strings(env, "NoPadding")?;
            env.call_method(&b, "setEncryptionPaddings", &format!("([Ljava/lang/String;){RB}"), &[JValue::Object(&pad)]).map_err(err)?;
            env.call_method(&b, "setKeySize", &format!("(I){RB}"), &[JValue::Int(256)]).map_err(err)?;
            let spec = env.call_method(&b, "build", "()Landroid/security/keystore/KeyGenParameterSpec;", &[]).and_then(|v| v.l()).map_err(err)?;
            env.call_method(&kg, "init", "(Ljava/security/spec/AlgorithmParameterSpec;)V", &[JValue::Object(&spec)]).map_err(err)?;
            env.call_method(&kg, "generateKey", "()Ljavax/crypto/SecretKey;", &[]).map_err(err)?;
        }
        let k = env
            .call_method(&ks, "getKey", "(Ljava/lang/String;[C)Ljava/security/Key;", &[JValue::Object(&alias), JValue::Object(&JObject::null())])
            .and_then(|v| v.l())
            .map_err(err)?;
        if k.is_null() {
            return Err("keystore key missing".into());
        }
        Ok(k)
    }

    fn cipher<'a>(env: &mut JNIEnv<'a>) -> Result<JObject<'a>, String> {
        let t = env.new_string("AES/GCM/NoPadding").map_err(err)?;
        env.call_static_method("javax/crypto/Cipher", "getInstance", "(Ljava/lang/String;)Ljavax/crypto/Cipher;", &[JValue::Object(&t)])
            .and_then(|v| v.l())
            .map_err(err)
    }

    fn bytes(env: &mut JNIEnv, o: JObject) -> Result<Vec<u8>, String> {
        env.convert_byte_array(JByteArray::from(o)).map_err(err)
    }

    pub fn seal_in(env: &mut JNIEnv, plain: &[u8]) -> Result<Vec<u8>, String> {
        let k = key(env)?;
        let c = cipher(env)?;
        env.call_method(&c, "init", "(ILjava/security/Key;)V", &[JValue::Int(ENCRYPT), JValue::Object(&k)]).map_err(err)?;
        let input = env.byte_array_from_slice(plain).map_err(err)?;
        let ct = env.call_method(&c, "doFinal", "([B)[B", &[JValue::Object(&input)]).and_then(|v| v.l()).map_err(err)?;
        let iv = env.call_method(&c, "getIV", "()[B", &[]).and_then(|v| v.l()).map_err(err)?;
        let (iv, ct) = (bytes(env, iv)?, bytes(env, ct)?);
        aks_pack(&iv, &ct)
    }

    pub fn open_in(env: &mut JNIEnv, sealed: &[u8]) -> Result<Vec<u8>, String> {
        let (iv, ct) = aks_unpack(sealed).ok_or("not a keystore blob")?;
        let k = key(env)?;
        let c = cipher(env)?;
        let iv = env.byte_array_from_slice(iv).map_err(err)?;
        let spec = env.new_object("javax/crypto/spec/GCMParameterSpec", "(I[B)V", &[JValue::Int(128), JValue::Object(&iv)]).map_err(err)?;
        env.call_method(&c, "init", "(ILjava/security/Key;Ljava/security/spec/AlgorithmParameterSpec;)V", &[JValue::Int(DECRYPT), JValue::Object(&k), JValue::Object(&spec)])
            .map_err(err)?;
        let input = env.byte_array_from_slice(ct).map_err(err)?;
        let pt = env.call_method(&c, "doFinal", "([B)[B", &[JValue::Object(&input)]).and_then(|v| v.l()).map_err(err)?;
        bytes(env, pt)
    }

    impl Sealer for Keystore {
        fn seal(&self, plain: &[u8]) -> Result<Vec<u8>, String> {
            let p = plain.to_vec();
            run(&self.0, move |env| seal_in(env, &p))
        }
        fn open(&self, b: &[u8]) -> Option<Vec<u8>> {
            let s = b.to_vec();
            run(&self.0, move |env| open_in(env, &s)).ok()
        }
        fn is_sealed(&self, b: &[u8]) -> bool {
            b.starts_with(super::AKS_MAGIC)
        }
    }
}

#[cfg(windows)]
fn sealer(_app: &tauri::AppHandle) -> Box<dyn Sealer> {
    Box::new(Dpapi)
}
#[cfg(target_os = "android")]
fn sealer(app: &tauri::AppHandle) -> Box<dyn Sealer> {
    Box::new(keystore::Keystore(app.clone()))
}
#[cfg(not(any(windows, target_os = "android")))]
fn sealer(_app: &tauri::AppHandle) -> Box<dyn Sealer> {
    Box::new(Plain)
}

/// `calendar-session.bin` (sealed). Card 170's plaintext `calendar-session.secret` is read once,
/// sealed into the new file, then removed. `calendar-session.used` marks that this install has
/// held a Rust-managed session, which closes the one-time `cal_session_adopt` door (Card 177 L8).
const BIN: &str = "calendar-session.bin";
const LEGACY: &str = "calendar-session.secret";
const MARK: &str = "calendar-session.used";

#[cfg(test)]
fn store_read(dir: &std::path::Path, s: &dyn Sealer) -> Option<String> {
    store_read_noting(dir, s, &mut None)
}

/// store_read, but a failed re-seal of an unsealed/legacy handle is reported in `warn` (Card 197)
/// instead of being swallowed. The handle is still returned; the next read retries the seal.
fn store_read_noting(dir: &std::path::Path, s: &dyn Sealer, warn: &mut Option<String>) -> Option<String> {
    if let Ok(b) = std::fs::read(dir.join(BIN)) {
        if s.is_sealed(&b) {
            return s.open(&b).and_then(|v| String::from_utf8(v).ok()).map(|v| v.trim().to_string()).filter(|v| valid_secret(v));
        }
        // Card 195: a .bin from before this sealer (Android wrote plain bytes) → seal it in place.
        let v = String::from_utf8(b).ok()?.trim().to_string();
        if !valid_secret(&v) {
            return None;
        }
        if let Err(e) = store_write(dir, &v, s) {
            *warn = Some(e);
        }
        return Some(v);
    }
    let old = dir.join(LEGACY);
    let v = std::fs::read_to_string(&old).ok()?.trim().to_string();
    if !valid_secret(&v) {
        return None;
    }
    match store_write(dir, &v, s) {
        Ok(()) => {
            let _ = std::fs::remove_file(&old);
        }
        Err(e) => *warn = Some(e),
    }
    Some(v)
}

fn store_write(dir: &std::path::Path, v: &str, s: &dyn Sealer) -> Result<(), String> {
    if !valid_secret(v) {
        return Err("invalid value".into());
    }
    let p = dir.join(BIN);
    let tmp = p.with_extension("tmp");
    std::fs::write(&tmp, s.seal(v.as_bytes())?).map_err(|e| e.to_string())?;
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
fn store_adopt(dir: &std::path::Path, v: &str, s: &dyn Sealer) -> Result<(), String> {
    if dir.join(MARK).exists() || dir.join(BIN).exists() || dir.join(LEGACY).exists() {
        return Err("refused".into());
    }
    store_write(dir, v, s)
}

fn cal_read(app: &tauri::AppHandle) -> (Option<String>, Option<String>) {
    let mut warn = None;
    let v = cal_dir(app).ok().and_then(|d| store_read_noting(&d, sealer(app).as_ref(), &mut warn));
    (v, warn)
}

/// Card 197: store I/O can wait on the Android Keystore (activity thread, ≤5 s), so it runs on the
/// blocking pool, never on an async worker.
async fn off_worker<T: Send + 'static>(f: impl FnOnce() -> T + Send + 'static) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(f).await.map_err(|e| e.to_string())
}

fn cal_write(app: &tauri::AppHandle, v: &str) -> Result<(), String> {
    store_write(&cal_dir(app)?, v, sealer(app).as_ref())
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
    off_worker(move || keep_pair(&app, status, body)).await?
}

#[tauri::command]
async fn cal_session_refresh(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let a = app.clone();
    let (refresh, warn) = off_worker(move || cal_read(&a)).await?;
    let Some(refresh) = refresh else {
        return Ok(reply(401, serde_json::json!({ "error": "disconnected" })));
    };
    let (status, body) = cal_post("/session/refresh", serde_json::json!({ "refresh": refresh })).await?;
    if status == 401 {
        cal_clear_files(&app)?;
    }
    let mut out = off_worker(move || keep_pair(&app, status, body)).await??;
    if let (Some(w), Some(o)) = (warn, out.as_object_mut()) {
        o.insert("sealWarning".into(), serde_json::Value::String(w));
    }
    Ok(out)
}

/// One-time move of a Card 165-era handle that JS still had in localStorage. Write-only, and
/// never replaces a handle that is already stored.
/// Async (Card 195): sealing on Android hops to the activity thread, so this must not run on it.
#[tauri::command]
async fn cal_session_adopt(app: tauri::AppHandle, value: String) -> Result<(), String> {
    off_worker(move || store_adopt(&cal_dir(&app)?, &value, sealer(&app).as_ref())).await?
}

#[tauri::command]
fn cal_session_clear(app: tauri::AppHandle) -> Result<(), String> {
    cal_clear_files(&app)
}

#[cfg(test)]
mod secret_tests {
    use super::{aks_pack, aks_unpack, cal_api_base, reply, store_adopt, store_clear, store_read, store_read_noting, store_write, valid_secret, without_refresh, Plain, Sealer, AKS_MAGIC, BIN, LEGACY, MARK};

    /// Platform sealer under test: DPAPI on Windows, plain elsewhere (Android's Keystore needs a device).
    fn host() -> Box<dyn Sealer> {
        #[cfg(windows)]
        return Box::new(super::Dpapi);
        #[cfg(not(windows))]
        return Box::new(Plain);
    }

    /// Stand-in for the Android Keystore sealer: same at-rest format and is_sealed rule,
    /// with a toy cipher (XOR) instead of AES-GCM so it runs on the box.
    struct FakeKeystore;
    impl Sealer for FakeKeystore {
        fn seal(&self, plain: &[u8]) -> Result<Vec<u8>, String> {
            let iv = [7u8; 12];
            let mut ct: Vec<u8> = plain.iter().map(|b| b ^ 0x5a).collect();
            ct.extend_from_slice(&[0u8; 16]);
            aks_pack(&iv, &ct)
        }
        fn open(&self, b: &[u8]) -> Option<Vec<u8>> {
            let (_iv, ct) = aks_unpack(b)?;
            Some(ct[..ct.len() - 16].iter().map(|b| b ^ 0x5a).collect())
        }
        fn is_sealed(&self, b: &[u8]) -> bool {
            b.starts_with(AKS_MAGIC)
        }
    }

    fn tmp_dir(tag: &str) -> std::path::PathBuf {
        let d = std::env::temp_dir().join(format!("atrium-c177-{}-{}", tag, std::process::id()));
        let _ = std::fs::remove_dir_all(&d);
        std::fs::create_dir_all(&d).unwrap();
        d
    }

    #[test]
    fn bin_path_sealed_round_trip_and_clear() {
        let d = tmp_dir("bin");
        store_write(&d, "mockrefresh1xxxxxxxx", host().as_ref()).unwrap();
        let raw = std::fs::read(d.join(BIN)).unwrap();
        #[cfg(windows)]
        assert!(!raw.windows(20).any(|w| w == b"mockrefresh1xxxxxxxx"), "DPAPI: .bin is not plaintext");
        let _ = raw;
        assert_eq!(store_read(&d, host().as_ref()).as_deref(), Some("mockrefresh1xxxxxxxx"));
        store_clear(&d).unwrap();
        assert!(!d.join(BIN).exists());
        assert_eq!(store_read(&d, host().as_ref()), None);
        let _ = std::fs::remove_dir_all(&d);
    }

    #[test]
    fn legacy_plaintext_file_is_sealed_then_removed() {
        let d = tmp_dir("legacy");
        std::fs::write(d.join(LEGACY), "oldhandle_123").unwrap();
        assert_eq!(store_read(&d, host().as_ref()).as_deref(), Some("oldhandle_123"));
        assert!(!d.join(LEGACY).exists(), "plaintext file removed");
        assert!(d.join(BIN).exists(), "sealed .bin written");
        assert_eq!(store_read(&d, host().as_ref()).as_deref(), Some("oldhandle_123"));
        let _ = std::fs::remove_dir_all(&d);
    }

    #[test]
    fn adopt_is_one_time_only() {
        let d = tmp_dir("adopt");
        store_adopt(&d, "legacy_sid_1", host().as_ref()).unwrap();
        assert_eq!(store_read(&d, host().as_ref()).as_deref(), Some("legacy_sid_1"));
        assert!(store_adopt(&d, "planted_2", host().as_ref()).is_err(), "second adopt refused");
        store_clear(&d).unwrap();
        assert!(d.join(MARK).exists(), "marker survives sign-out");
        assert!(store_adopt(&d, "planted_3", host().as_ref()).is_err(), "refused after sign-out too");
        let d2 = tmp_dir("adopt2");
        store_write(&d2, "claimed_handle", host().as_ref()).unwrap();
        store_clear(&d2).unwrap();
        assert!(store_adopt(&d2, "planted_4", host().as_ref()).is_err(), "refused once a claim ever happened");
        let d3 = tmp_dir("adopt3");
        std::fs::write(d3.join(LEGACY), "x_1").unwrap();
        assert!(store_adopt(&d3, "planted_5", host().as_ref()).is_err(), "refused when a legacy file exists");
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
        let h = host();
        let s = h.seal(b"abc_DEF-1").unwrap();
        assert_eq!(h.open(&s).as_deref(), Some(&b"abc_DEF-1"[..]));
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

    #[test]
    fn android_format_pack_unpack_and_rejects_junk() {
        let iv = [1u8; 12];
        let ct = [2u8; 40];
        let b = aks_pack(&iv, &ct).unwrap();
        assert!(b.starts_with(AKS_MAGIC));
        let (i, c) = aks_unpack(&b).unwrap();
        assert_eq!((i, c), (&iv[..], &ct[..]));
        assert!(aks_unpack(b"plainhandle_123").is_none(), "plain bytes are not a keystore blob");
        assert!(aks_unpack(&b[..AKS_MAGIC.len() + 1 + 12 + 15]).is_none(), "too short for a GCM tag");
        assert!(aks_pack(&[], &ct).is_err());
        assert!(aks_pack(&iv, &[0u8; 8]).is_err());
        // The magic can never be a valid handle (starts with NUL), so old plain files are unambiguous.
        assert!(!valid_secret(std::str::from_utf8(AKS_MAGIC).unwrap()));
    }

    #[test]
    fn failed_reseal_is_reported_not_swallowed() {
        struct NoSeal;
        impl Sealer for NoSeal {
            fn seal(&self, _p: &[u8]) -> Result<Vec<u8>, String> {
                Err("keystore timeout".into())
            }
            fn open(&self, _s: &[u8]) -> Option<Vec<u8>> {
                None
            }
            fn is_sealed(&self, b: &[u8]) -> bool {
                b.starts_with(AKS_MAGIC)
            }
        }
        let d = tmp_dir("aks-noseal");
        std::fs::write(d.join(BIN), b"android_plain_handle_1").unwrap();
        let mut warn = None;
        assert_eq!(store_read_noting(&d, &NoSeal, &mut warn).as_deref(), Some("android_plain_handle_1"), "still usable");
        assert_eq!(warn.as_deref(), Some("keystore timeout"), "the failure is surfaced");
        let mut ok = None;
        assert!(store_read_noting(&d, &FakeKeystore, &mut ok).is_some() && ok.is_none(), "a later read retries and seals");
        assert!(std::fs::read(d.join(BIN)).unwrap().starts_with(AKS_MAGIC));
    }

    #[test]
    fn android_unsealed_bin_is_migrated_to_sealed() {
        let d = tmp_dir("aks-migrate");
        // Pre-Card-195 Android: the .bin held the handle as plain bytes.
        std::fs::write(d.join(BIN), b"android_plain_handle_1").unwrap();
        let k = FakeKeystore;
        assert_eq!(store_read(&d, &k).as_deref(), Some("android_plain_handle_1"));
        let raw = std::fs::read(d.join(BIN)).unwrap();
        assert!(raw.starts_with(AKS_MAGIC), "re-sealed in place");
        assert!(!raw.windows(22).any(|w| w == b"android_plain_handle_1"), "no plaintext at rest");
        assert_eq!(store_read(&d, &k).as_deref(), Some("android_plain_handle_1"), "reads back sealed");
        // Fresh writes are sealed too; legacy .secret also migrates through the sealer.
        store_write(&d, "rotated_handle_2", &k).unwrap();
        assert!(std::fs::read(d.join(BIN)).unwrap().starts_with(AKS_MAGIC));
        let d2 = tmp_dir("aks-legacy");
        std::fs::write(d2.join(LEGACY), "legacy_secret_3").unwrap();
        assert_eq!(store_read(&d2, &k).as_deref(), Some("legacy_secret_3"));
        assert!(!d2.join(LEGACY).exists());
        assert!(std::fs::read(d2.join(BIN)).unwrap().starts_with(AKS_MAGIC));
        for x in [d, d2] {
            let _ = std::fs::remove_dir_all(&x);
        }
    }

    #[test]
    fn android_corrupt_or_foreign_blob_reads_as_signed_out() {
        let d = tmp_dir("aks-corrupt");
        let mut b = aks_pack(&[3u8; 12], &[4u8; 20]).unwrap();
        b.truncate(b.len() - 10);
        std::fs::write(d.join(BIN), &b).unwrap();
        assert_eq!(store_read(&d, &FakeKeystore), None);
        std::fs::write(d.join(BIN), b"not valid handle!").unwrap();
        assert_eq!(store_read(&d, &FakeKeystore), None, "junk plain bytes are not adopted");
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
