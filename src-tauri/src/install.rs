//! Установка, обновление и удаление инструментов.
//!
//! Установка = скачать zip из релиза → сверить SHA-256 с тем, что посчитал GitHub → распаковать в папку инструмента.
//! Обновление распаковывается поверх: файлы, которых нет в новой версии, удаляются, но только те,
//! что ставил сам лаунчер. Всё, что создал пользователь (например, портативная библиотека Save URLs), остаётся.

use crate::catalog::{self, Tool};
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

/// Ошибка «утилита запущена»: фронтенд спрашивает пользователя и повторяет с `close_running = true`.
pub const RUNNING_PREFIX: &str = "RUNNING:";

/// Куда ставить инструмент: `<своя папка или общая>\<Название>`.
pub fn target_dir(tool: &Tool, settings: &Settings) -> PathBuf {
    let parent = settings
        .tool_dirs
        .get(&tool.id)
        .filter(|d| !d.trim().is_empty())
        .cloned()
        .unwrap_or_else(|| settings.install_root.clone());
    let name = tool.manifest["name"].as_str().unwrap_or(&tool.id);
    PathBuf::from(parent).join(store::folder_name(name))
}

/// Список процессов с путями к exe.
fn processes() -> Option<System> {
    let mut sys = System::new().ok()?;
    sys.refresh_processes_specifics(ProcessesToUpdate::All, true, ProcessRefreshKind::nothing().with_exe(UpdateKind::Always));
    Some(sys)
}

/// Процессы, запущенные из папки `dir`.
pub fn running_in(dir: &Path) -> Vec<(sysinfo::Pid, String)> {
    let Some(sys) = processes() else { return vec![] };
    let prefix = normalize(dir);
    sys.processes()
        .iter()
        .filter_map(|(pid, p)| {
            let exe = p.exe()?;
            // Путь может не совпасть строкой (junction, symlink, виртуализация папок у MSIX-приложений),
            // поэтому для exe в корне папки сравниваем сами файлы: том + индекс файла.
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

/// Закрывает процессы из папки `dir`. `Err` с префиксом `RUNNING:` — если закрывать не разрешили.
pub async fn ensure_closed(dir: &Path, close_running: bool) -> Result<(), String> {
    let running = running_in(dir);
    if running.is_empty() {
        return Ok(());
    }
    if !close_running {
        let names: Vec<String> = running.iter().map(|(_, n)| n.clone()).collect::<HashSet<_>>().into_iter().collect();
        return Err(format!("{RUNNING_PREFIX}{}", names.join(", ")));
    }
    let sys = processes().ok_or("не удалось получить список процессов")?;
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
    Err("не удалось закрыть запущенную программу".into())
}

/// Безопасный относительный путь из имени в архиве: без `..`, дисков и абсолютных путей (zip slip).
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
    let rel = tool.release.as_ref().ok_or("у инструмента ещё нет релиза")?;
    let url = rel.asset_url.as_ref().ok_or("в релизе нет архива для Windows")?;
    let resp = catalog::client().get(url).send().await.map_err(|e| format!("загрузка: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("загрузка: GitHub ответил {}", resp.status().as_u16()));
    }
    let total = resp.content_length().unwrap_or(rel.asset_size);
    let path = std::env::temp_dir().join(format!("nimvoro-{}-{}.zip", tool.id, rel.version));
    let mut file = std::fs::File::create(&path).map_err(|e| format!("временный файл: {e}"))?;
    let mut hasher = Sha256::new();
    let mut received = 0u64;
    let mut last_sent = 0u64;
    let mut stream = resp.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("загрузка прервалась: {e}"))?;
        file.write_all(&chunk).map_err(|e| format!("запись: {e}"))?;
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
            return Err("архив повреждён: контрольная сумма не совпала. Попробуйте ещё раз".into());
        }
    }
    Ok(path)
}

fn extract(zip_path: &Path, dest: &Path) -> Result<(Vec<String>, u64), String> {
    let file = std::fs::File::open(zip_path).map_err(|e| e.to_string())?;
    let mut zip = zip::ZipArchive::new(file).map_err(|e| format!("архив: {e}"))?;
    std::fs::create_dir_all(dest).map_err(|e| format!("папка {}: {e}", dest.display()))?;
    let mut files = vec![];
    let mut size = 0u64;
    for i in 0..zip.len() {
        let mut entry = zip.by_index(i).map_err(|e| format!("архив: {e}"))?;
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
        let mut f = std::fs::File::create(&out).map_err(|e| format!("{}: {e}", rel.display()))?;
        size += std::io::copy(&mut entry, &mut f).map_err(|e| format!("{}: {e}", rel.display()))?;
        files.push(rel.to_string_lossy().replace('/', "\\"));
    }
    Ok((files, size))
}

/// Удаляет перечисленные файлы и опустевшие после этого папки внутри `dir`.
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
    // Глубокие папки — первыми.
    let mut parents: Vec<PathBuf> = parents.into_iter().collect();
    parents.sort_by_key(|p| std::cmp::Reverse(p.components().count()));
    for p in parents {
        let _ = std::fs::remove_dir(p); // удалится, только если пустая
    }
}

pub async fn install(
    tool: &Tool,
    settings: &Settings,
    prev: Option<&Installed>,
    close_running: bool,
    ch: &Channel<Progress>,
) -> Result<Installed, String> {
    let exe = tool.manifest["exe"].as_str().ok_or("в nimvoro.json нет поля exe")?.to_string();
    let dest = match prev {
        Some(p) => PathBuf::from(&p.dir),
        None => target_dir(tool, settings),
    };
    ensure_closed(&dest, close_running).await?;
    let zip = download_to_temp(tool, ch).await?;
    // Пока качали, пользователь мог запустить программу.
    ensure_closed(&dest, close_running).await?;
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
        return Err(format!("после распаковки не найден {exe}"));
    }
    let version = tool.release.as_ref().map(|r| r.version.clone()).unwrap_or_default();
    let _ = store::write_json(
        &dest.join(".nimvoro.json"),
        &serde_json::json!({ "id": tool.id, "version": version, "repo": tool.repo }),
    );
    let _ = ch.send(Progress::Done { version: version.clone() });
    Ok(Installed { version, dir: dest.display().to_string(), exe, installed_at: store::now_ms(), files, size })
}

pub async fn uninstall(inst: &Installed, close_running: bool) -> Result<(), String> {
    let dir = PathBuf::from(&inst.dir);
    ensure_closed(&dir, close_running).await?;
    let mut files = inst.files.clone();
    files.push(".nimvoro.json".into());
    remove_files(&dir, &files);
    let _ = std::fs::remove_dir(&dir); // только если ничего своего пользователь туда не положил
    if dir.join(&inst.exe).exists() {
        return Err("не удалось удалить файлы: возможно, программа ещё запущена".into());
    }
    Ok(())
}
