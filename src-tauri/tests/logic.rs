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

// ───────────────────────── Linux support ─────────────────────────

use nimvoro_lib::platform::{self, UpdateMode};
use serde_json::json;
use std::path::Path;

#[test]
fn platforms_filter() {
    let none = json!({ "name": "Old" });
    assert!(platform::supports(&none, "windows"), "no platforms field means Windows");
    assert!(!platform::supports(&none, "linux"));
    let both = json!({ "platforms": ["windows", "linux"] });
    assert!(platform::supports(&both, "windows") && platform::supports(&both, "linux"));
    let win = json!({ "platforms": ["windows"] });
    assert!(!platform::supports(&win, "linux"));
    let lin = json!({ "platforms": ["linux"] });
    assert!(!platform::supports(&lin, "windows") && platform::supports(&lin, "linux"));
    assert!(platform::supports(&serde_json::Value::Null, "linux"), "a tool without a manifest keeps its error card");
}

#[test]
fn manifest_fields_per_platform() {
    let m = json!({ "exe": "RandomWheel.exe", "asset": "RandomWheel-win-x64.zip", "linux": { "exe": "random-wheel", "asset": "RandomWheel-linux-x64.tar.gz" } });
    assert_eq!(platform::manifest_str(&m, "exe", "windows").as_deref(), Some("RandomWheel.exe"));
    assert_eq!(platform::manifest_str(&m, "exe", "linux").as_deref(), Some("random-wheel"));
    assert_eq!(platform::manifest_str(&m, "asset", "linux").as_deref(), Some("RandomWheel-linux-x64.tar.gz"));
    assert_eq!(platform::manifest_str(&json!({ "exe": "a.exe" }), "exe", "linux"), None);
}

#[test]
fn self_update_decision() {
    let app = Path::new("/home/u/Apps/NIMVORO-linux-x64.AppImage");
    assert_eq!(platform::update_mode("windows", None, false), UpdateMode::Installer);
    assert_eq!(platform::update_mode("windows", Some(app), true), UpdateMode::Installer);
    assert_eq!(platform::update_mode("linux", Some(app), true), UpdateMode::AppImage);
    // deb install: no $APPIMAGE
    assert_eq!(platform::update_mode("linux", None, false), UpdateMode::ReleasePage);
    // AppImage in a folder the user cannot write to
    assert_eq!(platform::update_mode("linux", Some(app), false), UpdateMode::ReleasePage);
    // The release page needs no asset; the other modes do.
    assert!(platform::update_possible(UpdateMode::ReleasePage, false));
    assert!(!platform::update_possible(UpdateMode::AppImage, false));
    assert!(platform::update_possible(UpdateMode::Installer, true));
}

#[test]
fn desktop_entry_quotes_exec() {
    assert_eq!(platform::exec_quote("/home/u/My Apps/tool"), "\"/home/u/My Apps/tool\"");
    assert_eq!(platform::exec_quote("/a/$b`c\"d%e"), r#""/a/\\$b\\`c\\"d%%e""#);
    let e = platform::desktop_entry("Random\nWheel", Path::new("/opt/My Apps/rw"), Path::new("/opt/My Apps"), Some(Path::new("/opt/My Apps/icon.png")));
    assert!(e.starts_with("[Desktop Entry]\nType=Application\n"));
    assert!(e.contains("\nName=Random Wheel\n"));
    assert!(e.contains("\nExec=\"/opt/My Apps/rw\"\n"));
    assert!(e.contains("\nIcon=/opt/My Apps/icon.png\n"));
    assert!(e.contains("\nPath=/opt/My Apps\n"));
    assert!(e.contains("\nTerminal=false\n"));
    assert!(!platform::desktop_entry("X", Path::new("/x"), Path::new("/"), None).contains("Icon="));
}

#[test]
fn child_env_drops_appimage_leftovers() {
    let v = |k: &str, val: &str| (k.to_string(), val.to_string());
    let env = vec![
        v("APPDIR", "/tmp/.mount_nimvoXYZ"),
        v("HOME", "/home/u"),
        v("LD_LIBRARY_PATH", "/tmp/.mount_nimvoXYZ/usr/lib:/usr/local/lib"),
        v("XDG_DATA_DIRS", "/tmp/.mount_nimvoXYZ/usr/share"),
        v("PATH", "/tmp/.mount_nimvoXYZ/usr/bin:/usr/bin:/bin"),
        v("GTK_IM_MODULE_FILE", "/tmp/.mount_nimvoXYZ//usr/lib/gtk-3.0/immodules.cache"),
        v("GTK_THEME", "Adwaita:light"),
    ];
    let (set, remove) = platform::child_env(&env);
    assert!(remove.contains(&"APPIMAGE".to_string()) && remove.contains(&"APPDIR".to_string()) && remove.contains(&"GTK_THEME".to_string()));
    assert!(set.contains(&v("LD_LIBRARY_PATH", "/usr/local/lib")));
    assert!(set.contains(&v("PATH", "/usr/bin:/bin")));
    assert!(remove.contains(&"XDG_DATA_DIRS".to_string()), "an emptied variable is removed");
    assert!(remove.contains(&"GTK_IM_MODULE_FILE".to_string()), "any variable pointing into the AppImage goes");
    assert!(!set.iter().any(|(k, _)| k == "HOME"));
    // Outside an AppImage nothing changes.
    let (set, remove) = platform::child_env(&[v("PATH", "/usr/bin")]);
    assert!(set.is_empty() && remove.is_empty());
}

fn make_tar_gz(path: &Path) {
    let gz = flate2::write::GzEncoder::new(std::fs::File::create(path).unwrap(), flate2::Compression::fast());
    let mut tar = tar::Builder::new(gz);
    let mut add = |name: &str, data: &[u8], mode: u32| {
        let mut h = tar::Header::new_gnu();
        h.set_size(data.len() as u64);
        h.set_mode(mode);
        h.set_cksum();
        tar.append_data(&mut h, name, data).unwrap();
    };
    add("random-wheel", b"#!/bin/sh\necho hi\n", 0o755);
    add("icon.png", b"png", 0o644);
    add("sub/data.txt", b"x", 0o644);
    // Path traversal must be ignored. `append_data` refuses `..`, so the header is written by hand.
    let mut h = tar::Header::new_gnu();
    h.set_size(1);
    h.set_mode(0o644);
    let raw = h.as_old_mut();
    raw.name[..9].copy_from_slice(b"../evil.x");
    h.set_cksum();
    tar.append(&h, &b"x"[..]).unwrap();
    tar.into_inner().unwrap().finish().unwrap();
}

#[test]
fn extracts_tar_gz_keeping_exec_bit() {
    let dir = scratch("targz");
    let archive = dir.join("tool.tar.gz");
    make_tar_gz(&archive);
    let dest = dir.join("out");
    let (files, size) = nimvoro_lib::extract(&archive, &dest).expect("extract");
    assert!(files.contains(&"random-wheel".to_string()) && files.contains(&"icon.png".to_string()));
    assert_eq!(files.len(), 3, "the traversal entry is skipped: {files:?}");
    assert!(size > 0);
    assert!(dest.join("sub").join("data.txt").exists());
    assert!(!dir.join("evil.x").exists());
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mode = std::fs::metadata(dest.join("random-wheel")).unwrap().permissions().mode();
        assert_eq!(mode & 0o111, 0o111, "executable bit lost: {mode:o}");
        assert_eq!(std::fs::metadata(dest.join("icon.png")).unwrap().permissions().mode() & 0o111, 0);
    }
    let _ = std::fs::remove_dir_all(dir);
}

#[test]
fn replaces_executable_in_place() {
    let dir = scratch("replace");
    let target = dir.join("NIMVORO.AppImage");
    let new = dir.join(".NIMVORO.AppImage.new");
    std::fs::write(&target, b"old").unwrap();
    std::fs::write(&new, b"new").unwrap();
    platform::replace_executable(&new, &target).unwrap();
    assert_eq!(std::fs::read(&target).unwrap(), b"new");
    assert!(!new.exists());
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        assert_eq!(std::fs::metadata(&target).unwrap().permissions().mode() & 0o777, 0o755);
    }
    let _ = std::fs::remove_dir_all(dir);
}

/// On Linux a `.desktop` entry is written, executable, with the icon found next to the binary.
#[cfg(unix)]
#[test]
fn creates_desktop_shortcut() {
    use std::os::unix::fs::PermissionsExt;
    let dir = scratch("desktop");
    let target = dir.join("tool");
    std::fs::write(&target, b"#!/bin/sh\n").unwrap();
    std::fs::write(dir.join("icon.png"), b"png").unwrap();
    let file = dir.join("apps").join("nimvoro-tool.desktop");
    create_shortcut(&file, &target, "Tool").expect("desktop entry");
    let text = std::fs::read_to_string(&file).unwrap();
    assert!(text.contains("Name=Tool") && text.contains(&format!("Icon={}", dir.join("icon.png").display())));
    assert_eq!(std::fs::metadata(&file).unwrap().permissions().mode() & 0o111, 0o111);
    let _ = std::fs::remove_dir_all(dir);
}
