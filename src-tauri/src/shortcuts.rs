//! Windows shortcuts (`.lnk`) created through the shell COM API (`IShellLinkW`): no child processes, no console windows.
//!
//! - Start menu: `%APPDATA%\Microsoft\Windows\Start Menu\Programs\<Name>.lnk` (always);
//! - desktop: `<Desktop>\<Name>.lnk` (only if the user asked for it in the install dialog).

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
    dirs::data_dir().unwrap_or_else(std::env::temp_dir).join("Microsoft").join("Windows").join("Start Menu").join("Programs")
}

/// Path of the Start-menu shortcut for a tool with this display name.
pub fn start_menu_lnk(name: &str) -> PathBuf {
    start_menu_dir().join(format!("{}.lnk", store::folder_name(name)))
}

pub fn desktop_lnk(name: &str) -> Option<PathBuf> {
    env_dir(DESKTOP_ENV).or_else(dirs::desktop_dir).map(|d| d.join(format!("{}.lnk", store::folder_name(name))))
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

#[cfg(not(windows))]
pub fn create(_lnk: &Path, _target: &Path, _description: &str) -> Result<(), String> {
    Err("shortcuts are only supported on Windows".into())
}

/// Makes sure the tool has its Start-menu shortcut (and a desktop one if `desktop`).
/// Returns the paths of all shortcuts that now exist for it, merged with `known`.
pub fn ensure(name: &str, inst: &Installed, desktop: bool, known: &[String]) -> Vec<String> {
    let target = PathBuf::from(&inst.dir).join(&inst.exe);
    let mut list: Vec<String> = known.to_vec();
    let mut want = vec![start_menu_lnk(name)];
    if desktop {
        want.extend(desktop_lnk(name));
    }
    for lnk in want {
        let path = lnk.display().to_string();
        let exists = lnk.exists();
        // The Start-menu shortcut is recreated when missing; the desktop one only when it is being requested now.
        if (!exists && create(&lnk, &target, name).is_ok()) || exists {
            if !list.iter().any(|p| p.eq_ignore_ascii_case(&path)) {
                list.push(path);
            }
        }
    }
    list
}

/// Removes the shortcuts recorded for a tool (and the Start-menu one by name).
pub fn remove_all(name: &str, shortcuts: &[String]) {
    for p in shortcuts {
        let _ = std::fs::remove_file(p);
    }
    let _ = std::fs::remove_file(start_menu_lnk(name));
}
