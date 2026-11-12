//! Logic without a window: version comparison, zip-slip protection, shortcuts and the language marker.
use nimvoro_lib::{create_shortcut, is_newer, safe_relative, write_marker, Tool};
use std::path::PathBuf;

#[test]
fn versions() {
    assert!(is_newer("1.0.1", "1.0.0"));
    assert!(is_newer("v1.10.0", "1.9.0"));
    assert!(is_newer("2", "1.99.9"));
    assert!(!is_newer("1.0.0", "1.0.0"));
    assert!(!is_newer("0.9.9", "1.0.0"));
    assert!(!is_newer("v1.0.0-beta", "1.0.0"));
}

#[test]
fn rejects_zip_slip() {
    assert_eq!(safe_relative("a/b.exe"), Some(PathBuf::from("a").join("b.exe")));
    assert_eq!(safe_relative(r"a\b.exe"), Some(PathBuf::from("a").join("b.exe")));
    assert_eq!(safe_relative("./x.dll"), Some(PathBuf::from("x.dll")));
    assert_eq!(safe_relative("../evil.exe"), None);
    assert_eq!(safe_relative("a/../../evil.exe"), None);
    assert_eq!(safe_relative("C:/Windows/evil.exe"), None);
    assert_eq!(safe_relative("/abs.exe"), None);
}

fn scratch(name: &str) -> PathBuf {
    let d = std::env::temp_dir().join(format!("nimvoro-test-{name}-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&d);
    std::fs::create_dir_all(&d).unwrap();
    d
}

/// A .lnk is created next to a real target (with a non-ASCII folder name) and can be removed again.
#[cfg(windows)]
#[test]
fn creates_shortcut() {
    let dir = scratch("lnk").join("Папка");
    std::fs::create_dir_all(&dir).unwrap();
    let target = dir.join("tool.exe");
    std::fs::write(&target, b"MZ").unwrap();
    let lnk = dir.join("Tool.lnk");
    create_shortcut(&lnk, &target, "Tool").expect("shortcut");
    let bytes = std::fs::read(&lnk).unwrap();
    assert!(bytes.len() > 76 && bytes[0] == 0x4c, "not a shell link header");
    std::fs::remove_file(&lnk).unwrap();
    assert!(!lnk.exists());
    let _ = std::fs::remove_dir_all(dir.parent().unwrap());
}

fn tool() -> Tool {
    Tool { id: "demo".into(), repo: "o/demo".into(), manifest: serde_json::Value::Null, release: None, error: None }
}

/// First install writes the launcher language; an update keeps what is already there.
#[test]
fn marker_keeps_language_on_update() {
    let dir = scratch("marker");
    write_marker(&dir, &tool(), "1.0.0", "uk");
    write_marker(&dir, &tool(), "1.1.0", "ru");
    let v: serde_json::Value = serde_json::from_str(&std::fs::read_to_string(dir.join(".nimvoro.json")).unwrap()).unwrap();
    assert_eq!(v["language"], "uk");
    assert_eq!(v["version"], "1.1.0");
    assert_eq!(v["id"], "demo");
    let _ = std::fs::remove_dir_all(dir);
}

/// Manual check: `cargo test -- --ignored --nocapture finds_running` while Random Wheel is running.
#[test]
#[ignore]
fn finds_running() {
    let dir = dirs::data_local_dir().unwrap().join("NIMVORO").join("Apps").join("Random Wheel");
    println!("running in {}: {:?}", dir.display(), nimvoro_lib::running_in(&dir));
}
