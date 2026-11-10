//! Логика без окна: сравнение версий и защита от путей вида `../` в архивах.
use nimvoro_lib::{is_newer, safe_relative};
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
    assert_eq!(safe_relative("a\\b.exe"), Some(PathBuf::from("a").join("b.exe")));
    assert_eq!(safe_relative("./x.dll"), Some(PathBuf::from("x.dll")));
    assert_eq!(safe_relative("../evil.exe"), None);
    assert_eq!(safe_relative("a/../../evil.exe"), None);
    assert_eq!(safe_relative("C:/Windows/evil.exe"), None);
    assert_eq!(safe_relative("/abs.exe"), None);
}

/// Ручная проверка: `cargo test -- --ignored --nocapture finds_running` при запущенном Random Wheel.
#[test]
#[ignore]
fn finds_running() {
    let dir = dirs::data_local_dir().unwrap().join("NIMVORO").join("Apps").join("Random Wheel");
    println!("running in {}: {:?}", dir.display(), nimvoro_lib::running_in(&dir));
}

