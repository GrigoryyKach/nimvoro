//! Shortcuts.
//!
//! Windows: `.lnk` files created through the shell COM API (`IShellLinkW`): no child processes, no console windows.
//! - Start menu: `%APPDATA%\Microsoft\Windows\Start Menu\Programs\<Name>.lnk` (always);
//! - desktop: `<Desktop>\<Name>.lnk` (only if the user asked for it in the install dialog).
//!
//! Linux: `.desktop` entries (`nimvoro-<id>.desktop`).
//! - menu: `~/.local/share/applications/` (always);
//! - desktop: the `xdg-user-dir DESKTOP` folder (on request), made executable and marked trusted with `gio`.

use crate::store::{self, Installed};
use std::path::{Path, PathBuf};

/// Environment overrides used by tests and manual checks, so they never touch the real Start menu or desktop.
pub const START_MENU_ENV: &str = "NIMVORO_START_MENU_DIR";
pub const DESKTOP_ENV: &str = "NIMVORO_DESKTOP_DIR";

fn env_dir(name: &str) -> Option<PathBuf> {
    std::env::var_os(name).filter(|d| !d.is_empty()).map(PathBuf::from)
}

pub fn start_menu_dir() -> PathBuf {
    if let Some(d) = env_dir(START_MENU_ENV) {
        return d;
    }
    #[cfg(windows)]
    {
        dirs::data_dir().unwrap_or_else(std::env::temp_dir).join("Microsoft").join("Windows").join("Start Menu").join("Programs")
    }
    #[cfg(not(windows))]
    {
        dirs::data_dir().unwrap_or_else(std::env::temp_dir).join("applications")
    }
}

/// File name of a tool's shortcut: `<Name>.lnk` on Windows, `nimvoro-<id>.desktop` on Linux.
fn file_name(id: &str, name: &str) -> String {
    if cfg!(windows) {
        format!("{}.lnk", store::folder_name(name))
    } else {
        format!("nimvoro-{}.desktop", store::folder_name(id))
    }
}

/// Path of the menu shortcut for a tool.
pub fn start_menu_lnk(id: &str, name: &str) -> PathBuf {
    start_menu_dir().join(file_name(id, name))
}

#[cfg(not(windows))]
fn user_desktop_dir() -> Option<PathBuf> {
    let from_xdg = std::process::Command::new("xdg-user-dir")
        .arg("DESKTOP")
        .output()
        .ok()
        .filter(|o| o.status.success())
        .map(|o| PathBuf::from(String::from_utf8_lossy(&o.stdout).trim()))
        .filter(|p| !p.as_os_str().is_empty() && p.is_dir() && Some(p.as_path()) != dirs::home_dir().as_deref());
    from_xdg.or_else(dirs::desktop_dir)
}

#[cfg(windows)]
fn user_desktop_dir() -> Option<PathBuf> {
    dirs::desktop_dir()
}

pub fn desktop_lnk(id: &str, name: &str) -> Option<PathBuf> {
    env_dir(DESKTOP_ENV).or_else(user_desktop_dir).map(|d| d.join(file_name(id, name)))
}

/// Creates (or overwrites) a shortcut `lnk` pointing at `target`.
#[cfg(windows)]
pub fn create(lnk: &Path, target: &Path, description: &str) -> Result<(), String> {
    use windows::core::{Interface, HSTRING};
    use windows::Win32::System::Com::{CoCreateInstance, CoInitializeEx, CoUninitialize, IPersistFile, CLSCTX_INPROC_SERVER, COINIT_APARTMENTTHREADED};
    use windows::Win32::UI::Shell::{IShellLinkW, ShellLink};

    if let Some(parent) = lnk.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let work_dir = target.parent().unwrap_or(Path::new(""));
    // SAFETY: plain COM calls on a thread initialised here; every interface is dropped before CoUninitialize.
    unsafe {
        let init = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
        let result = (|| -> windows::core::Result<()> {
            let link: IShellLinkW = CoCreateInstance(&ShellLink, None, CLSCTX_INPROC_SERVER)?;
            link.SetPath(&HSTRING::from(target.as_os_str()))?;
            link.SetWorkingDirectory(&HSTRING::from(work_dir.as_os_str()))?;
            link.SetDescription(&HSTRING::from(description))?;
            link.SetIconLocation(&HSTRING::from(target.as_os_str()), 0)?;
            let file: IPersistFile = link.cast()?;
            file.Save(&HSTRING::from(lnk.as_os_str()), true)
        })();
        if init.is_ok() {
            CoUninitialize();
        }
        result.map_err(|e| e.to_string())
    }
}

/// Writes a `.desktop` entry: `Exec=` the quoted `target`, `Icon=` the `icon.png` next to it (when there is one).
#[cfg(not(windows))]
pub fn create(lnk: &Path, target: &Path, description: &str) -> Result<(), String> {
    use std::os::unix::fs::PermissionsExt;
    if let Some(parent) = lnk.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let work_dir = target.parent().unwrap_or(Path::new("/"));
    let icon = work_dir.join("icon.png");
    let content = crate::platform::desktop_entry(description, target, work_dir, icon.is_file().then_some(icon.as_path()));
    std::fs::write(lnk, content).map_err(|e| e.to_string())?;
    std::fs::set_permissions(lnk, std::fs::Permissions::from_mode(0o755)).map_err(|e| e.to_string())
}

/// GNOME only runs a `.desktop` file from the desktop folder when it is marked trusted. Best effort: `gio` may be missing.
#[cfg(not(windows))]
fn mark_trusted(path: &Path) {
    let _ = std::process::Command::new("gio")
        .args(["set"])
        .arg(path)
        .arg("metadata::trusted")
        .arg("true")
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status();
}

#[cfg(windows)]
fn mark_trusted(_path: &Path) {}

/// Makes sure the tool has its menu shortcut (and a desktop one if `desktop`).
/// Returns the paths of all shortcuts that now exist for it, merged with `known`.
pub fn ensure(id: &str, name: &str, inst: &Installed, desktop: bool, known: &[String]) -> Vec<String> {
    let target = PathBuf::from(&inst.dir).join(&inst.exe);
    let mut list: Vec<String> = known.to_vec();
    let mut want = vec![(start_menu_lnk(id, name), false)];
    if desktop {
        want.extend(desktop_lnk(id, name).map(|p| (p, true)));
    }
    for (lnk, on_desktop) in want {
        let path = lnk.display().to_string();
        let exists = lnk.exists();
        // The menu shortcut is recreated when missing; the desktop one only when it is being requested now.
        let created = !exists && create(&lnk, &target, name).is_ok();
        if created && on_desktop {
            mark_trusted(&lnk);
        }
        if (created || exists) && !list.iter().any(|p| p.eq_ignore_ascii_case(&path)) {
            list.push(path);
        }
    }
    list
}

/// Removes the shortcuts recorded for a tool (and the menu one by name).
pub fn remove_all(id: &str, name: &str, shortcuts: &[String]) {
    for p in shortcuts {
        let _ = std::fs::remove_file(p);
    }
    let _ = std::fs::remove_file(start_menu_lnk(id, name));
}
