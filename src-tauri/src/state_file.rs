//! Card 208 (Card 207 K1): the main window's `atrium.v1` blob also goes to a file in app data,
//! written atomically (temp file + fsync + rename + dir fsync). WebView2 commits localStorage
//! lazily, so a hard kill of the process tree lost every change since the last clean close.
//! A reader sees either the previous whole file or the new whole file, never a torn one.
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

pub const FILE: &str = "atrium.v1.json";
static WRITE_LOCK: Mutex<()> = Mutex::new(());
/// Card 211: the newest text handed to Rust and not yet on disk (drained by `write_pending`,
/// and synchronously by the Windows WM_ENDSESSION hook).
static PENDING: Mutex<Option<(std::path::PathBuf, String)>> = Mutex::new(None);

/// Card 211 (Card 210): AV / the indexer can hold the target without delete-sharing, so the rename
/// fails with a sharing violation (32) or access denied (5). Retry with a short backoff.
pub const RENAME_BACKOFF_MS: [u64; 6] = [10, 20, 40, 80, 160, 320];

pub fn is_busy(e: &std::io::Error) -> bool {
    e.kind() == std::io::ErrorKind::PermissionDenied || matches!(e.raw_os_error(), Some(5) | Some(32) | Some(33))
}

/// Runs `op` until it succeeds, a non-busy error occurs, or the backoff list is used up.
pub fn retry_busy(mut op: impl FnMut() -> std::io::Result<()>, mut sleep: impl FnMut(u64)) -> Result<(), String> {
    let mut last = None;
    for (i, ms) in std::iter::once(0).chain(RENAME_BACKOFF_MS).enumerate() {
        if i > 0 {
            sleep(ms);
        }
        match op() {
            Ok(()) => return Ok(()),
            Err(e) if is_busy(&e) => last = Some(e),
            Err(e) => return Err(e.to_string()),
        }
    }
    Err(format!("busy: {}", last.map(|e| e.to_string()).unwrap_or_default()))
}

/// Remember the newest text (cheap, on the IPC thread) for `write_pending`.
pub fn stash(dir: &Path, text: String) {
    if let Ok(mut p) = PENDING.lock() {
        *p = Some((dir.to_path_buf(), text));
    }
}

/// Write whatever is pending (latest wins). Waits for an in-flight write first.
pub fn write_pending() -> Result<(), String> {
    let _g = WRITE_LOCK.lock().map_err(|_| "state lock poisoned".to_string())?;
    let next = PENDING.lock().ok().and_then(|mut p| p.take());
    match next {
        Some((dir, text)) => write_locked(&dir, &text),
        None => Ok(()),
    }
}

pub fn path_in(dir: &Path) -> PathBuf {
    dir.join(FILE)
}

/// Atomically replace `dir/atrium.v1.json` with `text`.
pub fn write_atomic(dir: &Path, text: &str) -> Result<(), String> {
    let _g = WRITE_LOCK.lock().map_err(|_| "state lock poisoned".to_string())?;
    write_locked(dir, text)
}

fn write_locked(dir: &Path, text: &str) -> Result<(), String> {
    fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let tmp = dir.join(format!("{FILE}.tmp"));
    {
        let mut f = OpenOptions::new().write(true).create(true).truncate(true).open(&tmp).map_err(|e| e.to_string())?;
        f.write_all(text.as_bytes()).map_err(|e| e.to_string())?;
        f.sync_all().map_err(|e| e.to_string())?;
    }
    let dest = path_in(dir);
    retry_busy(|| fs::rename(&tmp, &dest), |ms| std::thread::sleep(std::time::Duration::from_millis(ms)))?;
    // Persist the rename itself (directory entry). Not possible/needed on Windows.
    #[cfg(unix)]
    if let Ok(d) = fs::File::open(dir) {
        let _ = d.sync_all();
    }
    Ok(())
}

pub fn read(dir: &Path) -> Option<String> {
    fs::read_to_string(path_in(dir)).ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn busy_rename_retries_with_backoff_then_reports() {
        let busy = || Err(std::io::Error::from_raw_os_error(32));
        let mut n = 0;
        let mut slept = vec![];
        let r = retry_busy(|| { n += 1; if n < 3 { busy() } else { Ok(()) } }, |ms| slept.push(ms));
        assert!(r.is_ok());
        assert_eq!((n, slept.clone()), (3, vec![10, 20]));
        slept.clear();
        let r = retry_busy(busy, |ms| slept.push(ms));
        assert!(r.unwrap_err().starts_with("busy:"));
        assert_eq!(slept, RENAME_BACKOFF_MS.to_vec());
        let mut m = 0;
        let r = retry_busy(|| { m += 1; Err(std::io::Error::from(std::io::ErrorKind::NotFound)) }, |_| {});
        assert!(r.is_err() && m == 1, "other errors are not retried");
    }

    #[test]
    fn pending_is_written_latest_wins() {
        let d = std::env::temp_dir().join(format!("atrium-pending-{}", std::process::id()));
        let _ = fs::remove_dir_all(&d);
        stash(&d, "{\"rev\":1}".into());
        stash(&d, "{\"rev\":2}".into());
        write_pending().unwrap();
        assert_eq!(read(&d).as_deref(), Some("{\"rev\":2}"));
        write_pending().unwrap(); // nothing pending: no-op
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn atomic_write_replaces_whole_file_and_leaves_no_temp() {
        let d = std::env::temp_dir().join(format!("atrium-state-{}", std::process::id()));
        let _ = fs::remove_dir_all(&d);
        assert_eq!(read(&d), None);
        write_atomic(&d, "{\"rev\":1}").unwrap();
        write_atomic(&d, "{\"rev\":2}").unwrap();
        assert_eq!(read(&d).as_deref(), Some("{\"rev\":2}"));
        assert!(!d.join(format!("{FILE}.tmp")).exists());
        let _ = fs::remove_dir_all(&d);
    }
}
