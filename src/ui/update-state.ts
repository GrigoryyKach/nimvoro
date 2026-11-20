// State machine of the launcher self-update overlay. Pure logic, no DOM: tests/update-state.test.ts runs it with node.

export type UpdatePhase = 'downloading' | 'installing' | 'restarting' | 'error';

export interface UpdateState {
  phase: UpdatePhase;
  received: number;
  total: number;
  /** Error text (already translated), only in the `error` phase. */
  error: string | null;
}

/** What the backend reports through the progress channel (same shape as `Progress` in api.ts). */
export type UpdateEvent =
  | { stage: 'download'; received: number; total: number }
  | { stage: 'verify' }
  | { stage: 'extract' }
  | { stage: 'done' };

export function initialState(): UpdateState {
  return { phase: 'downloading', received: 0, total: 0, error: null };
}

/** Next state for a backend event. After an error or a restart nothing moves it except `fail` / `initialState`. */
export function reduce(s: UpdateState, e: UpdateEvent): UpdateState {
  if (s.phase === 'error' || s.phase === 'restarting') return s;
  switch (e.stage) {
    case 'download':
      // Never go backwards: a late event after the installer started must not show the bar again.
      return s.phase === 'downloading' ? { ...s, received: e.received, total: e.total || s.total } : s;
    case 'verify':
    case 'extract':
      return { ...s, phase: 'installing' };
    case 'done':
      return { ...s, phase: 'restarting' };
  }
}

export function fail(s: UpdateState, message: string): UpdateState {
  return { ...s, phase: 'error', error: message };
}

/** Progress bar fill, 0..1. Unknown total: 0 while downloading (the bar then shows no fill), full once installing. */
export function fraction(s: UpdateState): number {
  if (s.phase === 'installing' || s.phase === 'restarting') return 1;
  if (s.phase === 'error' || s.total <= 0) return 0;
  return Math.min(1, Math.max(0, s.received / s.total));
}

/** `12.3 / 40.1`: megabytes with one decimal, or just the received part while the total is unknown. */
export function sizeText(received: number, total: number): string {
  const mb = (n: number) => (n / 1048576).toFixed(1);
  return total > 0 ? `${mb(received)} / ${mb(total)}` : mb(received);
}
