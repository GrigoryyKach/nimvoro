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
- **Launcher self-update.** A banner above the catalog. "Update" shows a progress bar inside the launcher, installs the signed update without any installer window and restarts into the new version. The install folder, shortcuts, installed tools, settings and language stay as they are. If the update fails (network, bad signature) you get a message, "Try again" and a "Download manually" link.
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
  shortcuts.rs             Start-menu and desktop .lnk files through the shell COM API (Windows); .desktop entries (Linux)
  platform.rs              Windows/Linux differences without system access: manifest fields, self-update mode, .desktop text, clean child environment
  updater.rs               launcher self-update through the signed Tauri updater (progress, error codes)
  store.rs                 settings and installed list in %APPDATA%\NIMVORO (Linux: ~/.config/NIMVORO)
  lib.rs                   commands, single instance, --update <id>
```

Launcher data lives in `%APPDATA%\NIMVORO\` (Linux: `~/.config/NIMVORO/`): `settings.json`, `installed.json`, `cache.json`, `launcher.json` (the launcher path for the tools).
Programs are installed into `%LOCALAPPDATA%\NIMVORO\Apps\<Name>` by default (Linux: `~/.local/share/nimvoro/apps/<id>`).

Errors from the Rust side reach the UI as codes (`E_...`) that `src/i18n.ts` translates, so every message follows the chosen language.

## Development

```bash
npm install
npm run tauri dev
```

Node.js 22+ and Rust are required (on Linux also `libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev libssl-dev libxdo-dev patchelf`). Releases are built on MSVC (Windows) and `ubuntu-22.04` (Linux) in GitHub Actions. Locally the GNU toolchain (MinGW) works too:
`build.rs` removes the manifest conflict, and `WebView2Loader.dll` must sit next to the exe (cargo puts it into `target/`).

Tests: `cargo test --manifest-path src-tauri/Cargo.toml` and `npm run test:ui`.

To try installs without touching your real data, set `NIMVORO_DATA_DIR`, `NIMVORO_START_MENU_DIR` and `NIMVORO_DESKTOP_DIR` to throwaway folders before `npm run tauri dev`.

### Linux checks in Docker

No Linux machine is needed. [`docker/`](docker/README.md) builds the deb and the AppImage in `ubuntu:22.04` (the CI baseline), runs the tests, and then drives the AppImage under Xvfb against a local mirror of GitHub (`NIMVORO_TEST_BASE_URL`, see [docs/ADDING_A_TOOL.md](docs/ADDING_A_TOOL.md#testing-the-launcher)): catalog filtering, install, `.desktop` entries, update and uninstall. The launcher's own update is signed and has no Docker check; it is covered by a live test on Windows (see below). Wayland-specific behaviour cannot be tested this way.

## Release

Bump the version in `package.json`, `src-tauri/tauri.conf.json` and `src-tauri/Cargo.toml` (and `package-lock.json`), then:

```bash
git tag v1.1.1 && git push --tags
```

GitHub Actions builds the Windows installer, then the Linux AppImage and deb, signs them, and a last job publishes `latest.json` into the same release. Installed launchers read it to offer the update.

### Update signing

The launcher updates itself through the official Tauri updater. Every installer is signed with a minisign key:

- the **public** key is `plugins.updater.pubkey` in `src-tauri/tauri.conf.json`; the launcher refuses any update that does not match it;
- the **private** key and its password live **only** in the repository's Actions secrets `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`. Never commit them, paste them in chat or put them in a file in the repository;
- if the key is lost, installed launchers cannot be updated in place any more: ship a release signed with a new key, with its public key, and ask users to install it by hand once.

`latest.json` is built by `scripts/make-latest-json.mjs` from the `.sig` files of the release (`windows-x86_64`, `linux-x86_64-appimage`, `linux-x86_64-deb`). The asset names of the release stay `*-setup.exe`, `NIMVORO-linux-x64.AppImage` and `NIMVORO-linux-x64.deb`. Launchers 1.4.1 and older do not know the updater: they update the old way (the installer wizard) once.

### Testing the update

`npm run test:ui` runs the overlay state machine and the `latest.json` builder tests. For a live run, build two signed test versions with a **throwaway** key (`npx tauri signer generate`) and a config override that changes `productName`, `identifier`, `version`, the public key and `dangerousInsecureTransportProtocol`, serve `latest.json` and the newer installer from `127.0.0.1`, and point the launcher at it with `NIMVORO_UPDATER_ENDPOINT` (see [docs/ADDING_A_TOOL.md](docs/ADDING_A_TOOL.md#testing-the-launcher)). A different `productName` keeps the test install apart from a real NIMVORO.

## Support

If you find NIMVORO useful, you can support its development: https://donatello.to/MicsGame
