import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import * as act from './actions';
import { api, type Settings, type Tool } from './api';
import { clear, h, svg } from './dom';
import { plural, toolName } from './format';
import { icons, logo } from './icons';
import { onProgress, patch, setView, state, subscribe } from './store';
import { card, refreshActions, row } from './ui/cards';
import { openDetails } from './ui/details';
import { applyLauncherUpdate, checkLauncherUpdate } from './ui/launcher-update';
import { openSettings } from './ui/settings';
import { toast } from './ui/toast';

const win = getCurrentWindow();
const app = document.getElementById('app')!;

// ───────────────────────── каркас окна ─────────────────────────

const titlebar = h(
  'header',
  { class: 'titlebar', 'data-tauri-drag-region': true },
  h('div', { class: 'brand', 'data-tauri-drag-region': true }, h('span', { class: 'brand-logo', html: logo }), h('span', { class: 'brand-name' }, 'NIMVORO')),
  h('div', { class: 'brand-sub mono', 'data-tauri-drag-region': true }, 'НАБОР УТИЛИТ'),
  h('div', { class: 'spacer', 'data-tauri-drag-region': true }),
  h('button', { class: 'tb-btn', title: 'Настройки', 'aria-label': 'Настройки', onclick: () => openSettings() }, svg(icons.gear)),
  h('button', { class: 'tb-btn', title: 'Свернуть', 'aria-label': 'Свернуть', onclick: () => win.minimize() }, svg(icons.minimize)),
  h('button', { class: 'tb-btn', title: 'Развернуть', 'aria-label': 'Развернуть', onclick: () => win.toggleMaximize() }, svg(icons.maximize)),
  h('button', { class: 'tb-btn close', title: 'Закрыть', 'aria-label': 'Закрыть', onclick: () => win.close() }, svg(icons.close)),
);

const search = h('input', { class: 'search-input', type: 'search', placeholder: 'Поиск инструментов', 'aria-label': 'Поиск инструментов' });
search.addEventListener('input', () => patch({ search: search.value }));

const sortSelect = h(
  'select',
  { class: 'select', 'aria-label': 'Сортировка' },
  h('option', { value: 'name' }, 'Имя (А–Я)'),
  h('option', { value: 'updated' }, 'Последнее обновление'),
  h('option', { value: 'size' }, 'Размер'),
);
sortSelect.addEventListener('change', () => saveSettings({ sort: sortSelect.value as Settings['sort'] }));

const refreshBtn = h('button', { class: 'icon-btn boxed', title: 'Проверить обновления', 'aria-label': 'Проверить обновления' }, svg(icons.refresh));
refreshBtn.addEventListener('click', async () => {
  refreshBtn.classList.add('spin');
  await act.reload(true);
  refreshBtn.classList.remove('spin');
  const n = act.updatable().length;
  toast(n ? `Доступно обновлений: ${n}` : 'Всё обновлено', n ? 'info' : 'ok');
});

const updateAllBtn = h('button', { class: 'btn primary small', onclick: () => act.updateAll() });
const viewGrid = h('button', { class: 'seg icon', title: 'Плитка', 'aria-label': 'Плитка', onclick: () => saveSettings({ view: 'grid' }) }, svg(icons.grid));
const viewList = h('button', { class: 'seg icon', title: 'Список', 'aria-label': 'Список', onclick: () => saveSettings({ view: 'list' }) }, svg(icons.list));

const toolbar = h(
  'div',
  { class: 'toolbar' },
  refreshBtn,
  updateAllBtn,
  h('div', { class: 'spacer' }),
  h('label', { class: 'mono caps-label' }, 'СОРТИРОВКА'),
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

// ───────────────────────── отрисовка ─────────────────────────

function applyTheme(theme: Settings['theme']): void {
  if (theme === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
}

function matches(t: Tool, q: string): boolean {
  if (!q) return true;
  const m = t.manifest;
  const hay = [toolName(t), m?.tagline, m?.description, m?.category, t.id, ...(m?.features ?? []).map(f => f.title)].join(' ').toLowerCase();
  return q.toLowerCase().split(/\s+/).every(w => hay.includes(w));
}

function sorted(list: Tool[], sort: Settings['sort']): Tool[] {
  const by = {
    name: (a: Tool, b: Tool) => toolName(a).localeCompare(toolName(b), 'ru'),
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
    h('h2', { class: 'mono section-title' }, 'ЗАГРУЗКА КАТАЛОГА…'),
    h('div', { class: 'grid' }, ...Array.from({ length: 6 }, () => h('div', { class: 'card skeleton' }))),
  );
}

function renderBanner(): void {
  clear(banner);
  const rel = state.launcherUpdate;
  if (!rel) return;
  const btn = h('button', { class: 'btn primary small' }, `Обновить до ${rel.version}`) as HTMLButtonElement;
  btn.addEventListener('click', () => applyLauncherUpdate(btn));
  banner.append(
    h('div', { class: 'banner' },
      svg(icons.sparkle),
      h('div', { class: 'banner-text' }, h('b', null, `Доступна новая версия NIMVORO ${rel.version}`), h('span', { class: 'muted' }, ` · у вас ${state.view?.launcherVersion}`)),
      h('button', { class: 'btn link', onclick: () => act.openUrl(rel.url) }, 'Что нового'),
      btn,
    ),
  );
}

function render(): void {
  const v = state.view;
  applyTheme(v?.settings.theme ?? 'system');
  renderBanner();
  if (!v) return;
  sortSelect.value = v.settings.sort;
  viewGrid.classList.toggle('active', v.settings.view === 'grid');
  viewList.classList.toggle('active', v.settings.view === 'list');

  const updates = v.tools.filter(t => t.updateAvailable).length;
  updateAllBtn.hidden = updates < 1;
  updateAllBtn.replaceChildren(svg(icons.download), updates === 1 ? 'Обновить' : `Обновить все · ${updates}`);

  clear(content);
  if (state.loading && !v.tools.length) {
    content.append(skeleton());
    return;
  }
  const list = sorted(v.tools.filter(t => matches(t, state.search)), v.settings.sort);
  const installed = list.filter(t => t.installed);
  const available = list.filter(t => !t.installed);
  const parts = [section('УСТАНОВЛЕНЫ', installed, v.settings.view), section('НЕ УСТАНОВЛЕНЫ', available, v.settings.view)].filter(Boolean) as HTMLElement[];
  if (!parts.length) {
    content.append(
      h('div', { class: 'empty' },
        h('div', { class: 'empty-title' }, state.search ? 'Ничего не найдено' : 'Каталог пуст'),
        h('div', { class: 'hint' }, state.search ? `По запросу «${state.search}» инструментов нет.` : 'Не удалось загрузить каталог. Проверьте подключение и нажмите «Обновить».'),
      ),
    );
    return;
  }
  content.append(...parts);
}

subscribe(render);
onProgress(id => refreshActions(id));

// ───────────────────────── запуск ─────────────────────────

/** Обновление по просьбе утилиты (`NIMVORO.exe --update <id>`): закрыть её, обновить и запустить снова. */
async function updateRequested(id: string): Promise<void> {
  await act.reload(true);
  const t = state.view?.tools.find(x => x.id === id);
  if (!t) return toast(`Инструмент ${id} не найден в каталоге`, 'error');
  if (!t.installed) return openDetails(id);
  if (!t.updateAvailable) return toast(`${toolName(t)}: установлена последняя версия`, 'ok');
  toast(`Обновляем ${toolName(t)} до ${t.release?.version}…`);
  await act.install(id, { closeRunning: true, launchAfter: true });
}

async function boot(): Promise<void> {
  setView(await api.getView());
  const s = state.view!.settings;
  const pending = await api.takePendingUpdate();
  // Без проверки обновлений берём каталог из кеша (если он есть), чтобы не ходить в сеть.
  try {
    setView(await api.loadCatalog(s.checkUpdatesOnStart || !!pending));
  } catch (e) {
    toast(String(e), 'error');
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
        ups.length === 1 ? `Доступно обновление ${toolName(ups[0])} ${ups[0].release?.version}` : `Доступны обновления: ${plural(ups.length, 'инструмент', 'инструмента', 'инструментов')}`,
        'info',
        { label: ups.length === 1 ? 'Обновить' : 'Обновить все', run: () => act.updateAll() },
      );
    }
  }
  if (s.checkLauncherUpdates) checkLauncherUpdate();
}

// Ctrl+F — к поиску, F5 — проверить обновления.
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
// Контекстное меню браузера в приложении не нужно (кроме полей ввода).
document.addEventListener('contextmenu', e => {
  if (!(e.target as HTMLElement).closest('input, textarea')) e.preventDefault();
});

render();
boot().catch(e => toast(String(e), 'error'));
