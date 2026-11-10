import type { Tool } from './api';

export function formatSize(bytes: number): string {
  if (!bytes) return '—';
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${mb >= 100 ? Math.round(mb) : mb.toFixed(1)} МБ`;
  return `${Math.max(1, Math.round(bytes / 1024))} КБ`;
}

export function formatDate(iso: string | number | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function toolName(t: Tool): string {
  return t.manifest?.name ?? t.id;
}

/** Версия для бейджа в шапке карточки: установленная или последняя. */
export function shownVersion(t: Tool): string | null {
  return t.installed?.version ?? t.release?.version ?? null;
}

export function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10, m100 = n % 100;
  const w = m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? few : many;
  return `${n} ${w}`;
}
