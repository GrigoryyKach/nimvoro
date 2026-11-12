// Typed backend calls (src-tauri/src/lib.rs). Fields are camelCase, as serde returns them.
import { Channel, invoke } from '@tauri-apps/api/core';

export interface Feature {
  title: string;
  text: string;
}

/** Translatable manifest fields (`manifest.i18n.<lang>`). */
export interface ManifestText {
  name?: string;
  tagline?: string;
  description?: string;
  category?: string;
  features?: Feature[];
  requirements?: string[];
}

/** nimvoro.json from the tool's repository (see docs/ADDING_A_TOOL.md). */
export interface Manifest {
  schema: number;
  id: string;
  name: string;
  tagline: string;
  description: string;
  features?: Feature[];
  category?: string;
  accent?: [string, string];
  icon: string;
  screenshots?: string[];
  exe: string;
  asset: string;
  requirements?: string[];
  settingsDir?: string;
  i18n?: Partial<Record<'ru' | 'uk', ManifestText>>;
}

export interface Release {
  tag: string;
  version: string;
  publishedAt: string;
  url: string;
  assetName: string | null;
  assetUrl: string | null;
  assetSize: number;
  digest: string | null;
}

export interface Installed {
  version: string;
  dir: string;
  exe: string;
  installedAt: number;
  files: string[];
  size: number;
  shortcuts: string[];
}

export interface Tool {
  id: string;
  repo: string;
  manifest: Manifest | null;
  release: Release | null;
  error: string | null;
  installed: Installed | null;
  targetDir: string;
  updateAvailable: boolean;
  busy: boolean;
}

export interface Settings {
  installRoot: string;
  toolDirs: Record<string, string>;
  checkUpdatesOnStart: boolean;
  autoInstallUpdates: boolean;
  checkLauncherUpdates: boolean;
  theme: 'system' | 'light' | 'dark';
  language: 'en' | 'ru' | 'uk';
  desktopShortcut: boolean;
  view: 'grid' | 'list';
  sort: 'name' | 'updated' | 'size';
}

export interface View {
  tools: Tool[];
  settings: Settings;
  launcherVersion: string;
  dataDir: string;
}

export type Progress =
  | { stage: 'download'; received: number; total: number }
  | { stage: 'verify' }
  | { stage: 'extract' }
  | { stage: 'done'; version: string };

/** "Program is running" error: the backend returns it as a string with this prefix. */
export const RUNNING_PREFIX = 'RUNNING:';

function channel(onProgress: (p: Progress) => void): Channel<Progress> {
  const ch = new Channel<Progress>();
  ch.onmessage = onProgress;
  return ch;
}

export const api = {
  getView: () => invoke<View>('get_view'),
  loadCatalog: (refresh: boolean) => invoke<View>('load_catalog', { refresh }),
  /** `dest` and `desktopShortcut` come from the install dialog (first install only). */
  install: (id: string, closeRunning: boolean, onProgress: (p: Progress) => void, dest?: string, desktopShortcut?: boolean) =>
    invoke<View>('install_tool', { id, closeRunning, dest: dest ?? null, desktopShortcut: desktopShortcut ?? null, onProgress: channel(onProgress) }),
  uninstall: (id: string, closeRunning: boolean) => invoke<View>('uninstall_tool', { id, closeRunning }),
  launch: (id: string) => invoke<void>('launch_tool', { id }),
  openToolDir: (id: string) => invoke<void>('open_tool_dir', { id }),
  openPath: (path: string) => invoke<void>('open_path', { path }),
  openUrl: (url: string) => invoke<void>('open_url', { url }),
  saveSettings: (settings: Settings) => invoke<View>('save_settings', { settings }),
  takePendingUpdate: () => invoke<string | null>('take_pending_update'),
  launcherUpdateCheck: () => invoke<Release | null>('launcher_update_check'),
  launcherUpdateApply: (onProgress: (p: Progress) => void) =>
    invoke<void>('launcher_update_apply', { onProgress: channel(onProgress) }),
};

export function rawUrl(repo: string, path: string): string {
  return `https://raw.githubusercontent.com/${repo}/main/${path.replace(/^\/+/, '')}`;
}
