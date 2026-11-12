//! NIMVORO: launcher for the NIMVORO utility suite.
//!
//! - `catalog`   - what can be installed (catalog.json -> nimvoro.json -> GitHub Releases);
//! - `install`   - install, update and uninstall;
//! - `shortcuts` - Start-menu and desktop `.lnk` files;
//! - `store`     - settings and the list of installed tools.
//!
//! Errors returned to the UI are codes (`E_...[:arg|arg]`); the frontend translates them (`src/i18n.ts`).

mod catalog;
mod install;
mod shortcuts;
mod store;

use catalog::Release;
pub use catalog::Tool;
use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use std::sync::Mutex;
use store::{Installed, Settings};
use tauri::ipc::Channel;
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_opener::OpenerExt;

pub use install::{running_in, safe_relative, write_marker};
pub use shortcuts::{create as create_shortcut, start_menu_lnk};

#[derive(Default)]
struct AppState {
    settings: Mutex<Settings>,
    installed: Mutex<HashMap<String, Installed>>,
    tools: Mutex<Vec<Tool>>,
    /// Tools that are being installed or removed right now.
    busy: Mutex<HashSet<String>>,
    /// `--update <id>` from the command line at startup: the frontend picks it up once the catalog is loaded.
    pending_update: Mutex<Option<String>>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ToolView {
    #[serde(flatten)]
    tool: Tool,
    installed: Option<Installed>,
    /// Folder the tool will be installed into (or is installed in).
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

/// `true` if `candidate` is newer than `current` (semver without pre-release).
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
    // Only tools that are in the catalog get a card; records of retired tools (e.g. "transluent") stay on disk but are not shown.
    let tools = st
        .tools
        .lock()
        .unwrap()
        .iter()
        .filter(|t| !catalog::RETIRED_IDS.contains(&t.id.as_str()))
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
    st.tools.lock().unwrap().iter().find(|t| t.id == id).cloned().ok_or_else(|| format!("E_TOOL_NOT_FOUND:{id}"))
}

fn installed_of(st: &AppState, id: &str) -> Result<Installed, String> {
    st.installed.lock().unwrap().get(id).cloned().ok_or_else(|| "E_NOT_INSTALLED".into())
}

/// Clears the "busy" mark on any exit from the command.
struct BusyGuard<'a>(&'a AppState, String);
impl Drop for BusyGuard<'_> {
    fn drop(&mut self) {
        self.0.busy.lock().unwrap().remove(&self.1);
    }
}

fn mark_busy<'a>(st: &'a AppState, id: &str) -> Result<BusyGuard<'a>, String> {
    if !st.busy.lock().unwrap().insert(id.to_string()) {
        return Err("E_BUSY".into());
    }
    Ok(BusyGuard(st, id.to_string()))
}

// ───────────────────────── commands ─────────────────────────

#[tauri::command]
fn get_view(st: State<'_, AppState>) -> View {
    view(&st)
}

/// Loads the catalog. `refresh = true` goes to GitHub for fresh versions.
#[tauri::command]
async fn load_catalog(refresh: bool, st: State<'_, AppState>) -> Result<View, String> {
    let tools = catalog::load(refresh).await;
    *st.tools.lock().unwrap() = tools;
    *st.installed.lock().unwrap() = store::load_installed();
    restore_shortcuts(&st).await;
    Ok(view(&st))
}

/// Creates Start-menu shortcuts that are missing for installed tools (also for tools installed by 1.0.0).
async fn restore_shortcuts(st: &AppState) {
    let tools = st.tools.lock().unwrap().clone();
    let installed = st.installed.lock().unwrap().clone();
    let updated = tokio::task::spawn_blocking(move || {
        let mut updated = installed.clone();
        let mut changed = false;
        for t in &tools {
            let Some(inst) = installed.get(&t.id) else { continue };
            let list = shortcuts::ensure(&t.name(), inst, false, &inst.shortcuts);
            if list != inst.shortcuts {
                if let Some(u) = updated.get_mut(&t.id) {
                    u.shortcuts = list;
                }
                changed = true;
            }
        }
        changed.then_some(updated)
    })
    .await
    .ok()
    .flatten();
    if let Some(map) = updated {
        // Merge by id so a concurrent install is not lost.
        let mut cur = st.installed.lock().unwrap();
        for (id, inst) in map {
            if let Some(c) = cur.get_mut(&id) {
                c.shortcuts = inst.shortcuts;
            }
        }
        let _ = store::save_installed(&cur);
    }
}

/// `dest` is the exact folder chosen in the install dialog (first install only); `desktop_shortcut` is its checkbox.
#[tauri::command]
async fn install_tool(
    id: String,
    close_running: bool,
    dest: Option<String>,
    desktop_shortcut: Option<bool>,
    on_progress: Channel<install::Progress>,
    st: State<'_, AppState>,
) -> Result<View, String> {
    let tool = find_tool(&st, &id)?;
    let _busy = mark_busy(&st, &id)?;
    let prev = st.installed.lock().unwrap().get(&id).cloned();
    if prev.is_none() {
        if let Some(flag) = desktop_shortcut {
            let mut s = st.settings.lock().unwrap();
            if s.desktop_shortcut != flag {
                s.desktop_shortcut = flag;
                let _ = store::save_settings(&s);
            }
        }
    }
    let settings = st.settings.lock().unwrap().clone();
    let opts = install::InstallOpts {
        dest: dest.filter(|d| !d.trim().is_empty()).map(PathBuf::from),
        desktop_shortcut: desktop_shortcut.unwrap_or(settings.desktop_shortcut),
        close_running,
        language: settings.language.clone(),
    };
    let inst = install::install(&tool, &settings, prev.as_ref(), opts, &on_progress).await?;
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
    let name = find_tool(&st, &id).map(|t| t.name()).unwrap_or_else(|_| id.clone());
    let _busy = mark_busy(&st, &id)?;
    install::uninstall(&inst, &name, close_running).await?;
    {
        let mut map = st.installed.lock().unwrap();
        map.remove(&id);
        store::save_installed(&map).map_err(|e| e.to_string())?;
    }
    drop(_busy);
    Ok(view(&st))
}

/// Launches through the Windows shell so tools that need administrator rights get their UAC prompt.
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
        return Err("E_HTTPS_ONLY".into());
    }
    app.opener().open_url(url, None::<&str>).map_err(|e| e.to_string())
}

#[tauri::command]
fn save_settings(settings: Settings, st: State<'_, AppState>) -> Result<View, String> {
    let settings = settings.sanitized();
    store::save_settings(&settings).map_err(|e| e.to_string())?;
    *st.settings.lock().unwrap() = settings;
    Ok(view(&st))
}

#[tauri::command]
fn take_pending_update(st: State<'_, AppState>) -> Option<String> {
    st.pending_update.lock().unwrap().take()
}

/// New version of the launcher itself, if any.
#[tauri::command]
async fn launcher_update_check() -> Result<Option<Release>, String> {
    let rel = catalog::latest_release(&catalog::client(), catalog::LAUNCHER_REPO, Some("*-setup.exe")).await?;
    Ok((is_newer(&rel.version, env!("CARGO_PKG_VERSION")) && rel.asset_url.is_some()).then_some(rel))
}

/// Downloads the new installer, runs it and closes the launcher.
#[tauri::command]
async fn launcher_update_apply(on_progress: Channel<install::Progress>, app: AppHandle) -> Result<(), String> {
    let rel = launcher_update_check().await?.ok_or("E_NO_UPDATE")?;
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
        // A second launch (including `NIMVORO.exe --update <id>` from a tool) is forwarded to the already open window.
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
            take_pending_update,
            launcher_update_check,
            launcher_update_apply,
        ])
        .run(tauri::generate_context!())
        .expect("error while running NIMVORO");
}
