// Tool cards (grid and list) and the main action button.
import * as act from '../actions';
import { rawUrl, type Tool } from '../api';
import { h, svg } from '../dom';
import { formatDate, formatSize, loc, shownVersion, toolName } from '../format';
import { t as tr, translateCode } from '../i18n';
import { icons } from '../icons';
import { percent, state } from '../store';
import { openMenu, type MenuItem } from './menu';

/** Tool icon from its repository; until it loads (or without network) a gradient with a letter. */
export function toolIcon(t: Tool, size: number): HTMLElement {
  const box = h('div', { class: 'tool-icon', style: `width:${size}px;height:${size}px;border-radius:${Math.round(size * 0.24)}px` });
  const [a, b] = t.manifest?.accent ?? ['#4f6bff', '#8a5bff'];
  box.style.background = `linear-gradient(135deg, ${a}, ${b})`;
  box.append(h('span', { class: 'tool-icon-letter', style: `font-size:${Math.round(size * 0.46)}px` }, toolName(t).slice(0, 1).toUpperCase()));
  if (t.manifest?.icon) {
    const img = h('img', { src: rawUrl(t.repo, t.manifest.icon), alt: '', draggable: 'false' });
    img.addEventListener('load', () => box.classList.add('loaded'));
    img.addEventListener('error', () => img.remove());
    box.append(img);
  }
  return box;
}

export function statusBadge(t: Tool): HTMLElement {
  if (state.progress[t.id]) return h('span', { class: 'badge accent' }, tr(t.installed ? 'status.updating' : 'status.installing'));
  if (t.updateAvailable) return h('span', { class: 'badge accent' }, tr('status.updateTo', { v: t.release?.version ?? '' }));
  if (t.installed) return h('span', { class: 'badge ok' }, tr('status.installed'));
  if (t.error && !t.release?.assetUrl) return h('span', { class: 'badge warn', title: translateCode(t.error) }, tr('status.unavailable'));
  return h('span', { class: 'badge' }, tr('status.available'));
}

/** Install / Update / Open button with progress. Redraws itself as the install proceeds. */
export function actionButton(t: Tool, cls = ''): HTMLElement {
  const wrap = h('div', { class: `action ${cls}`, 'data-action-for': t.id });
  fillAction(wrap, t);
  return wrap;
}

function fillAction(wrap: HTMLElement, t: Tool): void {
  wrap.replaceChildren();
  const p = state.progress[t.id];
  const pct = percent(p);
  if (p && pct !== null) {
    const label = p.stage === 'download' ? `${pct}%` : p.stage === 'verify' ? tr('progress.verifying') : p.stage === 'extract' ? tr('progress.extracting') : tr('progress.done');
    wrap.append(
      h('div', { class: 'btn progress', role: 'progressbar', 'aria-valuenow': pct, 'aria-valuemin': 0, 'aria-valuemax': 100 },
        h('div', { class: 'progress-fill', style: `width:${pct}%` }),
        h('span', { class: 'progress-label' }, tr(t.installed ? 'progress.update' : 'progress.install', { s: label })),
      ),
    );
    return;
  }
  const stop = (fn: () => void) => (e: Event) => {
    e.stopPropagation();
    fn();
  };
  if (t.updateAvailable) {
    wrap.append(h('button', { class: 'btn primary', onclick: stop(() => act.install(t.id)) }, svg(icons.download), tr('btn.updateTo', { v: t.release?.version ?? '' })));
  } else if (t.installed) {
    wrap.append(h('button', { class: 'btn ghost strong', onclick: stop(() => act.launch(t.id)) }, svg(icons.play), tr('btn.open')));
  } else {
    const can = !!t.release?.assetUrl;
    wrap.append(
      h('button', { class: 'btn primary', disabled: !can, title: can ? undefined : translateCode(t.error) || tr('btn.noRelease'), onclick: stop(() => act.requestInstall(t.id)) },
        svg(icons.download), tr('btn.install')),
    );
  }
}

/** Updates the tool's buttons on screen when progress changes. */
export function refreshActions(id: string): void {
  const t = state.view?.tools.find(x => x.id === id);
  if (!t) return;
  document.querySelectorAll<HTMLElement>(`[data-action-for="${CSS.escape(id)}"]`).forEach(el => fillAction(el, t));
  document.querySelectorAll<HTMLElement>(`[data-status-for="${CSS.escape(id)}"]`).forEach(el => el.replaceChildren(statusBadge(t)));
}

export function menuItems(t: Tool, openDetails: () => void): MenuItem[] {
  const items: MenuItem[] = [{ label: tr('menu.details'), icon: icons.info, run: openDetails }];
  if (t.installed) {
    items.push({ label: tr('menu.openFolder'), icon: icons.folder, run: () => act.openFolder(t.id) });
    if (!t.updateAvailable && t.release?.assetUrl) items.push({ label: tr('menu.reinstall'), icon: icons.refresh, run: () => act.install(t.id) });
  }
  items.push({ label: tr('menu.github'), icon: icons.external, run: () => act.openUrl(`https://github.com/${t.repo}`) });
  if (t.release?.url) items.push({ label: tr('menu.changelog'), icon: icons.external, run: () => act.openUrl(t.release!.url) });
  if (t.installed) items.push({ label: tr('menu.uninstall'), icon: icons.trash, danger: true, run: () => act.uninstall(t.id) });
  return items;
}

function moreButton(t: Tool, openDetails: () => void): HTMLElement {
  const btn = h('button', { class: 'icon-btn boxed', 'aria-label': tr('menu.more'), title: tr('menu.more') }, svg(icons.more));
  btn.addEventListener('click', e => {
    e.stopPropagation();
    openMenu(btn, menuItems(t, openDetails));
  });
  return btn;
}

function folderButton(t: Tool): HTMLElement | null {
  if (!t.installed) return null;
  return h('button', {
    class: 'icon-btn boxed',
    'aria-label': tr('menu.openFolder'),
    title: tr('card.openFolderTitle', { p: t.installed.dir }),
    onclick: (e: Event) => {
      e.stopPropagation();
      act.openFolder(t.id);
    },
  }, svg(icons.folder));
}

function head(t: Tool): HTMLElement {
  const v = shownVersion(t);
  return h(
    'div',
    { class: 'card-head' },
    h('span', { class: `mono ver${t.updateAvailable ? ' accent' : ''}` }, v ? `V${v}` : '—'),
    h('button', {
      class: 'mono gh',
      title: `github.com/${t.repo}`,
      onclick: (e: Event) => {
        e.stopPropagation();
        act.openUrl(`https://github.com/${t.repo}`);
      },
    }, 'GITHUB', svg(icons.external, 'ico tiny')),
  );
}

export function card(t: Tool, openDetails: () => void): HTMLElement {
  const m = loc(t);
  const meta = t.installed
    ? h('div', { class: 'meta' }, tr('card.folder'), h('span', { class: 'path', title: t.installed.dir }, t.installed.dir))
    : h('div', { class: 'meta' }, tr('card.downloadSize', { s: formatSize(t.release?.assetSize ?? 0) }));
  const el = h(
    'article',
    { class: `card${t.installed ? ' installed' : ''}`, tabindex: '0', 'aria-label': toolName(t) },
    head(t),
    h(
      'div',
      { class: 'card-body' },
      h('div', { class: 'ident' }, toolIcon(t, 56), h('div', { class: 'ident-text' },
        h('div', { class: 'name' }, toolName(t)),
        h('div', { class: 'tagline', title: m.tagline }, m.tagline || translateCode(t.error)),
      )),
      h('div', { class: 'badges' }, h('span', { 'data-status-for': t.id }, statusBadge(t)), m.category && h('span', { class: 'badge mono' }, m.category)),
      meta,
      h('p', { class: 'desc' }, m.description),
      h('div', { class: 'updated' }, tr('card.lastUpdated', { d: formatDate(t.release?.publishedAt) })),
    ),
    h('div', { class: 'card-actions' }, actionButton(t), folderButton(t), moreButton(t, openDetails)),
  );
  el.addEventListener('click', openDetails);
  el.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target === el) openDetails();
  });
  return el;
}

export function row(t: Tool, openDetails: () => void): HTMLElement {
  const m = loc(t);
  const el = h(
    'article',
    { class: 'row-item', tabindex: '0', 'aria-label': toolName(t) },
    toolIcon(t, 40),
    h('div', { class: 'row-main' },
      h('div', { class: 'row-title' }, h('span', { class: 'name' }, toolName(t)), h('span', { class: 'mono ver' }, shownVersion(t) ? `V${shownVersion(t)}` : '')),
      h('div', { class: 'tagline' }, m.tagline || translateCode(t.error)),
    ),
    h('div', { class: 'row-status', 'data-status-for': t.id }, statusBadge(t)),
    h('div', { class: 'row-size mono' }, t.installed ? formatSize(t.installed.size) : formatSize(t.release?.assetSize ?? 0)),
    h('div', { class: 'card-actions' }, actionButton(t, 'compact'), folderButton(t), moreButton(t, openDetails)),
  );
  el.addEventListener('click', openDetails);
  el.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target === el) openDetails();
  });
  return el;
}
