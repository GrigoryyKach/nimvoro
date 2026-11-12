// Tool popup: description, screenshot carousel, features, requirements, install folder and the action button.
import * as act from '../actions';
import { rawUrl, type Tool } from '../api';
import { h, svg } from '../dom';
import { formatDate, formatSize, loc, toolName } from '../format';
import { t as tr, translateCode } from '../i18n';
import { icons } from '../icons';
import { state, subscribe } from '../store';
import { actionButton, statusBadge, toolIcon } from './cards';
import { openModal } from './dialog';

let openId: string | null = null;
let rerender: (() => void) | null = null;

// When the state changes (installed, language switched) the popup redraws.
subscribe(() => rerender?.());

export function openDetails(id: string): void {
  const t0 = state.view?.tools.find(t => t.id === id);
  if (!t0) return;
  openId = id;
  const root = h('div', { class: 'details' });
  let slide = 0;
  const render = () => {
    const t = state.view?.tools.find(x => x.id === openId);
    if (!t) return;
    const scroll = root.querySelector('.details-body')?.scrollTop ?? 0;
    root.replaceChildren(header(t, () => m.close()), body(t, slide, i => (slide = i)), footer(t));
    const b = root.querySelector('.details-body');
    if (b) b.scrollTop = scroll;
  };
  rerender = render;
  const m = openModal(root, 'large', () => {
    openId = null;
    rerender = null;
  });
  render();
}

function header(t: Tool, close: () => void): HTMLElement {
  const m = loc(t);
  return h(
    'div',
    { class: 'details-head' },
    toolIcon(t, 64),
    h('div', { class: 'details-title' },
      h('div', { class: 'details-name' }, toolName(t)),
      h('div', { class: 'tagline' }, m.tagline),
      h('div', { class: 'badges' },
        h('span', { 'data-status-for': t.id }, statusBadge(t)),
        t.release && h('span', { class: 'badge mono' }, `V${t.release.version}`),
        m.category && h('span', { class: 'badge mono' }, m.category),
      ),
    ),
    h('button', { class: 'icon-btn', 'aria-label': tr('common.close'), onclick: close }, svg(icons.close)),
  );
}

function carousel(t: Tool, start: number, onSlide: (i: number) => void): HTMLElement {
  const shots = t.manifest?.screenshots ?? [];
  if (!shots.length) {
    return h('div', { class: 'carousel empty' }, toolIcon(t, 96), h('div', { class: 'hint' }, tr('details.noShots')));
  }
  let i = Math.min(start, shots.length - 1);
  const track = h('div', { class: 'carousel-track' },
    ...shots.map((s, k) => h('div', { class: 'slide' }, h('img', { src: rawUrl(t.repo, s), alt: tr('details.shotAlt', { name: toolName(t), n: k + 1 }), loading: 'lazy', draggable: 'false' }))),
  );
  const dots = h('div', { class: 'dots' }, ...shots.map((_, k) => h('button', { class: 'dot', 'aria-label': tr('details.shot', { n: k + 1 }), onclick: () => go(k) })));
  const counter = h('span', { class: 'mono counter' });
  const go = (k: number) => {
    i = (k + shots.length) % shots.length;
    onSlide(i);
    track.style.transform = `translateX(-${i * 100}%)`;
    dots.querySelectorAll('.dot').forEach((d, n) => d.classList.toggle('active', n === i));
    counter.textContent = `${i + 1} / ${shots.length}`;
  };
  const el = h(
    'div',
    { class: 'carousel', tabindex: '0', 'aria-roledescription': tr('details.carousel') },
    h('div', { class: 'carousel-viewport' }, track),
    shots.length > 1 && h('button', { class: 'nav prev', 'aria-label': tr('details.prev'), onclick: () => go(i - 1) }, svg(icons.arrowLeft)),
    shots.length > 1 && h('button', { class: 'nav next', 'aria-label': tr('details.next'), onclick: () => go(i + 1) }, svg(icons.arrowRight)),
    shots.length > 1 && h('div', { class: 'carousel-foot' }, dots, counter),
  );
  el.addEventListener('keydown', e => {
    if (e.key === 'ArrowLeft') go(i - 1);
    if (e.key === 'ArrowRight') go(i + 1);
  });
  // Horizontal wheel/touchpad scrolling flips slides.
  let wheelLock = false;
  el.addEventListener('wheel', e => {
    if (Math.abs(e.deltaX) < 20 || wheelLock) return;
    wheelLock = true;
    go(i + (e.deltaX > 0 ? 1 : -1));
    setTimeout(() => (wheelLock = false), 450);
  });
  requestAnimationFrame(() => go(i));
  return el;
}

function body(t: Tool, slide: number, onSlide: (i: number) => void): HTMLElement {
  const m = loc(t);
  return h(
    'div',
    { class: 'details-body' },
    carousel(t, slide, onSlide),
    t.error && h('div', { class: 'note warn' }, svg(icons.alert), translateCode(t.error)),
    h('p', { class: 'details-desc' }, m.description),
    m.features.length > 0 && h('h3', { class: 'caps' }, tr('details.features')),
    m.features.length > 0 &&
      h('div', { class: 'features' }, ...m.features.map(f => h('div', { class: 'feature' }, svg(icons.sparkle), h('div', null, h('div', { class: 'feature-title' }, f.title), h('div', { class: 'feature-text' }, f.text))))),
    m.requirements.length > 0 && h('h3', { class: 'caps' }, tr('details.requirements')),
    m.requirements.length > 0 && h('ul', { class: 'reqs' }, ...m.requirements.map(r => h('li', null, r))),
    h('h3', { class: 'caps' }, tr(t.installed ? 'details.installedIn' : 'details.willInstallIn')),
    h(
      'div',
      { class: 'path-row' },
      h('span', { class: 'path mono', title: t.targetDir }, t.targetDir),
      t.installed && h('button', { class: 'btn ghost small', onclick: () => act.openFolder(t.id) }, svg(icons.folder), tr('details.openFolder')),
    ),
  );
}

function footer(t: Tool): HTMLElement {
  const size = t.installed ? tr('details.onDisk', { s: formatSize(t.installed.size) }) : tr('details.downloadSize', { s: formatSize(t.release?.assetSize ?? 0) });
  return h(
    'div',
    { class: 'details-foot' },
    h('div', { class: 'foot-meta' },
      h('div', null, size),
      h('div', { class: 'muted' }, tr('details.updatedOn', { d: formatDate(t.release?.publishedAt) })),
    ),
    h('div', { class: 'foot-actions' },
      h('button', { class: 'btn ghost', onclick: () => act.openUrl(`https://github.com/${t.repo}`) }, 'GitHub', svg(icons.external, 'ico tiny')),
      t.installed && h('button', { class: 'btn ghost danger-text', onclick: () => act.uninstall(t.id) }, tr('details.uninstall')),
      t.updateAvailable && h('button', { class: 'btn ghost', onclick: () => act.launch(t.id) }, tr('btn.open')),
      actionButton(t, 'wide'),
    ),
  );
}
