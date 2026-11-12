//! Tool catalog: `catalog.json` -> each repository's `nimvoro.json` -> latest GitHub Release.
//! The launcher knows nothing about the tools in advance: a new tool is one line in `catalog.json` (see docs/ADDING_A_TOOL.md).
//!
//! Error strings returned here are codes (`E_...[:arg|arg]`) that the frontend translates; see `src/i18n.ts`.

use crate::store::{self, data_dir};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::time::Duration;

/// Repository of the launcher itself: the fresh `catalog.json` and launcher updates come from here.
pub const LAUNCHER_REPO: &str = "GrigoryyKach/nimvoro";
/// Copy of the catalog baked into the build, used when there is no network on the first start.
const BUNDLED_CATALOG: &str = include_str!("../../catalog.json");
/// Tools that left the catalog (renamed or dropped). Cached entries and installed records for them are ignored.
pub const RETIRED_IDS: [&str; 1] = ["transluent"];

#[derive(Deserialize, Serialize, Clone, Debug)]
pub struct CatalogEntry {
    pub id: String,
    pub repo: String,
}

#[derive(Deserialize, Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Release {
    pub tag: String,
    pub version: String,
    pub published_at: String,
    pub url: String,
    pub asset_name: Option<String>,
    pub asset_url: Option<String>,
    pub asset_size: u64,
    /// `sha256:<hex>`: GitHub computes it for every release file.
    pub digest: Option<String>,
}

#[derive(Deserialize, Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Tool {
    pub id: String,
    pub repo: String,
    /// `nimvoro.json` as is: the frontend picks the fields it needs (including `i18n`).
    pub manifest: Value,
    pub release: Option<Release>,
    /// What went wrong while loading (no release, no network...), as an error code.
    pub error: Option<String>,
}

impl Tool {
    /// Display name from the manifest (English base field).
    pub fn name(&self) -> String {
        self.manifest["name"].as_str().unwrap_or(&self.id).to_string()
    }
}

#[derive(Deserialize, Serialize, Default)]
#[serde(rename_all = "camelCase")]
struct Cache {
    fetched_at: u64,
    tools: Vec<Tool>,
}

pub fn client() -> reqwest::Client {
    reqwest::Client::builder()
        .user_agent(concat!("NIMVORO/", env!("CARGO_PKG_VERSION")))
        .connect_timeout(Duration::from_secs(10))
        .build()
        .expect("http client")
}

fn github_get(c: &reqwest::Client, url: &str) -> reqwest::RequestBuilder {
    let mut r = c.get(url).header("Accept", "application/vnd.github+json");
    // Optional: a token raises the API limit from 60 to 5000 requests per hour.
    if let Ok(t) = std::env::var("GITHUB_TOKEN") {
        if !t.is_empty() {
            r = r.bearer_auth(t);
        }
    }
    r.timeout(Duration::from_secs(20))
}

pub fn raw_url(repo: &str, path: &str) -> String {
    format!("https://raw.githubusercontent.com/{repo}/main/{}", path.trim_start_matches('/'))
}

async fn fetch_catalog(c: &reqwest::Client) -> Vec<CatalogEntry> {
    let remote = async {
        let r = c.get(raw_url(LAUNCHER_REPO, "catalog.json")).timeout(Duration::from_secs(15)).send().await.ok()?;
        if !r.status().is_success() {
            return None;
        }
        r.json::<Vec<CatalogEntry>>().await.ok()
    };
    let list = match remote.await {
        Some(list) if !list.is_empty() => list,
        _ => serde_json::from_str(BUNDLED_CATALOG).unwrap_or_default(),
    };
    list.into_iter().filter(|e| !RETIRED_IDS.contains(&e.id.as_str())).collect()
}

pub fn parse_release(v: &Value, asset_name: Option<&str>) -> Release {
    let tag = v["tag_name"].as_str().unwrap_or_default().to_string();
    let asset = v["assets"].as_array().and_then(|list| {
        list.iter().find(|a| {
            let name = a["name"].as_str().unwrap_or_default();
            match asset_name {
                // "*-setup.exe": any name with this ending.
                Some(n) if n.starts_with('*') => name.ends_with(&n[1..]),
                Some(n) => name == n,
                None => name.ends_with(".zip"),
            }
        })
    });
    Release {
        version: tag.trim_start_matches(['v', 'V']).to_string(),
        tag,
        published_at: v["published_at"].as_str().unwrap_or_default().to_string(),
        url: v["html_url"].as_str().unwrap_or_default().to_string(),
        asset_name: asset.and_then(|a| a["name"].as_str()).map(str::to_string),
        asset_url: asset.and_then(|a| a["browser_download_url"].as_str()).map(str::to_string),
        asset_size: asset.and_then(|a| a["size"].as_u64()).unwrap_or(0),
        digest: asset.and_then(|a| a["digest"].as_str()).map(str::to_string),
    }
}

pub async fn latest_release(c: &reqwest::Client, repo: &str, asset_name: Option<&str>) -> Result<Release, String> {
    let r = github_get(c, &format!("https://api.github.com/repos/{repo}/releases/latest"))
        .send()
        .await
        .map_err(|e| format!("E_NETWORK:{e}"))?;
    match r.status().as_u16() {
        200 => {}
        404 => return Err("E_NO_RELEASES".into()),
        403 | 429 => return Err("E_RATE_LIMIT".into()),
        s => return Err(format!("E_GITHUB_STATUS:{s}")),
    }
    let v: Value = r.json().await.map_err(|e| e.to_string())?;
    Ok(parse_release(&v, asset_name))
}

async fn fetch_tool(c: &reqwest::Client, e: &CatalogEntry) -> Tool {
    let manifest = async {
        let r = c.get(raw_url(&e.repo, "nimvoro.json")).timeout(Duration::from_secs(15)).send().await.map_err(|e| format!("E_NETWORK:{e}"))?;
        if !r.status().is_success() {
            return Err(format!("E_NO_MANIFEST:{}", r.status().as_u16()));
        }
        r.json::<Value>().await.map_err(|e| format!("E_MANIFEST_PARSE:{e}"))
    };
    let (manifest, release) = match manifest.await {
        Ok(m) => {
            let asset = m["asset"].as_str().map(str::to_string);
            let rel = latest_release(c, &e.repo, asset.as_deref()).await;
            (Ok(m), rel)
        }
        Err(err) => (Err(err), Err(String::new())),
    };
    let error = match (&manifest, &release) {
        (Err(e), _) => Some(e.clone()),
        (_, Err(e)) => Some(e.clone()),
        (_, Ok(r)) if r.asset_url.is_none() => Some("E_NO_ASSET".into()),
        _ => None,
    };
    Tool {
        id: e.id.clone(),
        repo: e.repo.clone(),
        manifest: manifest.unwrap_or(Value::Null),
        release: release.ok(),
        error,
    }
}

/// Loads the catalog. `refresh = false` takes it from the cache when there is one (start without network or update check).
pub async fn load(refresh: bool) -> Vec<Tool> {
    let path = data_dir().join("cache.json");
    let mut cached: Cache = std::fs::read_to_string(&path).ok().and_then(|s| serde_json::from_str(&s).ok()).unwrap_or_default();
    cached.tools.retain(|t| !RETIRED_IDS.contains(&t.id.as_str()));
    // Errors cached by 1.0.0 are Russian sentences, not codes; drop them rather than show them in the wrong language.
    for t in &mut cached.tools {
        if t.error.as_deref().is_some_and(|e| !e.starts_with("E_")) {
            t.error = None;
        }
    }
    if !refresh && !cached.tools.is_empty() {
        return cached.tools;
    }
    let c = client();
    let entries = fetch_catalog(&c).await;
    let fresh = futures_util::future::join_all(entries.iter().map(|e| fetch_tool(&c, e))).await;
    // Where loading failed, keep what the cache had, but with the error attached.
    let tools: Vec<Tool> = fresh
        .into_iter()
        .map(|mut t| {
            if let Some(old) = cached.tools.iter().find(|o| o.id == t.id) {
                if t.manifest.is_null() {
                    t.manifest = old.manifest.clone();
                }
                if t.release.is_none() {
                    t.release = old.release.clone();
                }
            }
            t
        })
        .collect();
    let _ = store::write_json(&path, &Cache { fetched_at: store::now_ms(), tools: tools.clone() });
    tools
}
