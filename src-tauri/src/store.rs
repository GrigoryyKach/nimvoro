//! Launcher settings and the list of installed tools.
//! Everything lives in `%APPDATA%\NIMVORO\`: `settings.json`, `installed.json`, `cache.json`, `launcher.json`.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};

/// Interface languages the launcher (and the whole suite) supports.
pub const LANGUAGES: [&str; 3] = ["en", "ru", "uk"];

/// Environment override used by tests and manual checks, so they never touch the real data folder.
pub const DATA_DIR_ENV: &str = "NIMVORO_DATA_DIR";

pub fn data_dir() -> PathBuf {
    if let Some(d) = std::env::var_os(DATA_DIR_ENV).filter(|d| !d.is_empty()) {
        let d = PathBuf::from(d);
        let _ = std::fs::create_dir_all(&d);
        return d;
    }
    let d = dirs::config_dir().unwrap_or_else(std::env::temp_dir).join("NIMVORO");
    let _ = std::fs::create_dir_all(&d);
    d
}

/// Default install root: `%LOCALAPPDATA%\NIMVORO\Apps`.
pub fn default_install_root() -> PathBuf {
    dirs::data_local_dir().unwrap_or_else(std::env::temp_dir).join("NIMVORO").join("Apps")
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(default, rename_all = "camelCase")]
pub struct Settings {
    /// Shared folder that tools are installed into (each one in its own subfolder).
    pub install_root: String,
    /// Per-tool parent folder: id -> parent folder (kept from 1.0.0; used to prefill the install dialog).
    pub tool_dirs: HashMap<String, String>,
    /// Check all installed tools for updates when the launcher starts.
    pub check_updates_on_start: bool,
    /// Install found updates right away without asking.
    pub auto_install_updates: bool,
    /// Check for updates of the launcher itself.
    pub check_launcher_updates: bool,
    /// system | light | dark
    pub theme: String,
    /// Interface language: en | ru | uk
    pub language: String,
    /// Last state of the "Create desktop shortcut" checkbox in the install dialog.
    pub desktop_shortcut: bool,
    /// grid | list
    pub view: String,
    /// name | updated | size
    pub sort: String,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            install_root: default_install_root().display().to_string(),
            tool_dirs: HashMap::new(),
            check_updates_on_start: true,
            auto_install_updates: false,
            check_launcher_updates: true,
            theme: "system".into(),
            language: "en".into(),
            desktop_shortcut: true,
            view: "grid".into(),
            sort: "name".into(),
        }
    }
}

impl Settings {
    /// Replaces values that are not valid with defaults.
    pub fn sanitized(mut self) -> Self {
        if !LANGUAGES.contains(&self.language.as_str()) {
            self.language = "en".into();
        }
        if !["system", "light", "dark"].contains(&self.theme.as_str()) {
            self.theme = "system".into();
        }
        if self.install_root.trim().is_empty() {
            self.install_root = default_install_root().display().to_string();
        }
        self
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Installed {
    pub version: String,
    /// Tool folder.
    pub dir: String,
    /// Path to the exe relative to `dir`.
    pub exe: String,
    /// Install time, Unix ms.
    pub installed_at: u64,
    /// Files from the archive (relative paths), so update and uninstall never touch foreign files.
    #[serde(default)]
    pub files: Vec<String>,
    #[serde(default)]
    pub size: u64,
    /// Shortcuts (.lnk) created for this tool; removed on uninstall.
    #[serde(default)]
    pub shortcuts: Vec<String>,
}

/// Reads JSON; a leading BOM (written by Notepad and PowerShell 5) is tolerated.
fn read_json<T: for<'de> Deserialize<'de> + Default>(path: &Path) -> T {
    std::fs::read_to_string(path)
        .ok()
        .and_then(|s| serde_json::from_str(s.trim_start_matches('\u{feff}')).ok())
        .unwrap_or_default()
}

/// Writes through a temporary file so a crash mid-write cannot corrupt the data.
pub fn write_json<T: Serialize>(path: &Path, value: &T) -> std::io::Result<()> {
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, serde_json::to_vec_pretty(value)?)?;
    std::fs::rename(tmp, path)
}

pub fn load_settings() -> Settings {
    read_json::<Settings>(&data_dir().join("settings.json")).sanitized()
}

pub fn save_settings(s: &Settings) -> std::io::Result<()> {
    write_json(&data_dir().join("settings.json"), s)
}

pub fn load_installed() -> HashMap<String, Installed> {
    let mut map: HashMap<String, Installed> = read_json(&data_dir().join("installed.json"));
    // The folder was deleted by hand: treat the tool as not installed.
    map.retain(|_, i| Path::new(&i.dir).join(&i.exe).exists());
    map
}

pub fn save_installed(map: &HashMap<String, Installed>) -> std::io::Result<()> {
    write_json(&data_dir().join("installed.json"), map)
}

/// Tells the tools where the launcher lives (they call `NIMVORO.exe --update <id>`).
pub fn write_launcher_path() {
    if let Ok(exe) = std::env::current_exe() {
        let _ = write_json(&data_dir().join("launcher.json"), &serde_json::json!({ "path": exe.display().to_string() }));
    }
}

pub fn now_ms() -> u64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

/// Folder name from a tool name: without characters Windows forbids.
pub fn folder_name(name: &str) -> String {
    let s: String = name
        .chars()
        .map(|c| if "<>:\"/\\|?*".contains(c) || c.is_control() { '_' } else { c })
        .collect();
    let s = s.trim().trim_end_matches('.').to_string();
    if s.is_empty() { "tool".into() } else { s }
}
