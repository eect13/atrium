//! Card 208 (Card 207 K1): the main window's `atrium.v1` blob also goes to a file in app data,
//! written atomically (temp file + fsync + rename + dir fsync). WebView2 commits localStorage
//! lazily, so a hard kill of the process tree lost every change since the last clean close.
//! A reader sees either the previous whole file or the new whole file, never a torn one.
use std::fs::{self, File, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

pub const FILE: &str = "atrium.v1.json";
static WRITE_LOCK: Mutex<()> = Mutex::new(());

pub fn path_in(dir: &Path) -> PathBuf {
    dir.join(FILE)
}

/// Atomically replace `dir/atrium.v1.json` with `text`.
pub fn write_atomic(dir: &Path, text: &str) -> Result<(), String> {
    let _g = WRITE_LOCK.lock().map_err(|_| "state lock poisoned".to_string())?;
    fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let tmp = dir.join(format!("{FILE}.tmp"));
    {
        let mut f = OpenOptions::new().write(true).create(true).truncate(true).open(&tmp).map_err(|e| e.to_string())?;
        f.write_all(text.as_bytes()).map_err(|e| e.to_string())?;
        f.sync_all().map_err(|e| e.to_string())?;
    }
    fs::rename(&tmp, path_in(dir)).map_err(|e| e.to_string())?;
    // Persist the rename itself (directory entry). Not possible/needed on Windows.
    #[cfg(unix)]
    if let Ok(d) = File::open(dir) {
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
