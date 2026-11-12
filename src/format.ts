import type { Feature, Tool } from './api';
import { getLang, locale, t } from './i18n';

export function formatSize(bytes: number): string {
  if (!bytes) return '—';
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) {
    const n = mb >= 100 ? Math.round(mb) : Math.round(mb * 10) / 10;
    return `${n.toLocaleString(locale(), { maximumFractionDigits: 1 })} ${t('unit.mb')}`;
  }
  return `${Math.max(1, Math.round(bytes / 1024)).toLocaleString(locale())} ${t('unit.kb')}`;
}

export function formatDate(iso: string | number | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(locale(), { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Manifest text fields in the current language: `manifest.i18n[lang]` over the English base fields. */
export interface LocalizedText {
  name: string;
  tagline: string;
  description: string;
  category: string | undefined;
  features: Feature[];
  requirements: string[];
}

export function loc(tool: Tool): LocalizedText {
  const m = tool.manifest;
  const lang = getLang();
  const o = lang === 'en' ? undefined : m?.i18n?.[lang];
  return {
    name: o?.name || m?.name || tool.id,
    tagline: o?.tagline || m?.tagline || '',
    description: o?.description || m?.description || '',
    category: o?.category || m?.category,
    features: o?.features?.length ? o.features : (m?.features ?? []),
    requirements: o?.requirements?.length ? o.requirements : (m?.requirements ?? []),
  };
}

export function toolName(tool: Tool): string {
  return loc(tool).name;
}

/** Version for the badge in the card header: installed or latest. */
export function shownVersion(tool: Tool): string | null {
  return tool.installed?.version ?? tool.release?.version ?? null;
}
