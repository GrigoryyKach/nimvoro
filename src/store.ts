// UI state. The backend is the source of truth: every action returns a fresh View.
import { setLang, setPlatform } from './i18n';
import { setRawBase, type LauncherUpdate, type Progress, type Settings, type Tool, type View } from './api';

export interface State {
  view: View | null;
  loading: boolean;
  /** Install progress by tool id. */
  progress: Record<string, Progress | undefined>;
  search: string;
  launcherUpdate: LauncherUpdate | null;
}

export const state: State = {
  view: null,
  loading: true,
  progress: {},
  search: '',
  launcherUpdate: null,
};

type Listener = () => void;
const listeners = new Set<Listener>();
const progressListeners = new Set<(id: string) => void>();

export function subscribe(fn: Listener): void {
  listeners.add(fn);
}

/** Progress changes often, so only the tool's button is redrawn. */
export function onProgress(fn: (id: string) => void): void {
  progressListeners.add(fn);
}

export function setView(v: View): void {
  state.view = v;
  setPlatform(v.platform);
  setRawBase(v.rawBase);
  setLang(v.settings.language); // before any subscriber re-renders
  emit();
}

export function patch(p: Partial<State>): void {
  Object.assign(state, p);
  emit();
}

export function setProgress(id: string, p: Progress | undefined): void {
  state.progress[id] = p;
  progressListeners.forEach(fn => fn(id));
}

export function emit(): void {
  listeners.forEach(fn => fn());
}

export function settings(): Settings | null {
  return state.view?.settings ?? null;
}

export function tool(id: string): Tool | undefined {
  return state.view?.tools.find(t => t.id === id);
}

/** Install percentage (0-100), or null when nothing is downloading. */
export function percent(p: Progress | undefined): number | null {
  if (!p) return null;
  if (p.stage === 'download') return p.total ? Math.min(99, Math.floor((p.received / p.total) * 100)) : 0;
  if (p.stage === 'verify' || p.stage === 'extract') return 99;
  return 100;
}
