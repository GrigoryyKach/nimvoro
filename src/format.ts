import type { Feature, Tool } from './api';
import { getLang, isLinux, locale, t } from './i18n';

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

/** Manifests may give requirements as one string or as a list. */
function asList(v: string | string[] | undefined): string[] {
  if (Array.isArray(v)) return v.filter(x => typeof x === 'string' && x.trim());
  return typeof v === 'string' && v.trim() ? [v] : [];
}

/**
 * Requirements for this platform. On Linux: `i18n.<lang>.linux.requirements`, then `linux.requirements`, then the
 * translated and base top-level ones. On Windows: the translated and base top-level ones.
 */
function requirementsFor(tool: Tool): string[] {
  const m = tool.manifest;
  const lang = getLang();
  const o = lang === 'en' ? undefined : m?.i18n?.[lang];
  const chain = [o?.requirements, m?.requirements];
  if (isLinux()) chain.unshift(o?.linux?.requirements, m?.linux?.requirements);
  for (const c of chain) {
    const list = asList(c);
    if (list.length) return list;
  }
  return [];
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
    requirements: requirementsFor(tool),
  };
}

export function toolName(tool: Tool): string {
  return loc(tool).name;
}

/** Version for the badge in the card header: installed or latest. */
export function shownVersion(tool: Tool): string | null {
  return tool.installed?.version ?? tool.release?.version ?? null;
}
