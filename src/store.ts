// Состояние интерфейса. Источник истины — бэкенд: каждое действие возвращает свежий View.
import type { Progress, Release, Settings, Tool, View } from './api';

export interface State {
  view: View | null;
  loading: boolean;
  /** Ход установки по id инструмента. */
  progress: Record<string, Progress | undefined>;
  search: string;
  launcherUpdate: Release | null;
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

/** Прогресс меняется часто — перерисовывается только кнопка инструмента. */
export function onProgress(fn: (id: string) => void): void {
  progressListeners.add(fn);
}

export function setView(v: View): void {
  state.view = v;
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

/** Процент установки (0–100) или null, если сейчас не скачивается. */
export function percent(p: Progress | undefined): number | null {
  if (!p) return null;
  if (p.stage === 'download') return p.total ? Math.min(99, Math.floor((p.received / p.total) * 100)) : 0;
  if (p.stage === 'verify' || p.stage === 'extract') return 99;
  return 100;
}
