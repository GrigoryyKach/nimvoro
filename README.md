# NIMVORO

A launcher for a suite of Windows utilities: a catalog of tools, one-click install, updates and a folder of your choice for every program.
Built with [Tauri 2](https://v2.tauri.app/): the UI is plain TypeScript, the logic is Rust.

**Download:** the installer `NIMVORO_x.y.z_x64-setup.exe` from the [latest release](https://github.com/GrigoryyKach/nimvoro/releases/latest).
It installs into your user profile, no administrator rights needed.

**Languages:** English (default), Russian and Ukrainian. Pick one in Settings; it applies immediately.

## Features

- **Card catalog.** Icon, version, status, download size, update date. Grid or list, sorting, search (Ctrl+F).
- **One-click install** from a card or from the details popup. A dialog asks for the install folder (prefilled, with a Browse button) and whether to create a desktop shortcut (the choice is remembered). The archive is downloaded from a GitHub Release, its SHA-256 is compared with the one GitHub computed, then it is extracted.
- **Shortcuts.** Every install creates a Start-menu shortcut (`%APPDATA%\Microsoft\Windows\Start Menu\Programs\<Name>.lnk`), plus a desktop one if chosen. Uninstall removes them. On startup the launcher restores a missing Start-menu shortcut.
- **Details popup.** Description, screenshot carousel (arrows, dots, keys left/right), features, requirements and the install folder. Texts come in the language of the launcher when the tool provides a translation.
- **Updates.** "Check for updates on startup" compares all installed tools with GitHub; optionally install them automatically; "Update all" button. If a program is running, NIMVORO asks before closing it. Updates and "Update all" never show the install dialog and keep the folder and shortcuts.
- **Update on request from a tool.** Each tool has its own auto-check switch. Its "Update" button runs `NIMVORO.exe --update <id>`: the launcher closes the program, installs the new version and starts it again.
- **Launcher self-update.** A banner above the catalog; the installer is downloaded and started for you.
- **Careful uninstall.** Only files from the archive are removed. Program settings and files the user put into the folder stay.
- **Themes.** System / Light / Dark, in the same style as the suite's tools.

## Tools in the catalog

| Tool | Repository |
|---|---|
| Random Wheel: a wheel of fortune | [random-wheel](https://github.com/GrigoryyKach/random-wheel) |
| Save URLs: a link library in the tray | [save-urls](https://github.com/GrigoryyKach/save-urls) |
| Smart Switcher: keyboard layout auto-switcher | [smart-switcher](https://github.com/GrigoryyKach/smart-switcher) |
| Sidekick: AI assistant for calls | [sidekick](https://github.com/GrigoryyKach/sidekick) |
| FPS Overlay: FPS and load on top of games | [fps-overlay](https://github.com/GrigoryyKach/fps-overlay) |

## How to add a tool

The launcher does not need to be rebuilt: it reads [`catalog.json`](catalog.json) from the `main` branch on every start.

1. Add `nimvoro.json` to the tool's repository (description, icon, screenshots, exe and archive names, translations).
2. Publish a release with a zip archive: copy `.github/workflows/release.yml` from any tool of the suite.
3. Add a line `{ "id": "...", "repo": "owner/repo" }` to `catalog.json`.

Details, including the manifest format, the language marker, themes, shortcuts and the update protocol: [docs/ADDING_A_TOOL.md](docs/ADDING_A_TOOL.md).
The icons of the suite are drawn by `tools/make-icons.js`; run it with any Electron from the suite root:
`<electron> tools/make-icons.js <OwnLauncher root> [scratch dir]` (for example with the Electron in `projects/smart_switcher/node_modules`).

## Layout

```
src/                       UI
  main.ts                  window, toolbar, sections, startup sequence
  api.ts                   typed backend calls
  i18n.ts                  English / Russian / Ukrainian strings, plurals, backend error codes
  format.ts                locale-aware sizes and dates, localized manifest fields
  store.ts, actions.ts     state and actions (install, update, uninstall)
  ui/cards.ts              cards, the Install / Open / Update button with progress
  ui/install-dialog.ts     install dialog (folder, desktop shortcut)
  ui/details.ts            details popup with the carousel
  ui/settings.ts           settings
src-tauri/src/
  catalog.rs               catalog.json -> nimvoro.json -> latest GitHub Release, cache for offline use
  install.rs               download, SHA-256, extraction without "../", closing a running program, language marker
  shortcuts.rs             Start-menu and desktop .lnk files through the shell COM API
  store.rs                 settings and installed list in %APPDATA%\NIMVORO
  lib.rs                   commands, single instance, --update <id>
```

Launcher data lives in `%APPDATA%\NIMVORO\` (`settings.json`, `installed.json`, `cache.json`, `launcher.json`: the launcher path for the tools).
Programs are installed into `%LOCALAPPDATA%\NIMVORO\Apps\<Name>` by default.

Errors from the Rust side reach the UI as codes (`E_...`) that `src/i18n.ts` translates, so every message follows the chosen language.

## Development

```bash
npm install
npm run tauri dev
```

Node.js 22+ and Rust are required. Releases are built on MSVC in GitHub Actions. Locally the GNU toolchain (MinGW) works too:
`build.rs` removes the manifest conflict, and `WebView2Loader.dll` must sit next to the exe (cargo puts it into `target/`).

Tests: `cargo test --manifest-path src-tauri/Cargo.toml`.

To try installs without touching your real data, set `NIMVORO_DATA_DIR`, `NIMVORO_START_MENU_DIR` and `NIMVORO_DESKTOP_DIR` to throwaway folders before `npm run tauri dev`.

## Release

Bump the version in `package.json`, `src-tauri/tauri.conf.json` and `src-tauri/Cargo.toml`, then:

```bash
git tag v1.1.1 && git push --tags
```

GitHub Actions builds the installer and publishes the release. Installed launchers offer the update.
