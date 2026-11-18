//! Everything that differs between Windows and Linux and can be decided without touching the system:
//! manifest platform fields, the launcher self-update mode, `.desktop` entries and the clean environment for child processes.

use serde_json::Value;
use std::path::{Path, PathBuf};

/// `windows` or `linux`: the key used in `platforms` and in the manifest.
pub const OS: &str = if cfg!(windows) { "windows" } else { "linux" };

/// Asset of the launcher itself in a release.
pub const LAUNCHER_ASSET_WINDOWS: &str = "*-setup.exe";
pub const LAUNCHER_ASSET_LINUX: &str = "NIMVORO-linux-x64.AppImage";

pub fn launcher_asset() -> &'static str {
    if cfg!(windows) { LAUNCHER_ASSET_WINDOWS } else { LAUNCHER_ASSET_LINUX }
}

/// Manifest string for `os`: on Linux `linux.<key>` (exe, asset), on Windows the top-level field.
pub fn manifest_str(manifest: &Value, key: &str, os: &str) -> Option<String> {
    let v = if os == "linux" { &manifest["linux"][key] } else { &manifest[key] };
    v.as_str().map(str::to_string)
}

/// Does the tool support `os`? A missing `platforms` field means Windows only. A tool without a manifest is kept (error card).
pub fn supports(manifest: &Value, os: &str) -> bool {
    if manifest.is_null() {
        return true;
    }
    match manifest["platforms"].as_array() {
        Some(list) => list.iter().any(|p| p.as_str().is_some_and(|p| p.eq_ignore_ascii_case(os))),
        None => os == "windows",
    }
}

/// How the launcher updates itself.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum UpdateMode {
    /// Windows: download the installer and run it.
    Installer,
    /// Linux AppImage: replace the file in place and re-exec.
    AppImage,
    /// Linux without a writable AppImage (deb install and the like): only point to the release page.
    ReleasePage,
}

impl UpdateMode {
    pub fn as_str(self) -> &'static str {
        match self {
            UpdateMode::Installer => "installer",
            UpdateMode::AppImage => "appimage",
            UpdateMode::ReleasePage => "page",
        }
    }
}

/// `appimage`: value of `$APPIMAGE` when the file exists; `dir_writable`: can a file be created next to it.
pub fn update_mode(os: &str, appimage: Option<&Path>, dir_writable: bool) -> UpdateMode {
    if os == "windows" {
        return UpdateMode::Installer;
    }
    match appimage {
        Some(_) if dir_writable => UpdateMode::AppImage,
        _ => UpdateMode::ReleasePage,
    }
}

/// `$APPIMAGE` if it points at an existing file.
pub fn appimage_path() -> Option<PathBuf> {
    std::env::var_os("APPIMAGE").filter(|p| !p.is_empty()).map(PathBuf::from).filter(|p| p.is_file())
}

pub fn dir_writable(dir: &Path) -> bool {
    let probe = dir.join(format!(".nimvoro-write-test-{}", std::process::id()));
    let ok = std::fs::write(&probe, b"").is_ok();
    let _ = std::fs::remove_file(probe);
    ok
}

pub fn current_update_mode() -> UpdateMode {
    let app = appimage_path();
    let writable = app.as_deref().and_then(Path::parent).is_some_and(dir_writable);
    update_mode(OS, app.as_deref(), writable)
}

/// Does the release carry what this mode needs? A release page needs no asset.
pub fn update_possible(mode: UpdateMode, has_asset: bool) -> bool {
    mode == UpdateMode::ReleasePage || has_asset
}

/// Quotes a path for the `Exec=` key of a `.desktop` file (Desktop Entry spec: quoted argument, reserved characters escaped,
/// then the string-level escaping of backslashes).
pub fn exec_quote(path: &str) -> String {
    let mut out = String::from("\"");
    for c in path.chars() {
        match c {
            '"' | '`' | '$' => {
                out.push_str("\\\\");
                out.push(c);
            }
            '\\' => out.push_str("\\\\\\\\"),
            '%' => out.push_str("%%"),
            '\n' | '\r' => {}
            _ => out.push(c),
        }
    }
    out.push('"');
    out
}

/// Content of a `.desktop` file for a tool.
pub fn desktop_entry(name: &str, target: &Path, work_dir: &Path, icon: Option<&Path>) -> String {
    let one_line = |s: &str| s.replace(['\n', '\r'], " ");
    let mut s = String::from("[Desktop Entry]\nType=Application\nVersion=1.0\n");
    s.push_str(&format!("Name={}\n", one_line(name)));
    s.push_str(&format!("Exec={}\n", exec_quote(&target.display().to_string())));
    s.push_str(&format!("Path={}\n", one_line(&work_dir.display().to_string())));
    if let Some(i) = icon {
        s.push_str(&format!("Icon={}\n", one_line(&i.display().to_string())));
    }
    s.push_str("Terminal=false\nCategories=Utility;\nStartupNotify=true\n");
    s
}

/// Variables the launcher's AppImage runtime sets for itself (or that its GTK hook forces). A child tool must not inherit them.
const APPIMAGE_VARS: [&str; 13] = [
    "APPIMAGE", "APPDIR", "ARGV0", "OWD", "GTK_PATH", "GTK_EXE_PREFIX", "GTK_DATA_PREFIX", "GIO_EXTRA_MODULES",
    "GDK_PIXBUF_MODULE_FILE", "GSETTINGS_SCHEMA_DIR", "GST_PLUGIN_SYSTEM_PATH", "GST_PLUGIN_SYSTEM_PATH_1_0", "GTK_THEME",
];

/// Environment changes for a child process started from inside an AppImage: `(set, remove)`.
/// `vars` is the current environment. Besides the known variables, every variable that points into the AppImage's
/// mount folder (`$APPDIR`) is cleaned: list entries inside it are dropped, a variable left empty is removed.
pub fn child_env(vars: &[(String, String)]) -> (Vec<(String, String)>, Vec<String>) {
    let Some(appdir) = vars.iter().find(|(k, v)| k == "APPDIR" && !v.is_empty()).map(|(_, v)| v.trim_end_matches('/').to_string()) else {
        return (vec![], vec![]);
    };
    let mut set = vec![];
    let mut gone: Vec<String> = APPIMAGE_VARS.iter().map(|s| s.to_string()).collect();
    for (k, v) in vars {
        if APPIMAGE_VARS.contains(&k.as_str()) || !v.contains(&appdir) {
            continue;
        }
        let kept: Vec<&str> = v.split(':').filter(|p| !p.is_empty() && !p.contains(&appdir)).collect();
        if kept.is_empty() {
            gone.push(k.clone());
        } else {
            set.push((k.clone(), kept.join(":")));
        }
    }
    (set, gone)
}

#[cfg(unix)]
pub fn apply_clean_env(cmd: &mut std::process::Command) {
    let (set, remove) = child_env(&std::env::vars().collect::<Vec<_>>());
    for k in remove {
        cmd.env_remove(k);
    }
    for (k, v) in set {
        cmd.env(k, v);
    }
}

/// Starts `exe` detached from the launcher (own process group, no stdio).
#[cfg(unix)]
pub fn spawn_detached(exe: &Path, args: &[String], dir: &Path) -> std::io::Result<()> {
    use std::os::unix::process::CommandExt;
    use std::process::{Command, Stdio};
    let mut cmd = Command::new(exe);
    cmd.args(args).current_dir(dir).env("PWD", dir).stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null()).process_group(0);
    apply_clean_env(&mut cmd);
    let mut child = cmd.spawn()?;
    // Reap it when it exits, so a closed tool does not stay a zombie while the launcher runs.
    std::thread::spawn(move || {
        let _ = child.wait();
    });
    Ok(())
}

/// Replaces `target` with `new` atomically (same folder, so the rename cannot cross file systems) and makes it executable.
pub fn replace_executable(new: &Path, target: &Path) -> std::io::Result<()> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(new, std::fs::Permissions::from_mode(0o755))?;
    }
    std::fs::rename(new, target)
}
