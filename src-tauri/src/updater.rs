//! Self-update of the launcher through the official Tauri updater plugin.
//!
//! The plugin reads `latest.json` from the release (`plugins.updater.endpoints`), downloads the installer, **verifies its
//! minisign signature against the public key in `tauri.conf.json`** and only then installs it: the quiet NSIS installer on
//! Windows (no wizard, the app comes back by itself), a replaced AppImage or `pkexec dpkg -i` for a deb on Linux.
//! A bad signature never reaches the installer. The private key lives only in the GitHub Actions secrets.
//!
//! Errors are codes for the frontend (`E_UPDATE_SIGNATURE`, `E_UPDATE_NETWORK:<text>`, `E_UPDATE:<text>`).

use crate::install::Progress;
use tauri::ipc::Channel;
use tauri::AppHandle;
use tauri_plugin_updater::{Error, UpdaterExt};

/// Test override of the update endpoint (`latest.json`), for example `http://127.0.0.1:8123/latest.json`.
/// The signature is still checked against the public key of the build, so this cannot install an unsigned file.
pub const ENDPOINT_ENV: &str = "NIMVORO_UPDATER_ENDPOINT";

/// Value of [`ENDPOINT_ENV`] if it is set and not blank.
pub fn endpoint_override(raw: Option<String>) -> Option<String> {
    raw.map(|s| s.trim().to_string()).filter(|s| !s.is_empty())
}

/// Error code for the UI. A signature problem gets its own code: it is not a network glitch and trying again will not help.
pub fn error_code(e: &Error) -> String {
    match e {
        Error::Minisign(_) | Error::Base64(_) | Error::SignatureUtf8(_) => "E_UPDATE_SIGNATURE".into(),
        Error::ReleaseNotFound | Error::Reqwest(_) | Error::Network(_) => {
            format!("E_UPDATE_NETWORK:{e}")
        }
        _ => format!("E_UPDATE:{e}"),
    }
}

/// Downloads and installs the new version, reporting progress. On Windows the installer takes over and this process exits
/// (the installer starts the new version); on Linux it returns once the file is replaced and the caller restarts the app.
pub async fn install(app: &AppHandle, on_progress: &Channel<Progress>) -> Result<(), String> {
    let mut builder = app.updater_builder();
    if let Some(url) = endpoint_override(std::env::var(ENDPOINT_ENV).ok()) {
        let url = reqwest::Url::parse(&url).map_err(|e| format!("E_UPDATE:{e}"))?;
        builder = builder.endpoints(vec![url]).map_err(|e| error_code(&e))?;
    }
    let updater = builder.build().map_err(|e| error_code(&e))?;
    let update = updater.check().await.map_err(|e| error_code(&e))?.ok_or("E_NO_UPDATE")?;
    let mut received = 0u64;
    let chunk_channel = on_progress.clone();
    let done_channel = on_progress.clone();
    update
        .download_and_install(
            move |chunk, total| {
                received += chunk as u64;
                let _ = chunk_channel.send(Progress::Download { received, total: total.unwrap_or(0) });
            },
            move || {
                // The download is complete and its signature is valid; the installer starts right after this.
                let _ = done_channel.send(Progress::Extract);
            },
        )
        .await
        .map_err(|e| error_code(&e))
}
