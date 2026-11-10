// Типизированные вызовы бэкенда (src-tauri/src/lib.rs). Поля — camelCase, как отдаёт serde.
import { Channel, invoke } from '@tauri-apps/api/core';

export interface Feature {
  title: string;
  text: string;
}

/** nimvoro.json из репозитория инструмента (см. docs/ADDING_A_TOOL.md). */
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

/** Ошибка «программа запущена» — бэкенд отдаёт её строкой с этим префиксом. */
export const RUNNING_PREFIX = 'RUNNING:';

function channel(onProgress: (p: Progress) => void): Channel<Progress> {
  const ch = new Channel<Progress>();
  ch.onmessage = onProgress;
  return ch;
}

export const api = {
  getView: () => invoke<View>('get_view'),
  loadCatalog: (refresh: boolean) => invoke<View>('load_catalog', { refresh }),
  install: (id: string, closeRunning: boolean, onProgress: (p: Progress) => void) =>
    invoke<View>('install_tool', { id, closeRunning, onProgress: channel(onProgress) }),
  uninstall: (id: string, closeRunning: boolean) => invoke<View>('uninstall_tool', { id, closeRunning }),
  launch: (id: string) => invoke<void>('launch_tool', { id }),
  openToolDir: (id: string) => invoke<void>('open_tool_dir', { id }),
  openPath: (path: string) => invoke<void>('open_path', { path }),
  openUrl: (url: string) => invoke<void>('open_url', { url }),
  saveSettings: (settings: Settings) => invoke<View>('save_settings', { settings }),
  setToolDir: (id: string, dir: string | null) => invoke<View>('set_tool_dir', { id, dir }),
  takePendingUpdate: () => invoke<string | null>('take_pending_update'),
  launcherUpdateCheck: () => invoke<Release | null>('launcher_update_check'),
  launcherUpdateApply: (onProgress: (p: Progress) => void) =>
    invoke<void>('launcher_update_apply', { onProgress: channel(onProgress) }),
};

export function rawUrl(repo: string, path: string): string {
  return `https://raw.githubusercontent.com/${repo}/main/${path.replace(/^\/+/, '')}`;
}
