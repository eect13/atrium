//! Card 208 hard-kill test (box stand-in for `taskkill /T /F`): a child process writes through the
//! same `state_file::write_atomic` the `state_save` command uses, makes "the change", then keeps
//! rewriting large blobs as fast as it can. The parent SIGKILLs it ~10 s after the change and checks
//! the file: it parses, is one whole blob (never torn), and holds the change.
use atrium_lib::state_file;
use std::process::Command;
use std::time::{Duration, Instant};

const CHILD: &str = "ATRIUM_KILL_CHILD_DIR";

fn blob(rev: u64, change: bool) -> String {
    let pad = "x".repeat(256 * 1024); // big enough that a kill lands mid-write often
    format!("{{\"savedAt\":{rev},\"rev\":{rev},\"theme\":\"{}\",\"pad\":\"{pad}\",\"end\":{rev}}}", if change { "light" } else { "dark" })
}

#[test]
fn child_writer() {
    let Ok(dir) = std::env::var(CHILD) else { return };
    let dir = std::path::PathBuf::from(dir);
    state_file::write_atomic(&dir, &blob(0, false)).unwrap();
    let mut rev = 1;
    state_file::write_atomic(&dir, &blob(rev, true)).unwrap(); // the change
    std::fs::write(dir.join("changed"), b"1").unwrap();
    loop {
        rev += 1;
        state_file::write_atomic(&dir, &blob(rev, true)).unwrap();
    }
}

#[test]
fn sigkill_10s_after_change_keeps_it_and_never_tears() {
    if std::env::var(CHILD).is_ok() {
        return;
    }
    let dir = std::env::temp_dir().join(format!("atrium-kill-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    let mut child = Command::new(std::env::current_exe().unwrap())
        .args(["--exact", "child_writer", "--nocapture", "--test-threads=1"])
        .env(CHILD, &dir)
        .spawn()
        .unwrap();
    let t0 = Instant::now();
    while !dir.join("changed").exists() {
        assert!(t0.elapsed() < Duration::from_secs(20), "child never made the change");
        std::thread::sleep(Duration::from_millis(5));
    }
    let changed_at = Instant::now();
    std::thread::sleep(Duration::from_secs(10));
    child.kill().unwrap(); // SIGKILL on unix
    let status = child.wait().unwrap();
    assert!(!status.success(), "child was killed, not exited");
    let held = changed_at.elapsed();
    let text = state_file::read(&dir).expect("file present after kill");
    let v: serde_json::Value = serde_json::from_str(&text).expect("file is whole JSON (not torn)");
    let rev = v["rev"].as_u64().unwrap();
    assert_eq!(v["end"].as_u64(), Some(rev), "head and tail of the same write");
    assert_eq!(v["theme"], "light", "the change survived the kill");
    assert!(rev >= 1);
    eprintln!("killed {:.1}s after the change; file rev {rev}, {} bytes, whole", held.as_secs_f32(), text.len());
    let _ = std::fs::remove_dir_all(&dir);
}
