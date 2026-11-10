//! Настройки лаунчера и список установленных инструментов.
//! Всё лежит в `%APPDATA%\NIMVORO\`: `settings.json`, `installed.json`, `cache.json`, `launcher.json`.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};

pub fn data_dir() -> PathBuf {
    let d = dirs::config_dir().unwrap_or_else(std::env::temp_dir).join("NIMVORO");
    let _ = std::fs::create_dir_all(&d);
    d
}

/// Папка установки по умолчанию: `%LOCALAPPDATA%\NIMVORO\Apps`.
pub fn default_install_root() -> PathBuf {
    dirs::data_local_dir().unwrap_or_else(std::env::temp_dir).join("NIMVORO").join("Apps")
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(default, rename_all = "camelCase")]
pub struct Settings {
    /// Общая папка, в которую ставятся инструменты (каждый — в свою подпапку).
    pub install_root: String,
    /// Своя папка для отдельного инструмента: id → родительская папка.
    pub tool_dirs: HashMap<String, String>,
    /// При запуске лаунчера проверять обновления всех установленных инструментов.
    pub check_updates_on_start: bool,
    /// Сразу ставить найденные обновления, не спрашивая.
    pub auto_install_updates: bool,
    /// Проверять обновления самого лаунчера.
    pub check_launcher_updates: bool,
    /// system | light | dark
    pub theme: String,
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
            view: "grid".into(),
            sort: "name".into(),
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Installed {
    pub version: String,
    /// Папка инструмента.
    pub dir: String,
    /// Путь к exe относительно `dir`.
    pub exe: String,
    /// Unix-время установки, мс.
    pub installed_at: u64,
    /// Файлы из архива (относительные пути) — чтобы обновление и удаление не трогали чужие файлы.
    #[serde(default)]
    pub files: Vec<String>,
    #[serde(default)]
    pub size: u64,
}

/// Читает JSON; BOM в начале (так сохраняет Блокнот и PowerShell 5) не мешает.
fn read_json<T: for<'de> Deserialize<'de> + Default>(path: &Path) -> T {
    std::fs::read_to_string(path)
        .ok()
        .and_then(|s| serde_json::from_str(s.trim_start_matches('\u{feff}')).ok())
        .unwrap_or_default()
}

/// Запись через временный файл, чтобы сбой посреди записи не портил данные.
pub fn write_json<T: Serialize>(path: &Path, value: &T) -> std::io::Result<()> {
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, serde_json::to_vec_pretty(value)?)?;
    std::fs::rename(tmp, path)
}

pub fn load_settings() -> Settings {
    let mut s: Settings = read_json(&data_dir().join("settings.json"));
    if s.install_root.trim().is_empty() {
        s.install_root = default_install_root().display().to_string();
    }
    s
}

pub fn save_settings(s: &Settings) -> std::io::Result<()> {
    write_json(&data_dir().join("settings.json"), s)
}

pub fn load_installed() -> HashMap<String, Installed> {
    let mut map: HashMap<String, Installed> = read_json(&data_dir().join("installed.json"));
    // Папку удалили вручную — считаем инструмент неустановленным.
    map.retain(|_, i| Path::new(&i.dir).join(&i.exe).exists());
    map
}

pub fn save_installed(map: &HashMap<String, Installed>) -> std::io::Result<()> {
    write_json(&data_dir().join("installed.json"), map)
}

/// Сообщает утилитам, где лежит лаунчер (они зовут `NIMVORO.exe --update <id>`).
pub fn write_launcher_path() {
    if let Ok(exe) = std::env::current_exe() {
        let _ = write_json(&data_dir().join("launcher.json"), &serde_json::json!({ "path": exe.display().to_string() }));
    }
}

pub fn now_ms() -> u64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

/// Имя папки инструмента из его названия: без символов, запрещённых в Windows.
pub fn folder_name(name: &str) -> String {
    let s: String = name
        .chars()
        .map(|c| if "<>:\"/\\|?*".contains(c) || c.is_control() { '_' } else { c })
        .collect();
    let s = s.trim().trim_end_matches('.').to_string();
    if s.is_empty() { "tool".into() } else { s }
}
