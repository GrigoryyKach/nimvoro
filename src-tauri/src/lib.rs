//! NIMVORO — лаунчер набора утилит.
//!
//! - `catalog`  — что можно установить (catalog.json → nimvoro.json → GitHub Releases);
//! - `install`  — установка, обновление и удаление;
//! - `store`    — настройки и список установленного.

mod catalog;
mod install;
mod store;

use catalog::{Release, Tool};
use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use std::sync::Mutex;
use store::{Installed, Settings};
use tauri::ipc::Channel;
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_opener::OpenerExt;

pub use install::{running_in, safe_relative};

#[derive(Default)]
struct AppState {
    settings: Mutex<Settings>,
    installed: Mutex<HashMap<String, Installed>>,
    tools: Mutex<Vec<Tool>>,
    /// Инструменты, которые сейчас ставятся или удаляются.
    busy: Mutex<HashSet<String>>,
    /// `--update <id>` из командной строки при запуске: фронтенд заберёт его, когда загрузит каталог.
    pending_update: Mutex<Option<String>>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ToolView {
    #[serde(flatten)]
    tool: Tool,
    installed: Option<Installed>,
    /// Папка, куда инструмент встанет (или уже стоит).
    target_dir: String,
    update_available: bool,
    busy: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct View {
    tools: Vec<ToolView>,
    settings: Settings,
    launcher_version: String,
    data_dir: String,
}

/// `true`, если `candidate` новее `current` (semver без pre-release).
pub fn is_newer(candidate: &str, current: &str) -> bool {
    let parse = |v: &str| -> Vec<u64> {
        v.trim()
            .trim_start_matches(['v', 'V'])
            .split(['-', '+'])
            .next()
            .unwrap_or_default()
            .split('.')
            .map(|p| p.parse().unwrap_or(0))
            .collect()
    };
    let (a, b) = (parse(candidate), parse(current));
    for i in 0..a.len().max(b.len()) {
        let (x, y) = (a.get(i).copied().unwrap_or(0), b.get(i).copied().unwrap_or(0));
        if x != y {
            return x > y;
        }
    }
    false
}

fn view(st: &AppState) -> View {
    let settings = st.settings.lock().unwrap().clone();
    let installed = st.installed.lock().unwrap().clone();
    let busy = st.busy.lock().unwrap().clone();
    let tools = st
        .tools
        .lock()
        .unwrap()
        .iter()
        .map(|t| {
            let inst = installed.get(&t.id).cloned();
            let update_available = match (&inst, &t.release) {
                (Some(i), Some(r)) => r.asset_url.is_some() && is_newer(&r.version, &i.version),
                _ => false,
            };
            let target_dir = match &inst {
                Some(i) => i.dir.clone(),
                None => install::target_dir(t, &settings).display().to_string(),
            };
            ToolView { tool: t.clone(), installed: inst, target_dir, update_available, busy: busy.contains(&t.id) }
        })
        .collect();
    View {
        tools,
        settings,
        launcher_version: env!("CARGO_PKG_VERSION").into(),
        data_dir: store::data_dir().display().to_string(),
    }
}

fn find_tool(st: &AppState, id: &str) -> Result<Tool, String> {
    st.tools.lock().unwrap().iter().find(|t| t.id == id).cloned().ok_or_else(|| format!("инструмент {id} не найден в каталоге"))
}

fn installed_of(st: &AppState, id: &str) -> Result<Installed, String> {
    st.installed.lock().unwrap().get(id).cloned().ok_or_else(|| "инструмент не установлен".into())
}

/// Снимает отметку «занят» при любом выходе из команды.
struct BusyGuard<'a>(&'a AppState, String);
impl Drop for BusyGuard<'_> {
    fn drop(&mut self) {
        self.0.busy.lock().unwrap().remove(&self.1);
    }
}

fn mark_busy<'a>(st: &'a AppState, id: &str) -> Result<BusyGuard<'a>, String> {
    if !st.busy.lock().unwrap().insert(id.to_string()) {
        return Err("этот инструмент уже устанавливается".into());
    }
    Ok(BusyGuard(st, id.to_string()))
}

// ───────────────────────── команды ─────────────────────────

#[tauri::command]
fn get_view(st: State<'_, AppState>) -> View {
    view(&st)
}

/// Загрузить каталог. `refresh = true` — сходить в GitHub за свежими версиями.
#[tauri::command]
async fn load_catalog(refresh: bool, st: State<'_, AppState>) -> Result<View, String> {
    let tools = catalog::load(refresh).await;
    *st.tools.lock().unwrap() = tools;
    *st.installed.lock().unwrap() = store::load_installed();
    Ok(view(&st))
}

#[tauri::command]
async fn install_tool(id: String, close_running: bool, on_progress: Channel<install::Progress>, st: State<'_, AppState>) -> Result<View, String> {
    let tool = find_tool(&st, &id)?;
    let _busy = mark_busy(&st, &id)?;
    let settings = st.settings.lock().unwrap().clone();
    let prev = st.installed.lock().unwrap().get(&id).cloned();
    let inst = install::install(&tool, &settings, prev.as_ref(), close_running, &on_progress).await?;
    {
        let mut map = st.installed.lock().unwrap();
        map.insert(id, inst);
        store::save_installed(&map).map_err(|e| e.to_string())?;
    }
    drop(_busy);
    Ok(view(&st))
}

#[tauri::command]
async fn uninstall_tool(id: String, close_running: bool, st: State<'_, AppState>) -> Result<View, String> {
    let inst = installed_of(&st, &id)?;
    let _busy = mark_busy(&st, &id)?;
    install::uninstall(&inst, close_running).await?;
    {
        let mut map = st.installed.lock().unwrap();
        map.remove(&id);
        store::save_installed(&map).map_err(|e| e.to_string())?;
    }
    drop(_busy);
    Ok(view(&st))
}

/// Запуск через оболочку Windows: так срабатывает запрос прав администратора у утилит, которым он нужен.
#[tauri::command]
fn launch_tool(id: String, app: AppHandle, st: State<'_, AppState>) -> Result<(), String> {
    let inst = installed_of(&st, &id)?;
    let exe = PathBuf::from(&inst.dir).join(&inst.exe);
    app.opener().open_path(exe.display().to_string(), None::<&str>).map_err(|e| e.to_string())
}

#[tauri::command]
fn open_tool_dir(id: String, app: AppHandle, st: State<'_, AppState>) -> Result<(), String> {
    let inst = installed_of(&st, &id)?;
    app.opener().reveal_item_in_dir(PathBuf::from(&inst.dir).join(&inst.exe)).map_err(|e| e.to_string())
}

#[tauri::command]
fn open_path(path: String, app: AppHandle) -> Result<(), String> {
    let p = PathBuf::from(&path);
    let _ = std::fs::create_dir_all(&p);
    app.opener().open_path(p.display().to_string(), None::<&str>).map_err(|e| e.to_string())
}

#[tauri::command]
fn open_url(url: String, app: AppHandle) -> Result<(), String> {
    if !url.starts_with("https://") {
        return Err("открываются только https-ссылки".into());
    }
    app.opener().open_url(url, None::<&str>).map_err(|e| e.to_string())
}

#[tauri::command]
fn save_settings(settings: Settings, st: State<'_, AppState>) -> Result<View, String> {
    store::save_settings(&settings).map_err(|e| e.to_string())?;
    *st.settings.lock().unwrap() = settings;
    Ok(view(&st))
}

/// Своя папка для инструмента (`None` — вернуть общую). Только пока он не установлен.
#[tauri::command]
fn set_tool_dir(id: String, dir: Option<String>, st: State<'_, AppState>) -> Result<View, String> {
    if st.installed.lock().unwrap().contains_key(&id) {
        return Err("папку можно сменить только до установки".into());
    }
    let mut s = st.settings.lock().unwrap().clone();
    match dir.filter(|d| !d.trim().is_empty()) {
        Some(d) => s.tool_dirs.insert(id, d),
        None => s.tool_dirs.remove(&id),
    };
    store::save_settings(&s).map_err(|e| e.to_string())?;
    *st.settings.lock().unwrap() = s;
    Ok(view(&st))
}

#[tauri::command]
fn take_pending_update(st: State<'_, AppState>) -> Option<String> {
    st.pending_update.lock().unwrap().take()
}

/// Новая версия самого лаунчера, если есть.
#[tauri::command]
async fn launcher_update_check() -> Result<Option<Release>, String> {
    let rel = catalog::latest_release(&catalog::client(), catalog::LAUNCHER_REPO, Some("*-setup.exe")).await?;
    Ok((is_newer(&rel.version, env!("CARGO_PKG_VERSION")) && rel.asset_url.is_some()).then_some(rel))
}

/// Скачивает установщик новой версии, запускает его и закрывает лаунчер.
#[tauri::command]
async fn launcher_update_apply(on_progress: Channel<install::Progress>, app: AppHandle) -> Result<(), String> {
    let rel = launcher_update_check().await?.ok_or("обновлений нет")?;
    let tool = Tool {
        id: "nimvoro".into(),
        repo: catalog::LAUNCHER_REPO.into(),
        manifest: serde_json::Value::Null,
        release: Some(rel.clone()),
        error: None,
    };
    let path = install::download_to_temp(&tool, &on_progress).await?;
    let exe = path.with_extension("exe");
    std::fs::rename(&path, &exe).map_err(|e| e.to_string())?;
    app.opener().open_path(exe.display().to_string(), None::<&str>).map_err(|e| e.to_string())?;
    app.exit(0);
    Ok(())
}

fn update_arg(args: &[String]) -> Option<String> {
    args.iter().position(|a| a == "--update").and_then(|i| args.get(i + 1)).cloned()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let state = AppState {
        settings: Mutex::new(store::load_settings()),
        installed: Mutex::new(store::load_installed()),
        pending_update: Mutex::new(update_arg(&std::env::args().collect::<Vec<_>>())),
        ..Default::default()
    };
    tauri::Builder::default()
        // Второй запуск (в том числе `NIMVORO.exe --update <id>` из утилиты) передаётся уже открытому окну.
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.unminimize();
                let _ = w.show();
                let _ = w.set_focus();
            }
            if let Some(id) = update_arg(&argv) {
                let _ = app.emit("update-request", id);
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(state)
        .setup(|_app| {
            store::write_launcher_path();
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_view,
            load_catalog,
            install_tool,
            uninstall_tool,
            launch_tool,
            open_tool_dir,
            open_path,
            open_url,
            save_settings,
            set_tool_dir,
            take_pending_update,
            launcher_update_check,
            launcher_update_apply,
        ])
        .run(tauri::generate_context!())
        .expect("error while running NIMVORO");
}
