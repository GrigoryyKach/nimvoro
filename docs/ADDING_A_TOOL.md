# Adding a tool to NIMVORO

The launcher knows nothing about the tools in advance. Everything it shows and installs comes from three places:

1. `catalog.json` in this repository: the list of tool repositories.
2. `nimvoro.json` in the root of the tool's repository: description, icon, screenshots, exe name, translations.
3. The tool's latest GitHub Release: the version (`tag_name`) and the zip to install.

To add a tool you do not need to rebuild the launcher: follow the steps below and add a line to `catalog.json`.

## 1. The manifest `nimvoro.json`

Put it in the root of the tool's repository, on the `main` branch. Base fields are in English; translations go into `i18n`.

```json
{
  "schema": 1,
  "id": "random-wheel",
  "name": "Random Wheel",
  "tagline": "A wheel of fortune for giveaways",
  "description": "A paragraph or two about what it is and why you need it.",
  "features": [
    { "title": "Wheel and list", "text": "Two ways to pick a winner." }
  ],
  "category": "Games",
  "accent": ["#4f6bff", "#8a5bff"],
  "icon": "assets/icon.png",
  "screenshots": ["assets/screenshots/1.png", "assets/screenshots/2.png"],
  "exe": "RandomWheel.exe",
  "asset": "RandomWheel-win-x64.zip",
  "requirements": ["Windows 10/11 x64"],
  "settingsDir": "%APPDATA%\\Random Wheel",
  "i18n": {
    "ru": {
      "tagline": "Колесо фортуны для розыгрышей",
      "description": "Абзац-два о том, что это и зачем.",
      "features": [{ "title": "Колесо и список", "text": "Два режима выбора победителя." }],
      "category": "Игры",
      "requirements": ["Windows 10/11 x64"]
    },
    "uk": {
      "tagline": "Колесо фортуни для розіграшів",
      "description": "Абзац-два про те, що це і навіщо.",
      "features": [{ "title": "Колесо і список", "text": "Два режими вибору переможця." }],
      "category": "Ігри",
      "requirements": ["Windows 10/11 x64"]
    }
  }
}
```

| Field | Required | What it is |
|---|---|---|
| `schema` | yes | Format version, currently `1` |
| `id` | yes | Unique id, equal to the `id` in `catalog.json`; a tool uses it to call `NIMVORO.exe --update <id>` |
| `name`, `tagline` | yes | Card title and subtitle |
| `description`, `features` | yes | Text in the popup |
| `category` | no | Short label shown as a badge. It is display-only: the launcher never groups or filters by it |
| `accent` | no | Two gradient colours for the logo and the card accents |
| `icon` | yes | PNG 256x256 (or larger), a path inside the repository |
| `screenshots` | no | PNG/JPG for the carousel, paths inside the repository |
| `exe` | yes | Path to the exe inside the extracted zip |
| `asset` | yes | Zip name in the release. No version in the name, so `releases/latest/download/<asset>` works |
| `requirements` | no | Strings shown in the popup |
| `settingsDir` | no | Where the tool keeps its settings (shown on uninstall) |
| `i18n` | no | Translations, see below |

### Translations (`i18n`)

`i18n` maps a language code (`ru`, `uk`) to the translatable fields: `name`, `tagline`, `description`, `features`, `requirements` and `category`.
The launcher shows `manifest.i18n[lang]` for the chosen language and falls back, field by field, to the base English fields. English needs no entry. Keep the base values in English.

## 2. Release

- Tag `vX.Y.Z` (semver). The version in the tag must match the version baked into the exe.
- The release holds a zip named as in `asset`. Inside: a ready-to-run folder with the exe and everything it needs in the archive root.
- The workflow template is `.github/workflows/release.yml` in any existing tool: it builds on `windows-latest`, zips and publishes a release on a tag push.

## 3. What the launcher does on install

1. Asks for the install folder (default `<install root>\<Name>`) and whether to create a desktop shortcut. The choice becomes the tool's folder. Updates do not ask.
2. Downloads the zip, verifies SHA-256, extracts it. On update, files that are gone from the new version are removed, but only those the launcher installed.
3. Writes the **language marker** `<tool folder>\.nimvoro.json` (see below).
4. Creates the **shortcuts** (see below) and records everything in `%APPDATA%\NIMVORO\installed.json`.

### Language marker

`<tool folder>\.nimvoro.json` looks like `{ "id": "...", "version": "...", "repo": "...", "language": "uk" }`.
On the first install the launcher writes its current interface language (`en`, `ru` or `uk`) to `language`; on updates the existing value is kept.

A tool picks its starting language in this order:

1. `language` in the tool's own config;
2. `language` from the marker next to its exe;
3. `en`.

The result is saved to the tool's config. So changing the language in the launcher only affects tools installed afterwards.

### Theme

Every tool has a `theme` setting: `system`, `light` or `dark` (default `system`; System follows Windows). The launcher has the same setting. Use the suite palette: accent gradient `#4f6bff` to `#8a5bff`, Segoe UI.

### Shortcuts

- Start menu, always: `%APPDATA%\Microsoft\Windows\Start Menu\Programs\<Name>.lnk` (`<Name>` is the manifest `name`).
- Desktop, if the user ticked "Create a desktop shortcut"; the last choice is remembered in the launcher settings.
- The shortcut paths are stored in `installed.json`; uninstall removes them.
- On every start the launcher recreates a missing Start-menu shortcut for installed tools, so tools installed by older launchers get one too.

## 4. Update check inside the tool

Every tool has a "Check for updates on startup" switch in its settings (on by default).

1. On start, if the switch is on: `GET https://api.github.com/repos/<owner>/<repo>/releases/latest`, compare `tag_name` with its own version.
2. If a newer one exists, show a "Version X is available" banner with an "Update" button.
3. "Update": read `%APPDATA%\NIMVORO\launcher.json` (`{"path": "C:\\...\\NIMVORO.exe"}`, written by the launcher on every start).
   If the launcher is there, run `NIMVORO.exe --update <id>` and exit. Otherwise open the release page in the browser.

Ready implementations: `src/nimvoro.rs` in the Rust tools (copied as is), `src/updater.js` in Smart Switcher, `Updater.cs` in FPS Overlay.

On `--update <id>` the launcher downloads the new zip, closes the old process if needed, replaces the files and starts the tool again.

## 5. The `catalog.json` line

```json
{ "id": "random-wheel", "repo": "GrigoryyKach/random-wheel" }
```

The launcher loads a fresh `catalog.json` from `main` on every start; without a network it uses the copy baked into the build.
A tool that leaves the catalog (like `transluent`, now `sidekick`) simply disappears from the view; its record in `installed.json` is left alone.
