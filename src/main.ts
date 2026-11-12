import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import * as act from './actions';
import { api, type Settings, type Tool } from './api';
import { clear, h, svg } from './dom';
import { loc, toolName } from './format';
import { errorText, getLang, t as tr, tn } from './i18n';
import { icons, logo } from './icons';
import { onProgress, patch, setView, state, subscribe } from './store';
import { card, refreshActions, row } from './ui/cards';
import { openDetails } from './ui/details';
import { applyLauncherUpdate, checkLauncherUpdate } from './ui/launcher-update';
import { openSettings } from './ui/settings';
import { toast } from './ui/toast';

const win = getCurrentWindow();
const app = document.getElementById('app')!;

// ───────────────────────── window frame ─────────────────────────

const brandSub = h('div', { class: 'brand-sub mono', 'data-tauri-drag-region': true });
const btnSettings = h('button', { class: 'tb-btn', onclick: () => openSettings() }, svg(icons.gear));
const btnMin = h('button', { class: 'tb-btn', onclick: () => win.minimize() }, svg(icons.minimize));
const btnMax = h('button', { class: 'tb-btn', onclick: () => win.toggleMaximize() }, svg(icons.maximize));
const btnClose = h('button', { class: 'tb-btn close', onclick: () => win.close() }, svg(icons.close));

const titlebar = h(
  'header',
  { class: 'titlebar', 'data-tauri-drag-region': true },
  h('div', { class: 'brand', 'data-tauri-drag-region': true }, h('span', { class: 'brand-logo', html: logo }), h('span', { class: 'brand-name' }, 'NIMVORO')),
  brandSub,
  h('div', { class: 'spacer', 'data-tauri-drag-region': true }),
  btnSettings,
  btnMin,
  btnMax,
  btnClose,
);

const search = h('input', { class: 'search-input', type: 'search' });
search.addEventListener('input', () => patch({ search: search.value }));

const sortSelect = h(
  'select',
  { class: 'select' },
  h('option', { value: 'name' }),
  h('option', { value: 'updated' }),
  h('option', { value: 'size' }),
);
sortSelect.addEventListener('change', () => saveSettings({ sort: sortSelect.value as Settings['sort'] }));

const refreshBtn = h('button', { class: 'icon-btn boxed' }, svg(icons.refresh));
refreshBtn.addEventListener('click', async () => {
  refreshBtn.classList.add('spin');
  await act.reload(true);
  refreshBtn.classList.remove('spin');
  const n = act.updatable().length;
  toast(n ? tn('toast.updatesAvailable', n) : tr('toast.upToDate'), n ? 'info' : 'ok');
});

const updateAllBtn = h('button', { class: 'btn primary small', onclick: () => act.updateAll() });
const viewGrid = h('button', { class: 'seg icon', onclick: () => saveSettings({ view: 'grid' }) }, svg(icons.grid));
const viewList = h('button', { class: 'seg icon', onclick: () => saveSettings({ view: 'list' }) }, svg(icons.list));

const sortLabel = h('label', { class: 'mono caps-label' });

const toolbar = h(
  'div',
  { class: 'toolbar' },
  refreshBtn,
  updateAllBtn,
  h('div', { class: 'spacer' }),
  sortLabel,
  sortSelect,
  h('div', { class: 'search' }, svg(icons.search), search),
  h('div', { class: 'segmented' }, viewGrid, viewList),
);

const banner = h('div', { class: 'banner-host' });
const content = h('main', { class: 'content' });
app.append(titlebar, toolbar, h('div', { class: 'scroll' }, banner, content));

async function saveSettings(p: Partial<Settings>): Promise<void> {
  const s = state.view?.settings;
  if (!s) return;
  setView(await api.saveSettings({ ...s, ...p }));
}

/** Static labels of the frame; redone on every render so a language switch applies at once. */
function applyStaticText(): void {
  const label = (el: HTMLElement, text: string) => {
    el.title = text;
    el.setAttribute('aria-label', text);
  };
  brandSub.textContent = tr('app.subtitle');
  label(btnSettings, tr('tb.settings'));
  label(btnMin, tr('tb.minimize'));
  label(btnMax, tr('tb.maximize'));
  label(btnClose, tr('tb.close'));
  search.placeholder = tr('search.placeholder');
  search.setAttribute('aria-label', tr('search.placeholder'));
  sortLabel.textContent = tr('sort.label');
  sortSelect.setAttribute('aria-label', tr('sort.label'));
  (['name', 'updated', 'size'] as const).forEach((k, i) => (sortSelect.options[i].textContent = tr(`sort.${k}`)));
  label(refreshBtn, tr('toolbar.refresh'));
  label(viewGrid, tr('view.grid'));
  label(viewList, tr('view.list'));
}

// ───────────────────────── rendering ─────────────────────────

function applyTheme(theme: Settings['theme']): void {
  if (theme === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
}

function matches(t: Tool, q: string): boolean {
  if (!q) return true;
  const l = loc(t);
  const hay = [l.name, l.tagline, l.description, l.category, t.id, ...l.features.map(f => f.title)].join(' ').toLowerCase();
  return q.toLowerCase().split(/\s+/).every(w => hay.includes(w));
}

function sorted(list: Tool[], sort: Settings['sort']): Tool[] {
  const by = {
    name: (a: Tool, b: Tool) => toolName(a).localeCompare(toolName(b), getLang()),
    updated: (a: Tool, b: Tool) => (b.release?.publishedAt ?? '').localeCompare(a.release?.publishedAt ?? ''),
    size: (a: Tool, b: Tool) => (b.release?.assetSize ?? 0) - (a.release?.assetSize ?? 0),
  }[sort];
  return [...list].sort(by);
}

function section(title: string, tools: Tool[], view: Settings['view']): HTMLElement | null {
  if (!tools.length) return null;
  const items = tools.map(t => (view === 'grid' ? card(t, () => openDetails(t.id)) : row(t, () => openDetails(t.id))));
  return h('section', { class: 'section' },
    h('h2', { class: 'mono section-title' }, `${title} · ${tools.length}`),
    h('div', { class: view === 'grid' ? 'grid' : 'list' }, ...items),
  );
}

function skeleton(): HTMLElement {
  return h('section', { class: 'section' },
    h('h2', { class: 'mono section-title' }, tr('section.loading')),
    h('div', { class: 'grid' }, ...Array.from({ length: 6 }, () => h('div', { class: 'card skeleton' }))),
  );
}

function renderBanner(): void {
  clear(banner);
  const rel = state.launcherUpdate;
  if (!rel) return;
  const btn = h('button', { class: 'btn primary small' }, tr('banner.updateTo', { v: rel.version })) as HTMLButtonElement;
  btn.addEventListener('click', () => applyLauncherUpdate(btn));
  banner.append(
    h('div', { class: 'banner' },
      svg(icons.sparkle),
      h('div', { class: 'banner-text' }, h('b', null, tr('banner.new', { v: rel.version })), h('span', { class: 'muted' }, tr('banner.current', { v: state.view?.launcherVersion ?? '' }))),
      h('button', { class: 'btn link', onclick: () => act.openUrl(rel.url) }, tr('banner.whatsNew')),
      btn,
    ),
  );
}

function render(): void {
  const v = state.view;
  applyTheme(v?.settings.theme ?? 'system');
  applyStaticText();
  renderBanner();
  if (!v) return;
  sortSelect.value = v.settings.sort;
  viewGrid.classList.toggle('active', v.settings.view === 'grid');
  viewList.classList.toggle('active', v.settings.view === 'list');

  const updates = v.tools.filter(t => t.updateAvailable).length;
  updateAllBtn.hidden = updates < 1;
  updateAllBtn.replaceChildren(svg(icons.download), updates === 1 ? tr('update.one') : tr('update.all', { n: updates }));

  clear(content);
  if (state.loading && !v.tools.length) {
    content.append(skeleton());
    return;
  }
  const list = sorted(v.tools.filter(t => matches(t, state.search)), v.settings.sort);
  const installed = list.filter(t => t.installed);
  const available = list.filter(t => !t.installed);
  const parts = [section(tr('section.installed'), installed, v.settings.view), section(tr('section.available'), available, v.settings.view)].filter(Boolean) as HTMLElement[];
  if (!parts.length) {
    content.append(
      h('div', { class: 'empty' },
        h('div', { class: 'empty-title' }, state.search ? tr('empty.noResults') : tr('empty.catalog')),
        h('div', { class: 'hint' }, state.search ? tr('empty.noResults.hint', { q: state.search }) : tr('empty.catalog.hint')),
      ),
    );
    return;
  }
  content.append(...parts);
}

subscribe(render);
onProgress(id => refreshActions(id));

// ───────────────────────── startup ─────────────────────────

/** Update requested by a tool (`NIMVORO.exe --update <id>`): close it, update and start it again. */
async function updateRequested(id: string): Promise<void> {
  await act.reload(true);
  const t = state.view?.tools.find(x => x.id === id);
  if (!t) return toast(tr('toast.toolNotFound', { id }), 'error');
  if (!t.installed) return openDetails(id);
  if (!t.updateAvailable) return toast(tr('toast.latestInstalled', { name: toolName(t) }), 'ok');
  toast(tr('toast.updating', { name: toolName(t), v: t.release?.version ?? '' }));
  await act.install(id, { closeRunning: true, launchAfter: true });
}

async function boot(): Promise<void> {
  setView(await api.getView());
  const s = state.view!.settings;
  const pending = await api.takePendingUpdate();
  // Without an update check the catalog comes from the cache (if any), so no network is used.
  try {
    setView(await api.loadCatalog(s.checkUpdatesOnStart || !!pending));
  } catch (e) {
    toast(errorText(e), 'error');
  }
  patch({ loading: false });

  await listen<string>('update-request', e => updateRequested(e.payload));
  if (pending) {
    await updateRequested(pending);
  } else if (s.checkUpdatesOnStart) {
    const ups = act.updatable();
    if (ups.length && s.autoInstallUpdates) {
      await act.updateAll();
    } else if (ups.length) {
      toast(
        ups.length === 1 ? tr('toast.updateAvailableOne', { name: toolName(ups[0]), v: ups[0].release?.version ?? '' }) : tn('toast.updatesAvailableMany', ups.length),
        'info',
        { label: tr(ups.length === 1 ? 'toast.updateOne' : 'toast.updateMany'), run: () => act.updateAll() },
      );
    }
  }
  if (s.checkLauncherUpdates) checkLauncherUpdate();
}

// Ctrl+F focuses search, F5 checks for updates.
document.addEventListener('keydown', e => {
  if (e.ctrlKey && e.key.toLowerCase() === 'f') {
    e.preventDefault();
    search.focus();
    search.select();
  }
  if (e.key === 'F5') {
    e.preventDefault();
    refreshBtn.click();
  }
});
// No browser context menu in the app (except in input fields).
document.addEventListener('contextmenu', e => {
  if (!(e.target as HTMLElement).closest('input, textarea')) e.preventDefault();
});

render();
boot().catch(e => toast(errorText(e), 'error'));
