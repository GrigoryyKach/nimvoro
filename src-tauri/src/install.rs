//! Install, update and uninstall of tools.
//!
//! Install = download the release zip, verify SHA-256 against the value GitHub computed, extract into the tool folder,
//! write the language marker and create shortcuts. An update extracts over the old files: files missing from the new
//! version are removed, but only those the launcher itself installed. Anything the user created (e.g. the portable
//! Save URLs library) stays.
//!
//! Error strings are codes (`E_...[:arg|arg]`) that the frontend translates; see `src/i18n.ts`.

use crate::catalog::{self, Tool};
use crate::shortcuts;
use crate::store::{self, Installed, Settings};
use futures_util::StreamExt;
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::collections::HashSet;
use std::io::Write;
use std::path::{Component, Path, PathBuf};
use sysinfo::{ProcessRefreshKind, ProcessesToUpdate, System, UpdateKind};
use tauri::ipc::Channel;

#[derive(Clone, Serialize)]
#[serde(tag = "stage", rename_all = "camelCase")]
pub enum Progress {
    #[serde(rename_all = "camelCase")]
    Download { received: u64, total: u64 },
    Verify,
    Extract,
    #[serde(rename_all = "camelCase")]
    Done { version: String },
}

/// "Tool is running" error: the frontend asks the user and retries with `close_running = true`.
pub const RUNNING_PREFIX: &str = "RUNNING:";

/// Default install folder: `<per-tool parent or shared root>\<Name>`.
pub fn target_dir(tool: &Tool, settings: &Settings) -> PathBuf {
    let parent = settings
        .tool_dirs
        .get(&tool.id)
        .filter(|d| !d.trim().is_empty())
        .cloned()
        .unwrap_or_else(|| settings.install_root.clone());
    PathBuf::from(parent).join(store::folder_name(&tool.name()))
}

/// Process list with exe paths.
fn processes() -> Option<System> {
    let mut sys = System::new().ok()?;
    sys.refresh_processes_specifics(ProcessesToUpdate::All, true, ProcessRefreshKind::nothing().with_exe(UpdateKind::Always));
    Some(sys)
}

/// Processes running from `dir`.
pub fn running_in(dir: &Path) -> Vec<(sysinfo::Pid, String)> {
    let Some(sys) = processes() else { return vec![] };
    let prefix = normalize(dir);
    sys.processes()
        .iter()
        .filter_map(|(pid, p)| {
            let exe = p.exe()?;
            // The path may differ as a string (junction, symlink, folder virtualisation of MSIX apps),
            // so for an exe in the folder root we compare the files themselves: volume + file index.
            let same = normalize(exe).starts_with(&prefix)
                || exe.file_name().is_some_and(|n| same_file::is_same_file(exe, dir.join(n)).unwrap_or(false));
            same.then(|| (*pid, p.name().to_string_lossy().into_owned()))
        })
        .collect()
}

fn normalize(p: &Path) -> String {
    let s = p.display().to_string().replace('/', "\\").to_lowercase();
    s.trim_end_matches('\\').to_string() + "\\"
}

/// Closes processes running from `dir`. `Err` with the `RUNNING:` prefix if closing is not allowed.
pub async fn ensure_closed(dir: &Path, close_running: bool) -> Result<(), String> {
    let running = running_in(dir);
    if running.is_empty() {
        return Ok(());
    }
    if !close_running {
        let names: Vec<String> = running.iter().map(|(_, n)| n.clone()).collect::<HashSet<_>>().into_iter().collect();
        return Err(format!("{RUNNING_PREFIX}{}", names.join(", ")));
    }
    let sys = processes().ok_or("E_PROCESS_LIST")?;
    for (pid, _) in &running {
        if let Some(p) = sys.process(*pid) {
            p.kill();
        }
    }
    for _ in 0..50 {
        if running_in(dir).is_empty() {
            return Ok(());
        }
        tokio::time::sleep(std::time::Duration::from_millis(100)).await;
    }
    Err("E_CLOSE_FAILED".into())
}

/// Safe relative path from an archive entry name: no `..`, drives or absolute paths (zip slip).
pub fn safe_relative(name: &str) -> Option<PathBuf> {
    let p = PathBuf::from(name.replace('\\', "/"));
    let mut out = PathBuf::new();
    for c in p.components() {
        match c {
            Component::Normal(part) => out.push(part),
            Component::CurDir => {}
            _ => return None,
        }
    }
    (!out.as_os_str().is_empty()).then_some(out)
}

pub async fn download_to_temp(tool: &Tool, ch: &Channel<Progress>) -> Result<PathBuf, String> {
    let rel = tool.release.as_ref().ok_or("E_NO_RELEASE")?;
    let url = rel.asset_url.as_ref().ok_or("E_NO_ASSET")?;
    let resp = catalog::client().get(url).send().await.map_err(|e| format!("E_DOWNLOAD:{e}"))?;
    if !resp.status().is_success() {
        return Err(format!("E_GITHUB_STATUS:{}", resp.status().as_u16()));
    }
    let total = resp.content_length().unwrap_or(rel.asset_size);
    let path = std::env::temp_dir().join(format!("nimvoro-{}-{}.zip", tool.id, rel.version));
    let mut file = std::fs::File::create(&path).map_err(|e| format!("E_TEMP_FILE:{e}"))?;
    let mut hasher = Sha256::new();
    let mut received = 0u64;
    let mut last_sent = 0u64;
    let mut stream = resp.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("E_DOWNLOAD_INTERRUPTED:{e}"))?;
        file.write_all(&chunk).map_err(|e| format!("E_WRITE:{e}"))?;
        hasher.update(&chunk);
        received += chunk.len() as u64;
        if received - last_sent > 256 * 1024 || received == total {
            last_sent = received;
            let _ = ch.send(Progress::Download { received, total });
        }
    }
    drop(file);
    let _ = ch.send(Progress::Verify);
    if let Some(expected) = rel.digest.as_deref().and_then(|d| d.strip_prefix("sha256:")) {
        let actual = hex::encode(hasher.finalize());
        if !actual.eq_ignore_ascii_case(expected) {
            let _ = std::fs::remove_file(&path);
            return Err("E_CHECKSUM".into());
        }
    }
    Ok(path)
}

fn extract(zip_path: &Path, dest: &Path) -> Result<(Vec<String>, u64), String> {
    let file = std::fs::File::open(zip_path).map_err(|e| e.to_string())?;
    let mut zip = zip::ZipArchive::new(file).map_err(|e| format!("E_ARCHIVE:{e}"))?;
    std::fs::create_dir_all(dest).map_err(|e| format!("E_FOLDER:{}|{e}", dest.display()))?;
    let mut files = vec![];
    let mut size = 0u64;
    for i in 0..zip.len() {
        let mut entry = zip.by_index(i).map_err(|e| format!("E_ARCHIVE:{e}"))?;
        let Ok(name) = entry.name().map(|n| n.into_owned()) else { continue };
        let Some(rel) = safe_relative(&name) else { continue };
        let out = dest.join(&rel);
        if entry.is_dir() {
            std::fs::create_dir_all(&out).map_err(|e| e.to_string())?;
            continue;
        }
        if let Some(parent) = out.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let mut f = std::fs::File::create(&out).map_err(|e| format!("E_FILE_IO:{}|{e}", rel.display()))?;
        size += std::io::copy(&mut entry, &mut f).map_err(|e| format!("E_FILE_IO:{}|{e}", rel.display()))?;
        files.push(rel.to_string_lossy().replace('/', "\\"));
    }
    Ok((files, size))
}

/// Removes the listed files and the folders inside `dir` that became empty.
fn remove_files(dir: &Path, files: &[String]) {
    let mut parents: HashSet<PathBuf> = HashSet::new();
    for f in files {
        let Some(rel) = safe_relative(f) else { continue };
        let p = dir.join(&rel);
        let _ = std::fs::remove_file(&p);
        let mut cur = p.parent().map(Path::to_path_buf);
        while let Some(c) = cur {
            if c == dir || !c.starts_with(dir) {
                break;
            }
            parents.insert(c.clone());
            cur = c.parent().map(Path::to_path_buf);
        }
    }
    // Deepest folders first.
    let mut parents: Vec<PathBuf> = parents.into_iter().collect();
    parents.sort_by_key(|p| std::cmp::Reverse(p.components().count()));
    for p in parents {
        let _ = std::fs::remove_dir(p); // only succeeds if empty
    }
}

/// What the user chose for this install.
pub struct InstallOpts {
    /// Exact install folder for a first install (ignored for updates).
    pub dest: Option<PathBuf>,
    pub desktop_shortcut: bool,
    pub close_running: bool,
    /// Launcher language, written to the marker on first install.
    pub language: String,
}

/// Writes `<dir>\.nimvoro.json`. `language` is set on first install and kept on updates.
pub fn write_marker(dir: &Path, tool: &Tool, version: &str, language: &str) {
    let path = dir.join(".nimvoro.json");
    let mut obj: serde_json::Map<String, serde_json::Value> = std::fs::read_to_string(&path)
        .ok()
        .and_then(|s| serde_json::from_str(s.trim_start_matches('\u{feff}')).ok())
        .unwrap_or_default();
    obj.insert("id".into(), tool.id.clone().into());
    obj.insert("version".into(), version.into());
    obj.insert("repo".into(), tool.repo.clone().into());
    let has_lang = obj.get("language").and_then(|v| v.as_str()).is_some_and(|l| store::LANGUAGES.contains(&l));
    if !has_lang {
        obj.insert("language".into(), language.into());
    }
    let _ = store::write_json(&path, &serde_json::Value::Object(obj));
}

pub async fn install(tool: &Tool, settings: &Settings, prev: Option<&Installed>, opts: InstallOpts, ch: &Channel<Progress>) -> Result<Installed, String> {
    let exe = tool.manifest["exe"].as_str().ok_or("E_NO_EXE_FIELD")?.to_string();
    let dest = match (prev, &opts.dest) {
        (Some(p), _) => PathBuf::from(&p.dir),
        (None, Some(d)) => {
            if !d.is_absolute() {
                return Err("E_BAD_DIR".into());
            }
            d.clone()
        }
        (None, None) => target_dir(tool, settings),
    };
    ensure_closed(&dest, opts.close_running).await?;
    let zip = download_to_temp(tool, ch).await?;
    // The user may have started the program while it was downloading.
    ensure_closed(&dest, opts.close_running).await?;
    let _ = ch.send(Progress::Extract);
    let (files, size) = {
        let (z, d) = (zip.clone(), dest.clone());
        tokio::task::spawn_blocking(move || extract(&z, &d)).await.map_err(|e| e.to_string())??
    };
    let _ = std::fs::remove_file(&zip);
    if let Some(p) = prev {
        let keep: HashSet<&String> = files.iter().collect();
        let stale: Vec<String> = p.files.iter().filter(|f| !keep.contains(f)).cloned().collect();
        remove_files(&dest, &stale);
    }
    if !dest.join(&exe).exists() {
        return Err(format!("E_EXE_MISSING:{exe}"));
    }
    let version = tool.release.as_ref().map(|r| r.version.clone()).unwrap_or_default();
    write_marker(&dest, tool, &version, &opts.language);
    let mut inst = Installed {
        version: version.clone(),
        dir: dest.display().to_string(),
        exe,
        installed_at: store::now_ms(),
        files,
        size,
        shortcuts: prev.map(|p| p.shortcuts.clone()).unwrap_or_default(),
    };
    // A desktop shortcut is only offered on first install; updates keep what exists and restore a missing Start-menu one.
    let desktop = prev.is_none() && opts.desktop_shortcut;
    inst.shortcuts = {
        let (name, snapshot, known) = (tool.name(), inst.clone(), inst.shortcuts.clone());
        tokio::task::spawn_blocking(move || shortcuts::ensure(&name, &snapshot, desktop, &known)).await.map_err(|e| e.to_string())?
    };
    let _ = ch.send(Progress::Done { version });
    Ok(inst)
}

pub async fn uninstall(inst: &Installed, name: &str, close_running: bool) -> Result<(), String> {
    let dir = PathBuf::from(&inst.dir);
    ensure_closed(&dir, close_running).await?;
    let mut files = inst.files.clone();
    files.push(".nimvoro.json".into());
    remove_files(&dir, &files);
    let _ = std::fs::remove_dir(&dir); // only succeeds if the user left nothing of their own there
    if dir.join(&inst.exe).exists() {
        return Err("E_UNINSTALL_LEFT".into());
    }
    shortcuts::remove_all(name, &inst.shortcuts);
    Ok(())
}
